// SQLite database manager.

import { SQLite } from "./db.js";
import { runSql } from "../lab/runner.js";

// global SQLite WASM API object.
let sqlite3;
// resolves to the SQLite WASM API object once it's initialized.
let loading;

// required by the SQLite WASM API.
const CONFIG = {
    print: console.log,
    printErr: console.error,
};

// init loads a database from the specified path
// using the SQLite WASM API.
async function init(name, path) {
    if (!loading) {
        loading = sqlite3InitModule(CONFIG).then((api) => {
            console.log(`Loaded SQLite ${api.capi.sqlite3_libversion()}`);
            return api;
        });
    }
    sqlite3 = await loading;
    if (path.type == "local" || path.type == "remote") {
        console.debug(`Loading database from url ${path.value}...`);
        if (path.value.endsWith(".sql")) {
            const sql = await fetchFile(path.value, "text");
            return fromSql(name, path, sql);
        }
        const buf = await fetchFile(path.value, "arrayBuffer");
        return fromBytes(name, path, buf);
    }
    if (path.type == "binary") {
        console.debug("Loading database from array buffer...");
        const buf = path.value;
        path.value = null;
        return fromBytes(name, path, buf);
    }
    if (path.type == "sql") {
        console.debug("Loading database from SQL script...");
        return fromSql(name, path, path.value);
    }
    // empty
    console.debug("Creating new database...");
    return create(name, path);
}

// create creates an empty database.
function create(name, path) {
    const db = new sqlite3.oo1.DB();
    return new SQLite(name, path, sqlite3.capi, db);
}

// fromBytes loads a database from the binary database file content.
function fromBytes(name, path, buf) {
    if (!buf) {
        return null;
    }
    const bytes = new Uint8Array(buf);
    // in-memory databases do not support WAL,
    // so switch the header to legacy rollback mode.
    if (bytes[18] === 2) bytes[18] = 1;
    if (bytes[19] === 2) bytes[19] = 1;
    const p = sqlite3.wasm.allocFromTypedArray(bytes);
    const database = create(name, path);
    sqlite3.capi.sqlite3_deserialize(
        database.db.pointer,
        "main",
        p,
        bytes.length,
        bytes.length,
        sqlite3.capi.SQLITE_DESERIALIZE_FREEONCLOSE | sqlite3.capi.SQLITE_DESERIALIZE_RESIZEABLE,
    );
    database.gatherTables();
    return database;
}

// fromSql creates a database by executing a plain text SQL script.
function fromSql(name, path, sql) {
    if (!sql) {
        return null;
    }
    const database = create(name, path);
    runSql(database, sql);
    database.gatherTables();
    database.query = "";
    return database;
}

// fetchFile fetches a local or remote file using the specified
// response method ("text" or "arrayBuffer"). Returns null on failure.
async function fetchFile(url, method) {
    try {
        const response = await fetch(url);
        if (!response.ok) {
            return null;
        }
        return await response[method]();
    } catch {
        return null;
    }
}

export default { init };
