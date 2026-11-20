// Reading one workbook (assessment plan, section 3: "Where it starts", "Excel cells", "Libraries").
// No DOM, no storage, no engine. What needs the page is handed in: the spreadsheet library
// (loaded on demand), a rest and a frame (js/lab/import-pace.js), and a question whether the
// dialog is still the one that began the reading. A file's kind is js/lab/import-text.js's
// kindByStart: "zip" (an .xlsx), "ole2" (an .xls, or a workbook locked with a password) or "markup"
// (a web page or an XML spreadsheet saved under an Excel name).
//
//   inspectWorkbook(file, kind) -> Promise<{refused: text} | {ask, directory} | {go: true, directory}>
//       What the limits say, before the file is read; it reads no more than the end of the file (the
//       zip's directory) and nothing at all for any other kind. It does not throw: a file that cannot
//       be read (changed or removed after it was chosen) is refused with IMPORT_UNREADABLE_REASON.
//       directory is the zip's, as
//       js/lab/import-zip.js reads it, or null (a kind that is no zip, and a zip whose directory
//       cannot be read: the caller then goes on without the zip check). refused is the text of the
//       reason (js/lab/config-workflow.js), for the tab to say:
//         a zip that is cut short                          IMPORT_WORKBOOK_CUT_REASON
//         a zip with no workbook part in it (an OpenDocument  IMPORT_NOT_A_WORKBOOK_REASON
//         spreadsheet has none: the reader does not say
//         which of its sheets are hidden)
//         too much to read                                 IMPORT_WORKBOOK_TOO_LARGE_REASON, or
//                                                          importWorkbookTooMuchReason(megabytes)
//       The measure of a zip is the sheet data in it: the unpacked size of every part the reader
//       parses (a name that ends in .xml or .rels, or in .bin outside xl/embeddings/,
//       xl/printerSettings/ and xl/activeX/; a name is looked at in lower case, with / for \ and no
//       leading /, as the reader looks at it). A picture or another file inside does not make the
//       file ask or refuse, for the reader does not parse it; but the reader unpacks every part, so a
//       picture costs memory as large as itself, once, and every part, parsed or not, counts in what
//       a zip unpacks to in all (the bound on that cost). The measure of any other file, and of a zip
//       whose directory cannot be read, is the file's size. A limit is compared as the text limits
//       are: exactly at it is under it.
//       ask is {megabytes, unpackedMegabytes, heavy}: the file's size and the sheet data's (null when
//       the measure is the file) in megabytes, each rounded up (so that a figure over a limit never
//       reads as the limit), and whether the question says more (the page may run out of memory): the
//       measure is over the heavy limits.
//
//   watchCall(onLost, {every}), watchStep(step, onLost, {every}), roomAgain() and
//       forWantOfMemory(thrown): how a step that the browser has no memory left for is told of (their
//       comments say how); the dialog uses watchStep and roomAgain for its own step after a reading,
//       from the answer to what the tab shows.
//
//   readWorkbook(file, kind, {directory, loadLibrary, rest, frame, current})
//       -> Promise<{sheets, charts} | {refused: text} | {moved: true}>
//       directory is what inspectWorkbook gave (null: no zip check, for a zip whose directory the
//       check does not read). Left out for a zip, the directory is read here, so that a zip is
//       never handed to the library unchecked by a caller that forgot to inspect it.
//       The reading itself: the library (a rejection is IMPORT_WORKBOOK_LIBRARY_FAILED_REASON, and
//       nothing is remembered of it), the file's bytes (bytes that the browser has no memory for are
//       IMPORT_WORKBOOK_NO_MEMORY_REASON, bytes that cannot be read for another reason
//       IMPORT_UNREADABLE_REASON), the zip check (a zip with a directory; a workbook that fails it
//       is IMPORT_WORKBOOK_DAMAGED_REASON, and the library never sees it), a frame so that what the
//       tab shows is painted, then the one call that cannot be interrupted.
//       loadLibrary() -> Promise<XLSX>; rest() is awaited between a zip's parts and every few
//       megabytes inside one, and between sheets; frame() resolves when a frame has been drawn;
//       current() says whether the dialog's session is still the one that began this reading.
//       Whenever current() is false, or rest throws, the reading stops with {moved: true} and the
//       dialog does nothing: what rest throws is never a verdict on the file. (A rest that throws for
//       want of memory while current() is true is the exception: it is a loss, told by the watch.)
//       sheets: the workbook's listed sheets in order, as js/lab/import-cells.js makes them
//       (readSheet). A chart, macro or dialog sheet (its object has a !type) is not listed: charts
//       is how many were left out. A sheet's state is the entry of the workbook's own list of states
//       with its name. A web page is a markup file that comes back with no workbook properties
//       (only it has the library's invented sheet names, which are never shown). What the library
//       throws (an Error, a TypeError, a plain string) is read as a text, never shown: "password" is
//       IMPORT_WORKBOOK_LOCKED_REASON, an engine's words for having no memory left
//       IMPORT_WORKBOOK_NO_MEMORY_REASON, anything else IMPORT_PAGE_UNREADABLE_REASON for markup and
//       IMPORT_WORKBOOK_UNREADABLE_REASON for the rest. A call that is lost for want of memory, or
//       that the browser ends without a word, is told by a watch from outside it (watchCall, below),
//       with IMPORT_WORKBOOK_NO_MEMORY_REASON, once the browser has room to say so: the promise is
//       then resolved by the watch, not by the reading. A name the library lists with no sheet to it
//       makes the workbook damaged (IMPORT_WORKBOOK_DAMAGED_REASON), unless the workbook is one that
//       is asked about before it is read (its measure is over the first limit): then it is
//       IMPORT_WORKBOOK_SHEET_LOST_REASON. The library leaves a sheet out without a word both when
//       the sheet's part is damaged and when the browser had no memory for it (it swallows what was
//       thrown and goes on), so the page cannot tell which; in a workbook that large the second is
//       the likely one, and the words say both. A workbook that lists no sheet is
//       IMPORT_WORKBOOK_NO_SHEETS_REASON.
//       The bytes are let go once the library has read them: the sheets are the library's own objects.
//       Two things the library keeps of a workbook are seen to here (letStringsGo, formatsHeld, below):
//       the texts of an .xlsx or .xlsb, which it would hold long after the workbook has been let go, and its
//       table of number formats, which the sheets are given as this workbook left it.
//
// A kind that is "text", "empty" or anything else is not a workbook, and not for these.
//
// Never: show the library's words, call the library on a file that failed its check (on some cut
// or changed files it never returns), reuse an options object (the library writes into the one it is
// given, and a second read with it throws), hold the file's bytes after the read, let a sheet
// called constructor find the object's own, or hand a sheet the library's own table of formats (the
// next read makes that table anew).

