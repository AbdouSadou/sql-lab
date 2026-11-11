// App-wide constants. Everything here is safe to edit; nothing else in the
// shipped HTML, CSS or JS spells the app name.

// The app name. Change this one line to rename the app: js/lab/brand.js writes it
// into document.title and into every element that carries data-app-name.
export const APP_NAME = "SQL Lab";

// Shown (instead of the generic invitation) when SQL saved by an earlier session
// has been put back in the editor. Restored SQL is never run automatically.
export const RESTORED_MESSAGE = "Your last query is back in the editor. Press Run to execute it.";

// "Open from URL…" (the database switcher, Ctrl/Cmd+U): a dialog with one address field
// (js/lab/open-url-dialog.js). The field starts empty: never suggest a third-party address.
export const OPEN_URL_TITLE = "Open from URL";
export const OPEN_URL_INTRO = "Opens a SQLite database, or a .sql script, from an address on the web.";
export const OPEN_URL_LABEL = "Address";
export const OPEN_URL_HINT = "It starts with https://, or is a path on this site. The site that holds the file must let other sites read it.";
export const OPEN_URL_SUBMIT_TEXT = "Open";
export const OPEN_URL_CANCEL_TEXT = "Cancel";
export const OPEN_URL_EMPTY_MESSAGE = "Enter the address of a database file.";
export const OPEN_URL_UNSUPPORTED_MESSAGE =
    "This address cannot be opened. Use one that starts with https:// or http://, or a path on this site.";

// F3 sharing. A link is the page URL plus "#s=<payload>"; the payload is the state as
// JSON, compressed with lz-string. The fragment is never sent to a server.
export const SHARE_PARAM = "s";
export const SHARE_VERSION = 1;
// Ids (dataset, exercise set, exercise) in a link must match this.
export const SHARE_ID_PATTERN = /^[A-Za-z0-9_-]{1,64}$/;
// Limits applied to an incoming link before and after decompression. A link is hostile
// input: lz-string can expand a few KB into hundreds of MB, so the size of the
// decompressed text is checked (its length is known without copying it) before it is
// parsed. About 100,000 payload characters hold roughly 60 KB of incompressible SQL.
export const SHARE_MAX_PAYLOAD_CHARS = 100000;
export const SHARE_MAX_JSON_CHARS = 400000;
export const SHARE_MAX_SQL_CHARS = 200000;

// Messages (plain text; the callers escape them).
export const SHARED_MESSAGE = "A shared query is in the editor. Press Run to execute it.";
export const BAD_LINK_MESSAGE =
    "This link is damaged or incomplete, so its query could not be opened. Ask the sender for a new link.";
// Copy link (js/lab/copy-link.js): a toast says it worked; when the browser keeps the clipboard
// to itself, a small popover under the button holds the link, selected, to copy by hand.
export const LINK_COPIED_MESSAGE = "Link copied";
export const LINK_COPY_FAILED_TITLE = "Copy this link";
export const LINK_COPY_FAILED_MESSAGE = "The browser did not let the page copy it. Press Ctrl+C (⌘C on a Mac) to copy the link below.";
export const LINK_FIELD_LABEL = "Link to this query";
export const LINK_TOO_LONG_MESSAGE =
    "This query is too long to put in a link. Shorten it, or send the text itself.";

// Shown under a result that is wider than its box (js/lab/result-scroll.js).
export const RESULT_SCROLL_NOTE = "This result is wider than the screen. Scroll sideways to see the other columns.";
// The result box is a named region; while it scrolls sideways it is also a Tab stop, so the
// keyboard can scroll it (js/lab/result-scroll.js).
export const RESULT_REGION_LABEL = "Query result";

// VACUUM INTO a file would leave the file in the engine's memory for the life of the page
// (js/lab/runner.js, "The guard"). Files cannot be saved from the browser anyway; the export
// button saves the database.
export const VACUUM_INTO_MESSAGE =
    "VACUUM INTO a file is not available here, because files cannot be saved from the browser. Use the export button to save the database.";

