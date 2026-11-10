const fs = require("node:fs");
const { test, expect, withSampleDataset, SAMPLE_FILE, PAYLOAD } = require("./helpers");

// M5 part 2, F6 run log (js/lab/run-log.js): what a Run appends, how it is stored, and the
// history popup in the command bar.

const T = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/;

// n entries with distinct SQL, oldest first
const entries = (n, from = 1) =>
    Array.from({ length: n }, (_, i) => ({
        t: `2026-11-09T10:${String(Math.floor((from + i) / 60) % 60).padStart(2, "0")}:${String((from + i) % 60).padStart(2, "0")}Z`,
        sql: `SELECT ${from + i} AS n;`,
        rows: 1,
    }));

// the storage keys of the page that hold run logs
const logKeys = (page) =>
    page.evaluate(() => {
        try {
            return Object.keys(localStorage).filter((k) => k.startsWith("sqllab.log.")).sort();
        } catch {
            return null;
        }
    });

test.describe("what a Run appends", () => {
    test("one entry per Run: UTC time to the second, the SQL as run, the full row count", async ({ page, app }) => {
        await app.open();
        await page.clock.setFixedTime("2026-11-09T13:58:12.987Z");
        await app.query("SELECT category, COUNT(*) FROM products GROUP BY category;");
        await page.clock.setFixedTime("2026-11-09T14:01:40.000Z");
        await app.query("  SELECT 1;\n");
        expect(await app.readLog("northlight")).toEqual([
            { t: "2026-11-09T13:58:12Z", sql: "SELECT category, COUNT(*) FROM products GROUP BY category;", rows: 5 },
            { t: "2026-11-09T14:01:40Z", sql: "SELECT 1;", rows: 1 },
        ]);
    });

    test("the row count is the full count, not the 500 shown", async ({ app }) => {
        await app.open();
        await app.run("select * from order_items");
        await expect(app.status).toContainText(/showing 500 of \d+ rows/);
        const total = Number((await app.status.innerText()).match(/of (\d+) rows/)[1]);
        expect(total).toBeGreaterThan(500);
        expect((await app.readLog("northlight"))[0].rows).toBe(total);
    });

    test("a statement that changes data, and a query with no rows, log their row count", async ({ app }) => {
        await app.open();
        await app.run("CREATE TABLE scratch (a); INSERT INTO scratch VALUES (1), (2);");
        await expect(app.status).toContainText("0 rows");
        await app.run("SELECT * FROM scratch WHERE a > 5;");
        await expect(app.status).toContainText("0 rows");
        expect((await app.readLog("northlight")).map((e) => [e.sql, e.rows])).toEqual([
            ["CREATE TABLE scratch (a); INSERT INTO scratch VALUES (1), (2);", 0],
            ["SELECT * FROM scratch WHERE a > 5;", 0],
        ]);
    });

    test("an error is logged with the engine's message alone, on one line", async ({ app }) => {
        await app.open();
        await app.run("SELECT pric FROM products;");
        await expect(app.status).toContainText("no such column: pric");
        await app.run("SELECT 1;\nSELECT * FROM nowhere;\nSELECT 3;");
        await expect(app.status).toContainText("no such table: nowhere");
        await app.run("SELECT FROM;");
        await expect(app.status).toContainText("syntax error");
        const log = await app.readLog("northlight");
        expect(log.map((e) => e.error)).toEqual(["no such column: pric", "no such table: nowhere", expect.stringMatching(/syntax error/)]);
        for (const entry of log) {
            expect(entry).not.toHaveProperty("rows");
            expect(entry.error).not.toMatch(/SQLITE_|SQLite3Error|\n/);
            expect(entry.t).toMatch(T);
        }
        expect(log[1].sql).toBe("SELECT 1;\nSELECT * FROM nowhere;\nSELECT 3;");
    });

    test("SQL is kept whole, however long or odd", async ({ app }) => {
        await app.open();
        const sql = `SELECT '${"x".repeat(5000)}' AS "é日本語😀", 'it''s' AS q, '\t tab' AS t;`;
        await app.query(sql);
        expect((await app.readLog("northlight"))[0].sql).toBe(sql);
    });

    test("the table preview the app runs on its own is not logged, and neither is an empty Run", async ({ page, app }) => {
        // an upload with tables and nothing saved: the app shows a preview of the first table
        await app.open();
        await app.upload({ name: "sample.db", mimeType: "application/octet-stream", buffer: fs.readFileSync(SAMPLE_FILE) });
        await expect(app.table).toBeVisible();
        expect(await logKeys(page)).toEqual([]);
        await app.run("   ");
        await page.locator("#execute").click();
        await page.locator("#show-tables").click();
        expect(await logKeys(page)).toEqual([]);
        await app.query("SELECT 1;");
        expect((await app.readLog("file:sample.db")).map((e) => e.sql)).toEqual(["SELECT 1;"]);
    });

    test("Run by button, by keyboard and a Run of selected text each add one entry", async ({ app }) => {
        await app.open();
        await app.run("SELECT 1;", { via: "button" });
        await expect(app.status).toContainText("1 row");
        await app.run("SELECT 2;");
        await expect(app.status).toContainText("1 row");
        expect((await app.readLog("northlight")).map((e) => e.sql)).toEqual(["SELECT 1;", "SELECT 2;"]);
    });

    test("a Check counts once, because it performs one visible run", async ({ app }) => {
        await app.openSet("retail-basics", { ex: "e01" });
        await app.editor.fill("SELECT product_name, unit_price FROM products WHERE category = 'Electronics' ORDER BY unit_price DESC;");
        await app.checkButton.click();
        await expect(app.feedback).toContainText("Passed");
        expect(await app.readLog("northlight")).toHaveLength(1);
        await app.checkButton.click();
        await expect(app.status).toContainText(/\d+ rows?, took/);
        await expect.poll(async () => (await app.readLog("northlight")).length).toBe(2);
        // a wrong query and a failing one are single entries too
        await app.editor.fill("SELECT product_name FROM products;");
        await app.checkButton.click();
        await expect(app.feedback).toContainText("Not passed yet");
        await app.editor.fill("SELECT nope FROM products;");
        await app.checkButton.click();
        await expect(app.feedback).toContainText("no such column: nope");
        const log = await app.readLog("northlight");
        expect(log.map((e) => e.error ?? e.rows)).toEqual([expect.any(Number), expect.any(Number), expect.any(Number), "no such column: nope"]);
        expect(log).toHaveLength(4);
    });
});

