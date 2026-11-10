// F11 evidence export, the page side: the "evidence" button in the toolbar, the dialog that
// asks for the student number, and the download. The file format and checksum are
// js/lab/evidence.js; the entries come from the run log (js/lab/run-log.js).
//
//   mountEvidence({toolbar, ui, runLog}) -> {open()}
//       Called once from js/index.js. Adds <button id="export-evidence"> after #export-db and
//       builds a real <dialog> (opened with showModal) with a labelled input for the student
//       number. runLog.current() gives the log key and the entries of the open dataset.
//
// The student number is validated against STUDENT_ID_PATTERN (config.js) exactly as typed (no
// trimming: a space is a mistake worth telling the student about). A bad number shows an
// inline message tied to the input with aria-describedby and the dialog stays open. The number
// goes into the downloaded file and nowhere else: not storage, not an address, not the file
// name, not the page title, not the console. The input has autocomplete="off" and no name, and
// is emptied whenever the dialog closes. Escape and Cancel close it without saving; after a
// successful export the dialog closes and the focus returns to the button.
//
// An entry gets a "link:" line only when it succeeded on a built-in dataset: the F3 link for
// that query and dataset alone, on the page address without its query string. An error entry,
// an entry on an uploaded or URL database (a link could not reopen it) and an entry whose link
// would be too long or would not open have none.

import {
    EVIDENCE_BUTTON_TEXT,
    EVIDENCE_BUTTON_TITLE,
    EVIDENCE_CANCEL_TEXT,
    EVIDENCE_DIALOG_TEXT,
    EVIDENCE_DIALOG_TITLE,
    EVIDENCE_EMPTY_MESSAGE,
    EVIDENCE_FAILED_MESSAGE,
    EVIDENCE_HINT,
    EVIDENCE_INVALID_MESSAGE,
    EVIDENCE_LABEL,
    EVIDENCE_NO_CRYPTO_MESSAGE,
    EVIDENCE_SUBMIT_TEXT,
    STUDENT_ID_PATTERN,
    evidenceSavedMessage,
} from "./config.js";
import { buildEvidence, hasCrypto, utcTimestamp } from "./evidence.js";
import { safeBaseName, saveFile } from "./export.js";
import { escapeHtml } from "./html.js";
import { isDatasetKey } from "./run-log.js";
import { decodeShare, shareFragment } from "./share.js";

// linkFor is the F3 link for one entry, or null when it should have none.
export function linkFor(key, entry, pageUrl = globalThis.location.href) {
    if (entry.error !== undefined || !isDatasetKey(key)) {
        return null;
    }
    try {
        const fragment = shareFragment({ dataset: key, sql: entry.sql });
        // too long, or a link that decodeShare would refuse: it would not open
        if (fragment === null || !decodeShare(fragment).ok) {
            return null;
        }
        const url = new URL(pageUrl);
        url.search = "";
        url.hash = fragment;
        return url.href;
    } catch {
        return null;
    }
}

function el(tag, props = {}, text = "") {
    const node = document.createElement(tag);
    Object.assign(node, props);
    if (text) {
        node.textContent = text;
    }
    return node;
}

