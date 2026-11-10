// SQL editor component
import { escapeHtml } from "../lab/html.js";
import { cancelLeave, leavesEditor } from "../lab/editor-keys.js";

const TAB_WIDTH = 2;

class SqlimeEditor extends HTMLElement {
    connectedCallback() {
        if (!this.rendered) {
            this.render();
            this.listen();
            this.rendered = true;
        }
    }

    render() {
        this.contentEditable = "true";
        this.spellcheck = false;
        this.setAttribute("role", "textbox");
        this.setAttribute("aria-multiline", "true");
        this.setAttribute("aria-label", "SQL query");
    }

    listen() {
        // shortcuts
        this.addEventListener("keydown", this.onKeydown.bind(this));
        this.addEventListener("blur", () => cancelLeave(this));
        // always paste as plain text
        this.addEventListener("paste", this.onPaste.bind(this));
        // first input event
        const onInput = (event) => {
            this.dispatchEvent(new Event("start"));
            this.removeEventListener("input", onInput);
        };
        this.addEventListener("input", onInput);
    }

    // focus sets cursor at the end of the editor
    focus() {
        super.focus();
        document.execCommand("selectAll", false, null);
        document.getSelection().collapseToEnd();
    }

    // clear clears editor contents
    clear() {
        this.value = "";
    }

    onKeydown(event) {
        // Escape, then Tab leaves the editor (keyboard accessibility).
        if (leavesEditor(this, event)) return;
        if (handleIndent(this, event)) return;
        if (handleExecute(this, event)) return;
    }

    onPaste(event) {
        event.preventDefault();
        // get text representation of clipboard
        const text = event.clipboardData.getData("text/plain");
        // insert text manually; insertHTML parses its argument, so escape it first
        document.execCommand("insertHTML", false, escapeHtml(text));
    }

    get value() {
        return this.innerText;
    }
    set value(newValue) {
        this.innerText = newValue;
    }

    // query is the selected text if the selection lies inside the editor, else all of it.
    // The selection is page-wide, so text selected elsewhere (an exercise prompt, a result
    // cell) must not be taken for SQL.
    get query() {
        const selectedQuery = this.selectedText().trim();
        return selectedQuery || this.innerText;
    }

    // selectedText returns the page selection's text only if all of it is inside the editor.
    selectedText() {
        const selection = window.getSelection();
        if (!selection || selection.rangeCount === 0 || selection.isCollapsed) {
            return "";
        }
        for (let i = 0; i < selection.rangeCount; i++) {
            const range = selection.getRangeAt(i);
            if (!this.contains(range.startContainer) || !this.contains(range.endContainer)) {
                return "";
            }
        }
        return selection.toString();
    }
}

// handleIndent indents text with Tab
function handleIndent(elem, event) {
    if (event.key != "Tab") {
        return false;
    }
    event.preventDefault();
    document.execCommand("insertHTML", false, " ".repeat(TAB_WIDTH));
    return true;
}

// handleExecute truggers 'execute' event by Ctrl/Cmd+Enter
function handleExecute(elem, event) {
    // Ctrl+Enter or Cmd+Enter
    if (!event.ctrlKey && !event.metaKey) {
        return false;
    }
    // 10 and 13 are Enter codes
    if (event.keyCode != 10 && event.keyCode != 13) {
        return false;
    }

    event.preventDefault();
    elem.dispatchEvent(new CustomEvent("execute", { detail: elem.query }));
    return true;
}

customElements.define("sqlime-editor", SqlimeEditor);
