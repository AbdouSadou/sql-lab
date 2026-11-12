// The About page's own script (loaded by about.html beside js/lab/brand.js).
//
//   - A link with data-back (the brand, and the "Back to" link at the end) goes back in the
//     history when the page was opened from this site, so the app comes back as it was left (its
//     query, its result, an open exercise); otherwise it follows its href to the app (./), as
//     without this script.
//   - The keyboard shortcuts name Ctrl, or ⌘ on an Apple device (js/lab/keys.js), as Help does.

import { showPlatformKeys } from "./keys.js";

function cameFromThisSite() {
    try {
        // (the two origins compared as URLs: nothing is built from the origin, tests/ac7-pages.spec.js)
        return Boolean(document.referrer) && new URL(document.referrer).origin === new URL(window.location.href).origin && window.history.length > 1;
    } catch {
        return false;
    }
}

for (const link of document.querySelectorAll("a[data-back]")) {
    link.addEventListener("click", (event) => {
        // a press that opens a new tab or window keeps the browser's own way
        if (event.button !== 0 || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey || !cameFromThisSite()) {
            return;
        }
        event.preventDefault();
        window.history.back();
    });
}

showPlatformKeys();
