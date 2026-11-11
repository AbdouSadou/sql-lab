// M3 part 1: F1 the database switcher (the top bar's button #database-button and its menu
// #database-menu), the default dataset, ?db=, share links with datasets, the manifest, failures,
// stale loads, the top bar on phones and desktops, the keyboard. Export has its own file.
const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const {
    test,
    expect,
    openFresh,
    realManifest,
    routeManifest,
    withSampleDataset,
    SAMPLE_FILE,
    SAMPLE_ENTRY,
    PAYLOAD,
} = require("./helpers");

const ROOT = path.resolve(__dirname, "..");
const NORTHLIGHT_FILE = path.join(ROOT, "datasets", "northlight_retail.db");
const SAMPLE_URL = /\/datasets\/sample\.db(\?.*)?$/;
const SAMPLE2_URL = /\/datasets\/sample2\.db(\?.*)?$/;

// The exact query of spec section 7, item 2.
const SPEC_QUERY = `WITH category_revenue AS (
  SELECT p.category, SUM(oi.quantity * p.unit_price * (1 - oi.discount)) AS revenue
  FROM orders o
  JOIN order_items oi ON o.order_id = oi.order_id
  JOIN products p ON oi.product_id = p.product_id
  GROUP BY p.category
)
SELECT category, ROUND(100.0 * revenue / SUM(revenue) OVER (), 1) FROM category_revenue;`;

const sha256 = (buffer) => crypto.createHash("sha256").update(buffer).digest("hex");

// gate returns a promise and the function that opens it, to hold a response back.
function gate() {
    let open;
    const promise = new Promise((resolve) => (open = resolve));
    return { promise, open };
}

async function editorText(app) {
    return app.editor.evaluate((el) => el.innerText);
}

// ---- the database switcher ------------------------------------------------------------
// The switcher's helpers are in tests/helpers.js: app.databaseItems, app.databaseItem(id),
// app.pickDatabaseById(id) (a click on the button, then on the entry, as a student does) and
// app.expectPicked(id, name) (exactly that entry ticked, and the button showing the name; null:
// nothing ticked, as for a file, a URL or the empty database).

// shareHash makes a "#s=..." fragment the way copy link does, with the vendored lz-string.
const LZString = require("../vendor/lz-string.min.js");
async function shareHash(page, state) {
    return "#s=" + LZString.compressToEncodedURIComponent(JSON.stringify({ v: 1, ...state }));
}

// ---- the default dataset (AC1, AC2) and the manifest ---------------------------------

test("the manifest is the one in spec section 5", async () => {
    const manifest = JSON.parse(fs.readFileSync(path.join(ROOT, "datasets", "manifest.json"), "utf8"));
    expect(manifest).toEqual({
        datasets: [
            {
                id: "northlight",
                name: "Northlight Retail",
                file: "datasets/northlight_retail.db",
                description:
                    "Fictional Yorkshire retail chain: 5 stores, 20 products, 60 customers, 450 orders, Jan 2025 – Oct 2026. Ships a v_sales reporting view.",
                default: true,
            },
        ],
    });
});

test("AC1 the first visit has the default dataset loaded and SELECT COUNT(*) FROM orders returns 450", async ({
    page,
    app,
    net,
}) => {
    await app.open();
    expect(await app.query("SELECT COUNT(*) FROM orders;")).toEqual({
        columns: ["COUNT(*)"],
        rows: [["450"]],
    });
    await expect(app.databaseLabel).toHaveText("Northlight Retail");
    await expect(page).toHaveTitle("northlight_retail.db - SQL Lab");
    await app.expectPicked("northlight");
    expect(await app.pickedText()).toBe("Northlight Retail");
    // fetched same-origin by relative URLs, once each
    expect(net.paths.filter((p) => p === "datasets/manifest.json")).toHaveLength(1);
    expect(net.paths.filter((p) => p === "datasets/northlight_retail.db")).toHaveLength(1);
    net.expectNoSameOriginFailures();
});

test("AC1 the first visit is the same with no storage at all", async ({ browser, baseURL }) => {
    const context = await browser.newContext({ baseURL });
    try {
        const page = await context.newPage();
        await page.goto("./");
        await expect(page.locator("#status")).toContainText(/\d+ rows?, took/);
        await page.locator("#editor").fill("SELECT COUNT(*) AS n FROM orders;");
        await page.locator("#editor").press("Control+Enter");
        await expect(page.locator("#result td")).toHaveText("450");
    } finally {
        await context.close();
    }
});

test("AC2 the CTE and window-function query from the spec returns 5 rows", async ({ app }) => {
    await app.open();
    const result = await app.query(SPEC_QUERY);
    expect(result.rows).toHaveLength(5);
    expect(result.columns[0]).toBe("category");
    const total = result.rows.reduce((sum, [, pct]) => sum + Number(pct), 0);
    expect(total).toBeGreaterThan(99.7);
    expect(total).toBeLessThan(100.3);
});

test("the v_sales revenue total is 68323.31 and the tables are all there", async ({ app }) => {
    await app.open();
    expect((await app.query("SELECT ROUND(SUM(line_revenue), 2) AS total FROM v_sales;")).rows).toEqual([
        ["68323.31"],
    ]);
    const counts = await app.query(
        `SELECT 'stores', COUNT(*) FROM stores UNION ALL SELECT 'products', COUNT(*) FROM products
         UNION ALL SELECT 'customers', COUNT(*) FROM customers UNION ALL SELECT 'orders', COUNT(*) FROM orders
         UNION ALL SELECT 'order_items', COUNT(*) FROM order_items;`
    );
    expect(counts.rows).toEqual([
        ["stores", "5"],
        ["products", "20"],
        ["customers", "60"],
        ["orders", "450"],
        ["order_items", "906"],
    ]);
});

test("after load the editor holds the table preview with the caret at the end of its text", async ({
    page,
    app,
}) => {
    await app.open();
    await expect(app.editor).toBeFocused();
    expect((await editorText(app)).trim()).toBe('select * from "stores" limit 10');
    await page.keyboard.type(" -- end");
    expect((await editorText(app)).trim()).toBe('select * from "stores" limit 10 -- end');
});

test("after load with restored SQL the caret is at the end of that SQL too", async ({ page, app }) => {
    await app.open();
    await app.query("SELECT 1 AS one;");
    await page.reload();
    await app.waitReady();
    await expect(app.editor).toBeFocused();
    await page.keyboard.type(" -- end");
    expect((await editorText(app)).trim()).toBe("SELECT 1 AS one; -- end");
});

// ---- the database switcher ---------------------------------------------------------

