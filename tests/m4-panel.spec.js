const fs = require("node:fs");
const path = require("node:path");
const {
    test,
    expect,
    openFresh,
    realSet,
    routeSet,
    routeListing,
    listingHtml,
    withSampleDataset,
    modelQuery,
    PAYLOAD,
    ATTR_PAYLOAD,
    SAMPLE_FILE,
    editorValue,
    editorSelect,
    NORTHLIGHT_URL,
    DEFAULT_DATASET,
} = require("./helpers");

// F2 and F7 on screen (M4 part 2): the exercise set picker (a menu button in the sidebar's
// Exercises tab), the exercise list and progress (same tab), the prompt above the editor, Check
// answer, the verdict at the top of the result, drafts, links and the ways out of exercise mode.
// The engine side (runner, checker, progress storage, routing) is in m4-runner, m4-checker and
// m4-exercises.

const SET = realSet();
const IDS = SET.exercises.map((e) => e.id);
const titleOf = (n) => SET.exercises[n - 1].title;
// rows of each model query on Northlight (counted with the sqlite3 command-line tool)
const MODEL_ROWS = { e01: 5, e02: 5, e03: 5, e04: 8, e05: 5, e06: 5, e07: 1, e08: 22, e09: 19, e10: 4 };
const PROGRESS_KEY = "sqllab.progress.retail-basics";
// the summary line of a run that returned n rows: "5 rows in 3 ms" (anchored, so "905 rows" is not "5 rows")
const rowsIn = (n) => new RegExp(`^${n} ${n === 1 ? "row" : "rows"} in \\d+ ms$`);
// the notice of "no result yet" (a router notice: a set that could not be opened, a bad link)
const notice = (app) => app.emptyState.locator(".results-empty-notice");

// The set picker is a menu button: its label names the open set ("Exercise set: <title>", or
// "None"), and its menu lists the entries as menuitemradio items.
const setLabel = (title) => `Exercise set: ${title}`;
const expectSetPicked = (app, title) => expect(app.setPicker).toHaveAttribute("aria-label", setLabel(title));
// the menu's entries, once the Exercises tab shows and the menu is open (a closed menu is hidden)
const setItems = (app) => app.setMenu.locator('[role="menuitemradio"]');
// app.openSetMenu() opens it (tests/helpers.js)
// a passed exercise shows a ticked mark, an open one an empty mark (icons, not text)
const passedMark = (button) => button.locator(".exercise-mark-passed");

const readStore = (page) => page.evaluate((key) => JSON.parse(localStorage.getItem(key) ?? "null"), PROGRESS_KEY);

// pass puts the model answer of exercise `id` in the editor and checks it
async function passExercise(app, id) {
    await app.editor.fill(modelQuery(id));
    await app.checkButton.click();
    await expect(app.feedback.locator(".verdict--pass")).toBeVisible();
}

// ---- AC4, AC5, AC6, AC8 ----------------------------------------------------------------------

test("AC4 a link restores SQL, dataset, set and exercise in a fresh context with cleared storage", async ({
    page,
    app,
    browser,
    baseURL,
}) => {
    await app.openSet();
    await app.exerciseButton(3).click();
    const sql = "SELECT category, COUNT(*) AS n FROM products GROUP BY category;";
    await app.editor.fill(sql);
    const link = await app.copyLink();

    const fresh = await openFresh(browser, baseURL, link);
    try {
        const f = fresh.app;
        await expect(f.exercisePanel).toBeVisible();
        await expect(f.exerciseButton(3)).toHaveAttribute("aria-current", "true");
        await expectSetPicked(f, SET.title);
        // nothing ran: "no result yet" says the shared query waits for Run (where the status line did)
        await expect(f.pane).toHaveAttribute("data-state", "empty");
        await expect(f.emptyState.locator(".results-empty-text")).toContainText("A shared query is in the editor");
        expect(await f.pickedText()).toBe("Northlight Retail");
        expect((await editorValue(fresh.page)).trim()).toBe(sql);
        // the dataset really is open, and nothing was run or checked
        expect(await fresh.page.evaluate(() => window.app.database.name)).toBe("northlight_retail.db");
        await expect(f.table).toHaveCount(0);
        await expect(f.feedback).toBeHidden();
        // and nothing reached storage: shared SQL is saved only by a Run, a Check or an edit
        expect(await fresh.page.evaluate(() => JSON.stringify(Object.entries(localStorage)))).toBe("[]");
        expect(fresh.errors).toEqual([]);
        // moving to another exercise does not save the unedited link SQL either
        await f.exerciseButton(4).click();
        expect(await fresh.page.evaluate(() => JSON.stringify(Object.entries(localStorage)))).toBe("[]");
        // the address is now the set and exercise, with no fragment
        const url = new URL(fresh.page.url());
        expect(url.search).toBe("?set=retail-basics&ex=e04");
        expect(url.hash).toBe("");
    } finally {
        await fresh.context.close();
    }
});

test("AC5 the model answer for e01 passes, the wrong sort direction fails with row-level feedback, a syntax error shows the engine's message", async ({
    app,
}) => {
    await app.openSet();
    await passExercise(app, "e01");
    await expect(app.feedback).toContainText("Correct.");
    await expect(app.progress).toHaveText("1 of 10 complete");
    // the student's own results are on screen as usual
    await app.settle();
    await expect(app.status).toHaveText(rowsIn(5));
    expect((await app.read()).columns).toEqual(["product_name", "unit_price"]);

    const wrong = modelQuery("e01").replace("DESC", "ASC");
    expect(wrong).not.toBe(modelQuery("e01"));
    await app.editor.fill(wrong);
    await app.checkButton.click();
    const verdict = app.feedback.locator(".verdict--fail");
    await expect(verdict).toBeVisible();
    await expect(verdict.locator(".verdict-message")).toHaveText("Row 1 is the first that differs.");
    const tables = verdict.locator("table");
    await expect(tables).toHaveCount(2);
    await expect(tables.nth(0).locator("caption")).toHaveText("Expected");
    await expect(tables.nth(1).locator("caption")).toHaveText("Yours");
    for (const i of [0, 1]) {
        expect(await tables.nth(i).locator("tbody tr").count()).toBeLessThanOrEqual(3);
        await expect(tables.nth(i).locator("th[scope=col]").nth(1)).toHaveText("product_name");
    }
    // the first expected row is the most expensive product, the first of ours the cheapest
    await expect(tables.nth(0).locator("tbody tr").first()).toContainText("27-inch Monitor");
    await expect(tables.nth(1).locator("tbody tr").first()).toContainText("Wireless Mouse");
    // a failed check does not undo a pass
    await expect(app.progress).toHaveText("1 of 10 complete");

    await app.editor.fill("SELEC 1;");
    await app.checkButton.click();
    // the run under the banner failed with the same message: its error band shows the engine's
    // message (checked below), and the banner points at it rather than repeating it (Phase 5)
    await expect(app.feedback.locator(".verdict-message")).toHaveText("This query has an error, shown below.");
    await expect(app.feedback.locator(".verdict-note")).toHaveCount(0);
    // the results pane still carries the run's own error (in its error band), and the visible run did happen
    await app.settle();
    await expect(app.pane).toHaveAttribute("data-state", "error");
    await expect(app.errorBand.locator(".results-band-message")).toContainText('near "SELEC": syntax error');
});

