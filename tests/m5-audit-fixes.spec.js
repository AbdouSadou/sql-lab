const fs = require("node:fs");
const path = require("node:path");
const { test, expect, evidenceFile, App } = require("./helpers");

// M5 audit fixes: one test per behaviour changed after the independent audits. The statement
// line (comments, trailing comment) is in m4-runner and m5-results, the escaped header lines
// in m5-evidence-format; here: the run log under load and in a full storage, the notice, the
// verify page's verdict in view, colour contrast, the history time zone, the editor hint, the
// editor toolbar and the top bar at 768px, and what the About page and README tell students and
// markers.

const ROOT = path.join(__dirname, "..");
const SET = JSON.parse(fs.readFileSync(path.join(ROOT, "exercises", "retail-basics.json"), "utf8"));
const read = (file) => fs.readFileSync(path.join(ROOT, file), "utf8");
const notice = (page) => page.locator("#storage-notice");

// a quota that refuses any value over `limit` characters for keys that start with `prefix`
const limitStorage = (page, prefix, limit) =>
    page.addInitScript(
        ([prefix, limit]) => {
            window.__quota = true;
            const set = Storage.prototype.setItem;
            Storage.prototype.setItem = function (key, value) {
                if (window.__quota && String(key).startsWith(prefix) && String(value).length > limit) {
                    throw new DOMException("full", "QuotaExceededError");
                }
                return set.call(this, key, value);
            };
        },
        [prefix, limit]
    );

test.describe("the run log under load", () => {
    // Leaving the page the moment the result is on screen must not lose the Run. The wait for
    // the summary line ("1 row in 3 ms") polls every animation frame, so the page is left as early as a test can.
    const resultShown = (page) =>
        page.waitForFunction(() => /\d+ rows? in \d+ ms/.test(document.querySelector("#status").textContent), null, {
            polling: "raf",
        });

    test("a Run followed at once by leaving the page keeps its entry, by navigation and by reload", async ({ page, app }) => {
        const expected = [];
        for (let round = 0; round < 8; round++) {
            await app.open();
            const sql = `select ${round} as round`;
            await app.run(sql);
            await resultShown(page);
            expected.push(sql);
            // alternate: leave by navigation, leave by reload
            if (round % 2 === 0) {
                await page.goto("about.html");
            } else {
                await page.reload();
            }
            expect((await app.readLog("northlight")).map((e) => e.sql)).toEqual(expected);
        }
        // and the History tab of the page that comes back lists all of them
        await app.open();
        await app.openHistory();
        await expect(app.historyEntries).toHaveCount(expected.length);
    });

    test("an entry is stored, in the History tab and in the export as soon as appendLog returns", async ({ page, app }) => {
        await app.open();
        const seen = await page.evaluate(async () => {
            const { appendLog, readLog } = await import("./js/lab/run-log.js");
            const stored = () => {
                const text = localStorage.getItem("sqllab.log.northlight");
                return text === null ? null : JSON.parse(text).entries.map((e) => e.sql);
            };
            const before = { read: readLog("northlight").length, stored: stored() };
            appendLog("northlight", { t: "2026-11-09T10:00:00Z", sql: "select 1", rows: 1 });
            const first = stored();
            appendLog("northlight", { t: "2026-11-09T10:00:01Z", sql: "select 2", rows: 1 });
            return { before, first, now: stored(), read: readLog("northlight").map((e) => e.sql) };
        });
        expect(seen).toEqual({
            before: { read: 0, stored: null },
            first: ["select 1"],
            now: ["select 1", "select 2"],
            read: ["select 1", "select 2"],
        });
        expect((await app.readLog("northlight")).map((e) => e.sql)).toEqual(["select 1", "select 2"]);
        await app.openHistory();
        await expect(app.historyEntries).toHaveCount(2);
    });

    // What is promised for two tabs: tabs that run at human spacing lose nothing. Two tabs that
    // write within the same few milliseconds can still overwrite each other (reading and writing
    // one localStorage key is not atomic, and a Web Lock is not used, see run-log.js).
    test("two tabs that run 25 ms apart lose no entry, and each History tab shows the other tab's entries", async ({ context, page, app }) => {
        await app.open();
        const other = await context.newPage();
        const otherApp = new App(other);
        await otherApp.open();
        const N = 12;
        const STEP = 50; // each tab appends every 50 ms, tab B 25 ms after tab A
        const start = Date.now() + 500;
        const append = ([tag, n, at, step]) =>
            import("./js/lab/run-log.js").then(async ({ appendLog }) => {
                for (let i = 0; i < n; i++) {
                    const wait = at + i * step - Date.now();
                    if (wait > 0) {
                        await new Promise((resolve) => setTimeout(resolve, wait));
                    }
                    appendLog("northlight", { t: "2026-11-09T10:00:00Z", sql: `select '${tag}${i}'`, rows: 1 });
                }
            });
        await Promise.all([
            page.evaluate(append, ["A", N, start, STEP]),
            other.evaluate(append, ["B", N, start + STEP / 2, STEP]),
        ]);
        const sqls = (await app.readLog("northlight")).map((e) => e.sql);
        expect(sqls).toHaveLength(2 * N);
        for (const tag of ["A", "B"]) {
            const own = sqls.filter((s) => s.startsWith(`select '${tag}`));
            expect(own).toEqual(Array.from({ length: N }, (_, i) => `select '${tag}${i}'`));
        }
        // a later read in either tab (opening the History tab) shows the other tab's entries too
        for (const tab of [app, otherApp]) {
            await tab.openHistory();
            await expect(tab.historyEntries).toHaveCount(2 * N);
            const texts = await tab.historyEntries.allInnerTexts();
            for (const tag of ["A", "B"]) {
                expect(texts.filter((t) => t.includes(`select '${tag}`))).toHaveLength(N);
            }
        }
        await other.close();
    });
});

