// Import of CSV files (assessment plan, sections 3 and 7; its Phase 2, flag "import"): what the
// page does with files a student chooses or drops, once the flag is on. With the flag off none
// of this runs: a choice and a drop are what they were (js/index.js).
//
//   mountImport(page) -> {enabled, take(files), busy()}
//     enabled        the flag, as it was when the page loaded (js/lab/flags.js)
//     take(files)    what to do with files that were chosen or dropped. false: not the import's
//                    (one file that is not the import's: it is opened as today). true:
//                    taken. Files of the five kinds (.csv .tsv .txt .xlsx .xls, in any letter
//                    case), and files ending in .xlsm, .xlsb or .ods (which the dialog refuses
//                    by name), one or several, open the dialog (js/lab/import-dialog.js); a choice
//                    that mixes them with a database or a script, or that holds more than one
//                    database or script, is refused in a toast before any dialog opens, and so
//                    are files that come while a database is loading (the open one is about to
//                    be replaced).
//     busy()         an import is running: js/index.js refuses Run, Check, the database export
//                    and every way of opening another database meanwhile
//     run(job, {progress, cancelled})  what the dialog calls when Import is pressed; exported for the
//                    tests, which call it with a job made by hand (see below)
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
//     otherJobMessage()      optional: the busy message of another long job that is running (a
//                            table export, js/lab/export-tables.js), or null. While it gives one,
//                            files are not taken and Import is refused with it.
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
// With the flag "excel-import" on too (read once, here, and handed to the dialog), a job may hold
// sheets of workbooks as well. job.files is a list of entries in the order of the dialog's tabs:
//   a text file     {id, file, encoding, delimiter, newline, hasNames, namesRow, tableName, mark}
//   a sheet         {id, file, sheet, hasNames, namesRow, tableName, listed}
// sheet is the sheet as js/lab/import-cells.js made it (the workbook's own object travels inside it,
// and is reached only through tableOf and storedRow), file the File of the workbook, and listed how
// many sheets the workbook lists (the number of its entries when it is left out: a web page with one
// table is a table with no sheet to name, one with several names each by its label). A sheet is never
// refused here: what can stop one (no values, too wide, a row of names beyond it) is decided in the
// dialog before Import can be pressed. Its table is worked out in a first pass, then made at once, typed,
// and filled in steps of IMPORT_SHEET_CELLS cells with the page's turn between two steps (js/lab/import-db.js
// newTypedTable); there is no staging table. The reader of text files is loaded only when the job holds a
// text file. progress is called with {at, of, name, part, done, total}: at of the tables, name the file's, and
// table the name of the table made from a sheet (null for a text file); part is "read" or "copy".
//
// job.left (optional) lists the files of the dialog that gave no table, [{name, why}], in the tabs' order. When
// there are some, the sentence that says what was imported (the summary line, the toast and the announcement)
// says how many files were not imported, and the report names them (js/lab/import-report.js). The events
// of the evidence log list what was imported, and are the same.
//
// When it has finished: one event for each file goes into the evidence log (js/lab/events.js; a
// workbook's tables are the lines of one event: js/lab/import-events.js), under the log key of
// the database that now holds the tables, and the report is shown in the results pane
// (js/lab/import-report.js).

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
    IMPORT_MIXED_WITH_EXCEL_MESSAGE,
    IMPORT_NO_NAMES_ROW_REASON,
    IMPORT_NOT_OPENED_MESSAGE,
    IMPORT_OUT_OF_MEMORY_MESSAGE,
    IMPORT_SEVERAL_DATABASES_MESSAGE,
    IMPORT_SHEET_CELLS,
    IMPORT_SLICE_BYTES,
    IMPORT_TOO_WIDE_REASON,
    IMPORT_UNREADABLE_REASON,
    importPageSource,
    importSheetSource,
    importedWithLeftMessage,
} from "./config-workflow.js";
import { recordEvent } from "./events.js";
import { flagOn } from "./flags.js";
import { ImportRefused, newTableReader, readPieces } from "./import-csv.js";
import { storedRow, tableOf } from "./import-cells.js";
import { beginImport, endImport, isEngineError, isOutOfMemory, namesNeedingQuotes, newStage, newTypedTable, takenNames, undoImport } from "./import-db.js";
import { mountImportDialog } from "./import-dialog.js";
import { importEvents } from "./import-events.js";
import { newPace } from "./import-pace.js";
import { buildImportReport } from "./import-report.js";
import { OTHER_SPREADSHEET_NAME, TextChanged, sameStart, textPieces } from "./import-text.js";
import { inspectWorkbook, readWorkbook } from "./import-workbook.js";
import { toast } from "./toast.js";
import { loadVendor } from "./vendor-loader.js";

const IMPORT_NAME = /\.(?:csv|tsv|txt|xlsx|xls)$/i;
const READER_FILE = "papaparse.min.js";
const READER_GLOBAL = "Papa";
const EXCEL_FILE = "xlsx.full.min.js";
const EXCEL_GLOBAL = "XLSX";

const REFUSAL_TEXT = {
    "too-wide": IMPORT_TOO_WIDE_REASON,
    "no-names-row": IMPORT_NO_NAMES_ROW_REASON,
    empty: IMPORT_EMPTY_REASON,
    unreadable: IMPORT_UNREADABLE_REASON,
    changed: IMPORT_CHANGED_REASON,
};

