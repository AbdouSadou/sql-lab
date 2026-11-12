const path = require("node:path");
const { test, expect, openFresh, tabTo, DEFAULT_DATASET, NORTHLIGHT_URL, EDITOR_INPUT } = require("./helpers");

// Deterministic filler so the 20 KB statement does not compress to nothing.
function filler(bytes) {
    let seed = 12345;
    const alphabet = "abcdefghijklmnopqrstuvwxyz0123456789 ,.;:'\"()=<>+-*/_é";
    let out = "";
    while (out.length < bytes) {
        seed = (seed * 1103515245 + 12345) & 0x7fffffff;
        out += alphabet[seed % alphabet.length];
    }
    return out;
}

const CASES = {
    "quotes": `SELECT 'O''Brien' AS "the ""name""", '"' AS dq, '\\' AS backslash;`,
    "newlines and blank lines": "SELECT 1 AS a,\n\n       2 AS b\n  -- trailing comment\n;",
    "non-ASCII text": "SELECT 'Zoë Müller, naïve café, 日本語, Ελληνικά, العربية' AS name;",
    "emoji": "SELECT '😀 👩‍💻 🇬🇧 ✓' AS fun, 'a🙂b' AS mid;",
    "URL-hostile characters": "SELECT '#s=&?=%20%25 + $ <b>x</b> / \\\\' AS odd;",
    "a 20 KB statement": (() => {
        let sql = "SELECT 20000 AS size\n";
        let n = 0;
        while (sql.length < 20 * 1024) {
            sql += `-- ${n++}: ${filler(70)}\n`;
        }
        return sql + ";";
    })(),
};


const NORMALISE = (s) => s.replace(/\r\n?/g, "\n");

// What the results pane says on a share link's first visit (SHARED_MESSAGE), in "no result yet".
const SHARED = "A shared query is in the editor";
const RESTORED = "Your last query is back";
// The summary line of a run that returned rows: "5 rows in 3 ms" (it was "5 rows, took 3 ms").
const ROWS_SUMMARY = /\d[\d,]* rows? in \d+ ms/;

// Copy link puts the link on the clipboard and a toast says "Link copied"; only when the browser
// refuses the clipboard does a popover show the link in a field. These two make the browser refuse
// (writeText rejects, or there is no clipboard API, and the old execCommand("copy") fails too).
async function refuseClipboard(page, { missing = false } = {}) {
    await page.addInitScript((missing) => {
        Object.defineProperty(navigator, "clipboard", {
            configurable: true,
            value: missing ? undefined : { writeText: () => Promise.reject(new DOMException("denied", "NotAllowedError")) },
        });
        document.execCommand = () => false;
    }, missing);
}

// pressing Copy link with the clipboard refused: returns the link the popover shows
async function copyLinkByHand(page, app) {
    await page.locator("#copy-link").click();
    await expect(app.shareField).toBeVisible();
    return app.shareField.inputValue();
}

async function editorText(app) {
    return NORMALISE(await app.editorHost.evaluate((el) => el.value));
}

