// Import of CSV files (assessment plan, sections 3 and 7; its Phase 2, flag "import"): what the
// page does with files a student chooses or drops, once the flag is on. With the flag off none
// of this runs: a choice and a drop are what they were (js/index.js).
//
//   mountImport(page) -> {enabled, take(files), busy(), dialogOpen()}
//     enabled        the flag, as it was when the page loaded (js/lab/flags.js)
//     take(files)    what to do with files that were chosen or dropped. false: not the import's
//                    (one file that is not one of the five kinds: it is opened as today). true:
//                    taken. Files of the five kinds (.csv .tsv .txt .xlsx .xls, in any letter
//                    case), one or several, open the dialog (js/lab/import-dialog.js); a choice
//                    that mixes them with a database or a script, or that holds more than one
//                    database or script, is refused in a toast before any dialog opens, and so
//                    are files that come while a database is loading (the open one is about to
//                    be replaced).
//     busy()         an import is running: js/index.js refuses Run, Check, the database export
//                    and every way of opening another database meanwhile
//     dialogOpen()   the dialog is open (a drop is ignored then, and Ctrl+O)
//
//   page, what the import needs from js/index.js:
//     fileInput              the hidden file input: with the flag on it takes several files
//     returnFocus            where the focus goes when the dialog closes
//     getDatabase()          the open database, or null/undefined
//     getDatabaseLabel()     its name as the page shows it (a course database's is its title)
//     isCourseDatabase()     true when it was opened from the list of course databases: files are
//                            never imported into one
//     isLoading()            true while a database is on its way to replace the open one: no
//                            import starts then
//     openBuilt(database)    -> Promise<boolean>: makes a database that was built apart the open
//                            one, as an opened file is (the address becomes "./", its run log is
//                            kept under its name)
//     announceChanged(database)  tells the page that the open database gained tables
//     runLog, results        js/lab/run-log.js and js/lab/results.js as mounted
//     showResult()           brings the results pane into view (on a phone it is a view of its own)
//     onBusy(busy)           called when an import starts (true) and when it has ended (false)
//
// An import either finishes or leaves nothing. A new database is built apart from the open one,
// which stays open and untouched until the import has finished; a refusal, a failure or Cancel
// closes the half-built one. In the open database the import is a savepoint (js/lab/import-db.js).
// An import and the loading of a database never overlap: js/index.js starts no load while an
// import runs, and no import starts while a load is on its way (a load that ended in the middle
// of an import would close the database it writes to). The dialog closes when another database
// opens under it (Back and Forward can do that), and the destination is looked at again when
// Import is pressed: files never go into a course database.
// Each file is read in slices into an all-text staging table and copied from there into its
// typed table, and between two slices the page gets a turn (js/lab/import-pace.js): the dialog
// shows the progress, and Cancel is honoured.
//
// When it has finished: one event for each file goes into the evidence log (js/lab/events.js),
// under the log key of the database that now holds the tables, and the report is shown in the
// results pane (js/lab/import-report.js).

import manager from "../sqlite/manager.js";
import { DatabasePath } from "../db-path.js";
import {
    IMPORT_BUSY_MESSAGE,
    IMPORT_CHANGED_REASON,
    IMPORT_DESTINATION_GONE_MESSAGE,
    IMPORT_EMPTY_REASON,
    IMPORT_FAILED_MESSAGE,
    IMPORT_LIBRARY_FAILED_MESSAGE,
    IMPORT_LOADING_DIALOG_MESSAGE,
    IMPORT_LOADING_MESSAGE,
    IMPORT_LOST_TRANSACTION_MESSAGE,
    IMPORT_MIXED_MESSAGE,
    IMPORT_NO_NAMES_ROW_REASON,
    IMPORT_NOT_OPENED_MESSAGE,
    IMPORT_OUT_OF_MEMORY_MESSAGE,
    IMPORT_SEVERAL_DATABASES_MESSAGE,
    IMPORT_SLICE_BYTES,
    IMPORT_TOO_WIDE_REASON,
    IMPORT_UNREADABLE_REASON,
    importEventFileLine,
    importEventTableLine,
    importedMessage,
} from "./config-workflow.js";
import { recordEvent } from "./events.js";
import { flagOn } from "./flags.js";
import { ImportRefused, newTableReader, readPieces } from "./import-csv.js";
import { beginImport, endImport, isOutOfMemory, newStage, takenNames, undoImport } from "./import-db.js";
import { mountImportDialog } from "./import-dialog.js";
import { newPace } from "./import-pace.js";
import { buildImportReport } from "./import-report.js";
import { TextChanged, sameStart, textPieces } from "./import-text.js";
import { toast } from "./toast.js";
import { loadVendor } from "./vendor-loader.js";

