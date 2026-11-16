const fs = require("node:fs");
const path = require("node:path");
const { pathToFileURL } = require("node:url");
const {
    test,
    expect,
    NORTHLIGHT_URL,
    SAMPLE_FILE,
    compareTable,
    expectedFor,
    fixtureIndex,
    fixturePath,
    largeCsv,
    readTable,
} = require("./helpers");

// Assessment plan, Phase 2 (import CSV): what an import MAKES, judged against the owner's test
// files (tests/fixtures/, with the result each must give in tests/fixtures/expected/), through the
// real dialog and the real engine, with the flag on (?preview=import). Pinned here:
//   - every text fixture gives the table its expected file holds, and the dialog shows the settings
//     that file names (delimiter, encoding, the tick box), plan section 3 and section 9
//   - the two text files with a workbook's name, and the header row of title_rows.csv
//   - messy_sales.csv as the plan's "Done when" has it, the import report included
//   - large.csv: imported, equal to its expected table, with the page alive (progress seen) while it ran
//   - the files that must NOT make a table (empty, too wide, not text, every workbook) and leave
//     nothing behind
//   - several files at once, into a new database or into the open one, never into a course database
//   - the evidence: one event for each file, and the version 2 file that holds them
//   - characters of several bytes: the Windows-1252 file, and a file whose characters are cut by the
//     reader's 64 KB slices
//   - what a number column stores, value by value (rules 1 to 3), and the decimal that is minus zero
//   - the cases the plan decides and no fixture holds (section 9), as files made in the test and
//     taken through the dialog: -0 beside -0.0, a header of spaces, a text file that starts with PK,
//     blank lines only, UTF-16 with no byte-order mark; and the three it leaves "as the library
//     reads them" (a line of "" only, a file that mixes line endings)
//   - what the expected files say that the tables alone do not: the file each table came from
//     (`source`, in the report's line), large.csv's settings in its dialog, and each `refuse`
//     entry's reason against the one the tab gives
//   - the settings shown are the settings used: a file split by U+001F or U+001E (in Papa's own list,
//     not in the four) shows Comma and one column; the plan's Windows file with one lone quote in a
//     heading gives an INTEGER column and no carriage return (the dialog's line ending is handed to
//     Papa); a delimiter chosen by hand is the one the import reads with
//   - ?preview=import,excel-import: a workbook is refused as with the import alone (Phase 2 reads
//     no flag but its own)
// Everything runs in the page, on all four projects. Node only reads the fixtures and the texts of
// js/lab/config-workflow.js (the reasons a student is told), and checks the evidence file with
// js/lab/evidence.js. How the dialog is built and the rules of names and types are the other specs'.

const load = (file) => import(pathToFileURL(path.join(__dirname, "..", "js", "lab", file)).href);
// the texts the student sees are read from js/lab/config-workflow.js, never typed again
let words;
test.beforeAll(async () => {
    words = await load("config-workflow.js");
});
const escaped = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
// the name a screen reader gives the tab of a file that cannot be imported: its file's name, then these words
const refusedName = () => new RegExp(` \\(${escaped(words.IMPORT_REFUSED_TAB_TEXT)}\\)$`);
const refusedWords = () => new RegExp(escaped(words.IMPORT_REFUSED_TAB_TEXT));

const FLAG = "./?preview=import";
const STUDENT = "U2034567";

const DELIMITERS = { comma: ",", semicolon: ";", tab: "\t", pipe: "|" };

// what the fixture's expected file says about the text files: outcome "import", settings, no sheets
// (large.csv is not stored: its own test makes it)
const TEXT_FIXTURES = fixtureIndex()
    .map((entry) => entry.fixture)
    .filter((name) => name !== "large.csv" && !name.startsWith("export/"))
    .filter((name) => {
        const expected = expectedFor(name);
        return expected.outcome === "import" && expected.settings && !expected.sheets;
    });

// the page's own state, as a refusal must leave it
async function pageState(app, page) {
    return {
        url: page.url(),
        database: await page.evaluate(() => window.app.database.name),
        tables: await app.rows("SELECT type, name FROM sqlite_schema ORDER BY name"),
        events: await page.evaluate(() => Object.keys(localStorage).filter((key) => key.startsWith("sqllab.events."))),
    };
}

// the table a text file's expected file holds, read from the open database
async function expectTable(app, expectedTable) {
    expect(compareTable(await readTable(app, expectedTable.name), expectedTable)).toEqual([]);
}

// waits until the dialog has looked at every file it was given
async function dialogReady(app) {
    await expect(app.importDialog).toBeVisible();
    await expect(app.importDialog.locator(".import-reading")).toHaveCount(0);
}

const settingsOf = (app) => ({
    delimiter: app.importPanel.getByLabel("Delimiter", { exact: true }),
    encoding: app.importPanel.getByLabel("Text encoding", { exact: true }),
    hasNames: app.importPanel.getByLabel("The file has a row of column names", { exact: true }),
    namesRow: app.importPanel.getByLabel("Column names are on row", { exact: true }),
    tableName: app.importPanel.getByLabel("Table name", { exact: true }),
});

// the dialog shows the settings an expected file names (a byte-order mark is a fact about the
// file: the dialog says UTF-8)
async function expectSettings(app, expected) {
    const settings = settingsOf(app);
    await expect(settings.delimiter).toHaveValue(DELIMITERS[expected.settings.delimiter]);
    await expect(settings.encoding).toHaveValue(expected.settings.encoding === "utf-8 with BOM" ? "utf-8" : expected.settings.encoding);
    await expect(settings.hasNames).toBeChecked({ checked: expected.settings.first_row_is_header });
    await expect(settings.tableName).toHaveValue(expected.tables[0].name);
}

// ---- every text fixture gives its expected table -------------------------------------------

test.describe("every text file of the fixtures", () => {
    // `source` of an expected table holds the file's own name as it is chosen: no folder, its
    // extension kept ("Order.csv" for csv/names/Order.csv, "2024 Sales Data (final) v2.csv" with
    // its brackets). The report's line for the table (words.importReportTableLine) ends with it.
    for (const name of TEXT_FIXTURES) {
        test(`${name}: the dialog shows the expected settings, the import gives the expected table, and the report's line names the file`, async ({ app, page }) => {
            const expected = expectedFor(name);
            await app.open(FLAG);
            await app.chooseFiles(fixturePath(name));
            await dialogReady(app);
            await expectSettings(app, expected);
            await expect(app.importSubmit).toBeEnabled();
            await app.importSubmit.click();
            await expect(app.importDialog).toBeHidden();
            await expect(app.pane).toHaveAttribute("data-state", "report");
            for (const table of expected.tables) {
                await expectTable(app, table);
            }
            // what the expected file says that the table alone does not: the file it came from
            const sections = page.locator("#results-pane .import-report section");
            await expect(sections).toHaveCount(expected.tables.length);
            for (const [i, table] of expected.tables.entries()) {
                expect(table.source, `the expected file's source for ${table.name}`).toBe(path.basename(name));
                await expect(sections.nth(i).locator("h2")).toHaveText(table.name);
                await expect(sections.nth(i).locator(".import-report-line")).toHaveText(words.importReportTableLine(table.rows, table.columns.length, table.source));
            }
        });
    }
});

// ---- the two text files with a workbook's name ----------------------------------------------

test.describe("a text file with a workbook's name", () => {
    for (const name of ["impostors/tab_text.xls", "impostors/renamed_csv.xlsx"]) {
        test(`${name} is imported as text and gives the table its content makes`, async ({ app }) => {
            const expected = expectedFor(name);
            await app.open(FLAG);
            await app.importFiles(fixturePath(name));
            for (const table of expected.tables_if_read_by_content) {
                await expectTable(app, table);
            }
        });
    }
});

// ---- the row of column names ------------------------------------------------------------------

test.describe("title_rows.csv and the row of column names", () => {
    test("with the box left at 1 the file gives the table of its expected file", async ({ app }) => {
        const expected = expectedFor("csv/title_rows.csv");
        await app.open(FLAG);
        await app.importFiles(fixturePath("csv/title_rows.csv"));
        await expectTable(app, expected.tables[0]);
    });

    test("with the box set to row 4 the file gives the table the expected file holds for that", async ({ app }) => {
        const expected = expectedFor("csv/title_rows.csv");
        await app.open(FLAG);
        await app.chooseFiles(fixturePath("csv/title_rows.csv"));
        await dialogReady(app);
        const { namesRow } = settingsOf(app);
        await expect(namesRow).toHaveValue("1");
        await namesRow.fill("4");
        // the preview counts rows as it shows them: the three title lines are left out, row 4 holds the names
        const tags = app.importPanel.locator(".import-preview-table tbody tr");
        await expect(tags.nth(0).locator(".import-row-tag")).toHaveText("left out");
        await expect(tags.nth(2).locator(".import-row-tag")).toHaveText("left out");
        await expect(tags.nth(3).locator(".import-row-tag")).toHaveText("column names");
        await expect(app.importSubmit).toBeEnabled();
        await app.importSubmit.click();
        await expect(app.importDialog).toBeHidden();
        await expect(app.pane).toHaveAttribute("data-state", "report");
        await expectTable(app, expected.tables_if_header_row_can_be_chosen[0]);
    });

    test("no_header.csv, with its tick box ticked, gives the table its expected file holds for that", async ({ app }) => {
        const expected = expectedFor("csv/no_header.csv");
        await app.open(FLAG);
        await app.chooseFiles(fixturePath("csv/no_header.csv"));
        await dialogReady(app);
        const { hasNames } = settingsOf(app);
        await expect(hasNames).not.toBeChecked();
        await hasNames.check();
        await expect(app.importSubmit).toBeEnabled();
        await app.importSubmit.click();
        await expect(app.importDialog).toBeHidden();
        await expect(app.pane).toHaveAttribute("data-state", "report");
        await expectTable(app, expected.tables_if_first_row_is_taken_as_header[0]);
    });
});