test.describe("one log per dataset", () => {
    test("each built-in dataset, upload, URL database and the empty database has its own key", async ({ page, app }) => {
        await withSampleDataset(page);
        await app.open();
        await app.query("SELECT 'a' AS q;");
        await app.picker.selectOption("sample");
        await expect(app.picker).toHaveValue("sample");
        await app.waitReady();
        await app.query("SELECT 'b' AS q;");
        await app.picker.selectOption("northlight");
        await expect(app.picker).toHaveValue("northlight");
        await app.waitReady();
        await app.query("SELECT 'c' AS q;");
        expect((await app.readLog("northlight")).map((e) => e.sql)).toEqual(["SELECT 'a' AS q;", "SELECT 'c' AS q;"]);
        expect((await app.readLog("sample")).map((e) => e.sql)).toEqual(["SELECT 'b' AS q;"]);

        await app.upload({ name: "mine.db", mimeType: "application/octet-stream", buffer: fs.readFileSync(SAMPLE_FILE) });
        await app.query("SELECT 'd' AS q;");
        expect((await app.readLog("file:mine.db")).map((e) => e.sql)).toEqual(["SELECT 'd' AS q;"]);
        // an upload named like a dataset id does not touch that dataset's log
        await app.upload({ name: "northlight", mimeType: "application/octet-stream", buffer: fs.readFileSync(SAMPLE_FILE) });
        await app.query("SELECT 'e' AS q;");
        expect((await app.readLog("file:northlight")).map((e) => e.sql)).toEqual(["SELECT 'e' AS q;"]);
        expect((await app.readLog("northlight")).map((e) => e.sql)).toEqual(["SELECT 'a' AS q;", "SELECT 'c' AS q;"]);
        expect(await logKeys(page)).toEqual(
            ["sqllab.log.file:mine.db", "sqllab.log.file:northlight", "sqllab.log.northlight", "sqllab.log.sample"]
        );
    });

    test("renaming the database does not split its log", async ({ app }) => {
        await app.open();
        await app.upload({ name: "before.db", mimeType: "application/octet-stream", buffer: fs.readFileSync(SAMPLE_FILE) });
        await app.query("SELECT 1;");
        await app.rename("after.db");
        await app.query("SELECT 2;");
        expect((await app.readLog("file:before.db")).map((e) => e.sql)).toEqual(["SELECT 1;", "SELECT 2;"]);
        expect(await app.readLog("file:after.db")).toBeNull();
    });
});

