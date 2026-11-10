// The one way user SQL runs: a visible Run (js/index.js execute) and the exercise checker
// (js/lab/checker.js) both go through runSql, so they agree on what "the result" is.
//
// Exports:
//   splitStatements(capi, sql) -> string[]
//       Cuts SQL text into statements. At each ";" it asks capi.sqlite3_complete about the
//       text since the last cut, so a semicolon inside a string, a comment or a trigger body
//       does not split, and a long script is never re-scanned from its start. A ";" inside a
//       string, a quoted name or a comment is not even asked about (nextSemicolon steps over
//       those the way sqlite3_complete reads them): the answer there is always no, and asking
//       costs a pass over the whole statement so far, which made a text value holding tens
//       of thousands of semicolons (a .sql upload goes through here) slow, about 3 seconds at
//       100,000. Text left after the last cut is a final statement unless it holds nothing to
//       run. Statements are trimmed; a lone ";" (an empty statement) and text that is only
//       whitespace, comments and semicolons (a "-- note" after the last ";") are dropped, so
//       the count of statements is the count the student wrote. A comment in front of a statement
//       stays part of it. This agrees with SQLite on "/*": followed by any character
//       (whitespace too) it opens a comment that runs to the end if never closed, so
//       "select 1;\n/*\n" runs one statement; a bare "/*" at the very end is a slash and a
//       star (a syntax error). The one blank character after a final "/*" is therefore kept
//       when trimming ("select 1 /* " is executed as written).
//   stripLeadingNoise(statement) -> string
//       The statement without its leading whitespace and comments.
//   runSql(database, sql) -> {columns: string[], values: any[][]} | null
//       Runs the statements one at a time on database.db (an SQLite instance of
//       js/sqlite/db.js) with rowMode "array", and returns the LAST statement that has
//       result columns (zero rows included), or null when none has. Column names are
//       faithful: duplicates stay, and the order is the SELECT's. Sets database.query = sql,
//       as SQLite.execute does. A failing statement throws the engine's exception;
//       statements before it stay applied (nothing is wrapped in a transaction).
//       Before rethrowing, the same exception object gets three properties (class and
//       message are untouched): statementText (the failing statement, trimmed, as split),
//       statementPosition (1-based) and statementCount (statements in the run). F5 names
//       the statement from them (js/lab/results.js). They hold the student's own SQL, or
//       an exercise's model query when the checker runs it, so an exception from the
//       checker's model run must never be shown or stored; the checker drops it.
//       Values are what the engine's array rows hold: numbers, BigInt (integers beyond
//       the safe range), strings, Uint8Array (BLOB), null.
//       Text that holds a NUL character (U+0000) is refused with SQL_NUL_MESSAGE before anything
//       runs: the engine stops reading at a NUL, so the statements after it would be dropped
//       without a word (SQLite in other drivers raises "embedded null character").
//       A lone UTF-16 surrogate is replaced by U+FFFD before the text is split: the engine's own
//       conversion would swallow the character after it, and the statements would be cut one way
//       and run another (see the comment in runSql).
//       Statements are trimmed with JavaScript's idea of whitespace, which is wider than SQLite's
//       (space, tab, LF, FF, CR): a no-break space, a line separator or an ideographic space at
//       the start or end of a statement is trimmed away, where SQLite would report an
//       unrecognized token. That is on purpose, the lenient side: text pasted from a page or a
//       document runs as it looks. Inside
//       a statement such characters are the engine's to judge, and it refuses them.
//       Student SQL runs under a guard (see "The guard" below): a few statements that would
//       reach outside the connection are refused, so one run cannot change a later one.
//   engineMessage(exc) -> string
//       The engine's own message without the wrapper's prefix: "no such column: pric", not
//       "SQLite3Error: SQLITE_ERROR: sqlite3 result code 1: no such column: pric".
//       Works for any SQLITE_* code (SQLITE_CONSTRAINT_UNIQUE, ...). Not-SQLite errors
//       keep their text.

