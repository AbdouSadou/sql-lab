// Reading a delimited text file (assessment plan, section 3): the preview's reading of the
// start of a file, the reading of a whole file a piece at a time, and the turning of rows into a
// table's columns. No DOM, no storage, no engine. The CSV library, Papa Parse, is handed in (the
// page loads it on demand, js/lab/vendor-loader.js), and the text comes from
// js/lab/import-text.js.
//
//   DELIMITERS            the four a file may use, each with a plain name (the dialog shows its
//                         own words for them, IMPORT_DELIMITER_NAMES)
//   readStart(Papa, text, {whole, delimiter?}) -> {rows, delimiter, newline, guessed}
//       The preview: the start of the file read as one text. With no delimiter given, Papa
//       guesses among the four (it needs about two fields a row over the first ten rows); when
//       it cannot tell, the delimiter is comma, which is a normal result (guessed is then
//       false). newline is the line ending of the text ("\r\n", "\n" or "\r"), found here and
//       not by Papa (lineEnding, below). When the text is not the whole file, its last row may
//       be cut short, and is left out: no rows then means that the text does not hold one
//       complete row. (A row that ends exactly where the text was cut is left out as well:
//       nothing here can tell that it is whole.) A carriage return at the very end of such a
//       text may be the first half of a pair, and is not counted for the line ending.
//   lineEnding(text, delimiters) -> "\r\n", "\n" or "\r"
//       The line ending of a text whose fields are separated by one of `delimiters`. Papa's own
//       rule (a line feed when one comes before the first carriage return, or when there is no
//       carriage return at all; else the pair, when a line feed follows more than half of the
//       carriage returns; else the carriage return), applied to what is outside the quoted
//       fields, with the quotes read as the reader reads them: a quote opens a quoted field
//       only at the start of a field, and the field ends at a quote that the end of a field
//       follows (white space of any kind may stand between the two: all that String.trim takes
//       off). Papa's own guess pairs every quote with the next one instead, so one quote
//       that is not part of a pair (an inch mark in a heading) puts every pair after it out of
//       step: the breaks between rows are then thrown away, a Windows file is read with "\n"
//       alone, and every row keeps a carriage return at its end.
//   readPieces(Papa, pieces, {delimiter, newline, onRows}) -> Promise<{badQuotes}>
//       The import: `pieces` is an async iterator of strings (textPieces). Papa takes them
//       through its stream input and joins a row split between two pieces. onRows(rows) is
//       called for each piece, with the rows it completed, before the next piece is asked for;
//       what it throws stops the reading and is thrown from here. The settings are the ones the
//       preview settled: Papa does not guess again. badQuotes: a quote that could not be
//       paired, after which everything may have been read as one field. It is taken from the
//       rows that have ended only: what Papa says of a row that a piece cut short it says
//       again, if it still holds, when the row is whole (the last row of the file ends where
//       the text does).
//   newTableReader({hasNames, namesRow}) -> {take(rows), finish()}
//       Rows are counted as the preview shows them (after empty lines are skipped). With
//       hasNames, the rows above row namesRow are left out, that row gives the column names, and
//       the rows below it are the data; without, every row is data. take(rows) returns the data
//       rows among them, each field as it is stored for now: its text, or null for an empty
//       field. finish() -> {rows, columns: [{name, original, type, blanks, blocking}]}:
//       the table is as wide as its widest row (rule 7), each column typed from all of its
//       values (rule 8); blanks counts its NULLs, the ones that pad a short row included.
//   ImportRefused         what take and finish throw, with a `reason`: "too-wide" (a row of
//                         more than MAX_COLUMNS fields: refused as soon as it is met, rule 10),
//                         "no-names-row" (the file ends before the row said to hold the names),
//                         "empty" (nothing to make a table from)
//
// Every field stays text here. Empty lines are skipped wherever they are; a line of delimiters
// only is a row of NULLs (rule 9); a field of spaces is not empty (rule 5).

import { blockingValue, columnNames, columnType, newTally, tallyValue } from "./import-rules.js";