const IMPORT_NAME = /\.(?:csv|tsv|txt|xlsx|xls)$/i;
const READER_FILE = "papaparse.min.js";
const READER_GLOBAL = "Papa";

const REFUSAL_TEXT = {
    "too-wide": IMPORT_TOO_WIDE_REASON,
    "no-names-row": IMPORT_NO_NAMES_ROW_REASON,
    empty: IMPORT_EMPTY_REASON,
    unreadable: IMPORT_UNREADABLE_REASON,
    changed: IMPORT_CHANGED_REASON,
};

// thrown between two pieces of work when the student has cancelled
class ImportCancelled extends Error {}

const isEngineError = (error) => error?.name === "SQLite3Error" || error?.name === "WasmAllocError";

export function mountImport({
    fileInput,
    returnFocus,
    getDatabase,
    getDatabaseLabel,
    isCourseDatabase,
    isLoading = () => false,
    openBuilt,
    announceChanged,
    runLog,
    results,
    showResult,
    onBusy = () => {},
}) {
    const enabled = flagOn("import");
    let running = false;
    if (!enabled) {
        return { enabled, take: () => false, busy: () => false, dialogOpen: () => false };
    }
    // several files can be chosen together
    fileInput.multiple = true;

    const loadReader = () => loadVendor(READER_FILE, READER_GLOBAL);

    // one file: read into a staging table, then copied into its typed table
    async function importFile(database, item, { reader, pace, cancelled, report }) {
        const rest = async () => {
            await pace.rest();
            if (cancelled()) {
                throw new ImportCancelled();
            }
        };
        const table = newTableReader({ hasNames: item.hasNames, namesRow: item.namesRow });
        const stage = newStage(database);
        try {
            const text = textPieces(item.file, item.encoding, {
                sliceBytes: IMPORT_SLICE_BYTES,
                between: async (read) => {
                    report("read", read, item.file.size);
                    await rest();
                },
            });
            // (the text must still start with what the preview was read from: the settings on
            // show were found in that text)
            const pieces = item.mark ? sameStart(text, item.mark) : text;
            let read;
            try {
                read = await readPieces(reader, pieces, {
                    delimiter: item.delimiter,
                    newline: item.newline,
                    onRows: (rows) => stage.add(table.take(rows)),
                });
            } catch (error) {
                if (error instanceof ImportCancelled || error instanceof ImportRefused || isEngineError(error)) {
                    throw error;
                }
                if (error instanceof TextChanged) {
                    throw new ImportRefused("changed");
                }
                // the file could not be read to its end, or its bytes stopped fitting the encoding
                throw new ImportRefused("unreadable");
            }
            const made = table.finish();
            await stage.copyInto(item.tableName, made.columns, { rest, onStep: (done, total) => report("copy", done, total) });
            return {
                name: item.tableName,
                rows: made.rows,
                columns: made.columns,
                source: item.file.name,
                bytes: item.file.size,
                badQuotes: read.badQuotes,
            };
        } finally {
            stage.drop();
        }
    }

    async function run(job, { progress, cancelled }) {
        const own = job.destination.kind === "new";
        if (isLoading()) {
            // another database is on its way: when it opens it closes the one that is open now
            return { ok: false, message: IMPORT_LOADING_DIALOG_MESSAGE };
        }
        if (!own && (!getDatabase() || isCourseDatabase())) {
            // (the dialog does not offer this: the open database is looked at again all the same)
            return { ok: false, message: IMPORT_DESTINATION_GONE_MESSAGE };
        }
        running = true;
        onBusy(true);
        let database = null;
        let ticket = null;
        let current = null;
        try {
            const reader = await loadReader().catch(() => null);
            if (!reader) {
                return { ok: false, message: IMPORT_LIBRARY_FAILED_MESSAGE };
            }
            database = own ? await manager.init(job.destination.name, new DatabasePath("")) : getDatabase();
            ticket = beginImport(database);
            const pace = newPace();
            const tables = [];
            for (const [index, item] of job.files.entries()) {
                current = item;
                const report = (part, done, total) => progress({ at: index + 1, of: job.files.length, name: item.file.name, part, done, total });
                report("read", 0, item.file.size);
                tables.push(await importFile(database, item, { reader, pace, cancelled, report }));
            }
            endImport(database);
            ticket = null;
            if (own) {
                const built = database;
                // (from here on the page owns it, and closes it if it cannot open it)
                database = null;
                if (!(await openBuilt(built))) {
                    return { ok: false, message: IMPORT_NOT_OPENED_MESSAGE };
                }
            } else {
                announceChanged(database);
            }
            const name = getDatabase().name;
            const key = runLog.current().key;
            for (const table of tables) {
                recordEvent(key, {
                    kind: "import",
                    lines: [importEventFileLine(table.source, table.bytes), importEventTableLine(table.name, table.rows, table.columns.length)],
                });
            }
            const said = importedMessage(tables.length, name);
            results.showReport(buildImportReport(tables), { summary: said });
            showResult();
            toast(said);
            return { ok: true };
        } catch (error) {
            let lostTransaction = false;
            if (database && ticket) {
                ({ lostTransaction } = undoImport(database, ticket));
            }
            if (error instanceof ImportCancelled) {
                return { ok: false, cancelled: true };
            }
            if (error instanceof ImportRefused && current) {
                return { ok: false, refused: { id: current.id, reason: REFUSAL_TEXT[error.reason] ?? IMPORT_UNREADABLE_REASON } };
            }
            // (the engine undoes a whole transaction for some failures, the student's own
            // included: they are told, whatever the failure was. A database built for the import
            // never had one of theirs.)
            const alsoLost = lostTransaction ? IMPORT_LOST_TRANSACTION_MESSAGE : "";
            if (isOutOfMemory(error)) {
                return { ok: false, message: `${IMPORT_OUT_OF_MEMORY_MESSAGE}${alsoLost}` };
            }
            console.debug("the import failed", error);
            return { ok: false, message: `${IMPORT_FAILED_MESSAGE}${alsoLost}` };
        } finally {
            if (own && database) {
                // a database built apart that did not become the open one: nothing is left of it
                try {
                    database.db.close();
                } catch {
                    // (closed already)
                }
            }
            running = false;
            onBusy(false);
        }
    }

    const dialog = mountImportDialog({
        returnFocus,
        loadReader,
        getDestination() {
            const database = getDatabase();
            return {
                name: database ? getDatabaseLabel() : null,
                allowed: Boolean(database) && !isCourseDatabase(),
                taken: () => (database ? takenNames(database) : new Map()),
            };
        },
        onImport: run,
    });

    function take(files) {
        const ours = files.filter((file) => IMPORT_NAME.test(file.name));
        if (files.length === 1 && !ours.length) {
            return false;
        }
        if (running) {
            toast(IMPORT_BUSY_MESSAGE, { tone: "note" });
            return true;
        }
        if (ours.length && isLoading()) {
            toast(IMPORT_LOADING_MESSAGE, { tone: "note" });
            return true;
        }
        if (!ours.length) {
            toast(IMPORT_SEVERAL_DATABASES_MESSAGE, { tone: "note" });
            return true;
        }
        if (ours.length !== files.length) {
            toast(IMPORT_MIXED_MESSAGE, { tone: "note" });
            return true;
        }
        dialog.open(files);
        return true;
    }

    return { enabled, take, busy: () => running, dialogOpen: dialog.isOpen };
}
