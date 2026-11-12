// SQL editor component.
//
// <sqlime-editor> starts as a plain editable box (contenteditable) and loads CodeMirror
// (vendor/editor.js) at once; when it arrives, js/lab/code-editor.js draws the editor inside the
// element instead, with the text, the caret and the focus carried over. If the library does not
// load (blocked, offline, an old browser), the plain box stays and everything still works: the
// same text, the same keys (Tab indents, Escape then Tab leaves, Ctrl/Cmd+Enter runs) and the
// same events.
//
// The surface the app uses, the same in both modes:
//   value                 the text (setting it replaces the text; the caret goes to the start)
//   query                 the selected text if the selection is in the editor, else all of it
//   focus()               the focus to the editor, the caret after the last character
//   clear()               no text
//   setSchema(objects)    the tables, views and columns to complete (ignored by the plain box)
//   ready                 a promise settled once the editor is drawn by CodeMirror, or the library
//                         failed, or UPGRADE_WAIT_MS passed (CodeMirror can still arrive later)
//   view                  CodeMirror's EditorView, or null while the plain box is shown
//   events: "input" (the student changed the text), "start" (the first change), "execute"
//   (Ctrl/Cmd+Enter; detail is the query), "replace" (the app set the text through value),
//   "reveal" (focus() or fill() is about to put the focus here: on a phone the editor may be
//   in the view that is not shown, js/lab/layout.js)
// data-editor on the element says which is shown: "loading", "code" or "plain".

import { escapeHtml } from "../lab/html.js";
import { cancelLeave, leavesEditor } from "../lab/editor-keys.js";
import { EDITOR_LABEL, EDITOR_PLACEHOLDER, EDITOR_UPGRADE_WAIT_MS } from "../lab/config.js";

const TAB_WIDTH = 2;

class SqlimeEditor extends HTMLElement {
    connectedCallback() {
        if (!this.rendered) {
            this.render();
            this.listen();
            this.rendered = true;
            this.upgrade();
        }
    }

    render() {
        this.contentEditable = "true";
        this.spellcheck = false;
        this.setAttribute("role", "textbox");
        this.setAttribute("aria-multiline", "true");
        this.setAttribute("aria-label", EDITOR_LABEL);
        // shown by css/editor.css while the plain box is empty
        this.dataset.placeholder = EDITOR_PLACEHOLDER;
        this.dataset.editor = "loading";
    }

    listen() {
        // the plain box's own handlers; CodeMirror's content sits inside this element, so its
        // events pass through here and are left alone once it is drawn
        this.addEventListener("keydown", (event) => this.code || this.onKeydown(event));
        this.addEventListener("blur", () => this.code || cancelLeave(this));
        // a press in the editor after Escape: the student goes on editing, so Tab indents again
        this.addEventListener("pointerdown", () => this.code || cancelLeave(this));
        // always paste as plain text
        this.addEventListener("paste", (event) => this.code || this.onPaste(event));
        // first input event
        const onInput = () => {
            this.dispatchEvent(new Event("start"));
            this.removeEventListener("input", onInput);
        };
        this.addEventListener("input", onInput);
    }

    // upgrade loads CodeMirror and draws the editor with it. this.ready settles when that is done,
    // failed, or took longer than EDITOR_UPGRADE_WAIT_MS (the plain box is shown meanwhile).
    upgrade() {
        let settle;
        this.ready = new Promise((resolve) => (settle = resolve));
        const timer = setTimeout(() => {
            if (!this.code) {
                this.dataset.editor = "plain";
            }
            settle();
        }, EDITOR_UPGRADE_WAIT_MS);
        Promise.all([import("../../vendor/editor.js"), import("../lab/code-editor.js")])
            .then(([cm, { createCodeEditor }]) => this.mountCode(cm, createCodeEditor))
            .catch((error) => {
                console.warn("The code editor could not be loaded; the plain editor stays.", error);
                this.dataset.editor = "plain";
            })
            .finally(() => {
                clearTimeout(timer);
                settle();
            });
    }

    // mountCode replaces the plain box with CodeMirror, keeping the text, the caret and the focus.
    // CodeMirror is set up first: if that throws, the plain box is untouched.
    mountCode(cm, createCodeEditor) {
        const doc = this.innerText === "\n" ? "" : this.innerText;
        const focused = document.activeElement === this;
        const { anchor, head } = focused ? this.caretOffsets() : { anchor: doc.length, head: doc.length };
        const code = createCodeEditor(cm, this, { doc, anchor, head, schema: this.schema ?? [] });
        this.removeAttribute("contenteditable");
        this.removeAttribute("role");
        this.removeAttribute("aria-multiline");
        this.removeAttribute("aria-label");
        this.removeAttribute("aria-describedby");
        this.removeAttribute("tabindex");
        this.removeAttribute("spellcheck");
        this.replaceChildren(code.view.dom);
        this.code = code;
        this.dataset.editor = "code";
        if (focused) {
            this.code.view.focus();
        }
    }

