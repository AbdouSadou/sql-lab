// UI plan, Phase 4: what the independent review of the results pane, the toasts and the dialogs
// found, and the fixes that followed. Each describe pins one fix, so it can fail if the behaviour
// breaks (every test here has been seen to fail on a mutated copy of the module that implements
// it). tests/ui4-results.spec.js has the page's states and their texts; this file has what a
// reviewer found missing or wrong:
//
//   - Run keeps the keyboard focus (Enter, Space, a click, Ctrl+Enter), and is never disabled
//   - a Run asked for in the frame before a load begins is dropped, and the pane stays loading
//   - a load that fails keeps the view: the table and its summary (Download CSV working), or "no
//     result yet", come back, and the failure's band goes above them until the next state
//   - a Check's run is shown, not said; the verdict is what is said (from Phase 5, in words, by the
//     same live region)
//   - the live region is emptied when the pane changes state; an empty Run is said
//   - a refusal toast is a note ("i"), not a confirmation (tick) or a failure (alert sign): a Run
//     while a database loads, nothing to export, a link too long, the export dialog's refusals
//   - the sample buttons are named by what they show (WCAG 2.5.3), the SQL cut at 120 characters
//   - the long-cell popover is described; the 60-character cut is by grapheme; the focused long
//     cell is never under the sticky header; its target is the whole cell (44 px on a touch screen)
//   - the progress bar shows in forced colours; long unbroken text wraps; "database", not "dataset"
//   - the phone's summary line is one row
const path = require("node:path");
const AxeBuilder = require("@axe-core/playwright").default;
const {
    test,
    expect,
    modelQuery,
    realManifest,
    realSet,
    routeManifest,
    routeSet,
    routeListing,
    listingHtml,
    withSampleDataset,
    SAMPLE_FILE,
    SAMPLE_ENTRY,
    editorValue,
} = require("./helpers");

const SAMPLE_URL = /\/datasets\/sample\.db(\?.*)?$/;
const JUNK = { name: "junk.db", mimeType: "application/octet-stream", buffer: Buffer.from("this is not a database at all") };
const SET = realSet();

// ---- helpers ----------------------------------------------------------------------------------

function gate() {
    let open;
    const promise = new Promise((resolve) => (open = resolve));
    return { promise, open };
}

// serves the sample fixture as datasets/sample.db once `held` opens (a load that takes its time)
async function holdSample(page, held, { fail = false } = {}) {
    await page.route(SAMPLE_URL, async (route) => {
        await held.promise;
        if (fail) {
            await route.fulfill({ status: 404, body: "no" });
            return;
        }
        await route.fulfill({ path: SAMPLE_FILE, contentType: "application/octet-stream" });
    });
}

// datasets/sample.db that cannot be had
const failSample = (page) => page.route(SAMPLE_URL, (route) => route.fulfill({ status: 404, body: "no" }));

// "Open from URL…" with its shortcut: the address goes in the dialog, Enter opens it
async function openFromUrl(page, address) {
    await page.keyboard.press("Control+u");
    const input = page.locator("#open-url-input");
    await expect(input).toBeVisible();
    await input.fill(address);
    await input.press("Enter");
}

// counts lab:run-finished from now on
async function countRuns(page) {
    await page.evaluate(() => {
        window.__runs = 0;
        document.addEventListener("lab:run-finished", () => window.__runs++);
    });
}
const runs = (page) => page.evaluate(() => window.__runs);

// records every text the live region says, as it is said (the empty ones left out)
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

// a result on screen: what the table, the summary line and the CSV were, to compare with what
// comes back
const STORES = "SELECT * FROM stores ORDER BY store_id;";
async function showStores(app) {
    const table = await app.query(STORES);
    const summary = await app.status.textContent();
    const csv = (await app.downloadCsv()).text;
    return { table, summary, csv };
}

// the view that was on screen is the one on screen: the table, its summary line, and a Download
// CSV that gives the same file
async function expectViewKept(app, before) {
    await expect(app.pane).toHaveAttribute("data-state", "result");
    await expect(app.summary).toBeVisible();
    await expect(app.status).toHaveText(before.summary);
    expect(await app.read()).toEqual(before.table);
    await expect(app.csvButton).toBeVisible();
    expect((await app.downloadCsv()).text).toBe(before.csv);
}

// the failure's band: one, at the top of the pane (outside #result, before the summary line), said
async function expectBandAbove(page, app, text) {
    await expect(app.errorBand).toHaveCount(1);
    const band = page.locator("#results-pane > .results-problem .results-band");
    await expect(band).toHaveCount(1);
    await expect(band.locator(".results-band-text")).toContainText(text);
    expect(
        await page.evaluate(() => {
            const slot = document.querySelector(".results-problem");
            const summary = document.getElementById("results-summary");
            return {
                outside: !document.getElementById("result").contains(slot),
                before: Boolean(slot.compareDocumentPosition(summary) & Node.DOCUMENT_POSITION_FOLLOWING),
            };
        })
    ).toEqual({ outside: true, before: true });
    await expect(app.announcer).toContainText(text);
}

// no band anywhere in the pane
async function expectNoBand(page, app) {
    await expect(app.errorBand).toHaveCount(0);
    await expect(page.locator(".results-problem")).toBeHidden();
}

// two frames drawn (what js/lab/result-scroll.js measures on)
const twoFrames = (page) => page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));

// the result neither scrolls sideways nor says it does, and neither does the page
async function expectNoSideways(page, selector = null) {
    await twoFrames(page);
    const m = await page.evaluate((sel) => {
        const result = document.getElementById("result");
        const own = sel ? document.querySelector(sel) : null;
        return {
            page: document.documentElement.scrollWidth - window.innerWidth,
            result: result.scrollWidth - result.clientWidth,
            own: own ? own.scrollWidth - own.clientWidth : 0,
            noteHidden: document.getElementById("result-scroll-note").hidden,
        };
    }, selector);
    expect(m.page, "the page scrolls sideways").toBeLessThanOrEqual(0);
    expect(m.result, "the result scrolls sideways").toBeLessThanOrEqual(1);
    expect(m.own, `${selector} is wider than its box`).toBeLessThanOrEqual(1);
    expect(m.noteHidden, "the scroll sideways note shows").toBe(true);
}

// a query too long for a link, built of text that does not compress
function incompressibleSql() {
    let seed = 2463534242;
    const noise = Array.from({ length: 150000 }, () => {
        seed ^= seed << 13;
        seed ^= seed >>> 17;
        seed ^= seed << 5;
        return "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789"[(seed >>> 0) % 62];
    }).join("");
    return `SELECT '${noise}';`;
}

// ---- Run keeps the keyboard focus -------------------------------------------------------------

test.describe("Run keeps the keyboard focus", () => {
    // Before the fix Run answered its ActionController only when the run was over, so the button was
    // disabled (and lost the focus to the page) for the frame the run waits and for the run itself.
    for (const how of ["Enter", "Space", "click"]) {
        test(`${how} on Run runs the query, and Run keeps the focus and is never disabled`, async ({ page, app }) => {
            await app.open();
            await app.editor.fill("SELECT 1 AS one;");
            await countRuns(page);
            // Run is looked at once a frame: the page sets "disabled" and takes it off again within one
            // task while it answers at once (nothing is drawn, the focus stays); held through the
            // frame the run waits for, it would be drawn grey and lose the focus
            await page.evaluate(() => {
                window.__disabledFrames = 0;
                const button = document.getElementById("execute");
                const look = () => {
                    if (button.disabled) {
                        window.__disabledFrames++;
                    }
                    requestAnimationFrame(look);
                };
                look();
            });
            const run = page.locator("#execute");
            const press = async () => {
                if (how === "click") {
                    await run.click();
                } else {
                    await run.focus();
                    await page.keyboard.press(how);
                }
            };
            await press();
            await app.settle();
            await expect(app.pane).toHaveAttribute("data-state", "result");
            await expect(app.status).toHaveText(/^1 row in \d+ ms$/);
            await expect(run).toBeFocused();
            await expect(run).toBeEnabled();
            // pressed again, it runs again: the key still goes to the button
            await press();
            await app.settle();
            expect(await runs(page)).toBe(2);
            await expect(run).toBeFocused();
            expect(await page.evaluate(() => window.__disabledFrames), "frames drawn with Run disabled").toBe(0);
        });
    }

    test("Ctrl+Enter from the editor still runs, and the editor keeps the focus", async ({ page, app }) => {
        await app.open();
        await app.editor.fill("SELECT 2 AS two;");
        await app.editor.press("Control+Enter");
        await app.settle();
        await expect(app.pane).toHaveAttribute("data-state", "result");
        expect(await app.read()).toEqual({ columns: ["two"], rows: [["2"]] });
        await expect(app.editor).toBeFocused();
        await expect(page.locator("#execute")).toBeEnabled();
    });
});

