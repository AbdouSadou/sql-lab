/* index.html's scripts in one file: js/lab/brand.js, js/components/sqlime-editor.js, js/components/sqlime-result.js, js/index.js and the modules they import (a few exported by name, for the tests), built from js/ by tools/build-app.mjs. Do not edit: change js/, then run npm run build:app. */
var __defProp = Object.defineProperty;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __esm = (fn, res, err) => function __init() {
  if (err) throw err[0];
  try {
    return fn && (res = (0, fn[__getOwnPropNames(fn)[0]])(fn = 0)), res;
  } catch (e) {
    throw err = [e], e;
  }
};
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};

// js/lab/config.js
var APP_NAME, RESTORED_MESSAGE, OPEN_URL_TITLE, OPEN_URL_INTRO, OPEN_URL_LABEL, OPEN_URL_HINT, OPEN_URL_SUBMIT_TEXT, OPEN_URL_CANCEL_TEXT, OPEN_URL_EMPTY_MESSAGE, OPEN_URL_UNSUPPORTED_MESSAGE, SHARE_PARAM, SHARE_VERSION, SHARE_ID_PATTERN, SHARE_MAX_PAYLOAD_CHARS, SHARE_MAX_JSON_CHARS, SHARE_MAX_SQL_CHARS, SHARED_MESSAGE, BAD_LINK_MESSAGE, LINK_COPIED_MESSAGE, LINK_COPY_FAILED_TITLE, LINK_COPY_FAILED_MESSAGE, LINK_FIELD_LABEL, LINK_TOO_LONG_MESSAGE, RESULT_SCROLL_NOTE, RESULT_REGION_LABEL, VACUUM_INTO_MESSAGE, SQL_NUL_MESSAGE, LOADING_BUSY_MESSAGE, NO_DATABASE_MESSAGE, loadFailedMessage, MANIFEST_URL, DATASET_PARAM, SQLITE_HEADER, DATABASE_MENU_LABEL, DATABASE_LOADING, DATABASE_NONE, databaseButtonLabel, OPEN_FILE_TEXT, OPEN_FILE_DESCRIPTION, OPEN_URL_TEXT, OPEN_URL_DESCRIPTION, databaseSizeText, EXPORT_MENU_LABEL, EXPORT_DATABASE_TEXT, EXPORT_BUTTON_TITLE, EXPORT_RESULTS_TEXT, EXPORT_RESULTS_DESCRIPTION, EXPORT_RESULTS_NONE, EXPORT_EVIDENCE_TEXT, EXPORT_EVIDENCE_DESCRIPTION, EXPORT_DIALOG_TITLE, EXPORT_DIALOG_TEXT, EXPORT_NAME_LABEL, EXPORT_NAME_HINT, EXPORT_SUBMIT_TEXT, EXPORT_CANCEL_TEXT, LAYOUT_STORAGE_KEY, SIDEBAR_WIDTH, SIDEBAR_HIDE_BELOW, EDITOR_SHARE, EDITOR_MIN_HEIGHT, RESULTS_MIN_HEIGHT, PROMPT_SHARE, PROMPT_MIN_HEIGHT, SPLITTER_STEP, sidebarWidthText, editorHeightText, DRAWER_QUERY, PHONE_QUERY, MORE_MENU_LABEL, MORE_EXPORT_LABEL, MORE_THEME_LABEL, MORE_COPY_LINK_TEXT, MORE_HELP_TEXT, TEXT_SIZE_STORAGE_KEY, TEXT_SIZES, TEXT_SIZE_DEFAULT, textSizeAnnouncement, TEXT_SIZE_SMALLEST, TEXT_SIZE_LARGEST, EDITOR_LABEL, EDITOR_PLACEHOLDER, EDITOR_HINT_ID, EDITOR_UPGRADE_WAIT_MS, COMPLETION_TABLE, COMPLETION_VIEW, COMPLETION_FUNCTION, COMPLETION_TYPE, completionsOpenedText, STATUS_NO_RUN, STATUS_RUN_FAILED, statusRowsText, statusTimeText, statusVersionText, THEME_STORAGE_KEY, THEME_BUTTON_TEXT, THEME_MENU_LABEL, THEME_OPTIONS, MANIFEST_NAME, MANIFEST_UNREACHABLE_MESSAGE, manifestInvalidMessage, datasetUnavailableMessage, datasetSwitchFailedMessage, unknownDatasetMessage, LINK_NO_DATASET_MESSAGE, NOT_IN_LINK_MESSAGE, EXPORT_EMPTY_MESSAGE, EXPORT_FAILED_MESSAGE, exportedMessage, EXPORT_FALLBACK_NAME, SCHEMA_TABLES_HEADING, SCHEMA_VIEWS_HEADING, SCHEMA_FILTER_FROM, SCHEMA_FILTER_LABEL, SCHEMA_NO_MATCH, SCHEMA_MORE_TEXT, SCHEMA_LESS_TEXT, SCHEMA_PRIMARY_KEY, schemaForeignKeyLabel, SCHEMA_EMPTY_MESSAGE, SCHEMA_ERROR_MESSAGE, SCHEMA_DASH, schemaExpandLabel, schemaInsertLabel, schemaInsertColumnLabel, schemaRowsWord, SCHEMA_COUNT_UNAVAILABLE, SCHEMA_COLUMNS_UNAVAILABLE, SET_PARAM, EXERCISE_PARAM, EXERCISES_DIR, exerciseSetUrl, MAX_LISTED_SETS, PROGRESS_PREFIX, PROGRESS_VERSION, LISTED_NAME_MAX_CHARS, setInvalidMessage, setUnreachableMessage, SET_BAD_ID_MESSAGE, SET_NOT_JSON_MESSAGE, SET_BAD_FILE_NAME_MESSAGE, setNoticeMessage, setDatasetMissingReason, unknownExerciseMessage, DIFF_MAX_CELL_CHARS, DIFF_MAX_ROWS, checkColumnsMessage, checkColumnNameMessage, checkRowsMessage, checkRowMessage, CHECK_BROKEN_MESSAGE, CHECK_INTERNAL_MESSAGE, CHECK_NO_DATASET_MESSAGE, SET_PICKER_LABEL, SET_PICKER_MENU_LABEL, SET_PICKER_NONE, setPickerBrokenLabel, EXERCISE_RESET_TEXT, EXERCISE_RESET_TITLE, exerciseResetConfirm, exerciseProgressText, exerciseListLabel, exerciseButtonLabel, exerciseHintText, exerciseHintLabel, EXERCISE_HINTS_LABEL, EXERCISE_PREVIOUS_TEXT, EXERCISE_NEXT_TEXT, EXERCISE_NAV_LABEL, exerciseTargetText, EXERCISE_FIRST_TEXT, EXERCISE_LAST_TEXT, NEXT_EXERCISE_TEXT, exerciseAllCompleteText, exerciseAnnouncement, CHECK_BUTTON_TEXT, CHECK_BUTTON_TITLE, CHECK_PASS_HEADLINE, checkPassMessage, CHECK_PASS_MESSAGE, CHECK_FAIL_HEADLINE, CHECK_UNAVAILABLE_HEADLINE, CHECK_EMPTY_HEADLINE, CHECK_EMPTY_MESSAGE, CHECK_EXPECTED_LABEL, CHECK_GOT_LABEL, CHECK_ROW_HEADER, CHECK_DIFFERS_TEXT, VERDICT_DIFF_NOTE, verdictHiddenDiffNote, CHECK_SQL_ERROR_BELOW, VERDICT_SCROLL_NOTE, CHECK_COPY_NOTE, setOpenFailedMessage, ROW_LIMIT, countText, rowsWord, resultRowsText, resultCappedText, resultDoneText, resultTimeText, resultRowsAnnouncement, resultCappedAnnouncement, resultDoneAnnouncement, RUNNING_TEXT, ERROR_HEADING, errorAnnouncement, errorStatementText, STATEMENT_QUOTE_CHARS, STATEMENT_ELLIPSIS, NULL_TEXT, CELL_MAX_CHARS, CELL_MORE_HINT, cellPopoverTitle, cellPopoverLength, EMPTY_TITLE, EMPTY_SAMPLES_TEXT, EMPTY_SAMPLES_LABEL, MAX_SAMPLES, SAMPLE_SQL_CHARS, SAMPLE_LABEL_CHARS, firstRowsSampleLabel, EMPTY_EXERCISE_TEXT, EMPTY_DATABASE_TEXT, EMPTY_FUNCTIONS_TEXT, emptyAboutText, loadingTitle, loadedSize, loadingSizeText, openedMessage, TOAST_MS, CSV_BUTTON_TEXT, CSV_BUTTON_TITLE, CSV_FILE_SUFFIX, CSV_FAILED_MESSAGE, RUN_LOG_PREFIX, RUN_LOG_VERSION, RUN_LOG_MAX_ENTRIES, RUN_LOG_MAX_BYTES, RUN_LOG_FILE_PREFIX, STORAGE_STATE_EVENT, STORAGE_NOTICE_LOG, STORAGE_NOTICE_PROGRESS, HISTORY_LIST_LABEL, HISTORY_EMPTY_MESSAGE, HISTORY_RESTORED_MESSAGE, HISTORY_ERROR_WORD, HISTORY_TIME_ZONE, HISTORY_SQL_PREVIEW_CHARS, historyRowsText, STUDENT_ID_PATTERN, EVIDENCE_TITLE_SUFFIX, EVIDENCE_MIDDLE_DOT, EVIDENCE_SQL_ESCAPE, EVIDENCE_MAX_BYTES, EVIDENCE_EMPTY_MESSAGE, EVIDENCE_NO_CRYPTO_MESSAGE, EVIDENCE_FAILED_MESSAGE, evidenceSavedMessage, EVIDENCE_DIALOG_TITLE, EVIDENCE_DIALOG_TEXT, EVIDENCE_FILE_LABEL, EVIDENCE_LABEL, EVIDENCE_HINT, EVIDENCE_INVALID_MESSAGE, EVIDENCE_SUBMIT_TEXT, EVIDENCE_CANCEL_TEXT;
var init_config = __esm({
  "js/lab/config.js"() {
    APP_NAME = "SQL Lab";
    RESTORED_MESSAGE = "Your last query is back in the editor. Press Run to execute it.";
    OPEN_URL_TITLE = "Open from URL";
    OPEN_URL_INTRO = "Opens a SQLite database, or a .sql script, from an address on the web.";
    OPEN_URL_LABEL = "Address";
    OPEN_URL_HINT = "It starts with https://, or is a path on this site. The site that holds the file must let other sites read it.";
    OPEN_URL_SUBMIT_TEXT = "Open";
    OPEN_URL_CANCEL_TEXT = "Cancel";
    OPEN_URL_EMPTY_MESSAGE = "Enter the address of a database file.";
    OPEN_URL_UNSUPPORTED_MESSAGE = "This address cannot be opened. Use one that starts with https:// or http://, or a path on this site.";
    SHARE_PARAM = "s";
    SHARE_VERSION = 1;
    SHARE_ID_PATTERN = /^[A-Za-z0-9_-]{1,64}$/;
    SHARE_MAX_PAYLOAD_CHARS = 1e5;
    SHARE_MAX_JSON_CHARS = 4e5;
    SHARE_MAX_SQL_CHARS = 2e5;
    SHARED_MESSAGE = "A shared query is in the editor. Press Run to execute it.";
    BAD_LINK_MESSAGE = "This link is damaged or incomplete, so its query could not be opened. Ask the sender for a new link.";
    LINK_COPIED_MESSAGE = "Link copied";
    LINK_COPY_FAILED_TITLE = "Copy this link";
    LINK_COPY_FAILED_MESSAGE = "The browser did not let the page copy it. Press Ctrl+C (⌘C on a Mac) to copy the link below.";
    LINK_FIELD_LABEL = "Link to this query";
    LINK_TOO_LONG_MESSAGE = "This query is too long to put in a link. Shorten it, or send the text itself.";
    RESULT_SCROLL_NOTE = "This result is wider than the screen. Scroll sideways to see the other columns.";
    RESULT_REGION_LABEL = "Query result";
    VACUUM_INTO_MESSAGE = "VACUUM INTO a file is not available here, because files cannot be saved from the browser. Use the export button to save the database.";
    SQL_NUL_MESSAGE = "The SQL contains a NUL character (U+0000), which SQLite does not accept in a statement, so nothing was run. Remove it and run again (pasting from a document or a web page is the usual way it gets in).";
    LOADING_BUSY_MESSAGE = "A database is still loading, so nothing was run. Press Run again once it has opened.";
    NO_DATABASE_MESSAGE = "No database is loaded.";
    loadFailedMessage = (path, reason) => reason ? `Failed to load database from ${path}: ${reason}` : `Failed to load database from ${path}`;
    MANIFEST_URL = "datasets/manifest.json";
    DATASET_PARAM = "db";
    SQLITE_HEADER = "SQLite format 3\0";
    DATABASE_MENU_LABEL = "Databases";
    DATABASE_LOADING = "Loading…";
    DATABASE_NONE = "No database open";
    databaseButtonLabel = (name) => `Database: ${name}`;
    OPEN_FILE_TEXT = "Open a file…";
    OPEN_FILE_DESCRIPTION = "A SQLite database or a .sql script from this device";
    OPEN_URL_TEXT = "Open from URL…";
    OPEN_URL_DESCRIPTION = "A database file on the web";
    databaseSizeText = (bytes) => bytes >= 1e6 ? `${(bytes / 1e6).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1e3))} KB`;
    EXPORT_MENU_LABEL = "Export";
    EXPORT_DATABASE_TEXT = "Database (.db)…";
    EXPORT_BUTTON_TITLE = "Download the open database, with your changes, as a file";
    EXPORT_RESULTS_TEXT = "Results (.csv)";
    EXPORT_RESULTS_DESCRIPTION = "The whole result on screen, for a spreadsheet";
    EXPORT_RESULTS_NONE = "Run a query that returns rows first";
    EXPORT_EVIDENCE_TEXT = "Evidence (.txt)…";
    EXPORT_EVIDENCE_DESCRIPTION = "A text record of the queries you ran, for your assessment";
    EXPORT_DIALOG_TITLE = "Export the database";
    EXPORT_DIALOG_TEXT = "Saves the open database, with your changes, as a file on this device.";
    EXPORT_NAME_LABEL = "File name";
    EXPORT_NAME_HINT = "This also renames the database here: the page title and the CSV file take the new name.";
    EXPORT_SUBMIT_TEXT = "Export";
    EXPORT_CANCEL_TEXT = "Cancel";
    LAYOUT_STORAGE_KEY = "sqllab.layout";
    SIDEBAR_WIDTH = { initial: 280, min: 220, max: 420 };
    SIDEBAR_HIDE_BELOW = 160;
    EDITOR_SHARE = 0.4;
    EDITOR_MIN_HEIGHT = 120;
    RESULTS_MIN_HEIGHT = 96;
    PROMPT_SHARE = 0.4;
    PROMPT_MIN_HEIGHT = 72;
    SPLITTER_STEP = 16;
    sidebarWidthText = (width) => width ? `${width} pixels wide` : "hidden";
    editorHeightText = (height) => `${height} pixels high`;
    DRAWER_QUERY = "(max-width: 1099.98px), (max-height: 499.98px) and (pointer: coarse)";
    PHONE_QUERY = "(max-width: 699.98px), (max-height: 499.98px) and (pointer: coarse)";
    MORE_MENU_LABEL = "More actions";
    MORE_EXPORT_LABEL = "Export";
    MORE_THEME_LABEL = "Theme";
    MORE_COPY_LINK_TEXT = "Copy link";
    MORE_HELP_TEXT = "Help";
    TEXT_SIZE_STORAGE_KEY = "sqllab.textSize";
    TEXT_SIZES = [12, 14, 16, 18, 20, 22, 24];
    TEXT_SIZE_DEFAULT = 14;
    textSizeAnnouncement = (size) => `Text size ${size} pixels`;
    TEXT_SIZE_SMALLEST = "The text is at its smallest";
    TEXT_SIZE_LARGEST = "The text is at its largest";
    EDITOR_LABEL = "SQL query";
    EDITOR_PLACEHOLDER = "Write SQL here, then press Run.";
    EDITOR_HINT_ID = "editor-hint";
    EDITOR_UPGRADE_WAIT_MS = 3e3;
    COMPLETION_TABLE = "table";
    COMPLETION_VIEW = "view";
    COMPLETION_FUNCTION = "function";
    COMPLETION_TYPE = "type";
    completionsOpenedText = (count) => `${count} ${count === 1 ? "suggestion" : "suggestions"}. Press the down arrow to pick one, then Enter.`;
    STATUS_NO_RUN = "No query run yet";
    STATUS_RUN_FAILED = "Last run failed";
    statusRowsText = (rows3) => `${rows3.toLocaleString("en")} ${rows3 === 1 ? "row" : "rows"} in `;
    statusTimeText = (ms) => `${ms} ms`;
    statusVersionText = (version) => `SQLite ${version}`;
    THEME_STORAGE_KEY = "sqllab.theme";
    THEME_BUTTON_TEXT = "Theme";
    THEME_MENU_LABEL = "Theme";
    THEME_OPTIONS = [
      { value: "light", label: "Light" },
      { value: "dark", label: "Dark" },
      { value: "device", label: "Match device" }
    ];
    MANIFEST_NAME = "datasets/manifest.json";
    MANIFEST_UNREACHABLE_MESSAGE = `The list of course databases (${MANIFEST_NAME}) could not be loaded, so an empty database is open. You can still open a database file of your own, or reload the page to try again.`;
    manifestInvalidMessage = (problem) => `The list of course databases (${MANIFEST_NAME}) is not valid: ${problem} An empty database is open. You can still open a database file of your own.`;
    datasetUnavailableMessage = (name) => `The database "${name}" could not be loaded, so an empty database is open. You can still open a database file of your own, or reload the page to try again.`;
    datasetSwitchFailedMessage = (name) => `The database "${name}" could not be loaded. The previous database is still open.`;
    unknownDatasetMessage = (id) => (id ? `There is no database "${id}" on this site` : "The database in the address is not available") + ", so the default database is open.";
    LINK_NO_DATASET_MESSAGE = "This link does not name a database, so the default database is open.";
    NOT_IN_LINK_MESSAGE = "This database is not one of the course databases, so the link cannot include it: whoever opens the link gets the default database.";
    EXPORT_EMPTY_MESSAGE = "The database is empty, so there is nothing to export. Create a table first.";
    EXPORT_FAILED_MESSAGE = "The database could not be exported.";
    exportedMessage = (filename) => `Exported ${filename}`;
    EXPORT_FALLBACK_NAME = "database";
    SCHEMA_TABLES_HEADING = "Tables";
    SCHEMA_VIEWS_HEADING = "Views";
    SCHEMA_FILTER_FROM = 8;
    SCHEMA_FILTER_LABEL = "Filter tables and views";
    SCHEMA_NO_MATCH = "No table or view matches.";
    SCHEMA_MORE_TEXT = "Show more";
    SCHEMA_LESS_TEXT = "Show less";
    SCHEMA_PRIMARY_KEY = "Primary key";
    schemaForeignKeyLabel = (table) => `Foreign key to ${table}`;
    SCHEMA_EMPTY_MESSAGE = "No tables yet. Create one with CREATE TABLE and it will appear here.";
    SCHEMA_ERROR_MESSAGE = "The tables of this database could not be listed.";
    SCHEMA_DASH = "–";
    schemaExpandLabel = (kind, name) => `Columns of ${kind} ${name}`;
    schemaInsertLabel = (kind, name) => `Insert ${kind} name ${name} into the query`;
    schemaInsertColumnLabel = (table, name) => `Insert column name ${name} of ${table} into the query`;
    schemaRowsWord = (count) => count === "1" ? "row" : "rows";
    SCHEMA_COUNT_UNAVAILABLE = "row count unavailable";
    SCHEMA_COLUMNS_UNAVAILABLE = "columns unavailable";
    SET_PARAM = "set";
    EXERCISE_PARAM = "ex";
    EXERCISES_DIR = "exercises/";
    exerciseSetUrl = (id) => `${EXERCISES_DIR}${id}.json`;
    MAX_LISTED_SETS = 200;
    PROGRESS_PREFIX = "sqllab.progress.";
    PROGRESS_VERSION = 1;
    LISTED_NAME_MAX_CHARS = 80;
    setInvalidMessage = (id, problem) => `The exercise set "${id}" (exercises/${id}.json) is not valid: ${problem}`;
    setUnreachableMessage = (id) => `The exercise set "${id}" (exercises/${id}.json) could not be loaded.`;
    SET_BAD_ID_MESSAGE = 'The exercise set name is not valid (1 to 64 letters, digits, "_" or "-").';
    SET_NOT_JSON_MESSAGE = "it is not valid JSON.";
    SET_BAD_FILE_NAME_MESSAGE = 'The file name may use only 1 to 64 letters, digits, "_" or "-" before ".json", so the file cannot be opened. Rename it.';
    setNoticeMessage = (id, reason) => (id ? `The exercise set "${id}"` : "The exercise set in the address") + ` could not be opened, so no exercises are shown. ${reason}`;
    setDatasetMissingReason = (dataset) => `It needs the database "${dataset}", which is not available on this site.`;
    unknownExerciseMessage = (id) => (id ? `There is no exercise "${id}" in this set` : "The exercise in the address is not in this set") + ", so none is selected.";
    DIFF_MAX_CELL_CHARS = 60;
    DIFF_MAX_ROWS = 3;
    checkColumnsMessage = (expected, got) => `expected ${expected} ${expected === 1 ? "column" : "columns"}, got ${got}`;
    checkColumnNameMessage = (position, expected, got) => `column ${position} should be named "${expected}", but is named "${got}"`;
    checkRowsMessage = (expected, got) => `expected ${expected} ${expected === 1 ? "row" : "rows"}, got ${got}`;
    checkRowMessage = (position, sorted) => sorted ? `Rows are compared after sorting, and row ${position} is the first that differs.` : `Row ${position} is the first that differs.`;
    CHECK_BROKEN_MESSAGE = "This exercise cannot be checked right now. Please tell your instructor.";
    CHECK_INTERNAL_MESSAGE = "Check could not run. Reload the page and try again. If it keeps happening, tell your instructor.";
    CHECK_NO_DATASET_MESSAGE = "This exercise cannot be checked because its dataset is not open. Open the exercise set again to load it.";
    SET_PICKER_LABEL = "Exercise set";
    SET_PICKER_MENU_LABEL = "Exercise sets";
    SET_PICKER_NONE = "None";
    setPickerBrokenLabel = (id) => `${id}.json (not valid)`;
    EXERCISE_RESET_TEXT = "Reset progress";
    EXERCISE_RESET_TITLE = "Forget which exercises of this set you have passed, and the SQL saved for them";
    exerciseResetConfirm = (title) => `Forget which exercises of "${title}" you have passed, and the SQL saved for them? This cannot be undone.`;
    exerciseProgressText = (passed, total) => `${passed} of ${total} complete`;
    exerciseListLabel = (title) => `Exercises in ${title}`;
    exerciseButtonLabel = (position, total, title, passed) => `Exercise ${position} of ${total}: ${title}, ${passed ? "passed" : "not passed"}`;
    exerciseHintText = (next, total) => `Show hint (${next} of ${total})`;
    exerciseHintLabel = (position) => `Hint ${position}`;
    EXERCISE_HINTS_LABEL = "Hints";
    EXERCISE_PREVIOUS_TEXT = "Previous";
    EXERCISE_NEXT_TEXT = "Next";
    EXERCISE_NAV_LABEL = "Move between exercises";
    exerciseTargetText = (position, total, title) => `Exercise ${position} of ${total}: ${title}`;
    EXERCISE_FIRST_TEXT = "This is the first exercise of the set.";
    EXERCISE_LAST_TEXT = "This is the last exercise of the set.";
    NEXT_EXERCISE_TEXT = "Next exercise";
    exerciseAllCompleteText = (total) => total === 1 ? "The set is complete. Well done." : `All ${total} exercises complete. Well done.`;
    exerciseAnnouncement = (position, total, title, prompt) => `Exercise ${position} of ${total}: ${title}. ${prompt}`;
    CHECK_BUTTON_TEXT = "Check answer";
    CHECK_BUTTON_TITLE = "⌃⇧↵ or ⌘⇧↵";
    CHECK_PASS_HEADLINE = "Correct.";
    checkPassMessage = (rows3) => rows3 === 0 ? "No rows, as expected." : `${countText(rows3)} ${rows3 === 1 ? "row matches" : "rows match"}.`;
    CHECK_PASS_MESSAGE = "Your result matches the expected result.";
    CHECK_FAIL_HEADLINE = "Not quite.";
    CHECK_UNAVAILABLE_HEADLINE = "Not checked.";
    CHECK_EMPTY_HEADLINE = "Nothing to check.";
    CHECK_EMPTY_MESSAGE = "Write a query first, then press Check answer.";
    CHECK_EXPECTED_LABEL = "Expected";
    CHECK_GOT_LABEL = "Yours";
    CHECK_ROW_HEADER = "Row";
    CHECK_DIFFERS_TEXT = " (differs)";
    VERDICT_DIFF_NOTE = "Outlined cells differ from the expected result.";
    verdictHiddenDiffNote = (position) => `Row ${position} differs from the expected row in something the table cannot show, such as the end of a long value, or a value of another type: text, a number or NULL.`;
    CHECK_SQL_ERROR_BELOW = "This query has an error, shown below.";
    VERDICT_SCROLL_NOTE = "These tables are wider than the screen. Scroll sideways to see all the columns.";
    CHECK_COPY_NOTE = "Your query ran on your working copy of the dataset, but Check runs it on the original dataset.";
    setOpenFailedMessage = (id, reason) => `The exercise set "${id}" could not be opened. ${reason}`;
    ROW_LIMIT = 500;
    countText = (n) => Number(n).toLocaleString("en");
    rowsWord = (n) => n === 1 ? "row" : "rows";
    resultRowsText = (total) => `${countText(total)} ${rowsWord(total)} in `;
    resultCappedText = (shown, total) => `Showing ${countText(shown)} of ${countText(total)} rows in `;
    resultDoneText = (changes) => changes === null ? "Done in " : `Done. ${countText(changes)} ${rowsWord(changes)} changed in `;
    resultTimeText = (ms) => `${ms} ms`;
    resultRowsAnnouncement = (total) => `${countText(total)} ${rowsWord(total)} returned`;
    resultCappedAnnouncement = (shown, total) => `${countText(total)} rows returned. The first ${countText(shown)} are shown.`;
    resultDoneAnnouncement = (changes) => changes === null ? "Done." : `Done. ${countText(changes)} ${rowsWord(changes)} changed.`;
    RUNNING_TEXT = "Running…";
    ERROR_HEADING = "This query has an error";
    errorAnnouncement = (message) => `${ERROR_HEADING}: ${message}`;
    errorStatementText = (position, count) => count > 1 ? `In statement ${position} of ${count}` : `In statement ${position}`;
    STATEMENT_QUOTE_CHARS = 2e3;
    STATEMENT_ELLIPSIS = "…";
    NULL_TEXT = "NULL";
    CELL_MAX_CHARS = 60;
    CELL_MORE_HINT = "Shows the whole value.";
    cellPopoverTitle = (column, row) => `${column}, row ${countText(row)}`;
    cellPopoverLength = (length) => `${countText(length)} characters`;
    EMPTY_TITLE = "Run a query to see its result here.";
    EMPTY_SAMPLES_TEXT = "Or start from a sample. Choosing one fills the editor; nothing runs until you press Run.";
    EMPTY_SAMPLES_LABEL = "Sample queries";
    MAX_SAMPLES = 3;
    SAMPLE_SQL_CHARS = 120;
    SAMPLE_LABEL_CHARS = 60;
    firstRowsSampleLabel = (table) => `First 10 rows of ${table}`;
    EMPTY_EXERCISE_TEXT = "Write your answer in the editor, then press Check answer.";
    EMPTY_DATABASE_TEXT = "This database has no tables yet. Create one with CREATE TABLE, or open another database from the database menu.";
    EMPTY_FUNCTIONS_TEXT = "SQLite functions";
    emptyAboutText = (appName) => `About ${appName}`;
    loadingTitle = (name) => name ? `Loading ${name}` : "Loading the database";
    loadedSize = (bytes) => bytes >= 1e6 ? `${(bytes / 1e6).toFixed(1)} MB` : `${Math.round(bytes / 1e3)} KB`;
    loadingSizeText = (loaded2, total) => total ? `${loadedSize(loaded2)} of ${loadedSize(total)}` : loaded2 ? loadedSize(loaded2) : "";
    openedMessage = (name) => `Opened ${name}`;
    TOAST_MS = 4e3;
    CSV_BUTTON_TEXT = "Download CSV";
    CSV_BUTTON_TITLE = "Download the whole result on screen as a CSV file";
    CSV_FILE_SUFFIX = "-result.csv";
    CSV_FAILED_MESSAGE = "The CSV file could not be saved.";
    RUN_LOG_PREFIX = "sqllab.log.";
    RUN_LOG_VERSION = 1;
    RUN_LOG_MAX_ENTRIES = 200;
    RUN_LOG_MAX_BYTES = 5e6;
    RUN_LOG_FILE_PREFIX = "file:";
    STORAGE_STATE_EVENT = "lab:storage-state";
    STORAGE_NOTICE_LOG = "Your browser has no room left to keep your query history, so older queries may be missing from it. Export your evidence before you close this page.";
    STORAGE_NOTICE_PROGRESS = "Your browser has no room left to keep your exercise progress, so it will be lost when you close this page.";
    HISTORY_LIST_LABEL = "Earlier queries, newest first. Times are UTC.";
    HISTORY_EMPTY_MESSAGE = "Nothing yet. The queries you run will be listed here.";
    HISTORY_RESTORED_MESSAGE = "An earlier query is in the editor. Press Run to execute it.";
    HISTORY_ERROR_WORD = "Error";
    HISTORY_TIME_ZONE = "UTC";
    HISTORY_SQL_PREVIEW_CHARS = 80;
    historyRowsText = (count) => `${count} ${count === 1 ? "row" : "rows"}`;
    STUDENT_ID_PATTERN = /^[A-Za-z0-9]{6,12}$/;
    EVIDENCE_TITLE_SUFFIX = "evidence export v1";
    EVIDENCE_MIDDLE_DOT = "·";
    EVIDENCE_SQL_ESCAPE = "\\";
    EVIDENCE_MAX_BYTES = 20 * 1024 * 1024;
    EVIDENCE_EMPTY_MESSAGE = "Nothing to export yet. Run a query first, then export your evidence.";
    EVIDENCE_NO_CRYPTO_MESSAGE = "This page cannot make the checksum, because the browser withholds it on an address that is not secure. Open the site over https.";
    EVIDENCE_FAILED_MESSAGE = "The evidence file could not be saved.";
    evidenceSavedMessage = (filename, count) => `Exported ${filename} with ${count} ${count === 1 ? "query" : "queries"}`;
    EVIDENCE_DIALOG_TITLE = "Export evidence";
    EVIDENCE_DIALOG_TEXT = "Creates a text record of the queries you ran, to attach to your assessment.";
    EVIDENCE_FILE_LABEL = "Saved as";
    EVIDENCE_LABEL = "Student number";
    EVIDENCE_HINT = "6 to 12 letters or digits, no spaces. It goes in the file and nowhere else.";
    EVIDENCE_INVALID_MESSAGE = "That is not a valid student number. Use 6 to 12 letters or digits, with no spaces or punctuation.";
    EVIDENCE_SUBMIT_TEXT = "Export";
    EVIDENCE_CANCEL_TEXT = "Cancel";
  }
});

// js/lab/editor-keys.js
function leavesEditor(editor, event) {
  if (MODIFIERS.has(event.key)) {
    return false;
  }
  if (event.key === "Escape") {
    armed.add(editor);
    return false;
  }
  if (event.key === "Tab" && armed.has(editor)) {
    armed.delete(editor);
    return true;
  }
  armed.delete(editor);
  return false;
}
function cancelLeave(editor) {
  armed.delete(editor);
}
var MODIFIERS, armed;
var init_editor_keys = __esm({
  "js/lab/editor-keys.js"() {
    MODIFIERS = /* @__PURE__ */ new Set(["Shift", "Control", "Alt", "Meta"]);
    armed = /* @__PURE__ */ new WeakSet();
  }
});

// js/sqlite/db.js
var DEFAULT_NAME, QUERIES, SQLite;
var init_db = __esm({
  "js/sqlite/db.js"() {
    DEFAULT_NAME = "new.db";
    QUERIES = {
      tables: `select name as "table" from sqlite_schema
      where type = 'table'
        and name not like 'sqlite_%'`,
      tableContent: "select * from {} limit 10",
      tableInfo: `select
      iif(pk=1, '✓', '') as pk, name, type, iif("notnull"=0, '✓', '') as "null?"
      from pragma_table_info('{}')`
    };
    SQLite = class {
      constructor(name, path, capi, db, query = "") {
        this.name = name || DEFAULT_NAME;
        this.path = path;
        this.capi = capi;
        this.db = db;
        this.query = query;
        this.tables = [];
      }
      // execute runs one ore more sql queries
      // and returns the last result.
      execute(sql) {
        if (!sql) {
          return null;
        }
        this.query = sql;
        let rows3 = [];
        this.db.exec({
          sql,
          rowMode: "object",
          resultRows: rows3
        });
        if (!rows3.length) {
          return null;
        }
        const result = {
          columns: Object.getOwnPropertyNames(rows3[0]),
          values: []
        };
        for (let row of rows3) {
          result.values.push(Object.values(row));
        }
        return result;
      }
      // gatherTables fills the `.tables` attribute
      // with an array of database tables and returns it.
      gatherTables() {
        let rows3 = [];
        this.db.exec({
          sql: QUERIES.tables,
          rowMode: "array",
          resultRows: rows3
        });
        if (!rows3.length) {
          this.tables = [];
          return this.tables;
        }
        this.tables = rows3.map((row) => row[0]);
        return this.tables;
      }
      // getTableInfo returns the table schema.
      getTableInfo(table) {
        const sql = QUERIES.tableInfo.replace("{}", table);
        return this.execute(sql);
      }
      // meaningfulName returns the database name
      // if it differs from default one.
      get meaningfulName() {
        if (this.name == DEFAULT_NAME) {
          return "";
        }
        return this.name;
      }
    };
  }
});

