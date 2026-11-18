// The dialog of the export of tables as CSV (assessment plan, section 5; its Phase 3, flag
// "export"): every table and view of the open database with its row count and a tick box, and
// under them what Export will save. While the export runs the same dialog shows its progress,
// with Cancel. It is built like the import's (js/lab/import-dialog.js): the parts that differ are
// the list, which is counted one table at a time after the dialog is on screen, and the end of an
// export, which can leave the dialog open with a note.
//
//   mountTableExportDialog({returnFocus, getDatabase, list, count, plan, onExport})
//       -> {open() -> boolean, isOpen()}
//     returnFocus   an object with focus(): where the keyboard focus goes when the dialog closes
//                   and the place it was in before has gone
//     getDatabase() the open database, or null
//     list(database)           -> [{name, kind: "table" | "view"}], in the order to show
//     count(database, name)    -> the number of rows; throws when it cannot be counted
//     plan(database, names)    -> what will be saved for these table names, in this order
//                              (planOutput of js/lab/export-csv.js), or null for none
//     onExport(job, {progress, cancelled}) -> Promise<outcome>
//                   job is {database, tables: [{name, count}], plan}: the database the dialog was
//                   opened with, the ticked rows in the dialog's order, and the very plan that
//                   was on show. The caller does the export: it calls progress({library: true})
//                   while it waits for the zip tool and then progress({at, of, name, rows, count,
//                   doneRows, allRows}) after each piece of work, and looks at cancelled() between
//                   two pieces. outcome is {ok: true, fileName, notes: [{kind: "blob", tables}]},
//                   or {ok: false, message, table?, reason?} (nothing was saved: the message is
//                   shown and the dialog stays, and the row of `table` says that it could not be
//                   read, with `reason`, and can no longer be ticked), or {ok: false, cancelled:
//                   true} (the dialog has closed, or is closing).
//     open()        opens the dialog for the open database, and says whether it did: false when
//                   the database has no table or view to list (nothing opens then)
//
// Nothing is ticked when the dialog opens, except when there is exactly one table or view. With
// two or more there is one more tick box above the list, "All tables and views". Every text is
// made with textContent: a table's name comes from a database.
//
// A row is counted when the dialog is on screen, one table at a time with a turn for the page
// between two (js/lab/import-pace.js), and Export waits until all are counted. A count changes its
// own row and nothing else, so the list is not gone through again for each one. A table that
// cannot be counted stays in the list with its reason and cannot be ticked. A count that fails
// because the database was closed under the dialog is not a table's failure and is not shown, and
// a count that arrives for a dialog that has closed, or opened again, is dropped.
//
// Export, when it cannot be pressed, is aria-disabled and not disabled: it keeps its place in the
// Tab order, and the line beside it (#export-tables-hold) says why, for a keyboard or a screen
// reader user. That line is always in the page, and its text is set. A tick box that cannot be
// ticked is aria-disabled too, the one for all included: the focus stays where it is when a count
// takes the last tickable row away.
//
// Closing the dialog while an export runs, by Cancel, by Escape or in any other way, closes it at
// once and tells the export to stop; it notices at its next look and saves nothing. (Only a
// closing that comes after the last piece has been written is too late: the file is saved, and the
// toast and the evidence log say so.) A database that opens while the dialog is idle closes it
// (Back and Forward reach the page under a dialog).
//
// A key that is held down repeats. Enter held a moment too long on the menu entry would press
// Export in a dialog that has only just opened, and Enter held on Export would press Cancel, which
// has the focus once the export runs: a repeated Enter does nothing in this dialog. Nor does it
// once the dialog has closed under the key (a small table is exported before the key is let go, and
// Cancel and Close close at the first press): the repeats would go to the button that gets the
// focus back, which opens the Export menu, and on to the menu's first entry. They are taken away
// until the key is let go (js/lab/held-enter.js, which also says what it does not cover: Enter held
// on the Export button itself).
//
// The dialog is a column of two parts (css/export-tables.css): what scrolls (the list and the
// progress) and, under it, what stays in reach (the line beside Export, the alert line, Export and
// Cancel).

