// F7 exercise progress: which exercises of a set the student has passed, and the SQL they
// last wrote for each. No DOM.
//
// localStorage, one key per set: PROGRESS_PREFIX (config.js) + set id, holding {v: 1, passed: {<exercise id>: true}, drafts: {<exercise id>: "<sql>"}}. This is
// the only thing here that touches storage (together with the old sqlime.query.* slot of
// js/storage.js). Student numbers are not involved and nothing here goes in a URL.
//
// Exports (all take the set id first; an id that does not match SHARE_ID_PATTERN is
// treated as unknown: reads give the empty answer, writes do nothing):
//   isPassed(setId, exerciseId) -> boolean
//   markPassed(setId, exerciseId)        passing is sticky: nothing but resetSet un-passes
//   passedCount(setId, exerciseIds?) -> number
//       With a list of the set's exercise ids, counts only those (an exercise removed from
//       the file does not inflate "7/10 complete"); without, counts every stored pass.
//   getDraft(setId, exerciseId) -> string | null    the SQL saved for the exercise
//   saveDraft(setId, exerciseId, sql)    blank SQL removes the draft
//   resetSet(setId)                      forgets passes AND drafts of the set
//
// Robustness: stored JSON that is corrupt or of another shape counts as empty (and is
// replaced at the next write). A storage exception (private mode, quota, blocked site
// data) never reaches the caller: the set's progress then lives in memory for the rest of
// the session, and the page says so (storage-notice.js). Reads go to storage every time
// (another tab may have written), unless a write to storage failed earlier for that set, in
// which case memory is the truth. A read that throws answers with an empty state marked
// unread, which says nothing about what is stored, so a write made from it merges what is
// stored first, and if storage still cannot be read the set stays in memory; what could not be
// read is never written over. Every write tries storage first, so a set that failed goes
// back to storage (and the notice goes) as soon as there is room again; resetSet does the same.
// That first successful write merges what is stored into the set held in memory (passes are
// sticky, so another tab's passes are not overwritten, and a pass held here comes back even if
// another tab reset the set meanwhile; a stored draft is added only for an exercise whose draft
// this page did not empty meanwhile), see write(). The exception is a set whose reset storage
// refused: the copy still stored is the very one being reset, so that write replaces it without
// merging it back (pendingResets), and the replacement is what completes the reset.

import { PROGRESS_PREFIX, PROGRESS_VERSION, SHARE_ID_PATTERN } from "./config.js";
import { reportStorage } from "./storage-notice.js";

const isId = (value) => typeof value === "string" && SHARE_ID_PATTERN.test(value);

// set id -> state, for sets whose storage is unusable
const inMemory = new Map();
// set id -> ids of drafts the student emptied while the set was held in memory. The merge at the
// first successful write must not bring those back from what is stored (the stored copy is older
// than the deletion). Gone at that write, and at resetSet.
const emptiedDrafts = new Map();
// ids of sets whose reset storage refused. The copy still stored is the old one, so the merge at
// the next successful write must not read it; that write overwrites it, which finishes the reset.
const pendingResets = new Set();

function emptyState() {
    return { passed: new Set(), drafts: new Map() };
}

// parse turns stored text into a state; anything unexpected gives the empty state.
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
            if (value === true && isId(id)) {
                state.passed.add(id);
            }
        }
    }
    if (drafts !== null && typeof drafts === "object" && !Array.isArray(drafts)) {
        for (const [id, value] of Object.entries(drafts)) {
            if (typeof value === "string" && isId(id)) {
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
        drafts: Object.fromEntries(state.drafts),
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
        // not what is stored, only nothing known about it: see write()
        return { ...emptyState(), unread: true };
    }
}

function write(setId, state) {
    // storage is tried every time, also for a set that failed before: when there is room again,
    // the set goes back to storage and the notice goes away
    try {
        if ((inMemory.has(setId) && !pendingResets.has(setId)) || state.unread) {
            // This page held the set back while storage was unusable, or could not read it a
            // moment ago, and another tab may have stored passes since: passing is sticky, so
            // what is stored is merged in first (the union of passes; a stored draft only for an
            // exercise this page has no draft for). A getItem that throws lands in the catch:
            // unread storage is not written over.
            const text = localStorage.getItem(PROGRESS_PREFIX + setId);
            if (text !== null && text !== undefined) {
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
        // another set may still be only in memory: the notice stays until none is
        reportStorage("progress", inMemory.size === 0);
    } catch {
        // storage is unusable (private mode, quota): keep this set's progress in memory, and
        // say so (js/lab/storage-notice.js)
        inMemory.set(setId, state);
        reportStorage("progress", false);
    }
}

export function isPassed(setId, exerciseId) {
    return isId(setId) && isId(exerciseId) && read(setId).passed.has(exerciseId);
}

export function markPassed(setId, exerciseId) {
    if (!isId(setId) || !isId(exerciseId)) {
        return;
    }
    const state = read(setId);
    if (!state.passed.has(exerciseId)) {
        state.passed.add(exerciseId);
        write(setId, state);
    }
}

export function passedCount(setId, exerciseIds = null) {
    if (!isId(setId)) {
        return 0;
    }
    const passed = read(setId).passed;
    return exerciseIds === null ? passed.size : exerciseIds.filter((id) => passed.has(id)).length;
}

export function getDraft(setId, exerciseId) {
    if (!isId(setId) || !isId(exerciseId)) {
        return null;
    }
    return read(setId).drafts.get(exerciseId) ?? null;
}

export function saveDraft(setId, exerciseId, sql) {
    if (!isId(setId) || !isId(exerciseId) || typeof sql !== "string") {
        return;
    }
    const state = read(setId);
    const empty = sql.trim() === "";
    // Nothing to remove, unless the state says nothing about what is stored: the draft may be
    // there, and the merge in write() has to know that it was emptied.
    if (empty && !state.drafts.has(exerciseId) && !state.unread) {
        return;
    }
    // Noted before the write, which is what merges (and forgets these marks when it succeeds): the
    // very write that finds storage usable again must not bring back the draft it is removing.
    const emptied = emptiedDrafts.get(setId) ?? new Set();
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

export function resetSet(setId) {
    if (!isId(setId)) {
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
