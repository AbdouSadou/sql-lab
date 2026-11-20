// Assessment plan, Phase 5 (import Excel workbooks), in the page: the proof of the owner's fixtures.
// The modules that read a workbook are tried in Node (tests/aw5-excel-rules.spec.js); here the
// workbooks go through the page itself, with both flags on, and the engine is asked what came out.
// The page is opened with ?preview=import,excel-import (the flag "excel-import" does nothing without
// "import"). Page tests reach code through the bundle only (await import("./bundle/app.js")). Expected
// values come from the owner's expected files (tests/fixtures/, never edited) or are typed in here;
// none is worked out by the code under test. The typed table, the report, the run of a sheet and the
// libraries are in tests/aw5-excel-page.spec.js; the strip of sheets and what a tab and a panel say
// are in tests/aw5-excel-dialog.spec.js.
//
// 1. Every workbook of the fixtures, chosen in the page and imported through the real dialog with every
//    sheet that can be ticked ticked ("Tick every sheet"): the sheets as its expected file lists them,
//    the tables (names, declared types, typeof of the stored values, every cell), the report's facts,
//    and the event the evidence log keeps.
// 2. The plan's "Done when" line by line: shopping_db.xlsx as four tables and the date of the first
//    order also in other time zones, the zero-padded column of excel/formats.xlsx named with 00123, each
//    header_row, hidden rows and columns imported like any other, the three impostors that can be read,
//    and the four files that are refused and leave nothing behind.
// 3. Workbooks under other names, and files that are refused (what a file is comes from its bytes).
// 4. A workbook made in the test, with numbers of 1e19 and 6.02e23 stored as they are.
// 5. The zip check in the browser's own DecompressionStream: a changed byte is refused as damaged, and
//    the library never sees it; every .xlsx of the fixtures passes.

const fs = require("node:fs");
const path = require("node:path");
const { pathToFileURL } = require("node:url");
const {
    test,
    expect,
    NORTHLIGHT_URL,
    compareTable,
    eventsOfOpen,
    expectedFor,
    fixtureIndex,
    fixturePath,
    holdVendor,
    readTable,
    BASENAME,
    BYTES,
    tablesOf,
    dialogReady,
    expectTables,
    eventLines,
    workbookFile,
    escaped,
} = require("./helpers");

const FLAGS = "./?preview=import,excel-import";

const load = (file) => import(pathToFileURL(path.join(__dirname, "..", "js", "lab", file)).href);

let words;
test.beforeAll(async () => {
    words = await load("config-workflow.js");
});

// ---- every workbook of the fixtures, through the dialog ---------------------------------------------------

// the new database is named after the first file, without its extension
const DATABASE = (name) => BASENAME(name).replace(/\.[^.]*$/, "");

// every workbook the fixtures hold (an expected file with sheets), in the index's order
const WORKBOOKS = fixtureIndex()
    .map((entry) => entry.fixture)
    .filter((name) => !name.startsWith("export/"))
    .filter((name) => expectedFor(name).sheets);

// what a column's row of the report says: the name in the file where the name changed ("blank" for a
// blank header), the type, the blanks, and the note
async function expectReport(page, expectedTables, sourceOf) {
    const sections = page.locator("#results-pane .import-report section");
    await expect(sections).toHaveCount(expectedTables.length);
    for (const [i, table] of expectedTables.entries()) {
        const section = sections.nth(i);
        await expect(section.locator("h2")).toHaveText(table.name);
        await expect(section.locator(".import-report-line")).toHaveText(words.importReportTableLine(table.rows, table.columns.length, sourceOf(table)));
        const rows = await section.locator("table.import-report-columns tbody tr").evaluateAll((trs) => trs.map((tr) => [...tr.children].map((cell) => cell.textContent)));
        expect(rows).toHaveLength(table.columns.length);
        table.columns.forEach((column, c) => {
            const [name, original, type, blanks, note] = rows[c];
            expect(name, `${table.name}, column ${c + 1}`).toBe(column.name);
            const wantOriginal = column.original === undefined ? "" : column.original === "" ? words.IMPORT_REPORT_BLANK_NAME : column.original;
            expect(original, `${table.name}.${column.name}: name in the file`).toBe(wantOriginal);
            expect(type, `${table.name}.${column.name}: type`).toBe(column.type);
            expect(blanks, `${table.name}.${column.name}: blanks`).toBe(String(column.nulls));
            if (column.report_example !== undefined) {
                expect(note, `${table.name}.${column.name}: blocking value`).toContain(column.report_example);
            } else if (!PADDED[table.name]?.includes(column.name)) {
                expect(note, `${table.name}.${column.name}: note`).toBe("");
            }
        });
    }
}

// The columns whose number format pads with zeros, and a cell of which lost them: the workbooks that
// have such a column, typed from the owner's notes (excel/formats.xlsx and .xls: the column
// LeadingZeroFormat, format 00000, the number 123 shown as 00123).
const PADDED = { Formats: ["LeadingZeroFormat"] };

// the accessible name a sheet's tab has: its name, then its state in brackets
function tabName(sheet) {
    if (!sheet.importable) {
        return `${sheet.sheet} (no values)`;
    }
    if (sheet.ticked_by_default) {
        return `${sheet.sheet} (${words.IMPORT_SHEET_TICKED_TEXT})`;
    }
    return `${sheet.sheet} (${words.IMPORT_SHEET_HIDDEN_NOT_TICKED_TEXT})`;
}

