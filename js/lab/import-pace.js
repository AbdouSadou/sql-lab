// Letting the page breathe during a long job: an import of files, an export of tables
// (assessment plan, section 7: "Imports stay responsive without a worker"). The database runs on
// the page's own thread, so a long job is done a piece at a time, and between two pieces the page
// gets a turn: it can take a press on Cancel, and every so often it draws, so that the progress
// bar moves.
//
//   newPace() -> {rest()}
//       rest() -> Promise, resolved after the page has had its turn. Most turns cost nothing to
//       speak of. When PAINT_EVERY_MS have passed since the last one, the turn lasts until the
//       browser has drawn a frame (or FRAME_MAX_MS in a tab that draws none: a hidden one).
//   nextFrame() -> Promise
//       Resolved when the browser has drawn a frame, or after FRAME_MAX_MS in a tab that draws
//       none. The export's dialog waits for one before its first count, and the export before
//       its first piece, so that what was just shown is on screen first.
//
// A piece of work between two rests should stay well under a tenth of a second: the import
// reader's slices (IMPORT_SLICE_BYTES), the steps of its copy (js/lab/import-db.js) and the
// export's pieces (EXPORT_PIECE_CHARS, EXPORT_PIECE_MS) are sized for that.

import { FRAME_MAX_MS, PAINT_EVERY_MS } from "./config-workflow.js";

// a turn for whatever the page has waiting (a click, a key), without waiting for a frame
let channel = null;
const waiting = [];
function turn() {
    if (typeof globalThis.scheduler?.yield === "function") {
        return globalThis.scheduler.yield();
    }
    // (a timer would do, but browsers hold a run of timers back to 4 ms each)
    if (!channel) {
        channel = new MessageChannel();
        channel.port1.onmessage = () => waiting.shift()?.();
    }
    return new Promise((resolve) => {
        waiting.push(resolve);
        channel.port2.postMessage(null);
    });
}

// until the browser has drawn a frame
export function nextFrame() {
    return new Promise((resolve) => {
        let done = false;
        const go = () => {
            if (!done) {
                done = true;
                resolve();
            }
        };
        requestAnimationFrame(() => setTimeout(go, 0));
        setTimeout(go, FRAME_MAX_MS);
    });
}

export function newPace() {
    let drawn = performance.now();
    return {
        async rest() {
            if (performance.now() - drawn >= PAINT_EVERY_MS) {
                await nextFrame();
                drawn = performance.now();
            } else {
                await turn();
            }
        },
    };
}
