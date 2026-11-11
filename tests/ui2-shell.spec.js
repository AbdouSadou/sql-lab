// UI plan (docs/design), Phase 2: the app shell. The page fills the window and never scrolls at
// desktop sizes (the panes do); the sidebar and the editor are resized with focusable splitters,
// and the sizes and the hidden sidebar survive a reload; the sidebar's tabs, the database
// switcher, the Export menu, Help, the status bar and the skip link work from the keyboard.

const { test, expect, failStorage, realManifest, modelQuery, SAMPLE_FILE } = require("./helpers");

const LAYOUT_KEY = "sqllab.layout";
const MANY_ROWS = "WITH RECURSIVE n(i) AS (SELECT 1 UNION ALL SELECT i + 1 FROM n WHERE i < 400) SELECT i, 'row ' || i AS label FROM n;";

const box = (locator) =>
    locator.evaluate((el) => {
        const r = el.getBoundingClientRect();
        return { x: Math.round(r.x), y: Math.round(r.y), width: Math.round(r.width), height: Math.round(r.height), bottom: Math.round(r.bottom) };
    });

const pageScroll = (page) =>
    page.evaluate(() => ({
        width: document.documentElement.scrollWidth,
        height: document.documentElement.scrollHeight,
        innerWidth: window.innerWidth,
        innerHeight: window.innerHeight,
    }));

const storedLayout = (page) => page.evaluate((key) => JSON.parse(localStorage.getItem(key)), LAYOUT_KEY);

test.describe("the shell fills the window", () => {
    for (const size of [
        { width: 1366, height: 768 },
        { width: 1920, height: 1080 },
        { width: 1024, height: 768 },
    ]) {
        test(`${size.width}x${size.height}: no page scrollbar, even with a long result; the result scrolls in its box under its summary`, async ({ page, app }) => {
            await page.setViewportSize(size);
            await app.open();
            await app.run(MANY_ROWS);
            await expect(app.status).toContainText("400 rows in");
            const scroll = await pageScroll(page);
            expect(scroll.height).toBeLessThanOrEqual(scroll.innerHeight);
            expect(scroll.width).toBeLessThanOrEqual(scroll.innerWidth);
            // the top bar at the top, the status bar at the bottom, the result scrolling between
            expect((await box(page.locator(".topbar"))).y).toBe(0);
            expect((await box(page.locator(".statusbar"))).bottom).toBe(size.height);
            const result = await app.result.evaluate((el) => ({ scroll: el.scrollHeight, client: el.clientHeight }));
            expect(result.scroll).toBeGreaterThan(result.client);
            // a scroll of the result leaves its summary line (and Download CSV) where it was
            const summary = await box(page.locator("#results-summary"));
            await app.result.evaluate((el) => el.scrollTo(0, 2000));
            expect(await box(page.locator("#results-summary"))).toEqual(summary);
            await expect(page.locator("#download-csv")).toBeInViewport();
            // the result is a Tab stop while it scrolls, so the keyboard can scroll it too
            await expect(app.result).toHaveAttribute("tabindex", "0");
        });
    }

    test("with every table expanded and a long history the panes scroll, not the page", async ({ page, app }) => {
        await page.setViewportSize({ width: 1366, height: 768 });
        await app.open();
        for (let i = 0; i < 30; i++) {
            await app.run(`SELECT ${i} AS n;`);
            await expect(app.status).toContainText("1 row in");
        }
        for (const name of ["customers", "order_items", "orders", "products", "stores"]) {
            await app.schemaExpand(name).click();
        }
        await app.schemaExpand("v_sales", "view").click();
        const panel = await page.locator("#panel-schema").evaluate((el) => ({ scroll: el.scrollHeight, client: el.clientHeight }));
        expect(panel.scroll).toBeGreaterThan(panel.client);
        let scroll = await pageScroll(page);
        expect(scroll.height).toBeLessThanOrEqual(scroll.innerHeight);
        await app.openHistory();
        await expect(app.historyEntries).toHaveCount(30);
        scroll = await pageScroll(page);
        expect(scroll.height).toBeLessThanOrEqual(scroll.innerHeight);
        // a scroll of the window moves nothing
        await page.evaluate(() => window.scrollTo(0, 200));
        expect(await page.evaluate(() => window.scrollY)).toBe(0);
    });

    test("in exercise mode the prompt takes its room and the page still does not scroll", async ({ page, app }) => {
        await page.setViewportSize({ width: 1366, height: 768 });
        await app.openSet("retail-basics", { ex: "e05" });
        await app.run(MANY_ROWS);
        await expect(app.status).toContainText("400 rows in");
        const scroll = await pageScroll(page);
        expect(scroll.height).toBeLessThanOrEqual(scroll.innerHeight);
        // the prompt sits above the toolbar, the toolbar above the editor
        const prompt = await box(app.exercisePanel);
        const toolbar = await box(page.locator("#editor-toolbar"));
        const editor = await box(page.locator("#editor-pane"));
        expect(prompt.bottom).toBeLessThanOrEqual(toolbar.y);
        expect(toolbar.bottom).toBeLessThanOrEqual(editor.y);
        expect(editor.height).toBeGreaterThanOrEqual(120);
    });
});