import { checkZip, zipDirectory } from "./import-zip.js";
import { readSheet } from "./import-cells.js";
import { HEAD_BYTES, bomOf, guessEncoding } from "./import-text.js";
import {
    EXCEL_HEAVY_BYTES,
    EXCEL_HEAVY_DATA_BYTES,
    EXCEL_MAX_BYTES,
    EXCEL_MAX_DATA_BYTES,
    EXCEL_MAX_UNPACKED_BYTES,
    EXCEL_WARN_BYTES,
    EXCEL_WARN_DATA_BYTES,
    IMPORT_NOT_A_WORKBOOK_REASON,
    IMPORT_PAGE_UNREADABLE_REASON,
    IMPORT_UNREADABLE_REASON,
    IMPORT_WORKBOOK_CUT_REASON,
    IMPORT_WORKBOOK_DAMAGED_REASON,
    IMPORT_WORKBOOK_LIBRARY_FAILED_REASON,
    IMPORT_WORKBOOK_LOCKED_REASON,
    IMPORT_WORKBOOK_NO_MEMORY_REASON,
    IMPORT_WORKBOOK_NO_SHEETS_REASON,
    IMPORT_WORKBOOK_SHEET_LOST_REASON,
    IMPORT_WORKBOOK_TOO_LARGE_REASON,
    IMPORT_WORKBOOK_UNREADABLE_REASON,
    WORKBOOK_WATCH_MS,
    importPageTableLabel,
    importWorkbookTooMuchReason,
} from "./config-workflow.js";

