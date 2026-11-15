const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const { pathToFileURL } = require("node:url");
const { test, expect, evidenceFile, NORTHLIGHT_URL } = require("./helpers");

// Assessment plan, Phase 0 (groundwork): the version 2 evidence file, the version 1 files saved before
// it, the Export evidence dialog with events in the log and the verify page.
//   - tests/fixtures/evidence/: three version 1 files written by the build before this change; the
//     new code must still build them byte for byte and say what it said then (plan section 2, 6)
//   - version 2 as written (formatEvidence, buildEvidence) and as checked (verifyEvidence), in Node,
//     against evidenceFileV2 below: a second implementation of the layout, written from the plan's
//     description of the format (section 6, "The version 2 file") and not from js/lab/evidence.js
//   - the dialog and verify.html in the page, with events recorded through bundle/app.js
// The runtime of events (storage, order, limits) is tests/aw0-events.spec.js; the format of version 1
// is tests/m5-evidence-format.spec.js.

const load = (file) => import(pathToFileURL(path.join(__dirname, "..", "js", "lab", file)).href);

const FIXTURES = path.join(__dirname, "fixtures", "evidence");
const SAVED = ["v1-dataset", "v1-file", "v1-awkward"];
const saved = (name) => {
    const buffer = fs.readFileSync(path.join(FIXTURES, `${name}.txt`));
    const meta = JSON.parse(fs.readFileSync(path.join(FIXTURES, `${name}.json`), "utf8"));
    return { buffer, text: buffer.toString("utf8"), input: meta.input, verdict: meta.verdict };
};

const STUDENT = "U2034567";
const EXPORTED = "2026-11-15T10:20:00Z";

// ---- a second implementation of the version 2 layout -----------------------------------------
//
// From the plan: the first line ends in "evidence export v2". An event is an entry numbered in the
// same sequence as the queries: "[n] <time> · event: <kind>", its detail lines, a blank line. In a
// version 2 file a line of SQL or of detail shaped like a query header or like an event header
// (whatever kind it names) gets a backslash. Entries: {t, outcome, sql, link?} for a query (sql as typed, escaped here), or
// {t, event: kind, lines} for an event (lines as the file holds them, escaped here). `n` overrides
// the number, to make a file whose headers are out of sequence. `hex` overrides the checksum.

const TIME = "\\d{4}-\\d{2}-\\d{2}T\\d{2}:\\d{2}:\\d{2}Z";
const QUERY_HEADER = new RegExp(`^\\[\\d+\\] ${TIME} · (?:\\d+ rows?|error: .*)$`);
const EVENT_HEADER = new RegExp(`^\\[\\d+\\] ${TIME} · event: (?:import|export|reset|reopen)$`);
// the shape of an event header, whatever follows "event: " to the end of the line (a line
// separator too): this is what gets the backslash
const EVENT_SHAPE = new RegExp(`^\\[\\d+\\] ${TIME} · event: [\\s\\S]*$`);
const lfOnly = (text) => text.replace(/\r\n?/g, "\n");
const marked = (text, { events }) =>
    lfOnly(text)
        .split("\n")
        .map((line) => (QUERY_HEADER.test(line) || (events && EVENT_SHAPE.test(line)) ? `\\${line}` : line))
        .join("\n");

function evidenceFileV2({ appName = "SQL Lab", dataset = "northlight", exported = EXPORTED, student = STUDENT, entries, hex = null }) {
    let body = `${appName} evidence export v2\ndataset: ${dataset}\nexported: ${exported}\n\n`;
    entries.forEach((entry, index) => {
        const n = entry.n ?? index + 1;
        if (entry.event) {
            body += `[${n}] ${entry.t} · event: ${entry.event}\n${entry.lines.map((line) => marked(line, { events: true })).join("\n")}\n\n`;
        } else {
            const link = entry.link ? `link: ${entry.link}\n` : "";
            body += `[${n}] ${entry.t} · ${entry.outcome}\n${marked(entry.sql, { events: true })}\n${link}\n`;
        }
    });
    body += `student: ${student}\n`;
    const digest = hex ?? crypto.createHash("sha256").update(Buffer.from(body, "utf8")).digest("hex");
    return `${body}sha256: ${digest}\n`;
}

// a version 1 file for SQL that the version 1 rule would escape: only the query-header shape
const v1File = (entries, over = {}) =>
    evidenceFile({ exported: EXPORTED, ...over, entries: entries.map((e) => ({ ...e, sql: marked(e.sql, { events: false }) })) });

// seal(lines): a file from the lines of everything up to and including the student line
const seal = (lines) => {
    const signed = `${lines.join("\n")}\n`;
    return `${signed}sha256: ${crypto.createHash("sha256").update(signed).digest("hex")}\n`;
};
const throughStudent = (text) => text.split("\n").slice(0, -2);

// what the app takes: {t, sql, rows | error, link?} for a query, {t, kind, lines} for an event
function toInput(entry) {
    if (entry.event) {
        return { t: entry.t, kind: entry.event, lines: entry.lines };
    }
    const query = { t: entry.t, sql: entry.sql };
    const error = /^error: (.*)$/.exec(entry.outcome);
    if (error) {
        query.error = error[1];
    } else {
        query.rows = Number(/^(\d+) rows?$/.exec(entry.outcome)[1]);
    }
    return entry.link ? { ...query, link: entry.link } : query;
}
const inputOf = (entries, over = {}) => ({ entries: entries.map(toInput), dataset: "northlight", exported: EXPORTED, student: STUDENT, ...over });

const ONCE = "checks files, not the page: once is enough";
const inNodeOnce = (testInfo) => test.skip(testInfo.project.name !== "chromium-root", ONCE);

const IMPORT = { t: "2026-11-15T10:02:11Z", event: "import", lines: ["file: messy_sales.csv, 2128 bytes", "table: messy_sales, 22 rows, 13 columns"] };
const QUERY = { t: "2026-11-15T10:03:40Z", outcome: "22 rows", sql: "SELECT * FROM messy_sales;" };
const QUERIES = [
    { t: "2026-11-15T10:03:40Z", outcome: "22 rows", sql: "SELECT * FROM messy_sales;" },
    { t: "2026-11-15T10:04:00Z", outcome: "error: no such column: pric", sql: "SELECT pric FROM messy_sales;" },
    { t: "2026-11-15T10:04:30Z", outcome: "1 row", sql: "SELECT 1\n\nUNION ALL\n  SELECT 2 LIMIT 1;", link: "http://127.0.0.1/#s=abc" },
    { t: "2026-11-15T10:05:00Z", outcome: "0 rows", sql: "SELECT 1 WHERE 0;" },
];
// every outcome of a query, all four kinds of event, an event first and one last, a query with a link,
// two events in a row
const TIMELINE = [
    { t: "2026-11-15T10:02:11Z", event: "import", lines: ["file: messy_sales.csv, 2128 bytes", "table: messy_sales, 22 rows, 13 columns"] },
    QUERIES[0],
    QUERIES[1],
    QUERIES[2],
    { t: "2026-11-15T10:05:30Z", event: "export", lines: ["file: messy_sales.csv, 22 rows", "table: messy_sales, 22 rows"] },
    { t: "2026-11-15T10:05:30Z", event: "reset", lines: ["database reset"] },
    QUERIES[3],
    { t: "2026-11-15T10:06:00Z", event: "reopen", lines: ["database: messy_sales.db"] },
];

