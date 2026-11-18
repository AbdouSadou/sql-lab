const fs = require("node:fs");
const path = require("node:path");
const { pathToFileURL } = require("node:url");
const AxeBuilder = require("@axe-core/playwright").default;
const {
    test,
    expect,
    openableSets,
    failStorage,
    setStorageFailing,
    editorValue,
    largeCsv,
    fixturePath,
    App,
    SAMPLE_FILE,
    NORTHLIGHT_URL,
    DEFAULT_DATASET,
    realManifest,
    csvFile: csv,
    holdDataset,
    holdImport,
    holdVendor,
    finishHeld,
    slowDown,
    snapshot,
    expectNothingLeft,
    eventsOf,
    eventKeys,
    databaseHandle,
    isOpenDatabase,
    schemaNames: names,
    autocommit,
    repeatTaken,
    watchClosing,
    closingSeen,
    progressKey,
    storedEventLines,
} = require("./helpers");

// Assessment plan, Phase 2 (import CSV): the page around the import. It pins what happens to a
// choice or a drop of files (js/index.js, js/lab/import.js), the library that is loaded on
// demand, the busy state while an import runs, Cancel, and what the page looks like after an
// import. What the import makes of a file (types, names, the report's rows) is pinned by the
// other aw2 files. Everything here drives the real page, on all four projects; the one thing
// read in Node is config-workflow.js, for the texts the student sees. With the flag off
// (the first group) nothing is different from the page as it was.
//
// It also pins: Back and Forward under an idle dialog (the dialog closes, nothing is imported, and
// with a database still on its way Import says so), files chosen or dropped while a database loads
// (a toast and no dialog), the student's transaction that the engine undoes when a page limit is
// reached (said after the failure), a TEMP table or view that takes a name, and the report with a
// very long name and value (cut, with the whole text in title; a name for each table).
//
// And: a name that a TEMP table or view alone has is refused as temporary, one that the database
// has (with a TEMP table of the same name or without) as taken by the database; what follows the
// loading-dialog message (choose the files again once the database has opened); run()'s second lock
// (the open database turned into a course database, or gone), reached by mounting js/lab/import.js
// by hand in a page whose own import is off; and the ids of the reports, from two reports built
// into one container.
//
// And: the report's warning for a quote that is never closed (and none for quotes that pair); the
// staging table being a TEMP table (in sqlite_temp_schema while a file is read, and no page left on
// the free list afterwards); a refusal found during the import (a row too wide after the preview's
// megabyte, a file deleted after it was chosen) that leaves nothing, into a new database and into
// the open one; the open database offered as the destination for a script, a database from a URL,
// the fallback's empty database and an earlier import's database; axe on the notice for events that
// cannot be stored; and about.html's words about the files an import keeps a note of and the credit
// for Papa Parse.
//
// The copy into the typed table (the last bullet of the plan's "Libraries"): a file that needs six
// copy steps shows the line "Making the table" and a bar that moves from step to step, and Cancel
// and Escape in the middle of the copy leave nothing, into a new database and into the open one
// with the student's transaction still open.
//
// And: an import that runs the browser out of memory (a hard heap limit; into the open database
// with and without the student's transaction, and into a new one); the switcher's "Open a file..."
// and "Open from URL..." entries clicked from script while an import runs; the notice for events
// that cannot be stored going away (after an import with storage that works, once the held-back
// events are stored with the next one, and for stored events of a later version or that are not
// JSON); the editor's names, the Schema tab and the status bar after an import into the open
// database and into a new one.
//
// And: the import's savepoint is gone from the student's transaction after a Cancel; the engine's
// allocator failing while rows are staged is said as a lack of memory; and in the group on keys in
// the dialog, the second Escape of a visit, the end of an import by itself and a dialog closed from
// script each leave no held Enter to repeat into the editor and no tabs behind.
//
// The import is behind the preview flag "import": a page opened with ?preview=import has it.
// A held import is made by routing the library's request through a gate (vendor/papaparse.min.js:
// the first request, the preview's, goes through; the next one waits), so the import is "running"
// for as long as the test wants, and the tests can try what is refused meanwhile.

const load = (file) => import(pathToFileURL(path.join(__dirname, "..", "js", "lab", file)).href);

const IMPORT_URL = "./?preview=import";
const READER = "vendor/papaparse.min.js";
const READER_URL = `**/${READER}`;
const NORTHLIGHT_IMPORT_URL = `${NORTHLIGHT_URL}&preview=import`;
// A course database that is not the default one (none when only one ships). The tests that pick the
// default from the switcher while something is held start on it: the pick is then a change of
// database whichever course database is the default (picking the open one changes nothing, and
// nothing would load). A test that needs it is skipped when there is none.
const OTHER_DATASET = realManifest().datasets.find((entry) => entry.id !== DEFAULT_DATASET.id);
const OTHER_IMPORT_URL = `./?db=${OTHER_DATASET?.id}&preview=import`;
const NO_OTHER_DATASET = "only one course database ships";

let words;
test.beforeAll(async () => {
    words = { ...(await load("config.js")), ...(await load("config-workflow.js")) };
});

// the notice for events that could not be stored, as a visit with the import alone reads it
const importNotice = () => words.storageNoticeEventsText({ imports: true, exports: false });

// ---- small helpers ------------------------------------------------------------------------------

// What the Phase 3 specs share with this one is in tests/helpers.js, and used from there: csv (it
// is csvFile there), holdImport and finishHeld (the held import, made with holdVendor), slowDown,
// holdDataset, snapshot, expectNothingLeft (with waitUntilIdle), eventsOf, eventKeys, databaseHandle,
// isOpenDatabase and names (schemaNames there). What stays here differs from what is there: slowCopy
// (below) delays only the turns of the copy, not every turn, as slowDown does.

// the sample database again under another name
const copyOfSample = (name) => ({ name, mimeType: "application/octet-stream", buffer: fs.readFileSync(SAMPLE_FILE) });

// how often the page asked for the CSV reader
function countReader(page) {
    const seen = [];
    page.on("request", (request) => {
        if (new URL(request.url()).pathname.endsWith(`/${READER}`)) {
            seen.push(request.url());
        }
    });
    return () => seen.length;
}

// waits until the open database is another one than `before`, and the page is ready
async function expectOpened(page, app, before) {
    await page.waitForFunction((old) => window.app.database !== old, before);
    await app.waitReady();
}

// whether the keyboard focus is on nothing in particular (the body, or no element)
const focusIsOnBody = (page) => page.evaluate(() => document.activeElement === null || document.activeElement === document.body);

// a CSV file of `rows` rows of text: more than a database with a page limit can take
const bigCsv = (name = "big.csv", rows = 4000) =>
    csv(name, `id,note\n${Array.from({ length: rows }, (_, i) => `${i},${"x".repeat(60)}${i}`).join("\n")}\n`);

// ---- 1. the flag off ----------------------------------------------------------------------------

test.describe("with the flag off the page is as it was", () => {
    test("the file input takes one file and has no list of kinds", async ({ page, app }) => {
        await app.open(NORTHLIGHT_URL);
        const input = await page.locator("#open-file-input").evaluate((el) => ({ multiple: el.multiple, accept: el.getAttribute("accept") }));
        expect(input).toEqual({ multiple: false, accept: null });
    });

    test("a CSV file that is chosen is tried as a database, and no dialog opens", async ({ page, app }) => {
        await app.open(NORTHLIGHT_URL);
        await app.chooseFiles(fixturePath("messy_sales.csv"));
        await expect(app.errorBand).toBeVisible();
        await expect(app.errorBand).toContainText(/not a database/i);
        await expect(page.locator("#import-dialog[open]")).toHaveCount(0);
    });

    test("a file that is dropped is cancelled and opens nothing", async ({ page, app }) => {
        await app.open(NORTHLIGHT_URL);
        await app.recordToasts();
        const before = await databaseHandle(page);
        const editorBefore = await editorValue(page);
        const titleBefore = await page.title();
        for (const file of [fixturePath("messy_sales.csv"), SAMPLE_FILE]) {
            expect(await app.dropFiles(file, { target: "#results-pane" })).toBe(true);
        }
        await app.expectToasts([]);
        expect(await isOpenDatabase(page, before)).toBe(true);
        expect(await editorValue(page)).toBe(editorBefore);
        await expect(page.locator("#import-dialog[open]")).toHaveCount(0);
        expect(await page.title()).toBe(titleBefore);
    });

    test("the reader is never requested, and is not on the page", async ({ page, app, net }) => {
        await app.open(NORTHLIGHT_URL);
        const count = countReader(page);
        await app.chooseFiles(fixturePath("messy_sales.csv"));
        await expect(app.errorBand).toBeVisible();
        await app.dropFiles(fixturePath("messy_sales.csv"));
        await page.waitForLoadState("networkidle");
        expect(count()).toBe(0);
        expect(net.paths.filter((p) => /papaparse/i.test(p))).toEqual([]);
        expect(await page.evaluate(() => "Papa" in window)).toBe(false);
    });

    test("the menu entry keeps its old description", async ({ page, app }) => {
        await app.open(NORTHLIGHT_URL);
        await app.databaseButton.click();
        await expect(page.locator("#open-file")).toContainText(words.OPEN_FILE_DESCRIPTION);
        await expect(page.locator("#open-file")).not.toContainText(words.OPEN_FILE_WITH_IMPORT_DESCRIPTION);
    });
});

// ---- 2. the flag on, before anything is chosen ----------------------------------------------------

test.describe("with the flag on, before anything is chosen", () => {
    test("the file input takes several files and has no list of kinds", async ({ page, app }) => {
        await app.open(NORTHLIGHT_IMPORT_URL);
        const input = await page.locator("#open-file-input").evaluate((el) => ({ multiple: el.multiple, accept: el.getAttribute("accept") }));
        expect(input).toEqual({ multiple: true, accept: null });
    });

    test("the menu entry says that it takes CSV files too", async ({ page, app }) => {
        await app.open(NORTHLIGHT_IMPORT_URL);
        await app.databaseButton.click();
        await expect(page.locator("#open-file")).toContainText(words.OPEN_FILE_WITH_IMPORT_DESCRIPTION);
        await expect(page.locator("#open-file")).not.toContainText(words.OPEN_FILE_DESCRIPTION);
    });

    test("a first visit asks for no library, and the page has none", async ({ page, app, net }) => {
        await app.open(IMPORT_URL);
        await page.waitForLoadState("networkidle");
        expect(net.paths.filter((p) => /papaparse|xlsx|fflate/i.test(p))).toEqual([]);
        expect(await page.evaluate(() => window.Papa)).toBeUndefined();
        await expect(page.locator("#import-dialog[open]")).toHaveCount(0);
    });
});

test.describe("the flag is read once, when the page loads", () => {
    test("it stays on after a database was opened and the address lost ?preview=import", async ({ page, app }) => {
        await app.open(NORTHLIGHT_IMPORT_URL);
        const before = await databaseHandle(page);
        await app.chooseFiles(SAMPLE_FILE);
        await expectOpened(page, app, before);
        expect(await page.evaluate(() => location.search)).toBe("");
        // several files can still be chosen, and a drop is still a choice
        expect(await page.locator("#open-file-input").evaluate((el) => el.multiple)).toBe(true);
        expect(await app.dropFiles([csv("a.csv"), csv("b.csv")])).toBe(true);
        await expect(app.importTabs).toHaveText(["a.csv", "b.csv"]);
    });
});

// ---- 3. the library, loaded on demand --------------------------------------------------------------

test.describe("the CSV reader is loaded when it is first needed", () => {
    test("choosing a text file requests it once, and importing and importing again request it no more", async ({ page, app, net }) => {
        await app.open(NORTHLIGHT_IMPORT_URL);
        const count = countReader(page);
        await app.chooseFiles(csv("first.csv"));
        await expect(app.importDialog).toBeVisible();
        await expect(app.importDialog.locator(".import-reading")).toHaveCount(0);
        expect(count()).toBe(1);
        // closing the dialog and choosing again
        await app.importCancel.click();
        await expect(app.importDialog).toBeHidden();
        await app.chooseFiles(csv("second.csv"));
        await expect(app.importPanel.locator(".import-preview-table")).toBeVisible();
        expect(count()).toBe(1);
        await app.importCancel.click();
        // an import, then another
        await app.importFiles(csv("third.csv"));
        expect(count()).toBe(1);
        await app.importFiles(csv("fourth.csv"));
        expect(count()).toBe(1);
        expect(net.paths.filter((p) => p === READER)).toHaveLength(1);
        expect(await page.evaluate(() => typeof window.Papa)).toBe("object");
        net.expectNoExternalRequests();
    });

    test("choosing only a workbook requests it not at all", async ({ page, app }) => {
        await app.open(NORTHLIGHT_IMPORT_URL);
        const count = countReader(page);
        await app.chooseFiles(fixturePath("shopping_db.xlsx"));
        await expect(app.importDialog).toBeVisible();
        await expect(app.importTabs).toHaveCount(1);
        await expect(app.importTabs.first()).toContainText(`(${words.IMPORT_REFUSED_TAB_TEXT})`);
        await page.waitForLoadState("networkidle");
        expect(count()).toBe(0);
        expect(await page.evaluate(() => "Papa" in window)).toBe(false);
    });

    test("when it cannot be loaded the tab says so, the dialog offers Close, and the page works", async ({ page, app }) => {
        await app.open(NORTHLIGHT_IMPORT_URL);
        await page.route(READER_URL, (route) => route.abort());
        await app.chooseFiles(csv("people.csv"));
        await expect(app.importDialog).toBeVisible();
        await expect(app.importTabs).toHaveCount(1);
        await expect(app.importPanel).toContainText(words.IMPORT_LIBRARY_FAILED_MESSAGE);
        await expect(app.importTabs.first()).toContainText(`(${words.IMPORT_REFUSED_TAB_TEXT})`);
        await expect(app.importCancel).toHaveText(words.IMPORT_CLOSE_TEXT);
        await expect(app.importSubmit).toBeHidden();
        await app.importCancel.click();
        await expect(app.importDialog).toBeHidden();
        // the page still works
        expect(await app.query("SELECT 1 AS one")).toEqual({ columns: ["one"], rows: [["1"]] });
    });

    test("when it cannot be loaded as the import begins, the dialog says so and stays, nothing opens, and the page is free", async ({ page, app }) => {
        await app.open(NORTHLIGHT_IMPORT_URL);
        const handle = await databaseHandle(page);
        await app.chooseFiles(csv());
        await expect(app.importDialog).toBeVisible();
        await expect(app.importDialog.locator(".import-reading")).toHaveCount(0);
        await expect(app.importSubmit).toBeEnabled();
        await page.route(READER_URL, (route) => route.abort());
        await page.evaluate(() => {
            delete window.Papa;
        });
        await app.importSubmit.click();
        await expect(app.importDialog.locator("#import-error")).toHaveText(words.IMPORT_LIBRARY_FAILED_MESSAGE);
        await expect(app.importDialog).toBeVisible();
        await expect(app.importDialog.locator(".import-progress")).toBeHidden();
        expect(await isOpenDatabase(page, handle)).toBe(true);
        // the import is over: it can be tried again once the reader can be loaded
        await page.unroute(READER_URL);
        await app.importSubmit.click();
        await expect(app.importDialog).toBeHidden();
        await expect(app.pane).toHaveAttribute("data-state", "report");
        expect(await app.rows("SELECT count(*) FROM people")).toEqual([[2]]);
    });

    test("after a failure a later choice works once the reader can be loaded", async ({ page, app }) => {
        await app.open(NORTHLIGHT_IMPORT_URL);
        await page.route(READER_URL, (route) => route.abort());
        await app.chooseFiles(csv("people.csv"));
        await expect(app.importPanel).toContainText(words.IMPORT_LIBRARY_FAILED_MESSAGE);
        await app.importCancel.click();
        await expect(app.importDialog).toBeHidden();
        await page.unroute(READER_URL);
        await app.importFiles(csv("people.csv"));
        await expect(app.summary).toContainText(words.importedMessage(1, "people"));
        expect(await app.rows("SELECT count(*) FROM people")).toEqual([[2]]);
    });
});

// ---- 4. what a choice or a drop does ----------------------------------------------------------------

const SCRIPT = App.sqlFile("notes.sql", "CREATE TABLE note (id INTEGER, body TEXT);\nINSERT INTO note VALUES (1, 'first');\n");
const DROP_TARGETS = ["#results-pane", ".topbar", "#editor", "#sidebar"];

test.describe("what a choice does, with the flag on", () => {
    test("one database is opened as ever", async ({ page, app }) => {
        await app.open(NORTHLIGHT_IMPORT_URL);
        await app.recordToasts();
        const before = await databaseHandle(page);
        await app.chooseFiles(SAMPLE_FILE);
        await expectOpened(page, app, before);
        await expect(app.databaseLabel).toHaveText("sample.db");
        expect(await names(app)).toEqual(expect.arrayContaining(["fruit", "tags", "v_priced"]));
        await expect(app.toast).toContainText("Opened sample.db");
        await expect(page.locator("#import-dialog[open]")).toHaveCount(0);
        // the address is the plain page, as it is after any opened file
        await expect(page).toHaveURL(/\/(repo\/)?$/);
    });

    test("one script is opened as ever", async ({ page, app }) => {
        await app.open(NORTHLIGHT_IMPORT_URL);
        const before = await databaseHandle(page);
        await app.chooseFiles(SCRIPT);
        await expectOpened(page, app, before);
        await expect(app.databaseLabel).toHaveText("notes.sql");
        expect(await app.rows("SELECT id, body FROM note")).toEqual([[1, "first"]]);
        await expect(app.toast).toContainText("Opened notes.sql");
        await expect(page.locator("#import-dialog[open]")).toHaveCount(0);
    });

    test("a CSV file and a database together are refused in a toast, and no dialog opens", async ({ page, app }) => {
        await app.open(NORTHLIGHT_IMPORT_URL);
        await app.recordToasts();
        const before = await databaseHandle(page);
        const editorBefore = await editorValue(page);
        await app.chooseFiles([csv(), copyOfSample("sample.db")]);
        await app.expectToasts([words.IMPORT_MIXED_MESSAGE]);
        await expect(page.locator("#import-dialog[open]")).toHaveCount(0);
        expect(await isOpenDatabase(page, before)).toBe(true);
        expect(await editorValue(page)).toBe(editorBefore);
    });

    test("a CSV file and a script together are refused in the same way", async ({ page, app }) => {
        await app.open(NORTHLIGHT_IMPORT_URL);
        await app.recordToasts();
        const before = await databaseHandle(page);
        await app.chooseFiles([SCRIPT, csv()]);
        await app.expectToasts([words.IMPORT_MIXED_MESSAGE]);
        await expect(page.locator("#import-dialog[open]")).toHaveCount(0);
        expect(await isOpenDatabase(page, before)).toBe(true);
    });

    test("two databases together are refused in a toast, and nothing is opened", async ({ page, app }) => {
        await app.open(NORTHLIGHT_IMPORT_URL);
        await app.recordToasts();
        const before = await databaseHandle(page);
        await app.chooseFiles([copyOfSample("sample.db"), copyOfSample("other.db")]);
        await app.expectToasts([words.IMPORT_SEVERAL_DATABASES_MESSAGE]);
        await expect(page.locator("#import-dialog[open]")).toHaveCount(0);
        expect(await isOpenDatabase(page, before)).toBe(true);
    });

    test("a database and a script together are refused in the same way", async ({ page, app }) => {
        await app.open(NORTHLIGHT_IMPORT_URL);
        await app.recordToasts();
        const before = await databaseHandle(page);
        await app.chooseFiles([copyOfSample("sample.db"), SCRIPT]);
        await app.expectToasts([words.IMPORT_SEVERAL_DATABASES_MESSAGE]);
        await expect(page.locator("#import-dialog[open]")).toHaveCount(0);
        expect(await isOpenDatabase(page, before)).toBe(true);
    });

    test("names in capitals are taken as import files, one tab for each", async ({ page, app }) => {
        await app.open(NORTHLIGHT_IMPORT_URL);
        await app.chooseFiles([csv("DATA.CSV"), csv("Notes.TXT", "a\tb\n1\t2\n"), csv("Rows.Tsv", "a\tb\n1\t2\n")]);
        await expect(app.importDialog).toBeVisible();
        await expect(app.importTabs).toHaveText(["DATA.CSV", "Notes.TXT", "Rows.Tsv"]);
        await expect(app.importDialog.locator(".import-reading")).toHaveCount(0);
        await expect(app.importTabs.locator(".import-tab-refused")).toHaveCount(0);
    });
});

