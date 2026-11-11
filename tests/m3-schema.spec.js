// M3 part 2: F4 the Schema tab of the sidebar (js/lab/schema.js, js/lab/insert.js, css/schema.css).
const {
    test,
    expect,
    App,
    PAYLOAD,
    ATTR_PAYLOAD,
    quoteIdent,
    realManifest,
    routeManifest,
    withSampleDataset,
    expectSchemaIconsOnly,
    tabTo,
} = require("./helpers");

const sqlFile = App.sqlFile;
const NBSP = " ";

// editorText is the SQL in the editor, as the Run button would read it.
const editorText = (page) => page.locator("#editor").evaluate((el) => el.innerText);

// caretAt puts the caret in the editor after `offset` characters of its (single text node) text.
async function caretAt(page, offset, length = 0) {
    await page.locator("#editor").evaluate(
        (el, [start, len]) => {
            HTMLElement.prototype.focus.call(el);
            const node = el.firstChild;
            const range = document.createRange();
            range.setStart(node, start);
            range.setEnd(node, start + len);
            const selection = getSelection();
            selection.removeAllRanges();
            selection.addRange(range);
        },
        [offset, length]
    );
}

// the selection recorded by the sidebar arrives with the selectionchange event
const settle = (page) => page.evaluate(() => new Promise((resolve) => setTimeout(resolve, 50)));

test.describe("schema sidebar: listing", () => {
    test("lists Northlight's five tables and the v_sales view with row counts", async ({ app }) => {
        await app.open();
        await expect(app.schemaToggle).toHaveAttribute("aria-selected", "true");
        await expect(app.page.locator("#schema .schema-item")).toHaveCount(6);
        expect(await app.schemaSummary()).toEqual([
            { name: "customers", count: "60", view: false },
            { name: "order_items", count: "906", view: false },
            { name: "orders", count: "450", view: false },
            { name: "products", count: "20", view: false },
            { name: "stores", count: "5", view: false },
            { name: "v_sales", count: "906", view: true },
        ]);
        // internal tables are not listed, and the counts agree with SQL
        expect((await app.query("SELECT COUNT(*) FROM orders")).rows).toEqual([["450"]]);
        // the dataset's name and description sit at the top
        await expect(app.page.locator("#schema .schema-dataset-name")).toHaveText("Northlight Retail");
        await expect(app.page.locator("#schema .schema-dataset-description")).toContainText("v_sales reporting view");
    });

    test("an upload shows no dataset heading, and SQLite's own tables are hidden", async ({ app }) => {
        await app.open();
        await app.upload(sqlFile("mine.sql", "CREATE TABLE t (id INTEGER PRIMARY KEY AUTOINCREMENT); INSERT INTO t DEFAULT VALUES;"));
        await expect(app.page.locator("#schema .schema-dataset")).toBeHidden();
        expect(await app.schemaSummary()).toEqual([{ name: "t", count: "1", view: false }]);
    });

    test("expanding shows columns with types; a view with untyped columns displays correctly", async ({ app }) => {
        await app.open();
        const expander = app.schemaExpand("orders");
        await expect(expander).toHaveAttribute("aria-expanded", "false");
        await expect(app.schemaItem("orders").locator(".schema-columns")).toBeHidden();
        await expander.click();
        await expect(expander).toHaveAttribute("aria-expanded", "true");
        expect(await app.schemaColumns("orders")).toEqual([
            { name: "order_id", type: "INTEGER" },
            { name: "customer_id", type: "INTEGER" },
            { name: "store_id", type: "INTEGER" },
            { name: "order_date", type: "TEXT" },
            { name: "payment_method", type: "TEXT" },
        ]);
        await expect(app.schemaItem("orders").locator(".schema-pk")).toHaveCount(1);

        await app.schemaExpand("v_sales", "view").click();
        const columns = await app.schemaColumns("v_sales", "view");
        expect(columns).toHaveLength(13);
        // customer_name and line_revenue are expressions: no declared type, and nothing broken
        expect(columns.find((c) => c.name === "customer_name")).toEqual({ name: "customer_name", type: null });
        expect(columns.find((c) => c.name === "line_revenue")).toEqual({ name: "line_revenue", type: null });
        expect(columns.find((c) => c.name === "quantity")).toEqual({ name: "quantity", type: "INTEGER" });

        await expander.click();
        await expect(expander).toHaveAttribute("aria-expanded", "false");
        await expect(app.schemaItem("orders").locator(".schema-columns")).toBeHidden();
    });

    test("expanding and inserting are separate real buttons with useful names", async ({ app }) => {
        await app.open();
        const item = app.schemaItem("orders");
        await expect(item.locator("button")).toHaveCount(2);
        await expect(item.getByRole("button", { name: "Columns of table orders" })).toHaveAttribute("aria-expanded", "false");
        await expect(item.getByRole("button", { name: "Insert table name orders into the query" })).not.toHaveAttribute("aria-expanded");
        // clicking a name inserts and does not expand
        await app.schemaInsert("orders").click();
        await expect(app.schemaExpand("orders")).toHaveAttribute("aria-expanded", "false");
    });

    test("an empty database says there are no tables yet; it goes away with the first table", async ({ app }) => {
        await app.openEmpty();
        await expect(app.schemaToggle).toHaveAttribute("aria-selected", "true");
        await expect(app.page.locator("#schema .schema-message")).toContainText("No tables yet");
        await expect(app.page.locator("#schema .schema-item")).toHaveCount(0);
        await app.run("CREATE TABLE a (x)");
        await expect(app.page.locator("#schema .schema-item")).toHaveCount(1);
        await expect(app.page.locator("#schema .schema-message")).toBeHidden();
        await app.run("DROP TABLE a");
        await expect(app.page.locator("#schema .schema-message")).toContainText("No tables yet");
    });

    test("a view or table whose count or columns cannot be read shows a dash and breaks nothing", async ({ app }) => {
        await app.open();
        await app.upload(
            sqlFile(
                "broken.sql",
                "CREATE TABLE base (a); CREATE VIEW broken AS SELECT a FROM base; CREATE TABLE ok (x INTEGER); INSERT INTO ok VALUES (1), (2); DROP TABLE base;"
            )
        );
        expect(await app.schemaSummary()).toEqual([
            { name: "ok", count: "2", view: false },
            { name: "broken", count: "–", view: true },
        ]);
        await app.schemaExpand("broken", "view").click();
        await expect(app.schemaItem("broken", "view").locator(".schema-unavailable")).toHaveText(/^–/);
        await app.schemaExpand("ok").click();
        expect(await app.schemaColumns("ok")).toEqual([{ name: "x", type: "INTEGER" }]);
    });
});

