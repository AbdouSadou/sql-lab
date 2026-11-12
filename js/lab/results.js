// The results pane (UI plan, sections 3 and 5; F5 of the build spec): what a run, a load or a
// problem looks like there, and the CSV of a result.
//
//   mountResults({ui, pane, summary, getDatabase, getSamples, isExercise}) -> view
//       Called once from js/index.js. The pane (#results-pane) shows one state at a time, named
//       by its data-state:
//         "empty"    no result yet: a heading, a line, and up to MAX_SAMPLES sample queries
//                    (getSamples()), none in an exercise (isExercise()); with an error band above
//                    it when something went wrong on the way (showProblem, or a load's problem)
//         "loading"  a database is on its way: its name, its size and a progress bar
//         "result"   the summary line ("5 rows in 3 ms", Download CSV) and the ruled table
//         "done"     a run with no result set: the summary line alone ("Done. 3 rows changed in 2 ms")
//         "error"    the error band of a failed run: the heading, SQLite's message as it is, and
//                    the failing statement quoted
//       The summary line (#results-summary: #status and Download CSV) shows only for a result and
//       for "done". Each outcome is said once by a polite live region (#results-announce): "5 rows
//       returned", "Done.", "This query has an error: <message>".
//   view.showResult(result, elapsed, {changes, quiet}) / view.showError(exc, {quiet}) / view.showProblem(message)
//       quiet: say nothing (a Check's run: the exercise's verdict is what is said)
//   view.say(text)
//       Says a Check's verdict ("Correct. 5 rows match.") in the same live region, so a Check is
//       said once, as a Run is (js/lab/exercise-panel.js draws the verdict above the pane's state).
//   view.showEmpty({variant, notice, problem, said}) / view.showLoading({name, size}) -> {name(), progress()}
//       said: the heading is said too (an empty Run)
//   view.loadFailed(message) / view.loadCancelled()
//       A load that failed or was given up (or a set that could not be opened) while a database
//       stays open: what the pane showed before the load comes back (the student's result is still
//       true of the database that is open), and a failure's band goes above it, at the top of the
//       pane (.results-problem), until the next state. With no database open, the error band
//       alone, or "no result yet".
//   view.startRun() -> end()
//       Arms "Running…" over the summary line (or, with no summary line, over the top of the pane)
//       before a run; css/result.css shows it once the run has taken 300 ms. The run itself blocks
//       the page, so only the browser's compositor can still draw then: js/index.js lets one frame
//       pass between startRun() and the run, so the waiting animation is on the compositor.
//   view.canDownload(), view.download()
//       The Export menu's "Results (.csv)" asks and calls these.
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
// The table shows at most ROW_LIMIT rows; every count is the full one. Download CSV (#download-csv,
// at the end of the summary line) is there only while the table of a result with at least one row
// is on screen: a MutationObserver on #result retires it when that table leaves, whichever code
// path removed it, and the click checks again, so the file is always the result on screen. Every
// text here is set with textContent.

import {
    APP_NAME,
    CSV_BUTTON_TEXT,
    CSV_BUTTON_TITLE,
    CSV_FAILED_MESSAGE,
    CSV_FILE_SUFFIX,
    EMPTY_DATABASE_TEXT,
    EMPTY_EXERCISE_TEXT,
    EMPTY_FUNCTIONS_TEXT,
    EMPTY_SAMPLES_LABEL,
    EMPTY_SAMPLES_TEXT,
    EMPTY_TITLE,
    ERROR_HEADING,
    RESTORED_MESSAGE,
    ROW_LIMIT,
    RUNNING_TEXT,
    SAMPLE_LABEL_CHARS,
    SAMPLE_SQL_CHARS,
    SHARED_MESSAGE,
    STATEMENT_ELLIPSIS,
    STATEMENT_QUOTE_CHARS,
    emptyAboutText,
    errorAnnouncement,
    errorStatementText,
    exportedMessage,
    loadingSizeText,
    loadingTitle,
    resultCappedAnnouncement,
    resultCappedText,
    resultDoneAnnouncement,
    resultDoneText,
    resultRowsAnnouncement,
    resultRowsText,
    resultTimeText,
} from "./config.js";
import { cellText } from "./cell-text.js";
import { safeBaseName, saveFile } from "./export.js";
import { icon } from "./icons.js";
import { buildResultTable, mountCellPopover } from "./result-table.js";
import { engineMessage, stripLeadingNoise } from "./runner.js";
import { toast } from "./toast.js";

