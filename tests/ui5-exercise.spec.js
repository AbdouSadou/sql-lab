// UI plan, Phase 5: exercise mode (docs/design/SQL Lab UI and UX Plan.md, section 5 "Exercise mode";
// docs/design/mockup/exercise-correct.html and exercise-wrong.html). The prompt panel (the
// exercise's number and title, the prompt, a hint button that counts the hints, Previous and Next),
// Check answer as the filled primary, the feedback banner at the top of the results pane ("Correct.
// 12 rows match." with a tick that draws itself and Next exercise; "Not quite." and the checker's
// message), the Expected and Yours view of a row that differs, and the sidebar's progress. The
// plan's check: the whole sample set can be completed by keyboard alone.
const {
    test,
    expect,
    EDITOR_INPUT,
    editorValue,
    modelQuery,
    realSet,
    routeSet,
    tabTo,
} = require("./helpers");
const { RECIPES, CORRECT_SQL, WRONG_SQL } = require("./ui-states.js");

const SET = realSet();
const titleOf = (n) => SET.exercises[n - 1].title;
const PROGRESS_KEY = "sqllab.progress.retail-basics";

// a colour as the browser computes it, for a token
async function tokenColour(page, name) {
    return page.evaluate((n) => {
        const probe = document.createElement("span");
        probe.style.color = `var(${n})`;
        document.body.append(probe);
        const colour = getComputedStyle(probe).color;
        probe.remove();
        return colour;
    }, name);
}

// a set of one exercise, for a check whose model query is the test's own
function oneExercise(id, model_query, extra = {}) {
    return {
        id,
        title: `Set ${id}`,
        dataset: "northlight",
        exercises: [{ id: "x1", title: "Only one", prompt: "Answer it.", hints: [], model_query, ...extra }],
    };
}

async function check(app, sql) {
    await app.editor.fill(sql);
    await app.checkButton.click();
}

// records every text the results pane's live region takes (the empty ones left out)
async function recordSaid(page) {
    await page.evaluate(() => {
        window.__said = [];
        const region = document.getElementById("results-announce");
        new MutationObserver(() => {
            if (region.textContent) {
                window.__said.push(region.textContent);
            }
        }).observe(region, { childList: true, characterData: true, subtree: true });
    });
}
const said = (page) => page.evaluate(() => window.__said);

// the banner is never a live region, whatever its kind: the results pane's live region says it
// (a banner that were live too would be heard twice)
async function expectBannerNotLive(app) {
    const live = await app.feedback.evaluate((el) =>
        [el, ...el.querySelectorAll("*")]
            .filter((n) => n.hasAttribute("aria-live") || ["status", "alert", "log"].includes(n.getAttribute("role")))
            .map((n) => n.outerHTML.slice(0, 80))
    );
    expect(live, "live regions in the banner").toEqual([]);
}

// how full the sidebar's progress bar is drawn, from 0 to 1
const progressFill = (page) =>
    page.locator(".exercise-progress-fill").evaluate((fill) => fill.getBoundingClientRect().width / fill.parentElement.getBoundingClientRect().width);

// ---- the plan's check ---------------------------------------------------------------------------

test.describe("the whole sample set by keyboard alone", () => {
    test("open the set, then answer, check and move on through all ten exercises without a pointer", async ({ page, app }) => {
        test.setTimeout(240_000);
        await app.open();
        // any pointer at all would show here: the whole session is keys
        await page.evaluate(() => {
            window.__pointer = 0;
            for (const type of ["pointerdown", "mousedown", "touchstart"]) {
                window.addEventListener(type, () => window.__pointer++, true);
            }
        });

        // the Exercises tab (from the editor, focused after the load: out with Escape, back to the
        // tabs, the arrow key along them), its set picker, the set
        await expect(app.editor).toBeFocused();
        await page.keyboard.press("Escape");
        expect(await tabTo(page, "#tab-schema", { back: true }), "Shift+Tab reaches the Schema tab").toBe(true);
        await page.keyboard.press("ArrowRight");
        await expect(app.tab("exercises")).toBeFocused();
        expect(await tabTo(page, "#exercise-set-picker"), "Tab reaches the set picker").toBe(true);
        await page.keyboard.press("Enter");
        await expect(app.setMenu).toBeVisible();
        await page.keyboard.press("ArrowDown");
        await expect(app.setMenu.getByRole("menuitemradio", { name: SET.title, exact: true })).toBeFocused();
        await page.keyboard.press("Enter");
        await expect(app.exercisePanel).toBeVisible();
        await app.waitReady();

        for (const [i, exercise] of SET.exercises.entries()) {
            const n = i + 1;
            await expect(app.exerciseButton(n)).toHaveAttribute("aria-current", "true");
            await expect(app.prompt).toContainText(exercise.title);
            if (n === 1) {
                expect(await tabTo(page, EDITOR_INPUT), "Tab reaches the editor").toBe(true);
            } else {
                // Next exercise put the focus in the editor
                await expect(app.editor).toBeFocused();
            }
            // the student types the answer and checks it with Ctrl+Shift+Enter
            await page.keyboard.press("Control+A");
            await page.keyboard.type(exercise.model_query);
            await page.keyboard.press("Control+Shift+Enter");
            await expect(app.feedback.locator(".verdict--pass")).toBeVisible();
            await expect(app.feedback.locator(".verdict-headline")).toHaveText("Correct.");
            // the tick in the sidebar and the progress line follow at once
            await expect(app.progress).toHaveText(`${n} of 10 complete`);
            await expect(app.exerciseButton(n)).toHaveAttribute("aria-label", `Exercise ${n} of 10: ${exercise.title}, passed`);
            if (n < SET.exercises.length) {
                // out of the editor (Escape, then Tab), to the banner's Next exercise, and Enter
                await page.keyboard.press("Escape");
                expect(await tabTo(page, "#exercise-feedback .verdict-next"), `Tab reaches Next exercise after ${exercise.id}`).toBe(true);
                await expect(page.locator(":focus")).toHaveText("Next exercise");
                await page.keyboard.press("Enter");
            }
        }

        await expect(app.progress).toHaveText("10 of 10 complete");
        expect(await progressFill(page)).toBeCloseTo(1, 2);
        await expect(app.feedback).toContainText("All 10 exercises complete. Well done.");
        await expect(app.feedback.getByRole("button")).toHaveCount(0);
        for (let n = 1; n <= 10; n++) {
            await expect(app.exerciseButton(n).locator(".exercise-mark-passed")).toBeVisible();
        }
        expect(JSON.parse(await page.evaluate((key) => localStorage.getItem(key), PROGRESS_KEY)).passed).toEqual(
            Object.fromEntries(SET.exercises.map((e) => [e.id, true]))
        );
        expect(await page.evaluate(() => window.__pointer), "pointer events").toBe(0);
    });
});