// ---- messy_sales.csv, as the plan's "Done when" has it ------------------------------------------

test.describe("messy_sales.csv", () => {
    test("every column has its type, the leading zeros are intact and 100 is stored as a real", async ({ app }) => {
        const expected = expectedFor("messy_sales.csv").tables[0];
        await app.open(FLAG);
        await app.importFiles(fixturePath("messy_sales.csv"));
        const info = await app.rows("PRAGMA table_info(messy_sales)");
        expect(info.map((row) => [row[1], row[2]])).toEqual(expected.columns.map((column) => [column.name, column.type]));
        expect((await app.rows("SELECT count(*) FROM messy_sales"))[0][0]).toBe(expected.rows);
        // the zeros of Order_ID: the first expected row holds "00123", and it is text
        const ids = (await app.rows("SELECT Order_ID, typeof(Order_ID) FROM messy_sales ORDER BY _rowid_")).map((row) => row[0]);
        expect(ids).toEqual(expected.data.map((row) => row[0]));
        expect(ids[0]).toBe("00123");
        expect((await app.rows("SELECT DISTINCT typeof(Order_ID) FROM messy_sales")).flat()).toEqual(["text"]);
        // Unit_Price is REAL, and the row that was written 100 holds 100.0
        const whole = await app.rows("SELECT typeof(Unit_Price) FROM messy_sales WHERE Unit_Price = 100");
        expect(whole).toEqual([["real"]]);
        expect((await app.rows("SELECT DISTINCT typeof(Unit_Price) FROM messy_sales WHERE Unit_Price IS NOT NULL")).flat()).toEqual(["real"]);
        await expectTable(app, expected);
    });

    test("the report lists each column with its name, its name in the file, its type and its blanks, and names each blocking value", async ({
        app,
        page,
    }) => {
        const { importedMessage, importReportTableLine, IMPORT_REPORT_BLANK_NAME } = await load("config-workflow.js");
        const expected = expectedFor("messy_sales.csv").tables[0];
        await app.open(FLAG);
        await app.recordToasts();
        await app.importFiles(fixturePath("messy_sales.csv"));
        const report = page.locator("#results-pane .import-report");
        await expect(report.locator("section")).toHaveCount(1);
        await expect(report.locator("h2")).toHaveText("messy_sales");
        await expect(report.locator(".import-report-line")).toHaveText(importReportTableLine(expected.rows, expected.columns.length, "messy_sales.csv"));
        // each column's row: name, name in the file, type, blanks, note (as text, spaces kept)
        const rows = await report.locator("table.import-report-columns tbody tr").evaluateAll((trs) =>
            trs.map((tr) => [...tr.children].map((cell) => cell.textContent))
        );
        expect(rows).toHaveLength(expected.columns.length);
        expected.columns.forEach((column, i) => {
            const [name, original, type, blanks, note] = rows[i];
            expect(name, `column ${i + 1}`).toBe(column.name);
            // an original is shown where the name changed; a blank header is shown as "blank"
            const wantOriginal = column.original === undefined ? "" : column.original === "" ? IMPORT_REPORT_BLANK_NAME : column.original;
            expect(original, `${column.name}: name in the file`).toBe(wantOriginal);
            expect(type, `${column.name}: type`).toBe(column.type);
            expect(blanks, `${column.name}: blanks`).toBe(String(column.nulls));
            if (column.report_example === undefined) {
                expect(note, `${column.name}: note`).toBe("");
            } else {
                expect(note, `${column.name}: blocking value`).toContain(column.report_example);
            }
        });
        // the two columns the plan's "Done when" is about: the report names N/A and 1,200
        expect(expected.columns.filter((column) => column.report_example !== undefined).length).toBeGreaterThanOrEqual(2);
        // the summary line and the toast say how many tables went where
        await expect(app.summary).toContainText(importedMessage(1, "messy_sales"));
        await expect.poll(() => app.toasts()).toContain(importedMessage(1, "messy_sales"));
    });

    test("the new database is opened as a file is: named after the file, at the address ./", async ({ app, page }) => {
        await app.open(NORTHLIGHT_URL + "&preview=import");
        await app.importFiles(fixturePath("messy_sales.csv"));
        expect(await page.evaluate(() => window.app.database.name)).toBe("messy_sales");
        await expect(app.databaseLabel).toHaveText("messy_sales");
        expect(new URL(page.url()).search).toBe("");
        expect(new URL(page.url()).hash).toBe("");
        // and the tables of Northlight are not in it
        expect((await app.rows("SELECT name FROM sqlite_schema WHERE type = 'table' ORDER BY name")).flat()).toEqual(["messy_sales"]);
    });
});

// ---- large.csv --------------------------------------------------------------------------------

test.describe("large.csv", () => {
    test("200,000 rows are imported in under a minute, the page stays alive, and the table is the expected one", async ({ app, page }) => {
        test.slow();
        test.setTimeout(240_000);
        const expected = expectedFor("large.csv");
        await app.open(FLAG);
        // sample the progress bar from the page, as often as the page lets a timer run
        await page.evaluate(() => {
            window.__progress = [];
            window.__poll = setInterval(() => {
                const bar = document.querySelector("#import-dialog .import-progress progress");
                if (bar && bar.value > 0 && bar.value < 1) {
                    window.__progress.push(bar.value);
                }
            }, 5);
        });
        await app.chooseFiles(largeCsv());
        await dialogReady(app);
        // the settings the expected file names, as for every other text fixture (the Node check
        // of the rules spec reads them too, but not through the dialog)
        await expectSettings(app, expected);
        await expect(app.importSubmit).toBeEnabled();
        const started = Date.now();
        await app.importSubmit.click();
        await expect(app.importDialog).toBeHidden({ timeout: 120_000 });
        await expect(app.pane).toHaveAttribute("data-state", "report", { timeout: 120_000 });
        const seconds = (Date.now() - started) / 1000;
        const seen = await page.evaluate(() => {
            clearInterval(window.__poll);
            return window.__progress;
        });
        // the bar was seen part-way: the page answered while the file was being read and copied
        expect(seen.length, "the progress bar was never seen between 0 and 1").toBeGreaterThan(0);
        expect(seconds).toBeLessThan(60);
        await expectTable(app, expected.tables[0]);
        // the report names the file as the expected file's `source` does
        await expect(page.locator("#results-pane .import-report .import-report-line")).toHaveText(
            (await load("config-workflow.js")).importReportTableLine(expected.tables[0].rows, expected.tables[0].columns.length, expected.tables[0].source)
        );
    });
});

// ---- what must not make a table ----------------------------------------------------------------

test.describe("files that are refused", () => {
    // the reasons are the texts of the page, read from its source file
    const REFUSED = [
        ["csv/empty.csv", "IMPORT_EMPTY_REASON"],
        ["impostors/zero_bytes.xlsx", "IMPORT_EMPTY_REASON"],
        ["csv/wide_2100_columns.csv", "IMPORT_TOO_WIDE_REASON"],
        ["impostors/random_bytes.xls", "IMPORT_NOT_TEXT_REASON"],
        // every workbook, under any name
        ["impostors/renamed_xlsx.csv", "IMPORT_WORKBOOK_REASON"],
        ["impostors/html_table.xls", "IMPORT_WORKBOOK_REASON"],
        ["impostors/spreadsheetml_2003.xls", "IMPORT_WORKBOOK_REASON"],
        ["impostors/truncated.xlsx", "IMPORT_WORKBOOK_REASON"],
        ["impostors/password_protected.xlsx", "IMPORT_WORKBOOK_REASON"],
        ["shopping_db.xlsx", "IMPORT_WORKBOOK_REASON"],
        ...fs
            .readdirSync(path.join(__dirname, "fixtures", "excel"))
            .sort()
            .map((file) => [`excel/${file}`, "IMPORT_WORKBOOK_REASON"]),
    ];

    for (const [name, reasonName] of REFUSED) {
        test(`${name} is refused with its reason, and nothing is left behind`, async ({ app, page }) => {
            const reasons = await load("config-workflow.js");
            const reason = reasons[reasonName];
            expect(typeof reason, `${reasonName} is a text of config-workflow.js`).toBe("string");
            await app.open(`${NORTHLIGHT_URL}&preview=import`);
            const before = await pageState(app, page);
            expect(before.tables.length).toBeGreaterThan(0);
            await app.trackConnections();
            await app.chooseFiles(fixturePath(name));
            await expect(app.importDialog).toBeVisible();
            // the tab says the file cannot be imported, and the panel says why
            await expect(app.importDialog.getByRole("tablist", { name: "Files" })).toBeVisible();
            await expect(app.importTabs).toHaveCount(1);
            await expect(app.importDialog.getByRole("tab", { name: refusedName() })).toHaveCount(1);
            await expect(app.importPanel).toContainText(reason);
            // nothing to import: the dialog offers Close, and no Import
            await expect(app.importSubmit).toBeHidden();
            await expect(app.importCancel).toHaveText(words.IMPORT_CLOSE_TEXT);
            await expect(app.importDialog.getByRole("button", { name: words.IMPORT_SUBMIT_TEXT, exact: true })).toHaveCount(0);
            await app.importCancel.click();
            await expect(app.importDialog).toBeHidden();
            // the open database is the one that was open, as it was
            expect(await pageState(app, page)).toEqual(before);
            expect((await app.connections()).filter((connection) => connection.open)).toEqual([]);
            await expect(app.pane).not.toHaveAttribute("data-state", "report");
        });
    }

    test("a refusal does not stop the other files: they import, into a database named after the first one that was not refused", async ({
        app,
        page,
    }) => {
        const { IMPORT_WORKBOOK_REASON } = await load("config-workflow.js");
        await app.open(FLAG);
        await app.chooseFiles([fixturePath("shopping_db.xlsx"), fixturePath("semicolon.csv"), fixturePath("messy_sales.csv")]);
        await dialogReady(app);
        await expect(app.importTabs).toHaveCount(3);
        // the workbook's tab is marked and its panel holds the reason
        await expect(app.importTabs.nth(0)).toHaveAccessibleName(refusedName());
        await expect(app.importTabs.nth(1)).not.toHaveAccessibleName(refusedWords());
        await app.importTabs.nth(0).click();
        await expect(app.importPanel).toContainText(IMPORT_WORKBOOK_REASON);
        // the new database is named after semicolon.csv, the first file that can be imported
        await expect(app.importDialog.locator("#import-database-name")).toHaveValue("semicolon");
        await expect(app.importSubmit).toBeEnabled();
        await app.importSubmit.click();
        await expect(app.importDialog).toBeHidden();
        await expect(app.pane).toHaveAttribute("data-state", "report");
        expect(await page.evaluate(() => window.app.database.name)).toBe("semicolon");
        expect((await app.rows("SELECT name FROM sqlite_schema WHERE type = 'table' ORDER BY name")).flat()).toEqual(["messy_sales", "semicolon"]);
        await expectTable(app, expectedFor("semicolon.csv").tables[0]);
        await expectTable(app, expectedFor("messy_sales.csv").tables[0]);
    });
});

