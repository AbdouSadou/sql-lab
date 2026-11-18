// The database side of an import (assessment plan, sections 3 and 7): the transaction an import
// runs in, the all-text staging table a file is read into, and the copy into the final, typed
// table. No DOM. `database` is the page's wrapper of a connection (js/sqlite/db.js): database.db
// is the engine's handle, database.capi its C interface.
//
// An import either finishes or leaves nothing. Everything it does to a database sits between
// beginImport and endImport, in a savepoint. In a database of its own that is a transaction. In
// the open database the student may have left a transaction of their own open (the page wraps
// nothing in one), and the savepoint is then inside it: undoing the import undoes the import
// and nothing else. Where no transaction of theirs was open, an import that is undone leaves the
// database as it was to the byte.
//
//   takenNames(database) -> Map       the names a new table could collide with, as keys
//                                     (sameNameKey): the tables, views and indexes of the
//                                     database (SQLite keeps them in one list; triggers are
//                                     apart), and the TEMP tables and views of the connection
//                                     (one of the same name would hide the new table from SQL
//                                     that does not say which). The value is true for a name
//                                     that only a TEMP table or view has: it is in no database,
//                                     and the student is told so.
//   beginImport(database) -> ticket
//   endImport(database)               keeps what the import did
//   undoImport(database, ticket) -> {undone, lostTransaction}
//       takes back everything since beginImport. For some failures the engine has already
//       rolled back everything itself, the student's own open transaction included (when memory
//       runs out; when a database that was given a page limit is full): there is then nothing
//       left to undo, and lostTransaction says that a transaction of the student's went with
//       it. Never throws.
//
//   newStage(database) -> stage       a TEMP table of text columns c1, c2 ... (in the main
//                                     database it would leave its pages behind when dropped, and
//                                     double the exported file)
//     stage.add(rows)                 rows of values: text, or null for an empty field (rule 5
//                                     is applied by the reader: the engine would keep '' as
//                                     text). The table grows as wide as its widest row.
//     stage.rows                      how many rows it holds
//     stage.copyInto(name, columns, {rest, onStep}) -> Promise
//                                     creates main.<name> with the columns [{name, type}] and
//                                     copies the staged rows into it, COPY_CELLS at a time, with
//                                     a rest() between two steps (js/lab/import-pace.js). The
//                                     column's type does the conversion: '100' in a REAL column
//                                     is stored as 100.0, '1.50' as 1.5, a whole number of up to
//                                     15 digits exactly. A column no row reached is NULL.
//                                     onStep(done, total) is called after each step.
//     stage.drop()                    removes the staging table; never throws
//
//   isOutOfMemory(error), isEngineError(error) -> boolean
//                                     what a failure was: the engine or its allocator had no
//                                     memory left; the engine or its allocator threw it at all
//                                     (and not the page's own code). The export of tables asks
//                                     the same two questions (js/lab/export-tables.js).
//
//   namesNeedingQuotes(database, table, columns) -> [name]
//                                     the names, among a table's name and its column names, that
//                                     a query must write in double quotes: the table's first
//                                     when it is one, then the columns in the order given, a
//                                     word once whatever its letter case (SQL reads Group and
//                                     group as one name). Found by asking the engine (see
//                                     below). Reads no table, writes nothing, never throws.
//
// Whether a name needs quotes is not read from a list of SQLite's words, which grows with the
// engine: the engine is asked, with a query of one row that reads no table of the database. A
// name that is not ASCII letters, digits and underscores (or starts with a digit) needs quotes,
// and is never put into SQL bare. Any other name is tried unquoted, inside parentheses, since a
// word can pass without them and fail with them (`with` begins a WITH clause after an opening
// parenthesis):
//     a column   select (<name>) is ?1 from (select ?1 as "<name>")
//     a table    with "<name>"(x) as (select ?1) select (<name>.x) is ?1 from <name>
// Each answers 1 only when the bare name reads the value that was bound. A word the parser
// refuses fails. A word that parses and means something else gives another value: null and
// current_date, and also true and false, which SQLite 3.54 reads as the column straight from a
// table and as the constant through a subquery, a WITH clause or a view (so a column of that
// name is listed, although a query on the table alone reads it bare). A table's name is written
// in the two places a query writes it, after FROM and in front of a column: cast, raise,
// current_date, current_time and current_timestamp pass after FROM and are refused in front of
// a dot. A probe that throws means the name needs quotes. The text bound is one no file holds.
// What the probes do not see: a table called `if` is read by every query that was tried, and
// refused by DROP TABLE if (the parser expects IF EXISTS); it is not listed.
//
// Every name that comes from a file is written in double quotes ("Order" is a table name the
// plan keeps), and every table with its schema: a TEMP table hides a main one of the same name
// in SQL that does not say which. Only the probes above write such a name bare, to see what the
// engine does with it. SQLite's own text-to-number conversion is the one used; for a decimal of
// twenty or more significant digits it can differ in the last place from the nearest number.

