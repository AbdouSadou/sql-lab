// The export action: download the open in-memory database as a file.
//
// The bytes come from the engine's own serializer (sqlite3_js_db_export), so they hold the
// database as it is now, including every change the student made. The SQLite wrapper
// already carries the engine's capi object (database.capi), so no engine access is needed
// beyond what js/sqlite/ hands out.

import {
    EXPORT_EMPTY_MESSAGE,
    EXPORT_FAILED_MESSAGE,
    EXPORT_FALLBACK_NAME,
    exportedMessage,
} from "./config.js";
import { toast } from "./toast.js";

const DB_EXTENSION = /\.(db|sqlite|sqlite3)$/i;

// safeBaseName derives a file name's base from the database name: no path characters, no
// script suffix (an uploaded .sql script is saved as a database), never empty. The database
// export and the CSV download (js/lab/results.js) both name their files from it.
export function safeBaseName(name) {
    const base = String(name ?? "")
        .replace(/\.sql$/i, "")
        .replace(/[\u0000-\u001f\u007f\\/:*?"<>|]+/g, "_")
        .replace(/^[\s.]+|[\s.]+$/g, "")
        .slice(0, 100);
    return !base || /^_+$/.test(base) ? EXPORT_FALLBACK_NAME : base;
}

// exportFileName derives the download name from the database name: always a database
// extension.
export function exportFileName(name) {
    const base = safeBaseName(name);
    return DB_EXTENSION.test(base) ? base : `${base}.db`;
}

// isEmpty tells whether the database has no tables, views, indexes or triggers.
function isEmpty(database) {
    return database.db.selectValue("select count(*) from sqlite_schema") === 0;
}

// exportProblem says why the open database cannot be saved before anything is asked (it is empty),
// or returns null. A failure of the engine is left to serializeDatabase to report.
export function exportProblem(database) {
    try {
        return isEmpty(database) ? EXPORT_EMPTY_MESSAGE : null;
    } catch {
        return null;
    }
}

// serializeDatabase returns {ok: true, bytes, filename} or {ok: false, message}.
export function serializeDatabase(database) {
    try {
        if (isEmpty(database)) {
            return { ok: false, message: EXPORT_EMPTY_MESSAGE };
        }
        const bytes = database.capi.sqlite3_js_db_export(database.db.pointer);
        if (!bytes || !bytes.length) {
            return { ok: false, message: EXPORT_EMPTY_MESSAGE };
        }
        return { ok: true, bytes, filename: exportFileName(database.name) };
    } catch {
        return { ok: false, message: EXPORT_FAILED_MESSAGE };
    }
}

// saveFile hands data (a string or bytes) to the browser as a file save.
export function saveFile(data, filename, type) {
    const blob = new Blob([data], { type });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    link.hidden = true;
    document.body.append(link);
    link.click();
    link.remove();
    // the browser has taken its reference by now; free ours a little later
    setTimeout(() => URL.revokeObjectURL(url), 10000);
}

// createExportAction returns what the database export dialog's Export does. getDatabase gives the
// current database (index.js keeps it private); a toast says how it went (js/lab/toast.js).
export function createExportAction(getDatabase) {
    return function exportDatabase() {
        const database = getDatabase();
        if (!database) {
            toast(EXPORT_EMPTY_MESSAGE, { tone: "problem" });
            return Promise.resolve();
        }
        const result = serializeDatabase(database);
        if (!result.ok) {
            toast(result.message, { tone: "problem" });
            return Promise.resolve();
        }
        try {
            saveFile(result.bytes, result.filename, "application/vnd.sqlite3");
        } catch {
            toast(EXPORT_FAILED_MESSAGE, { tone: "problem" });
            return Promise.resolve();
        }
        toast(exportedMessage(result.filename));
        return Promise.resolve();
    };
}