test.describe("a drop is a choice, wherever it lands", () => {
    for (const target of DROP_TARGETS) {
        test(`on ${target}: a database, a script and CSV files are taken as a choice takes them, and no text goes in the editor`, async ({ page, app }) => {
            await app.open(NORTHLIGHT_IMPORT_URL);
            // a database
            let before = await databaseHandle(page);
            expect(await app.dropFiles(SAMPLE_FILE, { target })).toBe(true);
            await expectOpened(page, app, before);
            await expect(app.databaseLabel).toHaveText("sample.db");
            // a script (its text is run, and is not put in the editor)
            before = await databaseHandle(page);
            expect(await app.dropFiles(SCRIPT, { target })).toBe(true);
            await expectOpened(page, app, before);
            await expect(app.databaseLabel).toHaveText("notes.sql");
            expect(await app.rows("SELECT body FROM note")).toEqual([["first"]]);
            expect(await editorValue(page)).not.toContain("CREATE TABLE note");
            // CSV files: the dialog, with a tab for each
            expect(await app.dropFiles([csv("a.csv"), csv("b.csv")], { target })).toBe(true);
            await expect(app.importDialog).toBeVisible();
            await expect(app.importTabs).toHaveText(["a.csv", "b.csv"]);
            expect(await editorValue(page)).not.toContain("id,name");
        });
    }

    test("a mix is refused in a toast, and the editor is left as it was", async ({ page, app }) => {
        await app.open(NORTHLIGHT_IMPORT_URL);
        await app.recordToasts();
        const before = await databaseHandle(page);
        const editorBefore = await editorValue(page);
        expect(await app.dropFiles([csv(), SAMPLE_FILE], { target: "#editor" })).toBe(true);
        await app.expectToasts([words.IMPORT_MIXED_MESSAGE]);
        await expect(page.locator("#import-dialog[open]")).toHaveCount(0);
        expect(await isOpenDatabase(page, before)).toBe(true);
        expect(await editorValue(page)).toBe(editorBefore);
    });

    test("two databases are refused in a toast", async ({ page, app }) => {
        await app.open(NORTHLIGHT_IMPORT_URL);
        await app.recordToasts();
        const before = await databaseHandle(page);
        expect(await app.dropFiles([SAMPLE_FILE, copyOfSample("other.db")], { target: "#results-pane" })).toBe(true);
        await app.expectToasts([words.IMPORT_SEVERAL_DATABASES_MESSAGE]);
        expect(await isOpenDatabase(page, before)).toBe(true);
    });

    test("names in capitals that are dropped are taken as import files", async ({ app }) => {
        await app.open(NORTHLIGHT_IMPORT_URL);
        expect(await app.dropFiles([csv("DATA.CSV"), csv("Notes.TXT")])).toBe(true);
        await expect(app.importTabs).toHaveText(["DATA.CSV", "Notes.TXT"]);
    });

    test("a drop that carries no file does nothing", async ({ page, app }) => {
        await app.open(NORTHLIGHT_IMPORT_URL);
        await app.recordToasts();
        const before = await databaseHandle(page);
        await page.evaluate(() => {
            const data = new DataTransfer();
            data.setData("text/plain", "SELECT 1;");
            document.querySelector("#results-pane").dispatchEvent(new DragEvent("drop", { dataTransfer: data, bubbles: true, cancelable: true }));
        });
        await app.expectToasts([]);
        await expect(page.locator("#import-dialog[open]")).toHaveCount(0);
        expect(await isOpenDatabase(page, before)).toBe(true);
    });
});

test.describe("a drop is ignored while another dialog is open", () => {
    test("the export dialog stays, and neither the import dialog nor a database opens", async ({ page, app }) => {
        await app.open(NORTHLIGHT_IMPORT_URL);
        await app.recordToasts();
        const before = await databaseHandle(page);
        await app.openExportMenu();
        await page.locator("#export-db").click();
        await expect(page.locator("#export-dialog")).toBeVisible();
        expect(await app.dropFiles([csv("a.csv")], { target: "#export-dialog" })).toBe(true);
        expect(await app.dropFiles(SAMPLE_FILE)).toBe(true);
        await app.expectToasts([]);
        await expect(page.locator("#export-dialog")).toBeVisible();
        await expect(page.locator("#import-dialog[open]")).toHaveCount(0);
        expect(await isOpenDatabase(page, before)).toBe(true);
    });

    test("Open from URL stays, and nothing opens", async ({ page, app }) => {
        await app.open(NORTHLIGHT_IMPORT_URL);
        const before = await databaseHandle(page);
        await page.keyboard.press("Control+u");
        await expect(page.locator("#open-url-dialog")).toBeVisible();
        expect(await app.dropFiles([csv("a.csv")])).toBe(true);
        expect(await app.dropFiles(SAMPLE_FILE)).toBe(true);
        await page.waitForTimeout(300);
        await expect(page.locator("#open-url-dialog")).toBeVisible();
        await expect(page.locator("#import-dialog[open]")).toHaveCount(0);
        expect(await isOpenDatabase(page, before)).toBe(true);
    });

    test("the import dialog keeps the files it has, and is not opened again for new ones", async ({ page, app }) => {
        await app.open(NORTHLIGHT_IMPORT_URL);
        await app.chooseFiles(csv("first.csv"));
        await expect(app.importTabs).toHaveText(["first.csv"]);
        expect(await app.dropFiles([csv("second.csv"), csv("third.csv")])).toBe(true);
        await page.waitForTimeout(300);
        await expect(app.importTabs).toHaveText(["first.csv"]);
    });
});

// ---- 4b. Back and Forward under the dialog; files that come while a database loads --------------------

// Back and Forward cannot be refused, and they open a database under the modal dialog: the dialog
// was worked out for the database that was open (its destination, its names). Opening a file
// database and then going Back reaches the default course database (the address of the first visit).
// openUnderDialog gets there: a fresh visit (whose tables are noted), a file database, and the
// dialog open for `files`, read, with the destination chosen.
async function openUnderDialog(page, app, { files, into = "new", track = false }) {
    await app.open(IMPORT_URL);
    if (track) {
        await app.trackConnections();
    }
    const course = await names(app);
    await app.upload(SAMPLE_FILE);
    await app.chooseFiles(files);
    await expect(app.importDialog).toBeVisible();
    await expect(app.importDialog.locator(".import-reading")).toHaveCount(0);
    if (into === "open") {
        await app.importDialog.locator("#import-into-open").check();
        await expect(app.importDialog.locator("#import-into-open")).toBeChecked();
    }
    return course;
}

test.describe("Back under an idle dialog closes it, and nothing is imported", () => {
    const cases = [
        ["the open database ticked", { files: csv("evil.csv", "a,b\n1,2\n"), into: "open" }],
        ["the default destination, a new database", { files: csv("evil.csv", "a,b\n1,2\n"), into: "new" }],
        ["only refused files in it (and a Close button)", { files: fixturePath("shopping_db.xlsx"), into: "new", refusedOnly: true }],
    ];
    for (const [title, setup] of cases) {
        test(`with ${title}: the course database that opens is as a fresh visit has it, and the page is quiet`, async ({ page, app, pageErrors }) => {
            const course = await openUnderDialog(page, app, setup);
            if (setup.refusedOnly) {
                await expect(app.importCancel).toHaveText(words.IMPORT_CLOSE_TEXT);
            }
            const before = await databaseHandle(page);
            await page.goBack();
            await expectOpened(page, app, before);
            await expect(app.importDialog).toBeHidden();
            await expect(page.locator("#import-dialog[open]")).toHaveCount(0);
            // the database that opened is the course database, untouched
            await expect(app.databaseLabel).toHaveText(DEFAULT_DATASET.name);
            expect(await names(app)).toEqual(course);
            expect(await app.rows("SELECT count(*) FROM sqlite_schema WHERE name IN ('evil', 'people')")).toEqual([[0]]);
            // nothing was written to the evidence log, and nothing went wrong
            expect(await eventKeys(page)).toEqual([]);
            expect(pageErrors).toEqual([]);
            // the keyboard has somewhere to be
            expect(await focusIsOnBody(page)).toBe(false);
            // and the page is free: a Run works, and files chosen now open the dialog again
            expect(await app.query("SELECT 1 AS one")).toEqual({ columns: ["one"], rows: [["1"]] });
            await app.chooseFiles(csv("again.csv"));
            await expect(app.importTabs).toHaveText(["again.csv"]);
            await expect(app.importDialog.locator("#import-into-open")).toBeDisabled();
        });
    }

    test("Forward does the same", async ({ page, app, pageErrors }) => {
        await app.open(IMPORT_URL);
        await app.upload(SAMPLE_FILE);
        await page.goBack();
        await app.waitReady();
        await expect(app.databaseLabel).toHaveText(DEFAULT_DATASET.name);
        await app.chooseFiles(csv("evil.csv", "a,b\n1,2\n"));
        await expect(app.importDialog).toBeVisible();
        await expect(app.importDialog.locator(".import-reading")).toHaveCount(0);
        const before = await databaseHandle(page);
        await page.goForward();
        await expectOpened(page, app, before);
        await expect(app.importDialog).toBeHidden();
        // (the address of the uploaded file is "./": the default course database opens again)
        await expect(app.databaseLabel).toHaveText(DEFAULT_DATASET.name);
        expect(await names(app)).not.toContain("evil");
        expect(await eventKeys(page)).toEqual([]);
        expect(pageErrors).toEqual([]);
        expect(await focusIsOnBody(page)).toBe(false);
    });
});

test.describe("Back under a dialog while the database it leads to is still loading", () => {
    // Import is pressed in the moment between Back and the database's arrival: the open database is
    // about to be closed, and a course database must never receive files.
    async function backAndHold(page, app, setup) {
        const course = await openUnderDialog(page, app, setup);
        const handle = await databaseHandle(page);
        const held = await holdDataset(page);
        await page.goBack();
        await held.requested;
        await expect(app.pane).toHaveAttribute("data-state", "loading");
        // the dialog is still there: no database has opened yet
        await expect(app.importDialog).toBeVisible();
        return { course, handle, held };
    }

    test("Import says so in the dialog's alert, imports nothing, and leaves the page free; the dialog goes when the database opens", async ({ page, app }) => {
        const { course, handle, held } = await backAndHold(page, app, { files: csv("people.csv"), into: "open" });
        await app.importSubmit.click();
        const error = app.importDialog.locator("#import-error");
        await expect(error).toHaveText(words.IMPORT_LOADING_DIALOG_MESSAGE);
        await expect(error).toHaveAttribute("role", "alert");
        await expect(app.importDialog).toBeVisible();
        // nothing began: no progress bar, Import and Cancel are as they were, the file database has no table
        await expect(app.importDialog.locator(".import-progress")).toBeHidden();
        await expect(app.importSubmit).toBeEnabled();
        await expect(app.importCancel).toBeEnabled();
        expect(await isOpenDatabase(page, handle)).toBe(true);
        expect(await names(app)).not.toContain("people");
        expect(await eventKeys(page)).toEqual([]);
        // the database arrives: the dialog closes, and nothing was imported into it
        held.release();
        await expect(app.importDialog).toBeHidden();
        await app.waitReady();
        await expect(app.databaseLabel).toHaveText(DEFAULT_DATASET.name);
        expect(await names(app)).toEqual(course);
        expect(await eventKeys(page)).toEqual([]);
        // the busy state was not left on: a Run is taken, not refused (the toast of the load that
        // has just ended may still come: only the refusal is looked for)
        await app.recordToasts();
        expect(await app.query("SELECT 1 AS one")).toEqual({ columns: ["one"], rows: [["1"]] });
        expect(await app.toasts()).not.toContain(words.IMPORT_BUSY_MESSAGE);
    });

    test("Import into a new database says so too, and no database is made", async ({ page, app }) => {
        const { held } = await backAndHold(page, app, { files: csv("people.csv"), into: "new", track: true });
        await app.importSubmit.click();
        await expect(app.importDialog.locator("#import-error")).toHaveText(words.IMPORT_LOADING_DIALOG_MESSAGE);
        held.release();
        await expect(app.importDialog).toBeHidden();
        await app.waitReady();
        // (tracked: the course database's own load; no "people" database was begun)
        expect((await app.connections()).map((connection) => connection.name)).not.toContain("people");
        expect(await eventKeys(page)).toEqual([]);
    });

    // The message makes two promises, and what follows it must keep both: "Once it has opened,
    // choose the files again" (the dialog is closed when that database opens, and files chosen
    // again open it again and can be imported) and "If it does not open, press Import again"
    // (the test after this one: the dialog is still there and Import then works).
    test("the message says to choose the files again once the database has opened, and the same files, chosen again, are imported", async ({ page, app }) => {
        const files = csv("people.csv");
        const { held } = await backAndHold(page, app, { files, into: "open" });
        await app.importSubmit.click();
        const error = app.importDialog.locator("#import-error");
        await expect(error).toHaveText(words.IMPORT_LOADING_DIALOG_MESSAGE);
        // (the sentence must name what the student does, in the order in which it happens)
        await expect(error).toHaveText(/choose the files again/i);
        await expect(error).toHaveText(/press Import again/i);
        held.release();
        await expect(app.importDialog).toBeHidden();
        await app.waitReady();
        await expect(app.databaseLabel).toHaveText(DEFAULT_DATASET.name);
        // the same files, chosen again: the dialog is open again, with no message left over
        await app.chooseFiles(files);
        await expect(app.importDialog).toBeVisible();
        await expect(app.importTabs).toHaveText(["people.csv"]);
        await expect(app.importDialog.locator(".import-reading")).toHaveCount(0);
        await expect(app.importDialog.locator("#import-error")).toBeHidden();
        // (a course database is open now: the files go into a new database)
        await expect(app.importDialog.locator("#import-into-open")).toBeDisabled();
        await expect(app.importDialog.locator("#import-into-new")).toBeChecked();
        await expect(app.importSubmit).toBeEnabled();
        await app.importSubmit.click();
        await expect(app.importDialog).toBeHidden();
        await expect(app.pane).toHaveAttribute("data-state", "report");
        await expect(app.databaseLabel).toHaveText("people");
        expect(await app.rows("SELECT id, name FROM people ORDER BY id")).toEqual([[1, "Ann"], [2, "Bob"]]);
    });

    test("when the held fetch FAILS the dialog stays, the open database is still the file, and Import then works into it", async ({ page, app }) => {
        const { handle, held } = await backAndHold(page, app, { files: csv("people.csv"), into: "open" });
        await app.importSubmit.click();
        await expect(app.importDialog.locator("#import-error")).toHaveText(words.IMPORT_LOADING_DIALOG_MESSAGE);
        held.fail();
        // the load ends without a database: the error band, and the file database is open as it was
        await expect(app.errorBand).toBeVisible();
        await expect(app.importDialog).toBeVisible();
        expect(await isOpenDatabase(page, handle)).toBe(true);
        await expect(app.importDialog.locator("#import-into-open")).toBeChecked();
        await app.importSubmit.click();
        await expect(app.importDialog).toBeHidden();
        await expect(app.pane).toHaveAttribute("data-state", "report");
        expect(await isOpenDatabase(page, handle)).toBe(true);
        expect(await app.rows("SELECT id, name FROM people ORDER BY id")).toEqual([[1, "Ann"], [2, "Bob"]]);
        await expect(app.databaseLabel).toHaveText("sample.db");
    });
});

// ---- 4c. the second lock in run() -----------------------------------------------------------------------

// js/lab/import.js run() looks at the destination again when Import is pressed: the open database
// may be a course database by then, or gone. The page cannot get there (the dialog closes when
// another database opens), so the import is mounted a second time, by hand, from the page's own
// module (bundle/app.js gives it by name; the flag is read once, when the page loads, so the page
// is opened with it). The page's own dialog is taken out first: the second has the same id. Its
// hooks are stand-ins: the database is a stub that counts what is done to it.
test.describe("run() looks at the destination again: the open database turned into a course database, or gone", () => {
    // into: the destination chosen in the dialog. opens: what the stand-in for the page's
    // openBuilt answers (it closes the database it is handed when it says no, as the page's does).
    async function mountByHand(page, app, { into = "open", opens = true } = {}) {
        await app.open(IMPORT_URL);
        await expect(app.importDialog).toHaveCount(1);
        await page.evaluate(async (opens) => {
            const { mountImport } = (await import("./bundle/app.js")).import;
            document.getElementById("import-dialog").remove();
            const state = { database: null, course: false, execs: [], touched: [], errors: 0, built: [], reports: 0, changed: 0, shown: 0 };
            state.database = {
                name: "stand-in.db",
                db: {
                    selectValues: () => [],
                    exec: (sql) => state.execs.push(String(sql?.sql ?? sql)),
                    get pointer() {
                        state.touched.push("pointer");
                        return 0;
                    },
                },
                capi: { sqlite3_get_autocommit: () => 1 },
            };
            const input = document.createElement("input");
            input.type = "file";
            const focus = document.createElement("button");
            document.body.append(input, focus);
            const nothing = () => {};
            state.importer = mountImport({
                fileInput: input,
                returnFocus: focus,
                getDatabase: () => state.database,
                getDatabaseLabel: () => "stand-in.db",
                isCourseDatabase: () => state.course,
                isLoading: () => false,
                openBuilt: async (built) => {
                    state.built.push({ name: built.name, tables: built.db.selectValues("select name from sqlite_schema order by name") });
                    if (!opens) {
                        built.db.close();
                    }
                    return opens;
                },
                announceChanged: () => state.changed++,
                runLog: { current: () => ({ key: "stand-in" }) },
                results: { showReport: () => state.reports++ },
                showResult: () => state.shown++,
            });
            window.byHand = state;
        }, opens);
        expect(await page.evaluate(() => window.byHand.importer.enabled)).toBe(true);
        // (the one dialog in the page is the stand-in's now)
        await expect(app.importDialog).toHaveCount(1);
        await page.evaluate(() => window.byHand.importer.take([new File(["a,b\n1,2\n"], "t.csv", { type: "text/csv" })]));
        await expect(app.importDialog).toBeVisible();
        await expect(app.importDialog.locator(".import-reading")).toHaveCount(0);
        if (into === "open") {
            await app.importDialog.locator("#import-into-open").check();
        }
        await expect(app.importSubmit).toBeEnabled();
    }
    const written = (page) => page.evaluate(() => ({ execs: window.byHand.execs, touched: window.byHand.touched }));

    test("with the open database a course database now: Import says so in the alert, the dialog stays, and nothing was written", async ({ page, app }) => {
        await mountByHand(page, app);
        await page.evaluate(() => {
            window.byHand.course = true;
        });
        await app.importSubmit.click();
        const error = app.importDialog.locator("#import-error");
        await expect(error).toHaveText(words.IMPORT_DESTINATION_GONE_MESSAGE);
        await expect(error).toHaveAttribute("role", "alert");
        await expect(app.importDialog).toBeVisible();
        await expect(app.importDialog.locator(".import-progress")).toBeHidden();
        await expect(app.importSubmit).toBeEnabled();
        expect(await written(page)).toEqual({ execs: [], touched: [] });
        expect(await page.evaluate(() => window.byHand.importer.busy())).toBe(false);
        expect(await eventKeys(page)).toEqual([]);
    });

    test("with no open database any more: the same", async ({ page, app }) => {
        await mountByHand(page, app);
        await page.evaluate(() => {
            window.byHand.database = null;
        });
        await app.importSubmit.click();
        await expect(app.importDialog.locator("#import-error")).toHaveText(words.IMPORT_DESTINATION_GONE_MESSAGE);
        await expect(app.importDialog).toBeVisible();
        await expect(app.importSubmit).toBeEnabled();
        expect(await written(page)).toEqual({ execs: [], touched: [] });
        expect(await eventKeys(page)).toEqual([]);
    });

    // the control: the stand-in is a database the import will write to when nothing is wrong, so
    // that "nothing was written" above is the lock's doing and not the stand-in's
    test("control: with the open database still allowed the import goes on to write to it", async ({ page, app }) => {
        await mountByHand(page, app);
        await app.importSubmit.click();
        await expect.poll(async () => (await written(page)).execs.length).toBeGreaterThan(0);
        expect((await written(page)).execs.join("\n")).toContain("savepoint");
        await expect(app.importDialog.locator("#import-error")).not.toHaveText(words.IMPORT_DESTINATION_GONE_MESSAGE);
    });

    // (The closing check of the phase: no test held IMPORT_NOT_OPENED_MESSAGE. The page's own
    // openBuilt says no only when a newer load has taken over, and the page begins none while an
    // import runs, so the stand-in says it. The database was built whole by then, with its
    // table: the import is still told as one that did not happen.)
    test("when the new database cannot be made the open one: Import says so in the alert, and no event, no report and no toast of success is made", async ({ page, app }) => {
        await mountByHand(page, app, { into: "new", opens: false });
        await app.recordToasts();
        await app.importSubmit.click();
        const error = app.importDialog.locator("#import-error");
        await expect(error).toHaveText(words.IMPORT_NOT_OPENED_MESSAGE);
        await expect(error).toHaveAttribute("role", "alert");
        await expect(app.importDialog).toBeVisible();
        await expect(app.importDialog.locator(".import-progress")).toBeHidden();
        await expect(app.importSubmit).toBeEnabled();
        const state = await page.evaluate(() => ({
            built: window.byHand.built,
            reports: window.byHand.reports,
            changed: window.byHand.changed,
            shown: window.byHand.shown,
            busy: window.byHand.importer.busy(),
        }));
        // the stand-in was handed the database the import had made, with the file's table in it
        expect(state).toEqual({ built: [{ name: "t", tables: ["t"] }], reports: 0, changed: 0, shown: 0, busy: false });
        expect(await eventKeys(page)).toEqual([]);
        await app.expectToasts([]);
    });

    // the control for it: with a stand-in that says yes, the same import is told as done
    test("control: when the stand-in opens the new database, the import records its event and shows its report", async ({ page, app }) => {
        await mountByHand(page, app, { into: "new", opens: true });
        await app.importSubmit.click();
        await expect(app.importDialog).toBeHidden();
        const state = await page.evaluate(() => ({ built: window.byHand.built.length, reports: window.byHand.reports, shown: window.byHand.shown }));
        expect(state).toEqual({ built: 1, reports: 1, shown: 1 });
        expect(await eventKeys(page)).toEqual(["sqllab.events.stand-in"]);
    });
});