test.describe("schema sidebar: inserting", () => {
    test("a click inserts at the caret, focus returns to the editor with the caret after the name", async ({ app, page }) => {
        await app.open();
        await app.editor.fill("SELECT  FROM stores");
        await caretAt(page, 7);
        await settle(page);
        await app.schemaExpand("stores").click();
        await app.schemaColumn("stores", "store_name").click();
        expect(await editorText(page)).toBe("SELECT store_name FROM stores");
        await expect(app.editor).toBeFocused();
        // the caret is right after the inserted name
        await page.keyboard.type(",");
        expect(await editorText(page)).toBe("SELECT store_name, FROM stores");
        expect(await editorText(page)).not.toContain(NBSP);
    });

    test("a space is added only where the neighbouring text needs one", async ({ app, page }) => {
        await app.open();
        await app.editor.fill("SELECT FROM stores");
        await caretAt(page, 7);
        await settle(page);
        await app.schemaExpand("stores").click();
        await app.schemaColumn("stores", "city").click();
        expect(await editorText(page)).toBe("SELECT city FROM stores");
        // the caret sits right after "city", in front of the space that was added
        await page.keyboard.type(",");
        expect(await editorText(page)).toBe("SELECT city, FROM stores");

        // after a dot or an opening bracket no space is added
        await app.editor.fill("SELECT s. FROM stores s");
        await caretAt(page, 9);
        await settle(page);
        await app.schemaColumn("stores", "region").click();
        expect(await editorText(page)).toBe("SELECT s.region FROM stores s");
        await app.editor.fill("SELECT COUNT() FROM stores");
        await caretAt(page, 13);
        await settle(page);
        await app.schemaColumn("stores", "city").click();
        expect(await editorText(page)).toBe("SELECT COUNT(city) FROM stores");
    });

    test("a selection is replaced", async ({ app, page }) => {
        await app.open();
        await app.editor.fill("SELECT * FROM stores");
        await caretAt(page, 7, 1);
        await settle(page);
        await app.schemaExpand("stores").click();
        await app.schemaColumn("stores", "city").click();
        expect(await editorText(page)).toBe("SELECT city FROM stores");
        await expect(app.editor).toBeFocused();
    });

    test("an insertion is one undo step", async ({ app, page }) => {
        await app.open();
        await app.editor.fill("SELECT  FROM stores");
        await caretAt(page, 7);
        await settle(page);
        await app.schemaInsert("orders").click();
        expect(await editorText(page)).toBe("SELECT orders FROM stores");
        await page.keyboard.press("Control+z");
        expect(await editorText(page)).toBe("SELECT  FROM stores");
    });

    test("it works after the click moved the focus away from the editor", async ({ app, page }) => {
        await app.open();
        await app.editor.fill("SELECT  FROM stores");
        await caretAt(page, 7);
        await settle(page);
        // the student clicks elsewhere on the page, then on text in the sidebar, then on a name there
        await page.locator("#status").click();
        await page.locator("#schema .schema-dataset-description").click();
        await expect(app.editor).not.toBeFocused();
        await app.schemaInsert("customers").click();
        expect(await editorText(page)).toBe("SELECT customers FROM stores");
        await expect(app.editor).toBeFocused();
        // and again: the caret is now after the name; a second name follows it
        await app.schemaInsert("stores").click();
        expect(await editorText(page)).toBe("SELECT customers stores FROM stores");
    });

    test("quotes a name only when it needs it: keywords, spaces, double quotes, digits", async ({ app, page }) => {
        await app.open();
        await app.upload(
            sqlFile(
                "names.sql",
                [
                    'CREATE TABLE "order" ("select" INTEGER, "my col" TEXT, plain_name TEXT, "1st" TEXT, "Mixed_Case" TEXT);',
                    'CREATE TABLE "my table" (a INTEGER);',
                    'CREATE TABLE "we""ird" (b INTEGER);',
                    "CREATE TABLE plain (c INTEGER);",
                    'CREATE TABLE "Group" (d INTEGER);',
                ].join("\n")
            )
        );
        for (const [table, label] of [
            ["order", '"order"'],
            ["my table", '"my table"'],
            ["we\"ird", '"we""ird"'],
            ["plain", "plain"],
            ["Group", '"Group"'],
        ]) {
            await app.editor.fill("");
            await app.schemaInsert(table).click();
            expect(await editorText(page)).toBe(label);
        }
        await app.schemaExpand("order").click();
        for (const [column, label] of [
            ["select", '"select"'],
            ["my col", '"my col"'],
            ["plain_name", "plain_name"],
            ["1st", '"1st"'],
            ["Mixed_Case", "Mixed_Case"],
        ]) {
            await app.editor.fill("");
            await app.schemaColumn("order", column).click();
            expect(await editorText(page)).toBe(label);
        }
        // ordinary spaces, not non-breaking ones
        await app.editor.fill("");
        await app.schemaInsert("my table").click();
        expect(await editorText(page)).not.toContain(NBSP);
        // the inserted text runs
        await app.editor.fill("SELECT * FROM ");
        await app.schemaInsert("we\"ird").click();
        await app.editor.press("Control+Enter");
        await expect(app.status).toContainText("0 rows, took");
        await app.editor.fill("SELECT * FROM ");
        await app.schemaInsert("order").click();
        await app.editor.press("Control+Enter");
        await expect(app.status).toContainText("0 rows, took");
    });

    test("a fresh page: a click without placing the caret appends cleanly after the preview SQL", async ({ app, page }) => {
        await app.open();
        expect(await editorText(page)).toBe('select * from "stores" limit 10');
        await app.schemaInsert("orders").click();
        expect(await editorText(page)).toBe('select * from "stores" limit 10 orders');
        await expect(app.editor).toBeFocused();
    });

    test("after picking a database the caret is not in the editor; a click still appends at the end", async ({ app, page }) => {
        await withSampleDataset(page);
        await app.open();
        await app.pickDatabase("Sample Fruit");
        await expect(app.status).toContainText(/\d+ rows?, took/);
        const preview = await editorText(page);
        expect(preview).toMatch(/^select \* from /);
        const first = await page.locator("#schema .schema-insert").first().textContent();
        await page.locator("#schema .schema-insert").first().click();
        expect((await editorText(page)).replace(/\s+$/, "")).toBe(`${preview.trim()} ${first}`);
        // the schema shows the new dataset
        await expect(page.locator("#schema .schema-dataset-name")).toHaveText("Sample Fruit");
    });

    test("the keyboard path: focus, expand, insert", async ({ app, page }) => {
        await app.open();
        await app.editor.fill("SELECT  FROM stores");
        await caretAt(page, 7);
        await settle(page);
        // The sidebar comes before the editor in the page (skip link, top bar, sidebar, Run, editor).
        // Escape, then Shift+Tab leaves the editor and walks back through Run to the sidebar.
        await page.keyboard.press("Escape");
        await page.keyboard.press("Shift+Tab");
        let inSidebar = false;
        for (let i = 0; i < 15 && !inSidebar; i++) {
            inSidebar = await page.evaluate(() => !!document.activeElement.closest("#sidebar"));
            if (!inSidebar) await page.keyboard.press("Shift+Tab");
        }
        expect(inSidebar, "the sidebar is reachable with Tab").toBe(true);
        // on back to the top bar's last control with keys; forward from there the first sidebar stop
        // is the Schema tab, then the panel's controls
        expect(await tabTo(page, "#help-button", { back: true }), "Shift+Tab reaches Help").toBe(true);
        await page.keyboard.press("Tab");
        expect(await page.evaluate(() => document.activeElement.id)).toBe("tab-schema");
        await page.keyboard.press("Tab");
        expect(await page.evaluate(() => !!document.activeElement.closest("#schema"))).toBe(true);
        // a real keyboard user: Enter on the expander, then on a column name
        await app.schemaExpand("stores").focus();
        await page.keyboard.press("Enter");
        await expect(app.schemaExpand("stores")).toHaveAttribute("aria-expanded", "true");
        await app.schemaColumn("stores", "store_name").focus();
        await page.keyboard.press("Enter");
        await expect(app.editor).toBeFocused();
        expect(await editorText(page)).toBe("SELECT store_name FROM stores");
        // Space works on the expander too
        await app.schemaExpand("orders").focus();
        await page.keyboard.press("Space");
        await expect(app.schemaExpand("orders")).toHaveAttribute("aria-expanded", "true");
    });
});

