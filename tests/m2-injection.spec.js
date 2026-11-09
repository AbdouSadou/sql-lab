const path = require("node:path");
const { test, expect, PAYLOAD, ATTR_PAYLOAD, quoteIdent } = require("./helpers");

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
    expect(rows[0][1]).toBe("line1line2"); // the line break is a <br>
    await expect(app.table.locator("td br")).toHaveCount(1);
    await app.expectInert();
});

test("injection: markup echoed in an error message is shown as text", async ({ app, pageErrors }) => {
    await app.open();
    await app.run(`SELECT * FROM ${quoteIdent(PAYLOAD)};`);
    await expect(app.status).toContainText(`no such table: ${PAYLOAD}`);
    await app.expectInert();

    await app.run(`SELECT * FROM ${quoteIdent(ATTR_PAYLOAD)};`);
    await expect(app.status).toContainText(`no such table: ${ATTR_PAYLOAD}`);
    await app.expectInert();

    // a failing run is reported in the status area only; nothing is thrown at the page
    expect(pageErrors).toEqual([]);
});

test("injection: markup in table names is shown as text in the list, the schema view and the preview", async ({
    app,
    page,
    pageErrors,
}) => {
    const names = [ATTR_PAYLOAD, PAYLOAD];
    const sql = names.map((n) => `CREATE TABLE ${quoteIdent(n)} (id INTEGER, label TEXT); INSERT INTO ${quoteIdent(n)} VALUES (1, 'x');`).join("\n");
    await app.open();
    await app.upload(sqlFile("evil.sql", sql));
    // the built-in preview of the first table ran, with the name quoted
    await expect(app.status).toContainText("1 rows, took");
    await app.expectInert();

    await page.locator("#show-tables").click();
    await expect(app.status).toContainText("2 tables:");
    const buttons = page.locator("#result table tbody button");
    await expect(buttons).toHaveCount(2);
    await expect(buttons.nth(0)).toHaveText(ATTR_PAYLOAD);
    await expect(buttons.nth(1)).toHaveText(PAYLOAD);
    expect(await buttons.nth(0).getAttribute("data-arg")).toBe(ATTR_PAYLOAD);
    await app.expectInert();

    for (const [i, name] of names.entries()) {
        await page.locator("#show-tables").click();
        await buttons.nth(i).click();
        await expect(app.status).toContainText(`tables / ${name}:`);
        expect((await app.read()).rows.map((r) => r[1])).toEqual(["id", "label"]);
        await app.expectInert();
    }
    expect(pageErrors).toEqual([]);
});

test("injection: markup in uploaded file names is shown as text or not at all", async ({ app, page }) => {
    const name = `${PAYLOAD}.db`;
    await app.open();
    await app.upload({ name, mimeType: "application/octet-stream", buffer: require("node:fs").readFileSync(SAMPLE) });
    await expect(page.locator("#db-name")).toHaveText(new RegExp(PAYLOAD.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
    expect(await page.title()).toBe(`${name} - SQL Lab`);
    await app.expectInert();

    // an upload that is not a database: the engine's error, plus the file's name, shown as text
    await app.upload({ name: `${ATTR_PAYLOAD}.db`, mimeType: "application/octet-stream", buffer: Buffer.from("not a database, just some text that is long enough") }, { ready: false });
    await expect(app.status).toContainText("Failed to load database");
    await app.expectInert();

    await page.waitForTimeout(200);
    await app.expectInert();
});

test("injection: markup in URL fragments and in the open-url prompt is shown as text", async ({ app, page, net }) => {
    // a fragment typed into the address bar (the browser percent-encodes it)
    await page.goto(`./#${PAYLOAD}`);
    await expect(app.status).toContainText("Failed to load database from");
    await app.expectInert();

    // the same through the prompt, which hands the raw string to the page
    await page.goto("./");
    await app.waitReady();
    page.on("dialog", (dialog) => dialog.accept(PAYLOAD + ".db"));
    await page.keyboard.press("Control+u");
    await expect(app.status).toContainText(`Failed to load database from URL ${PAYLOAD}.db`);
    await app.expectInert();

    // unsupported addresses echo the value too
    await page.evaluate((p) => (location.hash = `#gist:${p}`), PAYLOAD);
    await expect(app.status).toContainText("unsupported address");
    await app.expectInert();
    await page.waitForTimeout(200);
    await app.expectInert();
    net.expectNoExternalRequests();
});

test("injection: pasting markup into the editor inserts text, not elements", async ({ app, page }) => {
    await app.openEmpty();
    await app.editor.click();
    await app.editor.evaluate((el, text) => {
        // A plain event with a clipboardData stand-in: Firefox empties the clipboardData
        // of synthetic ClipboardEvents, and the handler only needs getData().
        const event = new Event("paste", { bubbles: true, cancelable: true });
        Object.defineProperty(event, "clipboardData", { value: { getData: () => text } });
        el.dispatchEvent(event);
    }, `SELECT '${PAYLOAD}' AS pasted`);
    expect(await app.editor.innerText()).toBe(`SELECT '${PAYLOAD}' AS pasted`);
    await expect(app.editor.locator("*")).toHaveCount(0);
    await app.expectInert();
    await page.keyboard.press("Control+Enter");
    expect((await app.read()).rows).toEqual([[PAYLOAD]]);
    await app.expectInert();
});

test("injection: saved SQL that holds markup is restored as text", async ({ app, page }) => {
    await page.addInitScript((p) => {
        try {
            localStorage.setItem("sqlime.query.northlight_retail.db", `SELECT '${p}' AS v`);
        } catch {}
    }, PAYLOAD);
    await page.goto("./");
    await app.waitReady();
    expect(await app.editor.innerText()).toBe(`SELECT '${PAYLOAD}' AS v`);
    await app.expectInert();
});

test("injection: markup echoed by the engine while a .sql file loads is shown as text", async ({ app }) => {
    await app.open();
    // The script fails on a table that does not exist; the engine's message repeats the
    // name, and start() puts "Failed to load database from sql script: <message>" in the
    // status area.
    for (const payload of [PAYLOAD, ATTR_PAYLOAD]) {
        await app.upload(sqlFile("bad.sql", `SELECT * FROM ${quoteIdent(payload)};`), { ready: false });
        await expect(app.status).toContainText(`Failed to load database from sql script`);
        await expect(app.status).toContainText(`no such table: ${payload}`);
        await app.expectInert();
    }
});
