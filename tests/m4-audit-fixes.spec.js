// M4 audit fixes: the SQL guard (heap limits, ATTACH, VACUUM INTO), unusable browser storage,
// the status after cancelling a set load, accessibility of the verdict, hints and exercise
// changes, the next step after a pass, the phone gutter, and the shipped exercise hints.
const { test, expect, realSet, routeSet, routeListing, listingHtml, withSampleDataset, modelQuery, SAMPLE_FILE } = require("./helpers");

const SET = realSet();
const PROGRESS_KEY = "sqllab.progress.retail-basics";
const titleOf = (n) => SET.exercises[n - 1].title;

// a throwaway exercise for checks that need their own model query
const ex = (id, model_query = "SELECT 1") => ({
    id,
    title: id,
    prompt: id,
    hints: [],
    model_query,
    order_matters: false,
    check_column_names: false,
});
const miniSet = { id: "mini", title: "Mini", dataset: "northlight", exercises: [] };

async function passExercise(app, id) {
    await app.editor.fill(modelQuery(id));
    await app.checkButton.click();
    await expect(app.feedback.locator(".verdict--pass")).toBeVisible();
}

// ---- the SQL guard ---------------------------------------------------------------------------

test.describe("the SQL guard", () => {
    test("AC5 a PRAGMA heap limit run by the student does not break a later Check", async ({ page, app }) => {
        await app.openSet();
        for (const pragma of ["PRAGMA hard_heap_limit=300000", "pragma SOFT_HEAP_LIMIT = 1", "PRAGMA main.hard_heap_limit"]) {
            await app.editor.fill(pragma);
            await page.locator("#execute").click();
            await expect(app.status).toContainText("not authorized");
        }
        // Run and Check still work, on the same page, with no reload
        await app.editor.fill(modelQuery("e01"));
        await app.checkButton.click();
        await expect(app.feedback.locator(".verdict--pass")).toBeVisible();
        await expect(app.status).toContainText("5 rows");
    });

    test("a heap limit inside a Check is refused as an SQL error, not as a broken exercise", async ({ app }) => {
        await app.open();
        const out = await app.check(null, "PRAGMA hard_heap_limit=300000; SELECT 1", { set: { ...miniSet, exercises: [ex("h1")] }, exercise: ex("h1") });
        expect(out).toMatchObject({ status: "fail", kind: "sql" });
        expect(out.message).toContain("not authorized");
        // and nothing was left behind
        expect((await app.check(null, "SELECT 1", { set: miniSet, exercise: ex("h2") })).status).toBe("pass");
    });

    test("ATTACH of a file is refused, so no file can carry state from one check to the next", async ({ app }) => {
        await app.open();
        const first = await app.check(null, "ATTACH DATABASE 'zz.db' AS z; CREATE TABLE z.t(x); INSERT INTO z.t VALUES(1); SELECT 1", {
            set: miniSet,
            exercise: ex("a1"),
        });
        expect(first).toMatchObject({ status: "fail", kind: "sql" });
        expect(first.message).toContain("not authorized");
        // a URI that names the shared in-memory filesystem is a file too
        const uri = await app.check(null, "ATTACH 'file:zz?vfs=memdb' AS z; SELECT 1", { set: miniSet, exercise: ex("a2") });
        expect(uri.kind).toBe("sql");
        const second = await app.check(null, "ATTACH DATABASE 'zz.db' AS z; SELECT COUNT(*) FROM z.t", { set: miniSet, exercise: ex("a3") });
        expect(second).toMatchObject({ status: "fail", kind: "sql" });
        expect(second.message).toContain("not authorized");
    });

    test("ATTACH ':memory:' and ATTACH '' still work, and vanish with the connection", async ({ app }) => {
        await app.open();
        const withMem = await app.check(null, "ATTACH ':memory:' AS m; CREATE TABLE m.t(x); INSERT INTO m.t VALUES(1); SELECT COUNT(*) FROM m.t", {
            set: miniSet,
            exercise: ex("m1"),
        });
        expect(withMem).toEqual({ status: "pass" });
        const temp = await app.check(null, "ATTACH '' AS t; CREATE TABLE t.q(x); SELECT 1", { set: miniSet, exercise: ex("m2") });
        expect(temp).toEqual({ status: "pass" });
        const gone = await app.check(null, "SELECT * FROM m.t", { set: miniSet, exercise: ex("m3") });
        expect(gone).toMatchObject({ status: "fail", kind: "sql" });
        expect(gone.message).toContain("no such table");
    });

    test("VACUUM INTO a file is refused every time, so no file is left in memory", async ({ page, app }) => {
        await app.open();
        for (const sql of ["VACUUM INTO 'v.db'", "  -- save it\n VACUUM main INTO 'v.db';", "/* x */ vacuum into 'v.db'"]) {
            for (let again = 0; again < 2; again++) {
                const out = await app.check(null, sql, { set: miniSet, exercise: ex(`v${again}`) });
                expect(out).toMatchObject({ status: "fail", kind: "sql" });
                expect(out.message).toContain("VACUUM INTO a file is not available");
            }
        }
        // in a plain Run too
        await app.editor.fill("VACUUM INTO 'v.db'");
        await page.locator("#execute").click();
        await expect(app.status).toContainText("VACUUM INTO a file is not available");
    });

    test("isVacuumInto matches only a statement that starts with VACUUM and says INTO", async ({ page, app }) => {
        await app.open();
        const verdicts = await page.evaluate(async () => {
            const { isVacuumInto } = await import("./js/lab/runner.js");
            return [
                "VACUUM",
                "vacuum;",
                "VACUUM main",
                "SELECT 'vacuum into'",
                "-- vacuum into\nSELECT 1",
                "INSERT INTO t VALUES ('x') -- vacuum into",
                "VACUUM INTO 'a'",
                "vacuum  main\n into 'a'",
            ].map(isVacuumInto);
        });
        expect(verdicts).toEqual([false, false, false, false, false, false, true, true]);
        // a plain VACUUM, and a query that merely mentions the words, run
        expect((await app.query("SELECT 'vacuum into' AS s")).rows).toEqual([["vacuum into"]]);
        await app.editor.fill("VACUUM");
        await app.editor.press("Control+Enter");
        await expect(app.status).toContainText("0 rows");
    });

    test("a Check that cannot open a connection says to reload; a failed model connection is not blamed on the exercise", async ({ page, app }) => {
        await app.open();
        const out = await page.evaluate(async () => {
            const { createChecker } = await import("./js/lab/checker.js");
            const manager = (await import("./js/sqlite/manager.js")).default;
            const original = manager.init;
            const checker = createChecker();
            const set = { id: "mini", dataset: "northlight" };
            const exercise = (id) => ({ id, model_query: "SELECT 1", order_matters: false, check_column_names: false });
            const results = {};
            try {
                manager.init = async (name, path) => (name === "check.db" ? null : original.call(manager, name, path));
                results.student = await checker.check(set, exercise("i1"), "SELECT 1");
                manager.init = async (name, path) => (name === "model.db" ? null : original.call(manager, name, path));
                results.model = await checker.check(set, exercise("i2"), "SELECT 1");
            } finally {
                manager.init = original;
            }
            results.after = await checker.check(set, exercise("i2"), "SELECT 1");
            return results;
        });
        for (const failed of [out.student, out.model]) {
            expect(failed).toMatchObject({ status: "unavailable", reason: "internal" });
            expect(failed.message).toContain("Reload the page");
        }
        expect(out.after).toEqual({ status: "pass" });
    });
});