// replace the character at `i` (UTF-16 index) with `c`
const swap = (text, i, c) => text.slice(0, i) + c + text.slice(i + 1);
const other = (ch, wanted) => (ch === wanted ? "~" : wanted);

// ---- the version 1 files saved before the change ------------------------------------------------

test.describe("version 1 files saved before the change (in Node)", () => {
    for (const name of SAVED) {
        test(`${name}: buildEvidence gives the saved file byte for byte`, async ({}, testInfo) => {
            inNodeOnce(testInfo);
            const { buildEvidence } = await load("evidence.js");
            const file = saved(name);
            const built = await buildEvidence(file.input);
            expect(built).toBe(file.text);
            expect(Buffer.from(built, "utf8").equals(file.buffer)).toBe(true);
            expect(built.split("\n")[0]).toMatch(/ evidence export v1$/);
        });

        test(`${name}: verifyEvidence says exactly what it said when the file was saved`, async ({}, testInfo) => {
            inNodeOnce(testInfo);
            const { verifyEvidence } = await load("evidence.js");
            const file = saved(name);
            const result = await verifyEvidence(file.text);
            expect(result).toEqual(file.verdict);
            expect(Object.keys(result).sort()).toEqual(["dataset", "exported", "queries", "status", "student"]);
            // the bytes as a person's disk gives them back, and a CRLF copy, say the same
            expect(await verifyEvidence(file.buffer.toString("utf8"))).toEqual(file.verdict);
            expect(await verifyEvidence(file.text.replaceAll("\n", "\r\n"))).toEqual(file.verdict);
        });
    }

    test("SQL shaped like an event header stays in a saved version 1 file without a backslash and is not counted", async ({}, testInfo) => {
        inNodeOnce(testInfo);
        const { verifyEvidence } = await load("evidence.js");
        const eventShaped = new RegExp(`^\\[\\d+\\] ${TIME} · event: (?:import|export|reset|reopen)$`, "m");
        for (const name of ["v1-awkward", "v1-dataset"]) {
            const file = saved(name);
            expect(file.text, name).toMatch(eventShaped);
            expect(file.text, name).not.toMatch(/^\\\[\d+\] \S+ · event: /m);
            expect(await verifyEvidence(file.text), name).toEqual(file.verdict);
        }
        // and in the same file the query-header shape does have its backslash
        expect(saved("v1-awkward").text).toContain("\n\\[1] 2026-11-15T09:00:00Z · 1 row\n");
        expect(saved("v1-awkward").text).toContain("\n[10] 2026-11-15T09:00:08Z · event: import\n");
    });
});

// ---- version 2, written ---------------------------------------------------------------------------