test.describe("schema sidebar: collapsing", () => {
    test("another tab and the sidebar splitter hide the whole panel; the tab is not remembered across loads", async ({ app, page }) => {
        await app.open();
        await expect(app.schemaToggle).toHaveAttribute("aria-selected", "true");
        await expect(page.locator("#schema-panel")).toBeVisible();
        // another tab hides the panel
        await app.openTab("exercises");
        await expect(app.schemaToggle).toHaveAttribute("aria-selected", "false");
        await expect(page.locator("#schema-panel")).toBeHidden();
        await expect(app.schemaInsert("orders")).toHaveCount(0); // not in the accessibility tree
        await app.openTab("schema");
        await expect(app.schemaToggle).toHaveAttribute("aria-selected", "true");
        await expect(page.locator("#schema-panel")).toBeVisible();
        // the splitter hides the whole sidebar (Enter), and shows it again
        const before = (await app.result.boundingBox()).width;
        await page.locator("#sidebar-splitter").focus();
        await page.keyboard.press("Enter");
        await expect(page.locator("#app")).toHaveClass(/app--sidebar-collapsed/);
        await expect(page.locator("#schema-panel")).toBeHidden();
        await expect(app.schemaInsert("orders")).toHaveCount(0); // not in the accessibility tree
        // the results get the room
        const width = (await app.result.boundingBox()).width;
        expect(width).toBeGreaterThan(0);
        expect(width).toBeGreaterThan(before);
        await page.keyboard.press("Enter");
        await expect(page.locator("#schema-panel")).toBeVisible();
        // the selected tab is not persisted: nothing in storage about it, and a reload starts on Schema again
        await app.openTab("history");
        const keys = await page.evaluate(() => Object.keys(localStorage).concat(Object.keys(sessionStorage)));
        expect(keys.filter((k) => /schema|sidebar/i.test(k))).toEqual([]);
        await page.reload();
        await app.waitReady();
        await expect(app.schemaToggle).toHaveAttribute("aria-selected", "true");
        await expect(page.locator("#schema-panel")).toBeVisible();
    });

    test("it is the selected tab at phone width too, above the editor, and follows the database while another tab is shown", async ({ app, page }) => {
        await page.setViewportSize({ width: 390, height: 800 });
        await app.open();
        await expect(app.schemaToggle).toHaveAttribute("aria-selected", "true");
        await expect(page.locator("#schema-panel")).toBeVisible();
        await expect(app.schemaInsert("orders")).toBeVisible();
        // while another tab is shown, the panel still follows the database
        await app.openTab("history");
        await expect(page.locator("#schema-panel")).toBeHidden();
        await app.run("CREATE TABLE phone_t (a)");
        await expect(app.status).toContainText(/Executing|rows?, took/);
        await app.openTab("schema");
        await expect(app.schemaInsert("phone_t")).toBeVisible();
    });
});

