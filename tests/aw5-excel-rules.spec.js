const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const { execFile } = require("node:child_process");
const { pathToFileURL } = require("node:url");
const v8 = require("node:v8");
const vm = require("node:vm");
const { Worker } = require("node:worker_threads");
const XLSX = require("../vendor/xlsx.full.min.js");
const fflate = require("../vendor/fflate.min.js");
const { test, expect, fixtureIndex, fixturePath, skipUnlessFirst, seeded } = require("./helpers");

// Assessment plan, Phase 5 (import Excel workbooks): the pure modules, with no page. They are
// js/lab/import-zip.js (a zip's own check), js/lab/import-cells.js (the plan's "Excel cells", as
// functions over the cell objects of the spreadsheet library), js/lab/import-workbook.js (the limits,
// and the reading of one workbook), the new tallyNumber of js/lab/import-rules.js, and the limits and
// reasons that js/lab/config-workflow.js now holds. Each is held to what its own header comment
// promises and to the plan's section 3 and section 9. The library is the vendored SheetJS, and it is
// handed to the modules as the page hands it, never imported by them.
//
// Everything runs in Node, once (not on every project: it checks modules and files, not the page).
// The owner's workbooks of tests/fixtures/ are read through the three modules together, by bytes
// (the kind from the first bytes, the limits, the zip check, the library, the sheets, the tables),
// and every expected file is the measure: the sheets in order with their states, what can be ticked,
// the names of the tables, each column's name, type, nulls, original and report example, every cell,
// and the second table of the three sheets whose expected file gives a header row. That reading is
// done by tests/aw5-excel-reading.mjs in a child process, once with the time zone of this machine and
// once for each of several others (a calendar that used the computer's would be a day out in some).
//
// A workbook that no fixture holds is made here, by the library's own writer (and, where the writer
// cannot make the case, with its zip edited by the vendored fflate): a formula with no stored value, a
// chart sheet, a sheet whose part of the file is cut, sheets called constructor and __proto__, the
// 1904 date system, a web page with two tables or none. Cell rules that need an exact cell are tried on
// worksheets built by hand, in the library's dense form, with the cells it gives.
//
// Every expected value is typed in or comes from an expected file; none is worked out by the code
// under test. A test that follows one rule of js/lab/import-cells.js was seen to fail when that rule
// was broken in the module.

const load = (file) => import(pathToFileURL(path.join(__dirname, "..", "js", "lab", file)).href);

let loaded = null;
const modules = () =>
    (loaded ??= Promise.all([
        load("import-rules.js"),
        load("import-text.js"),
        load("import-csv.js"),
        load("import-zip.js"),
        load("import-cells.js"),
        load("import-workbook.js"),
        load("config-workflow.js"),
    ]).then(([rules, text, csv, zip, cells, workbook, config]) => ({ rules, text, csv, zip, cells, workbook, config })));

const READING = path.join(__dirname, "aw5-excel-reading.mjs");
const MB = 1024 * 1024;

// ---- helpers ------------------------------------------------------------------------------------

const bytesOfFixture = (name) => new Uint8Array(fs.readFileSync(fixturePath(name)));
const expectedOf = (entry) => JSON.parse(fs.readFileSync(path.join(__dirname, "fixtures", entry.expected), "utf8"));

// a cell as the library gives it, from a plain value: a text, a number in General, a boolean; null
// and undefined are no cell (a hole); an object is a cell as it is
function cellFrom(item) {
    if (item === null || item === undefined) {
        return undefined;
    }
    if (typeof item === "string") {
        return { t: "s", v: item, w: item };
    }
    if (typeof item === "number") {
        return { t: "n", v: item, z: "General", w: String(item) };
    }
    if (typeof item === "boolean") {
        return { t: "b", v: item, w: item ? "TRUE" : "FALSE" };
    }
    return item;
}

// a worksheet in the library's dense form: ws["!data"][row][column], a row with no cell is a hole
// (undefined, not an empty list), and so is a cell that is not there
function worksheet(rows, extra = {}) {
    const data = [];
    rows.forEach((row, r) => {
        if (row === null || row === undefined) {
            return;
        }
        const out = [];
        row.forEach((item, c) => {
            const cell = cellFrom(item);
            if (cell !== undefined) {
                out[c] = cell;
            }
        });
        data[r] = out;
    });
    data.length = rows.length;
    return { "!data": data, "!ref": "A1", ...extra };
}

async function sheetOf(rows, { extra = {}, date1904 = false, hidden = 0, name = "S", label = name, page = false } = {}) {
    const { cells } = await modules();
    return cells.readSheet(worksheet(rows, extra), { name, label, hidden, page, date1904, ssf: XLSX.SSF });
}

// what the page's import makes of a ready sheet: the table, its rows as stored, and the same with a
// text of an INTEGER or REAL column turned into the number it converts to
async function tableFrom(sheet, options = {}) {
    const { cells } = await modules();
    const table = await cells.tableOf(sheet, options);
    const stored = [];
    for (let i = 0; i < table.rows; i++) {
        stored.push(cells.storedRow(table, i));
    }
    const converted = stored.map((row) => row.map((value, c) => (typeof value === "string" && table.columns[c].type !== "TEXT" ? Number(value) : value)));
    return { table, stored, converted, types: table.columns.map((c) => c.type), names: table.columns.map((c) => c.name) };
}

// a single column of values as a sheet with a header row "x" above them
const columnOf = (values) => [["x"], ...values.map((value) => [value])];

// a workbook made by the library's writer: sheets [{name, rows, cells: {A1: {t, v, z, f}}, merges: ["B4:D4"],
// hidden: 0 | 1 | 2}], and the bytes it writes
function workbookBytes(sheets, { bookType = "xlsx", date1904 = false, compression = false, bookSST = false } = {}) {
    const wb = XLSX.utils.book_new();
    for (const sheet of sheets) {
        const ws = XLSX.utils.aoa_to_sheet(sheet.rows ?? [[]]);
        for (const [address, cell] of Object.entries(sheet.cells ?? {})) {
            ws[address] = cell;
            const at = XLSX.utils.decode_cell(address);
            const ref = XLSX.utils.decode_range(ws["!ref"] ?? "A1:A1");
            ref.e.r = Math.max(ref.e.r, at.r);
            ref.e.c = Math.max(ref.e.c, at.c);
            ws["!ref"] = XLSX.utils.encode_range(ref);
        }
        if (sheet.merges) {
            ws["!merges"] = sheet.merges.map((range) => XLSX.utils.decode_range(range));
        }
        XLSX.utils.book_append_sheet(wb, ws, sheet.name);
    }
    wb.Workbook = { Sheets: sheets.map((sheet) => ({ Hidden: sheet.hidden ?? 0 })), WBProps: { date1904 } };
    // (bookSST: the texts are written once, in a part of their own, as Excel writes them: a cell then points at its text)
    return new Uint8Array(XLSX.write(wb, { bookType, type: "buffer", compression, bookSST }));
}

// A workbook of one sheet (a header and a cell that holds 5, with the number format given, if any) written by a copy
// of the library that nothing else has used. The writer puts every number format that the library holds into the file
// it writes, so a file written by the library of this process carries what the specs before have left in its table.
function cleanWorkbook(format = null) {
    const file = require.resolve("../vendor/xlsx.full.min.js");
    const kept = require.cache[file];
    delete require.cache[file];
    const writer = require("../vendor/xlsx.full.min.js");
    require.cache[file] = kept;
    const book = writer.utils.book_new();
    const sheet = writer.utils.aoa_to_sheet([["n"], [5]]);
    if (format !== null) {
        sheet.A2 = { t: "n", v: 5, z: format };
    }
    writer.utils.book_append_sheet(book, sheet, "S");
    return new Uint8Array(writer.write(book, { bookType: "xlsx", type: "buffer" }));
}

// the parts of a zip, edited: edit(files) changes the object {path: Uint8Array} in place
function editZip(bytes, edit) {
    const files = fflate.unzipSync(new Uint8Array(bytes));
    edit(files);
    return new Uint8Array(fflate.zipSync(files));
}
const partText = (files, name) => Buffer.from(files[name]).toString("utf8");
const partBytes = (text) => fflate.strToU8(text);

// a workbook that holds the formula with no stored value as Excel and other writers write it
// (<c><f>..</f></c>): the library's writer gives such a cell the type "e"
const withUncachedFormulas = (bytes, addresses) =>
    editZip(bytes, (files) => {
        let xml = partText(files, "xl/worksheets/sheet1.xml");
        for (const address of addresses) {
            xml = xml.replace(`<c r="${address}" t="e">`, `<c r="${address}">`);
        }
        files["xl/worksheets/sheet1.xml"] = partBytes(xml);
    });

// a chart sheet added to the workbook (a sheet object with !type "chart" when read)
const withChartSheet = (bytes, name = "A chart") =>
    editZip(bytes, (files) => {
        files["xl/workbook.xml"] = partBytes(partText(files, "xl/workbook.xml").replace("</sheets>", `<sheet name="${name}" sheetId="99" r:id="rId99"/></sheets>`));
        files["xl/_rels/workbook.xml.rels"] = partBytes(
            partText(files, "xl/_rels/workbook.xml.rels").replace("</Relationships>", '<Relationship Id="rId99" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/chartsheet" Target="chartsheets/sheet1.xml"/></Relationships>')
        );
        files["[Content_Types].xml"] = partBytes(
            partText(files, "[Content_Types].xml").replace("</Types>", '<Override PartName="/xl/chartsheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.chartsheet+xml"/></Types>')
        );
        files["xl/chartsheets/sheet1.xml"] = partBytes('<?xml version="1.0" encoding="UTF-8" standalone="yes"?><chartsheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetViews><sheetView workbookViewId="0"/></sheetViews></chartsheet>');
    });

// a workbook whose xl/workbook.xml names a sheet whose part is gone: the library lists the name and
// leaves the sheet out
const withMissingSheetPart = (bytes, part = "xl/worksheets/sheet1.xml") => editZip(bytes, (files) => delete files[part]);

// a sound zip whose sheet part ends after <sheetData> (the cut is inside the sheet, not the file): the
// library gives the sheet its range and no cell at all
const withSheetCutAfterData = (bytes, part = "xl/worksheets/sheet1.xml") =>
    editZip(bytes, (files) => {
        const xml = partText(files, part);
        files[part] = partBytes(xml.slice(0, xml.indexOf("<sheetData>") + "<sheetData>".length));
    });

// what the page does for a chosen file, up to the tables: kind, inspect, read. The library is the
// vendored one unless another is handed in; options is merged over the page's own wiring.
async function openWorkbook(bytes, fileName, { library = XLSX, wiring = {} } = {}) {
    const { text, workbook } = await modules();
    const kind = text.kindByStart(bytes.subarray(0, text.HEAD_BYTES), bytes.length, fileName);
    if (kind !== "zip" && kind !== "ole2" && kind !== "markup") {
        return { kind };
    }
    const file = new Blob([bytes]);
    const inspected = await workbook.inspectWorkbook(file, kind);
    if (inspected.refused || inspected.ask) {
        return { kind, ...inspected };
    }
    const read = await workbook.readWorkbook(file, kind, { directory: inspected.directory, loadLibrary: async () => library, ...wiring });
    return { kind, inspected, ...read };
}

// a library that is not the library: it records what it is asked and gives the workbook it is told to
function fakeLibrary(give) {
    const calls = [];
    return {
        calls,
        SSF: XLSX.SSF,
        read(input, options) {
            // (what the real one does with the options it is given: it writes into them)
            calls.push({ input, options: JSON.parse(JSON.stringify(options)), given: options });
            options.cellText = true;
            options.cellDates = false;
            return typeof give === "function" ? give(input, options, calls.length) : give;
        },
    };
}

const oneSheet = (rows = [["a"], ["b"]]) => ({ SheetNames: ["S"], Sheets: { S: worksheet(rows) } });

// ---- the new limits, texts and tallyNumber -----------------------------------------------------

test.describe("the limits and the texts of a workbook, and tallyNumber", () => {
    test.beforeEach(skipUnlessFirst);

    test("the limits of a workbook are typed here: a megabyte is 1024 * 1024 bytes", async () => {
        const { config } = await modules();
        expect(config.EXCEL_WARN_BYTES).toBe(20971520);
        expect(config.EXCEL_HEAVY_BYTES).toBe(52428800);
        expect(config.EXCEL_MAX_BYTES).toBe(104857600);
        expect(config.EXCEL_WARN_DATA_BYTES).toBe(104857600);
        expect(config.EXCEL_HEAVY_DATA_BYTES).toBe(314572800);
        expect(config.EXCEL_MAX_DATA_BYTES).toBe(524288000);
        expect(config.EXCEL_MAX_UNPACKED_BYTES).toBe(1073741824);
        expect(config.IMPORT_SHEET_CELLS).toBe(30000);
    });

    test("every new text is typed here once, so that a changed or swapped word fails", async () => {
        const { config } = await modules();
        expect(config.IMPORT_WORKBOOK_CUT_REASON).toBe(
            "This workbook is not whole: the end of the file is missing. Download or copy it again, and choose the new copy."
        );
        expect(config.IMPORT_WORKBOOK_DAMAGED_REASON).toBe(
            "This workbook is damaged: part of it is not what the file itself says it should be. Copy it again from where it came from, or open it in Excel and save it, and choose the new copy."
        );
        expect(config.IMPORT_NOT_A_WORKBOOK_REASON).toBe("This file is not an Excel workbook, whatever its name says, so it cannot be imported.");
        expect(config.IMPORT_WORKBOOK_LOCKED_REASON).toBe(
            "This workbook is locked with a password, so it cannot be read. In Excel, remove the password, save the workbook, and choose it again."
        );
        expect(config.IMPORT_WORKBOOK_UNREADABLE_REASON).toBe(
            "This workbook could not be read. It may be damaged, or not an Excel workbook at all. Open it in Excel, save it again, and choose the new copy."
        );
        expect(config.IMPORT_PAGE_UNREADABLE_REASON).toBe(
            "No table could be read from this file. It is a web page saved under an Excel name: it may be an error page or a sign-in page, not the data. Download the file again."
        );
        expect(config.IMPORT_WORKBOOK_NO_SHEETS_REASON).toBe("This workbook has no sheet to import. Chart sheets are not imported.");
        expect(config.IMPORT_WORKBOOK_NO_MEMORY_REASON).toBe(
            "The browser ran out of memory while reading this workbook, so it was not read. An Excel file is read whole into memory and needs many times its size there. In Excel, save the sheets you need as CSV files, and import those."
        );
        expect(config.IMPORT_WORKBOOK_SHEET_LOST_REASON).toBe(
            "One of this workbook's sheets could not be read, so the workbook was not read. The likely cause is its size: an Excel file is read whole into memory and needs many times its size there. The file may also be damaged. In Excel, save the sheets you need as CSV files, and import those."
        );
        expect(config.IMPORT_WORKBOOK_TOO_LARGE_REASON).toBe(
            "This workbook is over 100 MB. An Excel file is read whole into memory and needs many times its size there, which is more than the browser has. In Excel, save the sheets you need as CSV files, and import those."
        );
        expect(config.importWorkbookTooMuchReason(310)).toBe(
            "The sheets of this workbook unpack to 310 MB. They are read whole into memory and need many times that there, which is more than the browser has. In Excel, save the sheets you need as CSV files, and import those."
        );
        // (a figure of a thousand or more is grouped, as the counts of the report are)
        expect(config.importWorkbookTooMuchReason(1025)).toBe(
            "The sheets of this workbook unpack to 1,025 MB. They are read whole into memory and need many times that there, which is more than the browser has. In Excel, save the sheets you need as CSV files, and import those."
        );
        expect(config.importLargeWorkbookMessage({ megabytes: 1200, unpackedMegabytes: 1100 }).split(" The page")[0]).toBe("This workbook is 1,200 MB, and its sheets unpack to 1,100 MB.");
        expect(config.importLargeWorkbookMessage({ megabytes: 1200 }).split(" The page")[0]).toBe("This workbook is 1,200 MB.");
        expect(config.IMPORT_WORKBOOK_LIBRARY_FAILED_REASON).toBe(
            "The Excel reader could not be loaded, so this workbook was not read. Check the connection, then choose the files again."
        );
        expect(config.importPageTableLabel(1)).toBe("Table 1");
        expect(config.importPageTableLabel(12)).toBe("Table 12");
    });

    test("the texts of the dialog, the sheets and the question are typed here once", async () => {
        const { config } = await modules();
        // the three sentences that differ while the reading of workbooks is on (the old ones stay for the import alone)
        expect(config.IMPORT_DIALOG_TEXT_WITH_SHEETS).toBe("Each file, or each sheet of a workbook, becomes a table, read as it is: nothing in it is cleaned or changed.");
        expect(config.OPEN_FILE_WITH_EXCEL_DESCRIPTION).toBe("A SQLite database, a .sql script, or CSV and Excel files to bring in as tables");
        expect(config.IMPORT_MIXED_WITH_EXCEL_MESSAGE).toBe("Nothing was opened. Choose CSV and Excel files to bring in together, or one database or script on its own.");
        expect(config.IMPORT_DIALOG_TEXT).toBe("Each file becomes a table, read as it is: nothing in it is cleaned or changed.");
        expect(config.OPEN_FILE_WITH_IMPORT_DESCRIPTION).toBe("A SQLite database, a .sql script, or CSV files to bring in as tables");
        expect(config.IMPORT_MIXED_MESSAGE).toBe("Nothing was opened. Choose CSV files to bring in together, or one database or script on its own.");
        // the question for a large workbook
        const wait = "The page will not respond while it is read, which can take a minute. If the browser says the page is not responding, choose to wait.";
        const memory = "A workbook this large can need more memory than the browser has: if the page stops, reload it, and work that was not exported is lost.";
        expect(config.importLargeWorkbookMessage({ megabytes: 23, unpackedMegabytes: null, heavy: false })).toBe(`This workbook is 23 MB. ${wait}`);
        expect(config.importLargeWorkbookMessage({ megabytes: 23 })).toBe(`This workbook is 23 MB. ${wait}`);
        expect(config.importLargeWorkbookMessage({ megabytes: 8, unpackedMegabytes: 310, heavy: false })).toBe(`This workbook is 8 MB, and its sheets unpack to 310 MB. ${wait}`);
        expect(config.importLargeWorkbookMessage({ megabytes: 60, unpackedMegabytes: null, heavy: true })).toBe(`This workbook is 60 MB. ${wait} ${memory}`);
        expect(config.importLargeWorkbookMessage({ megabytes: 120, unpackedMegabytes: 320, heavy: true })).toBe(`This workbook is 120 MB, and its sheets unpack to 320 MB. ${wait} ${memory}`);
        // the sheets: the strip, the line, the notes and reasons, the size, the start
        expect(config.importSheetsLabel("shopping_db.xlsx")).toBe("Sheets of shopping_db.xlsx");
        expect(config.importSheetLineText("orders")).toBe("Sheet orders");
        expect(config.importSheetUnnamedLabel(3)).toBe("(no name, number 3)");
        expect(config.IMPORT_SHEET_HIDDEN_WORD).toBe("hidden");
        expect(config.IMPORT_SHEET_TICK_LABEL).toBe("Import this sheet as a table");
        expect(config.IMPORT_SHEET_HIDDEN_NOTE).toBe("This sheet is hidden in the workbook. It is imported only if you tick it.");
        expect(config.IMPORT_SHEET_EMPTY_REASON).toBe("This sheet has no values, so there is nothing to import. Cells that are only formatted do not count.");
        expect(config.IMPORT_SHEET_WIDE_REASON).toBe("This sheet has more than 2,000 columns, which is more than a table can have, so it cannot be imported.");
        expect(config.IMPORT_SHEET_DAMAGED_REASON).toBe(
            "This sheet has a cell where no Excel sheet has one, beyond its last row or its last column, so it cannot be imported. Open the workbook in Excel, save it again, and choose the new copy."
        );
        expect(config.importSheetSizeText({ rows: 51, columns: 4 })).toBe("Its values span 51 rows and 4 columns.");
        expect(config.importSheetSizeText({ rows: 1, columns: 1 })).toBe("Its values span 1 row and 1 column.");
        expect(config.importSheetSizeText({ rows: 1048576, columns: 2000 })).toBe("Its values span 1,048,576 rows and 2,000 columns.");
        expect(config.importSheetStartNote("C5")).toBe("This table starts at C5 of the sheet. Rows are counted from there.");
        // what a tab says to a screen reader
        expect(config.IMPORT_SHEET_TICKED_TEXT).toBe("ticked");
        expect(config.IMPORT_SHEET_NOT_TICKED_TEXT).toBe("not ticked");
        expect(config.IMPORT_SHEET_HIDDEN_NOT_TICKED_TEXT).toBe("hidden, not ticked");
        expect(config.IMPORT_SHEET_HIDDEN_TICKED_TEXT).toBe("hidden, ticked");
        expect(config.IMPORT_SHEET_NO_VALUES_TEXT).toBe("no values");
        expect(config.IMPORT_TAB_NOTHING_TICKED_TEXT).toBe("nothing ticked");
        expect(config.IMPORT_REFUSED_TAB_TEXT).toBe("cannot be imported");
        // the line above the sheets, and its two buttons
        expect(config.importSheetsCountText({ ticked: 3, tickable: 4, unable: 0, charts: 0 })).toBe("3 of 4 sheets will be imported.");
        expect(config.importSheetsCountText({ ticked: 3, tickable: 4, unable: 1, charts: 0 })).toBe("3 of 4 sheets will be imported. 1 more cannot be imported.");
        expect(config.importSheetsCountText({ ticked: 3, tickable: 4, unable: 2, charts: 1 })).toBe("3 of 4 sheets will be imported. 2 more cannot be imported. Chart sheets are not listed.");
        expect(config.importSheetsCountText({ ticked: 1, tickable: 1, unable: 0, charts: 2 })).toBe("1 of 1 sheet will be imported. Chart sheets are not listed.");
        expect(config.importSheetsCountText({ ticked: 0, tickable: 2 })).toBe("0 of 2 sheets will be imported.");
        expect(config.importSheetsCountText({ ticked: 0, tickable: 0, unable: 3, charts: 0 })).toBe("No sheet of this workbook can be imported.");
        expect(config.IMPORT_TICK_ALL_SHEETS_TEXT).toBe("Tick every sheet");
        expect(config.IMPORT_UNTICK_ALL_SHEETS_TEXT).toBe("Untick every sheet");
        // the names of a sheet's table
        expect(config.IMPORT_HAS_NAMES_SHEET_LABEL).toBe("The sheet has a row of column names");
        expect(config.importNamesRowSheetMessage(5)).toBe("The sheet has only 5 rows.");
        expect(config.importNamesRowSheetMessage(1)).toBe("The sheet has only 1 row.");
        expect(config.IMPORT_NAME_TWICE_SHEET_MESSAGE).toBe("Another file or sheet here has this table name. Change one of them.");
        expect(config.IMPORT_NAME_TWICE_MESSAGE).toBe("Another file here has this table name. Change one of them.");
        // the line beside Import
        expect(config.IMPORT_HOLD_NO_SHEET_MESSAGE).toBe("No sheet is ticked. Tick at least one sheet to import.");
        expect(config.importHoldSheetProblemMessage("orders", "shopping_db.xlsx")).toBe("The sheet orders of shopping_db.xlsx cannot be imported as it is set. Its tab says why.");
        expect(config.importHoldProblemMessage("people.csv")).toBe("people.csv cannot be imported as it is set. Its tab says why.");
        // the progress of a job that has a sheet in it (a job of text files only keeps its own titles)
        expect(config.importProgressTableTitle(2, 5, "orders", "shopping_db.xlsx")).toBe("Importing table 2 of 5: orders (shopping_db.xlsx)");
        expect(config.importProgressTableTitle(1, 1, "orders", "shopping_db.xlsx")).toBe("Importing orders (shopping_db.xlsx)");
        expect(config.importProgressTextTitle(3, 5, "people.csv")).toBe("Importing table 3 of 5: people.csv");
        expect(config.importProgressTextTitle(1, 1, "people.csv")).toBe("Importing people.csv");
        expect(config.importProgressTitle(2, 3, "people.csv")).toBe("Importing file 2 of 3: people.csv");
        expect(config.importProgressTitle(1, 1, "people.csv")).toBe("Importing people.csv");
    });

    test("the sources of a table of a sheet and of a web page, the event's line that ends with the sheet, and the report's two facts are typed here once", async () => {
        const { config } = await modules();
        expect(config.importSheetSource("shopping_db.xlsx", "orders")).toBe("shopping_db.xlsx, sheet orders");
        expect(config.importPageSource("prices.xls", "Table 2")).toBe("prices.xls, Table 2");
        expect(config.importEventSheetTableLine("orders", 50, 4, "orders")).toBe("table: orders, 50 rows, 4 columns, orders");
        expect(config.importEventTableLine("people", 2, 2)).toBe("table: people, 2 rows, 2 columns");
        expect(config.importEventFileLine("shopping_db.xlsx", 8192)).toBe("file: shopping_db.xlsx, 8192 bytes");
        expect(config.importEventFileLine("people.csv", 18)).toBe("file: people.csv, 18 bytes");
        expect(config.importReportEmptyFormulasText(1)).toBe(
            "1 formula cell of this sheet came out empty: the workbook stores no result for it, or it gives empty text. In the table it is a blank."
        );
        expect(config.importReportEmptyFormulasText(3)).toBe(
            "3 formula cells of this sheet came out empty: the workbook stores no result for them, or they give empty text. In the table they are blanks."
        );
        expect(config.importReportEmptyFormulasText(1234)).toBe(
            "1,234 formula cells of this sheet came out empty: the workbook stores no result for them, or they give empty text. In the table they are blanks."
        );
        expect(config.importReportPaddedNote("00123", "123")).toBe("Excel showed 00123 for the number 123: the zeros are not in the table.");
        expect(config.importReportPaddedNote(null, "123")).toBe("This column's format pads numbers with zeros, which are not in the table.");
        expect(config.importReportTableLine(50, 4, "shopping_db.xlsx, sheet orders")).toBe("50 rows, 4 columns, from shopping_db.xlsx, sheet orders");
    });

    test("the five refusals of a workbook and the other reasons are all different texts", async () => {
        const { config } = await modules();
        const reasons = [
            config.IMPORT_WORKBOOK_CUT_REASON,
            config.IMPORT_WORKBOOK_DAMAGED_REASON,
            config.IMPORT_NOT_A_WORKBOOK_REASON,
            config.IMPORT_WORKBOOK_LOCKED_REASON,
            config.IMPORT_WORKBOOK_UNREADABLE_REASON,
            config.IMPORT_PAGE_UNREADABLE_REASON,
            config.IMPORT_WORKBOOK_NO_SHEETS_REASON,
            config.IMPORT_WORKBOOK_NO_MEMORY_REASON,
            config.IMPORT_WORKBOOK_SHEET_LOST_REASON,
            config.IMPORT_WORKBOOK_TOO_LARGE_REASON,
            config.importWorkbookTooMuchReason(1),
            config.IMPORT_WORKBOOK_LIBRARY_FAILED_REASON,
            config.IMPORT_WORKBOOK_REASON,
            config.IMPORT_UNREADABLE_REASON,
        ];
        expect(new Set(reasons).size).toBe(reasons.length);
    });

    test("tallyNumber counts a number as whole under 10^15 in size and as a decimal otherwise, in the counters of the text rule", async () => {
        const { rules } = await modules();
        const tallyOf = (values) => {
            const tally = rules.newTally();
            for (const value of values) {
                if (typeof value === "number") {
                    rules.tallyNumber(tally, value);
                } else {
                    rules.tallyValue(tally, value);
                }
            }
            return tally;
        };
        const kinds = (...values) => {
            const tally = tallyOf(values);
            return [tally.values, tally.whole, tally.decimal];
        };
        expect(kinds(0)).toEqual([1, 1, 0]);
        expect(kinds(4200)).toEqual([1, 1, 0]);
        expect(kinds(-4200)).toEqual([1, 1, 0]);
        expect(kinds(999999999999999)).toEqual([1, 1, 0]);
        expect(kinds(-999999999999999)).toEqual([1, 1, 0]);
        // 10^15 itself is not under 10^15
        expect(kinds(1e15)).toEqual([1, 0, 1]);
        expect(kinds(-1e15)).toEqual([1, 0, 1]);
        expect(kinds(1e20)).toEqual([1, 0, 1]);
        expect(kinds(6.02e23)).toEqual([1, 0, 1]);
        expect(kinds(2.5)).toEqual([1, 0, 1]);
        expect(kinds(-0.5)).toEqual([1, 0, 1]);
        expect(kinds(1e-7)).toEqual([1, 0, 1]);
        expect(kinds(0.1 + 0.2)).toEqual([1, 0, 1]);
        expect(kinds(1, 2.5, 1e20, 3)).toEqual([4, 2, 2]);
    });

    test("a column is typed from numbers and text together by the same tally: [1e20, 5] is REAL, [1, '007'] is TEXT with its blocking value", async () => {
        const { rules } = await modules();
        const typed = (values) => {
            const tally = rules.newTally();
            for (const value of values) {
                if (typeof value === "number") {
                    rules.tallyNumber(tally, value);
                } else {
                    rules.tallyValue(tally, value);
                }
            }
            return [rules.columnType(tally), rules.blockingValue(tally)];
        };
        expect(typed([1e20, 5])).toEqual(["REAL", null]);
        expect(typed([1, 2, 3])).toEqual(["INTEGER", null]);
        expect(typed([1, 2.5])).toEqual(["REAL", null]);
        expect(typed([1, "2", 3.5, "4.50"])).toEqual(["REAL", null]);
        expect(typed([1, "007"])).toEqual(["TEXT", "007"]);
        expect(typed([1, 2, "n/a"])).toEqual(["TEXT", "n/a"]);
        expect(typed([1, "a", "b"])).toEqual(["TEXT", null]);
        expect(typed([null, null])).toEqual(["TEXT", null]);
        expect(typed([1e15, 1234567890123456])).toEqual(["REAL", null]);
    });
});

// ---- the events of an import --------------------------------------------------------------------

