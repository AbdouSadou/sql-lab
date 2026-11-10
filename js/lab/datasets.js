// F1 datasets: the manifest, the dataset files and the pristine copy of the open dataset.
//
// datasets/manifest.json lists the built-in databases:
//   {"datasets": [{id, name, file, description?, default?}, ...]}
// Everything in it is untrusted text (a typo, or a bad merge, is the likeliest source, but
// callers still escape or use textContent), and every problem becomes a specific message
// instead of an exception, so the app can start on an empty database and say why.
//
// The bytes of the open dataset are kept as fetched. The exercise checker opens fresh
// connections from them, so earlier student changes cannot reach a check:
// getPristineBytes() hands out a copy every time. The copy the engine loads must be a
// separate one again, because manager.init's fromBytes edits the header bytes of the
// buffer it is given (it flips the WAL flags), which would corrupt the pristine record.

import {
    MANIFEST_UNREACHABLE_MESSAGE,
    MANIFEST_URL,
    SHARE_ID_PATTERN,
    SQLITE_HEADER,
    manifestInvalidMessage,
} from "./config.js";

// ---- manifest -------------------------------------------------------------------------

// validateManifest checks parsed JSON. Returns {ok: true, datasets} or {ok: false, message}.
// `datasets` holds plain copies of the entries (id, name, file, description, default).
export function validateManifest(data) {
    const fail = (problem) => ({ ok: false, message: manifestInvalidMessage(problem) });

    if (data === null || typeof data !== "object" || Array.isArray(data)) {
        return fail('the top level must be an object with a "datasets" list.');
    }
    const list = data.datasets;
    if (!Array.isArray(list)) {
        return fail('"datasets" must be a list.');
    }
    if (list.length === 0) {
        return fail('"datasets" is empty; it needs at least one dataset.');
    }

    const seen = new Set();
    const datasets = [];
    for (const [index, raw] of list.entries()) {
        const where = `dataset ${index + 1}`;
        if (raw === null || typeof raw !== "object" || Array.isArray(raw)) {
            return fail(`${where} must be an object.`);
        }
        const { id, name, file, description } = raw;
        if (typeof id !== "string" || !SHARE_ID_PATTERN.test(id)) {
            return fail(
                `${where} needs an "id" of 1 to 64 letters, digits, "_" or "-" (a link carries it).`
            );
        }
        if (seen.has(id)) {
            return fail(`the id "${id}" is used by more than one dataset.`);
        }
        seen.add(id);
        if (typeof name !== "string" || !name.trim()) {
            return fail(`dataset "${id}" needs a "name".`);
        }
        if (typeof file !== "string" || !file.trim()) {
            return fail(`dataset "${id}" needs a "file".`);
        }
        const fileProblem = filePathProblem(file);
        if (fileProblem) {
            return fail(`the "file" of dataset "${id}" ${fileProblem}`);
        }
        if (description !== undefined && typeof description !== "string") {
            return fail(`the "description" of dataset "${id}" must be text.`);
        }
        if (raw.default !== undefined && typeof raw.default !== "boolean") {
            return fail(`the "default" of dataset "${id}" must be true or false.`);
        }
        datasets.push({
            id,
            name: name.trim(),
            file,
            description: description ?? "",
            default: raw.default === true,
        });
    }

    const defaults = datasets.filter((d) => d.default);
    if (defaults.length === 0) {
        return fail('no dataset has "default": true; exactly one must.');
    }
    if (defaults.length > 1) {
        const ids = defaults.map((d) => `"${d.id}"`).join(", ");
        return fail(`more than one dataset has "default": true (${ids}); exactly one must.`);
    }
    return { ok: true, datasets };
}