// js/lab/sql.js
function quoteIdent(name) {
  return `"${String(name).replaceAll('"', '""')}"`;
}
function needsQuoting(name) {
  const text = String(name);
  return !PLAIN_IDENTIFIER.test(text) || SQL_KEYWORDS.has(text.toUpperCase());
}
function identifierForSql(name) {
  return needsQuoting(name) ? quoteIdent(name) : String(name);
}
function countRowsSql(name) {
  return `SELECT COUNT(*) FROM ${quoteIdent(name)}`;
}
function pragmaTableInfoSql(name) {
  return `PRAGMA table_info(${quoteIdent(name)})`;
}
function pragmaForeignKeyListSql(name) {
  return `PRAGMA foreign_key_list(${quoteIdent(name)})`;
}
var SQL_KEYWORDS, PLAIN_IDENTIFIER, SCHEMA_OBJECTS_SQL;
var init_sql = __esm({
  "js/lab/sql.js"() {
    init_db();
    SQL_KEYWORDS = new Set(
      "ABORT ACTION ADD AFTER ALL ALTER ALWAYS ANALYZE AND AS ASC ATTACH AUTOINCREMENT BEFORE BEGIN BETWEEN BY CASCADE CASE CAST CHECK COLLATE COLUMN COMMIT CONFLICT CONSTRAINT CREATE CROSS CURRENT CURRENT_DATE CURRENT_TIME CURRENT_TIMESTAMP DATABASE DEFAULT DEFERRABLE DEFERRED DELETE DESC DETACH DISTINCT DO DROP EACH ELSE END ESCAPE EXCEPT EXCLUDE EXCLUSIVE EXISTS EXPLAIN FAIL FALSE FILTER FIRST FOLLOWING FOR FOREIGN FROM FULL GENERATED GLOB GROUP GROUPS HAVING IF IGNORE IMMEDIATE IN INDEX INDEXED INITIALLY INNER INSERT INSTEAD INTERSECT INTO IS ISNULL JOIN KEY LAST LEFT LIKE LIMIT MATCH MATERIALIZED NATURAL NO NOT NOTHING NOTNULL NULL NULLS OF OFFSET ON OR ORDER OTHERS OUTER OVER PARTITION PLAN PRAGMA PRECEDING PRIMARY QUERY RAISE RANGE RECURSIVE REFERENCES REGEXP REINDEX RELEASE RENAME REPLACE RESTRICT RETURNING RIGHT ROLLBACK ROW ROWS SAVEPOINT SELECT SET TABLE TEMP TEMPORARY THEN TIES TO TRANSACTION TRIGGER TRUE UNBOUNDED UNION UNIQUE UPDATE USING VACUUM VALUES VIEW VIRTUAL WHEN WHERE WINDOW WITH WITHOUT".split(" ")
    );
    PLAIN_IDENTIFIER = /^[A-Za-z_][A-Za-z0-9_]*$/;
    SCHEMA_OBJECTS_SQL = "SELECT type, name FROM sqlite_master WHERE type IN ('table', 'view') AND name NOT LIKE 'sqlite\\_%' ESCAPE '\\' ORDER BY type, name COLLATE NOCASE";
  }
});

// js/lab/sqlite-words.js
var SQLITE_KEYWORDS, SQLITE_FUNCTIONS;
var init_sqlite_words = __esm({
  "js/lab/sqlite-words.js"() {
    SQLITE_KEYWORDS = [
      "abort action add after all alter always analyze and as asc attach autoincrement",
      "before begin between by cascade case cast check collate column commit conflict constraint",
      "create cross current current_date current_time current_timestamp database default",
      "deferrable deferred delete desc detach distinct do drop each else end escape except exclude",
      "exclusive exists explain fail filter first following for foreign from full generated glob",
      "group groups having if ignore immediate in index indexed initially inner insert instead",
      "intersect into is isnull join key last left like limit match materialized natural no not",
      "nothing notnull null nulls of offset on or order others outer over partition plan pragma",
      "preceding primary query raise range recursive references regexp reindex release rename",
      "replace restrict returning right rollback row rows savepoint select set table temp temporary",
      "then ties to transaction trigger unbounded union unique update using vacuum values view",
      "virtual when where window with without"
    ].join(" ");
    SQLITE_FUNCTIONS = [
      // core
      "abs changes char coalesce concat concat_ws format hex ifnull iif instr last_insert_rowid",
      "length likelihood likely load_extension lower ltrim max min nullif octet_length printf quote",
      "random randomblob round rtrim sign soundex sqlite_compileoption_get",
      "sqlite_compileoption_used sqlite_offset sqlite_source_id sqlite_version substr substring",
      "total_changes trim typeof unhex unicode unlikely upper zeroblob",
      // aggregate
      "avg count group_concat string_agg sum total",
      // window
      "row_number rank dense_rank percent_rank cume_dist ntile lag lead first_value last_value nth_value",
      // date and time
      "date time datetime julianday unixepoch strftime timediff",
      // math
      "acos acosh asin asinh atan atan2 atanh ceil ceiling cos cosh degrees exp floor ln log log10",
      "log2 mod pi pow power radians sin sinh sqrt tan tanh trunc",
      // JSON
      "json jsonb json_array jsonb_array json_array_length json_error_position json_extract",
      "jsonb_extract json_insert jsonb_insert json_object jsonb_object json_patch jsonb_patch",
      "json_pretty json_remove jsonb_remove json_replace jsonb_replace json_set jsonb_set json_type",
      "json_valid json_quote json_group_array jsonb_group_array json_group_object",
      "jsonb_group_object json_each json_tree"
    ].join(" ");
  }
});

// js/lab/code-editor.js
var code_editor_exports = {};
__export(code_editor_exports, {
  createCodeEditor: () => createCodeEditor
});
function carriesFiles(dataTransfer) {
  if (!dataTransfer) {
    return false;
  }
  return Array.from(dataTransfer.types || []).includes("Files") || dataTransfer.files && dataTransfer.files.length > 0;
}
function nameOption(name, type, detail, boost) {
  const option = { label: name, type, boost };
  if (detail) {
    option.detail = detail;
  }
  const sql = identifierForSql(name);
  if (sql !== name) {
    option.apply = sql;
  }
  return option;
}
function namespaceOf(schema) {
  const namespace = /* @__PURE__ */ Object.create(null);
  for (const object of schema) {
    namespace[object.name.replace(/\./g, "\\.")] = {
      self: nameOption(object.name, "type", object.type === "view" ? COMPLETION_VIEW : COMPLETION_TABLE, 0),
      children: object.columns.map((column) => nameOption(column.name, "property", column.type, 0))
    };
  }
  return namespace;
}
function columnOptionsOf(schema) {
  const owners = /* @__PURE__ */ new Map();
  for (const object of schema) {
    for (const column of object.columns) {
      if (!owners.has(column.name)) {
        owners.set(column.name, []);
      }
      owners.get(column.name).push(object.name);
    }
  }
  return [...owners].map(([name, tables]) => nameOption(name, "property", tables.join(", "), -1));
}
function nameBefore(state, dot) {
  const line = state.doc.lineAt(dot);
  const match = QUALIFIER.exec(state.sliceDoc(line.from, dot));
  if (!match) {
    return null;
  }
  const [, double, back, bare] = match;
  if (bare !== void 0) {
    return { name: bare, readable: READABLE.test(bare) };
  }
  const quote = double !== void 0 ? '"' : "`";
  const inner = double ?? back;
  return { name: inner.replaceAll(quote + quote, quote), readable: !inner.includes(quote) };
}
function withoutTyped(source) {
  return (context2) => {
    const result = source(context2);
    if (!result) {
      return result;
    }
    const all = result.options;
    const valid = result.validFor;
    const stillValid = (text, from, to, state) => typeof valid === "function" ? valid(text, from, to, state) : valid instanceof RegExp && new RegExp(`^(?:${valid.source})$`, valid.flags).test(text);
    const shown = (typed) => all.filter((option) => option.label.toLowerCase() !== typed.toLowerCase());
    const update = (current3, from, to, next) => {
      const text = next.state.sliceDoc(from, to);
      return stillValid(text, from, to, next.state) ? { ...current3, from, options: shown(text) } : null;
    };
    return { ...result, validFor: void 0, update, options: shown(context2.state.sliceDoc(result.from, context2.pos)) };
  };
}
function readSoundly(source) {
  return (context2) => {
    const result = source(context2);
    if (!result) {
      return result;
    }
    const before = context2.state.sliceDoc(Math.max(0, result.from - 1), result.from);
    if (WORD.test(before)) {
      return null;
    }
    if (before === ".") {
      const qualifier = nameBefore(context2.state, result.from - 1);
      if (qualifier && !qualifier.readable) {
        return null;
      }
    }
    const first = context2.state.sliceDoc(result.from, result.from + 1);
    if ((first === '"' || first === "`") && before === first) {
      return null;
    }
    return result;
  };
}
function quotedRight(source) {
  return (context2) => {
    const result = source(context2);
    if (!result) {
      return result;
    }
    const quote = context2.state.sliceDoc(result.from, result.from + 1);
    if (quote !== '"' && quote !== "`") {
      return result;
    }
    const options = result.options.map((option) => {
      const name = option.label.startsWith(quote) && option.label.endsWith(quote) ? option.label.slice(1, -1) : null;
      return name && name.includes(quote) ? { ...option, apply: quote + name.replaceAll(quote, quote + quote) + quote } : option;
    });
    return { ...result, options };
  };
}
function createCodeEditor(cm, host, { doc = "", anchor = 0, head = anchor, schema = [] } = {}) {
  const dialect = cm.SQLDialect.define({
    ...cm.SQLite.spec,
    keywords: SQLITE_KEYWORDS,
    builtin: SQLITE_FUNCTIONS,
    // a name that has to be quoted is completed in double quotes, as SQL writes it
    identifierQuotes: '"`',
    // SQLite compares names without case, so Products needs no quotes
    caseInsensitiveIdentifiers: true
  });
  const functionNames = new Set(SQLITE_FUNCTIONS.split(" "));
  const typeNames = new Set(cm.SQLite.spec.types.split(" "));
  const keywordNames = SQLITE_KEYWORDS.split(" ");
  const wordOptions = [
    ...keywordNames.filter((word) => !functionNames.has(word)).map((word) => ({ label: word.toUpperCase(), type: "keyword", boost: -1 })),
    ...[...typeNames].filter((word) => word && !functionNames.has(word) && !keywordNames.includes(word)).map((word) => ({ label: word.toUpperCase(), type: "type", detail: COMPLETION_TYPE, boost: -1 })),
    ...[...functionNames].map((word) => ({ label: word.toUpperCase(), type: "function", detail: COMPLETION_FUNCTION, boost: -1 }))
  ];
  const wordSource = withoutTyped(
    cm.ifNotIn(NO_COMPLETION_IN, (context2) => {
      const word = context2.matchBefore(WORD);
      if (!word && !context2.explicit) {
        return null;
      }
      const from = word ? word.from : context2.pos;
      if (context2.state.sliceDoc(from - 1, from) === ".") {
        return null;
      }
      return { from, options: wordOptions, validFor: WORD_ONLY };
    })
  );
  function completionFor(objects2) {
    const unread = objects2.filter((object) => !/^[A-Za-z0-9]/.test(object.name)).map((object) => nameOption(object.name, "type", object.type === "view" ? COMPLETION_VIEW : COMPLETION_TABLE, 0));
    const columns = [...unread, ...columnOptionsOf(objects2)];
    const columnSource = withoutTyped(
      cm.ifNotIn(NO_COMPLETION_IN, (context2) => {
        const word = context2.matchBefore(WORD);
        if (!word && !context2.explicit) {
          return null;
        }
        const from = word ? word.from : context2.pos;
        const before = context2.state.sliceDoc(from - 1, from);
        if (before === "." || before === '"' || before === "`" || !columns.length) {
          return null;
        }
        return { from, options: columns, validFor: WORD_ONLY };
      })
    );
    const qualifiedSource = withoutTyped(
      cm.ifNotIn(["QuotedIdentifier", "String", "LineComment", "BlockComment"], (context2) => {
        const word = context2.matchBefore(WORD);
        const from = word ? word.from : context2.pos;
        if (context2.state.sliceDoc(from - 1, from) !== ".") {
          return null;
        }
        const qualifier = nameBefore(context2.state, from - 1);
        const name = qualifier && !qualifier.readable ? qualifier.name.toLowerCase() : null;
        const object = name === null ? null : objects2.find((candidate) => candidate.name.toLowerCase() === name);
        if (!object) {
          return null;
        }
        return { from, options: object.columns.map((column) => nameOption(column.name, "property", column.type, 0)), validFor: WORD_ONLY };
      })
    );
    return cm.autocompletion({
      override: [
        withoutTyped(readSoundly(quotedRight(cm.schemaCompletionSource({ dialect, schema: namespaceOf(objects2) })))),
        qualifiedSource,
        columnSource,
        wordSource
      ],
      icons: false,
      maxRenderedOptions: 50,
      selectOnOpen: false,
      filterStrict: true
    });
  }
  let leaving = false;
  let listShown = false;
  function fireExecute(view2) {
    cm.closeCompletion(view2);
    host.dispatchEvent(new CustomEvent("execute", { detail: host.query }));
  }
  function tab(view2) {
    if (leaving) {
      return false;
    }
    if (view2.state.selection.main.empty) {
      view2.dispatch({ ...view2.state.replaceSelection(INDENT), scrollIntoView: true, userEvent: "input" });
      return true;
    }
    return cm.indentMore(view2);
  }
  function shiftTab(view2) {
    return leaving ? false : cm.indentLess(view2);
  }
  const handlers = cm.Prec.highest(
    cm.EditorView.domEventHandlers({
      keydown(event, view2) {
        leaving = leavesEditor(host, event);
        if ((event.ctrlKey || event.metaKey) && (event.keyCode === 10 || event.keyCode === 13)) {
          fireExecute(view2);
          return true;
        }
        return false;
      },
      blur(event, view2) {
        leaving = false;
        cancelLeave(host);
        view2.setTabFocusMode(false);
      },
      // a press in the editor after Escape: the student goes on editing, so Tab indents again
      pointerdown(event, view2) {
        leaving = false;
        cancelLeave(host);
        view2.setTabFocusMode(false);
        return false;
      },
      // a file is never read into the editor (nor opened by the browser in the tab)
      drop(event) {
        dragging = false;
        return carriesFiles(event.dataTransfer);
      },
      dragstart() {
        dragging = true;
        return false;
      },
      dragend() {
        dragging = false;
        return false;
      }
    })
  );
  let dragging = false;
  const endStaleDrag = () => {
    if (dragging) {
      dragging = false;
      view.contentDOM.dispatchEvent(new DragEvent("dragend", { bubbles: true }));
    }
  };
  for (const type of ["pointerdown", "pointermove", "keydown"]) {
    document.addEventListener(type, endStaleDrag, { capture: true, passive: true });
  }
  const completion = new cm.Compartment();
  let objects = schema;
  const highlighter = cm.tagHighlighter([
    { tag: [cm.tags.keyword, cm.tags.typeName, cm.tags.bool, cm.tags.null], class: "sql-keyword" },
    { tag: cm.tags.standard(cm.tags.name), class: "sql-function" },
    { tag: cm.tags.string, class: "sql-string" },
    // "name" (QuotedIdentifier, a special string to lang-sql) is a name: ink, not the string colour
    { tag: cm.tags.special(cm.tags.string), class: "sql-quoted-name" },
    { tag: cm.tags.number, class: "sql-number" },
    { tag: cm.tags.comment, class: "sql-comment" }
  ]);
  function extensions() {
    return [
      handlers,
      cm.Prec.highest(cm.keymap.of([{ key: "Tab", run: tab, shift: shiftTab }])),
      cm.lineNumbers(),
      cm.highlightActiveLineGutter(),
      cm.highlightSpecialChars(),
      cm.history(),
      cm.drawSelection(),
      cm.dropCursor(),
      cm.indentUnit.of(INDENT),
      cm.EditorState.tabSize.of(INDENT.length),
      cm.sql({ dialect }),
      cm.syntaxHighlighting(highlighter),
      cm.bracketMatching(),
      cm.highlightActiveLine(),
      cm.placeholder(EDITOR_PLACEHOLDER),
      completion.of(completionFor(objects)),
      // Escape is not bound: CodeMirror's default (simplifySelection) would collapse the
      // selection, and Escape is the first key of the way out to Run, which runs the selection
      // CodeMirror's Mod-U (undo the last change or selection) and its Alt-U pair are left
      // out: Ctrl/Cmd+U is the page's "Open from URL…", and with them the key also undid the
      // student's last edit
      cm.keymap.of([
        ...cm.defaultKeymap.filter((binding) => binding.key !== "Escape"),
        ...cm.historyKeymap.filter((binding) => binding.key !== "Mod-u" && binding.key !== "Alt-u")
      ]),
      // while text is selected the caret's line is not tinted: the tint would cover the
      // selection, which CodeMirror draws under the text
      cm.EditorView.editorAttributes.of((view2) => view2.state.selection.ranges.some((range) => !range.empty) ? { class: "sql-selecting" } : null),
      // tabindex changes nothing for the keyboard (the content is editable, so a Tab stop
      // already); it tells accessibility checkers that the scrolling pane holds one
      cm.EditorView.contentAttributes.of({ "aria-label": EDITOR_LABEL, "aria-describedby": EDITOR_HINT_ID, tabindex: "0" }),
      cm.EditorView.updateListener.of((update) => {
        if (update.docChanged) {
          queueMicrotask(() => host.dispatchEvent(new Event("input", { bubbles: true })));
        }
        const status = cm.completionStatus(update.state);
        if (status === "active" && !listShown) {
          listShown = true;
          const count = cm.currentCompletions(update.state).length;
          queueMicrotask(() => update.view.dispatch({ effects: cm.EditorView.announce.of(completionsOpenedText(count)) }));
        } else if (status === null) {
          listShown = false;
        }
      })
    ];
  }
  function stateFor(text, selection) {
    return cm.EditorState.create({ doc: text, selection, extensions: extensions() });
  }
  const view = new cm.EditorView({
    state: stateFor(doc, { anchor: Math.min(anchor, doc.length), head: Math.min(head, doc.length) })
  });
  view.contentDOM.addEventListener("input", (event) => event.stopPropagation());
  function selectionInside() {
    if (view.hasFocus) {
      return true;
    }
    const selection = window.getSelection();
    if (!selection || selection.rangeCount === 0) {
      return false;
    }
    const range = selection.getRangeAt(0);
    return view.contentDOM.contains(range.startContainer) && view.contentDOM.contains(range.endContainer);
  }
  return {
    view,
    get value() {
      return view.state.doc.toString();
    },
    set value(text) {
      cm.closeCompletion(view);
      view.setState(stateFor(String(text ?? ""), { anchor: 0 }));
      listShown = false;
    },
    selectedText() {
      const { from, to } = view.state.selection.main;
      return from === to || !selectionInside() ? "" : view.state.sliceDoc(from, to);
    },
    caretToEnd() {
      view.focus();
      view.dispatch({ selection: { anchor: view.state.doc.length }, scrollIntoView: true });
    },
    // atCaret false: the text goes after the last character (the student has not chosen a
    // place since the app last set the text). A space is added on either side where the
    // neighbouring text would otherwise run into it; the caret ends right after the text.
    insert(text, { atCaret = true, spaceBefore, spaceAfter } = {}) {
      const state = view.state;
      const range = atCaret ? state.selection.main : { from: state.doc.length, to: state.doc.length };
      const before = state.sliceDoc(Math.max(0, range.from - 1), range.from);
      const after = state.sliceDoc(range.to, range.to + 1);
      const lead = before && !spaceBefore.test(before) ? " " : "";
      const trail = after && !spaceAfter.test(after) ? " " : "";
      view.focus();
      view.dispatch({
        changes: { from: range.from, to: range.to, insert: lead + text + trail },
        selection: { anchor: range.from + lead.length + text.length },
        scrollIntoView: true,
        userEvent: "input"
      });
    },
    // The student chose this text (a sample query): it replaces the document as an edit of
    // their own, which Ctrl/Cmd+Z takes back, not as the app's (value, which starts afresh).
    fill(text) {
      const insert = String(text ?? "");
      view.focus();
      view.dispatch({
        changes: { from: 0, to: view.state.doc.length, insert },
        selection: { anchor: insert.length },
        scrollIntoView: true,
        userEvent: "input"
      });
    },
    setSchema(next) {
      objects = next;
      view.dispatch({ effects: completion.reconfigure(completionFor(objects)) });
    }
  };
}
var INDENT, NO_COMPLETION_IN, WORD, WORD_ONLY, READABLE, QUALIFIER;
var init_code_editor = __esm({
  "js/lab/code-editor.js"() {
    init_config();
    init_editor_keys();
    init_sql();
    init_sqlite_words();
    INDENT = "  ";
    NO_COMPLETION_IN = ["QuotedIdentifier", "String", "LineComment", "BlockComment", "."];
    WORD = /[\p{L}\p{M}\p{N}_$]+$/u;
    WORD_ONLY = /^[\p{L}\p{M}\p{N}_$]*$/u;
    READABLE = /^[A-Za-z0-9][A-Za-z0-9_]*$/;
    QUALIFIER = /(?:"((?:[^"]|"")*)"|`((?:[^`]|``)*)`|([\p{L}\p{M}\p{N}_$]+))$/u;
  }
});

// js/lab/brand.js
init_config();
var SEPARATOR = " - ";
function titleFor(part) {
  return part ? `${part}${SEPARATOR}${APP_NAME}` : APP_NAME;
}
function apply() {
  const title = document.querySelector("title");
  document.title = titleFor(title ? title.dataset.pageTitle : "");
  for (const el7 of document.querySelectorAll("[data-app-name]")) {
    el7.textContent = APP_NAME;
  }
  for (const el7 of document.querySelectorAll("[data-app-label]")) {
    el7.setAttribute("aria-label", `${APP_NAME}${el7.dataset.appLabel}`);
  }
}
if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", apply);
} else {
  apply();
}

