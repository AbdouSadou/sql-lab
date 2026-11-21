// Assessment plan, Phase 5 (import Excel workbooks): what a student meets when a workbook is large, or
// is not what its name says, in the page. A workbook that is large asks first (two answers: read it, or
// leave it out), one that is too large is refused, and a file that no reader can use is refused with a
// sentence of its own and leaves nothing behind. The pure arithmetic of the limits is tried in Node in
// tests/aw5-excel-rules.spec.js; the sheets' strip and the ticks are in tests/aw5-excel-dialog.spec.js;
// the flags, the libraries and Cancel while an import runs are in tests/aw5-excel-page.spec.js.
// A page opened with the state flagState("import", "excel-import") has both imports on and the export off
// (the flag "excel-import" does nothing without "import"), whatever the shipped defaults are.
// Page tests reach code through the bundle only (await import("./bundle/app.js")).
// Every limit is read from js/lab/config-workflow.js, never typed here; the texts a student reads are
// compared with its constants and functions, and the two questions (for a file that is its own measure,
// and for a zip) and the two refusals for size are also typed out once, so that a changed word fails.
// The files are made in the test: a file of zeros made in the page, for the sizes of an .xls (no bytes
// travel), and a small real workbook made in Node and edited with the vendored fflate, whose directory
// then says what the test needs it to say. A zip is judged from its directory alone, so the limits are
// tried with a directory that claims a size; the one case that must really be read is a workbook whose
// sheet really unpacks to just over the limit (a few hundred kilobytes of file, a hundred megabytes of
// spaces in a part). A zip that claims more than it holds is refused as damaged when it is read, and
// that is how a file that must "go on, with no question" shows it was read.
//
// 1. An .xls (the eight bytes of an OLE2 document) is measured by its own size: no question at 20 MB,
//    one at a byte more with the megabytes rounded up, the extra sentence a heavy one adds past 50 MB,
//    still a question at 100 MB, a refusal at a byte more with no question and nothing read. (The
//    heaviest cases of the spec: they run one after the other.)
// 2. A zip is measured by what its sheets unpack to, as its directory says: no question at 100 MB, one
//    at a byte more (the file's megabytes and the sheets', both rounded up), the heavier question past
//    300 MB, a refusal past 500 MB and past 1024 MB of every part together.
// 3. What counts as sheet data and what does not: a picture, the folders of opaque parts, a name in
//    another letter case, with backslashes, or with a slash at the start.
// 4. The two answers of the question: Read this file (the tab says it is being read, then the sheets
//    show, the focus on the file's tab), Leave this file out (the tab's quiet sign and its own words,
//    the other files importable without it), what the page says while the question waits, a workbook
//    behind one that asks, a workbook that asks taking no table name from the text file beside it,
//    Escape, and the same files chosen again.
// 5. A directory that claims more than the file holds: read after "Read this file", refused as damaged,
//    and the library never reads it.
// 6. Files made in the test that are refused, each with its own sentence and nothing left behind: a zip
//    cut off, a zip that is no workbook (a text file, a word-processor document, an OpenDocument
//    spreadsheet), a web page with no table, a workbook of chart sheets only, a library that throws a
//    string, a TypeError or a word about a password, an .xls that is not one, a workbook that the
//    browser cannot read after it was chosen.
// 7. The limits are for each file: two workbooks under the question's line, over it together, ask nothing.
// 8. Text files keep their own limits and words with both flags on, and a file is judged by its bytes,
//    not by its name (a zip or an old Excel document under a text file's name and size is a workbook).
// 9. A workbook that the browser has no memory left for: the library throws what an engine throws for it
//    (an error, a bare word, or something that cannot even be looked at), or the page's own next step fails
//    for want of memory, or the dialog's step that shows the sheets does: the tab is refused with the words
//    for it, which a watch from outside the step tells once the browser has room, and the student can go on
//    (a CSV file chosen with it is imported, the same workbook chosen again is read, a second workbook is
//    not held up). A fault that is not about memory keeps its own sentence (a case of the table in 6.).
//    And, in Chromium, a script that the browser ends outright, with nothing run after it.

const path = require("node:path");
const { pathToFileURL } = require("node:url");
const XLSX = require("../vendor/xlsx.full.min.js");
const fflate = require("../vendor/fflate.min.js");
const { test, expect, NORTHLIGHT_URL, flagState, csvFile, dialogReady, eventsOfOpen, expectNothingLeft, snapshot, workbookFile, escaped, holdLine, MB, OLE2_START } = require("./helpers");

const load = (file) => import(pathToFileURL(path.join(__dirname, "..", "js", "lab", file)).href);

const FLAGS = `${NORTHLIGHT_URL}&${flagState("import", "excel-import")}`;

let words;
test.beforeAll(async () => {
    words = await load("config-workflow.js");
});

// ---- the question's sentences, typed out ---------------------------------------------------------------

// what the question says after its first sentence, and what a heavier one adds
const WAIT = "The page will not respond while it is read, which can take a minute. If the browser says the page is not responding, choose to wait.";
const MEMORY = "A workbook this large can need more memory than the browser has: if the page stops, reload it, and work that was not exported is lost.";
const TOO_LARGE_FILE =
    "This workbook is over 100 MB. An Excel file is read whole into memory and needs many times its size there, which is more than the browser has. In Excel, save the sheets you need as CSV files, and import those.";
const tooMuchSheets = (megabytes) =>
    `The sheets of this workbook unpack to ${megabytes.toLocaleString("en")} MB. They are read whole into memory and need many times that there, which is more than the browser has. In Excel, save the sheets you need as CSV files, and import those.`;

// ---- files made in the page, for the sizes of an .xls ---------------------------------------------------

const ZIP_START = [0x50, 0x4b, 0x03, 0x04];

// Drops files made inside the page on it, as a browser's drag would. A spec is {name, size}: that many
// zeros, or {name, size, start: [bytes]} a file that begins with those bytes and goes on with zeros. A
// file over a megabyte is made of one shared megabyte, so that a file of 250 MB costs the page nothing
// until it is read. Every read of a file over 10 MB (slice, arrayBuffer, stream, text) is noted, so that
// a test can say what the page asked for and when. Returns whether the drop was cancelled.
async function dropMade(page, specs) {
    return page.evaluate((list) => {
        window.__reads = [];
        if (!window.__spied) {
            window.__spied = true;
            for (const method of ["slice", "arrayBuffer", "stream", "text"]) {
                const original = Blob.prototype[method];
                Blob.prototype[method] = function spied(...args) {
                    if (this.size > 10 * 1024 * 1024) {
                        window.__reads.push({ method, size: this.size, start: args[0], end: args[1] });
                    }
                    return original.apply(this, args);
                };
            }
        }
        const data = new DataTransfer();
        for (const spec of list) {
            const head = spec.start ? [new Uint8Array(spec.start)] : [];
            const rest = spec.size - (spec.start ? spec.start.length : 0);
            const whole = Math.floor(rest / (1024 * 1024));
            const piece = new Blob([new Uint8Array(1024 * 1024)]);
            data.items.add(new File([...head, ...Array(whole).fill(piece), new Uint8Array(rest - whole * 1024 * 1024)], spec.name));
        }
        const fire = (type) => {
            const event = new DragEvent(type, { dataTransfer: data, bubbles: true, cancelable: true });
            document.body.dispatchEvent(event);
            return event.defaultPrevented;
        };
        fire("dragover");
        return fire("drop");
    }, specs);
}

// how many bytes of a large file the page has asked for so far
async function bytesRead(page) {
    return page.evaluate(() =>
        window.__reads.reduce((sum, read) => {
            if (read.method !== "slice") {
                return sum + read.size;
            }
            const end = Math.min(read.end ?? read.size, read.size);
            return sum + Math.max(0, end - (read.start ?? 0));
        }, 0)
    );
}

// an .xls of zeros that many bytes long (it begins with the eight bytes of an OLE2 document)
const xls = (name, size) => ({ name, size, start: OLE2_START });

// ---- workbooks made in Node, edited with fflate ---------------------------------------------------------

const SHEET = "xl/worksheets/sheet1.xml";

// the parts of a small real workbook (the library's writer makes it), as {name: Uint8Array}
function baseParts(sheets = [{ name: "Orders", rows: [["id", "item"], [1, "pen"], [2, "ink"]] }]) {
    const book = XLSX.utils.book_new();
    for (const sheet of sheets) {
        XLSX.utils.book_append_sheet(book, XLSX.utils.aoa_to_sheet(sheet.rows), sheet.name);
    }
    return fflate.unzipSync(new Uint8Array(XLSX.write(book, { bookType: "xlsx", type: "buffer" })));
}

// the size the parts of a small workbook have in all, except the first sheet's
const OTHERS = Object.entries(baseParts())
    .filter(([name]) => name !== SHEET)
    .reduce((sum, [, data]) => sum + data.length, 0);

// writes into the central directory of a zip the unpacked size each named part is to claim (the data
// is not touched: a directory that says more than the file holds)
function claiming(bytes, claims) {
    const copy = new Uint8Array(bytes);
    const view = new DataView(copy.buffer);
    let end = copy.length - 22;
    while (view.getUint32(end, true) !== 0x06054b50) {
        end--;
    }
    let at = view.getUint32(end + 16, true);
    const found = new Set();
    for (let i = 0; i < view.getUint16(end + 10, true); i++) {
        const nameLength = view.getUint16(at + 28, true);
        const name = Buffer.from(copy.subarray(at + 46, at + 46 + nameLength)).toString("utf8");
        if (Object.hasOwn(claims, name)) {
            view.setUint32(at + 24, claims[name], true);
            found.add(name);
        }
        at += 46 + nameLength + view.getUint16(at + 30, true) + view.getUint16(at + 32, true);
    }
    expect([...found].sort(), "every part that is to claim a size is in the zip").toEqual(Object.keys(claims).sort());
    return copy;
}

// A small real workbook, with `extra` parts added ({name: Uint8Array | [Uint8Array, {level}]}), whose
// directory claims: `data` bytes of sheet data in all (the first sheet's part claims what the others do
// not hold), and `claims` the sizes of the named parts besides. Its sheet data is `data` exactly when
// the extra parts hold none.
function workbookClaiming({ data = null, extra = {}, claims = {}, workbookPart = "xl/workbook.xml" } = {}) {
    const sizes = { ...claims };
    if (data !== null) {
        sizes[SHEET] = data - OTHERS;
    }
    // (the workbook's own part may be called by another name: the same letters in another case, or a
    // slash the other way)
    const parts = baseParts();
    parts[workbookPart] = parts["xl/workbook.xml"];
    if (workbookPart !== "xl/workbook.xml") {
        delete parts["xl/workbook.xml"];
    }
    return Buffer.from(claiming(fflate.zipSync({ ...parts, ...extra }), sizes));
}

// a file the way a test chooses it
const asFile = (name, buffer) => ({ name, mimeType: "application/octet-stream", buffer: Buffer.from(buffer) });

// A real workbook whose first part that is not a sheet really unpacks to `data` bytes of spaces, so
// that its sheets are over the line of the question: a few hundred kilobytes of file, a hundred
// megabytes once unpacked. It is read for real. Made once for each worker and kept.
const bigWorkbooks = new Map();
function bigWorkbook(data, sheets) {
    const key = `${data}:${sheets ? sheets.map((sheet) => sheet.name).join(",") : ""}`;
    if (!bigWorkbooks.has(key)) {
        const parts = { ...baseParts(sheets), "customXml/item1.xml": [new Uint8Array(data).fill(32), { level: 1 }] };
        bigWorkbooks.set(key, Buffer.from(fflate.zipSync(parts)));
    }
    return bigWorkbooks.get(key);
}
const TWO_SHEETS = [
    { name: "Orders", rows: [["id", "item"], [1, "pen"], [2, "ink"]] },
    { name: "Notes", rows: [["note"], ["first"]] },
];

// ---- what the page does with the library -----------------------------------------------------------------

// Watches the spreadsheet library: how many times the page asks for its file, and how many times it asks the
// library to read (XLSX.read, wrapped). The page asks in two ways, told apart by what it asks for. The read of
// a file that was chosen is asked with the plan's options (dense: true): reads() counts those, and with
// `throwing` such a read throws what the source says instead of reading. The other read is of a workbook that
// holds nothing, made by the page itself with { type: "array" } alone: the library keeps the texts of the last
// .xlsx it read, and reading a workbook that holds nothing makes it let them go. hollow() counts those, and
// they always go to the real library. With `hold`, the library's file is not served until open() is called.
async function watchLibrary(page, { hold = false, throwing = null } = {}) {
    let open;
    const gate = new Promise((resolve) => (open = resolve));
    let requests = 0;
    await page.route("**/vendor/xlsx.full.min.js", async (route) => {
        requests++;
        if (hold) {
            await gate;
        }
        const response = await route.fetch();
        const body = await response.text();
        const read = `XLSX.read = ((read) => function (input, options) {
            if (options && options.type === "array" && Object.keys(options).length === 1) {
                window.__xlsxHollow++;
                return read.apply(this, arguments);
            }
            window.__xlsxReads++;
            ${throwing ? `${throwing};` : "return read.apply(this, arguments);"}
        })(XLSX.read);`;
        await route.fulfill({ response, body: `${body}\n;window.__xlsxReads = 0; window.__xlsxHollow = 0; ${read}` }).catch(() => {});
    });
    return {
        open,
        requests: () => requests,
        reads: () => page.evaluate(() => window.__xlsxReads ?? 0),
        hollow: () => page.evaluate(() => window.__xlsxHollow ?? 0),
    };
}

// ---- what the dialog shows ----------------------------------------------------------------------------------

// the tab of a refused file: its name, then "(cannot be imported)", the words a screen reader adds
const refusedTab = (app, name) => app.page.getByRole("tab", { name: new RegExp(`^${escaped(name)} \\(${escaped(words.IMPORT_REFUSED_TAB_TEXT)}\\)$`) });
// the tab of a file the student left out: its name, then "(left out)"
const leftOutTab = (app, name) => app.page.getByRole("tab", { name: new RegExp(`^${escaped(name)} \\(${escaped(words.IMPORT_LEFT_OUT_TAB_TEXT)}\\)$`) });
const readButton = (app) => app.importPanel.getByRole("button", { name: words.IMPORT_LARGE_FILE_CONTINUE_TEXT, exact: true });
const leaveButton = (app) => app.importPanel.getByRole("button", { name: words.IMPORT_LARGE_FILE_LEAVE_TEXT, exact: true });
const question = (app) => app.importPanel.locator(".import-warning-text");
const selectTab = (app, name) => app.importTabs.filter({ hasText: name }).click();

// The colour of a tab's sign, and whether it is the tab's own text colour: a file that cannot be
// imported has the sign in the danger colour; one the student left out has it in the tab's own, since
// nothing went wrong.
const signColour = (tab) =>
    tab.evaluate((button) => {
        const sign = getComputedStyle(button.querySelector(".import-tab-refused")).color;
        return { sign, tabs: sign === getComputedStyle(button).color };
    });