test.describe("every workbook of the fixtures, chosen in the page and imported with every sheet ticked", () => {
    for (const name of WORKBOOKS) {
        test(`${name}: the sheets are listed as its expected file says, and the import gives its tables, its report and its event`, async ({ app, page }) => {
            const expected = expectedFor(name);
            const file = BASENAME(name);
            const importable = expected.sheets.filter((sheet) => sheet.importable);
            await app.open(FLAGS);
            // (both flags really are on: this is not the page of the import alone)
            expect(await page.evaluate(async () => (await import("./bundle/app.js")).flags.flagOn("excel-import"))).toBe(true);
            await app.chooseFiles(fixturePath(name));
            await dialogReady(app);
            // the file has its own tab, and the sheets have a strip of their own, in the workbook's order
            await expect(app.importTabs).toHaveCount(1);
            await expect(app.importTabs.first()).toHaveText(file);
            const ticked = expected.sheets.filter((sheet) => sheet.ticked_by_default).length;
            const count = (n) =>
                words.importSheetsCountText({ ticked: n, tickable: importable.length, unable: expected.sheets.length - importable.length, charts: expected.chart_sheets_not_listed.length });
            if (expected.sheets.length === 1) {
                // a workbook that lists one sheet has no strip: its panel shows that sheet, ticked, and says
                // nothing of a count unless charts were left out
                await expect(app.importSheetStrip(words.importSheetsLabel(file))).toHaveCount(0);
                await expect(app.importSheetPanel).toContainText(words.importSheetLineText(expected.sheets[0].sheet));
                await expect(app.importSheetPanel.getByLabel(words.IMPORT_SHEET_TICK_LABEL, { exact: true })).toBeChecked();
                await expect(app.importPanel.getByRole("button", { name: words.IMPORT_TICK_ALL_SHEETS_TEXT })).toHaveCount(0);
                await expect(app.importPanel.locator(".import-sheets-count")).toHaveCount(expected.chart_sheets_not_listed.length ? 1 : 0);
            } else {
                const strip = app.importSheetStrip(words.importSheetsLabel(file));
                await expect(strip.getByRole("tab")).toHaveCount(expected.sheets.length);
                await expect(strip.getByRole("tab")).toHaveText(expected.sheets.map((sheet) => new RegExp(`^${escaped(sheet.sheet)}`)));
                for (const [i, sheet] of expected.sheets.entries()) {
                    await expect(strip.getByRole("tab").nth(i), `the tab of ${sheet.sheet}`).toHaveAccessibleName(tabName(sheet));
                }
                // the line over the strip: what will be imported as it is, and what cannot be
                await expect(app.importPanel.locator(".import-sheets-count")).toHaveText(count(ticked));
                // every sheet that can be ticked is ticked, the hidden ones too
                await app.importPanel.getByRole("button", { name: words.IMPORT_TICK_ALL_SHEETS_TEXT, exact: true }).click();
                await expect(app.importPanel.locator(".import-sheets-count")).toHaveText(count(importable.length));
            }
            await expect(app.importSubmit).toBeEnabled();
            await app.importSubmit.click();
            await expect(app.importDialog).toBeHidden();
            await expect(app.pane).toHaveAttribute("data-state", "report");

            const tables = tablesOf(expected);
            await expectTables(app, tables);
            // the new database is named after the file
            expect(await page.evaluate(() => window.app.database.name)).toBe(DATABASE(name));
            await expectReport(page, tables, (table) => words.importSheetSource(file, table.source));
            // one event, the file's line and a line for each table, each ending with its sheet
            const events = await eventsOfOpen(page);
            expect(events.map((event) => [event.kind, event.lines])).toEqual([["import", eventLines(file, BYTES(name), tables)]]);
            await expect(app.summary).toContainText(words.importedMessage(tables.length, DATABASE(name)));
        });
    }

    test("there are workbooks to try: fifteen, with every kind the plan names", () => {
        expect(WORKBOOKS).toHaveLength(15);
        expect(WORKBOOKS).toEqual(expect.arrayContaining(["shopping_db.xlsx", "excel/formats.xlsx", "excel/formats.xls", "excel/hidden.xlsx", "excel/empty_sheets.xlsx", "excel/chart_sheet.xlsx", "excel/xlwt_written.xls"]));
    });
});

// the dialog's panel for one sheet, after the sheet's tab has been pressed
const selectSheet = (app, file, sheet) => app.importSheetStrip(words.importSheetsLabel(file)).getByRole("tab", { name: new RegExp(`^${escaped(sheet)} \\(`) }).click();

// the report's paragraphs about formula cells that came out empty, one for each table that has any
const emptyFormulaLines = (page) => page.locator("#results-pane .import-report .import-report-formulas").allTextContents();

// ---- the plan's "Done when", line by line ------------------------------------------------------------------

