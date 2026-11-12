// A menu button and its menu (the WAI-ARIA "menu button" pattern), built on the popover attribute:
// the browser draws the menu in the top layer and closes it on Escape and on a press outside (light
// dismiss). This module adds the keyboard, the focus, the position and aria-expanded.
//
// mountMenu(button, menu, {onSelect, onOpen, opensOn}) -> {open(focus), close(focusButton), isOpen()}
//
//   button    a <button>. It becomes the menu's invoker (popoverTargetElement), so a press on it
//             toggles the menu instead of dismissing and reopening it.
//   menu      an element with an id and role="menu", placed right after the button in the document
//             (so Tab from inside the menu goes on to what follows the button). Its items are the
//             descendants with role menuitem, menuitemradio or menuitemcheckbox; give each
//             tabindex="-1": the arrow keys own the focus inside the menu.
//   onSelect  (item, event) => void, for an item activated by click, Enter or Space. Not called for
//             an item with aria-disabled="true". The menu closes after it; the focus goes back to the
//             button unless the handler moved it (a dialog it opened, say).
//   onOpen    () => void, as the menu opens (to update its items).
//   opensOn   "checked" (the default: a menu of choices, such as Theme) or "first" (a menu of
//             commands that also holds a group of choices, such as More, opens on its first
//             command, not on the choice that happens to be ticked).
//
// Keys. On the button: Enter and Space (the button's click) and ArrowDown open the menu with the
// focus on the checked item, else the first (or on the first, with opensOn "first"); ArrowUp opens
// it on the last. In the menu: ArrowDown
// and ArrowUp move with wrap-around, Home and End go to the ends, a printable character goes to
// the next item whose text starts with it, Escape closes and returns to the button, Tab closes and
// lets the focus move on, Shift+Tab closes and returns to the button.

const ITEM = '[role="menuitem"], [role="menuitemradio"], [role="menuitemcheckbox"]';
const GAP = 4; // px between the button and the menu
const MARGIN = 8; // px the menu keeps from the edges of the window

export function mountMenu(button, menu, { onSelect = () => {}, onOpen = () => {}, opensOn = "checked" } = {}) {
    if (!menu.id) {
        throw new Error("mountMenu: the menu needs an id");
    }
    // A browser without the popover attribute (before Safari 17, Firefox 125, Chrome 114) cannot
    // show the menu: its button goes too (css/menu.css hides the menu), rather than doing nothing.
    if (typeof menu.showPopover !== "function") {
        button.hidden = true;
        return { open() {}, close() {}, isOpen: () => false };
    }
    if (!menu.hasAttribute("popover")) {
        menu.setAttribute("popover", "auto");
    }
    button.setAttribute("aria-haspopup", "menu");
    button.setAttribute("aria-controls", menu.id);
    button.setAttribute("aria-expanded", "false");
    button.popoverTargetElement = menu;

    const isOpen = () => menu.matches(":popover-open");
    const items = () => [...menu.querySelectorAll(ITEM)].filter((item) => !item.hidden && !item.closest("[hidden]"));

    function focusItem(item) {
        item?.focus({ focusVisible: true });
    }

    // where the focus goes as the menu opens: "checked" (else the first item), "first" or "last".
    // Passed along, never kept: the browser may merge the toggle events of an open and a close.
    function initialItem(focus = opensOn) {
        const list = items();
        if (focus === "last") {
            return list.at(-1);
        }
        if (focus === "checked") {
            return list.find((item) => item.getAttribute("aria-checked") === "true") ?? list[0];
        }
        return list[0];
    }

    function open(focus = opensOn) {
        if (!isOpen()) {
            menu.showPopover();
            // placed as it opened; now that its width is known, kept inside the window
            place();
        }
        focusItem(initialItem(focus));
    }

    function close(focusButton = true) {
        if (isOpen()) {
            menu.hidePopover();
        }
        if (focusButton) {
            button.focus();
        }
    }

    function place() {
        placePopover(menu, button);
    }

    // while it is open it follows its button; a button no longer shown (the window crossed a
    // breakpoint: More, or Export and Theme, which More holds on a phone) closes it instead
    function follow() {
        if (!button.getClientRects().length) {
            if (isOpen()) {
                menu.hidePopover();
            }
            return;
        }
        place();
    }

    // beforetoggle is synchronous (toggle comes a task later), so the state is right at once
    menu.addEventListener("beforetoggle", (event) => {
        const opening = event.newState === "open";
        button.setAttribute("aria-expanded", String(opening));
        if (opening) {
            onOpen();
            place();
            window.addEventListener("resize", follow);
            window.addEventListener("scroll", follow, true);
        } else {
            window.removeEventListener("resize", follow);
            window.removeEventListener("scroll", follow, true);
        }
    });
    menu.addEventListener("toggle", (event) => {
        // a menu opened some other way still gets the focus
        if (event.newState === "open" && isOpen() && !menu.contains(document.activeElement)) {
            focusItem(initialItem());
        }
    });

    // A press, Enter or Space on the button: the menu opens here instead of in the browser's
    // popovertarget activation (cancelled), because that runs after this listener and the focus
    // would then move a task later, after keys typed at once. The button stays the invoker, so a
    // press on it while the menu is open is not a light dismiss: it closes the menu here.
    button.addEventListener("click", (event) => {
        event.preventDefault();
        if (isOpen()) {
            close(true);
        } else {
            open(opensOn);
        }
    });

    button.addEventListener("keydown", (event) => {
        if (event.key === "ArrowDown" || event.key === "ArrowUp") {
            event.preventDefault();
            open(event.key === "ArrowUp" ? "last" : opensOn);
        }
    });

    menu.addEventListener("keydown", (event) => {
        const list = items();
        const index = list.indexOf(document.activeElement);
        switch (event.key) {
            case "ArrowDown":
                event.preventDefault();
                focusItem(list[(index + 1) % list.length]);
                break;
            case "ArrowUp":
                event.preventDefault();
                focusItem(list[(index - 1 + list.length) % list.length]);
                break;
            case "Home":
                event.preventDefault();
                focusItem(list[0]);
                break;
            case "End":
                event.preventDefault();
                focusItem(list.at(-1));
                break;
            case "Escape":
                event.preventDefault();
                close(true);
                break;
            case "Tab":
                if (event.shiftKey) {
                    // back to the button: the browser gives the focus back to it as the menu
                    // closes, so its own Shift+Tab would go one further, past the button
                    event.preventDefault();
                    close(true);
                } else {
                    // close without taking the focus back: the Tab moves on from the button's place
                    close(false);
                }
                break;
            default:
                if (event.key.length === 1 && /\S/.test(event.key) && !event.ctrlKey && !event.metaKey && !event.altKey) {
                    const key = event.key.toLowerCase();
                    const order = [...list.slice(index + 1), ...list.slice(0, index + 1)];
                    const match = order.find((item) => item.textContent.trim().toLowerCase().startsWith(key));
                    if (match) {
                        event.preventDefault();
                        focusItem(match);
                    }
                }
        }
    });

    menu.addEventListener("click", (event) => {
        const item = event.target.closest(ITEM);
        if (!item || !menu.contains(item) || item.getAttribute("aria-disabled") === "true") {
            return;
        }
        onSelect(item, event);
        // back to the button, unless the handler put the focus somewhere else on purpose
        const focusInside = menu.contains(document.activeElement) || document.activeElement === document.body;
        close(false);
        if (focusInside) {
            button.focus();
        }
    });

    // focus that leaves for anywhere but the button closes the menu
    menu.addEventListener("focusout", (event) => {
        if (isOpen() && event.relatedTarget && !menu.contains(event.relatedTarget) && event.relatedTarget !== button) {
            menu.hidePopover();
        }
    });

    return { open, close, isOpen };
}

