const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const { pathToFileURL } = require("node:url");
const { test, expect, App, fixturePath, quoteIdent, readZip, EXPORT_URL, flagState, openEdgeCases, recordDownloads, eventsOfOpen, expectedBytes, databaseFingerprint } = require("./helpers");

// Assessment plan, Phase 3 (export tables as CSV): what an export WRITES, judged against the
// owner's test files (tests/fixtures/export/, with the result each must give in
// tests/fixtures/expected/export.json), through the real dialog and the real engine, with the export
// alone on (flagState("export")). Pinned here:
//   - the owner's database export_edge_cases.db, opened as a file: its dialog lists the fourteen
//     tables and views in the order export.json gives, with their kinds and row counts
//   - each of the fourteen exported ALONE: the file is named sanitiseName(table) + ".csv", and its
//     bytes, size and SHA-256 are those of the owner's expected file; big_2000 has 2,000 data lines
//   - all fourteen together: export_edge_cases-tables.zip, whose entries (read by readZip, which
//     does not use the library that wrote the zip) are the expected file names in the dialog's order
//     and the expected bytes; sales_2024 and "sales/2024" together, and the row that says so
//   - the round trip (plan sections 5 and 9): each exported file imported again (flagState("import",
//     "export"): the export and the import, the Excel import off) gives what export.json says
//     under after_reimport and nothing else. The comparison is worked out from the database itself
//     (every value of the original, read with typeof()) and from export.json's list, and each listed
//     difference is shown to be needed: leave it out of the list and the comparison finds it
//   - databases made in the test (a .sql file opened in the page, then SQL run on it): a text column
//     of digits and a REAL column of whole values; -0.0 and the two infinities; integers beyond
//     2^53; a view that counts and then fails part-way, alone and among others; views whose rows
//     differ from their count (a function the test gives the engine, to make that deterministic);
//     BLOBs, the zero-length one included, and the note that names the table; a TEMP table that
//     hides a main one; an empty name and names that differ only in letter case; three hundred
//     small tables and the event that holds 200 lines
//   - the evidence: after one export the version 2 file lists it as an event, and verifies
//   - more bytes, from databases made in the test (their expected bytes typed in the test): U+FEFF at
//     the start of a text, of a column name and of a table name; a table of one column of NULLs and
//     empty texts (empty lines, and a known loss when the file is imported again); a name with a
//     double quote, a name that starts with sqlite3, an index and a trigger; an fts5 table and the
//     tables it keeps, with an attached database and a TEMP table left out; two columns of one name,
//     a NUL in a text, a text that is not UTF-8, a name of 300 characters; the names of the columns
//     that the results pane shows
//   - an export never writes to the database (its content is the same after it)
//   - the zip: every entry deflated and dated within a minute of the page's clock, and still made
//     when that clock is before 1980 or after 2099
//   - what a row weighs in a piece, with the clock held: a table of large BLOBs read in a piece per
//     row; the pieces of a table of INTEGERs, of REALs and of NULLs
// The texts the student sees are read from js/lab/config-workflow.js, never typed again. The
// writer's own rules are tests/aw3-export-rules.spec.js; the dialog's and the page's behaviour are
// tests/aw3-export-dialog.spec.js and tests/aw3-export-page.spec.js. Everything runs in the page, on
// all four projects.

const load = (file) => import(pathToFileURL(path.join(__dirname, "..", "js", "lab", file)).href);

let words;
let importRules;
test.beforeAll(async () => {
    words = await load("config-workflow.js");
    importRules = await load("import-rules.js");
});

const ROUND_TRIP_URL = `./?${flagState("import", "export")}`;
const STUDENT = "U2034567";
const BOM = "\uFEFF";

// ---- what the owner says ---------------------------------------------------------------------------

// the fourteen tables and views, in the dialog's order (SQL's ORDER BY name), as export.json has them
const OWNER = JSON.parse(fs.readFileSync(fixturePath("expected/export.json"), "utf8"));
const TABLES = OWNER.tables;
const expectedFileOf = (table) => path.posix.basename(table.expected_csv);
const expectedBytesOf = (table) => expectedBytes(expectedFileOf(table));
const sha256Of = (bytes) => crypto.createHash("sha256").update(bytes).digest("hex");
const fileNameAlone = (name) => `${importRules.sanitiseName(name) || importRules.FALLBACK_TABLE_NAME}.csv`;

// ---- the page --------------------------------------------------------------------------------------

// makes a database in the page: a .sql file is opened as a database (its name is `name`); a test
// then runs more SQL on the open connection with app.rows (a TEMP table, a view over a function the
// test has just given the engine)
async function madeDatabase(app, sql, { address = EXPORT_URL, name = "made.sql" } = {}) {
    await app.open(address);
    await app.upload(App.sqlFile(name, sql));
    await expect(app.toast).toContainText(name);
}

// the names of the open database's tables, in SQL's order
const tableNames = (app) => app.rows("select name from sqlite_schema where type = 'table' order by name").then((rows) => rows.map((row) => row[0]));

// ---- the values of a table, with their types: the original, and what comes back ----------------------

// cellsOf reads a table or view as {columns, rows}: each cell is "<type>:<value>" as the engine
// stores it (typeof() of the value; an INTEGER in its digits whatever its size, a BLOB in hex, a REAL
// as JavaScript prints the number, "-0" for negative zero), or "null". The engine's own types are
// asked for in the same statement, so a REAL 1.0 is "real:1" and an INTEGER 1 is "integer:1".
async function cellsOf(app, name, { order = "" } = {}) {
    const ident = quoteIdent(name);
    const columns = (await app.rows(`PRAGMA table_info(${ident})`)).map((row) => row[1]);
    const picks = columns
        .map((column) => {
            const c = quoteIdent(column);
            return `typeof(${c}), CASE typeof(${c}) WHEN 'integer' THEN CAST(${c} AS TEXT) WHEN 'blob' THEN hex(${c}) ELSE ${c} END`;
        })
        .join(", ");
    const raw = columns.length ? await app.rows(`select ${picks} from ${ident} ${order}`) : [];
    const rows = raw.map((row) =>
        columns.map((unused, i) => {
            const [type, value] = [row[2 * i], row[2 * i + 1]];
            return type === "null" ? "null" : `${type}:${type === "real" && Object.is(value, -0) ? "-0" : value}`;
        })
    );
    return { columns, rows };
}