    // the plain box's selection as offsets into its text as innerText (the text CodeMirror is given)
    // counts it: a <br> is a line break, and the edges of a line block (<div>, <p>) are a line
    // break between text (several edges in a row count once, and none at the very start). The end
    // if the selection is not inside.
    caretOffsets() {
        const selection = window.getSelection();
        const end = this.innerText.length;
        if (!selection || selection.rangeCount === 0) {
            return { anchor: end, head: end };
        }
        const offset = (node, at) => {
            if (!this.contains(node)) {
                return end;
            }
            // the text before the point, walked in the page: strings, and "start" or "end" for the
            // edges of the blocks passed (a block the point is in has only its start passed)
            const items = [];
            let done = false;
            const walk = (parent) => {
                const children = parent.childNodes;
                for (let i = 0; i < children.length; i++) {
                    if (parent === node && i === at) {
                        done = true;
                        return;
                    }
                    const child = children[i];
                    if (child.nodeType === Node.TEXT_NODE) {
                        items.push(child === node ? child.data.slice(0, at) : child.data);
                        if (child === node) {
                            done = true;
                            return;
                        }
                    } else if (child.nodeName === "BR") {
                        items.push("\n");
                    } else {
                        const block = child.nodeName === "DIV" || child.nodeName === "P";
                        if (block) {
                            items.push("start");
                        }
                        walk(child);
                        if (done) {
                            return;
                        }
                        if (block) {
                            items.push("end");
                        }
                    }
                }
                done = parent === node;
            };
            walk(this);
            let text = "";
            let edge = null; // the last edge passed since the last text, if some text came before
            for (const item of items) {
                if (item === "start" || item === "end") {
                    edge = text ? item : null;
                } else if (item) {
                    text += (edge ? "\n" : "") + item;
                    edge = null;
                }
            }
            // the point is just inside a line block: its line break comes before the point
            if (edge === "start") {
                text += "\n";
            }
            return Math.min(text.length, end);
        };
        return { anchor: offset(selection.anchorNode, selection.anchorOffset), head: offset(selection.focusNode, selection.focusOffset) };
    }

    get view() {
        return this.code ? this.code.view : null;
    }

    setSchema(objects) {
        this.schema = objects;
        this.code?.setSchema(objects);
    }

    // focus sets cursor at the end of the editor
    focus() {
        // shown first (it may be in a view that is not shown: a hidden editor takes no focus)
        this.dispatchEvent(new Event("reveal"));
        if (this.code) {
            this.code.caretToEnd();
            return;
        }
        super.focus();
        document.execCommand("selectAll", false, null);
        document.getSelection().collapseToEnd();
    }

    // clear clears editor contents
    clear() {
        this.value = "";
    }

    // fill replaces all the text with text the student chose (a sample query in the results pane):
    // one edit that Ctrl/Cmd+Z takes back, an "input" event as for typing, then the focus and the
    // caret at the end. (value is the app's own text: no undo back past it, and no "input".)
    fill(text) {
        this.dispatchEvent(new Event("reveal"));
        if (this.code) {
            this.code.fill(text);
            return;
        }
        HTMLElement.prototype.focus.call(this);
        document.execCommand("selectAll", false, null);
        // insertText is undoable; an empty text is a delete, which is undoable too
        if (text) {
            document.execCommand("insertText", false, text);
        } else {
            document.execCommand("delete", false, null);
        }
        this.focus();
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
        return this.code ? this.code.value : this.innerText;
    }
    set value(newValue) {
        if (this.code) {
            this.code.value = newValue;
        } else {
            this.innerText = newValue;
        }
        this.dispatchEvent(new Event("replace"));
    }

    // query is the selected text if the selection lies inside the editor, else all of it.
    // The selection is page-wide, so text selected elsewhere (an exercise prompt, a result
    // cell) must not be taken for SQL.
    get query() {
        const selectedQuery = this.selectedText().trim();
        return selectedQuery || this.value;
    }

    // selectedText returns the page selection's text only if all of it is inside the editor.
    selectedText() {
        if (this.code) {
            return this.code.selectedText();
        }
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
