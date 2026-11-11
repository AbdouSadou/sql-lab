// UI plan, Phase 4: results and feedback (docs/design/SQL Lab UI and UX Plan.md, sections 3 and 5;
// docs/design/mockup/main-light.html, first-visit.html and error.html). The ruled result table, the
// states of the results pane (no result yet with sample queries, loading, "Done.", the error band,
// "Running…"), toasts, and the Open from URL and evidence dialogs. The plan's check: the
// category-revenue CTE query of the acceptance suite renders its 5 rows in the new table, and every
// state has a screenshot (tests/ui-states.js, tests/ui-visual.spec.js).
const fs = require("node:fs");
const path = require("node:path");
const {
    test,
    expect,
    PAYLOAD,
    EDITOR_INPUT,
    editorValue,
    realManifest,
    routeManifest,
    withSampleDataset,
    SAMPLE_ENTRY,
} = require("./helpers");
const { RECIPES } = require("./ui-states.js");

const ROOT = path.resolve(__dirname, "..");

// The query of the acceptance suite (tests/m3-datasets.spec.js, spec section 7 item 2)
const SPEC_QUERY = `WITH category_revenue AS (
  SELECT p.category, SUM(oi.quantity * p.unit_price * (1 - oi.discount)) AS revenue
  FROM orders o
  JOIN order_items oi ON o.order_id = oi.order_id
  JOIN products p ON oi.product_id = p.product_id
  GROUP BY p.category
)
SELECT category, ROUND(100.0 * revenue / SUM(revenue) OVER (), 1) FROM category_revenue;`;

// a value of the given length, in a query
const longValueSql = (length) => `SELECT printf('%.${length}c', 'x') AS v;`;

// the computed value of a token on the page's root
const token = (page, name) => page.evaluate((n) => getComputedStyle(document.documentElement).getPropertyValue(n).trim(), name);
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

// records what the live region says, as it is said: __said holds each text (the empty ones left
// out), __saidAll every value the region takes, the empty ones too (the region is emptied before the
// same words are said again, or a screen reader would not repeat them)
async function recordAnnouncements(page) {
    await page.evaluate(() => {
        window.__said = [];
        window.__saidAll = [];
        const region = document.getElementById("results-announce");
        new MutationObserver(() => {
            window.__saidAll.push(region.textContent);
            if (region.textContent) {
                window.__said.push(region.textContent);
            }
        }).observe(region, { childList: true, characterData: true, subtree: true });
    });
}
const said = (page) => page.evaluate(() => window.__said);
const saidAll = (page) => page.evaluate(() => window.__saidAll);

// records every value the toast region takes, the empty ones too (the old card goes before the new
// one comes), and when each card was put in and taken out (performance.now, in ms)
async function recordToastCards(page) {
    await page.evaluate(() => {
        window.__toastValues = [];
        window.__cards = [];
        const region = document.getElementById("toast-region");
        new MutationObserver((records) => {
            window.__toastValues.push(region.textContent);
            for (const record of records) {
                for (const node of record.addedNodes) {
                    window.__cards.push({ text: node.textContent, tone: node.className, added: performance.now(), removed: null });
                }
                for (const node of record.removedNodes) {
                    const card = window.__cards.find((c) => c.removed === null && c.text === node.textContent);
                    if (card) {
                        card.removed = performance.now();
                    }
                }
            }
        }).observe(region, { childList: true, subtree: true, characterData: true });
    });
}

// A dataset's file that arrives in part and then stops (the page's fetch is replaced; call it with
// page.addInitScript before a first load, or page.evaluate for a later one). The half that has come
// is `half` bytes of `total`; window.__finishFetch() sends the rest. mode: "length" (a
// Content-Length), "unknown" (none), "compressed" (a Content-Length and a Content-Encoding, which
// then says nothing about what arrives), "short" (a Content-Length smaller than what arrives).
function stallDatasetFetch({ pattern, mode }) {
    const original = window.fetch;
    window.fetch = async (input, init) => {
        const url = String(input instanceof Request ? input.url : input);
        if (!new RegExp(pattern).test(url) || init?.method === "HEAD") {
            return original(input, init);
        }
        const bytes = new Uint8Array(await (await original(input, init)).arrayBuffer());
        const half = bytes.slice(0, Math.floor(bytes.length / 2));
        const headers = {};
        if (mode === "length" || mode === "compressed") headers["content-length"] = String(bytes.length);
        if (mode === "compressed") headers["content-encoding"] = "gzip";
        if (mode === "short") headers["content-length"] = "1000";
        window.__stalled = { total: bytes.length, half: half.length };
        return new Response(
            new ReadableStream({
                start(controller) {
                    controller.enqueue(half);
                    window.__finishFetch = () => {
                        controller.enqueue(bytes.slice(half.length));
                        controller.close();
                    };
                },
            }),
            { headers }
        );
    };
}
const NORTHLIGHT_FILE = "northlight_retail\\.db(\\?.*)?$";
const SAMPLE_FILE_PATTERN = "datasets/sample\\.db(\\?.*)?$";
// the size line's text for a number of bytes (the sizes of the two files are under a megabyte)
const kb = (bytes) => `${Math.round(bytes / 1000)} KB`;

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

// a clipboard the browser keeps to itself (writeText rejects, execCommand fails)
const refuseClipboard = (page) =>
    page.evaluate(() => {
        Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText: () => Promise.reject(new Error("no")) } });
        document.execCommand = () => false;
    });

// counts lab:run-finished from now on
async function countRuns(page) {
    await page.evaluate(() => {
        window.__runs = 0;
        document.addEventListener("lab:run-finished", () => window.__runs++);
    });
}
const runs = (page) => page.evaluate(() => window.__runs);

// ---- the plan's check -------------------------------------------------------------------------

test.describe("the plan's check", () => {
    test("the category-revenue CTE query of the acceptance suite renders its 5 rows in the ruled table", async ({ page, app }) => {
        await app.open();
        const result = await app.query(SPEC_QUERY);
        expect(result.rows).toHaveLength(5);
        expect(result.columns).toEqual(["category", "ROUND(100.0 * revenue / SUM(revenue) OVER (), 1)"]);
        await expect(app.status).toHaveText(/^5 rows in \d+ ms$/);
        const table = page.locator("#result table.result-table");
        await expect(table).toHaveCount(1);
        const ink = await tokenColour(page, "--ink");
        const rule = await tokenColour(page, "--rule");
        const look = await table.evaluate((t) => {
            const style = (el) => getComputedStyle(el);
            const th = t.querySelectorAll("thead th");
            const rows = t.querySelectorAll("tbody tr");
            const last = rows[rows.length - 1].querySelector("td");
            const first = rows[0].querySelectorAll("td");
            return {
                headTop: [style(th[0]).borderTopWidth, style(th[0]).borderTopStyle, style(th[0]).borderTopColor],
                headBottom: [style(th[0]).borderBottomWidth, style(th[0]).borderBottomColor],
                rowBottom: [style(first[0]).borderBottomWidth, style(first[0]).borderBottomColor],
                lastBottom: [style(last).borderBottomWidth, style(last).borderBottomColor],
                vertical: [...t.querySelectorAll("th, td")].every((c) => style(c).borderLeftWidth === "0px" && style(c).borderRightWidth === "0px"),
                sticky: style(th[0]).position,
                weight: style(th[0]).fontWeight,
                numbers: style(t).fontVariantNumeric,
                textAlign: [style(th[0]).textAlign, style(first[0]).textAlign, style(th[1]).textAlign, style(first[1]).textAlign],
                numClass: [th[1].classList.contains("num"), first[1].classList.contains("num"), first[0].classList.contains("num")],
                stripes: new Set([...rows].map((r) => style(r).backgroundColor)).size,
                scopes: [...th].every((h) => h.scope === "col"),
            };
        });
        expect(look.headTop).toEqual(["2px", "solid", ink]);
        expect(look.headBottom).toEqual(["1px", ink]);
        expect(look.rowBottom).toEqual(["1px", rule]);
        expect(look.lastBottom).toEqual(["2px", ink]);
        expect(look.vertical).toBe(true);
        expect(look.sticky).toBe("sticky");
        expect(look.weight).toBe("600");
        expect(look.numbers).toBe("tabular-nums");
        expect(look.textAlign).toEqual(["left", "left", "right", "right"]);
        expect(look.numClass).toEqual([true, true, false]);
        expect(look.stripes).toBe(1);
        expect(look.scopes).toBe(true);
    });

    test("every state of the results pane has a screenshot in the matrix", () => {
        const states = Object.keys(RECIPES.shell.states);
        for (const state of ["first-visit", "no-result", "loading", "result", "capped", "zero-rows", "long-cell", "done", "error", "load-problem", "empty-database", "toast", "link-popover", "open-url-dialog", "evidence-dialog"]) {
            expect(states).toContain(state);
        }
    });

    // a state named in the matrix is the state its recipe produces (not only a name that is listed)
    const PRODUCES = {
        loading: async (page, app) => {
            await expect(app.pane).toHaveAttribute("data-state", "loading");
            await expect(page.locator(".results-loading-title")).toHaveText("Loading Northlight Retail");
            expect(await page.locator("progress.results-progress").evaluate((b) => b.hasAttribute("value"))).toBe(false);
        },
        "loading-progress": async (page, app) => {
            await expect(app.pane).toHaveAttribute("data-state", "loading");
            const bar = page.locator("progress.results-progress");
            await expect(bar).toHaveJSProperty("value", 0.5);
            await expect(page.locator(".results-loading-size")).toHaveText("43 KB of 86 KB");
        },
        capped: async (page, app) => {
            await expect(app.status).toHaveText(/^Showing 500 of 906 rows in \d+ ms$/);
        },
        "zero-rows": async (page, app) => {
            await expect(app.status).toHaveText(/^0 rows in \d+ ms$/);
            await expect(page.locator("#result thead th")).toHaveCount(2);
        },
        "long-cell": async (page) => {
            await expect(page.locator("#cell-popover")).toBeVisible();
            await expect(page.locator("#result .cell-more")).toHaveAttribute("aria-expanded", "true");
        },
        done: async (page, app) => {
            await expect(app.pane).toHaveAttribute("data-state", "done");
            await expect(app.status).toHaveText(/^Done\. 2 rows changed in \d+ ms$/);
        },
        error: async (page, app) => {
            await expect(app.pane).toHaveAttribute("data-state", "error");
            await expect(app.errorBand.locator(".results-band-message")).toHaveText("no such column: pric");
        },
        "load-problem": async (page, app) => {
            await expect(app.pane).toHaveAttribute("data-state", "empty");
            await expect(app.errorBand.locator(".results-band-text")).toContainText("This link is damaged");
        },
        "empty-database": async (page, app) => {
            await expect(app.emptyState.locator(".results-empty-links")).toBeVisible();
            await expect(app.samples).toHaveCount(0);
        },
        toast: async (page, app) => {
            await expect(app.toast).toHaveText("Link copied");
        },
        "link-popover": async (page, app) => {
            await expect(page.locator("#copy-link-popover")).toBeVisible();
            await expect(app.shareField).toBeFocused();
        },
        "open-url-dialog": async (page) => {
            await expect(page.locator("#open-url-dialog")).toBeVisible();
            await expect(page.locator("#open-url-error")).toBeHidden();
        },
        "open-url-error": async (page) => {
            await expect(page.locator("#open-url-dialog")).toBeVisible();
            await expect(page.locator("#open-url-error")).toBeVisible();
            await expect(page.locator("#open-url-error")).toHaveText("This address cannot be opened. Use one that starts with https:// or http://, or a path on this site.");
            await expect(page.locator("#open-url-input")).toHaveAttribute("aria-invalid", "true");
        },
        "evidence-dialog": async (page) => {
            await expect(page.locator("#evidence-dialog")).toBeVisible();
        },
    };
    for (const [state, check] of Object.entries(PRODUCES)) {
        test(`the matrix recipe '${state}' produces that state`, async ({ page, app }) => {
            expect(RECIPES.shell.states).toHaveProperty(state);
            await RECIPES.shell.states[state](page);
            await check(page, app);
        });
    }

    test("the manifest gives Northlight three samples, and each runs on it", async ({ page, app }) => {
        const manifest = JSON.parse(fs.readFileSync(path.join(ROOT, "datasets", "manifest.json"), "utf8"));
        const samples = manifest.datasets.find((d) => d.id === "northlight").samples;
        expect(samples.map((s) => s.label)).toEqual(["Every product", "Orders per store", "Revenue share by category"]);
        await app.open();
        const counts = [];
        for (const sample of samples) {
            counts.push((await app.query(sample.sql)).rows.length);
        }
        expect(counts).toEqual([20, 5, 5]);
    });
});