test("AC5 the model query appears nowhere in the page, for all ten exercises, whatever the student does", async ({
    page,
    app,
}) => {
    test.setTimeout(120_000);
    const search = async (when) => {
        const html = await page.content();
        const text = await page.evaluate(() => document.documentElement.innerText);
        for (const id of IDS) {
            const q = modelQuery(id);
            const flat = q.replace(/\s+/g, " ").trim();
            for (const haystack of [html, html.replace(/\s+/g, " "), text.replace(/\s+/g, " ")]) {
                expect(haystack.includes(q), `${id} (raw) ${when}`).toBe(false);
                expect(haystack.includes(flat), `${id} (flat) ${when}`).toBe(false);
                expect(haystack.includes(flat.replaceAll("'", "&#39;")), `${id} (escaped) ${when}`).toBe(false);
            }
        }
    };

    await app.openSet();
    await search("after loading");
    for (const [i, id] of IDS.entries()) {
        await app.exerciseButton(i + 1).click();
        await expect(app.exerciseButton(i + 1)).toHaveAttribute("aria-current", "true");
        // a failing answer, then the model answer, then every hint
        await app.editor.fill("SELECT 1;");
        await app.checkButton.click();
        await expect(app.feedback.locator(".verdict--fail")).toBeVisible();
        await passExercise(app, id);
        while (await app.hintButton.isVisible()) {
            await app.hintButton.click();
        }
        // the student's own text is the one thing in the editor that may be anything; clear it
        await app.editor.fill("");
        await search(`after ${id}`);
    }
    await expect(app.progress).toHaveText("10 of 10 complete");
    // the share link carries ids and the student's SQL, never the model query
    await app.editor.fill("SELECT 1;");
    const link = await app.copyLink();
    const decoded = await page.evaluate(async (hash) => {
        const { decodeShare } = await import("./bundle/app.js").then((bundle) => bundle.share);
        return decodeShare(hash);
    }, new URL(link).hash);
    expect(decoded.state).toMatchObject({ dataset: "northlight", set: "retail-basics", sql: "SELECT 1;" });
    for (const id of IDS) {
        expect(JSON.stringify(decoded)).not.toContain(modelQuery(id));
    }
});

test("every model query in the shipped set passes its own check, with the expected row count", async ({ app }) => {
    test.setTimeout(120_000);
    await app.openSet();
    for (const [i, id] of IDS.entries()) {
        await app.exerciseButton(i + 1).click();
        await app.editor.fill(modelQuery(id));
        await app.page.locator("#execute").click();
        await app.settle();
        await expect(app.status).toHaveText(rowsIn(MODEL_ROWS[id]));
        await app.checkButton.click();
        await expect(app.feedback.locator(".verdict--pass")).toBeVisible();
        // Check ran the query visibly as well: the same count is still on screen
        await app.settle();
        await expect(app.status).toHaveText(rowsIn(MODEL_ROWS[id]));
    }
    await expect(app.progress).toHaveText("10 of 10 complete");
});

test("AC6 a session of load, query, check and share makes zero requests off the origin", async ({ app, net }) => {
    await app.openSet();
    await app.query("SELECT 1 AS one;");
    await passExercise(app, "e01");
    await app.editor.fill("SELECT 2;");
    await app.checkButton.click();
    await expect(app.feedback.locator(".verdict--fail")).toBeVisible();
    await app.exerciseButton(2).click();
    await app.hintButton.click();
    await app.copyLink();
    await app.pickSet("None");
    expect(net.network.length).toBeGreaterThan(5);
    net.expectNoExternalRequests();
    net.expectNoSameOriginFailures();
});

test("AC8 keyboard only: reach the editor, type, run, check with Ctrl+Shift+Enter and with Tab then Enter; focus stays", async ({
    page,
    app,
}) => {
    await app.openSet();
    await page.evaluate(() => {
        window.__runs = 0;
        document.addEventListener("lab:run-finished", () => window.__runs++);
    });
    // the first Tab stop is the skip link; Enter on it moves the focus to the editor
    if (!(await app.editor.evaluate((el) => el === document.activeElement))) {
        await page.keyboard.press("Tab");
        await expect(page.locator("a.skip-link")).toBeFocused();
        await page.keyboard.press("Enter");
    }
    await expect(app.editor).toBeFocused();
    await page.keyboard.type(modelQuery("e01"));
    await page.keyboard.press("Control+Enter");
    await app.settle();
    await expect(app.status).toHaveText(rowsIn(5));
    // results are a real table
    await expect(page.locator("#result table > thead > tr > th")).toHaveCount(2);
    await expect(page.locator("#result table > tbody > tr")).toHaveCount(5);
    expect(await page.evaluate(() => window.__runs)).toBe(1);

    // Ctrl+Shift+Enter checks, and does not also run (the editor would run for Ctrl+Enter)
    await page.keyboard.press("Control+Shift+Enter");
    await expect(app.feedback.locator(".verdict--pass")).toBeVisible();
    expect(await page.evaluate(() => window.__runs)).toBe(2); // one run: the check's own
    await expect(app.editor).toBeFocused();
    // the verdict is announced: the results pane's live region says it in words (the banner itself
    // is not live, so its tables are not read out)
    await expect(page.locator("#results-announce")).toHaveAttribute("role", "status");
    await expect(page.locator("#results-announce")).toHaveText("Correct. 5 rows match.");

    // now wrong, and check from the Check button by keyboard
    await page.keyboard.press("Control+A");
    await page.keyboard.type("SELECT 1 AS one;");
    // Escape leaves the editor; Check answer is the stop just before it, Run the one before that
    await page.keyboard.press("Escape");
    await page.keyboard.press("Shift+Tab");
    await expect(app.checkButton).toBeFocused();
    await page.keyboard.press("Shift+Tab");
    await expect(page.locator("#execute")).toBeFocused();
    await page.keyboard.press("Tab");
    await expect(app.checkButton).toBeFocused();
    await page.keyboard.press("Enter");
    await expect(app.feedback.locator(".verdict--fail")).toBeVisible();
    await expect(app.checkButton).toBeFocused(); // not disabled, so the focus was not lost
    await expect(app.checkButton).toBeEnabled();
    expect(await app.read()).toEqual({ columns: ["one"], rows: [["1"]] });
    // and again with Space
    await page.keyboard.press(" ");
    await expect(app.checkButton).toBeFocused();
});

// ---- the checker's feedback, on screen -------------------------------------------------------

test("each feedback rule shows on screen, and a pass is unmistakable", async ({ page, app }) => {
    await app.openSet();
    const verdict = app.feedback.locator(".verdict");
    const message = app.feedback.locator(".verdict-message");

    // 1. SQL error: the engine's message, verbatim, in the error band of the run under the banner,
    // which the banner points at (Phase 5: the same message is not shown twice)
    await app.editor.fill("SELECT nope FROM products;");
    await app.checkButton.click();
    await expect(message).toHaveText("This query has an error, shown below.");
    await expect(app.errorBand.locator(".results-band-message")).toHaveText("no such column: nope");

    // 2. column count
    await app.editor.fill("SELECT product_name FROM products WHERE category = 'Electronics' ORDER BY unit_price DESC;");
    await app.checkButton.click();
    await expect(message).toHaveText("expected 2 columns, got 1");

    // 4. row count
    await app.editor.fill("SELECT product_name, unit_price FROM products ORDER BY unit_price DESC;");
    await app.checkButton.click();
    await expect(message).toHaveText("expected 5 rows, got 20");
    await expect(app.feedback.locator("table")).toHaveCount(0);

    // 3. column name (exercise 3 compares names)
    await app.exerciseButton(3).click();
    await app.editor.fill(modelQuery("e03").replace(/category/, "category AS cat"));
    await app.checkButton.click();
    await expect(message).toContainText('column 1 should be named "category", but is named "cat"');

    // 5. a row that differs (exercise 2: order matters)
    await app.exerciseButton(2).click();
    await app.editor.fill(modelQuery("e02").replace(/DESC/i, (m) => (m === "DESC" ? "ASC" : "asc")));
    await app.checkButton.click();
    await expect(verdict).toHaveClass(/verdict--fail/);
    await expect(message).toContainText(/Row \d+ is the first that differs/);
    await expect(app.feedback.locator("table")).toHaveCount(2);

    // a pass: a mark (the tick that draws itself, an icon the words go with), a word, and the
    // counter moves
    await passExercise(app, "e02");
    await expect(verdict).toHaveClass(/verdict--pass/);
    await expect(app.feedback.locator(".verdict-mark")).toHaveClass(/verdict-tick/);
    await expect(app.feedback.locator(".verdict-mark")).toHaveAttribute("aria-hidden", "true");
    await expect(app.feedback.locator(".verdict-headline")).toHaveText("Correct.");
    await expect(app.progress).toHaveText("1 of 10 complete");
    await expect(app.exerciseButton(2)).toHaveAttribute("aria-label", `Exercise 2 of 10: ${titleOf(2)}, passed`);
    await expect(passedMark(app.exerciseButton(2))).toBeVisible();
    // the verdict clears when the exercise changes
    await app.exerciseButton(4).click();
    await expect(app.feedback).toBeHidden();
    await expect(app.feedback).toBeEmpty();
});