test.describe("AC4 (share link, the part that exists now)", () => {
    for (const [name, sql] of Object.entries(CASES)) {
        test(`AC4 a copied link restores the SQL in a fresh browser context: ${name}`, async ({
            page,
            app,
            net,
            browser,
            baseURL,
        }) => {
            await app.open("./?utm_source=test"); // a query string on the page must not leak into the link
            await app.editor.fill(sql);
            // What the link carries is the editor's value, so the recipient must see the same value.
            // (In the old contenteditable box, typed blank lines made innerText report an extra
            // newline each, an upstream quirk, see CODEMAP; CodeMirror keeps the text as typed.)
            const sent = NORMALISE(await app.editorHost.evaluate((el) => el.value));
            if (!sql.includes("\n\n")) expect(sent).toBe(NORMALISE(sql));
            const link = await app.copyLink();

            const url = new URL(link);
            expect(url.search).toBe("");
            expect(link.startsWith(baseURL)).toBe(true);
            expect(url.hash.startsWith("#s=")).toBe(true);
            expect(link).not.toContain("utm_source");

            const fresh = await openFresh(browser, baseURL, link);
            try {
                await fresh.app.waitReady().catch(() => {});
                await expect(fresh.app.emptyState).toContainText(SHARED);
                expect(await editorText(fresh.app)).toBe(sent);
                // restored, not run: no table, and no summary line ("5 rows in 3 ms")
                await expect(fresh.app.table).toHaveCount(0);
                await expect(fresh.app.pane).toHaveAttribute("data-state", "empty");
                await expect(fresh.app.summary).toBeHidden();
                await expect(fresh.app.status).not.toContainText(/ in \d+ ms/);
                // the fragment stays, so a reload restores the same state
                expect(new URL(fresh.page.url()).hash).toBe(url.hash);
                await fresh.page.reload();
                await expect(fresh.app.emptyState).toContainText(SHARED);
                expect(await editorText(fresh.app)).toBe(sent);
                // and Run runs it
                await fresh.page.locator("#execute").click();
                await fresh.app.settle();
                await expect(fresh.app.status).toContainText(ROWS_SUMMARY);
                await expect(fresh.app.table).toHaveCount(1);
                expect(fresh.errors).toEqual([]);

                // neither the payload nor the SQL appears in any request URL, on either side
                const payload = url.hash.slice("#s=".length);
                const probes = [payload, sql.slice(0, 24), encodeURIComponent(sql.slice(0, 24)), "O%27Brien"];
                for (const log of [net, fresh.net]) {
                    for (const entry of log.entries) {
                        const u = new URL(entry.url);
                        const sent = u.pathname + u.search;
                        for (const probe of probes) {
                            expect(sent, `${entry.method} ${sent}`).not.toContain(probe);
                        }
                        if (entry.sameOrigin && log === fresh.net) expect(u.search).toBe("");
                    }
                }
            } finally {
                await fresh.context.close();
            }
        });
    }

    test("AC4 blank lines and indentation survive exactly", async ({ app, browser, baseURL }) => {
        const sql = "SELECT 1\n\n\n  FROM (SELECT 2)\n\t-- tab\n\nWHERE 1;";
        await app.open();
        await app.editorHost.evaluate((el, text) => (el.value = text), sql);
        const link = await app.copyLink({ via: "keyboard" });
        const fresh = await openFresh(browser, baseURL, link);
        try {
            await expect(fresh.app.emptyState).toContainText(SHARED);
            expect(await editorText(fresh.app)).toBe(sql);
        } finally {
            await fresh.context.close();
        }
    });

    test("AC4 an empty editor gives a link that opens the dataset with no shared SQL", async ({ app, browser, baseURL }) => {
        await app.open();
        await app.editor.fill("x");
        await app.editor.fill("");
        const link = await app.copyLink();
        const fresh = await openFresh(browser, baseURL, link);
        try {
            await fresh.app.waitReady();
            // the dataset opens as for any visit: an empty editor and "no result yet" (nothing runs
            // on load, there is no table preview any more), and no shared SQL
            await expect(fresh.app.emptyState).toContainText("Run a query to see its result here.");
            await expect(fresh.app.emptyState).not.toContainText("A shared query");
            await expect(fresh.app.result).not.toContainText("A shared query");
            expect((await editorText(fresh.app)).trim()).toBe("");
            await expect(fresh.app.table).toHaveCount(0);
        } finally {
            await fresh.context.close();
        }
    });

    test("AC4 shared SQL wins over the SQL saved in storage", async ({ page, app }) => {
        await app.open();
        await app.query("SELECT 'saved' AS which;");
        await app.editor.fill("SELECT 'shared' AS which;");
        const link = await app.copyLink();
        await app.editor.fill("SELECT 'saved' AS which;");
        await app.run("SELECT 'saved' AS which;");
        await page.goto(link.slice(new URL(page.url()).href.split("#")[0].length));
        await expect(app.emptyState).toContainText(SHARED);
        expect(await editorText(app)).toBe("SELECT 'shared' AS which;");
        // nothing was saved by opening the link
        await page.goto("about:blank");
        await page.goto("./");
        await app.waitReady();
        expect(await editorText(app)).toBe("SELECT 'saved' AS which;");
    });

    test("AC4 all state fields round-trip through the share module", async ({ app }) => {
        await app.open();
        const result = await app.page.evaluate(async () => {
            const share = await import("./bundle/app.js").then((bundle) => bundle.share);
            const sql = "SELECT 'é😀' AS \"q\";\n-- end";
            const out = {};
            share.setShareContext({ dataset: "northlight", set: "retail-basics", exercise: "e01" });
            out.context = share.getShareContext();
            out.url = share.shareUrl(sql, "http://example.test/repo/index.html?x=1#old");
            out.decoded = share.decodeShare(new URL(out.url).hash);
            out.decodedNoHash = share.decodeShare(new URL(out.url).hash.slice(1));
            // the JSON inside the payload: short keys, version 1
            out.json = JSON.parse(
                LZString.decompressFromEncodedURIComponent(new URL(out.url).hash.slice("#s=".length))
            );
            // partial states omit absent fields
            share.setShareContext({ dataset: null, set: undefined, exercise: null });
            out.partialUrl = share.shareUrl("SELECT 1");
            out.partial = share.decodeShare(new URL(out.partialUrl).hash);
            out.partialJson = JSON.parse(
                LZString.decompressFromEncodedURIComponent(new URL(out.partialUrl).hash.slice("#s=".length))
            );
            share.setShareContext({ dataset: "northlight" });
            out.noSql = share.decodeShare(new URL(share.shareUrl("")).hash);
            out.noSqlJson = JSON.parse(
                LZString.decompressFromEncodedURIComponent(new URL(share.shareUrl("")).hash.slice("#s=".length))
            );
            // invalid ids are refused at the setter
            try {
                share.setShareContext({ dataset: "bad id!" });
                out.badSetter = "accepted";
            } catch (e) {
                out.badSetter = e.name;
            }
            out.after = share.getShareContext();
            share.setShareContext({ dataset: null });
            return out;
        });
        expect(result.context).toEqual({ dataset: "northlight", set: "retail-basics", exercise: "e01" });
        expect(result.url.startsWith("http://example.test/repo/index.html#s=")).toBe(true);
        expect(result.url).not.toContain("?");
        expect(result.decoded).toEqual({
            ok: true,
            state: { dataset: "northlight", set: "retail-basics", exercise: "e01", sql: "SELECT 'é😀' AS \"q\";\n-- end" },
        });
        expect(result.decodedNoHash).toEqual(result.decoded);
        expect(result.json).toEqual({
            v: 1,
            d: "northlight",
            x: "retail-basics",
            e: "e01",
            q: "SELECT 'é😀' AS \"q\";\n-- end",
        });
        expect(result.partial).toEqual({ ok: true, state: { sql: "SELECT 1" } });
        expect(result.partialJson).toEqual({ v: 1, q: "SELECT 1" });
        expect(result.noSql).toEqual({ ok: true, state: { dataset: "northlight" } });
        expect(result.noSqlJson).toEqual({ v: 1, d: "northlight" });
        expect(result.badSetter).toBe("RangeError");
        expect(result.after).toEqual({ dataset: "northlight", set: undefined, exercise: undefined });
    });

    test("AC4 the share context set by later milestones reaches the copied link", async ({ app, page }) => {
        await app.open();
        await page.evaluate(async () => {
            const share = await import("./bundle/app.js").then((bundle) => bundle.share);
            share.setShareContext({ dataset: "northlight", set: "retail-basics", exercise: "e03" });
        });
        await app.editor.fill("SELECT 3;");
        const link = await app.copyLink();
        const decoded = await page.evaluate(async (hash) => {
            const share = await import("./bundle/app.js").then((bundle) => bundle.share);
            share.setShareContext({ dataset: null, set: null, exercise: null });
            return share.decodeShare(hash);
        }, new URL(link).hash);
        expect(decoded).toEqual({
            ok: true,
            state: { dataset: "northlight", set: "retail-basics", exercise: "e03", sql: "SELECT 3;" },
        });
    });
});