// ---- the table --------------------------------------------------------------------------------

test.describe("the table", () => {
    test("NULL reads NULL in graphite italics; an empty string stays empty; a column of NULLs is text", async ({ page, app }) => {
        await app.open();
        const result = await app.query("SELECT NULL AS gone, '' AS blank, 'NULL' AS word, 7 AS n;");
        expect(result.rows).toEqual([["NULL", "", "NULL", "7"]]);
        const cells = page.locator("#result tbody td");
        await expect(cells.nth(0).locator("span.cell-null")).toHaveText("NULL");
        await expect(cells.nth(2).locator("span.cell-null")).toHaveCount(0);
        const graphite = await tokenColour(page, "--graphite");
        const style = await cells.nth(0).locator("span.cell-null").evaluate((s) => [getComputedStyle(s).color, getComputedStyle(s).fontStyle]);
        expect(style).toEqual([graphite, "italic"]);
        await expect(cells.nth(0)).not.toHaveClass(/num/);
        await expect(cells.nth(3)).toHaveClass(/num/);
    });

    test("a column with a text value among numbers is a text column; numbers and NULLs only is a number column", async ({ page, app }) => {
        await app.open();
        await app.query("SELECT 1 AS a, 1 AS b UNION ALL SELECT 'x', NULL UNION ALL SELECT 2.5, 3;");
        const heads = page.locator("#result thead th");
        await expect(heads.nth(0)).not.toHaveClass(/num/);
        await expect(heads.nth(1)).toHaveClass(/num/);
        expect(await page.locator("#result tbody tr").first().locator("td").nth(1).evaluate((c) => getComputedStyle(c).textAlign)).toBe("right");
    });

    test("a column of integers beyond 2^53 (BigInt values) is a number column too, right-aligned", async ({ page, app }) => {
        await app.open();
        const result = await app.query("SELECT 9223372036854775807 AS big, 'x' AS word UNION ALL SELECT 1, 'y';");
        expect(result.rows).toEqual([
            ["9223372036854775807", "x"],
            ["1", "y"],
        ]);
        const heads = page.locator("#result thead th");
        await expect(heads.nth(0)).toHaveClass(/num/);
        await expect(heads.nth(1)).not.toHaveClass(/num/);
        const cells = page.locator("#result tbody td");
        await expect(cells.nth(0)).toHaveClass(/num/);
        await expect(cells.nth(2)).toHaveClass(/num/);
        expect(await heads.nth(0).evaluate((c) => getComputedStyle(c).textAlign)).toBe("right");
        expect(await cells.nth(0).evaluate((c) => getComputedStyle(c).textAlign)).toBe("right");
        expect(await cells.nth(1).evaluate((c) => getComputedStyle(c).textAlign)).toBe("left");
    });

    test("column names are shown exactly as returned: duplicates, spaces and markup as text", async ({ page, app }) => {
        await app.open();
        const result = await app.query(`SELECT 1 AS "a  b", 2 AS a, 3 AS a, 4 AS "${PAYLOAD}";`);
        expect(await page.locator("#result thead th").allTextContents()).toEqual(["a  b", "a", "a", PAYLOAD]);
        expect(result.rows).toEqual([["1", "2", "3", "4"]]);
        await app.expectInert();
    });

    test("a value of 60 characters shows whole; 61 shows 60 and an ellipsis, counted in characters", async ({ page, app }) => {
        await app.open();
        await app.query(longValueSql(60));
        await expect(page.locator("#result .cell-more")).toHaveCount(0);
        await expect(page.locator("#result tbody td")).toHaveText("x".repeat(60));
        await app.query(longValueSql(61));
        await expect(page.locator("#result .cell-more")).toHaveText(`${"x".repeat(60)}…`);
        // an emoji is one character, not two
        await app.query("SELECT printf('%.59c', 'y') || '😀😀' AS v;");
        await expect(page.locator("#result .cell-more")).toHaveText(`${"y".repeat(59)}😀…`);
    });

    test("a long value opens whole in a popover; Escape closes it and the focus goes back to the cell", async ({ page, app }) => {
        await app.open();
        const full = `${"Leeds ".repeat(30)}${PAYLOAD}`;
        await app.query(`SELECT 1 AS id, '${full}' AS note;`);
        const cell = page.locator("#result .cell-more");
        await expect(cell).toHaveAttribute("aria-expanded", "false");
        await cell.click();
        const popover = page.locator("#cell-popover");
        await expect(popover).toBeVisible();
        await expect(popover.locator(".cell-popover-title")).toHaveText("note, row 1");
        await expect(popover.locator(".cell-popover-length")).toHaveText(`${Array.from(full).length} characters`);
        await expect(popover.locator(".cell-popover-value")).toHaveText(full);
        await expect(cell).toHaveAttribute("aria-expanded", "true");
        await expect(popover).toBeFocused();
        await app.expectInert();
        await page.keyboard.press("Escape");
        await expect(popover).toBeHidden();
        await expect(cell).toBeFocused();
        await expect(cell).toHaveAttribute("aria-expanded", "false");
        // the keyboard opens it too
        await page.keyboard.press("Enter");
        await expect(popover).toBeVisible();
    });

    test("pressing another long cell while the popover is open shows that one", async ({ page, app }) => {
        await app.open();
        // side by side, so the popover under the first does not cover the second
        await app.query(`SELECT printf('%.80c', 'a') AS first, printf('%.90c', 'b') AS second;`);
        const cells = page.locator("#result .cell-more");
        await cells.nth(0).click();
        await expect(page.locator("#cell-popover .cell-popover-value")).toHaveText("a".repeat(80));
        await cells.nth(1).click();
        await expect(page.locator("#cell-popover")).toBeVisible();
        await expect(page.locator("#cell-popover .cell-popover-title")).toHaveText("second, row 1");
        await expect(page.locator("#cell-popover .cell-popover-value")).toHaveText("b".repeat(90));
        await expect(cells.nth(0)).toHaveAttribute("aria-expanded", "false");
        await expect(cells.nth(1)).toHaveAttribute("aria-expanded", "true");
    });

    test("the popover stays with its cell when the result scrolls", async ({ page, app }) => {
        await page.setViewportSize({ width: 1366, height: 768 });
        await app.open();
        // a long value in the first row of many, so the result box can scroll down
        await app.query(`SELECT printf('%.80c', 'a') AS v UNION ALL SELECT name FROM (SELECT product_name AS name FROM products, stores);`);
        const cell = page.locator("#result .cell-more").first();
        await cell.click();
        const popover = page.locator("#cell-popover");
        await expect(popover).toBeVisible();
        // measured once it has settled (two frames)
        await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
        const before = await popover.boundingBox();
        const cellBefore = await cell.boundingBox();
        await page.locator("#result").evaluate((r) => (r.scrollTop = 20));
        // the cell moved up 20 px; the popover follows it within a frame
        expect(Math.round((await cell.boundingBox()).y)).toBe(Math.round(cellBefore.y - 20));
        await expect.poll(async () => Math.round((await popover.boundingBox()).y)).toBe(Math.round(before.y - 20));
    });

    test("a new result closes the popover of a cell that is gone", async ({ page, app }) => {
        await app.open();
        await app.query(longValueSql(100));
        await page.locator("#result .cell-more").click();
        await expect(page.locator("#cell-popover")).toBeVisible();
        await page.locator("#execute").focus();
        await app.run("SELECT 1 AS n;");
        await expect(page.locator("#cell-popover")).toBeHidden();
    });

    test("the CSV keeps the whole value, NULL empty, as before", async ({ app }) => {
        await app.open();
        await app.query(`SELECT ${longValueSql(100).slice(7, -6)} AS v, NULL AS gone;`);
        const file = await app.downloadCsv();
        expect(file.text).toBe(`v,gone\r\n${"x".repeat(100)},\r\n`);
    });

    test("500 rows of 906: the summary says so with separators, the table holds 500", async ({ page, app }) => {
        await app.open();
        await recordAnnouncements(page);
        await app.run("SELECT * FROM order_items;");
        await expect(app.status).toHaveText(/^Showing 500 of 906 rows in \d+ ms$/);
        await expect(page.locator("#result tbody tr")).toHaveCount(500);
        await expect.poll(() => said(page)).toContain("906 rows returned. The first 500 are shown.");
        await app.run("WITH RECURSIVE c(x) AS (SELECT 1 UNION ALL SELECT x + 1 FROM c WHERE x < 1234) SELECT x FROM c;");
        await expect(app.status).toHaveText(/^Showing 500 of 1,234 rows in \d+ ms$/);
    });

    test("a result with no rows shows its header and the closing rule, with no Download CSV", async ({ page, app }) => {
        await app.open();
        await app.run("SELECT product_name, unit_price FROM products WHERE unit_price > 1000;");
        await expect(app.pane).toHaveAttribute("data-state", "result");
        await expect(app.status).toHaveText(/^0 rows in \d+ ms$/);
        await expect(page.locator("#result thead th")).toHaveText(["product_name", "unit_price"]);
        await expect(page.locator("#result tbody tr")).toHaveCount(0);
        const ink = await tokenColour(page, "--ink");
        expect(await page.locator("#result thead th").first().evaluate((h) => [getComputedStyle(h).borderBottomWidth, getComputedStyle(h).borderBottomColor])).toEqual(["2px", ink]);
        await expect(app.csvButton).toBeHidden();
    });

    test("the header stays in view while the rows scroll under it", async ({ page, app }) => {
        await page.setViewportSize({ width: 1366, height: 768 });
        await app.open();
        await app.run("SELECT * FROM order_items;");
        const result = page.locator("#result");
        const before = await page.locator("#result thead th").first().boundingBox();
        await result.evaluate((r) => (r.scrollTop = 2000));
        const top = await result.evaluate((r) => r.getBoundingClientRect().top);
        const after = await page.locator("#result thead th").first().boundingBox();
        expect(after.y).toBeGreaterThanOrEqual(top - 1);
        expect(after.y).toBeLessThanOrEqual(top + 1);
        expect(before.y).toBeGreaterThan(after.y - 50);
    });

    test("on a phone a wide result scrolls inside its box and never widens the page; cells do not wrap", async ({ page, app }) => {
        await page.setViewportSize({ width: 360, height: 760 });
        await app.open();
        await app.run(SPEC_QUERY.replace("SELECT category,", "SELECT category, category AS again, revenue,"));
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
        expect(await page.locator("#result").evaluate((r) => r.scrollWidth > r.clientWidth)).toBe(true);
        // "Home & Kitchen" stays on one line
        const heights = await page.locator("#result tbody tr").evaluateAll((rows) => rows.map((r) => r.getBoundingClientRect().height));
        expect(Math.max(...heights) - Math.min(...heights)).toBeLessThan(2);
    });
});