test("a query that ran on the changed working copy but fails on the original dataset says so, after the engine's message", async ({
    app,
}) => {
    await app.openSet();
    await app.run("CREATE TABLE mine (x); INSERT INTO mine VALUES (1);");
    // (no result set: the summary line says "Done. 1 row changed in N ms")
    await expect(app.status).toHaveText(/^Done\. 1 row changed in \d+ ms$/);
    await app.editor.fill("SELECT x FROM mine;");
    await app.checkButton.click();
    await app.settle();
    await expect(app.status).toHaveText(rowsIn(1)); // it ran on the student's copy
    const verdict = app.feedback.locator(".verdict--fail");
    await expect(verdict.locator(".verdict-message")).toHaveText("no such table: mine");
    await expect(verdict.locator(".verdict-note")).toContainText("working copy");
    await expect(verdict.locator(".verdict-note")).toContainText("original dataset");
    // the engine's message comes first, and the note is a separate short sentence after it
    expect(await verdict.locator("p").evaluateAll((ps) => ps.map((p) => p.className))).toEqual([
        "verdict-head",
        "verdict-message",
        "verdict-note",
    ]);
});

test("an empty editor says to write a query first and runs nothing", async ({ page, app }) => {
    await app.openSet();
    await page.evaluate(() => {
        window.__runs = 0;
        document.addEventListener("lab:run-finished", () => window.__runs++);
    });
    await app.editor.fill("");
    await app.checkButton.click();
    await expect(app.feedback).toContainText("Write a query first");
    expect(await page.evaluate(() => window.__runs)).toBe(0);
    await expect(app.table).toHaveCount(0);
    await page.keyboard.press("Control+Shift+Enter");
    await expect(app.feedback).toContainText("Write a query first");
    expect(await page.evaluate(() => window.__runs)).toBe(0);
});

test("while a database is loading, Check refuses as Run does", async ({ page, app }) => {
    await withSampleDataset(page);
    let release;
    const held = new Promise((resolve) => (release = resolve));
    await page.route(/\/datasets\/sample\.db(\?.*)?$/, async (route) => {
        await held;
        await route.fulfill({ path: SAMPLE_FILE, contentType: "application/octet-stream" });
    });
    await app.openSet();
    await app.editor.fill(modelQuery("e01"));
    await app.pickDatabase("Sample Fruit"); // starts a slow load
    await app.checkButton.click();
    // the refusal is a toast (it was the status line's text), and nothing was checked
    await expect(app.toast).toContainText("still loading");
    await expect(app.feedback).toBeHidden();
    release();
    await expect(app.databaseLabel).toHaveText("Sample Fruit");
    // the pass was not recorded, and the panel closed with the old database
    await expect(app.exercisePanel).toBeHidden();
    expect((await readStore(page)).passed).toEqual({});
});

test("pressing Check twice quickly runs one check", async ({ page, app }) => {
    await app.openSet();
    await page.evaluate(() => {
        window.__runs = 0;
        document.addEventListener("lab:run-finished", () => window.__runs++);
    });
    await app.editor.fill(modelQuery("e01"));
    // two clicks in one task: the second finds the first still in flight
    await page.evaluate(() => {
        const button = document.querySelector("#exercise-check");
        button.click();
        button.click();
    });
    await expect(app.feedback.locator(".verdict--pass")).toBeVisible();
    expect(await page.evaluate(() => window.__runs)).toBe(1);
    // and once it is over, the next press checks again
    await app.checkButton.click();
    await expect.poll(() => page.evaluate(() => window.__runs)).toBe(2);
});

test("a check that finishes after the student moved to another exercise is ignored", async ({ page, app }) => {
    await app.openSet();
    await app.editor.fill(modelQuery("e01"));
    await page.evaluate(() => {
        document.querySelector("#exercise-check").click();
        document.querySelectorAll("#exercise-list button")[1].click();
    });
    await expect(app.exerciseButton(2)).toHaveAttribute("aria-current", "true");
    await page.waitForTimeout(800);
    await expect(app.feedback).toBeEmpty();
    await expect(app.progress).toHaveText("0 of 10 complete");
    expect(await readStore(page)).not.toMatchObject({ passed: { e01: true } });
});

// ---- the panel ---------------------------------------------------------------------------------

test("the panel and the Exercises tab: set title, numbered buttons with full names, prompt as text, aria-current, progress", async ({ page, app }) => {
    await expect(app.exercisePanel).toBeHidden(); // before a set is open (the id is in the page)
    await app.openSet();
    // opening a set brings the Exercises tab forward
    await expect(app.tab("exercises")).toHaveAttribute("aria-selected", "true");
    await expect(page.locator("#exercise-set-title")).toHaveText(SET.title);
    await expect(app.progress).toHaveText("0 of 10 complete");
    const buttons = page.locator("#exercise-list > li > button");
    await expect(buttons).toHaveCount(10);
    for (let n = 1; n <= 10; n++) {
        const b = app.exerciseButton(n);
        await expect(b).toHaveAttribute("aria-label", `Exercise ${n} of 10: ${titleOf(n)}, not passed`);
        await expect(b).toHaveAttribute("title", titleOf(n));
        // the visible number is a CSS counter on the list items (the digit is not in the text, the name
        // says it in words): the n-th item of the list, with its number drawn by the counter
        expect(await b.evaluate((button) => [...button.closest("ol").children].indexOf(button.closest("li")) + 1)).toBe(n);
        expect(await b.locator(".exercise-item-number").evaluate((span) => getComputedStyle(span, "::before").content)).toBe("counter(exercise)");
        expect(await b.evaluate((button) => getComputedStyle(button.closest("li")).counterIncrement)).toBe("exercise 1");
        // the number has its room on screen, before the title
        const number = await b.locator(".exercise-item-number").boundingBox();
        const title = await b.locator(".exercise-item-title").boundingBox();
        expect(number.width).toBeGreaterThan(0);
        expect(number.x + number.width).toBeLessThanOrEqual(title.x);
    }
    // the counter starts at the list: the first item draws 1
    expect(await page.locator("#exercise-list").evaluate((el) => getComputedStyle(el).counterReset)).toBe("exercise 0");
    expect(await page.locator("#exercise-list").evaluate((el) => el.tagName)).toBe("OL");
    await expect(page.locator("#exercise-list [aria-current]")).toHaveCount(1);
    await expect(app.exerciseButton(1)).toHaveAttribute("aria-current", "true");
    await expect(app.prompt).toContainText(titleOf(1));
    await expect(app.prompt).toContainText(SET.exercises[0].prompt);
    // the prompt is above the editor (and the verdict above the summary line)
    const order = await page.evaluate(() => {
        const y = (s) => document.querySelector(s).getBoundingClientRect().top;
        return [y("#exercise-prompt"), y("#editor"), y("#exercise-feedback") || -1, y("#status")];
    });
    expect(order[0]).toBeLessThan(order[1]);
    // the Check button follows Run directly, in the editor's toolbar
    expect(await page.locator("#editor-toolbar > #execute + #exercise-check").count()).toBe(1);
    // the exercise picker: a labelled menu button, whose menu has None, then the sets by title
    await expect(page.getByRole("button", { name: setLabel(SET.title), exact: true })).toHaveCount(1);
    await expect(app.setPicker).toHaveAttribute("aria-haspopup", "menu");
    await app.openSetMenu();
    await expect(setItems(app)).toHaveText(["None", SET.title]);
    await expect(setItems(app)).toHaveCount(2);
    await expect(app.setMenu.getByRole("menuitemradio", { name: SET.title, exact: true })).toHaveAttribute("aria-checked", "true");
    await expect(app.setMenu.getByRole("menuitemradio", { name: "None", exact: true })).toHaveAttribute("aria-checked", "false");
    await page.keyboard.press("Escape");
    await expect(app.setMenu).toBeHidden();
    // it is placed after the database switcher
    expect(
        await page.evaluate(() => {
            const a = document.querySelector("#database-button");
            const b = document.querySelector("#exercise-set-picker");
            return Boolean(a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING);
        })
    ).toBe(true);
});

