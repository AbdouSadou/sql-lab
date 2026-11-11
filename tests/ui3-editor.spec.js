// UI plan (docs/design), Phase 3: the editor. CodeMirror 6 (vendor/editor.js, built by
// tools/build-editor.mjs; set up by js/lab/code-editor.js) draws the SQL editor: highlighting with
// the five syntax colours, line numbers, the active line, bracket matching, and completion of
// SQLite's keywords and functions and of the open database's tables, views and columns. The keys:
// Ctrl/Cmd+Enter runs, Ctrl/Cmd+/ comments, Tab indents, Escape then Tab leaves. If the bundle does
// not load, the plain editor stays and everything still works (the plan's "done when").

const { execFileSync } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");
const AxeBuilder = require("@axe-core/playwright").default;
const { test, expect, EDITOR_INPUT, editorValue, editorSelect, expectEditorTextOnly, withSampleDataset, PAYLOAD } = require("./helpers");

const ROOT = path.resolve(__dirname, "..");
const BUNDLE = "vendor/editor.js";
const HINT = /Press Tab to indent.*Escape, then Tab or Shift\+Tab/;

// the labels of the completion list, as shown
const completions = (page) => page.locator(".cm-tooltip-autocomplete li .cm-completionLabel").allTextContents();
const option = (page, label) => page.getByRole("option").filter({ has: page.locator(".cm-completionLabel", { hasText: new RegExp(`^${label}$`) }) });

// the colour a token (a CSS custom property) computes to, as getComputedStyle reports colours
const tokenColour = (page, token) =>
    page.evaluate((name) => {
        const probe = document.createElement("span");
        probe.style.color = `var(${name})`;
        document.body.append(probe);
        const colour = getComputedStyle(probe).color;
        probe.remove();
        return colour;
    }, token);

const tokenBackground = (page, token) =>
    page.evaluate((name) => {
        const probe = document.createElement("span");
        probe.style.background = `var(${name})`;
        document.body.append(probe);
        const colour = getComputedStyle(probe).backgroundColor;
        probe.remove();
        return colour;
    }, token);

// picks the n-th name of the open list with the arrow keys. A list takes keys only 75 ms after it
// opened (CodeMirror's interactionDelay: keys pressed before a student could see it go to the text).
async function pick(page, n = 1) {
    await expect(page.getByRole("listbox")).toBeVisible();
    await page.waitForTimeout(150);
    for (let i = 0; i < n; i++) {
        await page.keyboard.press("ArrowDown");
    }
    await expect(page.locator(".cm-tooltip-autocomplete li[aria-selected]")).toHaveCount(1);
}

// typed into an empty editor, as a student types
async function typeFresh(page, app, text) {
    await app.editor.fill("");
    await app.editor.focus();
    await page.keyboard.type(text);
}

test.describe("the plan's checks", () => {
    test("typing SELECT * FROM pro offers products; Enter takes it and the query runs", async ({ page, app, pageErrors }) => {
        await app.open();
        await expect(page.locator("#editor")).toHaveAttribute("data-editor", "code");
        await typeFresh(page, app, "SELECT * FROM pro");
        const list = page.getByRole("listbox");
        await expect(list).toBeVisible();
        await expect(option(page, "products")).toBeVisible();
        // the table is the first choice, marked as a table
        expect((await completions(page))[0]).toBe("products");
        await expect(option(page, "products").locator(".cm-completionDetail")).toHaveText("table");
        await expect(app.editor).toHaveAttribute("aria-autocomplete", "list");
        // nothing is picked until the student picks it: the arrow key, then Enter
        await expect(page.locator(".cm-tooltip-autocomplete li[aria-selected]")).toHaveCount(0);
        await pick(page);
        await expect(option(page, "products")).toHaveAttribute("aria-selected", "true");
        await page.keyboard.press("Enter");
        await expect(list).toBeHidden();
        expect(await editorValue(page)).toBe("SELECT * FROM products");
        await page.keyboard.press("Control+Enter");
        await app.settle();
        await expect(app.status).toHaveText(/^20 rows in \d+ ms$/);
        expect(pageErrors).toEqual([]);
    });

    test("the bundle is at most 500 KB minified, and is what the pinned packages build", async ({}, testInfo) => {
        test.skip(testInfo.project.name !== "chromium-root", "checks files, not the page: once is enough");
        const size = fs.statSync(path.join(ROOT, BUNDLE)).size;
        expect(size).toBeLessThanOrEqual(500 * 1000);
        // the versions it names are the exact ones package.json pins
        const banner = fs.readFileSync(path.join(ROOT, BUNDLE), "utf8").split("\n", 1)[0];
        const pinned = JSON.parse(fs.readFileSync(path.join(ROOT, "package.json"), "utf8")).devDependencies;
        for (const name of ["@codemirror/autocomplete", "@codemirror/commands", "@codemirror/lang-sql", "@codemirror/language", "@codemirror/state", "@codemirror/view", "@lezer/highlight"]) {
            expect(banner).toContain(`${name}@${pinned[name]}`);
        }
        expect(fs.readFileSync(path.join(ROOT, "vendor/codemirror.LICENSE.txt"), "utf8")).toContain("MIT License");
        // a fresh build from node_modules gives the committed bytes (the build step is repeatable)
        execFileSync(process.execPath, [path.join(ROOT, "tools/build-editor.mjs"), "--check"], { cwd: ROOT, stdio: "pipe" });
    });

    test("with the bundle blocked the plain editor stays, and a query is written and run", async ({ page, app, pageErrors }) => {
        await page.route(`**/${BUNDLE}`, (route) => route.abort());
        await app.open();
        const editor = page.locator("#editor");
        await expect(editor).toHaveAttribute("data-editor", "plain");
        await expect(page.locator("#editor .cm-editor")).toHaveCount(0);
        // the same element is the editor: focused, named, described, a textbox
        await expect(app.editor).toBeFocused();
        await expect(editor).toHaveAttribute("contenteditable", "true");
        await expect(editor).toHaveRole("textbox");
        await expect(editor).toHaveAccessibleName("SQL query");
        await expect(editor).toHaveAccessibleDescription(HINT);
        // empty (as the app empties it, for an exercise with no draft), it shows the placeholder
        await editor.evaluate((el) => (el.value = ""));
        expect(await editor.evaluate((el) => getComputedStyle(el, "::before").content)).toBe('"Write SQL here, then press Run."');
        // write, indent, run
        await app.editor.fill("");
        await page.keyboard.type("SELECT");
        await page.keyboard.press("Tab");
        await page.keyboard.type("5 AS five;");
        expect(await editorValue(page)).toBe("SELECT  5 AS five;");
        await page.keyboard.press("Control+Enter");
        await app.settle();
        expect(await app.read()).toEqual({ columns: ["five"], rows: [["5"]] });
        // Escape, then Tab leaves it
        await app.editor.focus();
        await page.keyboard.press("Escape");
        await page.keyboard.press("Tab");
        await expect(page.locator("#editor-splitter")).toBeFocused();
        // the Schema tab still inserts into it, and Run runs it
        await app.editor.fill("SELECT * FROM ");
        await app.schemaInsert("stores").click();
        expect(await editorValue(page)).toBe("SELECT * FROM stores");
        await page.locator("#execute").click();
        await app.settle();
        await expect(app.status).toHaveText(/^5 rows in \d+ ms$/);
        expect(pageErrors).toEqual([]);
    });

    test("a bundle that arrives late takes over with the text, the caret and the focus", async ({ page, app, pageErrors }) => {
        let release;
        const held = new Promise((resolve) => (release = resolve));
        await page.route(`**/${BUNDLE}`, async (route) => {
            await held;
            await route.continue();
        });
        await app.open();
        // the page waited a while, then showed the plain editor
        await expect(page.locator("#editor")).toHaveAttribute("data-editor", "plain");
        await app.editor.fill("SELECT 1 AS one");
        await page.keyboard.press("Home");
        for (let i = 0; i < 7; i++) {
            await page.keyboard.press("ArrowRight");
        }
        release();
        await expect(page.locator("#editor")).toHaveAttribute("data-editor", "code");
        await expect(app.editor).toBeFocused();
        expect(await editorValue(page)).toBe("SELECT 1 AS one");
        await page.keyboard.type("2");
        expect(await editorValue(page)).toBe("SELECT 21 AS one");
        await page.keyboard.press("Control+Enter");
        await app.settle();
        expect(await app.read()).toEqual({ columns: ["one"], rows: [["21"]] });
        expect(pageErrors).toEqual([]);
    });
});