import { SQL_NUL_MESSAGE, VACUUM_INTO_MESSAGE } from "./config.js";

// The guard. The engine's memory filesystem and its heap limits are shared by every connection
// on the page, and a check opens fresh connections from the pristine dataset, so SQL that
// leaves something behind there would reach later runs and later checks:
//   PRAGMA hard_heap_limit / soft_heap_limit   process-global; a low limit survives closing the
//                                             connection and makes every new connection fail
//   ATTACH of a file                           the file stays in memory for the page's life
//   VACUUM INTO a file                         same
// The first two are refused by an authorizer (sqlite3_set_authorizer, installed once per
// connection; the engine answers "not authorized"). ATTACH ':memory:' and ATTACH '' (a
// private temporary database) are still allowed: they vanish with the connection. VACUUM INTO
// a file reaches the authorizer as an ATTACH and would be denied there (SQLITE_AUTH), but a
// statement that starts with VACUUM and says INTO (outside comments and quotes) is refused
// here first: the student is told why, and the refusal does not rest on the authorizer alone.
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
const LEADING_NOISE = /^(?:\s+|--[^\n]*(?:\n|$)|\/\*(?:[\s\S]*?\*\/|[\s\S]+))*/;
const VACUUM_INTO = /^vacuum\b[\s\S]*\binto\b/i;

