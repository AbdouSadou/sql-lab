const { test, expect, App, routeSet, withSampleDataset, PAYLOAD } = require("./helpers");

// M5 part 1, F5 Results UX (js/lab/results.js): the 500-row cap, the status line, the failing
// statement, Download CSV, and the status icons. The statement annotation in runSql is
// covered here too, through the real page.

const ORDER_ITEMS = "select * from order_items";

// parseCsv is a small RFC 4180 reader, written independently of toCsv: records end at CRLF,
// a quoted field may hold commas, quotes (doubled) and line breaks.
function parseCsv(text) {
    const records = [];
    let record = [];
    let field = "";
    let quoted = false;
    for (let i = 0; i < text.length; i++) {
        const c = text[i];
        if (quoted) {
            if (c === '"' && text[i + 1] === '"') {
                field += '"';
                i++;
            } else if (c === '"') {
                quoted = false;
            } else {
                field += c;
            }
        } else if (c === '"') {
            quoted = true;
        } else if (c === ",") {
            record.push(field);
            field = "";
        } else if (c === "\r" && text[i + 1] === "\n") {
            record.push(field);
            records.push(record);
            record = [];
            field = "";
            i++;
        } else {
            field += c;
        }
    }
    expect(quoted, "the file ends inside a quoted field").toBe(false);
    expect([field, record.length], "the file ends with a line break").toEqual(["", 0]);
    return records;
}

// recordRuns collects the lab:run-finished events of the page in window.__runs
async function recordRuns(page) {
    await page.evaluate(() => {
        window.__runs = [];
        document.addEventListener("lab:run-finished", (e) => {
            const { ok, rows, error, preview } = e.detail;
            window.__runs.push({ ok, rows, error, preview });
        });
    });
}

const runs = (page) => page.evaluate(() => window.__runs);

test.describe("the row cap and the status line", () => {
    test.beforeEach(async ({ app }) => {
        await app.open();
    });

    test("exactly 500 rows render for a 906-row query, and the status says showing 500 of 906 rows", async ({ app }) => {
        await app.run(ORDER_ITEMS);
        await expect(app.status).toContainText("showing 500 of 906 rows, took");
        await expect(app.table.locator("tbody tr")).toHaveCount(500);
        await expect(app.table.locator("thead th")).not.toHaveCount(0);
    });

    test("a result of exactly 500 rows has no 'showing'", async ({ app }) => {
        await app.run(`${ORDER_ITEMS} limit 500`);
        await expect(app.status).toContainText(/^\s*500 rows, took \d+ ms/);
        await expect(app.table.locator("tbody tr")).toHaveCount(500);
        await expect(app.status).not.toContainText("showing");
        // one more row is capped
        await app.run(`${ORDER_ITEMS} limit 501`);
        await expect(app.status).toContainText("showing 500 of 501 rows, took");
        await expect(app.table.locator("tbody tr")).toHaveCount(500);
    });

    test("the table is the first rows of the result, in order", async ({ app }) => {
        const all = await app.page.evaluate(() => window.app.database.db.selectArrays("select rowid from order_items order by rowid"));
        await app.run("select rowid from order_items order by rowid");
        await expect(app.status).toContainText("showing 500 of 906 rows");
        const { rows } = await app.read();
        expect(rows.length).toBe(500);
        expect(rows[0]).toEqual([String(all[0][0])]);
        expect(rows[499]).toEqual([String(all[499][0])]);
    });

    test("the row count is singular for one row and plural otherwise; the time appears", async ({ app }) => {
        await app.run("select 1 as a");
        await expect(app.status).toContainText(/^\s*1 row, took \d+ ms\s*$/);
        await expect(app.status).not.toContainText("1 rows");
        await app.run("select 1 as a union all select 2");
        await expect(app.status).toContainText(/^\s*2 rows, took \d+ ms\s*$/);
        await app.run("select 1 as a where 0");
        await expect(app.status).toContainText(/^\s*0 rows, took \d+ ms\s*$/);
        await expect(app.table).toHaveCount(0);
    });

    test("the time is a measured number of milliseconds", async ({ app }) => {
        await app.run(
            "with recursive c(n) as (select 1 union all select n + 1 from c where n < 300000) select count(*) as n from c"
        );
        const text = await app.status.innerText();
        const ms = Number(/took (\d+) ms/.exec(text)?.[1]);
        expect(ms).toBeGreaterThan(0);
        expect(ms).toBeLessThan(30000);
    });

    test("lab:run-finished reports the full row count, and the engine's message alone on one line", async ({ app, page }) => {
        await recordRuns(page);
        await app.run(ORDER_ITEMS);
        await expect(app.status).toContainText("showing 500 of 906 rows");
        await app.run("select pric from products");
        await expect(app.status).toContainText("no such column: pric");
        expect(await runs(page)).toEqual([
            { ok: true, rows: 906, error: undefined, preview: false },
            { ok: false, rows: undefined, error: "no such column: pric", preview: false },
        ]);
        // a message with line breaks collapses to spaces, in the event and in the status line
        await app.run(
            "create table t(a); create trigger tr before insert on t begin select raise(abort, 'line one\nline two'); end; insert into t values (1)"
        );
        await expect(app.status).toContainText("line one line two");
        const last = (await runs(page)).at(-1);
        expect(last.error).toBe("line one line two");
        expect(await app.status.locator("div").innerHTML()).not.toMatch(/[\r\n]/);
    });
});