test("opening a set selects the exercise named by the link, else the first not yet passed, else the first", async ({ page, app }) => {
    await app.openSet("retail-basics", { ex: "e05" });
    await expect(app.exerciseButton(5)).toHaveAttribute("aria-current", "true");
    // pass e01 and e02, then open without a link exercise
    await app.exerciseButton(1).click();
    await passExercise(app, "e01");
    await app.exerciseButton(2).click();
    await passExercise(app, "e02");
    await app.openSet();
    await expect(app.exerciseButton(3)).toHaveAttribute("aria-current", "true");
    // all passed: the first
    await page.evaluate(
        ([key, ids]) => localStorage.setItem(key, JSON.stringify({ v: 1, passed: Object.fromEntries(ids.map((i) => [i, true])), drafts: {} })),
        [PROGRESS_KEY, IDS]
    );
    await app.openSet();
    await expect(app.progress).toHaveText("10 of 10 complete");
    await expect(app.exerciseButton(1)).toHaveAttribute("aria-current", "true");
    // a named exercise wins over the first not passed
    await app.openSet("retail-basics", { ex: "e07" });
    await expect(app.exerciseButton(7)).toHaveAttribute("aria-current", "true");
});

test("progress reads like 7 of 10 complete, and survives a reload", async ({ page, app }) => {
    await app.openSet();
    await page.evaluate(
        ([key, ids]) =>
            localStorage.setItem(key, JSON.stringify({ v: 1, passed: Object.fromEntries(ids.slice(0, 7).map((i) => [i, true])), drafts: {} })),
        [PROGRESS_KEY, IDS]
    );
    await page.reload();
    await expect(app.progress).toHaveText("7 of 10 complete");
    await expect(app.exerciseButton(8)).toHaveAttribute("aria-current", "true");
    await expect(passedMark(app.exerciseButton(7))).toBeVisible();
    await expect(passedMark(app.exerciseButton(8))).toBeHidden();
    expect(await app.progress.textContent()).toBe("7 of 10 complete");
});

test("progress and drafts persist across a reload", async ({ page, app }) => {
    await app.openSet();
    await passExercise(app, "e01");
    await app.exerciseButton(2).click();
    await passExercise(app, "e02");
    const draft = "SELECT first_name FROM customers -- my draft";
    await app.exerciseButton(5).click();
    await app.editor.fill(draft);
    await app.exerciseButton(6).click(); // moving on saves what was typed
    await expect.poll(() => editorValue(page)).toBe(""); // and shows the other exercise's text: nothing yet
    await page.reload();
    await expect(app.progress).toHaveText("2 of 10 complete");
    // the place is kept: the last exercise opened
    await expect(app.exerciseButton(6)).toHaveAttribute("aria-current", "true");
    await app.exerciseButton(5).click();
    expect((await editorValue(page)).trim()).toBe(draft);
    await app.exerciseButton(2).click();
    expect((await editorValue(page)).trim()).toBe(modelQuery("e02"));
    // the storage holds only ids and the student's own SQL
    const stored = await readStore(page);
    expect(Object.keys(stored.passed).sort()).toEqual(["e01", "e02"]);
    expect(JSON.stringify(stored)).not.toContain("model_query");
});

test("every Run in exercise mode saves the full editor text as the draft, even when only a selection ran", async ({ page, app }) => {
    await app.openSet();
    await app.exerciseButton(3).click();
    await app.editor.fill("SELECT 1 AS a; SELECT 2 AS b;");
    await editorSelect(page, 0, 14);
    await page.locator("#execute").click();
    await app.settle();
    await expect(app.status).toHaveText(rowsIn(1));
    expect((await readStore(page)).drafts.e03).toBe("SELECT 1 AS a; SELECT 2 AS b;");
});

test("in exercise mode the editor never shows the dataset's free-query SQL and nothing runs on load", async ({ page, app }) => {
    await app.open(NORTHLIGHT_URL);
    await app.query("SELECT 'free' AS mode;"); // saved for the dataset
    await page.goto("./?set=retail-basics");
    await expect(app.exercisePanel).toBeVisible();
    await app.waitReady();
    expect((await editorValue(page)).trim()).toBe("");
    await expect(app.table).toHaveCount(0);
    // nothing ran on load: the results pane says "no result yet" (it was the invitation in the status line)
    await expect(app.pane).toHaveAttribute("data-state", "empty");
    await expect(app.emptyState.locator(".results-empty-title")).toHaveText("Run a query to see its result here.");
    await expect(app.summary).toBeHidden();
    // and in exercise mode it asks for an answer, with no sample queries to start from
    await expect(app.emptyState.locator(".results-empty-text")).toHaveText("Write your answer in the editor, then press Check answer.");
    await expect(app.samples).toHaveCount(0);
    // the query toolbar is enabled from the start
    await expect(page.locator("#execute")).toBeEnabled();
    // picking a set over the open dataset also shows the exercise's text, not the free query
    await page.goto(NORTHLIGHT_URL);
    await app.waitReady();
    await app.pickSet(SET.title);
    await expect(app.exercisePanel).toBeVisible();
    expect((await editorValue(page)).trim()).toBe("");
});

