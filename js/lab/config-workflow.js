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

export const evidenceSavedWithEventsMessage = (filename, queries, events) =>
    `Exported ${filename} with ${queries} ${queries === 1 ? "query" : "queries"} and ${events} ${events === 1 ? "event" : "events"}`;

// ---- The loader for vendored libraries (js/lab/vendor-loader.js) ----

// A library that has not arrived after this long counts as one that could not be loaded.
export const VENDOR_LOAD_TIMEOUT_MS = 30_000;
