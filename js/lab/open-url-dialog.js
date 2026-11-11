// "Open from URL…" (the database switcher's menu, and Ctrl/Cmd+U): a dialog with one labelled
// address field, Open and Cancel (UI plan, section 5). It replaces window.prompt.
//
// mountOpenUrlDialog({onOpen}) -> {open(returnFocus)}
//   onOpen(address)  the address to open (index.js startFromUrl); the dialog has closed by then
//   open(returnFocus)  shows it; Cancel, Escape or a refused address keep the student here, and
//                      on Cancel or Escape the focus goes back to returnFocus (the element that
//                      had it: the database button, or the editor for the shortcut)
//
// A native <dialog> (showModal): the browser keeps the focus inside and Escape closes it. The field
// starts empty every time (never a suggested third-party address). Inline checks before anything
// is requested: an empty field, and an address the page cannot open (DatabasePath "unsupported":
// anything but http(s):// or a path on this site), each with a message tied to the field, which
// stays focused. Anything else is handed over as typed, trimmed, as the prompt did.

import {
    OPEN_URL_CANCEL_TEXT,
    OPEN_URL_EMPTY_MESSAGE,
    OPEN_URL_HINT,
    OPEN_URL_INTRO,
    OPEN_URL_LABEL,
    OPEN_URL_SUBMIT_TEXT,
    OPEN_URL_TITLE,
    OPEN_URL_UNSUPPORTED_MESSAGE,
} from "./config.js";
import { DatabasePath } from "../db-path.js";

function el(tag, props = {}, text = "") {
    const node = document.createElement(tag);
    Object.assign(node, props);
    if (text) {
        node.textContent = text;
    }
    return node;
}

export function mountOpenUrlDialog({ onOpen }) {
    const dialog = el("dialog", { id: "open-url-dialog", className: "app-dialog" });
    dialog.setAttribute("aria-labelledby", "open-url-title");
    const form = el("form", { method: "dialog", noValidate: true });
    const input = el("input", {
        id: "open-url-input",
        type: "text",
        inputMode: "url",
        autocomplete: "off",
        spellcheck: false,
        className: "app-dialog-input",
    });
    input.setAttribute("autocapitalize", "off");
    input.setAttribute("autocorrect", "off");
    input.setAttribute("aria-describedby", "open-url-hint");
    const error = el("p", { id: "open-url-error", className: "app-dialog-error", hidden: true });
    error.setAttribute("role", "alert");
    const submit = el("button", { type: "submit", className: "button button--primary" }, OPEN_URL_SUBMIT_TEXT);
    const cancel = el("button", { type: "button", className: "button" }, OPEN_URL_CANCEL_TEXT);
    const actions = el("div", { className: "app-dialog-actions" });
    actions.append(submit, cancel);
    form.append(
        el("h2", { id: "open-url-title", className: "app-dialog-title" }, OPEN_URL_TITLE),
        el("p", { className: "app-dialog-text" }, OPEN_URL_INTRO),
        el("label", { htmlFor: "open-url-input", className: "app-dialog-label" }, OPEN_URL_LABEL),
        input,
        el("p", { id: "open-url-hint", className: "app-dialog-hint" }, OPEN_URL_HINT),
        error,
        actions
    );
    dialog.append(form);
    document.body.append(dialog);

    let returnFocus = null;

    function showError(message) {
        error.textContent = message;
        error.hidden = false;
        input.setAttribute("aria-invalid", "true");
        input.setAttribute("aria-describedby", "open-url-error open-url-hint");
    }

    function clearError() {
        error.textContent = "";
        error.hidden = true;
        input.removeAttribute("aria-invalid");
        input.setAttribute("aria-describedby", "open-url-hint");
    }

    function open(focusAfter = document.activeElement) {
        // asked again while it is open (Ctrl+U in the field): the address being typed stays
        if (dialog.open) {
            input.focus();
            return;
        }
        returnFocus = focusAfter instanceof HTMLElement && focusAfter !== document.body ? focusAfter : null;
        clearError();
        input.value = "";
        if (!dialog.open) {
            dialog.showModal();
        }
        input.focus();
    }

    function close({ restoreFocus }) {
        if (dialog.open) {
            dialog.close();
        }
        if (restoreFocus && returnFocus?.isConnected) {
            returnFocus.focus();
        }
    }

    form.addEventListener("submit", (event) => {
        event.preventDefault();
        const address = input.value.trim();
        if (!address) {
            showError(OPEN_URL_EMPTY_MESSAGE);
            input.focus();
            return;
        }
        if (new DatabasePath(address).type === "unsupported") {
            showError(OPEN_URL_UNSUPPORTED_MESSAGE);
            input.focus();
            return;
        }
        // the load moves the focus to the editor once the database is open
        close({ restoreFocus: false });
        onOpen(address);
    });
    cancel.addEventListener("click", () => close({ restoreFocus: true }));
    input.addEventListener("input", () => {
        if (!error.hidden) {
            clearError();
        }
    });
    // Escape: the browser closes it; the focus goes back as for Cancel
    dialog.addEventListener("close", () => {
        input.value = "";
        clearError();
        const focused = document.activeElement;
        if ((!focused || focused === document.body || dialog.contains(focused)) && returnFocus?.isConnected) {
            returnFocus.focus();
        }
    });

    return { open };
}
