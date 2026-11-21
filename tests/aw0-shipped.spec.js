const path = require("node:path");
const { pathToFileURL } = require("node:url");
const { test, expect, csvFile, workbookFile, readZip, lineFit, NORTHLIGHT_URL } = require("./helpers");

// The page as it ships (the plain address, no parameter): the import of CSV files, the export of
// tables as CSV and the import of Excel workbooks are all on, and the evidence file keeps what
// they did. The other tests of these features each open a state of the flags of their own; this
// one runs the three together, as a student's hour does, and then reads the evidence file that
// comes out of it: its version, the order of what happened, and what the check page says of it.
//   - two CSV files and a workbook of two sheets are chosen at once and imported into a new database
//   - a query is run on a table of each, one more CSV file is imported into the open database
//   - two tables are exported (a zip) and one alone (a CSV file)
//   - the evidence file lists the imports and the exports, with the queries between them
// The words are the config's: nothing a student reads is typed again here.

const load = (file) => import(pathToFileURL(path.join(__dirname, "..", "js", "lab", file)).href);

const DATABASE = "class_work";
const STOCK = csvFile("stock.csv", "item,qty\nbolt,10\nnut,20\n");
const SUPPLIERS = csvFile("suppliers.csv", "id,name\n1,Acme\n2,Bolt Ltd\n");
const SHOP = workbookFile("shop.xlsx", [
    { name: "Staff", rows: [["id", "name"], [1, "Ann"], [2, "Bob"], [3, "Cy"]] },
    { name: "Rotas", rows: [["day", "who"], ["Mon", 1]] },
]);
const RETURNS = csvFile("returns.csv", "item,why\nbolt,bent\n");

test("the three features together on the plain address, and the evidence file that records them", async ({ page, app, net, context }) => {
    const config = await load("config.js");
    const words = await load("config-workflow.js");
    const evidence = await load("evidence.js");

    // the page that ships: a named dataset is open, and none of the three needs a parameter
    await app.open(NORTHLIGHT_URL);
    expect(new URL(page.url()).searchParams.has("preview")).toBe(false);

    // two CSV files and a workbook of two sheets, chosen at once, into a new database
    await app.importFiles([STOCK, SUPPLIERS, SHOP], { database: DATABASE });
    expect((await app.rows("SELECT name FROM sqlite_schema WHERE type = 'table' ORDER BY name")).flat()).toEqual(["Rotas", "Staff", "stock", "suppliers"]);
    await expect(app.pane).toContainText(words.importedMessage(4, DATABASE));

    // a query on a table from a CSV file and one from a sheet
    await app.run("SELECT SUM(qty) AS total FROM stock");
    expect(await app.read()).toMatchObject({ rows: [["30"]] });
    await app.run("SELECT name FROM Staff ORDER BY id DESC");
    expect(await app.read()).toMatchObject({ rows: [["Cy"], ["Bob"], ["Ann"]] });

    // one more CSV file into the database that is open: the tables are added to it
    await app.importFiles([RETURNS], { into: "open" });
    expect((await app.rows("SELECT name FROM sqlite_schema WHERE type = 'table' ORDER BY name")).flat()).toEqual(["Rotas", "Staff", "returns", "stock", "suppliers"]);
    await app.run("SELECT why FROM returns");
    expect(await app.read()).toMatchObject({ rows: [["bent"]] });

    // two tables as a zip, then one alone as a CSV file
    const zip = await app.exportTables(["stock", "returns"]);
    expect(zip.name).toMatch(/-tables\.zip$/);
    expect(readZip(zip.buffer).map((entry) => entry.name).sort()).toEqual(["returns.csv", "stock.csv"]);
    await expect(app.tablesDialog).toBeHidden();
    const one = await app.exportTables(["Staff"]);
    expect(one.name).toBe("Staff.csv");
    await expect(app.tablesDialog).toBeHidden();

    // the evidence file: version 2, and the events among the queries in the order they happened
    const file = await app.exportEvidence("U2034567");
    const lines = file.text.split("\n");
    expect(lines[0]).toMatch(/ evidence export v2$/);
    expect(lines[1]).toBe(`dataset: file:${DATABASE}`);
    const headers = lines.filter((line) => /^\[\d+\] /.test(line)).map((line) => line.replace(/^\[(\d+)\] \S+ · /, "$1 "));
    expect(headers).toEqual([
        "1 event: import",
        "2 event: import",
        "3 event: import",
        "4 1 row",
        "5 3 rows",
        "6 event: import",
        "7 1 row",
        "8 event: export",
        "9 event: export",
    ]);
    // what each event says it took in or saved
    const body = file.text;
    expect(body).toContain("event: import\nfile: stock.csv,");
    expect(body).toContain("\nfile: suppliers.csv,");
    expect(body).toMatch(/\nfile: shop\.xlsx, \d+ bytes\ntable: Staff, 3 rows, 2 columns, Staff\ntable: Rotas, 1 rows, 2 columns, Rotas\n/);
    expect(body).toMatch(/event: import\nfile: returns\.csv, \d+ bytes\ntable: returns, 1 rows, 2 columns\n/);
    // an export lists its file with its size, and each table with its rows (and, in a zip, the file it became)
    expect(body).toContain(`event: export\nfile: ${zip.name}, ${zip.buffer.length} bytes\ntable: returns, 1 rows, returns.csv\ntable: stock, 2 rows, stock.csv\n`);
    expect(body).toContain(`event: export\nfile: Staff.csv, ${one.buffer.length} bytes\ntable: Staff, 3 rows\n`);

    // the check page's own code says the file is valid, and how many queries and events it holds
    const verdict = await evidence.verifyEvidence(file.text);
    expect(verdict).toMatchObject({ status: "valid", student: "U2034567", queries: 3, events: 6, dataset: `file:${DATABASE}` });

    // and so does the check page itself: choosing a file checks it
    const check = await context.newPage();
    await check.goto("verify.html");
    await check.locator("#evidence-file").setInputFiles({ name: file.name, mimeType: "text/plain", buffer: file.buffer });
    await expect(check.locator("#verify-result .verdict-word")).toHaveText(config.VERIFY_VALID_WORD);
    await expect(check.locator("#verify-result .verdict-details")).toContainText("Queries3");
    await expect(check.locator("#verify-result .verdict-details")).toContainText("Events6");

    net.expectNoExternalRequests();
    net.expectNoSameOriginFailures();
});

