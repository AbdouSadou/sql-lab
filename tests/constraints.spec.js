// Fixes from the constraints review: the engine's address overrides, rich content dropped or
// pasted into the editor and the export dialog's file name, .sql scripts and the SQL guard, and phone text entry.
const { test, expect, serveRepoAt } = require("./helpers");

const LZString = require("../vendor/lz-string.min.js");
const shareHash = (state) => "#s=" + LZString.compressToEncodedURIComponent(JSON.stringify({ v: 1, ...state }));

// ---- 1. engine-guard.js: vendor/sqlite3.js reads sqlite3.* parameters from the address ----

const ELSEWHERE = "https://engine.elsewhere.example/";
const enc = encodeURIComponent;

test.describe("engine address overrides", () => {
    const CASES = [
        ["sqlite3.dir", `?sqlite3.dir=${ELSEWHERE}`, ""],
        ["sqlite3.wasm", `?sqlite3.wasm=${ELSEWHERE}sqlite3.wasm`, ""],
        ["encoded value", `?sqlite3.dir=${enc(ELSEWHERE)}`, ""],
        ["encoded name (digit)", `?sqlite%33.dir=${ELSEWHERE}`, ""],
        ["encoded name (dot)", `?sqlite3%2Edir=${ELSEWHERE}`, ""],
        ["encoded name (first letter)", `?%73qlite3.wasm=${enc(ELSEWHERE + "x.wasm")}`, ""],
        ["debug flag", `?sqlite3.debugModule=1`, ""],
        ["both", `?sqlite3.dir=${ELSEWHERE}&sqlite3.wasm=${ELSEWHERE}x.wasm`, ""],
        ["with db", `?db=northlight&sqlite3.dir=${ELSEWHERE}`, "?db=northlight"],
        ["db either side", `?db=northlight&sqlite3.wasm=${ELSEWHERE}x.wasm&set=retail-basics`, "?db=northlight&set=retail-basics"],
        ["a repeated name", `?sqlite3.dir=${ELSEWHERE}&db=northlight&sqlite3.dir=${ELSEWHERE}2`, "?db=northlight"],
        ["other encodings stay as written", `?sqlite3.dir=${ELSEWHERE}&db=north%6Cight&x=a+b%7E`, "?db=north%6Cight&x=a+b%7E"],
    ];

    for (const [label, search, kept] of CASES) {
        test(`${label}: no request leaves the origin, the app works, the parameter is gone`, async ({ page, app, net }) => {
            await page.route(/^https?:\/\/[^/]*\.example\//, (route) => route.abort());
            await app.open(search);
            expect(await app.query("SELECT 1 + 1 AS two;")).toEqual({ columns: ["two"], rows: [["2"]] });
            net.expectNoExternalRequests();
            net.expectNoSameOriginFailures();
            const url = new URL(page.url());
            expect(url.search).toBe(kept);
            expect(url.hash).toBe("");
        });
    }

    test("the share fragment survives and still restores its SQL", async ({ page, app, net }) => {
        const hash = shareHash({ d: "northlight", q: "select 'shared' as s" });
        await page.goto(`./?db=northlight&sqlite3.dir=${enc(ELSEWHERE)}${hash}`);
        await expect(app.status).toContainText("Press Run");
        expect(await app.editor.innerText()).toContain("select 'shared' as s");
        net.expectNoExternalRequests();
        const url = new URL(page.url());
        expect(url.search).toBe("?db=northlight");
        expect(url.hash).toBe(hash);
    });

    test("a clean address is not touched: no replaceState call, same history length", async ({ page, app }) => {
        await page.addInitScript(() => {
            window.__replaced = 0;
            const original = History.prototype.replaceState;
            History.prototype.replaceState = function () {
                window.__replaced++;
                return original.apply(this, arguments);
            };
        });
        const hash = shareHash({ d: "northlight", q: "select 1" });
        await page.goto(`./?db=northlight&sqlite4.dir=x&sqlite3=1${hash}`);
        await expect(app.status).toContainText("Press Run");
        expect(await page.evaluate(() => window.__replaced)).toBe(0);
        expect(new URL(page.url()).search).toBe("?db=northlight&sqlite4.dir=x&sqlite3=1");
        expect(new URL(page.url()).hash).toBe(hash);
    });

    test("cleaning the address adds no history entry", async ({ page, app }) => {
        await app.open("./?db=northlight");
        const clean = await page.evaluate(() => history.length);
        await app.open(`./?sqlite3.dir=${enc(ELSEWHERE)}`);
        expect(await page.evaluate(() => history.length)).toBe(clean + 1); // the one navigation, no extra entry
        expect(new URL(page.url()).search).toBe("");
    });
});

// What js/lab/engine-guard.js does besides dropping the parameter, pinned on a page of its own: the
// app rewrites history.state and the console during start-up, so only a minimal page that loads
// nothing but the guard can show that the guard itself keeps them.
test.describe("engine-guard.js on its own", () => {
    const FIXTURE = /\/guard-fixture\.html(\?.*)?$/;
    // `before` is script that runs ahead of the guard
    const servePage = (page, before = "") =>
        page.route(FIXTURE, (route) =>
            route.fulfill({
                contentType: "text/html",
                body: `<!doctype html><title>guard</title>
<script>
${before}
history.replaceState({ k: 1 }, "");
// a console.warn that collects: the guard binds the one it finds when it loads
window.__warned = [];
console.warn = (...args) => window.__warned.push(args);
</script>
<script src="js/lab/engine-guard.js"></script>`,
            })
        );

    test("the engine's other warnings reach the console whole; the step warning is cut to its result code", async ({ page }) => {
        await servePage(page);
        await page.goto("./guard-fixture.html");
        const warned = await page.evaluate(() => {
            const warn = window.sqlite3ApiConfig.warn;
            warn("some other warning", 1, "two", { three: 3 }, "four");
            warn("sqlite3_step() rc=", 1, "SQLITE_ERROR", "SQL =", "select the_answer from model");
            warn("sqlite3_step() rc=", 5, "SQLITE_BUSY");
            warn("sqlite3_step() rc= not the exact first argument", 1, "SQLITE_ERROR", "SQL =", "kept");
            return window.__warned;
        });
        expect(warned).toEqual([
            ["some other warning", 1, "two", { three: 3 }, "four"],
            ["sqlite3_step() rc=", 1, "SQLITE_ERROR"],
            ["sqlite3_step() rc=", 5, "SQLITE_BUSY"],
            ["sqlite3_step() rc= not the exact first argument", 1, "SQLITE_ERROR", "SQL =", "kept"],
        ]);
    });

    test("an engine configuration the page already holds is kept, with the warning added to it", async ({ page }) => {
        await servePage(page, "window.sqlite3ApiConfig = { keep: 1, print: 'mine' };");
        await page.goto("./guard-fixture.html");
        const config = await page.evaluate(() => ({
            keep: window.sqlite3ApiConfig.keep,
            print: window.sqlite3ApiConfig.print,
            warn: typeof window.sqlite3ApiConfig.warn,
        }));
        expect(config).toEqual({ keep: 1, print: "mine", warn: "function" });
    });

    test("the history state survives the rewrite of the address", async ({ page }) => {
        await servePage(page);
        await page.goto(`./guard-fixture.html?db=northlight&sqlite3.dir=${enc(ELSEWHERE)}#frag`);
        expect(await page.evaluate(() => history.state)).toEqual({ k: 1 });
        const url = new URL(page.url());
        expect(url.search).toBe("?db=northlight");
        expect(url.hash).toBe("#frag");
        // and with only the engine parameter: the address loses it, the state stays
        await page.goto(`./guard-fixture.html?sqlite3.dir=x`);
        expect(await page.evaluate(() => history.state)).toEqual({ k: 1 });
        expect(new URL(page.url()).search).toBe("");
    });
});

// A page path that starts with "//" (a root-hosted site whose server maps it to the index):
// replaceState("//?...") is a scheme-relative address for another host and throws, so the guard
// must build the new address from the whole current URL. The repo's own test server answers
// those paths with 404, so the site is served by a route on a made-up origin instead.
test.describe("engine address overrides on a doubled-slash path", () => {
    const SITE = "http://root-site.example";
    const OTHER = "http://engine-elsewhere.example";
    const PATHS = ["//", "///", "//index.html"];
    const hash = shareHash({ d: "northlight", q: "select 'shared' as s" });

    for (const lead of PATHS) {
        test(`${lead}?sqlite3.dir=...: no request to the other host, the parameter is gone`, async ({ page, app }, testInfo) => {
            test.skip(testInfo.project.name.endsWith("subpath"), "the made-up origin is the same for both mounts");
            const requested = serveRepoAt(page, SITE);
            const foreign = [];
            await page.route(new RegExp(`^${OTHER}/`), (route) => {
                foreign.push(route.request().url());
                return route.abort();
            });
            await page.goto(`${SITE}${lead}?db=northlight&sqlite3.dir=${OTHER}&sqlite3.wasm=${OTHER}/a.wasm${hash}`);
            await app.waitReady();
            expect(await app.editor.innerText()).toContain("select 'shared' as s");
            expect(foreign).toEqual([]);
            expect(requested.some((p) => p.endsWith("vendor/sqlite3.js"))).toBe(true);
            expect(requested.some((p) => p.endsWith("sqlite3.wasm"))).toBe(true);
            const url = new URL(page.url());
            expect(url.pathname).toBe(lead);
            expect(url.search).toBe("?db=northlight");
            expect(url.hash).toBe(hash);
        });
    }

    test("a guard that cannot rewrite the address stops the page before the engine reads it", async ({ page }, testInfo) => {
        test.skip(testInfo.project.name.endsWith("subpath"), "the made-up origin is the same for both mounts");
        serveRepoAt(page, SITE);
        const foreign = [];
        await page.route(new RegExp(`^${OTHER}/`), (route) => {
            foreign.push(route.request().url());
            return route.abort();
        });
        await page.addInitScript(() => {
            History.prototype.replaceState = function () {
                throw new DOMException("refused", "SecurityError");
            };
        });
        await page.goto(`${SITE}/?sqlite3.dir=${OTHER}`, { waitUntil: "commit" });
        // a stopped page never fires "load"
        await page.waitForFunction(() => document.readyState === "complete");
        expect(foreign).toEqual([]);
        expect(await page.evaluate(() => typeof window.sqlite3InitModule)).toBe("undefined");
    });
});

// ---- 4. phone keyboards ----

test("the SQL editor switches autocorrect and autocapitalize off", async ({ app }) => {
    await app.open();
    await expect(app.editor).toHaveAttribute("autocorrect", "off");
    await expect(app.editor).toHaveAttribute("autocapitalize", "off");
    await expect(app.editor).toHaveAttribute("spellcheck", "false");
});

// ---- 3. .sql scripts go through the SQL guard (js/sqlite/manager.js fromSql -> runSql) ----

test.describe("sql scripts and the guard", () => {
    const sqlFile = (name, sql) => ({ name, mimeType: "text/plain", buffer: Buffer.from(sql) });
    const FAILED = "Failed to load database from sql script";

    test("a normal script still loads: views, triggers, comments, BEGIN/COMMIT", async ({ app }) => {
        await app.open();
        await app.upload(
            sqlFile(
                "normal.sql",
                `-- a note; with a semicolon
                BEGIN;
                CREATE TABLE item (id INTEGER PRIMARY KEY, label TEXT); /* block; comment */
                CREATE TABLE audit (note TEXT);
                CREATE TRIGGER item_ai AFTER INSERT ON item BEGIN
                    INSERT INTO audit VALUES ('added ' || new.label);
                    INSERT INTO audit VALUES ('second; statement');
                END;
                CREATE VIEW labels AS SELECT label FROM item;
                INSERT INTO item (label) VALUES ('semi;colon'), ('plain');
                COMMIT;
                -- trailing note`
            )
        );
        expect((await app.query("SELECT note FROM audit ORDER BY rowid;")).rows).toEqual([
            ["added semi;colon"],
            ["second; statement"],
            ["added plain"],
            ["second; statement"],
        ]);
        expect((await app.query("SELECT label FROM labels ORDER BY label;")).rows).toEqual([["plain"], ["semi;colon"]]);
        expect(await app.page.evaluate(() => window.app.database.name)).toBe("normal.sql");
    });

    const REFUSED = [
        ["PRAGMA hard_heap_limit", "CREATE TABLE t (a); PRAGMA hard_heap_limit = 4096;", /not authorized/],
        ["PRAGMA soft_heap_limit", "PRAGMA soft_heap_limit = 4096; CREATE TABLE t (a);", /not authorized/],
        ["ATTACH of a file", "CREATE TABLE t (a); ATTACH 'leak.db' AS leak; CREATE TABLE leak.x (a);", /not authorized/],
        ["VACUUM INTO", "CREATE TABLE t (a); INSERT INTO t VALUES (1); VACUUM INTO 'copy.db';", /VACUUM INTO/i],
        ["VACUUM main INTO", "CREATE TABLE t (a); VACUUM main INTO 'copy.db';", /VACUUM INTO/i],
        ["VACUUM with a comment before INTO", "CREATE TABLE t (a); VACUUM /* x */ INTO 'copy.db';", /VACUUM INTO/i],
        ["VACUUM with a comment in place of the blank", "CREATE TABLE t (a); VACUUM/**/INTO 'copy.db';", /VACUUM INTO/i],
        ["VACUUM with a line comment before INTO", "CREATE TABLE t (a); VACUUM -- note\n INTO 'copy.db';", /VACUUM INTO/i],
    ];

    for (const [label, sql, message] of REFUSED) {
        test(`an uploaded script with ${label} is refused, and a Run works afterwards`, async ({ app }) => {
            await app.open();
            await app.upload(sqlFile("evil.sql", sql), { ready: false });
            await expect(app.status).toContainText(FAILED);
            await expect(app.status).toContainText(message);
            // the database that was open stays open and usable
            expect((await app.query("SELECT 41 + 1 AS answer;")).rows).toEqual([["42"]]);
            // and a later script still loads: no heap limit, no leftover file
            await app.upload(sqlFile("fine.sql", "CREATE TABLE ok (a); INSERT INTO ok VALUES (7);"));
            expect((await app.query("SELECT a FROM ok;")).rows).toEqual([["7"]]);
        });
    }

    test("a plain VACUUM that only mentions INTO in a comment or a name still loads", async ({ app }) => {
        await app.open();
        const scripts = [
            "CREATE TABLE t (a); VACUUM /* into */;",
            "CREATE TABLE t (a); VACUUM -- into a file\n;",
            "CREATE TABLE t (a); VACUUM /* unterminated into",
            "CREATE TABLE t (a); INSERT INTO t VALUES (1); VACUUM main; -- into",
        ];
        for (const [i, script] of scripts.entries()) {
            await app.upload(sqlFile(`vacuum${i}.sql`, script));
            expect((await app.query("SELECT count(*) AS n FROM sqlite_master WHERE name = 't';")).rows).toEqual([["1"]]);
        }
    });

    test("an open-from-URL script is guarded too", async ({ page, app }) => {
        await page.route(/\/scripts\/evil\.sql$/, (route) =>
            route.fulfill({ contentType: "text/plain", body: "PRAGMA hard_heap_limit = 4096; CREATE TABLE t (a);" })
        );
        await app.open();
        await page.evaluate(() => (location.hash = "#scripts/evil.sql"));
        await expect(app.status).toContainText("Failed to load database from");
        await expect(app.status).toContainText("not authorized");
        expect((await app.query("SELECT 5 AS five;")).rows).toEqual([["5"]]);
    });

    test("a statement that fails in the script shows the engine's message", async ({ app }) => {
        await app.open();
        await app.upload(sqlFile("broken.sql", "CREATE TABLE t (a); INSERT INTO nowhere VALUES (1);"), { ready: false });
        await expect(app.status).toContainText(`${FAILED}:`);
        await expect(app.status).toContainText("no such table: nowhere");
    });
});

// ---- 2. only text/plain enters the file name of the export dialog and the SQL editor ----

test.describe("plain text only", () => {
    const TRACKER = "https://tracker.example/";
    const RICH = `<b>bold</b><img src="${TRACKER}pixel.png"><iframe src="${TRACKER}frame"></iframe><form action="${TRACKER}f"><input name="x"></form>`;

    test.beforeEach(async ({ page }) => {
        await page.route(/^https?:\/\/[^/]*\.example\//, (route) => route.abort());
    });

    // a draggable element whose drag carries the given data, the way another page or program would
    // (`parent` is where the source goes: inside the export dialog while it is open, because the rest
    // of the page is inert behind a modal dialog)
    async function addDragSource(page, data, parent = "body") {
        await page.evaluate(([data, parent]) => {
            const source = document.createElement("div");
            source.id = "drag-source";
            source.draggable = true;
            source.textContent = "drag me";
            source.style.cssText = "position:fixed;right:12px;bottom:70px;padding:8px;background:#ddd;z-index:9999";
            source.addEventListener("dragstart", (event) => {
                for (const [type, value] of Object.entries(data)) event.dataTransfer.setData(type, value);
                event.dataTransfer.effectAllowed = "copy";
            });
            document.querySelector(parent).append(source);
        }, [data, parent]);
    }

    // openExportName opens the Export menu's "Database (.db)…" dialog and returns its file name
    // input (the name of the open database, selected). It replaced the editable name of the header.
    async function openExportName(app) {
        await app.openExportMenu();
        await app.exportButton.click();
        const field = app.page.locator("#export-name");
        await expect(field).toBeVisible();
        return field;
    }

    // the point (relative to the padding box of the text input `field`) at the left edge of the
    // character at `offset`; an input has no text node to measure, so the text is measured with its font
    function inputPointAt(field, offset) {
        return field.evaluate((el, offset) => {
            const style = getComputedStyle(el);
            const context = document.createElement("canvas").getContext("2d");
            context.font = `${style.fontStyle} ${style.fontWeight} ${style.fontSize} ${style.fontFamily}`;
            const width = context.measureText(el.value.slice(0, offset)).width;
            return { x: parseFloat(style.paddingLeft) + width, y: el.clientHeight / 2 };
        }, offset);
    }

    // copyRich makes a real copy (Ctrl+C) whose clipboard carries the given html and plain text,
    // the way another page or program would put them there
    async function copyRich(page, html, text) {
        await page.evaluate(
            ([html, text]) => {
                const source = document.createElement("div");
                source.id = "rich-source";
                source.textContent = "copy source";
                document.body.append(source);
                document.addEventListener(
                    "copy",
                    (event) => {
                        event.clipboardData.setData("text/html", html);
                        event.clipboardData.setData("text/plain", text);
                        event.preventDefault();
                    },
                    { once: true }
                );
                const range = document.createRange();
                range.selectNodeContents(source);
                getSelection().removeAllRanges();
                getSelection().addRange(range);
            },
            [html, text]
        );
        await page.keyboard.press("Control+C");
    }

    // the point (relative to `target`) at the left edge of the character at `offset` of its first text node
    function pointAt(target, offset) {
        return target.evaluate((el, offset) => {
            const text = document.createTreeWalker(el, NodeFilter.SHOW_TEXT).nextNode();
            const range = document.createRange();
            range.setStart(text, offset);
            range.setEnd(text, offset + 1);
            const rect = range.getBoundingClientRect();
            const box = el.getBoundingClientRect();
            return { x: rect.left - box.left + 1, y: rect.top + rect.height / 2 - box.top };
        }, offset);
    }

    // a drop event with the given data, dispatched at the element; returns whether it was cancelled
    function dispatchDrop(target, data, { files = [], at } = {}) {
        return target.evaluate(
            (el, { data, files, at }) => {
                const transfer = new DataTransfer();
                for (const [type, value] of Object.entries(data)) transfer.setData(type, value);
                for (const name of files) transfer.items.add(new File(["file body"], name, { type: "text/plain" }));
                const box = el.getBoundingClientRect();
                const event = new DragEvent("drop", {
                    dataTransfer: transfer,
                    bubbles: true,
                    cancelable: true,
                    clientX: box.left + (at ? at.x : 5),
                    clientY: box.top + (at ? at.y : box.height / 2),
                });
                el.dispatchEvent(event);
                return event.defaultPrevented;
            },
            { data, files, at }
        );
    }

    function dispatchPaste(target, data) {
        return target.evaluate((el, data) => {
            // A plain event with a clipboardData stand-in: Firefox empties the clipboardData of
            // synthetic ClipboardEvents, and the handlers only call getData().
            el.focus();
            const event = new Event("paste", { bubbles: true, cancelable: true });
            Object.defineProperty(event, "clipboardData", {
                value: { types: Object.keys(data), files: [], getData: (type) => data[type] ?? "" },
            });
            el.dispatchEvent(event);
            return event.defaultPrevented;
        }, data);
    }

    test("a drop of rich HTML on the editor inserts the text at the drop point and creates nothing", async ({ page, app, net }) => {
        await app.open();
        await app.editor.fill("AAAA BBBB");
        await app.editor.evaluate((el) => el.addEventListener("input", () => (window.__inputs = (window.__inputs || 0) + 1)));
        await addDragSource(page, { "text/html": RICH, "text/plain": "X;" });
        await page.dragAndDrop("#drag-source", "#editor", { targetPosition: await pointAt(app.editor, 4) });
        await expect.poll(() => app.editor.innerText()).toBe("AAAAX; BBBB");
        await expect(app.editor.locator("*")).toHaveCount(0);
        await expect(page.locator("#editor iframe, #editor form, #editor img, #editor b")).toHaveCount(0);
        expect(await page.evaluate(() => window.__inputs)).toBe(1); // an input event, as for typing
        net.expectNoExternalRequests();
        // undo takes the drop back as one step
        await app.editor.focus();
        await page.evaluate(() => document.execCommand("undo"));
        expect(await app.editor.innerText()).toBe("AAAA BBBB");
    });

    test("a drop on the editor with no text/plain inserts nothing", async ({ page, app, net }) => {
        await app.open();
        await app.editor.fill("AAAA BBBB");
        await addDragSource(page, { "text/html": RICH });
        await page.dragAndDrop("#drag-source", "#editor", { targetPosition: await pointAt(app.editor, 4) });
        await expect(app.editor.locator("*")).toHaveCount(0);
        expect(await app.editor.innerText()).toBe("AAAA BBBB");
        net.expectNoExternalRequests();
    });

    test("a multi-line drop on the editor keeps its lines", async ({ page, app }) => {
        await app.open();
        await app.editor.fill("AAAA");
        await addDragSource(page, { "text/plain": "SELECT 1\nFROM t" });
        await page.dragAndDrop("#drag-source", "#editor", { targetPosition: await pointAt(app.editor, 2) });
        await expect.poll(() => app.editor.innerText()).toMatch(/^AASELECT 1\nFROM tAA$/);
        await expect(app.editor.locator("img, iframe, form")).toHaveCount(0);
    });

    // The file name of the export dialog is a plain <input>: it takes text only and no markup by
    // itself, so these tests drive the real browser (a real drag, a real paste).
    test("a drop on the export file name inserts one line of text at the drop point", async ({ page, app, net }) => {
        await app.open();
        const field = await openExportName(app);
        const before = await field.inputValue();
        await field.evaluate((el) => el.setSelectionRange(el.value.length, el.value.length)); // a caret, not a selection
        await addDragSource(page, { "text/html": RICH, "text/plain": "one\ntwo\r\nthree" }, "#export-dialog");
        await page.dragAndDrop("#drag-source", "#export-name", { targetPosition: await inputPointAt(field, 3) });
        const expected = `${before.slice(0, 3)}one two three${before.slice(3)}`;
        await expect.poll(() => field.inputValue()).toBe(expected);
        await expect(page.locator("#export-dialog img, #export-dialog iframe, #export-dialog b")).toHaveCount(0);
        await expect(page.locator("#export-dialog form")).toHaveCount(1);
        net.expectNoExternalRequests();
        // the rename flow still works: Enter exports under the new name and the new name is used
        await field.press("Enter");
        await expect(page).toHaveTitle(new RegExp(`^${expected.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")} - `));
        expect(await page.evaluate(() => window.app.database.name)).toBe(expected);
    });

    test("a paste of rich HTML into the export file name inserts one line of text", async ({ page, app, net }) => {
        await app.open();
        await copyRich(page, RICH, "first\nsecond.db");
        const field = await openExportName(app);
        await page.keyboard.press("Control+A");
        await page.keyboard.press("Control+V");
        await expect(field).toHaveValue("first second.db");
        await expect(page.locator("#export-dialog img, #export-dialog iframe, #export-dialog form input[name=x]")).toHaveCount(0);
        net.expectNoExternalRequests();
        await page.keyboard.press("Enter");
        await expect(page).toHaveTitle(/^first second\.db - /);
        expect(await page.evaluate(() => window.app.database.name)).toBe("first second.db");
    });

    test("a real copy of rich content, pasted into the export file name, brings text only", async ({ page, app }) => {
        await app.open();
        await page.evaluate(() => {
            const source = document.createElement("div");
            source.id = "rich-source";
            source.innerHTML = '<p>line one</p><p>line two</p><img id="copied-img" src="img/favicon.svg"><b>bold</b>';
            document.body.append(source);
            const range = document.createRange();
            range.selectNodeContents(source);
            getSelection().removeAllRanges();
            getSelection().addRange(range);
        });
        await page.keyboard.press("Control+C");
        const field = await openExportName(app);
        await page.keyboard.press("Control+A");
        await page.keyboard.press("Control+V");
        await expect(page.locator("#export-dialog img, #export-dialog b")).toHaveCount(0);
        const value = await field.inputValue();
        expect(value).toContain("line one");
        expect(value).toContain("line two");
        expect(value).not.toMatch(/[\r\n]/);
        await page.keyboard.press("Enter");
        // the export dialog takes the name without its outer blanks (js/lab/export-dialog.js), as
        // the old header field did on commit; the line breaks were already gone in the field
        expect(await page.evaluate(() => window.app.database.name)).toBe(value.trim());
    });

    test("a paste into the editor is unchanged: plain text at the caret, once", async ({ page, app }) => {
        await app.open();
        await app.editor.fill("SELECT ");
        await app.editor.focus();
        const cancelled = await dispatchPaste(app.editor, { "text/html": RICH, "text/plain": "1 AS one\nFROM t" });
        expect(cancelled).toBe(true);
        expect(await app.editor.innerText()).toBe("SELECT 1 AS one\nFROM t");
        await expect(app.editor.locator("img, iframe, form, b")).toHaveCount(0);
    });

    test("a drop that carries files inserts nothing and is cancelled, so the tab does not open them", async ({ page, app }) => {
        await app.open();
        await app.editor.fill("AAAA");
        const nameBefore = await app.pickedText();
        const url = page.url();
        // files, with a text/plain alongside (file managers send the path or the name)
        expect(await dispatchDrop(app.editor, { "text/plain": "/tmp/evil.html" }, { files: ["evil.html"] })).toBe(true);
        const field = await openExportName(app);
        const fieldBefore = await field.inputValue();
        expect(await dispatchDrop(field, { "text/plain": "evil.html" }, { files: ["evil.html"] })).toBe(true);
        // anywhere else on the page too
        expect(await dispatchDrop(page.locator("#export-dialog"), { "text/plain": "evil.html" }, { files: ["evil.html"] })).toBe(true);
        expect(await dispatchDrop(page.locator("#results-pane"), { "text/plain": "evil.html" }, { files: ["evil.html"] })).toBe(true);
        expect(await app.editor.innerText()).toBe("AAAA");
        expect(await field.inputValue()).toBe(fieldBefore);
        expect(await app.pickedText()).toBe(nameBefore);
        expect(page.url()).toBe(url);
    });

    test("a drag that starts inside the editor keeps the browser's move behaviour", async ({ page, app }) => {
        await app.open();
        await app.editor.fill("AAAA BBBB");
        // the drag starts inside: not taken over, whatever the drop carries
        await app.editor.evaluate((el) => el.dispatchEvent(new DragEvent("dragstart", { bubbles: true, cancelable: true, dataTransfer: new DataTransfer() })));
        expect(await dispatchDrop(app.editor, { "text/plain": "MOVED" })).toBe(false);
        expect(await app.editor.innerText()).toBe("AAAA BBBB");
        // the next drop, from outside, is taken over again
        expect(await dispatchDrop(app.editor, { "text/plain": "X" })).toBe(true);
        // and a drag that ended without a drop clears the mark too
        await app.editor.evaluate((el) => el.dispatchEvent(new DragEvent("dragstart", { bubbles: true, cancelable: true, dataTransfer: new DataTransfer() })));
        await app.editor.evaluate((el) => el.dispatchEvent(new DragEvent("dragend", { bubbles: true, cancelable: true })));
        expect(await dispatchDrop(app.editor, { "text/plain": "Y" })).toBe(true);
    });

    // A drag that began in the editor but never produced dragend or drop (its text was replaced
    // under it) must not leave the next, unrelated drop unprotected.
    for (const [label, end] of [
        ["pointer movement", (page) => page.mouse.move(300, 300)],
        ["a key press", (page) => page.keyboard.press("Shift")],
        ["a mouse press", (page) => page.mouse.down().then(() => page.mouse.up())],
    ]) {
        test(`a drag that started in the editor and never ended is forgotten at ${label}`, async ({ page, app, net }) => {
            await app.open();
            await app.editor.fill("AAAA BBBB");
            await app.editor.evaluate((el) => el.dispatchEvent(new DragEvent("dragstart", { bubbles: true, cancelable: true, dataTransfer: new DataTransfer() })));
            await end(page);
            // an external drop with rich content now: taken over, not left to the browser
            expect(await dispatchDrop(app.editor, { "text/html": RICH, "text/plain": "X" })).toBe(true);
            await expect(app.editor.locator("*")).toHaveCount(0);
            net.expectNoExternalRequests();
        });
    }

    test("a real drag of text inside the editor still moves it, once", async ({ page, app }) => {
        await app.open();
        await app.editor.fill("AAAA BBBB");
        await app.editor.evaluate((el) => {
            const text = el.firstChild;
            const range = document.createRange();
            range.setStart(text, 0);
            range.setEnd(text, 4);
            getSelection().removeAllRanges();
            getSelection().addRange(range);
        });
        const from = await pointAt(app.editor, 1);
        const to = await pointAt(app.editor, 8);
        const box = await app.editor.boundingBox();
        await page.mouse.move(box.x + from.x, box.y + from.y);
        await page.mouse.down();
        await page.mouse.move(box.x + to.x - 6, box.y + to.y, { steps: 6 });
        await page.mouse.move(box.x + to.x, box.y + to.y, { steps: 3 });
        await page.mouse.up();
        expect(await app.editor.innerText()).toBe(" BBBAAAAB");
    });
});
