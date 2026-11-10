// F6 run log: every Run is kept, per dataset, in localStorage, and can be put back in the
// editor from a popup in the command bar. The log is also what the evidence export (F11,
// js/lab/evidence-dialog.js) writes out.
//
// Storage. One key per log: RUN_LOG_PREFIX + the log key. The log key is the dataset id for a
// built-in dataset, and "file:<database name>" for anything else (an upload, a URL, the empty
// database), so those never mix with a dataset's log. The name is taken when the database is
// opened, so renaming a database later does not split its log. The value is JSON,
//   {"v": 1, "entries": [{"t": "2026-11-09T13:58:12Z", "sql": "...", "rows": 12},
//                        {"t": "...", "sql": "...", "error": "no such column: pric"}]}
// oldest first, at most RUN_LOG_MAX_ENTRIES. Stored text is untrusted: anything that is not
// this shape counts as an empty log, and an entry that is not this shape is skipped.
//
// What is logged. A Run: lab:run-finished with preview false (js/index.js execute). A Check
// performs a visible run through the same function, so it is logged once. The table preview
// the app runs itself (preview true) is not a Run. The checker's own runs never fire the
// event.
//
// Writes. appendLog stores the entry in localStorage before it returns, so a Run that is on
// screen is already stored, and a page that is left (a link, a reload, a closed tab) a
// moment later loses nothing. The write reads the log from localStorage again first, so
// entries another tab stored earlier are kept. Reading and writing one key is not atomic
// across tabs, so two tabs that append within the same few milliseconds can still overwrite
// each other's entry; a person cannot run two queries that close, and tabs that run 25 ms
// or more apart lose nothing. A Web Lock would close that gap but is not used: Web Locks are
// asynchronous, so the entry would exist only in memory until the lock is granted, and it
// would be lost if the page left first (measured: in Chromium most Runs followed at once by
// a navigation were lost). Keeping every Run is the promise; the same-millisecond tab race
// is not. When the browser refuses a write (quota), the oldest entries of this log are dropped
// from the stored copy until the new one fits, and the page keeps the whole capped log in
// memory (readLog answers from it, so the popup and the export stay complete while the page
// is open); a "lab:storage-state" event makes storage-notice.js say so. The copy in memory is
// merged with the stored log at every read and write, never written over it: entries another
// tab stored meanwhile are kept (compared by time, SQL and outcome). A stored log that cannot
// be read at all (getItem throws) is not written to; the log then lives in memory, with the
// notice. If storage is unusable the log is kept in memory the same way. The notice stays
// while any log is only in memory. Besides RUN_LOG_MAX_ENTRIES a log is capped at
// RUN_LOG_MAX_BYTES of SQL and error text, counted in UTF-8 bytes (TextEncoder; characters
// would let non-ASCII text through at up to four times the size), oldest first, because memory
// has no quota and the evidence file must stay under what verify.html accepts. SQL of an entry
// is never truncated. Nothing here throws.
//
// Merging has one known blind spot. Entries carry no id, so an entry in the stored log and one
// in this page's memory are the same entry when their time (to the second), SQL and outcome are
// equal, counted as a multiset (mine=[X,X] with stored=[X,X,X] is three entries, not two). Two
// tabs that run identical SQL with an identical outcome in the same second, while this page is
// holding a log in memory, therefore count as one entry. That needs storage trouble and two
// Runs of the same text in one second from two tabs; it is accepted, and no ids are added.
//
// Exports:
//   logKeyFor(dataset, databaseName) -> string
//   isDatasetKey(key) -> boolean       true for a dataset id, false for "file:..."
//   readLog(key) -> entry[]            oldest first
//   appendLog(key, entry)              an entry is {t, sql, rows} or {t, sql, error}
//   mountRunLog({ui}) -> {current()}   called once from index.js; current() is {key, entries}
//
// The popup. #run-history (aria-expanded) sits after #copy-link in the command bar and opens
// #run-history-list, which is built when it opens (createElement and textContent only) and
// holds one real button per entry, newest first. It is a button with a popup, not a <select>,
// because a native select fires change on every arrow key in Chromium and Firefox, which would
// overwrite the editor text while the student only browses. Choosing an entry puts its SQL in
// the editor (never runs it, never saves it) and returns the focus to the editor; Escape closes
// the popup and returns the focus to the toggle; a click or Tab outside closes it; ArrowDown,
// ArrowUp, Home and End move through the entries.

