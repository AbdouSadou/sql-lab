// Prints SQL query results as text.
//
// Everything that reaches the HTML string comes from SQL or from the database
// (column names, values, table names), so all of it is escaped.

import { escapeHtml } from "./lab/html.js";

// printResult converts SQL query results to an HTML table.
function printResult(result) {
    if (result === null) {
        return "(empty)";
    }
    const [columns, values] = [result.columns, result.values];
    let html = "<thead>" + join(columns.map(escapeHtml), "th") + "</thead>";
    const rows = values.map(function (v) {
        return join(v.map(sanitize), "td");
    });
    html += "<tbody>" + join(rows, "tr") + "</tbody>";
    return `<table>${html}</table>`;
}

// printTables prints the specified database tables.
function printTables(tables) {
    let html = "<thead><tr><th>table</th></tr></thead>";
    const rows = tables.map(function (table) {
        const name = escapeHtml(table);
        return `<tr>
            <td>
                <button class="sqlime-link" data-action="showTable" data-arg="${name}">
                    ${name}
                </button>
            </td>
        </tr>`;
    });
    html += "<tbody>" + rows.join("\n") + "</tbody>";
    return `<table>${html}</table>`;
}

// join joins the values, wrapping each one into a tag.
function join(values, tagName) {
    if (values.length === 0) {
        return "";
    }
    const open = "<" + tagName + ">";
    const close = "</" + tagName + ">";
    return open + values.join(close + open) + close;
}

// sanitize turns a cell value into safe HTML. Line breaks become <br>, as before.
function sanitize(value) {
    return escapeHtml(value).replace(/\r\n|\r|\n/g, "<br>");
}

const printer = { printResult, printTables };
export default printer;
