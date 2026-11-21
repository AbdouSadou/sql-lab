// The import's dialog (assessment plan, section 3, "Preview dialog"): one tab for each file,
// with the first rows exactly as read, the settings the reading used (all changeable), the name
// of the table it will make, and where the tables go. Nothing is imported before the student
// presses Import. While the import runs the same dialog shows its progress, with Cancel.
//
//   mountImportDialog({returnFocus, getDestination, loadReader, excel, onImport}) -> {open(files)}
//     returnFocus       an object with focus(): where the keyboard focus goes when the dialog
//                       closes and the place it was in before has gone (otherwise the browser
//                       puts it back there)
//     getDestination()  -> {name, allowed, taken()}: the open database's name (null when none is
//                       open), whether files may be imported into it (never into a course
//                       database), and the names a new table cannot have there: a Map of keys
//                       (sameNameKey), each with true when the name is a temporary table's or
//                       view's alone, which is in no database
//     loadReader()      -> Promise<Papa>, the CSV library, loaded on demand; a rejection is told
//                       to the student in every tab that needed it
//     excel             null (the dialog of the import alone: a workbook is refused, and nothing
//                       of what follows exists), or, with the flag excel-import on,
//                       {loadLibrary, inspectWorkbook, readWorkbook}: what reads a workbook
//                       (js/lab/import-workbook.js; loadLibrary() -> Promise<XLSX>, loaded on demand)
//     onImport(job, {progress, cancelled}) -> Promise<outcome>
//                       job is {files: [entry], destination: {kind: "new", name} or {kind: "open"},
//                       left: [{name, why}]}, files in the order of the tabs, a workbook's sheets
//                       together. left names, in the tabs' order, each file that gives no table in
//                       this import, with the words its tab says to a screen reader (a refused
//                       file, a file the student left out, a workbook with no sheet ticked). An entry is a text
//                       file, {id, file, encoding, delimiter, newline, hasNames, namesRow, tableName,
//                       mark}, or a sheet that is ticked, {id, file, sheet, hasNames, namesRow,
//                       tableName, listed}: sheet is the sheet as js/lab/import-cells.js made it, and
//                       listed how many sheets its workbook lists. The caller runs the import: it
//                       calls progress({at, of, name, table, part, done, total}) as it goes (table is
//                       the name of the table of a sheet, null for a text file; at and of count the
//                       entries) and looks at cancelled() between two pieces of work. outcome is
//                       {ok: true}, or {ok: false, message} (nothing was imported: the message is
//                       shown, and the dialog stays), or {ok: false, refused: {id, reason}} (that
//                       file cannot be imported: its tab says why, and the others can be tried
//                       again), or {ok: false, cancelled: true} (the import was told to stop: the
//                       dialog has closed by then, and does not look at it).
//
// What a file is, is decided from its bytes before its name (js/lab/import-text.js), except for a
// name ending in .xlsm, .xlsb or .ods: such a file is refused by its name, and none of its bytes
// are read. A file that cannot be imported gets a tab with its reason, and the others can still be imported; with
// nothing left to import, the dialog offers only Close. A file over IMPORT_TEXT_WARN_BYTES asks
// first, in its tab, before it is read: it is read, or it is left out, which is a refusal of the
// student's own (the others can be imported without it; its tab's sign is a quiet one, since
// nothing went wrong). Every text here is built with textContent: file names, and what a file
// holds, are untrusted.
//
// A file that cannot be read as it is, is refused. A reading that the student's own choice of
// delimiter or encoding made impossible (a row of more than 2,000 fields, no complete row) is
// said in the tab instead, with Import off until the choice is changed: it is theirs to change
// back. While a tab is read again after a change, Import waits, so that the settings on show
// are always the settings used; and each file's text is marked when it is previewed, for the
// import to know the same text again (js/lab/import-text.js, markOf).
//
// A workbook (only with excel set): its tab is the file through every step before its sheets are
// known (reading, the question for a large one, a refusal, left out), as a text file's is. The
// workbooks of a dialog are read one at a time, in the order they ask (the bytes of two are never held
// together). When one has been read, its panel holds its sheets: a strip of tabs of their own for two
// sheets or more, and the sheet itself for one. A sheet is a unit like a text file's tab: it has a
// table name, a row of names, a preview and a tick (a text file is always ticked); its panel is built
// when it is first shown, and what it is set to is kept whether it has been built or not. A hidden
// sheet is listed and not ticked; one that holds nothing, or is too wide, or damaged, is listed and
// cannot be ticked (its tick box is aria-disabled and its click stopped). Names are suggested for
// every sheet that can be ticked, ticked or not, so that ticking changes none; Import is held up by a
// ticked sheet whose row of names is no row of it, never by one that is not ticked, and when nothing
// is ticked at all. A sheet's cells are reached only through previewRows and sheetTableName
// (js/lab/import-cells.js); the import reaches them through the sheet it is handed. Enter in a tick box
// that can be used submits the form, as it does in any field of it (the import then runs); in the box of a
// sheet that cannot be ticked it does nothing, as Space and a click do not change it.
//
// With the open database as the destination, a name that the dialog suggested and had to make unique
// because the database already has the natural one (Staff becomes Staff_2) has a line of its own under
// the field that says so (importNameMadeUniqueNote); when it is a TEMP table or view that has the name,
// which is in no database, the line says that instead (importNameMadeUniqueTemporaryNote). It is a note,
// not a fault: Import is not held, the field is not invalid, nothing is announced and nothing scrolls. It
// goes when the student types in the field, or the destination becomes a new database; a name that is
// made unique only by an earlier file or sheet of the same choice has none.
//
// Closing the dialog while an import runs, by Cancel or by Escape (which a page cannot hold
// back), cancels the import: the caller undoes it, and nothing is left behind. A database that
// opens while the dialog is open and idle (Back and Forward reach the page under a dialog)
// closes it: its destination and its names were worked out for the database that was open.
//
// The dialog is a column of two parts (css/import.css): what scrolls (.import-body: the
// destination, the tabs and their panels, the progress) and, under it, what stays in reach
// whatever is scrolled (.import-foot: why Import is off, what went wrong with the import, and
// Import and Cancel). The foot is beside what scrolls, never over it: no control can lie under
// the buttons, and a message of the dialog is in view when it appears. A control that takes the
// focus is scrolled wholly into view: Chromium does that by itself; Firefox scrolls a focused
// control only when less than a line of it can be seen (to the middle, then), which left a tall
// one, the preview, cut off: so the dialog does it (the listener for "focusin", below), though
// never while a pointer is pressed on the control. And when the foot grows by a line (why Import
// is off), which takes that much of the body from below, a control that has the focus and was
// whole is brought back whole, once no pointer is down; nothing else is moved then.

import {
    IMPORT_CANCEL_TEXT,
    IMPORT_CLOSE_TEXT,
    IMPORT_COURSE_DATABASE_NOTE,
    IMPORT_DELIMITER_LABEL,
    IMPORT_DELIMITER_NAMES,
    IMPORT_DESTINATION_LABEL,
    IMPORT_DIALOG_TEXT,
    IMPORT_DIALOG_TEXT_WITH_SHEETS,
    IMPORT_DIALOG_TITLE,
    IMPORT_EMPTY_REASON,
    IMPORT_ENCODING_LABEL,
    IMPORT_ENCODING_NAMES,
    IMPORT_HAS_NAMES_LABEL,
    IMPORT_HAS_NAMES_SHEET_LABEL,
    IMPORT_HOLD_NO_SHEET_MESSAGE,
    IMPORT_LARGE_FILE_CONTINUE_TEXT,
    IMPORT_LARGE_FILE_LEAVE_TEXT,
    IMPORT_LEFT_OUT_REASON,
    IMPORT_LEFT_OUT_TAB_TEXT,
    IMPORT_LIBRARY_FAILED_MESSAGE,
    IMPORT_NAME_EMPTY_MESSAGE,
    IMPORT_NAME_RESERVED_MESSAGE,
    IMPORT_NAME_TEMPORARY_MESSAGE,
    IMPORT_NAME_TWICE_MESSAGE,
    IMPORT_NAME_TWICE_SHEET_MESSAGE,
    IMPORT_NAMES_ROW_LABEL,
    IMPORT_NAMES_ROW_NOT_A_ROW_MESSAGE,
    IMPORT_NEW_DATABASE_EMPTY_MESSAGE,
    IMPORT_NEW_DATABASE_LABEL,
    IMPORT_NEW_DATABASE_NAME_LABEL,
    IMPORT_NO_ROW_REASON,
    IMPORT_NOT_TEXT_REASON,
    IMPORT_PREVIEW_BLANK,
    IMPORT_PREVIEW_LABEL,
    IMPORT_PREVIEW_LEFT_OUT,
    IMPORT_PREVIEW_NAMES,
    IMPORT_PREVIEW_NO_DATA_MESSAGE,
    IMPORT_PREVIEW_ROW_HEADING,
    IMPORT_PROGRESS_COPYING,
    IMPORT_PROGRESS_READING,
    IMPORT_READING_TEXT,
    IMPORT_REFUSED_TAB_TEXT,
    IMPORT_SETTINGS_NO_ROW_MESSAGE,
    IMPORT_SETTINGS_TOO_WIDE_MESSAGE,
    IMPORT_SHEET_DAMAGED_REASON,
    IMPORT_SHEET_EMPTY_REASON,
    IMPORT_SHEET_HIDDEN_NOT_TICKED_TEXT,
    IMPORT_SHEET_HIDDEN_NOTE,
    IMPORT_SHEET_HIDDEN_TICKED_TEXT,
    IMPORT_SHEET_HIDDEN_WORD,
    IMPORT_SHEET_NO_VALUES_TEXT,
    IMPORT_SHEET_NOT_TICKED_TEXT,
    IMPORT_SHEET_TICK_LABEL,
    IMPORT_SHEET_TICKED_TEXT,
    IMPORT_SHEET_WIDE_REASON,
    IMPORT_SUBMIT_TEXT,
    IMPORT_TAB_NOTHING_TICKED_TEXT,
    IMPORT_TABLE_NAME_HINT,
    IMPORT_TABLE_NAME_LABEL,
    IMPORT_TABS_LABEL,
    IMPORT_TEXT_MAX_BYTES,
    IMPORT_TEXT_WARN_BYTES,
    IMPORT_TICK_ALL_SHEETS_TEXT,
    IMPORT_TOO_LARGE_REASON,
    IMPORT_TOO_WIDE_REASON,
    IMPORT_UNREADABLE_REASON,
    IMPORT_WORKBOOK_NO_MEMORY_REASON,
    IMPORT_UNTICK_ALL_SHEETS_TEXT,
    IMPORT_WORKBOOK_REASON,
    INSPECT_SLICE_BYTES,
    PREVIEW_BYTES,
    PREVIEW_ROWS,
    importEncodingMessage,
    importHoldProblemMessage,
    importHoldReadingMessage,
    importHoldSheetProblemMessage,
    importHoldWaitingMessage,
    importLargeFileMessage,
    importLargeWorkbookMessage,
    importNameMadeUniqueNote,
    importNameMadeUniqueTemporaryNote,
    importNameTakenMessage,
    importNamesRowMessage,
    importNamesRowSheetMessage,
    importOpenDatabaseLabel,
    importOtherSpreadsheetReason,
    importPreviewAboveMessage,
    importProgressTableTitle,
    importProgressTextTitle,
    importProgressTitle,
    importSheetLineText,
    importSheetSizeText,
    importSheetStartNote,
    importSheetUnnamedLabel,
    importSheetsCountText,
    importSheetsLabel,
} from "./config-workflow.js";
import { NULL_TEXT } from "./config.js";
import { swallowHeldEnter } from "./held-enter.js";
import { icon } from "./icons.js";
import { previewRows, sheetTableName } from "./import-cells.js";
import { DELIMITERS, MAX_COLUMNS, readStart } from "./import-csv.js";
import { newPace, nextFrame } from "./import-pace.js";
import { roomAgain, watchStep } from "./import-workbook.js";
import { firstRowLooksLikeNames, sameNameKey, sanitiseName, tableNameFor, uniqueName } from "./import-rules.js";
import { ENCODINGS, OTHER_SPREADSHEET_NAME, fitsEncoding, guessEncoding, headOf, inspectText, kindByStart, markOf, startOfText } from "./import-text.js";
import { mountTabs } from "./tabs.js";