// ---- several files at once ---------------------------------------------------------------------

test.describe("several files at once", () => {
    test("three files give three tables in one new database named after the first file", async ({ app, page }) => {
        const names = ["messy_sales.csv", "semicolon.csv", "windows1252.csv"];
        await app.open(FLAG);
        await app.trackConnections();
        await app.importFiles(names.map(fixturePath));
        expect(await page.evaluate(() => window.app.database.name)).toBe("messy_sales");
        expect((await app.rows("SELECT name FROM sqlite_schema WHERE type = 'table' ORDER BY name")).flat()).toEqual([
            "messy_sales",
            "semicolon",
            "windows1252",
        ]);
        for (const name of names) {
            await expectTable(app, expectedFor(name).tables[0]);
        }
        // one new database was made, and it is the open one
        expect(await app.connections()).toEqual([{ name: "messy_sales", open: true }]);
        // the report has a section for each table, and the line over it counts the three (with
        // one table said for three, every test passed: the sweep by mutation of the eighth round)
        await expect(page.locator("#results-pane .import-report section")).toHaveCount(3);
        await expect(app.summary).toContainText(words.importedMessage(3, "messy_sales"));
    });

    test("two files that would give the same table name get x and x_2, whatever the letter case", async ({ app, page }) => {
        const csv = (text) => Buffer.from(text, "utf8");
        await app.open(FLAG);
        await app.chooseFiles([
            { name: "x.csv", mimeType: "text/csv", buffer: csv("a,b\n1,2\n") },
            { name: "x.tsv", mimeType: "text/tab-separated-values", buffer: csv("a\tb\n3\t4\n5\t6\n") },
            { name: "X.txt", mimeType: "text/plain", buffer: csv("a,b\n7,8\n9,10\n11,12\n") },
        ]);
        await dialogReady(app);
        const suggested = [];
        for (let i = 0; i < 3; i++) {
            await app.importTabs.nth(i).click();
            suggested.push(await settingsOf(app).tableName.inputValue());
        }
        expect(suggested).toEqual(["x", "x_2", "X_3"]);
        await app.importSubmit.click();
        await expect(app.importDialog).toBeHidden();
        await expect(app.pane).toHaveAttribute("data-state", "report");
        expect(await app.rows("SELECT (SELECT count(*) FROM x), (SELECT count(*) FROM x_2), (SELECT count(*) FROM X_3)")).toEqual([[1, 2, 3]]);
        // the database is named after the first file
        expect(await page.evaluate(() => window.app.database.name)).toBe("x");
    });
});

// ---- into the open database ----------------------------------------------------------------------

test.describe("into the open database", () => {
    test("messy_sales.csv joins sample.db: its tables are untouched, the address is the same, the Schema tab lists the new table", async ({
        app,
        page,
    }) => {
        await app.open(FLAG);
        await app.upload(SAMPLE_FILE);
        expect(await page.evaluate(() => window.app.database.name)).toBe("sample.db");
        const counts = () => app.rows("SELECT (SELECT count(*) FROM fruit), (SELECT count(*) FROM tags), (SELECT count(*) FROM v_priced)");
        const countsBefore = await counts();
        const schemaBefore = await app.rows("SELECT type, name, sql FROM sqlite_schema ORDER BY name");
        expect(schemaBefore.map((row) => row[1])).toEqual(expect.arrayContaining(["fruit", "tags", "v_priced"]));
        const url = page.url();
        // a page event tells the page that the open database gained tables
        await page.evaluate(() => {
            window.__changed = [];
            document.addEventListener("lab:database-changed", (event) => window.__changed.push(event.detail.database === window.app.database));
        });
        await app.trackConnections();

        await app.importFiles(fixturePath("messy_sales.csv"), { into: "open" });

        expect(await page.evaluate(() => window.app.database.name)).toBe("sample.db");
        expect(page.url()).toBe(url);
        expect(await counts()).toEqual(countsBefore);
        const schemaAfter = await app.rows("SELECT type, name, sql FROM sqlite_schema ORDER BY name");
        expect(schemaAfter.filter((row) => row[1] !== "messy_sales")).toEqual(schemaBefore);
        expect(schemaAfter.map((row) => row[1])).toContain("messy_sales");
        await expectTable(app, expectedFor("messy_sales.csv").tables[0]);
        expect(await page.evaluate(() => window.__changed)).toEqual([true]);
        // no other connection was opened, and the page was not reloaded
        expect(await app.connections()).toEqual([]);
        await app.openTab("schema");
        await expect(app.schema).toContainText("messy_sales");
        await expect(app.schema).toContainText("fruit");
    });

    test("a second import of the same file suggests messy_sales_2", async ({ app }) => {
        await app.open(FLAG);
        await app.upload(SAMPLE_FILE);
        await app.importFiles(fixturePath("messy_sales.csv"), { into: "open" });
        await app.chooseFiles(fixturePath("messy_sales.csv"));
        await dialogReady(app);
        await app.importDialog.locator("#import-into-open").check();
        await expect(settingsOf(app).tableName).toHaveValue("messy_sales_2");
        await app.importSubmit.click();
        await expect(app.importDialog).toBeHidden();
        await expect(app.pane).toHaveAttribute("data-state", "report");
        const expected = expectedFor("messy_sales.csv").tables[0];
        await expectTable(app, expected);
        await expectTable(app, { ...expected, name: "messy_sales_2" });
    });

    test("never into a course database: the choice is off, and the note says why", async ({ app }) => {
        const { IMPORT_COURSE_DATABASE_NOTE } = await load("config-workflow.js");
        await app.open(`${NORTHLIGHT_URL}&preview=import`);
        await app.chooseFiles(fixturePath("messy_sales.csv"));
        await dialogReady(app);
        await expect(app.importDialog.locator("#import-into-open")).toBeDisabled();
        await expect(app.importDialog.locator("#import-into-new")).toBeChecked();
        await expect(app.importDialog).toContainText(IMPORT_COURSE_DATABASE_NOTE);
        // and the other database is still the one that is open when the dialog is closed
        await app.importCancel.click();
        await expect(app.importDialog).toBeHidden();
        await expect(app.databaseLabel).toContainText("Northlight");
    });
});

// ---- the evidence ---------------------------------------------------------------------------------

test.describe("the evidence log", () => {
    test("one event for each file, in the files' order, and the version 2 file that holds them verifies", async ({ app, page }) => {
        const files = ["messy_sales.csv", "semicolon.csv"];
        await app.open(FLAG);
        await app.importFiles(files.map(fixturePath));
        const events = await page.evaluate(async () => (await import("./bundle/app.js")).events.readEvents("file:messy_sales"));
        expect(events.map((event) => event.kind)).toEqual(["import", "import"]);
        expect(events.map((event) => event.lines)).toEqual(
            files.map((name) => {
                const table = expectedFor(name).tables[0];
                return [
                    `file: ${name}, ${fs.statSync(fixturePath(name)).size} bytes`,
                    `table: ${table.name}, ${table.rows} rows, ${table.columns.length} columns`,
                ];
            })
        );
        // a query after the import, then the file the student hands in
        await app.run("SELECT count(*) FROM messy_sales");
        const file = await app.exportEvidence(STUDENT);
        const lines = file.text.split("\n");
        expect(lines[0]).toMatch(/evidence export v2$/);
        const headers = lines.filter((line) => /^\[\d+\] /.test(line));
        expect(headers).toHaveLength(3);
        expect(headers[0]).toMatch(/^\[1\] \S+ · event: import$/);
        expect(headers[1]).toMatch(/^\[2\] \S+ · event: import$/);
        expect(headers[2]).toMatch(/^\[3\] \S+ · /);
        expect(headers[2]).not.toContain("event:");
        expect(file.text).toContain("file: messy_sales.csv, 2128 bytes\ntable: messy_sales, 22 rows, 13 columns\n");
        // the events come before the query
        expect(file.text.indexOf("event: import")).toBeLessThan(file.text.indexOf("SELECT count(*) FROM messy_sales"));
        const { verifyEvidence } = await load("evidence.js");
        const verdict = await verifyEvidence(file.text);
        expect(verdict).toMatchObject({ status: "valid", student: STUDENT, queries: 1, events: 2 });
    });

    test("an import into the open database records its events under that database's own log", async ({ app, page }) => {
        await app.open(FLAG);
        await app.upload(SAMPLE_FILE);
        await app.importFiles(fixturePath("messy_sales.csv"), { into: "open" });
        const stored = await page.evaluate(async () => {
            const { events, runLog } = await import("./bundle/app.js");
            const key = runLog.logKeyFor(null, window.app.database.name);
            return { here: events.readEvents(key), key };
        });
        expect(stored.here.map((event) => event.lines)).toEqual([["file: messy_sales.csv, 2128 bytes", "table: messy_sales, 22 rows, 13 columns"]]);
        expect(stored.key).toBe("file:sample.db");
    });
});