test.describe("the look", () => {
    for (const scheme of ["light", "dark"]) {
        test(`${scheme}: the five syntax roles take their colours, keywords in bold and comments in italic`, async ({ page, app }) => {
            await page.emulateMedia({ colorScheme: scheme });
            await app.open();
            await app.editor.fill("-- a note\nSELECT ROUND(price, 2) AS p, 'text' AS s, COUNT(*) FROM products;");
            const style = (selector) =>
                page.locator(`#editor ${selector}`).first().evaluate((el) => {
                    const s = getComputedStyle(el);
                    return { text: el.textContent, colour: s.color, weight: s.fontWeight, italic: s.fontStyle };
                });
            const keyword = await style(".sql-keyword");
            expect(keyword.text).toBe("SELECT");
            expect(keyword.colour).toBe(await tokenColour(page, "--syntax-keyword"));
            expect(keyword.weight).toBe("600");
            const fn = await style(".sql-function");
            expect(fn.text).toBe("ROUND");
            expect(fn.colour).toBe(await tokenColour(page, "--syntax-function"));
            const number = await style(".sql-number");
            expect(number.text).toBe("2");
            expect(number.colour).toBe(await tokenColour(page, "--syntax-number"));
            const string = await style(".sql-string");
            expect(string.text).toBe("'text'");
            expect(string.colour).toBe(await tokenColour(page, "--syntax-string"));
            const comment = await style(".sql-comment");
            expect(comment.text).toBe("-- a note");
            expect(comment.colour).toBe(await tokenColour(page, "--syntax-comment"));
            expect(comment.italic).toBe("italic");
            // COUNT is a function too; plain names and operators are ink
            await expect(page.locator("#editor .sql-function")).toHaveText(["ROUND", "COUNT"]);
            expect(await page.locator("#editor .cm-content").evaluate((el) => getComputedStyle(el).color)).toBe(await tokenColour(page, "--ink"));
        });
    }

    test("only SQLite's functions are drawn as functions (not a column named like a shell command)", async ({ page, app }) => {
        await app.open();
        await app.editor.fill("SELECT tables, mode, print, upper(name), replace(name, 'a', 'b') FROM t;");
        await expect(page.locator("#editor .sql-function")).toHaveText(["upper"]);
    });

    test("line numbers in a 48 px column, the caret's line tinted only while the editor has the focus", async ({ page, app }) => {
        await app.open();
        await app.editor.fill("SELECT 1\nFROM t\nWHERE 1");
        await expect(page.locator("#editor .cm-lineNumbers .cm-gutterElement").filter({ visible: true })).toHaveText(["1", "2", "3"]);
        expect(Math.round((await page.locator("#editor .cm-lineNumbers").boundingBox()).width)).toBe(48);
        const sunken = await tokenBackground(page, "--sunken");
        const active = page.locator("#editor .cm-activeLine");
        await expect(active).toHaveCount(1);
        expect(await active.evaluate((el) => getComputedStyle(el).backgroundColor)).toBe(sunken);
        expect(await page.locator("#editor .cm-activeLineGutter").evaluate((el) => getComputedStyle(el).backgroundColor)).toBe(sunken);
        // leave the editor: no tint
        await page.keyboard.press("Escape");
        await page.keyboard.press("Tab");
        await expect(app.editor).not.toBeFocused();
        await expect.poll(() => active.evaluate((el) => getComputedStyle(el).backgroundColor)).toBe("rgba(0, 0, 0, 0)");
    });

    test("an empty editor shows the placeholder, which is also its aria-placeholder", async ({ page, app }) => {
        await app.open();
        await app.editor.fill("");
        await expect(page.locator("#editor .cm-placeholder")).toHaveText("Write SQL here, then press Run.");
        await expect(app.editor).toHaveAttribute("aria-placeholder", "Write SQL here, then press Run.");
        expect(await editorValue(page)).toBe("");
    });

    test("a bracket is matched while the caret is beside it", async ({ page, app }) => {
        await app.open();
        await app.editor.fill("SELECT COUNT(*) FROM t");
        await editorSelect(page, 12);
        await expect(page.locator("#editor .cm-matchingBracket")).toHaveText(["(", ")"]);
    });

    test("one Tab stop: the editor's content, named, described, with no spell check or autocorrect", async ({ page, app }) => {
        await app.open();
        await expect(app.editor).toHaveRole("textbox");
        await expect(app.editor).toHaveAttribute("aria-multiline", "true");
        await expect(app.editor).toHaveAccessibleName("SQL query");
        await expect(app.editor).toHaveAccessibleDescription(HINT);
        await expect(app.editor).toHaveAttribute("spellcheck", "false");
        await expect(app.editor).toHaveAttribute("autocorrect", "off");
        await expect(app.editor).toHaveAttribute("autocapitalize", "off");
        // the element around it is no longer a textbox nor a Tab stop of its own
        const host = page.locator("#editor");
        await expect(host).not.toHaveAttribute("tabindex", /.*/);
        await expect(host).not.toHaveAttribute("role", /.*/);
        await expect(host).not.toHaveAttribute("contenteditable", /.*/);
        // from Run, one Tab reaches the editor and the next leaves it only after Escape
        await page.locator("#execute").focus();
        await page.keyboard.press("Tab");
        await expect(app.editor).toBeFocused();
        // the description is not a line on the screen
        expect(await page.locator("#editor-hint").evaluate((el) => el.getBoundingClientRect().height)).toBeLessThanOrEqual(1);
    });
});

