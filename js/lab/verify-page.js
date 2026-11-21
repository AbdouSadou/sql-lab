// verify.html: the marker's page for evidence files (F11). Everything happens in the browser:
// after the page has loaded it makes no request, and it uses no storage.
//
// A file is checked when it is pasted into the box, dropped anywhere on the page, or chosen
// with the file input. The Verify button checks again what was given last: the box (typed text,
// or text that is still exactly what was pasted), or the file that was chosen or dropped after
// the box was last changed. Such a file is not put in the box, and a press on Verify must not
// turn its verdict into that of the box ("The file is empty." for a valid file, when the box is
// empty). A paste into the box, or a change typed there, makes the box what Verify checks.
// The result goes to #verify-result (role="status"), built with textContent only: VALID with the
// student number, query count, export time and dataset (and the event count, for a version 2
// file, which lists files imported and tables exported among the queries), EDITED with the
// reason, or a message that says neither (no crypto.subtle: an http address that is not
// localhost; or a box that can no longer be checked, below). The page scrolls just far enough
// to bring the verdict into view.
//
// A textarea turns every lone CR into LF in its value, which would hide a one-character edit
// (an LF changed to CR). So the paste handler reads the raw clipboard text, verifies that, and
// remembers it together with the textarea value it produced; Verify uses the raw text for as
// long as the box shows exactly what the paste put there. Once the box shows anything else, the
// page knows the box's value only. That is the whole truth unless the pasted text had a lone CR:
// then the CR may still be in the box, shown as an LF, or may have been taken out, and the page
// cannot tell. It gives no verdict then (a text with a hidden CR must never read VALID): it says
// that the box can no longer be checked, until the box is emptied or a paste replaces all of it.
// The pasted text is put in the box by the handler (setRangeText), not by the browser.

import {
    EVIDENCE_MAX_BYTES,
    VERIFY_EDITED_WORD,
    VERIFY_NO_CRYPTO_MESSAGE,
    VERIFY_READ_FAILED_REASON,
    VERIFY_TOO_LARGE_REASON,
    VERIFY_VALID_WORD,
} from "./config.js";
import { hasCrypto, verifyEvidence } from "./evidence.js";

const textarea = document.querySelector("#evidence-text");
const fileInput = document.querySelector("#evidence-file");
const verifyButton = document.querySelector("#verify-button");
const zone = document.querySelector("#drop-zone");
const region = document.querySelector("#verify-result");

function el(tag, className, text) {
    const node = document.createElement(tag);
    if (className) {
        node.className = className;
    }
    if (text !== undefined) {
        node.textContent = text;
    }
    return node;
}

function details(rows) {
    const list = el("dl", "verdict-details");
    for (const [name, value] of rows) {
        list.append(el("dt", "", name), el("dd", "", String(value)));
    }
    return list;
}

function render(result) {
    const box = el("div", `verdict verdict--${result.status}`);
    if (result.status === "valid") {
        const rows = [
            ["Student number", result.student],
            ["Queries", result.queries],
        ];
        // a version 2 file: the events it lists, counted apart from the queries
        if (result.events !== undefined) {
            rows.push(["Events", result.events]);
        }
        rows.push(["Exported", result.exported], ["Dataset", result.dataset]);
        box.append(
            el("p", "verdict-word", VERIFY_VALID_WORD),
            details(rows),
            el("p", "verdict-note", "The checksum matches, so the file is as it was exported. It does not prove who ran the queries.")
        );
    } else if (result.status === "edited") {
        box.append(el("p", "verdict-word", VERIFY_EDITED_WORD), el("p", "verdict-reason", result.reason));
    } else {
        box.append(el("p", "verdict-message", result.reason));
    }
    region.replaceChildren(box);
    // the verdict sits below the box and can be off screen (a short window, a phone)
    region.scrollIntoView?.({ block: "nearest" });
}

// Only the latest check may show its result: the checksum of a big text can be ready after that
// of a later, smaller one. (The reading of a chosen file is not part of this. It takes
// milliseconds; a file whose reading ends after a later paste shows its verdict last, and is
// then what Verify checks.)
let latest = 0;

async function check(text) {
    const ticket = ++latest;
    const result = await verifyEvidence(text);
    if (ticket === latest) {
        render(result);
    }
}

// What Verify checks when it is not the box: what was given last without going through the box
// (a file chosen, dropped or pasted as a file, or text dropped on the page), as {text}, or as
// {refusal} for a file that was not read (too large, or unreadable). null when the box is what
// Verify checks: at first, and after a paste into the box or a change typed there.
let given = null;

function refuse(reason) {
    ++latest;
    given = { refusal: reason };
    render({ status: "edited", reason });
}

function checkGiven(text) {
    given = { text };
    return check(text);
}

async function checkFile(file) {
    if (file.size > EVIDENCE_MAX_BYTES) {
        refuse(VERIFY_TOO_LARGE_REASON);
        return;
    }
    let text;
    try {
        text = await file.text();
    } catch {
        refuse(VERIFY_READ_FAILED_REASON);
        return;
    }
    await checkGiven(text);
}

