// UI plan, Phase 6: responsive, accessibility and polish (docs/design/SQL Lab UI and UX Plan.md,
// sections 6 and 7). The breakpoints of section 6: from 1100 px the three panes; from 700 to 1099
// px the sidebar is a drawer over the page, opened from the top bar (js/lab/layout.js), and the
// editor and result split stays; under 700 px one column, the query and its result two views
// (Editor and Result, a run showing the result), the top bar's actions folded into a More menu
// (js/lab/more-menu.js), and Run in a bar at the foot (docs/design/mockup/phone.html). The
// text-size control (js/lab/text-size.js): the SQL and the results from 12 to 24 px, remembered,
// and the plan's projector check. Reduced motion; the About page in the app's look (about.html,
// css/article.css, js/lab/static-page.js); the favicon set (tools/build-favicons.mjs); and the link
// preview's tags and the web manifest, written at deploy from SITE_URL (tools/site-meta.mjs).

const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { execFileSync } = require("node:child_process");
const { pathToFileURL } = require("node:url");
const { test, expect, App, NORTHLIGHT_URL, EDITOR_INPUT, editorValue, failStorage, modelQuery, realSet, tabTo } = require("./helpers");
const { EXERCISE, CORRECT_SQL, WRONG_SQL } = require("./ui-states.js");

const ROOT = path.join(__dirname, "..");
const read = (file) => fs.readFileSync(path.join(ROOT, file), "utf8");
const CONFIG = read("js/lab/config.js");
const APP_NAME = /export const APP_NAME = "([^"]*)"/.exec(CONFIG)[1];
const SET = realSet();

const TABLET = { width: 1024, height: 768 };
const PHONE = { width: 390, height: 844 };

const rounded = (box) => Object.fromEntries(Object.entries(box).map(([k, v]) => [k, Math.round(v)]));
const noSidewaysScroll = (page) => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth);
const fontSize = (locator) => locator.first().evaluate((el) => getComputedStyle(el).fontSize);

// ---- the drawer, from 700 to 1099 px -------------------------------------------------------------

test.describe("the drawer, from 700 to 1099 px", () => {
    test("the sidebar is shut, its button opens it over the page at the left, and the editor and the result keep their split", async ({ page, app }) => {
        await page.setViewportSize(TABLET);
        await app.open();
        const button = app.sidebarButton;
        await expect(button).toBeVisible();
        await expect(button).toHaveAccessibleName("Sidebar");
        await expect(button).toHaveAttribute("aria-controls", "sidebar");
        await expect(button).toHaveAttribute("aria-expanded", "false");
        await expect(page.locator("#sidebar")).toBeHidden();
        await expect(page.locator("#sidebar-splitter")).toBeHidden();
        // section 6: "the editor and results split stays", and the top bar keeps its actions
        for (const selector of ["#editor-pane", "#editor-splitter", "#results-pane", "#copy-link", "#export-button", "#theme-button", "#help-button"]) {
            await expect(page.locator(selector), selector).toBeVisible();
        }
        for (const selector of ["#more-button", "#view-switch"]) {
            await expect(page.locator(selector), selector).toBeHidden();
        }
        // the editor has the window's width: nothing is beside it
        const editor = rounded(await page.locator("#editor-pane").boundingBox());
        expect(editor.x).toBe(0);
        expect(editor.width).toBe(TABLET.width);

        await button.click();
        await expect(page.locator("#sidebar")).toBeVisible();
        await expect(button).toHaveAttribute("aria-expanded", "true");
        // the focus goes in, on the tab that shows
        await expect(page.locator("#tab-schema")).toBeFocused();
        // over the page, at its left edge, the window's height; the page under it has not moved
        expect(rounded(await page.locator("#sidebar").boundingBox())).toEqual({ x: 0, y: 0, width: 320, height: TABLET.height });
        expect(rounded(await page.locator("#editor-pane").boundingBox())).toEqual(editor);
        expect(await noSidewaysScroll(page)).toBe(true);
        // a scrim over the page beside it (the drawer's backdrop)
        const scrim = await page.locator("#sidebar").evaluate((el) => getComputedStyle(el, "::backdrop").backgroundColor);
        expect(scrim).not.toBe("rgba(0, 0, 0, 0)");
        // a pane, edged by a 1 px rule: no shadow (section 3: only menus, dialogs and toasts cast one)
        expect(await page.locator("#sidebar").evaluate((el) => [getComputedStyle(el).boxShadow, getComputedStyle(el).borderRightWidth])).toEqual(["none", "1px"]);

        // its Close button closes it; the focus goes back to the Sidebar button
        const close = page.locator("#sidebar-close");
        await expect(close).toBeVisible();
        await expect(close).toHaveAccessibleName("Close");
        await close.click();
        await expect(page.locator("#sidebar")).toBeHidden();
        await expect(button).toHaveAttribute("aria-expanded", "false");
        await expect(button).toBeFocused();
    });

    test("Escape, and a press on the page around it, close it; the focus goes back to its button", async ({ page, app }) => {
        await page.setViewportSize(TABLET);
        await app.open();
        const button = app.sidebarButton;
        await button.click();
        await expect(page.locator("#tab-schema")).toBeFocused();
        await page.keyboard.press("Escape");
        await expect(page.locator("#sidebar")).toBeHidden();
        await expect(button).toBeFocused();
        await expect(button).toHaveAttribute("aria-expanded", "false");

        // a press on the page beside it: shut, and what was under the press was not pressed
        await button.click();
        await expect(page.locator("#tab-schema")).toBeFocused();
        await page.mouse.click(700, 400);
        await expect(page.locator("#sidebar")).toBeHidden();
        await expect(button).toHaveAttribute("aria-expanded", "false");
        await expect(button).toBeFocused();
    });

    test("from the keyboard: Enter opens it on its tab; Shift+Tab goes back to its button; Tab past its end closes it", async ({ page, app }) => {
        await page.setViewportSize(TABLET);
        await app.open();
        const button = app.sidebarButton;
        await button.focus();
        await page.keyboard.press("Enter");
        await expect(page.locator("#tab-schema")).toBeFocused();
        // its own order: the tabs (one stop), Close, then the tab's panel
        await page.keyboard.press("Tab");
        await expect(page.locator("#sidebar-close")).toBeFocused();
        await page.keyboard.press("Shift+Tab");
        await expect(page.locator("#tab-schema")).toBeFocused();
        // before it, its button: the drawer stays open there, and Enter on it shuts it
        await page.keyboard.press("Shift+Tab");
        await expect(button).toBeFocused();
        await expect(page.locator("#sidebar")).toBeVisible();
        await page.keyboard.press("Enter");
        await expect(page.locator("#sidebar")).toBeHidden();
        // and Shift+Tab past its button (to the skip link, under the drawer) shuts it too: the
        // focus is never under it
        await page.keyboard.press("Enter");
        await expect(page.locator("#tab-schema")).toBeFocused();
        await page.keyboard.press("Shift+Tab");
        await expect(button).toBeFocused();
        await page.keyboard.press("Shift+Tab");
        await expect(page.locator(".skip-link")).toBeFocused();
        await expect(page.locator("#sidebar")).toBeHidden();
        await expect(button).toHaveAttribute("aria-expanded", "false");
        await button.focus();

        // Tab from its last control: the focus leaves it, and it closes behind the focus
        await page.keyboard.press("Enter");
        await expect(page.locator("#tab-schema")).toBeFocused();
        const stops = await page.evaluate(() => {
            const all = [...document.querySelectorAll("#sidebar button, #sidebar a[href], #sidebar input, #sidebar [tabindex]")].filter(
                (el) => el.tabIndex >= 0 && el.getClientRects().length
            );
            all.at(-1).setAttribute("data-last-stop", "");
            return all.length;
        });
        expect(stops).toBeGreaterThan(2);
        await page.locator("[data-last-stop]").focus();
        await page.keyboard.press("Tab");
        await expect(page.locator("#sidebar")).toBeHidden();
        await expect(button).toHaveAttribute("aria-expanded", "false");
        const focus = await page.evaluate(() => ({
            body: document.activeElement === document.body,
            inside: document.querySelector("#sidebar").contains(document.activeElement),
        }));
        expect(focus).toEqual({ body: false, inside: false });
    });

    test("a name put into the query from the Schema tab closes it: the focus is in the editor", async ({ page, app }) => {
        await page.setViewportSize(TABLET);
        await app.open(NORTHLIGHT_URL);
        await app.openDrawer();
        await app.schemaInsert("products").click();
        await expect(page.locator("#sidebar")).toBeHidden();
        await expect(app.editor).toBeFocused();
        expect(await editorValue(page)).toContain("products");
    });

    test("it never opens by itself: a set that opens leaves it shut; choosing an exercise in it closes it", async ({ page, app }) => {
        await page.setViewportSize(TABLET);
        // every time it opens, from the first moment of the page
        await page.addInitScript(() => {
            window.__drawerOpened = 0;
            document.addEventListener(
                "toggle",
                (event) => {
                    if (event.target.id === "sidebar" && event.newState === "open") {
                        window.__drawerOpened += 1;
                    }
                },
                true
            );
        });
        await app.openSet();
        // a second after the set and its database are there, it has not opened once
        await app.settle();
        await page.waitForTimeout(1000);
        expect(await page.evaluate(() => window.__drawerOpened)).toBe(0);
        await expect(page.locator("#sidebar")).toBeHidden();
        await expect(app.sidebarButton).toHaveAttribute("aria-expanded", "false");
        await app.openTab("exercises");
        expect(await page.evaluate(() => window.__drawerOpened)).toBe(1);
        await app.exerciseButton(3).click();
        await expect(page.locator("#sidebar")).toBeHidden();
        await expect(app.exerciseButton(3)).toHaveAttribute("aria-current", "true");
        await expect(app.prompt).toContainText(SET.exercises[2].title);
        // the focus was in it: it is back on the Sidebar button, not lost
        await expect(app.sidebarButton).toBeFocused();
    });

    test("a sidebar hidden on a wide window opens as the drawer here, and is hidden again when the window widens", async ({ page, app }) => {
        await page.setViewportSize({ width: 1366, height: 768 });
        await app.open();
        await page.locator("#sidebar-splitter").focus();
        await page.keyboard.press("Enter");
        await expect(page.locator("#app")).toHaveClass(/\bapp--sidebar-collapsed\b/);
        await page.setViewportSize(TABLET);
        await expect(app.sidebarButton).toBeVisible();
        await expect(page.locator("#sidebar")).toBeHidden();
        await app.openDrawer();
        await expect(page.locator("#tab-schema")).toBeVisible();
        await expect.poll(() => page.locator("#sidebar").evaluate((el) => el.inert)).toBe(false);
        expect(rounded(await page.locator("#sidebar").boundingBox()).width).toBe(320);
        await page.keyboard.press("Escape");
        await page.setViewportSize({ width: 1366, height: 768 });
        await expect(page.locator("#tab-schema")).toBeHidden();
        await expect.poll(() => page.locator("#sidebar").evaluate((el) => el.inert)).toBe(true);
        expect(JSON.parse(await page.evaluate(() => localStorage.getItem("sqllab.layout"))).collapsed).toBe(true);
    });

    test("widening the window with the drawer open puts the sidebar back in its column; narrowing shuts it", async ({ page, app }) => {
        await page.setViewportSize(TABLET);
        await app.open();
        await app.openDrawer();
        await page.setViewportSize({ width: 1366, height: 768 });
        await expect.poll(() => page.locator("#sidebar").evaluate((el) => el.hasAttribute("popover"))).toBe(false);
        await expect(page.locator("#sidebar")).toBeVisible();
        await expect(app.sidebarButton).toBeHidden();
        await expect(app.sidebarButton).toHaveAttribute("aria-expanded", "false");
        const column = rounded(await page.locator("#sidebar").boundingBox());
        expect([column.x, column.y, column.width]).toEqual([0, 48, 280]);
        await page.setViewportSize(TABLET);
        await expect.poll(() => page.locator("#sidebar").evaluate((el) => el.getAttribute("popover"))).toBe("auto");
        await expect(page.locator("#sidebar")).toBeHidden();
    });

    test("on a narrow phone the drawer leaves 56 px of the page beside it", async ({ page, app }) => {
        for (const width of [360, 390]) {
            await page.setViewportSize({ width, height: 740 });
            await app.open();
            await app.openDrawer();
            expect(rounded(await page.locator("#sidebar").boundingBox()).width, `${width}`).toBe(Math.min(320, width - 56));
            expect(await noSidewaysScroll(page)).toBe(true);
        }
    });
});