test.describe("the keys", () => {
    test("Ctrl+/ comments the line, or every selected line, and takes the comment away again", async ({ page, app }) => {
        await app.open();
        await app.editor.fill("SELECT 1;\nSELECT 2;");
        await page.keyboard.press("Control+/");
        expect(await editorValue(page)).toBe("SELECT 1;\n-- SELECT 2;");
        await page.keyboard.press("Control+/");
        expect(await editorValue(page)).toBe("SELECT 1;\nSELECT 2;");
        await page.keyboard.press("Control+a");
        await page.keyboard.press("Control+/");
        expect(await editorValue(page)).toBe("-- SELECT 1;\n-- SELECT 2;");
        await page.keyboard.press("Control+/");
        expect(await editorValue(page)).toBe("SELECT 1;\nSELECT 2;");
    });

    test("Tab puts two spaces at the caret; with lines selected it indents them, Shift+Tab takes it back", async ({ page, app }) => {
        await app.open();
        await typeFresh(page, app, "sel");
        // even with the list of names open, Tab indents (it does not take a name)
        await expect(page.getByRole("listbox")).toBeVisible();
        await page.keyboard.press("Tab");
        await page.keyboard.type("1");
        expect(await editorValue(page)).toBe("sel  1");
        await typeFresh(page, app, "select");
        await page.keyboard.press("Tab");
        await page.keyboard.type("1");
        expect(await editorValue(page)).toBe("select  1");
        await app.editor.fill("SELECT 1\nFROM t");
        await page.keyboard.press("Control+a");
        await page.keyboard.press("Tab");
        expect(await editorValue(page)).toBe("  SELECT 1\n  FROM t");
        await expect(app.editor).toBeFocused();
        await page.keyboard.press("Shift+Tab");
        expect(await editorValue(page)).toBe("SELECT 1\nFROM t");
        await expect(app.editor).toBeFocused();
    });

    test("Escape, then Tab or Shift+Tab, leaves the editor, however long after the Escape", async ({ page, app }) => {
        await app.open();
        await app.editor.fill("SELECT 3;");
        await page.keyboard.press("Escape");
        await page.keyboard.press("Tab");
        await expect(page.locator("#editor-splitter")).toBeFocused();
        await app.editor.focus();
        await page.keyboard.press("Escape");
        await page.keyboard.press("Shift+Tab");
        await expect(page.locator("#execute")).toBeFocused();
        // CodeMirror's own Escape lasts two seconds; this one lasts until the next key
        await app.editor.focus();
        await page.keyboard.press("Escape");
        await page.waitForTimeout(2300);
        await page.keyboard.press("Tab");
        await expect(page.locator("#editor-splitter")).toBeFocused();
        expect(await editorValue(page)).toBe("SELECT 3;");
        // another key in between: Tab indents again
        await app.editor.focus();
        await page.keyboard.press("Escape");
        await page.keyboard.press("End");
        await page.keyboard.press("Tab");
        await expect(app.editor).toBeFocused();
        expect(await editorValue(page)).toBe("SELECT 3;  ");
    });

    test("Escape closes the completion list first; Tab then leaves", async ({ page, app }) => {
        await app.open();
        await typeFresh(page, app, "SELECT * FROM ord");
        await expect(page.getByRole("listbox")).toBeVisible();
        await page.keyboard.press("Escape");
        await expect(page.getByRole("listbox")).toBeHidden();
        await page.keyboard.press("Tab");
        await expect(page.locator("#editor-splitter")).toBeFocused();
        expect(await editorValue(page)).toBe("SELECT * FROM ord");
    });

    test("Ctrl+Enter and Cmd+Enter run the selection, else everything; with the list open it runs and closes the list", async ({ page, app }) => {
        await app.open();
        await app.editor.fill("SELECT 1 AS a;\nSELECT 2 AS b;");
        await editorSelect(page, 15, 29);
        await page.keyboard.press("Control+Enter");
        await app.settle();
        expect(await app.read()).toEqual({ columns: ["b"], rows: [["2"]] });
        await editorSelect(page, 0, 13);
        await page.keyboard.press("Meta+Enter");
        await app.settle();
        expect(await app.read()).toEqual({ columns: ["a"], rows: [["1"]] });
        await typeFresh(page, app, "SELECT COUNT(*) AS n FROM prod");
        await expect(page.getByRole("listbox")).toBeVisible();
        await page.keyboard.press("Control+Enter");
        await expect(page.getByRole("listbox")).toBeHidden();
        await app.settle();
        await expect(app.errorBand.locator(".results-band-message")).toContainText("no such table: prod");
        expect(await editorValue(page)).toBe("SELECT COUNT(*) AS n FROM prod");
    });

    test("a selection made outside the editor afterwards is not taken for SQL", async ({ page, app }) => {
        await app.open();
        await app.editor.fill("SELECT 2 AS b, 3 AS c;");
        await editorSelect(page, 0, 13);
        expect(await page.locator("#editor").evaluate((el) => el.query)).toBe("SELECT 2 AS b");
        // the student selects text in the status bar (a triple click there), then presses Run: the
        // whole query runs
        await page.locator("#status-version").click({ clickCount: 3 });
        expect(await page.evaluate(() => getSelection().toString())).toMatch(/SQLite/);
        await page.locator("#execute").click();
        await app.settle();
        expect(await app.read()).toEqual({ columns: ["b", "c"], rows: [["2", "3"]] });
    });

    test("undo takes back typing, but never back past text the app put in the editor", async ({ page, app }) => {
        await app.open();
        await app.run("SELECT 7 AS seven;");
        await typeFresh(page, app, "SELECT 8");
        await page.keyboard.press("Escape");
        await page.keyboard.press("Control+z");
        expect(await editorValue(page)).not.toBe("SELECT 8");
        // the History tab puts an earlier query in the editor; undo then has nothing before it
        await page.locator("#tab-history").click();
        await page.locator("#run-history-list button").filter({ hasText: "SELECT 7 AS seven;" }).first().click();
        expect(await editorValue(page)).toBe("SELECT 7 AS seven;");
        await app.editor.focus();
        await page.keyboard.press("Control+z");
        expect(await editorValue(page)).toBe("SELECT 7 AS seven;");
    });
});

