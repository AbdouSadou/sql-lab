const { test, expect } = require("./helpers");

const sqlFile = (name, sql) => ({ name, mimeType: "text/plain", buffer: Buffer.from(sql) });

// Names the app splices into SQL: spaces, both kinds of quote, and "$&" (a String.replace pattern).
const SPACED = `my "quoted" table`;
const TRICKY = `it's $& $1 a "b" table`;
const SQL = `
CREATE TABLE "my ""quoted"" table" (id INTEGER, label TEXT);
INSERT INTO "my ""quoted"" table" VALUES (1, 'one'), (2, 'two');
CREATE TABLE "it's $& $1 a ""b"" table" (code TEXT, qty INTEGER, note TEXT);
INSERT INTO "it's $& $1 a ""b"" table" VALUES ('x', 3, NULL);
`;

test("table names: a table named with spaces and quotes previews correctly", async ({ app }) => {
    await app.open();
    await app.upload(sqlFile("names.sql", SQL));

    await expect(app.status).toContainText("2 rows, took");
    expect((await app.editor.innerText()).trim()).toBe('select * from "my ""quoted"" table" limit 10');
    expect(await app.read()).toEqual({ columns: ["id", "label"], rows: [["1", "one"], ["2", "two"]] });
});

test("table names: the table list opens the schema of tables with awkward names", async ({ app, page }) => {
    await app.open();
    await app.upload(sqlFile("names.sql", SQL));

    await page.locator("#show-tables").click();
    const buttons = page.locator("#result table tbody button");
    await expect(buttons).toHaveText([SPACED, TRICKY]);

    await buttons.nth(0).click();
    await expect(app.status).toContainText(`tables / ${SPACED}:`);
    expect((await app.read()).rows.map((r) => r[1])).toEqual(["id", "label"]);

    await page.locator("#show-tables").click();
    await buttons.nth(1).click();
    await expect(app.status).toContainText(`tables / ${TRICKY}:`);
    expect((await app.read()).rows.map((r) => r[1])).toEqual(["code", "qty", "note"]);
});