test.describe("a full storage", () => {
    const pad = (c) => `SELECT '${c.repeat(900)}';`;

    test("the History tab and the export keep every entry while the page is open, and a line says storage is full", async ({ page, app }) => {
        await limitStorage(page, "sqllab.log.", 3500);
        await app.open();
        await expect(notice(page)).toBeHidden();
        await app.seedLog("northlight", [
            { t: "2026-11-09T10:00:01Z", sql: pad("a"), rows: 1 },
            { t: "2026-11-09T10:00:02Z", sql: pad("b"), rows: 1 },
            { t: "2026-11-09T10:00:03Z", sql: pad("c"), rows: 1 },
        ]);
        await app.query(pad("d"));
        // only the newest fit in storage ...
        expect((await app.readLog("northlight")).map((e) => e.sql)).toEqual([pad("b"), pad("c"), pad("d")]);
        // ... but this page still has all four, in the History tab and in the export
        await app.openHistory();
        await expect(app.historyEntries).toHaveCount(4);
        const file = await app.exportEvidence("U2034567");
        expect(file.text.match(/^\[\d+\] /gm)).toHaveLength(4);
        expect(file.text).toContain(pad("a"));
        // the student is told, in text that is visible and announced
        await expect(notice(page)).toBeVisible();
        await expect(notice(page)).toContainText("no room left to keep your query history");
        await expect(notice(page)).toHaveAttribute("role", "status");
        // and the line goes when storage takes everything again
        await page.evaluate(() => (window.__quota = false));
        await app.query("select 5 as e");
        await expect(notice(page)).toBeHidden();
        const stored = (await app.readLog("northlight")).map((e) => e.sql);
        expect(stored).toHaveLength(5);
        expect(stored[0]).toBe(pad("a"));
        // the next Run does not bring it back
        await app.query("select 6 as f");
        await expect(notice(page)).toBeHidden();
    });

    test("blocked storage says so too, and the queries still work", async ({ page, app }) => {
        await page.addInitScript(() => {
            const fail = () => {
                throw new DOMException("blocked", "SecurityError");
            };
            Object.defineProperty(window, "localStorage", { get: fail, configurable: true });
            Object.defineProperty(window, "sessionStorage", { get: fail, configurable: true });
        });
        await app.open();
        await app.query("select 1 as a");
        await expect(notice(page)).toBeVisible();
        await expect(app.table).toBeVisible();
    });

    test("a pass that cannot be stored shows, counts for the session, and says so", async ({ page, app }) => {
        await limitStorage(page, "sqllab.progress.", 0);
        await app.openSet();
        await expect(notice(page)).toBeHidden();
        await app.exerciseButton(1).click();
        await app.editor.fill(SET.exercises[0].model_query);
        await app.checkButton.click();
        await expect(app.feedback).toContainText("Correct.");
        await expect(app.progress).toHaveText("1 of 10 complete");
        await expect(notice(page)).toBeVisible();
        await expect(notice(page)).toContainText("exercise progress");
        await expect(notice(page)).not.toContainText("query history");
        // nothing was stored, and a reload shows what a reload shows
        expect(await page.evaluate(() => localStorage.getItem("sqllab.progress.retail-basics"))).toBeNull();
    });

    test("with room, neither a Run nor a Check shows the line", async ({ page, app }) => {
        await app.openSet();
        await app.exerciseButton(1).click();
        await app.editor.fill(SET.exercises[0].model_query);
        await app.checkButton.click();
        await expect(app.feedback).toContainText("Correct.");
        await expect(notice(page)).toBeHidden();
        await expect(page.locator("#storage-notice")).toHaveCount(1);
    });
});