test.describe("share links that are written loosely", () => {
    // The payload of a real link, built the way copy link builds it.
    const SQL = "SELECT 'LOOSE_LINK_MARK' AS m;";
    const payloadFor = (page, state) =>
        page.evaluate((s) => LZString.compressToEncodedURIComponent(JSON.stringify(s)), state);

    const VARIANTS = {
        "an upper-case S": (p) => `#S=${p}`,
        "an encoded =": (p) => `#s%3D${p}`,
        "an encoded = in capitals": (p) => `#S%3d${p}`,
        "a leading ?": (p) => `#?s=${p}`,
        "a leading space": (p) => `# s=${p}`,
        "a leading encoded space": (p) => `#%20s=${p}`,
    };

    for (const [name, build] of Object.entries(VARIANTS)) {
        test(`${name}: opens as a share link and the payload is never requested or printed`, async ({
            page,
            app,
            net,
        }) => {
            await app.open();
            const payload = await payloadFor(page, { v: 1, q: SQL });
            net.clear();
            await page.goto("about:blank");
            await page.goto("./" + build(payload));
            await expect(app.emptyState).toContainText(SHARED);
            expect(await editorText(app)).toBe(SQL);
            for (const entry of net.entries) {
                const u = new URL(entry.url);
                expect(u.pathname + u.search, `${entry.method} ${entry.url}`).not.toContain(payload.slice(0, 12));
            }
            // nothing on the results pane (the empty state, the live region) prints the payload
            expect(await app.pane.innerText()).not.toContain(payload.slice(0, 12));
            expect(await app.pane.textContent()).not.toContain(payload.slice(0, 12));
        });

        test(`${name}: a payload that does not decode is reported as damaged, never fetched`, async ({
            page,
            app,
            net,
        }) => {
            await app.open();
            const payload = await payloadFor(page, [1, 2, 3, "LOOSE_LINK_MARK"]); // decodes, wrong shape
            const garbage = "LOOSEgarbage1234567890";
            net.clear();
            for (const p of [payload, garbage]) {
                await page.goto("about:blank");
                await page.goto("./" + build(p));
                await expect(app.errorBand).toContainText("This link is damaged or incomplete");
                expect(await app.pane.innerText()).not.toContain(p.slice(0, 12));
                expect(await app.pane.textContent()).not.toContain(p.slice(0, 12));
            }
            for (const entry of net.entries) {
                const u = new URL(entry.url);
                expect(u.pathname + u.search, `${entry.method} ${entry.url}`).not.toMatch(/LOOSE|N4Ig|%20s=|\/s=|\/S=/);
            }
            expect(await app.query("SELECT 5 AS five;")).toEqual({ columns: ["five"], rows: [["5"]] });
        });
    }

    test("the share module reads these starts and nothing else as a share link", async ({ app, page }) => {
        await app.open();
        const out = await page.evaluate(async () => {
            const { isShareFragment } = await import("./bundle/app.js").then((bundle) => bundle.share);
            const yes = ["#s=a", "s=a", "#S=a", "#s%3da", "#S%3Da", "#?s=a", "# s=a", "#%20s=a", "#%20%20?s=a"];
            const no = ["", "#", "#s", "#demo.db", "#sales.db", "#ss=a", "#xs=a", "#https://x.test/s=a", "#a/s=b", null, 5];
            return { yes: yes.map(isShareFragment), no: no.map(isShareFragment) };
        });
        expect(out.yes.every(Boolean)).toBe(true);
        expect(out.no.some(Boolean)).toBe(false);
    });
});