const MEGABYTE = 1024 * 1024;
// (rounded up: a size over a limit is never said as the limit)
const megabytes = (bytes) => Math.ceil(bytes / MEGABYTE);

// ---- what the limits say --------------------------------------------------------------------------

// The parts that say a zip is an Excel workbook: the list of sheets of an .xlsx (and an .xlsm) and of an
// .xlsb. An OpenDocument spreadsheet (an .ods, whose part is content.xml) is not one: the reader gives its
// cells, but it does not say which of its sheets are hidden, so a hidden sheet would be listed as a visible
// one and ticked. Such a file is refused as "not an Excel workbook", before the reader is asked for anything.
const WORKBOOK_PARTS = new Set(["xl/workbook.xml", "xl/workbook.bin"]);
const OPAQUE_FOLDERS = ["xl/embeddings/", "xl/printersettings/", "xl/activex/"];

// A part's name as the reader looks at it: in lower case, with a slash for a backslash (some
// programs on Windows write zips so), and with no slash at the start. A workbook the reader opens is
// then one this module knows for a workbook, whatever the writer did to the names.
const partName = (name) => name.toLowerCase().replaceAll("\\", "/").replace(/^\/+/, "");

// whether the reader parses this part (a name already put through partName)
function holdsSheetData(name) {
    return /\.(?:xml|rels)$/.test(name) || (name.endsWith(".bin") && !OPAQUE_FOLDERS.some((folder) => name.startsWith(folder)));
}

// what a zip's sheet data unpacks to, as its directory says: the measure of a zip
function sheetDataBytes(directory) {
    let data = 0;
    for (const entry of directory.entries) {
        if (holdsSheetData(partName(entry.name))) {
            data += entry.unpacked;
        }
    }
    return data;
}

// whether a workbook is one that is asked about before it is read: its measure is over the first limit
const asksFirst = (file, directory) => (directory?.entries ? sheetDataBytes(directory) > EXCEL_WARN_DATA_BYTES : file.size > EXCEL_WARN_BYTES);

export async function inspectWorkbook(file, kind) {
    let directory = null;
    if (kind === "zip") {
        try {
            directory = await zipDirectory(file);
        } catch {
            // (the file was changed or taken away after it was chosen, or cannot be read)
            return { refused: IMPORT_UNREADABLE_REASON };
        }
    }
    if (directory?.damaged) {
        return { refused: IMPORT_WORKBOOK_CUT_REASON };
    }
    if (directory) {
        const names = directory.entries.map((entry) => partName(entry.name));
        if (!names.some((name) => WORKBOOK_PARTS.has(name))) {
            return { refused: IMPORT_NOT_A_WORKBOOK_REASON };
        }
        const data = sheetDataBytes(directory);
        if (data > EXCEL_MAX_DATA_BYTES) {
            return { refused: importWorkbookTooMuchReason(megabytes(data)) };
        }
        if (directory.unpacked > EXCEL_MAX_UNPACKED_BYTES) {
            return { refused: importWorkbookTooMuchReason(megabytes(directory.unpacked)) };
        }
        if (data > EXCEL_WARN_DATA_BYTES) {
            return { ask: { megabytes: megabytes(file.size), unpackedMegabytes: megabytes(data), heavy: data > EXCEL_HEAVY_DATA_BYTES }, directory };
        }
        return { go: true, directory };
    }
    if (file.size > EXCEL_MAX_BYTES) {
        return { refused: IMPORT_WORKBOOK_TOO_LARGE_REASON };
    }
    if (file.size > EXCEL_WARN_BYTES) {
        return { ask: { megabytes: megabytes(file.size), unpackedMegabytes: null, heavy: file.size > EXCEL_HEAVY_BYTES }, directory: null };
    }
    return { go: true, directory: null };
}