// SQL that holds a NUL character (U+0000). The engine reads SQL text only up to the first one, so
// the statements after it would not run, and nothing would say so; SQLite itself (in other
// drivers) reports "embedded null character".
export const SQL_NUL_MESSAGE =
    "The SQL contains a NUL character (U+0000), which SQLite does not accept in a statement, so nothing was run. Remove it and run again (pasting from a document or a web page is the usual way it gets in).";

// Run while a database is still loading (a toast), and with no database at all (the results
// pane's error band).
export const LOADING_BUSY_MESSAGE =
    "A database is still loading, so nothing was run. Press Run again once it has opened.";
export const NO_DATABASE_MESSAGE = "No database is loaded.";
// A database could not be opened (the error band); the path and the reason come from the address,
// a file or the engine (text only, never markup).
export const loadFailedMessage = (path, reason) =>
    reason ? `Failed to load database from ${path}: ${reason}` : `Failed to load database from ${path}`;

// F1 datasets. The manifest lists the built-in databases (js/lab/datasets.js validates it).
// Both paths are relative, so they resolve against the page and work under any subpath.
export const MANIFEST_URL = "datasets/manifest.json";
// The convenience alias: index.html?db=<dataset id> opens that dataset.
export const DATASET_PARAM = "db";
// Every .db file starts with these 16 bytes; a server that answers a missing file with an
// HTML page is caught by this check.
export const SQLITE_HEADER = "SQLite format 3\u0000";

// The top bar (UI plan, section 5). The interface says "database", not "dataset".
// The database switcher (js/lab/database-switcher.js): its button shows the open database.
export const DATABASE_MENU_LABEL = "Databases";
export const DATABASE_LOADING = "Loading…";
export const DATABASE_NONE = "No database open";
// the switcher button's name: the open database, and what the button is for
export const databaseButtonLabel = (name) => `Database: ${name}`;
export const OPEN_FILE_TEXT = "Open a file…";
export const OPEN_FILE_DESCRIPTION = "A SQLite database or a .sql script from this device";
export const OPEN_URL_TEXT = "Open from URL…";
export const OPEN_URL_DESCRIPTION = "A database file on the web";
// the size of a course database in its menu entry
export const databaseSizeText = (bytes) =>
    bytes >= 1_000_000 ? `${(bytes / 1_000_000).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1000))} KB`;
// The Export menu (js/lab/export-menu.js): each entry says what it is for.
export const EXPORT_MENU_LABEL = "Export";
export const EXPORT_DATABASE_TEXT = "Database (.db)…";
export const EXPORT_BUTTON_TITLE = "Download the open database, with your changes, as a file";
export const EXPORT_RESULTS_TEXT = "Results (.csv)";
export const EXPORT_RESULTS_DESCRIPTION = "The whole result on screen, for a spreadsheet";
export const EXPORT_RESULTS_NONE = "Run a query that returns rows first";
export const EXPORT_EVIDENCE_TEXT = "Evidence (.txt)…";
// one line in the menu; the evidence dialog itself explains the file at length
export const EXPORT_EVIDENCE_DESCRIPTION = "A text record of the queries you ran, for your assessment";
// The database export dialog (js/lab/export-dialog.js): the file name is also the database's
// name, so a rename happens here (it used to be the editable name in the header).
export const EXPORT_DIALOG_TITLE = "Export the database";
export const EXPORT_DIALOG_TEXT = "Saves the open database, with your changes, as a file on this device.";
export const EXPORT_NAME_LABEL = "File name";
export const EXPORT_NAME_HINT = "This also renames the database here: the page title and the CSV file take the new name.";
export const EXPORT_SUBMIT_TEXT = "Export";
export const EXPORT_CANCEL_TEXT = "Cancel";

// The layout (js/lab/layout.js): the sidebar's width and whether it is hidden, and the editor
// pane's share (its toolbar and the editor) of the room under the exercise prompt, kept in
// localStorage under one key.
export const LAYOUT_STORAGE_KEY = "sqllab.layout";
export const SIDEBAR_WIDTH = { initial: 280, min: 220, max: 420 };
// a sidebar dragged narrower than this hides
export const SIDEBAR_HIDE_BELOW = 160;
export const EDITOR_SHARE = 0.4;
export const EDITOR_MIN_HEIGHT = 120;
export const RESULTS_MIN_HEIGHT = 96;
// the exercise prompt takes at most this share of the window, less on a short one (it scrolls
// inside), and keeps this much at least
export const PROMPT_SHARE = 0.4;
export const PROMPT_MIN_HEIGHT = 72;
// arrow keys move a splitter this far
export const SPLITTER_STEP = 16;
export const sidebarWidthText = (width) => (width ? `${width} pixels wide` : "hidden");
export const editorHeightText = (height) => `${height} pixels high`;

