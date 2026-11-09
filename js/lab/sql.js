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