test.describe("errors name the failing statement", () => {
    test.beforeEach(async ({ app }) => {
        await app.open();
    });

    const statusHtml = (app) => app.status.locator("div").innerHTML();

    test("one statement: the engine's message, then the statement", async ({ app }) => {
        await app.run("select pric from products");
        await expect(app.status).toContainText("no such column: pric (statement: select pric from products)");
        await expect(app.status).not.toContainText("SQLite3Error");
        await expect(app.status).not.toContainText("result code");
        await expect(app.table).toHaveCount(0);
        expect(await statusHtml(app)).not.toMatch(/[\r\n]/);
    });

    test("the second of three statements is named by position and text", async ({ app }) => {
        await app.run("select 1; select pric from products; select 3;");
        await expect(app.status).toContainText(
            "no such column: pric (statement 2 of 3: select pric from products;)"
        );
        // the statement before it ran, the one after did not
        await expect(app.table).toHaveCount(0);
    });

    test("whitespace in the statement collapses, and a long statement is cut with an ellipsis", async ({ app }) => {
        await app.run("select\n   pric\n\n\tfrom   products");
        await expect(app.status).toContainText("(statement: select pric from products)");
        const long = `select ${Array.from({ length: 40 }, (_, i) => `pric${i}`).join(",\n    ")} from products`;
        await app.run(long);
        await expect(app.status).toContainText("no such column: pric0 (statement: select pric0, pric1");
        const text = (await app.status.innerText()).trim();
        const named = /\(statement: (.*)\)$/.exec(text)[1];
        expect(named.endsWith("…")).toBe(true);
        expect(named.length).toBeLessThanOrEqual(121);
        expect(named.length).toBeGreaterThan(100);
        expect(named).not.toMatch(/\s{2}|[\r\n\t]/);
        expect(await statusHtml(app)).not.toMatch(/[\r\n]/);
    });

    test("comments in front of the failing statement are left out of the line, so the SQL shows", async ({ app }) => {
        await app.run("select 1;\n-- note\nselect * from nosuch");
        await expect(app.status).toContainText("no such table: nosuch (statement 2 of 2: select * from nosuch)");
        await expect(app.status).not.toContainText("-- note");
        await app.run("/* block */ -- line\n  select pric from products");
        await expect(app.status).toContainText("(statement: select pric from products)");
        // a note that is itself longer than the line would have left no SQL at all
        const note = `-- Task 3: ${"find the top customers by revenue in each region, ".repeat(3)}`;
        await app.run(`${note}\nselect * from nosuch where a = 1`);
        await expect(app.status).toContainText("(statement: select * from nosuch where a = 1)");
        // a comment inside the statement stays
        await app.run("select * from nosuch -- why");
        await expect(app.status).toContainText("(statement: select * from nosuch -- why)");
    });

    test("a comment after the last statement does not count as a statement", async ({ app }) => {
        await app.run("select * from nosuch; -- trailing");
        await expect(app.status).toContainText("no such table: nosuch (statement: select * from nosuch;)");
        await app.run("select 1; select * from nosuch; /* and so on */");
        await expect(app.status).toContainText("(statement 2 of 2: select * from nosuch;)");
        await app.run("select 1; -- trailing");
        await expect(app.status).toContainText(/1 row, took \d+ ms/);
    });

    test("markup in the statement and in the message stays inert", async ({ app }) => {
        await app.run(`select 1; select '${PAYLOAD}' from nope_${PAYLOAD.replaceAll(/[^a-z]/g, "")}; select 3`);
        await expect(app.status).toContainText("statement 2 of 3: select '<img id=pwn");
        await expect(app.status.locator("img")).toHaveCount(0);
        await app.expectInert();
        await app.run(`select "${PAYLOAD}" from products`);
        await expect(app.status).toContainText("statement: select");
        await expect(app.status.locator("img")).toHaveCount(0);
        await app.expectInert();
    });

    test("runSql rethrows the engine's own exception with the statement attached", async ({ page }) => {
        const info = await page.evaluate(async () => {
            const { runSql, engineMessage } = await import("./js/lab/runner.js");
            try {
                runSql(window.app.database, "select 1; selct 2; select 3");
            } catch (exc) {
                return {
                    name: exc.name,
                    message: exc.message,
                    engine: engineMessage(exc),
                    text: exc.statementText,
                    position: exc.statementPosition,
                    count: exc.statementCount,
                    isError: exc instanceof Error,
                };
            }
            return null;
        });
        expect(info).toEqual({
            name: "SQLite3Error",
            message: expect.stringMatching(/^SQLITE_ERROR: sqlite3 result code 1: near "selct": syntax error/),
            engine: 'near "selct": syntax error',
            text: "selct 2;",
            position: 2,
            count: 3,
            isError: true,
        });
    });
});

