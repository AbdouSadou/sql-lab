// Page controller

import manager from "./sqlite/manager.js";
import storage from "./storage.js";

import { ActionController } from "./controllers/actions.js";
import { ShortcutController } from "./controllers/shortcuts.js";
import { DatabasePath } from "./db-path.js";

import { titleFor } from "./lab/brand.js";
import { caretToEnd } from "./lab/caret.js";
import {
    BAD_LINK_MESSAGE,
    DATASET_PARAM,
    LOADING_BUSY_MESSAGE,
    NO_DATABASE_MESSAGE,
    SET_PARAM,
    datasetSwitchFailedMessage,
    datasetUnavailableMessage,
    loadFailedMessage,
    openedMessage,
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
// The preview flags of the assessment plan are read from the address when this import runs,
// before anything below can rewrite it.
import { flagOn } from "./lab/flags.js";
import { IMPORT_BUSY_MESSAGE, OPEN_FILE_WITH_IMPORT_DESCRIPTION } from "./lab/config-workflow.js";
import { mountHelp } from "./lab/help.js";
import { mountImport } from "./lab/import.js";
import { mountMoreMenu } from "./lab/more-menu.js";
import { showPlatformKeys } from "./lab/keys.js";
import { mountLayout } from "./lab/layout.js";
import { mountOpenUrlDialog } from "./lab/open-url-dialog.js";
import { errorText, mountResults } from "./lab/results.js";
import { resolveRoute } from "./lab/router.js";
import { mountRunLog } from "./lab/run-log.js";
import { runSql, splitStatements, stripLeadingNoise } from "./lab/runner.js";
import { mountResultScroll } from "./lab/result-scroll.js";
import { samplesFor } from "./lab/samples.js";
import { mountSchema } from "./lab/schema.js";
import { createSetActions } from "./lab/set-actions.js";
import { setShareContext } from "./lab/share.js";
import { guardFileDrops, mountPlainText } from "./lab/plain-text.js";
import { mountStatusBar } from "./lab/status-bar.js";
import { mountStorageNotice } from "./lab/storage-notice.js";
import { mountTabs } from "./lab/tabs.js";
import { mountThemeMenu } from "./lab/theme.js";
import { mountTextSize } from "./lab/text-size.js";
import { toast } from "./lab/toast.js";

const ui = {
    buttons: {
        reset: document.querySelector("#reset"),
        execute: document.querySelector("#execute"),
    },
    topbar: document.querySelector(".topbar"),
    toolbar: document.querySelector("#editor-toolbar"),
    fileInput: document.querySelector("#open-file-input"),
    editor: document.querySelector("#editor"),
    // the summary line's text ("5 rows in 3 ms"), in #results-summary with Download CSV
    status: document.querySelector("#status"),
    summary: document.querySelector("#results-summary"),
    pane: document.querySelector("#results-pane"),
    result: document.querySelector("#result"),
};

const actions = {
    executeCurrent: executeCurrent,
    copyLink: createCopyLinkAction({
        editor: ui.editor,
        button: document.querySelector("#copy-link"),
        popover: document.querySelector("#copy-link-popover"),
        // under 700 px the button is in the More menu: the popover opens under that menu's button
        altAnchor: document.querySelector("#more-button"),
    }),
    exportDatabase: createExportAction(() => database),
};

const shortcuts = {
    o: () => {
        if (importInTheWay()) {
            return;
        }
        // a menu left open would still be there when the file chooser closes (":popover-open"
        // is a selector only where the popover attribute exists)
        if (typeof HTMLElement.prototype.hidePopover === "function") {
            for (const popover of document.querySelectorAll(":popover-open")) {
                popover.hidePopover();
            }
        }
        ui.fileInput.click();
    },
    u: () => openUrl(document.activeElement),
};

let database;
// the manifest entry of the open database, or null (an upload, a URL, the empty database): its
// sample queries feed the results pane's "no result yet"
let openDataset = null;
// false until the page's first load has finished: the loads after it (the student's) end with a
// toast that names the database
let pageStarted = false;

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

// Runs that have been asked for and have not finished (a run waits one frame before it starts,
// see execute), and who is waiting for none to be left.
let pendingRuns = 0;
let idleWaiters = [];

// for testing purposes, and for the lab modules (js/lab/) that need the open database.
// whenIdle() resolves once no run is waiting or running (a test presses Run, then waits for it).
window.app = {
    actions: actions,
    ui: ui,
    get database() {
        return database;
    },
    whenIdle() {
        return pendingRuns === 0 ? Promise.resolve() : new Promise((resolve) => idleWaiters.push(resolve));
    },
};

// The database switcher of the top bar (js/lab/database-switcher.js): the course databases,
// "Open a file…" and "Open from URL…".
const picker = mountDatabaseSwitcher({
    button: document.querySelector("#database-button"),
    label: document.querySelector("#database-button-name"),
    menu: document.querySelector("#database-menu"),
    onSelect: (dataset) => {
        if (refusedWhileImporting()) {
            // the switcher has already ticked the choice: it shows what is open again
            picker.sync();
            return;
        }
        startFromDataset(dataset);
    },
    onOpenFile: () => {
        if (!importInTheWay()) {
            ui.fileInput.click();
        }
    },
    onOpenUrl: () => openUrl(document.querySelector("#database-button")),
    // with the import on, the entry says what else it takes (the assessment plan's Phase 2)
    openFileDescription: flagOn("import") ? OPEN_FILE_WITH_IMPORT_DESCRIPTION : undefined,
});

// "Open from URL…": its dialog (js/lab/open-url-dialog.js)
const openUrlDialog = mountOpenUrlDialog({ onOpen: startFromUrl });

// The theme menu (js/lab/theme.js) and Help (js/lab/help.js), in the top bar.
mountThemeMenu(document.querySelector(".topbar-theme"), { buttonClass: "button button--quiet" });
const moreButton = document.querySelector("#more-button");
const help = mountHelp({ button: document.querySelector("#help-button"), popover: document.querySelector("#help-popover"), altAnchor: moreButton });

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
    // a Check's visible run: shown in the results pane, but the verdict is what is said
    execute: (sql) => execute(sql, { quiet: true }),
    // (an import counts: a Check would otherwise go on to mark the answer after its run was refused)
    isLoading: () => loading || importer.busy(),
    openSet: (set) => {
        if (refusedWhileImporting()) {
            lab.syncPicker();
            return undefined;
        }
        return setActions.openSet(set);
    },
    closeSet: () => {
        if (refusedWhileImporting()) {
            lab.syncPicker();
            return;
        }
        setActions.closeSet();
    },
    // a set that opens shows its tab, and the sidebar if it was hidden: the exercise list,
    // the progress and Reset progress live there
    showTab: () => {
        layout.showSidebar();
        tabs.show("tab-exercises");
    },
    // the results pane (mounted below; these run later)
    showIdle: () => results.showEmpty(),
    modeChanged: () => results.refreshEmpty(),
    // a Check's verdict is said by the results pane's live region, as every run's outcome is; on
    // a phone the Result view shows it (a Check that ran something shows it already)
    say: (text) => {
        results.say(text);
        layout.showView("result");
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
    // (a set that cannot be opened is not a load of its own: a load on its way is left alone)
    showError: (message) => results.loadFailed(message, { ownLoad: false }),
    showInvite: () => results.loadCancelled(),
});

