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
