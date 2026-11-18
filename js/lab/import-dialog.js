// The import's dialog (assessment plan, section 3, "Preview dialog"): one tab for each file,
// with the first rows exactly as read, the settings the reading used (all changeable), the name
// of the table it will make, and where the tables go. Nothing is imported before the student
// presses Import. While the import runs the same dialog shows its progress, with Cancel.
//
//   mountImportDialog({returnFocus, getDestination, loadReader, onImport}) -> {open(files), isOpen()}
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
//     onImport(job, {progress, cancelled}) -> Promise<outcome>
//                       job is {files: [{id, file, encoding, delimiter, newline, hasNames,
//                       namesRow, tableName, mark}], destination: {kind: "new", name} or {kind:
//                       "open"}}. The caller runs the import: it calls progress({at, of, name,
//                       part, done, total}) as it goes and looks at cancelled() between two pieces
//                       of work. outcome is {ok: true}, or {ok: false, message} (nothing was
//                       imported: the message is shown, and the dialog stays), or {ok: false,
//                       refused: {id, reason}} (that file cannot be imported: its tab says why,
//                       and the others can be tried again), or {ok: false, cancelled: true}
//                       (the import was told to stop: the dialog has closed by then, and
//                       does not look at it).
//
// What a file is, is decided from its bytes before its name (js/lab/import-text.js). A file that
// cannot be imported gets a tab with its reason, and the others can still be imported; with
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
    IMPORT_DIALOG_TITLE,
    IMPORT_EMPTY_REASON,
    IMPORT_ENCODING_LABEL,
    IMPORT_ENCODING_NAMES,
    IMPORT_HAS_NAMES_LABEL,
    IMPORT_LARGE_FILE_CONTINUE_TEXT,
    IMPORT_LARGE_FILE_LEAVE_TEXT,
    IMPORT_LEFT_OUT_REASON,
    IMPORT_LEFT_OUT_TAB_TEXT,
    IMPORT_LIBRARY_FAILED_MESSAGE,
    IMPORT_NAME_EMPTY_MESSAGE,
    IMPORT_NAME_RESERVED_MESSAGE,
    IMPORT_NAME_TEMPORARY_MESSAGE,
    IMPORT_NAME_TWICE_MESSAGE,
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
    IMPORT_SUBMIT_TEXT,
    IMPORT_TABLE_NAME_HINT,
    IMPORT_TABLE_NAME_LABEL,
    IMPORT_TABS_LABEL,
    IMPORT_TEXT_MAX_BYTES,
    IMPORT_TEXT_WARN_BYTES,
    IMPORT_TOO_LARGE_REASON,
    IMPORT_TOO_WIDE_REASON,
    IMPORT_UNREADABLE_REASON,
    IMPORT_WORKBOOK_REASON,
    INSPECT_SLICE_BYTES,
    PREVIEW_BYTES,
    PREVIEW_ROWS,
    importEncodingMessage,
    importHoldProblemMessage,
    importHoldReadingMessage,
    importHoldWaitingMessage,
    importLargeFileMessage,
    importNameTakenMessage,
    importNamesRowMessage,
    importOpenDatabaseLabel,
    importPreviewAboveMessage,
    importProgressTitle,
} from "./config-workflow.js";
import { NULL_TEXT } from "./config.js";
import { swallowHeldEnter } from "./held-enter.js";
import { icon } from "./icons.js";
import { DELIMITERS, MAX_COLUMNS, readStart } from "./import-csv.js";
import { newPace } from "./import-pace.js";
import { firstRowLooksLikeNames, sameNameKey, sanitiseName, tableNameFor, uniqueName } from "./import-rules.js";
import { ENCODINGS, HEAD_BYTES, fitsEncoding, guessEncoding, inspectText, kindByStart, markOf, startOfText } from "./import-text.js";
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