// ---- the box --------------------------------------------------------------------------

// What the page knows of the box beyond its value: raw is the text as the clipboard gave it, and
// value what the textarea showed for it, when that was last known (after a paste; "" for the
// empty box). lossy says that raw itself was built on a box whose text was no longer known
// exactly (see boxText).
let shadow = { raw: textarea.value, value: textarea.value, lossy: false };
// the box's value after the last paste or change: an input event that leaves the box as it was
// is no change (Chromium fires one for an undo that finds nothing to undo)
let boxValue = textarea.value;

// a CR that is not the first half of a CRLF: a textarea shows it as an LF
const LONE_CR = /\r(?!\n)/;

// What a marker reads when the box cannot be checked. (Here and not in js/lab/config.js with the
// other texts: a browser can hold an older copy of that file for some minutes after a release,
// and a name that the older copy does not export would keep this page from loading.)
const HIDDEN_BREAK_MESSAGE =
    "The pasted text had a line break of a kind that this box cannot keep, and the text has been changed since. It can no longer be checked here. Empty the box and paste the file again, or choose the file instead.";

// What the box holds, for a check: {text}, or {unknown: true}. While the box shows what the last
// paste put there, the text is the raw text of that paste. Once it shows anything else, the text
// is the box's value, unless a lone CR may be hidden in it: the last paste had one (the box has
// changed since, and the CR may or may not have gone), or that paste was itself made into a box
// in that state.
function boxText() {
    if (textarea.value === shadow.value) {
        return shadow.lossy ? { unknown: true } : { text: shadow.raw };
    }
    return shadow.lossy || LONE_CR.test(shadow.raw) ? { unknown: true } : { text: textarea.value };
}

function checkBox() {
    const box = boxText();
    if (box.unknown) {
        ++latest;
        render({ status: "unavailable", reason: HIDDEN_BREAK_MESSAGE });
    } else {
        check(box.text);
    }
}

// the index in `raw` that corresponds to index `at` of the textarea value (CRLF counts as one
// character there, and so does a lone CR)
function rawIndex(raw, at) {
    let i = 0;
    for (let n = 0; n < at && i < raw.length; n++) {
        i += raw[i] === "\r" && raw[i + 1] === "\n" ? 2 : 1;
    }
    return i;
}

textarea.addEventListener("paste", (event) => {
    const data = event.clipboardData;
    const incoming = data ? data.getData("text/plain") : "";
    if (!incoming) {
        const file = data?.files?.[0];
        if (file) {
            event.preventDefault();
            checkFile(file);
        }
        // otherwise the browser pastes what it has, and Verify reads the value
        return;
    }
    event.preventDefault();
    const box = boxText();
    const base = box.unknown ? textarea.value : box.text;
    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    // a paste over all of the box leaves nothing of what was there, a hidden CR included
    const lossy = Boolean(box.unknown) && !(start === 0 && end === textarea.value.length);
    const raw = base.slice(0, rawIndex(base, start)) + incoming + base.slice(rawIndex(base, end));
    textarea.setRangeText(incoming, start, end, "end");
    shadow = { raw, value: textarea.value, lossy };
    boxValue = textarea.value;
    // the box is what Verify checks from now on
    given = null;
    checkBox();
});

// typed or deleted text makes an old result stale, and the box what Verify checks
textarea.addEventListener("input", () => {
    if (textarea.value === boxValue) {
        return;
    }
    boxValue = textarea.value;
    if (boxValue === "") {
        // nothing is left of what was pasted
        shadow = { raw: "", value: "", lossy: false };
    }
    given = null;
    latest++;
    region.replaceChildren();
});

verifyButton.addEventListener("click", () => {
    if (!given) {
        checkBox();
    } else if ("refusal" in given) {
        refuse(given.refusal);
    } else {
        check(given.text);
    }
});

fileInput.addEventListener("change", () => {
    const file = fileInput.files?.[0];
    // forget the choice, so choosing the same file again fires a new change event
    if (file) {
        checkFile(file).finally(() => {
            fileInput.value = "";
        });
    }
});

// ---- drop anywhere --------------------------------------------------------------------

document.addEventListener("dragover", (event) => {
    event.preventDefault();
    zone.classList.add("drop-zone--active");
});
document.addEventListener("dragleave", (event) => {
    if (event.relatedTarget === null) {
        zone.classList.remove("drop-zone--active");
    }
});
document.addEventListener("drop", (event) => {
    // always: a file dropped outside the box must not make the browser open it
    event.preventDefault();
    zone.classList.remove("drop-zone--active");
    const data = event.dataTransfer;
    const file = data?.files?.[0];
    if (file) {
        checkFile(file);
    } else if (data) {
        const text = data.getData("text/plain");
        if (text) {
            checkGiven(text);
        }
    }
});

if (!hasCrypto()) {
    render({ status: "unavailable", reason: VERIFY_NO_CRYPTO_MESSAGE });
}