test.describe("the history times", () => {
    test("every time is followed by UTC on screen", async ({ app }) => {
        await app.open();
        await app.query("select 1 as a");
        await app.run("select nope");
        await expect(app.errorBand).toContainText("no such column");
        await app.openHistory();
        await expect(app.historyEntries).toHaveCount(2);
        // each entry shows its SQL, then its time (the part under test), then its outcome
        const texts = await app.historyEntries.locator(".run-history-time").allInnerTexts();
        expect(texts).toHaveLength(2);
        for (const text of texts) {
            expect(text).toMatch(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2} UTC\b/);
        }
    });
});

test.describe("the evidence file, from run to verdict", () => {
    test("SQL with header-like lines in the last entry still verifies with the right count", async ({ context, page, app }) => {
        await app.open();
        await app.query("select 1 as a");
        await app.query("select 2 as b");
        await app.query(
            "select 3 as c /* x\n\n[4] 2026-11-09T13:58:12Z · 1 row\nselect 4\n\n[5] 2026-11-09T13:58:12Z · 1 row\nselect 5 */"
        );
        const file = await app.exportEvidence("U2034567");
        expect(file.text.match(/^\[\d+\] /gm)).toHaveLength(3);
        expect(file.text).toContain("\n\\[4] 2026-11-09T13:58:12Z · 1 row\n");
        const verify = await context.newPage();
        await verify.goto("verify.html");
        await verify.locator("#evidence-file").setInputFiles({ name: file.name, mimeType: "text/plain", buffer: file.buffer });
        const result = verify.locator("#verify-result");
        await expect(result).toContainText("VALID");
        await expect(result.locator("dd").nth(1)).toHaveText("3");
        await verify.close();
    });
});

