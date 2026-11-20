// Assessment plan, Phase 5 (import Excel workbooks), in the page: the code that writes a workbook's
// sheets to the database, with the spreadsheet library and the engine as the page has them, and the
// import as a job made by hand or by the dialog. The modules that read a workbook are tried in Node
// (tests/aw5-excel-rules.spec.js); the owner's fixtures go through the page in
// tests/aw5-excel-fixtures.spec.js; the strip of sheets and what a tab and a panel say are in
// tests/aw5-excel-dialog.spec.js.
// Page tests reach code through the bundle only (await import("./bundle/app.js")): importDb,
// importCells, importZip, importWorkbook and importReport are exposed by name, and so is the import
// itself. A page opened with ?preview=import,excel-import has both flags (the flag "excel-import" does
// nothing without "import"); the typed table and the report do not depend on them. Expected values come
// from the owner's expected files (tests/fixtures/, never edited) or are typed in here; none is worked
// out by the code under test.
//
// 1. The typed table (js/lab/import-db.js newTypedTable): the table made at once with its types, one
//    insert, the numbers that the engine's own binding would wrap or change (1e19, 6.02e23, 1e15,
//    999999999999999, -0, 0.1), text that a column converts, NULLs and a short row, a name that needs
//    quotes, a table that exists already, abandon() and finish(), and everything undone by the
//    import's savepoint.
// 2. The report of a sheet's table (js/lab/import-report.js): the paragraph for formula cells that
//    came out empty, the note for a column whose format shows zeros, both notes in one column, and a
//    table with neither, which has nothing new in its markup.
// 3. The run of a sheet, called as the dialog calls it, with a job made by hand: the tables, the
//    events, the report, the progress, Cancel between two steps, a failure that undoes the tables
//    before it, a workbook beside text files and into the open database with the student's
//    transaction open, and the reader of text files loaded only for a job that has a text file.
// 4. A workbook beside CSV files: one database named after the first file, the tables in the tabs'
//    order, one event for each file in an evidence file that verifies, and the sheets imported into
//    the open database.
// 5. What the dialog hands to the import, and what it says while the import runs: the titles of the
//    progress, a web page of tables with some unticked, a failure inside a sheet, and Cancel and
//    Escape between two steps and during the first pass of a sheet.
// 6. The spreadsheet library and the CSV reader, each asked for when it is needed: a visit asks for
//    neither, a workbook asks for the library once, a library that cannot be loaded refuses the
//    workbook and leaves the CSV file beside it, and the reverse.
// 7. One workbook is read at a time: two workbooks chosen together, and a workbook that asks a question
//    first (a large one: its question is answered while another is read, or before). A test notes, in
//    the page, when each file is read whole, when each call of the library's read begins and ends, each
//    frame asked for and a turn it holds (watchReading).
// 8. Leaving while a workbook is being read: Cancel, Escape and a second choice of files, each while the
//    library is on its way, during the zip check and at the frame before the library's one blocking
//    call. The library is never called for the reading that was left, nothing of it shows, and the
//    same files chosen again are read and imported. And a library that arrives after the dialog has
//    closed.
// 9. A library that cannot be loaded: a 404, a file that is not the library, a request that is never
//    answered until the page's clock has passed the time the loader waits. The workbook is refused with
//    its own words, the CSV file beside it imports, and the same workbook chosen once the library can
//    be loaded is read.
// 10. While an import of sheets runs (held between two steps): Run, Check, the exports, another
//    database, Ctrl+O and Ctrl+U, the switcher's entries, a choice, a drop, Back and Forward and an
//    exercise set are refused or ignored as they are for a text file, with the same words; the import
//    then ends well. Enter held on Import, and Tab.
// 11. Back and Forward under the dialog of a workbook (its sheets on show, being read, or its question
//    showing): the dialog closes and nothing of the workbook is left.
// 12. A drop of a workbook is a choice wherever it lands; a mixed choice, a drop while a dialog is open,
//    and a choice or a drop while a database loads.
// 13. The flags: excel-import without import is a visit with no flag; import alone refuses a workbook
//    and never asks for the library; the flag is read once; a first visit with both asks for nothing.
// 14. After an import of a workbook, into a new database and into the open one: the address, the title,
//    the names, the toast with the number of tables, the report, the log, the focus, the library asked
//    for once, the schema panel and the editor.
// 15. Sheet names that are not plain text (a line break, a tab, markup, another script): the event, the
//    report and the file of evidence that verifies.
// 16. In a browser without scheduler.yield: the sheets are read and imported, and Cancel leaves nothing.
// 17. On a phone: the report is in view after an import of a workbook.
// 18. About credits SheetJS, with its licence, after the credits of Papa Parse and fflate and with no link out.

const fs = require("node:fs");
const path = require("node:path");
const { pathToFileURL } = require("node:url");
const {
    test,
    expect,
    NORTHLIGHT_URL,
    csvFile,
    eventsOfOpen,
    expectedFor,
    fixturePath,
    expectNothingLeft,
    gateTurns,
    holdVendor,
    openStatements,
    snapshot,
    SAMPLE_FILE,
    autocommit,
    schemaNames,
    BASENAME,
    BYTES,
    tablesOf,
    dialogReady,
    expectTables,
    eventLines,
    workbookFile,
    owned,
    MB,
    OLE2_START,
    App,
    DEFAULT_DATASET,
    realManifest,
    holdDataset,
    editorValue,
    databaseHandle,
    isOpenDatabase,
    eventKeys,
    openableSets,
    progressKey,
    eventsOf,
    escaped,
    wideLastRowCsv,
} = require("./helpers");

const load = (file) => import(pathToFileURL(path.join(__dirname, "..", "js", "lab", file)).href);

const BOTH_URL = `${NORTHLIGHT_URL}&preview=import,excel-import`;
const FLAGS = "./?preview=import,excel-import";
const NORTHLIGHT_IMPORT_URL_ONLY = `${NORTHLIGHT_URL}&preview=import`;
const STUDENT = "U2034567";

let words;
test.beforeAll(async () => {
    words = { ...(await load("config.js")), ...(await load("config-workflow.js")) };
});

// ---- the typed table --------------------------------------------------------------------------------

test.describe("the typed table of a sheet, against the engine", () => {
    // What a sheet's table holds, from a worksheet made by hand in the library's dense form (a cell is
    // {t, v, z, w}); `columns` are lists of values, the first of each the column's name, and a value is a
    // number, a text or null. The page's own modules do what the import does for a sheet: tableOf, then a
    // typed table, then storedRow for each row. Returns the declared types, and for each column the
    // type of each stored value and the value.
    async function importedColumns(page, columns, tableName = "made_from_a_sheet") {
        return page.evaluate(
            async ({ columns, tableName }) => {
                const { importCells, importDb } = await import("./bundle/app.js");
                const rows = Math.max(...columns.map((column) => column.length));
                const data = [];
                for (let r = 0; r < rows; r++) {
                    const row = [];
                    columns.forEach((column, c) => {
                        const v = column[r];
                        if (v === null || v === undefined) {
                            return;
                        }
                        row[c] = typeof v === "number" ? { t: "n", v, w: String(v), z: "General" } : { t: "s", v, w: v };
                    });
                    data[r] = row;
                }
                const sheet = importCells.readSheet({ "!data": data, "!ref": "A1" }, { name: "S" });
                const table = await importCells.tableOf(sheet, { hasNames: true, namesRow: 1 });
                const database = window.app.database;
                const typed = importDb.newTypedTable(database, tableName, table.columns);
                for (let i = 0; i < table.rows; i++) {
                    typed.add(importCells.storedRow(table, i));
                }
                const count = typed.finish();
                const info = database.db.exec({ sql: `pragma table_info("${tableName}")`, rowMode: "array", returnValue: "resultRows" });
                const out = { count, declared: info.map((row) => [row[1], row[2]]), made: table.columns.map((column) => column.type), kinds: [], values: [] };
                for (const [, name] of info.map((row) => [row[0], row[1]])) {
                    const got = database.db.exec({ sql: `select typeof("${name}"), "${name}" from "${tableName}" order by _rowid_`, rowMode: "array", returnValue: "resultRows" });
                    out.kinds.push(got.map((row) => row[0]));
                    out.values.push(got.map((row) => row[1]));
                }
                return out;
            },
            { columns, tableName }
        );
    }

    test("the types are as declared, and each value is stored as its column holds it: whole numbers, doubles, text that a column converts, NULLs", async ({ page, app }) => {
        await app.open("./");
        const got = await importedColumns(page, [
            ["id", 1, 2, 3, 4, 5, 6],
            ["price", 1.5, 2, 1e19, null, 0.1, -3],
            ["code", "007", 1, 2, null, "x", null],
            ["note", null, "a", null, "b", null, null],
            // 1e15 itself is not under 10^15: a column of such numbers is REAL, and holds them as doubles
            ["big", 1e19, 6.02e23, 1e15, 1e21, 5, 1.5],
            ["edge", 999999999999999, -0, 0, 5, -999999999999999, 7],
            ["sum", 0.1 + 0.2, 0.1, 1e-7, 1e15, 2 ** 53 + 2, 12345678901234567000],
            // numbers beside text: every number is written out in full, and the text as it is
            ["words", "x", 1e15, 6.02e23, 1e-7, 0.1 + 0.2, -0],
            // text that the column converts: a REAL column holds a double for "2" and for "4.50"
            ["converted", 1, "2", 3.5, "4.50", null, 6],
            // and an INTEGER column a whole number for "2"
            ["whole", 1, "2", 3, null, 5, "6"],
        ]);
        expect(got.count).toBe(6);
        expect(got.declared).toEqual([
            ["id", "INTEGER"],
            ["price", "REAL"],
            ["code", "TEXT"],
            ["note", "TEXT"],
            ["big", "REAL"],
            ["edge", "INTEGER"],
            ["sum", "REAL"],
            ["words", "TEXT"],
            ["converted", "REAL"],
            ["whole", "INTEGER"],
        ]);
        // (what the sheet's own tally made of each column is what the table was declared with)
        expect(got.made).toEqual(got.declared.map((one) => one[1]));
        expect(got.kinds).toEqual([
            ["integer", "integer", "integer", "integer", "integer", "integer"],
            ["real", "real", "real", "null", "real", "real"],
            ["text", "text", "text", "null", "text", "null"],
            ["null", "text", "null", "text", "null", "null"],
            ["real", "real", "real", "real", "real", "real"],
            ["integer", "integer", "integer", "integer", "integer", "integer"],
            ["real", "real", "real", "real", "real", "real"],
            ["text", "text", "text", "text", "text", "text"],
            ["real", "real", "real", "real", "null", "real"],
            ["integer", "integer", "integer", "null", "integer", "integer"],
        ]);
        expect(got.values).toEqual([
            [1, 2, 3, 4, 5, 6],
            [1.5, 2, 1e19, null, 0.1, -3],
            ["007", "1", "2", null, "x", null],
            [null, "a", null, "b", null, null],
            // (a number of 2^63 or more is not wrapped, and 6.02e23 is not turned into anything else)
            [1e19, 6.02e23, 1e15, 1e21, 5, 1.5],
            [999999999999999, 0, 0, 5, -999999999999999, 7],
            [0.1 + 0.2, 0.1, 1e-7, 1e15, 2 ** 53 + 2, 12345678901234567000],
            ["x", "1000000000000000", "602000000000000000000000", "0.0000001", "0.30000000000000004", "0"],
            [1, 2, 3.5, 4.5, null, 6],
            [1, 2, 3, null, 5, 6],
        ]);
    });

    test("the engine's own binding of a number wraps one of 2^63 or more into a negative whole number, in a REAL column too: the reason a double is bound as a double", async ({ page, app }) => {
        await app.open("./");
        const stored = await page.evaluate(() => {
            const { db } = window.app.database;
            db.exec('create table "wrapped" ("x" REAL)');
            const insert = db.prepare('insert into "wrapped" values (?)');
            insert.bind(1, 1e19).step();
            insert.finalize();
            return db.selectValue('select x from "wrapped"');
        });
        // (if a later engine does not wrap, the rule for a REAL column can be looked at again)
        expect(stored).not.toBe(1e19);
        expect(stored).toBeLessThan(0);
    });

    test("a short row leaves NULLs, also after a longer one; a row longer than the table is refused; a number is bound as a double only where the column is REAL", async ({ page, app }) => {
        await app.open("./");
        const got = await page.evaluate(async () => {
            const { importDb } = await import("./bundle/app.js");
            const database = window.app.database;
            const typed = importDb.newTypedTable(database, "rows_of_all_lengths", [
                { name: "a", type: "INTEGER" },
                { name: "b", type: "REAL" },
                { name: "c", type: "TEXT" },
            ]);
            typed.add([1, 2.5, "x"]);
            typed.add([2]);
            typed.add([3, 1e19]);
            typed.add([null, null, null]);
            typed.add([undefined, 5, undefined]);
            typed.add([]);
            let refused = null;
            try {
                typed.add([1, 2, "x", 4]);
            } catch (error) {
                refused = error.name;
            }
            const rows = typed.finish();
            const select = (sql) => database.db.exec({ sql, rowMode: "array", returnValue: "resultRows" });
            return {
                rows,
                held: typed.rows,
                refused,
                table: select('select a, b, c from "rows_of_all_lengths" order by _rowid_'),
                kinds: select('select typeof(a), typeof(b), typeof(c) from "rows_of_all_lengths" order by _rowid_'),
            };
        });
        expect(got.rows).toBe(6);
        expect(got.held).toBe(6);
        expect(got.refused).toBe("RangeError");
        expect(got.table).toEqual([[1, 2.5, "x"], [2, null, null], [3, 1e19, null], [null, null, null], [null, 5, null], [null, null, null]]);
        expect(got.kinds).toEqual([
            ["integer", "real", "text"],
            ["integer", "null", "null"],
            ["integer", "real", "null"],
            ["null", "null", "null"],
            ["null", "real", "null"],
            ["null", "null", "null"],
        ]);
    });

    test("a whole number in an INTEGER column that is past what a number holds exactly is a double, not a wrapped integer", async ({ page, app }) => {
        await app.open("./");
        const got = await page.evaluate(async () => {
            const { importDb } = await import("./bundle/app.js");
            const database = window.app.database;
            const typed = importDb.newTypedTable(database, "wide_numbers", [{ name: "n", type: "INTEGER" }]);
            typed.add([1e19]);
            typed.add([2 ** 53]);
            typed.add([2 ** 53 - 1]);
            typed.add([-1e19]);
            typed.finish();
            return database.db.exec({ sql: 'select typeof(n), cast(n as text) from "wide_numbers" order by _rowid_', rowMode: "array", returnValue: "resultRows" });
        });
        // (2^53 is a whole number that the engine's conversion keeps whole, as it does for the text "9007199254740992")
        expect(got).toEqual([["real", "1.0e+19"], ["integer", "9007199254740992"], ["integer", "9007199254740991"], ["real", "-1.0e+19"]]);
    });

    test("a table and its columns are named as they come from a file: a word SQL keeps, a double quote, a space, an accent, an emoji", async ({ page, app }) => {
        await app.open("./");
        const got = await page.evaluate(async () => {
            const { importDb } = await import("./bundle/app.js");
            const database = window.app.database;
            const columns = [
                { name: "select", type: "TEXT" },
                { name: 'a"b', type: "INTEGER" },
                { name: "with space", type: "REAL" },
                { name: "Données", type: "TEXT" },
                { name: "😀", type: "TEXT" },
            ];
            const typed = importDb.newTypedTable(database, 'Order "x" é', columns);
            typed.add(["w", 1, 2.5, "d", "e"]);
            typed.finish();
            const found = database.db.exec({ sql: `select name from sqlite_schema where type = 'table' and name = 'Order "x" é'`, rowMode: "array", returnValue: "resultRows" });
            const info = database.db.exec({ sql: `pragma table_info('Order "x" é')`, rowMode: "array", returnValue: "resultRows" }).map((row) => row[1]);
            const row = database.db.exec({ sql: 'select * from "Order ""x"" é"', rowMode: "array", returnValue: "resultRows" });
            return { found, info, row };
        });
        expect(got.found).toEqual([['Order "x" é']]);
        expect(got.info).toEqual(["select", 'a"b', "with space", "Données", "😀"]);
        expect(got.row).toEqual([["w", 1, 2.5, "d", "e"]]);
    });

    test("a table that exists already makes the engine throw, nothing of it is changed and no statement is left; it is the same for another letter case and for a view", async ({ page, app }) => {
        await app.open("./");
        await page.evaluate(() => {
            const { db } = window.app.database;
            db.exec('create table "already_here" ("k" INTEGER, "v" TEXT); insert into "already_here" values (1, \'kept\'); create view "a_view" as select 1 as one');
        });
        const before = await openStatements(page);
        const got = await page.evaluate(async () => {
            const { importDb } = await import("./bundle/app.js");
            const database = window.app.database;
            const refused = [];
            for (const name of ["already_here", "ALREADY_HERE", "a_view"]) {
                try {
                    importDb.newTypedTable(database, name, [{ name: "x", type: "TEXT" }]);
                    refused.push("made");
                } catch (error) {
                    refused.push([error.name, importDb.isEngineError(error)]);
                }
            }
            const select = (sql) => database.db.exec({ sql, rowMode: "array", returnValue: "resultRows" });
            return { refused, kept: select('select * from "already_here"'), columns: select(`pragma table_info('already_here')`).map((row) => row[1]) };
        });
        expect(got.refused).toEqual([["SQLite3Error", true], ["SQLite3Error", true], ["SQLite3Error", true]]);
        expect(got.kept).toEqual([[1, "kept"]]);
        expect(got.columns).toEqual(["k", "v"]);
        expect(await openStatements(page)).toBe(before);
        expect(before).toBe(0);
    });

    test("finish() finalizes the insert and keeps the table, and says how many rows; abandon() after it does nothing; add() after it throws", async ({ page, app }) => {
        await app.open("./");
        const got = await page.evaluate(async () => {
            const { importDb } = await import("./bundle/app.js");
            const database = window.app.database;
            const typed = importDb.newTypedTable(database, "finished_table", [{ name: "x", type: "INTEGER" }]);
            typed.add([1]);
            typed.add([2]);
            const rows = typed.finish();
            const again = typed.finish();
            typed.abandon();
            let refused = null;
            try {
                typed.add([3]);
            } catch (error) {
                refused = error.message;
            }
            return { rows, again, refused, kept: database.db.exec({ sql: 'select x from "finished_table"', rowMode: "array", returnValue: "resultRows" }) };
        });
        expect(got).toMatchObject({ rows: 2, again: 2, kept: [[1], [2]] });
        expect(got.refused).toEqual(expect.any(String));
        expect(await openStatements(page)).toBe(0);
    });

    test("abandon() finalizes the insert and drops the table it made, rows and all; a second abandon() and a finish() after it do nothing; nothing is left in the schema", async ({ page, app }) => {
        await app.open("./");
        const before = await page.evaluate(() => window.app.database.db.selectValues("select name from sqlite_schema order by name"));
        const got = await page.evaluate(async () => {
            const { importDb } = await import("./bundle/app.js");
            const database = window.app.database;
            const typed = importDb.newTypedTable(database, "abandoned_table", [{ name: "x", type: "TEXT" }, { name: "y", type: "REAL" }]);
            for (let i = 0; i < 50; i++) {
                typed.add([`row ${i}`, i / 3]);
            }
            const during = database.db.selectValues("select name from sqlite_schema where name = 'abandoned_table'");
            typed.abandon();
            typed.abandon();
            const rows = typed.finish();
            return { during, rows, after: database.db.selectValues("select name from sqlite_schema order by name") };
        });
        expect(got.during).toEqual(["abandoned_table"]);
        expect(got.rows).toBe(50);
        expect(got.after).toEqual(before);
        expect(await openStatements(page)).toBe(0);
    });

    test("abandon() never drops a table it did not make: after the engine refused a name, nothing is dropped, and the table of that name is the student's", async ({ page, app }) => {
        await app.open("./");
        const got = await page.evaluate(async () => {
            const { importDb } = await import("./bundle/app.js");
            const database = window.app.database;
            database.db.exec('create table "theirs" ("k" TEXT); insert into "theirs" values (\'mine\')');
            let thrown = false;
            try {
                importDb.newTypedTable(database, "theirs", [{ name: "x", type: "TEXT" }]);
            } catch {
                thrown = true;
            }
            return { thrown, kept: database.db.exec({ sql: 'select * from "theirs"', rowMode: "array", returnValue: "resultRows" }) };
        });
        expect(got).toEqual({ thrown: true, kept: [["mine"]] });
    });

    test("everything a job made is undone by the import's savepoint, a finished table, an abandoned one and one that was never finished; kept when the job ends", async ({ page, app }) => {
        await app.open("./");
        const state = () => page.evaluate(() => ({ names: window.app.database.db.selectValues("select name from sqlite_schema order by name"), autocommit: window.app.database.capi.sqlite3_get_autocommit(window.app.database.db.pointer) }));
        const before = await state();
        expect(before.autocommit).toBe(1);
        const undone = await page.evaluate(async () => {
            const { importDb } = await import("./bundle/app.js");
            const database = window.app.database;
            const ticket = importDb.beginImport(database);
            const one = importDb.newTypedTable(database, "job_one", [{ name: "x", type: "INTEGER" }]);
            one.add([1]);
            one.finish();
            const two = importDb.newTypedTable(database, "job_two", [{ name: "x", type: "INTEGER" }]);
            two.add([2]);
            two.abandon();
            // a third that the job stopped in the middle of, its insert finalized in a finally
            const three = importDb.newTypedTable(database, "job_three", [{ name: "x", type: "INTEGER" }]);
            three.add([3]);
            three.abandon();
            const during = database.db.selectValues("select name from sqlite_schema where name like 'job_%' order by name");
            const result = importDb.undoImport(database, ticket);
            return { during, result };
        });
        expect(undone.during).toEqual(["job_one"]);
        expect(undone.result).toEqual({ undone: true, lostTransaction: false });
        expect(await state()).toEqual(before);
        expect(await openStatements(page)).toBe(0);
        // the control: the same job, ended, keeps the tables it made
        const kept = await page.evaluate(async () => {
            const { importDb } = await import("./bundle/app.js");
            const database = window.app.database;
            importDb.beginImport(database);
            const one = importDb.newTypedTable(database, "job_one", [{ name: "x", type: "INTEGER" }]);
            one.add([1]);
            one.finish();
            importDb.endImport(database);
            return database.db.selectValues("select name from sqlite_schema where name like 'job_%' order by name");
        });
        expect(kept).toEqual(["job_one"]);
        expect(await autocommit(page)).toBe(1);
    });

    test("inside a transaction of the student's own, undoing the job leaves their work: the typed table is gone and what they wrote is not", async ({ page, app }) => {
        await app.open("./");
        const got = await page.evaluate(async () => {
            const { importDb } = await import("./bundle/app.js");
            const database = window.app.database;
            database.db.exec("begin; create table \"theirs_open\" (k TEXT); insert into \"theirs_open\" values ('mine')");
            const ticket = importDb.beginImport(database);
            const typed = importDb.newTypedTable(database, "job_inside", [{ name: "x", type: "TEXT" }]);
            typed.add(["a"]);
            typed.finish();
            const result = importDb.undoImport(database, ticket);
            const out = {
                result,
                names: database.db.selectValues("select name from sqlite_schema where name in ('theirs_open', 'job_inside') order by name"),
                still: database.capi.sqlite3_get_autocommit(database.db.pointer),
            };
            database.db.exec("rollback");
            return out;
        });
        expect(got).toEqual({ result: { undone: true, lostTransaction: false }, names: ["theirs_open"], still: 0 });
    });

    test("a TEMP table of the same name takes none of the rows: the table that was made in the main database holds them all", async ({ page, app }) => {
        await app.open("./");
        const got = await page.evaluate(async () => {
            const { importDb } = await import("./bundle/app.js");
            const database = window.app.database;
            database.db.exec('create temp table "clash" (x INTEGER)');
            const typed = importDb.newTypedTable(database, "clash", [{ name: "x", type: "INTEGER" }]);
            typed.add([1]);
            typed.add([2]);
            typed.finish();
            return {
                main: database.db.selectValues('select x from main."clash" order by x'),
                temp: database.db.selectValues('select x from temp."clash"'),
            };
        });
        expect(got).toEqual({ main: [1, 2], temp: [] });
    });
});