import {
    EXPORT_TABLES_ALL_LABEL,
    EXPORT_TABLES_CANCEL_TEXT,
    EXPORT_TABLES_CLOSE_TEXT,
    EXPORT_TABLES_COUNTING,
    EXPORT_TABLES_FAILED_MESSAGE,
    EXPORT_TABLES_HOLD_COUNTING,
    EXPORT_TABLES_HOLD_NONE,
    EXPORT_TABLES_HOLD_NOTHING,
    EXPORT_TABLES_LIST_LABEL,
    EXPORT_TABLES_PROGRESS_LIBRARY,
    EXPORT_TABLES_SUBMIT_TEXT,
    EXPORT_TABLES_TEXT_LINE,
    EXPORT_TABLES_TITLE,
    EXPORT_TABLES_VIEW_WORD,
    exportTablesBlobNote,
    exportTablesProgressRows,
    exportTablesProgressTitle,
    exportTablesRowsText,
    exportTablesSavedAsText,
    exportTablesUncountedText,
    exportTablesUnreadText,
    exportTablesWillSaveText,
} from "./config-workflow.js";
import { swallowHeldEnter } from "./held-enter.js";
import { newPace, nextFrame } from "./import-pace.js";
import { engineLine } from "./runner.js";

function el(tag, props = {}, text = "") {
    const node = document.createElement(tag);
    Object.assign(node, props);
    if (text) {
        node.textContent = text;
    }
    return node;
}