export const DELIMITERS = [
    { value: ",", name: "comma" },
    { value: ";", name: "semicolon" },
    { value: "\t", name: "tab" },
    { value: "|", name: "pipe" },
];

// SQLite's own limit on the columns of a table
export const MAX_COLUMNS = 2000;

export class ImportRefused extends Error {
    constructor(reason) {
        super(`import refused: ${reason}`);
        this.name = "ImportRefused";
        this.reason = reason;
    }
}

const QUOTE_ERRORS = new Set(["InvalidQuotes", "MissingQuotes"]);

// what every reading asks of Papa: rows as lists, every field text, empty lines skipped (not
// "greedy", which would also drop a line of spaces)
const settings = (delimiter, newline) => ({ delimiter, newline, skipEmptyLines: true, header: false, dynamicTyping: false });

const QUOTE = '"';
const BYTE_ORDER_MARK = 0xfeff;
// what String.trim takes off: Papa lets any of it stand between a closing quote and the end of
// the field (a no-break space, a form feed), not the space and the tab alone
const WHITE_SPACE = /\s/;

// the place of the quote that closes the quoted field opened at `open`, or -1 for none
function closingQuote(text, open, endsField) {
    let at = open;
    for (;;) {
        at = text.indexOf(QUOTE, at + 1);
        if (at === -1) {
            return -1;
        }
        if (text[at + 1] === QUOTE) {
            // a doubled quote is a quote inside the field
            at++;
            continue;
        }
        // the end of the field follows the quote that closes it; white space may stand between
        let next = at + 1;
        while (next < text.length && !endsField(text[next]) && WHITE_SPACE.test(text[next])) {
            next++;
        }
        // (At the end of the text Papa wants the quote to be the last character: white space
        // after it leaves the field open. Nothing follows that could be a line break, so the
        // two are not told apart here.)
        if (next >= text.length || endsField(text[next])) {
            return at;
        }
        // (any other quote is part of the field, as the reader takes it)
    }
}

// the text without its quoted fields
function outsideQuotes(text, delimiters) {
    const endsField = (character) => character === "\n" || character === "\r" || delimiters.includes(character);
    let outside = "";
    let from = 0;
    let quote = text.indexOf(QUOTE);
    while (quote !== -1) {
        if (quote !== 0 && !endsField(text[quote - 1])) {
            // not at the start of a field: a character like any other
            quote = text.indexOf(QUOTE, quote + 1);
            continue;
        }
        outside += text.slice(from, quote);
        const close = closingQuote(text, quote, endsField);
        if (close === -1) {
            // never closed: the rest of the text is that one field
            return outside;
        }
        from = close + 1;
        quote = text.indexOf(QUOTE, from);
    }
    return outside + text.slice(from);
}

export function lineEnding(text, delimiters) {
    const outside = outsideQuotes(text, delimiters);
    const firstReturn = outside.indexOf("\r");
    const firstFeed = outside.indexOf("\n");
    if (firstReturn === -1 || (firstFeed !== -1 && firstFeed < firstReturn)) {
        return "\n";
    }
    let returns = 0;
    let pairs = 0;
    for (let at = firstReturn; at !== -1; at = outside.indexOf("\r", at + 1)) {
        returns++;
        if (outside[at + 1] === "\n") {
            pairs++;
        }
    }
    return pairs >= (returns + 1) / 2 ? "\r\n" : "\r";
}

