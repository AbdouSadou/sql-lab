// UI plan (docs/design), section 8: accessibility proof. axe-core finds no serious or critical
// violation in any state of the screenshot matrix (tests/ui-states.js), in either theme, at desktop
// and phone width; and a keyboard-only session loads the page, opens a database, runs a query and
// completes one exercise.

const AxeBuilder = require("@axe-core/playwright").default;
const { test, expect, withSampleDataset, modelQuery } = require("./helpers");
const { RECIPES } = require("./ui-states.js");

const STATES = RECIPES.legacy.states;
const VIEWPORTS = [
    { name: "desktop", width: 1366, height: 768 },
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

// Press Tab (or Shift+Tab) until the focused element matches `selector`; keys only.
async function tabTo(page, selector, { back = false, max = 40 } = {}) {
    for (let i = 0; i < max; i++) {
        if (await page.evaluate((s) => document.activeElement?.matches(s) ?? false, selector)) {
            return;
        }
        await page.keyboard.press(back ? "Shift+Tab" : "Tab");
    }
    throw new Error(`Tab never reached ${selector}`);
}

test("keyboard only: load the page, open a database, run a query, complete one exercise", async ({ page, app }) => {
    await withSampleDataset(page);
    await app.open();

    // open a database: from the editor (focused after load), out with Escape, back to the Dataset
    // picker, and the arrow key chooses the next database
    await expect(app.editor).toBeFocused();
    await page.keyboard.press("Escape");
    await tabTo(page, "#dataset-picker", { back: true });
    await page.keyboard.press("ArrowDown");
    await expect(page.locator("#db-name")).toContainText("sample.db");
    await app.waitReady();

    // run a query on it
    await tabTo(page, "#editor");
    await page.keyboard.press("Control+A");
    await page.keyboard.type("SELECT count(*) AS n FROM fruit;");
    await page.keyboard.press("Control+Enter");
    await expect(app.status).toContainText(/1 row, took/);
    await expect(app.table).toBeVisible();

    // complete one exercise: the Exercises picker, the first set, its first exercise
    await page.keyboard.press("Escape");
    await tabTo(page, "#exercise-set-picker", { back: true });
    await page.keyboard.press("ArrowDown");
    await expect(app.exercisePanel).toBeVisible();
    await app.waitReady();
    await tabTo(page, "#editor");
    await page.keyboard.press("Control+A");
    await page.keyboard.type(modelQuery("e01"));
    await page.keyboard.press("Control+Shift+Enter");
    await expect(app.feedback).toContainText("Passed");
    await expect(app.progress).toContainText("1/10 complete");
});
