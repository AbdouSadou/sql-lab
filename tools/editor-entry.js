// The entry point of vendor/editor.js, the CodeMirror 6 bundle (tools/build-editor.mjs). It holds
// the library only: what SQL Lab does with it (the keys, the completion, the look) lives in
// js/lab/code-editor.js, which is not bundled, so changing it needs no build.

export { Annotation, Compartment, EditorSelection, EditorState, Prec } from "@codemirror/state";
export {
    EditorView,
    drawSelection,
    dropCursor,
    highlightActiveLine,
    highlightActiveLineGutter,
    highlightSpecialChars,
    keymap,
    lineNumbers,
    placeholder,
} from "@codemirror/view";
export { defaultKeymap, history, historyKeymap, indentLess, indentMore } from "@codemirror/commands";
export { bracketMatching, indentUnit, syntaxHighlighting, syntaxTree } from "@codemirror/language";
export { SQLDialect, SQLite, keywordCompletionSource, schemaCompletionSource, sql } from "@codemirror/lang-sql";
export {
    acceptCompletion,
    autocompletion,
    closeCompletion,
    completeFromList,
    completionKeymap,
    completionStatus,
    currentCompletions,
    ifNotIn,
    startCompletion,
} from "@codemirror/autocomplete";
export { tagHighlighter, tags } from "@lezer/highlight";
