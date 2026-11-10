const crypto = require("node:crypto");
const path = require("node:path");
const { pathToFileURL } = require("node:url");
const { test, expect, evidenceFile } = require("./helpers");

// F11, the pure part (js/lab/evidence.js): file format, checksum and verification, run in Node
// against a second implementation of the format (tests/helpers.js evidenceFile). The same
// code runs in the browser; tests/m5-evidence-ui.spec.js drives it through the page.

const load = (file) => import(pathToFileURL(path.join(__dirname, "..", "js", "lab", file)).href);

const ENTRIES = [
    { t: "2026-11-09T13:58:12Z", outcome: "12 rows", sql: "SELECT category, COUNT(*) FROM products GROUP BY category;" },
    { t: "2026-11-09T14:01:40Z", outcome: "error: no such column: pric", sql: "SELECT pric FROM products;" },
    { t: "2026-11-09T14:02:00Z", outcome: "1 row", sql: "SELECT 1\n\nUNION ALL\n  SELECT 2 LIMIT 1;" },
    { t: "2026-11-09T14:03:00Z", outcome: "0 rows", sql: "SELECT 1 WHERE 0;", link: "http://127.0.0.1/#s=abc" },
];
const sample = (over = {}) => evidenceFile({ entries: ENTRIES, ...over });

// replace the character at `i` (UTF-16 index) with `c`
const swap = (text, i, c) => text.slice(0, i) + c + text.slice(i + 1);
const other = (ch, wanted) => (ch === wanted ? "~" : wanted);

test.describe("format", () => {
    test("the exported layout is byte for byte what a second implementation writes", async () => {
        const { buildEvidence, formatEvidence } = await load("evidence.js");
        const entries = [
            { t: ENTRIES[0].t, sql: ENTRIES[0].sql, rows: 12 },
            { t: ENTRIES[1].t, sql: ENTRIES[1].sql, error: "no such column: pric" },
            { t: ENTRIES[2].t, sql: ENTRIES[2].sql, rows: 1 },
            { t: ENTRIES[3].t, sql: ENTRIES[3].sql, rows: 0, link: ENTRIES[3].link },
        ];
        const input = { entries, dataset: "northlight", exported: "2026-11-09T14:32:08Z", student: "U2034567" };
        const text = await buildEvidence(input);
        expect(text).toBe(sample());
        expect(text).toBe(`${formatEvidence(input)}sha256: ${crypto.createHash("sha256").update(formatEvidence(input)).digest("hex")}\n`);
        expect(text.split("\n")[0]).toBe("SQL Lab evidence export v1");
        expect(text).toContain("\n[1] 2026-11-09T13:58:12Z · 12 rows\n");
        expect(text).toContain("\n[3] 2026-11-09T14:02:00Z · 1 row\n");
        expect(text).toContain("\n[4] 2026-11-09T14:03:00Z · 0 rows\n");
        expect(text).toContain("\n[2] 2026-11-09T14:01:40Z · error: no such column: pric\nSELECT pric FROM products;\n\n");
    });

    test("SQL newlines are normalised to LF, lone CR included, and the file has no CR", async () => {
        const { buildEvidence } = await load("evidence.js");
        const text = await buildEvidence({
            entries: [{ t: ENTRIES[0].t, sql: "SELECT 1\r\nFROM a\rWHERE b\nAND c;", rows: 1 }],
            dataset: "d",
            exported: "2026-11-09T14:32:08Z",
            student: "U2034567",
        });
        expect(text).not.toContain("\r");
        expect(text).toContain("\nSELECT 1\nFROM a\nWHERE b\nAND c;\n\nstudent: U2034567\nsha256: ");
        expect(text.endsWith("\n")).toBe(true);
        expect(text.endsWith("\n\n")).toBe(false);
    });

    test("the checksum covers the first line through the LF of the student line, as lower-case hex", async () => {
        const { buildEvidence, sha256Hex } = await load("evidence.js");
        const text = await buildEvidence({
            entries: [{ t: ENTRIES[0].t, sql: "SELECT 'é日本😀';", rows: 1 }],
            dataset: "d",
            exported: "2026-11-09T14:32:08Z",
            student: "abc123",
        });
        const cut = text.indexOf("sha256: ");
        const signed = text.slice(0, cut);
        expect(signed.endsWith("student: abc123\n")).toBe(true);
        const expected = crypto.createHash("sha256").update(Buffer.from(signed, "utf8")).digest("hex");
        expect(text.slice(cut)).toBe(`sha256: ${expected}\n`);
        expect(await sha256Hex(signed)).toBe(expected);
        expect(expected).toMatch(/^[0-9a-f]{64}$/);
    });

    test("a dataset name with control characters stays on one line", async () => {
        const { buildEvidence, verifyEvidence, sanitizeLine } = await load("evidence.js");
        expect(sanitizeLine("file:a\nb\r\tc d\u0000e")).toBe("file:a_b__c_d_e");
        const text = await buildEvidence({
            entries: [{ t: ENTRIES[0].t, sql: "SELECT 1;", rows: 1 }],
            dataset: "file:a\nb c.db",
            exported: "2026-11-09T14:32:08Z",
            student: "U2034567",
        });
        expect(text.split("\n")[1]).toBe("dataset: file:a_b_c.db");
        expect((await verifyEvidence(text)).status).toBe("valid");
    });

    test("an error message with line breaks is written on one line", async () => {
        const { buildEvidence, verifyEvidence } = await load("evidence.js");
        const text = await buildEvidence({
            entries: [{ t: ENTRIES[0].t, sql: "SELECT 1;", error: "first\nsecond\r\nthird" }],
            dataset: "d",
            exported: "2026-11-09T14:32:08Z",
            student: "U2034567",
        });
        expect(text).toContain("· error: first second third\n");
        expect((await verifyEvidence(text)).status).toBe("valid");
    });

    test("formatEvidence refuses no entries and a student number that cannot sit on one line", async () => {
        const { formatEvidence } = await load("evidence.js");
        const base = { entries: [{ t: ENTRIES[0].t, sql: "SELECT 1;", rows: 1 }], dataset: "d", exported: "2026-11-09T14:32:08Z" };
        expect(() => formatEvidence({ ...base, entries: [], student: "U2034567" })).toThrow(RangeError);
        for (const student of ["", "a\nb", "a\rb", "a b", undefined]) {
            expect(() => formatEvidence({ ...base, student }), JSON.stringify(student)).toThrow(RangeError);
        }
    });
});