test.describe("splitters", () => {
    test.beforeEach(async ({ page }) => {
        await page.setViewportSize({ width: 1366, height: 768 });
    });

    test("the sidebar's splitter is a separator: arrow keys, Home and End resize within 220 to 420 px, Enter hides and shows", async ({ page, app }) => {
        await app.open();
        const splitter = page.locator("#sidebar-splitter");
        const sidebar = page.locator("#sidebar");
        await expect(splitter).toHaveAttribute("role", "separator");
        await expect(splitter).toHaveAttribute("aria-orientation", "vertical");
        await expect(splitter).toHaveAttribute("aria-controls", "sidebar");
        await expect(splitter).toHaveAccessibleName("Sidebar width");
        await expect(splitter).toHaveAttribute("aria-valuemin", "0");
        await expect(splitter).toHaveAttribute("aria-valuemax", "420");
        await expect(splitter).toHaveAttribute("aria-valuenow", "280");
        await expect(splitter).toHaveAttribute("aria-valuetext", "280 pixels wide");
        expect((await box(sidebar)).width).toBe(280);

        await splitter.focus();
        await page.keyboard.press("ArrowRight");
        await expect(splitter).toHaveAttribute("aria-valuenow", "296");
        expect((await box(sidebar)).width).toBe(296);
        await page.keyboard.press("ArrowLeft");
        await page.keyboard.press("ArrowLeft");
        await expect(splitter).toHaveAttribute("aria-valuenow", "264");
        await page.keyboard.press("Home");
        await expect(splitter).toHaveAttribute("aria-valuenow", "220");
        await page.keyboard.press("ArrowLeft");
        await expect(splitter).toHaveAttribute("aria-valuenow", "220");
        expect((await box(sidebar)).width).toBe(220);
        await page.keyboard.press("End");
        await expect(splitter).toHaveAttribute("aria-valuenow", "420");
        await page.keyboard.press("ArrowRight");
        await expect(splitter).toHaveAttribute("aria-valuenow", "420");
        expect((await box(sidebar)).width).toBe(420);

        // Enter hides the sidebar: out of sight and out of the Tab order, a handle left to bring it back
        await page.keyboard.press("Enter");
        await expect(page.locator("#app")).toHaveClass(/\bapp--sidebar-collapsed\b/);
        await expect(splitter).toHaveAttribute("aria-valuenow", "0");
        await expect(splitter).toHaveAttribute("aria-valuetext", "hidden");
        await expect(page.locator("#tab-schema")).toBeHidden();
        expect(await sidebar.evaluate((el) => el.inert)).toBe(true);
        expect((await box(splitter)).width).toBeGreaterThanOrEqual(8);
        await expect(splitter).toBeFocused();
        // and Enter brings it back at the width it had
        await page.keyboard.press("Enter");
        await expect(splitter).toHaveAttribute("aria-valuenow", "420");
        await expect(page.locator("#tab-schema")).toBeVisible();
        expect(await sidebar.evaluate((el) => el.inert)).toBe(false);
        // from hidden, ArrowRight shows it at the narrowest width
        await page.keyboard.press("Enter");
        await page.keyboard.press("ArrowRight");
        await expect(splitter).toHaveAttribute("aria-valuenow", "220");
        await expect(page.locator("#app")).not.toHaveClass(/\bapp--sidebar-collapsed\b/);
    });

    test("the editor's splitter shares the height between the query and its result, never below 120 px of editor or 96 px of result", async ({ page, app }) => {
        await app.open();
        const splitter = page.locator("#editor-splitter");
        const editor = page.locator("#editor-pane");
        const results = page.locator("#results-pane");
        await expect(splitter).toHaveAttribute("role", "separator");
        await expect(splitter).toHaveAttribute("aria-orientation", "horizontal");
        await expect(splitter).toHaveAttribute("aria-controls", "editor-pane");
        await expect(splitter).toHaveAccessibleName("Editor height");
        await expect(splitter).toHaveAttribute("aria-valuemin", "120");
        const start = (await box(editor)).height;
        await expect(splitter).toHaveAttribute("aria-valuenow", String(start));
        // the editor pane (its toolbar and the editor) starts with 40% of the main area's height
        // (the plan's section 4; no exercise prompt here)
        const room = (await box(page.locator("#main"))).height;
        const bar = (await box(page.locator("#editor-toolbar"))).height;
        const splitterHeight = (await box(splitter)).height;
        expect(Math.abs(start + bar - 0.4 * room)).toBeLessThanOrEqual(1);
        // at most what leaves the results pane its summary line and 96 px of result
        const summary = (await box(page.locator("#results-summary"))).height;
        const most = room - bar - splitterHeight - summary - 96;

        await splitter.focus();
        await page.keyboard.press("ArrowDown");
        await page.keyboard.press("ArrowDown");
        await expect(splitter).toHaveAttribute("aria-valuenow", String(start + 32));
        expect((await box(editor)).height).toBe(start + 32);
        await page.keyboard.press("ArrowUp");
        await expect(splitter).toHaveAttribute("aria-valuenow", String(start + 16));
        await page.keyboard.press("Home");
        await expect(splitter).toHaveAttribute("aria-valuenow", "120");
        expect((await box(editor)).height).toBe(120);
        await page.keyboard.press("ArrowUp");
        await expect(splitter).toHaveAttribute("aria-valuenow", "120");
        await page.keyboard.press("End");
        await expect(splitter).toHaveAttribute("aria-valuenow", String(most));
        await expect(splitter).toHaveAttribute("aria-valuemax", String(most));
        expect((await box(results)).height).toBe(summary + 96);
        expect((await box(page.locator("#result"))).height).toBe(96);
        await expect(splitter).toHaveAttribute("aria-valuetext", `${most} pixels high`);
    });

    test("dragging the splitters resizes the panes; dragging the sidebar narrower than 160 px hides it; a double click shows it again", async ({ page, app }) => {
        await app.open();
        const splitter = page.locator("#sidebar-splitter");
        const sidebar = page.locator("#sidebar");
        let handle = await box(splitter);
        let x = handle.x + handle.width / 2;
        const y = handle.y + handle.height / 2;
        await page.mouse.move(x, y);
        await page.mouse.down();
        await page.mouse.move(x + 60, y, { steps: 4 });
        await page.mouse.up();
        expect((await box(sidebar)).width).toBe(340);
        await expect(splitter).toHaveAttribute("aria-valuenow", "340");
        expect((await storedLayout(page)).sidebar).toBe(340);

        handle = await box(splitter);
        x = handle.x + handle.width / 2;
        await page.mouse.move(x, y);
        await page.mouse.down();
        await page.mouse.move(x - 250, y);
        await page.mouse.up();
        await expect(page.locator("#app")).toHaveClass(/\bapp--sidebar-collapsed\b/);
        expect((await storedLayout(page)).collapsed).toBe(true);
        await splitter.dblclick();
        await expect(page.locator("#app")).not.toHaveClass(/\bapp--sidebar-collapsed\b/);
        expect((await box(sidebar)).width).toBe(340);

        const editor = page.locator("#editor-pane");
        const before = (await box(editor)).height;
        const bar = await box(page.locator("#editor-splitter"));
        await page.mouse.move(bar.x + bar.width / 2, bar.y + bar.height / 2);
        await page.mouse.down();
        await page.mouse.move(bar.x + bar.width / 2, bar.y + bar.height / 2 + 50, { steps: 4 });
        await page.mouse.up();
        expect((await box(editor)).height).toBe(before + 50);
    });

    test("the pane sizes and the hidden sidebar survive a reload", async ({ page, app }) => {
        await app.open();
        const splitter = page.locator("#sidebar-splitter");
        const sidebar = page.locator("#sidebar");
        const editor = page.locator("#editor-pane");
        await splitter.focus();
        await page.keyboard.press("ArrowRight");
        await page.keyboard.press("ArrowRight");
        await page.locator("#editor-splitter").focus();
        await page.keyboard.press("ArrowDown");
        await page.keyboard.press("ArrowDown");
        await page.keyboard.press("ArrowDown");
        const height = (await box(editor)).height;
        expect((await box(sidebar)).width).toBe(312);
        const stored = await storedLayout(page);
        expect(stored).toEqual({ v: 1, sidebar: 312, collapsed: false, editor: expect.any(Number) });

        await page.reload();
        await app.waitReady();
        expect((await box(sidebar)).width).toBe(312);
        expect(Math.abs((await box(editor)).height - height)).toBeLessThanOrEqual(1);
        await expect(splitter).toHaveAttribute("aria-valuenow", "312");

        await splitter.focus();
        await page.keyboard.press("Enter");
        expect((await storedLayout(page)).collapsed).toBe(true);
        await page.reload();
        await app.waitReady();
        await expect(page.locator("#app")).toHaveClass(/\bapp--sidebar-collapsed\b/);
        await expect(page.locator("#tab-schema")).toBeHidden();
        expect(await sidebar.evaluate((el) => el.inert)).toBe(true);
        await splitter.focus();
        await page.keyboard.press("Enter");
        expect((await box(sidebar)).width).toBe(312);
    });

    test("a stored layout that makes no sense is ignored", async ({ page, app }) => {
        for (const value of ["not json", "null", '{"v":2,"sidebar":300}', '{"v":1,"sidebar":9999,"collapsed":"yes","editor":7}', '{"v":1,"sidebar":"wide","editor":-1}']) {
            await page.goto("./about.html");
            await page.evaluate(([key, value]) => localStorage.setItem(key, value), [LAYOUT_KEY, value]);
            await app.open();
            expect((await box(page.locator("#sidebar"))).width, value).toBe(280);
            await expect(page.locator("#app"), value).not.toHaveClass(/\bapp--sidebar-collapsed\b/);
            const editor = (await box(page.locator("#editor-pane"))).height;
            const bar = (await box(page.locator("#editor-toolbar"))).height;
            const room = (await box(page.locator("#main"))).height;
            expect(Math.abs(editor + bar - 0.4 * room), value).toBeLessThanOrEqual(1);
        }
    });

    test("with storage blocked the panes still resize, for the page", async ({ page, app, pageErrors }) => {
        await failStorage(page, { methods: ["setItem", "getItem"] });
        await app.open();
        await page.locator("#sidebar-splitter").focus();
        await page.keyboard.press("ArrowRight");
        await expect(page.locator("#sidebar-splitter")).toHaveAttribute("aria-valuenow", "296");
        expect((await box(page.locator("#sidebar"))).width).toBe(296);
        expect(pageErrors).toEqual([]);
    });

    test("under 700 px the panes stack, the splitters are not offered and a hidden sidebar shows", async ({ page, app }) => {
        await page.setViewportSize({ width: 1366, height: 768 });
        await app.open();
        await page.locator("#sidebar-splitter").focus();
        await page.keyboard.press("Enter");
        await expect(page.locator("#app")).toHaveClass(/\bapp--sidebar-collapsed\b/);
        await page.setViewportSize({ width: 390, height: 844 });
        await expect(page.locator("#sidebar-splitter")).toBeHidden();
        await expect(page.locator("#editor-splitter")).toBeHidden();
        await expect(page.locator("#tab-schema")).toBeVisible();
        // (the media query's change event comes after the resize)
        await expect.poll(() => page.locator("#sidebar").evaluate((el) => el.inert)).toBe(false);
        // the sidebar above the query, the query above the result
        const sidebar = await box(page.locator("#sidebar"));
        const editor = await box(page.locator("#editor-pane"));
        const results = await box(page.locator("#results-pane"));
        expect(sidebar.bottom).toBeLessThanOrEqual(editor.y);
        expect(editor.bottom).toBeLessThanOrEqual(results.y);
        const scroll = await pageScroll(page);
        expect(scroll.width).toBeLessThanOrEqual(scroll.innerWidth);
        // back on a wide window the sidebar is hidden again, as it was left
        await page.setViewportSize({ width: 1366, height: 768 });
        await expect(page.locator("#tab-schema")).toBeHidden();
        await expect.poll(() => page.locator("#sidebar").evaluate((el) => el.inert)).toBe(true);
    });
});