// ---- text ----------------------------------------------------------------------------------

const oneLine = (text) => String(text).replace(/\s+/g, " ").trim();
// a sample's SQL on one line, as the list shows it: "AS (SELECT", not "AS ( SELECT"; cut at
// SAMPLE_SQL_CHARS characters (more than the line shows at any width)
const sampleLine = (sql) => oneLine(sql).replace(/\(\s+/g, "(").replace(/\s+\)/g, ")");
// text cut at `max` characters (code points) with an ellipsis
function cut(text, max) {
    const characters = Array.from(text);
    return characters.length > max ? characters.slice(0, max).join("").trimEnd() + STATEMENT_ELLIPSIS : text;
}

function sampleText(sql) {
    return cut(sampleLine(sql), SAMPLE_SQL_CHARS);
}

export function errorText(exc) {
    return oneLine(engineMessage(exc));
}

// the failing statement as the student wrote it, without the comments in front of it (they can
// make it look commented out), cut at STATEMENT_QUOTE_CHARS characters (code points, so an emoji
// is not cut in half)
function statementQuote(text) {
    const statement = stripLeadingNoise(text) || text;
    const characters = Array.from(statement);
    if (characters.length <= STATEMENT_QUOTE_CHARS) {
        return statement;
    }
    return characters.slice(0, STATEMENT_QUOTE_CHARS).join("").trimEnd() + STATEMENT_ELLIPSIS;
}