test.describe("verify", () => {
    test("a file the exporter wrote is VALID and reports student, count, time and dataset", async () => {
        const { verifyEvidence } = await load("evidence.js");
        expect(await verifyEvidence(sample())).toEqual({
            status: "valid",
            student: "U2034567",
            queries: 4,
            exported: "2026-11-09T14:32:08Z",
            dataset: "northlight",
        });
    });

    test("AC10 replacing EVERY character of the file, one at a time, gives EDITED", async () => {
        const { verifyEvidence } = await load("evidence.js");
        const text = sample({
            entries: [
                ...ENTRIES,
                { t: "2026-11-09T14:04:00Z", outcome: "1 row", sql: "SELECT 'é日本語😀 𝒳';" },
            ],
        });
        expect((await verifyEvidence(text)).status).toBe("valid");
        const failures = [];
        let tried = 0;
        // every position, every kind of replacement: a letter, a space, CR, LF, a multi-byte
        // character and an astral character
        for (let i = 0; i < text.length; i++) {
            for (const wanted of ["Z", " ", "\r", "\n", "é", "😀"]) {
                const c = other(text[i], wanted);
                if (c === text[i]) continue;
                tried++;
                const result = await verifyEvidence(swap(text, i, c));
                if (result.status !== "edited") {
                    failures.push(`${i} ${JSON.stringify(text[i])} -> ${JSON.stringify(c)}: ${result.status}`);
                }
            }
        }
        expect(tried).toBeGreaterThan(text.length * 5);
        expect(failures).toEqual([]);
        // an upper-cased hex digit, in the sha256 line
        const hex = text.lastIndexOf("sha256: ") + 8;
        const letters = [...text.slice(hex, hex + 64)].map((c, k) => [c, k]).filter(([c]) => /[a-f]/.test(c));
        expect(letters.length).toBeGreaterThan(5);
        for (const [c, k] of letters) {
            const result = await verifyEvidence(swap(text, hex + k, c.toUpperCase()));
            expect(result.status, `upper-case at ${k}`).toBe("edited");
        }
    });

    test("every newline changed to a space and to CR gives EDITED", async () => {
        const { verifyEvidence } = await load("evidence.js");
        const text = sample();
        let count = 0;
        for (let i = 0; i < text.length; i++) {
            if (text[i] !== "\n") continue;
            count++;
            for (const c of [" ", "\r"]) {
                expect((await verifyEvidence(swap(text, i, c))).status, `newline ${i} -> ${JSON.stringify(c)}`).toBe("edited");
            }
        }
        expect(count).toBeGreaterThan(20);
    });

    test("deleting or inserting a single character gives EDITED", async () => {
        const { verifyEvidence } = await load("evidence.js");
        const text = sample();
        for (let i = 0; i < text.length - 1; i++) {
            expect((await verifyEvidence(text.slice(0, i) + text.slice(i + 1))).status, `delete ${i}`).toBe("edited");
        }
        for (let i = 0; i < text.length; i += 7) {
            expect((await verifyEvidence(`${text.slice(0, i)}x${text.slice(i)}`)).status, `insert ${i}`).toBe("edited");
        }
    });

    test("a CRLF copy of a valid file is VALID", async () => {
        const { verifyEvidence } = await load("evidence.js");
        const result = await verifyEvidence(sample().replaceAll("\n", "\r\n"));
        expect(result.status).toBe("valid");
        expect(result.queries).toBe(4);
    });

    test("at most one trailing newline: none or one is VALID, two are EDITED", async () => {
        const { verifyEvidence } = await load("evidence.js");
        const text = sample();
        expect((await verifyEvidence(text)).status).toBe("valid");
        expect((await verifyEvidence(text.slice(0, -1))).status).toBe("valid");
        expect((await verifyEvidence(`${text}\n`)).status).toBe("edited");
        expect((await verifyEvidence(`${text}\r\n`)).status).toBe("edited");
        expect((await verifyEvidence(`${text}\r\n\r\n`)).status).toBe("edited");
        expect((await verifyEvidence(`${text} `)).status).toBe("edited");
        expect((await verifyEvidence(`${text}x`)).status).toBe("edited");
        expect((await verifyEvidence(`\n${text}`)).status).toBe("edited");
        expect((await verifyEvidence(` ${text}`)).status).toBe("edited");
        // a lone CR is never turned into LF
        expect((await verifyEvidence(`${text.slice(0, -1)}\r`)).status).toBe("edited");
    });

    test("blank lines after the checksum line are EDITED but not called extra text", async () => {
        const { verifyEvidence } = await load("evidence.js");
        const text = sample();
        for (const extra of ["\n", "\n\n\n", "\r\n", "\r\n\r\n"]) {
            const result = await verifyEvidence(`${text}${extra}`);
            expect(result.status, JSON.stringify(extra)).toBe("edited");
            expect(result.reason).toBe("Extra blank lines were added after the checksum line.");
        }
        // anything else after it is still extra text
        for (const extra of ["\nx\n\n", "\n \n\n", "\n\nx\n\n"]) {
            const result = await verifyEvidence(`${text}${extra}`);
            expect(result.status, JSON.stringify(extra)).toBe("edited");
            expect(result.reason, JSON.stringify(extra)).toBe("There is extra text after the checksum line.");
        }
        // blank lines after a file whose contents were also changed: the reason is the change
        // (the checksum), not the blank lines, which would read as a stray newline
        for (const extra of ["\n", "\n\n", "\r\n"]) {
            const changed = await verifyEvidence(`${text.replace("12 rows", "13 rows")}${extra}`);
            expect(changed.status, JSON.stringify(extra)).toBe("edited");
            expect(changed.reason, JSON.stringify(extra)).toMatch(/checksum does not match/);
        }
        const twice = await verifyEvidence(`${text}${text.split("\n").slice(-2)[0]}\n\n`);
        expect(twice.status).toBe("edited");
        expect(twice.reason).not.toMatch(/blank lines/);
        // blank lines in front of a file whose last line is not the checksum are not blamed on it
        const damaged = `${text.replace(/sha256: [0-9a-f]+\n$/, "")}\n\n`;
        expect((await verifyEvidence(damaged)).reason).toBe("There is extra text after the checksum line.");
    });

    test("empty input, garbage and values that are not text are EDITED and never throw", async () => {
        const { verifyEvidence } = await load("evidence.js");
        const inputs = [
            "",
            "\n",
            " ",
            "\r\n",
            "garbage",
            "sha256: " + "0".repeat(64),
            "student: U2034567\nsha256: " + "0".repeat(64),
            "x\n".repeat(50),
            "\u0000\u0001\u0002",
            "\ud800",
            "😀".repeat(1000),
            "\n\n\n\n\n\n\n\n\n\n",
            null,
            undefined,
            0,
            123,
            {},
            [],
            ["a"],
            true,
            () => 1,
            Symbol("s"),
            { toString() { throw new Error("boom"); } },
        ];
        for (const input of inputs) {
            const result = await verifyEvidence(input);
            expect(result.status, String(typeof input)).toBe("edited");
            expect(typeof result.reason).toBe("string");
            expect(result.reason.length).toBeGreaterThan(5);
        }
        // random printable and binary-ish text
        let seed = 12345;
        const rnd = () => (seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;
        for (let n = 0; n < 200; n++) {
            const text = Array.from({ length: Math.floor(rnd() * 400) }, () => String.fromCharCode(Math.floor(rnd() * 0xd7ff))).join("");
            expect((await verifyEvidence(text)).status).toBe("edited");
        }
    });

    test("a reason never contains the words VALID or EDITED", async () => {
        const { verifyEvidence } = await load("evidence.js");
        const text = sample();
        const bad = [
            "", "garbage", `${text}\n`, swap(text, 5, "Z"), swap(text, text.length - 3, "Z"),
            text.replace("student: ", "pupil: "), text.slice(0, text.indexOf("sha256")),
        ];
        for (const input of bad) {
            const { reason } = await verifyEvidence(input);
            expect(reason).not.toMatch(/valid|edited/i);
        }
    });

    test("a footer in the middle of the file is EDITED", async () => {
        const { verifyEvidence } = await load("evidence.js");
        const a = sample();
        expect((await verifyEvidence(a + a)).status).toBe("edited");
        const half = a.split("\n[2]");
        expect((await verifyEvidence(`${half[0]}\n${a.slice(a.indexOf("student: "))}\n[2]${half[1]}`)).status).toBe("edited");
        // text added after the footer, with a footer-like line before it
        expect((await verifyEvidence(`${a}more text\n`)).status).toBe("edited");
        // footer lines moved in front of the entries
        const footer = a.slice(a.indexOf("student: "));
        const head = a.slice(0, a.indexOf("student: "));
        expect((await verifyEvidence(footer + head)).status).toBe("edited");
    });

    test("multi-line SQL, blank lines and indentation are VALID", async () => {
        const { verifyEvidence } = await load("evidence.js");
        const sql = "WITH t AS (\n  SELECT 1 AS a\n\n  UNION ALL\n\n\n  SELECT 2\n)\nSELECT * FROM t;";
        const result = await verifyEvidence(
            evidenceFile({ entries: [{ t: ENTRIES[0].t, outcome: "2 rows", sql }, { t: ENTRIES[1].t, outcome: "2 rows", sql }] })
        );
        expect(result).toMatchObject({ status: "valid", queries: 2 });
    });

    test("SQL with lines that look like entries, links or footers does not inflate the count", async () => {
        const { verifyEvidence, buildEvidence } = await load("evidence.js");
        const sql = [
            "SELECT 1 AS a, -- comment lines that look like file lines:",
            "[2] 2026-11-09T14:01:40Z · 12 rows", // looks like a header, but no blank line before it
            "",
            "[7] 2026-11-09T14:01:40Z · 12 rows", // after a blank line, but not the next number
            "",
            "[1] 2026-11-09T14:01:40Z · 12 rows", // after a blank line, but not the next number
            "link: http://example.invalid/#s=abc",
            "student: someone-else",
            "sha256: " + "a".repeat(64),
            "SQL Lab evidence export v1",
            "dataset: other",
            "exported: 2020-01-01T00:00:00Z",
            "'",
        ].join("\n");
        const text = evidenceFile({ entries: [{ t: ENTRIES[0].t, outcome: "1 row", sql }] });
        const result = await verifyEvidence(text);
        expect(result).toMatchObject({ status: "valid", queries: 1, student: "U2034567", dataset: "northlight", exported: "2026-11-09T14:32:08Z" });

        // The exporter writes such lines with a backslash in front, so that in a file it wrote the
        // header-shaped lines are the real ones. Computed here with a second implementation.
        const escaped = sql.replace(/^(\[\d+\] \d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z · (?:\d+ rows?|error: .*))$/gm, "\\$1");
        expect(escaped).not.toBe(sql);
        const built = await buildEvidence({
            entries: [{ t: ENTRIES[0].t, sql, rows: 1 }],
            dataset: "northlight",
            exported: "2026-11-09T14:32:08Z",
            student: "U2034567",
        });
        expect(built).toBe(evidenceFile({ entries: [{ t: ENTRIES[0].t, outcome: "1 row", sql: escaped }] }));
        expect((await verifyEvidence(built)).queries).toBe(1);

        // changing the SQL, even into more of the same, is still caught
        expect((await verifyEvidence(text.replace("'\n\nstudent", "''\n\nstudent"))).status).toBe("edited");
    });

    test("a genuine export whose last entry's SQL holds a chain of fake headers counts its real entries", async ({}) => {
        const { verifyEvidence, buildEvidence } = await load("evidence.js");
        const fakes = "select 3 -- x\n\n[4] 2026-11-09T13:58:12Z · 1 row\nselect 4\n\n[5] 2026-11-09T13:58:12Z · 1 row\nselect 5\n\n[6] 2026-11-09T13:58:12Z · error: x\nselect 6";
        const entries = (last) => [
            { t: ENTRIES[0].t, sql: "select 1", rows: 1 },
            { t: ENTRIES[1].t, sql: "select 2", rows: 1 },
            { t: ENTRIES[2].t, sql: last, rows: 1 },
        ];
        const input = (last) => ({ entries: entries(last), dataset: "northlight", exported: "2026-11-09T14:32:08Z", student: "U2034567" });
        for (const sql of [fakes, fakes.replace(/\n/g, "\r\n"), "[4] 2026-11-09T13:58:12Z · 1 row", "select 3\n\n[4] 2026-11-09T13:58:12Z · 12 rows"]) {
            const built = await buildEvidence(input(sql));
            expect(await verifyEvidence(built)).toMatchObject({ status: "valid", queries: 3 });
        }
        // the same in a middle entry, and with the real header of the next entry after it
        const middle = await buildEvidence({
            ...input("select 3"),
            entries: [{ t: ENTRIES[0].t, sql: fakes, rows: 1 }, { t: ENTRIES[1].t, sql: "select 2", rows: 1 }, { t: ENTRIES[2].t, sql: "select 3", rows: 1 }],
        });
        expect(await verifyEvidence(middle)).toMatchObject({ status: "valid", queries: 3 });
        // the SQL is still readable, with the one-character mark in front of the lines it escaped
        const text = await buildEvidence(input(fakes));
        expect(text).toContain("\n\\[4] 2026-11-09T13:58:12Z · 1 row\nselect 4\n");
        expect(text).toContain("\nselect 3 -- x\n\n\\[4]");
    });

    test("unicode and astral characters in SQL round-trip through a UTF-8 file", async () => {
        const { verifyEvidence, buildEvidence } = await load("evidence.js");
        const sql = "SELECT 'héllo wörld', '日本語', '😀🎉', '𝒳𝒴', 'é', '‮', '﻿';";
        const built = await buildEvidence({
            entries: [{ t: ENTRIES[0].t, sql, rows: 1 }],
            dataset: "northlight",
            exported: "2026-11-09T14:32:08Z",
            student: "U2034567",
        });
        expect(built).toBe(evidenceFile({ entries: [{ t: ENTRIES[0].t, outcome: "1 row", sql }] }));
        // as saved and read back: encoded to UTF-8 and decoded again
        const readBack = Buffer.from(built, "utf8").toString("utf8");
        expect((await verifyEvidence(readBack)).status).toBe("valid");
        // astral characters are one character: replacing one of its two UTF-16 halves is an edit
        const i = built.indexOf("😀");
        expect((await verifyEvidence(swap(built, i, "x"))).status).toBe("edited");
        expect((await verifyEvidence(swap(built, i + 1, "x"))).status).toBe("edited");
        expect((await verifyEvidence(built.replace("😀", "🙂"))).status).toBe("edited");
    });

    test("a lone surrogate in SQL is stored as U+FFFD and the file still verifies after a save and read", async () => {
        const { verifyEvidence, buildEvidence } = await load("evidence.js");
        const built = await buildEvidence({
            entries: [{ t: ENTRIES[0].t, sql: "SELECT '\ud83d';", rows: 1 }],
            dataset: "northlight",
            exported: "2026-11-09T14:32:08Z",
            student: "U2034567",
        });
        const readBack = Buffer.from(built, "utf8").toString("utf8");
        expect(readBack).toContain("SELECT '\ufffd';");
        expect((await verifyEvidence(readBack)).status).toBe("valid");
    });

    test("the first line may name any app, so a renamed app does not invalidate older files", async () => {
        const { verifyEvidence } = await load("evidence.js");
        expect((await verifyEvidence(sample({ appName: "Old Name" }))).status).toBe("valid");
        expect((await verifyEvidence(sample({ appName: "" }))).status).toBe("valid");
        expect((await verifyEvidence(sample({ appName: "Café 日本" }))).status).toBe("valid");
    });

    test("the first line must still end in 'evidence export v1'", async () => {
        const { verifyEvidence } = await load("evidence.js");
        const body = sample().split("\n");
        for (const first of ["SQL Lab evidence export v2", "SQL Lab evidence export", "evidence export v1x", "Notes", ""]) {
            const lines = [first, ...body.slice(1)];
            const signed = lines.slice(0, -2).join("\n") + "\n";
            const fixed = `${signed}sha256: ${crypto.createHash("sha256").update(signed).digest("hex")}\n`;
            expect((await verifyEvidence(fixed)).status, JSON.stringify(first)).toBe("edited");
        }
    });

    test("the student pattern is not applied: any non-empty value verifies", async () => {
        const { verifyEvidence } = await load("evidence.js");
        for (const student of ["x", "ab", "U20-34", "a b c", "ÅÄÖ", "1234567890123456789"]) {
            const result = await verifyEvidence(sample({ student }));
            expect(result, student).toMatchObject({ status: "valid", student });
        }
        // an empty or blank value is not a student number
        for (const student of ["", " ", "   "]) {
            expect((await verifyEvidence(sample({ student }))).status, JSON.stringify(student)).toBe("edited");
        }
    });

    test("an upper-case checksum is refused even though the digest is right", async () => {
        const { verifyEvidence } = await load("evidence.js");
        const text = sample();
        const i = text.lastIndexOf("sha256: ") + 8;
        const upper = text.slice(0, i) + text.slice(i).toUpperCase();
        expect(upper).not.toBe(text);
        expect((await verifyEvidence(upper)).status).toBe("edited");
        // and so are a short, long and spaced checksum line
        for (const sha of [text.slice(i, i + 63), `${text.slice(i, i + 64)}0`, ` ${text.slice(i, i + 64)}`, `${text.slice(i, i + 64)} `]) {
            expect((await verifyEvidence(`${text.slice(0, i)}${sha}\n`)).status).toBe("edited");
        }
        const label = text.slice(0, i - 8) + "sha256:  " + text.slice(i);
        expect((await verifyEvidence(label)).status).toBe("edited");
    });

    test("with a right checksum, a damaged heading, dataset or exported line is still EDITED", async () => {
        const { verifyEvidence } = await load("evidence.js");
        const seal = (lines) => {
            const signed = lines.join("\n") + "\n";
            return `${signed}sha256: ${crypto.createHash("sha256").update(signed).digest("hex")}\n`;
        };
        const lines = sample().split("\n").slice(0, -2); // through the student line
        const variants = {
            "no dataset line": [lines[0], "data: northlight", ...lines.slice(2)],
            "empty dataset": [lines[0], "dataset: ", ...lines.slice(2)],
            "no exported line": [...lines.slice(0, 2), "when: 2026-11-09T14:32:08Z", ...lines.slice(3)],
            "exported without Z": [...lines.slice(0, 2), "exported: 2026-11-09T14:32:08", ...lines.slice(3)],
            "exported not a date": [...lines.slice(0, 2), "exported: 2026-13-45T99:99:99Z", ...lines.slice(3)],
            "exported 30 February": [...lines.slice(0, 2), "exported: 2026-02-30T10:00:00Z", ...lines.slice(3)],
            "no blank line after exported": [...lines.slice(0, 3), ...lines.slice(4)],
            "no entries": [...lines.slice(0, 4), lines[lines.length - 1]],
            "entries not numbered from 1": lines.map((l) => l.replace(/^\[1\]/, "[2]")),
            "student line missing": lines.slice(0, -1),
        };
        for (const [name, changed] of Object.entries(variants)) {
            expect((await verifyEvidence(seal(changed))).status, name).toBe("edited");
        }
        // the unchanged lines seal to a VALID file, so the variants above fail for their own reason
        expect((await verifyEvidence(seal(lines))).status).toBe("valid");
    });

    test("without crypto.subtle the answer is 'unavailable', neither VALID nor EDITED", async () => {
        const { verifyEvidence, hasCrypto, sha256Hex } = await load("evidence.js");
        const descriptor = Object.getOwnPropertyDescriptor(globalThis, "crypto");
        Object.defineProperty(globalThis, "crypto", { value: undefined, configurable: true, writable: true });
        try {
            expect(hasCrypto()).toBe(false);
            for (const input of [sample(), "garbage", "", null]) {
                const result = await verifyEvidence(input);
                expect(result.status).toBe("unavailable");
                expect(result.reason).not.toMatch(/valid|edited/i);
            }
            await expect(sha256Hex("x")).rejects.toThrow();
        } finally {
            Object.defineProperty(globalThis, "crypto", descriptor);
        }
        expect(hasCrypto()).toBe(true);
    });

    test("a text over 20 MB is EDITED, too large", async () => {
        const { verifyEvidence } = await load("evidence.js");
        const result = await verifyEvidence("a".repeat(20 * 1024 * 1024 + 1));
        expect(result.status).toBe("edited");
        expect(result.reason).toMatch(/too large/i);
    });
});

test.describe("student number pattern", () => {
    test("rejects too short, too long, punctuation and spaces; accepts 6 to 12 letters and digits", async () => {
        const { STUDENT_ID_PATTERN } = await load("config.js");
        const bad = [
            "", "a", "abcde", "12345", "abcdefghijklm", "1234567890123", "U20345-67", "U2034567!", "U 2034567",
            " U2034567", "U2034567 ", "\tU2034567", "U2034567\n", "U2034\n567", "U2034567\n", "ü2034567", "１２３４５６",
            "U2034567;", "'U2034567'", "U2034567<", "a_b_c_d_e", "a.b.c.d.e",
        ];
        for (const value of bad) {
            expect(STUDENT_ID_PATTERN.test(value), JSON.stringify(value)).toBe(false);
        }
        const good = ["abcdef", "ABCDEF", "123456", "U2034567", "a1B2c3D4e5F6", "ab1234567890".slice(0, 12), "000000"];
        for (const value of good) {
            expect(STUDENT_ID_PATTERN.test(value), value).toBe(true);
        }
        // not global or sticky: the same regexp object can be reused
        expect(STUDENT_ID_PATTERN.global || STUDENT_ID_PATTERN.sticky).toBe(false);
    });
});
