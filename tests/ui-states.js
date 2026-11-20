// The states of the UI plan's screenshot matrix (docs/design, section 8), as recipes that drive a
// page into each state. Shared by tools/ui-matrix.mjs (the screenshots in docs/ui/), the
// accessibility checks (tests/ui-a11y.spec.js) and, from Phase 2, the screenshot baselines.
//
// A recipe is async (page) => void and navigates with relative URLs, so the page's context needs a
// baseURL (the tests have one; tools/ui-matrix.mjs sets one). When the interface changes, the
// recipes change with it, like any other test.

const fs = require("node:fs");
const path = require("node:path");
const { pathToFileURL } = require("node:url");
const XLSX = require("../vendor/xlsx.full.min.js");

// a file of the owner's test files (tests/fixtures/), for the states that import one
const fixtureFile = (name) => path.join(__dirname, "fixtures", ...name.split("/"));

// The mockup's main screen (docs/design/mockup/main-light.html); its result is real.
const RESULT_SQL = `-- Revenue share by category
WITH category_revenue AS (
  SELECT p.category,
         SUM(oi.quantity * p.unit_price * (1 - oi.discount)) AS revenue
  FROM orders o
  JOIN order_items oi ON o.order_id = oi.order_id
  JOIN products p ON oi.product_id = p.product_id
  GROUP BY p.category
)
SELECT category, ROUND(revenue, 2) AS revenue,
       ROUND(100.0 * revenue / SUM(revenue) OVER (), 1) AS contribution_pct
FROM category_revenue
ORDER BY revenue DESC;`;

const ERROR_SQL = `SELECT product_name, pric
FROM products
WHERE category = 'Electronics';`;

// Exercise e05 of retail-basics ("Online sales by category", order matters): its answer, and the
// same query sorted the wrong way, which fails on row 1 and shows the Expected and Yours tables.
const EXERCISE = { set: "retail-basics", ex: "e05" };
const CORRECT_SQL = `SELECT p.category,
       ROUND(SUM(oi.quantity * p.unit_price * (1 - oi.discount)), 2) AS revenue
FROM orders o
JOIN order_items oi ON oi.order_id = o.order_id
JOIN products p ON p.product_id = oi.product_id
WHERE o.payment_method = 'Online'
GROUP BY p.category
ORDER BY revenue DESC;`;
const WRONG_SQL = CORRECT_SQL.replace("ORDER BY revenue DESC;", "ORDER BY revenue;");

const READY = /Run SQL query to see the results|Press Run to execute it|\d+ rows?, took \d+ ms/;
const DONE = /\d+ rows?, took \d+ ms/;
// the editor's typing surface: CodeMirror's content (Phase 3), or the editable #editor itself
// (before Phase 3, and whenever CodeMirror does not load); tests/helpers.js has the same
const EDITOR_INPUT = '#editor .cm-content, #editor[contenteditable="true"]';

// The recipes are written against Northlight Retail (its tables, its samples, its name while it
// loads), so they open it by id, whichever dataset the manifest makes the default (Home Store since
// 2026-11-12); tests/helpers.js has the same
const NORTHLIGHT_URL = "./?db=northlight";

// northlightDefault: the manifest the site ships, with Northlight made the default, for a recipe
// whose address names no dataset and so opens the default (a damaged link)
function northlightDefault() {
    const manifest = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "datasets", "manifest.json"), "utf8"));
    for (const entry of manifest.datasets) {
        entry.default = entry.id === "northlight";
    }
    return manifest;
}

// The interface before the redesign; Phase 1 changes no layout, so it uses these too.
const legacy = {
    async open(page, url = NORTHLIGHT_URL) {
        await page.goto(url);
        await page.locator("#status").filter({ hasText: READY }).waitFor();
    },
    async run(page, sql, done = DONE) {
        await page.locator(EDITOR_INPUT).fill(sql);
        await page.locator(EDITOR_INPUT).press("Control+Enter");
        await page.locator("#status").filter({ hasText: done }).waitFor();
    },
    async openSchema(page) {
        const toggle = page.locator("#schema .schema-toggle");
        if ((await toggle.getAttribute("aria-expanded")) === "false") {
            await toggle.click();
        }
    },
};