// ---- reading --------------------------------------------------------------------------------------

// what stops a reading that the dialog has moved on from
const MOVED = Symbol("moved");

// the text of a web page or an XML spreadsheet, decoded as the plan's "Encoding" says: by its
// byte-order mark, else as UTF-8 when every byte fits, else as Windows-1252 (the library reads the
// bytes of a page as UTF-8 whatever it says, and throws on an XML spreadsheet that declares
// another encoding, so it is handed text). Throws when a byte-order mark's encoding does not fit.
function decodePage(bytes) {
    const strict = (encoding) => new TextDecoder(encoding, { fatal: true });
    const bom = bomOf(bytes.subarray(0, HEAD_BYTES));
    let text = null;
    if (bom === null) {
        try {
            text = strict("utf-8").decode(bytes);
        } catch {
            // not UTF-8
        }
    }
    return text ?? strict(guessEncoding({ bom, validUtf8: text !== null })).decode(bytes);
}

// What the engines say when they cannot hold what the library asks of them: no memory left, a text
// longer than a text can be, a buffer that cannot be had. The workbook is then too much for this
// browser, and is not damaged.
const NO_MEMORY = /out of memory|allocation size overflow|array buffer allocation failed|invalid string length/i;
// whether what was thrown says so (it is looked at as a text: engines throw errors and bare words)
export const forWantOfMemory = (thrown) => NO_MEMORY.test(String(thrown?.message ?? thrown));

// what the library threw means, in the app's own words. It throws Errors, TypeErrors and plain
// strings, so what is thrown is looked at as a text.
function reasonForThrown(error, kind) {
    if (/password/i.test(String(error?.message ?? error))) {
        return IMPORT_WORKBOOK_LOCKED_REASON;
    }
    if (forWantOfMemory(error)) {
        return IMPORT_WORKBOOK_NO_MEMORY_REASON;
    }
    return kind === "markup" ? IMPORT_PAGE_UNREADABLE_REASON : IMPORT_WORKBOOK_UNREADABLE_REASON;
}

// When the browser has no memory left for a workbook, the library's call does throw, but nothing can
// be done about it then and there: in Firefox the memory is still full (the library is holding what
// it had read so far), so whatever makes an object fails in its turn. Seen with a workbook of seven
// million texts: the catch began and could not work out its reason, the reading's promise was
// rejected, the dialog could not make the line that says why, and the tab said for ever that the file
// was being read, with the page awake behind it. (A browser may also end the script outright: then
// no catch and no finally runs at all.) So the call is watched from outside it. A timer is set just
// before the call and taken away only when the call has ended and its outcome is in hand: one that
// fires with the call not ended tells that the call was lost. A timer cannot fire while a call is
// running, and it comes round again: a turn in which the telling fails for want of memory changes
// nothing, and the next one tries again. (Whatever the telling throws is taken for that, and not
// looked at: with its memory full a browser throws many things, and working out which one this is
// would take memory too. So a telling must not throw for any other reason: it would be tried for
// ever, and what waits for it would wait for ever.)
//   watchCall(onLost, {every}) -> {begin(...told), end(), begun()}; for a call that was begun and
//   not ended, onLost(...told) is called every `every` milliseconds until it returns without throwing
export function watchCall(onLost, { every = WORKBOOK_WATCH_MS } = {}) {
    let timer = null;
    const stop = () => {
        clearInterval(timer);
        timer = null;
    };
    return {
        begin(...told) {
            stop();
            timer = setInterval(() => {
                try {
                    onLost(...told);
                } catch {
                    // (no room yet: the next turn)
                    return;
                }
                stop();
            }, every);
        },
        end: stop,
        begun: () => timer !== null,
    };
}