// The SQL editor (js/components/sqlime-editor.js, js/lab/code-editor.js).
export const EDITOR_LABEL = "SQL query";
export const EDITOR_PLACEHOLDER = "Write SQL here, then press Run.";
// the id of the sentence (in the Help popover) that describes the editor to a screen reader
export const EDITOR_HINT_ID = "editor-hint";
// how long the page waits for CodeMirror (vendor/editor.js) before it shows the plain editor; a
// late CodeMirror still takes over, with the text, the caret and the focus
export const EDITOR_UPGRADE_WAIT_MS = 3000;
// the detail shown beside a completion (a column shows its type, or the tables that have it)
export const COMPLETION_TABLE = "table";
export const COMPLETION_VIEW = "view";
export const COMPLETION_FUNCTION = "function";
export const COMPLETION_TYPE = "type";
// said by a screen reader when the list of names opens (nothing is picked yet)
export const completionsOpenedText = (count) =>
    `${count} ${count === 1 ? "suggestion" : "suggestions"}. Press the down arrow to pick one, then Enter.`;

// The status bar (js/lab/status-bar.js).
export const STATUS_NO_RUN = "No query run yet";
export const STATUS_RUN_FAILED = "Last run failed";
// "5 rows in 3 ms": the rows part, then the time (a span of its own: the screenshot baselines give
// it one value)
export const statusRowsText = (rows) => `${rows.toLocaleString("en")} ${rows === 1 ? "row" : "rows"} in `;
// a run whose statements returned no result set (CREATE, INSERT, ...) has the summary line's words,
// resultDoneText below: "Done in 2 ms", "Done. 3 rows changed in 2 ms"
export const statusTimeText = (ms) => `${ms} ms`;
export const statusVersionText = (version) => `SQLite ${version}`;

// The theme (js/lab/theme.js). The stored value is "light" or "dark"; nothing stored means "match
// the device". js/lab/theme-boot.js reads the same key before the first paint, so it repeats it.
export const THEME_STORAGE_KEY = "sqllab.theme";
export const THEME_BUTTON_TEXT = "Theme";
export const THEME_MENU_LABEL = "Theme";
export const THEME_OPTIONS = [
    { value: "light", label: "Light" },
    { value: "dark", label: "Dark" },
    { value: "device", label: "Match device" },
];

// Messages about the course databases (plain text, shown with textContent; some carry names
// from the manifest or the address). The interface says "database" (UI plan, section 3, Voice);
// the folder and the manifest keep their names. Manifest problems are worded for the instructor
// who edits datasets/manifest.json, because a student cannot fix them but can report them.
const MANIFEST_NAME = "datasets/manifest.json";
export const MANIFEST_UNREACHABLE_MESSAGE =
    `The list of course databases (${MANIFEST_NAME}) could not be loaded, so an empty database is open. ` +
    "You can still open a database file of your own, or reload the page to try again.";
export const manifestInvalidMessage = (problem) =>
    `The list of course databases (${MANIFEST_NAME}) is not valid: ${problem} ` +
    "An empty database is open. You can still open a database file of your own.";
export const datasetUnavailableMessage = (name) =>
    `The database "${name}" could not be loaded, so an empty database is open. ` +
    "You can still open a database file of your own, or reload the page to try again.";
export const datasetSwitchFailedMessage = (name) =>
    `The database "${name}" could not be loaded. The previous database is still open.`;
export const unknownDatasetMessage = (id) =>
    (id ? `There is no database "${id}" on this site` : "The database in the address is not available") +
    ", so the default database is open.";
export const LINK_NO_DATASET_MESSAGE =
    "This link does not name a database, so the default database is open.";
export const NOT_IN_LINK_MESSAGE =
    "This database is not one of the course databases, so the link cannot include it: " +
    "whoever opens the link gets the default database.";