// ---- the report of a sheet's table -------------------------------------------------------------------

test.describe("the report of a sheet's table: formula cells that came out empty, and zeros a number format showed", () => {
    const column = (name, extra = {}) => ({ name, original: name, type: "TEXT", blanks: 0, blocking: null, ...extra });

    // the report built from tables, as one container's innerHTML and a few reads of it
    async function reportOf(page, tables) {
        return page.evaluate(async (tables) => {
            const { buildImportReport } = (await import("./bundle/app.js")).importReport;
            const box = document.createElement("div");
            document.body.append(box);
            const report = buildImportReport(tables);
            box.append(report);
            const sections = [...box.querySelectorAll("section.import-report-table")].map((section) => ({
                children: [...section.children].map((child) => `${child.tagName.toLowerCase()}.${child.className}`),
                formulas: [...section.querySelectorAll(".import-report-formulas")].map((node) => node.textContent),
                html: section.innerHTML.replace(/import-report-\d+-\d+/g, "ID"),
                notes: [...section.querySelectorAll("tbody tr")].map((row) => ({
                    name: row.querySelector("th").textContent,
                    note: row.querySelector("td.import-report-note").textContent,
                    padded: [...row.querySelectorAll(".import-report-padded")].map((node) => ({ text: node.textContent, title: node.getAttribute("title") })),
                    blocking: [...row.querySelectorAll(".import-cell-text")].map((node) => node.textContent),
                })),
            }));
            return sections;
        }, tables);
    }

    const sheetTable = (extra = {}) => ({ name: "orders", rows: 3, source: "shopping_db.xlsx, sheet orders", badQuotes: false, quoted: [], columns: [column("id"), column("zip")], ...extra });

    test("one formula cell and three: the paragraph in its own words, between the line and the columns, and nothing when there are none", async ({ page, app }) => {
        await app.open("./");
        const [one, three, none, zero] = await reportOf(page, [sheetTable({ emptyFormulas: 1 }), sheetTable({ emptyFormulas: 3 }), sheetTable(), sheetTable({ emptyFormulas: 0, padded: [] })]);
        expect(one.formulas).toEqual([words.importReportEmptyFormulasText(1)]);
        expect(one.formulas[0]).toBe("1 formula cell of this sheet came out empty: the workbook stores no result for it, or it gives empty text. In the table it is a blank.");
        expect(three.formulas).toEqual(["3 formula cells of this sheet came out empty: the workbook stores no result for them, or they give empty text. In the table they are blanks."]);
        expect(one.children).toEqual(["h2.import-report-name", "p.import-report-line", "p.import-report-formulas", "table.result-table import-report-columns"]);
        expect(none.formulas).toEqual([]);
        expect(none.children).toEqual(["h2.import-report-name", "p.import-report-line", "table.result-table import-report-columns"]);
        expect(zero.children).toEqual(none.children);
    });

    test("the formula paragraph comes after the warnings a text file can have: a quote with no partner, and the names to write in quotes", async ({ page, app }) => {
        await app.open("./");
        const [got] = await reportOf(page, [sheetTable({ emptyFormulas: 2, badQuotes: true, quoted: ["Order"] })]);
        expect(got.children).toEqual(["h2.import-report-name", "p.import-report-line", "p.import-report-warning", "p.import-report-quoted", "p.import-report-formulas", "table.result-table import-report-columns"]);
    });

    test("a column whose format showed zeros says what Excel showed, with the number; with no example it says that the format pads", async ({ page, app }) => {
        await app.open("./");
        const [withExample, without] = await reportOf(page, [
            sheetTable({ padded: [{ column: "zip", example: "00123", number: 123 }] }),
            sheetTable({ padded: [{ column: "zip", example: null, number: 123 }] }),
        ]);
        const zip = (got) => got.notes.find((row) => row.name === "zip");
        expect(zip(withExample).note).toBe("Excel showed 00123 for the number 123: the zeros are not in the table.");
        expect(zip(withExample).note).toBe(words.importReportPaddedNote("00123", "123"));
        expect(zip(withExample).padded).toEqual([{ text: "Excel showed 00123 for the number 123: the zeros are not in the table.", title: null }]);
        expect(zip(without).note).toBe("This column's format pads numbers with zeros, which are not in the table.");
        // the other column has no note at all
        expect(withExample.notes.find((row) => row.name === "id").note).toBe("");
    });

    test("a number is written out in full in the note: 1e21 and a negative number", async ({ page, app }) => {
        await app.open("./");
        const [got] = await reportOf(page, [sheetTable({ padded: [{ column: "zip", example: "-0012", number: -12 }, { column: "id", example: "0", number: 1e21 }] })]);
        expect(got.notes.find((row) => row.name === "zip").note).toBe("Excel showed -0012 for the number -12: the zeros are not in the table.");
        expect(got.notes.find((row) => row.name === "id").note).toBe("Excel showed 0 for the number 1000000000000000000000: the zeros are not in the table.");
    });

    test("a column with a blocking value and padding shows both notes, the blocking one first; an example of more than 80 characters is cut, with the whole sentence in its title", async ({ page, app }) => {
        await app.open("./");
        const long = `0${"1".repeat(100)}`;
        const [got] = await reportOf(page, [
            sheetTable({
                columns: [column("id"), column("zip", { type: "TEXT", blocking: "n/a" })],
                padded: [{ column: "zip", example: long, number: 5 }],
            }),
        ]);
        const zip = got.notes.find((row) => row.name === "zip");
        expect(zip.blocking).toEqual(["n/a"]);
        expect(zip.note).toBe(`${words.IMPORT_REPORT_BLOCKING_NOTE} n/a${words.importReportPaddedNote(`${long.slice(0, 80)}…`, "5")}`);
        expect(zip.padded).toEqual([{ text: words.importReportPaddedNote(`${long.slice(0, 80)}…`, "5"), title: words.importReportPaddedNote(long, "5") }]);
    });

    test("an example of exactly 80 characters is shown whole, with no title; one of 81 is cut", async ({ page, app }) => {
        await app.open("./");
        const eighty = `0${"1".repeat(79)}`;
        const [whole, cut] = await reportOf(page, [
            sheetTable({ padded: [{ column: "zip", example: eighty, number: 5 }] }),
            sheetTable({ padded: [{ column: "zip", example: `${eighty}2`, number: 5 }] }),
        ]);
        const zip = (got) => got.notes.find((row) => row.name === "zip").padded;
        expect(zip(whole)).toEqual([{ text: words.importReportPaddedNote(eighty, "5"), title: null }]);
        expect(zip(cut)).toEqual([{ text: words.importReportPaddedNote(`${eighty}…`, "5"), title: words.importReportPaddedNote(`${eighty}2`, "5") }]);
    });

    test("a table with neither fact has nothing new in its markup: a text file's report is what it always was, byte for byte", async ({ page, app }) => {
        await app.open("./");
        const textTable = { name: "people", rows: 2, source: "people.csv", badQuotes: false, quoted: [], columns: [column("id", { type: "INTEGER" }), column("name", { original: "Name", blanks: 1 })] };
        const [plain, withFields, empty] = await reportOf(page, [textTable, { ...textTable, emptyFormulas: 0, padded: [] }, sheetTable({ emptyFormulas: 0, padded: [] })]);
        expect(plain.html).toBe(
            '<h2 class="import-report-name" id="ID">people</h2>' +
                '<p class="import-report-line">2 rows, 2 columns, from people.csv</p>' +
                '<table class="result-table import-report-columns" aria-labelledby="ID">' +
                '<thead><tr><th scope="col">Column</th><th scope="col">Name in the file</th><th scope="col">Type</th><th class="num" scope="col">Blanks</th><th scope="col">Note</th></tr></thead>' +
                '<tbody><tr><th class="import-report-column" scope="row">id</th><td></td><td>INTEGER</td><td class="num">0</td><td class="import-report-note"></td></tr>' +
                '<tr><th class="import-report-column" scope="row">name</th><td><span class="import-cell-text">Name</span></td><td>TEXT</td><td class="num">1</td><td class="import-report-note"></td></tr></tbody></table>'
        );
        expect(withFields.html).toBe(plain.html);
        expect(empty.html).not.toContain("import-report-formulas");
        expect(empty.html).not.toContain("import-report-padded");
    });
});

// ---- the run of a sheet -------------------------------------------------------------------------------

