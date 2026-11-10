// From 40rem the command bar sits over the bottom of the editor (css/commandbar.css), and the
// editor leaves room for it with padding (css/editor.css). A bar of five or six buttons does not
// fit one row in every window that is 40rem wide or more (a window of 640 to 770 px, or one with
// an exercise set open), so it wraps to two rows and would be drawn over the last lines of the
// query. This keeps the room the editor leaves equal to the bar's real height: it measures the
// bar whenever its size changes and sets the custom property --commandbar-clearance on the
// editor, which css/editor.css reads (with 2.125rem, one row, as its fallback).
//
//   mountCommandBarFit({editor, bar})

import { COMMANDBAR_CLEARANCE_PROPERTY } from "./config.js";

export function mountCommandBarFit({ editor, bar }) {
    function update() {
        const height = bar.getBoundingClientRect().height;
        if (height > 0) {
            // 2 px for the editor's bottom border and the bar's own rounding
            editor.style.setProperty(COMMANDBAR_CLEARANCE_PROPERTY, `${Math.ceil(height) + 2}px`);
        }
    }

    if (typeof ResizeObserver === "function") {
        new ResizeObserver(update).observe(bar);
    } else {
        window.addEventListener("resize", update);
    }
    update();
}