// js/lab/html.js
var ESCAPES = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#39;"
};
function escapeHtml(value) {
  if (value === null || value === void 0) {
    return "";
  }
  return String(value).replace(/[&<>"']/g, (ch) => ESCAPES[ch]);
}

// js/components/sqlime-editor.js
init_editor_keys();
init_config();
var TAB_WIDTH = 2;
var SqlimeEditor = class extends HTMLElement {
  connectedCallback() {
    if (!this.rendered) {
      this.render();
      this.listen();
      this.rendered = true;
      this.upgrade();
    }
  }
  render() {
    this.contentEditable = "true";
    this.spellcheck = false;
    this.setAttribute("role", "textbox");
    this.setAttribute("aria-multiline", "true");
    this.setAttribute("aria-label", EDITOR_LABEL);
    this.dataset.placeholder = EDITOR_PLACEHOLDER;
    this.dataset.editor = "loading";
  }
  listen() {
    this.addEventListener("keydown", (event) => this.code || this.onKeydown(event));
    this.addEventListener("blur", () => this.code || cancelLeave(this));
    this.addEventListener("pointerdown", () => this.code || cancelLeave(this));
    this.addEventListener("paste", (event) => this.code || this.onPaste(event));
    const onInput = () => {
      this.dispatchEvent(new Event("start"));
      this.removeEventListener("input", onInput);
    };
    this.addEventListener("input", onInput);
  }
  // upgrade loads CodeMirror and draws the editor with it. this.ready settles when that is done,
  // failed, or took longer than EDITOR_UPGRADE_WAIT_MS (the plain box is shown meanwhile).
  upgrade() {
    let settle;
    this.ready = new Promise((resolve) => settle = resolve);
    const timer = setTimeout(() => {
      if (!this.code) {
        this.dataset.editor = "plain";
      }
      settle();
    }, EDITOR_UPGRADE_WAIT_MS);
    Promise.all([import("../vendor/editor.js"), Promise.resolve().then(() => (init_code_editor(), code_editor_exports))]).then(([cm, { createCodeEditor: createCodeEditor2 }]) => this.mountCode(cm, createCodeEditor2)).catch((error) => {
      console.warn("The code editor could not be loaded; the plain editor stays.", error);
      this.dataset.editor = "plain";
    }).finally(() => {
      clearTimeout(timer);
      settle();
    });
  }
  // mountCode replaces the plain box with CodeMirror, keeping the text, the caret and the focus.
  // CodeMirror is set up first: if that throws, the plain box is untouched.
  mountCode(cm, createCodeEditor2) {
    const doc = this.innerText === "\n" ? "" : this.innerText;
    const focused = document.activeElement === this;
    const { anchor, head } = focused ? this.caretOffsets() : { anchor: doc.length, head: doc.length };
    const code = createCodeEditor2(cm, this, { doc, anchor, head, schema: this.schema ?? [] });
    this.removeAttribute("contenteditable");
    this.removeAttribute("role");
    this.removeAttribute("aria-multiline");
    this.removeAttribute("aria-label");
    this.removeAttribute("aria-describedby");
    this.removeAttribute("tabindex");
    this.removeAttribute("spellcheck");
    this.replaceChildren(code.view.dom);
    this.code = code;
    this.dataset.editor = "code";
    if (focused) {
      this.code.view.focus();
    }
  }
  // the plain box's selection as offsets into its text as innerText (the text CodeMirror is given)
  // counts it: a <br> is a line break, and the edges of a line block (<div>, <p>) are a line
  // break between text (several edges in a row count once, and none at the very start). The end
  // if the selection is not inside.
  caretOffsets() {
    const selection = window.getSelection();
    const end = this.innerText.length;
    if (!selection || selection.rangeCount === 0) {
      return { anchor: end, head: end };
    }
    const offset = (node, at) => {
      if (!this.contains(node)) {
        return end;
      }
      const items = [];
      let done = false;
      const walk = (parent) => {
        const children = parent.childNodes;
        for (let i = 0; i < children.length; i++) {
          if (parent === node && i === at) {
            done = true;
            return;
          }
          const child = children[i];
          if (child.nodeType === Node.TEXT_NODE) {
            items.push(child === node ? child.data.slice(0, at) : child.data);
            if (child === node) {
              done = true;
              return;
            }
          } else if (child.nodeName === "BR") {
            items.push("\n");
          } else {
            const block = child.nodeName === "DIV" || child.nodeName === "P";
            if (block) {
              items.push("start");
            }
            walk(child);
            if (done) {
              return;
            }
            if (block) {
              items.push("end");
            }
          }
        }
        done = parent === node;
      };
      walk(this);
      let text = "";
      let edge = null;
      for (const item2 of items) {
        if (item2 === "start" || item2 === "end") {
          edge = text ? item2 : null;
        } else if (item2) {
          text += (edge ? "\n" : "") + item2;
          edge = null;
        }
      }
      if (edge === "start") {
        text += "\n";
      }
      return Math.min(text.length, end);
    };
    return { anchor: offset(selection.anchorNode, selection.anchorOffset), head: offset(selection.focusNode, selection.focusOffset) };
  }
  get view() {
    return this.code ? this.code.view : null;
  }
  setSchema(objects) {
    this.schema = objects;
    this.code?.setSchema(objects);
  }
  // focus sets cursor at the end of the editor
  focus() {
    this.dispatchEvent(new Event("reveal"));
    if (this.code) {
      this.code.caretToEnd();
      return;
    }
    super.focus();
    document.execCommand("selectAll", false, null);
    document.getSelection().collapseToEnd();
  }
  // clear clears editor contents
  clear() {
    this.value = "";
  }
  // fill replaces all the text with text the student chose (a sample query in the results pane):
  // one edit that Ctrl/Cmd+Z takes back, an "input" event as for typing, then the focus and the
  // caret at the end. (value is the app's own text: no undo back past it, and no "input".)
  fill(text) {
    this.dispatchEvent(new Event("reveal"));
    if (this.code) {
      this.code.fill(text);
      return;
    }
    HTMLElement.prototype.focus.call(this);
    document.execCommand("selectAll", false, null);
    if (text) {
      document.execCommand("insertText", false, text);
    } else {
      document.execCommand("delete", false, null);
    }
    this.focus();
  }
  onKeydown(event) {
    if (leavesEditor(this, event)) return;
    if (handleIndent(this, event)) return;
    if (handleExecute(this, event)) return;
  }
  onPaste(event) {
    event.preventDefault();
    const text = event.clipboardData.getData("text/plain");
    document.execCommand("insertHTML", false, escapeHtml(text));
  }
  get value() {
    return this.code ? this.code.value : this.innerText;
  }
  set value(newValue) {
    if (this.code) {
      this.code.value = newValue;
    } else {
      this.innerText = newValue;
    }
    this.dispatchEvent(new Event("replace"));
  }
  // query is the selected text if the selection lies inside the editor, else all of it.
  // The selection is page-wide, so text selected elsewhere (an exercise prompt, a result
  // cell) must not be taken for SQL.
  get query() {
    const selectedQuery = this.selectedText().trim();
    return selectedQuery || this.value;
  }
  // selectedText returns the page selection's text only if all of it is inside the editor.
  selectedText() {
    if (this.code) {
      return this.code.selectedText();
    }
    const selection = window.getSelection();
    if (!selection || selection.rangeCount === 0 || selection.isCollapsed) {
      return "";
    }
    for (let i = 0; i < selection.rangeCount; i++) {
      const range = selection.getRangeAt(i);
      if (!this.contains(range.startContainer) || !this.contains(range.endContainer)) {
        return "";
      }
    }
    return selection.toString();
  }
};
function handleIndent(elem, event) {
  if (event.key != "Tab") {
    return false;
  }
  event.preventDefault();
  document.execCommand("insertHTML", false, " ".repeat(TAB_WIDTH));
  return true;
}
function handleExecute(elem, event) {
  if (!event.ctrlKey && !event.metaKey) {
    return false;
  }
  if (event.keyCode != 10 && event.keyCode != 13) {
    return false;
  }
  event.preventDefault();
  elem.dispatchEvent(new CustomEvent("execute", { detail: elem.query }));
  return true;
}
customElements.define("sqlime-editor", SqlimeEditor);

// js/lab/cell-text.js
function toHex(bytes) {
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}
function cellText(value) {
  if (value === null || value === void 0) {
    return "";
  }
  if (value instanceof Uint8Array) {
    return `x'${toHex(value)}'`;
  }
  if (value instanceof ArrayBuffer) {
    return `x'${toHex(new Uint8Array(value))}'`;
  }
  return String(value);
}

// js/printer.js
function printResult(result) {
  if (result === null) {
    return "(empty)";
  }
  const [columns, values] = [result.columns, result.values];
  let html = "<thead>" + join(columns.map(escapeHtml), "th") + "</thead>";
  const rows3 = values.map(function(v) {
    return join(v.map(sanitize), "td");
  });
  html += "<tbody>" + join(rows3, "tr") + "</tbody>";
  return `<table>${html}</table>`;
}
function printTables(tables) {
  let html = "<thead><tr><th>table</th></tr></thead>";
  const rows3 = tables.map(function(table) {
    const name = escapeHtml(table);
    return `<tr>
            <td>
                <button class="sqlime-link" data-action="showTable" data-arg="${name}">
                    ${name}
                </button>
            </td>
        </tr>`;
  });
  html += "<tbody>" + rows3.join("\n") + "</tbody>";
  return `<table>${html}</table>`;
}
function join(values, tagName) {
  if (values.length === 0) {
    return "";
  }
  const open = "<" + tagName + ">";
  const close = "</" + tagName + ">";
  return open + values.join(close + open) + close;
}
function sanitize(value) {
  return escapeHtml(cellText(value)).replace(/\r\n|\r|\n/g, "<br>");
}
var printer = { printResult, printTables };
var printer_default = printer;

// js/components/sqlime-result.js
var SqlimeResult = class extends HTMLElement {
  // print prints SQL query result as a table
  print(result) {
    this.applyPrinter(result, printer_default.printResult);
  }
  // printTables prints table list as a table
  printTables(tables) {
    this.applyPrinter(tables, printer_default.printTables);
  }
  // applyPrinter prints data structure
  // with specified printer function
  applyPrinter(data, printFunc) {
    if (!data) {
      this.clear();
      return;
    }
    this.innerHTML = printFunc(data);
  }
  // clear hides the table
  clear() {
    this.innerHTML = "";
  }
};
customElements.define("sqlime-result", SqlimeResult);

// js/sqlite/manager.js
var manager_exports = {};
__export(manager_exports, {
  default: () => manager_default
});
init_db();

// js/lab/runner.js
var runner_exports = {};
__export(runner_exports, {
  engineMessage: () => engineMessage,
  isVacuumInto: () => isVacuumInto,
  runSql: () => runSql,
  splitStatements: () => splitStatements,
  stripLeadingNoise: () => stripLeadingNoise
});
init_config();
var SQLITE_PRAGMA = 19;
var SQLITE_ATTACH = 24;
var SQLITE_OK = 0;
var SQLITE_DENY = 1;
var guarded = /* @__PURE__ */ new WeakSet();
function authorize(_context, action, arg1) {
  if (action === SQLITE_PRAGMA && /heap_limit$/i.test(arg1 ?? "")) {
    return SQLITE_DENY;
  }
  if (action === SQLITE_ATTACH && arg1 !== ":memory:" && arg1 !== "") {
    return SQLITE_DENY;
  }
  return SQLITE_OK;
}
function installGuard(database2) {
  if (guarded.has(database2.db)) {
    return;
  }
  guarded.add(database2.db);
  try {
    database2.capi.sqlite3_set_authorizer(database2.db.pointer, authorize, 0);
  } catch (exc) {
    console.warn("the SQL guard could not be installed", exc);
  }
}
var LEADING_NOISE = /^(?:\s+|--[^\n]*(?:\n|$)|\/\*(?:[\s\S]*?\*\/|[\s\S]+))*/;
var VACUUM_INTO = /^vacuum\b[\s\S]*\binto\b/i;
var COMMENTS_AND_QUOTES = /--[^\n]*|\/\*[\s\S]*?(?:\*\/|$)|'(?:[^']|'')*(?:'|$)|"(?:[^"]|"")*(?:"|$)|`(?:[^`]|``)*(?:`|$)|\[[^\]]*(?:\]|$)/g;
function isVacuumInto(statement) {
  const text = stripLeadingNoise(statement);
  return /^vacuum\b/i.test(text) && VACUUM_INTO.test(text.replace(COMMENTS_AND_QUOTES, " "));
}
function stripLeadingNoise(statement) {
  return String(statement).replace(LEADING_NOISE, "");
}
var NOTHING_TO_RUN = /^(?:;|\s|--[^\n]*(?:\n|$)|\/\*(?:(?:(?!\*\/)[\s\S])*\*\/|(?:(?!\*\/)[\s\S])+$))*$/;
var PREFIX = /^(?:SQLite3Error:\s*)?(?:SQLITE_[A-Z0-9_]+:\s*)?(?:sqlite3 result code -?\d+:\s*)?/;
function engineMessage(exc) {
  const text = exc && typeof exc === "object" && "message" in exc ? String(exc.message) : String(exc);
  const stripped = text.replace(PREFIX, "");
  return stripped.trim() ? stripped : text;
}
function nextSemicolon(sql, from) {
  for (let i = from; i < sql.length; i++) {
    let end;
    switch (sql[i]) {
      case ";":
        return i;
      case "'":
      case '"':
      case "`":
        end = sql.indexOf(sql[i], i + 1);
        break;
      case "[":
        end = sql.indexOf("]", i + 1);
        break;
      case "-":
        if (sql[i + 1] !== "-") {
          continue;
        }
        end = sql.indexOf("\n", i + 2);
        break;
      case "/":
        if (sql[i + 1] !== "*") {
          continue;
        }
        end = sql.indexOf("*/", i + 2);
        if (end !== -1) {
          end++;
        }
        break;
      default:
        continue;
    }
    if (end === -1) {
      return -1;
    }
    i = end;
  }
  return -1;
}
function splitStatements(capi, sql) {
  const statements = [];
  let start2 = 0;
  let at = nextSemicolon(sql, 0);
  while (at !== -1) {
    const chunk = sql.slice(start2, at + 1);
    if (capi.sqlite3_complete(chunk)) {
      addStatement(statements, chunk);
      start2 = at + 1;
    }
    at = nextSemicolon(sql, at + 1);
  }
  addStatement(statements, sql.slice(start2));
  return statements;
}
function addStatement(statements, text) {
  const lead = text.length - text.trimStart().length;
  const end = text.trimEnd().length;
  const statement = text.slice(lead, text.slice(0, end).endsWith("/*") && end < text.length ? end + 1 : end);
  if (!NOTHING_TO_RUN.test(statement)) {
    statements.push(statement);
  }
}
function noteFailure(exc, text, position, count) {
  if (exc === null || typeof exc !== "object") {
    return;
  }
  try {
    exc.statementText = text;
    exc.statementPosition = position;
    exc.statementCount = count;
  } catch {
  }
}
function runSql(database2, sql) {
  if (!sql) {
    return null;
  }
  database2.query = sql;
  if (sql.includes("\0")) {
    throw new Error(SQL_NUL_MESSAGE);
  }
  if (typeof sql.isWellFormed === "function" && !sql.isWellFormed()) {
    sql = sql.toWellFormed();
  }
  installGuard(database2);
  let last = null;
  const statements = splitStatements(database2.capi, sql);
  for (let i = 0; i < statements.length; i++) {
    const statement = statements[i];
    try {
      if (isVacuumInto(statement)) {
        throw new Error(VACUUM_INTO_MESSAGE);
      }
      const columns = [];
      const values = [];
      database2.db.exec({
        sql: statement,
        rowMode: "array",
        columnNames: columns,
        resultRows: values
      });
      if (columns.length) {
        last = { columns, values };
      }
    } catch (exc) {
      noteFailure(exc, statement, i + 1, statements.length);
      throw exc;
    }
  }
  return last;
}

// js/sqlite/manager.js
var sqlite3;
var loading;
var CONFIG = {
  print: console.log,
  printErr: console.error
};
async function init(name, path) {
  if (!loading) {
    loading = sqlite3InitModule(CONFIG).then((api) => {
      console.log(`Loaded SQLite ${api.capi.sqlite3_libversion()}`);
      return api;
    });
  }
  sqlite3 = await loading;
  if (path.type == "local" || path.type == "remote") {
    console.debug(`Loading database from url ${path.value}...`);
    if (path.value.endsWith(".sql")) {
      const sql = await fetchFile(path.value, "text");
      return fromSql(name, path, sql);
    }
    const buf = await fetchFile(path.value, "arrayBuffer");
    return fromBytes(name, path, buf);
  }
  if (path.type == "binary") {
    console.debug("Loading database from array buffer...");
    const buf = path.value;
    path.value = null;
    return fromBytes(name, path, buf);
  }
  if (path.type == "sql") {
    console.debug("Loading database from SQL script...");
    return fromSql(name, path, path.value);
  }
  console.debug("Creating new database...");
  return create(name, path);
}
function create(name, path) {
  const db = new sqlite3.oo1.DB();
  return new SQLite(name, path, sqlite3.capi, db);
}
function fromBytes(name, path, buf) {
  if (!buf) {
    return null;
  }
  const bytes = new Uint8Array(buf);
  if (bytes[18] === 2) bytes[18] = 1;
  if (bytes[19] === 2) bytes[19] = 1;
  const p = sqlite3.wasm.allocFromTypedArray(bytes);
  const database2 = create(name, path);
  sqlite3.capi.sqlite3_deserialize(
    database2.db.pointer,
    "main",
    p,
    bytes.length,
    bytes.length,
    sqlite3.capi.SQLITE_DESERIALIZE_FREEONCLOSE | sqlite3.capi.SQLITE_DESERIALIZE_RESIZEABLE
  );
  database2.gatherTables();
  return database2;
}
function fromSql(name, path, sql) {
  if (!sql) {
    return null;
  }
  const database2 = create(name, path);
  runSql(database2, sql);
  database2.gatherTables();
  database2.query = "";
  return database2;
}
async function fetchFile(url, method) {
  try {
    const response = await fetch(url);
    if (!response.ok) {
      return null;
    }
    return await response[method]();
  } catch {
    return null;
  }
}
var manager_default = { init };

// js/storage.js
var storage_exports = {};
__export(storage_exports, {
  default: () => storage_default
});
var PREFIX2 = "sqlime";
var memory = /* @__PURE__ */ new Map();
var storageKey = (key) => `${PREFIX2}.query.${key}`;
function get(key) {
  const full = storageKey(key);
  if (memory.has(full)) {
    return memory.get(full);
  }
  try {
    return localStorage.getItem(full);
  } catch {
    return null;
  }
}
function set(key, sql) {
  if (!sql) {
    remove(key);
  }
  const full = storageKey(key);
  try {
    localStorage.setItem(full, sql);
    memory.delete(full);
  } catch {
    memory.set(full, sql);
  }
}
function remove(key) {
  const full = storageKey(key);
  memory.delete(full);
  try {
    localStorage.removeItem(full);
  } catch {
  }
}
var storage = { get, set, remove };
var storage_default = storage;

// js/controllers/actions.js
var ActionController = class {
  constructor(handlers) {
    this.handlers = handlers;
  }
  // listen listens for clicks
  listen(...elems) {
    for (const el7 of elems) {
      el7.addEventListener("click", this.onClick.bind(this));
    }
  }
  // onClick executes an action
  // according to the button clicked
  onClick(event) {
    const btn = event.target.tagName == "BUTTON" ? event.target : event.target.parentElement;
    if (btn.tagName != "BUTTON") {
      return;
    }
    const handler = this.handlers[btn.dataset.action];
    if (!handler) {
      return;
    }
    btn.setAttribute("disabled", "");
    handler(btn.dataset.arg).then(() => {
      btn.removeAttribute("disabled");
    }).catch(() => {
      btn.removeAttribute("disabled");
    });
  }
};

// js/controllers/shortcuts.js
var ShortcutController = class {
  constructor(handlers) {
    this.handlers = handlers;
  }
  // listen listens for shortcuts
  listen(...elems) {
    for (const el7 of elems) {
      el7.addEventListener("keydown", this.onKeydown.bind(this));
    }
  }
  // onClick executes an action
  // according to the shortcut
  onKeydown(event) {
    if (!event.ctrlKey && !event.metaKey) {
      return;
    }
    const handler = this.handlers[event.key];
    if (!handler) {
      return;
    }
    console.debug(`Triggered Ctrl/Cmd + ${event.key} shortcut`);
    event.preventDefault();
    handler();
  }
};

// js/db-path.js
var db_path_exports = {};
__export(db_path_exports, {
  DatabasePath: () => DatabasePath
});
var DatabasePath = class {
  constructor(value, type = null) {
    this.value = value;
    this.type = type || this.inferType(value);
  }
  // inferType guesses the path type by its value.
  inferType(value) {
    if (!value) {
      return "empty";
    }
    if (value instanceof ArrayBuffer) {
      return "binary";
    }
    if (/^https?:\/\//i.test(value)) {
      return "remote";
    }
    return isSameSite(value) ? "local" : "unsupported";
  }
  // extractName extracts the database name from the path.
  extractName() {
    if (["binary", "sql", "unsupported", "empty"].includes(this.type)) {
      return "";
    }
    const parts = this.value.split("/");
    return parts[parts.length - 1];
  }
  // toHash returns the path as a window location hash string.
  toHash() {
    if (this.type == "local" || this.type == "remote") {
      return `#${this.value}`;
    } else {
      return "";
    }
  }
  // toString returns the path as a string.
  // The text can contain anything the user or a link supplied, so it must be
  // escaped before it is shown as HTML.
  toString() {
    if (this.type == "local" || this.type == "remote") {
      return `URL ${this.value}`;
    } else if (this.type == "binary") {
      return "binary value";
    } else if (this.type == "sql") {
      return "sql script";
    } else if (this.type == "unsupported") {
      return `unsupported address ${this.value}`;
    } else {
      return "empty value";
    }
  }
};
function isSameSite(value) {
  try {
    const here = new URL(window.location.href);
    const target = new URL(value, here);
    return target.origin === here.origin;
  } catch {
    return false;
  }
}

// js/lab/caret.js
function caretToEnd(editor) {
  if (editor.view) {
    editor.code.caretToEnd();
    return;
  }
  const selection = window.getSelection();
  if (!selection) {
    return;
  }
  const range = document.createRange();
  range.selectNodeContents(editor);
  range.collapse(false);
  selection.removeAllRanges();
  selection.addRange(range);
}

// js/index.js
init_config();

// js/lab/copy-link.js
init_config();

// js/lab/menu.js
var ITEM = '[role="menuitem"], [role="menuitemradio"], [role="menuitemcheckbox"]';
var GAP = 4;
var MARGIN = 8;
function mountMenu(button, menu, { onSelect = () => {
}, onOpen = () => {
}, opensOn = "checked" } = {}) {
  if (!menu.id) {
    throw new Error("mountMenu: the menu needs an id");
  }
  if (typeof menu.showPopover !== "function") {
    button.hidden = true;
    return { open() {
    }, close() {
    }, isOpen: () => false };
  }
  if (!menu.hasAttribute("popover")) {
    menu.setAttribute("popover", "auto");
  }
  button.setAttribute("aria-haspopup", "menu");
  button.setAttribute("aria-controls", menu.id);
  button.setAttribute("aria-expanded", "false");
  button.popoverTargetElement = menu;
  const isOpen = () => menu.matches(":popover-open");
  const items = () => [...menu.querySelectorAll(ITEM)].filter((item2) => !item2.hidden && !item2.closest("[hidden]"));
  function focusItem(item2) {
    item2?.focus({ focusVisible: true });
  }
  function initialItem(focus = opensOn) {
    const list = items();
    if (focus === "last") {
      return list.at(-1);
    }
    if (focus === "checked") {
      return list.find((item2) => item2.getAttribute("aria-checked") === "true") ?? list[0];
    }
    return list[0];
  }
  function open(focus = opensOn) {
    if (!isOpen()) {
      menu.showPopover();
      place();
    }
    focusItem(initialItem(focus));
  }
  function close(focusButton = true) {
    if (isOpen()) {
      menu.hidePopover();
    }
    if (focusButton) {
      button.focus();
    }
  }
  function place() {
    placePopover(menu, button);
  }
  function follow() {
    if (!button.getClientRects().length) {
      if (isOpen()) {
        menu.hidePopover();
      }
      return;
    }
    place();
  }
  menu.addEventListener("beforetoggle", (event) => {
    const opening = event.newState === "open";
    button.setAttribute("aria-expanded", String(opening));
    if (opening) {
      onOpen();
      place();
      window.addEventListener("resize", follow);
      window.addEventListener("scroll", follow, true);
    } else {
      window.removeEventListener("resize", follow);
      window.removeEventListener("scroll", follow, true);
    }
  });
  menu.addEventListener("toggle", (event) => {
    if (event.newState === "open" && isOpen() && !menu.contains(document.activeElement)) {
      focusItem(initialItem());
    }
  });
  button.addEventListener("click", (event) => {
    event.preventDefault();
    if (isOpen()) {
      close(true);
    } else {
      open(opensOn);
    }
  });
  button.addEventListener("keydown", (event) => {
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      open(event.key === "ArrowUp" ? "last" : opensOn);
    }
  });
  menu.addEventListener("keydown", (event) => {
    const list = items();
    const index = list.indexOf(document.activeElement);
    switch (event.key) {
      case "ArrowDown":
        event.preventDefault();
        focusItem(list[(index + 1) % list.length]);
        break;
      case "ArrowUp":
        event.preventDefault();
        focusItem(list[(index - 1 + list.length) % list.length]);
        break;
      case "Home":
        event.preventDefault();
        focusItem(list[0]);
        break;
      case "End":
        event.preventDefault();
        focusItem(list.at(-1));
        break;
      case "Escape":
        event.preventDefault();
        close(true);
        break;
      case "Tab":
        if (event.shiftKey) {
          event.preventDefault();
          close(true);
        } else {
          close(false);
        }
        break;
      default:
        if (event.key.length === 1 && /\S/.test(event.key) && !event.ctrlKey && !event.metaKey && !event.altKey) {
          const key = event.key.toLowerCase();
          const order = [...list.slice(index + 1), ...list.slice(0, index + 1)];
          const match = order.find((item2) => item2.textContent.trim().toLowerCase().startsWith(key));
          if (match) {
            event.preventDefault();
            focusItem(match);
          }
        }
    }
  });
  menu.addEventListener("click", (event) => {
    const item2 = event.target.closest(ITEM);
    if (!item2 || !menu.contains(item2) || item2.getAttribute("aria-disabled") === "true") {
      return;
    }
    onSelect(item2, event);
    const focusInside = menu.contains(document.activeElement) || document.activeElement === document.body;
    close(false);
    if (focusInside) {
      button.focus();
    }
  });
  menu.addEventListener("focusout", (event) => {
    if (isOpen() && event.relatedTarget && !menu.contains(event.relatedTarget) && event.relatedTarget !== button) {
      menu.hidePopover();
    }
  });
  return { open, close, isOpen };
}
function placePopover(popover, anchor) {
  const rect = anchor.getBoundingClientRect();
  const below = window.innerHeight - rect.bottom - GAP - MARGIN;
  const above = rect.top - GAP - MARGIN;
  const style = popover.style;
  if (below >= Math.min(240, above)) {
    style.top = `${rect.bottom + GAP}px`;
    style.bottom = "auto";
    style.maxHeight = `${Math.max(below, 80)}px`;
  } else {
    style.top = "auto";
    style.bottom = `${window.innerHeight - rect.top + GAP}px`;
    style.maxHeight = `${Math.max(above, 80)}px`;
  }
  if (rect.left + rect.width / 2 > window.innerWidth / 2) {
    const right = Math.max(MARGIN, window.innerWidth - rect.right);
    style.left = "auto";
    style.right = `${right}px`;
    style.setProperty("--popover-room", `${window.innerWidth - right - MARGIN}px`);
  } else {
    const left = Math.max(MARGIN, rect.left);
    style.right = "auto";
    style.left = `${left}px`;
    style.setProperty("--popover-room", `${window.innerWidth - left - MARGIN}px`);
  }
  if (popover.matches(":popover-open")) {
    keepInside(popover);
  }
}
function keepInside(popover) {
  const box = popover.getBoundingClientRect();
  if (box.left < MARGIN || box.right > window.innerWidth - MARGIN) {
    popover.style.right = "auto";
    popover.style.left = `${MARGIN}px`;
  }
}

// js/lab/share.js
var share_exports = {};
__export(share_exports, {
  decodeShare: () => decodeShare,
  encodeShare: () => encodeShare,
  getShareContext: () => getShareContext,
  isShareFragment: () => isShareFragment,
  setShareContext: () => setShareContext,
  shareFragment: () => shareFragment,
  shareUrl: () => shareUrl
});
init_config();
var PREFIX3 = `${SHARE_PARAM}=`;
var SHARE_START = new RegExp(`^#?(?:\\s|%20)*\\??${SHARE_PARAM}(?:=|%3d)`, "i");
var PAYLOAD_ALPHABET = /^[A-Za-z0-9+\-$ ]*$/;
var context = { dataset: void 0, set: void 0, exercise: void 0 };
function setShareContext(next) {
  const picked = pick(next);
  for (const [key, value] of Object.entries(picked)) {
    if (value !== void 0 && value !== "" && !isId(value)) {
      throw new RangeError(`invalid ${key} id`);
    }
  }
  context = { ...context, ...picked };
}
function getShareContext() {
  return { ...context };
}
function pick(obj) {
  const out = {};
  for (const key of ["dataset", "set", "exercise"]) {
    if (obj && key in obj) out[key] = obj[key] ?? void 0;
  }
  return out;
}
function lz() {
  const lib = globalThis.LZString;
  if (!lib) throw new Error("lz-string is not loaded");
  return lib;
}
function isShareFragment(hash) {
  return typeof hash === "string" && SHARE_START.test(hash);
}
var isId = (value) => typeof value === "string" && SHARE_ID_PATTERN.test(value);
function encodeShare(state) {
  const out = { v: SHARE_VERSION };
  const ids = [
    ["d", "dataset"],
    ["x", "set"],
    ["e", "exercise"]
  ];
  for (const [short, long] of ids) {
    const value = state?.[long];
    if (value === void 0 || value === null || value === "") continue;
    if (!isId(value)) throw new Error(`invalid ${long} id`);
    out[short] = value;
  }
  const sql = state?.sql;
  if (typeof sql === "string" && sql.trim() !== "") out.q = sql;
  return lz().compressToEncodedURIComponent(JSON.stringify(out));
}
function decodeShare(hash) {
  try {
    if (!isShareFragment(hash)) return fail("not-a-share");
    let payload = hash.replace(SHARE_START, "");
    if (payload.includes("%")) {
      payload = decodeURIComponent(payload);
    }
    if (!payload || payload.length > SHARE_MAX_PAYLOAD_CHARS || !PAYLOAD_ALPHABET.test(payload)) {
      return fail("payload");
    }
    const json = lz().decompressFromEncodedURIComponent(payload);
    if (typeof json !== "string" || !json) return fail("decompress");
    if (json.length > SHARE_MAX_JSON_CHARS) return fail("payload");
    let data;
    try {
      data = JSON.parse(json);
    } catch {
      return fail("json");
    }
    if (data === null || typeof data !== "object" || Array.isArray(data)) return fail("shape");
    if (data.v !== SHARE_VERSION) return fail("version");
    const state = {};
    for (const [short, long] of [
      ["d", "dataset"],
      ["x", "set"],
      ["e", "exercise"]
    ]) {
      if (!Object.hasOwn(data, short)) continue;
      if (!isId(data[short])) return fail(typeof data[short] === "string" ? "id" : "shape");
      state[long] = data[short];
    }
    if (Object.hasOwn(data, "q")) {
      if (typeof data.q !== "string") return fail("shape");
      if (data.q.length > SHARE_MAX_SQL_CHARS) return fail("sql");
      state.sql = data.q;
    }
    return { ok: true, state };
  } catch {
    return fail("payload");
  }
}
function fail(reason) {
  return { ok: false, reason };
}
function shareFragment(state) {
  const payload = encodeShare(state);
  return payload.length > SHARE_MAX_PAYLOAD_CHARS ? null : `#${PREFIX3}${payload}`;
}
function shareUrl(sql, pageUrl = globalThis.location.href) {
  const fragment = shareFragment({ ...context, sql });
  if (fragment === null) return null;
  const url = new URL(pageUrl);
  url.search = "";
  url.hash = fragment;
  return url.href;
}

// js/lab/toast.js
init_config();

// js/lab/icons.js
var SVG_NS = "http://www.w3.org/2000/svg";
function icon(name, { filled = false } = {}) {
  const svg = document.createElementNS(SVG_NS, "svg");
  svg.setAttribute("class", filled ? "icon icon--filled" : "icon");
  svg.setAttribute("aria-hidden", "true");
  svg.setAttribute("focusable", "false");
  const use = document.createElementNS(SVG_NS, "use");
  use.setAttribute("href", `#icon-${name}`);
  svg.append(use);
  return svg;
}

// js/lab/toast.js
var ANNOUNCE_GAP_MS = 60;
var READ_MS = 300;
var showTimer = 0;
var hideTimer = 0;
function toast(message, { tone = "info" } = {}) {
  const region = document.getElementById("toast-region");
  if (!region) {
    return;
  }
  clearTimeout(showTimer);
  clearTimeout(hideTimer);
  region.replaceChildren();
  const kind = tone === "problem" || tone === "note" ? tone : "info";
  const card = document.createElement("div");
  card.className = `toast toast--${kind}`;
  const glyph = kind === "problem" ? icon("circle-alert") : kind === "note" ? icon("info") : icon("check");
  glyph.classList.add("toast-icon");
  const text = document.createElement("span");
  text.className = "toast-text";
  text.textContent = message;
  card.append(glyph, text);
  showTimer = setTimeout(() => {
    region.append(card);
    const words = message.split(/\s+/).filter(Boolean).length;
    const least = kind === "problem" ? 2 * TOAST_MS : TOAST_MS;
    hideTimer = setTimeout(() => card.remove(), Math.max(least, words * READ_MS));
  }, ANNOUNCE_GAP_MS);
}

// js/lab/copy-link.js
function createCopyLinkAction({ editor, button, popover, altAnchor = null }) {
  const anchor = () => button.getClientRects().length || !altAnchor ? button : altAnchor;
  const fallback = popover ? mountFallback(popover, anchor) : null;
  return function copyLink() {
    const url = shareUrl(editor.value);
    if (url === null) {
      toast(LINK_TOO_LONG_MESSAGE, { tone: "note" });
      return Promise.resolve();
    }
    const builtIn = Boolean(getShareContext().dataset);
    const confirmation = builtIn ? LINK_COPIED_MESSAGE : `${LINK_COPIED_MESSAGE}. ${NOT_IN_LINK_MESSAGE}`;
    const copied = navigator.clipboard?.writeText ? writeClipboard(url) : Promise.resolve(copyText(url));
    copied.then((ok) => {
      if (ok) {
        fallback?.close();
        toast(confirmation);
      } else if (fallback) {
        fallback.show(url, builtIn ? "" : NOT_IN_LINK_MESSAGE);
      }
    });
    return Promise.resolve();
  };
}
function copyText(text) {
  const before = document.activeElement;
  const field2 = document.createElement("textarea");
  field2.value = text;
  field2.readOnly = true;
  field2.className = "visually-hidden";
  field2.setAttribute("aria-hidden", "true");
  field2.tabIndex = -1;
  document.body.append(field2);
  field2.select();
  let ok = false;
  try {
    ok = document.execCommand("copy");
  } catch {
    ok = false;
  }
  field2.remove();
  if (before instanceof HTMLElement) {
    before.focus({ preventScroll: true });
    if (document.activeElement !== before) {
      setTimeout(() => {
        if (!document.activeElement || document.activeElement === document.body) {
          before.focus({ preventScroll: true });
        }
      }, 0);
    }
  }
  return ok;
}
async function writeClipboard(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return copyText(text);
  }
}
function mountFallback(popover, anchor) {
  if (typeof popover.showPopover !== "function") {
    return null;
  }
  const title = document.createElement("h2");
  title.className = "share-popover-title";
  title.id = "copy-link-title";
  title.textContent = LINK_COPY_FAILED_TITLE;
  const text = document.createElement("p");
  text.className = "share-popover-text";
  text.textContent = LINK_COPY_FAILED_MESSAGE;
  const label = document.createElement("label");
  label.className = "share-popover-label";
  label.htmlFor = "share-link-field";
  label.textContent = LINK_FIELD_LABEL;
  const field2 = document.createElement("input");
  field2.type = "text";
  field2.id = "share-link-field";
  field2.className = "share-link-field";
  field2.readOnly = true;
  field2.spellcheck = false;
  const warning = document.createElement("p");
  warning.className = "share-popover-text share-link-warning";
  warning.hidden = true;
  popover.setAttribute("role", "dialog");
  popover.setAttribute("aria-labelledby", title.id);
  popover.replaceChildren(title, text, label, field2, warning);
  popover.addEventListener("toggle", (event) => {
    if (event.newState === "open" && popover.matches(":popover-open")) {
      placePopover(popover, anchor());
      field2.focus({ preventScroll: true });
      field2.select();
      return;
    }
    const focused = document.activeElement;
    if (!focused || focused === document.body || popover.contains(focused)) {
      anchor().focus({ preventScroll: true });
    }
  });
  popover.addEventListener("focusout", (event) => {
    if (popover.matches(":popover-open") && event.relatedTarget && !popover.contains(event.relatedTarget) && event.relatedTarget !== anchor()) {
      popover.hidePopover();
    }
  });
  return {
    show(url, note) {
      field2.value = url;
      warning.textContent = note;
      warning.hidden = !note;
      if (popover.matches(":popover-open")) {
        field2.focus({ preventScroll: true });
        field2.select();
      } else {
        placePopover(popover, anchor());
        popover.showPopover();
      }
    },
    close() {
      if (popover.matches(":popover-open")) {
        popover.hidePopover();
      }
    }
  };
}