// The question for a large workbook is on show in the tab that is selected: its words (the page's, and
// the ones typed in the test), its two answers in their order, Import off, and nothing is said of an
// unpacked size unless `args` has one.
async function expectQuestion(app, args, typed) {
    await expect(readButton(app)).toBeVisible();
    await expect(app.importPanel.getByRole("button")).toHaveText([words.IMPORT_LARGE_FILE_CONTINUE_TEXT, words.IMPORT_LARGE_FILE_LEAVE_TEXT]);
    await expect(question(app)).toHaveText(typed);
    expect(typed, "the sentence typed in the test is the page's own function's").toBe(words.importLargeWorkbookMessage(args));
    await expect(app.importSubmit).toBeDisabled();
    // (the panel is not a stop of its own in the Tab order: the two answers are)
    await expect(app.importPanel).not.toHaveAttribute("tabindex", /.*/);
    await expect(app.importPanel.locator(".import-refusal")).toHaveCount(0);
    await expect(app.page.getByRole("tab", { name: new RegExp(escaped(words.IMPORT_REFUSED_TAB_TEXT)) })).toHaveCount(0);
}

// A file that is refused: its tab has the sign and the words of a refusal, its panel says why, and, when
// it is the only file, the dialog offers only Close and no destination.
async function expectRefused(app, name, reason, { only = true } = {}) {
    const tab = refusedTab(app, name);
    await expect(tab).toBeVisible();
    await expect(tab).toHaveAccessibleName(`${name} (${words.IMPORT_REFUSED_TAB_TEXT})`);
    await expect(tab.locator(".import-tab-refused")).toHaveCount(1);
    expect((await signColour(tab)).tabs, "the sign of a file that cannot be imported is not in the tab's own colour").toBe(false);
    await expect(app.importPanel.locator(".import-refusal")).toHaveText(reason);
    await expect(app.importPanel.getByRole("button")).toHaveCount(0);
    if (only) {
        await expect(app.importDialog.getByRole("button")).toHaveText([words.IMPORT_CLOSE_TEXT]);
        await expect(app.importSubmit).toBeHidden();
        await expect(app.importDialog.locator("#import-into-new")).toBeHidden();
        await expect(app.importDialog.locator("#import-database-name")).toBeHidden();
    }
}

// closes the dialog with its Close button (the only one a file that is refused leaves)
async function closeDialog(app) {
    await app.importDialog.getByRole("button", { name: words.IMPORT_CLOSE_TEXT }).click();
    await expect(app.importDialog).toBeHidden();
}

// closes the dialog with Escape, as a student does who has chosen nothing (a dialog that has a file
// waiting for an answer offers Cancel, not Close)
async function dismiss(app) {
    await app.page.keyboard.press("Escape");
    await expect(app.importDialog).toBeHidden();
}

// the page's own errors, from now on
function watchErrors(page) {
    const errors = [];
    page.on("pageerror", (error) => errors.push(String(error)));
    return errors;
}

// ---- 1. an .xls is measured by its own size ---------------------------------------------------------------------

test.describe("an .xls is measured by its own size", () => {
    // (a file of 100 MB is made of one shared megabyte, so it costs the page little; these are still the
    // heaviest cases of the spec, and no two of them run at once)
    test.describe.configure({ mode: "serial" });

    // what a file of zeros that begins as an OLE2 document is when it is read: the library cannot make a
    // workbook of it
    test("a file of exactly 20 MB is read at once with no question: the page asked for all of its bytes, and it is refused as unreadable, being zeros", async ({ app, page }) => {
        test.slow();
        await app.open(FLAGS);
        expect(await dropMade(page, [xls("old.xls", words.EXCEL_WARN_BYTES)])).toBe(true);
        await dialogReady(app);
        await expectRefused(app, "old.xls", words.IMPORT_WORKBOOK_UNREADABLE_REASON);
        // (no question stood in the way: its bytes were read)
        expect(await bytesRead(page)).toBeGreaterThanOrEqual(words.EXCEL_WARN_BYTES);
        await expect(app.importDialog.getByRole("button", { name: words.IMPORT_LARGE_FILE_CONTINUE_TEXT })).toHaveCount(0);
    });

    test("a file of one byte over 20 MB asks first, with its size in megabytes rounded up and no word about unpacking, and nothing of it is read", async ({ app, page }) => {
        test.slow();
        await app.open(FLAGS);
        await dropMade(page, [xls("old.xls", words.EXCEL_WARN_BYTES + 1)]);
        await expect(app.importDialog).toBeVisible();
        // (20 MB and a byte is 21 MB, not 20: a size over a figure is never said as the figure)
        await expectQuestion(app, { megabytes: 21, unpackedMegabytes: null, heavy: false }, `This workbook is 21 MB. ${WAIT}`);
        await expect(question(app)).not.toContainText("unpack");
        await expect(app.importPanel.getByLabel(words.IMPORT_TABLE_NAME_LABEL)).toHaveCount(0);
        expect(await bytesRead(page), "what was read of the file").toBeLessThanOrEqual(64 * 1024);
        await expect(app.importTabs.first()).toHaveAccessibleName("old.xls");
    });

    test("a file of exactly 50 MB asks the plain question, and one byte more asks it with the sentence a heavy workbook adds", async ({ app, page }) => {
        test.slow();
        await app.open(FLAGS);
        await dropMade(page, [xls("a_50.xls", words.EXCEL_HEAVY_BYTES)]);
        await expect(app.importDialog).toBeVisible();
        await expectQuestion(app, { megabytes: 50, unpackedMegabytes: null, heavy: false }, `This workbook is 50 MB. ${WAIT}`);
        await expect(question(app)).not.toContainText(MEMORY);
        await dismiss(app);
        await dropMade(page, [xls("b_50.xls", words.EXCEL_HEAVY_BYTES + 1)]);
        await expect(app.importDialog).toBeVisible();
        await expectQuestion(app, { megabytes: 51, unpackedMegabytes: null, heavy: true }, `This workbook is 51 MB. ${WAIT} ${MEMORY}`);
        expect(await bytesRead(page), "what was read of either file").toBeLessThanOrEqual(64 * 1024);
    });

    test("a file of exactly 100 MB still asks, with the heavier question", async ({ app, page }) => {
        test.slow();
        await app.open(FLAGS);
        await dropMade(page, [xls("limit.xls", words.EXCEL_MAX_BYTES)]);
        await expect(app.importDialog).toBeVisible();
        await expectQuestion(app, { megabytes: 100, unpackedMegabytes: null, heavy: true }, `This workbook is 100 MB. ${WAIT} ${MEMORY}`);
        expect(await bytesRead(page), "what was read of the file").toBeLessThanOrEqual(64 * 1024);
    });

    test("a file of one byte over 100 MB is refused at once with the sentence for a workbook over 100 MB, with no question, only Close, and nothing of it read", async ({ app, page }) => {
        test.slow();
        await app.open(FLAGS);
        await dropMade(page, [xls("huge.xls", words.EXCEL_MAX_BYTES + 1)]);
        await expect(app.importDialog).toBeVisible();
        await expectRefused(app, "huge.xls", TOO_LARGE_FILE);
        expect(TOO_LARGE_FILE).toBe(words.IMPORT_WORKBOOK_TOO_LARGE_REASON);
        await expect(app.importDialog.getByRole("button", { name: words.IMPORT_LARGE_FILE_CONTINUE_TEXT })).toHaveCount(0);
        await expect(app.importDialog.getByRole("button", { name: words.IMPORT_LARGE_FILE_LEAVE_TEXT })).toHaveCount(0);
        expect(await bytesRead(page), "what was read of the file").toBeLessThanOrEqual(64 * 1024);
    });

    test("the OLE2 bytes under a .csv name are a workbook all the same: at one byte over 20 MB the workbook's question is asked, not the text file's", async ({ app, page }) => {
        test.slow();
        await app.open(FLAGS);
        await dropMade(page, [{ name: "data.csv", size: words.EXCEL_WARN_BYTES + 1, start: OLE2_START }]);
        await expect(app.importDialog).toBeVisible();
        await expectQuestion(app, { megabytes: 21, unpackedMegabytes: null, heavy: false }, `This workbook is 21 MB. ${WAIT}`);
    });
});

// ---- 2. a zip is measured by what its sheets unpack to ------------------------------------------------------------

test.describe("a zip is measured by what its sheets unpack to, as its directory says", () => {
    test("sheets that claim exactly 100 MB are read with no question (the file holds less than it says, so it is refused as damaged: it was read)", async ({ app, page }) => {
        await app.open(FLAGS);
        await app.chooseFiles(asFile("book.xlsx", workbookClaiming({ data: words.EXCEL_WARN_DATA_BYTES })));
        await dialogReady(app);
        await expectRefused(app, "book.xlsx", words.IMPORT_WORKBOOK_DAMAGED_REASON);
        await expect(app.importDialog.getByRole("button", { name: words.IMPORT_LARGE_FILE_CONTINUE_TEXT })).toHaveCount(0);
    });

    test("sheets that claim one byte over 100 MB ask first: the file's megabytes and the sheets', both rounded up, and nothing is read", async ({ app, page }) => {
        await app.open(FLAGS);
        const library = await watchLibrary(page);
        await app.chooseFiles(asFile("book.xlsx", workbookClaiming({ data: words.EXCEL_WARN_DATA_BYTES + 1 })));
        await expect(app.importDialog).toBeVisible();
        // (a file of a few kilobytes is 1 MB, and 100 MB and a byte is 101 MB)
        await expectQuestion(app, { megabytes: 1, unpackedMegabytes: 101, heavy: false }, `This workbook is 1 MB, and its sheets unpack to 101 MB. ${WAIT}`);
        await expect(app.importTabs.first()).toHaveAccessibleName("book.xlsx");
        // (the library is asked for when a workbook is read, and this one waits)
        expect(library.requests()).toBe(0);
    });

    test("the megabytes of the file are rounded up as well: a workbook of 1.2 MB with sheets that claim 150 MB says 2 MB and 150 MB", async ({ app }) => {
        await app.open(FLAGS);
        // (a picture of zeros that is stored, not packed, makes the file 1.2 MB; a picture is no sheet data)
        const bytes = workbookClaiming({ data: 150 * MB, extra: { "xl/media/image1.png": [new Uint8Array(Math.round(1.2 * MB)), { level: 0 }] } });
        expect(bytes.length).toBeGreaterThan(MB);
        expect(bytes.length).toBeLessThan(2 * MB);
        await app.chooseFiles(asFile("book.xlsx", bytes));
        await expect(app.importDialog).toBeVisible();
        await expectQuestion(app, { megabytes: 2, unpackedMegabytes: 150, heavy: false }, `This workbook is 2 MB, and its sheets unpack to 150 MB. ${WAIT}`);
    });

    test("sheets that claim exactly 300 MB ask the plain question, and one byte more ask it with the sentence a heavy workbook adds", async ({ app }) => {
        await app.open(FLAGS);
        await app.chooseFiles(asFile("plain.xlsx", workbookClaiming({ data: words.EXCEL_HEAVY_DATA_BYTES })));
        await expect(app.importDialog).toBeVisible();
        await expectQuestion(app, { megabytes: 1, unpackedMegabytes: 300, heavy: false }, `This workbook is 1 MB, and its sheets unpack to 300 MB. ${WAIT}`);
        await expect(question(app)).not.toContainText(MEMORY);
        await dismiss(app);
        await app.chooseFiles(asFile("heavy.xlsx", workbookClaiming({ data: words.EXCEL_HEAVY_DATA_BYTES + 1 })));
        await expect(app.importDialog).toBeVisible();
        await expectQuestion(app, { megabytes: 1, unpackedMegabytes: 301, heavy: true }, `This workbook is 1 MB, and its sheets unpack to 301 MB. ${WAIT} ${MEMORY}`);
    });

    test("sheets that claim exactly 500 MB still ask; one byte more is refused with the megabytes of the sheets, rounded up, with no question and only Close", async ({ app, page }) => {
        await app.open(FLAGS);
        await app.chooseFiles(asFile("limit.xlsx", workbookClaiming({ data: words.EXCEL_MAX_DATA_BYTES })));
        await expect(app.importDialog).toBeVisible();
        await expectQuestion(app, { megabytes: 1, unpackedMegabytes: 500, heavy: true }, `This workbook is 1 MB, and its sheets unpack to 500 MB. ${WAIT} ${MEMORY}`);
        await dismiss(app);
        const library = await watchLibrary(page);
        await app.chooseFiles(asFile("over.xlsx", workbookClaiming({ data: words.EXCEL_MAX_DATA_BYTES + 1 })));
        await expect(app.importDialog).toBeVisible();
        // (500 MB and a byte is 501 MB, never said as 500)
        await expectRefused(app, "over.xlsx", tooMuchSheets(501));
        expect(tooMuchSheets(501)).toBe(words.importWorkbookTooMuchReason(501));
        await expect(app.importPanel.locator(".import-refusal")).not.toContainText("500 MB");
        await expect(app.importDialog.getByRole("button", { name: words.IMPORT_LARGE_FILE_CONTINUE_TEXT })).toHaveCount(0);
        expect(library.requests(), "a refused workbook is never read").toBe(0);
    });

    test("every part together, a picture too, may unpack to 1024 MB: exactly that goes on to ask, one byte more is refused, with the figure rounded up", async ({ app }) => {
        await app.open(FLAGS);
        // (the sheets claim 200 MB, and the picture claims the rest: it is no sheet data)
        const make = (together) => workbookClaiming({ data: 200 * MB, extra: { "xl/media/image1.png": new Uint8Array(4) }, claims: { "xl/media/image1.png": together - 200 * MB } });
        await app.chooseFiles(asFile("fits.xlsx", make(words.EXCEL_MAX_UNPACKED_BYTES)));
        await expect(app.importDialog).toBeVisible();
        await expectQuestion(app, { megabytes: 1, unpackedMegabytes: 200, heavy: false }, `This workbook is 1 MB, and its sheets unpack to 200 MB. ${WAIT}`);
        await dismiss(app);
        await app.chooseFiles(asFile("over.xlsx", make(words.EXCEL_MAX_UNPACKED_BYTES + 1)));
        await expect(app.importDialog).toBeVisible();
        await expectRefused(app, "over.xlsx", tooMuchSheets(1025));
        expect(tooMuchSheets(1025)).toBe(words.importWorkbookTooMuchReason(1025));
    });
});

// ---- 3. what counts as sheet data, and what does not -------------------------------------------------------------