// Export. A saved file is confirmed by a toast that names it (js/lab/toast.js); a failure is a
// toast too, as the action's own answer.
export const EXPORT_EMPTY_MESSAGE =
    "The database is empty, so there is nothing to export. Create a table first.";
export const EXPORT_FAILED_MESSAGE = "The database could not be exported.";
export const exportedMessage = (filename) => `Exported ${filename}`;

// Name of the exported file when the database has no usable name.
export const EXPORT_FALLBACK_NAME = "database";

// F4 schema sidebar (js/lab/schema.js). Messages are plain text; the sidebar builds its DOM
// with textContent, and names inside them come from the open database.
export const SCHEMA_TABLES_HEADING = "Tables";
export const SCHEMA_VIEWS_HEADING = "Views";
// a filter box appears above the lists once there are more objects than this
export const SCHEMA_FILTER_FROM = 8;
export const SCHEMA_FILTER_LABEL = "Filter tables and views";
export const SCHEMA_NO_MATCH = "No table or view matches.";
export const SCHEMA_MORE_TEXT = "Show more";
export const SCHEMA_LESS_TEXT = "Show less";
export const SCHEMA_PRIMARY_KEY = "Primary key";
export const schemaForeignKeyLabel = (table) => `Foreign key to ${table}`;
export const SCHEMA_EMPTY_MESSAGE =
    "No tables yet. Create one with CREATE TABLE and it will appear here.";
export const SCHEMA_ERROR_MESSAGE = "The tables of this database could not be listed.";
// shown instead of a row count or a column list that could not be read
export const SCHEMA_DASH = "–";
export const schemaExpandLabel = (kind, name) => `Columns of ${kind} ${name}`;
export const schemaInsertLabel = (kind, name) => `Insert ${kind} name ${name} into the query`;
export const schemaInsertColumnLabel = (table, name) =>
    `Insert column name ${name} of ${table} into the query`;
export const schemaRowsWord = (count) => (count === "1" ? "row" : "rows");
export const SCHEMA_COUNT_UNAVAILABLE = "row count unavailable";
export const SCHEMA_COLUMNS_UNAVAILABLE = "columns unavailable";

// ---- F2/F7 exercise mode (engine side: js/lab/exercises.js, checker.js, progress.js) ----

// Address parameters: index.html?set=<set id> opens an exercise set (its dataset loads with
// it) and &ex=<exercise id> picks the exercise.
export const SET_PARAM = "set";
export const EXERCISE_PARAM = "ex";

// One file per set, fetched by a relative URL. The folder URL is fetched too, to discover
// the sets (js/lab/exercises.js listSets): python3 -m http.server serves a listing by
// itself, and the Pages workflow writes exercises/index.html.
export const EXERCISES_DIR = "exercises/";
export const exerciseSetUrl = (id) => `${EXERCISES_DIR}${id}.json`;
// A listing is untrusted: only this many sets are looked at.
export const MAX_LISTED_SETS = 200;

// localStorage: one key per exercise set, PROGRESS_PREFIX + set id (js/lab/progress.js).
export const PROGRESS_PREFIX = "sqllab.progress.";
export const PROGRESS_VERSION = 1;

// A listing shows at most this many characters of a file name that cannot be an id.
export const LISTED_NAME_MAX_CHARS = 80;

// Messages about exercise sets. They are worded for the instructor who edits the file;
// plain text, and the only untrusted text in them is an id that matched SHARE_ID_PATTERN. The
// one other place text from a listing is shown is the label of a file whose name did not match
// (setPickerBrokenLabel): the name, cut to LISTED_NAME_MAX_CHARS, set as text and as the option's
// value (compared with the picker's value, never used to look up or open a set). The problem
// shown with it is the constant below, with no part of the name in it.
export const setInvalidMessage = (id, problem) =>
    `The exercise set "${id}" (exercises/${id}.json) is not valid: ${problem}`;
export const setUnreachableMessage = (id) =>
    `The exercise set "${id}" (exercises/${id}.json) could not be loaded.`;
export const SET_BAD_ID_MESSAGE =
    "The exercise set name is not valid (1 to 64 letters, digits, \"_\" or \"-\").";
