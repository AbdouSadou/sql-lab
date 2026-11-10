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

// The interface before the redesign; Phase 1 changes no layout, so it uses these too.
const legacy = {
    async open(page, url = "./") {
        await page.goto(url);
        await page.locator("#status").filter({ hasText: READY }).waitFor();
    },
    async run(page, sql, done = DONE) {
        await page.locator("#editor").fill(sql);
        await page.locator("#editor").press("Control+Enter");
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
    // The native selects (Dataset, Exercises) open outside the page and never appear in a
    // screenshot, so the menus drawn open are the history popup and, from Phase 1, the Theme menu.
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
        await page.locator("#editor").fill(CORRECT_SQL);
        await page.locator("#exercise-check").click();
        await page.locator("#exercise-feedback").filter({ hasText: "Passed" }).waitFor();
    },
    "exercise-wrong": async (page) => {
        await legacy.states["exercise-prompt"](page);
        await page.locator("#editor").fill(WRONG_SQL);
        await page.locator("#exercise-check").click();
        await page.locator("#exercise-feedback table").first().waitFor();
    },
};

// The theme menu (menu-theme) exists only from Phase 1; the before shots were taken without it.
const RECIPES = { legacy };

module.exports = { RECIPES, RESULT_SQL, ERROR_SQL, EXERCISE, CORRECT_SQL, WRONG_SQL };