// js/lab/datasets.js
var datasets_exports = {};
__export(datasets_exports, {
  clearPristine: () => clearPristine,
  datasetFileName: () => datasetFileName,
  defaultDataset: () => defaultDataset,
  fetchDataset: () => fetchDataset,
  findDataset: () => findDataset,
  getManifest: () => getManifest,
  getPristineBytes: () => getPristineBytes,
  getPristineId: () => getPristineId,
  keepPristine: () => keepPristine,
  loadManifest: () => loadManifest,
  validateManifest: () => validateManifest
});
init_config();
function validateManifest(data) {
  const fail2 = (problem) => ({ ok: false, message: manifestInvalidMessage(problem) });
  if (data === null || typeof data !== "object" || Array.isArray(data)) {
    return fail2('the top level must be an object with a "datasets" list.');
  }
  const list = data.datasets;
  if (!Array.isArray(list)) {
    return fail2('"datasets" must be a list.');
  }
  if (list.length === 0) {
    return fail2('"datasets" is empty; it needs at least one dataset.');
  }
  const seen = /* @__PURE__ */ new Set();
  const datasets = [];
  for (const [index, raw] of list.entries()) {
    const where = `dataset ${index + 1}`;
    if (raw === null || typeof raw !== "object" || Array.isArray(raw)) {
      return fail2(`${where} must be an object.`);
    }
    const { id, name, file, description } = raw;
    if (typeof id !== "string" || !SHARE_ID_PATTERN.test(id)) {
      return fail2(
        `${where} needs an "id" of 1 to 64 letters, digits, "_" or "-" (a link carries it).`
      );
    }
    if (seen.has(id)) {
      return fail2(`the id "${id}" is used by more than one dataset.`);
    }
    seen.add(id);
    if (typeof name !== "string" || !name.trim()) {
      return fail2(`dataset "${id}" needs a "name".`);
    }
    if (typeof file !== "string" || !file.trim()) {
      return fail2(`dataset "${id}" needs a "file".`);
    }
    const fileProblem = filePathProblem(file);
    if (fileProblem) {
      return fail2(`the "file" of dataset "${id}" ${fileProblem}`);
    }
    if (description !== void 0 && typeof description !== "string") {
      return fail2(`the "description" of dataset "${id}" must be text.`);
    }
    if (raw.default !== void 0 && typeof raw.default !== "boolean") {
      return fail2(`the "default" of dataset "${id}" must be true or false.`);
    }
    datasets.push({
      id,
      name: name.trim(),
      file,
      description: description ?? "",
      default: raw.default === true,
      samples: validSamples(raw.samples, id)
    });
  }
  const defaults = datasets.filter((d) => d.default);
  if (defaults.length === 0) {
    return fail2('no dataset has "default": true; exactly one must.');
  }
  if (defaults.length > 1) {
    const ids = defaults.map((d) => `"${d.id}"`).join(", ");
    return fail2(`more than one dataset has "default": true (${ids}); exactly one must.`);
  }
  return { ok: true, datasets };
}
function validSamples(list, id) {
  if (list === void 0) {
    return [];
  }
  if (!Array.isArray(list)) {
    console.warn(`datasets/manifest.json: the "samples" of dataset "${id}" is not a list, so it has no samples.`);
    return [];
  }
  const samples = [];
  list.forEach((sample, index) => {
    const ok = sample !== null && typeof sample === "object" && typeof sample.label === "string" && sample.label.trim() !== "" && typeof sample.sql === "string" && sample.sql.trim() !== "";
    if (ok) {
      samples.push({ label: sample.label.trim(), sql: sample.sql });
    } else {
      console.warn(
        `datasets/manifest.json: sample ${index + 1} of dataset "${id}" needs a "label" and an "sql", both text, so it is left out.`
      );
    }
  });
  return samples;
}
function filePathProblem(file) {
  if (/[\u0000-\u001f\u007f\\]/.test(file)) {
    return "must not contain control characters or backslashes.";
  }
  if (file !== file.trim()) {
    return "must not start or end with a space.";
  }
  if (file.startsWith("/")) {
    return 'must be a relative path with no leading "/" (the site can be served from a subpath).';
  }
  if (/^[a-z][a-z0-9+.-]*:/i.test(file)) {
    return 'must be a relative path on this site, not an address with a scheme such as "https:".';
  }
  let decoded = file;
  try {
    decoded = decodeURIComponent(file);
  } catch {
    return "is not a valid path.";
  }
  if (decoded.split("/").includes("..") || file.split("/").includes("..")) {
    return 'must not contain "..".';
  }
  if (decoded.startsWith("/") || /^[a-z][a-z0-9+.-]*:/i.test(decoded)) {
    return "must be a relative path on this site.";
  }
  try {
    const here = new URL(globalThis.location.href);
    if (new URL(file, here).origin !== here.origin) {
      return "must be a path on this site.";
    }
  } catch {
    return "is not a valid path.";
  }
  return "";
}
async function loadManifest() {
  let response;
  try {
    response = await fetch(MANIFEST_URL, { cache: "no-cache" });
  } catch {
    return { ok: false, message: MANIFEST_UNREACHABLE_MESSAGE };
  }
  if (!response.ok) {
    return { ok: false, message: MANIFEST_UNREACHABLE_MESSAGE };
  }
  let data;
  try {
    data = await response.json();
  } catch {
    return { ok: false, message: manifestInvalidMessage("it is not valid JSON.") };
  }
  return validateManifest(data);
}
var manifestLoading = null;
function getManifest() {
  if (!manifestLoading) {
    manifestLoading = loadManifest().then((result) => {
      if (!result.ok) {
        manifestLoading = null;
      }
      return result;
    });
  }
  return manifestLoading;
}
function findDataset(manifest, id) {
  return manifest.ok ? manifest.datasets.find((d) => d.id === id) ?? null : null;
}
function defaultDataset(manifest) {
  return manifest.ok ? manifest.datasets.find((d) => d.default) ?? null : null;
}
function datasetFileName(entry2) {
  const last = entry2.file.split(/[?#]/)[0].split("/").pop();
  try {
    return decodeURIComponent(last);
  } catch {
    return last;
  }
}
async function fetchDataset(entry2, { onProgress = null } = {}) {
  const failure = { ok: false };
  try {
    const response = await fetch(entry2.file);
    if (!response.ok) {
      return failure;
    }
    const buffer = onProgress && response.body?.getReader ? await readWithProgress(response, onProgress) : await response.arrayBuffer();
    if (!hasSqliteHeader(buffer)) {
      return failure;
    }
    return { ok: true, buffer };
  } catch {
    return failure;
  }
}
async function readWithProgress(response, onProgress) {
  const declared = Number(response.headers.get("content-length"));
  const total = Number.isFinite(declared) && declared > 0 && !response.headers.get("content-encoding") ? declared : 0;
  const reader = response.body.getReader();
  const chunks = [];
  let loaded2 = 0;
  onProgress(0, total);
  for (; ; ) {
    const { done, value } = await reader.read();
    if (done) {
      break;
    }
    chunks.push(value);
    loaded2 += value.byteLength;
    onProgress(loaded2, total);
  }
  const bytes = new Uint8Array(loaded2);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return bytes.buffer;
}
function hasSqliteHeader(buffer) {
  if (buffer.byteLength < SQLITE_HEADER.length) {
    return false;
  }
  const head = new Uint8Array(buffer, 0, SQLITE_HEADER.length);
  return SQLITE_HEADER.split("").every((ch, i) => head[i] === ch.charCodeAt(0));
}
var pristine = null;
function keepPristine(id, buffer) {
  pristine = { id, buffer };
}
function clearPristine() {
  pristine = null;
}
function getPristineBytes() {
  return pristine ? new Uint8Array(pristine.buffer.slice(0)) : null;
}
function getPristineId() {
  return pristine ? pristine.id : null;
}

// js/lab/database-switcher.js
init_config();

// js/lab/keys.js
var IS_APPLE = /mac|iphone|ipad|ipod/i.test(navigator.userAgentData?.platform || navigator.platform || "");
var MOD_KEY = IS_APPLE ? "⌘" : "Ctrl";
function showPlatformKeys(root = document) {
  if (!IS_APPLE) {
    return;
  }
  for (const element3 of root.querySelectorAll("[data-mod]")) {
    element3.textContent = MOD_KEY;
  }
}

// js/lab/database-switcher.js
function element(tag, className, text) {
  const node = document.createElement(tag);
  if (className) {
    node.className = className;
  }
  if (text !== void 0) {
    node.textContent = text;
  }
  return node;
}
function menuItem({ role, id, glyph, label, description }) {
  const item2 = element("button", "menu-item menu-item--two-line");
  item2.type = "button";
  item2.tabIndex = -1;
  item2.setAttribute("role", role);
  if (id) {
    item2.id = id;
  }
  if (glyph) {
    item2.append(glyph);
  }
  const text = element("span", "menu-item-text");
  text.append(element("span", "menu-item-label", label));
  const line = element("span", "menu-item-description", description ?? "");
  line.hidden = !description;
  if (description) {
    line.title = description;
  }
  text.append(line);
  item2.append(text);
  return item2;
}
function shortcutHint(key) {
  const hint = element("span", "menu-item-shortcut");
  hint.setAttribute("aria-hidden", "true");
  hint.textContent = `${MOD_KEY} ${key}`;
  return hint;
}
function mountDatabaseSwitcher({ button, label, menu, onSelect, onOpenFile, onOpenUrl }) {
  menu.setAttribute("aria-label", DATABASE_MENU_LABEL);
  let datasets = [];
  let manifestKnown = false;
  let loaded2 = false;
  let current3 = { id: null, name: "" };
  let chosen = null;
  const sizes = /* @__PURE__ */ new Map();
  let sizesAsked = false;
  const sizeLines = /* @__PURE__ */ new Map();
  function shownName() {
    if (!manifestKnown && !loaded2) {
      return DATABASE_LOADING;
    }
    const builtIn = loaded2 ? datasets.find((d) => d.id === current3.id) : null;
    return builtIn ? builtIn.name : loaded2 ? current3.name : DATABASE_NONE;
  }
  function describe(dataset) {
    const parts = [];
    if (dataset.description) {
      parts.push(dataset.description);
    }
    return parts.join(" ");
  }
  function renderButton() {
    const name = shownName();
    label.textContent = name;
    button.setAttribute("aria-label", databaseButtonLabel(name));
    button.disabled = !manifestKnown && !loaded2;
    for (const item2 of menu.querySelectorAll("[data-dataset-id]")) {
      item2.setAttribute("aria-checked", String(loaded2 && item2.dataset.datasetId === current3.id));
    }
  }
  function renderMenu() {
    sizeLines.clear();
    const items = datasets.map((dataset) => {
      const tick = icon("check");
      tick.classList.add("menu-check");
      const item2 = menuItem({ role: "menuitemradio", glyph: tick, label: dataset.name, description: describe(dataset) });
      item2.dataset.datasetId = dataset.id;
      const size = element("span", "menu-item-size");
      size.textContent = sizes.has(dataset.id) ? databaseSizeText(sizes.get(dataset.id)) : "";
      item2.append(size);
      sizeLines.set(dataset.id, size);
      return item2;
    });
    const separator2 = element("div", "menu-separator");
    separator2.setAttribute("role", "separator");
    const openFile = menuItem({ role: "menuitem", id: "open-file", glyph: icon("file-up"), label: OPEN_FILE_TEXT, description: OPEN_FILE_DESCRIPTION });
    openFile.setAttribute("aria-keyshortcuts", "Control+O Meta+O");
    openFile.append(shortcutHint("O"));
    const openUrl2 = menuItem({ role: "menuitem", id: "open-url", glyph: icon("globe"), label: OPEN_URL_TEXT, description: OPEN_URL_DESCRIPTION });
    openUrl2.setAttribute("aria-keyshortcuts", "Control+U Meta+U");
    openUrl2.append(shortcutHint("U"));
    menu.replaceChildren(...items, ...items.length ? [separator2] : [], openFile, openUrl2);
    renderButton();
  }
  function askSizes() {
    if (sizesAsked) {
      return;
    }
    sizesAsked = true;
    for (const dataset of datasets) {
      fetch(dataset.file, { method: "HEAD", cache: "no-cache" }).then((response) => response.ok ? Number(response.headers.get("content-length")) : NaN).then((bytes) => {
        if (Number.isFinite(bytes) && bytes > 0) {
          sizes.set(dataset.id, bytes);
          const line = sizeLines.get(dataset.id);
          if (line) {
            line.textContent = databaseSizeText(bytes);
          }
        }
      }).catch(() => {
      });
    }
  }
  mountMenu(button, menu, {
    onOpen() {
      renderButton();
      askSizes();
    },
    onSelect(item2) {
      if (item2.dataset.datasetId) {
        const dataset = datasets.find((d) => d.id === item2.dataset.datasetId);
        if (dataset && dataset.id !== chosen) {
          chosen = dataset.id;
          onSelect(dataset);
        }
      } else if (item2.id === "open-file") {
        onOpenFile();
      } else if (item2.id === "open-url") {
        onOpenUrl();
      }
    }
  });
  document.addEventListener("lab:database-loaded", (event) => {
    const { database: database2, dataset } = event.detail;
    loaded2 = true;
    current3 = { id: dataset ? dataset.id : null, name: database2.name };
    chosen = current3.id;
    renderButton();
  });
  renderMenu();
  return {
    setManifest(manifest) {
      datasets = manifest.ok ? manifest.datasets : [];
      manifestKnown = true;
      renderMenu();
    },
    // a switch did not happen: the open database is the one asked for again
    sync() {
      chosen = loaded2 ? current3.id : null;
      renderButton();
    },
    rename(name) {
      current3.name = name;
      renderButton();
    }
  };
}

// js/lab/editor-schema.js
init_sql();
function rows(database2, sql) {
  return database2.db.exec({ sql, rowMode: "array", returnValue: "resultRows" });
}
function schemaVersion(database2) {
  try {
    return rows(database2, "PRAGMA schema_version")[0][0];
  } catch (exc) {
    return null;
  }
}
function readSchema(database2) {
  let objects;
  try {
    objects = rows(database2, SCHEMA_OBJECTS_SQL);
  } catch (exc) {
    return [];
  }
  return objects.map(([type, name]) => {
    let columns = [];
    try {
      columns = rows(database2, pragmaTableInfoSql(name)).map(([, column, columnType]) => ({ name: column, type: columnType }));
    } catch (exc) {
    }
    return { name, type, columns };
  });
}
function mountEditorSchema({ editor }) {
  let database2 = null;
  let seen = null;
  function read2() {
    seen = schemaVersion(database2);
    editor.setSchema(database2 ? readSchema(database2) : []);
  }
  document.addEventListener("lab:database-loaded", (event) => {
    database2 = event.detail.database;
    read2();
  });
  document.addEventListener("lab:run-finished", (event) => {
    if (event.detail.database !== database2) {
      return;
    }
    if (schemaVersion(database2) !== seen) {
      read2();
    }
  });
}

// js/lab/exercise-panel.js
init_config();

// js/lab/checker.js
var checker_exports = {};
__export(checker_exports, {
  compareResults: () => compareResults,
  createChecker: () => createChecker,
  displayValue: () => displayValue,
  normalizeRow: () => normalizeRow,
  normalizeValue: () => normalizeValue,
  serializeRow: () => serializeRow
});
init_config();
var INT64_MIN = -(2n ** 63n);
var INT64_MAX = 2n ** 63n - 1n;
function toHex2(bytes) {
  let hex = "";
  for (const byte of bytes) {
    hex += byte.toString(16).padStart(2, "0");
  }
  return hex;
}
function normalizeValue(value) {
  if (value === null || value === void 0) {
    return null;
  }
  if (typeof value === "bigint") {
    return { $int: value.toString() };
  }
  if (typeof value === "number") {
    if (Number.isNaN(value)) {
      return { $real: "NaN" };
    }
    if (!Number.isFinite(value)) {
      return { $real: value > 0 ? "Infinity" : "-Infinity" };
    }
    const rounded = Number(value.toFixed(6));
    if (Number.isInteger(rounded) && !Number.isSafeInteger(rounded)) {
      const big = BigInt(rounded);
      if (big >= INT64_MIN && big <= INT64_MAX) {
        return { $int: big.toString() };
      }
    }
    return rounded;
  }
  if (value instanceof Uint8Array) {
    return { $blob: toHex2(value) };
  }
  if (value instanceof ArrayBuffer) {
    return { $blob: toHex2(new Uint8Array(value)) };
  }
  return String(value);
}
function normalizeRow(row) {
  return Array.from(row, normalizeValue);
}
function serializeRow(row) {
  return JSON.stringify(normalizeRow(row));
}
function displayValue(value) {
  let text;
  if (value === null || value === void 0) {
    return "NULL";
  }
  if (typeof value === "bigint") {
    text = value.toString();
  } else if (typeof value === "number") {
    text = String(Number.isFinite(value) ? Number(value.toFixed(6)) : value);
  } else if (value instanceof Uint8Array || value instanceof ArrayBuffer) {
    text = `x'${toHex2(value instanceof Uint8Array ? value : new Uint8Array(value))}'`;
  } else {
    text = String(value);
  }
  return text.length > DIFF_MAX_CELL_CHARS ? `${text.slice(0, DIFF_MAX_CELL_CHARS)}…` : text;
}
var compareCodeUnits = (a, b) => a < b ? -1 : a > b ? 1 : 0;
function compareResults(expected, got, { orderMatters = false, checkColumnNames = false } = {}) {
  const fail2 = (kind, message, extra = {}) => ({ status: "fail", kind, message, ...extra });
  if (expected.columns.length !== got.columns.length) {
    return fail2("columns", checkColumnsMessage(expected.columns.length, got.columns.length));
  }
  if (checkColumnNames) {
    for (let i = 0; i < expected.columns.length; i++) {
      if (expected.columns[i].toLowerCase() !== got.columns[i].toLowerCase()) {
        return fail2("column-name", checkColumnNameMessage(i + 1, expected.columns[i], got.columns[i]), {
          position: i + 1,
          expected: expected.columns[i],
          got: got.columns[i]
        });
      }
    }
  }
  if (expected.values.length !== got.values.length) {
    return fail2("rows", checkRowsMessage(expected.values.length, got.values.length));
  }
  const want = prepareRows(expected.values, orderMatters);
  const have = prepareRows(got.values, orderMatters);
  let first = -1;
  for (let i = 0; i < want.length; i++) {
    if (want[i].key !== have[i].key) {
      first = i;
      break;
    }
  }
  if (first === -1) {
    return { status: "pass", rows: want.length };
  }
  const shown = (rows3) => rows3.slice(first, first + DIFF_MAX_ROWS).map((r) => Array.from(r.row, displayValue));
  const wantShown = shown(want);
  const haveShown = shown(have);
  const sorted = !orderMatters;
  return fail2("row", rowMessage(first + 1, sorted, wantShown, haveShown), {
    rowIndex: first + 1,
    sorted,
    columns: [...expected.columns],
    gotColumns: [...got.columns],
    expected: wantShown,
    got: haveShown
  });
}
function prepareRows(values, orderMatters) {
  const rows3 = values.map((row) => ({ row, key: serializeRow(row) }));
  return orderMatters ? rows3 : rows3.sort((a, b) => compareCodeUnits(a.key, b.key));
}
function rowMessage(position, sorted, expectedRows, gotRows) {
  const lines = [checkRowMessage(position, sorted)];
  for (const [label, rows3] of [
    ["expected:", expectedRows],
    ["got:", gotRows]
  ]) {
    lines.push(label);
    rows3.forEach((cells, i) => lines.push(`  row ${position + i}: ${cells.join(" | ")}`));
  }
  return lines.join("\n");
}
var unavailable = (reason, message) => ({ status: "unavailable", reason, message });
async function connect(name, bytes) {
  try {
    const database2 = await manager_default.init(name, new DatabasePath(bytes, "binary"));
    return database2 ?? null;
  } catch {
    return null;
  }
}
function disconnect(database2) {
  try {
    database2?.db.close();
  } catch {
  }
}
var NO_CONNECTION = /* @__PURE__ */ Symbol("no connection");
function withoutQuotedText(message) {
  return message.replace(/"(?:[^"]|"")*(?:"|$)|'(?:[^']|'')*(?:'|$)/g, '"…"');
}
function createChecker() {
  const cache = /* @__PURE__ */ new Map();
  function modelResult(set2, exercise, bytes) {
    const key = `${set2.id}/${exercise.id}`;
    const query = exercise.model_query;
    const hit = cache.get(key);
    if (hit && hit.query === query && hit.dataset === set2.dataset) {
      return hit.promise;
    }
    const promise = (async () => {
      const database2 = await connect("model.db", bytes);
      if (!database2) {
        return NO_CONNECTION;
      }
      try {
        const result = runSql(database2, query);
        if (result === null) {
          console.warn(`exercise "${key}" cannot be checked: its model query returns no result set`);
        }
        return result;
      } catch (exc) {
        console.warn(`exercise "${key}" cannot be checked: its model query fails: ${withoutQuotedText(engineMessage(exc))}`);
        return null;
      } finally {
        disconnect(database2);
      }
    })().then((result) => {
      if ((result === null || result === NO_CONNECTION) && cache.get(key)?.promise === promise) {
        cache.delete(key);
      }
      return result;
    });
    cache.set(key, { query, dataset: set2.dataset, promise });
    return promise;
  }
  async function check(set2, exercise, sql) {
    try {
      const dataset = getPristineId();
      if (dataset === null || dataset !== set2.dataset) {
        return unavailable("dataset", CHECK_NO_DATASET_MESSAGE);
      }
      const studentBytes = getPristineBytes();
      const modelBytes = getPristineBytes();
      if (!studentBytes || !modelBytes) {
        return unavailable("dataset", CHECK_NO_DATASET_MESSAGE);
      }
      const expected = await modelResult(set2, exercise, modelBytes);
      if (expected === NO_CONNECTION) {
        return unavailable("internal", CHECK_INTERNAL_MESSAGE);
      }
      if (expected === null) {
        return unavailable("model", CHECK_BROKEN_MESSAGE);
      }
      const database2 = await connect("check.db", studentBytes);
      if (!database2) {
        return unavailable("internal", CHECK_INTERNAL_MESSAGE);
      }
      let got;
      try {
        got = runSql(database2, sql) ?? { columns: [], values: [] };
      } catch (exc) {
        return { status: "fail", kind: "sql", message: engineMessage(exc) };
      } finally {
        disconnect(database2);
      }
      return compareResults(expected, got, {
        orderMatters: exercise.order_matters === true,
        checkColumnNames: exercise.check_column_names === true
      });
    } catch {
      return unavailable("internal", CHECK_INTERNAL_MESSAGE);
    }
  }
  return { check, clearCache: () => cache.clear() };
}

// js/lab/exercises.js
var exercises_exports = {};
__export(exercises_exports, {
  badNamesInListing: () => badNamesInListing,
  idsInListing: () => idsInListing,
  listSets: () => listSets,
  loadSet: () => loadSet,
  validateSet: () => validateSet
});
init_config();
var isId2 = (value) => typeof value === "string" && SHARE_ID_PATTERN.test(value);
var isObject = (value) => value !== null && typeof value === "object" && !Array.isArray(value);
var isText = (value) => typeof value === "string" && value.trim() !== "";
function validateSet(data, expectedId) {
  const fail2 = (problem) => ({ ok: false, message: setInvalidMessage(echo(expectedId), problem) });
  if (!isObject(data)) {
    return fail2("the top level must be an object.");
  }
  if (!isId2(data.id)) {
    return fail2('it needs an "id" of 1 to 64 letters, digits, "_" or "-".');
  }
  if (data.id !== expectedId) {
    return fail2(`its "id" is "${data.id}", but the file name says "${echo(expectedId)}"; they must match.`);
  }
  if (!isText(data.title)) {
    return fail2('it needs a "title".');
  }
  if (!isId2(data.dataset)) {
    return fail2('it needs a "dataset": the id of a dataset in datasets/manifest.json.');
  }
  if (!Array.isArray(data.exercises)) {
    return fail2('"exercises" must be a list.');
  }
  if (data.exercises.length === 0) {
    return fail2('"exercises" is empty; it needs at least one exercise.');
  }
  const seen = /* @__PURE__ */ new Set();
  const exercises = [];
  for (const [index, raw] of data.exercises.entries()) {
    const where = `exercise ${index + 1}`;
    if (!isObject(raw)) {
      return fail2(`${where} must be an object.`);
    }
    if (!isId2(raw.id)) {
      return fail2(`${where} needs an "id" of 1 to 64 letters, digits, "_" or "-" (a link carries it).`);
    }
    if (seen.has(raw.id)) {
      return fail2(`the exercise id "${raw.id}" is used more than once.`);
    }
    seen.add(raw.id);
    for (const field2 of ["title", "prompt", "model_query"]) {
      if (!isText(raw[field2])) {
        return fail2(`exercise "${raw.id}" needs a "${field2}" (text that is not blank).`);
      }
    }
    if (raw.hints !== void 0 && (!Array.isArray(raw.hints) || !raw.hints.every((h) => typeof h === "string"))) {
      return fail2(`the "hints" of exercise "${raw.id}" must be a list of text.`);
    }
    for (const field2 of ["order_matters", "check_column_names"]) {
      if (raw[field2] !== void 0 && typeof raw[field2] !== "boolean") {
        return fail2(`the "${field2}" of exercise "${raw.id}" must be true or false.`);
      }
    }
    exercises.push({
      id: raw.id,
      title: raw.title.trim(),
      prompt: raw.prompt,
      hints: raw.hints ? [...raw.hints] : [],
      model_query: raw.model_query,
      order_matters: raw.order_matters === true,
      check_column_names: raw.check_column_names === true
    });
  }
  return {
    ok: true,
    set: { id: data.id, title: data.title.trim(), dataset: data.dataset, exercises }
  };
}
function echo(id) {
  return isId2(id) ? id : "?";
}
var loaded = /* @__PURE__ */ new Map();
function loadSet(id) {
  if (!isId2(id)) {
    return Promise.resolve({ ok: false, message: SET_BAD_ID_MESSAGE });
  }
  if (!loaded.has(id)) {
    const attempt = fetchSet(id).then((result) => {
      if (!result.ok) {
        loaded.delete(id);
      }
      return result;
    });
    loaded.set(id, attempt);
  }
  return loaded.get(id);
}
async function fetchSet(id) {
  let response;
  try {
    response = await fetch(exerciseSetUrl(id), { cache: "no-cache" });
  } catch {
    return { ok: false, message: setUnreachableMessage(id) };
  }
  if (!response.ok) {
    return { ok: false, message: setUnreachableMessage(id) };
  }
  let data;
  try {
    data = await response.json();
  } catch {
    return { ok: false, message: setInvalidMessage(id, SET_NOT_JSON_MESSAGE) };
  }
  try {
    return validateSet(data, id);
  } catch {
    return { ok: false, message: setInvalidMessage(id, "it could not be read.") };
  }
}
function hrefsInListing(html) {
  try {
    const doc = new DOMParser().parseFromString(html, "text/html");
    return [...doc.querySelectorAll("a[href]")].map((link) => link.getAttribute("href"));
  } catch {
    return [];
  }
}
function idsInListing(html) {
  const ids = /* @__PURE__ */ new Set();
  for (const href of hrefsInListing(html)) {
    const name = jsonNameFromHref(href);
    if (isId2(name)) {
      ids.add(name);
    }
  }
  return [...ids].sort(compareCodeUnits2);
}
function badNamesInListing(html) {
  const names = /* @__PURE__ */ new Set();
  for (const href of hrefsInListing(html)) {
    const name = jsonNameFromHref(href);
    if (name !== null && !isId2(name) && !/[\\/]/.test(name)) {
      names.add(Array.from(name).slice(0, LISTED_NAME_MAX_CHARS).join(""));
    }
  }
  return [...names].sort(compareCodeUnits2);
}
function jsonNameFromHref(href) {
  let decoded;
  try {
    decoded = decodeURIComponent(href);
  } catch {
    return null;
  }
  return decoded.endsWith(".json") ? decoded.slice(0, -".json".length) : null;
}
var compareCodeUnits2 = (a, b) => a < b ? -1 : a > b ? 1 : 0;
async function listSets() {
  let html;
  try {
    const response = await fetch(EXERCISES_DIR, { cache: "no-cache" });
    if (!response.ok) {
      return [];
    }
    html = await response.text();
  } catch {
    return [];
  }
  const ids = idsInListing(html).slice(0, MAX_LISTED_SETS);
  const found = [
    ...ids.map((id) => ({ id, bad: false })),
    ...badNamesInListing(html).slice(0, MAX_LISTED_SETS - ids.length).map((id) => ({ id, bad: true }))
  ].sort((a, b) => compareCodeUnits2(a.id, b.id));
  return Promise.all(
    found.map(async ({ id, bad }) => {
      if (bad) {
        return { id, ok: false, problem: SET_BAD_FILE_NAME_MESSAGE };
      }
      const result = await loadSet(id);
      return result.ok ? { id, ok: true, set: result.set } : { id, ok: false, problem: result.message };
    })
  );
}

// js/lab/progress.js
var progress_exports = {};
__export(progress_exports, {
  getDraft: () => getDraft,
  isPassed: () => isPassed,
  markPassed: () => markPassed,
  passedCount: () => passedCount,
  resetSet: () => resetSet,
  saveDraft: () => saveDraft
});
init_config();

// js/lab/storage-notice.js
init_config();
var TEXTS = { log: STORAGE_NOTICE_LOG, progress: STORAGE_NOTICE_PROGRESS };
function reportStorage(what, ok) {
  try {
    if (typeof document !== "undefined" && typeof CustomEvent === "function") {
      document.dispatchEvent(new CustomEvent(STORAGE_STATE_EVENT, { detail: { what, ok } }));
    }
  } catch {
  }
}
function mountStorageNotice({ ui: ui2, before }) {
  const note = document.createElement("p");
  note.id = "storage-notice";
  note.className = "storage-notice";
  note.setAttribute("role", "status");
  note.hidden = true;
  before.before(note);
  const failing = /* @__PURE__ */ new Set();
  document.addEventListener(STORAGE_STATE_EVENT, (event) => {
    const { what, ok } = event.detail ?? {};
    if (!Object.hasOwn(TEXTS, what)) {
      return;
    }
    if (ok) {
      failing.delete(what);
    } else {
      failing.add(what);
    }
    note.textContent = Object.keys(TEXTS).filter((name) => failing.has(name)).map((name) => TEXTS[name]).join(" ");
    note.hidden = failing.size === 0;
  });
}

// js/lab/progress.js
var isId3 = (value) => typeof value === "string" && SHARE_ID_PATTERN.test(value);
var inMemory = /* @__PURE__ */ new Map();
var emptiedDrafts = /* @__PURE__ */ new Map();
var pendingResets = /* @__PURE__ */ new Set();
function emptyState() {
  return { passed: /* @__PURE__ */ new Set(), drafts: /* @__PURE__ */ new Map() };
}
function parse(text) {
  const state = emptyState();
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    return state;
  }
  if (data === null || typeof data !== "object" || Array.isArray(data) || data.v !== PROGRESS_VERSION) {
    return state;
  }
  const { passed, drafts } = data;
  if (passed !== null && typeof passed === "object" && !Array.isArray(passed)) {
    for (const [id, value] of Object.entries(passed)) {
      if (value === true && isId3(id)) {
        state.passed.add(id);
      }
    }
  }
  if (drafts !== null && typeof drafts === "object" && !Array.isArray(drafts)) {
    for (const [id, value] of Object.entries(drafts)) {
      if (typeof value === "string" && isId3(id)) {
        state.drafts.set(id, value);
      }
    }
  }
  return state;
}
function serialize(state) {
  return JSON.stringify({
    v: PROGRESS_VERSION,
    passed: Object.fromEntries([...state.passed].map((id) => [id, true])),
    drafts: Object.fromEntries(state.drafts)
  });
}
function read(setId) {
  if (inMemory.has(setId)) {
    return inMemory.get(setId);
  }
  try {
    const text = localStorage.getItem(PROGRESS_PREFIX + setId);
    return text === null ? emptyState() : parse(text);
  } catch {
    return { ...emptyState(), unread: true };
  }
}
function write(setId, state) {
  try {
    if (inMemory.has(setId) && !pendingResets.has(setId) || state.unread) {
      const text = localStorage.getItem(PROGRESS_PREFIX + setId);
      if (text !== null && text !== void 0) {
        const theirs = parse(text);
        for (const id of theirs.passed) {
          state.passed.add(id);
        }
        const emptied = emptiedDrafts.get(setId);
        for (const [id, sql] of theirs.drafts) {
          if (!state.drafts.has(id) && !emptied?.has(id)) {
            state.drafts.set(id, sql);
          }
        }
      }
    }
    localStorage.setItem(PROGRESS_PREFIX + setId, serialize(state));
    inMemory.delete(setId);
    emptiedDrafts.delete(setId);
    pendingResets.delete(setId);
    reportStorage("progress", inMemory.size === 0);
  } catch {
    inMemory.set(setId, state);
    reportStorage("progress", false);
  }
}
function isPassed(setId, exerciseId) {
  return isId3(setId) && isId3(exerciseId) && read(setId).passed.has(exerciseId);
}
function markPassed(setId, exerciseId) {
  if (!isId3(setId) || !isId3(exerciseId)) {
    return;
  }
  const state = read(setId);
  if (!state.passed.has(exerciseId)) {
    state.passed.add(exerciseId);
    write(setId, state);
  }
}
function passedCount(setId, exerciseIds = null) {
  if (!isId3(setId)) {
    return 0;
  }
  const passed = read(setId).passed;
  return exerciseIds === null ? passed.size : exerciseIds.filter((id) => passed.has(id)).length;
}
function getDraft(setId, exerciseId) {
  if (!isId3(setId) || !isId3(exerciseId)) {
    return null;
  }
  return read(setId).drafts.get(exerciseId) ?? null;
}
function saveDraft(setId, exerciseId, sql) {
  if (!isId3(setId) || !isId3(exerciseId) || typeof sql !== "string") {
    return;
  }
  const state = read(setId);
  const empty = sql.trim() === "";
  if (empty && !state.drafts.has(exerciseId) && !state.unread) {
    return;
  }
  const emptied = emptiedDrafts.get(setId) ?? /* @__PURE__ */ new Set();
  emptiedDrafts.set(setId, emptied);
  if (empty) {
    state.drafts.delete(exerciseId);
    emptied.add(exerciseId);
  } else {
    state.drafts.set(exerciseId, sql);
    emptied.delete(exerciseId);
  }
  write(setId, state);
}
function resetSet(setId) {
  if (!isId3(setId)) {
    return;
  }
  const wasInMemory = inMemory.has(setId);
  emptiedDrafts.delete(setId);
  try {
    localStorage.removeItem(PROGRESS_PREFIX + setId);
    inMemory.delete(setId);
    pendingResets.delete(setId);
    if (wasInMemory) {
      reportStorage("progress", inMemory.size === 0);
    }
  } catch {
    inMemory.set(setId, emptyState());
    pendingResets.add(setId);
    reportStorage("progress", false);
  }
}

// js/lab/exercise-panel.js
function chooseExercise(set2, requestedId) {
  const named = requestedId ? set2.exercises.find((e) => e.id === requestedId) : void 0;
  return named ?? set2.exercises.find((e) => !isPassed(set2.id, e.id)) ?? set2.exercises[0];
}
var SVG_NS2 = "http://www.w3.org/2000/svg";
function drawnTick() {
  const symbol = document.getElementById("icon-circle-check");
  if (!symbol || !symbol.children.length) {
    return icon("circle-check");
  }
  const svg = document.createElementNS(SVG_NS2, "svg");
  svg.setAttribute("class", "icon verdict-tick");
  svg.setAttribute("viewBox", symbol.getAttribute("viewBox") || "0 0 24 24");
  svg.setAttribute("aria-hidden", "true");
  svg.setAttribute("focusable", "false");
  for (const shape of symbol.children) {
    const copy = shape.cloneNode(false);
    copy.setAttribute("pathLength", "1");
    svg.append(copy);
  }
  return svg;
}
var NUMBER_TEXT = /^[-+]?(\d+(\.\d*)?|\.\d+)([eE][-+]?\d+)?$/;
var NULL_DISPLAY = "NULL";
function numericColumns(width, rows3) {
  return Array.from({ length: width }, (_, column) => {
    let seen = false;
    for (const row of rows3) {
      const cell2 = row[column];
      if (cell2 === void 0 || cell2 === NULL_DISPLAY) {
        continue;
      }
      if (!NUMBER_TEXT.test(cell2)) {
        return false;
      }
      seen = true;
    }
    return seen;
  });
}
function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) {
    node.className = className;
  }
  if (text !== void 0) {
    node.textContent = text;
  }
  return node;
}
function mountExercises({
  pickerSlot,
  ui: ui2,
  execute: execute2,
  isLoading,
  openSet: openSet2,
  closeSet,
  showTab,
  showIdle = () => {
  },
  modeChanged = () => {
  },
  say = () => {
  }
}) {
  const $ = (id) => document.getElementById(id);
  const els = {
    panel: $("exercise-panel"),
    title: $("exercise-set-title"),
    progress: $("exercise-progress"),
    progressBlock: document.querySelector(".exercise-progress-block"),
    progressFill: document.querySelector(".exercise-progress-fill"),
    empty: document.querySelector(".exercise-empty"),
    toolbar: $("editor-toolbar"),
    reset: $("exercise-reset"),
    list: $("exercise-list"),
    prompt: $("exercise-prompt"),
    hintButton: $("exercise-hint-button"),
    nav: $("exercise-nav"),
    previous: $("exercise-previous"),
    next: $("exercise-next"),
    hints: $("exercise-hints"),
    announce: $("exercise-announce"),
    feedback: $("exercise-feedback")
  };
  const checker = createChecker();
  let set2 = null;
  let current3 = null;
  let rovingId = null;
  let generation = 0;
  let checking = -1;
  let checkButton = null;
  let listed = [];
  const hintsShown = /* @__PURE__ */ new Map();
  const picker2 = el("button", "button set-picker");
  picker2.type = "button";
  picker2.id = "exercise-set-picker";
  const pickerLabel = el("span", "set-picker-label");
  picker2.append(pickerLabel, icon("chevron-down"));
  const menu = el("div", "menu menu--wide");
  menu.id = "exercise-set-menu";
  menu.setAttribute("role", "menu");
  menu.setAttribute("aria-label", SET_PICKER_MENU_LABEL);
  pickerSlot.append(picker2, menu);
  function pickerItem(value, text, { disabled = false, problem = "" } = {}) {
    const item2 = el("button", "menu-item menu-item--two-line");
    item2.type = "button";
    item2.tabIndex = -1;
    item2.setAttribute("role", "menuitemradio");
    item2.dataset.setId = value;
    const tick = icon("check");
    tick.classList.add("menu-check");
    const text_ = el("span", "menu-item-text");
    text_.append(el("span", "menu-item-label", text));
    if (problem) {
      text_.append(el("span", "menu-item-description", problem));
      item2.title = problem;
    }
    item2.append(tick, text_);
    if (disabled) {
      item2.setAttribute("aria-disabled", "true");
    }
    return item2;
  }
  let asked = null;
  const choice = () => asked ?? (set2 ? set2.id : "");
  function renderPicker() {
    const chosen = choice();
    const items = [pickerItem("", SET_PICKER_NONE)];
    for (const entry2 of listed) {
      items.push(
        entry2.ok ? pickerItem(entry2.id, entry2.set.title) : pickerItem(entry2.id, setPickerBrokenLabel(entry2.id), { disabled: true, problem: entry2.problem })
      );
    }
    if (set2 && !listed.some((e) => e.ok && e.id === set2.id)) {
      items.push(pickerItem(set2.id, set2.title));
    }
    for (const item2 of items) {
      item2.setAttribute("aria-checked", String(item2.dataset.setId === chosen));
    }
    if (!menu.matches(":popover-open")) {
      menu.replaceChildren(...items);
    } else {
      for (const item2 of menu.querySelectorAll("[data-set-id]")) {
        item2.setAttribute("aria-checked", String(item2.dataset.setId === chosen));
      }
    }
    const shown = chosen === "" ? null : listed.find((e) => e.ok && e.id === chosen)?.set ?? set2;
    const label = shown ? shown.title : SET_PICKER_NONE;
    pickerLabel.textContent = label;
    picker2.setAttribute("aria-label", `${SET_PICKER_LABEL}: ${label}`);
    picker2.disabled = items.length <= 1;
  }
  mountMenu(picker2, menu, {
    onSelect(item2) {
      const value = item2.dataset.setId;
      if (value === void 0 || value === choice()) {
        return;
      }
      if (value === "") {
        asked = set2 ? "" : null;
        closeSet();
        return;
      }
      const entry2 = listed.find((e) => e.ok && e.id === value);
      const chosen = entry2 ? entry2.set : set2 && set2.id === value ? set2 : null;
      if (chosen) {
        asked = chosen.id;
        renderPicker();
        openSet2(chosen);
      } else {
        renderPicker();
      }
    }
  });
  renderPicker();
  listSets().then((entries) => {
    listed = entries;
    renderPicker();
  }).catch(() => {
  });
  function buildList() {
    els.list.setAttribute("aria-label", exerciseListLabel(set2.title));
    els.list.replaceChildren(
      ...set2.exercises.map((exercise) => {
        const item2 = el("li", "exercise-list-item");
        const button = el("button", "exercise-item");
        button.type = "button";
        button.dataset.exerciseId = exercise.id;
        button.title = exercise.title;
        const mark = el("span", "exercise-item-mark");
        mark.setAttribute("aria-hidden", "true");
        const passedIcon = icon("circle-check");
        passedIcon.classList.add("exercise-mark-passed");
        const openIcon = icon("circle");
        openIcon.classList.add("exercise-mark-open");
        mark.append(passedIcon, openIcon);
        const number = el("span", "exercise-item-number");
        number.setAttribute("aria-hidden", "true");
        button.append(mark, number, el("span", "exercise-item-title", exercise.title));
        item2.append(button);
        return item2;
      })
    );
    refreshList();
  }
  function itemButtons() {
    return [...els.list.querySelectorAll("button.exercise-item")];
  }
  function refreshList() {
    const total = set2.exercises.length;
    itemButtons().forEach((button, index) => {
      const exercise = set2.exercises[index];
      const passed = isPassed(set2.id, exercise.id);
      const active = exercise.id === current3.id;
      button.querySelector(".exercise-mark-passed").classList.toggle("hidden", !passed);
      button.querySelector(".exercise-mark-open").classList.toggle("hidden", passed);
      button.setAttribute("aria-label", exerciseButtonLabel(index + 1, total, exercise.title, passed));
      button.classList.toggle("exercise-item--passed", passed);
      if (active) {
        button.setAttribute("aria-current", "true");
      } else {
        button.removeAttribute("aria-current");
      }
      button.tabIndex = exercise.id === rovingId ? 0 : -1;
    });
  }
  function refreshProgress() {
    const passed = passedCount(set2.id, set2.exercises.map((e) => e.id));
    els.progress.textContent = exerciseProgressText(passed, set2.exercises.length);
    els.progressFill.style.width = `${100 * passed / set2.exercises.length}%`;
  }
  els.list.addEventListener("click", (event) => {
    const button = event.target.closest("button.exercise-item");
    if (button && set2) {
      select(button.dataset.exerciseId);
    }
  });
  els.list.addEventListener("focusin", (event) => {
    const button = event.target.closest("button.exercise-item");
    if (button && button.dataset.exerciseId !== rovingId) {
      rovingId = button.dataset.exerciseId;
      refreshList();
    }
  });
  els.list.addEventListener("keydown", (event) => {
    const button = event.target.closest("button.exercise-item");
    if (!button || event.altKey || event.ctrlKey || event.metaKey) {
      return;
    }
    const buttons = itemButtons();
    const at = buttons.indexOf(button);
    const moves = {
      ArrowRight: at + 1,
      ArrowDown: at + 1,
      ArrowLeft: at - 1,
      ArrowUp: at - 1,
      Home: 0,
      End: buttons.length - 1
    };
    if (event.key in moves) {
      event.preventDefault();
      buttons[Math.max(0, Math.min(buttons.length - 1, moves[event.key]))].focus();
    }
  });
  const hintKey = () => `${set2.id}/${current3.id}`;
  function hintItem(position, text) {
    const item2 = el("li", "exercise-hint");
    item2.append(el("span", "visually-hidden", `${exerciseHintLabel(position)}: `), document.createTextNode(text));
    return item2;
  }
  function renderPrompt() {
    const position = set2.exercises.indexOf(current3) + 1;
    const heading = el("div", "exercise-heading");
    const title = el("h2", "exercise-title", current3.title);
    title.id = "exercise-prompt-title";
    heading.append(title, el("p", "exercise-kicker", `Exercise ${position} of ${set2.exercises.length}`));
    els.prompt.replaceChildren(heading, el("p", "exercise-text", current3.prompt));
  }
  function renderHints() {
    const shown = hintsShown.get(hintKey()) ?? 0;
    els.hints.removeAttribute("aria-live");
    els.hints.replaceChildren(...current3.hints.slice(0, shown).map((text, i) => hintItem(i + 1, text)));
    els.hints.hidden = shown === 0;
    requestAnimationFrame(() => els.hints.setAttribute("aria-live", "polite"));
    refreshHintButton();
  }
  function refreshHintButton() {
    const shown = hintsShown.get(hintKey()) ?? 0;
    const total = current3.hints.length;
    els.hintButton.hidden = shown >= total;
    els.hintButton.textContent = shown < total ? exerciseHintText(shown + 1, total) : "";
  }
  els.hints.setAttribute("aria-label", EXERCISE_HINTS_LABEL);
  els.hintButton.addEventListener("click", () => {
    if (!set2) {
      return;
    }
    const shown = hintsShown.get(hintKey()) ?? 0;
    if (shown >= current3.hints.length) {
      return;
    }
    const hadFocus = document.activeElement === els.hintButton;
    hintsShown.set(hintKey(), shown + 1);
    const item2 = hintItem(shown + 1, current3.hints[shown]);
    item2.tabIndex = -1;
    els.hints.append(item2);
    els.hints.hidden = false;
    refreshHintButton();
    if (hadFocus && els.hintButton.hidden) {
      item2.focus();
    }
    item2.scrollIntoView?.({ block: "nearest" });
  });
  els.previous.textContent = EXERCISE_PREVIOUS_TEXT;
  els.next.textContent = EXERCISE_NEXT_TEXT;
  els.nav.setAttribute("aria-label", EXERCISE_NAV_LABEL);
  function neighbour(step) {
    return set2.exercises[set2.exercises.indexOf(current3) + step] ?? null;
  }
  function refreshNav() {
    for (const [button, step, endText] of [
      [els.previous, -1, EXERCISE_FIRST_TEXT],
      [els.next, 1, EXERCISE_LAST_TEXT]
    ]) {
      const target = neighbour(step);
      if (target) {
        button.removeAttribute("aria-disabled");
        button.title = exerciseTargetText(set2.exercises.indexOf(target) + 1, set2.exercises.length, target.title);
      } else {
        button.setAttribute("aria-disabled", "true");
        button.title = endText;
      }
    }
  }
  for (const [button, step] of [
    [els.previous, -1],
    [els.next, 1]
  ]) {
    button.addEventListener("click", () => {
      const target = set2 && button.getAttribute("aria-disabled") !== "true" ? neighbour(step) : null;
      if (target) {
        select(target.id);
      }
    });
  }
  function clearFeedback() {
    els.feedback.replaceChildren();
    els.feedback.hidden = true;
  }
  function verdictMark(kind) {
    let mark;
    if (kind === "pass") {
      mark = drawnTick();
    } else if (kind === "fail") {
      mark = icon("circle-x");
    } else if (kind === "warning") {
      mark = icon("circle-alert");
    } else {
      mark = icon("info");
    }
    mark.classList.add("verdict-mark");
    return mark;
  }
  function showVerdict(kind, headline, { message = null, lines = [], action = null, after = [], spoken = null } = {}) {
    const box = el("div", `verdict verdict--${kind}`);
    const band2 = el("div", "verdict-band");
    const text = el("div", "verdict-text");
    const head = el("p", "verdict-head");
    head.append(el("strong", "verdict-headline", headline));
    text.append(head, ...message ? [" ", message] : [], ...lines);
    band2.append(verdictMark(kind), text);
    if (action) {
      band2.append(action);
    }
    box.append(band2, ...after);
    const hadFocus = els.feedback.contains(document.activeElement);
    els.feedback.replaceChildren(box);
    els.feedback.hidden = false;
    if (hadFocus) {
      const again = box.querySelector(".verdict-next");
      if (again) {
        again.focus();
      } else {
        box.tabIndex = -1;
        box.focus();
      }
    }
    const pane = els.feedback.parentElement;
    if (pane && pane.scrollTop > els.feedback.offsetTop) {
      pane.scrollTop = els.feedback.offsetTop;
    }
    say(
      [headline, spoken ?? message?.textContent, ...lines.map((line) => line.textContent)].filter(Boolean).map(sentence).join(" ")
    );
  }
  function sentence(text) {
    return /[.!?]$/.test(text) ? text : `${text}.`;
  }
  function compareView(outcome) {
    const differs = (i, j) => outcome.expected[i]?.[j] !== outcome.got[i]?.[j];
    const hidden = outcome.got.length > 0 && !outcome.got[0].some((_, j) => differs(0, j));
    const yours = side(CHECK_GOT_LABEL, outcome.gotColumns, outcome.got, outcome.rowIndex, (i, j) => differs(i, j) || hidden && i === 0);
    yours.append(el("p", "verdict-note verdict-diff-note", VERDICT_DIFF_NOTE));
    if (hidden) {
      yours.append(el("p", "verdict-note verdict-diff-note", verdictHiddenDiffNote(outcome.rowIndex)));
    }
    const expected = side(CHECK_EXPECTED_LABEL, outcome.columns, outcome.expected, outcome.rowIndex, null);
    linkScroll(expected.querySelector(".verdict-scroll"), yours.querySelector(".verdict-scroll"));
    const diff = el("div", "verdict-diff");
    diff.append(expected, yours);
    const scrollNote = el("p", "verdict-note verdict-scroll-note", VERDICT_SCROLL_NOTE);
    scrollNote.hidden = true;
    return [diff, scrollNote];
  }
  function linkScroll(a, b) {
    const echoes = /* @__PURE__ */ new Map([
      [a, null],
      [b, null]
    ]);
    for (const [box, other] of [
      [a, b],
      [b, a]
    ]) {
      box.addEventListener("scroll", () => {
        if (echoes.get(box) === box.scrollLeft) {
          echoes.set(box, null);
          return;
        }
        if (other.scrollLeft !== box.scrollLeft) {
          other.scrollLeft = box.scrollLeft;
          echoes.set(other, other.scrollLeft);
        }
      });
    }
  }
  function revealDifference() {
    const cell2 = els.feedback.querySelector(".verdict-cell--differs");
    const box = cell2?.closest(".verdict-scroll");
    if (!box || box.scrollWidth <= box.clientWidth) {
      return;
    }
    if (cell2.offsetLeft >= box.scrollLeft && cell2.offsetLeft + cell2.offsetWidth <= box.scrollLeft + box.clientWidth) {
      return;
    }
    const before = box.querySelector(".verdict-row-number")?.offsetWidth ?? 0;
    box.scrollLeft = Math.max(0, cell2.offsetLeft - before);
  }
  function side(caption, columns, rows3, firstRow, outlined) {
    const column = el("div", "verdict-side");
    const wrap = el("div", "verdict-scroll");
    wrap.setAttribute("role", "region");
    wrap.setAttribute("aria-label", caption);
    const table = el("table", "verdict-table");
    table.append(el("caption", null, caption));
    const numeric = numericColumns(columns.length, rows3);
    const headRow = el("tr");
    const corner = el("th", "verdict-row-number", CHECK_ROW_HEADER);
    corner.scope = "col";
    headRow.append(corner);
    columns.forEach((name, j) => {
      const th = el("th", numeric[j] ? "num" : null, name);
      th.scope = "col";
      headRow.append(th);
    });
    const body = el("tbody");
    rows3.forEach((cells, i) => {
      const tr = el("tr");
      const number = el("th", "verdict-row-number", String(firstRow + i));
      number.scope = "row";
      tr.append(number);
      cells.forEach((cell2, j) => {
        const td = el("td", numeric[j] ? "num" : null, cell2);
        if (outlined?.(i, j)) {
          td.classList.add("verdict-cell--differs");
          td.append(el("span", "visually-hidden", CHECK_DIFFERS_TEXT));
        }
        tr.append(td);
      });
      body.append(tr);
    });
    table.append(el("thead"), body);
    table.tHead.append(headRow);
    wrap.append(table);
    column.append(wrap);
    return column;
  }
  function refreshScroll() {
    let overflow = false;
    for (const box of els.feedback.querySelectorAll(".verdict-scroll")) {
      const wide = box.scrollWidth > box.clientWidth + 1;
      overflow ||= wide;
      if (wide) {
        box.tabIndex = 0;
      } else {
        box.removeAttribute("tabindex");
      }
    }
    const note = els.feedback.querySelector(".verdict-scroll-note");
    if (note) {
      note.hidden = !overflow;
    }
  }
  if (typeof ResizeObserver === "function") {
    new ResizeObserver(refreshScroll).observe(els.feedback);
  } else {
    window.addEventListener("resize", refreshScroll);
  }
  function nextUnpassed() {
    const at = set2.exercises.indexOf(current3);
    for (let step = 1; step < set2.exercises.length; step++) {
      const candidate = set2.exercises[(at + step) % set2.exercises.length];
      if (!isPassed(set2.id, candidate.id)) {
        return candidate;
      }
    }
    return null;
  }
  function nextButton(next) {
    const openedSet = set2;
    const button = el("button", "button verdict-next", NEXT_EXERCISE_TEXT);
    button.type = "button";
    button.title = exerciseTargetText(set2.exercises.indexOf(next) + 1, set2.exercises.length, next.title);
    button.addEventListener("click", () => {
      if (set2 === openedSet) {
        select(next.id);
        ui2.editor.focus();
      }
    });
    return button;
  }
  function showPass(outcome) {
    const sentence2 = Number.isInteger(outcome.rows) ? checkPassMessage(outcome.rows) : CHECK_PASS_MESSAGE;
    const next = nextUnpassed();
    const lines = [];
    if (!next && passedCount(set2.id, set2.exercises.map((e) => e.id)) === set2.exercises.length) {
      lines.push(el("p", "verdict-message verdict-complete", exerciseAllCompleteText(set2.exercises.length)));
    }
    showVerdict("pass", CHECK_PASS_HEADLINE, {
      message: el("p", "verdict-message", sentence2),
      lines,
      action: next ? nextButton(next) : null
    });
  }
  function showOutcome(outcome, ran, runError = null) {
    if (outcome.status === "pass") {
      showPass(outcome);
      return;
    }
    if (outcome.status !== "fail") {
      showVerdict("warning", CHECK_UNAVAILABLE_HEADLINE, { message: el("p", "verdict-message", outcome.message) });
      return;
    }
    const message = el("p", "verdict-message");
    const shownBelow = outcome.kind === "sql" && !ran && runError && engineMessage(runError) === outcome.message;
    if (shownBelow) {
      message.textContent = CHECK_SQL_ERROR_BELOW;
    } else if (outcome.kind === "sql") {
      message.append(el("span", "verdict-engine", outcome.message));
    } else {
      message.classList.add("verdict-message--checker");
      message.textContent = outcome.kind === "row" ? outcome.message.split("\n")[0] : outcome.message;
      if (!/[.!?]$/.test(message.textContent)) {
        message.classList.add("verdict-message--fragment");
      }
    }
    const lines = outcome.kind === "sql" && ran ? [el("p", "verdict-note", CHECK_COPY_NOTE)] : [];
    showVerdict("fail", CHECK_FAIL_HEADLINE, {
      message,
      lines,
      after: outcome.kind === "row" ? compareView(outcome) : [],
      spoken: shownBelow ? outcome.message : null
    });
    refreshScroll();
    revealDifference();
  }
  async function runCheck() {
    if (!set2 || !current3 || checking === generation) {
      return;
    }
    const sql = ui2.editor.query;
    if (!sql.trim()) {
      showVerdict("info", CHECK_EMPTY_HEADLINE, { message: el("p", "verdict-message", CHECK_EMPTY_MESSAGE) });
      return;
    }
    if (isLoading()) {
      execute2(sql).catch(() => {
      });
      return;
    }
    const token = generation;
    const checkedSet = set2;
    const exercise = current3;
    checking = token;
    checkButton?.setAttribute("aria-busy", "true");
    try {
      let ran = true;
      let runError = null;
      try {
        await execute2(sql);
      } catch (exc) {
        if (exc?.dropped) {
          return;
        }
        ran = false;
        runError = exc ?? null;
      }
      const outcome = await checker.check(checkedSet, exercise, sql);
      if (token !== generation) {
        return;
      }
      if (outcome.status === "pass") {
        markPassed(checkedSet.id, exercise.id);
        refreshList();
        refreshProgress();
      }
      showOutcome(outcome, ran, runError);
    } finally {
      if (checking === token) {
        checking = -1;
      }
      checkButton?.removeAttribute("aria-busy");
    }
  }
  document.addEventListener(
    "keydown",
    (event) => {
      if (!set2 || event.key !== "Enter" || !event.shiftKey || !(event.ctrlKey || event.metaKey)) {
        return;
      }
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();
      if (!event.repeat && !event.isComposing) {
        runCheck();
      }
    },
    true
  );
  function addCheckButton() {
    if (checkButton) {
      return;
    }
    checkButton = el("button", "button button--primary");
    checkButton.type = "button";
    checkButton.id = "exercise-check";
    checkButton.title = CHECK_BUTTON_TITLE;
    const hint = el("span", "shortcut");
    hint.setAttribute("aria-hidden", "true");
    hint.append(el("span", null, MOD_KEY), " Shift Enter");
    checkButton.append(icon("check"), el("span", null, CHECK_BUTTON_TEXT), hint);
    checkButton.setAttribute("aria-keyshortcuts", "Control+Shift+Enter Meta+Shift+Enter");
    checkButton.addEventListener("click", () => {
      runCheck();
    });
    document.getElementById("execute").after(checkButton);
    els.toolbar.classList.add("editor-toolbar--exercise");
  }
  function removeCheckButton() {
    checkButton?.remove();
    checkButton = null;
    els.toolbar.classList.remove("editor-toolbar--exercise");
  }
  function resetWorkArea() {
    showIdle();
  }
  function enter(newSet, exerciseId) {
    generation++;
    asked = null;
    set2 = newSet;
    current3 = chooseExercise(newSet, exerciseId);
    rovingId = current3.id;
    els.title.textContent = set2.title;
    els.title.hidden = false;
    els.panel.hidden = false;
    els.progressBlock.hidden = false;
    els.reset.hidden = false;
    els.empty.hidden = true;
    addCheckButton();
    buildList();
    refreshProgress();
    renderPrompt();
    renderHints();
    refreshNav();
    clearFeedback();
    renderPicker();
    setShareContext({ set: set2.id, exercise: current3.id });
    showTab();
    modeChanged();
  }
  function leave() {
    generation++;
    asked = null;
    set2 = null;
    current3 = null;
    rovingId = null;
    els.title.textContent = "";
    els.title.hidden = true;
    els.panel.hidden = true;
    els.progressBlock.hidden = true;
    els.reset.hidden = true;
    els.empty.hidden = false;
    removeCheckButton();
    els.list.replaceChildren();
    els.prompt.replaceChildren();
    els.hints.replaceChildren();
    clearFeedback();
    renderPicker();
    setShareContext({ set: null, exercise: null });
    modeChanged();
  }
  function announceExercise() {
    els.announce.textContent = exerciseAnnouncement(
      set2.exercises.indexOf(current3) + 1,
      set2.exercises.length,
      current3.title,
      current3.prompt
    );
  }
  function select(id) {
    const next = set2.exercises.find((e) => e.id === id);
    if (!next || next === current3) {
      return;
    }
    generation++;
    current3 = next;
    rovingId = next.id;
    ui2.editor.value = getDraft(set2.id, next.id) ?? "";
    resetWorkArea();
    refreshList();
    renderPrompt();
    renderHints();
    refreshNav();
    clearFeedback();
    setShareContext({ exercise: next.id });
    announceExercise();
    history.replaceState(
      history.state,
      "",
      `?${SET_PARAM}=${encodeURIComponent(set2.id)}&${EXERCISE_PARAM}=${encodeURIComponent(next.id)}`
    );
  }
  els.reset.textContent = EXERCISE_RESET_TEXT;
  els.reset.title = EXERCISE_RESET_TITLE;
  els.reset.addEventListener("click", () => {
    if (!set2 || !window.confirm(exerciseResetConfirm(set2.title))) {
      return;
    }
    resetSet(set2.id);
    refreshList();
    refreshProgress();
    clearFeedback();
  });
  ui2.editor.addEventListener("input", () => {
    if (set2) {
      saveDraft(set2.id, current3.id, ui2.editor.value);
    }
  });
  document.addEventListener("lab:run-finished", (event) => {
    if (set2 && !event.detail.preview) {
      saveDraft(set2.id, current3.id, ui2.editor.value);
    }
  });
  document.addEventListener("lab:database-loaded", (event) => {
    const exercise = event.detail.exercise;
    if (exercise) {
      enter(exercise.set, exercise.exerciseId);
    } else {
      leave();
    }
  });
  clearFeedback();
  return {
    editorSql({ set: openingSet, exerciseId }, linkSql) {
      return linkSql ?? getDraft(openingSet.id, chooseExercise(openingSet, exerciseId).id) ?? "";
    },
    open(openingSet, exerciseId) {
      const chosen = chooseExercise(openingSet, exerciseId);
      ui2.editor.value = getDraft(openingSet.id, chosen.id) ?? "";
      enter(openingSet, chosen.id);
      resetWorkArea();
    },
    close: leave,
    isOpen: () => Boolean(set2),
    // a pick that failed or was cancelled: the picker shows what is open again
    syncPicker() {
      asked = null;
      renderPicker();
    }
  };
}