// a labelled control with room for a hint and an error under it
function field(id, labelText, control, { hint = "" } = {}) {
    const box = el("div", { className: "import-field" });
    const label = el("label", { className: "app-dialog-label", htmlFor: id }, labelText);
    control.id = id;
    const error = el("p", { id: `${id}-error`, className: "app-dialog-error", hidden: true });
    error.setAttribute("role", "alert");
    box.append(label, control);
    let hintLine = null;
    if (hint) {
        hintLine = el("p", { id: `${id}-hint`, className: "app-dialog-hint" }, hint);
        control.setAttribute("aria-describedby", hintLine.id);
        box.append(hintLine);
    }
    box.append(error);
    return {
        box,
        control,
        showError(message) {
            error.textContent = message;
            error.hidden = false;
            control.setAttribute("aria-invalid", "true");
            control.setAttribute("aria-describedby", hintLine ? `${error.id} ${hintLine.id}` : error.id);
        },
        clearError() {
            error.textContent = "";
            error.hidden = true;
            control.removeAttribute("aria-invalid");
            if (hintLine) {
                control.setAttribute("aria-describedby", hintLine.id);
            } else {
                control.removeAttribute("aria-describedby");
            }
        },
    };
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
    if (text === undefined || text === "") {
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

export function mountImportDialog({ returnFocus, getDestination, loadReader, onImport }) {
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
        el("p", { id: "import-text", className: "app-dialog-text" }, IMPORT_DIALOG_TEXT),
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
    // A pointer and the dialog (the listeners at the end say why it matters): `pressing` for the
    // turn of a press, in which the focus it gives arrives; `pointerDown` from a press of the
    // main button to its release; `owed`, the control to bring back whole at that release, with
    // where the body was scrolled to when that was noted.
    let pressing = false;
    let pointerDown = false;
    let owed = null;

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
        if (!tab.button.querySelector(".import-tab-refused")) {
            const mark = icon("circle-alert");
            mark.classList.add("import-tab-refused");
            mark.classList.toggle("import-tab-refused--own", own);
            tab.button.prepend(mark);
            tab.button.append(el("span", { className: "visually-hidden" }, `(${own ? IMPORT_LEFT_OUT_TAB_TEXT : IMPORT_REFUSED_TAB_TEXT})`));
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

    function showWarning(tab, mine) {
        tab.state = "warning";
        const megabytes = Math.round(tab.file.size / (1024 * 1024));
        const go = el("button", { type: "button", className: "button" }, IMPORT_LARGE_FILE_CONTINUE_TEXT);
        go.addEventListener("click", () => {
            showReading(tab);
            tab.button.focus();
            read(tab, mine);
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
        box.append(el("p", { className: "import-warning-text" }, importLargeFileMessage(megabytes)), answers);
        tab.panel.replaceChildren(box);
        tab.panel.removeAttribute("tabindex");
        refresh();
    }

    // look decides what the file is, from its first bytes, and whether it is read at once
    async function look(tab, mine) {
        let kind;
        try {
            const head = new Uint8Array(await tab.file.slice(0, HEAD_BYTES).arrayBuffer());
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
        } else if (kind !== "text") {
            // a workbook, whatever it is called: until the plan's Phase 5
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
            { hint: IMPORT_TABLE_NAME_HINT }
        );
        name.control.setAttribute("autocapitalize", "off");
        name.control.setAttribute("autocorrect", "off");
        name.control.addEventListener("input", () => {
            tab.nameEdited = true;
            tab.tableName = name.control.value;
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
            draw(tab);
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
        }
        const problem = namesRowProblem(tab);
        if (problem) {
            namesRow.showError(problem);
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
        const width = shown.reduce((most, row) => Math.max(most, row.length), 0);
        const table = el("table", { className: "result-table import-preview-table" });
        const head = el("tr");
        head.append(el("th", { scope: "col", className: "import-row-heading" }, IMPORT_PREVIEW_ROW_HEADING));
        for (let column = 1; column <= width; column++) {
            head.append(el("th", { scope: "col" }, String(column)));
        }
        table.createTHead().append(head);
        const body = table.createTBody();
        shown.forEach((row, i) => {
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
        preview.replaceChildren(table);
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

    // ---- names --------------------------------------------------------------------------------

    // The names the dialog suggests are given in one pass: the names the destination already
    // holds come first, then the tabs in order; each takes the first of x, x_2, x_3 that nothing
    // before it has. A name the student has typed is theirs: it only takes its place.
    function suggestNames() {
        const used = new Set(usesOpenDatabase() ? getDestination().taken().keys() : []);
        for (const tab of importable()) {
            if (tab.nameEdited) {
                used.add(sameNameKey(sanitiseName(tab.tableName)));
            } else {
                tab.tableName = uniqueName(tableNameFor(tab.file.name), used);
                if (tab.controls) {
                    tab.controls.name.control.value = tab.tableName;
                    tab.controls.name.clearError();
                }
            }
        }
    }

    // checkNames shows what is wrong with a table name, in its tab; true when all are fine
    function checkNames() {
        const taken = usesOpenDatabase() ? getDestination().taken() : new Map();
        const seen = new Map();
        let firstBad = null;
        for (const tab of importable()) {
            const { name } = tab.controls;
            name.control.value = name.control.value === "" ? "" : sanitiseName(name.control.value);
            tab.tableName = name.control.value;
            const key = sameNameKey(tab.tableName);
            let problem = "";
            if (tab.tableName === "") {
                problem = IMPORT_NAME_EMPTY_MESSAGE;
            } else if (RESERVED_NAME.test(tab.tableName)) {
                problem = IMPORT_NAME_RESERVED_MESSAGE;
            } else if (seen.has(key)) {
                problem = IMPORT_NAME_TWICE_MESSAGE;
            } else if (taken.has(key)) {
                // (a TEMP table is in no database: the student would look for it there in vain)
                problem = taken.get(key) ? IMPORT_NAME_TEMPORARY_MESSAGE : importNameTakenMessage(getDestination().name);
            }
            seen.set(key, tab);
            if (problem) {
                name.showError(problem);
                firstBad ??= tab;
            } else {
                name.clearError();
            }
        }
        if (firstBad) {
            tabList.show(firstBad.button.id);
            firstBad.controls.name.control.focus();
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
        if (tab.checking || tab.unsettled) {
            return "settling";
        }
        return !tab.encodingFits || tab.problem || namesRowProblem(tab) ? "problem" : "";
    }

    const HOLD_MESSAGES = { reading: importHoldReadingMessage, waiting: importHoldWaitingMessage, problem: importHoldProblemMessage };
    // a file is read in a moment as a rule: the line waits this long before it says "still reading"
    const HOLD_READING_AFTER_MS = 600;
    let holdTimer = 0;

    // showWhole scrolls a control that has taken the focus wholly into view, unless a pointer is
    // pressing it or it does not show its focus (the listener for "focusin", at the end, says
    // why not then).
    function showWhole(control) {
        if (!pressing && control.matches(":focus-visible")) {
            control.scrollIntoView({ block: "nearest", inline: "nearest" });
        }
    }

    // is the whole of a control inside what the body shows?
    function isWhole(control) {
        const box = control.getBoundingClientRect();
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
    function focusedWhole() {
        const focused = document.activeElement;
        return focused && body.contains(focused) && isWhole(focused) ? focused : null;
    }
    function keepWhole(control) {
        if (pointerDown) {
            owed = { control, at: body.scrollTop };
        } else if (control.isConnected && !isWhole(control)) {
            control.scrollIntoView({ block: "nearest", inline: "nearest" });
        }
    }

    // refresh brings the buttons and the destination in line with the tabs
    function refresh() {
        const left = importable();
        const held = left.find((tab) => holding(tab) !== "");
        const nothing = left.length === 0;
        submit.hidden = nothing || Boolean(running);
        submit.disabled = nothing || Boolean(held);
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
        const current = tabList?.current();
        const nameable = (tab) => {
            const state = holding(tab);
            return state === "waiting" || ((state === "reading" || state === "problem") && tab.button.id !== current);
        };
        const named = running ? undefined : left.find(nameable);
        let message = named ? HOLD_MESSAGES[holding(named)] : null;
        if (message === importHoldReadingMessage) {
            const waited = performance.now() - named.readingSince;
            if (waited < HOLD_READING_AFTER_MS) {
                holdTimer = setTimeout(refresh, HOLD_READING_AFTER_MS - waited);
                message = null;
            }
        }
        const why = message ? message(named.file.name) : "";
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

    // The new database is named after the first file that is not refused, until the student
    // types a name of their own.
    let databaseNameEdited = false;
    function suggestDatabaseName() {
        const first = importable()[0] ?? tabs[0];
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
        list.setAttribute("aria-label", IMPORT_TABS_LABEL);
        list.append(...tabs.map((tab) => tab.button));
        const panels = el("div", { className: "import-panels" });
        panels.append(...tabs.map((tab) => tab.panel));
        files.replaceChildren(list, panels);
        tabList = null;
        // (another tab on show: the line that says why Import is off may have to change)
        tabList = mountTabs(list, { onShow: () => refresh() });
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
                databaseName.control.focus();
                return;
            }
            target = { kind: "new", name };
        }
        const mine = session;
        const job = {
            files: importable().map((tab) => ({
                id: tab.id,
                file: tab.file,
                encoding: tab.encoding,
                delimiter: tab.delimiter,
                newline: tab.newline,
                hasNames: tab.hasNames,
                namesRow: tab.namesRow,
                tableName: tab.tableName,
                mark: tab.mark,
            })),
            destination: target,
        };
        const state = { stop: false };
        // (what the first step will say, until the import reports for itself)
        progressTitle.textContent = importProgressTitle(1, job.files.length, job.files[0].file.name);
        progressPart.textContent = IMPORT_PROGRESS_READING;
        progressBar.value = 0;
        setRunning(state);
        cancel.focus();
        let outcome;
        try {
            outcome = await onImport(job, {
                cancelled: () => state.stop,
                progress({ at, of, name, part, done, total }) {
                    progressTitle.textContent = importProgressTitle(at, of, name);
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
        if (waiting && waiting.control === document.activeElement && Math.abs(body.scrollTop - waiting.at) < 1) {
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

    return {
        open,
        isOpen: () => dialog.open,
    };
}