test.describe("Download CSV", () => {
    test.beforeEach(async ({ app }) => {
        await app.open();
    });

    // The old command bar held [execute, show-tables, copy-link, run-history, download-csv]. Each
    // control now lives in its own region: Run in the editor toolbar, Copy link in the top bar,
    // History as a sidebar tab, Download CSV in the result's summary line, and the tables button is
    // gone (the Schema tab lists the tables).
    test("each control is present once, in its region, in a sensible order: Copy link, History tab, Run, Download CSV", async ({ app, page }) => {
        const inRegion = (region, id) => page.locator(`${region} #${id}`);
        for (const [region, id] of [
            ["#editor-toolbar", "execute"],
            [".topbar", "copy-link"],
            ["#sidebar [role=tablist]", "tab-history"],
            ["#results-summary", "download-csv"],
        ]) {
            await expect(page.locator(`#${id}`), `#${id} is on the page once`).toHaveCount(1);
            await expect(inRegion(region, id), `#${id} is in ${region}`).toHaveCount(1);
        }
        await expect(page.locator("#show-tables")).toHaveCount(0);
        // one button in the editor toolbar before an exercise is open, one Copy link in the top bar
        expect(await page.locator("#editor-toolbar > button").evaluateAll((b) => b.map((x) => x.id))).toEqual(["execute"]);
        expect(await page.locator(".topbar-actions > button, .topbar-actions > .topbar-theme > button").evaluateAll((b) => b.map((x) => x.id))).toEqual(["copy-link", "export-button", "theme-button", "help-button"]);
        expect(await page.locator("#sidebar [role=tab]").evaluateAll((b) => b.map((x) => x.id))).toEqual(["tab-schema", "tab-exercises", "tab-history"]);
        // page order, which is also the Tab order: the top bar, the sidebar, the toolbar, the result
        const order = await page.evaluate(() => {
            const nodes = ["download-csv", "execute", "tab-history", "copy-link"].map((id) => document.getElementById(id));
            return nodes.sort((a, b) => (a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1)).map((n) => n.id);
        });
        expect(order).toEqual(["copy-link", "tab-history", "execute", "download-csv"]);
        // the table preview of the default dataset is a query result with rows
        await expect(app.csvButton).toBeVisible();
        await expect(app.csvButton).toHaveText("Download CSV");
    });

    test("the Export menu's Results (.csv) item downloads the same file, and is disabled when there is nothing to download", async ({ app, page }) => {
        await app.run("select 1 as a, 'x' as b");
        await expect(app.status).toContainText("1 row, took");
        await app.openExportMenu();
        const item = page.locator("#export-csv");
        await expect(item).toHaveText(/Results \(\.csv\)/);
        await expect(item).toHaveAttribute("aria-disabled", "false");
        const [download] = await Promise.all([page.waitForEvent("download"), item.click()]);
        expect(download.suggestedFilename()).toBe("northlight_retail-result.csv");
        const chunks = [];
        for await (const chunk of await download.createReadStream()) chunks.push(chunk);
        expect(Buffer.concat(chunks).toString("utf8")).toBe("a,b\r\n1,x\r\n");
        // a result with no rows leaves nothing to download: the item says so
        await app.run("select 1 as a where 0");
        await expect(app.status).toContainText("0 rows, took");
        await app.openExportMenu();
        await expect(item).toHaveAttribute("aria-disabled", "true");
        await page.keyboard.press("Escape");
        await expect(page.locator("#export-menu")).toBeHidden();
    });

    test("a capped result downloads in full: all 906 rows and the header", async ({ app, page }) => {
        await app.run(ORDER_ITEMS);
        await expect(app.status).toContainText("showing 500 of 906 rows");
        const file = await app.downloadCsv();
        expect(file.name).toBe("northlight_retail-result.csv");
        const records = parseCsv(file.text);
        const expected = await page.evaluate(() => {
            const names = [];
            const rows = window.app.database.db.exec({
                sql: "select * from order_items",
                rowMode: "array",
                columnNames: names,
                returnValue: "resultRows",
            });
            return { names, rows: rows.map((r) => r.map(String)) };
        });
        expect(records.length).toBe(1 + 906);
        expect(records[0]).toEqual(expected.names);
        expect(records.slice(1)).toEqual(expected.rows);
        // CRLF everywhere, never a bare LF; plain ASCII has no byte order mark
        expect(file.text.replace(/\r\n/g, "")).not.toMatch(/[\r\n]/);
        expect(file.buffer[0]).not.toBe(0xef);
        // the table on screen was not changed by the download
        await expect(app.table.locator("tbody tr")).toHaveCount(500);
    });

    test("a BLOB cell is shown as x'<hex>' on screen, the same text as in the file", async ({ app }) => {
        await app.run(`select x'00ff10' as b, x'' as e, null as n, 7 as i, '<i>t</i>' || char(10) || 'u' as t`);
        await expect(app.status).toContainText("1 row, took");
        const cells = app.table.locator("tbody tr td");
        await expect(cells.nth(0)).toHaveText("x'00ff10'");
        await expect(cells.nth(1)).toHaveText("x''");
        await expect(cells.nth(2)).toHaveText("");
        await expect(cells.nth(3)).toHaveText("7");
        // text is still escaped, and a line break still becomes <br>
        await expect(cells.nth(4)).toHaveText("<i>t</i>u");
        await expect(cells.nth(4).locator("br")).toHaveCount(1);
        await expect(app.table.locator("tbody i")).toHaveCount(0);
        const { text } = await app.downloadCsv();
        expect(text.split("\r\n")[1].startsWith("x'00ff10',x'',,7,")).toBe(true);
    });

    test("fields: commas, quotes, line breaks, NULL, BLOB, BigInt, numbers, formulas, duplicates", async ({ app }) => {
        await app.run(
            [
                `select 'a,b' as "c,1", 'say "hi"' as q, 'one' || char(10) || 'two' as nl,`,
                `'one' || char(13) || 'two' as cr, null as n, x'00ff10' as b, 9223372036854775807 as big,`,
                `1.5 as r, 100.0 as w, 0.1 + 0.2 as s, '=1+1' as f1, '+2' as f2, '-3' as f3, '@x' as f4,`,
                `'' as e, ' padded ' as p, 'a' as d, 'b' as d`,
            ].join(" ")
        );
        await expect(app.status).toContainText("1 row, took");
        const { text } = await app.downloadCsv();
        const header = ['"c,1"', "q", "nl", "cr", "n", "b", "big", "r", "w", "s", "f1", "f2", "f3", "f4", "e", "p", "d", "d"];
        const row = [
            '"a,b"',
            '"say ""hi"""',
            '"one\ntwo"',
            '"one\rtwo"',
            "",
            "x'00ff10'",
            "9223372036854775807",
            "1.5",
            "100",
            "0.30000000000000004",
            "=1+1",
            "+2",
            "-3",
            "@x",
            "",
            " padded ",
            "a",
            "b",
        ];
        expect(text).toBe(`${header.join(",")}\r\n${row.join(",")}\r\n`);
        // and a reader that knows RFC 4180 gets the cells back
        const [names, cells] = parseCsv(text);
        expect(names[0]).toBe("c,1");
        expect(cells[1]).toBe('say "hi"');
        expect(cells[2]).toBe("one\ntwo");
        expect(cells[3]).toBe("one\rtwo");
    });

    test("toCsv is pure: header only for no rows, NULL empty, bytes as hex, quoting rules", async ({ page }) => {
        const out = await page.evaluate(async () => {
            const { toCsv } = await import("./js/lab/results.js");
            return {
                none: toCsv({ columns: ["a", "b"], values: [] }),
                mixed: toCsv({
                    columns: ["x"],
                    values: [[null], [undefined], [12n], [-0.5], [new Uint8Array([1, 171])], ["a\"b"], ["plain"], [""]],
                }),
                wide: toCsv({ columns: ["a", "a"], values: [[1, 2]] }),
            };
        });
        expect(out.none).toBe("a,b\r\n");
        expect(out.mixed).toBe('x\r\n\r\n\r\n12\r\n-0.5\r\nx\'01ab\'\r\n"a""b"\r\nplain\r\n\r\n');
        expect(out.wide).toBe("a,a\r\n1,2\r\n");
    });

    test("duplicate column names stay as they are", async ({ app }) => {
        await app.run("select 1 as a, 2 as a");
        const { text } = await app.downloadCsv();
        expect(text).toBe("a,a\r\n1,2\r\n");
    });

    test("a byte order mark only when the text has a non-ASCII character", async ({ app }) => {
        await app.run("select 'café £5' as price");
        const unicode = await app.downloadCsv();
        expect([...unicode.buffer.subarray(0, 3)]).toEqual([0xef, 0xbb, 0xbf]);
        expect(unicode.text).toBe("﻿price\r\ncafé £5\r\n");
        // the header counts too
        await app.run(`select 1 as "prix €"`);
        expect([...(await app.downloadCsv()).buffer.subarray(0, 3)]).toEqual([0xef, 0xbb, 0xbf]);
        // pure ASCII stays byte-clean
        await app.run("select 'cafe' as price");
        const ascii = await app.downloadCsv();
        expect(ascii.buffer.toString("latin1")).toBe("price\r\ncafe\r\n");
    });

    test("the file name is the database name without its extension, sanitised, plus -result.csv", async ({ app, page }) => {
        const names = await page.evaluate(async () => {
            const { csvFileName } = await import("./js/lab/results.js");
            return ["northlight_retail.db", "a.sqlite3", "x.sql", 'we:ird/na*me?.db', "", "new.db", "report", "...", "a.b.db"].map(
                csvFileName
            );
        });
        expect(names).toEqual([
            "northlight_retail-result.csv",
            "a-result.csv",
            "x-result.csv",
            "we_ird_na_me_-result.csv",
            "database-result.csv",
            "new-result.csv",
            "report-result.csv",
            "database-result.csv",
            "a.b-result.csv",
        ]);
        // and a rename shows in the next download
        await app.rename("class data.db");
        await app.run("select 1 as a");
        expect((await app.downloadCsv()).name).toBe("class data-result.csv");
    });

    test("keyboard path: Tab from the editor's splitter reaches the button, Enter and Space download", async ({ app, page }) => {
        await app.run("select 1 as a, 'x' as b");
        await expect(app.status).toContainText("1 row, took");
        // the button follows the editor and its splitter in the Tab order, and nothing sits between
        await page.locator("#editor-splitter").focus();
        await page.keyboard.press("Tab");
        await expect(app.csvButton).toBeFocused();
        await page.keyboard.press("Shift+Tab");
        await expect(page.locator("#editor-splitter")).toBeFocused();
        await page.keyboard.press("Tab");
        await expect(app.csvButton).toBeFocused();
        const [download] = await Promise.all([page.waitForEvent("download"), page.keyboard.press("Enter")]);
        expect(download.suggestedFilename()).toBe("northlight_retail-result.csv");
        const [again] = await Promise.all([page.waitForEvent("download"), page.keyboard.press("Space")]);
        expect(again.suggestedFilename()).toBe("northlight_retail-result.csv");
        // the keyboard route is the same helper as in the other specs
        expect((await app.downloadCsv({ via: "keyboard" })).text).toBe("a,b\r\n1,x\r\n");
    });
});