// ---- the encoding, and the slices of the reader -------------------------------------------------

test.describe("characters of several bytes", () => {
    test("windows1252.csv keeps its pound sign and its e acute", async ({ app }) => {
        const expected = expectedFor("windows1252.csv").tables[0];
        await app.open(FLAG);
        await app.importFiles(fixturePath("windows1252.csv"));
        const rows = await app.rows("SELECT * FROM windows1252 ORDER BY _rowid_");
        expect(rows).toEqual(expected.data);
        const text = JSON.stringify(rows);
        expect(text).toContain("£");
        expect(text).toContain("é");
        expect(text).not.toContain("�");
        // the file's own header carries the e acute, and the column name keeps what the rules make of it
        expect((await app.rows("PRAGMA table_info(windows1252)")).map((row) => row[1])).toEqual(expected.columns.map((column) => column.name));
    });

    test("a file whose characters are cut by the reader's slices is imported whole", async ({ app }) => {
        const SLICE = 64 * 1024;
        const lines = ["id,text,note"];
        const made = [];
        for (let i = 1; i <= 9000; i++) {
            // (a varying amount of plain text, so that slice edges meet every part of a character)
            const row = [String(i), `é日本😀${"ab".slice(0, i % 3)}é日本😀`, `note ${i} é日本😀 ${"x".repeat(i % 5)}`];
            made.push(row);
            lines.push(row.join(","));
        }
        const buffer = Buffer.from(`${lines.join("\n")}\n`, "utf8");
        expect(buffer.length).toBeGreaterThan(300 * 1024);
        // the file really is cut through characters: a continuation byte starts the next slice
        const cuts = [];
        for (let at = SLICE; at < buffer.length; at += SLICE) {
            cuts.push((buffer[at] & 0xc0) === 0x80);
        }
        expect(cuts.filter(Boolean).length, `slice edges inside a character: ${cuts}`).toBeGreaterThanOrEqual(2);

        await app.open(FLAG);
        await app.importFiles({ name: "slices.csv", mimeType: "text/csv", buffer });
        expect(await app.rows("SELECT count(*), count(DISTINCT id) FROM slices")).toEqual([[9000, 9000]]);
        expect((await app.rows("PRAGMA table_info(slices)")).map((row) => [row[1], row[2]])).toEqual([
            ["id", "INTEGER"],
            ["text", "TEXT"],
            ["note", "TEXT"],
        ]);
        // every row is what was built, and no character was replaced
        const rows = await app.rows("SELECT id, text, note FROM slices ORDER BY _rowid_");
        expect(rows.length).toBe(made.length);
        const wrong = [];
        rows.forEach((row, i) => {
            if (row[0] !== Number(made[i][0]) || row[1] !== made[i][1] || row[2] !== made[i][2]) {
                wrong.push(i + 1);
            }
        });
        expect(wrong.slice(0, 10), `rows that differ: ${wrong.length}`).toEqual([]);
        expect(await app.rows("SELECT count(*) FROM slices WHERE text LIKE '%' || char(65533) || '%' OR note LIKE '%' || char(65533) || '%'")).toEqual([[0]]);
    });
});

// ---- what a number column stores (rules 1 to 3) ---------------------------------------------------

test.describe("what a number column stores", () => {
    test("each plain number is stored as that number, by the column's own type: 1.50 as 1.5, 100 in a REAL column as 100.0, 15 digits whole, and text as written", async ({
        app,
    }) => {
        const lines = [
            "whole,decimal,mixed,written",
            "0,0.0,10,-0",
            "-1,-0.5,12.50,5",
            "123456789012345,1.50,100,007",
            "-123456789012345,10.00,-0.5,1.0",
            "999999999999999,0.1,0,12",
        ];
        await app.open(FLAG);
        await app.importFiles({ name: "numbers.csv", mimeType: "text/csv", buffer: Buffer.from(`${lines.join("\n")}\n`, "utf8") });
        expect((await app.rows("PRAGMA table_info(numbers)")).map((row) => [row[1], row[2]])).toEqual([
            ["whole", "INTEGER"],
            ["decimal", "REAL"],
            ["mixed", "REAL"],
            // -0 and 007 are not plain numbers, so nothing in the column is converted
            ["written", "TEXT"],
        ]);
        // quote() shows the value as the engine holds it, and typeof() the kind it is stored as
        const stored = await app.rows(
            "SELECT quote(whole), typeof(whole), quote(decimal), typeof(decimal), quote(mixed), typeof(mixed), quote(written), typeof(written) FROM numbers ORDER BY _rowid_"
        );
        expect(stored).toEqual([
            ["0", "integer", "0.0", "real", "10.0", "real", "'-0'", "text"],
            ["-1", "integer", "-0.5", "real", "12.5", "real", "'5'", "text"],
            ["123456789012345", "integer", "1.5", "real", "100.0", "real", "'007'", "text"],
            ["-123456789012345", "integer", "10.0", "real", "-0.5", "real", "'1.0'", "text"],
            ["999999999999999", "integer", "0.1", "real", "0.0", "real", "'12'", "text"],
        ]);
    });

    // The plan's rule 3 as written takes -0.0 for a decimal, and the engine has no minus zero to
    // store: the sign is lost. Rule 2 refuses -0 for that very reason. Left as rule 3 is written
    // (the plan, section 9, lists it among what the owner can decide the other way): this test is
    // the place that changes if they do.
    test("a decimal that is minus zero is read as a decimal, and stored as 0.0", async ({ app }) => {
        await app.open(FLAG);
        await app.importFiles({ name: "zero.csv", mimeType: "text/csv", buffer: Buffer.from("reading\n-0.0\n-0.00\n1.5\n", "utf8") });
        expect((await app.rows("PRAGMA table_info(zero)")).map((row) => [row[1], row[2]])).toEqual([["reading", "REAL"]]);
        expect(await app.rows("SELECT quote(reading), typeof(reading) FROM zero ORDER BY _rowid_")).toEqual([
            ["0.0", "real"],
            ["0.0", "real"],
            ["1.5", "real"],
        ]);
    });
});

// ---- the reason of every refuse entry --------------------------------------------------------------

test.describe("the reason an expected file gives for a refusal", () => {
    // The `reason` of a refuse entry is the owner's prose: what the page must do, not the words it
    // says. Each wording is matched to the texts of the page (js/lab/config-workflow.js) that say
    // it. "The file cannot be read" is for any file that cannot be a table for a reason of its own
    // (empty, not text, a workbook): the page says which, in plain words. A wording this table
    // does not know fails its test, so that a new entry has to be given its texts here.
    const OWNER_WORDING = [
        [/^There is nothing to import\./, ["IMPORT_EMPTY_REASON"]],
        [/^SQLite stops at 2,000 columns\./, ["IMPORT_TOO_WIDE_REASON"]],
        [/^The file cannot be read\. Say why in plain words/, ["IMPORT_EMPTY_REASON", "IMPORT_NOT_TEXT_REASON", "IMPORT_WORKBOOK_REASON"]],
    ];
    const REFUSE_ENTRIES = fixtureIndex()
        .map((entry) => entry.fixture)
        .filter((name) => !name.startsWith("export/"))
        .filter((name) => expectedFor(name).outcome === "refuse");

    test("there are refuse entries to check, and every wording is one the table knows", () => {
        expect(REFUSE_ENTRIES.length).toBeGreaterThanOrEqual(6);
        const unknown = REFUSE_ENTRIES.filter((name) => !OWNER_WORDING.some(([wording]) => wording.test(expectedFor(name).reason)));
        expect(unknown.map((name) => `${name}: ${expectedFor(name).reason}`)).toEqual([]);
    });

    for (const name of REFUSE_ENTRIES) {
        test(`${name}: its tab gives one of the texts that say what the expected file says`, async ({ app }) => {
            const words = await load("config-workflow.js");
            const wanted = OWNER_WORDING.find(([wording]) => wording.test(expectedFor(name).reason));
            expect(wanted, `no wording of the table fits: ${expectedFor(name).reason}`).toBeDefined();
            const texts = wanted[1].map((constant) => {
                expect(typeof words[constant], `${constant} is a text of config-workflow.js`).toBe("string");
                return words[constant];
            });
            await app.open(FLAG);
            await app.chooseFiles(fixturePath(name));
            await expect(app.importDialog.getByRole("tab", { name: refusedName() })).toHaveCount(1);
            // the panel holds the reason and nothing but it
            const said = (await app.importPanel.locator(".import-refusal").innerText()).trim();
            expect(texts, `the tab says: ${said}`).toContain(said);
        });
    }
});

// ---- both flags on ------------------------------------------------------------------------------------

