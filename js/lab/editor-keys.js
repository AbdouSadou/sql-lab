// Keyboard escape hatch for the SQL editor. The editor uses Tab to indent, which
// would trap a keyboard user. Pressing Escape first makes the next Tab or Shift+Tab
// move focus out of the editor instead. Any other key (or losing focus) cancels it.

// The matching spoken hint is the #editor-hint element in index.html (aria-describedby).

const MODIFIERS = new Set(["Shift", "Control", "Alt", "Meta"]);
const armed = new WeakSet();

// leavesEditor takes every keydown of the editor. It returns true when the event is
// the Tab that should be left to the browser (focus moves), false otherwise.
export function leavesEditor(editor, event) {
    if (MODIFIERS.has(event.key)) {
        // Holding Shift for Shift+Tab must not cancel the Escape.
        return false;
    }
    if (event.key === "Escape") {
        armed.add(editor);
        return false;
    }
    if (event.key === "Tab" && armed.has(editor)) {
        armed.delete(editor);
        return true;
    }
    armed.delete(editor);
    return false;
}

// cancelLeave forgets a pending Escape (focus left or came back).
export function cancelLeave(editor) {
    armed.delete(editor);
}
