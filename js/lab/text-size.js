// The text-size control (UI plan, sections 5 and 6): A− and A+ at the far right of the editor
// toolbar (docs/design/mockup/exercise-correct.html) make the SQL and the results smaller or
// larger, 12 to 24 px in steps of 2 (14 to begin with), for a projector at the back of a room.
//
// The size is the custom property --code-size on <html>; css/tokens.css gives its default, and the
// editor (css/editor.css), the result table and the error band's SQL (css/result.css) and the
// Expected and Yours tables (css/exercises.css) are drawn at it. It is kept in localStorage under
// TEXT_SIZE_STORAGE_KEY, and js/lab/theme-boot.js applies it before the first paint (so a large
// size does not flash small). At either end a button stays where it is and keeps the focus, but
// does nothing: aria-disabled, with a title that says why. Each new size is said, once, by a
// polite live region.
//
// mountTextSize({smaller, larger, said}) -> {size()}
//   smaller, larger  the two buttons
//   said             the live region that says the new size

import {
    TEXT_SIZE_DEFAULT,
    TEXT_SIZE_LARGEST,
    TEXT_SIZE_SMALLEST,
    TEXT_SIZE_STORAGE_KEY,
    TEXT_SIZES,
    textSizeAnnouncement,
} from "./config.js";

// readTextSize is the stored size, or the default (nothing stored, a value that is not one of the
// sizes, storage that throws)
export function readTextSize() {
    try {
        const stored = Number(localStorage.getItem(TEXT_SIZE_STORAGE_KEY));
        return TEXT_SIZES.includes(stored) ? stored : TEXT_SIZE_DEFAULT;
    } catch {
        return TEXT_SIZE_DEFAULT;
    }
}

export function mountTextSize({ smaller, larger, said }) {
    // the size of this page: read once, then kept here, so a choice still holds for the page when
    // storage cannot keep it
    let size = readTextSize();
    let sayTimer = 0;

    function mark(button, atEnd, endText) {
        if (atEnd) {
            button.setAttribute("aria-disabled", "true");
            button.title = endText;
        } else {
            button.removeAttribute("aria-disabled");
            button.removeAttribute("title");
        }
    }

    function apply() {
        document.documentElement.style.setProperty("--code-size", `${size}px`);
        const at = TEXT_SIZES.indexOf(size);
        mark(smaller, at === 0, TEXT_SIZE_SMALLEST);
        mark(larger, at === TEXT_SIZES.length - 1, TEXT_SIZE_LARGEST);
    }

    function step(by) {
        const next = TEXT_SIZES[TEXT_SIZES.indexOf(size) + by];
        if (next === undefined) {
            return;
        }
        size = next;
        apply();
        try {
            localStorage.setItem(TEXT_SIZE_STORAGE_KEY, String(size));
        } catch {
            // storage unusable: the size holds for this page only
        }
        // emptied first and filled a moment later, so two presses in a row are both said
        clearTimeout(sayTimer);
        said.textContent = "";
        sayTimer = setTimeout(() => {
            said.textContent = textSizeAnnouncement(size);
        }, 60);
    }

    smaller.addEventListener("click", () => step(-1));
    larger.addEventListener("click", () => step(1));
    apply();
    return { size: () => size };
}
