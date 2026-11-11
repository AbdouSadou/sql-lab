const path = require("node:path");
const { test, expect, editorValue } = require("./helpers");

const SAMPLE = path.join(__dirname, "fixtures", "sample.db");
// Never finishes if it is run.
const RUNAWAY = "WITH RECURSIVE r(n) AS (SELECT 1 UNION ALL SELECT n + 1 FROM r) SELECT count(*) FROM r;";

test("restore: saved SQL comes back in the editor on reload and is not run", async ({ page, app }) => {
    await app.open();
    await app.query("SELECT 11 AS marker;");
    await page.reload();
    await app.waitReady();

    expect((await editorValue(page)).trim()).toBe("SELECT 11 AS marker;");
    await expect(app.status).toContainText("Press Run to execute it");
    await expect(app.table).toHaveCount(0);
    await expect(app.status).not.toContainText("took");
    // Run is usable straight away, and it runs the restored SQL
    await expect(page.locator("#execute")).toBeEnabled();
    await page.locator("#execute").click();
    expect(await app.read()).toEqual({ columns: ["marker"], rows: [["11"]] });
});

test("restore: a runaway query saved by an earlier session does not hang the page", async ({ page, app }) => {
    await page.addInitScript((sql) => {
        try {
            localStorage.setItem("sqlime.query.northlight_retail.db", sql);
        } catch {}
    }, RUNAWAY);
    await page.goto("./");
    await app.waitReady();
    expect((await editorValue(page)).trim()).toBe(RUNAWAY);

    // had it run, the tab would be stuck and this could not finish
    expect(await app.query("SELECT 7 AS seven;")).toEqual({ columns: ["seven"], rows: [["7"]] });
    await page.reload();
    await app.waitReady();
    await expect(app.table).toHaveCount(0);
});

test("restore: the built-in first-table preview still runs when nothing is saved", async ({ page, app }) => {
    await app.open();
    await app.upload(SAMPLE);
    await expect(app.status).toContainText("4 rows, took");
    expect((await editorValue(page)).trim()).toBe('select * from "fruit" limit 10');
    expect((await app.read()).rows).toHaveLength(4);
    // the preview is not the student's work, so it is not stored as their last query
    expect(await page.evaluate(() => localStorage.getItem("sqlime.query.sample.db"))).toBeNull();
});

test("restore: saved SQL for an opened file is restored, not run, and wins over the preview", async ({
    page,
    app,
}) => {
    await app.open();
    await app.upload(SAMPLE);
    await app.query("SELECT name FROM fruit WHERE id = 2;");
    await app.upload(SAMPLE); // open the same file again

    expect((await editorValue(page)).trim()).toBe("SELECT name FROM fruit WHERE id = 2;");
    await expect(app.status).toContainText("Press Run to execute it");
    await expect(app.table).toHaveCount(0);
});

test("restore: renaming moves the SQL that was run, and not the built-in preview", async ({ page, app }) => {
    await app.open();
    await app.upload(SAMPLE);
    await app.rename("renamed.db");
    // only a preview had run, so there is nothing of the student's to move
    expect(await app.storedQueries()).toEqual([]);

    await app.query("SELECT 3 AS three;");
    expect(await app.storedQueries()).toEqual([["sqlime.query.renamed.db", "SELECT 3 AS three;"]]);
    await app.rename("again.db");
    expect(await app.storedQueries()).toEqual([["sqlime.query.again.db", "SELECT 3 AS three;"]]);
});