test.describe("verify.html shows the verdict", () => {
    const GOOD = evidenceFile({ entries: [{ t: "2026-11-09T13:58:12Z", outcome: "12 rows", sql: "SELECT 1;" }] });
    const BAD = GOOD.replace("SELECT 1;", "SELECT 2;");
    const inView = (page) =>
        page.locator("#verify-result").evaluate((el) => {
            const box = el.getBoundingClientRect();
            return box.top >= 0 && box.bottom <= window.innerHeight;
        });

    for (const [width, height] of [
        [1366, 650],
        [1280, 800],
        [390, 700],
    ]) {
        test(`at ${width}x${height} the verdict is on screen after choosing a file, whether VALID or EDITED`, async ({ page }) => {
            await page.setViewportSize({ width, height });
            await page.goto("verify.html");
            const choose = (text) => page.locator("#evidence-file").setInputFiles({ name: "e.txt", mimeType: "text/plain", buffer: Buffer.from(text) });
            await choose(GOOD);
            await expect(page.locator("#verify-result")).toContainText("VALID");
            await expect.poll(() => inView(page)).toBe(true);
            await page.evaluate(() => window.scrollTo(0, 0));
            await choose(BAD);
            await expect(page.locator("#verify-result")).toContainText("EDITED");
            await expect.poll(() => inView(page)).toBe(true);
        });
    }

    test("the Verify button brings the verdict into view too", async ({ page }) => {
        await page.setViewportSize({ width: 1280, height: 500 });
        await page.goto("verify.html");
        await page.locator("#evidence-text").fill(GOOD);
        await page.locator("#verify-button").click();
        await expect(page.locator("#verify-result")).toContainText("VALID");
        await expect.poll(() => inView(page)).toBe(true);
    });
});

// ---- colour --------------------------------------------------------------------------------