// Two faults that the three features brought to light on the page as it ships, and what holds each
// now that it is mended.

test.describe("what the three features brought to light", () => {
    // At 320 px wide the database menu is 248 px wide, too narrow for the line under "Open a file…":
    // the line wraps there and is not cut with an ellipsis (css/menu.css). From 360 px it is one line
    // (tests/ui6-responsive.spec.js, with the other lines of the menus).
    test("the line under Open a file… is whole at 320 px wide", async ({ page, app }) => {
        const words = await load("config-workflow.js");
        await page.setViewportSize({ width: 320, height: 640 });
        await app.open(NORTHLIGHT_URL);
        await app.databaseButton.click();
        const line = app.databaseMenu.locator("#open-file .menu-item-description");
        await expect(line).toBeVisible();
        await expect(line).toHaveText(words.OPEN_FILE_WITH_EXCEL_DESCRIPTION);
        expect((await lineFit(line)).cut).toBe(false);
    });

    // The line under "Open from URL…" is whole at 320 px, so only a window narrower than that shows
    // whether it wraps too (css/menu.css has one rule for both lines). At 280 px, the width of the
    // narrowest phones (a folded one), the menu is 208 px wide and the line is drawn on two lines.
    test("the line under Open from URL… is whole at 280 px wide", async ({ page, app }) => {
        const words = await load("config.js");
        await page.setViewportSize({ width: 280, height: 640 });
        await app.open(NORTHLIGHT_URL);
        await app.databaseButton.click();
        const line = app.databaseMenu.locator("#open-url .menu-item-description");
        await expect(line).toBeVisible();
        await expect(line).toHaveText(words.OPEN_URL_DESCRIPTION);
        const fit = await lineFit(line);
        expect(fit.cut).toBe(false);
        // the menu is narrower than the line here: if this is one line, the window must be made narrower
        expect(fit.lines).toBeGreaterThan(1);
    });

    // Ctrl+O used to reach the page under the evidence dialog: the file chooser opened, and a CSV
    // file chosen there opened the import's dialog on top of the first. The page now asks for no
    // file while a dialog is open (js/index.js, jobInTheWay). tests/ui4-review.spec.js holds the
    // same for each dialog, for Ctrl+U, and with every flag off.
    test("Ctrl+O under the evidence dialog asks for no file and opens no second dialog", async ({ page, app }) => {
        await app.open(NORTHLIGHT_URL);
        await app.run("SELECT 1");
        // how often the page asks for a file: it clicks its hidden file input, in the key's own event
        await page.evaluate(() => {
            window.__asked = 0;
            document.querySelector("#open-file-input").addEventListener("click", () => {
                window.__asked += 1;
            });
        });
        const choosers = [];
        page.on("filechooser", (chooser) => choosers.push(chooser));
        await app.openEvidence();
        await expect(app.evidenceDialog).toBeVisible();
        await page.keyboard.press("Control+o");
        expect(await page.evaluate(() => window.__asked)).toBe(0);
        expect(await page.evaluate(() => [...document.querySelectorAll("dialog[open]")].map((dialog) => dialog.id))).toEqual(["evidence-dialog"]);
        // with the dialog closed the key asks for a file again, and a CSV file chosen then opens the import's dialog alone
        await page.keyboard.press("Escape");
        await expect(app.evidenceDialog).toBeHidden();
        await page.keyboard.press("Control+o");
        await expect.poll(() => choosers.length).toBe(1);
        expect(await page.evaluate(() => window.__asked)).toBe(1);
        await choosers[0].setFiles([STOCK]);
        await expect(app.importDialog).toBeVisible();
        expect(await page.evaluate(() => [...document.querySelectorAll("dialog[open]")].map((dialog) => dialog.id))).toEqual(["import-dialog"]);
    });
});