// ---- the prompt panel -------------------------------------------------------------------------

test.describe("the prompt panel", () => {
    test("number and title, then the prompt in 16 px, then the hint button at the left and Previous and Next at the right", async ({ page, app }) => {
        await page.setViewportSize({ width: 1366, height: 768 });
        await app.openSet("retail-basics", { ex: "e05" });
        await expect(app.prompt.locator(".exercise-title")).toHaveText(titleOf(5));
        await expect(app.prompt.locator(".exercise-kicker")).toHaveText("Exercise 5 of 10");
        expect(await app.prompt.locator(".exercise-text").evaluate((p) => getComputedStyle(p).fontSize)).toBe("16px");
        // 12 px between the title's line and the prompt, the panel's own gap (the mockup's)
        const title = await app.prompt.locator(".exercise-heading").boundingBox();
        const prompt = await app.prompt.locator(".exercise-text").boundingBox();
        expect(Math.round(prompt.y - (title.y + title.height))).toBe(12);
        const hint = await app.hintButton.boundingBox();
        const previous = await page.locator("#exercise-previous").boundingBox();
        const next = await page.locator("#exercise-next").boundingBox();
        const text = await app.prompt.locator(".exercise-text").boundingBox();
        const panel = await page.locator("#exercise-panel").evaluate((el) => {
            const r = el.getBoundingClientRect();
            return { right: r.right - parseFloat(getComputedStyle(el).paddingRight) };
        });
        // one row, under the prompt: the hint button first, Previous and Next at the far right
        expect(hint.y).toBeGreaterThan(text.y + text.height - 1);
        expect(Math.abs(hint.y + hint.height / 2 - (next.y + next.height / 2))).toBeLessThanOrEqual(1);
        expect(previous.x).toBeGreaterThan(hint.x + hint.width);
        expect(next.x).toBeGreaterThan(previous.x + previous.width - 1);
        expect(Math.abs(next.x + next.width - panel.right)).toBeLessThanOrEqual(1);
        // the three are the panel's controls, 32 px high like every control
        for (const box of [hint, previous, next]) {
            expect(box.height).toBe(32);
        }
        // Previous and Next are quiet buttons, named by what they say, grouped under one name
        await expect(page.getByRole("group", { name: "Move between exercises" })).toBeVisible();
        await expect(page.locator("#exercise-previous")).toHaveText("Previous");
        await expect(page.locator("#exercise-next")).toHaveText("Next");
        await expect(page.locator("#exercise-next")).toHaveClass(/button--quiet/);
    });

    test("Previous and Next move through the set in order, keep the focus, say where they go, and stop at the ends", async ({ page, app }) => {
        await app.openSet();
        const previous = page.locator("#exercise-previous");
        const next = page.locator("#exercise-next");
        // at the first exercise Previous goes nowhere, and says why; Next names exercise 2
        await expect(previous).toHaveAttribute("aria-disabled", "true");
        await expect(previous).toHaveAccessibleDescription("This is the first exercise of the set.");
        await expect(next).not.toHaveAttribute("aria-disabled", /./);
        await expect(next).toHaveAccessibleDescription(`Exercise 2 of 10: ${titleOf(2)}`);
        // pressing Previous there changes nothing, and the focus stays on it
        await previous.focus();
        await page.keyboard.press("Enter");
        await expect(previous).toBeFocused();
        await expect(app.exerciseButton(1)).toHaveAttribute("aria-current", "true");

        // a draft for exercise 1, then Next by keyboard: exercise 2, its own (empty) text, the
        // address and the announcement follow, as for any change of exercise
        await app.editor.fill("SELECT 'draft one';");
        await next.focus();
        await page.keyboard.press("Enter");
        await expect(app.exerciseButton(2)).toHaveAttribute("aria-current", "true");
        await expect(next).toBeFocused();
        await expect(app.prompt).toContainText(titleOf(2));
        expect((await editorValue(page)).trim()).toBe("");
        expect(new URL(page.url()).search).toBe("?set=retail-basics&ex=e02");
        await expect(page.locator("#exercise-announce")).toHaveText(`Exercise 2 of 10: ${titleOf(2)}. ${SET.exercises[1].prompt}`);
        await expect(previous).not.toHaveAttribute("aria-disabled", /./);
        await expect(previous).toHaveAccessibleDescription(`Exercise 1 of 10: ${titleOf(1)}`);
        await expect(next).toHaveAccessibleDescription(`Exercise 3 of 10: ${titleOf(3)}`);

        // Space works too; Previous brings exercise 1 back with its draft
        await previous.focus();
        await page.keyboard.press(" ");
        await expect(app.exerciseButton(1)).toHaveAttribute("aria-current", "true");
        expect((await editorValue(page)).trim()).toBe("SELECT 'draft one';");

        // the last exercise: Next goes nowhere, says why, and keeps the focus (pressed from the
        // keyboard, and clicked: Playwright will not click an aria-disabled button unforced)
        await app.exerciseButton(10).click();
        await expect(next).toHaveAttribute("aria-disabled", "true");
        await expect(next).toHaveAccessibleDescription("This is the last exercise of the set.");
        await next.focus();
        await page.keyboard.press("Enter");
        await next.click({ force: true });
        await expect(app.exerciseButton(10)).toHaveAttribute("aria-current", "true");
        await expect(next).toBeFocused();
        await expect(previous).toHaveAccessibleDescription(`Exercise 9 of 10: ${titleOf(9)}`);
        await previous.click();
        await expect(app.exerciseButton(9)).toHaveAttribute("aria-current", "true");
    });

    test("moving with Next clears the banner and the old result, as choosing from the list does", async ({ page, app }) => {
        await app.openSet();
        await check(app, "SELECT 1 AS one;");
        await expect(app.feedback.locator(".verdict--fail")).toBeVisible();
        await expect(app.table).toHaveCount(1);
        await page.locator("#exercise-next").click();
        await expect(app.feedback).toBeHidden();
        await expect(app.feedback).toBeEmpty();
        await expect(app.table).toHaveCount(0);
        await expect(app.pane).toHaveAttribute("data-state", "empty");
    });

    test("the hint button counts the hints, and the hints shown sit under the buttons", async ({ page, app }) => {
        await app.openSet("retail-basics", { ex: "e05" });
        const total = SET.exercises[4].hints.length;
        expect(total).toBe(3);
        for (let n = 1; n <= total; n++) {
            await expect(app.hintButton).toHaveText(`Show hint (${n} of ${total})`);
            await app.hintButton.click();
            await expect(app.hints.locator("li")).toHaveCount(n);
        }
        await expect(app.hintButton).toBeHidden();
        // the list comes after the row of buttons, in the page and on screen, so the button that is
        // pressed again and again stays where it is
        const order = await page.evaluate(() => {
            const controls = document.querySelector(".exercise-controls");
            const hints = document.getElementById("exercise-hints");
            return {
                after: Boolean(controls.compareDocumentPosition(hints) & Node.DOCUMENT_POSITION_FOLLOWING),
                below: hints.getBoundingClientRect().top >= controls.getBoundingClientRect().bottom,
            };
        });
        expect(order).toEqual({ after: true, below: true });
        // each hint's number stands on the panel's left edge, with the prompt and the buttons, and the
        // hint's text after it (its lines hang after the number)
        const edges = await page.evaluate(() => {
            const prompt = document.querySelector("#exercise-prompt .exercise-text").getBoundingClientRect().left;
            return [...document.querySelectorAll("#exercise-hints li")].map((li) => {
                const range = document.createRange();
                range.selectNodeContents(li.lastChild);
                return { box: li.getBoundingClientRect().left - prompt, text: range.getBoundingClientRect().left - prompt, marker: getComputedStyle(li, "::before").content };
            });
        });
        expect(edges.map((e) => [Math.round(e.box), e.marker])).toEqual([
            [0, 'counter(hint) "."'],
            [0, 'counter(hint) "."'],
            [0, 'counter(hint) "."'],
        ]);
        for (const e of edges) {
            expect(e.text).toBeGreaterThan(8);
        }
        // and still a list, with its role, for a screen reader
        await expect(app.hints).toHaveAttribute("role", "list");
        // Previous and Next stay at the right after the hint button went
        await expect(page.locator("#exercise-next")).toBeVisible();
    });

    test("a hint shown at the foot of a capped prompt is brought into view", async ({ page, app }) => {
        // a short window: the prompt is capped and scrolls inside
        await page.setViewportSize({ width: 1024, height: 520 });
        await app.openSet("retail-basics", { ex: "e05" });
        const panel = page.locator("#exercise-panel");
        expect(await panel.evaluate((el) => el.scrollHeight > el.clientHeight)).toBe(true);
        await app.hintButton.click();
        await app.hintButton.click();
        const last = app.hints.locator("li").last();
        const seen = await last.evaluate((li) => {
            const box = li.getBoundingClientRect();
            const view = li.closest("#exercise-panel").getBoundingClientRect();
            return box.top >= view.top - 1 && box.bottom <= view.bottom + 1;
        });
        expect(seen).toBe(true);
    });
});