test("hints reveal one at a time, in order, from one button that counts the hints and goes away", async ({ page, app }) => {
    await app.openSet();
    const hints = SET.exercises[0].hints;
    const hinted = hints.map((h, i) => `Hint ${i + 1}: ${h}`);
    expect(hints.length).toBe(2);
    // "Show hint (1 of 2)": the hint a press shows, of how many (UI plan, section 5)
    await expect(app.hintButton).toHaveText(`Show hint (1 of ${hints.length})`);
    await expect(app.hints.locator("li")).toHaveCount(0);
    await app.hintButton.focus();
    await page.keyboard.press("Enter");
    await expect(app.hints.locator("li")).toHaveText([`Hint 1: ${hints[0]}`]);
    await expect(app.hintButton).toHaveText("Show hint (2 of 2)");
    await page.keyboard.press("Enter");
    await expect(app.hints.locator("li")).toHaveText(hinted);
    await expect(app.hintButton).toBeHidden();
    // the keyboard user is not stranded: the focus went to the hint
    await expect(app.hints.locator("li").last()).toBeFocused();
    // remembered per exercise for the page's lifetime
    await app.exerciseButton(2).click();
    await expect(app.hints.locator("li")).toHaveCount(0);
    await expect(app.hintButton).toBeVisible();
    await app.exerciseButton(1).click();
    await expect(app.hints.locator("li")).toHaveText(hinted);
    await expect(app.hintButton).toBeHidden();
    // an exercise without hints has no button
    const set = { ...SET, id: "nohints", exercises: [{ ...SET.exercises[0], hints: [] }] };
    await routeSet(page, "nohints", set);
    await page.goto("./?set=nohints");
    await expect(app.exercisePanel).toBeVisible();
    await expect(app.hintButton).toBeHidden();
});

test("reset forgets passes and drafts after a confirm; the editor text stays; dismissing changes nothing", async ({ page, app }) => {
    await app.openSet();
    await passExercise(app, "e01");
    await app.exerciseButton(2).click();
    await app.editor.fill("SELECT 2 -- keep me on screen");
    await expect(app.progress).toHaveText("1 of 10 complete");

    // dismissed
    const seen = [];
    page.once("dialog", async (dialog) => {
        seen.push(dialog.message());
        await dialog.dismiss();
    });
    await page.locator("#exercise-reset").click();
    await expect.poll(() => seen.length).toBe(1);
    expect(seen[0]).toContain(SET.title);
    await expect(app.progress).toHaveText("1 of 10 complete");
    await expect(passedMark(app.exerciseButton(1))).toBeVisible();
    expect((await readStore(page)).drafts.e02).toBe("SELECT 2 -- keep me on screen");

    // accepted
    page.once("dialog", (dialog) => dialog.accept());
    await page.locator("#exercise-reset").click();
    await expect(app.progress).toHaveText("0 of 10 complete");
    await expect(passedMark(app.exerciseButton(1))).toBeHidden();
    await expect(app.exerciseButton(1)).toHaveAttribute("aria-label", /not passed$/);
    expect((await editorValue(page)).trim()).toBe("SELECT 2 -- keep me on screen");
    expect(await readStore(page)).toBeNull();
    await page.reload();
    await expect(app.progress).toHaveText("0 of 10 complete");
    expect((await editorValue(page)).trim()).toBe("");
});

test("only this set's progress is reset", async ({ page, app }) => {
    await app.openSet();
    await passExercise(app, "e01");
    await page.evaluate(() => localStorage.setItem("sqllab.progress.other", '{"v":1,"passed":{"x":true},"drafts":{}}'));
    page.once("dialog", (dialog) => dialog.accept());
    await page.locator("#exercise-reset").click();
    await expect(app.progress).toHaveText("0 of 10 complete");
    expect(await page.evaluate(() => localStorage.getItem("sqllab.progress.other"))).toContain('"x":true');
});

test("moving between exercises saves and restores the text, clears the verdict and the old result, and rewrites the address", async ({
    page,
    app,
}) => {
    await app.openSet();
    await app.editor.fill("SELECT 1 AS first;");
    await app.checkButton.click();
    await expect(app.feedback.locator(".verdict")).toBeVisible();
    await expect(app.table).toHaveCount(1);
    const before = await page.evaluate(() => history.length);
    await app.exerciseButton(2).click();
    await expect(app.feedback).toBeEmpty();
    await expect(app.table).toHaveCount(0);
    expect((await editorValue(page)).trim()).toBe("");
    // replaceState: no new history entry, ?set=<id>&ex=<id>, no fragment
    expect(await page.evaluate(() => history.length)).toBe(before);
    const url = new URL(page.url());
    expect(url.search).toBe("?set=retail-basics&ex=e02");
    expect(url.hash).toBe("");
    await app.exerciseButton(1).click();
    expect((await editorValue(page)).trim()).toBe("SELECT 1 AS first;");
    // the share link follows the exercise
    await app.exerciseButton(4).click();
    const link = await app.copyLink();
    const state = await page.evaluate(async (hash) => (await import("./bundle/app.js").then((bundle) => bundle.share)).decodeShare(hash).state, new URL(link).hash);
    expect(state).toMatchObject({ dataset: "northlight", set: "retail-basics", exercise: "e04" });
    // a reload keeps the place
    await page.reload();
    await expect(app.exerciseButton(4)).toHaveAttribute("aria-current", "true");
});

// ---- the set picker ----------------------------------------------------------------------------

test("a set that failed validation is a disabled menu entry naming its file, with the problem as its title", async ({ page, app }) => {
    await routeListing(page, listingHtml(["retail-basics.json", "broken.json"]));
    await routeSet(page, "broken", { id: "broken", title: "B", dataset: "northlight", exercises: [] });
    await app.open();
    await app.openSetMenu();
    const options = setItems(app);
    await expect(options).toHaveCount(3);
    await expect(options.nth(0)).toHaveText("None");
    await expect(options.nth(1).locator(".menu-item-label")).toHaveText("broken.json (not valid)");
    await expect(options.nth(1)).toBeDisabled();
    await expect(options.nth(1)).toHaveAttribute("title", /"exercises" is empty/);
    // the problem is also written under the name
    await expect(options.nth(1).locator(".menu-item-description")).toContainText(/"exercises" is empty/);
    await expect(options.nth(2)).toHaveText(SET.title);
    await expect(options.nth(2)).toBeEnabled();
});

test("a file whose name cannot be an id is a disabled menu entry that no way of choosing opens", async ({ page, app, net }) => {
    const names = ["Week 3", "week1.v2", "<img src=x onerror=alert(1)>", "x\"y'z", ""];
    await routeListing(page, listingHtml(["retail-basics.json", ...names.map((n) => `${encodeURIComponent(n)}.json`)]));
    await app.open();
    await app.openSetMenu();
    const options = setItems(app);
    const labels = options.locator(".menu-item-label");
    await expect(options).toHaveCount(2 + names.length);
    await expect(labels.nth(0)).toHaveText("None");
    // sorted with the others, by code unit; the name is text, with the problem as its tooltip
    await expect(labels.nth(1)).toHaveText(".json (not valid)");
    await expect(labels.nth(2)).toHaveText("<img src=x onerror=alert(1)>.json (not valid)");
    await expect(labels.nth(3)).toHaveText("Week 3.json (not valid)");
    await expect(labels.nth(4)).toHaveText(SET.title);
    await expect(labels.nth(5)).toHaveText("week1.v2.json (not valid)");
    await expect(labels.nth(6)).toHaveText(`x"y'z.json (not valid)`);
    for (const index of [1, 2, 3, 5, 6]) {
        await expect(options.nth(index)).toBeDisabled();
        await expect(options.nth(index)).toHaveAttribute("title", /^The file name may use only 1 to 64 letters, digits, "_" or "-"/);
    }
    await expect(options.nth(4)).toBeEnabled();
    await expect(app.setMenu.locator("img")).toHaveCount(0);
    // choosing one of them (a press, or Enter on it from the keyboard) opens nothing and leaves the
    // picker on None
    const resultBefore = await app.result.textContent();
    const toastBefore = await app.toast.textContent();
    await options.nth(3).click({ force: true });
    await options.nth(3).focus();
    await page.keyboard.press("Enter");
    await expect(app.exercisePanel).toBeHidden();
    expect(new URL(page.url()).search).toBe("");
    await expect(app.setMenu).toBeVisible(); // a disabled entry does not even close the menu
    await page.keyboard.press("Escape");
    await expectSetPicked(app, "None");
    // and the results pane and the toasts are as they were: the file name is not handed to the code
    // that opens a set, which would name it in an error
    expect(await app.result.textContent()).toBe(resultBefore);
    expect(await app.result.textContent()).not.toContain("Week 3");
    expect(await app.toast.textContent()).toBe(toastBefore);
    expect(await app.toast.textContent()).not.toContain("Week 3");
    // the good one opens; nothing was requested for the others, only the folder and that set
    await app.pickSet(SET.title);
    await expect(app.exercisePanel).toBeVisible();
    expect([...new Set(net.paths.filter((p) => p.startsWith("exercises/")))].sort()).toEqual(["exercises/", "exercises/retail-basics.json"]);
});

