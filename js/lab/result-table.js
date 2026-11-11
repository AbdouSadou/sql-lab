// The result table (UI plan, section 3: "the one bold element"), built with createElement and
// textContent: every column name and value comes from SQL or the database.
//
//   buildResultTable({columns, values}, {popover}) -> <table class="result-table">
//       values are the rows to show (the caller cuts them at ROW_LIMIT). A column whose shown
//       values are all numbers (NULLs aside) is a number column: its cells and its heading are
//       right-aligned (class "num"; css/result.css sets tabular figures for the whole table). NULL
//       reads NULL in graphite italics (class "cell-null"); an empty string stays an empty cell. A
//       value longer than CELL_MAX_CHARS characters shows its first CELL_MAX_CHARS and an ellipsis,
//       in a button that opens `popover` with the whole value. Characters are what a reader counts
//       (grapheme clusters, with Intl.Segmenter: a flag, an emoji with a skin tone or a family, a
//       letter with its accent are one each and are never cut apart); code points where the
//       browser has no Segmenter.
//   mountCellPopover(popover) -> {}
//       Fills and places the popover for the button that opens it: the column name, the row
//       number, the length and the whole value (selectable; the popover scrolls when it is long).
//       Escape, a press outside, or the focus moving on close it, and the focus goes back to the
//       cell.
//
// The header is sticky (css/result.css), so the column names stay in view while the rows scroll
// under them. Column names are shown exactly as the query returned them, duplicates included.

import { CELL_MAX_CHARS, CELL_MORE_HINT, NULL_TEXT, STATEMENT_ELLIPSIS, cellPopoverLength, cellPopoverTitle } from "./config.js";
import { cellText } from "./cell-text.js";
import { placePopover } from "./menu.js";

// what each long cell's button shows in full: {text, column, row}
const fullValues = new WeakMap();

const segmenter = typeof Intl === "object" && typeof Intl.Segmenter === "function" ? new Intl.Segmenter(undefined, { granularity: "grapheme" }) : null;

// at most this many UTF-16 units are shown for a long value, however few characters they make: a
// character of thousands of combining marks, or a chain of emoji joined by thousands of ZWJs, is
// one grapheme cluster, and the cut must still hold
const MAX_SHOWN_UNITS = 16 * CELL_MAX_CHARS;

// text cut at `units` UTF-16 units, never between the two halves of a surrogate pair
function unitsOf(text, units) {
    const code = text.charCodeAt(units - 1);
    return text.slice(0, code >= 0xd800 && code <= 0xdbff ? units - 1 : units);
}

// the first `count` characters of text, and whether there are more (characters as above); only as
// much of the text is walked as it takes. A cluster that would take the cut past MAX_SHOWN_UNITS
// is cut inside (absurd text only).
function firstCharacters(text, count) {
    if (!segmenter) {
        const points = Array.from(text);
        const head = points.slice(0, count).join("");
        return head.length > MAX_SHOWN_UNITS ? { head: unitsOf(head, MAX_SHOWN_UNITS), more: true } : { head, more: points.length > count };
    }
    let taken = 0;
    let end = 0;
    for (const { segment } of segmenter.segment(text)) {
        if (taken === count) {
            return { head: text.slice(0, end), more: true };
        }
        if (end + segment.length > MAX_SHOWN_UNITS) {
            return { head: unitsOf(text, MAX_SHOWN_UNITS), more: true };
        }
        taken += 1;
        end += segment.length;
    }
    return { head: text, more: false };
}

// how many characters text has (for the popover; counted when it opens)
function characterCount(text) {
    if (!segmenter) {
        return Array.from(text).length;
    }
    let count = 0;
    for (const _ of segmenter.segment(text)) {
        count += 1;
    }
    return count;
}

function isNumber(value) {
    return typeof value === "number" || typeof value === "bigint";
}

// a column is numeric when it holds at least one number and nothing but numbers and NULLs
function numericColumns(columns, values) {
    return columns.map((_, index) => {
        let numbers = 0;
        for (const row of values) {
            const value = row[index];
            if (value === null || value === undefined) {
                continue;
            }
            if (!isNumber(value)) {
                return false;
            }
            numbers++;
        }
        return numbers > 0;
    });
}

function cell(tag, numeric) {
    const node = document.createElement(tag);
    if (numeric) {
        node.className = "num";
    }
    return node;
}

export function buildResultTable({ columns, values }, { popover = null } = {}) {
    const numeric = numericColumns(columns, values);
    const table = document.createElement("table");
    table.className = values.length ? "result-table" : "result-table result-table--empty";

    const head = document.createElement("thead");
    const headRow = document.createElement("tr");
    columns.forEach((name, index) => {
        const th = cell("th", numeric[index]);
        th.scope = "col";
        th.textContent = name;
        headRow.append(th);
    });
    head.append(headRow);

    const body = document.createElement("tbody");
    values.forEach((row, rowIndex) => {
        const tr = document.createElement("tr");
        columns.forEach((name, index) => {
            const td = cell("td", numeric[index]);
            const value = row[index];
            if (value === null || value === undefined) {
                const mark = document.createElement("span");
                mark.className = "cell-null";
                mark.textContent = NULL_TEXT;
                td.append(mark);
            } else {
                const text = cellText(value);
                // (a text of at most CELL_MAX_CHARS UTF-16 units cannot have more characters)
                const cut = popover && text.length > CELL_MAX_CHARS ? firstCharacters(text, CELL_MAX_CHARS) : null;
                if (cut?.more) {
                    td.append(longCell(cut.head, text, name, rowIndex + 1, popover));
                } else {
                    td.textContent = text;
                }
            }
            tr.append(td);
        });
        body.append(tr);
    });

    table.append(head, body);
    return table;
}