test.describe("?preview=import,excel-import", () => {
    test("a workbook is refused with the same words as with the import alone, and a CSV beside it still imports", async ({ app, page }) => {
        const { IMPORT_WORKBOOK_REASON } = await load("config-workflow.js");
        await app.open("./?preview=import,excel-import");
        // (both flags really are on: the test is not the one with the import alone)
        expect(await page.evaluate(async () => (await import("./bundle/app.js")).flags.flagOn("excel-import"))).toBe(true);
        expect(await page.evaluate(async () => (await import("./bundle/app.js")).flags.flagOn("import"))).toBe(true);
        await app.chooseFiles([fixturePath("shopping_db.xlsx"), fixturePath("semicolon.csv")]);
        await dialogReady(app);
        await expect(app.importTabs).toHaveCount(2);
        await expect(app.importTabs.nth(0)).toHaveAccessibleName(refusedName());
        await expect(app.importTabs.nth(1)).not.toHaveAccessibleName(refusedWords());
        await app.importTabs.nth(0).click();
        await expect(app.importPanel.locator(".import-refusal")).toHaveText(IMPORT_WORKBOOK_REASON);
        await expect(app.importSubmit).toBeEnabled();
        await app.importSubmit.click();
        await expect(app.importDialog).toBeHidden();
        await expect(app.pane).toHaveAttribute("data-state", "report");
        // the CSV is the one table; the workbook made none
        expect((await app.rows("SELECT name FROM sqlite_schema WHERE type = 'table' ORDER BY name")).flat()).toEqual(["semicolon"]);
        await expectTable(app, expectedFor("semicolon.csv").tables[0]);
    });

    test("a workbook alone is refused, and Close leaves the page as it was", async ({ app, page }) => {
        const { IMPORT_WORKBOOK_REASON } = await load("config-workflow.js");
        await app.open(`${NORTHLIGHT_URL}&preview=import,excel-import`);
        const before = await pageState(app, page);
        await app.chooseFiles(fixturePath("shopping_db.xlsx"));
        await expect(app.importDialog).toBeVisible();
        await expect(app.importPanel).toContainText(IMPORT_WORKBOOK_REASON);
        await expect(app.importSubmit).toBeHidden();
        await expect(app.importCancel).toHaveText(words.IMPORT_CLOSE_TEXT);
        await app.importCancel.click();
        await expect(app.importDialog).toBeHidden();
        expect(await pageState(app, page)).toEqual(before);
    });
});

// ---- what the plan decides and no fixture holds, through the page ---------------------------------------

// A file made in the test, chosen as a student chooses one.
const textFile = (name, text) => ({ name, mimeType: "text/csv", buffer: Buffer.from(text, "utf8") });

// the rows of the report's table of columns, as text: [name, name in the file, type, blanks, note]
const reportColumns = (page) =>
    page.locator("#results-pane .import-report table.import-report-columns tbody tr").evaluateAll((trs) => trs.map((tr) => [...tr.children].map((cell) => cell.textContent)));

test.describe("what the plan decides and no fixture holds (plan section 9), through the dialog", () => {
    test("-0 is not a plain number, so its column is TEXT and keeps the sign; -0.0 is a decimal, so its column is REAL and stores 0.0", async ({ app, page }) => {
        const { IMPORT_REPORT_BLOCKING_NOTE } = await load("config-workflow.js");
        // Plan section 9: "-0" stays text, because stored as a number it would lose its sign (rule 2);
        // "-0.0" is read as a decimal by rule 3 as written, and SQLite stores 0.0 (listed for the owner).
        await app.open(FLAG);
        await app.importFiles(textFile("signs.csv", "minus_zero,minus_decimal\n-0,-0.0\n5,2.5\n7,-0.00\n"));
        expect((await app.rows("PRAGMA table_info(signs)")).map((row) => [row[1], row[2]])).toEqual([
            ["minus_zero", "TEXT"],
            ["minus_decimal", "REAL"],
        ]);
        expect(await app.rows("SELECT quote(minus_zero), typeof(minus_zero), quote(minus_decimal), typeof(minus_decimal) FROM signs ORDER BY _rowid_")).toEqual([
            ["'-0'", "text", "0.0", "real"],
            ["'5'", "text", "2.5", "real"],
            ["'7'", "text", "0.0", "real"],
        ]);
        // the report points at the value that kept the column text
        const rows = await reportColumns(page);
        expect(rows.map((row) => [row[0], row[2]])).toEqual([
            ["minus_zero", "TEXT"],
            ["minus_decimal", "REAL"],
        ]);
        expect(rows[0][4]).toContain(IMPORT_REPORT_BLOCKING_NOTE);
        expect(rows[0][4]).toContain("-0");
        expect(rows[1][4]).toBe("");
    });

    test("a row of column names made of spaces only is named column_ and its position, and the report shows the name in the file as blank", async ({ app, page }) => {
        const { IMPORT_REPORT_BLANK_NAME } = await load("config-workflow.js");
        await app.open(FLAG);
        await app.chooseFiles(textFile("gaps.csv", "a,   ,c,\t\n1,2,3,4\n"));
        await dialogReady(app);
        // the row is still taken for names: spaces are not data
        await expect(settingsOf(app).hasNames).toBeChecked();
        await expect(app.importSubmit).toBeEnabled();
        await app.importSubmit.click();
        await expect(app.importDialog).toBeHidden();
        await expect(app.pane).toHaveAttribute("data-state", "report");
        expect((await app.rows("PRAGMA table_info(gaps)")).map((row) => [row[1], row[2]])).toEqual([
            ["a", "INTEGER"],
            ["column_2", "INTEGER"],
            ["c", "INTEGER"],
            ["column_4", "INTEGER"],
        ]);
        expect(await app.rows("SELECT * FROM gaps")).toEqual([[1, 2, 3, 4]]);
        const rows = await reportColumns(page);
        expect(rows.map((row) => [row[0], row[1]])).toEqual([
            ["a", ""],
            ["column_2", IMPORT_REPORT_BLANK_NAME],
            ["c", ""],
            ["column_4", IMPORT_REPORT_BLANK_NAME],
        ]);
    });

    // "PK" are the first two bytes of every .xlsx, but a workbook starts with four bytes (50 4B 03 04):
    // a CSV whose first column is called PK is text, under any name, and a workbook's name does not
    // change that.
    for (const name of ["pk_list.csv", "pk_list.txt", "pk_list.xlsx", "pk_list.xls"]) {
        test(`a text file that starts with the letters PK is imported as text under the name ${name}`, async ({ app }) => {
            await app.open(FLAG);
            await app.chooseFiles(textFile(name, "PK,name\n1,a\n2,b\n"));
            await dialogReady(app);
            await expect(app.importDialog.getByRole("tab", { name: refusedWords() })).toHaveCount(0);
            await expect(settingsOf(app).tableName).toHaveValue("pk_list");
            await expect(settingsOf(app).delimiter).toHaveValue(",");
            await expect(settingsOf(app).hasNames).toBeChecked();
            await expect(app.importSubmit).toBeEnabled();
            await app.importSubmit.click();
            await expect(app.importDialog).toBeHidden();
            await expect(app.pane).toHaveAttribute("data-state", "report");
            expect((await app.rows("PRAGMA table_info(pk_list)")).map((row) => [row[1], row[2]])).toEqual([
                ["PK", "INTEGER"],
                ["name", "TEXT"],
            ]);
            expect(await app.rows("SELECT PK, name FROM pk_list ORDER BY _rowid_")).toEqual([
                [1, "a"],
                [2, "b"],
            ]);
        });
    }

    // plan section 9: "a file of blank lines only" is empty (Papa skips every line; nothing is left)
    for (const [label, body] of [
        ["one line feed", "\n"],
        ["three line feeds", "\n\n\n"],
        ["carriage return and line feed, three times", "\r\n\r\n\r\n"],
        ["two carriage returns", "\r\r"],
    ]) {
        test(`a file of blank lines only (${label}) is refused as empty, and nothing is left behind`, async ({ app, page }) => {
            const { IMPORT_EMPTY_REASON } = await load("config-workflow.js");
            await app.open(`${NORTHLIGHT_URL}&preview=import`);
            const before = await pageState(app, page);
            await app.trackConnections();
            await app.chooseFiles(textFile("blank.csv", body));
            await expect(app.importDialog).toBeVisible();
            await expect(app.importDialog.getByRole("tab", { name: refusedName() })).toHaveCount(1);
            await expect(app.importPanel.locator(".import-refusal")).toHaveText(IMPORT_EMPTY_REASON);
            await expect(app.importSubmit).toBeHidden();
            await expect(app.importCancel).toHaveText(words.IMPORT_CLOSE_TEXT);
            await app.importCancel.click();
            await expect(app.importDialog).toBeHidden();
            expect(await pageState(app, page)).toEqual(before);
            expect((await app.connections()).filter((connection) => connection.open)).toEqual([]);
        });
    }

    // plan section 9: UTF-16 with no byte-order mark has zero bytes and no mark, which the zero-byte test
    // refuses (with the mark it is read: the fixtures utf16le_bom.txt and utf16be_bom.csv)
    for (const [label, encode] of [
        ["little-endian", (text) => Buffer.from(text, "utf16le")],
        ["big-endian", (text) => Buffer.from(text, "utf16le").swap16()],
    ]) {
        test(`UTF-16 ${label} text with no byte-order mark is refused as not text, and nothing is left behind`, async ({ app, page }) => {
            const { IMPORT_NOT_TEXT_REASON } = await load("config-workflow.js");
            await app.open(`${NORTHLIGHT_URL}&preview=import`);
            const before = await pageState(app, page);
            await app.trackConnections();
            await app.chooseFiles({ name: "wide.csv", mimeType: "text/csv", buffer: encode("a,b\n1,2\n") });
            await expect(app.importDialog).toBeVisible();
            await expect(app.importDialog.getByRole("tab", { name: refusedName() })).toHaveCount(1);
            await expect(app.importPanel.locator(".import-refusal")).toHaveText(IMPORT_NOT_TEXT_REASON);
            await expect(app.importSubmit).toBeHidden();
            await app.importCancel.click();
            await expect(app.importDialog).toBeHidden();
            expect(await pageState(app, page)).toEqual(before);
            expect((await app.connections()).filter((connection) => connection.open)).toEqual([]);
        });
    }
});