// ---- a Run in the frame before a load begins is dropped ---------------------------------------

test.describe("a Run asked for in the frame before a load begins", () => {
    // The Run waits one painted frame before it starts; a load that begins in that frame (here:
    // Open from URL, in the same task) would have the result replace the loading pane of a database
    // that is going away. tests/ui4-results.spec.js has the run that must not INSERT in that frame.
    test("is dropped: nothing runs, the pane stays loading, and the editor gets the focus when the database opens", async ({ page, app }) => {
        const held = gate();
        await page.route(/\/datasets\/slow\.db(\?.*)?$/, async (route) => {
            await held.promise;
            await route.fulfill({ path: SAMPLE_FILE, contentType: "application/octet-stream" });
        });
        await app.open();
        await countRuns(page);
        await page.keyboard.press("Control+u");
        await page.locator("#open-url-input").fill("datasets/slow.db");
        // one task: Run is pressed, and the load begins before the frame that Run waits for (the
        // dialog is modal, so the editor is filled from the page, not typed in)
        await page.evaluate(() => {
            window.app.ui.editor.value = "SELECT 42 AS answer;";
            window.app.actions.executeCurrent();
            document.querySelector('#open-url-dialog button[type="submit"]').click();
        });
        await expect(app.pane).toHaveAttribute("data-state", "loading");
        await app.settle();
        await expect(app.pane).toHaveAttribute("data-state", "loading");
        expect(await runs(page), "a run finished").toBe(0);
        await expect(app.table).toHaveCount(0);
        await expect(app.summary).toBeHidden();
        await expect(page.locator(".results-running")).toHaveCount(0);
        await expect(page.locator("#result .results-loading-title")).toHaveText("Loading slow.db");
        await expect(page.locator("#execute")).toBeEnabled();
        held.open();
        await expect(app.toast).toHaveText("Opened slow.db");
        await expect(app.pane).toHaveAttribute("data-state", "empty");
        await expect(app.table).toHaveCount(0);
        await expect(app.editor).toBeFocused();
        expect(await runs(page)).toBe(0);
    });
});

// ---- a failed load keeps the view -------------------------------------------------------------

test.describe("a load that fails keeps the view", () => {
    const SWITCH_FAILED = `The database "${SAMPLE_ENTRY.name}" could not be loaded. The previous database is still open.`;

    test("a switch whose fetch fails: the table, its summary and Download CSV come back, the band is above them and goes at the next Run", async ({ page, app }) => {
        await withSampleDataset(page);
        await app.open();
        const before = await showStores(app);
        await failSample(page);
        await app.pickDatabaseById("sample");
        await expectBandAbove(page, app, SWITCH_FAILED);
        await expectViewKept(app, before);
        expect(await page.evaluate(() => window.app.database.name)).toBe("northlight_retail.db");
        // the next state takes the band away
        await app.run("SELECT 2 AS two;");
        await expect(app.pane).toHaveAttribute("data-state", "result");
        await expectNoBand(page, app);
        expect(await app.read()).toEqual({ columns: ["two"], rows: [["2"]] });
    });

    test("the band goes when the next load begins, and the view it left is the one after a second failure", async ({ page, app }) => {
        await withSampleDataset(page);
        await app.open();
        const before = await showStores(app);
        await failSample(page);
        await app.pickDatabaseById("sample");
        await expectBandAbove(page, app, SWITCH_FAILED);
        // a second load, held: the pane is loading and the old band is gone
        const held = gate();
        await holdSample(page, held, { fail: true });
        await app.pickDatabaseById("sample");
        await expect(app.pane).toHaveAttribute("data-state", "loading");
        await expectNoBand(page, app);
        // and it fails too: the table of the first run is still the view that comes back
        held.open();
        await expectBandAbove(page, app, SWITCH_FAILED);
        await expectViewKept(app, before);
    });

    test("an upload the engine refuses, with no result yet on screen: the empty state stays, the band is above it", async ({ page, app }) => {
        await app.open();
        await expect(app.samples).toHaveCount(3);
        await app.upload(JUNK, { ready: false });
        await expectBandAbove(page, app, "Failed to load database from");
        await expect(app.pane).toHaveAttribute("data-state", "empty");
        await expect(app.emptyState).toBeVisible();
        await expect(app.samples).toHaveCount(3);
        // the band is not in #result: that holds the view that came back
        await expect(page.locator("#result .results-band")).toHaveCount(0);
        expect(await page.evaluate(() => window.app.database.name)).toBe("northlight_retail.db");
        await expect(app.databaseLabel).toHaveText("Northlight Retail");
    });

    test("an upload the engine refuses, with a result on screen: the result comes back", async ({ page, app }) => {
        await app.open();
        const before = await showStores(app);
        await app.upload(JUNK, { ready: false });
        await expectBandAbove(page, app, "Failed to load database from");
        await expectViewKept(app, before);
    });

    test("Open from URL that fails: the result comes back, the band is above it", async ({ page, app }) => {
        await app.open();
        const before = await showStores(app);
        await openFromUrl(page, "datasets/gone.db");
        await expectBandAbove(page, app, "Failed to load database from URL datasets/gone.db");
        await expectViewKept(app, before);
        await expect(app.databaseLabel).toHaveText("Northlight Retail");
    });

    test("back to a database that cannot be fetched: the result stays, the band says so", async ({ page, app }) => {
        await withSampleDataset(page);
        await page.goto("./?db=sample");
        await app.waitReady();
        await expect(app.databaseLabel).toHaveText(SAMPLE_ENTRY.name);
        await app.pickDatabaseById("northlight");
        await expect(app.databaseLabel).toHaveText("Northlight Retail");
        const before = await showStores(app);
        await failSample(page);
        await page.evaluate(() => history.back());
        await expectBandAbove(page, app, SWITCH_FAILED);
        await expectViewKept(app, before);
        expect(await page.evaluate(() => window.app.database.name)).toBe("northlight_retail.db");
    });

    test("a set that cannot be opened (its database is not in the manifest): the result stays, the band says why", async ({ page, app }) => {
        await routeSet(page, "orphan", { id: "orphan", title: "Orphan practice", dataset: "missing-data", exercises: [{ id: "o1", title: "One", prompt: "p", model_query: "SELECT 1;" }] });
        await routeListing(page, listingHtml(["retail-basics.json", "orphan.json"]));
        await app.open();
        const before = await showStores(app);
        await app.pickSet("Orphan practice");
        await expectBandAbove(page, app, 'The exercise set "orphan" could not be opened');
        await expect(app.errorBand).toContainText('It needs the database "missing-data", which is not available on this site.');
        await expectViewKept(app, before);
        await expect(app.exercisePanel).toBeHidden();
    });

    test("a set closed while its database loads: the view comes back, with no band", async ({ page, app }) => {
        await withSampleDataset(page);
        await routeSet(page, "fruit", {
            id: "fruit",
            title: "Fruit practice",
            dataset: "sample",
            exercises: [{ id: "f1", title: "All fruit", prompt: "List the fruit.", model_query: "SELECT * FROM fruit;" }],
        });
        await routeListing(page, listingHtml(["retail-basics.json", "fruit.json"]));
        const held = gate();
        await holdSample(page, held);
        await app.open();
        const before = await showStores(app);
        await app.pickSet("Fruit practice");
        await expect(app.pane).toHaveAttribute("data-state", "loading");
        await expect(page.locator("#result .results-loading-title")).toHaveText(`Loading ${SAMPLE_ENTRY.name}`);
        await app.pickSet("None");
        await expectViewKept(app, before);
        await expectNoBand(page, app);
        await expect(app.announcer).toHaveText("");
        // the load that was given up finishes and changes nothing
        const served = page.waitForResponse(SAMPLE_URL);
        held.open();
        await served;
        await page.waitForTimeout(300);
        await expectViewKept(app, before);
        await expectNoBand(page, app);
        await expect(app.databaseLabel).toHaveText("Northlight Retail");
    });

    test("with no database open the band is in #result, alone, however many loads fail", async ({ page, app }) => {
        await page.goto("./#datasets/gone.db");
        await expect(app.errorBand).toContainText("Failed to load database from URL datasets/gone.db");
        await expect(app.pane).toHaveAttribute("data-state", "error");
        await expect(page.locator("#result .results-band")).toHaveCount(1);
        await expect(page.locator(".results-problem .results-band")).toHaveCount(0);
        await expect(app.announcer).toContainText("Failed to load database from URL datasets/gone.db");
        // a second failure: still one band, still in #result
        await openFromUrl(page, "datasets/gone-too.db");
        await expect(app.errorBand).toContainText("Failed to load database from URL datasets/gone-too.db");
        await expect(app.errorBand).toHaveCount(1);
        await expect(page.locator("#result .results-band")).toHaveCount(1);
        await expect(page.locator(".results-problem .results-band")).toHaveCount(0);
        await expect(app.pane).toHaveAttribute("data-state", "error");
        // and a Run says there is no database
        await app.editor.fill("SELECT 1;");
        await app.editor.press("Control+Enter");
        await expect(page.locator("#result .results-band-text")).toHaveText("No database is loaded.");
        await expect(app.errorBand).toHaveCount(1);
    });
});