// js/lab/export.js
init_config();
var DB_EXTENSION = /\.(db|sqlite|sqlite3)$/i;
function safeBaseName(name) {
  const base = String(name ?? "").replace(/\.sql$/i, "").replace(/[\u0000-\u001f\u007f\\/:*?"<>|]+/g, "_").replace(/^[\s.]+|[\s.]+$/g, "").slice(0, 100);
  return !base || /^_+$/.test(base) ? EXPORT_FALLBACK_NAME : base;
}
function exportFileName(name) {
  const base = safeBaseName(name);
  return DB_EXTENSION.test(base) ? base : `${base}.db`;
}
function isEmpty(database2) {
  return database2.db.selectValue("select count(*) from sqlite_schema") === 0;
}
function exportProblem(database2) {
  try {
    return isEmpty(database2) ? EXPORT_EMPTY_MESSAGE : null;
  } catch {
    return null;
  }
}
function serializeDatabase(database2) {
  try {
    if (isEmpty(database2)) {
      return { ok: false, message: EXPORT_EMPTY_MESSAGE };
    }
    const bytes = database2.capi.sqlite3_js_db_export(database2.db.pointer);
    if (!bytes || !bytes.length) {
      return { ok: false, message: EXPORT_EMPTY_MESSAGE };
    }
    return { ok: true, bytes, filename: exportFileName(database2.name) };
  } catch {
    return { ok: false, message: EXPORT_FAILED_MESSAGE };
  }
}
function saveFile(data, filename, type) {
  const blob = new Blob([data], { type });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.hidden = true;
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1e4);
}
function createExportAction(getDatabase) {
  return function exportDatabase() {
    const database2 = getDatabase();
    if (!database2) {
      toast(EXPORT_EMPTY_MESSAGE, { tone: "problem" });
      return Promise.resolve();
    }
    const result = serializeDatabase(database2);
    if (!result.ok) {
      toast(result.message, { tone: "problem" });
      return Promise.resolve();
    }
    try {
      saveFile(result.bytes, result.filename, "application/vnd.sqlite3");
    } catch {
      toast(EXPORT_FAILED_MESSAGE, { tone: "problem" });
      return Promise.resolve();
    }
    toast(exportedMessage(result.filename));
    return Promise.resolve();
  };
}

// js/lab/export-dialog.js
init_config();
function el2(tag, props = {}, text = "") {
  const node = document.createElement(tag);
  Object.assign(node, props);
  if (text) {
    node.textContent = text;
  }
  return node;
}
function mountExportDialog({ returnFocus, getName, getProblem = () => null, onExport, onNoDatabase }) {
  const dialog = el2("dialog", { id: "export-dialog", className: "app-dialog" });
  dialog.setAttribute("aria-labelledby", "export-dialog-title");
  const form = el2("form", { method: "dialog", noValidate: true });
  const input = el2("input", { id: "export-name", type: "text", autocomplete: "off", spellcheck: false, className: "app-dialog-input" });
  input.setAttribute("autocapitalize", "off");
  input.setAttribute("autocorrect", "off");
  input.setAttribute("aria-describedby", "export-name-hint");
  const submit = el2("button", { type: "submit", className: "button button--primary" }, EXPORT_SUBMIT_TEXT);
  const cancel = el2("button", { type: "button", className: "button" }, EXPORT_CANCEL_TEXT);
  const actions2 = el2("div", { className: "app-dialog-actions" });
  actions2.append(submit, cancel);
  form.append(
    el2("h2", { id: "export-dialog-title", className: "app-dialog-title" }, EXPORT_DIALOG_TITLE),
    el2("p", { className: "app-dialog-text" }, EXPORT_DIALOG_TEXT),
    el2("label", { htmlFor: "export-name", className: "app-dialog-label" }, EXPORT_NAME_LABEL),
    input,
    el2("p", { id: "export-name-hint", className: "app-dialog-hint" }, EXPORT_NAME_HINT),
    actions2
  );
  dialog.append(form);
  document.body.append(dialog);
  function open() {
    const name = getName();
    if (name === null) {
      onNoDatabase(NO_DATABASE_MESSAGE);
      return;
    }
    const problem = getProblem();
    if (problem) {
      onNoDatabase(problem);
      return;
    }
    input.value = name;
    if (!dialog.open) {
      dialog.showModal();
    }
    input.focus();
    input.select();
  }
  function close() {
    if (dialog.open) {
      dialog.close();
    }
    returnFocus.focus();
  }
  form.addEventListener("submit", (event) => {
    event.preventDefault();
    const name = input.value.trim() || getName();
    close();
    onExport(name);
  });
  cancel.addEventListener("click", close);
  dialog.addEventListener("close", () => {
    const focused = document.activeElement;
    if (!focused || focused === document.body || dialog.contains(focused)) {
      returnFocus.focus();
    }
  });
  document.addEventListener("lab:database-loaded", () => {
    if (dialog.open) {
      dialog.close();
    }
  });
  return { open };
}

// js/lab/export-menu.js
init_config();
function item(id, glyph, label, description) {
  const node = document.createElement("button");
  node.type = "button";
  node.id = id;
  node.className = "menu-item menu-item--two-line";
  node.tabIndex = -1;
  node.setAttribute("role", "menuitem");
  const text = document.createElement("span");
  text.className = "menu-item-text";
  const title = document.createElement("span");
  title.className = "menu-item-label";
  title.textContent = label;
  const line = document.createElement("span");
  line.className = "menu-item-description";
  line.textContent = description;
  text.append(title, line);
  node.append(glyph, text);
  return node;
}
function mountExportMenu({ button, menu, onDatabase, results: results2, evidence: evidence2 }) {
  menu.setAttribute("aria-label", EXPORT_MENU_LABEL);
  const database2 = item("export-db", icon("database"), EXPORT_DATABASE_TEXT, EXPORT_BUTTON_TITLE);
  const csv = item("export-csv", icon("sheet"), EXPORT_RESULTS_TEXT, EXPORT_RESULTS_DESCRIPTION);
  const record = item("export-evidence", icon("file-text"), EXPORT_EVIDENCE_TEXT, EXPORT_EVIDENCE_DESCRIPTION);
  menu.replaceChildren(database2, csv, record);
  function syncCsv() {
    const ready = results2.canDownload();
    csv.setAttribute("aria-disabled", String(!ready));
    csv.querySelector(".menu-item-description").textContent = ready ? EXPORT_RESULTS_DESCRIPTION : EXPORT_RESULTS_NONE;
  }
  mountMenu(button, menu, {
    onOpen: syncCsv,
    onSelect(chosen) {
      if (chosen === database2) {
        onDatabase();
      } else if (chosen === csv) {
        results2.download();
      } else if (chosen === record) {
        evidence2.open();
      }
    }
  });
  syncCsv();
}

// js/lab/evidence-dialog.js
init_config();

// js/lab/evidence.js
init_config();
var FIRST_LINE = new RegExp(`^.* ${EVIDENCE_TITLE_SUFFIX}$`);
var HEADER_LINE = new RegExp(
  `^\\[(\\d+)\\] \\d{4}-\\d{2}-\\d{2}T\\d{2}:\\d{2}:\\d{2}Z ${EVIDENCE_MIDDLE_DOT} (?:\\d+ rows?|error: .*)$`
);
var LINE_BREAKERS = /[\u0000-\u001f\u007f\u0085\u2028\u2029]/;
function utcTimestamp(date = /* @__PURE__ */ new Date()) {
  return `${date.toISOString().slice(0, 19)}Z`;
}
function sanitizeLine(text) {
  return String(text).replace(new RegExp(LINE_BREAKERS.source, "g"), "_");
}
var normalizeNewlines = (text) => String(text).replace(/\r\n?/g, "\n");
function escapeSql(sql) {
  return normalizeNewlines(sql).split("\n").map((line) => HEADER_LINE.test(line) ? `${EVIDENCE_SQL_ESCAPE}${line}` : line).join("\n");
}
function outcomeText(entry2) {
  if (typeof entry2.error === "string") {
    return `error: ${entry2.error.replace(/\s+/g, " ").trim()}`;
  }
  return `${entry2.rows} ${entry2.rows === 1 ? "row" : "rows"}`;
}
function formatEvidence({ entries, dataset, exported, student }) {
  if (!Array.isArray(entries) || entries.length === 0) {
    throw new RangeError("no entries to export");
  }
  if (typeof student !== "string" || !student || LINE_BREAKERS.test(student)) {
    throw new RangeError("the student number cannot be written on one line");
  }
  const lines = [
    `${sanitizeLine(APP_NAME)} ${EVIDENCE_TITLE_SUFFIX}`,
    `dataset: ${sanitizeLine(dataset)}`,
    `exported: ${exported}`,
    ""
  ];
  entries.forEach((entry2, index) => {
    lines.push(`[${index + 1}] ${entry2.t} ${EVIDENCE_MIDDLE_DOT} ${outcomeText(entry2)}`);
    lines.push(escapeSql(entry2.sql));
    if (entry2.link) {
      lines.push(`link: ${entry2.link}`);
    }
    lines.push("");
  });
  lines.push(`student: ${student}`);
  return lines.join("\n") + "\n";
}
function hasCrypto() {
  return typeof globalThis.crypto?.subtle?.digest === "function";
}
async function sha256Hex(text) {
  if (!hasCrypto()) {
    throw new Error(EVIDENCE_NO_CRYPTO_MESSAGE);
  }
  const bytes = new TextEncoder().encode(text);
  const digest = new Uint8Array(await globalThis.crypto.subtle.digest("SHA-256", bytes));
  return Array.from(digest, (b) => b.toString(16).padStart(2, "0")).join("");
}
async function buildEvidence(input) {
  const body = formatEvidence(input);
  return `${body}sha256: ${await sha256Hex(body)}
`;
}

// js/lab/run-log.js
var run_log_exports = {};
__export(run_log_exports, {
  appendLog: () => appendLog,
  isDatasetKey: () => isDatasetKey,
  logKeyFor: () => logKeyFor,
  mountRunLog: () => mountRunLog,
  readLog: () => readLog
});
init_config();
var TIMESTAMP = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/;
function logKeyFor(dataset, databaseName) {
  return dataset ? dataset.id : `${RUN_LOG_FILE_PREFIX}${databaseName ?? ""}`;
}
function isDatasetKey(key) {
  return typeof key === "string" && SHARE_ID_PATTERN.test(key);
}
var memory2 = /* @__PURE__ */ new Map();
function isEntry(entry2) {
  if (entry2 === null || typeof entry2 !== "object" || Array.isArray(entry2)) {
    return false;
  }
  if (typeof entry2.t !== "string" || !TIMESTAMP.test(entry2.t) || typeof entry2.sql !== "string" || !entry2.sql) {
    return false;
  }
  const hasRows = Object.hasOwn(entry2, "rows");
  const hasError = Object.hasOwn(entry2, "error");
  if (hasRows === hasError) {
    return false;
  }
  return hasRows ? Number.isSafeInteger(entry2.rows) && entry2.rows >= 0 : typeof entry2.error === "string" && entry2.error !== "";
}
function copyEntry(entry2) {
  return entry2.error !== void 0 ? { t: entry2.t, sql: entry2.sql, error: entry2.error } : { t: entry2.t, sql: entry2.sql, rows: entry2.rows };
}
function parseLog(text) {
  try {
    const data = JSON.parse(text);
    if (data === null || typeof data !== "object" || data.v !== RUN_LOG_VERSION || !Array.isArray(data.entries)) {
      return [];
    }
    return data.entries.filter(isEntry).map(copyEntry).slice(-RUN_LOG_MAX_ENTRIES);
  } catch {
    return [];
  }
}
var storageKey2 = (key) => `${RUN_LOG_PREFIX}${key}`;
function stored(key) {
  try {
    const text = localStorage.getItem(storageKey2(key));
    return text === null || text === void 0 ? [] : parseLog(text);
  } catch {
    return null;
  }
}
var sameEntry = (a, b) => a.t === b.t && a.sql === b.sql && a.rows === b.rows && a.error === b.error;
var encoder = new TextEncoder();
var byteLength = (text) => encoder.encode(text).length;
function cap(entries) {
  const newest = entries.slice(-RUN_LOG_MAX_ENTRIES);
  let total = 0;
  let from = newest.length;
  while (from > 0) {
    const entry2 = newest[from - 1];
    const size = byteLength(entry2.sql) + (entry2.error === void 0 ? 0 : byteLength(entry2.error));
    if (from < newest.length && total + size > RUN_LOG_MAX_BYTES) {
      break;
    }
    total += size;
    from--;
  }
  return newest.slice(from);
}
function combine(mine, theirs) {
  const left = mine.slice();
  const others = [];
  for (const entry2 of theirs) {
    const at = left.findIndex((own) => sameEntry(own, entry2));
    if (at === -1) {
      others.push(entry2);
    } else {
      left.splice(at, 1);
    }
  }
  return others.length ? mine.concat(others).sort((a, b) => a.t < b.t ? -1 : a.t > b.t ? 1 : 0) : mine.slice();
}
function current(key) {
  const theirs = stored(key) ?? [];
  return memory2.has(key) ? cap(combine(memory2.get(key), theirs)) : theirs;
}
function readLog(key) {
  return current(key);
}
function write2(key, entries) {
  try {
    localStorage.setItem(storageKey2(key), JSON.stringify({ v: RUN_LOG_VERSION, entries }));
    return true;
  } catch {
    return false;
  }
}
function commit(key, added) {
  try {
    const theirs = stored(key);
    const own = memory2.get(key);
    const capped = cap((own ? combine(own, theirs ?? []) : theirs ?? []).concat(added));
    if (theirs === null) {
      memory2.set(key, capped);
      reportStorage("log", false);
      return;
    }
    let kept = capped;
    let written = write2(key, kept);
    while (!written && kept.length > 1) {
      kept = kept.slice(1);
      written = write2(key, kept);
    }
    if (written && kept.length === capped.length) {
      memory2.delete(key);
      reportStorage("log", memory2.size === 0);
    } else {
      memory2.set(key, capped);
      reportStorage("log", false);
    }
  } catch {
  }
}
function appendLog(key, entry2) {
  try {
    commit(key, [copyEntry(entry2)]);
  } catch {
  }
}
var oneLine = (text) => String(text).replace(/\s+/g, " ").trim();
function sqlPreview(sql) {
  const lines = String(sql).split(/\r\n|\r|\n/).map(oneLine).filter(Boolean);
  const first = lines[0] ?? "";
  const chars = Array.from(first);
  if (chars.length > HISTORY_SQL_PREVIEW_CHARS) {
    return `${chars.slice(0, HISTORY_SQL_PREVIEW_CHARS).join("").trimEnd()}${STATEMENT_ELLIPSIS}`;
  }
  return lines.length > 1 ? `${first} ${STATEMENT_ELLIPSIS}` : first;
}
function span(className, text) {
  const el7 = document.createElement("span");
  el7.className = className;
  el7.textContent = text;
  return el7;
}
function mountRunLog({ ui: ui2, list, isShown = () => true }) {
  const editor = ui2.editor;
  const keys = /* @__PURE__ */ new WeakMap();
  let currentKey = null;
  let shown = [];
  let roving = 0;
  list.setAttribute("role", "group");
  list.setAttribute("aria-label", HISTORY_LIST_LABEL);
  const entryButtons = () => [...list.querySelectorAll("button.run-history-entry")];
  function render() {
    const focusedIndex = list.contains(document.activeElement) ? Number(document.activeElement.dataset.index) : null;
    shown = currentKey === null ? [] : readLog(currentKey).reverse();
    list.replaceChildren();
    if (!shown.length) {
      const empty = document.createElement("p");
      empty.className = "run-history-empty";
      empty.textContent = HISTORY_EMPTY_MESSAGE;
      list.append(empty);
      return;
    }
    roving = Math.min(roving, shown.length - 1);
    shown.forEach((entry2, index) => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "run-history-entry";
      button.dataset.index = String(index);
      button.tabIndex = index === roving ? 0 : -1;
      const failed = entry2.error !== void 0;
      const outcome = span(failed ? "run-history-outcome run-history-outcome--error" : "run-history-outcome", "");
      if (failed) {
        outcome.append(icon("circle-x"));
      }
      outcome.append(failed ? HISTORY_ERROR_WORD : historyRowsText(entry2.rows));
      const meta = span("run-history-meta", "");
      meta.append(span("run-history-time", `${entry2.t.slice(0, 10)} ${entry2.t.slice(11, 19)} ${HISTORY_TIME_ZONE}`), " ", outcome);
      button.append(span("run-history-sql", sqlPreview(entry2.sql)), meta);
      list.append(button);
    });
    if (focusedIndex !== null) {
      entryButtons()[Math.min(focusedIndex, shown.length - 1)]?.focus();
    }
  }
  function refresh() {
    if (isShown()) {
      render();
    }
  }
  function restore(index) {
    const entry2 = shown[index];
    if (!entry2) {
      return;
    }
    editor.value = entry2.sql;
    toast(HISTORY_RESTORED_MESSAGE);
    editor.focus();
  }
  list.addEventListener("click", (event) => {
    const button = event.target instanceof Element ? event.target.closest("button.run-history-entry") : null;
    if (button && list.contains(button)) {
      restore(Number(button.dataset.index));
    }
  });
  list.addEventListener("focusin", (event) => {
    const button = event.target instanceof Element ? event.target.closest("button.run-history-entry") : null;
    if (button) {
      roving = Number(button.dataset.index);
      for (const other of entryButtons()) {
        other.tabIndex = other === button ? 0 : -1;
      }
    }
  });
  list.addEventListener("keydown", (event) => {
    const buttons = entryButtons();
    const at = buttons.indexOf(document.activeElement);
    if (at === -1 || event.altKey || event.ctrlKey || event.metaKey) {
      return;
    }
    const moves = { ArrowDown: Math.min(at + 1, buttons.length - 1), ArrowUp: Math.max(at - 1, 0), Home: 0, End: buttons.length - 1 };
    if (event.key in moves) {
      event.preventDefault();
      buttons[moves[event.key]].focus();
    }
  });
  document.addEventListener("lab:database-loaded", (event) => {
    const { database: database2, dataset } = event.detail;
    currentKey = logKeyFor(dataset, database2.name);
    keys.set(database2, currentKey);
    roving = 0;
    refresh();
  });
  document.addEventListener("lab:run-finished", (event) => {
    const { database: database2, sql, ok, rows: rows3, error, preview } = event.detail;
    if (preview || typeof sql !== "string" || !sql) {
      return;
    }
    const key = keys.get(database2) ?? logKeyFor(null, database2?.name);
    const t = utcTimestamp();
    appendLog(key, ok ? { t, sql, rows: rows3 } : { t, sql, error: error || "unknown error" });
    roving = 0;
    refresh();
  });
  return {
    current() {
      return { key: currentKey, entries: currentKey === null ? [] : readLog(currentKey) };
    },
    refresh: render
  };
}

