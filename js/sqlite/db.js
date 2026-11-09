// SQLite database wrapper and metadata.

// default database name
const DEFAULT_NAME = "new.db";

// system queries
const QUERIES = {
    tables: `select name as "table" from sqlite_schema
      where type = 'table'
        and name not like 'sqlite_%'`,
    tableContent: "select * from {} limit 10",
    tableInfo: `select
      iif(pk=1, '✓', '') as pk, name, type, iif("notnull"=0, '✓', '') as "null?"
      from pragma_table_info('{}')`,
};

// database messages
const MESSAGES = {
    executing: "Executing query...",
    invite: "Run SQL query to see the results",
    loading: "Loading database...",
};

// SQLite database wrapper.
// Wraps SQLite WASM API and calls it in the following methods:
//   - execute()
//   - gatherTables()
// The rest of the methods are WASM-agnostic.
class SQLite {
    constructor(name, path, capi, db, query = "") {
        this.name = name || DEFAULT_NAME;
        this.path = path;
        this.capi = capi;
        this.db = db;
        this.query = query;
        this.tables = [];
    }

    // execute runs one ore more sql queries
    // and returns the last result.
    execute(sql) {
        if (!sql) {
            // sqlite api fails when trying to execute an empty query
            return null;
        }
        this.query = sql;
        let rows = [];
        this.db.exec({
            sql: sql,
            rowMode: "object",
            resultRows: rows,
        });
        if (!rows.length) {
            return null;
        }
        const result = {
            columns: Object.getOwnPropertyNames(rows[0]),
            values: [],
        };
        for (let row of rows) {
            result.values.push(Object.values(row));
        }
        return result;
    }

    // gatherTables fills the `.tables` attribute
    // with an array of database tables and returns it.
    gatherTables() {
        let rows = [];
        this.db.exec({
            sql: QUERIES.tables,
            rowMode: "array",
            resultRows: rows,
        });
        if (!rows.length) {
            this.tables = [];
            return this.tables;
        }
        this.tables = rows.map((row) => row[0]);
        return this.tables;
    }

    // getTableInfo returns the table schema.
    getTableInfo(table) {
        const sql = QUERIES.tableInfo.replace("{}", table);
        return this.execute(sql);
    }

    // meaningfulName returns the database name
    // if it differs from default one.
    get meaningfulName() {
        if (this.name == DEFAULT_NAME) {
            return "";
        }
        return this.name;
    }
}

export { DEFAULT_NAME, MESSAGES, QUERIES, SQLite };