// ---- two edges that a sweep of the code by mutation found unheld (the eighth round) --------------------

test.describe("edges that a sweep of the code by mutation found unheld, through the page", () => {
    // What a file is, is read from its first HEAD_BYTES (js/lab/import-text.js), white space
    // before the first character left aside. With that number made 8, a page like this one was
    // taken for text and imported as a table of one column.
    test("a web page saved under a workbook's name is refused as a workbook also when blank lines come before its first tag", async ({ app, page }) => {
        const saved = `${"\r\n".repeat(60)}   <html><body><table><tr><td>a</td><td>b</td></tr><tr><td>1</td><td>2</td></tr></table></body></html>\n`;
        await app.open(FLAG);
        const before = await pageState(app, page);
        await app.chooseFiles([{ name: "page.xls", mimeType: "application/vnd.ms-excel", buffer: Buffer.from(saved, "utf8") }]);
        await expect(app.importDialog).toBeVisible();
        await expect(app.importDialog.getByRole("tab", { name: refusedName() })).toHaveCount(1);
        await expect(app.importPanel.locator(".import-refusal")).toHaveText(words.IMPORT_WORKBOOK_REASON);
        await expect(app.importCancel).toHaveText(words.IMPORT_CLOSE_TEXT);
        await app.importCancel.click();
        await expect(app.importDialog).toBeHidden();
        expect(await pageState(app, page)).toEqual(before);
    });

    // Rule 5: the empty field alone is NULL. With a field of one space made NULL too, every test
    // passed: no file held such a field.
    test("a cell of one space is stored as that space, one of two as two, and the empty cell alone is NULL", async ({ app, page }) => {
        await app.open(FLAG);
        await app.importFiles(textFile("spaces.csv", "a,b\n ,x\n  ,y\n,z\n"));
        expect(await app.rows("SELECT a, length(a), typeof(a), b FROM spaces ORDER BY _rowid_")).toEqual([
            [" ", 1, "text", "x"],
            ["  ", 2, "text", "y"],
            [null, null, "null", "z"],
        ]);
        // and the report counts the one blank
        expect((await reportColumns(page)).map((row) => [row[0], row[3]])).toEqual([
            ["a", "1"],
            ["b", "0"],
        ]);
    });
});

// ---- the same sweep, in the database layer and the report ----------------------------------------------

test.describe("edges that a sweep of the code by mutation found unheld: the staging table and the report", () => {
    // The staging table starts one column wide and is made wider when a wider row comes. With rows
    // staged already, columns are added to it. A version that made the table again instead lost
    // every row staged before the wide one, with no error and a report that looked right; two
    // others made the import fail. No file had its widest row after its first slice.
    for (const [what, header, narrow, wide, columns] of [
        ["one field, then two", "a", (i) => `x${i}`, (i) => `y${i},z${i}`, ["a", "extra_1"]],
        ["two fields, then four", "a,b", (i) => `x${i},${i}`, (i) => `y${i},${i},p${i},q${i}`, ["a", "b", "extra_1", "extra_2"]],
    ]) {
        test(`a row wider than every row before it, far into the file, keeps all the rows that came before it: ${what}`, async ({ app }) => {
            const { IMPORT_SLICE_BYTES } = words;
            const narrowRows = Array.from({ length: 25000 }, (_, i) => narrow(i));
            const wideRows = Array.from({ length: 5 }, (_, i) => wide(i));
            const text = `${header}\n${narrowRows.join("\n")}\n${wideRows.join("\n")}\n`;
            expect(text.indexOf(wideRows[0]), "the first wide row comes after the first two slices of the import").toBeGreaterThan(2 * IMPORT_SLICE_BYTES);
            await app.open(FLAG);
            await app.importFiles(textFile("late.csv", text));
            expect((await app.rows("PRAGMA table_info(late)")).map((row) => row[1])).toEqual(columns);
            const last = columns.at(-1);
            expect(await app.rows(`SELECT count(*), count(${last}) FROM late`)).toEqual([[narrowRows.length + wideRows.length, wideRows.length]]);
            const whole = (row) => row.split(",").map((field) => (/^[0-9]+$/.test(field) ? Number(field) : field));
            const padded = (row) => [...whole(row), ...Array(columns.length - whole(row).length).fill(null)];
            expect(await app.rows("SELECT * FROM late ORDER BY _rowid_ LIMIT 1")).toEqual([padded(narrowRows[0])]);
            expect(await app.rows(`SELECT * FROM late ORDER BY _rowid_ LIMIT 1 OFFSET ${narrowRows.length - 1}`)).toEqual([padded(narrowRows.at(-1))]);
            expect(await app.rows("SELECT * FROM late ORDER BY _rowid_ DESC LIMIT 1")).toEqual([whole(wideRows[4])]);
        });
    }

    // (a column that no row reached filled with empty text, where it is to be NULL)
    test("a column that the row of names gives and no row reaches is NULL in every row, and the report counts every row blank in it", async ({ app, page }) => {
        await app.open(FLAG);
        await app.importFiles(textFile("short.csv", "a,b,c,d\n1,2\n3,4\n"));
        expect(await app.rows("SELECT a, b, c, d, typeof(c), typeof(d) FROM short ORDER BY _rowid_")).toEqual([
            [1, 2, null, null, "null", "null"],
            [3, 4, null, null, "null", "null"],
        ]);
        expect((await reportColumns(page)).map((row) => [row[0], row[3]])).toEqual([
            ["a", "0"],
            ["b", "0"],
            ["c", "2"],
            ["d", "2"],
        ]);
    });

    // (the space between the note's words and the value dropped; the column's name no longer the
    // heading of its row; the count of blanks no longer set as a number)
    test("in the report a column's name is the heading of its row, the count of blanks is set as a number is, and the note is a sentence with the value after it", async ({ app, page }) => {
        await app.open(FLAG);
        await app.importFiles(textFile("v.csv", "id,v\n1,10\n2,abc\n3,30\n"));
        const table = page.locator("#results-pane .import-report table.import-report-columns");
        await expect(table.getByRole("rowheader")).toHaveText(["id", "v"]);
        expect(await table.locator("tbody th").evaluateAll((cells) => cells.map((cell) => cell.scope))).toEqual(["row", "row"]);
        expect(await table.locator("thead th").evaluateAll((cells) => cells.map((cell) => cell.scope))).toEqual(Array(5).fill("col"));
        const rows = await reportColumns(page);
        expect(rows[1].slice(2)).toEqual(["TEXT", "0", `${words.IMPORT_REPORT_BLOCKING_NOTE} abc`]);
        // the fourth cell of a row is its count of blanks: to the right, as every number in a result is
        const blanks = table.locator("tbody tr").first().locator(":scope > *").nth(3);
        await expect(blanks).toHaveText("0");
        expect(await blanks.evaluate((cell) => getComputedStyle(cell).textAlign)).toBe("right");
    });
});

// ---- what the plan leaves as the library reads it, through the table ----------------------------------

test.describe("what the plan leaves as the library reads it (plan section 9), through the table", () => {
    test('a line holding only "" is skipped: the table has the rows around it and no row for it', async ({ app }) => {
        await app.open(FLAG);
        await app.importFiles(textFile("quoted_gap.csv", 'a,b\n1,2\n""\n3,4\n'));
        expect((await app.rows("PRAGMA table_info(quoted_gap)")).map((row) => [row[1], row[2]])).toEqual([
            ["a", "INTEGER"],
            ["b", "INTEGER"],
        ]);
        // two rows: had "" been a row it would be a third, of NULLs, between them
        expect(await app.rows("SELECT a, b FROM quoted_gap ORDER BY _rowid_")).toEqual([
            [1, 2],
            [3, 4],
        ]);
    });

    test("a file that mixes line endings is read with the one found first: here CRLF, so a lone line feed stays inside its field", async ({ app, page }) => {
        // header and rows end in CRLF but for the line break after the 2: with CRLF as the ending,
        // that line feed is part of the field, and the row is ("1", "2\n3"); the last row ends in
        // a lone line feed, which is part of its last field too
        await app.open(FLAG);
        await app.importFiles(textFile("mixed.csv", "a,b\r\n1,2\n3\r\n5,6\n"));
        expect((await app.rows("PRAGMA table_info(mixed)")).map((row) => [row[1], row[2]])).toEqual([
            ["a", "INTEGER"],
            ["b", "TEXT"],
        ]);
        expect(await app.rows("SELECT a, b FROM mixed ORDER BY _rowid_")).toEqual([
            [1, "2\n3"],
            [5, "6\n"],
        ]);
        await expect(page.locator("#results-pane .import-report .import-report-line")).toHaveText(
            (await load("config-workflow.js")).importReportTableLine(2, 2, "mixed.csv")
        );
    });

    test("a file that mixes line endings the other way round is read with LF, so a carriage return stays inside its field", async ({ app }) => {
        // the first line break is a lone line feed: the ending is LF, and the CR of the others stays in
        // the field before it ("2\r" and "6\r"), the row between them has none
        await app.open(FLAG);
        await app.importFiles(textFile("mixed_lf.csv", "a,b\n1,2\r\n3,4\n5,6\r\n"));
        expect(await app.rows("SELECT a, quote(b) FROM mixed_lf ORDER BY _rowid_")).toEqual([
            [1, "'2\r'"],
            [3, "'4'"],
            [5, "'6\r'"],
        ]);
        expect((await app.rows("PRAGMA table_info(mixed_lf)")).map((row) => [row[1], row[2]])).toEqual([
            ["a", "INTEGER"],
            ["b", "TEXT"],
        ]);
    });
});