test.describe("shared SQL and storage", () => {
    test("renaming the database after opening a link does not save the unrun shared SQL", async ({ page, app }) => {
        await app.open();
        const payload = await page.evaluate(() =>
            LZString.compressToEncodedURIComponent(JSON.stringify({ v: 1, q: "SELECT 'SECRET_SHARED';" }))
        );
        await page.goto("about:blank");
        await page.goto(`./#s=${payload}`);
        await expect(app.emptyState).toContainText(SHARED);
        expect(await app.storedQueries()).toEqual([]);

        await app.rename("mine.db");
        expect(await app.storedQueries()).toEqual([]);
        // the link's SQL is still in the editor, and a reload does not turn it into "your last query"
        expect(await editorText(app)).toBe("SELECT 'SECRET_SHARED';");
        await page.goto("about:blank");
        await page.goto("./");
        await app.waitReady();
        await expect(app.emptyState).toContainText("Run a query to see its result here.");
        await expect(app.result).not.toContainText(RESTORED);
    });

    test("a link opened over saved SQL: renaming moves the saved SQL, not the shared SQL", async ({ page, app }) => {
        await app.open();
        await app.query("SELECT 'MINE' AS who;");
        const payload = await page.evaluate(() =>
            LZString.compressToEncodedURIComponent(JSON.stringify({ v: 1, q: "SELECT 'SECRET_SHARED';" }))
        );
        await page.goto(`./#s=${payload}`);
        await expect(app.emptyState).toContainText(SHARED);
        await app.rename("other.db");
        expect(await app.storedQueries()).toEqual([["sqlime.query.other.db", "SELECT 'MINE' AS who;"]]);
    });

    test("a link made from a blank or whitespace-only editor carries no SQL", async ({ page, app }) => {
        await app.open(NORTHLIGHT_URL);
        await app.editor.fill("x");
        for (const blank of ["", "   ", "\n\n  \t\n"]) {
            await app.editorHost.evaluate((el, text) => (el.value = text), blank);
            const link = await app.copyLink();
            const json = await page.evaluate(
                (hash) => JSON.parse(LZString.decompressFromEncodedURIComponent(hash.slice("#s=".length))),
                new URL(link).hash
            );
            // the dataset id is there, the SQL is not
            expect(json).toEqual({ v: 1, d: "northlight" });
        }
    });

    test("a link whose SQL is only whitespace restores the recipient's own saved SQL", async ({ page, app }) => {
        // these links name no dataset, so the default opens and its saved SQL is the one restored
        await page.addInitScript((file) => {
            try {
                localStorage.setItem(`sqlime.query.${file}`, "SELECT 'RECIPIENT_OWN';");
            } catch {}
        }, path.posix.basename(DEFAULT_DATASET.file));
        await app.open();
        for (const q of ["\n", "  \n ", undefined]) {
            const payload = await page.evaluate(
                (state) => LZString.compressToEncodedURIComponent(JSON.stringify(state)),
                q === undefined ? { v: 1 } : { v: 1, q }
            );
            await page.goto("about:blank");
            await page.goto(`./#s=${payload}`);
            await expect(app.emptyState).toContainText(RESTORED);
            await expect(app.result).not.toContainText("A shared query");
            expect(await editorText(app)).toBe("SELECT 'RECIPIENT_OWN';");
        }
    });

    test("a link whose SQL is only whitespace and no saved SQL opens as a plain start", async ({ page, app }) => {
        await app.open();
        const payload = await page.evaluate(() =>
            LZString.compressToEncodedURIComponent(JSON.stringify({ v: 1, d: "northlight", q: "\n" }))
        );
        await page.goto("about:blank");
        await page.goto(`./#s=${payload}`);
        await app.waitReady();
        await expect(app.emptyState).toContainText("Run a query to see its result here.");
        await expect(app.result).not.toContainText("A shared query");
        await expect(app.result).not.toContainText("damaged");
    });
});