// ---- the phone, under 700 px ----------------------------------------------------------------------

test.describe("the phone, under 700 px", () => {
    test("Editor and Result are two views: the query first, a run shows the result, text put in the editor shows it again", async ({ page, app }) => {
        await page.setViewportSize(PHONE);
        await app.open();
        const editorView = page.locator("#view-editor");
        const resultView = page.locator("#view-result");
        await expect(page.getByRole("group", { name: "Query or result" })).toBeVisible();
        await expect(editorView).toHaveAttribute("aria-current", "true");
        expect(await resultView.getAttribute("aria-current")).toBeNull();
        await expect(page.locator("#editor-pane")).toBeVisible();
        await expect(page.locator("#results-pane")).toBeHidden();
        // each a 48 px button, the two sharing the width (the mockup's)
        const [e, r] = [rounded(await editorView.boundingBox()), rounded(await resultView.boundingBox())];
        expect([e.height, r.height]).toEqual([48, 48]);
        expect(e.width + r.width).toBe(PHONE.width);

        // the Result view holds the samples until a run
        await resultView.click();
        await expect(resultView).toHaveAttribute("aria-current", "true");
        expect(await editorView.getAttribute("aria-current")).toBeNull();
        await expect(page.locator("#results-pane")).toBeVisible();
        await expect(page.locator("#editor-pane")).toBeHidden();
        // a sample fills the editor and runs nothing: the Editor view comes back
        await app.samples.first().click();
        await expect(editorView).toHaveAttribute("aria-current", "true");
        await expect(page.locator("#editor-pane")).toBeVisible();
        expect((await editorValue(page)).trim().length).toBeGreaterThan(0);
        await expect(app.table).toHaveCount(0);

        // a run shows the result; the focus was in the editor, which went, so it is on Result
        await app.editor.press("Control+Enter");
        await app.settle();
        await expect(resultView).toHaveAttribute("aria-current", "true");
        await expect(app.table).toBeVisible();
        await expect(resultView).toBeFocused();
        // a failed run too (its error is the result)
        await editorView.click();
        await app.editor.fill("SELEC nonsense");
        await page.locator("#execute").click();
        await app.settle();
        await expect(resultView).toHaveAttribute("aria-current", "true");
        await expect(app.errorBand).toBeVisible();
        // the button goes back to the query
        await editorView.click();
        await expect(page.locator("#editor-pane")).toBeVisible();
        await expect(page.locator("#results-pane")).toBeHidden();
        expect(await editorValue(page)).toBe("SELEC nonsense");
    });

    test("Run and Check answer are in the bar at the foot, in reach of a thumb, and a verdict shows the Result view", async ({ page, app }) => {
        await page.setViewportSize(PHONE);
        await app.openSet(EXERCISE.set, { ex: EXERCISE.ex });
        const bar = rounded(await page.locator("#editor-toolbar").boundingBox());
        expect(bar).toEqual({ x: 0, y: PHONE.height - 64, width: PHONE.width, height: 64 });
        const run = await page.locator("#execute").boundingBox();
        const check = await app.checkButton.boundingBox();
        expect(run.height).toBeGreaterThanOrEqual(44);
        expect(check.height).toBeGreaterThanOrEqual(44);
        expect(Math.round(run.y)).toBe(Math.round(check.y));
        // nothing is under the bar: the page above it ends where it starts
        const status = await page.locator("footer.statusbar").boundingBox();
        expect(status.y + status.height).toBeLessThanOrEqual(bar.y + 1);
        await expect(page.locator("footer.statusbar a")).toBeVisible();
        await expect(page.locator("#status-database")).toBeHidden();
        // the keyboard's shortcuts and the text size are not shown on a phone
        await expect(page.locator("#editor-toolbar .shortcut").first()).toBeHidden();
        await expect(page.locator(".text-size")).toBeHidden();

        // the prompt is in the Editor view, above the query
        await expect(app.exercisePanel).toBeVisible();
        expect((await app.exercisePanel.boundingBox()).y).toBeLessThan((await page.locator("#editor-pane").boundingBox()).y);
        await app.editor.fill(WRONG_SQL);
        await app.checkButton.click();
        await expect(app.feedback.locator(".verdict--fail")).toBeVisible();
        await expect(page.locator("#view-result")).toHaveAttribute("aria-current", "true");
        await expect(app.exercisePanel).toBeHidden();
        // the bar stays for the next try
        await expect(app.checkButton).toBeVisible();
        await expect(page.locator("#execute")).toBeVisible();
        // a verdict that comes with no run (Check with nothing written) shows the Result view too
        await page.locator("#view-editor").click();
        await app.editor.fill("");
        await app.checkButton.click();
        await expect(app.feedback).toContainText("Nothing to check.");
        await expect(page.locator("#view-result")).toHaveAttribute("aria-current", "true");
        await expect(app.feedback).toBeInViewport();
    });

    test("More holds Copy link, the three exports, the three themes and Help, and each does what its own control does", async ({ page, app }) => {
        await page.setViewportSize(PHONE);
        await app.open();
        const more = app.moreButton;
        await expect(more).toBeVisible();
        await expect(more).toHaveAccessibleName("More actions");
        await expect(more).toHaveAttribute("aria-haspopup", "menu");
        const size = rounded(await more.boundingBox());
        expect([size.width, size.height]).toEqual([44, 44]);
        // from the keyboard: Enter opens it on its first entry
        await more.focus();
        await page.keyboard.press("Enter");
        await expect(app.moreMenu).toBeVisible();
        await expect(page.locator("#more-copy-link")).toBeFocused();
        await expect(more).toHaveAttribute("aria-expanded", "true");
        await expect(app.moreMenu.getByRole("group", { name: "Export" })).toBeVisible();
        await expect(app.moreMenu.getByRole("group", { name: "Theme" })).toBeVisible();
        const menu = await app.moreMenu.boundingBox();
        expect(menu.x).toBeGreaterThanOrEqual(8);
        expect(menu.x + menu.width).toBeLessThanOrEqual(PHONE.width - 8);
        // each entry a 32 px target with a mouse (44 on a touch screen: "on a touch screen" below)
        const heights = await app.moreMenu.locator("[role^=menuitem]").evaluateAll((items) => items.map((item) => item.getBoundingClientRect().height));
        expect(heights.length).toBe(8);
        expect(Math.min(...heights)).toBeGreaterThanOrEqual(32);
        // with no result yet there is nothing to save as CSV
        await expect(page.locator("#more-export-csv")).toHaveAttribute("aria-disabled", "true");
        await page.keyboard.press("Escape");
        await expect(app.moreMenu).toBeHidden();
        await expect(more).toBeFocused();

        // the themes: the chosen one is ticked, and the page follows
        await app.openMore();
        await page.locator("#more-theme-dark").click();
        await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
        await app.openMore();
        await expect(page.locator("#more-theme-dark")).toHaveAttribute("aria-checked", "true");
        await expect(page.locator("#more-theme-light")).toHaveAttribute("aria-checked", "false");
        await page.locator("#more-theme-device").click();
        expect(await page.locator("html").getAttribute("data-theme")).toBeNull();

        // Results (.csv), once there is a result: a download
        await app.run("SELECT 1 AS one;");
        await app.openMore();
        await expect(page.locator("#more-export-csv")).toHaveAttribute("aria-disabled", "false");
        const [download] = await Promise.all([page.waitForEvent("download"), page.locator("#more-export-csv").click()]);
        expect(download.suggestedFilename()).toMatch(/\.csv$/);

        // Database (.db)...: the export dialog; when it closes the focus is back on More
        await app.openMore();
        await page.locator("#more-export-db").click();
        await expect(page.locator("#export-dialog")).toBeVisible();
        await page.keyboard.press("Escape");
        await expect(page.locator("#export-dialog")).toBeHidden();
        await expect(more).toBeFocused();

        // Evidence (.txt)...: the evidence dialog, the same way
        await app.openMore();
        await page.locator("#more-export-evidence").click();
        await expect(app.evidenceDialog).toBeVisible();
        await page.keyboard.press("Escape");
        await expect(app.evidenceDialog).toBeHidden();
        await expect(more).toBeFocused();

        // Help: its popover under the More button, inside the window; Escape gives the focus back
        await app.openMore();
        await page.locator("#more-help").click();
        const help = page.locator("#help-popover");
        await expect(help).toBeVisible();
        const [h, m] = [await help.boundingBox(), await more.boundingBox()];
        expect(h.y).toBeGreaterThanOrEqual(m.y + m.height);
        expect(h.x).toBeGreaterThanOrEqual(8);
        expect(h.x + h.width).toBeLessThanOrEqual(PHONE.width - 8);
        await page.keyboard.press("Escape");
        await expect(help).toBeHidden();
        await expect(more).toBeFocused();
    });

    test("Copy link in More copies the link; where the browser keeps the clipboard, the link shows under More", async ({ page, app }) => {
        await page.setViewportSize(PHONE);
        await app.open();
        await app.run("SELECT 1 AS one;");
        const link = await app.copyLink();
        expect(new URL(link).pathname).toBe(new URL(page.url()).pathname);
        await page.evaluate(() => {
            Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText: async () => Promise.reject(new Error("refused")) } });
            document.execCommand = () => false;
        });
        await app.openMore();
        await page.locator("#more-copy-link").click();
        const popover = page.locator("#copy-link-popover");
        await expect(popover).toBeVisible();
        const [p, m] = [await popover.boundingBox(), await app.moreButton.boundingBox()];
        expect(p.y).toBeGreaterThanOrEqual(m.y + m.height);
        expect(p.x).toBeGreaterThanOrEqual(8);
        expect(p.x + p.width).toBeLessThanOrEqual(PHONE.width - 8);
        await page.keyboard.press("Escape");
        await expect(popover).toBeHidden();
    });

    test("an exercise chosen in the drawer shows the Editor view with its prompt", async ({ page, app }) => {
        await page.setViewportSize(PHONE);
        await app.openSet(EXERCISE.set, { ex: EXERCISE.ex });
        await app.showView("result");
        await app.openTab("exercises");
        await app.exerciseButton(2).click();
        await expect(page.locator("#sidebar")).toBeHidden();
        await expect(page.locator("#view-editor")).toHaveAttribute("aria-current", "true");
        await expect(app.prompt).toContainText(SET.exercises[1].title);
        await expect(app.exercisePanel).toBeInViewport();
    });
});