test.describe("the plan's 'Done when' for the import of Excel workbooks", () => {
    test("shopping_db.xlsx imports as four tables, and OrderDate of the first row of orders is 2023-08-05", async ({ app }) => {
        await app.open(FLAGS);
        await app.importFiles(fixturePath("shopping_db.xlsx"));
        expect((await app.rows("SELECT name FROM sqlite_schema WHERE type = 'table' ORDER BY name")).flat()).toEqual(["customers", "orders", "products", "quantities"]);
        expect(await app.rows("SELECT OrderDate, typeof(OrderDate) FROM orders ORDER BY _rowid_ LIMIT 1")).toEqual([["2023-08-05", "text"]]);
    });

    // the calendar is the app's own, in whole days: a computer's time zone cannot move a date (a zone that
    // skipped a day in 2011, and one far behind UTC, are the cases that would)
    for (const timezoneId of ["Pacific/Apia", "America/Los_Angeles"]) {
        test.describe(`with the page's time zone set to ${timezoneId}`, () => {
            test.use({ timezoneId });
            test(`OrderDate of the first row of orders is 2023-08-05, and every table is as expected`, async ({ app, page }) => {
                expect(await page.evaluate(() => Intl.DateTimeFormat().resolvedOptions().timeZone)).toBe(timezoneId);
                await app.open(FLAGS);
                await app.importFiles(fixturePath("shopping_db.xlsx"));
                expect(await app.rows("SELECT OrderDate FROM orders ORDER BY _rowid_ LIMIT 1")).toEqual([["2023-08-05"]]);
                await expectTables(app, tablesOf(expectedFor("shopping_db.xlsx")));
            });
            test(`excel/formats.xlsx gives its dates as its expected file says`, async ({ app }) => {
                await app.open(FLAGS);
                await app.importFiles(fixturePath("excel/formats.xlsx"));
                await expectTables(app, tablesOf(expectedFor("excel/formats.xlsx")));
            });
        });
    }

    for (const name of ["excel/formats.xlsx", "excel/formats.xls"]) {
        test(`${name}: the report names the leading-zero column with the number Excel showed, 00123, and says the zeros are not in the table`, async ({ app, page }) => {
            const sheet = expectedFor(name).sheets.find((one) => one.sheet === "Formats");
            await app.open(FLAGS);
            await app.importFiles(fixturePath(name));
            const section = page.locator("#results-pane .import-report section", { has: page.locator("h2", { hasText: /^Formats$/ }) });
            const note = section.locator("table.import-report-columns tbody tr", { has: page.locator("th", { hasText: /^LeadingZeroFormat$/ }) }).locator("td.import-report-note");
            // (typed: the sentence the plan asks for, with the example and the number)
            await expect(note).toHaveText("Excel showed 00123 for the number 123: the zeros are not in the table.");
            // the column is the whole number it holds, and the text column of zeros is as it was typed
            expect(sheet.table.columns.find((column) => column.name === "LeadingZeroFormat").type).toBe("INTEGER");
            expect(await app.rows("SELECT LeadingZeroFormat, typeof(LeadingZeroFormat), LeadingZeroText FROM Formats ORDER BY _rowid_ LIMIT 1")).toEqual([[123, "integer", "00123"]]);
            // no other column of the workbook has a note of this kind
            await expect(page.locator("#results-pane .import-report .import-report-padded")).toHaveCount(1);
        });

        test(`${name}: 1.234567890123457e19 and 6.02e23 are stored as they are, in REAL columns`, async ({ app }) => {
            await app.open(FLAGS);
            await app.importFiles(fixturePath(name));
            expect((await app.rows("SELECT name, type FROM pragma_table_info('Formats') WHERE name IN ('BigNumber', 'Scientific') ORDER BY cid")).map((row) => row.join(" "))).toEqual(["Scientific REAL", "BigNumber REAL"]);
            expect(await app.rows("SELECT BigNumber, typeof(BigNumber) FROM Formats WHERE _rowid_ = 1")).toEqual([[1.234567890123457e19, "real"]]);
            expect(await app.rows("SELECT Scientific, typeof(Scientific) FROM Formats WHERE Scientific > 1e20")).toEqual([[6.02e23, "real"]]);
        });
    }

    // the report's count of formula cells that came out empty, typed from the plan (the expected files do not hold it)
    for (const [name, total, only] of [
        ["excel/formulas_uncached.xlsx", 10, "Calc"],
        ["excel/xlwt_written.xls", 3, "Data"],
        ["excel/formulas.xlsx", 4, "Calc"],
    ]) {
        test(`${name}: ${total} formula cells came out empty, said once for the sheet ${only}`, async ({ app, page }) => {
            await app.open(FLAGS);
            await app.importFiles(fixturePath(name));
            const found = await page.locator("#results-pane .import-report section").evaluateAll((sections) =>
                sections.map((section) => [section.querySelector("h2").textContent, [...section.querySelectorAll(".import-report-formulas")].map((node) => node.textContent)])
            );
            const said = found.filter(([, lines]) => lines.length);
            expect(said.map(([table]) => table)).toEqual([only]);
            expect(said[0][1]).toEqual([words.importReportEmptyFormulasText(total)]);
            expect(said[0][1][0]).toMatch(new RegExp(`^${total} formula cells of this sheet came out empty`));
        });
    }

    // the sheets that give a second table when the box "Column names are on row" is set to the row
    const ALTERNATIVES = WORKBOOKS.flatMap((name) =>
        expectedFor(name).sheets.filter((sheet) => sheet.table_if_header_row_can_be_chosen).map((sheet) => [name, sheet])
    );
    test("three sheets of the owner's files give a second table, and so do their .xls twins", () => {
        expect(ALTERNATIVES.map(([name, sheet]) => `${name}: ${sheet.sheet} ${sheet.table_if_header_row_can_be_chosen.header_row}`)).toEqual([
            "excel/messy_course_workbook.xlsx: Sales 2024 4",
            "excel/messy_course_workbook.xlsx: Summary 3",
            "excel/messy_course_workbook.xls: Sales 2024 4",
            "excel/messy_course_workbook.xls: Summary 3",
            "excel/title_rows_and_layouts.xlsx: Title above header 5",
        ]);
    });

    for (const [name, sheet] of ALTERNATIVES) {
        test(`${name}: with "Column names are on row" set to ${sheet.table_if_header_row_can_be_chosen.header_row}, ${sheet.sheet} gives its other table, and every other sheet its first`, async ({ app, page }) => {
            const expected = expectedFor(name);
            const file = BASENAME(name);
            const alternative = sheet.table_if_header_row_can_be_chosen;
            await app.open(FLAGS);
            await app.chooseFiles(fixturePath(name));
            await dialogReady(app);
            await app.importPanel.getByRole("button", { name: words.IMPORT_TICK_ALL_SHEETS_TEXT, exact: true }).click();
            await selectSheet(app, file, sheet.sheet);
            const row = app.importSheetPanel.getByLabel("Column names are on row", { exact: true });
            await expect(row).toHaveValue("1");
            await row.fill(String(alternative.header_row));
            // the preview counts the rows as it shows them: the rows above the names are left out
            const tags = app.importSheetPanel.locator(".import-preview-table tbody tr");
            await expect(tags.filter({ has: page.locator(".import-row-tag", { hasText: /^column names$/ }) })).toHaveCount(1);
            await expect(tags.locator(".import-row-tag", { hasText: /^left out$/ })).toHaveCount(Math.min(3, alternative.header_row - 1));
            await expect(app.importSubmit).toBeEnabled();
            await app.importSubmit.click();
            await expect(app.importDialog).toBeHidden();
            await expect(app.pane).toHaveAttribute("data-state", "report");
            const wanted = expected.sheets.filter((one) => one.importable).map((one) => (one.sheet === sheet.sheet ? { ...alternative } : one.table));
            for (const table of wanted) {
                expect(compareTable(await readTable(app, table.name), table), `table ${table.name}`).toEqual([]);
            }
            // (the other table of the sheet is no longer there: it is the one or the other)
            expect((await app.rows("SELECT count(*) FROM sqlite_schema WHERE type = 'table'"))[0][0]).toBe(wanted.length);
        });
    }

    test("hidden rows and columns are imported like any other: the hidden column Margin % of the sales sheet, and the rows of excel/hidden.xlsx's visible sheet", async ({ app }) => {
        const messy = expectedFor("excel/messy_course_workbook.xlsx").sheets.find((sheet) => sheet.sheet === "Sales 2024").table_if_header_row_can_be_chosen;
        const margin = messy.columns.find((column) => column.original === "Margin %");
        expect(margin, "the expected file names the hidden column").toBeDefined();
        const visible = expectedFor("excel/hidden.xlsx").sheets.find((sheet) => sheet.sheet === "Visible data").table;
        await app.open(FLAGS);
        await app.importFiles(fixturePath("excel/hidden.xlsx"));
        expect(await app.rows("SELECT count(*) FROM Visible_data")).toEqual([[visible.rows]]);
        await app.open(FLAGS);
        await app.chooseFiles(fixturePath("excel/messy_course_workbook.xlsx"));
        await dialogReady(app);
        await selectSheet(app, "messy_course_workbook.xlsx", "Sales 2024");
        await app.importSheetPanel.getByLabel("Column names are on row", { exact: true }).fill("4");
        await app.importSubmit.click();
        await expect(app.importDialog).toBeHidden();
        await expect(app.pane).toHaveAttribute("data-state", "report");
        // (the column is in the table, with its values; the sheets of the workbook are the sheets ticked: its hidden sheets are not)
        expect((await app.rows("SELECT name FROM pragma_table_info('Sales_2024')")).flat()).toContain(margin.name);
        const values = (await app.rows(`SELECT "${margin.name}" FROM Sales_2024 ORDER BY _rowid_`)).flat();
        expect(values).toEqual(messy.data.map((row) => row[messy.columns.indexOf(margin)]));
        expect(values.filter((value) => value !== null).length).toBeGreaterThan(20);
    });

    test("a sheet is ticked at first when it is visible and can be ticked; a hidden one is listed, marked, and not ticked", async ({ app }) => {
        await app.open(FLAGS);
        await app.chooseFiles(fixturePath("excel/hidden.xlsx"));
        await dialogReady(app);
        const strip = app.importSheetStrip(words.importSheetsLabel("hidden.xlsx"));
        await expect(strip.getByRole("tab")).toHaveText([/^Visible data/, /^Hidden sheet\s*hidden/, /^Very hidden sheet\s*hidden/, /^Also visible/]);
        for (const [i, name] of [`Visible data (${words.IMPORT_SHEET_TICKED_TEXT})`, `Hidden sheet (${words.IMPORT_SHEET_HIDDEN_NOT_TICKED_TEXT})`, `Very hidden sheet (${words.IMPORT_SHEET_HIDDEN_NOT_TICKED_TEXT})`, `Also visible (${words.IMPORT_SHEET_TICKED_TEXT})`].entries()) {
            await expect(strip.getByRole("tab").nth(i)).toHaveAccessibleName(name);
        }
        // nothing imported yet, and Import takes the two visible sheets and no more
        await app.importSubmit.click();
        await expect(app.importDialog).toBeHidden();
        await expect(app.pane).toHaveAttribute("data-state", "report");
        expect((await app.rows("SELECT name FROM sqlite_schema WHERE type = 'table' ORDER BY name")).flat()).toEqual(["Also_visible", "Visible_data"]);
    });
});