test.describe("the run of a sheet, called as the dialog calls it, with a job made by hand", () => {
    // The page's own import is taken out and a second is mounted, as tests/aw2-import-page.spec.js
    // does, over the page's own database, so that its run can be called with the entries the dialog
    // will make for a sheet. A workbook is made in the page by the library itself and read by the page's
    // own import-workbook. The window's `kit` holds what the tests below call.
    async function mount(page, app, url = BOTH_URL) {
        await app.open(url);
        await page.evaluate(async () => {
            const bundle = await import("./bundle/app.js");
            document.getElementById("import-dialog").remove();
            const state = { reports: [], changed: 0, shown: 0, progress: [], busy: [] };
            // what the page tells the import at the moment Import is pressed: a course database is open, a database is
            // on its way, another long job runs (its words)
            window.kitFlags = { course: false, loading: false, other: null };
            const input = document.createElement("input");
            input.type = "file";
            const focus = document.createElement("button");
            document.body.append(input, focus);
            const importer = bundle.import.mountImport({
                fileInput: input,
                returnFocus: focus,
                getDatabase: () => window.app.database,
                getDatabaseLabel: () => "the open database",
                isCourseDatabase: () => window.kitFlags.course,
                isLoading: () => window.kitFlags.loading,
                otherJobMessage: () => window.kitFlags.other,
                openBuilt: async () => true,
                announceChanged: () => state.changed++,
                runLog: { current: () => ({ key: "by-hand" }) },
                results: {
                    showReport: (report, options) => {
                        const box = document.createElement("div");
                        box.id = `report-${state.reports.length + 1}`;
                        box.append(report);
                        document.body.append(box);
                        state.reports.push({ summary: options?.summary });
                    },
                },
                showResult: () => state.shown++,
                onBusy: (busy) => state.busy.push(busy),
            });
            const loadLibrary = () => bundle.vendorLoader.loadVendor("xlsx.full.min.js", "XLSX");
            window.kit = {
                state,
                importer,
                // a workbook of sheets [{name, rows}] as a File, read as the page reads it; the entries of its sheets
                async workbook(fileName, sheets, { all = true } = {}) {
                    const XLSX = await loadLibrary();
                    const wb = XLSX.utils.book_new();
                    for (const sheet of sheets) {
                        const ws = XLSX.utils.aoa_to_sheet(sheet.rows);
                        sheet.edit?.(ws);
                        XLSX.utils.book_append_sheet(wb, ws, sheet.name);
                    }
                    const bytes = XLSX.write(wb, { bookType: "xlsx", type: "array" });
                    const file = new File([bytes], fileName);
                    const inspected = await bundle.importWorkbook.inspectWorkbook(file, "zip");
                    const read = await bundle.importWorkbook.readWorkbook(file, "zip", {
                        directory: inspected.directory,
                        loadLibrary,
                        rest: async () => {},
                        frame: async () => {},
                        current: () => true,
                    });
                    return read.sheets.map((sheet, i) => ({
                        id: `${fileName}-${i}`,
                        file,
                        sheet,
                        hasNames: sheets[i].hasNames ?? true,
                        namesRow: sheets[i].namesRow ?? 1,
                        tableName: sheets[i].table ?? bundle.importCells.sheetTableName(sheet, fileName),
                        listed: read.sheets.length,
                        all,
                    }));
                },
                text(name, text, tableName) {
                    return { id: name, file: new File([text], name), encoding: "utf-8", delimiter: ",", newline: "\n", hasNames: true, namesRow: 1, tableName, mark: null };
                },
                async run(files, { cancelWhen = () => false } = {}) {
                    state.progress = [];
                    let stop = false;
                    const outcome = await importer.run(
                        { files: files.map(({ all, ...entry }) => entry), destination: { kind: "open" } },
                        {
                            cancelled: () => stop,
                            progress: (what) => {
                                state.progress.push(what);
                                if (cancelWhen(what)) {
                                    stop = true;
                                }
                            },
                        }
                    );
                    return outcome;
                },
            };
        });
    }

    const tablesOf = (page) => page.evaluate(() => window.app.database.db.selectValues("select name from sqlite_schema where type = 'table' and name not like 'sqlite_%' order by name"));
    const eventsOfKey = (page) => page.evaluate(async () => (await import("./bundle/app.js")).events.readEvents("by-hand").map((event) => ({ kind: event.kind, lines: event.lines })));

    test("a workbook of three sheets: three typed tables, one event of four lines, a report with the sheets as sources, and the tables are in the open database", async ({ page, app }) => {
        await mount(page, app);
        const outcome = await page.evaluate(async () => {
            const files = await window.kit.workbook("shopping.xlsx", [
                { name: "ledger", rows: [["id", "price", "code"], [1, 1.5, "a"], [2, 2, "b"], [3, 1e19, "007"]] },
                { name: "Sales 2024", rows: [["title"], ["x"]] },
                // the names are on the second row; the first is left out
                { name: "remarks", rows: [["a heading"], ["n", "m"], [1, 2], [3, 4]], namesRow: 2 },
            ]);
            return window.kit.run(files);
        });
        expect(outcome).toEqual({ ok: true });
        expect(await tablesOf(page)).toEqual(expect.arrayContaining(["Sales_2024", "remarks", "ledger"]));
        const rows = await app.rows('select id, price, typeof(price), code from ledger order by id');
        expect(rows).toEqual([[1, 1.5, "real", "a"], [2, 2, "real", "b"], [3, 1e19, "real", "007"]]);
        expect(await app.rows('select n, m from remarks order by n')).toEqual([[1, 2], [3, 4]]);
        const declared = await app.rows(`select name, type from pragma_table_info('ledger') order by cid`);
        expect(declared).toEqual([["id", "INTEGER"], ["price", "REAL"], ["code", "TEXT"]]);
        // one event, the file's line and one line for each table, each ending with its sheet
        const events = await eventsOfKey(page);
        expect(events).toHaveLength(1);
        expect(events[0].kind).toBe("import");
        expect(events[0].lines[0]).toMatch(/^file: shopping\.xlsx, \d+ bytes$/);
        expect(events[0].lines.slice(1)).toEqual([
            "table: ledger, 3 rows, 3 columns, ledger",
            "table: Sales_2024, 1 rows, 1 columns, Sales 2024",
            "table: remarks, 2 rows, 2 columns, remarks",
        ]);
        // the report: a section for each, its line ending with the sheet it came from
        const lines = await page.evaluate(() => [...document.querySelectorAll("#report-1 .import-report-line")].map((node) => node.textContent));
        expect(lines).toEqual([
            words.importReportTableLine(3, 3, "shopping.xlsx, sheet ledger"),
            words.importReportTableLine(1, 1, "shopping.xlsx, sheet Sales 2024"),
            words.importReportTableLine(2, 2, "shopping.xlsx, sheet remarks"),
        ]);
        const state = await page.evaluate(() => ({ reports: window.kit.state.reports, changed: window.kit.state.changed, shown: window.kit.state.shown, busy: window.kit.state.busy }));
        const name = await page.evaluate(() => window.app.database.name);
        expect(state).toEqual({ reports: [{ summary: words.importedMessage(3, name) }], changed: 1, shown: 1, busy: [true, false] });
        expect(await openStatements(page)).toBe(0);
        expect(await autocommit(page)).toBe(1);
    });

    test("a text file between two workbooks: three events in the job's order, and a text file's own two lines, unchanged", async ({ page, app }) => {
        await mount(page, app);
        const outcome = await page.evaluate(async () => {
            const first = await window.kit.workbook("one.xlsx", [{ name: "a", rows: [["x"], [1]] }, { name: "b", rows: [["y"], [2]] }]);
            const second = await window.kit.workbook("two.xlsx", [{ name: "c", rows: [["z"], [3]] }]);
            return window.kit.run([...first, window.kit.text("middle.csv", "id,name\n1,Ann\n2,Bob\n", "middle"), ...second]);
        });
        expect(outcome).toEqual({ ok: true });
        const events = await eventsOfKey(page);
        expect(events.map((event) => event.lines.slice(1))).toEqual([
            ["table: a, 1 rows, 1 columns, a", "table: b, 1 rows, 1 columns, b"],
            ["table: middle, 2 rows, 2 columns"],
            ["table: c, 1 rows, 1 columns, c"],
        ]);
        expect(events.map((event) => event.lines[0].replace(/\d+ bytes/, "N bytes"))).toEqual(["file: one.xlsx, N bytes", "file: middle.csv, N bytes", "file: two.xlsx, N bytes"]);
        expect(events[1].lines[0]).toBe("file: middle.csv, 20 bytes");
        // the progress says which table of how many, and the name of the table of a sheet (a text file has none)
        const progress = await page.evaluate(() => window.kit.state.progress.map((what) => [what.at, what.of, what.name, what.table]));
        expect([...new Set(progress.map((one) => JSON.stringify(one)))].map((text) => JSON.parse(text))).toEqual([
            [1, 4, "one.xlsx", "a"],
            [2, 4, "one.xlsx", "b"],
            [3, 4, "middle.csv", null],
            [4, 4, "two.xlsx", "c"],
        ]);
    });

    test("the report of a sheet carries the two facts: formula cells that came out empty, and the column whose format showed zeros", async ({ page, app }) => {
        await mount(page, app);
        const outcome = await page.evaluate(async () => {
            const files = await window.kit.workbook("zips.xlsx", [
                {
                    name: "zips",
                    rows: [["id", "zip", "calc"], [1, 123, null], [2, 45678, null]],
                    edit(ws) {
                        ws.B2.z = "00000";
                        ws.B3.z = "00000";
                        // two formula cells with no stored value, as a file that was never calculated has them
                        ws.C2 = { t: "s", v: "", f: '""' };
                        ws.C3 = { t: "s", v: "", f: '""' };
                    },
                },
            ]);
            return window.kit.run(files);
        });
        expect(outcome).toEqual({ ok: true });
        const found = await page.evaluate(() => ({
            formulas: [...document.querySelectorAll("#report-1 .import-report-formulas")].map((node) => node.textContent),
            notes: [...document.querySelectorAll("#report-1 tbody tr")].map((row) => [row.querySelector("th").textContent, row.querySelector("td.import-report-note").textContent]),
        }));
        expect(found.formulas).toEqual([words.importReportEmptyFormulasText(2)]);
        expect(found.notes).toEqual([
            ["id", ""],
            ["zip", "Excel showed 00123 for the number 123: the zeros are not in the table."],
            ["calc", ""],
        ]);
        expect(await app.rows("select id, zip, typeof(zip), calc from zips order by id")).toEqual([[1, 123, "integer", null], [2, 45678, "integer", null]]);
    });

    test("a web page of one table is no sheet to name: its source is the file's name and its event line ends with no sheet; of several tables each says which it is", async ({ page, app }) => {
        await mount(page, app);
        const html = (tables) => `<html><body>${tables.map((rows) => `<table>${rows.map((row) => `<tr>${row.map((cell) => `<td>${cell}</td>`).join("")}</tr>`).join("")}</table>`).join("")}</body></html>`;
        const outcome = await page.evaluate(async (pages) => {
            const bundle = await import("./bundle/app.js");
            const entries = [];
            for (const [name, text] of pages) {
                const file = new File([text], name);
                const read = await bundle.importWorkbook.readWorkbook(file, "markup", { directory: null, loadLibrary: () => bundle.vendorLoader.loadVendor("xlsx.full.min.js", "XLSX"), rest: async () => {}, frame: async () => {}, current: () => true });
                read.sheets.forEach((sheet, i) => entries.push({ id: `${name}-${i}`, file, sheet, hasNames: true, namesRow: 1, tableName: `${name.replace(/\W/g, "_")}_${i + 1}`, listed: read.sheets.length }));
            }
            return window.kit.run(entries);
        }, [
            ["solo.xls", html([[["a", "b"], ["1", "2"]]])],
            ["pair.xls", html([[["c"], ["3"]], [["d"], ["4"]]])],
        ]);
        expect(outcome).toEqual({ ok: true });
        const events = await eventsOfKey(page);
        expect(events.map((event) => event.lines.slice(1))).toEqual([["table: solo_xls_1, 1 rows, 2 columns"], ["table: pair_xls_1, 1 rows, 1 columns, Table 1", "table: pair_xls_2, 1 rows, 1 columns, Table 2"]]);
        const lines = await page.evaluate(() => [...document.querySelectorAll("#report-1 .import-report-line")].map((node) => node.textContent));
        expect(lines).toEqual([words.importReportTableLine(1, 2, "solo.xls"), words.importReportTableLine(1, 1, "pair.xls, Table 1"), words.importReportTableLine(1, 1, "pair.xls, Table 2")]);
    });

    test("a job that does not say how many tables its workbook lists is counted by its entries: a web page of two tables names each, one of a single table says its file", async ({ page, app }) => {
        await mount(page, app);
        const html = (tables) => `<html><body>${tables.map((rows) => `<table>${rows.map((row) => `<tr>${row.map((cell) => `<td>${cell}</td>`).join("")}</tr>`).join("")}</table>`).join("")}</body></html>`;
        const outcome = await page.evaluate(async (pages) => {
            const bundle = await import("./bundle/app.js");
            const entries = [];
            for (const [name, text] of pages) {
                const file = new File([text], name);
                const read = await bundle.importWorkbook.readWorkbook(file, "markup", { directory: null, loadLibrary: () => bundle.vendorLoader.loadVendor("xlsx.full.min.js", "XLSX"), rest: async () => {}, frame: async () => {}, current: () => true });
                // (no `listed` in the entries)
                read.sheets.forEach((sheet, i) => entries.push({ id: `${name}-${i}`, file, sheet, hasNames: true, namesRow: 1, tableName: `${name.replace(/\W/g, "_")}_${i + 1}` }));
            }
            return window.kit.run(entries);
        }, [
            ["solo.xls", html([[["a", "b"], ["1", "2"]]])],
            ["pair.xls", html([[["c"], ["3"]], [["d"], ["4"]]])],
        ]);
        expect(outcome).toEqual({ ok: true });
        const lines = await page.evaluate(() => [...document.querySelectorAll("#report-1 .import-report-line")].map((node) => node.textContent));
        expect(lines).toEqual([words.importReportTableLine(1, 2, "solo.xls"), words.importReportTableLine(1, 1, "pair.xls, Table 1"), words.importReportTableLine(1, 1, "pair.xls, Table 2")]);
    });

    test("the progress of each sheet begins with its first pass at nothing read, then makes its table from nothing to all its rows, with the sheet's cells and rows as the totals", async ({ page, app }) => {
        await mount(page, app);
        const outcome = await page.evaluate(async () => {
            const files = await window.kit.workbook("pair.xlsx", [
                { name: "first", table: "first", rows: [["x"], [1], [2]] },
                { name: "second", table: "second", rows: [["a", "b"], [1, 2]] },
            ]);
            return window.kit.run(files);
        });
        expect(outcome).toEqual({ ok: true });
        const progress = await page.evaluate(() => window.kit.state.progress);
        const of = (at, table, part, done, total) => ({ at, of: 2, name: "pair.xlsx", table, part, done, total });
        // (the first pass counts the cells of the sheet's rectangle, its names row too; the table counts its rows)
        expect(progress).toEqual([
            of(1, "first", "read", 0, 3),
            of(1, "first", "copy", 0, 2),
            of(1, "first", "copy", 2, 2),
            of(2, "second", "read", 0, 4),
            of(2, "second", "copy", 0, 1),
            of(2, "second", "copy", 1, 1),
        ]);
    });

    test("the report names a table that needs double quotes first, then the columns that do, a column of the table's own name in another letter case once", async ({ page, app }) => {
        await mount(page, app);
        const outcome = await page.evaluate(async () => {
            const files = await window.kit.workbook("keywords.xlsx", [{ name: "keywords", table: "group", rows: [["Group", "Order", "plain"], [1, 2, 3]] }]);
            return window.kit.run(files);
        });
        expect(outcome).toEqual({ ok: true });
        const quoted = await page.evaluate(() => [...document.querySelectorAll("#report-1 .import-report-quoted")].map((node) => node.textContent));
        expect(quoted).toEqual([words.importReportQuotedText(["group", "Order"])]);
        expect(quoted[0]).toContain('"group"');
    });

    for (const [name, flags, said] of [
        ["another long job is running", { other: "A job of another kind is running." }, () => "A job of another kind is running."],
        ["a course database is open and the files were to go into it", { course: true }, () => words.IMPORT_DESTINATION_GONE_MESSAGE],
        ["a database is on its way to replace the open one", { loading: true }, () => words.IMPORT_LOADING_DIALOG_MESSAGE],
    ]) {
        test(`Import pressed while ${name} is refused with the page's words: no table, no event, no report, and the page is never marked busy`, async ({ page, app }) => {
            await mount(page, app);
            const before = await tablesOf(page);
            await page.evaluate((flags) => Object.assign(window.kitFlags, flags), flags);
            const outcome = await page.evaluate(async () => window.kit.run(await window.kit.workbook("wb.xlsx", [{ name: "kept_out", rows: [["x"], [1]] }])));
            expect(outcome).toEqual({ ok: false, message: said() });
            expect(await tablesOf(page)).toEqual(before);
            expect(await eventsOfKey(page)).toEqual([]);
            expect(await page.evaluate(() => ({ reports: window.kit.state.reports.length, changed: window.kit.state.changed, busy: window.kit.state.busy }))).toEqual({ reports: 0, changed: 0, busy: [] });
            expect(await openStatements(page)).toBe(0);
            expect(await autocommit(page)).toBe(1);
        });
    }

    test("the table is made in steps with the page's turn between two, and the progress counts them: 40,000 rows of three cells are four steps", async ({ page, app }) => {
        await mount(page, app);
        const rows = 40000;
        const outcome = await page.evaluate(async (rows) => {
            const body = [["a", "b", "c"]];
            for (let i = 0; i < rows; i++) {
                body.push([i, i * 2, `t${i}`]);
            }
            const files = await window.kit.workbook("big.xlsx", [{ name: "big", rows: body }]);
            return window.kit.run(files);
        }, rows);
        expect(outcome).toEqual({ ok: true });
        expect(await app.rows("select count(*), sum(a), min(c) from big")).toEqual([[rows, (rows * (rows - 1)) / 2, "t0"]]);
        const copies = await page.evaluate(() => window.kit.state.progress.filter((what) => what.part === "copy").map((what) => [what.done, what.total]));
        // (30,000 cells to a step, a row of three: ten thousand rows)
        expect(copies).toEqual([[0, rows], [10000, rows], [20000, rows], [30000, rows], [40000, rows]]);
        const reads = await page.evaluate(() => window.kit.state.progress.filter((what) => what.part === "read").map((what) => what.done <= what.total));
        expect(reads.every(Boolean)).toBe(true);
    });

    test("a step is as many whole rows as fit in 30,000 cells: of seven columns, 4,285 rows (a step that rounded up would hold 30,002 cells)", async ({ page, app }) => {
        await mount(page, app);
        const outcome = await page.evaluate(async () => {
            const body = [["a", "b", "c", "d", "e", "f", "g"]];
            for (let i = 0; i < 10000; i++) {
                body.push([i, i, i, i, i, i, i]);
            }
            return window.kit.run(await window.kit.workbook("seven.xlsx", [{ name: "seven", rows: body }]));
        });
        expect(outcome).toEqual({ ok: true });
        const copies = await page.evaluate(() => window.kit.state.progress.filter((what) => what.part === "copy").map((what) => what.done));
        expect(copies).toEqual([0, 4285, 8570, 10000]);
    });

    test("Cancel between two steps leaves nothing: no table, no event, no report, no statement, no savepoint, and the tables before it are undone too", async ({ page, app }) => {
        await mount(page, app);
        const before = await tablesOf(page);
        const outcome = await page.evaluate(async () => {
            const body = [["a", "b", "c"]];
            for (let i = 0; i < 40000; i++) {
                body.push([i, i * 2, `t${i}`]);
            }
            const small = await window.kit.workbook("small.xlsx", [{ name: "small_one", rows: [["x"], [1]] }]);
            const files = [...small, ...(await window.kit.workbook("big.xlsx", [{ name: "big", rows: body }]))];
            // the student presses Cancel once the second step of the second table has been made
            return window.kit.run(files, { cancelWhen: (what) => what.at === 2 && what.part === "copy" && what.done >= 20000 });
        });
        expect(outcome).toEqual({ ok: false, cancelled: true });
        expect(await tablesOf(page)).toEqual(before);
        expect(await eventsOfKey(page)).toEqual([]);
        const state = await page.evaluate(() => ({ reports: window.kit.state.reports.length, changed: window.kit.state.changed, busy: window.kit.state.busy }));
        expect(state).toEqual({ reports: 0, changed: 0, busy: [true, false] });
        expect(await openStatements(page)).toBe(0);
        expect(await autocommit(page)).toBe(1);
    });

    test("Cancel during the first pass, before the table is made, leaves nothing", async ({ page, app }) => {
        await mount(page, app);
        const before = await tablesOf(page);
        const outcome = await page.evaluate(async () => {
            const body = [["a", "b", "c"]];
            for (let i = 0; i < 40000; i++) {
                body.push([i, i * 2, `t${i}`]);
            }
            const files = await window.kit.workbook("big.xlsx", [{ name: "big", rows: body }]);
            return window.kit.run(files, { cancelWhen: (what) => what.part === "read" && what.done > 0 });
        });
        expect(outcome).toEqual({ ok: false, cancelled: true });
        expect(await tablesOf(page)).toEqual(before);
        expect(await openStatements(page)).toBe(0);
        expect(await autocommit(page)).toBe(1);
    });

    test("a table the open database has already makes the import fail as an import fails, with every table before it undone, and says nothing of the library's words", async ({ page, app }) => {
        await mount(page, app);
        await page.evaluate(() => window.app.database.db.exec('create table "taken_name" (k INTEGER)'));
        const before = await tablesOf(page);
        const outcome = await page.evaluate(async () => {
            const files = await window.kit.workbook("clash.xlsx", [
                { name: "fine_one", rows: [["x"], [1]] },
                { name: "taken", rows: [["y"], [2]], table: "taken_name" },
            ]);
            return window.kit.run(files);
        });
        expect(outcome).toEqual({ ok: false, message: words.IMPORT_FAILED_MESSAGE });
        expect(await tablesOf(page)).toEqual(before);
        expect(await eventsOfKey(page)).toEqual([]);
        expect(await openStatements(page)).toBe(0);
        expect(await autocommit(page)).toBe(1);
    });

    test("the reader of text files is not asked for by a job of sheets, and a job of sheets does not fail when it cannot be loaded; a job with a text file does", async ({ page, app }) => {
        await mount(page, app);
        const asked = [];
        page.on("request", (request) => {
            if (/papaparse/.test(request.url())) {
                asked.push(request.url());
            }
        });
        await page.route("**/vendor/papaparse.min.js", (route) => route.abort());
        expect(await page.evaluate(() => typeof window.Papa)).toBe("undefined");
        const sheets = await page.evaluate(async () => window.kit.run(await window.kit.workbook("only.xlsx", [{ name: "only_sheets", rows: [["x"], [1]] }])));
        expect(sheets).toEqual({ ok: true });
        expect(asked).toEqual([]);
        expect(await page.evaluate(() => typeof window.Papa)).toBe("undefined");
        // with a text file in the job the reader is needed, and its failure is the import's
        const mixed = await page.evaluate(async () => {
            const files = await window.kit.workbook("beside.xlsx", [{ name: "beside_text", rows: [["x"], [1]] }]);
            return window.kit.run([...files, window.kit.text("t.csv", "a,b\n1,2\n", "t_csv")]);
        });
        expect(mixed).toEqual({ ok: false, message: words.IMPORT_LIBRARY_FAILED_MESSAGE });
        expect(asked.length).toBeGreaterThan(0);
        expect(await tablesOf(page)).not.toContain("beside_text");
    });

    test("with both flags on, a mixed choice has its new toast and the menu entry its new description", async ({ page, app }) => {
        await app.open(BOTH_URL);
        await app.recordToasts();
        await app.chooseFiles([{ name: "a.csv", mimeType: "text/csv", buffer: Buffer.from("id\n1\n") }, { name: "b.sql", mimeType: "text/plain", buffer: Buffer.from("SELECT 1;") }]);
        await app.expectToasts([words.IMPORT_MIXED_WITH_EXCEL_MESSAGE]);
        await expect(page.locator("#import-dialog[open]")).toHaveCount(0);
        await app.databaseButton.click();
        await expect(page.locator("#open-file")).toContainText(words.OPEN_FILE_WITH_EXCEL_DESCRIPTION);
        await expect(page.locator("#open-file")).not.toContainText(words.OPEN_FILE_WITH_IMPORT_DESCRIPTION);
    });

    test("with the import alone the toast and the description are the old ones", async ({ page, app }) => {
        await app.open(`${NORTHLIGHT_URL}&preview=import`);
        await app.recordToasts();
        await app.chooseFiles([{ name: "a.csv", mimeType: "text/csv", buffer: Buffer.from("id\n1\n") }, { name: "b.sql", mimeType: "text/plain", buffer: Buffer.from("SELECT 1;") }]);
        await app.expectToasts([words.IMPORT_MIXED_MESSAGE]);
        await app.databaseButton.click();
        await expect(page.locator("#open-file")).toContainText(words.OPEN_FILE_WITH_IMPORT_DESCRIPTION);
        await expect(page.locator("#open-file")).not.toContainText(words.OPEN_FILE_WITH_EXCEL_DESCRIPTION);
    });

    // ---- the events of two files of one name, a workbook of more than 200 tables, and the report's names that need quotes

    test("two different files of one name are two events: two workbooks called alike, and a workbook and a text file called alike", async ({ page, app }) => {
        await mount(page, app);
        const outcome = await page.evaluate(async () => {
            const first = await window.kit.workbook("same.xlsx", [{ name: "a", rows: [["x"], [1]] }]);
            const second = await window.kit.workbook("same.xlsx", [{ name: "b", rows: [["y"], [2]] }]);
            const third = await window.kit.workbook("same.csv", [{ name: "c", rows: [["z"], [3]] }]);
            return window.kit.run([...first, ...second, ...third, window.kit.text("same.csv", "w\n4\n", "w_text")]);
        });
        expect(outcome).toEqual({ ok: true });
        const events = await eventsOfKey(page);
        expect(events.map((event) => event.lines.slice(1))).toEqual([
            ["table: a, 1 rows, 1 columns, a"],
            ["table: b, 1 rows, 1 columns, b"],
            ["table: c, 1 rows, 1 columns, c"],
            ["table: w_text, 1 rows, 1 columns"],
        ]);
        expect(events.map((event) => event.lines[0].replace(/\d+ bytes/, "N bytes"))).toEqual(["file: same.xlsx, N bytes", "file: same.xlsx, N bytes", "file: same.csv, N bytes", "file: same.csv, N bytes"]);
    });

    test("a workbook of 250 sheets is one event of 200 lines: its file's line, 198 tables, and how many more are not listed", async ({ page, app }) => {
        await mount(page, app);
        const outcome = await page.evaluate(async () => {
            const sheets = Array.from({ length: 250 }, (_, i) => ({ name: `s${String(i + 1).padStart(3, "0")}`, rows: [["x"], [i]] }));
            return window.kit.run(await window.kit.workbook("many.xlsx", sheets));
        });
        expect(outcome).toEqual({ ok: true });
        const events = await eventsOfKey(page);
        expect(events).toHaveLength(1);
        const { lines } = events[0];
        expect(lines).toHaveLength(200);
        expect(lines[0]).toMatch(/^file: many\.xlsx, \d+ bytes$/);
        expect(lines[1]).toBe("table: s001, 1 rows, 1 columns, s001");
        expect(lines[198]).toBe("table: s198, 1 rows, 1 columns, s198");
        expect(lines[199]).toBe("(52 more lines are not listed)");
        // (every table was made, listed or not)
        expect(await app.rows("select count(*) from sqlite_schema where name glob 's[0-9][0-9][0-9]'")).toEqual([[250]]);
    });

    test("the report of a sheet names a header that needs double quotes, and the note of a padded column is on the column's name in the table, whatever its header was", async ({ page, app }) => {
        await mount(page, app);
        const outcome = await page.evaluate(async () => {
            const files = await window.kit.workbook("heads.xlsx", [
                {
                    name: "heads",
                    rows: [["Order Date", "", "select", "same", "same"], ["a", 123, 1, 2, 45678], ["b", 45678, 3, 4, 9]],
                    edit(ws) {
                        // the blank header's column and the second of two alike show zeros in front
                        for (const address of ["B2", "B3", "E2", "E3"]) {
                            ws[address].z = "00000";
                        }
                    },
                },
            ]);
            return window.kit.run(files);
        });
        expect(outcome).toEqual({ ok: true });
        const found = await page.evaluate(() => ({
            quoted: [...document.querySelectorAll("#report-1 .import-report-quoted")].map((node) => node.textContent),
            rows: [...document.querySelectorAll("#report-1 tbody tr")].map((row) => [...row.children].map((cell) => cell.textContent)),
        }));
        expect(found.quoted).toEqual([words.importReportQuotedText(["select"])]);
        expect(found.quoted[0]).toContain('"select"');
        // the name in the table, the name in the file (blank said in words, nothing where it did not change), and the note
        const columns = found.rows.map((row) => [row[0], row[1], row[4]]);
        expect(columns.map((column) => column[0])).toEqual(["Order_Date", "column_2", "select", "same", "same_2"]);
        expect((await app.rows("select name from pragma_table_info('heads') order by cid")).flat()).toEqual(columns.map((column) => column[0]));
        expect(columns[0][1]).toBe("Order Date");
        expect(columns[1]).toEqual(["column_2", words.IMPORT_REPORT_BLANK_NAME, "Excel showed 00123 for the number 123: the zeros are not in the table."]);
        expect(columns[4]).toEqual(["same_2", "same", "Excel showed 00009 for the number 9: the zeros are not in the table."]);
        // (a column that is not padded has no note, whatever its name)
        expect(columns[2][2]).toBe("");
        expect(columns[3][2]).toBe("");
    });

    // ---- a workbook and a text file in one job, into the open database with the student's own transaction open

    // the student's transaction: a table of their own and a row, not yet committed
    const beginMine = (page) => page.evaluate(() => window.app.database.db.exec("begin; create table mine (k INTEGER); insert into mine values (7)"));
    // true when the import's savepoint is no longer in the connection (releasing it is an error)
    const savepointGone = (page) =>
        page.evaluate(() => {
            try {
                window.app.database.db.exec("release lab_import");
                return false;
            } catch {
                return true;
            }
        });

    for (const order of ["workbook, then text file", "text file, then workbook"]) {
        test(`${order}, into the open database with a transaction open: both become tables, two events, the transaction is still open and still the student's, and rolling it back takes everything`, async ({ page, app }) => {
            await mount(page, app);
            const before = await tablesOf(page);
            await beginMine(page);
            const outcome = await page.evaluate(async (order) => {
                const book = await window.kit.workbook("book.xlsx", [{ name: "from_book", rows: [["x"], [1], [2]] }]);
                const text = window.kit.text("plain.csv", "a,b\n1,2\n", "from_text");
                return window.kit.run(order === "workbook, then text file" ? [...book, text] : [text, ...book]);
            }, order);
            expect(outcome).toEqual({ ok: true });
            expect(await tablesOf(page)).toEqual([...before, "from_book", "from_text", "mine"].sort());
            expect(await autocommit(page)).toBe(0);
            expect(await app.rows("select k from mine")).toEqual([[7]]);
            expect(await savepointGone(page)).toBe(true);
            expect(await openStatements(page)).toBe(0);
            const events = await eventsOfKey(page);
            expect(events.map((event) => event.lines[0].replace(/\d+ bytes/, "N bytes"))).toEqual(order === "workbook, then text file" ? ["file: book.xlsx, N bytes", "file: plain.csv, N bytes"] : ["file: plain.csv, N bytes", "file: book.xlsx, N bytes"]);
            // the student's own rollback takes what the import made with their table
            await app.rows("rollback");
            expect(await tablesOf(page)).toEqual(before);
            expect(await autocommit(page)).toBe(1);
        });
    }

    test("Cancel in the middle of the second sheet, with a transaction open: the tables before it are undone, the student's table and row are kept and their transaction is still open", async ({ page, app }) => {
        await mount(page, app);
        const before = await tablesOf(page);
        await beginMine(page);
        const outcome = await page.evaluate(async () => {
            const small = await window.kit.workbook("small.xlsx", [{ name: "small_one", rows: [["x"], [1]] }]);
            const big = await window.kit.workbook("big.xlsx", [{ name: "big", rows: [["a", "b", "c"], ...Array.from({ length: 40000 }, (_, i) => [i, i * 2, `t${i}`])] }]);
            return window.kit.run([...small, ...big], { cancelWhen: (what) => what.at === 2 && what.part === "copy" && what.done >= 20000 });
        });
        expect(outcome).toEqual({ ok: false, cancelled: true });
        expect(await tablesOf(page)).toEqual([...before, "mine"].sort());
        expect(await app.rows("select k from mine")).toEqual([[7]]);
        expect(await autocommit(page)).toBe(0);
        expect(await savepointGone(page)).toBe(true);
        expect(await openStatements(page)).toBe(0);
        expect(await app.rows("select name from sqlite_temp_schema")).toEqual([]);
        expect(await eventsOfKey(page)).toEqual([]);
        expect(await page.evaluate(() => window.kit.state.reports.length)).toBe(0);
    });

    for (const [what, lost] of [
        ["the engine fails fifteen thousand cells into the second sheet", false],
        ["the browser runs out of memory fifteen thousand cells into the second sheet (the engine undoes the whole transaction)", true],
    ]) {
        test(`${what}, with a transaction open: ${lost ? "everything is undone, the student's transaction too, and they are told" : "the tables before it are undone, the student's own transaction is kept"}`, async ({ page, app }) => {
            await mount(page, app);
            const before = await tablesOf(page);
            await beginMine(page);
            await page.evaluate((lost) => {
                const { capi, db } = window.app.database;
                const real = capi.sqlite3_bind_double;
                let calls = 0;
                capi.sqlite3_bind_double = (...args) => {
                    calls++;
                    if (calls === 15000) {
                        capi.sqlite3_bind_double = real;
                        if (lost) {
                            // (what the engine does when memory runs out: the transaction is undone, then the step fails)
                            db.exec("rollback");
                            throw Object.assign(new Error("a failure that the test made"), { resultCode: 7 });
                        }
                        throw new Error("a failure that the test made");
                    }
                    return real(...args);
                };
            }, lost);
            const outcome = await page.evaluate(async () => {
                // (whole numbers in the first sheet, which bind as integers: only the second sheet's doubles are counted)
                const first = await window.kit.workbook("two.xlsx", [
                    { name: "first_sheet", rows: [["x"], [1]] },
                    { name: "second_sheet", rows: [["amount"], ...Array.from({ length: 40000 }, (_, i) => [i + 0.5])] },
                ]);
                return window.kit.run(first);
            });
            expect(outcome).toEqual({ ok: false, message: lost ? `${words.IMPORT_OUT_OF_MEMORY_MESSAGE}${words.IMPORT_LOST_TRANSACTION_MESSAGE}` : words.IMPORT_FAILED_MESSAGE });
            expect(await tablesOf(page)).toEqual(lost ? before : [...before, "mine"].sort());
            expect(await autocommit(page)).toBe(lost ? 1 : 0);
            if (!lost) {
                expect(await app.rows("select k from mine")).toEqual([[7]]);
            }
            expect(await savepointGone(page)).toBe(true);
            expect(await openStatements(page)).toBe(0);
            expect(await eventsOfKey(page)).toEqual([]);
        });
    }
});