test.describe("the phone, under 700 px: what the review found", () => {
    test("Run with nothing written shows the Result view and what it says", async ({ page, app }) => {
        await page.setViewportSize(PHONE);
        await app.open();
        await expect(page.locator("#view-editor")).toHaveAttribute("aria-current", "true");
        await page.locator("#execute").click();
        await expect(page.locator("#view-result")).toHaveAttribute("aria-current", "true");
        await expect(app.emptyState).toBeVisible();
    });

    test("a name inserted from the drawer while the Result view is shown goes into the shown editor, and the drawer closes", async ({ page, app }) => {
        await page.setViewportSize(PHONE);
        await app.open(NORTHLIGHT_URL);
        await app.run("SELECT 1 AS one;");
        await expect(page.locator("#view-result")).toHaveAttribute("aria-current", "true");
        await app.openDrawer();
        await app.schemaInsert("customers").click();
        await expect(page.locator("#view-editor")).toHaveAttribute("aria-current", "true");
        await expect(app.editor).toBeFocused();
        await expect(page.locator("#sidebar")).toBeHidden();
        expect(await editorValue(page)).toContain("customers");
    });

    test("a menu left open while the window crosses 700 px closes rather than moving to a corner", async ({ page, app }) => {
        await page.setViewportSize(PHONE);
        await app.open();
        await app.openMore();
        await page.setViewportSize(TABLET);
        await expect(app.moreMenu).toBeHidden();
        await app.exportMenuButton.click();
        await expect(app.exportMenu).toBeVisible();
        await page.setViewportSize(PHONE);
        await expect(app.exportMenu).toBeHidden();
        // and one whose button stays (the database switcher's) follows its button
        await app.databaseButton.click();
        await expect(app.databaseMenu).toBeVisible();
        await page.setViewportSize(TABLET);
        await expect(app.databaseMenu).toBeVisible();
        // (placed again on the resize event, a frame after the new size)
        await expect
            .poll(async () => {
                const [menu, button] = [await app.databaseMenu.boundingBox(), await app.databaseButton.boundingBox()];
                return Math.abs(menu.x - button.x) <= 1 && menu.y >= button.y + button.height;
            })
            .toBe(true);
    });

    test("the More menu's lines wrap rather than being cut, down to 320 px", async ({ page, app }) => {
        for (const width of [320, 360]) {
            await page.setViewportSize({ width, height: 740 });
            await app.open();
            await app.openMore();
            const cut = await app.moreMenu.locator(".menu-item-description").evaluateAll((lines) =>
                lines.filter((line) => line.scrollWidth > line.clientWidth + 1).map((line) => line.textContent)
            );
            expect(cut, `${width}`).toEqual([]);
            const box = await app.moreMenu.boundingBox();
            expect(box.x + box.width, `${width}`).toBeLessThanOrEqual(width - 8);
        }
    });

    test("the top bar as the mockup draws it: the switcher's name at its left and its arrow at the right end, the brand a full-size target", async ({ page, app }) => {
        await page.setViewportSize(PHONE);
        await app.open();
        const m = await page.evaluate(() => {
            const button = document.querySelector("#database-button").getBoundingClientRect();
            const icons = document.querySelectorAll("#database-button .icon");
            const arrow = icons[icons.length - 1].getBoundingClientRect();
            const name = document.querySelector("#database-button-name").getBoundingClientRect();
            const brand = document.querySelector("#reset").getBoundingClientRect();
            return { arrowGap: button.right - arrow.right, nameStart: name.left - button.left, brand: [brand.width, brand.height] };
        });
        expect(m.arrowGap).toBeLessThanOrEqual(12);
        expect(m.nameStart).toBeLessThanOrEqual(40);
        expect(m.brand[0]).toBeGreaterThanOrEqual(32);
        expect(m.brand[1]).toBeGreaterThanOrEqual(32);
    });

    test("the credit is one line over the bar at the foot, and the view buttons' focus ring is inside them", async ({ page, app }) => {
        await page.setViewportSize(PHONE);
        await app.open();
        const status = await page.locator("footer.statusbar").boundingBox();
        expect(Math.round(status.height)).toBe(28);
        await expect(page.locator(".statusbar-credit")).toContainText("Made by Abdou Sadou, based on SQLime by Anton Zhiyanov");
        await page.locator("#view-result").focus();
        expect(await page.locator("#view-result").evaluate((b) => getComputedStyle(b).outlineOffset)).toBe("-2px");
    });

    test("from 700 to 899 px the database's name is whole in the switcher: the Sidebar button and the brand are their icons", async ({ page, app }) => {
        for (const width of [700, 768, 820, 899]) {
            await page.setViewportSize({ width, height: 768 });
            await app.open(NORTHLIGHT_URL);
            await expect(app.databaseLabel).toHaveText("Northlight Retail");
            expect(await app.databaseLabel.evaluate((el) => el.scrollWidth <= el.clientWidth), `${width}`).toBe(true);
            await expect(app.sidebarButton, `${width}`).toHaveAccessibleName("Sidebar");
            expect(rounded(await page.locator("header.topbar").boundingBox()).height, `${width}`).toBe(48);
        }
    });

    test("the skip link, from the Result view, shows the Editor view and puts the focus in the editor", async ({ page, app }) => {
        await page.setViewportSize(PHONE);
        await app.open();
        await page.locator("#view-result").click();
        await expect(page.locator("#editor-pane")).toBeHidden();
        await page.locator(".skip-link").focus();
        await page.keyboard.press("Enter");
        await expect(page.locator("#view-editor")).toHaveAttribute("aria-current", "true");
        await expect(page.locator("#editor-pane")).toBeVisible();
        await expect(app.editor).toBeFocused();
    });

    test("a toast shows above the credit and the bar at the foot, covering neither", async ({ page, app }) => {
        await page.setViewportSize(PHONE);
        await app.open();
        await app.copyLink();
        const toast = await page.locator("#toast-region .toast").boundingBox();
        const status = await page.locator("footer.statusbar").boundingBox();
        const bar = await page.locator("#editor-toolbar").boundingBox();
        expect(toast.y + toast.height).toBeLessThanOrEqual(status.y + 1);
        expect(status.y + status.height).toBeLessThanOrEqual(bar.y + 1);
    });

    test("an exercise's prompt takes at most 45 percent of the Editor view and scrolls; the editor keeps its room", async ({ page, app }) => {
        await page.setViewportSize(PHONE);
        await app.openSet(EXERCISE.set, { ex: "e04" });
        // every hint shown
        for (let i = 0; i < 5 && (await app.hintButton.isVisible()); i++) {
            await app.hintButton.click();
        }
        await expect(app.hintButton).toBeHidden();
        const [panel, main, editor] = [await app.exercisePanel.boundingBox(), await page.locator("#main").boundingBox(), await page.locator("#editor-pane").boundingBox()];
        expect(panel.height).toBeLessThanOrEqual(0.45 * main.height + 1);
        expect(editor.height).toBeGreaterThanOrEqual(120);
        expect(await app.exercisePanel.evaluate((el) => el.scrollHeight > el.clientHeight)).toBe(true);
    });

    test("a short window with a mouse keeps the layout of its width", async ({ page, app }) => {
        await page.setViewportSize({ width: 844, height: 390 });
        await app.open();
        await expect(page.locator("#view-switch")).toBeHidden();
        await expect(page.locator("#export-button")).toBeVisible();
        await expect(app.sidebarButton).toBeVisible();
    });
});

