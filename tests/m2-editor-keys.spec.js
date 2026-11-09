const { test, expect } = require("./helpers");

test("editor keys: Tab alone still indents and keeps focus in the editor", async ({ page, app }) => {
    await app.openEmpty();
    await app.editor.click();
    await page.keyboard.type("select");
    await page.keyboard.press("Tab");
    await page.keyboard.type("1");
    await expect(app.editor).toBeFocused();
    // two spaces (a non-breaking space would break SQL, so match plain spaces only)
    expect(await app.editor.innerText()).toBe("select  1");
});

test("editor keys: Escape then Tab leaves the editor and reaches Run", async ({ page, app }) => {
    await app.openEmpty();
    await app.editor.click();
    await page.keyboard.type("SELECT 3 AS three;");
    await page.keyboard.press("Escape");
    await page.keyboard.press("Tab");
    await expect(app.editor).not.toBeFocused();
    await expect(page.locator("#execute")).toBeFocused();
    expect(await app.editor.innerText()).toBe("SELECT 3 AS three;"); // nothing was indented

    // the whole journey without a mouse: write, leave, press Run
    await page.keyboard.press("Enter");
    expect(await app.read()).toEqual({ columns: ["three"], rows: [["3"]] });
});

test("editor keys: Escape then Shift+Tab leaves the editor backwards", async ({ page, app }) => {
    await app.openEmpty();
    await app.editor.click();
    await page.keyboard.type("SELECT 1;");
    await page.keyboard.press("Escape");
    await page.keyboard.press("Shift+Tab");
    await expect(app.editor).not.toBeFocused();
    await expect(page.locator("#execute")).not.toBeFocused();
    expect(await app.editor.innerText()).toBe("SELECT 1;");
});

test("editor keys: Escape does not stay armed after another key", async ({ page, app }) => {
    await app.openEmpty();
    await app.editor.click();
    await page.keyboard.press("Escape");
    await page.keyboard.type("a");
    await page.keyboard.press("Tab");
    await expect(app.editor).toBeFocused();
    expect(await app.editor.innerText()).toBe("a  ");
});

test("editor keys: an Escape from an earlier visit does not leak into the next one", async ({ page, app }) => {
    await app.open();
    await app.editor.click();
    await page.keyboard.press("Escape");
    await page.locator("#db-name").focus();
    await app.editor.click();
    await page.keyboard.press("Tab");
    await expect(app.editor).toBeFocused();
});

test("editor keys: the way out is announced to assistive technology", async ({ page, app }) => {
    await app.open();
    await expect(app.editor).toHaveAttribute("aria-describedby", "editor-hint");
    await expect(app.editor).toHaveAccessibleDescription(/Press Tab to indent.*Escape, then Tab or Shift\+Tab/);
    await expect(app.editor).toHaveAccessibleName("SQL query");
    await expect(app.editor).toHaveRole("textbox");
});

test("editor keys: Ctrl+Enter still runs the query from the editor", async ({ app }) => {
    await app.open();
    expect(await app.query("SELECT 5 AS five;")).toEqual({ columns: ["five"], rows: [["5"]] });
});
