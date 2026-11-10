// F11 evidence export: the file format, its checksum and its verification. Pure: no DOM, no
// storage, no network (the dialog is js/lab/evidence-dialog.js, the verify page is
// js/lab/verify-page.js, the run log the entries come from is js/lab/run-log.js).
//
// File layout (spec 5a), LF line ends only, one LF after the last line:
//
//   <APP_NAME> evidence export v1
//   dataset: <log key>
//   exported: 2026-11-09T14:32:08Z
//   <blank>
//   [1] 2026-11-09T13:58:12Z · 12 rows            ("1 row", "0 rows", or "error: <message>")
//   <the SQL, as run, newlines normalised to LF; a line of it that looks like an entry header
//    ("[4] 2026-11-09T13:58:12Z · 1 row") gets a backslash in front, see escapeSql>
//   link: <F3 link for this query and dataset>    (only when the caller supplies one)
//   <blank>
//   [2] ...
//   <blank>
//   student: <student number>
//   sha256: <64 lower-case hex digits>
//
// The checksum is SHA-256 over the UTF-8 bytes of everything from the first line up to and
// including the LF that ends the student line.
//
// Exports:
//   utcTimestamp(date?)                  "YYYY-MM-DDTHH:MM:SSZ"
//   sanitizeLine(text)                   control and line-separator characters become "_"
//   escapeSql(sql) -> string             newlines to LF, and a backslash in front of every line
//                                        that has the shape of an entry header
//   formatEvidence({entries, dataset, exported, student}) -> string
//       The text a checksum is taken over (through the student line). entries are
//       {t, sql, rows} or {t, sql, error}, plus an optional {link}. Throws RangeError on no
//       entries or a student number that cannot sit on one line.
//   sha256Hex(text) -> Promise<string>   lower-case hex; rejects when crypto.subtle is missing
//   hasCrypto() -> boolean
//   buildEvidence(input) -> Promise<string>   the whole file
//   verifyEvidence(text) -> Promise<result>   never rejects, never throws:
//       {status: "valid", student, queries, exported, dataset}
//       {status: "edited", reason}
//       {status: "unavailable", reason}   no crypto.subtle: neither of the two can be said
//
// verify rules: CRLF becomes LF and nothing else is touched (a lone CR stays, so changing one
// LF to CR is caught); at most one LF after the sha256 line (more is EDITED, with the reason
// "Extra blank lines" only when the file is otherwise exactly as exported); the last line is exactly
// "sha256: " and 64 lower-case hex digits; the line before it is "student: " and a non-empty
// value (STUDENT_ID_PATTERN is not applied, so a later change of it does not invalidate older
// files); the first line is "<anything> evidence export v1" (a renamed app does not either);
// the recomputed checksum must match; then dataset: and exported: must be present and
// well-formed. The query count is the number of entry headers that follow a blank line and
// are numbered 1, 2, 3 ... in sequence. The exporter escapes SQL lines of the header shape
// (escapeSql), so in a file this app wrote every such line is a real entry and the count is
// exact. A file whose SQL was not escaped (not written by this exporter) can be miscounted
// by header-like lines in the last entry's SQL: the count is only as trustworthy as the
// file, which the checksum shows to be unchanged, not true.

import {
    APP_NAME,
    EVIDENCE_MAX_BYTES,
    EVIDENCE_MIDDLE_DOT,
    EVIDENCE_SQL_ESCAPE,
    EVIDENCE_NO_CRYPTO_MESSAGE,
    EVIDENCE_TITLE_SUFFIX,
    VERIFY_EXTRA_BLANK_LINES_REASON,
    VERIFY_NO_CRYPTO_MESSAGE,
    VERIFY_TOO_LARGE_REASON,
} from "./config.js";

const TIMESTAMP = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/;
const SHA_LINE = /^sha256: ([0-9a-f]{64})$/;
const STUDENT_LINE = /^student: (.+)$/;
const DATASET_LINE = /^dataset: (.+)$/;
const EXPORTED_LINE = /^exported: (\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z)$/;
const FIRST_LINE = new RegExp(`^.* ${EVIDENCE_TITLE_SUFFIX}$`);
const HEADER_LINE = new RegExp(
    `^\\[(\\d+)\\] \\d{4}-\\d{2}-\\d{2}T\\d{2}:\\d{2}:\\d{2}Z ${EVIDENCE_MIDDLE_DOT} (?:\\d+ rows?|error: .*)$`
);
// characters that would end or split a line in some reader
const LINE_BREAKERS = /[\u0000-\u001f\u007f\u0085\u2028\u2029]/;

export function utcTimestamp(date = new Date()) {
    return `${date.toISOString().slice(0, 19)}Z`;
}

export function sanitizeLine(text) {
    return String(text).replace(new RegExp(LINE_BREAKERS.source, "g"), "_");
}

const normalizeNewlines = (text) => String(text).replace(/\r\n?/g, "\n");

export function escapeSql(sql) {
    return normalizeNewlines(sql)
        .split("\n")
        .map((line) => (HEADER_LINE.test(line) ? `${EVIDENCE_SQL_ESCAPE}${line}` : line))
        .join("\n");
}

function outcomeText(entry) {
    if (typeof entry.error === "string") {
        return `error: ${entry.error.replace(/\s+/g, " ").trim()}`;
    }
    return `${entry.rows} ${entry.rows === 1 ? "row" : "rows"}`;
}