function longCell(head, text, column, row, popover) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "cell-more";
    button.textContent = head + STATEMENT_ELLIPSIS;
    button.setAttribute("popovertarget", popover.id);
    button.setAttribute("aria-expanded", "false");
    button.setAttribute("aria-describedby", `${popover.id}-hint`);
    fullValues.set(button, { text, column, row });
    return button;
}

// mountCellPopover sets up the one popover every long cell opens. Its hint (the buttons'
// description) is a visually hidden sibling with the id "<popover id>-hint".
export function mountCellPopover(popover) {
    if (typeof popover.showPopover !== "function") {
        return {};
    }
    const title = popover.querySelector(".cell-popover-title");
    const length = popover.querySelector(".cell-popover-length");
    const value = popover.querySelector(".cell-popover-value");
    const hint = document.getElementById(`${popover.id}-hint`);
    if (hint) {
        hint.textContent = CELL_MORE_HINT;
    }
    // the cell whose value is shown
    let source = null;

    function fill(button) {
        const full = fullValues.get(button);
        if (!full) {
            return false;
        }
        source = button;
        title.textContent = cellPopoverTitle(full.column, full.row);
        length.textContent = cellPopoverLength(characterCount(full.text));
        value.textContent = full.text;
        popover.scrollTop = 0;
        return true;
    }

    // A press on a long cell: its value goes in before the browser opens the popover. While the
    // popover shows another cell's value, the press shows this one instead of closing it.
    document.addEventListener("click", (event) => {
        const button = event.target instanceof Element ? event.target.closest("button.cell-more") : null;
        if (!button || button.getAttribute("popovertarget") !== popover.id) {
            return;
        }
        const open = popover.matches(":popover-open");
        if (open && source !== button) {
            event.preventDefault();
            source?.setAttribute("aria-expanded", "false");
            if (fill(button)) {
                button.setAttribute("aria-expanded", "true");
                placePopover(popover, button);
                popover.focus({ preventScroll: true });
            }
            return;
        }
        if (!open) {
            fill(button);
        }
    });
    popover.addEventListener("beforetoggle", (event) => {
        if (source) {
            source.setAttribute("aria-expanded", String(event.newState === "open"));
        }
        if (event.newState === "open" && source) {
            placePopover(popover, source);
        }
    });
    popover.addEventListener("toggle", (event) => {
        if (event.newState === "open" && popover.matches(":popover-open")) {
            if (source) {
                placePopover(popover, source);
            }
            popover.focus({ preventScroll: true });
            return;
        }
        // closed: the focus goes back to the cell when it was in the popover or nowhere (Escape, a
        // press on the cell itself); a press elsewhere keeps the focus where the student put it.
        // The value goes (it can be megabytes); a press on a cell fills it again.
        const focused = document.activeElement;
        if (source?.isConnected && (!focused || focused === document.body || popover.contains(focused))) {
            source.focus({ preventScroll: true });
        }
        if (event.newState === "closed") {
            value.textContent = "";
        }
    });
    // It stays with its cell: placed again (once a frame at most) when anything scrolls (the page,
    // the result box), the window changes size, or the result's box does (a note appearing under
    // it, fonts arriving); a placement made from a layout that was still settling would otherwise
    // stay where the cell no longer is.
    let frame = 0;
    function follow() {
        if (frame) {
            return;
        }
        frame = requestAnimationFrame(() => {
            frame = 0;
            if (popover.matches(":popover-open") && source?.isConnected) {
                placePopover(popover, source);
            }
        });
    }
    window.addEventListener("scroll", follow, { capture: true, passive: true });
    window.addEventListener("resize", follow);
    if (typeof ResizeObserver === "function") {
        const result = document.getElementById("result");
        if (result) {
            new ResizeObserver(follow).observe(result);
        }
    }
    popover.addEventListener("toggle", (event) => {
        if (event.newState === "open") {
            follow();
        }
    });

    // like Help, it closes when the focus moves on out of it
    popover.addEventListener("focusout", (event) => {
        if (popover.matches(":popover-open") && event.relatedTarget && !popover.contains(event.relatedTarget) && event.relatedTarget !== source) {
            popover.hidePopover();
        }
    });
    // a new result (or anything else) replaced the table: a popover about a cell that is gone closes,
    // and lets go of the value it showed (it can be megabytes)
    return {
        close() {
            if (popover.matches(":popover-open")) {
                popover.hidePopover();
            }
            source = null;
            title.textContent = "";
            length.textContent = "";
            value.textContent = "";
        },
    };
}
