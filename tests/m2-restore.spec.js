const path = require("node:path");
const { test, expect, editorValue, NORTHLIGHT_URL } = require("./helpers");

const SAMPLE = path.join(__dirname, "fixtures", "sample.db");
// Never finishes if it is run.
const RUNAWAY = "WITH RECURSIVE r(n) AS (SELECT 1 UNION ALL SELECT n + 1 FROM r) SELECT count(*) FROM r;";

test("restore: saved SQL comes back in the editor on reload and is not run", async ({ page, app }) => {
    await app.open();
    await app.query("SELECT 11 AS marker;");
    await page.reload();
    await app.waitReady();

    expect((await editorValue(page)).trim()).toBe("SELECT 11 AS marker;");
    // the restored SQL is said to be waiting, in the "no result yet" state: no table, no summary
    await expect(app.emptyState).toContainText("Press Run to execute it");
    await expect(app.pane).toHaveAttribute("data-state", "empty");
    await expect(app.table).toHaveCount(0);
    await expect(app.summary).toBeHidden();
    await expect(app.status).not.toContainText(/ in \d+ ms/);
    // Run is usable straight away, and it runs the restored SQL
    await expect(page.locator("#execute")).toBeEnabled();
    await page.locator("#execute").click();
    await app.settle();
    expect(await app.read()).toEqual({ columns: ["marker"], rows: [["11"]] });
});

test("restore: a runaway query saved by an earlier session does not hang the page", async ({ page, app }) => {
    await page.addInitScript((sql) => {
        try {
            localStorage.setItem("sqlime.query.northlight_retail.db", sql);
        } catch {}
    }, RUNAWAY);
    await page.goto(NORTHLIGHT_URL);
    await app.waitReady();
    expect((await editorValue(page)).trim()).toBe(RUNAWAY);

    // had it run, the tab would be stuck and this could not finish
    expect(await app.query("SELECT 7 AS seven;")).toEqual({ columns: ["seven"], rows: [["7"]] });
    await page.reload();
    await app.waitReady();
    await expect(app.table).toHaveCount(0);
    await expect(app.pane).toHaveAttribute("data-state", "empty");
});

test("restore: nothing runs when a file is opened and nothing is saved; the first table is a sample", async ({ page, app }) => {
    await app.open();
    await app.upload(SAMPLE);
    // Phase 4: no preview runs on load. The editor stays empty and the pane says "no result yet"
    await expect(app.pane).toHaveAttribute("data-state", "empty");
    await expect(app.table).toHaveCount(0);
    await expect(app.summary).toBeHidden();
    expect((await editorValue(page)).trim()).toBe("");
    // the first table's rows are a sample (a database without manifest samples); choosing it only
    // fills the editor
    await expect(app.samples).toHaveCount(1);
    await expect(app.samples.first()).toContainText("First 10 rows of fruit");
    await app.samples.first().click();
    expect((await editorValue(page)).trim()).toBe("SELECT * FROM fruit LIMIT 10;");
    await expect(app.table).toHaveCount(0);
    // running it (the same query the old preview ran) gives the table
    await page.locator("#execute").click();
    await app.settle();
    await expect(app.status).toContainText(/^4 rows in \d+ ms$/);
    expect((await app.read()).rows).toHaveLength(4);
    // opening the file stored nothing as the student's last query, and a sample is not stored
    // until it is run: only the run stored it
    expect(await app.storedQueries()).toEqual([["sqlime.query.sample.db", "SELECT * FROM fruit LIMIT 10;"]]);
});

test("restore: opening a file stores and logs nothing, since nothing runs", async ({ page, app }) => {
    await app.open();
    await app.upload(SAMPLE);
    // the old preview was not the student's work, so it was not stored as their last query; now
    // nothing runs on load at all
    expect(await page.evaluate(() => localStorage.getItem("sqlime.query.sample.db"))).toBeNull();
    expect(await app.storedQueries()).toEqual([]);
    expect(await page.evaluate(() => Object.keys(localStorage).filter((k) => k.startsWith("sqllab.log.")))).toEqual([]);
});

test("restore: saved SQL for an opened file is restored, not run, and wins over the sample", async ({
    page,
    app,
}) => {
    await app.open();
    await app.upload(SAMPLE);
    await app.query("SELECT name FROM fruit WHERE id = 2;");
    await app.upload(SAMPLE); // open the same file again

    expect((await editorValue(page)).trim()).toBe("SELECT name FROM fruit WHERE id = 2;");
    await expect(app.emptyState).toContainText("Press Run to execute it");
    await expect(app.pane).toHaveAttribute("data-state", "empty");
    await expect(app.table).toHaveCount(0);
});

test("restore: renaming moves the SQL that was run, and there is nothing else to move", async ({ page, app }) => {
    await app.open();
    await app.upload(SAMPLE);
    await app.rename("renamed.db");
    // nothing has run (opening a file runs nothing), so there is nothing of the student's to move
    expect(await app.storedQueries()).toEqual([]);

    await app.query("SELECT 3 AS three;");
    expect(await app.storedQueries()).toEqual([["sqlime.query.renamed.db", "SELECT 3 AS three;"]]);
    await app.rename("again.db");
    expect(await app.storedQueries()).toEqual([["sqlime.query.again.db", "SELECT 3 AS three;"]]);
});