// ---- the files that are not imported, and the files that are read by what they hold ------------------------------

test.describe("workbooks under other names, and files that are refused", () => {
    // the three impostors that can be read: each gives the table its content makes
    const READABLE = [
        // a web page of one table is no sheet to name: the file's name says where its table came from
        ["impostors/html_table.xls", "html_table.xls", null],
        ["impostors/spreadsheetml_2003.xls", "spreadsheetml_2003.xls, sheet Report", "Report"],
        ["impostors/renamed_xlsx.csv", "renamed_xlsx.csv, sheet Stock", "Stock"],
    ];
    for (const [name, source, sheet] of READABLE) {
        test(`${name} is read by what it holds, and gives the table its expected file holds`, async ({ app, page }) => {
            const expected = expectedFor(name);
            expect(expected.outcome).toBe("import_by_content_or_refuse");
            const tables = expected.tables_if_read_by_content;
            await app.open(FLAGS);
            await app.importFiles(fixturePath(name));
            await expectTables(app, tables);
            // the report names where the table came from, and the event says so too
            await expectReport(page, tables, () => source);
            const events = await eventsOfOpen(page);
            const table = tables[0];
            expect(events.map((event) => event.lines)).toEqual([
                [`file: ${BASENAME(name)}, ${BYTES(name)} bytes`, `table: ${table.name}, ${table.rows} rows, ${table.columns.length} columns${sheet ? `, ${sheet}` : ""}`],
            ]);
        });
    }

    // the four that must be refused, each with its own words, and nothing left behind
    const REFUSED = [
        ["impostors/zero_bytes.xlsx", "IMPORT_EMPTY_REASON", false],
        ["impostors/random_bytes.xls", "IMPORT_NOT_TEXT_REASON", false],
        ["impostors/truncated.xlsx", "IMPORT_WORKBOOK_CUT_REASON", false],
        ["impostors/password_protected.xlsx", "IMPORT_WORKBOOK_LOCKED_REASON", true],
    ];
    for (const [name, reasonName, asksTheLibrary] of REFUSED) {
        test(`${name} is refused with ${reasonName}: no table, no event, no stored key, no database opened`, async ({ app, page }) => {
            expect(expectedFor(name).outcome).toBe("refuse");
            expect(typeof words[reasonName], `${reasonName} is a text of config-workflow.js`).toBe("string");
            await app.open(`${NORTHLIGHT_URL}&preview=import,excel-import`);
            const before = await pageState(app, page);
            expect(before.tables.length).toBeGreaterThan(0);
            await app.trackConnections();
            const library = await holdVendor(page, "xlsx.full.min.js", { pass: 99 });
            await app.chooseFiles(fixturePath(name));
            await dialogReady(app);
            await expect(app.importTabs).toHaveCount(1);
            await expect(app.importTabs.first()).toHaveAccessibleName(`${BASENAME(name)} (${words.IMPORT_REFUSED_TAB_TEXT})`);
            await expect(app.importPanel.locator(".import-refusal")).toHaveText(words[reasonName]);
            await expect(app.importSubmit).toBeHidden();
            await expect(app.importCancel).toHaveText(words.IMPORT_CLOSE_TEXT);
            // (a cut file and a file with no bytes are never handed to the library: on some it never returns)
            expect(library.requests() > 0).toBe(asksTheLibrary);
            await app.importCancel.click();
            await expect(app.importDialog).toBeHidden();
            expect(await pageState(app, page)).toEqual(before);
            expect((await app.connections()).filter((connection) => connection.open)).toEqual([]);
            await expect(app.pane).not.toHaveAttribute("data-state", "report");
            // the library, asked for by a locked workbook only, is not in the page for the others
            expect(await page.evaluate(() => typeof window.XLSX)).toBe(asksTheLibrary ? "object" : "undefined");
        });
    }

    // the two text files that have a workbook's name, and a CSV whose first column is called PK (the first
    // letters of a zip): what a file is comes from its bytes, so each is text, and the library is never asked
    // for (nothing of a workbook is built for it)
    const TEXT_UNDER_A_WORKBOOK_NAME = [
        ["impostors/tab_text.xls", () => fixturePath("impostors/tab_text.xls")],
        ["impostors/renamed_csv.xlsx", () => fixturePath("impostors/renamed_csv.xlsx")],
    ];
    for (const [name, file] of TEXT_UNDER_A_WORKBOOK_NAME) {
        test(`${name} is imported as text with both flags on, and the library is never asked for`, async ({ app, page }) => {
            const expected = expectedFor(name);
            const library = await holdVendor(page, "xlsx.full.min.js", { pass: 99 });
            await app.open(FLAGS);
            await app.chooseFiles(file());
            await dialogReady(app);
            await expect(app.importDialog.locator(".import-sheet-panel")).toHaveCount(0);
            await expect(app.importDialog.getByRole("tab", { name: new RegExp(escaped(words.IMPORT_REFUSED_TAB_TEXT)) })).toHaveCount(0);
            await app.importSubmit.click();
            await expect(app.importDialog).toBeHidden();
            await expectTables(app, expected.tables_if_read_by_content);
            expect(library.requests()).toBe(0);
            expect(await page.evaluate(() => typeof window.XLSX)).toBe("undefined");
        });
    }

    for (const name of ["pk_list.xlsx", "pk_list.xls"]) {
        test(`a text file that starts with the letters PK is imported as text under the name ${name}, with both flags on`, async ({ app, page }) => {
            const library = await holdVendor(page, "xlsx.full.min.js", { pass: 99 });
            await app.open(FLAGS);
            await app.chooseFiles({ name, mimeType: "text/csv", buffer: Buffer.from("PK,name\n1,a\n2,b\n") });
            await dialogReady(app);
            await expect(app.importDialog.locator(".import-sheet-panel")).toHaveCount(0);
            await app.importSubmit.click();
            await expect(app.importDialog).toBeHidden();
            expect((await app.rows("PRAGMA table_info(pk_list)")).map((row) => [row[1], row[2]])).toEqual([["PK", "INTEGER"], ["name", "TEXT"]]);
            expect(await app.rows("SELECT PK, name FROM pk_list ORDER BY _rowid_")).toEqual([[1, "a"], [2, "b"]]);
            expect(library.requests()).toBe(0);
        });
    }

    test("a web page saved as .xls after blank lines is read by what it holds, as a table of its rows", async ({ app }) => {
        // (what a file is, is read from its first bytes, white space before the first tag left aside)
        const saved = `${"\r\n".repeat(60)}   <html><body><table><tr><td>a</td><td>b</td></tr><tr><td>1</td><td>2</td></tr></table></body></html>\n`;
        await app.open(FLAGS);
        await app.importFiles({ name: "page.xls", mimeType: "application/vnd.ms-excel", buffer: Buffer.from(saved, "utf8") });
        expect((await app.rows("PRAGMA table_info(page)")).map((row) => row[1])).toEqual(["a", "b"]);
        expect(await app.rows("SELECT a, b FROM page")).toEqual([[1, 2]]);
        await expect(app.pane.locator(".import-report-line")).toHaveText(words.importReportTableLine(1, 2, "page.xls"));
    });

    // white space before the first tag can be as long as a program makes it: the file's start is read on until the first
    // character that is not white space, and not only the first few thousand bytes
    for (const [what, before] of [
        ["5,000 spaces", " ".repeat(5000)],
        ["a byte-order mark and 70,000 blank lines", `\ufeff${"\r\n".repeat(70_000)}`],
    ]) {
        test(`a web page saved as .xls after ${what} is read by what it holds, as a table of its rows`, async ({ app }) => {
            const saved = `${before}<html><body><table><tr><td>a</td><td>b</td></tr><tr><td>1</td><td>2</td></tr></table></body></html>\n`;
            await app.open(FLAGS);
            await app.importFiles({ name: "page.xls", mimeType: "application/vnd.ms-excel", buffer: Buffer.from(saved, "utf8") });
            expect((await app.rows("PRAGMA table_info(page)")).map((row) => row[1])).toEqual(["a", "b"]);
            expect(await app.rows("SELECT a, b FROM page")).toEqual([[1, 2]]);
        });
    }

    // The same file with the import alone: what a file is, is decided from its bytes whatever the flags are, so it is a
    // workbook there too, and is refused as one. While only the first few thousand bytes were looked at it was taken
    // for text and imported as one column.
    test("with the import alone, a web page saved as .xls after 5,000 spaces is refused as a workbook is, and Import is not offered", async ({ app }) => {
        const saved = `${" ".repeat(5000)}<html><body><table><tr><td>a</td><td>b</td></tr><tr><td>1</td><td>2</td></tr></table></body></html>\n`;
        await app.open("./?preview=import");
        await app.chooseFiles({ name: "page.xls", mimeType: "application/vnd.ms-excel", buffer: Buffer.from(saved, "utf8") });
        await dialogReady(app);
        await expect(app.importDialog.getByRole("tab", { name: `page.xls (${words.IMPORT_REFUSED_TAB_TEXT})`, exact: true })).toBeVisible();
        await expect(app.importPanel.locator(".import-refusal")).toHaveText(words.IMPORT_WORKBOOK_REASON);
        await expect(app.importDialog.locator(".import-sheet-panel")).toHaveCount(0);
        await expect(app.importSubmit).toBeHidden();
        await expect(app.importCancel).toHaveText(words.IMPORT_CLOSE_TEXT);
    });

    test("a file called .xls that is nothing but white space is imported as the text it is, and is not read on for ever", async ({ app }) => {
        await app.open(FLAGS);
        await app.chooseFiles({ name: "blank.xls", mimeType: "application/vnd.ms-excel", buffer: Buffer.from(`${" ".repeat(10_000)}\n`, "utf8") });
        await dialogReady(app);
        await expect(app.importDialog.locator(".import-sheet-panel")).toHaveCount(0);
        await expect(app.importDialog.getByRole("tab", { name: new RegExp(escaped(words.IMPORT_REFUSED_TAB_TEXT)) })).toHaveCount(0);
    });

    // every refuse entry of the owner's index says why in the owner's words; the page says it in its own, and
    // the table below says which of its texts say what the owner's words say. A wording this table does not
    // know fails on purpose, so that a new entry has to be given its texts here.
    const OWNER_WORDING = [
        [/^There is nothing to import\./, ["IMPORT_EMPTY_REASON"]],
        [/^SQLite stops at 2,000 columns\./, ["IMPORT_TOO_WIDE_REASON"]],
        [
            /^The file cannot be read\. Say why in plain words/,
            [
                "IMPORT_EMPTY_REASON",
                "IMPORT_NOT_TEXT_REASON",
                "IMPORT_WORKBOOK_CUT_REASON",
                "IMPORT_WORKBOOK_LOCKED_REASON",
                "IMPORT_NOT_A_WORKBOOK_REASON",
                "IMPORT_WORKBOOK_DAMAGED_REASON",
                "IMPORT_WORKBOOK_UNREADABLE_REASON",
            ],
        ],
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
        test(`${name}: with both flags on, its tab gives one of the texts that say what the expected file says`, async ({ app }) => {
            const wanted = OWNER_WORDING.find(([wording]) => wording.test(expectedFor(name).reason));
            expect(wanted, `no wording of the table fits: ${expectedFor(name).reason}`).toBeDefined();
            const texts = wanted[1].map((constant) => {
                expect(typeof words[constant], `${constant} is a text of config-workflow.js`).toBe("string");
                return words[constant];
            });
            await app.open(FLAGS);
            await app.chooseFiles(fixturePath(name));
            await dialogReady(app);
            await expect(app.importDialog.getByRole("tab", { name: new RegExp(`\\(${escaped(words.IMPORT_REFUSED_TAB_TEXT)}\\)$`) })).toHaveCount(1);
            const said = (await app.importPanel.locator(".import-refusal").innerText()).trim();
            expect(texts, `the tab says: ${said}`).toContain(said);
        });
    }

    test("the four refusals have four different texts, none of them the library's", () => {
        const texts = ["IMPORT_EMPTY_REASON", "IMPORT_NOT_TEXT_REASON", "IMPORT_WORKBOOK_CUT_REASON", "IMPORT_WORKBOOK_LOCKED_REASON"].map((constant) => words[constant]);
        expect(new Set(texts).size).toBe(4);
    });
});