// ---- a workbook beside CSV files, and the evidence ------------------------------------------------------------------

test.describe("a workbook beside CSV files", () => {
    test("one database, named after the first file; the tables in the tabs' order, a workbook's sheets together; one event for each file, in a file of evidence that verifies", async ({ app, page }) => {
        const files = ["semicolon.csv", "shopping_db.xlsx", "messy_sales.csv"];
        const workbook = expectedFor("shopping_db.xlsx");
        await app.open(FLAGS);
        await app.chooseFiles(files.map(fixturePath));
        await dialogReady(app);
        await expect(app.importTabs).toHaveText(files);
        await app.importSubmit.click();
        await expect(app.importDialog).toBeHidden();
        await expect(app.pane).toHaveAttribute("data-state", "report");
        expect(await page.evaluate(() => window.app.database.name)).toBe("semicolon");
        const tables = [expectedFor("semicolon.csv").tables[0], ...tablesOf(workbook), expectedFor("messy_sales.csv").tables[0]];
        await expectTables(app, tables);
        // the report: a section for each table, in the order of the tabs
        await expect(page.locator("#results-pane .import-report section h2")).toHaveText(tables.map((table) => table.name));
        // three events, in the files' order: a text file's two lines as ever, the workbook's file line and a line for each sheet
        const events = await eventsOfOpen(page);
        expect(events.map((event) => event.lines)).toEqual([
            [`file: semicolon.csv, ${BYTES("semicolon.csv")} bytes`, `table: semicolon, ${tables[0].rows} rows, ${tables[0].columns.length} columns`],
            eventLines("shopping_db.xlsx", BYTES("shopping_db.xlsx"), tablesOf(workbook)),
            [`file: messy_sales.csv, ${BYTES("messy_sales.csv")} bytes`, `table: messy_sales, ${tables.at(-1).rows} rows, ${tables.at(-1).columns.length} columns`],
        ]);
        // a query, then the file the student hands in: it verifies, and holds the three events
        await app.run("SELECT count(*) FROM orders");
        const evidence = await app.exportEvidence(STUDENT);
        const { verifyEvidence } = await load("evidence.js");
        expect(await verifyEvidence(evidence.text)).toMatchObject({ status: "valid", student: STUDENT, queries: 1, events: 3 });
        expect(evidence.text).toContain(`file: shopping_db.xlsx, ${BYTES("shopping_db.xlsx")} bytes\ntable: customers, 6 rows, 8 columns, customers\ntable: orders, 50 rows, 4 columns, orders\n`);
    });

    test("into the open database: the sheets become tables beside the student's own, and a name that the database has is not taken", async ({ app }) => {
        await app.open(FLAGS);
        await app.upload(SAMPLE_FILE);
        const before = (await app.rows("SELECT name FROM sqlite_schema WHERE type = 'table' ORDER BY name")).flat();
        await app.importFiles(fixturePath("shopping_db.xlsx"), { into: "open" });
        const after = (await app.rows("SELECT name FROM sqlite_schema WHERE type = 'table' ORDER BY name")).flat();
        expect(after).toEqual([...before, "customers", "orders", "products", "quantities"].sort());
        expect(await app.rows("SELECT OrderDate FROM orders ORDER BY _rowid_ LIMIT 1")).toEqual([["2023-08-05"]]);
    });
});

// ---- the entries the dialog makes, and what the import says while it runs -----------------------------------------

// one of the owner's files as a file made in the test (to be chosen beside one that is)

// a web page of tables, as an .xls that holds one: tables is a list of tables, a table a list of rows of texts
const pageFile = (name, tables) => ({
    name,
    mimeType: "text/html",
    buffer: Buffer.from(`<html><body>${tables.map((rows) => `<table>${rows.map((row) => `<tr>${row.map((cell) => `<td>${cell}</td>`).join("")}</tr>`).join("")}</table>`).join("")}</body></html>`),
});

// a table of `rows` rows of three cells under a row of names: the sheet that takes several steps to make
const longRows = (rows) => [["a", "b", "c"], ...Array.from({ length: rows }, (_, i) => [i, i * 2, `t${i}`])];

// the titles the progress shows, one after the other, with no title twice running
async function recordTitles(page) {
    await page.evaluate(() => {
        const heading = document.querySelector("#import-progress-title");
        window.__titles = [];
        const note = () => {
            if (window.__titles.at(-1) !== heading.textContent) {
                window.__titles.push(heading.textContent);
            }
        };
        new MutationObserver(note).observe(heading, { childList: true, characterData: true, subtree: true });
    });
    return () => page.evaluate(() => window.__titles);
}

test.describe("what the dialog hands to the import, and what it says while the import runs", () => {
    test("a job that has a sheet counts tables, and names each by its table and its file; a text file in it is named by its file", async ({ app, page }) => {
        await app.open(FLAGS);
        const titles = await recordTitles(page);
        await app.chooseFiles([workbookFile("wb.xlsx", [{ name: "first", rows: longRows(3) }, { name: "second", rows: longRows(3) }]), csvFile("people.csv")]);
        await dialogReady(app);
        await app.importSubmit.click();
        await expect(app.importDialog).toBeHidden();
        await expect(app.pane).toHaveAttribute("data-state", "report");
        expect(await titles()).toEqual(["Importing table 1 of 3: first (wb.xlsx)", "Importing table 2 of 3: second (wb.xlsx)", "Importing table 3 of 3: people.csv"]);
        expect(await titles()).toEqual([words.importProgressTableTitle(1, 3, "first", "wb.xlsx"), words.importProgressTableTitle(2, 3, "second", "wb.xlsx"), words.importProgressTextTitle(3, 3, "people.csv")]);
    });

    test("a job of one sheet says Importing <table> (<file>)", async ({ app, page }) => {
        await app.open(FLAGS);
        const titles = await recordTitles(page);
        await app.chooseFiles(workbookFile("solo.xlsx", [{ name: "only", rows: longRows(3) }]));
        await dialogReady(app);
        await app.importSubmit.click();
        await expect(app.importDialog).toBeHidden();
        expect(await titles()).toEqual(["Importing only (solo.xlsx)"]);
    });

    test("a job of text files only keeps its titles, with both flags on as with the import alone: Importing file 2 of 2: <file>", async ({ app, page }) => {
        await app.open(FLAGS);
        const titles = await recordTitles(page);
        await app.chooseFiles([csvFile("a.csv", "x\n1\n"), csvFile("b.csv", "y\n2\n")]);
        await dialogReady(app);
        await app.importSubmit.click();
        await expect(app.importDialog).toBeHidden();
        expect(await titles()).toEqual(["Importing file 1 of 2: a.csv", "Importing file 2 of 2: b.csv"]);
    });

    test("a web page of three tables with the first and the last unticked: the table that is left says which it was, in the report and in the event (a page with one table says its file)", async ({ app, page }) => {
        const tables = [[["a"], ["1"]], [["b", "c"], ["2", "3"]], [["d"], ["4"]]];
        await app.open(FLAGS);
        await app.chooseFiles(pageFile("prices.xls", tables));
        await dialogReady(app);
        const strip = app.importSheetStrip(words.importSheetsLabel("prices.xls"));
        await expect(strip.getByRole("tab")).toHaveText([/^Table 1/, /^Table 2/, /^Table 3/]);
        // a web page has no sheet names: its tables are called by their number, and their tables by the file
        await expect(app.importSheetPanel).toContainText("Table 1");
        await expect(app.importSheetPanel.getByLabel("Table name", { exact: true })).toHaveValue("prices");
        await strip.getByRole("tab").nth(1).click();
        await expect(app.importSheetPanel.getByLabel("Table name", { exact: true })).toHaveValue("prices_2");
        await app.importPanel.getByRole("button", { name: words.IMPORT_UNTICK_ALL_SHEETS_TEXT, exact: true }).click();
        await app.importSheetPanel.getByLabel(words.IMPORT_SHEET_TICK_LABEL, { exact: true }).check();
        await expect(app.importPanel.locator(".import-sheets-count")).toHaveText(words.importSheetsCountText({ ticked: 1, tickable: 3 }));
        await app.importSubmit.click();
        await expect(app.importDialog).toBeHidden();
        await expect(app.pane).toHaveAttribute("data-state", "report");
        expect((await app.rows("SELECT name FROM sqlite_schema WHERE type = 'table'")).flat()).toEqual(["prices_2"]);
        expect(await app.rows("SELECT b, c FROM prices_2")).toEqual([[2, 3]]);
        await expect(page.locator("#results-pane .import-report-line")).toHaveText(words.importReportTableLine(1, 2, "prices.xls, Table 2"));
        expect((await eventsOfOpen(page)).map((event) => event.lines)).toEqual([[`file: prices.xls, ${pageFile("prices.xls", tables).buffer.length} bytes`, "table: prices_2, 1 rows, 2 columns, Table 2"]]);
    });

    // ---- Cancel and Escape, at the places the dialog shows

    // two workbooks' worth of sheets: a small one, then one of several steps (30,000 cells to a step)
    const TWO = () => workbookFile("wb.xlsx", [{ name: "small", rows: [["x"], [1]] }, { name: "big", rows: longRows(40000) }]);

    for (const [name, partName, press] of [
        ["Cancel while the first pass of the second sheet reads its cells", "IMPORT_PROGRESS_READING", "cancel"],
        ["Escape while the first pass of the second sheet reads its cells", "IMPORT_PROGRESS_READING", "escape"],
        ["Cancel between two steps of the second sheet's table", "IMPORT_PROGRESS_COPYING", "cancel"],
        ["Escape between two steps of the second sheet's table", "IMPORT_PROGRESS_COPYING", "escape"],
    ]) {
        test(`${name}: the table before it is undone too, and nothing is left (no table, no event, no report, no open statement, the connection as it was)`, async ({ app, page }) => {
            const part = words[partName];
            expect(typeof part).toBe("string");
            await app.open(NORTHLIGHT_URL + "&preview=import,excel-import");
            const gate = await gateTurns(page);
            await app.chooseFiles(TWO());
            await dialogReady(app);
            const before = await snapshot(page, app);
            await gate.at(/Importing table 2 of 2: big \(wb\.xlsx\)/, part);
            await app.importSubmit.click();
            // the dialog says where the import is: the second table, and what it does to it
            await expect.poll(() => gate.held()).toBe(true);
            await expect(app.importDialog.locator("#import-progress-title")).toHaveText(words.importProgressTableTitle(2, 2, "big", "wb.xlsx"));
            await expect(app.importDialog.locator(".results-loading-size")).toHaveText(part);
            if (press === "cancel") {
                await app.importCancel.click();
            } else {
                await page.keyboard.press("Escape");
            }
            await expect(app.importDialog).toBeHidden();
            await gate.release();
            await expectNothingLeft(page, app, before, { logKeys: ["northlight", "file:wb"] });
            expect(await openStatements(page)).toBe(0);
            expect(await autocommit(page)).toBe(1);
        });
    }

    // a workbook is read once: its bytes once, the library's read once; what is imported is what the dialog
    // showed, and a workbook that was left (Cancel while it was being imported) is read again when it is chosen again
    const readsOf = (page) => page.evaluate(() => window.__trace ?? []);
    async function noteReads(page) {
        await page.route(LIBRARY_ROUTE, async (route) => {
            const response = await route.fetch();
            await route.fulfill({ response, body: `${await response.text()}\n;${NOTE_READS}` });
        });
    }
    const noteBytes = (page) =>
        page.evaluate(() => {
            window.__trace = window.__trace || [];
            const bytes = Blob.prototype.arrayBuffer;
            Blob.prototype.arrayBuffer = function () {
                if (this instanceof File) {
                    window.__trace.push(`bytes:${this.name}`);
                }
                return bytes.call(this);
            };
        });

    test("a workbook is read once, when it is chosen: the import that follows reads nothing again, and what it imports is what the dialog showed", async ({ app, page }) => {
        await noteReads(page);
        await app.open(NORTHLIGHT_URL + "&preview=import,excel-import");
        await noteBytes(page);
        await app.chooseFiles(WORKBOOK_A());
        await dialogReady(app);
        expect(await readsOf(page)).toEqual(["bytes:alpha.xlsx", "read:start", "read:end", "read:nothing"]);
        await app.importSubmit.click();
        await expect(app.importDialog).toBeHidden();
        await expect(app.pane).toHaveAttribute("data-state", "report");
        expect(await app.rows("SELECT x FROM first_sheet ORDER BY x")).toEqual([[1], [2]]);
        expect(await readsOf(page), "nothing was read again for the import").toEqual(["bytes:alpha.xlsx", "read:start", "read:end", "read:nothing"]);
    });

    // The library keeps the texts of the last .xlsx it read, and reading a workbook that holds nothing makes
    // it let them go: the page does that after an .xlsx, and after nothing else (an .xls and a web page leave
    // no texts behind).
    test("an .xls and a web page saved under an Excel name are each read once, and neither is followed by the read of the workbook that holds nothing", async ({ app, page }) => {
        await noteReads(page);
        await app.open(NORTHLIGHT_URL + "&preview=import,excel-import");
        await noteBytes(page);
        const old = workbookFile("old.xls", [{ name: "ledger", rows: [["x"], [1], [2]] }], "xls");
        await app.chooseFiles([old, pageFile("prices.xls", [[["item"], ["pen"]]])]);
        await dialogReady(app);
        await expect(app.importTabs).toHaveText(["old.xls", "prices.xls"]);
        await expect(app.importPanel.getByLabel(words.IMPORT_TABLE_NAME_LABEL)).toHaveValue("ledger");
        await app.importTabs.nth(1).click();
        await expect(app.importPanel.getByLabel(words.IMPORT_TABLE_NAME_LABEL)).toHaveValue("prices");
        expect(await readsOf(page)).toEqual(["bytes:old.xls", "read:start", "read:end", "bytes:prices.xls", "read:start", "read:end"]);
        await app.importSubmit.click();
        await expect(app.importDialog).toBeHidden();
        expect(await readsOf(page), "nor does the import read anything").toEqual(["bytes:old.xls", "read:start", "read:end", "bytes:prices.xls", "read:start", "read:end"]);
    });

    test("two .xlsx workbooks chosen together are each followed by the read of the workbook that holds nothing, before the next file's bytes are read", async ({ app, page }) => {
        await noteReads(page);
        await app.open(NORTHLIGHT_URL + "&preview=import,excel-import");
        await noteBytes(page);
        await app.chooseFiles([WORKBOOK_A(), WORKBOOK_B()]);
        await dialogReady(app);
        await expect(app.importTabs).toHaveText(["alpha.xlsx", "beta.xlsx"]);
        expect(await readsOf(page)).toEqual(["bytes:alpha.xlsx", "read:start", "read:end", "read:nothing", "bytes:beta.xlsx", "read:start", "read:end", "read:nothing"]);
    });

    test("a workbook that was left while its import was cancelled is read again when it is chosen again, and imports as it did the first time", async ({ app, page }) => {
        await noteReads(page);
        await app.open(NORTHLIGHT_URL + "&preview=import,excel-import");
        await noteBytes(page);
        const gate = await gateTurns(page);
        await app.chooseFiles(TWO());
        await dialogReady(app);
        const before = await snapshot(page, app);
        await gate.at(/Importing table 2 of 2: big \(wb\.xlsx\)/, words.IMPORT_PROGRESS_COPYING);
        await app.importSubmit.click();
        await expect.poll(() => gate.held()).toBe(true);
        await app.importCancel.click();
        await expect(app.importDialog).toBeHidden();
        await gate.release();
        await expectNothingLeft(page, app, before, { logKeys: ["northlight", "file:wb"] });
        expect(await readsOf(page)).toEqual(["bytes:wb.xlsx", "read:start", "read:end", "read:nothing"]);
        await app.chooseFiles(TWO());
        await dialogReady(app);
        await expect(app.importSheetStrip(words.importSheetsLabel("wb.xlsx")).getByRole("tab")).toHaveCount(2);
        expect(await readsOf(page), "it is read again").toEqual(["bytes:wb.xlsx", "read:start", "read:end", "read:nothing", "bytes:wb.xlsx", "read:start", "read:end", "read:nothing"]);
        await app.importSubmit.click();
        await expect(app.importDialog).toBeHidden();
        expect(await app.rows("SELECT count(*), min(a), max(a) FROM big")).toEqual([[40000, 0, 39999]]);
        expect(await app.rows("SELECT x FROM small")).toEqual([[1]]);
    });

    test("a failure inside the second sheet: the first sheet's table is undone, the dialog stays with the failure's words, and Import pressed again makes both", async ({ app, page }) => {
        await app.open(FLAGS);
        await app.upload(SAMPLE_FILE);
        const gate = await gateTurns(page);
        await app.chooseFiles(workbookFile("wb.xlsx", [{ name: "first_sheet", rows: [["x"], [1]] }, { name: "second_sheet", rows: [["amount"], [1.5], [2.5]] }]));
        await dialogReady(app);
        await app.importDialog.locator("#import-into-open").check();
        const before = await snapshot(page, app);
        // (held after the first sheet's rows are in, before the second sheet begins)
        await gate.at(/Importing table 1 of 2: first_sheet/, words.IMPORT_PROGRESS_COPYING);
        await app.importSubmit.click();
        await expect.poll(() => gate.held()).toBe(true);
        // the engine's binding of a double fails, as an engine fails: for the second sheet only
        await page.evaluate(() => {
            const { capi } = window.app.database;
            window.__bind = capi.sqlite3_bind_double;
            capi.sqlite3_bind_double = () => {
                throw new Error("a failure that the test made");
            };
        });
        await gate.release();
        await expect(app.importDialog.locator("#import-error")).toHaveText(words.IMPORT_FAILED_MESSAGE);
        await expect(app.importDialog).toBeVisible();
        expect(await schemaNames(app)).toEqual(before.tables);
        expect((await app.rows("SELECT name FROM sqlite_schema WHERE type = 'table'")).flat()).not.toContain("first_sheet");
        expect(await eventsOfOpen(page)).toEqual([]);
        expect(await openStatements(page)).toBe(0);
        expect(await autocommit(page)).toBe(1);
        // the dialog is as the student left it: its sheets are there, and Import works again
        await expect(app.importTabs).toHaveCount(1);
        await page.evaluate(() => {
            window.app.database.capi.sqlite3_bind_double = window.__bind;
        });
        await app.importSubmit.click();
        await expect(app.importDialog).toBeHidden();
        await expect(app.pane).toHaveAttribute("data-state", "report");
        expect(await app.rows("SELECT x FROM first_sheet")).toEqual([[1]]);
        expect(await app.rows("SELECT amount FROM second_sheet ORDER BY amount")).toEqual([[1.5], [2.5]]);
    });

    test("a failure of the import puts the focus on Cancel, under the failure's words, and nothing is left running", async ({ app, page }) => {
        await app.open(FLAGS);
        await app.upload(SAMPLE_FILE);
        await app.chooseFiles(workbookFile("wb.xlsx", [{ name: "amounts", rows: [["amount"], [1.5]] }]));
        await dialogReady(app);
        await app.importDialog.locator("#import-into-open").check();
        // the engine's binding of a double fails, as an engine fails
        await page.evaluate(() => {
            window.app.database.capi.sqlite3_bind_double = () => {
                throw new Error("a failure that the test made");
            };
        });
        await app.importSubmit.click();
        await expect(app.importDialog.locator("#import-error")).toHaveText(words.IMPORT_FAILED_MESSAGE);
        await expect(app.importCancel).toBeFocused();
        await expect(app.importDialog.locator(".import-progress")).toBeHidden();
        await expect(app.importDialog).not.toHaveAttribute("aria-busy", "true");
    });

    test("a text file that is refused after Import is pressed, beside a workbook: its tab is shown and has the focus, the reason is in its panel, and nothing of the workbook is left", async ({ app, page }) => {
        // (the preview reads the first megabyte of a text file: a row of 2,001 fields after it is met by the import)
        await app.open(FLAGS);
        await app.upload(SAMPLE_FILE);
        const before = await snapshot(page, app);
        await app.chooseFiles([workbookFile("wb.xlsx", [{ name: "first_sheet", rows: [["x"], [1]] }]), wideLastRowCsv()]);
        await dialogReady(app);
        await app.importDialog.locator("#import-into-open").check();
        await app.importSubmit.click();
        const tab = page.getByRole("tab", { name: new RegExp(`^wide\\.csv \\(${escaped(words.IMPORT_REFUSED_TAB_TEXT)}\\)$`) });
        await expect(tab).toBeVisible();
        await expect(tab).toHaveAttribute("aria-selected", "true");
        await expect(tab).toBeFocused();
        await expect(app.importPanel).toContainText(words.IMPORT_TOO_WIDE_REASON);
        expect(await schemaNames(app)).toEqual(before.tables);
        expect(await eventsOfOpen(page)).toEqual([]);
        expect(await openStatements(page)).toBe(0);
        expect(await autocommit(page)).toBe(1);
    });

    test("the form submitted with no sheet ticked starts nothing: no progress, no error, no table, and no exception in the page", async ({ app, page, pageErrors }) => {
        await app.open(FLAGS);
        await app.upload(SAMPLE_FILE);
        const before = await snapshot(page, app);
        await app.chooseFiles(workbookFile("wb.xlsx", [{ name: "one", rows: [["x"], [1]] }, { name: "two", rows: [["y"], [2]] }]));
        await dialogReady(app);
        await app.importDialog.locator("#import-into-open").check();
        await app.importPanel.getByRole("button", { name: words.IMPORT_UNTICK_ALL_SHEETS_TEXT, exact: true }).click();
        await expect(app.importSubmit).toBeDisabled();
        await page.evaluate(() => document.querySelector("#import-form").requestSubmit());
        // (a turn for anything the submit started)
        await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
        await expect(app.importDialog.locator(".import-progress")).toBeHidden();
        await expect(app.importDialog.locator("#import-error")).toBeHidden();
        expect(await schemaNames(app)).toEqual(before.tables);
        expect(pageErrors).toEqual([]);
    });
});