const luminance = ([r, g, b]) => {
    const f = (c) => ((c /= 255) <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
    return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
};
const contrast = (a, b) => {
    const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
    return (hi + 0.05) / (lo + 0.05);
};
const rgb = (text) => text.match(/\d+(\.\d+)?/g).slice(0, 3).map(Number);

test.describe("text colours reach 4.5:1", () => {
    for (const scheme of ["light", "dark"]) {
        test(`in the ${scheme} scheme: the evidence error and the buttons of the top bar, the History tab, the results and the Export menu`, async ({ page, app }) => {
            await page.emulateMedia({ colorScheme: scheme });
            await app.open();
            await app.query("select 1 as a");
            // the text colour of the element and the first opaque background behind it (the surface it sits on)
            const colours = (selector, surface) =>
                page.locator(selector).first().evaluate((el, surfaceSelector) => {
                    const opaque = (colour) => !/^rgba\(.*, 0\)$|^transparent$/.test(colour);
                    let behind = surfaceSelector ? document.querySelector(surfaceSelector) : el;
                    while (behind && !opaque(getComputedStyle(behind).backgroundColor)) {
                        behind = behind.parentElement;
                    }
                    return { text: getComputedStyle(el).color, surface: getComputedStyle(behind ?? document.body).backgroundColor };
                }, surface);
            const expectContrast = async (selector, surface) => {
                const { text, surface: ground } = await colours(selector, surface);
                expect(contrast(rgb(text), rgb(ground)), `${selector} text ${text} on ${ground}`).toBeGreaterThanOrEqual(4.5);
            };
            // the buttons and the tab that sit on the page
            for (const selector of ["#tab-history", "#download-csv", "#copy-link"]) {
                await expectContrast(selector);
            }
            // the Export menu's items sit on the menu
            await app.openExportMenu();
            for (const selector of ["#export-evidence", "#export-db"]) {
                await expectContrast(selector);
            }
            // the error in the dialog sits on the dialog
            await app.evidenceButton.click();
            await app.evidenceInput.fill("bad number");
            await app.evidenceDialog.locator("button[type=submit]").click();
            await expect(app.evidenceError).toBeVisible();
            await expectContrast("#evidence-error", "#evidence-dialog");
        });
    }

    test("white on the blue of the filled buttons is 4.5:1 in the light scheme", async ({ page, app }) => {
        await page.emulateMedia({ colorScheme: "light" });
        await app.open();
        // the fill is the --accent token and the text on it --on-accent (css/tokens.css)
        const [fill, text] = await page.evaluate(() => {
            const probe = document.createElement("span");
            probe.style.background = "var(--accent)";
            probe.style.color = "var(--on-accent)";
            document.body.append(probe);
            const style = getComputedStyle(probe);
            const colours = [style.backgroundColor, style.color];
            probe.remove();
            return colours;
        });
        const channels = (rgb) => rgb.match(/\d+/g).slice(0, 3).map(Number);
        expect(channels(text)).toEqual([255, 255, 255]);
        expect(contrast(channels(text), channels(fill))).toBeGreaterThanOrEqual(4.5);
    });
});

// ---- layout at 768 ---------------------------------------------------------------------------

// The editor hint is no longer a line under the editor (UI plan, section 2, Phase 3): the Help
// popover states it (Tab indents; Esc then Tab leaves) and the editor keeps the sentence as its
// description, in a visually hidden element. What these tests pinned for the line now holds for
// Help's statement: whole, never cut, wrapping rather than overflowing on a narrow window.
test.describe("the editor hint, the editor toolbar and the top bar", () => {
    for (const url of ["./", "./?set=retail-basics"]) {
        for (const width of [768, 1024, 1280]) {
            test(`${url} at ${width}px: the hint is whole, the editor toolbar stays on top of the editor, the top bar is one row`, async ({ page, app }) => {
                await page.setViewportSize({ width, height: 900 });
                await app.open(url);
                await app.editor.focus();
                await page.locator("#help-button").click();
                await expect(page.locator("#help-popover")).toBeVisible();
                const m = await page.evaluate(() => {
                    const rect = (s) => document.querySelector(s).getBoundingClientRect();
                    const hint = document.querySelector("#editor-hint");
                    // Help's two rows on the editor's keys: Tab indents, Esc then Tab leaves
                    const rows = [...document.querySelectorAll("#help-popover .help-keys dd")].filter((dd) => /editor/.test(dd.textContent));
                    const whole = rows.map((dd) => {
                        const style = getComputedStyle(dd);
                        const range = document.createRange();
                        range.selectNodeContents(dd);
                        const text = range.getBoundingClientRect();
                        const box = dd.getBoundingClientRect();
                        return {
                            overflowX: dd.scrollWidth > dd.clientWidth + 1,
                            overflowY: dd.scrollHeight > dd.clientHeight + 1,
                            ellipsis: style.textOverflow === "ellipsis",
                            textInside: text.left >= box.left - 1 && text.right <= box.right + 1 && text.bottom <= box.bottom + 1,
                        };
                    });
                    // the vertical centre of every item of the top bar
                    const items = ["#reset", "#database-button", "#copy-link", "#export-button", "#theme-button", "#help-button"].map((s) => document.querySelector(s));
                    const centres = items.map((c) => c.getBoundingClientRect().top + c.getBoundingClientRect().height / 2);
                    return {
                        hint: hint.textContent.trim(),
                        rows: rows.map((dd) => dd.textContent.trim()),
                        overflowX: whole.some((w) => w.overflowX),
                        overflowY: whole.some((w) => w.overflowY),
                        ellipsis: whole.some((w) => w.ellipsis),
                        textInside: whole.every((w) => w.textInside),
                        barBottom: rect("#editor-toolbar").bottom,
                        paneTop: rect("#editor-pane").top,
                        editorTop: rect("#editor").top,
                        hintTop: rect("#editor-hint").top,
                        topbarItems: items.length,
                        topbarSpread: Math.max(...centres) - Math.min(...centres),
                    };
                });
                expect(m.hint).toBe("Press Tab to indent. To leave the editor, press Escape, then Tab or Shift+Tab.");
                expect(m.rows).toEqual(["Comment or uncomment the line, in the editor", "Suggest table, column and function names, in the editor", "Indent, in the editor", "Leave the editor (Shift Tab to go back)"]);
                expect(m.overflowX).toBe(false);
                expect(m.overflowY).toBe(false);
                expect(m.ellipsis).toBe(false);
                expect(m.textInside).toBe(true);
                // the toolbar sits on top of the editor, never over it and never over the hint (now
                // the editor's visually hidden description: a 1 px box at the top edge of the editor
                // pane, pulled 1 px up by its negative margin, so the tolerance is exactly that pixel)
                expect(Math.abs(m.barBottom - m.paneTop)).toBeLessThanOrEqual(2);
                expect(m.barBottom).toBeLessThanOrEqual(m.editorTop + 1);
                expect(m.barBottom).toBeLessThanOrEqual(m.hintTop + 1);
                // every top bar item (brand, database switcher, Copy link, Export, Theme, Help) is on one row
                expect(m.topbarItems).toBe(6);
                expect(m.topbarSpread).toBeLessThanOrEqual(4);
            });
        }
    }

    test("the hint wraps rather than being cut when the window is narrow", async ({ page, app }) => {
        await page.setViewportSize({ width: 700, height: 900 });
        await app.open();
        await app.editor.focus();
        await page.locator("#help-button").click();
        // Help's statement of the way out: its row wraps inside the popover rather than being cut
        const hint = page.locator("#help-popover .help-keys dd").filter({ hasText: "Leave the editor" });
        await expect(hint).toBeVisible();
        expect(await hint.evaluate((el) => el.getBoundingClientRect().height)).toBeGreaterThan(30);
        expect(await hint.evaluate((el) => el.scrollWidth <= el.clientWidth + 1)).toBe(true);
        const popover = await page.locator("#help-popover").boundingBox();
        const row = await hint.boundingBox();
        expect(row.x + row.width).toBeLessThanOrEqual(popover.x + popover.width + 1);
        // the toolbar is still on top of the editor
        const gap = await page.evaluate(() => document.querySelector("#editor-pane").getBoundingClientRect().top - document.querySelector("#editor-toolbar").getBoundingClientRect().bottom);
        expect(Math.abs(gap)).toBeLessThanOrEqual(2);
    });
});

// ---- what the pages say --------------------------------------------------------------------

test.describe("the About page and the README", () => {
    const about = () => read("about.html").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");
    const readme = () => read("README.md").replace(/\s+/g, " ");

    test("students are told to export before logging off a shared PC, and once for each dataset", () => {
        for (const text of [about(), readme()]) {
            expect(text).toMatch(/shared (computer|PC)|lab PC/i);
            expect(text).toMatch(/before (you|they) log off/i);
            expect(text).toMatch(/once for each dataset/i);
            expect(text).toMatch(/private window/i);
        }
    });

    test("markers are told that a file covers one dataset only, and the About page points to verify.html", () => {
        expect(about()).toMatch(/one dataset only/i);
        expect(about()).toMatch(/two files/i);
        expect(readme()).toMatch(/one dataset only/i);
        expect(read("about.html")).toMatch(/<a href="verify\.html">/);
    });

    test("the About page links to a page that exists and loads", async ({ page }) => {
        await page.goto("about.html");
        await page.locator('a[href="verify.html"]').click();
        await expect(page).toHaveURL(/verify\.html$/);
        await expect(page.locator("h1")).toHaveText("Check an evidence file");
    });

    test("the About page says that Ctrl/Cmd+Enter runs the query only in the editor", () => {
        expect(about()).toMatch(/run query \(only while the cursor is in the editor\)/);
    });

    test("the README's exercise example is invented: not an exercise of the published set, its model query nowhere in it", () => {
        const published = JSON.parse(read("exercises/retail-basics.json"));
        const example = JSON.parse(/```json\n([\s\S]*?)\n```/.exec(read("README.md"))[1]);
        expect(example.exercises.length).toBeGreaterThan(0);
        expect(example.id).not.toBe(published.id);
        for (const exercise of example.exercises) {
            for (const real of published.exercises) {
                expect(exercise.id).not.toBe(real.id);
                expect(exercise.title).not.toBe(real.title);
                expect(exercise.model_query).not.toBe(real.model_query);
            }
        }
        for (const real of published.exercises) {
            expect(read("README.md")).not.toContain(real.model_query);
        }
    });

    test("the README tells an instructor to try each new exercise once, because a bad model query or dataset shows only then", () => {
        expect(readme()).toMatch(/model_query. that fails, or a .dataset. that does not exist, is not caught/);
        expect(readme()).toMatch(/try each new exercise once/);
    });

    test("the README says what the query count is, and how SQL lines that look like entries are written", () => {
        expect(readme()).toMatch(/number of entries the exporter wrote/);
        expect(readme()).toMatch(/backslash in front/);
    });
});