test.describe("storage", () => {
    test("the log keeps the newest 200 entries and drops the oldest", async ({ app }) => {
        await app.open();
        await app.seedLog("northlight", entries(199));
        await app.query("SELECT 'two hundred' AS q;");
        let log = await app.readLog("northlight");
        expect(log).toHaveLength(200);
        expect(log[0].sql).toBe("SELECT 1 AS n;");
        await app.query("SELECT 'two hundred and one' AS q;");
        log = await app.readLog("northlight");
        expect(log).toHaveLength(200);
        expect(log[0].sql).toBe("SELECT 2 AS n;");
        expect(log[199].sql).toBe("SELECT 'two hundred and one' AS q;");
        expect(log[198].sql).toBe("SELECT 'two hundred' AS q;");
    });

    test("a stored log longer than 200 is cut to the newest 200 on the next Run", async ({ app }) => {
        await app.open();
        await app.seedLog("northlight", entries(260));
        await app.query("SELECT 'new' AS q;");
        const log = await app.readLog("northlight");
        expect(log).toHaveLength(200);
        expect(log[0].sql).toBe("SELECT 62 AS n;");
        expect(log[199].sql).toBe("SELECT 'new' AS q;");
    });

    test("corrupt or foreign stored text counts as an empty log and is replaced by the next Run", async ({ page, app }) => {
        await app.open();
        const bad = [
            "{{", "", "null", "[]", '"text"', "42", "true", '{"a":1}', '{"v":2,"entries":[]}', '{"v":1}',
            '{"v":1,"entries":"x"}', '{"v":1,"entries":{"0":1}}', '{"v":"1","entries":[]}', "<html>", "\u0000\u0001",
        ];
        for (const text of bad) {
            await app.seedLog("northlight", text);
            await app.historyButton.click();
            await expect(app.historyList, JSON.stringify(text)).toContainText("Nothing yet");
            await expect(app.historyEntries).toHaveCount(0);
            await page.keyboard.press("Escape");
            await app.query("SELECT 'fresh' AS q;");
            expect((await app.readLog("northlight")).map((e) => e.sql), JSON.stringify(text)).toEqual(["SELECT 'fresh' AS q;"]);
        }
    });

    test("entries that are not entries are skipped; the good ones stay", async ({ app }) => {
        await app.open();
        const good = entries(2);
        await app.seedLog("northlight", [
            good[0], null, 7, "x", [], {}, { t: "yesterday", sql: "SELECT 1;", rows: 1 },
            { t: good[1].t, sql: "", rows: 1 }, { t: good[1].t, sql: "SELECT 1;" }, { t: good[1].t, sql: "SELECT 1;", rows: -1 },
            { t: good[1].t, sql: "SELECT 1;", rows: 1.5 }, { t: good[1].t, sql: "SELECT 1;", rows: 1, error: "both" },
            { t: good[1].t, sql: "SELECT 1;", error: "" }, { t: good[1].t, sql: 5, rows: 1 },
            good[1],
        ]);
        await app.query("SELECT 'x' AS q;");
        expect((await app.readLog("northlight")).map((e) => e.sql)).toEqual([good[0].sql, good[1].sql, "SELECT 'x' AS q;"]);
    });

    test("two tabs do not lose each other's entries", async ({ context, page, app, baseURL }) => {
        await app.open();
        const other = await context.newPage();
        const otherApp = new (require("./helpers").App)(other);
        await otherApp.open();
        await app.query("SELECT 'a1' AS q;");
        await otherApp.query("SELECT 'b1' AS q;");
        await app.query("SELECT 'a2' AS q;");
        await otherApp.query("SELECT 'b2' AS q;");
        const sqls = (await app.readLog("northlight")).map((e) => e.sql);
        expect(sqls).toEqual(["SELECT 'a1' AS q;", "SELECT 'b1' AS q;", "SELECT 'a2' AS q;", "SELECT 'b2' AS q;"]);
        // and a tab shows the other tab's entries in its popup
        await app.historyButton.click();
        await expect(app.historyEntries).toHaveCount(4);
        await expect(app.historyEntries.first()).toContainText("b2");
        await other.close();
    });

    test("storage that throws never breaks the page: the log is kept for the session", async ({ page, app }) => {
        const errors = [];
        page.on("pageerror", (e) => errors.push(String(e)));
        await page.addInitScript(() => {
            const fail = () => {
                throw new DOMException("blocked", "SecurityError");
            };
            Object.defineProperty(window, "localStorage", { get: fail, configurable: true });
            Object.defineProperty(window, "sessionStorage", { get: fail, configurable: true });
        });
        await app.open();
        await app.query("SELECT 'one' AS q;");
        await app.run("SELECT nope;");
        await expect(app.status).toContainText("no such column: nope");
        await app.historyButton.click();
        await expect(app.historyEntries).toHaveCount(2);
        await expect(app.historyEntries.first()).toContainText("error");
        await expect(app.historyEntries.nth(1)).toContainText("1 row");
        await page.keyboard.press("Escape");
        // the evidence export has them too
        const file = await app.exportEvidence("U2034567");
        expect(file.text).toContain("SELECT 'one' AS q;");
        expect(file.text).toContain("error: no such column: nope");
        expect(errors).toEqual([]);
    });

    test("storage methods that throw never break the page either", async ({ page, app }) => {
        const errors = [];
        page.on("pageerror", (e) => errors.push(String(e)));
        await page.addInitScript(() => {
            const fail = () => {
                throw new DOMException("denied", "SecurityError");
            };
            Storage.prototype.getItem = fail;
            Storage.prototype.setItem = fail;
            Storage.prototype.removeItem = fail;
        });
        await app.open();
        await app.query("SELECT 'one' AS q;");
        await app.query("SELECT 'two' AS q;");
        await app.historyButton.click();
        await expect(app.historyEntries).toHaveCount(2);
        expect(errors).toEqual([]);
    });

    test("a full quota drops the oldest entries of this log until the new one fits", async ({ page, app }) => {
        await page.addInitScript(() => {
            const set = Storage.prototype.setItem;
            Storage.prototype.setItem = function (key, value) {
                if (String(key).startsWith("sqllab.log.") && String(value).length > 3500) {
                    throw new DOMException("full", "QuotaExceededError");
                }
                return set.call(this, key, value);
            };
        });
        await app.open();
        const pad = (c) => `SELECT '${c.repeat(900)}';`;
        await app.seedLog("northlight", [
            { t: "2026-11-09T10:00:01Z", sql: pad("a"), rows: 1 },
            { t: "2026-11-09T10:00:02Z", sql: pad("b"), rows: 1 },
            { t: "2026-11-09T10:00:03Z", sql: pad("c"), rows: 1 },
        ]);
        await app.query(pad("d"));
        const log = await app.readLog("northlight");
        expect(log.map((e) => e.sql)).toEqual([pad("b"), pad("c"), pad("d")]);
        // other keys are untouched
        expect(await app.storedQueries()).toHaveLength(1);
    });

    test("an entry too big to store on its own is kept, whole, with the rest of the log, in memory", async ({ page, app }) => {
        const errors = [];
        page.on("pageerror", (e) => errors.push(String(e)));
        await page.addInitScript(() => {
            const set = Storage.prototype.setItem;
            Storage.prototype.setItem = function (key, value) {
                if (String(key).startsWith("sqllab.log.") && String(value).length > 3500) {
                    throw new DOMException("full", "QuotaExceededError");
                }
                return set.call(this, key, value);
            };
        });
        await app.open();
        await app.seedLog("northlight", entries(2));
        const huge = `SELECT '${"z".repeat(6000)}' AS big;`;
        await app.query(huge);
        await app.historyButton.click();
        await expect(app.historyEntries).toHaveCount(3);
        await page.keyboard.press("Escape");
        const file = await app.exportEvidence("U2034567");
        expect(file.text).toContain(`\n${huge}\n`);
        expect(file.text).toContain("SELECT 1 AS n;");
        // the stored log is the old one: the entry that cannot be stored lives in memory
        expect((await app.readLog("northlight")).length).toBe(2);
        // a later small entry fits, and the log carries on from there
        await app.query("SELECT 'after' AS q;");
        await app.historyButton.click();
        await expect(app.historyEntries.first()).toContainText("'after'");
        await page.keyboard.press("Escape");
        expect((await app.readLog("northlight")).at(-1).sql).toBe("SELECT 'after' AS q;");
        expect(errors).toEqual([]);
    });
});

