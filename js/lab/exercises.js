// Exercise sets: loading, validation and discovery. No DOM. Spec section 5.
//
// A set is one file, exercises/<set id>.json:
//   {id, title, dataset, exercises: [{id, title, prompt, model_query, hints?,
//                                     order_matters?, check_column_names?}, ...]}
// Everything in it is untrusted text (an instructor's typo or a bad merge is the likeliest
// source, but callers still use textContent), and every problem becomes a message instead
// of an exception. Messages are worded for the instructor who edits the file and only ever
// echo an id that matched SHARE_ID_PATTERN.
//
// Exports:
//   validateSet(data, expectedId) -> {ok: true, set} | {ok: false, message}
//       data is parsed JSON, expectedId the file name without ".json". The returned set is
//       a plain copy: {id, title, dataset, exercises: [{id, title, prompt, hints: string[],
//       model_query, order_matters: boolean, check_column_names: boolean}]}; unknown keys
//       are dropped. NEVER show model_query: it belongs to js/lab/checker.js. Render the
//       other fields with textContent.
//   loadSet(id) -> Promise<{ok: true, set} | {ok: false, message}>
//       Fetches exercises/<id>.json (relative URL, cache "no-cache") and validates it. Never
//       throws. A success is remembered for the page (the same set object comes back); a
//       failure is not, so the next call tries again.
//   listSets() -> Promise<Array<{id, ok: true, set} | {id, ok: false, problem}>>
//       Discovers the sets by fetching the folder URL exercises/ and reading its links (see
//       listing below), sorted by id, each one loaded with loadSet. Never throws; no
//       listing means [] and is not an error (?set=<id> and share links still work, they
//       fetch the file directly). `problem` is plain text for the instructor; escape it or
//       use textContent.
//
// The listing. A static host cannot list a folder, and adding exercises must be "commit one
// JSON file", so the folder page is read: python3 -m http.server serves a listing by
// itself and the Pages deploy step writes exercises/index.html. Only an href whose entire
// value, after percent-decoding, is "<id>.json" with an id that matches SHARE_ID_PATTERN
// counts. The URL that is fetched is rebuilt from the id, never taken from the href, so a
// listing can not make the page request anything outside exercises/.

import {
    EXERCISES_DIR,
    MAX_LISTED_SETS,
    SET_BAD_ID_MESSAGE,
    SET_NOT_JSON_MESSAGE,
    SHARE_ID_PATTERN,
    exerciseSetUrl,
    setInvalidMessage,
    setUnreachableMessage,
} from "./config.js";

const isId = (value) => typeof value === "string" && SHARE_ID_PATTERN.test(value);
const isObject = (value) => value !== null && typeof value === "object" && !Array.isArray(value);
const isText = (value) => typeof value === "string" && value.trim() !== "";

export function validateSet(data, expectedId) {
    // `id` is only echoed after it has matched the pattern, so `fail` never carries raw text
    const fail = (problem) => ({ ok: false, message: setInvalidMessage(echo(expectedId), problem) });

    if (!isObject(data)) {
        return fail("the top level must be an object.");
    }
    if (!isId(data.id)) {
        return fail('it needs an "id" of 1 to 64 letters, digits, "_" or "-".');
    }
    if (data.id !== expectedId) {
        return fail(`its "id" is "${data.id}", but the file name says "${echo(expectedId)}"; they must match.`);
    }
    if (!isText(data.title)) {
        return fail('it needs a "title".');
    }
    if (!isId(data.dataset)) {
        return fail('it needs a "dataset": the id of a dataset in datasets/manifest.json.');
    }
    if (!Array.isArray(data.exercises)) {
        return fail('"exercises" must be a list.');
    }
    if (data.exercises.length === 0) {
        return fail('"exercises" is empty; it needs at least one exercise.');
    }

    const seen = new Set();
    const exercises = [];
    for (const [index, raw] of data.exercises.entries()) {
        const where = `exercise ${index + 1}`;
        if (!isObject(raw)) {
            return fail(`${where} must be an object.`);
        }
        if (!isId(raw.id)) {
            return fail(`${where} needs an "id" of 1 to 64 letters, digits, "_" or "-" (a link carries it).`);
        }
        if (seen.has(raw.id)) {
            return fail(`the exercise id "${raw.id}" is used more than once.`);
        }
        seen.add(raw.id);
        for (const field of ["title", "prompt", "model_query"]) {
            if (!isText(raw[field])) {
                return fail(`exercise "${raw.id}" needs a "${field}" (text that is not blank).`);
            }
        }
        if (raw.hints !== undefined && (!Array.isArray(raw.hints) || !raw.hints.every((h) => typeof h === "string"))) {
            return fail(`the "hints" of exercise "${raw.id}" must be a list of text.`);
        }
        for (const field of ["order_matters", "check_column_names"]) {
            if (raw[field] !== undefined && typeof raw[field] !== "boolean") {
                return fail(`the "${field}" of exercise "${raw.id}" must be true or false.`);
            }
        }
        exercises.push({
            id: raw.id,
            title: raw.title.trim(),
            prompt: raw.prompt,
            hints: raw.hints ? [...raw.hints] : [],
            model_query: raw.model_query,
            order_matters: raw.order_matters === true,
            check_column_names: raw.check_column_names === true,
        });
    }
    return {
        ok: true,
        set: { id: data.id, title: data.title.trim(), dataset: data.dataset, exercises },
    };
}

// echo is an id for a message, or a neutral word when it is not one.
function echo(id) {
    return isId(id) ? id : "?";
}

// ---- loading ---------------------------------------------------------------------------

const loaded = new Map(); // id -> promise of a successful result

export function loadSet(id) {
    if (!isId(id)) {
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
        // no-cache: revalidate, so a committed change shows up without waiting out a cache
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
        // validateSet should not throw; a hostile structure must still not escape
        return { ok: false, message: setInvalidMessage(id, "it could not be read.") };
    }
}

// ---- discovery -------------------------------------------------------------------------

// idsInListing reads the set ids out of an HTML listing. Returns a sorted array of ids.
export function idsInListing(html) {
    const ids = new Set();
    let doc;
    try {
        doc = new DOMParser().parseFromString(html, "text/html");
    } catch {
        return [];
    }
    for (const link of doc.querySelectorAll("a[href]")) {
        const id = idFromHref(link.getAttribute("href"));
        if (id) {
            ids.add(id);
        }
    }
    return [...ids].sort(compareCodeUnits);
}

function idFromHref(href) {
    let decoded;
    try {
        decoded = decodeURIComponent(href);
    } catch {
        return null;
    }
    if (!decoded.endsWith(".json")) {
        return null;
    }
    const id = decoded.slice(0, -".json".length);
    return isId(id) ? id : null;
}

const compareCodeUnits = (a, b) => (a < b ? -1 : a > b ? 1 : 0);

export async function listSets() {
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
    return Promise.all(
        ids.map(async (id) => {
            const result = await loadSet(id);
            return result.ok ? { id, ok: true, set: result.set } : { id, ok: false, problem: result.message };
        })
    );
}