export const SET_NOT_JSON_MESSAGE = "it is not valid JSON.";
// the problem of a file in exercises/ whose name cannot be a set id; no request is made for it
export const SET_BAD_FILE_NAME_MESSAGE =
    'The file name may use only 1 to 64 letters, digits, "_" or "-" before ".json", so the file cannot be opened. Rename it.';
// route notices (js/lab/router.js); `id` is null when it did not match the id pattern
export const setNoticeMessage = (id, reason) =>
    (id ? `The exercise set "${id}"` : "The exercise set in the address") +
    ` could not be opened, so no exercises are shown. ${reason}`;
export const setDatasetMissingReason = (dataset) =>
    `It needs the database "${dataset}", which is not available on this site.`;
export const unknownExerciseMessage = (id) =>
    (id ? `There is no exercise "${id}" in this set` : "The exercise in the address is not in this set") +
    ", so none is selected.";

// Checker (js/lab/checker.js).
// Cells wider than this are cut in a diff.
export const DIFF_MAX_CELL_CHARS = 60;
// A diff shows at most this many rows, from the first one that differs.
export const DIFF_MAX_ROWS = 3;
export const checkColumnsMessage = (expected, got) =>
    `expected ${expected} ${expected === 1 ? "column" : "columns"}, got ${got}`;
export const checkColumnNameMessage = (position, expected, got) =>
    `column ${position} should be named "${expected}", but is named "${got}"`;
export const checkRowsMessage = (expected, got) =>
    `expected ${expected} ${expected === 1 ? "row" : "rows"}, got ${got}`;
export const checkRowMessage = (position, sorted) =>
    sorted
        ? `Rows are compared after sorting, and row ${position} is the first that differs.`
        : `Row ${position} is the first that differs.`;
// The two cannot-check messages never carry model-query text or engine text about it.
export const CHECK_BROKEN_MESSAGE =
    "This exercise cannot be checked right now. Please tell your instructor.";
// Shown when Check itself failed (a connection could not be opened), which a reload usually fixes.
export const CHECK_INTERNAL_MESSAGE =
    "Check could not run. Reload the page and try again. If it keeps happening, tell your instructor.";
export const CHECK_NO_DATASET_MESSAGE =
    "This exercise cannot be checked because its dataset is not open. Open the exercise set again to load it.";

// ---- F2/F7 exercise mode (the panel: js/lab/exercise-panel.js) ----

// The Exercises tab: the set picker (a menu button) and its menu.
export const SET_PICKER_LABEL = "Exercise set";
export const SET_PICKER_MENU_LABEL = "Exercise sets";
export const SET_PICKER_NONE = "None";
// a set that failed validation, or a file whose name is unusable: a disabled option naming its
// file, the problem as its title
export const setPickerBrokenLabel = (id) => `${id}.json (not valid)`;

// Panel texts.
export const EXERCISE_RESET_TEXT = "Reset progress";
export const EXERCISE_RESET_TITLE = "Forget which exercises of this set you have passed, and the SQL saved for them";
export const exerciseResetConfirm = (title) =>
    `Forget which exercises of "${title}" you have passed, and the SQL saved for them? This cannot be undone.`;
export const exerciseProgressText = (passed, total) => `${passed} of ${total} complete`;
export const exerciseListLabel = (title) => `Exercises in ${title}`;
export const exerciseButtonLabel = (position, total, title, passed) =>
    `Exercise ${position} of ${total}: ${title}, ${passed ? "passed" : "not passed"}`;
export const EXERCISE_PASSED_MARK = "✓";
export const exerciseHintText = (remaining) => `Show next hint (${remaining} left)`;
export const exerciseHintLabel = (position) => `Hint ${position}`;
// the name of the list of revealed hints; each hint also starts with a visually hidden "Hint N: "
export const EXERCISE_HINTS_LABEL = "Hints";
// after a pass: where to go next, or that the set is done
export const exerciseNextText = (position) => `Next: Exercise ${position}`;
export const exerciseAllCompleteText = (total) => `All ${total} exercises complete. Well done.`;
// spoken (polite live region) when the student moves to another exercise
export const exerciseAnnouncement = (position, total, title, prompt) =>
    `Exercise ${position} of ${total}: ${title}. ${prompt}`;

