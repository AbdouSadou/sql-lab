// The SQL editor drawn by CodeMirror 6 (UI plan, section 5): highlighting, line numbers, the
// active line, bracket matching, and completion of SQLite's keywords and functions and of the
// open database's tables, views and columns. js/components/sqlime-editor.js loads the library
// (vendor/editor.js, built by tools/build-editor.mjs) and calls createCodeEditor; if the library
// does not load, that element stays a plain editable box and everything still works.
//
// createCodeEditor(cm, host, {doc, anchor, head, schema}) -> editor
//   cm      the vendor/editor.js module
//   host    the <sqlime-editor> element; the editor's events ("input", "execute") are fired on
//           it, as the plain box fires them, and the caller puts editor.view.dom inside it
//   doc, anchor, head   the text and the selection to start with
//   schema  [{name, type: "table"|"view", columns: [{name, type}]}] for the completion
//
// editor.view                   the EditorView
// editor.value / editor.value = text   the text; setting it starts afresh (no undo back past it)
// editor.selectedText()         the selected text if the page's selection is in the editor
// editor.caretToEnd()           the focus to the editor and the caret after the last character
// editor.insert(text, {atCaret})   puts text at the caret (or at the end), one undo step
// editor.fill(text)             replaces all the text, as one undo step (a sample query the
//                               student chose), then the focus and the caret at the end
// editor.setSchema(schema)      new names to complete (a database switch, or DDL)
//
// Keys, as with the plain box: Ctrl/Cmd+Enter fires "execute" (the selection, else all of it);
// Tab indents (two spaces, or the selected lines); Escape, then Tab or Shift+Tab, leaves the
// editor (js/lab/editor-keys.js, with no time limit). Ctrl/Cmd+/ comments or uncomments the
// lines. The list of names opens as a word is typed (Ctrl+Space opens it at any time) with
// nothing picked: the arrow keys pick a name and Enter takes it; until then Enter is a new line.
// Escape closes the list. A dropped file is refused, as the plain box refuses it: only text goes
// in.
//
// The editor is the element with role="textbox" (CodeMirror's content element): its name is
// EDITOR_LABEL and it is described by #editor-hint (the sentence in the Help popover).

import {
    COMPLETION_FUNCTION,
    COMPLETION_TABLE,
    COMPLETION_TYPE,
    COMPLETION_VIEW,
    EDITOR_HINT_ID,
    EDITOR_LABEL,
    EDITOR_PLACEHOLDER,
    completionsOpenedText,
} from "./config.js";
import { cancelLeave, leavesEditor } from "./editor-keys.js";
import { identifierForSql } from "./sql.js";
import { SQLITE_FUNCTIONS, SQLITE_KEYWORDS } from "./sqlite-words.js";

const INDENT = "  ";

// the syntax nodes of lang-sql inside which no name or keyword is offered
const NO_COMPLETION_IN = ["QuotedIdentifier", "String", "LineComment", "BlockComment", "."];
// an identifier being typed: letters of any script with their marks, digits, _ and $ (SQLite takes
// all of them in a name)
const WORD = /[\p{L}\p{M}\p{N}_$]+$/u;
const WORD_ONLY = /^[\p{L}\p{M}\p{N}_$]*$/u;
// a name lang-sql reads as one: an ASCII letter or digit first, then those and _
const READABLE = /^[A-Za-z0-9][A-Za-z0-9_]*$/;
// a name as written right before a dot: "quoted" (a quote doubled inside), `quoted`, or bare
const QUALIFIER = /(?:"((?:[^"]|"")*)"|`((?:[^`]|``)*)`|([\p{L}\p{M}\p{N}_$]+))$/u;

function carriesFiles(dataTransfer) {
    if (!dataTransfer) {
        return false;
    }
    return Array.from(dataTransfer.types || []).includes("Files") || (dataTransfer.files && dataTransfer.files.length > 0);
}

// a completion that inserts the name as the Schema tab would (quoted only when it must be)
function nameOption(name, type, detail, boost) {
    const option = { label: name, type, boost };
    if (detail) {
        option.detail = detail;
    }
    const sql = identifierForSql(name);
    if (sql !== name) {
        option.apply = sql;
    }
    return option;
}

// lang-sql's namespace: each table or view, with its columns completed after "name." (and after
// an alias of it). A dot inside a name is escaped, or lang-sql would take it for a schema.
function namespaceOf(schema) {
    // no prototype: a table named __proto__ is a name like any other
    const namespace = Object.create(null);
    for (const object of schema) {
        namespace[object.name.replace(/\./g, "\\.")] = {
            self: nameOption(object.name, "type", object.type === "view" ? COMPLETION_VIEW : COMPLETION_TABLE, 0),
            children: object.columns.map((column) => nameOption(column.name, "property", column.type, 0)),
        };
    }
    return namespace;
}