test.describe("version 2, written (in Node)", () => {
    test("with no event the file is version 1, exactly what the version 1 writer gives", async ({}, testInfo) => {
        inNodeOnce(testInfo);
        const { buildEvidence, formatEvidence } = await load("evidence.js");
        const input = inputOf(QUERIES);
        const text = await buildEvidence(input);
        expect(text).toBe(v1File(QUERIES));
        expect(text.split("\n")[0]).toBe("SQL Lab evidence export v1");
        expect(formatEvidence(input)).not.toMatch(/event:/);
    });

    test("with one event the first line ends in 'evidence export v2'", async ({}, testInfo) => {
        inNodeOnce(testInfo);
        const { buildEvidence } = await load("evidence.js");
        for (const entries of [[IMPORT], [IMPORT, QUERY], [QUERY, IMPORT]]) {
            const text = await buildEvidence(inputOf(entries));
            expect(text.split("\n")[0]).toBe("SQL Lab evidence export v2");
            expect(text).toBe(evidenceFileV2({ entries }));
        }
    });

    test("the layout is byte for byte what a second implementation writes, queries and events numbered in one sequence", async ({}, testInfo) => {
        inNodeOnce(testInfo);
        const { buildEvidence, formatEvidence, sha256Hex } = await load("evidence.js");
        const input = inputOf(TIMELINE);
        const text = await buildEvidence(input);
        expect(text).toBe(evidenceFileV2({ entries: TIMELINE }));
        expect(Buffer.from(text, "utf8").equals(Buffer.from(evidenceFileV2({ entries: TIMELINE }), "utf8"))).toBe(true);
        // the checksum rule is the one of version 1: the first line through the LF of the student line
        const body = formatEvidence(input);
        expect(text).toBe(`${body}sha256: ${crypto.createHash("sha256").update(body).digest("hex")}\n`);
        expect(await sha256Hex(body)).toBe(crypto.createHash("sha256").update(body).digest("hex"));
        // one sequence: the headers are 1 to 8 whatever their kind
        const headers = text.split("\n").filter((line) => QUERY_HEADER.test(line) || EVENT_HEADER.test(line));
        expect(headers.map((line) => Number(/^\[(\d+)\]/.exec(line)[1]))).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
        expect(headers.map((line) => line.replace(/^\[\d+\] \S+ · /, ""))).toEqual([
            "event: import",
            "22 rows",
            "error: no such column: pric",
            "1 row",
            "event: export",
            "event: reset",
            "0 rows",
            "event: reopen",
        ]);
        // an event is its header, its lines and a blank line; it never has a link
        expect(text).toContain(
            "\n[1] 2026-11-15T10:02:11Z · event: import\nfile: messy_sales.csv, 2128 bytes\ntable: messy_sales, 22 rows, 13 columns\n\n[2] "
        );
        expect(text).toContain("\n[5] 2026-11-15T10:05:30Z · event: export\nfile: messy_sales.csv, 22 rows\ntable: messy_sales, 22 rows\n\n[6] ");
        expect(text).toContain("\n[8] 2026-11-15T10:06:00Z · event: reopen\ndatabase: messy_sales.db\n\nstudent: U2034567\nsha256: ");
        expect(text.match(/^link: /gm)).toHaveLength(1);
        expect(text.split("\n")[3]).toBe("");
        expect(text).not.toContain("\r");
    });

    test("in a version 2 file a line of SQL shaped like a query header and one shaped like an event header both get a backslash", async ({}, testInfo) => {
        inNodeOnce(testInfo);
        const { buildEvidence, verifyEvidence } = await load("evidence.js");
        const sql = [
            "SELECT 1 AS a,",
            "[2] 2026-11-15T10:03:40Z · 1 row",
            "",
            "[3] 2026-11-15T10:03:40Z · event: import",
            "[4] 2026-11-15T10:03:40Z · error: no such table: t",
            "[5] 2026-11-15T10:03:40Z · event: reopen",
            "student: someone else",
            "'",
        ].join("\n");
        const entries = [IMPORT, { t: "2026-11-15T10:03:40Z", outcome: "1 row", sql }];
        const text = await buildEvidence(inputOf(entries));
        expect(text).toBe(evidenceFileV2({ entries }));
        expect(text).toContain("\n\\[2] 2026-11-15T10:03:40Z · 1 row\n\n\\[3] 2026-11-15T10:03:40Z · event: import\n\\[4] ");
        expect(text).toContain("\n\\[5] 2026-11-15T10:03:40Z · event: reopen\nstudent: someone else\n'\n");
        // the only lines shaped like headers are the real ones
        const headers = text.split("\n").filter((line) => QUERY_HEADER.test(line) || EVENT_HEADER.test(line));
        expect(headers).toEqual(["[1] 2026-11-15T10:02:11Z · event: import", "[2] 2026-11-15T10:03:40Z · 1 row"]);
        expect(await verifyEvidence(text)).toEqual({ status: "valid", student: STUDENT, queries: 1, events: 1, exported: EXPORTED, dataset: "northlight" });
    });

    test("in a version 1 file only the query-header shape gets the backslash", async ({}, testInfo) => {
        inNodeOnce(testInfo);
        const { buildEvidence, verifyEvidence } = await load("evidence.js");
        const sql = [
            "SELECT 1 AS a,",
            "[2] 2026-11-15T10:03:40Z · 1 row",
            "",
            "[3] 2026-11-15T10:03:40Z · event: import",
            "'",
        ].join("\n");
        const entries = [{ t: "2026-11-15T10:03:40Z", outcome: "1 row", sql }];
        const text = await buildEvidence(inputOf(entries));
        expect(text).toBe(v1File(entries));
        expect(text).toContain("\n\\[2] 2026-11-15T10:03:40Z · 1 row\n\n[3] 2026-11-15T10:03:40Z · event: import\n'\n");
        expect(await verifyEvidence(text)).toEqual({ status: "valid", student: STUDENT, queries: 1, exported: EXPORTED, dataset: "northlight" });
    });

    test("a line of an event's detail shaped like a header gets the backslash, and cannot make a header of its own", async ({}, testInfo) => {
        inNodeOnce(testInfo);
        const { buildEvidence, verifyEvidence } = await load("evidence.js");
        const lines = ["file: a.csv, 10 bytes", "[2] 2026-11-15T10:03:40Z · 1 row", "[3] 2026-11-15T10:03:40Z · event: export"];
        const text = await buildEvidence(inputOf([{ t: IMPORT.t, event: "import", lines }, QUERY]));
        expect(text).toBe(
            evidenceFileV2({ entries: [{ t: IMPORT.t, event: "import", lines }, QUERY] })
        );
        expect(text).toContain(
            "\n[1] 2026-11-15T10:02:11Z · event: import\nfile: a.csv, 10 bytes\n\\[2] 2026-11-15T10:03:40Z · 1 row\n\\[3] 2026-11-15T10:03:40Z · event: export\n\n[2] "
        );
        expect(await verifyEvidence(text)).toMatchObject({ status: "valid", queries: 1, events: 1 });
    });

    test("an event's lines of detail: a line break inside one cannot split it, an empty line is dropped", async ({}, testInfo) => {
        inNodeOnce(testInfo);
        const { buildEvidence, verifyEvidence } = await load("evidence.js");
        const raw = [
            "file: a\nb.csv, 10 bytes",
            "",
            "   ",
            "table: t\r\nu, 1 row\rx, 2 columns",
            "",
            " \u00a0 ",
            "note: tab\there and   and \u0085 and \u0000",
        ];
        const text = await buildEvidence(inputOf([{ t: IMPORT.t, event: "import", lines: raw }, QUERY]));
        const kept = ["file: a_b.csv, 10 bytes", "table: t__u, 1 row_x, 2 columns", "note: tab_here and _ and _ and _"];
        expect(text).toBe(evidenceFileV2({ entries: [{ t: IMPORT.t, event: "import", lines: kept }, QUERY] }));
        expect(text).toContain(
            "\n[1] 2026-11-15T10:02:11Z · event: import\nfile: a_b.csv, 10 bytes\ntable: t__u, 1 row_x, 2 columns\nnote: tab_here and _ and _ and _\n\n[2] "
        );
        expect(text).not.toContain("\r");
        expect(await verifyEvidence(text)).toMatchObject({ status: "valid", queries: 1, events: 1 });
    });

    test("formatEvidence throws RangeError for no entries, an event of an unknown kind and an event with no line of detail", async ({}, testInfo) => {
        inNodeOnce(testInfo);
        const { formatEvidence } = await load("evidence.js");
        const base = { dataset: "northlight", exported: EXPORTED, student: STUDENT };
        const query = toInput(QUERY);
        expect(() => formatEvidence({ ...base, entries: [] })).toThrow(RangeError);
        for (const kind of ["delete", "Import", "", "event", "imports"]) {
            const event = { t: IMPORT.t, kind, lines: ["file: a.csv, 1 bytes"] };
            expect(() => formatEvidence({ ...base, entries: [event] }), `kind ${JSON.stringify(kind)}`).toThrow(RangeError);
            expect(() => formatEvidence({ ...base, entries: [query, event] }), `after a query, kind ${JSON.stringify(kind)}`).toThrow(RangeError);
        }
        for (const lines of [[], [""], ["", ""], undefined]) {
            const event = { t: IMPORT.t, kind: "import", lines };
            expect(() => formatEvidence({ ...base, entries: [event] }), `lines ${JSON.stringify(lines)}`).toThrow(RangeError);
            expect(() => formatEvidence({ ...base, entries: [query, event, query] }), `among queries, lines ${JSON.stringify(lines)}`).toThrow(RangeError);
        }
        // the same event with a line of detail is fine
        expect(() => formatEvidence({ ...base, entries: [query, { t: IMPORT.t, kind: "import", lines: ["x"] }] })).not.toThrow();
    });
});

// ---- version 2, checked ------------------------------------------------------------------------