// ---- browser storage that throws ---------------------------------------------------------------

const BREAKERS = {
    "every method throws SecurityError": () => {
        for (const method of ["getItem", "setItem", "removeItem"]) {
            Storage.prototype[method] = function () {
                throw new DOMException("denied", "SecurityError");
            };
        }
    },
    "setItem throws QuotaExceededError": () => {
        Storage.prototype.setItem = function () {
            throw new DOMException("full", "QuotaExceededError");
        };
    },
    "the localStorage getter itself throws": () => {
        Object.defineProperty(window, "localStorage", {
            configurable: true,
            get() {
                throw new DOMException("denied", "SecurityError");
            },
        });
    },
};

test.describe("storage that throws", () => {
    for (const [name, breaker] of Object.entries(BREAKERS)) {
        test(`Run works when ${name}`, async ({ page, app, pageErrors }) => {
            await page.addInitScript(breaker);
            await app.open();
            await expect(app.status).not.toContainText("Loading database");
            expect((await app.query("select count(*) as n from orders")).rows).toEqual([["450"]]);
            // and again: a second Run replaces the first result
            expect((await app.query("select count(*) as n from stores")).rows).toEqual([["5"]]);
            expect(pageErrors).toEqual([]);
        });

        test(`Check shows the student's own result before the verdict when ${name}`, async ({ page, app, pageErrors }) => {
            await page.addInitScript(breaker);
            await app.openSet();
            await app.editor.fill(modelQuery("e01"));
            await app.checkButton.click();
            await expect(app.feedback.locator(".verdict--pass")).toBeVisible();
            await expect(app.status).toContainText("5 rows");
            expect((await app.read()).rows.length).toBe(5);
            expect(pageErrors).toEqual([]);
        });
    }

    test("what could not be written is kept for the page's life", async ({ page, app }) => {
        await page.addInitScript(BREAKERS["setItem throws QuotaExceededError"]);
        await app.open();
        const got = await page.evaluate(async () => {
            const storage = (await import("./js/storage.js")).default;
            storage.set("db.sqlite", "select 1");
            const kept = storage.get("db.sqlite");
            storage.remove("db.sqlite");
            return [kept, storage.get("db.sqlite")];
        });
        expect(got).toEqual(["select 1", null]);
    });
});