// ---- the summary line and what is said ---------------------------------------------------------

test.describe("the summary line", () => {
    test("rows and time on the left, Download CSV on the right; each outcome said once, again for the same run", async ({ page, app }) => {
        await app.open();
        await recordAnnouncements(page);
        await app.run("SELECT * FROM stores;");
        await expect(app.status).toHaveText(/^5 rows in \d+ ms$/);
        await expect(app.status.locator(".status-time")).toHaveText(/^\d+ ms$/);
        const [text, button] = await Promise.all([app.status.boundingBox(), app.csvButton.boundingBox()]);
        expect(button.x).toBeGreaterThan(text.x + 100);
        await expect.poll(() => said(page)).toEqual(["5 rows returned"]);
        await app.run("SELECT * FROM stores;");
        await expect.poll(() => said(page)).toEqual(["5 rows returned", "5 rows returned"]);
        await app.run("SELECT 1 AS one;");
        await expect.poll(() => said(page)).toEqual(["5 rows returned", "5 rows returned", "1 row returned"]);
        await expect(app.announcer).toHaveAttribute("role", "status");
        await expect(app.announcer).toHaveAttribute("aria-live", "polite");
    });

    test("the live region is emptied before the same words are said again (every value is recorded, the empty ones too)", async ({ page, app }) => {
        await app.open();
        await recordAnnouncements(page);
        await app.run("SELECT * FROM stores;");
        await expect.poll(() => saidAll(page)).toEqual(["5 rows returned"]);
        await app.run("SELECT * FROM stores;");
        await expect.poll(() => saidAll(page)).toEqual(["5 rows returned", "", "5 rows returned"]);
        await app.run("SELECT * FROM stores;");
        await expect.poll(() => saidAll(page)).toEqual(["5 rows returned", "", "5 rows returned", "", "5 rows returned"]);
    });

    test("the summary line shows only with a result: not in no result yet, an error or loading", async ({ app }) => {
        await app.open();
        await expect(app.summary).toBeHidden();
        await app.run("SELECT 1;");
        await expect(app.summary).toBeVisible();
        await app.run("SELECT nope;");
        await expect(app.summary).toBeHidden();
    });

    test("several statements: the last one with a result set is shown, with one summary line, as before", async ({ page, app }) => {
        await app.open();
        await app.run("SELECT 1 AS a; SELECT 2 AS b, 3 AS c; CREATE TABLE later(x);");
        await expect(app.pane).toHaveAttribute("data-state", "result");
        await expect(page.locator("#result thead th")).toHaveText(["b", "c"]);
        await expect(page.locator("#results-summary")).toHaveCount(1);
        await expect(page.locator("#result table")).toHaveCount(1);
    });
});

// ---- Done ---------------------------------------------------------------------------------------

test.describe("a run with no result set", () => {
    test("CREATE TABLE: Done, said and in the status bar; no table, no Download CSV", async ({ page, app }) => {
        await app.open();
        await recordAnnouncements(page);
        await app.run("CREATE TABLE notes (body TEXT);");
        await expect(app.pane).toHaveAttribute("data-state", "done");
        await expect(app.status).toHaveText(/^Done in \d+ ms$/);
        await expect(page.locator("#result table")).toHaveCount(0);
        await expect(app.csvButton).toBeHidden();
        await expect(page.locator("#status-run")).toHaveText(/^Done in \d+ ms$/);
        await expect.poll(() => said(page)).toEqual(["Done."]);
    });

    test("it takes the table of the run before off the screen, and Download CSV with it", async ({ page, app }) => {
        await app.open();
        await app.query("SELECT * FROM stores;");
        await expect(page.locator("#result table")).toHaveCount(1);
        await app.run("CREATE TABLE t(x);");
        await expect(app.pane).toHaveAttribute("data-state", "done");
        await expect(page.locator("#result table")).toHaveCount(0);
        await expect(page.locator("#result")).toBeEmpty();
        await expect(app.status).toHaveText(/^Done in \d+ ms$/);
        await expect(app.csvButton).toBeHidden();
    });

    test("rows changed: the engine's count of the whole run, 0 for a change that matched nothing; the status bar says the same", async ({ page, app }) => {
        await app.open();
        await recordAnnouncements(page);
        // (each is said a moment after its run; the next run waits for it, or only the last is said)
        await app.run("CREATE TABLE t(x); INSERT INTO t VALUES (1), (2), (3);");
        await expect(app.status).toHaveText(/^Done\. 3 rows changed in \d+ ms$/);
        await expect(page.locator("#status-run")).toHaveText(/^Done\. 3 rows changed in \d+ ms$/);
        await expect.poll(() => said(page)).toEqual(["Done. 3 rows changed."]);
        await app.run("UPDATE t SET x = x + 1 WHERE x > 99;");
        await expect(app.status).toHaveText(/^Done\. 0 rows changed in \d+ ms$/);
        await expect(page.locator("#status-run")).toHaveText(/^Done\. 0 rows changed in \d+ ms$/);
        await expect.poll(() => said(page)).toEqual(["Done. 3 rows changed.", "Done. 0 rows changed."]);
        await app.run("-- tidy up\nDELETE FROM t WHERE x = 1;");
        await expect(app.status).toHaveText(/^Done\. 1 row changed in \d+ ms$/);
        await expect(page.locator("#status-run")).toHaveText(/^Done\. 1 row changed in \d+ ms$/);
        await expect.poll(() => said(page)).toEqual(["Done. 3 rows changed.", "Done. 0 rows changed.", "Done. 1 row changed."]);
        await app.run("INSERT INTO t VALUES (7); INSERT INTO t VALUES (8);");
        await expect(app.status).toHaveText(/^Done\. 2 rows changed in \d+ ms$/);
        await expect(page.locator("#status-run")).toHaveText(/^Done\. 2 rows changed in \d+ ms$/);
        await expect.poll(() => said(page)).toEqual(["Done. 3 rows changed.", "Done. 0 rows changed.", "Done. 1 row changed.", "Done. 2 rows changed."]);
    });

    test("lab:run-finished says whether there was a result set, and what the run changed", async ({ page, app }) => {
        await app.open();
        await page.evaluate(() => {
            window.__finished = [];
            document.addEventListener("lab:run-finished", (e) => window.__finished.push({ ok: e.detail.ok, rows: e.detail.rows, resultSet: e.detail.resultSet, changes: e.detail.changes, preview: e.detail.preview }));
        });
        await app.run("CREATE TABLE t(x); INSERT INTO t VALUES (1), (2);");
        await app.run("SELECT * FROM t;");
        expect(await page.evaluate(() => window.__finished)).toEqual([
            { ok: true, rows: 0, resultSet: false, changes: 2, preview: false },
            { ok: true, rows: 2, resultSet: true, changes: null, preview: false },
        ]);
    });
});

// ---- the error band ---------------------------------------------------------------------------

