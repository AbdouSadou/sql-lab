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
