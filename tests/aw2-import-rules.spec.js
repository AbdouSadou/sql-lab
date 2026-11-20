const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const { pathToFileURL } = require("node:url");
const Papa = require("../vendor/papaparse.min.js");
const { test, expect, fixtureIndex, fixturePath, largeCsv, sha256, skipUnlessFirst, seeded } = require("./helpers");

// Assessment plan, Phase 2 (import CSV): the pure modules of the import, with no page. They are
// js/lab/import-rules.js (what type a column gets, what a table and its columns are called),
// js/lab/import-text.js (what a file is by its first bytes, and its text, read in slices),
// js/lab/import-csv.js (the preview's reading, the reading of a whole file in pieces, and the
// turning of rows into a table's columns) and the vendored Papa Parse that the third one is
// handed. Each is held to what its own header comment promises and to the plan's section 3
// ("Import CSV and Excel"), section 7 and the lists in section 9 ("Proof").
//
// Everything here runs in Node, once (not on every project: it checks modules and files, not the
// page), with Blobs made in Node. The last groups run every text fixture of tests/fixtures/
// through the three modules together and no database: bytes, kind, encoding, preview, pieces,
// rows, table. The result is compared with the owner's expected file for slices of 1, 2, 3, 5
// and 7 bytes and the default, so that characters of several bytes and line breaks are split
// across slices in every way. The fixtures are only read, never changed. large.csv is not stored:
// largeCsv() writes it to the temporary folder, and it is read with the default slice only.
//
// The edges of the line ending, the preview, the quote warning, numbers and the mark of a text's
// start are pinned in groups of their own: the line ending
// that the module finds and not Papa (lineEnding: a lone quote in a heading, quoted line breaks,
// a field never closed, the other candidate delimiters, Papa's threshold, and a generated property
// against Papa's own answer), the preview of a text with no complete row and of a second
// byte-order mark, the quote warning at every size of piece and at the real slice size, a decimal
// that no number can hold, and the mark of a text's start (markOf, sameStart).
//
// The same groups hold: white space of any kind (not the space and the
// tab alone) between a closing quote and the end of its field (the line ending and the whole read,
// and the generated property with such white space added), quoted line breaks that come before the
// first real one and outnumber the real ones, a text whose last character is a quote that opens a
// field (the warning at every size of piece, and a hostile property against one reading of the whole
// text), and a text that is not whole and ends with a carriage return (which is not counted).
//
// Two more edges: readStart never guesses U+001F or U+001E (Papa's own list holds them, the
// four delimiters do not), and the line ending at exactly half of the carriage returns is the carriage
// return, at one more than half the pair (the boundary, in a test of its own).
//
// A group of its own at the end, before the vendored library, holds edges that the other groups did
// not reach (found by changing the code a line at a time and seeing which changes no test noticed): a
// workbook's name ends in .xls or
// .xlsx, a file of a whole number of slices, what `between` throws in the pass over a file, a quote
// that starts no field with quoted fields after it, two carriage returns before a line feed, the
// carriage return taken off a text that is not whole, and a field of one space; and
// js/lab/import-pace.js, which no test had run on its own: when a rest waits for a frame, and
// how a turn is taken where scheduler.yield is missing. (Two more of its cases are with the
// names, further up: a file's name that begins with a space, and one that is an underscore.)
//
// The page's own rule that a zero byte without a UTF-16 mark means "not text" lives in
// js/lab/import-dialog.js; readText() below repeats it, so that the groups that need it can say
// what the modules give (bom, hasZero) and what the plan then decides.

const load = (file) => import(pathToFileURL(path.join(__dirname, "..", "js", "lab", file)).href);

let loaded = null;
const modules = () =>
    (loaded ??= Promise.all([load("import-rules.js"), load("import-text.js"), load("import-csv.js")]).then(([rules, text, csv]) => ({
        rules,
        text,
        csv,
    })));

// ---- helpers -------------------------------------------------------------------------------------

const blobOf = (bytes) => new Blob([Uint8Array.from(bytes)]);
const bytesOf = (text) => [...Buffer.from(text, "utf8")];

// a text in a given encoding, with or without its byte-order mark
function encode(encoding, text, { bom = false } = {}) {
    if (encoding === "utf-8") {
        return [...(bom ? [0xef, 0xbb, 0xbf] : []), ...Buffer.from(text, "utf8")];
    }
    const little = Buffer.from(text, "utf16le");
    if (encoding === "utf-16le") {
        return [...(bom ? [0xff, 0xfe] : []), ...little];
    }
    return [...(bom ? [0xfe, 0xff] : []), ...Buffer.from(little).swap16()];
}

async function collect(iterator) {
    const out = [];
    for await (const piece of iterator) {
        out.push(piece);
    }
    return out;
}

async function* asyncPieces(list, log = null) {
    for (const piece of list) {
        log?.push(`ask:${piece}`);
        yield piece;
    }
}

// the text cut into pieces of n characters; a piece never ends on a carriage return (the rule of
// textPieces), so a CRLF is not cut between its two characters
function cutInto(text, n) {
    const pieces = [];
    for (let at = 0; at < text.length; ) {
        let end = Math.min(text.length, at + n);
        if (text[end - 1] === "\r" && end < text.length) {
            end++;
        }
        pieces.push(text.slice(at, end));
        at = end;
    }
    return pieces;
}

async function rowsFromPieces(pieces, { delimiter = ",", newline = "\n" } = {}) {
    const { csv } = await modules();
    const rows = [];
    const read = await csv.readPieces(Papa, asyncPieces(pieces), { delimiter, newline, onRows: (got) => rows.push(...got) });
    return { rows, ...read };
}

// the file's own configuration of the import (js/lab/config-workflow.js has no imports: it runs here)
let configLoaded = null;
const config = () => (configLoaded ??= load("config-workflow.js"));

// the pieces a file of `bytes` comes in when it is read `sliceBytes` at a time, through the rows
async function rowsFromBytes(bytes, sliceBytes, { delimiter = ",", newline = "\n" } = {}) {
    const { text, csv } = await modules();
    const rows = [];
    const read = await csv.readPieces(Papa, text.textPieces(blobOf(bytes), "utf-8", { sliceBytes }), {
        delimiter,
        newline,
        onRows: (got) => rows.push(...got),
    });
    return { rows, ...read };
}

// a table from rows, as the reader makes it: {data, table}
async function tableFrom(rows, options = { hasNames: true, namesRow: 1 }) {
    const { csv } = await modules();
    const reader = csv.newTableReader(options);
    const data = reader.take(rows);
    return { data, table: reader.finish() };
}

// the reason an ImportRefused gives when fn throws one, "no refusal" when it does not, and the
// error's own name when it throws something else
async function refusalOf(fn) {
    const { csv } = await modules();
    try {
        await fn();
    } catch (error) {
        return error instanceof csv.ImportRefused ? error.reason : `other: ${error?.name}`;
    }
    return "no refusal";
}

const codes = (text) => [...text].map((c) => c.codePointAt(0));

// The whole read of a text file by the modules together, no database. Returns {refused: why} or
// {settings, name, table, data, badQuotes, newline}. `data` holds a value of an INTEGER or REAL
// column as Number(text), a TEXT value as written, an empty field as null.
const SLICES = [1, 2, 3, 5, 7, null];
const PREVIEW_BYTES = 1024 * 1024;
const readCache = new Map();

async function readText(fileName, bytes, { sliceBytes = null, namesRow = 1, hasNames = undefined } = {}) {
    const key = `${fileName}|${crypto.createHash("sha256").update(bytes).digest("hex")}|${sliceBytes}|${namesRow}|${hasNames}`;
    if (!readCache.has(key)) {
        readCache.set(key, readTextOnce(fileName, bytes, { sliceBytes, namesRow, hasNames }));
    }
    return readCache.get(key);
}

async function readTextOnce(fileName, bytes, { sliceBytes, namesRow, hasNames }) {
    const { rules, text, csv } = await modules();
    const blob = new Blob([bytes]);
    const options = sliceBytes === null ? {} : { sliceBytes };
    const kind = text.kindByStart(bytes.subarray(0, text.HEAD_BYTES), bytes.length, fileName);
    if (kind !== "text") {
        return { refused: kind };
    }
    const info = await text.inspectText(blob, options);
    if (info.hasZero && !(info.bom ?? "").startsWith("utf-16")) {
        return { refused: "not-text" };
    }
    const encoding = text.guessEncoding(info);
    const start = await text.startOfText(blob, encoding, PREVIEW_BYTES);
    const preview = csv.readStart(Papa, start.text, { whole: start.whole });
    if (!preview.rows.length) {
        return { refused: "empty" };
    }
    const names = hasNames ?? rules.firstRowLooksLikeNames(preview.rows[0]);
    const reader = csv.newTableReader({ hasNames: names, namesRow });
    const data = [];
    let read;
    let table;
    try {
        read = await csv.readPieces(Papa, text.textPieces(blob, encoding, options), {
            delimiter: preview.delimiter,
            newline: preview.newline,
            onRows: (rows) => data.push(...reader.take(rows)),
        });
        table = reader.finish();
    } catch (error) {
        if (error instanceof csv.ImportRefused) {
            return { refused: error.reason };
        }
        throw error;
    }
    const delimiterName = csv.DELIMITERS.find((d) => d.value === preview.delimiter).name;
    return {
        settings: {
            encoding: info.bom === "utf-8" ? "utf-8 with BOM" : encoding,
            delimiter: delimiterName,
            first_row_is_header: names,
        },
        name: rules.tableNameFor(path.basename(fileName)),
        table,
        data: data.map((row) =>
            table.columns.map((column, i) => {
                const value = i < row.length ? row[i] : null;
                return value === null || column.type === "TEXT" ? value : Number(value);
            })
        ),
        badQuotes: read.badQuotes,
        newline: preview.newline,
    };
}

// ---- comparing with the owner's expected files ------------------------------------------------------

const expectedOf = (entry) => JSON.parse(fs.readFileSync(path.join(__dirname, "fixtures", entry.expected), "utf8"));
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

// what the reader gives for a table's name, size and columns, in the expected file's own shape
function columnDifferences(got, want) {
    if (got.refused) {
        return [`refused (${got.refused}), expected a table`];
    }
    const problems = [];
    if (got.name !== want.name) {
        problems.push(`table name ${got.name} != ${want.name}`);
    }
    if (got.table.rows !== want.rows) {
        problems.push(`rows ${got.table.rows} != ${want.rows}`);
    }
    const gotColumns = got.table.columns.map((c) => {
        const out = { name: c.name, type: c.type, nulls: c.blanks };
        if (c.original !== null && c.original !== c.name) {
            out.original = c.original;
        }
        if (c.blocking !== null) {
            out.report_example = c.blocking;
        }
        return out;
    });
    const wantColumns = want.columns.map((c) => {
        const out = { name: c.name, type: c.type, nulls: c.nulls };
        if ("original" in c) {
            out.original = c.original;
        }
        if ("report_example" in c) {
            out.report_example = c.report_example;
        }
        return out;
    });
    for (let i = 0; i < Math.max(gotColumns.length, wantColumns.length); i++) {
        if (!same(gotColumns[i], wantColumns[i])) {
            problems.push(`column ${i + 1}: ${JSON.stringify(gotColumns[i])} != ${JSON.stringify(wantColumns[i])}`);
        }
    }
    return problems;
}

// every cell: row by row for a small table; for one of more than 200 rows its checksum (SHA-256 of
// JSON.stringify of the rows) and its first and last rows
function cellDifferences(got, want) {
    if (got.refused) {
        return [`refused (${got.refused}), expected a table`];
    }
    const problems = [];
    if (want.data === undefined) {
        if (sha256(JSON.stringify(got.data)) !== want.data_sha256) {
            problems.push("the checksum of the rows differs");
        }
        if (!same(got.data.slice(0, want.data_first_rows.length), want.data_first_rows)) {
            problems.push("the first rows differ");
        }
        if (!same(got.data.slice(-want.data_last_rows.length), want.data_last_rows)) {
            problems.push("the last rows differ");
        }
        return problems;
    }
    for (let r = 0; r < Math.max(got.data.length, want.data.length) && problems.length < 3; r++) {
        if (!same(got.data[r], want.data[r])) {
            problems.push(`row ${r + 1}: ${JSON.stringify(got.data[r])?.slice(0, 200)} != ${JSON.stringify(want.data[r])?.slice(0, 200)}`);
        }
    }
    return problems;
}

// ---- what the fixtures are ----------------------------------------------------------------------------

const INDEX = fixtureIndex()
    .map((entry) => ({ entry, name: entry.fixture, want: expectedOf(entry) }))
    .filter(({ want }) => want.fixture !== undefined);

const TEXT_FIXTURES = INDEX.filter(({ want }) => want.outcome === "import" && want.settings && !want.sheets);
const BY_CONTENT_TEXT = INDEX.filter(({ want }) => want.outcome === "import_by_content_or_refuse" && want.real_content === "text");

// Every fixture that must not become a table here, and what its first bytes make it. A workbook
// is refused as such with the import alone (with the flag excel-import it is read: tests/aw5-excel-*.spec.js).
const NOT_TEXT_KIND = {
    "csv/empty.csv": "empty",
    "impostors/zero_bytes.xlsx": "empty",
    "excel/messy_course_workbook.xlsx": "zip",
    "excel/title_rows_and_layouts.xlsx": "zip",
    "excel/hidden.xlsx": "zip",
    "excel/formulas.xlsx": "zip",
    "excel/formulas_uncached.xlsx": "zip",
    "excel/formats.xlsx": "zip",
    "excel/dates_1904.xlsx": "zip",
    "excel/sheet_names.xlsx": "zip",
    "excel/empty_sheets.xlsx": "zip",
    "excel/chart_sheet.xlsx": "zip",
    "shopping_db.xlsx": "zip",
    "impostors/renamed_xlsx.csv": "zip",
    "impostors/truncated.xlsx": "zip",
    "excel/messy_course_workbook.xls": "ole2",
    "excel/shopping_db.xls": "ole2",
    "excel/formats.xls": "ole2",
    "excel/xlwt_written.xls": "ole2",
    "impostors/password_protected.xlsx": "ole2",
    "impostors/html_table.xls": "markup",
    "impostors/spreadsheetml_2003.xls": "markup",
};
// Text by their first bytes, and still not a table: a zero byte, and a row of 2,100 fields.
const TEXT_BUT_REFUSED = { "impostors/random_bytes.xls": "not-text", "csv/wide_2100_columns.csv": "too-wide" };

const bytesOfFixture = (name) => new Uint8Array(fs.readFileSync(fixturePath(name)));

// ---- rules: what a plain number is -----------------------------------------------------------------------

test.describe("import rules: plain numbers (rules 2 and 3)", () => {
    test.beforeEach(skipUnlessFirst);

    const WHOLE_YES = ["0", "1", "-1", "9", "10", "100", "123456789012345", "-123456789012345", "999999999999999"];
    const WHOLE_NO = [
        ["1234567890123456", "16 digits"],
        ["-1234567890123456", "16 digits with a minus sign"],
        ["00", "two zeros"],
        ["01", "a leading zero"],
        ["007", "a leading zero"],
        ["00123", "a leading zero"],
        ["-0", "minus zero would lose its sign"],
        ["-00", "minus and two zeros"],
        ["+5", "a plus sign"],
        ["+0", "a plus sign"],
        [".5", "no digit before the point"],
        ["5.", "a point and nothing after it"],
        ["1e3", "an exponent"],
        ["1E3", "an exponent"],
        ["1,5", "a decimal comma"],
        ["1,000", "a thousands separator"],
        [" 5", "a space before"],
        ["5 ", "a space after"],
        [" 5 ", "spaces around"],
        ["\t5", "a tab before"],
        ["5\n", "a line break after"],
        ["£5", "a currency sign"],
        ["$5", "a currency sign"],
        ["5%", "a percent sign"],
        ["٣", "an Arabic-Indic digit three"],
        ["١٢", "two Arabic-Indic digits"],
        ["１２", "two full-width digits"],
        ["٥", "an Arabic-Indic digit five"],
        ["1٣", "an ASCII digit and an Arabic-Indic one"],
        ["-", "a minus sign alone"],
        ["", "nothing"],
        ["--1", "two minus signs"],
        ["0x1F", "hexadecimal"],
        ["1_000", "an underscore"],
        ["1.0", "a decimal"],
        ["10.00", "a decimal"],
        ["-0.0", "a decimal"],
        ["NaN", "a word"],
        ["Infinity", "a word"],
    ];

    test("isWhole accepts 0 and up to 15 digits that do not start with 0, with or without a minus sign", async () => {
        const { rules } = await modules();
        expect(WHOLE_YES.filter((value) => !rules.isWhole(value))).toEqual([]);
    });

    test("isWhole refuses everything else (rule 2): 16 digits, leading zeros, -0, +5, spaces, signs, other scripts", async () => {
        const { rules } = await modules();
        const wrong = WHOLE_NO.filter(([value]) => rules.isWhole(value)).map(([value, why]) => `${JSON.stringify(value)} (${why})`);
        expect(wrong).toEqual([]);
    });

    const DECIMAL_YES = [
        "0.0",
        "0.25",
        "0.5",
        "-0.5",
        "1.5",
        "10.00",
        "12.50",
        "100.001",
        "0.00",
        "123456789012345.5",
        // the plan's rule 3 allows a minus sign before any decimal: "-0.0" is one
        "-0.0",
    ];
    const DECIMAL_NO = [
        ["5", "a whole number"],
        ["0", "a whole number"],
        ["-0", "a whole number"],
        [".5", "no digit before the point"],
        ["-.5", "no digit before the point"],
        ["5.", "nothing after the point"],
        ["1.", "nothing after the point"],
        [".", "a point alone"],
        ["1e3", "an exponent"],
        ["1.5e3", "an exponent"],
        ["1,5", "a decimal comma"],
        ["1.234,5", "a decimal comma"],
        ["1,234.5", "a thousands separator"],
        ["£5.00", "a currency sign"],
        ["$1.50", "a currency sign"],
        ["5.00%", "a percent sign"],
        ["5.5%", "a percent sign"],
        [" 1.5", "a space before"],
        ["1.5 ", "a space after"],
        ["1.5.2", "two points"],
        ["1..5", "two points"],
        ["00.5", "a leading zero"],
        ["01.5", "a leading zero"],
        ["-00.5", "a leading zero"],
        ["+1.5", "a plus sign"],
        ["٣.٥", "Arabic-Indic digits"],
        ["１.５", "full-width digits"],
        ["1.５", "a full-width digit after the point"],
        ["1.٣", "an Arabic-Indic digit after the point"],
        ["", "nothing"],
    ];

    test("isDecimal accepts a whole part, a point and one or more digits, with or without a minus sign", async () => {
        const { rules } = await modules();
        expect(DECIMAL_YES.filter((value) => !rules.isDecimal(value))).toEqual([]);
    });

    test("isDecimal refuses everything else (rule 3): .5, 5., exponents, commas, signs, spaces, leading zeros, other scripts", async () => {
        const { rules } = await modules();
        const wrong = DECIMAL_NO.filter(([value]) => rules.isDecimal(value)).map(([value, why]) => `${JSON.stringify(value)} (${why})`);
        expect(wrong).toEqual([]);
    });
});

// ---- rules: a decimal that no number can hold ---------------------------------------------------------

test.describe("import rules: a long decimal is a plain number only when a REAL can hold it (rule 3)", () => {
    test.beforeEach(skipUnlessFirst);

    const nines = (n) => "9".repeat(n);
    const zeros = (n) => "0".repeat(n);

    test("above the largest: 300 nines and .5 is a decimal, 301 nines is not (it would be stored as infinity); with a minus sign the same", async () => {
        const { rules } = await modules();
        expect(rules.isDecimal(`${nines(300)}.5`)).toBe(true);
        expect(rules.isDecimal(`-${nines(300)}.5`)).toBe(true);
        expect(rules.isDecimal(`${nines(301)}.5`)).toBe(false);
        expect(rules.isDecimal(`-${nines(301)}.5`)).toBe(false);
        // a 322-digit decimal: Number() of it is infinity
        expect(Number(`${nines(322)}.5`)).toBe(Infinity);
        expect(rules.isDecimal(`${nines(322)}.5`)).toBe(false);
        expect(rules.isPlainNumber(`${nines(322)}.5`)).toBe(false);
        // up to 300 characters it is looked at no more: it fits a REAL whatever its digits
        expect(rules.isDecimal(`${nines(297)}.5`)).toBe(true);
    });

    test("below the smallest: 0. + 299 zeros + 1 is a decimal, with 300 zeros it is not (it would be stored as 0.0); with a minus sign the same", async () => {
        const { rules } = await modules();
        expect(rules.isDecimal(`0.${zeros(299)}1`)).toBe(true);
        expect(rules.isDecimal(`-0.${zeros(299)}1`)).toBe(true);
        expect(rules.isDecimal(`0.${zeros(300)}1`)).toBe(false);
        expect(rules.isDecimal(`-0.${zeros(300)}1`)).toBe(false);
        // 0.000...(400 zeros)1: Number() of it is a number, 1e-401, that is 0
        expect(Number(`0.${zeros(400)}1`)).toBe(0);
        expect(rules.isDecimal(`0.${zeros(400)}1`)).toBe(false);
        expect(rules.isDecimal(`0.${zeros(400)}9`)).toBe(false);
        expect(rules.isDecimal(`0.${zeros(350)}123456789`)).toBe(false);
        expect(rules.isDecimal(`0.${zeros(100)}123456789`)).toBe(true);
    });

    test("zero is zero however many zeros: 0. and 400 zeros, with or without a minus sign, is a decimal", async () => {
        const { rules } = await modules();
        for (const text of [`0.${zeros(400)}`, `-0.${zeros(400)}`, `0.${zeros(2000)}`, `0.${zeros(301)}`]) {
            expect(rules.isDecimal(text), `${text.length} characters`).toBe(true);
        }
    });

    test("a 400-digit fraction of an ordinary number is a decimal, and so is a long whole part of an ordinary one", async () => {
        const { rules } = await modules();
        const fraction = "3".repeat(400);
        expect(rules.isDecimal(`1.${fraction}`)).toBe(true);
        expect(rules.isDecimal(`-1.${fraction}`)).toBe(true);
        expect(rules.isDecimal(`0.${fraction}`)).toBe(true);
        expect(rules.isDecimal(`123456.${"0".repeat(10)}${"7".repeat(380)}`)).toBe(true);
        // (a fraction of digits that are mostly zeros but not small: 0.1 followed by zeros)
        expect(rules.isDecimal(`0.1${zeros(400)}`)).toBe(true);
    });

    test("a column of such values is TEXT, and the report names the value, when most of the column is numbers", async () => {
        const huge = `${nines(322)}.5`;
        const tiny = `0.${zeros(400)}1`;
        for (const [value, why] of [[huge, "too large"], [tiny, "too small"], [`-${nines(301)}.5`, "too large, negative"]]) {
            const { data, table } = await tableFrom([["v"], ["1.5"], ["2"], [value], ["3.25"]]);
            expect(table.columns[0].type, why).toBe("TEXT");
            expect(table.columns[0].blocking, why).toBe(value);
            // the value is kept as it was written
            expect(data.map((row) => row[0]), why).toEqual(["1.5", "2", value, "3.25"]);
        }
        // a column of ordinary long decimals is REAL, and a column of zeros with many digits too
        const real = await tableFrom([["v"], [`1.${"3".repeat(400)}`], ["2.5"], [`0.${zeros(400)}`], [`${nines(300)}.5`]]);
        expect(real.table.columns[0].type).toBe("REAL");
        expect(real.table.columns[0].blocking).toBeNull();
        // when most of the column is not numbers, no value is named (the column is just text)
        const words = await tableFrom([["v"], ["a"], ["b"], [huge]]);
        expect(words.table.columns[0].type).toBe("TEXT");
        expect(words.table.columns[0].blocking).toBeNull();
    });

    test("-0.0 is still a decimal (the plan's rule 3 as written), and isWhole is untouched by all of this", async () => {
        const { rules } = await modules();
        expect(rules.isDecimal("-0.0")).toBe(true);
        expect(rules.isDecimal(`-0.${zeros(400)}`)).toBe(true);
        expect(rules.isWhole("-0")).toBe(false);
        expect(rules.isWhole("999999999999999")).toBe(true);
        expect(rules.isWhole("1000000000000000")).toBe(false);
        expect(rules.isWhole(nines(300))).toBe(false);
        expect(rules.isWhole(`${nines(300)}.5`)).toBe(false);
        expect(rules.isWhole(`0.${zeros(400)}1`)).toBe(false);
        // a whole number of any length is text, never a number that could become infinity
        expect(rules.isPlainNumber(nines(322))).toBe(false);
    });
});