// how many small objects the browser must be able to make before a lost step is told of (some megabytes)
const ROOM_AGAIN_OBJECTS = 200_000;

// roomAgain: is there room again, and not just for a tab's line of refusal? It makes enough small
// objects to fill some megabytes, and throws while the browser cannot: with less room than that, the
// next thing the student does (another file, a query) would fail as the lost step did. A watch calls
// it before it tells, after it has let go what filled the memory: a turn in which it throws changes
// nothing, and the next one tries again.
export function roomAgain() {
    Array.from({ length: ROOM_AGAIN_OBJECTS }, () => ({}));
}

// watchStep runs one step of the page's own, which does not wait for anything, under such a watch, and
// gives a promise for how it ended:
//   the step ended                       resolved with what it gave
//   it threw, and not for want of memory rejected with what it threw (a fault of another kind, as it was)
//   it was lost for want of memory, or   resolved with nothing, once onLost() has returned without
//   the browser ended it without a word  throwing (it is tried every `every` milliseconds until then)
// So what comes after the step waits until the loss has been told of, and never hears of it as a
// failure. Nothing here depends on a catch that can finish: where a catch fails in its turn, for the
// same want of memory, that is one more rejection while the watch is set, and is dropped as the first
// would have been. onLost lets go what filled the memory, asks roomAgain(), and then says what was lost.
export function watchStep(step, onLost, options) {
    return new Promise((resolve, reject) => {
        const watch = watchCall(() => {
            onLost();
            resolve();
        }, options);
        // (an async function: whatever is thrown in it, by the step or by its catch, is a rejection)
        const run = async () => {
            watch.begin();
            let given;
            try {
                given = step();
            } catch (error) {
                if (!forWantOfMemory(error)) {
                    watch.end();
                }
                throw error;
            }
            watch.end();
            return given;
        };
        run().then(resolve, (error) => {
            // (a step that was lost fails in one way or another: the watch tells of it, when it can)
            if (!watch.begun()) {
                reject(error);
            }
        });
    });
}

// the sheet object of a name. The library keeps sheets in a plain object, so a sheet called
// constructor must not find the object's own, and one called __proto__ is not a key at all: the
// library's assignment set the object's prototype to the sheet.
function sheetNamed(sheets, name) {
    if (Object.hasOwn(sheets, name)) {
        return sheets[name];
    }
    if (name === "__proto__") {
        const prototype = Object.getPrototypeOf(sheets);
        return prototype === Object.prototype ? undefined : (prototype ?? undefined);
    }
    return undefined;
}

// The library keeps the shared strings of the last .xlsx (or .xlsb) it read in a variable of its own:
// every text of the workbook, which for a large sheet of texts is some hundreds of megabytes, and they
// stay there when the workbook itself has long been let go (the dialog cancelled, the import done),
// until another one is read or the page is loaded again. So a workbook that holds nothing is read
// after each one: the library then lets the strings go, and the number formats of the workbook with
// them (its table is made anew at each read). It writes that workbook itself, once. (An .xls and a
// web page leave no strings behind; the number formats of an .xls or an XML spreadsheet stay in the
// library's table until the next read, and are no larger than the file was.) Nothing depends on it,
// so what goes wrong in it is swallowed; but `strict` lets a failure for want of memory through, for
// the watch of a lost call, which must know that the strings are gone before it says that there is
// room again.
const hollows = new WeakMap();
function letStringsGo(XLSX, { strict = false } = {}) {
    try {
        let hollow = hollows.get(XLSX);
        if (!hollow) {
            const book = XLSX.utils.book_new();
            XLSX.utils.book_append_sheet(book, XLSX.utils.aoa_to_sheet([[]]), "s");
            // (a book with no table of formats of its own is given the library's present one when it is written:
            // the number formats of the workbook that was read just before, which for a workbook with large ones
            // would be kept in these bytes, and in the library's table when they are read, for as long as the page lives)
            book.SSF = {};
            hollow = new Uint8Array(XLSX.write(book, { type: "array", bookType: "xlsx" }));
            hollows.set(XLSX, hollow);
        }
        XLSX.read(hollow, { type: "array" });
        // (the library also keeps the last table of formats it was asked for, in a field of its own, and the
        // sheets' copy was made from the workbook's: asked again now, it keeps the table of the workbook that
        // holds nothing, and a workbook's large formats are not held until the next workbook is read)
        XLSX.SSF?.get_table?.();
    } catch (error) {
        if (strict && forWantOfMemory(error)) {
            throw error;
        }
    }
}

