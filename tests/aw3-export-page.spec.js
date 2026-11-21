const fs = require("node:fs");
const path = require("node:path");
const { pathToFileURL } = require("node:url");
const AxeBuilder = require("@axe-core/playwright").default;
const {
    test,
    expect,
    fixturePath,
    realManifest,
    openableSets,
    failStorage,
    setStorageFailing,
    DEFAULT_DATASET,
    SAMPLE_FILE,
    csvFile: csv,
    holdVendor,
    holdImport,
    finishHeld,
    holdDataset,
    slowDown,
    snapshot,
    expectNothingLeft,
    waitUntilIdle,
    eventsOf,
    eventKeys,
    logKey,
    openLogKey,
    readZip,
    databaseHandle,
    databaseFingerprint,
    isOpenDatabase,
    EXPORT_URL,
    flagState,
    EDGE_DATABASE,
    openEdgeCases,
    recordDownloads,
    eventsOfOpen,
    expectedBytes,
    ZIP_TOOL,
    openStatements,
    autocommit,
    progressKey,
    storedEventLines,
} = require("./helpers");

// Assessment plan, Phase 3 (export tables as CSV): the page around the export. The export is
// switched by the flag "export" (on in the page as it ships): a page with the export alone on
// (flagState("export"), the kit's EXPORT_URL) has "Tables as CSV…" in the Export menu and in
// the More menu, and its dialog; a page with the flag off has neither. What the dialog does and what
// the files hold are pinned by the other aw3 files (tests/aw3-export-dialog.spec.js, -fixtures,
// -rules); here is the page around them (js/index.js, js/lab/export-tables.js, js/lab/export-menu.js, js/lab/more-menu.js). With the
// owner's tests/fixtures/export/export_edge_cases.db opened as a file:
//   - what an export saves: one table (basic) alone as basic.csv, with the bytes of the owner's
//     expected file; all fourteen as export_edge_cases-tables.zip, whose entries, read with readZip
//     (tests/helpers.js: no library of the page's), have the expected names, in order, and the bytes
//     of the expected files; the Blob that the browser is handed has the type of the file (CSV, zip);
//   - the evidence log: one event for each file that was saved, with the lines of a file and of a zip, in
//     its place among the queries of the evidence file (which verifies as VALID with it); none for
//     an export that was cancelled or failed;
//   - the flag: both menus with it off and on (their entries, order, texts and glyphs; with it on, axe on
//     each menu with the entry in it, and the entry's words measured against the menu, light and dark), with "export" on
//     while "import" is off and the reverse, no dialog and no new request with it off, the page as
//     it ships (the entry and the dialog are there, with the import beside them), and the flag
//     still on after a dataset, a file, an exercise set and an exercise were opened (the address
//     drops the parameter);
//   - the toasts: for a file (one row, several, none), for a zip, and for Cancel;
//   - a table that holds a BLOB: the note at the end;
//   - while an export runs (held by the zip tool's request, which a test can hold without a hook in
//     the page): every refusal of the plan's section 7, one test each, each with the export's own
//     message and each leaving the export running and unharmed: Run, Check, the database export, the
//     switcher, Ctrl+O, "Open a file…", Open from URL, an exercise set, a file chosen or dropped, an
//     import (a CSV file's refusal is a note), and a second "Tables as CSV…"; Back and Forward put
//     the address back, with its state, and say why;
//   - the reverse pairings: no dialog while a database loads, while an import runs or while an
//     earlier export is still ending; Export pressed in a dialog under which a load has begun is
//     refused with its message; a database that opens under the idle dialog closes it;
//   - the zip tool: not asked for until Export is pressed with two tables or more, once, and again
//     after a failed load;
//   - nothing left behind after Cancel or an error: no statement open on the database, no download,
//     no event, the busy state off; the student's own transaction read and left open;
//   - how an export fails: a view that cannot be read to its end, a table dropped under the open
//     dialog, a file or a zip that cannot be made, a browser that cannot save the file or has no
//     memory left (the browser's, or the engine's own, as a text or a column's name that it cannot
//     give: then no table is named and the row keeps its tick), a fault of the page's own while a
//     table is read (not the table's fault), a zip that passes what a zip can hold or fails late in an
//     entry, a list that cannot be read, a reader that cannot be closed: each with its own
//     words, nothing saved or recorded, no statement left open, the page free, and the next press
//     of Export working; and a file that was saved although something after it threw: no failure
//     is told;
//   - what run refuses before it begins: another long job, another database under the dialog;
//   - the tones of the toasts, and the timer that looks at Cancel being stopped;
//   - a course database: its events are kept under the database's key and verify, and its zip is
//     named after the database's own name, not after the label the switcher shows;
//   - the notice for events that cannot be stored, after an export, with the export alone and with
//     both flags.
// The texts are read from js/lab/config.js and js/lab/config-workflow.js, never typed again. Each
// test is titled with the behaviour it pins.

const load = (file) => import(pathToFileURL(path.join(__dirname, "..", "js", "lab", file)).href);

const BOTH_URL = `./?${flagState("import", "export")}`;
const ZIP_TOOL_URL = `**/vendor/${ZIP_TOOL}`;

let words;
test.beforeAll(async () => {
    words = { ...(await load("config.js")), ...(await load("config-workflow.js")) };
});

// what the owner says the fourteen tables and views are, in the dialog's order: name, rows, and the
// name of the file that holds them in a zip
const expected = JSON.parse(fs.readFileSync(fixturePath("expected/export.json"), "utf8")).tables.map((table) => ({
    name: table.name,
    kind: table.kind,
    rows: table.rows,
    file: path.posix.basename(table.expected_csv),
}));

// A course database that is not the default one, and the exercise sets the page can open, taken from
// what the site ships: no test assumes which database is the default, how many sets there are or
// what their ids are. A set the page can open is one whose course database ships too (a set that
// names another is listed by the exercise menu, and cannot be opened). A test that needs one that is
// not there skips itself.
const OTHER_DATASET = realManifest().datasets.find((entry) => entry.id !== DEFAULT_DATASET.id);
const SETS = openableSets();
const SET = SETS[0];
const OTHER_SET = SETS.find((set) => set.id !== SET?.id);

// ---- small helpers ----------------------------------------------------------------------------------

// how often the page asked for the zip tool
function countZipTool(page) {
    const seen = [];
    page.on("request", (request) => {
        if (new URL(request.url()).pathname.endsWith(`/vendor/${ZIP_TOOL}`)) {
            seen.push(request.url());
        }
    });
    return () => seen.length;
}

// a view that counts its two rows and then fails when the first is read: the engine's integer overflow
const BAD_VIEW = "CREATE VIEW bad AS SELECT abs(-9223372036854775807 - 1) AS x UNION ALL SELECT 1;";

// the toast on screen says `message`, in the tone of a "note" (nothing was done), "info" (something
// was) or "problem": the class of the toast card
async function expectTone(app, message, tone) {
    await expect(app.toast).toContainText(message);
    await expect(app.toast.locator(".toast")).toHaveClass(new RegExp(`^toast toast--${tone}$`));
}

// what a student's hand cannot reach while a dialog is modal, done from script: press a menu's
// button and then one of its entries
const chooseFromMenu = (page, button, entry) =>
    page.evaluate(
        ([buttonId, entryId]) => {
            document.querySelector(buttonId).click();
            document.querySelector(entryId).click();
        },
        [button, entry]
    );

// holdExport starts an export of two tables and holds it: two tables need the zip tool, and its
// request waits on a gate. The export is running then, with the dialog showing "Loading the zip
// tool…". Which two: `names`, or "basic" and "dates_iso" of the edge-case database, or the first two
// that can be ticked of another database. With {open: false} the dialog is open already. Returns
// {open, requests, names}.
async function holdExport(page, app, names = null, { open = true } = {}) {
    const held = await holdVendor(page, ZIP_TOOL);
    if (open) {
        await app.openTables();
    }
    await app.waitCounted();
    const rows = (await app.tablesRows()).filter((row) => row.tickable);
    const chosen = names ?? (rows.some((row) => row.name === "basic") ? ["basic", "dates_iso"] : rows.slice(0, 2).map((row) => row.name));
    expect(chosen).toHaveLength(2);
    await app.tickTables(chosen);
    await expect(app.tablesSubmit).toHaveAttribute("aria-disabled", "false");
    await app.tablesSubmit.click();
    await expect(app.tablesProgress).toBeVisible();
    await expect(app.tablesDialog.locator("#export-tables-progress-title")).toHaveText(words.EXPORT_TABLES_PROGRESS_LIBRARY);
    await expect.poll(() => held.requests()).toBe(1);
    return { ...held, names: chosen };
}

// the zip tool comes: the held export ends with its file, which holds the two tables (and the
// page takes a Run again)
async function endHeld(app, held) {
    const file = await app.download(async () => held.open());
    expect(file.name).toMatch(/-tables\.zip$/);
    expect(readZip(file.buffer).map((entry) => entry.name)).toEqual(held.names.map((name) => `${name}.csv`));
    await expect(app.tablesDialog).toBeHidden();
    expect(await app.query("SELECT 1 AS one")).toEqual({ columns: ["one"], rows: [["1"]] });
    return file;
}

// the export is still running, and is the one that was started: the progress is on screen and the
// zip tool was asked for once
async function expectStillHeld(app, held) {
    await expect(app.tablesDialog).toBeVisible();
    await expect(app.tablesProgress).toBeVisible();
    await expect(app.tablesDialog.locator("#export-tables-progress-title")).toHaveText(words.EXPORT_TABLES_PROGRESS_LIBRARY);
    expect(held.requests()).toBe(1);
}

// the entries of a menu that are about the export: [{id, label}]
const entriesOf = (menu, prefix) =>
    menu.evaluate(
        (node, start) =>
            [...node.querySelectorAll('[role="menuitem"]')]
                .filter((item) => item.id.startsWith(start))
                .map((item) => ({
                    id: item.id,
                    label: item.querySelector(".menu-item-label")?.textContent ?? null,
                    description: item.querySelector(".menu-item-description")?.textContent ?? null,
                })),
        prefix
    );

// the glyph a menu entry draws: the sprite symbol its svg uses
const iconOf = (item) => item.locator("svg use").first().getAttribute("href");

// ---- the file and the zip -------------------------------------------------------------------------

test.describe("what an export saves", () => {
    test("the fixture has the fourteen tables and views, in SQL's order, and the owner's files for them", async () => {
        expect(expected.map((table) => table.name)).toEqual([
            "Order Details",
            "basic",
            "big_2000",
            "con",
            "dates_iso",
            "empty_table",
            "mixed_types",
            "monthly_revenue_by_region_and_channel_2024",
            "number_edge",
            "order",
            "sales/2024",
            "sales_2024",
            "text_edge",
            "v_basic_summary",
        ]);
        for (const table of expected) {
            expect(fs.existsSync(fixturePath(`export/expected_csv/${table.file}`)), table.file).toBe(true);
        }
    });

    test("one table (basic) is saved alone as basic.csv, with the bytes of the expected file", async ({ app }) => {
        await openEdgeCases(app);
        const file = await app.exportTables(["basic"]);
        expect(file.name).toBe("basic.csv");
        expect(file.buffer.equals(expectedBytes("basic.csv"))).toBe(true);
        // a toast says it, and the dialog has closed
        await expectTone(app, words.exportedTablesMessage("basic.csv", { rows: 5 }), "info");
        await expect(app.tablesDialog).toBeHidden();
    });

    test("all fourteen are saved as export_edge_cases-tables.zip: fourteen entries, the expected names in order, the bytes of the expected files", async ({ app }) => {
        test.slow();
        await openEdgeCases(app);
        const file = await app.exportTables("all");
        expect(file.name).toBe("export_edge_cases-tables.zip");
        const entries = readZip(file.buffer);
        expect(entries.map((entry) => entry.name)).toEqual(expected.map((table) => table.file));
        // (sales/2024 and sales_2024 both are sales_2024: the second takes _2)
        expect(entries.map((entry) => entry.name)).toContain("sales_2024_2.csv");
        for (const entry of entries) {
            expect(entry.bytes.equals(expectedBytes(entry.name)), entry.name).toBe(true);
        }
        await expect(app.toast).toContainText(words.exportedTablesMessage(file.name, { tables: 14 }));
        // (mixed_types holds a BLOB, so the dialog stays, with its note)
        await expect(app.tablesNote).toHaveText(words.exportTablesBlobNote(file.name, ["mixed_types"]));
        await app.tablesCancel.click();
        await expect(app.tablesDialog).toBeHidden();
    });

    test("the browser is handed the file with its type: text/csv for one table, application/zip for two", async ({ page, app }) => {
        await openEdgeCases(app);
        // what the page gives the browser to save: the type of each Blob that is made into an address
        await page.evaluate(() => {
            const original = URL.createObjectURL;
            window.__types = [];
            URL.createObjectURL = function (blob) {
                window.__types.push(blob.type);
                return original.call(this, blob);
            };
        });
        await app.exportTables(["basic"]);
        expect(await page.evaluate(() => window.__types), "type of the Blob of one table").toEqual([words.EXPORT_CSV_TYPE]);
        await app.exportTables(["basic", "dates_iso"]);
        expect(await page.evaluate(() => window.__types), "types of the Blobs of one table, then two").toEqual([words.EXPORT_CSV_TYPE, words.EXPORT_ZIP_TYPE]);
    });
});

// ---- the evidence log ------------------------------------------------------------------------------