// ---- the library of workbooks, asked for when a workbook is first read --------------------------------------------

test.describe("the spreadsheet library and the CSV reader, each asked for when it is needed", () => {
    const vendorRequests = (page) => {
        const asked = [];
        page.on("request", (request) => {
            const match = /\/vendor\/(xlsx\.full|papaparse)\.min\.js/.exec(request.url());
            if (match) {
                asked.push(match[1]);
            }
        });
        return asked;
    };

    test("a visit asks for neither; a workbook asks for the spreadsheet library once and never for the CSV reader, also when it is imported; a second workbook does not ask again", async ({ app, page }) => {
        const asked = vendorRequests(page);
        await app.open(FLAGS);
        await page.waitForLoadState("networkidle");
        expect(asked).toEqual([]);
        await app.importFiles(fixturePath("shopping_db.xlsx"));
        expect(asked).toEqual(["xlsx.full"]);
        expect(await page.evaluate(() => typeof window.Papa)).toBe("undefined");
        await app.chooseFiles(fixturePath("excel/hidden.xlsx"));
        await dialogReady(app);
        await app.importCancel.click();
        expect(asked).toEqual(["xlsx.full"]);
    });

    test("a CSV file asks for the CSV reader and never for the spreadsheet library", async ({ app, page }) => {
        const asked = vendorRequests(page);
        await app.open(FLAGS);
        await app.importFiles(csvFile());
        expect(asked).toEqual(["papaparse"]);
        expect(await page.evaluate(() => typeof window.XLSX)).toBe("undefined");
    });

    test("a spreadsheet library that cannot be loaded refuses the workbook with its own words, and the CSV file beside it still imports", async ({ app, page }) => {
        await page.route("**/vendor/xlsx.full.min.js", (route) => route.abort());
        await app.open(FLAGS);
        await app.chooseFiles([owned("shopping_db.xlsx"), csvFile("people.csv")]);
        await dialogReady(app);
        await expect(app.importTabs.nth(0)).toHaveAccessibleName(`shopping_db.xlsx (${words.IMPORT_REFUSED_TAB_TEXT})`);
        await app.importTabs.nth(0).click();
        await expect(app.importPanel.locator(".import-refusal")).toHaveText(words.IMPORT_WORKBOOK_LIBRARY_FAILED_REASON);
        await app.importSubmit.click();
        await expect(app.importDialog).toBeHidden();
        await expect(app.pane).toHaveAttribute("data-state", "report");
        expect((await app.rows("SELECT name FROM sqlite_schema WHERE type = 'table'")).flat()).toEqual(["people"]);
        // and the same files chosen again, with the connection back, are tried again
        await page.unroute("**/vendor/xlsx.full.min.js");
        await app.chooseFiles(fixturePath("shopping_db.xlsx"));
        await dialogReady(app);
        await expect(app.importDialog.locator(".import-refusal")).toHaveCount(0);
        await expect(app.importSubmit).toBeEnabled();
    });

    test("a CSV reader that cannot be loaded refuses the CSV file, and the workbook beside it still imports, without asking for the reader again", async ({ app, page }) => {
        const asked = vendorRequests(page);
        await page.route("**/vendor/papaparse.min.js", (route) => route.abort());
        await app.open(FLAGS);
        await app.chooseFiles([owned("shopping_db.xlsx"), csvFile("people.csv")]);
        await dialogReady(app);
        await expect(app.importTabs.nth(1)).toHaveAccessibleName(`people.csv (${words.IMPORT_REFUSED_TAB_TEXT})`);
        await app.importTabs.nth(1).click();
        await expect(app.importPanel.locator(".import-refusal")).toHaveText(words.IMPORT_LIBRARY_FAILED_MESSAGE);
        const readerAsks = asked.filter((one) => one === "papaparse").length;
        expect(readerAsks).toBeGreaterThan(0);
        await app.importSubmit.click();
        await expect(app.importDialog).toBeHidden();
        await expect(app.pane).toHaveAttribute("data-state", "report");
        expect((await app.rows("SELECT name FROM sqlite_schema WHERE type = 'table' ORDER BY name")).flat()).toEqual(["customers", "orders", "products", "quantities"]);
        // (a job of sheets has no use for the CSV reader: it was not asked for again, and its failure was not the import's)
        expect(asked.filter((one) => one === "papaparse")).toHaveLength(readerAsks);
    });

    // the plan settles that a workbook is read in the page itself: no worker is made, to read it or to import it
    test("choosing, reading and importing a workbook make no worker of any kind", async ({ app, page }) => {
        await page.addInitScript(() => {
            window.__workers = 0;
            for (const kind of ["Worker", "SharedWorker"]) {
                const Original = window[kind];
                if (Original) {
                    window[kind] = class extends Original {
                        constructor(...args) {
                            super(...args);
                            window.__workers++;
                        }
                    };
                }
            }
        });
        await app.open(FLAGS);
        const before = await page.evaluate(() => window.__workers);
        await app.importFiles(fixturePath("shopping_db.xlsx"));
        await expect(app.pane).toHaveAttribute("data-state", "report");
        expect(await page.evaluate(() => typeof window.XLSX), "the library was loaded into the page").toBe("object");
        expect(await page.evaluate(() => window.__workers)).toBe(before);
    });

    test("while the library is on its way, the workbook's tab says it is being read and Import waits; when it comes, the sheets show", async ({ app, page }) => {
        const held = await holdVendor(page, "xlsx.full.min.js");
        await app.open(FLAGS);
        await app.chooseFiles(fixturePath("shopping_db.xlsx"));
        await expect(app.importDialog).toBeVisible();
        await expect.poll(() => held.requests()).toBe(1);
        await expect(app.importPanel.locator(".import-reading")).toHaveText(words.IMPORT_READING_TEXT);
        await expect(app.importSubmit).toBeDisabled();
        held.open();
        await dialogReady(app);
        await expect(app.importSheetStrip(words.importSheetsLabel("shopping_db.xlsx")).getByRole("tab")).toHaveCount(4);
        await expect(app.importSubmit).toBeEnabled();
    });
});

// ---- what the groups below share -------------------------------------------------------------------------------------

const LIBRARY_ROUTE = "**/vendor/xlsx.full.min.js";
const CLOCK = new Date("2026-11-16T10:00:00Z");

// two small workbooks that the page can be told apart by: two sheets, and one
const WORKBOOK_A = () =>
    workbookFile("alpha.xlsx", [
        { name: "first_sheet", rows: [["x"], [1], [2]] },
        { name: "second_sheet", rows: [["y"], ["a"]] },
    ]);
const WORKBOOK_B = () => workbookFile("beta.xlsx", [{ name: "only_sheet", rows: [["z"], [10], [20], [30]] }]);

// appended to the library's own file: the calls of XLSX.read are noted, in two kinds told apart by what the page
// asks for. The read of a file that was chosen (the plan's options, dense: true) is noted when it begins and
// when it ends ("read:start", "read:end"). The other is of a workbook that holds nothing, which the page reads
// itself, with { type: "array" } alone, after an .xlsx: the library keeps the texts of the last .xlsx it read,
// and reading a workbook that holds nothing makes it let them go. It is noted as one note, "read:nothing",
// when it begins. Every call goes on to the real library.
const NOTE_READS = `window.__trace = window.__trace || [];
XLSX.read = ((read) => function (input, options) {
    if (options && options.type === "array" && Object.keys(options).length === 1) {
        window.__trace.push("read:nothing");
        return read.apply(this, arguments);
    }
    window.__trace.push("read:start");
    try { return read.apply(this, arguments); } finally { window.__trace.push("read:end"); }
})(XLSX.read);`;

// watchReading notes what the page does when it reads a workbook, in the page's own list `__trace`: the
// bytes of a file read whole ("bytes:<name>"; the head and the end of a file, read as slices, are no
// file), each call of the library's read ("read:start", "read:end", and "read:nothing" for the workbook that
// holds nothing, see NOTE_READS), each frame asked for ("frame"), and
// a turn that the test holds ("turn-held"). The route that serves the library puts the notes into it, so
// it is set before the page opens; with holdLibrary the request waits until open() is called.
// install() puts the rest into a page that has loaded, and a page's clock, if the test has one, is
// installed first (it replaces what a frame is). Returns what a test needs to look and to let go.
async function watchReading(page, { holdLibrary = false } = {}) {
    let open = () => {};
    const gate = holdLibrary ? new Promise((resolve) => (open = resolve)) : null;
    let requests = 0;
    await page.route(LIBRARY_ROUTE, async (route) => {
        requests++;
        if (gate) {
            await gate;
        }
        try {
            const response = await route.fetch();
            await route.fulfill({ response, body: `${await response.text()}\n;${NOTE_READS}` });
        } catch {
            // (the page has gone)
        }
    });
    const trace = () => page.evaluate(() => window.__trace ?? []);
    return {
        requests: () => requests,
        open,
        trace,
        reads: async () => (await trace()).filter((entry) => entry === "read:start").length,
        install: () =>
            page.evaluate(() => {
                const notes = (window.__trace = window.__trace || []);
                window.__rejections = [];
                window.addEventListener("unhandledrejection", (event) => window.__rejections.push(String(event.reason)));
                const bytes = Blob.prototype.arrayBuffer;
                Blob.prototype.arrayBuffer = function () {
                    if (this instanceof File) {
                        notes.push(`bytes:${this.name}`);
                    }
                    return bytes.call(this);
                };
                const frame = window.requestAnimationFrame;
                window.requestAnimationFrame = function (callback) {
                    notes.push("frame");
                    return frame.call(window, callback);
                };
                // the next turn the page gives itself (between two pieces of the zip check) waits until the test lets it go
                const turns = (window.__turns = { hold: false, waiting: null });
                const take = (go) => {
                    turns.hold = false;
                    turns.waiting = go;
                    notes.push("turn-held");
                };
                if (typeof globalThis.scheduler?.yield === "function") {
                    const yielded = globalThis.scheduler.yield.bind(globalThis.scheduler);
                    globalThis.scheduler.yield = () => (turns.hold ? new Promise(take) : yielded());
                } else {
                    const post = MessagePort.prototype.postMessage;
                    MessagePort.prototype.postMessage = function (...args) {
                        if (turns.hold) {
                            take(() => post.apply(this, args));
                        } else {
                            post.apply(this, args);
                        }
                    };
                }
            }),
        holdNextTurn: () =>
            page.evaluate(() => {
                window.__turns.hold = true;
            }),
        releaseTurn: () =>
            page.evaluate(() => {
                const go = window.__turns.waiting;
                window.__turns.waiting = null;
                go?.();
            }),
        rejections: () => page.evaluate(() => window.__rejections ?? []),
    };
}

// the page opened with its clock stopped (so that a frame, which the reading waits for before the
// library's one blocking call, does not come until the test lets the clock run), and watched
async function openWatched(page, app, watch, { address = BOTH_URL, stopped = true } = {}) {
    if (stopped) {
        await page.clock.install({ time: CLOCK });
    }
    await app.open(address);
    if (stopped) {
        await page.clock.pauseAt(new Date(CLOCK.getTime() + 60_000));
    }
    await watch.install();
}

// The page is given time to do what it would have done, when what is to be shown is that it did not:
// forty reads of a megabyte, each of which the browser answers in its own turn. (A reading that the page
// let begin at once would have begun by then; no clock of the page's is looked at.)
const fence = (page) =>
    page.evaluate(async () => {
        const blob = new Blob([new Uint8Array(1024 * 1024)]);
        for (let i = 0; i < 40; i++) {
            await blob.arrayBuffer();
        }
    });

// the entries of the page's list that say a file was read whole or the library was called
const readingsOf = async (watch) => (await watch.trace()).filter((entry) => entry.startsWith("bytes:") || entry.startsWith("read:"));

// files chosen as a drop: each is {name, buffer} or, for a large file made in the page, {name, size, start}
// (the bytes it begins with, then zeros: no bytes travel)
const dropFiles = (page, files) =>
    page.evaluate((specs) => {
        const data = new DataTransfer();
        for (const spec of specs) {
            const parts = spec.base64 !== undefined ? [Uint8Array.from(atob(spec.base64), (ch) => ch.charCodeAt(0))] : [new Uint8Array(spec.start), new Uint8Array(spec.size - spec.start.length)];
            data.items.add(new File(parts, spec.name));
        }
        const fire = (type) => {
            const event = new DragEvent(type, { dataTransfer: data, bubbles: true, cancelable: true });
            document.body.dispatchEvent(event);
            return event.defaultPrevented;
        };
        fire("dragover");
        return fire("drop");
    }, files.map((file) => (file.buffer ? { name: file.name, base64: Buffer.from(file.buffer).toString("base64") } : file)));

// a workbook over the size at which the student is asked first: an old workbook's bytes, which the
// library cannot read (it throws), the size of a large one
const largeWorkbook = (name = "big.xls") => ({ name, size: words.EXCEL_WARN_BYTES + 1, start: OLE2_START });

// ---- one workbook is read at a time ---------------------------------------------------------------------------------------

// waits until the page has asked for the frame that it waits for before the library's one blocking call, for
// a file that it has read whole
async function reachFrame(watch) {
    await expect
        .poll(async () => {
            const notes = await watch.trace();
            const at = notes.findIndex((entry) => entry.startsWith("bytes:"));
            return at >= 0 && notes.slice(at).includes("frame");
        })
        .toBe(true);
}

test.describe("one workbook is read at a time", () => {
    test("two workbooks chosen together: the second's bytes are not read while the first is waiting for its frame, and its reading begins after the first's has ended", async ({ page, app }) => {
        const watch = await watchReading(page);
        await openWatched(page, app, watch);
        await app.chooseFiles([WORKBOOK_A(), WORKBOOK_B()]);
        await expect(app.importDialog).toBeVisible();
        await reachFrame(watch);
        await fence(page);
        expect(await readingsOf(watch)).toEqual(["bytes:alpha.xlsx"]);
        await page.clock.resume();
        await dialogReady(app);
        expect(await readingsOf(watch)).toEqual(["bytes:alpha.xlsx", "read:start", "read:end", "read:nothing", "bytes:beta.xlsx", "read:start", "read:end", "read:nothing"]);
        await expect(app.importTabs).toHaveText(["alpha.xlsx", "beta.xlsx"]);
        await expect(app.importSubmit).toBeEnabled();
    });

    test("a workbook that asks a question first does not hold up the one behind it: that is read while the question waits, and the first is read when it is answered", async ({ page, app }) => {
        const watch = await watchReading(page);
        await openWatched(page, app, watch, { stopped: false });
        expect(await dropFiles(page, [largeWorkbook(), WORKBOOK_B()])).toBe(true);
        await expect(app.importDialog).toBeVisible();
        // (the second workbook's sheets are there, and the first's question is still to be answered)
        await expect.poll(() => readingsOf(watch)).toEqual(["bytes:beta.xlsx", "read:start", "read:end", "read:nothing"]);
        await expect(app.importDialog.locator(".import-reading")).toHaveCount(0);
        await expect(app.importDialog.locator(".import-warning-text")).toHaveText(words.importLargeWorkbookMessage({ megabytes: Math.ceil(largeWorkbook().size / MB), unpackedMegabytes: null, heavy: false }));
        await app.importTabs.nth(1).click();
        await expect(app.importPanel).toContainText("only_sheet");
        // the answer: the first is read now, after the second's reading
        await app.importTabs.nth(0).click();
        await app.importPanel.getByRole("button", { name: words.IMPORT_LARGE_FILE_CONTINUE_TEXT, exact: true }).click();
        await expect(app.importPanel.locator(".import-refusal")).toHaveText(words.IMPORT_WORKBOOK_UNREADABLE_REASON);
        expect(await readingsOf(watch)).toEqual(["bytes:beta.xlsx", "read:start", "read:end", "read:nothing", "bytes:big.xls", "read:start", "read:end"]);
    });

    test("a question that is answered while another workbook is being read: the answered one waits for that reading to end before it is read", async ({ page, app }) => {
        const watch = await watchReading(page);
        await openWatched(page, app, watch);
        expect(await dropFiles(page, [largeWorkbook(), WORKBOOK_B()])).toBe(true);
        await expect(app.importDialog).toBeVisible();
        // the second workbook is waiting for its frame; the first has asked its question
        await reachFrame(watch);
        await app.importPanel.getByRole("button", { name: words.IMPORT_LARGE_FILE_CONTINUE_TEXT, exact: true }).click();
        await fence(page);
        expect(await readingsOf(watch)).toEqual(["bytes:beta.xlsx"]);
        await page.clock.resume();
        await expect(app.importPanel.locator(".import-refusal")).toHaveText(words.IMPORT_WORKBOOK_UNREADABLE_REASON);
        await dialogReady(app);
        expect(await readingsOf(watch)).toEqual(["bytes:beta.xlsx", "read:start", "read:end", "read:nothing", "bytes:big.xls", "read:start", "read:end"]);
        await app.importTabs.nth(1).click();
        await expect(app.importPanel).toContainText("only_sheet");
    });
});