test.describe("on a touch screen", () => {
    // (Chromium's mobile emulation: Firefox has none)
    test.skip(({ browserName }) => browserName === "firefox", "Firefox has no mobile emulation (isMobile)");
    test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });

    test("every control of the phone's layout is a 44 px target: the top bar, the views, the bar at the foot, More's entries, the drawer's", async ({ page, app }) => {
        await app.open();
        const small = (selector) =>
            page.locator(selector).evaluateAll((all) =>
                all
                    .filter((el) => el.getClientRects().length)
                    .map((el) => ({ id: el.id || el.className, box: el.getBoundingClientRect() }))
                    .filter(({ box }) => box.width < 44 || box.height < 44)
                    .map(({ id, box }) => `${id}: ${Math.round(box.width)}x${Math.round(box.height)}`)
            );
        expect(await small("#sidebar-button, #reset, #database-button, #more-button, #view-editor, #view-result, #execute")).toEqual([]);
        await app.openMore();
        expect(await small("#more-menu [role^=menuitem]")).toEqual([]);
        await page.keyboard.press("Escape");
        await app.openDrawer();
        expect(await small("#sidebar-close, #sidebar [role=tab]")).toEqual([]);
    });
});

test.describe("a phone held sideways", () => {
    // a touch screen less than 500 px tall (Chromium's mobile emulation: Firefox has none)
    test.skip(({ browserName }) => browserName === "firefox", "Firefox has no mobile emulation (isMobile)");
    test.use({ viewport: { width: 844, height: 390 }, isMobile: true, hasTouch: true });

    test("it takes the phone's layout, and its result is in view", async ({ page, app }) => {
        await app.open(NORTHLIGHT_URL);
        await expect(page.locator("#view-switch")).toBeVisible();
        await expect(page.locator("#more-button")).toBeVisible();
        await expect(page.locator("#editor-toolbar")).toHaveCSS("position", "fixed");
        await app.run("SELECT product_name, unit_price FROM products ORDER BY unit_price DESC;");
        await expect(page.locator("#view-result")).toHaveAttribute("aria-current", "true");
        // two rows whole and the third begun, under the summary line and the header (the tablet
        // layout left the header alone in view)
        const rows = app.table.locator("tbody tr");
        for (let i = 0; i < 2; i++) {
            await expect(rows.nth(i), `row ${i + 1}`).toBeInViewport({ ratio: 1 });
        }
        await expect(rows.nth(2), "row 3").toBeInViewport();
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    });
});

// ---- keyboard only, on a tablet and on a phone ------------------------------------------------------

test.describe("keyboard only", () => {
    test("on a tablet: the drawer, an exercise from its list, the query, Check", async ({ page, app }) => {
        await page.setViewportSize(TABLET);
        await app.openSet(EXERCISE.set, { ex: "e01" });
        // the Sidebar button, back from the editor (Escape first: in the editor Tab indents)
        await expect(app.editor).toBeFocused();
        await page.keyboard.press("Escape");
        expect(await tabTo(page, "#sidebar-button", { back: true }), "Tab reaches #sidebar-button").toBe(true);
        await page.keyboard.press("Enter");
        await expect(page.locator("#sidebar")).toBeVisible();
        // the tabs: the Exercises tab with the arrow keys, then its list
        await expect(page.locator('#sidebar [role="tab"][aria-selected="true"]')).toBeFocused();
        await page.keyboard.press("Home");
        await page.keyboard.press("ArrowRight");
        await expect(page.locator("#tab-exercises")).toBeFocused();
        await expect(page.locator("#tab-exercises")).toHaveAttribute("aria-selected", "true");
        expect(await tabTo(page, "#exercise-list button[aria-current]"), "Tab reaches the open exercise").toBe(true);
        await page.keyboard.press("ArrowDown");
        await expect(app.exerciseButton(2)).toBeFocused();
        await page.keyboard.press("Enter");
        await expect(page.locator("#sidebar")).toBeHidden();
        await expect(app.exerciseButton(2)).toHaveAttribute("aria-current", "true");
        // the editor, and Check from the keyboard
        expect(await tabTo(page, EDITOR_INPUT), "Tab reaches the editor").toBe(true);
        await page.keyboard.press("Control+A");
        await page.keyboard.insertText(modelQuery("e02"));
        await page.keyboard.press("Control+Shift+Enter");
        await expect(app.feedback.locator(".verdict--pass")).toBeVisible();
    });

    test("on a phone: a query, its result, back to the query, an exercise passed, More and Help", async ({ page, app }) => {
        await page.setViewportSize(PHONE);
        await app.openSet(EXERCISE.set, { ex: "e01" });
        expect(await tabTo(page, EDITOR_INPUT), "Tab reaches the editor").toBe(true);
        await page.keyboard.press("Control+A");
        await page.keyboard.insertText(modelQuery("e01"));
        await page.keyboard.press("Control+Shift+Enter");
        await expect(app.feedback.locator(".verdict--pass")).toBeVisible();
        await expect(page.locator("#view-result")).toHaveAttribute("aria-current", "true");
        // the focus was in the view that went: it is on the Result button, not lost
        await expect(page.locator("#view-result")).toBeFocused();
        // Next exercise, in the verdict: the next prompt, in the Editor view, the focus in the editor
        expect(await tabTo(page, ".verdict-next"), "Tab reaches Next exercise").toBe(true);
        await page.keyboard.press("Enter");
        await expect(app.exerciseButton(2)).toHaveAttribute("aria-current", "true");
        await expect(page.locator("#view-editor")).toHaveAttribute("aria-current", "true");
        await expect(app.editor).toBeFocused();
        // the Result button, from the keyboard, and back
        await page.keyboard.press("Escape");
        expect(await tabTo(page, "#view-result", { back: true }), "Shift+Tab reaches Result").toBe(true);
        await page.keyboard.press("Enter");
        await expect(page.locator("#results-pane")).toBeVisible();
        await page.keyboard.press("Shift+Tab");
        await expect(page.locator("#view-editor")).toBeFocused();
        await page.keyboard.press("Space");
        await expect(page.locator("#editor-pane")).toBeVisible();
        // More, and Help in it
        expect(await tabTo(page, "#more-button", { back: true }), "Shift+Tab reaches More").toBe(true);
        await page.keyboard.press("Enter");
        await expect(page.locator("#more-copy-link")).toBeFocused();
        await page.keyboard.press("End");
        await expect(page.locator("#more-help")).toBeFocused();
        await page.keyboard.press("Enter");
        await expect(page.locator("#help-popover")).toBeVisible();
        await page.keyboard.press("Escape");
        await expect(page.locator("#help-popover")).toBeHidden();
        await expect(app.moreButton).toBeFocused();
    });
});