test.describe("schema sidebar: refresh", () => {
    test("follows CREATE TABLE, INSERT, DELETE and DROP", async ({ app }) => {
        await app.open();
        await app.run("CREATE TABLE zoo (animal TEXT, legs INTEGER)");
        await expect(app.schemaItem("zoo")).toHaveCount(1);
        expect((await app.schemaSummary()).find((s) => s.name === "zoo").count).toBe("0");

        await app.run("INSERT INTO zoo VALUES ('ant', 6), ('cat', 4), ('eel', 0)");
        await expect(app.schemaItem("zoo").locator(".schema-count")).toContainText("3");
        await app.run("DELETE FROM zoo WHERE legs = 0");
        await expect(app.schemaItem("zoo").locator(".schema-count")).toContainText("2");
        // statements that change rows of other tables update their counts too
        await app.run("DELETE FROM order_items");
        await expect(app.schemaItem("order_items").locator(".schema-count")).toContainText("0");
        await expect(app.schemaItem("v_sales", "view").locator(".schema-count")).toContainText("0");

        await app.run("CREATE VIEW zoo_v AS SELECT animal FROM zoo");
        await expect(app.schemaItem("zoo_v", "view")).toHaveCount(1);
        await app.run("DROP VIEW zoo_v; DROP TABLE zoo");
        await expect(app.page.locator("#schema .schema-item")).toHaveCount(6);
        await expect(app.schemaItem("zoo")).toHaveCount(0);
    });

    test("a run whose second statement fails still refreshes the statements before it", async ({ app }) => {
        await app.open();
        await app.run("CREATE TABLE before_error (a); SELECT nope FROM before_error");
        await expect(app.status).toContainText("no such column: nope");
        await expect(app.schemaItem("before_error")).toHaveCount(1);
        await app.run("INSERT INTO before_error VALUES (1); INSERT INTO missing_table VALUES (2)");
        await expect(app.status).toContainText("no such table");
        await expect(app.schemaItem("before_error").locator(".schema-count")).toContainText("1");
    });

    test("re-renders only when the schema or the data changed", async ({ app, page }) => {
        await app.open();
        await app.page.locator("#schema .schema-list").first().evaluate((list) => {
            list.querySelector(".schema-item").__marker = true;
        });
        const marked = () => page.locator("#schema .schema-item").first().evaluate((li) => li.__marker === true);
        await app.query("SELECT COUNT(*) FROM orders");
        expect(await marked()).toBe(true);
        await app.run("PRAGMA table_info(orders)");
        await expect(app.status).toContainText(/rows?, took/);
        expect(await marked()).toBe(true);
        await app.run("INSERT INTO stores VALUES (6, 'Hull', 'Hull', 'East Yorkshire', '2026-01-01')");
        await expect(app.schemaItem("stores").locator(".schema-count")).toContainText("6");
        expect(await marked()).toBe(false);
    });

    test("expanded tables stay expanded, and show new columns after ALTER", async ({ app }) => {
        await app.open();
        await app.schemaExpand("orders").click();
        await app.schemaExpand("v_sales", "view").click();
        await app.run("CREATE TABLE extra (a)");
        await expect(app.schemaItem("extra")).toHaveCount(1);
        await expect(app.schemaExpand("orders")).toHaveAttribute("aria-expanded", "true");
        await expect(app.schemaExpand("v_sales", "view")).toHaveAttribute("aria-expanded", "true");
        await expect(app.schemaExpand("stores")).toHaveAttribute("aria-expanded", "false");
        await app.run("ALTER TABLE orders ADD COLUMN note TEXT");
        await expect(app.schemaItem("orders").locator(".schema-column")).toHaveCount(6);
        expect((await app.schemaColumns("orders")).at(-1)).toEqual({ name: "note", type: "TEXT" });
        // a dropped table is forgotten: a new table of the same name starts closed
        await app.run("DROP TABLE extra; CREATE TABLE extra (b)");
        await expect(app.schemaExpand("extra")).toHaveAttribute("aria-expanded", "false");
        // a new database starts with nothing expanded
        await app.upload(sqlFile("other.sql", "CREATE TABLE orders (q)"));
        await expect(app.schemaExpand("orders")).toHaveAttribute("aria-expanded", "false");
    });

    test("the scroll position survives a refresh", async ({ app, page }) => {
        await page.setViewportSize({ width: 1280, height: 500 });
        const tables = Array.from({ length: 40 }, (_, i) => `CREATE TABLE t${String(i).padStart(2, "0")} (a);`).join("\n");
        await app.open();
        await app.upload(sqlFile("many.sql", tables));
        // the Schema tab's panel is what scrolls (its lists are as tall as they are)
        const scroll = page.locator("#panel-schema");
        const scrollable = await scroll.evaluate((el) => el.scrollHeight - el.clientHeight);
        expect(scrollable).toBeGreaterThan(100);
        await scroll.evaluate((el) => (el.scrollTop = 200));
        const before = await scroll.evaluate((el) => el.scrollTop);
        expect(before).toBeGreaterThan(100);
        await app.run("CREATE TABLE zzz (a)");
        await expect(app.schemaItem("zzz")).toHaveCount(1);
        expect(await scroll.evaluate((el) => el.scrollTop)).toBe(before);
        // the panel scrolls on its own: the page itself did not have to move
        expect(await page.evaluate(() => scrollY)).toBe(0);
    });

    test("focus on a sidebar button survives a refresh", async ({ app, page }) => {
        await app.open();
        // a run started from the keyboard while the focus is in the sidebar cannot happen, so
        // call the app's own execute path through the Run button's action with the focus kept
        await app.editor.fill("CREATE TABLE keep_focus (a)");
        await app.schemaExpand("stores").focus();
        await page.evaluate(() => window.app.actions.executeCurrent());
        await expect(app.schemaItem("keep_focus")).toHaveCount(1);
        await expect(app.schemaExpand("stores")).toBeFocused();
    });
});

