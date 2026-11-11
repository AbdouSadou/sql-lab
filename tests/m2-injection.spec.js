const path = require("node:path");
const { test, expect, PAYLOAD, ATTR_PAYLOAD, quoteIdent, expectSchemaIconsOnly, editorValue, expectEditorTextOnly } = require("./helpers");

const SAMPLE = path.join(__dirname, "fixtures", "sample.db");
const sqlFile = (name, sql) => ({ name, mimeType: "text/plain", buffer: Buffer.from(sql) });

// Each test feeds markup through one route into the page and asserts two things:
// the text is shown literally (so it was escaped, not dropped), and no element or
// script came out of it.

test("injection: markup in column aliases is shown as text in the header", async ({ app, page }) => {
    await app.open();
    await app.run(`SELECT 1 AS ${quoteIdent(PAYLOAD)}, 2 AS ${quoteIdent(ATTR_PAYLOAD)};`);
    const { columns } = await app.read();
    expect(columns).toEqual([PAYLOAD, ATTR_PAYLOAD]);
    await app.expectInert();
    await page.waitForTimeout(200); // an <img onerror> would have fired by now
    await app.expectInert();
});

test("injection: markup in cell values is shown as text", async ({ app }) => {
    await app.open();
    await app.run(`SELECT '${PAYLOAD}' AS v, 'line1\nline2' AS multi, NULL AS n, x'0102' AS b;`);
    const { rows } = await app.read();
    expect(rows[0][0]).toBe(PAYLOAD);
    // the line break stays a line break in the text (the cell keeps it: white-space: pre); no element is made for it
    expect(rows[0][1]).toBe("line1\nline2");
    await expect(app.table.locator("td br")).toHaveCount(0);
    expect(await app.table.locator("td").nth(1).evaluate((td) => getComputedStyle(td).whiteSpace)).toBe("pre");
    // NULL reads as the word NULL in its own span; a blob as a blob literal
    expect(rows[0][2]).toBe("NULL");
    await expect(app.table.locator("td .cell-null")).toHaveCount(1);
    expect(rows[0][3]).toBe("x'0102'");
    await app.expectInert();
});

test("injection: markup echoed in an error message is shown as text", async ({ app, pageErrors }) => {
    await app.open();
    // the error band shows SQLite's message verbatim, and the statement as written, both as text
    await app.run(`SELECT * FROM ${quoteIdent(PAYLOAD)};`);
    await expect(app.pane).toHaveAttribute("data-state", "error");
    await expect(app.errorBand.locator(".results-band-message")).toContainText(`no such table: ${PAYLOAD}`);
    await expect(app.errorBand.locator(".results-band-quote")).toHaveText(`SELECT * FROM ${quoteIdent(PAYLOAD)};`);
    await expect(app.announcer).toContainText(`This query has an error: no such table: ${PAYLOAD}`);
    await app.expectInert();

    await app.run(`SELECT * FROM ${quoteIdent(ATTR_PAYLOAD)};`);
    await expect(app.pane).toHaveAttribute("data-state", "error");
    await expect(app.errorBand.locator(".results-band-message")).toContainText(`no such table: ${ATTR_PAYLOAD}`);
    await expect(app.errorBand.locator(".results-band-quote")).toHaveText(`SELECT * FROM ${quoteIdent(ATTR_PAYLOAD)};`);
    await expect(app.announcer).toContainText(`This query has an error: no such table: ${ATTR_PAYLOAD}`);
    await app.expectInert();

    // a failing run is reported in the results pane only; nothing is thrown at the page
    expect(pageErrors).toEqual([]);
});