// the page's own state, as a refusal must leave it
async function pageState(app, page) {
    return {
        url: page.url(),
        database: await page.evaluate(() => window.app.database.name),
        tables: await app.rows("SELECT type, name FROM sqlite_schema ORDER BY name"),
        events: await page.evaluate(() => Object.keys(localStorage).filter((key) => key.startsWith("sqllab.events."))),
        stored: await page.evaluate(() => Object.keys(localStorage).sort()),
    };
}

// ---- a workbook made in the test ---------------------------------------------------------------------------

test.describe("a workbook made in the test", () => {
    for (const [bookType, extension] of [["xlsx", "xlsx"], ["biff8", "xls"]]) {
        test(`${extension}: numbers of 1e19 and 6.02e23 are stored as they are, in a REAL column, and a column of small whole numbers is INTEGER`, async ({ app }) => {
            await app.open(FLAGS);
            await app.importFiles(workbookFile(`big.${extension}`, [{ name: "numbers", rows: [["id", "big", "mixed"], [1, 1e19, 5], [2, 6.02e23, 1.5], [3, 1.5, -2], [4, 1e21, 7]] }], bookType));
            expect((await app.rows("SELECT name, type FROM pragma_table_info('numbers') ORDER BY cid"))).toEqual([["id", "INTEGER"], ["big", "REAL"], ["mixed", "REAL"]]);
            expect(await app.rows("SELECT big, typeof(big) FROM numbers ORDER BY id")).toEqual([[1e19, "real"], [6.02e23, "real"], [1.5, "real"], [1e21, "real"]]);
            expect(await app.rows("SELECT quote(big) FROM numbers WHERE id = 1")).toEqual([["1.0e+19"]]);
        });
    }

    test("a number that lands in a TEXT column is written out in full, with no exponent", async ({ app }) => {
        await app.open(FLAGS);
        await app.importFiles(workbookFile("words.xlsx", [{ name: "words", rows: [["mixed"], ["x"], [1e21], [6.02e23], [1e-7], [0.1 + 0.2]] }]));
        expect(await app.rows("SELECT mixed FROM words ORDER BY _rowid_")).toEqual([["x"], ["1000000000000000000000"], ["602000000000000000000000"], ["0.0000001"], ["0.30000000000000004"]]);
    });

    // a workbook of one sheet whose first date is the serial number 43000, written by the library with the
    // 1904 date system (a workbook from a Mac): 43000 days after 1904-01-01 is 2021-09-23, where the 1900
    // system would say 2017-09-22
    for (const [bookType, extension] of [["xlsx", "xlsx"], ["biff8", "xls"]]) {
        test(`${extension}: a workbook written with the 1904 date system gives 2021-09-23 for the serial number 43000, not the date the 1900 system gives`, async ({ app }) => {
            const XLSX = require("../vendor/xlsx.full.min.js");
            const book = XLSX.utils.book_new();
            const sheet = XLSX.utils.aoa_to_sheet([["day"], [43000]]);
            sheet.A2.z = "yyyy-mm-dd";
            XLSX.utils.book_append_sheet(book, sheet, "days");
            book.Workbook = { WBProps: { date1904: true }, Sheets: [{ name: "days", Hidden: 0 }] };
            const file = { name: `mac.${extension}`, mimeType: "application/octet-stream", buffer: Buffer.from(XLSX.write(book, { bookType, type: "buffer" })) };
            await app.open(FLAGS);
            await app.importFiles(file);
            expect(await app.rows("SELECT day FROM days")).toEqual([["2021-09-23"]]);
        });
    }

    // a binary workbook (.xlsb) and a macro workbook (.xlsm) are read as an .xlsx is, whatever the name says
    for (const bookType of ["xlsb", "xlsm"]) {
        test(`a ${bookType} under the name book.xlsx is read as an .xlsx is: its sheets are tabs, the hidden one is not ticked, and the ticked sheet is imported`, async ({ app }) => {
            await app.open(FLAGS);
            await app.chooseFiles(workbookFile("book.xlsx", [{ name: "Shown", rows: [["a", "b"], [1, "x"]] }, { name: "Secret", rows: [["c"], [3]], hidden: 1 }], bookType));
            await dialogReady(app);
            const strip = app.importSheetStrip(words.importSheetsLabel("book.xlsx"));
            await expect(strip.getByRole("tab")).toHaveCount(2);
            await expect(strip.getByRole("tab").nth(0)).toHaveAccessibleName(`Shown (${words.IMPORT_SHEET_TICKED_TEXT})`);
            await expect(strip.getByRole("tab").nth(1)).toHaveAccessibleName(`Secret (${words.IMPORT_SHEET_HIDDEN_NOT_TICKED_TEXT})`);
            await expect(app.importDialog.locator(".import-refusal")).toHaveCount(0);
            await app.importSubmit.click();
            await expect(app.importDialog).toBeHidden();
            expect(await app.rows("SELECT a, b FROM Shown")).toEqual([[1, "x"]]);
            expect((await app.rows("SELECT name FROM sqlite_schema WHERE type = 'table' ORDER BY name")).flat()).toEqual(["Shown"]);
        });
    }

    test("a chart sheet, a macro sheet and a dialog sheet are left out of the sheets and counted; the sheet that holds cells is listed", async ({ app, page }) => {
        await app.open(FLAGS);
        const found = await page.evaluate(async () => {
            const bundle = await import("./bundle/app.js");
            const real = await bundle.vendorLoader.loadVendor("xlsx.full.min.js", "XLSX");
            // (the library is made to hand back a workbook of four sheets, three of which are not worksheets)
            const sheet = { "!ref": "A1:A2", "!data": [[{ t: "s", v: "x", w: "x" }], [{ t: "n", v: 1, w: "1" }]] };
            const library = {
                SSF: real.SSF,
                read: () => ({ SheetNames: ["cells", "a chart", "a macro", "a dialog"], Sheets: { cells: sheet, "a chart": { "!type": "chart" }, "a macro": { "!type": "macro" }, "a dialog": { "!type": "dialog" } } }),
            };
            const file = new File([new Uint8Array(8)], "odd.xls");
            const read = await bundle.importWorkbook.readWorkbook(file, "ole2", { directory: null, loadLibrary: async () => library, rest: async () => {}, frame: async () => {}, current: () => true });
            return { names: read.sheets?.map((one) => one.name), charts: read.charts, refused: read.refused };
        });
        expect(found).toEqual({ names: ["cells"], charts: 3 });
    });
});