// ---- rules: a column's type -------------------------------------------------------------------------------

test.describe("import rules: a column's type, from all of its values (rules 2 to 4 and 8)", () => {
    test.beforeEach(skipUnlessFirst);

    async function tallyOf(values) {
        const { rules } = await modules();
        const tally = rules.newTally();
        for (const value of values) {
            rules.tallyValue(tally, value);
        }
        return { type: rules.columnType(tally), blocking: rules.blockingValue(tally), tally };
    }

    test("a column with no values is TEXT, and so is one of only empty fields", async () => {
        expect((await tallyOf([])).type).toBe("TEXT");
        expect((await tallyOf([null])).type).toBe("TEXT");
        expect((await tallyOf([null, null, null])).type).toBe("TEXT");
    });

    test("whole numbers alone are INTEGER, and empty fields do not change that", async () => {
        expect((await tallyOf(["1", "2", "-3", "0"])).type).toBe("INTEGER");
        expect((await tallyOf(["7"])).type).toBe("INTEGER");
        expect((await tallyOf([null, "1", null, "2"])).type).toBe("INTEGER");
        expect((await tallyOf(["123456789012345", "-123456789012345"])).type).toBe("INTEGER");
    });

    test("whole numbers and decimals together are REAL, and so are decimals alone", async () => {
        expect((await tallyOf(["10", "12.50"])).type).toBe("REAL");
        expect((await tallyOf(["0.5"])).type).toBe("REAL");
        expect((await tallyOf(["1", "2", "3.25", "4"])).type).toBe("REAL");
        expect((await tallyOf([null, "1.5", null])).type).toBe("REAL");
    });

    test("one text value anywhere makes the whole column TEXT", async () => {
        expect((await tallyOf(["1", "2", "x"])).type).toBe("TEXT");
        expect((await tallyOf(["x", "1", "2"])).type).toBe("TEXT");
        expect((await tallyOf(["1.5", "2.5", "n/a"])).type).toBe("TEXT");
        // a value the rules do not call a number
        for (const value of ["-0", "+5", "00123", "1234567890123456", "1e3", "1,5", "£5.00", "5%", ".5", "5.", " 5", "5 ", "٣"]) {
            expect((await tallyOf(["1", value])).type, JSON.stringify(value)).toBe("TEXT");
        }
    });

    test("a late text value changes the type of a column that was INTEGER for thousands of rows (rule 8)", async () => {
        const values = Array.from({ length: 5000 }, (_, i) => String(i + 1));
        expect((await tallyOf(values)).type).toBe("INTEGER");
        expect((await tallyOf([...values, "oops"])).type).toBe("TEXT");
    });

    test("a field of spaces is text, not an empty field (rule 5)", async () => {
        expect((await tallyOf(["1", "   "])).type).toBe("TEXT");
        expect((await tallyOf(["   "])).type).toBe("TEXT");
    });

    const BLOCKING = [
        [["1", "2", "x"], "x", "mostly numbers: the first value that is not one"],
        [["1", "2", "3", "a", "b"], "a", "the first of two"],
        [["1", "x", "2", "y"], "x", "the first, though numbers come after it"],
        [["1", "x"], "x", "exactly half are numbers"],
        [["1", "2", "x", "y"], "x", "exactly half are numbers"],
        [["1", "x", "y"], null, "fewer than half are numbers"],
        [["x", "y", "1"], null, "fewer than half are numbers, whatever the order"],
        [["1", "2", "   "], "   ", "a value of spaces is not a number"],
        [["1", "-0"], "-0", "-0 is not a plain number"],
        [["00123", "1"], "00123", "a leading zero is not a plain number"],
        [["1", "2", "1e3"], "1e3", "an exponent"],
        [["1", "2", "+5"], "+5", "a plus sign"],
        [["1", "£5", "2", "5%"], "£5", "the first of a currency sign and a percent sign"],
        [["1.5", "2", "abc"], "abc", "decimals and whole numbers count as numbers"],
        [[null, null, "1", "x"], "x", "empty fields are not counted: one of two non-empty values is a number"],
        [[null, "1", "x", "y"], null, "empty fields are not counted: one of three is a number"],
        [["a", "b"], null, "no number at all"],
        [[], null, "no values"],
        [[null, null], null, "only empty fields"],
        [["1", "2"], null, "an INTEGER column has nothing to point at"],
        [["1", "2.5"], null, "a REAL column has nothing to point at"],
    ];

    test("the blocking value is the first value that is not a number, when at least half of the values are numbers, and null otherwise", async () => {
        const wrong = [];
        for (const [values, want, why] of BLOCKING) {
            const { blocking } = await tallyOf(values);
            if (blocking !== want) {
                wrong.push(`${JSON.stringify(values)}: ${JSON.stringify(blocking)} != ${JSON.stringify(want)} (${why})`);
            }
        }
        expect(wrong).toEqual([]);
    });
});

// ---- rules: names -------------------------------------------------------------------------------------------

test.describe("import rules: names (plan section 3, 'Names')", () => {
    test.beforeEach(skipUnlessFirst);

    test("each run of other characters becomes one underscore, and nothing is trimmed", async () => {
        const { rules } = await modules();
        const cases = {
            "Café": "Caf_",
            "Amount (£)": "Amount_",
            "% Change": "_Change",
            "a b": "a_b",
            "a   b": "a_b",
            "a-b/c": "a_b_c",
            " Name ": "_Name_",
            "x__y": "x__y",
            "_ok": "_ok",
            Order: "Order",
            "Name_2": "Name_2",
            "É": "_",
            "٣": "_",
            "１２": "_",
            "!!!": "_",
            "###": "_",
            "a.b": "a_b",
        };
        const got = Object.fromEntries(Object.keys(cases).map((text) => [text, rules.sanitiseName(text)]));
        expect(got).toEqual(cases);
    });

    test("a name that starts with a digit gains c_ in front", async () => {
        const { rules } = await modules();
        expect(rules.sanitiseName("2023")).toBe("c_2023");
        expect(rules.sanitiseName("1st place")).toBe("c_1st_place");
        expect(rules.sanitiseName("0")).toBe("c_0");
        expect(rules.sanitiseName("_1")).toBe("_1");
        // the digit rule looks at the name after the other characters are replaced
        expect(rules.sanitiseName("2024 Sales Data (final) v2")).toBe("c_2024_Sales_Data_final_v2");
    });

    test("an empty text stays empty here, and a name of only symbols becomes one underscore", async () => {
        const { rules } = await modules();
        expect(rules.sanitiseName("")).toBe("");
        expect(rules.sanitiseName("()")).toBe("_");
        expect(rules.sanitiseName("???")).toBe("_");
    });

    test("isBlankName: empty or white space only", async () => {
        const { rules } = await modules();
        for (const blank of ["", " ", "   ", "\t", " \t\n ", null, undefined]) {
            expect(rules.isBlankName(blank), JSON.stringify(blank)).toBe(true);
        }
        for (const named of ["a", " a ", "0", "_", "-", "é"]) {
            expect(rules.isBlankName(named), JSON.stringify(named)).toBe(false);
        }
    });

    test("sameNameKey folds A to Z and nothing else", async () => {
        const { rules } = await modules();
        expect(rules.sameNameKey("Name")).toBe("name");
        expect(rules.sameNameKey("NAME")).toBe(rules.sameNameKey("name"));
        expect(rules.sameNameKey("ABC_xyz_09")).toBe("abc_xyz_09");
        // SQLite folds only A to Z: an accented capital is a different letter from its small one
        expect(rules.sameNameKey("É")).toBe("É");
        expect(rules.sameNameKey("É")).not.toBe(rules.sameNameKey("é"));
        expect(rules.sameNameKey("ÉA")).toBe("Éa");
    });

    test("uniqueName takes the first of base, base_2, base_3 whose key nothing has, and records it", async () => {
        const { rules } = await modules();
        const used = new Set();
        expect(rules.uniqueName("a", used)).toBe("a");
        expect(rules.uniqueName("a", used)).toBe("a_2");
        expect(rules.uniqueName("a", used)).toBe("a_3");
        expect([...used].sort()).toEqual(["a", "a_2", "a_3"]);
        // without regard to the case of A to Z; the key is what is recorded, the name keeps its case
        expect(rules.uniqueName("A", used)).toBe("A_4");
        expect(used.has("a_4")).toBe(true);
        // a generated name counts too
        expect(rules.uniqueName("a_2", used)).toBe("a_2_2");
        // an accented capital and its small letter are two names
        expect(rules.uniqueName("É", used)).toBe("É");
        expect(rules.uniqueName("é", used)).toBe("é");
        expect(rules.uniqueName("É", used)).toBe("É_2");
    });

    test("columnNames with no header row: column_1 to column_n, and no original text", async () => {
        const { rules } = await modules();
        expect(rules.columnNames(null, 3)).toEqual([
            { name: "column_1", original: null },
            { name: "column_2", original: null },
            { name: "column_3", original: null },
        ]);
        expect(rules.columnNames(null, 0)).toEqual([]);
    });

    test("columnNames makes the names from the header and keeps the header's own text as the original", async () => {
        const { rules } = await modules();
        expect(rules.columnNames(["id", "Café", "Amount (£)", "2023"], 4)).toEqual([
            { name: "id", original: "id" },
            { name: "Caf_", original: "Café" },
            { name: "Amount_", original: "Amount (£)" },
            { name: "c_2023", original: "2023" },
        ]);
    });

    test("a blank header is column_ and its position, counted from 1 at the table's first column", async () => {
        const { rules } = await modules();
        const got = rules.columnNames(["a", "", "  ", "d", "\t", "f"], 6).map((c) => c.name);
        expect(got).toEqual(["a", "column_2", "column_3", "d", "column_5", "f"]);
        // the original of a blank header is its own text
        expect(rules.columnNames(["a", "  "], 2)[1]).toEqual({ name: "column_2", original: "  " });
    });

    test("a column beyond the header is extra_1, extra_2 ... with no original", async () => {
        const { rules } = await modules();
        expect(rules.columnNames(["a", "b"], 4)).toEqual([
            { name: "a", original: "a" },
            { name: "b", original: "b" },
            { name: "extra_1", original: null },
            { name: "extra_2", original: null },
        ]);
        // a header's own extra_1 is met first, so the generated one is made unique like any other
        expect(rules.columnNames(["extra_1", "b"], 3).map((c) => c.name)).toEqual(["extra_1", "b", "extra_1_2"]);
        // and a blank header that would be column_2 beside a real column_2
        expect(rules.columnNames(["column_2", ""], 2).map((c) => c.name)).toEqual(["column_2", "column_2_2"]);
    });

    test("the plan's own example: Name, name, NAME, Name_2 become Name, name_2, NAME_3, Name_2_2", async () => {
        const { rules } = await modules();
        const got = rules.columnNames(["Name", "name", "NAME", "Name_2"], 4);
        expect(got.map((c) => c.name)).toEqual(["Name", "name_2", "NAME_3", "Name_2_2"]);
        expect(got.map((c) => c.original)).toEqual(["Name", "name", "NAME", "Name_2"]);
    });

    test("a header as long as the table is named in full", async () => {
        const { rules } = await modules();
        expect(rules.columnNames(["a", "b", "c"], 3).map((c) => c.name)).toEqual(["a", "b", "c"]);
    });

    test("tableNameFor takes the file's name without its extension and makes it a name", async () => {
        const { rules } = await modules();
        const cases = {
            "sales.csv": "sales",
            "Order.csv": "Order",
            "2024 Sales Data (final) v2.csv": "c_2024_Sales_Data_final_v2",
            "My File.CSV": "My_File",
            "a.b.csv": "a_b",
            "archive.tar.gz": "archive_tar",
            "Café.csv": "Caf_",
            sales: "sales",
            "x.": "x",
        };
        const got = Object.fromEntries(Object.keys(cases).map((text) => [text, rules.tableNameFor(text)]));
        expect(got).toEqual(cases);
    });

    test("a file name that is all extension, or only a dot, is called table", async () => {
        const { rules } = await modules();
        expect(rules.FALLBACK_TABLE_NAME).toBe("table");
        expect(rules.tableNameFor(".csv")).toBe("table");
        expect(rules.tableNameFor(".xlsx")).toBe("table");
        expect(rules.tableNameFor(".")).toBe("table");
        expect(rules.tableNameFor("")).toBe("table");
    });

    // (Two ways to get this wrong that the other tests of names did not tell apart: the name trimmed
    // first, and an underscore taken for no name at all.)
    test("nothing is trimmed off a file's name, and a name that comes out as an underscore is a name: only an empty one is called table", async () => {
        const { rules } = await modules();
        const cases = {
            " report.csv": "_report",
            "  a b.csv": "_a_b",
            "report .csv": "report_",
            " ": "_",
            "_.csv": "_",
            _: "_",
            "!!!.csv": "_",
        };
        const got = Object.fromEntries(Object.keys(cases).map((text) => [text, rules.tableNameFor(text)]));
        expect(got).toEqual(cases);
    });

    test("the first row is taken as names unless one of its fields is a plain number", async () => {
        const { rules } = await modules();
        expect(rules.firstRowLooksLikeNames(["id", "name"])).toBe(true);
        expect(rules.firstRowLooksLikeNames(["Region", "Month", "Orders", "Revenue"])).toBe(true);
        expect(rules.firstRowLooksLikeNames(["id", "42"])).toBe(false);
        expect(rules.firstRowLooksLikeNames(["2023", "Sales"])).toBe(false);
        expect(rules.firstRowLooksLikeNames(["1.5", "x"])).toBe(false);
        expect(rules.firstRowLooksLikeNames(["x", "-3"])).toBe(false);
        // what is not a plain number is no reason to doubt the names
        for (const field of ["+5", "00123", "-0", "1e3", "1,5", "£5.00", "5%", " 5", "", "٣"]) {
            expect(rules.firstRowLooksLikeNames(["a", field]), JSON.stringify(field)).toBe(true);
        }
    });
});

// ---- text: what a file is by its first bytes -----------------------------------------------------------------

test.describe("import text: the kind of a file by its first bytes (plan section 3, 'Where it starts')", () => {
    test.beforeEach(skipUnlessFirst);

    const kind = async (bytes, name) => (await modules()).text.kindByStart(Uint8Array.from(bytes), bytes.length, name);

    test("no bytes at all is empty, whatever the name", async () => {
        for (const name of ["a.csv", "a.xlsx", "a.xls", "a.txt", "a.TSV"]) {
            expect(await kind([], name), name).toBe("empty");
        }
    });

    test("the four bytes 50 4B 03 04 first make a zip, whatever the name", async () => {
        const zip = [0x50, 0x4b, 0x03, 0x04, 0x14, 0x00, 0x00, 0x00];
        for (const name of ["a.xlsx", "a.xls", "a.csv", "a.txt", "a.tsv", "a.XLSX"]) {
            expect(await kind(zip, name), name).toBe("zip");
        }
        expect(await kind([0x50, 0x4b, 0x03, 0x04], "a.csv")).toBe("zip");
    });

    test("PK followed by anything but 03 04 is text: a CSV whose first column is called PK", async () => {
        expect(await kind(bytesOf("PK,name\n1,a\n"), "a.csv")).toBe("text");
        expect(await kind(bytesOf("PK,name\n1,a\n"), "a.xlsx")).toBe("text");
        expect(await kind([0x50, 0x4b, 0x03, 0x05, 0x00], "a.csv")).toBe("text");
        expect(await kind([0x50, 0x4b, 0x05, 0x06, 0x00, 0x00], "a.csv")).toBe("text");
        expect(await kind([0x50, 0x4b, 0x03], "a.csv")).toBe("text");
        expect(await kind([0x50, 0x4b], "a.csv")).toBe("text");
    });

    test("the eight bytes D0 CF 11 E0 A1 B1 1A E1 first make an OLE2 file, whatever the name", async () => {
        const ole2 = [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1, 0x00, 0x00];
        for (const name of ["a.xls", "a.xlsx", "a.csv", "a.txt"]) {
            expect(await kind(ole2, name), name).toBe("ole2");
        }
        expect(await kind(ole2.slice(0, 8), "a.xls")).toBe("ole2");
    });

    test("seven of the eight OLE2 bytes are not enough", async () => {
        expect(await kind([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a], "a.csv")).toBe("text");
        expect(await kind([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe2], "a.csv")).toBe("text");
    });

    test("a < as the first character under an .xls or .xlsx name, in any letter case, is markup", async () => {
        const page = bytesOf("<html><body><table></table></body></html>");
        for (const name of ["a.xls", "a.xlsx", "a.XLS", "a.XLSX", "a.Xlsx", "a.xLs", "report.final.xls"]) {
            expect(await kind(page, name), name).toBe("markup");
        }
    });

    test("white space and a byte-order mark may come before the <", async () => {
        const name = "a.xls";
        expect(await kind(bytesOf("  \r\n\t<?xml version='1.0'?>"), name)).toBe("markup");
        expect(await kind([0xef, 0xbb, 0xbf, ...bytesOf("<?xml?>")], name)).toBe("markup");
        expect(await kind([0xef, 0xbb, 0xbf, ...bytesOf(" \n <table>")], name)).toBe("markup");
        expect(await kind(encode("utf-16le", "<html>", { bom: true }), name)).toBe("markup");
        expect(await kind(encode("utf-16be", "<html>", { bom: true }), name)).toBe("markup");
        expect(await kind(encode("utf-16le", "  \n<html>", { bom: true }), "a.xlsx")).toBe("markup");
    });

    test("the same bytes under a .csv, .tsv or .txt name are text", async () => {
        for (const bytes of [bytesOf("<html><body></body></html>"), [0xef, 0xbb, 0xbf, ...bytesOf("<?xml?>")], bytesOf("  \n<table>"), encode("utf-16le", "<html>", { bom: true })]) {
            for (const name of ["a.csv", "a.tsv", "a.txt", "a.CSV"]) {
                expect(await kind(bytes, name), name).toBe("text");
            }
        }
    });

    test("under a workbook's name, text that does not start with < is text", async () => {
        expect(await kind(bytesOf("id,name\n1,a\n"), "a.xls")).toBe("text");
        expect(await kind(bytesOf("a<b,c\n"), "a.xlsx")).toBe("text");
        expect(await kind(bytesOf("  \n id,name"), "a.xlsx")).toBe("text");
        expect(await kind(bytesOf("Ref\tItem\tQty\r\n00123\tMug\t4\r\n"), "tab_text.xls")).toBe("text");
    });

    test("any other bytes are text, and so are bytes with a zero (inspectText looks at those)", async () => {
        expect(await kind(bytesOf("a,b\n1,2\n"), "a.csv")).toBe("text");
        expect(await kind([0x61, 0x00, 0x62, 0x00], "a.csv")).toBe("text");
        expect(await kind([0xe9, 0xff, 0xfe, 0x00], "a.csv")).toBe("text");
        expect(await kind(bytesOf("x"), "noextension")).toBe("text");
    });

    test("bomOf names the byte-order mark and nothing else", async () => {
        const { text } = await modules();
        expect(text.bomOf(Uint8Array.from([0xef, 0xbb, 0xbf, 0x61]))).toBe("utf-8");
        expect(text.bomOf(Uint8Array.from([0xff, 0xfe, 0x61, 0x00]))).toBe("utf-16le");
        expect(text.bomOf(Uint8Array.from([0xfe, 0xff, 0x00, 0x61]))).toBe("utf-16be");
        expect(text.bomOf(Uint8Array.from([0x61, 0x62]))).toBeNull();
        expect(text.bomOf(Uint8Array.from([]))).toBeNull();
        expect(text.bomOf(Uint8Array.from([0xef, 0xbb]))).toBeNull();
        expect(text.bomOf(Uint8Array.from([0xff]))).toBeNull();
        expect(text.bomOf(Uint8Array.from([0x61, 0xef, 0xbb, 0xbf]))).toBeNull();
    });
});

