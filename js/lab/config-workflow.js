// Settings of what the assessment workflow plan adds (the plan is in docs/): the preview flags,
// the events of the evidence log, the loader for vendored libraries and, from Phase 2 on, the
// texts and limits of the import and export dialogs.
//
// They are here and not in js/lab/config.js because verify.html and about.html load that file
// whole, and the verify page is held to a size (tests/m5-verify-page.spec.js). Nothing the verify
// page loads may import this file. Like config.js it holds constants and message builders only:
// no imports, nothing read from the browser.

// ---- Preview flags (js/lab/flags.js) ----

// Each new feature of the plan sits behind one of these and is off until its value here is set to
// true: this is the one place where a feature is switched on for everyone. A single visit can
// turn flags on for itself with PREVIEW_PARAM in the address: index.html?preview=import,export
export const PREVIEW_PARAM = "preview";
export const PREVIEW_FLAGS = {
    import: false,
    export: false,
    "excel-import": false,
    "excel-export": false,
};
// A flag that does nothing unless another one is on too.
export const PREVIEW_FLAG_NEEDS = { "excel-import": "import", "excel-export": "export" };

// ---- Events of the evidence log (js/lab/events.js) ----

// localStorage: one key per log, EVENTS_PREFIX + the log key, apart from the run log's key, whose
// code drops every entry that is not a query. Like RUN_LOG_PREFIX, the prefix is a storage
// namespace and does not follow APP_NAME. The kinds are EVENT_KINDS in js/lab/config.js.
export const EVENTS_PREFIX = "sqllab.events.";
export const EVENTS_VERSION = 1;
// A log keeps its newest events only, and at most this much text in their lines (UTF-8 bytes),
// so that an evidence file stays under EVIDENCE_MAX_BYTES.
export const EVENTS_MAX = 1000;
export const EVENTS_MAX_BYTES = 1_000_000;
// One event: how many lines of detail it may have, and how long a line may be (characters as
// JavaScript counts them, UTF-16 units: an emoji is two).
export const EVENT_MAX_LINES = 200;
export const EVENT_MAX_LINE_CHARS = 500;

// One line of notice while events could not be stored (js/lab/storage-notice.js shows it, with
// the run log's and the progress's).
export const STORAGE_NOTICE_EVENTS =
    "Your browser could not save the record of the files you brought in. It is kept until this tab is closed: export your evidence before you close it.";

export const evidenceSavedWithEventsMessage = (filename, queries, events) =>
    `Exported ${filename} with ${queries} ${queries === 1 ? "query" : "queries"} and ${events} ${events === 1 ? "event" : "events"}`;

// ---- The loader for vendored libraries (js/lab/vendor-loader.js) ----

// A library that has not arrived after this long counts as one that could not be loaded.
export const VENDOR_LOAD_TIMEOUT_MS = 30_000;

// ---- Import of CSV files (the plan's Phase 2, flag "import": js/lab/import*.js) ----

// A file is read this much at a time, and the page gets a turn after each slice: small enough
// that the rows of one slice are put in the database in a few hundredths of a second.
export const IMPORT_SLICE_BYTES = 64 * 1024;
// The pass that looks at a whole file before the dialog shows it (is it text, is it UTF-8) only
// reads, so it takes larger slices.
export const INSPECT_SLICE_BYTES = 4 * 1024 * 1024;
// The preview reads this much of the start of a file as one text.
export const PREVIEW_BYTES = 1024 * 1024;
// and shows this many rows under the row of column names (with that row, and up to three rows
// above it when it is not the first); with no row of names, this many rows
export const PREVIEW_ROWS = 20;
// The copy from the staging table into the typed one moves about this many cells in one step.
export const COPY_CELLS = 150_000;
// During an import the page draws a frame this often (the progress bar), and takes its other
// turns without waiting for one; a tab that draws no frame (a hidden one) is not waited for
// longer than FRAME_MAX_MS.
export const PAINT_EVERY_MS = 150;
export const FRAME_MAX_MS = 250;
// Sizes, in bytes, by the kind a file's first bytes show (the plan's section 7): a warning
// before a text file over the first is read, and a refusal over the second.
export const IMPORT_TEXT_WARN_BYTES = 50 * 1024 * 1024;
export const IMPORT_TEXT_MAX_BYTES = 250 * 1024 * 1024;

// What the "Open a file…" entry of the database menu says under its name while the import is
// on (js/lab/config.js has the line it says otherwise).
export const OPEN_FILE_WITH_IMPORT_DESCRIPTION = "A SQLite database, a .sql script, or CSV files to bring in as tables";

// A choice or a drop that cannot be taken as it is: said in a toast, before any dialog opens.
export const IMPORT_MIXED_MESSAGE =
    "Nothing was opened. Choose CSV files to bring in together, or one database or script on its own.";