// every column of the open database, for a name typed without "table." in front: each name
// once, with the tables and views that have it
function columnOptionsOf(schema) {
    const owners = new Map();
    for (const object of schema) {
        for (const column of object.columns) {
            if (!owners.has(column.name)) {
                owners.set(column.name, []);
            }
            owners.get(column.name).push(object.name);
        }
    }
    return [...owners].map(([name, tables]) => nameOption(name, "property", tables.join(", "), -1));
}

// the name written right before the dot at `dot` ({name, readable}), or null; readable: lang-sql
// reads it (a bare name of ASCII letters, digits and _, or a quoted one with no quote doubled inside)
function nameBefore(state, dot) {
    const line = state.doc.lineAt(dot);
    const match = QUALIFIER.exec(state.sliceDoc(line.from, dot));
    if (!match) {
        return null;
    }
    const [, double, back, bare] = match;
    if (bare !== undefined) {
        return { name: bare, readable: READABLE.test(bare) };
    }
    const quote = double !== undefined ? '"' : "`";
    const inner = double ?? back;
    return { name: inner.replaceAll(quote + quote, quote), readable: !inner.includes(quote) };
}

// A list that offers only what was typed would linger and take the arrow keys, so a name already
// typed in full is not offered. As the word grows the list is filtered again at once (the result's
// update), not asked for again: a list waiting for an answer ignores the arrow keys.
function withoutTyped(source) {
    return (context) => {
        const result = source(context);
        if (!result) {
            return result;
        }
        const all = result.options;
        const valid = result.validFor;
        const stillValid = (text, from, to, state) =>
            typeof valid === "function" ? valid(text, from, to, state) : valid instanceof RegExp && new RegExp(`^(?:${valid.source})$`, valid.flags).test(text);
        const shown = (typed) => all.filter((option) => option.label.toLowerCase() !== typed.toLowerCase());
        const update = (current, from, to, next) => {
            const text = next.state.sliceDoc(from, to);
            return stillValid(text, from, to, next.state) ? { ...current, from, options: shown(text) } : null;
        };
        return { ...result, validFor: undefined, update, options: shown(context.state.sliceDoc(result.from, context.pos)) };
    };
}

// lang-sql's answers, only where it read what was typed. It reads a name only from an ASCII letter
// or digit on, so in "__pr" or "üb" it would complete the end of the word and splice a name onto
// the rest ("__products"), and after a name it cannot read and a dot ("café.", "_a.") it offers the
// tables. A quote typed right after a closing quote doubles a quote inside a name ("a""), but
// lang-sql takes it for the start of a new name. Those answers are dropped: the editor's own sources
// offer such names (the columns' source) and their columns (the qualified source).
function readSoundly(source) {
    return (context) => {
        const result = source(context);
        if (!result) {
            return result;
        }
        const before = context.state.sliceDoc(Math.max(0, result.from - 1), result.from);
        if (WORD.test(before)) {
            return null;
        }
        if (before === ".") {
            const qualifier = nameBefore(context.state, result.from - 1);
            if (qualifier && !qualifier.readable) {
                return null;
            }
        }
        const first = context.state.sliceDoc(result.from, result.from + 1);
        if ((first === '"' || first === "`") && before === first) {
            return null;
        }
        return result;
    };
}

// After an opening quote lang-sql offers each name in quotes, as typed, but does not double a quote
// that is part of the name ("q"uote" for the table q"uote), which SQLite cannot read: the inserted
// text doubles it (the label stays as shown).
function quotedRight(source) {
    return (context) => {
        const result = source(context);
        if (!result) {
            return result;
        }
        const quote = context.state.sliceDoc(result.from, result.from + 1);
        if (quote !== '"' && quote !== "`") {
            return result;
        }
        const options = result.options.map((option) => {
            const name = option.label.startsWith(quote) && option.label.endsWith(quote) ? option.label.slice(1, -1) : null;
            return name && name.includes(quote) ? { ...option, apply: quote + name.replaceAll(quote, quote + quote) + quote } : option;
        });
        return { ...result, options };
    };
}