// The number formats the library held when it had read a workbook, for the cells it gave no format
// (js/lab/import-cells.js, formatOf). The library makes its table anew at every read, of a workbook
// that holds nothing too, and a sheet's cells are worked out later (a preview when its tab is shown,
// the table at Import): so the sheets get the table as their own workbook left it, not the
// library's, which by then is another workbook's.
function formatsHeld(XLSX) {
    if (!XLSX.SSF) {
        return null;
    }
    const table = { ...XLSX.SSF.get_table() };
    return { get_table: () => table, format: (format, value, options) => XLSX.SSF.format(format, value, options) };
}

export function readWorkbook(file, kind, wiring) {
    return new Promise((resolve, reject) => {
        const watch = watchCall((XLSX) => {
            // First what the library still holds of the workbook is let go, which is most of what fills the
            // memory: while the browser has no room even for that, this throws, and the next turn tries again.
            if (kind === "zip") {
                letStringsGo(XLSX, { strict: true });
            }
            // Then: is there room again? The file is not said to be refused before the browser has cleared
            // up (with no room, this throws too).
            roomAgain();
            resolve({ refused: IMPORT_WORKBOOK_NO_MEMORY_REASON });
        });
        reading(file, kind, wiring, watch).then(resolve, (error) => {
            // (a reading whose call was lost fails in one way or another: the watch tells of it, when it can)
            if (!watch.begun()) {
                reject(error);
            }
        });
    });
}