test.describe("the error band", () => {
    test("the mockup's error: heading, SQLite's message as it is, In statement 1, the statement quoted", async ({ page, app }) => {
        await app.open();
        await recordAnnouncements(page);
        const sql = "SELECT product_name, pric\nFROM products\nWHERE category = 'Electronics';";
        await app.run(sql);
        await expect(app.pane).toHaveAttribute("data-state", "error");
        const band = app.errorBand;
        await expect(band.locator("h2.results-band-title")).toHaveText("This query has an error");
        await expect(band.locator(".results-band-message")).toHaveText("no such column: pric");
        await expect(band.locator(".results-band-where")).toHaveText("In statement 1");
        await expect(band.locator("pre.results-band-quote")).toHaveText(sql);
        await expect(band.locator("svg.results-band-icon")).toHaveAttribute("aria-hidden", "true");
        const danger = await tokenColour(page, "--danger-subtle");
        const look = await band.evaluate((b) => {
            const s = getComputedStyle(b);
            return [s.backgroundColor, s.borderLeftWidth, getComputedStyle(b.querySelector(".results-band-message")).fontFamily];
        });
        expect(look[0]).toBe(await page.evaluate((c) => c, danger));
        expect(look[1]).toBe("0px");
        expect(look[2]).toContain("Atkinson Hyperlegible Mono");
        await expect(page.locator("#result table")).toHaveCount(0);
        await expect(page.locator("#status-run")).toHaveText("Last run failed");
        await expect.poll(() => said(page)).toEqual(["This query has an error: no such column: pric"]);
    });

    test("several statements: which one, of how many; comments in front of it are left out of the quote", async ({ app }) => {
        await app.open();
        await app.run("SELECT 1;\n-- the second\nSELECT nope FROM stores;\nSELECT 3;");
        await expect(app.errorBand.locator(".results-band-where")).toHaveText("In statement 2 of 3");
        await expect(app.errorBand.locator(".results-band-quote")).toHaveText("SELECT nope FROM stores;");
    });

    test("a very long statement is cut at 2,000 characters with an ellipsis; markup in it stays text", async ({ app }) => {
        await app.open();
        const sql = `SELECT nope, '${PAYLOAD}${"z".repeat(3000)}';`;
        await app.run(sql);
        const quote = await app.errorBand.locator(".results-band-quote").textContent();
        expect(Array.from(quote)).toHaveLength(2001);
        expect(quote.endsWith("…")).toBe(true);
        expect(quote.startsWith(`SELECT nope, '${PAYLOAD}`)).toBe(true);
        await app.expectInert();
    });

    test("Run with no database open (the first load failed): the band with the message alone", async ({ page, app }) => {
        await page.goto("./#scheme:nothing-here");
        await expect(app.errorBand.locator(".results-band-text")).toContainText("Failed to load database from");
        // the band has no role of its own: the live region says it
        await expect(app.announcer).toContainText("Failed to load database from");
        await app.editor.fill("SELECT 1;");
        await app.editor.press("Control+Enter");
        await expect(app.errorBand.locator(".results-band-text")).toHaveText("No database is loaded.");
        await expect(app.announcer).toHaveText("No database is loaded.");
        await expect(app.errorBand.locator(".results-band-title")).toHaveCount(0);
        await expect(app.pane).toHaveAttribute("data-state", "error");
    });

    test("a database that fails to load from the address: the band says so, as text", async ({ page, app }) => {
        await page.goto(`./#scheme:${PAYLOAD}`);
        await expect(app.errorBand.locator(".results-band-text")).toContainText("Failed to load database from");
        await expect(app.errorBand.locator(".results-band-title")).toHaveCount(0);
        await expect(app.pane).toHaveAttribute("data-state", "error");
        await expect(app.announcer).toContainText("Failed to load database from");
        await app.expectInert();
    });
});

// ---- Running… ---------------------------------------------------------------------------------

test.describe("Running…", () => {
    test("armed over the summary line before the run, a frame is drawn, then the run; gone after it", async ({ page, app }) => {
        await app.open();
        await app.run("SELECT * FROM stores;");
        await page.evaluate(() => {
            window.__trace = [];
            const t = window.__trace;
            new MutationObserver((records) => {
                for (const r of records) {
                    for (const n of r.addedNodes) {
                        if (n.classList?.contains("results-running")) {
                            const s = getComputedStyle(n);
                            t.push({ at: performance.now(), what: "armed", parent: n.parentElement.id, hidden: n.getAttribute("aria-hidden"), delay: s.animationDelay, opacity: s.opacity, text: n.textContent });
                        }
                    }
                }
            }).observe(document.getElementById("results-pane"), { childList: true, subtree: true });
            const db = window.app.database.db;
            const exec = db.exec.bind(db);
            db.exec = (...args) => {
                t.push({ at: performance.now(), what: "run" });
                return exec(...args);
            };
            const frame = () => {
                t.push({ at: performance.now(), what: "frame" });
                requestAnimationFrame(frame);
            };
            requestAnimationFrame(frame);
        });
        await app.run("SELECT * FROM products;");
        const trace = await page.evaluate(() => window.__trace);
        const armed = trace.find((e) => e.what === "armed");
        const run = trace.find((e) => e.what === "run");
        expect(armed).toMatchObject({ parent: "results-summary", hidden: "true", delay: "0.3s", opacity: "0", text: "Running…" });
        // the run waits for a frame, or 250 ms at most (a page starved of frames): a frame lies between
        // arming and the run, or the run began through the fallback, at least 240 ms after arming.
        // "Between" is by the trace's order, which is exact (one thread pushes every entry); the
        // times are not: Firefox gives performance.now() in whole milliseconds, so arming and the
        // frame after it can carry the same time.
        const framed = trace.slice(trace.indexOf(armed) + 1, trace.indexOf(run)).some((e) => e.what === "frame");
        expect(framed || run.at - armed.at >= 240, `frame between: ${framed}, run ${run.at - armed.at} ms after arming`).toBe(true);
        await expect(page.locator(".results-running")).toHaveCount(0);
    });

    test("with no summary line on screen it is armed over the pane, and still removed", async ({ page, app }) => {
        await app.open();
        await page.evaluate(() => {
            window.__parent = null;
            new MutationObserver((records) => {
                for (const r of records) for (const n of r.addedNodes) if (n.classList?.contains("results-running")) window.__parent = n.parentElement.id;
            }).observe(document.getElementById("results-pane"), { childList: true, subtree: true });
        });
        await app.run("SELECT 1;");
        expect(await page.evaluate(() => window.__parent)).toBe("result");
        await expect(page.locator(".results-running")).toHaveCount(0);
    });

    // The Run button is answered at once (the run itself starts a frame later), so it is never held
    // disabled during a quick run, never drawn in the disabled look (--sunken), and keeps the
    // keyboard focus: a disabled button loses it. Sampled on every frame, from before the press.
    for (const way of ["click", "Enter", "Space"]) {
        test(`Run is never disabled or grey during a quick run and keeps the focus (${way})`, async ({ page, app }) => {
            await app.open();
            await app.editor.fill("SELECT * FROM stores;");
            const sunken = await tokenColour(page, "--sunken");
            expect(await tokenColour(page, "--accent")).not.toBe(sunken);
            await page.evaluate(() => {
                window.__frames = [];
                window.__sampling = true;
                const run = document.getElementById("execute");
                const look = () => {
                    window.__frames.push({ disabled: run.disabled, colour: getComputedStyle(run).backgroundColor, focused: document.activeElement === run });
                    if (window.__sampling) requestAnimationFrame(look);
                };
                requestAnimationFrame(look);
            });
            const run = page.locator("#execute");
            if (way === "click") {
                await run.click();
            } else {
                await run.focus();
                await page.keyboard.press(way);
            }
            await app.settle();
            // some frames after the run, too
            await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => requestAnimationFrame(resolve)))));
            await expect(app.status).toHaveText(/^5 rows in \d+ ms$/);
            const frames = await page.evaluate(() => {
                window.__sampling = false;
                return window.__frames;
            });
            expect(frames.length).toBeGreaterThanOrEqual(4);
            // never disabled, never drawn grey
            expect(frames.filter((f) => f.disabled)).toEqual([]);
            expect(frames.filter((f) => f.colour === sunken)).toEqual([]);
            // the focus is on Run from the press on, and never leaves it (a click gives it on the
            // press; the keys have it before)
            const first = frames.findIndex((f) => f.focused);
            expect(first).toBeGreaterThanOrEqual(0);
            expect(frames.slice(first).filter((f) => !f.focused)).toEqual([]);
            expect(frames.at(-1).focused).toBe(true);
            await expect(run).toBeFocused();
            await expect(run).toBeEnabled();
        });
    }

    test("a failing run removes it too, and whenIdle waits for the run", async ({ page, app }) => {
        await app.open();
        await app.editor.fill("SELECT nope;");
        await app.editor.press("Control+Enter");
        await page.evaluate(() => window.app.whenIdle());
        await expect(app.pane).toHaveAttribute("data-state", "error");
        await expect(page.locator(".results-running")).toHaveCount(0);
    });
});

// ---- no result yet ----------------------------------------------------------------------------