// thrown between two pieces of work when the student has cancelled
class ImportCancelled extends Error {}

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
    otherJobMessage = () => null,
}) {
    const enabled = flagOn("import");
    let running = false;
    if (!enabled) {
        return { enabled, take: () => false, busy: () => false };
    }
    // several files can be chosen together
    fileInput.multiple = true;
    // Workbooks as well (flag "excel-import", which is off without "import"): read here once, as the
    // other is, and handed to the dialog with what it needs to read a workbook.
    const excel = flagOn("excel-import");

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
                origin: item.file,
                file: item.file.name,
                sheet: null,
                badQuotes: read.badQuotes,
                quoted: namesNeedingQuotes(database, item.tableName, made.columns.map((column) => column.name)),
            };
        } finally {
            stage.drop();
        }
    }

    // one sheet: its table is worked out, made at once with its types, and filled in steps
    async function importSheet(database, item, { cancelled, report, pace, listed }) {
        const rest = async () => {
            await pace.rest();
            if (cancelled()) {
                throw new ImportCancelled();
            }
        };
        const { sheet } = item;
        const cells = sheet.rows * sheet.columns;
        let looked = 0;
        report("read", 0, cells);
        const table = await tableOf(sheet, {
            hasNames: item.hasNames,
            namesRow: item.namesRow,
            // (the first pass, a step of cells at a time: what is counted is cells, of the rectangle)
            rest: async () => {
                looked = Math.min(looked + IMPORT_SHEET_CELLS, cells);
                report("read", looked, cells);
                await rest();
            },
        });
        const typed = newTypedTable(database, item.tableName, table.columns);
        let finished = false;
        try {
            report("copy", 0, table.rows);
            const step = Math.max(1, Math.floor(IMPORT_SHEET_CELLS / Math.max(1, table.width)));
            for (let done = 0; done < table.rows; done += step) {
                const end = Math.min(done + step, table.rows);
                for (let i = done; i < end; i++) {
                    typed.add(storedRow(table, i));
                }
                report("copy", end, table.rows);
                await rest();
            }
            typed.finish();
            finished = true;
        } finally {
            if (!finished) {
                typed.abandon();
            }
        }
        // (a web page of one table is no sheet: the file's name says where it came from)
        const alone = sheet.page && listed === 1;
        const label = item.label ?? sheet.label;
        return {
            name: item.tableName,
            rows: table.rows,
            columns: table.columns,
            source: alone ? item.file.name : sheet.page ? importPageSource(item.file.name, label) : importSheetSource(item.file.name, label),
            bytes: item.file.size,
            origin: item.file,
            file: item.file.name,
            sheet: alone ? null : label,
            badQuotes: false,
            quoted: namesNeedingQuotes(database, item.tableName, table.columns.map((column) => column.name)),
            emptyFormulas: table.emptyFormulas,
            padded: table.padded,
        };
    }

    async function run(job, { progress, cancelled }) {
        const own = job.destination.kind === "new";
        if (isLoading()) {
            // another database is on its way: when it opens it closes the one that is open now
            return { ok: false, message: IMPORT_LOADING_DIALOG_MESSAGE };
        }
        const otherJob = otherJobMessage();
        if (otherJob) {
            // (an export reads the database an import would write to)
            return { ok: false, message: otherJob };
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
            // (the reader of text files, and only when there is a text file to read: a job of sheets has
            // no use for it, and does not fail when it cannot be loaded)
            const reader = job.files.some((item) => !item.sheet) ? await loadReader().catch(() => null) : null;
            if (!reader && job.files.some((item) => !item.sheet)) {
                return { ok: false, message: IMPORT_LIBRARY_FAILED_MESSAGE };
            }
            database = own ? await manager.init(job.destination.name, new DatabasePath("")) : getDatabase();
            ticket = beginImport(database);
            const pace = newPace();
            const tables = [];
            for (const [index, item] of job.files.entries()) {
                current = item;
                const table = item.sheet ? item.tableName : null;
                const report = (part, done, total) => progress({ at: index + 1, of: job.files.length, name: item.file.name, table, part, done, total });
                if (item.sheet) {
                    const listed = item.listed ?? job.files.filter((other) => other.file === item.file).length;
                    tables.push(await importSheet(database, item, { cancelled, report, pace, listed }));
                } else {
                    report("read", 0, item.file.size);
                    tables.push(await importFile(database, item, { reader, pace, cancelled, report }));
                }
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
            for (const event of importEvents(tables)) {
                recordEvent(key, { kind: "import", lines: event.lines });
            }
            const left = job.left ?? [];
            const said = importedWithLeftMessage(tables.length, name, left.length);
            results.showReport(buildImportReport(tables, { left }), { summary: said });
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
        // what the dialog reads a workbook with (null: the dialog is the one of the import alone)
        excel: excel ? { loadLibrary: () => loadVendor(EXCEL_FILE, EXCEL_GLOBAL), inspectWorkbook, readWorkbook } : null,
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
        const ours = files.filter((file) => IMPORT_NAME.test(file.name) || OTHER_SPREADSHEET_NAME.test(file.name));
        if (files.length === 1 && !ours.length) {
            return false;
        }
        if (running) {
            toast(IMPORT_BUSY_MESSAGE, { tone: "note" });
            return true;
        }
        const otherJob = otherJobMessage();
        if (otherJob) {
            toast(otherJob, { tone: "note" });
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
            toast(excel ? IMPORT_MIXED_WITH_EXCEL_MESSAGE : IMPORT_MIXED_MESSAGE, { tone: "note" });
            return true;
        }
        dialog.open(files);
        return true;
    }

    return { enabled, take, busy: () => running, run };
}
