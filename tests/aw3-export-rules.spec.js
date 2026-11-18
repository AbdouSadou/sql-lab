const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const zlib = require("node:zlib");
const { pathToFileURL } = require("node:url");
const Papa = require("../vendor/papaparse.min.js");
const fflate = require("../vendor/fflate.min.js");
const { test, expect, readZip, crc32, skipUnlessFirst, seeded, ZIP_TOOL } = require("./helpers");

// Assessment plan, Phase 3 (export of tables as CSV): the pure module of the export,
// js/lab/export-csv.js (the text of a file, the names of the files, the plan of the output, the
// limits of a zip), the sinks of js/lab/export-tables.js (where the bytes of a file or a zip go),
// the texts of js/lab/config-workflow.js that are built from numbers and names, and the vendored zip
// library. No page and no engine: the engine side (js/lab/export-read.js) is proved against the
// owner's fixtures by the page tests. What the code does is written in CODEMAP 9.7, and what it is
// held to in the plan's sections 5 and 6.
//
// Each function is held to the plan's section 5 ("Export") and to what the module's header
// comment promises:
//   fieldText    the quoting rule: a comma, a quote, a carriage return, a line feed, a space at the
//                start or at the end. Cases by hand, then a generated property through the
//                vendored Papa Parse, which must read back every text that was written.
//   realText     the REAL rule: a table of sixty-two values with the text that the owner's own
//                tests/fixtures/tools/rules.py (export_number) gives for each, worked out by running
//                that file and written here, so nothing in this spec computes its own answer; then
//                two thousand doubles from a seeded generator, each held to the rule itself (no
//                exponent, a decimal point, the same number when read back, the fewest digits).
//   valueText, rowText, headerText, CSV_BOM   by storage class; a BLOB as cellText writes it.
//   csvFileNames, tablesZipName   the fourteen names of the owner's fixture in the dialog's order;
//                each alone; the collisions in each letter case; an empty name; a dot in a name;
//                names that are not ASCII; the zip's name beside csvFileName of js/lab/results.js.
//   planOutput (and the renamed mark of its entries), zipProblem (with the limits of its own).
//   fileSink, zipSink and sinkFor of js/lab/export-tables.js, with the vendored library: what each refuses,
//                what a failing or a buffer-reusing library does to the bytes, the date of an entry.
//   the texts built from numbers and names (progress, failure, the notice about the events), and
//                engineLine of js/lab/runner.js.
//   the words of the export, typed out: every text a student reads, each constant and each
//                function that makes a sentence (with examples of every branch), and a test that
//                fails when the module exports words that none of them types out.
//   the vendored library: its size, its SHA-256, its licence, and a zip written in pieces with Zip
//                and ZipDeflate, read back by the reader of tests/helpers.js, which does not use
//                fflate (readZip is held to its own faults here too: a CRC that does not match, a
//                size, a cut file).
// Everything runs in Node, once. The fixtures are only read.

const load = (file) => import(pathToFileURL(path.join(__dirname, "..", "js", "lab", file)).href);

let loaded = null;
const modules = () =>
    (loaded ??= Promise.all([
        load("export-csv.js"),
        load("config-workflow.js"),
        load("config.js"),
        load("results.js"),
        load("import-rules.js"),
        load("cell-text.js"),
        load("export-read.js"),
        load("export-tables.js"),
        load("runner.js"),
    ]).then(([csv, config, mainConfig, results, rules, cellText, read, tables, runner]) => ({ csv, config, mainConfig, results, rules, cellText, read, tables, runner })));

const FIXTURE_EXPORT = path.join(__dirname, "fixtures", "export");
const expectedExport = () => JSON.parse(fs.readFileSync(path.join(__dirname, "fixtures", "expected", "export.json"), "utf8"));

// ---- fieldText ------------------------------------------------------------------------------------