test.describe("the events of an import: one for each file, as the job has them", () => {
    test.beforeEach(skipUnlessFirst);

    const column = (name) => ({ name, original: name, type: "TEXT", blanks: 0, blocking: null });
    const table = (origin, name, rows, columns, sheet = null) => ({ origin, file: origin.name, bytes: origin.size, name, rows, columns: columns.map(column), sheet });
    const file = (name, size) => ({ name, size });

    test("a text file alone gives the two lines it always gave, byte for byte", async () => {
        const events = await import(pathToFileURL(path.join(__dirname, "..", "js", "lab", "import-events.js")).href);
        const people = file("people.csv", 18);
        expect(events.importEvents([table(people, "people", 2, ["id", "name"])])).toEqual([{ lines: ["file: people.csv, 18 bytes", "table: people, 2 rows, 2 columns"] }]);
        // (rows and columns of one: the words are the old ones, not singular ones)
        expect(events.importEvents([table(people, "p", 1, ["id"])])).toEqual([{ lines: ["file: people.csv, 18 bytes", "table: p, 1 rows, 1 columns"] }]);
        expect(events.importEvents([])).toEqual([]);
    });

    test("a workbook of three tables is one event of four lines, each table's ending with its sheet", async () => {
        const events = await import(pathToFileURL(path.join(__dirname, "..", "js", "lab", "import-events.js")).href);
        const book = file("shopping_db.xlsx", 8192);
        const got = events.importEvents([table(book, "orders", 50, ["a", "b", "c", "d"], "orders"), table(book, "customers", 12, ["a", "b"], "customers"), table(book, "Sales_2024", 3, ["a"], "Sales 2024")]);
        expect(got).toEqual([
            {
                lines: [
                    "file: shopping_db.xlsx, 8192 bytes",
                    "table: orders, 50 rows, 4 columns, orders",
                    "table: customers, 12 rows, 2 columns, customers",
                    "table: Sales_2024, 3 rows, 1 columns, Sales 2024",
                ],
            },
        ]);
    });

    test("two workbooks with a CSV file between them are three events in the job's order; the same workbook after a CSV file is a new event", async () => {
        const events = await import(pathToFileURL(path.join(__dirname, "..", "js", "lab", "import-events.js")).href);
        const one = file("a.xlsx", 100);
        const csv = file("b.csv", 7);
        const two = file("c.xlsx", 300);
        const got = events.importEvents([table(one, "s1", 1, ["x"], "S1"), table(one, "s2", 2, ["x"], "S2"), table(csv, "b", 3, ["x"]), table(two, "t1", 4, ["x"], "T1")]);
        expect(got.map((event) => event.lines)).toEqual([
            ["file: a.xlsx, 100 bytes", "table: s1, 1 rows, 1 columns, S1", "table: s2, 2 rows, 1 columns, S2"],
            ["file: b.csv, 7 bytes", "table: b, 3 rows, 1 columns"],
            ["file: c.xlsx, 300 bytes", "table: t1, 4 rows, 1 columns, T1"],
        ]);
        // consecutive entries only: the same file again after another one is its own event
        const again = events.importEvents([table(one, "s1", 1, ["x"], "S1"), table(csv, "b", 3, ["x"]), table(one, "s2", 2, ["x"], "S2")]);
        expect(again).toHaveLength(3);
    });

    test("two different files of the same name are two events, and a web page of one table has no sheet to name", async () => {
        const events = await import(pathToFileURL(path.join(__dirname, "..", "js", "lab", "import-events.js")).href);
        const first = file("data.csv", 10);
        const second = file("data.csv", 10);
        const got = events.importEvents([table(first, "data", 1, ["x"]), table(second, "data_2", 1, ["x"])]);
        expect(got.map((event) => event.lines)).toEqual([
            ["file: data.csv, 10 bytes", "table: data, 1 rows, 1 columns"],
            ["file: data.csv, 10 bytes", "table: data_2, 1 rows, 1 columns"],
        ]);
        const page = file("prices.xls", 500);
        expect(events.importEvents([table(page, "prices", 5, ["a", "b"], null)])[0].lines).toEqual(["file: prices.xls, 500 bytes", "table: prices, 5 rows, 2 columns"]);
        expect(events.importEvents([table(page, "prices", 5, ["a", "b"], "Table 2")])[0].lines).toEqual(["file: prices.xls, 500 bytes", "table: prices, 5 rows, 2 columns, Table 2"]);
    });
});

// ---- the vendored library -----------------------------------------------------------------------

test.describe("the vendored spreadsheet library", () => {
    test.beforeEach(skipUnlessFirst);

    // The publisher's own file, unchanged (plan section 2, "New libraries are vendored"): the file
    // xlsx.full.min.js of SheetJS Community Edition 0.20.3, from the publisher's own address
    // (cdn.sheetjs.com). A new version is vendored by replacing the file, its licence and these
    // values together.
    test("vendor/xlsx.full.min.js is the publisher's file, unchanged: its size, its SHA-256, its first line and its version", () => {
        const bytes = fs.readFileSync(path.join(__dirname, "..", "vendor", "xlsx.full.min.js"));
        expect(bytes.length).toBe(951904);
        expect(crypto.createHash("sha256").update(bytes).digest("hex")).toBe("cc015130aa8521e7f088f88898eba949ccdcbfb38df0bd129b44b7273c3a6f41");
        expect(bytes.toString("utf8").split("\n")[0]).toBe("/*! xlsx.js (C) 2013-present SheetJS -- http://sheetjs.com */");
        expect(XLSX.version).toBe("0.20.3");
    });

    test("vendor/xlsx.LICENSE.txt is the Apache License 2.0, unchanged: its size and its SHA-256", () => {
        const bytes = fs.readFileSync(path.join(__dirname, "..", "vendor", "xlsx.LICENSE.txt"));
        expect(bytes.length).toBe(11355);
        expect(crypto.createHash("sha256").update(bytes).digest("hex")).toBe("4d2a38ac35cda06a555c84074a819d413339cd3691b822cae50f8f322fe01f64");
        const licence = bytes.toString("utf8");
        expect(licence).toContain("Apache License");
        expect(licence).toContain("Version 2.0, January 2004");
    });

    test("the library leaves z undefined on the first cell of a built-in format outside its table of 29, and throws on a date test of it (the trap that rule 1 of the cell rules answers)", () => {
        // (the library keeps one table of formats, which it makes anew at each read and which a workbook with a format of its
        // own adds to; the specs that ran before in this process have written and read such workbooks: a read of a workbook
        // with no format of its own starts the table over)
        XLSX.read(cleanWorkbook(), { type: "array" });
        expect(Object.keys(XLSX.SSF.get_table())).toHaveLength(29);
        expect(() => XLSX.SSF.is_date(undefined)).toThrow();
        // and calls a scientific format written with a lower case e a date
        expect(XLSX.SSF.is_date("0.00e+00")).toBe(true);
    });
});

// ---- number formats -----------------------------------------------------------------------------

test.describe("number formats: what is a date, a duration, a format that pads with zeros", () => {
    test.beforeEach(skipUnlessFirst);

    // [format, a date or time format, a duration, the zeros it forces before the point (0: it does not pad)].
    // The first section only, without quoted text, escaped characters or bracketed parts but [h], [m], [s].
    const FORMATS = [
        ["yyyy", true, false, 0],
        ["yyyy-mm-dd", true, false, 0],
        ["m/d/yy", true, false, 0],
        ["mmm", true, false, 0],
        ["mmm-yy", true, false, 0],
        ["[$-409]d-mmm-yy;@", true, false, 0],
        ["[$-F800]dddd, mmmm dd, yyyy", true, false, 0],
        ["dd/mm/yyyy hh:mm:ss", true, false, 0],
        ["h AM/PM", true, false, 0],
        ["h:mm:ss", true, false, 0],
        ["mm:ss", true, false, 0],
        ["[h]:mm:ss", true, true, 0],
        ["[h]", true, true, 0],
        ["[hh]:mm", true, true, 0],
        ["[hhh]:mm", true, true, 0],
        ["[mm]:ss", true, true, 0],
        ["[SS]", true, true, 0],
        ["[Red][h]:mm", true, true, 0],
        ["[h]:mm;d-mmm", true, true, 0],
        // letters in either case
        ["DD/MM/YYYY", true, false, 0],
        // a scientific format is no date, in either case of the e (the library calls the second a date)
        ["0.00E+00", false, false, 0],
        ["0.00e+00", false, false, 0],
        ["##0.0E+0", false, false, 0],
        ["# ?/?", false, false, 0],
        ["# ??/??", false, false, 0],
        ["General", false, false, 0],
        ["@", false, false, 0],
        // what is quoted, escaped or bracketed is not looked at
        ["\\d0", false, false, 0],
        ['"day"0', false, false, 0],
        ['0 "mm"', false, false, 0],
        ['"[h]"0', false, false, 0],
        ["[Red]0", false, false, 0],
        ["[>100]0;0", false, false, 0],
        ["[$-409]0", false, false, 0],
        ["_(* #,##0_)", false, false, 0],
        // only the first section is looked at
        ["0;dd/mm/yyyy", false, false, 0],
        ["0;00", false, false, 0],
        ["#,##0.00;[Red]-#,##0.00", false, false, 0],
        // formats that pad with zeros: two or more before the point
        ["00000", false, false, 5],
        ["000-000", false, false, 6],
        ["0000.00", false, false, 4],
        ["00", false, false, 2],
        ["#00", false, false, 2],
        ["00%", false, false, 2],
        ['"ID"0000', false, false, 4],
        ["[$-409]00000", false, false, 5],
        ["00000;-00000", false, false, 5],
        ["£00000", false, false, 5],
        // and those that do not
        ["0", false, false, 0],
        ["0.00", false, false, 0],
        ["#,##0", false, false, 0],
        ["#,##0.00", false, false, 0],
        ["0.0%", false, false, 0],
        ["\\00", false, false, 0],
        ['"0"0', false, false, 0],
        ['"00"0', false, false, 0],
        ["0 0/0", false, false, 0],
        ["00 0/0", false, false, 0],
        ["00E+00", false, false, 0],
        ["00e+00", false, false, 0],
        ["_-£* #,##0.00_-;[Red]-£* #,##0.00_-", false, false, 0],
        ["0.000", false, false, 0],
    ];

    test("every format of the table is told as a date or time format, a duration, and a pad, by the app's own tests", async () => {
        const { cells } = await modules();
        for (const [format, date, duration, zeros] of FORMATS) {
            expect(cells.isDateFormat(format), `${format}: a date or time format`).toBe(date);
            expect(cells.isDurationFormat(format), `${format}: a duration`).toBe(duration);
            expect(cells.paddingZeros(format), `${format}: zeros before the point`).toBe(zeros);
        }
    });

    test("formatLetters keeps the first section without quoted, escaped and bracketed parts, and the elapsed-time brackets whole", async () => {
        const { cells } = await modules();
        const letters = [
            ["yyyy-mm-dd", "yyyy-mm-dd"],
            ["[$-409]d-mmm-yy;@", "d-mmm-yy"],
            ["[Red]0.00", "0.00"],
            ['0 "days"', "0 "],
            ["\\d0", "0"],
            ["_(0_)", "0"],
            ["* 0", "0"],
            ["[h]:mm", "[h]:mm"],
            ["[HH]:MM:SS", "[HH]:MM:SS"],
            ["[hms]0", "0"],
            ["[>100]0;0", "0"],
            // an unclosed quote or bracket takes the rest of the format
            ['0"abc', "0"],
            ["0[Red", "0"],
            ["", ""],
        ];
        for (const [format, want] of letters) {
            expect(cells.formatLetters(format), format).toBe(want);
        }
    });

    test("the app's test of a date is not the library's: the library says a lower case e (and E+00 alone) makes a date", async () => {
        const { cells } = await modules();
        for (const format of ["0.00e+00", "E+00"]) {
            expect(XLSX.SSF.is_date(format), `the library, ${format}`).toBe(true);
            expect(cells.isDateFormat(format), `the app, ${format}`).toBe(false);
        }
        // where the two agree
        for (const [format, date] of [["0.00E+00", false], ["yyyy-mm-dd", true], ["[h]:mm", true], ["General", false], ["@", false]]) {
            expect(XLSX.SSF.is_date(format), `the library, ${format}`).toBe(date);
            expect(cells.isDateFormat(format), `the app, ${format}`).toBe(date);
        }
    });
});

// ---- a number written out in full ---------------------------------------------------------------

test.describe("a number written out in full", () => {
    test.beforeEach(skipUnlessFirst);

    test("numberInFull gives the shortest digits that give the number back, with the exponent written out", async () => {
        const { cells } = await modules();
        const wants = [
            [1234.5, "1234.5"],
            [329, "329"],
            [25.0, "25"],
            [-3, "-3"],
            [0, "0"],
            [-0, "0"],
            [0.5, "0.5"],
            [124.94999999999999, "124.94999999999999"],
            [864.9399999999999, "864.9399999999999"],
            [0.3333333333333333, "0.3333333333333333"],
            [14.28571428571429, "14.28571428571429"],
            [0.1 + 0.2, "0.30000000000000004"],
            [999999999999999, "999999999999999"],
            [1e15, "1000000000000000"],
            [2 ** 53, "9007199254740992"],
            [2 ** 53 + 2, "9007199254740994"],
            [1.234567890123457e19, "12345678901234570000"],
            [12345678901234567890, "12345678901234567000"],
            [1e21, "1000000000000000000000"],
            [-1e21, "-1000000000000000000000"],
            [6.02e23, "602000000000000000000000"],
            [1e-7, "0.0000001"],
            [-1e-7, "-0.0000001"],
            [1.5e-7, "0.00000015"],
            [3.5e-9, "0.0000000035"],
            [1.25e-10, "0.000000000125"],
            [123456.789e-10, "0.0000123456789"],
            [1.5e300, `15${"0".repeat(299)}`],
            [5e-324, `0.${"0".repeat(323)}5`],
        ];
        for (const [number, want] of wants) {
            expect(cells.numberInFull(number), String(number)).toBe(want);
        }
    });

    test("it has no exponent, no trailing zero, no bare point, and gives back the number it was given", async () => {
        const { cells } = await modules();
        const next = seeded(20261118);
        for (let i = 0; i < 2000; i++) {
            // numbers of every size, from the bits of a random double
            const exponent = Math.floor(next() * 80) - 40;
            const number = (next() - 0.5) * 10 ** exponent;
            const text = cells.numberInFull(number);
            expect(text, String(number)).toMatch(/^-?(?:0|[1-9][0-9]*)(?:\.[0-9]*[1-9])?$/);
            expect(Number(text)).toBe(number === 0 ? 0 : number);
        }
    });
});

// ---- dates, times and durations -----------------------------------------------------------------

test.describe("a date, a time and a duration are told by value, to the nearest second, on the app's own calendar", () => {
    test.beforeEach(skipUnlessFirst);

    // [stored number, text of a date or time format in the 1900 system]
    const DATES_1900 = [
        // below one day it is a time, whatever the format shows: 0 is midnight
        [0, "00:00:00"],
        [0.25, "06:00:00"],
        [0.5, "12:00:00"],
        [0.75, "18:00:00"],
        [0.0003, "00:00:26"],
        // from serial 1 on it is a date: 1 to 59 are 1 January to 28 February 1900, 60 the day that never was
        [1, "1900-01-01"],
        [31, "1900-01-31"],
        [32, "1900-02-01"],
        [59, "1900-02-28"],
        [60, "1900-02-29"],
        [61, "1900-03-01"],
        [365, "1900-12-30"],
        [366, "1900-12-31"],
        [367, "1901-01-01"],
        [36525, "1999-12-31"],
        [36526, "2000-01-01"],
        [36585, "2000-02-29"],
        [36586, "2000-03-01"],
        [40907, "2011-12-30"],
        [45143, "2023-08-05"],
        [45291, "2023-12-31"],
        [45292, "2024-01-01"],
        [73050, "2099-12-31"],
        // a time on a date
        [45143.5, "2023-08-05 12:00:00"],
        [45143.604166666664, "2023-08-05 14:30:00"],
        [60.5, "1900-02-29 12:00:00"],
        [1.5, "1900-01-01 12:00:00"],
        // the last day, and the last half day (the library's own date code gives null for it)
        [2958465, "9999-12-31"],
        [2958465.5, "9999-12-31 12:00:00"],
    ];

    const DATES_1904 = [
        [0, "00:00:00"],
        [0.5, "12:00:00"],
        [1, "1904-01-02"],
        [59, "1904-02-29"],
        [60, "1904-03-01"],
        [1462, "1908-01-02"],
        [43681, "2023-08-05"],
        [43681.5, "2023-08-05 12:00:00"],
        [2957003, "9999-12-31"],
        [2957003.5, "9999-12-31 12:00:00"],
    ];

    test("the 1900 system, at its edges: serials 0, 1, 59, 60, 61, leap years, the last day and the last half day", async () => {
        const { cells } = await modules();
        for (const [serial, want] of DATES_1900) {
            expect(cells.serialText(serial, { date1904: false }), String(serial)).toBe(want);
        }
    });

    test("the 1904 system: day 0 is 1904-01-01 (and, being below one day, a time), no day is Excel's 29 February 1900", async () => {
        const { cells } = await modules();
        for (const [serial, want] of DATES_1904) {
            expect(cells.serialText(serial, { date1904: true }), String(serial)).toBe(want);
        }
    });

    test("a number that no date can be stays a number: negative, past 9999-12-31 (2958465 in the 1900 system, 2957003 in the 1904), not finite", async () => {
        const { cells } = await modules();
        for (const serial of [-1, -0.5, -1e-9, -1000, 2958466, 2958465.9999999, 3000000, 1e300, Infinity, NaN]) {
            expect(cells.serialText(serial, { date1904: false }), `1900: ${serial}`).toBeNull();
        }
        // a value that rounds up to the next day past the last is past it
        expect(cells.serialText(2958465.99999999, { date1904: false })).toBeNull();
        for (const serial of [-1, 2957004, 2957003.9999999, 2958465]) {
            expect(cells.serialText(serial, { date1904: true }), `1904: ${serial}`).toBeNull();
        }
    });

    test("seconds are rounded to the nearest once and first: at the half, up; at the end of a day, to the next", async () => {
        const { cells } = await modules();
        const wants = [
            // 337.5 seconds, exactly: rounds up
            [0.00390625, "00:05:38"],
            [0.01171875, "00:16:53"],
            // 337.49
            [0.00390624, "00:05:37"],
            // the library's own date code would cut these seconds off
            [45291.37847222222, "2023-12-31 09:05:00"],
            [45351.60416666666, "2024-02-29 14:30:00"],
            [0.37847222222222, "09:05:00"],
            // a value that rounds up to the next day is a date at 00:00:00 (no time part)
            [45291.99999999, "2024-01-01"],
            [45291.5, "2023-12-31 12:00:00"],
            [45291.4999999, "2023-12-31 12:00:00"],
            // below one day, it is a time that rounds to a whole day: 00:00:00, as Excel shows it
            [0.9999999, "00:00:00"],
            [0.99999999999, "00:00:00"],
            [0.9999, "23:59:51"],
            [0.999994, "23:59:59"],
            // from one day on, a whole day more
            [1.0000001, "1900-01-01"],
        ];
        for (const [serial, want] of wants) {
            expect(cells.serialText(serial, { date1904: false }), String(serial)).toBe(want);
        }
        // in the 1904 system the same value rounds up into a date that is a day on
        expect(cells.serialText(43681.99999999, { date1904: true })).toBe("2023-08-06");
    });

    test("a duration is H:MM:SS with the hours not padded and free to pass 24, whatever the unit in its bracket", async () => {
        const { cells } = await modules();
        const wants = [
            [0, "0:00:00"],
            [1.25, "30:00:00"],
            [1.5, "36:00:00"],
            [2, "48:00:00"],
            [0.5, "12:00:00"],
            [0.0416666666666667, "1:00:00"],
            [0.75, "18:00:00"],
            [100.5, "2412:00:00"],
            [100.4, "2409:36:00"],
            // it does not wrap at a day, or turn into a date: 0.99999999 days is 24 hours
            [0.99999999, "24:00:00"],
            [3.7 / 86400, "0:00:04"],
            [1e11, "2400000000000:00:00"],
            [1e6, "24000000:00:00"],
        ];
        for (const [serial, want] of wants) {
            expect(cells.serialText(serial, { duration: true }), String(serial)).toBe(want);
        }
        // exactly 2^53 seconds is still a duration (the last one a number holds exactly), the next is not
        expect(cells.serialText(2 ** 53 / 86400, { duration: true })).toBe("2501999792983:36:32");
        expect(cells.serialText(2 ** 53 / 86400 + 1, { duration: true })).toBeNull();
        // a duration below zero, or beyond what a number holds exactly in seconds (2^53), stays a number
        for (const serial of [-1, -0.0001, 1.05e11, 1e12, 1e300, Infinity]) {
            expect(cells.serialText(serial, { duration: true }), String(serial)).toBeNull();
        }
    });

    test("through a cell: by value, whatever the format shows (0 under yyyy-mm-dd is a time; 1.5 under hh:mm:ss a date)", async () => {
        const { cells } = await modules();
        const sheet = await sheetOf([[{ t: "n", v: 0, z: "yyyy-mm-dd" }, { t: "n", v: 1.5, z: "hh:mm:ss" }, { t: "n", v: 0.5, z: "yyyy-mm-dd" }, { t: "n", v: 1.25, z: "[h]:mm:ss" }]]);
        expect([0, 1, 2, 3].map((c) => cells.valueAt(sheet, 0, c))).toEqual(["00:00:00", "1900-01-01 12:00:00", "12:00:00", "30:00:00"]);
    });

    test("through a cell: the date system of the workbook is used, and a number no date can be is the number itself", async () => {
        const { cells } = await modules();
        const row = [
            { t: "n", v: 43681, z: "yyyy-mm-dd" },
            { t: "n", v: -5, z: "yyyy-mm-dd" },
            { t: "n", v: 3000000, z: "yyyy-mm-dd" },
            { t: "n", v: -1, z: "[h]:mm:ss" },
            { t: "n", v: 1e12, z: "[h]:mm:ss" },
            { t: "n", v: 43681, z: "0.00" },
        ];
        const system1904 = await sheetOf([row], { date1904: true });
        expect([0, 1, 2, 3, 4, 5].map((c) => cells.valueAt(system1904, 0, c))).toEqual(["2023-08-05", -5, 3000000, -1, 1e12, 43681]);
        const system1900 = await sheetOf([row]);
        expect([0, 1, 2, 3, 4, 5].map((c) => cells.valueAt(system1900, 0, c))).toEqual(["2019-08-04", -5, 3000000, -1, 1e12, 43681]);
    });

    test("a text cell with a date format stays text, and so does one that holds a date as written", async () => {
        const { cells } = await modules();
        const sheet = await sheetOf([[{ t: "s", v: "m/d/yy", z: "m/d/yy" }, { t: "s", v: "05/08/2023", z: "dd/mm/yyyy" }, { t: "s", v: "45143", z: "yyyy-mm-dd" }]]);
        expect([0, 1, 2].map((c) => cells.valueAt(sheet, 0, c))).toEqual(["m/d/yy", "05/08/2023", "45143"]);
    });

    test("a cell with no format gets one the library holds that gives its shown text, a date format first, else General (the library leaves z undefined on some)", async () => {
        const { cells } = await modules();
        // 45143 shown as 8/5/23 is m/d/yy; a built-in format outside the library's table of 29 has no z on its first cell
        const sheet = await sheetOf([
            [
                { t: "n", v: 45143, w: "8/5/23" },
                { t: "n", v: 45143, w: "45143" },
                { t: "n", v: 45143 },
                { t: "n", v: 45143.5, w: "8/5/23 12:00" },
                { t: "n", v: 0.5, w: "12:00 PM" },
                { t: "n", v: 1234.5, w: "1,234.5" },
                { t: "n", v: 7, w: "7" },
            ],
        ]);
        expect([0, 1, 2, 3, 4, 5, 6].map((c) => cells.valueAt(sheet, 0, c))).toEqual(["2023-08-05", 45143, 45143, "2023-08-05 12:00:00", "12:00:00", 1234.5, 7]);
    });

    test("when a number format and a date format both give the cell's shown text, the date format is the one taken; a formatter that throws is not the format", async () => {
        const { cells } = await modules();
        // a formatter that shows everything the same: every format of its table gives the cell's text
        const everything = { get_table: () => ({ 0: "General", 1: "0", 14: "m/d/yy", 15: "d-mmm-yy" }), format: () => "shown" };
        const sheet = cells.readSheet(worksheet([[{ t: "n", v: 45143, w: "shown" }]]), { name: "S", ssf: everything });
        expect(cells.valueAt(sheet, 0, 0)).toBe("2023-08-05");
        // a format it cannot show is passed over
        const odd = { get_table: () => ({ 0: "General", 14: "m/d/yy", 15: "d-mmm-yy" }), format: (format) => { if (format === "m/d/yy") { throw new Error("unrecognized"); } return "shown"; } };
        const next = cells.readSheet(worksheet([[{ t: "n", v: 45143, w: "shown" }]]), { name: "S", ssf: odd });
        expect(cells.valueAt(next, 0, 0)).toBe("2023-08-05");
        // none gives it: General
        const none = { get_table: () => ({ 0: "General", 14: "m/d/yy" }), format: () => "other" };
        expect(cells.valueAt(cells.readSheet(worksheet([[{ t: "n", v: 45143, w: "shown" }]]), { name: "S", ssf: none }), 0, 0)).toBe(45143);
    });

    test("a cell with no format and no library to try formats with is a plain number", async () => {
        const { cells } = await modules();
        const sheet = cells.readSheet(worksheet([[{ t: "n", v: 45143, w: "8/5/23" }]]), { name: "S" });
        expect(cells.valueAt(sheet, 0, 0)).toBe(45143);
    });
});

// ---- the value of a cell ------------------------------------------------------------------------

test.describe("the value of a cell", () => {
    test.beforeEach(skipUnlessFirst);

    const valueOfCell = async (cell, date1904 = false) => {
        const { cells } = await modules();
        return cells.cellValue(cell, { date1904, ssf: XLSX.SSF, formats: new Map() });
    };

    test("a text cell is its text as it is: spaces, line breaks and leading zeros kept; empty text is no value", async () => {
        for (const text of ["North ", " South", "00123", "line one\nline two", "a  b", "   ", "\t", "é"]) {
            expect(await valueOfCell({ t: "s", v: text }), JSON.stringify(text)).toBe(text);
        }
        expect(await valueOfCell({ t: "s", v: "" })).toBeNull();
        expect(await valueOfCell({ t: "s", v: "", f: '""' })).toBeNull();
    });

    test("true and false are the words; an error is its text, from w when the library gave one, else from the code", async () => {
        expect(await valueOfCell({ t: "b", v: true })).toBe("TRUE");
        expect(await valueOfCell({ t: "b", v: false })).toBe("FALSE");
        expect(await valueOfCell({ t: "b", v: true, f: "true" })).toBe("TRUE");
        expect(await valueOfCell({ t: "e", v: 42, w: "#N/A" })).toBe("#N/A");
        const codes = [
            [0x00, "#NULL!"],
            [0x07, "#DIV/0!"],
            [0x0f, "#VALUE!"],
            [0x17, "#REF!"],
            [0x1d, "#NAME?"],
            [0x24, "#NUM!"],
            [0x2a, "#N/A"],
            [0x2b, "#GETTING_DATA"],
        ];
        for (const [code, text] of codes) {
            expect(await valueOfCell({ t: "e", v: code }), String(code)).toBe(text);
            // the library's own text is the one shown, when there is one
            expect(await valueOfCell({ t: "e", v: code, w: "#WORDS!" }), String(code)).toBe("#WORDS!");
            // an empty text of the library's is no text: a value that holds nothing is not what an error is
            expect(await valueOfCell({ t: "e", v: code, w: "" }), String(code)).toBe(text);
        }
        // a code nobody knows is not left without a text
        expect(await valueOfCell({ t: "e", v: 99 })).toBe("#N/A");
    });

    test("a number is its number, and its number format changes nothing but a date's: a currency, a percentage, a scientific format", async () => {
        for (const [v, z] of [
            [1234.5, '"£"#,##0.00'],
            [0.125, "0.0%"],
            [123, "00000"],
            [6.02e23, "0.00E+00"],
            [6.02e23, "0.00e+00"],
            [0.5, "# ?/?"],
            [25000000, "#,##0"],
            [-1234.5, "_-£* #,##0.00_-;[Red]-£* #,##0.00_-"],
            [42, "@"],
            [1234567890123456, "0"],
        ]) {
            expect(await valueOfCell({ t: "n", v, z, w: "shown" }), z).toBe(v);
        }
    });

    test("a stub is no value, and neither is a formula with none (an .xlsx gives it the type z and a v of 0; an .xls an empty text)", async () => {
        expect(await valueOfCell({ t: "z" })).toBeNull();
        expect(await valueOfCell({ t: "z", v: 0, f: "SUM(B2:B4)", z: "General" })).toBeNull();
        expect(await valueOfCell({ t: "s", v: "", f: "D2*E2" })).toBeNull();
        // a formula that is the empty text is a formula all the same: the report counts it
        const read = await tableFrom(await sheetOf([["h"], [{ t: "z", f: "" }], [{ t: "z" }]]));
        expect(read.table.emptyFormulas).toBe(1);
    });

    test("a formula gives its last stored value by the same rules as any cell", async () => {
        expect(await valueOfCell({ t: "n", v: 26, f: "B2*C2", z: "General" })).toBe(26);
        expect(await valueOfCell({ t: "s", v: "Mug x4", f: 'A2&" x"&B2' })).toBe("Mug x4");
        expect(await valueOfCell({ t: "n", v: 45305, f: "A2+14", z: "yyyy-mm-dd" })).toBe("2024-01-14");
        expect(await valueOfCell({ t: "e", v: 7, f: "1/0", w: "#DIV/0!" })).toBe("#DIV/0!");
    });

    test("a number is not the text a number format would show for it, and not the library's w", async () => {
        // w is a display string: 9.0072E+15 for a number that is exactly 9007199254740992
        expect(await valueOfCell({ t: "n", v: 9007199254740992, z: "General", w: "9.0072E+15" })).toBe(9007199254740992);
        expect(await valueOfCell({ t: "n", v: 124.94999999999999, z: "0.00", w: "124.95" })).toBe(124.94999999999999);
    });
});

// ---- a sheet: the rectangle, its state, its names -------------------------------------------------