import { COPY_CELLS } from "./config-workflow.js";
import { sameNameKey } from "./import-rules.js";
import { quoteIdent } from "./sql.js";

// (exported for the tests alone: one of them asks the engine whether this savepoint is still there)
export const SAVEPOINT = "lab_import";
const STAGE_NAME = "import_stage";
const OUT_OF_MEMORY = 7;

export function takenNames(database) {
    const taken = new Map();
    const note = (temporary, sql) => database.db.selectValues(sql).forEach((name) => taken.set(sameNameKey(name), temporary));
    // (the database's own second: a name that both hold is the database's)
    note(true, "select name from temp.sqlite_schema where type in ('table', 'view')");
    note(false, "select name from main.sqlite_schema where type in ('table', 'view', 'index')");
    return taken;
}

// true while a transaction is open on the connection
const inTransaction = (database) => database.capi.sqlite3_get_autocommit(database.db.pointer) === 0;

export function beginImport(database) {
    const ticket = { hadTransaction: inTransaction(database) };
    database.db.exec(`savepoint ${SAVEPOINT}`);
    return ticket;
}

export function endImport(database) {
    database.db.exec(`release ${SAVEPOINT}`);
}

export function undoImport(database, ticket) {
    try {
        if (!inTransaction(database)) {
            // the engine has rolled everything back by itself (it does when memory runs out, and
            // when the database is full)
            return { undone: true, lostTransaction: ticket.hadTransaction };
        }
        if (ticket.hadTransaction) {
            database.db.exec(`rollback to ${SAVEPOINT}`);
            database.db.exec(`release ${SAVEPOINT}`);
        } else {
            // The savepoint began the transaction, which is then the import's alone: it is taken
            // back whole. (A release would end it as a commit of nothing, and the engine counts
            // one more change in the file's header for it.)
            database.db.exec("rollback");
        }
        return { undone: true, lostTransaction: false };
    } catch {
        return { undone: false, lostTransaction: ticket.hadTransaction && !inTransactionSafely(database) };
    }
}

function inTransactionSafely(database) {
    try {
        return inTransaction(database);
    } catch {
        return false;
    }
}

const BARE_NAME = /^[A-Za-z_][A-Za-z0-9_]*$/;
const PROBE_TEXT = "\u0001lab probe\u0001";

// does the query, run with the probe's text bound, answer 1? One the engine refuses does not.
function answersOne(db, sql) {
    try {
        return db.selectValue(sql, [PROBE_TEXT]) === 1;
    } catch {
        return false;
    }
}

const tableIsBare = (db, name) =>
    BARE_NAME.test(name) && answersOne(db, `with ${quoteIdent(name)}(x) as (select ?1) select (${name}.x) is ?1 from ${name}`);

const columnIsBare = (db, name) => BARE_NAME.test(name) && answersOne(db, `select (${name}) is ?1 from (select ?1 as ${quoteIdent(name)})`);