test.describe("no result yet", () => {
    test("a first visit runs nothing: the empty editor, the heading, Northlight's three samples", async ({ page, app }) => {
        await app.open();
        await expect(app.pane).toHaveAttribute("data-state", "empty");
        expect(await editorValue(page)).toBe("");
        await expect(page.locator("#editor .cm-placeholder, #editor[data-placeholder]").first()).toBeAttached();
        await expect(app.emptyState.locator("h2")).toHaveText("Run a query to see its result here.");
        await expect(app.emptyState.locator(".results-empty-text")).toHaveText(["Or start from a sample. Choosing one fills the editor; nothing runs until you press Run."]);
        await expect(app.samples.locator(".results-sample-label")).toHaveText(["Every product", "Orders per store", "Revenue share by category"]);
        await expect(app.samples.locator(".results-sample-sql")).toHaveText([
            "SELECT * FROM products;",
            "SELECT s.store_name, COUNT(*) AS orders FROM orders o JOIN stores s ON s.store_id = o.store_id GROUP BY s.store_name;",
            // cut at 120 characters (the line shows fewer at any width; the button's name is its text)
            "WITH category_revenue AS (SELECT p.category, SUM(oi.quantity * p.unit_price * (1 - oi.discount)) AS revenue FROM orders…",
        ]);
        await expect(page.locator("#status-run")).toHaveText("No query run yet");
        await expect(page.locator("#result table")).toHaveCount(0);
        expect(await app.storedQueries()).toEqual([]);
        expect(await app.readLog("northlight")).toBeNull();
    });

    test("choosing a sample fills the editor, runs nothing, and one undo takes it back", async ({ page, app }) => {
        await app.open();
        await countRuns(page);
        await app.editor.fill("SELECT 'mine';");
        await app.samples.nth(1).click();
        const manifest = realManifest();
        const sql = manifest.datasets[0].samples[1].sql;
        expect(await editorValue(page)).toBe(sql);
        await expect(app.editor).toBeFocused();
        expect(await page.evaluate(() => window.app.ui.editor.view.state.selection.main.head)).toBe(sql.length);
        await expect(app.pane).toHaveAttribute("data-state", "empty");
        expect(await runs(page)).toBe(0);
        await page.keyboard.press("Control+z");
        expect(await editorValue(page)).toBe("SELECT 'mine';");
        // then Run runs it
        await app.samples.nth(1).click();
        await page.keyboard.press("Control+Enter");
        await app.settle();
        await expect(app.status).toHaveText(/^5 rows in \d+ ms$/);
    });

    test("the samples are buttons the keyboard reaches and presses", async ({ page, app }) => {
        await app.open();
        await app.samples.first().focus();
        await page.keyboard.press("Enter");
        expect(await editorValue(page)).toBe("SELECT * FROM products;");
        await expect(app.editor).toBeFocused();
        const size = await app.samples.first().boundingBox();
        expect(size.height).toBeGreaterThanOrEqual(44);
    });

    test("after a reload the last query is back, not run, and the line says so", async ({ page, app }) => {
        await app.open();
        await app.run("SELECT * FROM stores;");
        await page.reload();
        await app.waitReady();
        await expect(app.pane).toHaveAttribute("data-state", "empty");
        await expect(app.emptyState.locator(".results-empty-text").first()).toHaveText("Your last query is back in the editor. Press Run to execute it.");
        expect(await editorValue(page)).toBe("SELECT * FROM stores;");
        await expect(app.samples).toHaveCount(3);
    });

    test("a notice from the address is shown under the heading", async ({ page, app }) => {
        await page.goto("./?db=nowhere");
        await app.waitReady();
        await expect(app.emptyState.locator(".results-empty-notice")).toHaveText('There is no database "nowhere" on this site, so the default database is open.');
        await expect(app.samples).toHaveCount(3);
    });

    test("a shared query is in the editor, not run, and the line says so", async ({ page, app }) => {
        await app.open();
        await app.editor.fill("SELECT * FROM stores;");
        const link = await app.copyLink();
        await page.goto("about:blank");
        await page.goto(link);
        await app.waitReady();
        await expect(app.pane).toHaveAttribute("data-state", "empty");
        await expect(app.emptyState.locator(".results-empty-text").first()).toHaveText("A shared query is in the editor. Press Run to execute it.");
        expect(await editorValue(page)).toBe("SELECT * FROM stores;");
        await expect(page.locator("#status-run")).toHaveText("No query run yet");
    });

    test("a damaged link: the problem band over no result yet", async ({ app, page }) => {
        await page.goto("./#s=N4Ig_damaged");
        await app.waitReady();
        const damaged = "This link is damaged or incomplete, so its query could not be opened. Ask the sender for a new link.";
        await expect(app.errorBand.locator(".results-band-text")).toHaveText(damaged);
        // the band has no role of its own: the live region says it
        await expect(app.announcer).toHaveText(damaged);
        await expect(app.emptyState).toBeVisible();
        await expect(app.samples).toHaveCount(3);
    });

    test("an empty database: no samples, what to do, and the two links", async ({ page, app }) => {
        await app.openEmpty();
        await expect(app.samples).toHaveCount(0);
        await expect(app.emptyState.locator(".results-empty-text")).toHaveText([
            "This database has no tables yet. Create one with CREATE TABLE, or open another database from the database menu.",
        ]);
        await expect(app.emptyState.getByRole("link", { name: "About SQL Lab" })).toHaveAttribute("href", "about.html");
        const functions = app.emptyState.getByRole("link", { name: "SQLite functions" });
        await expect(functions).toHaveAttribute("target", "_blank");
        await expect(functions).toHaveAttribute("rel", "noopener noreferrer");
        // a table created: an empty Run shows its first rows as the sample
        await app.run('CREATE TABLE "my things"(x); INSERT INTO "my things" VALUES (1);');
        await app.run("");
        await expect(app.samples.locator(".results-sample-label")).toHaveText(["First 10 rows of my things"]);
        await expect(app.samples.locator(".results-sample-sql")).toHaveText(['SELECT * FROM "my things" LIMIT 10;']);
    });

    test("an uploaded database with tables offers its first table's first rows", async ({ page, app }) => {
        await app.open();
        await app.upload(path.join(__dirname, "fixtures", "sample.db"));
        await expect(app.samples).toHaveCount(1);
        await expect(app.samples.locator(".results-sample-sql")).toHaveText(/^SELECT \* FROM \S+ LIMIT 10;$/);
        await app.samples.click();
        await page.keyboard.press("Control+Enter");
        await app.settle();
        await expect(app.pane).toHaveAttribute("data-state", "result");
    });

    test("in exercise mode there are no samples; leaving it brings them back", async ({ page, app }) => {
        await app.openSet("retail-basics", { ex: "e01" });
        await expect(app.emptyState).toBeVisible();
        await expect(app.samples).toHaveCount(0);
        await expect(app.emptyState.locator(".results-empty-text")).toHaveText(["Write your answer in the editor, then press Check answer."]);
        await app.pickSet("None");
        await expect(app.samples).toHaveCount(3);
    });

    test("an empty Run shows no result yet again and runs nothing", async ({ page, app }) => {
        await app.open();
        await app.run("SELECT 1;");
        await countRuns(page);
        await app.run("   ");
        await expect(app.pane).toHaveAttribute("data-state", "empty");
        expect(await runs(page)).toBe(0);
    });

    test("manifest samples: at most three, and one that is not two texts is left out with a console warning", async ({ page, app }) => {
        const manifest = realManifest();
        manifest.datasets[0].samples = [
            { label: "One", sql: "SELECT 1;" },
            { label: "", sql: "SELECT 2;" },
            { label: "Three", sql: 3 },
            { label: "Four", sql: "SELECT 4;" },
            { label: "Five", sql: "SELECT 5;" },
            { label: "Six", sql: "SELECT 6;" },
        ];
        await routeManifest(page, manifest);
        const warnings = [];
        page.on("console", (m) => m.type() === "warning" && warnings.push(m.text()));
        await app.open();
        await expect(app.samples.locator(".results-sample-label")).toHaveText(["One", "Four", "Five"]);
        expect(warnings.filter((w) => w.includes("samples") || w.includes("sample"))).toHaveLength(2);
    });

    test("manifest samples that are not a list: the first table's rows instead, and the manifest still opens", async ({ page, app }) => {
        const manifest = realManifest();
        manifest.datasets[0].samples = "SELECT 1;";
        await routeManifest(page, manifest);
        await app.open();
        await expect(app.samples.locator(".results-sample-label")).toHaveText([/^First 10 rows of /]);
        await expect(page.locator("#database-button-name")).toHaveText("Northlight Retail");
    });
});

// ---- loading ----------------------------------------------------------------------------------