test("injection: markup in table names is shown as text in the Schema tab and the sample", async ({
    app,
    page,
    pageErrors,
}) => {
    const names = [PAYLOAD, ATTR_PAYLOAD]; // the order the Schema tab sorts them in
    const sql = names.map((n) => `CREATE TABLE ${quoteIdent(n)} (id INTEGER, label TEXT); INSERT INTO ${quoteIdent(n)} VALUES (1, 'x');`).join("\n");
    await app.open();
    await app.upload(sqlFile("evil.sql", sql));
    // nothing ran on its own; the first table is offered as a sample, with the name quoted, as text
    await expect(app.pane).toHaveAttribute("data-state", "empty");
    await expect(app.samples).toHaveCount(1);
    await expect(app.samples.locator(".results-sample-label")).toHaveText(`First 10 rows of ${PAYLOAD}`);
    await expect(app.samples.locator(".results-sample-sql")).toHaveText(`SELECT * FROM ${quoteIdent(PAYLOAD)} LIMIT 10;`);
    await app.expectInert();
    // choosing it fills the editor (as text) and runs nothing; Run then shows the one row
    await app.samples.click();
    expect((await editorValue(page)).trim()).toBe(`SELECT * FROM ${quoteIdent(PAYLOAD)} LIMIT 10;`);
    await expectEditorTextOnly(page);
    await expect(app.pane).toHaveAttribute("data-state", "empty");
    await app.editor.press("Control+Enter");
    await app.settle();
    await expect(app.status).toHaveText(/^1 row in \d+ ms$/);
    expect((await app.read()).rows).toEqual([[`1`, "x"]]);
    await app.expectInert();

    // the Schema tab (shown by default) lists both names as text
    const rows = page.locator("#schema .schema-row .schema-insert");
    await expect(rows).toHaveCount(2);
    await expect(rows.nth(0)).toHaveText(PAYLOAD);
    await expect(rows.nth(1)).toHaveText(ATTR_PAYLOAD);
    // the name also reaches an attribute (the button's label) whole, without breaking out of it
    expect(await rows.nth(1).getAttribute("aria-label")).toBe(`Insert table name ${ATTR_PAYLOAD} into the query`);
    await expectSchemaIconsOnly(page);
    await app.expectInert();

    const statusBefore = await app.status.textContent();
    for (const name of names) {
        // the arrow shows the columns, read with PRAGMA table_info on the quoted name
        await app.schemaExpand(name).click();
        expect((await app.schemaColumns(name)).map((c) => c.name)).toEqual(["id", "label"]);
        await expectSchemaIconsOnly(page);
        await app.expectInert();
        // the name button inserts the quoted name as text; nothing runs, no element is made
        await app.editor.fill("");
        await app.schemaInsert(name).click();
        expect((await editorValue(page)).trim()).toBe(quoteIdent(name));
        await expectEditorTextOnly(page);
        await expect(app.status).toHaveText(statusBefore);
        await app.expectInert();
    }
    await page.waitForTimeout(200); // an <img onerror> would have fired by now
    await app.expectInert();
    expect(pageErrors).toEqual([]);
});