// ---- text: looking at the whole file ---------------------------------------------------------------------------

test.describe("import text: the endings of the spreadsheets that are refused by their name", () => {
    test.beforeEach(skipUnlessFirst);

    test("a name ending in .xlsm, .xlsb or .ods, in any letter case, fits; a name that merely holds one, or ends otherwise, does not", async () => {
        const { text } = await modules();
        for (const name of ["a.xlsm", "a.xlsb", "a.ods", "REPORT.XLSM", "Data.XlsB", "sheet.ODS", "two.words.ods", ".ods"]) {
            expect(text.OTHER_SPREADSHEET_NAME.test(name), name).toBe(true);
            expect(text.OTHER_SPREADSHEET_NAME.exec(name)[0].toLowerCase()).toBe(name.slice(name.lastIndexOf(".")).toLowerCase());
        }
        for (const name of ["notes.ods.csv", "a.xlsm.txt", "a.xlsb.tsv", "ods", "a.odsx", "a.xls", "a.xlsx", "a.xlsmx", "a_xlsm", "a.xlsm ", "a.csv", "a.ods\n"]) {
            expect(text.OTHER_SPREADSHEET_NAME.test(name), name).toBe(false);
        }
    });
});

test.describe("import text: one pass over the whole file (inspectText, guessEncoding, fitsEncoding)", () => {
    test.beforeEach(skipUnlessFirst);

    test("plain text has no mark, no zero byte and is valid UTF-8", async () => {
        const { text } = await modules();
        expect(await text.inspectText(blobOf(bytesOf("id,name\n1,a\n")))).toEqual({ bom: null, hasZero: false, validUtf8: true });
        expect(await text.inspectText(blobOf([]))).toEqual({ bom: null, hasZero: false, validUtf8: true });
    });

    test("a zero byte anywhere is found, also in a later slice", async () => {
        const { text } = await modules();
        const bytes = [...bytesOf("abcdefgh"), 0x00, ...bytesOf("ijkl")];
        for (const sliceBytes of [1, 3, 4, 8, 9, 100]) {
            expect((await text.inspectText(blobOf(bytes), { sliceBytes })).hasZero, `slice ${sliceBytes}`).toBe(true);
        }
        expect((await text.inspectText(blobOf([0x00, ...bytesOf("abc")]), { sliceBytes: 2 })).hasZero).toBe(true);
        expect((await text.inspectText(blobOf([...bytesOf("abc"), 0x00]), { sliceBytes: 2 })).hasZero).toBe(true);
        expect((await text.inspectText(blobOf(bytesOf("abcdefghijkl")), { sliceBytes: 2 })).hasZero).toBe(false);
    });

    test("bytes that are not UTF-8 are found where the first bad byte is past the first slice", async () => {
        const { text } = await modules();
        const bytes = [...bytesOf("aaaaaaaa"), 0xe9, ...bytesOf("tail")];
        for (const sliceBytes of [1, 4, 8, 9]) {
            expect((await text.inspectText(blobOf(bytes), { sliceBytes })).validUtf8, `slice ${sliceBytes}`).toBe(false);
        }
        // with the default slice (1 MB) the bad byte is in the second slice
        const big = new Uint8Array(1024 * 1024 + 500).fill(0x61);
        big[big.length - 100] = 0xe9;
        expect((await text.inspectText(new Blob([big]))).validUtf8).toBe(false);
        const clean = new Uint8Array(1024 * 1024 + 500).fill(0x61);
        expect((await text.inspectText(new Blob([clean]))).validUtf8).toBe(true);
    });

    test("other bytes that UTF-8 does not allow are found: a lone continuation, 0xFF, an overlong form, a lone surrogate", async () => {
        const { text } = await modules();
        for (const bytes of [[0x80], [0x61, 0xff, 0x62], [0xc0, 0x80], [0xed, 0xa0, 0x80], [0xf8, 0x88, 0x80, 0x80, 0x80]]) {
            expect((await text.inspectText(blobOf(bytes))).validUtf8, JSON.stringify(bytes)).toBe(false);
        }
    });

    test("a character cut by a slice boundary is still valid UTF-8", async () => {
        const { text } = await modules();
        const bytes = bytesOf("aé€\u{1f600}z,日本");
        for (const sliceBytes of [1, 2, 3, 4, 5, 6, 7]) {
            expect((await text.inspectText(blobOf(bytes), { sliceBytes })).validUtf8, `slice ${sliceBytes}`).toBe(true);
        }
    });

    test("a file that ends inside a character is not valid UTF-8", async () => {
        const { text } = await modules();
        const bytes = [0x61, 0xe2, 0x82];
        for (const sliceBytes of [1, 2, 100]) {
            expect((await text.inspectText(blobOf(bytes), { sliceBytes })).validUtf8, `slice ${sliceBytes}`).toBe(false);
        }
    });

    test("each byte-order mark is named", async () => {
        const { text } = await modules();
        expect((await text.inspectText(blobOf(encode("utf-8", "a,b\n", { bom: true })))).bom).toBe("utf-8");
        expect((await text.inspectText(blobOf(encode("utf-16le", "a,b\n", { bom: true })))).bom).toBe("utf-16le");
        expect((await text.inspectText(blobOf(encode("utf-16be", "a,b\n", { bom: true })))).bom).toBe("utf-16be");
        expect((await text.inspectText(blobOf(encode("utf-8", "a,b\n")))).bom).toBeNull();
    });

    test("a UTF-8 file with its mark is valid UTF-8, and a UTF-16 file has zero bytes", async () => {
        const { text } = await modules();
        expect(await text.inspectText(blobOf(encode("utf-8", "café\n", { bom: true })), { sliceBytes: 1 })).toEqual({ bom: "utf-8", hasZero: false, validUtf8: true });
        for (const encoding of ["utf-16le", "utf-16be"]) {
            const info = await text.inspectText(blobOf(encode(encoding, "a,b\n1,2\n", { bom: true })), { sliceBytes: 3 });
            expect(info.bom, encoding).toBe(encoding);
            expect(info.hasZero, encoding).toBe(true);
        }
    });

    test("between is called after each slice with the number of bytes read so far", async () => {
        const { text } = await modules();
        const calls = [];
        await text.inspectText(blobOf(bytesOf("0123456789")), { sliceBytes: 4, between: async (read) => calls.push(read) });
        expect(calls).toEqual([4, 8, 10]);
    });

    test("guessEncoding: the mark's encoding, else UTF-8 when the bytes fit it, else Windows-1252", async () => {
        const { text } = await modules();
        expect(text.guessEncoding({ bom: "utf-8", validUtf8: true })).toBe("utf-8");
        expect(text.guessEncoding({ bom: "utf-16le", validUtf8: false })).toBe("utf-16le");
        expect(text.guessEncoding({ bom: "utf-16be", validUtf8: false })).toBe("utf-16be");
        expect(text.guessEncoding({ bom: null, validUtf8: true })).toBe("utf-8");
        expect(text.guessEncoding({ bom: null, validUtf8: false })).toBe("windows-1252");
        // the mark is a fact about the file and wins
        expect(text.guessEncoding({ bom: "utf-8", validUtf8: false })).toBe("utf-8");
    });

    const FITS = [
        ["utf-8", bytesOf("plain café € \u{1f600}"), true, "valid UTF-8"],
        ["utf-8", [], true, "an empty file"],
        ["utf-8", [0xe9], false, "a Windows-1252 e acute"],
        ["utf-8", [0x61, 0xe2, 0x82], false, "a character cut at the end"],
        ["utf-8", [0xed, 0xa0, 0x80], false, "a surrogate written in UTF-8"],
        ["utf-8", [0xff], false, "0xFF"],
        ["utf-16le", encode("utf-16le", "ab"), true, "two letters"],
        ["utf-16le", encode("utf-16le", "ab", { bom: true }), true, "two letters with the mark"],
        ["utf-16le", encode("utf-16le", "a\u{1f600}z"), true, "a surrogate pair"],
        ["utf-16le", [0x61, 0x00, 0x62], false, "an odd length"],
        ["utf-16le", [0x00, 0xd8], false, "a lone high surrogate"],
        ["utf-16le", [0x00, 0xdc, 0x61, 0x00], false, "a lone low surrogate"],
        ["utf-16le", [0x00, 0xd8, 0x61, 0x00], false, "a high surrogate followed by a letter"],
        ["utf-16be", encode("utf-16be", "ab"), true, "two letters"],
        ["utf-16be", encode("utf-16be", "a\u{1f600}z", { bom: true }), true, "a surrogate pair with the mark"],
        ["utf-16be", [0x00, 0x61, 0x00], false, "an odd length"],
        ["utf-16be", [0xd8, 0x00], false, "a lone high surrogate"],
        ["windows-1252", Array.from({ length: 256 }, (_, i) => i), true, "every byte"],
        ["windows-1252", [0x81, 0x8d, 0x8f, 0x90, 0x9d], true, "the five bytes it leaves undefined"],
        ["windows-1252", [0xa3, 0xe9, 0x80, 0x93, 0x94], true, "a pound sign, e acute, euro and curly quotes"],
    ];

    test("fitsEncoding is strict: UTF-8 that is not, UTF-16 with an odd length or a lone surrogate; Windows-1252 takes every byte", async () => {
        const { text } = await modules();
        const wrong = [];
        for (const [encoding, bytes, want, why] of FITS) {
            for (const sliceBytes of [1, 3, 4, 1024 * 1024]) {
                const got = await text.fitsEncoding(blobOf(bytes), encoding, { sliceBytes });
                if (got !== want) {
                    wrong.push(`${encoding}, ${why}, slice ${sliceBytes}: ${got} != ${want}`);
                }
            }
        }
        expect(wrong).toEqual([]);
    });

    test("the five bytes Windows-1252 leaves undefined come out as the control characters of the same number", async () => {
        const { text } = await modules();
        const bytes = [0x81, 0x8d, 0x8f, 0x90, 0x9d];
        const start = await text.startOfText(blobOf(bytes), "windows-1252", 100);
        expect(codes(start.text).map((c) => c.toString(16))).toEqual(["81", "8d", "8f", "90", "9d"]);
        const pieces = await collect(text.textPieces(blobOf(bytes), "windows-1252", { sliceBytes: 2 }));
        expect(codes(pieces.join("")).map((c) => c.toString(16))).toEqual(["81", "8d", "8f", "90", "9d"]);
    });

    test("Windows-1252 reads the pound sign, e acute, the euro sign and curly quotes as Excel writes them", async () => {
        const { text } = await modules();
        const start = await text.startOfText(blobOf([0xa3, 0xe9, 0x80, 0x93, 0x94]), "windows-1252", 100);
        expect(start.text).toBe("£é€“”");
    });

    test("fitsEncoding calls between with the number of bytes read so far", async () => {
        const { text } = await modules();
        const calls = [];
        await text.fitsEncoding(blobOf(bytesOf("0123456789")), "utf-8", { sliceBytes: 4, between: async (read) => calls.push(read) });
        expect(calls).toEqual([4, 8, 10]);
    });
});

// ---- text: the start, and the whole text in pieces --------------------------------------------------------------

test.describe("import text: startOfText and textPieces", () => {
    test.beforeEach(skipUnlessFirst);

    test("startOfText gives the whole text and whole: true when the file fits in the limit", async () => {
        const { text } = await modules();
        expect(await text.startOfText(blobOf(bytesOf("a,b\n1,2\n")), "utf-8", 1000)).toEqual({ text: "a,b\n1,2\n", whole: true });
        // exactly as long as the limit is still the whole file
        expect(await text.startOfText(blobOf(bytesOf("abcd")), "utf-8", 4)).toEqual({ text: "abcd", whole: true });
        expect(await text.startOfText(blobOf([]), "utf-8", 4)).toEqual({ text: "", whole: true });
    });

    test("startOfText gives the first bytes and whole: false when the file is longer than the limit", async () => {
        const { text } = await modules();
        expect(await text.startOfText(blobOf(bytesOf("abcdef")), "utf-8", 4)).toEqual({ text: "abcd", whole: false });
    });

    test("a character cut by the limit is left out, not refused", async () => {
        const { text } = await modules();
        const bytes = bytesOf("aé"); // 61 C3 A9
        expect(await text.startOfText(blobOf(bytes), "utf-8", 2)).toEqual({ text: "a", whole: false });
        const euro = bytesOf("a€b"); // 61 E2 82 AC 62
        expect((await text.startOfText(blobOf(euro), "utf-8", 3)).text).toBe("a");
        expect((await text.startOfText(blobOf(euro), "utf-8", 4)).text).toBe("a€");
        expect((await text.startOfText(blobOf(bytesOf("\u{1f600}x")), "utf-8", 3)).text).toBe("");
        // UTF-16: half a code unit
        expect((await text.startOfText(blobOf(encode("utf-16le", "ab")), "utf-16le", 3)).text).toBe("a");
        expect((await text.startOfText(blobOf(encode("utf-16be", "ab")), "utf-16be", 1)).text).toBe("");
    });

    test("startOfText throws when the bytes do not fit the encoding", async () => {
        const { text } = await modules();
        await expect(text.startOfText(blobOf([0x61, 0xe9, 0x62]), "utf-8", 100)).rejects.toThrow();
        // a bad byte inside the limit, though the file goes on
        await expect(text.startOfText(blobOf([0x61, 0xff, 0x62, 0x63]), "utf-8", 3)).rejects.toThrow();
        // a whole file that ends inside a character
        await expect(text.startOfText(blobOf([0x61, 0xe2, 0x82]), "utf-8", 100)).rejects.toThrow();
        await expect(text.startOfText(blobOf([0x61, 0x00, 0x62]), "utf-16le", 100)).rejects.toThrow();
        await expect(text.startOfText(blobOf([0x00, 0xd8]), "utf-16le", 100)).rejects.toThrow();
    });

    test("startOfText leaves the byte-order mark out of the text", async () => {
        const { text } = await modules();
        for (const encoding of ["utf-8", "utf-16le", "utf-16be"]) {
            const got = await text.startOfText(blobOf(encode(encoding, "id,name\n", { bom: true })), encoding, 100);
            expect(got.text, encoding).toBe("id,name\n");
        }
    });

    const SAMPLE = "id,name\r\nA1,café €5\r\nB2,日本 \u{1f600}\r\n,£,\n";

    test("the pieces joined are the text, for slice sizes from 1 byte up, in every encoding", async () => {
        const { text } = await modules();
        const windows = [0x69, 0x64, 0x2c, 0xa3, 0xe9, 0x80, 0x93, 0x94, 0x0d, 0x0a, 0x78, 0x2c, 0x79, 0x0d, 0x0a];
        const cases = [
            ["utf-8", encode("utf-8", SAMPLE), SAMPLE],
            ["utf-8", encode("utf-8", SAMPLE, { bom: true }), SAMPLE],
            ["utf-16le", encode("utf-16le", SAMPLE, { bom: true }), SAMPLE],
            ["utf-16le", encode("utf-16le", SAMPLE), SAMPLE],
            ["utf-16be", encode("utf-16be", SAMPLE, { bom: true }), SAMPLE],
            ["utf-16be", encode("utf-16be", SAMPLE), SAMPLE],
            ["windows-1252", windows, "id,£é€“”\r\nx,y\r\n"],
        ];
        const wrong = [];
        for (const [encoding, bytes, want] of cases) {
            for (const sliceBytes of [1, 2, 3, 4, 5, 6, 7, 8, 11, 64, 1024 * 1024]) {
                const got = (await collect(text.textPieces(blobOf(bytes), encoding, { sliceBytes }))).join("");
                if (got !== want) {
                    wrong.push(`${encoding}, slice ${sliceBytes}: ${JSON.stringify(got).slice(0, 80)}`);
                }
            }
        }
        expect(wrong).toEqual([]);
    });

    test("no piece ends on a carriage return, however the slices fall on a CRLF", async () => {
        const { text } = await modules();
        const body = "a,b\r\n1,2\r\n3,4\r\n5,6\r\n7,8\r\n";
        const bytes = encode("utf-8", body);
        const wrong = [];
        for (let sliceBytes = 1; sliceBytes <= body.length + 1; sliceBytes++) {
            const pieces = await collect(text.textPieces(blobOf(bytes), "utf-8", { sliceBytes }));
            if (pieces.join("") !== body) {
                wrong.push(`slice ${sliceBytes}: the pieces do not make the text`);
            }
            pieces.forEach((piece, i) => piece.endsWith("\r") && wrong.push(`slice ${sliceBytes}: piece ${i} ends on a carriage return`));
        }
        expect(wrong).toEqual([]);
    });

    test("no piece ends on a carriage return in UTF-16 either, and a bare carriage return line ending is kept", async () => {
        const { text } = await modules();
        const body = "a\tb\r\n1\t2\r\n3\t4\r\n";
        for (const encoding of ["utf-16le", "utf-16be"]) {
            for (let sliceBytes = 1; sliceBytes <= 12; sliceBytes++) {
                const pieces = await collect(text.textPieces(blobOf(encode(encoding, body, { bom: true })), encoding, { sliceBytes }));
                expect(pieces.join(""), `${encoding} ${sliceBytes}`).toBe(body);
                expect(pieces.some((piece) => piece.endsWith("\r")), `${encoding} ${sliceBytes}`).toBe(false);
            }
        }
        const old = "a,b\r1,2\r3,4";
        for (let sliceBytes = 1; sliceBytes <= 6; sliceBytes++) {
            const pieces = await collect(text.textPieces(blobOf(encode("utf-8", old)), "utf-8", { sliceBytes }));
            expect(pieces.join(""), `slice ${sliceBytes}`).toBe(old);
        }
    });

    test("the byte-order mark is not in the text, however it is cut", async () => {
        const { text } = await modules();
        for (const encoding of ["utf-8", "utf-16le", "utf-16be"]) {
            for (const sliceBytes of [1, 2, 3, 100]) {
                const joined = (await collect(text.textPieces(blobOf(encode(encoding, "id,name\n", { bom: true })), encoding, { sliceBytes }))).join("");
                expect(joined, `${encoding} slice ${sliceBytes}`).toBe("id,name\n");
                expect(joined.includes("﻿"), `${encoding} slice ${sliceBytes}`).toBe(false);
            }
        }
    });

    test("an empty file has no pieces", async () => {
        const { text } = await modules();
        expect(await collect(text.textPieces(blobOf([]), "utf-8"))).toEqual([]);
    });

    test("a file that ends inside a character throws, at any slice size", async () => {
        const { text } = await modules();
        for (const sliceBytes of [1, 2, 100]) {
            await expect(collect(text.textPieces(blobOf([0x61, 0xe2, 0x82]), "utf-8", { sliceBytes })), `utf-8 slice ${sliceBytes}`).rejects.toThrow();
        }
        await expect(collect(text.textPieces(blobOf([0x61, 0x00, 0x62]), "utf-16le", { sliceBytes: 1 }))).rejects.toThrow();
        await expect(collect(text.textPieces(blobOf([0x00, 0xd8]), "utf-16le", { sliceBytes: 1 }))).rejects.toThrow();
    });

    test("bytes that do not fit the encoding throw, wherever they are", async () => {
        const { text } = await modules();
        for (const sliceBytes of [1, 2, 100]) {
            await expect(collect(text.textPieces(blobOf([0x61, 0xff, 0x62]), "utf-8", { sliceBytes })), `slice ${sliceBytes}`).rejects.toThrow();
            await expect(collect(text.textPieces(blobOf([0x61, 0x62, 0x63, 0xe9, 0x64]), "utf-8", { sliceBytes })), `slice ${sliceBytes}`).rejects.toThrow();
        }
    });

    test("between is called after each slice with the bytes read so far, and what it throws stops the reading", async () => {
        const { text } = await modules();
        const calls = [];
        await collect(text.textPieces(blobOf(bytesOf("0123456789")), "utf-8", { sliceBytes: 4, between: async (read) => calls.push(read) }));
        expect(calls).toEqual([4, 8, 10]);

        const seen = [];
        const stop = new Error("stop");
        await expect(
            collect(
                text.textPieces(blobOf(bytesOf("0123456789")), "utf-8", {
                    sliceBytes: 4,
                    between: async (read) => {
                        seen.push(read);
                        throw stop;
                    },
                })
            )
        ).rejects.toBe(stop);
        expect(seen).toEqual([4]);
    });
});

// ---- text: a mark of the start of a text, to know it again -----------------------------------------------