test.describe("loading", () => {
    test("a database on its way: its name and a progress bar; Run is refused with a toast; then no result yet", async ({ page, app }) => {
        let release;
        const held = new Promise((resolve) => (release = resolve));
        await page.route(/\/datasets\/northlight_retail\.db(\?.*)?$/, async (route) => {
            await held;
            await route.continue();
        });
        await page.goto("./");
        const loading = page.locator("#result .results-loading");
        await expect(loading.locator("h2")).toHaveText("Loading Northlight Retail");
        await expect(loading.locator("progress.results-progress")).toHaveAttribute("aria-labelledby", "results-loading-title");
        await expect(app.pane).toHaveAttribute("data-state", "loading");
        await expect(app.summary).toBeHidden();
        release();
        await app.waitReady();
        await expect(app.pane).toHaveAttribute("data-state", "empty");
    });

    test("Run while a database loads: nothing runs, a toast says why", async ({ page, app }) => {
        await withSampleDataset(page);
        await app.open();
        let release;
        const held = new Promise((resolve) => (release = resolve));
        await page.route(/\/datasets\/sample\.db(\?.*)?$/, async (route) => {
            await held;
            await route.fulfill({ path: path.join(__dirname, "fixtures", "sample.db"), contentType: "application/octet-stream" });
        });
        await app.pickDatabaseById("sample");
        await expect(page.locator("#result .results-loading h2")).toHaveText(`Loading ${SAMPLE_ENTRY.name}`);
        await countRuns(page);
        await app.editor.fill("SELECT 1;");
        await app.editor.press("Control+Enter");
        await expect(app.toast).toHaveText("A database is still loading, so nothing was run. Press Run again once it has opened.");
        expect(await runs(page)).toBe(0);
        release();
        await expect(app.toast).toContainText(`Opened ${SAMPLE_ENTRY.name}`);
    });

    test("the bytes are counted as they arrive, and they are the file's", async ({ page, app }) => {
        await app.open();
        const out = await page.evaluate(async () => {
            const { fetchDataset } = await import(new URL("js/lab/datasets.js", document.baseURI).href);
            const real = await (await fetch("datasets/northlight_retail.db")).arrayBuffer();
            const bytes = new Uint8Array(real);
            const original = window.fetch;
            const serve = (headers) => {
                window.fetch = async () =>
                    new Response(
                        new ReadableStream({
                            start(controller) {
                                for (let i = 0; i < bytes.length; i += 10000) controller.enqueue(bytes.slice(i, i + 10000));
                                controller.close();
                            },
                        }),
                        { headers }
                    );
            };
            const calls = [];
            serve({ "content-length": String(bytes.length) });
            const got = await fetchDataset({ file: "x.db" }, { onProgress: (l, t) => calls.push([l, t]) });
            const compressed = [];
            serve({ "content-length": "100", "content-encoding": "gzip" });
            await fetchDataset({ file: "x.db" }, { onProgress: (l, t) => compressed.push(t) });
            window.fetch = original;
            const same = got.ok && got.buffer.byteLength === bytes.length && new Uint8Array(got.buffer).every((b, i) => b === bytes[i]);
            return { same, length: bytes.length, calls, compressed };
        });
        expect(out.same).toBe(true);
        expect(out.calls[0]).toEqual([0, out.length]);
        expect(out.calls.at(-1)).toEqual([out.length, out.length]);
        expect(out.calls.every((c, i) => i === 0 || c[0] > out.calls[i - 1][0])).toBe(true);
        expect(out.compressed.every((t) => t === 0)).toBe(true);
    });

    test("an uploaded file: its name while it opens, then a toast", async ({ page, app }) => {
        await app.open();
        await app.upload(path.join(__dirname, "fixtures", "sample.db"));
        await expect(app.toast).toHaveText("Opened sample.db");
    });

    test("a pick that fails: the view before the pick comes back, the band above it in .results-problem, and it is said", async ({ page, app }) => {
        await withSampleDataset(page);
        await app.open();
        await recordAnnouncements(page);
        await page.route(/\/datasets\/sample\.db(\?.*)?$/, (route) => route.fulfill({ status: 404, body: "no" }));
        await app.pickDatabaseById("sample");
        const message = `The database "${SAMPLE_ENTRY.name}" could not be loaded. The previous database is still open.`;
        // the band is above the view, outside #result, before the summary line
        const band = page.locator("#results-pane .results-problem .results-band");
        await expect(band.locator(".results-band-text")).toHaveText(message);
        await expect(band).toHaveClass(/results-band--problem/);
        expect(
            await page.locator(".results-problem").evaluate((slot) => {
                const before = (id) => Boolean(slot.compareDocumentPosition(document.getElementById(id)) & Node.DOCUMENT_POSITION_FOLLOWING);
                return [slot.parentElement.id, before("results-summary"), before("result"), slot.hidden];
            })
        ).toEqual(["results-pane", true, true, false]);
        await expect(page.locator("#result .results-band")).toHaveCount(0);
        // the view before the pick is back: no result yet, with the samples of the database still open
        await expect(app.pane).toHaveAttribute("data-state", "empty");
        await expect(app.emptyState).toBeVisible();
        await expect(app.samples).toHaveCount(3);
        await expect(page.locator("#result .results-loading")).toHaveCount(0);
        await expect(app.databaseLabel).toHaveText("Northlight Retail");
        // said by the live region, once
        await expect(app.announcer).toHaveText(message);
        expect(await said(page)).toEqual([message]);
    });

    test("a pick that fails with a result on screen: the result, its summary line and Download CSV come back, and the band goes at the next run", async ({ page, app }) => {
        await withSampleDataset(page);
        await app.open();
        const before = await app.query("SELECT * FROM stores;");
        await expect(app.status).toHaveText(/^5 rows in \d+ ms$/);
        await page.route(/\/datasets\/sample\.db(\?.*)?$/, (route) => route.fulfill({ status: 404, body: "no" }));
        await app.pickDatabaseById("sample");
        const band = page.locator("#results-pane .results-problem .results-band");
        await expect(band.locator(".results-band-text")).toHaveText(`The database "${SAMPLE_ENTRY.name}" could not be loaded. The previous database is still open.`);
        await expect(app.pane).toHaveAttribute("data-state", "result");
        await expect(app.summary).toBeVisible();
        await expect(app.status).toHaveText(/^5 rows in \d+ ms$/);
        expect(await app.read()).toEqual(before);
        await expect(app.csvButton).toBeVisible();
        const file = await app.downloadCsv();
        expect(file.text.split("\r\n")[0]).toBe(before.columns.join(","));
        expect(file.text.split("\r\n")).toHaveLength(7);
        // the next state takes the band away
        await app.run("SELECT 1 AS one;");
        await expect(page.locator(".results-problem")).toBeHidden();
        await expect(page.locator("#results-pane .results-band")).toHaveCount(0);
    });

    test("a first load held half way: the size line, the bar's value and its wiring (OpenCurrentUrl)", async ({ page, app }) => {
        await page.addInitScript(stallDatasetFetch, { pattern: NORTHLIGHT_FILE, mode: "length" });
        await page.goto("./");
        await expect(app.pane).toHaveAttribute("data-state", "loading");
        const { total, half } = await page.evaluate(() => window.__stalled);
        expect(total).toBe(fs.statSync(path.join(ROOT, "datasets", "northlight_retail.db")).size);
        await expect(page.locator(".results-loading-title")).toHaveText("Loading Northlight Retail");
        await expect(page.locator(".results-loading-size")).toHaveText(`${kb(half)} of ${kb(total)}`);
        const bar = page.locator("progress.results-progress");
        await expect(bar).toHaveJSProperty("value", half / total);
        await expect(bar).toHaveJSProperty("max", 1);
        // the rest arrives: the bar and its line go with the loading state
        await page.evaluate(() => window.__finishFetch());
        await app.waitReady();
        await expect(page.locator(".results-loading")).toHaveCount(0);
    });

    for (const [mode, why] of [
        ["unknown", "the size is not known (no Content-Length)"],
        ["compressed", "the body is compressed (its Content-Length is not what arrives)"],
        ["short", "more has arrived than the Content-Length said"],
    ]) {
        test(`a bar with no value waits, and the line shows what has come: ${why}`, async ({ page, app }) => {
            await page.addInitScript(stallDatasetFetch, { pattern: NORTHLIGHT_FILE, mode });
            await page.goto("./");
            await expect.poll(() => page.evaluate(() => window.__stalled?.half)).toBeGreaterThan(0);
            const { half } = await page.evaluate(() => window.__stalled);
            await expect(page.locator(".results-loading-size")).toHaveText(kb(half));
            const bar = page.locator("progress.results-progress");
            await expect(bar).not.toHaveAttribute("value", /.*/);
            await expect(bar).toHaveJSProperty("position", -1);
            await expect(bar).toHaveJSProperty("max", 1);
            await expect(app.pane).toHaveAttribute("data-state", "loading");
        });
    }

    test("a database picked in the switcher shows its own progress", async ({ page, app }) => {
        await withSampleDataset(page);
        await app.open();
        await page.evaluate(stallDatasetFetch, { pattern: SAMPLE_FILE_PATTERN, mode: "length" });
        await app.pickDatabaseById("sample");
        await expect(app.pane).toHaveAttribute("data-state", "loading");
        await expect.poll(() => page.evaluate(() => window.__stalled?.half)).toBeGreaterThan(0);
        const { total, half } = await page.evaluate(() => window.__stalled);
        expect(total).toBe(fs.statSync(path.join(__dirname, "fixtures", "sample.db")).size);
        await expect(page.locator(".results-loading-title")).toHaveText(`Loading ${SAMPLE_ENTRY.name}`);
        await expect(page.locator(".results-loading-size")).toHaveText(`${kb(half)} of ${kb(total)}`);
        await expect(page.locator("progress.results-progress")).toHaveJSProperty("value", half / total);
        await page.evaluate(() => window.__finishFetch());
        await expect(app.toast).toHaveText(`Opened ${SAMPLE_ENTRY.name}`);
        await expect(app.pane).toHaveAttribute("data-state", "empty");
    });

    test("Open from URL shows the loading state with the file's name while the engine fetches it", async ({ page, app }) => {
        await app.open();
        let release;
        const held = new Promise((resolve) => (release = resolve));
        await page.route(/\/datasets\/northlight_retail\.db(\?.*)?$/, async (route) => {
            await held;
            await route.continue();
        });
        await page.keyboard.press("Control+u");
        await page.locator("#open-url-input").fill("datasets/northlight_retail.db");
        await page.locator("#open-url-input").press("Enter");
        await expect(page.locator("#open-url-dialog")).toBeHidden();
        await expect(app.pane).toHaveAttribute("data-state", "loading");
        await expect(page.locator(".results-loading-title")).toHaveText("Loading northlight_retail.db");
        // its size is not known to the page: no figure, a bar that waits
        await expect(page.locator(".results-loading-size")).toHaveText("");
        await expect(page.locator("progress.results-progress")).not.toHaveAttribute("value", /.*/);
        release();
        await expect(app.toast).toHaveText("Opened northlight_retail.db");
        await expect(app.pane).toHaveAttribute("data-state", "empty");
    });

    test("an upload shows the loading state with the file's name and size, all of it already read", async ({ page, app }) => {
        await app.open();
        // the load is quick: record the loading state as it is drawn
        await page.evaluate(() => {
            window.__loadings = [];
            new MutationObserver(() => {
                const block = document.querySelector("#result .results-loading");
                if (block) {
                    const bar = block.querySelector("progress");
                    window.__loadings.push({ title: block.querySelector(".results-loading-title").textContent, size: block.querySelector(".results-loading-size").textContent, value: bar.hasAttribute("value") ? bar.value : null });
                }
            }).observe(document.getElementById("result"), { childList: true });
        });
        await app.upload(path.join(__dirname, "fixtures", "sample.db"));
        const size = fs.statSync(path.join(__dirname, "fixtures", "sample.db")).size;
        const loadings = await page.evaluate(() => window.__loadings);
        expect(loadings.length).toBeGreaterThanOrEqual(1);
        expect(loadings[0]).toEqual({ title: "Loading sample.db", size: `${kb(size)} of ${kb(size)}`, value: 1 });
    });

    test("a Run and a switch in the same frame: the run is dropped, nothing lands, and the pane stays loading", async ({ page, app }) => {
        await withSampleDataset(page);
        await app.open();
        const sql = "CREATE TABLE marker(x); INSERT INTO marker VALUES (1);";
        await app.editor.fill(sql);
        let release;
        const held = new Promise((resolve) => (release = resolve));
        await page.route(/\/datasets\/sample\.db(\?.*)?$/, async (route) => {
            await held;
            await route.fulfill({ status: 404, body: "no" });
        });
        await app.databaseButton.click();
        await expect(app.databaseMenu).toBeVisible();
        await countRuns(page);
        // Run is pressed, and in the same task the switch begins (the run waits a frame before it starts)
        await page.evaluate(() => {
            document.getElementById("execute").click();
            document.querySelector('#database-menu [data-dataset-id="sample"]').click();
        });
        // the Run was asked for (it saves its SQL as it is asked) ...
        expect(await app.storedQueries()).toEqual([["sqlime.query.northlight_retail.db", sql]]);
        await expect(app.pane).toHaveAttribute("data-state", "loading");
        await app.settle();
        // ... and given up when the frame had passed: no run finished, the pane still loads
        expect(await runs(page)).toBe(0);
        await expect(app.pane).toHaveAttribute("data-state", "loading");
        await expect(page.locator(".results-running")).toHaveCount(0);
        release();
        await expect(page.locator(".results-problem")).toBeVisible();
        expect(await runs(page)).toBe(0);
        // the database that stayed open never saw the INSERT (nor the CREATE TABLE)
        const found = await app.query("SELECT count(*) AS n FROM sqlite_master WHERE name = 'marker';");
        expect(found.rows).toEqual([["0"]]);
    });
});