// export.json says what changes in a table that is exported and imported again: "identical", or a
// list of {column, change} (a name, a type) and {column, row, change} (one value, row counted from 1).
// These read the list: the value that a change ends in ("becomes '42'", "becomes None") is Python's
// own way of writing it.
function pythonValue(text) {
    if (text === "None") {
        return null;
    }
    const quoted = /^(['"])(.*)\1$/s.exec(text);
    if (!quoted) {
        throw new Error(`export.json: cannot read ${text} as a value`);
    }
    return quoted[2];
}

// the way Python writes a value, for the left side of a change: a text, an integer, a real, bytes
function pythonText(cell) {
    const [type, value] = cell === "null" ? ["null", ""] : [cell.slice(0, cell.indexOf(":")), cell.slice(cell.indexOf(":") + 1)];
    switch (type) {
        case "integer":
            return value;
        case "real":
            return /^-?\d+$/.test(value) ? `${value}.0` : value;
        case "text":
            if (/['\\\n\r]/.test(value)) {
                throw new Error(`cannot write ${JSON.stringify(value)} as Python does`);
            }
            return `'${value}'`;
        case "blob":
            return `b'${value.replace(/../g, (pair) => `\\x${pair.toLowerCase()}`)}'`;
        default:
            return "None";
    }
}

// the text a value becomes when its column becomes TEXT: what the file holds for it
function plainText(cell) {
    const [type, value] = [cell.slice(0, cell.indexOf(":")), cell.slice(cell.indexOf(":") + 1)];
    if (type === "integer" || type === "text") {
        return value;
    }
    throw new Error(`export.json: a ${type} column becoming TEXT is not in this list`);
}

// what `before` must be after the export and the import again if `changes` (export.json's list for
// the table) are all there is to say: the names of the columns renamed, the columns whose type
// changes with all their values as text, and the single values that change
function predictAfter(before, changes) {
    const columns = before.columns.slice();
    const rows = before.rows.map((row) => row.slice());
    const indexOf = (column) => {
        const at = before.columns.indexOf(column);
        if (at < 0) {
            throw new Error(`export.json: no column ${column}`);
        }
        return at;
    };
    for (const { column, row, change } of changes) {
        const at = indexOf(column);
        if (row === undefined) {
            const name = /^name becomes (.+)$/.exec(change);
            const type = /^type (INTEGER|REAL) becomes TEXT$/.exec(change);
            if (name) {
                columns[at] = name[1];
            } else if (type) {
                for (const values of rows) {
                    if (values[at] !== "null") {
                        values[at] = `text:${plainText(values[at])}`;
                    }
                }
            } else {
                throw new Error(`export.json: cannot read the change ${change}`);
            }
        }
    }
    for (const { column, row, change } of changes) {
        if (row !== undefined) {
            const at = indexOf(column);
            const [was, becomes] = /^(.+) becomes (.+)$/s.exec(change).slice(1);
            // (the list's left side is the original value: the row it names must hold it)
            expect(pythonText(before.rows[row - 1][at]), `row ${row} of ${column}: export.json says it was ${was}`).toBe(was);
            const now = pythonValue(becomes);
            rows[row - 1][at] = now === null ? "null" : `text:${now}`;
        }
    }
    return { columns, rows };
}

// the differences between two readings of a table, as sentences (none when they are the same)
function differences(expected, actual) {
    const found = [];
    const say = (text) => found.length < 20 && found.push(text);
    const show = (cell) => (cell.length > 60 ? `${cell.slice(0, 60)}...(${cell.length} characters)` : cell);
    if (JSON.stringify(expected.columns) !== JSON.stringify(actual.columns)) {
        say(`columns ${JSON.stringify(actual.columns)}, expected ${JSON.stringify(expected.columns)}`);
    }
    if (expected.rows.length !== actual.rows.length) {
        say(`${actual.rows.length} rows, expected ${expected.rows.length}`);
    }
    expected.rows.forEach((row, r) =>
        row.forEach((cell, c) => {
            const got = actual.rows[r]?.[c];
            if (got !== cell) {
                say(`row ${r + 1}, column ${expected.columns[c]}: ${show(String(got))}, expected ${show(cell)}`);
            }
        })
    );
    return found;
}

// exports one table or view alone from the owner's database and imports the file again into a new
// database; the original is read first. Returns what was saved, and the two readings.
async function roundTrip(app, name) {
    const before = await cellsOf(app, name);
    const file = await app.exportTables([name]);
    await app.importFiles({ name: file.name, mimeType: "text/csv", buffer: file.buffer });
    const [made] = await tableNames(app);
    expect(await tableNames(app)).toEqual([made]);
    // a table is named after its file: the file's name without .csv
    expect(made, `the table made from ${file.name}`).toBe(file.name.replace(/\.csv$/, ""));
    const after = await cellsOf(app, made, { order: "order by rowid" });
    return { file, made, before, after };
}

// ---- the owner's files, and the dialog's list -----------------------------------------------------

test.describe("the owner's files for the export", () => {
    test("export.json lists the fourteen tables and views, and its files have the size and SHA-256 it gives", async () => {
        expect(TABLES).toHaveLength(14);
        expect(TABLES.map((table) => table.kind)).toEqual(["table", "table", "table", "table", "table", "table", "table", "table", "table", "table", "table", "table", "table", "view"]);
        for (const table of TABLES) {
            const bytes = expectedBytesOf(table);
            expect(bytes.length, `${table.name}: size`).toBe(table.expected_csv_bytes);
            expect(sha256Of(bytes), `${table.name}: SHA-256`).toBe(table.expected_csv_sha256);
        }
    });

    test("the dialog lists the fourteen objects in the order of export.json, with their kinds and their row counts", async ({ app }) => {
        await openEdgeCases(app);
        await app.openTables();
        await app.waitCounted();
        const rows = await app.tablesRows();
        expect(rows.map((row) => row.name)).toEqual(TABLES.map((table) => table.name));
        expect(rows.map((row) => row.kind)).toEqual(TABLES.map((table) => table.kind));
        // (nothing is ticked at the start of a list of fourteen, so a row says only how many rows it holds)
        expect(rows.map((row) => row.line)).toEqual(TABLES.map((table) => words.exportTablesRowsText(table.rows)));
        expect(rows.every((row) => !row.ticked && row.tickable)).toBe(true);
        expect(rows[2].line).toBe("2,000 rows");
    });
});

// ---- each of the fourteen alone ------------------------------------------------------------------------

test.describe("each table or view of the owner's database, exported alone, is saved with the bytes of the owner's file", () => {
    for (const table of TABLES) {
        test(`${table.name}: saved under its own cleaned name, with the bytes, size and SHA-256 of the owner's expected file`, async ({ page, app }) => {
            await openEdgeCases(app);
            const file = await app.exportTables([table.name]);
            expect(file.name).toBe(fileNameAlone(table.name));
            expect(file.buffer.equals(expectedBytesOf(table))).toBe(true);
            expect(file.buffer.length).toBe(table.expected_csv_bytes);
            expect(sha256Of(file.buffer)).toBe(table.expected_csv_sha256);
            // the toast and the event say the rows that were written, which are the rows the table holds
            await expect(app.toast).toContainText(words.exportedTablesMessage(file.name, { rows: table.rows }));
            const events = await eventsOfOpen(page);
            expect(events).toHaveLength(1);
            expect(events[0].lines).toEqual([words.exportEventFileLine(file.name, file.buffer.length), words.exportEventTableLine(table.name, table.rows)]);
        });
    }

    test("big_2000 gives 2,000 data lines, after the header, in order, and a last CRLF", async ({ app }) => {
        await openEdgeCases(app);
        const file = await app.exportTables(["big_2000"]);
        const lines = file.text.split("\r\n");
        // (the text after the last CRLF is empty)
        expect(lines.pop()).toBe("");
        expect(lines.shift()).toBe(`${BOM}id,value`);
        expect(lines).toHaveLength(2000);
        expect(lines[0]).toBe("1,row 0001");
        expect(lines[1999]).toBe("2000,row 2000");
        expect(lines.every((line, i) => line === `${i + 1},row ${String(i + 1).padStart(4, "0")}`)).toBe(true);
    });
});

// ---- all fourteen together ----------------------------------------------------------------------------

test.describe("all fourteen exported together", () => {
    test("one zip, export_edge_cases-tables.zip, of fourteen files in the dialog's order, each with the owner's bytes", async ({ page, app }) => {
        test.slow();
        await openEdgeCases(app);
        const file = await app.exportTables("all");
        expect(file.name).toBe("export_edge_cases-tables.zip");
        const entries = readZip(file.buffer);
        expect(entries.map((entry) => entry.name)).toEqual(TABLES.map(expectedFileOf));
        expect(entries.map((entry) => entry.name)).toContain("sales_2024_2.csv");
        expect(new Set(entries.map((entry) => entry.name)).size).toBe(14);
        for (const [i, entry] of entries.entries()) {
            const table = TABLES[i];
            expect(entry.bytes.equals(expectedBytesOf(table)), entry.name).toBe(true);
            expect(entry.bytes.length, `${entry.name}: size`).toBe(table.expected_csv_bytes);
            expect(sha256Of(entry.bytes), `${entry.name}: SHA-256`).toBe(table.expected_csv_sha256);
        }
        await expect(app.toast).toContainText(words.exportedTablesMessage(file.name, { tables: 14 }));
        // (the zip's entries and the event's lines come in the same order)
        const events = await eventsOfOpen(page);
        expect(events).toHaveLength(1);
        expect(events[0].lines).toEqual([
            words.exportEventFileLine(file.name, file.buffer.length),
            ...TABLES.map((table) => words.exportEventTableLine(table.name, table.rows, expectedFileOf(table))),
        ]);
    });

    test("sales_2024 alone is sales_2024.csv; with sales/2024 ticked as well its row says it is saved as sales_2024_2.csv, and unticking takes that away", async ({ app }) => {
        await openEdgeCases(app);
        await app.openTables();
        await app.waitCounted();
        const saved = (name) => app.tablesRow(name).locator(".tables-row-saved");
        await app.tablesBox("sales_2024").check();
        // alone it is saved under its own name, so its row says nothing of a file
        await expect(saved("sales_2024")).toHaveCount(0);
        await expect(app.tablesHold).toHaveText(words.exportTablesWillSaveText({ kind: "file", fileName: "sales_2024.csv", entries: [{}] }));
        // sales/2024 as well: it comes first in the list, so it takes sales_2024.csv and sales_2024 takes _2
        await app.tablesBox("sales/2024").check();
        await expect(saved("sales/2024")).toHaveText(words.exportTablesSavedAsText("sales_2024.csv"));
        await expect(saved("sales_2024")).toHaveText(words.exportTablesSavedAsText("sales_2024_2.csv"));
        await expect(app.tablesHold).toHaveText(words.exportTablesWillSaveText({ kind: "zip", fileName: "export_edge_cases-tables.zip", entries: [{}, {}] }));
        // and what is saved says the same
        const file = await app.download(() => app.tablesSubmit.click());
        expect(file.name).toBe("export_edge_cases-tables.zip");
        const entries = readZip(file.buffer);
        expect(entries.map((entry) => entry.name)).toEqual(["sales_2024.csv", "sales_2024_2.csv"]);
        expect(entries[0].bytes.toString("utf8")).toBe(`${BOM}region,orders\r\nNorth,12\r\nSouth,30\r\n`);
        expect(entries[1].bytes.toString("utf8")).toBe(`${BOM}region,orders\r\nEast,7\r\nWest,9\r\n`);
    });

    test("untick sales/2024 and the row of sales_2024 loses its file name again", async ({ app }) => {
        await openEdgeCases(app);
        await app.openTables();
        await app.waitCounted();
        await app.tickTables(["sales_2024", "sales/2024"]);
        await expect(app.tablesRow("sales_2024").locator(".tables-row-saved")).toHaveText(words.exportTablesSavedAsText("sales_2024_2.csv"));
        await app.tablesBox("sales/2024").uncheck();
        await expect(app.tablesRow("sales_2024").locator(".tables-row-saved")).toHaveCount(0);
        await expect(app.tablesRow("sales/2024").locator(".tables-row-saved")).toHaveCount(0);
        await expect(app.tablesHold).toHaveText(words.exportTablesWillSaveText({ kind: "file", fileName: "sales_2024.csv", entries: [{}] }));
        // the file that is saved is sales_2024.csv, with the rows of sales_2024
        const file = await app.download(() => app.tablesSubmit.click());
        expect(file.name).toBe("sales_2024.csv");
        expect(file.text).toBe(`${BOM}region,orders\r\nEast,7\r\nWest,9\r\n`);
    });
});

// ---- the round trip ----------------------------------------------------------------------------------------

test.describe("each exported file imported again gives what export.json says under after_reimport, and nothing else", () => {
    for (const table of TABLES) {
        const listed = table.after_reimport === "identical" ? [] : table.after_reimport;
        const title = listed.length ? `${listed.length} listed difference${listed.length === 1 ? "" : "s"}` : "identical";
        test(`${table.name}: ${title}`, async ({ app }) => {
            test.slow();
            await openEdgeCases(app, ROUND_TRIP_URL);
            const { before, after } = await roundTrip(app, table.name);
            expect(before.rows).toHaveLength(table.rows);
            expect(differences(predictAfter(before, listed), after)).toEqual([]);
            // (the comparison can fail: without any one of the listed differences it finds one)
            for (const [i, change] of listed.entries()) {
                const without = listed.filter((unused, at) => at !== i);
                expect(differences(predictAfter(before, without), after), `without ${JSON.stringify(change)}`).not.toEqual([]);
            }
            // "identical" is a claim about the values and their types: nothing of the original is lost
            if (table.after_reimport === "identical") {
                expect(after).toEqual(before);
            }
        });
    }

    test("an entry of a zip whose name gained _2 comes back as a table with that name: sales_2024_2.csv is the table sales_2024_2", async ({ app }) => {
        test.slow();
        await openEdgeCases(app, ROUND_TRIP_URL);
        const before = await cellsOf(app, "sales_2024");
        const zip = await app.exportTables(["sales/2024", "sales_2024"]);
        const entries = readZip(zip.buffer);
        expect(entries.map((entry) => entry.name)).toEqual(["sales_2024.csv", "sales_2024_2.csv"]);
        await app.importFiles({ name: "sales_2024_2.csv", mimeType: "text/csv", buffer: entries[1].bytes });
        expect(await tableNames(app), "the table made from sales_2024_2.csv").toEqual(["sales_2024_2"]);
        // (the rows of sales_2024, the second of the two, are the ones that come back)
        expect((await cellsOf(app, "sales_2024_2", { order: "order by rowid" })).rows).toEqual(before.rows);
    });

    test("the differences are the ones the plan names: a name cleaned, a column that becomes TEXT, an empty text that becomes NULL, a BLOB that becomes its text", async () => {
        const kinds = (change) => (/^name becomes /.test(change) ? "name" : /^type .* becomes TEXT$/.test(change) ? "type" : /^'' becomes None$/.test(change) ? "empty text" : "value");
        const found = TABLES.flatMap((table) => (table.after_reimport === "identical" ? [] : table.after_reimport.map((entry) => `${table.name}: ${kinds(entry.change)}`)));
        expect(found).toEqual([
            "Order Details: name",
            "Order Details: name",
            "Order Details: name",
            "mixed_types: value",
            "mixed_types: value",
            "mixed_types: value",
            "mixed_types: empty text",
            "number_edge: type",
            "text_edge: empty text",
        ]);
    });
});

// ---- a text column of digits, a REAL column of whole values -------------------------------------------------

test.describe("a database made in the test: what a text column of digits and a REAL column of whole values come back as", () => {
    const SQL = `
        create table digits (id integer primary key, code text, plain text, decimals text, price real, qty integer);
        insert into digits values
            (1, '00123', '42', '1.50', 1.0, 1),
            (2, '42', '7', '2.25', 2.0, 20),
            (3, '7', '19', '3', 100.0, 300);
    `;

    test("the file writes the text as it is, and every REAL with a decimal point", async ({ app }) => {
        await madeDatabase(app, SQL);
        const file = await app.exportTables(["digits"]);
        expect(file.name).toBe("digits.csv");
        expect(file.text).toBe(
            `${BOM}id,code,plain,decimals,price,qty\r\n1,00123,42,1.50,1.0,1\r\n2,42,7,2.25,2.0,20\r\n3,7,19,3,100.0,300\r\n`
        );
    });

    test("imported again: digits with a leading zero stay text, a text column of plain whole numbers is INTEGER, decimals are REAL, and whole REAL values are still REAL", async ({ app }) => {
        await madeDatabase(app, SQL, { address: ROUND_TRIP_URL });
        const { before, after } = await roundTrip(app, "digits");
        // what was stored: the three columns of digits are text, and price holds reals
        expect(before.rows[0]).toEqual(["integer:1", "text:00123", "text:42", "text:1.50", "real:1", "integer:1"]);
        expect(before.rows[2].slice(4, 5)).toEqual(["real:100"]);
        expect(after.columns).toEqual(before.columns);
        expect(after.rows).toEqual([
            // code: one value has a leading zero, so the whole column is text, as written
            // plain: every value a plain whole number, so INTEGER
            // decimals: a decimal and a whole number, so REAL (1.50 is 1.5)
            // price: 1.0, 2.0 and 100.0 are decimals, so REAL, not INTEGER
            ["integer:1", "text:00123", "integer:42", "real:1.5", "real:1", "integer:1"],
            ["integer:2", "text:42", "integer:7", "real:2.25", "real:2", "integer:20"],
            ["integer:3", "text:7", "integer:19", "real:3", "real:100", "integer:300"],
        ]);
    });
});

// ---- negative zero, infinity, large integers ------------------------------------------------------------------

test.describe("a database made in the test: negative zero, the infinities and integers beyond 2^53", () => {
    // (a column declared REAL turns -0.0 into 0.0 when it stores it, so negative zero is kept in a
    // column that has no declared type, and a view's column has none either)
    const SQL = `
        create table zeros (id integer primary key, x);
        insert into zeros values (1, -0.0), (2, 0.0), (3, 2.5);
        create table infinite (id integer primary key, x real);
        insert into infinite values (1, 9e999), (2, -9e999), (3, 1.5);
        create table huge (id integer primary key, i integer);
        insert into huge values (1, 9007199254740993), (2, 9223372036854775807), (3, -9223372036854775808), (4, 9007199254740991);
        create view negative_zero as select -0.0 as x, 9e999 as up, -9e999 as down;
    `;

    test("the stored values are what the test says they are", async ({ app }) => {
        await madeDatabase(app, SQL);
        expect((await cellsOf(app, "zeros")).rows).toEqual([["integer:1", "real:-0"], ["integer:2", "real:0"], ["integer:3", "real:2.5"]]);
        expect((await cellsOf(app, "infinite")).rows).toEqual([["integer:1", "real:Infinity"], ["integer:2", "real:-Infinity"], ["integer:3", "real:1.5"]]);
        expect((await cellsOf(app, "huge")).rows[1]).toEqual(["integer:2", "integer:9223372036854775807"]);
    });

    test("a REAL -0.0 is written -0.0, and a REAL 0.0 is written 0.0", async ({ app }) => {
        await madeDatabase(app, SQL);
        const file = await app.exportTables(["zeros"]);
        expect(file.text).toBe(`${BOM}id,x\r\n1,-0.0\r\n2,0.0\r\n3,2.5\r\n`);
    });

    test("an infinite REAL is written Infinity or -Infinity", async ({ app }) => {
        await madeDatabase(app, SQL);
        const file = await app.exportTables(["infinite"]);
        expect(file.text).toBe(`${BOM}id,x\r\n1,Infinity\r\n2,-Infinity\r\n3,1.5\r\n`);
    });

    test("a view's -0.0 and infinities are written in the same words", async ({ app }) => {
        await madeDatabase(app, SQL);
        const file = await app.exportTables(["negative_zero"]);
        expect(file.text).toBe(`${BOM}x,up,down\r\n-0.0,Infinity,-Infinity\r\n`);
    });

    test("an INTEGER beyond 2^53 is written in full, never through a number that rounds it", async ({ app }) => {
        await madeDatabase(app, SQL);
        const file = await app.exportTables(["huge"]);
        expect(file.text).toBe(
            `${BOM}id,i\r\n1,9007199254740993\r\n2,9223372036854775807\r\n3,-9223372036854775808\r\n4,9007199254740991\r\n`
        );
    });

    test("imported again, -0.0 comes back as 0.0", async ({ app }) => {
        await madeDatabase(app, SQL, { address: ROUND_TRIP_URL });
        const { before, after } = await roundTrip(app, "zeros");
        expect(before.rows[0][1]).toBe("real:-0");
        expect(after.rows).toEqual([["integer:1", "real:0"], ["integer:2", "real:0"], ["integer:3", "real:2.5"]]);
    });

    test("in a column declared REAL the engine keeps a minus zero as 0, and the file says 0.0", async ({ app }) => {
        // (the sign is gone before the export reads the value: a column of that type keeps a REAL
        // that is a whole number as an integer, and an integer has no minus zero)
        await madeDatabase(app, "create table typed (id integer primary key, x real); insert into typed values (1, -0.0), (2, 0.0), (3, -0.5);");
        expect((await cellsOf(app, "typed")).rows).toEqual([["integer:1", "real:0"], ["integer:2", "real:0"], ["integer:3", "real:-0.5"]]);
        const file = await app.exportTables(["typed"]);
        expect(file.text).toBe(`${BOM}id,x\r\n1,0.0\r\n2,0.0\r\n3,-0.5\r\n`);
    });

    test("imported again, a REAL column that held an infinite value comes back as a TEXT column", async ({ app }) => {
        await madeDatabase(app, SQL, { address: ROUND_TRIP_URL });
        const { before, after } = await roundTrip(app, "infinite");
        expect(before.rows.map((row) => row[1])).toEqual(["real:Infinity", "real:-Infinity", "real:1.5"]);
        expect(after.rows).toEqual([["integer:1", "text:Infinity"], ["integer:2", "text:-Infinity"], ["integer:3", "text:1.5"]]);
    });

    test("imported again, a column of integers beyond 2^53 comes back as TEXT with every digit", async ({ app }) => {
        await madeDatabase(app, SQL, { address: ROUND_TRIP_URL });
        const { after } = await roundTrip(app, "huge");
        expect(after.rows.map((row) => row[1])).toEqual([
            "text:9007199254740993",
            "text:9223372036854775807",
            "text:-9223372036854775808",
            "text:9007199254740991",
        ]);
    });
});

// ---- a view that counts and then fails ---------------------------------------------------------------------------

test.describe("a view that can be counted and then fails when its rows are read", () => {
    // abs() of the smallest integer is an overflow, and an engine that is only asked how many rows
    // there are does not evaluate it: the view counts 2 rows, and fails on the first
    const SQL = `
        create table alpha (a integer);
        insert into alpha values (1), (2);
        create table omega (z text);
        insert into omega values ('last');
        create view bad as select abs(-9223372036854775807 - 1) as x union all select 1;
    `;

    test("the engine counts it, and fails when it reads it, with the words the dialog will give", async ({ app, page }) => {
        await madeDatabase(app, SQL);
        expect(await app.rows("select count(*) from bad")).toEqual([[2]]);
        const failure = await page.evaluate(() => {
            try {
                window.app.database.db.exec("select * from bad");
                return null;
            } catch (error) {
                return String(error.message);
            }
        });
        expect(failure).toContain("integer overflow");
    });

    test("with others ticked: nothing is saved, no event is recorded, the dialog names the view and gives the engine's words, its row loses its tick and the others keep theirs", async ({ app, page }) => {
        await madeDatabase(app, SQL);
        const downloads = recordDownloads(page);
        // (the toasts the page shows from here on are kept: a check that no toast is on show passes at once)
        await app.recordToasts();
        await app.openTables();
        await app.waitCounted();
        // the view was counted: two rows
        expect((await app.tablesRows()).map((row) => [row.name, row.kind, row.line])).toEqual([
            ["alpha", "table", words.exportTablesRowsText(2)],
            ["bad", "view", words.exportTablesRowsText(2)],
            ["omega", "table", words.exportTablesRowsText(1)],
        ]);
        await app.tickTables(["alpha", "bad", "omega"]);
        await expect(app.tablesSubmit).toHaveAttribute("aria-disabled", "false");
        await app.tablesSubmit.click();
        // the dialog shows the list again, with the reason
        await expect(app.tablesError).toHaveText(words.exportTablesFailedText("bad", "integer overflow"));
        await expect(app.tablesError).toBeVisible();
        const rows = await app.tablesRows();
        expect(rows.map((row) => [row.name, row.ticked])).toEqual([
            ["alpha", true],
            ["bad", false],
            ["omega", true],
        ]);
        await expect(app.tablesRow("bad").locator(".tables-row-line")).toContainText(words.exportTablesUnreadText("integer overflow"));
        await expect(app.tablesCancel).toBeFocused();
        // alpha was read to its end before bad failed, and still nothing was saved
        expect(downloads).toEqual([]);
        expect(await eventsOfOpen(page)).toEqual([]);
        await app.expectToasts([]);
        // the other two are exported next, and then the file and the event are there
        await expect(app.tablesSubmit).toHaveAttribute("aria-disabled", "false");
        const file = await app.download(() => app.tablesSubmit.click());
        expect(file.name).toBe("made-tables.zip");
        // (the failed try told no toast; the export that went well tells one)
        const exported = words.exportedTablesMessage("made-tables.zip", { tables: 2 });
        await expect(app.toast).toContainText(exported);
        await app.expectToasts([exported], { settle: 100 });
        const entries = readZip(file.buffer);
        expect(entries.map((entry) => [entry.name, entry.bytes.toString("utf8")])).toEqual([
            ["alpha.csv", `${BOM}a\r\n1\r\n2\r\n`],
            ["omega.csv", `${BOM}z\r\nlast\r\n`],
        ]);
        const events = await eventsOfOpen(page);
        expect(events).toHaveLength(1);
        expect(events[0].lines).toEqual([
            words.exportEventFileLine("made-tables.zip", file.buffer.length),
            words.exportEventTableLine("alpha", 2, "alpha.csv"),
            words.exportEventTableLine("omega", 1, "omega.csv"),
        ]);
    });

    test("exported alone: nothing is saved, no event is recorded, and the dialog says so", async ({ app, page }) => {
        await madeDatabase(app, SQL);
        const downloads = recordDownloads(page);
        await app.openTables();
        await app.waitCounted();
        await app.tickTables(["bad"]);
        await app.tablesSubmit.click();
        await expect(app.tablesError).toHaveText(words.exportTablesFailedText("bad", "integer overflow"));
        expect((await app.tablesRows()).find((row) => row.name === "bad")).toMatchObject({ ticked: false });
        // nothing is ticked now, so there is nothing to export until something is
        await expect(app.tablesSubmit).toHaveAttribute("aria-disabled", "true");
        await expect(app.tablesHold).toHaveText(words.EXPORT_TABLES_HOLD_NONE);
        expect(downloads).toEqual([]);
        expect(await eventsOfOpen(page)).toEqual([]);
        // the page is as it was: a query runs
        expect(await app.rows("select count(*) from alpha")).toEqual([[2]]);
    });
});

// ---- views whose rows differ from their count ----------------------------------------------------------------------

test.describe("a view whose rows are not the rows that were counted: the event and the toast give the rows written", () => {
    // The engine is given a function that counts its own calls (the test does it with createFunction;
    // nothing else in SQL changes between a count and a read, and a view that does is the case):
    //   more_rows is counted when `grows() > 2` is false for all three of its rows (calls 0, 1, 2), and
    //   read when it is true for all three (calls 3, 4, 5): counted 0, written 3
    //   fewer_rows is counted while `shrinks() < 3` is true (calls 0, 1, 2) and read when it is false:
    //   counted 3, written 0
    const SQL = "create table anchor (a integer); insert into anchor values (1);";
    const THREE = "with recursive s(n) as (select 1 union all select n + 1 from s where n < 3) select n from s";

    async function giveFunctionsAndViews(app, page) {
        await page.evaluate(() => {
            const db = window.app.database.db;
            let grows = 0;
            let shrinks = 0;
            db.createFunction("grows", () => grows++);
            db.createFunction("shrinks", () => shrinks++);
        });
        await app.rows(`create view more_rows as ${THREE} where grows() > 2`);
        await app.rows(`create view fewer_rows as ${THREE} where shrinks() < 3`);
    }

    test("counted 0 and written 3: the toast and the event say 3 rows", async ({ app, page }) => {
        await madeDatabase(app, SQL);
        await giveFunctionsAndViews(app, page);
        await app.openTables();
        await app.waitCounted();
        await expect(app.tablesRow("more_rows").locator(".tables-row-count")).toHaveText(words.exportTablesRowsText(0));
        await app.tickTables(["more_rows"]);
        const file = await app.download(() => app.tablesSubmit.click());
        expect(file.name).toBe("more_rows.csv");
        expect(file.text).toBe(`${BOM}n\r\n1\r\n2\r\n3\r\n`);
        await expect(app.toast).toContainText(words.exportedTablesMessage("more_rows.csv", { rows: 3 }));
        const events = await eventsOfOpen(page);
        expect(events).toHaveLength(1);
        expect(events[0].lines).toEqual([words.exportEventFileLine("more_rows.csv", file.buffer.length), words.exportEventTableLine("more_rows", 3)]);
    });

    test("counted 3 and written 0: the toast and the event say 0 rows", async ({ app, page }) => {
        await madeDatabase(app, SQL);
        await giveFunctionsAndViews(app, page);
        await app.openTables();
        await app.waitCounted();
        await expect(app.tablesRow("fewer_rows").locator(".tables-row-count")).toHaveText(words.exportTablesRowsText(3));
        await app.tickTables(["fewer_rows"]);
        const file = await app.download(() => app.tablesSubmit.click());
        expect(file.name).toBe("fewer_rows.csv");
        expect(file.text).toBe(`${BOM}n\r\n`);
        await expect(app.toast).toContainText(words.exportedTablesMessage("fewer_rows.csv", { rows: 0 }));
        const events = await eventsOfOpen(page);
        expect(events).toHaveLength(1);
        expect(events[0].lines).toEqual([words.exportEventFileLine("fewer_rows.csv", file.buffer.length), words.exportEventTableLine("fewer_rows", 0)]);
    });

    test("in a zip, each table's line in the event has the rows written, not the rows counted", async ({ app, page }) => {
        await madeDatabase(app, SQL);
        await giveFunctionsAndViews(app, page);
        await app.exportTables("all");
        const events = await eventsOfOpen(page);
        expect(events).toHaveLength(1);
        // anchor was counted and written alike; the two views were not
        expect(events[0].lines.slice(1)).toEqual([
            words.exportEventTableLine("anchor", 1, "anchor.csv"),
            words.exportEventTableLine("fewer_rows", 0, "fewer_rows.csv"),
            words.exportEventTableLine("more_rows", 3, "more_rows.csv"),
        ]);
    });
});

// ---- BLOBs ----------------------------------------------------------------------------------------------------------

test.describe("a table with a BLOB", () => {
    const SQL = `
        create table blobs (id integer primary key, b blob);
        insert into blobs values (1, x'deadbeef'), (2, x''), (3, zeroblob(0)), (4, null), (5, x'00ff'), (6, 'x''deadbeef''');
        create table only_empty (b blob);
        insert into only_empty values (zeroblob(0));
        create table no_blob (a text);
        insert into no_blob values ('plain');
    `;

    test("each BLOB is written x'hex' in lower case, an empty one x'', a NULL nothing, and a text that looks like one as the text it is", async ({ app }) => {
        await madeDatabase(app, SQL);
        const file = await app.exportTables(["blobs"]);
        expect(file.name).toBe("blobs.csv");
        expect(file.text).toBe(`${BOM}id,b\r\n1,x'deadbeef'\r\n2,x''\r\n3,x''\r\n4,\r\n5,x'00ff'\r\n6,x'deadbeef'\r\n`);
    });

    test("the dialog stays, with a note that names the table, and the file is saved all the same", async ({ app, page }) => {
        await madeDatabase(app, SQL);
        const file = await app.exportTables(["blobs"]);
        await expect(app.tablesNote).toHaveText(words.exportTablesBlobNote("blobs.csv", ["blobs"]));
        await expect(app.tablesCancel).toHaveText(words.EXPORT_TABLES_CLOSE_TEXT);
        const events = await eventsOfOpen(page);
        expect(events).toHaveLength(1);
        expect(events[0].lines).toEqual([words.exportEventFileLine("blobs.csv", file.buffer.length), words.exportEventTableLine("blobs", 6)]);
    });

    test("a table whose only BLOB has no bytes is written x'' and gets the note too", async ({ app }) => {
        await madeDatabase(app, SQL);
        const file = await app.exportTables(["only_empty"]);
        expect(file.text).toBe(`${BOM}b\r\nx''\r\n`);
        await expect(app.tablesNote).toHaveText(words.exportTablesBlobNote("only_empty.csv", ["only_empty"]));
    });

    test("in a zip the note names the tables that held a BLOB, and no other", async ({ app }) => {
        await madeDatabase(app, SQL);
        const file = await app.exportTables("all");
        expect(file.name).toBe("made-tables.zip");
        expect(readZip(file.buffer).map((entry) => entry.name)).toEqual(["blobs.csv", "no_blob.csv", "only_empty.csv"]);
        await expect(app.tablesNote).toHaveText(words.exportTablesBlobNote("made-tables.zip", ["blobs", "only_empty"]));
        await expect(app.tablesNote).not.toContainText("no_blob");
    });

    test("a table with no BLOB ends with the dialog closed, with nothing more to say", async ({ app }) => {
        await madeDatabase(app, SQL);
        const file = await app.exportTables(["no_blob"]);
        expect(file.text).toBe(`${BOM}a\r\nplain\r\n`);
        await expect(app.tablesDialog).toBeHidden();
    });
});

// ---- a TEMP table that hides a main one ------------------------------------------------------------------------------

test.describe("a TEMP table with the name of a main table", () => {
    const SQL = `
        create table t (a integer);
        insert into t values (10), (20);
        create table other (o text);
        insert into other values ('o');
    `;

    async function hideT(app) {
        await app.rows("create temp table t (a integer, b text)");
        await app.rows("insert into t values (1, 'x'), (2, 'y'), (3, 'z'), (4, 'w'), (5, 'v')");
        await app.rows("create temp table only_temp (z integer)");
        await app.rows("insert into only_temp values (1)");
    }

    test("the query that names no schema reads the TEMP table, and the list has the main one only, once, and no TEMP table", async ({ app }) => {
        await madeDatabase(app, SQL);
        await hideT(app);
        // (the TEMP table hides the main one from an ordinary query)
        expect(await app.rows("select count(*) from t")).toEqual([[5]]);
        expect(await app.rows("select count(*) from main.t")).toEqual([[2]]);
        await app.openTables();
        await app.waitCounted();
        expect((await app.tablesRows()).map((row) => [row.name, row.line])).toEqual([
            ["other", words.exportTablesRowsText(1)],
            ["t", words.exportTablesRowsText(2)],
        ]);
    });

    test("the main table is what is exported: its two rows and its one column", async ({ app, page }) => {
        await madeDatabase(app, SQL);
        await hideT(app);
        const file = await app.exportTables(["t"]);
        expect(file.name).toBe("t.csv");
        expect(file.text).toBe(`${BOM}a\r\n10\r\n20\r\n`);
        const events = await eventsOfOpen(page);
        expect(events[0].lines).toEqual([words.exportEventFileLine("t.csv", file.buffer.length), words.exportEventTableLine("t", 2)]);
    });

    test("both tables of the list in a zip: t has the main table's rows", async ({ app }) => {
        await madeDatabase(app, SQL);
        await hideT(app);
        const file = await app.exportTables("all");
        expect(readZip(file.buffer).map((entry) => [entry.name, entry.bytes.toString("utf8")])).toEqual([
            ["other.csv", `${BOM}o\r\no\r\n`],
            ["t.csv", `${BOM}a\r\n10\r\n20\r\n`],
        ]);
    });
});

// ---- names: the empty one, and names that differ only in letter case ---------------------------------------------

test.describe("file names made from names that are empty, or that differ only in their letter case", () => {
    // SQLite refuses two tables whose names differ only in the case of A to Z, so the two that "differ
    // only in letter case" are two names that the import's naming rule makes alike: "A b" and "a_b"
    // become A_b and a_b, "x y" and "x_Y" become x_y and x_Y. In SQL's order a capital comes before a
    // lower-case letter, and a space before an underscore, so the first pair meets the capital first and
    // the second the lower case first.
    const SQL = `
        create table "" (n integer);
        insert into "" values (0);
        create table "A b" (n integer);
        insert into "A b" values (1);
        create table "a_b" (n integer);
        insert into "a_b" values (2);
        create table "x y" (n integer);
        insert into "x y" values (3);
        create table "x_Y" (n integer);
        insert into "x_Y" values (4);
    `;
    const NAMES = ["", "A b", "a_b", "x y", "x_Y"];

    test("the dialog lists them in SQL's order, the empty name first", async ({ app }) => {
        await madeDatabase(app, SQL);
        await app.openTables();
        await app.waitCounted();
        expect((await app.tablesRows()).map((row) => row.name)).toEqual(NAMES);
    });

    test("alone, each is saved under its own cleaned name, and an empty name as table.csv", async ({ app }) => {
        const alone = [
            ["", "table.csv", 0],
            ["A b", "A_b.csv", 1],
            ["a_b", "a_b.csv", 2],
            ["x y", "x_y.csv", 3],
            ["x_Y", "x_Y.csv", 4],
        ];
        await madeDatabase(app, SQL);
        for (const [name, fileName, n] of alone) {
            expect(fileNameAlone(name), name).toBe(fileName);
            const file = await app.exportTables([name]);
            expect(file.name, name).toBe(fileName);
            expect(file.text, name).toBe(`${BOM}n\r\n${n}\r\n`);
            if (await app.tablesDialog.isVisible()) {
                await app.tablesCancel.click();
            }
            await expect(app.tablesDialog).toBeHidden();
        }
    });

    test("together in a zip, the second of each pair takes _2 with its own letter case, in the dialog's order", async ({ app, page }) => {
        await madeDatabase(app, SQL);
        await app.openTables();
        await app.waitCounted();
        await app.tablesAll.check();
        // each row says the file it is saved as, when that is not <name>.csv
        const saved = (name) => app.tablesRow(name).locator(".tables-row-saved");
        await expect(saved("")).toHaveText(words.exportTablesSavedAsText("table.csv"));
        await expect(saved("A b")).toHaveText(words.exportTablesSavedAsText("A_b.csv"));
        await expect(saved("a_b")).toHaveText(words.exportTablesSavedAsText("a_b_2.csv"));
        await expect(saved("x y")).toHaveText(words.exportTablesSavedAsText("x_y.csv"));
        await expect(saved("x_Y")).toHaveText(words.exportTablesSavedAsText("x_Y_2.csv"));
        const file = await app.download(() => app.tablesSubmit.click());
        expect(file.name).toBe("made-tables.zip");
        expect(readZip(file.buffer).map((entry) => [entry.name, entry.bytes.toString("utf8")])).toEqual([
            ["table.csv", `${BOM}n\r\n0\r\n`],
            ["A_b.csv", `${BOM}n\r\n1\r\n`],
            ["a_b_2.csv", `${BOM}n\r\n2\r\n`],
            ["x_y.csv", `${BOM}n\r\n3\r\n`],
            ["x_Y_2.csv", `${BOM}n\r\n4\r\n`],
        ]);
        const events = await eventsOfOpen(page);
        expect(events[0].lines.slice(1)).toEqual([
            "table: , 1 rows, table.csv",
            "table: A b, 1 rows, A_b.csv",
            "table: a_b, 1 rows, a_b_2.csv",
            "table: x y, 1 rows, x_y.csv",
            "table: x_Y, 1 rows, x_Y_2.csv",
        ]);
    });
});

// ---- three hundred small tables --------------------------------------------------------------------------------------

test.describe("three hundred small tables", () => {
    const COUNT = 300;
    const name = (n) => `t${String(n).padStart(3, "0")}`;
    const SQL = Array.from({ length: COUNT }, (unused, i) => `create table ${name(i + 1)} (v integer); insert into ${name(i + 1)} values (${i + 1}), (${(i + 1) * 2});`).join("\n");

    test("a zip of 300 entries, each with its own rows, and an event of 200 lines: the file's first, the plan's note last", async ({ app, page }) => {
        test.slow();
        await madeDatabase(app, SQL);
        const file = await app.exportTables("all");
        expect(file.name).toBe("made-tables.zip");
        const entries = readZip(file.buffer);
        expect(entries).toHaveLength(COUNT);
        expect(entries.map((entry) => entry.name)).toEqual(Array.from({ length: COUNT }, (unused, i) => `${name(i + 1)}.csv`));
        for (const [i, entry] of entries.entries()) {
            expect(entry.bytes.toString("utf8"), entry.name).toBe(`${BOM}v\r\n${i + 1}\r\n${(i + 1) * 2}\r\n`);
        }
        await expect(app.toast).toContainText(words.exportedTablesMessage(file.name, { tables: COUNT }));
        const events = await eventsOfOpen(page);
        expect(events).toHaveLength(1);
        const lines = events[0].lines;
        // 301 lines were written: the event keeps the file's and the first 198 tables', and says how many it left out
        expect(lines).toHaveLength(200);
        expect(lines[0]).toBe(words.exportEventFileLine(file.name, file.buffer.length));
        expect(lines[1]).toBe(words.exportEventTableLine(name(1), 2, `${name(1)}.csv`));
        expect(lines[198]).toBe(words.exportEventTableLine(name(198), 2, `${name(198)}.csv`));
        expect(lines[199]).toBe("(102 more lines are not listed)");
        expect(lines.filter((line) => line.startsWith("table: "))).toHaveLength(198);
    });

    test("the evidence file holds that event, with its last line, and verifies", async ({ app }) => {
        test.slow();
        await madeDatabase(app, SQL);
        await app.exportTables("all");
        const evidence = await app.exportEvidence(STUDENT);
        expect(evidence.text).toContain("\n(102 more lines are not listed)\n");
        expect(evidence.text).toContain(`\ntable: ${name(198)}, 2 rows, ${name(198)}.csv\n`);
        expect(evidence.text).not.toContain(`table: ${name(199)}`);
        const { verifyEvidence } = await load("evidence.js");
        expect(await verifyEvidence(evidence.text)).toMatchObject({ status: "valid", student: STUDENT, queries: 0, events: 1 });
    });
});

// ---- the evidence ----------------------------------------------------------------------------------------------------------

test.describe("the evidence file holds an export as an event", () => {
    test("after one export the file is version 2, lists the export with its lines before the query, and verifies", async ({ app, page }) => {
        await openEdgeCases(app);
        const exported = await app.exportTables(["dates_iso", "basic"]);
        expect(exported.name).toBe("export_edge_cases-tables.zip");
        await app.run("select count(*) from basic");
        const evidence = await app.exportEvidence(STUDENT);
        const lines = evidence.text.split("\n");
        expect(lines[0]).toMatch(/evidence export v2$/);
        const headers = lines.filter((line) => /^\[\d+\] /.test(line));
        expect(headers).toHaveLength(2);
        expect(headers[0]).toMatch(/^\[1\] \S+ · event: export$/);
        expect(headers[1]).toMatch(/^\[2\] \S+ · /);
        expect(headers[1]).not.toContain("event:");
        // the lines of the event: the file with its size, then each table with its rows and its entry
        const event = [
            words.exportEventFileLine("export_edge_cases-tables.zip", exported.buffer.length),
            words.exportEventTableLine("basic", 5, "basic.csv"),
            words.exportEventTableLine("dates_iso", 4, "dates_iso.csv"),
        ];
        expect(event).toEqual([`file: export_edge_cases-tables.zip, ${exported.buffer.length} bytes`, "table: basic, 5 rows, basic.csv", "table: dates_iso, 4 rows, dates_iso.csv"]);
        expect(evidence.text).toContain(`${headers[0]}\n${event.join("\n")}\n`);
        expect(evidence.text.indexOf("event: export")).toBeLessThan(evidence.text.indexOf("select count(*) from basic"));
        const { verifyEvidence } = await load("evidence.js");
        expect(await verifyEvidence(evidence.text)).toMatchObject({ status: "valid", student: STUDENT, queries: 1, events: 1 });
        // and the verify page says the same of the file as it was saved
        await page.goto("verify.html");
        await page.locator("#evidence-file").setInputFiles({ name: evidence.name, mimeType: "text/plain", buffer: evidence.buffer });
        const result = page.locator("#verify-result");
        await expect(result).toContainText("VALID");
        await expect(result).not.toContainText("EDITED");
        expect(await result.locator("dt").allTextContents()).toEqual(["Student number", "Queries", "Events", "Exported", "Dataset"]);
        const values = await result.locator("dd").allTextContents();
        expect(values.slice(0, 3)).toEqual([STUDENT, "1", "1"]);
        expect(values[4]).toBe("file:export_edge_cases.db");
    });

    test("a single file's event has the file line and the table line, and the file with a row count changed afterwards is not valid", async ({ app }) => {
        await openEdgeCases(app);
        const exported = await app.exportTables(["basic"]);
        const evidence = await app.exportEvidence(STUDENT);
        expect(evidence.text).toContain(`event: export\nfile: basic.csv, ${exported.buffer.length} bytes\ntable: basic, 5 rows\n`);
        const { verifyEvidence } = await load("evidence.js");
        expect(await verifyEvidence(evidence.text)).toMatchObject({ status: "valid", events: 1 });
        // (a row count that is changed in the file is caught: the event is part of what the checksum covers)
        const changed = evidence.text.replace("table: basic, 5 rows", "table: basic, 6 rows");
        expect(changed).not.toBe(evidence.text);
        expect((await verifyEvidence(changed)).status).toBe("edited");
    });

    test("an export that failed leaves no event in the file", async ({ app, page }) => {
        // (a view that fails when it is read, so that the export stops; the file holds no event and verifies)
        await madeDatabase(
            app,
            "create table alpha (a integer); insert into alpha values (1); create view bad as select abs(-9223372036854775807 - 1) as x union all select 1;"
        );
        await app.openTables();
        await app.waitCounted();
        await app.tickTables(["alpha", "bad"]);
        await app.tablesSubmit.click();
        await expect(app.tablesError).toBeVisible();
        await app.tablesCancel.click();
        await expect(app.tablesDialog).toBeHidden();
        await app.run("select count(*) from alpha");
        const evidence = await app.exportEvidence(STUDENT);
        expect(evidence.text).not.toContain("event: export");
        expect(evidence.text).not.toContain("table: ");
        const { verifyEvidence } = await load("evidence.js");
        expect(await verifyEvidence(evidence.text)).toMatchObject({ status: "valid", queries: 1 });
        expect(await eventsOfOpen(page)).toEqual([]);
    });
});

// ---- the bytes of a text that has U+FEFF in it ----------------------------------------------------------------------

// The three bytes of U+FEFF in UTF-8. They start every file, and they are also what a text, a
// column name or a table name that holds U+FEFF is written with. (Expected files below are put
// together from typed bytes and typed text, and compared as bytes.)
const MARK = Buffer.from([0xef, 0xbb, 0xbf]);
const bytesOf = (...parts) => Buffer.concat(parts.map((part) => (Buffer.isBuffer(part) ? part : Buffer.from(part, "utf8"))));
const hexOf = (bytes) => bytes.toString("hex");

test.describe("a database made in the test: U+FEFF at the start of a text, of a column name and of a table name is kept", () => {
    // (U+FEFF is the byte-order mark when it starts a file; inside a text it is a character like another)
    const SQL = `
        create table marks (id integer primary key, v);
        insert into marks values (1, char(65279) || 'bom'), (2, 'mid' || char(65279) || 'bom'), (3, char(65279));
        create table headed ("\uFEFFa", b);
        insert into headed values (1, 2);
        create table "\uFEFFfirst" (n integer);
        insert into "\uFEFFfirst" values (7);
    `;

    test("a text that starts with U+FEFF keeps it after the comma, so does one that has it in the middle, and a text of U+FEFF alone is that character", async ({ app }) => {
        await madeDatabase(app, SQL);
        const file = await app.exportTables(["marks"]);
        expect(file.name).toBe("marks.csv");
        expect(hexOf(file.buffer)).toBe(hexOf(bytesOf(MARK, "id,v\r\n1,", MARK, "bom\r\n2,mid", MARK, "bom\r\n3,", MARK, "\r\n")));
    });

    test("a column whose name starts with U+FEFF keeps it in the header, after the mark that starts the file", async ({ app }) => {
        await madeDatabase(app, SQL);
        const file = await app.exportTables(["headed"]);
        expect(file.name).toBe("headed.csv");
        expect(hexOf(file.buffer)).toBe(hexOf(bytesOf(MARK, MARK, "a,b\r\n1,2\r\n")));
    });

    test("a table whose name starts with U+FEFF is listed with it, counted, and exported to _first.csv", async ({ app, page }) => {
        await madeDatabase(app, SQL);
        await app.openTables();
        await app.waitCounted();
        // (the names are read from the page's text as it is: a test locator trims U+FEFF off a name)
        // (SQL's order is by bytes, and the three bytes of U+FEFF come after every ASCII letter)
        expect(await app.tablesRows()).toEqual([
            { name: "headed", kind: "table", line: words.exportTablesRowsText(1), ticked: false, tickable: true },
            { name: "marks", kind: "table", line: words.exportTablesRowsText(3), ticked: false, tickable: true },
            { name: "\uFEFFfirst", kind: "table", line: words.exportTablesRowsText(1), ticked: false, tickable: true },
        ]);
        await app.tablesCancel.click();
        await expect(app.tablesDialog).toBeHidden();
        const file = await app.exportTables(["\uFEFFfirst"]);
        expect(file.name).toBe("_first.csv");
        expect(hexOf(file.buffer)).toBe(hexOf(bytesOf(MARK, "n\r\n7\r\n")));
        const events = await eventsOfOpen(page);
        expect(events).toHaveLength(1);
        expect(events[0].lines).toEqual([words.exportEventFileLine("_first.csv", file.buffer.length), words.exportEventTableLine("\uFEFFfirst", 1)]);
    });
});

// ---- a table of one column ------------------------------------------------------------------------------------------

test.describe("a database made in the test: a table of one column whose values are NULL or empty", () => {
    // With one column a record is that one field, and a NULL and an empty text are written as an
    // empty field: the record is an empty line. Most programs skip an empty line when they read a
    // file, the import here too, so these rows do not come back. It is a known loss, and the plan's
    // section 5 lists it under what comes back.
    const SQL = `
        create table one (x);
        insert into one values (1), (null), (''), (2);
        create table empties (x);
        insert into empties values (null), (null);
    `;

    test("a NULL and an empty text are each an empty line", async ({ app }) => {
        await madeDatabase(app, SQL);
        const file = await app.exportTables(["one"]);
        expect(file.name).toBe("one.csv");
        expect(hexOf(file.buffer)).toBe(hexOf(bytesOf(MARK, "x\r\n1\r\n\r\n\r\n2\r\n")));
    });

    test("imported again, the two rows that are not empty come back and the two empty ones do not (a known loss)", async ({ app }) => {
        await madeDatabase(app, SQL, { address: ROUND_TRIP_URL });
        const { before, after } = await roundTrip(app, "one");
        expect(before.rows).toEqual([["integer:1"], ["null"], ["text:"], ["integer:2"]]);
        expect(after.columns).toEqual(["x"]);
        expect(after.rows).toEqual([["integer:1"], ["integer:2"]]);
    });

    test("a table of one column of NULLs only is its header and one empty line for each row", async ({ app }) => {
        await madeDatabase(app, SQL);
        const file = await app.exportTables(["empties"]);
        expect(file.name).toBe("empties.csv");
        expect(hexOf(file.buffer)).toBe(hexOf(bytesOf(MARK, "x\r\n\r\n\r\n")));
    });

    test("imported again, a table of one column of NULLs only comes back as a table with that column and no rows (a known loss)", async ({ app }) => {
        await madeDatabase(app, SQL, { address: ROUND_TRIP_URL });
        const { after } = await roundTrip(app, "empties");
        // (the file reads as a header and empty lines, and the import leaves the empty lines out)
        expect(after).toEqual({ columns: ["x"], rows: [] });
    });
});

// ---- what the reader asks the engine -------------------------------------------------------------------------------------

test.describe("a database made in the test: names with a double quote, a name that starts with sqlite, an index and a trigger", () => {
    const SQL = `
        create table "a""b" (id integer primary key, t text);
        insert into "a""b" values (1, 'one'), (2, 'two');
        create table counter (id integer primary key autoincrement, n);
        insert into counter (n) values (5);
        create table sqlite3notes (note text);
        insert into sqlite3notes values ('n');
        create table plain (x integer);
        insert into plain values (1), (2), (3);
        create index plain_x on plain (x);
        create table journal (x integer);
        create trigger plain_after after insert on plain begin insert into journal values (new.x); end;
        create view v_plain as select x from plain;
    `;

    test("the database holds an index, a trigger and the table of the sequence, and the list has tables and views only, a name that starts with sqlite3 among them", async ({ app }) => {
        await madeDatabase(app, SQL);
        expect(await app.rows("select type, name from sqlite_schema where type in ('index', 'trigger') or name like 'sqlite\\_%' escape '\\' order by name")).toEqual([
            ["trigger", "plain_after"],
            ["index", "plain_x"],
            ["table", "sqlite_sequence"],
        ]);
        await app.openTables();
        await app.waitCounted();
        expect((await app.tablesRows()).map((row) => [row.name, row.kind, row.line])).toEqual([
            ['a"b', "table", words.exportTablesRowsText(2)],
            ["counter", "table", words.exportTablesRowsText(1)],
            ["journal", "table", words.exportTablesRowsText(0)],
            ["plain", "table", words.exportTablesRowsText(3)],
            ["sqlite3notes", "table", words.exportTablesRowsText(1)],
            ["v_plain", "view", words.exportTablesRowsText(3)],
        ]);
    });

    test('a table whose name holds a double quote is counted and exported: a_b.csv, with its two rows', async ({ app, page }) => {
        await madeDatabase(app, SQL);
        await app.openTables();
        await app.waitCounted();
        await app.tickTables(['a"b']);
        const file = await pressExport(app, page);
        expect(file.name).toBe("a_b.csv");
        expect(hexOf(file.buffer)).toBe(hexOf(bytesOf(MARK, "id,t\r\n1,one\r\n2,two\r\n")));
        const events = await eventsOfOpen(page);
        expect(events).toHaveLength(1);
        expect(events[0].lines).toEqual([words.exportEventFileLine("a_b.csv", file.buffer.length), words.exportEventTableLine('a"b', 2)]);
    });

    test("a table called sqlite3notes is exported", async ({ app }) => {
        await madeDatabase(app, SQL);
        const file = await app.exportTables(["sqlite3notes"]);
        expect(file.name).toBe("sqlite3notes.csv");
        expect(hexOf(file.buffer)).toBe(hexOf(bytesOf(MARK, "note\r\nn\r\n")));
    });
});

// ---- virtual tables, an attached database, a TEMP table ----------------------------------------------------------------

test.describe("a database made in the test: a virtual table, an attached database and a TEMP table", () => {
    // fts5 keeps its words in tables of its own (f_config, f_content, f_data, f_docsize, f_idx): they
    // are tables of the database, and are listed and exported like any. A table of an attached
    // database and a TEMP table are not the database's own, and are not listed.
    const SQL = `
        create virtual table f using fts5(a, b);
        insert into f values ('hello', 'world');
    `;
    const NAMES = ["f", "f_config", "f_content", "f_data", "f_docsize", "f_idx"];
    // (the word index, the sizes of the documents and the table of blocks are binary)
    const BLOBBERS = ["f_data", "f_docsize", "f_idx"];

    async function addOthers(app) {
        await app.rows("attach ':memory:' as other");
        await app.rows("create table other.z (q integer)");
        await app.rows("insert into other.z values (1)");
        await app.rows("create temp table scratch (y integer)");
        await app.rows("insert into scratch values (1)");
    }

    test("the list has the fts5 table and the five tables its module keeps, and neither the attached table nor the TEMP one", async ({ app }) => {
        await madeDatabase(app, SQL);
        await addOthers(app);
        expect(await app.rows("select count(*) from other.z")).toEqual([[1]]);
        expect(await app.rows("select count(*) from scratch")).toEqual([[1]]);
        await app.openTables();
        await app.waitCounted();
        const rows = await app.tablesRows();
        expect(rows.map((row) => [row.name, row.kind])).toEqual(NAMES.map((name) => [name, "table"]));
        expect(rows.every((row) => row.tickable && /^\d+ rows?$/.test(row.line))).toBe(true);
        expect(rows[0].line).toBe(words.exportTablesRowsText(1));
    });

    test("the fts5 table and one of its tables are exported with their rows", async ({ app }) => {
        await madeDatabase(app, SQL);
        await addOthers(app);
        const virtual = await app.exportTables(["f"]);
        expect(virtual.name).toBe("f.csv");
        expect(hexOf(virtual.buffer)).toBe(hexOf(bytesOf(MARK, "a,b\r\nhello,world\r\n")));
        await expect(app.tablesDialog).toBeHidden();
        const config = await app.exportTables(["f_config"]);
        expect(config.name).toBe("f_config.csv");
        expect(hexOf(config.buffer)).toBe(hexOf(bytesOf(MARK, "k,v\r\nversion,4\r\n")));
    });

    test("all of them together are a zip of the six, and the note names the three that hold a BLOB", async ({ app }) => {
        await madeDatabase(app, SQL);
        await addOthers(app);
        const file = await app.exportTables("all");
        expect(file.name).toBe("made-tables.zip");
        const entries = readZip(file.buffer);
        expect(entries.map((entry) => entry.name)).toEqual(NAMES.map((name) => `${name}.csv`));
        expect(entries[0].bytes.toString("hex")).toBe(hexOf(bytesOf(MARK, "a,b\r\nhello,world\r\n")));
        expect(entries[2].bytes.toString("hex")).toBe(hexOf(bytesOf(MARK, "id,c0,c1\r\n1,hello,world\r\n")));
        await expect(app.tablesNote).toHaveText(words.exportTablesBlobNote("made-tables.zip", BLOBBERS));
    });
});

// ---- cases that were met, and are written down ---------------------------------------------------------------------------

test.describe("a database made in the test: two columns of one name, a NUL in a text, a text that is not UTF-8, a name of 300 characters", () => {
    const LONG = "n".repeat(300);
    const LONG_FILE = `${"n".repeat(100)}.csv`;
    const SQL = `
        create view twins as select 1 as a, 2 as a, 3 as "A";
        create table with_nul (id integer primary key, v);
        insert into with_nul values (1, 'a' || char(0) || 'b');
        create table not_utf8 (id integer primary key, v);
        insert into not_utf8 values (1, cast(x'ff41' as text));
        create table "${LONG}" (v integer);
        insert into "${LONG}" values (1);
        create table "${"n".repeat(299)}m" (v integer);
        insert into "${"n".repeat(299)}m" values (2);
        create table small (v integer);
        insert into small values (3);
    `;

    test("a view with two columns of one name has the header the engine gives: a, a:1, A:2", async ({ app }) => {
        await madeDatabase(app, SQL);
        const file = await app.exportTables(["twins"]);
        expect(file.name).toBe("twins.csv");
        expect(hexOf(file.buffer)).toBe(hexOf(bytesOf(MARK, "a,a:1,A:2\r\n1,2,3\r\n")));
    });

    test("a NUL character inside a text is written as it is: 61 00 62", async ({ app }) => {
        await madeDatabase(app, SQL);
        const file = await app.exportTables(["with_nul"]);
        expect(hexOf(file.buffer)).toBe(hexOf(bytesOf(MARK, "id,v\r\n1,", Buffer.from([0x61, 0x00, 0x62]), "\r\n")));
    });

    test("a text that is not valid UTF-8 comes out with EF BF BD in place of the bad byte", async ({ app }) => {
        await madeDatabase(app, SQL);
        const file = await app.exportTables(["not_utf8"]);
        expect(hexOf(file.buffer)).toBe(hexOf(bytesOf(MARK, "id,v\r\n1,", Buffer.from([0xef, 0xbf, 0xbd, 0x41]), "\r\n")));
    });

    test("a table whose name is 300 characters long is saved under a name of 104: 100 characters and .csv, and the event has that name", async ({ app, page }) => {
        await madeDatabase(app, SQL);
        const file = await app.exportTables([LONG]);
        expect(file.name).toHaveLength(104);
        expect(file.name).toBe(LONG_FILE);
        expect(hexOf(file.buffer)).toBe(hexOf(bytesOf(MARK, "v\r\n1\r\n")));
        const events = await eventsOfOpen(page);
        expect(events).toHaveLength(1);
        expect(events[0].lines).toEqual([words.exportEventFileLine(LONG_FILE, file.buffer.length), words.exportEventTableLine(LONG, 1)]);
    });

    test("in a zip two such names that are alike in their first 100 characters are n..n.csv and n..n_2.csv, and the event has the entry names", async ({ app, page }) => {
        await madeDatabase(app, SQL);
        const file = await app.exportTables([`${"n".repeat(299)}m`, LONG, "small"]);
        expect(file.name).toBe("made-tables.zip");
        const entries = readZip(file.buffer);
        // (the shorter name comes first in SQL's order, so it keeps the plain name)
        expect(entries.map((entry) => [entry.name, entry.bytes.toString("hex")])).toEqual([
            [LONG_FILE, hexOf(bytesOf(MARK, "v\r\n2\r\n"))],
            [`${"n".repeat(100)}_2.csv`, hexOf(bytesOf(MARK, "v\r\n1\r\n"))],
            ["small.csv", hexOf(bytesOf(MARK, "v\r\n3\r\n"))],
        ]);
        const events = await eventsOfOpen(page);
        expect(events[0].lines.slice(1)).toEqual([
            words.exportEventTableLine(`${"n".repeat(299)}m`, 1, LONG_FILE),
            words.exportEventTableLine(LONG, 1, `${"n".repeat(100)}_2.csv`),
            words.exportEventTableLine("small", 1, "small.csv"),
        ]);
    });

    test("a table whose name holds a line break is saved as line_break.csv, and the event names it on one line, with _ where the break was", async ({ app, page }) => {
        const name = "line\nbreak";
        await madeDatabase(app, `create table "${name}" (v); insert into "${name}" values (1);`);
        await app.openTables();
        await app.waitCounted();
        expect((await app.tablesRows()).map((row) => row.name)).toEqual([name]);
        await app.tablesCancel.click();
        const file = await app.exportTables([name]);
        expect(file.name).toBe("line_break.csv");
        expect(hexOf(file.buffer)).toBe(hexOf(bytesOf(MARK, "v\r\n1\r\n")));
        const events = await eventsOfOpen(page);
        expect(events).toHaveLength(1);
        // (typed: the lines are what a marker reads, and neither holds a line break)
        expect(events[0].lines).toEqual(["file: line_break.csv, 9 bytes", "table: line_break, 1 rows"]);
    });
});

// ---- a name so long that the event's line is cut -------------------------------------------------------------------------------

test.describe("a database made in the test: a table whose name is so long that its line in the event is cut at the length an event's line may have", () => {
    // An event's line holds at most EVENT_MAX_LINE_CHARS characters; a longer one loses its end and
    // ends in the cut mark. The line of a table is "table: <name>, <rows> rows" (the name and 15
    // characters), and in a zip the name of its entry follows (", " and up to 104 characters more).
    // The file's own name is cut to 100 characters, so the line of a file is never cut.
    const CUT = "\u2026";
    const ALONE = "a".repeat(490);
    const IN_ZIP = "b".repeat(400);
    const SQL = `
        create table "${ALONE}" (v integer);
        insert into "${ALONE}" values (1);
        create table "${IN_ZIP}" (v integer);
        insert into "${IN_ZIP}" values (2);
        create table small (v integer);
        insert into small values (3);
    `;
    const cutLine = (line) => `${line.slice(0, words.EVENT_MAX_LINE_CHARS - CUT.length)}${CUT}`;

    async function expectEvidenceHolds(app, lines) {
        const evidence = await app.exportEvidence(STUDENT);
        for (const line of lines) {
            expect(evidence.text, `the evidence file holds the line ${line.slice(0, 40)}...`).toContain(`\n${line}\n`);
        }
        const { verifyEvidence } = await load("evidence.js");
        expect(await verifyEvidence(evidence.text)).toMatchObject({ status: "valid", student: STUDENT, queries: 0, events: 1 });
    }

    test("a table whose name has 490 characters, exported alone: its line is cut to EVENT_MAX_LINE_CHARS and ends in the cut mark, the file's line is whole, and the evidence file verifies", async ({ app, page }) => {
        await madeDatabase(app, SQL);
        const file = await app.exportTables([ALONE]);
        expect(file.name).toBe(`${"a".repeat(100)}.csv`);
        const events = await eventsOfOpen(page);
        expect(events, "the export is recorded as one event, its long line cut and not refused").toHaveLength(1);
        const whole = words.exportEventTableLine(ALONE, 1);
        expect(whole.length, "the line of the table, whole, is longer than an event's line may be").toBeGreaterThan(words.EVENT_MAX_LINE_CHARS);
        const [fileLine, tableLine] = events[0].lines;
        expect(fileLine).toBe(words.exportEventFileLine(file.name, file.buffer.length));
        expect(tableLine, "the line of the table").toHaveLength(words.EVENT_MAX_LINE_CHARS);
        expect(tableLine.endsWith(CUT), "the line of the table ends in the cut mark").toBe(true);
        expect(tableLine).toBe(cutLine(whole));
        expect(events[0].lines).toHaveLength(2);
        await expectEvidenceHolds(app, [fileLine, tableLine]);
    });

    test("two tables, one with a name of 400 characters, exported together: the line of the long one, with its entry's name, is cut; the other's line and the file's are whole; the evidence file verifies", async ({ app, page }) => {
        await madeDatabase(app, SQL);
        const file = await app.exportTables([IN_ZIP, "small"]);
        expect(file.name).toBe("made-tables.zip");
        const events = await eventsOfOpen(page);
        expect(events, "the export is recorded as one event, its long line cut and not refused").toHaveLength(1);
        const entryName = `${"b".repeat(100)}.csv`;
        const whole = words.exportEventTableLine(IN_ZIP, 1, entryName);
        expect(whole.length, "the line of the table, whole, is longer than an event's line may be").toBeGreaterThan(words.EVENT_MAX_LINE_CHARS);
        expect(events[0].lines).toHaveLength(3);
        const [fileLine, tableLine, smallLine] = events[0].lines;
        expect(fileLine).toBe(words.exportEventFileLine(file.name, file.buffer.length));
        expect(tableLine, "the line of the long table").toHaveLength(words.EVENT_MAX_LINE_CHARS);
        expect(tableLine.endsWith(CUT), "the line of the long table ends in the cut mark").toBe(true);
        expect(tableLine).toBe(cutLine(whole));
        expect(smallLine).toBe(words.exportEventTableLine("small", 1, "small.csv"));
        await expectEvidenceHolds(app, [fileLine, tableLine, smallLine]);
    });
});

// ---- the names of the columns are the results pane's ------------------------------------------------------------------

test.describe("a database made in the test: the names of the columns follow the results pane", () => {
    // The two old pragmas full_column_names and short_column_names change the names the engine gives
    // for select *, and with them the header of the results pane. The header of the file is made by
    // the same statement, so it is what the pane shows, whatever the connection is set to.
    const SQL = `
        create table t (a, "B c");
        insert into t values (1, 2);
        create view v as select a, "B c" from t;
    `;

    for (const name of ["t", "v"]) {
        test(`after the two pragmas, the header of the file of ${name} is the header the results pane shows for select * from ${name}`, async ({ app }) => {
            await madeDatabase(app, SQL);
            await app.rows("pragma full_column_names = 1");
            await app.rows("pragma short_column_names = 0");
            const pane = await app.query(`select * from ${name}`);
            // (the pragmas did change the pane's header, or the two would be alike for no reason)
            expect(pane.columns).not.toEqual(["a", "B c"]);
            expect(pane.columns).toHaveLength(2);
            const file = await app.exportTables([name]);
            expect(file.text.split("\r\n")[0]).toBe(`${BOM}${pane.columns.join(",")}`);
        });
    }
});

// ---- an export never writes to the database -----------------------------------------------------------------------------

test.describe("an export leaves the database as it was", () => {
    const SQL = `
        create table alpha (a integer);
        insert into alpha values (1), (2);
        create table omega (z text);
        insert into omega values ('last');
        create view both_of_them as select a, z from alpha, omega;
    `;

    test("after one table is exported as a CSV, the content of the database is what it was", async ({ app, page }) => {
        await madeDatabase(app, SQL);
        const before = await databaseFingerprint(page);
        expect(before.userVersion).toBe(0);
        const file = await app.exportTables(["alpha"]);
        expect(file.name).toBe("alpha.csv");
        expect(await databaseFingerprint(page)).toEqual(before);
    });

    test("after several tables are exported as a zip, the content of the database is what it was", async ({ app, page }) => {
        await madeDatabase(app, SQL);
        const before = await databaseFingerprint(page);
        const file = await app.exportTables("all");
        expect(readZip(file.buffer)).toHaveLength(3);
        expect(await databaseFingerprint(page)).toEqual(before);
    });
});

// ---- the zip the page makes -------------------------------------------------------------------------------------------------

// Presses Export and gives the file that is saved, as app.download does. When the dialog shows its alert
// line instead, it fails with what the alert says (and does not wait for a file that is not coming).
async function pressExport(app, page) {
    const saved = page.waitForEvent("download");
    const said = app.tablesError.waitFor({ state: "visible" }).then(() => null);
    saved.catch(() => {});
    said.catch(() => {});
    await app.tablesSubmit.click();
    const download = await Promise.race([saved, said]);
    if (!download) {
        throw new Error(`nothing was saved, and the dialog says: ${await app.tablesError.textContent()}`);
    }
    const chunks = [];
    for await (const chunk of await download.createReadStream()) {
        chunks.push(chunk);
    }
    return { name: download.suggestedFilename(), buffer: Buffer.concat(chunks) };
}

test.describe("the zip the page makes", () => {
    const SQL = `
        create table alpha (a integer);
        insert into alpha values (1), (2);
        create table omega (z text);
        insert into omega values ('last');
    `;

    test("every entry of the zip of fourteen is deflated, and dated within a minute of the page's clock", async ({ app, page }) => {
        test.slow();
        await openEdgeCases(app);
        const file = await app.exportTables("all");
        const now = await page.evaluate(() => Date.now());
        const entries = readZip(file.buffer);
        expect(entries).toHaveLength(14);
        for (const entry of entries) {
            expect(entry.method, `${entry.name}: method (8 is deflated)`).toBe(8);
            expect(entry.mtime, `${entry.name}: date`).not.toBeNull();
            expect(Math.abs(entry.mtime.getTime() - now), `${entry.name}: milliseconds from the page's clock`).toBeLessThan(60_000);
        }
        // (and the entries are made smaller: the zip is shorter than the files it holds)
        expect(file.buffer.length).toBeLessThan(entries.reduce((sum, entry) => sum + entry.bytes.length, 0));
    });

    // The zip keeps the year of an entry's date from 1980 to 2099. A computer whose clock is outside
    // that still gets its zip, with the dates at the nearer end.
    for (const [clock, year, nearest] of [
        ["1975-03-01T12:00:00", 1975, new Date(1980, 0, 1, 0, 0, 0)],
        ["2105-03-01T12:00:00", 2105, new Date(2099, 11, 31, 23, 59, 58)],
    ]) {
        test(`with the page's clock in ${year}, a zip of two tables is still made, and its entries are dated ${nearest.getFullYear()}`, async ({ app, page }) => {
            await madeDatabase(app, SQL);
            await page.clock.setFixedTime(new Date(clock));
            expect(await page.evaluate(() => new Date().getFullYear())).toBe(year);
            await app.openTables();
            await app.waitCounted();
            await app.tablesAll.check();
            const file = await pressExport(app, page);
            expect(file.name).toBe("made-tables.zip");
            const entries = readZip(file.buffer);
            expect(entries.map((entry) => [entry.name, entry.method, entry.mtime?.getTime()])).toEqual([
                ["alpha.csv", 8, nearest.getTime()],
                ["omega.csv", 8, nearest.getTime()],
            ]);
        });
    }
});

// ---- a BLOB counts towards a piece ------------------------------------------------------------------------------------------------

test.describe("a database made in the test: what a row weighs in a piece (large BLOBs, numbers, NULLs)", () => {
    const ROWS = 5;
    const tableOf = (bytes) => `
        create table big (id integer primary key, b blob);
        ${Array.from({ length: ROWS }, (unused, i) => `insert into big values (${i + 1}, zeroblob(${bytes}));`).join("\n")}
    `;

    // Exports the table "big" with the page's clock held, and gives the progress line as it was
    // after each piece. The progress line says how many rows have been written, and changes after
    // each piece. The clock is held while the export runs, so that no piece ends because its
    // milliseconds are used up: the pieces are those of the characters alone.
    async function progressOfTable(app, page, sql, table) {
        await madeDatabase(app, sql);
        await app.openTables();
        await app.waitCounted();
        await app.tickTables([table]);
        await page.evaluate(() => {
            const part = document.querySelector("#export-tables-dialog .results-loading-size");
            const seen = [];
            window.__progress = seen;
            window.__progressWatch = new MutationObserver(() => {
                if (part.textContent) {
                    seen.push(part.textContent);
                }
            });
            window.__progressWatch.observe(part, { childList: true, characterData: true, subtree: true });
            const held = performance.now();
            window.__now = performance.now;
            performance.now = () => held;
        });
        try {
            await app.download(() => app.tablesSubmit.click());
        } finally {
            await page.evaluate(() => {
                performance.now = window.__now;
                window.__progressWatch.disconnect();
            });
        }
        const seen = await page.evaluate(() => window.__progress);
        // (the line before the first piece is replaced in the same turn as the piece's own: it is not seen)
        return seen.filter((text, i) => text !== seen[i - 1]);
    }
    const progressOfPieces = (app, page, bytes) => progressOfTable(app, page, tableOf(bytes), "big");

    test("is read in a piece for each row, whatever the speed of the machine: a BLOB of 100,000 bytes weighs more than a piece", async ({ app, page }) => {
        const once = await progressOfPieces(app, page, 100000);
        expect(once).toEqual(Array.from({ length: ROWS }, (unused, i) => words.exportTablesProgressRows(i + 1, ROWS)));
    });

    test("a BLOB weighs twice its bytes in a piece: of 40,000 bytes each (80,000, over the 65,536 of a piece) it is a piece for each row, where once its bytes two rows would share one", async ({ app, page }) => {
        // (the size is chosen against the piece: the bytes of a row alone are under it, twice the
        // bytes are over it, and the bytes of two rows are over it too)
        expect(40000).toBeLessThan(words.EXPORT_PIECE_CHARS);
        expect(2 * 40000).toBeGreaterThan(words.EXPORT_PIECE_CHARS);
        const once = await progressOfPieces(app, page, 40000);
        expect(once).toEqual(Array.from({ length: ROWS }, (unused, i) => words.exportTablesProgressRows(i + 1, ROWS)));
    });

    // What the reader (js/lab/export-read.js) counts for a value in a piece: a number is 20
    // characters (whatever its digits), a NULL is 1. A piece ends with the row that uses the budget
    // up, EXPORT_PIECE_CHARS, or passes it. These two numbers are the reader's own, typed here: the
    // plan says only that a piece is of a size.
    const NUMBER_WEIGHT = 20;
    const NULL_WEIGHT = 1;
    const tableOfRows = (column, value, rows) => `
        create table nums (v ${column});
        with recursive s(n) as (select 1 union all select n + 1 from s where n < ${rows}) insert into nums select ${value} from s;
    `;
    // the progress lines for pieces that end at these rows of a table of `rows` rows
    const lines = (rows, ends) => ends.map((end) => words.exportTablesProgressRows(end, rows));
    // the progress after each piece of a table of `rows` rows that weigh `weight` each
    const piecesOf = (rows, weight) => {
        const perPiece = Math.ceil(words.EXPORT_PIECE_CHARS / weight);
        const ends = [];
        for (let end = perPiece; end < rows; end += perPiece) {
            ends.push(end);
        }
        return [...ends, rows].map((end) => words.exportTablesProgressRows(end, rows));
    };

    test("a table of 7,000 rows of one INTEGER column is read in pieces of 3,277 rows: a number weighs 20 in a piece, and the row that uses the budget up is taken", async ({ app, page }) => {
        // (the budget is 65,536: 3,276 rows weigh 65,520, short of it; 3,277 weigh 65,540)
        expect(Math.ceil(words.EXPORT_PIECE_CHARS / NUMBER_WEIGHT)).toBe(3277);
        const seen = await progressOfTable(app, page, tableOfRows("integer", "n", 7000), "nums");
        expect(seen, "the progress after each piece of a table of INTEGERs").toEqual(lines(7000, [3277, 6554, 7000]));
        expect(seen, "the pieces the budget and the weight of a number give").toEqual(piecesOf(7000, NUMBER_WEIGHT));
    });

    test("a table of 7,000 rows of one REAL column is read in the same pieces of 3,277 rows: a REAL weighs 20 as well", async ({ app, page }) => {
        const seen = await progressOfTable(app, page, tableOfRows("real", "n + 0.5", 7000), "nums");
        expect(seen, "the progress after each piece of a table of REALs").toEqual(lines(7000, [3277, 6554, 7000]));
    });

    test("a table of 70,000 NULLs is read in pieces of 65,536 rows: a NULL weighs 1, and a piece whose rows weigh exactly the budget ends at that row, not one row after it", async ({ app, page }) => {
        expect(Math.ceil(words.EXPORT_PIECE_CHARS / NULL_WEIGHT)).toBe(65_536);
        const seen = await progressOfTable(app, page, tableOfRows("integer", "null", 70_000), "nums");
        expect(seen, "the progress after each piece of a table of NULLs").toEqual(lines(70_000, [65_536, 70_000]));
    });
});