test.describe("damaged links", () => {
    // Builds a fragment from raw JSON text, the way a real link is made.
    const compress = (page, text) =>
        page.evaluate((t) => "#s=" + LZString.compressToEncodedURIComponent(t), text);

    test("every kind of damaged link gives a clear message, no exception and a working app", async ({
        page,
        app,
        pageErrors,
    }) => {
        await app.open();
        const big = await page.evaluate(() => "#s=" + "A".repeat(100001));
        const bomb = await page.evaluate(() => {
            // a few KB that expand to more than the allowed size
            return "#s=" + LZString.compressToEncodedURIComponent(JSON.stringify({ v: 1, q: "a".repeat(3000000) }));
        });
        // the oversize text is outside q, so only the size check on the decompressed JSON
        // (SHARE_MAX_JSON_CHARS) stops it
        const bombOutsideSql = await compress(
            page,
            JSON.stringify({ v: 1, q: "SELECT 1", pad: "a".repeat(500000) })
        );
        const damaged = {
            "empty payload": "#s=",
            "characters outside the alphabet": "#s=<script>alert(1)</script>",
            "malformed percent escape": "#s=%E0%A4%A",
            "not compressed data": "#s=hello",
            "compressed but not JSON": await compress(page, "SELECT 1"),
            "a JSON array": await compress(page, "[1,2,3]"),
            "a JSON string": await compress(page, '"v"'),
            "JSON null": await compress(page, "null"),
            "no version": await compress(page, '{"q":"SELECT 1"}'),
            "wrong version": await compress(page, '{"v":2,"q":"SELECT 1"}'),
            "version as a string": await compress(page, '{"v":"1","q":"SELECT 1"}'),
            "SQL of the wrong type": await compress(page, '{"v":1,"q":123}'),
            "SQL as an object": await compress(page, '{"v":1,"q":{"a":1}}'),
            "dataset id of the wrong type": await compress(page, '{"v":1,"d":42}'),
            "dataset id with bad characters": await compress(page, '{"v":1,"d":"a b"}'),
            "set id with markup": await compress(page, '{"v":1,"x":"<img src=x onerror=1>"}'),
            "exercise id too long": await compress(page, JSON.stringify({ v: 1, e: "e".repeat(65) })),
            "empty id": await compress(page, '{"v":1,"d":""}'),
            "payload over the size limit": big,
            "a decompression bomb": bomb,
            "a decompression bomb outside the SQL field": bombOutsideSql,
        };
        for (const [name, fragment] of Object.entries(damaged)) {
            await page.goto("about:blank");
            await page.goto("./" + fragment);
            await expect(app.errorBand, name).toContainText("This link is damaged or incomplete");
            // the default database is open (nothing in the link could be trusted)
            await expect(app.databaseLabel, name).toHaveText(DEFAULT_DATASET.name);
            await expect(app.picker, name).toHaveAttribute("aria-label", `Database: ${DEFAULT_DATASET.name}`);
            // the app still works
            expect(await app.query("SELECT 5 AS five;"), name).toEqual({ columns: ["five"], rows: [["5"]] });
        }
        expect(pageErrors).toEqual([]);
    });

    test("the share module returns a failure value for hostile input and never throws", async ({ app, page }) => {
        await app.open();
        const results = await page.evaluate(async () => {
            const { decodeShare } = await import("./bundle/app.js").then((bundle) => bundle.share);
            const inputs = [undefined, null, 5, {}, [], "", "#", "#s", "#s=", "s=", "#S=abc", "#s=%", "#s=\u0000", "#s=" + "z".repeat(200)];
            return inputs.map((input) => {
                try {
                    return decodeShare(input);
                } catch (e) {
                    return { threw: String(e) };
                }
            });
        });
        for (const r of results) {
            expect(r.threw).toBeUndefined();
            expect(r.ok).toBe(false);
            expect(typeof r.reason).toBe("string");
        }
    });

    test("decodeShare rejects oversize JSON before parsing it, whichever field holds the text", async ({ app, page }) => {
        await app.open();
        const out = await page.evaluate(async () => {
            const { decodeShare } = await import("./bundle/app.js").then((bundle) => bundle.share);
            const hash = (state) => "#s=" + LZString.compressToEncodedURIComponent(JSON.stringify(state));
            const parse = JSON.parse;
            let parsed = 0;
            JSON.parse = (...args) => (parsed++, parse(...args));
            try {
                return {
                    bomb: decodeShare(hash({ v: 1, q: "SELECT 1", pad: "a".repeat(500000) })),
                    bombParsed: parsed,
                    fine: decodeShare(hash({ v: 1, q: "SELECT 1", pad: "a".repeat(1000) })),
                };
            } finally {
                JSON.parse = parse;
            }
        });
        expect(out.bomb).toEqual({ ok: false, reason: "payload" });
        expect(out.bombParsed).toBe(0);
        expect(out.fine).toEqual({ ok: true, state: { sql: "SELECT 1" } });
    });

    test("a damaged link's text is never turned into markup", async ({ page, app }) => {
        await app.open();
        await page.goto("./#s=%3Cimg%20id=pwn%20src=x%20onerror=window.__pwned=1%3E");
        await expect(app.errorBand).toContainText("damaged");
        await app.expectInert();
    });
});

