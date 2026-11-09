// The "copy link" command: builds the share link for the editor SQL, tries to put it on
// the clipboard, and always shows it in a read-only field in the status area with its
// text selected, so a refused clipboard (or a browser without one) costs one Ctrl+C.

import {
    LINK_COPIED_MESSAGE,
    LINK_COPY_FAILED_MESSAGE,
    LINK_TOO_LONG_MESSAGE,
} from "./config.js";
import { escapeHtml } from "./html.js";
import { shareUrl } from "./share.js";

// createCopyLinkAction returns the handler for data-action="copyLink". It returns a
// Promise, as ActionController requires. `ui` is the index.js handle object.
export function createCopyLinkAction(ui) {
    return function copyLink() {
        const url = shareUrl(ui.editor.value);
        if (url === null) {
            ui.status.error(escapeHtml(LINK_TOO_LONG_MESSAGE));
            return Promise.resolve();
        }

        // Start the copy while the click's user activation is still fresh.
        const copied = navigator.clipboard ? writeClipboard(url) : null;

        ui.status.info(
            `<label class="share-link"><span class="share-link-label">Link to this query</span>` +
                `<input type="text" class="share-link-field" readonly spellcheck="false"` +
                ` value="${escapeHtml(url)}"></label>` +
                `<span class="share-link-note" role="status"></span>`
        );
        const field = ui.status.querySelector("input.share-link-field");
        const note = ui.status.querySelector(".share-link-note");
        field.focus();
        field.select();

        // No async clipboard API (insecure page, old browser): copy the selected field.
        const done = copied ?? Promise.resolve(copySelection());
        done.then((ok) => {
            // the status may have moved on (a Run) while the clipboard was being asked
            if (field.isConnected) {
                note.textContent = ok ? LINK_COPIED_MESSAGE : LINK_COPY_FAILED_MESSAGE;
            }
        });
        // Do not hold the button disabled while the browser decides about the clipboard
        // (it can sit on a permission prompt); the field is already usable.
        return Promise.resolve();
    };
}

function copySelection() {
    try {
        return document.execCommand("copy");
    } catch {
        return false;
    }
}

// writeClipboard resolves true if the text reached the clipboard, false if it was
// refused or is unsupported. It never rejects.
async function writeClipboard(text) {
    try {
        await navigator.clipboard.writeText(text);
        return true;
    } catch {
        return false;
    }
}