test("listing the sets does not delay opening the database", async ({ page, app }) => {
    let release;
    const held = new Promise((resolve) => (release = resolve));
    await page.route(/\/exercises\/(index\.html)?(\?.*)?$/, async (route) => {
        await held;
        await route.fulfill({ status: 200, contentType: "text/html", body: listingHtml(["retail-basics.json"]) });
    });
    await app.open(NORTHLIGHT_URL); // would time out if it waited for the listing
    // the database is open (nothing ran: "no result yet" with the samples), the picker still waits
    await expect(app.pane).toHaveAttribute("data-state", "empty");
    await expect(app.samples.first()).toBeVisible();
    expect(await page.evaluate(() => window.app.database.name)).toBe("northlight_retail.db");
    await expect(app.setPicker).toBeDisabled();
    release();
    await expect(app.setPicker).toBeEnabled();
    await app.openSetMenu();
    await expect(setItems(app)).toHaveCount(2);
});

test("picking a set over its open dataset keeps the database; picking one needing another dataset loads it", async ({ page, app }) => {
    await withSampleDataset(page);
    await routeSet(page, "fruit", {
        id: "fruit",
        title: "Fruit practice",
        dataset: "sample",
        exercises: [{ id: "f1", title: "All fruit", prompt: "List the fruit.", model_query: "SELECT * FROM fruit;" }],
    });
    await routeListing(page, listingHtml(["retail-basics.json", "fruit.json"]));
    await app.open(NORTHLIGHT_URL);
    await app.openSetMenu();
    await expect(setItems(app)).toHaveCount(3);
    await page.keyboard.press("Escape");

    // the student's work in the open dataset survives opening its set
    await app.run("CREATE TABLE keep (x); INSERT INTO keep VALUES (7);");
    await expect(app.status).toHaveText(/^Done\. 1 row changed in \d+ ms$/);
    const database = await page.evaluateHandle(() => window.app.database);
    await app.pickSet(SET.title);
    await expect(app.exercisePanel).toBeVisible();
    expect(await page.evaluate((old) => window.app.database === old, database)).toBe(true);
    expect((await app.query("SELECT x FROM keep;")).rows).toEqual([["7"]]);
    expect(new URL(page.url()).search).toBe("?set=retail-basics");
    expect(new URL(page.url()).hash).toBe("");
    // the Check runs on the original dataset, where the student's table does not exist
    await app.editor.fill("SELECT x FROM keep;");
    await app.checkButton.click();
    await expect(app.feedback.locator(".verdict-message").first()).toHaveText("no such table: keep");
    await expect(app.feedback.locator(".verdict-note")).toHaveCount(1);

    // a set of another dataset loads that dataset (the load ticket makes the last request win)
    await app.pickSet("Fruit practice");
    await expect(app.databaseLabel).toHaveText("Sample Fruit");
    await expectSetPicked(app, "Fruit practice");
    await expect(page.locator("#exercise-set-title")).toHaveText("Fruit practice");
    expect(await page.evaluate(() => window.app.database === undefined)).toBe(false);
    expect(await app.pickedText()).toBe("Sample Fruit");
    expect(new URL(page.url()).search).toBe("?set=fruit");
    await app.editor.fill("SELECT * FROM fruit;");
    await app.checkButton.click();
    await expect(app.feedback.locator(".verdict--pass")).toBeVisible();
    // and back: the set whose dataset is not the open one loads Northlight again
    await app.pickSet(SET.title);
    await expect(app.databaseLabel).toHaveText("Northlight Retail");
    await expect(app.progress).toHaveText("0 of 10 complete");
});

test("a pick that cannot be carried out leaves the picker where it was", async ({ page, app }) => {
    await withSampleDataset(page);
    await routeSet(page, "fruit", {
        id: "fruit",
        title: "Fruit practice",
        dataset: "sample",
        exercises: [{ id: "f1", title: "All fruit", prompt: "List the fruit.", model_query: "SELECT * FROM fruit;" }],
    });
    await routeListing(page, listingHtml(["fruit.json"]));
    await page.route(/\/datasets\/sample\.db(\?.*)?$/, (route) => route.fulfill({ status: 404, body: "no" }));
    await app.open(NORTHLIGHT_URL);
    await app.pickSet("Fruit practice");
    await expect(app.errorBand.locator(".results-band-text")).toContainText("could not be loaded");
    await expect(app.exercisePanel).toBeHidden();
    await expectSetPicked(app, "None");
    await expect(app.databaseLabel).toHaveText("Northlight Retail");
});

// ---- leaving exercise mode ---------------------------------------------------------------------

async function expectClosed(page, app) {
    await expect(app.exercisePanel).toBeHidden();
    await expect(page.locator("#exercise-check")).toHaveCount(0);
    await expectSetPicked(app, "None");
    await expect(app.feedback).toBeHidden();
    const context = await page.evaluate(async () => (await import("./bundle/app.js").then((bundle) => bundle.share)).getShareContext());
    expect(context.set).toBeUndefined();
    expect(context.exercise).toBeUndefined();
}

test("None closes the panel, keeps the database open and pushes ?db=<id>", async ({ page, app }) => {
    await app.openSet();
    await app.editor.fill("CREATE TABLE keep (x); SELECT 1;");
    await page.locator("#execute").click();
    await app.settle();
    await expect(app.status).toHaveText(rowsIn(1));
    const database = await page.evaluateHandle(() => window.app.database);
    const before = await page.evaluate(() => history.length);
    await app.pickSet("None");
    await expectClosed(page, app);
    expect(await page.evaluate((old) => window.app.database === old, database)).toBe(true);
    expect((await app.query("SELECT COUNT(*) AS n FROM keep;")).rows).toEqual([["0"]]);
    expect(new URL(page.url()).search).toBe("?db=northlight");
    expect(await page.evaluate(() => history.length)).toBe(before + 1);
    // copy link now carries no set
    const link = await app.copyLink();
    const state = await page.evaluate(async (hash) => (await import("./bundle/app.js").then((bundle) => bundle.share)).decodeShare(hash).state, new URL(link).hash);
    expect(state.set).toBeUndefined();
    expect(state.exercise).toBeUndefined();
    expect(state.dataset).toBe("northlight");
});

test("choosing another dataset closes the panel", async ({ page, app }) => {
    await withSampleDataset(page);
    await app.openSet();
    await app.pickDatabase("Sample Fruit");
    await expect(app.databaseLabel).toHaveText("Sample Fruit");
    await expectClosed(page, app);
});

test("uploading a file closes the panel", async ({ page, app }) => {
    await app.openSet();
    await app.upload(SAMPLE_FILE);
    await expectClosed(page, app);
});