// where a failure happened: {position, count, text}, or null for a failure that is not in a
// statement of the run
function failedStatement(exc) {
    const failed = exc !== null && typeof exc === "object" ? exc : null;
    if (
        failed &&
        typeof failed.statementText === "string" &&
        Number.isInteger(failed.statementPosition) &&
        Number.isInteger(failed.statementCount)
    ) {
        return { position: failed.statementPosition, count: failed.statementCount, text: failed.statementText };
    }
    return null;
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

// The time a run took goes in a span of its own (.status-time): it is the one part that differs
// from one run of the same query to the next, so the screenshot baselines
// (tests/ui-visual.spec.js) give it one value before each shot.
function withTime(text, ms) {
    return [text, el("span", "status-time", resultTimeText(ms))];
}

// an error band (the plan's band pattern: --danger-subtle, an alert sign, no coloured edge)
function band(...body) {
    const node = el("div", "results-band");
    const glyph = icon("circle-alert");
    glyph.classList.add("results-band-icon");
    const content = el("div", "results-band-body");
    content.append(...body);
    node.append(glyph, content);
    return node;
}

// the band of a failed run: the heading, SQLite's message as it is, the statement quoted
function errorBand(exc) {
    const message = engineMessage(exc) || String(exc);
    const parts = [el("h2", "results-band-title", ERROR_HEADING), el("p", "results-band-message", message)];
    const failed = failedStatement(exc);
    if (failed) {
        const where = el("div", "results-band-statement");
        where.append(
            el("p", "results-band-where", errorStatementText(failed.position, failed.count)),
            el("pre", "results-band-quote", statementQuote(failed.text))
        );
        parts.push(where);
    }
    return band(...parts);
}

// the band of a problem that is not a query's (a load that failed, a damaged link): the message
function problemBand(message) {
    const node = band(el("p", "results-band-text", message));
    node.classList.add("results-band--problem");
    return node;
}

export function mountResults({ ui, pane, summary, getDatabase, getSamples = () => [], isExercise = () => false }) {
    const button = document.createElement("button");
    button.id = "download-csv";
    button.type = "button";
    button.className = "button button--quiet results-download";
    button.title = CSV_BUTTON_TITLE;
    button.append(icon("download"), el("span", null, CSV_BUTTON_TEXT));
    button.hidden = true;
    summary.append(button);

    // the live region that says each outcome once
    const announcer = el("p", "visually-hidden");
    announcer.id = "results-announce";
    announcer.setAttribute("role", "status");
    announcer.setAttribute("aria-live", "polite");
    announcer.setAttribute("aria-atomic", "true");
    pane.append(announcer);
    let announceTimer = 0;
    function announce(text) {
        clearTimeout(announceTimer);
        announcer.textContent = "";
        // filled a moment later, so the same words after the next run are said again
        announceTimer = setTimeout(() => {
            announcer.textContent = text;
        }, 60);
    }

    // a load problem over the view it left in place (loadFailed), at the top of the pane
    const problemSlot = el("div", "results-problem");
    problemSlot.hidden = true;
    summary.before(problemSlot);

    // the popover that every long cell opens (index.html holds it)
    const popoverElement = document.getElementById("cell-popover");
    const cellPopover = popoverElement ? mountCellPopover(popoverElement) : { close() {} };

    // a new state: what the live region said about the old one is no longer true there, and a load
    // problem shown over the old view goes with it
    function setState(state) {
        pane.dataset.state = state;
        summary.hidden = !(state === "result" || state === "done");
        cellPopover.close?.();
        clearTimeout(announceTimer);
        announcer.textContent = "";
        problemSlot.replaceChildren();
        problemSlot.hidden = true;
    }

    function setSummary(...parts) {
        ui.status.replaceChildren(...parts);
    }

    // The sticky header's height, as --result-head on #result, for its scroll-padding-top
    // (css/result.css): a control the focus moves to is scrolled clear of the header, which is
    // taller than one line when a column's name holds line breaks (an unaliased multi-line
    // expression is named by its text).
    const headObserver = typeof ResizeObserver === "function"
        ? new ResizeObserver((entries) => {
              for (const entry of entries) {
                  ui.result.style.setProperty("--result-head", `${Math.ceil(entry.target.getBoundingClientRect().height)}px`);
              }
          })
        : null;
    function followHeader(printed) {
        headObserver?.disconnect();
        const head = printed.tHead;
        if (head) {
            ui.result.style.setProperty("--result-head", `${Math.ceil(head.getBoundingClientRect().height)}px`);
            headObserver?.observe(head);
        }
    }

    // ---- Download CSV

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

    function offer(result, shownTable) {
        offered = result;
        table = shownTable;
        button.hidden = false;
    }

    // Anything that replaces or clears the printed table, from any code path, ends the offer.
    new MutationObserver(() => {
        if (offered && !onScreen()) {
            retire();
        }
    }).observe(ui.result, { childList: true });
    document.addEventListener("lab:database-loaded", retire);

    function download() {
        if (!onScreen()) {
            retire();
            return;
        }
        const filename = csvFileName(getDatabase()?.name);
        try {
            saveFile(csvBytes(offered), filename, "text/csv;charset=utf-8");
        } catch {
            toast(CSV_FAILED_MESSAGE, { tone: "problem" });
            return;
        }
        toast(exportedMessage(filename));
    }

    button.addEventListener("click", download);

    // ---- the states

    function emptyBlock({ variant = "fresh", notice = null }) {
        const block = el("div", "results-empty");
        const intro = el("div", "results-empty-intro");
        intro.append(el("h2", "results-empty-title", EMPTY_TITLE));
        if (notice) {
            intro.append(el("p", "results-empty-text results-empty-notice", notice));
        }
        const exercise = isExercise();
        if (variant === "restored" || variant === "shared") {
            intro.append(el("p", "results-empty-text", variant === "shared" ? SHARED_MESSAGE : RESTORED_MESSAGE));
        } else if (exercise) {
            intro.append(el("p", "results-empty-text", EMPTY_EXERCISE_TEXT));
        }
        block.append(intro);
        if (exercise) {
            return block;
        }
        const samples = getSamples();
        if (samples.length) {
            intro.append(el("p", "results-empty-text", EMPTY_SAMPLES_TEXT));
            const list = el("ul", "results-samples");
            list.setAttribute("aria-label", EMPTY_SAMPLES_LABEL);
            for (const sample of samples) {
                const item = el("li");
                const choose = el("button", "results-sample");
                choose.type = "button";
                // The button's name is what it shows (WCAG 2.5.3), the label and the SQL on one
                // line; the SQL is cut at SAMPLE_SQL_CHARS characters, beyond what the line ever
                // shows, so a long sample is not read out whole.
                choose.append(el("span", "results-sample-label", cut(sample.label, SAMPLE_LABEL_CHARS)), el("span", "results-sample-sql", sampleText(sample.sql)));
                choose.addEventListener("click", () => {
                    // fills the editor as one change the student can undo; nothing runs
                    ui.editor.fill(sample.sql);
                });
                item.append(choose);
                list.append(item);
            }
            block.append(list);
        } else if (getDatabase()) {
            // a database with no tables and no samples: what to do, and where to read more
            intro.append(el("p", "results-empty-text", EMPTY_DATABASE_TEXT));
            const links = el("p", "results-empty-links");
            const about = el("a", null, emptyAboutText(APP_NAME));
            about.href = "about.html";
            const functions = el("a", null, EMPTY_FUNCTIONS_TEXT);
            functions.href = "https://sqlite.org/lang_corefunc.html";
            functions.target = "_blank";
            functions.rel = "noopener noreferrer";
            const dot = el("span", null, "·");
            dot.setAttribute("aria-hidden", "true");
            links.append(about, " ", dot, " ", functions);
            block.append(links);
        }
        return block;
    }

    // what the last "no result yet" was drawn with
    let lastEmpty = {};

    // What the pane showed when a load began, kept until the load ends, so a load that fails or is
    // given up while a database stays open can put it back: its nodes, its state, the summary line
    // and the CSV on offer. Any other state drawn meanwhile (a run, a new "no result yet") drops it.
    let beforeLoad = null;

    // ("Running…" of a run that a load overtook is not part of the view: it never comes back)
    const isRunning = (node) => node.nodeType === Node.ELEMENT_NODE && node.classList.contains("results-running");

    function snapshot() {
        return {
            nodes: [...ui.result.childNodes].filter((node) => !isRunning(node)),
            state: pane.dataset.state,
            status: [...ui.status.childNodes],
            offered,
            table,
        };
    }

    function restore() {
        const kept = beforeLoad;
        beforeLoad = null;
        if (!kept || !getDatabase() || !kept.state || kept.state === "loading") {
            return false;
        }
        offered = kept.offered;
        table = kept.table;
        ui.result.replaceChildren(...kept.nodes);
        setState(kept.state);
        setSummary(...kept.status);
        button.hidden = !(offered && table && table.isConnected);
        return true;
    }

    const view = {
        // a result with rows is on screen: the Export menu offers it too
        canDownload: onScreen,
        download,

        // result: {columns, values} of the run's last result set, or null when no statement
        // returned one; changes: rows the run changed (null when it ran no INSERT, UPDATE or DELETE)
        showResult(result, elapsed, { changes = null, quiet = false } = {}) {
            beforeLoad = null;
            retire();
            if (!result) {
                ui.result.replaceChildren();
                setState("done");
                setSummary(...withTime(resultDoneText(changes), elapsed));
                if (!quiet) {
                    announce(resultDoneAnnouncement(changes));
                }
                return;
            }
            const total = result.values.length;
            const shown = Math.min(total, ROW_LIMIT);
            const rows = total > shown ? result.values.slice(0, ROW_LIMIT) : result.values;
            const printed = buildResultTable({ columns: result.columns, values: rows }, { popover: popoverElement });
            ui.result.replaceChildren(printed);
            followHeader(printed);
            setState("result");
            setSummary(...withTime(total > shown ? resultCappedText(shown, total) : resultRowsText(total), elapsed));
            if (total) {
                offer(result, printed);
            }
            if (!quiet) {
                announce(total > shown ? resultCappedAnnouncement(shown, total) : resultRowsAnnouncement(total));
            }
        },

        // a run that failed: the engine's exception, or a message of the page's own
        showError(exc, { quiet = false } = {}) {
            if (typeof exc === "string") {
                view.showProblem(exc);
                return;
            }
            beforeLoad = null;
            retire();
            ui.result.replaceChildren(errorBand(exc));
            setState("error");
            setSummary();
            if (!quiet) {
                announce(errorAnnouncement(errorText(exc) || String(exc)));
            }
        },

        // something that is not a query's error went wrong (a load, a link, a set): its band, and
        // under it the empty state of the database that is open, if one is
        showProblem(message) {
            view.showEmpty({ problem: message });
        },

        showEmpty({ variant = "fresh", notice = null, problem = null, said = false } = {}) {
            lastEmpty = { variant, notice, problem };
            beforeLoad = null;
            retire();
            const parts = [];
            if (problem) {
                parts.push(problemBand(problem));
            }
            if (getDatabase()) {
                parts.push(emptyBlock({ variant, notice }));
            }
            ui.result.replaceChildren(...parts);
            setState(problem && !getDatabase() ? "error" : "empty");
            setSummary();
            if (problem) {
                announce(problem);
            } else if (said) {
                announce(EMPTY_TITLE);
            }
        },

        // A load (or the opening of a set) that failed while a database stays open: what the pane
        // showed before the load comes back, and the failure's band goes above it. With no database
        // open there is nothing to come back to: the error band alone. ownLoad false: the failure
        // is not the load's own (a set that cannot be opened while another load is on its way), so
        // the view, a loading state included, is left as it is and the band goes above it.
        loadFailed(message, { ownLoad = true } = {}) {
            if (ownLoad) {
                restore();
            }
            const state = pane.dataset.state;
            if (getDatabase() && state && (state !== "loading" || !ownLoad)) {
                problemSlot.replaceChildren(problemBand(message));
                problemSlot.hidden = false;
                announce(message);
                return;
            }
            view.showProblem(message);
        },

        // a load that was given up (another choice took over, a set closed while its database
        // loaded): what the pane showed comes back, or "no result yet"
        loadCancelled() {
            if (!restore()) {
                view.showEmpty();
            }
        },

        // a Check's verdict, in words (the banner above the state is not a live region)
        say(text) {
            announce(text);
        },

        // "no result yet", if it shows, drawn again (exercise mode began or ended)
        refreshEmpty() {
            if (pane.dataset.state === "empty") {
                view.showEmpty(lastEmpty);
            }
        },

        // name: what is loading, if it is known yet; size: its size in bytes, if known
        showLoading({ name = null, size = 0 } = {}) {
            // the first load of a series keeps what was on screen before it (a load that takes over
            // from another one keeps the same)
            if (!beforeLoad && pane.dataset.state !== "loading") {
                beforeLoad = snapshot();
            }
            // the offer of a CSV stays with the snapshot, not with the loading state
            offered = null;
            table = null;
            button.hidden = true;
            const block = el("div", "results-loading");
            const title = el("h2", "results-loading-title", loadingTitle(name));
            title.id = "results-loading-title";
            const sizeLine = el("p", "results-loading-size", loadingSizeText(0, size));
            const bar = el("progress", "results-progress");
            bar.max = 1;
            if (size) {
                bar.value = 0;
            }
            bar.setAttribute("aria-labelledby", title.id);
            block.append(title, sizeLine, bar);
            ui.result.replaceChildren(block);
            setState("loading");
            setSummary();
            const current = () => block.isConnected;
            return {
                name(next) {
                    if (current()) {
                        title.textContent = loadingTitle(next);
                    }
                },
                // loaded bytes of total (0: unknown, the bar waits without moving)
                progress(loaded, total) {
                    if (!current()) {
                        return;
                    }
                    const known = total > 0 && loaded <= total;
                    sizeLine.textContent = loadingSizeText(loaded, known ? total : 0);
                    if (known) {
                        bar.value = loaded / total;
                    } else {
                        bar.removeAttribute("value");
                    }
                },
            };
        },

        startRun() {
            const overlay = el("div", "results-running", RUNNING_TEXT);
            overlay.setAttribute("aria-hidden", "true");
            (summary.hidden ? ui.result : summary).append(overlay);
            return () => overlay.remove();
        },
    };
    return view;
}
