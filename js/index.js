// Page controller

import manager from "./sqlite/manager.js";
import storage from "./storage.js";

import { actionButton } from "./components/action-button.js";
import { ActionController } from "./controllers/actions.js";
import { ShortcutController } from "./controllers/shortcuts.js";
import { DatabasePath } from "./db-path.js";
import { MESSAGES } from "./sqlite/db.js";

import { titleFor } from "./lab/brand.js";
import { caretToEnd } from "./lab/caret.js";
import {
    BAD_LINK_MESSAGE,
    DATASET_PARAM,
    LOADING_BUSY_MESSAGE,
    NO_DATABASE_MESSAGE,
    OPEN_URL_DEFAULT,
    OPEN_URL_PROMPT,
    RESTORED_MESSAGE,
    SET_PARAM,
    SHARED_MESSAGE,
    datasetSwitchFailedMessage,
    datasetUnavailableMessage,
} from "./lab/config.js";
import { createCopyLinkAction } from "./lab/copy-link.js";
import {
    clearPristine,
    datasetFileName,
    fetchDataset,
    getPristineId,
    keepPristine,
} from "./lab/datasets.js";
import { mountDatabaseSwitcher } from "./lab/database-switcher.js";
import { mountEditorSchema } from "./lab/editor-schema.js";
import { mountExercises } from "./lab/exercise-panel.js";
import { createExportAction, exportProblem } from "./lab/export.js";
import { mountExportDialog } from "./lab/export-dialog.js";
import { mountExportMenu } from "./lab/export-menu.js";
import { mountEvidence } from "./lab/evidence-dialog.js";
import { mountHelp } from "./lab/help.js";
import { escapeHtml } from "./lab/html.js";
import { showPlatformKeys } from "./lab/keys.js";
import { mountLayout } from "./lab/layout.js";
import { errorText, mountResults } from "./lab/results.js";
import { resolveRoute } from "./lab/router.js";
import { mountRunLog } from "./lab/run-log.js";
import { runSql } from "./lab/runner.js";
import { mountResultScroll } from "./lab/result-scroll.js";
import { mountSchema } from "./lab/schema.js";
import { createSetActions } from "./lab/set-actions.js";
import { setShareContext } from "./lab/share.js";
import { guardFileDrops, mountPlainText } from "./lab/plain-text.js";
import { mountStatusBar } from "./lab/status-bar.js";
import { mountStorageNotice } from "./lab/storage-notice.js";
import { tableContentSql } from "./lab/sql.js";
import { mountTabs } from "./lab/tabs.js";
import { mountThemeMenu } from "./lab/theme.js";

const ui = {
    buttons: {
        reset: document.querySelector("#reset"),
        execute: document.querySelector("#execute"),
    },
    topbar: document.querySelector(".topbar"),
    toolbar: document.querySelector("#editor-toolbar"),
    fileInput: document.querySelector("#open-file-input"),
    editor: document.querySelector("#editor"),
    status: document.querySelector("#status"),
    summary: document.querySelector("#results-summary"),
    result: document.querySelector("#result"),
};

const actions = {
    executeCurrent: executeCurrent,
    copyLink: createCopyLinkAction(ui),
    exportDatabase: createExportAction(ui, () => database),
    visit: visit,
};

const shortcuts = {
    o: () => {
        // a menu left open would still be there when the file chooser closes (":popover-open"
        // is a selector only where the popover attribute exists)
        if (typeof HTMLElement.prototype.hidePopover === "function") {
            for (const popover of document.querySelectorAll(":popover-open")) {
                popover.hidePopover();
            }
        }
        ui.fileInput.click();
    },
    u: openUrl,
};

let database;

// Counts loads. Every way of opening a database takes a ticket when it begins; a load whose
// ticket is no longer the latest by the time it has fetched or built its database is
// stale (the student has asked for something else since) and is thrown away, so the last
// request always wins however the fetches are ordered.
let latestLoad = 0;

// True from the moment a load begins until the latest load has opened a database or given
// up. While it is true the open database is about to be replaced, so Run is refused: a
// query would run on the old database and its result would vanish with it.
let loading = false;

