// Events of the evidence log (assessment plan, section 6): a file imported, tables exported, a
// database reset or reopened. The evidence file lists them among the queries, as numbered
// entries in one sequence, so that it reads as a timeline (js/lab/evidence.js writes them, in a
// version 2 file; js/lab/evidence-dialog.js puts them in their place with timeline()).
//
// Storage. Events are kept apart from the run log (js/lab/run-log.js), which throws away every
// stored entry that is not a query whenever it writes: a tab still running an older release
// would erase them, and the log's cap of 200 entries would push an import out first. One
// localStorage key per log: EVENTS_PREFIX + the log key (the same key the run log uses: a
// dataset id, or "file:<database name>"). The value is JSON,
//   {"v": 1, "events": [{"t": "2026-11-15T10:02:11Z", "kind": "import", "after": 0,
//                        "lines": ["file: sales.csv, 2128 bytes", "table: sales, 22 rows, 13 columns"]}]}
// oldest first, at most EVENTS_MAX of them and EVENTS_MAX_BYTES of text in their lines. Stored
// text is untrusted: anything that is not this shape counts as no events, and an event that is
// not this shape is skipped. One exception: a value with a later version number was written by
// a newer release, and is treated like storage that cannot be read (below), so that this release
// does not write over what it cannot understand. Any change to what an event may hold, a new
// kind included, therefore needs a new EVENTS_VERSION.
//
// An event has its time to the second, as a query has; its kind, one of EVENT_KINDS; its lines of
// detail (one line each, at least one; the evidence file writes them as they are, with a
// backslash in front of one that has the shape of a header); and `after`, the number of queries
// of the event's own second that were already in the run log when it happened. A query's time
// has no finer grain than a second, and queries carry no ids, so `after` is what keeps an event
// in its place among the queries of its second.
//
// Writes follow the run log's rules. recordEvent stores the event before it returns. The stored
// events are read again first, so those another tab stored are kept. When the browser refuses a
// write (quota), the stored copy gets the most of the newest events that it will take, and this
// page keeps them all in memory, where readEvents finds them, so an evidence file exported from
// this page is complete while it is open. Stored events that cannot be read (getItem throws, or
// a newer release's value) are never written over: the new events then live in memory only, and
// are stored with the others once the stored ones can be read again. Events that were stored
// before the trouble began are out of reach until then. There is no notice for any of this yet:
// until Phase 2 of the plan nothing in the page records an event. Nothing here throws.
//
// What this does not promise (limits kept on purpose; the first two are the run log's too):
//   - Events carry no ids. Two that are equal in every field (time, kind, `after`, lines) count
//     as one when one of them is only in a page's memory and the other is stored: two tabs
//     while one could not store, or one tab whose storage could not be read between the two.
//   - Only the page whose own write was refused keeps everything in memory. A page whose writes
//     all succeeded holds nothing of its own: when another tab, out of room, then stores a
//     shorter list, the first page's list is that shorter one too, its own older events gone
//     from it (they are still in the other tab's memory while that tab is open).
//   - The order of the events of one second holds for one page. When two tabs record in the
//     same second while one of them could not store, the events of that second can come out in
//     another order than they were recorded in, the other tab's own two included, and are then
//     stored so (combine, below, puts what another tab stored before what this page holds).
//     Nothing is lost or listed twice by it, and across seconds the order is always the true one.
//
//   recordEvent(key, {kind, lines}, now?) -> the event as stored, or null when it is refused
//       (no log key, an unknown kind, no line of detail, a time that is not a date). Lines are
//       made one-line and cut to EVENT_MAX_LINE_CHARS, and no more than EVENT_MAX_LINES are
//       kept: the last one then says how many are not listed. A caller puts what matters first
//       in a line.
//   readEvents(key) -> event[]     oldest first; copies, the caller's to change; none for no key
//   timeline(queries, events) -> the queries and the events in the order the evidence file
//       lists them. Pure. The events are taken in time order (those of one second in their
//       stored order). An event goes after the first `after` queries of its own second, or after
//       all of them when fewer are left (the run log drops its oldest entries); with no query in
//       its second, it goes before the first later query. The queries keep their order. An
//       event comes out as {t, kind, lines}.