export function namesNeedingQuotes(database, table, columns) {
    try {
        const { db } = database;
        const names = tableIsBare(db, table) ? [] : [table];
        // (a column called as its table, in any letter case, is the same word to SQL)
        const listed = new Set(names.map(sameNameKey));
        for (const column of columns) {
            if (!listed.has(sameNameKey(column)) && !columnIsBare(db, column)) {
                names.push(column);
                listed.add(sameNameKey(column));
            }
        }
        return names;
    } catch {
        return [];
    }
}

export const isOutOfMemory = (error) => error?.resultCode === OUT_OF_MEMORY || error?.name === "WasmAllocError";

// thrown by the engine or by its allocator, and not by the page's own code
export const isEngineError = (error) => error?.name === "SQLite3Error" || error?.name === "WasmAllocError";

// a name no TEMP table has yet (a student can have made one of any name)
function freeStageName(db) {
    const taken = new Set(db.selectValues("select name from sqlite_temp_schema").map(sameNameKey));
    let name = STAGE_NAME;
    for (let n = 2; taken.has(sameNameKey(name)); n++) {
        name = `${STAGE_NAME}_${n}`;
    }
    return name;
}

const stageColumns = (from, to) => Array.from({ length: to - from }, (unused, i) => `c${from + i + 1}`);

export function newStage(database) {
    const db = database.db;
    const table = `temp.${quoteIdent(freeStageName(db))}`;
    let width = 0;
    let insert = null;
    let dropped = false;
    const stage = { rows: 0 };

    const create = (columns) => db.exec(`create table ${table} (${stageColumns(0, columns).map((c) => `${c} text`).join(", ")})`);
    create(1);
    width = 1;

    function widen(to) {
        insert?.finalize();
        insert = null;
        if (stage.rows === 0) {
            // nothing staged yet: a table of the right width at once (adding two thousand
            // columns one by one takes seconds)
            db.exec(`drop table ${table}`);
            create(to);
        } else {
            for (const column of stageColumns(width, to)) {
                db.exec(`alter table ${table} add column ${column} text`);
            }
        }
        width = to;
    }

    stage.add = (rows) => {
        const widest = rows.reduce((most, row) => Math.max(most, row.length), 0);
        if (widest > width) {
            widen(widest);
        }
        insert ??= db.prepare(`insert into ${table} (${stageColumns(0, width).join(", ")}) values (${stageColumns(0, width).map(() => "?").join(", ")})`);
        for (const row of rows) {
            // (a row shorter than the table leaves its last columns unbound, which is NULL)
            insert.bind(row).step();
            insert.reset(true);
            stage.rows++;
        }
    };

    stage.copyInto = async (name, columns, { rest, onStep = () => {} }) => {
        insert?.finalize();
        insert = null;
        const target = `main.${quoteIdent(name)}`;
        db.exec(`create table ${target} (${columns.map((column) => `${quoteIdent(column.name)} ${column.type}`).join(", ")})`);
        const values = columns.map((column, i) => (i < width ? `c${i + 1}` : "null")).join(", ");
        const copy = db.prepare(`insert into ${target} select ${values} from ${table} where rowid > ?1 and rowid <= ?2`);
        try {
            const step = Math.max(1, Math.floor(COPY_CELLS / columns.length));
            for (let done = 0; done < stage.rows; done += step) {
                copy.bind([done, done + step]).step();
                copy.reset(true);
                onStep(Math.min(done + step, stage.rows), stage.rows);
                await rest();
            }
        } finally {
            copy.finalize();
        }
    };

    stage.drop = () => {
        if (dropped) {
            return;
        }
        dropped = true;
        try {
            insert?.finalize();
            insert = null;
            db.exec(`drop table if exists ${table}`);
        } catch {
            // (a rolled-back import has taken the table with it)
        }
    };

    return stage;
}
