// Page controller

import manager from "./sqlite/manager.js";
import storage from "./storage.js";

import { actionButton } from "./components/action-button.js";
import { ActionController } from "./controllers/actions.js";
import { ShortcutController } from "./controllers/shortcuts.js";
import { DatabasePath } from "./db-path.js";
import { DEFAULT_NAME, MESSAGES } from "./sqlite/db.js";

import { titleFor } from "./lab/brand.js";
import {
    BAD_LINK_MESSAGE,
    OPEN_URL_DEFAULT,
    OPEN_URL_PROMPT,
    RESTORED_MESSAGE,
    SHARED_MESSAGE,
} from "./lab/config.js";
import { createCopyLinkAction } from "./lab/copy-link.js";
import { escapeHtml } from "./lab/html.js";
import { resolveRoute } from "./lab/router.js";
import { tableContentSql, tableInfoSql } from "./lab/sql.js";

const ui = {
    buttons: {
        reset: document.querySelector("#reset"),
        execute: document.querySelector("#execute"),
        showTables: document.querySelector("#show-tables"),
    },
    name: document.querySelector("#db-name"),
    toolbar: document.querySelector("#toolbar"),
    commandbar: document.querySelector("#commandbar"),
    editor: document.querySelector("#editor"),
    status: document.querySelector("#status"),
    result: document.querySelector("#result"),
};

const actions = {
    executeCurrent: executeCurrent,
    loadDemo: loadDemo,
    copyLink: createCopyLinkAction(ui),
    showTables: showTables,
    showTable: showTable,
    visit: visit,
};

const shortcuts = {
    o: () => {
        ui.toolbar.btnOpenFile.click();
    },
    u: openUrl,
    "/": showTables,
};

const DEMO_URL = "#demo.db";

let database;

// for testing purposes
window.app = {
    actions: actions,
    ui: ui,
};

// startFromCurrentUrl loads existing database or creates a new one
// as the current window location says (js/lab/router.js): a database path, or a share
// link, which gives an empty database with the shared SQL in the editor.
async function startFromCurrentUrl() {
    const route = resolveRoute(window.location);
    const path = new DatabasePath(route.database);
    const name = path.extractName();
    const success = await start(name, path, route.sql);
    if (!success) {
        return;
    }
    showStarted(route.sql !== null);
    if (route.damaged) {
        ui.status.error(escapeHtml(BAD_LINK_MESSAGE));
        enableCommandBar();
    }
}

// startFromUrl loads existing database
// from specified url
async function startFromUrl(url) {
    const path = new DatabasePath(url);
    const name = path.extractName();
    const success = await start(name, path);
    if (!success) {
        return;
    }
    history.pushState(database.name, null, `#${database.path.value}`);
    showStarted();
}

// startFromFile loads existing database
// from binary or sql file
async function startFromFile(file, contents, fileType) {
    const path = new DatabasePath(contents, fileType);
    const name = file.name;
    const success = await start(name, path);
    if (!success) {
        return;
    }
    history.pushState(database.name, null, "./");
    showStarted();
}

// start loads existing database or creates a new one
// using specified database path.
// sharedSql (from a share link) wins over the SQL saved in storage.
async function start(name, path, sharedSql = null) {
    ui.result.clear();
    ui.status.info(MESSAGES.loading);

    // The path and the exception text come from the URL, a file or the engine, so they
    // are escaped before they reach the status area (which renders HTML).
    try {
        // An unsupported address (for example #scheme:id) is refused here. manager.init
        // would otherwise fall through to creating an empty database.
        const loadedDatabase =
            path.type == "unsupported" ? null : await manager.init(name, path);
        console.debug(loadedDatabase);
        if (!loadedDatabase) {
            ui.status.error(`Failed to load database from ${escapeHtml(path)}`);
            return false;
        }
        database = loadedDatabase;
    } catch (exc) {
        ui.status.error(`Failed to load database from ${escapeHtml(path)}: ${escapeHtml(exc)}`);
        return false;
    }

    database.query = sharedSql ?? (database.query || storage.get(database.name));

    document.title = titleFor(database.meaningfulName);
    ui.name.ready(database.name);
    ui.status.info(MESSAGES.invite);
    ui.editor.value = database.query;
    ui.editor.focus();

    return true;
}

// executeCurrent runs the current SQL query
function executeCurrent() {
    return execute(ui.editor.query);
}

// execute runs SQL query on the database
// and shows results
// persist=false keeps the SQL out of storage (used for the built-in preview).
function execute(sql, persist = true) {
    if (!database) {
        showError("No database is loaded.");
        return Promise.reject();
    }
    sql = sql.trim();
    if (persist) {
        storage.set(database.name, sql);
    }
    if (!sql) {
        ui.status.info(MESSAGES.invite);
        ui.result.clear();
        return Promise.resolve();
    }
    try {
        ui.status.fadeOut();
        ui.status.info(MESSAGES.executing);
        const started = performance.now();
        const result = database.execute(sql);
        const elapsed = Math.round(performance.now() - started);
        showResult(result, elapsed);
        return Promise.resolve();
    } catch (exc) {
        showError(exc);
        return Promise.reject(exc);
    } finally {
        ui.status.fadeIn();
    }
}