test.describe("what counts as sheet data", () => {
    // A part that claims 150 MB is sheet data, and the workbook asks, or it is not, and the workbook is
    // read (and, holding less than its directory says, refused as damaged: that it was read, with no
    // question, is what is looked at).
    const COUNTED = [
        ["a sheet", "xl/worksheets/sheet2.xml"],
        ["the shared strings", "xl/sharedStrings.xml"],
        ["a .rels part", "xl/worksheets/_rels/sheet1.xml.rels"],
        ["a .bin sheet", "xl/worksheets/sheet3.bin"],
        ["an .xml part inside the embeddings", "xl/embeddings/oleObject1.xml"],
        ["a part whose name is in another letter case", "XL/Worksheets/Sheet4.XML"],
        ["a part whose name has backslashes", "xl\\worksheets\\sheet5.xml"],
        ["a part whose name starts with a slash", "/xl/worksheets/sheet6.xml"],
        ["a .bin sheet whose name has backslashes", "xl\\worksheets\\sheet7.bin"],
        ["a .bin sheet whose name is in capitals", "XL/WORKSHEETS/SHEET8.BIN"],
    ];
    const NOT_COUNTED = [
        ["a picture", "xl/media/image1.png"],
        ["a .bin in the embeddings", "xl/embeddings/oleObject1.bin"],
        ["a .bin of a printer", "xl/printerSettings/printerSettings1.bin"],
        ["a .bin of a control", "xl/activeX/activeX1.bin"],
        ["a thumbnail", "docProps/thumbnail.jpeg"],
        ["the same folder of a printer in another letter case", "XL/PrinterSettings/printerSettings1.BIN"],
        ["a .bin in the embeddings whose name has backslashes", "xl\\embeddings\\oleObject2.bin"],
        ["a .bin in the embeddings whose name starts with a slash", "/xl/embeddings/oleObject3.bin"],
        ["a .bin in the embeddings whose name starts with two slashes", "//xl/embeddings/oleObject4.bin"],
    ];

    for (const [what, part] of COUNTED) {
        test(`${what} that claims 150 MB counts: the workbook asks first, saying 150 MB of sheets`, async ({ app }) => {
            await app.open(FLAGS);
            await app.chooseFiles(asFile("book.xlsx", workbookClaiming({ extra: { [part]: new Uint8Array(4) }, claims: { [part]: 150 * MB } })));
            await expect(app.importDialog).toBeVisible();
            // (the sheets' own parts hold a few kilobytes: 150 MB and a little is 151 MB)
            await expectQuestion(app, { megabytes: 1, unpackedMegabytes: 151, heavy: false }, `This workbook is 1 MB, and its sheets unpack to 151 MB. ${WAIT}`);
        });
    }

    for (const [what, part] of NOT_COUNTED) {
        test(`${what} that claims 150 MB does not count: the workbook asks nothing, and is read`, async ({ app }) => {
            await app.open(FLAGS);
            await app.chooseFiles(asFile("book.xlsx", workbookClaiming({ extra: { [part]: new Uint8Array(4) }, claims: { [part]: 150 * MB } })));
            await dialogReady(app);
            // (it holds less than its directory says: it was read, and is refused as damaged, not asked about)
            await expectRefused(app, "book.xlsx", words.IMPORT_WORKBOOK_DAMAGED_REASON);
            await expect(app.importDialog.getByRole("button", { name: words.IMPORT_LARGE_FILE_CONTINUE_TEXT })).toHaveCount(0);
        });
    }

    // a workbook is known by its workbook part, and the reader finds it however its name is written
    for (const name of ["XL/Workbook.XML", "xl\\workbook.xml", "/xl/workbook.xml", "\\xl\\workbook.xml"]) {
        test(`a workbook whose workbook part is written ${JSON.stringify(name)} is a workbook all the same: it is measured, and asks`, async ({ app }) => {
            await app.open(FLAGS);
            await app.chooseFiles(asFile("book.xlsx", workbookClaiming({ data: 150 * MB, workbookPart: name })));
            await expect(app.importDialog).toBeVisible();
            await expectQuestion(app, { megabytes: 1, unpackedMegabytes: 150, heavy: false }, `This workbook is 1 MB, and its sheets unpack to 150 MB. ${WAIT}`);
        });
    }

    test("a picture that really unpacks to more than the line is no sheet data: the workbook asks nothing and shows its sheet", async ({ app, page }) => {
        test.slow();
        await app.open(FLAGS);
        const picture = new Uint8Array(words.EXCEL_WARN_DATA_BYTES + 20 * MB);
        const bytes = Buffer.from(fflate.zipSync({ ...baseParts(), "xl/media/image1.png": [picture, { level: 1 }] }));
        expect(bytes.length).toBeLessThan(2 * MB);
        await app.chooseFiles(asFile("pictures.xlsx", bytes));
        await dialogReady(app);
        await expect(app.importDialog.getByRole("button", { name: words.IMPORT_LARGE_FILE_CONTINUE_TEXT })).toHaveCount(0);
        await expect(app.importPanel.locator(".import-refusal")).toHaveCount(0);
        await expect(app.importPanel.getByLabel(words.IMPORT_TABLE_NAME_LABEL)).toHaveValue("Orders");
        await expect(app.importSubmit).toBeEnabled();
    });
});

// ---- 4. the two answers ---------------------------------------------------------------------------------------------------

test.describe("the question for a large workbook, and its two answers", () => {
    const BIG = (name = "big.xlsx") => asFile(name, bigWorkbook(words.EXCEL_WARN_DATA_BYTES, TWO_SHEETS));
    const SMALL_CSV = () => csvFile("small.csv", "a,b\n1,2\n");

    test("a real workbook whose sheets unpack to just over 100 MB asks first: nothing is read, Import is off, and the file is a few hundred kilobytes", async ({ app, page }) => {
        test.slow();
        await app.open(FLAGS);
        const library = await watchLibrary(page);
        const file = BIG();
        expect(file.buffer.length).toBeLessThan(MB);
        await app.chooseFiles(file);
        await expect(app.importDialog).toBeVisible();
        await expectQuestion(app, { megabytes: 1, unpackedMegabytes: 101, heavy: false }, `This workbook is 1 MB, and its sheets unpack to 101 MB. ${WAIT}`);
        expect(library.requests()).toBe(0);
    });

    test("Read this file: the tab says the file is being read, the focus is on the file's tab, and then the sheets show and the workbook can be imported", async ({ app, page }) => {
        test.slow();
        await app.open(FLAGS);
        const library = await watchLibrary(page, { hold: true });
        await app.chooseFiles(BIG());
        await expect(readButton(app)).toBeVisible();
        await readButton(app).click();
        // (the library's file is held: the workbook is being read and nothing else is happening)
        await expect(app.importPanel.locator(".import-reading")).toHaveText(words.IMPORT_READING_TEXT);
        await expect(app.importPanel.getByRole("button")).toHaveCount(0);
        await expect(app.importTabs.first()).toBeFocused();
        await expect(app.importSubmit).toBeDisabled();
        library.open();
        await dialogReady(app);
        await expect(app.importSheetStrip(words.importSheetsLabel("big.xlsx")).getByRole("tab")).toHaveCount(2);
        await expect(app.importSheetPanel).toContainText(words.importSheetLineText("Orders"));
        await expect(app.importSheetPanel.getByLabel(words.IMPORT_TABLE_NAME_LABEL)).toHaveValue("Orders");
        await expect(app.importPanel.getByRole("button", { name: words.IMPORT_LARGE_FILE_CONTINUE_TEXT })).toHaveCount(0);
        await expect(app.importTabs.first()).toBeFocused();
        expect(await library.reads(), "the library read it once").toBe(1);
        expect(await library.hollow(), "and was then given the workbook that holds nothing, once").toBe(1);
        await expect(app.importSubmit).toBeEnabled();
        await app.importSubmit.click();
        await expect(app.importDialog).toBeHidden();
        expect((await app.rows("SELECT name FROM sqlite_schema WHERE type = 'table' ORDER BY name")).flat()).toEqual(["Notes", "Orders"]);
        expect(await app.rows("SELECT id, item FROM Orders ORDER BY id")).toEqual([[1, "pen"], [2, "ink"]]);
    });

    test("Leave this file out: its tab is a left-out tab with its own words and a quiet sign, the focus is on it, the file is never read, and Close is all the dialog offers", async ({ app, page }) => {
        await app.open(FLAGS);
        const library = await watchLibrary(page);
        await app.chooseFiles(BIG());
        await expect(leaveButton(app)).toBeVisible();
        await leaveButton(app).click();
        const tab = leftOutTab(app, "big.xlsx");
        await expect(tab).toBeVisible();
        await expect(tab).toHaveAccessibleName(`big.xlsx (${words.IMPORT_LEFT_OUT_TAB_TEXT})`);
        await expect(tab).toHaveAccessibleName("big.xlsx (left out)");
        await expect(tab.locator(".import-tab-refused")).toHaveCount(1);
        expect((await signColour(tab)).tabs, "the sign of a file that was left out is in the tab's own colour").toBe(true);
        await expect(app.page.getByRole("tab", { name: new RegExp(escaped(words.IMPORT_REFUSED_TAB_TEXT)) })).toHaveCount(0);
        await expect(app.importPanel.locator(".import-refusal")).toHaveText(words.IMPORT_LEFT_OUT_REASON);
        await expect(app.importPanel.locator(".import-refusal")).toHaveText("You left this file out, so it will not be imported. To import it after all, choose the files again.");
        await expect(tab).toBeFocused();
        await expect(app.importDialog.getByRole("button")).toHaveText([words.IMPORT_CLOSE_TEXT]);
        await expect(app.importSubmit).toBeHidden();
        expect(library.requests(), "a file that was left out is never read").toBe(0);
    });

    // A press with a pointer does not give a button the focus in every browser (Safari leaves the focus
    // where it was): here the button is pressed by script with the focus on nothing in the dialog, and
    // either answer still ends with the focus on the file's tab
    for (const [answer, button] of [
        ["Read this file", readButton],
        ["Leave this file out", leaveButton],
    ]) {
        test(`${answer}, pressed while the focus is elsewhere, still gives the focus to the file's tab`, async ({ app }) => {
            test.slow();
            await app.open(FLAGS);
            await app.chooseFiles([BIG(), SMALL_CSV()]);
            await expect(button(app)).toBeVisible();
            await button(app).evaluate((pressed) => {
                document.activeElement.blur();
                pressed.click();
            });
            await expect(app.importTabs.first()).toBeFocused();
        });
    }

    test("with a CSV file beside it, leaving the workbook out leaves the CSV file importable, and the new database takes its name from the CSV file", async ({ app, page }) => {
        await app.open(FLAGS);
        const library = await watchLibrary(page);
        await app.chooseFiles([BIG("alpha.xlsx"), SMALL_CSV()]);
        await expect(app.importDialog).toBeVisible();
        await expect(app.importDialog.locator("#import-database-name")).toHaveValue("alpha");
        await leaveButton(app).click();
        await expect(leftOutTab(app, "alpha.xlsx")).toBeVisible();
        await expect(app.importDialog.locator("#import-database-name")).toHaveValue("small");
        await selectTab(app, "small.csv");
        await expect(app.importPanel.getByLabel(words.IMPORT_TABLE_NAME_LABEL)).toHaveValue("small");
        await expect(holdLine(app)).toBeHidden();
        await expect(app.importSubmit).toBeEnabled();
        await app.importSubmit.click();
        await expect(app.importDialog).toBeHidden();
        await expect(app.databaseLabel).toHaveText("small");
        expect((await app.rows("SELECT name FROM sqlite_schema WHERE type = 'table'")).flat()).toEqual(["small"]);
        const events = await eventsOfOpen(page);
        expect(events).toHaveLength(1);
        expect(events[0].lines[0]).toMatch(/^file: small\.csv, \d+ bytes$/);
        expect(library.requests(), "the workbook was never read").toBe(0);
    });

    test("while the question waits Import is off and the line beside it names the workbook, whichever tab is on show", async ({ app }) => {
        test.slow();
        await app.open(FLAGS);
        await app.chooseFiles([BIG("waiting.xlsx"), SMALL_CSV()]);
        await expect(app.importDialog).toBeVisible();
        await expect(readButton(app)).toBeVisible();
        await expect(app.importSubmit).toBeDisabled();
        await expect(holdLine(app)).toHaveText(words.importHoldWaitingMessage("waiting.xlsx"));
        await expect(holdLine(app)).toHaveText("waiting.xlsx is waiting for an answer in its tab. Import can be pressed after that.");
        await selectTab(app, "small.csv");
        await expect(app.importPanel.getByLabel(words.IMPORT_TABLE_NAME_LABEL)).toHaveValue("small");
        await expect(app.importSubmit).toBeDisabled();
        await expect(holdLine(app)).toHaveText(words.importHoldWaitingMessage("waiting.xlsx"));
        // the answer lifts it
        await selectTab(app, "waiting.xlsx");
        await leaveButton(app).click();
        await expect(app.importSubmit).toBeEnabled();
        await expect(holdLine(app)).toBeHidden();
    });

    test("a workbook that waits for its answer takes no table name: the text file beside it, which has the same name, keeps its own", async ({ app }) => {
        test.slow();
        await app.open(FLAGS);
        await app.chooseFiles([BIG("small.xlsx"), SMALL_CSV()]);
        await expect(readButton(app)).toBeVisible();
        await selectTab(app, "small.csv");
        await expect(app.importPanel.getByLabel(words.IMPORT_TABLE_NAME_LABEL)).toHaveValue("small");
        // (and the same after the workbook is left out, and the name does not come back)
        await selectTab(app, "small.xlsx");
        await leaveButton(app).click();
        await selectTab(app, "small.csv");
        await expect(app.importPanel.getByLabel(words.IMPORT_TABLE_NAME_LABEL)).toHaveValue("small");
    });

    test("a workbook that asks does not hold up the workbook behind it: the second shows its sheets while the first still waits, and the library is asked for once, for it alone", async ({ app, page }) => {
        test.slow();
        await app.open(FLAGS);
        const library = await watchLibrary(page);
        await app.chooseFiles([BIG("first.xlsx"), workbookFile("second.xlsx", [{ name: "Stock", rows: [["id"], [1]] }])]);
        await expect(app.importDialog).toBeVisible();
        await selectTab(app, "second.xlsx");
        await expect(app.importPanel.getByLabel(words.IMPORT_TABLE_NAME_LABEL)).toHaveValue("Stock");
        await expect(app.importPanel.locator(".import-reading")).toHaveCount(0);
        // (the first has not been answered: it still asks, and Import waits for it)
        await expect(holdLine(app)).toHaveText(words.importHoldWaitingMessage("first.xlsx"));
        await expect(app.importSubmit).toBeDisabled();
        expect(await library.reads(), "only the second was read").toBe(1);
        expect(await library.hollow(), "and the library was given the workbook that holds nothing after that one alone").toBe(1);
        await selectTab(app, "first.xlsx");
        await expect(readButton(app)).toBeVisible();
        // read now, it takes its turn and shows its sheets
        await readButton(app).click();
        await expect(app.importSheetStrip(words.importSheetsLabel("first.xlsx")).getByRole("tab")).toHaveCount(2);
        expect(await library.reads()).toBe(2);
        expect(await library.hollow()).toBe(2);
        await expect(app.importSubmit).toBeEnabled();
    });

    test("Escape while the question waits closes the dialog and leaves nothing; the same files chosen again ask again", async ({ app, page }) => {
        test.slow();
        await app.open(FLAGS);
        const before = await snapshot(page, app);
        const library = await watchLibrary(page);
        await app.chooseFiles([BIG(), SMALL_CSV()]);
        await expect(readButton(app)).toBeVisible();
        await page.keyboard.press("Escape");
        await expect(app.importDialog).toBeHidden();
        await expectNothingLeft(page, app, before);
        expect(library.requests()).toBe(0);
        await app.chooseFiles([BIG(), SMALL_CSV()]);
        await expect(app.importDialog).toBeVisible();
        await expectQuestion(app, { megabytes: 1, unpackedMegabytes: 101, heavy: false }, `This workbook is 1 MB, and its sheets unpack to 101 MB. ${WAIT}`);
        await expect(app.importTabs).toHaveCount(2);
        await expect(leftOutTab(app, "big.xlsx")).toHaveCount(0);
    });
});

// ---- 5. a directory that claims more than the file holds ----------------------------------------------------------------