legacy.states = {
    // The old interface has no empty state: a first visit runs a preview of the first table.
    "first-visit": async (page) => {
        await legacy.open(page);
    },
    // The old interface's "no result yet": after a reload the last query is back in the editor,
    // not run.
    "no-result": async (page) => {
        await legacy.open(page);
        await legacy.run(page, "SELECT * FROM products;");
        await page.reload();
        await page.locator("#status").filter({ hasText: /Press Run to execute it/ }).waitFor();
    },
    result: async (page) => {
        await legacy.open(page);
        await legacy.run(page, RESULT_SQL);
    },
    error: async (page) => {
        await legacy.open(page);
        await legacy.run(page, ERROR_SQL, /no such column/);
    },
    "schema-expanded": async (page) => {
        await legacy.open(page);
        await legacy.openSchema(page);
        await page.getByRole("button", { name: "Columns of table products", exact: true }).click();
        await page.locator("#schema .schema-column").first().waitFor();
    },
    // (The interface before Phase 2.) Its native selects (Dataset, Exercises) open outside the
    // page and never appear in a screenshot, so the menus drawn open are the history popup and,
    // from Phase 1, the Theme menu.
    "menu-history": async (page) => {
        await legacy.open(page);
        await legacy.run(page, "SELECT * FROM stores;");
        await legacy.run(page, RESULT_SQL);
        await page.locator("#run-history").click();
        await page.locator("#run-history-list button").first().waitFor();
    },
    "menu-theme": async (page) => {
        await legacy.open(page);
        await page.locator("#theme-button").click();
        await page.locator("#theme-menu").waitFor({ state: "visible" });
    },
    "evidence-dialog": async (page) => {
        await legacy.open(page);
        await legacy.run(page, RESULT_SQL);
        await page.locator("#export-evidence").click();
        await page.locator("#evidence-dialog").waitFor({ state: "visible" });
    },
    "exercise-prompt": async (page) => {
        await legacy.open(page, `./?set=${EXERCISE.set}&ex=${EXERCISE.ex}`);
        await page.locator("#exercise-panel").waitFor({ state: "visible" });
    },
    "exercise-correct": async (page) => {
        await legacy.states["exercise-prompt"](page);
        await page.locator(EDITOR_INPUT).fill(CORRECT_SQL);
        await page.locator("#exercise-check").click();
        await page.locator("#exercise-feedback").filter({ hasText: "Passed" }).waitFor();
    },
    "exercise-wrong": async (page) => {
        await legacy.states["exercise-prompt"](page);
        await page.locator(EDITOR_INPUT).fill(WRONG_SQL);
        await page.locator("#exercise-check").click();
        await page.locator("#exercise-feedback table").first().waitFor();
    },
};

// The app shell of Phase 2: a top bar with menus, a sidebar with tabs, the query above its result;
// from Phase 4 the results pane has its states (js/lab/results.js), named by #results-pane's
// data-state, and a run starts one frame after it is asked for, so a recipe waits for it to finish
// (window.app.whenIdle) rather than for text.
const READY_PANE = '#results-pane:is([data-state="empty"], [data-state="result"], [data-state="done"], [data-state="error"], [data-state="report"])';

// a query whose first column holds a value longer than 60 characters (the product names, joined)
const LONG_CELL_SQL = "SELECT group_concat(product_name, ', ') AS names, COUNT(*) AS products, NULL AS discontinued FROM products;";
// a run with no result set that changes rows
const DONE_SQL = `CREATE TABLE notes (id INTEGER PRIMARY KEY, body TEXT);
INSERT INTO notes (body) VALUES ('Restock the Leeds store'), ('Call the York supplier');`;