export function createCodeEditor(cm, host, { doc = "", anchor = 0, head = anchor, schema = [] } = {}) {
    const dialect = cm.SQLDialect.define({
        ...cm.SQLite.spec,
        keywords: SQLITE_KEYWORDS,
        builtin: SQLITE_FUNCTIONS,
        // a name that has to be quoted is completed in double quotes, as SQL writes it
        identifierQuotes: '"`',
        // SQLite compares names without case, so Products needs no quotes
        caseInsensitiveIdentifiers: true,
    });
    const functionNames = new Set(SQLITE_FUNCTIONS.split(" "));
    const typeNames = new Set(cm.SQLite.spec.types.split(" "));
    const keywordNames = SQLITE_KEYWORDS.split(" ");

    // keywords, types and functions, in capitals, after any name of the database
    const wordOptions = [
        ...keywordNames.filter((word) => !functionNames.has(word)).map((word) => ({ label: word.toUpperCase(), type: "keyword", boost: -1 })),
        ...[...typeNames]
            .filter((word) => word && !functionNames.has(word) && !keywordNames.includes(word))
            .map((word) => ({ label: word.toUpperCase(), type: "type", detail: COMPLETION_TYPE, boost: -1 })),
        ...[...functionNames].map((word) => ({ label: word.toUpperCase(), type: "function", detail: COMPLETION_FUNCTION, boost: -1 })),
    ];
    // a word as SQLite reads it, matched in full, so a keyword is never offered for (and spliced
    // onto) the end of a word such as "über"; never after "table." (only that table's columns)
    const wordSource = withoutTyped(
        cm.ifNotIn(NO_COMPLETION_IN, (context) => {
            const word = context.matchBefore(WORD);
            if (!word && !context.explicit) {
                return null;
            }
            const from = word ? word.from : context.pos;
            if (context.state.sliceDoc(from - 1, from) === ".") {
                return null;
            }
            return { from, options: wordOptions, validFor: WORD_ONLY };
        })
    );

    function completionFor(objects) {
        // lang-sql's source offers the tables, but cannot read a name that starts with _ or a letter
        // outside ASCII (_tmp, über, 日本): those are offered with the columns, typed on their own
        const unread = objects
            .filter((object) => !/^[A-Za-z0-9]/.test(object.name))
            .map((object) => nameOption(object.name, "type", object.type === "view" ? COMPLETION_VIEW : COMPLETION_TABLE, 0));
        const columns = [...unread, ...columnOptionsOf(objects)];
        // a column typed on its own (after "table." lang-sql's source, or the qualified one, offers
        // that table's)
        const columnSource = withoutTyped(
            cm.ifNotIn(NO_COMPLETION_IN, (context) => {
                const word = context.matchBefore(WORD);
                if (!word && !context.explicit) {
                    return null;
                }
                const from = word ? word.from : context.pos;
                const before = context.state.sliceDoc(from - 1, from);
                if (before === "." || before === '"' || before === "`" || !columns.length) {
                    return null;
                }
                return { from, options: columns, validFor: WORD_ONLY };
            })
        );
        // after a name lang-sql cannot read and a dot (café., _a., "a""b".): that table's or
        // view's columns (an alias of such a table is not followed: no list)
        const qualifiedSource = withoutTyped(
            cm.ifNotIn(["QuotedIdentifier", "String", "LineComment", "BlockComment"], (context) => {
                const word = context.matchBefore(WORD);
                const from = word ? word.from : context.pos;
                if (context.state.sliceDoc(from - 1, from) !== ".") {
                    return null;
                }
                const qualifier = nameBefore(context.state, from - 1);
                const name = qualifier && !qualifier.readable ? qualifier.name.toLowerCase() : null;
                const object = name === null ? null : objects.find((candidate) => candidate.name.toLowerCase() === name);
                if (!object) {
                    return null;
                }
                return { from, options: object.columns.map((column) => nameOption(column.name, "property", column.type, 0)), validFor: WORD_ONLY };
            })
        );
        // Nothing is highlighted when the list opens, so Enter is a new line until the student
        // picks a name with the arrow keys (or the pointer): a line ending in an alias ("FROM
        // orders o") would otherwise have it replaced by the first name. Only names that start
        // with what was typed are offered.
        return cm.autocompletion({
            override: [
                withoutTyped(readSoundly(quotedRight(cm.schemaCompletionSource({ dialect, schema: namespaceOf(objects) })))),
                qualifiedSource,
                columnSource,
                wordSource,
            ],
            icons: false,
            maxRenderedOptions: 50,
            selectOnOpen: false,
            filterStrict: true,
        });
    }

    // Escape, then Tab: the Tab is left to the browser (set by the keydown handler, read by Tab)
    let leaving = false;
    // the list of names is open (for the screen reader's word when it opens)
    let listShown = false;

    function fireExecute(view) {
        cm.closeCompletion(view);
        host.dispatchEvent(new CustomEvent("execute", { detail: host.query }));
    }

    // Tab indents, list or no list (the plan's "Tab indents"); Enter takes a picked name
    function tab(view) {
        if (leaving) {
            return false;
        }
        if (view.state.selection.main.empty) {
            view.dispatch({ ...view.state.replaceSelection(INDENT), scrollIntoView: true, userEvent: "input" });
            return true;
        }
        return cm.indentMore(view);
    }

    function shiftTab(view) {
        return leaving ? false : cm.indentLess(view);
    }

    const handlers = cm.Prec.highest(
        cm.EditorView.domEventHandlers({
            keydown(event, view) {
                leaving = leavesEditor(host, event);
                // as the plain box: Ctrl or Cmd with Enter, whatever else is held
                if ((event.ctrlKey || event.metaKey) && (event.keyCode === 10 || event.keyCode === 13)) {
                    fireExecute(view);
                    return true;
                }
                return false;
            },
            blur(event, view) {
                leaving = false;
                cancelLeave(host);
                // CodeMirror's own Escape-then-Tab (two seconds long) must not outlive the visit
                // either: an Escape before the focus left would otherwise let the next Tab out
                view.setTabFocusMode(false);
            },
            // a press in the editor after Escape: the student goes on editing, so Tab indents again
            pointerdown(event, view) {
                leaving = false;
                cancelLeave(host);
                view.setTabFocusMode(false);
                return false;
            },
            // a file is never read into the editor (nor opened by the browser in the tab)
            drop(event) {
                dragging = false;
                return carriesFiles(event.dataTransfer);
            },
            dragstart() {
                dragging = true;
                return false;
            },
            dragend() {
                dragging = false;
                return false;
            },
        })
    );

    // A drag that starts in the editor is CodeMirror's own move until its dragend. A browser sends
    // no pointer or key events while a drag is going on, so one that comes first means the drag
    // ended without a dragend reaching the editor (the dragged text was redrawn under it, say).
    // CodeMirror is then told the drag ended, as the plain box's guard does (js/lab/plain-text.js):
    // otherwise it would take the next drop from elsewhere for that move and delete the text the
    // student had dragged.
    let dragging = false;
    const endStaleDrag = () => {
        if (dragging) {
            dragging = false;
            view.contentDOM.dispatchEvent(new DragEvent("dragend", { bubbles: true }));
        }
    };
    for (const type of ["pointerdown", "pointermove", "keydown"]) {
        document.addEventListener(type, endStaleDrag, { capture: true, passive: true });
    }

    const completion = new cm.Compartment();
    let objects = schema;

    const highlighter = cm.tagHighlighter([
        { tag: [cm.tags.keyword, cm.tags.typeName, cm.tags.bool, cm.tags.null], class: "sql-keyword" },
        { tag: cm.tags.standard(cm.tags.name), class: "sql-function" },
        { tag: cm.tags.string, class: "sql-string" },
        // "name" (QuotedIdentifier, a special string to lang-sql) is a name: ink, not the string colour
        { tag: cm.tags.special(cm.tags.string), class: "sql-quoted-name" },
        { tag: cm.tags.number, class: "sql-number" },
        { tag: cm.tags.comment, class: "sql-comment" },
    ]);

    function extensions() {
        return [
            handlers,
            cm.Prec.highest(cm.keymap.of([{ key: "Tab", run: tab, shift: shiftTab }])),
            cm.lineNumbers(),
            cm.highlightActiveLineGutter(),
            cm.highlightSpecialChars(),
            cm.history(),
            cm.drawSelection(),
            cm.dropCursor(),
            cm.indentUnit.of(INDENT),
            cm.EditorState.tabSize.of(INDENT.length),
            cm.sql({ dialect }),
            cm.syntaxHighlighting(highlighter),
            cm.bracketMatching(),
            cm.highlightActiveLine(),
            cm.placeholder(EDITOR_PLACEHOLDER),
            completion.of(completionFor(objects)),
            // Escape is not bound: CodeMirror's default (simplifySelection) would collapse the
            // selection, and Escape is the first key of the way out to Run, which runs the selection
            // CodeMirror's Mod-U (undo the last change or selection) and its Alt-U pair are left
            // out: Ctrl/Cmd+U is the page's "Open from URL…", and with them the key also undid the
            // student's last edit
            cm.keymap.of([
                ...cm.defaultKeymap.filter((binding) => binding.key !== "Escape"),
                ...cm.historyKeymap.filter((binding) => binding.key !== "Mod-u" && binding.key !== "Alt-u"),
            ]),
            // while text is selected the caret's line is not tinted: the tint would cover the
            // selection, which CodeMirror draws under the text
            cm.EditorView.editorAttributes.of((view) => (view.state.selection.ranges.some((range) => !range.empty) ? { class: "sql-selecting" } : null)),
            // tabindex changes nothing for the keyboard (the content is editable, so a Tab stop
            // already); it tells accessibility checkers that the scrolling pane holds one
            cm.EditorView.contentAttributes.of({ "aria-label": EDITOR_LABEL, "aria-describedby": EDITOR_HINT_ID, tabindex: "0" }),
            cm.EditorView.updateListener.of((update) => {
                // the "input" event of the plain box: after the change is in the state (a
                // listener reads host.value), and outside CodeMirror's update
                if (update.docChanged) {
                    queueMicrotask(() => host.dispatchEvent(new Event("input", { bubbles: true })));
                }
                // nothing is picked when the list opens, so nothing would tell a screen reader it
                // is there: CodeMirror's live region says so, once each time it opens (a list that
                // waits for a fresh answer while it is open has not opened again)
                const status = cm.completionStatus(update.state);
                if (status === "active" && !listShown) {
                    listShown = true;
                    const count = cm.currentCompletions(update.state).length;
                    queueMicrotask(() => update.view.dispatch({ effects: cm.EditorView.announce.of(completionsOpenedText(count)) }));
                } else if (status === null) {
                    listShown = false;
                }
            }),
        ];
    }

    function stateFor(text, selection) {
        return cm.EditorState.create({ doc: text, selection, extensions: extensions() });
    }

    // drawn outside the page: the caller puts view.dom in the host once nothing has failed
    const view = new cm.EditorView({
        state: stateFor(doc, { anchor: Math.min(anchor, doc.length), head: Math.min(head, doc.length) }),
    });
    // The browser's own "input" events from the content element would reach the host before
    // CodeMirror has read the change; the host gets the one fired above instead.
    view.contentDOM.addEventListener("input", (event) => event.stopPropagation());

    // the page's selection is in the editor (a selection made elsewhere, in a prompt or a result
    // cell, is not the SQL to run)
    function selectionInside() {
        if (view.hasFocus) {
            return true;
        }
        const selection = window.getSelection();
        if (!selection || selection.rangeCount === 0) {
            return false;
        }
        const range = selection.getRangeAt(0);
        return view.contentDOM.contains(range.startContainer) && view.contentDOM.contains(range.endContainer);
    }

    return {
        view,

        get value() {
            return view.state.doc.toString();
        },

        set value(text) {
            view.setState(stateFor(String(text ?? ""), { anchor: 0 }));
            listShown = false;
        },

        selectedText() {
            const { from, to } = view.state.selection.main;
            return from === to || !selectionInside() ? "" : view.state.sliceDoc(from, to);
        },

        caretToEnd() {
            view.focus();
            view.dispatch({ selection: { anchor: view.state.doc.length }, scrollIntoView: true });
        },

        // atCaret false: the text goes after the last character (the student has not chosen a
        // place since the app last set the text). A space is added on either side where the
        // neighbouring text would otherwise run into it; the caret ends right after the text.
        insert(text, { atCaret = true, spaceBefore, spaceAfter } = {}) {
            const state = view.state;
            const range = atCaret ? state.selection.main : { from: state.doc.length, to: state.doc.length };
            const before = state.sliceDoc(Math.max(0, range.from - 1), range.from);
            const after = state.sliceDoc(range.to, range.to + 1);
            const lead = before && !spaceBefore.test(before) ? " " : "";
            const trail = after && !spaceAfter.test(after) ? " " : "";
            view.focus();
            view.dispatch({
                changes: { from: range.from, to: range.to, insert: lead + text + trail },
                selection: { anchor: range.from + lead.length + text.length },
                scrollIntoView: true,
                userEvent: "input",
            });
        },

        // The student chose this text (a sample query): it replaces the document as an edit of
        // their own, which Ctrl/Cmd+Z takes back, not as the app's (value, which starts afresh).
        fill(text) {
            const insert = String(text ?? "");
            view.focus();
            view.dispatch({
                changes: { from: 0, to: view.state.doc.length, insert },
                selection: { anchor: insert.length },
                scrollIntoView: true,
                userEvent: "input",
            });
        },

        setSchema(next) {
            objects = next;
            view.dispatch({ effects: completion.reconfigure(completionFor(objects)) });
        },
    };
}