// rows shown above the row of column names, when that row is not the first
const ROWS_ABOVE = 3;
// a field longer than this is cut short in the preview (the table keeps it whole)
const PREVIEW_CELL_CHARS = 80;
const CUT = "…";
const RESERVED_NAME = /^sqlite_/i;
const SPACE_AT_AN_END = /^\s|\s$/;

function el(tag, props = {}, text = "") {
    const node = document.createElement(tag);
    Object.assign(node, props);
    if (text) {
        node.textContent = text;
    }
    return node;
}

// A labelled control with room for a hint and an error under it. With `note` it has a line for a note as
// well, after the hint and before the error: a note says something that is not a fault (the control is not
// invalid, nothing is announced, and nothing is scrolled into view for it). A note and an error are never
// on show together: while the error shows the note waits, and it comes back when the error goes.
function field(id, labelText, control, { hint = "", note = false } = {}) {
    const box = el("div", { className: "import-field" });
    const label = el("label", { className: "app-dialog-label", htmlFor: id }, labelText);
    control.id = id;
    const error = el("p", { id: `${id}-error`, className: "app-dialog-error", hidden: true });
    error.setAttribute("role", "alert");
    box.append(label, control);
    let hintLine = null;
    if (hint) {
        hintLine = el("p", { id: `${id}-hint`, className: "app-dialog-hint" }, hint);
        box.append(hintLine);
    }
    let noteLine = null;
    if (note) {
        noteLine = el("p", { id: `${id}-note`, className: "app-dialog-hint import-name-note", hidden: true });
        box.append(noteLine);
    }
    box.append(error);
    let noteText = "";
    // what describes the control: the error first, then the hint, then the note
    const describe = () => {
        const ids = [error, hintLine, noteLine].filter((line) => line && !line.hidden).map((line) => line.id);
        if (ids.length) {
            control.setAttribute("aria-describedby", ids.join(" "));
        } else {
            control.removeAttribute("aria-describedby");
        }
    };
    // (the hint, when there is one, is on show from the start)
    describe();
    const drawNote = () => {
        if (noteLine) {
            noteLine.textContent = error.hidden ? noteText : "";
            noteLine.hidden = error.hidden ? !noteText : true;
        }
    };
    return {
        box,
        control,
        showError(message) {
            error.textContent = message;
            error.hidden = false;
            control.setAttribute("aria-invalid", "true");
            drawNote();
            describe();
        },
        clearError() {
            error.textContent = "";
            error.hidden = true;
            control.removeAttribute("aria-invalid");
            drawNote();
            describe();
        },
        showNote(text) {
            noteText = text;
            drawNote();
            describe();
        },
        clearNote() {
            noteText = "";
            drawNote();
            describe();
        },
    };
}

// A strip of tabs is not a stop of the Tab key (tabindex -1: in Firefox a strip that scrolls sideways was
// one), but a click on its empty part still gives it the focus, and then no key does anything. The focus
// goes on to the selected tab, which the arrow keys move from, and the strip itself never shows a ring.
function sendFocusToSelectedTab(strip) {
    strip.tabIndex = -1;
    strip.addEventListener("focus", (event) => {
        if (event.target === strip) {
            strip.querySelector('[role="tab"][aria-selected="true"]')?.focus({ preventScroll: true });
        }
    });
}

function select(options, value) {
    const control = el("select", { className: "import-select" });
    for (const [optionValue, optionText] of options) {
        control.append(el("option", { value: optionValue }, optionText));
    }
    control.value = value;
    return control;
}

// one field of the preview, exactly as read: an empty one says so, one with white space at an
// end is marked, so that the space can be seen, and a long one is cut short, with the whole of it
// in its title (as the report does: the pointer resting there shows it)
function previewCell(text, { names = false } = {}) {
    const cell = el("td");
    if (text === undefined || text === null || text === "") {
        cell.append(el("span", { className: "cell-null" }, names ? IMPORT_PREVIEW_BLANK : NULL_TEXT));
        return cell;
    }
    const cut = text.length > PREVIEW_CELL_CHARS;
    const shown = el("span", { className: "import-cell-text" }, cut ? `${text.slice(0, PREVIEW_CELL_CHARS)}${CUT}` : text);
    if (cut) {
        shown.title = text;
    }
    cell.append(shown);
    if (SPACE_AT_AN_END.test(text)) {
        cell.classList.add("import-cell--spaces");
    }
    return cell;
}

// The table of the first rows, for a text file and for a sheet alike: `rows` are the rows from number
// `first` on (a row is a list of texts, with undefined or null for no value), and `namesAt` the number
// of the row that holds the names (0: none). Rows above it are left out.
function previewTable(rows, first, namesAt) {
    const width = rows.reduce((most, row) => Math.max(most, row.length), 0);
    const table = el("table", { className: "result-table import-preview-table" });
    const head = el("tr");
    head.append(el("th", { scope: "col", className: "import-row-heading" }, IMPORT_PREVIEW_ROW_HEADING));
    for (let column = 1; column <= width; column++) {
        head.append(el("th", { scope: "col" }, String(column)));
    }
    table.createTHead().append(head);
    const body = table.createTBody();
    rows.forEach((row, i) => {
        const number = first + i;
        const line = el("tr");
        const heading = el("th", { scope: "row", className: "import-row-heading" });
        heading.append(el("span", { className: "import-row-number" }, String(number)));
        const isNames = number === namesAt;
        if (number < namesAt) {
            line.className = "import-row--out";
            heading.append(el("span", { className: "import-row-tag" }, IMPORT_PREVIEW_LEFT_OUT));
        } else if (isNames) {
            line.className = "import-row--names";
            heading.append(el("span", { className: "import-row-tag" }, IMPORT_PREVIEW_NAMES));
        }
        line.append(heading);
        for (let column = 0; column < width; column++) {
            line.append(previewCell(row[column], { names: isNames }));
        }
        body.append(line);
    });
    return table;
}

