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

test("table names: the Schema tab lists tables with awkward names, shows their columns and inserts their quoted names", async ({ app, page }) => {
    await app.open();
    await app.upload(sqlFile("names.sql", SQL));
    await expect(app.status).toContainText("2 rows, took");
    const statusBefore = await app.status.textContent();
    const resultBefore = await app.read();

    // the names are on the rows as text, in the order the tab sorts them (case-insensitive)
    await expect(page.locator("#schema .schema-row .schema-insert")).toHaveText([TRICKY, SPACED]);

    // the arrow opens the columns, read from PRAGMA table_info on the quoted name
    await app.schemaExpand(SPACED).click();
    expect(await app.schemaColumns(SPACED)).toEqual([
        { name: "id", type: "INTEGER" },
        { name: "label", type: "TEXT" },
    ]);
    await app.schemaExpand(TRICKY).click();
    expect(await app.schemaColumns(TRICKY)).toEqual([
        { name: "code", type: "TEXT" },
        { name: "qty", type: "INTEGER" },
        { name: "note", type: "TEXT" },
    ]);

    // the name button puts the quoted name in the editor ("$&" and "$1" are not replacement patterns)
    await app.editor.fill("");
    await app.schemaInsert(SPACED).click();
    expect((await app.editor.innerText()).trim()).toBe('"my ""quoted"" table"');
    await app.editor.fill("");
    await app.schemaInsert(TRICKY).click();
    expect((await app.editor.innerText()).trim()).toBe('"it\'s $& $1 a ""b"" table"');
    await app.schemaColumn(TRICKY, "qty").click();
    expect((await app.editor.innerText()).trim()).toBe('"it\'s $& $1 a ""b"" table" qty');

    // nothing ran: the status and the result are what the upload's preview left
    await expect(app.status).toHaveText(statusBefore);
    expect(await app.read()).toEqual(resultBefore);

    // and the inserted text is a name the database accepts
    await app.editor.fill("select * from ");
    await app.schemaInsert(TRICKY).click();
    await app.editor.press("Control+Enter");
    await expect(app.status).toContainText("1 row, took");
    expect((await app.read()).rows).toEqual([["x", "3", ""]]); // a NULL is drawn as an empty cell
    await app.expectInert();
});