test.describe("the sidebar's tabs", () => {
    test("Schema, Exercises and History follow the tabs pattern: arrow keys, Home and End select, one Tab stop", async ({ page, app }) => {
        await app.open();
        const tablist = page.getByRole("tablist", { name: "Sidebar" });
        const tabs = tablist.getByRole("tab");
        await expect(tabs).toHaveText(["Schema", "Exercises", "History"]);
        const state = () =>
            tabs.evaluateAll((all) =>
                all.map((tab) => ({
                    id: tab.id,
                    selected: tab.getAttribute("aria-selected"),
                    tabIndex: tab.tabIndex,
                    panelHidden: document.getElementById(tab.getAttribute("aria-controls")).hidden,
                    labelled: document.getElementById(tab.getAttribute("aria-controls")).getAttribute("aria-labelledby") === tab.id,
                }))
            );
        const only = (id) =>
            ["tab-schema", "tab-exercises", "tab-history"].map((tab) => ({
                id: tab,
                selected: String(tab === id),
                tabIndex: tab === id ? 0 : -1,
                panelHidden: tab !== id,
                labelled: true,
            }));
        expect(await state()).toEqual(only("tab-schema"));
        await expect(page.getByRole("tabpanel")).toHaveCount(1);

        await app.tab("schema").focus();
        await page.keyboard.press("ArrowRight");
        await expect(app.tab("exercises")).toBeFocused();
        expect(await state()).toEqual(only("tab-exercises"));
        await page.keyboard.press("ArrowRight");
        await expect(app.tab("history")).toBeFocused();
        expect(await state()).toEqual(only("tab-history"));
        await page.keyboard.press("ArrowRight");
        await expect(app.tab("schema")).toBeFocused();
        await page.keyboard.press("ArrowLeft");
        await expect(app.tab("history")).toBeFocused();
        await page.keyboard.press("Home");
        await expect(app.tab("schema")).toBeFocused();
        expect(await state()).toEqual(only("tab-schema"));
        await page.keyboard.press("End");
        await expect(app.tab("history")).toBeFocused();
        expect(await state()).toEqual(only("tab-history"));
        // Tab leaves the tab list for the panel's content
        await page.keyboard.press("Tab");
        await expect(app.tab("history")).not.toBeFocused();
        await expect(page.locator("#sidebar [role=tab]:focus")).toHaveCount(0);

        await app.tab("exercises").click();
        expect(await state()).toEqual(only("tab-exercises"));
        await expect(page.locator("#panel-exercises .exercise-empty")).toBeVisible();
    });
});

test.describe("the database switcher", () => {
    test("one button shows the open database; its menu lists each course database with what it is and its size", async ({ page, app }) => {
        await app.open();
        const manifest = realManifest();
        const open = manifest.datasets.find((d) => d.default) ?? manifest.datasets[0];
        await expect(app.databaseLabel).toHaveText(open.name);
        await expect(app.databaseButton).toHaveAccessibleName(`Database: ${open.name}`);
        await expect(app.databaseButton).toHaveAttribute("aria-haspopup", "menu");
        await expect(app.databaseButton).toHaveAttribute("aria-expanded", "false");

        await app.databaseButton.click();
        await expect(app.databaseMenu).toBeVisible();
        await expect(app.databaseButton).toHaveAttribute("aria-expanded", "true");
        await expect(app.databaseMenu).toHaveAttribute("role", "menu");
        await expect(app.databaseMenu).toHaveAccessibleName("Databases");
        const items = app.databaseMenu.getByRole("menuitemradio");
        await expect(items).toHaveCount(manifest.datasets.length);
        for (const dataset of manifest.datasets) {
            const item = items.filter({ hasText: dataset.name });
            await expect(item).toContainText(dataset.description);
            await expect(item).toHaveAttribute("aria-checked", String(dataset.id === open.id));
            // the size, from the file's headers
            await expect(item.locator(".menu-item-size")).toHaveText(/^\d+(\.\d)? (KB|MB)$/);
        }
        // the focus starts on the open database
        await expect(items.filter({ hasText: open.name })).toBeFocused();
        await expect(app.databaseMenu.getByRole("separator")).toHaveCount(1);
        await expect(app.databaseMenu.getByRole("menuitem")).toHaveText([/^Open a file…/, /^Open from URL…/]);
        await expect(page.locator("#open-file")).toHaveAttribute("aria-keyshortcuts", "Control+O Meta+O");
        await expect(page.locator("#open-url")).toHaveAttribute("aria-keyshortcuts", "Control+U Meta+U");

        // arrow keys move, End and Home jump, Escape closes and gives the focus back
        await page.keyboard.press("End");
        await expect(page.locator("#open-url")).toBeFocused();
        await page.keyboard.press("ArrowUp");
        await expect(page.locator("#open-file")).toBeFocused();
        await page.keyboard.press("Home");
        await expect(items.first()).toBeFocused();
        await page.keyboard.press("Escape");
        await expect(app.databaseMenu).toBeHidden();
        await expect(app.databaseButton).toBeFocused();
        await expect(app.databaseButton).toHaveAttribute("aria-expanded", "false");

        // choosing the database that is open changes nothing (it would throw the work away)
        await app.editor.fill("SELECT 'kept' AS mine;");
        await app.databaseButton.click();
        await items.filter({ hasText: open.name }).click();
        await expect(app.databaseMenu).toBeHidden();
        await expect(app.editor).toHaveText("SELECT 'kept' AS mine;");
        await expect(app.databaseLabel).toHaveText(open.name);
    });

    test("Open a file… opens the file chooser; Open from URL… asks for an address", async ({ page, app }) => {
        await app.open();
        await app.databaseButton.click();
        const [chooser] = await Promise.all([page.waitForEvent("filechooser"), page.locator("#open-file").click()]);
        expect(chooser.isMultiple()).toBe(false);
        await expect(app.databaseMenu).toBeHidden();

        // Open from URL… is a dialog with one labelled, empty address field (it was window.prompt)
        await app.databaseButton.click();
        await page.locator("#open-url").click();
        const dialog = page.locator("#open-url-dialog");
        await expect(dialog).toBeVisible();
        await expect(page.locator("#open-url-input")).toHaveAccessibleName("Address");
        await expect(page.locator("#open-url-input")).toHaveValue("");
        // dismissing it (Escape) opens nothing and gives the focus back
        await page.keyboard.press("Escape");
        await expect(dialog).toBeHidden();
        await expect(app.databaseButton).toBeFocused();
        await expect(app.databaseLabel).toHaveText("Northlight Retail");
    });
});

