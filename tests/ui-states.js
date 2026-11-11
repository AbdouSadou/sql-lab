// The states of the UI plan's screenshot matrix (docs/design, section 8), as recipes that drive a
// page into each state. Shared by tools/ui-matrix.mjs (the screenshots in docs/ui/), the
// accessibility checks (tests/ui-a11y.spec.js) and, from Phase 2, the screenshot baselines.
//
// A recipe is async (page) => void and navigates with relative URLs, so the page's context needs a
// baseURL (the tests have one; tools/ui-matrix.mjs sets one). When the interface changes, the
// recipes change with it, like any other test.

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

// The interface before the redesign; Phase 1 changes no layout, so it uses these too.
const legacy = {
    async open(page, url = "./") {
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
const READY_PANE = '#results-pane:is([data-state="empty"], [data-state="result"], [data-state="done"], [data-state="error"])';

// a query whose first column holds a value longer than 60 characters (the product names, joined)
const LONG_CELL_SQL = "SELECT group_concat(product_name, ', ') AS names, COUNT(*) AS products, NULL AS discontinued FROM products;";
// a run with no result set that changes rows
const DONE_SQL = `CREATE TABLE notes (id INTEGER PRIMARY KEY, body TEXT);
INSERT INTO notes (body) VALUES ('Restock the Leeds store'), ('Call the York supplier');`;

const shell = {
    async open(page, url = "./") {
        await page.goto(url);
        await page.locator(READY_PANE).waitFor();
    },
    // run puts SQL in the editor, runs it with Ctrl+Enter, and waits until the results pane shows
    // `state` ("result", "done" or "error")
    async run(page, sql, state = "result") {
        await page.locator(EDITOR_INPUT).fill(sql);
        await page.locator(EDITOR_INPUT).press("Control+Enter");
        await page.evaluate(() => window.app.whenIdle());
        await page.locator(`#results-pane[data-state="${state}"]`).waitFor();
    },
    async menu(page, button, menu) {
        await page.locator(button).click();
        await page.locator(menu).waitFor({ state: "visible" });
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
        await page.locator(EDITOR_INPUT).fill(sql);
        await page.locator("#exercise-check").click();
    },
};

shell.states = {
    // From Phase 4 a first visit runs nothing: "no result yet" with Northlight's three samples
    "first-visit": async (page) => {
        await shell.open(page);
    },
    // after a reload the last query is back in the editor, not run
    "no-result": async (page) => {
        await shell.open(page);
        await shell.run(page, "SELECT * FROM products;");
        await page.reload();
        await page.locator(READY_PANE).waitFor();
    },
    // From Phase 4: a database on its way (its request held, so the bar waits)
    loading: Object.assign(
        async (page) => {
            await page.route(/\/datasets\/northlight_retail\.db(\?.*)?$/, () => {});
            await page.goto("./");
            await page.locator('#results-pane[data-state="loading"] .results-loading-title').filter({ hasText: "Northlight Retail" }).waitFor();
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
        await page.goto("./");
        await page.locator(".results-loading-size").filter({ hasText: / of / }).waitFor();
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
    // From Phase 4: a damaged link: the error band over "no result yet" (the default database opened)
    "load-problem": async (page) => {
        await shell.open(page, "./#s=N4Ig_damaged");
        await page.locator("#result .results-band").waitFor();
    },
    // From Phase 4: no list of databases, so an empty database: the band, and what to do next
    "empty-database": async (page) => {
        await page.route(/\/datasets\/manifest\.json(\?.*)?$/, (route) => route.abort());
        await shell.open(page);
        await page.locator("#result .results-empty-links").waitFor();
    },
    // From Phase 4: Copy link's toast, and its popover when the browser keeps the clipboard
    toast: async (page) => {
        await shell.open(page);
        await shell.run(page, RESULT_SQL);
        await shell.clipboard(page);
        await page.locator("#copy-link").click();
        await page.locator("#toast-region .toast").waitFor();
    },
    "link-popover": async (page) => {
        await shell.open(page);
        await shell.run(page, RESULT_SQL);
        await shell.clipboard(page, { refuse: true });
        await page.locator("#copy-link").click();
        await page.locator("#copy-link-popover").waitFor({ state: "visible" });
    },
    "schema-expanded": async (page) => {
        await shell.open(page);
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
    "menu-exercise-set": async (page) => {
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
        await page.locator("#export-button").click();
        await page.locator("#export-evidence").click();
        await page.locator("#evidence-dialog").waitFor({ state: "visible" });
    },
    "exercise-prompt": async (page) => {
        await shell.exerciseOpen(page);
    },
    "exercise-correct": async (page) => {
        await shell.exerciseOpen(page);
        await shell.check(page, CORRECT_SQL);
        await page.locator("#exercise-feedback").filter({ hasText: "Passed" }).waitFor();
    },
    "exercise-wrong": async (page) => {
        await shell.exerciseOpen(page);
        await shell.check(page, WRONG_SQL);
        await page.locator("#exercise-feedback table").first().waitFor();
    },
};

// The theme menu (menu-theme) exists only from Phase 1; the before shots were taken without it.
const RECIPES = { legacy, shell };

module.exports = { RECIPES, RESULT_SQL, ERROR_SQL, EXERCISE, CORRECT_SQL, WRONG_SQL };