test.describe("the button follows the table on screen", () => {
    test.beforeEach(async ({ app }) => {
        await app.open();
    });

    const showResult = async (app) => {
        await app.run("select 1 as a, 2 as b");
        await expect(app.table).toBeVisible();
        await expect(app.csvButton).toBeVisible();
    };

    test("it is hidden for a result with no rows, an empty run and a run that changes data", async ({ app }) => {
        await showResult(app);
        await app.run("select 1 as a where 0");
        await expect(app.status).toContainText("0 rows, took");
        await expect(app.csvButton).toBeHidden();
        await showResult(app);
        await app.run("create table z(a); insert into z values (1)");
        await expect(app.status).toContainText("0 rows, took");
        await expect(app.csvButton).toBeHidden();
        await showResult(app);
        await app.run("   ");
        await expect(app.table).toHaveCount(0);
        await expect(app.csvButton).toBeHidden();
    });

    // The old tables view (and a table's columns) replaced the result, so the button went with
    // it. The Schema tab lists tables and columns in the sidebar and leaves the result alone; what
    // can still replace or empty the result is covered by the tests around this one (no rows, an
    // error, a database switch, another exercise, any code path that clears the table).
    test("the Schema tab, with a table's columns open, leaves the result and the button as they are", async ({ app, page }) => {
        await showResult(app);
        await app.openTab("schema");
        await app.schemaExpand("products").click();
        expect((await app.schemaColumns("products")).map((c) => c.name)).toContain("product_name");
        await expect(app.table).toBeVisible();
        await expect(app.csvButton).toBeVisible();
        expect((await app.downloadCsv()).text).toBe("a,b\r\n1,2\r\n");
        await expect(app.result).not.toContainText("product_name");
    });

    test("a restored history entry puts SQL in the editor and leaves the result on screen with its button", async ({ app, page }) => {
        await showResult(app);
        await app.run("select nope");
        await expect(app.status).toContainText("no such column: nope");
        await expect(app.csvButton).toBeHidden();
        await showResult(app);
        await app.openHistory();
        // newest first: [select 1 as a, 2 as b], [select nope], [select 1 as a, 2 as b]
        await app.historyEntries.nth(1).click();
        await expect(app.editor).toHaveText("select nope");
        await expect(app.status).toContainText("Press Run");
        // nothing was run: the result on screen is still the one that was run, and so is its file
        await expect(app.table).toBeVisible();
        await expect(app.csvButton).toBeVisible();
        expect((await app.downloadCsv()).text).toBe("a,b\r\n1,2\r\n");
    });

    test("it goes with an error", async ({ app }) => {
        await showResult(app);
        await app.run("select nope");
        await expect(app.status).toContainText("no such column: nope");
        await expect(app.csvButton).toBeHidden();
        // a later good run brings it back, with the new result
        await showResult(app);
        expect((await app.downloadCsv()).text).toBe("a,b\r\n1,2\r\n");
    });

    test("it goes with a database switch, and offers only the new database's result afterwards", async ({ app, page }) => {
        await withSampleDataset(page);
        await app.open();
        await app.run(ORDER_ITEMS);
        await expect(app.csvButton).toBeVisible();
        await app.pickDatabase("Sample Fruit");
        await expect(page.locator("#schema")).toContainText("Sample Fruit");
        await app.waitReady();
        // the sample's table preview is on screen; the file is that table, not order_items
        const { columns } = await app.read();
        const file = await app.downloadCsv();
        expect(file.name).toBe("sample-result.csv");
        expect(file.text.replace(/^\uFEFF/, "").split("\r\n")[0]).toBe(columns.join(","));
        // an upload with nothing to preview leaves no result and no button
        await app.run("select 1 as a");
        await expect(app.csvButton).toBeVisible();
        await app.upload(App.sqlFile("empty.sql", "select 1 where 0;"));
        await expect(app.table).toHaveCount(0);
        await expect(app.csvButton).toBeHidden();
    });

    test("it goes when the exercise changes", async ({ app }) => {
        await app.openSet();
        await app.run("select 1 as a");
        await expect(app.csvButton).toBeVisible();
        await app.exerciseButton(2).click();
        await expect(app.table).toHaveCount(0);
        await expect(app.csvButton).toBeHidden();
    });

    test("it goes when any code path clears or replaces the table", async ({ app, page }) => {
        const ways = {
            "ui.result.clear()": () => window.app.ui.result.clear(),
            "innerHTML = ''": () => (window.app.ui.result.innerHTML = ""),
            "textContent = 'x'": () => (window.app.ui.result.textContent = "x"),
            "print('')": () => window.app.ui.result.print(""),
            "printTables": () => window.app.ui.result.printTables(["t"]),
            "another table": () => window.app.ui.result.print({ columns: ["z"], values: [[1]] }),
            "removeChild": () => window.app.ui.result.firstElementChild.remove(),
        };
        for (const [name, source] of Object.entries(ways)) {
            await showResult(app);
            await page.evaluate(`(${source})()`);
            await expect(app.csvButton, name).toBeHidden();
        }
    });

    test("a click in the same task as a clear downloads nothing", async ({ app, page }) => {
        await showResult(app);
        await page.evaluate(() => {
            window.__saves = 0;
            const create = URL.createObjectURL.bind(URL);
            URL.createObjectURL = (blob) => {
                window.__saves++;
                return create(blob);
            };
            // the observer has not run yet: no microtask checkpoint between these lines
            window.app.ui.result.clear();
            document.querySelector("#download-csv").click();
        });
        await expect(app.csvButton).toBeHidden();
        expect(await page.evaluate(() => window.__saves)).toBe(0);
    });
});