test.describe("each export that saved a file is one event of the evidence log", () => {
    test("a file: its name and size, then the table and the rows that were written", async ({ page, app }) => {
        await openEdgeCases(app);
        expect(await eventsOfOpen(page)).toEqual([]);
        const file = await app.exportTables(["basic"]);
        const events = await eventsOfOpen(page);
        expect(events).toHaveLength(1);
        expect(events[0].kind).toBe("export");
        expect(events[0].lines).toEqual([words.exportEventFileLine("basic.csv", file.buffer.length), words.exportEventTableLine("basic", 5)]);
        expect(events[0].lines).toEqual([`file: basic.csv, ${file.buffer.length} bytes`, "table: basic, 5 rows"]);
    });

    test("a zip: its name and size, then each table with its rows and the name of its entry, in the dialog's order", async ({ page, app }) => {
        test.slow();
        await openEdgeCases(app);
        const file = await app.exportTables("all");
        const events = await eventsOfOpen(page);
        expect(events).toHaveLength(1);
        expect(events[0].kind).toBe("export");
        expect(events[0].lines).toEqual([
            `file: export_edge_cases-tables.zip, ${file.buffer.length} bytes`,
            ...expected.map((table) => `table: ${table.name}, ${table.rows} rows, ${table.file}`),
        ]);
        expect(events[0].lines).toHaveLength(15);
        expect(events[0].lines[1]).toBe("table: Order Details, 2 rows, Order_Details.csv");
    });

    test("two exports, two events, in the order they were made", async ({ page, app }) => {
        await openEdgeCases(app);
        await app.exportTables(["basic"]);
        await app.exportTables(["dates_iso", "empty_table"]);
        const events = await eventsOfOpen(page);
        expect(events.map((event) => event.lines[0].replace(/, \d+ bytes$/, ""))).toEqual(["file: basic.csv", "file: export_edge_cases-tables.zip"]);
        const rowsOf = (name) => expected.find((table) => table.name === name).rows;
        expect(events[1].lines.slice(1)).toEqual([`table: dates_iso, ${rowsOf("dates_iso")} rows, dates_iso.csv`, `table: empty_table, ${rowsOf("empty_table")} rows, empty_table.csv`]);
    });

    test("the rows written are the ones recorded, not the count shown before: a view that gives other rows than it counted", async ({ page, app }) => {
        await openEdgeCases(app);
        // a view that counts 3 rows and then gives 4: the count reads the view, and the export reads it again
        await app.run("CREATE TABLE ticks (n INTEGER); INSERT INTO ticks VALUES (1), (2), (3); CREATE VIEW v_ticks AS SELECT n FROM ticks;");
        await app.openTables();
        await app.waitCounted();
        await app.tickTables(["v_ticks"]);
        // (the student's own change, made between the count and the export, from script: the dialog is modal)
        await page.evaluate(async () => {
            window.app.database.db.exec("INSERT INTO ticks VALUES (4)");
        });
        const file = await app.download(() => app.tablesSubmit.click());
        expect(file.text).toBe("\uFEFFn\r\n1\r\n2\r\n3\r\n4\r\n");
        const events = await eventsOfOpen(page);
        expect(events[0].lines).toEqual([words.exportEventFileLine("v_ticks.csv", file.buffer.length), words.exportEventTableLine("v_ticks", 4)]);
        await expect(app.toast).toContainText(words.exportedTablesMessage("v_ticks.csv", { rows: 4 }));
    });

    test("it sits among the queries of the log where it happened: after the query before it, before the query after it", async ({ page, app }) => {
        await openEdgeCases(app);
        await app.run("SELECT 111 AS before_the_export;");
        const file = await app.exportTables(["basic"]);
        await app.run("SELECT 222 AS after_the_export;");
        const evidence = await app.exportEvidence();
        const text = evidence.text;
        const at = (needle) => text.indexOf(needle);
        expect(at("before_the_export"), "the first query").toBeGreaterThan(-1);
        expect(at("event: export"), "the event").toBeGreaterThan(at("before_the_export"));
        expect(at("after_the_export"), "the second query").toBeGreaterThan(at("event: export"));
        // the event's own lines, as the file holds them, one event and no other
        expect(text.match(/event: export/g)).toHaveLength(1);
        expect(text).toContain(`${words.exportEventFileLine("basic.csv", file.buffer.length)}\n${words.exportEventTableLine("basic", 5)}\n`);
        // the sequence numbers run through the queries and the event as one timeline: 1, 2, 3
        const headers = [...text.matchAll(/^\[(\d+)\] \S+ · (.*)$/gm)].map((match) => [Number(match[1]), match[2].split(/ ·/)[0]]);
        expect(headers.map(([n]) => n)).toEqual([1, 2, 3]);
        expect(headers[1][1]).toBe("event: export");
    });

    test("the evidence file that has it verifies as VALID, with its two queries and its one event", async ({ app }) => {
        const { verifyEvidence } = await load("evidence.js");
        await openEdgeCases(app);
        await app.run("SELECT 111 AS before_the_export;");
        await app.exportTables(["basic", "dates_iso"]);
        await app.run("SELECT 222 AS after_the_export;");
        const evidence = await app.exportEvidence("U2034567");
        expect(await verifyEvidence(evidence.text)).toMatchObject({ status: "valid", student: "U2034567", queries: 2, events: 1 });
    });

    test("a log with an export is written as a version 2 file, and one without is still version 1", async ({ app }) => {
        await openEdgeCases(app);
        await app.run("SELECT 1 AS one;");
        const plain = await app.exportEvidence();
        await app.exportTables(["basic"]);
        const withEvent = await app.exportEvidence();
        expect(plain.text.split("\n")[0].endsWith(words.EVIDENCE_TITLE_SUFFIX)).toBe(true);
        expect(plain.text).not.toContain(`${words.EVIDENCE_EVENT_WORD} `);
        expect(withEvent.text.split("\n")[0].endsWith(words.EVIDENCE_TITLE_SUFFIX_V2)).toBe(true);
        expect(withEvent.text).toContain(`${words.EVIDENCE_EVENT_WORD} export`);
    });
});

// ---- the flag ----------------------------------------------------------------------------------------

test.describe("the flag off: the page is as it was", () => {
    test("with the flag off neither menu has the entry, and the dialog is not in the page", async ({ page, app, net }) => {
        for (const address of [`./?${flagState()}`, `./?${flagState("import")}`]) {
            await app.open(address);
            await expect(page.locator("#export-tables")).toHaveCount(0);
            await expect(page.locator("#more-export-tables")).toHaveCount(0);
            await expect(page.locator("#export-tables-dialog")).toHaveCount(0);
            await app.openExportMenu();
            await expect(app.exportMenu.getByRole("menuitem")).toHaveCount(3);
            await page.keyboard.press("Escape");
            // and the page asked for no zip tool
            expect(await page.evaluate(() => typeof globalThis.fflate)).toBe("undefined");
        }
        expect(net.paths.filter((file) => /fflate/.test(file))).toEqual([]);
    });

    test("the Export menu and the More menu keep their three entries, in their order, with their texts", async ({ page, app }) => {
        const three = [
            { id: "export-db", label: words.EXPORT_DATABASE_TEXT },
            { id: "export-csv", label: words.EXPORT_RESULTS_TEXT },
            { id: "export-evidence", label: words.EXPORT_EVIDENCE_TEXT },
        ];
        for (const address of [`./?${flagState()}`, `./?${flagState("import")}`]) {
            await app.open(address);
            await app.openExportMenu();
            const items = await entriesOf(app.exportMenu, "export-");
            expect(items.map(({ id, label }) => ({ id, label })), address).toEqual(three);
            await page.keyboard.press("Escape");
            const more = await entriesOf(app.moreMenu, "more-export-");
            expect(more.map(({ id, label }) => ({ id, label })), address).toEqual(three.map((item) => ({ ...item, id: `more-${item.id}` })));
        }
    });

    test("on a phone the More menu keeps its three entries too, and no dialog is built", async ({ page, app }) => {
        await page.setViewportSize({ width: 390, height: 844 });
        await app.open(`./?${flagState()}`);
        expect(await app.isPhone()).toBe(true);
        await app.openMore();
        const ids = await app.moreMenu.getByRole("menuitem").evaluateAll((nodes) => nodes.map((node) => node.id));
        expect(ids.slice(0, 4)).toEqual(["more-copy-link", "more-export-db", "more-export-csv", "more-export-evidence"]);
        expect(ids).not.toContain("more-export-tables");
        await expect(page.locator("#export-tables-dialog")).toHaveCount(0);
    });

    test("with the flag off the page makes no request that it did not make before: the same files as with a flag nothing reads", async ({ browser, baseURL }) => {
        const requested = async (address) => {
            const context = await browser.newContext({ baseURL });
            try {
                const page = await context.newPage();
                const paths = [];
                page.on("request", (request) => paths.push(new URL(request.url()).pathname));
                await page.goto(address);
                await expect(page.locator("#results-pane")).not.toHaveAttribute("data-state", "loading");
                await page.waitForLoadState("networkidle");
                // a visit to the Export menu and the database dialog, the places an export could be asked for
                await page.locator("#export-button").click();
                await page.locator("#export-db").click();
                await expect(page.locator("#export-dialog")).toBeVisible();
                return [...new Set(paths)].sort();
            } finally {
                await context.close();
            }
        };
        const off = await requested(`./?${flagState()}`);
        expect(await requested(`./?${flagState("excel-import")}`)).toEqual(off);
        expect(off.filter((file) => /fflate/.test(file))).toEqual([]);
    });
});

test.describe("the page as it ships", () => {
    test("the Export menu and the More menu have the entry right after the database's, the dialog is in the page, and the chooser takes several files", async ({ page, app, net }) => {
        await app.open();
        await expect(page.locator("#export-tables-dialog")).toHaveCount(1);
        await app.openExportMenu();
        const items = await app.exportMenu.getByRole("menuitem").evaluateAll((nodes) => nodes.map((node) => node.id));
        expect(items).toEqual(["export-db", "export-tables", "export-csv", "export-evidence"]);
        const entries = await entriesOf(app.exportMenu, "export-");
        expect(entries[1]).toEqual({ id: "export-tables", label: words.EXPORT_TABLES_MENU_TEXT, description: words.EXPORT_TABLES_MENU_DESCRIPTION });
        await page.keyboard.press("Escape");
        const more = await entriesOf(app.moreMenu, "more-export-");
        expect(more.map(({ id }) => id)).toEqual(["more-export-db", "more-export-tables", "more-export-csv", "more-export-evidence"]);
        expect(await page.locator("#open-file-input").evaluate((input) => input.multiple)).toBe(true);
        // and no zip tool is asked for until a zip is made
        expect(await page.evaluate(() => typeof globalThis.fflate)).toBe("undefined");
        expect(net.paths.filter((file) => /fflate/.test(file))).toEqual([]);
    });

    test("on a phone the More menu has the entry too, and the dialog opens from it", async ({ page, app }) => {
        await page.setViewportSize({ width: 390, height: 844 });
        await app.open();
        expect(await app.isPhone()).toBe(true);
        await app.openMore();
        const ids = await app.moreMenu.getByRole("menuitem").evaluateAll((nodes) => nodes.map((node) => node.id));
        expect(ids.slice(0, 5)).toEqual(["more-copy-link", "more-export-db", "more-export-tables", "more-export-csv", "more-export-evidence"]);
        await app.moreTablesItem.click();
        await expect(app.tablesDialog).toBeVisible();
        await app.tablesCancel.click();
        await expect(app.tablesDialog).toBeHidden();
    });

    test("a minus before the name in the address switches the export off for that visit, and the page opened without it has the export again", async ({ page, app }) => {
        await app.open(`./?${words.PREVIEW_PARAM}=-export`);
        await expect(page.locator("#export-tables")).toHaveCount(0);
        await expect(page.locator("#more-export-tables")).toHaveCount(0);
        await expect(page.locator("#export-tables-dialog")).toHaveCount(0);
        await app.openExportMenu();
        await expect(app.exportMenu.getByRole("menuitem")).toHaveCount(3);
        await page.keyboard.press("Escape");
        // (the minus switched off the export and nothing else: the import is still on)
        expect(await page.locator("#open-file-input").evaluate((input) => input.multiple)).toBe(true);
        await app.open();
        await expect(page.locator("#export-tables-dialog")).toHaveCount(1);
    });
});

