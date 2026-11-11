// UI plan (docs/design), section 8: accessibility proof. axe-core finds no serious or critical
// violation in any state of the screenshot matrix (tests/ui-states.js), in either theme, at each of
// its window sizes; and a keyboard-only session loads the page, opens a database, runs a query and
// completes one exercise.

const AxeBuilder = require("@axe-core/playwright").default;
const { test, expect, withSampleDataset, modelQuery, tabTo, EDITOR_INPUT } = require("./helpers");
const { RECIPES } = require("./ui-states.js");

const STATES = RECIPES.shell.states;
// the window sizes of the screenshot matrix
const VIEWPORTS = [
    { name: "desktop", width: 1366, height: 768 },
    { name: "large desktop", width: 1920, height: 1080 },
    { name: "phone", width: 390, height: 844 },
];

test.describe("axe", () => {
    for (const viewport of VIEWPORTS) {
        for (const theme of ["light", "dark"]) {
            for (const [state, recipe] of Object.entries(STATES)) {
                test(`${state}, ${theme}, ${viewport.name}: no serious or critical violation`, async ({ page }) => {
                    await page.setViewportSize({ width: viewport.width, height: viewport.height });
                    await page.emulateMedia({ colorScheme: theme, reducedMotion: "reduce" });
                    await recipe(page);
                    await page.evaluate(() => document.fonts.ready);
                    const results = await new AxeBuilder({ page }).analyze();
                    const serious = results.violations
                        .filter((v) => v.impact === "serious" || v.impact === "critical")
                        .map((v) => `${v.id} (${v.impact}): ${v.help} at ${v.nodes.slice(0, 4).map((n) => n.target.join(" ")).join(" | ")}`);
                    expect(serious).toEqual([]);
                });
            }
        }
    }
});

test.describe("360 px wide", () => {
    for (const [state, recipe] of Object.entries(STATES)) {
        test(`${state}: the page never scrolls sideways`, async ({ page }) => {
            await page.setViewportSize({ width: 360, height: 740 });
            await recipe(page);
            await page.evaluate(() => document.fonts.ready);
            const widths = await page.evaluate(() => ({ page: document.documentElement.scrollWidth, window: window.innerWidth }));
            expect(widths.page).toBeLessThanOrEqual(widths.window);
        });
    }
});

test("keyboard only: load the page, open a database, run a query, complete one exercise", async ({ page, app }) => {
    await withSampleDataset(page);
    await app.open();

    // open a database: from the editor (focused after load), out with Escape, back to the
    // database switcher; its menu opens on the open database and the arrow key moves to the next
    await expect(app.editor).toBeFocused();
    await page.keyboard.press("Escape");
    expect(await tabTo(page, "#database-button", { back: true }), "Tab reaches #database-button").toBe(true);
    await page.keyboard.press("Enter");
    await expect(page.locator("#database-menu")).toBeVisible();
    await page.keyboard.press("ArrowDown");
    await expect(page.locator("#database-menu").getByRole("menuitemradio", { name: /^Sample Fruit/ })).toBeFocused();
    await page.keyboard.press("Enter");
    await expect(app.databaseLabel).toHaveText("Sample Fruit");
    await app.waitReady();

    // run a query on it
    expect(await tabTo(page, EDITOR_INPUT), "Tab reaches #editor").toBe(true);
    await page.keyboard.press("Control+A");
    await page.keyboard.type("SELECT count(*) AS n FROM fruit;");
    await page.keyboard.press("Control+Enter");
    await app.settle();
    await expect(app.status).toHaveText(/^1 row in \d+ ms$/);
    await expect(app.table).toBeVisible();

    // complete one exercise: the Exercises tab (arrow keys along the tabs), its set picker, the
    // first set, its first exercise
    await page.keyboard.press("Escape");
    expect(await tabTo(page, "#tab-schema", { back: true }), "Tab reaches #tab-schema").toBe(true);
    await page.keyboard.press("ArrowRight");
    await expect(app.tab("exercises")).toBeFocused();
    await expect(page.locator("#panel-exercises")).toBeVisible();
    expect(await tabTo(page, "#exercise-set-picker"), "Tab reaches #exercise-set-picker").toBe(true);
    await page.keyboard.press("Enter");
    await expect(app.setMenu).toBeVisible();
    await page.keyboard.press("ArrowDown");
    await page.keyboard.press("Enter");
    await expect(app.exercisePanel).toBeVisible();
    await app.waitReady();
    expect(await tabTo(page, EDITOR_INPUT), "Tab reaches #editor").toBe(true);
    await page.keyboard.press("Control+A");
    await page.keyboard.type(modelQuery("e01"));
    await page.keyboard.press("Control+Shift+Enter");
    await expect(app.feedback).toContainText("Passed");
    await expect(app.progress).toContainText("1 of 10 complete");
});