export const IMPORT_SEVERAL_DATABASES_MESSAGE = "Nothing was opened. Only one database or script can be opened at a time.";
// What is refused while an import runs, and why (a toast).
export const IMPORT_BUSY_MESSAGE = "An import is running, so nothing else was done. Wait for it to end, or cancel it.";
// Files chosen or dropped while a database is on its way: the open one is about to be replaced,
// so the dialog would offer a destination that is going away (a toast).
export const IMPORT_LOADING_MESSAGE = "A database is still loading, so the files were not taken. Choose them again once it has opened.";
export const IMPORT_LIBRARY_FAILED_MESSAGE =
    "The CSV reader could not be loaded, so nothing was imported. Check the connection and try again.";

// The dialog (js/lab/import-dialog.js).
export const IMPORT_DIALOG_TITLE = "Import files";
export const IMPORT_DIALOG_TEXT = "Each file becomes a table, read as it is: nothing in it is cleaned or changed.";
export const IMPORT_TABS_LABEL = "Files";
export const IMPORT_SUBMIT_TEXT = "Import";
export const IMPORT_CANCEL_TEXT = "Cancel";
export const IMPORT_CLOSE_TEXT = "Close";
export const IMPORT_REFUSED_TAB_TEXT = "cannot be imported";
export const IMPORT_READING_TEXT = "Reading the file…";

export const IMPORT_TABLE_NAME_LABEL = "Table name";
export const IMPORT_TABLE_NAME_HINT = "Letters, digits and underscores. Anything else becomes an underscore.";
export const IMPORT_NAME_EMPTY_MESSAGE = "Give the table a name.";
export const IMPORT_NAME_RESERVED_MESSAGE = "A name cannot start with sqlite_: SQLite keeps those for itself.";
export const IMPORT_NAME_TWICE_MESSAGE = "Another file here has this table name. Change one of them.";
export const importNameTakenMessage = (database) => `${database} already has a table, view or index with this name.`;
// (a TEMP table or view of this visit: it is in no database, and would hide the new table)
export const IMPORT_NAME_TEMPORARY_MESSAGE = "A temporary table or view already has this name.";

export const IMPORT_DELIMITER_LABEL = "Delimiter";
export const IMPORT_DELIMITER_NAMES = { ",": "Comma", ";": "Semicolon", "\t": "Tab", "|": "Pipe" };
export const IMPORT_ENCODING_LABEL = "Text encoding";
export const IMPORT_ENCODING_NAMES = {
    "utf-8": "UTF-8",
    "utf-16le": "UTF-16, little-endian",
    "utf-16be": "UTF-16, big-endian",
    "windows-1252": "Windows-1252",
};
export const importEncodingMessage = (encoding) =>
    `The bytes of this file are not ${IMPORT_ENCODING_NAMES[encoding]}. Choose another encoding.`;
export const IMPORT_HAS_NAMES_LABEL = "The file has a row of column names";
export const IMPORT_NAMES_ROW_LABEL = "Column names are on row";
export const importNamesRowMessage = (rows) =>
    rows === 1 ? "The part of the file shown here has only 1 row." : `The part of the file shown here has only ${rows} rows.`;
export const IMPORT_NAMES_ROW_NOT_A_ROW_MESSAGE = "Give the row as a whole number, 1 or more.";

export const IMPORT_PREVIEW_LABEL = "The first rows, as read";
export const IMPORT_PREVIEW_ROW_HEADING = "Row";
export const IMPORT_PREVIEW_LEFT_OUT = "left out";
export const IMPORT_PREVIEW_NAMES = "column names";
export const IMPORT_PREVIEW_BLANK = "blank";
export const importPreviewAboveMessage = (rows) => (rows === 1 ? "1 more row above is left out." : `${rows} more rows above are left out.`);
export const IMPORT_PREVIEW_NO_DATA_MESSAGE = "No rows of data under the column names.";

export const IMPORT_DESTINATION_LABEL = "Import into";
export const IMPORT_NEW_DATABASE_LABEL = "A new database";
export const IMPORT_NEW_DATABASE_NAME_LABEL = "Name of the new database";
export const IMPORT_NEW_DATABASE_EMPTY_MESSAGE = "Give the new database a name.";
export const importOpenDatabaseLabel = (name) => `The open database, ${name}`;
export const IMPORT_COURSE_DATABASE_NOTE = "Files are never imported into a course database.";

// Why a file is not imported (its tab says so; the other files can still be imported).
export const IMPORT_EMPTY_REASON = "This file is empty, so there is nothing to import.";
export const IMPORT_WORKBOOK_REASON =
    "This is an Excel workbook, and Excel files cannot be imported yet. In Excel, save the sheet as CSV, and import that.";
export const IMPORT_NOT_TEXT_REASON = "This file is not text, so it cannot be read as CSV.";
export const IMPORT_TOO_LARGE_REASON = "This file is over 250 MB, which is more than the browser can import.";
export const IMPORT_TOO_WIDE_REASON =
    "A row of this file has more than 2,000 columns, which is more than a table can have. Nothing of it was imported.";
