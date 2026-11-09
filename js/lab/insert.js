// Inserting text at the editor's caret for code that lives outside the editor (the schema
// sidebar). Clicking a button moves the focus out of the editor, and for a keyboard user the
// focus is on the button anyway, so the editor's selection is remembered while the editor has
// the focus and put back before inserting.
//
//   const tracker = trackEditorSelection(editor);
//   tracker.insert("orders");   // replaces the remembered selection, or appends at the end
//   tracker.forget();           // the editor's text was replaced by the app
//
// The app replaces the editor's text itself (the table preview after a database opens), and
// the browser then parks the caret at the start. That must not look like a caret the student
// chose, so forget() drops the remembered selection and nothing is remembered again until the
// student acts in the editor (keys, pointer, typing) or inserts something. Until then the text
// is appended at the end. A remembered selection is also dropped if the editor's text is no
// longer what it was when the selection was recorded.

import { caretToEnd } from "./caret.js";

// Characters that need no space between them and an inserted name.
const NO_SPACE_BEFORE = /[\s(,.]/;
const NO_SPACE_AFTER = /[\s),.;]/;

export function trackEditorSelection(editor) {
    let saved = null; // {range, text}
    let acted = false; // the student has used the editor since the app last set its text

    // fromEvent is "selectionchange" or "blur". Chromium delivers selectionchange late (after
    // the click that took the focus away), when the selection may already have moved, so
    // the blur event, which comes before the selection moves, records it as well.
    function remember(fromEvent) {
        if (!acted) {
            return;
        }
        const selection = document.getSelection();
        const focused = fromEvent?.type === "blur" || document.activeElement === editor;
        if (!focused || !selection || selection.rangeCount === 0) {
            return;
        }
        const range = selection.getRangeAt(0);
        if (!editor.contains(range.startContainer) || !editor.contains(range.endContainer)) {
            return;
        }
        saved = { range: range.cloneRange(), text: editor.textContent };
    }

    function usable() {
        return (
            saved !== null &&
            saved.text === editor.textContent &&
            editor.contains(saved.range.startContainer) &&
            editor.contains(saved.range.endContainer)
        );
    }

    // Puts the focus back in the editor with the remembered selection, or the caret at the
    // end. The editor's own focus() selects all and collapses to the end, which would throw
    // the remembered position away, so the plain element focus is used.
    function restore() {
        HTMLElement.prototype.focus.call(editor);
        if (usable()) {
            const selection = document.getSelection();
            selection.removeAllRanges();
            selection.addRange(saved.range.cloneRange());
        } else {
            caretToEnd(editor);
        }
    }

    function textBefore(range) {
        const before = document.createRange();
        before.setStart(editor, 0);
        before.setEnd(range.startContainer, range.startOffset);
        return before.toString();
    }

    function textAfter(range) {
        const after = document.createRange();
        after.setStart(range.endContainer, range.endOffset);
        after.setEnd(editor, editor.childNodes.length);
        return after.toString();
    }

    document.addEventListener("selectionchange", remember);
    editor.addEventListener("blur", remember);
    for (const type of ["keydown", "pointerdown", "input"]) {
        editor.addEventListener(type, () => (acted = true), true);
    }

    return {
        forget() {
            saved = null;
            acted = false;
        },

        // insert puts text at the caret, replacing a selection, as one undo step. A space
        // is added on either side where the neighbouring text would otherwise run into it.
        insert(text) {
            restore();
            const range = document.getSelection().getRangeAt(0);
            const before = textBefore(range).slice(-1);
            const after = textAfter(range).slice(0, 1);
            const lead = before && !NO_SPACE_BEFORE.test(before) ? " " : "";
            const trail = after && !NO_SPACE_AFTER.test(after) ? " " : "";
            if (!document.execCommand("insertText", false, lead + text + trail)) {
                insertByHand(range, lead + text + trail);
            }
            // the caret goes right after the name, in front of the space added after it
            const selection = document.getSelection();
            const node = selection.anchorNode;
            if (trail && selection.isCollapsed && node?.nodeType === Node.TEXT_NODE && selection.anchorOffset > 0) {
                selection.collapse(node, selection.anchorOffset - 1);
            }
            acted = true;
            remember();
        },
    };
}

// The fallback for a browser without execCommand("insertText"): no undo step, but the same
// result. It tells the editor's listeners that its text changed.
function insertByHand(range, text) {
    range.deleteContents();
    const node = document.createTextNode(text);
    range.insertNode(node);
    const selection = document.getSelection();
    selection.collapse(node, node.length);
    node.parentElement?.dispatchEvent(new Event("input", { bubbles: true }));
}