test.describe("a sheet: the rectangle of its values, its state, and the name of its table", () => {
    test.beforeEach(skipUnlessFirst);

    test("the rectangle is the smallest that holds every value, from the cells and not from the sheet's range", async () => {
        const sheet = await sheetOf(
            [
                [null, null, null, null],
                [null, null, "x", { t: "z", z: "0.00" }],
                [null, "a", "b", null],
                [null, null, null, null],
                [null, null, 5, null],
                [null, { t: "z" }, { t: "z" }, { t: "z" }],
            ],
            { extra: { "!ref": "A1:H20" } }
        );
        expect(sheet.state).toBe("ready");
        // rows 2 to 5 (the stubs of row 6 and of column 4 hold nothing), columns B to C
        expect([sheet.rows, sheet.columns, sheet.start]).toEqual([4, 2, "B2"]);
    });

    test("the last row is the last one that holds a cell, not the length of the rows list; a row with no cell is a row of NULLs", async () => {
        const { cells } = await modules();
        const rows = [["id", "name"], null, [1, "Ann"], undefined, [2], null, null, null];
        const sheet = await sheetOf(rows);
        expect([sheet.rows, sheet.columns]).toEqual([5, 2]);
        expect(sheet.data.length).toBe(8);
        const { converted, types } = await tableFrom(sheet);
        // (the third row and the last are rows of no cell inside the rectangle)
        expect(converted).toEqual([[null, null], [1, "Ann"], [null, null], [2, null]]);
        expect(types).toEqual(["INTEGER", "TEXT"]);
        expect(cells.previewRows(sheet, 0, 20)).toEqual([["id", "name"], [null, null], ["1", "Ann"], [null, null], ["2", null]]);
    });

    test("a stray value far away stretches the rectangle (a sheet of 20 rows and 8 columns for a table of 3)", async () => {
        const rows = [["id", "name", "qty"], [1, "Mug", 4]];
        rows[19] = [null, null, null, null, null, null, null, "reviewed"];
        const sheet = await sheetOf(rows);
        expect([sheet.rows, sheet.columns, sheet.start]).toEqual([20, 8, "A1"]);
        const { converted } = await tableFrom(sheet);
        expect(converted).toHaveLength(19);
        expect(converted[0]).toEqual([1, "Mug", 4, null, null, null, null, null]);
        expect(converted[1]).toEqual([null, null, null, null, null, null, null, null]);
        expect(converted[18]).toEqual([null, null, null, null, null, null, null, "reviewed"]);
    });

    test("a cell of spaces is a value (it counts for the rectangle) and an empty text, a stub and a formula with no value are none", async () => {
        const { cells } = await modules();
        const spaces = await sheetOf([[null, "   "]]);
        expect([spaces.state, spaces.rows, spaces.columns, spaces.start]).toEqual(["ready", 1, 1, "B1"]);
        expect(cells.valueAt(spaces, 0, 0)).toBe("   ");
        for (const nothing of [{ t: "s", v: "" }, { t: "z" }, { t: "z", v: 0, f: "1+2" }, { t: "s", v: "", f: "A1" }]) {
            expect((await sheetOf([[nothing]])).state, JSON.stringify(nothing)).toBe("empty");
        }
    });

    test("the start of the rectangle is written as an address: A1, C5, AA3, XFD1048576", async () => {
        const place = async (row, column) => {
            const rows = [];
            rows[row] = [];
            rows[row][column] = "v";
            return (await sheetOf(rows)).start;
        };
        expect(await place(0, 0)).toBe("A1");
        expect(await place(4, 2)).toBe("C5");
        expect(await place(2, 26)).toBe("AA3");
        expect(await place(0, 25)).toBe("Z1");
        expect(await place(0, 27)).toBe("AB1");
        expect(await place(0, 701)).toBe("ZZ1");
        expect(await place(0, 702)).toBe("AAA1");
        expect(await place(1048575, 16383)).toBe("XFD1048576");
    });

    test("the state: ready, empty (no value, whatever range the sheet declares), wide (more than 2,000 columns)", async () => {
        const { csv } = await modules();
        expect(csv.MAX_COLUMNS).toBe(2000);
        const wideRow = (n) => Array.from({ length: n }, (unused, i) => `c${i}`);
        const of = async (rows, extra) => (await sheetOf(rows, { extra })).state;
        expect(await of([wideRow(2000)])).toBe("ready");
        expect(await of([wideRow(2001)])).toBe("wide");
        // a value far to the right makes a wide rectangle, though two cells hold values
        expect(await of([["a", ...new Array(2000), "b"]])).toBe("wide");
        expect(await of([])).toBe("empty");
        expect(await of([], { "!ref": "A1" })).toBe("empty");
        expect(await of([], { "!ref": undefined })).toBe("empty");
        // the range says cells, and there is none: the range decides nothing (a sound sheet that holds no cell can declare
        // one, and so does a sheet whose part of the file was cut short inside a sound zip): the sheet holds no value
        expect(await of([], { "!ref": "A1:D51" })).toBe("empty");
        expect(await of([null, null], { "!ref": "A1:C3" })).toBe("empty");
        // a stub is a cell object, and holds nothing
        expect(await of([[{ t: "z" }]], { "!ref": "A1:C3" })).toBe("empty");
        // a sheet of a range that is only A1 is empty, not damaged
        expect(await of([[{ t: "z" }]], { "!ref": "A1" })).toBe("empty");
    });

    test("a wide sheet and an empty one say their size as it is: no rectangle for a sheet with no value", async () => {
        const wide = await sheetOf([Array.from({ length: 2001 }, (unused, i) => i)]);
        expect([wide.state, wide.rows, wide.columns, wide.start]).toEqual(["wide", 1, 2001, "A1"]);
        const empty = await sheetOf([[{ t: "z" }]]);
        expect([empty.state, empty.rows, empty.columns, empty.start]).toEqual(["empty", 0, 0, null]);
    });

    test("a table is refused for a sheet that is not ready, and for a names row that is not a row of it", async () => {
        const { cells } = await modules();
        const empty = await sheetOf([[{ t: "z" }]]);
        await expect(cells.tableOf(empty, {})).rejects.toBeInstanceOf(RangeError);
        const sheet = await sheetOf([["a"], ["b"]]);
        for (const namesRow of [0, 3, -1, 1.5, NaN, "2"]) {
            await expect(cells.tableOf(sheet, { hasNames: true, namesRow }), String(namesRow)).rejects.toBeInstanceOf(RangeError);
        }
        await expect(cells.tableOf(sheet, { hasNames: true, namesRow: 2 })).resolves.toMatchObject({ rows: 0 });
    });

    test("a sheet's table name is its name made a name, never cut at a dot; the file's name for a web page; the fallback when nothing is left", async () => {
        const { cells, rules } = await modules();
        const named = async (label, page = false) => cells.sheetTableName(await sheetOf([["a"]], { label, name: label, page }), "prices.q1.xls");
        expect(await named("orders")).toBe("orders");
        expect(await named("Sales 2024")).toBe("Sales_2024");
        expect(await named("Q1.5")).toBe("Q1_5");
        expect(await named("2024")).toBe("c_2024");
        expect(await named("Données")).toBe("Donn_es");
        expect(await named("😀 data")).toBe("_data");
        expect(await named("Order")).toBe("Order");
        expect(await named("")).toBe(rules.FALLBACK_TABLE_NAME);
        expect(rules.FALLBACK_TABLE_NAME).toBe("table");
        // a web page: its sheets have no name of their own, the file's name stands
        expect(await named("Table 2", true)).toBe("prices_q1");
        const bare = await sheetOf([["a"]], { page: true, label: "Table 1" });
        expect(cells.sheetTableName(bare, ".xls")).toBe("table");
    });
});

// ---- merged cells ---------------------------------------------------------------------------------

test.describe("merged cells: only the top left cell keeps its value", () => {
    test.beforeEach(skipUnlessFirst);

    const block = (from, to) => ({ s: { r: from[0], c: from[1] }, e: { r: to[0], c: to[1] } });

    test("the library keeps what Excel hides in a merged block, and the sheet does not show it", async () => {
        const { cells } = await modules();
        const sheet = await sheetOf(
            [
                ["id", "name", "city"],
                ["C001", "Ava Hughes", "Leeds"],
                ["Kitchen", "hidden under the merge", "x"],
                ["Office", "kept?", "y"],
                ["z", "w", "v"],
            ],
            { extra: { "!merges": [block([2, 0], [2, 1]), block([3, 1], [4, 1])] } }
        );
        // A3:B3 is merged (B3 is hidden); B4:B5 is merged (B5 is hidden, B4 is its top left)
        expect(cells.previewRows(sheet, 0, 20)).toEqual([
            ["id", "name", "city"],
            ["C001", "Ava Hughes", "Leeds"],
            ["Kitchen", null, "x"],
            ["Office", "kept?", "y"],
            ["z", null, "v"],
        ]);
    });

    test("a value hidden by a merge does not make the rectangle: it is blanked before the rectangle is worked out", async () => {
        const sheet = await sheetOf(
            [
                ["a", "b", null, null, null, "hidden"],
                [null, null, null, null, null, null],
                [null, null, null, null, null, null],
                [null, null, null, null, null, "hidden 2"],
            ],
            { extra: { "!merges": [block([0, 4], [3, 5])] } }
        );
        expect([sheet.rows, sheet.columns, sheet.start]).toEqual([1, 2, "A1"]);
        const covered = await sheetOf([[null, null, "x", "hidden"]], { extra: { "!merges": [block([0, 2], [0, 3])] } });
        expect([covered.rows, covered.columns, covered.start]).toEqual([1, 1, "C1"]);
    });

    test("a block of one cell is no merge, and a block whose top left cell holds the only value keeps it", async () => {
        const { cells } = await modules();
        const sheet = await sheetOf([["only", "gone"]], { extra: { "!merges": [block([0, 0], [0, 0]), block([0, 0], [0, 1])] } });
        expect(cells.previewRows(sheet, 0, 5)).toEqual([["only"]]);
        const odd = await sheetOf([["a"]], { extra: { "!merges": [null, {}, { s: { r: 0, c: 0 } }, undefined] } });
        expect(odd.state).toBe("ready");
    });

    test("a merge that runs past the cells of the sheet, or a very large one, costs no more than the cells it covers", async () => {
        const huge = await sheetOf([["a", "b"], ["c", "d"]], { extra: { "!merges": [block([0, 0], [1048575, 16383])] } });
        expect([huge.rows, huge.columns]).toEqual([1, 1]);
        const { cells } = await modules();
        expect(cells.previewRows(huge, 0, 5)).toEqual([["a"]]);
    });

    test("in a worksheet the library read, the cells under a merge are blanked: two merged blocks, one over two filled cells", async () => {
        const bytes = workbookBytes([
            {
                name: "Merged",
                rows: [["id", "name"], ["C001", "Ava Hughes"], ["C002", "Bo Li"]],
                merges: ["A2:B2"],
            },
        ]);
        const { cells } = await modules();
        const read = await openWorkbook(bytes, "merged.xlsx");
        expect(cells.previewRows(read.sheets[0], 0, 5)).toEqual([["id", "name"], ["C001", null], ["C002", "Bo Li"]]);
    });
});

// ---- the table of a sheet -------------------------------------------------------------------------

test.describe("the table of a sheet: types, names, blanks and stored values", () => {
    test.beforeEach(skipUnlessFirst);

    // [the cells under a header "x", the type, the values as stored once converted, the blocking value]
    const MIXES = [
        [[1, 2, 3], "INTEGER", [1, 2, 3], null],
        [[1, 2.5], "REAL", [1, 2.5], null],
        // a number is typed as a number, not as the text written for it: 6.02e23 written out has 24 digits
        [[6.02e23, 1], "REAL", [6.02e23, 1], null],
        [[1e20, 5], "REAL", [1e20, 5], null],
        [[1e15, 1], "REAL", [1e15, 1], null],
        [[999999999999999, 1], "INTEGER", [999999999999999, 1], null],
        [[-999999999999999], "INTEGER", [-999999999999999], null],
        [[-1e15], "REAL", [-1e15], null],
        [[1.234567890123457e19, 1e15, 123456789012345, 9007199254740992, 1, 2], "REAL", [1.234567890123457e19, 1e15, 123456789012345, 9007199254740992, 1, 2], null],
        // numbers and numeric-looking text, typed from all of them together
        [[1, "2", 3.5, "4.50"], "REAL", [1, 2, 3.5, 4.5], null],
        [[1, "2", 3], "INTEGER", [1, 2, 3], null],
        [[1, "007"], "TEXT", ["1", "007"], "007"],
        [[1, " 3"], "TEXT", ["1", " 3"], " 3"],
        [[1, "1e3"], "TEXT", ["1", "1e3"], "1e3"],
        [[2, "-0"], "TEXT", ["2", "-0"], "-0"],
        [[1.5, "1,5"], "TEXT", ["1.5", "1,5"], "1,5"],
        [[5, "12345678901234567890"], "TEXT", ["5", "12345678901234567890"], "12345678901234567890"],
        [[3, true], "TEXT", ["3", "TRUE"], "TRUE"],
        [[1, { t: "n", v: 45143, z: "yyyy-mm-dd" }], "TEXT", ["1", "2023-08-05"], "2023-08-05"],
        [[10, "n/a", 12.5, 7, "unknown", 3], "TEXT", ["10", "n/a", "12.5", "7", "unknown", "3"], "n/a"],
        [[{ t: "e", v: 7, w: "#DIV/0!" }, 4, 5], "TEXT", ["#DIV/0!", "4", "5"], "#DIV/0!"],
        // text that is a number is a number, as in a CSV file
        [["42", "7"], "INTEGER", [42, 7], null],
        [["00123", "00007"], "TEXT", ["00123", "00007"], null],
        [["4.50", "1"], "REAL", [4.5, 1], null],
        // blanks: none is no value, and a column of nothing is TEXT
        [[1, null, 3], "INTEGER", [1, null, 3], null],
        [[null, null], "TEXT", [null, null], null],
        [[{ t: "z" }, { t: "s", v: "" }], "TEXT", [null, null], null],
        // negative zero is zero, as a whole number and as text
        [[-0, 1], "INTEGER", [0, 1], null],
        [[-0, 1.5], "REAL", [0, 1.5], null],
    ];

    for (const [values, type, converted, blocking] of MIXES) {
        test(`a column of ${JSON.stringify(values)} is ${type}`, async () => {
            // (a second column that is full to the last row keeps the blank rows of the first inside the rectangle)
            const sheet = await sheetOf([["x", "y"], ...values.map((value) => [value, 1])]);
            const read = await tableFrom(sheet);
            expect(read.types[0]).toBe(type);
            expect(read.converted.map((row) => row[0])).toEqual(converted);
            expect(read.table.columns[0].blocking).toBe(blocking);
        });
    }

    test("a number in a TEXT column is written out in full, anything else as it is; a number in an INTEGER or REAL column stays a number", async () => {
        const sheet = await sheetOf([["text", "real", "mixed"], [1234.5, 1e20, 329], ["a", 6.02e23, "n/a"], [1e-7, 2, 3.5e-9]]);
        const read = await tableFrom(sheet);
        expect(read.types).toEqual(["TEXT", "REAL", "TEXT"]);
        expect(read.stored).toEqual([
            ["1234.5", 1e20, "329"],
            ["a", 6.02e23, "n/a"],
            ["0.0000001", 2, "0.0000000035"],
        ]);
    });

    test("a text cell is stored as its text in a column that converts it (INTEGER, REAL): the column does the converting", async () => {
        const sheet = await sheetOf(columnOf(["42", 7, "4.5"]));
        const read = await tableFrom(sheet);
        expect(read.types).toEqual(["REAL"]);
        expect(read.stored.map((row) => row[0])).toEqual(["42", 7, "4.5"]);
    });

    test("a header cell that holds a number, a date, true or false is named by what it holds written out", async () => {
        const sheet = await sheetOf([
            [2023, { t: "n", v: 45143, z: "yyyy-mm-dd" }, true, false, 1.5, -3, 1e21, 1e-7, { t: "n", v: 0.5, z: "hh:mm" }, { t: "n", v: 1.25, z: "[h]:mm" }],
            [1, 2, 3, 4, 5, 6, 7, 8, 9, 10],
        ]);
        const { table } = await tableFrom(sheet);
        expect(table.columns.map((c) => c.name)).toEqual([
            "c_2023",
            "c_2023_08_05",
            "TRUE",
            "FALSE",
            "c_1_5",
            "_3",
            "c_1000000000000000000000",
            "c_0_0000001",
            "c_12_00_00",
            "c_30_00_00",
        ]);
        expect(table.columns.map((c) => c.original)).toEqual(["2023", "2023-08-05", "TRUE", "FALSE", "1.5", "-3", "1000000000000000000000", "0.0000001", "12:00:00", "30:00:00"]);
    });

    test("a numeric header 2023 beside a text header 2023 gives c_2023 and c_2023_2; names are unique whatever the letter case", async () => {
        const sheet = await sheetOf([[2023, "2023", "Name", "name", "NAME", "Name_2", ""], [1, 2, 3, 4, 5, 6, 7]]);
        const { names } = await tableFrom(sheet);
        expect(names).toEqual(["c_2023", "c_2023_2", "Name", "name_2", "NAME_3", "Name_2_2", "column_7"]);
    });

    test("a blank header is column_<its position in the rectangle>, also when the table starts at C5; spaces and empty text are blank", async () => {
        const rows = [];
        rows[4] = [null, null, "alpha", { t: "z", z: "General" }, "gamma", "  ", "", "eta"];
        rows[5] = [null, null, 1, 2, 3, 4, 5, 6];
        const sheet = await sheetOf(rows);
        expect(sheet.start).toBe("C5");
        const read = await tableFrom(sheet);
        // (the empty text in H5 holds no value: the rectangle's last column is the one of eta, I)
        expect(read.names).toEqual(["alpha", "column_2", "gamma", "column_4", "column_5", "eta"]);
        expect(read.table.columns.map((c) => c.original)).toEqual(["alpha", "", "gamma", "  ", "", "eta"]);
        expect(read.converted).toEqual([[1, 2, 3, 4, 5, 6]]);
    });

    test("with no row of names the columns are column_1 to the width and every row of the rectangle is data, whatever the box holds", async () => {
        const { cells } = await modules();
        const sheet = await sheetOf([["a", "b"], [1, 2], ["c", 3], [4, 5], [6, 7], [8, 9]]);
        for (const namesRow of [1, 4, 99, undefined]) {
            const read = await tableFrom(sheet, { hasNames: false, namesRow });
            expect(read.names, String(namesRow)).toEqual(["column_1", "column_2"]);
            expect(read.table.columns.map((c) => c.original)).toEqual([null, null]);
            expect(read.table.rows).toBe(6);
            expect(read.converted[0]).toEqual(["a", "b"]);
            // (both columns hold text as well as numbers: TEXT, and the numbers are written out)
            expect(read.types).toEqual(["TEXT", "TEXT"]);
            expect(read.converted[5]).toEqual(["8", "9"]);
        }
        // and with names on row 4, the rows above are left out and the rows below are the data
        const lower = await tableFrom(sheet, { hasNames: true, namesRow: 4 });
        expect(lower.names).toEqual(["c_4", "c_5"]);
        expect(lower.table.rows).toBe(2);
        expect(lower.converted).toEqual([[6, 7], [8, 9]]);
        expect(cells.previewRows(sheet, 3, 2)).toEqual([["4", "5"], ["6", "7"]]);
    });

    test("the blanks of a column are its NULLs, a row of no cell and a column of none included, and rows count from the rectangle's first row", async () => {
        const rows = [];
        rows[4] = [null, null, "id", "note", "gap"];
        rows[5] = [null, null, 1, "a", null];
        rows[7] = [null, null, 2, null, null];
        const sheet = await sheetOf(rows);
        const read = await tableFrom(sheet);
        expect([sheet.rows, read.table.rows]).toEqual([4, 3]);
        expect(read.table.columns.map((c) => c.blanks)).toEqual([1, 2, 3]);
        expect(read.table.columns.map((c) => c.type)).toEqual(["INTEGER", "TEXT", "TEXT"]);
    });

    test("the preview is the cells as text: numbers written out in full, dates by their rule, NULL as null, with the rows asked for", async () => {
        const { cells } = await modules();
        const sheet = await sheetOf([
            ["when", "n", "flag", "text"],
            [{ t: "n", v: 45143, z: "yyyy-mm-dd" }, 1e21, true, "a"],
            [null, 0.1 + 0.2, false, "  "],
        ]);
        expect(cells.previewRows(sheet, 1, 5)).toEqual([
            ["2023-08-05", "1000000000000000000000", "TRUE", "a"],
            [null, "0.30000000000000004", "FALSE", "  "],
        ]);
        expect(cells.previewRows(sheet, 0, 1)).toEqual([["when", "n", "flag", "text"]]);
        expect(cells.previewRows(sheet, 2, 20)).toHaveLength(1);
        expect(cells.previewRows(sheet, 3, 20)).toEqual([]);
    });

    test("the table is worked out in steps of IMPORT_SHEET_CELLS cells, with a rest between two, and a rest that throws stops it", async () => {
        const { cells, config } = await modules();
        const columns = 10;
        const rowsOf = (n) => Array.from({ length: n }, (unused, r) => Array.from({ length: columns }, (u, c) => r * columns + c));
        const sheet = await sheetOf(rowsOf(7001));
        // 7,000 data rows of 10 cells (and the names row): the steps are 3,000 rows each
        let rests = 0;
        const table = await cells.tableOf(sheet, { rest: async () => rests++ });
        expect(config.IMPORT_SHEET_CELLS).toBe(30000);
        expect(table.rows).toBe(7000);
        expect(rests).toBe(2);
        await expect(
            cells.tableOf(sheet, {
                rest: async () => {
                    throw new Error("page moved");
                },
            })
        ).rejects.toThrow("page moved");
    });

    test("the rest comes at exactly IMPORT_SHEET_CELLS cells, and not one cell later", async () => {
        const { cells, config } = await modules();
        const restsFor = async (cellCount) => {
            const sheet = await sheetOf(Array.from({ length: cellCount }, (unused, r) => [r]));
            let rests = 0;
            const table = await cells.tableOf(sheet, { hasNames: false, rest: async () => rests++ });
            expect(table.rows).toBe(cellCount);
            return rests;
        };
        expect(await restsFor(config.IMPORT_SHEET_CELLS - 1)).toBe(0);
        expect(await restsFor(config.IMPORT_SHEET_CELLS)).toBe(1);
        expect(await restsFor(config.IMPORT_SHEET_CELLS * 2)).toBe(2);
    });
});

// ---- the facts of the report: empty formulas, and a format that pads ----------------------------------

test.describe("the two facts of the report: formulas that came out empty, and zeros that a number format showed", () => {
    test.beforeEach(skipUnlessFirst);

    const stub = (formula) => ({ t: "z", v: 0, f: formula, z: "General" });
    const emptyText = (formula) => ({ t: "s", v: "", f: formula });

    test("every formula cell with no value below the names counts, a stub and an empty text alike, inside the columns or beyond them", async () => {
        const rows = [
            ["a", "b"],
            [1, stub("A2*2"), null, null, stub("Z1")],
            [2, emptyText("IF(A3>5,1,\"\")"), null, null, null, emptyText("B3")],
            [{ t: "n", v: 3, f: "A4" }, { t: "b", v: true, f: "true" }, null, null, null, null, { t: "s", v: "kept", f: "X1" }],
        ];
        const read = await tableFrom(await sheetOf(rows));
        // B2 and E2 (stubs), B3 and F3 (empty text): E and F are beyond the table's two names, and counted
        expect(read.table.emptyFormulas).toBe(4);
    });

    test("with the names lower down, only the rows below them count; with no row of names, the whole sheet", async () => {
        const rows = [
            [stub("A1"), "title"],
            ["x", stub("A2")],
            ["names", "here"],
            [1, stub("A4")],
            [2, emptyText("A5")],
        ];
        const sheet = await sheetOf(rows);
        expect((await tableFrom(sheet, { hasNames: true, namesRow: 3 })).table.emptyFormulas).toBe(2);
        expect((await tableFrom(sheet, { hasNames: true, namesRow: 1 })).table.emptyFormulas).toBe(3);
        expect((await tableFrom(sheet, { hasNames: true, namesRow: 5 })).table.emptyFormulas).toBe(0);
        expect((await tableFrom(sheet, { hasNames: false })).table.emptyFormulas).toBe(4);
    });

    test("formula cells outside the rectangle count too: above it with no names row, and to the right of it and below it always", async () => {
        const rows = [];
        rows[0] = [stub("A1")];
        rows[2] = [null, "id", "name"];
        rows[3] = [null, 1, "a", stub("D4")];
        rows[6] = [null, null, null, null, emptyText("E7")];
        const sheet = await sheetOf(rows);
        expect(sheet.start).toBe("B3");
        expect((await tableFrom(sheet, { hasNames: true, namesRow: 1 })).table.emptyFormulas).toBe(2);
        expect((await tableFrom(sheet, { hasNames: false })).table.emptyFormulas).toBe(3);
    });

    test("a boolean the .xls writer marks with a formula, a cell with a value, and a formula whose value is stored are not counted", async () => {
        const read = await tableFrom(await sheetOf([["a"], [{ t: "b", v: true, f: "true" }], [{ t: "n", v: 4, f: "2+2" }], [{ t: "s", v: "x", f: "B1" }]]));
        expect(read.table.emptyFormulas).toBe(0);
    });

    test("a column is named when a number in it lost zeros to a format that pads: the first such number, with its text as Excel showed it", async () => {
        const read = await tableFrom(
            await sheetOf([
                ["plain", "padded", "other"],
                [{ t: "n", v: 12345, z: "00000", w: "12345" }, { t: "n", v: 12345, z: "00000", w: "12345" }, { t: "n", v: 7, z: "#,##0", w: "7" }],
                [{ t: "n", v: 123, z: "General", w: "123" }, { t: "n", v: 123, z: "00000", w: "00123" }, { t: "n", v: 8, z: "0.00", w: "8.00" }],
                [{ t: "n", v: 7, z: "General", w: "7" }, { t: "n", v: 7, z: "00000", w: "00007" }, { t: "n", v: 9, z: "0", w: "9" }],
            ])
        );
        expect(read.table.padded).toEqual([{ column: "padded", example: "00123", number: 123 }]);
    });

    test("a number that did not lose its zeros does not name its column: five digits under 00000, a format with one zero, a text cell that holds 00123", async () => {
        const cell = (v, z, w) => ({ t: "n", v, z, w });
        const read = await tableFrom(
            await sheetOf([
                ["a", "b", "c", "d", "e"],
                [cell(12345, "00000", "12345"), cell(5, "0", "5"), cell(7, "#,##0", "7"), { t: "s", v: "00123" }, cell(123456, "000-000", "123-456")],
                [cell(99999, "00000", "99999"), cell(6, "0.00", "6.00"), cell(1000, "#,##0", "1,000"), { t: "s", v: "00007" }, cell(100000, "000-000", "100-000")],
            ])
        );
        expect(read.table.padded).toEqual([]);
    });

    test("the number of zeros counts what is before the point and what is in the first section, over every column of a sheet", async () => {
        const cell = (v, z) => ({ t: "n", v, z, w: `shown ${v}` });
        const read = await tableFrom(
            await sheetOf([
                ["a", "b", "c", "d", "e", "f", "g"],
                [cell(1234, "000-000"), cell(5, "00"), cell(0, "0000.00"), cell(0, "00;0"), cell(3, "00E+00"), cell(2, "0 0/0"), cell(55, "00")],
            ])
        );
        expect(read.table.padded.map((p) => [p.column, p.number])).toEqual([
            ["a", 1234],
            ["b", 5],
            ["c", 0],
            ["d", 0],
        ]);
    });

    test("the example is the library's text when it gave one, else the library's formatter's, else none (the column is still named)", async () => {
        const cell = (z, w) => ({ t: "n", v: 123, z, ...(w === undefined ? {} : { w }) });
        const read = await tableFrom(await sheetOf([["given", "made", "refused", "own"], [cell("00000", "00123"), cell("00000"), cell("£00000"), cell("00000", "as the library showed it")]]));
        expect(XLSX.SSF.format("00000", 123)).toBe("00123");
        expect(() => XLSX.SSF.format("£00000", 123)).toThrow();
        expect(read.table.padded).toEqual([
            { column: "given", example: "00123", number: 123 },
            { column: "made", example: "00123", number: 123 },
            { column: "refused", example: null, number: 123 },
            // the library's own text is the one used when there is one, not the one made here
            { column: "own", example: "as the library showed it", number: 123 },
        ]);
    });

    test("a cell with no format of its own is not padded: the format is guessed from its shown text, and General does not pad", async () => {
        const read = await tableFrom(await sheetOf([["a"], [{ t: "n", v: 123, w: "00123" }]]));
        expect(read.table.padded).toEqual([]);
    });
});

// ---- reading a workbook ---------------------------------------------------------------------------