test.describe("found in review: what the writer takes for an event (in Node)", () => {
    test.beforeEach(({}, testInfo) => {
        test.skip(testInfo.project.name !== "chromium-root", "checks files, not the page: once is enough");
    });

    const base = { dataset: "northlight", exported: "2026-11-15T10:20:00Z", student: "U2034567" };

    test("an event's time goes into its header, so anything but a UTC second is refused", async () => {
        const { formatEvidence } = await load("evidence.js");
        const lines = ["file: a.csv, 1 bytes"];
        for (const t of [
            "2026-11-15T10:00:00Z \u00b7 event: import\nx\n\n[2] 2026-11-15T10:00:00Z",
            "2026-11-15T10:00:00Z\n",
            "2026-11-15 10:00:00",
            "2026-11-15T10:00:00.000Z",
            "",
            undefined,
            null,
            20261115,
        ]) {
            expect(() => formatEvidence({ ...base, entries: [{ t, kind: "import", lines }] }), JSON.stringify(t)).toThrow(RangeError);
        }
        expect(() => formatEvidence({ ...base, entries: [{ t: "2026-11-15T10:00:00Z", kind: "import", lines }] })).not.toThrow();
    });

    test("an entry with SQL is a query whatever else it carries: a kind beside it does not make it an event", async () => {
        const { buildEvidence } = await load("evidence.js");
        const plain = { t: "2026-11-15T10:00:00Z", sql: "SELECT 1;", rows: 1 };
        const text = await buildEvidence({ ...base, entries: [{ ...plain, kind: "import", lines: ["not an event"] }] });
        expect(text).toBe(await buildEvidence({ ...base, entries: [plain] }));
        expect(text.split("\n")[0]).toBe("SQL Lab evidence export v1");
    });

    test("an entry with no SQL that has a kind or lines is an event, and one that is not a whole event is refused: it is never written as a query", async () => {
        const { formatEvidence } = await load("evidence.js");
        const t = "2026-11-15T10:00:00Z";
        const query = { t, sql: "SELECT 1;", rows: 1 };
        const broken = [
            { t, kind: 5, lines: ["x"] },
            { t, kind: null, lines: ["x"] },
            { t, kind: ["import"], lines: ["x"] },
            { t, kind: { toString: () => "import" }, lines: ["x"] },
            { t, kind: true, lines: ["x"] },
            { t, lines: ["x"] },
            { t, lines: [] },
            { t, kind: "import" },
            { t, kind: "import", lines: "x" },
            { t, kind: "import", lines: { 0: "x", length: 1 } },
        ];
        for (const [index, entry] of broken.entries()) {
            expect(() => formatEvidence({ ...base, entries: [entry] }), `entry ${index}`).toThrow(RangeError);
            expect(() => formatEvidence({ ...base, entries: [query, entry, query] }), `entry ${index} among queries`).toThrow(RangeError);
        }
        // nothing but a kind or lines makes an entry an event: this one is written as it always was
        expect(() => formatEvidence({ ...base, entries: [query] })).not.toThrow();
    });

    test("in a version 2 file the event-header shape gets the backslash whatever kind it names, so a file this app wrote never lists a kind the checker does not know", async () => {
        const { buildEvidence, verifyEvidence } = await load("evidence.js");
        const shaped = [
            "[2] 2026-11-15T10:03:40Z \u00b7 event: archive",
            "[2] 2026-11-15T10:03:40Z \u00b7 event: ",
            "[2] 2026-11-15T10:03:40Z \u00b7 event: import export",
            "[2] 2026-11-15T10:03:40Z \u00b7 event: Import",
            "[77] 2026-11-15T10:03:40Z \u00b7 event: event: reset",
        ];
        // each of them after a blank line, where a header is looked for
        const sql = ["SELECT 1;", ...shaped.flatMap((line) => ["", line])].join("\n");
        const event = { t: "2026-11-15T10:02:11Z", kind: "import", lines: ["file: a.csv, 1 bytes", ...shaped] };
        const query = { t: "2026-11-15T10:03:40Z", sql, rows: 1 };
        const text = await buildEvidence({ ...base, entries: [event, query] });
        const lines = text.split("\n");
        for (const line of shaped) {
            expect(lines.filter((l) => l === line), line).toEqual([]);
            // once in the event's detail, once in the SQL
            expect(lines.filter((l) => l === `\\${line}`), line).toHaveLength(2);
        }
        expect(await verifyEvidence(text)).toEqual({
            status: "valid",
            student: base.student,
            queries: 1,
            events: 1,
            exported: base.exported,
            dataset: base.dataset,
        });
        // the same SQL in a version 1 file is left as it is, as it always was
        const v1 = await buildEvidence({ ...base, entries: [query] });
        for (const line of shaped) {
            expect(v1.split("\n").filter((l) => l === line), line).toHaveLength(1);
        }
        expect(await verifyEvidence(v1)).toEqual({ status: "valid", student: base.student, queries: 1, exported: base.exported, dataset: base.dataset });
        // a character that ends a line for some readers, inside the shape, does not hide it (SQL
        // keeps such characters; an event's lines of detail have them replaced)
        for (const inside of ["\u2028", "\u2029", "x\u2028y", "\u2029\u2028 event: import"]) {
            const line = `[2] 2026-11-15T10:03:40Z \u00b7 event: arch${inside}ive`;
            const file = await buildEvidence({ ...base, entries: [event, { t: query.t, sql: `SELECT 1;\n\n${line}`, rows: 1 }] });
            expect(file.split("\n").filter((l) => l === `\\${line}`), JSON.stringify(inside)).toHaveLength(1);
            expect(file.split("\n").filter((l) => l === line), JSON.stringify(inside)).toEqual([]);
            expect(await verifyEvidence(file), JSON.stringify(inside)).toMatchObject({ status: "valid", queries: 1, events: 1 });
        }
    });
});

