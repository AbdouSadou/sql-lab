// The names the SQL editor completes (UI plan, section 5): the tables and views of the open
// database with their columns. They are read when a database opens and again after a run that
// changed the schema (PRAGMA schema_version moves on CREATE, DROP and ALTER), and handed to the
// editor (js/components/sqlime-editor.js setSchema; the plain editor ignores them).
//
// mountEditorSchema({editor}) follows the two events index.js announces:
//   lab:database-loaded  read the names of the new database
//   lab:run-finished     read them again if the schema changed
//
// The names come from the database file and are untrusted: they only ever become completion
// labels (text) and are quoted by identifierForSql when one is inserted.

import { SCHEMA_OBJECTS_SQL, pragmaTableInfoSql } from "./sql.js";

function rows(database, sql) {
    return database.db.exec({ sql, rowMode: "array", returnValue: "resultRows" });
}

function schemaVersion(database) {
    try {
        return rows(database, "PRAGMA schema_version")[0][0];
    } catch (exc) {
        return null;
    }
}

// [{name, type: "table"|"view", columns: [{name, type}]}]; a table whose columns cannot be read
// (a view over a table that is gone, say) is offered without columns
export function readSchema(database) {
    let objects;
    try {
        objects = rows(database, SCHEMA_OBJECTS_SQL);
    } catch (exc) {
        return [];
    }
    return objects.map(([type, name]) => {
        let columns = [];
        try {
            // table_info: cid, name, type, notnull, dflt_value, pk
            columns = rows(database, pragmaTableInfoSql(name)).map(([, column, columnType]) => ({ name: column, type: columnType }));
        } catch (exc) {
            // no columns, then
        }
        return { name, type, columns };
    });
}

export function mountEditorSchema({ editor }) {
    let database = null;
    let seen = null;

    function read() {
        seen = schemaVersion(database);
        editor.setSchema(database ? readSchema(database) : []);
    }

    document.addEventListener("lab:database-loaded", (event) => {
        database = event.detail.database;
        read();
    });

    document.addEventListener("lab:run-finished", (event) => {
        if (event.detail.database !== database) {
            return;
        }
        if (schemaVersion(database) !== seen) {
            read();
        }
    });
}
