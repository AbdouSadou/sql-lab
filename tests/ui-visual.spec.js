// UI plan (docs/design), section 8: screenshot baselines from Phase 2 onward. Each state of the
// screenshot matrix (tests/ui-states.js) is compared with its baseline in
// tests/ui-visual.spec.js-snapshots/, at the three window sizes of the matrix, in both themes. The
// baselines are Linux renderings (Playwright suffixes them -linux); another platform writes its
// own on a first run. A phase that changes the look on purpose updates the baselines with
//   npx playwright test tests/ui-visual.spec.js --project=chromium-root --update-snapshots
// and the before/after pairs of its PR show why.
//
// Chromium at the root mount only (playwright.config.js leaves this file out of the other
// projects): one rendering engine is enough to catch a layout that moved, and fonts render
// differently from one engine to the next. What changes from run to run (how long a query took,
// when it ran: .status-time and .run-history-time) is given one value before the shot.

const { test, expect } = require("./helpers");
const { RECIPES } = require("./ui-states.js");

const STATES = RECIPES.shell.states;
// the matrix of plan section 8: three window sizes, two themes, every state
const VIEWPORTS = [
    { width: 1366, height: 768 },
    { width: 1920, height: 1080 },
    { width: 390, height: 844 },
];

async function settle(page) {
    await page.evaluate(() => document.fonts.ready);
    // the switcher's sizes come from a HEAD request after the menu opens
    await page.waitForLoadState("networkidle");
    // What differs from one run to the next (how long a query took, when it ran) is given one
    // value, so that everything else, the rest of each line included, is compared as it is.
    await page.evaluate(() => {
        for (const el of document.querySelectorAll(".status-time")) {
            el.textContent = "3 ms";
        }
        for (const el of document.querySelectorAll(".run-history-time")) {
            el.textContent = "2026-01-01 12:00:00 UTC";
        }
    });
}

for (const viewport of VIEWPORTS) {
    for (const theme of ["light", "dark"]) {
        test.describe(`${viewport.width}x${viewport.height}, ${theme}`, () => {
            for (const [state, recipe] of Object.entries(STATES)) {
                test(state, async ({ page }) => {
                    await page.setViewportSize(viewport);
                    await page.emulateMedia({ colorScheme: theme, reducedMotion: "reduce" });
                    await recipe(page);
                    await settle(page);
                    // a few pixels of slack for anti-aliasing, no more: a restyled line of text
                    // changes hundreds
                    await expect(page).toHaveScreenshot(`${state}--${viewport.width}x${viewport.height}--${theme}.png`, {
                        maxDiffPixels: 40,
                    });
                });
            }
        });
    }
}