// ---- the text size ----------------------------------------------------------------------------

test.describe("the text size", () => {
    const smaller = (page) => page.locator("#text-smaller");
    const larger = (page) => page.locator("#text-larger");
    const said = (page) => page.locator("#text-size-said");

    test("A- and A+ sit at the right end of the editor toolbar's row, named by what they show and do", async ({ page, app }) => {
        await page.setViewportSize({ width: 1366, height: 768 });
        await app.open();
        await expect(page.getByRole("group", { name: "Text size" })).toBeVisible();
        await expect(smaller(page)).toHaveText("A−");
        await expect(larger(page)).toHaveText("A+");
        await expect(smaller(page)).toHaveAccessibleName("A−, smaller text");
        await expect(larger(page)).toHaveAccessibleName("A+, larger text");
        const bar = await page.locator("#editor-toolbar").boundingBox();
        const run = await page.locator("#execute").boundingBox();
        const [a, b] = [await smaller(page).boundingBox(), await larger(page).boundingBox()];
        // on Run's row, A- then A+, and A+ 16 px from the row's right end
        for (const button of [a, b]) {
            expect(button.y + button.height / 2).toBeGreaterThan(run.y);
            expect(button.y + button.height / 2).toBeLessThan(run.y + run.height);
        }
        expect(a.x + a.width).toBeLessThanOrEqual(b.x);
        expect(Math.round(bar.x + bar.width - (b.x + b.width))).toBe(16);
        // between Run and them, room: nothing overlaps
        expect(run.x + run.width).toBeLessThan(a.x);
        // they come last in the Tab order of the main area, after the result: A- then A+
        await smaller(page).focus();
        await page.keyboard.press("Tab");
        await expect(larger(page)).toBeFocused();
    });

    test("each press makes the SQL, the result and the error's SQL 2 px smaller or larger, 12 to 24, and says so; the interface keeps its size", async ({ page, app }) => {
        await page.setViewportSize({ width: 1366, height: 768 });
        await app.open();
        await app.run("SELECT 1 AS one;");
        const sizes = async () => ({
            editor: await fontSize(page.locator("#editor .cm-content")),
            result: await fontSize(page.locator("#result table td")),
            run: await fontSize(page.locator("#execute")),
            tab: await fontSize(page.locator("#tab-schema")),
        });
        expect(await sizes()).toEqual({ editor: "14px", result: "14px", run: "14px", tab: "14px" });
        await larger(page).click();
        expect(await sizes()).toEqual({ editor: "16px", result: "16px", run: "14px", tab: "14px" });
        await expect(said(page)).toHaveText("Text size 16 pixels");
        // said by a polite live region, as every outcome is
        await expect(said(page)).toHaveAttribute("role", "status");
        await expect(said(page)).toHaveAttribute("aria-live", "polite");
        expect(await page.evaluate(() => localStorage.getItem("sqllab.textSize"))).toBe("16");
        // two presses in a row: the size they end on is said
        await larger(page).click();
        await larger(page).click();
        await expect(said(page)).toHaveText("Text size 20 pixels");
        // up to 24, where A+ stays, says why, and does nothing
        await larger(page).click();
        await larger(page).click();
        expect(await sizes()).toEqual({ editor: "24px", result: "24px", run: "14px", tab: "14px" });
        await expect(larger(page)).toHaveAttribute("aria-disabled", "true");
        await expect(larger(page)).toHaveAttribute("title", "The text is at its largest");
        await expect(smaller(page)).not.toHaveAttribute("aria-disabled", "true");
        await larger(page).click({ force: true });
        expect((await sizes()).editor).toBe("24px");
        // an error's SQL is drawn at the size too
        await app.run("SELEC nonsense");
        await expect(app.errorBand).toBeVisible();
        expect(await fontSize(page.locator(".results-band-quote"))).toBe("24px");
        // down to 12, where A- stays the same way
        for (let i = 0; i < 6; i++) {
            await smaller(page).click();
        }
        expect(await fontSize(page.locator("#editor .cm-content"))).toBe("12px");
        expect(await fontSize(page.locator(".results-band-quote"))).toBe("12px");
        await expect(smaller(page)).toHaveAttribute("aria-disabled", "true");
        await expect(smaller(page)).toHaveAttribute("title", "The text is at its smallest");
        await expect(larger(page)).not.toHaveAttribute("aria-disabled", "true");
        expect(await page.evaluate(() => localStorage.getItem("sqllab.textSize"))).toBe("12");
    });

    test("from the keyboard: Enter and Space press them, and the focus stays on the button at either end", async ({ page, app }) => {
        await app.open();
        await larger(page).focus();
        await page.keyboard.press("Enter");
        await page.keyboard.press("Space");
        expect(await fontSize(page.locator("#editor .cm-content"))).toBe("18px");
        for (let i = 0; i < 5; i++) {
            await page.keyboard.press("Enter");
        }
        await expect(larger(page)).toBeFocused();
        await expect(larger(page)).toHaveAttribute("aria-disabled", "true");
        expect(await fontSize(page.locator("#editor .cm-content"))).toBe("24px");
    });

    test("a long cell's whole value follows the size, and so does the plain editor where CodeMirror cannot load", async ({ page, app }) => {
        await page.addInitScript(() => localStorage.setItem("sqllab.textSize", "20"));
        await app.open(NORTHLIGHT_URL);
        await app.run("SELECT group_concat(product_name, ', ') AS names FROM products;");
        await page.locator("#result .cell-more").first().click();
        await expect(page.locator("#cell-popover")).toBeVisible();
        expect(await fontSize(page.locator("#cell-popover .cell-popover-value"))).toBe("20px");

        const plain = await page.context().newPage();
        await plain.route("**/vendor/editor.js", (route) => route.abort());
        await plain.goto("./");
        await expect(plain.locator('#editor[contenteditable="true"]')).toBeVisible();
        expect(await fontSize(plain.locator("#editor"))).toBe("20px");
        await plain.close();
    });

    test("the Expected and Yours tables of a verdict follow the size", async ({ page, app }) => {
        await page.addInitScript(() => localStorage.setItem("sqllab.textSize", "18"));
        await app.openSet(EXERCISE.set, { ex: EXERCISE.ex });
        await app.editor.fill(WRONG_SQL);
        await app.checkButton.click();
        await expect(app.feedback.locator(".verdict--fail table")).toHaveCount(2);
        expect(await app.feedback.locator(".verdict--fail table td").evaluateAll((cells) => [...new Set(cells.map((c) => getComputedStyle(c).fontSize))])).toEqual(["18px"]);
        expect(await fontSize(page.locator("#editor .cm-content"))).toBe("18px");
    });

    test("the size is kept: a reload draws it before the first paint, and a stored value that is not a size is ignored", async ({ page, app }) => {
        // when the size first reaches <html>, and whether the body was there yet
        await page.addInitScript(() => {
            // (on the document: an init script runs before <html> is parsed)
            new MutationObserver((records, observer) => {
                const size = document.documentElement?.style.getPropertyValue("--code-size");
                if (size) {
                    window.__firstSize = { size, body: Boolean(document.body) };
                    observer.disconnect();
                }
            }).observe(document, { attributes: true, attributeFilter: ["style"], subtree: true });
        });
        await app.open();
        for (let i = 0; i < 3; i++) {
            await larger(page).click();
        }
        await page.reload();
        await app.waitReady();
        expect(await page.evaluate(() => window.__firstSize)).toEqual({ size: "20px", body: false });
        expect(await fontSize(page.locator("#editor .cm-content"))).toBe("20px");

        for (const stored of ["13", "26", "10", "abc", "", "1e1", "16px", "-14"]) {
            await page.evaluate((value) => localStorage.setItem("sqllab.textSize", value), stored);
            await page.reload();
            await app.waitReady();
            expect(await page.evaluate(() => window.__firstSize ?? null), stored).toEqual({ size: "14px", body: true });
            expect(await fontSize(page.locator("#editor .cm-content")), stored).toBe("14px");
        }
    });

    test("with storage blocked the buttons still change the size, for the page", async ({ page, app, pageErrors }) => {
        await failStorage(page, { methods: ["setItem", "getItem"] });
        await app.open();
        await larger(page).click();
        expect(await fontSize(page.locator("#editor .cm-content"))).toBe("16px");
        await expect(said(page)).toHaveText("Text size 16 pixels");
        expect(pageErrors).toEqual([]);
    });

    test("on a phone the default size applies and A- and A+ are not shown; a wider window has the size chosen", async ({ page, app }) => {
        await page.addInitScript(() => localStorage.setItem("sqllab.textSize", "20"));
        await page.setViewportSize(PHONE);
        await app.open();
        await expect(page.locator(".text-size")).toBeHidden();
        expect(await fontSize(page.locator("#editor .cm-content"))).toBe("14px");
        await app.run("SELECT 1 AS one;");
        expect(await fontSize(page.locator("#result table td"))).toBe("14px");
        await page.setViewportSize({ width: 1366, height: 768 });
        expect(await fontSize(page.locator("#result table td"))).toBe("20px");
        expect(await fontSize(page.locator("#editor .cm-content"))).toBe("20px");
        expect(await page.evaluate(() => localStorage.getItem("sqllab.textSize"))).toBe("20");
    });

    test("the boot script and js/lab/config.js agree on the key, the sizes and the default", () => {
        const key = /TEXT_SIZE_STORAGE_KEY = "([^"]+)"/.exec(CONFIG)[1];
        const sizes = JSON.parse(/TEXT_SIZES = (\[[^\]]*\])/.exec(CONFIG)[1]);
        const fallback = Number(/TEXT_SIZE_DEFAULT = (\d+)/.exec(CONFIG)[1]);
        const boot = read("js/lab/theme-boot.js");
        expect(boot).toContain(`getItem("${key}")`);
        const [low, high, step] = /size >= (\d+) && size <= (\d+) && size % (\d+) === 0/.exec(boot).slice(1).map(Number);
        const allowed = Array.from({ length: 100 }, (_, n) => n).filter((n) => n >= low && n <= high && n % step === 0);
        expect(allowed).toEqual(sizes);
        expect(sizes).toContain(fallback);
        // before any script, css/tokens.css draws the default
        const tokens = read("css/tokens.css");
        expect(tokens).toMatch(/--code-size:\s*var\(--text-sm\);/);
        expect(Number(/--text-sm:\s*(\d+)px;/.exec(tokens)[1])).toBe(fallback);
    });

    test("the projector check: at 1280x720 and size 20, a 6-line query and 6 result rows are in view without scrolling", async ({ page, app }) => {
        await page.setViewportSize({ width: 1280, height: 720 });
        await page.addInitScript(() => localStorage.setItem("sqllab.textSize", "20"));
        await app.open(NORTHLIGHT_URL);
        const sql = ["SELECT product_name,", "       category,", "       unit_price", "FROM products", "ORDER BY unit_price DESC", "LIMIT 6;"].join("\n");
        await app.run(sql);
        await expect(app.status).toHaveText(/^6 rows in \d+ ms$/);
        expect(await fontSize(page.locator("#editor .cm-content"))).toBe("20px");
        expect(await fontSize(page.locator("#result table td"))).toBe("20px");
        const lines = page.locator("#editor .cm-line");
        await expect(lines).toHaveCount(6);
        for (let i = 0; i < 6; i++) {
            await expect(lines.nth(i), `line ${i + 1}`).toBeInViewport({ ratio: 1 });
        }
        const rows = app.table.locator("tbody tr");
        await expect(rows).toHaveCount(6);
        for (let i = 0; i < 6; i++) {
            await expect(rows.nth(i), `row ${i + 1}`).toBeInViewport({ ratio: 1 });
        }
        // nothing was scrolled to show them
        expect(
            await page.evaluate(() => ({
                editor: document.querySelector("#editor .cm-scroller").scrollTop,
                results: document.querySelector("#results-pane").scrollTop,
                result: document.querySelector("#result").scrollTop,
                page: document.scrollingElement.scrollTop,
            }))
        ).toEqual({ editor: 0, results: 0, result: 0, page: 0 });
    });
});

