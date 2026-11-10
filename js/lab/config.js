// App-wide constants. Everything here is safe to edit; nothing else in the
// shipped HTML, CSS or JS spells the app name.

// The app name. Change this one line to rename the app: js/lab/brand.js writes it
// into document.title and into every element that carries data-app-name.
export const APP_NAME = "SQL Lab";

// Shown (instead of the generic invitation) when SQL saved by an earlier session
// has been put back in the editor. Restored SQL is never run automatically.
export const RESTORED_MESSAGE = "Your last query is back in the editor. Press Run to execute it.";

// The prompt for "open url". Deliberately empty: never suggest a third-party address.
export const OPEN_URL_PROMPT = "Enter database file URL:";
export const OPEN_URL_DEFAULT = "";

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
export const LINK_COPIED_MESSAGE = "Link copied to the clipboard.";
export const LINK_COPY_FAILED_MESSAGE = "Could not copy automatically. Copy the link below.";
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

// Run while a database is still loading, and with no database at all.
export const LOADING_BUSY_MESSAGE =
    "A database is still loading, so nothing was run. Press Run again once it has opened.";
export const NO_DATABASE_MESSAGE = "No database is loaded.";

// F1 datasets. The manifest lists the built-in databases (js/lab/datasets.js validates it).
// Both paths are relative, so they resolve against the page and work under any subpath.
export const MANIFEST_URL = "datasets/manifest.json";
// The convenience alias: index.html?db=<dataset id> opens that dataset.
export const DATASET_PARAM = "db";
// Every .db file starts with these 16 bytes; a server that answers a missing file with an
// HTML page is caught by this check.
export const SQLITE_HEADER = "SQLite format 3\u0000";

// Toolbar text (the picker and the export button).
export const PICKER_LABEL = "Dataset";
export const PICKER_LOADING = "Loading datasets...";
export const EXPORT_BUTTON_TEXT = "export";
export const HELP_LABEL = "About this app";
export const EXPORT_BUTTON_TITLE = "Download the open database, with your changes, as a file";

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

// Messages about datasets (plain text; index.js escapes them, and some carry names from
// the manifest or the address). Manifest problems are worded for the instructor who
// edits datasets/manifest.json, because a student cannot fix them but can report them.
const MANIFEST_NAME = "datasets/manifest.json";
export const MANIFEST_UNREACHABLE_MESSAGE =
    `The list of datasets (${MANIFEST_NAME}) could not be loaded, so no dataset is open. ` +
    "You can still open a database file of your own, or reload the page to try again.";
export const manifestInvalidMessage = (problem) =>
    `The list of datasets (${MANIFEST_NAME}) is not valid: ${problem} ` +
    "No dataset is open. You can still open a database file of your own.";
export const datasetUnavailableMessage = (name) =>
    `The dataset "${name}" could not be loaded, so an empty database is open. ` +
    "You can still open a database file of your own, or reload the page to try again.";
export const datasetSwitchFailedMessage = (name) =>
    `The dataset "${name}" could not be loaded. The previous database is still open.`;
export const unknownDatasetMessage = (id) =>
    (id ? `There is no dataset "${id}" on this site` : "The dataset in the address is not available") +
    ", so the default dataset is open.";
export const LINK_NO_DATASET_MESSAGE =
    "This link does not name a dataset, so the default dataset is open.";
export const NOT_IN_LINK_MESSAGE =
    "This database is not built in, so the link will not include it. " +
    "Whoever opens the link gets the default dataset.";
// shown when no database is open (the very first start failed, e.g. an unsupported address)
export const PICKER_NONE_LABEL = "no database open";

// Export.
export const EXPORT_EMPTY_MESSAGE =
    "The database is empty, so there is nothing to export. Create a table first.";
export const EXPORT_FAILED_MESSAGE = "The database could not be exported.";
export const exportedMessage = (filename, size) =>
    `Saved ${filename} (${formatSize(size)}). It holds the database as it is now, with your changes.`;

function formatSize(bytes) {
    return bytes < 1024 ? `${bytes} bytes` : `${(bytes / 1024).toFixed(1)} KB`;
}

// Name of the exported file when the database has no usable name.
export const EXPORT_FALLBACK_NAME = "database";

// F4 schema sidebar (js/lab/schema.js). Messages are plain text; the sidebar builds its DOM
// with textContent, and names inside them come from the open database.
export const SCHEMA_TOGGLE_TEXT = "Schema";
export const SCHEMA_REGION_LABEL = "Database schema";
// the sidebar starts open when the viewport is at least this wide (the layout breakpoint
// of css/layout.css), closed on a phone; the state is kept per page load only
export const SCHEMA_OPEN_QUERY = "(min-width: 40rem)";
export const SCHEMA_EMPTY_MESSAGE =
    "No tables yet. Create one with CREATE TABLE and it will appear here.";