// ---- the settings shown are the settings used (plan section 3, "Preview dialog") ---------------------------

// the cells of the preview as drawn, row by row
const previewCells = (app) =>
    app.importPanel.locator(".import-preview-table tbody tr").evaluateAll((trs) => trs.map((tr) => [...tr.querySelectorAll("td")].map((td) => td.textContent)));

test.describe("the delimiter is Papa's guess among four, and the import uses the settings on show", () => {
    // Papa's own default list holds U+001F and U+001E too, which the select cannot show. A file split by
    // either is a file of one column: the dialog says Comma and the preview has one column, and the
    // table has one column and a row for each line.
    for (const [name, character] of [
        ["the unit separator U+001F", "\u001f"],
        ["the record separator U+001E", "\u001e"],
    ]) {
        test(`a file whose fields are separated by ${name} shows Comma and one column, and is imported as one column`, async ({ app }) => {
            const lines = ["id,a,b", "1,x,y", "2,z,w"].map((line) => line.split(",").join(character));
            await app.open(FLAG);
            await app.chooseFiles(textFile("separated.csv", `${lines.join("\n")}\n`));
            await dialogReady(app);
            await expect(settingsOf(app).delimiter).toHaveValue(",");
            await expect(app.importPanel.locator(".import-preview-table thead th")).toHaveCount(2); // the row number and one column
            expect(await previewCells(app)).toEqual(lines.map((line) => [line]));
            await expect(app.importSubmit).toBeEnabled();
            await app.importSubmit.click();
            await expect(app.importDialog).toBeHidden();
            await expect(app.pane).toHaveAttribute("data-state", "report");
            const columns = await app.rows("PRAGMA table_info(separated)");
            expect(columns).toHaveLength(1);
            // a row for each line below the names, and the separator still in the text of each value
            expect(await app.rows(`SELECT count(*), sum(instr("${columns[0][1]}", char(${character.charCodeAt(0)})) > 0) FROM separated`)).toEqual([[2, 2]]);
        });
    }

    // The plan's own case: a Windows file with one lone quote in a heading. Left to itself Papa pairs
    // that quote with the next one, and the line breaks between the rows no longer count. The dialog
    // finds CRLF, shows the three rows, and the import is handed that ending: the column is INTEGER and
    // no value holds a carriage return (with the ending left to Papa, the first two values were '72\r'
    // and '70\r' and the column TEXT).
    test('a Windows file with one lone quote in a heading: three rows in the preview, an INTEGER column of 72, 70, 68, and no carriage return in the table', async ({ app }) => {
        await app.open(FLAG);
        await app.chooseFiles(textFile("heights.csv", 'Name,Height (in")\r\n"Smith, J",72\r\n"Lee, K",70\r\n"Wu, P",68'));
        await dialogReady(app);
        expect(await previewCells(app)).toEqual([
            ['Name', 'Height (in")'],
            ["Smith, J", "72"],
            ["Lee, K", "70"],
            ["Wu, P", "68"],
        ]);
        await app.importSubmit.click();
        await expect(app.importDialog).toBeHidden();
        await expect(app.pane).toHaveAttribute("data-state", "report");
        const columns = await app.rows("PRAGMA table_info(heights)");
        expect(columns.map((column) => column[2])).toEqual(["TEXT", "INTEGER"]);
        const [name, height] = columns.map((column) => `"${column[1]}"`);
        expect(await app.rows(`SELECT ${name}, ${height}, typeof(${height}) FROM heights ORDER BY _rowid_`)).toEqual([
            ["Smith, J", 72, "integer"],
            ["Lee, K", 70, "integer"],
            ["Wu, P", 68, "integer"],
        ]);
        for (const column of columns) {
            expect(await app.rows(`SELECT count(*) FROM heights WHERE instr("${column[1]}", char(13)) > 0`), column[1]).toEqual([[0]]);
        }
    });

    // The delimiter on show is the one handed to Papa as well: left to guess, Papa would take the comma
    // here (three fields a line against two) and the table would have four columns. The student
    // chooses Semicolon, and the table has the two columns the dialog shows.
    test("a delimiter chosen in the dialog is the one used: Semicolon, where Papa would guess the comma, gives two columns", async ({ app }) => {
        await app.open(FLAG);
        await app.chooseFiles(textFile("chosen.csv", "a;b,c,d\n1;2,3,4\n5;6,7,8\n"));
        await dialogReady(app);
        await expect(settingsOf(app).delimiter).toHaveValue(",");
        expect(await previewCells(app)).toEqual([["a;b", "c", "d"], ["1;2", "3", "4"], ["5;6", "7", "8"]]);
        await settingsOf(app).delimiter.selectOption(";");
        // (the start of the file is read again: the preview follows when that has ended)
        await expect.poll(() => previewCells(app)).toEqual([["a", "b,c,d"], ["1", "2,3,4"], ["5", "6,7,8"]]);
        await app.importSubmit.click();
        await expect(app.importDialog).toBeHidden();
        await expect(app.pane).toHaveAttribute("data-state", "report");
        expect((await app.rows("PRAGMA table_info(chosen)")).map((column) => [column[1], column[2]])).toEqual([
            ["a", "INTEGER"],
            ["b_c_d", "TEXT"],
        ]);
        expect(await app.rows("SELECT a, b_c_d FROM chosen ORDER BY _rowid_")).toEqual([
            [1, "2,3,4"],
            [5, "6,7,8"],
        ]);
    });
});

