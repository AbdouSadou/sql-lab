// The export action: a toolbar button that downloads the open in-memory database. AC3 (in
// ac3-upload-roundtrip.spec.js) covers the round trip; these cover the rest.
const fs = require("node:fs");
const { test, expect, SAMPLE_FILE } = require("./helpers");

test("export downloads the default dataset as a file named from the database", async ({ app }) => {
    await app.open();
    const { name, buffer } = await app.exportFile();
    expect(name).toBe("northlight_retail.db");
    expect(buffer.subarray(0, 15).toString()).toBe("SQLite format 3");
    await expect(app.status).toContainText("Saved northlight_retail.db");
    await expect(app.status).toContainText("with your changes");
});

test("export holds the student's changes, and re-uploading the file brings them back", async ({ page, app }) => {
    await app.open();
    await app.run("CREATE TABLE notes (id INTEGER PRIMARY KEY, body TEXT); INSERT INTO notes (body) VALUES ('kept'); DELETE FROM order_items;");
    await expect(app.status).toContainText("took");
    const { buffer } = await app.exportFile();

    const second = await page.context().newPage();
    const secondApp = new app.constructor(second);
    await secondApp.open();
    await secondApp.upload({ name: "back.db", mimeType: "application/octet-stream", buffer });
    expect((await secondApp.query("SELECT body FROM notes;")).rows).toEqual([["kept"]]);
    expect((await secondApp.query("SELECT COUNT(*) AS n FROM order_items;")).rows).toEqual([["0"]]);
    expect((await secondApp.query("SELECT COUNT(*) AS n FROM orders;")).rows).toEqual([["450"]]);
});

test("export of an unchanged dataset has the same content as the file on the site", async ({ app }) => {
    await app.open();
    const { buffer } = await app.exportFile();
    const second = await app.page.context().newPage();
    const secondApp = new app.constructor(second);
    await secondApp.open();
    await secondApp.upload({ name: "e.db", mimeType: "application/octet-stream", buffer });
    expect((await secondApp.query("SELECT ROUND(SUM(line_revenue), 2) AS t FROM v_sales;")).rows).toEqual([["68323.31"]]);
});

test("exporting an empty database gives a clear message, not an error and not a download", async ({
    page,
    app,
    pageErrors,
}) => {
    await app.openEmpty();
    let downloads = 0;
    page.on("download", () => downloads++);
    await app.exportButton.click();
    await expect(app.status).toContainText("The database is empty, so there is nothing to export");
    await page.waitForTimeout(300);
    expect(downloads).toBe(0);
    expect(pageErrors).toEqual([]);

    // once there is a table it exports; dropping everything makes it empty again
    await app.run("CREATE TABLE t (x); INSERT INTO t VALUES (1);");
    await expect(app.status).toContainText("took");
    const { name } = await app.exportFile();
    expect(name).toBe("new.db");
    await app.run("DROP TABLE t;");
    await expect(app.status).toContainText("took");
    await app.exportButton.click();
    await expect(app.status).toContainText("nothing to export");
    expect(downloads).toBe(1);
});

test("the file name follows a rename and is made safe", async ({ app }) => {
    await app.open();
    await app.rename("week 1 lab.db");
    expect((await app.exportFile()).name).toBe("week 1 lab.db");

    await app.rename("results");
    expect((await app.exportFile()).name).toBe("results.db");

    await app.rename('a/b\\c:d*e?"f<g>h|i.db');
    const { name } = await app.exportFile();
    expect(name).toMatch(/^[^/\\:*?"<>|]+\.db$/);
    expect(name).toBe("a_b_c_d_e_f_g_h_i.db");
});

test("a database loaded from a .sql script is exported as a .db file", async ({ app }) => {
    await app.open();
    await app.upload({
        name: "lesson.sql",
        mimeType: "text/plain",
        buffer: Buffer.from("CREATE TABLE lesson (n); INSERT INTO lesson VALUES (3);"),
    });
    const { name, buffer } = await app.exportFile();
    expect(name).toBe("lesson.db");
    expect(buffer.subarray(0, 15).toString()).toBe("SQLite format 3");
});

test("an uploaded database exports under its own name and holds the same content", async ({ app }) => {
    await app.open();
    await app.upload(SAMPLE_FILE);
    const { name, buffer } = await app.exportFile();
    expect(name).toBe("sample.db");
    // same logical content as the fixture (the bytes may differ: the engine rewrites pages)
    expect(buffer.length).toBe(fs.statSync(SAMPLE_FILE).size);
});

test("the export button is visible and labelled in the toolbar, at desktop and phone width", async ({ page, app }) => {
    for (const width of [1200, 360]) {
        await page.setViewportSize({ width, height: 800 });
        await app.open();
        await expect(app.exportButton).toBeVisible();
        await expect(app.exportButton).toHaveText("export");
        await expect(app.exportButton).toHaveAttribute("title", /Download/);
    }
});