test.describe("a directory that claims more than the file holds", () => {
    test("after Read this file the workbook is refused as damaged, the library is loaded and never asked to read it, and nothing is imported", async ({ app, page }) => {
        await app.open(FLAGS);
        const before = await snapshot(page, app);
        const library = await watchLibrary(page);
        await app.chooseFiles(asFile("liar.xlsx", workbookClaiming({ data: words.EXCEL_WARN_DATA_BYTES + 1 })));
        await expect(readButton(app)).toBeVisible();
        await readButton(app).click();
        await dialogReady(app);
        await expectRefused(app, "liar.xlsx", words.IMPORT_WORKBOOK_DAMAGED_REASON);
        // (it was read: the library's file was asked for, to read it; the check came first and refused it)
        expect(library.requests()).toBe(1);
        expect(await library.reads(), "the library never sees a file that fails the check").toBe(0);
        expect(await library.hollow(), "and is not given the workbook that holds nothing either").toBe(0);
        await closeDialog(app);
        await expectNothingLeft(page, app, before);
    });

    test("the control: a workbook whose directory tells the truth is read by the library once", async ({ app, page }) => {
        await app.open(FLAGS);
        const library = await watchLibrary(page);
        await app.chooseFiles(workbookFile("truthful.xlsx", [{ name: "Orders", rows: [["id"], [1]] }]));
        await dialogReady(app);
        await expect(app.importPanel.getByLabel(words.IMPORT_TABLE_NAME_LABEL)).toHaveValue("Orders");
        expect(await library.reads()).toBe(1);
        expect(await library.hollow(), "and then given the workbook that holds nothing, once").toBe(1);
    });
});

// ---- 6. files made in the test that are refused ---------------------------------------------------------------------------

// A workbook of chart sheets only: the one sheet of a small workbook turned into a chart sheet by
// editing its zip
function chartSheetsOnly() {
    const files = baseParts([{ name: "Data", rows: [["a"], [1]] }]);
    const text = (name) => Buffer.from(files[name]).toString();
    files["xl/_rels/workbook.xml.rels"] = fflate.strToU8(text("xl/_rels/workbook.xml.rels").replace("relationships/worksheet", "relationships/chartsheet").replace("worksheets/sheet1.xml", "chartsheets/sheet1.xml"));
    files["[Content_Types].xml"] = fflate.strToU8(text("[Content_Types].xml").replace("worksheet+xml", "chartsheet+xml").replace("/xl/worksheets/sheet1.xml", "/xl/chartsheets/sheet1.xml"));
    files["xl/chartsheets/sheet1.xml"] = fflate.strToU8(
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><chartsheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetViews><sheetView workbookViewId="0"/></sheetViews></chartsheet>'
    );
    delete files[SHEET];
    return Buffer.from(fflate.zipSync(files));
}

const SOUND = () => Buffer.from(fflate.zipSync(baseParts()));
const PAGE_WITH_TABLE = "<html><body><table><tr><th>a</th></tr><tr><td>1</td></tr></table></body></html>";
// words of the library's that no student should ever read (a refusal says its own, never these)
const LIBRARY_WORDS = "words-of-the-library-17";

// Each case: a file, the sentence its tab says, whether the spreadsheet library is asked to read it (it
// is asked for, and wrapped, in every case: `reads` is how many times it was asked to read, and `hollow`
// how many times it was then given the workbook that holds nothing, which the page reads after an .xlsx,
// also one the library threw on), and what the library throws when the test makes it throw.
const REFUSALS = [
    {
        what: "a zip whose end is cut off",
        file: () => asFile("cut.xlsx", SOUND().subarray(0, SOUND().length - 30)),
        reason: () => words.IMPORT_WORKBOOK_CUT_REASON,
        reads: 0,
        hollow: 0,
        requests: 0,
    },
    {
        what: "a sound zip of a text file",
        file: () => asFile("notes.xlsx", fflate.zipSync({ "notes.txt": fflate.strToU8("just some words") })),
        reason: () => words.IMPORT_NOT_A_WORKBOOK_REASON,
        reads: 0,
        hollow: 0,
        requests: 0,
    },
    {
        what: "a sound zip that is a word-processor document",
        file: () =>
            asFile(
                "essay.xlsx",
                fflate.zipSync({
                    "[Content_Types].xml": fflate.strToU8("<Types/>"),
                    "_rels/.rels": fflate.strToU8("<Relationships/>"),
                    "word/document.xml": fflate.strToU8("<w:document/>"),
                })
            ),
        reason: () => words.IMPORT_NOT_A_WORKBOOK_REASON,
        reads: 0,
        hollow: 0,
        requests: 0,
    },
    {
        // (the library reads its cells but does not say which of its sheets are hidden, so it is not read at all)
        what: "an OpenDocument spreadsheet under an .xlsx name",
        file: () =>
            workbookFile(
                "sheets.xlsx",
                [
                    { name: "Orders", rows: [["id"], [1]] },
                    { name: "Secret", rows: [["x"]], hidden: 1 },
                ],
                "ods"
            ),
        reason: () => words.IMPORT_NOT_A_WORKBOOK_REASON,
        reads: 0,
        hollow: 0,
        requests: 0,
    },
    {
        what: "a web page with no table in it under an .xls name",
        file: () => asFile("prices.xls", Buffer.from("<html><body><p>Please sign in to see the prices.</p></body></html>")),
        reason: () => words.IMPORT_PAGE_UNREADABLE_REASON,
        reads: 1,
        hollow: 0,
    },
    {
        what: "a workbook whose only sheets are chart sheets",
        file: () => asFile("charts.xlsx", chartSheetsOnly()),
        reason: () => words.IMPORT_WORKBOOK_NO_SHEETS_REASON,
        reads: 1,
        hollow: 1,
    },
    {
        what: "an .xls that is only the first bytes of one and zeros, which the library cannot read",
        file: () => asFile("broken.xls", Buffer.concat([Buffer.from(OLE2_START), Buffer.alloc(1024)])),
        reason: () => words.IMPORT_WORKBOOK_UNREADABLE_REASON,
        reads: 1,
        hollow: 0,
    },
    {
        what: "a library that throws a string while it reads",
        file: () => workbookFile("thrown.xlsx", [{ name: "Orders", rows: [["id"], [1]] }]),
        throwing: `throw "${LIBRARY_WORDS}"`,
        reason: () => words.IMPORT_WORKBOOK_UNREADABLE_REASON,
        reads: 1,
        hollow: 1,
    },
    {
        what: "a library that throws a TypeError while it reads",
        file: () => workbookFile("typed.xlsx", [{ name: "Orders", rows: [["id"], [1]] }]),
        throwing: `throw new TypeError("${LIBRARY_WORDS} is not a function")`,
        reason: () => words.IMPORT_WORKBOOK_UNREADABLE_REASON,
        reads: 1,
        hollow: 1,
    },
    {
        // (what the engines throw when an array is too long is not what they throw for want of memory: it keeps its sentence)
        what: "a library that throws a RangeError about an array's length while it reads",
        file: () => workbookFile("ranged.xlsx", [{ name: "Orders", rows: [["id"], [1]] }]),
        throwing: `throw new RangeError("Invalid array length")`,
        reason: () => words.IMPORT_WORKBOOK_UNREADABLE_REASON,
        reads: 1,
        hollow: 1,
    },
    {
        what: "a library that throws a TypeError while it reads a web page",
        file: () => asFile("table.xls", Buffer.from(PAGE_WITH_TABLE)),
        throwing: `throw new TypeError("${LIBRARY_WORDS} is not a function")`,
        reason: () => words.IMPORT_PAGE_UNREADABLE_REASON,
        reads: 1,
        hollow: 0,
    },
    {
        what: "a library that throws a word about a password",
        file: () => workbookFile("locked.xlsx", [{ name: "Orders", rows: [["id"], [1]] }]),
        throwing: `throw new Error("File is password-protected ${LIBRARY_WORDS}")`,
        reason: () => words.IMPORT_WORKBOOK_LOCKED_REASON,
        reads: 1,
        hollow: 1,
    },
    {
        // the browser cannot read the file that was chosen (it was moved or deleted after it was chosen): the
        // whole-file read of that file rejects, as the browser's own does
        what: "a workbook that the browser cannot read after it was chosen",
        before: (page) =>
            page.evaluate(() => {
                const original = Blob.prototype.arrayBuffer;
                Blob.prototype.arrayBuffer = function gone() {
                    return this.name === "gone.xlsx" ? Promise.reject(new DOMException("gone", "NotReadableError")) : original.call(this);
                };
            }),
        file: () => workbookFile("gone.xlsx", [{ name: "Orders", rows: [["id"], [1]] }]),
        reason: () => words.IMPORT_UNREADABLE_REASON,
        reads: 0,
        hollow: 0,
    },
    {
        what: "a library that throws a plain string that has the word password in it",
        file: () => workbookFile("locked.xls", [{ name: "Orders", rows: [["id"], [1]] }], "biff8"),
        throwing: `throw "PASSWORD needed ${LIBRARY_WORDS}"`,
        reason: () => words.IMPORT_WORKBOOK_LOCKED_REASON,
        reads: 1,
        hollow: 0,
    },
];

test.describe("files made in the test that are refused", () => {
    for (const refusal of REFUSALS) {
        test(`${refusal.what} is refused with its own sentence, its tab says so, Close is all the dialog offers, and nothing is left behind`, async ({ app, page }) => {
            const errors = watchErrors(page);
            await app.open(FLAGS);
            const before = await snapshot(page, app);
            const library = await watchLibrary(page, { throwing: refusal.throwing ?? null });
            await refusal.before?.(page);
            const file = refusal.file();
            await app.chooseFiles(file);
            await dialogReady(app);
            await expectRefused(app, file.name, refusal.reason());
            // (nothing the library said, and nothing of the page's own going wrong)
            await expect(app.importDialog).not.toContainText(LIBRARY_WORDS);
            await expect(app.importDialog).not.toContainText("password-protected");
            expect(await library.reads(), "how many times the library was asked to read").toBe(refusal.reads);
            expect(await library.hollow(), "how many times it was then given the workbook that holds nothing").toBe(refusal.hollow);
            if (refusal.requests !== undefined) {
                expect(library.requests(), "how many times the library was asked for").toBe(refusal.requests);
            }
            await closeDialog(app);
            await expectNothingLeft(page, app, before);
            expect(errors).toEqual([]);
        });

        test(`${refusal.what}, chosen with a CSV file, leaves the CSV file importable, and only that file is imported`, async ({ app, page }) => {
            await app.open(FLAGS);
            await watchLibrary(page, { throwing: refusal.throwing ?? null });
            await refusal.before?.(page);
            const file = refusal.file();
            await app.chooseFiles([file, csvFile("people.csv")]);
            await dialogReady(app);
            await expectRefused(app, file.name, refusal.reason(), { only: false });
            await expect(app.importDialog.getByRole("button", { name: words.IMPORT_CLOSE_TEXT })).toHaveCount(0);
            await selectTab(app, "people.csv");
            await expect(app.importPanel.getByLabel(words.IMPORT_TABLE_NAME_LABEL)).toHaveValue("people");
            await expect(app.importSubmit).toBeEnabled();
            await expect(holdLine(app)).toBeHidden();
            await app.importSubmit.click();
            await expect(app.importDialog).toBeHidden();
            await expect(app.databaseLabel).toHaveText("people");
            expect((await app.rows("SELECT name FROM sqlite_schema WHERE type = 'table'")).flat()).toEqual(["people"]);
            const events = await eventsOfOpen(page);
            expect(events).toHaveLength(1);
            expect(events[0].lines[0]).toMatch(/^file: people\.csv, \d+ bytes$/);
        });
    }

    test("a refused workbook's tab is named for a screen reader with the file's name and the words of a refusal, and the same words are the tab's hidden text", async ({ app }) => {
        await app.open(FLAGS);
        await app.chooseFiles(asFile("cut.xlsx", SOUND().subarray(0, SOUND().length - 30)));
        await dialogReady(app);
        const tab = refusedTab(app, "cut.xlsx");
        await expect(tab).toHaveAccessibleName(`cut.xlsx (${words.IMPORT_REFUSED_TAB_TEXT})`);
        await expect(tab.locator(".visually-hidden")).toHaveText(`(${words.IMPORT_REFUSED_TAB_TEXT})`);
        await expect(tab.locator(".import-tab-refused")).toBeVisible();
        await expect(app.importPanel).toHaveAttribute("tabindex", "0");
    });
});

// ---- 7. the limits are for each file ----------------------------------------------------------------------------------------

test.describe("the limits are for each file", () => {
    test("two real workbooks whose sheets are each under the line of the question and over it together ask nothing: both show their sheets, and both are imported", async ({ app, page }) => {
        test.slow();
        await app.open(FLAGS);
        const each = Math.floor(words.EXCEL_WARN_DATA_BYTES * 0.6);
        expect(each).toBeLessThan(words.EXCEL_WARN_DATA_BYTES);
        expect(2 * each).toBeGreaterThan(words.EXCEL_WARN_DATA_BYTES);
        const library = await watchLibrary(page);
        await app.chooseFiles([
            asFile("alpha.xlsx", bigWorkbook(each, [{ name: "Alpha", rows: [["id"], [1]] }])),
            asFile("beta.xlsx", bigWorkbook(each, [{ name: "Beta", rows: [["id"], [2]] }])),
        ]);
        await dialogReady(app);
        await expect(app.importDialog.getByRole("button", { name: words.IMPORT_LARGE_FILE_CONTINUE_TEXT })).toHaveCount(0);
        await expect(app.importPanel.getByLabel(words.IMPORT_TABLE_NAME_LABEL)).toHaveValue("Alpha");
        await selectTab(app, "beta.xlsx");
        await expect(app.importPanel.getByLabel(words.IMPORT_TABLE_NAME_LABEL)).toHaveValue("Beta");
        expect(await library.reads()).toBe(2);
        expect(await library.hollow()).toBe(2);
        await expect(app.importSubmit).toBeEnabled();
        await app.importSubmit.click();
        await expect(app.importDialog).toBeHidden();
        expect((await app.rows("SELECT name FROM sqlite_schema WHERE type = 'table' ORDER BY name")).flat()).toEqual(["Alpha", "Beta"]);
    });

    test("two files of an .xls kind that are each under 20 MB and over it together ask nothing: each is read, being zeros each is refused as unreadable", async ({ app, page }) => {
        test.slow();
        await app.open(FLAGS);
        const each = Math.floor(words.EXCEL_WARN_BYTES * 0.75);
        await dropMade(page, [xls("one.xls", each), xls("two.xls", each)]);
        await dialogReady(app);
        await expect(app.importTabs).toHaveCount(2);
        await expectRefused(app, "one.xls", words.IMPORT_WORKBOOK_UNREADABLE_REASON, { only: false });
        await selectTab(app, "two.xls");
        await expectRefused(app, "two.xls", words.IMPORT_WORKBOOK_UNREADABLE_REASON);
        await expect(app.importDialog.getByRole("button", { name: words.IMPORT_LARGE_FILE_CONTINUE_TEXT })).toHaveCount(0);
        expect(await bytesRead(page), "both files were read").toBeGreaterThanOrEqual(2 * each);
    });

    test("a workbook whose file is over 20 MB but whose sheets are small asks nothing: the zip is measured by its sheets, not by its size", async ({ app }) => {
        test.slow();
        await app.open(FLAGS);
        // (a picture stored, not packed, makes the file itself large; it is no sheet data)
        const bytes = Buffer.from(fflate.zipSync({ ...baseParts(), "xl/media/image1.png": [new Uint8Array(words.EXCEL_WARN_BYTES + MB), { level: 0 }] }));
        expect(bytes.length).toBeGreaterThan(words.EXCEL_WARN_BYTES);
        await app.chooseFiles(asFile("photos.xlsx", bytes));
        await dialogReady(app);
        await expect(app.importDialog.getByRole("button", { name: words.IMPORT_LARGE_FILE_CONTINUE_TEXT })).toHaveCount(0);
        await expect(app.importPanel.getByLabel(words.IMPORT_TABLE_NAME_LABEL)).toHaveValue("Orders");
        await expect(app.importSubmit).toBeEnabled();
    });
});