// ---- the feedback banner ------------------------------------------------------------------------

test.describe("the feedback banner", () => {
    test("a pass: the band across the top of the results pane, the drawn tick, 'Correct. 5 rows match.' and Next exercise at its end", async ({ page, app }) => {
        await page.setViewportSize({ width: 1366, height: 768 });
        await app.openSet("retail-basics", { ex: "e05" });
        await recordSaid(page);
        await check(app, CORRECT_SQL);
        const verdict = app.feedback.locator(".verdict--pass");
        await expect(verdict).toBeVisible();
        const band = verdict.locator(".verdict-band");
        // the words: the headline in 600, the sentence after it on the same line, 16 px
        await expect(band.locator(".verdict-headline")).toHaveText("Correct.");
        await expect(band.locator(".verdict-message")).toHaveText("5 rows match.");
        await expect(band.locator(".verdict-text")).toHaveText("Correct. 5 rows match.");
        const look = await band.evaluate((el) => {
            const head = el.querySelector(".verdict-headline").getBoundingClientRect();
            const message = el.querySelector(".verdict-message").getBoundingClientRect();
            const pane = document.getElementById("results-pane").getBoundingClientRect();
            const box = el.getBoundingClientRect();
            const next = el.querySelector(".verdict-next").getBoundingClientRect();
            return {
                background: getComputedStyle(el).backgroundColor,
                border: getComputedStyle(el).borderTopStyle,
                weight: getComputedStyle(el.querySelector(".verdict-headline")).fontWeight,
                size: getComputedStyle(el.querySelector(".verdict-text")).fontSize,
                oneLine: Math.abs(head.top - message.top) < 2,
                top: box.top - pane.top,
                left: box.left - pane.left,
                right: pane.right - box.right,
                nextRight: box.right - next.right,
                nextMiddle: Math.abs(next.top + next.height / 2 - (box.top + box.height / 2)),
            };
        });
        expect(look).toMatchObject({ border: "none", weight: "600", size: "16px", oneLine: true, top: 0, left: 0 });
        expect(look.background).toBe(await tokenColour(page, "--success-subtle"));
        // the band reaches both sides of the pane (its scrollbar aside)
        expect(look.right).toBeLessThanOrEqual(16);
        // Next exercise at the end of the band, in the middle of it, 24 px in from the edge
        expect(Math.round(look.nextRight)).toBe(24);
        expect(look.nextMiddle).toBeLessThanOrEqual(1);
        // the tick: the circle and the tick drawn inline (each of length 1), in the success green
        const tick = band.locator("svg.verdict-mark");
        await expect(tick).toHaveClass(/verdict-tick/);
        await expect(tick).toHaveAttribute("aria-hidden", "true");
        expect(await tick.evaluate((svg) => [...svg.children].map((c) => [c.localName, c.getAttribute("pathLength")]))).toEqual([
            ["circle", "1"],
            ["path", "1"],
        ]);
        expect(await tick.evaluate((svg) => getComputedStyle(svg).color)).toBe(await tokenColour(page, "--success"));
        // said once, in words, by the results pane's live region (the banner is not live)
        await expect.poll(() => said(page)).toEqual(["Correct. 5 rows match."]);
        expect(await app.feedback.evaluate((el) => [el, ...el.querySelectorAll("*")].some((n) => n.hasAttribute("aria-live") || n.getAttribute("role") === "status"))).toBe(false);
        // the student's own result stays under the banner, as for any run
        await expect(app.status).toHaveText(/^5 rows in \d+ ms$/);
        await expect(app.table).toBeVisible();
    });

    test("the tick draws itself over 300 ms (the circle, then the tick) and the banner fades in over 120 ms", async ({ page, app }) => {
        await page.emulateMedia({ reducedMotion: "no-preference" });
        await app.openSet("retail-basics", { ex: "e05" });
        await check(app, CORRECT_SQL);
        await expect(app.feedback.locator(".verdict--pass")).toBeVisible();
        const motion = await app.feedback.evaluate((el) => {
            const shapes = [...el.querySelectorAll(".verdict-tick > *")].map((shape) => {
                const s = getComputedStyle(shape);
                return { name: s.animationName, duration: s.animationDuration, delay: s.animationDelay, dash: s.strokeDasharray };
            });
            const box = getComputedStyle(el.querySelector(".verdict"));
            return { shapes, banner: { name: box.animationName, duration: box.animationDuration } };
        });
        expect(motion.shapes).toEqual([
            { name: "verdict-draw", duration: "0.2s", delay: "0s", dash: "1px, 1.2px" },
            { name: "verdict-draw", duration: "0.15s", delay: "0.15s", dash: "1px, 1.2px" },
        ]);
        expect(motion.banner).toEqual({ name: "menu-fade", duration: "0.12s" });
        // and drawn by the end: no dash left to draw
        await expect
            .poll(() => app.feedback.evaluate((el) => [...el.querySelectorAll(".verdict-tick > *")].map((s) => getComputedStyle(s).strokeDashoffset)))
            .toEqual(["0px", "0px"]);
    });

    test("with reduced motion the tick is there at once and the banner does not fade", async ({ page, app }) => {
        await page.emulateMedia({ reducedMotion: "reduce" });
        await app.openSet("retail-basics", { ex: "e05" });
        await check(app, CORRECT_SQL);
        await expect(app.feedback.locator(".verdict--pass")).toBeVisible();
        const motion = await app.feedback.evaluate((el) => ({
            shapes: [...el.querySelectorAll(".verdict-tick > *")].map((s) => [getComputedStyle(s).animationName, getComputedStyle(s).strokeDashoffset]),
            banner: getComputedStyle(el.querySelector(".verdict")).animationName,
        }));
        expect(motion).toEqual({ shapes: [["none", "0px"], ["none", "0px"]], banner: "none" });
    });

    test("one row matches, and no rows match: the sentence counts them", async ({ page, app }) => {
        await app.openSet("retail-basics", { ex: "e07" });
        await check(app, modelQuery("e07"));
        await expect(app.feedback.locator(".verdict-message").first()).toHaveText("1 row matches.");
        await routeSet(page, "empty-result", oneExercise("empty-result", "SELECT product_name FROM products WHERE 0;"));
        await page.goto("./?set=empty-result");
        await expect(app.exercisePanel).toBeVisible();
        await app.waitReady();
        await check(app, "SELECT product_name FROM products WHERE unit_price < 0;");
        await expect(app.feedback.locator(".verdict--pass .verdict-message").first()).toHaveText("No rows, as expected.");
        // a set of one exercise is complete in words that fit one
        await expect(app.feedback.locator(".verdict-complete")).toHaveText("The set is complete. Well done.");
    });

    test("the last exercise passed: the set is complete on a line of its own, and no Next exercise", async ({ page, app }) => {
        await RECIPES.shell.states["exercise-complete"](page);
        const band = app.feedback.locator(".verdict-band");
        await expect(band.locator(".verdict-complete")).toHaveText("All 10 exercises complete. Well done.");
        const lines = await band.evaluate((el) => {
            const head = el.querySelector(".verdict-headline").getBoundingClientRect();
            const done = el.querySelector(".verdict-complete").getBoundingClientRect();
            return done.top >= head.bottom - 1;
        });
        expect(lines).toBe(true);
        await expect(app.feedback.getByRole("button")).toHaveCount(0);
        await expect(app.progress).toHaveText("10 of 10 complete");
    });

    test("not quite: the cross, 'Not quite.' and the checker's message, which starts with a capital and ends with a full stop on screen", async ({ page, app }) => {
        await app.openSet("retail-basics", { ex: "e05" });
        await recordSaid(page);
        await check(app, "SELECT DISTINCT category FROM products ORDER BY category;");
        const verdict = app.feedback.locator(".verdict--fail");
        await expect(verdict).toBeVisible();
        await expect(verdict.locator(".verdict-headline")).toHaveText("Not quite.");
        // the checker's text, as it is ...
        await expect(verdict.locator(".verdict-message")).toHaveText("expected 2 columns, got 1");
        // ... drawn as a sentence after the headline: a capital, a full stop
        const drawn = await verdict.locator(".verdict-message").evaluate((p) => ({
            first: getComputedStyle(p, "::first-letter").textTransform,
            after: getComputedStyle(p, "::after").content,
        }));
        expect(drawn).toEqual({ first: "uppercase", after: '"."' });
        // the cross, in the danger red, on the danger tint; no table for this kind
        const mark = verdict.locator(".verdict-mark");
        await expect(mark.locator("use")).toHaveAttribute("href", "#icon-circle-x");
        expect(await mark.evaluate((svg) => getComputedStyle(svg).color)).toBe(await tokenColour(page, "--danger"));
        expect(await verdict.locator(".verdict-band").evaluate((el) => getComputedStyle(el).backgroundColor)).toBe(
            await tokenColour(page, "--danger-subtle")
        );
        await expect(verdict.locator("table")).toHaveCount(0);
        await expect.poll(() => said(page)).toEqual(["Not quite. expected 2 columns, got 1."]);
        await expectBannerNotLive(app);
    });

    test("a Check of a query with an error: the banner points at the run's error band instead of repeating it, and the message is said", async ({ page, app }) => {
        await app.openSet();
        await recordSaid(page);
        await check(app, "SELECT nope FROM products;");
        await app.settle();
        const message = app.feedback.locator(".verdict--fail .verdict-message");
        await expect(message).toHaveText("This query has an error, shown below.");
        // SQLite's message is on screen once: in the error band of the run, under the banner
        await expect(app.pane).toHaveAttribute("data-state", "error");
        await expect(app.errorBand.locator(".results-band-message")).toHaveText("no such column: nope");
        expect(await page.evaluate(() => document.getElementById("results-pane").innerText.split("no such column: nope").length - 1)).toBe(1);
        // and it is what is said, once, with the verdict
        await expect.poll(() => said(page)).toEqual(["Not quite. no such column: nope."]);
        await expectBannerNotLive(app);
    });

    test("an engine error only the original database gives is the engine's message as it is, in mono, not recased, with the working-copy note", async ({ page, app }) => {
        await app.openSet();
        // the student's working copy has the table, the original database (which Check uses) does not
        await app.run("CREATE TABLE mine (x); INSERT INTO mine VALUES (1);");
        // (what that run says is said before the Check starts)
        await expect(app.announcer).toHaveText("Done. 1 row changed.");
        await recordSaid(page);
        await check(app, "SELECT x FROM mine;");
        await app.settle();
        await expect(app.pane).toHaveAttribute("data-state", "result");
        const message = app.feedback.locator(".verdict--fail .verdict-message");
        await expect(message).toHaveText("no such table: mine");
        expect(await message.evaluate((p) => p.className)).toBe("verdict-message");
        const look = await message.locator(".verdict-engine").evaluate((span) => ({
            family: getComputedStyle(span).fontFamily,
            first: getComputedStyle(span.parentElement, "::first-letter").textTransform,
        }));
        expect(look.family).toContain("Atkinson Hyperlegible Mono");
        expect(look.first).toBe("none");
        await expect(app.feedback.locator(".verdict-note")).toContainText("working copy");
        await expect.poll(() => said(page)).toEqual([
            "Not quite. no such table: mine. Your query ran on your working copy of the dataset, but Check runs it on the original dataset.",
        ]);
        await expectBannerNotLive(app);
    });

    test("a Check from the keyboard while the focus is on the banner keeps a focus, with its ring: on the new Next exercise, else on the banner", async ({ page, app }) => {
        await app.openSet("retail-basics", { ex: "e05" });
        await check(app, CORRECT_SQL);
        const next = app.feedback.locator(".verdict-next");
        await expect(next).toBeVisible();
        // the keyboard user's way to Next exercise: out of the editor, then Tab
        const toNext = async () => {
            await app.editor.focus();
            await page.keyboard.press("Escape");
            expect(await tabTo(page, "#exercise-feedback .verdict-next")).toBe(true);
        };
        const ring = (locator) => locator.evaluate((el) => ({ style: getComputedStyle(el).outlineStyle, offset: getComputedStyle(el).outlineOffset }));
        await toNext();
        // checked again (Ctrl+Shift+Enter works from anywhere): the banner is drawn anew, and the
        // focus is on its Next exercise, ring and all
        await page.evaluate(() => {
            window.__old = document.querySelector("#exercise-feedback .verdict");
        });
        await page.keyboard.press("Control+Shift+Enter");
        await expect.poll(() => page.evaluate(() => document.querySelector("#exercise-feedback .verdict") !== window.__old)).toBe(true);
        await expect(next).toBeFocused();
        expect((await ring(next)).style).toBe("solid");
        await expect(app.feedback.locator(".verdict")).toHaveCount(1);
        // a wrong answer has no Next exercise: the banner itself takes the focus, its ring inside it
        await app.editor.fill(WRONG_SQL);
        await toNext();
        await page.keyboard.press("Control+Shift+Enter");
        await expect(app.feedback.locator(".verdict--fail")).toBeVisible();
        await expect(app.feedback.locator(".verdict")).toHaveCount(1);
        await expect(app.feedback.locator(".verdict")).toBeFocused();
        expect(await ring(app.feedback.locator(".verdict"))).toEqual({ style: "solid", offset: "-2px" });
    });

    test("a new verdict is in sight even when the student had scrolled the pane down past the last one", async ({ page, app }) => {
        await page.setViewportSize({ width: 1366, height: 768 });
        await app.openSet("retail-basics", { ex: "e05" });
        await check(app, WRONG_SQL);
        await expect(app.feedback.locator(".verdict--fail table")).toHaveCount(2);
        // the banner and its tables are taller than the pane: the student scrolls down to their rows
        const pane = app.pane;
        expect(await pane.evaluate((el) => el.scrollHeight > el.clientHeight)).toBe(true);
        await pane.evaluate((el) => {
            el.scrollTop = el.scrollHeight;
        });
        expect(await pane.evaluate((el) => el.scrollTop)).toBeGreaterThan(60);
        // and checks again: the new banner's headline is inside the pane's window
        await check(app, WRONG_SQL);
        await expect.poll(() => pane.evaluate((el) => el.scrollTop)).toBe(0);
        const inSight = await page.evaluate(() => {
            const head = document.querySelector("#exercise-feedback .verdict-headline").getBoundingClientRect();
            const box = document.getElementById("results-pane").getBoundingClientRect();
            return head.top >= box.top && head.bottom <= box.bottom;
        });
        expect(inSight).toBe(true);
    });

    test("an exercise that cannot be checked: the alert sign, 'Not checked.' and the reason, in the caution colours", async ({ page, app }) => {
        await routeSet(page, "broken-model", oneExercise("broken-model", "SELECT nope FROM nowhere;"));
        await page.goto("./?set=broken-model");
        await expect(app.exercisePanel).toBeVisible();
        await app.waitReady();
        await recordSaid(page);
        await check(app, "SELECT 1;");
        const verdict = app.feedback.locator(".verdict--warning");
        await expect(verdict).toBeVisible();
        await expect(verdict.locator(".verdict-headline")).toHaveText("Not checked.");
        await expect(verdict.locator(".verdict-message")).toHaveText("This exercise cannot be checked right now. Please tell your instructor.");
        await expect(verdict.locator(".verdict-mark use")).toHaveAttribute("href", "#icon-circle-alert");
        expect(await verdict.locator(".verdict-band").evaluate((el) => getComputedStyle(el).backgroundColor)).toBe(
            await tokenColour(page, "--warning-subtle")
        );
        expect(await verdict.locator(".verdict-mark").evaluate((svg) => getComputedStyle(svg).color)).toBe(await tokenColour(page, "--warning"));
        await expect.poll(() => said(page)).toEqual(["Not checked. This exercise cannot be checked right now. Please tell your instructor."]);
        await expectBannerNotLive(app);
    });

    test("Check with nothing written: an 'i', 'Nothing to check.' and what to do, said, and nothing runs", async ({ page, app }) => {
        await app.openSet();
        await recordSaid(page);
        await page.evaluate(() => {
            window.__runs = 0;
            document.addEventListener("lab:run-finished", () => window.__runs++);
        });
        await check(app, "");
        const verdict = app.feedback.locator(".verdict--info");
        await expect(verdict.locator(".verdict-headline")).toHaveText("Nothing to check.");
        await expect(verdict.locator(".verdict-message")).toHaveText("Write a query first, then press Check answer.");
        await expect(verdict.locator(".verdict-mark use")).toHaveAttribute("href", "#icon-info");
        expect(await verdict.locator(".verdict-band").evaluate((el) => getComputedStyle(el).backgroundColor)).toBe(await tokenColour(page, "--sunken"));
        await expect.poll(() => said(page)).toEqual(["Nothing to check. Write a query first, then press Check answer."]);
        expect(await page.evaluate(() => window.__runs)).toBe(0);
        await expectBannerNotLive(app);
    });

    test("a pass shows its tick in the sidebar and moves the progress line in the same moment as the banner", async ({ page, app }) => {
        await app.openSet("retail-basics", { ex: "e05" });
        // what the sidebar shows at the instant the banner is drawn
        await page.evaluate(() => {
            const feedback = document.getElementById("exercise-feedback");
            new MutationObserver(() => {
                if (feedback.querySelector(".verdict--pass") && !window.__atBanner) {
                    const item = document.querySelectorAll("#exercise-list button")[4];
                    const fill = document.querySelector(".exercise-progress-fill");
                    window.__atBanner = {
                        progress: document.getElementById("exercise-progress").textContent,
                        bar: Math.round((100 * fill.getBoundingClientRect().width) / fill.parentElement.getBoundingClientRect().width),
                        tick: !item.querySelector(".exercise-mark-passed").classList.contains("hidden"),
                        label: item.getAttribute("aria-label"),
                    };
                }
            }).observe(feedback, { childList: true });
        });
        expect(await progressFill(page)).toBe(0);
        await check(app, CORRECT_SQL);
        await expect(app.feedback.locator(".verdict--pass")).toBeVisible();
        expect(await page.evaluate(() => window.__atBanner)).toEqual({
            progress: "1 of 10 complete",
            bar: 10,
            tick: true,
            label: `Exercise 5 of 10: ${titleOf(5)}, passed`,
        });
    });

    test("in exercise mode Check answer is the one filled button, and Run beside it is outlined", async ({ page, app }) => {
        await app.openSet();
        const look = await page.evaluate(() => {
            const filled = [...document.querySelectorAll("button")].filter((b) => {
                const s = getComputedStyle(b);
                return b.offsetParent !== null && s.backgroundColor === getComputedStyle(document.getElementById("exercise-check")).backgroundColor;
            });
            const run = getComputedStyle(document.getElementById("execute"));
            return { filled: filled.map((b) => b.id), runBorder: run.borderTopStyle, runWeight: run.fontWeight };
        });
        expect(look.filled).toEqual(["exercise-check"]);
        expect(look.runBorder).toBe("solid");
        expect(look.runWeight).toBe("400");
    });
});