test.describe("version 2, checked (in Node)", () => {
    test("a file with queries and events is VALID and the result is exactly status, student, queries, events, exported, dataset", async ({}, testInfo) => {
        inNodeOnce(testInfo);
        const { verifyEvidence } = await load("evidence.js");
        const result = await verifyEvidence(evidenceFileV2({ entries: TIMELINE }));
        expect(result).toEqual({ status: "valid", student: STUDENT, queries: 4, events: 4, exported: EXPORTED, dataset: "northlight" });
        expect(Object.keys(result).sort()).toEqual(["dataset", "events", "exported", "queries", "status", "student"]);
        const single = await verifyEvidence(evidenceFileV2({ entries: [QUERY, IMPORT].map((e, i) => ({ ...e, n: i + 1 })), dataset: "file:mine.db", student: "ab12cd" }));
        expect(single).toEqual({ status: "valid", student: "ab12cd", queries: 1, events: 1, exported: EXPORTED, dataset: "file:mine.db" });
    });

    test("a file with events and no queries is VALID with queries 0", async ({}, testInfo) => {
        inNodeOnce(testInfo);
        const { verifyEvidence } = await load("evidence.js");
        const reset = { t: "2026-11-15T10:03:00Z", event: "reset", lines: ["database reset"] };
        expect(await verifyEvidence(evidenceFileV2({ entries: [IMPORT] }))).toEqual({
            status: "valid",
            student: STUDENT,
            queries: 0,
            events: 1,
            exported: EXPORTED,
            dataset: "northlight",
        });
        expect(await verifyEvidence(evidenceFileV2({ entries: [IMPORT, reset] }))).toMatchObject({ status: "valid", queries: 0, events: 2 });
    });

    test("a first line ending in v2 over a body with no event is EDITED", async ({}, testInfo) => {
        inNodeOnce(testInfo);
        const { verifyEvidence } = await load("evidence.js");
        const v1 = v1File(QUERIES);
        expect((await verifyEvidence(v1)).status).toBe("valid");
        // change only the first line, and recompute the checksum
        const lines = throughStudent(v1);
        expect(lines[0]).toBe("SQL Lab evidence export v1");
        const result = await verifyEvidence(seal([lines[0].replace(/v1$/, "v2"), ...lines.slice(1)]));
        expect(result.status).toBe("edited");
        expect(typeof result.reason).toBe("string");
        expect(result.reason.length).toBeGreaterThan(5);
        expect(result).not.toHaveProperty("queries");
        // and the same line over a file that lists one query and nothing else
        expect((await verifyEvidence(evidenceFileV2({ entries: QUERIES.slice(0, 1) }))).status).toBe("edited");
    });

    test("the first line of a version 2 file is any app name, a space and the version 2 words, as version 1's is: without the space it is EDITED", async ({}, testInfo) => {
        inNodeOnce(testInfo);
        const { verifyEvidence } = await load("evidence.js");
        const lines = throughStudent(evidenceFileV2({ entries: [IMPORT, QUERY] }));
        const withFirst = (first) => verifyEvidence(seal([first, ...lines.slice(1)]));
        for (const first of ["SQL Lab evidence export v2", "Another name evidence export v2", " evidence export v2", "v1 evidence export v1 evidence export v2"]) {
            expect(await withFirst(first), JSON.stringify(first)).toMatchObject({ status: "valid", queries: 1, events: 1 });
        }
        for (const first of ["evidence export v2", "SQL Labevidence export v2", "SQL Lab evidence export v2 ", "SQL Lab evidence export V2", "SQL Lab evidence export v22", "SQL Lab evidence export v2\t", "SQL Lab evidence  export v2"]) {
            const result = await withFirst(first);
            expect(result.status, JSON.stringify(first)).toBe("edited");
            expect(result.reason, JSON.stringify(first)).toContain("first line");
        }
        // the same two shapes as a version 1 file takes and refuses
        const v1 = throughStudent(v1File(QUERIES));
        expect((await verifyEvidence(seal([" evidence export v1", ...v1.slice(1)]))).status).toBe("valid");
        expect((await verifyEvidence(seal(["evidence export v1", ...v1.slice(1)]))).status).toBe("edited");
    });

    test("a version 2 first line over an event header of an unknown kind only is EDITED", async ({}, testInfo) => {
        inNodeOnce(testInfo);
        const { verifyEvidence } = await load("evidence.js");
        const head = ["SQL Lab evidence export v2", "dataset: northlight", `exported: ${EXPORTED}`, ""];
        for (const kind of ["delete", "Import", "imports", "", "import export"]) {
            const body = [`[1] 2026-11-15T10:02:11Z · event: ${kind}`, "file: a.csv, 10 bytes", "", `student: ${STUDENT}`];
            const result = await verifyEvidence(seal([...head, ...body]));
            expect(result.status, `kind ${JSON.stringify(kind)}`).toBe("edited");
        }
        // the sealed lines are fine with a known kind, so the rest of the file is not what fails
        const fine = [...head, "[1] 2026-11-15T10:02:11Z · event: import", "file: a.csv, 10 bytes", "", `student: ${STUDENT}`];
        expect(await verifyEvidence(seal(fine))).toMatchObject({ status: "valid", queries: 0, events: 1 });
    });

    test("a version 2 file that lists an event of an unknown kind among known ones is EDITED and says so: it is not VALID with a short count", async ({}, testInfo) => {
        inNodeOnce(testInfo);
        const { verifyEvidence } = await load("evidence.js");
        const reset = { t: "2026-11-15T10:05:30Z", event: "reset", lines: ["database reset"] };
        const good = throughStudent(evidenceFileV2({ entries: [IMPORT, QUERY, reset, QUERIES[3]] }));
        expect(await verifyEvidence(seal(good))).toMatchObject({ status: "valid", queries: 2, events: 2 });
        const at = good.indexOf("[3] 2026-11-15T10:05:30Z · event: reset");
        expect(at).toBeGreaterThan(4);
        expect(good[at - 1]).toBe("");
        const withLine = (line) => seal([...good.slice(0, at), line, ...good.slice(at + 1)]);
        const reason =
            "The file lists an event of a kind this page does not know, so its entries cannot be counted. A newer copy of this page may know it: reload the page and check the file again.";
        // (a lone CR or a line separator in the kind does not hide the header from the check)
        for (const kind of ["archive", "Reset", "resets", "", "reset now", "event: reset", "arch\u2028ive", "archive\u2028", "\u2029", "x\ry", "reset\rreset", "reset\u2028"]) {
            const result = await verifyEvidence(withLine(`[3] 2026-11-15T10:05:30Z · event: ${kind}`));
            expect(result, `kind ${JSON.stringify(kind)}`).toEqual({ status: "edited", reason });
        }
        // whatever number it carries: a header that cannot be read is not a line to skip
        for (const n of [1, 4, 9, 0]) {
            expect((await verifyEvidence(withLine(`[${n}] 2026-11-15T10:05:30Z · event: archive`))).status, `numbered ${n}`).toBe("edited");
        }
        // with the backslash it is a line of the entry before it, as the writer leaves it: the
        // entries after it are then out of sequence and not counted, and the file is what it says
        expect(await verifyEvidence(withLine("\\[3] 2026-11-15T10:05:30Z · event: archive"))).toMatchObject({ status: "valid", queries: 1, events: 1 });
        // and where no header is looked for (not after a blank line) it is a line like any other
        const inside = [...good.slice(0, 5), "[2] 2026-11-15T10:02:11Z · event: archive", ...good.slice(5)];
        expect(good[4]).toBe("[1] 2026-11-15T10:02:11Z · event: import");
        expect(await verifyEvidence(seal(inside))).toMatchObject({ status: "valid", queries: 2, events: 2 });
    });

    test("a version 1 file whose SQL holds a line shaped like an event header stays VALID with the same query count", async ({}, testInfo) => {
        inNodeOnce(testInfo);
        const { verifyEvidence } = await load("evidence.js");
        // not escaped, as a version 1 writer leaves it: after a blank line and with the next number, so a
        // reader of version 2 would count it
        const sql = "SELECT 1\n\n[2] 2026-11-15T10:03:40Z · event: import\nfile: x\n\n[3] 2026-11-15T10:03:40Z · event: reset\nSELECT 2;";
        const entries = [{ t: QUERY.t, outcome: "1 row", sql }];
        const text = evidenceFile({ entries });
        expect(text).toContain("\n\n[2] 2026-11-15T10:03:40Z · event: import\n");
        expect(await verifyEvidence(text)).toEqual({ status: "valid", student: STUDENT, queries: 1, exported: "2026-11-09T14:32:08Z", dataset: "northlight" });
        // a kind that no release knows is no more looked at in a version 1 file than a known one
        const odd = evidenceFile({ entries: [{ t: QUERY.t, outcome: "1 row", sql: "SELECT 1\n\n[2] 2026-11-15T10:03:40Z · event: archive\nSELECT 2;" }] });
        expect(odd).toContain("\n\n[2] 2026-11-15T10:03:40Z · event: archive\n");
        expect(await verifyEvidence(odd)).toEqual({ status: "valid", student: STUDENT, queries: 1, exported: "2026-11-09T14:32:08Z", dataset: "northlight" });
        for (const name of ["v1-awkward", "v1-dataset"]) {
            const file = saved(name);
            expect((await verifyEvidence(file.text)).queries, name).toBe(file.verdict.queries);
        }
    });

    test("a version 1 first line over a body of events is EDITED: version 1 knows no events", async ({}, testInfo) => {
        inNodeOnce(testInfo);
        const { verifyEvidence } = await load("evidence.js");
        const v2 = evidenceFileV2({ entries: [IMPORT, QUERY] });
        expect((await verifyEvidence(v2)).status).toBe("valid");
        const lines = throughStudent(v2);
        const asV1 = seal([lines[0].replace(/v2$/, "v1"), ...lines.slice(1)]);
        const result = await verifyEvidence(asV1);
        expect(result.status).toBe("edited");
        expect(typeof result.reason).toBe("string");
        // and with events alone
        const alone = throughStudent(evidenceFileV2({ entries: [IMPORT] }));
        expect((await verifyEvidence(seal([alone[0].replace(/v2$/, "v1"), ...alone.slice(1)]))).status).toBe("edited");
    });

    test("headers out of sequence are not counted", async ({}, testInfo) => {
        inNodeOnce(testInfo);
        const { verifyEvidence } = await load("evidence.js");
        const reset = { t: "2026-11-15T10:03:00Z", event: "reset", lines: ["database reset"] };
        const q = (n, sql = "SELECT 1;") => ({ t: QUERY.t, outcome: "1 row", sql, n });
        const e = (n, event = "reset") => ({ t: reset.t, event, lines: reset.lines, n });
        const count = async (entries) => {
            const result = await verifyEvidence(evidenceFileV2({ entries }));
            expect(result.status).toBe("valid");
            return [result.queries, result.events];
        };
        // in sequence: 1 to 5
        expect(await count([e(1), q(2), e(3), q(4), e(5)])).toEqual([2, 3]);
        // an event numbered 4 where 3 is next is not counted; the 3 after it is
        expect(await count([e(1), q(2), e(4), q(3), e(4)])).toEqual([2, 2]);
        // a query numbered out of turn is not counted either, and does not move the count on
        expect(await count([e(1), q(7), q(2), e(3)])).toEqual([1, 2]);
        expect(await count([e(1), q(3)])).toEqual([0, 1]);
        // the first number must be 1
        expect(await count([e(1), e(5), e(2)])).toEqual([0, 2]);
        // a wrong number first leaves nothing to count but the real ones after it
        expect(await count([e(2), e(1), q(2)])).toEqual([1, 1]);
    });

    test("a version 2 file with no counted event is EDITED even when its headers are all out of sequence", async ({}, testInfo) => {
        inNodeOnce(testInfo);
        const { verifyEvidence } = await load("evidence.js");
        const reset = { t: "2026-11-15T10:03:00Z", event: "reset", lines: ["database reset"] };
        for (const entries of [[{ ...reset, n: 2 }, { ...QUERY, n: 1 }], [{ ...reset, n: 5 }]]) {
            expect((await verifyEvidence(evidenceFileV2({ entries }))).status).toBe("edited");
        }
    });

    test("every single-character change to a version 2 file gives EDITED", async ({}, testInfo) => {
        inNodeOnce(testInfo);
        const { verifyEvidence } = await load("evidence.js");
        const text = evidenceFileV2({
            entries: [
                { t: IMPORT.t, event: "import", lines: ["file: a.csv, 10 bytes", "table: a, 2 rows, 1 columns"] },
                { t: QUERY.t, outcome: "1 row", sql: "SELECT 'é日本😀';" },
                { t: "2026-11-15T10:04:00Z", event: "reset", lines: ["database reset"] },
            ],
        });
        expect(text.length).toBeLessThan(600);
        expect(await verifyEvidence(text)).toMatchObject({ status: "valid", queries: 1, events: 2 });
        const failures = [];
        let tried = 0;
        const check = async (changed, what) => {
            tried++;
            const result = await verifyEvidence(changed);
            if (result.status !== "edited") {
                failures.push(`${what}: ${result.status}`);
            }
        };
        for (let i = 0; i < text.length; i++) {
            // the last character is the LF after the checksum: a file without it is still VALID
            if (i < text.length - 1) {
                await check(text.slice(0, i) + text.slice(i + 1), `delete ${i} ${JSON.stringify(text[i])}`);
            }
            await check(`${text.slice(0, i)}x${text.slice(i)}`, `insert x before ${i}`);
            for (const wanted of ["Z", " ", "\r", "\n", "é", "😀"]) {
                const c = other(text[i], wanted);
                await check(swap(text, i, c), `${i} ${JSON.stringify(text[i])} -> ${JSON.stringify(c)}`);
            }
        }
        expect(tried).toBeGreaterThan(text.length * 7);
        expect(failures).toEqual([]);
    });

    test("a CRLF copy of a version 2 file is VALID, and so is one with no final newline", async ({}, testInfo) => {
        inNodeOnce(testInfo);
        const { verifyEvidence } = await load("evidence.js");
        const text = evidenceFileV2({ entries: TIMELINE });
        const expected = { status: "valid", student: STUDENT, queries: 4, events: 4, exported: EXPORTED, dataset: "northlight" };
        expect(await verifyEvidence(text.replaceAll("\n", "\r\n"))).toEqual(expected);
        expect(await verifyEvidence(text.slice(0, -1))).toEqual(expected);
        expect((await verifyEvidence(`${text}\n`)).status).toBe("edited");
    });

    test("no reason for EDITED contains the words valid or edited", async ({}, testInfo) => {
        inNodeOnce(testInfo);
        const { verifyEvidence } = await load("evidence.js");
        const v1 = v1File(QUERIES);
        const v2 = evidenceFileV2({ entries: TIMELINE });
        const lines1 = throughStudent(v1);
        const lines2 = throughStudent(v2);
        const head = ["SQL Lab evidence export v2", "dataset: northlight", `exported: ${EXPORTED}`, ""];
        const inputs = {
            "marked v2, no event": seal([lines1[0].replace(/v1$/, "v2"), ...lines1.slice(1)]),
            "marked v1, events": seal([lines2[0].replace(/v2$/, "v1"), ...lines2.slice(1)]),
            "unknown kind only": seal([...head, "[1] 2026-11-15T10:02:11Z · event: nope", "file: a", "", `student: ${STUDENT}`]),
            "all out of sequence": evidenceFileV2({ entries: [{ ...IMPORT, n: 3 }] }),
            "changed": swap(v2, 40, "Z"),
            "blank lines": `${v2}\n`,
            "no checksum": v2.slice(0, v2.indexOf("sha256")),
            "v3": seal([lines2[0].replace(/v2$/, "v3"), ...lines2.slice(1)]),
        };
        for (const [name, input] of Object.entries(inputs)) {
            const result = await verifyEvidence(input);
            expect(result.status, name).toBe("edited");
            expect(result.reason, name).not.toMatch(/valid|edited/i);
        }
    });
});