test("injection: markup in uploaded file names is shown as text or not at all", async ({ app, page }) => {
    const name = `${PAYLOAD}.db`;
    await app.open();
    await app.upload({ name, mimeType: "application/octet-stream", buffer: require("node:fs").readFileSync(SAMPLE) });
    // the file name is the database's name: on the switcher button and in the status bar, as text
    const shown = new RegExp(PAYLOAD.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
    await expect(app.databaseLabel).toHaveText(shown);
    await expect(page.locator("#status-database")).toHaveText(shown);
    expect(await app.databaseButton.getAttribute("aria-label")).toBe(`Database: ${name}`);
    expect(await page.title()).toBe(`${name} - SQL Lab`);
    await app.expectInert();

    // an upload that is not a database: the engine's error, plus the file's name, shown as text
    await app.upload({ name: `${ATTR_PAYLOAD}.db`, mimeType: "application/octet-stream", buffer: Buffer.from("not a database, just some text that is long enough") }, { ready: false });
    await expect(app.errorBand.locator(".results-band-text")).toContainText("Failed to load database");
    await app.expectInert();

    await page.waitForTimeout(200);
    await app.expectInert();
});

test("injection: markup in URL fragments and in the open-url dialog is shown as text", async ({ app, page, net }) => {
    // a fragment typed into the address bar (the browser percent-encodes it)
    await page.goto(`./#${PAYLOAD}`);
    await expect(app.errorBand.locator(".results-band-text")).toContainText("Failed to load database from");
    await app.expectInert();

    // the same through the Open from URL dialog, which hands the typed string to the page
    await page.goto("./");
    await app.waitReady();
    await page.keyboard.press("Control+u");
    const dialog = page.locator("#open-url-dialog");
    await expect(dialog).toBeVisible();
    await page.locator("#open-url-input").fill(PAYLOAD + ".db");
    await page.keyboard.press("Enter");
    await expect(app.errorBand.locator(".results-band-text")).toContainText(`Failed to load database from URL ${PAYLOAD}.db`);
    await app.expectInert();

    // an unsupported address typed into the dialog is refused inline, as text, and nothing is requested
    await page.goto("./");
    await app.waitReady();
    net.clear();
    await page.keyboard.press("Control+u");
    await expect(dialog).toBeVisible();
    await page.locator("#open-url-input").fill(`gist:${PAYLOAD}`);
    await page.keyboard.press("Enter");
    await expect(page.locator("#open-url-error")).toContainText("This address cannot be opened");
    await expect(dialog).toBeVisible();
    await app.expectInert();
    expect(net.network).toEqual([]);
    await page.keyboard.press("Escape");
    await expect(dialog).toBeHidden();

    // unsupported addresses in the page's own address echo the value too
    await page.evaluate((p) => (location.hash = `#gist:${p}`), PAYLOAD);
    await expect(app.errorBand.locator(".results-band-text")).toContainText("unsupported address");
    await app.expectInert();
    await page.waitForTimeout(200);
    await app.expectInert();
    net.expectNoExternalRequests();
});

for (const plain of [false, true]) {
test(`injection: pasting markup into the editor inserts text, not elements${plain ? ", plain editor" : ""}`, async ({ app, page }) => {
    // the plain editor (the box that stays when vendor/editor.js does not load) pastes with its own
    // handler (js/components/sqlime-editor.js onPaste); CodeMirror with its own
    if (plain) {
        await page.route("**/vendor/editor.js", (route) => route.abort());
    }
    await app.openEmpty();
    await expect(page.locator("#editor")).toHaveAttribute("data-editor", plain ? "plain" : "code");
    await app.editor.click();
    await app.editor.evaluate((el, text) => {
        // A plain event with a clipboardData stand-in: Firefox empties the clipboardData
        // of synthetic ClipboardEvents, and the handler only needs getData().
        const event = new Event("paste", { bubbles: true, cancelable: true });
        Object.defineProperty(event, "clipboardData", { value: { getData: () => text } });
        el.dispatchEvent(event);
    }, `SELECT '${PAYLOAD}' AS pasted`);
    expect(await editorValue(page)).toBe(`SELECT '${PAYLOAD}' AS pasted`);
    await expectEditorTextOnly(page);
    await app.expectInert();
    await page.keyboard.press("Control+Enter");
    await app.settle();
    expect((await app.read()).rows).toEqual([[PAYLOAD]]);
    await app.expectInert();
});
}

test("injection: saved SQL that holds markup is restored as text", async ({ app, page }) => {
    await page.addInitScript((p) => {
        try {
            localStorage.setItem("sqlime.query.northlight_retail.db", `SELECT '${p}' AS v`);
        } catch {}
    }, PAYLOAD);
    await page.goto("./");
    await app.waitReady();
    expect(await editorValue(page)).toBe(`SELECT '${PAYLOAD}' AS v`);
    await app.expectInert();
});

test("injection: markup echoed by the engine while a .sql file loads is shown as text", async ({ app }) => {
    await app.open();
    // The script fails on a table that does not exist; the engine's message repeats the
    // name, and start() puts "Failed to load database from sql script: <message>" in the
    // error band.
    for (const payload of [PAYLOAD, ATTR_PAYLOAD]) {
        await app.upload(sqlFile("bad.sql", `SELECT * FROM ${quoteIdent(payload)};`), { ready: false });
        await expect(app.errorBand.locator(".results-band-text")).toContainText(`Failed to load database from sql script`);
        await expect(app.errorBand.locator(".results-band-text")).toContainText(`no such table: ${payload}`);
        await app.expectInert();
    }
});