test.describe("fieldText: the quoting rule", () => {
    test.beforeEach(skipUnlessFirst);

    test("a text with none of the five reasons is written as it is", async () => {
        const { csv } = await modules();
        for (const text of ["", "a", "Order ID", "a b", "tab\there", "é 😀", "x'deadbeef'", "=SUM(A1:A3)", "+441632960001", "00123", "2023-08-05", "a'b", "semi;colon", "back\\slash", "\u0000", "a\u0000b", " nbsp "]) {
            expect(csv.fieldText(text), JSON.stringify(text)).toBe(text);
        }
    });

    test("a comma, a quote, a carriage return, a line feed, a space at the start or at the end: quoted, each quote doubled", async () => {
        const { csv } = await modules();
        const cases = [
            ["a,b", '"a,b"'],
            [",", '","'],
            ['say "hi"', '"say ""hi"""'],
            ['"', '""""'],
            ['""', '""""""'],
            ["line\nbreak", '"line\nbreak"'],
            ["line\rbreak", '"line\rbreak"'],
            ["line\r\nbreak", '"line\r\nbreak"'],
            ["\n", '"\n"'],
            [" lead", '" lead"'],
            ["trail ", '"trail "'],
            [" ", '" "'],
            ["  ", '"  "'],
            [" both ", '" both "'],
            ["a, b", '"a, b"'],
        ];
        for (const [text, written] of cases) {
            expect(csv.fieldText(text), JSON.stringify(text)).toBe(written);
        }
    });

    test("a space inside a text, and the other kinds of white space at its ends, do not make it quoted: only the space character does", async () => {
        const { csv } = await modules();
        expect(csv.fieldText("a b c")).toBe("a b c");
        expect(csv.fieldText("\tlead")).toBe("\tlead");
        expect(csv.fieldText("trail\t")).toBe("trail\t");
        expect(csv.fieldText(" lead")).toBe(" lead");
        expect(csv.fieldText("trail　")).toBe("trail　");
        expect(csv.fieldText("\u2028x")).toBe("\u2028x");
    });

    test("a value that is not a string is written as its text", async () => {
        const { csv } = await modules();
        expect(csv.fieldText(42)).toBe("42");
        expect(csv.fieldText(12345678901234567890n)).toBe("12345678901234567890");
    });

    test("2,000 generated texts, written in rows, are read back as they were by Papa Parse (a second implementation)", async () => {
        const { csv } = await modules();
        const random = seeded(2024);
        const alphabet = ["a", "b", "x", " ", " ", ",", '"', '"', "\r", "\n", "\t", "é", "😀", "\u0000", ";", "'", "="];
        const text = () => Array.from({ length: Math.floor(random() * 9) }, () => alphabet[Math.floor(random() * alphabet.length)]).join("");
        const rows = Array.from({ length: 2000 }, () => [text(), text(), text()]);
        const written = rows.map((row) => `${row.map(csv.fieldText).join(",")}\r\n`).join("");
        const read = Papa.parse(written, { delimiter: ",", newline: "\r\n", quoteChar: '"' });
        expect(read.errors).toEqual([]);
        // (the last line ends with the line ending: Papa reports one empty row after it)
        expect(read.data.slice(0, rows.length)).toEqual(rows);
        expect(read.data.length).toBe(rows.length + 1);
        // and only the texts that need it were quoted
        for (const [i, row] of rows.entries()) {
            for (const field of row) {
                const quoted = csv.fieldText(field).startsWith('"');
                const needs = /[",\r\n]/.test(field) || field.startsWith(" ") || field.endsWith(" ");
                expect(quoted, `${i}: ${JSON.stringify(field)}`).toBe(needs);
            }
        }
    });
});

// ---- realText -------------------------------------------------------------------------------------

// [the double, the text tests/fixtures/tools/rules.py export_number gives for it]. Worked out by
// running that file (Python's repr gives the fewest digits; decimal.format(..., "f") writes them
// out without an exponent) for each of these, and written here; the two infinities and negative
// zero are what the plan's section 9 says Phase 3 decided (rules.py writes them as this module does).
const REAL_TABLE = [
    [5e-324, "0.000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000005"],
    [2.2250738585072014e-308, "0.000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000022250738585072014"],
    [1.7976931348623157e+308, "179769313486231570000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000.0"],
    [1e+21, "1000000000000000000000.0"],
    [1e+22, "10000000000000000000000.0"],
    [1e-07, "0.0000001"],
    [1e-06, "0.000001"],
    [0.30000000000000004, "0.30000000000000004"],
    [123456.789, "123456.789"],
    [1.0, "1.0"],
    [2.0, "2.0"],
    [100.0, "100.0"],
    [0.5, "0.5"],
    [0.25, "0.25"],
    [0.1, "0.1"],
    [1.5, "1.5"],
    [-1.5, "-1.5"],
    [-2.0, "-2.0"],
    [-100.0, "-100.0"],
    [-0.1, "-0.1"],
    [-123456.789, "-123456.789"],
    [-0.0, "-0.0"],
    [Infinity, "Infinity"],
    [-Infinity, "-Infinity"],
    [1.5e+20, "150000000000000000000.0"],
    [1e+20, "100000000000000000000.0"],
    [1.2345678901234568e+20, "123456789012345680000.0"],
    [1.2345678901234567e+19, "12345678901234567000.0"],
    [0.000123, "0.000123"],
    [2.5e-10, "0.00000000025"],
    [-2.5e-10, "-0.00000000025"],
    [1.5e+300, "1500000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000.0"],
    [-1.5e+300, "-1500000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000.0"],
    [3.14, "3.14"],
    [9007199254740992.0, "9007199254740992.0"],
    [4.35, "4.35"],
    [1000000000000000.0, "1000000000000000.0"],
    [1e+16, "10000000000000000.0"],
    [1e+17, "100000000000000000.0"],
    [123456789.12345679, "123456789.12345679"],
    [5.992310449541053e+307, "59923104495410530000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000.0"],
    [6.675221575521604e-308, "0.00000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000006675221575521604"],
    [1e-10, "0.0000000001"],
    [1e-300, "0.000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000001"],
    [5e-05, "0.00005"],
    [9.999999999999998e+19, "99999999999999980000.0"],
    [0.1234567890123456, "0.1234567890123456"],
    [0.3333333333333333, "0.3333333333333333"],
    [0.6666666666666666, "0.6666666666666666"],
    [1e+100, "10000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000.0"],
    [-1e+100, "-10000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000.0"],
    [3e-09, "0.000000003"],
    [4.2e-08, "0.000000042"],
    [7.0, "7.0"],
    [1234.5, "1234.5"],
    [0.07, "0.07"],
    [1e+23, "100000000000000000000000.0"],
    [8.5e-07, "0.00000085"],
    [65536.0, "65536.0"],
    [9.223372036854776e+18, "9223372036854776000.0"],
    [-9.223372036854776e+18, "-9223372036854776000.0"],
    [1.25e+21, "1250000000000000000000.0"],
];

test.describe("realText: the plan's rule for a REAL", () => {
    test.beforeEach(skipUnlessFirst);

    test("a table of sixty-two doubles gives the text of the owner's rules.py for each", async () => {
        const { csv } = await modules();
        expect(REAL_TABLE.length).toBeGreaterThanOrEqual(60);
        for (const [number, text] of REAL_TABLE) {
            expect(csv.realText(number), String(number)).toBe(text);
        }
    });

    test("the table holds what the plan names: the smallest and largest doubles, 1e21, 1e-7, 0.1 + 0.2, 123456.789, whole values, negatives, negative zero, both infinities", async () => {
        const { csv } = await modules();
        const has = (x) => REAL_TABLE.some(([number]) => Object.is(number, x));
        for (const x of [5e-324, 1.7976931348623157e308, 1e21, 1e-7, 0.1 + 0.2, 123456.789, 1, 2, 100, -1.5, -100, -0, Infinity, -Infinity]) {
            expect(has(x), String(x)).toBe(true);
        }
        expect(csv.realText(5e-324)).toBe(`0.${"0".repeat(323)}5`);
        expect(csv.realText(5e-324)).toHaveLength(326);
        expect(csv.realText(1.7976931348623157e308)).toBe(`${"17976931348623157".padEnd(309, "0")}.0`);
        expect(csv.realText(1.7976931348623157e308)).toHaveLength(311);
        expect(csv.realText(1e21)).toBe("1000000000000000000000.0");
        expect(csv.realText(1e-7)).toBe("0.0000001");
        expect(csv.realText(0.1 + 0.2)).toBe("0.30000000000000004");
        expect(csv.realText(123456.789)).toBe("123456.789");
    });

    test("a whole number keeps its point, a number that JavaScript writes with an exponent is written out, the sign stays", async () => {
        const { csv } = await modules();
        const cases = [
            [1, "1.0"],
            [-1, "-1.0"],
            [0, "0.0"],
            [10, "10.0"],
            [1e20, "100000000000000000000.0"],
            [1.5e21, "1500000000000000000000.0"],
            [1.25e21, "1250000000000000000000.0"],
            [-1e21, "-1000000000000000000000.0"],
            [1.234e25, "12340000000000000000000000.0"],
            [1e-6, "0.000001"],
            [-1e-7, "-0.0000001"],
            [1.5e-7, "0.00000015"],
            [-2.5e-10, "-0.00000000025"],
            [9007199254740992, "9007199254740992.0"],
        ];
        for (const [number, text] of cases) {
            expect(csv.realText(number), String(number)).toBe(text);
        }
    });

    test("negative zero is -0.0, positive zero 0.0; an infinity is the word Infinity or -Infinity (the plan's section 9, decided in Phase 3)", async () => {
        const { csv } = await modules();
        expect(csv.realText(-0)).toBe("-0.0");
        expect(csv.realText(0)).toBe("0.0");
        expect(csv.realText(Infinity)).toBe("Infinity");
        expect(csv.realText(-Infinity)).toBe("-Infinity");
        // (SQLite keeps no NaN, it stores NULL: said in words if one ever came)
        expect(csv.realText(NaN)).toBe("NaN");
    });

    test("2,000 doubles of every size from a seeded generator: no exponent, a decimal point, the same number read back, and the fewest digits", async () => {
        const { csv } = await modules();
        const random = seeded(31337);
        const view = new DataView(new ArrayBuffer(8));
        const doubles = [];
        while (doubles.length < 2000) {
            const kind = doubles.length % 4;
            let x;
            if (kind === 0) {
                // any pattern of 64 bits: every size from 5e-324 to 1.8e308
                view.setUint32(0, Math.floor(random() * 4294967296));
                view.setUint32(4, Math.floor(random() * 4294967296));
                x = view.getFloat64(0);
            } else if (kind === 1) {
                // short decimals, as a person types them
                x = Math.round((random() - 0.5) * 2e7) / 10 ** Math.floor(random() * 6);
            } else if (kind === 2) {
                // whole values up to 1e30
                x = Math.floor(random() * 10 ** Math.floor(random() * 30)) * (random() < 0.5 ? -1 : 1);
            } else {
                // tiny and huge, by the exponent
                x = (random() + 0.1) * 10 ** (Math.floor(random() * 80) - 40);
            }
            if (Number.isFinite(x)) {
                doubles.push(x);
            }
        }
        const digitsOf = (text) => text.replace(/^-/, "").replace(".", "").replace(/^0+/, "").replace(/0+$/, "");
        for (const x of doubles) {
            const text = csv.realText(x);
            expect(text, String(x)).not.toMatch(/[eE]/);
            expect(text, String(x)).toMatch(/^-?\d+\.\d+$/);
            expect(Number(text), String(x)).toBe(x);
            // the fewest digits: JavaScript's own shortest text has the same digits
            const js = String(x);
            const significant = js.replace(/^-/, "").replace(/e[+-]\d+$/, "").replace(".", "").replace(/^0+/, "").replace(/0+$/, "");
            if (x !== 0) {
                expect(digitsOf(text), String(x)).toBe(significant);
            }
            expect(text.startsWith("-"), String(x)).toBe(x < 0 || Object.is(x, -0));
        }
        expect(doubles.some((x) => Math.abs(x) < 1e-7)).toBe(true);
        expect(doubles.some((x) => Math.abs(x) >= 1e21)).toBe(true);
    });
});

// ---- valueText, rowText, headerText ---------------------------------------------------------------

test.describe("valueText, rowText and headerText: a value by its storage class", () => {
    test.beforeEach(skipUnlessFirst);

    test("the engine's own numbers for the kinds", async () => {
        const { csv } = await modules();
        expect(csv.VALUE_KINDS).toEqual({ INTEGER: 1, FLOAT: 2, TEXT: 3, BLOB: 4, NULL: 5 });
    });

    test("the kinds are the reader's own object, handed on, not a second copy that could drift", async () => {
        const { csv, read } = await modules();
        expect(csv.VALUE_KINDS).toBe(read.VALUE_KINDS);
        expect(Object.isFrozen(read.VALUE_KINDS)).toBe(true);
    });

    test("an INTEGER is its digits, whatever its size: a Number or a BigInt", async () => {
        const { csv } = await modules();
        expect(csv.valueText(1, 42)).toBe("42");
        expect(csv.valueText(1, -7)).toBe("-7");
        expect(csv.valueText(1, 0)).toBe("0");
        expect(csv.valueText(1, 9007199254740991)).toBe("9007199254740991");
        expect(csv.valueText(1, 9007199254740993n)).toBe("9007199254740993");
        expect(csv.valueText(1, -9223372036854775808n)).toBe("-9223372036854775808");
        expect(csv.valueText(1, 9223372036854775807n)).toBe("9223372036854775807");
    });

    test("a FLOAT by the REAL rule, so that the REAL 1.0 and the INTEGER 1 differ though both are the Number 1", async () => {
        const { csv } = await modules();
        expect(csv.valueText(2, 1)).toBe("1.0");
        expect(csv.valueText(1, 1)).toBe("1");
        expect(csv.valueText(2, 3.14)).toBe("3.14");
        expect(csv.valueText(2, -0)).toBe("-0.0");
        expect(csv.valueText(2, Infinity)).toBe("Infinity");
        expect(csv.valueText(2, 1e21)).toBe("1000000000000000000000.0");
    });

    test("a TEXT by fieldText, so that the text 42 stays 42 and the text of a formula is not changed", async () => {
        const { csv } = await modules();
        expect(csv.valueText(3, "42")).toBe("42");
        expect(csv.valueText(3, "00123")).toBe("00123");
        expect(csv.valueText(3, "=SUM(A1:A3)")).toBe("=SUM(A1:A3)");
        expect(csv.valueText(3, "a,b")).toBe('"a,b"');
        expect(csv.valueText(3, "")).toBe("");
        expect(csv.valueText(3, "a\u0000b")).toBe("a\u0000b");
        // (a text that looks like a blob reads the same as a blob: the plan says so)
        expect(csv.valueText(3, "x'deadbeef'")).toBe(csv.valueText(4, Uint8Array.of(0xde, 0xad, 0xbe, 0xef)));
    });

    test("a BLOB is x'<lower-case hex>' as cellText of the results pane writes it, an empty one is x'', and a NULL is empty", async () => {
        const { csv, cellText } = await modules();
        expect(csv.valueText(4, Uint8Array.of(0xde, 0xad, 0xbe, 0xef))).toBe("x'deadbeef'");
        expect(csv.valueText(4, Uint8Array.of(0, 1, 15, 16, 255))).toBe("x'00010f10ff'");
        expect(csv.valueText(4, new Uint8Array(0))).toBe("x''");
        expect(csv.valueText(5, null)).toBe("");
        const random = seeded(7);
        for (let n = 0; n < 200; n++) {
            const bytes = Uint8Array.from({ length: Math.floor(random() * 40) }, () => Math.floor(random() * 256));
            expect(csv.valueText(4, bytes)).toBe(cellText.cellText(bytes));
        }
    });

    test("a kind the engine does not have throws", async () => {
        const { csv } = await modules();
        for (const kind of [0, 6, -1, undefined, null, "1", 1.5]) {
            expect(() => csv.valueText(kind, 1), String(kind)).toThrow(/unknown kind/);
        }
    });

    test("rowText: the fields joined by commas, CRLF at the end, the BLOBs counted", async () => {
        const { csv } = await modules();
        expect(csv.rowText([1, 2, 3, 4, 5], [1, 1, "a,b", Uint8Array.of(1), null])).toEqual({ text: `1,1.0,"a,b",x'01',\r\n`, blobs: 1 });
        expect(csv.rowText([4, 4, 1], [new Uint8Array(0), Uint8Array.of(255), 3])).toEqual({ text: "x'',x'ff',3\r\n", blobs: 2 });
        expect(csv.rowText([5], [null])).toEqual({ text: "\r\n", blobs: 0 });
        expect(csv.rowText([5, 5], [null, null])).toEqual({ text: ",\r\n", blobs: 0 });
        expect(csv.rowText([], [])).toEqual({ text: "\r\n", blobs: 0 });
        expect(csv.rowText([3, 3], ["line\nbreak", ' "q" '])).toEqual({ text: '"line\nbreak"," ""q"" "\r\n', blobs: 0 });
    });

    test("headerText: the names through fieldText, CRLF at the end; the byte-order mark is its three bytes", async () => {
        const { csv } = await modules();
        expect(csv.headerText(["id", "name"])).toBe("id,name\r\n");
        expect(csv.headerText(["Order ID", "Unit Price (£)", "select", "Notes, misc"])).toBe('Order ID,Unit Price (£),select,"Notes, misc"\r\n');
        expect(csv.headerText(['a"b', " x"])).toBe('"a""b"," x"\r\n');
        expect(csv.headerText([""])).toBe("\r\n");
        expect([...csv.CSV_BOM]).toEqual([0xef, 0xbb, 0xbf]);
        expect(Buffer.from("﻿", "utf8").equals(Buffer.from(csv.CSV_BOM))).toBe(true);
    });

    test("a file as the page writes it, from the values of the owner's mixed_types table, is the owner's expected file", async () => {
        const { csv } = await modules();
        // (the values and their kinds as export-read.js hands them over: a Number or a BigInt for an
        // INTEGER, a Number for a FLOAT, a string, a Uint8Array for a BLOB, null)
        const rows = [
            [[1, 1, 3], [1, 42, "integer"]],
            [[1, 2, 3], [2, 3.14, "real"]],
            [[1, 3, 3], [3, "text", "text"]],
            [[1, 5, 3], [4, null, "null"]],
            [[1, 4, 3], [5, Uint8Array.of(0xde, 0xad, 0xbe, 0xef), "blob of four bytes"]],
            [[1, 3, 3], [6, "", "empty string"]],
            [[1, 3, 3], [7, "42", "the text 42"]],
        ];
        // (kinds: id INTEGER; v by row: INTEGER 42, FLOAT 3.14, TEXT, NULL, BLOB, TEXT, TEXT)
        const vKinds = [1, 2, 3, 5, 4, 3, 3];
        const text = csv.headerText(["id", "v", "note"]) + rows.map(([, values], i) => csv.rowText([1, vKinds[i], 3], values).text).join("");
        const expected = fs.readFileSync(path.join(FIXTURE_EXPORT, "expected_csv", "mixed_types.csv"));
        expect(Buffer.concat([Buffer.from(csv.CSV_BOM), Buffer.from(text, "utf8")]).equals(expected)).toBe(true);
    });
});

// ---- the names ------------------------------------------------------------------------------------

test.describe("csvFileNames and tablesZipName: what the files are called", () => {
    test.beforeEach(skipUnlessFirst);

    test("the owner's fourteen objects, in the dialog's order, give the fourteen names of the expected files", async () => {
        const { csv } = await modules();
        const tables = expectedExport().tables;
        expect(tables).toHaveLength(14);
        const names = csv.csvFileNames(tables.map((table) => table.name));
        expect(names).toEqual(tables.map((table) => path.basename(table.expected_csv)));
        expect(names).toEqual([
            "Order_Details.csv",
            "basic.csv",
            "big_2000.csv",
            "con.csv",
            "dates_iso.csv",
            "empty_table.csv",
            "mixed_types.csv",
            "monthly_revenue_by_region_and_channel_2024.csv",
            "number_edge.csv",
            "order.csv",
            "sales_2024.csv",
            "sales_2024_2.csv",
            "text_edge.csv",
            "v_basic_summary.csv",
        ]);
        // each of those files is there, and the folder holds no other
        expect(fs.readdirSync(path.join(FIXTURE_EXPORT, "expected_csv")).sort()).toEqual([...names].sort());
    });

    test("each of the fourteen alone is called by its own name: sales_2024 is sales_2024.csv alone, and sales_2024_2.csv only beside sales/2024", async () => {
        const { csv, rules } = await modules();
        for (const { name } of expectedExport().tables) {
            expect(csv.csvFileNames([name]), name).toEqual([`${rules.sanitiseName(name)}.csv`]);
        }
        expect(csv.csvFileNames(["sales_2024"])).toEqual(["sales_2024.csv"]);
        expect(csv.csvFileNames(["sales/2024"])).toEqual(["sales_2024.csv"]);
        expect(csv.csvFileNames(["Order Details"])).toEqual(["Order_Details.csv"]);
        expect(csv.csvFileNames(["sales/2024", "sales_2024"])).toEqual(["sales_2024.csv", "sales_2024_2.csv"]);
        // (the order of the dialog decides who gets the plain name)
        expect(csv.csvFileNames(["sales_2024", "sales/2024"])).toEqual(["sales_2024.csv", "sales_2024_2.csv"]);
        expect(csv.csvFileNames(["sales_2024", "x", "sales/2024"])).toEqual(["sales_2024.csv", "x.csv", "sales_2024_2.csv"]);
    });

    test("a collision is judged without regard to the case of A to Z, as SQLite and Windows judge it: _2, _3, in the dialog's order", async () => {
        const { csv } = await modules();
        expect(csv.csvFileNames(["Sales", "sales"])).toEqual(["Sales.csv", "sales_2.csv"]);
        expect(csv.csvFileNames(["sales", "SALES", "Sales"])).toEqual(["sales.csv", "SALES_2.csv", "Sales_3.csv"]);
        expect(csv.csvFileNames(["a", "A", "a_2", "a"])).toEqual(["a.csv", "A_2.csv", "a_2_2.csv", "a_3.csv"]);
        expect(csv.csvFileNames(["order", "Order"])).toEqual(["order.csv", "Order_2.csv"]);
        // (only A to Z: the letters SQLite folds)
        expect(csv.csvFileNames(["É", "é"])).toEqual(["_.csv", "__2.csv"]);
    });

    test("an empty name, or one that sanitising empties, is called table, and several of them table, table_2, table_3", async () => {
        const { csv } = await modules();
        expect(csv.csvFileNames([""])).toEqual(["table.csv"]);
        expect(csv.csvFileNames(["", ""])).toEqual(["table.csv", "table_2.csv"]);
        expect(csv.csvFileNames(["", "table", ""])).toEqual(["table.csv", "table_2.csv", "table_3.csv"]);
        expect(csv.csvFileNames(["a", ""])).toEqual(["a.csv", "table.csv"]);
    });

    test("a dot in a name is part of the name and never an extension: data.v2 is data_v2.csv", async () => {
        const { csv } = await modules();
        expect(csv.csvFileNames(["data.v2"])).toEqual(["data_v2.csv"]);
        expect(csv.csvFileNames(["v2.report"])).toEqual(["v2_report.csv"]);
        expect(csv.csvFileNames(["report.csv"])).toEqual(["report_csv.csv"]);
        expect(csv.csvFileNames([".hidden"])).toEqual(["_hidden.csv"]);
        expect(csv.csvFileNames(["a.b", "a_b"])).toEqual(["a_b.csv", "a_b_2.csv"]);
    });

    test("a name that is not ASCII, or starts with a digit, goes through the import's naming rule", async () => {
        const { csv } = await modules();
        expect(csv.csvFileNames(["café"])).toEqual(["caf_.csv"]);
        expect(csv.csvFileNames(["日本語"])).toEqual(["_.csv"]);
        expect(csv.csvFileNames(["日本語", "中文"])).toEqual(["_.csv", "__2.csv"]);
        expect(csv.csvFileNames(["😀 party"])).toEqual(["_party.csv"]);
        expect(csv.csvFileNames(["2024"])).toEqual(["c_2024.csv"]);
        expect(csv.csvFileNames(["2024 sales", "c_2024_sales"])).toEqual(["c_2024_sales.csv", "c_2024_sales_2.csv"]);
        expect(csv.csvFileNames(['a"b', "a\\b", "a:b"])).toEqual(["a_b.csv", "a_b_2.csv", "a_b_3.csv"]);
        expect(csv.csvFileNames(["../x"])).toEqual(["_x.csv"]);
        expect(csv.csvFileNames(["a\u0000b"])).toEqual(["a_b.csv"]);
    });

    test("a name Windows keeps for itself is left alone (con.csv), and a long name is cut to EXPORT_NAME_MAX_CHARS", async () => {
        const { csv, config } = await modules();
        expect(csv.csvFileNames(["con", "nul", "prn"])).toEqual(["con.csv", "nul.csv", "prn.csv"]);
        expect(config.EXPORT_NAME_MAX_CHARS).toBe(100);
        const long = "t".repeat(300);
        expect(csv.csvFileNames([long])).toEqual([`${"t".repeat(config.EXPORT_NAME_MAX_CHARS)}.csv`]);
        expect(csv.csvFileNames([long])[0]).toHaveLength(104);
    });

    test("the cut: a name of 100 characters is not cut, one of 101 is, and the c_ put before a leading digit counts in the 100", async () => {
        const { csv, config } = await modules();
        const max = config.EXPORT_NAME_MAX_CHARS;
        expect(csv.csvFileNames(["a".repeat(max)])).toEqual([`${"a".repeat(max)}.csv`]);
        expect(csv.csvFileNames(["a".repeat(max + 1)])).toEqual([`${"a".repeat(max)}.csv`]);
        // (letters that differ only after the cut are gone with it)
        expect(csv.csvFileNames([`${"a".repeat(max - 1)}bcd`])).toEqual([`${"a".repeat(max - 1)}b.csv`]);
        // a leading digit gets c_ in front: 98 characters and a digit first are 100 with it, 99 are 101
        const digit98 = `7${"b".repeat(max - 3)}`;
        expect(digit98).toHaveLength(max - 2);
        expect(csv.csvFileNames([digit98])).toEqual([`c_${digit98}.csv`]);
        expect(`c_${digit98}`).toHaveLength(max);
        const digit99 = `7${"b".repeat(max - 2)}`;
        expect(csv.csvFileNames([digit99])).toEqual([`c_7${"b".repeat(max - 2)}`.slice(0, max) + ".csv"]);
        expect(csv.csvFileNames([digit99])[0]).toHaveLength(max + 4);
        // the cut is made on the sanitised name: a run of odd characters is one underscore before it counts
        expect(csv.csvFileNames([`${"é".repeat(60)}${"x".repeat(max)}`])).toEqual([`_${"x".repeat(max - 1)}.csv`]);
    });

    test("two names that are alike in their first 100 characters come out with _2, _3 after the cut", async () => {
        const { csv, config } = await modules();
        const base = "n".repeat(config.EXPORT_NAME_MAX_CHARS);
        expect(csv.csvFileNames([`${base}x`, `${base}y`, `${base}z`])).toEqual([`${base}.csv`, `${base}_2.csv`, `${base}_3.csv`]);
        // (and a table that is exactly the cut name takes the plain name when it comes first)
        expect(csv.csvFileNames([base, `${base}y`])).toEqual([`${base}.csv`, `${base}_2.csv`]);
        expect(csv.csvFileNames([`${base}y`, base])).toEqual([`${base}.csv`, `${base}_2.csv`]);
        // (and in the other case of A to Z)
        expect(csv.csvFileNames([`${base}x`, `${base.toUpperCase()}y`])).toEqual([`${base}.csv`, `${base.toUpperCase()}_2.csv`]);
    });

    test("the longest file name that can come out is far under the 255 bytes a computer keeps: 100, a suffix of a thousand tables, .csv", async () => {
        const { csv, config } = await modules();
        const base = "n".repeat(config.EXPORT_NAME_MAX_CHARS);
        const names = csv.csvFileNames(Array.from({ length: 1000 }, (unused, i) => `${base}${i}`));
        expect(new Set(names.map((name) => name.toLowerCase())).size).toBe(1000);
        expect(names[999]).toBe(`${base}_1000.csv`);
        const longest = Math.max(...names.map((name) => Buffer.byteLength(name, "utf8")));
        expect(longest).toBe(config.EXPORT_NAME_MAX_CHARS + "_1000".length + ".csv".length);
        expect(longest).toBeLessThan(255 / 2);
        // (a name that is not ASCII has been turned into ASCII before it is counted, so characters are bytes)
        expect(Buffer.byteLength(csv.csvFileNames(["😀".repeat(500)])[0], "utf8")).toBeLessThan(10);
    });

    test("no table: no name", async () => {
        const { csv } = await modules();
        expect(csv.csvFileNames([])).toEqual([]);
    });

    // the plain rule, written out: the name itself, else _2, _3 ..., the first that is free, a name
    // being the same as another without regard to the case of A to Z
    const plainNames = (rules, max, tableNames) => {
        const taken = new Set();
        const key = (name) => name.replace(/[A-Z]/g, (letter) => letter.toLowerCase());
        return tableNames.map((table) => {
            const base = (rules.sanitiseName(table) || "table").slice(0, max);
            let name = base;
            for (let n = 2; taken.has(key(name)); n++) {
                name = `${base}_${n}`;
            }
            taken.add(key(name));
            return `${name}.csv`;
        });
    };

    test("batches that hold many names alike get exactly the names of the plain rule: no letter of A to Z, equal once cleaned, a name that is another's numbered form, names cut at 100", async () => {
        const { csv, config, rules } = await modules();
        const max = config.EXPORT_NAME_MAX_CHARS;
        const random = seeded(4242);
        const pick = (list) => list[Math.floor(random() * list.length)];
        const pool = [
            "a", "a", "A", "a_2", "A_2", "a_3", "a_2_2", "a_10", "t", "T_2",
            "", " ", "é", "日本", "😀", "/", "a b", "a-b", "a.b", "a_b", "A B",
            "2024", "c_2024", "_", "__", "_2", "_3",
            "n".repeat(max), `${"n".repeat(max)}x`, `${"n".repeat(max)}y`, `${"N".repeat(max)}z`, `${"n".repeat(max - 2)}_2`, `${"n".repeat(max - 1)}_2`,
            "x".repeat(max + 50),
        ];
        let withNumbered = 0;
        for (let batch = 0; batch < 300; batch++) {
            const names = Array.from({ length: 1 + Math.floor(random() * 60) }, () => pick(pool));
            const given = csv.csvFileNames(names);
            expect(given, JSON.stringify(names)).toEqual(plainNames(rules, max, names));
            if (given.some((name) => /_\d+\.csv$/.test(name))) {
                withNumbered++;
            }
        }
        // (the batches did meet numbered names: a test that never did would pin nothing)
        expect(withNumbered).toBeGreaterThan(250);
        // names with no letter of A to Z at all, three hundred of them: _, __2 ... as the rule gives
        const nonLatin = Array.from({ length: 300 }, (unused, i) => String.fromCharCode(0x4e00 + i));
        expect(csv.csvFileNames(nonLatin)).toEqual(plainNames(rules, max, nonLatin));
        expect(csv.csvFileNames(nonLatin).slice(0, 3)).toEqual(["_.csv", "__2.csv", "__3.csv"]);
        // a name that is another's numbered form, in both orders
        expect(csv.csvFileNames(["a", "a", "a_2", "A_2"])).toEqual(["a.csv", "a_2.csv", "a_2_2.csv", "A_2_3.csv"]);
        expect(csv.csvFileNames(["a_2", "a", "a", "a"])).toEqual(["a_2.csv", "a.csv", "a_3.csv", "a_4.csv"]);
    });

    test("the look-ups do not grow with the square: 5,000 tables whose names come out alike cost a few look-ups each", async () => {
        const { csv } = await modules();
        const names = Array.from({ length: 5000 }, (unused, i) => String.fromCharCode(0x4e00 + i));
        const realHas = Set.prototype.has;
        let calls = 0;
        let files;
        Set.prototype.has = function counted(value) {
            calls++;
            return realHas.call(this, value);
        };
        try {
            files = csv.csvFileNames(names);
        } finally {
            Set.prototype.has = realHas;
        }
        expect(Set.prototype.has).toBe(realHas);
        // (they are all "_" and are made unique: _, __2, __3 ...)
        expect(files).toHaveLength(5000);
        expect(files[0]).toBe("_.csv");
        expect(files[4999]).toBe("__5000.csv");
        expect(new Set(files).size).toBe(5000);
        // each table asks for its own name and for the first free number: a handful of look-ups,
        // where counting again from 2 for every table asks for millions
        expect(calls).toBeLessThan(5000 * 5);
    });

    test("the zip is named after the database: the name without .db, .sqlite or .sqlite3 in any letter case, then -tables.zip", async () => {
        const { csv } = await modules();
        const cases = [
            ["export_edge_cases.db", "export_edge_cases-tables.zip"],
            ["sales.sqlite", "sales-tables.zip"],
            ["sales.sqlite3", "sales-tables.zip"],
            ["SALES.DB", "SALES-tables.zip"],
            ["Sales.SQLite3", "Sales-tables.zip"],
            ["school.sql", "school-tables.zip"],
            ["school.db.sql", "school-tables.zip"],
            ["my data.db", "my data-tables.zip"],
            ["northlight", "northlight-tables.zip"],
            ["a.b.db", "a.b-tables.zip"],
            ["x.sqlite.db", "x.sqlite-tables.zip"],
            ["a/b\\c:d.db", "a_b_c_d-tables.zip"],
            ["  spaced.db  ", "spaced-tables.zip"],
        ];
        for (const [database, zip] of cases) {
            expect(csv.tablesZipName(database), database).toBe(zip);
        }
    });

    test("the zip's name for a database name near the cut of 100 characters: typed out, as the results download is named", async () => {
        const { csv } = await modules();
        const a = (count) => "a".repeat(count);
        // (the name is cut to 100 characters, then the ending is taken off what is left: a name of
        // 98 or 99 letters before .db keeps a piece of its ending, as the results download does)
        const cases = [
            [`${a(97)}.db`, `${a(97)}-tables.zip`],
            [`${a(98)}.db`, `${a(98)}.d-tables.zip`],
            [`${a(99)}.db`, `${a(99)}.-tables.zip`],
            [`${a(100)}.db`, `${a(100)}-tables.zip`],
            [`${a(103)}.db`, `${a(100)}-tables.zip`],
            [".db", "db-tables.zip"],
        ];
        for (const [database, zip] of cases) {
            expect(csv.tablesZipName(database), `${database.length} characters`).toBe(zip);
        }
        expect(cases[1][1]).toHaveLength(98 + ".d-tables.zip".length);
    });

    test("what is left of the database's name after the ending is taken off, or cut away, is kept as it is: a space or a dot before the ending stays, and the cut at 100 characters may end in a space", async () => {
        const { csv } = await modules();
        // (the name is cleaned once, before the ending is taken off; what is left is not cleaned again,
        // as the results download does it. The first name is cut at 100 characters, of which the last is a
        // space: the ending goes with the cut, and the space stays)
        const cases = [
            [`${"a".repeat(99)} b.db`, `${"a".repeat(99)} -tables.zip`],
            ["my data .db", "my data -tables.zip"],
            ["report..db", "report.-tables.zip"],
            ["report .sqlite3", "report -tables.zip"],
        ];
        for (const [database, zip] of cases) {
            expect(csv.tablesZipName(database), database).toBe(zip);
        }
    });

    test("the zip's name has the base of the results download's name for the same database names near the cut (results.js loads in Node)", async () => {
        const { csv, results, mainConfig, config } = await modules();
        const names = [97, 98, 99, 100, 101, 102, 103].map((count) => `${"a".repeat(count)}.db`).concat([".db", `${"b".repeat(99)}.sqlite`, `${"c".repeat(95)}.sqlite3`, `${"a".repeat(99)} b.db`, "my data .db", "report..db", "report .sqlite3"]);
        for (const name of names) {
            const zip = csv.tablesZipName(name);
            const file = results.csvFileName(name);
            expect(zip.endsWith(config.EXPORT_ZIP_SUFFIX), name).toBe(true);
            expect(file.endsWith(mainConfig.CSV_FILE_SUFFIX), name).toBe(true);
            expect(zip.slice(0, -config.EXPORT_ZIP_SUFFIX.length), `${name.length} characters`).toBe(file.slice(0, -mainConfig.CSV_FILE_SUFFIX.length));
        }
    });

    test("a database without a usable name is called by the page's fallback name", async () => {
        const { csv, mainConfig } = await modules();
        for (const name of ["", null, undefined, "///", "...", "   "]) {
            expect(csv.tablesZipName(name), String(name)).toBe(`${mainConfig.EXPORT_FALLBACK_NAME}-tables.zip`);
        }
    });

    test("the zip's name is that of the results pane's csvFileName for the same database, but for its ending", async () => {
        const { csv, results, mainConfig, config } = await modules();
        expect(config.EXPORT_ZIP_SUFFIX).toBe("-tables.zip");
        expect(mainConfig.CSV_FILE_SUFFIX).toBe("-result.csv");
        const names = [
            "export_edge_cases.db",
            "A.SQLITE3",
            "x.sql",
            "sales.db.sql",
            "",
            null,
            undefined,
            "a/b:c.db",
            "..",
            ".db",
            "x.DB",
            "my data.sqlite",
            "weird\u0001name.db",
            "é.db",
            `${"long".repeat(50)}.sqlite`,
            "con.db",
            "evidence-x.txt",
            `${"a".repeat(99)} b.db`,
            "my data .db",
            "report..db",
        ];
        for (const name of names) {
            const stem = (file, suffix) => file.slice(0, file.length - suffix.length);
            expect(stem(csv.tablesZipName(name), config.EXPORT_ZIP_SUFFIX), String(name)).toBe(stem(results.csvFileName(name), mainConfig.CSV_FILE_SUFFIX));
        }
        // (by hand: the same texts worked out without either function)
        expect(results.csvFileName("export_edge_cases.db")).toBe("export_edge_cases-result.csv");
        expect(csv.tablesZipName("export_edge_cases.db")).toBe("export_edge_cases-tables.zip");
    });
});

// ---- planOutput -----------------------------------------------------------------------------------

test.describe("planOutput: what is saved", () => {
    test.beforeEach(skipUnlessFirst);

    test("one table is a CSV file: its name, its type, no library", async () => {
        const { csv } = await modules();
        const plan = csv.planOutput({ format: "csv", databaseName: "sales.db", tables: ["basic"] });
        expect(plan).toEqual({
            format: "csv",
            kind: "file",
            fileName: "basic.csv",
            type: "text/csv;charset=utf-8",
            library: null,
            entries: [{ table: "basic", name: "basic.csv", renamed: false }],
        });
        // (whatever the database is called, and a table whose name is all of the database's)
        expect(csv.planOutput({ format: "csv", databaseName: null, tables: ["sales/2024"] }).fileName).toBe("sales_2024.csv");
        expect(csv.planOutput({ format: "csv", databaseName: "x.db", tables: [""] }).fileName).toBe("table.csv");
    });

    test("two or more tables are a zip named after the database, with the library that writes it and unique entry names in the dialog's order", async () => {
        const { csv } = await modules();
        const plan = csv.planOutput({ format: "csv", databaseName: "sales.db", tables: ["sales/2024", "sales_2024", "Sales_2024"] });
        expect(plan).toEqual({
            format: "csv",
            kind: "zip",
            fileName: "sales-tables.zip",
            type: "application/zip",
            library: { file: ZIP_TOOL, global: "fflate" },
            entries: [
                { table: "sales/2024", name: "sales_2024.csv", renamed: true },
                { table: "sales_2024", name: "sales_2024_2.csv", renamed: true },
                { table: "Sales_2024", name: "Sales_2024_3.csv", renamed: true },
            ],
        });
        const two = csv.planOutput({ format: "csv", databaseName: "a.sqlite", tables: ["x", "y"] });
        expect([two.kind, two.fileName, two.entries.map((entry) => entry.name)]).toEqual(["zip", "a-tables.zip", ["x.csv", "y.csv"]]);
    });

    test("the fourteen of the fixture are a zip of fourteen entries named export_edge_cases-tables.zip", async () => {
        const { csv } = await modules();
        const tables = expectedExport().tables.map((table) => table.name);
        const plan = csv.planOutput({ format: "csv", databaseName: "export_edge_cases.db", tables });
        expect(plan.fileName).toBe("export_edge_cases-tables.zip");
        expect(plan.entries.map((entry) => entry.table)).toEqual(tables);
        expect(plan.entries.map((entry) => entry.name)).toEqual(csv.csvFileNames(tables));
        expect(new Set(plan.entries.map((entry) => entry.name.toLowerCase())).size).toBe(14);
    });

    test("the library is a copy of the setting, not the setting itself, and the plan is made afresh each time", async () => {
        const { csv, config } = await modules();
        const a = csv.planOutput({ format: "csv", databaseName: "x", tables: ["a", "b"] });
        const b = csv.planOutput({ format: "csv", databaseName: "x", tables: ["a", "b"] });
        expect(a).toEqual(b);
        expect(a).not.toBe(b);
        expect(a.library).toEqual(config.EXPORT_ZIP_LIBRARY);
        a.library.file = "changed";
        expect(csv.planOutput({ format: "csv", databaseName: "x", tables: ["a", "b"] }).library.file).toBe(ZIP_TOOL);
    });

    test("renamed is false for a table whose file is its own name and .csv", async () => {
        const { csv } = await modules();
        const plan = (tables) => csv.planOutput({ format: "csv", databaseName: "x.db", tables });
        expect(plan(["basic"]).entries).toEqual([{ table: "basic", name: "basic.csv", renamed: false }]);
        expect(plan(["Order", "sales_2024", "T_1", "table"]).entries.map((entry) => entry.renamed)).toEqual([false, false, false, false]);
        expect(plan(["a".repeat(100)]).entries[0].renamed).toBe(false);
        // (a zip's entries as well as a single file's)
        expect(plan(["x", "y"]).entries.map((entry) => [entry.name, entry.renamed])).toEqual([["x.csv", false], ["y.csv", false]]);
    });

    test("renamed is true for each way a name changes: a character made an underscore, a leading digit, _2, a cut, the fallback table", async () => {
        const { csv } = await modules();
        const plan = (tables) => csv.planOutput({ format: "csv", databaseName: "x.db", tables });
        const renamed = (tables) => plan(tables).entries.map((entry) => entry.renamed);
        // a character made an underscore (the single file's entry too)
        expect(renamed(["Order Details"])).toEqual([true]);
        expect(renamed(["data.v2", "a-b", "é"])).toEqual([true, true, true]);
        expect(renamed(["report.csv"])).toEqual([true]);
        // a leading digit gets c_
        expect(renamed(["2024"])).toEqual([true]);
        // a name that another took: _2 (the first one keeps its own name: sales_2024 is sales_2024.csv)
        expect(renamed(["sales_2024", "sales/2024"])).toEqual([false, true]);
        expect(renamed(["a", "A"])).toEqual([false, true]);
        expect(renamed(["a", "a_2", "a_2"])).toEqual([false, false, true]);
        // a cut
        expect(renamed(["a".repeat(101)])).toEqual([true]);
        expect(renamed(["a".repeat(100), "a".repeat(101)])).toEqual([false, true]);
        // the fallback: an empty name, or one that sanitising empties, but not a table that is really called table
        expect(renamed([""])).toEqual([true]);
        expect(renamed(["table"])).toEqual([false]);
        expect(renamed(["", "table"])).toEqual([true, true]);
        expect(renamed(["table", ""])).toEqual([false, true]);
    });

    test("no table gives no plan, and a format that is not csv throws", async () => {
        const { csv } = await modules();
        expect(csv.planOutput({ format: "csv", databaseName: "x", tables: [] })).toBeNull();
        for (const format of ["xlsx", "CSV", "", undefined, null]) {
            expect(() => csv.planOutput({ format, databaseName: "x", tables: ["a"] }), String(format)).toThrow(/unknown format/);
            expect(() => csv.planOutput({ format, databaseName: "x", tables: [] }), String(format)).toThrow(/unknown format/);
        }
    });
});

// ---- zipProblem -----------------------------------------------------------------------------------

test.describe("zipProblem: what a zip without Zip64 cannot hold", () => {
    test.beforeEach(skipUnlessFirst);

    test("65,535 entries and 4 GiB less one byte are the most a zip without Zip64 holds; one more of either is a problem", async () => {
        const { csv, config } = await modules();
        expect([config.EXPORT_ZIP_MAX_ENTRIES, config.EXPORT_ZIP_MAX_BYTES]).toEqual([65535, 4294967295]);
        expect(csv.zipProblem(1, 0)).toBe(false);
        expect(csv.zipProblem(14, 100_000)).toBe(false);
        expect(csv.zipProblem(300, 5_000_000)).toBe(false);
        expect(csv.zipProblem(65535, 1)).toBe(false);
        expect(csv.zipProblem(1, 4294967295)).toBe(false);
        expect(csv.zipProblem(65535, 4294967295)).toBe(false);
        expect(csv.zipProblem(65536, 1)).toBe(true);
        expect(csv.zipProblem(70000, 1)).toBe(true);
        expect(csv.zipProblem(1, 4294967296)).toBe(true);
        expect(csv.zipProblem(1, 5 * 2 ** 30)).toBe(true);
        expect(csv.zipProblem(70000, 5 * 2 ** 30)).toBe(true);
    });

    test("with limits of its own, the limits are those: a test can make a small zip too big", async () => {
        const { csv } = await modules();
        expect(csv.zipProblem(2, 0, { maxEntries: 2 })).toBe(false);
        expect(csv.zipProblem(3, 0, { maxEntries: 2 })).toBe(true);
        expect(csv.zipProblem(1, 1000, { maxBytes: 1000 })).toBe(false);
        expect(csv.zipProblem(1, 1001, { maxBytes: 1000 })).toBe(true);
        expect(csv.zipProblem(3, 1001, { maxEntries: 5, maxBytes: 2000 })).toBe(false);
        // (a limit that is given alone leaves the other as it was)
        expect(csv.zipProblem(65536, 0, { maxBytes: 10 })).toBe(true);
        expect(csv.zipProblem(65535, 10, { maxBytes: 10 })).toBe(false);
        expect(csv.zipProblem(1, 4294967296, { maxEntries: 2 })).toBe(true);
        expect(csv.zipProblem(2, 4294967295, { maxEntries: 2 })).toBe(false);
        // (with none, or with an empty object, it is what it was)
        expect(csv.zipProblem(65536, 1, undefined)).toBe(true);
        expect(csv.zipProblem(65536, 1, {})).toBe(true);
        expect(csv.zipProblem(65535, 4294967295, {})).toBe(false);
    });
});

// ---- the settings ---------------------------------------------------------------------------------

test.describe("the settings of the export", () => {
    test.beforeEach(skipUnlessFirst);

    test("the pieces, the zip's level and its limits are the plan's and CODEMAP 9.7's", async () => {
        const { config } = await modules();
        expect(config.EXPORT_PIECE_CHARS).toBe(65536);
        expect(config.EXPORT_PIECE_MS).toBe(25);
        expect(config.EXPORT_ZIP_LEVEL).toBe(6);
        expect(config.EXPORT_CSV_SUFFIX).toBe(".csv");
        expect(config.EXPORT_CSV_TYPE).toBe("text/csv;charset=utf-8");
        expect(config.EXPORT_ZIP_TYPE).toBe("application/zip");
        expect(config.EXPORT_ZIP_LIBRARY).toEqual({ file: ZIP_TOOL, global: "fflate" });
    });

    test("the library the plan names is a file of vendor/ and sets the global the plan names", async () => {
        const { config } = await modules();
        const file = path.join(__dirname, "..", "vendor", config.EXPORT_ZIP_LIBRARY.file);
        expect(fs.existsSync(file)).toBe(true);
        expect(typeof fflate.Zip).toBe("function");
        // (the UMD wrapper of the file puts the library on the global called by the setting)
        expect(fs.readFileSync(file, "utf8")).toContain(".fflate=");
        expect(config.EXPORT_ZIP_LIBRARY.global).toBe("fflate");
    });
});

// ---- readZip, the reader that does not use the library --------------------------------------------

// a zip written by hand: stored entries, no data descriptor, sizes in the local headers
function handZip(entries, { crcOf = crc32 } = {}) {
    const parts = [];
    const directory = [];
    let offset = 0;
    for (const { name, bytes } of entries) {
        const nameBytes = Buffer.from(name, "utf8");
        const local = Buffer.alloc(30);
        local.writeUInt32LE(0x04034b50, 0);
        local.writeUInt16LE(20, 4);
        local.writeUInt16LE(0x800, 6);
        local.writeUInt32LE(crcOf(bytes), 14);
        local.writeUInt32LE(bytes.length, 18);
        local.writeUInt32LE(bytes.length, 22);
        local.writeUInt16LE(nameBytes.length, 26);
        const central = Buffer.alloc(46);
        central.writeUInt32LE(0x02014b50, 0);
        central.writeUInt16LE(20, 4);
        central.writeUInt16LE(20, 6);
        central.writeUInt16LE(0x800, 8);
        central.writeUInt32LE(crcOf(bytes), 16);
        central.writeUInt32LE(bytes.length, 20);
        central.writeUInt32LE(bytes.length, 24);
        central.writeUInt16LE(nameBytes.length, 28);
        central.writeUInt32LE(offset, 42);
        directory.push(central, nameBytes);
        parts.push(local, nameBytes, Buffer.from(bytes));
        offset += 30 + nameBytes.length + bytes.length;
    }
    const directoryBytes = Buffer.concat(directory);
    const end = Buffer.alloc(22);
    end.writeUInt32LE(0x06054b50, 0);
    end.writeUInt16LE(entries.length, 8);
    end.writeUInt16LE(entries.length, 10);
    end.writeUInt32LE(directoryBytes.length, 12);
    end.writeUInt32LE(offset, 16);
    return Buffer.concat([...parts, directoryBytes, end]);
}

// a zip as the page writes it: a Zip made of ZipDeflate entries, each pushed in pieces
function libraryZip(entries, { pieceBytes = 5, level = 6, mtime = new Date(2026, 0, 2, 3, 4, 6) } = {}) {
    const chunks = [];
    let failure = null;
    const zip = new fflate.Zip((error, chunk) => {
        if (error) {
            failure ??= error;
            return;
        }
        // (a chunk may be the library's own buffer: copied)
        chunks.push(Uint8Array.prototype.slice.call(chunk));
    });
    for (const { name, bytes } of entries) {
        const entry = new fflate.ZipDeflate(name, { level });
        entry.mtime = mtime;
        zip.add(entry);
        for (let at = 0; at < bytes.length; at += pieceBytes) {
            entry.push(bytes.subarray(at, at + pieceBytes), false);
        }
        entry.push(new Uint8Array(0), true);
    }
    zip.end();
    expect(failure).toBeNull();
    return Buffer.concat(chunks);
}

// a zip written by hand, one entry at a time, so that one thing in it can be wrong. An entry is
// { name, bytes } and, to change what is written:
//   deflate     the data is deflated (else stored)
//   descriptor  "none" (the sizes are in the local header), "signed" (bit 3 of the flags, and a data
//               descriptor with its signature after the data), or "plain" (the same, without the signature)
//   local       values for the local header in place of the right ones: { crc, packed, size, date, time }
//   disk        the "disk number start" of the directory's entry
//   date, time  the entry's DOS date and time (the same in the local header and in the directory)
//   directoryDate, directoryTime   the directory's, when they are not the local header's
//   before      bytes written in front of the entry's local header (they belong to no entry)
//   offset      the offset that the directory gives for the entry, in place of where it was written
//   absent      the entry's local part is not written at all (the directory still lists it)
// and in the second argument: comment (of the end record), beforeDirectory (bytes written after the
// last entry), and cutDescriptor (that many bytes taken off the end of the last data descriptor).
const FINE_DATE = ((2026 - 1980) << 9) | (11 << 5) | 17;
const FINE_TIME = (12 << 11) | (30 << 5) | 2;

function fineZip(entries, { comment = "", beforeDirectory = Buffer.alloc(0), cutDescriptor = 0 } = {}) {
    const parts = [];
    const directory = [];
    let offset = 0;
    const push = (...buffers) => {
        for (const buffer of buffers) {
            parts.push(buffer);
            offset += buffer.length;
        }
    };
    for (const [n, entry] of entries.entries()) {
        const { name, bytes, deflate = false, descriptor = "none", local = {}, disk = 0, date = FINE_DATE, time = FINE_TIME, before = Buffer.alloc(0), absent = false } = entry;
        const nameBytes = Buffer.from(name, "utf8");
        const data = deflate ? zlib.deflateRawSync(bytes) : Buffer.from(bytes);
        const [crc, packed, size] = [crc32(bytes), data.length, bytes.length];
        const method = deflate ? 8 : 0;
        const flags = 0x800 | (descriptor === "none" ? 0 : 8);
        const header = Buffer.alloc(30);
        header.writeUInt32LE(0x04034b50, 0);
        header.writeUInt16LE(20, 4);
        header.writeUInt16LE(flags, 6);
        header.writeUInt16LE(method, 8);
        header.writeUInt16LE(local.time ?? time, 10);
        header.writeUInt16LE(local.date ?? date, 12);
        const [localCrc, localPacked, localSize] = descriptor === "none" ? [crc, packed, size] : [0, 0, 0];
        header.writeUInt32LE(local.crc ?? localCrc, 14);
        header.writeUInt32LE(local.packed ?? localPacked, 18);
        header.writeUInt32LE(local.size ?? localSize, 22);
        header.writeUInt16LE(nameBytes.length, 26);
        const central = Buffer.alloc(46);
        central.writeUInt32LE(0x02014b50, 0);
        central.writeUInt16LE(20, 4);
        central.writeUInt16LE(20, 6);
        central.writeUInt16LE(flags, 8);
        central.writeUInt16LE(method, 10);
        central.writeUInt16LE(entry.directoryTime ?? time, 12);
        central.writeUInt16LE(entry.directoryDate ?? date, 14);
        central.writeUInt32LE(crc, 16);
        central.writeUInt32LE(packed, 20);
        central.writeUInt32LE(size, 24);
        central.writeUInt16LE(nameBytes.length, 28);
        central.writeUInt16LE(disk, 34);
        push(before);
        central.writeUInt32LE(entry.offset ?? offset, 42);
        directory.push(central, nameBytes);
        if (absent) {
            continue;
        }
        push(header, nameBytes, data);
        if (descriptor !== "none") {
            const fields = Buffer.alloc(12);
            fields.writeUInt32LE(crc, 0);
            fields.writeUInt32LE(packed, 4);
            fields.writeUInt32LE(size, 8);
            let written = descriptor === "signed" ? Buffer.concat([Buffer.from([0x50, 0x4b, 0x07, 0x08]), fields]) : fields;
            if (cutDescriptor && n === entries.length - 1) {
                written = written.subarray(0, written.length - cutDescriptor);
            }
            push(written);
        }
    }
    push(beforeDirectory);
    const directoryBytes = Buffer.concat(directory);
    const commentBytes = Buffer.from(comment);
    const end = Buffer.alloc(22);
    end.writeUInt32LE(0x06054b50, 0);
    end.writeUInt16LE(entries.length, 8);
    end.writeUInt16LE(entries.length, 10);
    end.writeUInt32LE(directoryBytes.length, 12);
    end.writeUInt32LE(offset, 16);
    end.writeUInt16LE(commentBytes.length, 20);
    return Buffer.concat([...parts, directoryBytes, end, commentBytes]);
}

test.describe("readZip: the reader of tests/helpers.js, held to its own faults", () => {
    test.beforeEach(skipUnlessFirst);

    const files = () => [
        { name: "a.csv", bytes: Buffer.from("﻿id,name\r\n1,Ann\r\n2,Bo\r\n", "utf8") },
        { name: "b c.csv", bytes: Buffer.from("x\r\n".repeat(500), "utf8") },
        { name: "empty.csv", bytes: Buffer.alloc(0) },
    ];

    test("a zip written by hand, with nothing of the library in it, is read: names in the directory's order, bytes", () => {
        const read = readZip(handZip([...files(), { name: "d.csv", bytes: Buffer.from("again") }]));
        expect(read.map((entry) => entry.name)).toEqual(["a.csv", "b c.csv", "empty.csv", "d.csv"]);
        expect(read[0].bytes.equals(files()[0].bytes)).toBe(true);
        expect(read[1].bytes.toString()).toBe("x\r\n".repeat(500));
        expect(read[2].bytes).toHaveLength(0);
        expect(read[3].bytes.toString()).toBe("again");
    });

    test("a name that comes twice in a zip is refused, not collapsed", () => {
        expect(() => readZip(handZip([...files(), { name: "a.csv", bytes: Buffer.from("again") }]))).toThrow(/"a\.csv": the name comes twice/);
    });

    // the two entries that most of the cases below are made of
    const [first, second] = [
        { name: "a.csv", bytes: Buffer.from("x\r\n1\r\n") },
        { name: "b.csv", bytes: Buffer.from("y\r\n2\r\n") },
    ];
    const junk = (length) => Buffer.alloc(length, 0x41);
    // what the reader says of a zip: the entries' names, or the words of its refusal
    const namesOf = (zip) => readZip(zip).map((entry) => entry.name);

    test("the zip that the cases below change is read: stored, deflated, with and without a data descriptor", () => {
        for (const kind of [{}, { descriptor: "signed" }, { descriptor: "plain" }, { deflate: true }, { deflate: true, descriptor: "signed" }]) {
            const read = readZip(fineZip([{ ...first, ...kind }, { ...second, ...kind }]));
            expect(read.map((entry) => entry.name), JSON.stringify(kind)).toEqual(["a.csv", "b.csv"]);
            expect(read[0].bytes.equals(first.bytes), JSON.stringify(kind)).toBe(true);
            expect(read[1].bytes.equals(second.bytes), JSON.stringify(kind)).toBe(true);
            expect(read[0].method, JSON.stringify(kind)).toBe(kind.deflate ? 8 : 0);
            expect(read[0].mtime, JSON.stringify(kind)).toEqual(new Date(2026, 10, 17, 12, 30, 4));
        }
    });

    test("a name that is empty, starts with a slash, has a backslash or has a '..' part is refused, each told for what it is", () => {
        const refused = [
            ["", /entry 2: an empty name/],
            ["/etc/x.csv", /"\/etc\/x\.csv": a name that starts with "\/"/],
            ["/", /"\/": a name that starts with "\/"/],
            ["a\\b.csv", /"a\\\\b\.csv": a name with a backslash/],
            ["\\a.csv", /"\\\\a\.csv": a name with a backslash/],
            ["../evil.csv", /"\.\.\/evil\.csv": a name with a "\.\." part/],
            ["a/../b.csv", /"a\/\.\.\/b\.csv": a name with a "\.\." part/],
            ["a/..", /"a\/\.\.": a name with a "\.\." part/],
            ["..", /"\.\.": a name with a "\.\." part/],
        ];
        for (const [name, message] of refused) {
            expect(() => readZip(fineZip([first, { name, bytes: second.bytes }])), JSON.stringify(name)).toThrow(message);
        }
        // (a name of the same letters that is not one of these is a name: dots in a part, a slash inside)
        for (const name of ["a..b.csv", "..a.csv", "a../b.csv", "d/a.csv", "a.b.c"]) {
            expect(namesOf(fineZip([first, { name, bytes: second.bytes }])), name).toEqual(["a.csv", name]);
        }
    });

    test("a name that ends with a slash is a directory: refused when it holds data, read when it holds none", () => {
        expect(() => readZip(fineZip([first, { name: "d/", bytes: Buffer.from("x") }]))).toThrow(/"d\/": a directory \(the name ends with "\/"\) that holds data/);
        expect(() => readZip(fineZip([{ name: "d/", bytes: Buffer.from("x"), deflate: true }]))).toThrow(/a directory .* that holds data/);
        expect(namesOf(fineZip([first, { name: "d/", bytes: Buffer.alloc(0) }]))).toEqual(["a.csv", "d/"]);
    });

    test("bytes in front of the first entry, between two entries, or between the last entry and the directory are refused, with their number and place", () => {
        const front = fineZip([{ ...first, before: junk(10) }, second]);
        expect(() => readZip(front)).toThrow(/^readZip: 10 bytes that belong to no entry, at 0, in front of a\.csv/);
        // (the first entry is 30 + 5 + 6 bytes long)
        const firstLength = 30 + first.name.length + first.bytes.length;
        const between = fineZip([first, { ...second, before: junk(10) }]);
        expect(() => readZip(between)).toThrow(new RegExp(`^readZip: 10 bytes that belong to no entry, at ${firstLength}, in front of b\\.csv`));
        const secondLength = 30 + second.name.length + second.bytes.length;
        const behind = fineZip([first, second], { beforeDirectory: junk(10) });
        expect(() => readZip(behind)).toThrow(new RegExp(`^readZip: 10 bytes that belong to no entry, at ${firstLength + secondLength}, in front of the central directory`));
        // (one byte is enough, in each place)
        expect(() => readZip(fineZip([{ ...first, before: junk(1) }, second]))).toThrow(/1 bytes that belong to no entry, at 0/);
        expect(() => readZip(fineZip([first, { ...second, before: junk(1) }]))).toThrow(/1 bytes that belong to no entry, at \d+, in front of b\.csv/);
        expect(() => readZip(fineZip([first, second], { beforeDirectory: junk(1) }))).toThrow(/1 bytes that belong to no entry, at \d+, in front of the central directory/);
        // and the entries with nothing between them are read
        expect(namesOf(fineZip([first, second]))).toEqual(["a.csv", "b.csv"]);
    });

    test("without bit 3 of the flags, a local header whose CRC-32 or whose size differs from the directory's is refused", () => {
        const [crc, size] = [crc32(first.bytes), first.bytes.length];
        const cases = [
            ["the CRC-32", { crc: (crc ^ 1) >>> 0 }],
            ["the CRC-32, a zero", { crc: 0 }],
            ["the packed size, too small", { packed: size - 1 }],
            ["the packed size, too big", { packed: size + 1 }],
            ["the size, too small", { size: size - 1 }],
            ["the size, too big", { size: size + 1 }],
            ["the size, a zero", { size: 0 }],
        ];
        for (const [what, local] of cases) {
            expect(() => readZip(fineZip([{ ...first, local }, second])), what).toThrow(/a\.csv: the local header says CRC-32 [0-9a-f]+, \d+ bytes packed, \d+ bytes; the directory says/);
        }
        // (the same zip with a right local header is read)
        expect(namesOf(fineZip([{ ...first, local: { crc, packed: size, size } }, second]))).toEqual(["a.csv", "b.csv"]);
    });

    test("with bit 3 set, a local header that is neither all zeros nor the directory's values is refused; zeros and the directory's values are read", () => {
        const [crc, size] = [crc32(first.bytes), first.bytes.length];
        const refused = [
            ["only the CRC-32", { crc }],
            ["only the sizes", { packed: size, size }],
            ["a CRC-32 that is not the directory's", { crc: (crc ^ 1) >>> 0, packed: size, size }],
            ["a size that is not the directory's", { crc, packed: size, size: size + 1 }],
            ["a packed size that is not the directory's", { crc, packed: size + 1, size }],
        ];
        for (const descriptor of ["signed", "plain"]) {
            for (const [what, local] of refused) {
                expect(() => readZip(fineZip([{ ...first, descriptor, local }, second])), `${descriptor}, ${what}`).toThrow(/a\.csv: the local header says CRC-32 [0-9a-f]+, \d+ bytes packed, \d+ bytes; it should say zeros or what the directory says/);
            }
            expect(namesOf(fineZip([{ ...first, descriptor }, second])), `${descriptor}, zeros`).toEqual(["a.csv", "b.csv"]);
            expect(namesOf(fineZip([{ ...first, descriptor, local: { crc, packed: size, size } }, second])), `${descriptor}, the directory's values`).toEqual(["a.csv", "b.csv"]);
        }
    });

    test("a data descriptor that runs into the directory is refused: one that is missing, and one with its signature but not its three numbers", () => {
        // (nothing between the data and the directory)
        expect(() => readZip(fineZip([first, { ...second, descriptor: "plain" }], { cutDescriptor: 12 }))).toThrow(/b\.csv: its data descriptor runs into the central directory/);
        expect(() => readZip(fineZip([first, { ...second, descriptor: "signed" }], { cutDescriptor: 16 }))).toThrow(/b\.csv: its data descriptor runs into the central directory/);
        // (the signature and two numbers: twelve bytes, so that they fit, and the third number is the directory's own bytes)
        expect(() => readZip(fineZip([first, { ...second, descriptor: "signed" }], { cutDescriptor: 4 }))).toThrow(/b\.csv: its data descriptor runs into the central directory/);
        // (one byte short of the last number)
        expect(() => readZip(fineZip([first, { ...second, descriptor: "plain" }], { cutDescriptor: 1 }))).toThrow(/b\.csv: its data descriptor runs into the central directory/);
        // and the one that is whole, with and without its signature, is read
        expect(namesOf(fineZip([first, { ...second, descriptor: "signed" }]))).toEqual(["a.csv", "b.csv"]);
        expect(namesOf(fineZip([first, { ...second, descriptor: "plain" }]))).toEqual(["a.csv", "b.csv"]);
    });

    test("a 'disk number start' that is not 0 is refused", () => {
        for (const disk of [1, 7, 0xffff]) {
            expect(() => readZip(fineZip([first, { ...second, disk }])), String(disk)).toThrow(new RegExp(`"b\\.csv": the directory says the entry starts on disk ${disk}, not 0`));
        }
        expect(namesOf(fineZip([first, { ...second, disk: 0 }]))).toEqual(["a.csv", "b.csv"]);
    });

    test("a local header whose date or time differs from the directory's is refused", () => {
        expect(() => readZip(fineZip([first, { ...second, local: { date: FINE_DATE + 1 } }]))).toThrow(/b\.csv: the local header has another date and time than the directory/);
        expect(() => readZip(fineZip([first, { ...second, local: { time: FINE_TIME + 1 } }]))).toThrow(/b\.csv: the local header has another date and time than the directory/);
        expect(() => readZip(fineZip([{ ...first, directoryDate: FINE_DATE + 32 }, second]))).toThrow(/a\.csv: the local header has another date and time than the directory/);
        expect(() => readZip(fineZip([{ ...first, directoryTime: 0 }, second]))).toThrow(/a\.csv: the local header has another date and time than the directory/);
        // (a zip that kept no date, in both places, is read, with no date)
        const undated = readZip(fineZip([{ ...first, date: 0, time: 0 }, second]));
        expect(undated.map((entry) => entry.mtime)).toEqual([null, new Date(2026, 10, 17, 12, 30, 4)]);
    });

    test("two entries that overlap are refused: the second begins inside the data of the first", () => {
        // the first entry's data is a whole second entry (its local header, its name and its data), which the directory points to
        const inner = fineZip([second]);
        const innerLocal = inner.subarray(0, 30 + second.name.length + second.bytes.length);
        const padding = Buffer.from("zz");
        const host = { name: "a.csv", bytes: Buffer.concat([padding, innerLocal]) };
        const at = 30 + host.name.length + padding.length;
        const overlapping = fineZip([host, { ...second, absent: true, offset: at }]);
        expect(() => readZip(overlapping)).toThrow(new RegExp(`b\\.csv: it starts at ${at}, inside the entry before it \\(which ends at ${30 + host.name.length + host.bytes.length}\\)`));
        // (the same two entries one after the other are read, each with its own bytes)
        const apart = readZip(fineZip([host, second]));
        expect(apart.map((entry) => entry.name)).toEqual(["a.csv", "b.csv"]);
        expect(apart[1].bytes.equals(second.bytes)).toBe(true);
    });

    test("an end record with a comment, a zip with no entries, and an entry stored with a descriptor are read; a comment is not part of the entries", () => {
        expect(namesOf(fineZip([first, second], { comment: "made by hand, 1 entry or 2" }))).toEqual(["a.csv", "b.csv"]);
        // (a comment that holds an end record's signature and the fields of one: no entries, and a directory that ends where the
        // record starts. Four more bytes follow it, so it lies 26 bytes from the end, where the reader looks, and only its comment
        // length, which does not reach the end of the file, tells it from the real record that ends the file. A reader that took it
        // would fail on the entries it does not find, not read them)
        const fake = Buffer.alloc(22);
        fake.writeUInt32LE(0x06054b50, 0);
        fake.writeUInt32LE(fineZip([first]).length, 12);
        const tricky = fineZip([first], { comment: Buffer.concat([fake, Buffer.from("tail")]) });
        expect(tricky.readUInt32LE(tricky.length - 26), "the signature lies 26 bytes from the end").toBe(0x06054b50);
        expect(() => namesOf(tricky), "the end record that ends the file is the one read").not.toThrow();
        expect(namesOf(tricky)).toEqual(["a.csv"]);
        expect(namesOf(fineZip([], { comment: "no entries, a comment" }))).toEqual([]);
        expect(readZip(fineZip([]))).toEqual([]);
        const stored = readZip(fineZip([{ ...first, descriptor: "signed" }]));
        expect(stored[0].method).toBe(0);
        expect(stored[0].flags & 8).toBe(8);
        expect(stored[0].bytes.equals(first.bytes)).toBe(true);
        // (an entry whose bytes are none, stored: nothing to inflate, nothing to count)
        expect(readZip(fineZip([{ name: "e.csv", bytes: Buffer.alloc(0) }]))[0].bytes).toHaveLength(0);
    });

    test("a zip of the library, written in pieces with data descriptors, is read: the sizes come from the central directory", () => {
        const zip = libraryZip(files());
        // (the library writes a data descriptor, flag bit 3, and zeros in the local header: the reader must not take sizes from there)
        expect(zip.readUInt16LE(6) & 8).toBe(8);
        expect(zip.readUInt32LE(18)).toBe(0);
        const read = readZip(zip);
        expect(read.map((entry) => entry.name)).toEqual(["a.csv", "b c.csv", "empty.csv"]);
        for (const [i, { bytes }] of files().entries()) {
            expect(read[i].bytes.equals(bytes), read[i].name).toBe(true);
        }
    });

    test("names that are not ASCII come back through the UTF-8 flag; without the flag only ASCII is accepted", () => {
        const names = ["café.csv", "日本語.csv", "😀.csv"];
        const zip = libraryZip(names.map((name) => ({ name, bytes: Buffer.from(`${name}\r\n`) })));
        expect(readZip(zip).map((entry) => entry.name)).toEqual(names);
        const flagless = Buffer.from(libraryZip([{ name: "café.csv", bytes: Buffer.from("x") }]));
        // (clear bit 11 of the local and the central header)
        for (let at = 0; at + 8 < flagless.length; at++) {
            if (flagless.readUInt32LE(at) === 0x02014b50) {
                flagless[at + 9] &= ~0x08;
            }
            if (flagless.readUInt32LE(at) === 0x04034b50) {
                flagless[at + 7] &= ~0x08;
            }
        }
        expect(() => readZip(flagless)).toThrow(/not ASCII/);
    });

    test("a byte of the data changed: the CRC-32 or the inflating says so, for a stored entry and for a deflated one", () => {
        const stored = handZip([{ name: "a.csv", bytes: Buffer.from("hello, world") }]);
        const changed = Buffer.from(stored);
        changed[30 + "a.csv".length + 3] ^= 0x20;
        expect(() => readZip(changed)).toThrow(/CRC-32/);
        const text = Buffer.from("row,of,text\r\n".repeat(300));
        const deflated = libraryZip([{ name: "a.csv", bytes: text }]);
        expect(readZip(deflated)[0].bytes.equals(text)).toBe(true);
        let caught = 0;
        for (const at of [40, 45, 50, 60, 70, 80]) {
            const bad = Buffer.from(deflated);
            bad[at] ^= 0x55;
            try {
                readZip(bad);
            } catch (error) {
                expect(error.message).toMatch(/^readZip: /);
                caught++;
            }
        }
        expect(caught).toBe(6);
    });

    test("a CRC-32 that the directory gets wrong, and sizes that it gets wrong, are refused", () => {
        const bytes = Buffer.from("some data\r\n");
        expect(() => readZip(handZip([{ name: "a.csv", bytes }], { crcOf: (data) => crc32(data) ^ 1 }))).toThrow(/CRC-32/);
        const zip = handZip([{ name: "a.csv", bytes }]);
        const directory = zip.length - 22 - (46 + 5);
        const small = Buffer.from(zip);
        small.writeUInt32LE(bytes.length - 1, directory + 24);
        expect(() => readZip(small)).toThrow(/bytes, the directory says/);
        const deflated = libraryZip([{ name: "a.csv", bytes: Buffer.from("x".repeat(100)) }]);
        const at = deflated.length - 22 - (46 + 5);
        const bad = Buffer.from(deflated);
        bad.writeUInt32LE(bad.readUInt32LE(at + 16) ^ 0xffff, at + 16);
        expect(() => readZip(bad)).toThrow(/CRC-32|data descriptor/);
    });

    test("a zip that is cut, has no end record, counts wrongly or is not a zip is refused", () => {
        const zip = handZip(files());
        expect(() => readZip(zip.subarray(0, zip.length - 1))).toThrow(/no end of central directory/);
        expect(() => readZip(zip.subarray(0, zip.length - 30))).toThrow(/readZip/);
        expect(() => readZip(Buffer.from("not a zip file at all, not even close"))).toThrow(/no end of central directory/);
        expect(() => readZip(Buffer.alloc(0))).toThrow(/no end of central directory/);
        const counted = Buffer.from(zip);
        counted.writeUInt16LE(2, counted.length - 22 + 10);
        counted.writeUInt16LE(2, counted.length - 22 + 8);
        expect(() => readZip(counted)).toThrow(/readZip/);
        const more = Buffer.from(zip);
        more.writeUInt16LE(4, more.length - 22 + 10);
        more.writeUInt16LE(4, more.length - 22 + 8);
        expect(() => readZip(more)).toThrow(/readZip/);
        const marker = Buffer.from(zip);
        marker.writeUInt16LE(0xffff, marker.length - 22 + 10);
        marker.writeUInt16LE(0xffff, marker.length - 22 + 8);
        expect(() => readZip(marker)).toThrow(/Zip64/);
    });

    test("a Uint8Array and a Buffer are read the same, and a Uint8Array that is a window of a larger buffer too", () => {
        const zip = handZip(files());
        const wide = new Uint8Array(zip.length + 20);
        wide.set(zip, 10);
        for (const input of [zip, new Uint8Array(zip), wide.subarray(10, 10 + zip.length)]) {
            expect(readZip(input).map((entry) => entry.name)).toEqual(["a.csv", "b c.csv", "empty.csv"]);
        }
    });

    test("crc32 is the standard one", () => {
        expect(crc32(Buffer.from("123456789"))).toBe(0xcbf43926);
        expect(crc32(Buffer.alloc(0))).toBe(0);
    });
});

// ---- the vendored library -------------------------------------------------------------------------

test.describe("the vendored library", () => {
    test.beforeEach(skipUnlessFirst);

    // The publisher's own file, unchanged (plan section 2, "New libraries are vendored"): the file
    // umd/index.js of the npm package fflate, version 0.8.3, kept as vendor/fflate.min.js (the name
    // the loader asks for). Its npm file, unpkg's and jsDelivr's are the same bytes. It has no banner
    // that names a version, so its size and its SHA-256 are what pin it. A new version is vendored by
    // replacing the file, its licence and these values together.
    test("vendor/fflate.min.js is the publisher's file, unchanged: its size and its SHA-256 are those of fflate 0.8.3", () => {
        const bytes = fs.readFileSync(path.join(__dirname, "..", "vendor", "fflate.min.js"));
        expect(bytes.length).toBe(33044);
        expect(crypto.createHash("sha256").update(bytes).digest("hex")).toBe("462ef8041fc970e3615a20a9dd2b2e3047a073b2da729ef4f02b634bba8b7b83");
    });

    test("vendor/fflate.LICENSE.txt is the MIT licence of its author", () => {
        const bytes = fs.readFileSync(path.join(__dirname, "..", "vendor", "fflate.LICENSE.txt"));
        expect(bytes.length).toBe(1069);
        expect(crypto.createHash("sha256").update(bytes).digest("hex")).toBe("0a1df3a083d0c010560aa342e87959c8c1070e6fd54545741f083f22d0c8b551");
        const licence = bytes.toString("utf8");
        expect(licence).toMatch(/\bMIT\b/);
        expect(licence).toContain("Arjun Barrett");
        expect(licence).toContain("Permission is hereby granted");
    });

    test("it puts the library on a global in a classic script, as the page's loader needs, and has the classes the export uses", () => {
        const source = fs.readFileSync(path.join(__dirname, "..", "vendor", "fflate.min.js"), "utf8");
        // (run as a classic script with no module and no exports, as the page runs it)
        const scope = {};
        new Function("self", `${source}`).call(scope, scope);
        expect(typeof scope.fflate?.Zip).toBe("function");
        expect(typeof scope.fflate.ZipDeflate).toBe("function");
        expect(typeof fflate.Zip).toBe("function");
        expect(typeof fflate.ZipDeflate).toBe("function");
    });

    test("a zip made in pieces with Zip and ZipDeflate, level 6, is read back by a reader that does not use the library: names, bytes, order", async () => {
        const { config, csv } = await modules();
        const names = ["a.csv", "sales_2024.csv", "sales_2024_2.csv", "é.csv", "empty.csv"];
        const texts = [
            `${csv.headerText(["id", "name"])}${"1,Ann\r\n".repeat(5000)}`,
            "﻿x\r\n1\r\n",
            `"line\nbreak",and , comma\r\n`.repeat(100),
            "é 😀\r\n",
            "",
        ];
        const chunks = [];
        let failure = null;
        const zip = new fflate.Zip((error, chunk, final) => {
            if (error) {
                failure ??= error;
            } else {
                chunks.push(Uint8Array.prototype.slice.call(chunk));
            }
            if (final) {
                chunks.final = true;
            }
        });
        for (const [i, name] of names.entries()) {
            const entry = new fflate.ZipDeflate(name, { level: config.EXPORT_ZIP_LEVEL });
            entry.mtime = new Date();
            zip.add(entry);
            const bytes = Buffer.from(texts[i], "utf8");
            // pieces of 1,000 bytes, as the export pushes a piece at a time; the last push is final
            for (let at = 0; at < bytes.length; at += 1000) {
                entry.push(bytes.subarray(at, at + 1000), false);
            }
            entry.push(new Uint8Array(0), true);
        }
        zip.end();
        expect(failure).toBeNull();
        expect(chunks.final).toBe(true);
        const read = readZip(Buffer.concat(chunks));
        expect(read.map((entry) => entry.name)).toEqual(names);
        expect(read.map((entry) => entry.bytes.toString("utf8"))).toEqual(texts);
        // (and the library's own reader agrees: the bytes are a zip, not only a thing that readZip likes)
        const library = fflate.unzipSync(new Uint8Array(Buffer.concat(chunks)));
        expect(Object.keys(library).sort()).toEqual([...names].sort());
    });

    test("a chunk that the library hands over can be its own buffer: a collector that does not copy a reused buffer gets a wrong zip, one that copies a right one", () => {
        const make = (copy) => {
            const out = [];
            const zip = new fflate.Zip((error, chunk) => {
                if (!error) {
                    out.push(copy ? Uint8Array.prototype.slice.call(chunk) : chunk);
                }
            });
            const buffer = new Uint8Array(4);
            for (const [name, letter] of [["a.csv", 65], ["b.csv", 66]]) {
                const entry = new fflate.ZipPassThrough(name);
                zip.add(entry);
                for (const next of [letter, letter + 32]) {
                    buffer.fill(next);
                    entry.push(buffer, false);
                }
                entry.push(new Uint8Array(0), true);
            }
            zip.end();
            return Buffer.concat(out);
        };
        const right = readZip(make(true));
        expect(right.map((entry) => entry.bytes.toString())).toEqual(["AAAAaaaa", "BBBBbbbb"]);
        // (why the export copies what it is handed: the library's pass-through keeps the buffer it was given)
        expect(() => readZip(make(false))).toThrow(/readZip/);
    });

    test("a zip of 300 entries is read, and a zip of one entry with an empty body too", () => {
        const entries = Array.from({ length: 300 }, (unused, i) => ({ name: `t${i}.csv`, bytes: Buffer.from(`id\r\n${i}\r\n`) }));
        const read = readZip(libraryZip(entries, { pieceBytes: 4 }));
        expect(read).toHaveLength(300);
        expect(read[299].name).toBe("t299.csv");
        expect(read[299].bytes.toString()).toBe("id\r\n299\r\n");
        const [empty, ...others] = readZip(libraryZip([{ name: "e.csv", bytes: Buffer.alloc(0) }]));
        expect(others).toEqual([]);
        expect(empty).toMatchObject({ name: "e.csv", bytes: Buffer.alloc(0), method: 8, versionNeeded: 20 });
        expect(empty.mtime).toEqual(new Date(2026, 0, 2, 3, 4, 6));
    });

    test("with the date set as a property of the entry, two zips are the same bytes; the date of an entry is a thing of the entry, not its options", () => {
        const entries = [{ name: "a.csv", bytes: Buffer.from("x\r\n1\r\n") }];
        expect(libraryZip(entries).equals(libraryZip(entries))).toBe(true);
    });
});

// ---- the sinks of the controller ------------------------------------------------------------------

// The place the bytes of a file go (js/lab/export-tables.js): fileSink for one CSV, zipSink for a
// zip written with the vendored library. They are exported, so that they are held here, in Node,
// with limits as small as a test needs and with stand-ins for a library that fails.
test.describe("fileSink and zipSink: where the bytes go", () => {
    test.beforeEach(skipUnlessFirst);

    const ZIP = "application/zip";
    // a text that deflates well, and bytes that do not (the same on every run)
    const same = (length) => Buffer.from("a".repeat(length));
    const noise = (length, seed) => {
        const random = seeded(seed);
        return Buffer.from(Array.from({ length }, () => Math.floor(random() * 256)));
    };
    // one entry written in pieces, as the controller does
    const writeEntry = (sink, name, bytes, pieceBytes = 400) => {
        sink.begin(name);
        for (let at = 0; at < bytes.length; at += pieceBytes) {
            sink.write(bytes.subarray(at, at + pieceBytes));
        }
        sink.end();
    };
    const blobBytes = async (blob) => Buffer.from(await blob.arrayBuffer());
    // what finish() throws, or null
    const thrownBy = (sink) => {
        try {
            sink.finish();
        } catch (error) {
            return error;
        }
        return null;
    };
    // the compressed sizes that the central directory of a zip gives, in order
    const compressedSizes = (zip) => {
        const end = zip.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]));
        const sizes = [];
        let at = zip.readUInt32LE(end + 16);
        for (let n = 0; n < zip.readUInt16LE(end + 10); n++) {
            sizes.push(zip.readUInt32LE(at + 20));
            at += 46 + zip.readUInt16LE(at + 28) + zip.readUInt16LE(at + 30) + zip.readUInt16LE(at + 32);
        }
        return sizes;
    };

    test("(1) a zip told that too many entries are coming refuses at once, before anything is added; one told nothing refuses when the entry that is too many begins", async () => {
        const { tables, config } = await modules();
        const told = tables.zipSink(fflate, ZIP, 3, { maxEntries: 2 });
        const failure = told.problem();
        expect(failure).toBeInstanceOf(Error);
        expect(failure.shown).toBe(config.EXPORT_TABLES_ZIP_TOO_BIG_MESSAGE);
        // (told two, it has room)
        const fits = tables.zipSink(fflate, ZIP, 2, { maxEntries: 2 });
        expect(fits.problem()).toBeNull();
        // told nothing: no problem for the first two, one when the third has begun
        const unknown = tables.zipSink(fflate, ZIP, undefined, { maxEntries: 2 });
        expect(unknown.problem()).toBeNull();
        writeEntry(unknown, "a.csv", Buffer.from("1\r\n"));
        writeEntry(unknown, "b.csv", Buffer.from("2\r\n"));
        expect(unknown.problem()).toBeNull();
        unknown.begin("c.csv");
        expect(unknown.problem().shown).toBe(config.EXPORT_TABLES_ZIP_TOO_BIG_MESSAGE);
        // and with no limits of its own, three entries are far from too many
        const plain = tables.zipSink(fflate, ZIP, 3);
        expect(plain.problem()).toBeNull();
    });

    test("(2) an entry of more than the limit before it is deflated is a problem though the zip stays small, while it is written and after it ends; a zip whose own size passes the limit is one too; under the limits there is none", async () => {
        const { tables, config } = await modules();
        const limits = { maxBytes: 1000 };
        const make = () => tables.zipSink(fflate, ZIP, 0, limits);

        // 1,500 bytes of one letter: the zip holds a few dozen bytes of it
        const big = make();
        big.begin("big.csv");
        big.write(same(800));
        expect(big.problem()).toBeNull();
        big.write(same(700));
        expect(big.problem().shown).toBe(config.EXPORT_TABLES_ZIP_TOO_BIG_MESSAGE);
        big.end();
        expect(big.problem().shown).toBe(config.EXPORT_TABLES_ZIP_TOO_BIG_MESSAGE);
        // (the failure is what finish throws, and it is still a problem when a small entry has begun after it)
        expect(thrownBy(big).shown).toBe(config.EXPORT_TABLES_ZIP_TOO_BIG_MESSAGE);
        const later = make();
        writeEntry(later, "big.csv", same(1500));
        later.begin("small.csv");
        later.write(Buffer.from("x\r\n"));
        expect(later.problem().shown).toBe(config.EXPORT_TABLES_ZIP_TOO_BIG_MESSAGE);

        // the same entry with no limit makes a zip well under 1,000 bytes: it was the entry that was too big
        const unlimited = tables.zipSink(fflate, ZIP);
        writeEntry(unlimited, "big.csv", same(1500));
        const small = await blobBytes(unlimited.finish());
        expect(small.length).toBeLessThan(1000);
        expect(readZip(small)[0].bytes.equals(same(1500))).toBe(true);

        // an entry of exactly the limit is not too big
        const exact = make();
        writeEntry(exact, "exact.csv", same(1000));
        expect(exact.problem()).toBeNull();
        expect(readZip(await blobBytes(exact.finish()))[0].bytes).toHaveLength(1000);

        // three entries of 300 bytes that do not deflate: each is under the limit, the zip is over it
        const grown = make();
        writeEntry(grown, "a.csv", noise(300, 1));
        expect(grown.problem()).toBeNull();
        writeEntry(grown, "b.csv", noise(300, 2));
        writeEntry(grown, "c.csv", noise(300, 3));
        expect(grown.problem().shown).toBe(config.EXPORT_TABLES_ZIP_TOO_BIG_MESSAGE);
        expect(thrownBy(grown).shown).toBe(config.EXPORT_TABLES_ZIP_TOO_BIG_MESSAGE);

        // two such entries stay under both limits: no problem, and a zip
        const fine = make();
        writeEntry(fine, "a.csv", noise(300, 1));
        writeEntry(fine, "b.csv", noise(300, 2));
        expect(fine.problem()).toBeNull();
        const read = readZip(await blobBytes(fine.finish()));
        expect(read.map((entry) => entry.bytes.length)).toEqual([300, 300]);
    });

    test("(2b) a zip remembers its largest entry: after an entry over the limit has ended, a small entry that begins and ends does not make the failure go away", async () => {
        const { tables, config } = await modules();
        const sink = tables.zipSink(fflate, ZIP, 0, { maxBytes: 1000 });
        writeEntry(sink, "big.csv", same(1500));
        expect(sink.problem().shown).toBe(config.EXPORT_TABLES_ZIP_TOO_BIG_MESSAGE);
        // a small entry, begun and ended (the zip itself is a few dozen bytes)
        writeEntry(sink, "small.csv", Buffer.from("x\r\n"));
        expect(sink.problem()?.shown, "after the small entry has ended").toBe(config.EXPORT_TABLES_ZIP_TOO_BIG_MESSAGE);
        writeEntry(sink, "other.csv", same(10));
        expect(sink.problem()?.shown, "after a second small entry").toBe(config.EXPORT_TABLES_ZIP_TOO_BIG_MESSAGE);
        expect(thrownBy(sink)?.shown, "finish").toBe(config.EXPORT_TABLES_ZIP_TOO_BIG_MESSAGE);
    });

    test("(3) finish throws the failure and gives no Blob for a zip that is too big, and gives its Blob for one that is not", async () => {
        const { tables, config } = await modules();
        const tooBig = tables.zipSink(fflate, ZIP, 3, { maxEntries: 2 });
        let blob;
        let failure = null;
        try {
            blob = tooBig.finish();
        } catch (error) {
            failure = error;
        }
        expect(blob).toBeUndefined();
        expect(failure.shown).toBe(config.EXPORT_TABLES_ZIP_TOO_BIG_MESSAGE);
        expect(failure.message).toBe(config.EXPORT_TABLES_ZIP_TOO_BIG_MESSAGE);
        // a good zip gives its Blob and does not throw
        const good = tables.zipSink(fflate, ZIP, 1);
        writeEntry(good, "a.csv", Buffer.from("x\r\n"));
        expect(thrownBy(good)).toBeNull();
    });

    test("(3b) the count of one entry's bytes starts again with each entry: three entries under the limit are no problem together, though their text passes it", async () => {
        const { tables } = await modules();
        // each entry is 150 bytes of one letter: it deflates to a few bytes, and 450 bytes together pass the limit of 400
        const sink = tables.zipSink(fflate, ZIP, 0, { maxBytes: 400 });
        for (const name of ["a.csv", "b.csv", "c.csv"]) {
            writeEntry(sink, name, same(150));
            expect(sink.problem(), `after ${name}`).toBeNull();
        }
        const zip = await blobBytes(sink.finish());
        expect(zip.length).toBeLessThan(400);
        expect(readZip(zip).map((entry) => entry.bytes.length)).toEqual([150, 150, 150]);
        // (an entry that is over the limit by itself is still one)
        const over = tables.zipSink(fflate, ZIP, 0, { maxBytes: 400 });
        writeEntry(over, "a.csv", same(150));
        writeEntry(over, "b.csv", same(401));
        expect(over.problem()).not.toBeNull();
    });

    // a stand-in that counts: how many zips were made, and how many entries were begun and added
    const recordingLibrary = () => {
        const seen = { zips: 0, made: 0, added: 0, pushed: 0, ended: 0 };
        class Zip {
            constructor() {
                seen.zips++;
            }
            add() {
                seen.added++;
            }
            end() {
                seen.ended++;
            }
        }
        class ZipDeflate {
            constructor() {
                seen.made++;
            }
            push() {
                seen.pushed++;
            }
        }
        return { seen, library: { Zip, ZipDeflate } };
    };

    test("(3c) sinkFor: a plan of three tables with room for two is refused at once with the zip's words, before an entry is begun; with room for three it gives a sink that takes them", async () => {
        const { tables, config, csv } = await modules();
        const plan = csv.planOutput({ format: "csv", databaseName: "x.db", tables: ["a", "b", "c"] });
        expect(plan.kind).toBe("zip");
        expect(plan.entries).toHaveLength(3);
        const { seen, library } = recordingLibrary();
        let failure = null;
        let sink;
        try {
            sink = tables.sinkFor(plan, library, { maxEntries: 2 });
        } catch (error) {
            failure = error;
        }
        expect(sink).toBeUndefined();
        expect(failure).toBeInstanceOf(Error);
        expect(failure.shown).toBe(config.EXPORT_TABLES_ZIP_TOO_BIG_MESSAGE);
        // (the zip is made, to be told how many entries it will hold, and refused before an entry is begun)
        expect(seen).toEqual({ zips: 1, made: 0, added: 0, pushed: 0, ended: 0 });
        // the real library: nothing was added to a zip either
        expect(() => tables.sinkFor(plan, fflate, { maxEntries: 2 })).toThrow(config.EXPORT_TABLES_ZIP_TOO_BIG_MESSAGE);
        // with room for three: a zip's sink, of the plan's type, that takes the three entries
        const fits = tables.sinkFor(plan, fflate, { maxEntries: 3 });
        expect(fits.problem()).toBeNull();
        for (const entry of plan.entries) {
            writeEntry(fits, entry.name, Buffer.from(`${entry.table}\r\n1\r\n`));
        }
        expect(fits.problem()).toBeNull();
        const blob = fits.finish();
        expect(blob.type).toBe(plan.type);
        expect(readZip(await blobBytes(blob)).map((entry) => entry.name)).toEqual(plan.entries.map((entry) => entry.name));
        // told nothing of limits: the plan's own count is far under the zip's
        expect(tables.sinkFor(plan, fflate).problem()).toBeNull();
    });

    test("(3d) sinkFor: a plan of one table gives a file's sink, whatever the limits and whatever the library", async () => {
        const { tables, csv } = await modules();
        const plan = csv.planOutput({ format: "csv", databaseName: "x.db", tables: ["a"] });
        expect(plan.kind).toBe("file");
        for (const limits of [undefined, { maxEntries: 0, maxBytes: 0 }, { maxEntries: 1, maxBytes: 1 }]) {
            // (a file has no library: none is given, and none is needed)
            const sink = tables.sinkFor(plan, null, limits);
            expect(sink.problem(), JSON.stringify(limits)).toBeNull();
            writeEntry(sink, plan.fileName, Buffer.from("a,b\r\n1,2\r\n"));
            expect(sink.problem()).toBeNull();
            const blob = sink.finish();
            expect(blob.type).toBe(plan.type);
            expect((await blobBytes(blob)).toString("utf8")).toBe("a,b\r\n1,2\r\n");
        }
    });

    test("(3e) sinkFor: a plan of a kind that is neither a zip nor a file is refused with a TypeError that names the kind, and the zip tool is not touched", async () => {
        const { tables, csv } = await modules();
        const { seen, library } = recordingLibrary();
        // (a kind that a later format might have, one that is only a zip or a file in other letters, and none at all)
        for (const kind of ["workbook", "Zip", "FILE", "", undefined]) {
            const plan = { kind, type: "application/x", entries: [] };
            let sink;
            let failure = null;
            try {
                sink = tables.sinkFor(plan, library);
            } catch (error) {
                failure = error;
            }
            expect(sink, String(kind)).toBeUndefined();
            expect(failure, String(kind)).toBeInstanceOf(TypeError);
            expect(failure.message, String(kind)).toContain(`unknown kind of output: ${kind}`);
            // (with no zip tool, and with the limits of a file that cannot be met: the same words)
            expect(() => tables.sinkFor(plan, null, { maxEntries: 0, maxBytes: 0 }), String(kind)).toThrow(TypeError);
        }
        expect(seen, "no zip is made, no entry is begun").toEqual({ zips: 0, made: 0, added: 0, pushed: 0, ended: 0 });
        // the two kinds that planOutput makes are still given their sinks
        const [file, zip] = [{ format: "csv", databaseName: "x.db", tables: ["a"] }, { format: "csv", databaseName: "x.db", tables: ["a", "b"] }].map((request) => csv.planOutput(request));
        expect([file.kind, zip.kind]).toEqual(["file", "zip"]);
        expect(tables.sinkFor(file, null).problem()).toBeNull();
        expect(tables.sinkFor(zip, fflate).problem()).toBeNull();
    });

    // a stand-in for the library: a Zip whose entries push chunks to its callback through `onPush`
    // and whose end calls `onEnd`; the sink uses only these (new Zip(callback), new ZipDeflate(name,
    // options), entry.mtime, zip.add(entry), entry.push(bytes, final), zip.end())
    // (`made` collects each entry the sink makes, to look at the options it was made with)
    const standIn = ({ onPush = () => {}, onEnd = () => {}, made = [] }) => {
        class Zip {
            constructor(callback) {
                this.callback = callback;
            }
            add(entry) {
                entry.callback = this.callback;
            }
            end() {
                onEnd(this.callback);
            }
        }
        class ZipDeflate {
            constructor(name, options) {
                this.name = name;
                this.options = options;
                made.push(this);
            }
            push(bytes, final) {
                onPush(this.callback, bytes, final);
            }
        }
        return { Zip, ZipDeflate };
    };

    test("(4) when the library reports an error to its callback, problem is the zip failure with the error as its cause, and finish throws it", async () => {
        const { tables, config } = await modules();
        const reported = new Error("the library gave up");
        // an error while an entry is written
        const whileWriting = tables.zipSink(standIn({ onPush: (callback) => callback(reported, null, false) }), ZIP, 1);
        expect(whileWriting.problem()).toBeNull();
        whileWriting.begin("a.csv");
        whileWriting.write(Buffer.from("x"));
        const failure = whileWriting.problem();
        expect(failure.shown).toBe(config.EXPORT_TABLES_ZIP_FAILED_MESSAGE);
        expect(failure.cause).toBe(reported);
        whileWriting.end();
        const thrown = thrownBy(whileWriting);
        expect(thrown.shown).toBe(config.EXPORT_TABLES_ZIP_FAILED_MESSAGE);
        // an error that only the end of the zip reports
        const atEnd = tables.zipSink(standIn({ onEnd: (callback) => callback(reported, null, true) }), ZIP, 1);
        writeEntry(atEnd, "a.csv", Buffer.from("x"));
        expect(atEnd.problem()).toBeNull();
        let blob;
        try {
            blob = atEnd.finish();
        } catch (error) {
            expect(error.shown).toBe(config.EXPORT_TABLES_ZIP_FAILED_MESSAGE);
        }
        expect(blob).toBeUndefined();
        // the first error is the one kept
        const twice = tables.zipSink(standIn({ onPush: (callback, bytes) => callback(new Error(`error for ${bytes.length} bytes`), null, false) }), ZIP, 1);
        twice.begin("a.csv");
        twice.write(Buffer.from("x"));
        twice.write(Buffer.from("xyz"));
        expect(twice.problem().cause.message).toBe("error for 1 bytes");
    });

    test("(4b) every entry of the zip is deflated at the level the settings name", async () => {
        const { tables, config } = await modules();
        const made = [];
        const sink = tables.zipSink(standIn({ made }), ZIP, 2);
        sink.begin("a.csv");
        sink.end();
        sink.begin("b.csv");
        sink.end();
        expect(made.map((entry) => entry.name)).toEqual(["a.csv", "b.csv"]);
        for (const entry of made) {
            expect(entry.options, entry.name).toEqual({ level: config.EXPORT_ZIP_LEVEL });
        }
    });

    test("(5) the sink keeps what it is handed even when the library goes on using the same buffer for each chunk", async () => {
        const { tables } = await modules();
        const shared = new Uint8Array(4);
        const library = standIn({
            onPush: (callback, bytes) => {
                // the one buffer, overwritten for each chunk, as a library may do (the closing push has no bytes)
                shared.set(bytes);
                callback(null, shared.subarray(0, bytes.length), false);
            },
        });
        const sink = tables.zipSink(library, ZIP, 2);
        sink.begin("a.csv");
        sink.write(Buffer.from("AAAA"));
        sink.write(Buffer.from("bbbb"));
        sink.write(Buffer.from("CCCC"));
        sink.end();
        const blob = sink.finish();
        expect(new TextDecoder().decode(await blobBytes(blob))).toBe("AAAAbbbbCCCC");
        expect(blob.size).toBe(12);
    });

    test("(6) the product's own zip of two small tables: each entry deflated and smaller than its text, the names and bytes right, the Blob of the type it was given", async () => {
        const { tables } = await modules();
        const texts = [
            { name: "sales_2024.csv", bytes: Buffer.from(`\ufeffid,name\r\n${"1,Ann\r\n".repeat(300)}`) },
            { name: "é_notes.csv", bytes: Buffer.from(`x,y\r\n${'"line\nbreak",and , comma\r\n'.repeat(120)}`) },
        ];
        const sink = tables.zipSink(fflate, "application/zip", 2);
        for (const { name, bytes } of texts) {
            writeEntry(sink, name, bytes, 1000);
        }
        expect(sink.problem()).toBeNull();
        const blob = sink.finish();
        expect(blob.type).toBe("application/zip");
        const zip = await blobBytes(blob);
        const read = readZip(zip);
        expect(read.map((entry) => entry.name)).toEqual(texts.map((text) => text.name));
        for (const [i, entry] of read.entries()) {
            expect(entry.bytes.equals(texts[i].bytes), entry.name).toBe(true);
            expect(entry.method, `${entry.name} is deflated`).toBe(8);
            expect(compressedSizes(zip)[i], `${entry.name} is smaller than its text`).toBeLessThan(texts[i].bytes.length / 2);
        }
        // (the library's own reader agrees)
        expect(Object.keys(fflate.unzipSync(new Uint8Array(zip)))).toEqual(texts.map((text) => text.name));
        // and the type is whatever the sink is given
        const other = tables.zipSink(fflate, "application/x-test", 1);
        writeEntry(other, "a.csv", Buffer.from("x\r\n"));
        expect(other.finish().type).toBe("application/x-test");
    });

    // an entry written with the clock of the test put at `now`; the global Date is replaced for the
    // length of the call only (nothing in it waits), and always put back
    const mtimeWhenNowIs = async (now) => {
        const RealDate = Date;
        class FakeDate extends RealDate {
            constructor(...parts) {
                super(...(parts.length === 0 ? [now.getTime()] : parts));
            }
            static now() {
                return now.getTime();
            }
        }
        const { tables } = await modules();
        let blob;
        globalThis.Date = FakeDate;
        try {
            const sink = tables.zipSink(fflate, ZIP, 1);
            writeEntry(sink, "a.csv", Buffer.from("x\r\n"));
            blob = sink.finish();
        } finally {
            globalThis.Date = RealDate;
        }
        expect(globalThis.Date).toBe(RealDate);
        return readZip(await blobBytes(blob))[0].mtime;
    };

    test("(7) the date of an entry: a clock before 1980 gives 1 January 1980, one after 2099 gives 31 December 2099 at 23:59:58, and today is today", async () => {
        const before = await mtimeWhenNowIs(new Date(1975, 5, 15, 12, 30, 0));
        expect(before).toEqual(new Date(1980, 0, 1, 0, 0, 0));
        const after = await mtimeWhenNowIs(new Date(2105, 2, 3, 4, 5, 6));
        expect(after).toEqual(new Date(2099, 11, 31, 23, 59, 58));
        // the edges: 1979 is too early, 1980 is not; 2099 is not too late, 2100 is
        expect(await mtimeWhenNowIs(new Date(1979, 11, 31, 23, 59, 58))).toEqual(new Date(1980, 0, 1, 0, 0, 0));
        expect(await mtimeWhenNowIs(new Date(1980, 0, 1, 0, 0, 2))).toEqual(new Date(1980, 0, 1, 0, 0, 2));
        expect(await mtimeWhenNowIs(new Date(2099, 5, 1, 12, 0, 0))).toEqual(new Date(2099, 5, 1, 12, 0, 0));
        expect(await mtimeWhenNowIs(new Date(2100, 0, 1, 0, 0, 0))).toEqual(new Date(2099, 11, 31, 23, 59, 58));
        // today: the clock is the real one (a DOS time keeps two seconds, rounded down)
        const sink = (await modules()).tables.zipSink(fflate, ZIP, 1);
        const started = Date.now();
        writeEntry(sink, "a.csv", Buffer.from("x\r\n"));
        const today = readZip(await blobBytes(sink.finish()))[0].mtime;
        expect(Math.abs(today.getTime() - started)).toBeLessThan(10_000);
    });

    test("(8) fileSink keeps the parts in order, gives a Blob of the type it was given, and has no problem", async () => {
        const { tables } = await modules();
        const sink = tables.fileSink("text/csv;charset=utf-8");
        expect(sink.problem()).toBeNull();
        sink.begin("ignored.csv");
        sink.write(Buffer.from("\ufeff"));
        sink.write(Buffer.from("id,name\r\n"));
        sink.write(Buffer.from("1,Ann\r\n"));
        sink.end();
        expect(sink.problem()).toBeNull();
        const blob = sink.finish();
        expect(blob.type).toBe("text/csv;charset=utf-8");
        expect((await blobBytes(blob)).toString("utf8")).toBe("\ufeffid,name\r\n1,Ann\r\n");
        expect(tables.fileSink("text/plain").finish().type).toBe("text/plain");
        expect(tables.fileSink("text/plain").finish().size).toBe(0);
    });
});