// ---- the names a query must write in double quotes (plan section 3, under "Names" and "Import report";
// section 10, "Reserved words") ---------------------------------------------------------------------------
// The report names each table name and column name that SQL does not take bare, found by asking the
// engine (js/lab/import-db.js). These tests ask the same engine, through the open database, and do not
// hold a list of SQLite's words.
test.describe("the report names what a query must write in double quotes", () => {
    const quotedParagraph = (page) => page.locator("#results-pane .import-report-quoted");
    // the section of the report that has this heading, and the tag and class of each child it has
    const sectionChildren = (page, name) =>
        page
            .locator("#results-pane section.import-report-table")
            .filter({ has: page.getByRole("heading", { name, exact: true }) })
            .evaluate((section) => [...section.children].map((child) => `${child.tagName.toLowerCase()}.${child.className}`.replace(/ .*/, "")));
    // does SQL take this name bare, as the table's name or as a column's? Asked of the open database,
    // in the places where one name and another are known to differ: a table's name after FROM and in
    // front of a column, with and without parentheses; a column's name alone, in parentheses, and
    // read through a subquery. Bare, the name must give what it gives in double quotes on the table.
    // The names come back as the report lists them: the table's first, and a word once whatever its
    // letter case (the names an import makes are ASCII, and SQL reads Group and group as one name).
    async function bareAnswers(app, table, columns) {
        const attempt = async (sql) => {
            try {
                return { rows: await app.rows(sql) };
            } catch {
                return { error: true };
            }
        };
        const same = (a, b) => !a.error && !b.error && JSON.stringify(a.rows) === JSON.stringify(b.rows);
        const needs = [];
        const quotedTable = await attempt(`SELECT "${table}"."${columns[0]}" FROM "${table}"`);
        expect(quotedTable.error, "the quoted name always works").toBeUndefined();
        const tableTries = [`SELECT ${table}."${columns[0]}" FROM "${table}"`, `SELECT (${table}."${columns[0]}") FROM "${table}"`];
        let tableFine = !(await attempt(`SELECT count(*) FROM ${table}`)).error;
        for (const sql of tableTries) {
            tableFine = tableFine && same(await attempt(sql), quotedTable);
        }
        if (!tableFine) {
            needs.push(table);
        }
        for (const column of columns) {
            const quoted = await attempt(`SELECT "${column}" FROM "${table}"`);
            expect(quoted.error, "the quoted name always works").toBeUndefined();
            const columnTries = [`SELECT ${column} FROM "${table}"`, `SELECT (${column}) FROM "${table}"`, `SELECT ${column} FROM (SELECT * FROM "${table}")`];
            let columnFine = true;
            for (const sql of columnTries) {
                columnFine = columnFine && same(await attempt(sql), quoted);
            }
            if (!columnFine && !needs.some((name) => name.toLowerCase() === column.toLowerCase())) {
                needs.push(column);
            }
        }
        return needs;
    }
    const ORDER_COLUMNS = ["id", "Group", "select", "name", "null", "true", "current_date", "desc", "key"];
    const orderFile = () => textFile("Order.csv", `${ORDER_COLUMNS.join(",")}\n${ORDER_COLUMNS.map((c, i) => `${c}_a${i}`).join(",")}\n${ORDER_COLUMNS.map((c, i) => `${c}_b${i}`).join(",")}\n`);

    test("a table and its columns: the paragraph lists exactly the names the engine refuses or misreads, the table's first, columns in the table's order", async ({ app, page }) => {
        await app.open(FLAG);
        await app.importFiles(orderFile());
        const inTable = (await app.rows('PRAGMA table_info("Order")')).map((row) => row[1]);
        expect(inTable).toEqual(ORDER_COLUMNS);
        const expected = await bareAnswers(app, "Order", inTable);
        // sure cases, so that an empty list cannot pass
        for (const name of ["Order", "Group", "select", "null"]) {
            expect(expected, name).toContain(name);
        }
        for (const name of ["id", "name"]) {
            expect(expected, name).not.toContain(name);
        }
        expect(expected[0]).toBe("Order");
        await expect(quotedParagraph(page)).toHaveCount(1);
        await expect(quotedParagraph(page)).toHaveText(words.importReportQuotedText(expected));
        // the names, as the paragraph has them, in double quotes and the table's order
        const listed = [...(await quotedParagraph(page).innerText()).split("double quotes: ")[1].matchAll(/"([^"]+)"/g)].map((match) => match[1]);
        expect(listed).toEqual(expected);
        // and what it says holds: the quoted name works
        expect(await app.rows('SELECT "Group", "select" FROM "Order" ORDER BY _rowid_ LIMIT 1')).toEqual([["Group_a1", "select_a2"]]);
    });

    test("the text for one name and for several is the one in the config", async ({ app, page }) => {
        await app.open(FLAG);
        await app.importFiles(textFile("Order.csv", "id,name\n1,a\n"));
        // only the table's name: Order
        await expect(quotedParagraph(page)).toHaveText(words.importReportQuotedText(["Order"]));
        await expect(quotedParagraph(page)).toHaveText('SQL keeps the word Order for itself. In a query, write this name in double quotes: "Order".');
        await app.open(FLAG);
        await app.importFiles(textFile("Order.csv", "id,Group,select\n1,a,b\n"));
        await expect(quotedParagraph(page)).toHaveText(words.importReportQuotedText(["Order", "Group", "select"]));
        await expect(quotedParagraph(page)).toHaveText('SQL keeps these names for itself. In a query, write them in double quotes: "Order", "Group", "select".');
        // a file whose table is fine and one column is not: a single name, and it is the column's
        await app.open(FLAG);
        await app.importFiles(textFile("orders.csv", "id,Group\n1,a\n"));
        await expect(quotedParagraph(page)).toHaveText(words.importReportQuotedText(["Group"]));
    });

    test("a file with no such name has no such paragraph, and its section holds a heading, a line and a table", async ({ app, page }) => {
        await app.open(FLAG);
        await app.importFiles(textFile("plain.csv", "id,name,qty\n1,a,2\n2,b,3\n"));
        await expect(quotedParagraph(page)).toHaveCount(0);
        expect(await sectionChildren(page, "plain")).toEqual(["h2.import-report-name", "p.import-report-line", "table.result-table"]);
    });

    test("into the open database: the table that needs quotes gets the paragraph, the second table of the import that has no such name gets none, and the database holds only the two tables more", async ({
        app,
        page,
    }) => {
        await app.open(FLAG);
        await app.upload(SAMPLE_FILE);
        const before = (await app.rows("SELECT name FROM sqlite_schema ORDER BY name")).map((row) => row[0]);
        await app.importFiles([textFile("Order.csv", "id,Group\n1,a\n"), textFile("plain.csv", "id,name\n1,a\n")], { into: "open" });
        await expect(page.locator("#results-pane section.import-report-table")).toHaveCount(2);
        await expect(quotedParagraph(page)).toHaveCount(1);
        await expect(quotedParagraph(page)).toHaveText(words.importReportQuotedText(["Order", "Group"]));
        expect(await sectionChildren(page, "Order")).toEqual(["h2.import-report-name", "p.import-report-line", "p.import-report-quoted", "table.result-table"]);
        expect(await sectionChildren(page, "plain")).toEqual(["h2.import-report-name", "p.import-report-line", "table.result-table"]);
        const after = (await app.rows("SELECT name FROM sqlite_schema ORDER BY name")).map((row) => row[0]);
        expect(after).toEqual([...before, "Order", "plain"].sort());
        expect(await app.rows('SELECT "Group" FROM "Order"')).toEqual([["a"]]);
    });

    test("with the warning of an unpaired quote, the paragraph comes after it and before the table of columns", async ({ app, page }) => {
        await app.open(FLAG);
        await app.importFiles(textFile("Order.csv", 'id,Group\n1,"abc\n2,def\n'));
        await expect(page.locator("#results-pane .import-report-warning")).toHaveCount(1);
        await expect(quotedParagraph(page)).toHaveText(words.importReportQuotedText(["Order", "Group"]));
        expect(await sectionChildren(page, "Order")).toEqual([
            "h2.import-report-name",
            "p.import-report-line",
            "p.import-report-warning",
            "p.import-report-quoted",
            "table.result-table",
        ]);
    });

    test("a table name that SQL takes after FROM and refuses in front of a column is listed too: cast", async ({ app, page }) => {
        await app.open(FLAG);
        await app.importFiles(textFile("cast.csv", "id,actor\n1,a\n"));
        // what this engine does with the bare name (should a later engine take it in both places,
        // this test needs another name: the rule it holds is that both places are asked about)
        expect(await app.rows("SELECT count(*) FROM cast")).toEqual([[1]]);
        await expect(app.rows("SELECT cast.actor FROM cast")).rejects.toThrow();
        expect(await bareAnswers(app, "cast", ["id", "actor"])).toEqual(["cast"]);
        await expect(quotedParagraph(page)).toHaveText(words.importReportQuotedText(["cast"]));
        expect(await app.rows('SELECT "cast".actor FROM "cast"')).toEqual([["a"]]);
    });

    test("a column that SQL reads in one place of a query and not in another is listed: with is refused in parentheses, true is the constant through a subquery", async ({
        app,
        page,
    }) => {
        await app.open(FLAG);
        await app.importFiles(textFile("plain.csv", "id,true,with\n1,yes,a\n2,no,b\n"));
        // what this engine does with the bare names (should a later engine read them alike in every
        // place, this test needs other names: the rule it holds is that each place is asked about)
        expect(await app.rows("SELECT with FROM plain ORDER BY id")).toEqual([["a"], ["b"]]);
        await expect(app.rows("SELECT id FROM plain WHERE (with = 'a')")).rejects.toThrow();
        expect(await app.rows("SELECT true FROM plain ORDER BY id")).toEqual([["yes"], ["no"]]);
        expect(await app.rows("SELECT true FROM (SELECT * FROM plain) ORDER BY id")).toEqual([[1], [1]]);
        expect(await bareAnswers(app, "plain", ["id", "true", "with"])).toEqual(["true", "with"]);
        await expect(quotedParagraph(page)).toHaveText(words.importReportQuotedText(["true", "with"]));
        // quoted, each is read
        expect(await app.rows(`SELECT "true" FROM plain WHERE ("with" = 'b')`)).toEqual([["no"]]);
    });

    test("a table called with is listed (refused in parentheses in front of a column), and a column called as its table, in any letter case, is named once", async ({
        app,
        page,
    }) => {
        await app.open(FLAG);
        await app.importFiles(textFile("with.csv", "id,With\n1,a\n"));
        expect(await app.rows("SELECT with.id FROM with")).toEqual([[1]]);
        await expect(app.rows("SELECT (with.id) FROM with")).rejects.toThrow();
        // the column With is the same word to SQL: the table's spelling is the one listed
        expect((await app.rows('PRAGMA table_info("with")')).map((row) => row[1])).toEqual(["id", "With"]);
        expect(await bareAnswers(app, "with", ["id", "With"])).toEqual(["with"]);
        await expect(quotedParagraph(page)).toHaveText('SQL keeps the word with for itself. In a query, write this name in double quotes: "with".');
        // the same letters, the same case
        await app.open(FLAG);
        await app.importFiles(textFile("Group.csv", "Group,x\n1,a\n"));
        expect(await bareAnswers(app, "Group", ["Group", "x"])).toEqual(["Group"]);
        await expect(quotedParagraph(page)).toHaveText('SQL keeps the word Group for itself. In a query, write this name in double quotes: "Group".');
    });

    test("a list of thirty names takes several lines at 390 px and nothing scrolls sideways; the paragraph is drawn as the line above it", async ({
        app,
        page,
    }) => {
        await page.setViewportSize({ width: 390, height: 844 });
        const columns = "select from where group order by having limit join on as and or not null is in between case when then else distinct union except intersect values insert update delete".split(" ");
        expect(columns).toHaveLength(30);
        await app.open(FLAG);
        await app.importFiles(textFile("Order.csv", `${columns.join(",")}\n${columns.map((_, i) => i).join(",")}\n`));
        const inTable = (await app.rows('PRAGMA table_info("Order")')).map((row) => row[1]);
        expect(inTable).toEqual(columns);
        const expected = await bareAnswers(app, "Order", inTable);
        expect(expected.length, "most of these words are refused bare").toBeGreaterThan(20);
        const paragraph = quotedParagraph(page);
        await expect(paragraph).toHaveText(words.importReportQuotedText(expected));
        const box = await paragraph.evaluate((node) => ({
            scrollWidth: node.scrollWidth,
            clientWidth: node.clientWidth,
            height: node.getBoundingClientRect().height,
            fontSize: parseFloat(getComputedStyle(node).fontSize),
        }));
        expect(box.scrollWidth).toBeLessThanOrEqual(box.clientWidth);
        expect(box.height, "several lines").toBeGreaterThan(3 * box.fontSize);
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
        const drawn = (locator) =>
            locator.evaluate((node) => {
                const style = getComputedStyle(node);
                return { color: style.color, fontSize: style.fontSize, fontWeight: style.fontWeight, marginTop: style.marginTop, marginBottom: style.marginBottom };
            });
        expect(await drawn(paragraph)).toEqual(await drawn(page.locator("#results-pane .import-report-line").first()));
    });
});