import {
    HISTORY_BUTTON_TEXT,
    HISTORY_BUTTON_TITLE,
    HISTORY_EMPTY_MESSAGE,
    HISTORY_ERROR_WORD,
    HISTORY_LIST_LABEL,
    HISTORY_RESTORED_MESSAGE,
    HISTORY_SQL_PREVIEW_CHARS,
    HISTORY_TIME_ZONE,
    RUN_LOG_FILE_PREFIX,
    RUN_LOG_MAX_BYTES,
    RUN_LOG_MAX_ENTRIES,
    RUN_LOG_PREFIX,
    RUN_LOG_VERSION,
    SHARE_ID_PATTERN,
    STATEMENT_ELLIPSIS,
    historyRowsText,
} from "./config.js";
import { utcTimestamp } from "./evidence.js";
import { escapeHtml } from "./html.js";
import { reportStorage } from "./storage-notice.js";

const TIMESTAMP = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/;

export function logKeyFor(dataset, databaseName) {
    return dataset ? dataset.id : `${RUN_LOG_FILE_PREFIX}${databaseName ?? ""}`;
}

export function isDatasetKey(key) {
    return typeof key === "string" && SHARE_ID_PATTERN.test(key);
}

// ---- storage ---------------------------------------------------------------------------

// key -> the log as this page holds it, for a log that could not be written in full
const memory = new Map();

function isEntry(entry) {
    if (entry === null || typeof entry !== "object" || Array.isArray(entry)) {
        return false;
    }
    if (typeof entry.t !== "string" || !TIMESTAMP.test(entry.t) || typeof entry.sql !== "string" || !entry.sql) {
        return false;
    }
    const hasRows = Object.hasOwn(entry, "rows");
    const hasError = Object.hasOwn(entry, "error");
    if (hasRows === hasError) {
        return false;
    }
    return hasRows
        ? Number.isSafeInteger(entry.rows) && entry.rows >= 0
        : typeof entry.error === "string" && entry.error !== "";
}

function copyEntry(entry) {
    return entry.error !== undefined
        ? { t: entry.t, sql: entry.sql, error: entry.error }
        : { t: entry.t, sql: entry.sql, rows: entry.rows };
}

// parseLog turns stored text into entries; corrupt or foreign text is an empty log.
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

const storageKey = (key) => `${RUN_LOG_PREFIX}${key}`;

// stored(key) -> the stored entries, [] when nothing is stored, null when storage cannot be read
function stored(key) {
    try {
        const text = localStorage.getItem(storageKey(key));
        return text === null || text === undefined ? [] : parseLog(text);
    } catch {
        return null;
    }
}

const sameEntry = (a, b) => a.t === b.t && a.sql === b.sql && a.rows === b.rows && a.error === b.error;

const encoder = new TextEncoder();
const byteLength = (text) => encoder.encode(text).length;

// The newest entries that fit both limits: RUN_LOG_MAX_ENTRIES, and RUN_LOG_MAX_BYTES of SQL and
// error text together, in UTF-8 bytes (the newest entry is always kept, whatever its size).
function cap(entries) {
    const newest = entries.slice(-RUN_LOG_MAX_ENTRIES);
    let total = 0;
    let from = newest.length;
    while (from > 0) {
        const entry = newest[from - 1];
        const size = byteLength(entry.sql) + (entry.error === undefined ? 0 : byteLength(entry.error));
        if (from < newest.length && total + size > RUN_LOG_MAX_BYTES) {
            break;
        }
        total += size;
        from--;
    }
    return newest.slice(from);
}

// combine(mine, theirs): this page's copy of a log that did not fit in storage, and what is
// stored now. The stored copy is usually a tail of mine (the oldest entries were dropped to make
// it fit) and then mine is the answer; entries in the stored copy that mine lacks were stored by
// another tab, and they are put in by time (stable, so entries of one second keep their order).
// Equal entries are matched one to one (the splice): a stored X is used up by one X of mine.
// Entries have no ids, so a stored X from another tab that equals one of mine is not told apart.
function combine(mine, theirs) {
    const left = mine.slice();
    const others = [];
    for (const entry of theirs) {
        const at = left.findIndex((own) => sameEntry(own, entry));
        if (at === -1) {
            others.push(entry);
        } else {
            left.splice(at, 1);
        }
    }
    return others.length ? mine.concat(others).sort((a, b) => (a.t < b.t ? -1 : a.t > b.t ? 1 : 0)) : mine.slice();
}

