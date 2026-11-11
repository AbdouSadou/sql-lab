// "Database (.db)…" of the Export menu: a dialog that names the file and saves the open database.
// The file name is also the database's name in the app, so a rename happens here (the UI plan
// moves it out of the old editable name in the header): changing it renames the database as the
// old header did, moving the SQL saved for it, the page title and the CSV file's name along.
//
// mountExportDialog({returnFocus, getName, getProblem, onExport, onNoDatabase}) -> {open()}
//   returnFocus  the element the focus goes back to (the Export menu's button)
//   getName()    the open database's name, or null with no database open
//   getProblem() why the open database cannot be saved (it is empty), or null; then the dialog
//                does not open and onNoDatabase(message) says why, as the old export button did
//   onExport(name)  save under this name (index.js renames first if it changed, then exports)
//   onNoDatabase(message)  no dialog: there is nothing to save
//
// A native <dialog> (showModal): the browser keeps the focus inside and Escape closes it. The
// name is an <input>: text only, one line, no spell-check squiggle. A database that loads while
// the dialog is open (a slow choice, Back) closes it: its name was the old database's.

import {
    EXPORT_CANCEL_TEXT,
    EXPORT_DIALOG_TEXT,
    EXPORT_DIALOG_TITLE,
    EXPORT_NAME_HINT,
    EXPORT_NAME_LABEL,
    EXPORT_SUBMIT_TEXT,
    NO_DATABASE_MESSAGE,
} from "./config.js";

function el(tag, props = {}, text = "") {
    const node = document.createElement(tag);
    Object.assign(node, props);
    if (text) {
        node.textContent = text;
    }
    return node;
}

export function mountExportDialog({ returnFocus, getName, getProblem = () => null, onExport, onNoDatabase }) {
    const dialog = el("dialog", { id: "export-dialog", className: "app-dialog" });
    dialog.setAttribute("aria-labelledby", "export-dialog-title");
    const form = el("form", { method: "dialog", noValidate: true });
    const input = el("input", { id: "export-name", type: "text", autocomplete: "off", spellcheck: false, className: "app-dialog-input" });
    input.setAttribute("autocapitalize", "off");
    input.setAttribute("autocorrect", "off");
    input.setAttribute("aria-describedby", "export-name-hint");
    const submit = el("button", { type: "submit", className: "button button--primary" }, EXPORT_SUBMIT_TEXT);
    const cancel = el("button", { type: "button", className: "button" }, EXPORT_CANCEL_TEXT);
    const actions = el("div", { className: "app-dialog-actions" });
    actions.append(submit, cancel);
    form.append(
        el("h2", { id: "export-dialog-title", className: "app-dialog-title" }, EXPORT_DIALOG_TITLE),
        el("p", { className: "app-dialog-text" }, EXPORT_DIALOG_TEXT),
        el("label", { htmlFor: "export-name", className: "app-dialog-label" }, EXPORT_NAME_LABEL),
        input,
        el("p", { id: "export-name-hint", className: "app-dialog-hint" }, EXPORT_NAME_HINT),
        actions
    );
    dialog.append(form);
    document.body.append(dialog);

    function open() {
        const name = getName();
        if (name === null) {
            onNoDatabase(NO_DATABASE_MESSAGE);
            return;
        }
        const problem = getProblem();
        if (problem) {
            onNoDatabase(problem);
            return;
        }
        input.value = name;
        if (!dialog.open) {
            dialog.showModal();
        }
        input.focus();
        input.select();
    }

    function close() {
        if (dialog.open) {
            dialog.close();
        }
        returnFocus.focus();
    }

    form.addEventListener("submit", (event) => {
        event.preventDefault();
        // a name that is only blanks keeps the current one
        const name = input.value.trim() || getName();
        close();
        onExport(name);
    });
    cancel.addEventListener("click", close);
    dialog.addEventListener("close", () => {
        const focused = document.activeElement;
        if (!focused || focused === document.body || dialog.contains(focused)) {
            returnFocus.focus();
        }
    });
    document.addEventListener("lab:database-loaded", () => {
        if (dialog.open) {
            dialog.close();
        }
    });

    return { open };
}