// ---- the texts that are built ---------------------------------------------------------------------

test.describe("the texts of config-workflow.js that are built from numbers, names and the engine's words", () => {
    test.beforeEach(skipUnlessFirst);

    test("exportTablesProgressRows: the count written so far of the count there is, one row or more rows; the rows alone when more were written than counted", async () => {
        const { config } = await modules();
        expect(config.exportTablesProgressRows(0, 1)).toBe("0 of 1 row");
        expect(config.exportTablesProgressRows(0, 2)).toBe("0 of 2 rows");
        expect(config.exportTablesProgressRows(1, 1)).toBe("1 of 1 row");
        expect(config.exportTablesProgressRows(1234, 5000)).toBe("1,234 of 5,000 rows");
        expect(config.exportTablesProgressRows(0, 0)).toBe("0 of 0 rows");
        // (a view can give more rows than it counted: then no count is claimed)
        expect(config.exportTablesProgressRows(3, 2)).toBe("3 rows");
        expect(config.exportTablesProgressRows(1, 0)).toBe("1 row");
        expect(config.exportTablesProgressRows(12_345, 12_000)).toBe("12,345 rows");
    });

    test("the failed, uncounted and unread texts are a whole sentence of the page and then the engine's words, set apart", async () => {
        const { config } = await modules();
        const reason = "integer overflow";
        expect(config.exportTablesFailedText("m_bad", reason)).toBe("Nothing was exported, because m_bad could not be read. The database said: integer overflow");
        expect(config.exportTablesUncountedText(reason)).toBe("Its rows could not be counted, so it cannot be exported. The database said: integer overflow");
        expect(config.exportTablesUnreadText(reason)).toBe("It could not be read to its end, so it was not exported. The database said: integer overflow");
        // the page's sentence ends with a full stop and the engine's words come last, as they are, colons and all
        const odd = "no such column: a. b: c";
        for (const text of [config.exportTablesFailedText("t", odd), config.exportTablesUncountedText(odd), config.exportTablesUnreadText(odd)]) {
            expect(text).toMatch(/^[A-Z][^:]*\. The database said: /);
            expect(text.endsWith(`The database said: ${odd}`)).toBe(true);
        }
    });

    test("storageNoticeEventsText: the import alone is the sentence Phase 2 had; the export alone speaks of tables exported; both speak of both", async () => {
        const { config } = await modules();
        expect(config.storageNoticeEventsText({ imports: true, exports: false })).toBe(
            "Your browser could not save the record of the files you brought in. It is kept until this tab is closed: export your evidence before you close it.",
        );
        const exported = config.storageNoticeEventsText({ imports: false, exports: true });
        expect(exported).toMatch(/the tables you exported/);
        expect(exported).not.toMatch(/brought in/);
        const both = config.storageNoticeEventsText({ imports: true, exports: true });
        expect(both).toMatch(/the files you brought in and the tables you exported/);
        // (the same sentence around what is named)
        const around = (text, what) => text.replace(what, "WHAT");
        expect(around(exported, "the tables you exported")).toBe(around(config.storageNoticeEventsText({ imports: true, exports: false }), "the files you brought in"));
        expect(around(both, "the files you brought in and the tables you exported")).toBe(around(exported, "the tables you exported"));
    });
});