test("the switcher is a labelled menu button that lists the manifest datasets by name", async ({ page, app }) => {
    await withSampleDataset(page);
    await app.open();
    const button = page.getByRole("button", { name: "Database: Northlight Retail" });
    await expect(button).toHaveAttribute("id", "database-button");
    expect(await button.evaluate((el) => el.tagName)).toBe("BUTTON");
    await expect(button).toHaveAttribute("aria-haspopup", "menu");
    await expect(button).toHaveAttribute("aria-expanded", "false");
    await expect(button).toBeEnabled();
    await expect(app.databaseLabel).toHaveText("Northlight Retail");

    await button.click();
    await expect(app.databaseMenu).toBeVisible();
    await expect(button).toHaveAttribute("aria-expanded", "true");
    await expect(app.databaseMenu).toHaveAttribute("role", "menu");
    await expect(app.databaseMenu.locator('[role="menuitemradio"] .menu-item-label')).toHaveText([
        "Northlight Retail",
        "Sample Fruit",
    ]);
    await app.expectPicked("northlight");
    await expect(app.databaseItem("sample")).toHaveAttribute("aria-checked", "false");
});

test("the switcher shows each dataset's description in its menu entry, as text", async ({ page, app }) => {
    await app.open();
    await app.databaseButton.click();
    await expect(app.databaseMenu).toBeVisible();
    await expect(app.databaseItem("northlight").locator(".menu-item-description")).toHaveText(
        realManifest().datasets[0].description
    );
});

test("a first start that fails (unsupported address) leaves the switcher usable", async ({ page, app }) => {
    await page.goto("./#gist:abc");
    await expect(app.status).toContainText("Failed to load database from unsupported address gist:abc");
    await expect(app.picker).toBeEnabled();
    expect(await app.pickedText()).toBe("No database open");
    await app.pickDatabaseById("northlight");
    await expect(app.databaseLabel).toHaveText("Northlight Retail");
    expect(await app.pickedText()).toBe("Northlight Retail");
    expect((await app.query("SELECT COUNT(*) AS n FROM orders;")).rows).toEqual([["450"]]);
});

test("F1 picking a dataset opens it, shows it, and puts ?db=<id> in the address", async ({ page, app, net }) => {
    await withSampleDataset(page);
    await app.open();
    const before = page.url();

    await app.pickDatabaseById("sample");
    await expect(app.status).toContainText("4 rows, took");
    await expect(app.databaseLabel).toHaveText("Sample Fruit");
    await expect(page).toHaveTitle("sample.db - SQL Lab");
    expect(await app.pickedText()).toBe("Sample Fruit");
    expect((await app.query("SELECT COUNT(*) AS n FROM fruit;")).rows).toEqual([["4"]]);
    // the address: same page, a query string, no fragment
    const url = new URL(page.url());
    expect(url.search).toBe("?db=sample");
    expect(url.hash).toBe("");
    expect(url.pathname).toBe(new URL(before).pathname);
    // a relative request for the file
    expect(net.paths).toContain("datasets/sample.db");

    // and back to the first one through the switcher
    await app.pickDatabaseById("northlight");
    await expect(app.databaseLabel).toHaveText("Northlight Retail");
    expect(new URL(page.url()).search).toBe("?db=northlight");
    expect((await app.query("SELECT COUNT(*) AS n FROM orders;")).rows).toEqual([["450"]]);
});

test("a dataset that was just picked has its own saved SQL, and the other one keeps its own", async ({
    page,
    app,
}) => {
    await withSampleDataset(page);
    await app.open();
    await app.query("SELECT 'in northlight' AS where_;");
    await app.pickDatabaseById("sample");
    await expect(app.status).toContainText("4 rows, took");
    await app.query("SELECT 'in sample' AS where_;");
    await app.pickDatabaseById("northlight");
    await expect(app.status).toContainText("Your last query is back");
    expect((await editorText(app)).trim()).toBe("SELECT 'in northlight' AS where_;");
    // SQL is restored, not run
    await expect(app.table).toHaveCount(0);
});

test("reload keeps the picked dataset", async ({ page, app }) => {
    await withSampleDataset(page);
    await app.open();
    await app.pickDatabaseById("sample");
    await expect(app.databaseLabel).toHaveText("Sample Fruit");

    await page.reload();
    await app.waitReady();
    await expect(app.databaseLabel).toHaveText("Sample Fruit");
    await app.expectPicked("sample");
    expect(new URL(page.url()).search).toBe("?db=sample");
});

test("back and forward step between datasets", async ({ page, app }) => {
    await withSampleDataset(page);
    await app.open();
    await app.pickDatabaseById("sample");
    await expect(app.databaseLabel).toHaveText("Sample Fruit");
    await app.pickDatabaseById("northlight");
    await expect(app.databaseLabel).toHaveText("Northlight Retail");

    await page.goBack(); // ?db=sample
    await expect(app.databaseLabel).toHaveText("Sample Fruit");
    await app.expectPicked("sample");
    await page.goBack(); // the first visit: no query string, the default dataset
    await expect(app.databaseLabel).toHaveText("Northlight Retail");
    await app.expectPicked("northlight");
    await page.goForward();
    await expect(app.databaseLabel).toHaveText("Sample Fruit");
    await app.expectPicked("sample");
    // the database really is the sample, not just its name
    expect((await app.query("SELECT COUNT(*) AS n FROM fruit;")).rows).toEqual([["4"]]);
});

test("the brand goes to the default dataset and says so", async ({ page, app }) => {
    await withSampleDataset(page);
    await app.open("./?db=sample");
    await expect(app.databaseLabel).toHaveText("Sample Fruit");
    const logo = page.locator("#reset");
    await expect(logo).toHaveAttribute("href", "./");
    // the brand says where it goes: its (visually hidden) text names the default database
    await expect(logo).toHaveAccessibleName(/open the default database/i);
    await logo.click();
    await app.waitReady();
    await expect(app.databaseLabel).toHaveText("Northlight Retail");
});

test("the demo and 'start from scratch' text and files are gone", async ({ page, app, request, baseURL }) => {
    await app.open();
    const text = (await page.locator("body").innerText()).toLowerCase();
    expect(text).not.toContain("demo");
    expect(text).not.toContain("scratch");
    expect(await page.evaluate(() => "loadDemo" in window.app.actions)).toBe(false);
    for (const gone of ["demo.db", "employees.db", "sales.db"]) {
        expect(fs.existsSync(path.join(ROOT, gone)), gone).toBe(false);
        expect((await request.get(new URL(gone, baseURL).href)).status(), gone).toBe(404);
    }
    // nothing shipped mentions them either
    const offenders = [];
    for (const dir of ["js", "css", "."]) {
        for (const entry of fs.readdirSync(path.join(ROOT, dir), { withFileTypes: true })) {
            if (!entry.isFile() || !/\.(html|css|js)$/.test(entry.name)) continue;
            const file = path.join(dir, entry.name);
            const content = fs.readFileSync(path.join(ROOT, file), "utf8");
            if (/loadDemo|DEMO_URL|demo\.db|employees\.db|sales\.db|start from scratch/i.test(content)) {
                offenders.push(file);
            }
        }
    }
    expect(offenders).toEqual([]);
});

// ---- ?db= -------------------------------------------------------------------------