// placePopover puts a popover (position: fixed in the top layer) under its anchor, or above it
// when there is more room above. It lines up with the anchor's left edge, or its right edge when the
// anchor sits in the right half of the window, so it does not need its own size, and it is cut to
// the window (it scrolls inside).
export function placePopover(popover, anchor) {
    const rect = anchor.getBoundingClientRect();
    const below = window.innerHeight - rect.bottom - GAP - MARGIN;
    const above = rect.top - GAP - MARGIN;
    const style = popover.style;
    if (below >= Math.min(240, above)) {
        style.top = `${rect.bottom + GAP}px`;
        style.bottom = "auto";
        style.maxHeight = `${Math.max(below, 80)}px`;
    } else {
        style.top = "auto";
        style.bottom = `${window.innerHeight - rect.top + GAP}px`;
        style.maxHeight = `${Math.max(above, 80)}px`;
    }
    // The room from the aligned edge to the far side of the window, as --popover-room: css/menu.css
    // and css/shell.css keep the popover's width within it, so it never runs off the other edge
    // (its own width is not known before it shows).
    if (rect.left + rect.width / 2 > window.innerWidth / 2) {
        const right = Math.max(MARGIN, window.innerWidth - rect.right);
        style.left = "auto";
        style.right = `${right}px`;
        style.setProperty("--popover-room", `${window.innerWidth - right - MARGIN}px`);
    } else {
        const left = Math.max(MARGIN, rect.left);
        style.right = "auto";
        style.left = `${left}px`;
        style.setProperty("--popover-room", `${window.innerWidth - left - MARGIN}px`);
    }
    if (popover.matches(":popover-open")) {
        keepInside(popover);
    }
}

// keepInside moves a shown popover back inside the window's margins (a last resort: the room above
// should already keep it there)
function keepInside(popover) {
    const box = popover.getBoundingClientRect();
    if (box.left < MARGIN || box.right > window.innerWidth - MARGIN) {
        popover.style.right = "auto";
        popover.style.left = `${MARGIN}px`;
    }
}
