// The one way user SQL runs: a visible Run (js/index.js execute) and the exercise checker
// (js/lab/checker.js) both go through runSql, so they agree on what "the result" is.
//
// Exports:
//   splitStatements(capi, sql) -> string[]
//       Cuts SQL text into statements. At each ";" it asks capi.sqlite3_complete about the
//       text since the last cut, so a semicolon inside a string, a comment or a trigger body
//       does not split, and a long script is never re-scanned from its start. Text left
//       after the last cut is a final statement unless it is blank. Statements are trimmed;
//       a lone ";" (an empty statement) is dropped.
//   runSql(database, sql) -> {columns: string[], values: any[][]} | null
//       Runs the statements one at a time on database.db (an SQLite instance of
//       js/sqlite/db.js) with rowMode "array", and returns the LAST statement that has
//       result columns (zero rows included), or null when none has. Column names are
//       faithful: duplicates stay, and the order is the SELECT's. Sets database.query = sql,
//       as SQLite.execute does. A failing statement throws the engine's exception;
//       statements before it stay applied (nothing is wrapped in a transaction).
//       Values are what the engine's array rows hold: numbers, BigInt (integers beyond
//       the safe range), strings, Uint8Array (BLOB), null.
//       Student SQL runs under a guard (see "The guard" below): a few statements that would
//       reach outside the connection are refused, so one run cannot change a later one.
//   engineMessage(exc) -> string
//       The engine's own message without the wrapper's prefix: "no such column: pric", not
//       "SQLite3Error: SQLITE_ERROR: sqlite3 result code 1: no such column: pric".
//       Works for any SQLITE_* code (SQLITE_CONSTRAINT_UNIQUE, ...). Not-SQLite errors
//       keep their text.

import { VACUUM_INTO_MESSAGE } from "./config.js";

// The guard. The engine's memory filesystem and its heap limits are shared by every connection
// on the page, and a check opens fresh connections from the pristine dataset, so SQL that
// leaves something behind there would reach later runs and later checks:
//   PRAGMA hard_heap_limit / soft_heap_limit   process-global; a low limit survives closing the
//                                             connection and makes every new connection fail
//   ATTACH of a file                           the file stays in memory for the page's life
//   VACUUM INTO a file                         same
// The first two are refused by an authorizer (sqlite3_set_authorizer, installed once per
// connection; the engine answers "not authorized"). ATTACH ':memory:' and ATTACH '' (a
// private temporary database) are still allowed: they vanish with the connection. VACUUM has
// no authorizer hook, so a statement that starts with VACUUM and says INTO is refused here.
const SQLITE_PRAGMA = 19;
const SQLITE_ATTACH = 24;
const SQLITE_OK = 0;
const SQLITE_DENY = 1;
const guarded = new WeakSet();

function authorize(_context, action, arg1) {
    if (action === SQLITE_PRAGMA && /heap_limit$/i.test(arg1 ?? "")) {
        return SQLITE_DENY;
    }
    if (action === SQLITE_ATTACH && arg1 !== ":memory:" && arg1 !== "") {
        return SQLITE_DENY;
    }
    return SQLITE_OK;
}

function installGuard(database) {
    if (guarded.has(database.db)) {
        return;
    }
    guarded.add(database.db);
    try {
        database.capi.sqlite3_set_authorizer(database.db.pointer, authorize, 0);
    } catch (exc) {
        console.warn("the SQL guard could not be installed", exc);
    }
}

// The statement text without its leading whitespace and comments.
const LEADING_NOISE = /^(?:\s+|--[^\n]*(?:\n|$)|\/\*[\s\S]*?(?:\*\/|$))*/;
const VACUUM_INTO = /^vacuum\b[\s\S]*\binto\b/i;

export function isVacuumInto(statement) {
    return VACUUM_INTO.test(statement.replace(LEADING_NOISE, ""));
}

// "SQLite3Error: " (the exception's class, present in String(exc)), then "SQLITE_<NAME>: "
// (any primary or extended result code name), then "sqlite3 result code <n>: ".
const PREFIX = /^(?:SQLite3Error:\s*)?(?:SQLITE_[A-Z0-9_]+:\s*)?(?:sqlite3 result code -?\d+:\s*)?/;

export function engineMessage(exc) {
    const text = exc && typeof exc === "object" && "message" in exc ? String(exc.message) : String(exc);
    const stripped = text.replace(PREFIX, "");
    // never return an empty message: a bare "SQLITE_BUSY" is better than nothing
    return stripped.trim() ? stripped : text;
}

export function splitStatements(capi, sql) {
    const statements = [];
    let start = 0;
    let at = sql.indexOf(";");
    while (at !== -1) {
        const chunk = sql.slice(start, at + 1);
        if (capi.sqlite3_complete(chunk)) {
            addStatement(statements, chunk);
            start = at + 1;
        }
        at = sql.indexOf(";", at + 1);
    }
    addStatement(statements, sql.slice(start));
    return statements;
}

function addStatement(statements, text) {
    const statement = text.trim();
    // blank, or only empty statements (";" alone)
    if (statement && !/^;+$/.test(statement)) {
        statements.push(statement);
    }
}

export function runSql(database, sql) {
    if (!sql) {
        return null;
    }
    database.query = sql;
    installGuard(database);
    let last = null;
    for (const statement of splitStatements(database.capi, sql)) {
        if (isVacuumInto(statement)) {
            throw new Error(VACUUM_INTO_MESSAGE);
        }
        const columns = [];
        const values = [];
        database.db.exec({
            sql: statement,
            rowMode: "array",
            columnNames: columns,
            resultRows: values,
        });
        if (columns.length) {
            last = { columns, values };
        }
    }
    return last;
}