// ---- the zip check, in the browser's own decompressor ---------------------------------------------------------

// where the data of the first part that holds more than a few bytes starts, in a zip, and how long it is:
// read from the central directory (the part the check is about, found here by the format itself)
function firstPartOf(bytes, named = /^xl\/worksheets\/sheet\d+\.xml$/) {
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    let end = bytes.length - 22;
    while (view.getUint32(end, true) !== 0x06054b50) {
        end--;
    }
    let at = view.getUint32(end + 16, true);
    for (let i = 0; i < view.getUint16(end + 10, true); i++) {
        const packed = view.getUint32(at + 20, true);
        const nameLength = view.getUint16(at + 28, true);
        const extraLength = view.getUint16(at + 30, true);
        const commentLength = view.getUint16(at + 32, true);
        const local = view.getUint32(at + 42, true);
        const name = Buffer.from(bytes.subarray(at + 46, at + 46 + nameLength)).toString("utf8");
        if (named.test(name) && packed > 20) {
            const start = local + 30 + view.getUint16(local + 26, true) + view.getUint16(local + 28, true);
            return { name, start, packed };
        }
        at += 46 + nameLength + extraLength + commentLength;
    }
    throw new Error("no such part");
}

// The page asks the library to read in two ways, told apart by what it asks for. The read of a file that was
// chosen is asked with the plan's options (dense: true): reads() counts those. The other is of a workbook that
// holds nothing, made by the page itself with { type: "array" } alone: the library keeps the texts of the last
// .xlsx it read, and reading a workbook that holds nothing makes it let them go. hollow() counts those.
// The library's file is served with both counts added; every read goes on to the real library.
async function countReads(page) {
    await page.route("**/vendor/xlsx.full.min.js", async (route) => {
        const response = await route.fetch();
        const body = await response.text();
        await route.fulfill({
            response,
            body: `${body}\n;window.__xlsxReads = 0; window.__xlsxHollow = 0; XLSX.read = ((read) => function (input, options) { if (options && options.type === "array" && Object.keys(options).length === 1) { window.__xlsxHollow++; } else { window.__xlsxReads++; } return read.apply(this, arguments); })(XLSX.read);`,
        });
    });
    return {
        reads: () => page.evaluate(() => window.__xlsxReads ?? 0),
        hollow: () => page.evaluate(() => window.__xlsxHollow ?? 0),
    };
}

