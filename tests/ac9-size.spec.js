const { test, expect } = require("./helpers");

const BUDGET = 3 * 1000 * 1000;

test("AC9 initial load transfers at most 3 MB excluding datasets/", async ({ page, app, net }) => {
    await app.open();
    await page.waitForLoadState("networkidle");

    // Sum of uncompressed body sizes: the worst case, since Pages also compresses text.
    const bytes = await net.bytes({ exclude: /^datasets\// });
    expect(bytes, `initial load was ${bytes} bytes`).toBeGreaterThan(1_000_000);
    expect(bytes).toBeLessThanOrEqual(BUDGET);
});