// Check.
export const CHECK_BUTTON_TEXT = "Check answer";
export const CHECK_BUTTON_TITLE = "⌃⇧↵ or ⌘⇧↵";
export const CHECK_EMPTY_MESSAGE = "Write a query first, then press Check.";
export const CHECK_PASS_HEADLINE = "Passed";
export const CHECK_PASS_MESSAGE = "Your result matches the expected result.";
export const CHECK_FAIL_HEADLINE = "Not passed yet";
export const CHECK_UNAVAILABLE_HEADLINE = "Cannot check";
export const CHECK_EXPECTED_LABEL = "Expected";
export const CHECK_GOT_LABEL = "Your result";
export const CHECK_ROW_HEADER = "Row";
// Under the Expected / Your result tables when they are wider than their box.
export const VERDICT_SCROLL_NOTE = "These tables are wider than the screen. Scroll sideways to see all the columns.";
// After the engine's message, when the visible run worked but the check on the original
// dataset failed: the student changed their working copy.
export const CHECK_COPY_NOTE =
    "Your query ran on your working copy of the dataset, but Check runs it on the original dataset.";
// Shown in the status line when the open dataset is not the set's (the panel cannot be
// opened over it) and when the set's dataset is not in the manifest.
export const setOpenFailedMessage = (id, reason) =>
    `The exercise set "${id}" could not be opened. ${reason}`;

// ---- F5 results (js/lab/results.js) ----

// The result table shows at most this many rows. The full result is kept for the CSV and
// for the checker, and every row count the page shows or announces is the full count.
export const ROW_LIMIT = 500;

// Counts as the page writes them: thousands separated ("12,400").
export const countText = (n) => Number(n).toLocaleString("en");
const rowsWord = (n) => (n === 1 ? "row" : "rows");

// The summary line above the table (UI plan, section 5): what the run returned and how long it
// took; js/lab/results.js puts the time ("3 ms", resultTimeText) in a span of its own after
// these. "5 rows in ", "Showing 500 of 12,400 rows in " when the table is cut at ROW_LIMIT (the
// count is always the full one), and for a run with no result set "Done in " or "Done. 3 rows
// changed in ".
export const resultRowsText = (total) => `${countText(total)} ${rowsWord(total)} in `;
export const resultCappedText = (shown, total) => `Showing ${countText(shown)} of ${countText(total)} rows in `;
export const resultDoneText = (changes) =>
    changes === null ? "Done in " : `Done. ${countText(changes)} ${rowsWord(changes)} changed in `;
export const resultTimeText = (ms) => `${ms} ms`;
// What the live region says for each outcome (section 6: "23 rows returned", the error heading).
export const resultRowsAnnouncement = (total) => `${countText(total)} ${rowsWord(total)} returned`;
export const resultCappedAnnouncement = (shown, total) =>
    `${countText(total)} rows returned. The first ${countText(shown)} are shown.`;
export const resultDoneAnnouncement = (changes) =>
    changes === null ? "Done." : `Done. ${countText(changes)} ${rowsWord(changes)} changed.`;
// "Running…" appears in the summary line once a run has taken this long (it cannot appear
// earlier without flashing on every quick query; css/result.css draws it on that delay).
export const RUNNING_TEXT = "Running…";

// The error band: SQLite's message as it is, then the failing statement quoted. "In statement 1"
// for a one-statement run (the mockup's wording), "In statement 2 of 3" otherwise. The quote is
// the statement without the comments in front of it, cut at this many characters.
export const ERROR_HEADING = "This query has an error";
export const errorAnnouncement = (message) => `${ERROR_HEADING}: ${message}`;
export const errorStatementText = (position, count) =>
    count > 1 ? `In statement ${position} of ${count}` : `In statement ${position}`;
export const STATEMENT_QUOTE_CHARS = 2000;
export const STATEMENT_ELLIPSIS = "…";

