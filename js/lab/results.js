// F5 Results UX: what a run looks like on screen and the CSV of it.
//
//   mountResults({ui, getDatabase}) -> {showResult(result, elapsed), showError(exc)}
//       Called once from js/index.js, whose showResult and showError delegate here.
//       showResult prints at most ROW_LIMIT rows, says "N rows, took X ms" (singular for 1,
//       "showing 500 of N rows, ..." when capped; N is always the full count) and offers the
//       whole result, not the capped table, to the #download-csv button. showError puts the
//       engine's message and the failing statement in the status line and clears the table.
//       The statement is shown without the comments in front of it.
//   errorText(exc) -> string
//       The engine's message alone, on one line: the `error` of lab:run-finished.
//   toCsv({columns, values}) -> string
//       Pure. RFC 4180: comma separator, CRLF after every record (the last one included), a
//       header row, a field quoted when it holds a comma, a double quote, CR or LF, double
//       quotes doubled. NULL is an empty field, a number is the JS value's shortest text, a
//       BigInt its digits, a BLOB x'<hex>' (as the checker and the result table display it;
//       js/lab/cell-text.js cellText). Cell text is never altered: a cell that starts with
//       = + - or @ is written as it is, because this is a data export for analysis, not
//       something to open as a formula sheet.
//   csvBytes(result) -> string
//       toCsv with a UTF-8 byte order mark in front when the text holds a non-ASCII
//       character (Excel misreads non-ASCII UTF-8 without one); plain ASCII stays byte-clean.
//   csvFileName(databaseName) -> string
//       "<name without its extension>-result.csv", sanitised like the database export.
//
// The button (#download-csv, last in the command bar) is visible only while the table of a
// query result with at least one row is on screen. A MutationObserver on #result retires it
// when that table leaves, whichever code path removed it (tables view, an error, a new
// database, another exercise, a clear), and the click handler checks again, so the file is
// always the result on screen at that moment. Everything the student sees here is escaped.

import {
    CSV_BUTTON_TEXT,
    CSV_BUTTON_TITLE,
    CSV_FAILED_MESSAGE,
    CSV_FILE_SUFFIX,
    ROW_LIMIT,
    STATEMENT_ELLIPSIS,
    STATEMENT_PREVIEW_CHARS,
    failedStatementMessage,
    resultStatusMessage,
} from "./config.js";
import { cellText } from "./cell-text.js";
import { safeBaseName, saveFile } from "./export.js";
import { escapeHtml } from "./html.js";
import { engineMessage, stripLeadingNoise } from "./runner.js";

// ---- text ----------------------------------------------------------------------------------

const oneLine = (text) => String(text).replace(/\s+/g, " ").trim();

export function errorText(exc) {
    return oneLine(engineMessage(exc));
}

// the statement on one line, cut to about STATEMENT_PREVIEW_CHARS characters. Comments in front
// of it are left out: they would use up the room and can make the statement look commented out.
function statementPreview(text) {
    const line = oneLine(stripLeadingNoise(text) || text);
    if (line.length <= STATEMENT_PREVIEW_CHARS) {
        return line;
    }
    // by code point, so an emoji is not cut in half
    return Array.from(line).slice(0, STATEMENT_PREVIEW_CHARS).join("").trimEnd() + STATEMENT_ELLIPSIS;
}

// errorLine is the plain text of the status line for a failed run
function errorLine(exc) {
    const message = errorText(exc);
    const failed = exc !== null && typeof exc === "object" ? exc : null;
    if (
        failed &&
        typeof failed.statementText === "string" &&
        Number.isInteger(failed.statementPosition) &&
        Number.isInteger(failed.statementCount)
    ) {
        return failedStatementMessage(
            message,
            failed.statementPosition,
            failed.statementCount,
            statementPreview(failed.statementText)
        );
    }
    return message;
}

// ---- CSV -----------------------------------------------------------------------------------

const NEEDS_QUOTES = /[",\r\n]/;
const NON_ASCII = /[^\u0000-\u007f]/;

function field(value) {
    const text = cellText(value);
    return NEEDS_QUOTES.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

export function toCsv({ columns, values }) {
    const lines = [columns.map(field).join(",")];
    for (const row of values) {
        lines.push(Array.from(row, field).join(","));
    }
    return lines.join("\r\n") + "\r\n";
}

export function csvBytes(result) {
    const text = toCsv(result);
    return NON_ASCII.test(text) ? `\uFEFF${text}` : text;
}

export function csvFileName(databaseName) {
    return `${safeBaseName(databaseName).replace(/\.(db|sqlite|sqlite3)$/i, "")}${CSV_FILE_SUFFIX}`;
}

// ---- the page ------------------------------------------------------------------------------

export function mountResults({ ui, getDatabase }) {
    const button = document.createElement("button");
    button.id = "download-csv";
    button.type = "button";
    button.textContent = CSV_BUTTON_TEXT;
    button.title = CSV_BUTTON_TITLE;
    button.hidden = true;
    ui.commandbar.append(button);

    // The full result on offer, and the table that shows (the first rows of) it.
    let offered = null;
    let table = null;

    function retire() {
        offered = null;
        table = null;
        button.hidden = true;
    }

    // is the offered result still the one on screen?
    function onScreen() {
        return Boolean(offered && table && table.parentNode === ui.result && table.isConnected);
    }

    function offer(result) {
        offered = result;
        table = ui.result.querySelector("table");
        button.hidden = !table;
        if (!table) {
            offered = null;
        }
    }

    // Anything that replaces or clears the printed table, from any code path, ends the offer.
    new MutationObserver(() => {
        if (offered && !onScreen()) {
            retire();
        }
    }).observe(ui.result, { childList: true });
    document.addEventListener("lab:database-loaded", retire);

    button.addEventListener("click", () => {
        if (!onScreen()) {
            retire();
            return;
        }
        try {
            saveFile(csvBytes(offered), csvFileName(getDatabase()?.name), "text/csv;charset=utf-8");
        } catch {
            ui.status.error(escapeHtml(CSV_FAILED_MESSAGE));
        }
    });

    return {
        showResult(result, elapsed) {
            const total = result ? result.values.length : 0;
            ui.status.success(escapeHtml(resultStatusMessage(total, Math.min(total, ROW_LIMIT), elapsed)));
            if (!total) {
                ui.result.print("");
                retire();
                return;
            }
            const shown =
                total > ROW_LIMIT ? { columns: result.columns, values: result.values.slice(0, ROW_LIMIT) } : result;
            ui.result.print(shown);
            offer(result);
        },

        showError(exc) {
            ui.result.clear();
            retire();
            ui.status.error(escapeHtml(errorLine(exc)));
        },
    };
}
