// The Help button and its popover (UI plan, section 5): the keyboard shortcuts, the privacy line
// and the link to About. The popover is a non-modal dialog on the popover attribute: the button is
// its invoker (a press toggles it), Escape and a press outside close it, and so does the focus
// moving on out of it; the browser returns the focus to the button when it closes with the focus
// inside. This module places it under the button, keeps aria-expanded right and moves the focus
// into it when it opens.
//
// mountHelp({button, popover})

import { placePopover } from "./menu.js";

export function mountHelp({ button, popover }) {
    if (typeof popover.showPopover !== "function") {
        // a browser without the popover attribute (css/menu.css hides the popover there)
        button.hidden = true;
        return;
    }
    button.popoverTargetElement = popover;
    // beforetoggle is synchronous: placed and announced before the popover shows
    popover.addEventListener("beforetoggle", (event) => {
        const opening = event.newState === "open";
        button.setAttribute("aria-expanded", String(opening));
        if (opening) {
            placePopover(popover, button);
        }
    });
    popover.addEventListener("toggle", (event) => {
        if (event.newState === "open" && popover.matches(":popover-open")) {
            // placed as it opened; now that its width is known, kept inside the window
            placePopover(popover, button);
            popover.focus({ preventScroll: true });
        }
    });
    // like a menu, it closes when the focus moves on to something else on the page (Escape and
    // a press outside close it too); the focus is where the student took it
    popover.addEventListener("focusout", (event) => {
        if (popover.matches(":popover-open") && event.relatedTarget && !popover.contains(event.relatedTarget) && event.relatedTarget !== button) {
            popover.hidePopover();
        }
    });
    window.addEventListener("resize", () => {
        if (popover.matches(":popover-open")) {
            placePopover(popover, button);
        }
    });
}
