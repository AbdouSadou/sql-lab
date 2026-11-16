// The faithful import rules (assessment plan, section 3): what type a column gets, and what a
// table and its columns are called. Pure: no DOM, no storage, no engine, no library. The reader
// of text files (js/lab/import-csv.js) and, from the plan's Phase 5, the reader of workbooks
// both go through here, so that a value is judged the same way wherever it came from.
//
// The importer reads; it does not clean. A value is judged as it is written:
//
//   isWhole(text)    a plain whole number (rule 2): "0", or up to 15 digits that do not start
//                    with 0, with or without a minus sign in front. Digits are 0 to 9 only. Not
//                    "-0" (stored as a number it would lose its sign), not "+5", not "00123",
//                    not a number with a space beside it.
//   isDecimal(text)  a decimal (rule 3): "0" or digits that do not start with 0, then a "." and
//                    one or more digits, with or without a minus sign: "0.25", "-0.5", "10.00".
//                    Not ".5", "5.", "1e3", "1,5", "£5.00" or "5%". And not a decimal that no
//                    number can hold: one of more than some 300 digits before the point would
//                    be stored as infinity, and one with as many zeros after it as zero, which
//                    is not "stored as that number" (rule 1). It stays text, as "-0" does.
//
// A column's type is decided from all of its values, never from a sample (rule 8). A tally
// takes them one at a time, so a file is never held whole:
//
//   newTally() -> tally
//   tallyValue(tally, value)   value is the field's text, or null for an empty field (rule 5: an
//                              empty field is NULL; a field of spaces is not empty)
//   columnType(tally) -> "INTEGER" | "REAL" | "TEXT"
//       INTEGER when every value is a plain whole number; REAL when every value is a plain
//       number and at least one is a decimal; TEXT for everything else, and for a column with no
//       values at all (rule 4).
//   blockingValue(tally) -> text | null
//       for the import report: in a TEXT column where at least half of the values are plain
//       numbers, the first value that is not. null for any other column.
//
// Names (section 3, "Names"). They are made so that students need no quoting: each run of
// characters other than A-Z, a-z, 0-9 and _ becomes one "_", and a name that then starts with a
// digit gains "c_" in front. Nothing is trimmed and letter case is kept: "Café" is "Caf_",
// "% Change" is "_Change". A reserved word is kept as it is ("Order"), and must then be written
// in double quotes (the plan's Q2). Two names are the same when they differ only in the case of
// the letters A to Z, which is how SQLite judges them; the second gains "_2", the third "_3".
//
//   sanitiseName(text) -> text
//   isBlankName(text)  -> boolean      empty, or white space only
//   sameNameKey(name)  -> text         the name with A-Z in lower case: equal keys, same name
//   uniqueName(base, used) -> text     the first of base, base_2, base_3 ... whose key is not in
//                                      the Set `used`; its key is added to the set
//   columnNames(header, width) -> [{name, original}]
//       header is the list of header texts, or null for a file with no header row. A blank
//       header is "column_" and its position, counted from 1. A column beyond the header (a
//       row was longer) is "extra_1", "extra_2" ... A file with no header row has "column_1" to
//       "column_<width>" and no extra_ columns (rule 7). original is the header's own text, or
//       null where there was none.
//   tableNameFor(fileName) -> text     the file's name without its extension, made a name;
//                                      FALLBACK_TABLE_NAME when nothing is left
//   firstRowLooksLikeNames(row) -> boolean
//       the guess the preview starts from (the plan's Q9): the first row holds column names
//       unless one of its fields is a plain number. The student can overrule it.

const WHOLE = /^-?(?:0|[1-9][0-9]{0,14})$/;
const DECIMAL = /^-?(?:0|[1-9][0-9]*)\.[0-9]+$/;

// A decimal of up to this many characters is a number a REAL holds, whatever its digits. A
// longer one is looked at: it can be too large (stored, it would be infinity) or too small (it
// would be zero). The limits are well inside what a REAL holds, on purpose: the engine reads
// the text by itself, and its reading can differ from this one in the last place.
const SURE_DECIMAL_CHARS = 300;
const LARGEST_SURE = 1e300;
const SMALLEST_SURE = 1e-300;
const A_DIGIT_NOT_ZERO = /[1-9]/;
function fitsANumber(text) {
    const size = Math.abs(Number(text));
    return size <= LARGEST_SURE && (size >= SMALLEST_SURE || !A_DIGIT_NOT_ZERO.test(text));
}

export const isWhole = (text) => typeof text === "string" && text !== "-0" && WHOLE.test(text);
export const isDecimal = (text) => typeof text === "string" && DECIMAL.test(text) && (text.length <= SURE_DECIMAL_CHARS || fitsANumber(text));
export const isPlainNumber = (text) => isWhole(text) || isDecimal(text);

// ---- a column's type ----------------------------------------------------------------------

export function newTally() {
    // values: how many values the column was given, empty ones included (a short row gives its
    // last columns none: the reader works out those blanks from the number of rows)
    return { values: 0, empty: 0, whole: 0, decimal: 0, text: 0, firstText: null };
}

export function tallyValue(tally, value) {
    tally.values++;
    if (value === null) {
        tally.empty++;
    } else if (isWhole(value)) {
        tally.whole++;
    } else if (isDecimal(value)) {
        tally.decimal++;
    } else {
        if (tally.text === 0) {
            tally.firstText = value;
        }
        tally.text++;
    }
}

export function columnType(tally) {
    if (tally.text > 0 || tally.whole + tally.decimal === 0) {
        return "TEXT";
    }
    return tally.decimal > 0 ? "REAL" : "INTEGER";
}

export function blockingValue(tally) {
    const numbers = tally.whole + tally.decimal;
    return tally.text > 0 && numbers * 2 >= numbers + tally.text ? tally.firstText : null;
}

// ---- names ----------------------------------------------------------------------------------

export const FALLBACK_TABLE_NAME = "table";

export function sanitiseName(text) {
    const name = String(text).replace(/[^A-Za-z0-9_]+/g, "_");
    return /^[0-9]/.test(name) ? `c_${name}` : name;
}

export const isBlankName = (text) => text === null || text === undefined || String(text).trim() === "";

// SQLite compares names without regard to the case of A to Z, and of no other letter.
export const sameNameKey = (name) => String(name).replace(/[A-Z]/g, (letter) => letter.toLowerCase());

export function uniqueName(base, used) {
    let name = base;
    for (let n = 2; used.has(sameNameKey(name)); n++) {
        name = `${base}_${n}`;
    }
    used.add(sameNameKey(name));
    return name;
}

export function columnNames(header, width) {
    const used = new Set();
    const names = [];
    for (let i = 0; i < width; i++) {
        let original = null;
        let base;
        if (header === null) {
            base = `column_${i + 1}`;
        } else if (i >= header.length) {
            base = `extra_${i - header.length + 1}`;
        } else {
            original = header[i] ?? "";
            base = isBlankName(original) ? `column_${i + 1}` : sanitiseName(original);
        }
        names.push({ name: uniqueName(base, used), original });
    }
    return names;
}

export function tableNameFor(fileName) {
    const name = String(fileName);
    const dot = name.lastIndexOf(".");
    // (a name that is all extension, ".csv", has nothing before its dot)
    const base = dot === -1 ? name : name.slice(0, dot);
    return base === "" ? FALLBACK_TABLE_NAME : sanitiseName(base);
}

export const firstRowLooksLikeNames = (row) => Array.isArray(row) && !row.some((field) => isPlainNumber(field));