// beginLoad takes a ticket for a new load.
function beginLoad() {
    loading = true;
    return ++latestLoad;
}

// endLoad ends a load. Only the latest load counts: an older one that finishes late must
// not end the newer one. A load that ended without opening a database (opened=false) shows
// the database that is open in the switcher and the set picker again, because the student's
// choice was not carried out.
function endLoad(ticket, opened) {
    if (ticket !== latestLoad) {
        return;
    }
    loading = false;
    if (!opened) {
        picker.sync();
        lab.syncPicker();
    }
}

// for testing purposes, and for the lab modules (js/lab/) that need the open database
window.app = {
    actions: actions,
    ui: ui,
    get database() {
        return database;
    },
};

// The database switcher of the top bar (js/lab/database-switcher.js): the course databases,
// "Open a file…" and "Open from URL…".
const picker = mountDatabaseSwitcher({
    button: document.querySelector("#database-button"),
    label: document.querySelector("#database-button-name"),
    menu: document.querySelector("#database-menu"),
    onSelect: startFromDataset,
    onOpenFile: () => ui.fileInput.click(),
    onOpenUrl: openUrl,
});

// The theme menu (js/lab/theme.js) and Help (js/lab/help.js), in the top bar.
mountThemeMenu(document.querySelector(".topbar-theme"), { buttonClass: "button button--quiet" });
mountHelp({ button: document.querySelector("#help-button"), popover: document.querySelector("#help-popover") });

// The sidebar's tabs (js/lab/tabs.js); the History tab draws its list when it is shown.
const tabs = mountTabs(document.querySelector("#sidebar .tabs"), {
    onShow: (id) => {
        if (id === "tab-history") {
            runLog?.refresh();
        }
    },
});

// Exercise mode: the Exercises tab, the prompt and Check answer (js/lab/exercise-panel.js).
// It follows the page through the events below; the callbacks are how it asks for a load.
const lab = mountExercises({
    pickerSlot: document.querySelector(".exercise-set-picker-slot"),
    ui: ui,
    execute: (sql) => execute(sql),
    isLoading: () => loading,
    openSet: (set) => setActions.openSet(set),
    closeSet: () => setActions.closeSet(),
    // a set that opens shows its tab, and the sidebar if it was hidden: the exercise list,
    // the progress and Reset progress live there
    showTab: () => {
        layout.showSidebar();
        tabs.show("tab-exercises");
    },
});

// What choosing a set (or "None") does is decided in js/lab/set-actions.js; these are the
// primitives it needs from the page.
const setActions = createSetActions({
    lab: () => lab,
    hasDatabase: () => Boolean(database),
    isLoading: () => loading,
    cancelLoad: () => endLoad(beginLoad(), false),
    loadDataset: startFromDataset,
    pushUrl: (search) => history.pushState(database.name, null, search),
    showError: (message) => ui.status.error(escapeHtml(message)),
    showInvite: () => ui.status.info(MESSAGES.invite),
});

// The Schema tab (js/lab/schema.js) follows the page through the events below, and so do the
// names the editor completes (js/lab/editor-schema.js).
mountSchema({ container: document.querySelector("#schema"), editor: ui.editor });
mountEditorSchema({ editor: ui.editor });

// The "scroll sideways" note under a result that is wider than its box (js/lab/result-scroll.js).
mountResultScroll({ result: ui.result, note: document.querySelector("#result-scroll-note") });

// F5: the row cap, timing, the failing statement and Download CSV (js/lab/results.js);
// showResult and showError below delegate to it.
const results = mountResults({ ui, summary: ui.summary, getDatabase: () => database });

// F6 run log in the History tab (js/lab/run-log.js), and F11 evidence export
// (js/lab/evidence-dialog.js); both follow the page through the events below.
const exportButton = document.querySelector("#export-button");
const runLog = mountRunLog({
    ui,
    list: document.querySelector("#run-history-list"),
    isShown: () => tabs.current() === "tab-history",
});
const evidence = mountEvidence({ ui, runLog, returnFocus: exportButton });
// one line of notice while the browser cannot keep the run log or the progress
mountStorageNotice({ ui, before: ui.summary });