// ---- the dialog, in the page -------------------------------------------------------------------

const recordEvent = (page, key, event) =>
    page.evaluate(
        async ([k, e]) => {
            const { events } = await import("./bundle/app.js");
            return events.recordEvent(k, e);
        },
        [key, event]
    );
const linkLines = (text) => text.split("\n").filter((line) => line.startsWith("link: ")).map((line) => line.slice(6));

test.describe("the Export evidence dialog", () => {
    test("a log with queries and no events exports a version 1 file, as before", async ({ page, app }) => {
        await app.recordToasts({ fromStart: true });
        await app.open(NORTHLIGHT_URL);
        await app.query("SELECT 1 AS one;");
        const file = await app.exportEvidence(STUDENT);
        expect(file.name).toBe("evidence-northlight.txt");
        const log = await app.readLog("northlight");
        expect(log).toHaveLength(1);
        const links = linkLines(file.text);
        expect(links).toHaveLength(1);
        const exported = /^exported: (.*)$/m.exec(file.text)[1];
        expect(file.text).toBe(evidenceFile({ exported, student: STUDENT, entries: [{ t: log[0].t, outcome: "1 row", sql: "SELECT 1 AS one;", link: links[0] }] }));
        expect(file.text.split("\n")[0]).toBe("SQL Lab evidence export v1");
        expect(file.text).not.toMatch(/event:/);
        const { verifyEvidence } = await load("evidence.js");
        expect(await verifyEvidence(file.text)).toEqual({ status: "valid", student: STUDENT, queries: 1, exported, dataset: "northlight" });
        await app.expectToasts(["Exported evidence-northlight.txt with 1 query"]);
    });

    test("an event recorded after queries is in its place in time, has no link, and the file verifies", async ({ page, app }) => {
        await app.recordToasts({ fromStart: true });
        await app.open(NORTHLIGHT_URL);
        await app.query("SELECT 1 AS one;");
        const lines = ["file: sales.csv, 2128 bytes", "table: sales, 22 rows, 13 columns"];
        const event = await recordEvent(page, "northlight", { kind: "import", lines });
        expect(event).toMatchObject({ kind: "import", lines });
        await app.query("SELECT 2 AS two;");
        const log = await app.readLog("northlight");
        expect(log.map((entry) => entry.sql)).toEqual(["SELECT 1 AS one;", "SELECT 2 AS two;"]);

        const file = await app.exportEvidence(STUDENT);
        const text = file.text;
        expect(text.split("\n")[0]).toBe("SQL Lab evidence export v2");
        // in its place in time: after the first query, before the second
        const headers = text.split("\n").filter((line) => QUERY_HEADER.test(line) || EVENT_HEADER.test(line));
        expect(headers).toEqual([
            `[1] ${log[0].t} · 1 row`,
            `[2] ${event.t} · event: import`,
            `[3] ${log[1].t} · 1 row`,
        ]);
        // the event has no link; the queries keep theirs
        const links = linkLines(text);
        expect(links).toHaveLength(2);
        const eventBlock = text.slice(text.indexOf(`[2] ${event.t}`), text.indexOf(`[3] ${log[1].t}`));
        expect(eventBlock).toBe(`[2] ${event.t} · event: import\n${lines.join("\n")}\n\n`);
        expect(eventBlock).not.toContain("link:");
        const exported = /^exported: (.*)$/m.exec(text)[1];
        expect(text).toBe(
            evidenceFileV2({
                exported,
                entries: [
                    { t: log[0].t, outcome: "1 row", sql: "SELECT 1 AS one;", link: links[0] },
                    { t: event.t, event: "import", lines },
                    { t: log[1].t, outcome: "1 row", sql: "SELECT 2 AS two;", link: links[1] },
                ],
            })
        );
        const { verifyEvidence } = await load("evidence.js");
        expect(await verifyEvidence(text)).toEqual({ status: "valid", student: STUDENT, queries: 2, events: 1, exported, dataset: "northlight" });
        await app.expectToasts(["Exported evidence-northlight.txt with 2 queries and 1 event"]);
    });

    for (const [queries, events, words] of [
        [1, 1, "1 query and 1 event"],
        [1, 2, "1 query and 2 events"],
        [2, 2, "2 queries and 2 events"],
    ]) {
        test(`the toast says "${words}"`, async ({ page, app }) => {
            await app.recordToasts({ fromStart: true });
            await app.open(NORTHLIGHT_URL);
            for (let i = 1; i <= queries; i++) {
                await app.query(`SELECT ${i};`);
            }
            for (let i = 1; i <= events; i++) {
                expect(await recordEvent(page, "northlight", { kind: "export", lines: [`file: t${i}.csv, ${i} rows`] })).not.toBeNull();
            }
            const file = await app.exportEvidence(STUDENT);
            const { verifyEvidence } = await load("evidence.js");
            expect(await verifyEvidence(file.text)).toMatchObject({ status: "valid", queries, events });
            await app.expectToasts([`Exported evidence-northlight.txt with ${words}`]);
        });
    }

    test("a log with an event and no queries opens the dialog, and its file verifies with queries 0", async ({ page, app }) => {
        await app.recordToasts({ fromStart: true });
        await app.open(NORTHLIGHT_URL);
        expect(await app.readLog("northlight")).toBeNull();
        await recordEvent(page, "northlight", { kind: "reset", lines: ["database reset"] });
        await app.openEvidence();
        await expect(app.evidenceDialog).toBeVisible();
        await app.expectToasts([]);
        await app.evidenceInput.fill(STUDENT);
        const [download] = await Promise.all([page.waitForEvent("download"), app.evidenceDialog.locator("button[type=submit]").click()]);
        expect(download.suggestedFilename()).toBe("evidence-northlight.txt");
        const chunks = [];
        for await (const chunk of await download.createReadStream()) chunks.push(chunk);
        const text = Buffer.concat(chunks).toString("utf8");
        await expect(app.evidenceDialog).toBeHidden();
        const exported = /^exported: (.*)$/m.exec(text)[1];
        const eventTime = /^\[1\] (\S+) · event: reset$/m.exec(text)[1];
        expect(text).toBe(evidenceFileV2({ exported, entries: [{ t: eventTime, event: "reset", lines: ["database reset"] }] }));
        const { verifyEvidence } = await load("evidence.js");
        expect(await verifyEvidence(text)).toEqual({ status: "valid", student: STUDENT, queries: 0, events: 1, exported, dataset: "northlight" });
        await app.expectToasts(["Exported evidence-northlight.txt with 0 queries and 1 event"]);
    });

    test("with no queries and no events the toast says there is nothing to export, and no dialog opens", async ({ page, app }) => {
        await app.recordToasts({ fromStart: true });
        await app.open(NORTHLIGHT_URL);
        // an event of another log is not this log's: there is still nothing to export here
        await recordEvent(page, "file:other.db", { kind: "import", lines: ["file: x.csv, 1 bytes"] });
        await app.openEvidence();
        await expect(app.evidenceDialog).toBeHidden();
        expect(await page.evaluate(() => document.querySelector("dialog[open]"))).toBeNull();
        await expect(app.toast).toHaveText("Nothing to export yet. Run a query first, then export your evidence.");
        await app.expectToasts(["Nothing to export yet. Run a query first, then export your evidence."]);
    });
});