test("?db=<known id> opens that dataset", async ({ page, app }) => {
    await withSampleDataset(page);
    await app.open("./?db=sample");
    await expect(app.databaseLabel).toHaveText("Sample Fruit");
    await app.expectPicked("sample");
    // no notice: the status is the table preview's
    await expect(app.status).not.toContainText("dataset");
});

test("?db=<unknown id> shows a notice and opens the default dataset", async ({ page, app }) => {
    await app.page.goto("./?db=nope");
    await expect(app.status).toContainText('There is no dataset "nope" on this site, so the default dataset is open.');
    await expect(app.databaseLabel).toHaveText("Northlight Retail");
    await app.expectPicked("northlight");
    // the preview ran and the app works
    await expect(app.table).toHaveCount(1);
    expect((await app.query("SELECT COUNT(*) AS n FROM orders;")).rows).toEqual([["450"]]);
});

test("?db= with an unusable value (markup, empty, repeated) is handled without echoing markup", async ({
    page,
    app,
}) => {
    await page.goto(`./?db=${encodeURIComponent(PAYLOAD)}`);
    await expect(app.status).toContainText("The dataset in the address is not available");
    await expect(app.status).not.toContainText("<img");
    await app.expectInert();
    await expect(app.databaseLabel).toHaveText("Northlight Retail");

    await page.goto("./?db=");
    await app.waitReady();
    await expect(app.status).not.toContainText("dataset");
    await expect(app.databaseLabel).toHaveText("Northlight Retail");
    await app.page.goto("./?db=sample&db=northlight&other=1");
    await expect(app.status).toContainText('There is no dataset "sample"'); // the first one counts
});

test("a share link beats a plain fragment path, which beats ?db=", async ({ page, app }) => {
    await withSampleDataset(page);
    const share = await shareHash(page, { d: "northlight", q: "SELECT 'by link' AS who;" });
    await page.goto(`./?db=sample${share}`);
    await expect(app.status).toContainText("A shared query is in the editor");
    await expect(app.databaseLabel).toHaveText("Northlight Retail");

    await page.goto("./?db=sample#datasets/sample.db");
    await expect(app.databaseLabel).toHaveText("sample.db"); // opened as a file, not as the dataset
    await app.expectPicked(null); // not ticked in the menu either
});

// ---- share links with datasets (AC4) -----------------------------------------------

test("AC4 a link restores SQL and dataset in a fresh browser context", async ({ page, app, browser, baseURL }) => {
    await withSampleDataset(page);
    await app.open("./?db=sample");
    await expect(app.databaseLabel).toHaveText("Sample Fruit");
    await app.editor.fill("SELECT name, price FROM fruit WHERE price > 1 ORDER BY price;");
    const link = await app.copyLink();
    expect(new URL(link).search).toBe("");

    const fresh = await openFresh(browser, baseURL, link, { setup: withSampleDataset });
    try {
        await expect(fresh.app.status).toContainText("A shared query is in the editor");
        await expect(fresh.app.databaseLabel).toHaveText("Sample Fruit");
        await fresh.app.expectPicked("sample");
        expect((await editorText(fresh.app)).trim()).toBe("SELECT name, price FROM fruit WHERE price > 1 ORDER BY price;");
        await fresh.page.locator("#execute").click();
        expect(await fresh.app.read()).toEqual({
            columns: ["name", "price"],
            rows: [
                ["dragonfruit", "3.2"],
                ["cherry", "4.75"],
            ],
        });
        expect(fresh.errors).toEqual([]);
    } finally {
        await fresh.context.close();
    }
});

test("AC4 a link made on the default dataset opens it with the SQL, with no notice", async ({
    app,
    browser,
    baseURL,
}) => {
    await app.open();
    await app.editor.fill("SELECT COUNT(*) AS n FROM orders;");
    const link = await app.copyLink();
    const fresh = await openFresh(browser, baseURL, link);
    try {
        await expect(fresh.app.status).toContainText("A shared query is in the editor");
        await expect(fresh.app.status).not.toContainText("dataset");
        await fresh.app.expectPicked("northlight");
        await fresh.page.locator("#execute").click();
        expect((await fresh.app.read()).rows).toEqual([["450"]]);
    } finally {
        await fresh.context.close();
    }
});

test("a link naming an unknown dataset opens the default dataset, restores the SQL and shows a notice", async ({
    page,
    app,
}) => {
    const hash = await shareHash(page, { d: "gone", q: "SELECT 'still here' AS s;" });
    await page.goto(`./${hash}`);
    await expect(app.status).toContainText('There is no dataset "gone" on this site, so the default dataset is open.');
    await expect(app.status).toContainText("A shared query is in the editor");
    expect((await editorText(app)).trim()).toBe("SELECT 'still here' AS s;");
    await app.expectPicked("northlight");
    await page.locator("#execute").click();
    expect(await app.read()).toEqual({ columns: ["s"], rows: [["still here"]] });
});

test("a link that names no dataset opens the default dataset, restores the SQL and shows a notice", async ({
    page,
    app,
}) => {
    const hash = await shareHash(page, { q: "SELECT 'no dataset' AS s;" });
    await page.goto(`./${hash}`);
    await expect(app.status).toContainText("This link does not name a dataset, so the default dataset is open.");
    await expect(app.status).toContainText("A shared query is in the editor");
    expect((await editorText(app)).trim()).toBe("SELECT 'no dataset' AS s;");
    await expect(app.databaseLabel).toHaveText("Northlight Retail");
});

test("pasting a link for another dataset into an open tab switches to it", async ({ page, app }) => {
    await withSampleDataset(page);
    await app.open();
    const hash = await shareHash(page, { d: "sample", q: "SELECT 7 AS seven;" });
    await page.evaluate((h) => (location.hash = h), hash);
    await expect(app.databaseLabel).toHaveText("Sample Fruit");
    await expect(app.status).toContainText("A shared query is in the editor");
    await app.expectPicked("sample");
});

test("copy link carries the dataset id of whatever was picked, and says so for files that are not built in", async ({
    page,
    app,
}) => {
    await withSampleDataset(page);
    const idOf = (link) =>
        page.evaluate(
            (hash) => JSON.parse(LZString.decompressFromEncodedURIComponent(hash.slice("#s=".length))).d,
            new URL(link).hash
        );
    await app.open();
    await app.editor.fill("SELECT 1;");
    expect(await idOf(await app.copyLink())).toBe("northlight");
    await expect(app.status).not.toContainText("not built in");

    await app.pickDatabaseById("sample");
    await expect(app.status).toContainText("4 rows, took");
    await app.editor.fill("SELECT 1;");
    expect(await idOf(await app.copyLink())).toBe("sample");

    // an upload clears it, and the status says the link will not include the database
    await app.upload(SAMPLE_FILE);
    await app.editor.fill("SELECT 1;");
    const uploaded = await app.copyLink();
    expect(await idOf(uploaded)).toBeUndefined();
    await expect(app.status).toContainText("the link will not include it");
    await expect(app.status).toContainText("not built in");

    // so does open-from-URL
    await app.pickDatabaseById("sample");
    await expect(app.status).toContainText("4 rows, took");
    page.once("dialog", (dialog) => dialog.accept("datasets/northlight_retail.db"));
    await page.keyboard.press("Control+u");
    await expect(app.databaseLabel).toHaveText("northlight_retail.db");
    await app.editor.fill("SELECT 1;");
    expect(await idOf(await app.copyLink())).toBeUndefined();
    await expect(app.status).toContainText("the link will not include it");
});