// ---- a Check's run is quiet -------------------------------------------------------------------

test.describe("a Check's run is shown, not said", () => {
    // The Check runs the student's SQL in the results pane like Run does, but the live region would
    // say "5 rows returned" or the SQL error on top of the verdict. Only the verdict is said: from
    // Phase 5 the banner is not a live region, and the results pane's live region says the
    // verdict's words, once (js/lab/exercise-panel.js showVerdict).
    const CASES = [
        { name: "passing", sql: () => modelQuery("e01"), verdict: ".verdict--pass", pane: "result", said: "Correct. 5 rows match." },
        { name: "failing", sql: () => "SELECT 1 AS one;", verdict: ".verdict--fail", pane: "result", said: "Not quite. expected 2 columns, got 1." },
        {
            name: "erroring",
            sql: () => "SELECT * FROM no_such_table;",
            verdict: ".verdict--fail",
            pane: "error",
            said: "Not quite. no such table: no_such_table.",
        },
    ];
    for (const c of CASES) {
        test(`a ${c.name} Check: the run is on screen, #results-announce says the verdict alone, the verdict is in #exercise-feedback`, async ({ page, app }) => {
            await app.openSet();
            await recordSaid(page);
            await app.editor.fill(c.sql());
            await app.checkButton.click();
            await expect(app.feedback.locator(c.verdict)).toBeVisible();
            await expect(app.feedback).not.toHaveText("");
            await app.settle();
            await expect(app.pane).toHaveAttribute("data-state", c.pane);
            if (c.pane === "error") {
                await expect(app.errorBand.locator(".results-band-message")).toHaveText("no such table: no_such_table");
                // the banner points at the band rather than repeating its message (Phase 5); the
                // message is what is said (c.said)
                await expect(app.feedback).toContainText("This query has an error, shown below.");
            } else {
                await expect(app.table).toBeVisible();
            }
            // longer than the gap between emptying the live region and filling it
            await page.waitForTimeout(300);
            // the verdict, once, and nothing of the run ("5 rows returned", the run's error)
            expect(await said(page), "what #results-announce said").toEqual([c.said]);
            await expect(app.announcer).toHaveText(c.said);
        });
    }

    test("a plain Run in the same page is said (so the check above can fail)", async ({ page, app }) => {
        await app.openSet();
        await recordSaid(page);
        await app.run("SELECT 1 AS one;");
        await expect.poll(() => said(page)).toEqual(["1 row returned"]);
    });
});

// ---- the live region follows the pane ---------------------------------------------------------

test.describe("the live region", () => {
    test("is emptied when a load begins: it never says '20 rows returned' beside a loading pane", async ({ page, app }) => {
        await withSampleDataset(page);
        await app.open();
        await app.run("SELECT * FROM products;");
        await expect(app.announcer).toHaveText("20 rows returned");
        await holdSample(page, gate());
        await app.pickDatabaseById("sample");
        await expect(app.pane).toHaveAttribute("data-state", "loading");
        await expect(app.announcer).toHaveText("");
    });

    test("is emptied when the pane goes back to no result yet, and says the empty Run", async ({ page, app }) => {
        await app.open();
        await app.run("SELECT * FROM products;");
        await expect(app.announcer).toHaveText("20 rows returned");
        await page.evaluate(() => {
            window.__says = [];
            const region = document.getElementById("results-announce");
            new MutationObserver(() => {
                const last = window.__says.at(-1);
                if (region.textContent !== last) {
                    window.__says.push(region.textContent);
                }
            }).observe(region, { childList: true, characterData: true, subtree: true });
        });
        await app.editor.fill("   ");
        await page.locator("#execute").click();
        await app.settle();
        await expect(app.announcer).toHaveText("Run a query to see its result here.");
        // the old words went before the new ones came
        expect(await page.evaluate(() => window.__says)).toEqual(["", "Run a query to see its result here."]);
    });
});

test.describe("an empty Run", () => {
    test("is said: 'Run a query to see its result here.', from a fresh page and over a result; nothing runs", async ({ page, app }) => {
        await app.open();
        await countRuns(page);
        await expect(app.announcer).toHaveText("");
        await app.editor.fill("");
        await page.locator("#execute").click();
        await app.settle();
        await expect(app.announcer).toHaveText("Run a query to see its result here.");
        await expect(app.pane).toHaveAttribute("data-state", "empty");
        // over a result: the table goes, the words are said again
        await app.run("SELECT 1 AS one;");
        await expect(app.announcer).toHaveText("1 row returned");
        await app.editor.fill("");
        await page.locator("#execute").click();
        await app.settle();
        await expect(app.announcer).toHaveText("Run a query to see its result here.");
        await expect(app.pane).toHaveAttribute("data-state", "empty");
        await expect(app.table).toHaveCount(0);
        expect(await runs(page), "runs finished: only the one with SQL").toBe(1);
    });
});

// ---- the tone of a toast ----------------------------------------------------------------------

test.describe("toast tones", () => {
    const toneOf = (page) =>
        page.locator("#toast-region .toast").evaluate((card) => ({
            kind: [...card.classList].filter((c) => c.startsWith("toast--")),
            icon: card.querySelector(".toast-icon use")?.getAttribute("href"),
        }));

    test("a Run refused while a database loads is a note: the 'i', not the tick", async ({ page, app }) => {
        await withSampleDataset(page);
        await app.open();
        const held = gate();
        await holdSample(page, held);
        await app.pickDatabaseById("sample");
        await expect(app.pane).toHaveAttribute("data-state", "loading");
        await app.editor.fill("SELECT 1;");
        await app.editor.press("Control+Enter");
        await expect(app.toast).toHaveText("A database is still loading, so nothing was run. Press Run again once it has opened.");
        expect(await toneOf(page)).toEqual({ kind: ["toast--note"], icon: "#icon-info" });
        held.open();
    });

    test("an evidence export with nothing to export is a note too", async ({ page, app }) => {
        await app.open();
        await app.openEvidence();
        await expect(app.toast).toHaveText("Nothing to export yet. Run a query first, then export your evidence.");
        expect(await toneOf(page)).toEqual({ kind: ["toast--note"], icon: "#icon-info" });
        await expect(app.evidenceDialog).toBeHidden();
    });

    test("a confirmation keeps the tick and a failure the alert sign", async ({ page, app }) => {
        await app.open();
        await app.copyLink();
        expect(await toneOf(page)).toEqual({ kind: ["toast--info"], icon: "#icon-check" });
        // a failure: the CSV file cannot be saved
        await app.query("SELECT * FROM stores;");
        await page.evaluate(() => {
            URL.createObjectURL = () => {
                throw new Error("no");
            };
        });
        await app.csvButton.click();
        await expect(app.toast).toHaveText("The CSV file could not be saved.");
        expect(await toneOf(page)).toEqual({ kind: ["toast--problem"], icon: "#icon-circle-alert" });
    });

    test("a query too long for a link is a refusal: a note, not a failure", async ({ page, app }) => {
        await app.open();
        await app.editor.fill(incompressibleSql());
        await page.locator("#copy-link").click();
        await expect(app.toast).toHaveText("This query is too long to put in a link. Shorten it, or send the text itself.");
        expect(await toneOf(page)).toEqual({ kind: ["toast--note"], icon: "#icon-info" });
    });

    test("the export dialog's refusal on an empty database is a note", async ({ page, app }) => {
        await app.openEmpty();
        await app.recordToasts();
        await app.openExportMenu();
        await page.locator("#export-db").click();
        await expect(app.toast).toHaveText("The database is empty, so there is nothing to export. Create a table first.");
        expect(await toneOf(page)).toEqual({ kind: ["toast--note"], icon: "#icon-info" });
        // it is the refusal alone: no dialog, no file
        await expect(page.locator("#export-dialog")).toBeHidden();
        await app.expectToasts(["The database is empty, so there is nothing to export. Create a table first."]);
    });

    test("the export dialog's refusal with no database open is a note", async ({ page, app }) => {
        await page.goto("./#datasets/gone.db");
        await expect(app.errorBand).toContainText("Failed to load database from URL datasets/gone.db");
        await app.recordToasts();
        await app.openExportMenu();
        await page.locator("#export-db").click();
        await expect(app.toast).toHaveText("No database is loaded.");
        expect(await toneOf(page)).toEqual({ kind: ["toast--note"], icon: "#icon-info" });
        await expect(page.locator("#export-dialog")).toBeHidden();
        await app.expectToasts(["No database is loaded."]);
    });
});

