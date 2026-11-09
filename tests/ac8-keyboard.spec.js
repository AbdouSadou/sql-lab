const { test, expect } = require("./helpers");

// The "check an exercise" half of AC8 arrives with the exercise mode.
test("AC8 a keyboard-only user can run a query and gets a real table", async ({ page, app }) => {
    await app.open();

    // No mouse: the editor already has focus after load; if not, Tab reaches it.
    if (!(await app.editor.evaluate((el) => el === document.activeElement))) {
        await page.keyboard.press("Tab");
    }
    await expect(app.editor).toBeFocused();
    // the editor holds the table preview of the default dataset: replace it
    await page.keyboard.press("Control+A");
    await page.keyboard.type("SELECT 6 * 7 AS answer;");
    await page.keyboard.press("Control+Enter");

    await expect(app.status).toContainText("1 rows, took");
    await expect(page.locator("#result table")).toHaveCount(1);
    expect(await app.read()).toEqual({ columns: ["answer"], rows: [["42"]] });
});

test("AC8 the Run button can be operated from the keyboard", async ({ page, app }) => {
    // Focus is placed on Run directly here; tests/m2-editor-keys.spec.js covers getting
    // there from the editor with Escape, Tab.
    await app.open();
    await page.keyboard.press("Control+A");
    await page.keyboard.type("SELECT 'enter' AS via;");
    await page.locator("#execute").focus();
    await page.keyboard.press("Enter");

    expect(await app.read()).toEqual({ columns: ["via"], rows: [["enter"]] });
});

test("AC8 results are a real table element with header and body cells", async ({ app }) => {
    await app.open();
    await app.query("SELECT 1 AS a, 2 AS b UNION ALL SELECT 3, 4;");
    await expect(app.result.locator("table > thead > tr > th")).toHaveCount(2);
    await expect(app.result.locator("table > tbody > tr")).toHaveCount(2);
    await expect(app.result.locator("table > tbody > tr > td")).toHaveCount(4);
});