// filePathProblem returns why a path is not a relative path on this site, or "" if it is.
// Datasets are same-origin files (no CORS, subpath-safe), so a leading slash, a scheme, a
// backslash or a ".." segment would point somewhere the site does not control.
function filePathProblem(file) {
    if (/[\u0000-\u001f\u007f\\]/.test(file)) {
        return "must not contain control characters or backslashes.";
    }
    // the URL parser drops leading and trailing spaces, so " /x.db" would be checked as a
    // relative path here but requested as "/x.db"
    if (file !== file.trim()) {
        return "must not start or end with a space.";
    }
    if (file.startsWith("/")) {
        return 'must be a relative path with no leading "/" (the site can be served from a subpath).';
    }
    if (/^[a-z][a-z0-9+.-]*:/i.test(file)) {
        return 'must be a relative path on this site, not an address with a scheme such as "https:".';
    }
    let decoded = file;
    try {
        decoded = decodeURIComponent(file);
    } catch {
        return "is not a valid path.";
    }
    if (decoded.split("/").includes("..") || file.split("/").includes("..")) {
        return 'must not contain "..".';
    }
    if (decoded.startsWith("/") || /^[a-z][a-z0-9+.-]*:/i.test(decoded)) {
        return "must be a relative path on this site.";
    }
    try {
        const here = new URL(globalThis.location.href);
        if (new URL(file, here).origin !== here.origin) {
            return "must be a path on this site.";
        }
    } catch {
        return "is not a valid path.";
    }
    return "";
}

// loadManifest fetches and validates the manifest. Never throws.
export async function loadManifest() {
    let response;
    try {
        // no-cache: revalidate, so a committed change shows up without waiting out a cache
        response = await fetch(MANIFEST_URL, { cache: "no-cache" });
    } catch {
        return { ok: false, message: MANIFEST_UNREACHABLE_MESSAGE };
    }
    if (!response.ok) {
        return { ok: false, message: MANIFEST_UNREACHABLE_MESSAGE };
    }
    let data;
    try {
        data = await response.json();
    } catch {
        return { ok: false, message: manifestInvalidMessage("it is not valid JSON.") };
    }
    return validateManifest(data);
}

// getManifest is loadManifest once per page while it succeeds. A failure is not kept, so
// the next start (a back/forward step, a pasted link) tries again.
let manifestLoading = null;
export function getManifest() {
    if (!manifestLoading) {
        manifestLoading = loadManifest().then((result) => {
            if (!result.ok) {
                manifestLoading = null;
            }
            return result;
        });
    }
    return manifestLoading;
}

export function findDataset(manifest, id) {
    return manifest.ok ? (manifest.datasets.find((d) => d.id === id) ?? null) : null;
}

export function defaultDataset(manifest) {
    return manifest.ok ? (manifest.datasets.find((d) => d.default) ?? null) : null;
}

// ---- dataset files --------------------------------------------------------------------

// datasetFileName is the database name for a dataset: the last part of its file path
// (percent-decoded when that is possible), as upstream names a database after its file.
export function datasetFileName(entry) {
    const last = entry.file.split(/[?#]/)[0].split("/").pop();
    try {
        return decodeURIComponent(last);
    } catch {
        return last;
    }
}

// fetchDataset fetches a dataset's .db file (a relative URL). Never throws.
// Returns {ok: true, buffer: ArrayBuffer} or {ok: false}; the caller words the message,
// because it depends on whether a database is already open.
export async function fetchDataset(entry) {
    const failure = { ok: false };
    try {
        const response = await fetch(entry.file);
        if (!response.ok) {
            return failure;
        }
        const buffer = await response.arrayBuffer();
        if (!hasSqliteHeader(buffer)) {
            return failure;
        }
        return { ok: true, buffer };
    } catch {
        return failure;
    }
}

function hasSqliteHeader(buffer) {
    if (buffer.byteLength < SQLITE_HEADER.length) {
        return false;
    }
    const head = new Uint8Array(buffer, 0, SQLITE_HEADER.length);
    return SQLITE_HEADER.split("").every((ch, i) => head[i] === ch.charCodeAt(0));
}

// ---- pristine bytes -------------------------------------------------------------------

let pristine = null; // {id, buffer}: the dataset as fetched

// keepPristine records the bytes of the dataset that has just been opened. The buffer is
// kept as it is; nothing else may hold a reference that it hands to the engine.
export function keepPristine(id, buffer) {
    pristine = { id, buffer };
}

// clearPristine forgets them (an uploaded file or a URL is open, not a built-in dataset).
export function clearPristine() {
    pristine = null;
}

// getPristineBytes returns a fresh Uint8Array copy of the open built-in dataset's bytes
// exactly as fetched, or null when no built-in dataset is open. Changing the copy, or
// passing it to the engine, cannot affect the next call.
export function getPristineBytes() {
    return pristine ? new Uint8Array(pristine.buffer.slice(0)) : null;
}

// getPristineId returns the id of the dataset whose bytes getPristineBytes returns.
export function getPristineId() {
    return pristine ? pristine.id : null;
}