// ---- the sample buttons' names ----------------------------------------------------------------

test.describe("the sample buttons", () => {
    test("are named by what they show: axe finds no label-content-name-mismatch", async ({ page, app }) => {
        await app.open();
        await expect(app.samples).toHaveCount(3);
        const results = await new AxeBuilder({ page })
            .options({ rules: { "label-content-name-mismatch": { enabled: true } } })
            .include("#result")
            .analyze();
        // (the rule is experimental, so it is switched on; it only looks at a button whose name is an
        // aria-label or aria-labelledby, so the next two checks say there is none)
        expect(results.violations.filter((v) => v.id === "label-content-name-mismatch").map((v) => v.nodes.map((n) => n.target.join(" ")))).toEqual([]);
        // and no button hides its words behind a label of its own
        await expect(app.samples.first()).not.toHaveAttribute("aria-label", /./);
        await expect(app.samples.first()).not.toHaveAttribute("aria-labelledby", /./);
    });

    test("the name is the label and the SQL; the long third sample is cut at 120 characters with an ellipsis", async ({ page, app }) => {
        const manifest = realManifest();
        const samples = manifest.datasets[0].samples;
        await app.open();
        const names = [];
        for (let i = 0; i < 3; i++) {
            const snapshot = await app.samples.nth(i).ariaSnapshot();
            names.push(/^- button "(.*)"$/s.exec(snapshot.trim())[1]);
        }
        const oneLine = (sql) => sql.replace(/\s+/g, " ").replace(/\(\s+/g, "(").replace(/\s+\)/g, ")").trim();
        // the two short ones: the label, then the whole statement
        expect(names[0]).toBe(`${samples[0].label} ${oneLine(samples[0].sql)}`);
        expect(names[1]).toBe(`${samples[1].label} ${oneLine(samples[1].sql)}`);
        // the third: the label, then 120 characters at most and the ellipsis
        expect(oneLine(samples[2].sql).length).toBeGreaterThan(121);
        expect(names[2].startsWith(`${samples[2].label} WITH category_revenue AS (SELECT p.category`)).toBe(true);
        expect(names[2].endsWith("…")).toBe(true);
        const sqlPart = names[2].slice(samples[2].label.length).trim();
        expect(sqlPart.length).toBeLessThanOrEqual(121);
        expect(sqlPart.length).toBeGreaterThan(100);
        // the button shows the same words it is named by
        const shown = await app.samples.nth(2).locator(".results-sample-sql").textContent();
        expect(shown).toBe(sqlPart);
    });
});

// ---- the long-cell popover --------------------------------------------------------------------

test.describe("the long-cell popover", () => {
    test("is described by its length line only; the value is its content", async ({ page, app }) => {
        await app.open();
        await app.query(`SELECT printf('%.100c', 'x') AS v;`);
        const popover = page.locator("#cell-popover");
        await expect(popover).toHaveAttribute("aria-describedby", "cell-popover-length");
        await app.table.locator("button.cell-more").click();
        await expect(popover).toBeVisible();
        await expect(popover).toHaveAccessibleDescription("100 characters");
        await expect(popover).toHaveAccessibleName("v, row 1");
        // the value is what the popover holds, not what describes it
        await expect(page.locator("#cell-popover-value")).toHaveText("x".repeat(100));
        expect(await popover.evaluate((p) => p.contains(document.getElementById("cell-popover-value")))).toBe(true);
    });
});

// ---- the 60-character cut is by grapheme ------------------------------------------------------

test.describe("the 60-character cut", () => {
    // each cluster starts at the 60th position and is more than one code point, so a cut after 60
    // code points would split it
    const CLUSTERS = [
        ["a family emoji (ZWJ sequence)", "\u{1F468}‍\u{1F469}‍\u{1F467}‍\u{1F466}"],
        ["a flag", "\u{1F1EB}\u{1F1F7}"],
        ["a skin tone", "\u{1F44D}\u{1F3FD}"],
        ["a letter with a combining accent", "é"],
    ];
    const TAIL = "abcdefghij";

    for (const [name, cluster] of CLUSTERS) {
        test(`${name} at the 60th character is one character: kept whole, never cut apart, and counted once`, async ({ page, app }) => {
            await app.open();
            const value = "x".repeat(59) + cluster + TAIL;
            await app.query(`SELECT '${value}' AS v;`);
            const button = app.table.locator("button.cell-more");
            await expect(button).toHaveCount(1);
            // 59 letters and the cluster, then the ellipsis: the cluster is not cut
            expect(await button.textContent()).toBe("x".repeat(59) + cluster + "…");
            await button.click();
            await expect(page.locator("#cell-popover-value")).toHaveText(value);
            // 59 + 1 + 10 characters, as a reader counts them
            await expect(page.locator("#cell-popover-length")).toHaveText("70 characters");
        });
    }

    test("a value of exactly 60 characters shows whole, however many code points they are", async ({ page, app }) => {
        await app.open();
        // 60 characters, 119 code points: not a long cell
        const value = "\u{1F468}‍\u{1F469}‍\u{1F467}‍\u{1F466}".repeat(0) + "é".repeat(60);
        await app.query(`SELECT '${value}' AS v;`);
        await expect(app.table.locator("button.cell-more")).toHaveCount(0);
        expect(await app.table.locator("tbody td").textContent()).toBe(value);
    });
});

// ---- the focused long cell is not under the sticky header -------------------------------------

test.describe("scroll-padding under the sticky header", () => {
    test("Shift+Tab back through 40 rows of long cells: no step leaves the focused button under a header cell", async ({ page, app }) => {
        await app.open();
        await app.query(`WITH RECURSIVE n(i) AS (SELECT 1 UNION ALL SELECT i + 1 FROM n WHERE i < 40)
            SELECT i, printf('%.80c', 'x') AS long_value FROM n;`);
        const buttons = app.table.locator("button.cell-more");
        await expect(buttons).toHaveCount(40);
        // the box scrolls (40 rows are taller than it)
        expect(await app.result.evaluate((r) => r.scrollHeight > r.clientHeight + 100)).toBe(true);
        await buttons.last().focus();
        const hidden = [];
        for (let step = 39; step >= 1; step--) {
            await page.keyboard.press("Shift+Tab");
            const seen = await page.evaluate(() => {
                const focused = document.activeElement;
                if (!focused.matches("button.cell-more")) {
                    return { row: null, what: focused.outerHTML.slice(0, 60) };
                }
                const box = focused.getBoundingClientRect();
                const hit = document.elementFromPoint(box.left + box.width / 2, box.top + box.height / 2);
                const row = [...document.querySelectorAll("#result tbody tr")].indexOf(focused.closest("tr")) + 1;
                return { row, onTop: hit === focused || focused.contains(hit), under: hit ? hit.localName : null };
            });
            if (seen.row === null || !seen.onTop) {
                hidden.push(seen);
            }
            expect(seen.row, `step ${40 - step}`).toBe(step);
        }
        expect(hidden, "steps where the focused cell is not on top").toEqual([]);
    });
});

// ---- the long cell's target is the whole cell -------------------------------------------------