// js/lab/evidence-dialog.js
var evidenceFileName = (key) => `evidence-${safeBaseName(key)}.txt`;
function linkFor(key, entry2, pageUrl = globalThis.location.href) {
  if (entry2.error !== void 0 || !isDatasetKey(key)) {
    return null;
  }
  try {
    const fragment = shareFragment({ dataset: key, sql: entry2.sql });
    if (fragment === null || !decodeShare(fragment).ok) {
      return null;
    }
    const url = new URL(pageUrl);
    url.search = "";
    url.hash = fragment;
    return url.href;
  } catch {
    return null;
  }
}
function el3(tag, props = {}, text = "") {
  const node = document.createElement(tag);
  Object.assign(node, props);
  if (text) {
    node.textContent = text;
  }
  return node;
}
function mountEvidence({ runLog: runLog2, returnFocus }) {
  const button = returnFocus;
  const dialog = el3("dialog", { id: "evidence-dialog", className: "app-dialog evidence-dialog" });
  dialog.setAttribute("aria-labelledby", "evidence-title");
  dialog.setAttribute("aria-describedby", "evidence-text");
  const form = el3("form", { id: "evidence-form", noValidate: true });
  const label = el3("label", { htmlFor: "evidence-student", className: "app-dialog-label evidence-label" }, EVIDENCE_LABEL);
  const input = el3("input", { id: "evidence-student", type: "text", autocomplete: "off", spellcheck: false, className: "app-dialog-input" });
  input.setAttribute("autocapitalize", "off");
  input.setAttribute("autocorrect", "off");
  input.setAttribute("aria-describedby", "evidence-hint");
  const hint = el3("p", { id: "evidence-hint", className: "app-dialog-hint evidence-hint" }, EVIDENCE_HINT);
  const error = el3("p", { id: "evidence-error", className: "app-dialog-error evidence-error", hidden: true });
  error.setAttribute("role", "alert");
  const file = el3("p", { id: "evidence-file", className: "app-dialog-file evidence-file" });
  const submit = el3("button", { type: "submit", className: "button button--primary evidence-submit" }, EVIDENCE_SUBMIT_TEXT);
  const cancel = el3("button", { type: "button", className: "button evidence-cancel" }, EVIDENCE_CANCEL_TEXT);
  form.append(
    el3("h2", { id: "evidence-title", className: "app-dialog-title evidence-title" }, EVIDENCE_DIALOG_TITLE),
    el3("p", { id: "evidence-text", className: "app-dialog-text evidence-text" }, EVIDENCE_DIALOG_TEXT),
    label,
    input,
    hint,
    error,
    file,
    el3("div", { className: "app-dialog-actions evidence-actions" })
  );
  form.lastElementChild.append(submit, cancel);
  dialog.append(form);
  document.body.append(dialog);
  function showError2(message) {
    error.textContent = message;
    error.hidden = false;
    input.setAttribute("aria-invalid", "true");
    input.setAttribute("aria-describedby", "evidence-error");
  }
  function clearError() {
    error.textContent = "";
    error.hidden = true;
    input.removeAttribute("aria-invalid");
    input.setAttribute("aria-describedby", "evidence-hint");
  }
  function open() {
    const { key, entries } = runLog2.current();
    if (!entries.length) {
      toast(EVIDENCE_EMPTY_MESSAGE, { tone: "note" });
      return;
    }
    if (!hasCrypto()) {
      toast(EVIDENCE_NO_CRYPTO_MESSAGE, { tone: "problem" });
      return;
    }
    clearError();
    input.value = "";
    const filename = document.createElement("span");
    filename.className = "app-dialog-filename";
    filename.textContent = evidenceFileName(key);
    file.replaceChildren(`${EVIDENCE_FILE_LABEL} `, filename);
    if (!dialog.open) {
      dialog.showModal();
    }
    input.focus();
  }
  function closeDialog() {
    input.value = "";
    clearError();
    exportToken++;
    if (dialog.open) {
      dialog.close();
    }
    button.focus();
  }
  let exportToken = 0;
  let busyToken = null;
  async function exportNow() {
    if (busyToken === exportToken) {
      return;
    }
    const student = input.value;
    if (!STUDENT_ID_PATTERN.test(student)) {
      showError2(EVIDENCE_INVALID_MESSAGE);
      input.focus();
      return;
    }
    clearError();
    const token = exportToken;
    busyToken = token;
    try {
      const { key, entries } = runLog2.current();
      if (!entries.length) {
        closeDialog();
        toast(EVIDENCE_EMPTY_MESSAGE, { tone: "note" });
        return;
      }
      const text = await buildEvidence({
        entries: entries.map((entry2) => ({ ...entry2, link: linkFor(key, entry2) })),
        dataset: key,
        exported: utcTimestamp(),
        student
      });
      if (token !== exportToken || !dialog.open) {
        return;
      }
      const filename = evidenceFileName(key);
      saveFile(text, filename, "text/plain;charset=utf-8");
      closeDialog();
      toast(evidenceSavedMessage(filename, entries.length));
    } catch {
      if (token !== exportToken) {
        return;
      }
      closeDialog();
      toast(EVIDENCE_FAILED_MESSAGE, { tone: "problem" });
    } finally {
      if (busyToken === token) {
        busyToken = null;
      }
    }
  }
  form.addEventListener("submit", (event) => {
    event.preventDefault();
    exportNow();
  });
  cancel.addEventListener("click", closeDialog);
  dialog.addEventListener("cancel", () => {
    input.value = "";
    exportToken++;
  });
  input.addEventListener("input", () => {
    if (!error.hidden) {
      clearError();
    }
  });
  dialog.addEventListener("close", () => {
    input.value = "";
    clearError();
    if (!dialog.open) {
      exportToken++;
    }
    const focused = document.activeElement;
    if (!focused || focused === document.body || dialog.contains(focused)) {
      button.focus();
    }
  });
  return { open };
}

// js/lab/help.js
function mountHelp({ button, popover, altAnchor = null }) {
  if (typeof popover.showPopover !== "function") {
    button.hidden = true;
    return { open() {
    } };
  }
  const anchor = () => button.getClientRects().length || !altAnchor ? button : altAnchor;
  button.popoverTargetElement = popover;
  popover.addEventListener("beforetoggle", (event) => {
    const opening = event.newState === "open";
    button.setAttribute("aria-expanded", String(opening));
    if (opening) {
      placePopover(popover, anchor());
    }
  });
  popover.addEventListener("toggle", (event) => {
    if (event.newState === "open" && popover.matches(":popover-open")) {
      placePopover(popover, anchor());
      popover.focus({ preventScroll: true });
      return;
    }
    const focused = document.activeElement;
    if (!focused || focused === document.body || popover.contains(focused)) {
      anchor().focus({ preventScroll: true });
    }
  });
  popover.addEventListener("focusout", (event) => {
    if (popover.matches(":popover-open") && event.relatedTarget && !popover.contains(event.relatedTarget) && event.relatedTarget !== anchor()) {
      popover.hidePopover();
    }
  });
  window.addEventListener("resize", () => {
    if (popover.matches(":popover-open")) {
      placePopover(popover, anchor());
    }
  });
  return {
    open() {
      if (!popover.matches(":popover-open")) {
        popover.showPopover();
      }
    }
  };
}

// js/lab/more-menu.js
init_config();

// js/lab/theme.js
init_config();
var DARK_QUERY = "(prefers-color-scheme: dark)";
var CHOICES = new Set(THEME_OPTIONS.map((option) => option.value));
var current2 = readStoredChoice();
function readStoredChoice() {
  try {
    const stored2 = localStorage.getItem(THEME_STORAGE_KEY);
    return stored2 === "light" || stored2 === "dark" ? stored2 : "device";
  } catch {
    return "device";
  }
}
function themeChoice() {
  return current2;
}
function resolvedTheme(choice = current2) {
  if (choice === "light" || choice === "dark") {
    return choice;
  }
  return window.matchMedia(DARK_QUERY).matches ? "dark" : "light";
}
function setThemeChoice(choice) {
  if (!CHOICES.has(choice)) {
    return;
  }
  current2 = choice;
  try {
    if (choice === "device") {
      localStorage.removeItem(THEME_STORAGE_KEY);
    } else {
      localStorage.setItem(THEME_STORAGE_KEY, choice);
    }
  } catch {
  }
  applyTheme();
  document.dispatchEvent(new CustomEvent("lab:theme-chosen"));
}
function applyTheme() {
  const root = document.documentElement;
  if (current2 === "light" || current2 === "dark") {
    root.dataset.theme = current2;
  } else {
    delete root.dataset.theme;
  }
  for (const meta of document.querySelectorAll('meta[name="theme-color"][data-scheme]')) {
    const scheme = meta.dataset.scheme;
    meta.media = current2 === "device" ? `(prefers-color-scheme: ${scheme})` : scheme === current2 ? "all" : "not all";
  }
}
function mountThemeMenu(container, { before = null, buttonClass = "button button--small" } = {}) {
  const button = document.createElement("button");
  button.type = "button";
  button.id = "theme-button";
  button.className = `${buttonClass} theme-button`;
  const sun = icon("sun");
  const moon = icon("moon");
  const text = document.createElement("span");
  text.textContent = THEME_BUTTON_TEXT;
  button.append(sun, moon, text);
  const menu = document.createElement("div");
  menu.id = "theme-menu";
  menu.className = "menu";
  menu.setAttribute("role", "menu");
  menu.setAttribute("aria-label", THEME_MENU_LABEL);
  for (const option of THEME_OPTIONS) {
    const item2 = document.createElement("button");
    item2.type = "button";
    item2.className = "menu-item";
    item2.setAttribute("role", "menuitemradio");
    item2.tabIndex = -1;
    item2.dataset.themeChoice = option.value;
    const mark = icon("check");
    mark.classList.add("menu-check");
    const label = document.createElement("span");
    label.textContent = option.label;
    item2.append(mark, label);
    menu.append(item2);
  }
  container.insertBefore(button, before);
  container.insertBefore(menu, before);
  function sync() {
    const dark = resolvedTheme() === "dark";
    sun.classList.toggle("hidden", dark);
    moon.classList.toggle("hidden", !dark);
    for (const item2 of menu.querySelectorAll("[data-theme-choice]")) {
      item2.setAttribute("aria-checked", String(item2.dataset.themeChoice === current2));
    }
  }
  mountMenu(button, menu, {
    onOpen: sync,
    onSelect(item2) {
      setThemeChoice(item2.dataset.themeChoice);
      sync();
    }
  });
  window.matchMedia(DARK_QUERY).addEventListener("change", sync);
  document.addEventListener("lab:theme-chosen", sync);
  applyTheme();
  sync();
  return button;
}

// js/lab/more-menu.js
function el4(tag, className, text) {
  const node = document.createElement(tag);
  if (className) {
    node.className = className;
  }
  if (text !== void 0) {
    node.textContent = text;
  }
  return node;
}
function entry(id, glyph, label, { role = "menuitem", description = null } = {}) {
  const node = el4("button", description ? "menu-item menu-item--two-line" : "menu-item");
  node.type = "button";
  node.id = id;
  node.tabIndex = -1;
  node.setAttribute("role", role);
  const text = el4("span", "menu-item-text");
  text.append(el4("span", description ? "menu-item-label" : null, label));
  if (description) {
    text.append(el4("span", "menu-item-description", description));
  }
  node.append(glyph, text);
  return node;
}
function group(label, entries) {
  const node = el4("div", "menu-group");
  node.setAttribute("role", "group");
  const heading = el4("p", "menu-heading", label);
  heading.id = `more-${label.toLowerCase()}-heading`;
  heading.setAttribute("aria-hidden", "true");
  node.setAttribute("aria-labelledby", heading.id);
  node.append(heading, ...entries);
  return node;
}
function separator() {
  const node = el4("div", "menu-separator");
  node.setAttribute("role", "separator");
  return node;
}
function mountMoreMenu({ button, menu, copyLink, onDatabase, results: results2, evidence: evidence2, help: help2 }) {
  menu.setAttribute("aria-label", MORE_MENU_LABEL);
  const copy = entry("more-copy-link", icon("link"), MORE_COPY_LINK_TEXT);
  const database2 = entry("more-export-db", icon("database"), EXPORT_DATABASE_TEXT, { description: EXPORT_BUTTON_TITLE });
  const csv = entry("more-export-csv", icon("sheet"), EXPORT_RESULTS_TEXT, { description: EXPORT_RESULTS_DESCRIPTION });
  const record = entry("more-export-evidence", icon("file-text"), EXPORT_EVIDENCE_TEXT, { description: EXPORT_EVIDENCE_DESCRIPTION });
  const themes = THEME_OPTIONS.map((option) => {
    const mark = icon("check");
    mark.classList.add("menu-check");
    const item2 = entry(`more-theme-${option.value}`, mark, option.label, { role: "menuitemradio" });
    item2.dataset.themeChoice = option.value;
    return item2;
  });
  const helpItem = entry("more-help", icon("circle-help"), MORE_HELP_TEXT);
  menu.replaceChildren(
    copy,
    separator(),
    group(MORE_EXPORT_LABEL, [database2, csv, record]),
    separator(),
    group(MORE_THEME_LABEL, themes),
    separator(),
    helpItem
  );
  function sync() {
    const ready = results2.canDownload();
    csv.setAttribute("aria-disabled", String(!ready));
    csv.querySelector(".menu-item-description").textContent = ready ? EXPORT_RESULTS_DESCRIPTION : EXPORT_RESULTS_NONE;
    for (const item2 of themes) {
      item2.setAttribute("aria-checked", String(item2.dataset.themeChoice === themeChoice()));
    }
  }
  mountMenu(button, menu, {
    // a menu of commands first: it opens on Copy link, not on the ticked theme
    opensOn: "first",
    onOpen: sync,
    onSelect(chosen) {
      if (chosen === copy) {
        copyLink();
      } else if (chosen === database2) {
        onDatabase();
      } else if (chosen === csv) {
        results2.download();
      } else if (chosen === record) {
        evidence2.open();
      } else if (chosen === helpItem) {
        help2.open();
      } else if (chosen.dataset.themeChoice) {
        setThemeChoice(chosen.dataset.themeChoice);
      }
    }
  });
  sync();
}

// js/lab/layout.js
init_config();
function readStored() {
  try {
    const data = JSON.parse(localStorage.getItem(LAYOUT_STORAGE_KEY));
    return data && typeof data === "object" && data.v === 1 ? data : null;
  } catch {
    return null;
  }
}
var clamp = (value, min, max) => Math.min(max, Math.max(min, value));
function mountLayout({
  app,
  sidebar,
  sidebarSplitter,
  sidebarButton,
  sidebarClose,
  main,
  viewEditor,
  viewResult,
  editor,
  prompt,
  toolbar,
  editorPane,
  editorSplitter,
  resultsPane,
  result,
  feedback
}) {
  const stored2 = readStored();
  const width = Number(stored2?.sidebar);
  const share = Number(stored2?.editor);
  const state = {
    v: 1,
    sidebar: Number.isFinite(width) && width >= SIDEBAR_WIDTH.min && width <= SIDEBAR_WIDTH.max ? Math.round(width) : SIDEBAR_WIDTH.initial,
    collapsed: stored2?.collapsed === true,
    editor: Number.isFinite(share) && share > 0.05 && share < 0.95 ? share : EDITOR_SHARE
  };
  const drawer = window.matchMedia(DRAWER_QUERY);
  const phone = window.matchMedia(PHONE_QUERY);
  function save() {
    try {
      localStorage.setItem(LAYOUT_STORAGE_KEY, JSON.stringify(state));
    } catch {
    }
  }
  function applySidebar() {
    app.style.setProperty("--sidebar-width", `${state.sidebar}px`);
    app.classList.toggle("app--sidebar-collapsed", state.collapsed);
    sidebar.inert = state.collapsed && !drawer.matches;
    const now = state.collapsed ? 0 : state.sidebar;
    sidebarSplitter.setAttribute("aria-valuemin", "0");
    sidebarSplitter.setAttribute("aria-valuemax", String(SIDEBAR_WIDTH.max));
    sidebarSplitter.setAttribute("aria-valuenow", String(now));
    sidebarSplitter.setAttribute("aria-valuetext", sidebarWidthText(now));
  }
  function setSidebar(width2, { collapsed = false } = {}) {
    state.collapsed = collapsed;
    if (!collapsed) {
      state.sidebar = Math.round(clamp(width2, SIDEBAR_WIDTH.min, SIDEBAR_WIDTH.max));
    }
    applySidebar();
    applyEditor();
  }
  function toggleSidebar() {
    setSidebar(state.sidebar, { collapsed: !state.collapsed });
    save();
  }
  function showSidebar() {
    if (state.collapsed && !drawer.matches) {
      setSidebar(state.sidebar, { collapsed: false });
      save();
    }
  }
  sidebarSplitter.addEventListener("keydown", (event) => {
    const keys = {
      ArrowLeft: () => !state.collapsed && setSidebar(state.sidebar - SPLITTER_STEP),
      ArrowRight: () => setSidebar(state.collapsed ? SIDEBAR_WIDTH.min : state.sidebar + SPLITTER_STEP),
      Home: () => setSidebar(SIDEBAR_WIDTH.min),
      End: () => setSidebar(SIDEBAR_WIDTH.max),
      Enter: () => setSidebar(state.sidebar, { collapsed: !state.collapsed })
    };
    if (keys[event.key] && !event.altKey && !event.ctrlKey && !event.metaKey) {
      event.preventDefault();
      keys[event.key]();
      save();
    }
  });
  sidebarSplitter.addEventListener("dblclick", toggleSidebar);
  drag(sidebarSplitter, (start2) => {
    const from = state.collapsed ? 0 : sidebar.getBoundingClientRect().width;
    return (event) => {
      const width2 = from + event.clientX - start2.clientX;
      setSidebar(width2, { collapsed: width2 < SIDEBAR_HIDE_BELOW });
    };
  });
  function resultsNeed() {
    let fixed = 0;
    for (const child of resultsPane.children) {
      if (child === result || child === feedback || child.hidden || child.classList.contains("visually-hidden") || child.hasAttribute("popover")) {
        continue;
      }
      const style = getComputedStyle(child);
      fixed += child.offsetHeight + parseFloat(style.marginTop) + parseFloat(style.marginBottom);
    }
    return fixed + RESULTS_MIN_HEIGHT;
  }
  function measure() {
    const room = main.clientHeight - (prompt.hidden ? 0 : prompt.offsetHeight);
    const bar = toolbar.offsetHeight;
    const splitter = editorSplitter.offsetHeight;
    const min = EDITOR_MIN_HEIGHT;
    const max = Math.max(min, room - bar - splitter - resultsNeed());
    return { room, bar, min, max };
  }
  function capPrompt() {
    const free = main.clientHeight - toolbar.offsetHeight - editorSplitter.offsetHeight - EDITOR_MIN_HEIGHT - resultsNeed();
    const cap2 = Math.max(PROMPT_MIN_HEIGHT, Math.min(PROMPT_SHARE * window.innerHeight, free));
    main.style.setProperty("--prompt-max", `${Math.floor(cap2)}px`);
  }
  function applyEditor() {
    if (phone.matches) {
      main.style.removeProperty("--editor-height");
      main.style.removeProperty("--prompt-max");
      return;
    }
    capPrompt();
    const { room, bar, min, max } = measure();
    if (room <= 0) {
      return;
    }
    const height = Math.round(clamp(state.editor * room - bar, min, max));
    main.style.setProperty("--editor-height", `${height}px`);
    editorSplitter.setAttribute("aria-valuemin", String(min));
    editorSplitter.setAttribute("aria-valuemax", String(Math.round(max)));
    editorSplitter.setAttribute("aria-valuenow", String(height));
    editorSplitter.setAttribute("aria-valuetext", editorHeightText(height));
  }
  function setEditor(height) {
    const { room, bar, min, max } = measure();
    if (room <= 0) {
      return;
    }
    state.editor = (clamp(height, min, max) + bar) / room;
    applyEditor();
  }
  editorSplitter.addEventListener("keydown", (event) => {
    const now = editorPane.getBoundingClientRect().height;
    const keys = {
      ArrowUp: () => setEditor(now - SPLITTER_STEP),
      ArrowDown: () => setEditor(now + SPLITTER_STEP),
      Home: () => setEditor(EDITOR_MIN_HEIGHT),
      End: () => setEditor(Infinity)
    };
    if (keys[event.key] && !event.altKey && !event.ctrlKey && !event.metaKey) {
      event.preventDefault();
      keys[event.key]();
      save();
    }
  });
  drag(editorSplitter, (start2) => {
    const from = editorPane.getBoundingClientRect().height;
    return (event) => setEditor(from + event.clientY - start2.clientY);
  });
  function drag(handle, begin) {
    handle.addEventListener("pointerdown", (event) => {
      if (event.button !== 0 || phone.matches) {
        return;
      }
      event.preventDefault();
      handle.focus({ preventScroll: true });
      handle.setPointerCapture(event.pointerId);
      app.classList.add("app--resizing");
      const move = begin(event);
      const end = () => {
        handle.removeEventListener("pointermove", move);
        handle.removeEventListener("pointerup", end);
        handle.removeEventListener("pointercancel", end);
        app.classList.remove("app--resizing");
        save();
      };
      handle.addEventListener("pointermove", move);
      handle.addEventListener("pointerup", end);
      handle.addEventListener("pointercancel", end);
    });
  }
  if (typeof ResizeObserver === "function") {
    const observer = new ResizeObserver(() => applyEditor());
    for (const element3 of [main, prompt, toolbar, ...[...resultsPane.children].filter((child) => child !== result && child !== feedback)]) {
      observer.observe(element3);
    }
  } else {
    window.addEventListener("resize", applyEditor);
  }
  phone.addEventListener("change", () => {
    applySidebar();
    applyEditor();
  });
  const canDrawer = typeof sidebar.showPopover === "function";
  const drawerOpen = () => sidebar.hasAttribute("popover") && sidebar.matches(":popover-open");
  function applyDrawer() {
    if (drawer.matches && canDrawer) {
      if (sidebar.getAttribute("popover") !== "auto") {
        sidebar.setAttribute("popover", "auto");
      }
      sidebarButton.popoverTargetElement = sidebar;
    } else {
      if (sidebar.hasAttribute("popover")) {
        if (drawerOpen()) {
          sidebar.hidePopover();
        }
        sidebar.removeAttribute("popover");
      }
      sidebarButton.popoverTargetElement = null;
    }
    sidebarButton.setAttribute("aria-expanded", "false");
    applySidebar();
  }
  function closeDrawer() {
    if (!drawerOpen()) {
      return;
    }
    const inside = sidebar.contains(document.activeElement);
    sidebar.hidePopover();
    if (inside && (!document.activeElement || document.activeElement === document.body)) {
      sidebarButton.focus();
    }
  }
  sidebar.addEventListener("beforetoggle", (event) => {
    if (sidebar.hasAttribute("popover")) {
      sidebarButton.setAttribute("aria-expanded", String(event.newState === "open"));
    }
  });
  sidebar.addEventListener("toggle", (event) => {
    if (event.newState === "open" && drawerOpen() && !sidebar.contains(document.activeElement)) {
      (sidebar.querySelector('[role="tab"][aria-selected="true"]') ?? sidebar).focus();
    } else if (event.newState === "closed" && (!document.activeElement || document.activeElement === document.body) && sidebarButton.getClientRects().length) {
      sidebarButton.focus();
    }
  });
  document.addEventListener("focusin", (event) => {
    if (drawerOpen() && !sidebar.contains(event.target) && event.target !== sidebarButton) {
      sidebar.hidePopover();
    }
  });
  sidebarClose.addEventListener("click", closeDrawer);
  drawer.addEventListener("change", applyDrawer);
  function showView(view) {
    if (main.dataset.view === view) {
      return;
    }
    const leaving = view === "result" ? [prompt, editorPane] : [resultsPane];
    const lost = phone.matches && leaving.some((part) => part.contains(document.activeElement));
    main.dataset.view = view;
    for (const [button, shows] of [
      [viewEditor, "editor"],
      [viewResult, "result"]
    ]) {
      if (shows === view) {
        button.setAttribute("aria-current", "true");
      } else {
        button.removeAttribute("aria-current");
      }
    }
    if (lost) {
      (view === "result" ? viewResult : viewEditor).focus();
    }
  }
  viewEditor.addEventListener("click", () => showView("editor"));
  viewResult.addEventListener("click", () => showView("result"));
  document.addEventListener("lab:run-finished", () => showView("result"));
  for (const type of ["input", "replace", "reveal"]) {
    editor.addEventListener(type, () => showView("editor"));
  }
  applyDrawer();
  applyEditor();
  return {
    toggleSidebar,
    showSidebar,
    closeDrawer,
    showView,
    state: () => ({ ...state })
  };
}