// ---- 8. text files keep their own limits, and a file is what its bytes say -----------------------------------------------------

test.describe("a text file keeps its own limits and words with both flags on, and a file is judged by its bytes", () => {
    test.describe.configure({ mode: "serial" });

    const TEXT_LARGE = "This file is 50 MB. Reading it takes a while, and the page may be slow meanwhile.";

    async function expectTextQuestion(app) {
        await expect(readButton(app)).toBeVisible();
        await expect(app.importPanel.getByRole("button")).toHaveText([words.IMPORT_LARGE_FILE_CONTINUE_TEXT, words.IMPORT_LARGE_FILE_LEAVE_TEXT]);
        await expect(question(app)).toHaveText(TEXT_LARGE);
        expect(TEXT_LARGE).toBe(words.importLargeFileMessage(50));
        await expect(question(app)).not.toContainText("workbook");
        await expect(app.importSubmit).toBeDisabled();
    }

    test("a .csv file of one byte over 50 MB asks the text file's question, with its megabytes, and nothing of it is read", async ({ app, page }) => {
        test.slow();
        await app.open(FLAGS);
        await dropMade(page, [{ name: "big.csv", size: words.IMPORT_TEXT_WARN_BYTES + 1 }]);
        await expect(app.importDialog).toBeVisible();
        await expectTextQuestion(app);
        expect(await bytesRead(page)).toBeLessThanOrEqual(64 * 1024);
    });

    test("a .csv file of exactly 50 MB is read at once with no question: being zeros it is not text, and the page asked for all of it", async ({ app, page }) => {
        test.slow();
        await app.open(FLAGS);
        await dropMade(page, [{ name: "exact.csv", size: words.IMPORT_TEXT_WARN_BYTES }]);
        await dialogReady(app);
        await expectRefused(app, "exact.csv", words.IMPORT_NOT_TEXT_REASON);
        expect(words.IMPORT_NOT_TEXT_REASON).toBe("This file is not text, so it cannot be read as CSV.");
        expect(await bytesRead(page)).toBeGreaterThanOrEqual(words.IMPORT_TEXT_WARN_BYTES);
    });

    test("a .csv file of one byte over 250 MB is refused with the text file's sentence and never read, and one of exactly 250 MB asks", async ({ app, page }) => {
        test.slow();
        await app.open(FLAGS);
        await dropMade(page, [{ name: "huge.csv", size: words.IMPORT_TEXT_MAX_BYTES + 1 }]);
        await expect(app.importDialog).toBeVisible();
        await expectRefused(app, "huge.csv", words.IMPORT_TOO_LARGE_REASON);
        expect(words.IMPORT_TOO_LARGE_REASON).toBe("This file is over 250 MB, which is more than the browser can import.");
        expect(await bytesRead(page)).toBeLessThanOrEqual(64 * 1024);
        await closeDialog(app);
        await dropMade(page, [{ name: "limit.csv", size: words.IMPORT_TEXT_MAX_BYTES }]);
        await expect(app.importDialog).toBeVisible();
        await expect(readButton(app)).toBeVisible();
        await expect(question(app)).toHaveText(words.importLargeFileMessage(250));
    });

    test("zeros called .xlsx are judged as what their bytes are: at 30 MB, over a workbook's 20 MB, they are read at once as text and refused as not text, with no workbook's question", async ({ app, page }) => {
        test.slow();
        await app.open(FLAGS);
        await dropMade(page, [{ name: "zeros.xlsx", size: 30 * MB }]);
        await dialogReady(app);
        await expectRefused(app, "zeros.xlsx", words.IMPORT_NOT_TEXT_REASON);
        expect(await bytesRead(page)).toBeGreaterThanOrEqual(30 * MB);
    });

    test("zeros called .xlsx at one byte over 50 MB ask the text file's question, not a workbook's", async ({ app, page }) => {
        test.slow();
        await app.open(FLAGS);
        await dropMade(page, [{ name: "zeros.xlsx", size: words.IMPORT_TEXT_WARN_BYTES + 1 }]);
        await expect(app.importDialog).toBeVisible();
        await expectTextQuestion(app);
    });

    test("zeros called .xls at 120 MB, over a workbook's 100 MB and under the text limit, are not refused as a workbook that is too large: they ask the text file's question", async ({ app, page }) => {
        test.slow();
        await app.open(FLAGS);
        await dropMade(page, [{ name: "zeros.xls", size: 120 * MB }]);
        await expect(app.importDialog).toBeVisible();
        await expect(readButton(app)).toBeVisible();
        await expect(question(app)).toHaveText(words.importLargeFileMessage(120));
        await expect(app.importPanel.locator(".import-refusal")).toHaveCount(0);
    });

    // what a file is comes before how large it is: the first bytes of a zip say it is a workbook, whatever the
    // name and the size (a text file's 50 MB or 250 MB are not its limits), and a zip with no directory at its
    // end is cut: only its head and its end are asked for
    for (const [what, megabytes] of [["50 MB", 50], ["250 MB", 250]]) {
        test(`the bytes of a zip under a .csv name, one byte over ${what}, are a workbook that is cut: refused as that with no question, only Close, and only the head and the end of it read`, async ({ app, page }) => {
            test.slow();
            await app.open(FLAGS);
            await dropMade(page, [{ name: "wb.csv", size: megabytes * MB + 1, start: ZIP_START }]);
            await expect(app.importDialog).toBeVisible();
            await expectRefused(app, "wb.csv", words.IMPORT_WORKBOOK_CUT_REASON);
            await expect(app.importDialog.getByRole("button", { name: words.IMPORT_LARGE_FILE_CONTINUE_TEXT })).toHaveCount(0);
            await expect(app.importDialog.getByRole("button", { name: words.IMPORT_LARGE_FILE_LEAVE_TEXT })).toHaveCount(0);
            expect(await bytesRead(page), "what was read of the file").toBeLessThanOrEqual(256 * 1024);
        });
    }

    test("the bytes of an old Excel document under a .txt name, one byte over 50 MB, are a workbook: they ask the workbook's heavy question, with nothing of the file read", async ({ app, page }) => {
        test.slow();
        await app.open(FLAGS);
        await dropMade(page, [{ name: "old.txt", size: words.EXCEL_HEAVY_BYTES + 1, start: OLE2_START }]);
        await expect(app.importDialog).toBeVisible();
        await expectQuestion(app, { megabytes: 51, unpackedMegabytes: null, heavy: true }, `This workbook is 51 MB. ${WAIT} ${MEMORY}`);
        await expect(app.importTabs.first()).toHaveAccessibleName("old.txt");
        expect(await bytesRead(page), "what was read of the file").toBeLessThanOrEqual(64 * 1024);
    });

    test("the bytes of a zip under a .csv name are a workbook, not text: a small one that is cut is refused as a workbook that is not whole", async ({ app, page }) => {
        await app.open(FLAGS);
        await dropMade(page, [{ name: "data.csv", size: 2048, start: ZIP_START }]);
        await dialogReady(app);
        await expectRefused(app, "data.csv", words.IMPORT_WORKBOOK_CUT_REASON);
    });
});

// ---- 9. a workbook that the browser has no memory left for ---------------------------------------------------------------

// The library is made to lose the first `count` reads of a file that was chosen: what watchLibrary's `throwing`
// does for such a read is then done while this count is above zero, and the reads after go on to the real library.
const lose = (page, count = 1) => page.evaluate((n) => (window.__lose = n), count);
// the source of what a read does while a loss is due (see watchLibrary: it runs inside the wrapper, where `read` is the real read)
const losing = (what) => `if (window.__lose > 0) { window.__lose--; ${what}; } return read.apply(this, arguments)`;
// the real library's workbook, then what `after` does to it while a loss is due
const afterReading = (after) => `const book = read.apply(this, arguments); if (window.__lose > 0) { window.__lose--; ${after}; } return book`;

const LEDGER = () => workbookFile("ledger.xlsx", [{ name: "Orders", rows: [["id", "item"], [1, "pen"], [2, "ink"]] }]);

// each: how the browser comes to have no memory left for the workbook, as a library whose first read does what `source` says
const LOSSES = [
    {
        what: "the library throws the error that Chromium throws for a text that cannot be made",
        source: losing('throw new RangeError("Invalid string length")'),
    },
    {
        what: "the library throws the bare words that Firefox's engine throws",
        source: losing('throw "out of memory"'),
    },
    {
        // (Firefox: the page's own catch cannot look at what was thrown, for the same reason: only a watch from outside can tell)
        what: "the library throws something that cannot even be looked at, for the memory it would take",
        source: losing('throw { get message() { throw new Error("out of memory"); } }'),
    },
    {
        what: "the library gives a workbook and the page then has no memory to copy the library's table of number formats",
        source: afterReading('const get = XLSX.SSF.get_table; XLSX.SSF.get_table = function () { XLSX.SSF.get_table = get; throw new Error("out of memory"); }'),
    },
    {
        what: "the library gives a workbook and the page then has no memory to go through its sheets",
        source: afterReading('Object.defineProperty(book.Sheets, book.SheetNames[0], { configurable: true, enumerable: true, get() { throw new RangeError("Array buffer allocation failed"); } })'),
    },
    {
        // the library's own workbook is gone through (every cell is looked at, by the reading), and the dialog's own step,
        // which shows the sheets, then looks at the cells of the first rows (previewRows): there the memory is gone
        what: "the workbook is read and gone through, and the dialog then has no memory to show its sheets",
        source: afterReading(
            'const row = book.Sheets[book.SheetNames[0]]["!data"][1]; const cell = row[0]; window.__lookedAt = 0; window.__failedAt = null; Object.defineProperty(row, 0, { configurable: true, enumerable: true, get() { window.__lookedAt++; if (new Error().stack.includes("previewRows")) { window.__failedAt = window.__lookedAt; throw new RangeError("Array buffer allocation failed"); } return cell; } })'
        ),
        // (the page's own going through looked at it before the preview did, and the preview is where it failed)
        preview: true,
    },
];

// For a page's start: the room that a watch asks the browser for (a great many small objects made with a function:
// nothing else on the page does that) is counted in window.__probes, and cannot be had while window.__noRoom is true.
const ROOM_HELD = () => {
    const from = Array.from;
    window.__probes = 0;
    window.__noRoom = false;
    Array.from = function (source, map) {
        if (source && source.length >= 100_000 && typeof map === "function") {
            window.__probes++;
            if (window.__noRoom) {
                throw new RangeError("out of memory");
            }
        }
        return from.apply(this, arguments);
    };
};

// beside a CSV file the workbook is refused and the CSV file is imported, and only it
async function expectCsvImportedBesideLost(app, page) {
    await app.chooseFiles([LEDGER(), csvFile("people.csv")]);
    await dialogReady(app);
    await expectRefused(app, "ledger.xlsx", words.IMPORT_WORKBOOK_NO_MEMORY_REASON, { only: false });
    await expect(app.importPanel.getByRole("status"), "no sheets are counted for the refused workbook").toHaveCount(0);
    await selectTab(app, "people.csv");
    await expect(app.importPanel.getByLabel(words.IMPORT_TABLE_NAME_LABEL)).toHaveValue("people");
    await expect(app.importPanel.getByRole("status"), "and no sheets are spoken of beside the CSV file").toHaveCount(0);
    await expect(app.importSubmit).toBeEnabled();
    await app.importSubmit.click();
    await expect(app.importDialog).toBeHidden();
    expect((await app.rows("SELECT name FROM sqlite_schema WHERE type = 'table'")).flat()).toEqual(["people"]);
    const events = await eventsOfOpen(page);
    expect(events).toHaveLength(1);
    expect(events[0].lines[0]).toMatch(/^file: people\.csv, \d+ bytes$/);
}

