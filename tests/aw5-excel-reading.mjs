// A reading of workbooks by the three modules of Phase 5 (js/lab/import-zip.js, import-cells.js,
// import-workbook.js) for tests/aw5-excel-rules.spec.js, as a program of its own so that Node can
// run it where the spec cannot: in a child process with its own time zone (TZ), and in a worker
// thread that may have to be stopped (the library never returns on some damaged files). It is not a
// spec (Playwright reads *.spec.js only) and it checks nothing: it writes down what the modules give,
// and the spec compares that with the owner's expected files.
//
//   dumpWorkbook(bytes, fileName, {headerRows}) -> Promise<dump>
//       bytes -> the kind by the first bytes -> inspectWorkbook -> readWorkbook with the vendored
//       library -> for each sheet its table, as the page's import would make it:
//       {kind, hasZero?, refused?, charts, sheets: [{name, label, hidden, state, rows, columns, start,
//       page, tableName, table?, alt?}]}, a table being {rows, columns: [{name, original, type, blanks,
//       blocking}], data, emptyFormulas, padded}. A sheet's table name is the first free one of
//       sheetTableName, in the sheet order, over every sheet that is ready (ticked or not). `data`
//       holds the values as the engine would be given them, with a text in an INTEGER or REAL column
//       as the number it converts to. headerRows is {sheet name: row}: for such a sheet, `alt` is its
//       table with its names on that row of the rectangle.
//   run as a program (node tests/aw5-excel-reading.mjs): every entry of tests/fixtures/expected/
//       index.json that is not a text file, read this way, as one JSON object on stdout, by fixture
//       name; the rows of the sheets that the expected files give a header_row for are read twice.

import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath, pathToFileURL } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const repo = path.join(here, "..");
const require = createRequire(import.meta.url);
const XLSX = require(path.join(repo, "vendor", "xlsx.full.min.js"));
const load = (file) => import(pathToFileURL(path.join(repo, "js", "lab", file)).href);
const [text, rules, cells, workbook] = await Promise.all([load("import-text.js"), load("import-rules.js"), load("import-cells.js"), load("import-workbook.js")]);

async function tableDump(sheet, options) {
    const table = await cells.tableOf(sheet, options);
    const data = [];
    for (let i = 0; i < table.rows; i++) {
        data.push(cells.storedRow(table, i).map((value, c) => (typeof value === "string" && table.columns[c].type !== "TEXT" ? Number(value) : value)));
    }
    return {
        rows: table.rows,
        columns: table.columns.map(({ name, original, type, blanks, blocking }) => ({ name, original, type, blanks, blocking })),
        data,
        emptyFormulas: table.emptyFormulas,
        padded: table.padded,
    };
}

export async function dumpWorkbook(bytes, fileName, { headerRows = {} } = {}) {
    const kind = text.kindByStart(bytes.subarray(0, text.HEAD_BYTES), bytes.length, fileName);
    if (kind !== "zip" && kind !== "ole2" && kind !== "markup") {
        return { kind, hasZero: bytes.includes(0) };
    }
    const file = new Blob([bytes]);
    const inspected = await workbook.inspectWorkbook(file, kind);
    if (inspected.refused) {
        return { kind, refused: inspected.refused };
    }
    const read = await workbook.readWorkbook(file, kind, { directory: inspected.directory, loadLibrary: async () => XLSX });
    if (read.refused) {
        return { kind, refused: read.refused };
    }
    const used = new Set();
    const sheets = [];
    for (const sheet of read.sheets) {
        const { name, label, hidden, state, rows, columns, start, page } = sheet;
        const out = { name, label, hidden, state, rows, columns, start, page, tableName: null };
        if (state === "ready") {
            out.tableName = rules.uniqueName(cells.sheetTableName(sheet, fileName), used);
            out.table = await tableDump(sheet, {});
            if (headerRows[name] !== undefined) {
                out.alt = await tableDump(sheet, { hasNames: true, namesRow: headerRows[name] });
            }
        }
        sheets.push(out);
    }
    return { kind, charts: read.charts, sheets };
}

// as a program
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
    const fixtures = path.join(repo, "tests", "fixtures");
    const index = JSON.parse(fs.readFileSync(path.join(fixtures, "expected", "index.json"), "utf8"));
    const all = {};
    for (const entry of index) {
        const want = JSON.parse(fs.readFileSync(path.join(fixtures, entry.expected), "utf8"));
        if (!want.sheets && !entry.fixture.startsWith("impostors/")) {
            continue;
        }
        const headerRows = {};
        for (const sheet of want.sheets ?? []) {
            if (sheet.table_if_header_row_can_be_chosen) {
                headerRows[sheet.sheet] = sheet.table_if_header_row_can_be_chosen.header_row;
            }
        }
        const bytes = new Uint8Array(fs.readFileSync(path.join(fixtures, ...entry.fixture.split("/"))));
        all[entry.fixture] = await dumpWorkbook(bytes, path.basename(entry.fixture), { headerRows });
    }
    process.stdout.write(JSON.stringify(all));
}