// The Schema tab (js/lab/schema.js) follows the page through the events below, and so do the
// names the editor completes (js/lab/editor-schema.js).
mountSchema({ container: document.querySelector("#schema"), editor: ui.editor });
mountEditorSchema({ editor: ui.editor });

// The "scroll sideways" note under a result that is wider than its box (js/lab/result-scroll.js).
mountResultScroll({ result: ui.result, note: document.querySelector("#result-scroll-note") });

// The results pane (js/lab/results.js): the ruled table and its summary line (the row cap, the
// time, Download CSV), "Done.", the error band, "no result yet" with its sample queries, and a
// database loading; showResult and showError below delegate to it.
const results = mountResults({
    ui,
    pane: ui.pane,
    summary: ui.summary,
    getDatabase: () => database,
    getSamples: () => samplesFor(openDataset, database),
    isExercise: () => lab.isOpen(),
});

// F6 run log in the History tab (js/lab/run-log.js), and F11 evidence export
// (js/lab/evidence-dialog.js); both follow the page through the events below.
const exportButton = document.querySelector("#export-button");
// where the focus goes back to when an export's dialog closes: the Export menu's button, or under
// 700 px, where the top bar's actions fold into the More menu, that menu's button
const exportReturn = {
    focus(options) {
        (exportButton.getClientRects().length ? exportButton : moreButton).focus(options);
    },
};
const runLog = mountRunLog({
    ui,
    list: document.querySelector("#run-history-list"),
    isShown: () => tabs.current() === "tab-history",
});
const evidence = mountEvidence({ runLog, returnFocus: exportReturn });
// one line of notice while the browser cannot keep the run log or the progress
mountStorageNotice({ ui, before: ui.summary });