test.describe("completion", () => {
    test("nothing is picked when the list opens: Enter is a new line until the arrows pick a name", async ({ page, app }) => {
        await app.open();
        await typeFresh(page, app, "SELECT * FROM ord");
        await expect(page.getByRole("listbox")).toBeVisible();
        expect(await completions(page)).toEqual(expect.arrayContaining(["orders", "order_items"]));
        await page.keyboard.press("Enter");
        expect(await editorValue(page)).toBe("SELECT * FROM ord\n");
        await typeFresh(page, app, "SELECT * FROM ord");
        await pick(page, 2);
        const second = (await completions(page))[1];
        await expect(page.locator(".cm-tooltip-autocomplete li[aria-selected]")).toContainText(second);
        await page.keyboard.press("Enter");
        expect(await editorValue(page)).toBe(`SELECT * FROM ${second}`);
    });

    test("a line ending in an alias keeps it: Enter starts the next line", async ({ page, app }) => {
        await app.open();
        await typeFresh(page, app, "SELECT *\nFROM orders o");
        await page.keyboard.press("Enter");
        await page.keyboard.type("JOIN order_items oi");
        await page.keyboard.press("Enter");
        await page.keyboard.type("ON o.order_id = oi.order_id LIMIT 1");
        expect(await editorValue(page)).toBe("SELECT *\nFROM orders o\nJOIN order_items oi\nON o.order_id = oi.order_id LIMIT 1");
        await page.keyboard.press("Control+Enter");
        await app.settle();
        await expect(app.status).toHaveText(/^1 row in \d+ ms$/);
    });

    test("a name typed in full is not offered back, so the list does not linger", async ({ page, app }) => {
        await app.open();
        await typeFresh(page, app, "SELECT * FROM products");
        await page.waitForTimeout(400);
        await expect(page.getByRole("listbox")).toHaveCount(0);
        // the arrow keys move the caret, as without a list
        await page.keyboard.press("Enter");
        await page.keyboard.press("ArrowUp");
        await page.keyboard.press("End");
        await page.keyboard.type(" p");
        expect(await editorValue(page)).toBe("SELECT * FROM products p\n");
    });

    test("columns: after a table or its alias and a dot, that table's with their types; on their own, every table's", async ({ page, app }) => {
        await app.open();
        // Ctrl+Space opens the list where nothing has been typed yet
        await typeFresh(page, app, "SELECT ");
        await page.keyboard.press("Control+Space");
        await expect(page.getByRole("listbox")).toBeVisible();
        await page.keyboard.press("Escape");
        await typeFresh(page, app, "SELECT * FROM products p WHERE p.");
        await expect(option(page, "unit_price")).toBeVisible();
        await expect(option(page, "unit_price").locator(".cm-completionDetail")).toHaveText("REAL");
        expect(await completions(page)).not.toContain("order_id");
        await page.keyboard.type("cat");
        await pick(page);
        await page.keyboard.press("Enter");
        expect(await editorValue(page)).toBe("SELECT * FROM products p WHERE p.category");
        await typeFresh(page, app, "SELECT categ");
        await expect(option(page, "category")).toBeVisible();
        await expect(option(page, "category").locator(".cm-completionDetail")).toHaveText("products, v_sales");
    });

    test("keywords and functions in capitals; nothing inside a string or a comment", async ({ page, app }) => {
        await app.open();
        await typeFresh(page, app, "SELECT rou");
        await expect(option(page, "ROUND")).toBeVisible();
        await expect(option(page, "ROUND").locator(".cm-completionDetail")).toHaveText("function");
        await page.keyboard.press("Escape");
        await typeFresh(page, app, "SELECT 'pro");
        await page.waitForTimeout(400);
        await expect(page.getByRole("listbox")).toHaveCount(0);
        await typeFresh(page, app, "-- pro");
        await page.waitForTimeout(400);
        await expect(page.getByRole("listbox")).toHaveCount(0);
    });

    test("a name that needs quotes goes in quoted, as the Schema tab inserts it", async ({ page, app }) => {
        await app.open();
        await app.run('CREATE TABLE "Sales 2024" ("unit price" REAL, qty INTEGER);');
        await typeFresh(page, app, "SELECT * FROM Sales");
        await expect(option(page, "Sales 2024")).toBeVisible();
        await pick(page);
        await page.keyboard.press("Enter");
        expect(await editorValue(page)).toBe('SELECT * FROM "Sales 2024"');
        await typeFresh(page, app, "SELECT unit");
        await expect(option(page, "unit price")).toBeVisible();
        await option(page, "unit price").click();
        expect(await editorValue(page)).toBe('SELECT "unit price"');
    });

    test("the names follow DDL: a new table is offered, a dropped one is not", async ({ page, app }) => {
        await app.open();
        await app.run("CREATE TABLE zebra (stripes INTEGER);");
        await typeFresh(page, app, "SELECT * FROM zeb");
        await expect(option(page, "zebra")).toBeVisible();
        await typeFresh(page, app, "SELECT strip");
        await expect(option(page, "stripes")).toBeVisible();
        await app.run("DROP TABLE zebra;");
        await typeFresh(page, app, "SELECT * FROM zeb");
        await page.waitForTimeout(400);
        expect(await completions(page)).not.toContain("zebra");
        // the list still works after the DROP: the other tables are offered
        await typeFresh(page, app, "SELECT * FROM ord");
        await expect(option(page, "orders")).toBeVisible();
    });

    test("the names follow a database switch", async ({ page, app }) => {
        await withSampleDataset(page);
        await app.open();
        await app.pickDatabase("Sample Fruit");
        await expect(app.databaseLabel).toHaveText("Sample Fruit");
        await typeFresh(page, app, "SELECT * FROM fru");
        await expect(option(page, "fruit")).toBeVisible();
        await typeFresh(page, app, "SELECT * FROM prod");
        await page.waitForTimeout(400);
        expect(await completions(page)).not.toContain("products");
        // a column of the new database is offered on its own too
        await typeFresh(page, app, "SELECT na");
        await expect(option(page, "name")).toBeVisible();
    });

    test("names from the database are text in the list, never markup", async ({ page, app, pageErrors }) => {
        await app.open();
        await app.run(`CREATE TABLE "x${PAYLOAD}" (a);`);
        await typeFresh(page, app, "SELECT * FROM x");
        await expect(page.getByRole("listbox")).toBeVisible();
        await expect(page.locator(".cm-tooltip-autocomplete img, #pwn")).toHaveCount(0);
        expect(await page.evaluate(() => window.__pwned)).toBeUndefined();
        expect(pageErrors).toEqual([]);
    });

    test("with the list open, axe finds no serious or critical violation", async ({ page, app }) => {
        await app.open();
        await typeFresh(page, app, "SELECT * FROM pro");
        await expect(page.getByRole("listbox")).toBeVisible();
        const results = await new AxeBuilder({ page }).analyze();
        const bad = results.violations.filter((v) => v.impact === "serious" || v.impact === "critical").map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(" ")).join(" | ")}`);
        expect(bad).toEqual([]);
    });
});

test.describe("text only, as before", () => {
    test("a paste of rich text puts in its plain text and nothing else", async ({ page, app, pageErrors }) => {
        await app.open();
        await app.editor.fill("");
        await app.editor.evaluate((el, payload) => {
            // a stand-in for the clipboard (Firefox ignores clipboardData in a made-up event)
            const items = { "text/html": `<b>bold</b>${payload}`, "text/plain": "SELECT 1 AS pasted" };
            const paste = new Event("paste", { bubbles: true, cancelable: true });
            Object.defineProperty(paste, "clipboardData", { value: { types: Object.keys(items), getData: (type) => items[type] ?? "" } });
            el.dispatchEvent(paste);
        }, PAYLOAD);
        expect(await editorValue(page)).toBe("SELECT 1 AS pasted");
        await expectEditorTextOnly(page);
        expect(await page.evaluate(() => window.__pwned)).toBeUndefined();
        expect(pageErrors).toEqual([]);
    });

    test("a dropped file inserts nothing and the tab does not open it", async ({ page, app }) => {
        await app.open();
        await app.editor.fill("SELECT 1");
        const cancelled = await app.editor.evaluate((el) => {
            const data = new DataTransfer();
            data.items.add(new File(["SELECT 'from the file'"], "query.sql", { type: "text/plain" }));
            const box = el.getBoundingClientRect();
            const at = { clientX: box.left + 20, clientY: box.top + 10, bubbles: true, cancelable: true, dataTransfer: data };
            el.dispatchEvent(new DragEvent("dragover", at));
            const drop = new DragEvent("drop", at);
            el.dispatchEvent(drop);
            return drop.defaultPrevented;
        });
        expect(cancelled).toBe(true);
        await page.waitForTimeout(300);
        expect(await editorValue(page)).toBe("SELECT 1");
        await expectEditorTextOnly(page);
    });

    test("the editor's input event comes once per change, after it, and not for the app's own text", async ({ page, app }) => {
        await app.open();
        await app.editor.fill("");
        await page.locator("#editor").evaluate((el) => {
            window.__inputs = [];
            el.addEventListener("input", () => window.__inputs.push(el.value));
        });
        await app.editor.focus();
        await page.keyboard.type("ab");
        await page.keyboard.press("Backspace");
        await expect.poll(() => page.evaluate(() => window.__inputs)).toEqual(["a", "ab", "a"]);
        await page.locator("#editor").evaluate((el) => (el.value = "SELECT 9"));
        await page.waitForTimeout(100);
        expect(await page.evaluate(() => window.__inputs)).toEqual(["a", "ab", "a"]);
    });
});

test.describe("Help and the shortcuts", () => {
    test("Help lists the editor's Ctrl+/ and Ctrl+Space", async ({ page, app }) => {
        await app.open();
        await page.locator("#help-button").click();
        const keys = page.locator("#help-popover .help-keys");
        await expect(keys).toContainText("Comment or uncomment the line, in the editor");
        await expect(keys).toContainText("Suggest table, column and function names, in the editor");
        await expect(keys.locator("dt").filter({ hasText: "Space" })).toHaveText(/^Ctrl\s+Space$/);
    });

    test("Ctrl+O and Ctrl+Shift+Enter still work with the focus in the editor", async ({ page, app }) => {
        await app.openSet();
        await app.editor.focus();
        const chooser = page.waitForEvent("filechooser");
        await page.keyboard.press("Control+o");
        await chooser;
        await app.editor.fill("SELECT 1");
        await page.keyboard.press("Control+Shift+Enter");
        await expect(page.locator("#exercise-feedback")).toBeVisible();
        expect(await editorValue(page)).toBe("SELECT 1");
    });
});

// ---- what the review found -------------------------------------------------------------------

test.describe("found in review", () => {
    test("a selection on the caret's line shows: that line is not tinted while text is selected", async ({ page, app }) => {
        await app.open();
        await app.editor.fill("SELECT name FROM stores");
        await page.keyboard.press("Home");
        await page.keyboard.press("Shift+End");
        await expect(page.locator("#editor .cm-editor")).toHaveClass(/sql-selecting/);
        expect(await page.locator("#editor .cm-activeLine").evaluate((el) => getComputedStyle(el).backgroundColor)).toBe("rgba(0, 0, 0, 0)");
        await expect(page.locator("#editor .cm-selectionBackground").first()).toBeVisible();
        // the tint is back once the selection is a caret again
        await page.keyboard.press("End");
        await expect(page.locator("#editor .cm-editor")).not.toHaveClass(/sql-selecting/);
        expect(await page.locator("#editor .cm-activeLine").evaluate((el) => getComputedStyle(el).backgroundColor)).toBe(await tokenBackground(page, "--sunken"));
    });

    test("Escape keeps the selection, so Escape, Shift+Tab and Enter on Run run the selected part only", async ({ page, app }) => {
        await app.open();
        await app.editor.fill("SELECT 1 AS a; SELECT 2 AS b");
        for (let i = 0; i < 13; i++) {
            await page.keyboard.press("Shift+ArrowLeft");
        }
        await page.keyboard.press("Escape");
        expect(await page.locator("#editor").evaluate((el) => el.query)).toBe("SELECT 2 AS b");
        await page.keyboard.press("Shift+Tab");
        await expect(page.locator("#execute")).toBeFocused();
        await page.keyboard.press("Enter");
        await app.settle();
        expect(await app.read()).toEqual({ columns: ["b"], rows: [["2"]] });
        expect(await page.evaluate(() => localStorage.getItem("sqlime.query.northlight_retail.db"))).toBe("SELECT 2 AS b");
    });

    for (const plain of [false, true]) {
        test(`a press in the editor after Escape: Tab indents again${plain ? ", plain editor" : ""}`, async ({ page, app }) => {
            if (plain) {
                await page.route(`**/${BUNDLE}`, (route) => route.abort());
            }
            await app.open();
            await app.editor.fill("abc");
            await page.keyboard.press("Escape");
            // the press puts the caret after the text (right of it on its line); no key comes
            // between it and Tab, so only the press can have cancelled the Escape
            const line = await app.editor.boundingBox();
            await page.mouse.click(line.x + line.width - 8, line.y + 14);
            await page.keyboard.press("Tab");
            await expect(app.editor).toBeFocused();
            expect(await editorValue(page)).toBe("abc  ");
        });
    }

    test("the list's opening is said to a screen reader (nothing is picked yet)", async ({ page, app }) => {
        await app.open();
        await page.locator("#editor .cm-announced").evaluate((region) => {
            window.__said = [];
            new MutationObserver(() => window.__said.push(region.textContent.trim())).observe(region, { childList: true, subtree: true, characterData: true });
        });
        await typeFresh(page, app, "SELECT * FROM pro");
        await expect(page.getByRole("listbox")).toBeVisible();
        await expect.poll(() => page.evaluate(() => window.__said)).toContain("3 suggestions. Press the down arrow to pick one, then Enter.");
        await expect(page.locator("#editor .cm-announced")).toHaveAttribute("aria-live", "polite");
    });

    test('a quoted name ("stores") is drawn as a name, not in the string colour', async ({ page, app }) => {
        await app.open();
        await app.editor.fill(`SELECT * FROM "stores" WHERE city = 'York'`);
        const quoted = page.locator("#editor .sql-quoted-name");
        await expect(quoted).toHaveText('"stores"');
        expect(await quoted.evaluate((el) => getComputedStyle(el).color)).toBe(await tokenColour(page, "--ink"));
        await expect(page.locator("#editor .sql-string")).toHaveText(["'York'"]);
    });

    test("the list's rows look like the menus' items: 32 px, rounded, inside the list's padding", async ({ page, app }) => {
        await app.open();
        await typeFresh(page, app, "SELECT * FROM pro");
        await pick(page);
        const row = page.locator(".cm-tooltip-autocomplete li[aria-selected]");
        const look = await row.evaluate((li) => {
            const list = li.parentElement.getBoundingClientRect();
            const box = li.getBoundingClientRect();
            return { radius: getComputedStyle(li).borderTopLeftRadius, height: Math.round(box.height), inset: Math.round(box.left - list.left) };
        });
        expect(look).toEqual({ radius: "6px", height: 32, inset: 4 });
    });

    test("in forced colours the picked name is outlined (its background is the user's)", async ({ page, app }) => {
        await page.emulateMedia({ forcedColors: "active" });
        await app.open();
        await typeFresh(page, app, "SELECT * FROM pro");
        await pick(page);
        const outline = await page.locator(".cm-tooltip-autocomplete li[aria-selected]").evaluate((li) => getComputedStyle(li).outlineStyle + " " + getComputedStyle(li).outlineWidth);
        expect(outline).toBe("solid 2px");
        await page.keyboard.press("Escape");
        await page.keyboard.press("Control+a");
        const selection = await page.locator("#editor .cm-selectionBackground").first().evaluate((el) => getComputedStyle(el).outlineStyle);
        expect(selection).toBe("solid");
    });

    test("with reduced motion the caret does not blink", async ({ page, app }) => {
        await page.emulateMedia({ reducedMotion: "reduce" });
        await app.open();
        await app.editor.fill("SELECT 1");
        expect(await page.locator("#editor .cm-cursorLayer").evaluate((el) => getComputedStyle(el).animationName)).toBe("none");
        await page.emulateMedia({ reducedMotion: "no-preference" });
        await page.keyboard.press("ArrowLeft");
        expect(await page.locator("#editor .cm-cursorLayer").evaluate((el) => getComputedStyle(el).animationName)).toMatch(/^cm-blink2?$/);
    });

    test("after the app replaced the text (an exercise switch), the Schema tab's insert goes after it", async ({ page, app }) => {
        await app.openSet();
        await app.editor.click();
        await page.keyboard.type("SELECT 1");
        await app.exerciseButton(2).click();
        await app.exerciseButton(1).click();
        expect(await editorValue(page)).toBe("SELECT 1");
        await page.locator("#tab-schema").click();
        await app.schemaInsert("customers").click();
        expect(await editorValue(page)).toBe("SELECT 1 customers");
        await expect(app.editor).toBeFocused();
    });

    test("a late CodeMirror carries the caret and a selection of multi-line text where they were", async ({ page, app }) => {
        let release;
        const held = new Promise((resolve) => (release = resolve));
        await page.route(`**/${BUNDLE}`, async (route) => {
            await held;
            await route.continue();
        });
        await page.addInitScript(() => {
            try {
                localStorage.setItem("sqlime.query.northlight_retail.db", "SELECT *\nFROM stores\nWHERE 1\nLIMIT 3");
            } catch {}
        });
        await app.open();
        await expect(page.locator("#editor")).toHaveAttribute("data-editor", "plain");
        // the caret at the end of the restored SQL, then the last two lines selected upwards
        await app.editor.focus();
        await page.keyboard.press("Control+End");
        await page.keyboard.press("Shift+ArrowUp");
        const before = await page.locator("#editor").evaluate((el) => el.query);
        release();
        await expect(page.locator("#editor")).toHaveAttribute("data-editor", "code");
        await expect(app.editor).toBeFocused();
        expect(await page.locator("#editor").evaluate((el) => el.query)).toBe(before);
        await page.keyboard.press("Control+End");
        await page.keyboard.type(";");
        expect(await editorValue(page)).toBe("SELECT *\nFROM stores\nWHERE 1\nLIMIT 3;");
    });

    test("an unsupported address says so at once, without waiting for the editor", async ({ page, app }) => {
        await page.route(`**/${BUNDLE}`, () => {}); // never answers
        await page.goto("./#scheme:abc");
        await expect(app.errorBand.locator(".results-band-text")).toContainText("Failed to load database", { timeout: 1500 });
    });

    test("names that begin outside ASCII are offered, and nothing is spliced onto them", async ({ page, app }) => {
        await app.open();
        await app.run('CREATE TABLE "über" (größe INTEGER); CREATE TABLE "日本" (id INTEGER);');
        await typeFresh(page, app, "SELECT * FROM üb");
        await expect(option(page, "über")).toBeVisible();
        expect(await completions(page)).not.toContain("BEFORE");
        await pick(page);
        await page.keyboard.press("Enter");
        // quoted, as the Schema tab inserts it, and nothing of the typed word left over
        expect(await editorValue(page)).toBe('SELECT * FROM "über"');
        await page.keyboard.press("Control+Enter");
        await app.settle();
        await expect(app.status).toHaveText(/^0 rows in \d+ ms$/);
        await typeFresh(page, app, "SELECT * FROM 日");
        await expect(option(page, "日本")).toBeVisible();
        // a name that starts with _ is not cut either: no "products" offered for the "pr" of "__pr"
        await app.run('CREATE TABLE "_tmp" (x);');
        await typeFresh(page, app, "SELECT * FROM _t");
        await expect(option(page, "_tmp")).toBeVisible();
        await typeFresh(page, app, "SELECT * FROM __pr");
        await page.waitForTimeout(400);
        expect(await completions(page)).not.toContain("products");
    });

    test('a quoted name with a quote inside, typed from its opening quote, goes in doubled and runs', async ({ page, app }) => {
        await app.open();
        await app.run('CREATE TABLE "q""uote" (id INTEGER); INSERT INTO "q""uote" VALUES (7);');
        await typeFresh(page, app, 'SELECT id FROM "q');
        await expect(page.getByRole("listbox")).toBeVisible();
        await pick(page);
        await page.keyboard.press("Enter");
        expect(await editorValue(page)).toBe('SELECT id FROM "q""uote"');
        await page.keyboard.press("Control+Enter");
        await app.settle();
        expect(await app.read()).toEqual({ columns: ["id"], rows: [["7"]] });
    });

    test("the list's opening is said once, not again at every key while it stays open (after a dot too)", async ({ page, app }) => {
        await app.open();
        await page.locator("#editor .cm-announced").evaluate((region) => {
            window.__said = [];
            new MutationObserver(() => {
                const text = region.textContent.trim();
                if (text) {
                    window.__said.push(text);
                }
            }).observe(region, { childList: true, subtree: true, characterData: true });
        });
        await typeFresh(page, app, "SELECT * FROM orders o WHERE o.");
        for (const letter of "cust") {
            await page.waitForTimeout(160);
            await page.keyboard.type(letter);
        }
        await expect(page.getByRole("listbox")).toBeVisible();
        await page.waitForTimeout(300);
        const said = await page.evaluate(() => window.__said);
        expect(said.filter((text) => /suggestions?\./.test(text)).length).toBeLessThanOrEqual(2);
    });

    test("after a table or an alias and a dot, only its columns: no keyword or function", async ({ page, app }) => {
        await app.open();
        await typeFresh(page, app, "SELECT * FROM orders o WHERE o.c");
        await expect(option(page, "customer_id")).toBeVisible();
        const labels = await completions(page);
        expect(labels.filter((label) => label === label.toUpperCase() && /^[A-Z_]+$/.test(label))).toEqual([]);
    });

    test("after a name lang-sql cannot read and a dot, that table's columns (not the tables)", async ({ page, app }) => {
        await app.open();
        await app.run('CREATE TABLE "café" (prix REAL); CREATE TABLE "_a" (_c INTEGER, kol INTEGER); CREATE TABLE "a""b" (qq INTEGER);');
        await typeFresh(page, app, 'SELECT "café".');
        await page.keyboard.press("Control+Space");
        await expect(option(page, "prix")).toBeVisible();
        expect(await completions(page)).not.toContain("orders");
        await typeFresh(page, app, "SELECT * FROM _a WHERE _a.k");
        await expect(option(page, "kol")).toBeVisible();
        await pick(page);
        await page.keyboard.press("Enter");
        expect(await editorValue(page)).toBe("SELECT * FROM _a WHERE _a.kol");
        await typeFresh(page, app, 'SELECT "a""b".');
        await page.keyboard.press("Control+Space");
        await expect(option(page, "qq")).toBeVisible();
    });

    test("words with combining marks are whole words: nothing is offered for their end, nothing spliced", async ({ page, app }) => {
        await app.open();
        await app.run('CREATE TABLE "कान" (id INTEGER); CREATE TABLE "नाम" (id INTEGER);');
        await typeFresh(page, app, "SELECT * FROM कान");
        await page.waitForTimeout(400);
        expect(await completions(page)).not.toContain("नाम");
        await typeFresh(page, app, "SELECT * FROM ना");
        await expect(option(page, "नाम")).toBeVisible();
        await pick(page);
        await page.keyboard.press("Enter");
        expect(await editorValue(page)).toBe('SELECT * FROM "नाम"');
    });

    test("a doubled quote typed inside a quoted name is not taken for a new name", async ({ page, app }) => {
        await app.open();
        await app.run('CREATE TABLE "a""b" (id INTEGER);');
        await typeFresh(page, app, 'SELECT * FROM "a""');
        await page.waitForTimeout(400);
        expect((await completions(page)).filter((label) => label.startsWith('"'))).toEqual([]);
        expect(await editorValue(page)).toBe('SELECT * FROM "a""');
    });

    test("a late CodeMirror carries the caret after blank lines typed in the plain editor, and the Schema tab inserts there", async ({ page, app }) => {
        let release;
        const held = new Promise((resolve) => (release = resolve));
        await page.route(`**/${BUNDLE}`, async (route) => {
            await held;
            await route.continue();
        });
        await app.open();
        await expect(page.locator("#editor")).toHaveAttribute("data-editor", "plain");
        await app.editor.click();
        await page.keyboard.press("Control+a");
        await page.keyboard.press("Delete");
        await page.keyboard.type("select 1;");
        await page.keyboard.press("Enter");
        await page.keyboard.press("Enter");
        await page.keyboard.type("select 2");
        release();
        await expect(page.locator("#editor")).toHaveAttribute("data-editor", "code");
        await page.keyboard.type("!");
        expect(await editorValue(page)).toMatch(/^select 1;\n+select 2!$/);
        // the caret moved there in the plain editor is the student's: an insert goes there
        await page.keyboard.press("Control+Home");
        await page.keyboard.press("ArrowRight");
        await page.keyboard.press("ArrowRight");
        await page.locator("#tab-schema").click();
        await app.schemaInsert("customers").click();
        expect(await editorValue(page)).toMatch(/^se customers lect 1;\n+select 2!$/);
    });

    test("a late CodeMirror keeps a Schema insert at the caret chosen in the plain editor", async ({ page, app }) => {
        let release;
        const held = new Promise((resolve) => (release = resolve));
        await page.route(`**/${BUNDLE}`, async (route) => {
            await held;
            await route.continue();
        });
        await app.open();
        await expect(page.locator("#editor")).toHaveAttribute("data-editor", "plain");
        await app.editor.click();
        await page.keyboard.press("Control+a");
        await page.keyboard.press("Delete");
        await page.keyboard.type("select 1");
        await page.keyboard.press("Enter");
        await page.keyboard.type("from x");
        await page.keyboard.press("Control+Home");
        await page.keyboard.press("ArrowRight");
        await page.keyboard.press("ArrowRight");
        release();
        await expect(page.locator("#editor")).toHaveAttribute("data-editor", "code");
        await page.locator("#tab-schema").click();
        await app.schemaInsert("customers").click();
        expect(await editorValue(page)).toBe("se customers lect 1\nfrom x");
    });

    test("a table named __proto__ is offered like any other", async ({ page, app }) => {
        await app.open();
        await app.run('CREATE TABLE "__proto__" (zcol INTEGER);');
        await typeFresh(page, app, "SELECT * FROM __pr");
        await expect(option(page, "__proto__")).toBeVisible();
        await expect(option(page, "__proto__").locator(".cm-completionDetail")).toHaveText("table");
        // and its columns after its quoted name and a dot (lang-sql's namespace has the entry)
        await typeFresh(page, app, 'SELECT "__proto__".');
        await page.keyboard.press("Control+Space");
        await expect(option(page, "zcol")).toBeVisible();
    });
});

test("the plain box is still there to type into when the page has no CodeMirror", async ({ page, app }) => {
    await page.route(`**/${BUNDLE}`, (route) => route.abort());
    await app.open();
    // the helpers' typing surface is the box itself
    await expect(page.locator(EDITOR_INPUT)).toHaveCount(1);
    await expect(page.locator(EDITOR_INPUT)).toHaveAttribute("id", "editor");
    await app.editor.fill("SELECT 'plain' AS p;");
    await page.keyboard.press("Control+Enter");
    await app.settle();
    expect(await app.read()).toEqual({ columns: ["p"], rows: [["plain"]] });
});