// ---- choosing None while a set's dataset is loading --------------------------------------------

test("None while a set's dataset is loading leaves the idle status, not 'Loading database...'", async ({ page, app }) => {
    await withSampleDataset(page);
    await routeSet(page, "fruit", {
        id: "fruit",
        title: "Fruit practice",
        dataset: "sample",
        exercises: [{ id: "f1", title: "All fruit", prompt: "List the fruit.", model_query: "SELECT * FROM fruit;" }],
    });
    await routeListing(page, listingHtml(["fruit.json"]));
    await page.route(/\/datasets\/sample\.db(\?.*)?$/, async (route) => {
        await new Promise((resolve) => setTimeout(resolve, 1500));
        await route.fulfill({ path: SAMPLE_FILE, contentType: "application/octet-stream" });
    });
    await app.open();
    await app.setPicker.selectOption("fruit");
    await expect(app.status).toContainText("Loading database");
    await app.setPicker.selectOption("");
    await expect(app.status).toHaveText("Run SQL query to see the results");
    // the late response changes nothing
    await page.waitForTimeout(2200);
    await expect(app.status).toHaveText("Run SQL query to see the results");
    await expect(app.exercisePanel).toBeHidden();
    await expect(page.locator("#db-name")).toContainText("northlight_retail.db");
    // and Run still works
    expect((await app.query("select count(*) as n from stores")).rows).toEqual([["5"]]);
});

// ---- the verdict tables on a phone -------------------------------------------------------------

const WRONG_E09 = modelQuery("e09").replace("ORDER BY revenue DESC", "ORDER BY revenue ASC");
const WRONG_E01 = modelQuery("e01").replace("DESC", "ASC");