test.describe("the long cell's target", () => {
    const SQL = `SELECT 1 AS n, printf('%.80c', 'x') AS v UNION ALL SELECT 2, printf('%.80c', 'y');`;

    test("a click in the cell's padding, beside the text, opens the popover; the cell is at least 32 px high", async ({ page, app }) => {
        await app.open();
        await app.query(SQL);
        const cell = app.table.locator("tbody tr").first().locator("td").nth(1);
        const button = cell.locator("button.cell-more");
        const box = await cell.boundingBox();
        const text = await button.boundingBox();
        expect(box.height).toBeGreaterThanOrEqual(31.5);
        // to the right of the text, inside the cell's right padding, and at the top edge of the cell
        expect(box.x + box.width - text.x - text.width).toBeGreaterThan(20);
        await page.mouse.click(box.x + box.width - 10, box.y + box.height / 2);
        await expect(page.locator("#cell-popover")).toBeVisible();
        await expect(page.locator("#cell-popover-value")).toHaveText("x".repeat(80));
        await page.keyboard.press("Escape");
        await expect(page.locator("#cell-popover")).toBeHidden();
        await page.mouse.click(box.x + box.width / 2, box.y + 2);
        await expect(page.locator("#cell-popover")).toBeVisible();
    });

    test("on a touch screen the row of a long value is 44 px high, and a click in its padding opens the popover", async ({ browser, baseURL, browserName }) => {
        // Firefox has no mobile emulation (isMobile), and reports a coarse pointer with touch alone
        const context = await browser.newContext({
            baseURL,
            viewport: { width: 390, height: 844 },
            hasTouch: true,
            ...(browserName === "firefox" ? {} : { isMobile: true }),
        });
        try {
            const page = await context.newPage();
            await page.goto("./");
            await expect(page.locator("#results-pane")).toHaveAttribute("data-state", "empty");
            await page.locator('#editor .cm-content, #editor[contenteditable="true"]').fill(SQL);
            await page.locator("#execute").tap();
            await expect(page.locator("#results-pane")).toHaveAttribute("data-state", "result");
            expect(await page.evaluate(() => matchMedia("(pointer: coarse)").matches), "a coarse pointer").toBe(true);
            const cell = page.locator("#result tbody tr").first().locator("td").nth(1);
            const box = await cell.boundingBox();
            expect(box.height).toBeGreaterThanOrEqual(43.5);
            // in the cell's left padding (the table is wider than the phone: its right side is off screen)
            await page.mouse.click(box.x + 6, box.y + box.height / 2);
            await expect(page.locator("#cell-popover")).toBeVisible();
        } finally {
            await context.close();
        }
    });
});

// ---- the progress bar in forced colours -------------------------------------------------------

test.describe("the progress bar", () => {
    // the file is served in full but handed to the page half way, as a stream that stops, so the
    // bar and the size line show where the load is
    async function halfWay(page) {
        await page.addInitScript(() => {
            const original = window.fetch;
            window.fetch = async (input, init) => {
                const url = String(input instanceof Request ? input.url : input);
                if (!/northlight_retail\.db(\?.*)?$/.test(url)) {
                    return original(input, init);
                }
                const bytes = new Uint8Array(await (await original(input, init)).arrayBuffer());
                const half = bytes.slice(0, Math.floor(bytes.length / 2));
                return new Response(new ReadableStream({ start: (controller) => controller.enqueue(half) }), {
                    headers: { "content-length": String(bytes.length) },
                });
            };
        });
        await page.goto("./");
        await expect(page.locator(".results-loading-size")).toHaveText(/ of /);
    }

    // the colour of one pixel of a PNG, at a fraction of its width and height
    const pixel = (page, png, fx, fy) =>
        page.evaluate(
            async ({ bytes, fx, fy }) => {
                const bitmap = await createImageBitmap(new Blob([new Uint8Array(bytes)], { type: "image/png" }));
                const context = new OffscreenCanvas(bitmap.width, bitmap.height).getContext("2d");
                context.drawImage(bitmap, 0, 0);
                return [...context.getImageData(Math.floor(bitmap.width * fx), Math.floor(bitmap.height * fy), 1, 1).data];
            },
            { bytes: [...png], fx, fy }
        );

    test("shows in forced colours: an edge in CanvasText, a fill in Highlight on a Canvas track, the page's own colours kept off", async ({ page }) => {
        await page.emulateMedia({ forcedColors: "active" });
        await halfWay(page);
        const bar = page.locator("progress.results-progress");
        const value = Number(await bar.evaluate((b) => b.value));
        expect(value).toBeGreaterThan(0.3);
        expect(value).toBeLessThan(0.7);
        const look = await bar.evaluate((el) => {
            const probe = document.createElement("span");
            probe.style.cssText = "forced-color-adjust: none; color: CanvasText;";
            document.body.append(probe);
            const canvasText = getComputedStyle(probe).color;
            probe.remove();
            const style = getComputedStyle(el);
            return {
                forced: matchMedia("(forced-colors: active)").matches,
                adjust: style.forcedColorAdjust,
                border: [style.borderTopWidth, style.borderTopStyle, style.borderTopColor],
                canvasText,
            };
        });
        expect(look.forced).toBe(true);
        expect(look.adjust).toBe("none");
        expect(look.border).toEqual(["1px", "solid", look.canvasText]);
        // what is drawn: the left of the bar (the fill) is the colour Highlight draws, the right of
        // it (the track) the colour Canvas draws, and they are not the same
        const swatch = async (colour) => {
            const handle = await page.evaluateHandle((c) => {
                // on a Canvas ground, as the fill is on the track (Highlight is not always opaque)
                const box = document.createElement("div");
                box.style.cssText = "position: fixed; left: 0; top: 0; z-index: 9999; width: 40px; height: 40px; forced-color-adjust: none; background: Canvas;";
                const inner = document.createElement("div");
                inner.style.cssText = `width: 100%; height: 100%; forced-color-adjust: none; background: ${c};`;
                box.append(inner);
                document.body.append(box);
                return box;
            }, colour);
            const png = await handle.asElement().screenshot();
            await handle.evaluate((box) => box.remove());
            return pixel(page, png, 0.5, 0.5);
        };
        const highlight = await swatch("Highlight");
        const canvas = await swatch("Canvas");
        expect(highlight).not.toEqual(canvas);
        const png = await bar.screenshot();
        expect(await pixel(page, png, 0.2, 0.5), "the fill").toEqual(highlight);
        expect(await pixel(page, png, 0.9, 0.5), "the track").toEqual(canvas);
    });
});

// ---- long unbroken text wraps -----------------------------------------------------------------

test.describe("long unbroken text", () => {
    test("a 600-character file name loading via Open from URL: the title wraps, the page and the result do not scroll sideways", async ({ page, app }) => {
        const name = "a".repeat(597) + ".db";
        const held = gate();
        await page.route(new RegExp(`/datasets/a{597}\\.db$`), async (route) => {
            await held.promise;
            await route.fulfill({ path: SAMPLE_FILE, contentType: "application/octet-stream" });
        });
        await app.open();
        await openFromUrl(page, `datasets/${name}`);
        await expect(page.locator("#result .results-loading-title")).toHaveText(`Loading ${name}`);
        await expect(app.pane).toHaveAttribute("data-state", "loading");
        await expectNoSideways(page, ".results-loading-title");
        held.open();
        await expect(app.toast).toContainText("Opened aaaa");
    });

    test("a problem band with 400 letters in it, at 390 px, wraps (a database open, and none)", async ({ page, app }) => {
        await page.setViewportSize({ width: 390, height: 844 });
        await app.open();
        const name = "b".repeat(400);
        await openFromUrl(page, `datasets/${name}.db`);
        await expect(app.errorBand).toContainText(`Failed to load database from URL datasets/${name}.db`);
        await expect(page.locator(".results-problem .results-band")).toHaveCount(1);
        await expectNoSideways(page, ".results-problem .results-band-text");
        // with no database open the band is in #result
        await page.goto("about:blank");
        await page.goto(`./#datasets/${name}.db`);
        await expect(page.locator("#result .results-band-text")).toContainText(`Failed to load database from URL datasets/${name}.db`);
        await expectNoSideways(page, "#result .results-band-text");
    });

    test("a sample label of 400 letters, at 390 px, is cut at 60 and wraps", async ({ page, app }) => {
        await page.setViewportSize({ width: 390, height: 844 });
        const manifest = realManifest();
        manifest.datasets[0].samples = [{ label: "L".repeat(400), sql: "SELECT 1;" }];
        await routeManifest(page, manifest);
        await app.open();
        await expect(app.samples).toHaveCount(1);
        await expect(app.samples.locator(".results-sample-label")).toHaveText(`${"L".repeat(60)}…`);
        await expectNoSideways(page, ".results-sample");
        await expectNoSideways(page, ".results-sample-label");
    });

    test("the notice of an unknown database in the address, with a 64-character id, at 390 px, wraps", async ({ page, app }) => {
        await page.setViewportSize({ width: 390, height: 844 });
        const id = "c".repeat(64);
        await page.goto(`./?db=${id}`);
        await app.waitReady();
        await expect(app.emptyState.locator(".results-empty-notice")).toContainText(id);
        await expectNoSideways(page, ".results-empty-notice");
    });
});