// The Export menu (js/lab/export-menu.js): the database (a dialog that also renames it, as the
// old editable name did), the result as CSV, the evidence file.
const exportDialog = mountExportDialog({
    returnFocus: exportButton,
    getName: () => (database ? database.name : null),
    getProblem: () => exportProblem(database),
    onExport: (name) => {
        if (name !== database.name) {
            changeName(name);
        }
        actions.exportDatabase();
    },
    // as the old export button: the reason in the status line, the result left as it is
    onNoDatabase: (message) => ui.status.error(escapeHtml(message)),
});
mountExportMenu({ button: exportButton, menu: document.querySelector("#export-menu"), onDatabase: exportDialog.open, results, evidence });

// The status bar (js/lab/status-bar.js), the pane sizes (js/lab/layout.js) and the shortcut
// names of this platform (js/lab/keys.js).
const statusBar = mountStatusBar({
    database: document.querySelector("#status-database"),
    run: document.querySelector("#status-run"),
    version: document.querySelector("#status-version"),
});
const layout = mountLayout({
    app: document.querySelector("#app"),
    sidebar: document.querySelector("#sidebar"),
    sidebarSplitter: document.querySelector("#sidebar-splitter"),
    main: document.querySelector("#main"),
    prompt: document.querySelector("#exercise-panel"),
    toolbar: ui.toolbar,
    editorPane: document.querySelector("#editor-pane"),
    editorSplitter: document.querySelector("#editor-splitter"),
    resultsPane: document.querySelector("#results-pane"),
    result: ui.result,
    feedback: document.querySelector("#exercise-feedback"),
});
showPlatformKeys();

// The skip link focuses the editor: following its #editor would change the address, which
// the router would take for a database to open.
document.querySelector(".skip-link").addEventListener("click", (event) => {
    event.preventDefault();
    ui.editor.focus();
});

// Only text/plain may be pasted or dropped into the editor, and a file dropped anywhere is not
// opened in place of the page (js/lab/plain-text.js).
mountPlainText(ui.editor);
guardFileDrops();

// announce tells the rest of the page (and the lab modules) what just happened:
//   lab:database-loaded  detail {database, dataset, exercise}: a database is open; dataset is
//                        the manifest entry, or null for an upload, a URL or the empty
//                        database; exercise is {set, exerciseId} when an exercise set was
//                        opened with it, else null (the exercise panel closes)
//   lab:run-finished     detail {database, sql, ok, rows, error, preview, elapsed}: after
//                        every run, failed ones too (statements before the error stay
//                        applied); rows is the full row count, error the engine's message alone
//                        on one line; preview is true for the table preview the app runs on its
//                        own; elapsed is how long a successful run took, in whole ms
function announce(type, detail) {
    document.dispatchEvent(new CustomEvent(type, { detail }));
}

// startFromCurrentUrl opens what the current window location asks for (js/lab/router.js):
// a share link (its dataset and SQL), a database path in the fragment, ?db=<dataset id>,
// or the default dataset. If a dataset cannot be had, it starts on an empty database, or
// keeps the database that is already open (a back/forward step must not wipe the
// student's work).
async function startFromCurrentUrl() {
    const ticket = beginLoad();
    let started = null;
    try {
        started = await openCurrentUrl(ticket);
    } finally {
        endLoad(ticket, started !== null);
    }
    if (started === null) {
        return;
    }
    showStarted({ shared: started.shared, notice: started.notice, exercise: started.exercise });
    if (started.errors.length) {
        ui.status.error(escapeHtml(started.errors.join(" ")));
    }
}