// The table (section 3): NULL in graphite italics, and a cell longer than CELL_MAX_CHARS cut
// with an ellipsis; pressing it shows the whole value in a popover.
export const NULL_TEXT = "NULL";
export const CELL_MAX_CHARS = 60;
export const CELL_MORE_HINT = "Shows the whole value.";
export const cellPopoverTitle = (column, row) => `${column}, row ${countText(row)}`;
export const cellPopoverLength = (length) => `${countText(length)} characters`;

// No result yet (section 5): a heading, a line that depends on how the page got here, and up to
// three sample queries from the manifest's "samples" (else the first table's first rows).
// Choosing a sample fills the editor; nothing runs.
export const EMPTY_TITLE = "Run a query to see its result here.";
export const EMPTY_SAMPLES_TEXT = "Or start from a sample. Choosing one fills the editor; nothing runs until you press Run.";
export const EMPTY_SAMPLES_LABEL = "Sample queries";
export const MAX_SAMPLES = 3;
// a sample's SQL in its button is cut here (the line shows less at any width; the button's name is
// what it shows, so this bounds what a screen reader reads)
export const SAMPLE_SQL_CHARS = 120;
// and its label here (a manifest's label is the instructor's text: a very long one would make a
// very tall button and a very long name)
export const SAMPLE_LABEL_CHARS = 60;
export const firstRowsSampleLabel = (table) => `First 10 rows of ${table}`;
export const EMPTY_EXERCISE_TEXT = "Write your answer in the editor, then press Check answer.";
export const EMPTY_DATABASE_TEXT =
    "This database has no tables yet. Create one with CREATE TABLE, or open another database from the database menu.";
export const EMPTY_FUNCTIONS_TEXT = "SQLite functions";
export const emptyAboutText = (appName) => `About ${appName}`;

// Loading a database (section 5): its name and size, with a progress bar.
export const loadingTitle = (name) => (name ? `Loading ${name}` : "Loading the database");
const loadedSize = (bytes) =>
    bytes >= 1_000_000 ? `${(bytes / 1_000_000).toFixed(1)} MB` : `${Math.round(bytes / 1000)} KB`;
export const loadingSizeText = (loaded, total) =>
    total ? `${loadedSize(loaded)} of ${loadedSize(total)}` : loaded ? loadedSize(loaded) : "";
// The toast once a database the student asked for is open (not the page's first one).
export const openedMessage = (name) => `Opened ${name}`;

// Toasts (js/lab/toast.js): how long one stays, in ms (a problem stays twice as long).
export const TOAST_MS = 4000;

// Download CSV: the button in the result's summary row (and the Export menu), the file and what
// a failure says.
export const CSV_BUTTON_TEXT = "Download CSV";
export const CSV_BUTTON_TITLE = "Download the whole result on screen as a CSV file";
export const CSV_FILE_SUFFIX = "-result.csv";
export const CSV_FAILED_MESSAGE = "The CSV file could not be saved.";

// ---- F6 run log (js/lab/run-log.js) ----

// localStorage: one key per log, RUN_LOG_PREFIX + the log key (js/lab/run-log.js logKey). The
// prefix is a storage namespace and, like PROGRESS_PREFIX, does not follow APP_NAME.
export const RUN_LOG_PREFIX = "sqllab.log.";
export const RUN_LOG_VERSION = 1;
// A log keeps its newest entries only.
export const RUN_LOG_MAX_ENTRIES = 200;
// ... and at most this much SQL and error text, counted in UTF-8 bytes (what the evidence file
// holds; characters would let 200 entries of 24,000 CJK characters, 14 MB of text and 33 MB of
// bytes, through). A log kept only in memory has no quota, and a file of 200 big entries would
// pass EVIDENCE_MAX_BYTES, which verify.html refuses. The links the exporter adds to an entry
// are at most 100,000 characters (SHARE_MAX_PAYLOAD_CHARS), so a file stays well under that limit.
export const RUN_LOG_MAX_BYTES = 5_000_000;
// The log key of anything that is not a built-in dataset is this prefix plus the database name.
export const RUN_LOG_FILE_PREFIX = "file:";

// Storage that cannot keep the run log or the exercise progress: js/lab/storage-notice.js
// shows one line while it is so. The event carries {what: "log" | "progress", ok: boolean}.
export const STORAGE_STATE_EVENT = "lab:storage-state";
export const STORAGE_NOTICE_LOG =
    "Your browser has no room left to keep your query history, so older queries may be missing from it. " +
    "Export your evidence before you close this page.";