import { EVENT_KINDS } from "./config.js";
import {
    EVENTS_MAX,
    EVENTS_MAX_BYTES,
    EVENTS_PREFIX,
    EVENTS_VERSION,
    EVENT_MAX_LINES,
    EVENT_MAX_LINE_CHARS,
} from "./config-workflow.js";
// (TIMESTAMP: an event's time goes into the evidence file, so it has the shape the file takes)
import { TIMESTAMP, sanitizeLine, utcTimestamp } from "./evidence.js";
import { readLog } from "./run-log.js";

// the end of a line that was cut
const CUT = "…";

// key -> the events as this page holds them, for a log whose events could not all be stored
const memory = new Map();

const isLine = (line) =>
    typeof line === "string" && line.trim() !== "" && line.length <= EVENT_MAX_LINE_CHARS && sanitizeLine(line) === line;

function isEvent(event) {
    if (event === null || typeof event !== "object" || Array.isArray(event)) {
        return false;
    }
    return (
        typeof event.t === "string" &&
        TIMESTAMP.test(event.t) &&
        EVENT_KINDS.includes(event.kind) &&
        Number.isSafeInteger(event.after) &&
        event.after >= 0 &&
        Array.isArray(event.lines) &&
        event.lines.length > 0 &&
        event.lines.length <= EVENT_MAX_LINES &&
        event.lines.every(isLine)
    );
}

const copyEvent = (event) => ({ t: event.t, kind: event.kind, after: event.after, lines: event.lines.slice() });

const storageKey = (key) => `${EVENTS_PREFIX}${key}`;

// stored(key) -> the stored events; [] when nothing is stored, or what is stored is not this
// store's; null when it cannot be read, or was written by a newer release
function stored(key) {
    let text;
    try {
        text = localStorage.getItem(storageKey(key));
    } catch {
        return null;
    }
    if (text === null || text === undefined) {
        return [];
    }
    try {
        const data = JSON.parse(text);
        if (data === null || typeof data !== "object" || Array.isArray(data)) {
            return [];
        }
        if (typeof data.v === "number" && data.v > EVENTS_VERSION) {
            return null;
        }
        if (data.v !== EVENTS_VERSION || !Array.isArray(data.events)) {
            return [];
        }
        return data.events.filter(isEvent).map(copyEvent).slice(-EVENTS_MAX);
    } catch {
        return [];
    }
}

const encoder = new TextEncoder();
const byteLength = (event) => event.lines.reduce((sum, line) => sum + encoder.encode(line).length, 0);

// The newest events that fit both limits (the newest one is always kept).
function cap(events) {
    const newest = events.slice(-EVENTS_MAX);
    let total = 0;
    let from = newest.length;
    while (from > 0) {
        const size = byteLength(newest[from - 1]);
        if (from < newest.length && total + size > EVENTS_MAX_BYTES) {
            break;
        }
        total += size;
        from--;
    }
    return newest.slice(from);
}

// what makes two events the same one: every field of them (events carry no ids)
const sameEvent = (a, b) => a.t === b.t && a.kind === b.kind && a.after === b.after && a.lines.join("\n") === b.lines.join("\n");
const byTime = (a, b) => (a.t < b.t ? -1 : a.t > b.t ? 1 : 0);

// combine(mine, theirs): this page's copy of events that did not all reach storage, and what is
// stored now. The stored copy is usually a tail of mine, and then mine is the answer. Events in
// the stored copy that mine lacks are older ones this page has let go at the cap, or were stored
// by another tab. They are put in by time, and within a second before all of mine (the sort is
// stable): an older event is then where it belongs, and when the cap drops the oldest it is
// never this page's own newest that go. For one page this is the true order in every case. With
// two tabs, the events of one second can come out in another order than they were recorded in
// (see the limits at the top). Equal events are matched one to one.
function combine(mine, theirs) {
    const left = mine.slice();
    const others = [];
    for (const event of theirs) {
        const at = left.findIndex((own) => sameEvent(own, event));
        if (at === -1) {
            others.push(event);
        } else {
            left.splice(at, 1);
        }
    }
    return others.length ? others.concat(mine).sort(byTime) : mine.slice();
}

// the events as this page sees them: the stored ones, plus what only this page holds
function current(key) {
    const theirs = stored(key) ?? [];
    return memory.has(key) ? cap(combine(memory.get(key), theirs)) : theirs;
}

export function readEvents(key) {
    try {
        // (no log key: no database has loaded yet)
        return typeof key === "string" && key ? current(key).map(copyEvent) : [];
    } catch {
        return [];
    }
}