test.describe("reading a workbook: the wiring of the library, what it throws, the list of sheets", () => {
    test.beforeEach(skipUnlessFirst);

    test("the library is read with the plan's options, a new options object for each call, and a zip is read as an array of bytes", async () => {
        const bytes = workbookBytes([{ name: "S", rows: [["a"], ["b"]] }]);
        const library = fakeLibrary(oneSheet());
        await openWorkbook(bytes, "a.xlsx", { library });
        await openWorkbook(bytes, "a.xlsx", { library });
        expect(library.calls).toHaveLength(2);
        for (const call of library.calls) {
            expect(call.options).toEqual({ type: "array", dense: true, cellNF: true, sheetStubs: true, cellHTML: false });
            expect(call.input).toBeInstanceOf(Uint8Array);
            expect(call.input.length).toBe(bytes.length);
        }
        // the library writes into the options it is given (cellText, cellDates ...): never the same object twice
        expect(library.calls[0].given).not.toBe(library.calls[1].given);
    });

    test("a web page or an XML spreadsheet is decoded by the app and handed to the library as text, with raw", async () => {
        const page = Buffer.from("<html><table><tr><td>00123</td></tr></table></html>", "utf8");
        const library = fakeLibrary(oneSheet());
        await openWorkbook(new Uint8Array(page), "page.xls", { library });
        expect(library.calls[0].options).toEqual({ type: "string", raw: true, dense: true, cellNF: true, sheetStubs: true, cellHTML: false });
        expect(library.calls[0].input).toBe("<html><table><tr><td>00123</td></tr></table></html>");
    });

    test("a page is decoded by its byte-order mark, else as UTF-8 when every byte fits, else as Windows-1252", async () => {
        const html = (text) => `<html><body><table><tr><td>${text}</td></tr></table></body></html>`;
        const decoded = async (bytes) => {
            const library = fakeLibrary(oneSheet());
            const read = await openWorkbook(bytes, "page.xls", { library });
            return library.calls[0]?.input ?? read.refused;
        };
        const text = html("Zoë £4.50");
        // UTF-8, without and with a byte-order mark (which is not in the text)
        expect(await decoded(new Uint8Array(Buffer.from(text, "utf8")))).toBe(text);
        expect(await decoded(new Uint8Array(Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), Buffer.from(text, "utf8")])))).toBe(text);
        // UTF-16 in both orders, by its byte-order mark
        const little = Buffer.concat([Buffer.from([0xff, 0xfe]), Buffer.from(text, "utf16le")]);
        expect(await decoded(new Uint8Array(little))).toBe(text);
        const big = Buffer.concat([Buffer.from([0xfe, 0xff]), Buffer.from(Buffer.from(text, "utf16le")).swap16()]);
        expect(await decoded(new Uint8Array(big))).toBe(text);
        // Windows-1252: E9 is e acute and A3 a pound sign (not UTF-8: the library would read them as garbage)
        const old = Buffer.from(html("Zoë £4.50"), "latin1");
        expect(old.includes(0xeb)).toBe(true);
        expect(await decoded(new Uint8Array(old))).toBe(text);
        // a byte-order mark whose encoding the bytes do not fit (an odd number of bytes in UTF-16)
        const { config } = await modules();
        const odd = Buffer.concat([Buffer.from([0xff, 0xfe]), Buffer.from(html("a"), "utf16le"), Buffer.from([0x20])]);
        expect(await decoded(new Uint8Array(odd))).toBe(config.IMPORT_PAGE_UNREADABLE_REASON);
    });

    test("the real library reads a web page saved as Windows-1252 and one saved as UTF-16: the cells are what was written", async () => {
        const { cells } = await modules();
        const html = "<html><body><table><tr><td>name</td><td>price</td></tr><tr><td>Zoë Müller</td><td>£4.50</td></tr></table></body></html>";
        for (const bytes of [Buffer.from(html, "latin1"), Buffer.concat([Buffer.from([0xff, 0xfe]), Buffer.from(html, "utf16le")]), Buffer.from(html, "utf8")]) {
            const read = await openWorkbook(new Uint8Array(bytes), "prices.xls");
            expect(cells.previewRows(read.sheets[0], 0, 5)).toEqual([["name", "price"], ["Zoë Müller", "£4.50"]]);
        }
    });

    test("a web page keeps what it says as written (00123, 05/08/2023), is one sheet for each table named Table 1, Table 2, and is a page", async () => {
        const { cells } = await modules();
        const html =
            "<html><body><table><tr><td>Ref</td><td>Posted</td></tr><tr><td>00123</td><td>05/08/2023</td></tr></table>" +
            "<table><tr><td>id</td></tr><tr><td>7</td></tr></table></body></html>";
        const read = await openWorkbook(new Uint8Array(Buffer.from(html, "utf8")), "prices.xls");
        expect(read.sheets.map((s) => [s.label, s.page, s.state, s.hidden])).toEqual([
            ["Table 1", true, "ready", 0],
            ["Table 2", true, "ready", 0],
        ]);
        // (the library's invented names Sheet1, Sheet2 are kept for nothing: the label is the page's)
        expect(read.sheets.map((s) => s.name)).toEqual(["Sheet1", "Sheet2"]);
        expect(cells.previewRows(read.sheets[0], 0, 5)).toEqual([["Ref", "Posted"], ["00123", "05/08/2023"]]);
        expect(read.sheets.map((s) => cells.sheetTableName(s, "prices.xls"))).toEqual(["prices", "prices"]);
        expect(read.charts).toBe(0);
    });

    test("a web page in which the library finds no table throws, and is refused as a page", async () => {
        const { config } = await modules();
        for (const html of ["<html><body><p>no table</p></body></html>", "<html><body>Sign in</body></html>", "<table"]) {
            const read = await openWorkbook(new Uint8Array(Buffer.from(html, "utf8")), "page.xls");
            expect(read.refused, html).toBe(config.IMPORT_PAGE_UNREADABLE_REASON);
        }
    });

    test("an XML spreadsheet has its own sheet names, states and date system, and is not a page", async () => {
        const { cells } = await modules();
        const bytes = workbookBytes(
            [
                { name: "Report", rows: [["Ref", "Posted"], ["00123"]], cells: { B2: { t: "n", v: 45143, z: "yyyy-mm-dd" } } },
                { name: "Lookup", rows: [["k"], ["v"]], hidden: 1 },
            ],
            { bookType: "xlml" }
        );
        expect(Buffer.from(bytes.subarray(0, 5)).toString()).toBe("<?xml");
        const read = await openWorkbook(bytes, "report.xls");
        expect(read.kind).toBe("markup");
        expect(read.sheets.map((s) => [s.name, s.label, s.page, s.hidden])).toEqual([
            ["Report", "Report", false, 0],
            ["Lookup", "Lookup", false, 1],
        ]);
        expect(cells.previewRows(read.sheets[0], 0, 5)).toEqual([["Ref", "Posted"], ["00123", "2023-08-05"]]);
    });

    test("a sheet's state is the entry of the workbook's list with its name, not the one at its position; no entry is visible", async () => {
        const ws = worksheet([["a"], [1]]);
        const library = fakeLibrary({
            SheetNames: ["A", "B", "C", "D", "E"],
            Sheets: { A: ws, B: ws, C: ws, D: ws, E: ws },
            Workbook: {
                Sheets: [{ name: "B", Hidden: 1 }, { name: "A", Hidden: 0 }, { name: "D", Hidden: 2 }, { name: "Other", Hidden: 1 }, { name: "E", Hidden: 7 }],
            },
        });
        const read = await openWorkbook(workbookBytes([{ name: "S", rows: [["a"]] }]), "a.xlsx", { library });
        expect(read.sheets.map((s) => [s.name, s.hidden])).toEqual([["A", 0], ["B", 1], ["C", 0], ["D", 2], ["E", 0]]);
        const bare = fakeLibrary({ SheetNames: ["A"], Sheets: { A: ws } });
        expect((await openWorkbook(workbookBytes([{ name: "S", rows: [["a"]] }]), "a.xlsx", { library: bare })).sheets[0].hidden).toBe(0);
    });

    test("hidden and very hidden sheets are listed with their state, and a sheet is hidden whether or not it holds values", async () => {
        const read = await openWorkbook(
            workbookBytes([
                { name: "Visible", rows: [["a"], [1]] },
                { name: "Hidden", rows: [["b"]], hidden: 1 },
                { name: "Very hidden", rows: [["c"]], hidden: 2 },
                { name: "Hidden empty", rows: [[]], hidden: 1 },
            ]),
            "h.xlsx"
        );
        expect(read.sheets.map((s) => [s.name, s.hidden, s.state])).toEqual([
            ["Visible", 0, "ready"],
            ["Hidden", 1, "ready"],
            ["Very hidden", 2, "ready"],
            ["Hidden empty", 1, "empty"],
        ]);
    });

    test("the 1904 date system of the workbook is the one its cells are read in", async () => {
        const { cells } = await modules();
        const sheets = [{ name: "D", rows: [["when"], [0]], cells: { A2: { t: "n", v: 43681, z: "yyyy-mm-dd" } } }];
        const in1904 = await openWorkbook(workbookBytes(sheets, { date1904: true }), "d.xlsx");
        const in1900 = await openWorkbook(workbookBytes(sheets), "d.xlsx");
        expect(cells.valueAt(in1904.sheets[0], 1, 0)).toBe("2023-08-05");
        expect(cells.valueAt(in1900.sheets[0], 1, 0)).toBe("2019-08-04");
    });

    test("the first date cell of a built-in format outside the library's table has no z in the real library, and is still read as a date", async () => {
        const { cells } = await modules();
        // the writer's date format m/d/yy is the built-in 14; as the built-in 30 (an East Asian short date) the library
        // gives the first cell of it no z, and the second one its z
        const base = workbookBytes([{ name: "S", rows: [["d"], [0], [0]], cells: { A2: { t: "n", v: 45143, z: "m/d/yy" }, A3: { t: "n", v: 45144, z: "m/d/yy" } } }]);
        const edited = editZip(base, (files) => {
            files["xl/styles.xml"] = partBytes(partText(files, "xl/styles.xml").replaceAll('numFmtId="14"', 'numFmtId="30"'));
        });
        const raw = XLSX.read(edited, { type: "array", dense: true, cellNF: true, sheetStubs: true, cellHTML: false });
        expect(raw.Sheets.S["!data"][1][0].z).toBeUndefined();
        expect(raw.Sheets.S["!data"][2][0].z).toBe("m/d/yy");
        expect(() => XLSX.SSF.is_date(raw.Sheets.S["!data"][1][0].z)).toThrow();
        const read = await openWorkbook(edited, "east-asian.xlsx");
        expect([1, 2].map((row) => cells.valueAt(read.sheets[0], row, 0))).toEqual(["2023-08-05", "2023-08-06"]);
    });

    test("a formula with no stored value in an .xlsx is a stub with a formula, counted by the table, and its cell holds nothing", async () => {
        const { cells } = await modules();
        const base = workbookBytes([
            { name: "Calc", rows: [["n", "twice", "label"], [1], [2], [3]], cells: { B2: { t: "n", v: 2, f: "A2*2" }, B3: { t: "n", f: "A3*2" }, B4: { t: "n", f: "A4*2" }, C2: { t: "s", v: "x", f: 'A2&"x"' }, C3: { t: "n", f: "1+2" } } },
        ]);
        const bytes = withUncachedFormulas(base, ["B3", "B4", "C3"]);
        const raw = XLSX.read(bytes, { type: "array", dense: true, cellNF: true, sheetStubs: true, cellHTML: false });
        expect(raw.Sheets.Calc["!data"][2][1]).toMatchObject({ t: "z", f: "A3*2" });
        const read = await openWorkbook(bytes, "formulas.xlsx");
        const { table, converted } = await tableFrom(read.sheets[0]);
        expect(table.emptyFormulas).toBe(3);
        expect(converted).toEqual([[1, 2, "x"], [2, null, null], [3, null, null]]);
        expect(table.columns.map((c) => [c.type, c.blanks])).toEqual([["INTEGER", 0], ["INTEGER", 2], ["TEXT", 2]]);
        expect(cells.valueAt(read.sheets[0], 2, 1)).toBeNull();
    });

    test("a chart sheet is in the library's list of names and not in the dialog's: it is counted, and the others keep their order", async () => {
        const base = workbookBytes([{ name: "Data", rows: [["a"], [1]] }, { name: "More", rows: [["b"]] }]);
        const read = await openWorkbook(withChartSheet(base, "Orders chart"), "c.xlsx");
        expect(read.sheets.map((s) => s.name)).toEqual(["Data", "More"]);
        expect(read.charts).toBe(1);
        // the library does list it, with a !type
        const raw = XLSX.read(withChartSheet(base, "Orders chart"), { type: "array", dense: true });
        expect(raw.SheetNames).toEqual(["Data", "More", "Orders chart"]);
        expect(raw.Sheets["Orders chart"]["!type"]).toBe("chart");
    });

    test("a workbook that lists no sheet but charts has no sheet to import; one that lists no sheet at all has none either", async () => {
        const { config } = await modules();
        const chartsOnly = fakeLibrary({ SheetNames: ["C"], Sheets: { C: { "!type": "chart", "!ref": "A1" } } });
        const none = fakeLibrary({ SheetNames: [], Sheets: {} });
        const missing = fakeLibrary({ SheetNames: undefined, Sheets: undefined });
        for (const library of [chartsOnly, none, missing]) {
            const read = await openWorkbook(workbookBytes([{ name: "S", rows: [["a"]] }]), "a.xlsx", { library });
            expect(read.refused).toBe(config.IMPORT_WORKBOOK_NO_SHEETS_REASON);
        }
    });

    test("a workbook of sheets that hold nothing, or too much, or have a cell beyond Excel's bounds is listed, each with its own state", async () => {
        const { config } = await modules();
        const wide = worksheet([Array.from({ length: 2001 }, (unused, i) => i)]);
        const beyond = [[]];
        beyond[0][16384] = { t: "n", v: 1 };
        const library = fakeLibrary({
            SheetNames: ["Empty", "Wide", "Cut", "Beyond", "Fine"],
            Sheets: { Empty: worksheet([]), Wide: wide, Cut: { "!data": [], "!ref": "A1:D51" }, Beyond: { "!data": beyond, "!ref": "A1" }, Fine: worksheet([["a"], [1]]) },
        });
        const read = await openWorkbook(workbookBytes([{ name: "S", rows: [["a"]] }]), "a.xlsx", { library });
        expect(read.sheets.map((s) => [s.name, s.state])).toEqual([["Empty", "empty"], ["Wide", "wide"], ["Cut", "empty"], ["Beyond", "damaged"], ["Fine", "ready"]]);
        expect(read.refused).toBeUndefined();
        expect(config.IMPORT_WORKBOOK_NO_SHEETS_REASON).not.toBe("");
    });

    test("a sheet the library cut short inside a sound zip has a range and no cell, and is empty as any sheet with no cell is: its range decides nothing; so is a sheet part that is garbage", async () => {
        const base = workbookBytes([{ name: "Data", rows: [["id", "name"], [1, "a"], [2, "b"]] }, { name: "Second", rows: [["x"], [1]] }]);
        const cut = await openWorkbook(withSheetCutAfterData(base), "cut.xlsx");
        expect(cut.sheets.map((s) => [s.name, s.state])).toEqual([["Data", "empty"], ["Second", "ready"]]);
        // (the library gives a sheet made of garbage no range at all)
        const garbage = await openWorkbook(editZip(base, (files) => (files["xl/worksheets/sheet1.xml"] = partBytes("<worksheet><sheetData><row><c "))), "garbage.xlsx");
        expect(garbage.sheets.map((s) => [s.name, s.state])).toEqual([["Data", "empty"], ["Second", "ready"]]);
    });

    test("a sheet that the library names and leaves out makes the workbook damaged; the same for a sheet called constructor", async () => {
        const { config } = await modules();
        const base = workbookBytes([{ name: "Data", rows: [["id"], [1]] }, { name: "Other", rows: [["x"]] }]);
        expect((await openWorkbook(withMissingSheetPart(base), "missing.xlsx")).refused).toBe(config.IMPORT_WORKBOOK_DAMAGED_REASON);
        const named = workbookBytes([{ name: "constructor", rows: [["id"], [1]] }]);
        expect((await openWorkbook(withMissingSheetPart(named), "missing.xlsx")).refused).toBe(config.IMPORT_WORKBOOK_DAMAGED_REASON);
        // the library does list the name, and a plain test of the sheets object would find the object's own constructor
        const raw = XLSX.read(withMissingSheetPart(named), { type: "array", dense: true });
        expect(raw.SheetNames).toEqual(["constructor"]);
        expect("constructor" in raw.Sheets).toBe(true);
        expect(Object.hasOwn(raw.Sheets, "constructor")).toBe(false);
    });

    test("sheets called constructor, __proto__, hasOwnProperty and toString are read as sheets, each with its own cells", async () => {
        const { cells } = await modules();
        const names = ["constructor", "__proto__", "hasOwnProperty", "toString", "Plain"];
        const read = await openWorkbook(workbookBytes(names.map((name, i) => ({ name, rows: [["id"], [i + 10]] }))), "names.xlsx");
        expect(read.sheets.map((s) => s.name)).toEqual(names);
        expect(read.sheets.map((s) => s.state)).toEqual(names.map(() => "ready"));
        expect(read.sheets.map((s) => cells.valueAt(s, 1, 0))).toEqual([10, 11, 12, 13, 14]);
        // __proto__ is no key of the library's sheets: its sheet is the prototype of the object
        const raw = XLSX.read(workbookBytes([{ name: "__proto__", rows: [["id"], [5]] }]), { type: "array", dense: true });
        expect(Object.keys(raw.Sheets)).toEqual([]);
        expect(Object.getPrototypeOf(raw.Sheets)).not.toBe(Object.prototype);
    });

    test("a sheet called __proto__ that the library names and leaves out makes the workbook damaged, as any other", async () => {
        const { config } = await modules();
        const read = await openWorkbook(withMissingSheetPart(workbookBytes([{ name: "__proto__", rows: [["id"]] }])), "missing.xlsx");
        expect(read.refused).toBe(config.IMPORT_WORKBOOK_DAMAGED_REASON);
    });

    test("what the library throws is read as text, whatever it is: an Error, a TypeError, a plain string, something else", async () => {
        const { config } = await modules();
        const throwing = (thrown) => ({
            SSF: XLSX.SSF,
            read() {
                throw thrown;
            },
        });
        const bytes = workbookBytes([{ name: "S", rows: [["a"]] }]);
        const zipReason = async (thrown) => (await openWorkbook(bytes, "a.xlsx", { library: throwing(thrown) })).refused;
        // ... for a zip or an OLE2 file
        expect(await zipReason(new Error("Bad compressed size: 0 != 334"))).toBe(config.IMPORT_WORKBOOK_UNREADABLE_REASON);
        expect(await zipReason(new TypeError("Cannot set properties of undefined (setting 'name')"))).toBe(config.IMPORT_WORKBOOK_UNREADABLE_REASON);
        expect(await zipReason("XLS Record 0x208 Truncated: 13 < 16")).toBe(config.IMPORT_WORKBOOK_UNREADABLE_REASON);
        expect(await zipReason(undefined)).toBe(config.IMPORT_WORKBOOK_UNREADABLE_REASON);
        expect(await zipReason(null)).toBe(config.IMPORT_WORKBOOK_UNREADABLE_REASON);
        expect(await zipReason(42)).toBe(config.IMPORT_WORKBOOK_UNREADABLE_REASON);
        expect(await zipReason({ message: undefined })).toBe(config.IMPORT_WORKBOOK_UNREADABLE_REASON);
        // a locked workbook, however it is thrown
        expect(await zipReason(new Error("File is password-protected"))).toBe(config.IMPORT_WORKBOOK_LOCKED_REASON);
        expect(await zipReason("File is password-protected")).toBe(config.IMPORT_WORKBOOK_LOCKED_REASON);
        expect(await zipReason(new TypeError("Password is incorrect"))).toBe(config.IMPORT_WORKBOOK_LOCKED_REASON);
        // ... for a page, anything else is no table, and the library's words are never shown
        const page = new Uint8Array(Buffer.from("<html><table><tr><td>a</td></tr></table></html>"));
        for (const thrown of [new Error("Invalid HTML: could not find <table>"), new TypeError("Cannot read properties of undefined (reading '0')"), "a string"]) {
            const read = await openWorkbook(page, "page.xls", { library: throwing(thrown) });
            expect(read.refused).toBe(config.IMPORT_PAGE_UNREADABLE_REASON);
        }
        expect((await openWorkbook(page, "page.xls", { library: throwing(new Error("File is password-protected")) })).refused).toBe(config.IMPORT_WORKBOOK_LOCKED_REASON);
        for (const reason of [config.IMPORT_WORKBOOK_UNREADABLE_REASON, config.IMPORT_PAGE_UNREADABLE_REASON, config.IMPORT_WORKBOOK_LOCKED_REASON]) {
            expect(reason).not.toMatch(/Bad compressed|Truncated|Cannot set|undefined|password-protected/);
        }
    });

    test("a library that cannot be loaded refuses the tab with its own reason, and nothing of the failure is kept: the next reading goes on", async () => {
        const { text, workbook, config } = await modules();
        const bytes = workbookBytes([{ name: "S", rows: [["a"], [1]] }]);
        const file = new Blob([bytes]);
        let attempts = 0;
        const flaky = async () => {
            if (++attempts === 1) {
                throw new Error("failed to fetch");
            }
            return XLSX;
        };
        const first = await workbook.readWorkbook(file, "zip", { loadLibrary: flaky });
        expect(first).toEqual({ refused: config.IMPORT_WORKBOOK_LIBRARY_FAILED_REASON });
        const second = await workbook.readWorkbook(file, "zip", { loadLibrary: flaky });
        expect(second.sheets.map((s) => s.name)).toEqual(["S"]);
        expect(attempts).toBe(2);
        expect(text.kindByStart(bytes.subarray(0, 4096), bytes.length, "a.xlsx")).toBe("zip");
    });

    test("a file that cannot be read is refused with the reason for an unreadable file", async () => {
        const { workbook, config } = await modules();
        const broken = { size: 10, arrayBuffer: async () => Promise.reject(new Error("NotReadableError")) };
        const read = await workbook.readWorkbook(broken, "ole2", { loadLibrary: async () => XLSX });
        expect(read).toEqual({ refused: config.IMPORT_UNREADABLE_REASON });
    });

    test("the library is asked for, the bytes read, a frame awaited, and only then the one call that stops the page, in that order", async () => {
        const { workbook } = await modules();
        const log = [];
        const library = {
            SSF: XLSX.SSF,
            read() {
                log.push("read");
                return oneSheet();
            },
        };
        const file = new Blob([workbookBytes([{ name: "S", rows: [["a"]] }])]);
        const slow = { size: file.size, arrayBuffer: async () => (log.push("bytes"), file.arrayBuffer()) };
        const read = await workbook.readWorkbook(slow, "ole2", {
            loadLibrary: async () => (log.push("library"), library),
            frame: async () => void log.push("frame"),
        });
        expect(log).toEqual(["library", "bytes", "frame", "read"]);
        expect(read.sheets).toHaveLength(1);
    });

    test("a reading stops with moved when the dialog has moved on, at every look it makes, and the library is not called after that", async () => {
        const { workbook } = await modules();
        const file = new Blob([workbookBytes([{ name: "S", rows: [["a"], [1]] }])]);
        // current() answers true n times and then false. The looks are: at the start, after the library
        // is loaded, after the bytes are read, after the frame, after the one call, and after each sheet.
        const moved = [];
        const called = [];
        for (let n = 0; n < 8; n++) {
            let looks = 0;
            let reads = 0;
            const library = {
                SSF: XLSX.SSF,
                read() {
                    reads++;
                    return oneSheet();
                },
            };
            const read = await workbook.readWorkbook(file, "ole2", { loadLibrary: async () => library, current: () => ++looks <= n });
            moved.push(read.moved === true);
            called.push(reads === 1);
        }
        expect(moved).toEqual([true, true, true, true, true, true, false, false]);
        expect(called).toEqual([false, false, false, false, true, true, true, true]);
    });

    test("a rest that throws is the dialog having moved on: moved, never damaged, never a verdict on the file", async () => {
        const { workbook } = await modules();
        const base = workbookBytes([{ name: "S", rows: [["a"], [1]] }, { name: "T", rows: [["b"]] }], { compression: true });
        const file = new Blob([base]);
        const inspected = await workbook.inspectWorkbook(file, "zip");
        let calls = 0;
        let library = 0;
        const read = await workbook.readWorkbook(file, "zip", {
            directory: inspected.directory,
            loadLibrary: async () => ((library++, XLSX)),
            rest: async () => {
                if (++calls === 3) {
                    throw new Error("the page is gone");
                }
            },
        });
        expect(read).toEqual({ moved: true });
        expect(calls).toBe(3);
        // and a rest that throws after the check, between sheets, is the same
        let afterCheck = 0;
        const later = await workbook.readWorkbook(file, "zip", {
            directory: inspected.directory,
            loadLibrary: async () => XLSX,
            rest: async () => {
                if (++afterCheck > inspected.directory.entries.length) {
                    throw new Error("the page is gone");
                }
            },
        });
        expect(later).toEqual({ moved: true });
    });
});

// ---- the limits -------------------------------------------------------------------------------------

// a file that is only a size: for a kind that is no zip, nothing of it is read
const sizedFile = (size) => ({
    size,
    slice() {
        throw new Error("nothing of this file is to be read");
    },
});

// the bytes of a small zip made by fflate, whose directory is then made to say what it is told: the
// unpacked size of each part (the data is never read where only the limits are looked at)
function zipSaying(sizes) {
    const files = {};
    for (const name of Object.keys(sizes)) {
        files[name] = fflate.strToU8("x");
    }
    const bytes = new Uint8Array(fflate.zipSync(files, { level: 0 }));
    const view = new DataView(bytes.buffer);
    // the end record: the directory's start and the number of entries
    let end = bytes.length - 22;
    while (view.getUint32(end, true) !== 0x06054b50) {
        end--;
    }
    let at = view.getUint32(end + 16, true);
    for (let i = 0; i < view.getUint16(end + 10, true); i++) {
        const nameLength = view.getUint16(at + 28, true);
        const name = Buffer.from(bytes.subarray(at + 46, at + 46 + nameLength)).toString();
        view.setUint32(at + 24, sizes[name], true);
        at += 46 + nameLength + view.getUint16(at + 30, true) + view.getUint16(at + 32, true);
    }
    return bytes;
}

test.describe("the limits of a workbook: what is measured, and where the lines are", () => {
    test.beforeEach(skipUnlessFirst);

    const SHEET = "xl/worksheets/sheet1.xml";
    const BOOK = "xl/workbook.xml";
    const inspect = async (bytes) => {
        const { workbook } = await modules();
        return workbook.inspectWorkbook(new Blob([bytes]), "zip");
    };

    test("a zip is measured by the sheet data in it: exactly 100 MB goes on, one byte more asks, 300 MB is the line for the heavier question, 500 MB refuses", async () => {
        const { config } = await modules();
        // (the workbook part itself holds no data here, so that the sheet is all there is)
        const at = async (data) => inspect(zipSaying({ [BOOK]: 0, [SHEET]: data }));
        expect(await at(100 * MB - 1)).toMatchObject({ go: true });
        expect(await at(100 * MB)).toMatchObject({ go: true });
        const ask = await at(100 * MB + 1);
        // (a size is said rounded up, so that one over a limit is never said as the limit)
        expect(ask.ask).toEqual({ megabytes: 1, unpackedMegabytes: 101, heavy: false });
        expect(ask.directory.entries).toHaveLength(2);
        expect((await at(300 * MB)).ask).toEqual({ megabytes: 1, unpackedMegabytes: 300, heavy: false });
        expect((await at(300 * MB + 1)).ask).toEqual({ megabytes: 1, unpackedMegabytes: 301, heavy: true });
        expect((await at(500 * MB)).ask).toEqual({ megabytes: 1, unpackedMegabytes: 500, heavy: true });
        expect(await at(500 * MB + 1)).toEqual({ refused: config.importWorkbookTooMuchReason(501) });
        expect(await at(800 * MB)).toEqual({ refused: config.importWorkbookTooMuchReason(800) });
    });

    test("every part that holds sheet data counts, whatever its name: .xml, .rels, .bin outside the folders of pictures, printers and controls", async () => {
        const { config } = await modules();
        const counted = async (name) => (await inspect(zipSaying({ [BOOK]: 1, [name]: 101 * MB }))).ask !== undefined;
        for (const name of ["xl/worksheets/sheet1.xml", "xl/sharedStrings.xml", "xl/worksheets/_rels/sheet1.xml.rels", "xl/worksheets/sheet1.bin", "xl/styles.xml", "XL/Worksheets/Sheet1.XML", "xl/activeX/activeX1.xml", "xl/embeddings/oleObject1.xml"]) {
            expect(await counted(name), name).toBe(true);
        }
        for (const name of ["xl/media/image1.png", "xl/embeddings/oleObject1.bin", "xl/printerSettings/printerSettings1.bin", "xl/activeX/activeX1.bin", "docProps/thumbnail.jpeg", "xl/drawings/drawing1.emf"]) {
            expect(await counted(name), name).toBe(false);
        }
        expect(config.EXCEL_WARN_DATA_BYTES).toBe(100 * MB);
    });

    test("a picture of 60 MB, or of 900, costs nothing: it is not sheet data, the workbook asks nothing", async () => {
        expect(await inspect(zipSaying({ [BOOK]: 10, [SHEET]: 1000, "xl/media/image1.png": 60 * MB }))).toMatchObject({ go: true });
        expect(await inspect(zipSaying({ [BOOK]: 10, [SHEET]: 1000, "xl/media/image1.png": 900 * MB }))).toMatchObject({ go: true });
    });

    test("a picture of 60 MB made for real is not counted, and the file is checked sound", async () => {
        const { zip, workbook } = await modules();
        const bytes = editZip(workbookBytes([{ name: "S", rows: [["a"], [1]] }]), (files) => {
            files["xl/media/image1.png"] = new Uint8Array(60 * MB);
        });
        // (a zip of zeros deflates to a few kilobytes: the file is small, what it unpacks to is not)
        expect(bytes.length).toBeLessThan(MB);
        const result = await workbook.inspectWorkbook(new Blob([bytes]), "zip");
        expect(result.go).toBe(true);
        expect(result.directory.unpacked).toBeGreaterThan(60 * MB);
        expect(await zip.checkZip(bytes, result.directory.entries)).toBe(true);
    });

    test("every part counts in what a zip unpacks to in all: past 1024 MB it is refused, parsed or not; exactly 1024 MB goes on", async () => {
        const { config } = await modules();
        const exactly = await inspect(zipSaying({ [BOOK]: 0, [SHEET]: 10, "xl/media/image1.png": 1024 * MB - 10 }));
        expect(exactly).toMatchObject({ go: true });
        const refused = await inspect(zipSaying({ [BOOK]: 0, [SHEET]: 10, "xl/media/image1.png": 1024 * MB - 10 + 1 }));
        expect(refused).toEqual({ refused: config.importWorkbookTooMuchReason(1025) });
        // and the sheet data, when it is what is over, is what is said
        expect((await inspect(zipSaying({ [BOOK]: 0, [SHEET]: 600 * MB, "xl/media/image1.png": 600 * MB }))).refused).toBe(config.importWorkbookTooMuchReason(600));
        expect((await inspect(zipSaying({ [BOOK]: 1, [SHEET]: 1, "xl/media/image1.png": 1200 * MB }))).refused).toBe(config.importWorkbookTooMuchReason(1201));
    });

    test("the megabytes the question says are the file's and the sheet data's, rounded up: a size over a figure is never said as the figure", async () => {
        const result = await inspect(zipSaying({ [BOOK]: 0, [SHEET]: 310 * MB }));
        expect(result.ask).toEqual({ megabytes: 1, unpackedMegabytes: 310, heavy: true });
        const sheet = async (bytes) => (await inspect(zipSaying({ [BOOK]: 0, [SHEET]: bytes }))).ask.unpackedMegabytes;
        expect(await sheet(150 * MB)).toBe(150);
        expect(await sheet(150 * MB + 1)).toBe(151);
        expect(await sheet(Math.round(150.4 * MB))).toBe(151);
        expect(await sheet(Math.round(150.6 * MB))).toBe(151);
        // the file's own size: a workbook of a few kilobytes is not 0 MB
        expect(result.ask.megabytes).toBeGreaterThan(0);
    });

    test("what the question says of the sheets is the sheet data, not all that the zip unpacks to: a picture beside it is not counted", async () => {
        const result = await inspect(zipSaying({ [BOOK]: 0, [SHEET]: 150 * MB, "xl/media/image1.png": 400 * MB }));
        expect(result.ask).toEqual({ megabytes: 1, unpackedMegabytes: 150, heavy: false });
        // (and the picture does not make it the heavier question either: 150 MB of data is under 300 MB)
        const heavy = await inspect(zipSaying({ [BOOK]: 0, [SHEET]: 250 * MB, "xl/media/image1.png": 700 * MB }));
        expect(heavy.ask).toEqual({ megabytes: 1, unpackedMegabytes: 250, heavy: false });
    });

    test("a refusal for what the sheets unpack to says a figure that is over the limit: 500 MB and one byte is not 500 MB", async () => {
        const { config } = await modules();
        const said = (await inspect(zipSaying({ [BOOK]: 0, [SHEET]: 500 * MB + 1 }))).refused;
        expect(said).toBe(config.importWorkbookTooMuchReason(501));
        expect(said).not.toContain("500 MB");
    });

    test("the other kinds are measured by the file's size, and nothing of the file is read: over 20 MB asks, over 50 MB asks the heavier question, over 100 MB refuses", async () => {
        const { workbook, config } = await modules();
        for (const kind of ["ole2", "markup"]) {
            const at = (size) => workbook.inspectWorkbook(sizedFile(size), kind);
            expect(await at(0)).toEqual({ go: true, directory: null });
            expect(await at(20 * MB)).toEqual({ go: true, directory: null });
            expect(await at(20 * MB + 1)).toEqual({ ask: { megabytes: 21, unpackedMegabytes: null, heavy: false }, directory: null });
            expect(await at(50 * MB)).toEqual({ ask: { megabytes: 50, unpackedMegabytes: null, heavy: false }, directory: null });
            expect(await at(50 * MB + 1)).toEqual({ ask: { megabytes: 51, unpackedMegabytes: null, heavy: true }, directory: null });
            expect(await at(100 * MB)).toEqual({ ask: { megabytes: 100, unpackedMegabytes: null, heavy: true }, directory: null });
            expect(await at(100 * MB + 1)).toEqual({ refused: config.IMPORT_WORKBOOK_TOO_LARGE_REASON });
        }
    });

    test("a zip whose directory cannot be read (the Zip64 marker) is measured by its size, as an .xls is", async () => {
        const { workbook, config } = await modules();
        // a file of this size whose last bytes are a Zip64 locator and an end record that carries the marker
        // for the entry count (with `locator` false, the end record alone)
        const zip64 = (size, locator = true) => {
            const record = new Uint8Array(22);
            new DataView(record.buffer).setUint32(0, 0x06054b50, true);
            record.set([0xff, 0xff], 10);
            const tail = new Uint8Array(42);
            new DataView(tail.buffer).setUint32(0, 0x07064b50, true);
            tail.set(record, 20);
            const last = locator ? tail : record;
            return {
                size,
                slice: (from, to) => ({
                    arrayBuffer: async () => new Uint8Array(to - from).map((unused, i) => (to === size && to - from - i <= last.length ? last[last.length - (to - from - i)] : 0)).buffer,
                }),
            };
        };
        expect(await workbook.inspectWorkbook(zip64(30 * MB), "zip")).toEqual({ ask: { megabytes: 30, unpackedMegabytes: null, heavy: false }, directory: null });
        expect(await workbook.inspectWorkbook(zip64(60 * MB), "zip")).toEqual({ ask: { megabytes: 60, unpackedMegabytes: null, heavy: true }, directory: null });
        expect(await workbook.inspectWorkbook(zip64(100 * MB + 1), "zip")).toEqual({ refused: config.IMPORT_WORKBOOK_TOO_LARGE_REASON });
        expect(await workbook.inspectWorkbook(zip64(1000), "zip")).toEqual({ go: true, directory: null });
        // the same marker with no locator is no Zip64: a count of 65,535 that the directory does not hold is damage
        expect(await workbook.inspectWorkbook(zip64(30 * MB, false), "zip")).toEqual({ refused: config.IMPORT_WORKBOOK_CUT_REASON });
    });

    test("a zip that holds no workbook part is not a workbook, whatever its name says; an .xlsb has its own part, and an OpenDocument spreadsheet (content.xml) is not one", async () => {
        const { config } = await modules();
        const docx = editZip(workbookBytes([{ name: "S", rows: [["a"]] }]), (files) => {
            delete files[BOOK];
            files["word/document.xml"] = fflate.strToU8("<w:document/>");
        });
        expect(await inspect(docx)).toEqual({ refused: config.IMPORT_NOT_A_WORKBOOK_REASON });
        expect(await inspect(new Uint8Array(fflate.zipSync({ "a.txt": fflate.strToU8("hello") })))).toEqual({ refused: config.IMPORT_NOT_A_WORKBOOK_REASON });
        for (const part of ["xl/workbook.bin", "xl/workbook.xml"]) {
            expect(await inspect(new Uint8Array(fflate.zipSync({ [part]: fflate.strToU8("x") }))), part).toMatchObject({ go: true });
        }
        // (an OpenDocument spreadsheet's part: the reader does not say which of its sheets are hidden)
        expect(await inspect(new Uint8Array(fflate.zipSync({ "content.xml": fflate.strToU8("x") }))), "content.xml").toEqual({ refused: config.IMPORT_NOT_A_WORKBOOK_REASON });
        // only the name itself (in any letter case, as the reader takes it: see the test of the names): a part
        // that is called something near it is no workbook
        expect(await inspect(new Uint8Array(fflate.zipSync({ "xl/workbook.xml.bak": fflate.strToU8("x"), "xl/workbook.xmlx": fflate.strToU8("x"), "xl/workbook/xml": fflate.strToU8("x") })))).toEqual({
            refused: config.IMPORT_NOT_A_WORKBOOK_REASON,
        });
    });

    test("an OpenDocument spreadsheet written by the library is refused as not an Excel workbook, hidden sheet or not, and the reading never goes on to the library", async () => {
        const { config } = await modules();
        const sheets = [{ name: "Shown", rows: [["a", "b"], [1, 2]] }, { name: "Secret", rows: [["c"], [3]], hidden: 1 }];
        const ods = workbookBytes(sheets, { bookType: "ods" });
        // (it is a zip with a part content.xml and none of the parts of a workbook, and it is what the library reads as a workbook)
        const parts = Object.keys(fflate.unzipSync(ods));
        expect(parts).toContain("content.xml");
        expect(parts).not.toContain("xl/workbook.xml");
        expect(parts).not.toContain("xl/workbook.bin");
        expect(XLSX.read(ods, { type: "array" }).SheetNames).toEqual(["Shown", "Secret"]);
        // refused, with nothing but the reason: no question, no directory to carry on with
        expect(await inspect(ods)).toEqual({ refused: config.IMPORT_NOT_A_WORKBOOK_REASON });
        // the same under every name a student would give it, and with one sheet only
        expect(await inspect(workbookBytes([sheets[0]], { bookType: "ods" }))).toEqual({ refused: config.IMPORT_NOT_A_WORKBOOK_REASON });
        expect(await inspect(workbookBytes(sheets, { bookType: "ods", compression: true }))).toEqual({ refused: config.IMPORT_NOT_A_WORKBOOK_REASON });
        // the helper that reads a workbook as the page does (inspect, then read) stops at the refusal: it reaches no sheet
        const helper = await import(pathToFileURL(READING).href);
        expect(await helper.dumpWorkbook(ods, "book.xlsx")).toEqual({ kind: "zip", refused: config.IMPORT_NOT_A_WORKBOOK_REASON });
        // while the .xlsx and the .xlsb of the same sheets are workbooks
        for (const bookType of ["xlsx", "xlsb"]) {
            const read = await helper.dumpWorkbook(workbookBytes(sheets, { bookType }), "book.xlsx");
            expect(read.refused, bookType).toBeUndefined();
            expect(read.sheets.map(({ name, hidden }) => [name, hidden]), bookType).toEqual([["Shown", 0], ["Secret", 1]]);
        }
    });

    test("a zip that is cut short is refused as that, before anything else is looked at", async () => {
        const { config } = await modules();
        const bytes = bytesOfFixture("shopping_db.xlsx");
        expect(await inspect(bytes.subarray(0, 905))).toEqual({ refused: config.IMPORT_WORKBOOK_CUT_REASON });
        expect(await inspect(bytes.subarray(0, 4))).toEqual({ refused: config.IMPORT_WORKBOOK_CUT_REASON });
    });

    test("for a zip it reads no more than the end of the file: the last 64 KB, and the directory when that is further back", async () => {
        const { workbook } = await modules();
        const bytes = bytesOfFixture("shopping_db.xlsx");
        const asked = [];
        const file = {
            size: bytes.length,
            slice(from, to) {
                asked.push([from, to]);
                return new Blob([bytes]).slice(from, to);
            },
        };
        expect((await workbook.inspectWorkbook(file, "zip")).go).toBe(true);
        expect(asked.length).toBeGreaterThan(0);
        for (const [from, to] of asked) {
            expect(to).toBe(bytes.length);
            expect(to - from).toBeLessThanOrEqual(64 * 1024 + 22);
        }
    });
});

