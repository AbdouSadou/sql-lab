// One line of notice while the browser cannot keep the run log, the events of the evidence log
// or the exercise progress (storage full or blocked). The modules that write them to
// localStorage (run-log.js, events.js, progress.js) report each write; this module shows what
// is wrong, so a student is not left believing work is saved when it is not.
//
//   reportStorage(what, ok)
//       what is "log", "events" or "progress". Dispatches the document event STORAGE_STATE_EVENT
//       ({what, ok}). Does nothing where there is no document (the modules are also run
//       in Node by the tests). ok is true when the write kept everything and no other
//       log or set of the same subject is still only in memory.
//   mountStorageNotice({ui})
//       Called once from js/index.js. Puts <p id="storage-notice" role="status"> after the
//       status line and keeps it in step with the events: it shows the sentence for every
//       subject that is failing, and hides again when each has been saved properly once
//       more. Text is set with textContent. The sentence about events names what this visit
//       can note down (the preview flags, js/lab/flags.js): files brought in, tables exported.

import { STORAGE_NOTICE_LOG, STORAGE_NOTICE_PROGRESS, STORAGE_STATE_EVENT } from "./config.js";
import { storageNoticeEventsText } from "./config-workflow.js";
import { flagOn } from "./flags.js";

export function reportStorage(what, ok) {
    try {
        if (typeof document !== "undefined" && typeof CustomEvent === "function") {
            document.dispatchEvent(new CustomEvent(STORAGE_STATE_EVENT, { detail: { what, ok } }));
        }
    } catch {
        // a notice must never stop a save
    }
}

export function mountStorageNotice({ ui, before }) {
    const note = document.createElement("p");
    note.id = "storage-notice";
    note.className = "storage-notice";
    note.setAttribute("role", "status");
    note.hidden = true;
    before.before(note);

    const TEXTS = {
        log: STORAGE_NOTICE_LOG,
        events: storageNoticeEventsText({ imports: flagOn("import"), exports: flagOn("export") }),
        progress: STORAGE_NOTICE_PROGRESS,
    };
    const failing = new Set();
    document.addEventListener(STORAGE_STATE_EVENT, (event) => {
        const { what, ok } = event.detail ?? {};
        if (!Object.hasOwn(TEXTS, what)) {
            return;
        }
        if (ok) {
            failing.delete(what);
        } else {
            failing.add(what);
        }
        note.textContent = Object.keys(TEXTS)
            .filter((name) => failing.has(name))
            .map((name) => TEXTS[name])
            .join(" ");
        note.hidden = failing.size === 0;
    });
}