test.describe("the flag on", () => {
    test("the Export menu has the entry right after the database's, with the config's texts, and it opens the dialog", async ({ page, app }) => {
        await openEdgeCases(app);
        await app.openExportMenu();
        const items = await app.exportMenu.getByRole("menuitem").evaluateAll((nodes) => nodes.map((node) => node.id));
        expect(items).toEqual(["export-db", "export-tables", "export-csv", "export-evidence"]);
        const entries = await entriesOf(app.exportMenu, "export-");
        expect(entries[1]).toEqual({ id: "export-tables", label: words.EXPORT_TABLES_MENU_TEXT, description: words.EXPORT_TABLES_MENU_DESCRIPTION });
        // (the others are as they were)
        expect(entries.map((entry) => entry.label)).toEqual([words.EXPORT_DATABASE_TEXT, words.EXPORT_TABLES_MENU_TEXT, words.EXPORT_RESULTS_TEXT, words.EXPORT_EVIDENCE_TEXT]);
        // the entry shows the sheet, and the database's entry its own glyph
        expect(await iconOf(app.exportMenu.locator("#export-tables"))).toBe("#icon-sheet");
        expect(await iconOf(app.exportMenu.locator("#export-db"))).toBe("#icon-database");
        await app.tablesItem.click();
        await expect(app.tablesDialog).toBeVisible();
        await expect(app.tablesDialog.getByRole("heading", { name: words.EXPORT_TABLES_TITLE })).toBeVisible();
        // the list is the fourteen, and the first tick box has the focus
        await app.waitCounted();
        expect((await app.tablesRows()).map((row) => row.name)).toEqual(expected.map((table) => table.name));
        await expect(app.tablesAll).toBeFocused();
        await app.tablesCancel.click();
        await expect(app.tablesDialog).toBeHidden();
        // the focus is back where it was: on the Export button
        await expect(app.exportMenuButton).toBeFocused();
        expect(await page.locator("#export-tables-dialog").count()).toBe(1);
    });

    test("the More menu of a phone has the entry right after the database's, in the Export group, and opens the dialog", async ({ page, app }) => {
        await page.setViewportSize({ width: 390, height: 844 });
        await openEdgeCases(app);
        expect(await app.isPhone()).toBe(true);
        await app.openMore();
        const items = await app.moreMenu.getByRole("menuitem").evaluateAll((nodes) => nodes.map((node) => node.id));
        expect(items.slice(0, 5)).toEqual(["more-copy-link", "more-export-db", "more-export-tables", "more-export-csv", "more-export-evidence"]);
        const entries = await entriesOf(app.moreMenu, "more-export-");
        expect(entries[1]).toEqual({ id: "more-export-tables", label: words.EXPORT_TABLES_MENU_TEXT, description: words.EXPORT_TABLES_MENU_DESCRIPTION });
        // (it is in the group that the heading "Export" names)
        expect(await app.moreTablesItem.evaluate((node) => node.closest('[role="group"]').querySelector(".menu-heading").textContent)).toBe(words.MORE_EXPORT_LABEL);
        // it shows the sheet, and the database's entry its own glyph
        expect(await iconOf(app.moreMenu.locator("#more-export-tables"))).toBe("#icon-sheet");
        expect(await iconOf(app.moreMenu.locator("#more-export-db"))).toBe("#icon-database");
        await expect(app.moreTablesItem).toBeVisible();
        await app.moreTablesItem.click();
        await expect(app.tablesDialog).toBeVisible();
        await app.tablesCancel.click();
        await expect(app.tablesDialog).toBeHidden();
        await expect(app.moreButton).toBeFocused();
    });

    test("axe finds no serious or critical violation in the Export menu, nor in the More menu of a phone, with the entry in them, in light and dark", async ({ page, app }) => {
        // (What axe is asked, and how, is what the dialog's axe tests ask. One thing it leaves undecided in
        // these menus is the colour of the entries' words: it answers that it cannot tell what is behind them.
        // So the words of the entry are measured here, in each theme, against the menu behind them and, with
        // the pointer on the entry, against the entry's own fill: 4.5 to 1, the least that small text may have.)
        test.slow();
        const luminance = ([r, g, b]) => {
            const f = (c) => ((c /= 255) <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
            return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
        };
        const contrast = (a, b) => {
            const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
            return (hi + 0.05) / (lo + 0.05);
        };
        const rgb = (text) => text.match(/\d+(\.\d+)?/g).slice(0, 3).map(Number);
        const expectReadable = async (item, where) => {
            const colours = await item.evaluate((node) => {
                // the first thing behind the words that has a colour of its own
                const ground = (start) => {
                    for (let at = start; at; at = at.parentElement) {
                        const fill = getComputedStyle(at).backgroundColor;
                        if (fill !== "transparent" && !/^rgba\(.*,\s*0\)$/.test(fill)) {
                            return fill;
                        }
                    }
                    return null;
                };
                return {
                    label: getComputedStyle(node.querySelector(".menu-item-label")).color,
                    description: getComputedStyle(node.querySelector(".menu-item-description")).color,
                    ground: ground(node),
                };
            });
            expect(colours.ground, `${where}: what is behind the entry's words has a colour`).not.toBeNull();
            for (const part of ["label", "description"]) {
                expect(contrast(rgb(colours[part]), rgb(colours.ground)), `${where}: the entry's ${part}, ${colours[part]} on ${colours.ground}`).toBeGreaterThanOrEqual(4.5);
            }
        };
        const seriousIn = async (selector) => {
            await page.evaluate(() => document.fonts.ready);
            const results = await new AxeBuilder({ page }).include(selector).analyze();
            // (the menu was looked at: some rules ran and passed)
            expect(results.passes.length, `the rules that passed in ${selector}`).toBeGreaterThan(5);
            return results.violations
                .filter((v) => v.impact === "serious" || v.impact === "critical")
                .map((v) => `${v.id} (${v.impact}): ${v.help} at ${v.nodes.slice(0, 4).map((n) => n.target.join(" ")).join(" | ")}`);
        };
        // the entry under the pointer: its fill is its own then
        const pointAt = async (item) => {
            await item.hover();
            await expect.poll(() => item.evaluate((node) => node.matches(":hover"))).toBe(true);
        };
        for (const theme of ["light", "dark"]) {
            await page.emulateMedia({ colorScheme: theme, reducedMotion: "reduce" });
            await page.setViewportSize({ width: 1366, height: 768 });
            await openEdgeCases(app);
            // (the page is drawn in the theme that is named)
            expect(await page.evaluate(() => matchMedia("(prefers-color-scheme: dark)").matches), `the page is in the ${theme} theme`).toBe(theme === "dark");
            await app.openExportMenu();
            await expect(app.tablesItem, `the entry in the Export menu, ${theme}`).toBeVisible();
            expect(await seriousIn("#export-menu"), `the Export menu, ${theme}`).toEqual([]);
            await expectReadable(app.tablesItem, `the Export menu, ${theme}`);
            await pointAt(app.tablesItem);
            await expectReadable(app.tablesItem, `the Export menu, ${theme}, under the pointer`);
            await page.keyboard.press("Escape");
            await expect(app.exportMenu).toBeHidden();
            await page.setViewportSize({ width: 390, height: 844 });
            expect(await app.isPhone()).toBe(true);
            await app.openMore();
            await expect(app.moreTablesItem, `the entry in the More menu, ${theme}`).toBeVisible();
            expect(await seriousIn("#more-menu"), `the More menu, ${theme}`).toEqual([]);
            await expectReadable(app.moreTablesItem, `the More menu, ${theme}`);
            await pointAt(app.moreTablesItem);
            await expectReadable(app.moreTablesItem, `the More menu, ${theme}, under the pointer`);
            await page.keyboard.press("Escape");
            await expect(app.moreMenu).toBeHidden();
        }
    });

    test("nothing is asked of the page by the flag alone: no zip tool, no storage key, until Export is pressed with two tables", async ({ page, app, net }) => {
        await app.open(EXPORT_URL);
        const keys = await page.evaluate(() => Object.keys(localStorage).sort());
        expect(keys.filter((key) => /preview|export/i.test(key))).toEqual([]);
        expect(net.paths.filter((file) => /fflate/.test(file))).toEqual([]);
    });
});

test.describe("export and import, each alone and both", () => {
    test("export on and import off: the entry is there, the file chooser takes one file, and a CSV file is tried as a database", async ({ page, app }) => {
        await app.open(EXPORT_URL);
        await expect(page.locator("#export-tables-dialog")).toHaveCount(1);
        expect(await page.locator("#open-file-input").evaluate((input) => input.multiple)).toBe(false);
        await app.openExportMenu();
        await expect(app.tablesItem).toHaveCount(1);
        await page.keyboard.press("Escape");
        await app.chooseFiles(fixturePath("messy_sales.csv"));
        await expect(app.errorBand).toContainText(/not a database/i);
        await expect(page.locator("#import-dialog[open]")).toHaveCount(0);
        // and the export still works on the database that stayed open
        await app.openTables();
        await app.waitCounted();
        await app.tickTables([(await app.tablesRows())[0].name]);
        const file = await app.download(() => app.tablesSubmit.click());
        expect(file.name).toMatch(/\.csv$/);
    });

    test("import on and export off: the file chooser takes several files and a CSV opens the import's dialog, and there is no entry and no export dialog", async ({ page, app }) => {
        await app.open(`./?${flagState("import")}`);
        expect(await page.locator("#open-file-input").evaluate((input) => input.multiple)).toBe(true);
        await expect(page.locator("#export-tables-dialog")).toHaveCount(0);
        await expect(page.locator("#export-tables")).toHaveCount(0);
        await expect(page.locator("#more-export-tables")).toHaveCount(0);
        await app.chooseFiles(csv("people.csv"));
        await expect(app.importDialog).toBeVisible();
        await expect(app.importTabs).toHaveText(["people.csv"]);
        await app.importCancel.click();
        await expect(app.importDialog).toBeHidden();
        await app.openExportMenu();
        await expect(app.exportMenu.getByRole("menuitem")).toHaveCount(3);
    });

    test("both on: the entry is there and so is the import, and each opens its own dialog and no other", async ({ page, app }) => {
        await app.open(BOTH_URL);
        expect(await page.locator("#open-file-input").evaluate((input) => input.multiple)).toBe(true);
        await app.chooseFiles(csv("people.csv"));
        await expect(app.importDialog).toBeVisible();
        await expect(app.tablesDialog).toBeHidden();
        await app.importCancel.click();
        await expect(app.importDialog).toBeHidden();
        await app.openTables();
        await expect(app.tablesDialog).toBeVisible();
        await expect(app.importDialog).toBeHidden();
        await app.tablesCancel.click();
        await expect(app.tablesDialog).toBeHidden();
    });
});

test.describe("the flag is read once, when the page loads", () => {
    // what shows that the flag is still on: the entry is in the Export menu, the address holds no
    // parameter, and the dialog opens with the tables of the database that is open
    async function expectFlagOn(page, app) {
        expect(await page.evaluate(() => location.search)).not.toContain("preview");
        await app.openExportMenu();
        await expect(app.tablesItem).toHaveCount(1);
        await page.keyboard.press("Escape");
        await app.openTables();
        await app.waitCounted();
        expect((await app.tablesRows()).length).toBeGreaterThan(0);
        await app.tablesCancel.click();
        await expect(app.tablesDialog).toBeHidden();
    }

    test("it stays on after another course database is opened from the switcher", async ({ page, app }) => {
        test.skip(!OTHER_DATASET, "only one course database ships");
        await app.open(EXPORT_URL);
        await app.pickDatabaseById(OTHER_DATASET.id);
        await app.expectPicked(OTHER_DATASET.id, OTHER_DATASET.name);
        await app.waitReady();
        await expect.poll(() => page.url()).toContain(`db=${OTHER_DATASET.id}`);
        await expectFlagOn(page, app);
    });

    test("it stays on after a file is opened", async ({ page, app }) => {
        await app.open(EXPORT_URL);
        await app.upload(SAMPLE_FILE);
        await expect.poll(() => page.url()).not.toContain("preview");
        await expectFlagOn(page, app);
    });

    test("it stays on after an exercise set is opened from the picker, and after an exercise is opened and the set closed", async ({ page, app }) => {
        test.skip(!SET || SET.exercises.length < 2, "no exercise set that the page can open has two exercises");
        // (the set's own database is open first, so that opening the set does not load another)
        await app.open(`./?db=${SET.dataset}&${flagState("export")}`);
        await app.pickSet(SET.title);
        await expect(app.exercisePanel).toBeVisible();
        await app.waitReady();
        await expect.poll(() => page.url()).toContain(`set=${SET.id}`);
        await expectFlagOn(page, app);
        await app.exerciseButton(2).click();
        await expect.poll(() => page.url()).toContain("ex=");
        await expectFlagOn(page, app);
        await app.pickSet("None");
        await app.waitReady();
        await expect.poll(() => page.url()).not.toContain("set=");
        await expectFlagOn(page, app);
    });
});

// ---- the toasts ---------------------------------------------------------------------------------------

test.describe("what the page says when a file is saved, and when an export is cancelled", () => {
    test("a file: the rows it holds, one row and none and several", async ({ page, app }) => {
        await openEdgeCases(app);
        await app.run("CREATE TABLE one_row (n INTEGER); INSERT INTO one_row VALUES (7);");
        await app.recordToasts();
        const cases = [
            ["one_row", 1],
            ["empty_table", 0],
            ["basic", 5],
        ];
        for (const [table, rows] of cases) {
            const text = words.exportedTablesMessage(`${table}.csv`, { rows });
            await app.exportTables([table]);
            await expect(app.toast).toContainText(text);
            await expect.poll(async () => (await app.toasts()).at(-1)).toBe(text);
        }
        // (the texts differ where the count does: "1 row", "0 rows", "5 rows")
        expect(new Set((await app.toasts()).map((text) => text.replace(/^Exported \S+ /, ""))).size).toBe(3);
        expect(await app.toasts()).toEqual([
            words.exportedTablesMessage("one_row.csv", { rows: 1 }),
            words.exportedTablesMessage("empty_table.csv", { rows: 0 }),
            words.exportedTablesMessage("basic.csv", { rows: 5 }),
        ]);
    });

    test("a zip: the tables it holds, as many as were ticked", async ({ page, app }) => {
        await openEdgeCases(app);
        await app.recordToasts();
        const file = await app.exportTables(["dates_iso", "empty_table"]);
        await expect.poll(() => app.toasts()).toEqual([words.exportedTablesMessage(file.name, { tables: 2 })]);
        expect(words.exportedTablesMessage(file.name, { tables: 2 })).toMatch(/with 2 tables$/);
    });

    test("Cancel: its words, said once the export has stopped, and no file", async ({ page, app }) => {
        await openEdgeCases(app);
        const downloads = recordDownloads(page);
        await app.recordToasts();
        const held = await holdExport(page, app);
        await app.tablesCancel.click();
        await expect(app.tablesDialog).toBeHidden();
        await app.expectToasts([words.EXPORT_TABLES_CANCELLED_MESSAGE]);
        await expectTone(app, words.EXPORT_TABLES_CANCELLED_MESSAGE, "note");
        held.open();
        await waitUntilIdle(app);
        expect(downloads).toEqual([]);
        // (a toast that says the export was cancelled says that nothing was saved)
        expect(words.EXPORT_TABLES_CANCELLED_MESSAGE).toMatch(/nothing was saved/);
    });
});

// ---- the end of an export that has something to add --------------------------------------------------

test.describe("a table that holds a BLOB", () => {
    test("the dialog stays, with one note that names the table and a Close button, and the file is saved all the same", async ({ app }) => {
        await openEdgeCases(app);
        const file = await app.exportTables(["mixed_types"]);
        expect(file.name).toBe("mixed_types.csv");
        expect(file.buffer.equals(expectedBytes("mixed_types.csv"))).toBe(true);
        await expect(app.tablesDialog).toBeVisible();
        await expect(app.tablesNote).toHaveText(words.exportTablesBlobNote("mixed_types.csv", ["mixed_types"]));
        await expect(app.tablesCancel).toHaveText(words.EXPORT_TABLES_CLOSE_TEXT);
        await expect(app.tablesCancel).toBeFocused();
        await expect(app.tablesSubmit).toBeHidden();
        await app.tablesCancel.click();
        await expect(app.tablesDialog).toBeHidden();
    });
});

// ---- an export that is held: what is refused meanwhile -----------------------------------------------

// What a student would try while an export runs, all done from inside the page, because the dialog
// is modal and the rest of the page does not take the mouse. Two tables need the zip tool, and its
// request is held: the export is running, and waits for it. Each test says what it tried, sees the
// export's own message, sees that nothing changed and that the export is still running, and ends
// the export with its file.
test.describe("while an export runs, what could change the database is refused with the export's own message", () => {
    test("Run, by its button and by Ctrl+Enter: nothing is run, nothing is logged, and the export goes on to its end", async ({ page, app }) => {
        await openEdgeCases(app);
        await app.editor.fill("SELECT 1 AS one;");
        await app.recordToasts();
        const key = await logKey(page);
        const paneBefore = await app.pane.getAttribute("data-state");
        const held = await holdExport(page, app);
        await page.evaluate(() => document.querySelector("#execute").click());
        await expect.poll(async () => (await app.toasts()).length).toBe(1);
        await expectTone(app, words.EXPORT_TABLES_BUSY_MESSAGE, "note");
        // (Ctrl+Enter in the editor: the editor is behind the modal dialog, so the key is sent to it from script)
        await app.editor.evaluate((node) => node.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", code: "Enter", keyCode: 13, ctrlKey: true, bubbles: true, cancelable: true })));
        await expect.poll(async () => (await app.toasts()).length).toBe(2);
        expect(await app.toasts()).toEqual([words.EXPORT_TABLES_BUSY_MESSAGE, words.EXPORT_TABLES_BUSY_MESSAGE]);
        await expect(app.pane).toHaveAttribute("data-state", paneBefore);
        expect(await app.readLog(key)).toBeNull();
        await expectStillHeld(app, held);
        // the zip tool arrives, and the export ends with its file and one event
        await endHeld(app, held);
        expect(await eventsOfOpen(page)).toHaveLength(1);
    });

    test("Check answer: nothing is checked, nothing is marked, and the export goes on", async ({ page, app }) => {
        test.skip(!SET, "no exercise set that the page can open ships");
        await page.goto(`./?set=${SET.id}&${flagState("export")}`);
        await expect(app.exercisePanel).toBeVisible();
        await app.waitReady();
        await app.editor.fill(SET.exercises[0].model_query);
        await app.recordToasts();
        const held = await holdExport(page, app);
        await page.evaluate(() => document.querySelector("#exercise-check").click());
        await app.expectToasts([words.EXPORT_TABLES_BUSY_MESSAGE]);
        await expect(app.feedback).toBeEmpty();
        await expect(app.progress).toHaveText(`0 of ${SET.exercises.length} complete`);
        const stored = await page.evaluate((key) => JSON.parse(localStorage.getItem(key) ?? "null"), progressKey(SET));
        expect(stored?.passed ?? {}).toEqual({});
        await expect(app.pane).not.toHaveAttribute("data-state", "result");
        await expectStillHeld(app, held);
        await endHeld(app, held);
        // and Check works again
        await app.checkButton.click();
        await expect(app.feedback).not.toBeEmpty();
    });

    test("the database export: its menu entry opens no dialog and saves nothing", async ({ page, app }) => {
        await openEdgeCases(app);
        await app.recordToasts();
        const downloads = recordDownloads(page);
        const held = await holdExport(page, app);
        await chooseFromMenu(page, "#export-button", "#export-db");
        await app.expectToasts([words.EXPORT_TABLES_BUSY_MESSAGE]);
        await expect(page.locator("#export-dialog[open]")).toHaveCount(0);
        expect(downloads).toEqual([]);
        await expectStillHeld(app, held);
        await endHeld(app, held);
        expect(downloads).toEqual(["export_edge_cases-tables.zip"]);
        // afterwards the database export is offered again
        await app.openExportMenu();
        await page.locator("#export-db").click();
        await expect(page.locator("#export-dialog")).toBeVisible();
        await expect(page.locator("#export-name")).toHaveValue("export_edge_cases.db");
    });

    test("the database export's dialog, opened before the export began: pressing Save saves nothing, renames nothing, and says why", async ({ page, app }) => {
        await openEdgeCases(app);
        await app.recordToasts();
        const downloads = recordDownloads(page);
        // the dialog of the database export is open (nothing runs), and an export begins above it
        await app.openExportMenu();
        await page.locator("#export-db").click();
        await expect(page.locator("#export-dialog")).toBeVisible();
        await page.locator("#export-name").fill("renamed.db");
        await chooseFromMenu(page, "#export-button", "#export-tables");
        await expect(app.tablesDialog).toBeVisible();
        const held = await holdExport(page, app, null, { open: false });
        // the older dialog is still open under the export's: its Save is pressed from script
        await page.evaluate(() => document.querySelector("#export-dialog button[type=submit]").click());
        await app.expectToasts([words.EXPORT_TABLES_BUSY_MESSAGE]);
        expect(downloads).toEqual([]);
        expect(await page.evaluate(() => window.app.database.name)).toBe("export_edge_cases.db");
        await expectStillHeld(app, held);
        await endHeld(app, held);
        expect(downloads).toEqual(["export_edge_cases-tables.zip"]);
    });

    test("picking another course database is refused, and the switcher shows what is open again", async ({ page, app }) => {
        test.skip(!OTHER_DATASET, "only one course database ships");
        await app.open(`./?db=${OTHER_DATASET.id}&${flagState("export")}`);
        await app.recordToasts();
        const labelBefore = await app.databaseLabel.textContent();
        const handle = await databaseHandle(page);
        const held = await holdExport(page, app);
        await page.evaluate((id) => {
            document.querySelector("#database-button").click();
            document.querySelector(`[data-dataset-id="${id}"]`).click();
        }, DEFAULT_DATASET.id);
        await app.expectToasts([words.EXPORT_TABLES_BUSY_MESSAGE]);
        expect(await isOpenDatabase(page, handle)).toBe(true);
        await expect(app.databaseLabel).toHaveText(labelBefore);
        await expect(app.databaseItem(OTHER_DATASET.id)).toHaveAttribute("aria-checked", "true");
        await expect(app.databaseItem(DEFAULT_DATASET.id)).toHaveAttribute("aria-checked", "false");
        await expect(page).toHaveURL(new RegExp(`db=${OTHER_DATASET.id}`));
        await expectStillHeld(app, held);
        await endHeld(app, held);
        expect(await isOpenDatabase(page, handle)).toBe(true);
    });

    test("Ctrl+O opens no file chooser, and says why in a toast", async ({ page, app }) => {
        await openEdgeCases(app);
        await app.recordToasts();
        let choosers = 0;
        page.on("filechooser", () => choosers++);
        const held = await holdExport(page, app);
        await page.keyboard.press("Control+o");
        await app.expectToasts([words.EXPORT_TABLES_BUSY_MESSAGE]);
        expect(choosers).toBe(0);
        await expectStillHeld(app, held);
        await endHeld(app, held);
        // (with nothing running and no dialog the same key does open the chooser: the count above is not always 0)
        await page.keyboard.press("Control+o");
        await expect.poll(() => choosers).toBe(1);
    });

    test("the switcher's \"Open a file…\" opens no file chooser, and says why in a toast", async ({ page, app }) => {
        await openEdgeCases(app);
        await app.recordToasts();
        let choosers = 0;
        page.on("filechooser", () => choosers++);
        const held = await holdExport(page, app);
        await chooseFromMenu(page, "#database-button", "#open-file");
        await app.expectToasts([words.EXPORT_TABLES_BUSY_MESSAGE]);
        expect(choosers).toBe(0);
        await expectStillHeld(app, held);
        await endHeld(app, held);
        await chooseFromMenu(page, "#database-button", "#open-file");
        await expect.poll(() => choosers).toBe(1);
    });

    test("Open from URL, by Ctrl+U and by the switcher's entry, opens no dialog, and says why in a toast", async ({ page, app }) => {
        await openEdgeCases(app);
        await app.recordToasts();
        const held = await holdExport(page, app);
        await page.keyboard.press("Control+u");
        await expect.poll(async () => (await app.toasts()).length).toBe(1);
        await chooseFromMenu(page, "#database-button", "#open-url");
        await expect.poll(async () => (await app.toasts()).length).toBe(2);
        expect(await app.toasts()).toEqual([words.EXPORT_TABLES_BUSY_MESSAGE, words.EXPORT_TABLES_BUSY_MESSAGE]);
        await expect(page.locator("#open-url-dialog[open]")).toHaveCount(0);
        await expectStillHeld(app, held);
        await endHeld(app, held);
        // with nothing running the same entry opens its dialog
        await chooseFromMenu(page, "#database-button", "#open-url");
        await expect(page.locator("#open-url-dialog")).toBeVisible();
    });

    test("opening and closing an exercise set are refused, and the set picker keeps the open set", async ({ page, app }) => {
        test.skip(!OTHER_SET, "only one exercise set that the page can open ships");
        await page.goto(`./?set=${SET.id}&${flagState("export")}`);
        await expect(app.exercisePanel).toBeVisible();
        await app.waitReady();
        await app.recordToasts();
        const pickerBefore = await app.setPicker.getAttribute("aria-label");
        const handle = await databaseHandle(page);
        const held = await holdExport(page, app);
        const labels = [OTHER_SET.title, "None"];
        for (const [n, label] of labels.entries()) {
            await page.evaluate((text) => {
                document.querySelector("#exercise-set-picker").click();
                const item = [...document.querySelectorAll('#exercise-set-menu [role="menuitemradio"]')].find((el) => el.textContent.trim() === text);
                item.click();
            }, label);
            await expect.poll(async () => (await app.toasts()).length).toBe(n + 1);
            await expect(app.setPicker).toHaveAttribute("aria-label", pickerBefore);
            await expect(page).toHaveURL(new RegExp(`set=${SET.id}`));
            await expect(app.exercisePanel).toBeVisible();
        }
        expect(await app.toasts()).toEqual([words.EXPORT_TABLES_BUSY_MESSAGE, words.EXPORT_TABLES_BUSY_MESSAGE]);
        expect(await isOpenDatabase(page, handle)).toBe(true);
        await expectStillHeld(app, held);
        await endHeld(app, held);
    });

    test("a database file that is chosen is refused, and is not opened", async ({ page, app }) => {
        await openEdgeCases(app);
        await app.recordToasts();
        const handle = await databaseHandle(page);
        const held = await holdExport(page, app);
        await app.chooseFiles(SAMPLE_FILE);
        // (the file is read first, as any file that is opened: the toast comes when it has been)
        await expect.poll(() => app.toasts()).toEqual([words.EXPORT_TABLES_BUSY_MESSAGE]);
        expect(await isOpenDatabase(page, handle)).toBe(true);
        await expect(app.databaseLabel).toHaveText("export_edge_cases.db");
        await expectStillHeld(app, held);
        await endHeld(app, held);
        expect(await isOpenDatabase(page, handle)).toBe(true);
    });

    test("files that are dropped are ignored, a database and CSV files alike (the drop is the import's: with it on, the page still refuses it)", async ({ page, app }) => {
        await openEdgeCases(app, BOTH_URL);
        await app.recordToasts();
        const handle = await databaseHandle(page);
        const held = await holdExport(page, app);
        const href = await page.evaluate(() => location.href);
        expect(await app.dropFiles(SAMPLE_FILE, { target: "#results-pane" })).toBe(true);
        expect(await app.dropFiles([csv("more.csv"), csv("again.csv")])).toBe(true);
        // (a drop is ignored, as it is under any dialog: it says nothing)
        await app.expectToasts([]);
        expect(await isOpenDatabase(page, handle)).toBe(true);
        expect(await page.evaluate(() => location.href)).toBe(href);
        await expect(page.locator("#import-dialog[open]")).toHaveCount(0);
        await expectStillHeld(app, held);
        await endHeld(app, held);
        expect(await isOpenDatabase(page, handle)).toBe(true);
    });

    test("files that are dropped in the moment after Cancel, while the export is still ending and no dialog is open, are ignored too", async ({ page, app }) => {
        await openEdgeCases(app, BOTH_URL);
        await app.recordToasts();
        const handle = await databaseHandle(page);
        // (the export looks at Cancel every 3 s here, not every 100 ms: see the test of the entry, below)
        await page.evaluate(() => {
            const original = window.setInterval;
            window.setInterval = (handler, ms, ...rest) => original(handler, ms === 100 ? 3000 : ms, ...rest);
        });
        const held = await holdExport(page, app);
        await app.tablesCancel.click();
        await expect(app.tablesDialog).toBeHidden();
        expect(await app.dropFiles([csv("more.csv"), csv("again.csv")], { target: "#results-pane" })).toBe(true);
        expect(await app.dropFiles(SAMPLE_FILE)).toBe(true);
        await page.waitForTimeout(300);
        await expect(page.locator("#import-dialog[open]")).toHaveCount(0);
        expect(await isOpenDatabase(page, handle)).toBe(true);
        // (nothing was said of the drop: the one toast is the export's, when it has seen Cancel)
        held.open();
        await waitUntilIdle(app);
        await app.expectToasts([words.EXPORT_TABLES_CANCELLED_MESSAGE]);
    });

    test("with the import on too, CSV files that are chosen are refused with the export's message, and no import begins", async ({ page, app }) => {
        await openEdgeCases(app, BOTH_URL);
        await app.recordToasts();
        const handle = await databaseHandle(page);
        const held = await holdExport(page, app);
        await app.chooseFiles([csv("later.csv", "x\n1\n"), csv("more.csv", "y\n2\n")]);
        // (a refusal is a note, as every other refusal of a long job is)
        await expectTone(app, words.EXPORT_TABLES_BUSY_MESSAGE, "note");
        await app.expectToasts([words.EXPORT_TABLES_BUSY_MESSAGE]);
        await expect(page.locator("#import-dialog[open]")).toHaveCount(0);
        // (the input is emptied, so that the same files can be chosen again afterwards)
        expect(await page.locator("#open-file-input").evaluate((input) => input.files.length)).toBe(0);
        expect(await isOpenDatabase(page, handle)).toBe(true);
        await expectStillHeld(app, held);
        await endHeld(app, held);
        // afterwards the same files are taken
        await app.chooseFiles([csv("later.csv", "x\n1\n"), csv("more.csv", "y\n2\n")]);
        await expect(app.importDialog).toBeVisible();
        await expect(app.importTabs).toHaveCount(2);
    });

    test("a second \"Tables as CSV…\" opens nothing and says why, and the first export is the one that goes on", async ({ page, app }) => {
        await openEdgeCases(app);
        await app.recordToasts();
        const held = await holdExport(page, app);
        await chooseFromMenu(page, "#export-button", "#export-tables");
        await app.expectToasts([words.EXPORT_TABLES_BUSY_MESSAGE]);
        await expectTone(app, words.EXPORT_TABLES_BUSY_MESSAGE, "note");
        await expect(page.locator("#export-tables-dialog")).toHaveCount(1);
        // the progress of the first is what is on screen: not a list, not a second run
        await expectStillHeld(app, held);
        await expect(app.tablesSubmit).toBeHidden();
        await endHeld(app, held);
        expect(await eventsOfOpen(page)).toHaveLength(1);
    });

    test("Back and Forward open nothing, put the address back, and say why", async ({ page, app }) => {
        test.skip(!OTHER_DATASET, "only one course database ships");
        await app.open(`./?db=${DEFAULT_DATASET.id}&${flagState("export")}`);
        // a history of the page's own: the default course database, the other one, the default one
        // again, and back to the other: an entry that the page itself made (it carries the name of
        // the database), with a Forward to give
        await app.pickDatabaseById(OTHER_DATASET.id);
        await expect(page).toHaveURL(new RegExp(`db=${OTHER_DATASET.id}`));
        await app.waitReady();
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
        const held = await holdExport(page, app);
        const href = await page.evaluate(() => location.href);
        // (the entry the page is on carries what the page gave it, the name of the database it
        // opened: the entry that is put back must carry it too)
        const state = await page.evaluate(() => history.state);
        expect(state, "the state of the entry before the refused Forward").not.toBeNull();
        await page.evaluate(() => history.forward());
        await expect.poll(async () => (await app.toasts()).length).toBeGreaterThan(0);
        await expectTone(app, words.EXPORT_TABLES_BUSY_MESSAGE, "note");
        await expect.poll(() => page.evaluate(() => location.href)).toBe(href);
        expect(await page.evaluate(() => history.state), "the state of the entry put back after the refused Forward").toEqual(state);
        // (the address is the same before the browser has gone back as after the page has put the
        // entry back: only the toast, which the page shows after it has put the entry back, says
        // that the refusal has run. The toast of the Forward is the first in the list)
        const toastsBefore = (await app.toasts()).length;
        expect(toastsBefore, "the toasts shown before the Back").toBeGreaterThan(0);
        await page.evaluate(() => history.back());
        await expect.poll(async () => (await app.toasts()).length, { message: "the refusal of the Back says why in a toast" }).toBeGreaterThan(toastsBefore);
        expect(await page.evaluate(() => location.href)).toBe(href);
        expect(await page.evaluate(() => history.state), "the state of the entry put back after the refused Back").toEqual(state);
        // nothing else happens after the refusal: the wait is only for that
        await page.waitForTimeout(300);
        expect((await app.toasts()).length, "the toasts shown after the refused Back").toBe(toastsBefore + 1);
        expect(await page.evaluate(() => location.href)).toBe(href);
        expect(await page.evaluate(() => history.state), "the state of the entry after the wait").toEqual(state);
        expect(await isOpenDatabase(page, handle)).toBe(true);
        await expect(app.databaseLabel).toHaveText(OTHER_DATASET.name);
        expect(new Set(await app.toasts())).toEqual(new Set([words.EXPORT_TABLES_BUSY_MESSAGE]));
        await expectStillHeld(app, held);
        await endHeld(app, held);
        expect(await isOpenDatabase(page, handle)).toBe(true);
    });
});

// ---- the other way round: no export where another long job or a load is in the way ------------------

test.describe("no export dialog opens while a database loads, an import runs or an earlier export is still ending", () => {
    test("while a database loads: the entry says so in a toast, and opens no dialog; once it has opened the entry works", async ({ page, app }) => {
        test.skip(!OTHER_DATASET, "only one course database ships");
        await app.open(EXPORT_URL);
        await app.recordToasts();
        const held = await holdDataset(page, OTHER_DATASET);
        await app.pickDatabaseById(OTHER_DATASET.id);
        await held.requested;
        await expect(app.pane).toHaveAttribute("data-state", "loading");
        await app.openExportMenu();
        await app.tablesItem.click();
        await expect.poll(() => app.toasts()).toContain(words.EXPORT_TABLES_LOADING_MESSAGE);
        await expect(page.locator("#export-tables-dialog[open]")).toHaveCount(0);
        held.release();
        await app.waitReady();
        await app.expectPicked(OTHER_DATASET.id, OTHER_DATASET.name);
        await app.openTables();
        await app.waitCounted();
        expect((await app.tablesRows()).length).toBeGreaterThan(0);
    });

    test("while an import runs: the entry says so with the import's message, and opens no dialog; afterwards it opens one for the new database", async ({ page, app }) => {
        await app.open(BOTH_URL);
        await app.recordToasts();
        const held = await holdImport(page, app);
        await chooseFromMenu(page, "#export-button", "#export-tables");
        await app.expectToasts([words.IMPORT_BUSY_MESSAGE]);
        await expect(page.locator("#export-tables-dialog[open]")).toHaveCount(0);
        await finishHeld(app, held);
        await app.openTables();
        await app.waitCounted();
        expect((await app.tablesRows()).map((row) => row.name)).toEqual(["people"]);
        // (one table: it is ticked at the start)
        await expect(app.tablesBox("people")).toBeChecked();
    });

    test("while an earlier export is still ending (it was cancelled, and has not yet seen it): the entry says that an export is running", async ({ page, app }) => {
        await openEdgeCases(app);
        await app.recordToasts();
        // (the export looks at Cancel every 100 ms while it waits for the zip tool; here every 3 s, so
        // that it is still ending when the entry is chosen, and the toast of its end cannot take the
        // place of the entry's own before it has been seen)
        await page.evaluate(() => {
            const original = window.setInterval;
            window.setInterval = (handler, ms, ...rest) => original(handler, ms === 100 ? 3000 : ms, ...rest);
        });
        const held = await holdExport(page, app);
        // Cancel closes the dialog at once, and the run notices at its next look: in the same turn
        // of the page the entry is chosen
        await page.evaluate(() => {
            document.querySelector("#export-tables-cancel").click();
            document.querySelector("#export-button").click();
            document.querySelector("#export-tables").click();
        });
        await expect.poll(() => app.toasts()).toContain(words.EXPORT_TABLES_BUSY_MESSAGE);
        await expect(page.locator("#export-tables-dialog[open]")).toHaveCount(0);
        held.open();
        await waitUntilIdle(app);
        // it has ended: the entry opens the dialog again
        await app.openTables();
        await expect(app.tablesDialog).toBeVisible();
        await app.tablesCancel.click();
    });

    // Back or Forward begins a load while the idle dialog is open: the open database is about to be closed
    async function backAndHold(page, app) {
        await app.open(EXPORT_URL);
        await app.upload(SAMPLE_FILE);
        await app.openTables();
        await app.waitCounted();
        await app.tickTables(["fruit"]);
        const handle = await databaseHandle(page);
        const held = await holdDataset(page);
        await page.goBack();
        await held.requested;
        await expect(app.pane).toHaveAttribute("data-state", "loading");
        // the dialog is still there: no database has opened yet
        await expect(app.tablesDialog).toBeVisible();
        return { handle, held };
    }

    test("Export pressed in a dialog under which a load has begun is refused in the dialog's alert, with its message, and begins nothing", async ({ page, app }) => {
        const downloads = recordDownloads(page);
        const { handle, held } = await backAndHold(page, app);
        await app.tablesSubmit.click();
        await expect(app.tablesError).toHaveText(words.EXPORT_TABLES_LOADING_DIALOG_MESSAGE);
        await expect(app.tablesError).toHaveAttribute("role", "alert");
        // nothing began: no progress, the list and Export are as they were, no file, no event
        await expect(app.tablesProgress).toBeHidden();
        await expect(app.tablesSubmit).toBeVisible();
        await expect(app.tablesBox("fruit")).toBeChecked();
        expect(downloads).toEqual([]);
        expect(await isOpenDatabase(page, handle)).toBe(true);
        expect(await eventKeys(page)).toEqual([]);
        // the database arrives: the dialog closes, and nothing was exported
        held.release();
        await expect(app.tablesDialog).toBeHidden();
        await app.waitReady();
        await expect(app.databaseLabel).toHaveText(DEFAULT_DATASET.name);
        expect(downloads).toEqual([]);
        expect(await eventKeys(page)).toEqual([]);
        // and the busy state was not left on: a Run is taken, not refused
        await app.recordToasts();
        expect(await app.query("SELECT 1 AS one")).toEqual({ columns: ["one"], rows: [["1"]] });
        expect(await app.toasts()).not.toContain(words.EXPORT_TABLES_BUSY_MESSAGE);
    });

    test("when the load FAILS the dialog stays, the file database is still open, and Export then works (the message says to press it again)", async ({ page, app }) => {
        const { handle, held } = await backAndHold(page, app);
        await app.tablesSubmit.click();
        await expect(app.tablesError).toHaveText(words.EXPORT_TABLES_LOADING_DIALOG_MESSAGE);
        await expect(app.tablesError).toHaveText(/press Export again/i);
        held.fail();
        // the load ends without a database: the error band is shown and the file is open as it was
        await expect(app.errorBand).toBeVisible();
        expect(await isOpenDatabase(page, handle)).toBe(true);
        await expect(app.tablesDialog).toBeVisible();
        const file = await app.download(() => app.tablesSubmit.click());
        expect(file.name).toBe("fruit.csv");
        await expect(app.tablesDialog).toBeHidden();
    });
});

test.describe("a database that opens under the idle dialog closes it", () => {
    test("Back: the dialog goes, nothing is exported, and the page is free", async ({ page, app, pageErrors }) => {
        await app.open(EXPORT_URL);
        await app.upload(SAMPLE_FILE);
        const downloads = recordDownloads(page);
        await app.openTables();
        await app.waitCounted();
        await app.tickTables(["fruit"]);
        const before = await databaseHandle(page);
        await page.goBack();
        await page.waitForFunction((old) => window.app.database !== old, before);
        await app.waitReady();
        await expect(app.tablesDialog).toBeHidden();
        await expect(page.locator("#export-tables-dialog[open]")).toHaveCount(0);
        await expect(app.databaseLabel).toHaveText(DEFAULT_DATASET.name);
        expect(downloads).toEqual([]);
        expect(await eventKeys(page)).toEqual([]);
        expect(pageErrors).toEqual([]);
        // the keyboard has somewhere to be, and the page is free: a Run works, and the dialog opens again for the database that is open
        expect(await page.evaluate(() => document.activeElement === null || document.activeElement === document.body)).toBe(false);
        expect(await app.query("SELECT 1 AS one")).toEqual({ columns: ["one"], rows: [["1"]] });
        await app.openTables();
        await app.waitCounted();
        expect((await app.tablesRows()).map((row) => row.name)).not.toContain("fruit");
    });

    test("Forward does the same", async ({ page, app, pageErrors }) => {
        await app.open(EXPORT_URL);
        await app.upload(SAMPLE_FILE);
        await page.goBack();
        await app.waitReady();
        await expect(app.databaseLabel).toHaveText(DEFAULT_DATASET.name);
        await app.openTables();
        await app.waitCounted();
        const before = await databaseHandle(page);
        await page.goForward();
        await page.waitForFunction((old) => window.app.database !== old, before);
        await app.waitReady();
        await expect(app.tablesDialog).toBeHidden();
        // (the address of a file is the page's own: Forward opens the default course database again)
        await expect(app.databaseLabel).toHaveText(DEFAULT_DATASET.name);
        expect(pageErrors).toEqual([]);
        // the dialog opens again, for the database that is open now
        await app.openTables();
        await app.waitCounted();
        expect((await app.tablesRows()).length).toBeGreaterThan(0);
        await expect(app.tablesDialog).toBeVisible();
    });
});

// ---- the zip tool ---------------------------------------------------------------------------------------

test.describe("the zip tool is asked for when it is first needed, and not before", () => {
    test("a first visit with the flag on, the dialog opened, and one table exported ask for nothing", async ({ page, app, net }) => {
        const asked = countZipTool(page);
        await app.open(EXPORT_URL);
        await page.waitForLoadState("networkidle");
        expect(asked()).toBe(0);
        expect(await page.evaluate(() => typeof globalThis.fflate)).toBe("undefined");
        // the dialog opens, and two tables are ticked: still nothing
        await app.upload(fixturePath(EDGE_DATABASE));
        await app.openTables();
        await app.waitCounted();
        await app.tickTables(["basic", "dates_iso"]);
        await page.waitForLoadState("networkidle");
        expect(asked()).toBe(0);
        // one table instead: a CSV file needs no library
        await app.tablesBox("dates_iso").uncheck();
        const file = await app.download(() => app.tablesSubmit.click());
        expect(file.name).toBe("basic.csv");
        expect(asked()).toBe(0);
        expect(await page.evaluate(() => typeof globalThis.fflate)).toBe("undefined");
        expect(net.paths.filter((path) => /fflate/.test(path))).toEqual([]);
    });

    test("the first zip asks for it once, and the second does not ask again", async ({ page, app, net }) => {
        await openEdgeCases(app);
        const asked = countZipTool(page);
        const first = await app.exportTables(["basic", "dates_iso"]);
        expect(first.name).toBe("export_edge_cases-tables.zip");
        expect(asked()).toBe(1);
        expect(await page.evaluate(() => typeof globalThis.fflate)).toBe("object");
        const second = await app.exportTables(["basic", "empty_table", "dates_iso"]);
        expect(readZip(second.buffer).map((entry) => entry.name)).toEqual(["basic.csv", "dates_iso.csv", "empty_table.csv"]);
        expect(asked()).toBe(1);
        expect(net.paths.filter((path) => path === `vendor/${ZIP_TOOL}`)).toHaveLength(1);
        net.expectNoExternalRequests();
    });

    test("when it cannot be loaded the dialog says so and keeps the ticks, nothing is saved, and the next press asks again", async ({ page, app }) => {
        await openEdgeCases(app);
        const downloads = recordDownloads(page);
        const asked = countZipTool(page);
        const key = await logKey(page);
        const before = await snapshot(page, app);
        await page.route(ZIP_TOOL_URL, (route) => route.abort());
        await app.openTables();
        await app.waitCounted();
        await app.tickTables(["basic", "dates_iso"]);
        await app.tablesSubmit.click();
        await expect(app.tablesError).toHaveText(words.EXPORT_TABLES_LIBRARY_FAILED_MESSAGE);
        await expect(app.tablesError).toHaveAttribute("role", "alert");
        expect(asked()).toBe(1);
        // the list is back with both ticks, Export can be pressed, and the focus is on Cancel
        await expect(app.tablesProgress).toBeHidden();
        expect((await app.tablesRows()).filter((row) => row.ticked).map((row) => row.name)).toEqual(["basic", "dates_iso"]);
        await expect(app.tablesSubmit).toHaveAttribute("aria-disabled", "false");
        await expect(app.tablesCancel).toBeFocused();
        expect(downloads).toEqual([]);
        // the page is free again, and holds nothing of the export
        await app.tablesCancel.click();
        await expect(app.tablesDialog).toBeHidden();
        await expectNothingLeft(page, app, before, { logKeys: [key] });
        expect(await openStatements(page)).toBe(0);
        // the connection is back, and Export asks again, and works
        await page.unroute(ZIP_TOOL_URL);
        const file = await app.exportTables(["basic", "dates_iso"]);
        expect(asked()).toBe(2);
        expect(readZip(file.buffer).map((entry) => entry.name)).toEqual(["basic.csv", "dates_iso.csv"]);
        expect(await eventsOfOpen(page)).toHaveLength(1);
    });
});

// ---- nothing left behind ---------------------------------------------------------------------------------

test.describe("Cancel leaves nothing", () => {
    test("Cancel while the zip tool is awaited: no file, no event, no statement open, the database as it was, and a toast that says so", async ({ page, app }) => {
        await openEdgeCases(app);
        const downloads = recordDownloads(page);
        const key = await logKey(page);
        const before = await snapshot(page, app);
        await app.recordToasts();
        const held = await holdExport(page, app);
        await app.tablesCancel.click();
        await expect(app.tablesDialog).toBeHidden();
        // (the zip tool comes late, to a dialog that has closed)
        held.open();
        await expectNothingLeft(page, app, before, { logKeys: [key] });
        expect(await openStatements(page)).toBe(0);
        await app.expectToasts([words.EXPORT_TABLES_CANCELLED_MESSAGE]);
        expect(downloads).toEqual([]);
        // the export is over (the busy state is off): another can be made
        const file = await app.exportTables(["basic"]);
        expect(file.name).toBe("basic.csv");
        expect(await eventsOfOpen(page)).toHaveLength(1);
    });

    test("Escape does the same as the Cancel button", async ({ page, app }) => {
        await openEdgeCases(app);
        const downloads = recordDownloads(page);
        const key = await logKey(page);
        const before = await snapshot(page, app);
        await app.recordToasts();
        const held = await holdExport(page, app);
        await page.keyboard.press("Escape");
        await expect(app.tablesDialog).toBeHidden();
        held.open();
        await expectNothingLeft(page, app, before, { logKeys: [key] });
        expect(await openStatements(page)).toBe(0);
        await app.expectToasts([words.EXPORT_TABLES_CANCELLED_MESSAGE]);
        expect(downloads).toEqual([]);
    });

    test("Cancel in the middle of a table, while it is being read: the statement is finalized, nothing is saved and nothing is recorded", async ({ page, app }) => {
        test.slow();
        await openEdgeCases(app);
        // a table of 60,000 rows of 100 characters: some hundred pieces of work, each followed by a turn for the page
        await app.run("CREATE TABLE long_one AS WITH RECURSIVE c(x) AS (SELECT 1 UNION ALL SELECT x + 1 FROM c WHERE x < 60000) SELECT x AS id, printf('%0100d', x) AS txt FROM c;");
        await slowDown(page);
        const downloads = recordDownloads(page);
        const key = await logKey(page);
        const before = await snapshot(page, app);
        await app.recordToasts();
        await app.openTables();
        await app.waitCounted();
        await app.tickTables(["long_one"]);
        await app.tablesSubmit.click();
        const bar = app.tablesDialog.locator(".tables-progress progress");
        await expect(bar).toBeVisible();
        await expect.poll(() => bar.evaluate((el) => el.value), { timeout: 20_000 }).toBeGreaterThan(0);
        // part of the way, and the table is open on the engine (so that the check below is not of an export that never began)
        expect(await bar.evaluate((el) => el.value)).toBeLessThan(1);
        expect(await openStatements(page)).not.toBe(0);
        await app.tablesCancel.click();
        await expect(app.tablesDialog).toBeHidden();
        await expectNothingLeft(page, app, before, { logKeys: [key] });
        expect(await openStatements(page)).toBe(0);
        await app.expectToasts([words.EXPORT_TABLES_CANCELLED_MESSAGE]);
        expect(downloads).toEqual([]);
    });

    test("Cancel while a zip is being written: no statement left open, no file, no event", async ({ page, app }) => {
        test.slow();
        await openEdgeCases(app);
        await app.run("CREATE TABLE long_one AS WITH RECURSIVE c(x) AS (SELECT 1 UNION ALL SELECT x + 1 FROM c WHERE x < 60000) SELECT x AS id, printf('%0100d', x) AS txt FROM c;");
        await slowDown(page);
        const downloads = recordDownloads(page);
        const key = await logKey(page);
        const before = await snapshot(page, app);
        await app.recordToasts();
        await app.openTables();
        await app.waitCounted();
        await app.tickTables(["basic", "long_one"]);
        await app.tablesSubmit.click();
        // the zip tool has come, and the second table is the one being read
        await expect(app.tablesDialog.locator("#export-tables-progress-title")).toHaveText(words.exportTablesProgressTitle(2, 2, "long_one"), { timeout: 20_000 });
        const bar = app.tablesDialog.locator(".tables-progress progress");
        await expect.poll(() => bar.evaluate((el) => el.value), { timeout: 20_000 }).toBeGreaterThan(0.1);
        expect(await openStatements(page)).not.toBe(0);
        await page.keyboard.press("Escape");
        await expect(app.tablesDialog).toBeHidden();
        await expectNothingLeft(page, app, before, { logKeys: [key] });
        expect(await openStatements(page)).toBe(0);
        await app.expectToasts([words.EXPORT_TABLES_CANCELLED_MESSAGE]);
        expect(downloads).toEqual([]);
    });
});

test.describe("an export that fails leaves nothing", () => {
    for (const [title, ticked] of [
        ["alone, as a CSV file", ["bad"]],
        ["with a table that was written before it, in a zip", ["basic", "bad"]],
    ]) {
        test(`a view that cannot be read to its end, ${title}: nothing is saved, no event, no statement open, the alert names the view, its row is unticked`, async ({ page, app }) => {
            await openEdgeCases(app);
            await app.run(BAD_VIEW);
            const downloads = recordDownloads(page);
            const key = await logKey(page);
            const before = await snapshot(page, app);
            await app.recordToasts();
            await app.openTables();
            await app.waitCounted();
            await app.tickTables(ticked);
            await app.tablesSubmit.click();
            // the alert says which table, and what the engine said of it
            const prefix = words.exportTablesFailedText("bad", "");
            await expect(app.tablesError).toContainText(prefix.trim());
            await expect(app.tablesError).toContainText(/overflow/i);
            await expect(app.tablesError).toHaveAttribute("role", "alert");
            await expect(app.tablesProgress).toBeHidden();
            // (the engine's words are what follows the table's name)
            const said = (await app.tablesError.textContent()).slice(prefix.length);
            expect(said).toMatch(/overflow/i);
            // the list is back: the failed row says so, with the engine's words, and is unticked and cannot be ticked, the others keep their ticks
            const rows = await app.tablesRows();
            const bad = rows.find((row) => row.name === "bad");
            expect(bad).toMatchObject({ ticked: false, tickable: false });
            expect(bad.line).toContain(words.exportTablesUnreadText(said));
            expect(rows.filter((row) => row.ticked).map((row) => row.name)).toEqual(ticked.filter((name) => name !== "bad"));
            await expect(app.tablesCancel).toBeFocused();
            await app.tablesCancel.click();
            await expect(app.tablesDialog).toBeHidden();
            // nothing was saved or recorded or left open, and the page is free
            await expectNothingLeft(page, app, before, { logKeys: [key] });
            expect(await openStatements(page)).toBe(0);
            expect(downloads).toEqual([]);
            expect(await app.toasts()).not.toContain(words.EXPORT_TABLES_CANCELLED_MESSAGE);
            // and the next export is made as if it had not happened
            const file = await app.exportTables(["basic"]);
            expect(file.name).toBe("basic.csv");
            expect(await eventsOfOpen(page)).toHaveLength(1);
        });
    }
});

// ---- the kit's check of what a job leaves, held to its own faults --------------------------------------------------

// expectNothingLeft (tests/helpers.js) is what many tests here and in the other aw files lean on to
// say that a job left nothing. It is worth that only if it fails when something is left. Each test
// here opens a database as the other tests do, takes a snapshot, changes the page's own connection
// from inside the page (as a student's query could), and expects the check to throw, and to name the
// look that saw it. The last tests change something and change it back, or only read: no throw.
test.describe("expectNothingLeft, the kit's check of what a job leaves, held to its own faults", () => {
    // The pattern of a line of the diff that the check prints when the connection is in another state
    // than the snapshot's: the line that the page's state has (a plus) and this text in it. Colour
    // codes that the diff may carry are skipped.
    const received = (text) => new RegExp(`\\+\\s*(?:\\u001b\\[\\d+m)*\\s*${text}`);

    // opens the edge-case database, takes the snapshot, and has the page run `sql` on its own
    // connection as a query of the student's would
    async function runAfterSnapshot(page, app, sql) {
        await openEdgeCases(app);
        const before = await snapshot(page, app);
        await page.evaluate((text) => window.app.database.db.exec(text), sql);
        return before;
    }

    test("a transaction opened (begin): the look at the connection sees it", async ({ page, app }) => {
        const before = await runAfterSnapshot(page, app, "begin");
        expect(await autocommit(page)).toBe(0);
        await expect(expectNothingLeft(page, app, before)).rejects.toThrow(received('"transaction": true'));
    });

    test("a savepoint opened (savepoint x): the look at the connection sees it", async ({ page, app }) => {
        const before = await runAfterSnapshot(page, app, "savepoint x");
        expect(await autocommit(page)).toBe(0);
        await expect(expectNothingLeft(page, app, before)).rejects.toThrow(received('"transaction": true'));
    });

    test("a database attached (attach ':memory:' as z): the look at the connection sees it, with its name", async ({ page, app }) => {
        const before = await runAfterSnapshot(page, app, "attach ':memory:' as z");
        await expect(expectNothingLeft(page, app, before)).rejects.toThrow(received('"z",'));
    });

    // each of the four settings of the connection that the check keeps, set to the other value than
    // the one the connection has
    for (const setting of ["foreign_keys", "recursive_triggers", "full_column_names", "short_column_names"]) {
        test(`${setting} set to the other value: the look at the connection sees it`, async ({ page, app }) => {
            await openEdgeCases(app);
            const before = await snapshot(page, app);
            const { was, now } = await page.evaluate((name) => {
                const db = window.app.database.db;
                const was = db.selectValue(`pragma ${name}`);
                db.exec(`pragma ${name} = ${was ? 0 : 1}`);
                return { was, now: db.selectValue(`pragma ${name}`) };
            }, setting);
            // (the setting really did change: the test cannot pass for nothing)
            expect(now).toBe(was ? 0 : 1);
            await expect(expectNothingLeft(page, app, before)).rejects.toThrow(received(`"${setting}": ${now}`));
        });
    }

    test("a statement left open (prepared, not finalized): the look at the connection sees it", async ({ page, app }) => {
        await openEdgeCases(app);
        const before = await snapshot(page, app);
        await page.evaluate(() => {
            window.__kept = window.app.database.db.prepare("select 1");
        });
        expect(await openStatements(page)).not.toBe(0);
        await expect(expectNothingLeft(page, app, before)).rejects.toThrow(received('"statement": true'));
    });

    // (the look at the TEMP schema says the name of the table in the list it found, where there should be none)
    test("a TEMP table made (create temp table): the look at the TEMP schema sees it", async ({ page, app }) => {
        const before = await runAfterSnapshot(page, app, "create temp table t (a)");
        await expect(expectNothingLeft(page, app, before)).rejects.toThrow(received('"t",'));
    });

    test("user_version changed (pragma user_version = 7): the look at the content sees it", async ({ page, app }) => {
        const before = await runAfterSnapshot(page, app, "pragma user_version = 7");
        await expect(expectNothingLeft(page, app, before)).rejects.toThrow(received('"userVersion": 7'));
    });

    // (the bytes of the database differ: the look at the content shows the two checksums)
    test("a row inserted: the look at the content sees it", async ({ page, app }) => {
        const before = await runAfterSnapshot(page, app, "insert into empty_table default values");
        await expect(expectNothingLeft(page, app, before)).rejects.toThrow(received('"sha256"'));
    });

    test("a read (select 1) is no change", async ({ page, app }) => {
        const before = await runAfterSnapshot(page, app, "select 1");
        await expectNothingLeft(page, app, before);
    });

    test("a transaction opened and rolled back is no change", async ({ page, app }) => {
        const before = await runAfterSnapshot(page, app, "begin; rollback");
        await expectNothingLeft(page, app, before);
    });

    test("a database attached and detached again is no change", async ({ page, app }) => {
        const before = await runAfterSnapshot(page, app, "attach ':memory:' as z; detach z");
        await expectNothingLeft(page, app, before);
    });

    test("a statement that was opened and finalized is no change", async ({ page, app }) => {
        await openEdgeCases(app);
        const before = await snapshot(page, app);
        await page.evaluate(() => {
            const statement = window.app.database.db.prepare("select 1");
            statement.step();
            statement.finalize();
        });
        expect(await openStatements(page)).toBe(0);
        await expectNothingLeft(page, app, before);
    });
});

// ---- the student's own transaction ------------------------------------------------------------------------

test.describe("an export while the student has a transaction open", () => {
    test("it reads what the transaction changed, and leaves the transaction open with its change", async ({ page, app }) => {
        await app.open(EXPORT_URL);
        await app.upload(SAMPLE_FILE);
        const [[rowsBefore]] = await app.rows("SELECT count(*) FROM fruit");
        await app.run("BEGIN; INSERT INTO fruit (id, name, price) VALUES (900, 'kiwi', 1.5);");
        expect(await autocommit(page)).toBe(0);
        const file = await app.exportTables(["fruit"]);
        // the row the transaction added is in the file, and counted in the event
        expect(file.text).toContain("900,kiwi,1.5,\r\n");
        expect((await eventsOfOpen(page))[0].lines[1]).toBe(words.exportEventTableLine("fruit", rowsBefore + 1));
        // the transaction is as it was: open, with its row, and no statement left on the connection
        expect(await autocommit(page)).toBe(0);
        expect(await openStatements(page)).toBe(0);
        expect(await app.rows("SELECT name FROM fruit WHERE id = 900")).toEqual([["kiwi"]]);
        // and it can still be undone, which a Commit by the export would have prevented
        await app.run("ROLLBACK;");
        expect(await autocommit(page)).toBe(1);
        expect(await app.rows("SELECT count(*) FROM fruit WHERE id = 900")).toEqual([[0]]);
        const again = await app.exportTables(["fruit"]);
        expect(again.text).not.toContain("kiwi");
    });
});

// ---- storage that cannot keep the events -------------------------------------------------------------------

test.describe("when the browser cannot keep the events", () => {
    const eventsKey = (key) => `${words.EVENTS_PREFIX}${key}`;
    const storedEvents = (page, key) => storedEventLines(page, eventsKey(key));

    const noticeFor = (imports, exports) => words.storageNoticeEventsText({ imports, exports });

    test("the notice names what a visit can note down: the files brought in, the tables exported, or both", async () => {
        expect(noticeFor(true, false)).toMatch(/brought in/);
        expect(noticeFor(true, false)).not.toMatch(/exported/);
        expect(noticeFor(false, true)).toMatch(/tables you exported/);
        expect(noticeFor(false, true)).not.toMatch(/brought in/);
        expect(noticeFor(true, true)).toMatch(/brought in/);
        expect(noticeFor(true, true)).toMatch(/tables you exported/);
        expect(new Set([noticeFor(true, false), noticeFor(false, true), noticeFor(true, true)]).size).toBe(3);
    });

    test("with both flags on, the notice for the events speaks of both, after an export", async ({ page, app }) => {
        await failStorage(page, { prefix: words.EVENTS_PREFIX, on: false });
        await openEdgeCases(app, BOTH_URL);
        const notice = page.locator("#storage-notice");
        await expect(notice).toBeAttached();
        await expect(notice).toBeHidden();
        await setStorageFailing(page, true);
        await app.exportTables(["basic"]);
        await expect(notice).toBeVisible();
        await expect(notice).toHaveText(noticeFor(true, true));
        expect(await eventKeys(page)).toEqual([]);
    });

    test("an export still succeeds, the notice says so, and the evidence still lists it", async ({ page, app }) => {
        await failStorage(page, { prefix: words.EVENTS_PREFIX, on: false });
        await openEdgeCases(app);
        const notice = page.locator("#storage-notice");
        // (the notice is on the page from the start, hidden: "hidden" alone would also be true of a notice that is not there)
        await expect(notice).toBeAttached();
        await expect(notice).toBeHidden();
        await setStorageFailing(page, true);
        const file = await app.exportTables(["basic"]);
        expect(file.buffer.equals(expectedBytes("basic.csv"))).toBe(true);
        await expect(app.toast).toContainText(words.exportedTablesMessage("basic.csv", { rows: 5 }));
        await expect(notice).toBeVisible();
        await expect(notice).toHaveText(noticeFor(false, true));
        // nothing was stored, and the evidence exported from this page has the event all the same
        expect(await eventKeys(page)).toEqual([]);
        const evidence = await app.exportEvidence();
        expect(evidence.text).toContain("event: export");
        expect(evidence.text).toContain(words.exportEventFileLine("basic.csv", file.buffer.length));
        expect(evidence.text).toContain(words.exportEventTableLine("basic", 5));
    });

    test("with storage that works the notice is not shown after an export, and the event is stored", async ({ page, app }) => {
        await openEdgeCases(app);
        const notice = page.locator("#storage-notice");
        await expect(notice).toBeAttached();
        await app.exportTables(["basic"]);
        await expect(notice).toBeHidden();
        await expect(notice).toHaveText("");
        expect(await storedEvents(page, "file:export_edge_cases.db")).toHaveLength(1);
    });

    test("the next export that can be stored hides the notice and stores both events", async ({ page, app }) => {
        await failStorage(page, { prefix: words.EVENTS_PREFIX, on: false });
        await openEdgeCases(app);
        const notice = page.locator("#storage-notice");
        await setStorageFailing(page, true);
        const first = await app.exportTables(["basic"]);
        await expect(notice).toBeVisible();
        expect(await storedEvents(page, "file:export_edge_cases.db")).toBeNull();
        // storage works again: the next export is stored, with what the page held back before it
        await setStorageFailing(page, false);
        const second = await app.exportTables(["dates_iso"]);
        await expect(notice).toBeHidden();
        expect(await storedEvents(page, "file:export_edge_cases.db")).toEqual([
            [words.exportEventFileLine("basic.csv", first.buffer.length), words.exportEventTableLine("basic", 5)],
            [words.exportEventFileLine("dates_iso.csv", second.buffer.length), words.exportEventTableLine("dates_iso", expected.find((table) => table.name === "dates_iso").rows)],
        ]);
    });
});

// ---- how an export fails, and what it leaves ----------------------------------------------------------

// takes out what a test put into the page (its patch sets window.__undo)
const undoPatch = (page) =>
    page.evaluate(() => {
        window.__undo?.();
        window.__undo = null;
    });

// An export of `ticked` (edge-case tables, in the dialog's order) meets a fault in the page: `patch`
// is a function run in the page, with `arg`, that puts the fault in and sets window.__undo to take
// it out. The export then says `message` in the dialog's alert, and: nothing was saved, nothing was
// recorded (in memory or in storage), no statement is open, the database holds what it held,
// the dialog stays with the ticks it had and Export can be pressed, a Run is taken and not refused,
// and, with the fault out, Export saves the file whole. `atFailure(app)` looks at the dialog as the
// failure leaves it. With `nothingLeft`, the kit's whole check of what a failed job leaves is run too.
async function expectFailsThenSaves(page, app, { ticked, patch, arg, message, atFailure, nothingLeft = false }) {
    await openEdgeCases(app);
    await app.editor.fill("SELECT 1 AS one;");
    const downloads = recordDownloads(page);
    const key = await logKey(page);
    const before = nothingLeft ? await snapshot(page, app) : null;
    const fingerprint = await databaseFingerprint(page);
    await app.recordToasts();
    await app.openTables();
    await app.waitCounted();
    await app.tickTables(ticked);
    await page.evaluate(patch, arg);
    await app.tablesSubmit.click();
    await expect(app.tablesError).toHaveText(message);
    await expect(app.tablesError).toHaveAttribute("role", "alert");
    await expect(app.tablesProgress).toBeHidden();
    await expect(app.tablesDialog).toBeVisible();
    await expect(app.tablesSubmit).toHaveAttribute("aria-disabled", "false");
    expect((await app.tablesRows()).filter((row) => row.ticked).map((row) => row.name)).toEqual(ticked);
    await atFailure?.(app);
    // nothing saved, nothing recorded, nothing left open, nothing changed
    expect(downloads).toEqual([]);
    expect(await eventKeys(page)).toEqual([]);
    expect((await eventsOf(page, [key])).found[key]).toEqual([]);
    expect(await openStatements(page)).toBe(0);
    expect(await databaseFingerprint(page)).toEqual(fingerprint);
    // the page is free: a Run (from script, the dialog being modal) is taken, not refused
    await page.evaluate(() => document.querySelector("#execute").click());
    await expect(app.pane).toHaveAttribute("data-state", "result");
    expect(await app.toasts()).not.toContain(words.EXPORT_TABLES_BUSY_MESSAGE);
    if (before) {
        await expectNothingLeft(page, app, before, { logKeys: [key] });
    }
    // the fault is out, and the same dialog saves the file
    await undoPatch(page);
    const file = await app.download(() => app.tablesSubmit.click());
    if (ticked.length === 1) {
        expect(file.name).toBe(`${ticked[0]}.csv`);
        expect(file.buffer.equals(expectedBytes(`${ticked[0]}.csv`))).toBe(true);
    } else {
        expect(file.name).toBe("export_edge_cases-tables.zip");
        const entries = readZip(file.buffer);
        expect(entries.map((entry) => entry.name)).toEqual(ticked.map((name) => `${name}.csv`));
        for (const entry of entries) {
            expect(entry.bytes.equals(expectedBytes(entry.name)), entry.name).toBe(true);
        }
    }
    expect(await eventsOfOpen(page)).toHaveLength(1);
    expect(await databaseFingerprint(page)).toEqual(fingerprint);
    expect(await openStatements(page)).toBe(0);
}

test.describe("a file or a zip that cannot be made says what failed, in its own words", () => {
    test("one table, and the browser cannot make the file: the words of a file, not of a zip", async ({ page, app }) => {
        expect(words.EXPORT_TABLES_FILE_FAILED_MESSAGE).not.toMatch(/zip/i);
        await expectFailsThenSaves(page, app, {
            ticked: ["basic"],
            patch: () => {
                // (Blob throws once, for the file that is being made)
                const original = window.Blob;
                window.Blob = function () {
                    window.Blob = original;
                    throw new TypeError("a Blob cannot be made");
                };
                window.__undo = () => {
                    window.Blob = original;
                };
            },
            message: words.EXPORT_TABLES_FILE_FAILED_MESSAGE,
        });
    });

    test("two tables, and the zip tool reports an error: the words of a zip", async ({ page, app }) => {
        await expectFailsThenSaves(page, app, {
            ticked: ["basic", "dates_iso"],
            patch: () => {
                // The zip tool is not on the page until Export is pressed: what the page gives its name
                // is watched, and the tool's Zip is wrapped when it arrives, so that the tool tells
                // its callback of an error instead of giving the bytes.
                let library;
                let original;
                Object.defineProperty(window, "fflate", {
                    configurable: true,
                    get: () => library,
                    set(value) {
                        library = value;
                        original = value.Zip;
                        value.Zip = function (callback) {
                            return new original((failure, chunk, final) => callback(new Error("the zip tool failed"), null, final));
                        };
                    },
                });
                window.__undo = () => {
                    if (library) {
                        library.Zip = original;
                    }
                };
            },
            message: words.EXPORT_TABLES_ZIP_FAILED_MESSAGE,
        });
    });

    test("two tables, and the zip tool throws a plain TypeError from inside: the words of a zip, and not those of a file", async ({ page, app }) => {
        expect(words.EXPORT_TABLES_ZIP_FAILED_MESSAGE).not.toBe(words.EXPORT_TABLES_FILE_FAILED_MESSAGE);
        await expectFailsThenSaves(page, app, {
            ticked: ["basic", "dates_iso"],
            patch: () => {
                // The zip tool is not on the page until Export is pressed: what the page gives its name
                // is watched, and the tool's way of taking bytes is made to throw when it arrives (a
                // throw of its own, not an error told to its callback).
                let library;
                let original;
                Object.defineProperty(window, "fflate", {
                    configurable: true,
                    get: () => library,
                    set(value) {
                        library = value;
                        original = value.ZipDeflate.prototype.push;
                        value.ZipDeflate.prototype.push = function () {
                            throw new TypeError("this.d is not a function");
                        };
                    },
                });
                window.__undo = () => {
                    if (library) {
                        library.ZipDeflate.prototype.push = original;
                    }
                };
            },
            message: words.EXPORT_TABLES_ZIP_FAILED_MESSAGE,
        });
    });

    test("a RangeError while a piece is encoded: the browser ran out of memory, and the words say so and speak of no zip", async ({ page, app }) => {
        expect(words.EXPORT_TABLES_OUT_OF_MEMORY_MESSAGE).not.toMatch(/zip/i);
        // the first row of basic, as the owner's file holds it
        const needle = expectedBytes("basic.csv").toString("utf8").split("\r\n")[1];
        expect(needle).toMatch(/^1,/);
        await expectFailsThenSaves(page, app, {
            ticked: ["basic"],
            patch: (text) => {
                const original = TextEncoder.prototype.encode;
                TextEncoder.prototype.encode = function (input) {
                    if (String(input).includes(text)) {
                        throw new RangeError("Array buffer allocation failed");
                    }
                    return original.call(this, input);
                };
                window.__undo = () => {
                    TextEncoder.prototype.encode = original;
                };
            },
            arg: needle,
            message: words.EXPORT_TABLES_OUT_OF_MEMORY_MESSAGE,
        });
    });

    // The zip tool is made to say that its file is longer than a zip can hold (each chunk it hands
    // on claims 5e9 bytes; the real bytes still come out of `slice`), so the page's own count of the
    // zip's size passes the limit as soon as the first entry's header is written.
    test("three tables, and the zip passes what a zip can hold after the first: the words of too big, and the export stops at the next piece, with two entries begun and not three", async ({ page, app }) => {
        expect(words.EXPORT_TABLES_ZIP_TOO_BIG_MESSAGE).not.toBe(words.EXPORT_TABLES_ZIP_FAILED_MESSAGE);
        await expectFailsThenSaves(page, app, {
            ticked: ["basic", "dates_iso", "empty_table"],
            patch: () => {
                let library;
                let zip;
                let deflate;
                window.__begun = 0;
                Object.defineProperty(window, "fflate", {
                    configurable: true,
                    get: () => library,
                    set(value) {
                        library = value;
                        zip = value.Zip;
                        deflate = value.ZipDeflate;
                        value.Zip = function (callback) {
                            return new zip((failure, chunk, final) => callback(failure, chunk && { length: 5e9, slice: () => chunk.slice() }, final));
                        };
                        value.ZipDeflate = function (...args) {
                            window.__begun++;
                            return new deflate(...args);
                        };
                    },
                });
                window.__undo = () => {
                    if (library) {
                        library.Zip = zip;
                        library.ZipDeflate = deflate;
                    }
                };
            },
            message: words.EXPORT_TABLES_ZIP_TOO_BIG_MESSAGE,
            nothingLeft: true,
            atFailure: async () => {
                expect(await page.evaluate(() => window.__begun), "entries begun before the export stopped").toBe(2);
            },
        });
    });

    // The tool of the zip fails late: after an entry has taken its first bytes, not at its first call.
    // `when` says which call of an entry's push throws a plain TypeError: the third (a piece of rows)
    // or the one that ends an entry (`final` true).
    const pushThrowsLate = (when) => {
        let library;
        let original;
        let calls = 0;
        Object.defineProperty(window, "fflate", {
            configurable: true,
            get: () => library,
            set(value) {
                library = value;
                original = value.ZipDeflate.prototype.push;
                value.ZipDeflate.prototype.push = function (bytes, final) {
                    calls++;
                    if (when === "third" ? calls === 3 : final === true) {
                        throw new TypeError("push failed late");
                    }
                    return original.apply(this, arguments);
                };
            },
        });
        window.__undo = () => {
            if (library) {
                library.ZipDeflate.prototype.push = original;
            }
        };
    };

    test("two tables, and an entry of the zip cannot take a piece of rows (the third call of its push throws a TypeError): the words of a zip, and the next press saves", async ({ page, app }) => {
        await expectFailsThenSaves(page, app, {
            ticked: ["basic", "dates_iso"],
            patch: pushThrowsLate,
            arg: "third",
            message: words.EXPORT_TABLES_ZIP_FAILED_MESSAGE,
            nothingLeft: true,
        });
    });

    test("two tables, and an entry of the zip cannot be ended (its last push throws a TypeError): the words of a zip, and the next press saves", async ({ page, app }) => {
        await expectFailsThenSaves(page, app, {
            ticked: ["basic", "dates_iso"],
            patch: pushThrowsLate,
            arg: "final",
            message: words.EXPORT_TABLES_ZIP_FAILED_MESSAGE,
            nothingLeft: true,
        });
    });
});

test.describe("a fault of the page's own while a row is written is not the table's fault", () => {
    // Array.prototype.join is what puts the fields of a row together; it throws for the first row
    // of basic (four fields, the first of them 1) and for no other text
    const joinThrows = ([kind, text]) => {
        const original = Array.prototype.join;
        Array.prototype.join = function (separator) {
            if (separator === "," && this.length === 4 && this[0] === "1") {
                throw new globalThis[kind](text);
            }
            return original.apply(this, arguments);
        };
        window.__undo = () => {
            Array.prototype.join = original;
        };
    };

    // the alert does not name the table or give the error's own words, and the table's row is as it was
    const noBlame = (error) => async (app) => {
        const alert = await app.tablesError.textContent();
        expect(alert).not.toContain("basic");
        expect(alert).not.toContain(error);
        const row = (await app.tablesRows()).find((one) => one.name === "basic");
        expect(row).toMatchObject({ ticked: true, tickable: true });
        expect(row.line).toBe(words.exportTablesRowsText(5));
    };

    test("a RangeError (a text too long to make): the browser ran out of memory, without the table's name or the error's words", async ({ page, app }) => {
        await expectFailsThenSaves(page, app, {
            ticked: ["basic"],
            patch: joinThrows,
            arg: ["RangeError", "Invalid string length"],
            message: words.EXPORT_TABLES_OUT_OF_MEMORY_MESSAGE,
            atFailure: noBlame("Invalid string length"),
        });
    });

    test("an error named InternalError (the one Firefox throws for a text too large): the browser ran out of memory, in the same words", async ({ page, app }) => {
        await expectFailsThenSaves(page, app, {
            ticked: ["basic"],
            patch: ([kind, text]) => {
                const original = TextEncoder.prototype.encode;
                TextEncoder.prototype.encode = function (input) {
                    if (String(input).includes(text)) {
                        throw Object.assign(new Error("allocation size overflow"), { name: kind });
                    }
                    return original.call(this, input);
                };
                window.__undo = () => {
                    TextEncoder.prototype.encode = original;
                };
            },
            // (the first row of basic, as the owner's file holds it)
            arg: ["InternalError", expectedBytes("basic.csv").toString("utf8").split("\r\n")[1]],
            message: words.EXPORT_TABLES_OUT_OF_MEMORY_MESSAGE,
            atFailure: noBlame("allocation size overflow"),
        });
    });

    test("a TypeError: the export failed, in the general words, without the table's name or the error's words", async ({ page, app }) => {
        await expectFailsThenSaves(page, app, {
            ticked: ["basic"],
            patch: joinThrows,
            arg: ["TypeError", "unknown kind of value: 7"],
            message: words.EXPORT_TABLES_FAILED_MESSAGE,
            atFailure: noBlame("unknown kind of value"),
        });
    });
});

// The page's own code fails while the engine's text of a table is read (the decoder of its bytes
// throws, once). The engine did nothing wrong, so no table is named and the table's row is not
// closed: it keeps its tick and the next press may go well. Only an error of the engine (its own
// names) is a table's fault.
test.describe("a fault of the page's own while a table is read is not the table's fault", () => {
    for (const [kind, expectedMessage, title] of [
        ["TypeError", "EXPORT_TABLES_FAILED_MESSAGE", "a TypeError: the export failed, in the general words"],
        ["Error", "EXPORT_TABLES_FAILED_MESSAGE", "a plain Error: the export failed, in the general words"],
        ["RangeError", "EXPORT_TABLES_OUT_OF_MEMORY_MESSAGE", "a RangeError: the browser ran out of memory, in its words"],
    ]) {
        test(`the decoder of the engine's text throws ${title}, with no table named and no word of the error's, the row still ticked, and the next press saves`, async ({ page, app }) => {
            await expectFailsThenSaves(page, app, {
                ticked: ["basic"],
                // the decoder throws once, and puts itself back inside the function that throws
                patch: (name) => {
                    const original = TextDecoder.prototype.decode;
                    TextDecoder.prototype.decode = function () {
                        TextDecoder.prototype.decode = original;
                        throw new globalThis[name]("decoder broke");
                    };
                    window.__undo = () => {
                        TextDecoder.prototype.decode = original;
                    };
                },
                arg: kind,
                message: words[expectedMessage],
                nothingLeft: true,
                atFailure: async (one) => {
                    const alert = await one.tablesError.textContent();
                    expect(alert).not.toContain("basic");
                    expect(alert).not.toContain("decoder broke");
                    const row = (await one.tablesRows()).find((entry) => entry.name === "basic");
                    expect(row).toMatchObject({ ticked: true, tickable: true });
                    expect(row.line).toBe(words.exportTablesRowsText(5));
                },
            });
        });
    }
});

// The engine's own memory runs out. It is neither a table's fault nor the page's: no table is named,
// the row keeps its tick, and the next press of Export may go well.
test.describe("an engine that has no memory left for a table is not that table's fault", () => {
    // The engine is out of memory from its first allocation: its heap limit is set to 3 MB, and it
    // already holds more than that (the table of 8 MB, its caches), so every allocation fails from
    // then on, the first one when the export opens the table. That is what this test pins: the
    // engine's error, met at the opening of a table, is told as a lack of memory with no table
    // named. (The read of a text that the engine has no memory for is held by the two tests below
    // that replace the engine's memory with a stand-in.)
    test("the engine out of memory from its first allocation, its heap limit under what it already holds: the words of a lack of memory, no table named, nothing saved or recorded, the row still ticked and its count shown", async ({ page, app }) => {
        await openEdgeCases(app);
        await app.run("CREATE TABLE big AS SELECT hex(zeroblob(4000000)) AS t;");
        const downloads = recordDownloads(page);
        const key = await logKey(page);
        await app.recordToasts();
        await app.openTables();
        await app.waitCounted();
        await app.tickTables(["big"]);
        // The limit is set on the open connection from inside the page, once the dialog has counted.
        // (The page's own guard refuses that pragma to a student, so the guard is taken off the
        // connection first.) It is under what the engine holds already, so the engine has no memory
        // to spare after that, and the test asks it for no more SQL.
        await page.evaluate(() => {
            const { db, capi } = window.app.database;
            capi.sqlite3_set_authorizer(db.pointer, 0, 0);
            db.exec("pragma hard_heap_limit=3000000");
        });
        await app.tablesSubmit.click();
        await expect(app.tablesError).toHaveText(words.EXPORT_TABLES_OUT_OF_MEMORY_MESSAGE);
        await expect(app.tablesError).toHaveAttribute("role", "alert");
        expect(await app.tablesError.textContent()).not.toContain("big");
        await expect(app.tablesProgress).toBeHidden();
        // the dialog is back at its list, with Export on
        await expect(app.tablesDialog).toBeVisible();
        await expect(app.tablesSubmit).toHaveAttribute("aria-disabled", "false");
        // the row is as it was: ticked, still to be ticked or unticked, and its line is its count
        const big = (await app.tablesRows()).find((row) => row.name === "big");
        expect(big).toMatchObject({ ticked: true, tickable: true });
        expect(big.line).toBe(words.exportTablesRowsText(1));
        await app.tablesBox("big").uncheck();
        await app.tablesBox("big").check();
        await expect(app.tablesSubmit).toHaveAttribute("aria-disabled", "false");
        // nothing was saved or recorded or left open
        expect(downloads).toEqual([]);
        expect(await eventKeys(page)).toEqual([]);
        expect((await eventsOf(page, [key])).found[key]).toEqual([]);
        expect(await openStatements(page)).toBe(0);
        expect(await app.toasts()).not.toContain(words.EXPORT_TABLES_CANCELLED_MESSAGE);
    });

    // The reader asks the engine for the bytes of a text, and the engine gives no address when it had
    // no memory to make them. The engine's memory is replaced here, on the page's wrapper of the
    // connection, by a stand-in that hands on everything but gives no address at one call of
    // sqlite3_column_text (the real functions of the engine's memory cannot be changed in place).
    const noTextAt = (call) => {
        const database = window.app.database;
        const real = database.wasm;
        let calls = 0;
        const exports = {
            ...real.exports,
            sqlite3_column_text: (...args) => {
                calls++;
                return calls === call ? 0 : real.exports.sqlite3_column_text(...args);
            },
        };
        database.wasm = Object.create(real, { exports: { value: exports } });
        window.__undo = () => {
            database.wasm = real;
        };
    };

    test("the engine gives no text in the middle of a table: a lack of memory is told, nothing is saved or recorded, the row is not closed, and the next press saves the file whole", async ({ page, app }) => {
        await expectFailsThenSaves(page, app, {
            ticked: ["basic"],
            patch: noTextAt,
            arg: 3,
            message: words.EXPORT_TABLES_OUT_OF_MEMORY_MESSAGE,
            atFailure: async (one) => {
                expect(await one.tablesError.textContent()).not.toContain("basic");
                const row = (await one.tablesRows()).find((entry) => entry.name === "basic");
                expect(row).toMatchObject({ ticked: true, tickable: true });
                expect(row.line).toBe(words.exportTablesRowsText(5));
            },
        });
    });

    test("the engine gives no text to a zip of two tables: the same, and the zip that follows holds both tables whole", async ({ page, app }) => {
        await expectFailsThenSaves(page, app, {
            ticked: ["basic", "dates_iso"],
            patch: noTextAt,
            arg: 3,
            message: words.EXPORT_TABLES_OUT_OF_MEMORY_MESSAGE,
        });
    });

    // The engine gives no pointer for the name of a column at its `call`th call, which is while a
    // table is being opened (the list of tables is read as texts, and never asks for a column's
    // name). Made as noTextAt is: a stand-in for the engine's functions on the page's wrapper.
    const noNameAt = (call) => {
        const database = window.app.database;
        const real = database.wasm;
        let calls = 0;
        const exports = {
            ...real.exports,
            sqlite3_column_name: (...args) => {
                calls++;
                return calls === call ? 0 : real.exports.sqlite3_column_name(...args);
            },
        };
        database.wasm = Object.create(real, { exports: { value: exports } });
        window.__undo = () => {
            database.wasm = real;
        };
    };

    test("the engine gives no name for a column while a table is opened: a lack of memory is told, no table is named, nothing is saved or recorded, no statement is left open, and the next press saves the file whole", async ({ page, app }) => {
        await expectFailsThenSaves(page, app, {
            ticked: ["basic"],
            patch: noNameAt,
            arg: 2,
            message: words.EXPORT_TABLES_OUT_OF_MEMORY_MESSAGE,
            nothingLeft: true,
            atFailure: async (one) => {
                expect(await one.tablesError.textContent()).not.toContain("basic");
                const row = (await one.tablesRows()).find((entry) => entry.name === "basic");
                expect(row).toMatchObject({ ticked: true, tickable: true });
                expect(row.line).toBe(words.exportTablesRowsText(5));
                // (the box is still there to be ticked again)
                await one.tablesBox("basic").uncheck();
                await one.tablesBox("basic").check();
                await expect(one.tablesSubmit).toHaveAttribute("aria-disabled", "false");
            },
        });
    });

    test("the engine gives no name when the list is read: the toast of a list that cannot be read, no dialog, no statement left open, and the entry opens the dialog once the fault is out", async ({ page, app }) => {
        await openEdgeCases(app);
        await app.recordToasts();
        await page.evaluate(noTextAt, 1);
        await app.openExportMenu();
        await app.tablesItem.click();
        await expectTone(app, words.EXPORT_TABLES_LIST_FAILED_MESSAGE, "problem");
        await app.expectToasts([words.EXPORT_TABLES_LIST_FAILED_MESSAGE]);
        await expect(page.locator("#export-tables-dialog[open]")).toHaveCount(0);
        expect(await openStatements(page)).toBe(0);
        await undoPatch(page);
        await app.openTables();
        await app.waitCounted();
        expect((await app.tablesRows()).map((row) => row.name)).toEqual(expected.map((table) => table.name));
    });
});

test.describe("an export that the browser will not save, a list that cannot be read, a table that is gone", () => {
    test("the browser refuses the save: its words, nothing recorded, the dialog stays, and the next press saves", async ({ page, app }) => {
        await expectFailsThenSaves(page, app, {
            ticked: ["basic"],
            patch: () => {
                const original = URL.createObjectURL;
                URL.createObjectURL = () => {
                    throw new Error("the browser will not save");
                };
                window.__undo = () => {
                    URL.createObjectURL = original;
                };
            },
            message: words.EXPORT_TABLES_SAVE_FAILED_MESSAGE,
        });
    });

    test("the list cannot be read: a toast of the tone of a problem says so, and no dialog opens", async ({ page, app }) => {
        await openEdgeCases(app);
        await app.recordToasts();
        await page.evaluate(() => {
            // (the statement that lists the tables and views, and no other)
            const { db } = window.app.database;
            const original = db.prepare;
            db.prepare = function (sql, ...rest) {
                if (String(sql).includes("sqlite_schema") && String(sql).includes("'view'")) {
                    throw new Error("the list cannot be read");
                }
                return original.call(this, sql, ...rest);
            };
            window.__undo = () => {
                delete db.prepare;
            };
        });
        await app.openExportMenu();
        await app.tablesItem.click();
        await expectTone(app, words.EXPORT_TABLES_LIST_FAILED_MESSAGE, "problem");
        await app.expectToasts([words.EXPORT_TABLES_LIST_FAILED_MESSAGE]);
        await expect(page.locator("#export-tables-dialog[open]")).toHaveCount(0);
        expect(await openStatements(page)).toBe(0);
        // with the fault out the entry opens the dialog
        await undoPatch(page);
        await app.openTables();
        await app.waitCounted();
        expect((await app.tablesRows()).length).toBe(expected.length);
    });

    // A table is dropped while the dialog is open (from script: the dialog is modal), and then
    // exported: the engine says it is not there. A name with a line break in it makes the engine's
    // words run over two lines, and the alert and the row keep them on one.
    for (const [title, name] of [
        ["a table", "dates_iso"],
        ["a table whose name has a line break in it", "line\nbreak"],
    ]) {
        test(`${title} is dropped under the open dialog and then exported: the alert names it with the engine's words, on one line, and its row is marked`, async ({ page, app }) => {
            await openEdgeCases(app);
            if (name.includes("\n")) {
                await app.run(`CREATE TABLE "${name}" (x);`);
            }
            const downloads = recordDownloads(page);
            const key = await logKey(page);
            await app.openTables();
            await app.waitCounted();
            const index = (await app.tablesRows()).findIndex((row) => row.name === name);
            expect(index).toBeGreaterThan(-1);
            await app.tablesDialog.locator("input.tables-row-box").nth(index).check();
            await page.evaluate((table) => window.app.database.db.exec(`drop table "${table}"`), name);
            await app.tablesSubmit.click();
            await expect(app.tablesError).toHaveAttribute("role", "alert");
            await expect(app.tablesProgress).toBeHidden();
            const alert = await app.tablesError.textContent();
            const prefix = words.exportTablesFailedText(name, "");
            expect(alert.startsWith(prefix), alert).toBe(true);
            const said = alert.slice(prefix.length);
            expect(said).toMatch(/no such table/i);
            expect(said).not.toMatch(/[\r\n]/);
            // the row says so too, with the same words, and cannot be ticked again; the rest is as it was
            const rows = await app.tablesRows();
            expect(rows[index]).toMatchObject({ ticked: false, tickable: false });
            expect(rows[index].line).toContain(words.exportTablesUnreadText(said));
            expect(rows.filter((row, n) => n !== index).every((row) => row.tickable)).toBe(true);
            expect(downloads).toEqual([]);
            expect(await eventKeys(page)).toEqual([]);
            expect((await eventsOf(page, [key])).found[key]).toEqual([]);
            expect(await openStatements(page)).toBe(0);
        });
    }
});

test.describe("a reader that cannot be closed, and a file that is saved before something throws", () => {
    test("closing the reader throws after a view could not be read: the failure is told, and the page is free", async ({ page, app }) => {
        await openEdgeCases(app);
        await app.run(BAD_VIEW);
        await app.recordToasts();
        await app.openTables();
        await app.waitCounted();
        await app.tickTables(["bad"]);
        // (the statement that reads a table finalizes itself and then throws, as if closing it failed)
        await page.evaluate(() => {
            const { db } = window.app.database;
            const original = db.prepare;
            db.prepare = function (sql, ...rest) {
                const statement = original.call(this, sql, ...rest);
                if (String(sql).startsWith("select * from main.")) {
                    const finalize = statement.finalize.bind(statement);
                    statement.finalize = () => {
                        finalize();
                        throw new Error("the statement could not be closed");
                    };
                }
                return statement;
            };
        });
        await app.tablesSubmit.click();
        // the failure that began it is what the student is told
        await expect(app.tablesError).toContainText(words.exportTablesFailedText("bad", "").trim());
        await expect(app.tablesError).toContainText(/overflow/i);
        await expect(app.tablesProgress).toBeHidden();
        expect(await openStatements(page)).toBe(0);
        // the page is free again: Run works, and Tables as CSV opens its dialog with no word of a running export
        await app.tablesCancel.click();
        await expect(app.tablesDialog).toBeHidden();
        expect(await app.query("SELECT 1 AS one")).toEqual({ columns: ["one"], rows: [["1"]] });
        await app.openTables();
        await app.waitCounted();
        await app.expectToasts([]);
        await expect(app.tablesDialog).toBeVisible();
    });

    test("something throws after the browser has the file: the file is saved and recorded, the dialog closes, and no alert says that nothing was exported", async ({ page, app }) => {
        await openEdgeCases(app);
        const downloads = recordDownloads(page);
        await app.openTables();
        await app.waitCounted();
        await app.tickTables(["basic"]);
        await page.evaluate(() => {
            // (the toast looks for its region first: it throws, once, and the page is as it was)
            const original = document.getElementById;
            document.getElementById = function (id) {
                if (id === "toast-region") {
                    delete document.getElementById;
                    throw new Error("no place for a toast");
                }
                return original.call(this, id);
            };
        });
        const file = await app.download(() => app.tablesSubmit.click());
        expect(file.buffer.equals(expectedBytes("basic.csv"))).toBe(true);
        await expect(app.tablesDialog).toBeHidden();
        // (the throw did happen: the patch took itself out)
        expect(await page.evaluate(() => Object.hasOwn(document, "getElementById"))).toBe(false);
        expect(downloads).toEqual(["basic.csv"]);
        const events = await eventsOfOpen(page);
        expect(events).toHaveLength(1);
        expect(events[0].lines).toEqual([words.exportEventFileLine("basic.csv", file.buffer.length), words.exportEventTableLine("basic", 5)]);
        expect(await page.evaluate(() => document.querySelector("#export-tables-error").textContent)).toBe("");
        expect(await app.query("SELECT 1 AS one")).toEqual({ columns: ["one"], rows: [["1"]] });
    });
});

// ---- what run refuses before it begins -------------------------------------------------------------------

test.describe("Export, pressed in a dialog that has been open and idle, is refused when the page has moved on", () => {
    test("an import began under the dialog: Export says the import runs, in the dialog's alert, and exports nothing", async ({ page, app }) => {
        await openEdgeCases(app, BOTH_URL);
        const downloads = recordDownloads(page);
        await app.openTables();
        await app.waitCounted();
        await app.tickTables(["basic"]);
        // (the import's dialog opens above the export's, and the import begins; the export's dialog is
        // open and idle under it, and its Export is pressed from script)
        const held = await holdImport(page, app);
        await page.evaluate(() => document.querySelector("#export-tables-submit").click());
        await expect(app.tablesError).toHaveText(words.IMPORT_BUSY_MESSAGE);
        await expect(app.tablesProgress).toBeHidden();
        expect(downloads).toEqual([]);
        expect(await eventKeys(page)).toEqual([]);
        expect(await openStatements(page)).toBe(0);
        // (the import was not harmed: it ends with its report)
        await finishHeld(app, held);
    });

    test("another database is open than the one the dialog was made for: Export says so, and exports nothing", async ({ page, app }) => {
        await openEdgeCases(app);
        const downloads = recordDownloads(page);
        await app.openTables();
        await app.waitCounted();
        await app.tickTables(["basic"]);
        // A database that opens closes the idle dialog, by the page's own event. To have another
        // database under the dialog all the same, the dialog is made to say that it is not open when
        // it is asked (as it would be if it had missed the event); it stays on screen.
        await page.evaluate(() => {
            Object.defineProperty(document.querySelector("#export-tables-dialog"), "open", { configurable: true, get: () => false });
        });
        await app.chooseFiles(SAMPLE_FILE);
        await expect.poll(() => page.evaluate(() => window.app.database.name)).toBe(path.basename(SAMPLE_FILE));
        await expect(app.tablesDialog).toBeVisible();
        await app.tablesSubmit.click();
        await expect(app.tablesError).toHaveText(words.EXPORT_TABLES_GONE_MESSAGE);
        await expect(app.tablesProgress).toBeHidden();
        expect(downloads).toEqual([]);
        expect(await eventKeys(page)).toEqual([]);
        // the dialog is closed as it would have been, and the database that is open now exports
        await page.evaluate(() => {
            delete document.querySelector("#export-tables-dialog").open;
        });
        await app.tablesCancel.click();
        await expect(app.tablesDialog).toBeHidden();
        const file = await app.exportTables(["fruit"]);
        expect(file.name).toBe("fruit.csv");
    });
});

test.describe("an idle export dialog keeps other ways of opening a database shut, and a Run asked as an export begins is dropped", () => {
    test("Ctrl+O opens no file chooser, Ctrl+U no dialog, and the switcher's \"Open a file…\" nothing, while the dialog is open and nothing runs", async ({ page, app }) => {
        await openEdgeCases(app);
        // (every click on the file input is counted where it is made: a chooser that opens is not seen at once)
        await page.evaluate(() => {
            window.__inputClicks = 0;
            const click = HTMLInputElement.prototype.click;
            HTMLInputElement.prototype.click = function () {
                if (this.id === "open-file-input") {
                    window.__inputClicks++;
                }
                return click.call(this);
            };
        });
        const inputClicks = () => page.evaluate(() => window.__inputClicks);
        let choosers = 0;
        page.on("filechooser", () => choosers++);
        await app.openTables();
        await app.waitCounted();
        await page.keyboard.press("Control+o");
        expect(await inputClicks()).toBe(0);
        await page.keyboard.press("Control+u");
        await expect(page.locator("#open-url-dialog[open]")).toHaveCount(0);
        await chooseFromMenu(page, "#database-button", "#open-file");
        expect(await inputClicks()).toBe(0);
        await chooseFromMenu(page, "#database-button", "#open-url");
        await expect(page.locator("#open-url-dialog[open]")).toHaveCount(0);
        expect(choosers).toBe(0);
        // with the dialog closed the same ways work
        await app.tablesCancel.click();
        await expect(app.tablesDialog).toBeHidden();
        await page.keyboard.press("Control+o");
        expect(await inputClicks()).toBe(1);
        await chooseFromMenu(page, "#database-button", "#open-file");
        expect(await inputClicks()).toBe(2);
        await page.keyboard.press("Control+u");
        await expect(page.locator("#open-url-dialog")).toBeVisible();
    });

    test("a Run asked in the same turn in which an export starts does not run: nothing is run, nothing is logged, and the result pane is as it was", async ({ page, app }) => {
        await openEdgeCases(app);
        await app.editor.fill("SELECT 1 AS one;");
        const key = await logKey(page);
        const paneBefore = await app.pane.getAttribute("data-state");
        const held = await holdVendor(page, ZIP_TOOL);
        await app.openTables();
        await app.waitCounted();
        await app.tickTables(["basic", "dates_iso"]);
        // A Run waits one frame before it looks at the database; Export is pressed in the same turn
        // of the page, so that the export is running when the Run looks. (Nothing here waits for a
        // time: the export is held by the zip tool's request, and so is still running.)
        await page.evaluate(() => {
            document.querySelector("#execute").click();
            document.querySelector("#export-tables-submit").click();
        });
        await expect(app.tablesDialog.locator("#export-tables-progress-title")).toHaveText(words.EXPORT_TABLES_PROGRESS_LIBRARY);
        await expect.poll(() => held.requests()).toBe(1);
        await app.settle();
        expect(await app.readLog(key)).toBeNull();
        await expect(app.pane).toHaveAttribute("data-state", paneBefore);
        held.open();
        await expect(app.tablesDialog).toBeHidden();
        expect(await app.readLog(key)).toBeNull();
    });
});

// ---- the timer that looks at Cancel ----------------------------------------------------------------------------

test.describe("while the zip tool is awaited the page looks at Cancel every 100 ms, and stops looking when the wait ends", () => {
    test("one timer of that period runs while the zip tool is awaited, and none is left when the file is saved", async ({ page, app }) => {
        await openEdgeCases(app);
        await page.evaluate(() => {
            const started = [];
            const stopped = new Set();
            const start = window.setInterval;
            const stop = window.clearInterval;
            window.setInterval = (handler, ms, ...rest) => {
                const id = start(handler, ms, ...rest);
                if (ms === 100) {
                    started.push(id);
                }
                return id;
            };
            window.clearInterval = (id) => {
                stopped.add(id);
                return stop(id);
            };
            window.__looks = () => ({ started: started.length, running: started.filter((id) => !stopped.has(id)).length });
        });
        const looks = () => page.evaluate(() => window.__looks());
        const held = await holdExport(page, app);
        expect(await looks()).toEqual({ started: 1, running: 1 });
        await endHeld(app, held);
        expect(await looks()).toEqual({ started: 1, running: 0 });
    });
});

// ---- a course database -------------------------------------------------------------------------------------------

test.describe("an export from a course database", () => {
    // opens the dialog and gives the names of the first rows that can be ticked
    const tickable = async (app, count) => {
        await app.openTables();
        await app.waitCounted();
        return (await app.tablesRows()).filter((row) => row.tickable).slice(0, count).map((row) => row.name);
    };

    test("its event is kept under the database's own key, is in the evidence file, and verifies as VALID with an Events row", async ({ page, app }) => {
        await app.open(EXPORT_URL);
        const key = await logKey(page, DEFAULT_DATASET);
        // (the key of a course database is its id: not the "file:" key that a file of the same name would have)
        expect(key).toBe(await openLogKey(page));
        expect(key).not.toBe(await logKey(page));
        const [name] = await tickable(app, 1);
        await app.tickTables([name]);
        const file = await app.download(() => app.tablesSubmit.click());
        const events = (await eventsOf(page, [key])).found[key];
        expect(events).toHaveLength(1);
        expect(events[0].kind).toBe("export");
        expect(events[0].lines[0]).toBe(words.exportEventFileLine(file.name, file.buffer.length));
        expect(await eventKeys(page)).toEqual([`${words.EVENTS_PREFIX}${key}`]);
        // (the dialog can have stayed, with a note: it is no matter here)
        if (await app.tablesDialog.isVisible()) {
            await app.tablesCancel.click();
        }
        const evidence = await app.exportEvidence("U2034567");
        expect(evidence.text).toContain("event: export");
        expect(evidence.text).toContain(words.exportEventFileLine(file.name, file.buffer.length));
        // the verify page: VALID, the one event, the dataset
        await page.goto("verify.html");
        await page.locator("#evidence-file").setInputFiles({ name: evidence.name, mimeType: "text/plain", buffer: evidence.buffer });
        const result = page.locator("#verify-result");
        await expect(result).toContainText("VALID");
        await expect(result).not.toContainText("EDITED");
        await expect(result.locator("dt:has-text('Events') + dd")).toHaveText("1");
        await expect(result.locator("dt:has-text('Dataset') + dd")).toHaveText(DEFAULT_DATASET.id);
    });

    test("a zip is named after the database's own name, not after the label the switcher shows", async ({ page, app }) => {
        await app.open(EXPORT_URL);
        // what the page knows: the name of the open database (the dataset's file), and the label on the switcher
        const name = await page.evaluate(() => window.app.database.name);
        const label = (await app.databaseLabel.textContent()).trim();
        expect(name).toBe(path.posix.basename(DEFAULT_DATASET.file));
        const stem = name.replace(/\.(db|sqlite3?|sql)$/i, "");
        test.skip(label === stem, "this course database's label is its name: the test could not tell them apart");
        const two = await tickable(app, 2);
        test.skip(two.length < 2, "the default course database has fewer than two tables or views");
        await app.tickTables(two);
        const file = await app.download(() => app.tablesSubmit.click());
        expect(file.name).toBe(`${stem}-tables.zip`);
        expect(file.name).not.toContain(label);
        expect(readZip(file.buffer)).toHaveLength(2);
    });
});