// ---- leaving while a workbook is being read ---------------------------------------------------------------------------------

test.describe("leaving the dialog while a workbook is being read", () => {
    // where the reading is, and how a test gets it there and lets it go
    const MOMENTS = {
        "while the library is on its way": {
            // what the reading that was left had read of the file by then
            read: [],
            hold: () => {},
            reach: (watch) => expect.poll(() => watch.requests()).toBe(1),
            go: async (watch, page) => {
                await page.clock.resume();
                watch.open();
            },
        },
        "during the zip check": {
            read: ["bytes:alpha.xlsx"],
            hold: (watch) => watch.holdNextTurn(),
            reach: (watch) => expect.poll(() => watch.trace()).toContain("turn-held"),
            go: async (watch, page) => {
                await page.clock.resume();
                await watch.releaseTurn();
            },
        },
        "at the frame before the library's one blocking call": {
            read: ["bytes:alpha.xlsx"],
            hold: () => {},
            reach: reachFrame,
            go: (watch, page) => page.clock.resume(),
        },
    };
    const LEAVES = {
        "Cancel": { leave: (app) => app.importCancel.click(), closes: true },
        "Escape": { leave: (app, page) => page.keyboard.press("Escape"), closes: true },
        "a second choice of files": { leave: (app) => app.chooseFiles(WORKBOOK_B()), closes: false },
    };

    for (const [momentName, moment] of Object.entries(MOMENTS)) {
        for (const [leaveName, { leave, closes }] of Object.entries(LEAVES)) {
            test(`${leaveName} ${momentName}: the library is never called for the reading that was left, nothing of it shows, and ${closes ? "the same file chosen again is read and imported" : "the new files are read and imported"}`, async ({ page, app, pageErrors }) => {
                const watch = await watchReading(page, { holdLibrary: momentName === "while the library is on its way" });
                await openWatched(page, app, watch);
                await moment.hold(watch);
                const handle = await databaseHandle(page);
                const tables = await schemaNames(app);
                await app.chooseFiles(WORKBOOK_A());
                await expect(app.importDialog).toBeVisible();
                await moment.reach(watch);
                await leave(app, page);
                if (closes) {
                    // (the page's clock is stopped, so a Run, which expectNothingLeft makes, would not come)
                    await expect(app.importDialog).toBeHidden();
                    expect(await isOpenDatabase(page, handle)).toBe(true);
                    expect(await schemaNames(app)).toEqual(tables);
                    expect(await eventKeys(page)).toEqual([]);
                } else {
                    await expect(app.importTabs).toHaveText(["beta.xlsx"]);
                    await expect(app.importDialog.locator(".import-reading")).toHaveCount(1);
                }
                // what was held is let go, and the clock runs again
                await moment.go(watch, page);
                if (closes) {
                    await app.chooseFiles(WORKBOOK_A());
                    await dialogReady(app);
                    await expect(app.importTabs).toHaveText(["alpha.xlsx"]);
                    await expect(app.importSheetStrip(words.importSheetsLabel("alpha.xlsx")).getByRole("tab")).toHaveCount(2);
                    await app.importSubmit.click();
                    await expect(app.importDialog).toBeHidden();
                    await expect(app.pane).toHaveAttribute("data-state", "report");
                    expect(await schemaNames(app)).toEqual(["first_sheet", "second_sheet"]);
                    expect(await app.rows("SELECT x FROM first_sheet ORDER BY x")).toEqual([[1], [2]]);
                } else {
                    await dialogReady(app);
                    await expect(app.importTabs).toHaveText(["beta.xlsx"]);
                    await expect(app.importDialog).not.toContainText("first_sheet");
                    await expect(app.importPanel).toContainText("only_sheet");
                    await app.importSubmit.click();
                    await expect(app.importDialog).toBeHidden();
                    await expect(app.pane).toHaveAttribute("data-state", "report");
                    expect(await schemaNames(app)).toEqual(["only_sheet"]);
                }
                // the file was read whole as far as the reading that was left had got, and then only for the reading that was kept, which called the library once for the file and then for the workbook that holds nothing
                expect(await readingsOf(watch)).toEqual([...moment.read, closes ? "bytes:alpha.xlsx" : "bytes:beta.xlsx", "read:start", "read:end", "read:nothing"]);
                expect(await watch.rejections()).toEqual([]);
                expect(pageErrors).toEqual([]);
            });
        }
    }
});

// A library that arrives when the dialog that asked for it has gone does nothing to the page.
test.describe("a library that arrives after the dialog has closed", () => {
    test("changes nothing: no dialog, no toast, no bytes read, no table, and the same workbook chosen again is read", async ({ page, app, pageErrors }) => {
        const watch = await watchReading(page, { holdLibrary: true });
        await app.open(BOTH_URL);
        await watch.install();
        await app.recordToasts();
        const handle = await databaseHandle(page);
        const tables = await schemaNames(app);
        await app.chooseFiles(WORKBOOK_A());
        await expect.poll(() => watch.requests()).toBe(1);
        await page.keyboard.press("Escape");
        await expect(app.importDialog).toBeHidden();
        watch.open();
        // the library is on the page now: it set its global when it arrived
        await expect.poll(() => page.evaluate(() => typeof window.XLSX)).toBe("object");
        await fence(page);
        await expect(app.importDialog).toBeHidden();
        await expect(page.locator("#import-dialog [role=tab]")).toHaveCount(0);
        await app.expectToasts([]);
        expect(await readingsOf(watch)).toEqual([]);
        expect(await isOpenDatabase(page, handle)).toBe(true);
        expect(await schemaNames(app)).toEqual(tables);
        expect(await eventKeys(page)).toEqual([]);
        // and it is not asked for again
        await app.chooseFiles(WORKBOOK_A());
        await dialogReady(app);
        await expect(app.importSheetStrip(words.importSheetsLabel("alpha.xlsx")).getByRole("tab")).toHaveCount(2);
        expect(watch.requests()).toBe(1);
        expect(await readingsOf(watch)).toEqual(["bytes:alpha.xlsx", "read:start", "read:end", "read:nothing"]);
        expect(pageErrors).toEqual([]);
    });
});

// ---- a library that cannot be loaded ------------------------------------------------------------------------------------

test.describe("a spreadsheet library that cannot be loaded", () => {
    // the workbook is refused in its tab with the library's own words, the CSV file beside it imports, and
    // the same workbook chosen again, once the library can be loaded, is read and imported
    async function expectRefusedThenRead(page, app, afterwards, { chosen = false } = {}) {
        if (!chosen) {
            await app.chooseFiles([WORKBOOK_A(), csvFile("people.csv")]);
        }
        await dialogReady(app);
        await expect(app.importTabs.nth(0)).toHaveAccessibleName(`alpha.xlsx (${words.IMPORT_REFUSED_TAB_TEXT})`);
        await app.importTabs.nth(0).click();
        await expect(app.importPanel.locator(".import-refusal")).toHaveText(words.IMPORT_WORKBOOK_LIBRARY_FAILED_REASON);
        await expect(app.importDialog.locator(".import-sheet-panel")).toHaveCount(0);
        await app.importSubmit.click();
        await expect(app.importDialog).toBeHidden();
        await expect(app.pane).toHaveAttribute("data-state", "report");
        expect(await schemaNames(app)).toEqual(["people"]);
        expect((await eventsOfOpen(page)).map((event) => event.lines)).toEqual([[`file: people.csv, ${csvFile("people.csv").buffer.length} bytes`, "table: people, 2 rows, 2 columns"]]);
        await afterwards();
        await app.chooseFiles(WORKBOOK_A());
        await dialogReady(app);
        await expect(app.importDialog.locator(".import-refusal")).toHaveCount(0);
        await expect(app.importSheetStrip(words.importSheetsLabel("alpha.xlsx")).getByRole("tab")).toHaveCount(2);
        await app.importSubmit.click();
        await expect(app.importDialog).toBeHidden();
        await expect(app.pane).toHaveAttribute("data-state", "report");
        expect(await schemaNames(app)).toEqual(["first_sheet", "second_sheet"]);
    }

    const FAILURES = {
        "is answered with a 404 and a page": (route) => route.fulfill({ status: 404, contentType: "text/html", body: "<!doctype html><title>Not found</title><h1>404</h1>" }),
        "is answered with a file that is not the library": (route) => route.fulfill({ status: 200, contentType: "text/javascript", body: "/* not the library */" }),
    };
    for (const [name, answer] of Object.entries(FAILURES)) {
        test(`a request for the library that ${name} refuses the workbook with the reader's own words, and the CSV file beside it imports`, async ({ page, app }) => {
            await page.route(LIBRARY_ROUTE, answer);
            await app.open(BOTH_URL);
            await expectRefusedThenRead(page, app, () => page.unroute(LIBRARY_ROUTE));
            await expect(app.pane).toHaveAttribute("data-state", "report");
        });
    }

    test("a request that is never answered refuses the workbook when the page's clock has passed the time the loader waits, and the same workbook is read once the library can come", async ({ page, app }) => {
        const held = await holdVendor(page, "xlsx.full.min.js");
        await page.clock.install({ time: CLOCK });
        await app.open(BOTH_URL);
        await page.clock.pauseAt(new Date(CLOCK.getTime() + 60_000));
        await app.chooseFiles([WORKBOOK_A(), csvFile("people.csv")]);
        await expect.poll(() => held.requests()).toBe(1);
        // (both files are being looked at: the CSV file's turn comes when the workbook has been dealt with)
        await expect(app.importDialog.locator(".import-reading")).toHaveCount(2);
        // (not before the time is up)
        await page.clock.runFor(words.VENDOR_LOAD_TIMEOUT_MS - 1);
        await expect(app.importDialog.locator(".import-reading")).toHaveCount(2);
        await page.clock.runFor(1);
        await page.clock.resume();
        await expectRefusedThenRead(
            page,
            app,
            async () => {
                // (the request that was not answered is answered now: the library arrives late, or is asked for again)
                held.open();
            },
            { chosen: true }
        );
    });
});

// ---- while an import of sheets runs ---------------------------------------------------------------------------------------

// A course database that is not the default one (none when only one ships), and an exercise set that the
// site can open, and another: the tests that need them are skipped, or lose only the part that needs the
// other one, when the site ships fewer (as in tests/aw2-import-page.spec.js).
const OTHER_DATASET = realManifest().datasets.find((entry) => entry.id !== DEFAULT_DATASET.id);
const NO_OTHER_DATASET = "only one course database ships";
const SETS = openableSets();
const SET = SETS[0];
const OTHER_SET = SETS.find((set) => set.id !== SET?.id);

// A workbook of two sheets is imported, and the import is held after the first table is made, where its
// dialog says "Importing table 1 of 2: first_sheet (alpha.xlsx)": whatever the machine's speed, it runs
// until the test lets it go. Returns the gate.
async function holdSheets(page, app, { into = "new", files = WORKBOOK_A() } = {}) {
    const gate = await gateTurns(page);
    await app.chooseFiles(files);
    await dialogReady(app);
    if (into === "open") {
        await app.importDialog.locator("#import-into-open").check();
    }
    await gate.at(/Importing table 1 of 2: first_sheet \(alpha\.xlsx\)/, words.IMPORT_PROGRESS_COPYING);
    await expect(app.importSubmit).toBeEnabled();
    await app.importSubmit.click();
    await expect.poll(() => gate.held()).toBe(true);
    await expect(app.importDialog.locator("#import-progress-title")).toHaveText(words.importProgressTableTitle(1, 2, "first_sheet", "alpha.xlsx"));
    return gate;
}

// the held import goes on, and ends with its report: the two tables are there, in a database named after the file
async function finishSheets(page, app, gate) {
    await gate.release();
    await expect(app.importDialog).toBeHidden();
    await expect(app.pane).toHaveAttribute("data-state", "report");
    await expect(app.databaseLabel).toHaveText("alpha");
    expect(await schemaNames(app)).toEqual(["first_sheet", "second_sheet"]);
    expect(await app.rows("SELECT x FROM first_sheet ORDER BY x")).toEqual([[1], [2]]);
}

// toasts shown so far, waiting until one more has come
const toastsAfter = async (app, count) => {
    await expect.poll(async () => (await app.toasts()).length).toBe(count);
    return app.toasts();
};

test.describe("while an import of sheets runs, what could change the open database is refused with the import's words", () => {
    test("Run is refused in a toast: nothing is run and nothing is logged; the import ends, and a Run then works", async ({ page, app }) => {
        await app.open(BOTH_URL);
        await app.editor.fill("SELECT 1 AS one;");
        await app.recordToasts();
        const paneBefore = await app.pane.getAttribute("data-state");
        const gate = await holdSheets(page, app);
        await page.evaluate(() => window.app.actions.executeCurrent());
        await toastsAfter(app, 1);
        await app.expectToasts([words.IMPORT_BUSY_MESSAGE]);
        await expect(app.pane).toHaveAttribute("data-state", paneBefore);
        expect(await app.readLog("northlight")).toBeNull();
        await finishSheets(page, app, gate);
        expect(await app.query("SELECT count(*) AS n FROM first_sheet")).toEqual({ columns: ["n"], rows: [["2"]] });
        expect(await app.readLog("file:alpha")).toHaveLength(1);
    });

    test("the database export is refused in a toast: no dialog opens and nothing is downloaded", async ({ page, app }) => {
        await app.open(BOTH_URL);
        await app.recordToasts();
        let downloads = 0;
        page.on("download", () => downloads++);
        const gate = await holdSheets(page, app);
        await page.evaluate(() => {
            document.querySelector("#export-button").click();
            document.querySelector("#export-db").click();
        });
        await toastsAfter(app, 1);
        await app.expectToasts([words.IMPORT_BUSY_MESSAGE]);
        await expect(page.locator("#export-dialog[open]")).toHaveCount(0);
        expect(downloads).toBe(0);
        await finishSheets(page, app, gate);
        // afterwards the export is offered again, for the database that the import made
        await app.openExportMenu();
        await page.locator("#export-db").click();
        await expect(page.locator("#export-dialog")).toBeVisible();
        await expect(page.locator("#export-name")).toHaveValue("alpha");
    });

    test("the export of tables is refused in a toast: no dialog opens; afterwards it lists the tables that the import made", async ({ page, app }) => {
        await app.open(`${BOTH_URL},export`);
        await app.recordToasts();
        const gate = await holdSheets(page, app);
        await page.evaluate(() => {
            document.querySelector("#export-button").click();
            document.querySelector("#export-tables").click();
        });
        await toastsAfter(app, 1);
        await app.expectToasts([words.IMPORT_BUSY_MESSAGE]);
        await expect(page.locator("#export-tables-dialog[open]")).toHaveCount(0);
        await finishSheets(page, app, gate);
        await app.openTables();
        await app.waitCounted();
        expect((await app.tablesRows()).map((row) => row.name)).toEqual(["first_sheet", "second_sheet"]);
    });

    test("picking another course database is refused, and the switcher shows what is open again", async ({ page, app }) => {
        test.skip(!OTHER_DATASET, NO_OTHER_DATASET);
        await app.open(`./?db=${OTHER_DATASET.id}&preview=import,excel-import`);
        await app.recordToasts();
        const handle = await databaseHandle(page);
        const gate = await holdSheets(page, app);
        await page.evaluate((id) => {
            document.querySelector("#database-button").click();
            document.querySelector(`[data-dataset-id="${id}"]`).click();
        }, DEFAULT_DATASET.id);
        await toastsAfter(app, 1);
        await app.expectToasts([words.IMPORT_BUSY_MESSAGE]);
        expect(await isOpenDatabase(page, handle)).toBe(true);
        await expect(app.databaseItem(OTHER_DATASET.id)).toHaveAttribute("aria-checked", "true");
        await expect(app.databaseItem(DEFAULT_DATASET.id)).toHaveAttribute("aria-checked", "false");
        await expect(page).toHaveURL(new RegExp(`db=${OTHER_DATASET.id}`));
        await finishSheets(page, app, gate);
    });

    test("Ctrl+O opens no file chooser, Ctrl+U no dialog, and the entries of the switcher none either: each says why in a toast", async ({ page, app }) => {
        await app.open(BOTH_URL);
        await app.recordToasts();
        let choosers = 0;
        page.on("filechooser", () => choosers++);
        const gate = await holdSheets(page, app);
        await page.keyboard.press("Control+o");
        await toastsAfter(app, 1);
        await page.keyboard.press("Control+u");
        await toastsAfter(app, 2);
        await page.evaluate(() => {
            document.querySelector("#database-button").click();
            document.querySelector("#open-file").click();
        });
        await toastsAfter(app, 3);
        await page.evaluate(() => {
            document.querySelector("#database-button").click();
            document.querySelector("#open-url").click();
        });
        await toastsAfter(app, 4);
        expect(new Set(await app.toasts())).toEqual(new Set([words.IMPORT_BUSY_MESSAGE]));
        expect(choosers).toBe(0);
        await expect(page.locator("#open-url-dialog[open]")).toHaveCount(0);
        await finishSheets(page, app, gate);
    });

    test("a workbook that is chosen meanwhile is refused in a toast: the dialog keeps its files, and the import ends with them alone", async ({ page, app }) => {
        await app.open(BOTH_URL);
        await app.recordToasts();
        const gate = await holdSheets(page, app);
        await app.chooseFiles([WORKBOOK_B(), csvFile("later.csv")]);
        await toastsAfter(app, 1);
        await app.expectToasts([words.IMPORT_BUSY_MESSAGE]);
        // (the tabs are out of sight while an import runs, so they are counted in the dialog's tree: the file's, and one for each of its two sheets)
        await expect(app.importDialog.locator('[role="tablist"][aria-label="Files"] > [role="tab"]')).toHaveCount(1);
        await expect(app.importDialog.locator('[role="tablist"][aria-label="Files"] > [role="tab"]').first()).toContainText("alpha.xlsx");
        expect(await page.locator("#open-file-input").evaluate((input) => input.files.length)).toBe(0);
        await finishSheets(page, app, gate);
        await app.expectToasts([words.IMPORT_BUSY_MESSAGE, words.importedMessage(2, "alpha")]);
    });

    test("a drop of a workbook, of CSV files and of a database is ignored: nothing changes, and the import ends with its own tables", async ({ page, app }) => {
        await app.open(BOTH_URL);
        await app.recordToasts();
        const handle = await databaseHandle(page);
        const gate = await holdSheets(page, app);
        const href = await page.evaluate(() => location.href);
        expect(await app.dropFiles([WORKBOOK_B(), csvFile("more.csv")], { target: "#results-pane" })).toBe(true);
        expect(await app.dropFiles(SAMPLE_FILE)).toBe(true);
        await fence(page);
        expect(await isOpenDatabase(page, handle)).toBe(true);
        expect(await page.evaluate(() => location.href)).toBe(href);
        await expect(app.importDialog.locator(".import-progress")).toBeVisible();
        await finishSheets(page, app, gate);
        await app.expectToasts([words.importedMessage(2, "alpha")]);
    });

    test("Back and Forward open nothing, say so in a toast, and put the address back", async ({ page, app }) => {
        test.skip(!OTHER_DATASET, NO_OTHER_DATASET);
        await app.open(`./?db=${OTHER_DATASET.id}&preview=import,excel-import`);
        // a history of the page's own: a course database that is not the default, the default one, and back to the first
        await app.pickDatabaseById(DEFAULT_DATASET.id);
        await expect(page).toHaveURL(new RegExp(`db=${DEFAULT_DATASET.id}`));
        await page.evaluate(() => history.back());
        await expect(page).toHaveURL(new RegExp(`db=${OTHER_DATASET.id}`));
        await expect(app.databaseLabel).toHaveText(OTHER_DATASET.name);
        await app.waitReady();
        await expect(app.toast).toContainText(`Opened ${OTHER_DATASET.name}`);
        await app.recordToasts();
        const handle = await databaseHandle(page);
        const gate = await holdSheets(page, app);
        const href = await page.evaluate(() => location.href);
        await page.evaluate(() => history.forward());
        await toastsAfter(app, 1);
        await expect.poll(() => page.evaluate(() => location.href)).toBe(href);
        await page.evaluate(() => history.back());
        await toastsAfter(app, 2);
        await expect.poll(() => page.evaluate(() => location.href)).toBe(href);
        expect(await isOpenDatabase(page, handle)).toBe(true);
        await expect(app.databaseLabel).toHaveText(OTHER_DATASET.name);
        expect(new Set(await app.toasts())).toEqual(new Set([words.IMPORT_BUSY_MESSAGE]));
        await finishSheets(page, app, gate);
    });

    test("Check checks nothing and marks nothing, and the set picker keeps the open set", async ({ page, app }) => {
        test.skip(!SET, "no exercise set that the site can open ships");
        await page.goto(`./?set=${SET.id}&preview=import,excel-import`);
        await expect(app.exercisePanel).toBeVisible();
        await app.waitReady();
        await app.editor.fill(SET.exercises[0].model_query);
        await app.recordToasts();
        const pickerBefore = await app.setPicker.getAttribute("aria-label");
        const handle = await databaseHandle(page);
        const gate = await holdSheets(page, app);
        let asked = 0;
        // a Check, then another set (when the site has one), then None: each is refused, and each says so before the next is tried
        await page.evaluate(() => document.querySelector("#exercise-check").click());
        await toastsAfter(app, ++asked);
        await expect(app.feedback).toBeEmpty();
        await expect(app.progress).toHaveText(`0 of ${SET.exercises.length} complete`);
        expect((await page.evaluate((key) => JSON.parse(localStorage.getItem(key) ?? "null"), progressKey(SET)))?.passed ?? {}).toEqual({});
        await expect(app.pane).not.toHaveAttribute("data-state", "result");
        for (const label of [...(OTHER_SET ? [OTHER_SET.title] : []), "None"]) {
            await page.evaluate((text) => {
                document.querySelector("#exercise-set-picker").click();
                [...document.querySelectorAll('#exercise-set-menu [role="menuitemradio"]')].find((el) => el.textContent.trim() === text).click();
            }, label);
            await toastsAfter(app, ++asked);
            await expect(app.setPicker).toHaveAttribute("aria-label", pickerBefore);
            await expect(page).toHaveURL(new RegExp(`set=${SET.id}`));
            await expect(app.exercisePanel).toBeVisible();
        }
        expect(await isOpenDatabase(page, handle)).toBe(true);
        expect(new Set(await app.toasts())).toEqual(new Set([words.IMPORT_BUSY_MESSAGE]));
        await gate.release();
        await expect(app.importDialog).toBeHidden();
        await expect(app.pane).toHaveAttribute("data-state", "report");
    });
});