// Comments and quoted text (strings, quoted names) of a statement, which an unterminated one
// takes to the end, as SQLite reads them. Replaced by a blank before the INTO search, so
// "VACUUM /* into */" is a plain VACUUM and "VACUUM INTO 'file'" is still found.
const COMMENTS_AND_QUOTES = /--[^\n]*|\/\*[\s\S]*?(?:\*\/|$)|'(?:[^']|'')*(?:'|$)|"(?:[^"]|"")*(?:"|$)|`(?:[^`]|``)*(?:`|$)|\[[^\]]*(?:\]|$)/g;

export function isVacuumInto(statement) {
    const text = stripLeadingNoise(statement);
    // most statements are not a VACUUM: the scan is only for those that are
    return /^vacuum\b/i.test(text) && VACUUM_INTO.test(text.replace(COMMENTS_AND_QUOTES, " "));
}

// The statement without its leading whitespace and comments (the failing part of a statement
// that starts with a note to oneself).
export function stripLeadingNoise(statement) {
    return String(statement).replace(LEADING_NOISE, "");
}

// Text that holds nothing to run: whitespace, comments and semicolons only. (\s, not \s+, so a
// failing match cannot backtrack through every way of splitting a run of blanks. A comment's
// body may not hold "*/": otherwise an unterminated-comment reading could swallow the SQL
// after a closed comment, and "/* note */ select 1" would count as nothing to run. An
// unterminated comment needs a character after its "/*", whitespace included (addStatement
// keeps it): SQLite reads a bare "/*" at the very end as a slash and reports a syntax error,
// so that stays a statement and the engine says so.)
const NOTHING_TO_RUN = /^(?:;|\s|--[^\n]*(?:\n|$)|\/\*(?:(?:(?!\*\/)[\s\S])*\*\/|(?:(?!\*\/)[\s\S])+$))*$/;

// "SQLite3Error: " (the exception's class, present in String(exc)), then "SQLITE_<NAME>: "
// (any primary or extended result code name), then "sqlite3 result code <n>: ".
const PREFIX = /^(?:SQLite3Error:\s*)?(?:SQLITE_[A-Z0-9_]+:\s*)?(?:sqlite3 result code -?\d+:\s*)?/;

export function engineMessage(exc) {
    const text = exc && typeof exc === "object" && "message" in exc ? String(exc.message) : String(exc);
    const stripped = text.replace(PREFIX, "");
    // never return an empty message: a bare "SQLITE_BUSY" is better than nothing
    return stripped.trim() ? stripped : text;
}

// The index of the next ";" at or after `from` that is not inside a quoted string or name, a
// bracketed name or a comment, or -1. The rules are sqlite3_complete's own: a quote runs to the
// next one of its kind (a doubled quote closes and opens again, so it needs no case of its
// own), "[" to the next "]", "--" to the next LF (a CR does not end it), and the search for
// "*/" starts right after "/*", so "/*/" is still open. Anything left open takes the rest of
// the text, so there is no semicolon after it. indexOf, not a regular expression: the scan is
// linear and has no backtrack stack to run out of on a long text. `from` must be outside any
// token (the start of the text, or right after a ";" found here).
function nextSemicolon(sql, from) {
    for (let i = from; i < sql.length; i++) {
        let end;
        switch (sql[i]) {
            case ";":
                return i;
            case "'":
            case '"':
            case "`":
                end = sql.indexOf(sql[i], i + 1);
                break;
            case "[":
                end = sql.indexOf("]", i + 1);
                break;
            case "-":
                if (sql[i + 1] !== "-") {
                    continue;
                }
                end = sql.indexOf("\n", i + 2);
                break;
            case "/":
                if (sql[i + 1] !== "*") {
                    continue;
                }
                end = sql.indexOf("*/", i + 2);
                // the closer is two characters long
                if (end !== -1) {
                    end++;
                }
                break;
            default:
                continue;
        }
        if (end === -1) {
            return -1;
        }
        i = end;
    }
    return -1;
}

export function splitStatements(capi, sql) {
    const statements = [];
    let start = 0;
    let at = nextSemicolon(sql, 0);
    while (at !== -1) {
        const chunk = sql.slice(start, at + 1);
        if (capi.sqlite3_complete(chunk)) {
            addStatement(statements, chunk);
            start = at + 1;
        }
        at = nextSemicolon(sql, at + 1);
    }
    addStatement(statements, sql.slice(start));
    return statements;
}

function addStatement(statements, text) {
    // Trimmed, except that blank space right after a final "/*" stays (one character of it):
    // SQLite reads "/*" and any character after it as a comment, and a bare "/*" at the very
    // end as a slash and a star, so trimming that character away would change what runs.
    const lead = text.length - text.trimStart().length;
    const end = text.trimEnd().length;
    const statement = text.slice(lead, text.slice(0, end).endsWith("/*") && end < text.length ? end + 1 : end);
    // blank, only empty statements (";" alone), or only comments (a note after the last ";")
    if (!NOTHING_TO_RUN.test(statement)) {
        statements.push(statement);
    }
}

// noteFailure records which statement of the run an exception came from. The same object
// is rethrown by the caller. An exception that cannot take properties is left alone.
function noteFailure(exc, text, position, count) {
    if (exc === null || typeof exc !== "object") {
        return;
    }
    try {
        exc.statementText = text;
        exc.statementPosition = position;
        exc.statementCount = count;
    } catch {
        // frozen or sealed: the message alone will do
    }
}

export function runSql(database, sql) {
    if (!sql) {
        return null;
    }
    database.query = sql;
    // The engine reads SQL only up to a NUL, so what follows would silently not run.
    if (sql.includes("\u0000")) {
        throw new Error(SQL_NUL_MESSAGE);
    }
    // A lone surrogate (half of an emoji, say) is not text the engine can read: its conversion to
    // UTF-8 swallows the character after it, where sqlite3_complete and the scan above read it as
    // U+FFFD. The statements would then be cut one way and run another, and a "VACUUM INTO" could
    // hide inside what looks like a string. So the text is made well-formed (each lone half
    // becomes U+FFFD, the same text on every side) before it is split.
    if (typeof sql.isWellFormed === "function" && !sql.isWellFormed()) {
        sql = sql.toWellFormed();
    }
    installGuard(database);
    let last = null;
    const statements = splitStatements(database.capi, sql);
    for (let i = 0; i < statements.length; i++) {
        const statement = statements[i];
        try {
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
        } catch (exc) {
            noteFailure(exc, statement, i + 1, statements.length);
            throw exc;
        }
    }
    return last;
}
