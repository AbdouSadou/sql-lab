// The engine side of an export of tables (assessment plan, section 5; its Phase 3, flag "export"):
// which tables and views a database has, how many rows each holds, and its rows as VALUES, each
// with its storage class. No DOM, and nothing here knows about CSV: the text of a value is made in
// js/lab/export-csv.js, and a later phase can read the same rows for a workbook.
// `database` is the page's wrapper of a connection (js/sqlite/db.js): database.db is the engine's
// handle, database.capi its C interface, and database.wasm its memory and its bare functions
// (js/sqlite/manager.js puts it there).
//
//   VALUE_KINDS           the engine's own numbers for the storage classes: INTEGER 1, FLOAT 2,
//                         TEXT 3, BLOB 4, NULL 5 (sqlite3_column_type)
//   listObjects(database) -> [{name, kind: "table" | "view"}]
//       The tables and views of the main database whose names do not start with sqlite_, in the
//       order of SQL's own ORDER BY name (by bytes; a sort in JavaScript compares UTF-16 units and
//       would put some names elsewhere). Tables and views are mixed. TEMP objects are not listed,
//       and the tables an attached database holds are not either. A virtual table is listed, and
//       so are the shadow tables its module keeps, as any table is.
//   countRows(database, name) -> number
//       The rows of main."name". Throws what the engine throws (a view can fail to count).
//   openRows(database, name) -> reader
//       A reader over select * from main."name": the schema is named, so that a TEMP table of the
//       same name does not hide the one in the database. It throws what the engine throws when the
//       statement cannot be prepared.
//         reader.columns            the names of the columns, as the engine gives them for
//                                   select *: a view's are its aliases, and where a view names two
//                                   columns alike the engine has already added :1, :2 to the later
//                                   ones (a, a:1). They are the names the results pane shows for
//                                   the same statement, so the two old column-name pragmas change
//                                   them here as they do there (full_column_names on with
//                                   short_column_names off gives t.a). One difference: a name
//                                   that starts with U+FEFF keeps that character here, as every
//                                   text does (below), and the pane's own reader drops it.
//         reader.next({chars, ms})  -> {rows, done}. Takes rows until the first of the two budgets
//                                   is used up, and at least one row unless the table has ended:
//                                   `chars` counts characters of values (a text its length, a BLOB
//                                   twice its bytes, a number 20, a NULL 1), `ms` the time since the
//                                   call began. The row that uses a budget up is still taken, so a
//                                   piece can pass it by one row. A budget left out is not used.
//                                   rows is a list of {kinds, values}, two arrays of the row's
//                                   width. kinds[i] is the engine's number for the storage class,
//                                   asked BEFORE the value is read: a REAL 1.0 and an INTEGER 1 both
//                                   come back as the Number 1. values[i] is what the engine hands
//                                   over: a Number, or a BigInt beyond +-(2^53 - 1), for an INTEGER;
//                                   a Number for a REAL (-0 and the infinities included); a string;
//                                   a Uint8Array of its own (a zero-length BLOB is not null); or
//                                   null. done is true when the table has ended: that call's rows
//                                   are its last, and the reader has already finalized its
//                                   statement (a call after that, or after close(), gives no rows
//                                   and done). Throws what the engine throws when a row cannot be
//                                   read (a view can count and then fail); the reader stays open
//                                   for close().
//         reader.close()            finalizes the statement. May be called at any time and more
//                                   than once, after a failure too. Whoever opens a reader closes
//                                   it, on every path: a statement left open would keep the
//                                   database from being closed.
//
// A text is read here as its bytes (the plan: "text exactly as stored"), and not through the
// engine's own JavaScript reader: that one drops a byte-order mark (U+FEFF) from the start of every
// text it hands over, so a value, a column's name or a table's name that starts with one would come
// out without it, and a table so named could not be found again. A text that is not valid UTF-8
// comes out with U+FFFD for each bad sequence: no text file can hold those bytes as they are. A NUL
// character inside a text is kept. One slow count(*) or one slow step of a heavy view cannot be
// interrupted.

import { quoteIdent } from "./sql.js";

const SQL_NAME_ORDER = "select type, name from main.sqlite_schema where type in ('table', 'view') and name not like 'sqlite\\_%' escape '\\' order by name";

export const VALUE_KINDS = Object.freeze({ INTEGER: 1, FLOAT: 2, TEXT: 3, BLOB: 4, NULL: 5 });

