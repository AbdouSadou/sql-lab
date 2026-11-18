// The text of the files an export saves, and what is saved (assessment plan, sections 5 and 9; its
// Phase 3, flag "export"): the rules of a CSV file, the names of the files, and the plan of the
// output. Pure: no page and no engine, so a test can load it in Node. The engine side, which hands
// over values and says nothing of text, is js/lab/export-read.js.
//
//   CSV_BOM                       the three bytes (EF BB BF) that start every file, so that Excel
//                                 reads UTF-8
//   fieldText(text) -> string     the text as a CSV field: in double quotes, each " doubled, when
//                                 it holds a comma, a ", a carriage return or a line feed, or
//                                 starts or ends with the space character (a tab does not count);
//                                 otherwise as it is
//   realText(number) -> string    a REAL, by the plan's rule: the fewest digits that read back as
//                                 the same number (what JavaScript's String gives), never an
//                                 exponent (1e21 is 1000000000000000000000.0, 1e-7 is 0.0000001),
//                                 always a decimal point (1.0). Two things the plan left open and
//                                 Phase 3 decided: negative zero is -0.0, and an infinity is
//                                 Infinity or -Infinity, the word the results pane shows (no
//                                 digits can write it). A table of such values comes back from an
//                                 import with the infinite column as TEXT and -0.0 as 0.0.
//   VALUE_KINDS                   the engine's own numbers for the storage classes: INTEGER 1,
//                                 FLOAT 2, TEXT 3, BLOB 4, NULL 5. They are the reader's
//                                 (js/lab/export-read.js), handed on from here.
//   valueText(kind, value)        the field for one value, by its storage class: an INTEGER by its
//                                 digits (a Number or a BigInt), a FLOAT by realText, a TEXT by
//                                 fieldText, a BLOB as x'<lower-case hex>' (the text cellText of
//                                 js/lab/cell-text.js gives), a NULL empty. A text that is empty
//                                 and a NULL read the same. Another kind throws.
//   rowText(kinds, values) -> {text, blobs}
//                                 one record: the fields joined by commas and ended by CRLF, and
//                                 how many of its values were BLOBs (the dialog tells the student
//                                 what a BLOB came out as). In a table of one column, a NULL or an
//                                 empty text is therefore a line with nothing on it, which most
//                                 programs skip when they read the file, the import here too (the
//                                 plan's section 5, "What comes back").
//   headerText(names) -> string   the record of the column names, each through fieldText
//
//   csvFileNames(tableNames) -> [string]
//                                 the file name of each table, in the dialog's order. The table's
//                                 name goes through sanitiseName (js/lab/import-rules.js: letters,
//                                 digits and underscores, anything else one underscore, c_ in
//                                 front of a leading digit), an empty result is "table", and
//                                 .csv follows. Several names are made unique among themselves,
//                                 without regard to the case of A to Z, with _2, _3 as the import
//                                 does (uniqueName), so a table is named the same alone as with
//                                 others unless one of them takes its name. A name longer than
//                                 EXPORT_NAME_MAX_CHARS is cut to that before it is made unique: no
//                                 computer keeps a file whose name passes 255 bytes. Windows' own
//                                 reserved words (con, nul) are left alone.
//   tablesZipName(databaseName)   the name of the zip: the database's name as safeBaseName
//                                 (js/lab/export.js) makes it, without a .db, .sqlite or .sqlite3
//                                 at its end, then -tables.zip. The database's name, not the label
//                                 the page shows for it.
//   planOutput({format, databaseName, tables}) -> plan | null
//                                 what is saved for these table names (in the dialog's order):
//                                   {format: "csv", kind: "file" | "zip", fileName, type, library,
//                                    entries: [{table, name, renamed}]}
//                                 One table: a file (fileName is the CSV's), no library. Several:
//                                 a zip, with the library that writes it ({file, global}, asked
//                                 for only then) and entries whose names are unique. renamed says
//                                 that an entry's name is not simply the table's name and .csv (the
//                                 dialog then says what the file is called). No table: null. A
//                                 format that is not "csv" throws. (format and entries are there
//                                 for a later phase to add a workbook, whose entries are sheets,
//                                 to the same dialog.)
//   zipProblem(entryCount, bytes, {maxEntries, maxBytes}?) -> boolean
//                                 true when a zip written without Zip64 cannot hold that many
//                                 entries, or that many bytes (the zip's own size, which is
//                                 also what no entry or offset in it may pass). The limits are
//                                 EXPORT_ZIP_MAX_ENTRIES and EXPORT_ZIP_MAX_BYTES unless others
//                                 are given (a test gives small ones).

import {
    EXPORT_CSV_SUFFIX,
    EXPORT_CSV_TYPE,
    EXPORT_NAME_MAX_CHARS,
    EXPORT_ZIP_LIBRARY,
    EXPORT_ZIP_MAX_BYTES,
    EXPORT_ZIP_MAX_ENTRIES,
    EXPORT_ZIP_SUFFIX,
    EXPORT_ZIP_TYPE,
} from "./config-workflow.js";
import { VALUE_KINDS } from "./export-read.js";
import { safeBaseName } from "./export.js";
import { FALLBACK_TABLE_NAME, sameNameKey, sanitiseName } from "./import-rules.js";

export { VALUE_KINDS };

export const CSV_BOM = new Uint8Array([0xef, 0xbb, 0xbf]);

// ---- fields ---------------------------------------------------------------------------------