test.describe("files that come while a database loads are refused, in a toast, and no dialog opens", () => {
    // a choice, or a drop, of the same two files
    const deliver = {
        chosen: (app, files) => app.chooseFiles(files),
        dropped: async (app, files) => expect(await app.dropFiles(files, { target: "#results-pane" })).toBe(true),
    };
    const files = () => [csv("a.csv"), csv("b.csv")];

    for (const how of ["chosen", "dropped"]) {
        test(`${how} while a course database is picked and on its way; after it opens the same files open the dialog`, async ({ page, app }) => {
            test.skip(!OTHER_DATASET, NO_OTHER_DATASET);
            await app.open(OTHER_IMPORT_URL);
            await app.recordToasts();
            const handle = await databaseHandle(page);
            const held = await holdDataset(page);
            await app.pickDatabaseById(DEFAULT_DATASET.id);
            await held.requested;
            await expect(app.pane).toHaveAttribute("data-state", "loading");
            await deliver[how](app, files());
            await expect.poll(() => app.toasts()).toContain(words.IMPORT_LOADING_MESSAGE);
            expect(new Set(await app.toasts())).toEqual(new Set([words.IMPORT_LOADING_MESSAGE]));
            await expect(page.locator("#import-dialog[open]")).toHaveCount(0);
            // the load that was on its way carries on, and the open database was not touched
            expect(await isOpenDatabase(page, handle)).toBe(true);
            held.release();
            await expectOpened(page, app, handle);
            await expect(app.databaseLabel).toHaveText(DEFAULT_DATASET.name);
            await deliver[how](app, files());
            await expect(app.importDialog).toBeVisible();
            await expect(app.importTabs).toHaveText(["a.csv", "b.csv"]);
        });
    }

    for (const how of ["chosen", "dropped"]) {
        test(`${how} during the page's very first load`, async ({ page, app }) => {
            const held = await holdDataset(page);
            await app.recordToasts({ fromStart: true });
            await page.goto(IMPORT_URL);
            await held.requested;
            await deliver[how](app, files());
            await expect.poll(() => app.toasts()).toContain(words.IMPORT_LOADING_MESSAGE);
            expect(new Set(await app.toasts())).toEqual(new Set([words.IMPORT_LOADING_MESSAGE]));
            await expect(page.locator("#import-dialog[open]")).toHaveCount(0);
            held.release();
            await app.waitReady();
            await expect(app.databaseLabel).toHaveText(DEFAULT_DATASET.name);
            await deliver[how](app, files());
            await expect(app.importDialog).toBeVisible();
            await expect(app.importTabs).toHaveText(["a.csv", "b.csv"]);
        });
    }

    test("a workbook that is chosen is refused in the same way", async ({ page, app }) => {
        test.skip(!OTHER_DATASET, NO_OTHER_DATASET);
        await app.open(OTHER_IMPORT_URL);
        await app.recordToasts();
        const held = await holdDataset(page);
        await app.pickDatabaseById(DEFAULT_DATASET.id);
        await held.requested;
        await app.chooseFiles(fixturePath("shopping_db.xlsx"));
        await expect.poll(() => app.toasts()).toContain(words.IMPORT_LOADING_MESSAGE);
        await expect(page.locator("#import-dialog[open]")).toHaveCount(0);
        held.release();
        await app.waitReady();
    });

    test("one database that is chosen while a load is held is opened as ever, and the older load is dropped when it ends", async ({ page, app }) => {
        test.skip(!OTHER_DATASET, NO_OTHER_DATASET);
        await app.open(OTHER_IMPORT_URL);
        await app.recordToasts();
        const held = await holdDataset(page);
        await app.pickDatabaseById(DEFAULT_DATASET.id);
        await held.requested;
        await app.chooseFiles(SAMPLE_FILE);
        await expect(app.databaseLabel).toHaveText("sample.db");
        await app.waitReady();
        expect(await page.evaluate(() => window.app.database.name)).toBe("sample.db");
        expect(await app.toasts()).not.toContain(words.IMPORT_LOADING_MESSAGE);
        await expect(page.locator("#import-dialog[open]")).toHaveCount(0);
        // the course database arrives late, and is thrown away (after the file is in the page, the
        // page is given a few frames to use it)
        const handle = await databaseHandle(page);
        held.release();
        await held.served;
        await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
        expect(await isOpenDatabase(page, handle)).toBe(true);
        expect(await page.evaluate(() => window.app.database.name)).toBe("sample.db");
        await expect(app.databaseLabel).toHaveText("sample.db");
        // the load has ended: files are taken again
        await app.chooseFiles(csv("later.csv"));
        await expect(app.importTabs).toHaveText(["later.csv"]);
        expect(new Set(await app.toasts())).not.toContain(words.IMPORT_LOADING_MESSAGE);
    });

    test("one script that is chosen while a load is held is opened as ever", async ({ page, app }) => {
        test.skip(!OTHER_DATASET, NO_OTHER_DATASET);
        await app.open(OTHER_IMPORT_URL);
        const held = await holdDataset(page);
        await app.pickDatabaseById(DEFAULT_DATASET.id);
        await held.requested;
        await app.chooseFiles(SCRIPT);
        await expect(app.databaseLabel).toHaveText("notes.sql");
        await app.waitReady();
        expect(await app.rows("SELECT body FROM note")).toEqual([["first"]]);
        held.release();
        await app.waitReady();
        await expect(app.databaseLabel).toHaveText("notes.sql");
    });

    test("with the flag off nothing of this exists: a CSV file chosen or dropped while a load is held is tried as a database", async ({ page, app }) => {
        test.skip(!OTHER_DATASET, NO_OTHER_DATASET);
        await app.open(`./?db=${OTHER_DATASET.id}`);
        await app.recordToasts();
        const handle = await databaseHandle(page);
        const held = await holdDataset(page);
        await app.pickDatabaseById(DEFAULT_DATASET.id);
        await held.requested;
        await app.chooseFiles(fixturePath("messy_sales.csv"));
        await expect(app.errorBand).toBeVisible();
        await expect(app.errorBand).toContainText(/not a database/i);
        // (a drop is a cancelled event that opens nothing: the page as it was)
        expect(await app.dropFiles(fixturePath("messy_sales.csv"), { target: "#results-pane" })).toBe(true);
        await expect(page.locator("#import-dialog[open]")).toHaveCount(0);
        expect(await app.toasts()).not.toContain(words.IMPORT_LOADING_MESSAGE);
        held.release();
        await app.waitReady();
        expect(await app.toasts()).not.toContain(words.IMPORT_LOADING_MESSAGE);
        expect(await isOpenDatabase(page, handle)).toBe(true);
    });
});

// ---- 5. the busy state ---------------------------------------------------------------------------------

// an exercise set that the site can open (one whose course database ships too), and another one.
// The tests that need them are skipped, or lose only the part that needs the other one, when the
// site ships fewer.
const SETS = openableSets();
const SET = SETS[0];
const OTHER_SET = SETS.find((set) => set.id !== SET?.id);

// what a student would try while an import runs: all done from inside the page, because the
// dialog is modal and the rest of the page does not take the mouse
test.describe("while an import runs, what could change the open database is refused", () => {
    test("Run is refused in a toast: nothing is run, nothing is logged", async ({ page, app }) => {
        await app.open(NORTHLIGHT_IMPORT_URL);
        await app.editor.fill("SELECT 1 AS one;");
        await app.recordToasts();
        const paneBefore = await app.pane.getAttribute("data-state");
        const held = await holdImport(page, app);
        await page.evaluate(() => window.app.actions.executeCurrent());
        await app.expectToasts([words.IMPORT_BUSY_MESSAGE]);
        await expect(app.pane).toHaveAttribute("data-state", paneBefore);
        expect(await app.readLog("northlight")).toBeNull();
        // the import goes on, and ends with its report
        await finishHeld(app, held);
        // and everything works again
        expect(await app.query("SELECT 1 AS one")).toEqual({ columns: ["one"], rows: [["1"]] });
        expect(await app.readLog("file:people")).toHaveLength(1);
    });

    test("the database export is refused in a toast: no dialog opens and nothing is downloaded", async ({ page, app }) => {
        await app.open(NORTHLIGHT_IMPORT_URL);
        await app.recordToasts();
        let downloads = 0;
        page.on("download", () => downloads++);
        const held = await holdImport(page, app);
        await page.evaluate(() => {
            document.querySelector("#export-button").click();
            document.querySelector("#export-db").click();
        });
        await app.expectToasts([words.IMPORT_BUSY_MESSAGE]);
        await expect(page.locator("#export-dialog[open]")).toHaveCount(0);
        expect(downloads).toBe(0);
        await finishHeld(app, held);
        // afterwards the export is offered again
        await app.openExportMenu();
        await page.locator("#export-db").click();
        await expect(page.locator("#export-dialog")).toBeVisible();
        await expect(page.locator("#export-name")).toHaveValue("people");
    });

    test("picking another course database is refused, and the switcher shows what is open again", async ({ page, app }) => {
        test.skip(!OTHER_DATASET, NO_OTHER_DATASET);
        await app.open(OTHER_IMPORT_URL);
        await app.recordToasts();
        const labelBefore = await app.databaseLabel.textContent();
        const handle = await databaseHandle(page);
        const held = await holdImport(page, app);
        await page.evaluate((id) => {
            document.querySelector("#database-button").click();
            document.querySelector(`[data-dataset-id="${id}"]`).click();
        }, DEFAULT_DATASET.id);
        await app.expectToasts([words.IMPORT_BUSY_MESSAGE]);
        expect(await isOpenDatabase(page, handle)).toBe(true);
        await expect(app.databaseLabel).toHaveText(labelBefore);
        await expect(app.databaseItem(OTHER_DATASET.id)).toHaveAttribute("aria-checked", "true");
        await expect(app.databaseItem(DEFAULT_DATASET.id)).toHaveAttribute("aria-checked", "false");
        await expect(page).toHaveURL(new RegExp(`db=${OTHER_DATASET.id}`));
        await finishHeld(app, held);
        await expect(app.databaseLabel).toHaveText("people");
    });

    // (The closing check of the phase: the map of the code lists a chosen file among what is
    // refused, and no test chose one. Files reach the input while an import runs only from a
    // chooser that was open before Import was pressed; the test puts them in the input.)
    test("CSV files that are chosen are refused in a toast: the dialog keeps the file it has, and the import ends with that one alone", async ({ page, app }) => {
        await app.open(NORTHLIGHT_IMPORT_URL);
        await app.recordToasts();
        const held = await holdImport(page, app);
        await app.chooseFiles([csv("later.csv", "x\n1\n"), csv("more.csv", "y\n2\n")]);
        await app.expectToasts([words.IMPORT_BUSY_MESSAGE]);
        // (the tabs are out of sight while an import runs, so they are counted in the dialog's tree)
        const tabs = app.importDialog.locator('[role="tab"]');
        await expect(tabs).toHaveCount(1);
        await expect(tabs.first()).toContainText("people.csv");
        await expect(app.importDialog.locator(".import-progress")).toBeVisible();
        // (the input is emptied, so that the same files can be chosen again afterwards)
        expect(await page.locator("#open-file-input").evaluate((input) => input.files.length)).toBe(0);
        await finishHeld(app, held);
        await expect(app.databaseLabel).toHaveText("people");
        expect(await names(app)).toEqual(["people"]);
        await app.chooseFiles([csv("later.csv", "x\n1\n"), csv("more.csv", "y\n2\n")]);
        await expect(app.importDialog).toBeVisible();
        await expect(app.importTabs).toHaveCount(2);
    });

    test("a database that is chosen is refused in the same way: it is not opened, and the import ends as it would have", async ({ page, app }) => {
        await app.open(NORTHLIGHT_IMPORT_URL);
        await app.recordToasts();
        const handle = await databaseHandle(page);
        const labelBefore = await app.databaseLabel.textContent();
        const held = await holdImport(page, app);
        await app.chooseFiles(SAMPLE_FILE);
        // (the file is read first, as any file that is opened: the toast comes when it has been)
        await expect.poll(() => app.toasts()).toEqual([words.IMPORT_BUSY_MESSAGE]);
        expect(await isOpenDatabase(page, handle)).toBe(true);
        await expect(app.databaseLabel).toHaveText(labelBefore);
        await expect(app.importDialog.locator(".import-progress")).toBeVisible();
        await finishHeld(app, held);
        await expect(app.databaseLabel).toHaveText("people");
        expect(await names(app)).toEqual(["people"]);
        // and nothing else was said meanwhile: the refusal, then the import's own toast
        await app.expectToasts([words.IMPORT_BUSY_MESSAGE, words.importedMessage(1, "people")]);
    });

    test("Ctrl+O opens no file chooser and Ctrl+U no dialog, and each says why in a toast", async ({ page, app }) => {
        await app.open(NORTHLIGHT_IMPORT_URL);
        await app.recordToasts();
        let choosers = 0;
        page.on("filechooser", () => choosers++);
        const held = await holdImport(page, app);
        await page.keyboard.press("Control+o");
        await app.expectToasts([words.IMPORT_BUSY_MESSAGE]);
        await page.keyboard.press("Control+u");
        await page.waitForTimeout(300);
        expect(choosers).toBe(0);
        await expect(page.locator("#open-url-dialog[open]")).toHaveCount(0);
        expect(new Set(await app.toasts())).toEqual(new Set([words.IMPORT_BUSY_MESSAGE]));
        await finishHeld(app, held);
    });

    // The switcher's menu cannot be reached by a pointer or the keyboard while the dialog is open
    // (it is modal), so these click the entries from script: the one way a student's page could
    // still activate them (a menu left open, a script, an assistive tool).
    test("the switcher's \"Open a file...\" opens no file chooser, says why in a toast, and works again afterwards", async ({ page, app }) => {
        await app.open(NORTHLIGHT_IMPORT_URL);
        await app.recordToasts();
        let choosers = 0;
        page.on("filechooser", () => choosers++);
        const held = await holdImport(page, app);
        await page.evaluate(() => {
            document.querySelector("#database-button").click();
            document.querySelector("#open-file").click();
        });
        await app.expectToasts([words.IMPORT_BUSY_MESSAGE]);
        expect(choosers).toBe(0);
        await finishHeld(app, held);
        // (the same two clicks, with nothing running and no dialog, do open the chooser: the count above is not always 0)
        await page.evaluate(() => {
            document.querySelector("#database-button").click();
            document.querySelector("#open-file").click();
        });
        await expect.poll(() => choosers).toBe(1);
    });

    test("the switcher's \"Open a file...\" opens no file chooser under an idle import dialog either", async ({ page, app }) => {
        await app.open(NORTHLIGHT_IMPORT_URL);
        await app.recordToasts();
        let choosers = 0;
        page.on("filechooser", () => choosers++);
        await app.chooseFiles(csv());
        await expect(app.importDialog).toBeVisible();
        await expect(app.importDialog.locator(".import-reading")).toHaveCount(0);
        await page.evaluate(() => {
            document.querySelector("#database-button").click();
            document.querySelector("#open-file").click();
        });
        // (nothing runs, so there is nothing to say: the dialog is in the way, and that is all)
        await app.expectToasts([]);
        expect(choosers).toBe(0);
        await expect(app.importDialog).toBeVisible();
        await app.importCancel.click();
        await expect(app.importDialog).toBeHidden();
        await page.evaluate(() => {
            document.querySelector("#database-button").click();
            document.querySelector("#open-file").click();
        });
        await expect.poll(() => choosers).toBe(1);
    });

    test("the switcher's \"Open from URL...\" opens no dialog, and says why in a toast", async ({ page, app }) => {
        await app.open(NORTHLIGHT_IMPORT_URL);
        await app.recordToasts();
        const held = await holdImport(page, app);
        await page.evaluate(() => {
            document.querySelector("#database-button").click();
            document.querySelector("#open-url").click();
        });
        await app.expectToasts([words.IMPORT_BUSY_MESSAGE]);
        await expect(page.locator("#open-url-dialog[open]")).toHaveCount(0);
        await finishHeld(app, held);
        // with nothing running the same entry opens its dialog
        await page.evaluate(() => {
            document.querySelector("#database-button").click();
            document.querySelector("#open-url").click();
        });
        await expect(page.locator("#open-url-dialog")).toBeVisible();
    });

    test("Back and Forward open nothing, and the address is put back", async ({ page, app }) => {
        test.skip(!OTHER_DATASET, NO_OTHER_DATASET);
        await app.open(OTHER_IMPORT_URL);
        // a history of the page's own: a course database that is not the default, the default
        // database, and back to the first, with a Forward to give
        await app.pickDatabaseById(DEFAULT_DATASET.id);
        await expect(page).toHaveURL(new RegExp(`db=${DEFAULT_DATASET.id}`));
        await page.evaluate(() => history.back());
        await expect(page).toHaveURL(new RegExp(`db=${OTHER_DATASET.id}`));
        await expect(app.databaseLabel).toHaveText(OTHER_DATASET.name);
        await app.waitReady();
        // (the toast of that load is on screen before the recording starts)
        await expect(app.toast).toContainText(`Opened ${OTHER_DATASET.name}`);
        await app.recordToasts();
        const handle = await databaseHandle(page);
        const held = await holdImport(page, app);
        const href = await page.evaluate(() => location.href);
        await page.evaluate(() => history.forward());
        await expect.poll(async () => (await app.toasts()).length).toBeGreaterThan(0);
        await expect.poll(() => page.evaluate(() => location.href)).toBe(href);
        await page.evaluate(() => history.back());
        await expect.poll(() => page.evaluate(() => location.href)).toBe(href);
        await page.waitForTimeout(300);
        expect(await page.evaluate(() => location.href)).toBe(href);
        expect(await isOpenDatabase(page, handle)).toBe(true);
        await expect(app.databaseLabel).toHaveText(OTHER_DATASET.name);
        expect(new Set(await app.toasts())).toEqual(new Set([words.IMPORT_BUSY_MESSAGE]));
        await finishHeld(app, held);
        await expect(app.databaseLabel).toHaveText("people");
    });
});

test.describe("while an import runs, a drop is ignored", () => {
    test("neither CSV files nor a database that are dropped change anything", async ({ page, app }) => {
        await app.open(NORTHLIGHT_IMPORT_URL);
        const handle = await databaseHandle(page);
        const held = await holdImport(page, app);
        const href = await page.evaluate(() => location.href);
        expect(await app.dropFiles([csv("more.csv"), csv("again.csv")], { target: "#results-pane" })).toBe(true);
        expect(await app.dropFiles(SAMPLE_FILE)).toBe(true);
        await page.waitForTimeout(300);
        expect(await isOpenDatabase(page, handle)).toBe(true);
        expect(await page.evaluate(() => location.href)).toBe(href);
        await expect(app.importDialog.locator(".import-progress")).toBeVisible();
        await finishHeld(app, held);
        // one table, from the one import that ran
        expect(await names(app)).toEqual(["people"]);
    });
});

test.describe("while an import runs, an exercise set stays as it is", () => {
    test("Check checks nothing and marks nothing, and the set picker keeps the open set", async ({ page, app }) => {
        test.skip(!SET, "no exercise set that the site can open ships");
        await page.goto(`./?set=${SET.id}&preview=import`);
        await expect(app.exercisePanel).toBeVisible();
        await app.waitReady();
        await app.editor.fill(SET.exercises[0].model_query);
        await app.recordToasts();
        const pickerBefore = await app.setPicker.getAttribute("aria-label");
        const handle = await databaseHandle(page);
        const held = await holdImport(page, app);
        // a Check
        await page.evaluate(() => document.querySelector("#exercise-check").click());
        await page.waitForTimeout(500);
        await expect(app.feedback).toBeEmpty();
        await expect(app.progress).toHaveText(`0 of ${SET.exercises.length} complete`);
        const stored = await page.evaluate((key) => JSON.parse(localStorage.getItem(key) ?? "null"), progressKey(SET));
        expect(stored?.passed ?? {}).toEqual({});
        await expect(app.pane).not.toHaveAttribute("data-state", "result");
        // another set (when the site has one), and None
        for (const label of [...(OTHER_SET ? [OTHER_SET.title] : []), "None"]) {
            await page.evaluate((text) => {
                document.querySelector("#exercise-set-picker").click();
                const item = [...document.querySelectorAll('#exercise-set-menu [role="menuitemradio"]')].find((el) => el.textContent.trim() === text);
                item.click();
            }, label);
            await page.waitForTimeout(200);
            await expect(app.setPicker).toHaveAttribute("aria-label", pickerBefore);
            await expect(page).toHaveURL(new RegExp(`set=${SET.id}`));
            await expect(app.exercisePanel).toBeVisible();
        }
        expect(await isOpenDatabase(page, handle)).toBe(true);
        expect(new Set(await app.toasts())).toEqual(new Set([words.IMPORT_BUSY_MESSAGE]));
        await finishHeld(app, held);
    });
});