// ---- reduced motion -----------------------------------------------------------------------------

test.describe("reduced motion", () => {
    // every CSS animation that starts, with its duration (one that the reduced-motion rules took
    // away fires no animationstart at all)
    async function recordAnimations(page) {
        await page.addInitScript(() => {
            window.__animations = [];
            document.addEventListener(
                "animationstart",
                (event) => {
                    const style = getComputedStyle(event.target, event.pseudoElement || null);
                    const names = style.animationName.split(", ");
                    const durations = style.animationDuration.split(", ").map((d) => (d.endsWith("ms") ? parseFloat(d) : parseFloat(d) * 1000));
                    const at = Math.max(0, names.indexOf(event.animationName));
                    window.__animations.push({ name: event.animationName, duration: durations[at] ?? durations[0] });
                },
                true
            );
        });
    }

    // what is shown, left a few frames to start moving (an animation starts with the next frame,
    // so one closed at once would never start), with the animation its style gives it now
    async function shown(page, selector) {
        await expect(page.locator(selector)).toBeVisible();
        await page.evaluate(() => new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(done))));
        await page.waitForTimeout(50);
        return page.locator(selector).evaluate((el) => {
            const style = getComputedStyle(el);
            return { name: style.animationName, duration: style.animationDuration };
        });
    }

    // menus, popovers, a toast, a run, a cell's popover, and a verdict with its tick: what each
    // looks like as it shows, and every animation that started on the way
    async function walk(page, app) {
        await app.openSet(EXERCISE.set, { ex: EXERCISE.ex });
        const styles = {};
        await app.databaseButton.click();
        styles.menu = await shown(page, "#database-menu");
        await page.keyboard.press("Escape");
        await page.locator("#help-button").click();
        styles.help = await shown(page, "#help-popover");
        await page.keyboard.press("Escape");
        await app.copyLink();
        styles.toast = await shown(page, "#toast-region .toast");
        // Copy link's popover, where the browser keeps the clipboard to itself
        await page.evaluate(() => {
            Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText: async () => Promise.reject(new Error("refused")) } });
            document.execCommand = () => false;
        });
        await page.locator("#copy-link").click();
        styles.link = await shown(page, "#copy-link-popover");
        await page.keyboard.press("Escape");
        await app.run("SELECT group_concat(product_name, ', ') AS names FROM products;");
        await page.locator("#result .cell-more").first().click();
        styles.cell = await shown(page, "#cell-popover");
        await page.keyboard.press("Escape");
        await app.editor.fill(CORRECT_SQL);
        await app.checkButton.click();
        styles.verdict = await shown(page, "#exercise-feedback .verdict--pass");
        // "Running…" shows over the summary line for a run longer than 300 ms, which blocks the
        // page while it lasts: its style is read on a stand-in with its class, where it goes
        styles.running = await page.evaluate(() => {
            const probe = document.createElement("div");
            probe.className = "results-running";
            document.querySelector("#results-summary").append(probe);
            const style = getComputedStyle(probe);
            const read = { name: style.animationName, duration: style.animationDuration, delay: style.animationDelay };
            probe.remove();
            return read;
        });
        // past every delay (the running state shows after 300 ms) and every fade
        await page.waitForTimeout(500);
        return { started: await page.evaluate(() => window.__animations), styles };
    }

    test("with reduced motion asked for, nothing moves: no animation lasts longer than a millisecond", async ({ page, app }) => {
        await page.emulateMedia({ reducedMotion: "reduce" });
        await recordAnimations(page);
        const { started, styles } = await walk(page, app);
        expect(started.filter((a) => a.duration > 1)).toEqual([]);
        // and what showed has no animation of its own; "Running…" keeps its 300 ms delay (it is
        // for a long run only) and then shows at once
        const { running, ...shownStyles } = styles;
        for (const [what, style] of Object.entries(shownStyles)) {
            expect(style.name, what).toBe("none");
        }
        expect(running).toEqual({ name: "results-running-in", duration: "0.001s", delay: "0.3s" });
        // the tick of a pass is there at once, whole
        const tick = await app.feedback.locator(".verdict-tick > *").first().evaluate((el) => getComputedStyle(el).strokeDashoffset);
        expect(parseFloat(tick)).toBe(0);
        // and the editor's caret does not blink
        expect(await page.locator("#editor .cm-cursorLayer").evaluate((el) => getComputedStyle(el).animationName)).toBe("none");
    });

    test("without it the same steps do move (the check above sees animations when there are some)", async ({ page, app }) => {
        await page.emulateMedia({ reducedMotion: "no-preference" });
        await recordAnimations(page);
        const { started, styles } = await walk(page, app);
        const names = new Set(started.filter((a) => a.duration > 1).map((a) => a.name));
        expect([...names]).toEqual(expect.arrayContaining(["menu-fade", "verdict-draw"]));
        const { running, ...shownStyles } = styles;
        for (const [what, style] of Object.entries(shownStyles)) {
            expect(style.name, what).toBe("menu-fade");
            expect(style.duration, what).toBe("0.12s");
        }
        expect(running).toEqual({ name: "results-running-in", duration: "0.12s", delay: "0.3s" });
    });
});

// ---- About ---------------------------------------------------------------------------------------

