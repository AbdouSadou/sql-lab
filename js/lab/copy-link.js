// Copy link (the top bar): builds the share link for the editor's SQL and puts it on the
// clipboard; a "Link copied" toast says so (UI plan, section 5). When the browser keeps the
// clipboard to itself (a refused permission, an address that is not secure, an old browser), a
// small popover under the button holds the link in a read-only field, selected, so copying it
// costs one Ctrl+C.
//
//   createCopyLinkAction({editor, button, popover}) -> copyLink()
//       The handler of data-action="copyLink" (ActionController). It returns a resolved Promise
//       at once, so the button is not held disabled while the browser decides about the
//       clipboard (it can sit on a permission prompt).
//
// A database that is not one of the course databases (an upload, a URL) cannot travel in a link,
// so the toast says that whoever opens it gets the default database. A query too long for a link
// is refused with a toast that says so.

import {
    LINK_COPIED_MESSAGE,
    LINK_COPY_FAILED_MESSAGE,
    LINK_COPY_FAILED_TITLE,
    LINK_FIELD_LABEL,
    LINK_TOO_LONG_MESSAGE,
    NOT_IN_LINK_MESSAGE,
} from "./config.js";
import { placePopover } from "./menu.js";
import { getShareContext, shareUrl } from "./share.js";
import { toast } from "./toast.js";

export function createCopyLinkAction({ editor, button, popover }) {
    const fallback = popover ? mountFallback(popover, button) : null;

    return function copyLink() {
        const url = shareUrl(editor.value);
        if (url === null) {
            toast(LINK_TOO_LONG_MESSAGE, { tone: "note" });
            return Promise.resolve();
        }
        // An uploaded file or a URL is not in the link (only a course database's id is), so the
        // recipient would otherwise expect to see the same tables.
        const builtIn = Boolean(getShareContext().dataset);
        const confirmation = builtIn ? LINK_COPIED_MESSAGE : `${LINK_COPIED_MESSAGE}. ${NOT_IN_LINK_MESSAGE}`;

        // Start the copy while the click's user activation is still fresh.
        const copied = navigator.clipboard?.writeText ? writeClipboard(url) : Promise.resolve(copyText(url));
        copied.then((ok) => {
            if (ok) {
                fallback?.close();
                toast(confirmation);
            } else if (fallback) {
                fallback.show(url, builtIn ? "" : NOT_IN_LINK_MESSAGE);
            }
        });
        return Promise.resolve();
    };
}

// copyText copies text with the old way (no async clipboard API): a selected, off-screen field.
// The focus goes back where it was.
function copyText(text) {
    const before = document.activeElement;
    const field = document.createElement("textarea");
    field.value = text;
    field.readOnly = true;
    field.className = "visually-hidden";
    field.setAttribute("aria-hidden", "true");
    field.tabIndex = -1;
    document.body.append(field);
    field.select();
    let ok = false;
    try {
        ok = document.execCommand("copy");
    } catch {
        ok = false;
    }
    field.remove();
    if (before instanceof HTMLElement) {
        before.focus({ preventScroll: true });
        // Copy link itself is disabled while its action runs (js/controllers/actions.js), so it
        // takes no focus now: give it back once the action has answered and the button is enabled
        // again, unless the focus has gone somewhere of the student's choosing meanwhile
        if (document.activeElement !== before) {
            setTimeout(() => {
                if (!document.activeElement || document.activeElement === document.body) {
                    before.focus({ preventScroll: true });
                }
            }, 0);
        }
    }
    return ok;
}

// writeClipboard resolves true if the text reached the clipboard, false if it was refused or is
// unsupported; then the old way is tried. It never rejects.
async function writeClipboard(text) {
    try {
        await navigator.clipboard.writeText(text);
        return true;
    } catch {
        return copyText(text);
    }
}

// The popover that holds the link when it could not be copied: a non-modal dialog under the
// button (Escape, a press outside, or the focus moving on close it; the focus then goes back to
// the button).
function mountFallback(popover, button) {
    if (typeof popover.showPopover !== "function") {
        return null;
    }
    const title = document.createElement("h2");
    title.className = "share-popover-title";
    title.id = "copy-link-title";
    title.textContent = LINK_COPY_FAILED_TITLE;
    const text = document.createElement("p");
    text.className = "share-popover-text";
    text.textContent = LINK_COPY_FAILED_MESSAGE;
    const label = document.createElement("label");
    label.className = "share-popover-label";
    label.htmlFor = "share-link-field";
    label.textContent = LINK_FIELD_LABEL;
    const field = document.createElement("input");
    field.type = "text";
    field.id = "share-link-field";
    field.className = "share-link-field";
    field.readOnly = true;
    field.spellcheck = false;
    const warning = document.createElement("p");
    warning.className = "share-popover-text share-link-warning";
    warning.hidden = true;
    popover.setAttribute("role", "dialog");
    popover.setAttribute("aria-labelledby", title.id);
    popover.replaceChildren(title, text, label, field, warning);

    popover.addEventListener("toggle", (event) => {
        if (event.newState === "open" && popover.matches(":popover-open")) {
            placePopover(popover, button);
            field.focus({ preventScroll: true });
            field.select();
            return;
        }
        const focused = document.activeElement;
        if (!focused || focused === document.body || popover.contains(focused)) {
            button.focus({ preventScroll: true });
        }
    });
    popover.addEventListener("focusout", (event) => {
        if (popover.matches(":popover-open") && event.relatedTarget && !popover.contains(event.relatedTarget) && event.relatedTarget !== button) {
            popover.hidePopover();
        }
    });

    return {
        show(url, note) {
            field.value = url;
            warning.textContent = note;
            warning.hidden = !note;
            if (popover.matches(":popover-open")) {
                field.focus({ preventScroll: true });
                field.select();
            } else {
                placePopover(popover, button);
                popover.showPopover();
            }
        },
        close() {
            if (popover.matches(":popover-open")) {
                popover.hidePopover();
            }
        },
    };
}
