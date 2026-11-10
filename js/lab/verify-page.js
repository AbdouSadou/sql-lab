// verify.html: the marker's page for evidence files (F11). Everything happens in the browser:
// after the page has loaded it makes no request, and it uses no storage.
//
// A file is checked when it is pasted into the box, dropped anywhere on the page, or chosen
// with the file input, and the Verify button checks what is in the box (typed text, or text
// that is still exactly what was pasted). The result goes to #verify-result (role="status"),
// built with textContent only: VALID with the student number, query count, export time and
// dataset, EDITED with the reason, or (no crypto.subtle: an http address that is not
// localhost) a message that says neither. The page scrolls just far enough to bring the
// verdict into view.
//
// A textarea turns every lone CR into LF in its value, which would hide a one-character edit
// (an LF changed to CR). So the paste handler reads the raw clipboard text, verifies that, and
// remembers it together with the textarea value it produced; Verify uses the raw text until
// the student types or deletes anything in the box (an input event), and the value from then on.
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
        box.append(
            el("p", "verdict-word", VERIFY_VALID_WORD),
            details([
                ["Student number", result.student],
                ["Queries", result.queries],
                ["Exported", result.exported],
                ["Dataset", result.dataset],
            ]),
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

// Only the latest check may show its result: a big file can finish after a later paste.
let latest = 0;

async function check(text) {
    const ticket = ++latest;
    const result = await verifyEvidence(text);
    if (ticket === latest) {
        render(result);
    }
}

async function checkFile(file) {
    if (file.size > EVIDENCE_MAX_BYTES) {
        ++latest;
        render({ status: "edited", reason: VERIFY_TOO_LARGE_REASON });
        return;
    }
    let text;
    try {
        text = await file.text();
    } catch {
        ++latest;
        render({ status: "edited", reason: VERIFY_READ_FAILED_REASON });
        return;
    }
    await check(text);
}

// ---- the box --------------------------------------------------------------------------

// What the textarea holds, as the clipboard gave it: {raw, value} where value is what the
// textarea showed right after the paste.
let pasted = null;

const rawText = () => (pasted && textarea.value === pasted.value ? pasted.raw : textarea.value);

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
    const base = rawText();
    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const raw = base.slice(0, rawIndex(base, start)) + incoming + base.slice(rawIndex(base, end));
    textarea.setRangeText(incoming, start, end, "end");
    pasted = { raw, value: textarea.value };
    check(raw);
});

// typed or deleted text makes an old result stale
textarea.addEventListener("input", () => {
    pasted = null;
    latest++;
    region.replaceChildren();
});

verifyButton.addEventListener("click", () => {
    check(rawText());
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
            check(text);
        }
    }
});

if (!hasCrypto()) {
    render({ status: "unavailable", reason: VERIFY_NO_CRYPTO_MESSAGE });
}
