// caretToEnd puts the caret at the end of the editor's text. Setting the editor's text
// (the table preview does it after the editor was focused) moves the caret to the start,
// so index.js calls this once the editor holds its final text.
export function caretToEnd(editor) {
    const selection = window.getSelection();
    if (!selection) {
        return;
    }
    const range = document.createRange();
    range.selectNodeContents(editor);
    range.collapse(false);
    selection.removeAllRanges();
    selection.addRange(range);
}