// ---- 6. Cancel leaves nothing ----------------------------------------------------------------------------

// startAndWaitForProgress starts the import of the files already in the dialog, and waits until the bar has moved
async function startAndWaitForProgress(page, app) {
    await expect(app.importSubmit).toBeEnabled();
    await app.importSubmit.click();
    const bar = app.importDialog.locator(".import-progress progress");
    await expect(bar).toBeVisible();
    await expect.poll(() => bar.evaluate((el) => el.value), { timeout: 20_000 }).toBeGreaterThan(0);
    // (part of the way, not full at the first slice: what is done of what there is, not the
    // other way round, which no other test told apart)
    expect(await bar.evaluate((el) => el.value), "the bar is part of the way").toBeLessThan(1);
}

async function expectConnectionsClosed(app) {
    await expect.poll(async () => (await app.connections()).filter((connection) => connection.open)).toEqual([]);
}

test.describe("Cancel leaves nothing", () => {
    test("Cancel while the import waits for the reader: no database opens, no table, no event, no connection left", async ({ page, app }) => {
        await app.open(NORTHLIGHT_IMPORT_URL);
        await app.trackConnections();
        const before = await snapshot(page, app);
        const held = await holdImport(page, app);
        await app.importCancel.click();
        await expect(app.importDialog).toBeHidden();
        held.open();
        await expectNothingLeft(page, app, before, { logKeys: ["northlight", "file:people"] });
        await expectConnectionsClosed(app);
        // the new database was begun, and closed again
        expect((await app.connections()).map((connection) => connection.name)).toEqual(["people"]);
    });

    test("Escape does the same as the Cancel button", async ({ page, app }) => {
        await app.open(NORTHLIGHT_IMPORT_URL);
        await app.trackConnections();
        const before = await snapshot(page, app);
        const held = await holdImport(page, app);
        await page.keyboard.press("Escape");
        await expect(app.importDialog).toBeHidden();
        held.open();
        await expectNothingLeft(page, app, before, { logKeys: ["northlight", "file:people"] });
        await expectConnectionsClosed(app);
    });

    test("Cancel in the middle of a file of 200,000 rows undoes it, and the progress bar had moved", async ({ page, app }) => {
        test.slow();
        await app.open(NORTHLIGHT_IMPORT_URL);
        await app.trackConnections();
        await slowDown(page);
        const before = await snapshot(page, app);
        await app.chooseFiles(largeCsv());
        await expect(app.importDialog).toBeVisible();
        await expect(app.importDialog.locator(".import-reading")).toHaveCount(0);
        await startAndWaitForProgress(page, app);
        await app.importCancel.click();
        await expect(app.importDialog).toBeHidden();
        await expectNothingLeft(page, app, before, { logKeys: ["northlight", "file:large"] });
        await expectConnectionsClosed(app);
        expect((await app.connections()).map((connection) => connection.name)).toEqual(["large"]);
    });

    test("with the open database as the destination, Cancel in the middle of a file leaves its tables as they were and the student's transaction open", async ({ page, app }) => {
        test.slow();
        await app.open(NORTHLIGHT_IMPORT_URL);
        await app.upload(SAMPLE_FILE);
        await app.trackConnections();
        // a transaction of the student's, left open
        await app.run("BEGIN; INSERT INTO fruit (id, name, price) VALUES (900, 'kiwi', 1.5);");
        const countsBefore = await app.rows("SELECT (SELECT count(*) FROM fruit), (SELECT count(*) FROM tags)");
        await slowDown(page);
        const before = await snapshot(page, app);
        await app.chooseFiles(largeCsv());
        await expect(app.importDialog).toBeVisible();
        await expect(app.importDialog.locator(".import-reading")).toHaveCount(0);
        await app.importDialog.locator("#import-into-open").check();
        await startAndWaitForProgress(page, app);
        await app.importCancel.click();
        await expect(app.importDialog).toBeHidden();
        await expectNothingLeft(page, app, before, { logKeys: ["file:sample.db"] });
        expect(await app.rows("SELECT (SELECT count(*) FROM fruit), (SELECT count(*) FROM tags)")).toEqual(countsBefore);
        // the student's transaction is still open, with its row; no other connection was made
        expect(await page.evaluate(() => window.app.database.capi.sqlite3_get_autocommit(window.app.database.db.pointer))).toBe(0);
        expect(await app.rows("SELECT name FROM fruit WHERE id = 900")).toEqual([["kiwi"]]);
        expect(await app.connections()).toEqual([]);
        // the import's savepoint is gone from inside the student's transaction: it was undone and
        // ended, and nothing of it waits to be ended by their COMMIT or ROLLBACK
        // (the name is the code's own, so that it follows the code if it is ever changed)
        const { SAVEPOINT } = await load("import-db.js");
        const release = await page.evaluate((name) => {
            try {
                window.app.database.db.exec(`release ${name}`);
                return "released";
            } catch (error) {
                return String(error.message);
            }
        }, SAVEPOINT);
        expect(release, "the import's savepoint is still on the connection's stack").toMatch(/no such savepoint/i);
        await app.run("ROLLBACK;");
        expect(await app.rows("SELECT count(*) FROM fruit WHERE id = 900")).toEqual([[0]]);
    });

    test("with the open database as the destination, Cancel before the import began leaves it as it was", async ({ page, app }) => {
        await app.open(NORTHLIGHT_IMPORT_URL);
        await app.upload(SAMPLE_FILE);
        await app.run("BEGIN; INSERT INTO fruit (id, name, price) VALUES (900, 'kiwi', 1.5);");
        const before = await snapshot(page, app);
        const held = await holdImport(page, app, { into: "open" });
        await page.keyboard.press("Escape");
        await expect(app.importDialog).toBeHidden();
        held.open();
        await expectNothingLeft(page, app, before, { logKeys: ["file:sample.db"] });
        expect(await app.rows("SELECT name FROM fruit WHERE id = 900")).toEqual([["kiwi"]]);
        await app.run("ROLLBACK;");
        expect(await app.rows("SELECT count(*) FROM fruit WHERE id = 900")).toEqual([[0]]);
    });
});

// ---- 6a. the dialog's keys while an import runs ---------------------------------------------------------

// Once the import runs, the focus is on Cancel. A key that is held down repeats, so Enter held on
// Import would go on to press Cancel; and the browser tells the dialog of Escape (the "cancel"
// event) before it closes it and tells of the closing (the "close" event) in a task of its own, so
// a step of the import that was waiting for its turn can run in between.

// holdLastTurn: the import's last turn (the one it takes after the copy into the typed table, the
// table `table` of the open database) is held until the page lets it go with __hold.release().
// The page's clock is stood still from `arm()` until then, so that the pace always takes a turn
// and never waits for a frame (which it does when 150 ms have passed since it last drew). Where
// the browser has scheduler.yield the turn is that; where not it is the message the page sends
// itself.
async function holdLastTurn(page, table) {
    await page.evaluate((name) => {
        const hold = { armed: false, held: false, frozen: null, release: null };
        window.__hold = hold;
        const clock = performance.now.bind(performance);
        performance.now = () => hold.frozen ?? clock();
        const copied = () => window.app.database.db.selectValue("SELECT count(*) FROM sqlite_schema WHERE name = ?", [name]) === 1;
        const wait = (go) => {
            hold.held = true;
            hold.release = () => {
                hold.release = null;
                hold.armed = false;
                hold.frozen = null;
                go();
            };
        };
        hold.arm = () => {
            hold.frozen = clock();
            hold.armed = true;
        };
        if (typeof globalThis.scheduler?.yield === "function") {
            globalThis.scheduler.yield = () =>
                new Promise((resolve) => {
                    if (hold.armed && copied()) {
                        wait(resolve);
                    } else {
                        setTimeout(resolve, 0);
                    }
                });
        } else {
            const post = MessagePort.prototype.postMessage;
            MessagePort.prototype.postMessage = function (...args) {
                if (hold.armed && copied()) {
                    wait(() => post.apply(this, args));
                } else {
                    post.apply(this, args);
                }
            };
        }
    }, table);
}