test.describe("status icons", () => {
    test.beforeEach(async ({ app }) => {
        await app.open();
    });

    const icon = (app) =>
        app.status.locator("div").evaluate((el) => {
            const style = getComputedStyle(el, "::before");
            return { className: el.className, content: style.content, display: style.display };
        });

    test("a success shows a tick and an error a cross, from the classes the component sets", async ({ app }) => {
        await app.run("select 1 as a");
        await expect(app.status).toContainText("1 row, took");
        expect(await icon(app)).toEqual({ className: "sql-status--success", content: '"✓"', display: "inline-block" });
        await app.run("select nope");
        await expect(app.status).toContainText("no such column: nope");
        expect(await icon(app)).toEqual({ className: "sql-status--error", content: '"✕"', display: "inline-block" });
        // a plain message has neither
        await app.run("   ");
        expect((await icon(app)).content).toMatch(/^(none|normal)$/);
    });
});

test.describe("Check compares the full result, not the capped table", () => {
    const BIG_SET = {
        id: "big",
        title: "Big results",
        dataset: "northlight",
        exercises: [
            {
                id: "all",
                title: "Every order line",
                prompt: "List every row of order_items, in rowid order.",
                hints: [],
                model_query: "select rowid as id, 'x' as v from order_items order by rowid",
                order_matters: true,
            },
        ],
    };
    const SAME = "select rowid as id, 'x' as v from order_items order by rowid";
    // identical for the first 500 rows (and well beyond), different at row 800
    const LATE = "select rowid as id, case when rowid = 800 then 'y' else 'x' end as v from order_items order by rowid";

    test.beforeEach(async ({ page }) => {
        await routeSet(page, "big", BIG_SET);
    });

    test("the checker passes 906 matching rows and finds a difference after row 500", async ({ app }) => {
        await app.open();
        const set = { ...BIG_SET, exercises: BIG_SET.exercises };
        expect(await app.check("all", SAME, { set })).toEqual({ status: "pass" });
        expect(await app.check("all", `${SAME} limit 500`, { set })).toEqual({
            status: "fail",
            kind: "rows",
            message: "expected 906 rows, got 500",
        });
        const late = await app.check("all", LATE, { set });
        expect(late).toMatchObject({ status: "fail", kind: "row", rowIndex: 800 });
    });

    test("on screen: Check passes a capped result and names row 800 for a late difference", async ({ app }) => {
        await app.openSet("big");
        await app.editor.fill(SAME);
        await app.checkButton.click();
        await expect(app.feedback.locator(".verdict--pass")).toBeVisible();
        await expect(app.status).toContainText("showing 500 of 906 rows, took");
        await expect(app.table.locator("tbody tr")).toHaveCount(500);

        await app.editor.fill(LATE);
        await app.checkButton.click();
        await expect(app.feedback).toContainText("Row 800 is the first that differs");
        await expect(app.status).toContainText("showing 500 of 906 rows, took");
    });
});