// ---- the zip check -------------------------------------------------------------------------------------

// the parts of a zip, found by a reader of the test's own (not the module's): where each part's
// directory entry, local header and data are, and what the directory says of it
function partsOf(bytes) {
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.length);
    let end = bytes.length - 22;
    while (view.getUint32(end, true) !== 0x06054b50) {
        end--;
    }
    let at = view.getUint32(end + 16, true);
    const list = [];
    for (let i = 0; i < view.getUint16(end + 10, true); i++) {
        const nameLength = view.getUint16(at + 28, true);
        const local = view.getUint32(at + 42, true);
        list.push({
            name: Buffer.from(bytes.subarray(at + 46, at + 46 + nameLength)).toString(),
            entry: at,
            local,
            dataAt: local + 30 + view.getUint16(local + 26, true) + view.getUint16(local + 28, true),
            method: view.getUint16(at + 10, true),
            crc: view.getUint32(at + 16, true),
            packed: view.getUint32(at + 20, true),
            unpacked: view.getUint32(at + 24, true),
        });
        at += 46 + nameLength + view.getUint16(at + 30, true) + view.getUint16(at + 32, true);
    }
    return { end, list, view };
}

// what the check says of some bytes: the directory's verdict, or true or false for the parts
async function zipVerdict(bytes, wiring = {}) {
    const { zip } = await modules();
    const directory = await zip.zipDirectory(new Blob([bytes]));
    if (directory === null) {
        return "no verdict";
    }
    if (directory.damaged) {
        return "damaged directory";
    }
    return (await zip.checkZip(bytes, directory.entries, wiring)) ? "sound" : "damaged";
}

const withBit = (bytes, at, bit = 0) => {
    const copy = new Uint8Array(bytes);
    copy[at] ^= 1 << bit;
    return copy;
};

const ZIP_FIXTURES = fixtureIndex()
    .map((entry) => entry.fixture)
    // (large.csv is not stored: a test makes it when it needs it)
    .filter((name) => fs.existsSync(fixturePath(name)))
    .filter((name) => {
        const bytes = bytesOfFixture(name);
        return bytes.length > 4 && bytes[0] === 0x50 && bytes[1] === 0x4b && bytes[2] === 3 && bytes[3] === 4 && name !== "impostors/truncated.xlsx";
    });

test.describe("the zip check: the directory, and every part against its checksum and size", () => {
    test.beforeEach(skipUnlessFirst);

    test("every zip of the owner's fixtures is sound, and its directory is what a reader of its own finds", async () => {
        const { zip } = await modules();
        expect(ZIP_FIXTURES.length).toBeGreaterThanOrEqual(12);
        for (const name of ZIP_FIXTURES) {
            const bytes = bytesOfFixture(name);
            const directory = await zip.zipDirectory(new Blob([bytes]));
            const own = partsOf(bytes);
            expect(directory.entries.map((e) => [e.name, e.method, e.crc, e.packed, e.unpacked, e.at]), name).toEqual(own.list.map((p) => [p.name, p.method, p.crc, p.packed, p.unpacked, p.local]));
            expect(directory.unpacked, name).toBe(own.list.reduce((sum, p) => sum + p.unpacked, 0));
            expect(await zipVerdict(bytes), name).toBe("sound");
        }
        const shopping = await zip.zipDirectory(new Blob([bytesOfFixture("shopping_db.xlsx")]));
        expect([shopping.entries.length, shopping.unpacked]).toEqual([21, 57087]);
        expect(shopping.entries.map((e) => e.name)).toContain("xl/workbook.xml");
    });

    test("a bit changed in the data of any part is damaged, whichever part, and whichever of three bits of its first and middle byte", async () => {
        const bytes = bytesOfFixture("shopping_db.xlsx");
        const { list } = partsOf(bytes);
        let tried = 0;
        for (const part of list) {
            if (part.packed === 0) {
                continue;
            }
            // (not the last byte: a deflated part may end in bits that mean nothing, and changing those changes nothing)
            for (const offset of [0, Math.floor(part.packed / 2)]) {
                for (const bit of [0, 3, 7]) {
                    expect(await zipVerdict(withBit(bytes, part.dataAt + offset, bit)), `${part.name} +${offset} bit ${bit}`).toBe("damaged");
                    tried++;
                }
            }
        }
        expect(tried).toBeGreaterThan(100);
    });

    test("a bit changed in a stored checksum, or in a stored size, in the directory is damaged", async () => {
        const bytes = bytesOfFixture("excel/formats.xlsx");
        const { list } = partsOf(bytes);
        for (const part of list) {
            for (const [field, width] of [[16, 4], [20, 4], [24, 4]]) {
                for (let byte = 0; byte < width; byte++) {
                    // (a size that is smaller or larger than the data's, or a checksum that is not its)
                    const verdict = await zipVerdict(withBit(bytes, part.entry + field + byte, 0));
                    expect(verdict, `${part.name} field ${field} byte ${byte}`).toMatch(/damaged/);
                }
            }
        }
    });

    test("a copy cut short anywhere is damaged: at 60, 229 and 905 bytes, and at every length of a workbook, and the library never sees it", async () => {
        const { zip, config } = await modules();
        const bytes = bytesOfFixture("shopping_db.xlsx");
        for (const length of [60, 229, 905]) {
            const library = fakeLibrary(oneSheet());
            const read = await openWorkbook(bytes.subarray(0, length), "cut.xlsx", { library });
            expect(read.refused, String(length)).toBe(config.IMPORT_WORKBOOK_CUT_REASON);
            expect(library.calls, String(length)).toHaveLength(0);
        }
        for (let length = 4; length < bytes.length; length++) {
            const directory = await zip.zipDirectory(new Blob([bytes.subarray(0, length)]));
            if (!directory?.damaged) {
                throw new Error(`a copy cut at ${length} bytes of ${bytes.length} was not seen to be cut`);
            }
        }
    });

    test("a copy that is only the first three kilobytes of a real workbook is the owner's truncated fixture: damaged, and refused as cut", async () => {
        const { config } = await modules();
        const bytes = bytesOfFixture("impostors/truncated.xlsx");
        const library = fakeLibrary(oneSheet());
        const read = await openWorkbook(bytes, "truncated.xlsx", { library });
        expect(read.refused).toBe(config.IMPORT_WORKBOOK_CUT_REASON);
        expect(library.calls).toHaveLength(0);
    });

    test("a changed workbook that the directory cannot show is damaged is refused as damaged when it is read, and the library never sees it", async () => {
        const { config } = await modules();
        const bytes = bytesOfFixture("shopping_db.xlsx");
        const sheet = partsOf(bytes).list.find((part) => part.name === "xl/worksheets/sheet2.xml");
        const library = fakeLibrary(oneSheet());
        const read = await openWorkbook(withBit(bytes, sheet.dataAt + 20, 2), "changed.xlsx", { library });
        expect(read.refused).toBe(config.IMPORT_WORKBOOK_DAMAGED_REASON);
        expect(library.calls).toHaveLength(0);
    });

    // the same zip with the Zip64 locator that a real Zip64 file has before its end record
    const withLocator = (bytes, end = partsOf(bytes).end) => {
        const locator = new Uint8Array(20);
        new DataView(locator.buffer).setUint32(0, 0x07064b50, true);
        return new Uint8Array([...bytes.subarray(0, end), ...locator, ...bytes.subarray(end)]);
    };

    // the same zip with a Zip64 extra field (id 1, 8 bytes of data) added to one entry of its directory
    const withZip64Extra = (bytes, index, { end, list } = partsOf(bytes)) => {
        const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.length);
        const part = list[index];
        const at = part.entry + 46 + view.getUint16(part.entry + 28, true);
        const extra = new Uint8Array([1, 0, 8, 0, 0, 0, 0, 0, 0, 0, 0, 0]);
        const copy = new Uint8Array([...bytes.subarray(0, at), ...extra, ...bytes.subarray(at)]);
        const out = new DataView(copy.buffer);
        out.setUint16(part.entry + 30, view.getUint16(part.entry + 30, true) + extra.length, true);
        out.setUint32(end + extra.length + 12, view.getUint32(end + 12, true) + extra.length, true);
        return copy;
    };

    test("a zip64 marker with what a Zip64 file has beside it is no verdict: the end record's count, directory size or start with the locator, a part's size or start with the Zip64 extra field", async () => {
        const bytes = bytesOfFixture("shopping_db.xlsx");
        const { end } = partsOf(bytes);
        for (const [at, width] of [[10, 2], [12, 4], [16, 4]]) {
            const copy = new Uint8Array(bytes);
            copy.fill(0xff, end + at, end + at + width);
            expect(await zipVerdict(withLocator(copy, end)), `end record +${at}`).toBe("no verdict");
        }
        const parts = partsOf(bytes);
        const { list } = parts;
        for (const field of [20, 24, 42]) {
            const copy = new Uint8Array(bytes);
            copy.fill(0xff, list[3].entry + field, list[3].entry + field + 4);
            expect(await zipVerdict(withZip64Extra(copy, 3, parts)), `entry +${field}`).toBe("no verdict");
        }
        // (the helpers themselves change nothing: a zip with a locator, or with the extra field, and no marker, is as sound as before)
        expect(await zipVerdict(withLocator(bytes))).toBe("sound");
        expect(await zipVerdict(withZip64Extra(bytes, 3))).toBe("sound");
    });

    test("a marker of all ones with nothing of Zip64 beside it is damage, not Zip64: the library takes such a size at its word and runs out of memory", async () => {
        const bytes = bytesOfFixture("shopping_db.xlsx");
        const { end, list } = partsOf(bytes);
        for (const [at, width] of [[10, 2], [12, 4], [16, 4]]) {
            const copy = new Uint8Array(bytes);
            copy.fill(0xff, end + at, end + at + width);
            expect(await zipVerdict(copy), `end record +${at}`).toBe("damaged directory");
        }
        for (const field of [20, 24, 42]) {
            const copy = new Uint8Array(bytes);
            copy.fill(0xff, list[3].entry + field, list[3].entry + field + 4);
            expect(await zipVerdict(copy), `entry +${field}`).toBe("damaged directory");
        }
        // and a workbook with such a size is refused before the library sees it
        const { config, workbook } = await modules();
        const copy = new Uint8Array(bytes);
        copy.fill(0xff, list[3].entry + 24, list[3].entry + 28);
        const inspected = await workbook.inspectWorkbook(new Blob([copy]), "zip");
        expect(inspected).toEqual({ refused: config.IMPORT_WORKBOOK_CUT_REASON });
    });

    test("a part kept with the deflate method and no data at all is an empty part, sound: a writer may leave out the empty block", async () => {
        const bytes = new Uint8Array(fflate.zipSync({ "empty.txt": new Uint8Array(0), "b.txt": fflate.strToU8("hello") }, { level: 0 }));
        expect(await zipVerdict(bytes)).toBe("sound");
        const { list } = partsOf(bytes);
        const part = list.find((p) => p.name === "empty.txt");
        expect([part.method, part.packed, part.unpacked, part.crc]).toEqual([0, 0, 0, 0]);
        // (method 8 in the local header and in the directory)
        const copy = new Uint8Array(bytes);
        new DataView(copy.buffer).setUint16(part.local + 8, 8, true);
        new DataView(copy.buffer).setUint16(part.entry + 10, 8, true);
        expect(await zipVerdict(copy)).toBe("sound");
        // an empty deflated part that says it unpacks to something is not sound
        new DataView(copy.buffer).setUint32(part.entry + 24, 5, true);
        expect(await zipVerdict(copy)).toBe("damaged");
    });

    test("the check rests when exactly 4 MB of a part have been worked on, and not before: a stored part of 4 MB rests once inside, one byte less does not", async () => {
        const { zip } = await modules();
        const restsFor = async (size) => {
            const bytes = new Uint8Array(fflate.zipSync({ "a.bin": new Uint8Array(size) }, { level: 0 }));
            const directory = await zip.zipDirectory(new Blob([bytes]));
            let rests = 0;
            expect(await zip.checkZip(bytes, directory.entries, { rest: async () => rests++ })).toBe(true);
            return rests;
        };
        // (one rest before the part, and one for each 4 MB inside it)
        expect(await restsFor(4 * MB - 1)).toBe(1);
        expect(await restsFor(4 * MB)).toBe(2);
        expect(await restsFor(8 * MB)).toBe(3);
    });

    test("a directory out of place, a count that disagrees, an entry that is no entry, an archive in parts, and a comment that does not fit are damaged", async () => {
        const bytes = bytesOfFixture("shopping_db.xlsx");
        const { end, list } = partsOf(bytes);
        const view = (copy) => new DataView(copy.buffer);
        const edits = {
            "the directory starts after the end record": (copy) => view(copy).setUint32(end + 16, bytes.length, true),
            "the directory's size runs into the end record": (copy) => view(copy).setUint32(end + 12, view(copy).getUint32(end + 12, true) + 1, true),
            "one entry fewer than there are": (copy) => (view(copy).setUint16(end + 10, 20, true), view(copy).setUint16(end + 8, 20, true)),
            "one entry more than there are": (copy) => (view(copy).setUint16(end + 10, 22, true), view(copy).setUint16(end + 8, 22, true)),
            "an entry's signature changed": (copy) => (copy[list[2].entry] ^= 1),
            "entries on this disk differ from all": (copy) => view(copy).setUint16(end + 8, 20, true),
            "a number of this disk": (copy) => view(copy).setUint16(end + 4, 1, true),
            "the disk the directory starts on": (copy) => view(copy).setUint16(end + 6, 1, true),
            "a comment longer than the file": (copy) => view(copy).setUint16(end + 20, 9, true),
        };
        for (const [what, edit] of Object.entries(edits)) {
            const copy = new Uint8Array(bytes);
            edit(copy);
            expect(await zipVerdict(copy), what).toBe("damaged directory");
        }
    });

    test("a comment that holds the signature of an end record whose own comment cannot fit does not hide the real one", async () => {
        const bytes = bytesOfFixture("excel/formats.xlsx");
        const { end } = partsOf(bytes);
        const fake = new Uint8Array(22);
        new DataView(fake.buffer).setUint32(0, 0x06054b50, true);
        fake.set([0xff, 0xff, 0xff, 0xff], 12);
        // (a comment of 65,535 bytes: more than is left of the file)
        fake.set([0xff, 0xff], 20);
        const comment = new Uint8Array([...Buffer.from("a note "), ...fake, ...Buffer.from(" and more")]);
        const copy = new Uint8Array(bytes.length + comment.length);
        copy.set(bytes);
        copy.set(comment, bytes.length);
        new DataView(copy.buffer).setUint16(end + 20, comment.length, true);
        expect(await zipVerdict(copy)).toBe("sound");
    });

    test("a directory longer than the tail that is read first is read from where the end record says it starts", async () => {
        const { zip } = await modules();
        const files = { "xl/workbook.xml": fflate.strToU8("<workbook/>") };
        for (let i = 0; i < 1500; i++) {
            files[`xl/worksheets/sheet-with-a-long-name-to-fill-the-directory-${String(i).padStart(5, "0")}.xml`] = fflate.strToU8(`<sheet n="${i}"/>`);
        }
        const bytes = new Uint8Array(fflate.zipSync(files, { level: 0 }));
        const { end, view } = partsOf(bytes);
        expect(view.getUint32(end + 12, true)).toBeGreaterThan(64 * 1024 + 22);
        const asked = [];
        const file = {
            size: bytes.length,
            slice(from, to) {
                asked.push(to - from);
                return new Blob([bytes]).slice(from, to);
            },
        };
        const directory = await zip.zipDirectory(file);
        expect(directory.entries).toHaveLength(1501);
        expect(directory.entries.at(-1).name).toBe("xl/worksheets/sheet-with-a-long-name-to-fill-the-directory-01499.xml");
        expect(directory.unpacked).toBe(24401);
        // the tail, then the directory
        expect(asked).toHaveLength(2);
        expect(asked[0]).toBe(64 * 1024 + 22);
        expect(await zip.checkZip(bytes, directory.entries)).toBe(true);
    });

    test("a part that is stored must be as large packed as unpacked; its local header must say the method the directory says", async () => {
        const stored = new Uint8Array(fflate.zipSync({ "a.txt": fflate.strToU8("hello world, hello world") }, { level: 0 }));
        expect(await zipVerdict(stored)).toBe("sound");
        const { list, view } = partsOf(stored);
        const sizeChanged = new Uint8Array(stored);
        new DataView(sizeChanged.buffer).setUint32(list[0].entry + 24, list[0].unpacked + 1, true);
        expect(await zipVerdict(sizeChanged)).toBe("damaged");
        const methodChanged = new Uint8Array(stored);
        new DataView(methodChanged.buffer).setUint16(list[0].local + 8, 8, true);
        expect(await zipVerdict(methodChanged)).toBe("damaged");
        const signature = new Uint8Array(stored);
        signature[list[0].local] ^= 1;
        expect(await zipVerdict(signature)).toBe("damaged");
        // a part that runs past the end of the file
        const runs = new Uint8Array(stored);
        new DataView(runs.buffer).setUint32(list[0].entry + 20, 1000, true);
        expect(await zipVerdict(runs)).toBe("damaged");
        expect(view.getUint32(list[0].entry + 24, true)).toBe(24);
    });

    test("a part that is encrypted, or of a method the browser does not know, is left to the library: no verdict, so no refusal from here", async () => {
        const bytes = new Uint8Array(fflate.zipSync({ "a.txt": fflate.strToU8("hello world, hello world"), "b.txt": fflate.strToU8("second part") }, { level: 0 }));
        const { list } = partsOf(bytes);
        // data that is wrong, but a part that cannot be checked from here
        const encrypted = withBit(bytes, list[0].dataAt, 1);
        new DataView(encrypted.buffer).setUint16(list[0].entry + 8, 1, true);
        expect(await zipVerdict(encrypted)).toBe("sound");
        const odd = withBit(bytes, list[0].dataAt, 1);
        new DataView(odd.buffer).setUint16(list[0].entry + 10, 14, true);
        new DataView(odd.buffer).setUint16(list[0].local + 8, 14, true);
        expect(await zipVerdict(odd)).toBe("sound");
        // the others are still looked at
        const second = withBit(encrypted, list[1].dataAt, 1);
        expect(await zipVerdict(second)).toBe("damaged");
    });

    test("a deflated part that is cut, or is not deflate data at all, or unpacks to another size, is damaged", async () => {
        const text = fflate.strToU8("hello world, hello world, hello world ".repeat(200));
        const bytes = new Uint8Array(fflate.zipSync({ "a.xml": text }, { level: 6 }));
        const { list } = partsOf(bytes);
        expect(list[0].method).toBe(8);
        expect(await zipVerdict(bytes)).toBe("sound");
        // the directory says the part has fewer bytes than it has (it is cut: the data runs out)
        const cut = new Uint8Array(bytes);
        new DataView(cut.buffer).setUint32(list[0].entry + 20, list[0].packed - 3, true);
        expect(await zipVerdict(cut)).toBe("damaged");
        // not deflate data
        const noise = new Uint8Array(bytes);
        noise.fill(0xff, list[0].dataAt, list[0].dataAt + list[0].packed);
        expect(await zipVerdict(noise)).toBe("damaged");
        // another unpacked size, either way
        for (const delta of [-1, 1]) {
            const size = new Uint8Array(bytes);
            new DataView(size.buffer).setUint32(list[0].entry + 24, list[0].unpacked + delta, true);
            expect(await zipVerdict(size), String(delta)).toBe("damaged");
        }
        // a part of nothing is sound, stored or deflated
        const nothing = new Uint8Array(fflate.zipSync({ "a.xml": new Uint8Array(0), "b.xml": fflate.strToU8("x") }));
        expect(await zipVerdict(nothing)).toBe("sound");
    });

    test("a part is let go of as soon as it gives more bytes than the directory says: a zip that claims 1000 bytes and holds 20 MB costs one turn", async () => {
        const bytes = new Uint8Array(fflate.zipSync({ "a.bin": new Uint8Array(20 * MB) }, { level: 6 }));
        const { list } = partsOf(bytes);
        expect(list[0].method).toBe(8);
        new DataView(bytes.buffer).setUint32(list[0].entry + 24, 1000, true);
        let rests = 0;
        expect(await zipVerdict(bytes, { rest: async () => void rests++ })).toBe("damaged");
        // the rest before the part, and none for the megabytes after the first thousand bytes
        expect(rests).toBe(1);
    });

    test("rest is awaited between two parts and after every few megabytes within a part, stored or deflated", async () => {
        const small = new Uint8Array(fflate.zipSync({ "a.txt": fflate.strToU8("a"), "b.txt": fflate.strToU8("b"), "c.txt": fflate.strToU8("c") }));
        let rests = 0;
        expect(await zipVerdict(small, { rest: async () => void rests++ })).toBe("sound");
        expect(rests).toBe(3);
        for (const level of [0, 6]) {
            const big = new Uint8Array(fflate.zipSync({ "a.bin": new Uint8Array(20 * MB) }, { level }));
            let inside = 0;
            expect(await zipVerdict(big, { rest: async () => void inside++ }), `level ${level}`).toBe("sound");
            // one before the part, and about one for each four megabytes of it (20 MB: four or five)
            expect(inside, `level ${level}`).toBeGreaterThanOrEqual(5);
            expect(inside, `level ${level}`).toBeLessThanOrEqual(7);
        }
    });

    test("a rest that throws stops the check and is thrown from it, between parts and inside one, with no rejection left without a taker", async () => {
        const { zip } = await modules();
        const unhandled = [];
        const listener = (reason) => unhandled.push(reason);
        process.on("unhandledRejection", listener);
        try {
            for (const level of [0, 6]) {
                const bytes = new Uint8Array(fflate.zipSync({ "a.bin": new Uint8Array(20 * MB), "b.txt": fflate.strToU8("b") }, { level }));
                const directory = await zip.zipDirectory(new Blob([bytes]));
                for (const failAt of [1, 2, 3]) {
                    let calls = 0;
                    await expect(
                        zip.checkZip(bytes, directory.entries, {
                            rest: async () => {
                                if (++calls === failAt) {
                                    throw new Error(`gone at ${failAt}`);
                                }
                            },
                        }),
                        `level ${level} at ${failAt}`
                    ).rejects.toThrow(`gone at ${failAt}`);
                    expect(calls).toBe(failAt);
                }
            }
            // a turn of the event loop or two, for a rejection nobody took to be reported
            await new Promise((resolve) => setImmediate(resolve));
            await new Promise((resolve) => setImmediate(resolve));
            expect(unhandled).toEqual([]);
        } finally {
            process.off("unhandledRejection", listener);
        }
    });

    test("the stream reader of a deflated part is cancelled whenever the check stops with it: when it is done, when it gives too much, when a rest throws", async () => {
        const { zip } = await modules();
        const prototype = ReadableStreamDefaultReader.prototype;
        const real = prototype.cancel;
        let cancelled = 0;
        prototype.cancel = function (...args) {
            cancelled++;
            return real.apply(this, args);
        };
        try {
            const bytes = new Uint8Array(fflate.zipSync({ "a.bin": new Uint8Array(20 * MB) }, { level: 6 }));
            const { list } = partsOf(bytes);
            const whole = (await zip.zipDirectory(new Blob([bytes]))).entries;
            expect(await zip.checkZip(bytes, whole)).toBe(true);
            expect(cancelled).toBe(1);
            const claims = whole.map((entry) => ({ ...entry, unpacked: 1000 }));
            expect(list).toHaveLength(1);
            expect(await zip.checkZip(bytes, claims)).toBe(false);
            expect(cancelled).toBe(2);
            let calls = 0;
            await expect(
                zip.checkZip(bytes, whole, {
                    rest: async () => {
                        if (++calls === 2) {
                            throw new Error("gone");
                        }
                    },
                })
            ).rejects.toThrow("gone");
            expect(cancelled).toBe(3);
        } finally {
            prototype.cancel = real;
        }
    });

    test("where the browser cannot inflate raw deflate data, nothing is checked and every part is let through", async () => {
        const { zip } = await modules();
        const bytes = new Uint8Array(fflate.zipSync({ "a.xml": fflate.strToU8("hello ".repeat(100)) }));
        const damaged = withBit(bytes, partsOf(bytes).list[0].dataAt + 2, 3);
        expect(await zipVerdict(damaged)).toBe("damaged");
        expect(zip.canUnpack()).toBe(true);
        const real = globalThis.DecompressionStream;
        try {
            globalThis.DecompressionStream = undefined;
            expect(zip.canUnpack()).toBe(false);
            expect(await zipVerdict(damaged)).toBe("sound");
            globalThis.DecompressionStream = class {
                constructor(format) {
                    throw new TypeError(`unsupported ${format}`);
                }
            };
            expect(zip.canUnpack()).toBe(false);
            expect(await zipVerdict(damaged)).toBe("sound");
            // the directory is still looked at
            expect(await zipVerdict(damaged.subarray(0, 40))).toBe("damaged directory");
        } finally {
            globalThis.DecompressionStream = real;
        }
        expect(zip.canUnpack()).toBe(true);
    });

    test("the CRC-32 is the table's step: the check value of 123456789, in pieces or whole, and of nothing", async () => {
        const { zip } = await modules();
        const bytes = Buffer.from("123456789");
        expect(zip.crcOf(zip.crc32(bytes))).toBe(0xcbf43926);
        expect(zip.crcOf(zip.crc32(bytes.subarray(5), zip.crc32(bytes.subarray(0, 5))))).toBe(0xcbf43926);
        expect(zip.crcOf(zip.CRC_START)).toBe(0);
        expect(zip.crcOf(zip.crc32(Buffer.from("The quick brown fox jumps over the lazy dog")))).toBe(0x414fa339);
        expect(zip.crcOf(zip.crc32(new Uint8Array(1000)))).toBe(0x060b1780);
    });
});