// ---- "database", not "dataset" ----------------------------------------------------------------

test.describe("the wording of a set whose database is missing", () => {
    const REASON = 'It needs the database "missing-data", which is not available on this site.';
    const orphan = { id: "orphan", title: "Orphan practice", dataset: "missing-data", exercises: [{ id: "o1", title: "One", prompt: "p", model_query: "SELECT 1;" }] };

    test("in the address: the notice under the heading says 'database'", async ({ page, app }) => {
        await routeSet(page, "orphan", orphan);
        await page.goto("./?set=orphan");
        await app.waitReady();
        await expect(app.emptyState.locator(".results-empty-notice")).toContainText(REASON);
        await expect(app.emptyState.locator(".results-empty-notice")).not.toContainText("dataset");
    });

    test("from the picker: the band says 'database'", async ({ page, app }) => {
        await routeSet(page, "orphan", orphan);
        await routeListing(page, listingHtml([`${SET.id}.json`, "orphan.json"]));
        await app.open();
        await app.pickSet("Orphan practice");
        await expect(app.errorBand.locator(".results-band-text")).toHaveText(
            `The exercise set "orphan" could not be opened. ${REASON}`
        );
        await expect(app.errorBand).not.toContainText("dataset");
    });
});

// ---- the phone's summary line -----------------------------------------------------------------

test.describe("the phone's summary line", () => {
    test("is one row at 390 x 844: the text on the table's left edge, Download CSV at the right, 52 px high", async ({ page, app }) => {
        await page.setViewportSize({ width: 390, height: 844 });
        await app.open();
        await app.query("SELECT * FROM stores ORDER BY store_id;");
        await expect(app.csvButton).toBeVisible();
        const box = async (locator) => locator.boundingBox();
        const status = await box(app.status);
        const csv = await box(app.csvButton);
        const summary = await box(app.summary);
        const table = await box(app.table);
        // one row: the two centres are level, and the text ends before the button begins
        expect(Math.abs(status.y + status.height / 2 - (csv.y + csv.height / 2))).toBeLessThanOrEqual(2);
        expect(status.x + status.width).toBeLessThanOrEqual(csv.x + 1);
        // the text on the table's edge, the button at the right of the line
        expect(Math.abs(status.x - table.x)).toBeLessThanOrEqual(1);
        expect(summary.x + summary.width - (csv.x + csv.width)).toBeLessThanOrEqual(8);
        expect(csv.x).toBeGreaterThan(status.x + status.width - 1);
        expect(summary.height).toBeGreaterThanOrEqual(51.5);
        expect(summary.height).toBeLessThanOrEqual(52.5);
    });
});

// ---- found while writing the tests of this round ------------------------------------------------

test.describe("Ctrl+U in the editor", () => {
    // CodeMirror's history keymap binds Mod-U to "undo the last change or selection"; Ctrl/Cmd+U is
    // the page's "Open from URL…", so the key opened the dialog and also undid the student's last
    // edit (typed text vanished). The binding is left out now (js/lab/code-editor.js).
    test("opens Open from URL and leaves the text as it was, typed or filled", async ({ page, app }) => {
        await app.open();
        await app.editor.click();
        await page.keyboard.type("SELECT 2;");
        await page.keyboard.press("Control+u");
        await expect(page.locator("#open-url-dialog")).toBeVisible();
        await page.keyboard.press("Escape");
        await expect(page.locator("#open-url-dialog")).toBeHidden();
        expect(await editorValue(page)).toBe("SELECT 2;");
        await app.editor.fill("SELECT 3;");
        await app.editor.press("Control+u");
        await expect(page.locator("#open-url-dialog")).toBeVisible();
        await page.keyboard.press("Escape");
        expect(await editorValue(page)).toBe("SELECT 3;");
        // undo is still Ctrl+Z
        await app.editor.press("Control+z");
        expect(await editorValue(page)).not.toBe("SELECT 3;");
    });
});

test.describe("Alt+U in the editor", () => {
    // CodeMirror's history keymap pairs Mod-U (undo selection) with Alt-U (redo selection), which
    // redoes an undone edit; the page has no use for either, and Ctrl+U is "Open from URL…".
    test("changes nothing: after a typed edit and Ctrl+Z, Alt+U does not redo it", async ({ page, app }) => {
        await app.open();
        await app.editor.click();
        await page.keyboard.type("SELECT 2;");
        expect(await editorValue(page)).toBe("SELECT 2;");
        await page.keyboard.press("Control+z");
        const undone = await editorValue(page);
        expect(undone).not.toBe("SELECT 2;");
        await page.keyboard.press("Alt+u");
        expect(await editorValue(page), "Alt+U redid the edit").toBe(undone);
        await expect(page.locator("#open-url-dialog")).toBeHidden();
        // there was an edit to redo: the redo keys still bring it back
        await page.keyboard.press("Control+y");
        expect(await editorValue(page)).toBe("SELECT 2;");
    });
});

// ---- a load overtakes a run: "Running…" never comes back --------------------------------------

test.describe("'Running…' of a run that a load overtook", () => {
    test("is not part of the view a failed load puts back", async ({ page, app }) => {
        const held = gate();
        await holdSample(page, held, { fail: true });
        // no result yet: the pane has no summary line, so "Running…" goes over the top of #result,
        // which is what the view kept for a failed load is made of
        await app.open();
        await expect(app.pane).toHaveAttribute("data-state", "empty");
        await countRuns(page);
        await page.keyboard.press("Control+u");
        await page.locator("#open-url-input").fill("datasets/sample.db");
        // one task: Run is asked for, and the load begins before the frame Run waits for
        await page.evaluate(() => {
            window.app.ui.editor.value = "SELECT 1;";
            window.app.actions.executeCurrent();
            document.querySelector('#open-url-dialog button[type="submit"]').click();
        });
        await expect(app.pane).toHaveAttribute("data-state", "loading");
        await app.settle();
        expect(await runs(page), "a run finished").toBe(0);
        // the load fails: the view that was there comes back, with the band above it
        held.open();
        await expectBandAbove(page, app, "Failed to load database from");
        await expect(app.pane).toHaveAttribute("data-state", "empty");
        await expect(app.emptyState).toBeVisible();
        await expect(page.locator(".results-running"), "Running… is back").toHaveCount(0);
    });
});

// ---- the sticky header is as tall as it is ----------------------------------------------------

test.describe("a header taller than one line", () => {
    // an unaliased expression is named by its text, line breaks included, and the header keeps them
    const MULTILINE = `SELECT
  CASE
    WHEN unit_price > 100 THEN 'dear'
    ELSE 'cheap'
  END, product_name || printf('%050d', product_id) AS d FROM products`;

    test("the scroll padding is the header's height: Shift+Tab through the long cells keeps each one visible", async ({ page, app }) => {
        await app.open();
        await app.query(MULTILINE);
        const buttons = app.table.locator("button.cell-more");
        // (the products whose name and 50 digits are not more than 60 characters show whole)
        const count = await buttons.count();
        expect(count).toBeGreaterThan(10);
        // the header is more than one line high, and the box scrolls
        const head = await app.table.locator("thead").evaluate((h) => h.getBoundingClientRect().height);
        expect(head, "the header is one line").toBeGreaterThan(80);
        expect(await app.result.evaluate((r) => r.scrollHeight > r.clientHeight + 100)).toBe(true);
        // its height is what keeps the focused cell clear of it
        const padding = await app.result.evaluate((r) => ({ top: parseFloat(getComputedStyle(r).scrollPaddingTop), head: r.querySelector("thead").getBoundingClientRect().height }));
        expect(padding.top).toBeGreaterThanOrEqual(padding.head - 1);
        await buttons.last().focus();
        const hidden = [];
        const rowsOf = await buttons.evaluateAll((all) => all.map((b) => [...document.querySelectorAll("#result tbody tr")].indexOf(b.closest("tr")) + 1));
        for (let step = count - 2; step >= 0; step--) {
            await page.keyboard.press("Shift+Tab");
            const seen = await page.evaluate(() => {
                const focused = document.activeElement;
                if (!focused.matches("button.cell-more")) {
                    return { row: null, what: focused.outerHTML.slice(0, 60) };
                }
                const box = focused.getBoundingClientRect();
                const hit = document.elementFromPoint(box.left + box.width / 2, box.top + box.height / 2);
                const row = [...document.querySelectorAll("#result tbody tr")].indexOf(focused.closest("tr")) + 1;
                return { row, onTop: hit === focused || focused.contains(hit), under: hit ? hit.localName : null };
            });
            if (seen.row === null || !seen.onTop) {
                hidden.push(seen);
            }
            expect(seen.row, `step ${count - 1 - step}`).toBe(rowsOf[step]);
        }
        expect(hidden, "steps where the focused cell is under the header").toEqual([]);
    });
});