test.describe("opening a link in an open tab", () => {
    test("pasting a link into an already-open tab restores it", async ({ page, app, browser, baseURL }) => {
        // make a link elsewhere
        await app.open();
        await app.editor.fill("SELECT 'from the link' AS src;");
        const link = await app.copyLink();

        // the "open tab": it has its own session, a result on screen and other SQL
        const other = await browser.newContext({ baseURL });
        try {
            const tab = await other.newPage();
            const tabApp = new (require("./helpers").App)(tab);
            await tabApp.open();
            expect(await tabApp.query("SELECT 'old' AS src;")).toEqual({ columns: ["src"], rows: [["old"]] });

            // pasting into the address bar and pressing Enter is a navigation to the same
            // document with a different fragment
            await tab.goto(link.slice(baseURL.length));
            await expect(tabApp.emptyState).toContainText(SHARED);
            expect(await editorText(tabApp)).toBe("SELECT 'from the link' AS src;");
            await expect(tabApp.table).toHaveCount(0);

            await tab.locator("#execute").click();
            await tabApp.settle();
            expect(await tabApp.read()).toEqual({ columns: ["src"], rows: [["from the link"]] });

            // a damaged link pasted afterwards is reported and the app keeps working
            await tab.goto("./#s=garbage");
            await expect(tabApp.errorBand).toContainText("damaged");
            expect(await tabApp.query("SELECT 9 AS n;")).toEqual({ columns: ["n"], rows: [["9"]] });
        } finally {
            await other.close();
        }
    });

    test("a database path in the address still loads as before", async ({ page, app }) => {
        await page.goto("./#datasets/northlight_retail.db");
        // the database opens and nothing runs: "no result yet" with the first table as a sample
        // (it used to open on a table preview, or say "Press Run")
        await app.waitReady();
        await expect(app.pane).toHaveAttribute("data-state", "empty");
        await expect(app.samples.first()).toContainText("First 10 rows of");
        // a file path, not a course database: the switcher names the file instead
        expect(await app.pickedText()).toBe("northlight_retail.db");
    });
});