// The Export menu (js/lab/export-menu.js): the database (a dialog that also renames it, as the
// old editable name did), the result as CSV, the evidence file.
const exportDialog = mountExportDialog({
    returnFocus: exportReturn,
    getName: () => (database ? database.name : null),
    // (a database exported part-way through an import would hold half of it)
    getProblem: () => (importer.busy() ? IMPORT_BUSY_MESSAGE : exportProblem(database)),
    onExport: (name) => {
        if (importer.busy()) {
            return;
        }
        if (name !== database.name) {
            changeName(name);
        }
        actions.exportDatabase();
    },
    // the menu entry's answer: a toast that says why nothing was done, the result left as it is
    onNoDatabase: (message) => toast(message, { tone: "note" }),
});
mountExportMenu({ button: exportButton, menu: document.querySelector("#export-menu"), onDatabase: exportDialog.open, results, evidence });
// Under 700 px Copy link, Export, Theme and Help fold into the More menu (js/lab/more-menu.js)
mountMoreMenu({
    button: moreButton,
    menu: document.querySelector("#more-menu"),
    copyLink: actions.copyLink,
    onDatabase: exportDialog.open,
    results,
    evidence,
    help,
});
// Import of CSV files (js/lab/import.js; the assessment plan's Phase 2). Behind the "import"
// flag: with it off, nothing below changes what a choice or a drop of files does.
// The address when an import began: Back and Forward put it back (see popstate, below).
let addressAtImport = null;
const importer = mountImport({
    fileInput: ui.fileInput,
    returnFocus: document.querySelector("#database-button"),
    getDatabase: () => database,
    getDatabaseLabel: () => (openDataset ? openDataset.name : database.name),
    isCourseDatabase: () => openDataset !== null,
    // (no import starts while a database is on its way: it would close the open one under it)
    isLoading: () => loading,
    openBuilt,
    announceChanged: (changed) => announce("lab:database-changed", { database: changed }),
    runLog,
    results,
    showResult: () => layout.showView("result"),
    onBusy: (busy) => {
        addressAtImport = busy ? { href: location.href, state: history.state } : null;
    },
});

// While an import runs, the database it writes to must stay as it is: nothing else is run on it,
// nothing exports it, and no other database is opened over it (the plan's section 7). The page's
// own loading state will not do for this: closing an exercise set clears it.
// refusedWhileImporting says so in a toast, and answers whether the caller must stop.
function refusedWhileImporting() {
    if (!importer.busy()) {
        return false;
    }
    toast(IMPORT_BUSY_MESSAGE, { tone: "note" });
    return true;
}

// importInTheWay: the same, and also while the import's dialog is open (Ctrl+O and Ctrl+U reach
// the page under a dialog: a second set of files, or another database, would start there)
function importInTheWay() {
    return refusedWhileImporting() || importer.dialogOpen();
}