test.describe("import text: markOf and sameStart", () => {
    test.beforeEach(skipUnlessFirst);

    const START = "id,name\r\n1,café €5\r\n2,日本 \u{1f600}\r\n";
    const LONGER = `${START}3,more\r\n4,and more\r\n`;

    test("the same text, in pieces of any size, passes and comes out unchanged, whole or marked by its start", async () => {
        const { text } = await modules();
        const wrong = [];
        for (const marked of [START, START.slice(0, 5), START.slice(0, 1), ""]) {
            const mark = text.markOf(marked);
            for (const full of [START, LONGER]) {
                for (let n = 1; n <= full.length + 1; n++) {
                    const pieces = cutInto(full, n);
                    try {
                        const got = await collect(text.sameStart(asyncPieces(pieces), mark));
                        if (!same(got, pieces)) {
                            wrong.push(`marked ${marked.length}, text ${full.length}, pieces of ${n}: the pieces changed`);
                        }
                    } catch (error) {
                        wrong.push(`marked ${marked.length}, text ${full.length}, pieces of ${n}: threw ${error?.name}`);
                    }
                }
            }
        }
        expect(wrong).toEqual([]);
    });

    test("a mark is the text's length and a number that depends on every character", async () => {
        const { text } = await modules();
        const mark = text.markOf("abc");
        expect(mark.length).toBe(3);
        expect(Number.isInteger(mark.hash)).toBe(true);
        expect(text.markOf("abc")).toEqual(mark);
        expect(text.markOf("abd").hash).not.toBe(mark.hash);
        expect(text.markOf("bac").hash).not.toBe(mark.hash);
        expect(text.markOf("abc ").length).toBe(4);
        expect(text.markOf("").length).toBe(0);
        expect(text.markOf("\u{1f600}").length).toBe(2);
    });

    test("one character changed inside the marked start throws TextChanged, at the piece where the start ends and not later", async () => {
        const { text } = await modules();
        const marked = START.slice(0, 20);
        const mark = text.markOf(marked);
        const wrong = [];
        for (const at of [0, 7, 10, 19]) {
            const changed = LONGER.slice(0, at) + (LONGER[at] === "x" ? "y" : "x") + LONGER.slice(at + 1);
            for (const n of [1, 2, 3, 5, 7, 20, 21, 64]) {
                const pieces = cutInto(changed, n);
                // the piece in which the 20th character is
                let ends = 0;
                let upTo = 0;
                while ((upTo += pieces[ends].length) < marked.length) {
                    ends++;
                }
                const log = [];
                const got = [];
                let error = null;
                try {
                    for await (const piece of text.sameStart(asyncPieces(pieces, log), mark)) {
                        got.push(piece);
                    }
                } catch (thrown) {
                    error = thrown;
                }
                if (!(error instanceof text.TextChanged)) {
                    wrong.push(`change at ${at}, pieces of ${n}: threw ${error?.name ?? "nothing"}`);
                } else if (log.length !== ends + 1 || got.length !== ends) {
                    wrong.push(`change at ${at}, pieces of ${n}: asked for ${log.length} pieces and passed ${got.length}, wanted ${ends + 1} and ${ends}`);
                }
            }
        }
        expect(wrong).toEqual([]);
    });

    test("a character changed after the marked start is not looked at: the text passes", async () => {
        const { text } = await modules();
        const mark = text.markOf(START.slice(0, 12));
        const changed = START.slice(0, 12) + "COMPLETELY DIFFERENT\r\n";
        for (const n of [1, 5, 12, 13, 64]) {
            expect((await collect(text.sameStart(asyncPieces(cutInto(changed, n)), mark))).join(""), `pieces of ${n}`).toBe(changed);
        }
    });

    test("a text shorter than the mark throws at its end, after every piece has been passed on; no text at all throws too", async () => {
        const { text } = await modules();
        const mark = text.markOf(START);
        const short = START.slice(0, START.length - 1);
        for (const n of [1, 4, short.length]) {
            const pieces = cutInto(short, n);
            const got = [];
            let error = null;
            try {
                for await (const piece of text.sameStart(asyncPieces(pieces), mark)) {
                    got.push(piece);
                }
            } catch (thrown) {
                error = thrown;
            }
            expect(error, `pieces of ${n}`).toBeInstanceOf(text.TextChanged);
            expect(got, `pieces of ${n}: what came before was passed on`).toEqual(pieces);
        }
        await expect(collect(text.sameStart(asyncPieces([]), mark))).rejects.toBeInstanceOf(text.TextChanged);
        // an empty mark is a start every text has, an empty one included
        expect(await collect(text.sameStart(asyncPieces([]), text.markOf("")))).toEqual([]);
    });

    test("a text that is longer than the mark's, with the same start, passes", async () => {
        const { text } = await modules();
        const mark = text.markOf(START);
        const wrong = [];
        for (let n = 1; n <= LONGER.length + 1; n++) {
            const got = (await collect(text.sameStart(asyncPieces(cutInto(LONGER, n)), mark))).join("");
            if (got !== LONGER) {
                wrong.push(`pieces of ${n}`);
            }
        }
        expect(wrong).toEqual([]);
    });

    // the preview reads the first bytes, and a character that the limit cuts is left out: what the
    // dialog marks is a prefix of what the import reads, for any encoding and any size of slice
    const MULTIBYTE = "id,name\r\n1,café €5\r\n2,日本 \u{1f600}\r\n3,end\r\n";
    const CASES = [
        ["utf-8", encode("utf-8", MULTIBYTE)],
        ["utf-8", encode("utf-8", MULTIBYTE, { bom: true })],
        ["utf-16le", encode("utf-16le", MULTIBYTE, { bom: true })],
        ["utf-16be", encode("utf-16be", MULTIBYTE, { bom: true })],
        ["utf-16le", encode("utf-16le", MULTIBYTE)],
        ["windows-1252", [0x69, 0x64, 0x2c, 0x6e, 0x0d, 0x0a, 0x31, 0x2c, 0xe9, 0x80, 0x93, 0x94, 0xa3, 0x0d, 0x0a, 0x32, 0x2c, 0x7a, 0x0d, 0x0a]],
    ];

    test("for each of the four encodings, the mark of the preview's text (a character cut by its limit) is accepted by the import's pieces, at several slice sizes", async () => {
        const { text } = await modules();
        const wrong = [];
        let sawCut = 0;
        for (const [encoding, bytes] of CASES) {
            const blob = blobOf(bytes);
            let previous = null;
            for (let limit = 1; limit <= bytes.length; limit++) {
                const start = await text.startOfText(blob, encoding, limit);
                const mark = text.markOf(start.text);
                const whole = (await collect(text.textPieces(blob, encoding, {}))).join("");
                if (start.whole === false && !whole.startsWith(start.text)) {
                    wrong.push(`${encoding}, limit ${limit}: the preview's text is not a prefix`);
                }
                // a limit in the middle of a character (or of a byte-order mark) adds no character to the text
                if (limit > 4 && start.text === previous) {
                    sawCut++;
                }
                previous = start.text;
                for (const sliceBytes of [1, 2, 3, 5, 7, 64]) {
                    try {
                        const got = (await collect(text.sameStart(text.textPieces(blob, encoding, { sliceBytes }), mark))).join("");
                        if (got !== whole) {
                            wrong.push(`${encoding}, limit ${limit}, slice ${sliceBytes}: the text changed`);
                        }
                    } catch (error) {
                        wrong.push(`${encoding}, limit ${limit}, slice ${sliceBytes}: threw ${error?.name}`);
                    }
                }
            }
        }
        expect(wrong).toEqual([]);
        // the limits do fall inside characters of several bytes, in this set
        expect(sawCut).toBeGreaterThan(10);
    });

    test("a file saved again with one different byte after the preview was read is not the file the preview showed", async () => {
        const { text } = await modules();
        const bytes = encode("utf-8", MULTIBYTE);
        const start = await text.startOfText(blobOf(bytes), "utf-8", 30);
        const mark = text.markOf(start.text);
        // the same length, one letter different, inside the marked start
        const changed = bytes.slice();
        changed[2] = 0x58;
        for (const sliceBytes of [1, 4, 64]) {
            await expect(collect(text.sameStart(text.textPieces(blobOf(changed), "utf-8", { sliceBytes }), mark)), `slice ${sliceBytes}`).rejects.toBeInstanceOf(text.TextChanged);
        }
        // a different file, longer, changed only after the start: the same start, as far as the mark knows
        const later = bytes.slice();
        later[bytes.length - 3] = 0x58;
        expect((await collect(text.sameStart(text.textPieces(blobOf(later), "utf-8", { sliceBytes: 4 }), mark))).length).toBeGreaterThan(0);
    });
});

// ---- csv: the preview's reading -----------------------------------------------------------------------------------

test.describe("import csv: readStart, the preview's reading of the start of a file", () => {
    test.beforeEach(skipUnlessFirst);

    test("each of the four delimiters is found", async () => {
        const { csv } = await modules();
        for (const { value, name } of csv.DELIMITERS) {
            const text = ["id", "name", "qty"].join(value) + "\n" + ["1", "Mug", "4"].join(value) + "\n" + ["2", "Plate", "2"].join(value) + "\n";
            const got = csv.readStart(Papa, text, { whole: true });
            expect(got.delimiter, name).toBe(value);
            expect(got.guessed, name).toBe(true);
            expect(got.rows, name).toEqual([["id", "name", "qty"], ["1", "Mug", "4"], ["2", "Plate", "2"]]);
        }
        expect(csv.DELIMITERS.map((d) => d.name)).toEqual(["comma", "semicolon", "tab", "pipe"]);
        expect(csv.DELIMITERS.map((d) => d.value)).toEqual([",", ";", "\t", "|"]);
    });

    test("a file of one column gives comma, and says it did not guess", async () => {
        const { csv } = await modules();
        const got = csv.readStart(Papa, "name\nalice\nbob\ncarol\n", { whole: true });
        expect(got.delimiter).toBe(",");
        expect(got.guessed).toBe(false);
        expect(got.rows).toEqual([["name"], ["alice"], ["bob"], ["carol"]]);
    });

    // Plan section 3, Delimiter: "Papa Parse's own guess, limited to these four (delimitersToGuess)".
    // Papa's own default list has two more, the unit separator U+001F and the record separator U+001E,
    // which the dialog's select cannot show: a text split by either is a file of one column, and
    // readStart says so with the comma and `guessed` false. (Papa with its default list finds the
    // character and answers with it, so the answer fails both with the two added to delimitersToGuess
    // and with the option taken out.)
    for (const [name, character] of [
        ["the unit separator U+001F", "\u001f"],
        ["the record separator U+001E", "\u001e"],
    ]) {
        test(`a text whose fields are separated by ${name} is one column wide, with the comma and no guess`, async () => {
            const { csv } = await modules();
            const lines = ["id,a", "1,x", "2,y", "3,z"].map((line) => line.split(",").join(character));
            const text = `${lines.join("\n")}\n`;
            // the premise: Papa, left to its own list, does take the character for the delimiter
            expect(Papa.parse(text, { skipEmptyLines: true }).meta.delimiter).toBe(character);
            const got = csv.readStart(Papa, text, { whole: true });
            expect(got.delimiter).toBe(",");
            expect(got.guessed).toBe(false);
            expect(got.rows).toEqual(lines.map((line) => [line]));
        });
    }

    test("the line ending found is given: CRLF, LF or CR", async () => {
        const { csv } = await modules();
        expect(csv.readStart(Papa, "a,b\r\n1,2\r\n3,4\r\n", { whole: true }).newline).toBe("\r\n");
        expect(csv.readStart(Papa, "a,b\n1,2\n3,4\n", { whole: true }).newline).toBe("\n");
        expect(csv.readStart(Papa, "a,b\r1,2\r3,4\r", { whole: true }).newline).toBe("\r");
        expect(csv.readStart(Papa, "a,b\r1,2\r3,4\r", { whole: true }).rows).toEqual([["a", "b"], ["1", "2"], ["3", "4"]]);
    });

    test("when the text is not the whole file its last row, which may be cut short, is left out", async () => {
        const { csv } = await modules();
        const text = "a,b\n1,2\n3,4\n5";
        expect(csv.readStart(Papa, text, { whole: true }).rows).toEqual([["a", "b"], ["1", "2"], ["3", "4"], ["5"]]);
        expect(csv.readStart(Papa, text, { whole: false }).rows).toEqual([["a", "b"], ["1", "2"], ["3", "4"]]);
    });

    test("a delimiter that is given is used, not guessed", async () => {
        const { csv } = await modules();
        const text = "a;b,c\n1;2,3\n";
        const got = csv.readStart(Papa, text, { whole: true, delimiter: ";" });
        expect(got.delimiter).toBe(";");
        expect(got.rows).toEqual([["a", "b,c"], ["1", "2,3"]]);
        // commas lead in a guess, the student's pipe wins
        expect(csv.readStart(Papa, "a,b|c,d\n1,2|3,4\n", { whole: true, delimiter: "|" }).rows).toEqual([["a,b", "c,d"], ["1,2", "3,4"]]);
    });

    test("empty lines are skipped, a line of delimiters is a row, a line of spaces is a row", async () => {
        const { csv } = await modules();
        expect(csv.readStart(Papa, "a,b\n\n1,2\n\n\n", { whole: true }).rows).toEqual([["a", "b"], ["1", "2"]]);
        expect(csv.readStart(Papa, "a,b\n,\n1,2\n", { whole: true }).rows).toEqual([["a", "b"], ["", ""], ["1", "2"]]);
        expect(csv.readStart(Papa, "   \n", { whole: true }).rows).toEqual([["   "]]);
    });

    test("a text of nothing but empty lines has no rows", async () => {
        const { csv } = await modules();
        expect(csv.readStart(Papa, "", { whole: true }).rows).toEqual([]);
        expect(csv.readStart(Papa, "\n\n\n", { whole: true }).rows).toEqual([]);
        expect(csv.readStart(Papa, "\r\n\r\n\r\n", { whole: true }).rows).toEqual([]);
    });
});

// ---- csv: the line ending, found by the module and not by Papa ----------------------------------

