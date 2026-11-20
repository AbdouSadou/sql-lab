// The import report (assessment plan, section 3, "Import report"): what an import made, shown in
// the results pane when it ends. It points a student at what there is to clean, and cleans
// nothing. Built with createElement and textContent only: names and values come from a file.
//
//   buildImportReport(tables) -> element
//     tables: [{name, rows, source, badQuotes, quoted, columns: [{name, original, type, blanks, blocking}],
//               emptyFormulas, padded: [{column, example, number}]}]
//     emptyFormulas and padded are the two facts of a sheet of a workbook (js/lab/import-cells.js
//     tableOf); a table of a text file has neither, and its report is what it always was.
//
// For each table: its name, its rows and columns, and the file it came from; a warning when a
// quote in the file could not be paired (everything after it may have been read as one field);
// a paragraph naming the names (the table's, some columns') that a query must write in double
// quotes, from `quoted` (js/lab/import-db.js asked the engine); for a sheet, a paragraph when
// formula cells of it came out empty (the workbook stores no result for them, or they give empty
// text, and the table holds blanks); and one line for each column:
// its name, the name it had in the file where that changed (a blank one is shown as "blank"),
// the type chosen, the number of blanks (NULLs, the ones that pad a short row included), and,
// for a text column that is mostly numbers, the first value that stopped it being a number, and for a
// column of a sheet whose number format showed zeros that the table does not hold ("00123" for the
// number 123), what Excel showed (both notes, when a column has both). A
// name or a value of more than REPORT_VALUE_CHARS characters is cut short here, as the preview
// cuts a field (the whole of it is in its title, and the table holds it whole): one long value
// would otherwise push the other columns out of sight. Each table of columns is named after its
// table, for a reader that lists the tables of a page.

import {
    IMPORT_REPORT_BLANKS_HEADING,
    IMPORT_REPORT_BLANK_NAME,
    IMPORT_REPORT_BLOCKING_NOTE,
    IMPORT_REPORT_COLUMN_HEADING,
    IMPORT_REPORT_NOTE_HEADING,
    IMPORT_REPORT_ORIGINAL_HEADING,
    IMPORT_REPORT_QUOTES_WARNING,
    IMPORT_REPORT_TYPE_HEADING,
    importReportEmptyFormulasText,
    importReportPaddedNote,
    importReportQuotedText,
    importReportTableLine,
} from "./config-workflow.js";
import { icon } from "./icons.js";
import { numberInFull } from "./import-cells.js";
import { isBlankName } from "./import-rules.js";

function el(tag, className, text) {
    const node = document.createElement(tag);
    if (className) {
        node.className = className;
    }
    if (text !== undefined && text !== null) {
        node.textContent = text;
    }
    return node;
}

// a name or a value longer than this is cut short
const REPORT_VALUE_CHARS = 80;
const CUT = "…";
let reports = 0;

// what is shown of a text, and the whole of it in a title when that is more
function shown(node, text) {
    if (text.length > REPORT_VALUE_CHARS) {
        node.textContent = `${text.slice(0, REPORT_VALUE_CHARS)}${CUT}`;
        node.title = text;
    } else {
        node.textContent = text;
    }
    return node;
}

// a value as it is in the file, its spaces to be seen
const asRead = (text) => shown(el("span", "import-cell-text"), text);

function originalCell(column) {
    const cell = el("td");
    if (column.original === null || column.original === column.name) {
        // no name in the file (a column added for a longer row), or the name as it was
        return cell;
    }
    cell.append(isBlankName(column.original) ? el("span", "cell-null", IMPORT_REPORT_BLANK_NAME) : asRead(column.original));
    return cell;
}

// the note about padding: what Excel showed, cut as the other values are, the whole in its title
function paddedNote(padded) {
    const number = numberInFull(padded.number);
    const example = padded.example;
    const node = el("span", "import-report-padded");
    if (example !== null && example.length > REPORT_VALUE_CHARS) {
        node.textContent = importReportPaddedNote(`${example.slice(0, REPORT_VALUE_CHARS)}${CUT}`, number);
        node.title = importReportPaddedNote(example, number);
    } else {
        node.textContent = importReportPaddedNote(example, number);
    }
    return node;
}

function noteCell(column, padded) {
    const cell = el("td", "import-report-note");
    if (column.blocking !== null) {
        cell.append(el("span", null, `${IMPORT_REPORT_BLOCKING_NOTE} `), asRead(column.blocking));
    }
    if (padded) {
        cell.append(paddedNote(padded));
    }
    return cell;
}

function columnsTable(table, headingId) {
    const node = el("table", "result-table import-report-columns");
    node.setAttribute("aria-labelledby", headingId);
    const head = el("tr");
    for (const [text, className] of [
        [IMPORT_REPORT_COLUMN_HEADING, null],
        [IMPORT_REPORT_ORIGINAL_HEADING, null],
        [IMPORT_REPORT_TYPE_HEADING, null],
        [IMPORT_REPORT_BLANKS_HEADING, "num"],
        [IMPORT_REPORT_NOTE_HEADING, null],
    ]) {
        const heading = el("th", className, text);
        heading.scope = "col";
        head.append(heading);
    }
    node.createTHead().append(head);
    const body = node.createTBody();
    const padded = new Map((table.padded ?? []).map((one) => [one.column, one]));
    for (const column of table.columns) {
        const row = el("tr");
        const name = shown(el("th", "import-report-column"), column.name);
        name.scope = "row";
        row.append(name, originalCell(column), el("td", null, column.type), el("td", "num", String(column.blanks)), noteCell(column, padded.get(column.name)));
        body.append(row);
    }
    return node;
}

function warning(text) {
    const node = el("p", "import-report-warning");
    const glyph = icon("circle-alert");
    glyph.classList.add("import-report-warning-icon");
    node.append(glyph, el("span", null, text));
    return node;
}

export function buildImportReport(tables) {
    const report = el("div", "import-report");
    reports++;
    tables.forEach((table, n) => {
        const section = el("section", "import-report-table");
        const heading = el("h2", "import-report-name", table.name);
        heading.id = `import-report-${reports}-${n + 1}`;
        section.append(heading, el("p", "import-report-line", importReportTableLine(table.rows, table.columns.length, table.source)));
        if (table.badQuotes) {
            section.append(warning(IMPORT_REPORT_QUOTES_WARNING));
        }
        if (table.quoted?.length) {
            section.append(el("p", "import-report-quoted", importReportQuotedText(table.quoted)));
        }
        if (table.emptyFormulas > 0) {
            section.append(el("p", "import-report-formulas", importReportEmptyFormulasText(table.emptyFormulas)));
        }
        section.append(columnsTable(table, heading.id));
        report.append(section);
    });
    return report;
}
