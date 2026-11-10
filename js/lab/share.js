// F3 serverless sharing: turn the app state into a URL fragment and back.
//
// Fragment format: #s=<payload>, where
//   payload = LZString.compressToEncodedURIComponent(JSON.stringify(state))
//   state   = {v: 1, d: datasetId, x: exerciseSetId, e: exerciseId, q: sql}
// with absent fields omitted. The state lives in the fragment, never in the query
// string, so shared SQL does not reach server logs.
//
// A link is untrusted input (anyone can send one), so decodeShare never throws and
// returns a failure value for anything it does not fully understand.
//
// LZString is the vendored classic script vendor/lz-string.min.js, loaded before the
// modules (index.html).

import {
    SHARE_ID_PATTERN,
    SHARE_MAX_JSON_CHARS,
    SHARE_MAX_PAYLOAD_CHARS,
    SHARE_MAX_SQL_CHARS,
    SHARE_PARAM,
    SHARE_VERSION,
} from "./config.js";

const PREFIX = `${SHARE_PARAM}=`;
// What counts as the start of a share link, leniently: any case, a stray "?", a space
// (browsers store it as %20) or an encoded "=" before the payload. A hash that nearly
// looks like a share link must be reported as damaged, never fetched as a database path,
// because that would put the shared SQL in a request URL (server logs).
const SHARE_START = new RegExp(`^#?(?:\\s|%20)*\\??${SHARE_PARAM}(?:=|%3d)`, "i");
// The alphabet of compressToEncodedURIComponent (a space is a "+" that went through a
// form encoder; lz-string maps it back).
const PAYLOAD_ALPHABET = /^[A-Za-z0-9+\-$ ]*$/;

// The state the page outside the editor contributes. js/index.js (the open dataset) and
// js/lab/exercise-panel.js (the open exercise) keep it current through setShareContext.
let context = { dataset: undefined, set: undefined, exercise: undefined };

// setShareContext sets the dataset, exercise set and exercise ids that copy-link
// should carry. Pass only what changed; pass null or undefined to clear a field.
export function setShareContext(next) {
    const picked = pick(next);
    for (const [key, value] of Object.entries(picked)) {
        if (value !== undefined && value !== "" && !isId(value)) {
            throw new RangeError(`invalid ${key} id`);
        }
    }
    context = { ...context, ...picked };
}

export function getShareContext() {
    return { ...context };
}

function pick(obj) {
    const out = {};
    for (const key of ["dataset", "set", "exercise"]) {
        if (obj && key in obj) out[key] = obj[key] ?? undefined;
    }
    return out;
}

function lz() {
    const lib = globalThis.LZString;
    if (!lib) throw new Error("lz-string is not loaded");
    return lib;
}

// isShareFragment tells whether a location hash ("#s=...") is a share link, damaged or
// not (see SHARE_START for the lenient reading). Anything else is a database path and
// is not this module's business.
export function isShareFragment(hash) {
    return typeof hash === "string" && SHARE_START.test(hash);
}

const isId = (value) => typeof value === "string" && SHARE_ID_PATTERN.test(value);

// encodeShare turns {dataset, set, exercise, sql} into a payload string. Absent
// (undefined, null, empty) fields are left out. It throws on an invalid id, because
// that is a programming error on our side, not hostile input.
export function encodeShare(state) {
    const out = { v: SHARE_VERSION };
    const ids = [
        ["d", "dataset"],
        ["x", "set"],
        ["e", "exercise"],
    ];
    for (const [short, long] of ids) {
        const value = state?.[long];
        if (value === undefined || value === null || value === "") continue;
        if (!isId(value)) throw new Error(`invalid ${long} id`);
        out[short] = value;
    }
    const sql = state?.sql;
    // blank SQL (an empty editor reads as "\n") is the same as none
    if (typeof sql === "string" && sql.trim() !== "") out.q = sql;
    return lz().compressToEncodedURIComponent(JSON.stringify(out));
}

// decodeShare parses a location hash ("#s=...", the "#" is optional).
// Returns {ok: true, state: {dataset?, set?, exercise?, sql?}} or {ok: false, reason}.
// Reasons: "not-a-share", "payload", "decompress", "json", "version", "shape", "id", "sql".
export function decodeShare(hash) {
    try {
        if (!isShareFragment(hash)) return fail("not-a-share");
        let payload = hash.replace(SHARE_START, "");
        if (payload.includes("%")) {
            payload = decodeURIComponent(payload);
        }
        if (!payload || payload.length > SHARE_MAX_PAYLOAD_CHARS || !PAYLOAD_ALPHABET.test(payload)) {
            return fail("payload");
        }
        const json = lz().decompressFromEncodedURIComponent(payload);
        if (typeof json !== "string" || !json) return fail("decompress");
        // checked before parsing: a decompression bomb is rejected without being touched
        if (json.length > SHARE_MAX_JSON_CHARS) return fail("payload");
        let data;
        try {
            data = JSON.parse(json);
        } catch {
            return fail("json");
        }
        if (data === null || typeof data !== "object" || Array.isArray(data)) return fail("shape");
        if (data.v !== SHARE_VERSION) return fail("version");

        const state = {};
        for (const [short, long] of [
            ["d", "dataset"],
            ["x", "set"],
            ["e", "exercise"],
        ]) {
            if (!Object.hasOwn(data, short)) continue;
            if (!isId(data[short])) return fail(typeof data[short] === "string" ? "id" : "shape");
            state[long] = data[short];
        }
        if (Object.hasOwn(data, "q")) {
            if (typeof data.q !== "string") return fail("shape");
            if (data.q.length > SHARE_MAX_SQL_CHARS) return fail("sql");
            state.sql = data.q;
        }
        return { ok: true, state };
    } catch {
        // decodeURIComponent on a malformed escape, or anything unforeseen
        return fail("payload");
    }
}

function fail(reason) {
    return { ok: false, reason };
}

// shareFragment returns "#s=<payload>" for a state, or null when the payload would be
// too long for decodeShare to accept (the link would not open).
export function shareFragment(state) {
    const payload = encodeShare(state);
    return payload.length > SHARE_MAX_PAYLOAD_CHARS ? null : `#${PREFIX}${payload}`;
}

// shareUrl builds the link for the editor SQL plus the current context, from the page
// URL with its query string and fragment replaced, so it is valid under any subpath.
// Returns null when the state is too large to share.
export function shareUrl(sql, pageUrl = globalThis.location.href) {
    const fragment = shareFragment({ ...context, sql });
    if (fragment === null) return null;
    const url = new URL(pageUrl);
    url.search = "";
    url.hash = fragment;
    return url.href;
}