// Every word of the export that a student reads, typed out here and not taken from the module: the
// specs of the page take the words they look for from js/lab/config-workflow.js, so a word that was
// changed there, or two that were swapped (Export and Cancel), would be seen by none of them.
test.describe("the words of the export, typed out", () => {
    test.beforeEach(skipUnlessFirst);

    // the texts that are plain constants
    const WORDS = {
        EXPORT_TABLES_MENU_TEXT: "Tables as CSV…",
        EXPORT_TABLES_MENU_DESCRIPTION: "Tables and views, one file each",
        EXPORT_TABLES_BUSY_MESSAGE: "An export is running, so nothing else was done. Wait for it to end, or cancel it.",
        EXPORT_TABLES_NONE_MESSAGE: "This database has no tables or views to export.",
        EXPORT_TABLES_LOADING_MESSAGE: "A database is still loading, so no tables were offered. Choose Tables as CSV again once it has opened.",
        EXPORT_TABLES_LIST_FAILED_MESSAGE: "The list of tables could not be read, so nothing was offered.",
        EXPORT_TABLES_LOADING_DIALOG_MESSAGE:
            "A database is still loading, so nothing was exported. Once it has opened, choose Tables as CSV again. If it does not open, press Export again.",
        EXPORT_TABLES_GONE_MESSAGE: "Nothing was exported. Another database is open now, so this list is out of date. Close this box and choose Tables as CSV again.",
        EXPORT_TABLES_TITLE: "Tables as CSV",
        EXPORT_TABLES_TEXT_LINE:
            "Each table or view you tick becomes a CSV file. If you tick one, that file is saved. If you tick several, they are saved together in one zip file.",
        EXPORT_TABLES_LIST_LABEL: "Tables and views",
        EXPORT_TABLES_ALL_LABEL: "All tables and views",
        EXPORT_TABLES_VIEW_WORD: "view",
        EXPORT_TABLES_SUBMIT_TEXT: "Export",
        EXPORT_TABLES_CANCEL_TEXT: "Cancel",
        EXPORT_TABLES_CLOSE_TEXT: "Close",
        EXPORT_TABLES_COUNTING: "Counting rows…",
        EXPORT_TABLES_HOLD_COUNTING: "You can press Export once the rows of every table and view have been counted.",
        EXPORT_TABLES_HOLD_NONE: "Tick at least one table or view to export.",
        EXPORT_TABLES_HOLD_NOTHING: "Nothing in this list can be exported. Each row says why.",
        EXPORT_TABLES_PROGRESS_LIBRARY: "Loading the zip tool…",
        EXPORT_TABLES_CANCELLED_MESSAGE: "The export was cancelled, and nothing was saved.",
        EXPORT_TABLES_FAILED_MESSAGE: "The export failed, and nothing was exported.",
        EXPORT_TABLES_OUT_OF_MEMORY_MESSAGE: "The browser ran out of memory, and nothing was exported.",
        EXPORT_TABLES_LIBRARY_FAILED_MESSAGE: "The zip tool could not be loaded, so nothing was exported. Check the connection and try again.",
        EXPORT_TABLES_FILE_FAILED_MESSAGE: "The file could not be made, so nothing was exported.",
        EXPORT_TABLES_ZIP_FAILED_MESSAGE: "The zip file could not be made, so nothing was exported.",
        EXPORT_TABLES_ZIP_TOO_BIG_MESSAGE: "These tables hold more than one zip file can, so nothing was exported. Export fewer tables at a time.",
        EXPORT_TABLES_SAVE_FAILED_MESSAGE: "The browser could not save the file, so nothing was exported.",
    };

    // the functions that make a sentence, each with examples that show every branch of it: [the
    // arguments, the sentence]
    const SENTENCES = {
        exportTablesRowsText: [
            [[0], "0 rows"],
            [[1], "1 row"],
            [[2], "2 rows"],
            [[1234], "1,234 rows"],
            [[1234567], "1,234,567 rows"],
        ],
        exportTablesUncountedText: [[["no such table: t"], "Its rows could not be counted, so it cannot be exported. The database said: no such table: t"]],
        exportTablesUnreadText: [[["disk I/O error"], "It could not be read to its end, so it was not exported. The database said: disk I/O error"]],
        exportTablesSavedAsText: [
            [["orders.csv"], "Saved as orders.csv"],
            [["a_2.csv"], "Saved as a_2.csv"],
        ],
        exportTablesWillSaveText: [
            [[{ kind: "file", fileName: "orders.csv", entries: [{}] }], "Saves orders.csv."],
            [[{ kind: "zip", fileName: "shop-tables.zip", entries: [{}, {}] }], "Saves shop-tables.zip, with 2 CSV files."],
            [[{ kind: "zip", fileName: "shop-tables.zip", entries: [{}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}] }], "Saves shop-tables.zip, with 14 CSV files."],
        ],
        exportTablesProgressTitle: [
            [[1, 1, "orders"], "Exporting orders"],
            [[2, 14, "items"], "Exporting table 2 of 14: items"],
            [[1, 2, "a"], "Exporting table 1 of 2: a"],
            [[2, 2, "b"], "Exporting table 2 of 2: b"],
        ],
        exportTablesProgressRows: [
            [[0, 1], "0 of 1 row"],
            [[1, 2], "1 of 2 rows"],
            [[1234, 5000], "1,234 of 5,000 rows"],
            [[3, 2], "3 rows"],
            [[12_345, 12_000], "12,345 rows"],
        ],
        exportedTablesMessage: [
            [["orders.csv", { rows: 1 }], "Exported orders.csv with 1 row"],
            [["orders.csv", { rows: 2 }], "Exported orders.csv with 2 rows"],
            [["orders.csv", { rows: 1234 }], "Exported orders.csv with 1,234 rows"],
            [["shop-tables.zip", { rows: 500, tables: 14 }], "Exported shop-tables.zip with 14 tables"],
            [["shop-tables.zip", { rows: 500, tables: 2 }], "Exported shop-tables.zip with 2 tables"],
            [["shop-tables.zip", { rows: 500, tables: 1 }], "Exported shop-tables.zip with 1 table"],
            [["shop-tables.zip", { rows: 500, tables: 1234 }], "Exported shop-tables.zip with 1,234 tables"],
        ],
        exportTablesBlobNote: [
            [
                ["photos.csv", ["photos"]],
                "Exported photos.csv. This table holds binary values (BLOBs): photos. A CSV file holds text only, so each binary value is written as x'…', with its bytes as hexadecimal digits between the quotes, the way the results pane shows it.",
            ],
            [
                ["shop-tables.zip", ["photos", "scans"]],
                "Exported shop-tables.zip. These tables hold binary values (BLOBs): photos, scans. A CSV file holds text only, so each binary value is written as x'…', with its bytes as hexadecimal digits between the quotes, the way the results pane shows it.",
            ],
            [
                ["shop-tables.zip", ["a", "b", "c"]],
                "Exported shop-tables.zip. These tables hold binary values (BLOBs): a, b, c. A CSV file holds text only, so each binary value is written as x'…', with its bytes as hexadecimal digits between the quotes, the way the results pane shows it.",
            ],
        ],
        exportEventFileLine: [[["orders.csv", 1234], "file: orders.csv, 1234 bytes"]],
        exportEventTableLine: [
            [["orders", 12], "table: orders, 12 rows"],
            [["orders", 12, "orders.csv"], "table: orders, 12 rows, orders.csv"],
        ],
    };

    // Of the three sentences built from the engine's words, only exportTablesFailedText is left to the
    // test of the failed, uncounted and unread texts; exportTablesUncountedText and exportTablesUnreadText
    // are typed in SENTENCES here as well. The names that hold numbers or types are left to the tests of
    // the settings: EXPORT_PIECE_CHARS, EXPORT_PIECE_MS, EXPORT_CSV_SUFFIX, EXPORT_CSV_TYPE,
    // EXPORT_ZIP_SUFFIX, EXPORT_ZIP_TYPE, EXPORT_NAME_MAX_CHARS, EXPORT_ZIP_LIBRARY, EXPORT_ZIP_LEVEL,
    // EXPORT_ZIP_MAX_ENTRIES, EXPORT_ZIP_MAX_BYTES.
    const LEFT_TO_OTHER_TESTS = [
        "EXPORT_PIECE_CHARS",
        "EXPORT_PIECE_MS",
        "EXPORT_CSV_SUFFIX",
        "EXPORT_CSV_TYPE",
        "EXPORT_ZIP_SUFFIX",
        "EXPORT_ZIP_TYPE",
        "EXPORT_NAME_MAX_CHARS",
        "EXPORT_ZIP_LIBRARY",
        "EXPORT_ZIP_LEVEL",
        "EXPORT_ZIP_MAX_ENTRIES",
        "EXPORT_ZIP_MAX_BYTES",
        "exportTablesFailedText",
    ];

    test("each text of the export that is a constant reads as typed here", async () => {
        const { config } = await modules();
        for (const [name, words] of Object.entries(WORDS)) {
            expect(config[name], name).toBe(words);
        }
    });

    test("each sentence that is made by a function reads as typed here, for the examples of each of its branches", async () => {
        const { config } = await modules();
        for (const [name, examples] of Object.entries(SENTENCES)) {
            expect(typeof config[name], `${name} is a function`).toBe("function");
            for (const [args, sentence] of examples) {
                // (a function that throws is a text that is wrong: it is told as one)
                let made;
                try {
                    made = config[name](...args);
                } catch (error) {
                    made = `threw ${error}`;
                }
                expect(made, `${name}(${JSON.stringify(args)})`).toBe(sentence);
            }
        }
    });

    test("no name that begins with export or EXPORT_ in the module is a word that this group does not type out: a text added under such a name is added here", async () => {
        const { config } = await modules();
        const known = new Set([...Object.keys(WORDS), ...Object.keys(SENTENCES), ...LEFT_TO_OTHER_TESTS]);
        const ofTheExport = Object.keys(config).filter((name) => /^export/i.test(name));
        const unknown = ofTheExport.filter((name) => !known.has(name));
        expect(unknown, "exports of the export's words that no test types out").toEqual([]);
        // (and nothing typed here has gone from the module)
        const gone = [...known].filter((name) => !(name in config));
        expect(gone, "names typed here that the module no longer has").toEqual([]);
        // a constant that holds a text is in WORDS: whatever is a string and was not left aside is typed
        for (const name of ofTheExport) {
            if (typeof config[name] === "string") {
                expect(name in WORDS || LEFT_TO_OTHER_TESTS.includes(name), `${name} is a text`).toBe(true);
            }
        }
    });
});