const NUMBER_CHARS = 20;

// (the default decoder would take a leading U+FEFF for a mark of the encoding, and drop it)
const decoder = new TextDecoder("utf-8", { ignoreBOM: true });

// The engine gives no text where it had no memory left to make one: said as the engine says it
// (an error that isEngineError and isOutOfMemory of js/lab/import-db.js both know), so that
// whoever asked can tell it as a lack of memory.
function noMemory() {
    const error = new Error("out of memory");
    error.name = "SQLite3Error";
    error.resultCode = 7;
    return error;
}

// What reads texts out of the engine's memory for one statement: text(i), the TEXT value of column
// i of the row the statement is on, and name(i), the name of column i.
function textReader(database, pointer) {
    const { wasm } = database;
    if (!wasm) {
        throw new TypeError("this database gives no way into the engine's memory");
    }
    const at = (address, length) => {
        const from = Number(address);
        if (!from) {
            throw noMemory();
        }
        const heap = wasm.heap8u();
        // (a decoder takes no view of memory that is shared between threads: a copy then)
        const shared = typeof SharedArrayBuffer !== "undefined" && heap.buffer instanceof SharedArrayBuffer;
        return decoder.decode(shared ? heap.slice(from, from + length) : heap.subarray(from, from + length));
    };
    return {
        // (the text is asked for first: that is when the engine settles its bytes, and their number)
        text(i) {
            const address = wasm.exports.sqlite3_column_text(pointer, i);
            return at(address, wasm.exports.sqlite3_column_bytes(pointer, i));
        },
        name(i) {
            const address = wasm.exports.sqlite3_column_name(pointer, i);
            return at(address, address ? wasm.cstrlen(address) : 0);
        },
    };
}

export function listObjects(database) {
    const stmt = database.db.prepare(SQL_NAME_ORDER);
    try {
        const texts = textReader(database, stmt.pointer);
        const objects = [];
        while (stmt.step()) {
            objects.push({ name: texts.text(1), kind: stmt.get(0) === "view" ? "view" : "table" });
        }
        return objects;
    } finally {
        stmt.finalize();
    }
}

export function countRows(database, name) {
    return Number(database.db.selectValue(`select count(*) from main.${quoteIdent(name)}`));
}

export function openRows(database, name) {
    const stmt = database.db.prepare(`select * from main.${quoteIdent(name)}`);
    const pointer = stmt.pointer;
    const { capi } = database;
    let open = true;
    let ended = false;
    const columns = [];
    let texts;
    try {
        texts = textReader(database, pointer);
        for (let i = 0; i < stmt.columnCount; i++) {
            columns.push(texts.name(i));
        }
    } catch (error) {
        stmt.finalize();
        throw error;
    }

    const close = () => {
        if (open) {
            open = false;
            stmt.finalize();
        }
    };

    // one row: the kind of each value, asked before the value is read
    function readRow(costs) {
        const kinds = new Array(columns.length);
        const values = new Array(columns.length);
        let chars = 0;
        for (let i = 0; i < columns.length; i++) {
            const kind = capi.sqlite3_column_type(pointer, i);
            kinds[i] = kind;
            switch (kind) {
                case VALUE_KINDS.INTEGER:
                    values[i] = stmt.get(i);
                    chars += NUMBER_CHARS;
                    break;
                case VALUE_KINDS.FLOAT:
                    values[i] = stmt.getFloat(i);
                    chars += NUMBER_CHARS;
                    break;
                case VALUE_KINDS.TEXT:
                    values[i] = texts.text(i);
                    chars += values[i].length;
                    break;
                case VALUE_KINDS.BLOB:
                    values[i] = stmt.getBlob(i);
                    chars += 2 * values[i].length;
                    break;
                default:
                    kinds[i] = VALUE_KINDS.NULL;
                    values[i] = null;
                    chars += 1;
            }
        }
        costs.chars += chars;
        return { kinds, values };
    }

    function next({ chars = Infinity, ms = Infinity } = {}) {
        const rows = [];
        if (!open || ended) {
            return { rows, done: true };
        }
        const started = performance.now();
        const costs = { chars: 0 };
        while (stmt.step()) {
            rows.push(readRow(costs));
            if (costs.chars >= chars || performance.now() - started >= ms) {
                return { rows, done: false };
            }
        }
        ended = true;
        close();
        return { rows, done: true };
    }

    return { columns, next, close };
}