// From Phase 6 what is on screen depends on the window's width (UI plan, section 6): under 1100 px
// the sidebar is a drawer, opened by #sidebar-button; under 700 px the top bar's actions are in the
// More menu, and the query and its result are two views (Editor, Result), a run showing the result.
// The recipes reach each control as a student would at that width.
const shell = {
    async open(page, url = NORTHLIGHT_URL) {
        await page.goto(url);
        // (attached: on a phone the results pane is in the Result view, which a load does not show)
        await page.locator(READY_PANE).waitFor({ state: "attached" });
    },
    // view shows the phone's Editor or Result view (nothing to do on a wider window)
    async view(page, which) {
        const button = page.locator(which === "editor" ? "#view-editor" : "#view-result");
        if ((await button.isVisible()) && (await button.getAttribute("aria-current")) !== "true") {
            await button.click();
        }
    },
    // drawer opens the sidebar where it is a drawer (under 1100 px)
    async drawer(page) {
        const button = page.locator("#sidebar-button");
        if ((await button.isVisible()) && (await button.getAttribute("aria-expanded")) !== "true") {
            await button.click();
            await page.locator("#sidebar").waitFor({ state: "visible" });
            // what is measured once laid out (the description's Show more) settles a frame later
            await page.waitForTimeout(150);
        }
    },
    // more opens the More menu where the top bar's actions are folded into it (under 700 px), and
    // says whether it did
    async more(page) {
        const button = page.locator("#more-button");
        if (!(await button.isVisible())) {
            return false;
        }
        await button.click();
        await page.locator("#more-menu").waitFor({ state: "visible" });
        return true;
    },
    // a top-bar action: its own button, or its entry in the More menu
    async action(page, button, entry) {
        if (await shell.more(page)) {
            await page.locator(entry).click();
        } else {
            await page.locator(button).click();
        }
    },
    // run puts SQL in the editor, runs it with Ctrl+Enter, and waits until the results pane shows
    // `state` ("result", "done" or "error")
    async run(page, sql, state = "result") {
        await shell.view(page, "editor");
        await page.locator(EDITOR_INPUT).fill(sql);
        await page.locator(EDITOR_INPUT).press("Control+Enter");
        await page.evaluate(() => window.app.whenIdle());
        await page.locator(`#results-pane[data-state="${state}"]`).waitFor();
    },
    // menu opens a menu (or the Help popover). A top-bar menu folded into the More menu under
    // 700 px is that menu, open (Help, the popover it opens from there); the set picker is in the
    // sidebar, in the drawer under 1100 px.
    async menu(page, button, menu) {
        if (button === "#exercise-set-picker") {
            await shell.drawer(page);
        }
        if (await page.locator(button).isVisible()) {
            await page.locator(button).click();
            await page.locator(menu).waitFor({ state: "visible" });
        } else if (await shell.more(page)) {
            if (button === "#help-button") {
                await page.locator("#more-help").click();
                await page.locator(menu).waitFor({ state: "visible" });
            }
        }
        // the switcher's sizes arrive with a HEAD request after it opens
        await page.waitForTimeout(150);
    },
    // a clipboard that takes the link (headless browsers may refuse the real one)
    async clipboard(page, { refuse = false } = {}) {
        await page.evaluate((no) => {
            Object.defineProperty(navigator, "clipboard", {
                configurable: true,
                value: { writeText: async () => (no ? Promise.reject(new Error("refused")) : undefined) },
            });
            if (no) {
                document.execCommand = () => false;
            }
        }, refuse);
    },
    async exerciseOpen(page) {
        await shell.open(page, `./?set=${EXERCISE.set}&ex=${EXERCISE.ex}`);
        await page.locator("#exercise-panel").waitFor({ state: "visible" });
    },
    async check(page, sql) {
        await shell.view(page, "editor");
        await page.locator(EDITOR_INPUT).fill(sql);
        await page.locator("#exercise-check").click();
    },
};