export function mountEvidence({ toolbar, ui, runLog }) {
    const button = el("button", { type: "button", id: "export-evidence", className: "button button--small", title: EVIDENCE_BUTTON_TITLE }, EVIDENCE_BUTTON_TEXT);
    const anchor = toolbar.querySelector("#export-db");
    if (anchor) {
        anchor.after(button);
    } else {
        toolbar.append(button);
    }

    const dialog = el("dialog", { id: "evidence-dialog", className: "evidence-dialog" });
    dialog.setAttribute("aria-labelledby", "evidence-title");
    const form = el("form", { id: "evidence-form", noValidate: true });
    const label = el("label", { htmlFor: "evidence-student", className: "evidence-label" }, EVIDENCE_LABEL);
    const input = el("input", { id: "evidence-student", type: "text", autocomplete: "off", spellcheck: false });
    input.setAttribute("autocapitalize", "off");
    input.setAttribute("autocorrect", "off");
    input.setAttribute("aria-describedby", "evidence-hint");
    const hint = el("p", { id: "evidence-hint", className: "evidence-hint" }, EVIDENCE_HINT);
    const error = el("p", { id: "evidence-error", className: "evidence-error", hidden: true });
    error.setAttribute("role", "alert");
    const submit = el("button", { type: "submit", className: "evidence-submit" }, EVIDENCE_SUBMIT_TEXT);
    const cancel = el("button", { type: "button", className: "evidence-cancel" }, EVIDENCE_CANCEL_TEXT);
    form.append(
        el("h2", { id: "evidence-title", className: "evidence-title" }, EVIDENCE_DIALOG_TITLE),
        el("p", { className: "evidence-text" }, EVIDENCE_DIALOG_TEXT),
        label,
        input,
        hint,
        error,
        el("div", { className: "evidence-actions" }),
    );
    form.lastElementChild.append(submit, cancel);
    dialog.append(form);
    document.body.append(dialog);

    function showError(message) {
        error.textContent = message;
        error.hidden = false;
        input.setAttribute("aria-invalid", "true");
        input.setAttribute("aria-describedby", "evidence-error");
    }

    function clearError() {
        error.textContent = "";
        error.hidden = true;
        input.removeAttribute("aria-invalid");
        input.setAttribute("aria-describedby", "evidence-hint");
    }

    function open() {
        const { entries } = runLog.current();
        if (!entries.length) {
            ui.status.info(escapeHtml(EVIDENCE_EMPTY_MESSAGE));
            return;
        }
        if (!hasCrypto()) {
            ui.status.error(escapeHtml(EVIDENCE_NO_CRYPTO_MESSAGE));
            return;
        }
        clearError();
        input.value = "";
        if (!dialog.open) {
            dialog.showModal();
        }
        input.focus();
    }

    // closeDialog ends every way out: the number is gone and the focus is back on the button
    // before the dialog's own close event, which comes a moment later
    function closeDialog() {
        input.value = "";
        clearError();
        exportToken++;
        if (dialog.open) {
            dialog.close();
        }
        button.focus();
    }

    // An export is the one that holds the current token. Every way of closing the dialog changes
    // it, so an export that is still making its checksum finds out it was cancelled even when
    // the dialog has been opened again meanwhile (dialog.open alone cannot tell).
    let exportToken = 0;
    // the token of the export that is making its checksum, or null; a cancelled export (its token
    // is no longer the current one) does not count, so a new submit is not ignored because of it
    let busyToken = null;

    async function exportNow() {
        if (busyToken === exportToken) {
            return;
        }
        // the number, as typed, lives in this constant only until the file is built
        const student = input.value;
        if (!STUDENT_ID_PATTERN.test(student)) {
            showError(EVIDENCE_INVALID_MESSAGE);
            input.focus();
            return;
        }
        clearError();
        const token = exportToken;
        busyToken = token;
        try {
            // read again: another tab may have added entries since the dialog opened
            const { key, entries } = runLog.current();
            if (!entries.length) {
                closeDialog();
                ui.status.info(escapeHtml(EVIDENCE_EMPTY_MESSAGE));
                return;
            }
            const text = await buildEvidence({
                entries: entries.map((entry) => ({ ...entry, link: linkFor(key, entry) })),
                dataset: key,
                exported: utcTimestamp(),
                student,
            });
            if (token !== exportToken || !dialog.open) {
                // cancelled while the checksum was being made (and perhaps opened again since)
                return;
            }
            const filename = `evidence-${safeBaseName(key)}.txt`;
            saveFile(text, filename, "text/plain;charset=utf-8");
            closeDialog();
            ui.status.success(escapeHtml(evidenceSavedMessage(filename, entries.length)));
        } catch {
            if (token !== exportToken) {
                // cancelled before it failed (and perhaps opened again since): the dialog on the
                // screen belongs to the student now, and nobody is waiting for this export
                return;
            }
            // no detail on purpose: nothing about the file or the student number may be logged
            closeDialog();
            ui.status.error(escapeHtml(EVIDENCE_FAILED_MESSAGE));
        } finally {
            if (busyToken === token) {
                busyToken = null;
            }
        }
    }

    button.addEventListener("click", open);
    form.addEventListener("submit", (event) => {
        event.preventDefault();
        exportNow();
    });
    cancel.addEventListener("click", closeDialog);
    // Escape: the number goes the moment the dialog is asked to close
    dialog.addEventListener("cancel", () => {
        input.value = "";
        exportToken++;
    });
    input.addEventListener("input", () => {
        if (!error.hidden) {
            clearError();
        }
    });
    // Whatever closed the dialog. This event comes a moment after the closing, when the focus may
    // have moved on already: it is brought back only from nowhere or from the closed dialog.
    dialog.addEventListener("close", () => {
        input.value = "";
        clearError();
        if (!dialog.open) {
            // (this event is late: when the dialog was opened again already, it is not the end of
            // the export that was started after that)
            exportToken++;
        }
        const focused = document.activeElement;
        if (!focused || focused === document.body || dialog.contains(focused)) {
            button.focus();
        }
    });

    return { open };
}