test.describe("the Export menu", () => {
    test("offers the database, the result as CSV and the evidence; Results is unavailable until a query returns rows", async ({ page, app }) => {
        await app.open();
        await app.run("SELECT 1 AS one WHERE 0;");
        await expect(app.status).toContainText("0 rows in");
        await page.locator("#export-button").click();
        const menu = page.locator("#export-menu");
        await expect(menu).toBeVisible();
        await expect(menu).toHaveAttribute("role", "menu");
        await expect(menu.getByRole("menuitem")).toHaveText([/^Database \(\.db\)…/, /^Results \(\.csv\)/, /^Evidence \(\.txt\)…/]);
        await expect(page.locator("#export-csv")).toHaveAttribute("aria-disabled", "true");
        await expect(page.locator("#export-csv")).toContainText("Run a query that returns rows first");
        await expect(page.locator("#export-evidence")).toContainText("A text record of the queries you ran, for your assessment");
        // an unavailable entry can be reached but does nothing: the menu stays open, nothing is saved
        let saved = false;
        page.on("download", () => (saved = true));
        await expect(page.locator("#export-db")).toBeFocused();
        await page.keyboard.press("ArrowDown");
        await expect(page.locator("#export-csv")).toBeFocused();
        await page.keyboard.press("Enter");
        await page.waitForTimeout(300);
        await expect(menu).toBeVisible();
        expect(saved).toBe(false);
        await page.keyboard.press("Escape");
        await expect(menu).toBeHidden();
        await expect(page.locator("#export-button")).toBeFocused();

        await app.run("SELECT 1 AS one UNION ALL SELECT 2;");
        await expect(app.status).toContainText("2 rows in");
        await page.locator("#export-button").click();
        await expect(page.locator("#export-csv")).not.toHaveAttribute("aria-disabled", "true");
        await expect(page.locator("#export-csv")).toContainText("The whole result on screen, for a spreadsheet");
        const [download] = await Promise.all([page.waitForEvent("download"), page.locator("#export-csv").click()]);
        expect(download.suggestedFilename()).toBe("northlight_retail-result.csv");
    });

    test("Database (.db)… opens a dialog with the file name; Cancel and Escape close it and give the focus back", async ({ page, app }) => {
        await app.open();
        await app.openExportMenu();
        await page.locator("#export-db").click();
        const dialog = page.locator("#export-dialog");
        await expect(dialog).toBeVisible();
        await expect(dialog).toHaveAccessibleName("Export the database");
        const name = page.locator("#export-name");
        await expect(name).toBeFocused();
        await expect(name).toHaveValue("northlight_retail.db");
        await expect(name).toHaveAttribute("spellcheck", "false");
        await expect(name).toHaveAccessibleName("File name");
        expect(await name.evaluate((input) => [input.selectionStart, input.selectionEnd])).toEqual([0, "northlight_retail.db".length]);
        await dialog.getByRole("button", { name: "Cancel" }).click();
        await expect(dialog).toBeHidden();
        await expect(page.locator("#export-button")).toBeFocused();

        await app.openExportMenu();
        await page.locator("#export-db").click();
        await expect(dialog).toBeVisible();
        await page.keyboard.press("Escape");
        await expect(dialog).toBeHidden();
        await expect(page.locator("#export-button")).toBeFocused();
        await expect(page).toHaveTitle(/^northlight_retail\.db - /);
    });
});

