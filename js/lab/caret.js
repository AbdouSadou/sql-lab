// caretToEnd puts the caret at the end of the editor's text. Setting the editor's text
// (a restored or shared query, when a database opens) moves the caret to the start, so
// index.js (showStarted) calls this once the editor holds its final text.
export function caretToEnd(editor) {
    if (editor.view) {
        // CodeMirror (js/lab/code-editor.js) keeps a selection of its own
        editor.code.caretToEnd();
        return;
    }
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