// ---- Expected and Yours -------------------------------------------------------------------------

test.describe("Expected and Yours", () => {
    test("side by side, ruled, the rows numbered; the cells of Yours that differ are outlined and say so", async ({ page, app }) => {
        await page.setViewportSize({ width: 1366, height: 768 });
        await app.openSet("retail-basics", { ex: "e05" });
        await check(app, WRONG_SQL);
        const verdict = app.feedback.locator(".verdict--fail");
        await expect(verdict.locator(".verdict-message")).toHaveText("Row 1 is the first that differs.");
        // a sentence of the checker's own keeps its one full stop: none is drawn after it
        await expect(verdict.locator(".verdict-message")).not.toHaveClass(/verdict-message--fragment/);
        expect(await verdict.locator(".verdict-message").evaluate((p) => getComputedStyle(p, "::after").content)).toBe("none");
        await expectBannerNotLive(app);
        const tables = verdict.locator("table");
        await expect(tables).toHaveCount(2);
        await expect(tables.nth(0).locator("caption")).toHaveText("Expected");
        await expect(tables.nth(1).locator("caption")).toHaveText("Yours");
        // side by side, tops level, Expected first
        const [expected, yours] = [await tables.nth(0).boundingBox(), await tables.nth(1).boundingBox()];
        expect(Math.abs(expected.y - yours.y)).toBeLessThanOrEqual(1);
        expect(yours.x).toBeGreaterThan(expected.x + expected.width);
        // the rows the checker shows, numbered from the first that differs
        await expect(tables.nth(0).locator("tbody th[scope=row]")).toHaveText(["1", "2", "3"]);
        await expect(tables.nth(1).locator("tbody th[scope=row]")).toHaveText(["1", "2", "3"]);
        // the cells that read differently: rows 1 and 2 (Stationery and Food & Drink sold least), not
        // row 3 (Clothing is third either way)
        const marks = await tables.nth(1).locator("tbody tr").evaluateAll((rows) =>
            rows.map((tr) => [...tr.querySelectorAll("td")].map((td) => td.classList.contains("verdict-cell--differs")))
        );
        expect(marks).toEqual([
            [true, true],
            [true, true],
            [false, false],
        ]);
        await expect(tables.nth(0).locator(".verdict-cell--differs")).toHaveCount(0);
        // an outline in the danger red, and the words for those who do not see it
        const cell = tables.nth(1).locator(".verdict-cell--differs").first();
        const outline = await cell.evaluate((td) => ({ style: getComputedStyle(td).outlineStyle, width: getComputedStyle(td).outlineWidth, colour: getComputedStyle(td).outlineColor }));
        expect(outline).toMatchObject({ style: "solid", width: "2px" });
        expect(outline.colour).toBe(await tokenColour(page, "--danger"));
        await expect(cell).toHaveText("Stationery (differs)");
        await expect(cell.locator(".visually-hidden")).toHaveText(" (differs)");
        await expect(verdict.locator(".verdict-diff-note")).toHaveText("Outlined cells differ from the expected result.");
        // ruled as the result table: 2 px ink above the header and under the last row; numbers right
        const ruled = await tables.nth(0).evaluate((table) => {
            const head = getComputedStyle(table.querySelector("thead th"));
            const last = getComputedStyle(table.querySelector("tbody tr:last-child td"));
            const cells = [...table.querySelector("tbody tr").querySelectorAll("td")].map((td) => getComputedStyle(td).textAlign);
            return { top: head.borderTopWidth, under: head.borderBottomWidth, last: last.borderBottomWidth, cells, mono: getComputedStyle(table).fontFamily };
        });
        expect(ruled).toMatchObject({ top: "2px", under: "1px", last: "2px", cells: ["left", "right"] });
        expect(ruled.mono).toContain("Atkinson Hyperlegible Mono");
    });

    test("a first row that differs where the table cannot show it is outlined whole, with a note that says why", async ({ page, app }) => {
        // the number 3 against the text '3': the same on screen, a different value
        await routeSet(page, "hidden-diff", oneExercise("hidden-diff", "SELECT 3 AS n, 'a' AS s;", { order_matters: true }));
        await page.goto("./?set=hidden-diff");
        await expect(app.exercisePanel).toBeVisible();
        await app.waitReady();
        await check(app, "SELECT '3' AS n, 'a' AS s;");
        const yours = app.feedback.locator("table").nth(1);
        await expect(yours.locator("td.verdict-cell--differs")).toHaveCount(2);
        await expect(app.feedback.locator(".verdict-diff-note")).toHaveText([
            "Outlined cells differ from the expected result.",
            "Row 1 differs from the expected row in something the table cannot show, such as the end of a long value, or a value of another type: text, a number or NULL.",
        ]);
        // a difference the table shows needs no such note
        await check(app, "SELECT 4 AS n, 'a' AS s;");
        await expect(app.feedback.locator(".verdict-diff-note")).toHaveCount(1);
        await expect(yours.locator("td.verdict-cell--differs")).toHaveText(["4 (differs)"]);
    });

    test("the rows are numbered from the first that differs, as in the whole result", async ({ page, app }) => {
        const numbers = (last) => [1, 2, 3, 4, 5].map((n) => `SELECT ${n === 3 ? last : n} AS n`).join(" UNION ALL ") + ";";
        await routeSet(page, "late-diff", oneExercise("late-diff", numbers(3), { order_matters: true }));
        await page.goto("./?set=late-diff");
        await expect(app.exercisePanel).toBeVisible();
        await app.waitReady();
        await check(app, numbers(9));
        await expect(app.feedback.locator(".verdict-message")).toHaveText("Row 3 is the first that differs.");
        const tables = app.feedback.locator("table");
        await expect(tables.nth(0).locator("tbody th[scope=row]")).toHaveText(["3", "4", "5"]);
        await expect(tables.nth(1).locator("tbody th[scope=row]")).toHaveText(["3", "4", "5"]);
        await expect(tables.nth(0).locator("tbody td")).toHaveText(["3", "4", "5"]);
        // only the 9 of row 3 differs
        await expect(tables.nth(1).locator("td.verdict-cell--differs")).toHaveText(["9 (differs)"]);
        expect(await tables.nth(1).locator("tbody td").evaluateAll((tds) => tds.map((td) => td.classList.contains("verdict-cell--differs")))).toEqual([
            true,
            false,
            false,
        ]);
    });

    test("wide tables: the first outlined cell is scrolled into sight, and the two tables scroll sideways together", async ({ page, app }) => {
        await page.setViewportSize({ width: 1000, height: 800 });
        const columns = (last) => Array.from({ length: 30 }, (_, i) => `${i === 29 ? last : i + 1} AS c${i + 1}`).join(", ");
        await routeSet(page, "wide-diff", oneExercise("wide-diff", `SELECT ${columns(30)};`));
        await page.goto("./?set=wide-diff");
        await expect(app.exercisePanel).toBeVisible();
        await app.waitReady();
        await check(app, `SELECT ${columns(99)};`);
        const boxes = app.feedback.locator(".verdict-scroll");
        await expect(boxes).toHaveCount(2);
        // the outlined cell (column 30, far to the right) is inside its box's window, not off to the side
        const seen = await page.evaluate(() => {
            const cell = document.querySelector("#exercise-feedback .verdict-cell--differs");
            const box = cell.closest(".verdict-scroll").getBoundingClientRect();
            const r = cell.getBoundingClientRect();
            return { inside: r.left >= box.left - 1 && r.right <= box.right + 1, text: cell.textContent };
        });
        expect(seen).toEqual({ inside: true, text: "99 (differs)" });
        // and Expected went with it, to the same place
        await expect
            .poll(() => boxes.evaluateAll((all) => all[1].scrollLeft > 0 && all[0].scrollLeft === all[1].scrollLeft))
            .toBe(true);
        // scrolling one by hand scrolls the other
        await boxes.nth(0).evaluate((b) => {
            b.scrollLeft = 120;
        });
        await expect.poll(() => boxes.nth(1).evaluate((b) => b.scrollLeft)).toBe(120);
        await boxes.nth(1).evaluate((b) => {
            b.scrollLeft = 300;
        });
        await expect.poll(() => boxes.nth(0).evaluate((b) => b.scrollLeft)).toBe(300);
        // and they settle there (no pulling to and fro)
        await page.waitForTimeout(200);
        expect(await boxes.evaluateAll((all) => all.map((b) => b.scrollLeft))).toEqual([300, 300]);
    });

    test("the view keeps the student's whole result under it, and the page never scrolls sideways at 390 px", async ({ page, app }) => {
        await page.setViewportSize({ width: 390, height: 844 });
        await app.openSet("retail-basics", { ex: "e05" });
        await check(app, WRONG_SQL);
        await expect(app.feedback.locator("table")).toHaveCount(2);
        await app.settle();
        await expect(app.status).toHaveText(/^5 rows in \d+ ms$/);
        await expect(app.table).toBeVisible();
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
        // on a phone the two tables stack, Yours under Expected
        const [expected, yours] = [await app.feedback.locator("table").nth(0).boundingBox(), await app.feedback.locator("table").nth(1).boundingBox()];
        expect(yours.y).toBeGreaterThan(expected.y + expected.height);
        // tables wider than the phone (exercise 9's four columns) scroll in their boxes, and the
        // words said for their outlined cells stay in those boxes too: the page itself never widens
        await app.exerciseButton(9).click();
        await check(app, modelQuery("e09").replace("ORDER BY revenue DESC", "ORDER BY revenue ASC"));
        await expect(app.feedback.locator(".verdict-cell--differs").first()).toBeAttached();
        await expect(app.feedback.locator(".verdict-scroll-note")).toBeVisible();
        expect(await app.feedback.locator(".verdict-scroll").evaluateAll((boxes) => boxes.every((b) => b.scrollWidth > b.clientWidth))).toBe(true);
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
    });
});