// openUrl loads database from local or remote url
function openUrl() {
    const url = prompt(OPEN_URL_PROMPT, OPEN_URL_DEFAULT);
    if (!url) {
        return;
    }
    startFromUrl(url);
}

// changeName changes database name
function changeName(name) {
    if (name == ui.name.value && name == database.name) {
        return;
    }
    // Move what is *saved* under the old name. database.query is not that: it can be the
    // preview, or SQL from a share link that has not been run, and neither is the
    // student's work (js/lab/share.js: shared SQL reaches storage only through a Run).
    const saved = storage.get(database.name);
    storage.remove(database.name);
    database.name = name;
    if (saved) {
        storage.set(name, saved);
    }
    ui.name.value = name;
    document.title = titleFor(name);
}

// showStarted shows the result of successful database load
function showStarted(shared = false) {
    if (database.query) {
        // SQL restored from storage or from a share link goes in the editor (start()
        // put it there) but is never run: a runaway query saved by an earlier session,
        // or sent in a link, would hang the tab.
        ui.status.info(shared ? SHARED_MESSAGE : RESTORED_MESSAGE);
        enableCommandBar();
    } else if (database.tables.length) {
        showTableContent(database.tables[0]);
        enableCommandBar();
    } else {
        showWelcome();
    }
}

// showTables shows all database tables
function showTables() {
    const tables = database.gatherTables();
    if (!tables.length) {
        ui.status.info("Database is empty");
        return Promise.reject();
    }
    ui.status.info(`${tables.length} tables:`);
    ui.result.printTables(tables);
    return Promise.resolve();
}

// showTable shows specific database table
function showTable(table) {
    const result = database.execute(tableInfoSql(table));
    const all = actionButton("showTables", "tables");
    ui.status.info(`${all} / ${escapeHtml(table)}:`);
    ui.result.print(result);
    return Promise.resolve();
}

// showTableContent select data from specified table
function showTableContent(table) {
    const query = tableContentSql(table);
    ui.editor.value = query;
    // the preview is not the student's work, so it is not saved as their last query
    execute(query, false).catch(ignoreRejection);
}

// loadDemo loads demo database
function loadDemo() {
    window.location.assign(DEMO_URL);
    return Promise.resolve();
}

// showWelcome show the welcome message
function showWelcome() {
    const demo = actionButton("loadDemo", "demo database");
    let message = `<p>${MESSAGES.invite}<br>or load the ${demo}.</p>`;
    message += `<p>Click the logo anytime to start from scratch.</p>`;
    const functions = `<a href="https://sqlite.org/lang_corefunc.html" class="sqlime-link" target="_blank" rel="noopener noreferrer">Functions</a>`;
    const about = actionButton("visit", "About", "about");
    message += `<p>${functions} • ${about}</p>`;
    ui.status.info(message);
}

// showResult shows results and timing
// of the SQL query execution
function showResult(result, elapsed) {
    if (result && result.values.length) {
        ui.status.success(`${result.values.length} rows, took ${elapsed} ms`);
        ui.result.print(result);
    } else {
        ui.status.success(`0 rows, took ${elapsed} ms`);
        ui.result.print("");
    }
}

// showError shows an error occured
// during SQL query execution
function showError(exc) {
    // SQLite error messages echo the user's own text (a table name, for example)
    const err = String(exc).split("\n")[0];
    ui.result.clear();
    ui.status.error(escapeHtml(err));
}

// ignoreRejection swallows the rejection of execute(): the error has already been
// shown in the status area, so there is nothing left to report.
function ignoreRejection() {}

// enableCommandBar enables all buttons
// in the command bar
function enableCommandBar() {
    ui.commandbar.classList.remove("sqlime-disabled");
}

function visit(page) {
    window.location.assign(`${page}.html`);
    return Promise.resolve();
}

// User changed database name
ui.name.addEventListener("change", (event) => {
    changeName(event.target.value);
});

// Toolbar 'open file' button click
ui.toolbar.addEventListener("open-file", (event) => {
    const file = event.detail;
    const reader = new FileReader();
    const fileType = file.name.endsWith(".sql") ? "sql" : "binary";
    reader.onload = function () {
        // forget the chosen file, so choosing the same file again fires a new change event
        ui.toolbar.file.value = "";
        startFromFile(file, reader.result, fileType);
    };
    if (fileType == "sql") {
        reader.readAsText(file);
    } else {
        reader.readAsArrayBuffer(file);
    }
});

// Toolbar 'open url' button click
ui.toolbar.addEventListener("open-url", () => {
    openUrl();
});

// Toolbar 'reset' button click
ui.buttons.reset.addEventListener("click", () => {
    storage.remove(DEFAULT_NAME);
});

// Navigate back to previous database
window.addEventListener("popstate", () => {
    startFromCurrentUrl();
});

// SQL editor 'execute' event
ui.editor.addEventListener("execute", (event) => {
    execute(event.detail).catch(ignoreRejection);
});

// SQL editor 'started typing' event
ui.editor.addEventListener("start", (event) => {
    enableCommandBar();
});

// Handle user actions
new ActionController(actions).listen(ui.commandbar, ui.status, ui.result);
new ShortcutController(shortcuts).listen(document);

startFromCurrentUrl();