test.describe("About", () => {
    test("in the app's look: the brand bar, one column of text with its headings in order, the keys as Help draws them, the credit at the foot", async ({ page }) => {
        await page.setViewportSize({ width: 1366, height: 768 });
        await page.goto("./about.html");
        await expect(page.locator("body > header")).toContainText(APP_NAME);
        await expect(page).toHaveTitle(`About - ${APP_NAME}`);
        const brand = page.locator("body > header .page-brand a.logo");
        await expect(brand).toHaveAttribute("href", "./");
        await expect(brand).toHaveAttribute("data-back", "");
        await expect(brand).toHaveText(APP_NAME);
        await expect(brand.locator("img")).toHaveAttribute("src", "img/favicon.svg");
        expect(rounded(await page.locator("body > header").boundingBox()).height).toBe(48);
        // the headings: the page's h1, then its sections, no level skipped
        await expect(page.locator("h1")).toHaveText(["About"]);
        await expect(page.locator("main h2")).toHaveText([
            "What you can do here",
            "For markers",
            "A full database in the browser",
            "Your own data stays with you",
            "On a projector, a tablet or a phone",
            "Keyboard shortcuts",
            "Credits and licence",
        ]);
        await expect(page.locator("main h3, main h4, main h5, main h6")).toHaveCount(0);
        // the keys, as the Help popover draws them: Ctrl here (and ⌘ on an Apple device)
        await expect(page.locator("dl.keys dt").first()).toHaveText(/^Ctrl\s+Enter$/);
        expect(await page.locator("dl.keys kbd").first().evaluate((k) => getComputedStyle(k).borderTopStyle)).toBe("solid");
        // one column of text: 16 px, no wider than 42rem, on the paper of the theme
        const m = await page.evaluate(() => {
            const main = document.querySelector("body > main");
            const style = getComputedStyle(main);
            const probe = document.createElement("span");
            probe.style.color = "var(--paper)";
            document.body.append(probe);
            const paper = getComputedStyle(probe).color;
            probe.remove();
            return {
                text: main.getBoundingClientRect().width - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight),
                size: getComputedStyle(main.querySelector("p")).fontSize,
                ground: getComputedStyle(document.documentElement).backgroundColor,
                paper,
            };
        });
        expect(m.text).toBeLessThanOrEqual(42 * 16 + 1);
        expect(m.size).toBe("16px");
        expect(m.ground).toBe(m.paper);
        await expect(page.locator(".page-back a")).toHaveText(`Back to ${APP_NAME}`);
        await expect(page.locator("body > footer")).toContainText("SQLime");
        // the footer is at the foot of the window even when the text is short
        const footer = await page.locator("body > footer").boundingBox();
        expect(footer.y + footer.height).toBeGreaterThanOrEqual(768 - 1);
    });

    test("its brand and its last link go back in the history when it was opened from the app, and to the app otherwise", async ({ page, app, baseURL }) => {
        await app.open();
        await app.run("SELECT 42 AS answer;");
        const app0 = page.url();
        for (const link of [".page-back a", ".page-brand a"]) {
            await page.locator('footer.statusbar a[href="about.html"]').click();
            await expect(page).toHaveURL(/about\.html$/);
            const onAbout = await page.evaluate(() => history.length);
            await page.locator(link).click();
            await expect(page).toHaveURL(app0);
            await app.waitReady();
            // back, not a new visit: the history is no longer than it was on About
            expect(await page.evaluate(() => history.length), link).toBe(onAbout);
        }
        // opened on its own (a bookmark: no page of this site before it, though the tab has a
        // history), it goes to the app, a new entry in the history
        const fresh = await page.context().newPage();
        await fresh.goto("./verify.html");
        await fresh.goto("./about.html");
        const before = await fresh.evaluate(() => history.length);
        expect(before).toBeGreaterThan(1);
        await fresh.locator(".page-back a").click();
        await expect(fresh).toHaveURL(baseURL);
        expect(await fresh.evaluate(() => history.length)).toBe(before + 1);
        await fresh.close();
    });

    test("About and the evidence check page draw the app's focus ring, and the evidence page's controls are the app's", async ({ page }) => {
        for (const url of ["./about.html", "./verify.html"]) {
            await page.goto(url);
            await page.keyboard.press("Tab");
            await expect(page.locator(".page-brand a")).toBeFocused();
            const ring = await page.locator(".page-brand a").evaluate((a) => {
                const style = getComputedStyle(a);
                const probe = document.createElement("span");
                probe.style.color = "var(--accent)";
                document.body.append(probe);
                const accent = getComputedStyle(probe).color;
                probe.remove();
                return { style: style.outlineStyle, width: style.outlineWidth, offset: style.outlineOffset, colour: style.outlineColor === accent };
            });
            expect(ring, url).toEqual({ style: "solid", width: "2px", offset: "2px", colour: true });
        }
        // the evidence page's controls: 32 px with a mouse, the 6 px radius, Verify the filled one
        const controls = await page.evaluate(() => {
            const verify = getComputedStyle(document.querySelector("#verify-button"));
            const text = getComputedStyle(document.querySelector("#evidence-text"));
            return { height: verify.minHeight, radius: verify.borderTopLeftRadius, weight: verify.fontWeight, textRadius: text.borderTopLeftRadius, textSize: text.fontSize };
        });
        expect(controls).toEqual({ height: "32px", radius: "6px", weight: "600", textRadius: "6px", textSize: "14px" });
        expect((await page.locator("#evidence-file").boundingBox()).height).toBeGreaterThanOrEqual(32);
    });

    test("on Apple devices its keys read ⌘", async ({ page }) => {
        await page.addInitScript(() => {
            Object.defineProperty(Navigator.prototype, "platform", { get: () => "MacIntel" });
            Object.defineProperty(Navigator.prototype, "userAgentData", { get: () => ({ platform: "macOS", brands: [], mobile: false }) });
        });
        await page.goto("./about.html");
        await expect(page.locator("dl.keys dt").first()).toHaveText(/^⌘\s+Enter$/);
        // Ctrl+Space (the suggestions) is Ctrl on a Mac too
        await expect(page.locator("dl.keys dt").nth(3)).toHaveText(/^Ctrl\s+Space$/);
    });
});

// ---- the icons and the link preview ---------------------------------------------------------------