test("a failure diff wider than the screen is named, reachable by keyboard, and says to scroll sideways", async ({ page, app }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await app.openSet("retail-basics", { ex: "e09" });
    await app.editor.fill(WRONG_E09);
    await app.checkButton.click();
    const boxes = app.feedback.locator(".verdict-scroll");
    await expect(boxes).toHaveCount(2);
    await expect(app.feedback.getByRole("region", { name: "Expected" })).toHaveCount(1);
    await expect(app.feedback.getByRole("region", { name: "Your result" })).toHaveCount(1);
    for (let i = 0; i < 2; i++) {
        const info = await boxes.nth(i).evaluate((box) => ({
            wide: box.scrollWidth > box.clientWidth,
            tabindex: box.getAttribute("tabindex"),
        }));
        expect(info).toEqual({ wide: true, tabindex: "0" });
    }
    const note = app.feedback.locator(".verdict-scroll-note");
    await expect(note).toBeVisible();
    await expect(note).toContainText("Scroll sideways");
    // Tab reaches a named scroll box
    await boxes.first().focus();
    await expect(boxes.first()).toBeFocused();
    // and nothing scrolls the page itself
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
});

test("a failure diff that fits has no scroll note and no extra Tab stop", async ({ page, app }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await app.openSet();
    await app.editor.fill(WRONG_E01);
    await app.checkButton.click();
    await expect(app.feedback.locator(".verdict-scroll")).toHaveCount(2);
    await expect(app.feedback.locator(".verdict-scroll-note")).toBeHidden();
    await expect(app.feedback.locator(".verdict-scroll[tabindex]")).toHaveCount(0);
    // widening the screen back removes the stop; narrowing adds it again
    await page.setViewportSize({ width: 320, height: 800 });
    await expect(app.feedback.locator(".verdict-scroll-note")).toBeVisible();
    await expect(app.feedback.locator(".verdict-scroll[tabindex='0']")).toHaveCount(2);
});

// ---- hints ---------------------------------------------------------------------------------------

test("the hints list has a name and each hint is announced with its number", async ({ page, app }) => {
    await app.openSet();
    await app.hintButton.click();
    await app.hintButton.click();
    const list = page.getByRole("list", { name: "Hints" });
    await expect(list).toBeVisible();
    const items = list.getByRole("listitem");
    await expect(items).toHaveCount(2);
    await expect(items.first().locator(".visually-hidden")).toHaveText("Hint 1: ");
    await expect(items.nth(1).locator(".visually-hidden")).toHaveText("Hint 2: ");
    // a reload of the exercise rebuilds them the same way
    await app.exerciseButton(2).click();
    await app.exerciseButton(1).click();
    await expect(list.getByRole("listitem").first().locator(".visually-hidden")).toHaveText("Hint 1: ");
});

// ---- the next step after a pass ------------------------------------------------------------------

async function seedProgress(page, ids) {
    await page.addInitScript(
        ({ key, ids }) => {
            if (!localStorage.getItem(key)) {
                localStorage.setItem(key, JSON.stringify({ v: 1, passed: Object.fromEntries(ids.map((id) => [id, true])), drafts: {} }));
            }
        },
        { key: PROGRESS_KEY, ids }
    );
}
const ALL = SET.exercises.map((e) => e.id);

test("a pass offers the next exercise; the button opens it, puts the focus in the editor and announces the prompt", async ({ page, app }) => {
    await app.openSet();
    await passExercise(app, "e01");
    const next = app.feedback.getByRole("button", { name: "Next: Exercise 2" });
    await expect(next).toBeVisible();
    await next.click();
    await expect(app.exerciseButton(2)).toHaveAttribute("aria-current", "true");
    await expect(app.feedback).toBeHidden();
    await expect(app.editor).toBeFocused();
    await expect(page.locator("#exercise-announce")).toHaveText(
        `Exercise 2 of 10: ${titleOf(2)}. ${SET.exercises[1].prompt}`
    );
    // the address follows, as for any change of exercise
    expect(new URL(page.url()).search).toBe("?set=retail-basics&ex=e02");
});

test("the next exercise skips the ones already passed and wraps round to the start", async ({ page, app }) => {
    await seedProgress(page, ALL.filter((id) => id !== "e03" && id !== "e05"));
    await app.openSet("retail-basics", { ex: "e03" });
    await passExercise(app, "e03");
    // e04 is passed: the next unpassed one is e05
    await expect(app.feedback.getByRole("button", { name: "Next: Exercise 5" })).toBeVisible();
    await app.feedback.getByRole("button", { name: "Next: Exercise 5" }).click();
    await passExercise(app, "e05");
    await expect(app.feedback.getByText("All 10 exercises complete")).toBeVisible();
    await expect(app.feedback.getByRole("button")).toHaveCount(0);
});