test.describe("keys in the dialog while an import runs", () => {
    // the import is held where it waits for the reader, with the key's own press on Import
    async function pressImportWithEnter(page, app) {
        const held = await holdVendor(page, "papaparse.min.js", { pass: 1 });
        await app.chooseFiles(csv());
        await expect(app.importDialog).toBeVisible();
        await expect(app.importDialog.locator(".import-reading")).toHaveCount(0);
        await expect(app.importSubmit).toBeEnabled();
        await page.evaluate(() => {
            delete window.Papa;
        });
        await app.importSubmit.focus();
        await page.keyboard.down("Enter");
        await expect(app.importDialog.locator(".import-progress")).toBeVisible();
        await expect(app.importCancel).toBeFocused();
        return held;
    }

    test("Enter held on Import starts the import and does not press Cancel: the import ends with its table, and no toast but its own", async ({ page, app }) => {
        await app.open(NORTHLIGHT_IMPORT_URL);
        await app.recordToasts();
        const held = await pressImportWithEnter(page, app);
        // the key goes on repeating (the second press while the key is down is an auto-repeat)
        await page.keyboard.down("Enter");
        await page.keyboard.down("Enter");
        await page.keyboard.up("Enter");
        await expect(app.importDialog.locator(".import-progress")).toBeVisible();
        await expect(app.importCancel).toBeFocused();
        await finishHeld(app, held);
        await expect(app.databaseLabel).toHaveText("people");
        expect(await app.rows("SELECT count(*) FROM people")).toEqual([[2]]);
        await app.expectToasts([words.importedMessage(1, "people")]);
    });

    // The key is still down when the dialog has gone, and it goes on repeating: each repeat goes to
    // whatever has the keyboard focus then, and must do nothing (js/lab/held-enter.js). Where the
    // focus is does not matter to the test: the editor's text, the open database, the menus and
    // the toasts are read.
    const repeatEnter = async (page, times = 3) => {
        for (let n = 0; n < times; n++) {
            await page.keyboard.down("Enter");
        }
        // (the page is given its frames: what a repeated key would do is done by then)
        await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    };

    test("Enter held on Import: once the import has ended and the dialog has closed, the repeats type nothing into the editor and press nothing, and when the key is let go Enter makes a line again", async ({ page, app }) => {
        await app.open(NORTHLIGHT_IMPORT_URL);
        await app.recordToasts();
        const held = await pressImportWithEnter(page, app);
        await finishHeld(app, held);
        await expect(app.databaseLabel).toHaveText("people");
        await app.expectToasts([words.importedMessage(1, "people")]);
        // the key is down still: what it would do wherever the focus is (the editor takes a line,
        // a button is pressed)
        const text = await editorValue(page);
        const handle = await databaseHandle(page);
        await repeatEnter(page);
        expect(await editorValue(page)).toBe(text);
        await expect(page.locator(":popover-open")).toHaveCount(0);
        await expect(page.locator("dialog[open]")).toHaveCount(0);
        expect(await isOpenDatabase(page, handle)).toBe(true);
        expect(await app.toasts()).toEqual([words.importedMessage(1, "people")]);
        // the key is let go, and Enter in the editor is a line as ever
        await page.keyboard.up("Enter");
        await app.editor.click();
        await page.keyboard.press("Control+End");
        await page.keyboard.press("Enter");
        expect(await editorValue(page)).toBe(`${text}\n`);
    });

    test("Enter held on Cancel: the dialog closes, and what gets the focus back (a button that opens a menu) is not pressed by the repeats", async ({ page, app }) => {
        await app.open(NORTHLIGHT_IMPORT_URL);
        await app.recordToasts();
        const handle = await databaseHandle(page);
        // the focus goes back to where it was before the dialog opened: a button that opens a menu
        await app.databaseButton.focus();
        await app.chooseFiles(csv());
        await expect(app.importDialog).toBeVisible();
        await expect(app.importDialog.locator(".import-reading")).toHaveCount(0);
        await app.importCancel.focus();
        await page.keyboard.down("Enter");
        await expect(app.importDialog).toBeHidden();
        await expect(app.databaseButton).toBeFocused();
        const text = await editorValue(page);
        await repeatEnter(page);
        await expect(page.locator(":popover-open")).toHaveCount(0);
        await expect(page.locator("dialog[open]")).toHaveCount(0);
        expect(await editorValue(page)).toBe(text);
        expect(await isOpenDatabase(page, handle)).toBe(true);
        expect(await app.toasts()).toEqual([]);
        expect(await eventKeys(page)).toEqual([]);
        await page.keyboard.up("Enter");
    });

    test("a single press of Enter on Cancel still cancels the import", async ({ page, app }) => {
        await app.open(NORTHLIGHT_IMPORT_URL);
        const before = await snapshot(page, app);
        const held = await pressImportWithEnter(page, app);
        await page.keyboard.up("Enter");
        await page.keyboard.press("Enter");
        await expect(app.importDialog).toBeHidden();
        held.open();
        await expectNothingLeft(page, app, before, { logKeys: ["northlight", "file:people"] });
    });

    test("Escape stops the import at once: a step that was waiting for its turn finds it cancelled, and the import is undone", async ({ page, app }) => {
        await app.open(NORTHLIGHT_IMPORT_URL);
        await app.upload(SAMPLE_FILE);
        await expect(app.toast).toContainText("sample.db");
        await app.recordToasts();
        // (the snapshot holds the bytes of the database too: no transaction of the student's is
        // open, so the import's savepoint is a transaction of its own, and undoing it must leave
        // the file as it was to the byte, the change counter of its header included)
        const countsBefore = await app.rows("SELECT (SELECT count(*) FROM fruit), (SELECT count(*) FROM tags)");
        const before = await snapshot(page, app);
        await holdLastTurn(page, "people");
        await app.chooseFiles(csv());
        await expect(app.importDialog).toBeVisible();
        await expect(app.importDialog.locator(".import-reading")).toHaveCount(0);
        await app.importDialog.locator("#import-into-open").check();
        // A listener of the test's own, added after the dialog's, so that it runs after it: when the
        // dialog is told of Escape it lets the waiting step go. That step then runs before the
        // browser's "close" event, which is the moment this test is about.
        await page.evaluate(() => {
            document.getElementById("import-dialog").addEventListener("cancel", () => window.__hold.release?.());
            window.__hold.arm();
        });
        await expect(app.importSubmit).toBeEnabled();
        await app.importSubmit.click();
        await page.waitForFunction(() => window.__hold.held);
        // (the table is made and the import waits for its last turn)
        expect(await app.rows("SELECT count(*) FROM people")).toEqual([[2]]);
        await page.keyboard.press("Escape");
        await expect(app.importDialog).toBeHidden();
        // the import was cancelled and undone: no table, no event, no toast, no report, and not a
        // byte of the open database changed (with the step let through, it would have ended: the
        // table made, the event kept, "Imported 1 table" said)
        await expectNothingLeft(page, app, before, { logKeys: ["file:sample.db"] });
        await app.expectToasts([]);
        expect(await app.rows("SELECT count(*) FROM sqlite_schema WHERE name = 'people'")).toEqual([[0]]);
        expect(await app.rows("SELECT (SELECT count(*) FROM fruit), (SELECT count(*) FROM tags)")).toEqual(countsBefore);
    });

    // The moment between the dialog going and the browser's "close" event, which comes a little
    // later (1 to 15 ms): the kit's watchClosing hands a key to the page in it (a press of Enter
    // that is not a repeat, to the window; or a repeat of Enter, to the element that has the focus)
    // and closingSeen says what it found there. repeatTaken, of the kit too, says whether the page
    // is taking repeats of Enter away.
    const IMPORT_DIALOG = "#import-dialog";

    async function chooseWithEditorFocused(page, app) {
        await app.open(NORTHLIGHT_IMPORT_URL);
        await app.recordToasts();
        await app.editor.click();
        await app.chooseFiles(csv());
        await expect(app.importDialog).toBeVisible();
        await expect(app.importDialog.locator(".import-reading")).toHaveCount(0);
    }

    test("Escape: a repeat of Enter that comes after the dialog has gone and before its close event types nothing into the editor", async ({ page, app }) => {
        await chooseWithEditorFocused(page, app);
        const text = await editorValue(page);
        await watchClosing(page, IMPORT_DIALOG);
        await page.keyboard.press("Escape");
        await expect(app.importDialog).toBeHidden();
        await expect.poll(async () => (await closingSeen(page)).closeSeen).toBe(true);
        const seen = await closingSeen(page);
        // (the moment was the one meant: before the event, and with the focus back in the editor)
        expect(seen.at).toBe(true);
        expect(seen.beforeClose).toBe(true);
        expect(seen.focus).toBe("editor");
        // ("taken" only shows that someone took the key, the page or the editor: the editor takes a
        // repeat of Enter for its own key, so it is true with or without the page's guard. What
        // tells the two apart is the editor's text, unchanged)
        expect(seen.taken).toBe(true);
        expect(await editorValue(page)).toBe(text);
    });

    for (const way of ["Escape", "Cancel"]) {
        test(`${way}: a press of Enter that is not a repeat, in that same moment, is not followed by a new guard once the close event has come`, async ({ page, app }) => {
            await chooseWithEditorFocused(page, app);
            await watchClosing(page, IMPORT_DIALOG, { freshPress: true });
            if (way === "Escape") {
                await page.keyboard.press("Escape");
            } else {
                await app.importCancel.click();
            }
            await expect(app.importDialog).toBeHidden();
            await expect.poll(async () => (await closingSeen(page)).closeSeen).toBe(true);
            const seen = await closingSeen(page);
            expect(seen.at).toBe(true);
            expect(seen.beforeClose).toBe(true);
            // the key that was pressed in the gap is down still, and its repeats are not taken away
            expect(await repeatTaken(page)).toBe(false);
        });
    }

    test("Escape a second time in one visit: a repeat of Enter between the dialog going and its close event types nothing into the editor", async ({ page, app }) => {
        await chooseWithEditorFocused(page, app);
        const text = await editorValue(page);
        await page.keyboard.press("Escape");
        await expect(app.importDialog).toBeHidden();
        // a press of Enter that is not a repeat: the first closing's guard of held keys is over
        await page.evaluate(() => window.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", cancelable: true })));
        // the same files chosen again, in the same visit
        await app.chooseFiles(csv());
        await expect(app.importDialog).toBeVisible();
        await expect(app.importDialog.locator(".import-reading")).toHaveCount(0);
        await watchClosing(page, IMPORT_DIALOG);
        await page.keyboard.press("Escape");
        await expect(app.importDialog).toBeHidden();
        await expect.poll(async () => (await closingSeen(page)).closeSeen).toBe(true);
        const seen = await closingSeen(page);
        expect(seen.at).toBe(true);
        expect(seen.beforeClose).toBe(true);
        expect(seen.focus).toBe("editor");
        // (the editor takes a repeat of Enter for its own key, so "taken" is true either way: what
        // shows that the page took it away first is the text, unchanged)
        expect(await editorValue(page), "the repeat typed an empty line into the editor").toBe(text);
    });

    test("an import that ends by itself: a repeat of Enter between the dialog going and its close event types nothing into the editor", async ({ page, app }) => {
        await chooseWithEditorFocused(page, app);
        const text = await editorValue(page);
        await expect(app.importSubmit).toBeEnabled();
        await watchClosing(page, IMPORT_DIALOG);
        await app.importSubmit.click();
        await expect(app.importDialog).toBeHidden();
        await expect.poll(async () => (await closingSeen(page)).closeSeen).toBe(true);
        const seen = await closingSeen(page);
        expect(seen.at).toBe(true);
        expect(seen.beforeClose).toBe(true);
        expect(seen.focus).toBe("editor");
        expect(await editorValue(page), "the repeat typed an empty line into the editor").toBe(text);
    });

    test("a dialog that is closed from script, with no Escape and no button, is still cleared: repeats are taken away, and files chosen again show only their own tabs", async ({ page, app }) => {
        await chooseWithEditorFocused(page, app);
        expect(await app.importTabs.count()).toBe(1);
        expect(await repeatTaken(page)).toBe(false);
        await page.evaluate(() => document.querySelector("#import-dialog").close());
        await expect(app.importDialog).toBeHidden();
        await expect.poll(() => repeatTaken(page), { message: "repeats of Enter are taken away once the dialog has closed" }).toBe(true);
        await expect(app.importTabs, "the tabs of the closed dialog are gone").toHaveCount(0);
        // the same dialog, opened again for two other files, shows those and no others
        await page.evaluate(() => window.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", cancelable: true })));
        await app.chooseFiles([csv("one.csv"), csv("two.csv")]);
        await expect(app.importDialog).toBeVisible();
        await expect(app.importDialog.locator(".import-reading")).toHaveCount(0);
        await expect(app.importTabs).toHaveCount(2);
        await expect(app.importTabs.nth(0)).toContainText("one.csv");
        await expect(app.importTabs.nth(1)).toContainText("two.csv");
    });

    test("a cancel event that comes up from inside the dialog is not Escape: nothing ends, and Import still imports", async ({ page, app }) => {
        await app.open(NORTHLIGHT_IMPORT_URL);
        await app.chooseFiles(csv());
        await expect(app.importDialog).toBeVisible();
        await expect(app.importDialog.locator(".import-reading")).toHaveCount(0);
        const tabs = await app.importTabs.count();
        expect(tabs).toBeGreaterThan(0);
        await app.importTabs.first().evaluate((tab) => tab.dispatchEvent(new Event("cancel", { bubbles: true })));
        // (the session has not ended: no guard of a held Enter, the tabs and the preview are there)
        expect(await repeatTaken(page)).toBe(false);
        await expect(app.importDialog).toBeVisible();
        await expect(app.importTabs).toHaveCount(tabs);
        await expect(app.importPanel.locator(".import-preview-table")).toBeVisible();
        await app.importSubmit.click();
        await expect(app.importDialog).toBeHidden();
        await expect(app.databaseLabel).toHaveText("people");
        expect(await app.rows("SELECT count(*) FROM people")).toEqual([[2]]);
    });

    test("Enter held on a tab of the idle dialog, then Escape: the repeats type nothing into the editor and open nothing, and when the key is let go Enter makes a line again", async ({ page, app }) => {
        await chooseWithEditorFocused(page, app);
        const text = await editorValue(page);
        const handle = await databaseHandle(page);
        await app.importTabs.first().focus();
        await page.keyboard.down("Enter");
        // the dialog takes the repeats of the key itself, and stays open under them
        await page.keyboard.down("Enter");
        await expect(app.importDialog).toBeVisible();
        await page.keyboard.press("Escape");
        await expect(app.importDialog).toBeHidden();
        await repeatEnter(page);
        expect(await editorValue(page)).toBe(text);
        await expect(page.locator(":popover-open")).toHaveCount(0);
        await expect(page.locator("dialog[open]")).toHaveCount(0);
        expect(await isOpenDatabase(page, handle)).toBe(true);
        expect(await app.toasts()).toEqual([]);
        await page.keyboard.up("Enter");
        await app.editor.click();
        await page.keyboard.press("Control+End");
        await page.keyboard.press("Enter");
        expect(await editorValue(page)).toBe(`${text}\n`);
    });
});

// ---- 6b. the copy into the typed table: its progress, and Cancel in the middle of it ----------------------

// The staging table is copied into the typed table COPY_CELLS cells at a time, by rowid (plan,
// section 3, "Libraries": "with the same pause for progress and Cancel as the read. A single
// INSERT ... SELECT allows neither."). A file of 20 columns and 40,000 rows is 800,000 cells: the
// copy needs ceil(40,000 / floor(COPY_CELLS / 20)) steps, 6 of them with COPY_CELLS at 150,000 (7,500 rows
// each, the last of 2,500). The numbers are small (every value is one to four digits), so the file
// is read in a moment and slowDown() is not needed: slowCopy() lets the turns of the READING go
// by at once and holds each turn of the COPY for half a second, so that a test can act between two steps.
const STEP_COLUMNS = 20;
const STEP_ROWS = 40_000;
const stepsCsv = () => {
    const names = ["id", ...Array.from({ length: STEP_COLUMNS - 1 }, (unused, k) => `c${k + 1}`)];
    const lines = [names.join(",")];
    for (let i = 1; i <= STEP_ROWS; i++) {
        lines.push([i, ...Array.from({ length: STEP_COLUMNS - 1 }, (unused, k) => (i * (k + 2)) % 1000)].join(","));
    }
    return csv("steps.csv", `${lines.join("\n")}\n`);
};
// the first and the last row of the table the file makes, as the engine gives them
const stepsRow = (i) => [i, ...Array.from({ length: STEP_COLUMNS - 1 }, (unused, k) => (i * (k + 2)) % 1000)];
const stepsOf = () => Math.ceil(STEP_ROWS / Math.floor(words.COPY_CELLS / STEP_COLUMNS));

// every turn the import gives the page lasts `ms` while the line under the title says what the copy
// says, and no time at all before that (scheduler.yield where the browser has it, the port's
// postMessage where it has not: as slowDown does)
const slowCopy = (page, ms) =>
    page.evaluate(
        ({ copying, ms }) => {
            const delay = () => (document.querySelector("#import-dialog .import-progress .results-loading-size")?.textContent === copying ? ms : 0);
            if (globalThis.scheduler && typeof globalThis.scheduler.yield === "function") {
                globalThis.scheduler.yield = () => new Promise((resolve) => setTimeout(resolve, delay()));
            } else {
                const post = MessagePort.prototype.postMessage;
                MessagePort.prototype.postMessage = function (...args) {
                    setTimeout(() => post.apply(this, args), delay());
                };
            }
        },
        { copying: words.IMPORT_PROGRESS_COPYING, ms }
    );

// notes every state of the progress (the line under the title, the bar's value) as it is drawn,
// in window.__progress, from now on
const recordProgress = (page) =>
    page.evaluate(() => {
        const box = document.querySelector("#import-dialog .import-progress");
        const line = box.querySelector(".results-loading-size");
        const bar = box.querySelector("progress");
        window.__progress = [];
        new MutationObserver(() => window.__progress.push({ line: line.textContent, value: bar.value })).observe(box, {
            attributes: true,
            childList: true,
            characterData: true,
            subtree: true,
        });
    });

// chooses steps.csv, waits until it has been looked at, and (with `into`) picks the destination
async function openStepsDialog(app, { into = "new" } = {}) {
    await app.chooseFiles(stepsCsv());
    await expect(app.importDialog).toBeVisible();
    await expect(app.importDialog.locator(".import-reading")).toHaveCount(0);
    if (into === "open") {
        await app.importDialog.locator("#import-into-open").check();
    }
    await expect(app.importSubmit).toBeEnabled();
}

// waits until the copy is under way: the line says the copying and the bar is between 0 and 1.
// Answers with the number of rows the typed table holds in the open database, when `table` is
// named (the copy is on the page's thread: nothing runs while this is read).
async function waitForCopyUnderWay(page, { table = null } = {}) {
    const handle = await page.waitForFunction(
        ({ copying, table }) => {
            const box = document.querySelector("#import-dialog .import-progress");
            const bar = box?.querySelector("progress");
            if (!bar || box.querySelector(".results-loading-size").textContent !== copying || !(bar.value > 0 && bar.value < 1)) {
                return false;
            }
            if (table === null) {
                return { rows: null };
            }
            const db = window.app.database.db;
            const made = db.selectValue("select count(*) from main.sqlite_schema where type = 'table' and name = ?", [table]);
            return { rows: made ? db.selectValue(`select count(*) from main."${table}"`) : -1 };
        },
        { copying: words.IMPORT_PROGRESS_COPYING, table },
        { timeout: 30_000 }
    );
    return (await handle.jsonValue()).rows;
}

test.describe("the copy into the typed table runs in steps, and shows its progress", () => {
    test("the line says the copying after it said the reading, the bar moves from step to step, and the table holds every row", async ({ page, app }) => {
        test.slow();
        await app.open(NORTHLIGHT_IMPORT_URL);
        await slowCopy(page, 400);
        await openStepsDialog(app);
        await recordProgress(page);
        await app.importSubmit.click();
        await expect(app.importDialog).toBeHidden({ timeout: 60_000 });
        await expect(app.pane).toHaveAttribute("data-state", "report");
        const seen = await page.evaluate(() => window.__progress);
        const lines = seen.map((state) => state.line);
        // the reading came first, and the copying after it, and never the reading again
        const firstCopy = lines.indexOf(words.IMPORT_PROGRESS_COPYING);
        expect(lines.indexOf(words.IMPORT_PROGRESS_READING)).toBeGreaterThanOrEqual(0);
        expect(firstCopy).toBeGreaterThan(lines.indexOf(words.IMPORT_PROGRESS_READING));
        expect(lines.slice(firstCopy).every((line) => line === words.IMPORT_PROGRESS_COPYING)).toBe(true);
        // the bar, while it says the copying: one value for each step, each greater than the one before,
        // all between 0 and 1 but the last, which is 1
        const values = [...new Set(seen.filter((state) => state.line === words.IMPORT_PROGRESS_COPYING).map((state) => state.value))];
        expect(values).toHaveLength(stepsOf());
        expect(stepsOf()).toBeGreaterThanOrEqual(3);
        expect(values).toEqual([...values].sort((a, b) => a - b));
        expect(values[0]).toBeGreaterThan(0);
        expect(values[1]).toBeGreaterThan(values[0]);
        expect(values.slice(0, -1).every((value) => value > 0 && value < 1)).toBe(true);
        expect(values.at(-1)).toBe(1);
        // the table holds every row
        expect(await app.rows("SELECT count(*) FROM steps")).toEqual([[STEP_ROWS]]);
        expect(await app.rows("SELECT * FROM steps ORDER BY id LIMIT 1")).toEqual([stepsRow(1)]);
        expect(await app.rows("SELECT * FROM steps ORDER BY id DESC LIMIT 1")).toEqual([stepsRow(STEP_ROWS)]);
        expect(await app.rows("SELECT name FROM sqlite_temp_schema")).toEqual([]);
    });

    test("Cancel in the middle of the copy into a new database: the dialog closes and nothing is left", async ({ page, app }) => {
        test.slow();
        await app.open(NORTHLIGHT_IMPORT_URL);
        await app.trackConnections();
        await slowCopy(page, 500);
        const before = await snapshot(page, app);
        await openStepsDialog(app);
        await app.importSubmit.click();
        await waitForCopyUnderWay(page);
        await app.importCancel.click();
        await expect(app.importDialog).toBeHidden();
        await expectNothingLeft(page, app, before, { logKeys: ["northlight", "file:steps"] });
        await expectConnectionsClosed(app);
        // the new database was begun, and closed again
        expect((await app.connections()).map((connection) => connection.name)).toEqual(["steps"]);
    });

    test("Cancel in the middle of the copy into the open database: its tables are as they were, the typed table is gone, the student's transaction is open", async ({ page, app }) => {
        test.slow();
        await app.open(NORTHLIGHT_IMPORT_URL);
        await app.upload(SAMPLE_FILE);
        await app.trackConnections();
        // a transaction of the student's, left open
        await app.run("BEGIN; INSERT INTO fruit (id, name, price) VALUES (900, 'kiwi', 1.5);");
        const countsBefore = await app.rows("SELECT (SELECT count(*) FROM fruit), (SELECT count(*) FROM tags)");
        await slowCopy(page, 500);
        const before = await snapshot(page, app);
        await openStepsDialog(app, { into: "open" });
        await app.importSubmit.click();
        // the typed table has been begun in the open database and holds some of the rows, not all
        const rowsMade = await waitForCopyUnderWay(page, { table: "steps" });
        expect(rowsMade).toBeGreaterThan(0);
        expect(rowsMade).toBeLessThan(STEP_ROWS);
        await app.importCancel.click();
        await expect(app.importDialog).toBeHidden();
        await expectNothingLeft(page, app, before, { logKeys: ["file:sample.db"] });
        expect(await app.rows("SELECT count(*) FROM sqlite_schema WHERE name = 'steps'")).toEqual([[0]]);
        expect(await app.rows("SELECT (SELECT count(*) FROM fruit), (SELECT count(*) FROM tags)")).toEqual(countsBefore);
        // the student's transaction is still open, with its row; no other connection was made
        expect(await page.evaluate(() => window.app.database.capi.sqlite3_get_autocommit(window.app.database.db.pointer))).toBe(0);
        expect(await app.rows("SELECT name FROM fruit WHERE id = 900")).toEqual([["kiwi"]]);
        expect(await app.connections()).toEqual([]);
        await app.run("ROLLBACK;");
        expect(await app.rows("SELECT count(*) FROM fruit WHERE id = 900")).toEqual([[0]]);
    });

    test("Escape in the middle of the copy does what Cancel does", async ({ page, app }) => {
        test.slow();
        await app.open(NORTHLIGHT_IMPORT_URL);
        await app.trackConnections();
        await slowCopy(page, 500);
        const before = await snapshot(page, app);
        await openStepsDialog(app);
        await app.importSubmit.click();
        await waitForCopyUnderWay(page);
        await page.keyboard.press("Escape");
        await expect(app.importDialog).toBeHidden();
        await expectNothingLeft(page, app, before, { logKeys: ["northlight", "file:steps"] });
        await expectConnectionsClosed(app);
    });
});

// ---- 6c. a browser without scheduler.yield -------------------------------------------------------------

// js/lab/import-pace.js gives the page its turn with scheduler.yield and, where a browser has
// none (Safari, which was never run here), with a message on a channel of its own. Chromium and
// Firefox both have scheduler.yield, so no other test goes that second way: these take it away
// before the page loads. (Five changes that break the second way passed every other test.)
test.describe("in a browser without scheduler.yield the import takes its turns another way", () => {
    test.beforeEach(async ({ page }) => {
        await page.addInitScript(() => {
            Object.defineProperty(globalThis, "scheduler", { value: undefined, configurable: true });
        });
    });

    test("an import still ends, with every row of its file", async ({ page, app }) => {
        await app.open(NORTHLIGHT_IMPORT_URL);
        expect(await page.evaluate(() => typeof globalThis.scheduler)).toBe("undefined");
        await app.importFiles(bigCsv("turns.csv", 4000));
        expect(await app.rows("SELECT count(*), min(id), max(id) FROM turns")).toEqual([[4000, 0, 3999]]);
    });

    test("Cancel in the middle of a file of 200,000 rows undoes it, and the progress bar had moved", async ({ page, app }) => {
        test.slow();
        await app.open(NORTHLIGHT_IMPORT_URL);
        expect(await page.evaluate(() => typeof globalThis.scheduler)).toBe("undefined");
        await app.trackConnections();
        await slowDown(page);
        const before = await snapshot(page, app);
        await app.chooseFiles(largeCsv());
        await expect(app.importDialog).toBeVisible();
        await expect(app.importDialog.locator(".import-reading")).toHaveCount(0);
        await startAndWaitForProgress(page, app);
        await app.importCancel.click();
        await expect(app.importDialog).toBeHidden();
        await expectNothingLeft(page, app, before, { logKeys: ["northlight", "file:large"] });
        await expectConnectionsClosed(app);
    });
});

// ---- 7. after a successful import --------------------------------------------------------------------

test.describe("after an import into a new database", () => {
    test("the address is the plain page, the title and the switcher name the database, and a toast says so", async ({ page, app, baseURL }) => {
        await app.open(NORTHLIGHT_IMPORT_URL);
        await app.recordToasts();
        await app.importFiles(csv("people.csv"));
        expect(page.url()).toBe(new URL("./", baseURL).href);
        expect(await page.evaluate(() => [location.search, location.hash])).toEqual(["", ""]);
        await expect(page).toHaveTitle(/^people - /);
        await expect(app.databaseLabel).toHaveText("people");
        const said = words.importedMessage(1, "people");
        expect(said).toBe("Imported 1 table into people");
        await expect(app.summary).toContainText(said);
        await expect(app.toast).toContainText(said);
        await expect(app.pane).toHaveAttribute("data-state", "report");
        await expect(app.pane.locator(".import-report")).toBeVisible();
        await expect(app.pane.locator(".import-report")).toContainText("people");
        // the set picker and the course list no longer tick a course database
        await app.databaseButton.click();
        await expect(app.databaseMenu.locator('[role="menuitemradio"][aria-checked="true"]')).toHaveCount(0);
    });

    test("the status bar names the new database and has no query to report, as after any database that opens", async ({ page, app }) => {
        await app.open(NORTHLIGHT_IMPORT_URL);
        await app.run("SELECT 1 AS one;");
        await expect(page.locator("#status-run")).toHaveText(/^1 row in \d+ ms$/);
        await expect(page.locator("#status-database")).toHaveText("Northlight Retail");
        await app.importFiles(csv("people.csv"));
        await expect(page.locator("#status-database")).toHaveText("people");
        await expect(page.locator("#status-database")).toHaveAttribute("title", "people");
        await expect(page.locator("#status-run")).toHaveText(words.STATUS_NO_RUN);
    });

    test("the name that was typed for the new database is the one the page shows", async ({ page, app }) => {
        await app.open(NORTHLIGHT_IMPORT_URL);
        await app.importFiles(csv("people.csv"), { database: "class list" });
        await expect(app.databaseLabel).toHaveText("class list");
        await expect(page).toHaveTitle(/^class list - /);
        await expect(app.summary).toContainText(words.importedMessage(1, "class list"));
        expect(await page.evaluate(() => window.app.database.name)).toBe("class list");
        const { found } = await eventsOf(page, ["file:class list"]);
        expect(found["file:class list"]).toHaveLength(1);
    });

    test("the editor can be used at once, and a Run replaces the report with its result", async ({ page, app }) => {
        await app.open(NORTHLIGHT_IMPORT_URL);
        await app.importFiles(csv("people.csv"));
        expect(await app.query("SELECT name FROM people ORDER BY id")).toEqual({ columns: ["name"], rows: [["Ann"], ["Bob"]] });
        await expect(app.pane).toHaveAttribute("data-state", "result");
        await expect(app.pane.locator(".import-report")).toHaveCount(0);
        await expect(app.status).not.toContainText("Imported");
    });

    test("the History tab lists the query and not the import", async ({ page, app }) => {
        await app.open(NORTHLIGHT_IMPORT_URL);
        await app.importFiles(csv("people.csv"));
        await app.openHistory();
        await expect(app.historyEntries).toHaveCount(0);
        await app.run("SELECT count(*) FROM people");
        await app.openHistory();
        await expect(app.historyEntries).toHaveCount(1);
        await expect(app.historyEntries.first()).toContainText("SELECT count(*) FROM people");
        expect(await app.readLog("file:people")).toHaveLength(1);
    });

    test("one event for the file is recorded under the log key of the new database", async ({ page, app }) => {
        await app.open(NORTHLIGHT_IMPORT_URL);
        const file = csv("people.csv");
        await app.importFiles(file);
        const { found } = await eventsOf(page, ["northlight", "file:people"]);
        expect(found["northlight"]).toEqual([]);
        expect(found["file:people"]).toHaveLength(1);
        expect(found["file:people"][0]).toMatchObject({
            kind: "import",
            lines: [words.importEventFileLine("people.csv", file.buffer.length), words.importEventTableLine("people", 2, 2)],
        });
    });
});

test.describe("after an import into the open database", () => {
    test("the page announces lab:database-changed, not a run: the tables list and the History tab follow", async ({ page, app }) => {
        await app.open(NORTHLIGHT_IMPORT_URL);
        await app.upload(SAMPLE_FILE);
        await page.evaluate(() => {
            window.__heard = [];
            for (const type of ["lab:database-changed", "lab:run-finished", "lab:database-loaded"]) {
                document.addEventListener(type, (event) => window.__heard.push({ type, name: event.detail?.database?.name }));
            }
        });
        const handle = await databaseHandle(page);
        await app.importFiles(csv("people.csv"), { into: "open" });
        expect(await isOpenDatabase(page, handle)).toBe(true);
        expect(await page.evaluate(() => window.__heard)).toEqual([{ type: "lab:database-changed", name: "sample.db" }]);
        await expect(app.databaseLabel).toHaveText("sample.db");
        expect(await names(app)).toEqual(expect.arrayContaining(["fruit", "people", "tags"]));
        await expect(app.summary).toContainText(words.importedMessage(1, "sample.db"));
        await app.openTab("schema");
        await expect(app.schemaInsert("people")).toBeVisible();
        await app.openHistory();
        await expect(app.historyEntries).toHaveCount(0);
        const { found } = await eventsOf(page, ["file:sample.db"]);
        expect(found["file:sample.db"]).toHaveLength(1);
    });

    // what the editor offers (js/lab/editor-schema.js hears lab:database-changed and hands the new
    // names to the editor): the labels of its completion list, and the detail of one of them
    const offered = (page) => page.locator(".cm-tooltip-autocomplete li .cm-completionLabel").allTextContents();
    const offer = (page, label) =>
        page.getByRole("option").filter({ has: page.locator(".cm-completionLabel", { hasText: new RegExp(`^${label}$`) }) });
    async function typeAndAsk(page, app, sql) {
        await app.editor.fill("");
        await app.editor.focus();
        await page.keyboard.type(sql);
        await page.keyboard.press("Control+Space");
        await expect(page.getByRole("listbox")).toBeVisible();
    }

    test("the editor offers the new table and its columns, which it did not before", async ({ page, app }) => {
        await app.open(NORTHLIGHT_IMPORT_URL);
        await app.upload(SAMPLE_FILE);
        await expect(page.locator("#editor")).toHaveAttribute("data-editor", "code");
        await typeAndAsk(page, app, "SELECT * FROM ");
        expect(await offered(page)).toEqual(expect.arrayContaining(["fruit", "tags"]));
        expect(await offered(page)).not.toContain("people");
        await page.keyboard.press("Escape");
        await app.editor.fill("");
        await app.importFiles(csv("people.csv"), { into: "open" });
        await typeAndAsk(page, app, "SELECT * FROM ");
        expect(await offered(page)).toEqual(expect.arrayContaining(["fruit", "tags", "people"]));
        await expect(offer(page, "people").locator(".cm-completionDetail")).toHaveText("table");
        await page.keyboard.press("Escape");
        // its columns, with their types, after the table's name and a dot
        await typeAndAsk(page, app, "SELECT * FROM people p WHERE p.");
        await expect(offer(page, "id").locator(".cm-completionDetail")).toHaveText("INTEGER");
        await expect(offer(page, "name").locator(".cm-completionDetail")).toHaveText("TEXT");
        expect(await offered(page)).not.toContain("price");
    });

    test("the Schema tab lists the new table while it is on show, without being opened again", async ({ page, app }) => {
        await app.open(NORTHLIGHT_IMPORT_URL);
        await app.upload(SAMPLE_FILE);
        await app.openTab("schema");
        await expect(app.schemaInsert("fruit")).toBeVisible();
        await expect(app.schemaInsert("people")).toHaveCount(0);
        await app.importFiles(csv("people.csv"), { into: "open" });
        await expect(app.schemaInsert("people")).toBeVisible();
        await expect(app.schemaInsert("fruit")).toBeVisible();
    });

    // The status bar has nothing to catch up with after an import into the open database: it names
    // the database that is open, and its other line is the last query's, which an import is not. It
    // listens to lab:database-loaded and lab:run-finished only. (Plan, section 7.)
    test("the status bar names the same database and keeps the last query's line", async ({ page, app }) => {
        await app.open(NORTHLIGHT_IMPORT_URL);
        await app.upload(SAMPLE_FILE);
        await expect(page.locator("#status-run")).toHaveText(words.STATUS_NO_RUN);
        await app.run("SELECT * FROM fruit LIMIT 10;");
        await expect(page.locator("#status-run")).toHaveText(/^4 rows in \d+ ms$/);
        const line = await page.locator("#status-run").textContent();
        await app.importFiles(csv("people.csv"), { into: "open" });
        await expect(page.locator("#status-database")).toHaveText("sample.db");
        await expect(page.locator("#status-run")).toHaveText(line);
    });

    test("a course database is never offered as the destination", async ({ page, app }) => {
        await app.open(NORTHLIGHT_IMPORT_URL);
        await app.chooseFiles(csv("people.csv"));
        await expect(app.importDialog).toBeVisible();
        await expect(app.importDialog.locator("#import-into-new")).toBeChecked();
        await expect(app.importDialog.locator("#import-into-open")).toBeDisabled();
        await expect(app.importDialog).toContainText(words.IMPORT_COURSE_DATABASE_NOTE);
    });
});

// ---- 7b. a database with a page limit, TEMP names, a long name in the report ---------------------------

// The engine undoes a whole transaction, the student's own included, for some failures. A database
// that was given a page limit (PRAGMA max_page_count) and is full is one: the import is refused by
// the engine (SQLITE_FULL), and the dialog says what happened to the transaction that was open.
// limitPages gives the open database room for `spare` more pages.
async function limitPages(app, spare = 3) {
    const [[count]] = await app.rows("PRAGMA page_count");
    await app.rows(`PRAGMA max_page_count = ${count + spare}`);
}


test.describe("an import that fills a database with a page limit fails, and says what became of the student's transaction", () => {
    async function openFullSample(page, app) {
        await app.open(IMPORT_URL);
        await app.upload(SAMPLE_FILE);
        await limitPages(app);
    }

    async function tryBigImport(app) {
        await app.chooseFiles(bigCsv());
        await expect(app.importDialog).toBeVisible();
        await expect(app.importDialog.locator(".import-reading")).toHaveCount(0);
        await app.importDialog.locator("#import-into-open").check();
        await app.importSubmit.click();
        await expect(app.importDialog.locator("#import-error")).toBeVisible();
    }

    test("with a transaction open: the failure is said, then that the transaction was undone as well; it was", async ({ page, app }) => {
        await openFullSample(page, app);
        const fruit = await app.rows("SELECT count(*) FROM fruit");
        await app.rows("BEGIN; INSERT INTO fruit (id, name, price) VALUES (900, 'kiwi', 1.5);");
        expect(await autocommit(page)).toBe(0);
        const handle = await databaseHandle(page);
        await tryBigImport(app);
        await expect(app.importDialog.locator("#import-error")).toHaveText(`${words.IMPORT_FAILED_MESSAGE}${words.IMPORT_LOST_TRANSACTION_MESSAGE}`);
        await expect(app.importDialog.locator("#import-error")).toHaveAttribute("role", "alert");
        await expect(app.importDialog).toBeVisible();
        await expect(app.importDialog.locator(".import-progress")).toBeHidden();
        // nothing was imported, the student's row went with the transaction, no transaction is open
        expect(await isOpenDatabase(page, handle)).toBe(true);
        expect(await names(app)).not.toContain("big");
        expect(await app.rows("SELECT name FROM sqlite_temp_schema")).toEqual([]);
        expect(await app.rows("SELECT count(*) FROM fruit WHERE id = 900")).toEqual([[0]]);
        expect(await app.rows("SELECT count(*) FROM fruit")).toEqual(fruit);
        expect(await autocommit(page)).toBe(1);
        expect(await eventKeys(page)).toEqual([]);
        // with room again the same import works, in the dialog that is still there
        await app.rows("PRAGMA max_page_count = 1000000");
        await app.importSubmit.click();
        await expect(app.importDialog).toBeHidden();
        await expect(app.pane).toHaveAttribute("data-state", "report");
        expect(await app.rows("SELECT count(*) FROM big")).toEqual([[4000]]);
        expect(await app.rows("SELECT count(*) FROM fruit WHERE id = 900")).toEqual([[0]]);
        expect(await autocommit(page)).toBe(1);
    });

    test("with no transaction open the message is the failure alone, and the tables are as they were", async ({ page, app }) => {
        await openFullSample(page, app);
        const before = await names(app);
        await tryBigImport(app);
        await expect(app.importDialog.locator("#import-error")).toHaveText(words.IMPORT_FAILED_MESSAGE);
        expect(await names(app)).toEqual(before);
        expect(await autocommit(page)).toBe(1);
        await app.rows("PRAGMA max_page_count = 1000000");
        await app.importSubmit.click();
        await expect(app.importDialog).toBeHidden();
        expect(await app.rows("SELECT count(*) FROM big")).toEqual([[4000]]);
    });
});

// The other failure after which the engine undoes everything, the student's transaction included:
// memory runs out. SQLite's hard heap limit (PRAGMA hard_heap_limit, in bytes, for the whole
// engine) makes it happen on purpose. With the limit at 1,200,000 bytes a file of 60,000 rows runs
// out of memory in Chromium and Firefox alike: every limit from 300,000 to 5,000,000 does (the
// limit is the same for every connection of the page), and 10,000,000 does not. Under about 100,000
// the page's own statements fail. The limit cannot be put back in the page: the pragma only ever
// LOWERS it (PRAGMA hard_heap_limit = 0 changes nothing, and an import tried again afterwards runs
// out of memory again) and the build has no wrapper for sqlite3_hard_heap_limit64. A test's page ends
// with the test, so nothing leaks; each test asks the page for a query under the limit instead.
const HEAP_LIMIT = 1200000;
const heapCsv = () => csv("big.csv", `id,name,note\n${Array.from({ length: 60000 }, (_, i) => `${i},name${i},${"x".repeat(20)}${i}`).join("\n")}\n`);

// a dialog for heapCsv(), ready to press Import into the open database or into a new one
async function prepareHeapImport(app, into) {
    await app.chooseFiles(heapCsv());
    await expect(app.importDialog).toBeVisible();
    await expect(app.importDialog.locator(".import-reading")).toHaveCount(0);
    if (into === "open") {
        await app.importDialog.locator("#import-into-open").check();
    }
    await expect(app.importSubmit).toBeEnabled();
}

// puts the heap limit on, presses Import and waits for the failure to be said
async function importOutOfMemory(app) {
    await app.rows(`PRAGMA hard_heap_limit = ${HEAP_LIMIT}`);
    await app.importSubmit.click();
    await expect(app.importDialog.locator("#import-error")).toBeVisible();
}

test.describe("an import that runs the browser out of memory fails, and says what became of the student's transaction", () => {
    test("into the open database with a transaction open: the failure, then that the transaction was undone as well; it was", async ({ page, app }) => {
        await app.open(IMPORT_URL);
        await app.upload(SAMPLE_FILE);
        const before = await names(app);
        const fruit = await app.rows("SELECT count(*) FROM fruit");
        await app.rows("BEGIN; INSERT INTO fruit (id, name, price) VALUES (900, 'kiwi', 1.5);");
        expect(await autocommit(page)).toBe(0);
        const handle = await databaseHandle(page);
        await prepareHeapImport(app, "open");
        await importOutOfMemory(app);
        const error = app.importDialog.locator("#import-error");
        await expect(error).toHaveText(`${words.IMPORT_OUT_OF_MEMORY_MESSAGE}${words.IMPORT_LOST_TRANSACTION_MESSAGE}`);
        await expect(error).toHaveAttribute("role", "alert");
        await expect(app.importDialog).toBeVisible();
        await expect(app.importDialog.locator(".import-progress")).toBeHidden();
        // nothing was imported, nothing of the import is left, the student's row went with the
        // transaction (the engine undid it) and no transaction is open
        expect(await isOpenDatabase(page, handle)).toBe(true);
        expect(await names(app)).toEqual(before);
        expect(await app.rows("SELECT name FROM sqlite_temp_schema")).toEqual([]);
        expect(await app.rows("SELECT count(*) FROM fruit WHERE id = 900")).toEqual([[0]]);
        expect(await app.rows("SELECT count(*) FROM fruit")).toEqual(fruit);
        expect(await autocommit(page)).toBe(1);
        expect(await eventKeys(page)).toEqual([]);
        // the page still runs a query, under the limit, in the editor once the dialog is gone
        expect(await app.rows("SELECT 1 + 1")).toEqual([[2]]);
        await app.importCancel.click();
        await expect(app.importDialog).toBeHidden();
        expect(await app.query("SELECT 2 + 2 AS four")).toEqual({ columns: ["four"], rows: [["4"]] });
    });

    test("into the open database with no transaction open: the failure alone", async ({ page, app }) => {
        await app.open(IMPORT_URL);
        await app.upload(SAMPLE_FILE);
        const before = await names(app);
        await prepareHeapImport(app, "open");
        await importOutOfMemory(app);
        await expect(app.importDialog.locator("#import-error")).toHaveText(words.IMPORT_OUT_OF_MEMORY_MESSAGE);
        await expect(app.importDialog).toBeVisible();
        expect(await names(app)).toEqual(before);
        expect(await app.rows("SELECT name FROM sqlite_temp_schema")).toEqual([]);
        expect(await autocommit(page)).toBe(1);
        expect(await eventKeys(page)).toEqual([]);
        expect(await app.rows("SELECT 1 + 1")).toEqual([[2]]);
        await app.importCancel.click();
        await expect(app.importDialog).toBeHidden();
        expect(await app.query("SELECT 2 + 2 AS four")).toEqual({ columns: ["four"], rows: [["4"]] });
    });

    // The engine's allocator can fail where no statement does: the page's own call that makes room
    // for a statement throws a WasmAllocError instead of an engine error. While the rows of the file
    // are staged that is the same lack of memory, and is said as one (not as a file that cannot be
    // read).
    test("into the open database, the engine's allocator failing while the rows are staged is told as a lack of memory, and nothing is left", async ({ page, app }) => {
        await app.open(IMPORT_URL);
        await app.upload(SAMPLE_FILE);
        const before = await names(app);
        const handle = await databaseHandle(page);
        await app.chooseFiles(csv());
        await expect(app.importDialog).toBeVisible();
        await expect(app.importDialog.locator(".import-reading")).toHaveCount(0);
        await app.importDialog.locator("#import-into-open").check();
        await expect(app.importSubmit).toBeEnabled();
        await page.evaluate(() => {
            const { db } = window.app.database;
            const prepare = db.prepare.bind(db);
            db.prepare = (sql, ...more) => {
                if (/insert into temp\..*import_stage/i.test(sql)) {
                    const error = new Error("allocation failed");
                    error.name = "WasmAllocError";
                    throw error;
                }
                return prepare(sql, ...more);
            };
        });
        await app.importSubmit.click();
        const error = app.importDialog.locator("#import-error");
        await expect(error).toHaveText(words.IMPORT_OUT_OF_MEMORY_MESSAGE);
        await expect(error).toHaveAttribute("role", "alert");
        await expect(app.importDialog).toBeVisible();
        await expect(app.importDialog.locator(".import-progress")).toBeHidden();
        expect(await isOpenDatabase(page, handle)).toBe(true);
        expect(await names(app)).toEqual(before);
        expect(await app.rows("SELECT name FROM sqlite_temp_schema")).toEqual([]);
        expect(await autocommit(page)).toBe(1);
        expect(await eventKeys(page)).toEqual([]);
        await app.importCancel.click();
        await expect(app.importDialog).toBeHidden();
    });

    test("into a new database the transaction is not mentioned: it is in the open database, which the failure did not touch", async ({ page, app }) => {
        await app.open(IMPORT_URL);
        await app.upload(SAMPLE_FILE);
        await app.rows("BEGIN; INSERT INTO fruit (id, name, price) VALUES (900, 'kiwi', 1.5);");
        const handle = await databaseHandle(page);
        await prepareHeapImport(app, "new");
        await importOutOfMemory(app);
        await expect(app.importDialog.locator("#import-error")).toHaveText(words.IMPORT_OUT_OF_MEMORY_MESSAGE);
        await expect(app.importDialog).toBeVisible();
        // the open database is still the one, with the student's transaction and its row
        expect(await isOpenDatabase(page, handle)).toBe(true);
        await expect(app.databaseLabel).toHaveText("sample.db");
        expect(await autocommit(page)).toBe(0);
        expect(await app.rows("SELECT count(*) FROM fruit WHERE id = 900")).toEqual([[1]]);
        expect(await eventKeys(page)).toEqual([]);
        await app.rows("ROLLBACK");
        expect(await autocommit(page)).toBe(1);
        await app.importCancel.click();
        await expect(app.importDialog).toBeHidden();
        expect(await app.query("SELECT 2 + 2 AS four")).toEqual({ columns: ["four"], rows: [["4"]] });
    });
});

test.describe("a TEMP table or view takes its name from the open database's files", () => {
    // (The names that the destination holds must be compared as SQLite does, which takes A to Z for
    // a to z: a table Sales stands in the way of sales.csv, which must not be suggested as sales,
    // or the import fails in the engine. Every other test of a taken name had a table written as
    // the file was.)
    test("a name is taken in whatever letter case the database has it: with a table Sales, sales.csv is suggested sales_2 and sales is refused as taken", async ({ app }) => {
        await app.open(IMPORT_URL);
        await app.upload(SAMPLE_FILE);
        await app.rows("CREATE TABLE Sales(x)");
        const name = await chooseSales(app);
        await expect(name).toHaveValue("sales_2");
        await name.fill("sales");
        await app.importSubmit.click();
        await expect(app.importPanel.getByRole("alert").filter({ hasText: /\S/ })).toHaveText(words.importNameTakenMessage("sample.db"));
        await expect(app.importDialog).toBeVisible();
        expect(await app.rows("SELECT name FROM sqlite_schema WHERE name LIKE 'sales%' ORDER BY name")).toEqual([["Sales"]]);
    });

    // (The name for the staging table must be looked for among the TEMP tables, where the staging
    // table is made: looked for among the database's own tables, a TEMP table the student had
    // made under that name made every import fail.)
    for (const mine of ["import_stage", "IMPORT_STAGE"]) {
        test(`a TEMP table of the student's called ${mine} is not in the way of an import, and is as it was afterwards`, async ({ app }) => {
            await app.open(IMPORT_URL);
            await app.upload(SAMPLE_FILE);
            await app.rows(`CREATE TEMP TABLE ${mine}(x); INSERT INTO temp.${mine} VALUES (7)`);
            await app.importFiles(csv("people.csv"), { into: "open" });
            expect(await app.rows("SELECT id, name FROM people ORDER BY id")).toEqual([[1, "Ann"], [2, "Bob"]]);
            expect(await app.rows(`SELECT x FROM temp.${mine}`)).toEqual([[7]]);
            expect(await app.rows("SELECT name FROM sqlite_temp_schema")).toEqual([[mine]]);
        });
    }

    // (the import's table is made in main: a TEMP object of the same name would hide it from every
    // statement that does not say "main.")
    async function chooseSales(app, into = "open") {
        await app.chooseFiles(csv("sales.csv"));
        await expect(app.importDialog).toBeVisible();
        await expect(app.importDialog.locator(".import-reading")).toHaveCount(0);
        if (into === "open") {
            await app.importDialog.locator("#import-into-open").check();
        }
        return app.importPanel.getByLabel(words.IMPORT_TABLE_NAME_LABEL, { exact: true });
    }

    for (const [kind, sql] of [
        ["table", "CREATE TEMP TABLE sales(x)"],
        ["view", "CREATE TEMP VIEW sales AS SELECT 1 AS x"],
    ]) {
        test(`a TEMP ${kind} called sales: sales.csv is suggested sales_2, and typing sales is refused under the field, as a temporary name`, async ({ page, app }) => {
            await app.open(IMPORT_URL);
            await app.upload(SAMPLE_FILE);
            await app.rows(sql);
            const name = await chooseSales(app);
            await expect(name).toHaveValue("sales_2");
            await name.fill("sales");
            await app.importSubmit.click();
            // (a TEMP table or view is in no database: the message does not send the student to
            // look for one in sample.db)
            const alert = app.importPanel.getByRole("alert");
            await expect(alert.filter({ hasText: words.IMPORT_NAME_TEMPORARY_MESSAGE })).toBeVisible();
            await expect(alert.filter({ hasText: words.importNameTakenMessage("sample.db") })).toHaveCount(0);
            await expect(name).toHaveAttribute("aria-invalid", "true");
            await expect(name).toBeFocused();
            await expect(app.importDialog).toBeVisible();
            expect(await app.rows("SELECT count(*) FROM main.sqlite_schema WHERE name = 'sales'")).toEqual([[0]]);
            // the suggested name works, and the table is in main
            await name.fill("sales_2");
            await app.importSubmit.click();
            await expect(app.importDialog).toBeHidden();
            expect(await app.rows("SELECT count(*) FROM main.sales_2")).toEqual([[2]]);
        });
    }

    // The two kinds of owner of a name are told apart (js/lab/import-db.js takenNames: a Map of
    // key -> true when only a TEMP table or view has it, false when the database has it). sample.db
    // has the table fruit.
    test("a table of the database alone: fruit.csv typed fruit is refused as taken by sample.db, not as temporary", async ({ page, app }) => {
        await app.open(IMPORT_URL);
        await app.upload(SAMPLE_FILE);
        expect(await app.rows("SELECT count(*) FROM main.sqlite_schema WHERE name = 'fruit' AND type = 'table'")).toEqual([[1]]);
        await app.chooseFiles(csv("fruit.csv"));
        await expect(app.importDialog).toBeVisible();
        await expect(app.importDialog.locator(".import-reading")).toHaveCount(0);
        await app.importDialog.locator("#import-into-open").check();
        const name = app.importPanel.getByLabel(words.IMPORT_TABLE_NAME_LABEL, { exact: true });
        await expect(name).toHaveValue("fruit_2");
        await name.fill("fruit");
        await app.importSubmit.click();
        const alert = app.importPanel.getByRole("alert");
        await expect(alert.filter({ hasText: words.importNameTakenMessage("sample.db") })).toBeVisible();
        await expect(alert.filter({ hasText: words.IMPORT_NAME_TEMPORARY_MESSAGE })).toHaveCount(0);
        await expect(name).toHaveAttribute("aria-invalid", "true");
        await expect(app.importDialog).toBeVisible();
    });

    test("a name that BOTH the database and a TEMP table have is the database's: refused as taken by sample.db, not as temporary", async ({ page, app }) => {
        await app.open(IMPORT_URL);
        await app.upload(SAMPLE_FILE);
        await app.rows("CREATE TEMP TABLE fruit(x)");
        expect(await app.rows("SELECT count(*) FROM main.sqlite_schema WHERE name = 'fruit' AND type = 'table'")).toEqual([[1]]);
        expect(await app.rows("SELECT count(*) FROM temp.sqlite_schema WHERE name = 'fruit'")).toEqual([[1]]);
        await app.chooseFiles(csv("fruit.csv"));
        await expect(app.importDialog).toBeVisible();
        await expect(app.importDialog.locator(".import-reading")).toHaveCount(0);
        await app.importDialog.locator("#import-into-open").check();
        const name = app.importPanel.getByLabel(words.IMPORT_TABLE_NAME_LABEL, { exact: true });
        await expect(name).toHaveValue("fruit_2");
        await name.fill("fruit");
        await app.importSubmit.click();
        const alert = app.importPanel.getByRole("alert");
        await expect(alert.filter({ hasText: words.importNameTakenMessage("sample.db") })).toBeVisible();
        await expect(alert.filter({ hasText: words.IMPORT_NAME_TEMPORARY_MESSAGE })).toHaveCount(0);
        await expect(name).toHaveAttribute("aria-invalid", "true");
        await expect(name).toBeFocused();
        await expect(app.importDialog).toBeVisible();
        // (nothing was imported: the database has its own fruit and no second one)
        expect(await app.rows("SELECT count(*) FROM main.sqlite_schema WHERE name LIKE 'fruit%' AND type = 'table'")).toEqual([[1]]);
    });

    test("into a new database the name sales is free", async ({ page, app }) => {
        await app.open(IMPORT_URL);
        await app.upload(SAMPLE_FILE);
        await app.rows("CREATE TEMP TABLE sales(x)");
        await app.rows("CREATE TEMP VIEW sales_view AS SELECT 1 AS x");
        const name = await chooseSales(app, "new");
        await expect(app.importDialog.locator("#import-into-new")).toBeChecked();
        await expect(name).toHaveValue("sales");
        // (and ticking the open database, then the new one again, takes the name back)
        await app.importDialog.locator("#import-into-open").check();
        await expect(name).toHaveValue("sales_2");
        await app.importDialog.locator("#import-into-new").check();
        await expect(name).toHaveValue("sales");
        await app.importSubmit.click();
        await expect(app.importDialog).toBeHidden();
        await expect(app.databaseLabel).toHaveText("sales");
        expect(await app.rows("SELECT count(*) FROM main.sales")).toEqual([[2]]);
    });
});

// ---- 7c. the report: very long names and values -----------------------------------------------------

test.describe("the report cuts a very long name or value, keeps the whole of it in title, and names each table", () => {
    // a name of 300 characters with a space in the middle (so that the report shows the name in the
    // file as well as the column's own name), and a column that is mostly numbers whose first
    // value that is not one has 5,000 characters
    const FILE_NAME = `${"n".repeat(150)} ${"m".repeat(149)}`;
    const COLUMN_NAME = `${"n".repeat(150)}_${"m".repeat(149)}`;
    const LONG_VALUE = `v${"0123456789".repeat(500)}`.slice(0, 5000);
    const BODY = `id,${FILE_NAME},v\n1,a,10\n2,b,20\n3,c,30\n4,d,40\n5,e,${LONG_VALUE}\n`;
    const cut = (text) => `${text.slice(0, 80)}…`;

    test("the column cell, the name in the file and the note show 80 characters and the cut mark, with the whole text in title", async ({ page, app }) => {
        expect([FILE_NAME.length, COLUMN_NAME.length, LONG_VALUE.length]).toEqual([300, 300, 5000]);
        await app.open(IMPORT_URL);
        await app.importFiles(csv("wide.csv", BODY));
        const rows = app.pane.locator(".import-report-columns tbody tr");
        await expect(rows).toHaveCount(3);
        const second = rows.nth(1);
        const column = second.locator("th.import-report-column");
        await expect(column).toHaveText(cut(COLUMN_NAME));
        await expect(column).toHaveAttribute("title", COLUMN_NAME);
        const original = second.locator("td").nth(0).locator(".import-cell-text");
        await expect(original).toHaveText(cut(FILE_NAME));
        await expect(original).toHaveAttribute("title", FILE_NAME);
        const third = rows.nth(2);
        await expect(third.locator("th.import-report-column")).toHaveText("v");
        const note = third.locator(".import-report-note .import-cell-text");
        await expect(note).toHaveText(cut(LONG_VALUE));
        await expect(note).toHaveAttribute("title", LONG_VALUE);
        // a short name has no title
        await expect(rows.nth(0).locator("th.import-report-column")).not.toHaveAttribute("title", /./);
        // the table is as wide as a table of ordinary values (it was 143,000 px: every value whole)
        const box = await app.pane.locator(".import-report-columns").boundingBox();
        expect(box.width).toBeLessThan(3000);
        // the stored table has the whole name and the whole value
        expect((await app.rows("SELECT name FROM pragma_table_info('wide') ORDER BY cid")).map((row) => row[0])).toEqual(["id", COLUMN_NAME, "v"]);
        expect(await app.rows("SELECT v FROM wide WHERE id = 5")).toEqual([[LONG_VALUE]]);
    });

    test("a text of 80 characters is shown whole, and one of 81 is cut", async ({ page, app }) => {
        const eighty = "w".repeat(80);
        const eightyOne = "z".repeat(81);
        await app.open(IMPORT_URL);
        await app.importFiles(csv("edge.csv", `id,${eighty} a,v\n1,x,1\n2,y,2\n3,z,${eightyOne}\n`));
        const rows = app.pane.locator(".import-report-columns tbody tr");
        await expect(rows.nth(1).locator("th.import-report-column")).toHaveText(`${eighty}_a`.slice(0, 80) + "…");
        await expect(rows.nth(2).locator(".import-report-note .import-cell-text")).toHaveText(cut(eightyOne));
        await expect(rows.nth(2).locator(".import-report-note .import-cell-text")).toHaveAttribute("title", eightyOne);
        // (an 80-character name whole: the column "id" has no cut, and v's note of 80 characters has none)
        await app.importFiles(csv("edge2.csv", `id,v\n1,1\n2,2\n3,${eighty}\n`));
        const note = app.pane.locator(".import-report-note .import-cell-text");
        await expect(note).toHaveText(eighty);
        await expect(note).not.toHaveAttribute("title", /./);
    });

    test("each table of columns has the name of its table: with two files each is found by it", async ({ page, app }) => {
        await app.open(IMPORT_URL);
        await app.importFiles([csv("alpha.csv", "id,x\n1,a\n"), csv("beta.csv", "id,y\n1,b\n2,c\n")]);
        await expect(app.pane.locator(".import-report-columns")).toHaveCount(2);
        for (const table of ["alpha", "beta"]) {
            const found = app.pane.getByRole("table", { name: table, exact: true });
            await expect(found).toHaveCount(1);
            await expect(found.locator("tbody th")).toHaveText(table === "alpha" ? ["id", "x"] : ["id", "y"]);
        }
        // a second report on the same page (another import) gives the same (the second replaces the
        // first in the pane, so this checks the page only: the counter is pinned by the test below)
        await app.importFiles([csv("alpha.csv", "id,x\n1,a\n"), csv("beta.csv", "id,y\n1,b\n2,c\n")], { database: "second" });
        for (const table of ["alpha", "beta"]) {
            await expect(app.pane.getByRole("table", { name: table, exact: true })).toHaveCount(1);
        }
        const ids = await page.evaluate(() => [...document.querySelectorAll("[id^='import-report-']")].map((el) => el.id));
        expect(new Set(ids).size).toBe(ids.length);
    });
});

test.describe("the ids of the reports", () => {
    // Two reports in one container, as buildImportReport makes them: the pane shows one at a time,
    // so only a container of our own can show whether the ids of the second clash with the first's.
    // The tables have different names in the two, so that a table whose aria-labelledby found the
    // other report's heading would be named wrongly.
    test("two reports in one container: every id is there once, and each table is named by its own heading", async ({ page, app }) => {
        await app.open("./");
        const found = await page.evaluate(async () => {
            const { buildImportReport } = (await import("./bundle/app.js")).importReport;
            const column = (name) => ({ name, original: name, type: "TEXT", blanks: 0, blocking: null });
            const table = (name) => ({ name, rows: 1, source: `${name}.csv`, badQuotes: false, columns: [column("id"), column(`${name}_x`)] });
            const box = document.createElement("div");
            box.id = "two-reports";
            document.body.append(box);
            box.append(buildImportReport([table("alpha"), table("beta")]), buildImportReport([table("gamma"), table("delta")]));
            const ids = [...box.querySelectorAll("[id]")].map((node) => node.id);
            const labelled = [...box.querySelectorAll("table")].map((node) => {
                const id = node.getAttribute("aria-labelledby");
                return {
                    id,
                    owners: document.querySelectorAll(`[id="${id}"]`).length,
                    // the heading of the section the table is in
                    own: document.getElementById(id) === node.closest("section").querySelector("h2"),
                };
            });
            return { ids, labelled };
        });
        expect(found.ids).toHaveLength(4);
        expect(new Set(found.ids).size).toBe(4);
        expect(found.labelled).toHaveLength(4);
        for (const one of found.labelled) {
            expect(one).toEqual({ id: expect.any(String), owners: 1, own: true });
        }
        // and what a reader that lists the tables of the page finds
        for (const table of ["alpha", "beta", "gamma", "delta"]) {
            await expect(page.locator("#two-reports").getByRole("table", { name: table, exact: true })).toHaveCount(1);
        }
    });
});

// ---- 8. storage that cannot keep the events ---------------------------------------------------------

test.describe("when the browser cannot keep the events", () => {
    test("the import still succeeds, the notice says so, and the evidence still lists the import", async ({ page, app }) => {
        await failStorage(page, { prefix: words.EVENTS_PREFIX, on: false });
        await app.open(NORTHLIGHT_IMPORT_URL);
        await setStorageFailing(page, true);
        const file = csv("people.csv");
        await app.importFiles(file);
        await expect(app.summary).toContainText(words.importedMessage(1, "people"));
        expect(await app.rows("SELECT count(*) FROM people")).toEqual([[2]]);
        await expect(page.locator("#storage-notice")).toBeVisible();
        await expect(page.locator("#storage-notice")).toHaveText(importNotice());
        // nothing was stored, and the evidence exported from this page has the event all the same
        expect(await page.evaluate(() => Object.keys(localStorage).filter((key) => key.startsWith("sqllab.events.")))).toEqual([]);
        await app.run("SELECT * FROM people");
        const evidence = await app.exportEvidence();
        expect(evidence.text).toContain("event: import");
        expect(evidence.text).toContain(words.importEventFileLine("people.csv", file.buffer.length));
        expect(evidence.text).toContain(words.importEventTableLine("people", 2, 2));
    });

    // The notice is shown while events are held in the page's memory alone (js/lab/events.js: the
    // report after each write is "fine" only when no log's events are still in memory), and goes when
    // they are stored. The log key of an import into a new database is the new database's own
    // ("file:people"), so the second import of these tests goes into the open one: the same key.
    const eventsKey = (key) => `${words.EVENTS_PREFIX}${key}`;
    const storedEvents = (page, key) => storedEventLines(page, eventsKey(key));
    const fileLine = (file) => words.importEventFileLine(file.name, file.buffer.length);

    test("with storage that works the notice is not shown after an import", async ({ page, app }) => {
        await app.open(NORTHLIGHT_IMPORT_URL);
        const notice = page.locator("#storage-notice");
        // (the notice is on the page from the start, hidden: "hidden" alone would also be true of a notice that is not there)
        await expect(notice).toBeAttached();
        await app.importFiles(csv("people.csv"));
        await expect(notice).toBeHidden();
        await expect(notice).toHaveText("");
        expect(await storedEvents(page, "file:people")).toHaveLength(1);
        // nor after a second one, into the open database
        await app.importFiles(csv("pets.csv", "id,pet\n1,cat\n"), { into: "open" });
        await expect(notice).toBeHidden();
        expect(await storedEvents(page, "file:people")).toHaveLength(2);
    });

    test("the notice says, word for word, what it said when the import was the only thing that could be noted down", async ({ page, app }) => {
        // (typed again on purpose: the import's own words must not change unseen)
        const sentence =
            "Your browser could not save the record of the files you brought in. It is kept until this tab is closed: export your evidence before you close it.";
        expect(importNotice()).toBe(sentence);
        await failStorage(page, { prefix: words.EVENTS_PREFIX, on: false });
        await app.open(NORTHLIGHT_IMPORT_URL);
        await setStorageFailing(page, true);
        await app.importFiles(csv("people.csv"));
        await expect(page.locator("#storage-notice")).toBeVisible();
        await expect(page.locator("#storage-notice")).toHaveText(sentence);
    });

    test("an import while the browser cannot keep events shows the notice, and the next one that can be stored hides it and stores both", async ({ page, app }) => {
        await failStorage(page, { prefix: words.EVENTS_PREFIX, on: false });
        await app.open(NORTHLIGHT_IMPORT_URL);
        const notice = page.locator("#storage-notice");
        await setStorageFailing(page, true);
        const first = csv("people.csv");
        await app.importFiles(first);
        await expect(notice).toBeVisible();
        await expect(notice).toHaveText(importNotice());
        expect(await storedEvents(page, "file:people")).toBeNull();
        // storage works again: the next import is stored, with what the page held back before it
        await setStorageFailing(page, false);
        const second = csv("pets.csv", "id,pet\n1,cat\n");
        await app.importFiles(second, { into: "open" });
        await expect(notice).toBeHidden();
        expect(await storedEvents(page, "file:people")).toEqual([
            [fileLine(first), words.importEventTableLine("people", 2, 2)],
            [fileLine(second), words.importEventTableLine("pets", 1, 2)],
        ]);
        // and the page holds nothing of its own now: what it reads is what is stored
        const { found } = await eventsOf(page, ["file:people"]);
        expect(found["file:people"].map((event) => event.lines[0])).toEqual([fileLine(first), fileLine(second)]);
    });

    test("stored events of a later version are never written over: the import is kept in memory, the notice says so, and they are stored once the value can be read", async ({ page, app }) => {
        await app.open(NORTHLIGHT_IMPORT_URL);
        const notice = page.locator("#storage-notice");
        const later = JSON.stringify({ v: 2, events: [{ whatever: "a newer release's" }] });
        await page.evaluate(([key, text]) => localStorage.setItem(key, text), [eventsKey("file:people"), later]);
        const first = csv("people.csv");
        await app.importFiles(first);
        await expect(app.summary).toContainText(words.importedMessage(1, "people"));
        // what is stored is as it was, byte for byte; the notice says that events are in memory alone
        expect(await page.evaluate((key) => localStorage.getItem(key), eventsKey("file:people"))).toBe(later);
        await expect(notice).toBeVisible();
        await expect(notice).toHaveText(importNotice());
        const { found } = await eventsOf(page, ["file:people"]);
        expect(found["file:people"].map((event) => event.lines[0])).toEqual([fileLine(first)]);
        // the evidence exported from this page has the import
        const evidence = await app.exportEvidence();
        expect(evidence.text).toContain(fileLine(first));
        // the value can be read again (the other tab's newer release is gone): the next import stores both, and the notice goes
        await page.evaluate((key) => localStorage.removeItem(key), eventsKey("file:people"));
        const second = csv("pets.csv", "id,pet\n1,cat\n");
        await app.importFiles(second, { into: "open" });
        await expect(notice).toBeHidden();
        expect(await storedEvents(page, "file:people")).toEqual([
            [fileLine(first), words.importEventTableLine("people", 2, 2)],
            [fileLine(second), words.importEventTableLine("pets", 1, 2)],
        ]);
    });

    test("a stored value that is not JSON counts as no events: it is replaced by the import's event, and the notice is not shown", async ({ page, app }) => {
        await app.open(NORTHLIGHT_IMPORT_URL);
        await page.evaluate((key) => localStorage.setItem(key, "this is not JSON {"), eventsKey("file:people"));
        const first = csv("people.csv");
        await app.importFiles(first);
        await expect(page.locator("#storage-notice")).toBeHidden();
        expect(await storedEvents(page, "file:people")).toEqual([[fileLine(first), words.importEventTableLine("people", 2, 2)]]);
    });
});

// ---- 9. a phone -------------------------------------------------------------------------------------------

test.describe("on a phone", () => {
    test.use({ viewport: { width: 390, height: 844 } });

    test("after an import the Result view is showing, with the report in it", async ({ page, app }) => {
        await app.open(NORTHLIGHT_IMPORT_URL);
        await expect(page.locator("#view-result")).toBeVisible();
        await app.importFiles(csv("people.csv"));
        await expect(page.locator("#view-result")).toHaveAttribute("aria-current", "true");
        await expect(app.pane.locator(".import-report")).toBeVisible();
        await expect(app.pane).toBeInViewport();
        await expect(app.summary).toContainText(words.importedMessage(1, "people"));
    });
});

// ---- 10. the report warns of a quote that was never closed -------------------------------------------

// Plan, section 3, "Import report": a text file with a quote that could not be paired gets a
// warning, because everything after that quote may have been read as one field. js/lab/import.js
// hands the report what the reader found (read.badQuotes).
const MESSY_SALES = () => ({ name: "messy_sales.csv", mimeType: "text/csv", buffer: fs.readFileSync(fixturePath("messy_sales.csv")) });
const reportSection = (app, table) => app.pane.locator("section.import-report-table").filter({ has: app.page.getByRole("heading", { name: table, exact: true }) });

test.describe("the report warns of a quote that is never closed, and only then", () => {
    test("one warning, in the section of the file whose quote is open, with the plan's words; none for a file whose quotes pair", async ({ page, app }) => {
        await app.open(IMPORT_URL);
        await app.importFiles([csv("unclosed.csv", 'id,h\n1,"abc\n2,def\n'), MESSY_SALES()]);
        await expect(app.pane).toHaveAttribute("data-state", "report");
        await expect(app.pane.locator("section.import-report-table")).toHaveCount(2);
        await expect(app.pane.locator(".import-report-warning")).toHaveCount(1);
        await expect(reportSection(app, "unclosed").locator(".import-report-warning")).toHaveText(words.IMPORT_REPORT_QUOTES_WARNING);
        await expect(reportSection(app, "messy_sales").locator(".import-report-warning")).toHaveCount(0);
        // (both files were imported: the warning is about what was read, and refuses nothing)
        expect(await app.rows("SELECT count(*) FROM unclosed")).toEqual([[1]]);
        expect((await app.rows("SELECT count(*) FROM messy_sales"))[0][0]).toBeGreaterThan(0);
    });
});

// ---- 11. the staging table is a TEMP table --------------------------------------------------------------

// Plan, section 3, "Libraries": a staging table in the main database leaves its pages behind when
// it is dropped (js/lab/import-db.js, newStage: `temp.`). The import goes into the open database,
// so that the page can ask it (window.app.database.db) what it holds.
test.describe("the staging table is a TEMP table: the open database is not made larger by it", () => {
    test("while a file is being read the staging table is in sqlite_temp_schema, and the main database has no new table", async ({ page, app }) => {
        test.slow();
        await app.open(NORTHLIGHT_IMPORT_URL);
        await app.upload(SAMPLE_FILE);
        const mainBefore = await names(app);
        await slowDown(page);
        await app.chooseFiles(bigCsv("big.csv", 20_000));
        await expect(app.importDialog).toBeVisible();
        await expect(app.importDialog.locator(".import-reading")).toHaveCount(0);
        await app.importDialog.locator("#import-into-open").check();
        await expect(app.importSubmit).toBeEnabled();
        await app.importSubmit.click();
        // the first moment the bar has moved: a slice of the file is in the staging table. (Both
        // lists are read in the one call, so that nothing happens between them.)
        const seen = await (
            await page.waitForFunction(() => {
                const bar = document.querySelector("#import-dialog .import-progress progress");
                if (!bar || !(bar.value > 0)) {
                    return false;
                }
                const db = window.app.database.db;
                return {
                    temp: db.selectValues("SELECT name FROM sqlite_temp_schema ORDER BY name"),
                    main: db.selectValues("SELECT name FROM sqlite_schema ORDER BY name"),
                };
            })
        ).jsonValue();
        expect(seen.temp).toHaveLength(1);
        expect(seen.main).toEqual(mainBefore);
        // (and the import goes on to its end, with the staging table gone)
        await expect(app.importDialog).toBeHidden({ timeout: 60_000 });
        expect(await app.rows("SELECT name FROM sqlite_temp_schema")).toEqual([]);
    });

    test("when it has ended no page is on the free list, and the database grew by the typed table alone", async ({ page, app }) => {
        await app.open(NORTHLIGHT_IMPORT_URL);
        await app.upload(SAMPLE_FILE);
        const [[pagesBefore]] = await app.rows("PRAGMA page_count");
        const [[pageSize]] = await app.rows("PRAGMA page_size");
        await app.importFiles(bigCsv("big.csv", 5000), { into: "open" });
        expect(await app.rows("SELECT count(*) FROM big")).toEqual([[5000]]);
        const [[pagesAfter]] = await app.rows("PRAGMA page_count");
        expect(await app.rows("PRAGMA freelist_count")).toEqual([[0]]);
        // the same table built directly (in the TEMP database, which has no other table) takes as
        // many pages as the import's table does: a staging table in the main database would have
        // taken as many again, and left them free
        await app.rows("CREATE TEMP TABLE direct AS SELECT * FROM big");
        const [[typedPages]] = await app.rows("PRAGMA temp.page_count");
        const [[typedPageSize]] = await app.rows("PRAGMA temp.page_size");
        await app.rows("DROP TABLE temp.direct");
        // (in bytes: the two databases need not have the same page size)
        const typed = typedPages * typedPageSize;
        const grew = (pagesAfter - pagesBefore) * pageSize;
        expect(typed).toBeGreaterThan(100_000);
        expect(grew).toBeLessThanOrEqual(typed * 1.2 + 2 * pageSize);
    });
});

// ---- 12. a refusal found during the import leaves nothing ---------------------------------------------------

// The preview reads the first megabyte of a text file, so a file whose rows are all fine for that
// long shows as fine. A row of 2,001 fields later on is met by the import (js/lab/import-csv.js
// throws ImportRefused "too-wide"; run() undoes what was done and refuses the file).
const WIDE_LAST_ROW = () => {
    const rows = ["id,note"];
    let size = rows[0].length;
    for (let i = 1; size < 1_200_000; i++) {
        const row = `${i},${"x".repeat(80)}`;
        rows.push(row);
        size += row.length + 1;
    }
    rows.push(Array.from({ length: 2001 }, (unused, n) => n).join(","));
    return csv("wide.csv", `${rows.join("\n")}\n`);
};
const escapedText = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const refusedTabOf = (app, name) => app.page.getByRole("tab", { name: new RegExp(`^${escapedText(name)} \\(${escapedText(words.IMPORT_REFUSED_TAB_TEXT)}\\)$`) });

// the dialog is still open after a refusal, so the page cannot be asked to Run: what was
// there before is looked at by the page's own handles
async function expectUntouched(page, app, before, { logKeys = [] } = {}) {
    expect(await isOpenDatabase(page, before.handle)).toBe(true);
    expect(await page.evaluate(() => window.app.database.name)).toBe(before.name);
    expect(await names(app)).toEqual(before.tables);
    expect(await app.rows("SELECT name FROM sqlite_temp_schema")).toEqual([]);
    expect(await page.evaluate(() => location.href)).toBe(before.href);
    expect(await page.title()).toBe(before.title);
    await expect(app.databaseLabel).toHaveText(before.label);
    const { found, stored } = await eventsOf(page, logKeys);
    expect(stored).toEqual(before.eventKeys);
    for (const key of logKeys) {
        expect(found[key]).toEqual([]);
    }
    await expect(app.pane).not.toHaveAttribute("data-state", "report");
}

// the file's tab after Import: refused with `reason`, on show and focused; the dialog is open and
// offers Close alone
async function expectRefusedAfterImport(app, name, reason) {
    const tab = refusedTabOf(app, name);
    await expect(tab).toBeVisible();
    await expect(tab).toHaveAttribute("aria-selected", "true");
    await expect(tab).toBeFocused();
    await expect(app.importPanel).toContainText(reason);
    await expect(app.importDialog).toBeVisible();
    await expect(app.importDialog.locator(".import-progress")).toBeHidden();
    await expect(app.importSubmit).toBeHidden();
    await expect(app.importCancel).toHaveText(words.IMPORT_CLOSE_TEXT);
}

async function openWithWideFile(page, app, { into }) {
    const file = WIDE_LAST_ROW();
    expect(file.buffer.length).toBeGreaterThan(1_200_000);
    await app.chooseFiles(file);
    await expect(app.importDialog).toBeVisible();
    await expect(app.importDialog.locator(".import-reading")).toHaveCount(0);
    // as far as the preview read, the file is fine
    await expect(refusedTabOf(app, "wide.csv")).toHaveCount(0);
    await expect(app.importSubmit).toBeEnabled();
    if (into === "open") {
        await app.importDialog.locator("#import-into-open").check();
    }
}

test.describe("a row that is too wide after the first megabyte refuses the file and leaves nothing", () => {
    test("into a new database: the tab says why, and no table, no database, no event and no TEMP table is left", async ({ page, app }) => {
        await app.open(NORTHLIGHT_IMPORT_URL);
        await app.trackConnections();
        const before = await snapshot(page, app);
        await openWithWideFile(page, app, { into: "new" });
        await app.importSubmit.click();
        await expectRefusedAfterImport(app, "wide.csv", words.IMPORT_TOO_WIDE_REASON);
        await expectUntouched(page, app, before, { logKeys: ["northlight", "file:wide"] });
        // the database that was begun for it is closed
        await expectConnectionsClosed(app);
        expect((await app.connections()).map((connection) => connection.name)).toEqual(["wide"]);
        // the dialog is of no use to a file that cannot be read: Close, and the page is free
        await app.importCancel.click();
        await expect(app.importDialog).toBeHidden();
        expect(await app.query("SELECT 1 AS one")).toEqual({ columns: ["one"], rows: [["1"]] });
    });

    test("into the open database: the same, and the student's transaction is still open and holds what it held", async ({ page, app }) => {
        await app.open(NORTHLIGHT_IMPORT_URL);
        await app.upload(SAMPLE_FILE);
        await app.trackConnections();
        await app.run("BEGIN; INSERT INTO fruit (id, name, price) VALUES (900, 'kiwi', 1.5);");
        const counts = await app.rows("SELECT (SELECT count(*) FROM fruit), (SELECT count(*) FROM tags)");
        const before = await snapshot(page, app);
        await openWithWideFile(page, app, { into: "open" });
        await app.importSubmit.click();
        await expectRefusedAfterImport(app, "wide.csv", words.IMPORT_TOO_WIDE_REASON);
        await expectUntouched(page, app, before, { logKeys: ["file:sample.db"] });
        expect(await app.rows("SELECT (SELECT count(*) FROM fruit), (SELECT count(*) FROM tags)")).toEqual(counts);
        expect(await app.rows("SELECT name FROM fruit WHERE id = 900")).toEqual([["kiwi"]]);
        expect(await autocommit(page)).toBe(0);
        expect(await app.connections()).toEqual([]);
        await app.importCancel.click();
        await expect(app.importDialog).toBeHidden();
        await app.run("ROLLBACK;");
        expect(await app.rows("SELECT count(*) FROM fruit WHERE id = 900")).toEqual([[0]]);
    });

    test("into the open database with no transaction of the student's: none is left open by the import either", async ({ page, app }) => {
        await app.open(NORTHLIGHT_IMPORT_URL);
        await app.upload(SAMPLE_FILE);
        expect(await autocommit(page)).toBe(1);
        const before = await snapshot(page, app);
        await openWithWideFile(page, app, { into: "open" });
        await app.importSubmit.click();
        await expectRefusedAfterImport(app, "wide.csv", words.IMPORT_TOO_WIDE_REASON);
        await expectUntouched(page, app, before, { logKeys: ["file:sample.db"] });
        // (the import's savepoint began a transaction: it is rolled back and released)
        expect(await autocommit(page)).toBe(1);
        await app.importCancel.click();
        await expect(app.importDialog).toBeHidden();
    });
});

// The closing check of the phase: every test of a failure or of a Cancel after Import had one
// file. An import of several files is one savepoint (js/lab/import.js run): the file that fails,
// or the Cancel, takes the tables of the files before it too. With a savepoint for each file
// the first file's table would stay in the open database, and no test would have said so.
test.describe("several files: a refusal or a Cancel in a later file undoes the files before it", () => {
    // waits until the import is at the copy of its second file (steps.csv), with the first
    // file's table whole in the open database; answers with the rows in each
    async function waitForSecondCopy(page) {
        const handle = await page.waitForFunction(
            ({ title, copying }) => {
                const box = document.querySelector("#import-dialog .import-progress");
                const bar = box?.querySelector("progress");
                if (!bar || box.querySelector("#import-progress-title").textContent !== title) {
                    return false;
                }
                if (box.querySelector(".results-loading-size").textContent !== copying || !(bar.value > 0 && bar.value < 1)) {
                    return false;
                }
                const db = window.app.database.db;
                const made = (table) => db.selectValue("select count(*) from main.sqlite_schema where type = 'table' and name = ?", [table]);
                if (!made("first") || !made("steps")) {
                    return false;
                }
                return { first: db.selectValue('select count(*) from main."first"'), steps: db.selectValue('select count(*) from main."steps"') };
            },
            { title: words.importProgressTitle(2, 2, "steps.csv"), copying: words.IMPORT_PROGRESS_COPYING },
            { timeout: 30_000 }
        );
        return handle.jsonValue();
    }

    test("a second file that is refused during the import: the first file's table goes too, the student's transaction stays, and the first file can then be imported by itself", async ({ page, app }) => {
        await app.open(NORTHLIGHT_IMPORT_URL);
        await app.upload(SAMPLE_FILE);
        await app.trackConnections();
        await app.run("BEGIN; INSERT INTO fruit (id, name, price) VALUES (900, 'kiwi', 1.5);");
        const before = await snapshot(page, app);
        await app.chooseFiles([csv("first.csv"), WIDE_LAST_ROW()]);
        await expect(app.importDialog).toBeVisible();
        await expect(app.importDialog.locator(".import-reading")).toHaveCount(0);
        await app.importDialog.locator("#import-into-open").check();
        await expect(app.importSubmit).toBeEnabled();
        await app.importSubmit.click();
        // the second file's tab says why, on show and focused; the first file is still to import
        const refused = refusedTabOf(app, "wide.csv");
        await expect(refused).toBeVisible();
        await expect(refused).toHaveAttribute("aria-selected", "true");
        await expect(refused).toBeFocused();
        await expect(app.importPanel).toContainText(words.IMPORT_TOO_WIDE_REASON);
        await expect(app.importDialog.locator(".import-progress")).toBeHidden();
        await expect(app.importSubmit).toBeEnabled();
        // nothing of the import is left: not the table of the file that had been read whole
        await expectUntouched(page, app, before, { logKeys: ["file:sample.db"] });
        expect(await app.rows("SELECT count(*) FROM sqlite_schema WHERE name IN ('first', 'wide')")).toEqual([[0]]);
        expect(await autocommit(page)).toBe(0);
        expect(await app.rows("SELECT name FROM fruit WHERE id = 900")).toEqual([["kiwi"]]);
        expect(await app.connections()).toEqual([]);
        // Import again: the refused file is left out, and the first goes in
        await app.importSubmit.click();
        await expect(app.importDialog).toBeHidden();
        await expect(app.pane).toHaveAttribute("data-state", "report");
        expect(await app.rows("SELECT id, name FROM first ORDER BY id")).toEqual([[1, "Ann"], [2, "Bob"]]);
        expect(await app.rows("SELECT count(*) FROM sqlite_schema WHERE name = 'wide'")).toEqual([[0]]);
        expect(await autocommit(page)).toBe(0);
        expect(await app.rows("SELECT name FROM fruit WHERE id = 900")).toEqual([["kiwi"]]);
    });

    test("Cancel while the second file is copied into its table: the first file's table, which was whole, goes too", async ({ page, app }) => {
        test.slow();
        await app.open(NORTHLIGHT_IMPORT_URL);
        await app.upload(SAMPLE_FILE);
        await app.trackConnections();
        await app.run("BEGIN; INSERT INTO fruit (id, name, price) VALUES (900, 'kiwi', 1.5);");
        await slowCopy(page, 500);
        const before = await snapshot(page, app);
        await app.chooseFiles([csv("first.csv"), stepsCsv()]);
        await expect(app.importDialog).toBeVisible();
        await expect(app.importDialog.locator(".import-reading")).toHaveCount(0);
        await app.importDialog.locator("#import-into-open").check();
        await expect(app.importSubmit).toBeEnabled();
        await app.importSubmit.click();
        const rows = await waitForSecondCopy(page);
        expect(rows.first, "the first file's table is whole").toBe(2);
        expect(rows.steps, "the second file's table is part of the way").toBeGreaterThan(0);
        expect(rows.steps).toBeLessThan(STEP_ROWS);
        await app.importCancel.click();
        await expect(app.importDialog).toBeHidden();
        await expectNothingLeft(page, app, before, { logKeys: ["file:sample.db"] });
        expect(await app.rows("SELECT count(*) FROM sqlite_schema WHERE name IN ('first', 'steps')")).toEqual([[0]]);
        expect(await autocommit(page)).toBe(0);
        expect(await app.rows("SELECT name FROM fruit WHERE id = 900")).toEqual([["kiwi"]]);
        expect(await app.connections()).toEqual([]);
        await app.run("ROLLBACK;");
        expect(await app.rows("SELECT count(*) FROM fruit WHERE id = 900")).toEqual([[0]]);
    });
});

test.describe("a file that cannot be read any more when Import is pressed", () => {
    // The file is chosen from a folder made for the test, its preview is read, and it is deleted
    // from the disk. What a browser then does with the File it was given is the browser's. Chromium
    // and Firefox, as run here, cannot read it: the tab is refused with IMPORT_UNREADABLE_REASON and
    // nothing is left. A browser that has kept the bytes (WebKit has not been run) would import the
    // file whole, which is no fault: it is then held to a whole table.
    const KEEPS_NOTHING = ["chromium", "firefox"];
    for (const into of ["new", "open"]) {
        test(`into ${into === "new" ? "a new database" : "the open database"}: the file is refused as unreadable and nothing is left`, async ({ page, app, browserName }, testInfo) => {
            // (in the test's own output folder: a run that is stopped before its `finally` leaves
            // nothing in the system's temp folder)
            const folder = testInfo.outputPath("lab-gone");
            fs.mkdirSync(folder, { recursive: true });
            try {
                const file = path.join(folder, "gone.csv");
                fs.writeFileSync(file, "id,name\n1,Ann\n2,Bob\n");
                await app.open(NORTHLIGHT_IMPORT_URL);
                if (into === "open") {
                    await app.upload(SAMPLE_FILE);
                }
                await app.trackConnections();
                const before = await snapshot(page, app);
                await app.chooseFiles(file);
                await expect(app.importDialog).toBeVisible();
                await expect(app.importDialog.locator(".import-reading")).toHaveCount(0);
                if (into === "open") {
                    await app.importDialog.locator("#import-into-open").check();
                }
                await expect(app.importSubmit).toBeEnabled();
                fs.rmSync(file);
                await app.importSubmit.click();
                const refused = refusedTabOf(app, "gone.csv");
                await expect.poll(async () => ((await refused.count()) ? "refused" : (await app.importDialog.isVisible()) ? "running" : "imported"), { timeout: 20_000 }).not.toBe("running");
                if (await refused.count()) {
                    await expectRefusedAfterImport(app, "gone.csv", words.IMPORT_UNREADABLE_REASON);
                    await expectUntouched(page, app, before, { logKeys: into === "open" ? ["file:sample.db"] : ["northlight", "file:gone"] });
                    expect(await autocommit(page)).toBe(1);
                    await expectConnectionsClosed(app);
                } else {
                    expect(KEEPS_NOTHING, `${browserName} kept the bytes of a deleted file`).not.toContain(browserName);
                    await expect(app.pane).toHaveAttribute("data-state", "report");
                    expect(await app.rows("SELECT id, name FROM gone ORDER BY id")).toEqual([[1, "Ann"], [2, "Bob"]]);
                }
            } finally {
                fs.rmSync(folder, { recursive: true, force: true });
            }
        });
    }
});

// ---- 13. where files may go ---------------------------------------------------------------------------------

// Plan, section 3, "Preview dialog", Destination: "An opened file" is read as any other database that
// is not a course database: a file, a database opened from a URL, a script, the empty database, or
// one that an earlier import made. For each, the dialog offers "The open database, <name>" with no
// note under it, and the import adds its table to that database, which keeps what it held.
test.describe("the open database is offered as the destination when it is not a course database", () => {
    // chooses a CSV, picks the open database and imports; the database is the same one afterwards
    async function importIntoOpenDatabase(page, app, { held = null } = {}) {
        const label = (await app.databaseLabel.textContent()).trim();
        const handle = await databaseHandle(page);
        const before = await names(app);
        const kept = held ? await app.rows(`SELECT * FROM ${held} ORDER BY 1`) : [];
        await app.chooseFiles(csv("people.csv"));
        await expect(app.importDialog).toBeVisible();
        await expect(app.importDialog.locator(".import-reading")).toHaveCount(0);
        const open = app.importDialog.locator("#import-into-open");
        await expect(open).toBeEnabled();
        await expect(app.importDialog.locator('label[for="import-into-open"]')).toHaveText(words.importOpenDatabaseLabel(label));
        // (the note about a course database is not shown)
        await expect(app.importDialog.locator("#import-into-open-note")).toBeHidden();
        await open.check();
        await expect(app.importSubmit).toBeEnabled();
        await app.importSubmit.click();
        await expect(app.importDialog).toBeHidden();
        await expect(app.pane).toHaveAttribute("data-state", "report");
        expect(await isOpenDatabase(page, handle)).toBe(true);
        expect(await names(app)).toEqual([...before, "people"].sort());
        expect(await app.rows("SELECT id, name FROM people ORDER BY id")).toEqual([[1, "Ann"], [2, "Bob"]]);
        if (held) {
            expect(await app.rows(`SELECT * FROM ${held} ORDER BY 1`)).toEqual(kept);
        }
        await expect(app.databaseLabel).toHaveText(label);
        return label;
    }

    test("a script that was opened as a file", async ({ page, app }) => {
        await app.open(IMPORT_URL);
        const before = await databaseHandle(page);
        await app.chooseFiles(SCRIPT);
        await expectOpened(page, app, before);
        expect(await importIntoOpenDatabase(page, app, { held: "note" })).toBe("notes.sql");
        expect(await app.rows("SELECT id, body FROM note")).toEqual([[1, "first"]]);
    });

    test("a database that was opened with Open from URL", async ({ page, app }) => {
        // the sample database, served at an address of its own (one that no course database has)
        await page.route(/\/datasets\/fruit-copy\.db(\?.*)?$/, (route) => route.fulfill({ path: SAMPLE_FILE, contentType: "application/octet-stream" }));
        await app.open(IMPORT_URL);
        const before = await databaseHandle(page);
        await page.keyboard.press("Control+u");
        const input = page.locator("#open-url-input");
        await expect(input).toBeVisible();
        await input.fill("datasets/fruit-copy.db");
        await input.press("Enter");
        await expectOpened(page, app, before);
        await expect(app.databaseLabel).toHaveText("fruit-copy.db");
        expect(await importIntoOpenDatabase(page, app, { held: "fruit" })).toBe("fruit-copy.db");
        expect(await names(app)).toEqual(expect.arrayContaining(["fruit", "people", "tags"]));
    });

    test("the empty database that the page falls back to when the default dataset cannot be fetched", async ({ page, app }) => {
        const held = await holdDataset(page);
        held.fail();
        await page.goto(IMPORT_URL);
        await expect(app.errorBand).toBeVisible();
        await app.waitReady();
        expect(await names(app)).toEqual([]);
        await importIntoOpenDatabase(page, app);
    });

    test("a database that an earlier import made", async ({ page, app }) => {
        await app.open(IMPORT_URL);
        await app.importFiles(csv("first.csv", "id,v\n1,a\n2,b\n"));
        await expect(app.databaseLabel).toHaveText("first");
        expect(await importIntoOpenDatabase(page, app, { held: "first" })).toBe("first");
        expect(await app.rows("SELECT id, v FROM first ORDER BY id")).toEqual([[1, "a"], [2, "b"]]);
    });
});

// ---- 14. the notice for events that cannot be stored, under axe -------------------------------------------------

// UI plan, section 8, and the assessment plan, section 9: every new banner passes axe, in light and
// dark. The notice is #storage-notice with the sentence for the import alone (section 8 above gets the page there).
test.describe("axe finds no serious or critical violation with the notice for events that cannot be stored on show", () => {
    for (const viewport of [
        { name: "desktop", width: 1366, height: 768 },
        { name: "phone", width: 390, height: 844 },
    ]) {
        for (const theme of ["light", "dark"]) {
            test(`${theme}, ${viewport.name}`, async ({ page, app }) => {
                await page.setViewportSize({ width: viewport.width, height: viewport.height });
                await page.emulateMedia({ colorScheme: theme, reducedMotion: "reduce" });
                await failStorage(page, { prefix: words.EVENTS_PREFIX, on: false });
                await app.open(NORTHLIGHT_IMPORT_URL);
                await setStorageFailing(page, true);
                await app.importFiles(csv("people.csv"));
                const notice = page.locator("#storage-notice");
                await expect(notice).toBeVisible();
                await expect(notice).toHaveText(importNotice());
                await page.evaluate(() => document.fonts.ready);
                const results = await new AxeBuilder({ page }).analyze();
                const serious = results.violations
                    .filter((v) => v.impact === "serious" || v.impact === "critical")
                    .map((v) => `${v.id} (${v.impact}): ${v.help} at ${v.nodes.slice(0, 4).map((n) => n.target.join(" ")).join(" | ")}`);
                // (the page was looked at: some rules ran and passed)
                expect(results.passes.length).toBeGreaterThan(5);
                expect(serious).toEqual([]);
            });
        }
    }
});

// ---- 15. About names the files an import keeps a note of, and credits Papa Parse ------------------------------------

// The sentences are in about.html (not in the config), so the words that matter are typed here. About
// says so although the flag is off, and the page is opened without it.
test.describe("about.html", () => {
    test("its list of what the browser remembers names the files a student imports", async ({ page }) => {
        await page.goto("./about.html");
        const remembered = page.locator("main p", { hasText: "remembered between visits" });
        await expect(remembered).toHaveCount(1);
        await expect(remembered).toContainText("a note of each file you import (its name, its size and the tables it made)");
    });

    test("its credits name Papa Parse, with its licence", async ({ page }) => {
        await page.goto("./about.html");
        const credits = page.locator("main h2", { hasText: "Credits and licence" });
        await expect(credits).toHaveCount(1);
        const papa = page.locator("main h2:has-text('Credits and licence') ~ p", { hasText: "Papa Parse" });
        await expect(papa).toHaveCount(1);
        await expect(papa).toContainText("Papa Parse, by Matthew Holt (MIT License)");
    });
});