test.describe("engineLine of the runner: the engine's words on one line", () => {
    test.beforeEach(skipUnlessFirst);

    test("line breaks and tabs become one space, nothing is left at the ends, and the wrapper's prefix is gone as in engineMessage", async () => {
        const { runner } = await modules();
        expect(runner.engineLine(new Error("no such column:\n\tpric\r\n   in   t "))).toBe("no such column: pric in t");
        expect(runner.engineLine(new Error("\n\t  lead and trail \t\n"))).toBe("lead and trail");
        expect(runner.engineLine(new Error("a b"))).toBe("a b");
        expect(runner.engineLine(new Error("SQLite3Error: SQLITE_ERROR: sqlite3 result code 1: no such column: pric"))).toBe("no such column: pric");
        expect(runner.engineLine(new Error("SQLITE_CONSTRAINT_UNIQUE: sqlite3 result code 2067: UNIQUE constraint failed:\n  t.id"))).toBe("UNIQUE constraint failed: t.id");
        // the same words as engineMessage, on one line
        for (const text of ["SQLITE_ERROR: sqlite3 result code 1: near \"x\":\n\tsyntax error", "plain words", "two\n\nlines"]) {
            expect(runner.engineLine(new Error(text))).toBe(runner.engineMessage(new Error(text)).replace(/\s+/g, " ").trim());
        }
        // a thing that is not an Error is its text
        expect(runner.engineLine("a\nb")).toBe("a b");
    });
});