test.describe("the zip check in the page", () => {
    test("a workbook with one changed byte in the data of a sheet is refused as damaged, and the library never sees it", async ({ app, page }) => {
        const original = fs.readFileSync(fixturePath("shopping_db.xlsx"));
        const part = firstPartOf(new Uint8Array(original));
        const changed = Buffer.from(original);
        changed[part.start + Math.floor(part.packed / 2)] ^= 0x01;
        expect(changed.equals(original)).toBe(false);
        await app.open(FLAGS);
        const library = await countReads(page);
        await app.chooseFiles({ name: "shopping_db.xlsx", mimeType: "application/octet-stream", buffer: changed });
        await dialogReady(app);
        await expect(app.importPanel.locator(".import-refusal")).toHaveText(words.IMPORT_WORKBOOK_DAMAGED_REASON);
        await expect(app.importTabs.first()).toHaveAccessibleName(`shopping_db.xlsx (${words.IMPORT_REFUSED_TAB_TEXT})`);
        await expect(app.importSubmit).toBeHidden();
        // (the library was loaded, to read it, and is never asked to: on some changed files it never returns)
        expect(await page.evaluate(() => typeof window.XLSX)).toBe("object");
        expect(await library.reads()).toBe(0);
        expect(await library.hollow(), "nor is it given the workbook that holds nothing").toBe(0);
        expect((await app.rows("SELECT name FROM sqlite_schema WHERE type = 'table'")).flat()).not.toContain("orders");
        // the control: the same file as it was is read by the library, once
        await app.importCancel.click();
        await app.chooseFiles({ name: "shopping_db.xlsx", mimeType: "application/octet-stream", buffer: original });
        await dialogReady(app);
        await expect(app.importDialog.locator(".import-refusal")).toHaveCount(0);
        expect(await library.reads()).toBe(1);
        expect(await library.hollow(), "and then given the workbook that holds nothing, once").toBe(1);
    });

    test("the browser can unpack what the check reads, and a changed stored checksum is damaged too", async ({ app, page }) => {
        const original = fs.readFileSync(fixturePath("shopping_db.xlsx"));
        // the stored CRC-32 of the part, in the central directory, changed by one bit
        const view = new DataView(original.buffer, original.byteOffset, original.byteLength);
        let end = original.length - 22;
        while (view.getUint32(end, true) !== 0x06054b50) {
            end--;
        }
        const changed = Buffer.from(original);
        changed[view.getUint32(end + 16, true) + 16] ^= 0x01;
        await app.open(FLAGS);
        expect(await page.evaluate(async () => (await import("./bundle/app.js")).importZip.canUnpack())).toBe(true);
        await app.chooseFiles({ name: "crc.xlsx", mimeType: "application/octet-stream", buffer: changed });
        await dialogReady(app);
        await expect(app.importPanel.locator(".import-refusal")).toHaveText(words.IMPORT_WORKBOOK_DAMAGED_REASON);
    });

    test("every .xlsx of the fixtures passes the check in the page (its directory is read, every part unpacks to its size and checksum), and imports", async ({ app, page }) => {
        const names = WORKBOOKS.filter((name) => name.endsWith(".xlsx"));
        expect(names.length).toBeGreaterThanOrEqual(11);
        await app.open(FLAGS);
        const verdicts = await page.evaluate(async (files) => {
            const { importZip } = await import("./bundle/app.js");
            const out = {};
            for (const [name, bytes] of files) {
                const data = new Uint8Array(bytes);
                const directory = await importZip.zipDirectory(new File([data], name));
                out[name] = directory === null || directory.damaged ? directory : await importZip.checkZip(data, directory.entries, {});
            }
            return out;
        }, names.map((name) => [name, [...fs.readFileSync(fixturePath(name))]]));
        expect(verdicts).toEqual(Object.fromEntries(names.map((name) => [name, true])));
        // and the dialog takes each of them: no refusal for damage (the loop above imports them all)
        await app.chooseFiles(names.map(fixturePath));
        await dialogReady(app);
        await expect(app.importDialog.locator(".import-refusal")).toHaveCount(0);
        await expect(app.importTabs).toHaveCount(names.length);
    });
});