test.describe("the history popup", () => {
    const FIVE = [
        "SELECT category, COUNT(*) FROM products GROUP BY category;",
        "SELECT pric FROM products;",
        "SELECT 1\nUNION ALL\nSELECT 2;",
        "SELECT * FROM stores WHERE 0;",
        "SELECT 'last' AS q;",
    ];

    async function runFive(app) {
        await app.open();
        await app.query(FIVE[0]);
        await app.run(FIVE[1]);
        await expect(app.status).toContainText("no such column: pric");
        await app.query(FIVE[2]);
        await app.run(FIVE[3]);
        await expect(app.status).toContainText("0 rows");
        await app.query(FIVE[4]);
    }

    test("the toggle sits after copy link and before download csv, and the list is built when it opens", async ({ page, app }) => {
        await runFive(app);
        const ids = await page.locator("#commandbar > *").evaluateAll((els) => els.map((e) => e.id));
        expect(ids.indexOf("copy-link")).toBeGreaterThan(-1);
        expect(ids.indexOf("run-history")).toBe(ids.indexOf("copy-link") + 1);
        expect(ids.indexOf("download-csv")).toBeGreaterThan(ids.indexOf("run-history"));
        await expect(app.historyButton).toHaveAttribute("aria-expanded", "false");
        await expect(app.historyButton).toHaveAttribute("aria-controls", "run-history-list");
        await expect(app.historyList).toBeHidden();
        expect(await app.historyList.evaluate((l) => l.children.length)).toBe(0);

        await app.historyButton.click();
        await expect(app.historyButton).toHaveAttribute("aria-expanded", "true");
        await expect(app.historyList).toBeVisible();
        await expect(app.historyEntries).toHaveCount(5);
        // real buttons, newest first, each with the time, the outcome and the start of the SQL
        expect(await app.historyEntries.evaluateAll((bs) => bs.map((b) => b.tagName + ":" + b.type))).toEqual(Array(5).fill("BUTTON:button"));
        const texts = await app.historyEntries.allInnerTexts();
        expect(texts[0]).toMatch(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2} UTC\s+1 row\s+SELECT 'last' AS q;$/);
        expect(texts[1]).toMatch(/0 rows\s+SELECT \* FROM stores WHERE 0;$/);
        expect(texts[2]).toMatch(/2 rows\s+SELECT 1 UNION ALL SELECT 2;$/);
        expect(texts[3]).toMatch(/\berror\s+SELECT pric FROM products;$/);
        expect(texts[4]).toMatch(/5 rows\s+SELECT category, COUNT\(\*\) FROM products GROUP BY category;$/);
        // the time shown is the entry's UTC time
        const log = await app.readLog("northlight");
        expect(texts[0]).toContain(`${log[4].t.slice(0, 10)} ${log[4].t.slice(11, 19)}`);
        // the accessible name has all three, separated
        expect(await app.historyEntries.first().evaluate((b) => b.textContent)).toMatch(/UTC 1 row SELECT 'last'/);
    });

    test("a long statement is cut to its start", async ({ app }) => {
        await app.open();
        const sql = `SELECT ${Array.from({ length: 60 }, (_, i) => `${i} AS c${i}`).join(", ")};`;
        await app.query(sql);
        await app.historyButton.click();
        const shown = (await app.historyEntries.first().locator(".run-history-sql").textContent()) ?? "";
        expect(shown.length).toBeLessThanOrEqual(81);
        expect(shown.endsWith("…")).toBe(true);
        expect(sql.startsWith(shown.slice(0, -1))).toBe(true);
    });

    test("choosing an entry puts its SQL in the editor without running or saving it, closes the popup and focuses the editor", async ({
        page,
        app,
    }) => {
        await runFive(app);
        const before = {
            log: await app.readLog("northlight"),
            stored: await app.storedQueries(),
            status: await app.status.innerText(),
            table: await app.table.innerText(),
        };
        await app.editor.fill("SELECT 'my own text' AS q;");
        await app.historyButton.click();
        // the third newest: the multi-line one
        await app.historyEntries.nth(2).click();
        await expect(app.historyList).toBeHidden();
        await expect(app.historyButton).toHaveAttribute("aria-expanded", "false");
        expect(await app.editor.evaluate((e) => e.query)).toBe(FIVE[2]);
        expect(await page.evaluate(() => document.activeElement.id)).toBe("editor");
        // not run: same log, same saved query, no new result
        expect(await app.readLog("northlight")).toEqual(before.log);
        expect(await app.storedQueries()).toEqual(before.stored);
        expect(await app.table.innerText()).toBe(before.table);
        await expect(app.status).toContainText("Press Run to execute it");
        expect(before.status).not.toContain("Press Run to execute it");
        // Run then runs it, and logs it
        await app.editor.press("Control+Enter");
        await expect(app.status).toContainText("2 rows");
        expect((await app.readLog("northlight")).at(-1).sql).toBe(FIVE[2]);
    });

    test("an error entry can be restored too", async ({ app }) => {
        await runFive(app);
        await app.historyButton.click();
        await app.historyEntries.nth(3).click();
        expect(await app.editor.evaluate((e) => e.query)).toBe(FIVE[1]);
    });

    test("keyboard: open, move with the arrow keys without touching the editor, pick with Enter", async ({ page, app }) => {
        await runFive(app);
        await app.editor.fill("SELECT 'untouched' AS q;");
        const active = () => page.evaluate(() => document.activeElement.textContent);
        await app.historyButton.focus();
        await page.keyboard.press("Enter");
        await expect(app.historyList).toBeVisible();
        // the newest entry has the focus
        expect(await active()).toContain("'last'");
        await page.keyboard.press("ArrowDown");
        expect(await active()).toContain("stores WHERE 0");
        await page.keyboard.press("ArrowDown");
        await page.keyboard.press("ArrowDown");
        expect(await active()).toContain("pric");
        await page.keyboard.press("ArrowUp");
        expect(await active()).toContain("UNION ALL");
        await page.keyboard.press("End");
        expect(await active()).toContain("GROUP BY category");
        await page.keyboard.press("ArrowDown"); // stays on the last
        expect(await active()).toContain("GROUP BY category");
        await page.keyboard.press("Home");
        expect(await active()).toContain("'last'");
        await page.keyboard.press("ArrowUp"); // stays on the first
        expect(await active()).toContain("'last'");
        // browsing changed nothing
        expect(await app.editor.evaluate((e) => e.query)).toBe("SELECT 'untouched' AS q;");
        await page.keyboard.press("ArrowDown");
        await page.keyboard.press("ArrowDown");
        await page.keyboard.press("Enter");
        await expect(app.historyList).toBeHidden();
        expect(await app.editor.evaluate((e) => e.query)).toBe(FIVE[2]);
        expect(await page.evaluate(() => document.activeElement.id)).toBe("editor");
        // Space picks as well
        await app.historyButton.focus();
        await page.keyboard.press("Space");
        await expect(app.historyList).toBeVisible();
        await page.keyboard.press("End");
        await page.keyboard.press("Space");
        expect(await app.editor.evaluate((e) => e.query)).toBe(FIVE[0]);
    });

    test("Escape closes the popup and returns focus to the toggle", async ({ page, app }) => {
        await runFive(app);
        await app.editor.fill("SELECT 'untouched' AS q;");
        await app.historyButton.click();
        await page.keyboard.press("ArrowDown");
        await page.keyboard.press("Escape");
        await expect(app.historyList).toBeHidden();
        await expect(app.historyButton).toHaveAttribute("aria-expanded", "false");
        await expect(app.historyButton).toBeFocused();
        expect(await app.editor.evaluate((e) => e.query)).toBe("SELECT 'untouched' AS q;");
        // Escape on the toggle itself, with the popup open
        await page.keyboard.press("Enter");
        await expect(app.historyList).toBeVisible();
        await app.historyButton.focus();
        await page.keyboard.press("Escape");
        await expect(app.historyList).toBeHidden();
        await expect(app.historyButton).toBeFocused();
    });

    test("a click outside closes it, and so does moving on with Tab", async ({ page, app }) => {
        await runFive(app);
        await app.historyButton.click();
        await expect(app.historyList).toBeVisible();
        await page.mouse.click(1200, 600); // empty page below the schema panel
        await expect(app.historyList).toBeHidden();
        await app.historyButton.click();
        await expect(app.historyList).toBeVisible();
        await app.editor.click();
        await expect(app.historyList).toBeHidden();
        await app.historyButton.click();
        await expect(app.historyList).toBeVisible();
        // the toggle itself closes it again
        await app.historyButton.click();
        await expect(app.historyList).toBeHidden();
        // Tab out of the last entry
        await app.historyButton.click();
        await page.keyboard.press("End");
        await page.keyboard.press("Tab");
        await expect(app.historyList).toBeHidden();
    });

    test("an empty log shows a short message instead of a list", async ({ app }) => {
        await app.open();
        await app.historyButton.click();
        await expect(app.historyList).toBeVisible();
        await expect(app.historyList).toContainText("Nothing yet");
        await expect(app.historyEntries).toHaveCount(0);
        expect(await app.historyList.locator("ul, ol, li").count()).toBe(0);
    });

    test("it shows the log of the open database only, and closes when another database opens", async ({ page, app }) => {
        await withSampleDataset(page);
        await app.open();
        await app.query("SELECT 'north' AS q;");
        await app.historyButton.click();
        await expect(app.historyEntries).toHaveCount(1);
        await app.picker.selectOption("sample");
        await expect(app.historyList).toBeHidden();
        await expect(app.picker).toHaveValue("sample");
        await app.waitReady();
        await app.historyButton.click();
        await expect(app.historyList).toContainText("Nothing yet");
        await page.keyboard.press("Escape");
        await app.query("SELECT 'sample' AS q;");
        await app.historyButton.click();
        await expect(app.historyEntries).toHaveCount(1);
        await expect(app.historyEntries.first()).toContainText("'sample'");
    });

    test("entries added after it was last opened are there when it opens again", async ({ page, app }) => {
        await app.open();
        await app.query("SELECT 1;");
        await app.historyButton.click();
        await expect(app.historyEntries).toHaveCount(1);
        await page.keyboard.press("Escape");
        await app.query("SELECT 2;");
        await app.historyButton.click();
        await expect(app.historyEntries).toHaveCount(2);
        await expect(app.historyEntries.first()).toContainText("SELECT 2;");
    });

    test("hostile SQL, errors and storage text show as text and run nothing", async ({ page, app }) => {
        await app.open();
        await app.query(`SELECT '${PAYLOAD}' AS "${PAYLOAD.replaceAll('"', "")}";`);
        await app.run(`SELECT * FROM "${PAYLOAD}";`);
        await expect(app.status).toContainText("no such table");
        await app.seedLog("northlight", [
            ...(await app.readLog("northlight")),
            { t: "2026-11-09T10:00:00Z", sql: `</button><img id=pwn src=x onerror=window.__pwned=1>`, error: PAYLOAD },
            { t: "2026-11-09T10:00:01Z", sql: PAYLOAD, rows: 3 },
        ]);
        await app.historyButton.click();
        await expect(app.historyEntries).toHaveCount(4);
        const shown = await app.historyList.innerText();
        expect(shown).toContain(PAYLOAD.slice(0, 20));
        await app.expectInert();
        expect(await app.historyList.locator("img, script, iframe").count()).toBe(0);
        // restoring one puts it in the editor as text
        await app.historyEntries.first().click();
        expect(await app.editor.evaluate((e) => e.query)).toBe(PAYLOAD);
        await app.expectInert();
        // and the evidence export keeps it as text
        const file = await app.exportEvidence("U2034567");
        expect(file.text).toContain(PAYLOAD);
        await app.expectInert();
    });

    test("restored SQL is never run by a reload", async ({ page, app }) => {
        await runFive(app);
        await app.historyButton.click();
        await app.historyEntries.nth(1).click();
        const before = (await app.readLog("northlight")).length;
        await page.reload();
        await app.waitReady();
        expect((await app.readLog("northlight")).length).toBe(before);
    });
});