// ---- the owner's workbooks and impostors ---------------------------------------------------------------

// tests/aw5-excel-reading.mjs reads every workbook and impostor of expected/index.json through the three
// modules, in a child process with the time zone given (the machine's own when none)
function readFixtures(zone) {
    return new Promise((resolve, reject) => {
        const env = { ...process.env, NODE_NO_WARNINGS: "1" };
        if (zone) {
            env.TZ = zone;
        }
        execFile(process.execPath, [READING], { env, maxBuffer: 1 << 28 }, (error, stdout, stderr) => (error ? reject(new Error(`${error.message}\n${stderr}`)) : resolve(JSON.parse(stdout))));
    });
}

const readings = new Map();
const readingIn = (zone = "") => {
    if (!readings.has(zone)) {
        readings.set(zone, readFixtures(zone));
    }
    return readings.get(zone);
};

const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const show = (value) => JSON.stringify(value)?.slice(0, 120);

// what a table of a reading differs in from a table of an expected file: its rows, its columns (name,
// type, nulls, original, report example) and every cell. [] when there is no difference.
function tableDifferences(got, want, label) {
    const problems = [];
    if (got.rows !== want.rows) {
        problems.push(`${label}: ${got.rows} rows, expected ${want.rows}`);
    }
    if (got.columns.length !== want.columns.length) {
        problems.push(`${label}: ${got.columns.length} columns, expected ${want.columns.length}`);
        return problems;
    }
    want.columns.forEach((column, i) => {
        const have = got.columns[i];
        const mine = {
            name: have.name,
            type: have.type,
            nulls: have.blanks,
            ...(have.original !== null && have.original !== have.name ? { original: have.original } : {}),
            ...(have.blocking !== null ? { report_example: have.blocking } : {}),
        };
        const theirs = { name: column.name, type: column.type, nulls: column.nulls, ...("original" in column ? { original: column.original } : {}), ...("report_example" in column ? { report_example: column.report_example } : {}) };
        if (!same(mine, theirs)) {
            problems.push(`${label}: column ${i + 1} is ${show(mine)}, expected ${show(theirs)}`);
        }
    });
    if (got.data.length !== want.data.length) {
        problems.push(`${label}: ${got.data.length} rows of data, expected ${want.data.length}`);
    }
    want.data.forEach((row, r) =>
        row.forEach((value, c) => {
            const mine = got.data[r]?.[c];
            if (mine !== value && problems.length < 6) {
                problems.push(`${label}: row ${r + 1}, ${want.columns[c].name}: ${show(mine)}, expected ${show(value)}`);
            }
        })
    );
    return problems;
}

// a workbook's reading against its expected file: the sheets in order, state, importable, ticked by
// default (visible and importable), the chart sheets, the names of the tables, the tables, and the
// table that a sheet with a header row gives when its box says so
function workbookDifferences(got, want) {
    if (got.refused) {
        return [`refused: ${got.refused}`];
    }
    const problems = [];
    const states = ["visible", "hidden", "veryHidden"];
    if (got.charts !== want.chart_sheets_not_listed.length) {
        problems.push(`${got.charts} chart sheets left out, expected ${want.chart_sheets_not_listed.length}`);
    }
    if (!same(got.sheets.map((s) => s.name), want.sheets.map((s) => s.sheet))) {
        problems.push(`sheets ${show(got.sheets.map((s) => s.name))}, expected ${show(want.sheets.map((s) => s.sheet))}`);
        return problems;
    }
    want.sheets.forEach((sheet, i) => {
        const have = got.sheets[i];
        const label = `sheet ${sheet.sheet}`;
        if (states[have.hidden] !== sheet.state) {
            problems.push(`${label}: ${states[have.hidden]}, expected ${sheet.state}`);
        }
        const importable = have.state === "ready";
        if (importable !== sheet.importable) {
            problems.push(`${label}: importable ${importable}, expected ${sheet.importable}`);
        }
        if ((importable && have.hidden === 0) !== sheet.ticked_by_default) {
            problems.push(`${label}: ticked by default ${importable && have.hidden === 0}, expected ${sheet.ticked_by_default}`);
        }
        if (!sheet.table) {
            if (have.table) {
                problems.push(`${label}: a table, expected none`);
            }
            return;
        }
        if (have.tableName !== sheet.table.name) {
            problems.push(`${label}: the table is called ${have.tableName}, expected ${sheet.table.name}`);
        }
        problems.push(...tableDifferences(have.table, sheet.table, label));
        const alt = sheet.table_if_header_row_can_be_chosen;
        if (alt) {
            problems.push(...(have.alt ? tableDifferences(have.alt, alt, `${label} with names on row ${alt.header_row}`) : [`${label}: no table with names on row ${alt.header_row}`]));
        } else if (have.alt) {
            problems.push(`${label}: a second table, expected none`);
        }
    });
    return problems;
}

// an impostor read by what it is: its one table, named after the sheet or the file
function contentDifferences(got, want) {
    if (got.refused) {
        return [`refused: ${got.refused}`];
    }
    const problems = [];
    const real = got.kind === "markup" ? (got.sheets[0].page ? "html" : "spreadsheetml") : "xlsx";
    if (real !== want.real_content) {
        problems.push(`read as ${real}, expected ${want.real_content}`);
    }
    if (got.sheets.length !== want.tables_if_read_by_content.length) {
        problems.push(`${got.sheets.length} tables, expected ${want.tables_if_read_by_content.length}`);
        return problems;
    }
    want.tables_if_read_by_content.forEach((table, i) => {
        if (got.sheets[i].tableName !== table.name) {
            problems.push(`the table is called ${got.sheets[i].tableName}, expected ${table.name}`);
        }
        problems.push(...tableDifferences(got.sheets[i].table, table, `table ${table.name}`));
    });
    return problems;
}

const INDEX = fixtureIndex().map((entry) => ({ entry, name: entry.fixture, want: expectedOf(entry) }));
const WORKBOOKS = INDEX.filter(({ want }) => want.sheets);
const IMPOSTORS = INDEX.filter(({ name }) => name.startsWith("impostors/"));

// the kind that the first bytes of each file make it, as the plan's "Where it starts" says
const KINDS = {
    "shopping_db.xlsx": "zip",
    "excel/shopping_db.xls": "ole2",
    "excel/messy_course_workbook.xlsx": "zip",
    "excel/messy_course_workbook.xls": "ole2",
    "excel/title_rows_and_layouts.xlsx": "zip",
    "excel/hidden.xlsx": "zip",
    "excel/formulas.xlsx": "zip",
    "excel/formulas_uncached.xlsx": "zip",
    "excel/formats.xlsx": "zip",
    "excel/formats.xls": "ole2",
    "excel/dates_1904.xlsx": "zip",
    "excel/sheet_names.xlsx": "zip",
    "excel/empty_sheets.xlsx": "zip",
    "excel/chart_sheet.xlsx": "zip",
    "excel/xlwt_written.xls": "ole2",
    "impostors/html_table.xls": "markup",
    "impostors/spreadsheetml_2003.xls": "markup",
    "impostors/renamed_xlsx.csv": "zip",
    "impostors/truncated.xlsx": "zip",
    "impostors/password_protected.xlsx": "ole2",
    // text: Phase 2's, and never read as a workbook
    "impostors/tab_text.xls": "text",
    "impostors/renamed_csv.xlsx": "text",
    "impostors/random_bytes.xls": "text",
    "impostors/zero_bytes.xlsx": "empty",
};

test.describe("the owner's workbooks, read through the three modules, give their expected files", () => {
    test.beforeEach(skipUnlessFirst);

    test("every workbook and impostor of the index is one of those this group knows, and the group knows no other", () => {
        const names = new Set([...WORKBOOKS, ...IMPOSTORS].map(({ name }) => name));
        expect([...names].sort()).toEqual(Object.keys(KINDS).sort());
        expect(WORKBOOKS).toHaveLength(15);
        expect(IMPOSTORS).toHaveLength(9);
    });

    for (const { name, want } of WORKBOOKS) {
        test(`${name}: the sheets, their states, the names and columns and types and nulls and every cell are those of its expected file`, async () => {
            const got = (await readingIn())[name];
            expect(got.kind).toBe(KINDS[name]);
            expect(workbookDifferences(got, want)).toEqual([]);
        });
    }

    for (const { name, want } of IMPOSTORS.filter(({ want }) => want.outcome === "import_by_content_or_refuse" && want.real_content !== "text")) {
        test(`${name}: read by what it is, and not by its name, it gives its one table`, async () => {
            const got = (await readingIn())[name];
            expect(got.kind).toBe(KINDS[name]);
            expect(contentDifferences(got, want)).toEqual([]);
        });
    }

    test("the impostors that are text never reach the workbook modules: tab_text.xls and renamed_csv.xlsx are text by their first bytes", async () => {
        const all = await readingIn();
        for (const name of ["impostors/tab_text.xls", "impostors/renamed_csv.xlsx"]) {
            expect(all[name].kind, name).toBe("text");
            expect(all[name].sheets, name).toBeUndefined();
        }
    });

    test("the four that must be refused are refused, each in its own way: empty and not text by their first bytes, cut and locked by the modules", async () => {
        const { config } = await modules();
        const all = await readingIn();
        expect(all["impostors/zero_bytes.xlsx"]).toEqual({ kind: "empty", hasZero: false });
        // a zero byte and no UTF-16 byte-order mark: the plan's test 5 says it is not text
        expect(all["impostors/random_bytes.xls"]).toEqual({ kind: "text", hasZero: true });
        expect(all["impostors/truncated.xlsx"]).toEqual({ kind: "zip", refused: config.IMPORT_WORKBOOK_CUT_REASON });
        expect(all["impostors/password_protected.xlsx"]).toEqual({ kind: "ole2", refused: config.IMPORT_WORKBOOK_LOCKED_REASON });
        for (const name of ["impostors/zero_bytes.xlsx", "impostors/random_bytes.xls", "impostors/truncated.xlsx", "impostors/password_protected.xlsx"]) {
            expect(IMPOSTORS.find((impostor) => impostor.name === name).want.outcome, name).toBe("refuse");
        }
    });

    test("the plan's 'Done when': shopping_db.xlsx is four tables, and OrderDate of the first row of orders is 2023-08-05", async () => {
        for (const name of ["shopping_db.xlsx", "excel/shopping_db.xls"]) {
            const got = (await readingIn())[name];
            expect(got.sheets.map((s) => s.tableName), name).toEqual(["customers", "orders", "products", "quantities"]);
            const orders = got.sheets[1].table;
            expect(orders.columns.map((c) => c.name)).toEqual(["OrderID", "OrderDate", "CustomerID", "Total"]);
            expect(orders.columns.map((c) => c.type)).toEqual(["TEXT", "TEXT", "TEXT", "REAL"]);
            expect(orders.data[0]).toEqual(["OR138884", "2023-08-05", "ID0005", 1500.4]);
        }
    });

    test("the plan's 'Done when': the column with the leading-zero format of formats.xlsx and formats.xls is named, with 00123 as Excel showed it", async () => {
        const all = await readingIn();
        for (const name of ["excel/formats.xlsx", "excel/formats.xls"]) {
            const formats = all[name].sheets[0];
            expect(formats.name).toBe("Formats");
            expect(formats.table.padded, name).toEqual([{ column: "LeadingZeroFormat", example: "00123", number: 123 }]);
            expect(formats.table.columns[7]).toMatchObject({ name: "LeadingZeroFormat", type: "INTEGER" });
        }
    });

    test("the plan's 'Done when': formula cells that came out empty are 10 in formulas_uncached.xlsx, 3 in xlwt_written.xls, 4 in formulas.xlsx, and none anywhere else", async () => {
        const all = await readingIn();
        const counts = {};
        const padded = {};
        for (const { name } of WORKBOOKS) {
            for (const sheet of all[name].sheets) {
                if (sheet.table) {
                    counts[`${name}|${sheet.name}`] = sheet.table.emptyFormulas;
                    if (sheet.table.padded.length) {
                        padded[`${name}|${sheet.name}`] = sheet.table.padded.map((p) => p.column);
                    }
                }
            }
        }
        const nonzero = Object.fromEntries(Object.entries(counts).filter(([, count]) => count !== 0));
        expect(nonzero).toEqual({ "excel/formulas_uncached.xlsx|Calc": 10, "excel/xlwt_written.xls|Data": 3, "excel/formulas.xlsx|Calc": 4 });
        // and the one zero-padded column of all the fixtures is in the two formats files
        expect(padded).toEqual({ "excel/formats.xlsx|Formats": ["LeadingZeroFormat"], "excel/formats.xls|Formats": ["LeadingZeroFormat"] });
    });

    test("hidden rows and columns are imported like any other: hidden.xlsx has 10 rows and 4 columns on its visible sheet, and messy's hidden column is read", async () => {
        const all = await readingIn();
        const visible = all["excel/hidden.xlsx"].sheets[0];
        expect([visible.table.rows, visible.table.columns.length]).toEqual([10, 4]);
        const sales = all["excel/messy_course_workbook.xlsx"].sheets[1];
        // (column I is hidden in the workbook: with the names on row 4 it is Margin_, a REAL column)
        expect(sales.table.columns).toHaveLength(9);
        expect(sales.alt.columns[8]).toMatchObject({ name: "Margin_", type: "REAL", original: "Margin %" });
    });

    test("a sheet's table name does not change as sheets are ticked: every ready sheet takes its name, hidden ones too, in the workbook's order", async () => {
        const all = await readingIn();
        expect(all["excel/sheet_names.xlsx"].sheets.map((s) => s.tableName)).toEqual([
            "Sales_2024",
            "Sales_2024_2",
            "c_2024",
            "Order",
            "Donn_es",
            "Q1_final_",
            "a_very_long_sheet_name_31_chars",
            "_data",
            "sales_2024_3",
        ]);
        expect(all["excel/empty_sheets.xlsx"].sheets.map((s) => [s.name, s.state, s.tableName])).toEqual([
            ["Data", "ready", "Data"],
            ["Empty", "empty", null],
            ["Header only", "ready", "Header_only"],
            ["Formatting only", "empty", null],
            ["Single cell", "ready", "Single_cell"],
            ["Stray cell", "ready", "Stray_cell"],
        ]);
        expect(all["excel/chart_sheet.xlsx"].charts).toBe(1);
        expect(all["excel/chart_sheet.xlsx"].sheets.map((s) => s.name)).toEqual(["Data"]);
    });

    // Every .xlsx of the owner's written again as a binary workbook (an .xlsb) by the library, and read by the same
    // modules, gives what the .xlsx gives. The library's writer keeps no formula for a cell that has no value, so the
    // count of formula cells that came out empty is the one thing left out of the comparison (the .xlsx says 4 and
    // 10 for the two workbooks of formulas, the .xlsb 0); it also writes a chart sheet as an empty worksheet (it
    // knows no chart), which the reader lists as a sheet with no values, so for that workbook the sheets the .xlsx
    // lists are compared and the chart sheet must come back as an empty one.
    const XLSX_FIXTURES = ["shopping_db.xlsx", ...WORKBOOKS.map(({ name }) => name).filter((name) => name.startsWith("excel/") && name.endsWith(".xlsx"))];

    test("the .xlsx workbooks of the owner's are the eleven this test writes again as .xlsb", () => {
        expect(XLSX_FIXTURES).toHaveLength(11);
        expect(new Set(XLSX_FIXTURES).size).toBe(11);
    });

    for (const name of XLSX_FIXTURES) {
        test(`${name} written again as an .xlsb gives the same sheets, tables, columns and cells as the .xlsx (the count of formulas that came out empty, and a chart sheet that the writer makes a worksheet, apart)`, async () => {
            const helper = await import(pathToFileURL(READING).href);
            const original = bytesOfFixture(name);
            const base = await helper.dumpWorkbook(original, path.basename(name));
            expect(base.refused, "the .xlsx is read").toBeUndefined();
            // (what the page's reader does with the file: styles and number formats kept, then written as a binary workbook)
            const book = XLSX.read(original, { type: "array", cellNF: true, cellStyles: true });
            const binary = new Uint8Array(XLSX.write(book, { bookType: "xlsb", type: "buffer" }));
            const parts = Object.keys(fflate.unzipSync(binary));
            expect(parts).toContain("xl/workbook.bin");
            expect(parts).not.toContain("xl/workbook.xml");
            const made = await helper.dumpWorkbook(binary, path.basename(name));
            expect(made.refused, "the .xlsb is read").toBeUndefined();
            expect(made.kind).toBe(base.kind);
            // the chart sheets that the .xlsx leaves out are empty sheets in the .xlsb, written at the end
            const extra = made.sheets.length - base.sheets.length;
            expect(extra, "sheets the writer added").toBe(base.charts);
            for (const sheet of made.sheets.slice(base.sheets.length)) {
                expect(sheet.state, `${sheet.name}: a chart sheet written as a worksheet`).toBe("empty");
            }
            const compared = (dump, count) => ({
                ...dump,
                charts: 0,
                sheets: dump.sheets.slice(0, count).map((sheet) => {
                    if (!sheet.table) {
                        return sheet;
                    }
                    const { emptyFormulas, ...table } = sheet.table;
                    return { ...sheet, table };
                }),
            });
            expect(compared(made, base.sheets.length)).toEqual(compared(base, base.sheets.length));
            // what is left out is the one count, and the .xlsb never says more than the .xlsx
            base.sheets.forEach((sheet, i) => {
                if (sheet.table) {
                    expect(made.sheets[i].table.emptyFormulas, `${sheet.name}: formulas that came out empty`).toBeLessThanOrEqual(sheet.table.emptyFormulas);
                }
            });
            // and there is something to compare: a sheet that holds cells
            expect(base.sheets.some((sheet) => sheet.table?.data.length > 0)).toBe(true);
        });
    }

    test("numbers of 1e19 and 6.02e23 are read as they are, in a REAL column, and as full digits where a column is TEXT", async () => {
        const formats = (await readingIn())["excel/formats.xlsx"].sheets[0].table;
        const column = (name) => formats.columns.findIndex((c) => c.name === name);
        expect(formats.columns[column("Scientific")].type).toBe("REAL");
        expect(formats.data.map((row) => row[column("Scientific")])).toEqual([12345.678, 0.00012, 6.02e23, 1, 250, 3.5e-9]);
        expect(formats.columns[column("BigNumber")].type).toBe("REAL");
        expect(formats.data[0][column("BigNumber")]).toBe(1.234567890123457e19);
    });
});

// ---- other time zones ------------------------------------------------------------------------------------

test.describe("the same reading in other time zones", () => {
    test.beforeEach(skipUnlessFirst);

    // Zones with an offset that is a half or three quarters of an hour, one that skipped a day (Samoa, 30
    // December 2011) and one a day ahead of the rest (Kiritimati): a calendar that used the computer's
    // would be a day out in some of them.
    for (const zone of ["UTC", "Pacific/Apia", "Pacific/Kiritimati", "America/Los_Angeles", "Asia/Kathmandu", "Pacific/Auckland", "America/Sao_Paulo", "Europe/London"]) {
        test(`with TZ=${zone}, every workbook and impostor gives its expected file`, async () => {
            const all = await readingIn(zone);
            for (const { name, want } of WORKBOOKS) {
                expect(workbookDifferences(all[name], want), name).toEqual([]);
            }
            for (const { name, want } of IMPOSTORS.filter(({ want }) => want.outcome === "import_by_content_or_refuse" && want.real_content !== "text")) {
                expect(contentDifferences(all[name], want), name).toEqual([]);
            }
        });
    }

    test("the library's own date code is a day out in two of these zones, and the app's calendar, run in the same zone, is not", async () => {
        // (why the app has a calendar of its own)
        const script = () => `
            const XLSX = require(${JSON.stringify(path.join(__dirname, "..", "vendor", "xlsx.full.min.js"))});
            const at = (serial) => { const d = XLSX.SSF.parse_date_code(serial); return d.y + "-" + d.m + "-" + d.d; };
            import(${JSON.stringify(pathToFileURL(path.join(__dirname, "..", "js", "lab", "import-cells.js")).href)}).then((cells) => {
                process.stdout.write(JSON.stringify([at(40907), at(34699), cells.serialText(40907), cells.serialText(34699)]));
            });`;
        const inZone = (zone) =>
            new Promise((resolve, reject) => {
                execFile(process.execPath, ["-e", script()], { env: { ...process.env, TZ: zone, NODE_NO_WARNINGS: "1" } }, (error, stdout) => (error ? reject(error) : resolve(JSON.parse(stdout))));
            });
        // 40907 is 2011-12-30, a day Samoa did not have; 34699 is 1994-12-31, a day Kiritimati did not have
        const apia = await inZone("Pacific/Apia");
        expect([apia[0], apia[2]]).toEqual(["2011-12-31", "2011-12-30"]);
        const kiritimati = await inZone("Pacific/Kiritimati");
        expect([kiritimati[1], kiritimati[3]]).toEqual(["1995-1-1", "1994-12-31"]);
    });
});

// ---- copies with one bit changed ---------------------------------------------------------------------------

// The library trusts what it is given: on some changed or cut copies of a workbook it never returns (a
// page that never answers again), on others it reads something other than what the file held, with no
// error. So the library runs here in a worker thread under a time limit, and only on a copy that the
// zip check has passed. The check itself runs in the test's own process, which never hands the library
// a copy that the check refuses.
const WORKER_SOURCE = `
const { parentPort, workerData } = require("node:worker_threads");
const crypto = require("node:crypto");
let helper = null;
parentPort.on("message", async ({ id, bytes }) => {
    try {
        helper ??= await import(workerData.helper);
        const dump = await helper.dumpWorkbook(bytes, "copy.xlsx");
        parentPort.postMessage({ id, refused: dump.refused ?? null, states: dump.sheets ? dump.sheets.map((sheet) => sheet.state) : null, digest: crypto.createHash("sha256").update(JSON.stringify(dump)).digest("hex") });
    } catch (error) {
        parentPort.postMessage({ id, thrown: String(error?.message ?? error) });
    }
});
`;

class TimedReader {
    constructor() {
        this.id = 0;
        this.start();
    }

    start() {
        this.worker = new Worker(WORKER_SOURCE, { eval: true, workerData: { helper: pathToFileURL(READING).href } });
        this.worker.on("error", () => {});
    }

    // the answer for these bytes, or {timeout: true} when none came in `limit` ms (the worker is then stopped and replaced)
    run(bytes, limit) {
        const id = ++this.id;
        return new Promise((resolve) => {
            const timer = setTimeout(() => {
                this.worker.off("message", onMessage);
                this.worker.terminate();
                this.start();
                resolve({ timeout: true });
            }, limit);
            const onMessage = (message) => {
                if (message.id === id) {
                    clearTimeout(timer);
                    this.worker.off("message", onMessage);
                    resolve(message);
                }
            };
            this.worker.on("message", onMessage);
            this.worker.postMessage({ id, bytes });
        });
    }

    close() {
        return this.worker.terminate();
    }
}

test.describe("copies of a workbook with one bit changed", () => {
    test.beforeEach(skipUnlessFirst);

    test("every copy that the check passes is read as the original was or is refused, never differently and never for ever; the check refuses the rest", async () => {
        test.setTimeout(180_000);
        const { text, zip, workbook, config } = await modules();
        const bytes = bytesOfFixture("shopping_db.xlsx");
        const reader = new TimedReader();
        try {
            const original = await reader.run(bytes, 30_000);
            expect(original.timeout).toBeUndefined();
            expect(original.refused).toBeNull();
            const next = seeded(20261118);
            const tally = { copies: 0, notAZip: 0, refusedBeforeRead: 0, refusedByCheck: 0, same: 0, refusedAfter: 0 };
            const trouble = [];
            for (let i = 0; i < 300; i++) {
                const at = Math.floor(next() * bytes.length);
                const bit = Math.floor(next() * 8);
                const copy = withBit(bytes, at, bit);
                tally.copies++;
                if (text.kindByStart(copy.subarray(0, text.HEAD_BYTES), copy.length, "copy.xlsx") !== "zip") {
                    tally.notAZip++;
                    continue;
                }
                const inspected = await workbook.inspectWorkbook(new Blob([copy]), "zip");
                if (inspected.refused) {
                    tally.refusedBeforeRead++;
                    continue;
                }
                if (inspected.directory && !(await zip.checkZip(copy, inspected.directory.entries))) {
                    tally.refusedByCheck++;
                    continue;
                }
                // the check passed: the library may read it, away from this process, and for as long as the first read of the original was given
                const got = await reader.run(copy, 30_000);
                if (got.timeout) {
                    trouble.push(`byte ${at} bit ${bit}: the library did not return`);
                } else if (got.thrown) {
                    trouble.push(`byte ${at} bit ${bit}: threw ${got.thrown}`);
                } else if (got.refused) {
                    // a copy the library reads into a sheet it names and leaves out is damaged, and says so
                    if (![config.IMPORT_WORKBOOK_DAMAGED_REASON, config.IMPORT_WORKBOOK_UNREADABLE_REASON].includes(got.refused)) {
                        trouble.push(`byte ${at} bit ${bit}: refused as ${got.refused}`);
                    }
                    tally.refusedAfter++;
                } else if (got.digest === original.digest) {
                    tally.same++;
                } else {
                    trouble.push(`byte ${at} bit ${bit}: read differently from the original`);
                }
            }
            expect(trouble).toEqual([]);
            // the sample is not empty of what it is meant to hold
            expect(tally.copies).toBe(300);
            expect(tally.refusedByCheck).toBeGreaterThan(50);
            expect(tally.same).toBeGreaterThan(20);
        } finally {
            await reader.close();
        }
    });

    test("a cut copy and a changed one that the check refuses are never handed to the library by the page's own steps", async () => {
        const bytes = bytesOfFixture("shopping_db.xlsx");
        const library = fakeLibrary(oneSheet());
        const { config } = await modules();
        const { list } = partsOf(bytes);
        // (a bit in the data of three parts, and one in a stored checksum)
        const copies = [bytes.subarray(0, 1000), ...[2, 7, 12].map((i) => withBit(bytes, list[i].dataAt + 3, 1)), withBit(bytes, list[5].entry + 16, 2)];
        for (const copy of copies) {
            const read = await openWorkbook(copy, "copy.xlsx", { library });
            expect([config.IMPORT_WORKBOOK_CUT_REASON, config.IMPORT_WORKBOOK_DAMAGED_REASON]).toContain(read.refused);
        }
        expect(library.calls).toHaveLength(0);
    });
});

// ---- a workbook that is small and asks for much: what the file says is not taken at its word ------------------

// The library gives a sheet whose only cell is at row 4,000,000,000 as a list of rows that long (a few
// bytes of file), and a merge may name a million rows. What the modules do with such a sheet costs what the
// sheet holds, never what it names: the first block of tests runs them in a worker thread under a limit
// (a module that walked the list would not return), the others count what is done.

// a workbook of one sheet "S" holding "a" and the number 1, with `inject` put in its sheet's rows
const withRows = (inject) => editZip(workbookBytes([{ name: "S", rows: [["a"], [1]] }]), (files) => {
    const part = "xl/worksheets/sheet1.xml";
    files[part] = partBytes(partText(files, part).replace("</sheetData>", `${inject}</sheetData>`));
});
// an XML spreadsheet of one sheet
const spreadsheet = (rowsXml) =>
    new Uint8Array(
        Buffer.from(
            `<?xml version="1.0"?><Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet" xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet"><Worksheet ss:Name="S"><Table>${rowsXml}</Table></Worksheet></Workbook>`
        )
    );
const number = (index) => `<Cell${index}><Data ss:Type="Number">1</Data></Cell>`;