// js/lab/open-url-dialog.js
init_config();
function el5(tag, props = {}, text = "") {
  const node = document.createElement(tag);
  Object.assign(node, props);
  if (text) {
    node.textContent = text;
  }
  return node;
}
function mountOpenUrlDialog({ onOpen }) {
  const dialog = el5("dialog", { id: "open-url-dialog", className: "app-dialog" });
  dialog.setAttribute("aria-labelledby", "open-url-title");
  const form = el5("form", { method: "dialog", noValidate: true });
  const input = el5("input", {
    id: "open-url-input",
    type: "text",
    inputMode: "url",
    autocomplete: "off",
    spellcheck: false,
    className: "app-dialog-input"
  });
  input.setAttribute("autocapitalize", "off");
  input.setAttribute("autocorrect", "off");
  input.setAttribute("aria-describedby", "open-url-hint");
  const error = el5("p", { id: "open-url-error", className: "app-dialog-error", hidden: true });
  error.setAttribute("role", "alert");
  const submit = el5("button", { type: "submit", className: "button button--primary" }, OPEN_URL_SUBMIT_TEXT);
  const cancel = el5("button", { type: "button", className: "button" }, OPEN_URL_CANCEL_TEXT);
  const actions2 = el5("div", { className: "app-dialog-actions" });
  actions2.append(submit, cancel);
  form.append(
    el5("h2", { id: "open-url-title", className: "app-dialog-title" }, OPEN_URL_TITLE),
    el5("p", { className: "app-dialog-text" }, OPEN_URL_INTRO),
    el5("label", { htmlFor: "open-url-input", className: "app-dialog-label" }, OPEN_URL_LABEL),
    input,
    el5("p", { id: "open-url-hint", className: "app-dialog-hint" }, OPEN_URL_HINT),
    error,
    actions2
  );
  dialog.append(form);
  document.body.append(dialog);
  let returnFocus = null;
  function showError2(message) {
    error.textContent = message;
    error.hidden = false;
    input.setAttribute("aria-invalid", "true");
    input.setAttribute("aria-describedby", "open-url-error open-url-hint");
  }
  function clearError() {
    error.textContent = "";
    error.hidden = true;
    input.removeAttribute("aria-invalid");
    input.setAttribute("aria-describedby", "open-url-hint");
  }
  function open(focusAfter = document.activeElement) {
    if (dialog.open) {
      input.focus();
      return;
    }
    returnFocus = focusAfter instanceof HTMLElement && focusAfter !== document.body ? focusAfter : null;
    clearError();
    input.value = "";
    if (!dialog.open) {
      dialog.showModal();
    }
    input.focus();
  }
  function close({ restoreFocus }) {
    if (dialog.open) {
      dialog.close();
    }
    if (restoreFocus && returnFocus?.isConnected) {
      returnFocus.focus();
    }
  }
  form.addEventListener("submit", (event) => {
    event.preventDefault();
    const address = input.value.trim();
    if (!address) {
      showError2(OPEN_URL_EMPTY_MESSAGE);
      input.focus();
      return;
    }
    if (new DatabasePath(address).type === "unsupported") {
      showError2(OPEN_URL_UNSUPPORTED_MESSAGE);
      input.focus();
      return;
    }
    close({ restoreFocus: false });
    onOpen(address);
  });
  cancel.addEventListener("click", () => close({ restoreFocus: true }));
  input.addEventListener("input", () => {
    if (!error.hidden) {
      clearError();
    }
  });
  dialog.addEventListener("close", () => {
    input.value = "";
    clearError();
    const focused = document.activeElement;
    if ((!focused || focused === document.body || dialog.contains(focused)) && returnFocus?.isConnected) {
      returnFocus.focus();
    }
  });
  return { open };
}

// js/lab/results.js
var results_exports = {};
__export(results_exports, {
  csvBytes: () => csvBytes,
  csvFileName: () => csvFileName,
  errorText: () => errorText,
  mountResults: () => mountResults,
  toCsv: () => toCsv
});
init_config();

// js/lab/result-table.js
init_config();
var fullValues = /* @__PURE__ */ new WeakMap();
var segmenter = typeof Intl === "object" && typeof Intl.Segmenter === "function" ? new Intl.Segmenter(void 0, { granularity: "grapheme" }) : null;
var MAX_SHOWN_UNITS = 16 * CELL_MAX_CHARS;
function unitsOf(text, units) {
  const code = text.charCodeAt(units - 1);
  return text.slice(0, code >= 55296 && code <= 56319 ? units - 1 : units);
}
function firstCharacters(text, count) {
  if (!segmenter) {
    const points = Array.from(text);
    const head = points.slice(0, count).join("");
    return head.length > MAX_SHOWN_UNITS ? { head: unitsOf(head, MAX_SHOWN_UNITS), more: true } : { head, more: points.length > count };
  }
  let taken = 0;
  let end = 0;
  for (const { segment } of segmenter.segment(text)) {
    if (taken === count) {
      return { head: text.slice(0, end), more: true };
    }
    if (end + segment.length > MAX_SHOWN_UNITS) {
      return { head: unitsOf(text, MAX_SHOWN_UNITS), more: true };
    }
    taken += 1;
    end += segment.length;
  }
  return { head: text, more: false };
}
function characterCount(text) {
  if (!segmenter) {
    return Array.from(text).length;
  }
  let count = 0;
  for (const _ of segmenter.segment(text)) {
    count += 1;
  }
  return count;
}
function isNumber(value) {
  return typeof value === "number" || typeof value === "bigint";
}
function numericColumns2(columns, values) {
  return columns.map((_, index) => {
    let numbers = 0;
    for (const row of values) {
      const value = row[index];
      if (value === null || value === void 0) {
        continue;
      }
      if (!isNumber(value)) {
        return false;
      }
      numbers++;
    }
    return numbers > 0;
  });
}
function cell(tag, numeric) {
  const node = document.createElement(tag);
  if (numeric) {
    node.className = "num";
  }
  return node;
}
function buildResultTable({ columns, values }, { popover = null } = {}) {
  const numeric = numericColumns2(columns, values);
  const table = document.createElement("table");
  table.className = values.length ? "result-table" : "result-table result-table--empty";
  const head = document.createElement("thead");
  const headRow = document.createElement("tr");
  columns.forEach((name, index) => {
    const th = cell("th", numeric[index]);
    th.scope = "col";
    th.textContent = name;
    headRow.append(th);
  });
  head.append(headRow);
  const body = document.createElement("tbody");
  values.forEach((row, rowIndex) => {
    const tr = document.createElement("tr");
    columns.forEach((name, index) => {
      const td = cell("td", numeric[index]);
      const value = row[index];
      if (value === null || value === void 0) {
        const mark = document.createElement("span");
        mark.className = "cell-null";
        mark.textContent = NULL_TEXT;
        td.append(mark);
      } else {
        const text = cellText(value);
        const cut2 = popover && text.length > CELL_MAX_CHARS ? firstCharacters(text, CELL_MAX_CHARS) : null;
        if (cut2?.more) {
          td.append(longCell(cut2.head, text, name, rowIndex + 1, popover));
        } else {
          td.textContent = text;
        }
      }
      tr.append(td);
    });
    body.append(tr);
  });
  table.append(head, body);
  return table;
}
function longCell(head, text, column, row, popover) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "cell-more";
  button.textContent = head + STATEMENT_ELLIPSIS;
  button.setAttribute("popovertarget", popover.id);
  button.setAttribute("aria-expanded", "false");
  button.setAttribute("aria-describedby", `${popover.id}-hint`);
  fullValues.set(button, { text, column, row });
  return button;
}
function mountCellPopover(popover) {
  if (typeof popover.showPopover !== "function") {
    return {};
  }
  const title = popover.querySelector(".cell-popover-title");
  const length = popover.querySelector(".cell-popover-length");
  const value = popover.querySelector(".cell-popover-value");
  const hint = document.getElementById(`${popover.id}-hint`);
  if (hint) {
    hint.textContent = CELL_MORE_HINT;
  }
  let source = null;
  function fill(button) {
    const full = fullValues.get(button);
    if (!full) {
      return false;
    }
    source = button;
    title.textContent = cellPopoverTitle(full.column, full.row);
    length.textContent = cellPopoverLength(characterCount(full.text));
    value.textContent = full.text;
    popover.scrollTop = 0;
    return true;
  }
  document.addEventListener("click", (event) => {
    const button = event.target instanceof Element ? event.target.closest("button.cell-more") : null;
    if (!button || button.getAttribute("popovertarget") !== popover.id) {
      return;
    }
    const open = popover.matches(":popover-open");
    if (open && source !== button) {
      event.preventDefault();
      source?.setAttribute("aria-expanded", "false");
      if (fill(button)) {
        button.setAttribute("aria-expanded", "true");
        placePopover(popover, button);
        popover.focus({ preventScroll: true });
      }
      return;
    }
    if (!open) {
      fill(button);
    }
  });
  popover.addEventListener("beforetoggle", (event) => {
    if (source) {
      source.setAttribute("aria-expanded", String(event.newState === "open"));
    }
    if (event.newState === "open" && source) {
      placePopover(popover, source);
    }
  });
  popover.addEventListener("toggle", (event) => {
    if (event.newState === "open" && popover.matches(":popover-open")) {
      if (source) {
        placePopover(popover, source);
      }
      popover.focus({ preventScroll: true });
      return;
    }
    const focused = document.activeElement;
    if (source?.isConnected && (!focused || focused === document.body || popover.contains(focused))) {
      source.focus({ preventScroll: true });
    }
    if (event.newState === "closed") {
      value.textContent = "";
    }
  });
  let frame = 0;
  function follow() {
    if (frame) {
      return;
    }
    frame = requestAnimationFrame(() => {
      frame = 0;
      if (popover.matches(":popover-open") && source?.isConnected) {
        placePopover(popover, source);
      }
    });
  }
  window.addEventListener("scroll", follow, { capture: true, passive: true });
  window.addEventListener("resize", follow);
  if (typeof ResizeObserver === "function") {
    const result = document.getElementById("result");
    if (result) {
      new ResizeObserver(follow).observe(result);
    }
  }
  popover.addEventListener("toggle", (event) => {
    if (event.newState === "open") {
      follow();
    }
  });
  popover.addEventListener("focusout", (event) => {
    if (popover.matches(":popover-open") && event.relatedTarget && !popover.contains(event.relatedTarget) && event.relatedTarget !== source) {
      popover.hidePopover();
    }
  });
  return {
    close() {
      if (popover.matches(":popover-open")) {
        popover.hidePopover();
      }
      source = null;
      title.textContent = "";
      length.textContent = "";
      value.textContent = "";
    }
  };
}