// the log as this page sees it: the stored one, plus what only this page holds
function current(key) {
    const theirs = stored(key) ?? [];
    return memory.has(key) ? cap(combine(memory.get(key), theirs)) : theirs;
}

export function readLog(key) {
    return current(key);
}

function write(key, entries) {
    try {
        localStorage.setItem(storageKey(key), JSON.stringify({ v: RUN_LOG_VERSION, entries }));
        return true;
    } catch {
        return false;
    }
}

// commit adds entries to the log. The stored log is read again first, so a tab that wrote a
// moment ago is not overwritten, and so is what this page held back earlier: a copy in memory
// is merged with the stored log, never written over it.
function commit(key, added) {
    try {
        const theirs = stored(key);
        const own = memory.get(key);
        const capped = cap((own ? combine(own, theirs ?? []) : theirs ?? []).concat(added));
        if (theirs === null) {
            // A log that cannot be read is not a log that can be added to: writing would replace
            // what is there with the newest entry alone, and the page could not read it back.
            memory.set(key, capped);
            reportStorage("log", false);
            return;
        }
        // out of room: let the oldest entries of this log go until the new one fits
        let kept = capped;
        let written = write(key, kept);
        while (!written && kept.length > 1) {
            kept = kept.slice(1);
            written = write(key, kept);
        }
        if (written && kept.length === capped.length) {
            memory.delete(key);
            // another log may still be only in memory: the notice stays until none is
            reportStorage("log", memory.size === 0);
        } else {
            // Storage could not take all of it (or any of it): this page keeps the whole log, so
            // the popup and the export are complete for as long as it is open.
            memory.set(key, capped);
            reportStorage("log", false);
        }
    } catch {
        // a log that cannot be kept must not stop a query
    }
}

export function appendLog(key, entry) {
    try {
        commit(key, [copyEntry(entry)]);
    } catch {
        // a log that cannot be kept must not stop a query
    }
}

// ---- the page --------------------------------------------------------------------------

const oneLine = (text) => String(text).replace(/\s+/g, " ").trim();

function sqlPreview(sql) {
    const line = oneLine(sql);
    const chars = Array.from(line);
    return chars.length <= HISTORY_SQL_PREVIEW_CHARS
        ? line
        : `${chars.slice(0, HISTORY_SQL_PREVIEW_CHARS).join("").trimEnd()}${STATEMENT_ELLIPSIS}`;
}

function span(className, text) {
    const el = document.createElement("span");
    el.className = className;
    el.textContent = text;
    return el;
}

