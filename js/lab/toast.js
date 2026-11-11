// Toasts (UI plan, section 5): one short message at the bottom centre of the window, one at a
// time, announced politely to screen readers. They answer an action: Copy link, an export, a
// database the student opened, a Run refused while a database loads, a query put back from the
// History tab, and the failures of those actions.
//
//   toast(message, {tone})
//       tone "info" (the default: a tick, something was done) and "note" (an "i": nothing was done,
//       and why, such as a Run refused while a database loads) go after TOAST_MS; "problem" (an
//       alert sign: something failed) stays twice as long, because a sentence that says what went
//       wrong takes longer to read; a long message stays long enough to be read (READ_MS a word).
//       A new toast replaces the one on screen. The text is set with textContent.
//
// The region is #toast-region in index.html, a polite live region that is in the page from the
// start (a live region added later is not always heard). It is emptied first and filled a moment
// later, so the same words twice in a row are announced twice. It sits outside the app's grid
// and takes no pointer events, so it never covers a control the student is reaching for.

import { TOAST_MS } from "./config.js";
import { icon } from "./icons.js";

// the gap between emptying the region and filling it: long enough for a screen reader to see
// two changes
const ANNOUNCE_GAP_MS = 60;
// reading time per word, for a toast longer than a few words (about 200 words a minute)
const READ_MS = 300;

let showTimer = 0;
let hideTimer = 0;

export function toast(message, { tone = "info" } = {}) {
    const region = document.getElementById("toast-region");
    if (!region) {
        return;
    }
    clearTimeout(showTimer);
    clearTimeout(hideTimer);
    region.replaceChildren();

    const kind = tone === "problem" || tone === "note" ? tone : "info";
    const card = document.createElement("div");
    card.className = `toast toast--${kind}`;
    const glyph = kind === "problem" ? icon("circle-alert") : kind === "note" ? icon("info") : icon("check");
    glyph.classList.add("toast-icon");
    const text = document.createElement("span");
    text.className = "toast-text";
    text.textContent = message;
    card.append(glyph, text);

    showTimer = setTimeout(() => {
        region.append(card);
        const words = message.split(/\s+/).filter(Boolean).length;
        const least = kind === "problem" ? 2 * TOAST_MS : TOAST_MS;
        hideTimer = setTimeout(() => card.remove(), Math.max(least, words * READ_MS));
    }, ANNOUNCE_GAP_MS);
}
