// Tells the student when a result is wider than its box. A result scrolls inside its own box
// (css/result.css, css/shell.css); a column cut off mid-word looks like missing data, so a note
// under the result says that there is more to the side. The note is static text in index.html,
// filled and shown here; it is hidden whenever the result fits sideways.
//
//   mountResultScroll({result, note})
//
// The check runs when the result's content changes (a new table, a cleared result) and when
// its box changes size (the window, the schema sidebar opening or closing).
//
// The box is a named region, and while it scrolls (sideways, or down a long result) it is also a
// Tab stop: arrow keys scroll it, so the keyboard reaches what a mouse would scroll to (WCAG
// 2.1.1).

import { RESULT_REGION_LABEL, RESULT_SCROLL_NOTE } from "./config.js";

export function mountResultScroll({ result, note }) {
    note.textContent = RESULT_SCROLL_NOTE;
    result.setAttribute("role", "region");
    result.setAttribute("aria-label", RESULT_REGION_LABEL);

    let pending = false;
    function update() {
        pending = false;
        // 1 px of slack for sub-pixel sizes
        const wide = result.scrollWidth > result.clientWidth + 1;
        const tall = result.scrollHeight > result.clientHeight + 1;
        note.hidden = !wide;
        if (wide || tall) {
            result.tabIndex = 0;
        } else {
            result.removeAttribute("tabindex");
        }
    }
    // measured on the next frame, when the browser has laid the new content out
    function schedule() {
        if (!pending) {
            pending = true;
            requestAnimationFrame(update);
        }
    }

    new MutationObserver(schedule).observe(result, { childList: true, subtree: true, characterData: true });
    if (typeof ResizeObserver === "function") {
        new ResizeObserver(schedule).observe(result);
    } else {
        window.addEventListener("resize", schedule);
    }
    schedule();
}