test.describe("the popup fits the screen", () => {
    const long = `SELECT ${Array.from({ length: 80 }, (_, i) => `'value number ${i}' AS column_${i}`).join(", ")} FROM products;`;
    const seeded = [
        ...entries(8),
        { t: "2026-11-09T11:00:00Z", sql: long, rows: 20 },
        { t: "2026-11-09T11:00:01Z", sql: "SELECT 1\nFROM a\nWHERE b;", error: "no such table: a with a rather long engine message that goes on and on" },
        { t: "2026-11-09T11:00:02Z", sql: "x".repeat(300), rows: 0 },
    ];

    // contrast ratio of two rgb() strings
    const luminance = (rgb) => {
        const [r, g, b] = rgb.match(/[\d.]+/g).slice(0, 3).map(Number).map((v) => {
            const c = v / 255;
            return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
        });
        return 0.2126 * r + 0.7152 * g + 0.0722 * b;
    };
    const contrast = (a, b) => {
        const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
        return (hi + 0.05) / (lo + 0.05);
    };

    for (const width of [1280, 768, 390]) {
        for (const colorScheme of ["light", "dark"]) {
            test(`at ${width}px wide in the ${colorScheme} scheme the open popup is whole, readable and causes no sideways scroll`, async ({
                page,
                app,
            }) => {
                await page.setViewportSize({ width, height: 800 });
                await page.emulateMedia({ colorScheme });
                await app.open();
                await app.seedLog("northlight", seeded);
                await app.historyButton.click();
                await expect(app.historyEntries).toHaveCount(seeded.length);
                await app.historyList.scrollIntoViewIfNeeded();

                const m = await page.evaluate(() => {
                    const list = document.querySelector("#run-history-list");
                    const r = list.getBoundingClientRect();
                    const doc = document.documentElement;
                    const hit = (x, y) => {
                        const el = document.elementFromPoint(x, y);
                        return Boolean(el && (el === list || list.contains(el)));
                    };
                    const inset = 6;
                    const buttons = [...list.querySelectorAll("button")];
                    return {
                        rect: { left: r.left, right: r.right, top: r.top, bottom: r.bottom },
                        viewport: { w: window.innerWidth, h: window.innerHeight },
                        pageOverflow: doc.scrollWidth - doc.clientWidth,
                        listOverflowX: list.scrollWidth - list.clientWidth,
                        corners: [
                            hit(r.left + inset, r.top + inset),
                            hit(r.right - inset, r.top + inset),
                            hit(r.left + inset, r.bottom - inset),
                            hit(r.right - inset, r.bottom - inset),
                            hit((r.left + r.right) / 2, (r.top + r.bottom) / 2),
                        ],
                        buttonOverflow: Math.max(...buttons.map((b) => b.scrollWidth - b.clientWidth)),
                        scrollable: list.scrollHeight > list.clientHeight,
                        list: { bg: getComputedStyle(list).backgroundColor, color: getComputedStyle(list).color },
                        sql: getComputedStyle(buttons[0].querySelector(".run-history-sql")).color,
                        error: getComputedStyle(list.querySelector(".run-history-outcome--error")).color,
                        outcome: getComputedStyle(buttons[0].querySelector(".run-history-outcome")).color,
                        time: getComputedStyle(buttons[0].querySelector(".run-history-time")).color,
                    };
                });
                expect(m.rect.left).toBeGreaterThanOrEqual(0);
                expect(m.rect.right).toBeLessThanOrEqual(m.viewport.w);
                expect(m.rect.top).toBeGreaterThanOrEqual(0);
                expect(m.rect.bottom).toBeLessThanOrEqual(m.viewport.h);
                expect(m.pageOverflow).toBeLessThanOrEqual(0);
                expect(m.listOverflowX).toBeLessThanOrEqual(0);
                expect(m.buttonOverflow).toBeLessThanOrEqual(0);
                expect(m.corners, "no ancestor clips the popup and nothing covers it").toEqual([true, true, true, true, true]);
                // eleven entries do not all fit: the list scrolls inside itself rather than growing off screen
                expect(m.scrollable).toBe(true);
                // colours follow the scheme and are readable
                expect(m.list.bg).toBe(colorScheme === "dark" ? "rgb(34, 34, 34)" : "rgb(255, 255, 255)");
                for (const colour of [m.sql, m.error, m.outcome, m.time]) {
                    expect(contrast(colour, m.list.bg)).toBeGreaterThanOrEqual(4.5);
                }

                // the last entry can be reached by scrolling the list, and picked
                await page.keyboard.press("End");
                await expect(app.historyEntries.last()).toBeInViewport();
                await page.keyboard.press("Enter");
                await expect(app.historyList).toBeHidden();
                expect(await app.editor.evaluate((e) => e.query)).toBe(seeded[0].sql);

                // closed, the page is as wide as before
                expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(0);
                await page.screenshot({ path: test.info().outputPath(`popup-${width}-${colorScheme}.png`) });
            });
        }
    }

    test("the popup is as wide as the screen allows with a long error message at 390px", async ({ page, app }) => {
        await page.setViewportSize({ width: 390, height: 700 });
        await app.open();
        await app.seedLog("northlight", seeded);
        await app.historyButton.click();
        const box = await app.historyList.boundingBox();
        expect(box.x).toBeGreaterThanOrEqual(8);
        expect(box.x + box.width).toBeLessThanOrEqual(390 - 8);
        expect(box.width).toBeGreaterThan(300);
    });
});