export function readStart(Papa, text, { whole = true, delimiter = "" } = {}) {
    const candidates = DELIMITERS.map((d) => d.value);
    // Papa takes one U+FEFF off the front of a text it is given whole, and none off the pieces
    // of the import (the file's own byte-order mark is gone by now: a second one is text). With
    // one more in front, what it reads here is the text itself.
    const given = text.charCodeAt(0) === BYTE_ORDER_MARK ? `\ufeff${text}` : text;
    const read = (newline, separator) => Papa.parse(given, { ...settings(separator, newline), delimitersToGuess: candidates });
    // A carriage return at the very end of a text that is not whole may be the first half of a
    // pair. Counted, it could turn a Windows file whose first megabyte holds one or two line
    // breaks into a file of carriage returns alone.
    const counted = !whole && text.endsWith("\r") ? text.slice(0, -1) : text;
    let newline = lineEnding(counted, delimiter === "" ? candidates : [delimiter]);
    let result = read(newline, delimiter);
    const guessed = delimiter === "" && !result.errors.some((error) => error.code === "UndetectableDelimiter");
    if (delimiter === "") {
        // The line ending was found with any of the four taken for a delimiter. With the one
        // that is used it can differ (a quote after one of the other three opens no field): the
        // answer is then the one the student gets by choosing that delimiter by hand.
        const settled = lineEnding(counted, [result.meta.delimiter]);
        if (settled !== newline) {
            newline = settled;
            result = read(newline, result.meta.delimiter);
        }
    }
    const rows = result.data;
    if (!whole && rows.length) {
        rows.pop();
    }
    return { rows, delimiter: result.meta.delimiter, newline, guessed };
}

export async function readPieces(Papa, pieces, { delimiter, newline, onRows }) {
    // Papa's stream input: an object it listens to. The pieces are handed over one at a time,
    // each as a "data" event, and Papa has read a piece (and called `chunk`) when the call
    // returns.
    const listeners = {};
    const input = {
        readable: true,
        read() {},
        pause() {},
        resume() {},
        on: (type, listener) => (listeners[type] = listener),
        removeListener: (type, listener) => listeners[type] === listener && delete listeners[type],
    };
    let badQuotes = false;
    let failure = null;
    // where, in the whole text, the reading Papa reports on began
    let began = 0;
    Papa.parse(input, {
        ...settings(delimiter, newline),
        chunk(results) {
            // Papa reads the row a piece cut short again with the next piece, and says again
            // what is wrong with it: only what it says of the rows that ended here counts (a
            // closing quote with a space after it, at the end of a piece, is no error once
            // the delimiter behind the space has come). An error's place is counted from where
            // this reading began; the cursor is where the rows that ended stop, in the whole.
            // The place Papa gives is the one after the quote that opens the field: past the
            // cursor when a piece cut the row short, and never past it when the row has ended
            // (at it, when that quote is the last character of the file: the cursor is then
            // the end of the text).
            const ended = results.meta.cursor - began;
            badQuotes ||= results.errors.some((error) => QUOTE_ERRORS.has(error.code) && error.index <= ended);
            began = results.meta.cursor;
            onRows(results.data);
        },
        // (what onRows throws comes back through here: Papa catches it)
        error: (error) => (failure = error),
    });
    const send = (type, piece) => {
        listeners[type]?.(piece);
        if (failure) {
            throw failure;
        }
    };
    for await (const piece of pieces) {
        send("data", piece);
    }
    send("end");
    return { badQuotes };
}

export function newTableReader({ hasNames, namesRow = 1 }) {
    let seen = 0;
    let names = hasNames ? undefined : null;
    let width = 0;
    let rows = 0;
    const tallies = [];
    const checkWidth = (row) => {
        if (row.length > MAX_COLUMNS) {
            throw new ImportRefused("too-wide");
        }
    };
    return {
        take(read) {
            const data = [];
            for (const row of read) {
                seen++;
                checkWidth(row);
                if (hasNames && seen <= namesRow) {
                    if (seen === namesRow) {
                        names = row;
                    }
                    continue;
                }
                const values = row.map((field) => (field === "" ? null : field));
                values.forEach((value, i) => tallyValue((tallies[i] ??= newTally()), value));
                width = Math.max(width, values.length);
                rows++;
                data.push(values);
            }
            return data;
        },
        finish() {
            if (names === undefined) {
                throw new ImportRefused(seen === 0 ? "empty" : "no-names-row");
            }
            const columns = columnNames(names, Math.max(width, names?.length ?? 0));
            if (!columns.length) {
                throw new ImportRefused("empty");
            }
            return {
                rows,
                columns: columns.map(({ name, original }, i) => {
                    const tally = tallies[i] ?? newTally();
                    return {
                        name,
                        original,
                        type: columnType(tally),
                        blanks: tally.empty + (rows - tally.values),
                        blocking: blockingValue(tally),
                    };
                }),
            };
        },
    };
}