test.describe("schema sidebar: hostile names", () => {
    test("names in an uploaded database are text: no element, no script", async ({ app, page, pageErrors }) => {
        const names = [PAYLOAD, ATTR_PAYLOAD];
        const sql = names
            .map((n) => `CREATE TABLE ${quoteIdent(n)} (${quoteIdent(n)} ${"TEXT"}, ${quoteIdent(ATTR_PAYLOAD + "2")} ${quoteIdent(PAYLOAD)}); INSERT INTO ${quoteIdent(n)} VALUES ('x', 'y');`)
            .join("\n") + `CREATE VIEW ${quoteIdent("v" + PAYLOAD)} AS SELECT 1 AS ${quoteIdent(PAYLOAD)};`;
        await app.open();
        await app.upload(sqlFile("evil.sql", sql));
        await page.waitForTimeout(200);
        await app.expectInert();
        expect((await app.schemaSummary()).map((s) => s.name).sort()).toEqual([ATTR_PAYLOAD, PAYLOAD, "v" + PAYLOAD].sort());
        await expectSchemaIconsOnly(page);
        for (const name of names) {
            await app.schemaExpand(name).click();
            const columns = await app.schemaColumns(name);
            expect(columns.map((c) => c.name)).toEqual([name, ATTR_PAYLOAD + "2"]);
            expect(columns[1].type).toBe(PAYLOAD);
        }
        await app.schemaExpand("v" + PAYLOAD, "view").click();
        expect((await app.schemaColumns("v" + PAYLOAD, "view")).map((c) => c.name)).toEqual([PAYLOAD]);
        await expectSchemaIconsOnly(page);
        await app.expectInert();
        // inserting quotes it and creates no element in the editor either
        await app.editor.fill("");
        await app.schemaInsert(PAYLOAD).click();
        expect(await editorText(page)).toBe(quoteIdent(PAYLOAD));
        await expect(page.locator("#editor *")).toHaveCount(0);
        await app.expectInert();
        await app.editor.press("Control+Enter");
        await app.expectInert();
        // a hostile run does not break the refresh
        await app.run(`DROP TABLE ${quoteIdent(PAYLOAD)}`);
        await expect(app.schemaItem(PAYLOAD)).toHaveCount(0);
        await app.expectInert();
        expect(pageErrors).toEqual([]);
    });

    test("a hostile dataset name and description from the manifest are text", async ({ app, page }) => {
        const manifest = realManifest();
        manifest.datasets[0].name = ATTR_PAYLOAD;
        manifest.datasets[0].description = PAYLOAD;
        await routeManifest(page, manifest);
        await app.open();
        await expect(page.locator("#schema .schema-dataset-name")).toHaveText(ATTR_PAYLOAD);
        await expect(page.locator("#schema .schema-dataset-description")).toHaveText(PAYLOAD);
        await app.expectInert();
    });
});