// openCurrentUrl does the loading for startFromCurrentUrl. Returns what showStarted and
// the error message need, or null when no database was opened (a newer load took over, or
// the open database was kept).
async function openCurrentUrl(ticket) {
    const route = await resolveRoute(window.location);
    // the list of datasets is true whichever load wins, and the picker needs it
    picker.setManifest(route.manifest);
    if (ticket !== latestLoad) {
        return null;
    }

    // A dataset is fetched here, so that its bytes can be kept pristine.
    let path = new DatabasePath(route.database);
    let name = path.extractName();
    let pristine = null;
    let dataset = route.dataset;
    let problem = route.problem;
    if (dataset) {
        const fetched = await fetchDataset(dataset);
        if (ticket !== latestLoad) {
            return null;
        }
        if (fetched.ok) {
            pristine = fetched.buffer;
            ({ path, name } = datasetSource(dataset, pristine));
        } else if (database) {
            ui.status.error(escapeHtml(datasetSwitchFailedMessage(dataset.name)));
            return null;
        } else {
            problem = datasetUnavailableMessage(dataset.name);
            dataset = null;
        }
    }

    // an exercise set opens only over its own dataset
    let exercise = dataset ? route.exercise : null;
    let success = await start(name, path, { sql: route.sql, dataset, pristine, ticket, exercise });
    if (!success && dataset && !database && ticket === latestLoad) {
        // The file is a SQLite file by its header but the engine cannot open it, and no
        // database is open yet: start on an empty one, as for a dataset that cannot be fetched.
        problem = datasetUnavailableMessage(dataset.name);
        dataset = null;
        exercise = null;
        const empty = new DatabasePath("");
        success = await start(empty.extractName(), empty, { sql: route.sql, ticket });
    }
    if (!success) {
        return null;
    }
    return {
        shared: route.sql !== null,
        notice: route.notice,
        exercise,
        errors: [route.damaged ? BAD_LINK_MESSAGE : null, problem].filter(Boolean),
    };
}

// datasetSource gives start() what it needs to open a fetched dataset. The engine gets
// its own copy of the bytes: manager.init edits the buffer it is given (WAL header
// flags), and the fetched buffer is kept as the pristine record.
function datasetSource(dataset, buffer) {
    const path = new DatabasePath(buffer.slice(0), "binary");
    const name = datasetFileName(dataset);
    return { path, name };
}

// startFromDataset opens a built-in dataset picked in the toolbar and puts ?db=<id> in the
// address (no fragment), so a reload keeps the dataset and back/forward step between them.
// If anything fails the previous database stays open and the picker goes back to it.
// exercise ({set, exerciseId}) opens an exercise set with the dataset: ?set=<id> instead.
async function startFromDataset(dataset, exercise = null) {
    const ticket = beginLoad();
    ui.status.info(MESSAGES.loading);
    let success = false;
    try {
        const fetched = await fetchDataset(dataset);
        if (ticket !== latestLoad) {
            return;
        }
        if (fetched.ok) {
            const { path, name } = datasetSource(dataset, fetched.buffer);
            success = await start(name, path, {
                dataset,
                pristine: fetched.buffer,
                ticket,
                keepFocus: true,
                exercise,
            });
        } else {
            ui.status.error(escapeHtml(datasetSwitchFailedMessage(dataset.name)));
        }
    } finally {
        endLoad(ticket, success);
    }
    if (!success) {
        return;
    }
    const query = exercise
        ? `${SET_PARAM}=${encodeURIComponent(exercise.set.id)}`
        : `${DATASET_PARAM}=${encodeURIComponent(dataset.id)}`;
    history.pushState(database.name, null, `?${query}`);
    showStarted({ focus: false, exercise });
}

// startFromUrl loads existing database
// from specified url
async function startFromUrl(url) {
    const ticket = beginLoad();
    const path = new DatabasePath(url);
    const name = path.extractName();
    let success = false;
    try {
        success = await start(name, path, { ticket });
    } finally {
        endLoad(ticket, success);
    }
    if (!success) {
        return;
    }
    history.pushState(database.name, null, `#${database.path.value}`);
    showStarted();
}

// startFromFile loads existing database
// from binary or sql file
async function startFromFile(file, contents, fileType) {
    const ticket = beginLoad();
    const path = new DatabasePath(contents, fileType);
    const name = file.name;
    let success = false;
    try {
        success = await start(name, path, { ticket });
    } finally {
        endLoad(ticket, success);
    }
    if (!success) {
        return;
    }
    history.pushState(database.name, null, "./");
    showStarted();
}