test.describe("a cell where no sheet has one makes a damaged sheet, at once", () => {
    test.beforeEach(skipUnlessFirst);

    test("a cell at a row or a column of billions: the sheet is damaged and the reading returns, for a workbook and for an XML spreadsheet", async () => {
        test.setTimeout(240_000);
        const cases = {
            "xlsx, a cell at row 1,000,000,000": withRows('<row r="1000000000"><c r="A1000000000" t="n"><v>1</v></c></row>'),
            "xlsx, a cell at row 4,000,000,000": withRows('<row r="4000000000"><c r="A4000000000" t="n"><v>1</v></c></row>'),
            "xlsx, a cell at row 4,294,967,294": withRows('<row r="4294967294"><c r="A4294967294" t="n"><v>1</v></c></row>'),
            "xlsx, a cell at column ZZZZZZ (321 million)": withRows('<row r="3"><c r="ZZZZZZ3" t="n"><v>1</v></c></row>'),
            "xlsx, a cell at row 1,048,577 (one past Excel's last)": withRows('<row r="1048577"><c r="A1048577" t="n"><v>1</v></c></row>'),
            "xlsx, a cell at column XFE (one past Excel's last)": withRows('<row r="3"><c r="XFE3" t="n"><v>1</v></c></row>'),
            "XML spreadsheet, a row with index 4,000,000,000": spreadsheet(`<Row>${number("")}</Row><Row ss:Index="4000000000">${number("")}</Row>`),
            "XML spreadsheet, a cell with index 4,000,000,000": spreadsheet(`<Row>${number(' ss:Index="4000000000"')}</Row>`),
        };
        const reader = new TimedReader();
        try {
            for (const [what, bytes] of Object.entries(cases)) {
                // (30 seconds: the answer comes in milliseconds, and a loop over billions of places never)
                const got = await reader.run(bytes, 30_000);
                expect(got.timeout, what).toBeUndefined();
                expect(got.thrown, what).toBeUndefined();
                expect(got.refused, what).toBeNull();
                expect(got.states, what).toEqual(["damaged"]);
            }
        } finally {
            await reader.close();
        }
    });

    test("the last cell of a sheet of Excel's size is not beyond it: row 1,048,576 and column XFD are read as they are", async () => {
        const { cells } = await modules();
        const read = await openWorkbook(withRows('<row r="1048576"><c r="XFD1048576" t="n"><v>7</v></c></row>'), "last.xlsx");
        expect(read.sheets[0].state).toBe("wide");
        const alone = await openWorkbook(withRows('<row r="1048576"><c r="A1048576" t="n"><v>7</v></c></row>'), "last.xlsx");
        expect([alone.sheets[0].state, alone.sheets[0].rows, alone.sheets[0].start]).toEqual(["ready", 1048576, "A1"]);
        expect(cells.valueAt(alone.sheets[0], 1048575, 0)).toBe(7);
    });
});

test.describe("a row of cells is walked by the places that hold a cell, never by its length", () => {
    test.beforeEach(skipUnlessFirst);

    // A row that counts the reads of its places and of its length (Array.isArray is true of a Proxy over an array, and
    // the library's own rows are arrays). What is counted is work, not time: a row of ten cells and one at column 16,383
    // is a list of 16,384 places, and a walk by number reads each of them.
    function counting(row, tally) {
        return new Proxy(row, {
            get(target, key, receiver) {
                if (key === "length") {
                    tally.lengths++;
                } else if (typeof key === "string" && /^\d+$/.test(key)) {
                    tally.reads++;
                }
                return Reflect.get(target, key, receiver);
            },
            has(target, key) {
                if (typeof key === "string" && /^\d+$/.test(key)) {
                    tally.reads++;
                }
                return Reflect.has(target, key);
            },
        });
    }

    const cell = (v) => ({ t: "n", v, w: String(v), z: "General" });

    // rows of `cells` cells in a row, and one more at column `far` (none when far is null), each row counted
    function sheetOfRows(rows, cells, far) {
        const tally = { reads: 0, lengths: 0 };
        const data = [];
        for (let r = 0; r < rows; r++) {
            const row = [];
            for (let c = 0; c < cells; c++) {
                row[c] = cell(r * 1000 + c);
            }
            if (far !== null) {
                row[far] = cell(-1);
            }
            data[r] = counting(row, tally);
        }
        return { ws: { "!data": data, "!ref": "A1" }, tally };
    }

    test("rows of ten cells and one at column 16,383 cost a few reads each, not sixteen thousand; the sheet is as wide as its values are", async () => {
        const { cells } = await modules();
        const { ws, tally } = sheetOfRows(300, 10, 16383);
        const sheet = cells.readSheet(ws, { name: "S", ssf: XLSX.SSF });
        expect([sheet.state, sheet.rows, sheet.columns, sheet.start]).toEqual(["wide", 300, 16384, "A1"]);
        // (11 cells a row; the walk reads each of them once, and no place that holds nothing)
        expect(tally.reads).toBeLessThanOrEqual(300 * 11 * 2);
        expect(tally.lengths).toBe(0);
    });

    test("the same under the limit of columns: a cell at column 1,500 is a table of 1,501 columns, and each row is read for the cells it holds", async () => {
        const { cells } = await modules();
        const { ws, tally } = sheetOfRows(300, 10, 1500);
        const sheet = cells.readSheet(ws, { name: "S", ssf: XLSX.SSF });
        expect([sheet.state, sheet.rows, sheet.columns]).toEqual(["ready", 300, 1501]);
        expect(tally.reads).toBeLessThanOrEqual(300 * 11 * 2);
        expect(tally.lengths).toBe(0);
        expect(cells.valueAt(sheet, 299, 1500)).toBe(-1);
        expect(cells.valueAt(sheet, 299, 9)).toBe(299009);
        expect(cells.valueAt(sheet, 299, 10)).toBeNull();
    });

    test("a full row of 2,000 cells is read whole, once for each cell, and a row that has its cells made in any order gives the same sheet", async () => {
        const { cells } = await modules();
        const { ws, tally } = sheetOfRows(5, 2000, null);
        const sheet = cells.readSheet(ws, { name: "S", ssf: XLSX.SSF });
        expect([sheet.state, sheet.rows, sheet.columns]).toEqual(["ready", 5, 2000]);
        expect(tally.reads).toBeLessThanOrEqual(5 * 2000 * 2);
        // cells put in from the right to the left sit in the same places
        const backwards = [];
        for (let c = 9; c >= 0; c--) {
            backwards[c] = cell(c);
        }
        const other = cells.readSheet({ "!data": [backwards], "!ref": "A1" }, { name: "S", ssf: XLSX.SSF });
        expect([other.state, other.rows, other.columns, other.start]).toEqual(["ready", 1, 10, "A1"]);
        // (the rectangle of a row whose first cell is far in: the places that hold a cell, in order)
        const late = [];
        late[7] = cell(7);
        late[3] = cell(3);
        const third = cells.readSheet({ "!data": [late], "!ref": "A1" }, { name: "S", ssf: XLSX.SSF });
        expect([third.rows, third.columns, third.start]).toEqual([1, 5, "D1"]);
    });

    test("a key at the limit of columns, or past it, makes the sheet damaged, in a row that is long and in one that is not", async () => {
        const { cells } = await modules();
        for (const at of [16384, 16385, 100000, 4294967294]) {
            const row = [cell(1)];
            row[at] = cell(2);
            const sheet = cells.readSheet({ "!data": [row], "!ref": "A1" }, { name: "S", ssf: XLSX.SSF });
            expect(sheet.state, String(at)).toBe("damaged");
        }
        const last = [cell(1)];
        last[16383] = cell(2);
        expect(cells.readSheet({ "!data": [last], "!ref": "A1" }, { name: "S", ssf: XLSX.SSF }).state).toBe("wide");
        // a name that is no place of the list is no cell: a property on the row is not read as one
        const marked = [cell(1)];
        marked["01"] = cell(2);
        marked.extra = cell(3);
        const sheet = cells.readSheet({ "!data": [marked], "!ref": "A1" }, { name: "S", ssf: XLSX.SSF });
        expect([sheet.state, sheet.rows, sheet.columns]).toEqual(["ready", 1, 1]);
    });
});

test.describe("merged cells cost what the merges are, not what they cover", () => {
    test.beforeEach(skipUnlessFirst);

    const block = (from, to) => ({ s: { r: from[0], c: from[1] }, e: { r: to[0], c: to[1] } });

    // the work that building a sheet does, counted (a list or a map made for each row a merge covers would show)
    function counting(run) {
        const push = Array.prototype.push;
        const set = Map.prototype.set;
        let work = 0;
        Array.prototype.push = function (...items) {
            work += items.length;
            return push.apply(this, items);
        };
        Map.prototype.set = function (key, value) {
            work++;
            return set.call(this, key, value);
        };
        try {
            return { result: run(), work: () => work };
        } finally {
            Array.prototype.push = push;
            Map.prototype.set = set;
        }
    }

    test("many merges of a million rows over a sheet of two cells a million rows apart cost no more than the merges and the cells", async () => {
        const { cells } = await modules();
        const merges = Array.from({ length: 1000 }, (unused, i) => block([0, i % 3], [1048575, (i % 3) + 1]));
        const data = [];
        data[0] = [{ t: "s", v: "top" }];
        data[1048575] = [{ t: "s", v: "bottom" }];
        data.length = 1048576;
        const done = counting(() => cells.readSheet({ "!data": data, "!ref": "A1:A1048576", "!merges": merges }, { name: "S", ssf: XLSX.SSF }));
        // (the work counted is each list and each map entry made: the merges once, the cells once; a million for each merge before)
        expect(done.work()).toBeLessThan(10_000);
        // (the blocks cover the columns A to B, B to C and C to D from the first row to the last: the two cells are in column A,
        // and the first row's is the top left cell of the blocks that start in A, so it is kept)
        expect(done.result.state).toBe("ready");
        expect([done.result.rows, done.result.columns, done.result.start]).toEqual([1, 1, "A1"]);
    });

    test("the cells a block covers are blanked, whichever way the blocks lie: against a plain check of every block, for blocks chosen by a seed", async () => {
        const { cells } = await modules();
        const next = seeded(20261118);
        const rowsCount = 30;
        const columnsCount = 12;
        for (let round = 0; round < 40; round++) {
            const merges = [];
            for (let i = 0, n = 1 + Math.floor(next() * 12); i < n; i++) {
                const r = Math.floor(next() * rowsCount);
                const c = Math.floor(next() * columnsCount);
                merges.push(block([r, c], [Math.min(rowsCount + 3, r + Math.floor(next() * 9)), Math.min(columnsCount + 2, c + Math.floor(next() * 5))]));
            }
            const away = (r, c) => merges.some((m) => (m.e.r > m.s.r || m.e.c > m.s.c) && r >= m.s.r && r <= m.e.r && c >= m.s.c && c <= m.e.c && !(r === m.s.r && c === m.s.c));
            const rows = Array.from({ length: rowsCount }, (unused, r) => Array.from({ length: columnsCount }, (u, c) => r * 100 + c));
            const sheet = await sheetOf(rows, { extra: { "!merges": merges } });
            const kept = [];
            for (let r = 0; r < rowsCount; r++) {
                for (let c = 0; c < columnsCount; c++) {
                    if (!away(r, c)) {
                        kept.push([r, c]);
                    }
                }
            }
            const top = Math.min(...kept.map(([r]) => r));
            const left = Math.min(...kept.map(([, c]) => c));
            expect([sheet.rows, sheet.columns, sheet.start], `round ${round}`).toEqual([Math.max(...kept.map(([r]) => r)) - top + 1, Math.max(...kept.map(([, c]) => c)) - left + 1, `${"ABCDEFGHIJKLMNOP"[left]}${top + 1}`]);
            for (let r = 0; r < sheet.rows; r++) {
                for (let c = 0; c < sheet.columns; c++) {
                    const want = away(top + r, left + c) ? null : (top + r) * 100 + left + c;
                    expect(cells.valueAt(sheet, r, c), `round ${round} (${top + r}, ${left + c})`).toBe(want);
                }
            }
        }
    });
});

test.describe("a format that the library left out of a cell is looked for once, in a list made once, and for a few cells only", () => {
    test.beforeEach(skipUnlessFirst);

    test("20,000 numbers with no format of their own and a shown text that no format gives: the formatter is asked a bounded number of times, however often the cells are read", async () => {
        const { cells, config } = await modules();
        let tables = 0;
        let formats = 0;
        const ssf = {
            get_table: () => (tables++, XLSX.SSF.get_table()),
            format: (...args) => (formats++, XLSX.SSF.format(...args)),
        };
        const count = 20_000;
        const rows = [["x"], ...Array.from({ length: count }, (unused, i) => [{ t: "n", v: i + 0.5, w: "shown" }])];
        const sheet = cells.readSheet(worksheet(rows), { name: "S", ssf });
        const table = await cells.tableOf(sheet, {});
        const askedByTable = formats;
        const stored = [];
        for (let i = 0; i < table.rows; i++) {
            stored.push(cells.storedRow(table, i)[0]);
        }
        expect(table.rows).toBe(count);
        expect(table.columns[0].type).toBe("REAL");
        expect(stored[0]).toBe(0.5);
        expect(stored[count - 1]).toBe(count - 0.5);
        expect(tables).toBeLessThanOrEqual(1);
        // (a search tries each format of the library's table, some sixty: it is made for a thousand cells at most)
        expect(askedByTable).toBeLessThan(1000 * 100);
        // and what a cell was found to have is kept: reading the rows again asks nothing more
        expect(formats).toBe(askedByTable);
        expect(config.IMPORT_SHEET_CELLS).toBe(30000);
    });

    test("a cell with no format that does have a shown text some format gives is found one, and the answer is kept for the cell", async () => {
        const { cells } = await modules();
        let formats = 0;
        const ssf = { get_table: () => XLSX.SSF.get_table(), format: (...args) => (formats++, XLSX.SSF.format(...args)) };
        const cell = { t: "n", v: 0.25, w: "25.0%" };
        const context = { date1904: false, ssf, formats: new Map() };
        expect(cells.cellValue(cell, context)).toBe(0.25);
        const first = formats;
        expect(first).toBeGreaterThan(0);
        expect(cells.cellValue(cell, context)).toBe(0.25);
        expect(formats).toBe(first);
    });
});

test.describe("a number that is not a number: the library gives NaN and Infinity for what it cannot read or hold", () => {
    test.beforeEach(skipUnlessFirst);

    const valueOfCell = async (cell) => {
        const { cells } = await modules();
        return cells.cellValue(cell, { date1904: false, ssf: XLSX.SSF, formats: new Map() });
    };

    test("a number that is not finite is an error and gives its text; with no text it is no value", async () => {
        expect(await valueOfCell({ t: "n", v: NaN, w: "#NUM!" })).toBe("#NUM!");
        expect(await valueOfCell({ t: "n", v: Infinity, w: "#DIV/0!" })).toBe("#DIV/0!");
        expect(await valueOfCell({ t: "n", v: -Infinity, w: "#DIV/0!" })).toBe("#DIV/0!");
        expect(await valueOfCell({ t: "n", v: NaN })).toBeNull();
        expect(await valueOfCell({ t: "n", v: Infinity, w: "" })).toBeNull();
        // (a finite number is as before)
        expect(await valueOfCell({ t: "n", v: 5, z: "General", w: "5" })).toBe(5);
        const none = await sheetOf([[{ t: "n", v: NaN }]]);
        expect(none.state).toBe("empty");
    });

    test("through the library: 1e999 and a number that is not one are the library's own error texts in the table, never NaN or Infinity", async () => {
        const bytes = editZip(workbookBytes([{ name: "S", rows: [["x"], [1], [2], [3]] }]), (files) => {
            const part = "xl/worksheets/sheet1.xml";
            files[part] = partBytes(partText(files, part).replace("<v>1</v>", "<v>1e999</v>").replace("<v>2</v>", "<v>abc</v>").replace("<v>3</v>", "<v>-1e999</v>"));
        });
        const read = await openWorkbook(bytes, "bad.xlsx");
        const { stored, types } = await tableFrom(read.sheets[0]);
        expect(stored.map((row) => row[0])).toEqual(["#DIV/0!", "#NUM!", "#DIV/0!"]);
        expect(types).toEqual(["TEXT"]);
    });
});

test.describe("what is asked of a file or a workbook that cannot be read, or that is read with no check made first", () => {
    test.beforeEach(skipUnlessFirst);

    test("inspecting a zip that cannot be read is refused as unreadable, not thrown: a slice that rejects, and one that throws", async () => {
        const { workbook, config } = await modules();
        const rejecting = { size: 100_000, slice: () => ({ arrayBuffer: () => Promise.reject(new DOMException("changed", "NotReadableError")) }) };
        const throwing = {
            size: 100_000,
            slice() {
                throw new DOMException("gone", "NotFoundError");
            },
        };
        expect(await workbook.inspectWorkbook(rejecting, "zip")).toEqual({ refused: config.IMPORT_UNREADABLE_REASON });
        expect(await workbook.inspectWorkbook(throwing, "zip")).toEqual({ refused: config.IMPORT_UNREADABLE_REASON });
    });

    test("a zip read with no directory given is checked all the same: a cut one and a changed one are refused and the library never sees them; null is the one way to skip the check", async () => {
        const { workbook, config } = await modules();
        const bytes = bytesOfFixture("shopping_db.xlsx");
        const sheet = partsOf(bytes).list.find((part) => part.name === "xl/worksheets/sheet2.xml");
        const readWith = async (copy, wiring) => {
            const library = fakeLibrary(oneSheet());
            const result = await workbook.readWorkbook(new Blob([copy]), "zip", { loadLibrary: async () => library, ...wiring });
            return { result, library };
        };
        const cut = await readWith(bytes.subarray(0, 905), {});
        expect(cut.result.refused).toBe(config.IMPORT_WORKBOOK_CUT_REASON);
        expect(cut.library.calls).toHaveLength(0);
        const changed = await readWith(withBit(bytes, sheet.dataAt + 20, 2), {});
        expect(changed.result.refused).toBe(config.IMPORT_WORKBOOK_DAMAGED_REASON);
        expect(changed.library.calls).toHaveLength(0);
        const sound = await readWith(bytes, {});
        expect(sound.result.sheets).toHaveLength(1);
        expect(sound.library.calls).toHaveLength(1);
        // null: the directory is not one that can be read (Zip64), and nothing is checked
        const unchecked = await readWith(withBit(bytes, sheet.dataAt + 20, 2), { directory: null });
        expect(unchecked.library.calls).toHaveLength(1);
    });

    test("the state of a sheet is looked up once for each sheet, not by a search of the list for each: 3,000 sheets read the list's names a few thousand times, not millions", async () => {
        const { workbook } = await modules();
        const count = 3000;
        let reads = 0;
        const entries = Array.from({ length: count }, (unused, i) => ({
            get name() {
                reads++;
                return `S${i}`;
            },
            Hidden: i % 3 === 0 ? 1 : 0,
        }));
        const ws = worksheet([["a"], [1]]);
        const names = entries.map((unused, i) => `S${i}`);
        const library = fakeLibrary({ SheetNames: names, Sheets: Object.fromEntries(names.map((name) => [name, ws])), Workbook: { Sheets: entries } });
        const read = await workbook.readWorkbook(new Blob([new Uint8Array(8)]), "ole2", { loadLibrary: async () => library });
        expect(read.sheets).toHaveLength(count);
        expect(read.sheets.slice(0, 4).map((s) => s.hidden)).toEqual([1, 0, 0, 1]);
        expect(reads).toBeLessThanOrEqual(count * 2);
        // the first entry of a name is the one that counts, as a search of the list gave it
        const twice = fakeLibrary({ SheetNames: ["A"], Sheets: { A: ws }, Workbook: { Sheets: [{ name: "A", Hidden: 2 }, { name: "A", Hidden: 0 }] } });
        expect((await workbook.readWorkbook(new Blob([new Uint8Array(8)]), "ole2", { loadLibrary: async () => twice })).sheets[0].hidden).toBe(2);
    });
});

test.describe("the names of the parts of a zip are taken as the reader takes them: any letter case, a backslash for a slash, a slash at the start", () => {
    test.beforeEach(skipUnlessFirst);

    const rewrites = {
        "a slash at the start of each name": (name) => `/${name}`,
        "backslashes for slashes": (name) => name.replaceAll("/", "\\"),
        "the case of a name changed": (name) => name.replace("xl/workbook.xml", "xl/Workbook.xml"),
        "every name in upper case": (name) => name.toUpperCase(),
    };

    test("shopping_db.xlsx zipped again under each of these names is a workbook, read as the original is, and the library reads it", async () => {
        const original = bytesOfFixture("shopping_db.xlsx");
        const want = await openWorkbook(original, "shopping_db.xlsx");
        expect(want.sheets.map((sheet) => sheet.name)).toEqual(["customers", "orders", "products", "quantities"]);
        const files = fflate.unzipSync(original);
        for (const [what, rewrite] of Object.entries(rewrites)) {
            const renamed = new Uint8Array(fflate.zipSync(Object.fromEntries(Object.entries(files).map(([name, data]) => [rewrite(name), data]))));
            const read = await openWorkbook(renamed, "again.xlsx");
            expect(read.refused, what).toBeUndefined();
            expect(read.sheets.map((sheet) => sheet.name), what).toEqual(want.sheets.map((sheet) => sheet.name));
            expect(read.sheets.map((sheet) => [sheet.state, sheet.rows, sheet.columns]), what).toEqual(want.sheets.map((sheet) => [sheet.state, sheet.rows, sheet.columns]));
        }
    });

    test("the folders of pictures, printers and controls, and the parts that hold sheet data, are found under these names too", async () => {
        const { config } = await modules();
        const inspect = async (bytes) => (await modules()).workbook.inspectWorkbook(new Blob([bytes]), "zip");
        const asks = async (sizes) => (await inspect(zipSaying(sizes))).ask !== undefined;
        for (const [what, rewrite] of Object.entries(rewrites)) {
            const at = (name) => rewrite(name);
            expect(await asks({ [at("xl/workbook.xml")]: 1, [at("xl/worksheets/sheet1.xml")]: 101 * MB }), `${what}: a sheet counts`).toBe(true);
            expect(await asks({ [at("xl/workbook.xml")]: 1, [at("xl/embeddings/oleObject1.bin")]: 101 * MB }), `${what}: an embedded file does not`).toBe(false);
            expect(await asks({ [at("xl/workbook.xml")]: 1, [at("xl/printerSettings/printerSettings1.bin")]: 101 * MB }), `${what}: printer settings do not`).toBe(false);
            expect(await asks({ [at("xl/workbook.xml")]: 1, [at("xl/media/image1.png")]: 101 * MB }), `${what}: a picture does not`).toBe(false);
            expect((await inspect(zipSaying({ [at("xl/workbook.xml")]: 1, [at("xl/worksheets/sheet1.xml")]: 501 * MB }))).refused, what).toBe(config.importWorkbookTooMuchReason(502));
        }
        // and a zip with none of the parts, under any of these names, is still not a workbook
        for (const [what, rewrite] of Object.entries(rewrites)) {
            expect(await inspect(zipSaying({ [rewrite("word/document.xml")]: 1 })), what).toEqual({ refused: config.IMPORT_NOT_A_WORKBOOK_REASON });
        }
    });
});

test.describe("where a sheet's cells are reached from", () => {
    test.beforeEach(skipUnlessFirst);

    // The dialog and the run reach a sheet's cells only through previewRows, tableOf and storedRow of
    // import-cells.js, and a sheet's table name through sheetTableName: never through what a sheet keeps
    // inside (the library's sheet object, its data, its range, its context), which only that module and
    // the module that reads a workbook know the shape of.
    test("the dialog, the run, the typed table, the report and the events never reach inside a sheet: its data, its range, its context and its library sheet are not named there", () => {
        for (const file of ["import-dialog.js", "import.js", "import-db.js", "import-report.js", "import-events.js"]) {
            const text = fs.readFileSync(path.join(__dirname, "..", "js", "lab", file), "utf8");
            expect(text, file).not.toMatch(/\.(ws|rect|context)\b|!data\b/);
        }
        // (the pattern is the one that finds the places that do: import-cells.js names the range, the context and the data)
        const cells = fs.readFileSync(path.join(__dirname, "..", "js", "lab", "import-cells.js"), "utf8");
        expect(cells).toMatch(/\.rect\b/);
        expect(cells).toMatch(/\.context\b/);
        expect(cells).toMatch(/!data\b/);
    });
});

test.describe("what the library keeps of a workbook once it has read it", () => {
    test.beforeEach(skipUnlessFirst);

    // the real library, with every read it is asked for written down; `failing` makes that read throw
    function watchedLibrary({ failing = 0 } = {}) {
        const reads = [];
        return {
            ...XLSX,
            reads,
            read(input, options) {
                reads.push(input);
                if (reads.length === failing) {
                    throw new Error("Unsupported file");
                }
                return XLSX.read(input, options);
            },
        };
    }
    const twoRows = [{ name: "S", rows: [["a"], ["b"]] }];

    // The library keeps the shared strings of the last .xlsx it read, long after the workbook has been let
    // go. A read of a workbook that holds nothing makes it let them go, so one follows each .xlsx.
    test("after an .xlsx the library is given one more workbook to read, a small one that holds no value; after an .xls or a web page it is given none", async () => {
        const library = watchedLibrary();
        const read = await openWorkbook(workbookBytes(twoRows), "a.xlsx", { library });
        expect(read.sheets.map((sheet) => [sheet.name, sheet.rows])).toEqual([["S", 2]]);
        expect(library.reads).toHaveLength(2);
        const hollow = library.reads[1];
        expect(hollow).toBeInstanceOf(Uint8Array);
        expect(hollow.length).toBeLessThan(64 * 1024);
        // (a zip, and a workbook of one sheet with no cell in it)
        expect([...hollow.subarray(0, 4)]).toEqual([0x50, 0x4b, 0x03, 0x04]);
        const inside = XLSX.read(hollow, { type: "array", dense: true });
        expect(inside.SheetNames).toHaveLength(1);
        expect((inside.Sheets[inside.SheetNames[0]]["!data"] ?? []).flat().filter((cell) => cell !== undefined)).toEqual([]);
        // the same workbook is not written again for the next one
        await openWorkbook(workbookBytes(twoRows), "b.xlsx", { library });
        expect(library.reads).toHaveLength(4);
        expect(library.reads[3]).toBe(hollow);

        const old = watchedLibrary();
        const binary = await openWorkbook(workbookBytes(twoRows, { bookType: "xls" }), "a.xls", { library: old });
        expect(binary.kind).toBe("ole2");
        expect(binary.sheets).toHaveLength(1);
        expect(old.reads).toHaveLength(1);

        const page = watchedLibrary();
        const html = await openWorkbook(new TextEncoder().encode("<html><body><table><tr><td>id</td></tr><tr><td>7</td></tr></table></body></html>"), "page.xls", { library: page });
        expect(html.kind).toBe("markup");
        expect(html.sheets).toHaveLength(1);
        expect(page.reads).toHaveLength(1);
    });

    test("an .xlsx that the library throws on is followed by that small workbook too, and is refused as before", async () => {
        const { config } = await modules();
        const library = watchedLibrary({ failing: 1 });
        const read = await openWorkbook(workbookBytes(twoRows), "a.xlsx", { library });
        expect(read.refused).toBe(config.IMPORT_WORKBOOK_UNREADABLE_REASON);
        expect(library.reads).toHaveLength(2);
        expect(library.reads[1].length).toBeLessThan(64 * 1024);
    });

    test("a library that cannot write a workbook, or that throws on the small one, changes nothing of what is read", async () => {
        // (the stand-in of the other tests has no writer: it is asked once, and its workbook is given)
        const bare = fakeLibrary(oneSheet());
        const read = await openWorkbook(workbookBytes(twoRows), "a.xlsx", { library: bare });
        expect(read.sheets).toHaveLength(1);
        expect(bare.calls).toHaveLength(1);
        const throwing = watchedLibrary({ failing: 2 });
        const second = await openWorkbook(workbookBytes(twoRows), "a.xlsx", { library: throwing });
        expect(second.refused).toBeUndefined();
        expect(second.sheets.map((sheet) => [sheet.name, sheet.rows])).toEqual([["S", 2]]);
        expect(throwing.reads).toHaveLength(2);
    });

    // What is held is measured as the engine counts it, after it has been told to collect what nothing
    // reaches (the engine is given the switch that lets a program ask for that). A small workbook is read
    // first, so that what the engine keeps of the library's own code at its first use is not counted.
    test("the texts of an .xlsx are not held once its sheets have been let go: 60,000 texts of their own, read and let go, leave the memory where it was", async () => {
        v8.setFlagsFromString("--expose-gc");
        const collect = vm.runInNewContext("gc");
        const used = () => {
            collect();
            collect();
            return process.memoryUsage().heapUsed;
        };
        const count = 60_000;
        // (texts as Excel writes them, each once in the workbook's part of shared strings; the library's
        // own writer puts a text into its cell unless it is told to share)
        const book = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(book, XLSX.utils.aoa_to_sheet([["text"], ...Array.from({ length: count }, (unused, i) => [`${"x".repeat(90)} ${i}`])]), "Texts");
        const texts = new Uint8Array(XLSX.write(book, { bookType: "xlsx", type: "buffer", bookSST: true }));
        expect(Object.keys(fflate.unzipSync(texts))).toContain("xl/sharedStrings.xml");
        // (read inside a function of its own: when it has returned, nothing here reaches the sheets)
        const readAndMeasure = async (bytes, rows) => {
            const read = await openWorkbook(bytes, "texts.xlsx");
            expect(read.sheets.map((sheet) => [sheet.state, sheet.rows, sheet.columns])).toEqual([["ready", rows, 1]]);
            return used();
        };
        await readAndMeasure(workbookBytes([{ name: "Texts", rows: [["text"], ["one"], ["two"]] }]), 3);
        const before = used();
        const held = await readAndMeasure(texts, count + 1);
        const after = used();
        // (the measure can tell: while the sheets are held the texts are there, some megabytes of them)
        expect(held - before, "held while the sheets are").toBeGreaterThan(8 * MB);
        expect(after - before, "and let go with them").toBeLessThan(3 * MB);
    });

    // The library leaves the first cell of some built-in formats without a format, and the cell rules then
    // look for one among the formats the library holds. It makes that table anew at every read, and a
    // sheet's cells are worked out later: the sheets are given the table as their own workbook left it.
    test("a cell that the library gave no format is read by the formats the library held when its workbook was read, whatever it holds afterwards", async () => {
        const { cells } = await modules();
        const base = workbookBytes([{ name: "S", rows: [["d"], [0], [0]], cells: { A2: { t: "n", v: 45143, z: "m/d/yy" }, A3: { t: "n", v: 45144, z: "m/d/yy" } } }]);
        const eastAsian = editZip(base, (files) => {
            files["xl/styles.xml"] = partBytes(partText(files, "xl/styles.xml").replaceAll('numFmtId="14"', 'numFmtId="30"'));
        });
        // a library whose table of formats can be changed after the read, as another read changes it
        let later = null;
        const library = { ...XLSX, SSF: { ...XLSX.SSF, get_table: () => later ?? XLSX.SSF.get_table() } };
        const read = await openWorkbook(eastAsian, "east-asian.xlsx", { library });
        later = { 0: "General" };
        expect([1, 2].map((row) => cells.valueAt(read.sheets[0], row, 0))).toEqual(["2023-08-05", "2023-08-06"]);
        // and with the real library: another workbook, with formats of its own, read in between
        const first = await openWorkbook(eastAsian, "east-asian.xlsx");
        await openWorkbook(workbookBytes([{ name: "Other", rows: [["n"], [0]], cells: { A2: { t: "n", v: 5, z: '0.000" kg"' } } }]), "other.xlsx");
        expect([1, 2].map((row) => cells.valueAt(first.sheets[0], row, 0))).toEqual(["2023-08-05", "2023-08-06"]);
    });

    // The library shows such a cell's text with the workbook's own date system, so the search for its format has to
    // compare with a text made with that system too, or a 1904 workbook's East Asian date is found no format at all.
    test("a cell with a built-in East Asian date format in a workbook of the 1904 date system is the same date as a cell with an ordinary date format", async () => {
        const { cells } = await modules();
        const cell = { t: "n", v: 43831.5, z: "m/d/yy" };
        const base = (date1904) => workbookBytes([{ name: "S", rows: [["d"], [0]], cells: { A2: cell } }], { date1904 });
        const asFormat = (bytes, id) =>
            editZip(bytes, (files) => {
                files["xl/styles.xml"] = partBytes(partText(files, "xl/styles.xml").replaceAll('numFmtId="14"', `numFmtId="${id}"`));
            });
        for (const date1904 of [false, true]) {
            const ordinary = await openWorkbook(base(date1904), "ordinary.xlsx");
            const want = cells.valueAt(ordinary.sheets[0], 1, 0);
            expect(want, `1904 ${date1904}: an ordinary date`).toMatch(/^\d{4}-\d\d-\d\d 12:00:00$/);
            for (const id of [27, 28, 29, 30, 31, 36, 50, 57, 58]) {
                const read = await openWorkbook(asFormat(base(date1904), id), `format-${id}.xlsx`);
                expect(cells.valueAt(read.sheets[0], 1, 0), `1904 ${date1904}, built-in format ${id}`).toBe(want);
            }
        }
        // (and the sheet's own search, with the formatter of the library, for a cell it gave no format)
        const date = cells.cellValue({ t: "n", v: 43831.5, w: "1/2/24" }, { date1904: true, ssf: XLSX.SSF, formats: new Map() });
        expect(date).toBe("2024-01-02 12:00:00");
    });

    // What the sheets are given is the table of the workbook that was read, not a table that a later read made
    // (the library makes it anew at each read, and the workbook that holds nothing is read after each .xlsx).
    test("the sheets of two workbooks read one after the other each hold the number formats of their own workbook", async () => {
        const kilograms = '0.000" kg"';
        const pounds = '0.0" lb"';
        const first = await openWorkbook(cleanWorkbook(kilograms), "kg.xlsx");
        const second = await openWorkbook(cleanWorkbook(pounds), "lb.xlsx");
        // (a third read, which makes the library's table over again, and then the tables are looked at)
        await openWorkbook(workbookBytes([{ name: "Plain", rows: [["n"], [1]] }]), "plain.xlsx");
        const formatsOf = (read) => Object.values(read.sheets[0].context.ssf.get_table());
        expect(formatsOf(first)).toContain(kilograms);
        expect(formatsOf(first)).not.toContain(pounds);
        expect(formatsOf(second)).toContain(pounds);
        expect(formatsOf(second)).not.toContain(kilograms);
        // (and the table is the library's own for the formats it knows: the 29 of its table, and the one this workbook added)
        expect(formatsOf(second)).toHaveLength(30);
    });

    // The workbook that holds nothing is written once, after the first workbook was read, and the library's writer puts
    // the table of number formats it holds into a book that has none of its own. The first workbook's large formats
    // would then be in the bytes that are read after every workbook, and the library would hold them again each time.
    test("a workbook with a very large number format is not held by the library once the page has let go of its strings, whichever workbook was the first one read", async () => {
        const huge = `0.${"0".repeat(1_000_000)}`;
        const book = editZip(cleanWorkbook(), (files) => {
            const styles = partText(files, "xl/styles.xml");
            files["xl/styles.xml"] = partBytes(styles.replace(/<numFmts[\s\S]*?<\/numFmts>/, "").replace("<fonts", `<numFmts count="1"><numFmt numFmtId="170" formatCode="${huge}"/></numFmts><fonts`));
        });
        const heldFormats = () => Object.values(XLSX.SSF.get_table()).filter((format) => typeof format === "string" && format.length > 100_000).length;
        // (a library object of its own, so that the page makes the workbook that holds nothing anew, after this workbook)
        const library = { ...XLSX };
        const read = await openWorkbook(book, "huge-format.xlsx", { library });
        expect(read.sheets, "the workbook was read").toHaveLength(1);
        expect(Object.values(read.sheets[0].context.ssf.get_table()).filter((format) => typeof format === "string" && format.length > 100_000), "its own sheets hold its formats").toHaveLength(1);
        // (the library also keeps, in a field of its own, the last table of formats it was asked for, and the page asked
        // for this workbook's: it asks again once the workbook that holds nothing was read, or that field would hold these
        // formats until the next workbook is read. Looked at before the line below, which asks for the table itself.)
        expect(
            Object.values(XLSX.SSF._table).filter((format) => typeof format === "string" && format.length > 100_000),
            "the table the library was last asked for holds none of them"
        ).toHaveLength(0);
        expect(heldFormats(), "and the library does not, once the page has read the workbook that holds nothing").toBe(0);
    });

    // A file that the library throws on after it has read the texts of the workbook (it looks for the styles part
    // after them) still leaves them held, and the page lets them go as it does for a workbook that was read. The
    // same measure as above.
    test("the texts of an .xlsx that the library then throws on are not held either: a workbook with no styles part, refused, leaves the memory where it was", async () => {
        const { config } = await modules();
        v8.setFlagsFromString("--expose-gc");
        const collect = vm.runInNewContext("gc");
        const used = () => {
            collect();
            collect();
            return process.memoryUsage().heapUsed;
        };
        const count = 60_000;
        const book = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(book, XLSX.utils.aoa_to_sheet([["text"], ...Array.from({ length: count }, (unused, i) => [`${"x".repeat(90)} ${i}`])]), "Texts");
        const texts = new Uint8Array(XLSX.write(book, { bookType: "xlsx", type: "buffer", bookSST: true }));
        const broken = editZip(texts, (files) => {
            expect(files["xl/sharedStrings.xml"]).toBeDefined();
            delete files["xl/styles.xml"];
        });
        // (the control, in a function of its own: the library alone throws on it, and keeps the texts it had read)
        const bare = () => {
            expect(() => XLSX.read(broken, { type: "array", dense: true })).toThrow();
            return used();
        };
        // (a small workbook is read first, so that what the engine keeps of the library's own code at its first use is not counted)
        XLSX.read(workbookBytes([{ name: "S", rows: [["a"], ["one"]] }]), { type: "array" });
        const before = used();
        const heldByLibrary = bare() - before;
        XLSX.read(workbookBytes([{ name: "S", rows: [["a"], ["one"]] }]), { type: "array" });
        const clear = used();
        const refused = async () => (await openWorkbook(broken, "broken.xlsx")).refused;
        expect(await refused()).toBe(config.IMPORT_WORKBOOK_UNREADABLE_REASON);
        const after = used();
        expect(heldByLibrary, "the library alone keeps them after it threw").toBeGreaterThan(8 * MB);
        expect(after - clear, "and the page lets them go").toBeLessThan(3 * MB);
    });
});