// ---- toasts -----------------------------------------------------------------------------------

test.describe("toasts", () => {
    test("Copy link: Link copied, bottom centre, polite, gone after about four seconds", async ({ page, app }) => {
        await page.setViewportSize({ width: 1366, height: 768 });
        await app.open();
        const link = await app.copyLink();
        expect(link).toContain("#s=");
        const card = page.locator("#toast-region .toast");
        await expect(card).toHaveText("Link copied");
        await expect(app.toast).toHaveAttribute("role", "status");
        await expect(app.toast).toHaveAttribute("aria-live", "polite");
        const box = await card.boundingBox();
        expect(Math.abs(box.x + box.width / 2 - 683)).toBeLessThan(2);
        expect(box.y + box.height).toBeLessThan(768 - 28);
        expect(box.y + box.height).toBeGreaterThan(768 - 28 - 40);
        expect(await page.locator("#toast-region").evaluate((r) => getComputedStyle(r).pointerEvents)).toBe("none");
        await expect(card).toHaveCount(0, { timeout: 6000 });
    });

    test("one at a time; the same words twice are announced twice", async ({ page, app }) => {
        await app.open();
        await page.evaluate(() => {
            window.__toasts = [];
            const region = document.getElementById("toast-region");
            new MutationObserver(() => region.textContent && window.__toasts.push(region.textContent)).observe(region, { childList: true, subtree: true });
        });
        // (every value the region takes, the empty ones too: the old card goes before the new one comes)
        await recordToastCards(page);
        await app.copyLink();
        await app.copyLink();
        await expect.poll(() => page.evaluate(() => window.__toasts)).toEqual(["Link copied", "Link copied"]);
        await expect.poll(() => page.evaluate(() => window.__toastValues)).toEqual(["Link copied", "", "Link copied"]);
        await expect(page.locator("#toast-region .toast")).toHaveCount(1);
    });

    test("a database that is not a course one: the link is copied and the toast says it cannot carry it", async ({ page, app }) => {
        await app.open();
        await app.upload(path.join(__dirname, "fixtures", "sample.db"));
        await app.copyLink();
        await expect(app.toast).toHaveText(
            "Link copied. This database is not one of the course databases, so the link cannot include it: whoever opens the link gets the default database."
        );
    });

    test("a query too long for a link: a note toast (a refusal, not a failure), nothing copied", async ({ page, app }) => {
        await app.open();
        await app.stubClipboard();
        // text that does not compress (a repeated letter would make a short link)
        let seed = 2463534242;
        const noise = Array.from({ length: 150000 }, () => {
            seed ^= seed << 13;
            seed ^= seed >>> 17;
            seed ^= seed << 5;
            return "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789"[(seed >>> 0) % 62];
        }).join("");
        await app.editor.fill(`SELECT '${noise}';`);
        await page.locator("#copy-link").click();
        await expect(app.toast).toHaveText("This query is too long to put in a link. Shorten it, or send the text itself.");
        await expect(page.locator("#toast-region .toast--note")).toHaveCount(1);
        await expect(page.locator("#toast-region .toast--problem")).toHaveCount(0);
        await expect(page.locator("#toast-region .toast--note use")).toHaveAttribute("href", "#icon-info");
        expect(await page.evaluate(() => window.__copied)).toEqual([]);
    });

    test("a long note or info toast stays words x 300 ms: this one, 25 words, 7.5 s (and well over the 4 s of a short one)", async ({ page, app }) => {
        test.slow();
        await app.open();
        await app.upload(path.join(__dirname, "fixtures", "sample.db"));
        await recordToastCards(page);
        await app.copyLink();
        await expect(app.toast).toContainText("Link copied. This database is not one of the course databases");
        // (the toast of the upload may be the first card recorded: this one is the one that says Link copied.)
        const copied = () => page.evaluate(() => window.__cards.find((c) => c.text.startsWith("Link copied. This database"))?.removed ?? null);
        await expect.poll(copied, { timeout: 15000 }).not.toBeNull();
        const card = await page.evaluate(() => window.__cards.find((c) => c.text.startsWith("Link copied. This database")));
        expect(card.tone).toBe("toast toast--info");
        const words = card.text.split(/\s+/).filter(Boolean).length;
        expect(words).toBe(25);
        const lasted = card.removed - card.added;
        // 25 x 300 ms (a few ms of slack: the two times are read from observers, either side of the timer)
        expect(lasted).toBeGreaterThanOrEqual(7500 - 50);
        expect(lasted).toBeLessThanOrEqual(10000);
    });

    test("a clipboard the browser refuses: the link in a field under the button, selected; Escape goes back", async ({ page, app }) => {
        await app.open();
        await app.recordToasts();
        await refuseClipboard(page);
        await page.locator("#copy-link").click();
        const popover = page.locator("#copy-link-popover");
        await expect(popover).toBeVisible();
        await expect(popover).toHaveAttribute("role", "dialog");
        await expect(app.shareField).toBeFocused();
        const selected = await app.shareField.evaluate((f) => [f.selectionStart, f.selectionEnd, f.value.length, f.readOnly]);
        expect(selected[0]).toBe(0);
        expect(selected[1]).toBe(selected[2]);
        expect(selected[3]).toBe(true);
        expect(await app.shareField.inputValue()).toContain("#s=");
        // no toast said the link was copied: the whole list of toasts since the page opened is empty
        await app.expectToasts([]);
        await page.keyboard.press("Escape");
        await expect(popover).toBeHidden();
        await expect(page.locator("#copy-link")).toBeFocused();
    });

    test("exports say what they saved", async ({ page, app }) => {
        await app.open();
        await app.query("SELECT * FROM stores;");
        await app.downloadCsv();
        await expect(app.toast).toHaveText("Exported northlight_retail-result.csv");
        await app.exportEvidence();
        await expect(app.toast).toHaveText("Exported evidence-northlight.txt with 1 query");
        await app.openExportMenu();
        const [download] = await Promise.all([
            page.waitForEvent("download"),
            (async () => {
                await page.locator("#export-db").click();
                await page.locator("#export-name").press("Enter");
            })(),
        ]);
        expect(download.suggestedFilename()).toBe("northlight_retail.db");
        await expect(app.toast).toHaveText("Exported northlight_retail.db");
    });

    test("the page's first load has no toast; a database the student opens has one", async ({ page, app }) => {
        await withSampleDataset(page);
        // recorded from before the page's own scripts run: a toast on the first load would be on the list
        await app.recordToasts({ fromStart: true });
        await app.open();
        await app.expectToasts([]);
        await app.pickDatabaseById("sample");
        await expect(app.toast).toHaveText(`Opened ${SAMPLE_ENTRY.name}`);
        await app.expectToasts([`Opened ${SAMPLE_ENTRY.name}`]);
    });

    test("an information toast stays about four seconds: there at 3.5 s, gone by 4.6 s", async ({ page, app }) => {
        test.slow();
        await app.open();
        await recordToastCards(page);
        await app.copyLink();
        await expect.poll(() => page.evaluate(() => window.__cards.at(0)?.removed ?? null), { timeout: 8000 }).not.toBeNull();
        const [card] = await page.evaluate(() => window.__cards);
        expect(card.tone).toBe("toast toast--info");
        const lasted = card.removed - card.added;
        expect(lasted).toBeGreaterThanOrEqual(3500);
        expect(lasted).toBeLessThanOrEqual(4600);
    });

    test("a problem toast stays twice as long: still there at 6 s, gone by 8.6 s", async ({ page, app }) => {
        test.slow();
        await app.open();
        await app.query("SELECT * FROM stores;");
        await page.evaluate(() => {
            URL.createObjectURL = () => {
                throw new Error("no");
            };
        });
        await recordToastCards(page);
        await app.csvButton.click();
        await expect(app.toast).toHaveText("The CSV file could not be saved.");
        // six words: the 8 s a problem toast has at least (6 x 300 ms is less)
        await expect.poll(() => page.evaluate(() => window.__cards.at(0)?.removed ?? null), { timeout: 12000 }).not.toBeNull();
        const [card] = await page.evaluate(() => window.__cards);
        expect(card.tone).toBe("toast toast--problem");
        const lasted = card.removed - card.added;
        expect(lasted).toBeGreaterThanOrEqual(6000);
        expect(lasted).toBeLessThanOrEqual(8600);
    });

    test("two toasts within one task: one card, the second's text, and the first is never shown", async ({ page, app }) => {
        await app.open();
        await app.query("SELECT * FROM stores;");
        await app.stubClipboard();
        await app.recordToasts();
        await recordToastCards(page);
        // a CSV export (its toast at once) and Copy link (its toast a moment later), 20 ms apart at most
        const [download] = await Promise.all([
            page.waitForEvent("download"),
            page.evaluate(() => {
                document.getElementById("download-csv").click();
                document.getElementById("copy-link").click();
            }),
        ]);
        expect(download.suggestedFilename()).toBe("northlight_retail-result.csv");
        await expect(app.toast).toHaveText("Link copied");
        await app.expectToasts(["Link copied"]);
        await expect(page.locator("#toast-region .toast")).toHaveCount(1);
        expect(await page.evaluate(() => window.__cards.map((c) => c.text))).toEqual(["Link copied"]);
    });

    test("with no async clipboard, the old way copies: Link copied, and no popover", async ({ page, app }) => {
        await app.open();
        await page.evaluate(() => {
            Object.defineProperty(navigator, "clipboard", { configurable: true, value: undefined });
            window.__exec = [];
            document.execCommand = (command) => {
                const field = document.querySelector('textarea[aria-hidden="true"][readonly]');
                window.__exec.push({ command, tag: field?.tagName, value: field?.value, selected: field ? field.selectionEnd - field.selectionStart === field.value.length : null });
                return true;
            };
        });
        await app.recordToasts();
        await page.locator("#copy-link").click();
        await expect(app.toast).toHaveText("Link copied");
        await expect(page.locator("#copy-link-popover")).toBeHidden();
        await app.expectToasts(["Link copied"]);
        const calls = await page.evaluate(() => window.__exec);
        expect(calls).toHaveLength(1);
        expect(calls[0]).toMatchObject({ command: "copy", tag: "TEXTAREA", selected: true });
        expect(calls[0].value).toContain("#s=");
    });

    // Found while writing these tests: ActionController holds Copy link disabled for the length of
    // its action (a disabled button takes no focus), so the old way of copying left the focus on
    // <body>; copyText now gives it back once the button is enabled again.
    test("with no async clipboard, the old way copies and the focus stays on the Copy link button", async ({ page, app }) => {
        await app.open();
        await page.evaluate(() => {
            Object.defineProperty(navigator, "clipboard", { configurable: true, value: undefined });
            document.execCommand = () => true;
        });
        await page.locator("#copy-link").click();
        await expect(app.toast).toHaveText("Link copied");
        await expect(page.locator("#copy-link")).toBeFocused({ timeout: 1000 });
    });

    test("a clipboard that is refused: the popover for a course database carries no note", async ({ page, app }) => {
        await app.open();
        await refuseClipboard(page);
        await page.locator("#copy-link").click();
        await expect(page.locator("#copy-link-popover")).toBeVisible();
        await expect(page.locator("#copy-link-popover .share-link-warning")).toBeHidden();
        await expect(page.locator("#copy-link-popover .share-link-warning")).toHaveText("");
    });

    test("a clipboard that is refused, for an uploaded database: the popover says the link cannot carry it", async ({ page, app }) => {
        await app.open();
        await app.recordToasts();
        await app.upload(path.join(__dirname, "fixtures", "sample.db"));
        await refuseClipboard(page);
        await page.locator("#copy-link").click();
        const popover = page.locator("#copy-link-popover");
        await expect(popover).toBeVisible();
        const note = popover.locator(".share-link-warning");
        await expect(note).toBeVisible();
        await expect(note).toHaveText(
            "This database is not one of the course databases, so the link cannot include it: whoever opens the link gets the default database."
        );
        expect(await app.shareField.inputValue()).toContain("#s=");
        // the upload's own toast is the only one: nothing said the link was copied
        await app.expectToasts(["Opened sample.db"]);
    });

    test("the popover closes when a later copy succeeds", async ({ page, app }) => {
        await app.open();
        await refuseClipboard(page);
        await page.locator("#copy-link").click();
        await expect(page.locator("#copy-link-popover")).toBeVisible();
        // the browser lets it through this time (Enter on the button: a press elsewhere would close the popover by itself)
        const link = await app.copyLink({ via: "keyboard" });
        expect(link).toContain("#s=");
        await expect(app.toast).toHaveText("Link copied");
        await expect(page.locator("#copy-link-popover")).toBeHidden();
    });

    test("a CSV that cannot be saved: a problem toast, and no success toast", async ({ page, app }) => {
        await app.open();
        await app.query("SELECT * FROM stores;");
        await page.evaluate(() => {
            URL.createObjectURL = () => {
                throw new Error("no");
            };
        });
        await app.recordToasts();
        await app.csvButton.click();
        await expect(app.toast).toHaveText("The CSV file could not be saved.");
        await expect(page.locator("#toast-region .toast")).toHaveClass(/toast--problem/);
        await app.expectToasts(["The CSV file could not be saved."]);
    });

    test("a database that cannot be exported: a problem toast", async ({ page, app }) => {
        await app.open();
        await page.evaluate(() => {
            URL.createObjectURL = () => {
                throw new Error("no");
            };
        });
        await app.recordToasts();
        await app.openExportMenu();
        await page.locator("#export-db").click();
        await page.locator("#export-name").press("Enter");
        await expect(app.toast).toHaveText("The database could not be exported.");
        await expect(page.locator("#toast-region .toast")).toHaveClass(/toast--problem/);
        await app.expectToasts(["The database could not be exported."]);
    });

    test("evidence that cannot be saved: the dialog closes, the number is gone, and a problem toast says so", async ({ page, app }) => {
        await app.open();
        await app.run("SELECT 1;");
        await page.evaluate(() => {
            URL.createObjectURL = () => {
                throw new Error("no");
            };
        });
        await app.recordToasts();
        await app.openEvidence();
        await expect(app.evidenceDialog).toBeVisible();
        await app.evidenceInput.fill("U2034567");
        await app.evidenceDialog.locator("button[type=submit]").click();
        await expect(app.toast).toHaveText("The evidence file could not be saved.");
        await expect(page.locator("#toast-region .toast")).toHaveClass(/toast--problem/);
        await expect(app.evidenceDialog).toBeHidden();
        await expect(app.evidenceInput).toHaveValue("");
        await app.expectToasts(["The evidence file could not be saved."]);
    });

    test("a query put back from History: a toast, and the result on screen stays", async ({ page, app }) => {
        await app.open();
        await app.run("SELECT * FROM stores;");
        await app.run("SELECT 1 AS one;");
        await app.openHistory();
        await app.historyEntries.nth(1).click();
        await expect(app.toast).toHaveText("An earlier query is in the editor. Press Run to execute it.");
        await expect(app.status).toHaveText(/^1 row in \d+ ms$/);
        expect(await editorValue(page)).toBe("SELECT * FROM stores;");
    });
});