// start loads existing database or creates a new one
// using specified database path.
// ticket comes from beginLoad. sql (from a share link) wins over the SQL saved in storage.
// dataset is the manifest entry being opened, or null; pristine is its bytes as fetched.
// keepFocus leaves the keyboard focus where it is (the picker), instead of moving it to
// the editor.
// A load that is no longer the latest (its ticket is old) is dropped without a trace.
async function start(
    name,
    path,
    { sql = null, dataset = null, pristine = null, ticket, keepFocus = false, exercise = null } = {}
) {
    ui.result.clear();
    ui.status.info(MESSAGES.loading);

    // The path and the exception text come from the URL, a file or the engine, so they
    // are escaped before they reach the status area (which renders HTML).
    try {
        // An unsupported address (for example #scheme:id) is refused here. manager.init
        // would otherwise fall through to creating an empty database. The editor is given its
        // text once it is drawn (CodeMirror, or the plain box if that did not load in time),
        // so the text and the caret are not carried from one to the other.
        // (An unsupported address opens nothing, so its error is shown without waiting.)
        const [loadedDatabase] = path.type == "unsupported" ? [null] : await Promise.all([manager.init(name, path), ui.editor.ready]);
        console.debug(loadedDatabase);
        if (ticket !== latestLoad) {
            closeDatabase(loadedDatabase);
            return false;
        }
        if (!loadedDatabase) {
            ui.status.error(`Failed to load database from ${escapeHtml(path)}`);
            return false;
        }
        const previous = database;
        database = loadedDatabase;
        // the previous connection is not needed any more; closing it frees its memory
        closeDatabase(previous);
    } catch (exc) {
        if (ticket === latestLoad) {
            ui.status.error(`Failed to load database from ${escapeHtml(path)}: ${escapeHtml(exc)}`);
        }
        return false;
    }

    // the dataset id goes into share links; an upload or a URL clears it
    if (dataset) {
        keepPristine(dataset.id, pristine);
    } else {
        clearPristine();
    }
    setShareContext({ dataset: dataset ? dataset.id : null });

    // in exercise mode the editor holds the link's SQL or the exercise's draft, never the
    // SQL saved for the dataset
    database.query = exercise
        ? lab.editorSql(exercise, sql)
        : sql ?? (database.query || storage.get(database.name));

    document.title = titleFor(database.meaningfulName);
    ui.status.info(MESSAGES.invite);
    ui.editor.value = database.query;
    if (!keepFocus) {
        ui.editor.focus();
    }

    // Run is offered once a database is open (it stays so: a failed switch keeps the open one)
    ui.buttons.execute.disabled = false;
    announce("lab:database-loaded", { database, dataset, exercise });
    return true;
}

// closeDatabase closes a connection that is no longer used. It never throws.
function closeDatabase(old) {
    try {
        old?.db.close();
    } catch (exc) {
        console.debug("closing a database failed", exc);
    }
}

// executeCurrent runs the current SQL query
function executeCurrent() {
    return execute(ui.editor.query);
}

