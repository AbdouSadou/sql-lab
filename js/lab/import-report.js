// The import report (assessment plan, section 3, "Import report"): what an import made, shown in
// the results pane when it ends. It points a student at what there is to clean, and cleans
// nothing. Built with createElement and textContent only: names and values come from a file.
//
//   buildImportReport(tables) -> element
//     tables: [{name, rows, source, badQuotes, columns: [{name, original, type, blanks, blocking}]}]
//
// For each table: its name, its rows and columns, and the file it came from; a warning when a
// quote in the file could not be paired (everything after it may have been read as one field);
// and one line for each column: its name, the name it had in the file where that changed (a
// blank one is shown as "blank"), the type chosen, the number of blanks (NULLs, the ones that
// pad a short row included), and, for a text column that is mostly numbers, the first value
// that stopped it being a number. A name or a value of more than REPORT_VALUE_CHARS characters
// is cut short here, as the preview cuts a field (the whole of it is in its title, and the table
// holds it whole): one long value would otherwise push the other columns out of sight. Each
// table of columns is named after its table, for a reader that lists the tables of a page.

import {
    IMPORT_REPORT_BLANKS_HEADING,
    IMPORT_REPORT_BLANK_NAME,
    IMPORT_REPORT_BLOCKING_NOTE,
    IMPORT_REPORT_COLUMN_HEADING,
    IMPORT_REPORT_NOTE_HEADING,
    IMPORT_REPORT_ORIGINAL_HEADING,
    IMPORT_REPORT_QUOTES_WARNING,
    IMPORT_REPORT_TYPE_HEADING,
    importReportTableLine,
} from "./config-workflow.js";
import { icon } from "./icons.js";
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

function noteCell(column) {
    const cell = el("td", "import-report-note");
    if (column.blocking !== null) {
        cell.append(el("span", null, `${IMPORT_REPORT_BLOCKING_NOTE} `), asRead(column.blocking));
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
    for (const column of table.columns) {
        const row = el("tr");
        const name = shown(el("th", "import-report-column"), column.name);
        name.scope = "row";
        row.append(name, originalCell(column), el("td", null, column.type), el("td", "num", String(column.blanks)), noteCell(column));
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
        section.append(columnsTable(table, heading.id));
        report.append(section);
    });
    return report;
}