function write(key, events) {
    try {
        localStorage.setItem(storageKey(key), JSON.stringify({ v: EVENTS_VERSION, events }));
        return true;
    } catch {
        return false;
    }
}

// writeNewest stores all the events, or, when the browser has no room for them, the most of the
// newest ones it will take (found in a few tries, not one try for each event). Returns how many
// were stored: 0 when not even the newest fits, and the stored copy is then as it was.
function writeNewest(key, events) {
    if (write(key, events)) {
        return events.length;
    }
    let stored = 0;
    let low = 1;
    let high = events.length - 1;
    while (low <= high) {
        const count = (low + high) >> 1;
        if (write(key, events.slice(-count))) {
            // (a later try that succeeds holds more, so the last one to succeed is the best)
            stored = count;
            low = count + 1;
        } else {
            high = count - 1;
        }
    }
    return stored;
}

// cutLine shortens a line that is too long, between characters (never through one).
function cutLine(line) {
    if (line.length <= EVENT_MAX_LINE_CHARS) {
        return line;
    }
    let kept = "";
    for (const character of line) {
        if (kept.length + character.length > EVENT_MAX_LINE_CHARS - CUT.length) {
            break;
        }
        kept += character;
    }
    return `${kept}${CUT}`;
}

// tidy makes the lines of an event what the evidence file can hold: text on one line each, none
// empty, none longer than EVENT_MAX_LINE_CHARS, and no more than EVENT_MAX_LINES of them (the
// last one then says how many were left out).
function tidy(lines) {
    const clean = lines
        .map((line) => sanitizeLine(line))
        .filter((line) => line.trim() !== "")
        .map(cutLine);
    if (clean.length <= EVENT_MAX_LINES) {
        return clean;
    }
    const kept = clean.slice(0, EVENT_MAX_LINES - 1);
    return kept.concat(`(${clean.length - kept.length} more lines are not listed)`);
}

// recordEvent stores one event of the log `key`, with the time `now`.
export function recordEvent(key, detail, now = new Date()) {
    try {
        const { kind, lines } = detail ?? {};
        if (typeof key !== "string" || !key || !EVENT_KINDS.includes(kind) || !Array.isArray(lines)) {
            return null;
        }
        const clean = tidy(lines);
        const t = utcTimestamp(now);
        if (!clean.length || !TIMESTAMP.test(t)) {
            return null;
        }
        const event = { t, kind, after: readLog(key).filter((entry) => entry.t === t).length, lines: clean };
        // The stored events are read again first, so a tab that wrote a moment ago is not
        // overwritten; a copy in memory is merged with them, never written over them.
        const theirs = stored(key);
        const own = memory.get(key);
        const all = cap((own ? combine(own, theirs ?? []) : theirs ?? []).concat(event));
        if (theirs === null) {
            // Events that cannot be read are not events that can be added to: writing would
            // replace them with what this page holds alone.
            memory.set(key, all);
            return copyEvent(event);
        }
        if (writeNewest(key, all) === all.length) {
            memory.delete(key);
        } else {
            // storage could not take all of them (or any): this page keeps them, so an export
            // from it is complete for as long as it is open
            memory.set(key, all);
        }
        return copyEvent(event);
    } catch {
        // an event that cannot be kept must not stop an import or an export
        return null;
    }
}

// timeline puts the events among the queries, in the order the evidence file lists them.
export function timeline(queries, events) {
    // places[i] holds the events that go just before queries[i]; the last one, those after all
    const places = Array.from({ length: queries.length + 1 }, () => []);
    for (const event of events.slice().sort(byTime)) {
        const sameSecond = [];
        queries.forEach((query, index) => {
            if (query.t === event.t) {
                sameSecond.push(index);
            }
        });
        let at;
        if (sameSecond.length) {
            const after = Number.isSafeInteger(event.after) && event.after > 0 ? event.after : 0;
            const passed = Math.min(after, sameSecond.length);
            at = passed === 0 ? sameSecond[0] : sameSecond[passed - 1] + 1;
        } else {
            at = queries.findIndex((query) => query.t > event.t);
            if (at === -1) {
                at = queries.length;
            }
        }
        places[at].push({ t: event.t, kind: event.kind, lines: event.lines.slice() });
    }
    return places.flatMap((before, index) => (index < queries.length ? [...before, queries[index]] : before));
}