// execute runs SQL query on the database
// and shows results
// persist=false keeps the SQL out of storage (used for the built-in preview).
function execute(sql, persist = true) {
    if (loading) {
        // nothing is run and nothing is saved: the database it would run on is going away
        ui.status.info(escapeHtml(LOADING_BUSY_MESSAGE));
        return Promise.reject();
    }
    if (!database) {
        showError(NO_DATABASE_MESSAGE);
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
    const run = database;
    let outcome;
    try {
        ui.status.fadeOut();
        ui.status.info(MESSAGES.executing);
        const started = performance.now();
        // runSql (js/lab/runner.js) is the one way user SQL runs; the exercise checker uses it too
        const result = runSql(run, sql);
        const elapsed = Math.round(performance.now() - started);
        outcome = { ok: true, rows: result ? result.values.length : 0, elapsed };
        showResult(result, elapsed);
        return Promise.resolve();
    } catch (exc) {
        outcome = { ok: false, error: errorText(exc) };
        showError(exc);
        return Promise.reject(exc);
    } finally {
        ui.status.fadeIn();
        // after every run, failed ones too: statements before the error stay applied
        announce("lab:run-finished", { database: run, sql, preview: !persist, ...outcome });
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

// changeName renames the database (from the export dialog)
function changeName(name) {
    if (name == database.name) {
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
    document.title = titleFor(name);
    picker.rename(name);
    statusBar.rename(name, { builtIn: getPristineId() !== null });
}

// showStarted shows the result of successful database load
// notice is plain text from the router (a link named an unknown dataset, say) that goes
// with the normal message. focus=false (a pick in the database switcher) leaves the focus on
// the switcher's button, so a keyboard user can keep choosing; otherwise the caret ends up at
// the end of the editor text, after the table preview has replaced that text.
function showStarted({ shared = false, notice = null, focus = true, exercise = null } = {}) {
    const prefix = notice ? `${notice} ` : "";
    if (exercise) {
        // no table preview in exercise mode: the editor holds the link's SQL, a draft or nothing
        const message = database.query ? (shared ? SHARED_MESSAGE : RESTORED_MESSAGE) : MESSAGES.invite;
        ui.status.info(escapeHtml(prefix + message));
    } else if (database.query) {
        // SQL restored from storage or from a share link goes in the editor (start()
        // put it there) but is never run: a runaway query saved by an earlier session,
        // or sent in a link, would hang the tab.
        ui.status.info(escapeHtml(prefix + (shared ? SHARED_MESSAGE : RESTORED_MESSAGE)));
    } else if (database.tables.length) {
        showTableContent(database.tables[0]);
        if (notice) {
            ui.status.info(escapeHtml(notice));
        }
    } else {
        showWelcome(notice);
    }
    if (focus) {
        caretToEnd(ui.editor);
    }
}

// showTableContent select data from specified table
function showTableContent(table) {
    const query = tableContentSql(table);
    ui.editor.value = query;
    // the preview is not the student's work, so it is not saved as their last query
    execute(query, false).catch(ignoreRejection);
}

// showWelcome shows the message for an empty database
function showWelcome(notice = null) {
    let message = `<p>${notice ? `${escapeHtml(notice)}<br>` : ""}${MESSAGES.invite}</p>`;
    const functions = `<a href="https://sqlite.org/lang_corefunc.html" class="sqlime-link" target="_blank" rel="noopener noreferrer">Functions</a>`;
    const about = actionButton("visit", "About", "about");
    message += `<p>${functions} • ${about}</p>`;
    ui.status.info(message);
}

// showResult shows results and timing
// of the SQL query execution
function showResult(result, elapsed) {
    results.showResult(result, elapsed);
}

// showError shows an error occured
// during SQL query execution
function showError(exc) {
    results.showError(exc);
}

// ignoreRejection swallows the rejection of execute(): the error has already been
// shown in the status area, so there is nothing left to report.
function ignoreRejection() {}

function visit(page) {
    window.location.assign(`${page}.html`);
    return Promise.resolve();
}

// "Open a file…" (the database switcher, Ctrl/Cmd+O): the chosen file
ui.fileInput.addEventListener("change", () => {
    const file = ui.fileInput.files[0];
    if (!file) {
        return;
    }
    const reader = new FileReader();
    const fileType = file.name.endsWith(".sql") ? "sql" : "binary";
    reader.onload = function () {
        // forget the chosen file, so choosing the same file again fires a new change event
        ui.fileInput.value = "";
        startFromFile(file, reader.result, fileType);
    };
    if (fileType == "sql") {
        reader.readAsText(file);
    } else {
        reader.readAsArrayBuffer(file);
    }
});

// Navigate back to previous database
window.addEventListener("popstate", () => {
    startFromCurrentUrl();
});

// SQL editor 'execute' event
ui.editor.addEventListener("execute", (event) => {
    execute(event.detail).catch(ignoreRejection);
});

// Handle user actions
new ActionController(actions).listen(ui.topbar, ui.toolbar, ui.status, ui.result);
new ShortcutController(shortcuts).listen(document);

startFromCurrentUrl();