export const SCHEMA_ERROR_MESSAGE = "The tables of this database could not be listed.";
// shown instead of a row count or a column list that could not be read
export const SCHEMA_DASH = "–";
export const SCHEMA_VIEW_BADGE = "view";
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
    `It needs the dataset "${dataset}", which is not available on this site.`;
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

// Toolbar: the exercise set picker.
export const SET_PICKER_LABEL = "Exercises";
export const SET_PICKER_NONE = "None";
export const SET_PICKER_LOADING = "Loading exercises...";
// a set that failed validation, or a file whose name is unusable: a disabled option naming its
// file, the problem as its title
export const setPickerBrokenLabel = (id) => `${id}.json (not valid)`;

// Panel texts.
export const EXERCISE_RESET_TEXT = "Reset progress";
export const EXERCISE_RESET_TITLE = "Forget which exercises of this set you have passed, and the SQL saved for them";
export const exerciseResetConfirm = (title) =>
    `Forget which exercises of "${title}" you have passed, and the SQL saved for them? This cannot be undone.`;
export const exerciseProgressText = (passed, total) => `${passed}/${total} complete`;
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
export const CHECK_BUTTON_TEXT = "check";
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

// "5 rows, took 3 ms", "1 row, ...", or "showing 500 of 906 rows, took 3 ms" when capped.
export const resultStatusMessage = (total, shown, ms) =>
    total > shown
        ? `showing ${shown} of ${total} rows, took ${ms} ms`
        : `${total} ${total === 1 ? "row" : "rows"}, took ${ms} ms`;

// The failing statement is named after the engine's message, cut to about this many characters.
export const STATEMENT_PREVIEW_CHARS = 120;
export const STATEMENT_ELLIPSIS = "…";
// "no such column: pric (statement 2 of 3: SELECT pric FROM t;)". `statement` is the text,
// already on one line and cut; position and count are null for a failure that is not in a
// statement of the run.
export const failedStatementMessage = (message, position, count, statement) =>
    `${message} (${count > 1 ? `statement ${position} of ${count}` : "statement"}: ${statement})`;

// Download CSV: the button in the command bar, the file and what a failure says.
export const CSV_BUTTON_TEXT = "download csv";
export const CSV_BUTTON_TITLE = "Download the whole result on screen as a CSV file";
export const CSV_FILE_SUFFIX = "-result.csv";
export const CSV_FAILED_MESSAGE = "The CSV file could not be saved.";

// The custom property js/lab/command-bar-fit.js sets on the editor and css/editor.css reads: the
// height the editor leaves free at its bottom for the command bar.
export const COMMANDBAR_CLEARANCE_PROPERTY = "--commandbar-clearance";

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

// The history popup in the command bar.
export const HISTORY_BUTTON_TEXT = "history";
export const HISTORY_BUTTON_TITLE = "Put one of your earlier queries back in the editor";
export const HISTORY_LIST_LABEL = "Earlier queries, newest first. Times are UTC.";
export const HISTORY_EMPTY_MESSAGE = "Nothing yet. The queries you run will be listed here.";
export const HISTORY_RESTORED_MESSAGE = "An earlier query is in the editor. Press Run to execute it.";
export const HISTORY_ERROR_WORD = "error";
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

export const EVIDENCE_BUTTON_TEXT = "evidence";
export const EVIDENCE_BUTTON_TITLE = "Save your run log as a file to attach to your work";
export const EVIDENCE_EMPTY_MESSAGE = "Nothing to export yet. Run a query first, then export your evidence.";
export const EVIDENCE_NO_CRYPTO_MESSAGE =
    "This page cannot make the checksum, because the browser withholds it on an address that is not secure. " +
    "Open the site over https.";
export const EVIDENCE_FAILED_MESSAGE = "The evidence file could not be saved.";
export const evidenceSavedMessage = (filename, count) =>
    `Saved ${filename} with ${count} ${count === 1 ? "query" : "queries"}.`;
export const EVIDENCE_DIALOG_TITLE = "Export your evidence";
export const EVIDENCE_DIALOG_TEXT =
    "The file lists the queries you ran on this dataset, with your student number and a checksum, " +
    "so a marker can check it was not edited. Your number goes in the file only.";
export const EVIDENCE_LABEL = "Student number";
export const EVIDENCE_HINT = "6 to 12 letters or digits, no spaces.";
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

// js/lab/plain-text.js: what a line break becomes when text is pasted or dropped into a
// one-line field (the database name).
export const ONE_LINE_SEPARATOR = " ";