test("wrapping: from the last unpassed exercise to an earlier one", async ({ page, app }) => {
    await seedProgress(page, ALL.filter((id) => id !== "e03" && id !== "e08"));
    await app.openSet("retail-basics", { ex: "e08" });
    await passExercise(app, "e08");
    await expect(app.feedback.getByRole("button", { name: "Next: Exercise 3" })).toBeVisible();
    await expect(app.feedback.getByText("All 10 exercises complete")).toHaveCount(0);
});

test("passing the last exercise says the set is complete and offers no next step", async ({ page, app }) => {
    await seedProgress(page, ALL.filter((id) => id !== "e10"));
    await app.openSet("retail-basics", { ex: "e10" });
    await passExercise(app, "e10");
    await expect(app.progress).toHaveText("10/10 complete");
    await expect(app.feedback).toContainText("All 10 exercises complete");
    await expect(app.feedback.getByRole("button")).toHaveCount(0);
});

test("choosing an exercise from the list announces it and leaves the focus on the list", async ({ page, app }) => {
    await app.openSet();
    const live = page.locator("#exercise-announce");
    await expect(live).toHaveAttribute("role", "status");
    await expect(live).toHaveAttribute("aria-live", "polite");
    await app.exerciseButton(3).focus();
    await page.keyboard.press("Enter");
    await expect(live).toHaveText(`Exercise 3 of 10: ${titleOf(3)}. ${SET.exercises[2].prompt}`);
    await expect(app.exerciseButton(3)).toBeFocused();
    // the live region holds text only, never markup
    expect(await live.evaluate((node) => node.children.length)).toBe(0);
});

// ---- the phone gutter ----------------------------------------------------------------------------

test("on a phone the editor and the command bar have the same side gutter as the panel", async ({ page, app }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await app.openSet();
    const boxes = await page.evaluate(() => {
        const box = (selector) => {
            const r = document.querySelector(selector).getBoundingClientRect();
            return { left: Math.round(r.left), right: Math.round(r.right) };
        };
        return {
            panel: box("#exercise-panel"),
            editor: box("#editor"),
            bar: box("#commandbar"),
            noScroll: document.documentElement.scrollWidth <= document.documentElement.clientWidth,
        };
    });
    expect(boxes.noScroll).toBe(true);
    for (const name of ["editor", "bar"]) {
        expect(boxes[name].left, `${name} left`).toBe(boxes.panel.left);
        expect(boxes[name].right, `${name} right`).toBe(boxes.panel.right);
        expect(boxes[name].left).toBeGreaterThanOrEqual(16);
    }
});

// ---- the shipped hints ---------------------------------------------------------------------------

test("e08's last hint says that ORDER BY is what guarantees the order", async () => {
    const hints = SET.exercises.find((e) => e.id === "e08").hints;
    expect(hints[hints.length - 1]).toMatch(/GROUP BY does not promise any order/);
});

test("e09's hints leave the CTE name and the window clause to the student", async () => {
    const e09 = SET.exercises.find((e) => e.id === "e09");
    const text = e09.hints.join("\n");
    expect(text).not.toMatch(/PARTITION BY/i);
    expect(text).not.toMatch(/product_revenue/);
    expect(text).not.toMatch(/ORDER BY revenue/i);
});

test("no hint of the shipped set repeats a stretch of its model query", async () => {
    for (const exercise of SET.exercises) {
        const model = exercise.model_query.replace(/\s+/g, " ");
        for (const hint of exercise.hints) {
            const flat = hint.replace(/\s+/g, " ");
            for (let at = 0; at + 40 <= model.length; at++) {
                expect(flat.includes(model.slice(at, at + 40)), `${exercise.id}: "${model.slice(at, at + 40)}"`).toBe(false);
            }
        }
    }
});