// ---- the screenshot matrix -----------------------------------------------------------------------

test.describe("the matrix", () => {
    test("every state of exercise mode has a recipe in the screenshot matrix", () => {
        const states = Object.keys(RECIPES.shell.states);
        for (const state of ["exercise-prompt", "exercise-hints", "exercise-correct", "exercise-wrong", "exercise-not-quite", "exercise-no-query", "exercise-complete", "menu-exercise-set"]) {
            expect(states).toContain(state);
        }
    });

    // a state named in the matrix is the state its recipe produces
    const PRODUCES = {
        "exercise-prompt": async (page, app) => {
            await expect(app.exerciseButton(5)).toHaveAttribute("aria-current", "true");
            await expect(app.feedback).toBeHidden();
        },
        "exercise-hints": async (page, app) => {
            await expect(app.hints.locator("li")).toHaveCount(2);
            await expect(app.hintButton).toHaveText("Show hint (3 of 3)");
        },
        "exercise-correct": async (page, app) => {
            await expect(app.feedback.locator(".verdict-text")).toHaveText("Correct. 5 rows match.");
            await expect(app.feedback.locator(".verdict-next")).toBeVisible();
        },
        "exercise-wrong": async (page, app) => {
            await expect(app.feedback.locator(".verdict--fail table")).toHaveCount(2);
            await expect(app.feedback.locator(".verdict-cell--differs")).toHaveCount(4);
        },
        "exercise-not-quite": async (page, app) => {
            await expect(app.feedback.locator(".verdict-text")).toHaveText("Not quite. expected 2 columns, got 1");
        },
        "exercise-no-query": async (page, app) => {
            await expect(app.feedback.locator(".verdict--info")).toBeVisible();
        },
        "exercise-complete": async (page, app) => {
            await expect(app.feedback.locator(".verdict-complete")).toHaveText("All 10 exercises complete. Well done.");
        },
    };
    for (const [state, expectation] of Object.entries(PRODUCES)) {
        test(`the matrix recipe '${state}' produces that state`, async ({ page, app }) => {
            expect(RECIPES.shell.states).toHaveProperty(state);
            await RECIPES.shell.states[state](page);
            await expectation(page, app);
        });
    }
});