test.describe("the copy link button", () => {
    test("when the browser keeps the clipboard, it shows the link in a read-only focusable field with the text selected", async ({
        page,
        app,
    }) => {
        await refuseClipboard(page);
        await app.open();
        await app.editor.fill("SELECT 1;");
        const link = await copyLinkByHand(page, app);
        const field = app.shareField;
        await expect(field).toHaveAttribute("readonly", "");
        await expect(field).toBeFocused();
        const sel = await field.evaluate((el) => ({ start: el.selectionStart, end: el.selectionEnd, len: el.value.length }));
        expect(sel).toEqual({ start: 0, end: link.length, len: link.length });
        expect(link.length).toBeGreaterThan(20);
        expect(link).toContain("#s=");
        // the button is usable again afterwards
        await expect(page.locator("#copy-link")).toBeEnabled();
    });

    test("it writes the link to the clipboard and a toast says so", async ({ context, app, page, baseURL, browserName }) => {
        test.skip(browserName !== "chromium", "only Chromium lets a test grant clipboard permission");
        await context.grantPermissions(["clipboard-read", "clipboard-write"]);
        await app.open();
        await app.editor.fill("SELECT 'clip';");
        // the real clipboard (app.copyLink() stubs it), so the link is read back from it
        await page.locator("#copy-link").click();
        await expect(app.toast).toContainText("Link copied");
        const copied = await page.evaluate(() => navigator.clipboard.readText());
        expect(copied.startsWith(baseURL)).toBe(true);
        expect(copied).toContain("#s=");
        // it is the link of the editor's SQL
        const expected = await page.evaluate(async () => {
            const share = await import("./bundle/app.js").then((bundle) => bundle.share);
            return share.shareUrl(document.querySelector("#editor").value);
        });
        expect(copied).toBe(expected);
        // the link is on the clipboard, not in the fallback popover's field (the field is always in
        // the page, built hidden, and only shown for a refused clipboard)
        await expect(app.shareField).toBeHidden();
    });

    test("when the clipboard refuses, the link is still there to copy by hand", async ({ page, app }) => {
        await refuseClipboard(page);
        await app.recordToasts({ fromStart: true });
        await app.open();
        await app.editor.fill("SELECT 'refused';");
        const link = await copyLinkByHand(page, app);
        await expect(page.locator("#copy-link-popover")).toContainText("The browser did not let the page copy it");
        // no "Link copied" for a link that was not copied: no toast at all, recorded for as long
        // as one would take to come
        await app.expectToasts([]);
        await expect(app.shareField).toBeFocused();
        expect(link).toContain("#s=");
    });

    test("without a clipboard API the link is still shown", async ({ page, app }) => {
        await refuseClipboard(page, { missing: true });
        await app.open();
        await app.editor.fill("SELECT 'none';");
        const link = await copyLinkByHand(page, app);
        expect(link).toContain("#s=");
        await expect(app.shareField).toBeFocused();
    });

    test("a query too long for a link says so instead of producing a broken link", async ({ page, app }) => {
        await app.open();
        // incompressible text beyond the payload limit
        const big = await page.evaluate(() => {
            let s = "";
            let seed = 7;
            while (s.length < 160000) {
                seed = (seed * 1103515245 + 12345) & 0x7fffffff;
                s += String.fromCharCode(0x4e00 + (seed % 20000));
            }
            return "-- " + s;
        });
        await page.evaluate((text) => {
            document.querySelector("#editor").value = text;
        }, big);
        await page.locator("#copy-link").click();
        await expect(app.toast).toContainText("too long to put in a link");
        // no link, so no popover with a field either (it is built hidden and stays so)
        await expect(app.shareField).toBeHidden();
    });

    test("it works with the keyboard alone", async ({ page, app, browser, baseURL }) => {
        await app.open();
        await expect(app.editor).toBeFocused();
        await app.stubClipboard();
        await page.keyboard.press("Control+A"); // harmless: the editor starts empty
        await page.keyboard.type("SELECT 'keys' AS k;");
        // run it, so a result (and its Download CSV button) is on screen
        await page.keyboard.press("Control+Enter");
        await app.settle();
        await expect(app.pane).toHaveAttribute("data-state", "result");
        // out of the editor with Escape, then back up the Tab order with Shift+Tab (Run, the
        // sidebar's stops, the top bar) until Copy link; keys only
        await page.keyboard.press("Escape");
        await page.keyboard.press("Shift+Tab");
        await expect(page.locator("#execute")).toBeFocused();
        expect(await tabTo(page, "#copy-link", { back: true }), "copy link is reachable by Shift+Tab from the editor").toBe(true);
        await page.keyboard.press("Enter");
        await expect(app.toast).toContainText("Link copied");
        await expect(page.locator("#copy-link")).toBeFocused();
        const link = await page.evaluate(() => window.__copied.at(-1));
        expect(link).toContain("#s=");
        // the link is on the clipboard, so there is no field to land on. A result is on screen, so
        // the Download CSV button (M5) is in the Tab order: forward to it with keys (leaving the
        // editor with Escape on the way, as Tab indents there), back up to the editor with
        // Shift+Tab, out of it with Escape and up to Copy link again, and Space on it copies too.
        let reached = false;
        for (let i = 0; i < 80 && !reached; i++) {
            if (await page.evaluate(() => document.activeElement?.matches("#download-csv"))) {
                reached = true;
            } else {
                if (await page.evaluate((s) => document.activeElement?.matches(s), EDITOR_INPUT)) {
                    await page.keyboard.press("Escape");
                }
                await page.keyboard.press("Tab");
            }
        }
        expect(reached, "Download CSV is reachable by Tab from Copy link").toBe(true);
        expect(await tabTo(page, EDITOR_INPUT, { back: true }), "Shift+Tab from the result reaches the editor").toBe(true);
        await page.keyboard.press("Escape");
        expect(await tabTo(page, "#copy-link", { back: true }), "copy link is reachable by Shift+Tab from the result").toBe(true);
        await page.keyboard.press("Space");
        await expect.poll(() => page.evaluate(() => window.__copied.length)).toBe(2);
        expect(await page.evaluate(() => window.__copied.at(-1))).toBe(link);

        const fresh = await openFresh(browser, baseURL, link);
        try {
            await expect(fresh.app.emptyState).toContainText(SHARED);
            expect(await editorText(fresh.app)).toBe("SELECT 'keys' AS k;");
        } finally {
            await fresh.context.close();
        }
    });
});

test("AC6 a session that loads, runs, copies a link and opens it makes zero non-same-origin requests", async ({
    page,
    app,
    net,
    context,
    baseURL,
}) => {
    await app.open();
    await app.query("SELECT 1 AS one, 'two' AS two;");
    const link = await app.copyLink();

    const second = await context.newPage();
    await second.goto(link.slice(baseURL.length));
    await expect(second.locator("#result .results-empty")).toContainText(SHARED);
    await second.locator("#execute").click();
    await second.evaluate(() => window.app.whenIdle());
    await expect(second.locator("#status")).toContainText(ROWS_SUMMARY);
    // and a damaged one
    await second.goto("./#s=garbage");
    await expect(second.locator("#result .results-band")).toContainText("damaged");

    expect(net.network.length, "the session really made requests").toBeGreaterThan(5);
    net.expectNoExternalRequests();
    net.expectNoSameOriginFailures();
    expect(net.paths.some((p) => p.includes("lz-string"))).toBe(true);
});