// ---- keys in the dialog while an import of sheets runs -----------------------------------------------------------------------

test.describe("keys in the dialog while an import of sheets runs", () => {
    test("Enter held on Import starts the import and does not press Cancel: the import ends with its tables, and no toast but its own", async ({ page, app }) => {
        await app.open(BOTH_URL);
        await app.recordToasts();
        const gate = await gateTurns(page);
        await app.chooseFiles(WORKBOOK_A());
        await dialogReady(app);
        await gate.at(/Importing table 1 of 2: first_sheet/, words.IMPORT_PROGRESS_COPYING);
        await expect(app.importSubmit).toBeEnabled();
        await app.importSubmit.focus();
        await page.keyboard.down("Enter");
        await expect.poll(() => gate.held()).toBe(true);
        await expect(app.importDialog.locator(".import-progress")).toBeVisible();
        await expect(app.importCancel).toBeFocused();
        // the key goes on repeating (a press while the key is down is an auto-repeat)
        await page.keyboard.down("Enter");
        await page.keyboard.down("Enter");
        await page.keyboard.up("Enter");
        await expect(app.importDialog.locator(".import-progress")).toBeVisible();
        await expect(app.importCancel).toBeFocused();
        await finishSheets(page, app, gate);
        await app.expectToasts([words.importedMessage(2, "alpha")]);
    });

    test("Tab and Shift+Tab never take the focus to the page behind the dialog while it runs", async ({ page, app }) => {
        await app.open(BOTH_URL);
        const gate = await holdSheets(page, app);
        // (the browser's own turn through its window can leave the focus on the page as a whole for a press; no control of the page behind has it)
        const behind = () => page.evaluate(() => document.activeElement !== null && document.activeElement !== document.body && !document.querySelector("#import-dialog").contains(document.activeElement));
        for (const key of ["Tab", "Tab", "Tab", "Shift+Tab", "Shift+Tab", "Shift+Tab", "Shift+Tab"]) {
            await page.keyboard.press(key);
            expect(await behind(), `after ${key}`).toBe(false);
        }
        await expect(app.importDialog.locator(".import-progress")).toBeVisible();
        await finishSheets(page, app, gate);
    });
});

// ---- a database that opens under the dialog ------------------------------------------------------------------------------

// waits until the open database is another one than `before`, and the page is ready
async function expectOpened(page, app, before) {
    await page.waitForFunction((old) => window.app.database !== old, before);
    await app.waitReady();
}

// whether the keyboard focus is on nothing in particular (the body, or no element)
const focusIsOnBody = (page) => page.evaluate(() => document.activeElement === null || document.activeElement === document.body);

test.describe("Back and Forward under the dialog of a workbook close it, and nothing is imported", () => {
    // the dialog holds nothing of the workbook any more: no tab, no panel, no sheet
    const expectNoSheets = (page) => expect(page.locator("#import-dialog [role=tab], #import-dialog .import-sheet-panel, #import-dialog .import-panel")).toHaveCount(0);

    // a fresh visit (whose tables are noted), a file database, and the dialog open for the workbook
    async function openUnderDialog(page, app) {
        await app.open(FLAGS);
        const course = await schemaNames(app);
        await app.upload(SAMPLE_FILE);
        return course;
    }

    test("Back while the sheets are on show: the dialog closes with no sheet of it left, the course database that opens is as a fresh visit has it, and the page is free", async ({ page, app, pageErrors }) => {
        const course = await openUnderDialog(page, app);
        await app.chooseFiles(WORKBOOK_A());
        await dialogReady(app);
        await expect(app.importSheetStrip(words.importSheetsLabel("alpha.xlsx")).getByRole("tab")).toHaveCount(2);
        const before = await databaseHandle(page);
        await page.goBack();
        await expectOpened(page, app, before);
        await expect(app.importDialog).toBeHidden();
        await expectNoSheets(page);
        await expect(app.databaseLabel).toHaveText(DEFAULT_DATASET.name);
        expect(await schemaNames(app)).toEqual(course);
        expect(await eventKeys(page)).toEqual([]);
        expect(pageErrors).toEqual([]);
        expect(await focusIsOnBody(page)).toBe(false);
        // the page is free: a Run works, and the same workbook chosen now opens the dialog with its sheets
        expect(await app.query("SELECT 1 AS one")).toEqual({ columns: ["one"], rows: [["1"]] });
        await app.chooseFiles(WORKBOOK_A());
        await dialogReady(app);
        await expect(app.importSheetStrip(words.importSheetsLabel("alpha.xlsx")).getByRole("tab")).toHaveCount(2);
    });

    test("Forward does the same", async ({ page, app, pageErrors }) => {
        await app.open(FLAGS);
        await app.upload(SAMPLE_FILE);
        await page.goBack();
        await app.waitReady();
        await expect(app.databaseLabel).toHaveText(DEFAULT_DATASET.name);
        const course = await schemaNames(app);
        await app.chooseFiles(WORKBOOK_A());
        await dialogReady(app);
        const before = await databaseHandle(page);
        await page.goForward();
        await expectOpened(page, app, before);
        await expect(app.importDialog).toBeHidden();
        await expectNoSheets(page);
        // (the address of the uploaded file is "./": the default course database opens again)
        await expect(app.databaseLabel).toHaveText(DEFAULT_DATASET.name);
        expect(await schemaNames(app)).toEqual(course);
        expect(await eventKeys(page)).toEqual([]);
        expect(pageErrors).toEqual([]);
        expect(await focusIsOnBody(page)).toBe(false);
    });

    test("Back while the workbook is still being read (the library is on its way): the dialog closes, and when the library arrives nothing is read and nothing shows", async ({ page, app, pageErrors }) => {
        const watch = await watchReading(page, { holdLibrary: true });
        await app.open(FLAGS);
        await watch.install();
        const course = await schemaNames(app);
        await app.upload(SAMPLE_FILE);
        await app.chooseFiles(WORKBOOK_A());
        await expect(app.importDialog).toBeVisible();
        await expect.poll(() => watch.requests()).toBe(1);
        const before = await databaseHandle(page);
        await page.goBack();
        await expectOpened(page, app, before);
        await expect(app.importDialog).toBeHidden();
        watch.open();
        await expect.poll(() => page.evaluate(() => typeof window.XLSX)).toBe("object");
        await fence(page);
        await expectNoSheets(page);
        await expect(app.importDialog).toBeHidden();
        expect(await readingsOf(watch)).toEqual([]);
        expect(await schemaNames(app)).toEqual(course);
        expect(await eventKeys(page)).toEqual([]);
        expect(await watch.rejections()).toEqual([]);
        expect(pageErrors).toEqual([]);
        // the same workbook chosen again is read, with the library that is there
        await app.chooseFiles(WORKBOOK_A());
        await dialogReady(app);
        await expect(app.importSheetStrip(words.importSheetsLabel("alpha.xlsx")).getByRole("tab")).toHaveCount(2);
        expect(await watch.reads()).toBe(1);
    });

    test("Back while the question for a large workbook is showing: the dialog closes, and nothing of the workbook is read or kept", async ({ page, app, pageErrors }) => {
        const watch = await watchReading(page);
        await app.open(FLAGS);
        await watch.install();
        await app.upload(SAMPLE_FILE);
        expect(await dropFiles(page, [largeWorkbook()])).toBe(true);
        await expect(app.importDialog.locator(".import-warning-text")).toHaveCount(1);
        const before = await databaseHandle(page);
        await page.goBack();
        await expectOpened(page, app, before);
        await expect(app.importDialog).toBeHidden();
        await expectNoSheets(page);
        await expect(page.locator("#import-dialog .import-warning-text")).toHaveCount(0);
        expect(await readingsOf(watch)).toEqual([]);
        expect(await eventKeys(page)).toEqual([]);
        expect(pageErrors).toEqual([]);
    });
});

// ---- a choice and a drop of a workbook --------------------------------------------------------------------------------------

test.describe("a drop of a workbook is a choice, wherever it lands", () => {
    for (const target of ["#results-pane", ".topbar", "#editor", "#sidebar"]) {
        test(`on ${target}: the dialog opens with the workbook's sheets, and no text goes in the editor`, async ({ page, app }) => {
            await app.open(BOTH_URL);
            const editor = await editorValue(page);
            expect(await app.dropFiles(WORKBOOK_A(), { target })).toBe(true);
            await dialogReady(app);
            await expect(app.importTabs).toHaveText(["alpha.xlsx"]);
            await expect(app.importSheetStrip(words.importSheetsLabel("alpha.xlsx")).getByRole("tab")).toHaveCount(2);
            expect(await editorValue(page)).toBe(editor);
        });
    }

    test("a workbook and a CSV file dropped together are two tabs, and names in capitals are taken as import files", async ({ app }) => {
        await app.open(BOTH_URL);
        expect(await app.dropFiles([{ ...WORKBOOK_B(), name: "DATA.XLSX" }, csvFile("Notes.TXT")])).toBe(true);
        await dialogReady(app);
        await expect(app.importTabs).toHaveText(["DATA.XLSX", "Notes.TXT"]);
        await expect(app.importPanel).toContainText("only_sheet");
    });

    for (const how of ["chosen", "dropped"]) {
        test(`a workbook and a database ${how} together are refused in a toast, with no dialog, and the editor and the database are left as they were`, async ({ page, app }) => {
            await app.open(BOTH_URL);
            await app.recordToasts();
            const handle = await databaseHandle(page);
            const editor = await editorValue(page);
            const database = { name: "sample.db", mimeType: "application/octet-stream", buffer: fs.readFileSync(SAMPLE_FILE) };
            if (how === "chosen") {
                await app.chooseFiles([WORKBOOK_B(), database]);
            } else {
                expect(await app.dropFiles([WORKBOOK_B(), database], { target: "#editor" })).toBe(true);
            }
            await app.expectToasts([words.IMPORT_MIXED_WITH_EXCEL_MESSAGE]);
            await expect(page.locator("#import-dialog[open]")).toHaveCount(0);
            expect(await isOpenDatabase(page, handle)).toBe(true);
            expect(await editorValue(page)).toBe(editor);
        });
    }

    test("a workbook dropped while the import's dialog is open is ignored: the dialog keeps its files, and is not opened again for the new ones", async ({ page, app }) => {
        await app.open(BOTH_URL);
        await app.recordToasts();
        await app.chooseFiles(WORKBOOK_A());
        await dialogReady(app);
        expect(await app.dropFiles([WORKBOOK_B(), csvFile("later.csv")])).toBe(true);
        await fence(page);
        await expect(app.importTabs).toHaveText(["alpha.xlsx"]);
        await app.expectToasts([]);
    });

    test("a workbook dropped while the export's dialog is open is ignored: the export dialog stays, and no import dialog opens", async ({ page, app }) => {
        await app.open(`${BOTH_URL},export`);
        await app.recordToasts();
        const handle = await databaseHandle(page);
        await app.openExportMenu();
        await page.locator("#export-db").click();
        await expect(page.locator("#export-dialog")).toBeVisible();
        expect(await app.dropFiles(WORKBOOK_B(), { target: "#export-dialog" })).toBe(true);
        await fence(page);
        await app.expectToasts([]);
        await expect(page.locator("#export-dialog")).toBeVisible();
        await expect(page.locator("#import-dialog[open]")).toHaveCount(0);
        expect(await isOpenDatabase(page, handle)).toBe(true);
    });
});

test.describe("a workbook that comes while a database loads is refused in a toast, and no dialog opens", () => {
    const deliver = {
        chosen: (app) => app.chooseFiles(WORKBOOK_A()),
        dropped: async (app) => expect(await app.dropFiles(WORKBOOK_A(), { target: "#results-pane" })).toBe(true),
    };

    for (const how of ["chosen", "dropped"]) {
        test(`${how} during the page's very first load; once it has loaded the same workbook opens the dialog with its sheets`, async ({ page, app }) => {
            const held = await holdDataset(page);
            await app.recordToasts({ fromStart: true });
            await page.goto(FLAGS);
            await held.requested;
            await deliver[how](app);
            await expect.poll(() => app.toasts()).toContain(words.IMPORT_LOADING_MESSAGE);
            expect(new Set(await app.toasts())).toEqual(new Set([words.IMPORT_LOADING_MESSAGE]));
            await expect(page.locator("#import-dialog[open]")).toHaveCount(0);
            held.release();
            await app.waitReady();
            await deliver[how](app);
            await dialogReady(app);
            await expect(app.importSheetStrip(words.importSheetsLabel("alpha.xlsx")).getByRole("tab")).toHaveCount(2);
        });
    }

    for (const how of ["chosen", "dropped"]) {
        test(`${how} while a course database is picked and on its way: the open database is not touched, and the load goes on`, async ({ page, app }) => {
            test.skip(!OTHER_DATASET, NO_OTHER_DATASET);
            await app.open(`./?db=${OTHER_DATASET.id}&preview=import,excel-import`);
            await app.recordToasts();
            const handle = await databaseHandle(page);
            const held = await holdDataset(page);
            await app.pickDatabaseById(DEFAULT_DATASET.id);
            await held.requested;
            await expect(app.pane).toHaveAttribute("data-state", "loading");
            await deliver[how](app);
            await expect.poll(() => app.toasts()).toContain(words.IMPORT_LOADING_MESSAGE);
            expect(new Set(await app.toasts())).toEqual(new Set([words.IMPORT_LOADING_MESSAGE]));
            await expect(page.locator("#import-dialog[open]")).toHaveCount(0);
            expect(await isOpenDatabase(page, handle)).toBe(true);
            held.release();
            await expectOpened(page, app, handle);
            await expect(app.databaseLabel).toHaveText(DEFAULT_DATASET.name);
        });
    }
});

// ---- the flags ---------------------------------------------------------------------------------------------------------------

// the requests for the spreadsheet library that a page makes from now on
function libraryRequests(page) {
    const asked = [];
    page.on("request", (request) => {
        if (/\/vendor\/xlsx\.full\.min\.js/.test(request.url())) {
            asked.push(request.url());
        }
    });
    return asked;
}

test.describe("the flags: excel-import does nothing without import, and import alone refuses a workbook", () => {
    // A visit in a context of its own (nothing stored by an earlier one), and what it shows and asks for:
    // the elements of its page, the requests it made, the keys it stored, the file input, the libraries on
    // the page, the dialogs open and the error band. `then` is what the visit does after it has loaded.
    async function visit(browser, baseURL, address, then = async () => {}) {
        const context = await browser.newContext({ baseURL });
        try {
            const page = await context.newPage();
            page.on("filechooser", () => {});
            const app = new App(page);
            const requests = [];
            page.on("request", (request) => requests.push(new URL(request.url()).pathname));
            await app.open(address);
            await page.waitForLoadState("networkidle");
            await then(page, app);
            await page.waitForLoadState("networkidle");
            return {
                requests: [...new Set(requests)].sort(),
                keys: await page.evaluate(() => Object.keys(localStorage).sort()),
                elements: await page.evaluate(() => [...new Set([...document.querySelectorAll("*")].map((el) => `${el.localName}#${el.id}.${el.getAttribute("class") ?? ""}`))].sort()),
                input: await page.locator("#open-file-input").evaluate((el) => ({ multiple: el.multiple, accept: el.getAttribute("accept") })),
                globals: await page.evaluate(() => ({ Papa: typeof window.Papa, XLSX: typeof window.XLSX })),
                dialogs: await page.locator("dialog[open]").count(),
                menu: await page.evaluate(() => document.querySelector("#open-file")?.textContent),
                band: (await app.errorBand.count()) ? await app.errorBand.first().textContent() : null,
            };
        } finally {
            await context.close();
        }
    }
    const asksForLibrary = (seen) => seen.requests.some((path) => /xlsx/i.test(path));

    test("excel-import without import is a visit with no flag at all: a workbook chosen or dropped is tried as a database as ever, with the same band, elements, requests and stored keys, and no library is asked for", async ({ browser, baseURL }) => {
        const choose = async (page, app) => {
            await app.chooseFiles(fixturePath("shopping_db.xlsx"));
            await expect(app.errorBand).toBeVisible();
            expect(await app.dropFiles(fixturePath("shopping_db.xlsx"), { target: "#results-pane" })).toBe(true);
        };
        const none = await visit(browser, baseURL, NORTHLIGHT_URL, choose);
        const only = await visit(browser, baseURL, `${NORTHLIGHT_URL}&preview=excel-import`, choose);
        expect(none.band).toMatch(/not a database/i);
        expect(none.dialogs).toBe(0);
        expect(none.input).toEqual({ multiple: false, accept: null });
        expect(asksForLibrary(none)).toBe(false);
        expect(only).toEqual(none);
    });

    test("with import alone a workbook is refused in its tab with the old words, whatever it is called or how it is given, and the library is never requested", async ({ page, app }) => {
        const asked = libraryRequests(page);
        await app.open(NORTHLIGHT_IMPORT_URL_ONLY);
        for (const name of ["shopping_db.xlsx", "excel/shopping_db.xls", "impostors/renamed_xlsx.csv", "impostors/html_table.xls", "impostors/spreadsheetml_2003.xls"]) {
            await app.chooseFiles(fixturePath(name));
            await dialogReady(app);
            await expect(app.importTabs.first(), name).toHaveAccessibleName(`${BASENAME(name)} (${words.IMPORT_REFUSED_TAB_TEXT})`);
            await expect(app.importPanel.locator(".import-refusal"), name).toHaveText(words.IMPORT_WORKBOOK_REASON);
            await app.importCancel.click();
            await expect(app.importDialog).toBeHidden();
        }
        // dropped beside a CSV file: the workbook is refused, the CSV file is imported
        expect(await app.dropFiles([fixturePath("shopping_db.xlsx"), csvFile("people.csv")])).toBe(true);
        await dialogReady(app);
        await expect(app.importTabs).toHaveCount(2);
        await expect(app.importTabs.nth(0)).toHaveAccessibleName(`shopping_db.xlsx (${words.IMPORT_REFUSED_TAB_TEXT})`);
        await expect(app.importTabs.nth(1)).toHaveAccessibleName("people.csv");
        await app.importSubmit.click();
        await expect(app.importDialog).toBeHidden();
        await expect(app.pane).toHaveAttribute("data-state", "report");
        expect(await schemaNames(app)).toEqual(["people"]);
        expect(asked).toEqual([]);
        expect(await page.evaluate(() => typeof window.XLSX)).toBe("undefined");
    });

    test("the flag is read once, when the page loads: with both on, a workbook is still read after a database was opened and the address lost its flags, or when it names only one", async ({ page, app }) => {
        await app.open(BOTH_URL);
        await app.upload(SAMPLE_FILE);
        expect(await page.evaluate(() => location.search)).toBe("");
        await app.chooseFiles(WORKBOOK_A());
        await dialogReady(app);
        await expect(app.importSheetStrip(words.importSheetsLabel("alpha.xlsx")).getByRole("tab")).toHaveCount(2);
        await app.importCancel.click();
        await expect(app.importDialog).toBeHidden();
        await page.evaluate(() => history.replaceState(null, "", "./?preview=import"));
        expect(await app.dropFiles(WORKBOOK_B())).toBe(true);
        await dialogReady(app);
        await expect(app.importPanel).toContainText("only_sheet");
        await expect(app.importDialog.locator(".import-refusal")).toHaveCount(0);
    });

    test("the flag is read once, when the page loads: with import alone, an address that gains excel-import afterwards changes nothing, and a workbook is refused", async ({ page, app }) => {
        const asked = libraryRequests(page);
        await app.open(NORTHLIGHT_IMPORT_URL_ONLY);
        await page.evaluate(() => history.replaceState(null, "", "./?db=northlight&preview=import,excel-import"));
        await app.chooseFiles(fixturePath("shopping_db.xlsx"));
        await dialogReady(app);
        await expect(app.importPanel.locator(".import-refusal")).toHaveText(words.IMPORT_WORKBOOK_REASON);
        expect(await page.evaluate(() => document.querySelector("#open-file").textContent)).not.toContain("Excel");
        expect(asked).toEqual([]);
    });

    test("with both flags a first visit asks for neither library and stores nothing: its requests, stored keys, elements and globals are those of a visit with no flag, and the three texts that differ are the only difference", async ({ browser, baseURL }) => {
        const none = await visit(browser, baseURL, NORTHLIGHT_URL);
        const alone = await visit(browser, baseURL, NORTHLIGHT_IMPORT_URL_ONLY);
        const both = await visit(browser, baseURL, BOTH_URL);
        expect(both.keys).toEqual([]);
        expect(both.globals).toEqual({ Papa: "undefined", XLSX: "undefined" });
        expect(both.requests.filter((path) => /papaparse|xlsx|fflate/i.test(path))).toEqual([]);
        expect(both.dialogs).toBe(0);
        expect(both.requests).toEqual(alone.requests);
        expect(both.keys).toEqual(none.keys);
        expect(both.elements).toEqual(alone.elements);
        expect(both.input).toEqual(alone.input);
    });
});