// ---- a Check whose run is dropped checks nothing ----------------------------------------------

test.describe("a Check whose run is dropped", () => {
    test("gives no verdict and marks nothing passed", async ({ page, app }) => {
        const held = gate();
        await holdSample(page, held);
        await app.openSet();
        // the answer is right: a Check that went ahead would pass it
        await app.editor.fill(modelQuery("e01"));
        await countRuns(page);
        await page.keyboard.press("Control+u");
        await page.locator("#open-url-input").fill("datasets/sample.db");
        // one task: Check is pressed (its run waits a frame), and a load begins in that frame
        await page.evaluate(() => {
            document.querySelector("#exercise-check").click();
            document.querySelector('#open-url-dialog button[type="submit"]').click();
        });
        await expect(app.pane).toHaveAttribute("data-state", "loading");
        // the Check is over (it is busy until it is): a verdict would be on screen by now
        await expect(app.checkButton).not.toHaveAttribute("aria-busy", "true");
        await app.settle();
        expect(await runs(page), "a run finished").toBe(0);
        await expect(app.feedback.locator(".verdict")).toHaveCount(0);
        await expect(app.feedback).toHaveText("");
        expect((await page.evaluate(() => localStorage.getItem("sqllab.progress.retail-basics"))) ?? "", "a pass was stored").not.toContain('"e01":true');
        await expect(app.pane).toHaveAttribute("data-state", "loading");
        held.open();
        await expect(app.toast).toHaveText("Opened sample.db");
    });
});

// ---- Ctrl/Cmd+U with the dialog already open --------------------------------------------------

test.describe("Ctrl+U while Open from URL is open", () => {
    test("keeps the address being typed", async ({ page, app }) => {
        await app.open();
        await page.keyboard.press("Control+u");
        const input = page.locator("#open-url-input");
        await expect(input).toBeVisible();
        await input.fill("https://example.test/partial");
        await input.press("Control+u");
        await expect(page.locator("#open-url-dialog")).toBeVisible();
        await expect(input).toHaveValue("https://example.test/partial");
        await expect(input).toBeFocused();
        // and from the other field of the dialog: the focus goes back to the address
        await page.locator("#open-url-dialog button", { hasText: "Cancel" }).focus();
        await page.keyboard.press("Control+u");
        await expect(input).toHaveValue("https://example.test/partial");
        await expect(input).toBeFocused();
    });
});

// ---- a set that cannot be opened while another load is on its way -----------------------------

test.describe("a set that cannot be opened while a load is on its way", () => {
    test("leaves the loading state in place with the band above it; the load then ends normally", async ({ page, app }) => {
        await withSampleDataset(page);
        await routeSet(page, "orphan", { id: "orphan", title: "Orphan practice", dataset: "missing-data", exercises: [{ id: "o1", title: "One", prompt: "p", model_query: "SELECT 1;" }] });
        await routeListing(page, listingHtml(["retail-basics.json", "orphan.json"]));
        await app.open();
        await showStores(app);
        const held = gate();
        await holdSample(page, held);
        await app.pickDatabaseById("sample");
        await expect(app.pane).toHaveAttribute("data-state", "loading");
        await app.pickSet("Orphan practice");
        await expectBandAbove(page, app, 'The exercise set "orphan" could not be opened');
        // the load is still on its way: its state is what the pane shows (not the table it left)
        await expect(app.pane).toHaveAttribute("data-state", "loading");
        await expect(page.locator("#result .results-loading-title")).toHaveText(`Loading ${SAMPLE_ENTRY.name}`);
        await expect(page.locator("#result progress.results-progress")).toBeVisible();
        await expect(app.table).toHaveCount(0);
        await expect(app.summary).toBeHidden();
        // it ends normally: the database opens, the band goes
        held.open();
        await expect(app.toast).toHaveText(`Opened ${SAMPLE_ENTRY.name}`);
        await expect(app.pane).toHaveAttribute("data-state", "empty");
        await expect(app.databaseLabel).toHaveText(SAMPLE_ENTRY.name);
        await expectNoBand(page, app);
    });
});

// ---- the phone's summary line never wraps the button ------------------------------------------

test.describe("the phone's summary line keeps Download CSV in place", () => {
    const rows = (n) => `WITH RECURSIVE n(i) AS (SELECT 1 UNION ALL SELECT i + 1 FROM n WHERE i < ${n}) SELECT i FROM n;`;
    const CASES = [
        { width: 360, height: 740, rows: 906, text: /^Showing 500 of 906 rows in \d+ ms$/ },
        { width: 375, height: 667, rows: 906, text: /^Showing 500 of 906 rows in \d+ ms$/ },
        { width: 390, height: 844, rows: 100000, text: /^Showing 500 of 100,000 rows in \d+ ms$/ },
    ];
    for (const c of CASES) {
        test(`at ${c.width} px, "Showing 500 of ${c.rows.toLocaleString("en-US")} rows": the text wraps inside its own box, the button stays at the right of it`, async ({ page, app }) => {
            await page.setViewportSize({ width: c.width, height: c.height });
            await app.open();
            await app.query(rows(c.rows));
            await expect(app.status).toHaveText(c.text);
            await expect(app.csvButton).toBeVisible();
            const status = await app.status.boundingBox();
            const csv = await app.csvButton.boundingBox();
            const summary = await app.summary.boundingBox();
            // the button is beside the text: after its box, and level with it (a button on a row of
            // its own is below the text's box)
            expect(csv.x, "the button is not to the right of the text").toBeGreaterThanOrEqual(status.x + status.width - 1);
            const middle = csv.y + csv.height / 2;
            expect(middle, "the button is not level with the text").toBeGreaterThanOrEqual(status.y);
            expect(middle, "the button is not level with the text").toBeLessThanOrEqual(status.y + status.height);
            // inside the line, at its right
            expect(csv.y).toBeGreaterThanOrEqual(summary.y - 1);
            expect(csv.y + csv.height).toBeLessThanOrEqual(summary.y + summary.height + 1);
            expect(summary.x + summary.width - (csv.x + csv.width)).toBeLessThanOrEqual(8);
            expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(0);
        });
    }
});

// ---- the cut also stops at 960 UTF-16 units ---------------------------------------------------

test.describe("a value of one huge grapheme cluster", () => {
    // MAX_SHOWN_UNITS = 16 * CELL_MAX_CHARS: the cluster is one character, but thousands of units
    test("'a' and 100,000 combining accents: a .cell-more button that shows 960 units", async ({ page, app }) => {
        await app.open();
        await app.query(`SELECT 'a' || replace(hex(zeroblob(50000)), '0', char(769)) AS v;`);
        const button = app.table.locator("button.cell-more");
        await expect(button).toHaveCount(1);
        expect(await button.textContent()).toBe(`a${"́".repeat(959)}…`);
        await button.click();
        await expect(page.locator("#cell-popover-length")).toHaveText("1 characters");
    });

    test("20,000 emoji joined by U+200D: a .cell-more button, cut between no two halves of a pair", async ({ page, app }) => {
        await app.open();
        // U+2764 first, so that 960 units end inside the pair (the 3-unit groups are ZWJ, high, low)
        await app.query(`SELECT char(10084) || replace(hex(zeroblob(10000)), '0', char(8205, 128512)) AS v;`);
        const button = app.table.locator("button.cell-more");
        await expect(button).toHaveCount(1);
        const shown = (await button.textContent()).slice(0, -1);
        expect(shown.length).toBeLessThanOrEqual(960);
        expect(shown.length).toBeGreaterThan(900);
        const last = shown.charCodeAt(shown.length - 1);
        expect(last >= 0xd800 && last <= 0xdbff, "the cut left half of a pair").toBe(false);
        expect(shown).toBe("❤" + "‍\u{1F600}".repeat(319) + "‍");
    });
});