shell.states = {
    // From Phase 4 a first visit runs nothing: "no result yet" with Northlight's three samples (on
    // a phone, in the Result view; Northlight opened by id, as every recipe opens it)
    "first-visit": async (page) => {
        await shell.open(page);
        await shell.view(page, "result");
    },
    // after a reload the last query is back in the editor, not run
    "no-result": async (page) => {
        await shell.open(page);
        await shell.run(page, "SELECT * FROM products;");
        await page.reload();
        await page.locator(READY_PANE).waitFor({ state: "attached" });
        await shell.view(page, "result");
    },
    // From Phase 4: a database on its way (its request held, so the bar waits)
    loading: Object.assign(
        async (page) => {
            await page.route(/\/datasets\/northlight_retail\.db(\?.*)?$/, () => {});
            await page.goto(NORTHLIGHT_URL);
            await page.locator('#results-pane[data-state="loading"] .results-loading-title').filter({ hasText: "Northlight Retail" }).waitFor({ state: "attached" });
            await shell.view(page, "result");
        },
        { busy: true }
    ),
    // From Phase 4: the database half way: its file is served in full but handed to the page half
    // (a stream that stops), so the bar and the size line show where it is
    "loading-progress": async (page) => {
        await page.addInitScript(() => {
            const original = window.fetch;
            window.fetch = async (input, init) => {
                const url = String(input instanceof Request ? input.url : input);
                if (!/northlight_retail\.db(\?.*)?$/.test(url) || init?.method === "HEAD") {
                    return original(input, init);
                }
                const bytes = new Uint8Array(await (await original(input, init)).arrayBuffer());
                const half = bytes.slice(0, Math.floor(bytes.length / 2));
                const body = new ReadableStream({
                    start(controller) {
                        controller.enqueue(half);
                    },
                });
                return new Response(body, { headers: { "content-length": String(bytes.length) } });
            };
        });
        await page.goto(NORTHLIGHT_URL);
        await page.locator(".results-loading-size").filter({ hasText: / of / }).waitFor({ state: "attached" });
        await shell.view(page, "result");
    },
    result: async (page) => {
        await shell.open(page);
        await shell.run(page, RESULT_SQL);
    },
    // From Phase 4: a result cut at 500 rows, and a result with no rows (the header and its rules)
    capped: async (page) => {
        await shell.open(page);
        await shell.run(page, "SELECT * FROM order_items;");
    },
    "zero-rows": async (page) => {
        await shell.open(page);
        await shell.run(page, "SELECT product_name, unit_price FROM products WHERE unit_price > 1000;");
    },
    // From Phase 4: a value longer than 60 characters, pressed: the whole of it in a popover
    "long-cell": async (page) => {
        await shell.open(page);
        await shell.run(page, LONG_CELL_SQL);
        // pressed where it is, as a student presses it: Playwright's own click first scrolls the
        // button into view, and a value wider than a phone's pane makes that slide the table
        // sideways, which no press, Tab or Escape does
        const button = page.locator("#result .cell-more").first();
        let box = await button.boundingBox();
        const { height } = page.viewportSize();
        if (box.y + box.height > height) {
            await page.evaluate((by) => window.scrollBy(0, by), box.y + box.height - height + 16);
            box = await button.boundingBox();
        }
        await page.mouse.click(box.x + 40, box.y + box.height / 2);
        await page.locator("#cell-popover").waitFor({ state: "visible" });
    },
    // From Phase 4: a run with no result set
    done: async (page) => {
        await shell.open(page);
        await shell.run(page, DONE_SQL, "done");
    },
    error: async (page) => {
        await shell.open(page);
        await shell.run(page, ERROR_SQL, "error");
    },
    // From Phase 4: a damaged link: the error band over "no result yet" (the default database opened;
    // a damaged link names no dataset, so Northlight is made the default for it, as for the others)
    "load-problem": async (page) => {
        await page.route(/\/datasets\/manifest\.json(\?.*)?$/, (route) =>
            route.fulfill({ contentType: "application/json", body: JSON.stringify(northlightDefault()) })
        );
        await shell.open(page, "./#s=N4Ig_damaged");
        await shell.view(page, "result");
        await page.locator("#result .results-band").waitFor();
    },
    // From Phase 4: no list of databases, so an empty database: the band, and what to do next
    "empty-database": async (page) => {
        await page.route(/\/datasets\/manifest\.json(\?.*)?$/, (route) => route.abort());
        await shell.open(page, "./");
        await shell.view(page, "result");
        await page.locator("#result .results-empty-links").waitFor();
    },
    // From Phase 4: Copy link's toast, and its popover when the browser keeps the clipboard
    toast: async (page) => {
        await shell.open(page);
        await shell.run(page, RESULT_SQL);
        await shell.clipboard(page);
        await shell.action(page, "#copy-link", "#more-copy-link");
        await page.locator("#toast-region .toast").waitFor();
    },
    "link-popover": async (page) => {
        await shell.open(page);
        await shell.run(page, RESULT_SQL);
        await shell.clipboard(page, { refuse: true });
        await shell.action(page, "#copy-link", "#more-copy-link");
        await page.locator("#copy-link-popover").waitFor({ state: "visible" });
    },
    "schema-expanded": async (page) => {
        await shell.open(page);
        await shell.drawer(page);
        await page.getByRole("button", { name: "Columns of table products", exact: true }).click();
        await page.locator("#schema .schema-column").first().waitFor();
    },
    "menu-database": async (page) => {
        await shell.open(page);
        await shell.menu(page, "#database-button", "#database-menu");
    },
    "menu-export": async (page) => {
        await shell.open(page);
        await shell.run(page, RESULT_SQL);
        await shell.menu(page, "#export-button", "#export-menu");
    },
    "menu-theme": async (page) => {
        await shell.open(page);
        await shell.menu(page, "#theme-button", "#theme-menu");
    },
    "menu-help": async (page) => {
        await shell.open(page);
        await shell.menu(page, "#help-button", "#help-popover");
    },
    // the menu lists the sets of exercises/; this state shows it with one set (the one the recipes
    // use) whatever else ships, so that its baseline does not change when a set is added
    "menu-exercise-set": async (page) => {
        await page.route(/\/exercises\/(index\.html)?(\?.*)?$/, (route) =>
            route.fulfill({
                status: 200,
                contentType: "text/html",
                body: `<!DOCTYPE HTML><html><body><ul><li><a href="${EXERCISE.set}.json">${EXERCISE.set}.json</a></li></ul></body></html>`,
            })
        );
        await shell.exerciseOpen(page);
        await shell.menu(page, "#exercise-set-picker", "#exercise-set-menu");
    },
    // From Phase 3: the editor's list of names, open as a student types a table's name
    "menu-completion": async (page) => {
        await shell.open(page);
        await page.locator(EDITOR_INPUT).fill("");
        await page.locator(EDITOR_INPUT).focus();
        await page.keyboard.type("SELECT * FROM pro");
        await page.getByRole("listbox").waitFor({ state: "visible" });
    },
    history: async (page) => {
        await shell.open(page);
        await shell.run(page, "SELECT * FROM stores;");
        await shell.run(page, ERROR_SQL, "error");
        await shell.run(page, RESULT_SQL);
        await shell.drawer(page);
        await page.locator("#tab-history").click();
        await page.locator("#run-history-list button").first().waitFor();
    },
    // From Phase 4: Open from URL is a dialog (it was window.prompt)
    "open-url-dialog": async (page) => {
        await shell.open(page);
        await shell.menu(page, "#database-button", "#database-menu");
        await page.locator("#open-url").click();
        await page.locator("#open-url-dialog").waitFor({ state: "visible" });
    },
    // the same, with an address it cannot open: refused on the spot
    "open-url-error": async (page) => {
        await shell.open(page);
        await page.locator(EDITOR_INPUT).focus();
        await page.keyboard.press("Control+u");
        await page.locator("#open-url-input").fill("gist:abc123");
        await page.locator("#open-url-input").press("Enter");
        await page.locator("#open-url-error").waitFor({ state: "visible" });
    },
    "evidence-dialog": async (page) => {
        await shell.open(page);
        await shell.run(page, RESULT_SQL);
        if (await shell.more(page)) {
            await page.locator("#more-export-evidence").click();
        } else {
            await page.locator("#export-button").click();
            await page.locator("#export-evidence").click();
        }
        await page.locator("#evidence-dialog").waitFor({ state: "visible" });
    },
    // The assessment plan's Phase 2, behind its flag (?preview=import). The import's dialog: a file
    // that was read (the tab showing), one whose column names are on a later row, and a workbook,
    // which it cannot import yet.
    "import-dialog": async (page) => {
        await shell.open(page, `${NORTHLIGHT_URL}&preview=import`);
        await page.locator("#open-file-input").setInputFiles(["messy_sales.csv", "csv/title_rows.csv", "shopping_db.xlsx"].map(fixtureFile));
        await page.locator("#import-dialog .import-preview-table").first().waitFor({ state: "visible" });
        // every file has been looked at: the last tab says why it is not imported
        await page.locator("#import-dialog .import-refusal").waitFor({ state: "attached" });
    },
    // and the report of an import, in the results pane, once its toast has gone
    "import-report": async (page) => {
        await shell.open(page, `${NORTHLIGHT_URL}&preview=import`);
        await page.locator("#open-file-input").setInputFiles(fixtureFile("messy_sales.csv"));
        await page.locator('#import-dialog button[type="submit"]:enabled').click();
        await page.locator('#results-pane[data-state="report"]').waitFor({ state: "attached" });
        // (the toast comes a moment after the report: it is waited for, and then for its going, so that
        // a toast that has not come yet is not taken for one that has gone)
        await page.locator("#toast-region .toast").waitFor({ state: "visible" });
        await page.locator("#toast-region .toast").waitFor({ state: "detached" });
    },
    // a file over 50 MB asks before it is read, in its tab: read it, or leave it out (the file is
    // made in the page, of zeros, and dropped there: no bytes travel)
    "import-warning": async (page) => {
        await shell.open(page, `${NORTHLIGHT_URL}&preview=import`);
        await page.evaluate(() => {
            const data = new DataTransfer();
            data.items.add(new File([new Uint8Array(50 * 1024 * 1024 + 1)], "sales_2025_export.csv"));
            for (const type of ["dragover", "drop"]) {
                document.body.dispatchEvent(new DragEvent(type, { dataTransfer: data, bubbles: true, cancelable: true }));
            }
        });
        await page.locator("#import-dialog .import-warning").waitFor({ state: "visible" });
    },
    // while an import runs the dialog shows its progress, with Cancel alone. The import is held
    // at its first step: the reader the preview loaded is taken away, and the request for it is
    // never answered.
    "import-progress": Object.assign(
        async (page) => {
            await shell.open(page, `${NORTHLIGHT_URL}&preview=import`);
            await page.locator("#open-file-input").setInputFiles(fixtureFile("messy_sales.csv"));
            const submit = page.locator('#import-dialog button[type="submit"]:enabled');
            await submit.waitFor();
            await page.route(/\/vendor\/papaparse\.min\.js(\?.*)?$/, () => {});
            await page.evaluate(() => {
                delete window.Papa;
            });
            await submit.click();
            await page.locator("#import-dialog .import-progress").waitFor({ state: "visible" });
        },
        { busy: true }
    ),
    // The assessment plan's Phase 5, behind its flags (?preview=import,excel-import). A workbook of
    // several sheets (two of them hidden) chosen with a text file: the workbook's tab on show, with
    // its first sheet; a hidden sheet on show, beside a sheet that holds no values; the question that
    // a very large .xls adds a sentence to; and the report of two workbooks imported together.
    "import-workbook": async (page) => {
        await shell.open(page, `${NORTHLIGHT_URL}&preview=import,excel-import`);
        await page.locator("#open-file-input").setInputFiles(["excel/messy_course_workbook.xlsx", "messy_sales.csv"].map(fixtureFile));
        await workbookShown(page);
    },
    "import-workbook-sheet": async (page) => {
        await shell.open(page, `${NORTHLIGHT_URL}&preview=import,excel-import`);
        await page.locator("#open-file-input").setInputFiles({
            name: "term_marks.xlsx",
            mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            buffer: termMarksWorkbook(),
        });
        await workbookShown(page);
        // the hidden sheet's tab (its words begin with the sheet's name)
        await page.locator('#import-dialog [role="tab"]').filter({ hasText: /^Resit marks/ }).click();
        await page.locator("#import-dialog .import-sheet-note:visible").waitFor();
    },
    "import-workbook-warning": async (page) => {
        const { EXCEL_HEAVY_BYTES } = await import(pathToFileURL(path.join(__dirname, "..", "js", "lab", "config-workflow.js")).href);
        await shell.open(page, `${NORTHLIGHT_URL}&preview=import,excel-import`);
        await page.evaluate((size) => {
            // the eight bytes that begin an old Excel file, and zeros: the question comes from the size
            const head = new Uint8Array([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]);
            const data = new DataTransfer();
            data.items.add(new File([head, new Uint8Array(size + 1 - head.length)], "enrolment_history.xls"));
            for (const type of ["dragover", "drop"]) {
                document.body.dispatchEvent(new DragEvent(type, { dataTransfer: data, bubbles: true, cancelable: true }));
            }
        }, EXCEL_HEAVY_BYTES);
        await page.locator("#import-dialog .import-warning").waitFor({ state: "visible" });
    },
    "import-report-workbook": async (page) => {
        await shell.open(page, `${NORTHLIGHT_URL}&preview=import,excel-import`);
        await page.locator("#open-file-input").setInputFiles(["excel/formats.xlsx", "excel/formulas_uncached.xlsx"].map(fixtureFile));
        await workbookShown(page);
        await page.locator('#import-dialog button[type="submit"]:enabled').click();
        await page.locator('#results-pane[data-state="report"]').waitFor({ state: "attached" });
        // (the toast comes a moment after the report: it is waited for, and then for its going)
        await page.locator("#toast-region .toast").waitFor({ state: "visible" });
        await page.locator("#toast-region .toast").waitFor({ state: "detached" });
        // The report is longer than the pane: the first table's note of a zero-padded column is some
        // 380 px down, and the paragraph of formula cells that came out empty, in the last table, 950 px
        // further, so that no scroll shows both in the window of the matrix. The picture is of the end
        // of the report: the last table, its source, "sheet Calc", and that paragraph.
        await page.locator("#results-pane .import-report-formulas").waitFor({ state: "attached" });
        await page.locator("#results-pane .sqlime-result").evaluate((pane) => {
            pane.scrollTop = pane.scrollHeight;
        });
    },
    // The assessment plan's Phase 3, behind its flag (?preview=export). The dialog that saves tables
    // and views as CSV, with the owner's database of edge cases (tests/fixtures/export/): the list,
    // counted, with some rows ticked (the pair whose file names collide among them: the second says
    // where it is saved); then the dialog while an export runs, held at the request for the zip tool,
    // which is never answered; then the note that an export that held a BLOB ends with (the line that
    // says what the dialog is for is not on show beside the note; in the other two it is).
    "export-dialog": async (page) => {
        await exportDialog(page);
        await tickRows(page, ["basic", "sales/2024", "sales_2024", "v_basic_summary"]);
        // every count has ended (Export is on) and the line says what it will save
        await page.locator('#export-tables-submit[aria-disabled="false"]').waitFor();
    },
    "export-progress": Object.assign(
        async (page) => {
            await exportDialog(page);
            await tickRows(page, ["basic", "dates_iso", "sales_2024"]);
            await page.locator('#export-tables-submit[aria-disabled="false"]').waitFor();
            await page.route(/\/vendor\/fflate\.min\.js(\?.*)?$/, () => {});
            await page.locator("#export-tables-submit").click();
            await page.locator("#export-tables-dialog .tables-progress").waitFor({ state: "visible" });
        },
        { busy: true }
    ),
    "export-note": async (page) => {
        await exportDialog(page);
        await tickRows(page, ["mixed_types"]);
        await page.locator('#export-tables-submit[aria-disabled="false"]').waitFor();
        await page.locator("#export-tables-submit").click();
        await page.locator("#export-tables-note").waitFor({ state: "visible" });
        // (the toast that says the same has come and gone, so that it is not in the picture)
        await page.locator("#toast-region .toast").waitFor({ state: "visible" });
        await page.locator("#toast-region .toast").waitFor({ state: "detached" });
    },
    "exercise-prompt": async (page) => {
        await shell.exerciseOpen(page);
    },
    "exercise-correct": async (page) => {
        await shell.exerciseOpen(page);
        await shell.check(page, CORRECT_SQL);
        await page.locator("#exercise-feedback .verdict--pass").waitFor();
    },
    "exercise-wrong": async (page) => {
        await shell.exerciseOpen(page);
        await shell.check(page, WRONG_SQL);
        await page.locator("#exercise-feedback table").first().waitFor();
    },
    // From Phase 5: both hints of the exercise shown, under the prompt
    "exercise-hints": async (page) => {
        await shell.exerciseOpen(page);
        const button = page.locator("#exercise-hint-button");
        await button.click();
        await button.click();
        await page.locator("#exercise-hints li").nth(1).waitFor();
    },
    // a wrong answer that is not a row of difference (one column where two are expected): the
    // banner alone, with the checker's message
    "exercise-not-quite": async (page) => {
        await shell.exerciseOpen(page);
        await shell.check(page, "SELECT DISTINCT category FROM products ORDER BY category;");
        await page.locator("#exercise-feedback .verdict--fail").waitFor();
    },
    // Check with nothing in the editor: a note, and nothing runs
    "exercise-no-query": async (page) => {
        await shell.exerciseOpen(page);
        await shell.check(page, "");
        await page.locator("#exercise-feedback").filter({ hasText: "Write a query first" }).waitFor();
    },
    // From Phase 6: the sidebar as a drawer, open (under 1100 px; a wider window shows the sidebar
    // in its place)
    drawer: async (page) => {
        await shell.open(page);
        await shell.drawer(page);
    },
    // From Phase 6: the mockup's result at the text size for a projector (20 px)
    "text-size": async (page) => {
        await page.addInitScript(() => localStorage.setItem("sqllab.textSize", "20"));
        await shell.open(page);
        await shell.run(page, RESULT_SQL);
    },
    // From Phase 6: the About page
    about: async (page) => {
        await page.goto("./about.html");
        await page.locator("main h1").waitFor();
    },
    // From Phase 6: the evidence check page as it opens (it shares About's look, css/article.css)
    verify: async (page) => {
        await page.goto("./verify.html");
        await page.locator("main h1").waitFor();
        await page.locator("header [data-app-name]").filter({ hasText: /\S/ }).waitFor();
    },
    // the last exercise of the set passed: the set is complete, and no next exercise is offered
    "exercise-complete": async (page) => {
        await page.addInitScript(
            ({ key, passed }) => {
                if (!localStorage.getItem(key)) {
                    localStorage.setItem(key, JSON.stringify({ v: 1, passed, drafts: {} }));
                }
            },
            {
                key: `sqllab.progress.${EXERCISE.set}`,
                passed: Object.fromEntries(
                    ["e01", "e02", "e03", "e04", "e06", "e07", "e08", "e09", "e10"].map((id) => [id, true])
                ),
            }
        );
        await shell.exerciseOpen(page);
        await shell.check(page, CORRECT_SQL);
        await page.locator("#exercise-feedback").filter({ hasText: "exercises complete" }).waitFor();
    },
};

