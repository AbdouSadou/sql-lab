// Export of tables as CSV (assessment plan, section 5; its Phase 3, flag "export"): what the page
// does when a student chooses "Tables as CSV…" in the Export menu. With the flag off none of this
// exists: no element, no listener, no request.
//
//   mountTableExport(page) -> {enabled, open()}
//     enabled        the flag, as it was when the page loaded (js/lab/flags.js)
//     open()         what the menu entry does: opens the dialog (js/lab/export-tables-dialog.js), or
//                    says in a toast why it does not: no database is open, one is loading, an
//                    import or an export runs, there is no table or view to export, or the
//                    tables could not be listed
//
//   page, what the export needs from js/index.js:
//     returnFocus         where the focus goes when the dialog closes
//     getDatabase()       the open database, or null/undefined
//     isLoading()         true while a database is on its way to replace the open one
//     otherJobMessage()   the busy message of another long job that is running (an import), or null
//     runLog              js/lab/run-log.js as mounted: the key of the evidence log
//     onBusy(busy)        called when an export starts (true) and when it has ended (false): the
//                         page is told, it does not ask, and it refuses Run, Check, the database
//                         export and every way of opening another database meanwhile; no import
//                         starts either
//
// run(job, {progress, cancelled}) is what the dialog's Export does. job is {database, tables:
// [{name, count}], plan}: the database the dialog was opened with, the ticked tables in the dialog's
// order, and the plan of the output the dialog showed (planOutput in js/lab/export-csv.js), which is
// not worked out again. It gives {ok: true, fileName, written: [{name, rows, entry}], notes: [{kind:
// "blob", tables}]}, or {ok: false, cancelled: true}, or {ok: false, message, table?, reason?}
// (table and reason when one table could not be read: its name, and the engine's words on one line).
//
// An export either saves a file or leaves nothing. The rows of each table are read in pieces
// (EXPORT_PIECE_CHARS characters of values or EXPORT_PIECE_MS milliseconds, at least one row), each
// piece is written, and then the page gets a turn (js/lab/import-pace.js) and Cancel is looked at.
// One table is a CSV file; two or more are a zip, written by the zip library (fflate, vendored,
// loaded when Export is pressed and not before) one entry after the other. Every file starts with the
// byte-order mark and the row of column names. The file is kept in the page's memory until it is
// saved. A table that the engine cannot read to its end stops the whole export: nothing is saved and
// nothing is recorded, and the message names the table and gives the engine's words. The same holds,
// each with words of its own, for a file or a zip that could not be made, a zip that would pass what
// one without Zip64 holds, a browser that ran out of memory (the engine's own memory too: that is
// said as the browser's, and no table is named for it), and Cancel (which says so in a toast).
//
// When the file has been handed to the browser one event of the evidence log is recorded for it
// (js/lab/events.js): its name and size, then each table with the rows that were written (not the
// count shown before: a view can give other rows than it counted), then a toast says it. From the
// moment the browser has the file nothing can turn the export into a failed one: what goes wrong
// after that is noted for the developer and not shown. A database is never changed by an export.
// Another long job and this one never overlap: the page starts no import during an export and no
// export during an import, and no load of another database begins meanwhile.
//
//   fileSink(type), zipSink(fflate, type, entries, limits?), sinkFor(plan, zipTool, limits?)
//     The place the bytes of the file go (below), and the one a plan asks for. They are handed out
//     for the tests, which give a zip small limits.

import { NO_DATABASE_MESSAGE } from "./config.js";
import {
    EXPORT_TABLES_BUSY_MESSAGE,
    EXPORT_TABLES_CANCELLED_MESSAGE,
    EXPORT_TABLES_FAILED_MESSAGE,
    EXPORT_TABLES_FILE_FAILED_MESSAGE,
    EXPORT_TABLES_GONE_MESSAGE,
    EXPORT_TABLES_LIBRARY_FAILED_MESSAGE,
    EXPORT_TABLES_LIST_FAILED_MESSAGE,
    EXPORT_TABLES_LOADING_DIALOG_MESSAGE,
    EXPORT_TABLES_LOADING_MESSAGE,
    EXPORT_TABLES_NONE_MESSAGE,
    EXPORT_TABLES_OUT_OF_MEMORY_MESSAGE,
    EXPORT_TABLES_SAVE_FAILED_MESSAGE,
    EXPORT_TABLES_ZIP_FAILED_MESSAGE,
    EXPORT_TABLES_ZIP_TOO_BIG_MESSAGE,
    EXPORT_PIECE_CHARS,
    EXPORT_PIECE_MS,
    EXPORT_ZIP_LEVEL,
    exportEventFileLine,
    exportEventTableLine,
    exportTablesFailedText,
    exportedTablesMessage,
} from "./config-workflow.js";
import { recordEvent } from "./events.js";
import { CSV_BOM, headerText, planOutput, rowText, zipProblem } from "./export-csv.js";
import { countRows, listObjects, openRows } from "./export-read.js";
import { mountTableExportDialog } from "./export-tables-dialog.js";
import { saveFile } from "./export.js";
import { flagOn } from "./flags.js";
import { isEngineError, isOutOfMemory } from "./import-db.js";
import { newPace, nextFrame } from "./import-pace.js";
import { engineLine } from "./runner.js";
import { toast } from "./toast.js";
import { loadVendor } from "./vendor-loader.js";