// ---- upload and open-from-URL ------------------------------------------------------

test("after an upload the switcher names the file and ticks no course database; picking a dataset leaves it", async ({
    page,
    app,
}) => {
    await withSampleDataset(page);
    await app.open();
    await app.upload(SAMPLE_FILE);
    expect(await app.pickedText()).toBe("sample.db");
    await app.expectPicked(null);
    // the file is not an entry of the menu: the course databases are all it lists
    await expect(app.databaseMenu.locator('[role="menuitemradio"] .menu-item-label')).toHaveText([
        "Northlight Retail",
        "Sample Fruit",
    ]);
    // the address has no ?db= for a file that is not a dataset
    expect(new URL(page.url()).search).toBe("");

    // renaming the database renames what the button shows
    await app.rename("mine.db");
    expect(await app.pickedText()).toBe("mine.db");
    await app.expectPicked(null);

    await app.pickDatabaseById("northlight");
    await expect(app.databaseLabel).toHaveText("Northlight Retail");
    await expect(app.databaseMenu.locator('[role="menuitemradio"] .menu-item-label')).toHaveText([
        "Northlight Retail",
        "Sample Fruit",
    ]);
    await app.expectPicked("northlight");
    expect(await app.pickedText()).toBe("Northlight Retail");
});

test("after open-from-URL the switcher names the file; the dataset has to be picked again", async ({ page, app }) => {
    await app.open();
    page.once("dialog", (dialog) => dialog.accept("tests/fixtures/sample.db"));
    // tests/ is not served (it is not part of the site), so this load fails and the dataset stays
    await page.keyboard.press("Control+u");
    await expect(app.status).toContainText("Failed to load database");
    await app.expectPicked("northlight");
    expect((await app.query("SELECT COUNT(*) AS n FROM orders;")).rows).toEqual([["450"]]);

    page.once("dialog", (dialog) => dialog.accept("datasets/northlight_retail.db"));
    await page.keyboard.press("Control+u");
    await expect(app.databaseLabel).toHaveText("northlight_retail.db");
    await app.expectPicked(null);
    expect(await app.pickedText()).toBe("northlight_retail.db");

    await app.pickDatabaseById("northlight");
    await app.expectPicked("northlight");
    expect(await app.pickedText()).toBe("Northlight Retail");
});

// ---- the manifest: validation and failures -------------------------------------------

const ok = (extra = {}) => ({ id: "a", name: "A", file: "datasets/northlight_retail.db", default: true, ...extra });
const BAD_MANIFESTS = [
    ["not JSON", "{oops", /not valid JSON/],
    ["a list at the top", [], /top level must be an object/],
    ["no datasets key", {}, /"datasets" must be a list/],
    ["datasets that is not a list", { datasets: {} }, /"datasets" must be a list/],
    ["an empty list", { datasets: [] }, /"datasets" is empty/],
    ["an entry that is not an object", { datasets: [5] }, /dataset 1 must be an object/],
    ["no id", { datasets: [ok({ id: undefined })] }, /dataset 1 needs an "id"/],
    ["an id with a space", { datasets: [ok({ id: "a b" })] }, /dataset 1 needs an "id"/],
    ["an id that is too long", { datasets: [ok({ id: "a".repeat(65) })] }, /dataset 1 needs an "id"/],
    ["an id that is a number", { datasets: [ok({ id: 5 })] }, /dataset 1 needs an "id"/],
    ["a duplicate id", { datasets: [ok(), ok({ default: false })] }, /id "a" is used by more than one/],
    ["no name", { datasets: [ok({ name: undefined })] }, /dataset "a" needs a "name"/],
    ["a blank name", { datasets: [ok({ name: "  " })] }, /dataset "a" needs a "name"/],
    ["no file", { datasets: [ok({ file: undefined })] }, /dataset "a" needs a "file"/],
    ["a file with a leading slash", { datasets: [ok({ file: "/datasets/x.db" })] }, /leading "\/"/],
    ["a file with a scheme", { datasets: [ok({ file: "https://example.com/x.db" })] }, /scheme/],
    ["a file with a javascript: scheme", { datasets: [ok({ file: "javascript:alert(1)" })] }, /scheme/],
    ["a protocol-relative file", { datasets: [ok({ file: "//example.com/x.db" })] }, /leading "\/"/],
    ["a file with ..", { datasets: [ok({ file: "datasets/../x.db" })] }, /"\.\."/],
    ["a file starting with ..", { datasets: [ok({ file: "../x.db" })] }, /"\.\."/],
    ["a file with an encoded ..", { datasets: [ok({ file: "datasets/%2e%2e/x.db" })] }, /"\.\."/],
    ["a file with a backslash", { datasets: [ok({ file: "datasets\\x.db" })] }, /backslash/],
    ["a description that is not text", { datasets: [ok({ description: 5 })] }, /"description" of dataset "a"/],
    ["no default", { datasets: [ok({ default: false })] }, /no dataset has "default": true/],
    [
        "two defaults",
        { datasets: [ok(), ok({ id: "b" })] },
        /more than one dataset has "default": true \("a", "b"\)/,
    ],
    ["a default that is a string", { datasets: [ok({ default: "true" })] }, /"default" of dataset "a" must be true or false/],
];

for (const [name, body, message] of BAD_MANIFESTS) {
    test(`manifest validation: ${name} gives a specific message and an empty database`, async ({
        page,
        app,
        net,
        pageErrors,
    }) => {
        await routeManifest(page, body);
        await page.goto("./");
        await expect(app.status).toContainText("The list of datasets (datasets/manifest.json) is not valid");
        await expect(app.status).toContainText(message);
        await expect(app.status).toContainText("No dataset is open");
        // nothing was loaded: an empty database, nothing requested
        expect((await editorText(app)).trim()).toBe("");
        expect(net.paths.filter((p) => p.endsWith(".db"))).toEqual([]);
        // no course database to pick: the menu has no such entries (it still offers Open a file and
        // Open from URL), and the button names the empty database
        await expect(app.databaseItems).toHaveCount(0);
        expect(await app.pickedText()).toBe("new.db");
        // and the app works: upload still does
        await app.upload(SAMPLE_FILE);
        expect((await app.query("SELECT COUNT(*) AS n FROM fruit;")).rows).toEqual([["4"]]);
        expect(pageErrors).toEqual([]);
    });
}