async function reading(file, kind, { directory, loadLibrary, rest = async () => {}, frame = async () => {}, current = () => true }, watch) {
    const look = () => {
        if (!current()) {
            throw MOVED;
        }
    };
    const calm = async () => {
        try {
            await rest();
        } catch (error) {
            // What rest throws is the dialog having moved on; but while the dialog is still there, a turn
            // that fails for want of memory is the browser having none, and is not taken for anything else.
            if (current() && forWantOfMemory(error)) {
                throw error;
            }
            throw MOVED;
        }
        look();
    };
    try {
        look();
        let XLSX;
        try {
            XLSX = await loadLibrary();
        } catch {
            return { refused: IMPORT_WORKBOOK_LIBRARY_FAILED_REASON };
        }
        look();
        let workbook;
        let ssf;
        {
            let bytes;
            try {
                bytes = new Uint8Array(await file.arrayBuffer());
            } catch (error) {
                // (the whole file in memory is the first thing a workbook asks of the browser: one that has no
                // room for it says so in an engine's words, and the file itself is not at fault)
                return { refused: forWantOfMemory(error) ? IMPORT_WORKBOOK_NO_MEMORY_REASON : IMPORT_UNREADABLE_REASON };
            }
            look();
            if (kind === "zip" && directory === undefined) {
                try {
                    directory = await zipDirectory(file);
                } catch {
                    return { refused: IMPORT_UNREADABLE_REASON };
                }
                look();
            }
            if (directory?.damaged) {
                return { refused: IMPORT_WORKBOOK_CUT_REASON };
            }
            // a zip is checked against its own records before the library sees it
            if (directory?.entries && !(await checkZip(bytes, directory.entries, { rest: calm }))) {
                return { refused: IMPORT_WORKBOOK_DAMAGED_REASON };
            }
            // what the tab shows is painted before the page stops answering
            await frame();
            look();
            // From here until the reading has its answer the watch is set whenever the page's own script runs
            // (the library's call, and after it the going through of the sheets), and taken away for each wait
            // in between. Nothing else takes it away but an outcome in hand: no finally, which would run for
            // a step that was lost as well.
            watch.begin(XLSX);
            try {
                // (a new object for each call: the library writes into the one it is given)
                workbook =
                    kind === "markup"
                        ? XLSX.read(decodePage(bytes), { type: "string", raw: true, dense: true, cellNF: true, sheetStubs: true, cellHTML: false })
                        : XLSX.read(bytes, { type: "array", dense: true, cellNF: true, sheetStubs: true, cellHTML: false });
            } catch (error) {
                // (for want of memory, working the reason out can fail in its turn: the watch is still set then)
                const reason = reasonForThrown(error, kind);
                if (reason === IMPORT_WORKBOOK_NO_MEMORY_REASON) {
                    // the watch tells of it, once the browser has room to say so
                    throw error;
                }
                // (a zip the library threw on may have read its strings before it gave up)
                if (kind === "zip") {
                    letStringsGo(XLSX);
                }
                watch.end();
                return { refused: reason };
            }
            ssf = formatsHeld(XLSX);
            if (kind === "zip") {
                letStringsGo(XLSX);
            }
            bytes = null;
        }
        look();
        // (a wait between two sheets: the watch is not set while the page waits)
        const pause = async () => {
            watch.end();
            try {
                await calm();
            } catch (error) {
                // (for want of memory the watch tells: it is set again, as it is for the library's own call)
                if (forWantOfMemory(error)) {
                    watch.begin(XLSX);
                }
                throw error;
            }
            watch.begin(XLSX);
        };
        const listed = await listSheets(workbook, kind, ssf, pause, asksFirst(file, directory));
        watch.end();
        return listed;
    } catch (error) {
        if (error === MOVED) {
            watch.end();
            return { moved: true };
        }
        // What failed for want of memory is the watch's to tell (and where even these words cannot be
        // looked at, the watch stays set). Anything else is a fault of another kind, told as it was.
        if (!forWantOfMemory(error)) {
            watch.end();
        }
        throw error;
    }
}

async function listSheets(workbook, kind, ssf, calm, large) {
    const page = kind === "markup" && workbook.Workbook === undefined;
    const date1904 = Boolean(workbook.Workbook?.WBProps?.date1904);
    // the state of each name, the first entry of a name being the one that counts
    const hiddenOf = new Map();
    if (Array.isArray(workbook.Workbook?.Sheets)) {
        for (const entry of workbook.Workbook.Sheets) {
            if (entry && !hiddenOf.has(entry.name)) {
                hiddenOf.set(entry.name, entry.Hidden);
            }
        }
    }
    const sheets = workbook.Sheets ?? {};
    const listed = [];
    let charts = 0;
    for (const name of workbook.SheetNames ?? []) {
        const ws = sheetNamed(sheets, name);
        if (ws === null || typeof ws !== "object") {
            // The library names a sheet and gives none when the sheet's part is damaged, and also when the
            // browser had no memory for it: it swallows what was thrown and goes on. In a workbook that is
            // large enough to be asked about first, the second is the likely one.
            return { refused: large ? IMPORT_WORKBOOK_SHEET_LOST_REASON : IMPORT_WORKBOOK_DAMAGED_REASON };
        }
        if (ws["!type"]) {
            charts++;
            continue;
        }
        const hidden = hiddenOf.get(name);
        listed.push({ name, ws, hidden: hidden === 1 || hidden === 2 ? hidden : 0 });
    }
    if (listed.length === 0) {
        return { refused: IMPORT_WORKBOOK_NO_SHEETS_REASON };
    }
    const made = [];
    for (const [i, { name, ws, hidden }] of listed.entries()) {
        made.push(readSheet(ws, { name, label: page ? importPageTableLabel(i + 1) : name, hidden, page, date1904, ssf }));
        await calm();
    }
    return { sheets: made, charts };
}