// ---- the documents: the credit for the library, and what is noted of an export ------------------------------------------

// about.html and README.md are read from disk, as they are shipped. The sentences are in those files
// and not in the config, so the words that matter are typed here; the one thing read from the config
// is the name of the menu entry, so that About can be held not to name it (Phase 8 renames the entry,
// and a name in About would be left stale). The page's own words about the browser's memory, and the credit for Papa
// Parse, are held in the page by tests/aw2-import-page.spec.js ("about.html"); this group is the
// export's half and needs no page.
test.describe("the documents: fflate is credited with its licence, About says what is noted of an export, the README tells how to try it", () => {
    test.beforeEach(skipUnlessFirst);

    const ROOT = path.join(__dirname, "..");
    const read = (file) => fs.readFileSync(path.join(ROOT, file), "utf8");
    // the text of a page, as a reader sees it: no tags, one space between words
    const textOf = (html) => html.replace(/<[^>]+>/g, " ").replace(/&minus;/g, "-").replace(/&middot;/g, "·").replace(/\s+/g, " ").trim();
    const aboutText = () => textOf(read("about.html"));
    const readme = () => read("README.md").replace(/\s+/g, " ");

    test("about.html credits fflate and its author with the licence, among the credits and beside Papa Parse's line", () => {
        const html = read("about.html");
        const credits = html.slice(html.indexOf("<h2>Credits and licence</h2>"));
        expect(credits.startsWith("<h2>")).toBe(true);
        const lines = [...credits.matchAll(/<p>([^<]*)<\/p>/g)].map((match) => match[1].replace(/\s+/g, " ").trim());
        const papa = lines.findIndex((line) => line.includes("Papa Parse"));
        const zip = lines.findIndex((line) => line.includes("fflate"));
        expect(papa).toBeGreaterThan(-1);
        expect(lines[zip]).toBe("Zip files of exported tables are written with fflate, by Arjun Barrett (MIT License).");
        // (the credit for the zip tool comes right after the credit for the CSV reader: both are libraries the page fetches only when used)
        expect(zip).toBe(papa + 1);
        // and the licence it names is the licence of the file that is shipped, in the name of the same person
        const licence = read("vendor/fflate.LICENSE.txt");
        expect(licence).toContain("Arjun Barrett");
        expect(licence).toMatch(/\bMIT\b/);
    });

    test("about.html says, in the paragraph on what is remembered between visits, that a note is kept of each file imported and of each file saved when tables are exported, and of what; the paragraph names no menu entry", async () => {
        const { EXPORT_TABLES_MENU_TEXT } = await modules().then((loaded) => loaded.config);
        const html = read("about.html");
        // the paragraph that says what is remembered between visits, as a reader sees it
        const paragraphs = [...html.matchAll(/<p>([\s\S]*?)<\/p>/g)].map((match) => textOf(match[1])).filter((text) => text.includes("remembered between visits"));
        expect(paragraphs).toHaveLength(1);
        const remembered = paragraphs[0];
        // the sentence, typed: the import's note and the export's note, after the run log
        expect(remembered).toContain(
            "Along with the run log, your browser also keeps a note of each file you import (its name, its size and the tables it made) and of each file you save when you export tables (its name, its size and the tables in it).",
        );
        // the list it ends is the one the sentence follows: the theme and the panes come before it
        expect(remembered).toContain("the theme and the text size you chose, and the sizes you gave the panes (and whether the sidebar is hidden). Along with the run log,");
        // and the sentence comes before what is said of a browser with no room left and of clearing its data
        expect(remembered.indexOf("Along with the run log")).toBeLessThan(remembered.indexOf("If your browser has no room left"));
        expect(remembered.indexOf("If your browser has no room left")).toBeLessThan(remembered.indexOf("Clearing your browser's site data clears everything"));
        // it names no menu entry, so that a renamed entry can never leave a stale name there
        const entry = EXPORT_TABLES_MENU_TEXT.replace(/…$/, "");
        expect(entry.length).toBeGreaterThan(3);
        expect(remembered).not.toContain(entry);
        expect(remembered).not.toContain("…");
    });

    test("the README credits fflate with its version, licence and author, and says it is fetched only when two tables or more are exported", () => {
        const text = readme();
        const credits = text.slice(text.indexOf("## Credits and licence"));
        expect(credits.startsWith("## Credits")).toBe(true);
        expect(credits).toContain("[fflate](https://github.com/101arrowz/fflate) 0.8.3 (MIT, Copyright 2026 Arjun Barrett)");
        expect(credits).toContain("the publisher's own `umd/index.js` as `fflate.min.js`, unchanged, in `vendor/` with its licence (`fflate.LICENSE.txt`)");
        expect(credits).toContain("fetched only when Export is first pressed with two tables or more");
        // the version and the holder it names are those of the files in vendor/
        expect(read("vendor/fflate.LICENSE.txt")).toContain("Copyright (c) 2026 Arjun Barrett");
        // and the files it names are there
        for (const file of ["vendor/fflate.min.js", "vendor/fflate.LICENSE.txt"]) {
            expect(fs.existsSync(path.join(ROOT, file)), file).toBe(true);
        }
    });

    test("the README lists the export among the features that are switched off, with the address that turns it on", () => {
        const text = readme();
        const section = text.slice(text.indexOf("### Features that are still switched off"), text.indexOf("## Run it locally"));
        expect(section.length).toBeGreaterThan(100);
        expect(section).toContain("So far two features are behind a flag:");
        expect(section).toContain("- `export` (the plan's Phase 3): with `?preview=export`");
        expect(section).toContain("\"Tables as CSV…\"");
        // what it tells of the file is what the module writes: a byte-order mark, a BLOB as hex text
        expect(section).toContain("UTF-8 with a byte-order mark");
        expect(section).toContain("`x'…'`");
        // the checks by hand, those made and those still to make, as the plan lists them: each is named
        for (const word of ["Tableau", "Excel", "Safari", "lab PC", "con.csv", "Windows"]) {
            expect(section, word).toContain(word);
        }
    });

    test("the README's sizes for the app bundle are those of the files, to within a few kilobytes", () => {
        const zlib = require("node:zlib");
        const text = readme();
        const js = /not minified, so the names stay readable; about (\d+) KB, (\d+) KB compressed\)/.exec(text);
        const css = /joined in the order of the cascade \(about (\d+) KB, (\d+) KB compressed\)/.exec(text);
        expect(js, "the sentence about bundle/app.js").not.toBeNull();
        expect(css, "the sentence about bundle/app.css").not.toBeNull();
        for (const [file, said] of [["app.js", js], ["app.css", css]]) {
            const bytes = fs.readFileSync(path.join(ROOT, "bundle", file));
            const gzipped = zlib.gzipSync(bytes, { level: 9 }).length;
            expect(Math.abs(Number(said[1]) * 1000 - bytes.length), `${file}: README says ${said[1]} KB, the file is ${bytes.length} bytes`).toBeLessThanOrEqual(5000);
            expect(Math.abs(Number(said[2]) * 1000 - gzipped), `${file}: README says ${said[2]} KB compressed, the file gives ${gzipped} bytes`).toBeLessThanOrEqual(3000);
        }
    });
});