test("opening a URL closes the panel", async ({ page, app }) => {
    await app.openSet();
    // Ctrl+U opens the dialog (it was window.prompt); the address goes in its field, Enter opens it
    await page.keyboard.press("Control+u");
    await expect(page.locator("#open-url-dialog")).toBeVisible();
    await page.locator("#open-url-input").fill("datasets/northlight_retail.db");
    await page.keyboard.press("Enter");
    await expect(page.locator("#open-url-dialog")).toBeHidden();
    await expect(page).toHaveURL(/#datasets\/northlight_retail\.db$/);
    await expectClosed(page, app);
});

test("the logo opens the default dataset with no panel", async ({ page, app }) => {
    await app.openSet();
    await page.locator("#reset").click();
    await expect(page).toHaveURL(/\/(repo\/)?$/);
    await app.waitReady();
    await expectClosed(page, app);
    await expect(app.databaseLabel).toHaveText(DEFAULT_DATASET.name);
    expect(await page.evaluate(() => window.app.database.name)).toBe(path.posix.basename(DEFAULT_DATASET.file));
});

test("back and forward restore the right state", async ({ page, app }) => {
    await app.open(NORTHLIGHT_URL);
    await app.pickSet(SET.title);
    await expect(app.exercisePanel).toBeVisible();
    await app.exerciseButton(4).click(); // replaceState: the same history entry
    await page.goBack(); // the plain dataset page
    await expectClosed(page, app);
    await expect(app.databaseLabel).toHaveText("Northlight Retail");
    await page.goForward(); // ?set=retail-basics&ex=e04
    await expect(app.exercisePanel).toBeVisible();
    await expect(app.exerciseButton(4)).toHaveAttribute("aria-current", "true");
    await expectSetPicked(app, SET.title);
    await expect(page.locator("#exercise-check")).toHaveCount(1);
});

test("a failed upload leaves the panel on the database it belongs to", async ({ page, app }) => {
    await app.openSet();
    await app.upload({ name: "bad.db", mimeType: "application/octet-stream", buffer: Buffer.from("not a database at all") }, { ready: false });
    await expect(app.errorBand.locator(".results-band-text")).toContainText("Failed to load");
    await expect(app.exercisePanel).toBeVisible();
    expect(await page.evaluate(() => window.app.database.name)).toBe("northlight_retail.db");
});

// ---- Ctrl/Cmd+Shift+Enter ---------------------------------------------------------------------

test("Ctrl+Shift+Enter with no set open behaves as it does today: the editor runs the query", async ({ page, app }) => {
    await app.open(NORTHLIGHT_URL);
    await app.editor.fill("SELECT 42 AS answer;");
    await app.editor.press("Control+Shift+Enter");
    await app.settle();
    await expect(app.status).toHaveText(rowsIn(1));
    expect(await app.read()).toEqual({ columns: ["answer"], rows: [["42"]] });
    await expect(app.feedback).toBeHidden();
    await expect(page.locator("#exercise-check")).toHaveCount(0);
    // and with a set open, outside the editor, it checks
    await app.pickSet(SET.title);
    await page.locator("#exercise-list button").first().focus();
    await app.editor.fill(modelQuery("e01"));
    await page.locator("#exercise-list button").first().focus();
    await page.keyboard.press("Control+Shift+Enter");
    await expect(app.feedback.locator(".verdict--pass")).toBeVisible();
    await page.keyboard.press("Meta+Shift+Enter");
    await expect(app.feedback.locator(".verdict--pass")).toBeVisible();
});

// ---- keyboard, tab stops, layout ----------------------------------------------------------------

test("the list is one Tab stop with arrow keys inside, and the exercise adds at most three stops before the editor", async ({ page, app }) => {
    await app.openSet();
    // the prompt above the editor's toolbar holds the hint button, Previous and Next, and nothing
    // else that takes Tab
    const stops = await page.evaluate(() =>
        [...document.querySelector("#exercise-panel").querySelectorAll("a[href], button, input, select, textarea, [tabindex]")]
            .filter((el) => el.tabIndex >= 0 && el.offsetParent !== null)
            .map((el) => el.id || el.className)
    );
    expect(stops.length).toBeLessThanOrEqual(3);
    // the sidebar's Exercises tab: the set picker, the list (one stop), Reset progress
    expect(await page.locator("#exercise-list button[tabindex='0']").count()).toBe(1);

    // from the set picker: the list, then (below) Reset progress, the sidebar splitter, the hint
    // button, Previous, Next, Run, Check answer and the editor
    await app.setPicker.focus();
    await page.keyboard.press("Tab");
    await expect(app.exerciseButton(1)).toBeFocused();
    await page.keyboard.press("ArrowRight");
    await expect(app.exerciseButton(2)).toBeFocused();
    // moving focus is not choosing
    await expect(app.exerciseButton(1)).toHaveAttribute("aria-current", "true");
    await page.keyboard.press("ArrowDown");
    await expect(app.exerciseButton(3)).toBeFocused();
    await page.keyboard.press("End");
    await expect(app.exerciseButton(10)).toBeFocused();
    await page.keyboard.press("ArrowRight"); // stays at the end
    await expect(app.exerciseButton(10)).toBeFocused();
    await page.keyboard.press("Home");
    await expect(app.exerciseButton(1)).toBeFocused();
    await page.keyboard.press("ArrowLeft");
    await expect(app.exerciseButton(1)).toBeFocused();
    await page.keyboard.press("ArrowRight");
    await page.keyboard.press("Enter"); // choosing
    await expect(app.exerciseButton(2)).toHaveAttribute("aria-current", "true");
    await expect(app.exerciseButton(2)).toBeFocused(); // the focus stays where it was
    await expect(app.prompt).toContainText(titleOf(2));
    // the one Tab stop follows the focus
    expect(await page.locator("#exercise-list button[tabindex='0']").count()).toBe(1);
    await expect(app.exerciseButton(2)).toHaveAttribute("tabindex", "0");
    await page.keyboard.press("Tab");
    await expect(page.locator("#exercise-reset")).toBeFocused();
    await page.keyboard.press("Tab");
    await expect(page.locator("#sidebar-splitter")).toBeFocused();
    await page.keyboard.press("Tab");
    await expect(app.hintButton).toBeFocused();
    await page.keyboard.press("Tab");
    await expect(page.locator("#exercise-previous")).toBeFocused();
    await page.keyboard.press("Tab");
    await expect(page.locator("#exercise-next")).toBeFocused();
    await page.keyboard.press("Tab");
    await expect(page.locator("#execute")).toBeFocused();
    await page.keyboard.press("Tab");
    await expect(app.checkButton).toBeFocused();
    await page.keyboard.press("Tab");
    await expect(app.editor).toBeFocused();
    // and Escape, Shift+Tab goes back the same way, to the same button of the list
    await page.keyboard.press("Escape");
    await page.keyboard.press("Shift+Tab");
    await expect(app.checkButton).toBeFocused();
    await page.keyboard.press("Shift+Tab");
    await expect(page.locator("#execute")).toBeFocused();
    await page.keyboard.press("Shift+Tab");
    await expect(page.locator("#exercise-next")).toBeFocused();
    await page.keyboard.press("Shift+Tab");
    await expect(page.locator("#exercise-previous")).toBeFocused();
    await page.keyboard.press("Shift+Tab");
    await expect(app.hintButton).toBeFocused();
    await page.keyboard.press("Shift+Tab");
    await expect(page.locator("#sidebar-splitter")).toBeFocused();
    await page.keyboard.press("Shift+Tab");
    await expect(page.locator("#exercise-reset")).toBeFocused();
    await page.keyboard.press("Shift+Tab");
    await expect(app.exerciseButton(2)).toBeFocused();
});

test("focus is always visible on the panel's controls", async ({ page, app }) => {
    await app.openSet();
    for (const locator of [
        page.locator("#exercise-reset"),
        app.exerciseButton(1),
        app.hintButton,
        page.locator("#exercise-previous"),
        page.locator("#exercise-next"),
        app.checkButton,
    ]) {
        await locator.focus();
        await page.keyboard.press("Shift+Tab");
        await page.keyboard.press("Tab");
        await expect(locator).toBeFocused();
        const outline = await locator.evaluate((el) => {
            const s = getComputedStyle(el);
            return { style: s.outlineStyle, width: parseFloat(s.outlineWidth) };
        });
        expect(outline.style).not.toBe("none");
        expect(outline.width).toBeGreaterThanOrEqual(2);
    }
});

const luminance = ([r, g, b]) => {
    const f = (c) => ((c /= 255) <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
    return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
};

for (const width of [1280, 768, 390]) {
    for (const scheme of ["light", "dark"]) {
        test(`layout at ${width}px wide, ${scheme} scheme: no horizontal overflow, legible, the list wraps`, async ({ page, app }) => {
            await page.setViewportSize({ width, height: 900 });
            await page.emulateMedia({ colorScheme: scheme });
            await app.openSet();
            await app.editor.fill(modelQuery("e01").replace("DESC", "ASC"));
            await app.checkButton.click();
            await expect(app.feedback.locator(".verdict--fail table")).toHaveCount(2);
            const overflow = () => page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
            expect(await overflow()).toBeLessThanOrEqual(0);
            // (a phone shows the verdict in the Result view; the prompt and its hints are the
            // Editor view's, from Phase 6)
            await app.showView("editor");
            await app.hintButton.click();
            await passExercise(app, "e01");
            expect(await overflow()).toBeLessThanOrEqual(0);
            await expect(app.checkButton).toBeVisible();
            const box = await app.checkButton.boundingBox();
            expect(box.x + box.width).toBeLessThanOrEqual(width);
            if (width === 390) {
                // the ten buttons sit on more than one row (from Phase 6 in the sidebar's drawer,
                // opened for this, and shut again)
                await app.openDrawer();
                const ys = await page.locator("#exercise-list button").evaluateAll((bs) => new Set(bs.map((b) => Math.round(b.getBoundingClientRect().top))).size);
                expect(ys).toBeGreaterThan(1);
                expect(await overflow()).toBeLessThanOrEqual(0);
                await page.keyboard.press("Escape");
                await expect(page.locator("#sidebar")).toBeHidden();
            }
            // text is legible against its own background in both schemes
            for (const selector of [".verdict-headline", ".exercise-item--passed", "#exercise-progress", ".exercise-text"]) {
                const ratio = await page.locator(selector).first().evaluate((el) => {
                    const parse = (c) => c.match(/[\d.]+/g).slice(0, 4).map(Number);
                    let bg = [255, 255, 255, 0];
                    for (let node = el; node; node = node.parentElement) {
                        const c = parse(getComputedStyle(node).backgroundColor);
                        if ((c[3] ?? 1) > 0.5) {
                            bg = c;
                            break;
                        }
                    }
                    return { fg: parse(getComputedStyle(el).color).slice(0, 3), bg: bg.slice(0, 3) };
                });
                const [a, b] = [luminance(ratio.fg), luminance(ratio.bg)];
                const contrast = (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
                expect(contrast, `${selector} contrast`).toBeGreaterThanOrEqual(4.5);
            }
            // fail then the diff tables at this width
            await app.showView("editor");
            await app.editor.fill(modelQuery("e01").replace("DESC", "ASC"));
            await app.checkButton.click();
            await expect(app.feedback.locator(".verdict--fail")).toBeVisible();
            expect(await overflow()).toBeLessThanOrEqual(0);
        });
    }
}

// ---- hostile content ---------------------------------------------------------------------------

test("hostile set content (markup in titles, prompts, hints, set title) creates no elements and runs no script", async ({
    page,
    app,
    pageErrors,
}) => {
    const hostile = {
        id: "hostile",
        title: `Set ${PAYLOAD}`,
        dataset: "northlight",
        exercises: [
            {
                id: "h1",
                title: `Title ${PAYLOAD} ${ATTR_PAYLOAD}`,
                prompt: `Prompt ${PAYLOAD}\n${ATTR_PAYLOAD}`,
                hints: [`Hint ${PAYLOAD}`, ATTR_PAYLOAD],
                model_query: "SELECT 1 AS a;",
            },
            { id: "h2", title: "<b>bold?</b>", prompt: "<script>window.__pwned=1</script>", model_query: "SELECT 2 AS b;" },
        ],
    };
    await routeSet(page, "hostile", hostile);
    await routeListing(page, listingHtml(["hostile.json"]));
    await page.goto("./?set=hostile");
    await expect(app.exercisePanel).toBeVisible();
    await expect(app.prompt).toContainText(`Prompt ${PAYLOAD}`);
    await expect(page.locator("#exercise-set-title")).toHaveText(hostile.title);
    await app.hintButton.click();
    await app.hintButton.click();
    await expect(app.hints.locator("li")).toHaveText([`Hint 1: Hint ${PAYLOAD}`, `Hint 2: ${ATTR_PAYLOAD}`]);
    await app.exerciseButton(2).click();
    await expect(app.prompt).toContainText("<script>window.__pwned=1</script>");
    await expect(page.locator("#exercise-list button").first()).toHaveAttribute("title", hostile.exercises[0].title);
    await app.editor.fill("SELECT 3 AS c;");
    await app.checkButton.click();
    await expect(app.feedback.locator("table")).toHaveCount(2);
    // picked from the menu as well
    await app.pickSet("None");
    await app.pickSet(hostile.title);
    await expect(app.exercisePanel).toBeVisible();
    await app.expectInert();
    await expect(page.locator("#exercise-panel b")).toHaveCount(0);
    await expect(page.locator("#sidebar b")).toHaveCount(0);
    expect(pageErrors).toEqual([]);
});

test("hostile ids and a routed set with markup in ids are refused without creating elements", async ({ page, app }) => {
    const bad = {
        id: "evil",
        title: "Evil",
        dataset: "northlight",
        exercises: [{ id: PAYLOAD, title: "t", prompt: "p", model_query: "SELECT 1;" }],
    };
    await routeSet(page, "evil", bad);
    await routeSet(page, "evil2", { ...bad, id: PAYLOAD, exercises: [{ ...bad.exercises[0], id: "ok" }] });
    await routeListing(page, listingHtml(["evil.json", "evil2.json", `${PAYLOAD}.json`]));
    await app.open();
    await app.openSetMenu();
    const broken = app.setMenu.locator('[role="menuitemradio"][aria-disabled="true"]');
    // the two sets that fail validation, and the file named like markup (not an id): shown as text
    await expect(broken).toHaveCount(3);
    await expect(broken.first().locator(".menu-item-label")).toHaveText(/\.json \(not valid\)$/);
    await expect(app.setMenu.locator("img")).toHaveCount(0);
    await page.keyboard.press("Escape");
    // routed by address: the set id and the exercise id are text, never markup
    await page.goto(`./?set=${encodeURIComponent(PAYLOAD)}&ex=${encodeURIComponent(PAYLOAD)}`);
    await expect(notice(app)).toContainText("could not be opened");
    await expect(app.exercisePanel).toBeHidden();
    await app.expectInert();
    await page.goto("./?set=evil");
    await expect(notice(app)).toContainText("is not valid");
    await expect(app.exercisePanel).toBeHidden();
    await app.expectInert();
});
