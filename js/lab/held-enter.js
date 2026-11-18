// A key that is held down repeats, and each repeat goes to whatever has the keyboard focus then.
// When a dialog closes while Enter is still down, the repeats would land on the page: on the button
// the focus went back to (a menu's button opens its menu, and the next repeat presses the menu's
// first entry), or in the editor, as empty lines. The dialogs of the long jobs (the import of
// files, the export of tables) call swallowHeldEnter() when they close, whichever way: once for
// each closing, the first time they hear of it (the browser tells of Escape before it closes the
// dialog).
//
//   swallowHeldEnter()
//       From now on a repeated Enter does nothing, wherever the focus is, until Enter is let go.
//       The page stops listening when Enter is let go, and at a press of Enter that is not a
//       repeat: that press, and every key after it, acts as it always does. A dialog that was
//       closed with the mouse therefore changes nothing: the next press of Enter ends the
//       listening and is taken as ever. Another key does not end it, pressed or let go: the
//       keyboard may go on repeating Enter after that (Tab let go a moment after Enter went down,
//       Shift pressed while it is down), and no other key is touched meanwhile.
//
// It listens on the window, in the capture phase, so that it hears a key before the editor, a menu
// or the page's own shortcuts do.
//
// Not covered: Enter held on the Export button itself, with no dialog of a long job in between. It
// opens the menu and goes on into the menu's first entry, as it did before there was a guard: no
// dialog has closed, so nobody has called swallowHeldEnter().

let listening = false;

function stop() {
    listening = false;
    window.removeEventListener("keydown", onKeyDown, true);
    window.removeEventListener("keyup", onKeyUp, true);
}

function onKeyDown(event) {
    if (event.key !== "Enter") {
        return;
    }
    if (event.repeat) {
        event.preventDefault();
        event.stopImmediatePropagation();
        return;
    }
    stop();
}

function onKeyUp(event) {
    if (event.key === "Enter") {
        stop();
    }
}

export function swallowHeldEnter() {
    if (listening) {
        return;
    }
    listening = true;
    window.addEventListener("keydown", onKeyDown, true);
    window.addEventListener("keyup", onKeyUp, true);
}