test("manifest validation: the shipped minimal and unusual-but-valid manifests are accepted", async ({ page, app }) => {
    await routeManifest(page, {
        datasets: [
            { id: "x_1", name: " Plain ", file: "datasets/northlight_retail.db", default: true, extra: "ignored" },
            { id: "Y-2", name: "Second", file: "datasets/sample.db", default: false },
        ],
    });
    await app.open();
    await expect(app.databaseMenu.locator('[role="menuitemradio"] .menu-item-label')).toHaveText(["Plain", "Second"]);
    await app.expectPicked("x_1", "Plain");
});

test("manifest hostile names are shown as text, never as markup", async ({ page, app }) => {
    await routeManifest(page, {
        datasets: [
            { id: "a", name: PAYLOAD, file: "datasets/northlight_retail.db", default: true },
            { id: "b", name: PAYLOAD + " b", file: "datasets/missing.db" },
        ],
    });
    await app.open();
    await expect(app.databaseItems).toHaveCount(2);
    // the names are text in the menu, tags and all
    await expect(app.databaseMenu.locator('[role="menuitemradio"] .menu-item-label')).toHaveText([
        PAYLOAD,
        PAYLOAD + " b",
    ]);
    await app.expectInert();
    await app.pickDatabaseById("b"); // fails: 404, and the message names the dataset
    await expect(app.status).toContainText("could not be loaded");
    await expect(app.status).toContainText("<img");
    await app.expectInert();
});

for (const [name, options] of [
    ["is missing (404)", { status: 404, body: "not found" }],
    ["fails with a server error", { status: 500, body: "boom" }],
    ["cannot be fetched at all", { status: "abort" }],
]) {
    test(`the manifest ${name}: the app starts on an empty database with a clear message, and upload works`, async ({
        page,
        app,
        pageErrors,
    }) => {
        await routeManifest(page, options.body ?? "", options);
        await page.goto("./");
        await expect(app.status).toContainText("The list of datasets (datasets/manifest.json) could not be loaded");
        await expect(app.status).toContainText("You can still open a database file of your own");
        expect((await editorText(app)).trim()).toBe("");
        await expect(app.databaseLabel).toHaveText("new.db");
        // the query toolbar is usable and the database is a working empty one
        await expect(page.locator("#execute")).toBeEnabled();
        await app.query("CREATE TABLE t (x); INSERT INTO t VALUES (41), (1); SELECT SUM(x) AS s FROM t;");
        expect((await app.read()).rows).toEqual([["42"]]);
        await app.upload(SAMPLE_FILE);
        expect((await app.query("SELECT COUNT(*) AS n FROM fruit;")).rows).toEqual([["4"]]);
        expect(pageErrors).toEqual([]);
    });
}

test("a share link still restores its SQL when the manifest cannot be fetched", async ({ page, app }) => {
    const hash = await shareHash(page, { d: "northlight", q: "SELECT 'kept' AS k;" });
    await routeManifest(page, "", { status: 500 });
    await page.goto(`./${hash}`);
    await expect(app.status).toContainText("could not be loaded");
    expect((await editorText(app)).trim()).toBe("SELECT 'kept' AS k;");
    await page.locator("#execute").click();
    expect(await app.read()).toEqual({ columns: ["k"], rows: [["kept"]] });
});

test("a plain database path still loads when the manifest is broken, with a notice", async ({ page, app }) => {
    await routeManifest(page, "{oops");
    await page.goto("./#datasets/northlight_retail.db");
    await expect(app.databaseLabel).toHaveText("northlight_retail.db");
    await expect(app.status).toContainText("is not valid");
    expect((await app.query("SELECT COUNT(*) AS n FROM orders;")).rows).toEqual([["450"]]);
});

for (const [name, fulfill] of [
    ["is missing (404)", { status: 404, body: "no" }],
    ["fails with a server error", { status: 500, body: "boom" }],
    ["is not a SQLite file (an HTML page)", { status: 200, contentType: "text/html", body: "<html>oops</html>" }],
    ["is empty", { status: 200, contentType: "application/octet-stream", body: "" }],
]) {
    test(`the default dataset file ${name}: an empty database, a clear message, upload works`, async ({
        page,
        app,
    }) => {
        await page.route(/\/datasets\/northlight_retail\.db$/, (route) => route.fulfill(fulfill));
        await page.goto("./");
        await expect(app.status).toContainText('The dataset "Northlight Retail" could not be loaded, so an empty database is open.');
        await expect(app.databaseLabel).toHaveText("new.db");
        // the menu still lists the dataset, so reload or another pick is possible; the empty
        // database is not an entry of it, the button names it
        await expect(app.databaseMenu.locator('[role="menuitemradio"] .menu-item-label')).toHaveText(["Northlight Retail"]);
        await app.expectPicked(null);
        expect(await app.pickedText()).toBe("new.db");
        await app.upload(SAMPLE_FILE);
        expect((await app.query("SELECT COUNT(*) AS n FROM fruit;")).rows).toEqual([["4"]]);
    });
}

test("a dataset that cannot be fetched at start can be picked later, once it works", async ({ page, app }) => {
    let failing = true;
    await page.route(/\/datasets\/northlight_retail\.db$/, (route) =>
        failing ? route.fulfill({ status: 500, body: "boom" }) : route.continue()
    );
    await page.goto("./");
    await expect(app.status).toContainText("could not be loaded");
    failing = false;
    await app.pickDatabaseById("northlight");
    await expect(app.databaseLabel).toHaveText("Northlight Retail");
    expect((await app.query("SELECT COUNT(*) AS n FROM orders;")).rows).toEqual([["450"]]);
});

test("a failed pick leaves the previous database open and the switcher back on it", async ({ page, app }) => {
    await withSampleDataset(page);
    await page.route(SAMPLE_URL, (route) => route.fulfill({ status: 500, body: "boom" }));
    await app.open();
    await app.run("CREATE TABLE keep (x); INSERT INTO keep VALUES (1);");
    const before = page.url();

    await app.pickDatabaseById("sample");
    await expect(app.status).toContainText('The dataset "Sample Fruit" could not be loaded. The previous database is still open.');
    await app.expectPicked("northlight");
    await expect(app.databaseLabel).toHaveText("Northlight Retail");
    expect(page.url()).toBe(before); // nothing was pushed
    // still the same connection, with the student's table
    expect((await app.query("SELECT COUNT(*) AS n FROM keep;")).rows).toEqual([["1"]]);

    // an engine-level failure (a file that is a database by its header but is garbage) too
    const bad = Buffer.concat([Buffer.from("SQLite format 3\0"), Buffer.alloc(100, 7)]);
    await page.route(SAMPLE_URL, (route) => route.fulfill({ status: 200, body: bad }));
    await app.pickDatabaseById("sample");
    await expect(app.status).toContainText("Failed to load database");
    await app.expectPicked("northlight");
    expect((await app.query("SELECT COUNT(*) AS n FROM keep;")).rows).toEqual([["1"]]);
});

// ---- stale loads -----------------------------------------------------------------