export function formatEvidence({ entries, dataset, exported, student }) {
    if (!Array.isArray(entries) || entries.length === 0) {
        throw new RangeError("no entries to export");
    }
    if (typeof student !== "string" || !student || LINE_BREAKERS.test(student)) {
        throw new RangeError("the student number cannot be written on one line");
    }
    const lines = [
        `${sanitizeLine(APP_NAME)} ${EVIDENCE_TITLE_SUFFIX}`,
        `dataset: ${sanitizeLine(dataset)}`,
        `exported: ${exported}`,
        "",
    ];
    entries.forEach((entry, index) => {
        lines.push(`[${index + 1}] ${entry.t} ${EVIDENCE_MIDDLE_DOT} ${outcomeText(entry)}`);
        lines.push(escapeSql(entry.sql));
        if (entry.link) {
            lines.push(`link: ${entry.link}`);
        }
        lines.push("");
    });
    lines.push(`student: ${student}`);
    return lines.join("\n") + "\n";
}

export function hasCrypto() {
    return typeof globalThis.crypto?.subtle?.digest === "function";
}

export async function sha256Hex(text) {
    if (!hasCrypto()) {
        throw new Error(EVIDENCE_NO_CRYPTO_MESSAGE);
    }
    const bytes = new TextEncoder().encode(text);
    const digest = new Uint8Array(await globalThis.crypto.subtle.digest("SHA-256", bytes));
    return Array.from(digest, (b) => b.toString(16).padStart(2, "0")).join("");
}

export async function buildEvidence(input) {
    const body = formatEvidence(input);
    return `${body}sha256: ${await sha256Hex(body)}\n`;
}

// ---- verification ----------------------------------------------------------------------

const edited = (reason) => ({ status: "edited", reason });

export async function verifyEvidence(text) {
    try {
        return await verify(text);
    } catch {
        return edited("The file could not be checked.");
    }
}

async function verify(text) {
    if (!hasCrypto()) {
        return { status: "unavailable", reason: VERIFY_NO_CRYPTO_MESSAGE };
    }
    if (typeof text !== "string") {
        return edited("The input is not text.");
    }
    if (text.length > EVIDENCE_MAX_BYTES) {
        return edited(VERIFY_TOO_LARGE_REASON);
    }
    if (text.trim() === "") {
        return edited("The file is empty.");
    }

    let body = text.replace(/\r\n/g, "\n");
    // Any change is EDITED. But when the checksum line is followed by nothing except line breaks,
    // that is the one thing to tell the marker, if it is the only thing: "extra text" would
    // suggest the contents were tampered with. So the file is checked as it would be with one
    // line break at the end, and only a file that would then be VALID is blamed on blank lines;
    // one that fails otherwise (the body was changed too) gets the reason it fails with.
    let extraBlankLines = false;
    if (body.endsWith("\n\n")) {
        const kept = body.replace(/\n+$/, "");
        const lastLine = kept.slice(kept.lastIndexOf("\n") + 1);
        if (!SHA_LINE.test(lastLine)) {
            return edited("There is extra text after the checksum line.");
        }
        body = `${kept}\n`;
        extraBlankLines = true;
    }
    if (body.endsWith("\n")) {
        body = body.slice(0, -1);
    }
    const lines = body.split("\n");
    // first line, dataset, exported, a blank line, one entry (header and SQL), a blank line,
    // student, sha256
    if (lines.length < 9) {
        return edited("The file is too short to be an evidence file.");
    }

    const shaMatch = SHA_LINE.exec(lines[lines.length - 1]);
    if (!shaMatch) {
        return edited("The last line is not a checksum line (\"sha256:\" and 64 lower-case hex digits).");
    }
    const studentMatch = STUDENT_LINE.exec(lines[lines.length - 2]);
    if (!studentMatch || studentMatch[1].trim() === "") {
        return edited("The line before the checksum is not a student line with a student number.");
    }

    const signed = `${lines.slice(0, -1).join("\n")}\n`;
    if ((await sha256Hex(signed)) !== shaMatch[1]) {
        return edited("The checksum does not match the contents, so the file was changed after it was exported.");
    }

    if (!FIRST_LINE.test(lines[0])) {
        return edited(`The first line is not an evidence export heading ("... ${EVIDENCE_TITLE_SUFFIX}").`);
    }
    const dataset = DATASET_LINE.exec(lines[1]);
    if (!dataset) {
        return edited("The dataset line is missing or damaged.");
    }
    const exported = EXPORTED_LINE.exec(lines[2]);
    if (!exported || utcTimestamp(new Date(exported[1])) !== exported[1]) {
        return edited("The exported line is missing or damaged.");
    }
    if (lines[3] !== "") {
        return edited("The heading is not followed by a blank line.");
    }

    let queries = 0;
    for (let i = 4; i < lines.length - 2; i++) {
        const header = lines[i - 1] === "" ? HEADER_LINE.exec(lines[i]) : null;
        if (header && Number(header[1]) === queries + 1) {
            queries++;
        }
    }
    if (queries === 0) {
        return edited("The file lists no queries.");
    }
    if (extraBlankLines) {
        return edited(VERIFY_EXTRA_BLANK_LINES_REASON);
    }
    return {
        status: "valid",
        student: studentMatch[1],
        queries,
        exported: exported[1],
        dataset: dataset[1],
    };
}