// ---- the popover lets go of its value ---------------------------------------------------------

test.describe("the long-cell popover after it closes", () => {
    test("is emptied when it closes (the value) and when a new state replaces the table (title, length, value)", async ({ page, app }) => {
        await app.open();
        await app.query(`SELECT printf('%.100c', 'x') AS v;`);
        const popover = page.locator("#cell-popover");
        const parts = {
            title: page.locator("#cell-popover-title"),
            length: page.locator("#cell-popover-length"),
            value: page.locator("#cell-popover-value"),
        };
        await app.table.locator("button.cell-more").click();
        await expect(popover).toBeVisible();
        await expect(parts.value).toHaveText("x".repeat(100));
        // closed: the value is let go
        await page.keyboard.press("Escape");
        await expect(popover).toBeHidden();
        await expect(parts.value).toHaveText("");
        // a new state: the rest of it goes too
        await app.query("SELECT 1 AS n;");
        await expect(parts.title).toHaveText("");
        await expect(parts.length).toHaveText("");
        await expect(parts.value).toHaveText("");
        // and a popover that is open when the table is replaced closes and lets go of all of it
        await app.query(`SELECT printf('%.100c', 'y') AS w;`);
        await app.table.locator("button.cell-more").click();
        await expect(parts.value).toHaveText("y".repeat(100));
        await page.evaluate(() => {
            window.app.ui.editor.value = "SELECT 2 AS n;";
            window.app.actions.executeCurrent();
        });
        await app.settle();
        await expect(popover).toBeHidden();
        await expect(parts.title).toHaveText("");
        await expect(parts.length).toHaveText("");
        await expect(parts.value).toHaveText("");
    });
});

// ---- a sample's label is cut ------------------------------------------------------------------

test.describe("a sample's label", () => {
    test("is cut at 60 characters with an ellipsis: a 3,000-character label gives a short button and name", async ({ page, app }) => {
        const manifest = realManifest();
        manifest.datasets[0].samples = [
            { label: "L".repeat(3000), sql: "SELECT 1;" },
            { label: "M".repeat(60), sql: "SELECT 2;" },
            { label: "N".repeat(61), sql: "SELECT 3;" },
        ];
        await routeManifest(page, manifest);
        await app.open();
        await expect(app.samples).toHaveCount(3);
        const label = (n) => app.samples.nth(n).locator(".results-sample-label");
        await expect(label(0)).toHaveText(`${"L".repeat(60)}…`);
        // 60 characters is whole; 61 is cut
        await expect(label(1)).toHaveText("M".repeat(60));
        await expect(label(2)).toHaveText(`${"N".repeat(60)}…`);
        // the name is what the button shows
        const snapshot = await app.samples.first().ariaSnapshot();
        expect(/^- button "(.*)"$/s.exec(snapshot.trim())[1]).toBe(`${"L".repeat(60)}… SELECT 1;`);
        // a short button
        const box = await app.samples.first().boundingBox();
        expect(box.height).toBeLessThan(120);
        // choosing it still fills the editor with its SQL
        await app.samples.first().click();
        expect(await editorValue(page)).toBe("SELECT 1;");
    });
});

// ---- Caps Lock --------------------------------------------------------------------------------

test.describe("Ctrl/Cmd+U and O with Caps Lock on", () => {
    // the key arrives as "U" and "O" (no Shift): the page's shortcuts too; with Shift they are not
    async function spyOnFileInput(page) {
        await page.evaluate(() => {
            window.__chooser = 0;
            window.app.ui.fileInput.click = () => window.__chooser++;
        });
    }
    const keysSeen = (page) =>
        page.evaluate(() => {
            window.__keys = [];
            document.addEventListener("keydown", (e) => window.__keys.push({ key: e.key, shift: e.shiftKey, ctrl: e.ctrlKey, meta: e.metaKey, prevented: e.defaultPrevented }));
        });

    for (const modifier of ["Control", "Meta"]) {
        test(`${modifier}+U (key "U", no Shift) opens Open from URL`, async ({ page, app }) => {
            await app.open();
            await keysSeen(page);
            await page.keyboard.press(`${modifier}+U`);
            await expect(page.locator("#open-url-dialog")).toBeVisible();
            expect((await page.evaluate(() => window.__keys)).at(-1)).toMatchObject({ key: "U", shift: false });
        });

        test(`${modifier}+O (key "O", no Shift) asks for a file`, async ({ page, app }) => {
            await app.open();
            await spyOnFileInput(page);
            await keysSeen(page);
            await page.keyboard.press(`${modifier}+O`);
            expect(await page.evaluate(() => window.__chooser)).toBe(1);
            expect((await page.evaluate(() => window.__keys)).at(-1)).toMatchObject({ key: "O", shift: false });
        });
    }

    test("Ctrl+Shift+U and Ctrl+Shift+O are not the page's shortcuts", async ({ page, app }) => {
        await app.open();
        await spyOnFileInput(page);
        await keysSeen(page);
        await page.keyboard.press("Control+Shift+U");
        await page.keyboard.press("Control+Shift+O");
        const seen = await page.evaluate(() => window.__keys.filter((k) => k.ctrl && (k.key === "U" || k.key === "O")));
        expect(seen.map((k) => [k.key, k.shift])).toEqual([["U", true], ["O", true]]);
        expect(await page.evaluate(() => document.getElementById("open-url-dialog").open)).toBe(false);
        expect(await page.evaluate(() => window.__chooser)).toBe(0);
    });
});

// ---- a Check that returns no result set is quiet too ------------------------------------------

test.describe("a Check whose run has no result set", () => {
    test("CREATE TABLE zz(x); is shown ('Done'), not said; the verdict is what is said", async ({ page, app }) => {
        await app.openSet();
        await recordSaid(page);
        await app.editor.fill("CREATE TABLE zz(x);");
        await app.checkButton.click();
        await expect(app.feedback.locator(".verdict--fail")).toBeVisible();
        await app.settle();
        await expect(app.pane).toHaveAttribute("data-state", "done");
        await expect(app.status).toHaveText(/^Done in \d+ ms$/);
        // longer than the gap between emptying the live region and filling it
        await page.waitForTimeout(300);
        // the verdict alone, in words (from Phase 5 the results pane's live region says it), and no
        // "Done." of the run
        const verdict = "Not quite. expected 2 columns, got 0.";
        expect(await said(page), "what #results-announce said").toEqual([verdict]);
        await expect(app.announcer).toHaveText(verdict);
        // a plain Run of the same kind is said (so the check above can fail)
        await app.run("CREATE TABLE zz2(x);");
        await expect.poll(() => said(page)).toEqual([verdict, "Done."]);
    });
});

// ---- the evidence dialog whose log is emptied while it is open --------------------------------

test.describe("the evidence dialog whose run log is emptied while it is open", () => {
    test("closes on Export and says there is nothing to export, as a note", async ({ page, app }) => {
        await app.open();
        await app.run("SELECT 1;");
        await app.openEvidence();
        await expect(app.evidenceDialog).toBeVisible();
        // the log goes (another tab cleared it): the page's own copy is the storage
        const cleared = await page.evaluate(() => {
            const keys = Object.keys(localStorage).filter((k) => k.startsWith("sqllab.log."));
            keys.forEach((k) => localStorage.removeItem(k));
            return keys.length;
        });
        expect(cleared).toBe(1);
        let saved = 0;
        page.on("download", () => saved++);
        await app.recordToasts();
        await app.evidenceInput.fill("U2034567");
        await app.evidenceDialog.locator("button[type=submit]").click();
        await expect(app.evidenceDialog).toBeHidden();
        await expect(app.toast).toHaveText("Nothing to export yet. Run a query first, then export your evidence.");
        await expect(page.locator("#toast-region .toast--note use")).toHaveAttribute("href", "#icon-info");
        await expect(page.locator("#toast-region .toast--problem")).toHaveCount(0);
        await expect(app.exportMenuButton).toBeFocused();
        await app.expectToasts(["Nothing to export yet. Run a query first, then export your evidence."]);
        expect(saved, "a file was saved").toBe(0);
    });
});
