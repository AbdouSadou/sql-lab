const { test, expect, editorValue } = require("./helpers");

// Every test runs against both editors: CodeMirror (the editor since the UI plan's Phase 3) and the
// plain editable box that stays when vendor/editor.js does not load (js/components/sqlime-editor.js:
// its handleIndent and handleExecute, and js/lab/editor-keys.js, are what it runs on).
const EDITORS = [
    { label: "CodeMirror", plain: false },
    { label: "plain editor", plain: true },
];

// opens the page as app.open() (or app.openEmpty()) does, in the given editor
async function openIn(page, app, { plain }, { empty = false } = {}) {
    if (plain) {
        await page.route("**/vendor/editor.js", (route) => route.abort());
    }
    await (empty ? app.openEmpty() : app.open());
    await expect(page.locator("#editor")).toHaveAttribute("data-editor", plain ? "plain" : "code");
}

for (const mode of EDITORS) {
    test(`editor keys: Tab alone still indents and keeps focus in the editor, ${mode.label}`, async ({ page, app }) => {
        await openIn(page, app, mode, { empty: true });
        await app.editor.click();
        await page.keyboard.type("select");
        await page.keyboard.press("Tab");
        await page.keyboard.type("1");
        await expect(app.editor).toBeFocused();
        // two spaces (a non-breaking space would break SQL, so match plain spaces only)
        expect(await editorValue(page)).toBe("select  1");
    });

    // Run sits above the editor now (the editor toolbar comes before the editor in the Tab order), and
    // the splitter between the query and its result comes after it.
    test(`editor keys: Escape then Tab leaves the editor forwards, to the splitter below it, ${mode.label}`, async ({ page, app }) => {
        await openIn(page, app, mode, { empty: true });
        await app.editor.click();
        await page.keyboard.type("SELECT 3 AS three;");
        await page.keyboard.press("Escape");
        await page.keyboard.press("Tab");
        await expect(app.editor).not.toBeFocused();
        await expect(page.locator("#execute")).not.toBeFocused();
        await expect(page.locator("#editor-splitter")).toBeFocused();
        expect(await editorValue(page)).toBe("SELECT 3 AS three;"); // nothing was indented
    });

    test(`editor keys: Escape then Shift+Tab leaves the editor backwards, to Run, ${mode.label}`, async ({ page, app }) => {
        await openIn(page, app, mode, { empty: true });
        await app.editor.click();
        await page.keyboard.type("SELECT 3 AS three;");
        await page.keyboard.press("Escape");
        await page.keyboard.press("Shift+Tab");
        await expect(app.editor).not.toBeFocused();
        await expect(page.locator("#execute")).toBeFocused();
        await expect(page.locator("#editor-splitter")).not.toBeFocused();
        expect(await editorValue(page)).toBe("SELECT 3 AS three;");

        // the whole journey without a mouse: write, leave, press Run
        await page.keyboard.press("Enter");
        expect(await app.read()).toEqual({ columns: ["three"], rows: [["3"]] });
    });

    test(`editor keys: Escape does not stay armed after another key, ${mode.label}`, async ({ page, app }) => {
        await openIn(page, app, mode, { empty: true });
        await app.editor.click();
        await page.keyboard.press("Escape");
        await page.keyboard.type("a");
        await page.keyboard.press("Tab");
        await expect(app.editor).toBeFocused();
        expect(await editorValue(page)).toBe("a  ");
    });

    test(`editor keys: an Escape from an earlier visit does not leak into the next one, ${mode.label}`, async ({ page, app }) => {
        await openIn(page, app, mode);
        await app.editor.click();
        await page.keyboard.press("Escape");
        await page.locator("#database-button").focus();
        await app.editor.click();
        await page.keyboard.press("Tab");
        await expect(app.editor).toBeFocused();
    });

    test(`editor keys: the way out is announced to assistive technology, ${mode.label}`, async ({ page, app }) => {
        await openIn(page, app, mode);
        await expect(app.editor).toHaveAttribute("aria-describedby", "editor-hint");
        await expect(app.editor).toHaveAccessibleDescription(/Press Tab to indent.*Escape, then Tab or Shift\+Tab/);
        await expect(app.editor).toHaveAccessibleName("SQL query");
        await expect(app.editor).toHaveRole("textbox");
    });

    test(`editor keys: Ctrl+Enter still runs the query from the editor, ${mode.label}`, async ({ page, app }) => {
        await openIn(page, app, mode);
        expect(await app.query("SELECT 5 AS five;")).toEqual({ columns: ["five"], rows: [["5"]] });
    });
}

// What differs on purpose (UI plan, Phase 3): CodeMirror outdents with Shift+Tab, where the plain
// box, unchanged, inserts two spaces for Shift+Tab as for Tab. Both keep the focus in the editor.
test("editor keys: Shift+Tab without Escape keeps the focus in the plain editor and inserts two spaces", async ({ page, app }) => {
    await openIn(page, app, EDITORS[1], { empty: true });
    await app.editor.click();
    await page.keyboard.type("a");
    await page.keyboard.press("Shift+Tab");
    await expect(app.editor).toBeFocused();
    expect(await editorValue(page)).toBe("a  ");
});

test("editor keys: Shift+Tab without Escape keeps the focus in CodeMirror and outdents the line", async ({ page, app }) => {
    await openIn(page, app, EDITORS[0], { empty: true });
    await app.editor.click();
    await page.keyboard.type("  a");
    await page.keyboard.press("Shift+Tab");
    await expect(app.editor).toBeFocused();
    expect(await editorValue(page)).toBe("a");
});
