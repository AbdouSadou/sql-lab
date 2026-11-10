// Exercise sets: loading, validation and discovery. No DOM. Spec section 5.
//
// A set is one file, exercises/<set id>.json:
//   {id, title, dataset, exercises: [{id, title, prompt, model_query, hints?,
//                                     order_matters?, check_column_names?}, ...]}
// Everything in it is untrusted text (an instructor's typo or a bad merge is the likeliest
// source, but callers still use textContent), and every problem becomes a message instead
// of an exception. Messages are worded for the instructor who edits the file and only ever
// echo an id that matched SHARE_ID_PATTERN. (The one other name that is shown is the file
// name of a listing entry that did not match; it is never put in a message or a request. See
// badNamesInListing.)
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
//       listing below), sorted by id, each one loaded with loadSet. A .json file whose name
//       cannot be an id ("Week 3.json") is an entry too, {id: <its name>, ok: false, problem},
//       sorted among the others and counted against the same limit (the sets first: the names
//       only fill the room the sets leave); no request is made for it, and its `id` is only a
//       name to show, not an id: it must never go into a URL, a selector or a lookup of a set.
//       Never throws; no listing means [] and is not an error (?set=<id> and share links still
//       work, they fetch the file directly). `problem` is plain text for the instructor; escape
//       it or use textContent.
//
// The listing. A static host cannot list a folder, and adding exercises must be "commit one
// JSON file", so the folder page is read: python3 -m http.server serves a listing by
// itself and the Pages deploy step writes exercises/index.html. Only an href whose entire
// value, after percent-decoding, is "<id>.json" with an id that matches SHARE_ID_PATTERN
// counts. The URL that is fetched is rebuilt from the id, never taken from the href, so a
// listing can not make the page request anything outside exercises/. The other plain .json
// names of the folder are reported (badNamesInListing) so that the Exercises menu can show the
// instructor that a file was committed under a name that cannot work; they are not fetched.

import {
    EXERCISES_DIR,
    LISTED_NAME_MAX_CHARS,
    MAX_LISTED_SETS,
    SET_BAD_FILE_NAME_MESSAGE,
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

// hrefsInListing is the href of every link of an HTML listing, or [] when it cannot be read.
function hrefsInListing(html) {
    try {
        const doc = new DOMParser().parseFromString(html, "text/html");
        return [...doc.querySelectorAll("a[href]")].map((link) => link.getAttribute("href"));
    } catch {
        return [];
    }
}

// idsInListing reads the set ids out of an HTML listing. Returns a sorted array of ids.
export function idsInListing(html) {
    const ids = new Set();
    for (const href of hrefsInListing(html)) {
        const name = jsonNameFromHref(href);
        if (isId(name)) {
            ids.add(name);
        }
    }
    return [...ids].sort(compareCodeUnits);
}

// badNamesInListing reads out of an HTML listing the files that look like sets but cannot be:
// links that end in ".json", are plain file names of this folder (no "/" or "\" once
// decoded, so nothing that points elsewhere), and are not an id ("Week 3.json",
// "week1.v2.json"). Returns the names without ".json", sorted and each cut to
// LISTED_NAME_MAX_CHARS characters (by code point, so no character is torn in two) for display.
export function badNamesInListing(html) {
    const names = new Set();
    for (const href of hrefsInListing(html)) {
        const name = jsonNameFromHref(href);
        if (name !== null && !isId(name) && !/[\\/]/.test(name)) {
            names.add(Array.from(name).slice(0, LISTED_NAME_MAX_CHARS).join(""));
        }
    }
    return [...names].sort(compareCodeUnits);
}

// The decoded href without its ".json", or null when it does not end in ".json" or its
// percent-encoding is malformed.
function jsonNameFromHref(href) {
    let decoded;
    try {
        decoded = decodeURIComponent(href);
    } catch {
        return null;
    }
    return decoded.endsWith(".json") ? decoded.slice(0, -".json".length) : null;
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
    // ids and unusable names are different things (an id matches the pattern, a bad name never
    // does, so no name is in both lists). Both count against MAX_LISTED_SETS, but the sets come
    // first: the names fill the room the sets leave, so a folder of badly named files cannot push
    // the sets that work out of the menu. The two are then sorted as one list.
    const ids = idsInListing(html).slice(0, MAX_LISTED_SETS);
    const found = [
        ...ids.map((id) => ({ id, bad: false })),
        ...badNamesInListing(html)
            .slice(0, MAX_LISTED_SETS - ids.length)
            .map((id) => ({ id, bad: true })),
    ].sort((a, b) => compareCodeUnits(a.id, b.id));
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