// ---- Open from URL ----------------------------------------------------------------------------

test.describe("Open from URL", () => {
    test("the menu entry opens a dialog with an empty, labelled field; Escape goes back to the button", async ({ page, app }) => {
        await app.open();
        await app.databaseButton.click();
        await page.locator("#open-url").click();
        const dialog = page.getByRole("dialog", { name: "Open from URL" });
        await expect(dialog).toBeVisible();
        const field = page.getByLabel("Address");
        await expect(field).toBeFocused();
        await expect(field).toHaveValue("");
        await expect(field).toHaveAttribute("inputmode", "url");
        await expect(field).toHaveAttribute("spellcheck", "false");
        await expect(field).toHaveAttribute("autocomplete", "off");
        await page.keyboard.press("Escape");
        await expect(dialog).toBeHidden();
        await expect(app.databaseButton).toBeFocused();
    });

    test("Ctrl+U from the editor opens it; Cancel goes back to the editor", async ({ page, app }) => {
        await app.open();
        await app.editor.click();
        await page.keyboard.press("Control+u");
        await expect(page.locator("#open-url-dialog")).toBeVisible();
        await page.getByRole("button", { name: "Cancel" }).click();
        await expect(page.locator("#open-url-dialog")).toBeHidden();
        await expect(app.editor).toBeFocused();
    });

    test("an empty address and one that cannot be opened are refused inline, and nothing is requested", async ({ page, app, net }) => {
        await app.open();
        await page.keyboard.press("Control+u");
        const field = page.locator("#open-url-input");
        await field.press("Enter");
        await expect(page.locator("#open-url-error")).toHaveText("Enter the address of a database file.");
        await expect(field).toHaveAttribute("aria-invalid", "true");
        await expect(field).toBeFocused();
        // an address of spaces is empty
        await field.fill("   ");
        await expect(page.locator("#open-url-error")).toBeHidden();
        await field.press("Enter");
        await expect(page.locator("#open-url-error")).toHaveText("Enter the address of a database file.");
        // addresses that are not a path on this site or http(s), and nothing goes over the network for them
        for (const address of ["gist:abc123", "ftp://example.org/x.db", "javascript:alert(1)"]) {
            await field.fill(address);
            await expect(page.locator("#open-url-error")).toBeHidden();
            net.clear();
            await field.press("Enter");
            await expect(page.locator("#open-url-error")).toHaveText(
                "This address cannot be opened. Use one that starts with https:// or http://, or a path on this site."
            );
            await expect(page.locator("#open-url-dialog")).toBeVisible();
            expect(net.network).toEqual([]);
        }
        expect(new URL(page.url()).hash).toBe("");
    });

    test("the address is trimmed: spaces around a path on this site are not part of it", async ({ page, app }) => {
        await app.open();
        await page.keyboard.press("Control+u");
        await page.locator("#open-url-input").fill("  datasets/northlight_retail.db  ");
        await page.locator("#open-url-input").press("Enter");
        await expect(page.locator("#open-url-dialog")).toBeHidden();
        await expect(app.toast).toHaveText("Opened northlight_retail.db");
        await expect(app.databaseLabel).toHaveText("northlight_retail.db");
        expect(new URL(page.url()).hash).toBe("#datasets/northlight_retail.db");
        expect(await page.evaluate(() => window.app.database.name)).toBe("northlight_retail.db");
        expect(await page.evaluate(() => window.app.database.path.value)).toBe("datasets/northlight_retail.db");
    });

    test("a path on this site opens: the dialog closes, the database loads, the address and a toast follow", async ({ page, app }) => {
        await app.open();
        await page.keyboard.press("Control+u");
        await page.locator("#open-url-input").fill("datasets/northlight_retail.db");
        await page.getByRole("button", { name: "Open", exact: true }).click();
        await expect(page.locator("#open-url-dialog")).toBeHidden();
        await expect(app.toast).toHaveText("Opened northlight_retail.db");
        await expect(app.databaseLabel).toHaveText("northlight_retail.db");
        expect(new URL(page.url()).hash).toBe("#datasets/northlight_retail.db");
    });
});

// ---- the evidence dialog ----------------------------------------------------------------------

test.describe("the evidence dialog", () => {
    test("explains itself in one sentence and names the file it will save", async ({ page, app }) => {
        await app.open();
        await app.run("SELECT 1;");
        await app.openEvidence();
        await expect(app.evidenceDialog.locator("h2")).toHaveText("Export evidence");
        await expect(app.evidenceDialog.locator("#evidence-text")).toHaveText("Creates a text record of the queries you ran, to attach to your assessment.");
        await expect(app.evidenceDialog.locator("#evidence-file")).toHaveText("Saved as evidence-northlight.txt");
        await expect(app.evidenceDialog).toHaveAttribute("aria-describedby", "evidence-text");
        await expect(app.evidenceDialog.locator(".evidence-submit")).toHaveClass(/button--primary/);
        await expect(app.evidenceDialog.locator(".evidence-cancel")).toHaveClass(/\bbutton\b/);
    });

    test("an empty log: a toast says why and no dialog opens", async ({ page, app }) => {
        await app.open();
        await app.openEvidence();
        await expect(app.toast).toHaveText("Nothing to export yet. Run a query first, then export your evidence.");
        await expect(app.evidenceDialog).toBeHidden();
    });
});