async function withThreeDatasets(page, { sampleGate } = {}) {
    const manifest = realManifest();
    manifest.datasets.push({ ...SAMPLE_ENTRY }, { ...SAMPLE_ENTRY, id: "sample2", name: "Second Sample", file: "datasets/sample2.db" });
    await routeManifest(page, manifest);
    await page.route(SAMPLE_URL, async (route) => {
        if (sampleGate) await sampleGate.promise;
        await route.fulfill({ path: SAMPLE_FILE, contentType: "application/octet-stream" });
    });
    await page.route(SAMPLE2_URL, (route) =>
        route.fulfill({ path: SAMPLE_FILE, contentType: "application/octet-stream" })
    );
}

test("rapid switching ends on the last choice: a slow earlier load does not overwrite a quick later one", async ({
    page,
    app,
}) => {
    const slow = gate();
    await withThreeDatasets(page, { sampleGate: slow });
    await app.open();

    await app.pickDatabaseById("sample"); // held back
    await app.pickDatabaseById("sample2"); // answers at once
    await expect(app.databaseLabel).toHaveText("Second Sample");
    await app.expectPicked("sample2");

    slow.open(); // the first load now completes
    await page.waitForTimeout(500);
    await expect(app.databaseLabel).toHaveText("Second Sample");
    await app.expectPicked("sample2");
    expect(new URL(page.url()).search).toBe("?db=sample2");
    expect(await page.evaluate(() => window.app.database.name)).toBe("sample2.db");
    // one history entry for the choice that won, none for the stale one
    await page.goBack();
    await expect(app.databaseLabel).toHaveText("Northlight Retail");
});

test("rapid switching: three quick choices end on the third, whatever order the answers come in", async ({
    page,
    app,
}) => {
    const first = gate();
    await withThreeDatasets(page, { sampleGate: first });
    await app.open();
    await app.pickDatabaseById("sample"); // held
    await app.pickDatabaseById("sample2");
    await app.pickDatabaseById("northlight");
    await expect(app.status).not.toContainText("Loading database");
    await expect(app.databaseLabel).toHaveText("Northlight Retail");
    first.open();
    await page.waitForTimeout(500);
    await expect(app.databaseLabel).toHaveText("Northlight Retail");
    await app.expectPicked("northlight");
    expect((await app.query("SELECT COUNT(*) AS n FROM orders;")).rows).toEqual([["450"]]);
});

test("a pick that is still loading does not overwrite an upload made after it", async ({ page, app }) => {
    const slow = gate();
    await withThreeDatasets(page, { sampleGate: slow });
    await app.open();
    await app.pickDatabaseById("sample"); // held
    await app.upload({
        name: "mine.db",
        mimeType: "application/octet-stream",
        buffer: fs.readFileSync(SAMPLE_FILE),
    });
    await expect(app.databaseLabel).toHaveText("mine.db");
    slow.open();
    await page.waitForTimeout(500);
    await expect(app.databaseLabel).toHaveText("mine.db");
    expect(await app.pickedText()).toBe("mine.db");
});

test("a slow load that fails after a newer choice does not disturb it", async ({ page, app }) => {
    const slow = gate();
    const manifest = realManifest();
    manifest.datasets.push({ ...SAMPLE_ENTRY });
    await routeManifest(page, manifest);
    await page.route(SAMPLE_URL, async (route) => {
        await slow.promise;
        await route.fulfill({ status: 500, body: "boom" });
    });
    await app.open();
    await app.pickDatabaseById("sample"); // will fail, late
    await app.pickDatabaseById("northlight");
    // the name does not change (northlight was open), so wait for the load to finish
    await expect(app.status).not.toContainText("Loading database");
    await expect(app.status).toContainText(/rows?, took|Your last query/);
    await app.query("SELECT 'marker' AS m;");
    slow.open();
    await page.waitForTimeout(500);
    await expect(app.status).not.toContainText("could not be loaded");
    expect(await app.read()).toEqual({ columns: ["m"], rows: [["marker"]] });
    await app.expectPicked("northlight");
});

// ---- the top bar: phones and desktops ----------------------------------------------------

// the controls of the top bar, in order: the brand, the database switcher, Copy link, Export,
// Theme, Help
const TOPBAR_CONTROLS = ["#reset", "#database-button", "#copy-link", "#export-button", "#theme-button", "#help-button"];
const TOPBAR_BUTTONS = TOPBAR_CONTROLS.slice(1);

test("at phone width the top bar is visible, wraps, and the switcher works", async ({ page, app }) => {
    await page.setViewportSize({ width: 360, height: 740 });
    await withSampleDataset(page);
    await app.open();

    for (const selector of TOPBAR_CONTROLS) {
        await expect(page.locator(`header.topbar ${selector}`), selector).toBeVisible();
    }
    await expect(page.getByRole("button", { name: "Database: Northlight Retail" })).toBeVisible();
    // opening a file and opening from a URL are in the switcher's menu
    await app.databaseButton.click();
    await expect(app.databaseMenu).toBeVisible();
    await expect(page.getByRole("menuitem", { name: /^Open a file…/ })).toBeVisible();
    await expect(page.getByRole("menuitem", { name: /^Open from URL…/ })).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(app.databaseMenu).toBeHidden();

    // it wraps onto more than one row, and nothing sticks out sideways
    const overflow = await page.evaluate((selectors) => ({
        page: document.documentElement.scrollWidth - window.innerWidth,
        rows: new Set(selectors.map((s) => Math.round(document.querySelector(s).getBoundingClientRect().top / 4))).size,
        sticking: [...document.querySelectorAll("header.topbar *")]
            .filter((el) => el.getBoundingClientRect().right > window.innerWidth + 0.5 || el.getBoundingClientRect().left < -0.5)
            .map((el) => el.tagName + "#" + el.id),
    }), TOPBAR_CONTROLS);
    expect(overflow.page).toBeLessThanOrEqual(0);
    expect(overflow.sticking).toEqual([]);
    expect(overflow.rows).toBeGreaterThan(1);
    // touch-sized targets: every button of the top bar
    for (const selector of TOPBAR_BUTTONS) {
        expect((await page.locator(selector).boundingBox()).height, selector).toBeGreaterThanOrEqual(32);
    }

    await app.pickDatabaseById("sample");
    await expect(app.databaseLabel).toHaveText("Sample Fruit");
    expect(await app.pickedText()).toBe("Sample Fruit");
});

test("at phone width a long dataset name does not push the top bar off the screen", async ({ page, app }) => {
    await page.setViewportSize({ width: 360, height: 740 });
    const manifest = realManifest();
    manifest.datasets[0].name = "A very long dataset name that goes on and on and on and on and on";
    await routeManifest(page, manifest);
    await app.open();
    const widths = await page.evaluate(() => ({
        page: document.documentElement.scrollWidth,
        view: window.innerWidth,
        sticking: [...document.querySelectorAll("header.topbar *")]
            .filter((el) => el.getBoundingClientRect().right > window.innerWidth + 0.5 || el.getBoundingClientRect().left < -0.5)
            .map((el) => el.tagName + "#" + el.id),
    }));
    expect(widths.page).toBeLessThanOrEqual(widths.view);
    expect(widths.sticking).toEqual([]);
});