export function mountImportDialog({ returnFocus, getDestination, loadReader, excel = null, onImport }) {
    const dialog = el("dialog", { id: "import-dialog", className: "app-dialog import-dialog" });
    dialog.setAttribute("aria-labelledby", "import-title");
    dialog.setAttribute("aria-describedby", "import-text");
    const form = el("form", { id: "import-form", className: "import-form", noValidate: true });

    const files = el("div", { className: "import-files" });

    // ---- where the tables go
    const destination = el("fieldset", { className: "import-destination" });
    destination.append(el("legend", { className: "app-dialog-label" }, IMPORT_DESTINATION_LABEL));
    const newChoice = el("input", { type: "radio", name: "import-destination", id: "import-into-new", value: "new" });
    const openChoice = el("input", { type: "radio", name: "import-destination", id: "import-into-open", value: "open" });
    const newLabel = el("label", { className: "import-check", htmlFor: newChoice.id });
    newLabel.append(newChoice, el("span", {}, IMPORT_NEW_DATABASE_LABEL));
    const openText = el("span");
    const openLabel = el("label", { className: "import-check", htmlFor: openChoice.id });
    openLabel.append(openChoice, openText);
    const openNote = el("p", { id: "import-into-open-note", className: "app-dialog-hint", hidden: true });
    const databaseName = field(
        "import-database-name",
        IMPORT_NEW_DATABASE_NAME_LABEL,
        el("input", { type: "text", className: "app-dialog-input", autocomplete: "off", spellcheck: false })
    );
    databaseName.control.setAttribute("autocapitalize", "off");
    databaseName.control.setAttribute("autocorrect", "off");
    // the two choices side by side while there is room: each with what belongs to it under it
    const intoNew = el("div", { className: "import-destination-choice" });
    intoNew.append(newLabel, databaseName.box);
    const intoOpen = el("div", { className: "import-destination-choice" });
    intoOpen.append(openLabel, openNote);
    const choices = el("div", { className: "import-destination-choices" });
    choices.append(intoNew, intoOpen);
    destination.append(choices);

    // ---- why Import is off (in the foot, beside the button it explains): it names the file that
    // holds Import up when that file waits for an answer, whichever tab is on show, or when its
    // tab is not the one on show (refresh, below)
    const hold = el("p", { id: "import-hold", className: "app-dialog-hint import-hold", hidden: true });

    // ---- what went wrong with the import as a whole
    const error = el("p", { id: "import-error", className: "app-dialog-error", hidden: true });
    error.setAttribute("role", "alert");

    // ---- while it runs
    const progress = el("div", { className: "import-progress", hidden: true });
    const progressTitle = el("h3", { id: "import-progress-title", className: "results-loading-title" });
    const progressPart = el("p", { className: "results-loading-size" });
    const progressBar = el("progress", { className: "results-progress", max: 1 });
    progressBar.setAttribute("aria-labelledby", progressTitle.id);
    progress.append(progressTitle, progressPart, progressBar);

    const submit = el("button", { type: "submit", className: "button button--primary" }, IMPORT_SUBMIT_TEXT);
    const cancel = el("button", { type: "button", className: "button" }, IMPORT_CANCEL_TEXT);
    const actions = el("div", { className: "app-dialog-actions" });
    actions.append(submit, cancel);

    // what scrolls, and under it what stays in reach (the header says why they are apart)
    const body = el("div", { className: "import-body" });
    body.append(
        el("h2", { id: "import-title", className: "app-dialog-title" }, IMPORT_DIALOG_TITLE),
        el("p", { id: "import-text", className: "app-dialog-text" }, excel ? IMPORT_DIALOG_TEXT_WITH_SHEETS : IMPORT_DIALOG_TEXT),
        destination,
        files,
        progress
    );
    const foot = el("div", { className: "import-foot" });
    foot.append(hold, error, actions);
    form.append(body, foot);
    dialog.append(form);
    document.body.append(dialog);

    // Every way out of the dialog, and every new set of files, starts a new session: what an
    // older one was still waiting for (a file being read) is dropped when it arrives.
    let session = 0;
    // is the dialog showing a session that has not been ended yet (open() to endSession())
    let live = false;
    let tabs = [];
    let tabList = null;
    // the import that is running: {cancelled}
    let running = null;
    let opened = 0;
    // The workbooks of a dialog are read one after the other: each waits for the one before it, so
    // that the bytes of two are never held together (a chain of promises, kept across sessions: a
    // reading of a session that has ended stops at its next look and lets the next one in).
    let workbookTurn = Promise.resolve();
    // A pointer and the dialog (the listeners at the end say why it matters): `pressing` for the
    // turn of a press, in which the focus it gives arrives; `pointerDown` from a press of the
    // main button to its release; `owed`, the control to bring back whole at that release, with
    // where the body was scrolled to when that was noted. `edited` is the field of a number that the
    // student is changing, while the page answers the change (see keepMessageWhole).
    let pressing = false;
    let pointerDown = false;
    let owed = null;
    let edited = null;

    // the tabs that are not refused: the files that may still give a table
    const importable = () => tabs.filter((tab) => tab.state !== "refused");
    const usesOpenDatabase = () => openChoice.checked;

    // ---- one file, one tab ------------------------------------------------------------------

    function newTab(file, n) {
        const id = `import-file-${opened}-${n}`;
        const button = el("button", { id: `${id}-tab`, className: "tab import-tab", type: "button" });
        button.setAttribute("role", "tab");
        button.setAttribute("aria-controls", `${id}-panel`);
        button.setAttribute("aria-selected", String(n === 0));
        // (a long name is cut short in the tab: the whole of it shows when the pointer rests there)
        button.append(el("span", { className: "import-tab-name", title: file.name }, file.name));
        const panel = el("div", { id: `${id}-panel`, className: "import-panel" });
        panel.setAttribute("role", "tabpanel");
        panel.setAttribute("aria-labelledby", button.id);
        return {
            id,
            file,
            button,
            panel,
            state: "reading",
            reason: "",
            encoding: "utf-8",
            encodingFits: true,
            delimiter: ",",
            newline: "\n",
            rows: [],
            whole: true,
            hasNames: true,
            namesRow: 1,
            tableName: "",
            // what the student has set by hand is left alone when the file is read again
            nameEdited: false,
            // the line under the name when the dialog made it unique because the destination has it ("" for none)
            note: "",
            delimiterChosen: false,
            namesChosen: false,
            // the encoding that is being checked against the bytes, while it is
            checking: null,
            // readings of the start of the file are numbered: a newer one takes over from an
            // older one that has not ended, and until the newest has ended the tab is unsettled
            turn: 0,
            unsettled: false,
            // when its first reading began (performance.now())
            readingSince: 0,
            // what cannot be made a table as the student has set the reading, or ""
            problem: "",
            // the mark of the text the preview was read from (markOf)
            mark: null,
            controls: null,
            // the words a refused tab says to a screen reader, in brackets after its name
            said: "",
            // A workbook (only with excel-import on): known to be one once its first bytes have been
            // looked at; its zip's directory as the limits read it; and, once it has been read, its
            // sheets (see showSheets). Until then it is a tab like the others.
            isWorkbook: false,
            kind: "text",
            directory: null,
            workbook: null,
        };
    }

    // refuse: the file is not imported, and its tab says why. One that the student left out
    // themselves (own) has its own words beside the sign, for a screen reader, and a quiet sign:
    // nothing went wrong.
    function refuse(tab, reason, { own = false } = {}) {
        // (a control of the panel that has the focus goes with the panel's content)
        const hadFocus = tab.panel.contains(document.activeElement);
        tab.state = "refused";
        tab.reason = reason;
        tab.controls = null;
        // (a workbook whose sheets were shown and then lost has the marks of its sheets: a refused tab has its own alone)
        for (const mark of tab.button.querySelectorAll(".import-tab-nothing")) {
            mark.remove();
        }
        if (!tab.button.querySelector(".import-tab-refused")) {
            const mark = icon("circle-alert");
            mark.classList.add("import-tab-refused");
            mark.classList.toggle("import-tab-refused--own", own);
            tab.button.prepend(mark);
            tab.said = own ? IMPORT_LEFT_OUT_TAB_TEXT : IMPORT_REFUSED_TAB_TEXT;
            tab.button.append(el("span", { className: "visually-hidden" }, `(${tab.said})`));
        }
        tab.panel.replaceChildren(el("p", { className: "import-refusal" }, reason));
        tab.panel.tabIndex = 0;
        if (hadFocus) {
            tab.button.focus();
        }
        // the names are given again: a refused file holds none, and may have been the first
        suggestDatabaseName();
        suggestNames();
        refresh();
    }

    function showReading(tab) {
        tab.state = "reading";
        tab.readingSince = performance.now();
        tab.controls = null;
        const line = el("p", { className: "import-reading" }, IMPORT_READING_TEXT);
        line.setAttribute("role", "status");
        tab.panel.replaceChildren(line);
        tab.panel.tabIndex = 0;
        refresh();
    }

    // the question for a large file: its words, and what to do when the answer is to read it (a text
    // file is read at once; a workbook waits for its turn, in readSheets)
    function showWarning(tab, mine, { message = null, proceed = null } = {}) {
        tab.state = "warning";
        const megabytes = Math.round(tab.file.size / (1024 * 1024));
        const go = el("button", { type: "button", className: "button" }, IMPORT_LARGE_FILE_CONTINUE_TEXT);
        go.addEventListener("click", () => {
            showReading(tab);
            tab.button.focus();
            if (proceed) {
                proceed();
            } else {
                read(tab, mine);
            }
        });
        // the other answer: the file is not read, and the others can be imported without it
        const leave = el("button", { type: "button", className: "button" }, IMPORT_LARGE_FILE_LEAVE_TEXT);
        leave.addEventListener("click", () => {
            refuse(tab, IMPORT_LEFT_OUT_REASON, { own: true });
            // (as after the other answer: the tab has the focus, also where a press on a button
            // does not give the button the focus)
            tab.button.focus();
        });
        const answers = el("div", { className: "import-warning-answers" });
        answers.append(go, leave);
        const box = el("div", { className: "import-warning" });
        box.append(el("p", { className: "import-warning-text" }, message ?? importLargeFileMessage(megabytes)), answers);
        tab.panel.replaceChildren(box);
        tab.panel.removeAttribute("tabindex");
        refresh();
    }

    // look decides what the file is, from its first bytes, and whether it is read at once
    async function look(tab, mine) {
        // (the name is tested first: such a file is refused by its name, and none of its bytes are read)
        const other = OTHER_SPREADSHEET_NAME.exec(tab.file.name);
        if (other) {
            refuse(tab, importOtherSpreadsheetReason(other[0].toLowerCase(), Boolean(excel)));
            return;
        }
        let kind;
        try {
            const head = await headOf(tab.file, tab.file.name);
            kind = kindByStart(head, tab.file.size, tab.file.name);
        } catch {
            kind = "unreadable";
        }
        if (mine !== session) {
            return;
        }
        if (kind === "empty") {
            refuse(tab, IMPORT_EMPTY_REASON);
        } else if (kind === "unreadable") {
            refuse(tab, IMPORT_UNREADABLE_REASON);
        } else if (kind !== "text" && excel) {
            // a workbook, whatever it is called (excel-import is on)
            await lookWorkbook(tab, mine, kind);
        } else if (kind !== "text") {
            // a workbook, whatever it is called: with the import alone they are not read
            refuse(tab, IMPORT_WORKBOOK_REASON);
        } else if (tab.file.size > IMPORT_TEXT_MAX_BYTES) {
            refuse(tab, IMPORT_TOO_LARGE_REASON);
        } else if (tab.file.size > IMPORT_TEXT_WARN_BYTES) {
            showWarning(tab, mine);
        } else {
            await read(tab, mine);
        }
    }

    // read looks at the whole file (is it text, in which encoding), then reads its start
    async function read(tab, mine) {
        const pace = newPace();
        const between = async () => {
            await pace.rest();
            if (mine !== session) {
                throw new Error("the dialog has moved on");
            }
        };
        let info;
        try {
            info = await inspectText(tab.file, { sliceBytes: INSPECT_SLICE_BYTES, between });
        } catch {
            if (mine === session) {
                refuse(tab, IMPORT_UNREADABLE_REASON);
            }
            return;
        }
        if (mine !== session) {
            return;
        }
        if (info.hasZero && !(info.bom ?? "").startsWith("utf-16")) {
            refuse(tab, IMPORT_NOT_TEXT_REASON);
            return;
        }
        tab.encoding = guessEncoding(info);
        try {
            // (UTF-8 has been checked in that pass; UTF-16 gets a pass of its own)
            tab.encodingFits = tab.encoding === "utf-8" ? info.validUtf8 : await fitsEncoding(tab.file, tab.encoding, { sliceBytes: INSPECT_SLICE_BYTES, between });
        } catch {
            if (mine === session) {
                refuse(tab, IMPORT_UNREADABLE_REASON);
            }
            return;
        }
        if (mine !== session) {
            return;
        }
        await readPreview(tab, mine, { first: true });
    }

    // readPreview reads the start of the file as the settings say, and draws the tab. A newer
    // reading of the same tab takes over from an older one that has not ended, and until the
    // newest has ended Import waits: the settings on show are the settings used.
    async function readPreview(tab, mine, { first = false, delimiter = "" } = {}) {
        const turn = ++tab.turn;
        tab.unsettled = true;
        refresh();
        const stale = () => mine !== session || turn !== tab.turn;
        let reader;
        try {
            reader = await loadReader();
        } catch {
            if (!stale()) {
                refuse(tab, IMPORT_LIBRARY_FAILED_MESSAGE);
            }
            return;
        }
        if (stale()) {
            return;
        }
        if (tab.encodingFits) {
            let start;
            try {
                start = await startOfText(tab.file, tab.encoding, PREVIEW_BYTES);
            } catch {
                if (!stale()) {
                    refuse(tab, IMPORT_UNREADABLE_REASON);
                }
                return;
            }
            if (stale()) {
                return;
            }
            const read = readStart(reader, start.text, { whole: start.whole, delimiter });
            // What cannot be made a table: a row that is too wide, or no row at all (nothing
            // left once empty lines are skipped; or, of a longer file, not one complete row in
            // the text that was read, in which no line ending can be found either).
            const tooWide = read.rows.some((row) => row.length > MAX_COLUMNS);
            const noRow = !read.rows.length;
            if (first && (tooWide || noRow)) {
                // the file as it is: refused
                refuse(tab, tooWide ? IMPORT_TOO_WIDE_REASON : start.whole ? IMPORT_EMPTY_REASON : IMPORT_NO_ROW_REASON);
                return;
            }
            tab.rows = read.rows;
            tab.whole = start.whole;
            tab.delimiter = read.delimiter;
            tab.newline = read.newline;
            tab.mark = markOf(start.text);
            // the file as the student has set it: said in the tab, and theirs to change back
            tab.problem = tooWide ? IMPORT_SETTINGS_TOO_WIDE_MESSAGE : noRow ? IMPORT_SETTINGS_NO_ROW_MESSAGE : "";
            if (!tab.namesChosen) {
                tab.hasNames = firstRowLooksLikeNames(read.rows[0]);
                tab.namesRow = 1;
            }
        }
        tab.unsettled = false;
        if (tab.state !== "ready") {
            tab.state = "ready";
            buildControls(tab, mine);
            suggestNames();
        }
        draw(tab);
        refresh();
    }

    function buildControls(tab, mine) {
        const name = field(
            `${tab.id}-name`,
            IMPORT_TABLE_NAME_LABEL,
            el("input", { type: "text", className: "app-dialog-input", autocomplete: "off", spellcheck: false }),
            { hint: IMPORT_TABLE_NAME_HINT, note: true }
        );
        name.control.setAttribute("autocapitalize", "off");
        name.control.setAttribute("autocorrect", "off");
        if (tab.note) {
            name.showNote(tab.note);
        }
        name.control.addEventListener("input", () => {
            tab.nameEdited = true;
            tab.tableName = name.control.value;
            // (the name is the student's now, not the dialog's)
            tab.note = "";
            name.clearNote();
            name.clearError();
        });
        // a name the student types goes through the same rule as one taken from a file
        name.control.addEventListener("change", () => {
            if (name.control.value !== "") {
                name.control.value = sanitiseName(name.control.value);
                tab.tableName = name.control.value;
            }
        });

        const delimiter = field(
            `${tab.id}-delimiter`,
            IMPORT_DELIMITER_LABEL,
            select(DELIMITERS.map((d) => [d.value, IMPORT_DELIMITER_NAMES[d.value]]), tab.delimiter)
        );
        delimiter.control.addEventListener("change", () => {
            tab.delimiterChosen = true;
            readPreview(tab, mine, { delimiter: delimiter.control.value });
        });

        const encoding = field(
            `${tab.id}-encoding`,
            IMPORT_ENCODING_LABEL,
            select(ENCODINGS.map((name) => [name, IMPORT_ENCODING_NAMES[name]]), tab.encoding)
        );
        encoding.control.addEventListener("change", async () => {
            const chosen = encoding.control.value;
            tab.encoding = chosen;
            // decoding is strict: an encoding the bytes do not fit is said, and Import is off
            tab.encodingFits = false;
            tab.checking = chosen;
            tab.problem = "";
            draw(tab);
            refresh();
            let fits = false;
            try {
                fits = await fitsEncoding(tab.file, chosen, { sliceBytes: INSPECT_SLICE_BYTES });
            } catch {
                fits = false;
            }
            if (mine !== session || tab.checking !== chosen || tab.state !== "ready") {
                return;
            }
            tab.checking = null;
            tab.encodingFits = fits;
            // (the delimiter is guessed again from the new text, unless the student chose one)
            await readPreview(tab, mine, { delimiter: tab.delimiterChosen ? tab.delimiter : "" });
        });

        const hasNames = el("input", { type: "checkbox", id: `${tab.id}-has-names` });
        const hasNamesLabel = el("label", { className: "import-check", htmlFor: hasNames.id });
        hasNamesLabel.append(hasNames, el("span", {}, IMPORT_HAS_NAMES_LABEL));
        const namesRow = field(
            `${tab.id}-names-row`,
            IMPORT_NAMES_ROW_LABEL,
            el("input", { type: "number", className: "app-dialog-input import-number", min: "1", step: "1", inputMode: "numeric" })
        );
        hasNames.addEventListener("change", () => {
            tab.namesChosen = true;
            tab.hasNames = hasNames.checked;
            draw(tab);
            refresh();
        });
        namesRow.control.addEventListener("input", () => {
            tab.namesChosen = true;
            const text = namesRow.control.value.trim();
            tab.namesRow = /^[0-9]+$/.test(text) ? Number(text) : NaN;
            whileEdited(namesRow.control, () => draw(tab));
            refresh();
        });
        const names = el("div", { className: "import-names" });
        names.append(hasNamesLabel, namesRow.box);

        const settings = el("div", { className: "import-settings" });
        settings.append(name.box, delimiter.box, encoding.box, names);

        const preview = el("div", { className: "import-preview" });
        preview.setAttribute("role", "region");
        preview.setAttribute("aria-label", IMPORT_PREVIEW_LABEL);
        preview.tabIndex = 0;
        const note = el("p", { className: "app-dialog-hint import-preview-note", hidden: true });
        // what cannot be made a table as the reading is set, in place of the preview
        const problem = el("p", { className: "app-dialog-error import-problem", hidden: true });
        problem.setAttribute("role", "alert");

        tab.controls = { name, delimiter, encoding, hasNames, namesRow, preview, note, problem };
        tab.panel.removeAttribute("tabindex");
        tab.panel.replaceChildren(settings, el("p", { className: "app-dialog-label import-preview-title" }, IMPORT_PREVIEW_LABEL), problem, note, preview);
    }

    // what is wrong with the row the names are said to be on, or ""
    function namesRowProblem(tab) {
        if (!tab.hasNames || !tab.encodingFits || tab.problem) {
            return "";
        }
        if (!Number.isSafeInteger(tab.namesRow) || tab.namesRow < 1) {
            return IMPORT_NAMES_ROW_NOT_A_ROW_MESSAGE;
        }
        return tab.namesRow > tab.rows.length ? importNamesRowMessage(tab.rows.length) : "";
    }

    // draw brings the tab's controls and its preview in line with what is known of the file
    function draw(tab) {
        const { name, delimiter, encoding, hasNames, namesRow, preview, note, problem: problemLine } = tab.controls;
        if (name.control.value !== tab.tableName && !tab.nameEdited) {
            name.control.value = tab.tableName;
        }
        delimiter.control.value = tab.delimiter;
        encoding.control.value = tab.encoding;
        hasNames.checked = tab.hasNames;
        if (Number.isSafeInteger(tab.namesRow) && namesRow.control.value.trim() !== String(tab.namesRow)) {
            namesRow.control.value = String(tab.namesRow);
        }
        namesRow.control.disabled = !tab.hasNames;
        if (tab.encodingFits || tab.checking) {
            encoding.clearError();
        } else {
            encoding.showError(importEncodingMessage(tab.encoding));
            keepMessageWhole(encoding.control);
        }
        const problem = namesRowProblem(tab);
        if (problem) {
            namesRow.showError(problem);
            keepMessageWhole(namesRow.control);
        } else {
            namesRow.clearError();
        }
        delimiter.control.disabled = !tab.encodingFits;

        const cannot = tab.encodingFits ? tab.problem : "";
        if (problemLine.textContent !== cannot) {
            problemLine.textContent = cannot;
        }
        problemLine.hidden = !cannot;
        if (!tab.encodingFits || cannot) {
            preview.replaceChildren();
            preview.hidden = true;
            note.hidden = true;
            return;
        }
        preview.hidden = false;
        const namesAt = tab.hasNames && !problem ? tab.namesRow : 0;
        const first = Math.max(1, namesAt - ROWS_ABOVE);
        const shown = tab.rows.slice(first - 1, namesAt + PREVIEW_ROWS);
        preview.replaceChildren(previewTable(shown, first, namesAt));
        const notes = [];
        if (first > 1) {
            notes.push(importPreviewAboveMessage(first - 1));
        }
        if (namesAt && tab.whole && tab.rows.length === namesAt) {
            notes.push(IMPORT_PREVIEW_NO_DATA_MESSAGE);
        }
        note.textContent = notes.join(" ");
        note.hidden = !notes.length;
    }

    // ---- a workbook: one tab for the file, and inside it one for each sheet ---------------------------
    // Only with excel-import on (`excel` is null otherwise, and none of this runs). The file's own tab
    // goes through every step before its sheets are known: reading, the question for a large one, a
    // refusal, being left out. When it has been read, its panel holds the sheets: a strip of tabs for two
    // sheets or more (the panel of a sheet is built when it is first shown: a workbook can have hundreds,
    // and each has a preview), and the one sheet itself for a workbook that lists one. What a sheet is
    // set to lives in its unit, whether its panel has been built or not. A sheet's cells are reached
    // only through previewRows (the preview, one place) and sheetTableName (its name); the import
    // reaches them through the sheet it is handed.

    async function lookWorkbook(tab, mine, kind) {
        tab.isWorkbook = true;
        tab.kind = kind;
        // (it takes no name of a text file's, and gives its sheets theirs when it has been read)
        suggestNames();
        const inspected = await excel.inspectWorkbook(tab.file, kind);
        if (mine !== session) {
            return;
        }
        if (inspected.refused) {
            refuse(tab, inspected.refused);
            return;
        }
        tab.directory = inspected.directory ?? null;
        if (inspected.ask) {
            showWarning(tab, mine, { message: importLargeWorkbookMessage(inspected.ask), proceed: () => readSheets(tab, mine) });
            return;
        }
        await readSheets(tab, mine);
    }

    // readSheets reads the workbook when its turn comes, and shows its sheets
    function readSheets(tab, mine) {
        const next = workbookTurn.then(async () => {
            if (mine !== session) {
                return;
            }
            const pace = newPace();
            let read;
            try {
                read = await excel.readWorkbook(tab.file, tab.kind, {
                    directory: tab.directory,
                    loadLibrary: excel.loadLibrary,
                    rest: () => pace.rest(),
                    frame: nextFrame,
                    current: () => mine === session,
                });
            } catch {
                read = { refused: IMPORT_UNREADABLE_REASON };
            }
            if (mine !== session || read.moved) {
                return;
            }
            // The tab's own step, from the answer to what the tab shows, is watched as the library's call is
            // (watchStep, js/lab/import-workbook.js): a workbook that was read with the last of the browser's
            // memory can fail here, with nothing made to say so, and the tab would say for ever that the
            // file is being read. This turn waits for the watch and hears of no failure: the files chosen
            // behind this one are still to be read, when there is room for them, and a throw here would end
            // the loop that reads them (their tabs would say for ever that they are being read). A fault of
            // another kind is thrown as it was.
            // (what the tab will say: a file that was refused keeps its own reason, though it could not be shown)
            const lostReason = read.refused ?? IMPORT_WORKBOOK_NO_MEMORY_REASON;
            await watchStep(
                () => {
                    if (read.refused) {
                        refuse(tab, read.refused);
                    } else {
                        showSheets(tab, read);
                    }
                },
                () => {
                    // What fills the memory is let go first, and nothing is asked of the browser for that: the
                    // sheets, which the answer holds, and the tab, and what the tab has shown of them so far.
                    // Until there is room again the tab is one that is still being read, with nothing to show.
                    // (Import is turned off first, with nothing asked of the browser: the step may have failed after
                    // the sheets were first shown, with Import on, and nothing else turns it off before there is room.
                    // Only while the dialog is still on these files: the button is the dialog's, and files chosen since
                    // have their own say over it, with nothing to turn it on again for them.)
                    if (mine === session) {
                        submit.disabled = true;
                    }
                    read = null;
                    tab.workbook = null;
                    tab.state = "reading";
                    tab.panel.replaceChildren();
                    roomAgain();
                    if (mine === session) {
                        // (the tab as it was while the file was being read: its name alone, and a panel named by
                        // it; then it is refused as any tab is)
                        tab.button.replaceChildren(tab.button.querySelector(".import-tab-name"));
                        tab.panel.setAttribute("aria-labelledby", tab.button.id);
                        refuse(tab, lostReason);
                    }
                }
            );
        });
        workbookTurn = next.catch(() => {});
        return next;
    }

    function newUnit(tab, sheet, i, listed) {
        const id = `${tab.id}-s${i}`;
        const panel = el("div", { id: `${id}-panel`, className: "import-sheet-panel" });
        let button = null;
        if (listed > 1) {
            button = el("button", { id: `${id}-tab`, className: "tab import-tab import-sheet-tab", type: "button" });
            button.setAttribute("role", "tab");
            button.setAttribute("aria-controls", panel.id);
            button.setAttribute("aria-selected", "false");
            panel.setAttribute("role", "tabpanel");
            // (named by the sheet's name alone: the tab's own name carries its state, which changes as
            // boxes are ticked, and a screen reader would say the whole phrase each time the panel is entered)
            panel.setAttribute("aria-labelledby", `${id}-tab-name`);
        }
        const unit = {
            id,
            tab,
            file: tab.file,
            sheet,
            isSheet: true,
            // (a name of only spaces would leave a tab and a line with nothing to read)
            label: sheet.label.trim() === "" ? importSheetUnnamedLabel(i + 1) : sheet.label,
            hidden: sheet.hidden,
            state: sheet.state,
            // visible sheets that hold values are ticked; a hidden one only when the student says so
            ticked: sheet.state === "ready" && sheet.hidden === 0,
            // nothing is guessed for a sheet: its first row holds the names until the student says otherwise
            hasNames: true,
            namesRow: 1,
            tableName: "",
            nameEdited: false,
            note: "",
            built: false,
            controls: null,
            tick: null,
            button,
            panel,
        };
        drawUnitTab(unit);
        return unit;
    }

    // the words a sheet's tab says to a screen reader
    function unitWords(unit) {
        if (unit.state === "empty") {
            return IMPORT_SHEET_NO_VALUES_TEXT;
        }
        if (unit.state !== "ready") {
            return IMPORT_REFUSED_TAB_TEXT;
        }
        if (unit.ticked) {
            // (the word hidden is a badge a screen reader is not given, so a hidden sheet says it here)
            return unit.hidden ? IMPORT_SHEET_HIDDEN_TICKED_TEXT : IMPORT_SHEET_TICKED_TEXT;
        }
        return unit.hidden ? IMPORT_SHEET_HIDDEN_NOT_TICKED_TEXT : IMPORT_SHEET_NOT_TICKED_TEXT;
    }

    // a sheet's tab: a sign (ticked, not ticked, or quiet for a sheet that cannot be ticked), its name,
    // the word hidden for a hidden one, and its state in words for a screen reader. The state is never
    // shown by colour alone.
    function drawUnitTab(unit) {
        if (!unit.button) {
            return;
        }
        const sign = icon(unit.state !== "ready" ? "circle-alert" : unit.ticked ? "check" : "circle");
        sign.classList.add("import-tab-sign");
        sign.classList.toggle("import-tab-sign--quiet", unit.state !== "ready");
        const parts = [sign, el("span", { id: `${unit.id}-tab-name`, className: "import-tab-name", title: unit.label }, unit.label)];
        if (unit.hidden) {
            const word = el("span", { className: "import-sheet-badge" }, IMPORT_SHEET_HIDDEN_WORD);
            word.setAttribute("aria-hidden", "true");
            parts.push(word);
        }
        parts.push(el("span", { className: "visually-hidden" }, `(${unitWords(unit)})`));
        unit.button.replaceChildren(...parts);
    }

    // what is wrong with the row a sheet's names are said to be on, or ""
    function sheetNamesProblem(unit) {
        if (!unit.hasNames) {
            return "";
        }
        if (!Number.isSafeInteger(unit.namesRow) || unit.namesRow < 1) {
            return IMPORT_NAMES_ROW_NOT_A_ROW_MESSAGE;
        }
        return unit.namesRow > unit.sheet.rows ? importNamesRowSheetMessage(unit.sheet.rows) : "";
    }

    // showSheets: the workbook has been read, and its panel takes the place of "Reading the file…"
    function showSheets(tab, read) {
        const listed = read.sheets.length;
        const units = read.sheets.map((sheet, i) => newUnit(tab, sheet, i, listed));
        const book = { units, listed, charts: read.charts, strip: null, shown: null, count: null, tickAll: null, untickAll: null };
        tab.workbook = book;
        tab.state = "ready";
        tab.controls = null;
        // the workbook may give nothing: the new database is named again
        suggestDatabaseName();
        tab.panel.removeAttribute("tabindex");
        // (the panel is named by the file's name alone: the tab's own name says what is ticked, and it
        // changes as sheets are ticked)
        const fileName = tab.button.querySelector(".import-tab-name");
        fileName.id = `${tab.id}-file-name`;
        tab.panel.setAttribute("aria-labelledby", fileName.id);
        const parts = [];
        if (listed > 1 || book.charts > 0) {
            const head = el("div", { className: "import-sheets-head" });
            book.count = el("p", { className: "import-sheets-count" });
            book.count.setAttribute("role", "status");
            head.append(book.count);
            if (listed > 1) {
                const tickAll = el("button", { type: "button", className: "button" }, IMPORT_TICK_ALL_SHEETS_TEXT);
                const untickAll = el("button", { type: "button", className: "button" }, IMPORT_UNTICK_ALL_SHEETS_TEXT);
                tickAll.addEventListener("click", () => tickEvery(tab, true));
                untickAll.addEventListener("click", () => tickEvery(tab, false));
                const actions = el("div", { className: "import-sheets-actions" });
                actions.append(tickAll, untickAll);
                head.append(actions);
            }
            parts.push(head);
        }
        let strip = null;
        if (listed > 1) {
            strip = el("div", { className: "tabs import-tabs import-sheet-tabs" });
            strip.setAttribute("role", "tablist");
            // (the selected tab is the one stop of the Tab key: see sendFocusToSelectedTab)
            sendFocusToSelectedTab(strip);
            strip.setAttribute("aria-label", importSheetsLabel(tab.file.name));
            strip.append(...units.map((unit) => unit.button));
            const panels = el("div", { className: "import-sheet-panels" });
            panels.append(...units.map((unit) => unit.panel));
            parts.push(strip, panels);
        } else {
            parts.push(units[0].panel);
        }
        tab.panel.replaceChildren(...parts);
        drawCount(tab);
        markBook(tab);
        if (strip) {
            // the first sheet that is ticked is the one on show, else the first that is listed
            const first = units.find((unit) => unit.ticked) ?? units[0];
            first.button.setAttribute("aria-selected", "true");
            // (the strip's panels are in the document, as mountTabs needs; its first call shows the
            // first sheet, which builds it, and refresh() looks at the strip only through book.shown)
            book.strip = mountTabs(strip, {
                onShow: (id) => {
                    book.shown = units.find((unit) => unit.button.id === id);
                    buildUnit(book.shown);
                    refresh();
                },
            });
            bringIntoStrip(first.button);
        } else {
            book.shown = units[0];
            buildUnit(units[0]);
        }
        suggestNames();
        refresh();
    }

    // how many sheets will be imported, in the line above the sheets (its words change only when the
    // count does, so that a screen reader says it then and not otherwise)
    function drawCount(tab) {
        const { units, charts, count } = tab.workbook;
        if (!count) {
            return;
        }
        const tickable = units.filter((unit) => unit.state === "ready").length;
        const text = importSheetsCountText({ ticked: units.filter((unit) => unit.ticked).length, tickable, unable: units.length - tickable, charts });
        if (count.textContent !== text) {
            count.textContent = text;
        }
    }

    // The workbook's own tab says when none of its sheets is ticked: a quiet sign, and words for a
    // screen reader (the sign alone would be a colour-less hint). When none of its sheets can be
    // ticked at all, the words say that, as a sheet's own tab does, and not that nothing is ticked.
    function markBook(tab) {
        for (const old of tab.button.querySelectorAll(".import-tab-nothing")) {
            old.remove();
        }
        const said = bookWords(tab);
        if (!said) {
            return;
        }
        const sign = icon("circle-alert");
        sign.classList.add("import-tab-sign", "import-tab-sign--quiet", "import-tab-nothing");
        const words = el("span", { className: "visually-hidden import-tab-nothing" }, `(${said})`);
        tab.button.prepend(sign);
        tab.button.append(words);
    }

    // what a workbook's tab says to a screen reader when none of its sheets is ticked, or "" when one is
    function bookWords(tab) {
        if (tab.workbook.units.some((unit) => unit.ticked)) {
            return "";
        }
        return tab.workbook.units.some((unit) => unit.state === "ready") ? IMPORT_TAB_NOTHING_TICKED_TEXT : IMPORT_REFUSED_TAB_TEXT;
    }

    // The files that give no table when Import is pressed, in the tabs' order: each with the words its tab
    // says to a screen reader (a refused file, a file the student left out, a workbook with no sheet ticked).
    // A workbook that gives a table is not listed: the sheets it leaves unticked are the student's choice.
    function filesLeft() {
        const left = [];
        for (const tab of tabs) {
            const why = tab.state === "refused" ? tab.said : tab.workbook ? bookWords(tab) : "";
            if (why) {
                left.push({ name: tab.file.name, why });
            }
        }
        return left;
    }

    // a tick, from the tick box or from a button: the sheet, its tab, the count, the workbook's tab, and
    // what Import says
    function setTicked(unit, on) {
        unit.ticked = on && unit.state === "ready";
        if (unit.tick) {
            unit.tick.checked = unit.ticked;
        }
        drawUnitTab(unit);
    }

    function sheetsTicked(tab) {
        drawCount(tab);
        markBook(tab);
        refresh();
    }

    function tickEvery(tab, on) {
        for (const unit of tab.workbook.units) {
            setTicked(unit, on);
        }
        sheetsTicked(tab);
    }

    // buildUnit makes the panel of a sheet, the first time it is shown. A panel counts as built only
    // when it was made whole: one that failed part way (a preview that the browser had no memory for,
    // at that moment) is made again the next time its sheet is shown.
    function buildUnit(unit) {
        if (unit.built) {
            return;
        }
        const { sheet } = unit;
        const ready = unit.state === "ready";
        const parts = [];

        // "Sheet <name>" (a web page's table has only its label), with the word hidden, and its size
        // (they sit in the head of the panel with the tick box; the head, the settings and the rows wrap
        // the panel's parts only so that a wide, short window can lay them in two columns: the order of
        // the elements is the same in every window)
        const what = el("div", { className: "import-sheet-what" });
        const title = el("p", { className: "import-sheet-name" });
        title.append(el("span", { className: "import-sheet-title" }, sheet.page ? unit.label : importSheetLineText(unit.label)));
        if (unit.hidden) {
            title.append(" ", el("span", { className: "import-sheet-badge" }, IMPORT_SHEET_HIDDEN_WORD));
        }
        what.append(title);
        if (ready || unit.state === "wide") {
            what.append(el("p", { className: "app-dialog-hint import-sheet-size" }, importSheetSizeText(sheet)));
        }

        // the tick box: for a sheet that cannot be ticked it is aria-disabled and not disabled, so that it
        // keeps its place in the Tab order and its reason is read, and its click is stopped (aria-disabled
        // alone does not stop a tick box)
        const box = el("input", { type: "checkbox", id: `${unit.id}-tick` });
        const boxLabel = el("label", { className: "import-check import-sheet-tick", htmlFor: box.id });
        boxLabel.append(box, el("span", {}, IMPORT_SHEET_TICK_LABEL));
        box.checked = unit.ticked;
        unit.tick = box;
        const head = el("div", { className: "import-sheet-head" });
        head.append(what, boxLabel);
        parts.push(head);
        if (ready) {
            box.addEventListener("change", () => {
                setTicked(unit, box.checked);
                sheetsTicked(unit.tab);
            });
            if (unit.hidden) {
                const note = el("p", { id: `${unit.id}-hidden-note`, className: "app-dialog-hint import-sheet-note" }, IMPORT_SHEET_HIDDEN_NOTE);
                box.setAttribute("aria-describedby", note.id);
                parts.push(note);
            }
        } else {
            const reason = el(
                "p",
                { id: `${unit.id}-reason`, className: "app-dialog-hint import-sheet-note" },
                unit.state === "empty" ? IMPORT_SHEET_EMPTY_REASON : unit.state === "wide" ? IMPORT_SHEET_WIDE_REASON : IMPORT_SHEET_DAMAGED_REASON
            );
            box.setAttribute("aria-disabled", "true");
            box.setAttribute("aria-describedby", reason.id);
            box.addEventListener("click", (event) => event.preventDefault());
            // (Enter in a tick box submits the form, which would import the other sheets: only Import does that
            // here, from a box that says it cannot be used)
            box.addEventListener("keydown", (event) => {
                if (event.key === "Enter") {
                    event.preventDefault();
                }
            });
            parts.push(reason);
        }

        if (ready) {
            parts.push(...buildUnitControls(unit));
        }
        unit.panel.replaceChildren(...parts);
        if (ready) {
            drawUnit(unit);
        }
        unit.built = true;
    }

    // the table's name, the row of names, and the preview of a sheet that can be ticked
    function buildUnitControls(unit) {
        const name = field(
            `${unit.id}-name`,
            IMPORT_TABLE_NAME_LABEL,
            el("input", { type: "text", className: "app-dialog-input", autocomplete: "off", spellcheck: false }),
            { hint: IMPORT_TABLE_NAME_HINT, note: true }
        );
        name.control.setAttribute("autocapitalize", "off");
        name.control.setAttribute("autocorrect", "off");
        name.control.value = unit.tableName;
        if (unit.note) {
            name.showNote(unit.note);
        }
        name.control.addEventListener("input", () => {
            unit.nameEdited = true;
            unit.tableName = name.control.value;
            // (the name is the student's now, not the dialog's)
            unit.note = "";
            name.clearNote();
            name.clearError();
        });
        name.control.addEventListener("change", () => {
            if (name.control.value !== "") {
                name.control.value = sanitiseName(name.control.value);
                unit.tableName = name.control.value;
            }
        });

        const hasNames = el("input", { type: "checkbox", id: `${unit.id}-has-names` });
        const hasNamesLabel = el("label", { className: "import-check", htmlFor: hasNames.id });
        hasNamesLabel.append(hasNames, el("span", {}, IMPORT_HAS_NAMES_SHEET_LABEL));
        const namesRow = field(
            `${unit.id}-names-row`,
            IMPORT_NAMES_ROW_LABEL,
            el("input", { type: "number", className: "app-dialog-input import-number", min: "1", step: "1", inputMode: "numeric" })
        );
        hasNames.addEventListener("change", () => {
            unit.hasNames = hasNames.checked;
            drawUnit(unit);
            refresh();
        });
        namesRow.control.addEventListener("input", () => {
            const text = namesRow.control.value.trim();
            unit.namesRow = /^[0-9]+$/.test(text) ? Number(text) : NaN;
            whileEdited(namesRow.control, () => drawUnit(unit));
            refresh();
        });
        const names = el("div", { className: "import-names" });
        names.append(hasNamesLabel, namesRow.box);
        const settings = el("div", { className: "import-settings" });
        settings.append(name.box, names);

        const preview = el("div", { className: "import-preview" });
        preview.setAttribute("role", "region");
        preview.setAttribute("aria-label", IMPORT_PREVIEW_LABEL);
        preview.tabIndex = 0;
        const note = el("p", { className: "app-dialog-hint import-preview-note", hidden: true });
        unit.controls = { name, hasNames, namesRow, preview, note };
        const rows = el("div", { className: "import-sheet-rows" });
        rows.append(el("p", { className: "app-dialog-label import-preview-title" }, IMPORT_PREVIEW_LABEL));
        // (where the table starts, when that is not the sheet's first cell: row numbers count from there)
        if (unit.sheet.start !== "A1") {
            rows.append(el("p", { className: "app-dialog-hint import-sheet-start" }, importSheetStartNote(unit.sheet.start)));
        }
        rows.append(note, preview);
        return [settings, rows];
    }

    // drawUnit brings a sheet's controls and its preview in line with what it is set to
    function drawUnit(unit) {
        const { name, hasNames, namesRow, preview, note } = unit.controls;
        if (name.control.value !== unit.tableName && !unit.nameEdited) {
            name.control.value = unit.tableName;
        }
        hasNames.checked = unit.hasNames;
        if (Number.isSafeInteger(unit.namesRow) && namesRow.control.value.trim() !== String(unit.namesRow)) {
            namesRow.control.value = String(unit.namesRow);
        }
        namesRow.control.disabled = !unit.hasNames;
        const problem = sheetNamesProblem(unit);
        if (problem) {
            namesRow.showError(problem);
            keepMessageWhole(namesRow.control);
        } else {
            namesRow.clearError();
        }
        const namesAt = unit.hasNames && !problem ? unit.namesRow : 0;
        const first = Math.max(1, namesAt - ROWS_ABOVE);
        // (rows of the rectangle, from number `first`: the same window a text file's preview shows)
        const shown = previewRows(unit.sheet, first - 1, namesAt + PREVIEW_ROWS - first + 1);
        preview.replaceChildren(previewTable(shown, first, namesAt));
        const notes = [];
        if (first > 1) {
            notes.push(importPreviewAboveMessage(first - 1));
        }
        if (namesAt && unit.sheet.rows === namesAt) {
            notes.push(IMPORT_PREVIEW_NO_DATA_MESSAGE);
        }
        note.textContent = notes.join(" ");
        note.hidden = !notes.length;
    }

    // shows a sheet's panel, with the file's tab first
    function showUnit(unit) {
        tabList.show(unit.tab.button.id);
        unit.tab.workbook.strip?.show(unit.button.id);
        if (unit.button) {
            bringIntoStrip(unit.button);
        }
    }

    // A strip of tabs scrolls sideways, and a tab that the dialog selects (the first sheet that is
    // ticked, the sheet whose name is wrong) is not one the student pressed or arrowed to: it has to be
    // brought into view, or the strip shows no selected tab while the panel below shows that sheet. Only
    // the strip is moved, never the body or the dialog. Nothing happens while the strip is not laid out
    // (another file's tab is on show): showing that file's tab does it then.
    function bringIntoStrip(button) {
        const strip = button.parentElement;
        const around = strip.getBoundingClientRect();
        const at = button.getBoundingClientRect();
        if (around.width === 0) {
            return;
        }
        if (at.left < around.left) {
            strip.scrollLeft -= around.left - at.left;
        } else if (at.right > around.right) {
            strip.scrollLeft += at.right - around.right;
        }
    }

    // ---- names --------------------------------------------------------------------------------

    // The names the dialog suggests are given in one pass: the names the destination already
    // holds come first, then the tabs in order; each takes the first of x, x_2, x_3 that nothing
    // before it has. A name the student has typed is theirs: it only takes its place.
    // A name that the dialog changed because the destination already has the natural one has a note,
    // which says so: importNameMadeUniqueNote names the database, and importNameMadeUniqueTemporaryNote
    // is for a name that only a TEMP table or view has (taken() gives true for it: it is in no database,
    // and the student would look for it there in vain). A name that is x_2 only because an earlier file
    // or sheet of this choice has x has none: both are in view, and nothing is asked of the student
    // there. The note is kept on the unit, since the panel of a sheet may not be built yet; the panel
    // shows it when it is built.
    function suggestNames() {
        const taken = usesOpenDatabase() ? getDestination().taken() : new Map();
        const used = new Set(taken.keys());
        for (const unit of nameUnits()) {
            if (unit.nameEdited) {
                used.add(sameNameKey(sanitiseName(unit.tableName)));
                unit.note = "";
                unit.controls?.name.clearNote();
            } else {
                const wanted = unit.isSheet ? sheetTableName(unit.sheet, unit.file.name) : tableNameFor(unit.file.name);
                unit.tableName = uniqueName(wanted, used);
                const key = sameNameKey(wanted);
                if (!taken.has(key)) {
                    unit.note = "";
                } else if (taken.get(key)) {
                    unit.note = importNameMadeUniqueTemporaryNote(wanted, unit.tableName);
                } else {
                    unit.note = importNameMadeUniqueNote(getDestination().name, wanted, unit.tableName);
                }
                if (unit.controls) {
                    unit.controls.name.control.value = unit.tableName;
                    unit.controls.name.clearError();
                    if (unit.note) {
                        unit.controls.name.showNote(unit.note);
                    } else {
                        unit.controls.name.clearNote();
                    }
                }
            }
        }
    }

    // What may take a table name, in order: a text file's tab (a file whose kind is not known yet
    // counts as one), and each sheet that can be ticked, ticked or not, of a workbook that has been
    // read: the names a sheet is given never change as sheets are ticked.
    function nameUnits() {
        const units = [];
        for (const tab of importable()) {
            if (tab.workbook) {
                units.push(...tab.workbook.units.filter((unit) => unit.state === "ready"));
            } else if (!tab.isWorkbook) {
                units.push(tab);
            }
        }
        return units;
    }

    // What gives a table when Import is pressed, in the tabs' order: each text file, and each sheet that
    // is ticked and can be.
    function tickedUnits() {
        const units = [];
        for (const tab of importable()) {
            if (tab.workbook) {
                units.push(...tab.workbook.units.filter((unit) => unit.ticked && unit.state === "ready"));
            } else if (!tab.isWorkbook) {
                units.push(tab);
            }
        }
        return units;
    }

    // checkNames shows what is wrong with a table name, in its tab; true when all are fine
    function checkNames() {
        const taken = usesOpenDatabase() ? getDestination().taken() : new Map();
        const seen = new Map();
        let firstBad = null;
        for (const unit of tickedUnits()) {
            // (a sheet's panel may not have been built yet: its name is then the one that was suggested)
            const typed = unit.controls ? unit.controls.name.control.value : unit.tableName;
            unit.tableName = typed === "" ? "" : sanitiseName(typed);
            if (unit.controls) {
                unit.controls.name.control.value = unit.tableName;
            }
            const key = sameNameKey(unit.tableName);
            let problem = "";
            if (unit.tableName === "") {
                problem = IMPORT_NAME_EMPTY_MESSAGE;
            } else if (RESERVED_NAME.test(unit.tableName)) {
                problem = IMPORT_NAME_RESERVED_MESSAGE;
            } else if (seen.has(key)) {
                problem = unit.isSheet || seen.get(key).isSheet ? IMPORT_NAME_TWICE_SHEET_MESSAGE : IMPORT_NAME_TWICE_MESSAGE;
            } else if (taken.has(key)) {
                // (a TEMP table is in no database: the student would look for it there in vain)
                problem = taken.get(key) ? IMPORT_NAME_TEMPORARY_MESSAGE : importNameTakenMessage(getDestination().name);
            }
            seen.set(key, unit);
            if (problem) {
                if (!unit.controls) {
                    buildUnit(unit);
                }
                unit.controls.name.showError(problem);
                firstBad ??= unit;
            } else {
                unit.controls?.name.clearError();
            }
        }
        if (firstBad) {
            if (firstBad.isSheet) {
                showUnit(firstBad);
            } else {
                tabList.show(firstBad.button.id);
            }
            // (also when the focus was there already, Enter pressed in that field: no "focusin" comes then)
            firstBad.controls.name.control.focus({ preventScroll: true });
            keepWhole(firstBad.controls.name.control);
        }
        return !firstBad;
    }

    // ---- the dialog as a whole ------------------------------------------------------------------

    function showError(message) {
        error.textContent = message;
        error.hidden = false;
    }

    function clearError() {
        error.textContent = "";
        error.hidden = true;
    }

    // what holds Import up in a tab: "" for nothing, "reading" (its first reading has not
    // ended), "waiting" (a large file that asks first), "settling" (read again after a change:
    // over in a moment) or "problem" (it cannot be imported as it is set)
    function holding(tab) {
        if (tab.state !== "ready") {
            return tab.state === "warning" ? "waiting" : "reading";
        }
        if (tab.workbook) {
            // (a workbook's sheets hold Import up one by one: holds, below)
            return "";
        }
        if (tab.checking || tab.unsettled) {
            return "settling";
        }
        return !tab.encodingFits || tab.problem || namesRowProblem(tab) ? "problem" : "";
    }

    const HOLD_MESSAGES = { reading: importHoldReadingMessage, waiting: importHoldWaitingMessage, problem: importHoldProblemMessage };
    // a file is read in a moment as a rule: the line waits this long before it says "still reading"
    const HOLD_READING_AFTER_MS = 600;
    let holdTimer = 0;

    // what is brought into view for a control: the control alone, as a rule. A field that shows a
    // message (aria-invalid) is brought whole, its label, its control, its hint and its message, since
    // the message says why Import is off and a message cut by the foot says nothing; unless the field is
    // higher than the body shows, when the control alone is brought, as for any other field.
    function toShow(control) {
        const box = control.closest(".import-field");
        if (box && control.getAttribute("aria-invalid") === "true" && box.getBoundingClientRect().height <= body.clientHeight) {
            return box;
        }
        return control;
    }

    // showWhole scrolls a control that has taken the focus wholly into view, unless a pointer is
    // pressing it or it does not show its focus (the listener for "focusin", at the end, says
    // why not then).
    function showWhole(control) {
        if (!pressing && control.matches(":focus-visible")) {
            toShow(control).scrollIntoView({ block: "nearest", inline: "nearest" });
        }
    }

    // is the whole of a control (or of a field, for a control that shows a message) inside what the body shows?
    function isWhole(control) {
        const box = toShow(control).getBoundingClientRect();
        const shown = body.getBoundingClientRect();
        return box.top >= shown.top && box.bottom <= shown.bottom;
    }

    // The foot is higher or lower by a line when the line that says why Import is off comes,
    // goes or changes, and the body with it, from below. A control of the body that has the
    // focus and could be seen whole before (the tab of a large file, when the dialog has just
    // opened in a low window) is scrolled back when that has cut it. Nothing else moves: not a
    // control that is still whole, and not a body that the student had scrolled away from the
    // control. And nothing moves while a pointer is down on the dialog, since the control must
    // not leave it: that waits for the release, and is done then only if the control still has
    // the focus and the body is where it was (`released`, at the end).
    // The same is done for a message that has come under the field that has the focus (the row of
    // the names, typed beyond the sheet): a message at the lower edge of the body is cut by the foot,
    // and the line beside Import never says why Import is off for what is wrong in the tab on show
    // (keepMessageWhole, below).
    function focusedWhole() {
        const focused = document.activeElement;
        return focused && body.contains(focused) && isWhole(focused) ? focused : null;
    }
    function keepWhole(control) {
        if (pointerDown) {
            owed = { control, at: body.scrollTop, edited: control === edited };
        } else if (control.isConnected && !isWhole(control)) {
            toShow(control).scrollIntoView({ block: "nearest", inline: "nearest" });
        }
    }

    // A message that has just come under a field (or is there still, as the student types): when that
    // field has the focus its whole is brought into view, by the least scroll that does it. Nothing
    // moves for a field that does not have the focus (a tab that is not on show has none), and
    // nothing when a message goes: this is called only where one is shown. A field that is being
    // changed is the one the student is at even where the browser did not give it the focus (an arrow
    // of a number field, pressed with the pointer, in Firefox).
    function keepMessageWhole(control) {
        if (control === document.activeElement || control === edited) {
            keepWhole(control);
        }
    }
    function whileEdited(control, redraw) {
        edited = control;
        try {
            redraw();
        } finally {
            edited = null;
        }
    }

    // what holds Import up, in the tabs' order: a tab that waits, or reads, or cannot be imported as it
    // is set, and a ticked sheet whose row of names is no row of it (a sheet that is not ticked never
    // holds Import up: a row typed beyond a sheet nobody wants must not block)
    function holds() {
        const found = [];
        for (const tab of importable()) {
            const state = holding(tab);
            if (state) {
                found.push({ state, tab, unit: null });
            }
            for (const unit of tab.workbook?.units ?? []) {
                if (unit.ticked && sheetNamesProblem(unit)) {
                    found.push({ state: "problem", tab, unit });
                }
            }
        }
        return found;
    }

    // can the tab give a table: not once it is a workbook that has been read and has no sheet that can
    // be ticked (every one holds nothing, or is too wide, or damaged)
    const canGive = (tab) => !tab.workbook || tab.workbook.units.some((unit) => unit.state === "ready");

    // is the sheet, or the file's tab, the one the student is looking at
    function onShow(held) {
        if (held.tab.button.id !== tabList?.current()) {
            return false;
        }
        const book = held.tab.workbook;
        return !held.unit || book.listed === 1 || book.shown === held.unit;
    }

    // refresh brings the buttons and the destination in line with the tabs
    function refresh() {
        const left = importable();
        const holdups = holds();
        const held = holdups.length > 0;
        const nothing = !left.some(canGive);
        // Every file is read and nothing is held up, but no sheet is ticked: there is nothing to import
        const noneTicked = !held && !nothing && tickedUnits().length === 0;
        submit.hidden = nothing || Boolean(running);
        submit.disabled = nothing || held || noneTicked;
        destination.hidden = nothing || Boolean(running);
        cancel.textContent = nothing && !running ? IMPORT_CLOSE_TEXT : IMPORT_CANCEL_TEXT;
        databaseName.control.disabled = !newChoice.checked;
        // Why Import is off: the tab on show says so itself, where the student is working, and a
        // line says it for another tab. A file that waits for an answer is named whichever tab
        // is on show: in a low window its question can be out of view, the wait does not end by
        // itself, and nothing else in view would say why Import cannot be pressed. The line
        // names the first file, in the tabs' order, that it can name. What the tab on show says
        // of itself never decides it: a line that came and went with each key typed there (a
        // row for the names that is no row, then is one again) would move the body under the
        // student's hands.
        clearTimeout(holdTimer);
        const nameable = (one) => one.state === "waiting" || ((one.state === "reading" || one.state === "problem") && !onShow(one));
        const named = running ? undefined : holdups.find(nameable);
        let why = "";
        if (named?.unit) {
            why = importHoldSheetProblemMessage(named.unit.label, named.tab.file.name);
        } else if (named) {
            let message = HOLD_MESSAGES[named.state];
            if (message === importHoldReadingMessage) {
                const waited = performance.now() - named.tab.readingSince;
                if (waited < HOLD_READING_AFTER_MS) {
                    holdTimer = setTimeout(refresh, HOLD_READING_AFTER_MS - waited);
                    message = null;
                }
            }
            why = message ? message(named.tab.file.name) : "";
        } else if (noneTicked && !running) {
            why = IMPORT_HOLD_NO_SHEET_MESSAGE;
        }
        const changed = hold.textContent !== why;
        // (looked at before the foot changes its height: keepWhole, above)
        const whole = changed ? focusedWhole() : null;
        if (changed) {
            hold.textContent = why;
        }
        hold.hidden = !why;
        if (why) {
            submit.setAttribute("aria-describedby", hold.id);
        } else {
            submit.removeAttribute("aria-describedby");
        }
        if (whole) {
            keepWhole(whole);
        }
    }

    // a file's name without its extension
    const baseName = (name) => (name.lastIndexOf(".") > 0 ? name.slice(0, name.lastIndexOf(".")) : name);

    // The new database is named after the first file that can give a table (not a refused file, and
    // not a workbook with no sheet that can be ticked), or after the first file when none can, until
    // the student types a name of their own.
    let databaseNameEdited = false;
    function suggestDatabaseName() {
        const first = importable().find(canGive) ?? importable()[0] ?? tabs[0];
        if (first && !databaseNameEdited) {
            databaseName.control.value = baseName(first.file.name);
        }
    }

    function fillDestination() {
        const target = getDestination();
        newChoice.checked = true;
        openChoice.checked = false;
        openChoice.disabled = !target.allowed;
        // with no database open there is one place to import into, and nothing to choose
        intoOpen.hidden = target.name === null;
        openText.textContent = importOpenDatabaseLabel(target.name ?? "");
        openNote.textContent = IMPORT_COURSE_DATABASE_NOTE;
        openNote.hidden = target.allowed || target.name === null;
        if (openNote.hidden) {
            openChoice.removeAttribute("aria-describedby");
        } else {
            openChoice.setAttribute("aria-describedby", openNote.id);
        }
        databaseNameEdited = false;
        databaseName.clearError();
        suggestDatabaseName();
    }

    function setRunning(state) {
        running = state;
        files.hidden = Boolean(state);
        progress.hidden = !state;
        if (state) {
            dialog.setAttribute("aria-busy", "true");
        } else {
            dialog.removeAttribute("aria-busy");
        }
        refresh();
    }

    function open(chosen) {
        session++;
        live = true;
        opened++;
        const mine = session;
        clearError();
        setRunning(null);
        tabs = chosen.map((file, n) => newTab(file, n));
        const list = el("div", { className: "tabs import-tabs" });
        list.setAttribute("role", "tablist");
        sendFocusToSelectedTab(list);
        list.setAttribute("aria-label", IMPORT_TABS_LABEL);
        list.append(...tabs.map((tab) => tab.button));
        const panels = el("div", { className: "import-panels" });
        panels.append(...tabs.map((tab) => tab.panel));
        files.replaceChildren(list, panels);
        tabList = null;
        // (another tab on show: the line that says why Import is off may have to change)
        tabList = mountTabs(list, {
            onShow: (id) => {
                refresh();
                // (a workbook whose strip was not laid out when its sheets came: its selected sheet's tab)
                const shown = tabs.find((tab) => tab.button.id === id)?.workbook?.shown;
                if (shown?.button) {
                    bringIntoStrip(shown.button);
                }
            },
        });
        fillDestination();
        for (const tab of tabs) {
            showReading(tab);
        }
        refresh();
        if (!dialog.open) {
            dialog.showModal();
        }
        tabs[0].button.focus();
        // one file after the other: a large one is read while the first can already be looked at
        (async () => {
            for (const tab of tabs) {
                if (mine !== session) {
                    return;
                }
                await look(tab, mine);
            }
        })();
    }

    // endSession: the dialog is closing, whichever way. What it was waiting for is dropped, an
    // import that is running is told to stop, and the files are let go. A key that is still held
    // down presses nothing on the page (below, at the listener for "keydown"). Once for each
    // closing, the first time the page hears of it: the browser tells of a closing again a moment
    // after the fact (the listener for "close", below), and a key that was let go and pressed
    // again by then is not a held key any more.
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
        swallowHeldEnter();
        clearTimeout(holdTimer);
        // (a dialog that closed while it was importing is not busy any more)
        dialog.removeAttribute("aria-busy");
        files.replaceChildren();
        tabs = [];
    }

    // (the focus: the browser puts it back where it was before the dialog opened, and the
    // listener for "close", below, sees to the case where that place has gone)
    function close() {
        endSession();
        if (dialog.open) {
            dialog.close();
        }
        restoreFocus();
    }

    // When the dialog closes, by Cancel or by Escape, the browser gives the focus back to what
    // had it before: the editor, say, for files chosen with Ctrl+O from there. When that is gone
    // (the menu entry that opened the chooser, a file dropped with the focus nowhere), the focus
    // would be left on the page as a whole: it goes to returnFocus then.
    function restoreFocus() {
        const focused = document.activeElement;
        if (!focused || focused === document.body || dialog.contains(focused)) {
            returnFocus.focus();
        }
    }

    async function importNow() {
        if (running || submit.disabled) {
            return;
        }
        clearError();
        if (!checkNames()) {
            return;
        }
        let target = { kind: "open" };
        if (newChoice.checked) {
            const name = databaseName.control.value.trim();
            if (!name) {
                databaseName.showError(IMPORT_NEW_DATABASE_EMPTY_MESSAGE);
                databaseName.control.focus({ preventScroll: true });
                keepWhole(databaseName.control);
                return;
            }
            target = { kind: "new", name };
        }
        const mine = session;
        // a text file as it is set, or a sheet that is ticked, in the tabs' order, a workbook's sheets together
        const job = {
            files: tickedUnits().map((unit) =>
                unit.isSheet
                    ? {
                          id: unit.id,
                          file: unit.file,
                          sheet: unit.sheet,
                          // (what the tab and the panel call the sheet: a name of only spaces is no name to a reader)
                          label: unit.label,
                          hasNames: unit.hasNames,
                          namesRow: unit.namesRow,
                          tableName: unit.tableName,
                          listed: unit.tab.workbook.listed,
                      }
                    : {
                          id: unit.id,
                          file: unit.file,
                          encoding: unit.encoding,
                          delimiter: unit.delimiter,
                          newline: unit.newline,
                          hasNames: unit.hasNames,
                          namesRow: unit.namesRow,
                          tableName: unit.tableName,
                          mark: unit.mark,
                      }
            ),
            destination: target,
            left: filesLeft(),
        };
        const state = { stop: false };
        // A job of text files only says "Importing file 2 of 3: name". A job that has a sheet counts
        // tables, since a workbook gives several: "Importing table 2 of 5: orders (shopping_db.xlsx)"; a
        // text file in it is named by its file.
        const hasSheet = job.files.some((item) => item.sheet);
        const titleOf = (at, of, name, table) => {
            if (!hasSheet) {
                return importProgressTitle(at, of, name);
            }
            return table ? importProgressTableTitle(at, of, table, name) : importProgressTextTitle(at, of, name);
        };
        // (what the first step will say, until the import reports for itself)
        progressTitle.textContent = titleOf(1, job.files.length, job.files[0].file.name, job.files[0].sheet ? job.files[0].tableName : null);
        progressPart.textContent = IMPORT_PROGRESS_READING;
        progressBar.value = 0;
        setRunning(state);
        cancel.focus();
        let outcome;
        try {
            outcome = await onImport(job, {
                cancelled: () => state.stop,
                progress({ at, of, name, table = null, part, done, total }) {
                    progressTitle.textContent = titleOf(at, of, name, table);
                    progressPart.textContent = part === "copy" ? IMPORT_PROGRESS_COPYING : IMPORT_PROGRESS_READING;
                    progressBar.value = total > 0 ? Math.min(1, done / total) : 0;
                },
            });
        } catch {
            outcome = { ok: false, message: "" };
        }
        if (mine !== session) {
            // the dialog was closed meanwhile: the import was cancelled, and has been undone
            return;
        }
        if (outcome.ok) {
            running = null;
            endSession();
            dialog.close();
            return;
        }
        setRunning(null);
        if (outcome.refused) {
            const tab = tabs.find((candidate) => candidate.id === outcome.refused.id);
            if (tab) {
                refuse(tab, outcome.refused.reason);
                tabList.show(tab.button.id);
                tab.button.focus();
            }
        } else if (outcome.message) {
            showError(outcome.message);
            cancel.focus();
        }
        refresh();
    }

    form.addEventListener("submit", (event) => {
        event.preventDefault();
        importNow();
    });
    cancel.addEventListener("click", close);
    databaseName.control.addEventListener("input", () => {
        databaseNameEdited = true;
        databaseName.clearError();
    });
    for (const choice of [newChoice, openChoice]) {
        choice.addEventListener("change", () => {
            databaseName.clearError();
            suggestNames();
            refresh();
        });
    }
    // A control that takes the focus is scrolled wholly into view. Firefox does this by itself
    // only when less than a line of the control can be seen: a small control it brings in, to
    // the middle, but the preview, which is tall, was left with its lower part cut off. Two
    // cases are left alone. A control that a pointer is pressing must not move from under the
    // pointer before the press has ended (a double click in a field would land beside it, and a
    // drag would select nothing): the focus that a press gives arrives in the same turn as its
    // "mousedown", which a tap and a pen send as well, so `pressing` lasts that turn and no
    // longer. And a control that does not show its focus (a tick box whose label was pressed)
    // is not moved by the dialog: the browser may still bring it in, when part of it was out of
    // view.
    dialog.addEventListener(
        "mousedown",
        (event) => {
            pressing = true;
            // (the main button alone is held to a release: another button opens a menu, and
            // its release may never be told)
            if (event.button === 0) {
                pointerDown = true;
            }
            setTimeout(() => {
                pressing = false;
            }, 0);
        },
        true
    );
    dialog.addEventListener("focusin", (event) => showWhole(event.target));
    // The press has ended, wherever the pointer was let go; or a menu opened over it, or the
    // window lost the focus meanwhile, and the release may never be told. What is owed to a
    // control that the foot cut during the press (keepWhole) is done now, when it is still the
    // control that has the focus and the body has not been scrolled since: otherwise the
    // student has moved on, and nothing is to move under them.
    const released = () => {
        pointerDown = false;
        const waiting = owed;
        owed = null;
        const at = waiting && (waiting.control === document.activeElement || (waiting.edited && waiting.control.getAttribute("aria-invalid") === "true"));
        if (at && Math.abs(body.scrollTop - waiting.at) < 1) {
            keepWhole(waiting.control);
        }
    };
    for (const type of ["mouseup", "pointerup", "pointercancel", "dragend", "contextmenu"]) {
        window.addEventListener(type, released, true);
    }
    // (not in the capture phase: there the blur of every control would pass by)
    window.addEventListener("blur", (event) => {
        if (event.target === window) {
            released();
        }
    });
    // A database that opens while the dialog is open is not the one its destination and its
    // names were worked out for (Back and Forward reach the page under a dialog): the dialog
    // closes, as the export's does. Not while an import runs: the only database the page opens
    // then is the import's own new one, and the dialog closes itself when the import has ended.
    document.addEventListener("lab:database-loaded", () => {
        if (dialog.open && !running) {
            close();
        }
    });
    // Escape. The browser tells of it here before it closes the dialog; of the closing itself it
    // tells only later (below). Two things come in between: a step of the import that was already
    // waiting for its turn, which would see no Cancel, and a key that is held down, which repeats
    // on the page as soon as the dialog has gone (in the editor, when the focus goes back there).
    // So the session ends now: the import is told to stop, and a held key presses nothing. Only
    // the dialog's own event is Escape: one that comes up from inside it (a file chooser that is
    // dismissed tells of itself with an event of this name) closes nothing.
    dialog.addEventListener("cancel", (event) => {
        if (event.target === dialog) {
            endSession();
        }
    });
    // Any other way the browser closes a dialog, and the focus after every closing. The event
    // arrives after the fact: by then the dialog can be open again, for other files, and those
    // are not this event's to end. (A session that close() or Escape has ended already is not
    // ended twice.)
    dialog.addEventListener("close", () => {
        if (dialog.open) {
            return;
        }
        endSession();
        restoreFocus();
    });
    // A key that is held down repeats. Enter held on Import would press Cancel, which has the
    // focus once the import runs: a repeated Enter does nothing in this dialog. Nor does it once
    // the dialog has closed under the key: the repeats would type empty lines into the editor, or
    // press the button that gets the focus back (js/lab/held-enter.js takes them away until the
    // key is let go, and says what it does not cover).
    dialog.addEventListener("keydown", (event) => {
        if (event.key === "Enter" && event.repeat) {
            event.preventDefault();
        }
    });

    return { open };
}