export const IMPORT_UNREADABLE_REASON = "The browser could not read this file.";
export const IMPORT_NO_NAMES_ROW_REASON = "The file ends before the row that was said to hold the column names.";
// (the preview reads the first megabyte, PREVIEW_BYTES: the line ending, the delimiter and the
// row of column names cannot be found in a text that holds no complete row)
export const IMPORT_NO_ROW_REASON =
    "The first megabyte of this file does not hold one complete row, so its rows cannot be shown before they are imported. A quote mark near the start of the file may never be closed.";
// (a file that was saved again while the dialog was open: Firefox goes on to read the new bytes)
export const IMPORT_CHANGED_REASON =
    "This file was changed after it was chosen, so it is no longer the file that was shown here. Choose it again.";
// A reading that the student's own choice of delimiter or encoding made impossible: said in the
// tab, in place of the preview, with Import off until the choice is changed.
export const IMPORT_SETTINGS_TOO_WIDE_MESSAGE =
    "Read this way, a row of the file has more than 2,000 columns, which is more than a table can have. Choose another delimiter or text encoding.";
export const IMPORT_SETTINGS_NO_ROW_MESSAGE =
    "Read this way, the start of the file does not hold one complete row. Choose another delimiter or text encoding.";
// Why Import is off (a line above the buttons): for a file that waits for an answer, whichever tab
// is on show; for one that is still being read or cannot be imported as it is set, when another
// tab is on show.
export const importHoldReadingMessage = (name) => `Still reading ${name}. Import can be pressed once every file has been read.`;
export const importHoldWaitingMessage = (name) => `${name} is waiting for an answer in its tab. Import can be pressed after that.`;
export const importHoldProblemMessage = (name) => `${name} cannot be imported as it is set. Its tab says why.`;
// A large file: a step of its own before it is read, with two answers. Left out, its tab says so
// where a refusal would give its reason, and the other files can be imported without it.
export const importLargeFileMessage = (megabytes) =>
    `This file is ${megabytes} MB. Reading it takes a while, and the page may be slow meanwhile.`;
export const IMPORT_LARGE_FILE_CONTINUE_TEXT = "Read this file";
export const IMPORT_LARGE_FILE_LEAVE_TEXT = "Leave this file out";
export const IMPORT_LEFT_OUT_REASON = "You left this file out, so it will not be imported. To import it after all, choose the files again.";
export const IMPORT_LEFT_OUT_TAB_TEXT = "left out";

// While the import runs, and how it can end.
export const importProgressTitle = (at, of, name) => (of === 1 ? `Importing ${name}` : `Importing file ${at} of ${of}: ${name}`);
export const IMPORT_PROGRESS_READING = "Reading rows";
export const IMPORT_PROGRESS_COPYING = "Making the table";
export const IMPORT_FAILED_MESSAGE = "The import failed, and nothing was imported.";
export const IMPORT_OUT_OF_MEMORY_MESSAGE = "The browser ran out of memory, and nothing was imported.";
export const IMPORT_LOST_TRANSACTION_MESSAGE = " The transaction you had open was undone as well.";
export const IMPORT_NOT_OPENED_MESSAGE = "The new database could not be opened, and nothing was imported.";
// Import pressed while another database is on its way (Back or Forward, under the dialog). When
// that database has opened the dialog closes (it was made for the one before); when it could
// not be opened, the dialog stays as it is.
export const IMPORT_LOADING_DIALOG_MESSAGE =
    "A database is still loading, so nothing was imported. Once it has opened, choose the files again. If it does not open, press Import again.";
// The open database is not one the files can go into after all (it changed under the dialog).
export const IMPORT_DESTINATION_GONE_MESSAGE =
    "Nothing was imported: files cannot go into the database that is open now. Choose a new database, or close this and choose the files again.";
export const importedMessage = (tables, database) => `Imported ${tables} ${tables === 1 ? "table" : "tables"} into ${database}`;

// The report in the results pane (js/lab/import-report.js).
export const importReportTableLine = (rows, columns, source) =>
    `${rows} ${rows === 1 ? "row" : "rows"}, ${columns} ${columns === 1 ? "column" : "columns"}, from ${source}`;
export const IMPORT_REPORT_COLUMN_HEADING = "Column";
export const IMPORT_REPORT_ORIGINAL_HEADING = "Name in the file";
export const IMPORT_REPORT_TYPE_HEADING = "Type";
export const IMPORT_REPORT_BLANKS_HEADING = "Blanks";
export const IMPORT_REPORT_NOTE_HEADING = "Note";
export const IMPORT_REPORT_BLANK_NAME = "blank";
export const IMPORT_REPORT_BLOCKING_NOTE = "Mostly numbers. The first value that is not:";
export const IMPORT_REPORT_QUOTES_WARNING =
    "A quote in this file has no partner. Everything after it may have been read as one field: look at the last rows.";
// The lines of an import's event in the evidence log (js/lab/events.js): what matters first.
export const importEventFileLine = (name, bytes) => `file: ${name}, ${bytes} bytes`;
export const importEventTableLine = (table, rows, columns) => `table: ${table}, ${rows} rows, ${columns} columns`;
