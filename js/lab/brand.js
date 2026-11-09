// Writes the app name (js/lab/config.js) into the page. Loaded by every page.
//
//   - document.title: the page's own title part (data-page-title on <title>, for
//     example "About") followed by the app name, or just the app name.
//   - every element with a data-app-name attribute gets the name as its text.

import { APP_NAME } from "./config.js";

const SEPARATOR = " - ";

// titleFor builds a document title from a page-specific part and the app name.
export function titleFor(part) {
    return part ? `${part}${SEPARATOR}${APP_NAME}` : APP_NAME;
}

function apply() {
    const title = document.querySelector("title");
    document.title = titleFor(title ? title.dataset.pageTitle : "");
    for (const el of document.querySelectorAll("[data-app-name]")) {
        el.textContent = APP_NAME;
    }
}

if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", apply);
} else {
    apply();
}