test("from 768 to 1280 px wide every control of the top bar is on one line", async ({ page, app }) => {
    await app.open();
    for (const width of [768, 900, 1024, 1200, 1280]) {
        await page.setViewportSize({ width, height: 800 });
        const bar = await page.locator("header.topbar").evaluate((el) => ({
            overflowX: el.scrollWidth - el.clientWidth,
            right: el.getBoundingClientRect().right,
        }));
        expect(bar.overflowX, `${width}px: nothing sticks out of the bar`).toBeLessThanOrEqual(0);
        const boxes = [];
        for (const selector of TOPBAR_CONTROLS) {
            const box = await page.locator(selector).boundingBox();
            expect(box, `${width}px: ${selector} is shown`).not.toBeNull();
            expect(box.x + box.width, `${width}px: ${selector} is inside the window`).toBeLessThanOrEqual(width + 0.5);
            boxes.push(box);
        }
        // one row: each control's middle lies within the height of every other one
        const middles = boxes.map((box) => box.y + box.height / 2);
        for (const [i, box] of boxes.entries()) {
            for (const middle of middles) {
                expect(middle, `${width}px: ${TOPBAR_CONTROLS[i]} shares a line with the rest`).toBeGreaterThan(box.y);
                expect(middle).toBeLessThan(box.y + box.height);
            }
        }
        await expect(app.picker).toBeVisible();
    }
});

// ---- keyboard ---------------------------------------------------------------------------

test("the switcher works from the keyboard: Tab to it, Enter and arrows choose a dataset, focus returns to the button", async ({
    page,
    app,
}) => {
    await withSampleDataset(page);
    await app.open();

    // the brand comes first, then the switcher
    await page.locator("#reset").focus();
    await page.keyboard.press("Tab");
    await expect(app.picker).toBeFocused();

    // Enter opens the menu with the focus on the open database; the arrows move; Enter chooses
    await page.keyboard.press("Enter");
    await expect(app.databaseMenu).toBeVisible();
    await expect(app.databaseItem("northlight")).toBeFocused();
    await page.keyboard.press("ArrowDown");
    await expect(app.databaseItem("sample")).toBeFocused();
    await page.keyboard.press("Enter");
    await expect(app.databaseMenu).toBeHidden();
    await expect(app.databaseLabel).toHaveText("Sample Fruit");
    await expect(app.picker).toBeFocused(); // focus was not pulled into the editor
    await expect(app.status).toContainText("4 rows, took");
    await expect(app.picker).toBeFocused();
    expect(await app.pickedText()).toBe("Sample Fruit");
    expect(new URL(page.url()).search).toBe("?db=sample");

    // ArrowDown opens it too, on the ticked entry now; ArrowUp moves to the one above
    await page.keyboard.press("ArrowDown");
    await expect(app.databaseMenu).toBeVisible();
    await expect(app.databaseItem("sample")).toBeFocused();
    await page.keyboard.press("ArrowUp");
    await expect(app.databaseItem("northlight")).toBeFocused();
    await page.keyboard.press("Enter");
    await expect(app.databaseLabel).toHaveText("Northlight Retail");
    await expect(app.picker).toBeFocused();
    expect(new URL(page.url()).search).toBe("?db=northlight");

    // Escape closes the menu without choosing, and the focus stays on the button
    await page.keyboard.press("Enter");
    await expect(app.databaseMenu).toBeVisible();
    await page.keyboard.press("ArrowDown");
    await expect(app.databaseItem("sample")).toBeFocused();
    await page.keyboard.press("Escape");
    await expect(app.databaseMenu).toBeHidden();
    await expect(app.picker).toBeFocused();
    await expect(app.databaseLabel).toHaveText("Northlight Retail");
    expect(new URL(page.url()).search).toBe("?db=northlight");

    // and on to the editor with Tab: the top bar's other buttons, the sidebar and the Run button
    // come first, so this takes however many stops they are
    let reached = false;
    for (let i = 0; i < 80 && !reached; i++) {
        await page.keyboard.press("Tab");
        reached = await page.evaluate(() => document.activeElement?.id === "editor");
    }
    expect(reached, "the editor is reachable with Tab").toBe(true);
});