const NEEDS_QUOTES = /[",\r\n]|^ | $/;

export function fieldText(text) {
    const value = String(text);
    return NEEDS_QUOTES.test(value) ? `"${value.replaceAll('"', '""')}"` : value;
}

// an exponent form of JavaScript's text, as sign, the digits, and the power of ten of the first one
const EXPONENT_FORM = /^(-?)(\d)(?:\.(\d+))?e([+-])(\d+)$/;

export function realText(number) {
    if (Number.isNaN(number)) {
        // (SQLite stores no NaN: it keeps NULL there. Said in words, as the infinities are.)
        return "NaN";
    }
    if (number === Infinity || number === -Infinity) {
        return number > 0 ? "Infinity" : "-Infinity";
    }
    if (Object.is(number, -0)) {
        return "-0.0";
    }
    const text = String(number);
    const parts = EXPONENT_FORM.exec(text);
    if (!parts) {
        return text.includes(".") ? text : `${text}.0`;
    }
    const [, sign, first, rest = "", direction, power] = parts;
    const digits = first + rest;
    const places = Number(power);
    if (direction === "-") {
        // 1.5e-7: the first digit is the (places)th after the point
        return `${sign}0.${"0".repeat(places - 1)}${digits}`;
    }
    // 1.5e+21: the digits, then zeros up to the point, which comes after the (places + 1)th digit.
    // (The digits never reach past it: JavaScript writes an exponent only from 1e21 on, and the
    // fewest digits that read back as the same number are seventeen at most.)
    return `${sign}${digits.padEnd(places + 1, "0")}.0`;
}

const HEX = Array.from({ length: 256 }, (unused, byte) => byte.toString(16).padStart(2, "0"));

function blobText(bytes) {
    let hex = "";
    for (let i = 0; i < bytes.length; i++) {
        hex += HEX[bytes[i]];
    }
    return `x'${hex}'`;
}

export function valueText(kind, value) {
    switch (kind) {
        case VALUE_KINDS.INTEGER:
            return String(value);
        case VALUE_KINDS.FLOAT:
            return realText(value);
        case VALUE_KINDS.TEXT:
            return fieldText(value);
        case VALUE_KINDS.BLOB:
            return blobText(value);
        case VALUE_KINDS.NULL:
            return "";
        default:
            throw new TypeError(`unknown kind of value: ${kind}`);
    }
}

export function rowText(kinds, values) {
    let blobs = 0;
    const fields = new Array(kinds.length);
    for (let i = 0; i < kinds.length; i++) {
        if (kinds[i] === VALUE_KINDS.BLOB) {
            blobs++;
        }
        fields[i] = valueText(kinds[i], values[i]);
    }
    return { text: `${fields.join(",")}\r\n`, blobs };
}

export const headerText = (names) => `${names.map(fieldText).join(",")}\r\n`;

// ---- names ----------------------------------------------------------------------------------

// the base of a table's file name, before .csv (letters, digits and underscores only: a
// character is a byte)
const baseNameOf = (table) => (sanitiseName(table) || FALLBACK_TABLE_NAME).slice(0, EXPORT_NAME_MAX_CHARS);

// The names are the ones uniqueName gives (js/lab/import-rules.js: the name itself, else _2, _3
// and so on, the first that is free). It is not called for each table, because it counts from 2
// every time: tables whose names come out alike (a name made only of other characters than A to Z,
// a to z, 0 to 9 and the underscore is "_") would
// each walk past all the names before them. Here the count for a name goes on where it stopped.
export function csvFileNames(tableNames) {
    const used = new Set();
    // for a name that is taken (by its key): the next number to try
    const next = new Map();
    return tableNames.map((table) => {
        const base = baseNameOf(table);
        const key = sameNameKey(base);
        let name = base;
        if (used.has(key)) {
            let n = next.get(key) ?? 2;
            while (used.has(sameNameKey(`${base}_${n}`))) {
                n++;
            }
            name = `${base}_${n}`;
            next.set(key, n + 1);
        }
        used.add(sameNameKey(name));
        return `${name}${EXPORT_CSV_SUFFIX}`;
    });
}

export function tablesZipName(databaseName) {
    return `${safeBaseName(databaseName).replace(/\.(db|sqlite|sqlite3)$/i, "")}${EXPORT_ZIP_SUFFIX}`;
}

// ---- what is saved --------------------------------------------------------------------------

export function planOutput({ format, databaseName, tables }) {
    if (format !== "csv") {
        throw new TypeError(`unknown format of export: ${format}`);
    }
    if (tables.length === 0) {
        return null;
    }
    const names = csvFileNames(tables);
    const entries = tables.map((table, i) => ({ table, name: names[i], renamed: names[i] !== `${table}${EXPORT_CSV_SUFFIX}` }));
    if (entries.length === 1) {
        return { format, kind: "file", fileName: names[0], type: EXPORT_CSV_TYPE, library: null, entries };
    }
    return {
        format,
        kind: "zip",
        fileName: tablesZipName(databaseName),
        type: EXPORT_ZIP_TYPE,
        library: { ...EXPORT_ZIP_LIBRARY },
        entries,
    };
}

export const zipProblem = (entryCount, bytes, { maxEntries = EXPORT_ZIP_MAX_ENTRIES, maxBytes = EXPORT_ZIP_MAX_BYTES } = {}) =>
    entryCount > maxEntries || bytes > maxBytes;