test.describe("schema sidebar: layout", () => {
    const sizes = [
        [1280, 800],
        [768, 800],
        [390, 800],
    ];

    for (const scheme of ["light", "dark"]) {
        for (const [width, height] of sizes) {
            test(`no horizontal overflow at ${width}px, ${scheme} scheme, with long names`, async ({ app, page }) => {
                await page.emulateMedia({ colorScheme: scheme });
                await page.setViewportSize({ width, height });
                const long = "a_very_long_table_name_without_any_break_".repeat(3);
                await app.open();
                await app.upload(
                    sqlFile(
                        "long.sql",
                        `CREATE TABLE ${long} (${long}_column INTEGER, ${quoteIdent("name with many words " + "word ".repeat(12))} TEXT); INSERT INTO ${long} VALUES (1, 'x');`
                    )
                );
                // the Schema tab is the selected one at every width
                await expect(app.schemaToggle).toHaveAttribute("aria-selected", "true");
                await app.schemaExpand(long).click();
                await app.run("SELECT " + Array.from({ length: 12 }, (_, i) => `'cell value number ${i}' AS c${i}`).join(", "));
                await expect(app.status).toContainText(/rows?, took/);
                const m = await page.evaluate(() => ({
                    scroll: document.documentElement.scrollWidth,
                    client: document.documentElement.clientWidth,
                    overflowing: [...document.querySelectorAll("#schema *")]
                        .filter((el) => el.getBoundingClientRect().right > document.documentElement.clientWidth + 0.5)
                        .map((el) => el.className),
                }));
                expect(m.scroll).toBeLessThanOrEqual(m.client);
                expect(m.overflowing).toEqual([]);
            });
        }
    }

    test("desktop: the sidebar sits beside the editor and results and scrolls on its own", async ({ app, page }) => {
        await page.setViewportSize({ width: 1280, height: 700 });
        await app.open();
        const aside = await page.locator("#sidebar").boundingBox();
        const main = await page.locator("#main").boundingBox();
        const editor = await app.editor.boundingBox();
        const result = await app.result.boundingBox();
        // the sidebar is the left column: the editor and the results are to its right
        expect(editor.x).toBeGreaterThanOrEqual(aside.x + aside.width);
        expect(result.x).toBeGreaterThanOrEqual(aside.x + aside.width);
        expect(Math.abs(aside.y - main.y)).toBeLessThan(40);
        expect(aside.height).toBeLessThanOrEqual(700);
        for (const name of ["customers", "orders", "v_sales"]) {
            await app.schemaExpand(name, name === "v_sales" ? "view" : "table").click();
        }
        // the tab's panel scrolls on its own; the page does not
        const scroll = page.locator("#panel-schema");
        expect(await scroll.evaluate((el) => el.scrollHeight > el.clientHeight)).toBe(true);
        expect((await page.locator("#sidebar").boundingBox()).height).toBeLessThanOrEqual(700);
        expect(await page.evaluate(() => document.documentElement.scrollHeight <= innerHeight), "the page itself does not scroll at desktop size").toBe(true);
    });

    test("phone: a single column, the sidebar shown above the editor", async ({ app, page }) => {
        await page.setViewportSize({ width: 390, height: 800 });
        await app.open();
        await expect(app.schemaToggle).toHaveAttribute("aria-selected", "true");
        const aside = await page.locator("#sidebar").boundingBox();
        const editor = await app.editor.boundingBox();
        expect(aside.y + aside.height).toBeLessThanOrEqual(editor.y + 1);
        expect(aside.width).toBeLessThanOrEqual(390);
        const panel = await page.locator("#schema-panel").boundingBox();
        expect(panel.height).toBeGreaterThan(0);
        expect((await page.locator("#panel-schema").boundingBox()).height).toBeLessThanOrEqual(800 * 0.5 + 1);
    });
});