test.describe("the icons and the link preview", () => {
    const pngSize = (file) => {
        const bytes = fs.readFileSync(path.join(ROOT, file));
        expect(bytes.subarray(1, 4).toString(), file).toBe("PNG");
        return [bytes.readUInt32BE(16), bytes.readUInt32BE(20)];
    };

    test("the favicon set: an SVG that follows the device's scheme, an ICO of 16, 32 and 48 px, the touch icon, the manifest's icons and the preview picture, each at its size", () => {
        const svg = read("img/favicon.svg");
        const tokens = read("css/tokens.css");
        const lightAccent = /--accent:\s*(#[0-9A-Fa-f]{6})/.exec(tokens)[1];
        const darkAccent = /--accent:\s*(#[0-9A-Fa-f]{6})/.exec(tokens.slice(tokens.indexOf(':root[data-theme="dark"]')))[1];
        expect(svg).toContain(lightAccent);
        expect(svg).toMatch(/@media \(prefers-color-scheme: dark\)/);
        expect(svg).toContain(darkAccent);
        expect(pngSize("img/favicon-64x64.png")).toEqual([64, 64]);
        expect(pngSize("img/apple-touch-icon.png")).toEqual([180, 180]);
        expect(pngSize("img/icon-192.png")).toEqual([192, 192]);
        expect(pngSize("img/icon-512.png")).toEqual([512, 512]);
        expect(pngSize("img/icon-maskable-512.png")).toEqual([512, 512]);
        expect(pngSize("img/social.png")).toEqual([1200, 630]);
        const ico = fs.readFileSync(path.join(ROOT, "img/favicon.ico"));
        expect([ico.readUInt16LE(0), ico.readUInt16LE(2)]).toEqual([0, 1]);
        const count = ico.readUInt16LE(4);
        expect(Array.from({ length: count }, (_, i) => ico.readUInt8(6 + 16 * i))).toEqual([16, 32, 48]);
        for (let i = 0; i < count; i++) {
            const offset = ico.readUInt32LE(6 + 16 * i + 12);
            expect(ico.subarray(offset + 1, offset + 4).toString()).toBe("PNG");
            expect(ico.readUInt32BE(offset + 16)).toBe([16, 32, 48][i]);
        }
    });

    test("every page links the icons, and they load", async ({ page }) => {
        for (const url of ["./", "./about.html", "./verify.html"]) {
            await page.goto(url);
            const links = await page.evaluate(() =>
                [...document.querySelectorAll('link[rel~="icon"], link[rel="apple-touch-icon"]')].map((l) => [l.rel, l.getAttribute("href"), l.getAttribute("type"), l.getAttribute("sizes")])
            );
            expect(links, url).toEqual([
                ["icon", "img/favicon.ico", null, "any"],
                ["icon", "img/favicon.svg", "image/svg+xml", null],
                ["apple-touch-icon", "img/apple-touch-icon.png", null, null],
            ]);
            for (const [, href] of links) {
                expect((await page.request.get(new URL(href, page.url()).href)).status(), href).toBe(200);
            }
        }
    });

    test("the pages in the repository carry no preview tags and no address: only the markers the deploy step writes between", () => {
        for (const file of ["index.html", "about.html", "verify.html"]) {
            const html = read(file);
            const head = html.slice(0, html.indexOf("</head>"));
            const between = head.slice(head.indexOf("<!-- social:begin -->"), head.indexOf("<!-- social:end -->"));
            expect(head.indexOf("<!-- social:begin -->"), file).toBeGreaterThan(0);
            expect(head.indexOf("<!-- social:end -->"), file).toBeGreaterThan(head.indexOf("<!-- social:begin -->"));
            expect(between, file).not.toMatch(/<meta|<link/);
            expect(head, file).not.toMatch(/property="og:|name="twitter:|rel="manifest"|https?:\/\//);
        }
        // the site's address is one constant, empty in the repository
        expect(CONFIG.match(/^export const SITE_URL = "[^"]*";$/gm)).toEqual(['export const SITE_URL = "";']);
        expect(fs.existsSync(path.join(ROOT, "site.webmanifest"))).toBe(false);
    });

    // a copy of the three pages, staged as the Pages workflow stages them
    function stage() {
        const dir = fs.mkdtempSync(path.join(os.tmpdir(), "lab-stage-"));
        for (const file of ["index.html", "about.html", "verify.html"]) {
            fs.copyFileSync(path.join(ROOT, file), path.join(dir, file));
        }
        return dir;
    }
    const metaTool = (root, args) => execFileSync(process.execPath, [path.join(root, "tools", "site-meta.mjs"), ...args], { encoding: "utf8" });
    const tags = (html) =>
        Object.fromEntries([...html.matchAll(/<meta (?:property|name)="((?:og|twitter):[^"]+)" content="([^"]*)">/g)].map((m) => [m[1], m[2].replace(/&amp;/g, "&").replace(/&quot;/g, '"')]));

    test("the deploy step writes each page's preview tags with the site's address, the picture's absolute URL, and the web manifest", async ({ page }) => {
        const dir = stage();
        try {
            metaTool(ROOT, ["--stage", dir, "--url", "https://example.github.io/sql-lab"]);
            const address = "https://example.github.io/sql-lab/";
            const description = /<meta name="description" content="([^"]*)">/.exec(read("index.html"))[1];
            const pages = { "index.html": "", "about.html": "about.html", "verify.html": "verify.html" };
            for (const [file, where] of Object.entries(pages)) {
                const html = fs.readFileSync(path.join(dir, file), "utf8");
                const t = tags(html);
                // the title a browser shows for the page (js/lab/brand.js writes it); the app's own
                // also names the database that is open, which a link preview leaves out
                await page.goto(`./${where}`);
                await expect(page).not.toHaveTitle(/^Loading/);
                const title = where ? await page.title() : APP_NAME;
                expect(await page.title()).toMatch(new RegExp(`(^| - )${APP_NAME}$`));
                expect(t, file).toEqual({
                    "og:type": "website",
                    "og:site_name": APP_NAME,
                    "og:title": title,
                    "og:description": /<meta name="description" content="([^"]*)">/.exec(read(file))[1],
                    "og:url": address + where,
                    "og:image": `${address}img/social.png`,
                    "og:image:width": "1200",
                    "og:image:height": "630",
                    "og:image:alt": `${APP_NAME}: ${/<meta name="description" content="([^"]*)">/.exec(read(file))[1]}`,
                    "twitter:card": "summary_large_image",
                });
                expect(html).toContain('<link rel="manifest" href="site.webmanifest">');
                // between the markers, which stay for the next run; the rest of the page as it was
                expect(html.slice(0, html.indexOf("<!-- social:begin -->"))).toBe(read(file).slice(0, read(file).indexOf("<!-- social:begin -->")));
                expect(html.slice(html.indexOf("<!-- social:end -->"))).toBe(read(file).slice(read(file).indexOf("<!-- social:end -->")));
            }
            expect(description.length).toBeGreaterThan(20);
            // a second run replaces the tags rather than adding more
            const once = fs.readFileSync(path.join(dir, "index.html"), "utf8");
            metaTool(ROOT, ["--stage", dir, "--url", "https://example.github.io/sql-lab/"]);
            expect(fs.readFileSync(path.join(dir, "index.html"), "utf8")).toBe(once);
            // the manifest: the app's name, its colours, its icons (files that exist), relative to the site
            const manifest = JSON.parse(fs.readFileSync(path.join(dir, "site.webmanifest"), "utf8"));
            const desk = /--desk:\s*(#[0-9A-Fa-f]{6})/.exec(read("css/tokens.css"))[1];
            expect(manifest).toMatchObject({ name: APP_NAME, short_name: APP_NAME, start_url: "./", scope: "./", background_color: desk, theme_color: desk });
            expect(manifest.icons.map((i) => [i.src, i.sizes, i.purpose ?? "any"])).toEqual([
                ["img/icon-192.png", "192x192", "any"],
                ["img/icon-512.png", "512x512", "any"],
                ["img/icon-maskable-512.png", "512x512", "maskable"],
            ]);
            for (const icon of manifest.icons) {
                expect(fs.existsSync(path.join(ROOT, icon.src)), icon.src).toBe(true);
            }
        } finally {
            fs.rmSync(dir, { recursive: true, force: true });
        }
    });

    test("without an address the tags that need one are left out; SITE_URL, once set, wins over the address Pages gives", () => {
        const dir = stage();
        try {
            metaTool(ROOT, ["--stage", dir]);
            const t = tags(fs.readFileSync(path.join(dir, "index.html"), "utf8"));
            expect(Object.keys(t).sort()).toEqual(["og:description", "og:site_name", "og:title", "og:type", "twitter:card"]);
            expect(t["twitter:card"]).toBe("summary");

            // the tool and config.js copied beside each other, with SITE_URL set (a custom domain)
            const root = fs.mkdtempSync(path.join(os.tmpdir(), "lab-root-"));
            try {
                fs.mkdirSync(path.join(root, "tools"));
                fs.mkdirSync(path.join(root, "js", "lab"), { recursive: true });
                fs.mkdirSync(path.join(root, "css"));
                fs.copyFileSync(path.join(ROOT, "tools", "site-meta.mjs"), path.join(root, "tools", "site-meta.mjs"));
                fs.copyFileSync(path.join(ROOT, "css", "tokens.css"), path.join(root, "css", "tokens.css"));
                fs.writeFileSync(path.join(root, "js", "lab", "config.js"), CONFIG.replace('export const SITE_URL = "";', 'export const SITE_URL = "https://lab.example.org/sql";'));
                metaTool(root, ["--stage", dir, "--url", "https://someone.github.io/fork/"]);
                const set = tags(fs.readFileSync(path.join(dir, "about.html"), "utf8"));
                expect(set["og:url"]).toBe("https://lab.example.org/sql/about.html");
                expect(set["og:image"]).toBe("https://lab.example.org/sql/img/social.png");
            } finally {
                fs.rmSync(root, { recursive: true, force: true });
            }
        } finally {
            fs.rmSync(dir, { recursive: true, force: true });
        }
    });

    test("siteAddress takes SITE_URL before the fallback, ends it with a slash, and refuses an address that is not http(s)", async () => {
        const { siteAddress, socialTags } = await import(pathToFileURL(path.join(ROOT, "tools", "site-meta.mjs")).href);
        expect(siteAddress("https://lab.example.org", "https://x.github.io/y")).toBe("https://lab.example.org/");
        expect(siteAddress("", "https://x.github.io/y")).toBe("https://x.github.io/y/");
        expect(siteAddress("", "https://x.github.io/y/?q=1#top")).toBe("https://x.github.io/y/");
        expect(siteAddress("", "")).toBeNull();
        expect(siteAddress("", undefined)).toBeNull();
        expect(() => siteAddress("ftp://x.example/", "")).toThrow(/http or https/);
        // text is written as attribute text, never as markup
        const lines = socialTags({ appName: 'A "lab" & <b>', title: "T", description: "D", address: null, pagePath: "" });
        expect(lines.join("\n")).toContain('content="A &quot;lab&quot; &amp; &lt;b&gt;"');
        expect(lines.join("\n")).not.toContain("<b>");
    });

    test("the Pages workflow runs the step with the address Pages gives, after staging and before the upload", () => {
        const yml = read(".github/workflows/pages.yml");
        expect(yml).toMatch(/- id: pages\n\s+uses: actions\/configure-pages@v6/);
        const step = yml.indexOf('run: node tools/site-meta.mjs --stage .site-stage --url "${{ steps.pages.outputs.base_url }}"');
        expect(step).toBeGreaterThan(yml.indexOf("rsync -a"));
        expect(step).toBeLessThan(yml.indexOf("actions/upload-pages-artifact"));
        // the tool needs no packages: Node's own modules only
        expect([...read("tools/site-meta.mjs").matchAll(/^import .* from "([^"]+)";$/gm)].map((m) => m[1]).every((m) => m.startsWith("node:"))).toBe(true);
    });
});
