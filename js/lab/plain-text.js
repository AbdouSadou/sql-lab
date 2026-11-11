// Only text/plain may enter the SQL editor, and no file dropped on the page is opened by the
// browser in its place.
//
// A contenteditable element takes whatever a paste or a drop carries, markup included:
// an <img src="https://..."> makes the page request that URL, an <iframe> or a <form> becomes
// part of the page. So paste and drop are handled here and nothing but the text/plain
// representation is inserted, with execCommand("insertText") so that the browser's undo and
// the element's own input handling (the editor's "start" event, say) work as for typing.
//
// mountPlainText(element) -> unmount()
//   paste   Cancelled; the clipboard's text/plain goes in at the caret. Skipped when the
//           element's own paste handler has already dealt with the event (the SQL editor's
//           does, and its behaviour is unchanged).
//   drop    Cancelled. A drop that carries files inserts nothing and does not let the browser
//           open the file in the tab. Otherwise the text/plain goes in at the drop point
//           (caretRangeFromPoint, or caretPositionFromPoint in Firefox), the end of the
//           element when the point is not inside it.
//   drag that starts inside the same element: left alone, so the browser moves the text as
//           usual (that content is plain text already). The mark for it ends with the drag
//           (dragend or any drop), and also at the first pointer movement, press or key press
//           anywhere: a browser sends none of those while a drag is going on, so one that
//           arrives means the drag ended without a dragend (the dragged text was replaced
//           under it, say), and the next drop, whatever it carries, is taken over again.
//
// guardFileDrops(target = document): a file dragged over the page and dropped anywhere outside
//   the editor is refused too, so the browser never opens it in the tab and the student's work
//   stays (a file is opened from the database menu). Drops of text are left to the browser
//   (the export dialog's file name takes them natively).
//
// Nothing here is shown or stored by itself; the text is inserted as text, never as markup.

function plainTextOf(dataTransfer) {
    return dataTransfer ? dataTransfer.getData("text/plain") : "";
}

function carriesFiles(dataTransfer) {
    if (!dataTransfer) {
        return false;
    }
    return Array.from(dataTransfer.types || []).includes("Files") || (dataTransfer.files && dataTransfer.files.length > 0);
}

// The collapsed range under a point of the page, or null.
function rangeAt(x, y) {
    if (document.caretPositionFromPoint) {
        const position = document.caretPositionFromPoint(x, y);
        if (position) {
            const range = document.createRange();
            range.setStart(position.offsetNode, position.offset);
            range.collapse(true);
            return range;
        }
    }
    if (document.caretRangeFromPoint) {
        return document.caretRangeFromPoint(x, y);
    }
    return null;
}

function insertText(element, text, range) {
    if (!text) {
        return;
    }
    // HTMLElement's focus: the editor's own focus() selects its text, which would move the caret
    HTMLElement.prototype.focus.call(element);
    const selection = window.getSelection();
    const target = range && element.contains(range.startContainer) ? range : null;
    if (target) {
        selection.removeAllRanges();
        selection.addRange(target);
    } else if (range) {
        const end = document.createRange();
        end.selectNodeContents(element);
        end.collapse(false);
        selection.removeAllRanges();
        selection.addRange(end);
    }
    document.execCommand("insertText", false, text);
}

export function mountPlainText(element) {
    // true from the start of a drag that began inside the element until it ends
    let draggingInside = false;

    const onPaste = (event) => {
        if (event.defaultPrevented) {
            return;
        }
        event.preventDefault();
        insertText(element, plainTextOf(event.clipboardData), null);
    };
    const onDragStart = () => {
        draggingInside = true;
    };
    const endDrag = () => {
        draggingInside = false;
    };
    const onDragOver = (event) => {
        // files: keep the browser from treating the element as a place to open them
        if (carriesFiles(event.dataTransfer)) {
            event.preventDefault();
        }
    };
    const onDrop = (event) => {
        if (draggingInside) {
            draggingInside = false;
            return;
        }
        event.preventDefault();
        if (carriesFiles(event.dataTransfer)) {
            return;
        }
        const text = plainTextOf(event.dataTransfer);
        insertText(element, text, rangeAt(event.clientX, event.clientY));
    };

    element.addEventListener("paste", onPaste);
    element.addEventListener("dragstart", onDragStart);
    element.addEventListener("dragover", onDragOver);
    element.addEventListener("drop", onDrop);
    document.addEventListener("dragend", endDrag, true);
    document.addEventListener("drop", endDrag);
    const lateEvents = ["pointerdown", "pointermove", "keydown"];
    for (const type of lateEvents) {
        document.addEventListener(type, endDrag, { capture: true, passive: true });
    }

    return () => {
        element.removeEventListener("paste", onPaste);
        element.removeEventListener("dragstart", onDragStart);
        element.removeEventListener("dragover", onDragOver);
        element.removeEventListener("drop", onDrop);
        document.removeEventListener("dragend", endDrag, true);
        document.removeEventListener("drop", endDrag);
        for (const type of lateEvents) {
            document.removeEventListener(type, endDrag, { capture: true });
        }
    };
}

export function guardFileDrops(target = document) {
    const refuse = (event) => {
        if (carriesFiles(event.dataTransfer)) {
            event.preventDefault();
        }
    };
    target.addEventListener("dragover", refuse);
    target.addEventListener("drop", refuse);
}
