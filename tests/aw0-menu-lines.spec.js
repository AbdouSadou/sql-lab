const { test, expect, flagState } = require("./helpers");

// The two actions of the database menu say what they take, under their names. Where the menu is
// narrower than the line, it wraps (css/menu.css), and the rule that draws it in lines of about the
// same length (text-wrap: balance) is what keeps a word from being left alone on a line of its own:
// without it "web", "file" or "device" came last on a line of its own at some widths. tests/
// aw0-states.spec.js, tests/aw0-shipped.spec.js and tests/ui6-responsive.spec.js hold that the lines
// are whole; this holds how a wrapped line is broken. A browser that does not know the property
// draws the line as it always did, and is not asked for more.

// the lines a text is drawn on, each as the words on it
const drawnLines = (line) =>
    line.evaluate((node) => {
        const text = node.firstChild;
        const lines = [];
        let top = null;
        for (const word of text.textContent.matchAll(/\S+/g)) {
            const range = document.createRange();
            range.setStart(text, word.index);
            range.setEnd(text, word.index + word[0].length);
            const at = Math.round(range.getBoundingClientRect().top);
            if (at !== top) {
                lines.push([]);
                top = at;
            }
            lines[lines.length - 1].push(word[0]);
        }
        return lines;
    });

// each case is a state of the flags, a width at which the named lines wrap in it, and which lines
const CASES = [
    ["both imports", flagState("import", "excel-import"), 280, ["#open-file", "#open-url"]],
    ["both imports", flagState("import", "excel-import"), 300, ["#open-file", "#open-url"]],
    ["both imports", flagState("import", "excel-import"), 320, ["#open-file"]],
    ["the import alone", flagState("import"), 280, ["#open-file", "#open-url"]],
    ["every flag off", flagState(), 290, ["#open-file", "#open-url"]],
    ["every flag off", flagState(), 360, ["#open-file"]],
    ["every flag off", flagState(), 400, ["#open-file"]],
];

test.describe("a wrapped line under an action of the database menu leaves no word alone", () => {
    for (const [state, flags, width, ids] of CASES) {
        test(`${state}, ${width} px wide: ${ids.join(" and ")}`, async ({ page, app }) => {
            await page.setViewportSize({ width, height: 740 });
            await app.open(`./?${flags}`);
            const balances = await page.evaluate(() => CSS.supports("text-wrap", "balance"));
            test.skip(!balances, "this browser does not know text-wrap: balance");
            await app.databaseButton.click();
            await expect(app.databaseMenu).toBeVisible();
            for (const id of ids) {
                const line = app.databaseMenu.locator(`${id} .menu-item-description`);
                await expect(line).toHaveCount(1);
                const lines = await drawnLines(line);
                // (the case is about a line that wraps: if it is one line here, the width is wrong)
                expect(lines.length, `${id} at ${width} px: ${JSON.stringify(lines)}`).toBeGreaterThan(1);
                for (const words of lines) {
                    expect(words.length, `${id} at ${width} px: ${JSON.stringify(lines)}`).toBeGreaterThan(1);
                }
            }
        });
    }
});