test("the export button is a real button reachable and operable from the keyboard", async ({ page, app }) => {
    await app.open();
    const button = page.locator("#export-button");
    await button.focus();
    expect(await button.evaluate((el) => el.tagName)).toBe("BUTTON");
    // Enter opens the Export menu on "Database (.db)…", Enter again its dialog, and Enter in the
    // dialog's name field saves the file
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

// ---- events, the database getter, memory, pristine bytes ---------------------------------

test.describe("page events and the database getter", () => {
    test.beforeEach(async ({ page }) => {
        await page.addInitScript(() => {
            window.__events = [];
            for (const type of ["lab:database-loaded", "lab:run-finished"]) {
                document.addEventListener(type, (e) => {
                    const d = e.detail;
                    window.__events.push({
                        type,
                        name: d.database ? d.database.name : null,
                        dataset: d.dataset === undefined ? "n/a" : d.dataset ? d.dataset.id : null,
                        sql: d.sql,
                        ok: d.ok,
                        rows: d.rows,
                        error: d.error,
                        preview: d.preview,
                        current: window.app.database === d.database,
                    });
                });
            }
        });
    });
    const events = (page, type) => page.evaluate((t) => window.__events.filter((e) => e.type === t), type);

    test("lab:database-loaded fires for all three ways of starting", async ({ page, app }) => {
        await withSampleDataset(page);
        await app.open();
        expect(await events(page, "lab:database-loaded")).toEqual([
            { type: "lab:database-loaded", name: "northlight_retail.db", dataset: "northlight", current: true },
        ].map((e) => expect.objectContaining(e)));

        await app.pickDatabaseById("sample");
        await expect(app.databaseLabel).toHaveText("Sample Fruit");
        await app.upload(SAMPLE_FILE);
        page.once("dialog", (dialog) => dialog.accept("datasets/northlight_retail.db"));
        await page.keyboard.press("Control+u");
        await expect(app.databaseLabel).toHaveText("northlight_retail.db");
        await app.expectPicked(null);

        const loaded = await events(page, "lab:database-loaded");
        expect(loaded.map((e) => [e.name, e.dataset, e.current])).toEqual([
            ["northlight_retail.db", "northlight", true], // the page load: a dataset
            ["sample.db", "sample", true], // the database switcher: a course database
            ["sample.db", null, true], // an upload: no dataset
            ["northlight_retail.db", null, true], // open-from-URL: no dataset
        ]);
    });

    test("lab:database-loaded fires for the empty database after a failed start", async ({ page, app }) => {
        await app.openEmpty();
        const loaded = await events(page, "lab:database-loaded");
        expect(loaded.map((e) => [e.name, e.dataset])).toEqual([["new.db", null]]);
    });

    test("lab:run-finished fires after every run, failed ones included", async ({ page, app }) => {
        await app.open();
        await app.query("SELECT 1 AS one UNION ALL SELECT 2;");
        await app.run("CREATE TABLE u (x); INSERT INTO u VALUES (1); selct nothing;");
        await expect(app.status).toContainText("syntax error");
        await app.run("SELECT COUNT(*) AS n FROM u;"); // the statements before the error stay applied
        await expect(app.table).toBeVisible();
        expect((await app.read()).rows).toEqual([["1"]]);

        const runs = (await events(page, "lab:run-finished")).filter((e) => !e.preview);
        expect(runs.map((e) => [e.ok, e.rows ?? null])).toEqual([
            [true, 2],
            [false, null],
            [true, 1],
        ]);
        expect(runs[0].sql).toBe("SELECT 1 AS one UNION ALL SELECT 2;");
        expect(runs[1].error).toContain("syntax error");
        expect(runs.every((e) => e.current)).toBe(true);
    });

    test("the table preview the app runs on its own is flagged as a preview", async ({ page, app }) => {
        await app.open();
        const runs = await events(page, "lab:run-finished");
        expect(runs.map((e) => [e.preview, e.ok])).toEqual([[true, true]]);
    });

    test("window.app.database is the open database and follows every load", async ({ page, app }) => {
        await withSampleDataset(page);
        await app.open();
        expect(await page.evaluate(() => window.app.database.name)).toBe("northlight_retail.db");
        expect(await page.evaluate(() => window.app.database.tables.length)).toBeGreaterThan(3);
        await app.pickDatabaseById("sample");
        await expect(app.databaseLabel).toHaveText("Sample Fruit");
        expect(await page.evaluate(() => window.app.database.name)).toBe("sample.db");
        // a getter: the page cannot replace the database by assigning to it
        expect(await page.evaluate(() => {
            try {
                window.app.database = null;
            } catch {}
            return window.app.database.name;
        })).toBe("sample.db");
    });
});

test("the previous connection is closed after a successful switch, and kept after a failed one", async ({
    page,
    app,
}) => {
    await withSampleDataset(page);
    await app.open();
    await page.evaluate(() => (window.__old = window.app.database));
    expect(await page.evaluate(() => window.__old.db.isOpen())).toBe(true);

    // a failed switch keeps it
    await page.route(SAMPLE_URL, (route) => route.fulfill({ status: 500, body: "x" }));
    await app.pickDatabaseById("sample");
    await expect(app.status).toContainText("previous database is still open");
    expect(await page.evaluate(() => window.__old.db.isOpen())).toBe(true);
    expect(await page.evaluate(() => window.app.database === window.__old)).toBe(true);

    // a successful one closes it
    await page.unroute(SAMPLE_URL);
    await routeSampleOk(page);
    await app.pickDatabaseById("sample");
    await expect(app.databaseLabel).toHaveText("Sample Fruit");
    expect(await page.evaluate(() => window.__old.db.isOpen())).toBe(false);
    // also for an upload
    await page.evaluate(() => (window.__old = window.app.database));
    await app.upload(SAMPLE_FILE);
    expect(await page.evaluate(() => window.__old.db.isOpen())).toBe(false);
    expect(await page.evaluate(() => window.app.database.db.isOpen())).toBe(true);
});

async function routeSampleOk(page) {
    await page.route(SAMPLE_URL, (route) => route.fulfill({ path: SAMPLE_FILE, contentType: "application/octet-stream" }));
}

test.describe("pristine bytes", () => {
    const pristineInfo = (page) =>
        page.evaluate(async () => {
            const { getPristineBytes, getPristineId } = await import("./js/lab/datasets.js");
            const bytes = getPristineBytes();
            if (!bytes) return null;
            const digest = async (b) =>
                [...new Uint8Array(await crypto.subtle.digest("SHA-256", b))]
                    .map((x) => x.toString(16).padStart(2, "0"))
                    .join("");
            const first = await digest(bytes);
            bytes.fill(0); // vandalise the copy
            const again = getPristineBytes();
            return {
                id: getPristineId(),
                length: again.length,
                sha: await digest(again),
                first,
                copy: again !== bytes && again.buffer !== bytes.buffer,
            };
        });

    test("getPristineBytes returns a fresh copy of the dataset exactly as fetched, whatever the student does", async ({
        page,
        app,
    }) => {
        await app.open();
        const file = fs.readFileSync(NORTHLIGHT_FILE);
        await app.run("DELETE FROM order_items; DROP VIEW v_sales; CREATE TABLE junk (x);");
        await expect(app.status).toContainText("took");

        const info = await pristineInfo(page);
        expect(info.id).toBe("northlight");
        expect(info.length).toBe(file.length);
        expect(info.sha).toBe(sha256(file));
        expect(info.first).toBe(sha256(file));
        expect(info.copy).toBe(true);
    });

    test("the engine's header edit (WAL flags) never reaches the pristine bytes", async ({ page, app }) => {
        const wal = Buffer.from(fs.readFileSync(SAMPLE_FILE));
        wal[18] = 2;
        wal[19] = 2;
        const manifest = realManifest();
        manifest.datasets.push({ ...SAMPLE_ENTRY });
        await routeManifest(page, manifest);
        await page.route(SAMPLE_URL, (route) =>
            route.fulfill({ status: 200, contentType: "application/octet-stream", body: wal })
        );
        await app.open();
        await app.pickDatabaseById("sample");
        await expect(app.status).toContainText("4 rows, took"); // it opened: the engine got a patched copy
        const info = await pristineInfo(page);
        expect(info.id).toBe("sample");
        expect(info.sha).toBe(sha256(wal)); // bytes 18 and 19 are still 2
    });

    test("there are no pristine bytes while an uploaded file or a URL is open", async ({ page, app }) => {
        await app.open();
        await app.upload(SAMPLE_FILE);
        expect(await pristineInfo(page)).toBeNull();
    });
});

// ---- AC6 -------------------------------------------------------------------------------

test("AC6 a session that switches datasets, exports, shares and uploads makes zero non-same-origin requests", async ({
    page,
    app,
    net,
}) => {
    await withSampleDataset(page);
    await app.open();
    await app.query("SELECT COUNT(*) AS n FROM orders;");
    await app.pickDatabaseById("sample");
    await expect(app.databaseLabel).toHaveText("Sample Fruit");
    await app.query("SELECT COUNT(*) AS n FROM fruit;");
    await app.copyLink();
    await app.exportFile();
    await page.goBack();
    await expect(app.databaseLabel).toHaveText("Northlight Retail");
    await app.upload(SAMPLE_FILE);
    await page.goto("./?db=nope");
    await expect(app.status).toContainText("There is no dataset");

    expect(net.network.length, "the session really made requests").toBeGreaterThan(8);
    net.expectNoExternalRequests();
    net.expectNoSameOriginFailures();
    expect(net.paths).toEqual(expect.arrayContaining(["datasets/manifest.json", "datasets/northlight_retail.db"]));
    // every request path is relative to the site base: none escapes the mount
    expect(net.paths.every((p) => !p.startsWith("/"))).toBe(true);
});