export const STORAGE_NOTICE_PROGRESS =
    "Your browser has no room left to keep your exercise progress, so it will be lost when you close this page.";

// The History tab of the sidebar (js/lab/run-log.js).
export const HISTORY_LIST_LABEL = "Earlier queries, newest first. Times are UTC.";
export const HISTORY_EMPTY_MESSAGE = "Nothing yet. The queries you run will be listed here.";
export const HISTORY_RESTORED_MESSAGE = "An earlier query is in the editor. Press Run to execute it.";
export const HISTORY_ERROR_WORD = "Error";
// shown after the time of every entry (the log keeps UTC, whatever the clock on the wall says)
export const HISTORY_TIME_ZONE = "UTC";
// the start of the SQL shown on an entry's button, in characters
export const HISTORY_SQL_PREVIEW_CHARS = 80;
export const historyRowsText = (count) => `${count} ${count === 1 ? "row" : "rows"}`;

// ---- F11 evidence export (js/lab/evidence.js, evidence-dialog.js, verify-page.js) ----

// The student number typed at export time must match this. One constant, used by the dialog
// only: the verify page never applies it, so changing it does not invalidate older files.
export const STUDENT_ID_PATTERN = /^[A-Za-z0-9]{6,12}$/;
// The first line of a file is "<APP_NAME> evidence export v1".
export const EVIDENCE_TITLE_SUFFIX = "evidence export v1";
export const EVIDENCE_MIDDLE_DOT = "\u00b7";
// A line of SQL that looks like an entry header ("[4] 2026-11-09T13:58:12Z · 1 row") is written
// with this in front of it, so that the lines which look like headers in a file are the real
// ones and the verify page's query count cannot be inflated by the SQL.
export const EVIDENCE_SQL_ESCAPE = "\\";
// The verify page refuses a file larger than this.
export const EVIDENCE_MAX_BYTES = 20 * 1024 * 1024;

export const EVIDENCE_EMPTY_MESSAGE = "Nothing to export yet. Run a query first, then export your evidence.";
export const EVIDENCE_NO_CRYPTO_MESSAGE =
    "This page cannot make the checksum, because the browser withholds it on an address that is not secure. " +
    "Open the site over https.";
export const EVIDENCE_FAILED_MESSAGE = "The evidence file could not be saved.";
export const evidenceSavedMessage = (filename, count) =>
    `Exported ${filename} with ${count} ${count === 1 ? "query" : "queries"}`;
// The dialog explains itself in one sentence and names the file it will save (UI plan, section 5).
export const EVIDENCE_DIALOG_TITLE = "Export evidence";
export const EVIDENCE_DIALOG_TEXT = "Creates a text record of the queries you ran, to attach to your assessment.";
export const EVIDENCE_FILE_LABEL = "Saved as";
export const EVIDENCE_LABEL = "Student number";
export const EVIDENCE_HINT = "6 to 12 letters or digits, no spaces. It goes in the file and nowhere else.";
export const EVIDENCE_INVALID_MESSAGE =
    "That is not a valid student number. Use 6 to 12 letters or digits, with no spaces or punctuation.";
export const EVIDENCE_SUBMIT_TEXT = "Export";
export const EVIDENCE_CANCEL_TEXT = "Cancel";

// verify.html
export const VERIFY_VALID_WORD = "VALID";
export const VERIFY_EDITED_WORD = "EDITED";
export const VERIFY_TOO_LARGE_REASON = "The file is too large to be an evidence file (over 20 MB).";
export const VERIFY_NO_CRYPTO_MESSAGE =
    "This page cannot check files here, because the browser withholds the checksum function on an address " +
    "that is not secure. Open this page over https (or on localhost). No result was reached.";
export const VERIFY_READ_FAILED_REASON = "The file could not be read as text.";
// The file is a valid evidence file followed by nothing but line breaks. Still EDITED (any change
// to the file is reported), but it reads as a stray newline, not as tampering.
export const VERIFY_EXTRA_BLANK_LINES_REASON = "Extra blank lines were added after the checksum line.";