// js/lab/results.js
var oneLine2 = (text) => String(text).replace(/\s+/g, " ").trim();
var sampleLine = (sql) => oneLine2(sql).replace(/\(\s+/g, "(").replace(/\s+\)/g, ")");
function cut(text, max) {
  const characters = Array.from(text);
  return characters.length > max ? characters.slice(0, max).join("").trimEnd() + STATEMENT_ELLIPSIS : text;
}
function sampleText(sql) {
  return cut(sampleLine(sql), SAMPLE_SQL_CHARS);
}
function errorText(exc) {
  return oneLine2(engineMessage(exc));
}
function statementQuote(text) {
  const statement = stripLeadingNoise(text) || text;
  const characters = Array.from(statement);
  if (characters.length <= STATEMENT_QUOTE_CHARS) {
    return statement;
  }
  return characters.slice(0, STATEMENT_QUOTE_CHARS).join("").trimEnd() + STATEMENT_ELLIPSIS;
}
function failedStatement(exc) {
  const failed = exc !== null && typeof exc === "object" ? exc : null;
  if (failed && typeof failed.statementText === "string" && Number.isInteger(failed.statementPosition) && Number.isInteger(failed.statementCount)) {
    return { position: failed.statementPosition, count: failed.statementCount, text: failed.statementText };
  }
  return null;
}
var NEEDS_QUOTES = /[",\r\n]/;
var NON_ASCII = /[^\u0000-\u007f]/;
function field(value) {
  const text = cellText(value);
  return NEEDS_QUOTES.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}
function toCsv({ columns, values }) {
  const lines = [columns.map(field).join(",")];
  for (const row of values) {
    lines.push(Array.from(row, field).join(","));
  }
  return lines.join("\r\n") + "\r\n";
}
function csvBytes(result) {
  const text = toCsv(result);
  return NON_ASCII.test(text) ? `\uFEFF${text}` : text;
}
function csvFileName(databaseName) {
  return `${safeBaseName(databaseName).replace(/\.(db|sqlite|sqlite3)$/i, "")}${CSV_FILE_SUFFIX}`;
}
function el6(tag, className, text) {
  const node = document.createElement(tag);
  if (className) {
    node.className = className;
  }
  if (text !== void 0 && text !== null) {
    node.textContent = text;
  }
  return node;
}
function withTime(text, ms) {
  return [text, el6("span", "status-time", resultTimeText(ms))];
}
function band(...body) {
  const node = el6("div", "results-band");
  const glyph = icon("circle-alert");
  glyph.classList.add("results-band-icon");
  const content = el6("div", "results-band-body");
  content.append(...body);
  node.append(glyph, content);
  return node;
}
function errorBand(exc) {
  const message = engineMessage(exc) || String(exc);
  const parts = [el6("h2", "results-band-title", ERROR_HEADING), el6("p", "results-band-message", message)];
  const failed = failedStatement(exc);
  if (failed) {
    const where = el6("div", "results-band-statement");
    where.append(
      el6("p", "results-band-where", errorStatementText(failed.position, failed.count)),
      el6("pre", "results-band-quote", statementQuote(failed.text))
    );
    parts.push(where);
  }
  return band(...parts);
}
function problemBand(message) {
  const node = band(el6("p", "results-band-text", message));
  node.classList.add("results-band--problem");
  return node;
}
function mountResults({ ui: ui2, pane, summary, getDatabase, getSamples = () => [], isExercise = () => false }) {
  const button = document.createElement("button");
  button.id = "download-csv";
  button.type = "button";
  button.className = "button button--quiet results-download";
  button.title = CSV_BUTTON_TITLE;
  button.append(icon("download"), el6("span", null, CSV_BUTTON_TEXT));
  button.hidden = true;
  summary.append(button);
  const announcer = el6("p", "visually-hidden");
  announcer.id = "results-announce";
  announcer.setAttribute("role", "status");
  announcer.setAttribute("aria-live", "polite");
  announcer.setAttribute("aria-atomic", "true");
  pane.append(announcer);
  let announceTimer = 0;
  function announce2(text) {
    clearTimeout(announceTimer);
    announcer.textContent = "";
    announceTimer = setTimeout(() => {
      announcer.textContent = text;
    }, 60);
  }
  const problemSlot = el6("div", "results-problem");
  problemSlot.hidden = true;
  summary.before(problemSlot);
  const popoverElement = document.getElementById("cell-popover");
  const cellPopover = popoverElement ? mountCellPopover(popoverElement) : { close() {
  } };
  function setState(state) {
    pane.dataset.state = state;
    summary.hidden = !(state === "result" || state === "done");
    cellPopover.close?.();
    clearTimeout(announceTimer);
    announcer.textContent = "";
    problemSlot.replaceChildren();
    problemSlot.hidden = true;
  }
  function setSummary(...parts) {
    ui2.status.replaceChildren(...parts);
  }
  const headObserver = typeof ResizeObserver === "function" ? new ResizeObserver((entries) => {
    for (const entry2 of entries) {
      ui2.result.style.setProperty("--result-head", `${Math.ceil(entry2.target.getBoundingClientRect().height)}px`);
    }
  }) : null;
  function followHeader(printed) {
    headObserver?.disconnect();
    const head = printed.tHead;
    if (head) {
      ui2.result.style.setProperty("--result-head", `${Math.ceil(head.getBoundingClientRect().height)}px`);
      headObserver?.observe(head);
    }
  }
  let offered = null;
  let table = null;
  function retire() {
    offered = null;
    table = null;
    button.hidden = true;
  }
  function onScreen() {
    return Boolean(offered && table && table.parentNode === ui2.result && table.isConnected);
  }
  function offer(result, shownTable) {
    offered = result;
    table = shownTable;
    button.hidden = false;
  }
  new MutationObserver(() => {
    if (offered && !onScreen()) {
      retire();
    }
  }).observe(ui2.result, { childList: true });
  document.addEventListener("lab:database-loaded", retire);
  function download() {
    if (!onScreen()) {
      retire();
      return;
    }
    const filename = csvFileName(getDatabase()?.name);
    try {
      saveFile(csvBytes(offered), filename, "text/csv;charset=utf-8");
    } catch {
      toast(CSV_FAILED_MESSAGE, { tone: "problem" });
      return;
    }
    toast(exportedMessage(filename));
  }
  button.addEventListener("click", download);
  function emptyBlock({ variant = "fresh", notice = null }) {
    const block = el6("div", "results-empty");
    const intro = el6("div", "results-empty-intro");
    intro.append(el6("h2", "results-empty-title", EMPTY_TITLE));
    if (notice) {
      intro.append(el6("p", "results-empty-text results-empty-notice", notice));
    }
    const exercise = isExercise();
    if (variant === "restored" || variant === "shared") {
      intro.append(el6("p", "results-empty-text", variant === "shared" ? SHARED_MESSAGE : RESTORED_MESSAGE));
    } else if (exercise) {
      intro.append(el6("p", "results-empty-text", EMPTY_EXERCISE_TEXT));
    }
    block.append(intro);
    if (exercise) {
      return block;
    }
    const samples = getSamples();
    if (samples.length) {
      intro.append(el6("p", "results-empty-text", EMPTY_SAMPLES_TEXT));
      const list = el6("ul", "results-samples");
      list.setAttribute("aria-label", EMPTY_SAMPLES_LABEL);
      for (const sample of samples) {
        const item2 = el6("li");
        const choose = el6("button", "results-sample");
        choose.type = "button";
        choose.append(el6("span", "results-sample-label", cut(sample.label, SAMPLE_LABEL_CHARS)), el6("span", "results-sample-sql", sampleText(sample.sql)));
        choose.addEventListener("click", () => {
          ui2.editor.fill(sample.sql);
        });
        item2.append(choose);
        list.append(item2);
      }
      block.append(list);
    } else if (getDatabase()) {
      intro.append(el6("p", "results-empty-text", EMPTY_DATABASE_TEXT));
      const links = el6("p", "results-empty-links");
      const about = el6("a", null, emptyAboutText(APP_NAME));
      about.href = "about.html";
      const functions = el6("a", null, EMPTY_FUNCTIONS_TEXT);
      functions.href = "https://sqlite.org/lang_corefunc.html";
      functions.target = "_blank";
      functions.rel = "noopener noreferrer";
      const dot = el6("span", null, "·");
      dot.setAttribute("aria-hidden", "true");
      links.append(about, " ", dot, " ", functions);
      block.append(links);
    }
    return block;
  }
  let lastEmpty = {};
  let beforeLoad = null;
  const isRunning = (node) => node.nodeType === Node.ELEMENT_NODE && node.classList.contains("results-running");
  function snapshot() {
    return {
      nodes: [...ui2.result.childNodes].filter((node) => !isRunning(node)),
      state: pane.dataset.state,
      status: [...ui2.status.childNodes],
      offered,
      table
    };
  }
  function restore() {
    const kept = beforeLoad;
    beforeLoad = null;
    if (!kept || !getDatabase() || !kept.state || kept.state === "loading") {
      return false;
    }
    offered = kept.offered;
    table = kept.table;
    ui2.result.replaceChildren(...kept.nodes);
    setState(kept.state);
    setSummary(...kept.status);
    button.hidden = !(offered && table && table.isConnected);
    return true;
  }
  const view = {
    // a result with rows is on screen: the Export menu offers it too
    canDownload: onScreen,
    download,
    // result: {columns, values} of the run's last result set, or null when no statement
    // returned one; changes: rows the run changed (null when it ran no INSERT, UPDATE or DELETE)
    showResult(result, elapsed, { changes = null, quiet = false } = {}) {
      beforeLoad = null;
      retire();
      if (!result) {
        ui2.result.replaceChildren();
        setState("done");
        setSummary(...withTime(resultDoneText(changes), elapsed));
        if (!quiet) {
          announce2(resultDoneAnnouncement(changes));
        }
        return;
      }
      const total = result.values.length;
      const shown = Math.min(total, ROW_LIMIT);
      const rows3 = total > shown ? result.values.slice(0, ROW_LIMIT) : result.values;
      const printed = buildResultTable({ columns: result.columns, values: rows3 }, { popover: popoverElement });
      ui2.result.replaceChildren(printed);
      followHeader(printed);
      setState("result");
      setSummary(...withTime(total > shown ? resultCappedText(shown, total) : resultRowsText(total), elapsed));
      if (total) {
        offer(result, printed);
      }
      if (!quiet) {
        announce2(total > shown ? resultCappedAnnouncement(shown, total) : resultRowsAnnouncement(total));
      }
    },
    // a run that failed: the engine's exception, or a message of the page's own
    showError(exc, { quiet = false } = {}) {
      if (typeof exc === "string") {
        view.showProblem(exc);
        return;
      }
      beforeLoad = null;
      retire();
      ui2.result.replaceChildren(errorBand(exc));
      setState("error");
      setSummary();
      if (!quiet) {
        announce2(errorAnnouncement(errorText(exc) || String(exc)));
      }
    },
    // something that is not a query's error went wrong (a load, a link, a set): its band, and
    // under it the empty state of the database that is open, if one is
    showProblem(message) {
      view.showEmpty({ problem: message });
    },
    showEmpty({ variant = "fresh", notice = null, problem = null, said = false } = {}) {
      lastEmpty = { variant, notice, problem };
      beforeLoad = null;
      retire();
      const parts = [];
      if (problem) {
        parts.push(problemBand(problem));
      }
      if (getDatabase()) {
        parts.push(emptyBlock({ variant, notice }));
      }
      ui2.result.replaceChildren(...parts);
      setState(problem && !getDatabase() ? "error" : "empty");
      setSummary();
      if (problem) {
        announce2(problem);
      } else if (said) {
        announce2(EMPTY_TITLE);
      }
    },
    // A load (or the opening of a set) that failed while a database stays open: what the pane
    // showed before the load comes back, and the failure's band goes above it. With no database
    // open there is nothing to come back to: the error band alone. ownLoad false: the failure
    // is not the load's own (a set that cannot be opened while another load is on its way), so
    // the view, a loading state included, is left as it is and the band goes above it.
    loadFailed(message, { ownLoad = true } = {}) {
      if (ownLoad) {
        restore();
      }
      const state = pane.dataset.state;
      if (getDatabase() && state && (state !== "loading" || !ownLoad)) {
        problemSlot.replaceChildren(problemBand(message));
        problemSlot.hidden = false;
        announce2(message);
        return;
      }
      view.showProblem(message);
    },
    // a load that was given up (another choice took over, a set closed while its database
    // loaded): what the pane showed comes back, or "no result yet"
    loadCancelled() {
      if (!restore()) {
        view.showEmpty();
      }
    },
    // a Check's verdict, in words (the banner above the state is not a live region)
    say(text) {
      announce2(text);
    },
    // "no result yet", if it shows, drawn again (exercise mode began or ended)
    refreshEmpty() {
      if (pane.dataset.state === "empty") {
        view.showEmpty(lastEmpty);
      }
    },
    // name: what is loading, if it is known yet; size: its size in bytes, if known
    showLoading({ name = null, size = 0 } = {}) {
      if (!beforeLoad && pane.dataset.state !== "loading") {
        beforeLoad = snapshot();
      }
      offered = null;
      table = null;
      button.hidden = true;
      const block = el6("div", "results-loading");
      const title = el6("h2", "results-loading-title", loadingTitle(name));
      title.id = "results-loading-title";
      const sizeLine = el6("p", "results-loading-size", loadingSizeText(0, size));
      const bar = el6("progress", "results-progress");
      bar.max = 1;
      if (size) {
        bar.value = 0;
      }
      bar.setAttribute("aria-labelledby", title.id);
      block.append(title, sizeLine, bar);
      ui2.result.replaceChildren(block);
      setState("loading");
      setSummary();
      const current3 = () => block.isConnected;
      return {
        name(next) {
          if (current3()) {
            title.textContent = loadingTitle(next);
          }
        },
        // loaded bytes of total (0: unknown, the bar waits without moving)
        progress(loaded2, total) {
          if (!current3()) {
            return;
          }
          const known = total > 0 && loaded2 <= total;
          sizeLine.textContent = loadingSizeText(loaded2, known ? total : 0);
          if (known) {
            bar.value = loaded2 / total;
          } else {
            bar.removeAttribute("value");
          }
        }
      };
    },
    startRun() {
      const overlay = el6("div", "results-running", RUNNING_TEXT);
      overlay.setAttribute("aria-hidden", "true");
      (summary.hidden ? ui2.result : summary).append(overlay);
      return () => overlay.remove();
    }
  };
  return view;
}

// js/lab/router.js
var router_exports = {};
__export(router_exports, {
  resolveRoute: () => resolveRoute
});
init_config();
async function resolveRoute(location) {
  const manifest = await getManifest();
  const route = {
    database: "",
    dataset: null,
    sql: null,
    exercise: null,
    damaged: false,
    notice: null,
    problem: null,
    manifest
  };
  const hash = location.hash;
  if (isShareFragment(hash)) {
    const decoded = decodeShare(hash);
    if (!decoded.ok) {
      route.damaged = true;
      return withDefault(route);
    }
    route.sql = decoded.state.sql?.trim() ? decoded.state.sql : null;
    if (await openSet(route, decoded.state.set, decoded.state.exercise)) {
      return route;
    }
    const id = decoded.state.dataset;
    const known = id ? findDataset(manifest, id) : null;
    if (known) {
      route.dataset = known;
      return route;
    }
    if (manifest.ok) {
      addNotice(route, id ? unknownDatasetMessage(id) : LINK_NO_DATASET_MESSAGE);
    }
    return withDefault(route);
  }
  if (hash.length > 1) {
    route.database = hash.slice(1);
    if (!manifest.ok) {
      addNotice(route, manifest.message);
    }
    return route;
  }
  const query = new URLSearchParams(location.search);
  const requestedSet = query.get(SET_PARAM);
  if (requestedSet && await openSet(route, requestedSet, query.get(EXERCISE_PARAM))) {
    return route;
  }
  const requested = query.get(DATASET_PARAM);
  if (requested) {
    const known = findDataset(manifest, requested);
    if (known) {
      route.dataset = known;
      return route;
    }
    if (manifest.ok) {
      addNotice(route, unknownDatasetMessage(SHARE_ID_PATTERN.test(requested) ? requested : null));
    }
  }
  return withDefault(route);
}
function withDefault(route) {
  if (route.manifest.ok) {
    route.dataset = defaultDataset(route.manifest);
  } else {
    route.problem = route.manifest.message;
  }
  return route;
}
async function openSet(route, setId, exerciseId) {
  if (!setId) {
    return false;
  }
  const loaded2 = await loadSet(setId);
  const echoed = SHARE_ID_PATTERN.test(setId) ? setId : null;
  if (!loaded2.ok) {
    addNotice(route, setNoticeMessage(echoed, loaded2.message));
    return false;
  }
  const set2 = loaded2.set;
  const dataset = findDataset(route.manifest, set2.dataset);
  if (!dataset) {
    if (route.manifest.ok) {
      addNotice(route, setNoticeMessage(echoed, setDatasetMissingReason(set2.dataset)));
    }
    return false;
  }
  route.dataset = dataset;
  route.exercise = { set: set2, exerciseId: null };
  if (exerciseId) {
    if (set2.exercises.some((e) => e.id === exerciseId)) {
      route.exercise.exerciseId = exerciseId;
    } else {
      addNotice(route, unknownExerciseMessage(SHARE_ID_PATTERN.test(exerciseId) ? exerciseId : null));
    }
  }
  return true;
}
function addNotice(route, text) {
  route.notice = route.notice ? `${route.notice} ${text}` : text;
}

// js/lab/result-scroll.js
init_config();
function mountResultScroll({ result, note }) {
  note.textContent = RESULT_SCROLL_NOTE;
  result.setAttribute("role", "region");
  result.setAttribute("aria-label", RESULT_REGION_LABEL);
  let pending = false;
  function update() {
    pending = false;
    const wide = result.scrollWidth > result.clientWidth + 1;
    const tall = result.scrollHeight > result.clientHeight + 1;
    note.hidden = !wide;
    if (wide || tall) {
      result.tabIndex = 0;
    } else {
      result.removeAttribute("tabindex");
    }
  }
  function schedule() {
    if (!pending) {
      pending = true;
      requestAnimationFrame(update);
    }
  }
  new MutationObserver(schedule).observe(result, { childList: true, subtree: true, characterData: true });
  if (typeof ResizeObserver === "function") {
    new ResizeObserver(schedule).observe(result);
  } else {
    window.addEventListener("resize", schedule);
  }
  schedule();
}

// js/lab/samples.js
init_config();
init_sql();
function samplesFor(dataset, database2) {
  if (dataset?.samples?.length) {
    return dataset.samples.slice(0, MAX_SAMPLES);
  }
  let table = null;
  try {
    table = database2?.gatherTables()[0] ?? null;
  } catch {
    table = null;
  }
  return table ? [{ label: firstRowsSampleLabel(table), sql: `SELECT * FROM ${identifierForSql(table)} LIMIT 10;` }] : [];
}

// js/lab/schema.js
init_config();

// js/lab/insert.js
var NO_SPACE_BEFORE = /[\s(,.]/;
var NO_SPACE_AFTER = /[\s),.;]/;
function trackEditorSelection(editor) {
  let saved = null;
  let acted = false;
  let seen = null;
  function remember(fromEvent) {
    if (!acted || editor.view) {
      return;
    }
    const selection = document.getSelection();
    const focused = fromEvent?.type === "blur" || document.activeElement === editor;
    if (!focused || !selection || selection.rangeCount === 0) {
      return;
    }
    const range = selection.getRangeAt(0);
    if (!editor.contains(range.startContainer) || !editor.contains(range.endContainer)) {
      return;
    }
    saved = { range: range.cloneRange(), text: editor.textContent };
  }
  function usable() {
    return saved !== null && saved.text === editor.textContent && editor.contains(saved.range.startContainer) && editor.contains(saved.range.endContainer);
  }
  function restore() {
    HTMLElement.prototype.focus.call(editor);
    if (usable()) {
      const selection = document.getSelection();
      selection.removeAllRanges();
      selection.addRange(saved.range.cloneRange());
    } else {
      caretToEnd(editor);
    }
  }
  function textBefore(range) {
    const before = document.createRange();
    before.setStart(editor, 0);
    before.setEnd(range.startContainer, range.startOffset);
    return before.toString();
  }
  function textAfter(range) {
    const after = document.createRange();
    after.setStart(range.endContainer, range.endOffset);
    after.setEnd(editor, editor.childNodes.length);
    return after.toString();
  }
  document.addEventListener("selectionchange", remember);
  editor.addEventListener("blur", remember);
  for (const type of ["keydown", "pointerdown", "input"]) {
    editor.addEventListener(
      type,
      () => {
        acted = true;
        if (editor.view) {
          seen = editor.value;
        }
      },
      true
    );
  }
  function forget() {
    saved = null;
    acted = false;
    seen = null;
  }
  editor.addEventListener("replace", forget);
  return {
    forget,
    // insert puts text at the caret, replacing a selection, as one undo step. A space
    // is added on either side where the neighbouring text would otherwise run into it.
    insert(text) {
      editor.dispatchEvent(new Event("reveal"));
      if (editor.view) {
        const atCaret = acted && (seen === null || seen === editor.value);
        editor.code.insert(text, { atCaret, spaceBefore: NO_SPACE_BEFORE, spaceAfter: NO_SPACE_AFTER });
        acted = true;
        seen = editor.value;
        return;
      }
      restore();
      const range = document.getSelection().getRangeAt(0);
      const before = textBefore(range).slice(-1);
      const after = textAfter(range).slice(0, 1);
      const lead = before && !NO_SPACE_BEFORE.test(before) ? " " : "";
      const trail = after && !NO_SPACE_AFTER.test(after) ? " " : "";
      if (!document.execCommand("insertText", false, lead + text + trail)) {
        insertByHand(range, lead + text + trail);
      }
      const selection = document.getSelection();
      const node = selection.anchorNode;
      if (trail && selection.isCollapsed && node?.nodeType === Node.TEXT_NODE && selection.anchorOffset > 0) {
        selection.collapse(node, selection.anchorOffset - 1);
      }
      acted = true;
      remember();
    }
  };
}
function insertByHand(range, text) {
  range.deleteContents();
  const node = document.createTextNode(text);
  range.insertNode(node);
  const selection = document.getSelection();
  selection.collapse(node, node.length);
  node.parentElement?.dispatchEvent(new Event("input", { bubbles: true }));
}

// js/lab/schema.js
init_sql();
function element2(tag, className, text) {
  const el7 = document.createElement(tag);
  if (className) {
    el7.className = className;
  }
  if (text !== void 0) {
    el7.textContent = text;
  }
  return el7;
}
function hiddenText(text) {
  return element2("span", "visually-hidden", text);
}
function namedIcon(glyph, label, className) {
  glyph.removeAttribute("aria-hidden");
  glyph.setAttribute("role", "img");
  glyph.setAttribute("aria-label", label);
  glyph.classList.add(className);
  return glyph;
}
function rows2(database2, sql) {
  return database2.db.exec({ sql, rowMode: "array", returnValue: "resultRows" });
}
function signature(database2) {
  try {
    const version = rows2(database2, "PRAGMA schema_version")[0][0];
    const changes = rows2(database2, "SELECT total_changes()")[0][0];
    return `${version}:${changes}`;
  } catch (exc) {
    return null;
  }
}
var COUNT_FORMAT = new Intl.NumberFormat("en");
function mountSchema({ container, editor }) {
  const tracker = trackEditorSelection(editor);
  let current3 = { database: null, dataset: null };
  let seen = null;
  let filterText = "";
  let objectCount = 0;
  const expanded = /* @__PURE__ */ new Set();
  container.classList.add("schema");
  const panel = element2("div", "schema-panel");
  panel.id = "schema-panel";
  const dataset = element2("div", "schema-dataset");
  const datasetName = element2("p", "schema-dataset-name visually-hidden");
  const datasetDescription = element2("p", "schema-dataset-description schema-dataset-description--clamped");
  datasetDescription.id = "schema-description";
  const more = element2("button", "schema-more", SCHEMA_MORE_TEXT);
  more.type = "button";
  more.hidden = true;
  more.setAttribute("aria-controls", "schema-description");
  more.setAttribute("aria-expanded", "false");
  dataset.append(datasetName, datasetDescription, more);
  const filter = element2("input", "schema-filter");
  filter.type = "search";
  filter.placeholder = SCHEMA_FILTER_LABEL;
  filter.setAttribute("aria-label", SCHEMA_FILTER_LABEL);
  filter.setAttribute("aria-controls", "schema-lists");
  filter.spellcheck = false;
  filter.autocomplete = "off";
  filter.hidden = true;
  const scroll = element2("div", "schema-scroll");
  scroll.id = "schema-lists";
  const message = element2("p", "schema-message");
  const tables = element2("section", "schema-group");
  const tablesHeading = element2("h2", "schema-group-title", SCHEMA_TABLES_HEADING);
  tablesHeading.id = "schema-tables-title";
  const tableList = element2("ul", "schema-list");
  tableList.setAttribute("aria-labelledby", "schema-tables-title");
  tables.append(tablesHeading, tableList);
  const views = element2("section", "schema-group");
  const viewsHeading = element2("h2", "schema-group-title", SCHEMA_VIEWS_HEADING);
  viewsHeading.id = "schema-views-title";
  const viewList = element2("ul", "schema-list");
  viewList.setAttribute("aria-labelledby", "schema-views-title");
  views.append(viewsHeading, viewList);
  scroll.append(message, tables, views);
  panel.append(dataset, filter, scroll);
  container.replaceChildren(panel);
  function setClamped(clamped) {
    datasetDescription.classList.toggle("schema-dataset-description--clamped", clamped);
    more.textContent = clamped ? SCHEMA_MORE_TEXT : SCHEMA_LESS_TEXT;
    more.setAttribute("aria-expanded", String(!clamped));
  }
  function measureDescription() {
    requestAnimationFrame(() => {
      if (!datasetDescription.classList.contains("schema-dataset-description--clamped")) {
        return;
      }
      more.hidden = !(datasetDescription.scrollHeight > datasetDescription.clientHeight + 1);
    });
  }
  more.addEventListener("click", () => {
    setClamped(!datasetDescription.classList.contains("schema-dataset-description--clamped"));
  });
  if (typeof ResizeObserver === "function") {
    new ResizeObserver(() => {
      if (!datasetDescription.hidden) {
        measureDescription();
      }
    }).observe(datasetDescription);
  }
  function renderDataset() {
    const entry2 = current3.dataset;
    dataset.hidden = !entry2;
    datasetName.textContent = entry2 ? entry2.name : "";
    datasetDescription.textContent = entry2 && entry2.description ? entry2.description : "";
    datasetDescription.hidden = !datasetDescription.textContent;
    setClamped(true);
    more.hidden = true;
    if (!datasetDescription.hidden) {
      measureDescription();
    }
  }
  function showMessage(text) {
    message.textContent = text;
    message.hidden = !text;
  }
  function rowCount(database2, name) {
    try {
      return Number(rows2(database2, countRowsSql(name))[0][0]);
    } catch (exc) {
      return null;
    }
  }
  function foreignKeys(database2, name) {
    const keys = /* @__PURE__ */ new Map();
    try {
      for (const [, , table, from] of rows2(database2, pragmaForeignKeyListSql(name))) {
        keys.set(from, table);
      }
    } catch (exc) {
    }
    return keys;
  }
  function fillColumns(database2, name, type, columns) {
    let found;
    try {
      found = rows2(database2, pragmaTableInfoSql(name));
    } catch (exc) {
      found = null;
    }
    if (found === null) {
      const item2 = element2("li", "schema-column schema-unavailable", SCHEMA_DASH);
      item2.append(hiddenText(` (${SCHEMA_COLUMNS_UNAVAILABLE})`));
      columns.append(item2);
      return;
    }
    const references = type === "table" ? foreignKeys(database2, name) : /* @__PURE__ */ new Map();
    for (const [, columnName, columnType, , , pk] of found) {
      const item2 = element2("li", "schema-column");
      const insert = element2("button", "schema-insert schema-insert-column", columnName);
      insert.type = "button";
      insert.setAttribute("aria-label", schemaInsertColumnLabel(name, columnName));
      insert.dataset.focusKey = `column:${name}:${columnName}`;
      insert.addEventListener("click", () => tracker.insert(identifierForSql(columnName)));
      item2.append(insert);
      if (pk) {
        item2.append(namedIcon(icon("key"), SCHEMA_PRIMARY_KEY, "schema-pk"));
      }
      if (references.has(columnName)) {
        item2.append(namedIcon(icon("link-2"), schemaForeignKeyLabel(references.get(columnName)), "schema-fk"));
      }
      if (columnType) {
        item2.append(element2("span", "schema-type", columnType));
      }
      columns.append(item2);
    }
  }
  function buildItem(database2, { type, name }, index) {
    const item2 = element2("li", "schema-item");
    item2.dataset.kind = type;
    const row = element2("div", "schema-row");
    const columnsId = `schema-columns-${index}`;
    const expander = element2("button", "schema-expand");
    expander.type = "button";
    expander.setAttribute("aria-label", schemaExpandLabel(type, name));
    expander.setAttribute("aria-controls", columnsId);
    expander.dataset.focusKey = `expand:${name}`;
    const closedArrow = icon("chevron-right");
    const openArrow = icon("chevron-down");
    expander.append(closedArrow, openArrow);
    const insert = element2("button", "schema-insert", name);
    insert.type = "button";
    insert.setAttribute("aria-label", schemaInsertLabel(type, name));
    insert.dataset.focusKey = `insert:${name}`;
    insert.addEventListener("click", () => tracker.insert(identifierForSql(name)));
    const count = element2("span", "schema-count");
    const total = rowCount(database2, name);
    if (total === null) {
      count.append(SCHEMA_DASH, hiddenText(` (${SCHEMA_COUNT_UNAVAILABLE})`));
    } else {
      count.append(COUNT_FORMAT.format(total), hiddenText(` ${schemaRowsWord(String(total))}`));
    }
    row.append(expander, insert, count);
    const columns = element2("ul", "schema-columns");
    columns.id = columnsId;
    let filled = false;
    function show(isExpanded) {
      expander.setAttribute("aria-expanded", String(isExpanded));
      closedArrow.classList.toggle("hidden", isExpanded);
      openArrow.classList.toggle("hidden", !isExpanded);
      item2.classList.toggle("schema-item--expanded", isExpanded);
      columns.hidden = !isExpanded;
      if (isExpanded && !filled) {
        filled = true;
        fillColumns(database2, name, type, columns);
      }
    }
    expander.addEventListener("click", () => {
      const isExpanded = expander.getAttribute("aria-expanded") !== "true";
      if (isExpanded) {
        expanded.add(name);
      } else {
        expanded.delete(name);
      }
      show(isExpanded);
    });
    show(expanded.has(name));
    item2.append(row, columns);
    return item2;
  }
  function matches(name) {
    return !filterText || name.toLowerCase().includes(filterText.toLowerCase());
  }
  const scroller = () => container.closest(".tab-panel") ?? scroll;
  let toTop = false;
  function scrollToTop() {
    const panel2 = scroller();
    panel2.scrollTop = 0;
    toTop = panel2.getClientRects().length === 0;
  }
  if (typeof ResizeObserver === "function") {
    new ResizeObserver(() => {
      if (toTop && scroller().getClientRects().length) {
        scrollToTop();
      }
    }).observe(scroller());
  }
  function render() {
    const database2 = current3.database;
    const scrollTop = scroller().scrollTop;
    const focused = panel.contains(document.activeElement) ? document.activeElement.dataset.focusKey : null;
    let objects = [];
    let text = "";
    if (database2) {
      try {
        objects = rows2(database2, SCHEMA_OBJECTS_SQL).map(([type, name]) => ({ type, name }));
        if (!objects.length) {
          text = SCHEMA_EMPTY_MESSAGE;
        }
      } catch (exc) {
        text = SCHEMA_ERROR_MESSAGE;
      }
    }
    const names = new Set(objects.map((o) => o.name));
    for (const name of [...expanded]) {
      if (!names.has(name)) {
        expanded.delete(name);
      }
    }
    objectCount = objects.length;
    filter.hidden = objectCount <= SCHEMA_FILTER_FROM;
    if (filter.hidden && filterText) {
      filterText = "";
      filter.value = "";
    }
    const shown = objects.map((object, index) => ({ object, index })).filter(({ object }) => matches(object.name));
    if (!text && objects.length && !shown.length) {
      text = SCHEMA_NO_MATCH;
    }
    showMessage(text);
    const build = (kind) => shown.filter(({ object }) => object.type === kind).map(({ object, index }) => buildItem(database2, object, index));
    const tableItems = build("table");
    const viewItems = build("view");
    tableList.replaceChildren(...tableItems);
    viewList.replaceChildren(...viewItems);
    tables.hidden = !tableItems.length;
    views.hidden = !viewItems.length;
    scroller().scrollTop = scrollTop;
    if (focused) {
      for (const button of panel.querySelectorAll("button[data-focus-key]")) {
        if (button.dataset.focusKey === focused) {
          button.focus({ preventScroll: true });
        }
      }
    }
  }
  filter.addEventListener("input", () => {
    filterText = filter.value.trim();
    render();
  });
  document.addEventListener("lab:database-loaded", (event) => {
    current3 = { database: event.detail.database, dataset: event.detail.dataset };
    expanded.clear();
    filterText = "";
    filter.value = "";
    tracker.forget();
    seen = signature(current3.database);
    renderDataset();
    render();
    scrollToTop();
  });
  document.addEventListener("lab:run-finished", (event) => {
    if (event.detail.database !== current3.database) {
      return;
    }
    const now = signature(current3.database);
    if (now !== seen) {
      seen = now;
      render();
    }
  });
  renderDataset();
  showMessage("");
  tables.hidden = true;
  views.hidden = true;
}

// js/lab/set-actions.js
init_config();
function createSetActions({ lab: lab2, hasDatabase, isLoading, cancelLoad, loadDataset, pushUrl, showError: showError2, showInvite }) {
  async function openSet2(set2) {
    if (hasDatabase() && !isLoading() && getPristineId() === set2.dataset) {
      lab2().open(set2, null);
      pushUrl(`?${SET_PARAM}=${encodeURIComponent(set2.id)}`);
      return;
    }
    const manifest = await getManifest();
    const dataset = manifest.ok ? findDataset(manifest, set2.dataset) : null;
    if (!dataset) {
      showError2(setOpenFailedMessage(set2.id, setDatasetMissingReason(set2.dataset)));
      lab2().syncPicker();
      return;
    }
    return loadDataset(dataset, { set: set2, exerciseId: null });
  }
  function closeSet() {
    const cancelled = isLoading();
    if (cancelled) {
      cancelLoad();
    }
    lab2().close();
    if (hasDatabase()) {
      const id = getPristineId();
      pushUrl(id ? `?${DATASET_PARAM}=${encodeURIComponent(id)}` : "./");
      if (cancelled) {
        showInvite();
      }
    }
  }
  return { openSet: openSet2, closeSet };
}

// js/lab/plain-text.js
function plainTextOf(dataTransfer) {
  return dataTransfer ? dataTransfer.getData("text/plain") : "";
}
function carriesFiles2(dataTransfer) {
  if (!dataTransfer) {
    return false;
  }
  return Array.from(dataTransfer.types || []).includes("Files") || dataTransfer.files && dataTransfer.files.length > 0;
}
function rangeAt(x, y) {
  if (document.caretPositionFromPoint) {
    const position = document.caretPositionFromPoint(x, y);
    if (position) {
      const range = document.createRange();
      range.setStart(position.offsetNode, position.offset);
      range.collapse(true);
      return range;
    }
  }
  if (document.caretRangeFromPoint) {
    return document.caretRangeFromPoint(x, y);
  }
  return null;
}
function insertText(element3, text, range) {
  if (!text) {
    return;
  }
  HTMLElement.prototype.focus.call(element3);
  const selection = window.getSelection();
  const target = range && element3.contains(range.startContainer) ? range : null;
  if (target) {
    selection.removeAllRanges();
    selection.addRange(target);
  } else if (range) {
    const end = document.createRange();
    end.selectNodeContents(element3);
    end.collapse(false);
    selection.removeAllRanges();
    selection.addRange(end);
  }
  document.execCommand("insertText", false, text);
}
function mountPlainText(element3) {
  let draggingInside = false;
  const onPaste = (event) => {
    if (event.defaultPrevented) {
      return;
    }
    event.preventDefault();
    insertText(element3, plainTextOf(event.clipboardData), null);
  };
  const onDragStart = () => {
    draggingInside = true;
  };
  const endDrag = () => {
    draggingInside = false;
  };
  const onDragOver = (event) => {
    if (carriesFiles2(event.dataTransfer)) {
      event.preventDefault();
    }
  };
  const onDrop = (event) => {
    if (draggingInside || event.defaultPrevented) {
      draggingInside = false;
      return;
    }
    event.preventDefault();
    if (carriesFiles2(event.dataTransfer)) {
      return;
    }
    const text = plainTextOf(event.dataTransfer);
    insertText(element3, text, rangeAt(event.clientX, event.clientY));
  };
  element3.addEventListener("paste", onPaste);
  element3.addEventListener("dragstart", onDragStart);
  element3.addEventListener("dragover", onDragOver);
  element3.addEventListener("drop", onDrop);
  document.addEventListener("dragend", endDrag, true);
  document.addEventListener("drop", endDrag);
  const lateEvents = ["pointerdown", "pointermove", "keydown"];
  for (const type of lateEvents) {
    document.addEventListener(type, endDrag, { capture: true, passive: true });
  }
  return () => {
    element3.removeEventListener("paste", onPaste);
    element3.removeEventListener("dragstart", onDragStart);
    element3.removeEventListener("dragover", onDragOver);
    element3.removeEventListener("drop", onDrop);
    document.removeEventListener("dragend", endDrag, true);
    document.removeEventListener("drop", endDrag);
    for (const type of lateEvents) {
      document.removeEventListener(type, endDrag, { capture: true });
    }
  };
}
function guardFileDrops(target = document) {
  const refuse = (event) => {
    if (carriesFiles2(event.dataTransfer)) {
      event.preventDefault();
    }
  };
  target.addEventListener("dragover", refuse);
  target.addEventListener("drop", refuse);
}

// js/lab/status-bar.js
init_config();
function mountStatusBar({ database: databaseEl, run: runEl, version: versionEl }) {
  function showName(name) {
    databaseEl.textContent = name;
    databaseEl.title = name;
  }
  document.addEventListener("lab:database-loaded", (event) => {
    const { database: database2, dataset } = event.detail;
    showName(dataset ? dataset.name : database2.name);
    runEl.textContent = STATUS_NO_RUN;
    if (!versionEl.textContent) {
      try {
        versionEl.textContent = statusVersionText(database2.capi.sqlite3_libversion());
      } catch {
      }
    }
  });
  document.addEventListener("lab:run-finished", (event) => {
    const { ok, rows: rows3, elapsed, resultSet, changes } = event.detail;
    if (!ok) {
      runEl.textContent = STATUS_RUN_FAILED;
      return;
    }
    const time = document.createElement("span");
    time.className = "status-time";
    time.textContent = statusTimeText(elapsed ?? 0);
    runEl.replaceChildren(resultSet === false ? resultDoneText(changes ?? null) : statusRowsText(rows3 ?? 0), time);
  });
  return {
    // the database was renamed (js/lab/export-dialog.js); a course database keeps its name
    rename(name, { builtIn }) {
      if (!builtIn) {
        showName(name);
      }
    }
  };
}

// js/lab/tabs.js
function mountTabs(tablist, { onShow = () => {
} } = {}) {
  const tabs2 = [...tablist.querySelectorAll('[role="tab"]')];
  const panelOf = (tab) => document.getElementById(tab.getAttribute("aria-controls"));
  let selected = tabs2.find((tab) => tab.getAttribute("aria-selected") === "true") ?? tabs2[0];
  function show(tab, { focus = false } = {}) {
    for (const other of tabs2) {
      const on = other === tab;
      other.setAttribute("aria-selected", String(on));
      other.tabIndex = on ? 0 : -1;
      panelOf(other).hidden = !on;
    }
    selected = tab;
    if (focus) {
      tab.focus();
    }
    onShow(tab.id);
  }
  tablist.addEventListener("click", (event) => {
    const tab = event.target.closest('[role="tab"]');
    if (tab && tabs2.includes(tab)) {
      show(tab);
    }
  });
  tablist.addEventListener("keydown", (event) => {
    const at = tabs2.indexOf(document.activeElement);
    if (at === -1 || event.altKey || event.ctrlKey || event.metaKey) {
      return;
    }
    const moves = { ArrowRight: at + 1, ArrowLeft: at - 1, Home: 0, End: tabs2.length - 1 };
    if (!(event.key in moves)) {
      return;
    }
    event.preventDefault();
    show(tabs2[(moves[event.key] + tabs2.length) % tabs2.length], { focus: true });
  });
  show(selected);
  return {
    show(id) {
      const tab = tabs2.find((candidate) => candidate.id === id);
      if (tab && tab !== selected) {
        show(tab);
      }
    },
    current: () => selected.id
  };
}

// js/lab/text-size.js
init_config();
function readTextSize() {
  try {
    const stored2 = Number(localStorage.getItem(TEXT_SIZE_STORAGE_KEY));
    return TEXT_SIZES.includes(stored2) ? stored2 : TEXT_SIZE_DEFAULT;
  } catch {
    return TEXT_SIZE_DEFAULT;
  }
}
function mountTextSize({ smaller, larger, said }) {
  let size = readTextSize();
  let sayTimer = 0;
  function mark(button, atEnd, endText) {
    if (atEnd) {
      button.setAttribute("aria-disabled", "true");
      button.title = endText;
    } else {
      button.removeAttribute("aria-disabled");
      button.removeAttribute("title");
    }
  }
  function apply2() {
    document.documentElement.style.setProperty("--code-size", `${size}px`);
    const at = TEXT_SIZES.indexOf(size);
    mark(smaller, at === 0, TEXT_SIZE_SMALLEST);
    mark(larger, at === TEXT_SIZES.length - 1, TEXT_SIZE_LARGEST);
  }
  function step(by) {
    const next = TEXT_SIZES[TEXT_SIZES.indexOf(size) + by];
    if (next === void 0) {
      return;
    }
    size = next;
    apply2();
    try {
      localStorage.setItem(TEXT_SIZE_STORAGE_KEY, String(size));
    } catch {
    }
    clearTimeout(sayTimer);
    said.textContent = "";
    sayTimer = setTimeout(() => {
      said.textContent = textSizeAnnouncement(size);
    }, 60);
  }
  smaller.addEventListener("click", () => step(-1));
  larger.addEventListener("click", () => step(1));
  apply2();
  return { size: () => size };
}

// js/index.js
var ui = {
  buttons: {
    reset: document.querySelector("#reset"),
    execute: document.querySelector("#execute")
  },
  topbar: document.querySelector(".topbar"),
  toolbar: document.querySelector("#editor-toolbar"),
  fileInput: document.querySelector("#open-file-input"),
  editor: document.querySelector("#editor"),
  // the summary line's text ("5 rows in 3 ms"), in #results-summary with Download CSV
  status: document.querySelector("#status"),
  summary: document.querySelector("#results-summary"),
  pane: document.querySelector("#results-pane"),
  result: document.querySelector("#result")
};
var actions = {
  executeCurrent,
  copyLink: createCopyLinkAction({
    editor: ui.editor,
    button: document.querySelector("#copy-link"),
    popover: document.querySelector("#copy-link-popover"),
    // under 700 px the button is in the More menu: the popover opens under that menu's button
    altAnchor: document.querySelector("#more-button")
  }),
  exportDatabase: createExportAction(() => database)
};
var shortcuts = {
  o: () => {
    if (typeof HTMLElement.prototype.hidePopover === "function") {
      for (const popover of document.querySelectorAll(":popover-open")) {
        popover.hidePopover();
      }
    }
    ui.fileInput.click();
  },
  u: () => openUrl(document.activeElement)
};
var database;
var openDataset = null;
var pageStarted = false;
var latestLoad = 0;
var loading2 = false;
function beginLoad() {
  loading2 = true;
  return ++latestLoad;
}
function endLoad(ticket, opened) {
  if (ticket !== latestLoad) {
    return;
  }
  loading2 = false;
  if (!opened) {
    picker.sync();
    lab.syncPicker();
  }
}
var pendingRuns = 0;
var idleWaiters = [];
window.app = {
  actions,
  ui,
  get database() {
    return database;
  },
  whenIdle() {
    return pendingRuns === 0 ? Promise.resolve() : new Promise((resolve) => idleWaiters.push(resolve));
  }
};
var picker = mountDatabaseSwitcher({
  button: document.querySelector("#database-button"),
  label: document.querySelector("#database-button-name"),
  menu: document.querySelector("#database-menu"),
  onSelect: startFromDataset,
  onOpenFile: () => ui.fileInput.click(),
  onOpenUrl: () => openUrl(document.querySelector("#database-button"))
});
var openUrlDialog = mountOpenUrlDialog({ onOpen: startFromUrl });
mountThemeMenu(document.querySelector(".topbar-theme"), { buttonClass: "button button--quiet" });
var moreButton = document.querySelector("#more-button");
var help = mountHelp({ button: document.querySelector("#help-button"), popover: document.querySelector("#help-popover"), altAnchor: moreButton });
var tabs = mountTabs(document.querySelector("#sidebar .tabs"), {
  onShow: (id) => {
    if (id === "tab-history") {
      runLog?.refresh();
    }
  }
});
var lab = mountExercises({
  pickerSlot: document.querySelector(".exercise-set-picker-slot"),
  ui,
  // a Check's visible run: shown in the results pane, but the verdict is what is said
  execute: (sql) => execute(sql, { quiet: true }),
  isLoading: () => loading2,
  openSet: (set2) => setActions.openSet(set2),
  closeSet: () => setActions.closeSet(),
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
  }
});
var setActions = createSetActions({
  lab: () => lab,
  hasDatabase: () => Boolean(database),
  isLoading: () => loading2,
  cancelLoad: () => endLoad(beginLoad(), false),
  loadDataset: startFromDataset,
  pushUrl: (search) => history.pushState(database.name, null, search),
  // (a set that cannot be opened is not a load of its own: a load on its way is left alone)
  showError: (message) => results.loadFailed(message, { ownLoad: false }),
  showInvite: () => results.loadCancelled()
});
mountSchema({ container: document.querySelector("#schema"), editor: ui.editor });
mountEditorSchema({ editor: ui.editor });
mountResultScroll({ result: ui.result, note: document.querySelector("#result-scroll-note") });
var results = mountResults({
  ui,
  pane: ui.pane,
  summary: ui.summary,
  getDatabase: () => database,
  getSamples: () => samplesFor(openDataset, database),
  isExercise: () => lab.isOpen()
});
var exportButton = document.querySelector("#export-button");
var exportReturn = {
  focus(options) {
    (exportButton.getClientRects().length ? exportButton : moreButton).focus(options);
  }
};
var runLog = mountRunLog({
  ui,
  list: document.querySelector("#run-history-list"),
  isShown: () => tabs.current() === "tab-history"
});
var evidence = mountEvidence({ runLog, returnFocus: exportReturn });
mountStorageNotice({ ui, before: ui.summary });
var exportDialog = mountExportDialog({
  returnFocus: exportReturn,
  getName: () => database ? database.name : null,
  getProblem: () => exportProblem(database),
  onExport: (name) => {
    if (name !== database.name) {
      changeName(name);
    }
    actions.exportDatabase();
  },
  // the menu entry's answer: a toast that says why nothing was done, the result left as it is
  onNoDatabase: (message) => toast(message, { tone: "note" })
});
mountExportMenu({ button: exportButton, menu: document.querySelector("#export-menu"), onDatabase: exportDialog.open, results, evidence });
mountMoreMenu({
  button: moreButton,
  menu: document.querySelector("#more-menu"),
  copyLink: actions.copyLink,
  onDatabase: exportDialog.open,
  results,
  evidence,
  help
});
mountTextSize({
  smaller: document.querySelector("#text-smaller"),
  larger: document.querySelector("#text-larger"),
  said: document.querySelector("#text-size-said")
});
var statusBar = mountStatusBar({
  database: document.querySelector("#status-database"),
  run: document.querySelector("#status-run"),
  version: document.querySelector("#status-version")
});
var layout = mountLayout({
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
  feedback: document.querySelector("#exercise-feedback")
});
document.querySelector("#exercise-list").addEventListener("click", (event) => {
  if (event.target.closest("button.exercise-item")) {
    layout.closeDrawer();
  }
});
showPlatformKeys();
document.querySelector(".skip-link").addEventListener("click", (event) => {
  event.preventDefault();
  ui.editor.focus();
});
mountPlainText(ui.editor);
guardFileDrops();
function announce(type, detail) {
  document.dispatchEvent(new CustomEvent(type, { detail }));
}
async function startFromCurrentUrl() {
  const ticket = beginLoad();
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
    problem: started.errors.length ? started.errors.join(" ") : null
  });
}
async function openCurrentUrl(ticket, loader) {
  const route = await resolveRoute(window.location);
  picker.setManifest(route.manifest);
  if (ticket !== latestLoad) {
    return null;
  }
  let path = new DatabasePath(route.database);
  let name = path.extractName();
  let pristine2 = null;
  let dataset = route.dataset;
  let problem = route.problem;
  loader.name(dataset ? dataset.name : name);
  if (dataset) {
    const fetched = await fetchDataset(dataset, { onProgress: loader.progress });
    if (ticket !== latestLoad) {
      return null;
    }
    if (fetched.ok) {
      pristine2 = fetched.buffer;
      ({ path, name } = datasetSource(dataset, pristine2));
    } else if (database) {
      results.loadFailed(datasetSwitchFailedMessage(dataset.name));
      return null;
    } else {
      problem = datasetUnavailableMessage(dataset.name);
      dataset = null;
    }
  }
  let exercise = dataset ? route.exercise : null;
  let success = await start(name, path, { sql: route.sql, dataset, pristine: pristine2, ticket, exercise });
  if (!success && dataset && !database && ticket === latestLoad) {
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
    errors: [route.damaged ? BAD_LINK_MESSAGE : null, problem].filter(Boolean)
  };
}
function datasetSource(dataset, buffer) {
  const path = new DatabasePath(buffer.slice(0), "binary");
  const name = datasetFileName(dataset);
  return { path, name };
}
async function startFromDataset(dataset, exercise = null) {
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
        exercise
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
  const query = exercise ? `${SET_PARAM}=${encodeURIComponent(exercise.set.id)}` : `${DATASET_PARAM}=${encodeURIComponent(dataset.id)}`;
  history.pushState(database.name, null, `?${query}`);
  showStarted({ focus: false, exercise });
}
async function startFromUrl(url) {
  const ticket = beginLoad();
  const path = new DatabasePath(url);
  const name = path.extractName();
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
async function startFromFile(file, contents, fileType) {
  const ticket = beginLoad();
  const path = new DatabasePath(contents, fileType);
  const name = file.name;
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
async function start(name, path, { sql = null, dataset = null, pristine: pristine2 = null, ticket, keepFocus = false, exercise = null } = {}) {
  try {
    const [loadedDatabase] = path.type == "unsupported" ? [null] : await Promise.all([manager_default.init(name, path), ui.editor.ready]);
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
    closeDatabase(previous);
  } catch (exc) {
    if (ticket === latestLoad) {
      results.loadFailed(loadFailedMessage(path, exc));
    }
    return false;
  }
  if (dataset) {
    keepPristine(dataset.id, pristine2);
  } else {
    clearPristine();
  }
  openDataset = dataset;
  setShareContext({ dataset: dataset ? dataset.id : null });
  database.query = exercise ? lab.editorSql(exercise, sql) : sql ?? (database.query || storage_default.get(database.name));
  document.title = titleFor(database.meaningfulName);
  ui.editor.value = database.query;
  if (!keepFocus) {
    ui.editor.focus();
  }
  ui.buttons.execute.disabled = false;
  announce("lab:database-loaded", { database, dataset, exercise });
  return true;
}
function closeDatabase(old) {
  try {
    old?.db.close();
  } catch (exc) {
    console.debug("closing a database failed", exc);
  }
}
function executeCurrent() {
  execute(ui.editor.query).catch(ignoreRejection);
  return Promise.resolve();
}
var AFTER_PAINT_MAX_MS = 250;
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
    const writes = splitStatements(run.capi, sql).some(
      (statement) => /^(insert|update|delete|replace)\b/i.test(stripLeadingNoise(statement))
    );
    return writes ? 0 : null;
  } catch {
    return null;
  }
}
var RUN_DROPPED = Object.freeze({ dropped: true });
function execute(sql, { quiet = false } = {}) {
  if (loading2) {
    toast(LOADING_BUSY_MESSAGE, { tone: "note" });
    return Promise.reject();
  }
  if (!database) {
    showError(NO_DATABASE_MESSAGE);
    layout.showView("result");
    return Promise.reject();
  }
  sql = sql.trim();
  storage_default.set(database.name, sql);
  if (!sql) {
    results.showEmpty({ said: true });
    layout.showView("result");
    return Promise.resolve();
  }
  const run = database;
  const endRun = results.startRun();
  pendingRuns++;
  return afterPaint().then(() => {
    if (run !== database || loading2) {
      return Promise.reject(RUN_DROPPED);
    }
    let outcome;
    try {
      const before = run.db.changes(true);
      const started = performance.now();
      const result = runSql(run, sql);
      const elapsed = Math.round(performance.now() - started);
      const changes = result ? null : changedRows(run, before, sql);
      outcome = { ok: true, rows: result ? result.values.length : 0, elapsed, resultSet: Boolean(result), changes };
      showResult(result, elapsed, { changes, quiet });
      return void 0;
    } catch (exc) {
      outcome = { ok: false, error: errorText(exc) };
      showError(exc, { quiet });
      return Promise.reject(exc);
    } finally {
      announce("lab:run-finished", { database: run, sql, preview: false, ...outcome });
    }
  }).finally(() => {
    endRun();
    pendingRuns--;
    if (pendingRuns === 0) {
      const waiting = idleWaiters;
      idleWaiters = [];
      waiting.forEach((resolve) => resolve());
    }
  });
}
function openUrl(returnFocus) {
  if (typeof HTMLElement.prototype.hidePopover === "function") {
    for (const popover of document.querySelectorAll(":popover-open")) {
      popover.hidePopover();
    }
  }
  openUrlDialog.open(returnFocus);
}
function changeName(name) {
  if (name == database.name) {
    return;
  }
  const saved = storage_default.get(database.name);
  storage_default.remove(database.name);
  database.name = name;
  if (saved) {
    storage_default.set(name, saved);
  }
  document.title = titleFor(name);
  picker.rename(name);
  statusBar.rename(name, { builtIn: getPristineId() !== null });
}
function showStarted({ shared = false, notice = null, focus = true, problem = null } = {}) {
  const variant = database.query ? shared ? "shared" : "restored" : "fresh";
  results.showEmpty({ variant, notice, problem });
  if (pageStarted) {
    toast(openedMessage(openDataset ? openDataset.name : database.name));
  }
  pageStarted = true;
  if (focus) {
    caretToEnd(ui.editor);
  }
}
function showResult(result, elapsed, details) {
  results.showResult(result, elapsed, details);
}
function showError(exc, details) {
  results.showError(exc, details);
}
function ignoreRejection() {
}
ui.fileInput.addEventListener("change", () => {
  const file = ui.fileInput.files[0];
  if (!file) {
    return;
  }
  const reader = new FileReader();
  const fileType = file.name.endsWith(".sql") ? "sql" : "binary";
  reader.onload = function() {
    ui.fileInput.value = "";
    startFromFile(file, reader.result, fileType);
  };
  if (fileType == "sql") {
    reader.readAsText(file);
  } else {
    reader.readAsArrayBuffer(file);
  }
});
window.addEventListener("popstate", () => {
  startFromCurrentUrl();
});
ui.editor.addEventListener("execute", (event) => {
  execute(event.detail).catch(ignoreRejection);
});
new ActionController(actions).listen(ui.topbar, ui.toolbar);
new ShortcutController(shortcuts).listen(document);
document.addEventListener("keydown", (event) => {
  if ((event.ctrlKey || event.metaKey) && !event.shiftKey && !event.altKey && (event.key === "O" || event.key === "U")) {
    event.preventDefault();
    shortcuts[event.key.toLowerCase()]();
  }
});
startFromCurrentUrl();
export {
  checker_exports as checker,
  datasets_exports as datasets,
  db_path_exports as dbPath,
  exercises_exports as exercises,
  manager_exports as manager,
  progress_exports as progress,
  results_exports as results,
  router_exports as router,
  run_log_exports as runLog,
  runner_exports as runner,
  share_exports as share,
  storage_exports as storage
};