export function mountTableExportDialog({ returnFocus, getDatabase, list, count, plan, onExport }) {
    const dialog = el("dialog", { id: "export-tables-dialog", className: "app-dialog tables-dialog" });
    dialog.setAttribute("aria-labelledby", "export-tables-title");
    dialog.setAttribute("aria-describedby", "export-tables-text");
    const form = el("form", { id: "export-tables-form", className: "tables-form", noValidate: true });

    // ---- the list
    const allBox = el("input", { type: "checkbox", id: "export-tables-all" });
    const allLabel = el("label", { className: "tables-check", htmlFor: allBox.id });
    allLabel.append(allBox, el("span", {}, EXPORT_TABLES_ALL_LABEL));
    const all = el("div", { className: "tables-all", hidden: true });
    all.append(allLabel);
    // (some browsers drop the role of a list that shows no markers: this one says it is a list, as
    // the exercise lists of index.html do)
    const rowList = el("ul", { className: "tables-list" });
    rowList.setAttribute("role", "list");
    rowList.setAttribute("aria-label", EXPORT_TABLES_LIST_LABEL);

    // ---- while it runs
    const progress = el("div", { className: "tables-progress", hidden: true });
    const progressTitle = el("h3", { id: "export-tables-progress-title", className: "results-loading-title" });
    const progressPart = el("p", { className: "results-loading-size" });
    const progressBar = el("progress", { className: "results-progress", max: 1 });
    progressBar.setAttribute("aria-labelledby", progressTitle.id);
    progress.append(progressTitle, progressPart, progressBar);
    // says the heading of the progress when it changes, and nothing else: that the zip tool is
    // being loaded, then each table as its turn comes; not a stream of numbers (it sits outside
    // the block that is busy)
    const status = el("p", { id: "export-tables-status", className: "visually-hidden" });
    status.setAttribute("role", "status");

    // ---- how an export that left something to say ends
    const note = el("p", { id: "export-tables-note", className: "tables-note", hidden: true });

    // ---- the foot: why Export is off, or what it saves; what went wrong; the buttons
    const hold = el("p", { id: "export-tables-hold", className: "app-dialog-hint tables-hold" });
    hold.setAttribute("role", "status");
    const error = el("p", { id: "export-tables-error", className: "app-dialog-error", hidden: true });
    error.setAttribute("role", "alert");
    const submit = el("button", { type: "submit", id: "export-tables-submit", className: "button button--primary" }, EXPORT_TABLES_SUBMIT_TEXT);
    submit.setAttribute("aria-describedby", hold.id);
    const cancel = el("button", { type: "button", id: "export-tables-cancel", className: "button" }, EXPORT_TABLES_CANCEL_TEXT);
    const actions = el("div", { className: "app-dialog-actions" });
    actions.append(submit, cancel);

    // what the dialog is for: it is not on show beside the note an export ends with
    const intro = el("p", { id: "export-tables-text", className: "app-dialog-text" }, EXPORT_TABLES_TEXT_LINE);
    const body = el("div", { className: "tables-body" });
    body.append(
        el("h2", { id: "export-tables-title", className: "app-dialog-title" }, EXPORT_TABLES_TITLE),
        intro,
        all,
        rowList,
        progress,
        status,
        note
    );
    const foot = el("div", { className: "tables-foot" });
    foot.append(hold, error, actions);
    form.append(body, foot);
    dialog.append(form);
    document.body.append(dialog);

    // Every way out of the dialog, and every new opening, starts a new session: a count that was
    // still on its way for an older one is dropped when it arrives.
    let session = 0;
    // is the dialog showing a session that has not been ended yet (open() to endSession())
    let live = false;
    let database = null;
    // [{name, kind, count, problem, ticked, saved, box, line, shown}]: `saved` is the name of the
    // row's file when that is not simply the table's name and .csv, or ""
    let rows = [];
    let counting = false;
    // the export that is running: {stop}
    let running = null;
    // what Export would save for the ticked rows now
    let current = null;
    let ended = false;
    let announced = 0;

    const tickable = (row) => row.problem === "";
    const ticked = () => rows.filter((row) => row.ticked && tickable(row));

    // is what a count or an export was made for gone: the dialog has closed or opened again, or
    // the database it opened with is not the open one, or has been closed
    function gone(mine) {
        if (mine !== session || getDatabase() !== database) {
            return true;
        }
        try {
            return !database.db.isOpen();
        } catch {
            return true;
        }
    }

    // ---- rows

    // what a row says under its name
    function lineText(row) {
        if (row.problem) {
            return row.problem;
        }
        return row.count === null ? EXPORT_TABLES_COUNTING : exportTablesRowsText(row.count);
    }

    function newRow(object, n) {
        const id = `export-tables-row-${n}`;
        const box = el("input", { type: "checkbox", id, className: "tables-row-box" });
        const label = el("label", { className: "tables-row-label", htmlFor: id });
        label.append(el("span", { className: "tables-row-name" }, object.name));
        if (object.kind === "view") {
            label.append(" ", el("span", { className: "tables-row-kind" }, EXPORT_TABLES_VIEW_WORD));
        }
        const line = el("p", { id: `${id}-line`, className: "tables-row-line" });
        box.setAttribute("aria-describedby", line.id);
        const item = el("li", { className: "tables-row" });
        item.append(box, label, line);
        const row = { name: object.name, kind: object.kind, count: null, problem: "", ticked: false, saved: "", box, line, shown: null };
        // A row that cannot be ticked keeps its place in the Tab order, so that its reason is
        // read, and a press leaves it as it is.
        box.addEventListener("click", (event) => {
            if (!tickable(row)) {
                event.preventDefault();
            }
        });
        box.addEventListener("change", () => {
            row.ticked = box.checked && tickable(row);
            refresh();
        });
        return { row, item };
    }

    // one row's own parts: its tick, whether it can be ticked, and its line
    function paintRow(row) {
        row.box.checked = row.ticked && tickable(row);
        if (tickable(row)) {
            row.box.removeAttribute("aria-disabled");
        } else {
            row.box.setAttribute("aria-disabled", "true");
        }
        const words = lineText(row);
        const shown = `${words}\n${row.saved}`;
        if (row.shown !== shown) {
            row.shown = shown;
            row.line.replaceChildren(el("span", { className: "tables-row-count" }, words));
            if (row.saved) {
                row.line.append(" ", el("span", { className: "tables-row-saved" }, exportTablesSavedAsText(row.saved)));
            }
        }
    }

    // brings every part of the dialog in line with the rows
    function refresh() {
        const chosen = ticked();
        current = chosen.length ? plan(database, chosen.map((row) => row.name)) : null;
        for (const row of rows) {
            row.saved = "";
        }
        if (current) {
            // (the file's name is said only when it is not the table's name and .csv)
            chosen.forEach((row, i) => {
                const entry = current.entries[i];
                row.saved = entry.renamed ? entry.name : "";
            });
        }
        rows.forEach(paintRow);
        const open = rows.filter(tickable);
        allBox.checked = open.length > 0 && chosen.length === open.length;
        allBox.indeterminate = chosen.length > 0 && chosen.length < open.length;
        if (open.length) {
            allBox.removeAttribute("aria-disabled");
        } else {
            allBox.setAttribute("aria-disabled", "true");
        }
        let why;
        if (counting) {
            why = EXPORT_TABLES_HOLD_COUNTING;
        } else if (!open.length) {
            why = EXPORT_TABLES_HOLD_NOTHING;
        } else if (!current) {
            why = EXPORT_TABLES_HOLD_NONE;
        } else {
            why = exportTablesWillSaveText(current);
        }
        if (hold.textContent !== why) {
            hold.textContent = why;
        }
        submit.setAttribute("aria-disabled", String(counting || !current));
    }

    // (with nothing to tick it keeps the focus and its place in the Tab order, and a press leaves it as it is)
    allBox.addEventListener("click", (event) => {
        if (!rows.some(tickable)) {
            event.preventDefault();
        }
    });
    allBox.addEventListener("change", () => {
        const on = allBox.checked;
        for (const row of rows) {
            row.ticked = on && tickable(row);
        }
        refresh();
    });

    // ---- the parts of the dialog that change together

    function showError(message) {
        error.textContent = message;
        error.hidden = false;
    }

    function clearError() {
        error.textContent = "";
        error.hidden = true;
    }

    // what shows: the list (idle), the progress (running), or the note (the end of an export)
    function show(state) {
        const listing = state === "list";
        all.hidden = !(listing && rows.length > 1);
        rowList.hidden = !listing;
        hold.hidden = !listing;
        submit.hidden = !listing;
        progress.hidden = state !== "running";
        note.hidden = state !== "note";
        intro.hidden = state === "note";
        if (state === "running") {
            progress.setAttribute("aria-busy", "true");
        } else {
            progress.removeAttribute("aria-busy");
        }
        cancel.textContent = state === "note" ? EXPORT_TABLES_CLOSE_TEXT : EXPORT_TABLES_CANCEL_TEXT;
        if (state === "note") {
            dialog.setAttribute("aria-describedby", note.id);
            cancel.setAttribute("aria-describedby", note.id);
        } else {
            dialog.setAttribute("aria-describedby", "export-tables-text");
            cancel.removeAttribute("aria-describedby");
        }
    }

    // ---- the counts

    async function countAll(mine) {
        const pace = newPace();
        await nextFrame();
        for (const row of rows) {
            if (gone(mine)) {
                return;
            }
            let failed = false;
            try {
                row.count = count(database, row.name);
            } catch (failure) {
                if (gone(mine)) {
                    // (the database was closed under the dialog, which is closing: not this table's failing)
                    return;
                }
                row.problem = exportTablesUncountedText(engineLine(failure));
                row.ticked = false;
                failed = true;
            }
            // (a count changes its own row; one that failed can also change what is ticked, and so
            // the names of the files and the box for all)
            if (failed) {
                refresh();
            } else {
                paintRow(row);
            }
            await pace.rest();
        }
        if (gone(mine)) {
            return;
        }
        counting = false;
        refresh();
    }

    // Nothing in countAll is expected to throw. If something does, the dialog must not wait for
    // ever: the rows that have no count yet say why, and cannot be ticked.
    function countingFailed(mine, failure) {
        console.debug("the tables could not be counted", failure);
        if (gone(mine)) {
            return;
        }
        for (const row of rows) {
            if (row.count === null && !row.problem) {
                row.problem = exportTablesUncountedText(engineLine(failure));
                row.ticked = false;
            }
        }
        counting = false;
        refresh();
    }

    // ---- opening and closing

    function open() {
        const opening = getDatabase();
        const objects = list(opening);
        if (!objects.length) {
            return false;
        }
        session++;
        live = true;
        const mine = session;
        database = opening;
        ended = false;
        running = null;
        announced = 0;
        status.textContent = "";
        clearError();
        const made = objects.map(newRow);
        rows = made.map((one) => one.row);
        rowList.replaceChildren(...made.map((one) => one.item));
        // (the one table or view of a database is ticked: there is nothing to choose between)
        if (rows.length === 1) {
            rows[0].ticked = true;
        }
        counting = true;
        show("list");
        refresh();
        if (!dialog.open) {
            dialog.showModal();
        }
        (rows.length > 1 ? allBox : rows[0].box).focus();
        countAll(mine).catch((failure) => countingFailed(mine, failure));
        return true;
    }

    // The dialog is closing, whichever way: what it was waiting for is dropped, an export that is
    // running is told to stop, and a key that is still held down presses nothing on the page.
    // Once for each closing, the first time the page hears of it: the browser tells of a closing
    // again a moment after the fact (the listener for "close", below), and a key that was let go
    // and pressed again by then is not a held key any more.
    function endSession() {
        if (!live) {
            return;
        }
        live = false;
        session++;
        if (running) {
            running.stop = true;
            running = null;
        }
        counting = false;
        swallowHeldEnter();
    }

    function close() {
        endSession();
        if (dialog.open) {
            dialog.close();
        }
        restoreFocus();
    }

    // When the dialog closes the browser gives the focus back to what had it before; when that is
    // gone (the menu entry that opened the dialog was in a menu that has closed), the focus would
    // be left on the page as a whole: it goes to returnFocus then.
    function restoreFocus() {
        const focused = document.activeElement;
        if (!focused || focused === document.body || dialog.contains(focused)) {
            returnFocus.focus();
        }
    }

    // ---- the export

    async function exportNow() {
        if (running || ended || submit.getAttribute("aria-disabled") === "true" || !current) {
            return;
        }
        clearError();
        const mine = session;
        const chosen = ticked();
        const job = {
            database,
            tables: chosen.map((row) => ({ name: row.name, count: row.count })),
            plan: current,
        };
        const state = { stop: false };
        running = state;
        // (each export says its own tables: nothing of an earlier one is left to be read)
        announced = 0;
        status.textContent = "";
        progressTitle.textContent = current.library
            ? EXPORT_TABLES_PROGRESS_LIBRARY
            : exportTablesProgressTitle(1, chosen.length, chosen[0].name);
        progressPart.textContent = "";
        progressBar.value = 0;
        show("running");
        cancel.focus();
        let outcome;
        try {
            outcome = await onExport(job, {
                cancelled: () => state.stop,
                progress(info) {
                    if (info.library) {
                        progressTitle.textContent = EXPORT_TABLES_PROGRESS_LIBRARY;
                        progressPart.textContent = "";
                        progressBar.value = 0;
                        status.textContent = EXPORT_TABLES_PROGRESS_LIBRARY;
                        return;
                    }
                    const title = exportTablesProgressTitle(info.at, info.of, info.name);
                    progressTitle.textContent = title;
                    progressPart.textContent = exportTablesProgressRows(info.rows, info.count);
                    progressBar.value = info.allRows > 0 ? Math.min(1, info.doneRows / info.allRows) : 0;
                    if (info.at !== announced) {
                        announced = info.at;
                        status.textContent = title;
                    }
                },
            });
        } catch (failure) {
            // (the export answers with an outcome whatever happens; should it throw all the same,
            // the dialog still says that nothing was exported)
            console.debug("the export threw", failure);
            outcome = { ok: false, message: EXPORT_TABLES_FAILED_MESSAGE };
        }
        if (mine !== session) {
            // the dialog was closed meanwhile: the export was told to stop. It has saved nothing,
            // unless its last piece was already written (then its file is saved, and its toast
            // says so). Either way nothing of it is shown in a dialog that has gone, or in the one
            // that was opened after it.
            return;
        }
        running = null;
        // (the line that named each table is for the export that runs: it says nothing after it)
        announced = 0;
        status.textContent = "";
        if (outcome.ok) {
            const blobs = (outcome.notes ?? []).find((one) => one.kind === "blob");
            if (!blobs) {
                endSession();
                dialog.close();
                return;
            }
            // something to add: the dialog stays, with one note and a Close button
            ended = true;
            note.textContent = exportTablesBlobNote(outcome.fileName, blobs.tables);
            show("note");
            cancel.focus();
            return;
        }
        show("list");
        if (outcome.table !== undefined) {
            const failed = rows.find((row) => row.name === outcome.table);
            if (failed) {
                // (the database cannot change under this dialog, so another try would fail the
                // same way: the row keeps the engine's words and cannot be ticked again)
                failed.problem = exportTablesUnreadText(outcome.reason ?? "");
                failed.ticked = false;
            }
        }
        refresh();
        if (outcome.message) {
            showError(outcome.message);
        }
        cancel.focus();
    }

    form.addEventListener("submit", (event) => {
        event.preventDefault();
        exportNow();
    });
    cancel.addEventListener("click", close);
    // A database that opens while the dialog is open and idle is not the one its list was made
    // for (Back and Forward reach the page under a dialog): the dialog closes. Not while an export
    // runs: the page opens no database then.
    document.addEventListener("lab:database-loaded", () => {
        if (dialog.open && !running) {
            close();
        }
    });
    // Escape. The browser tells of it here before it closes the dialog; of the closing itself it
    // tells only later (below). Two things come in between. A step of the export that was already
    // waiting for its turn: it would see no Cancel, and could save a file for a dialog that has
    // gone. And a key that is held down, which repeats on the page as soon as the dialog has
    // gone. So the session ends now: the export is told to stop, and a held key presses nothing.
    // (A key that the browser hands over only after the last piece has been written is too late,
    // like a press on Cancel then: the file is saved, and the toast and the evidence log say so.)
    // Only the dialog's own event is Escape: one that comes up from inside it (a file chooser
    // that is dismissed tells of itself with an event of this name) closes nothing.
    dialog.addEventListener("cancel", (event) => {
        if (event.target === dialog) {
            endSession();
        }
    });
    // Any other way the browser closes a dialog, and the focus after every closing. The event
    // arrives after the fact: by then the dialog can be open again, and that opening is not this
    // event's to end. (A session that close() or Escape has ended already is not ended twice.)
    dialog.addEventListener("close", () => {
        if (dialog.open) {
            return;
        }
        endSession();
        restoreFocus();
    });
    // a key held down (the head of this file says why)
    dialog.addEventListener("keydown", (event) => {
        if (event.key === "Enter" && event.repeat) {
            event.preventDefault();
        }
    });

    return {
        open,
        isOpen: () => dialog.open,
    };
}