// ---- the verify page ---------------------------------------------------------------------------

const result = (page) => page.locator("#verify-result");
const chooseFile = (page, content, name = "evidence.txt") =>
    page.locator("#evidence-file").setInputFiles({ name, mimeType: "text/plain", buffer: Buffer.isBuffer(content) ? content : Buffer.from(content) });
const rows = async (page) => ({
    labels: await result(page).locator("dt").allTextContents(),
    values: await result(page).locator("dd").allTextContents(),
});

test.describe("the verify page", () => {
    test("a version 2 file: VALID with Student number, Queries, Events, Exported, Dataset in that order", async ({ page }) => {
        await page.goto("verify.html");
        await chooseFile(page, evidenceFileV2({ entries: TIMELINE, dataset: "file:messy_sales.db" }));
        await expect(result(page)).toContainText("VALID");
        await expect(result(page)).not.toContainText("EDITED");
        expect(await rows(page)).toEqual({
            labels: ["Student number", "Queries", "Events", "Exported", "Dataset"],
            values: [STUDENT, "4", "4", EXPORTED, "file:messy_sales.db"],
        });
    });

    test("a version 2 file with events and no queries shows 0 queries", async ({ page }) => {
        await page.goto("verify.html");
        await chooseFile(page, evidenceFileV2({ entries: [IMPORT] }));
        await expect(result(page)).toContainText("VALID");
        expect(await rows(page)).toEqual({
            labels: ["Student number", "Queries", "Events", "Exported", "Dataset"],
            values: [STUDENT, "0", "1", EXPORTED, "northlight"],
        });
    });

    for (const name of SAVED) {
        test(`${name}: choosing the saved version 1 file shows VALID with its saved values and no Events row`, async ({ page }) => {
            const file = saved(name);
            await page.goto("verify.html");
            await chooseFile(page, file.buffer, `${name}.txt`);
            await expect(result(page)).toContainText("VALID");
            await expect(result(page)).not.toContainText("EDITED");
            expect(await rows(page)).toEqual({
                labels: ["Student number", "Queries", "Exported", "Dataset"],
                values: [file.verdict.student, String(file.verdict.queries), file.verdict.exported, file.verdict.dataset],
            });
            await expect(result(page).locator("dt:has-text('Events')")).toHaveCount(0);
            await expect(result(page)).not.toContainText("Events");
        });
    }

    test("a version 2 file that was changed is EDITED, with a reason", async ({ page }) => {
        const text = evidenceFileV2({ entries: [IMPORT, QUERY] });
        await page.goto("verify.html");
        await chooseFile(page, text.replace("22 rows", "23 rows"));
        await expect(result(page)).toContainText("EDITED");
        await expect(result(page)).toContainText("checksum does not match");
        await expect(result(page)).not.toContainText("VALID");
        // a version 2 file with no event in it
        const noEvent = evidenceFileV2({ entries: [QUERY] });
        await chooseFile(page, noEvent);
        await expect(result(page)).toContainText("EDITED");
        await expect(result(page)).toContainText("lists no events");
        // an event of a kind this page does not know (a file a later release wrote)
        const lines = throughStudent(evidenceFileV2({ entries: [IMPORT, QUERY] }));
        await chooseFile(page, seal(lines.map((line) => line.replace(/event: import$/, "event: archive"))));
        await expect(result(page)).toContainText("EDITED");
        await expect(result(page)).toContainText("an event of a kind this page does not know");
        await expect(result(page)).not.toContainText("VALID");
    });

    test("the page loads its own few modules and none of the app's: not the plan's settings, the events, the flags, the loader or the bundle", async ({ page, net }) => {
        // js/lab/config-workflow.js exists so that this page does not carry the plan's settings
        // (the page has a size limit, tests/m5-verify-page.spec.js): what evidence.js needs here
        // is in config.js
        await page.goto("verify.html");
        await page.waitForLoadState("networkidle");
        await chooseFile(page, evidenceFileV2({ entries: TIMELINE }));
        await expect(result(page)).toContainText("VALID");
        const scripts = net.paths.filter((p) => /\.m?js(\?|$)/.test(p)).sort();
        expect(scripts).toEqual(["js/lab/brand.js", "js/lab/config.js", "js/lab/evidence.js", "js/lab/theme-boot.js", "js/lab/verify-page.js"]);
        expect(net.paths.filter((p) => /config-workflow|events\.js|flags\.js|vendor-loader|bundle\//.test(p))).toEqual([]);
    });

    test("it still makes no request and writes no storage, whatever version it is given", async ({ page, net }) => {
        await page.goto("verify.html");
        await page.waitForLoadState("networkidle");
        net.clear();
        const v2 = evidenceFileV2({ entries: TIMELINE });
        await chooseFile(page, v2);
        await expect(result(page)).toContainText("VALID");
        await expect(result(page).locator("dt:has-text('Events') + dd")).toHaveText("4");
        await chooseFile(page, saved("v1-dataset").buffer);
        await expect(result(page)).toContainText("VALID");
        await expect(result(page).locator("dt:has-text('Events')")).toHaveCount(0);
        await page.locator("#evidence-text").fill(v2);
        await page.getByRole("button", { name: "Verify" }).click();
        await expect(result(page).locator("dt:has-text('Events') + dd")).toHaveText("4");
        await page.locator('main a[href="./"]').hover();
        expect(net.entries.map((e) => e.url), "requests made after the page had loaded").toEqual([]);
        const stored = await page.evaluate(async () => ({
            local: localStorage.length,
            session: sessionStorage.length,
            cookie: document.cookie,
            dbs: indexedDB.databases ? (await indexedDB.databases()).length : 0,
        }));
        expect(stored).toEqual({ local: 0, session: 0, cookie: "", dbs: 0 });
    });
});