test.describe("a workbook that the browser has no memory left for", () => {
    for (const loss of LOSSES) {
        test(`${loss.what}: the tab is refused with the words for it, ${loss.preview ? "" : "a CSV file chosen with it is imported, "}and the same workbook chosen again is read and imported`, async ({ app, page }) => {
            const errors = watchErrors(page);
            await app.open(FLAGS);
            const before = await snapshot(page, app);
            const library = await watchLibrary(page, { throwing: loss.source });
            // alone: the tab is refused as any refused tab is, Close is all the dialog offers, and nothing is left behind
            await lose(page);
            await app.chooseFiles(LEDGER());
            await dialogReady(app);
            await expectRefused(app, "ledger.xlsx", words.IMPORT_WORKBOOK_NO_MEMORY_REASON);
            // (nothing the engine said)
            await expect(app.importDialog).not.toContainText(/Invalid string length|Array buffer allocation|allocation size|Error:/);
            expect(await library.reads(), "the library was asked to read it once").toBe(1);
            expect(await library.hollow(), "and was given the workbook that holds nothing before the page told of it").toBeGreaterThanOrEqual(1);
            if (loss.preview) {
                const { lookedAt, failedAt } = await page.evaluate(() => ({ lookedAt: window.__lookedAt, failedAt: window.__failedAt }));
                expect(failedAt, "what failed was a look of the dialog's own step, after the reading had looked at the cell").toBeGreaterThan(1);
                expect(lookedAt, "and nothing looked at it after that").toBe(failedAt);
            }
            await closeDialog(app);
            await expectNothingLeft(page, app, before);
            let reads = 1;
            if (!loss.preview) {
                await lose(page);
                await expectCsvImportedBesideLost(app, page);
                reads++;
            }
            // the same workbook again, with the library reading as it does: read, shown and imported
            await app.chooseFiles(LEDGER());
            await dialogReady(app);
            await expect(app.importDialog.locator(".import-refusal")).toHaveCount(0);
            await expect(app.importPanel.getByLabel(words.IMPORT_TABLE_NAME_LABEL)).toHaveValue("Orders");
            await app.importSubmit.click();
            await expect(app.importDialog).toBeHidden();
            expect(await app.rows("SELECT id, item FROM Orders ORDER BY id")).toEqual([[1, "pen"], [2, "ink"]]);
            expect(await library.reads()).toBe(reads + 1);
            // (the dialog's own step too: where it failed, the watch tells, and nothing reaches the page as an error)
            expect(errors).toEqual([]);
        });
    }

    // The dialog reads its files one after the other, and a workbook that is lost for want of memory in the dialog's own
    // turn (the sheets cannot be shown) must not end that loop: the CSV file beside it is read, and imported.
    test("the workbook is read and gone through, and the dialog then has no memory to show its sheets: a CSV file chosen with it is read, and imported", async ({ app, page }) => {
        const errors = watchErrors(page);
        await app.open(FLAGS);
        await watchLibrary(page, { throwing: LOSSES.find((loss) => loss.preview).source });
        await lose(page);
        await expectCsvImportedBesideLost(app, page);
        expect(errors, "and the loss reaches the page as no error").toEqual([]);
    });

    // In Firefox a browser with no memory left cannot even look at what was thrown: the catch of the step that failed
    // fails in its turn. Nothing that tells of the loss depends on a catch that can finish, and the turn that reads the
    // files waits for the watch: the workbook is refused in words, and the CSV file beside it is read, with no error.
    test("the dialog has no memory to show the sheets, nor any to look at what failed: the workbook is refused with the words for it, and a CSV file chosen with it is read, and imported", async ({ app, page }) => {
        const errors = watchErrors(page);
        await app.open(FLAGS);
        await watchLibrary(page, {
            // (the first cell of the second row throws, for a look that the preview makes, what cannot itself be looked at)
            throwing: afterReading(
                'const row = book.Sheets[book.SheetNames[0]]["!data"][1]; const cell = row[0]; Object.defineProperty(row, 0, { configurable: true, enumerable: true, get() { if (new Error().stack.includes("previewRows")) { throw { get message() { throw new Error("out of memory"); } }; } return cell; } })'
            ),
        });
        await lose(page);
        await expectCsvImportedBesideLost(app, page);
        expect(errors, "and the loss reaches the page as no error").toEqual([]);
    });

    // The whole file in memory is the first thing a workbook asks of the browser. One that has no room for it is not a
    // file that cannot be read: it is refused with the words for no memory, before the library is asked for anything.
    // (The workbook is larger than the pieces the page reads of a file before it reads it whole, so that the read of
    // the whole file can be told from them by its size.)
    test("a workbook whose bytes the browser has no memory to hold is refused with the words for it, the library is never asked to read it, and the same workbook chosen again is read and imported", async ({ app, page }) => {
        const errors = watchErrors(page);
        await app.open(FLAGS);
        const before = await snapshot(page, app);
        const library = await watchLibrary(page);
        const heavy = () => asFile("ledger.xlsx", fflate.zipSync({ ...baseParts(), "customXml/item1.xml": [new Uint8Array(200_000).fill(32), { level: 0 }] }));
        await page.evaluate((size) => {
            const whole = Blob.prototype.arrayBuffer;
            window.__wholeReads = 0;
            Blob.prototype.arrayBuffer = function () {
                if (this.size === size) {
                    window.__wholeReads++;
                    if (window.__lose > 0) {
                        window.__lose--;
                        return Promise.reject(new RangeError("Array buffer allocation failed"));
                    }
                }
                return whole.apply(this, arguments);
            };
        }, heavy().buffer.length);
        await lose(page);
        await app.chooseFiles(heavy());
        await dialogReady(app);
        await expectRefused(app, "ledger.xlsx", words.IMPORT_WORKBOOK_NO_MEMORY_REASON);
        await expect(app.importDialog).not.toContainText(/Array buffer allocation|Error:/);
        expect(await page.evaluate(() => window.__wholeReads), "the page asked for the whole file once, and that was what failed").toBe(1);
        expect(await library.reads(), "the library was never asked to read it").toBe(0);
        expect(await library.hollow()).toBe(0);
        await closeDialog(app);
        await expectNothingLeft(page, app, before);
        // the same workbook again, with room for it: read, shown and imported
        await app.chooseFiles(heavy());
        await dialogReady(app);
        await expect(app.importDialog.locator(".import-refusal")).toHaveCount(0);
        await expect(app.importPanel.getByLabel(words.IMPORT_TABLE_NAME_LABEL)).toHaveValue("Orders");
        await app.importSubmit.click();
        await expect(app.importDialog).toBeHidden();
        expect(await app.rows("SELECT id, item FROM Orders ORDER BY id")).toEqual([[1, "pen"], [2, "ink"]]);
        expect(await library.reads()).toBe(1);
        expect(errors).toEqual([]);
    });

    // A sheet's panel is made when its tab is first shown, and its preview looks at the sheet's cells. Where the browser
    // has no memory for that at that moment, the panel is not left half made for good: it counts as made only when it
    // was made whole, so the next time the sheet is shown it is made again. (The second sheet's first cell throws once,
    // for a look that the preview makes.)
    test("a later sheet whose preview fails for want of memory when its tab is first shown is made again the next time it is shown, whole, and its sheet is imported", async ({ app, page }) => {
        const errors = watchErrors(page);
        await app.open(FLAGS);
        await watchLibrary(page, {
            throwing: afterReading(
                'const row = book.Sheets[book.SheetNames[1]]["!data"][0]; const cell = row[0]; window.__previewsLost = 0; Object.defineProperty(row, 0, { configurable: true, enumerable: true, get() { if (window.__previewsLost === 0 && new Error().stack.includes("previewRows")) { window.__previewsLost++; throw new RangeError("Array buffer allocation failed"); } return cell; } })'
            ),
        });
        await lose(page);
        await app.chooseFiles(workbookFile("two.xlsx", TWO_SHEETS));
        await dialogReady(app);
        const sheetTab = (name) => app.importSheetStrip(words.importSheetsLabel("two.xlsx")).getByRole("tab").filter({ hasText: name });
        await expect(app.importSheetPanel.locator(".import-preview-table"), "the first sheet shows its preview").toContainText("pen");
        const failed = page.waitForEvent("pageerror");
        await sheetTab("Notes").click();
        expect(String(await failed), "the preview of the second sheet was what failed").toContain("Array buffer allocation failed");
        expect(await page.evaluate(() => window.__previewsLost)).toBe(1);
        await expect(sheetTab("Notes")).toHaveAttribute("aria-selected", "true");
        await expect(app.importSheetPanel.locator(".import-preview-table"), "the panel that failed part way has no preview").toHaveCount(0);
        // shown again: made whole
        await sheetTab("Orders").click();
        await expect(app.importSheetPanel.locator(".import-preview-table")).toContainText("pen");
        await sheetTab("Notes").click();
        await expect(app.importSheetPanel.locator(".import-preview-table"), "shown again, the second sheet's panel is made whole").toContainText("first");
        await expect(app.importSheetPanel.getByLabel(words.IMPORT_TABLE_NAME_LABEL)).toHaveValue("Notes");
        await expect(app.importSheetPanel.getByLabel(words.IMPORT_TABLE_NAME_LABEL), "one field for the table's name, not the half-made panel's beside it").toHaveCount(1);
        await expect(app.importSubmit).toBeEnabled();
        await app.importSubmit.click();
        await expect(app.importDialog).toBeHidden();
        expect((await app.rows("SELECT name FROM sqlite_schema WHERE type = 'table' ORDER BY name")).flat()).toEqual(["Notes", "Orders"]);
        expect(await app.rows("SELECT note FROM Notes")).toEqual([["first"]]);
        expect(errors, "the one failure is all the page said").toHaveLength(1);
    });

    // The first workbook's reading is lost; the second is chosen with it, and the one dialog reads them one at a time:
    // the second is read once the first has been told of, and does not wait for anything more
    test("two workbooks chosen together, the first lost for want of memory: the second is read and shows its sheets, and Import imports it", async ({ app, page }) => {
        await app.open(FLAGS);
        const library = await watchLibrary(page, { throwing: LOSSES[2].source });
        await lose(page);
        await app.chooseFiles([workbookFile("first.xlsx", [{ name: "Orders", rows: [["id"], [1]] }]), workbookFile("second.xlsx", [{ name: "Stock", rows: [["id"], [7]] }])]);
        await selectTab(app, "second.xlsx");
        await expect(app.importPanel.getByLabel(words.IMPORT_TABLE_NAME_LABEL), "the second workbook is read although the first was lost").toHaveValue("Stock", { timeout: 15_000 });
        await dialogReady(app);
        await expect(refusedTab(app, "first.xlsx")).toBeVisible();
        await selectTab(app, "first.xlsx");
        await expect(app.importPanel.locator(".import-refusal")).toHaveText(words.IMPORT_WORKBOOK_NO_MEMORY_REASON);
        await selectTab(app, "second.xlsx");
        await expect(app.importSubmit).toBeEnabled();
        await app.importSubmit.click();
        await expect(app.importDialog).toBeHidden();
        expect((await app.rows("SELECT name FROM sqlite_schema WHERE type = 'table'")).flat()).toEqual(["Stock"]);
        expect(await app.rows("SELECT id FROM Stock")).toEqual([[7]]);
        expect(await library.reads(), "each workbook was read once").toBe(2);
    });

    // A wait between two sheets (the page gives itself a turn) can last longer than the watch's turn, and a
    // watch that was still set then would tell of a call that was not lost. Every turn the page gives itself
    // after the library has read is held for three times as long as the watch comes round, and the page's clock
    // stands still so that the turn is never a wait for a frame: the workbook is read, its sheets show, and no
    // word about memory is said.
    test("a workbook whose sheets are gone through with a wait between them that lasts longer than the watch's turn is read and shown, and is not refused for want of memory", async ({ app, page }) => {
        await app.open(FLAGS);
        await page.evaluate((hold) => {
            const frozen = performance.now();
            performance.now = () => frozen;
            // (the turns before the library has read, between the parts of the zip, are not held)
            const delay = () => (window.__xlsxReads > 0 ? hold : 0);
            if (globalThis.scheduler && typeof globalThis.scheduler.yield === "function") {
                globalThis.scheduler.yield = () => new Promise((resolve) => setTimeout(resolve, delay()));
            } else {
                const post = MessagePort.prototype.postMessage;
                MessagePort.prototype.postMessage = function (...args) {
                    setTimeout(() => post.apply(this, args), delay());
                };
            }
        }, words.WORKBOOK_WATCH_MS * 3);
        const library = await watchLibrary(page);
        await app.chooseFiles(workbookFile("three.xlsx", [1, 2, 3].map((n) => ({ name: `Sheet ${n}`, rows: [["id"], [n]] }))));
        await dialogReady(app);
        await expect(app.importDialog.locator(".import-refusal")).toHaveCount(0);
        await expect(app.importPanel.getByRole("status")).toHaveText(words.importSheetsCountText({ ticked: 3, tickable: 3 }));
        expect(await library.reads()).toBe(1);
        await app.importSubmit.click();
        await expect(app.importDialog).toBeHidden();
        expect((await app.rows("SELECT name FROM sqlite_schema WHERE type = 'table' ORDER BY name")).flat()).toHaveLength(3);
    });

    // The watch is set again after each wait between two sheets: what fails for want of memory in the going through of
    // a later sheet is told as well. The second sheet's cell, looked at by the reading's own going through (its stack
    // has readSheet, and none of the dialog's), is what fails.
    test("the going through of a second sheet fails for want of memory, after the wait that follows the first: the tab is refused with the words for it, and the same workbook chosen again is read", async ({ app, page }) => {
        await app.open(FLAGS);
        const before = await snapshot(page, app);
        const library = await watchLibrary(page, {
            throwing: afterReading(
                'const row = book.Sheets[book.SheetNames[1]]["!data"][1]; const cell = row[0]; window.__failedIn = null; Object.defineProperty(row, 0, { configurable: true, enumerable: true, get() { if (/\\breadSheet\\b/.test(new Error().stack)) { window.__failedIn = new Error().stack; throw new RangeError("Array buffer allocation failed"); } return cell; } })'
            ),
        });
        await lose(page);
        await app.chooseFiles(workbookFile("two.xlsx", TWO_SHEETS));
        await dialogReady(app);
        await expectRefused(app, "two.xlsx", words.IMPORT_WORKBOOK_NO_MEMORY_REASON);
        const failedIn = await page.evaluate(() => window.__failedIn);
        expect(failedIn, "what failed was a look of the reading's own going through of the sheets").not.toBeNull();
        expect(failedIn).not.toContain("previewRows");
        expect(await library.reads()).toBe(1);
        await closeDialog(app);
        await expectNothingLeft(page, app, before);
        await app.chooseFiles(workbookFile("two.xlsx", TWO_SHEETS));
        await dialogReady(app);
        await expect(app.importDialog.locator(".import-refusal")).toHaveCount(0);
        await app.importSubmit.click();
        await expect(app.importDialog).toBeHidden();
        expect((await app.rows("SELECT name FROM sqlite_schema WHERE type = 'table' ORDER BY name")).flat()).toEqual(["Notes", "Orders"]);
        expect(await library.reads()).toBe(2);
    });

    // The workbook's tab says "nothing ticked" when none of its sheets is (a workbook of one hidden sheet): the dialog's
    // own step sets that mark before it fails on the preview, and a tab refused after that has the refusal's words
    // alone, as every refused tab has, not a sign and words about sheets that are not shown.
    test("a workbook of one hidden sheet that is lost for want of memory while its sheets are shown: the refused tab has the sign and the words of a refusal alone", async ({ app, page }) => {
        await app.open(FLAGS);
        await watchLibrary(page, { throwing: LOSSES.find((loss) => loss.preview).source });
        await lose(page);
        await app.chooseFiles(workbookFile("hid.xlsx", [{ name: "Hid", rows: [["id", "item"], [1, "pen"], [2, "ink"]], hidden: 1 }]));
        await dialogReady(app);
        await expectRefused(app, "hid.xlsx", words.IMPORT_WORKBOOK_NO_MEMORY_REASON);
        await expect(refusedTab(app, "hid.xlsx").locator(".import-tab-nothing"), "no mark of the sheets that were never shown").toHaveCount(0);
        await expect(refusedTab(app, "hid.xlsx")).toHaveText(`hid.xlsx(${words.IMPORT_REFUSED_TAB_TEXT})`);
    });

    // The page gives itself a turn between two sheets, and that turn needs a little memory too: where it fails for want
    // of memory (the dialog is still there), it is the browser that has none, and the watch tells of it. It is never
    // taken for the dialog having moved on, which would leave the tab saying for ever that the file is being read.
    // The page's clock stands still, so that the turn is a plain one (scheduler.yield, or a message to itself), and the
    // first such turn after the library has read throws.
    test("the page's own turn between two sheets fails for want of memory while the dialog is still there: the tab is refused with the words for it, and the same workbook chosen again is read", async ({ app, page }) => {
        const errors = watchErrors(page);
        await app.open(FLAGS);
        const before = await snapshot(page, app);
        await page.evaluate(() => {
            const frozen = performance.now();
            performance.now = () => frozen;
            window.__turnsLost = 0;
            const lost = () => {
                if (window.__xlsxReads > 0 && window.__lose > 0) {
                    window.__lose--;
                    window.__turnsLost++;
                    throw new RangeError("out of memory");
                }
            };
            if (globalThis.scheduler && typeof globalThis.scheduler.yield === "function") {
                const yielded = globalThis.scheduler.yield.bind(globalThis.scheduler);
                globalThis.scheduler.yield = () => {
                    lost();
                    return yielded();
                };
            } else {
                const post = MessagePort.prototype.postMessage;
                MessagePort.prototype.postMessage = function (...args) {
                    lost();
                    return post.apply(this, args);
                };
            }
        });
        const library = await watchLibrary(page);
        await lose(page);
        await app.chooseFiles(workbookFile("two.xlsx", TWO_SHEETS));
        await dialogReady(app);
        await expectRefused(app, "two.xlsx", words.IMPORT_WORKBOOK_NO_MEMORY_REASON);
        expect(await page.evaluate(() => window.__turnsLost), "a turn of the page's own was what failed").toBe(1);
        expect(await library.reads()).toBe(1);
        await closeDialog(app);
        await expectNothingLeft(page, app, before);
        await app.chooseFiles(workbookFile("two.xlsx", TWO_SHEETS));
        await dialogReady(app);
        await expect(app.importDialog.locator(".import-refusal")).toHaveCount(0);
        await app.importSubmit.click();
        await expect(app.importDialog).toBeHidden();
        expect((await app.rows("SELECT name FROM sqlite_schema WHERE type = 'table' ORDER BY name")).flat()).toEqual(["Notes", "Orders"]);
        expect(await library.reads()).toBe(2);
        expect(errors).toEqual([]);
    });

    // The watch is set only while the page's own script runs, and is taken away at every outcome of a reading. The timers
    // that come round (those set with the watch's interval) are counted from the start of the page: how many were set, how
    // many are set still, and how many ever came round. After each outcome none is set, none ever came round, and the
    // watch was set on the way (so that the count can fail). The outcomes: the sheets shown; a file refused for a fault
    // that is not about memory; a fault that is not about memory in the going through of the sheets, and one in the
    // dialog's own step that shows them (the tab then says nothing, which is the page's own fault to mend: no word about
    // memory is said for it); and a dialog that moves on while the library reads.
    test("the watch is taken away at every outcome of a reading, and never comes round for a workbook that was not lost: the sheets shown, a refusal, a fault of another kind, a dialog that moved on", async ({ app, page }) => {
        await page.addInitScript(`(() => {
            const set = window.setInterval;
            const clear = window.clearInterval;
            window.__timers = { live: new Set(), set: 0, fired: 0 };
            window.setInterval = function (fn, ms, ...rest) {
                if (ms !== ${words.WORKBOOK_WATCH_MS}) {
                    return set.apply(window, arguments);
                }
                const id = set.call(window, function () { window.__timers.fired++; return fn.apply(this, arguments); }, ms, ...rest);
                window.__timers.live.add(id);
                window.__timers.set++;
                return id;
            };
            window.clearInterval = function (id) {
                window.__timers.live.delete(id);
                return clear.call(window, id);
            };
        })()`);
        const errors = watchErrors(page);
        await app.open(FLAGS);
        // what the library does for the read of a chosen file, by the mode the test sets for it
        const stackHas = (name) => `/\\b${name}\\b/.test(new Error().stack)`;
        const fails = (name) =>
            `const row = book.Sheets[book.SheetNames[0]]["!data"][1]; const cell = row[0]; Object.defineProperty(row, 0, { configurable: true, enumerable: true, get() { if (${stackHas(name)}) { throw new TypeError("not a function"); } return cell; } })`;
        await watchLibrary(page, {
            throwing: `const mode = window.__mode; window.__mode = null;
                if (mode === "refused") { throw new Error("Unsupported file"); }
                const book = read.apply(this, arguments);
                if (mode === "going through") { ${fails("readSheet")}; }
                if (mode === "dialog") { ${fails("previewRows")}; }
                if (mode === "left") { document.querySelector("#import-dialog .app-dialog-actions button[type=button]").click(); }
                return book`,
        });
        let used = 0;
        const settled = async (what) => {
            const timers = await page.evaluate(() => ({ live: window.__timers.live.size, set: window.__timers.set, fired: window.__timers.fired }));
            expect(timers.live, `${what}: no watch is left set`).toBe(0);
            expect(timers.fired, `${what}: the watch never came round`).toBe(0);
            expect(timers.set, `${what}: the watch was set on the way`).toBeGreaterThan(used);
            used = timers.set;
        };
        const choose = async (mode) => {
            await page.evaluate((m) => (window.__mode = m), mode);
            await app.chooseFiles(workbookFile("book.xlsx", [1, 2, 3].map((n) => ({ name: `Sheet ${n}`, rows: [["id"], [n]] }))));
        };
        await choose(null);
        await dialogReady(app);
        await expect(app.importPanel.getByRole("status")).toHaveText(words.importSheetsCountText({ ticked: 3, tickable: 3 }));
        await settled("sheets shown");
        await dismiss(app);
        await choose("refused");
        await dialogReady(app);
        await expectRefused(app, "book.xlsx", words.IMPORT_WORKBOOK_UNREADABLE_REASON);
        await settled("a refusal");
        await closeDialog(app);
        await choose("going through");
        await dialogReady(app);
        await expectRefused(app, "book.xlsx", words.IMPORT_UNREADABLE_REASON);
        await settled("a fault in the going through of the sheets");
        await closeDialog(app);
        const faulted = page.waitForEvent("pageerror");
        await choose("dialog");
        expect(String(await faulted), "the dialog's own step failed").toContain("not a function");
        await settled("a fault in the dialog's own step");
        await dismiss(app);
        await choose("left");
        await expect(app.importDialog).toBeHidden();
        await settled("a dialog that moved on while the library read");
        expect(errors, "the dialog's own fault is all the page said").toHaveLength(1);
    });

    // When the watch tells, the browser must be able to make small objects again: before that the next thing the student
    // does would fail as the reading did. Making them is made to fail twice, and the watch tries again until it can.
    // The dialog's own watch, for the step that shows the sheets, asks for the same room before it refuses the file.
    for (const [title, source] of [
        ["a workbook that was lost for want of memory is told of once the browser can make small objects again, and not before: the watch tries again while it cannot", () => LOSSES[0].source],
        [
            "a workbook that was lost while the dialog showed its sheets is told of once the browser can make small objects again, and not before: the dialog's own watch tries again while it cannot",
            () => LOSSES.find((loss) => loss.preview).source,
        ],
    ]) {
        test(title, async ({ app, page }) => {
            await page.addInitScript(() => {
                const from = Array.from;
                window.__probes = 0;
                // (the watch's probe makes a great many small objects with a function: nothing else does)
                Array.from = function (source, map) {
                    if (source && source.length >= 100_000 && typeof map === "function" && ++window.__probes <= 2) {
                        throw new RangeError("out of memory");
                    }
                    return from.apply(this, arguments);
                };
            });
            await app.open(FLAGS);
            await watchLibrary(page, { throwing: source() });
            await lose(page);
            await app.chooseFiles(LEDGER());
            await dialogReady(app);
            await expectRefused(app, "ledger.xlsx", words.IMPORT_WORKBOOK_NO_MEMORY_REASON);
            expect(await page.evaluate(() => window.__probes), "two tries that could not, and the third that could").toBe(3);
        });
    }

    // Between the loss and the telling the browser may have no room, for some turns of the watch. What was lost has been
    // let go by then, and the tab is one that is still being read, with nothing of the workbook on show: Import is off,
    // the file behind it waits for room as well, and the dialog can be used meanwhile (another tab shown, and back) with
    // no fault. With room again the workbook is refused as any file is, its panel named by its tab, and the file behind
    // it is read.
    test("while the browser has no room to tell of a workbook that was lost as its sheets were shown, its tab is one that is still being read: nothing of its sheets is on show, Import is off, and the CSV file behind it waits; with room again it is refused, and the CSV file is read and imported", async ({ app, page }) => {
        const errors = watchErrors(page);
        await page.addInitScript(ROOM_HELD);
        await app.open(FLAGS);
        await watchLibrary(page, { throwing: LOSSES.find((loss) => loss.preview).source });
        await page.evaluate(() => (window.__noRoom = true));
        await lose(page);
        await app.chooseFiles([LEDGER(), csvFile("people.csv")]);
        // (two turns of the watch that asked for room and had none)
        await expect.poll(() => page.evaluate(() => window.__probes)).toBeGreaterThanOrEqual(2);
        await expect(app.importTabs, "neither tab says anything but its file's name").toHaveText(["ledger.xlsx", "people.csv"]);
        await expect(app.importPanel.locator("*"), "nothing of the workbook is on show").toHaveCount(0);
        await expect(app.importSubmit).toBeDisabled();
        await selectTab(app, "people.csv");
        await expect(app.importPanel.locator(".import-reading"), "the file behind it waits for room too").toHaveCount(1);
        await selectTab(app, "ledger.xlsx");
        await expect(app.importPanel.locator("*")).toHaveCount(0);
        await expect(app.importSubmit).toBeDisabled();
        expect(errors, "and the dialog was used meanwhile with no fault").toEqual([]);
        // room again
        await page.evaluate(() => (window.__noRoom = false));
        await expectRefused(app, "ledger.xlsx", words.IMPORT_WORKBOOK_NO_MEMORY_REASON, { only: false });
        expect(await app.importPanel.getAttribute("aria-labelledby"), "the refused panel is named by its tab, as any refused file's is").toBe(await refusedTab(app, "ledger.xlsx").getAttribute("id"));
        await selectTab(app, "people.csv");
        await expect(app.importPanel.getByLabel(words.IMPORT_TABLE_NAME_LABEL)).toHaveValue("people");
        await expect(app.importSubmit).toBeEnabled();
        await app.importSubmit.click();
        await expect(app.importDialog).toBeHidden();
        expect((await app.rows("SELECT name FROM sqlite_schema WHERE type = 'table'")).flat()).toEqual(["people"]);
        expect(errors).toEqual([]);
    });

    // The same wait with the workbook as the last file: the CSV file before it is read and could be imported, and the
    // workbook holds Import up as a file that is still being read does. (A tab that had lost its workbook and were
    // taken for a file that is ready would be imported as the text it is not.) The line beside Import names it.
    test("while the browser has no room to tell of a workbook that was lost as its sheets were shown, the workbook holds Import up as a file that is still being read, with a CSV file before it read and ready: the line beside Import names the workbook", async ({ app, page }) => {
        const errors = watchErrors(page);
        await page.addInitScript(ROOM_HELD);
        await app.open(FLAGS);
        await watchLibrary(page, { throwing: LOSSES.find((loss) => loss.preview).source });
        await page.evaluate(() => (window.__noRoom = true));
        await lose(page);
        await app.chooseFiles([csvFile("people.csv"), LEDGER()]);
        await expect.poll(() => page.evaluate(() => window.__probes)).toBeGreaterThanOrEqual(2);
        await expect(app.importPanel.getByLabel(words.IMPORT_TABLE_NAME_LABEL), "the CSV file is read, and on show").toHaveValue("people");
        // (the tabs are shown in turn, which makes the dialog look at every file again)
        await selectTab(app, "ledger.xlsx");
        await expect(app.importPanel.locator("*"), "nothing of the workbook is on show").toHaveCount(0);
        await selectTab(app, "people.csv");
        await expect(app.importSubmit, "Import waits for the workbook").toBeDisabled();
        await expect(holdLine(app)).toHaveText(words.importHoldReadingMessage("ledger.xlsx"));
        expect(errors).toEqual([]);
        // room again: the workbook is refused, and the CSV file is imported alone
        await page.evaluate(() => (window.__noRoom = false));
        await expect(refusedTab(app, "ledger.xlsx")).toBeVisible();
        await expect(app.importSubmit).toBeEnabled();
        await expect(holdLine(app)).toBeHidden();
        await app.importSubmit.click();
        await expect(app.importDialog).toBeHidden();
        expect((await app.rows("SELECT name FROM sqlite_schema WHERE type = 'table'")).flat()).toEqual(["people"]);
        expect(errors).toEqual([]);
    });

    // The dialog's own step can fail after the sheets were first shown (here, where the strip of the sheets' tabs is
    // brought into view, which the step does after the first sheet's panel was made and Import was turned on). Until the
    // telling has room the tab is one that is being read again, and Import must be off as it is for any such tab: pressed
    // then, it would find no sheet to import (a fault of the page) or import the other files and leave the workbook out.
    for (const [what, files] of [
        ["alone", () => [workbookFile("two.xlsx", TWO_SHEETS)]],
        ["with a CSV file before it", () => [csvFile("people.csv"), workbookFile("two.xlsx", TWO_SHEETS)]],
    ]) {
        test(`a workbook lost after its sheets were first shown, ${what}: Import is off while the browser has no room to tell of it, and with room it is refused as any file is`, async ({ app, page }) => {
            const errors = watchErrors(page);
            await page.addInitScript(ROOM_HELD);
            await page.addInitScript(() => {
                // (the strip's size is asked for once, for the look that brings a tab into view, and it fails)
                const size = Element.prototype.getBoundingClientRect;
                window.__stripLost = 0;
                Element.prototype.getBoundingClientRect = function () {
                    if (window.__stripFails && this.classList.contains("import-sheet-tabs")) {
                        window.__stripFails = false;
                        window.__stripLost++;
                        throw new RangeError("Array buffer allocation failed");
                    }
                    return size.apply(this, arguments);
                };
            });
            await app.open(FLAGS);
            await page.evaluate(() => {
                window.__stripFails = true;
                window.__noRoom = true;
            });
            await app.chooseFiles(files());
            await expect.poll(() => page.evaluate(() => window.__probes)).toBeGreaterThanOrEqual(2);
            expect(await page.evaluate(() => window.__stripLost), "what failed was the look at the strip, once").toBe(1);
            await expect(app.importSubmit, "Import is off while the workbook is told of").toBeDisabled();
            await selectTab(app, "two.xlsx");
            await expect(app.importPanel.locator("*"), "nothing of the workbook is on show").toHaveCount(0);
            await expect(app.importSubmit).toBeDisabled();
            expect(errors, "and nothing reached the page as an error").toEqual([]);
            // room again
            await page.evaluate(() => (window.__noRoom = false));
            await expectRefused(app, "two.xlsx", words.IMPORT_WORKBOOK_NO_MEMORY_REASON, { only: what === "alone" });
            expect(errors).toEqual([]);
            if (what !== "alone") {
                await selectTab(app, "people.csv");
                await expect(app.importSubmit).toBeEnabled();
                await app.importSubmit.click();
                await expect(app.importDialog).toBeHidden();
                expect((await app.rows("SELECT name FROM sqlite_schema WHERE type = 'table'")).flat()).toEqual(["people"]);
                expect(errors).toEqual([]);
            }
        });
    }

    // The Import button is the dialog's, and the dialog can have moved on to other files before the browser has room to
    // tell of the lost workbook. Import is then theirs: a telling that comes at last, for files the dialog has left,
    // turns nothing off (the files chosen since would have Import off with no reason said, and nothing to turn it on).
    test("a workbook lost after its sheets were first shown, when other files were chosen before the browser had room to tell of it: Import stays on for those files, and they are imported", async ({ app, page }) => {
        const errors = watchErrors(page);
        await page.addInitScript(ROOM_HELD);
        await page.addInitScript(() => {
            // (the strip's size is asked for once, for the look that brings a tab into view, and it fails)
            const size = Element.prototype.getBoundingClientRect;
            window.__stripLost = 0;
            Element.prototype.getBoundingClientRect = function () {
                if (window.__stripFails && this.classList.contains("import-sheet-tabs")) {
                    window.__stripFails = false;
                    window.__stripLost++;
                    throw new RangeError("Array buffer allocation failed");
                }
                return size.apply(this, arguments);
            };
        });
        await app.open(FLAGS);
        await page.evaluate(() => {
            window.__stripFails = true;
            window.__noRoom = true;
        });
        await app.chooseFiles([workbookFile("two.xlsx", TWO_SHEETS)]);
        await expect.poll(() => page.evaluate(() => window.__probes)).toBeGreaterThanOrEqual(2);
        expect(await page.evaluate(() => window.__stripLost), "what failed was the look at the strip, once").toBe(1);
        await expect(app.importSubmit).toBeDisabled();
        // another file is chosen while the lost workbook still waits to be told of: the dialog is on that file now
        await app.chooseFiles([csvFile("people.csv")]);
        await dialogReady(app);
        await expect(app.importTabs).toHaveText(["people.csv"]);
        await expect(app.importSubmit).toBeEnabled();
        // room again: from here on a try for room succeeds, and the telling it belongs to has run to its end by the
        // time the page answers the next question put to it
        const tries = await page.evaluate(() => {
            window.__noRoom = false;
            return window.__probes;
        });
        await expect.poll(() => page.evaluate(() => window.__probes)).toBeGreaterThan(tries);
        await expect(app.importSubmit, "Import is still on for the file the dialog is on").toBeEnabled();
        await expect(app.importTabs).toHaveText(["people.csv"]);
        await expect(app.importDialog.locator(".import-refusal")).toHaveCount(0);
        await app.importSubmit.click();
        await expect(app.importDialog).toBeHidden();
        expect((await app.rows("SELECT name FROM sqlite_schema WHERE type = 'table'")).flat()).toEqual(["people"]);
        expect(errors).toEqual([]);
    });

    // What was lost is let go before the browser is asked for room: the sheets are what filled the memory, and while the
    // answer, the tab, or what the tab had shown of them held them, the room would never come. Chromium can be told,
    // from outside the page, to collect what nothing holds. The first sheet of every workbook the library gives is held
    // weakly by the test: while the watch still waits for room it is gone already, and the control, a workbook whose
    // sheets are on show, is there still.
    test("a workbook that was lost while the dialog showed its sheets is let go before the browser is asked for room: nothing holds its sheets while the watch still waits, nor once its tab is refused, and a workbook on show is held", async ({ app, page, browserName }) => {
        test.skip(browserName !== "chromium", "only Chromium can be told, through the protocol, to collect what nothing holds: no other browser here has that command");
        await page.addInitScript(ROOM_HELD);
        await app.open(FLAGS);
        await watchLibrary(page, {
            throwing: `const book = read.apply(this, arguments); window.__sheet = new WeakRef(book.Sheets[book.SheetNames[0]]);
                if (window.__lose > 0) { window.__lose--; const row = book.Sheets[book.SheetNames[0]]["!data"][1]; const cell = row[0]; Object.defineProperty(row, 0, { configurable: true, enumerable: true, get() { if (new Error().stack.includes("previewRows")) { throw new RangeError("Array buffer allocation failed"); } return cell; } }); }
                return book`,
        });
        const session = await page.context().newCDPSession(page);
        const held = async () => {
            await session.send("HeapProfiler.collectGarbage");
            return page.evaluate(() => window.__sheet.deref() !== undefined);
        };
        await page.evaluate(() => (window.__noRoom = true));
        await lose(page);
        await app.chooseFiles(LEDGER());
        await expect.poll(() => page.evaluate(() => window.__probes)).toBeGreaterThanOrEqual(2);
        await expect(refusedTab(app, "ledger.xlsx"), "the loss is not told of yet").toHaveCount(0);
        expect(await held(), "while the watch waits for room, nothing holds the workbook's sheets").toBe(false);
        await page.evaluate(() => (window.__noRoom = false));
        await expectRefused(app, "ledger.xlsx", words.IMPORT_WORKBOOK_NO_MEMORY_REASON);
        expect(await held(), "nor does the refused tab").toBe(false);
        await closeDialog(app);
        // the control: the same workbook, read and on show, is held
        await app.chooseFiles(LEDGER());
        await dialogReady(app);
        await expect(app.importPanel.getByLabel(words.IMPORT_TABLE_NAME_LABEL)).toHaveValue("Orders");
        expect(await held(), "a workbook whose sheets are on show is held").toBe(true);
        await session.detach();
    });

    // A file that was refused for a reason of its own (here, a password) and whose refusal the dialog then had no memory
    // to show is told of by the watch with that reason, which is what the student can act on, and not with the words
    // for no memory. Its tab is a refused tab like any other, though the first try left it half made: the sign was
    // there and the words were not. (The library throws; the next element the page makes, the words of the refusal
    // in the tab, cannot be made.)
    test("a workbook that was refused for a reason of its own, when the dialog has no memory to show the refusal, is refused by the watch with that reason, on a tab with the sign and the words of a refusal alone", async ({ app, page }) => {
        const errors = watchErrors(page);
        await app.open(FLAGS);
        const before = await snapshot(page, app);
        await page.evaluate(() => {
            const create = Document.prototype.createElement;
            window.__elementsLost = 0;
            Document.prototype.createElement = function () {
                if (window.__failElement > 0) {
                    window.__failElement--;
                    window.__elementsLost++;
                    throw new RangeError("out of memory");
                }
                return create.apply(this, arguments);
            };
        });
        const library = await watchLibrary(page, { throwing: losing('window.__failElement = 1; throw new Error("File is password-protected")') });
        await lose(page);
        await app.chooseFiles(LEDGER());
        await dialogReady(app);
        await expectRefused(app, "ledger.xlsx", words.IMPORT_WORKBOOK_LOCKED_REASON);
        expect(await page.evaluate(() => window.__elementsLost), "an element of the refusal was what could not be made").toBe(1);
        await expect(refusedTab(app, "ledger.xlsx")).toHaveText(`ledger.xlsx(${words.IMPORT_REFUSED_TAB_TEXT})`);
        await expect(app.importDialog).not.toContainText(words.IMPORT_WORKBOOK_NO_MEMORY_REASON);
        expect(await library.reads()).toBe(1);
        await closeDialog(app);
        await expectNothingLeft(page, app, before);
        expect(errors).toEqual([]);
    });

    // The library swallows what a sheet's reading throws and goes on, with the sheet left out and its name still listed:
    // for a damaged part, and just the same when the browser had no memory for the sheet (seen in Firefox with a workbook
    // of seven million texts, which was then called damaged). The page cannot tell the two apart. In a workbook that is
    // large enough to be asked about first the words say both, with the size as the likely cause; a small workbook is
    // damaged, as it was. (The library reads the workbook, and one of its two sheets is then taken away.)
    test("a large workbook that the library comes back from with a sheet left out is refused with the words for a sheet that could not be read, and a small one as damaged: nothing of either is imported, and Close is all the dialog offers", async ({ app, page }) => {
        test.slow();
        const errors = watchErrors(page);
        await app.open(FLAGS);
        const before = await snapshot(page, app);
        const library = await watchLibrary(page, { throwing: afterReading("delete book.Sheets[book.SheetNames[0]]") });
        await lose(page);
        await app.chooseFiles(asFile("big.xlsx", bigWorkbook(words.EXCEL_WARN_DATA_BYTES, TWO_SHEETS)));
        await expect(readButton(app)).toBeVisible();
        await readButton(app).click();
        await dialogReady(app);
        await expectRefused(app, "big.xlsx", words.IMPORT_WORKBOOK_SHEET_LOST_REASON);
        expect(await library.reads(), "the library read it, once").toBe(1);
        await closeDialog(app);
        await expectNothingLeft(page, app, before);
        // the same in a small workbook: damaged, as it was
        await lose(page);
        await app.chooseFiles(workbookFile("two.xlsx", TWO_SHEETS));
        await dialogReady(app);
        await expectRefused(app, "two.xlsx", words.IMPORT_WORKBOOK_DAMAGED_REASON);
        expect(await library.reads()).toBe(2);
        await closeDialog(app);
        await expectNothingLeft(page, app, before);
        // and with nothing taken away the large workbook is read and shows both sheets
        await app.chooseFiles(asFile("big.xlsx", bigWorkbook(words.EXCEL_WARN_DATA_BYTES, TWO_SHEETS)));
        await readButton(app).click();
        await dialogReady(app);
        await expect(app.importSheetStrip(words.importSheetsLabel("big.xlsx")).getByRole("tab")).toHaveCount(2);
        expect(errors).toEqual([]);
    });

    // What a browser does when it ends a script outright: nothing runs after it, no catch and no finally. Chromium can
    // be made to do that, from outside the page, through the protocol (the way its tools stop a script that never ends).
    // The library's read of the first workbook is made to spin (it says so first, and gives up after twenty seconds, so
    // that a test that goes wrong ends and does not hang), and the test ends the script that spins.
    test("a script that the browser ends outright while the library reads is refused with the words for no memory, and the workbook chosen with it is read", async ({ app, page, browserName }) => {
        test.skip(browserName !== "chromium", "only Chromium can be told, through the protocol, to end a running script outright: no other browser here has that command");
        await app.open(FLAGS);
        let began;
        const spinning = new Promise((resolve) => (began = resolve));
        await page.exposeFunction("__spinning", () => began());
        const library = await watchLibrary(page, {
            // (a finally of its own: it must never run, for a script that is ended runs nothing after it)
            throwing: losing(
                'try { window.__spinning(); const end = performance.now() + 20_000; while (performance.now() < end) {} throw new Error("the script was not ended") } finally { window.__finallyRan = (window.__finallyRan ?? 0) + 1 }'
            ),
        });
        // (the session is made now: a session cannot be made with a page that is busy, and the one that ends the script is needed then)
        const session = await page.context().newCDPSession(page);
        await lose(page);
        await app.chooseFiles([LEDGER(), workbookFile("second.xlsx", [{ name: "Stock", rows: [["id"], [7]] }])]);
        await spinning;
        await session.send("Runtime.terminateExecution");
        await session.detach();
        await selectTab(app, "second.xlsx");
        await expect(app.importPanel.getByLabel(words.IMPORT_TABLE_NAME_LABEL), "the second workbook is read although the first was ended").toHaveValue("Stock", { timeout: 15_000 });
        await dialogReady(app);
        await selectTab(app, "ledger.xlsx");
        await expectRefused(app, "ledger.xlsx", words.IMPORT_WORKBOOK_NO_MEMORY_REASON, { only: false });
        expect(await library.reads()).toBe(2);
        expect(await page.evaluate(() => window.__finallyRan ?? 0), "the script was ended inside the library's read: no finally of the read ran").toBe(0);
        await selectTab(app, "second.xlsx");
        await app.importSubmit.click();
        await expect(app.importDialog).toBeHidden();
        expect(await app.rows("SELECT id FROM Stock")).toEqual([[7]]);
    });
});