test.describe("Help", () => {
    test("opens a popover with the shortcuts, the privacy line and About; Escape closes it and gives the focus back", async ({ page, app }) => {
        await app.open();
        const button = page.locator("#help-button");
        const popover = page.locator("#help-popover");
        await expect(button).toHaveAttribute("aria-haspopup", "dialog");
        await expect(button).toHaveAttribute("aria-expanded", "false");
        await expect(popover).toBeHidden();
        await button.click();
        await expect(popover).toBeVisible();
        await expect(button).toHaveAttribute("aria-expanded", "true");
        await expect(popover).toHaveAttribute("role", "dialog");
        await expect(popover).toHaveAccessibleName("Help");
        await expect(popover).toBeFocused();
        await expect(popover).toContainText("Runs entirely in your browser. Your data and queries never leave this device.");
        // (Phase 3 added the editor's Ctrl+/ and Ctrl+Space)
        await expect(popover.locator(".help-keys dt")).toHaveText([/Ctrl\s+Enter/, /Ctrl\s+Shift\s+Enter/, /Ctrl\s+\//, /Ctrl\s+Space/, /Ctrl\s+O/, /Ctrl\s+U/, /Tab/, /Esc\s+then\s+Tab/]);
        await expect(popover.getByRole("link", { name: "About SQL Lab" })).toHaveAttribute("href", "about.html");
        // the SQLite function reference: a link to another site, opened apart, never fetched
        const functions = popover.getByRole("link", { name: "SQLite functions" });
        await expect(functions).toHaveAttribute("href", "https://sqlite.org/lang_corefunc.html");
        await expect(functions).toHaveAttribute("target", "_blank");
        await expect(functions).toHaveAttribute("rel", "noopener noreferrer");
        // the popover is placed under its button, inside the window
        const b = await box(button);
        const p = await box(popover);
        expect(p.y).toBeGreaterThanOrEqual(b.bottom);
        expect(p.x + p.width).toBeLessThanOrEqual(1280);
        await page.keyboard.press("Escape");
        await expect(popover).toBeHidden();
        await expect(button).toHaveAttribute("aria-expanded", "false");
        await expect(button).toBeFocused();
        // a second press on the button closes what the first opened
        await button.click();
        await expect(popover).toBeVisible();
        await button.click();
        await expect(popover).toBeHidden();
    });

    test("on Apple devices the shortcuts read ⌘", async ({ browser, baseURL }) => {
        const context = await browser.newContext({
            baseURL,
            userAgent: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36",
        });
        const page = await context.newPage();
        await page.addInitScript(() => {
            Object.defineProperty(Navigator.prototype, "platform", { get: () => "MacIntel" });
            Object.defineProperty(Navigator.prototype, "userAgentData", { get: () => ({ platform: "macOS", brands: [], mobile: false }) });
        });
        await page.goto("./");
        // the page has loaded (nothing runs on load: the results pane shows "no result yet")
        await expect(page.locator("#results-pane")).toHaveAttribute("data-state", "empty");
        await expect(page.locator("#execute .shortcut")).toHaveText(/^⌘\s+Enter$/);
        await expect(page.locator("#help-popover .help-keys dt").first()).toHaveText(/^⌘\s+Enter$/);
        await context.close();
    });
});

test.describe("the status bar", () => {
    test("shows the open database, the last run and the SQLite version, and credits SQLime", async ({ page, app }) => {
        await app.open();
        const bar = page.locator("footer.statusbar");
        await expect(page.locator("#status-database")).toHaveText("Northlight Retail");
        await expect(page.locator("#status-version")).toHaveText(/^SQLite 3\.\d+\.\d+$/);
        await app.run("SELECT 1 AS a UNION ALL SELECT 2;");
        await expect(page.locator("#status-run")).toHaveText(/^2 rows in \d+ ms$/);
        await app.run("SELECT 1 AS a;");
        await expect(page.locator("#status-run")).toHaveText(/^1 row in \d+ ms$/);
        await app.run("SELECT nope FROM nowhere;");
        await expect(app.errorBand).toContainText("no such table");
        await expect(page.locator("#status-run")).toHaveText("Last run failed");
        // the credit, after the app name as on About and verify, links to About
        const credit = bar.getByRole("link", { name: "SQL Lab Made by Abdou Sadou, based on SQLime by Anton Zhiyanov" });
        await expect(credit).toHaveAttribute("href", "about.html");
        await expect(credit).toHaveText(/^SQL Lab · Made by Abdou Sadou, based on SQLime by Anton Zhiyanov$/);
        // an uploaded database goes by its file name; nothing runs on opening it, so no run is
        // claimed until the student runs one (the first table's sample, 4 rows)
        await app.upload(SAMPLE_FILE);
        await expect(page.locator("#status-database")).toHaveText("sample.db");
        await expect(page.locator("#status-run")).toHaveText("No query run yet");
        await app.run("SELECT * FROM fruit LIMIT 10;");
        await expect(page.locator("#status-run")).toHaveText(/^4 rows in \d+ ms$/);
    });
});

test.describe("the skip link", () => {
    test("is the first Tab stop, shows when focused and takes the focus to the editor", async ({ page, app }) => {
        await app.open();
        const skip = page.locator("a.skip-link");
        // first in the document's Tab order: nothing focusable comes before it
        const first = await page.evaluate(() => {
            const focusable = [...document.querySelectorAll("a[href], button, input, select, textarea, [tabindex], [contenteditable]")].filter(
                (el) => el.tabIndex >= 0 && !el.disabled && el.getClientRects().length > 0
            );
            return focusable[0]?.className;
        });
        expect(first).toBe("skip-link");
        // and Shift+Tab from the brand, the next stop, reaches it
        await page.locator("#reset").focus();
        await page.keyboard.press("Shift+Tab");
        await expect(skip).toBeFocused();
        await expect(skip).toHaveText("Skip to the editor");
        expect((await box(skip)).y).toBeGreaterThanOrEqual(0);
        const url = page.url();
        await page.keyboard.press("Enter");
        await expect(app.editor).toBeFocused();
        expect(page.url()).toBe(url);
        await expect(app.databaseLabel).toHaveText("Northlight Retail");
    });
});

// ---- found in review --------------------------------------------------------------------------

test.describe("landmarks, names and sizes", () => {
    test("one banner, one navigation, one main and one footer, each pane named; the splitters inside them", async ({ page, app }) => {
        await page.setViewportSize({ width: 1366, height: 768 });
        await app.open();
        await expect(page.getByRole("banner")).toHaveCount(1);
        await expect(page.getByRole("navigation")).toHaveCount(1);
        await expect(page.getByRole("navigation", { name: "Schema, exercises and history" })).toBeVisible();
        await expect(page.getByRole("main")).toHaveCount(1);
        await expect(page.getByRole("main", { name: "Query and result" })).toBeVisible();
        await expect(page.getByRole("contentinfo")).toHaveCount(1);
        await expect(page.getByRole("region", { name: "SQL editor" })).toBeVisible();
        await expect(page.getByRole("region", { name: "Result", exact: true })).toBeVisible();
        await expect(page.getByRole("group", { name: "Query" })).toContainText("Run");
        // nothing that takes the focus sits outside a landmark: both splitters included
        const outside = await page.evaluate(() =>
            [...document.querySelectorAll("button, a[href], input, [tabindex]")]
                .filter((el) => el.tabIndex >= 0 && el.getClientRects().length && !el.closest("header, nav, main, footer, dialog, [popover]"))
                .map((el) => el.id || el.className)
        );
        expect(outside).toEqual(["skip-link"]);
        // the headings: the brand is the h1; the sidebar's groups are h2, so no level is skipped
        // (those that are rendered: a hidden tab panel or a closed popover has none)
        const levels = await page.locator("h1, h2, h3, h4").evaluateAll((all) =>
            all.filter((h) => h.getClientRects().length > 0).map((h) => Number(h.tagName[1]))
        );
        expect(levels[0]).toBe(1);
        for (let i = 1; i < levels.length; i++) {
            expect(levels[i] - levels[i - 1], `heading ${i}`).toBeLessThanOrEqual(1);
        }
        // no empty heading (the set's title shows only with a set open)
        await app.openTab("exercises");
        await expect(page.locator("#exercise-set-title")).toBeHidden();
        expect(await page.locator("#exercise-set-title").evaluate((h) => h.hidden)).toBe(true);
    });

    test("the regions have the plan's sizes: top bar 48 px, sidebar 280 px, status bar 28 px", async ({ page, app }) => {
        for (const width of [1366, 1920, 1024, 800]) {
            await page.setViewportSize({ width, height: 768 });
            await app.open();
            expect((await box(page.locator(".topbar"))).height, `top bar at ${width}`).toBe(48);
            expect((await box(page.locator(".statusbar"))).height, `status bar at ${width}`).toBe(28);
            expect((await box(page.locator("#sidebar"))).width, `sidebar at ${width}`).toBe(280);
        }
        // and the top bar keeps one row from 700 px up
        await page.setViewportSize({ width: 700, height: 768 });
        expect((await box(page.locator(".topbar"))).height).toBe(48);
    });

    test("pointer targets are at least 32 px: the top bar, the tabs, the schema rows, Show more, Reset progress", async ({ page, app }) => {
        await page.setViewportSize({ width: 1366, height: 768 });
        await app.openSet("retail-basics");
        await app.openTab("schema");
        await app.schemaExpand("products").click();
        const small = await page.evaluate(() => {
            const targets = [
                ...document.querySelectorAll(
                    ".topbar button, .topbar a, .tab, .schema-expand, .schema-insert, #editor-toolbar button, #download-csv, #exercise-hint-button"
                ),
            ];
            return targets
                .filter((el) => el.getClientRects().length)
                .map((el) => ({ el: el.id || el.className || el.textContent.trim(), ...el.getBoundingClientRect().toJSON() }))
                .filter((r) => r.height < 32 || r.width < 32)
                .map((r) => `${r.el}: ${Math.round(r.width)}x${Math.round(r.height)}`);
        });
        expect(small).toEqual([]);
        // Show more draws a 32 px area around its small text; Reset progress is a full-size button
        const more = page.locator("#schema .schema-more");
        await expect(more).toBeVisible();
        const area = await more.evaluate((el) => {
            const after = getComputedStyle(el, "::after");
            const box = el.getBoundingClientRect();
            return box.height - parseFloat(after.top) - parseFloat(after.bottom);
        });
        expect(area).toBeGreaterThanOrEqual(32);
        await app.openTab("exercises");
        expect((await box(page.locator("#exercise-reset"))).height).toBeGreaterThanOrEqual(32);
    });
});

test.describe("short and narrow windows", () => {
    for (const size of [
        { width: 960, height: 540 },
        { width: 911, height: 512 },
        { width: 1366, height: 480 },
        { width: 700, height: 600 },
    ]) {
        test(`${size.width}x${size.height} in exercise mode: the result keeps at least 96 px and the editor 120`, async ({ page, app }) => {
            await page.setViewportSize(size);
            await app.openSet("retail-basics", { ex: "e05" });
            await app.run("SELECT category, COUNT(*) AS n FROM products GROUP BY category;");
            await expect(app.status).toContainText("rows in");
            expect((await box(page.locator("#results-pane"))).height).toBeGreaterThanOrEqual(96);
            expect((await box(page.locator("#editor-pane"))).height).toBeGreaterThanOrEqual(120);
            const scroll = await pageScroll(page);
            expect(scroll.height).toBeLessThanOrEqual(scroll.innerHeight);
            // the prompt scrolls inside its own box when it does not fit
            const prompt = await app.exercisePanel.evaluate((el) => ({ scroll: el.scrollHeight, client: el.clientHeight, overflow: getComputedStyle(el).overflowY }));
            expect(prompt.overflow).toBe("auto");
        });
    }

    test("a wide result scrolls sideways in its box: the summary stays, the focus ring is inside the pane", async ({ page, app }) => {
        await page.setViewportSize({ width: 1366, height: 768 });
        await app.open();
        const columns = Array.from({ length: 40 }, (_, i) => `'value of column ${i}' AS column_${i}`).join(", ");
        await app.run(`SELECT ${columns};`);
        await expect(app.status).toContainText("1 row in");
        await expect(app.result).toHaveAttribute("tabindex", "0");
        await expect(page.locator("#result-scroll-note")).toBeVisible();
        const summary = await box(page.locator("#results-summary"));
        const note = await box(page.locator("#result-scroll-note"));
        await app.result.focus();
        await page.keyboard.press("End");
        await app.result.evaluate((el) => el.scrollTo(el.scrollWidth, 0));
        expect(await app.result.evaluate((el) => el.scrollLeft)).toBeGreaterThan(0);
        // the page and the pane did not move sideways; the summary and the note stayed put
        expect(await page.evaluate(() => document.documentElement.scrollLeft)).toBe(0);
        expect(await page.locator("#results-pane").evaluate((el) => el.scrollLeft)).toBe(0);
        expect(await box(page.locator("#results-summary"))).toEqual(summary);
        expect(await box(page.locator("#result-scroll-note"))).toEqual(note);
        // the ring is drawn inside the result's box, which lies inside the pane
        const ring = await app.result.evaluate((el) => {
            const style = getComputedStyle(el);
            return { offset: parseFloat(style.outlineOffset), width: parseFloat(style.outlineWidth), style: style.outlineStyle };
        });
        expect(ring.style).not.toBe("none");
        expect(ring.offset + ring.width).toBeLessThanOrEqual(0);
        const pane = await box(page.locator("#results-pane"));
        const result = await box(app.result);
        expect(result.x).toBeGreaterThanOrEqual(pane.x);
        expect(result.x + result.width).toBeLessThanOrEqual(pane.x + pane.width);
        expect(result.bottom).toBeLessThanOrEqual(pane.bottom);
    });

    for (const width of [683, 660, 640, 600, 390]) {
        test(`${width} px wide: a wide result never widens the page`, async ({ page, app }) => {
            await page.setViewportSize({ width, height: 700 });
            await app.open();
            const columns = Array.from({ length: 30 }, (_, i) => `'value of column ${i}' AS column_${i}`).join(", ");
            await app.run(`SELECT ${columns};`);
            await expect(app.status).toContainText("1 row in");
            const scroll = await pageScroll(page);
            expect(scroll.width).toBeLessThanOrEqual(scroll.innerWidth);
            expect(await app.result.evaluate((el) => el.scrollWidth > el.clientWidth)).toBe(true);
        });
    }

    test("a very long database name is cut in the status bar and the top bar, never widening the page", async ({ page, app }) => {
        const name = `${"a_really_long_name_with_underscores_".repeat(3)}end.db`;
        for (const size of [
            { width: 360, height: 740 },
            { width: 390, height: 844 },
            { width: 900, height: 700 },
            { width: 1366, height: 768 },
        ]) {
            await page.setViewportSize(size);
            await app.open();
            await app.upload({ name, mimeType: "application/octet-stream", buffer: require("node:fs").readFileSync(SAMPLE_FILE) });
            await expect(page.locator("#status-database")).toHaveText(name);
            await expect(page.locator("#status-database")).toHaveAttribute("title", name);
            const scroll = await pageScroll(page);
            expect(scroll.width, `${size.width}`).toBeLessThanOrEqual(scroll.innerWidth);
            const item = await box(page.locator("#status-database"));
            expect(item.x + item.width, `${size.width}`).toBeLessThanOrEqual(size.width);
            if (size.width >= 700) {
                // from 700 px up the status bar stays one 28 px row
                expect((await box(page.locator(".statusbar"))).height, `${size.width}`).toBe(28);
            }
        }
    });

    test("every menu and Help open inside the window, down to 320 px", async ({ page, app }) => {
        for (const width of [320, 340, 390]) {
            await page.setViewportSize({ width, height: 640 });
            await app.open();
            for (const [button, menu] of [
                ["#database-button", "#database-menu"],
                ["#export-button", "#export-menu"],
                ["#theme-button", "#theme-menu"],
                ["#help-button", "#help-popover"],
            ]) {
                await page.locator(button).click();
                await expect(page.locator(menu)).toBeVisible();
                const r = await box(page.locator(menu));
                expect(r.x, `${menu} at ${width}`).toBeGreaterThanOrEqual(8);
                expect(r.x + r.width, `${menu} at ${width}`).toBeLessThanOrEqual(width - 8);
                await page.keyboard.press("Escape");
                await expect(page.locator(menu)).toBeHidden();
            }
        }
    });

    test("after a window shrinks in one step the editor keeps its share", async ({ page, app }) => {
        await page.setViewportSize({ width: 2560, height: 1440 });
        await app.open();
        await page.setViewportSize({ width: 1366, height: 480 });
        await expect
            .poll(async () => {
                const editor = (await box(page.locator("#editor-pane"))).height;
                const bar = (await box(page.locator("#editor-toolbar"))).height;
                const room = (await box(page.locator("#main"))).height;
                // 40 percent, or the 120 px floor when that is less
                return Math.abs(editor - Math.max(120, Math.round(0.4 * room - bar))) <= 1;
            })
            .toBe(true);
        expect((await box(page.locator("#results-pane"))).height).toBeGreaterThanOrEqual(96);
    });
});

test.describe("keyboard and pointer details", () => {
    test("Shift+Tab from an open menu goes back to its button; Tab moves on past it", async ({ page, app }) => {
        await app.open();
        for (const [button, menu, next] of [
            ["#database-button", "#database-menu", "#copy-link"],
            ["#export-button", "#export-menu", "#theme-button"],
        ]) {
            await page.locator(button).focus();
            await page.keyboard.press("Enter");
            await expect(page.locator(menu)).toBeVisible();
            await page.keyboard.press("Shift+Tab");
            await expect(page.locator(menu)).toBeHidden();
            await expect(page.locator(button)).toBeFocused();
            await page.keyboard.press("Enter");
            await expect(page.locator(menu)).toBeVisible();
            await page.keyboard.press("Tab");
            await expect(page.locator(menu)).toBeHidden();
            await expect(page.locator(next)).toBeFocused();
        }
    });

    test("Help closes when the focus moves on out of it", async ({ page, app }) => {
        await app.open();
        await page.locator("#help-button").click();
        const popover = page.locator("#help-popover");
        await expect(popover).toBeFocused();
        // through its two links, then out
        await page.keyboard.press("Tab");
        await expect(popover.getByRole("link", { name: "About SQL Lab" })).toBeFocused();
        await page.keyboard.press("Tab");
        await expect(popover.getByRole("link", { name: "SQLite functions" })).toBeFocused();
        await page.keyboard.press("Tab");
        await expect(popover).toBeHidden();
        await expect(page.locator("#help-button")).toHaveAttribute("aria-expanded", "false");
    });

    test("a press on Run's icon or shortcut, or on Copy link's icon, works like a press on the button", async ({ page, app }) => {
        await app.open();
        // a real press at the middle of the part (the page decides what was hit)
        const pressOn = async (selector) => {
            const r = await box(page.locator(selector));
            await page.mouse.click(r.x + r.width / 2, r.y + r.height / 2);
        };
        for (const part of ["#execute .icon", "#execute .shortcut [data-mod]"]) {
            await app.editor.fill(`SELECT '${part}' AS pressed;`);
            await pressOn(part);
            await expect(app.table).toContainText(part);
        }
        // Copy link puts the link on the clipboard (stubbed here) and a toast says so
        await app.stubClipboard();
        await pressOn("#copy-link .icon");
        await expect(app.toast).toContainText("Link copied");
        expect(await page.evaluate(() => window.__copied.length)).toBe(1);
    });

    test("Ctrl+O opens the file chooser, as the menu entry says", async ({ page, app }) => {
        await app.open();
        await app.databaseButton.click();
        await expect(page.locator("#open-file .menu-item-shortcut")).toHaveText(/^(Ctrl|⌘) O$/);
        await expect(page.locator("#open-url .menu-item-shortcut")).toHaveText(/^(Ctrl|⌘) U$/);
        await page.keyboard.press("Escape");
        await app.editor.click();
        // (the key a keyboard sends is "o": Ctrl with the letter, no Shift)
        const [chooser] = await Promise.all([page.waitForEvent("filechooser"), page.keyboard.press("Control+o")]);
        expect(chooser.isMultiple()).toBe(false);
    });

    test("a disabled Run is drawn plainly, not grey on blue", async ({ page }) => {
        // before any database is open (an unsupported address never opens one)
        await page.goto("./#scheme:abc");
        await expect(page.locator("#result .results-band-text")).toContainText("Failed to load database");
        const run = page.locator("#execute");
        await expect(run).toBeDisabled();
        const colours = await run.evaluate((el) => {
            const style = getComputedStyle(el);
            const probe = document.createElement("span");
            probe.style.color = "var(--accent)";
            document.body.append(probe);
            const accent = getComputedStyle(probe).color;
            probe.remove();
            return { background: style.backgroundColor, accent };
        });
        expect(colours.background).not.toBe(colours.accent);
    });
});

test.describe("following the page", () => {
    test("Show more appears for a long description even when the database loaded while another tab was shown", async ({ page, app }) => {
        await page.setViewportSize({ width: 1366, height: 768 });
        await page.goto("./?set=retail-basics");
        await expect(app.exercisePanel).toBeVisible();
        await app.waitReady();
        await expect(app.tab("exercises")).toHaveAttribute("aria-selected", "true");
        await app.openTab("schema");
        await expect(page.locator("#schema .schema-more")).toBeVisible();
        await page.locator("#schema .schema-more").click();
        await expect(page.locator("#schema .schema-more")).toHaveText("Show less");
    });

    test("opening a set while the sidebar is hidden shows the sidebar on the Exercises tab", async ({ page, app }) => {
        await page.setViewportSize({ width: 1366, height: 768 });
        await page.goto("./about.html");
        await page.evaluate((key) => localStorage.setItem(key, JSON.stringify({ v: 1, sidebar: 300, collapsed: true, editor: 0.4 })), LAYOUT_KEY);
        await app.open();
        await expect(page.locator("#app")).toHaveClass(/\bapp--sidebar-collapsed\b/);
        await app.openSet("retail-basics");
        await expect(page.locator("#app")).not.toHaveClass(/\bapp--sidebar-collapsed\b/);
        await expect(page.locator("#exercise-list")).toBeVisible();
        await expect(app.progress).toBeVisible();
        expect((await box(page.locator("#sidebar"))).width).toBe(300);
        expect(await page.locator("#sidebar").evaluate((el) => el.inert)).toBe(false);
    });

    test("the export dialog closes when another database loads, so its name never lands on the new one", async ({ page, app }) => {
        await app.open("./?db=northlight");
        await app.openExportMenu();
        await page.locator("#export-db").click();
        await expect(page.locator("#export-dialog")).toBeVisible();
        await expect(page.locator("#export-name")).toHaveValue("northlight_retail.db");
        // a load lands while the dialog is open (a file the page was already opening, say)
        await page.locator("#open-file-input").setInputFiles(SAMPLE_FILE);
        await expect(page.locator("#export-dialog")).toBeHidden();
        await expect(page).toHaveTitle(/^sample\.db - /);
    });

    test("a new database opens its schema scrolled to the top", async ({ page, app }) => {
        await page.setViewportSize({ width: 1366, height: 600 });
        const tables = (prefix) => Array.from({ length: 40 }, (_, i) => `CREATE TABLE ${prefix}_${i} (id INTEGER);`).join("\n");
        await app.open();
        await app.upload({ name: "first.sql", mimeType: "text/plain", buffer: Buffer.from(tables("first")) });
        const panel = page.locator("#panel-schema");
        await panel.evaluate((el) => el.scrollTo(0, 300));
        expect(await panel.evaluate((el) => el.scrollTop)).toBeGreaterThan(0);
        await app.upload({ name: "second.sql", mimeType: "text/plain", buffer: Buffer.from(tables("second")) });
        await expect(page.locator("#schema .schema-item").first()).toContainText("second_0");
        expect(await panel.evaluate((el) => el.scrollTop)).toBe(0);
    });
});

// ---- found when the fixes were checked ------------------------------------------------------

test.describe("checked again", () => {
    test("after a Check at 1366x768 the prompt stays whole, and the verdict and the first rows are in sight", async ({ page, app }) => {
        await page.setViewportSize({ width: 1366, height: 768 });
        await app.openSet("retail-basics", { ex: "e05" });
        await app.editor.fill(modelQuery("e05"));
        await app.checkButton.click();
        await expect(app.feedback).toContainText("Passed");
        // the prompt, its hint button included, needs no scrolling (the verdict did not cut it)
        await expect.poll(() => app.exercisePanel.evaluate((el) => el.scrollHeight - el.clientHeight)).toBeLessThanOrEqual(1);
        // the verdict and the result's first row are inside the pane without scrolling it
        const pane = await box(page.locator("#results-pane"));
        const verdict = await box(app.feedback);
        const firstRow = await box(app.table.locator("tbody tr").first());
        expect(verdict.bottom).toBeLessThanOrEqual(pane.bottom);
        expect(firstRow.bottom).toBeLessThanOrEqual(pane.bottom);
        expect(await page.locator("#results-pane").evaluate((el) => el.scrollTop)).toBe(0);
        expect((await box(page.locator("#editor-pane"))).height).toBeGreaterThanOrEqual(120);
    });

    // On a window as short as 540 px the prompt (at its least), the toolbar, the editor (at its
    // least) and the verdict leave no room for rows: the verdict comes first, the rows a scroll away.
    test("on a short window a verdict takes what it needs: its head in sight, the rows a scroll away", async ({ page, app }) => {
        await page.setViewportSize({ width: 960, height: 540 });
        await app.openSet("retail-basics", { ex: "e05" });
        await app.editor.fill(modelQuery("e05").replace("ORDER BY revenue DESC", "ORDER BY revenue"));
        await app.checkButton.click();
        await expect(app.feedback).toContainText("Not passed yet");
        await expect(app.feedback.getByText("Not passed yet")).toBeInViewport();
        // the result under it is reached by scrolling the pane
        await page.locator("#results-pane").evaluate((el) => el.scrollTo(0, el.scrollHeight));
        await expect(app.table).toBeInViewport();
    });

    test("the scroll-sideways note sits under the result's box, never over it", async ({ page, app }) => {
        await page.setViewportSize({ width: 1366, height: 768 });
        await app.open();
        const columns = Array.from({ length: 30 }, (_, i) => `'value of column ${i}' AS column_${i}`).join(", ");
        await app.run(`WITH RECURSIVE n(i) AS (SELECT 1 UNION ALL SELECT i + 1 FROM n WHERE i < 60) SELECT ${columns} FROM n;`);
        await expect(app.status).toContainText("60 rows in");
        await expect(page.locator("#result-scroll-note")).toBeVisible();
        const result = await box(app.result);
        const note = await box(page.locator("#result-scroll-note"));
        expect(note.y).toBeGreaterThanOrEqual(result.bottom);
    });

    test("a long name in a message wraps under 700 px rather than widening the page", async ({ page, app }) => {
        await page.setViewportSize({ width: 390, height: 844 });
        await app.open();
        await app.rename(`${"renamed_".repeat(12)}name.db`);
        await expect(app.toast).toContainText("Exported renamed_");
        const scroll = await pageScroll(page);
        expect(scroll.width).toBeLessThanOrEqual(scroll.innerWidth);
    });

    test("the top bar keeps one row from 700 px up with a long file name: the name gives way", async ({ page, app }) => {
        const name = "student_records_for_the_spring_term_2026.db";
        for (const width of [700, 760, 900, 1366]) {
            await page.setViewportSize({ width, height: 700 });
            await app.open();
            await app.upload({ name, mimeType: "application/octet-stream", buffer: require("node:fs").readFileSync(SAMPLE_FILE) });
            await expect(app.databaseLabel).toHaveText(name);
            expect((await box(page.locator(".topbar"))).height, `${width}`).toBe(48);
            const help = await box(page.locator("#help-button"));
            expect(help.x + help.width, `${width}`).toBeLessThanOrEqual(width);
        }
    });

    test("Ctrl+O closes an open menu as it opens the file chooser", async ({ page, app }) => {
        await app.open();
        await app.databaseButton.click();
        await expect(app.databaseMenu).toBeVisible();
        const [chooser] = await Promise.all([page.waitForEvent("filechooser"), page.keyboard.press("Control+o")]);
        expect(chooser.isMultiple()).toBe(false);
        await expect(app.databaseMenu).toBeHidden();
    });

    test("the brand link is named in one piece", async ({ page, app }) => {
        await app.open();
        await expect(page.locator("#reset")).toHaveAccessibleName("SQL Lab, home: open the default database");
        await expect(page.locator("#reset")).toHaveText("SQL Lab");
    });

    test("the credit's 32 px area stays inside the window, and the shell does not scroll", async ({ page, app }) => {
        await page.setViewportSize({ width: 1366, height: 768 });
        await app.open();
        const credit = page.locator(".statusbar-credit");
        const r = await box(credit);
        // the points a press can land on: down the middle of the link, from above it to the bottom
        const hits = await page.evaluate(({ x, from, to }) => {
            let n = 0;
            for (let y = from; y < to; y++) {
                if (document.elementFromPoint(x, y)?.closest(".statusbar-credit")) n++;
            }
            return n;
        }, { x: r.x + r.width / 2, from: r.y - 20, to: 768 });
        expect(hits).toBeGreaterThanOrEqual(32);
        expect(await page.locator("#app").evaluate((el) => el.scrollHeight - el.clientHeight)).toBe(0);
    });

    test("the splitters have room to press: 13 px beside the sidebar's rule, 16 px over the editor's bar", async ({ page, app }) => {
        await page.setViewportSize({ width: 1366, height: 768 });
        await app.open();
        const width = await page.evaluate(() => {
            const s = document.querySelector("#sidebar-splitter").getBoundingClientRect();
            const y = s.top + s.height / 4;
            let n = 0;
            for (let x = s.left - 10; x < s.right + 20; x++) {
                if (document.elementFromPoint(x, y)?.closest("#sidebar-splitter")) n++;
            }
            return n;
        });
        expect(width).toBeGreaterThanOrEqual(13);
        const height = await page.evaluate(() => {
            const s = document.querySelector("#editor-splitter").getBoundingClientRect();
            const x = s.left + s.width / 4;
            let n = 0;
            for (let y = s.top - 10; y < s.bottom + 10; y++) {
                if (document.elementFromPoint(x, y)?.closest("#editor-splitter")) n++;
            }
            return n;
        });
        expect(height).toBeGreaterThanOrEqual(16);
    });

    test("a database loaded while the Schema tab is hidden opens its schema at the top", async ({ page, app }) => {
        await page.setViewportSize({ width: 1366, height: 600 });
        const tables = (prefix) => Array.from({ length: 40 }, (_, i) => `CREATE TABLE ${prefix}_${i} (id INTEGER);`).join("\n");
        await app.open();
        await app.upload({ name: "first.sql", mimeType: "text/plain", buffer: Buffer.from(tables("first")) });
        const panel = page.locator("#panel-schema");
        await panel.evaluate((el) => el.scrollTo(0, 300));
        await app.openTab("history");
        await app.upload({ name: "second.sql", mimeType: "text/plain", buffer: Buffer.from(tables("second")) });
        await app.openTab("schema");
        await expect(page.locator("#schema .schema-item").first()).toContainText("second_0");
        await expect.poll(() => panel.evaluate((el) => el.scrollTop)).toBe(0);
    });

    test("opening a set on a narrow window keeps a sidebar hidden on a wide one hidden", async ({ page, app }) => {
        await page.setViewportSize({ width: 600, height: 800 });
        await page.goto("./about.html");
        await page.evaluate((key) => localStorage.setItem(key, JSON.stringify({ v: 1, sidebar: 300, collapsed: true, editor: 0.4 })), LAYOUT_KEY);
        await app.openSet("retail-basics");
        expect((await storedLayout(page)).collapsed).toBe(true);
    });
});