export function mountRunLog({ ui }) {
    const editor = ui.editor;
    const keys = new WeakMap(); // database -> log key, fixed when the database is opened
    let currentKey = null;
    let shown = [];

    const toggle = document.createElement("button");
    toggle.type = "button";
    toggle.id = "run-history";
    toggle.textContent = HISTORY_BUTTON_TEXT;
    toggle.title = HISTORY_BUTTON_TITLE;
    toggle.setAttribute("aria-expanded", "false");
    toggle.setAttribute("aria-controls", "run-history-list");

    const list = document.createElement("div");
    list.id = "run-history-list";
    list.className = "run-history-list";
    list.setAttribute("role", "group");
    list.setAttribute("aria-label", HISTORY_LIST_LABEL);
    list.hidden = true;

    const copyLink = ui.commandbar.querySelector("#copy-link");
    if (copyLink) {
        copyLink.after(toggle, list);
    } else {
        ui.commandbar.append(toggle, list);
    }

    const isOpen = () => !list.hidden;
    const entryButtons = () => [...list.querySelectorAll("button.run-history-entry")];

    function render() {
        shown = currentKey === null ? [] : readLog(currentKey).reverse();
        list.replaceChildren();
        if (!shown.length) {
            const empty = document.createElement("p");
            empty.className = "run-history-empty";
            empty.textContent = HISTORY_EMPTY_MESSAGE;
            list.append(empty);
            return;
        }
        shown.forEach((entry, index) => {
            const button = document.createElement("button");
            button.type = "button";
            button.className = "run-history-entry";
            button.dataset.index = String(index);
            const outcome = entry.error !== undefined ? HISTORY_ERROR_WORD : historyRowsText(entry.rows);
            button.append(
                span("run-history-time", `${entry.t.slice(0, 10)} ${entry.t.slice(11, 19)} ${HISTORY_TIME_ZONE}`),
                " ",
                span(entry.error !== undefined ? "run-history-outcome run-history-outcome--error" : "run-history-outcome", outcome),
                " ",
                span("run-history-sql", sqlPreview(entry.sql))
            );
            list.append(button);
        });
    }

    function open() {
        render();
        list.hidden = false;
        toggle.setAttribute("aria-expanded", "true");
        // the popup can sit below the fold on a phone
        const first = entryButtons()[0];
        (first ?? list).scrollIntoView?.({ block: "nearest" });
        first?.focus();
    }

    // close hides the popup. focus: "toggle", "editor" or null (leave the focus where it is).
    function close(focus = null) {
        if (!isOpen()) {
            return;
        }
        list.hidden = true;
        list.replaceChildren();
        shown = [];
        toggle.setAttribute("aria-expanded", "false");
        if (focus === "toggle") {
            toggle.focus();
        } else if (focus === "editor") {
            editor.focus();
        }
    }

    function restore(index) {
        const entry = shown[index];
        if (!entry) {
            return;
        }
        // not run, and not saved as the student's last query: only a Run does that
        editor.value = entry.sql;
        ui.status.info(escapeHtml(HISTORY_RESTORED_MESSAGE));
        close("editor");
    }

    toggle.addEventListener("click", () => (isOpen() ? close("toggle") : open()));

    list.addEventListener("click", (event) => {
        const button = event.target instanceof Element ? event.target.closest("button.run-history-entry") : null;
        if (button && list.contains(button)) {
            restore(Number(button.dataset.index));
        }
    });

    function onKeydown(event) {
        if (!isOpen()) {
            return;
        }
        if (event.key === "Escape") {
            event.preventDefault();
            event.stopPropagation();
            close("toggle");
            return;
        }
        const buttons = entryButtons();
        if (!buttons.length) {
            return;
        }
        const at = buttons.indexOf(document.activeElement);
        let next = null;
        if (event.key === "ArrowDown") {
            next = at === -1 ? 0 : Math.min(at + 1, buttons.length - 1);
        } else if (event.key === "ArrowUp") {
            next = at === -1 ? buttons.length - 1 : Math.max(at - 1, 0);
        } else if (event.key === "Home" && at !== -1) {
            next = 0;
        } else if (event.key === "End" && at !== -1) {
            next = buttons.length - 1;
        }
        if (next !== null) {
            event.preventDefault();
            buttons[next].focus();
        }
    }
    toggle.addEventListener("keydown", onKeydown);
    list.addEventListener("keydown", onKeydown);

    // Tab (or anything else) taking the focus out of the toggle and the popup closes it
    const onFocusOut = (event) => {
        const to = event.relatedTarget;
        if (isOpen() && to instanceof Node && to !== toggle && !list.contains(to)) {
            close();
        }
    };
    toggle.addEventListener("focusout", onFocusOut);
    list.addEventListener("focusout", onFocusOut);

    // a click anywhere else
    document.addEventListener(
        "pointerdown",
        (event) => {
            if (isOpen() && event.target instanceof Node && event.target !== toggle && !toggle.contains(event.target) && !list.contains(event.target)) {
                close();
            }
        },
        true
    );

    document.addEventListener("lab:database-loaded", (event) => {
        const { database, dataset } = event.detail;
        currentKey = logKeyFor(dataset, database.name);
        keys.set(database, currentKey);
        close();
    });

    document.addEventListener("lab:run-finished", (event) => {
        const { database, sql, ok, rows, error, preview } = event.detail;
        if (preview || typeof sql !== "string" || !sql) {
            return;
        }
        const key = keys.get(database) ?? logKeyFor(null, database?.name);
        const t = utcTimestamp();
        appendLog(key, ok ? { t, sql, rows } : { t, sql, error: error || "unknown error" });
    });

    return {
        current() {
            return { key: currentKey, entries: currentKey === null ? [] : readLog(currentKey) };
        },
    };
}