test.describe("import csv: lineEnding, the line ending of a text outside its quoted fields", () => {
    test.beforeEach(skipUnlessFirst);

    const ALL = [",", ";", "\t", "|"];
    const readStartOf = async (text, options = {}) => {
        const { csv } = await modules();
        return csv.readStart(Papa, text, { whole: true, ...options });
    };
    const noReturnLeft = (rows) => !JSON.stringify(rows).includes("\\r");

    // Papa pairs every quote with the next one: the lone quote of an inch mark in the heading puts
    // every pair of quotes below it out of step, the line breaks between the rows then count as
    // inside a quoted field, and Papa guessed "\n" for a Windows file (every row then kept a "\r")
    const HEADING = 'Name,Height (in")';
    const BODY = ['"Smith, J",72', '"Lee, K",70', '"Wu, P",68'];
    const TABLE = [["Smith, J", 72], ["Lee, K", 70], ["Wu, P", 68]];

    for (const [label, ending] of [["Windows line endings", "\r\n"], ["carriage returns alone", "\r"]]) {
        for (const [finalLabel, final] of [["no final line break", ""], ["a final line break", ending]]) {
            test(`a lone quote in the heading, quoted fields below, ${label}, ${finalLabel}: ${JSON.stringify(ending)}, no cell keeps a carriage return, the number column is INTEGER, at every slice size`, async () => {
                const text = [HEADING, ...BODY].join(ending) + final;
                const start = await readStartOf(text);
                expect(start.newline).toBe(ending);
                expect(start.rows).toEqual([["Name", 'Height (in")'], ["Smith, J", "72"], ["Lee, K", "70"], ["Wu, P", "68"]]);
                expect(noReturnLeft(start.rows)).toBe(true);

                // the whole read, a slice of 1 byte up to one larger than the file
                const bytes = Uint8Array.from(bytesOf(text));
                const wrong = [];
                for (let sliceBytes = 1; sliceBytes <= bytes.length + 1; sliceBytes++) {
                    const got = await readText("inch.csv", bytes, { sliceBytes });
                    if (got.refused || got.newline !== ending) {
                        wrong.push(`slice ${sliceBytes}: ${got.refused ?? JSON.stringify(got.newline)}`);
                        continue;
                    }
                    const columns = got.table.columns.map((c) => `${c.name}:${c.type}`).join(" ");
                    if (columns !== "Name:TEXT Height_in_:INTEGER" || !same(got.data, TABLE) || got.table.rows !== 3 || got.badQuotes) {
                        wrong.push(`slice ${sliceBytes}: ${columns} ${JSON.stringify(got.data)}`);
                    }
                }
                expect(wrong).toEqual([]);
            });
        }
    }

    test("a Windows file whose quoted cells hold bare line feeds, more of them than there are rows (what Excel writes): CRLF, and the cells keep their line feeds", async () => {
        const cells = ['1 High St\nTown\nCounty\nUK', '2 Low St\nCity\nShire\nUK', "3 Mid St\nVillage\nUK"];
        // (with and without the lone quote of an inch mark in the heading that puts Papa's pairing out of step)
        for (const heading of ["id,address", 'id,address (in")']) {
            const text = `${heading}\r\n` + cells.map((cell, i) => `${i + 1},"${cell}"`).join("\r\n") + "\r\n";
            expect((await readStartOf(text)).newline, heading).toBe("\r\n");
            const wrong = [];
            for (const sliceBytes of [1, 2, 3, 5, 7, 64, null]) {
                const got = await readText("excel.csv", Uint8Array.from(bytesOf(text)), { sliceBytes });
                if (got.refused || got.newline !== "\r\n" || !same(got.data, cells.map((cell, i) => [i + 1, cell]))) {
                    wrong.push(`slice ${sliceBytes}: ${got.refused ?? JSON.stringify(got.data).slice(0, 120)}`);
                }
            }
            expect(wrong, heading).toEqual([]);
        }
    });

    test("quoted line breaks are not the file's line ending, whatever their number: a file of line feeds with carriage returns inside quotes is LF, and the reverse", async () => {
        const { csv } = await modules();
        const lf = 'id,note\n1,"a\r\nb\r\nc\r\nd"\n2,"x\r\ny"\n';
        expect(csv.lineEnding(lf, [","])).toBe("\n");
        expect((await readStartOf(lf)).rows).toEqual([["id", "note"], ["1", "a\r\nb\r\nc\r\nd"], ["2", "x\r\ny"]]);
        const crlf = 'id,note\r\n1,"a\nb\nc\nd"\r\n2,"x\ny"\r\n';
        expect(csv.lineEnding(crlf, [","])).toBe("\r\n");
        expect((await readStartOf(crlf)).rows).toEqual([["id", "note"], ["1", "a\nb\nc\nd"], ["2", "x\ny"]]);
    });

    // The test above passes under Papa's own guess and under a lineEnding that does not look at quotes
    // at all, so it pins nothing about them (found by taking outsideQuotes out). Here the quoted line
    // breaks stand BEFORE the first real one and are more than the real ones: a lineEnding that does
    // not leave them out takes the first of them (a carriage return before the first line feed, or a
    // line feed before the first carriage return) and counts pairs among them.
    test("quoted line breaks that come before the first real break and outnumber the real ones are not the file's line ending: a file of line feeds, and a Windows file", async () => {
        const { csv } = await modules();
        const lf = '"a\r\nb\r\nc",x\n1,2\n';
        expect(csv.lineEnding(lf, [","])).toBe("\n");
        expect((await readStartOf(lf)).newline).toBe("\n");
        expect((await readStartOf(lf)).rows).toEqual([["a\r\nb\r\nc", "x"], ["1", "2"]]);
        const crlf = '"a\nb\nc",x\r\n1,2\r\n';
        expect(csv.lineEnding(crlf, [","])).toBe("\r\n");
        expect((await readStartOf(crlf)).newline).toBe("\r\n");
        expect((await readStartOf(crlf)).rows).toEqual([["a\nb\nc", "x"], ["1", "2"]]);
        // and a file of carriage returns alone with line feeds inside the quotes, in front of the first real break
        const cr = '"a\nb\nc",x\r1,2\r';
        expect(csv.lineEnding(cr, [","])).toBe("\r");
        expect((await readStartOf(cr)).rows).toEqual([["a\nb\nc", "x"], ["1", "2"]]);
        // the whole read, at every size of piece, agrees (and no cell keeps a carriage return the file did not put there)
        const wrong = [];
        for (const [text, ending, rows] of [
            [lf, "\n", [["a\r\nb\r\nc", "x"], ["1", "2"]]],
            [crlf, "\r\n", [["a\nb\nc", "x"], ["1", "2"]]],
            [cr, "\r", [["a\nb\nc", "x"], ["1", "2"]]],
        ]) {
            for (let sliceBytes = 1; sliceBytes <= text.length + 1; sliceBytes++) {
                const got = await readText("quoted.csv", Uint8Array.from(bytesOf(text)), { sliceBytes, hasNames: true });
                if (got.refused || got.newline !== ending || got.badQuotes || got.table.rows !== 1) {
                    wrong.push(`${JSON.stringify(text)}, slice ${sliceBytes}: ${got.refused ?? JSON.stringify(got.newline)}`);
                }
            }
            if (!same((await rowsFromBytes(bytesOf(text), 3, { newline: ending })).rows, rows)) {
                wrong.push(`${JSON.stringify(text)}: rows`);
            }
        }
        expect(wrong).toEqual([]);
    });

    test("a quoted field that is never closed takes the rest of the text, so only what stands before it counts", async () => {
        const { csv } = await modules();
        // Papa counts every carriage return, the three bare ones after the open quote included, and says "\r"
        const open = 'a,b\r\n1,"open\r2,3\r4,5\r6,7';
        expect(Papa.parse(open, { delimiter: "," }).meta.linebreak).toBe("\r");
        expect(csv.lineEnding(open, [","])).toBe("\r\n");
        expect((await readStartOf(open)).newline).toBe("\r\n");
        // nothing before the quote that holds a line break: the default
        expect(csv.lineEnding('"never\r\nclosed\r\n', [","])).toBe("\n");
        // a quote that is followed by text and not by the end of a field closes nothing, as the reader takes it
        const text = '"a"b,c\r\n1,2\r\n';
        expect(csv.lineEnding(text, [","])).toBe("\n");
        expect((await readStartOf(text)).rows).toEqual([['a"b,c\r\n1,2\r\n']]);
    });

    test("a quote closes its field when spaces or tabs and then a delimiter, a line break or the end follow it", async () => {
        const { csv } = await modules();
        // each text is CRLF outside its quoted fields; were the closing quote not found, the rest of the
        // text would be one field and the answer the default, "\n"
        const texts = [
            ['"a" ,b\r\n"c"\t,d\r\ne,f\r\n', "spaces and a tab, then the delimiter"],
            ['"a"  \r\n"c"\t\r\ne\r\n', "spaces and a tab, then the line break"],
            ['x,"a" \r\ny,"b"\t \t\r\nz,"c"', "a mix, then the line break, and the end of the text"],
            ['"a\nb"   ,1\r\n"c\nd"\t,2\r\n', "bare line feeds inside, spaces and a tab after"],
        ];
        for (const [text, why] of texts) {
            expect(csv.lineEnding(text, [","]), why).toBe("\r\n");
            expect((await readStartOf(text)).newline, why).toBe("\r\n");
        }
        // a quote inside the field (doubled) closes nothing
        expect(csv.lineEnding('"say ""hi"" \n"\r\nb\r\n', [","])).toBe("\r\n");
    });

    // Everything that String.trim takes off, one character each.
    // Papa closes a quoted field when what stands between the quote and the next delimiter or line
    // break trims to nothing, so any of these may follow a closing quote, not the space and the tab alone.
    const SPACES = [
        ["a no-break space", "\u00a0"],
        ["a form feed", "\f"],
        ["a vertical tab", "\v"],
        ["a line separator, U+2028", "\u2028"],
        ["an ideographic space, U+3000", "\u3000"],
        ["a byte-order mark, U+FEFF", "\ufeff"],
        ["a thin space, U+2009", "\u2009"],
    ];
    const ENDINGS = [["Windows line endings", "\r\n"], ["carriage returns alone", "\r"], ["line feeds", "\n"]];
    // where the white space stands: before the delimiter, and before a line break
    const PLACES = [
        ["before the delimiter", (s, E) => `"name"${s},qty${E}"Ann"${s},5${E}"Bob"${s},7${E}"Cy"${s},12${E}`],
        ["before the line break", (s, E) => `name,"qty"${s}${E}Ann,"5"${s}${E}Bob,"7"${s}${E}Cy,"12"${s}${E}`],
        // (the last row has no line break, and no white space either: Papa itself calls a quote that only white space follows, at the very end of a text, unpaired)
        ["before the line break, in a text that does not end with one", (s, E) => `name,"qty"${s}${E}Ann,"5"${s}${E}Bob,"7"${s}${E}Cy,"12"`],
    ];
    const WITH_SPACES_ROWS = [["name", "qty"], ["Ann", "5"], ["Bob", "7"], ["Cy", "12"]];

    test("a quote closes its field when white space of any kind (no-break space, form feed, vertical tab, U+2028, U+3000, U+FEFF, U+2009) and then a delimiter or a line break follow it: the file's own line ending, clean rows", async () => {
        const { csv } = await modules();
        const wrong = [];
        for (const [what, space] of SPACES) {
            for (const [label, ending] of ENDINGS) {
                for (const [where, make] of PLACES) {
                    const text = make(space, ending);
                    const why = `${what}, ${label}, ${where}`;
                    // (were the closing quote not found, the rest of the text would be one field, the answer the default "\n", and a Windows file would be read with "\r" at the end of every row)
                    if (csv.lineEnding(text, [","]) !== ending) {
                        wrong.push(`${why}: lineEnding ${JSON.stringify(csv.lineEnding(text, [","]))}`);
                    }
                    const start = await readStartOf(text);
                    if (start.newline !== ending || !same(start.rows, WITH_SPACES_ROWS)) {
                        wrong.push(`${why}: readStart ${JSON.stringify(start.newline)} ${JSON.stringify(start.rows).slice(0, 90)}`);
                    }
                    // with the delimiter chosen by hand: the same
                    const chosen = await readStartOf(text, { delimiter: "," });
                    if (chosen.newline !== ending || !same(chosen.rows, WITH_SPACES_ROWS)) {
                        wrong.push(`${why}: readStart with the comma chosen ${JSON.stringify(chosen.newline)}`);
                    }
                }
            }
        }
        expect(wrong).toEqual([]);
    });

    test("white space of any kind after a closing quote, through the whole read at every size of piece: no cell keeps a carriage return, the number column is INTEGER, no quote is called unpaired", async () => {
        const wrong = [];
        for (const [what, space] of SPACES) {
            for (const [label, ending] of ENDINGS) {
                for (const [where, make] of PLACES) {
                    const text = make(space, ending);
                    const why = `${what}, ${label}, ${where}`;
                    const bytes = Uint8Array.from(bytesOf(text));
                    // bytes, kind, encoding, preview, pieces, rows, table (the characters of 2 and 3 bytes are cut in every way)
                    for (const sliceBytes of [1, 2, 3, 5, 7, 64, null]) {
                        const got = await readText("spaces.csv", bytes, { sliceBytes });
                        if (got.refused || got.newline !== ending) {
                            wrong.push(`${why}, slice ${sliceBytes}: ${got.refused ?? JSON.stringify(got.newline)}`);
                            continue;
                        }
                        const columns = got.table.columns.map((c) => `${c.name}:${c.type}`).join(" ");
                        if (columns !== "name:TEXT qty:INTEGER" || !same(got.data, [["Ann", 5], ["Bob", 7], ["Cy", 12]]) || got.table.rows !== 3 || got.badQuotes) {
                            wrong.push(`${why}, slice ${sliceBytes}: ${columns} ${JSON.stringify(got.data)} badQuotes ${got.badQuotes}`);
                        }
                    }
                    // the pieces alone, in characters, cut between the quote and the white space as well
                    for (let n = 1; n <= text.length + 2; n++) {
                        const got = await rowsFromPieces(cutInto(text, n), { newline: ending });
                        if (!same(got.rows, WITH_SPACES_ROWS) || got.badQuotes || JSON.stringify(got.rows).includes("\\r")) {
                            wrong.push(`${why}, pieces of ${n}: ${JSON.stringify(got.rows).slice(0, 90)} badQuotes ${got.badQuotes}`);
                        }
                    }
                }
            }
        }
        expect(wrong).toEqual([]);
    });

    test("the white space may be several characters of several kinds, and a letter among them still keeps the quote from closing", async () => {
        const { csv } = await modules();
        for (const gap of ["  \t\u3000", " \u00a0\u2028\ufeff \f\v"]) {
            const text = `id,"name"${gap}\r\n1,"Ann"${gap},x\r\n2,Bob\r\n`;
            expect(csv.lineEnding(text, [","]), JSON.stringify(gap)).toBe("\r\n");
        }
        // a quote followed by white space and then a letter closes nothing: the rest of the text is one field, and only what stands before it counts
        expect(csv.lineEnding('id,note\r\n1,"Ann"\u00a0x\r\n2,Bob\r\n', [","])).toBe("\r\n");
        expect(csv.lineEnding('"Ann"\u00a0x\r\n2,Bob\r\n', [","])).toBe("\n");
    });

    test("a quote opens a field only at the start of one: after text, in the middle of a field, it is a character", async () => {
        const { csv } = await modules();
        // the quotes are inch marks: were they read as opening a field, the line breaks after them would be lost
        expect(csv.lineEnding('3" bolt,5\r\n4" nut,6\r\n', [","])).toBe("\r\n");
        expect(csv.lineEnding('a,b"c\r\nd,e\r\n', [","])).toBe("\r\n");
        // after a delimiter, after a line break and at the start of the text it does open one
        expect(csv.lineEnding('a,"b\nc"\r\nd,e\r\n', [","])).toBe("\r\n");
        expect(csv.lineEnding('x\n"a\r\nb\r\nc"\n', [","])).toBe("\n");
        expect(csv.lineEnding('"a\r\nb\r\nc"\n', [","])).toBe("\n");
    });

    test("a quote that follows one of the other three candidate delimiters opens no field: the answer is the chosen delimiter's, as the student would get it by choosing it", async () => {
        const { csv } = await modules();
        // the delimiter is guessed; the stray quote follows a character that is a delimiter only for another candidate
        const cases = [
            [";", 'id;note\r\n1;a\r\n2;b\r\n4;5,"x\r5;e\r6;f\r7;g\r8;h\r'],
            ["|", 'id|note\r\n1|a\r\n2|b\r\n4|5;"x\r5|e\r6|f\r7|g\r8|h\r'],
            ["\t", 'id\tnote\r\n1\ta\r\n2\tb\r\n4\t5|"x\r5\te\r6\tf\r7\tg\r8\th\r'],
            [",", 'id,note\r\n1,a\r\n2,b\r\n4,5;"x\r5,e\r6,f\r7,g\r8,h\r'],
        ];
        for (const [delimiter, text] of cases) {
            const guessed = await readStartOf(text);
            expect(guessed.delimiter, JSON.stringify(delimiter)).toBe(delimiter);
            expect(guessed.guessed).toBe(true);
            // with the four taken for a delimiter, the quote opens a field that swallows the bare carriage returns
            expect(csv.lineEnding(text, ALL), JSON.stringify(delimiter)).toBe("\r\n");
            expect(csv.lineEnding(text, [delimiter]), JSON.stringify(delimiter)).toBe("\r");
            // the reading is the student's own choice of the same delimiter
            const chosen = await readStartOf(text, { delimiter });
            expect(guessed.newline, JSON.stringify(delimiter)).toBe("\r");
            expect(chosen.newline, JSON.stringify(delimiter)).toBe("\r");
            expect(guessed.rows, JSON.stringify(delimiter)).toEqual(chosen.rows);
        }
    });

    test("Papa's own threshold: two carriage returns with one line feed behind them are carriage returns, three with two are CRLF; a line feed first, or no carriage return, is LF", async () => {
        const { csv } = await modules();
        const cases = [
            ["a,b\r1,2\r\n3,4", "\r"],
            ["a,b\r\n1,2\r\n3,4\r5,6", "\r\n"],
            ["a,b\r\n1,2\r3,4\r5,6", "\r"],
            ["a,b\r\n1,2", "\r\n"],
            ["a,b\r1,2", "\r"],
            ["a,b\n1,2\r\n3,4\r\n", "\n"],
            ["a,b\n1,2\r3,4", "\n"],
            ["a,b\r\n1,2\n3,4\n5,6\n", "\r\n"],
            ["a,b\r1,2\n3,4\n5,6\n", "\r"],
            ["a,b", "\n"],
            ["", "\n"],
        ];
        const wrong = [];
        for (const [text, want] of cases) {
            const got = csv.lineEnding(text, [","]);
            if (got !== want) {
                wrong.push(`${JSON.stringify(text)}: ${JSON.stringify(got)} != ${JSON.stringify(want)}`);
            }
            // the text has no quote: Papa's own answer is the same
            if (text !== "" && Papa.parse(text, { delimiter: "," }).meta.linebreak !== want) {
                wrong.push(`${JSON.stringify(text)}: Papa says ${JSON.stringify(Papa.parse(text, { delimiter: "," }).meta.linebreak)}`);
            }
        }
        expect(wrong).toEqual([]);
    });

    // The boundary of that rule, in a test of its own: Papa counts the pieces the carriage returns cut
    // the text into (one more than the returns) and wants a line feed at the start of at least half of
    // them, so a line feed behind EXACTLY half of the carriage returns is not enough (1 of 2, 2 of 4:
    // the carriage return), and behind one more than half it is (2 of 3, 3 of 4: the pair). The code
    // is `pairs >= (returns + 1) / 2`; `pairs >= returns / 2` would call the half the pair.
    test("a line feed behind exactly half of the carriage returns (1 of 2, 2 of 4) gives the carriage return; behind more than half (2 of 3, 3 of 4) the pair", async () => {
        const { csv } = await modules();
        // the first break is a carriage return, with or without its line feed (a line feed first is LF)
        const cases = [
            ["1 of 2", "a\r\nb\rc", "\r"],
            ["1 of 2, the pair last", "a\rb\r\nc", "\r"],
            ["2 of 4", "a\r\nb\r\nc\rd\re", "\r"],
            ["2 of 4, the pairs last", "a\rb\rc\r\nd\r\ne", "\r"],
            ["2 of 3", "a\r\nb\r\nc\rd", "\r\n"],
            ["2 of 3, the pairs last", "a\rb\r\nc\r\nd", "\r\n"],
            ["3 of 4", "a\r\nb\r\nc\r\nd\re", "\r\n"],
            ["3 of 4, the single first", "a\rb\r\nc\r\nd\r\ne", "\r\n"],
            ["1 of 1", "a\r\nb", "\r\n"],
            ["0 of 1", "a\rb", "\r"],
        ];
        const wrong = [];
        for (const [share, text, want] of cases) {
            for (const delimiters of [[","], [",", ";", "\t", "|"]]) {
                const got = csv.lineEnding(text, delimiters);
                if (got !== want) {
                    wrong.push(`${share}: ${JSON.stringify(text)} gives ${JSON.stringify(got)}, wanted ${JSON.stringify(want)}`);
                }
            }
            // no quote in the text: Papa itself says the same, and so does the preview's reading
            const papa = Papa.parse(text, { delimiter: "," }).meta.linebreak;
            if (papa !== want) {
                wrong.push(`${share}: Papa says ${JSON.stringify(papa)}`);
            }
            const start = csv.readStart(Papa, text, { whole: true, delimiter: "," });
            if (start.newline !== want) {
                wrong.push(`${share}: readStart says ${JSON.stringify(start.newline)}`);
            }
        }
        expect(wrong).toEqual([]);
    });

    // for a few thousand generated texts that are well formed (every field that holds a delimiter, a
    // quote or a line break is quoted, quotes doubled), the answer is Papa's own. `gaps`, when it is
    // given, is what may stand between the closing quote of a field and the end of it (any white
    // space, not the space and the tab alone); a gap that is a tab is
    // the delimiter itself when the delimiter is a tab, and is a space then.
    async function generatedAgainstPapa({ seed, gaps = null }) {
        const { csv } = await modules();
        const random = seeded(seed);
        const pick = (list) => list[Math.floor(random() * list.length)];
        const endings = ["\r\n", "\n", "\r"];
        let checked = 0;
        let gapped = 0;
        const wrong = [];
        const seen = new Set();
        for (let n = 0; n < 4000; n++) {
            const delimiter = pick(csv.DELIMITERS).value;
            const ending = endings[n % 3];
            const words = ["a", "bc", "12", "x y", " ", "", "é", "-3.5", delimiter, '"', 'say "hi"', "\n", "\r", "\r\n", ending, "l1\nl2", "l1\r\nl2"];
            const field = () => {
                let value = "";
                for (let i = Math.floor(random() * 4); i > 0; i--) {
                    value += pick(words);
                }
                if (!(/["\r\n]/.test(value) || value.includes(delimiter))) {
                    return value;
                }
                let gap = gaps ? pick(gaps) : "";
                if (delimiter === "\t") {
                    gap = gap.replaceAll("\t", " ");
                }
                gapped += gap === "" ? 0 : 1;
                return `"${value.replaceAll('"', '""')}"${gap}`;
            };
            const rows = [];
            const width = 1 + Math.floor(random() * 4);
            for (let r = 1 + Math.floor(random() * 6); r > 0; r--) {
                rows.push(Array.from({ length: width }, field).join(delimiter));
            }
            const text = rows.join(ending) + (random() < 0.5 ? ending : "");
            if (text === "") {
                continue;
            }
            checked++;
            const got = csv.lineEnding(text, [delimiter]);
            const papa = Papa.parse(text, { delimiter }).meta.linebreak;
            seen.add(`${JSON.stringify(ending)} -> ${JSON.stringify(papa)}`);
            if (got !== papa) {
                wrong.push(`${JSON.stringify(delimiter)} ${JSON.stringify(text)}: ${JSON.stringify(got)} != Papa ${JSON.stringify(papa)}`);
            }
            if (wrong.length >= 5) {
                break;
            }
        }
        // the texts do give all three answers (a property that always gives one answer would prove nothing)
        const answers = [...new Set([...seen].map((line) => line.split(" -> ")[1]))].sort();
        return { wrong, checked, gapped, answers };
    }

    test("for generated well-formed texts, in every delimiter and line ending, lineEnding is what Papa itself reports", async () => {
        const { wrong, checked, answers } = await generatedAgainstPapa({ seed: 20241115 });
        expect(wrong).toEqual([]);
        expect(checked).toBeGreaterThan(3500);
        expect(answers).toEqual(['"\\n"', '"\\r"', '"\\r\\n"'].sort());
    });

    test("the same with white space of every kind between a closing quote and the end of its field: still what Papa itself reports", async () => {
        const { wrong, checked, gapped, answers } = await generatedAgainstPapa({
            seed: 20261116,
            gaps: ["", "", " ", "\t", "\u00a0", "\f", "\v", "\u2028", "\u3000", "\ufeff", "\u2009", "  ", " \u00a0\t"],
        });
        expect(wrong).toEqual([]);
        expect(checked).toBeGreaterThan(3500);
        // (a property in which no quoted field had such white space after it would prove nothing)
        expect(gapped).toBeGreaterThan(3000);
        expect(answers).toEqual(['"\\n"', '"\\r"', '"\\r\\n"'].sort());
    });
});

// ---- csv: what the preview's reading gives for a text that is cut, and a second mark -----------

test.describe("import csv: readStart on a text that is not whole, and on one that starts with U+FEFF", () => {
    test.beforeEach(skipUnlessFirst);

    test("a text that is not the whole file and holds no complete row has no rows: the first row is cut short, or a quoted field is still open", async () => {
        const { csv } = await modules();
        // (the dialog refuses a file whose first megabyte reads like this, on the first reading: it is
        // the empty list that it looks for)
        for (const text of ["id,na", "id,name", "id", "a very long first field that goes on and on", '"a quoted field that\nis never closed', '1,"never closed\r\nstill', "", "\n\n"]) {
            const got = csv.readStart(Papa, text, { whole: false });
            expect(got.rows, JSON.stringify(text)).toEqual([]);
        }
        // the same text as a whole file is a table: its one row is complete
        expect(csv.readStart(Papa, "id,na", { whole: true }).rows).toEqual([["id", "na"]]);
        // one complete row and a cut one: the cut one is left out and what is left is not empty
        expect(csv.readStart(Papa, "id,name\n1,An", { whole: false }).rows).toEqual([["id", "name"]]);
        expect(csv.readStart(Papa, "id,name\r\n1,An", { whole: false }).rows).toEqual([["id", "name"]]);
    });

    // A text that is not the whole file may end between the two halves of a
    // CRLF, so its last carriage return is not counted for the line ending: with one or two line
    // breaks in the first megabyte, a Windows file was read as a file of carriage returns alone.
    test("a text that is not whole and ends with a carriage return: that one is not counted, so a Windows file stays CRLF and a file of carriage returns alone stays CR", async () => {
        const { csv } = await modules();
        const cut = csv.readStart(Papa, "a,b\r\nc,d\r", { whole: false });
        expect(cut.newline).toBe("\r\n");
        expect(cut.rows).toEqual([["a", "b"]]);
        // a file of carriage returns alone: the last one is the end of a row there, and the answer is the same without counting it
        const alone = csv.readStart(Papa, "a,b\rc,d\re,f\r", { whole: false });
        expect(alone.newline).toBe("\r");
        expect(alone.rows).toEqual([["a", "b"], ["c", "d"]]);
        // with the delimiter chosen too
        expect(csv.readStart(Papa, "a;b\r\nc;d\r", { whole: false, delimiter: ";" }).newline).toBe("\r\n");
        // a longer Windows text whose cut falls after a carriage return: the rows before it are whole rows
        const longer = csv.readStart(Papa, "a,b\r\n1,2\r\n3,4\r", { whole: false });
        expect(longer.newline).toBe("\r\n");
        expect(longer.rows).toEqual([["a", "b"], ["1", "2"]]);
        // the same texts given as whole files are judged as they stand: Papa's own rule counts the last carriage return
        const whole = csv.readStart(Papa, "a,b\r\nc,d\r", { whole: true });
        expect(whole.newline).toBe("\r");
        expect(Papa.parse("a,b\r\nc,d\r", { delimiter: "," }).meta.linebreak).toBe("\r");
        expect(csv.readStart(Papa, "a,b\rc,d\re,f\r", { whole: true }).newline).toBe("\r");
        expect(csv.readStart(Papa, "a,b\rc,d\re,f\r", { whole: true }).rows).toEqual([["a", "b"], ["c", "d"], ["e", "f"]]);
        // a carriage return that is not the last character is counted as ever
        expect(csv.readStart(Papa, "a,b\rc,d\re", { whole: false }).newline).toBe("\r");
    });

    test("startOfText that cuts a Windows file between a carriage return and its line feed: the preview reads CRLF, and the import's pieces read the same rows", async () => {
        const { text, csv } = await modules();
        const body = "a,b\r\n1,2\r\n3,4\r\n5,6\r\n";
        const bytes = Uint8Array.from(bytesOf(body));
        // every limit that ends on a carriage return (a limit is in bytes)
        const limits = [...body].flatMap((c, i) => (c === "\r" ? [i + 1] : []));
        expect(limits.length).toBe(4);
        const wrong = [];
        for (const limit of limits) {
            const start = await text.startOfText(blobOf(bytes), "utf-8", limit);
            if (start.whole || !start.text.endsWith("\r")) {
                wrong.push(`limit ${limit}: the text does not end on a carriage return (${JSON.stringify(start.text)})`);
                continue;
            }
            const preview = csv.readStart(Papa, start.text, { whole: start.whole });
            // (the cut after the first carriage return holds no complete row: the dialog refuses a file like that on its first reading)
            const complete = start.text.split("\r\n").length - 1;
            if (preview.newline !== "\r\n" && complete >= 1) {
                wrong.push(`limit ${limit}: ${JSON.stringify(preview.newline)}`);
            }
            const want = [["a", "b"], ["1", "2"], ["3", "4"], ["5", "6"]].slice(0, complete);
            if (!same(preview.rows, want)) {
                wrong.push(`limit ${limit}: ${JSON.stringify(preview.rows)} != ${JSON.stringify(want)}`);
            }
        }
        expect(wrong).toEqual([]);
        // the whole file, read in pieces with the line ending the preview found
        const start = await text.startOfText(blobOf(bytes), "utf-8", limits[1]);
        const preview = csv.readStart(Papa, start.text, { whole: false });
        const read = await rowsFromBytes(bytes, 3, { newline: preview.newline });
        expect(read.rows).toEqual([["a", "b"], ["1", "2"], ["3", "4"], ["5", "6"]]);
    });

    // A guard on the contract in the module's header, which the test above leans on (the last row of a text that is not whole is left out also when it ends where the text was cut)
    test("guard: a row that ends exactly where a text that is not whole was cut is left out as well, with every line ending", async () => {
        const { csv } = await modules();
        expect(csv.readStart(Papa, "a,b\n", { whole: false }).rows).toEqual([]);
        expect(csv.readStart(Papa, "a,b\n1,2\n", { whole: false }).rows).toEqual([["a", "b"]]);
        expect(csv.readStart(Papa, "a,b\r\n1,2\r\n", { whole: false }).rows).toEqual([["a", "b"]]);
        expect(csv.readStart(Papa, "a,b\r1,2\r", { whole: false }).rows).toEqual([["a", "b"]]);
        // whole: the same row is a row
        expect(csv.readStart(Papa, "a,b\n", { whole: true }).rows).toEqual([["a", "b"]]);
    });

    test("a text that starts with U+FEFF, a second byte-order mark, keeps it in the first field, and the import's reading gives the same field", async () => {
        const { csv } = await modules();
        const body = "id,name\n1,Ann\n2,Bob\n";
        for (const whole of [true, false]) {
            const preview = csv.readStart(Papa, `\ufeff${body}`, { whole });
            expect(preview.rows[0], `whole ${whole}`).toEqual(["\ufeffid", "name"]);
            expect(preview.rows[0][0].charCodeAt(0), `whole ${whole}`).toBe(0xfeff);
            expect(preview.rows[1], `whole ${whole}`).toEqual(["1", "Ann"]);
            expect(preview.delimiter).toBe(",");
        }
        // the import reads the same text a piece at a time, whatever the size of the pieces
        const wrong = [];
        for (let n = 1; n <= body.length + 2; n++) {
            const got = await rowsFromPieces(cutInto(`\ufeff${body}`, n));
            if (!same(got.rows, [["\ufeffid", "name"], ["1", "Ann"], ["2", "Bob"]])) {
                wrong.push(`pieces of ${n}: ${JSON.stringify(got.rows[0])}`);
            }
        }
        expect(wrong).toEqual([]);
        // with a delimiter chosen too, and in the middle of a field it is a character as ever
        expect(csv.readStart(Papa, "\ufeffid;name\n1;Ann\n", { whole: true, delimiter: ";" }).rows[0]).toEqual(["\ufeffid", "name"]);
        expect(csv.readStart(Papa, "id,na\ufeffme\n", { whole: true }).rows[0]).toEqual(["id", "na\ufeffme"]);
    });

    test("EF BB BF EF BB BF and a CSV: startOfText and textPieces both give one U+FEFF, and the preview's first field is the import's; one byte-order mark gives none", async () => {
        const { text, csv } = await modules();
        const body = "id,name\n1,Ann\n";
        const twoMarks = Uint8Array.from([0xef, 0xbb, 0xbf, 0xef, 0xbb, 0xbf, ...bytesOf(body)]);
        const oneMark = Uint8Array.from([0xef, 0xbb, 0xbf, ...bytesOf(body)]);

        const start = await text.startOfText(blobOf(twoMarks), "utf-8", 1000);
        expect(start.text).toBe(`\ufeff${body}`);
        for (const sliceBytes of [1, 2, 3, 4, 5, 64, null]) {
            const options = sliceBytes === null ? {} : { sliceBytes };
            const joined = (await collect(text.textPieces(blobOf(twoMarks), "utf-8", options))).join("");
            expect(joined, `slice ${sliceBytes}`).toBe(`\ufeff${body}`);
            // the import's reading of those pieces, and the preview's of the start: one first field
            const read = await rowsFromPieces(await collect(text.textPieces(blobOf(twoMarks), "utf-8", options)));
            const preview = csv.readStart(Papa, start.text, { whole: true });
            expect(read.rows[0][0], `slice ${sliceBytes}`).toBe("\ufeffid");
            expect(preview.rows[0][0], `slice ${sliceBytes}`).toBe(read.rows[0][0]);
        }

        const one = await text.startOfText(blobOf(oneMark), "utf-8", 1000);
        expect(one.text).toBe(body);
        expect((await collect(text.textPieces(blobOf(oneMark), "utf-8", { sliceBytes: 2 }))).join("")).toBe(body);
        expect(csv.readStart(Papa, one.text, { whole: true }).rows[0]).toEqual(["id", "name"]);
        // the name of the column that the whole read makes of it: the mark is not a letter
        const got = await readText("marks.csv", twoMarks, { sliceBytes: 3 });
        expect(got.table.columns[0].original).toBe("\ufeffid");
        expect(got.table.columns[0].name).toBe("_id");
    });
});

// ---- csv: reading a whole file in pieces ----------------------------------------------------------------------------

test.describe("import csv: readPieces, the reading of a whole file a piece at a time", () => {
    test.beforeEach(skipUnlessFirst);

    // a quoted field with a doubled quote and a line break, a short row, a row of delimiters, an empty line
    const CRLF_TEXT = 'id,note\r\n1,"a, ""b""\r\nsecond line"\r\n2,\r\n,\r\n\r\n3,plain';
    const CRLF_ROWS = [["id", "note"], ["1", 'a, "b"\r\nsecond line'], ["2", ""], ["", ""], ["3", "plain"]];
    const LF_TEXT = 'id,note\n1,"a, ""b""\nsecond line"\n2,\n,\n\n3,plain';
    const LF_ROWS = [["id", "note"], ["1", 'a, "b"\nsecond line'], ["2", ""], ["", ""], ["3", "plain"]];

    test("the rows are the same whatever the piece sizes, a row and a quoted line break split across pieces included", async () => {
        const wrong = [];
        for (const [text, rows, newline] of [
            [CRLF_TEXT, CRLF_ROWS, "\r\n"],
            [LF_TEXT, LF_ROWS, "\n"],
        ]) {
            for (let n = 1; n <= text.length + 1; n++) {
                const got = await rowsFromPieces(cutInto(text, n), { newline });
                if (!same(got.rows, rows)) {
                    wrong.push(`${JSON.stringify(newline)} pieces of ${n}: ${JSON.stringify(got.rows).slice(0, 100)}`);
                }
                if (got.badQuotes) {
                    wrong.push(`${JSON.stringify(newline)} pieces of ${n}: a bad quote that is not there`);
                }
            }
        }
        expect(wrong).toEqual([]);
    });

    test("onRows is called with the rows each piece completed, before the next piece is asked for", async () => {
        const { csv } = await modules();
        const log = [];
        await csv.readPieces(Papa, asyncPieces(["a,b\n1,2\n", "3,4\n", "5,6"], log), {
            delimiter: ",",
            newline: "\n",
            onRows: (rows) => log.push(`rows:${JSON.stringify(rows)}`),
        });
        expect(log.slice(0, 4)).toEqual(['ask:a,b\n1,2\n', 'rows:[["a","b"],["1","2"]]', "ask:3,4\n", 'rows:[["3","4"]]']);
        // the last row has no line break: it comes at the end
        expect(log.filter((line) => line.startsWith("rows:")).join("").includes('["5","6"]')).toBe(true);
        expect(log.filter((line) => line.startsWith("ask:")).length).toBe(3);
    });

    test("what onRows throws is thrown from readPieces, and no later piece is read", async () => {
        const { csv } = await modules();
        const boom = new Error("boom");
        const log = [];
        let calls = 0;
        await expect(
            csv.readPieces(Papa, asyncPieces(["a,b\n1,2\n", "3,4\n", "5,6\n", "7,8\n"], log), {
                delimiter: ",",
                newline: "\n",
                onRows: () => {
                    if (++calls === 2) {
                        throw boom;
                    }
                },
            })
        ).rejects.toBe(boom);
        expect(log).toEqual(["ask:a,b\n1,2\n", "ask:3,4\n"]);
    });

    test("an error thrown by the first piece's rows stops at once", async () => {
        const { csv } = await modules();
        const log = [];
        await expect(
            csv.readPieces(Papa, asyncPieces(["a,b\n1,2\n", "3,4\n"], log), {
                delimiter: ",",
                newline: "\n",
                onRows: () => {
                    throw new RangeError("first");
                },
            })
        ).rejects.toThrow("first");
        expect(log).toEqual(["ask:a,b\n1,2\n"]);
    });

    test("badQuotes is true for a quote that is never closed and for a stray quote after a closing one", async () => {
        const open = await rowsFromPieces(['a,b\n1,"never closed\n2,3\n']);
        expect(open.badQuotes).toBe(true);
        const stray = await rowsFromPieces(['a,b\n"abc"def,x\n']);
        expect(stray.badQuotes).toBe(true);
        // also when the pieces are small
        const small = await rowsFromPieces(cutInto('a,b\n1,"never closed\n2,3\n', 3));
        expect(small.badQuotes).toBe(true);
    });

    test("badQuotes is false for a clean file, quotes, doubled quotes and quoted line breaks included", async () => {
        const clean = await rowsFromPieces(['a,b\n"x,y","he said ""hi""","l1\nl2"\n']);
        expect(clean.badQuotes).toBe(false);
        expect((await rowsFromPieces(["a,b\n1,2\n3,4\n"])).badQuotes).toBe(false);
        expect((await rowsFromPieces([])).badQuotes).toBe(false);
    });

    test("a field is read as text: nothing is turned into a number, and a line of spaces is a row", async () => {
        const got = await rowsFromPieces(["a,b,c\n007,1e3,true\n   \n-0, 5 ,\n"]);
        expect(got.rows).toEqual([["a", "b", "c"], ["007", "1e3", "true"], ["   "], ["-0", " 5 ", ""]]);
    });
});

// ---- csv: the quote warning, which a piece's end must not change -----------------------------------------

test.describe("import csv: badQuotes does not depend on where the pieces are cut", () => {
    test.beforeEach(skipUnlessFirst);

    // Papa reads the row that a piece cut short again with the next piece and says again what is wrong
    // with it. A closing quote with a space after it, at the very end of a piece, is an error until
    // the delimiter or the break behind the space has come: only rows that ended in the piece count.
    const CASES = [
        ['id,name\n1,"Ann" \n2,Bob\n', false, [["id", "name"], ["1", "Ann"], ["2", "Bob"]], "a closing quote followed by a space"],
        ['id,name\n1,"Ann"\t\n2,Bob\n', false, [["id", "name"], ["1", "Ann"], ["2", "Bob"]], "a closing quote followed by a tab"],
        ['id,name\r\n1,"Ann" \r\n2,Bob\r\n', false, [["id", "name"], ["1", "Ann"], ["2", "Bob"]], "a closing quote followed by a space, CRLF"],
        ['id,name\n1,"Ann" ,x\n2,"Bob" \t ,y', false, [["id", "name"], ["1", "Ann", "x"], ["2", "Bob", "y"]], "spaces and a tab, then the delimiter, and no final line break"],
        ['id,name\n1,"Ann"x\n2,Bob\n', true, [["id", "name"], ["1", 'Ann"x\n2,Bob\n']], "text after a closing quote"],
        ['id,name\n1,"Ann\n2,Bob\n', true, [["id", "name"], ["1", "Ann\n2,Bob\n"]], "a quote that is never closed"],
        ['id,name\n1,"Ann ""A"" B"\n2,"x\ny"\n3,"p, q"\n', false, [["id", "name"], ["1", 'Ann "A" B'], ["2", "x\ny"], ["3", "p, q"]], "a well-formed text with doubled quotes and a line break in a field"],
    ];

    test("the warning, and the rows, are the same for every slice size from 1 to the text's length + 2", async () => {
        const wrong = [];
        for (const [text, badQuotes, rows, why] of CASES) {
            const newline = text.includes("\r\n") ? "\r\n" : "\n";
            for (let n = 1; n <= text.length + 2; n++) {
                const got = await rowsFromPieces(cutInto(text, n), { newline });
                if (got.badQuotes !== badQuotes) {
                    wrong.push(`${why}: pieces of ${n}: badQuotes ${got.badQuotes}`);
                }
                if (!same(got.rows, rows)) {
                    wrong.push(`${why}: pieces of ${n}: ${JSON.stringify(got.rows).slice(0, 100)}`);
                }
            }
        }
        expect(wrong).toEqual([]);
    });

    test("the same through bytes: textPieces of every slice size, in the modules together", async () => {
        const wrong = [];
        for (const [text, badQuotes, rows, why] of CASES) {
            const newline = text.includes("\r\n") ? "\r\n" : "\n";
            for (let sliceBytes = 1; sliceBytes <= text.length + 2; sliceBytes++) {
                const got = await rowsFromBytes(bytesOf(text), sliceBytes, { newline });
                if (got.badQuotes !== badQuotes || !same(got.rows, rows)) {
                    wrong.push(`${why}: slice ${sliceBytes}: ${got.badQuotes} ${JSON.stringify(got.rows).slice(0, 80)}`);
                }
            }
        }
        expect(wrong).toEqual([]);
    });

    // the first slice of the page's own size ends on the space, one byte before it, one byte after it
    for (const [label, offset] of [["on the last byte of the first slice", 0], ["one byte before the end of the first slice", -1], ["one byte after the end of the first slice", 1]]) {
        for (const [what, after, badQuotes, tailRows] of [
            ["a space after a closing quote", " ", false, [["2", "Bob"]]],
            ["a tab after a closing quote", "\t", false, [["2", "Bob"]]],
            ["a letter after a closing quote", "x", true, null],
        ]) {
            test(`at the real slice size, ${what} ${label}`, async () => {
                const { IMPORT_SLICE_BYTES } = await config();
                // 'id,name\n1,"' is 11 bytes, then the filler, the closing quote and the character after it
                const head = 'id,name\n1,"';
                const filler = "x".repeat(IMPORT_SLICE_BYTES - 1 + offset - head.length - 1);
                const text = `${head}${filler}"${after}\n2,Bob\n`;
                expect(Buffer.byteLength(head + filler) + 2, "the layout: the character after the quote is at the slice's end").toBe(IMPORT_SLICE_BYTES + offset);
                const whole = await rowsFromBytes(bytesOf(text), text.length + 1);
                const sliced = await rowsFromBytes(bytesOf(text), IMPORT_SLICE_BYTES);
                expect(sliced.badQuotes).toBe(badQuotes);
                expect(whole.badQuotes).toBe(badQuotes);
                expect(sliced.rows).toEqual(whole.rows);
                if (tailRows) {
                    expect(sliced.rows.length).toBe(3);
                    expect(sliced.rows[1]).toEqual(["1", filler]);
                    expect(sliced.rows.slice(2)).toEqual(tailRows);
                }
            });
        }
    }

    // Papa gives a quote error the place AFTER the quote that opens the field: past the cursor when a
    // piece cut the row short, never past it when the row has ended, and exactly at it when that quote
    // is the last character of the file. Comparing the place with "<" would import a file that ends
    // with a quote that opens a field with no warning.
    const ENDS_WITH_QUOTE = [
        ['id,name\n1,Ann\n2,"', true, [["id", "name"], ["1", "Ann"], ["2", ""]], "a quote that opens the last field of the last row, and the file ends"],
        ['id,name\n1,Ann\n"', true, [["id", "name"], ["1", "Ann"]], "a quote that opens the last row, and the file ends"],
        ['"', true, [], "a file of one quote"],
        ['id,name\n1,Ann\n2,"x', true, [["id", "name"], ["1", "Ann"], ["2", "x"]], "the quote opens a field that is never closed, one character later"],
        ['id,name\n1,Ann\n2,"x"', false, [["id", "name"], ["1", "Ann"], ["2", "x"]], "the same field closed at the end of the file: nothing is wrong"],
        ['id,name\n1,Ann\n2,""', false, [["id", "name"], ["1", "Ann"], ["2", ""]], "an empty quoted field at the end of the file: nothing is wrong"],
        ['id,name\r\n1,Ann\r\n2,"', true, [["id", "name"], ["1", "Ann"], ["2", ""]], "the same with Windows line endings"],
    ];

    test("a text whose last character is a quote that opens a field is called unpaired, at every piece size from 1 to the length + 2; closed at the end, or closed and empty, it is not", async () => {
        const wrong = [];
        for (const [text, badQuotes, rows, why] of ENDS_WITH_QUOTE) {
            const newline = text.includes("\r\n") ? "\r\n" : "\n";
            for (let n = 1; n <= text.length + 2; n++) {
                const got = await rowsFromPieces(cutInto(text, n), { newline });
                if (got.badQuotes !== badQuotes) {
                    wrong.push(`${why}: pieces of ${n}: badQuotes ${got.badQuotes}`);
                }
                if (!same(got.rows, rows)) {
                    wrong.push(`${why}: pieces of ${n}: ${JSON.stringify(got.rows).slice(0, 100)}`);
                }
            }
        }
        expect(wrong).toEqual([]);
    });

    test("the same through bytes: textPieces of every slice size from 1 to the length + 2, in the modules together", async () => {
        const wrong = [];
        for (const [text, badQuotes, rows, why] of ENDS_WITH_QUOTE) {
            const newline = text.includes("\r\n") ? "\r\n" : "\n";
            for (let sliceBytes = 1; sliceBytes <= text.length + 2; sliceBytes++) {
                const got = await rowsFromBytes(bytesOf(text), sliceBytes, { newline });
                if (got.badQuotes !== badQuotes || !same(got.rows, rows)) {
                    wrong.push(`${why}: slice ${sliceBytes}: ${got.badQuotes} ${JSON.stringify(got.rows).slice(0, 80)}`);
                }
            }
        }
        expect(wrong).toEqual([]);
    });

    test("a file that ends with a quote that opens a field gets the warning in the whole read too, at the real slice size", async () => {
        const { IMPORT_SLICE_BYTES } = await config();
        // the quote is the last byte of the file, and the file is longer than a slice, so the quote comes in a piece of its own or at the end of one
        const body = "id,name\n" + Array.from({ length: 8000 }, (_, i) => `${i},name${i}`).join("\n");
        for (const tail of ['\n9,"', '\n"']) {
            const text = body + tail;
            expect(text.length).toBeGreaterThan(IMPORT_SLICE_BYTES);
            const got = await readText("ends.csv", Uint8Array.from(bytesOf(text)));
            expect(got.badQuotes, JSON.stringify(tail)).toBe(true);
            expect(got.refused, JSON.stringify(tail)).toBeUndefined();
        }
        // and the file of the same rows without that tail is not warned about
        expect((await readText("clean.csv", Uint8Array.from(bytesOf(body)))).badQuotes).toBe(false);
    });

    // Texts of up to about 24 symbols of a small alphabet, hostile to a reader that works a piece at a time:
    // wherever the pieces are cut, the rows and the warning are what ONE reading of the whole text gives
    // (Papa.parse of the whole text, with the settings of the import: an InvalidQuotes or MissingQuotes error).
    test("for generated hostile texts, at piece sizes 1, 2, 3, 5 and 64, the rows and badQuotes are what one reading of the whole text gives", async () => {
        const random = seeded(20261116);
        const alphabet = ["a", "b", '"', '""', ",", "\n", " ", "\t", "\f"];
        const settings = { delimiter: ",", newline: "\n", skipEmptyLines: true, header: false, dynamicTyping: false };
        const wrong = [];
        let warned = 0;
        let endsWithQuote = 0;
        const total = 3000;
        for (let n = 0; n < total; n++) {
            let text = "";
            for (let i = 1 + Math.floor(random() * 24); i > 0; i--) {
                text += alphabet[Math.floor(random() * alphabet.length)];
            }
            const whole = Papa.parse(text, settings);
            const badQuotes = whole.errors.some((error) => error.code === "InvalidQuotes" || error.code === "MissingQuotes");
            warned += badQuotes ? 1 : 0;
            endsWithQuote += text.endsWith('"') && !text.endsWith('""') ? 1 : 0;
            for (const size of [1, 2, 3, 5, 64]) {
                const got = await rowsFromPieces(cutInto(text, size));
                if (got.badQuotes !== badQuotes || !same(got.rows, whole.data)) {
                    wrong.push(`${JSON.stringify(text)}, pieces of ${size}: badQuotes ${got.badQuotes} (whole: ${badQuotes}) ${JSON.stringify(got.rows)} (whole: ${JSON.stringify(whole.data)})`);
                }
            }
            if (wrong.length >= 5) {
                break;
            }
        }
        expect(wrong).toEqual([]);
        // (a property in which nothing is ever warned about, or no text ends with a quote, would prove nothing)
        expect(warned).toBeGreaterThan(total / 5);
        expect(warned).toBeLessThan(total * 0.95);
        expect(endsWithQuote).toBeGreaterThan(100);
    });
});


// ---- csv: the table's columns -------------------------------------------------------------------------------------------

test.describe("import csv: newTableReader, rows into a table's columns", () => {
    test.beforeEach(skipUnlessFirst);

    test("names on row 1: the first row names the columns, the rest are data, each column typed from all its values", async () => {
        const { data, table } = await tableFrom([["id", "name", "price"], ["1", "a", "1.50"], ["2", "b", "2"], ["3", "c", "x"]]);
        expect(data).toEqual([["1", "a", "1.50"], ["2", "b", "2"], ["3", "c", "x"]]);
        expect(table.rows).toBe(3);
        expect(table.columns.map((c) => [c.name, c.type, c.blanks, c.blocking])).toEqual([
            ["id", "INTEGER", 0, null],
            ["name", "TEXT", 0, null],
            ["price", "TEXT", 0, "x"],
        ]);
    });

    test("names on a later row: the rows above are left out and do not count, the rows below are the data", async () => {
        const rows = [["Northlight Retail"], ["Quarterly sales report - Q3 2023"], ["Region", "Month", "Orders"], ["North", "Jul", "120"], ["South", "Aug", "135"]];
        const { data, table } = await tableFrom(rows, { hasNames: true, namesRow: 3 });
        expect(data).toEqual([["North", "Jul", "120"], ["South", "Aug", "135"]]);
        expect(table.rows).toBe(2);
        expect(table.columns.map((c) => [c.name, c.type])).toEqual([["Region", "TEXT"], ["Month", "TEXT"], ["Orders", "INTEGER"]]);
    });

    test("rows are counted across calls of take, and a names row alone gives a table of no rows", async () => {
        const { csv } = await modules();
        const reader = csv.newTableReader({ hasNames: true, namesRow: 2 });
        expect(reader.take([["title"]])).toEqual([]);
        expect(reader.take([["a", "b"]])).toEqual([]);
        expect(reader.take([["1", "2"], ["3", "4"]])).toEqual([["1", "2"], ["3", "4"]]);
        const table = reader.finish();
        expect(table.rows).toBe(2);
        expect(table.columns.map((c) => c.name)).toEqual(["a", "b"]);

        const headerOnly = await tableFrom([["a", "b", "c"]]);
        expect(headerOnly.table.rows).toBe(0);
        // a column with no values is TEXT, and has no blanks
        expect(headerOnly.table.columns.map((c) => [c.name, c.type, c.blanks])).toEqual([["a", "TEXT", 0], ["b", "TEXT", 0], ["c", "TEXT", 0]]);
    });

    test("with no names every row is data, and the columns are column_1 to the widest row's length", async () => {
        const { data, table } = await tableFrom([["1", "Mug", "4"], ["2", "Plate"], ["3", "Cup", "1", "extra"]], { hasNames: false, namesRow: 1 });
        expect(data.length).toBe(3);
        expect(table.rows).toBe(3);
        expect(table.columns.map((c) => c.name)).toEqual(["column_1", "column_2", "column_3", "column_4"]);
        expect(table.columns.map((c) => c.original)).toEqual([null, null, null, null]);
    });

    test("an empty field is NULL and a field of spaces is not (rule 5)", async () => {
        const { data, table } = await tableFrom([["a", "b"], ["", "  "], ["x", ""], ["", ""]]);
        expect(data).toEqual([[null, "  "], ["x", null], [null, null]]);
        expect(table.columns.map((c) => [c.name, c.type, c.blanks])).toEqual([["a", "TEXT", 2], ["b", "TEXT", 2]]);
        // a column of numbers and empty fields stays a number column
        const numbers = await tableFrom([["n"], ["1"], [""], ["3"]]);
        expect(numbers.table.columns[0]).toMatchObject({ type: "INTEGER", blanks: 1 });
    });

    test("a row of delimiters only is a row of NULLs (rule 9)", async () => {
        const got = await tableFrom([["a", "b"], ["", ""], ["1", "2"]]);
        expect(got.table.rows).toBe(2);
        expect(got.table.columns.map((c) => [c.type, c.blanks])).toEqual([["INTEGER", 1], ["INTEGER", 1]]);
    });

    test("a short row is padded: the blanks it adds are counted (rule 7)", async () => {
        const { table } = await tableFrom([["a", "b", "c"], ["1", "2", "3"], ["4"], ["5", "6"]]);
        expect(table.rows).toBe(3);
        expect(table.columns.map((c) => [c.name, c.type, c.blanks])).toEqual([["a", "INTEGER", 0], ["b", "INTEGER", 1], ["c", "INTEGER", 2]]);
    });

    test("a header longer than every row still names every column, and its columns count the rows they have no value for", async () => {
        const { table } = await tableFrom([["a", "b", "c"], ["1"]]);
        expect(table.columns.map((c) => [c.name, c.blanks])).toEqual([["a", 0], ["b", 1], ["c", 1]]);
    });

    test("a row wider than the header adds columns called extra_1, extra_2; with no names it adds none (rule 7)", async () => {
        const named = await tableFrom([["a", "b"], ["1", "2"], ["3", "4", "5", "6"]]);
        expect(named.table.columns.map((c) => [c.name, c.original, c.blanks])).toEqual([["a", "a", 0], ["b", "b", 0], ["extra_1", null, 1], ["extra_2", null, 1]]);
        const bare = await tableFrom([["1", "2"], ["3", "4", "5", "6"]], { hasNames: false, namesRow: 1 });
        expect(bare.table.columns.map((c) => c.name)).toEqual(["column_1", "column_2", "column_3", "column_4"]);
    });

    test("a column's original name and the blocking value are reported", async () => {
        const { table } = await tableFrom([["Café", "Amount (£)", "plain"], ["1", "£5.00", "a"], ["2", "3", "b"], ["x", "4", "c"]]);
        expect(table.columns.map((c) => [c.name, c.original, c.type, c.blocking])).toEqual([
            ["Caf_", "Café", "TEXT", "x"],
            ["Amount_", "Amount (£)", "TEXT", "£5.00"],
            ["plain", "plain", "TEXT", null],
        ]);
    });

    test("a late text value makes the column TEXT, however many whole numbers came first (rule 8)", async () => {
        const rows = [["n"], ...Array.from({ length: 3000 }, (_, i) => [String(i + 1)]), ["oops"]];
        expect((await tableFrom(rows)).table.columns[0]).toMatchObject({ type: "TEXT", blocking: "oops" });
    });

    test("a row of exactly 2,000 fields is taken", async () => {
        const names = Array.from({ length: 2000 }, (_, i) => `c${i + 1}`);
        const { table } = await tableFrom([names, names.map(() => "1")]);
        expect(table.columns.length).toBe(2000);
        expect(table.columns[1999].name).toBe("c2000");
        expect(table.columns.every((c) => c.type === "INTEGER")).toBe(true);
    });

    test("a row of 2,001 fields is refused as too wide, as soon as it is met (rule 10)", async () => {
        const { csv } = await modules();
        const wide = Array.from({ length: 2001 }, () => "1");
        expect(await refusalOf(() => csv.newTableReader({ hasNames: false, namesRow: 1 }).take([wide]))).toBe("too-wide");
        // a data row, after a names row
        expect(await refusalOf(() => csv.newTableReader({ hasNames: true, namesRow: 1 }).take([["a"], wide]))).toBe("too-wide");
        // the names row itself
        expect(await refusalOf(() => csv.newTableReader({ hasNames: true, namesRow: 1 }).take([wide]))).toBe("too-wide");
        // a row above the names row, which is left out of the table but is still a row of the file
        expect(await refusalOf(() => csv.newTableReader({ hasNames: true, namesRow: 2 }).take([wide, ["a", "b"]]))).toBe("too-wide");
        // refused at once: nothing is left to finish
        const reader = csv.newTableReader({ hasNames: false, namesRow: 1 });
        expect(await refusalOf(() => reader.take([["1"], wide, ["2"]]))).toBe("too-wide");
    });

    test("ImportRefused is an Error with the reason it was made with", async () => {
        const { csv } = await modules();
        const error = new csv.ImportRefused("too-wide");
        expect(error).toBeInstanceOf(Error);
        expect(error.reason).toBe("too-wide");
        expect(csv.MAX_COLUMNS).toBe(2000);
    });

    test("the file ends before the row said to hold the names: no-names-row", async () => {
        const { csv } = await modules();
        const reader = csv.newTableReader({ hasNames: true, namesRow: 3 });
        reader.take([["a"], ["b"]]);
        expect(await refusalOf(() => reader.finish())).toBe("no-names-row");
    });

    test("nothing to make a table from: empty", async () => {
        const { csv } = await modules();
        expect(await refusalOf(() => csv.newTableReader({ hasNames: true, namesRow: 1 }).finish())).toBe("empty");
        expect(await refusalOf(() => csv.newTableReader({ hasNames: false, namesRow: 1 }).finish())).toBe("empty");
        const reader = csv.newTableReader({ hasNames: false, namesRow: 1 });
        reader.take([]);
        expect(await refusalOf(() => reader.finish())).toBe("empty");
    });
});

// ---- every text fixture, through the three modules together ----------------------------------------------------------

test.describe("import of every text fixture, through the modules and no database", () => {
    test.beforeEach(skipUnlessFirst);

    test("the list of text fixtures is the one the plan names", () => {
        expect(TEXT_FIXTURES.map((f) => f.name)).toContain("messy_sales.csv");
        expect(TEXT_FIXTURES.map((f) => f.name)).toContain("windows1252.csv");
        expect(TEXT_FIXTURES.map((f) => f.name)).toContain("large.csv");
        expect(TEXT_FIXTURES.length).toBeGreaterThanOrEqual(21);
        expect(BY_CONTENT_TEXT.map((f) => f.name).sort()).toEqual(["impostors/renamed_csv.xlsx", "impostors/tab_text.xls"]);
    });

    // (large.csv is not stored: it has a test of its own below, with the default slice)
    for (const { name, want } of TEXT_FIXTURES.filter((f) => f.name !== "large.csv")) {
        const table = want.tables[0];

        test(`${name}: encoding, delimiter and the header guess are as expected, at every slice size`, async () => {
            const bytes = bytesOfFixture(name);
            const wrong = [];
            for (const sliceBytes of SLICES) {
                const got = await readText(name, bytes, { sliceBytes });
                if (got.refused || !same(got.settings, want.settings)) {
                    wrong.push(`slice ${sliceBytes ?? "default"}: ${got.refused ? `refused (${got.refused})` : JSON.stringify(got.settings)} != ${JSON.stringify(want.settings)}`);
                }
            }
            expect(wrong).toEqual([]);
        });

        test(`${name}: the table's name, its rows and every column are as expected, at every slice size`, async () => {
            expect(want.tables.length).toBe(1);
            const bytes = bytesOfFixture(name);
            const wrong = [];
            for (const sliceBytes of SLICES) {
                const got = await readText(name, bytes, { sliceBytes });
                wrong.push(...columnDifferences(got, table).map((line) => `slice ${sliceBytes ?? "default"}: ${line}`));
            }
            expect(wrong).toEqual([]);
        });

        test(`${name}: every cell is as expected, at every slice size`, async () => {
            const bytes = bytesOfFixture(name);
            const wrong = [];
            for (const sliceBytes of SLICES) {
                const got = await readText(name, bytes, { sliceBytes });
                wrong.push(...cellDifferences(got, table).map((line) => `slice ${sliceBytes ?? "default"}: ${line}`));
            }
            expect(wrong).toEqual([]);
        });
    }

    test("csv/title_rows.csv with the names on row 4 (line 5 of the file) gives the other expected table, at every slice size", async () => {
        const want = expectedOf(fixtureIndex().find((entry) => entry.fixture === "csv/title_rows.csv"));
        expect(want.tables_if_header_row_can_be_chosen.length).toBe(1);
        const alt = want.tables_if_header_row_can_be_chosen[0];
        expect(alt.header_line_in_file).toBe(5);
        const bytes = bytesOfFixture("csv/title_rows.csv");
        const wrong = [];
        for (const sliceBytes of SLICES) {
            const got = await readText("csv/title_rows.csv", bytes, { sliceBytes, namesRow: 4, hasNames: true });
            wrong.push(...columnDifferences(got, alt).map((line) => `slice ${sliceBytes ?? "default"}: ${line}`));
            wrong.push(...cellDifferences(got, alt).map((line) => `slice ${sliceBytes ?? "default"}: ${line}`));
        }
        expect(wrong).toEqual([]);
    });

    test("large.csv (200,000 rows, written to the temporary folder) gives its expected settings, table and checksum with the default slice", async () => {
        test.slow();
        const entry = TEXT_FIXTURES.find((f) => f.name === "large.csv");
        const bytes = new Uint8Array(fs.readFileSync(largeCsv()));
        const got = await readText("large.csv", bytes);
        expect(got.refused).toBeUndefined();
        expect(got.settings).toEqual(entry.want.settings);
        expect(got.table.rows).toBe(200000);
        expect(columnDifferences(got, entry.want.tables[0])).toEqual([]);
        expect(cellDifferences(got, entry.want.tables[0])).toEqual([]);
        expect(got.badQuotes).toBe(false);
    });

    test("no text fixture reports a quote that could not be paired, at slices that cut every CRLF and quoted line break", async () => {
        const wrong = [];
        for (const { name } of [...TEXT_FIXTURES, ...BY_CONTENT_TEXT]) {
            if (name === "large.csv") {
                continue;
            }
            for (const sliceBytes of [1, 2, 3, 5, 7, null]) {
                const got = await readText(name, bytesOfFixture(name), { sliceBytes });
                if (got.badQuotes !== false) {
                    wrong.push(`${name}, slice ${sliceBytes ?? "default"}: ${got.refused ?? got.badQuotes}`);
                }
            }
        }
        expect(wrong).toEqual([]);
    });

    for (const { name, want } of BY_CONTENT_TEXT) {
        test(`${name}: imported as text, whatever its name, with the table its content gives`, async () => {
            const bytes = bytesOfFixture(name);
            const table = want.tables_if_read_by_content[0];
            const wrong = [];
            for (const sliceBytes of SLICES) {
                const got = await readText(name, bytes, { sliceBytes });
                wrong.push(...columnDifferences(got, table).map((line) => `slice ${sliceBytes ?? "default"}: ${line}`));
                wrong.push(...cellDifferences(got, table).map((line) => `slice ${sliceBytes ?? "default"}: ${line}`));
            }
            expect(wrong).toEqual([]);
        });
    }
});

// ---- the fixtures that must not become a table ---------------------------------------------------------------------------

test.describe("fixtures that must not become a table", () => {
    test.beforeEach(skipUnlessFirst);

    test("every fixture that is refused or is a workbook is accounted for here, and none is missing", () => {
        const notTables = INDEX.filter(({ name, want }) => want.sheets !== undefined || want.outcome === "refuse" || name.startsWith("impostors/"))
            .filter(({ want }) => !(want.outcome === "import_by_content_or_refuse" && want.real_content === "text"))
            .map(({ name }) => name)
            .sort();
        expect(notTables).toEqual([...Object.keys(NOT_TEXT_KIND), ...Object.keys(TEXT_BUT_REFUSED)].sort());
    });

    for (const [name, kind] of Object.entries(NOT_TEXT_KIND)) {
        test(`${name} is ${kind === "empty" ? "empty" : `a ${kind}`} by its first bytes, and is not read as text`, async () => {
            const { text } = await modules();
            const bytes = bytesOfFixture(name);
            expect(text.kindByStart(bytes.subarray(0, text.HEAD_BYTES), bytes.length, path.basename(name))).toBe(kind);
            expect(await readText(name, bytes, { sliceBytes: 7 })).toEqual({ refused: kind });
        });
    }

    test("csv/empty.csv has no bytes at all, so it is empty", async () => {
        const { text } = await modules();
        const bytes = bytesOfFixture("csv/empty.csv");
        expect(bytes.length).toBe(0);
        expect(text.kindByStart(bytes, 0, "empty.csv")).toBe("empty");
    });

    test("impostors/random_bytes.xls is text by its first bytes, has a zero byte and no UTF-16 mark, so it is not text", async () => {
        const { text } = await modules();
        const bytes = bytesOfFixture("impostors/random_bytes.xls");
        expect(text.kindByStart(bytes.subarray(0, text.HEAD_BYTES), bytes.length, "random_bytes.xls")).toBe("text");
        const info = await text.inspectText(new Blob([bytes]), { sliceBytes: 7 });
        expect(info.hasZero).toBe(true);
        expect(info.bom).toBeNull();
        expect(await readText("impostors/random_bytes.xls", bytes, { sliceBytes: 7 })).toEqual({ refused: "not-text" });
    });

    test("csv/wide_2100_columns.csv is refused as too wide, at every slice size", async () => {
        const bytes = bytesOfFixture("csv/wide_2100_columns.csv");
        for (const sliceBytes of SLICES) {
            expect(await readText("csv/wide_2100_columns.csv", bytes, { sliceBytes }), `slice ${sliceBytes ?? "default"}`).toEqual({ refused: "too-wide" });
        }
        expect(expectedOf(fixtureIndex().find((e) => e.fixture === "csv/wide_2100_columns.csv")).outcome).toBe("refuse");
    });
});

// ---- what the plan decides and no fixture holds ---------------------------------------------------------------------------

test.describe("what the plan decides and no fixture has yet (plan section 9)", () => {
    test.beforeEach(skipUnlessFirst);

    const read = (name, bytes) => readText(name, Uint8Array.from(bytes), { sliceBytes: 3 });

    test("-0 is not a plain whole number: its column is TEXT, and the report points at it", async () => {
        const got = await read("zero.csv", bytesOf("a,b\n1,5\n-0,6\n2,7\n"));
        expect(got.refused).toBeUndefined();
        expect(got.table.columns.map((c) => [c.name, c.type, c.blocking])).toEqual([["a", "TEXT", "-0"], ["b", "INTEGER", null]]);
        // as written: the sign is not lost
        expect(got.data[1]).toEqual(["-0", 6]);
    });

    test("a header of spaces only is column_ and its position, and the original is the spaces", async () => {
        const got = await read("blank.csv", bytesOf("a,   ,c\n1,2,3\n"));
        expect(got.table.columns.map((c) => c.name)).toEqual(["a", "column_2", "c"]);
        expect(got.table.columns[1].original).toBe("   ");
        expect(got.settings.first_row_is_header).toBe(true);
    });

    test("a text file that starts with PK is text, whatever its name", async () => {
        const { text } = await modules();
        const bytes = bytesOf("PK,name\n1,a\n2,b\n");
        for (const name of ["pk.csv", "pk.txt", "pk.xlsx", "pk.xls"]) {
            expect(text.kindByStart(Uint8Array.from(bytes), bytes.length, name), name).toBe("text");
        }
        const got = await read("pk.csv", bytes);
        expect(got.table.columns.map((c) => [c.name, c.type])).toEqual([["PK", "INTEGER"], ["name", "TEXT"]]);
        expect(got.table.rows).toBe(2);
        const underWorkbookName = await read("pk.xlsx", bytes);
        expect(underWorkbookName.table.columns.map((c) => c.name)).toEqual(["PK", "name"]);
    });

    test("a file of blank lines only is empty", async () => {
        for (const body of ["\n", "\n\n\n", "\r\n\r\n\r\n", "\r\r"]) {
            expect(await read("blank.csv", bytesOf(body)), JSON.stringify(body)).toEqual({ refused: "empty" });
        }
    });

    test("a file of lines of spaces is not empty: a field of spaces is a value", async () => {
        const got = await read("spaces.csv", bytesOf("   \n   \n"));
        expect(got.refused).toBeUndefined();
        expect(got.table.rows).toBe(1);
    });

    test("UTF-16 with no byte-order mark has zero bytes and no mark, so the zero-byte test refuses it as not text", async () => {
        const { text } = await modules();
        for (const encoding of ["utf-16le", "utf-16be"]) {
            const bytes = encode(encoding, "a,b\n1,2\n");
            const info = await text.inspectText(blobOf(bytes), { sliceBytes: 3 });
            expect(info.bom, encoding).toBeNull();
            expect(info.hasZero, encoding).toBe(true);
            expect(await read("a.csv", bytes), encoding).toEqual({ refused: "not-text" });
        }
    });

    test("UTF-16 with its byte-order mark is read, zero bytes and all", async () => {
        for (const encoding of ["utf-16le", "utf-16be"]) {
            const got = await read("a.csv", encode(encoding, "a,b\n1,2\n", { bom: true }));
            expect(got.refused, encoding).toBeUndefined();
            expect(got.settings.encoding, encoding).toBe(encoding);
            expect(got.table.columns.map((c) => [c.name, c.type]), encoding).toEqual([["a", "INTEGER"], ["b", "INTEGER"]]);
            expect(got.data, encoding).toEqual([[1, 2]]);
        }
    });
});

// ---- what the plan leaves as the library reads it ---------------------------------------------------------------------------------

// Plan section 9: "a line holding only `""` is skipped; ... a file that mixes line endings is read with
// the one found in its first megabyte, so the other kind stays inside fields". Nothing decides these
// two but the library and the settings the module hands it (skipEmptyLines, the newline it is told),
// so a version of Papa Parse that reads them otherwise, or a change of the settings, must be noticed.
// (The same two files are imported through the dialog in aw2-import-fixtures.spec.js.)
test.describe("what the plan leaves as the library reads it (plan section 9)", () => {
    test.beforeEach(skipUnlessFirst);

    const CUTS = [1, 2, 3, 5, null];

    test('a line holding only "" is skipped, in the start and in the whole read, whatever the size of the pieces', async () => {
        const { csv } = await modules();
        const text = 'a,b\n1,2\n""\n3,4\n';
        const start = csv.readStart(Papa, text);
        expect(start.delimiter).toBe(",");
        expect(start.newline).toBe("\n");
        // three rows, the names and the two around the line of "" (a row of rule 5 it is not)
        expect(start.rows).toEqual([["a", "b"], ["1", "2"], ["3", "4"]]);
        for (const n of CUTS) {
            const { rows, badQuotes } = await rowsFromPieces(n === null ? [text] : cutInto(text, n), { delimiter: ",", newline: "\n" });
            expect(rows, `pieces of ${n ?? "the whole text"}`).toEqual(start.rows);
            expect(badQuotes, `pieces of ${n ?? "the whole text"}`).toBe(false);
        }
        // and as a table: two rows, no row of NULLs between them
        const { data, table } = await tableFrom(start.rows);
        expect(table.rows).toBe(2);
        expect(data).toEqual([["1", "2"], ["3", "4"]]);
    });

    test('a line of "" is not an empty field in other places: two quotes beside a delimiter are a row of two empty fields', async () => {
        // (so the skipping is of the line holding only "", and not of every quote pair)
        const start = (await modules()).csv.readStart(Papa, 'a,b\n1,2\n"",\n3,4\n');
        expect(start.rows).toEqual([["a", "b"], ["1", "2"], ["", ""], ["3", "4"]]);
    });

    test("a text that mixes line endings is read with the one its start gives, and the other kind stays inside fields", async () => {
        const { csv } = await modules();
        // CRLF twice, a lone line feed twice: the endings that stand outside quotes are mostly CRLF
        const text = "a,b\r\n1,2\n3,4\r\n5,6\n";
        const start = csv.readStart(Papa, text);
        expect(start.newline).toBe("\r\n");
        expect(start.rows).toEqual([["a", "b"], ["1", "2\n3", "4"], ["5", "6\n"]]);
        for (const n of CUTS) {
            const { rows, badQuotes } = await rowsFromPieces(n === null ? [text] : cutInto(text, n), { delimiter: ",", newline: start.newline });
            expect(rows, `pieces of ${n ?? "the whole text"}`).toEqual(start.rows);
            expect(badQuotes, `pieces of ${n ?? "the whole text"}`).toBe(false);
        }
    });

    test("a text whose first line break is a lone line feed is read with LF, so the carriage returns stay inside fields", async () => {
        const { csv } = await modules();
        const text = "a,b\n1,2\r\n3,4\n5,6\r\n";
        const start = csv.readStart(Papa, text);
        expect(start.newline).toBe("\n");
        expect(start.rows).toEqual([["a", "b"], ["1", "2\r"], ["3", "4"], ["5", "6\r"]]);
        for (const n of CUTS) {
            const { rows } = await rowsFromPieces(n === null ? [text] : cutInto(text, n), { delimiter: ",", newline: start.newline });
            expect(rows, `pieces of ${n ?? "the whole text"}`).toEqual(start.rows);
        }
    });

    test("the ending is found in the start of the text and used for the whole: a file that changes its ending after the start keeps the first one", async () => {
        const { csv } = await modules();
        // many CRLF rows, then lone line feeds; the start (the text that is read for the preview) holds only CRLF
        const head = "a,b\r\n" + "1,2\r\n".repeat(50);
        const tail = "3,4\n5,6\n";
        expect(csv.readStart(Papa, head).newline).toBe("\r\n");
        const { rows } = await rowsFromPieces(cutInto(head + tail, 7), { delimiter: ",", newline: "\r\n" });
        // the lines of the tail are not rows: they run on in the last field
        expect(rows.length).toBe(52);
        expect(rows[51]).toEqual(["3", "4\n5", "6\n"]);
    });
});

// ---- the library -------------------------------------------------------------------------------------------------------------

// ---- edges that no other group holds -------------------------

// Each of these is a line of js/lab/import-text.js or js/lab/import-csv.js that could be changed,
// with every test passing, although a student could then see the difference. The comment over each
// test says what the change was.
test.describe("edges that a sweep of the code by mutation found unheld", () => {
    test.beforeEach(skipUnlessFirst);

    // (the end anchor of the name's pattern taken out: a.xlsx.csv was refused as a workbook)
    test("a workbook's name ENDS in .xls or .xlsx: a name that only holds one of them before its ending is a text file's", async () => {
        const { text } = await modules();
        const markup = bytesOf("<a>,b\n1,2\n");
        const kind = (name) => text.kindByStart(Uint8Array.from(markup), markup.length, name);
        for (const name of ["a.xlsx.csv", "notes.xls.txt", "A.XLSX.TSV", "xlsx", "xls.csv"]) {
            expect(kind(name), name).toBe("text");
        }
        for (const name of ["a.xlsx", "a.XLS", "a.csv.xls", ".xlsx"]) {
            expect(kind(name), name).toBe("markup");
        }
    });

    // (`<` for `<=` in the loop over the slices: one more, empty slice, and between called again)
    test("a file of a whole number of slices is read in that many: between is called once for each and not once more", async () => {
        const { text } = await modules();
        const eight = () => blobOf(bytesOf("01234567"));
        const inspected = [];
        await text.inspectText(eight(), { sliceBytes: 4, between: async (read) => inspected.push(read) });
        expect(inspected).toEqual([4, 8]);
        const fitted = [];
        await text.fitsEncoding(eight(), "utf-8", { sliceBytes: 4, between: async (read) => fitted.push(read) });
        expect(fitted).toEqual([4, 8]);
        const pieced = [];
        expect((await collect(text.textPieces(eight(), "utf-8", { sliceBytes: 4, between: async (read) => pieced.push(read) }))).join("")).toBe("01234567");
        expect(pieced).toEqual([4, 8]);
    });

    // (`await` taken off the call of between: a dialog that had closed, which throws there, no
    // longer stopped the pass; the file was read to its end, and the page got an error for each
    // slice)
    for (const [name, pass] of [
        ["inspectText", (text, blob, between) => text.inspectText(blob, { sliceBytes: 4, between })],
        ["fitsEncoding", (text, blob, between) => text.fitsEncoding(blob, "utf-8", { sliceBytes: 4, between })],
    ]) {
        test(`what between throws stops ${name} at once: it rejects with it, and between is not called again`, async () => {
            const { text } = await modules();
            const seen = [];
            const stop = new Error("stop");
            await expect(
                pass(text, blobOf(bytesOf("0123456789")), async (read) => {
                    seen.push(read);
                    throw stop;
                })
            ).rejects.toBe(stop);
            // (a turn of the event loop: a pass that went on would have read its next slice by now)
            await new Promise((resolve) => setImmediate(resolve));
            await new Promise((resolve) => setImmediate(resolve));
            expect(seen).toEqual([4]);
        });
    }

    // (`break` for `continue` at a quote that starts no field: the quoted fields after it were no
    // longer taken out, and the line breaks inside them counted for the line ending)
    test("a quote that starts no field does not end the taking out of the quoted fields after it: their line breaks are not counted", async () => {
        const { csv } = await modules();
        const text = 'a"b,"1\r\n2\r\n3",c\n4,5\n';
        expect(csv.lineEnding(text, [","])).toBe("\n");
        const start = csv.readStart(Papa, text);
        expect(start.newline).toBe("\n");
        expect(start.rows).toEqual([['a"b', "1\r\n2\r\n3", "c"], ["4", "5"]]);
    });

    // (the search for the next carriage return begun two characters on: one that follows
    // another was skipped, and a Windows file converted twice was read as a file of carriage
    // returns)
    test("two carriage returns before a line feed are two: both are counted, and the pair still wins", async () => {
        const { csv } = await modules();
        const text = "a,b\r\r\n1,2\r\n";
        expect(csv.lineEnding(text, [","])).toBe("\r\n");
        const start = csv.readStart(Papa, text);
        expect(start.newline).toBe("\r\n");
        expect(start.rows).toEqual([["a", "b\r"], ["1", "2"]]);
    });

    // (two characters taken off the end of a text that is not whole, where the carriage return
    // alone is not to be counted: a line feed before it went too, and the ending came out as the
    // carriage return)
    test("a text that is not whole and ends with a carriage return loses that one character for the count, and no other", async () => {
        const { csv } = await modules();
        const one = csv.readStart(Papa, "a,b\r\n\r", { whole: false });
        expect(one.newline).toBe("\r\n");
        expect(one.rows).toEqual([["a", "b"]]);
        const two = csv.readStart(Papa, "a,b\r\n1,2\r\n\r", { whole: false });
        expect(two.newline).toBe("\r\n");
        expect(two.rows).toEqual([["a", "b"], ["1", "2"]]);
    });

    // (a field of one space made NULL with the empty field: rule 5 says a field of spaces is a
    // value)
    test("a field of one space is a value: the empty field alone becomes NULL and counts as a blank", async () => {
        const { data, table } = await tableFrom([["a", "b"], [" ", "x"], ["  ", "y"], ["", "z"]]);
        expect(data).toEqual([[" ", "x"], ["  ", "y"], [null, "z"]]);
        expect(table.columns.map((column) => [column.name, column.blanks])).toEqual([["a", 1], ["b", 0]]);
    });
});

// ---- the pace of an import (js/lab/import-pace.js) -------------------------------------------------------------

// newPace() with the clock and the frames in the test's hands. The module is read as text and run
// with stand-ins for what it takes from the page (performance, requestAnimationFrame, and
// globalThis for scheduler), so Node's own are left alone and each test has a module of its own;
// its one import (the two numbers) and its two exports (newPace, and nextFrame, which the export
// of tables also waits on by itself) are taken off for that. (No other test runs this module on
// its own, and a rest that waited for the 250 ms timer where a frame would do, or for a frame at
// every piece, only made the import slower, which no other test measures.)
test.describe("import pace: when a rest waits for a frame, and how a plain turn is taken", () => {
    test.beforeEach(skipUnlessFirst);

    async function paceWith({ scheduler } = {}) {
        const { FRAME_MAX_MS, PAINT_EVERY_MS } = await config();
        const source = fs.readFileSync(path.join(__dirname, "..", "js", "lab", "import-pace.js"), "utf8");
        const body = source.replace(/^import \{[^}]*\} from "\.\/config-workflow\.js";$/m, "").replace(/^export function (newPace|nextFrame)\b/gm, "function $1");
        expect(body, "the module's one import and two exports are taken off").not.toMatch(/^\s*(?:import|export)\b/m);
        expect(source.match(/^export\b.*$/gm), "and it exports those two, nothing else").toEqual(["export function nextFrame() {", "export function newPace() {"]);
        const state = { now: 1000, asked: 0, frames: [] };
        const make = new Function("performance", "requestAnimationFrame", "globalThis", "FRAME_MAX_MS", "PAINT_EVERY_MS", `${body}\nreturn { newPace, nextFrame };`);
        const { newPace, nextFrame } = make(
            { now: () => state.now },
            (callback) => {
                state.asked++;
                state.frames.push(callback);
                return state.asked;
            },
            { scheduler },
            FRAME_MAX_MS,
            PAINT_EVERY_MS
        );
        // the browser draws: every frame that was asked for is given
        const draw = () => state.frames.splice(0).forEach((callback) => callback(state.now));
        return { pace: newPace(), nextFrame, state, draw, PAINT_EVERY_MS };
    }
    // a few turns of Node's own loop: what could go on by itself has gone on
    const turns = async () => {
        for (let i = 0; i < 4; i++) {
            await new Promise((resolve) => setImmediate(resolve));
        }
    };
    // "rested" when the promise ends by itself; "stalled" when it has not after two seconds (the
    // bound is for the failure alone: a rest that ends does so at once, or after FRAME_MAX_MS)
    const outcome = (promise) => Promise.race([promise.then(() => "rested"), new Promise((resolve) => setTimeout(() => resolve("stalled"), 2000))]);

    test("before PAINT_EVERY_MS have passed a rest is a plain turn: it ends by itself and asks for no frame", async () => {
        const { pace, state, PAINT_EVERY_MS } = await paceWith();
        state.now += PAINT_EVERY_MS - 1;
        expect(await outcome(pace.rest())).toBe("rested");
        expect(state.asked).toBe(0);
    });

    test("once PAINT_EVERY_MS have passed a rest asks for one frame and ends when it has been drawn, not before; and the count starts again from there", async () => {
        const { pace, state, draw, PAINT_EVERY_MS } = await paceWith();
        state.now += PAINT_EVERY_MS;
        let rested = false;
        const rest = pace.rest().then(() => {
            rested = true;
        });
        await turns();
        expect(state.asked, "one frame is asked for").toBe(1);
        expect(rested, "the rest has not ended before the frame").toBe(false);
        draw();
        expect(await outcome(rest)).toBe("rested");
        // 50 ms after that frame: a plain turn again, and no second frame
        state.now += 50;
        expect(await outcome(pace.rest())).toBe("rested");
        expect(state.asked, "no second frame so soon after the first").toBe(1);
        // and a whole interval after it: the next frame
        state.now += PAINT_EVERY_MS;
        const next = pace.rest();
        await turns();
        expect(state.asked).toBe(2);
        draw();
        expect(await outcome(next)).toBe("rested");
    });

    test("a tab that draws no frame does not stall the import: the rest ends by itself after FRAME_MAX_MS", async () => {
        const { pace, state, PAINT_EVERY_MS } = await paceWith();
        state.now += PAINT_EVERY_MS;
        // (no frame is ever given: a hidden tab)
        expect(await outcome(pace.rest())).toBe("rested");
        expect(state.asked).toBe(1);
    });

    test("where scheduler.yield is missing a plain turn is a message on the module's own channel: every rest ends, in the order they were asked for", async () => {
        const { pace } = await paceWith();
        const order = [];
        const all = Promise.all([1, 2, 3, 4].map((n) => pace.rest().then(() => order.push(n))));
        expect(await outcome(all)).toBe("rested");
        expect(order).toEqual([1, 2, 3, 4]);
        // and again, when the channel is there already
        expect(await outcome(pace.rest())).toBe("rested");
    });

    // (the export of tables waits for a frame by itself: before its dialog's first count and before
    // its first piece, so that what it has just shown is on screen)
    test("nextFrame by itself asks for one frame and ends when it has been drawn, not before, however little time has passed", async () => {
        const { nextFrame, state, draw } = await paceWith();
        let ended = false;
        const wait = nextFrame().then(() => {
            ended = true;
        });
        await turns();
        expect(state.asked, "one frame is asked for").toBe(1);
        expect(ended, "it has not ended before the frame").toBe(false);
        draw();
        expect(await outcome(wait)).toBe("rested");
    });

    test("nextFrame lets its caller go on in a task of its own after the frame's callbacks, not inside them: the promise ends when the timer of 0 ms it asked for in the frame has run", async () => {
        const { nextFrame, state, draw } = await paceWith();
        const { FRAME_MAX_MS } = await config();
        // the timers are collected, not run: no real time passes in this test (the real one is put back in any case)
        const realSetTimeout = globalThis.setTimeout;
        const timers = [];
        globalThis.setTimeout = (callback, ms) => timers.push({ callback, ms });
        // (microtasks only: a few turns of the promises, with no timer in them)
        const microtasks = async () => {
            for (let i = 0; i < 20; i++) {
                await Promise.resolve();
            }
        };
        try {
            let ended = false;
            const wait = nextFrame().then(() => {
                ended = true;
            });
            await microtasks();
            expect(state.asked, "one frame is asked for").toBe(1);
            expect(
                timers.map((timer) => timer.ms),
                "before the frame: only the timer for a tab that draws no frame"
            ).toEqual([FRAME_MAX_MS]);
            draw();
            await microtasks();
            expect(ended, "it has not ended inside the frame's callback, nor in the microtasks after it").toBe(false);
            expect(
                timers.map((timer) => timer.ms),
                "the frame's callback asked for a timer of 0 ms"
            ).toEqual([FRAME_MAX_MS, 0]);
            // the timer of 0 ms runs: now it ends
            timers[1].callback();
            await microtasks();
            expect(ended, "it ends when the timer of 0 ms has run").toBe(true);
            await wait;
            // (the timer for a tab that draws no frame, running late, is called once more: the call does not throw.
            // A promise ends once, so nothing more can be seen)
            timers[0].callback();
            await microtasks();
        } finally {
            globalThis.setTimeout = realSetTimeout;
        }
    });

    test("nextFrame in a tab that draws no frame ends by itself after FRAME_MAX_MS", async () => {
        const { nextFrame, state } = await paceWith();
        const started = Date.now();
        expect(await outcome(nextFrame())).toBe("rested");
        expect(state.asked).toBe(1);
        // (not at once: it gave the frame its time. The bound is loose, a timer can be a little early.)
        const { FRAME_MAX_MS } = await config();
        expect(Date.now() - started).toBeGreaterThanOrEqual(FRAME_MAX_MS - 20);
    });

    test("where scheduler.yield is there, a plain turn is that", async () => {
        let yields = 0;
        const scheduler = {
            yield: () => {
                yields++;
                return Promise.resolve();
            },
        };
        const { pace } = await paceWith({ scheduler });
        expect(await outcome(pace.rest())).toBe("rested");
        expect(await outcome(pace.rest())).toBe("rested");
        expect(yields).toBe(2);
    });
});

// js/lab/import-db.js, namesNeedingQuotes: which names of a new table a query must write in double
// quotes. The answers are the engine's and are held in the page (tests/aw2-import-fixtures.spec.js);
// here the function is given a stand-in for the database, to hold what no import can reach: the
// text of the two queries it asks with, the names it must never write bare, and that nothing is
// thrown.
test.describe("import db: the names to quote, asked with a stand-in for the engine", () => {
    test.beforeEach(skipUnlessFirst);
    // a database that answers 1 to every query, or what `answer` gives for it, and keeps the queries
    const standIn = (answer = () => 1) => {
        const asked = [];
        return {
            asked,
            db: {
                selectValue: (sql, bind) => {
                    asked.push({ sql, bind });
                    return answer(sql);
                },
            },
        };
    };

    test("each name is asked about once, unquoted and inside parentheses, with one text bound: a table after FROM and in front of a column, a column through a subquery", async () => {
        const { namesNeedingQuotes } = await load("import-db.js");
        const database = standIn();
        expect(namesNeedingQuotes(database, "sales", ["id", "Unit_Price"])).toEqual([]);
        expect(database.asked.map((query) => query.sql)).toEqual([
            'with "sales"(x) as (select ?1) select (sales.x) is ?1 from sales',
            'select (id) is ?1 from (select ?1 as "id")',
            'select (Unit_Price) is ?1 from (select ?1 as "Unit_Price")',
        ]);
        // one text, the same for every query, and not one a cell of a file can hold as it is
        const bound = database.asked.map((query) => query.bind);
        expect(bound.every((bind) => Array.isArray(bind) && bind.length === 1 && bind[0] === bound[0][0])).toBe(true);
        expect(typeof bound[0][0]).toBe("string");
        expect(bound[0][0]).toMatch(/[\u0000-\u001f]/);
    });

    test("a name is listed when its query answers anything but 1, or is refused; the table's first, then the columns in order", async () => {
        const { namesNeedingQuotes } = await load("import-db.js");
        const refused = (sql) => {
            if (/\((b|t\.x)\)/.test(sql)) {
                throw new Error("near: syntax error");
            }
            return /\(d\)/.test(sql) ? 0 : /\(e\)/.test(sql) ? null : /\(f\)/.test(sql) ? "1" : /\(g\)/.test(sql) ? true : 1;
        };
        expect(namesNeedingQuotes(standIn(refused), "t", ["a", "b", "c", "d", "e", "f", "g", "h"])).toEqual(["t", "b", "d", "e", "f", "g"]);
        expect(namesNeedingQuotes(standIn(() => 0), "t", ["a"])).toEqual(["t", "a"]);
    });

    test("a name that is not ASCII letters, digits and underscores, or starts with a digit, is listed and never written bare", async () => {
        const { namesNeedingQuotes } = await load("import-db.js");
        const odd = ["c d", "é", "9x", "a-b", "x;drop table t", 'q"q', "tab\tname", "line\nbreak", "a\n", "", "naïve", "x)", "(x"];
        const database = standIn();
        expect(namesNeedingQuotes(database, "a b", ["ok", ...odd, "ok_2"])).toEqual(["a b", ...odd]);
        // only the two plain names reached the engine
        expect(database.asked.map((query) => query.sql)).toEqual(['select (ok) is ?1 from (select ?1 as "ok")', 'select (ok_2) is ?1 from (select ?1 as "ok_2")']);
        // and a table's odd name is not tried either
        const second = standIn();
        expect(namesNeedingQuotes(second, "9lives", [])).toEqual(["9lives"]);
        expect(second.asked).toEqual([]);
    });

    test("a word is named once whatever its letter case, in the spelling met first; a column that is fine is asked about every time", async () => {
        const { namesNeedingQuotes } = await load("import-db.js");
        const quote = (sql) => (/\((group|Group|GROUP|select)(\.x)?\)/.test(sql) ? 0 : 1);
        expect(namesNeedingQuotes(standIn(quote), "Group", ["Group", "group", "GROUP", "x", "select", "SELECT"])).toEqual(["Group", "select"]);
        expect(namesNeedingQuotes(standIn(quote), "plain", ["group", "Group", "x"])).toEqual(["group"]);
        // letters outside A to Z are not folded (SQLite does not fold them either)
        expect(namesNeedingQuotes(standIn(), "t", ["É", "é"])).toEqual(["É", "é"]);
    });

    test("nothing is thrown, and a list comes back: a database that cannot be asked, no columns, names that are not text", async () => {
        const { namesNeedingQuotes } = await load("import-db.js");
        const tries = [
            () => namesNeedingQuotes(null, "t", ["a"]),
            () => namesNeedingQuotes({}, "t", ["a"]),
            () => namesNeedingQuotes({ db: null }, "t", ["a"]),
            () => namesNeedingQuotes(standIn(), "t", null),
            () => namesNeedingQuotes(standIn(), "t", undefined),
            () => namesNeedingQuotes(standIn(), null, [null, undefined, 5, {}]),
            () => namesNeedingQuotes(standIn(() => { throw new Error("out of memory"); }), "t", ["a", "b"]),
        ];
        for (const [i, attempt] of tries.entries()) {
            let result;
            expect(() => (result = attempt()), `try ${i}`).not.toThrow();
            expect(Array.isArray(result), `try ${i}`).toBe(true);
        }
        // an engine that refuses every query lists every name: a refusal means "needs quotes"
        expect(tries[6]()).toEqual(["t", "a", "b"]);
    });
});

test.describe("the vendored library", () => {
    test.beforeEach(skipUnlessFirst);

    // The publisher's own file, unchanged (plan section 2, "New libraries are vendored"): the file
    // papaparse.min.js of the npm package papaparse, version 5.7.1. On 2026-11-16 it was compared
    // byte for byte with cdn.jsdelivr.net/npm/papaparse@5.7.1/papaparse.min.js and with
    // unpkg.com/papaparse@5.7.1/papaparse.min.js, and is identical to both (nothing is fetched here).
    // A new version is vendored by replacing the file, its licence and these two values together.
    test("vendor/papaparse.min.js is the publisher's file, unchanged: its size and its SHA-256 are those of papaparse 5.7.1", () => {
        const bytes = fs.readFileSync(path.join(__dirname, "..", "vendor", "papaparse.min.js"));
        expect(bytes.length).toBe(19012);
        expect(crypto.createHash("sha256").update(bytes).digest("hex")).toBe("e032656b2c709e9a756d5be817da9885d58b2313c43d432c414eb8534a752685");
    });

    test("vendor/papaparse.min.js starts with the banner naming Papa Parse v5.7.1", () => {
        const head = fs.readFileSync(path.join(__dirname, "..", "vendor", "papaparse.min.js"), "utf8").slice(0, 300);
        expect(head).toMatch(/^\/\*[\s\S]*?Papa Parse\s+v5\.7\.1\b[\s\S]*?\*\//);
        expect(head).toContain("MIT");
        expect(Papa.parse).toBeInstanceOf(Function);
    });

    test("vendor/papaparse.LICENSE.txt says MIT", () => {
        const licence = fs.readFileSync(path.join(__dirname, "..", "vendor", "papaparse.LICENSE.txt"), "utf8");
        expect(licence).toMatch(/\bMIT\b/);
        expect(licence).toContain("Permission is hereby granted");
    });
});