// ---- a web page and an XML spreadsheet under an Excel name, full of markup -------------------------------------------
//
// Such a file is read as text and handed to the library, which reads its tables and nothing else: no script
// runs, no address is fetched, no element is made from what the file says. The markup is in every place a page
// can hold a script or an address (the head, the body, an event attribute, a javascript: address, an svg, a frame
// with a document of its own, a meta refresh, a style that imports another, an image, a stylesheet, a form, an
// object, an embed, a video, a base address), and again inside the cells, raw and as text; and in an XML
// spreadsheet, in the name of the sheet and in the values. The addresses are of a host that cannot be reached: a
// request to it is still recorded by the browser, whether it fails or not.
test.describe("a web page and an XML spreadsheet under an Excel name that are full of markup", () => {
    const HOST = "http://markup-host.invalid";
    // a short one: a cell of the preview is cut at some tens of characters, and what is cut away is never shown
    const SHORT = "<img src=http://m.invalid/s onerror=__ran=1>";
    const RUN = (tag) => `window.__ran=(window.__ran||'')+'${tag};';document.title='RAN ${tag}'`;
    const everywhere = (tag) =>
        [
            `<script>${RUN(`${tag} script`)}</script>`,
            `<img src="${HOST}/image-${tag}" onerror="${RUN(`${tag} image`)}">`,
            `<a href="javascript:${RUN(`${tag} address`)}">link</a>`,
            `<svg onload="${RUN(`${tag} svg`)}"><image href="${HOST}/svg-${tag}"/><script>${RUN(`${tag} svg script`)}</script></svg>`,
            `<iframe src="${HOST}/frame-${tag}" srcdoc="<script>parent.${RUN(`${tag} frame`)}</script>"></iframe>`,
            `<meta http-equiv="refresh" content="0;url=${HOST}/refresh-${tag}">`,
            `<style>@import url(${HOST}/style-${tag}); body{background:url(${HOST}/background-${tag})}</style>`,
            `<link rel="stylesheet" href="${HOST}/link-${tag}.css">`,
            `<form action="${HOST}/form-${tag}" method="post"><input name="a" value="b"><button>go</button></form>`,
            `<object data="${HOST}/object-${tag}"></object><embed src="${HOST}/embed-${tag}">`,
            `<video src="${HOST}/video-${tag}" autoplay onloadstart="${RUN(`${tag} video`)}"></video>`,
            `<base href="${HOST}/base-${tag}/">`,
        ].join("");
    const escapedMarkup = (text) => text.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
    const SHEET_NAME = `${SHORT}${HOST}/sheet-name${RUN("sheet name")}`;
    const PAGE = [
        `<!DOCTYPE html><html><head>${everywhere("head")}</head><body onload="${RUN("body")}">${everywhere("body")}`,
        `<table><tr><th>one</th><th onclick="${RUN("th")}">two</th></tr>`,
        `<tr><td>${everywhere("cell")}</td><td>&lt;script&gt;${RUN("text")}&lt;/script&gt;</td></tr>`,
        `<tr><td style="background:url(${HOST}/cell-style)"><a href="${HOST}/cell-link">3</a></td><td>4</td></tr>`,
        `<tr><td>x${SHORT}</td><td>${escapedMarkup(SHORT)}</td></tr></table></body></html>`,
    ].join("\n");

    const XML_SPREADSHEET = [
        `<?xml version="1.0"?><?mso-application progid="Excel.Sheet"?>`,
        `<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet" xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet">`,
        `<Worksheet ss:Name="${escapedMarkup(SHEET_NAME)}"><Table>`,
        `<Row><Cell><Data ss:Type="String">name</Data></Cell><Cell><Data ss:Type="String">note</Data></Cell></Row>`,
        `<Row><Cell ss:HRef="${HOST}/cell-href"><Data ss:Type="String">${escapedMarkup(SHORT)}</Data></Cell><Cell><Data ss:Type="String">${escapedMarkup(everywhere("xml"))}</Data></Cell><Cell><Data ss:Type="String">${escapedMarkup(`<script>${RUN("xml text")}</script>`)}</Data></Cell></Row>`,
        `</Table></Worksheet></Workbook>`,
    ].join("\n");
    // the elements that would show that a file had made something of its markup (the page's own script that holds
    // the library is the one script with an address, and it is made when the first workbook is read)
    const MADE = "iframe, object, embed, video, audio, base, link[rel=stylesheet], meta[http-equiv], script:not([src]), [onerror], [onload], [onclick]";

    for (const [what, name, text] of [
        ["a web page", "report.xls", PAGE],
        ["a web page under the name of an .xlsx", "report.xlsx", PAGE],
        ["an XML spreadsheet", "sheet.xls", XML_SPREADSHEET],
    ]) {
        test(`${what} runs nothing, fetches nothing and makes no element: its markup is only text in the tables`, async ({ app, page, net }) => {
            await app.open(FLAGS);
            const before = await page.evaluate((selector) => ({ made: document.querySelectorAll(selector).length, title: document.title }), MADE);
            net.clear();
            await app.chooseFiles({ name, mimeType: "application/octet-stream", buffer: Buffer.from(text) });
            await dialogReady(app);
            await expect(app.importDialog.locator(".import-refusal")).toHaveCount(0);
            await app.importSubmit.click();
            await expect(app.importDialog).toBeHidden();
            await expect(app.pane).toHaveAttribute("data-state", "report");
            // a table was made, and the markup is in it as the text it is
            const tables = (await app.rows("SELECT name FROM sqlite_schema WHERE type = 'table' ORDER BY name")).flat();
            expect(tables.length, "a table was made").toBeGreaterThan(0);
            const values = [];
            for (const table of tables) {
                values.push(...(await app.rows(`SELECT * FROM "${table.replaceAll('"', '""')}"`)).flat());
            }
            expect(values.some((value) => typeof value === "string" && value.includes("<script>")), "the text of a script is a value").toBe(true);
            // nothing ran, and no element came of it
            expect(await page.evaluate(() => window.__ran ?? null), "no script ran").toBeNull();
            const after = await page.evaluate((selector) => ({ made: document.querySelectorAll(selector).length, title: document.title }), MADE);
            expect(after.made, "no element of the kinds above was made").toBe(before.made);
            expect(after.title).not.toContain("RAN");
            // nothing was fetched: every request since the file was chosen is the page's own (the library)
            net.expectNoExternalRequests();
            expect(
                net.network.filter((entry) => entry.url.includes(".invalid")),
                "no request to the hosts the file names"
            ).toEqual([]);
            expect(net.paths.filter((path) => !path.startsWith("vendor/")), "the page asked for nothing of its own but a library or a font").toEqual([]);
        });
    }
});