// ---- after an import of a workbook ---------------------------------------------------------------------------------------

test.describe("after an import of a workbook into a new database", () => {
    const SHOPPING = "shopping_db.xlsx";

    test("the address is the plain page, the title, the switcher and the status bar name the database, a toast says how many tables, and the report is on show", async ({ page, app, baseURL }) => {
        await app.open(BOTH_URL);
        await app.recordToasts();
        await app.importFiles(fixturePath(SHOPPING));
        expect(page.url()).toBe(new URL("./", baseURL).href);
        expect(await page.evaluate(() => [location.search, location.hash])).toEqual(["", ""]);
        await expect(page).toHaveTitle(/^shopping_db - /);
        await expect(app.databaseLabel).toHaveText("shopping_db");
        expect(await page.evaluate(() => window.app.database.name)).toBe("shopping_db");
        // (the count is of tables, not of files: four sheets, one workbook)
        const said = words.importedMessage(4, "shopping_db");
        expect(said).toBe("Imported 4 tables into shopping_db");
        await expect(app.summary).toContainText(said);
        await app.expectToasts([said]);
        await expect(app.pane).toHaveAttribute("data-state", "report");
        await expect(app.pane.locator(".import-report section h2")).toHaveText(["customers", "orders", "products", "quantities"]);
        await expect(page.locator("#status-database")).toHaveText("shopping_db");
        await expect(page.locator("#status-run")).toHaveText(words.STATUS_NO_RUN);
        await app.databaseButton.click();
        await expect(app.databaseMenu.locator('[role="menuitemradio"][aria-checked="true"]')).toHaveCount(0);
    });

    test("the name typed for the new database is the one the page shows and the evidence log keeps; the log of the course database has nothing of it", async ({ page, app }) => {
        await app.open(BOTH_URL);
        await app.importFiles(fixturePath(SHOPPING), { database: "class list" });
        await expect(app.databaseLabel).toHaveText("class list");
        await expect(page).toHaveTitle(/^class list - /);
        await expect(app.summary).toContainText(words.importedMessage(4, "class list"));
        const { found } = await eventsOf(page, ["northlight", "file:class list"]);
        expect(found.northlight).toEqual([]);
        expect(found["file:class list"].map((event) => event.lines)).toEqual([eventLines(SHOPPING, BYTES(SHOPPING), tablesOf(expectedFor(SHOPPING)))]);
    });

    test("with no name typed, the database is named after the first file, whichever kind it is: a workbook's name without its extension, or a CSV file's", async ({ app, page }) => {
        await app.open(BOTH_URL);
        await app.importFiles([workbookFile("ledger.xlsx", [{ name: "entries", rows: [["x"], [1]] }]), csvFile("people.csv")]);
        await expect(app.databaseLabel).toHaveText("ledger");
        expect(await schemaNames(app)).toEqual(["entries", "people"]);
        await app.open(BOTH_URL);
        await app.importFiles([csvFile("people.csv"), workbookFile("ledger.xlsx", [{ name: "entries", rows: [["x"], [1]] }])]);
        await expect(app.databaseLabel).toHaveText("people");
    });

    test("the editor can be used at once, a Run replaces the report with its result, and the History tab lists the query and not the import", async ({ page, app }) => {
        await app.open(BOTH_URL);
        await app.importFiles(fixturePath(SHOPPING));
        await app.openHistory();
        await expect(app.historyEntries).toHaveCount(0);
        expect(await app.query("SELECT OrderDate FROM orders ORDER BY _rowid_ LIMIT 1")).toEqual({ columns: ["OrderDate"], rows: [["2023-08-05"]] });
        await expect(app.pane).toHaveAttribute("data-state", "result");
        await expect(app.pane.locator(".import-report")).toHaveCount(0);
        await app.openHistory();
        await expect(app.historyEntries).toHaveCount(1);
        expect(await app.readLog("file:shopping_db")).toHaveLength(1);
    });

    test("the focus is where it is after the import of a CSV file", async ({ browser, baseURL }) => {
        const focusAfter = async (files) => {
            const context = await browser.newContext({ baseURL });
            try {
                const page = await context.newPage();
                page.on("filechooser", () => {});
                const app = new App(page);
                await app.open(BOTH_URL);
                await app.importFiles(files);
                return await page.evaluate(() => `${document.activeElement?.localName}#${document.activeElement?.id}`);
            } finally {
                await context.close();
            }
        };
        const afterWorkbook = await focusAfter(WORKBOOK_B());
        expect(afterWorkbook).toBe(await focusAfter(csvFile("people.csv")));
        expect(afterWorkbook).not.toBe("body#");
    });

    test("the same workbook chosen again is read again, and the library is not asked for a second time", async ({ page, app }) => {
        const asked = libraryRequests(page);
        await app.open(BOTH_URL);
        await app.importFiles(fixturePath(SHOPPING));
        expect(asked).toHaveLength(1);
        await app.chooseFiles(fixturePath(SHOPPING));
        await dialogReady(app);
        await expect(app.importSheetStrip(words.importSheetsLabel(SHOPPING)).getByRole("tab")).toHaveCount(4);
        await app.importSubmit.click();
        await expect(app.importDialog).toBeHidden();
        await expect(app.pane).toHaveAttribute("data-state", "report");
        expect(await schemaNames(app)).toEqual(["customers", "orders", "products", "quantities"]);
        expect(asked).toHaveLength(1);
    });

    test("the name typed for the new database is kept without the spaces round it, in the page and in the evidence log", async ({ page, app }) => {
        await app.open(BOTH_URL);
        await app.importFiles(workbookFile("ledger.xlsx", [{ name: "entries", rows: [["x"], [1]] }]), { database: "  class list  " });
        expect(await page.evaluate(() => window.app.database.name)).toBe("class list");
        const { found } = await eventsOf(page, ["file:class list"]);
        expect(found["file:class list"]).toHaveLength(1);
    });

    test("the toast of an import is the plain one with a tick, not the note a refusal has", async ({ app }) => {
        await app.open(BOTH_URL);
        await app.recordToasts();
        await app.importFiles(workbookFile("ledger.xlsx", [{ name: "entries", rows: [["x"], [1]] }]));
        await expect(app.toast.locator(".toast")).toHaveText(words.importedMessage(1, "ledger"));
        await expect(app.toast.locator(".toast")).toHaveClass(/^toast toast--info$/);
    });
});

test.describe("after an import of a workbook into the open database", () => {
    test("a course database is never offered as the destination", async ({ app }) => {
        await app.open(BOTH_URL);
        await app.chooseFiles(WORKBOOK_A());
        await dialogReady(app);
        await expect(app.importDialog.locator("#import-into-new")).toBeChecked();
        await expect(app.importDialog.locator("#import-into-open")).toBeDisabled();
        await expect(app.importDialog).toContainText(words.IMPORT_COURSE_DATABASE_NOTE);
    });

    test("the sheets become tables beside the student's own, one lab:database-changed is announced for the whole workbook and no run, and the status bar names the same database", async ({ page, app }) => {
        await app.open(BOTH_URL);
        await app.upload(SAMPLE_FILE);
        await app.run("SELECT * FROM fruit LIMIT 10;");
        await expect(page.locator("#status-run")).toHaveText(/^4 rows in \d+ ms$/);
        const line = await page.locator("#status-run").textContent();
        await page.evaluate(() => {
            window.__heard = [];
            for (const type of ["lab:database-changed", "lab:run-finished", "lab:database-loaded"]) {
                document.addEventListener(type, (event) => window.__heard.push({ type, name: event.detail?.database?.name }));
            }
        });
        const handle = await databaseHandle(page);
        const file = WORKBOOK_A();
        await app.importFiles(file, { into: "open" });
        expect(await isOpenDatabase(page, handle)).toBe(true);
        expect(await page.evaluate(() => window.__heard)).toEqual([{ type: "lab:database-changed", name: "sample.db" }]);
        await expect(app.databaseLabel).toHaveText("sample.db");
        expect(await schemaNames(app)).toEqual(expect.arrayContaining(["fruit", "tags", "first_sheet", "second_sheet"]));
        await expect(app.summary).toContainText(words.importedMessage(2, "sample.db"));
        await expect(page.locator("#status-database")).toHaveText("sample.db");
        await expect(page.locator("#status-run")).toHaveText(line);
        const { found } = await eventsOf(page, ["file:sample.db"]);
        expect(found["file:sample.db"].map((event) => event.lines)).toEqual([[`file: alpha.xlsx, ${file.buffer.length} bytes`, "table: first_sheet, 2 rows, 1 columns, first_sheet", "table: second_sheet, 1 rows, 1 columns, second_sheet"]]);
    });

    test("the Schema tab lists the new tables while it is on show, without being opened again, and the editor offers them", async ({ page, app }) => {
        await app.open(BOTH_URL);
        await app.upload(SAMPLE_FILE);
        await app.openTab("schema");
        await expect(app.schemaInsert("fruit")).toBeVisible();
        await expect(app.schemaInsert("first_sheet")).toHaveCount(0);
        await app.importFiles(WORKBOOK_A(), { into: "open" });
        await expect(app.schemaInsert("first_sheet")).toBeVisible();
        await expect(app.schemaInsert("second_sheet")).toBeVisible();
        await expect(app.schemaInsert("fruit")).toBeVisible();
        await app.editor.fill("");
        await app.editor.focus();
        await page.keyboard.type("SELECT * FROM ");
        await page.keyboard.press("Control+Space");
        await expect(page.getByRole("listbox")).toBeVisible();
        expect(await page.locator(".cm-tooltip-autocomplete li .cm-completionLabel").allTextContents()).toEqual(expect.arrayContaining(["fruit", "first_sheet", "second_sheet"]));
    });
});

// ---- sheet names that are not plain text ---------------------------------------------------------------------------------------

test.describe("the event of a workbook whose sheet names hold a line break, a tab, markup and another script", () => {
    // each name is a sheet name that the file format allows; a control character in an event line becomes "_"
    const SHEETS = [
        ["line\nbreak", "line_break"],
        ["tab\there", "tab_here"],
        ["<b>bold<b>", "<b>bold<b>"],
        ["<img src=x onerror=1>", "<img src=x onerror=1>"],
        ["sep\u2028a\rb", "sep_a_b"],
        ["Лист".repeat(7) + "Лис", "Лист".repeat(7) + "Лис"],
    ];

    test("one line for each table and one for the file: nothing of a name becomes a second line or an element, in the report, in the evidence log, and in the file of evidence, which verifies", async ({ app, page }) => {
        expect(SHEETS.at(-1)[0]).toHaveLength(31);
        const file = workbookFile("odd.xlsx", SHEETS.map(([name]) => ({ name, rows: [["a"], [1]] })));
        await app.open(BOTH_URL);
        await app.chooseFiles(file);
        await dialogReady(app);
        // (the names are text in the dialog too)
        await expect(app.importDialog.locator("b, img")).toHaveCount(0);
        await app.importSubmit.click();
        await expect(app.importDialog).toBeHidden();
        await expect(app.pane).toHaveAttribute("data-state", "report");
        const tables = (await app.rows("SELECT name FROM sqlite_schema WHERE type = 'table' ORDER BY rowid")).flat();
        expect(tables).toHaveLength(SHEETS.length);
        const lines = [`file: odd.xlsx, ${file.buffer.length} bytes`, ...SHEETS.map(([, shown], i) => words.importEventSheetTableLine(tables[i], 1, 1, shown))];
        const events = await eventsOfOpen(page);
        expect(events).toHaveLength(1);
        expect(events[0].lines).toEqual(lines);
        for (const line of events[0].lines) {
            expect(line).not.toMatch(/[\n\r\u2028\u2029]/);
        }
        // the report names the sheets as text
        await expect(app.pane.locator("section.import-report-table")).toHaveCount(SHEETS.length);
        await expect(app.pane.locator("b, img")).toHaveCount(0);
        await expect(app.pane.locator(".import-report-line").nth(2)).toContainText("<b>bold<b>");
        // the file of evidence holds the same lines, and verifies
        await app.run("SELECT count(*) FROM " + `"${tables[0]}"`);
        const evidence = await app.exportEvidence(STUDENT);
        const { verifyEvidence } = await load("evidence.js");
        expect(await verifyEvidence(evidence.text)).toMatchObject({ status: "valid", student: STUDENT, queries: 1, events: 1 });
        const inEvidence = evidence.text.split("\n");
        for (const line of lines) {
            expect(inEvidence, line).toContain(line);
        }
        // (the lines are together, and in order)
        const at = inEvidence.indexOf(lines[0]);
        expect(inEvidence.slice(at, at + lines.length)).toEqual(lines);
    });
});

test.describe("nothing leaves the browser while workbooks are imported", () => {
    // The page's promise (no third-party request) holds for the workbook path too: an .xlsx, an .xls and a web page saved
    // as a workbook, one after the other, with a web page that names addresses of other origins in every way it can.
    test("an .xlsx, an .xls and a web page that names other origins are imported with no request to another origin and none that failed", async ({ app, net }) => {
        const outside = "https://third.example/x";
        const page = {
            name: "outside.xls",
            mimeType: "text/html",
            buffer: Buffer.from(
                `<html><head><link rel="stylesheet" href="${outside}.css"><script src="${outside}.js"></script></head><body><img src="${outside}.png" onerror="fetch('${outside}')"><table><tr><td>a</td><td><a href="${outside}">b</a></td></tr><tr><td><img src="${outside}.gif"></td><td>2</td></tr></table></body></html>`
            ),
        };
        await app.open(BOTH_URL);
        await app.importFiles(fixturePath("shopping_db.xlsx"));
        await expect(app.pane).toHaveAttribute("data-state", "report");
        await app.importFiles(fixturePath("excel/formats.xls"));
        await expect(app.pane).toHaveAttribute("data-state", "report");
        await app.importFiles(page);
        await expect(app.pane).toHaveAttribute("data-state", "report");
        expect(await app.rows("SELECT count(*) FROM outside")).toEqual([[1]]);
        expect(net.paths.filter((path) => path.endsWith("vendor/xlsx.full.min.js")), "the library was asked for once").toHaveLength(1);
        net.expectNoExternalRequests();
        net.expectNoSameOriginFailures();
    });
});

test.describe("a sheet whose name is only spaces", () => {
    test("is called as the tab and the panel call it in the report and in the event, not left as a name that reads as nothing", async ({ app, page }) => {
        const file = workbookFile("names.xlsx", [{ name: "Data", rows: [["a"], [1]] }, { name: "   ", rows: [["b"], [2]] }]);
        await app.open(BOTH_URL);
        await app.chooseFiles(file);
        await dialogReady(app);
        await app.importSubmit.click();
        await expect(app.importDialog).toBeHidden();
        await expect(app.pane).toHaveAttribute("data-state", "report");
        const tables = (await app.rows("SELECT name FROM sqlite_schema WHERE type = 'table' ORDER BY rowid")).flat();
        expect(tables).toHaveLength(2);
        const unnamed = words.importSheetUnnamedLabel(2);
        await expect(app.pane.locator(".import-report-line")).toHaveText([words.importReportTableLine(1, 1, words.importSheetSource("names.xlsx", "Data")), words.importReportTableLine(1, 1, words.importSheetSource("names.xlsx", unnamed))]);
        const events = await eventsOfOpen(page);
        expect(events.map((event) => event.lines)).toEqual([[`file: names.xlsx, ${file.buffer.length} bytes`, words.importEventSheetTableLine(tables[0], 1, 1, "Data"), words.importEventSheetTableLine(tables[1], 1, 1, unnamed)]]);
    });
});

// ---- without scheduler.yield ----------------------------------------------------------------------------------------------

test.describe("in a browser without scheduler.yield a workbook is read and imported with the turns taken the other way", () => {
    test.beforeEach(async ({ page }) => {
        await page.addInitScript(() => {
            Object.defineProperty(globalThis, "scheduler", { value: undefined, configurable: true });
        });
    });

    // a workbook of a small sheet and a long one (several steps of 30,000 cells)
    const LONG = () =>
        workbookFile("wb.xlsx", [
            { name: "small", rows: [["x"], [1]] },
            { name: "big", rows: [["a", "b", "c"], ...Array.from({ length: 40000 }, (_, i) => [i, i * 2, `t${i}`])] },
        ]);

    test("the sheets are read, and an import still ends with every row of every sheet", async ({ page, app }) => {
        await app.open(BOTH_URL);
        expect(await page.evaluate(() => typeof globalThis.scheduler)).toBe("undefined");
        await app.importFiles(LONG());
        expect(await app.rows("SELECT count(*), min(a), max(a) FROM big")).toEqual([[40000, 0, 39999]]);
        expect(await app.rows("SELECT x FROM small")).toEqual([[1]]);
    });

    test("Cancel between two steps of the second sheet undoes the first sheet's table too, and leaves nothing", async ({ page, app }) => {
        await app.open(BOTH_URL);
        expect(await page.evaluate(() => typeof globalThis.scheduler)).toBe("undefined");
        const gate = await gateTurns(page);
        await app.chooseFiles(LONG());
        await dialogReady(app);
        const before = await snapshot(page, app);
        await gate.at(/Importing table 2 of 2: big \(wb\.xlsx\)/, words.IMPORT_PROGRESS_COPYING);
        await app.importSubmit.click();
        await expect.poll(() => gate.held()).toBe(true);
        await app.importCancel.click();
        await expect(app.importDialog).toBeHidden();
        await gate.release();
        await expectNothingLeft(page, app, before, { logKeys: ["northlight", "file:wb"] });
        expect(await openStatements(page)).toBe(0);
        expect(await autocommit(page)).toBe(1);
    });
});

// ---- on a phone --------------------------------------------------------------------------------------------------------------------

test.describe("on a phone", () => {
    test.use({ viewport: { width: 390, height: 844 } });

    test("after an import of a workbook the Result view is showing, with the report in view", async ({ page, app }) => {
        await app.open(BOTH_URL);
        await expect(page.locator("#view-result")).toBeVisible();
        await app.importFiles(WORKBOOK_A());
        await expect(page.locator("#view-result")).toHaveAttribute("aria-current", "true");
        await expect(app.pane.locator(".import-report")).toBeVisible();
        await expect(app.pane).toBeInViewport();
        await expect(app.pane.locator(".import-report section h2")).toHaveText(["first_sheet", "second_sheet"]);
        await expect(app.summary).toContainText(words.importedMessage(2, "alpha"));
    });
});

// ---- about.html credits the spreadsheet library ----------------------------------------------------------------------------------

// The sentence is in about.html (not in the config), so the words that matter are typed here, as for the credits of Papa Parse
// (tests/aw2-import-page.spec.js) and of fflate (tests/aw3-export-rules.spec.js). About says it although no flag is on, and the
// page is opened without one: the library is in the repository whether the flag is on or off, as the other two are.
test.describe("about.html", () => {
    test("its credits name SheetJS and its publisher, with the Apache License, and the line has no link", async ({ page }) => {
        await page.goto("./about.html");
        await expect(page.locator("main h2", { hasText: "Credits and licence" })).toHaveCount(1);
        const credit = page.locator("main h2:has-text('Credits and licence') ~ p", { hasText: "SheetJS" });
        await expect(credit).toHaveCount(1);
        await expect(credit).toHaveText("Excel workbooks are read with SheetJS Community Edition, by SheetJS LLC (Apache License 2.0).");
        await expect(credit.locator("a")).toHaveCount(0);
        // it says the licence is the Apache License and not the MIT License of the two before it
        await expect(credit).not.toContainText("MIT");
    });

    test("the credit for SheetJS stands right after the credit for fflate, and before the typefaces", () => {
        const html = fs.readFileSync(path.join(__dirname, "..", "about.html"), "utf8");
        const credits = html.slice(html.indexOf("<h2>Credits and licence</h2>"));
        expect(credits.startsWith("<h2>")).toBe(true);
        const lines = [...credits.matchAll(/<p>([^<]*)<\/p>/g)].map((match) => match[1].replace(/\s+/g, " ").trim());
        const papa = lines.findIndex((line) => line.includes("Papa Parse"));
        const zip = lines.findIndex((line) => line.includes("fflate"));
        const sheet = lines.findIndex((line) => line.includes("SheetJS"));
        const faces = lines.findIndex((line) => line.includes("typefaces"));
        expect(papa).toBeGreaterThan(-1);
        expect(zip).toBe(papa + 1);
        expect(sheet).toBe(zip + 1);
        expect(faces).toBe(sheet + 1);
        expect(lines.filter((line) => line.includes("SheetJS"))).toEqual([
            "Excel workbooks are read with SheetJS Community Edition, by SheetJS LLC (Apache License 2.0).",
        ]);
    });
});