// A− and A+ in the editor toolbar: the size of the SQL and of the results (js/lab/text-size.js)
mountTextSize({
    smaller: document.querySelector("#text-smaller"),
    larger: document.querySelector("#text-larger"),
    said: document.querySelector("#text-size-said"),
});

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
    sidebarButton: document.querySelector("#sidebar-button"),
    sidebarClose: document.querySelector("#sidebar-close"),
    main: document.querySelector("#main"),
    viewEditor: document.querySelector("#view-editor"),
    viewResult: document.querySelector("#view-result"),
    editor: ui.editor,
    prompt: document.querySelector("#exercise-panel"),
    toolbar: ui.toolbar,
    editorPane: document.querySelector("#editor-pane"),
    editorSplitter: document.querySelector("#editor-splitter"),
    resultsPane: document.querySelector("#results-pane"),
    result: ui.result,
    feedback: document.querySelector("#exercise-feedback"),
});
// In the drawer (under 1100 px), choosing an exercise closes it, to show the exercise's prompt
// (on a wide window the list stays in sight, and the focus on it)
document.querySelector("#exercise-list").addEventListener("click", (event) => {
    if (event.target.closest("button.exercise-item")) {
        layout.closeDrawer();
    }
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
//   lab:run-finished     detail {database, sql, ok, rows, error, preview, elapsed, resultSet,
//                        changes}: after every run, failed ones too (statements before the
//                        error stay applied); rows is the full row count, error the engine's
//                        message alone on one line; preview is false (no run is the app's own
//                        any more; the field stays for the listeners that read it); elapsed is
//                        how long a successful run took, in whole ms; resultSet whether a
//                        statement returned a result set; changes, for a run with none, the rows
//                        it changed by the engine's count (null for none to report)
//   lab:database-changed detail {database}: an import into the open database has ended, and the
//                        database has gained tables. Not a run: nothing goes into the run log.
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
    // the results pane shows the load from the start; the name follows once the route is known
    const loader = results.showLoading();
    let started = null;
    try {
        started = await openCurrentUrl(ticket, loader);
    } finally {
        endLoad(ticket, started !== null);
    }
    if (started === null) {
        pageStarted = true;
        return;
    }
    showStarted({
        shared: started.shared,
        notice: started.notice,
        exercise: started.exercise,
        problem: started.errors.length ? started.errors.join(" ") : null,
    });
}

// openCurrentUrl does the loading for startFromCurrentUrl. Returns what showStarted and
// the error message need, or null when no database was opened (a newer load took over, or
// the open database was kept).
async function openCurrentUrl(ticket, loader) {
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
    loader.name(dataset ? dataset.name : name);
    if (dataset) {
        const fetched = await fetchDataset(dataset, { onProgress: loader.progress });
        if (ticket !== latestLoad) {
            return null;
        }
        if (fetched.ok) {
            pristine = fetched.buffer;
            ({ path, name } = datasetSource(dataset, pristine));
        } else if (database) {
            results.loadFailed(datasetSwitchFailedMessage(dataset.name));
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
    if (importer.busy()) {
        return;
    }
    const ticket = beginLoad();
    const loader = results.showLoading({ name: dataset.name });
    let success = false;
    try {
        const fetched = await fetchDataset(dataset, { onProgress: loader.progress });
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
            results.loadFailed(datasetSwitchFailedMessage(dataset.name));
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
    if (refusedWhileImporting()) {
        return;
    }
    const ticket = beginLoad();
    const path = new DatabasePath(url);
    const name = path.extractName();
    // the engine fetches it: the name is known, its size and progress are not
    results.showLoading({ name: name || url });
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
    if (refusedWhileImporting()) {
        return;
    }
    const ticket = beginLoad();
    const path = new DatabasePath(contents, fileType);
    const name = file.name;
    // read from the device already: all of it is here
    results.showLoading({ name, size: file.size }).progress(file.size, file.size);
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

// openBuilt makes a database that was built apart the open one, as an opened file is: the address
// becomes "./" and its run log is kept under its name. The import calls it with the database it
// has filled (js/lab/import.js), and shows its own report afterwards, so there is no "no result
// yet" here and no toast. Returns false when it could not be opened: the database is then closed.
async function openBuilt(built) {
    const ticket = beginLoad();
    let success = false;
    try {
        success = await start(built.name, built.path, { ticket, built });
    } finally {
        endLoad(ticket, success);
    }
    if (!success) {
        if (database !== built) {
            closeDatabase(built);
        }
        return false;
    }
    history.pushState(database.name, null, "./");
    pageStarted = true;
    return true;
}

// start loads existing database or creates a new one
// using specified database path.
// ticket comes from beginLoad. sql (from a share link) wins over the SQL saved in storage.
// dataset is the manifest entry being opened, or null; pristine is its bytes as fetched.
// keepFocus leaves the keyboard focus where it is (the picker), instead of moving it to
// the editor.
// built is a database that is open already (openBuilt): it is taken as it is, and nothing is
// fetched or read.
// A load that is no longer the latest (its ticket is old) is dropped without a trace.
// The caller has put the results pane in its loading state; a failure shows the error band there
// (with the database that stays open under it, if one does).
async function start(
    name,
    path,
    { sql = null, dataset = null, pristine = null, ticket, keepFocus = false, exercise = null, built = null } = {}
) {
    // The path and the exception text come from the URL, a file or the engine: the error band
    // shows them as text.
    try {
        // An unsupported address (for example #scheme:id) is refused here. manager.init
        // would otherwise fall through to creating an empty database. The editor is given its
        // text once it is drawn (CodeMirror, or the plain box if that did not load in time),
        // so the text and the caret are not carried from one to the other.
        // (An unsupported address opens nothing, so its error is shown without waiting.)
        const [loadedDatabase] =
            path.type == "unsupported" ? [null] : await Promise.all([built ?? manager.init(name, path), ui.editor.ready]);
        console.debug(loadedDatabase);
        if (ticket !== latestLoad) {
            closeDatabase(loadedDatabase);
            return false;
        }
        if (!loadedDatabase) {
            results.loadFailed(loadFailedMessage(path));
            return false;
        }
        const previous = database;
        database = loadedDatabase;
        // the previous connection is not needed any more; closing it frees its memory
        closeDatabase(previous);
    } catch (exc) {
        if (ticket === latestLoad) {
            results.loadFailed(loadFailedMessage(path, exc));
        }
        return false;
    }

    // the dataset id goes into share links; an upload or a URL clears it
    if (dataset) {
        keepPristine(dataset.id, pristine);
    } else {
        clearPristine();
    }
    openDataset = dataset;
    setShareContext({ dataset: dataset ? dataset.id : null });

    // in exercise mode the editor holds the link's SQL or the exercise's draft, never the
    // SQL saved for the dataset
    database.query = exercise
        ? lab.editorSql(exercise, sql)
        : sql ?? (database.query || storage.get(database.name));

    document.title = titleFor(database.meaningfulName);
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

// executeCurrent runs the current SQL query (the Run button). It answers at once: the run itself
// starts a frame later (execute), and ActionController holds a button disabled until its action's
// promise settles, which would take the keyboard focus off Run (a disabled button loses it).
function executeCurrent() {
    execute(ui.editor.query).catch(ignoreRejection);
    return Promise.resolve();
}

// afterPaint resolves once the browser has drawn a frame, or after AFTER_PAINT_MAX_MS in a tab that
// draws none (a hidden one; a page starved of frames waits as long, so "Running…" still gets its
// frame on a busy machine)
const AFTER_PAINT_MAX_MS = 250;
function afterPaint() {
    return new Promise((resolve) => {
        let done = false;
        const go = () => {
            if (!done) {
                done = true;
                resolve();
            }
        };
        requestAnimationFrame(() => setTimeout(go, 0));
        setTimeout(go, AFTER_PAINT_MAX_MS);
    });
}

// changedRows: how many rows the run changed, for "Done. 3 rows changed" (the engine's count of
// every row an INSERT, UPDATE or DELETE touched, triggers included); 0 for a run with one of those
// that touched none; null for a run with none of them (CREATE TABLE ...): then "Done." alone.
function changedRows(run, before, sql) {
    let after = before;
    try {
        after = run.db.changes(true);
    } catch {
        return null;
    }
    if (after > before) {
        return after - before;
    }
    try {
        const writes = splitStatements(run.capi, sql).some((statement) =>
            /^(insert|update|delete|replace)\b/i.test(stripLeadingNoise(statement))
        );
        return writes ? 0 : null;
    } catch {
        return null;
    }
}

// What execute() rejects with when it dropped a run (nothing ran): js/lab/exercise-panel.js tells it
// from a run that failed.
const RUN_DROPPED = Object.freeze({ dropped: true });

// execute runs SQL query on the database
// and shows results
// The run waits for one frame first: it blocks the page while it runs, and "Running…" (armed in the
// results pane) can only appear during a long run if the browser has drawn it before. A database
// that was replaced in that frame is not run on: the request is dropped, as a stale load is.
// quiet: the outcome is shown but not said (a Check's run: the exercise's verdict is said).
function execute(sql, { quiet = false } = {}) {
    if (refusedWhileImporting()) {
        // nothing is run: it would run inside the import, on tables that are half made
        return Promise.reject();
    }
    if (loading) {
        // nothing is run and nothing is saved: the database it would run on is going away
        toast(LOADING_BUSY_MESSAGE, { tone: "note" });
        return Promise.reject();
    }
    if (!database) {
        showError(NO_DATABASE_MESSAGE);
        // (on a phone the answer is in the Result view, as a run's is)
        layout.showView("result");
        return Promise.reject();
    }
    sql = sql.trim();
    storage.set(database.name, sql);
    if (!sql) {
        // nothing to run: "no result yet", said, as the old status line said its invitation
        results.showEmpty({ said: true });
        layout.showView("result");
        return Promise.resolve();
    }
    const run = database;
    const endRun = results.startRun();
    pendingRuns++;
    return afterPaint()
        .then(() => {
            // replaced in that frame, or about to be (a load began): the run would land on a database
            // that is going away, so it is dropped, as Run is refused while a database loads; the
            // rejection says so (a Check whose run was dropped checks nothing)
            if (run !== database || loading || importer.busy()) {
                return Promise.reject(RUN_DROPPED);
            }
            let outcome;
            try {
                const before = run.db.changes(true);
                const started = performance.now();
                // runSql (js/lab/runner.js) is the one way user SQL runs; the exercise checker uses it too
                const result = runSql(run, sql);
                const elapsed = Math.round(performance.now() - started);
                const changes = result ? null : changedRows(run, before, sql);
                outcome = { ok: true, rows: result ? result.values.length : 0, elapsed, resultSet: Boolean(result), changes };
                showResult(result, elapsed, { changes, quiet });
                return undefined;
            } catch (exc) {
                outcome = { ok: false, error: errorText(exc) };
                showError(exc, { quiet });
                return Promise.reject(exc);
            } finally {
                // after every run, failed ones too: statements before the error stay applied
                announce("lab:run-finished", { database: run, sql, preview: false, ...outcome });
            }
        })
        .finally(() => {
            endRun();
            pendingRuns--;
            if (pendingRuns === 0) {
                const waiting = idleWaiters;
                idleWaiters = [];
                waiting.forEach((resolve) => resolve());
            }
        });
}

// openUrl asks for a database's address in a dialog (js/lab/open-url-dialog.js); the focus goes
// back to returnFocus if the student cancels
function openUrl(returnFocus) {
    if (importInTheWay()) {
        return;
    }
    // a menu left open would sit above the dialog's backdrop
    if (typeof HTMLElement.prototype.hidePopover === "function") {
        for (const popover of document.querySelectorAll(":popover-open")) {
            popover.hidePopover();
        }
    }
    openUrlDialog.open(returnFocus);
}

// changeName renames the database (from the export dialog)
function changeName(name) {
    if (name == database.name) {
        return;
    }
    // Move what is *saved* under the old name. database.query is not that: it can be SQL from a
    // share link that has not been run, which is not the student's work (js/lab/share.js: shared
    // SQL reaches storage only through a Run).
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

// showStarted shows the result of successful database load: the results pane's "no result yet"
// (UI plan, section 5), whose line says whether the editor holds the student's last query or a
// shared one, and whose sample queries fill the editor without running. Nothing runs on load:
// SQL restored from storage or from a link is put in the editor (start() did) but never run, as a
// runaway query saved by an earlier session, or sent in a link, would hang the tab; and the first
// table's preview is now a sample the student chooses (inventory row 82).
// notice is plain text from the router (a link named an unknown dataset, say); problem is the
// error band above it (a damaged link, a dataset that could not be had). focus=false (a pick in
// the database switcher) leaves the focus on the switcher's button, so a keyboard user can keep
// choosing; otherwise the caret ends up at the end of the editor text.
function showStarted({ shared = false, notice = null, focus = true, problem = null } = {}) {
    const variant = database.query ? (shared ? "shared" : "restored") : "fresh";
    results.showEmpty({ variant, notice, problem });
    // a load the student asked for ends with a toast that names what is open now
    if (pageStarted) {
        toast(openedMessage(openDataset ? openDataset.name : database.name));
    }
    pageStarted = true;
    if (focus) {
        caretToEnd(ui.editor);
    }
}

// showResult shows results and timing
// of the SQL query execution
function showResult(result, elapsed, details) {
    results.showResult(result, elapsed, details);
}

// showError shows an error occured
// during SQL query execution
function showError(exc, details) {
    results.showError(exc, details);
}

// ignoreRejection swallows the rejection of execute(): the error has already been
// shown in the results pane, so there is nothing left to report.
function ignoreRejection() {}

// openFile opens a database file or a SQL script from the device; read() is called once the file
// has been read
function openFile(file, read = () => {}) {
    const reader = new FileReader();
    const fileType = file.name.endsWith(".sql") ? "sql" : "binary";
    reader.onload = function () {
        read();
        startFromFile(file, reader.result, fileType);
    };
    if (fileType == "sql") {
        reader.readAsText(file);
    } else {
        reader.readAsArrayBuffer(file);
    }
}

// "Open a file…" (the database switcher, Ctrl/Cmd+O): the chosen file. With the import on, the
// files are offered to it first: CSV files open its dialog, and it leaves a single database or
// script to be opened as ever.
ui.fileInput.addEventListener("change", () => {
    // (a copy: the input's own list is emptied with its value)
    const files = Array.from(ui.fileInput.files);
    if (!files.length) {
        return;
    }
    if (importer.take(files)) {
        ui.fileInput.value = "";
        return;
    }
    openFile(files[0], () => {
        // forget the chosen file, so choosing the same file again fires a new change event
        ui.fileInput.value = "";
    });
});

// With the import on, files dropped anywhere on the page are taken exactly as if they had been
// chosen (the assessment plan, section 3). The drop itself is refused as ever (js/lab/plain-text.js:
// it puts no text in the editor, and the browser does not open the file); a drop is ignored while
// a dialog is open or an import is running.
if (importer.enabled) {
    document.addEventListener("drop", (event) => {
        // (taken now: the list is gone once the event is over)
        const files = Array.from(event.dataTransfer?.files ?? []);
        if (!files.length) {
            return;
        }
        event.preventDefault();
        if (document.querySelector("dialog[open]") || importer.busy()) {
            return;
        }
        if (!importer.take(files)) {
            openFile(files[0]);
        }
    });
}

// Navigate back to previous database
window.addEventListener("popstate", () => {
    if (importer.busy()) {
        // Back or Forward cannot be refused: the address has changed already. Nothing is opened
        // (it would close the database the import is writing to), and the address is put back.
        history.pushState(addressAtImport?.state ?? null, "", addressAtImport?.href ?? location.href);
        toast(IMPORT_BUSY_MESSAGE, { tone: "note" });
        return;
    }
    startFromCurrentUrl();
});

// SQL editor 'execute' event
ui.editor.addEventListener("execute", (event) => {
    execute(event.detail).catch(ignoreRejection);
});

// Handle user actions
new ActionController(actions).listen(ui.topbar, ui.toolbar);
new ShortcutController(shortcuts).listen(document);
// With Caps Lock on, Ctrl/Cmd+O and U arrive as "O" and "U", which ShortcutController (upstream's,
// case-sensitive) does not know, and the browser would open its own view-source: the same
// shortcuts, as long as Shift is not held (Ctrl+Shift+U is other software's).
document.addEventListener("keydown", (event) => {
    if ((event.ctrlKey || event.metaKey) && !event.shiftKey && !event.altKey && (event.key === "O" || event.key === "U")) {
        event.preventDefault();
        shortcuts[event.key.toLowerCase()]();
    }
});

startFromCurrentUrl();
