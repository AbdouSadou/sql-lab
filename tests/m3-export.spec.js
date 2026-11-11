// The export action: the Export menu of the top bar, its item "Database (.db)…" and the dialog that
// names the file and downloads the open in-memory database. AC3 (in ac3-upload-roundtrip.spec.js)
// covers the round trip; these cover the rest.
const fs = require("node:fs");
const { test, expect, SAMPLE_FILE } = require("./helpers");

// the summary line of a run with no result set (a CREATE, an INSERT, a DELETE): "Done in 2 ms" or
// "Done. 3 rows changed in 2 ms" (it was "0 rows, took 2 ms")
const DONE_LINE = /^Done(\. [\d,]+ rows? changed)? in \d+ ms$/;

// chooseExportOfEmpty chooses "Database (.db)…" in the Export menu with an empty database open: as
// the old export button did, it says at once that there is nothing to export; no dialog asks for a
// name first (a name typed there would only rename a database that cannot be saved).
async function chooseExportOfEmpty(app) {
    await app.openExportMenu();
    await app.exportButton.click();
    await expect(app.page.locator("#export-dialog")).toBeHidden();
}

test("export downloads the default dataset as a file named from the database", async ({ app }) => {
    await app.open();
    // the dialog says what the file holds (the old status line said it after the save)
    await app.openExportMenu();
    await app.exportButton.click();
    await expect(app.page.locator("#export-dialog")).toContainText("with your changes");
    await app.page.keyboard.press("Escape");
    await expect(app.page.locator("#export-dialog")).toBeHidden();
    const { name, buffer } = await app.exportFile();
    expect(name).toBe("northlight_retail.db");
    expect(buffer.subarray(0, 15).toString()).toBe("SQLite format 3");
    // a toast confirms it and names the file
    await expect(app.toast).toContainText("Exported northlight_retail.db");
});

test("export holds the student's changes, and re-uploading the file brings them back", async ({ page, app }) => {
    await app.open();
    await app.run("CREATE TABLE notes (id INTEGER PRIMARY KEY, body TEXT); INSERT INTO notes (body) VALUES ('kept'); DELETE FROM order_items;");
    await expect(app.status).toHaveText(DONE_LINE);
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
    const title = await page.title();
    const before = await page.evaluate(() => window.app.database.name);
    await chooseExportOfEmpty(app);
    // the refusal is a toast now (it was the status line)
    await expect(app.toast).toContainText("The database is empty, so there is nothing to export");
    // nothing was renamed on the way
    await expect(page).toHaveTitle(title);
    expect(await page.evaluate(() => window.app.database.name)).toBe(before);
    await page.waitForTimeout(300);
    expect(downloads).toBe(0);
    expect(pageErrors).toEqual([]);

    // once there is a table it exports; dropping everything makes it empty again
    await app.run("CREATE TABLE t (x); INSERT INTO t VALUES (1);");
    await expect(app.status).toHaveText(DONE_LINE);
    const { name } = await app.exportFile();
    expect(name).toBe("new.db");
    await app.run("DROP TABLE t;");
    await expect(app.status).toHaveText(DONE_LINE);
    await chooseExportOfEmpty(app);
    await expect(app.toast).toContainText("nothing to export");
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

test("the Export menu button is visible, labelled and touch-sized, at desktop and phone width", async ({ page, app }) => {
    for (const width of [1200, 360]) {
        await page.setViewportSize({ width, height: 800 });
        await app.open();
        const button = page.locator("#export-button");
        await expect(button).toBeVisible();
        await expect(button).toHaveText("Export");
        await expect(button).toHaveAttribute("aria-haspopup", "menu");
        expect((await button.boundingBox()).height, `${width}px: touch-sized`).toBeGreaterThanOrEqual(32);
        // the item that downloads says what it is for
        await button.click();
        await expect(app.exportButton).toBeVisible();
        await expect(app.exportButton).toContainText("Database (.db)…");
        await expect(app.exportButton).toContainText("Download");
        await page.keyboard.press("Escape");
        await expect(page.locator("#export-menu")).toBeHidden();
    }
});

test("the export is operable from the keyboard: Enter opens the menu, the dialog, then downloads", async ({ page, app }) => {
    await app.open();
    const button = page.locator("#export-button");
    await button.focus();
    expect(await button.evaluate((el) => el.tagName)).toBe("BUTTON");
    await page.keyboard.press("Enter");
    await expect(page.locator("#export-menu")).toBeVisible();
    await expect(app.exportButton).toBeFocused();
    expect(await app.exportButton.evaluate((el) => el.tagName)).toBe("BUTTON");
    await page.keyboard.press("Enter");
    await expect(page.locator("#export-dialog")).toBeVisible();
    await expect(page.locator("#export-name")).toBeFocused();
    const [download] = await Promise.all([page.waitForEvent("download"), page.keyboard.press("Enter")]);
    expect(download.suggestedFilename()).toBe("northlight_retail.db");
});