test.describe("a workbook that the browser has no memory left for: the words for it, and the watch that tells of a step that was lost", () => {
    test.beforeEach(skipUnlessFirst);

    const twoRows = [{ name: "S", rows: [["a"], ["b"]] }];
    const page = () => new TextEncoder().encode("<html><body><table><tr><td>id</td></tr><tr><td>7</td></tr></table></body></html>");
    const throwing = (thrown) =>
        fakeLibrary(() => {
            throw thrown;
        });
    // the timers that come round (setInterval) which are set and not yet taken away, for the length of a test
    async function withTimersWatched(run) {
        const set = globalThis.setInterval;
        const clear = globalThis.clearInterval;
        const waiting = new Set();
        globalThis.setInterval = (...args) => {
            const id = set(...args);
            waiting.add(id);
            return id;
        };
        globalThis.clearInterval = (id) => {
            waiting.delete(id);
            return clear(id);
        };
        try {
            await run(waiting);
        } finally {
            globalThis.setInterval = set;
            globalThis.clearInterval = clear;
        }
    }

    test("what an engine says when it has no memory left is told in a reason of its own, for a zip, an .xls and a web page; other words keep the reasons they had", async () => {
        const { config, workbook } = await modules();
        const reason = async (thrown, bytes = workbookBytes(twoRows), name = "a.xlsx") => (await openWorkbook(bytes, name, { library: throwing(thrown) })).refused;
        const internal = new Error("allocation size overflow");
        internal.name = "InternalError";
        const memory = [
            // Chromium: a text longer than a text can be, and a buffer that cannot be had
            new RangeError("Invalid string length"),
            new RangeError("Array buffer allocation failed"),
            // Firefox: an allocation it will not make, and the bare words
            internal,
            "out of memory",
            new Error("out of memory"),
            // Safari
            new RangeError("Out of memory"),
        ];
        for (const thrown of memory) {
            expect(workbook.forWantOfMemory(thrown), String(thrown)).toBe(true);
            expect(await reason(thrown), String(thrown)).toBe(config.IMPORT_WORKBOOK_NO_MEMORY_REASON);
        }
        expect(await reason(new RangeError("Invalid string length"), workbookBytes(twoRows, { bookType: "xls" }), "a.xls")).toBe(config.IMPORT_WORKBOOK_NO_MEMORY_REASON);
        expect(await reason("out of memory", page(), "page.xls")).toBe(config.IMPORT_WORKBOOK_NO_MEMORY_REASON);
        // a password is a password still, and what is not about memory keeps its reason
        for (const other of [new Error("File is password-protected"), new RangeError("Invalid array length"), new RangeError("Maximum call stack size exceeded"), undefined, null, 42]) {
            expect(workbook.forWantOfMemory(other), String(other)).toBe(false);
        }
        expect(await reason(new Error("File is password-protected"))).toBe(config.IMPORT_WORKBOOK_LOCKED_REASON);
        expect(await reason(new RangeError("Invalid array length"))).toBe(config.IMPORT_WORKBOOK_UNREADABLE_REASON);
        expect(await reason(new RangeError("Maximum call stack size exceeded"))).toBe(config.IMPORT_WORKBOOK_UNREADABLE_REASON);
        expect(await reason(new RangeError("Invalid array length"), page(), "page.xls")).toBe(config.IMPORT_PAGE_UNREADABLE_REASON);
    });

    // A timer cannot fire while a call is running, so one that was set before a call and fires with the call
    // not ended tells that the call was lost. It comes round again until the telling goes through: with no
    // memory left, the telling fails as the call did.
    test("a call that is begun and not ended is told of when the watch comes round, again until the telling returns, with what it was begun with; one that is ended is never told of", async () => {
        const { workbook } = await modules();
        // (a timer set later, for longer, fires after every turn of the watch that was due before it)
        const afterTurns = () => new Promise((resolve) => setTimeout(resolve, 20));
        const told = [];
        let failing = 2;
        const watch = workbook.watchCall(
            (...what) => {
                told.push(what);
                if (failing-- > 0) {
                    throw new Error("out of memory");
                }
            },
            { every: 2 }
        );
        expect(watch.begun()).toBe(false);
        watch.begin("library", 1);
        expect(watch.begun()).toBe(true);
        expect(told, "nothing in the turn of the call itself").toEqual([]);
        await expect.poll(() => told.length).toBe(3);
        expect(told, "two turns that could not tell, then the one that did").toEqual([["library", 1], ["library", 1], ["library", 1]]);
        expect(watch.begun()).toBe(false);
        await afterTurns();
        expect(told, "and no more").toHaveLength(3);
        // ended in time: never told of
        watch.begin("second");
        watch.end();
        expect(watch.begun()).toBe(false);
        await afterTurns();
        expect(told).toHaveLength(3);
        // an end with nothing begun, and a second end, change nothing
        watch.end();
        watch.end();
        // begun twice before the watch comes round: the call that counts is the last
        watch.begin("third");
        watch.begin("fourth");
        await expect.poll(() => told.length).toBe(4);
        expect(told[3]).toEqual(["fourth"]);
        await afterTurns();
        expect(told).toHaveLength(4);
    });

    test("the watch is set while the library reads and taken away when the reading has its answer, whether the library gave a workbook, threw, or the dialog had moved on", async () => {
        const { config } = await modules();
        await withTimersWatched(async (waiting) => {
            let during = null;
            const gives = fakeLibrary(() => {
                during = waiting.size;
                return oneSheet();
            });
            const read = await openWorkbook(workbookBytes(twoRows), "a.xlsx", { library: gives });
            expect(read.sheets).toHaveLength(1);
            expect(during, "while the library reads").toBe(1);
            expect(waiting.size, "after the reading").toBe(0);
            // the library throws what is not about memory
            during = null;
            const throws = fakeLibrary(() => {
                during = waiting.size;
                throw new Error("Unsupported file");
            });
            const refused = await openWorkbook(workbookBytes(twoRows), "a.xlsx", { library: throws });
            expect(refused.refused).toBe(config.IMPORT_WORKBOOK_UNREADABLE_REASON);
            expect(during).toBe(1);
            expect(waiting.size).toBe(0);
            // the dialog moves on while the sheets are gone through (the wait between two sheets says so)
            let current = true;
            let given = false;
            let waits = 0;
            let setDuringTheWait = null;
            const two = { SheetNames: ["A", "B"], Sheets: { A: worksheet([["a"]]), B: worksheet([["b"]]) } };
            const moved = await openWorkbook(workbookBytes(twoRows), "a.xlsx", {
                library: fakeLibrary(() => {
                    given = true;
                    return two;
                }),
                wiring: {
                    current: () => current,
                    rest: async () => {
                        // (the zip check rests too, before the library is called: this is the wait after the first sheet)
                        if (given) {
                            waits++;
                            // (looked at after the reading: what is thrown in a rest is taken for the dialog having moved on)
                            setDuringTheWait = waiting.size;
                            current = false;
                        }
                    },
                },
            });
            expect(moved.moved).toBe(true);
            expect(waits).toBe(1);
            expect(setDuringTheWait, "the watch is not set while the page waits: a wait is no step that can be lost").toBe(0);
            expect(waiting.size).toBe(0);
            // the dialog moves on while the library itself reads: the reading says so when the call has ended
            let still = true;
            const left = await openWorkbook(workbookBytes(twoRows), "a.xlsx", {
                library: fakeLibrary(() => {
                    still = false;
                    return oneSheet();
                }),
                wiring: { current: () => still },
            });
            expect(left.moved).toBe(true);
            expect(waiting.size).toBe(0);
            // a workbook that lists no sheet, and one with a name that has no sheet to it
            const none = await openWorkbook(workbookBytes(twoRows), "a.xlsx", { library: fakeLibrary({ SheetNames: [], Sheets: {} }) });
            expect(none.refused).toBe(config.IMPORT_WORKBOOK_NO_SHEETS_REASON);
            expect(waiting.size).toBe(0);
            const missing = await openWorkbook(workbookBytes(twoRows), "a.xlsx", { library: fakeLibrary({ SheetNames: ["Gone"], Sheets: {} }) });
            expect(missing.refused).toBe(config.IMPORT_WORKBOOK_DAMAGED_REASON);
            expect(waiting.size).toBe(0);
            // (a file that fails its check never reaches the library, and no watch is set for it)
            const never = fakeLibrary(oneSheet());
            const cut = await openWorkbook(workbookBytes(twoRows).subarray(0, 300), "cut.xlsx", { library: never });
            expect(cut.refused).toBe(config.IMPORT_WORKBOOK_CUT_REASON);
            expect(never.calls).toHaveLength(0);
            expect(waiting.size).toBe(0);
        });
    });

    // In Firefox the page's own steps fail in their turn when the memory is full: working out the reason of
    // what was thrown, copying the library's table of formats, going through the sheets. Each is a step the
    // watch tells of, since the reading itself can say nothing any more.
    test("a step that fails for want of memory after the library's call is told by the watch, with the reason of no memory: the reason that cannot be worked out, the formats that cannot be copied, the sheets that cannot be gone through", async () => {
        const { config } = await modules();
        await withTimersWatched(async (waiting) => {
            // what was thrown cannot even be looked at
            const unreadable = {
                get message() {
                    throw new Error("out of memory");
                },
            };
            const first = await openWorkbook(workbookBytes(twoRows), "a.xlsx", { library: throwing(unreadable) });
            expect(first.refused).toBe(config.IMPORT_WORKBOOK_NO_MEMORY_REASON);
            expect(waiting.size, "the watch has been taken away once it has told").toBe(0);
            // the library gave a workbook, and the next step has no memory
            const noTable = {
                ...fakeLibrary(oneSheet()),
                SSF: {
                    get_table: () => {
                        throw new Error("out of memory");
                    },
                },
            };
            const second = await openWorkbook(workbookBytes(twoRows), "a.xlsx", { library: noTable });
            expect(second.refused).toBe(config.IMPORT_WORKBOOK_NO_MEMORY_REASON);
            expect(waiting.size).toBe(0);
            // the sheets cannot be gone through
            const sheets = {};
            Object.defineProperty(sheets, "S", {
                enumerable: true,
                get() {
                    throw new RangeError("Array buffer allocation failed");
                },
            });
            const third = await openWorkbook(workbookBytes(twoRows), "a.xlsx", { library: fakeLibrary({ SheetNames: ["S"], Sheets: sheets }) });
            expect(third.refused).toBe(config.IMPORT_WORKBOOK_NO_MEMORY_REASON);
            expect(waiting.size).toBe(0);
        });
    });

    test("a step that fails in another way after the library's call is a fault as it was: the reading is rejected with it, and no watch is left", async () => {
        await withTimersWatched(async (waiting) => {
            const sheets = {};
            Object.defineProperty(sheets, "S", {
                enumerable: true,
                get() {
                    throw new TypeError("not a function");
                },
            });
            await expect(openWorkbook(workbookBytes(twoRows), "a.xlsx", { library: fakeLibrary({ SheetNames: ["S"], Sheets: sheets }) })).rejects.toThrow("not a function");
            expect(waiting.size).toBe(0);
        });
    });

    // The library still holds what it had read of the workbook, which is most of what fills the memory: the
    // watch does not say that there is room again before the library has let it go.
    test("the watch tells only once the library has let the workbook's texts go: while the read of the workbook that holds nothing fails for want of memory, it waits and tries again", async () => {
        const { config } = await modules();
        const reads = [];
        const library = {
            ...XLSX,
            read(input, options) {
                reads.push(options?.dense ? "file" : "nothing");
                // the file's own read, and the first two tries at the workbook that holds nothing, have no memory
                if (reads.length <= 3) {
                    throw new Error("out of memory");
                }
                return XLSX.read(input, options);
            },
        };
        const read = await openWorkbook(workbookBytes(twoRows), "a.xlsx", { library });
        expect(read.refused).toBe(config.IMPORT_WORKBOOK_NO_MEMORY_REASON);
        expect(reads).toEqual(["file", "nothing", "nothing", "nothing"]);
        // an .xls leaves nothing in the library: the watch tells without that read
        const old = [];
        const binary = {
            ...XLSX,
            read(input, options) {
                old.push(options?.dense ? "file" : "nothing");
                throw new Error("out of memory");
            },
        };
        const second = await openWorkbook(workbookBytes(twoRows, { bookType: "xls" }), "a.xls", { library: binary });
        expect(second.refused).toBe(config.IMPORT_WORKBOOK_NO_MEMORY_REASON);
        expect(old).toEqual(["file"]);
    });

    // A step of the page's own is run under the same watch (the dialog's, which shows the sheets). What comes
    // after the step waits for how it ended; for a loss it waits for the telling, and hears of no failure, so
    // that the files chosen behind a lost workbook are still read. Nothing depends on a catch that can finish:
    // what cannot even be looked at (the catch then fails in its turn) is told of as any other loss.
    test("a step that is run under a watch gives what it gave, is rejected with a fault that is not about memory, and for want of memory is resolved by the telling, which is tried until it returns", async () => {
        const { workbook } = await modules();
        const afterTurns = () => new Promise((resolve) => setTimeout(resolve, 20));
        await withTimersWatched(async (waiting) => {
            // the step ends: what it gave, with the watch set while it ran and taken away after
            let during = null;
            let told = 0;
            const given = await workbook.watchStep(
                () => {
                    during = waiting.size;
                    return "given";
                },
                () => told++,
                { every: 2 }
            );
            expect(given).toBe("given");
            expect(during, "while the step runs").toBe(1);
            expect(waiting.size, "after it").toBe(0);
            // a fault of another kind: rejected with it, as it was
            const fault = workbook.watchStep(
                () => {
                    throw new TypeError("not a function");
                },
                () => told++,
                { every: 2 }
            );
            await expect(fault).rejects.toThrow("not a function");
            expect(waiting.size).toBe(0);
            await afterTurns();
            expect(told, "neither was told of as a loss").toBe(0);
            // lost for want of memory: in an engine's words, as a bare text, and as something that cannot be looked at
            const unreadable = {
                get message() {
                    throw new Error("out of memory");
                },
            };
            for (const thrown of [new RangeError("Array buffer allocation failed"), "out of memory", unreadable]) {
                const tries = [];
                let failing = 2;
                let heardAfter = null;
                const outcome = workbook.watchStep(
                    () => {
                        throw thrown;
                    },
                    () => {
                        tries.push(waiting.size);
                        if (failing-- > 0) {
                            throw new Error("out of memory");
                        }
                    },
                    { every: 2 }
                );
                outcome.then(
                    () => (heardAfter = tries.length),
                    () => (heardAfter = "a rejection")
                );
                expect(await outcome, "resolved, with nothing").toBeUndefined();
                expect(tries, "two turns that could not tell, then the one that did, the watch set in each").toEqual([1, 1, 1]);
                expect(heardAfter, "what waits for the step heard of it only then").toBe(3);
                expect(waiting.size).toBe(0);
                await afterTurns();
                expect(tries, "and no more").toHaveLength(3);
            }
        });
    });

    test("the room that a watch asks for before it tells is two hundred thousand small objects, made in one go, and what the engine says when it cannot make them is passed on", async () => {
        const { workbook } = await modules();
        const from = Array.from;
        const asked = [];
        let made = null;
        try {
            Array.from = function (source, map) {
                asked.push([source?.length, typeof map]);
                made = from.apply(this, arguments);
                return made;
            };
            workbook.roomAgain();
        } finally {
            Array.from = from;
        }
        expect(asked).toEqual([[200_000, "function"]]);
        expect(made).toHaveLength(200_000);
        expect(made[0], "each an object of its own").toEqual({});
        expect(made[0]).not.toBe(made[1]);
        // (nothing of the test's own runs while making them fails)
        let thrown = null;
        Array.from = () => {
            throw new RangeError("out of memory");
        };
        try {
            workbook.roomAgain();
        } catch (error) {
            thrown = error;
        } finally {
            Array.from = from;
        }
        expect(String(thrown)).toBe("RangeError: out of memory");
    });

    // The whole file in memory is the first thing a workbook asks of the browser: where there is no room for it,
    // the file is not at fault, and the words are those of no memory. Any other failure to read the bytes (the
    // file was changed or taken away) is the unreadable file it was.
    test("a file whose bytes the browser has no memory to hold is refused with the reason of no memory, whatever its kind, and the library is asked for nothing; bytes that cannot be read for another reason are unreadable as before", async () => {
        const { workbook, config } = await modules();
        await withTimersWatched(async (waiting) => {
            const fileThat = (thrown) => ({
                size: 300_000,
                arrayBuffer: async () => {
                    throw thrown;
                },
            });
            for (const kind of ["zip", "ole2", "markup"]) {
                for (const thrown of [new RangeError("Array buffer allocation failed"), new Error("out of memory"), "out of memory"]) {
                    const library = fakeLibrary(oneSheet());
                    const read = await workbook.readWorkbook(fileThat(thrown), kind, { directory: null, loadLibrary: async () => library });
                    expect(read, `${kind}: ${String(thrown)}`).toEqual({ refused: config.IMPORT_WORKBOOK_NO_MEMORY_REASON });
                    expect(library.calls, "the library was asked to read nothing").toHaveLength(0);
                }
                const library = fakeLibrary(oneSheet());
                const gone = Object.assign(new Error("The requested file could not be read"), { name: "NotReadableError" });
                expect(await workbook.readWorkbook(fileThat(gone), kind, { directory: null, loadLibrary: async () => library }), kind).toEqual({ refused: config.IMPORT_UNREADABLE_REASON });
                expect(library.calls).toHaveLength(0);
            }
            expect(waiting.size, "no watch is left set").toBe(0);
        });
    });

    // The library swallows what a sheet's reading throws and goes on, with the sheet left out and its name still
    // listed: for a damaged part, and just the same when the browser had no memory for the sheet (seen in Firefox,
    // with a workbook of seven million texts: the library came back, one sheet short, and the workbook was called
    // damaged). The page cannot tell the two apart. A small workbook is damaged, as it was: no browser lacks the
    // memory for it. One that is large enough to be asked about first is refused with words that say both.
    test("a sheet that the library names and leaves out, in a workbook large enough to be asked about first, is refused with the words for a sheet that could not be read; in a smaller one the workbook is damaged, as before", async () => {
        const { workbook, config } = await modules();
        const sheetLeftOut = () => fakeLibrary({ SheetNames: ["Kept", "Gone"], Sheets: { Kept: worksheet([["a"], ["b"]]) } });
        const bytes = workbookBytes(twoRows);
        // a file measured by its size (an .xls, a web page, a zip whose directory could not be read): the line is 20 MB
        const fileOf = (size) => ({ size, arrayBuffer: async () => bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) });
        const read = (size, kind) => workbook.readWorkbook(fileOf(size), kind, { directory: null, loadLibrary: async () => sheetLeftOut() });
        for (const kind of ["zip", "ole2", "markup"]) {
            expect(await read(20 * MB, kind), `${kind}, exactly 20 MB`).toEqual({ refused: config.IMPORT_WORKBOOK_DAMAGED_REASON });
            expect(await read(20 * MB + 1, kind), `${kind}, one byte over 20 MB`).toEqual({ refused: config.IMPORT_WORKBOOK_SHEET_LOST_REASON });
        }
        // a zip measured by what its sheets unpack to, as its directory says: the line is 100 MB
        const zipOf = (data) => {
            const book = workbookBytes([{ name: "Data", rows: [["id"], [1]] }, { name: "Other", rows: [["x"]] }]);
            return editZip(book, (files) => {
                const others = Object.entries(files).filter(([name]) => /\.(?:xml|rels)$/.test(name)).reduce((sum, [, part]) => sum + part.length, 0);
                // (a part that is not a sheet and counts as sheet data, of spaces, so that the sheet data comes to `data` bytes)
                files["customXml/item1.xml"] = new Uint8Array(data - others).fill(32);
            });
        };
        const through = async (zipBytes) => {
            const file = new Blob([zipBytes]);
            const inspected = await workbook.inspectWorkbook(file, "zip");
            const result = await workbook.readWorkbook(file, "zip", { directory: inspected.directory, loadLibrary: async () => sheetLeftOut() });
            return { asked: Boolean(inspected.ask), megabytes: inspected.ask?.unpackedMegabytes ?? null, refused: result.refused };
        };
        expect(await through(zipOf(100 * MB)), "sheets that unpack to exactly 100 MB").toEqual({ asked: false, megabytes: null, refused: config.IMPORT_WORKBOOK_DAMAGED_REASON });
        expect(await through(zipOf(100 * MB + 1)), "one byte more").toEqual({ asked: true, megabytes: 101, refused: config.IMPORT_WORKBOOK_SHEET_LOST_REASON });
    });

    // The same through the real library, which is made to give a sheet up as it does when the memory is gone: a
    // cell that points at a text the workbook does not hold makes its reading throw, the library swallows that,
    // and the sheet is missing though its part is in the file and sound.
    test("the real library leaves a sheet out without a word when the sheet's reading throws: a small workbook is then damaged, and one whose sheets unpack to over 100 MB is refused with the words for a sheet that could not be read", async () => {
        const { config } = await modules();
        const pointingAtNoText = (pad) =>
            editZip(workbookBytes([{ name: "Data", rows: [["id", "name"], [1, "a"]] }, { name: "Other", rows: [["x"], [2]] }], { bookSST: true }), (files) => {
                const part = "xl/worksheets/sheet1.xml";
                const xml = partText(files, part);
                const changed = xml.replace(/<c r="B2" t="s"><v>\d+<\/v><\/c>/, '<c r="B2" t="s"><v>999999</v></c>');
                expect(changed, "the cell that holds a shared text was found").not.toBe(xml);
                files[part] = partBytes(changed);
                if (pad) {
                    files["customXml/item1.xml"] = new Uint8Array(pad).fill(32);
                }
            });
        // (what the bare library gives for it: the name, and no sheet)
        const raw = XLSX.read(pointingAtNoText(0), { type: "array", dense: true });
        expect(raw.SheetNames).toEqual(["Data", "Other"]);
        expect(Object.keys(raw.Sheets)).toEqual(["Other"]);
        expect((await openWorkbook(pointingAtNoText(0), "small.xlsx")).refused).toBe(config.IMPORT_WORKBOOK_DAMAGED_REASON);
        const large = await openWorkbook(pointingAtNoText(100 * MB + 1), "large.xlsx");
        expect(large.ask?.unpackedMegabytes, "it is asked about first").toBeGreaterThan(100);
        // (openWorkbook stops at the question: the reading that follows the answer)
        const { workbook } = await modules();
        const file = new Blob([pointingAtNoText(100 * MB + 1)]);
        const answered = await workbook.readWorkbook(file, "zip", { directory: large.directory, loadLibrary: async () => XLSX });
        expect(answered).toEqual({ refused: config.IMPORT_WORKBOOK_SHEET_LOST_REASON });
    });
    // A turn between two sheets that fails for want of memory is a loss only while the dialog is still there. When the
    // dialog has moved on (the dialog was closed or opened again for other files) nothing is left to tell: the reading
    // stops as moved, and no watch is left set to come round for a dialog that is gone.
    test("a wait between two sheets that fails for want of memory after the dialog has moved on is the dialog having moved on: moved, with no watch left set and no refusal told later", async () => {
        const { workbook } = await modules();
        await withTimersWatched(async (waiting) => {
            let current = true;
            let given = false;
            let waits = 0;
            const two = { SheetNames: ["A", "B"], Sheets: { A: worksheet([["a"]]), B: worksheet([["b"]]) } };
            const read = await openWorkbook(workbookBytes(twoRows), "a.xlsx", {
                library: fakeLibrary(() => {
                    given = true;
                    return two;
                }),
                wiring: {
                    current: () => current,
                    rest: async () => {
                        // (the zip check rests too, before the library is called: this is the wait after the first sheet)
                        if (given) {
                            waits++;
                            current = false;
                            throw new RangeError("Invalid string length");
                        }
                    },
                },
            });
            expect(waits).toBe(1);
            expect(read.moved).toBe(true);
            expect(read.refused).toBeUndefined();
            expect(waiting.size, "no watch is left set").toBe(0);
            // (a watch that was left set would tell by now: it comes round every WORKBOOK_WATCH_MS)
            await new Promise((resolve) => setTimeout(resolve, 2 * 250 + 50));
            expect(waiting.size).toBe(0);
            expect(workbook.forWantOfMemory(new RangeError("Invalid string length"))).toBe(true);
        });
    });
});