// how often Cancel is looked at while the zip tool is awaited
const CANCEL_LOOK_MS = 100;

// thrown between two pieces of work when the student has cancelled
class ExportCancelled extends Error {}
// the engine could not read a table to its end: {table, cause}
class TableFailed extends Error {
    constructor(table, cause) {
        super("a table could not be read");
        this.table = table;
        this.cause = cause;
    }
}
// the file or the zip could not be made: `shown` is what the student is told
class OutputFailed extends Error {
    constructor(shown, options) {
        super(shown, options);
        this.shown = shown;
    }
}

// The page could not hold what it was making: the engine or its allocator said so, or the browser
// refused a text or an array of that size (a RangeError; Firefox has an error of its own).
const pastMemory = (error) => isOutOfMemory(error) || error instanceof RangeError || error?.name === "InternalError";

const encoder = new TextEncoder();

// A zip keeps the date of an entry as a year from 1980 to 2099, and the library refuses any other:
// on a computer whose clock is far off, an entry is dated at the nearer end and the zip is made.
function zipDate() {
    const now = new Date();
    const year = now.getFullYear();
    if (year < 1980) {
        return new Date(1980, 0, 1);
    }
    return year > 2099 ? new Date(2099, 11, 31, 23, 59, 58) : now;
}

// The place the bytes of the file go. begin(name) starts an entry (a file has one, a zip many),
// write(bytes) adds to it, end() closes it; problem() gives an OutputFailed when the output cannot
// go on, or null; finish() gives the Blob. Nothing here knows CSV.
export function fileSink(type) {
    const parts = [];
    return {
        begin() {},
        write(bytes) {
            parts.push(bytes);
        },
        end() {},
        problem: () => null,
        finish: () => new Blob(parts, { type }),
    };
}

// `entries` is how many entries the zip will be given: one that could not hold them is refused
// before anything is read. `limits` ({maxEntries, maxBytes}) are those of zipProblem.
export function zipSink(fflate, type, entries = 0, limits = undefined) {
    const parts = [];
    let size = 0;
    let first = null;
    let largest = 0;
    let entryBytes = 0;
    let entry = null;
    let count = 0;
    const zip = new fflate.Zip((failure, chunk) => {
        if (failure) {
            first ??= failure;
            return;
        }
        // (a copy: nothing says that a chunk the library hands over is not a buffer it goes on using)
        parts.push(chunk.slice());
        size += chunk.length;
    });
    return {
        begin(name) {
            entry = new fflate.ZipDeflate(name, { level: EXPORT_ZIP_LEVEL });
            // (a property of the entry, set before it is added: an option of the same name is ignored)
            entry.mtime = zipDate();
            zip.add(entry);
            count++;
            entryBytes = 0;
        },
        write(bytes) {
            entryBytes += bytes.length;
            entry.push(bytes, false);
        },
        end() {
            entry.push(new Uint8Array(0), true);
            largest = Math.max(largest, entryBytes);
            entry = null;
        },
        problem() {
            if (first) {
                return new OutputFailed(EXPORT_TABLES_ZIP_FAILED_MESSAGE, { cause: first });
            }
            // (the zip's own size, and what one entry held before it was deflated: both are 32 bits in a zip)
            return zipProblem(Math.max(count, entries), Math.max(size, largest, entryBytes), limits)
                ? new OutputFailed(EXPORT_TABLES_ZIP_TOO_BIG_MESSAGE)
                : null;
        },
        finish() {
            zip.end();
            const failed = this.problem();
            if (failed) {
                throw failed;
            }
            return new Blob(parts, { type });
        },
    };
}

