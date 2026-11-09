// Builds SQL that contains names taken from the database. A name can hold spaces,
// quotes, or anything else, so it is always quoted, never spliced in raw.

import { QUERIES } from "../sqlite/db.js";

// quoteIdent quotes a table or column name as an SQL identifier.
export function quoteIdent(name) {
    return `"${String(name).replaceAll('"', '""')}"`;
}

// quoteLiteral quotes text as an SQL string literal.
export function quoteLiteral(text) {
    return `'${String(text).replaceAll("'", "''")}'`;
}

// The replacers are functions on purpose: String.replace would otherwise read "$&"
// and friends inside a table name as replacement patterns.

// tableContentSql is the built-in preview: the first 10 rows of a table.
export function tableContentSql(table) {
    return QUERIES.tableContent.replace("{}", () => quoteIdent(table));
}

// tableInfoSql lists the columns of a table. The template already wraps {} in single
// quotes, so only the quotes inside the name are doubled.
export function tableInfoSql(table) {
    return QUERIES.tableInfo.replace("{}", () => String(table).replaceAll("'", "''"));
}

// ---- identifiers the schema sidebar inserts into the editor ----------------------------

// Every keyword of SQLite's tokenizer (plus TRUE and FALSE). A name on this list is quoted
// when it is inserted, even where SQLite would accept it bare: quoting is always correct,
// a missing quote is a syntax error for a student who does not yet know why.
export const SQL_KEYWORDS = new Set(
    (
        "ABORT ACTION ADD AFTER ALL ALTER ALWAYS ANALYZE AND AS ASC ATTACH AUTOINCREMENT BEFORE " +
        "BEGIN BETWEEN BY CASCADE CASE CAST CHECK COLLATE COLUMN COMMIT CONFLICT CONSTRAINT " +
        "CREATE CROSS CURRENT CURRENT_DATE CURRENT_TIME CURRENT_TIMESTAMP DATABASE DEFAULT " +
        "DEFERRABLE DEFERRED DELETE DESC DETACH DISTINCT DO DROP EACH ELSE END ESCAPE EXCEPT " +
        "EXCLUDE EXCLUSIVE EXISTS EXPLAIN FAIL FALSE FILTER FIRST FOLLOWING FOR FOREIGN FROM " +
        "FULL GENERATED GLOB GROUP GROUPS HAVING IF IGNORE IMMEDIATE IN INDEX INDEXED INITIALLY " +
        "INNER INSERT INSTEAD INTERSECT INTO IS ISNULL JOIN KEY LAST LEFT LIKE LIMIT MATCH " +
        "MATERIALIZED NATURAL NO NOT NOTHING NOTNULL NULL NULLS OF OFFSET ON OR ORDER OTHERS " +
        "OUTER OVER PARTITION PLAN PRAGMA PRECEDING PRIMARY QUERY RAISE RANGE RECURSIVE " +
        "REFERENCES REGEXP REINDEX RELEASE RENAME REPLACE RESTRICT RETURNING RIGHT ROLLBACK ROW " +
        "ROWS SAVEPOINT SELECT SET TABLE TEMP TEMPORARY THEN TIES TO TRANSACTION TRIGGER TRUE " +
        "UNBOUNDED UNION UNIQUE UPDATE USING VACUUM VALUES VIEW VIRTUAL WHEN WHERE WINDOW WITH " +
        "WITHOUT"
    ).split(" ")
);

const PLAIN_IDENTIFIER = /^[A-Za-z_][A-Za-z0-9_]*$/;

// needsQuoting says whether a name must be double-quoted to be read back as that name:
// anything but letters, digits and underscores (not starting with a digit), or a keyword.
export function needsQuoting(name) {
    const text = String(name);
    return !PLAIN_IDENTIFIER.test(text) || SQL_KEYWORDS.has(text.toUpperCase());
}

// identifierForSql is the text to put in a query for a table or column name: bare when
// that is safe, quoted otherwise.
export function identifierForSql(name) {
    return needsQuoting(name) ? quoteIdent(name) : String(name);
}

// The tables and views the sidebar lists. SQLite's own tables (sqlite_sequence, ...) are
// left out; the names are compared with a literal underscore, not the LIKE wildcard.
export const SCHEMA_OBJECTS_SQL =
    "SELECT type, name FROM sqlite_master WHERE type IN ('table', 'view') " +
    "AND name NOT LIKE 'sqlite\\_%' ESCAPE '\\' ORDER BY type, name COLLATE NOCASE";

export function countRowsSql(name) {
    return `SELECT COUNT(*) FROM ${quoteIdent(name)}`;
}

// pragmaTableInfoSql lists a table's or view's columns: cid, name, type, notnull, dflt_value, pk.
export function pragmaTableInfoSql(name) {
    return `PRAGMA table_info(${quoteIdent(name)})`;
}