// the dialog has read every workbook it was given: no tab is still reading, and a table is on show
async function workbookShown(page) {
    await page.waitForFunction(() => document.querySelector("#import-dialog") && !document.querySelector("#import-dialog .import-reading"));
    await page.locator("#import-dialog .import-sheet-panel:visible .import-preview-table").first().waitFor({ state: "visible" });
}

// A workbook of the sheets a teacher keeps for a class: the marks, a hidden sheet of resit marks, and
// a sheet with nothing in it. Nothing in it changes from one run to the next.
function termMarksWorkbook() {
    const book = XLSX.utils.book_new();
    const sheets = [
        ["Term marks", [["student_id", "name", "maths", "science", "english"], [101, "Amara Okafor", 72, 65, 80], [102, "Ben Lindqvist", 58, 70, 61], [103, "Chen Wei", 91, 88, 79], [104, "Dalia Haddad", 66, 59, 74], [105, "Emil Novak", 83, 77, 68]], 0],
        ["Resit marks", [["student_id", "subject", "mark", "resat_on"], [102, "maths", 63, "2025-06-12"], [104, "science", 64, "2025-06-12"], [107, "english", 55, "2025-06-13"]], 1],
        ["Notes", [], 0],
        ["Rooms", [["room", "seats"], ["A12", 30], ["B03", 24]], 0],
    ];
    for (const [name, rows] of sheets) {
        XLSX.utils.book_append_sheet(book, XLSX.utils.aoa_to_sheet(rows), name);
    }
    book.Workbook = { Sheets: sheets.map(([, , hidden]) => ({ Hidden: hidden })) };
    return Buffer.from(XLSX.write(book, { bookType: "xlsx", type: "buffer" }));
}