// The place the bytes go for this plan: a file's, or a zip's that is told how many entries the
// plan has. A zip that cannot hold that many is refused here, before any table is read: what the
// sink says is thrown. run makes its sink in no other way. A kind of output that has no sink here
// throws: the sink of a file would write CSV text under that kind's name and type.
export function sinkFor(plan, zipTool, limits = undefined) {
    let sink;
    if (plan.kind === "zip") {
        sink = zipSink(zipTool, plan.type, plan.entries.length, limits);
    } else if (plan.kind === "file") {
        sink = fileSink(plan.type);
    } else {
        throw new TypeError(`unknown kind of output: ${plan.kind}`);
    }
    const refused = sink.problem();
    if (refused) {
        throw refused;
    }
    return sink;
}

export function mountTableExport({ returnFocus, getDatabase, isLoading = () => false, otherJobMessage = () => null, runLog, onBusy = () => {} }) {
    const enabled = flagOn("export");
    let running = false;
    if (!enabled) {
        return { enabled, open() {} };
    }

    // The library is asked for, and Cancel looked at every CANCEL_LOOK_MS while it is awaited, so
    // that the busy state never outlives a closed dialog by long. Gives the library, or null when
    // it could not be loaded; after a Cancel it gives a word in its place, which the caller's next
    // look at Cancel never lets through.
    async function loadZipTool(library, cancelled) {
        let timer = 0;
        const stopped = new Promise((resolve) => {
            timer = setInterval(() => {
                if (cancelled()) {
                    resolve("cancelled");
                }
            }, CANCEL_LOOK_MS);
        });
        const loading = loadVendor(library.file, library.global).then(
            (tool) => tool,
            () => null
        );
        try {
            return await Promise.race([loading, stopped]);
        } finally {
            clearInterval(timer);
        }
    }

    async function run(job, { progress, cancelled }) {
        if (running) {
            return { ok: false, message: EXPORT_TABLES_BUSY_MESSAGE };
        }
        if (isLoading()) {
            // another database is on its way: when it opens it closes the one that is open now
            return { ok: false, message: EXPORT_TABLES_LOADING_DIALOG_MESSAGE };
        }
        const other = otherJobMessage();
        if (other) {
            return { ok: false, message: other };
        }
        if (getDatabase() !== job.database) {
            return { ok: false, message: EXPORT_TABLES_GONE_MESSAGE };
        }
        const { plan } = job;
        const look = () => {
            if (cancelled()) {
                throw new ExportCancelled();
            }
        };
        // what went wrong while the file was being made, in the words the student is given
        const outputFailure = (failure) => {
            if (failure instanceof OutputFailed) {
                return failure;
            }
            if (pastMemory(failure)) {
                return new OutputFailed(EXPORT_TABLES_OUT_OF_MEMORY_MESSAGE, { cause: failure });
            }
            return new OutputFailed(plan.kind === "zip" ? EXPORT_TABLES_ZIP_FAILED_MESSAGE : EXPORT_TABLES_FILE_FAILED_MESSAGE, { cause: failure });
        };
        // What the reader threw: the engine's refusal of a table, or something that is not the
        // table's doing. An engine that had no memory left is of the second kind: another try, or
        // fewer tables, can go well, so the table is not named and its row is not closed.
        const readFailure = (table, failure) =>
            isEngineError(failure) && !isOutOfMemory(failure) ? new TableFailed(table, failure) : failure;
        running = true;
        onBusy(true);
        let reader = null;
        try {
            await nextFrame();
            look();
            let zipTool = null;
            if (plan.library) {
                progress({ library: true });
                zipTool = await loadZipTool(plan.library, cancelled);
                look();
                if (!zipTool) {
                    return { ok: false, message: EXPORT_TABLES_LIBRARY_FAILED_MESSAGE };
                }
            }
            let sink;
            try {
                // (more tables than a zip holds: said here, before any of them is read)
                sink = sinkFor(plan, zipTool);
            } catch (failure) {
                throw outputFailure(failure);
            }
            const pace = newPace();
            const allRows = job.tables.reduce((sum, table) => sum + table.count, 0);
            const written = [];
            const blobTables = [];
            let doneRows = 0;
            for (const [index, table] of job.tables.entries()) {
                const entry = plan.entries[index];
                look();
                try {
                    reader = openRows(job.database, table.name);
                } catch (failure) {
                    throw readFailure(table.name, failure);
                }
                look();
                try {
                    sink.begin(entry.name);
                    sink.write(CSV_BOM);
                    sink.write(encoder.encode(headerText(reader.columns)));
                } catch (failure) {
                    throw outputFailure(failure);
                }
                let rows = 0;
                let blobs = 0;
                const report = () =>
                    progress({ at: index + 1, of: job.tables.length, name: table.name, rows, count: table.count, doneRows, allRows });
                report();
                for (;;) {
                    let piece;
                    try {
                        piece = reader.next({ chars: EXPORT_PIECE_CHARS, ms: EXPORT_PIECE_MS });
                    } catch (failure) {
                        throw readFailure(table.name, failure);
                    }
                    let text = "";
                    for (const row of piece.rows) {
                        const made = rowText(row.kinds, row.values);
                        text += made.text;
                        blobs += made.blobs;
                    }
                    try {
                        if (text) {
                            sink.write(encoder.encode(text));
                        }
                        const failed = sink.problem();
                        if (failed) {
                            throw failed;
                        }
                    } catch (failure) {
                        throw outputFailure(failure);
                    }
                    rows += piece.rows.length;
                    doneRows += piece.rows.length;
                    report();
                    // (a turn for the page, and a look at Cancel, after every piece: the last one too)
                    await pace.rest();
                    look();
                    if (piece.done) {
                        break;
                    }
                }
                reader.close();
                reader = null;
                try {
                    sink.end();
                } catch (failure) {
                    throw outputFailure(failure);
                }
                written.push({ name: table.name, rows, entry: entry.name });
                if (blobs) {
                    blobTables.push(table.name);
                }
            }
            look();
            let blob;
            try {
                blob = sink.finish();
            } catch (failure) {
                throw outputFailure(failure);
            }
            try {
                saveFile(blob, plan.fileName, plan.type);
            } catch (failure) {
                console.debug("the browser did not take the file", failure);
                return { ok: false, message: EXPORT_TABLES_SAVE_FAILED_MESSAGE };
            }
            // The browser has the file. Nothing from here on may say that the export failed: the
            // event and the toast are tried, and what they throw is not the student's to hear.
            try {
                const lines = [exportEventFileLine(plan.fileName, blob.size)];
                for (const one of written) {
                    lines.push(plan.kind === "zip" ? exportEventTableLine(one.name, one.rows, one.entry) : exportEventTableLine(one.name, one.rows));
                }
                recordEvent(runLog.current().key, { kind: "export", lines });
                toast(
                    exportedTablesMessage(plan.fileName, plan.kind === "zip" ? { tables: written.length } : { rows: written[0].rows })
                );
            } catch (failure) {
                console.debug("the file was saved, and the export could not be noted or told", failure);
            }
            return {
                ok: true,
                fileName: plan.fileName,
                written,
                notes: blobTables.length ? [{ kind: "blob", tables: blobTables }] : [],
            };
        } catch (failure) {
            if (failure instanceof ExportCancelled) {
                toast(EXPORT_TABLES_CANCELLED_MESSAGE, { tone: "note" });
                return { ok: false, cancelled: true };
            }
            if (failure instanceof TableFailed) {
                const reason = engineLine(failure.cause);
                return { ok: false, table: failure.table, reason, message: exportTablesFailedText(failure.table, reason) };
            }
            if (failure instanceof OutputFailed) {
                console.debug("the file could not be made", failure.cause ?? failure);
                return { ok: false, message: failure.shown };
            }
            console.debug("the export failed", failure);
            return { ok: false, message: pastMemory(failure) ? EXPORT_TABLES_OUT_OF_MEMORY_MESSAGE : EXPORT_TABLES_FAILED_MESSAGE };
        } finally {
            try {
                // (a reader left open would keep the database from being closed)
                reader?.close();
            } catch (failure) {
                console.debug("a reader could not be closed", failure);
            } finally {
                // (whatever happened above, the page is told that the export has ended)
                running = false;
                onBusy(false);
            }
        }
    }

    const dialog = mountTableExportDialog({
        returnFocus,
        getDatabase,
        list: listObjects,
        count: countRows,
        plan: (database, names) => planOutput({ format: "csv", databaseName: database.name, tables: names }),
        onExport: run,
    });

    function open() {
        if (!getDatabase()) {
            toast(NO_DATABASE_MESSAGE, { tone: "note" });
            return;
        }
        if (running) {
            toast(EXPORT_TABLES_BUSY_MESSAGE, { tone: "note" });
            return;
        }
        const other = otherJobMessage();
        if (other) {
            toast(other, { tone: "note" });
            return;
        }
        if (isLoading()) {
            toast(EXPORT_TABLES_LOADING_MESSAGE, { tone: "note" });
            return;
        }
        let opened;
        try {
            opened = dialog.open();
        } catch (failure) {
            console.debug("the tables could not be listed", failure);
            toast(EXPORT_TABLES_LIST_FAILED_MESSAGE, { tone: "problem" });
            return;
        }
        if (!opened) {
            toast(EXPORT_TABLES_NONE_MESSAGE, { tone: "note" });
        }
    }

    return { enabled, open };
}
