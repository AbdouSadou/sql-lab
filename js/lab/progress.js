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
// the session. Reads go to storage every time (another tab may have written), unless a
// write to storage failed earlier for that set, in which case memory is the truth.

import { PROGRESS_PREFIX, PROGRESS_VERSION, SHARE_ID_PATTERN } from "./config.js";

const isId = (value) => typeof value === "string" && SHARE_ID_PATTERN.test(value);

// set id -> state, for sets whose storage is unusable
const inMemory = new Map();

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
        return emptyState();
    }
}

function write(setId, state) {
    if (inMemory.has(setId)) {
        inMemory.set(setId, state);
        return;
    }
    try {
        localStorage.setItem(PROGRESS_PREFIX + setId, serialize(state));
    } catch {
        // storage is unusable (private mode, quota): keep this set's progress in memory
        inMemory.set(setId, state);
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
    if (sql.trim() === "") {
        if (!state.drafts.delete(exerciseId)) {
            return;
        }
    } else {
        state.drafts.set(exerciseId, sql);
    }
    write(setId, state);
}

export function resetSet(setId) {
    if (!isId(setId)) {
        return;
    }
    if (inMemory.has(setId)) {
        inMemory.set(setId, emptyState());
    }
    try {
        localStorage.removeItem(PROGRESS_PREFIX + setId);
    } catch {
        inMemory.set(setId, emptyState());
    }
}
