// Letting the page breathe during an import (assessment plan, section 7: "Imports stay
// responsive without a worker"). The database runs on the page's own thread, so a long job is
// done a piece at a time, and between two pieces the page gets a turn: it can take a press on
// Cancel, and every so often it draws, so that the progress bar moves.
//
//   newPace() -> {rest()}
//       rest() -> Promise, resolved after the page has had its turn. Most turns cost nothing to
//       speak of. When PAINT_EVERY_MS have passed since the last one, the turn lasts until the
//       browser has drawn a frame (or FRAME_MAX_MS in a tab that draws none: a hidden one).
//
// A piece of work between two rests should stay well under a tenth of a second: the reader's
// slices (IMPORT_SLICE_BYTES) and the copy's steps (js/lab/import-db.js) are sized for that.

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
function frame() {
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
                await frame();
                drawn = performance.now();
            } else {
                await turn();
            }
        },
    };
}