// The dialog of the export of tables (flag "export"): the owner's database of edge cases is
// opened as a file, and the Export menu's entry (the More menu's on a phone) is chosen.
async function exportDialog(page) {
    await shell.open(page, `${NORTHLIGHT_URL}&preview=export`);
    await page.locator("#open-file-input").setInputFiles(fixtureFile("export/export_edge_cases.db"));
    await page.waitForFunction(() => window.app.database.name === "export_edge_cases.db");
    // (the toast that says the database opened is not in the picture: it comes a moment after the
    // database, and goes after a few seconds)
    await page.locator("#toast-region .toast").waitFor({ state: "visible" });
    await page.locator("#toast-region .toast").waitFor({ state: "detached" });
    if (await shell.more(page)) {
        await page.locator("#more-export-tables").click();
    } else {
        await page.locator("#export-button").click();
        await page.locator("#export-tables").click();
    }
    await page.locator("#export-tables-dialog").waitFor({ state: "visible" });
}

// tickRows ticks the rows of these tables in the dialog of the export, by their exact names
async function tickRows(page, names) {
    for (const name of names) {
        const row = page.locator("#export-tables-dialog .tables-row").filter({ has: page.locator(".tables-row-name").filter({ hasText: new RegExp(`^${name.replace(/[.*+?^${}()|[\]\\/]/g, "\\$&")}$`) }) });
        await row.locator("input.tables-row-box").check();
    }
    // (ticking scrolls the list to the box that was ticked: the picture is of the dialog from its top)
    await page.locator("#export-tables-dialog .tables-body").evaluate((body) => {
        body.scrollTop = 0;
    });
}

// The theme menu (menu-theme) exists only from Phase 1; the before shots were taken without it.
const RECIPES = { legacy, shell };

module.exports = { RECIPES, RESULT_SQL, ERROR_SQL, EXERCISE, CORRECT_SQL, WRONG_SQL };
