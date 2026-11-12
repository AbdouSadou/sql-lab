const { test, expect, App, SAMPLE_FILE, realSet, failStorage, setStorageFailing, fakeStorage, inNode, EDITOR_INPUT, editorValue } = require("./helpers");

// M5 durability and layout fixes found by the independent verifiers: the run log and the
// progress when storage fills, frees up or cannot be read; a log held only in memory; the
// notice; a bare "/*" at the end of the SQL; the editor toolbar over a long query; a long word in
// the editor. The modules without a DOM run in Node against fakeStorage (tests/helpers.js);
// the page tests drive the real app.

const SET = realSet();
const notice = (page) => page.locator("#storage-notice");
const second = (n) => `2026-11-09T10:${String(Math.floor(n / 60)).padStart(2, "0")}:${String(n % 60).padStart(2, "0")}Z`;
const entry = (sql, n) => ({ t: second(n), sql, rows: 1 });

test.describe("two tabs, storage filled and then freed (run log, in Node)", () => {
    test("the next Run of each tab keeps what the other stored; nothing is overwritten from a stale copy", async () => {
        const storage = fakeStorage();
        await inNode(storage, async (events, tab) => {
            const a = await tab().load("run-log.js");
            const b = await tab().load("run-log.js");
            let n = 0;
            const run = (tab, sql) => tab.appendLog("northlight", entry(sql, n++));
            run(a, "pre_A");
            run(b, "pre_B");
            storage.full = true;
            for (let i = 1; i <= 4; i++) {
                run(a, `full_A${i}`);
                run(b, `full_B${i}`);
            }
            storage.full = false;
            run(a, "room_A");
            run(b, "after_B");
            const expected = ["pre_A", "pre_B", ...[1, 2, 3, 4].flatMap((i) => [`full_A${i}`, `full_B${i}`]), "room_A", "after_B"];
            const sqls = (log) => log.map((e) => e.sql);
            expect(sqls(JSON.parse(storage.data.get("sqllab.log.northlight")).entries)).toEqual(expected);
            expect(sqls(a.readLog("northlight"))).toEqual(expected);
            expect(sqls(b.readLog("northlight"))).toEqual(expected);
        });
    });

    test("a tab that could not store keeps showing its own entries together with the other tab's", async () => {
        const storage = fakeStorage();
        await inNode(storage, async (events, tab) => {
            const a = await tab().load("run-log.js");
            const b = await tab().load("run-log.js");
            a.appendLog("k", entry("one", 1));
            storage.full = true;
            b.appendLog("k", entry("two_B", 2));
            storage.full = false;
            a.appendLog("k", entry("three_A", 3));
            // B's entry is only in B's memory: A's stored log lacks it, B's own read has both
            expect(b.readLog("k").map((e) => e.sql)).toEqual(["one", "two_B", "three_A"]);
            expect(a.readLog("k").map((e) => e.sql)).toEqual(["one", "three_A"]);
        });
    });

    test("equal entries are counted one to one when merging: mine [X, X] with stored [X, X, X] is three", async () => {
        const storage = fakeStorage();
        await inNode(storage, async (events, tab) => {
            const a = await tab().load("run-log.js");
            storage.full = true;
            a.appendLog("k", entry("same", 1));
            a.appendLog("k", entry("same", 1));
            storage.full = false;
            // another tab stored three of them (entries have no ids: equal ones are interchangeable)
            const x = entry("same", 1);
            storage.data.set("sqllab.log.k", JSON.stringify({ v: 1, entries: [x, x, x] }));
            expect(a.readLog("k")).toHaveLength(3);
        });
    });

    test("the same SQL twice in one second is two entries, not one", async () => {
        const storage = fakeStorage();
        await inNode(storage, async (events, tab) => {
            const a = await tab().load("run-log.js");
            storage.full = true;
            a.appendLog("k", entry("same", 1));
            a.appendLog("k", entry("same", 1));
            storage.full = false;
            a.appendLog("k", entry("same", 1));
            expect(a.readLog("k")).toHaveLength(3);
            expect(JSON.parse(storage.data.get("sqllab.log.k")).entries).toHaveLength(3);
        });
    });
});

test.describe("two tabs, storage filled and then freed (in the browser)", () => {
    test("both tabs and the stored log end with every Run", async ({ context, page, app }) => {
        await failStorage(context, { prefix: "sqllab.log.", on: false });
        await app.open();
        const other = await context.newPage();
        const otherApp = new App(other);
        await otherApp.open();
        const tabs = [app, otherApp];
        const sql = (tag, i) => `select '${tag}${i}' as c;`;
        await app.query(sql("pre_A", 0));
        await otherApp.query(sql("pre_B", 0));
        for (const tab of tabs) {
            await setStorageFailing(tab.page, true);
        }
        for (let i = 1; i <= 3; i++) {
            await app.query(sql("full_A", i));
            await otherApp.query(sql("full_B", i));
        }
        for (const tab of tabs) {
            await setStorageFailing(tab.page, false);
        }
        await app.query(sql("room_A", 0));
        await otherApp.query(sql("after_B", 0));
        const expected = ["pre_A0", "pre_B0", "full_A1", "full_B1", "full_A2", "full_B2", "full_A3", "full_B3", "room_A0", "after_B0"].map((s) => `select '${s}' as c;`);
        // second precision times: entries of one second may swap, so compare as sets
        const stored = (await app.readLog("northlight")).map((e) => e.sql);
        expect([...stored].sort()).toEqual([...expected].sort());
        for (const tab of tabs) {
            await tab.openHistory();
            await expect(tab.historyEntries).toHaveCount(expected.length);
            const file = await tab.exportEvidence("U2034567");
            expect(file.text.match(/^\[\d+\] /gm)).toHaveLength(expected.length);
        }
        await expect(notice(page)).toBeHidden();
        await other.close();
    });
});

test.describe("a log that cannot be read", () => {
    test("when getItem throws but setItem works, the Runs stay in the History tab and the export, and the notice shows (in Node)", async () => {
        const storage = fakeStorage();
        storage.unreadable = true;
        await inNode(storage, async (events, tab) => {
            const log = await tab().load("run-log.js");
            for (let i = 1; i <= 3; i++) {
                log.appendLog("northlight", entry(`select ${i}`, i));
            }
            expect(log.readLog("northlight").map((e) => e.sql)).toEqual(["select 1", "select 2", "select 3"]);
            expect(events.at(-1)).toEqual({ what: "log", ok: false });
            // nothing was written over a log that could not be read
            expect(storage.data.size).toBe(0);
            // readable again: the next Run stores everything
            storage.unreadable = false;
            log.appendLog("northlight", entry("select 4", 4));
            expect(JSON.parse(storage.data.get("sqllab.log.northlight")).entries.map((e) => e.sql)).toEqual(["select 1", "select 2", "select 3", "select 4"]);
            expect(events.at(-1)).toEqual({ what: "log", ok: true });
        });
    });

    test("in the page: 30 Runs are all in the History tab and the export, and the notice shows", async ({ page, app }) => {
        await failStorage(page, { methods: ["getItem"] });
        await app.open();
        for (let i = 1; i <= 30; i++) {
            await app.query(`select ${i} as n;`);
        }
        await expect(notice(page)).toBeVisible();
        await app.openHistory();
        await expect(app.historyEntries).toHaveCount(30);
        const file = await app.exportEvidence("U2034567");
        expect(file.text.match(/^\[\d+\] /gm)).toHaveLength(30);
    });
});

test.describe("a log kept in memory has a size limit", () => {
    test("200 Runs of 110 KB with storage blocked give a file that verifies (in Node)", async () => {
        await inNode(null, async (events, tab) => {
            // storage blocked: reading the global itself throws
            Object.defineProperty(globalThis, "localStorage", {
                get() {
                    throw new Error("blocked");
                },
                configurable: true,
            });
            const lab = tab();
            const { appendLog, readLog } = await lab.load("run-log.js");
            const { RUN_LOG_MAX_BYTES, EVIDENCE_MAX_BYTES } = await lab.load("config.js");
            const { buildEvidence, verifyEvidence } = await lab.load("evidence.js");
            const body = "x".repeat(110_000);
            for (let i = 0; i < 200; i++) {
                appendLog("northlight", { t: second(i), sql: `select '${i}', '${body}';`, rows: 1 });
            }
            const log = readLog("northlight");
            // what the dialog would export is accepted by the verify page
            const text = await buildEvidence({ entries: log, dataset: "northlight", exported: "2026-11-09T14:32:08Z", student: "U2034567" });
            expect((await verifyEvidence(text)).status).toBe("valid");
            expect(text.length).toBeLessThan(EVIDENCE_MAX_BYTES);
            expect(log.reduce((sum, e) => sum + Buffer.byteLength(e.sql), 0)).toBeLessThanOrEqual(RUN_LOG_MAX_BYTES);
            // the newest entries are the ones kept, whole
            expect(log.at(-1).sql).toBe(`select '199', '${body}';`);
            expect(log.length).toBeGreaterThan(30);
        });
    });

    test("the limit counts UTF-8 bytes: 200 Runs of 24,000 CJK characters give a file that verifies (in Node)", async () => {
        await inNode(null, async (events, tab) => {
            Object.defineProperty(globalThis, "localStorage", {
                get() {
                    throw new Error("blocked");
                },
                configurable: true,
            });
            const lab = tab();
            const { appendLog, readLog } = await lab.load("run-log.js");
            const { RUN_LOG_MAX_BYTES, EVIDENCE_MAX_BYTES } = await lab.load("config.js");
            const { buildEvidence, verifyEvidence } = await lab.load("evidence.js");
            // 4.8 million characters, under the old character limit, but 14.4 million bytes; each
            // entry also carries a link (at most SHARE_MAX_PAYLOAD_CHARS = 100,000 characters),
            // so 200 of them make 34 MB, which verify.html refuses
            const body = "\u6f22".repeat(24_000);
            const link = `https://example.test/#${"a".repeat(99_000)}`;
            for (let i = 0; i < 200; i++) {
                appendLog("northlight", { t: second(i), sql: `select '${i}${body}';`, rows: 1 });
            }
            const log = readLog("northlight");
            expect(log.reduce((sum, e) => sum + Buffer.byteLength(e.sql), 0)).toBeLessThanOrEqual(RUN_LOG_MAX_BYTES);
            expect(log.length).toBeLessThan(200);
            expect(log.at(-1).sql).toBe(`select '199${body}';`);
            const entries = log.map((e) => ({ ...e, link }));
            const text = await buildEvidence({ entries, dataset: "northlight", exported: "2026-11-09T14:32:08Z", student: "U2034567" });
            expect(Buffer.byteLength(text)).toBeLessThan(EVIDENCE_MAX_BYTES);
            expect((await verifyEvidence(text)).status).toBe("valid");
        });
    });

    // storage blocked, so the capped log lives in memory
    const blocked = () =>
        Object.defineProperty(globalThis, "localStorage", {
            get() {
                throw new Error("blocked");
            },
            configurable: true,
        });

    test("the newest entry is kept whole and alone when it is bigger than the limit (in Node)", async () => {
        await inNode(null, async (events, tab) => {
            blocked();
            const lab = tab();
            const { appendLog, readLog } = await lab.load("run-log.js");
            const { RUN_LOG_MAX_BYTES } = await lab.load("config.js");
            appendLog("northlight", entry("select 1", 1));
            const huge = `select '${"x".repeat(RUN_LOG_MAX_BYTES)}';`;
            appendLog("northlight", entry(huge, 2));
            const log = readLog("northlight");
            expect(log).toHaveLength(1);
            expect(log[0].sql).toBe(huge); // not cut
            // and it is the only one that stays until something newer comes
            appendLog("northlight", entry("select 3", 3));
            expect(readLog("northlight").map((e) => e.sql)).toEqual(["select 3"]);
        });
    });

    test("the error text of an entry counts toward the limit, in UTF-8 bytes (in Node)", async () => {
        await inNode(null, async (events, tab) => {
            blocked();
            const lab = tab();
            const { appendLog, readLog } = await lab.load("run-log.js");
            const { RUN_LOG_MAX_BYTES } = await lab.load("config.js");
            const newest = { t: second(2), sql: "x".repeat(2_000_000), rows: 1 };
            const olderSql = "select 1";
            // the older entry's SQL, its error (2 bytes per character) and the newest SQL add up
            // to exactly the limit: both are kept
            const room = RUN_LOG_MAX_BYTES - newest.sql.length - olderSql.length;
            expect(room % 2).toBe(0);
            const exact = "\u00e9".repeat(room / 2);
            appendLog("exact", { t: second(1), sql: olderSql, error: exact });
            appendLog("exact", newest);
            expect(readLog("exact").map((e) => e.t)).toEqual([second(1), second(2)]);
            // one byte more and the older entry goes
            appendLog("over", { t: second(1), sql: olderSql, error: `${exact}e` });
            appendLog("over", newest);
            expect(readLog("over").map((e) => e.t)).toEqual([second(2)]);
            // characters are not bytes: as many characters in ASCII would have fitted
            appendLog("ascii", { t: second(1), sql: olderSql, error: "e".repeat(room / 2 + 1) });
            appendLog("ascii", newest);
            expect(readLog("ascii")).toHaveLength(2);
        });
    });

    test("a small log is untouched by the size limit (in Node)", async () => {
        await inNode(fakeStorage(), async (events, tab) => {
            const { appendLog, readLog } = await tab().load("run-log.js");
            for (let i = 0; i < 205; i++) {
                appendLog("k", entry(`select ${i}`, i));
            }
            const log = readLog("k");
            expect(log).toHaveLength(200);
            expect(log[0].sql).toBe("select 5");
        });
    });
});

test.describe("the storage notice", () => {
    test("a small log that fits does not hide the notice while another log is still only in memory (in Node)", async () => {
        const storage = fakeStorage();
        storage.limit = 100;
        await inNode(storage, async (events, tab) => {
            const log = await tab().load("run-log.js");
            log.appendLog("northlight", entry("select 1", 1));
            log.appendLog("northlight", entry("select 2", 2));
            expect(events.at(-1)).toEqual({ what: "log", ok: false });
            // another log, small enough to be stored in full
            log.appendLog("file:sample.db", entry("select 3", 3));
            expect(storage.data.has("sqllab.log.file:sample.db")).toBe(true);
            expect(events.at(-1)).toEqual({ what: "log", ok: false });
            // room again: the first log is stored in full and the notice may go
            storage.limit = Infinity;
            log.appendLog("northlight", entry("select 4", 4));
            expect(events.at(-1)).toEqual({ what: "log", ok: true });
        });
    });

    test("in the page: it stays while the log of the first database is memory-only, and goes when that is stored", async ({ page, app }) => {
        await failStorage(page, { prefix: "sqllab.log.", minLength: 100 });
        await app.open();
        await app.query("select 1 as a");
        await app.query("select 2 as a");
        await expect(notice(page)).toBeVisible();
        await app.upload(SAMPLE_FILE);
        await app.query("select 1");
        expect(await page.evaluate(() => Object.keys(localStorage).filter((k) => k.startsWith("sqllab.log.")).sort())).toEqual(["sqllab.log.file:sample.db", "sqllab.log.northlight"]);
        await expect(notice(page)).toBeVisible();
        // room again, and back to the first database: its next Run stores its whole log
        await setStorageFailing(page, false);
        await app.pickDatabase("Northlight Retail");
        // the pick has finished loading: the pane is "no result yet" again (nothing runs on a pick)
        await expect(app.pane).toHaveAttribute("data-state", "empty");
        await expect(app.emptyState).toContainText("Run a query to see its result here.");
        await app.query("select 3 as a");
        await expect(notice(page)).toBeHidden();
        expect(await app.readLog("northlight")).toHaveLength(3);
    });
});

test.describe("exercise progress after a failed write", () => {
    test("when there is room again the next pass is stored and the notice goes", async ({ page, app }) => {
        await failStorage(page, { prefix: "sqllab.progress." });
        await app.openSet();
        await app.exerciseButton(1).click();
        await app.editor.fill(SET.exercises[0].model_query);
        await app.checkButton.click();
        await expect(app.feedback).toContainText("Correct.");
        await expect(notice(page)).toBeVisible();
        expect(await page.evaluate(() => localStorage.getItem("sqllab.progress.retail-basics"))).toBeNull();
        await setStorageFailing(page, false);
        await app.exerciseButton(2).click();
        await app.editor.fill(SET.exercises[1].model_query);
        await app.checkButton.click();
        await expect(app.progress).toHaveText("2 of 10 complete");
        await expect(notice(page)).toBeHidden();
        const stored = await page.evaluate(() => JSON.parse(localStorage.getItem("sqllab.progress.retail-basics")));
        expect(Object.keys(stored.passed)).toEqual([SET.exercises[0].id, SET.exercises[1].id]);
    });

    test("resetting a set that lives in memory returns it to storage (in Node)", async () => {
        const storage = fakeStorage();
        await inNode(storage, async (events, tab) => {
            const progress = await tab().load("progress.js");
            storage.full = true;
            progress.markPassed("set-a", "e1");
            expect(events.at(-1)).toEqual({ what: "progress", ok: false });
            storage.full = false;
            progress.resetSet("set-a");
            expect(events.at(-1)).toEqual({ what: "progress", ok: true });
            progress.markPassed("set-a", "e2");
            expect(progress.isPassed("set-a", "e1")).toBe(false);
            expect(JSON.parse(storage.data.get("sqllab.progress.set-a")).passed).toEqual({ e2: true });
        });
    });

    test("the notice stays while another set is still only in memory (in Node)", async () => {
        const storage = fakeStorage();
        await inNode(storage, async (events, tab) => {
            const progress = await tab().load("progress.js");
            storage.full = true;
            progress.markPassed("set-a", "e1");
            storage.full = false;
            progress.markPassed("set-b", "e1");
            expect(events.at(-1)).toEqual({ what: "progress", ok: false });
            progress.markPassed("set-a", "e2");
            expect(events.at(-1)).toEqual({ what: "progress", ok: true });
        });
    });
});

test.describe("progress held in memory meets what another tab stored (in Node)", () => {
    test("the first write that succeeds keeps the other tab's passes: the union, not the memory copy", async () => {
        const storage = fakeStorage();
        await inNode(storage, async (events, tab) => {
            const a = await tab().load("progress.js");
            const b = await tab().load("progress.js");
            storage.full = true;
            a.markPassed("set-a", "e1");
            a.saveDraft("set-a", "e1", "select a1");
            storage.full = false;
            b.markPassed("set-a", "e2");
            b.markPassed("set-a", "e3");
            b.saveDraft("set-a", "e1", "select b1");
            b.saveDraft("set-a", "e3", "select b3");
            a.markPassed("set-a", "e4");
            const stored = JSON.parse(storage.data.get("sqllab.progress.set-a"));
            expect(stored.passed).toEqual({ e1: true, e2: true, e3: true, e4: true });
            // this page's own draft wins; a draft only the other tab has is kept
            expect(stored.drafts).toEqual({ e1: "select a1", e3: "select b3" });
            expect(a.passedCount("set-a")).toBe(4);
            expect(a.getDraft("set-a", "e3")).toBe("select b3");
            expect(events.at(-1)).toEqual({ what: "progress", ok: true });
        });
    });

    test("a set that never failed is not merged: what another tab stored after this tab read it is not mixed in", async () => {
        const storage = fakeStorage();
        await inNode(storage, async (events, tab) => {
            const a = await tab().load("progress.js");
            a.markPassed("set-a", "e1");
            // Between this tab's read of the set and its write, another tab resets it and stores a
            // pass of its own. The write of a set that is not held in memory is the page's copy as
            // it read it, plus the new pass; only a set held in memory is merged with storage.
            const getItem = storage.getItem;
            let reads = 0;
            storage.getItem = (key) => {
                const value = getItem(key);
                if (++reads === 1) {
                    storage.data.set(key, JSON.stringify({ v: 1, passed: { e9: true }, drafts: {} }));
                }
                return value;
            };
            a.markPassed("set-a", "e2");
            storage.getItem = getItem;
            expect(JSON.parse(storage.data.get("sqllab.progress.set-a")).passed).toEqual({ e1: true, e2: true });
        });
    });

    test("a draft emptied while the set is held in memory does not come back from storage", async () => {
        const storage = fakeStorage();
        await inNode(storage, async (events, tab) => {
            const a = await tab().load("progress.js");
            a.saveDraft("set-a", "e1", "select 'old draft'");
            a.saveDraft("set-a", "e2", "select 'kept'");
            const b = await tab().load("progress.js"); // the reloaded page reads the stored drafts
            storage.full = true;
            b.saveDraft("set-a", "e1", ""); // emptied, and storage refuses the write
            expect(b.getDraft("set-a", "e1")).toBe(null);
            expect(events.at(-1)).toEqual({ what: "progress", ok: false });
            storage.full = false;
            b.markPassed("set-a", "e3"); // the first write that works merges what is stored in
            const stored = JSON.parse(storage.data.get("sqllab.progress.set-a"));
            expect(stored.drafts).toEqual({ e2: "select 'kept'" });
            expect(stored.passed).toEqual({ e3: true });
            expect(b.getDraft("set-a", "e1")).toBe(null);
            expect(events.at(-1)).toEqual({ what: "progress", ok: true });
            // after that write nothing is remembered: a draft written again is an ordinary draft
            b.saveDraft("set-a", "e1", "select 2");
            expect(b.getDraft("set-a", "e1")).toBe("select 2");
        });
    });

    test("the write that empties a draft and finds storage working again does not bring the draft back", async () => {
        const storage = fakeStorage();
        await inNode(storage, async (events, tab) => {
            const a = await tab().load("progress.js");
            a.saveDraft("set-a", "e1", "select 'old draft'");
            const b = await tab().load("progress.js");
            storage.full = true;
            b.markPassed("set-a", "e2"); // the set is now held in memory, with the draft it read
            storage.full = false;
            b.saveDraft("set-a", "e1", ""); // empties the draft, and is the first write that works
            const stored = JSON.parse(storage.data.get("sqllab.progress.set-a"));
            expect(stored.drafts).toEqual({});
            expect(stored.passed).toEqual({ e2: true });
            expect(b.getDraft("set-a", "e1")).toBe(null);
            expect(events.at(-1)).toEqual({ what: "progress", ok: true });
        });
    });

    test("an emptied draft that is written again before storage recovers is kept, and a refused reset takes the stored copy with it", async () => {
        const storage = fakeStorage();
        await inNode(storage, async (events, tab) => {
            const a = await tab().load("progress.js");
            a.saveDraft("set-a", "e1", "select 1");
            const b = await tab().load("progress.js");
            storage.full = true;
            b.saveDraft("set-a", "e1", "");
            b.saveDraft("set-a", "e1", "select 'again'");
            storage.full = false;
            b.markPassed("set-a", "e3");
            expect(JSON.parse(storage.data.get("sqllab.progress.set-a")).drafts).toEqual({ e1: "select 'again'" });
            // a reset that storage refuses starts the set over in memory, and the copy still stored
            // is the one that was reset: the next write that works replaces it, it is not merged back
            const removeItem = storage.removeItem;
            storage.full = true;
            b.saveDraft("set-a", "e1", "");
            storage.removeItem = () => {
                throw new Error("blocked");
            };
            b.resetSet("set-a");
            storage.removeItem = removeItem;
            storage.full = false;
            storage.data.set("sqllab.progress.set-a", JSON.stringify({ v: 1, passed: {}, drafts: { e1: "from elsewhere" } }));
            b.markPassed("set-a", "e4");
            expect(b.getDraft("set-a", "e1")).toBe(null);
            expect(JSON.parse(storage.data.get("sqllab.progress.set-a"))).toEqual({ v: 1, passed: { e4: true }, drafts: {} });
        });
    });

    test("while storage cannot be read the set stays in memory and nothing is written over it", async () => {
        const storage = fakeStorage();
        await inNode(storage, async (events, tab) => {
            const a = await tab().load("progress.js");
            storage.full = true;
            a.markPassed("set-a", "e1");
            storage.full = false;
            storage.data.set("sqllab.progress.set-a", JSON.stringify({ v: 1, passed: { e2: true }, drafts: {} }));
            storage.unreadable = true;
            a.markPassed("set-a", "e3");
            expect(events.at(-1)).toEqual({ what: "progress", ok: false });
            storage.unreadable = false;
            expect(JSON.parse(storage.data.get("sqllab.progress.set-a")).passed).toEqual({ e2: true });
            a.markPassed("set-a", "e4");
            expect(JSON.parse(storage.data.get("sqllab.progress.set-a")).passed).toEqual({ e1: true, e2: true, e3: true, e4: true });
        });
    });

    test("a reset that storage refuses keeps the set in memory and says so", async () => {
        const storage = fakeStorage();
        await inNode(storage, async (events, tab) => {
            const progress = await tab().load("progress.js");
            progress.markPassed("set-a", "e1");
            expect(events.at(-1)).toEqual({ what: "progress", ok: true });
            storage.removeItem = () => {
                throw new Error("blocked");
            };
            progress.resetSet("set-a");
            expect(events.at(-1)).toEqual({ what: "progress", ok: false });
            expect(progress.isPassed("set-a", "e1")).toBe(false);
        });
    });

    test("a reset that storage refused is not undone by the next write that works", async () => {
        const storage = fakeStorage();
        await inNode(storage, async (events, tab) => {
            const progress = await tab().load("progress.js");
            progress.markPassed("set-a", "e1");
            progress.saveDraft("set-a", "e1", "select 'old'");
            const removeItem = storage.removeItem;
            storage.removeItem = () => {
                throw new Error("blocked");
            };
            progress.resetSet("set-a");
            storage.removeItem = removeItem;
            expect(progress.isPassed("set-a", "e1")).toBe(false);
            // storage still holds the old copy; the next write replaces it instead of merging it back
            progress.markPassed("set-a", "e2");
            expect(JSON.parse(storage.data.get("sqllab.progress.set-a"))).toEqual({ v: 1, passed: { e2: true }, drafts: {} });
            expect(progress.isPassed("set-a", "e1")).toBe(false);
            expect(progress.getDraft("set-a", "e1")).toBe(null);
            expect(events.at(-1)).toEqual({ what: "progress", ok: true });
            // the reset is complete: a copy stored by another tab after that is merged as usual
            storage.full = true;
            progress.markPassed("set-a", "e3");
            storage.full = false;
            storage.data.set("sqllab.progress.set-a", JSON.stringify({ v: 1, passed: { e4: true }, drafts: {} }));
            progress.markPassed("set-a", "e5");
            expect(JSON.parse(storage.data.get("sqllab.progress.set-a")).passed).toEqual({ e2: true, e3: true, e4: true, e5: true });
        });
    });

    test("a refused reset stays pending through writes that fail too, and a reset that works ends it", async () => {
        const storage = fakeStorage();
        await inNode(storage, async (events, tab) => {
            const progress = await tab().load("progress.js");
            progress.markPassed("set-a", "e1");
            const removeItem = storage.removeItem;
            storage.removeItem = () => {
                throw new Error("blocked");
            };
            progress.resetSet("set-a");
            // the write fails as well: still pending
            storage.full = true;
            progress.markPassed("set-a", "e2");
            storage.full = false;
            progress.markPassed("set-a", "e3");
            expect(JSON.parse(storage.data.get("sqllab.progress.set-a")).passed).toEqual({ e2: true, e3: true });
            // a refused reset, then a reset that works: nothing stays pending
            progress.resetSet("set-a"); // removeItem still throws
            storage.removeItem = removeItem;
            progress.resetSet("set-a");
            expect(storage.data.has("sqllab.progress.set-a")).toBe(false);
            storage.full = true;
            progress.markPassed("set-a", "e6");
            storage.full = false;
            storage.data.set("sqllab.progress.set-a", JSON.stringify({ v: 1, passed: { e7: true }, drafts: {} }));
            progress.markPassed("set-a", "e8");
            expect(JSON.parse(storage.data.get("sqllab.progress.set-a")).passed).toEqual({ e6: true, e7: true, e8: true });
        });
    });

    test("a refused reset of one set does not stop the merge of another set (in Node)", async () => {
        const storage = fakeStorage();
        await inNode(storage, async (events, tab) => {
            const progress = await tab().load("progress.js");
            progress.markPassed("set-a", "e1");
            const removeItem = storage.removeItem;
            storage.removeItem = () => {
                throw new Error("blocked");
            };
            progress.resetSet("set-a");
            storage.removeItem = removeItem;
            // set B fails for another reason (storage full), and another tab stores a pass of B
            storage.full = true;
            progress.markPassed("set-b", "b1");
            storage.full = false;
            storage.data.set("sqllab.progress.set-b", JSON.stringify({ v: 1, passed: { b2: true }, drafts: {} }));
            progress.markPassed("set-b", "b3");
            expect(JSON.parse(storage.data.get("sqllab.progress.set-b")).passed).toEqual({ b1: true, b2: true, b3: true });
            // set A is still pending: its stored copy is replaced, not merged
            progress.markPassed("set-a", "e2");
            expect(JSON.parse(storage.data.get("sqllab.progress.set-a")).passed).toEqual({ e2: true });
        });
    });

    test("when getItem throws but setItem works, a write does not replace the stored progress of a set that never failed (in Node)", async () => {
        const storage = fakeStorage();
        await inNode(storage, async (events, tab) => {
            const progress = await tab().load("progress.js");
            storage.data.set(
                "sqllab.progress.set-a",
                JSON.stringify({ v: 1, passed: { e1: true, e2: true }, drafts: { e1: "select 1" } })
            );
            storage.unreadable = true;
            progress.markPassed("set-a", "e3");
            progress.saveDraft("set-a", "e3", "select 3");
            // what is stored was never read, so it is not written over; the page says so
            expect(JSON.parse(storage.data.get("sqllab.progress.set-a"))).toEqual({
                v: 1,
                passed: { e1: true, e2: true },
                drafts: { e1: "select 1" },
            });
            expect(events.at(-1)).toEqual({ what: "progress", ok: false });
            expect(progress.isPassed("set-a", "e3")).toBe(true);
            // once storage can be read again, the next write keeps what was stored
            storage.unreadable = false;
            progress.markPassed("set-a", "e4");
            const stored = JSON.parse(storage.data.get("sqllab.progress.set-a"));
            expect(stored.passed).toEqual({ e1: true, e2: true, e3: true, e4: true });
            expect(stored.drafts).toEqual({ e1: "select 1", e3: "select 3" });
            expect(events.at(-1)).toEqual({ what: "progress", ok: true });
        });
    });

    test("a getItem that throws just once costs nothing: the write that follows keeps what is stored (in Node)", async () => {
        const storage = fakeStorage();
        await inNode(storage, async (events, tab) => {
            const progress = await tab().load("progress.js");
            storage.data.set(
                "sqllab.progress.set-a",
                JSON.stringify({ v: 1, passed: { e1: true, e2: true }, drafts: { e1: "select 1", e5: "select 5" } })
            );
            const working = storage.getItem;
            let failures = 0;
            storage.getItem = (key) => {
                if (failures > 0) {
                    failures--;
                    throw new Error("unreadable");
                }
                return working(key);
            };
            const stored = () => JSON.parse(storage.data.get("sqllab.progress.set-a"));
            // the read made on the way to the write is the one that fails; the next one works
            failures = 1;
            progress.markPassed("set-a", "e3");
            expect(stored().passed).toEqual({ e1: true, e2: true, e3: true });
            expect(stored().drafts).toEqual({ e1: "select 1", e5: "select 5" });
            failures = 1;
            progress.saveDraft("set-a", "e4", "select 4");
            expect(stored().passed).toEqual({ e1: true, e2: true, e3: true });
            expect(stored().drafts).toEqual({ e1: "select 1", e4: "select 4", e5: "select 5" });
            // the new text of a draft still replaces the stored text of that exercise
            failures = 1;
            progress.saveDraft("set-a", "e1", "select 11");
            expect(stored().drafts).toEqual({ e1: "select 11", e4: "select 4", e5: "select 5" });
            // nothing is left in memory: the set is back on storage and the notice is off
            expect(events.at(-1)).toEqual({ what: "progress", ok: true });
            expect(progress.passedCount("set-a")).toBe(3);
            // a read that fails while nothing is being written changes nothing either
            failures = 1;
            expect(progress.isPassed("set-a", "e1")).toBe(false);
            expect(progress.isPassed("set-a", "e1")).toBe(true);
        });
    });

    test("emptying a draft still removes it when the read before it fails (in Node)", async () => {
        const storage = fakeStorage();
        await inNode(storage, async (events, tab) => {
            const progress = await tab().load("progress.js");
            storage.data.set(
                "sqllab.progress.set-a",
                JSON.stringify({ v: 1, passed: { e1: true }, drafts: { c: "select 3", d: "select 4", f: "select 6" } })
            );
            const working = storage.getItem;
            let failures = 0;
            storage.getItem = (key) => {
                if (failures > 0) {
                    failures--;
                    throw new Error("unreadable");
                }
                return working(key);
            };
            const stored = () => JSON.parse(storage.data.get("sqllab.progress.set-a"));
            // the read fails, the merge in the write works: gone at once, nothing else touched
            failures = 1;
            progress.saveDraft("set-a", "c", "");
            expect(stored()).toEqual({ v: 1, passed: { e1: true }, drafts: { d: "select 4", f: "select 6" } });
            // the read and the merge both fail: nothing is written, and the emptying is remembered
            failures = 2;
            progress.saveDraft("set-a", "d", "   ");
            expect(stored().drafts).toEqual({ d: "select 4", f: "select 6" });
            expect(events.at(-1)).toEqual({ what: "progress", ok: false });
            // storage is back: the draft does not come back with the merge, the others stay
            progress.saveDraft("set-a", "e", "select 5");
            expect(stored()).toEqual({ v: 1, passed: { e1: true }, drafts: { e: "select 5", f: "select 6" } });
            expect(events.at(-1)).toEqual({ what: "progress", ok: true });
            // emptied while a set that could not be read is held in memory, with storage already back
            failures = 2;
            progress.markPassed("set-a", "e2");
            progress.saveDraft("set-a", "f", "");
            expect(stored()).toEqual({ v: 1, passed: { e1: true, e2: true }, drafts: { e: "select 5" } });
            expect(events.at(-1)).toEqual({ what: "progress", ok: true });
        });
    });
});

test.describe("a bare /* at the end of the SQL", () => {
    test("stays a statement, so the engine reports it; a comment with text after /* is still a comment", async ({ page, app }) => {
        await app.open();
        const split = (sql) =>
            page.evaluate(async (sql) => {
                const { splitStatements } = await import("./js/lab/runner.js");
                return splitStatements(window.app.database.capi, sql);
            }, sql);
        expect(await split("select 1; /*")).toEqual(["select 1;", "/*"]);
        expect(await split("/*")).toEqual(["/*"]);
        // "/*" and any character after it, whitespace included, is a comment (as SQLite reads it)
        expect(await split("select 1;\n  /*  ")).toEqual(["select 1;"]);
        expect(await split("SELECT 1;\n/*\n")).toEqual(["SELECT 1;"]);
        expect(await split("/* ")).toEqual([]);
        expect(await split("SELECT 1 /* ")).toEqual(["SELECT 1 /* "]);
        expect(await split("SELECT 1 /*\n\n\n")).toEqual(["SELECT 1 /*\n"]);
        expect(await split("select 1; /* a")).toEqual(["select 1;"]);
        expect(await split("select 1; /**/ /* a */")).toEqual(["select 1;"]);
        expect(await split("select 1; /* a */ /*")).toEqual(["select 1;", "/* a */ /*"]);
        // the engine's own answer, naming the statement
        await app.run("select 1; /*");
        await expect(app.errorBand.locator(".results-band-message")).toContainText('near "/": syntax error');
        await expect(app.errorBand.locator(".results-band-where")).toHaveText("In statement 2 of 2");
        const log = await app.readLog("northlight");
        expect(log.at(-1).error).toContain("syntax error");
    });

    // Each answer below is what the SQLite library gives for the whole text (python3 sqlite3
    // executescript, SQLite 3.54; the sqlite3 shell is no reference here, it reads line by line
    // and drops the newline after a final "/*"): "/*" followed by any character opens a comment
    // that may run to the end of the text; "/*" as the very last two characters is a slash and
    // a star.
    const SQLITE_RUNS = [
        ["select 1;\n/*\n", true],
        ["select 1 /* ", true],
        ["select 1 /*\n\n\n", true],
        ["select 1;\n  /*  ", true],
        ["\t/*\t", true],
        ["/* ", true],
        ["/*/", true],
        ["/**", true],
        ["/** ", true],
        ["/**/", true],
        ["select 1; /* a", true],
        ["select 1 /* a *", true],
        ["select 1 /* a */ /* ", true],
        ["select 1 --/* ", true],
        ["select 1; -- /*\n", true],
        ["select 1 /*;", true],
        ["select '/* ' ", true],
        ["select 1 /*", false],
        ["select 1; /*", false],
        ["/*", false],
        ["select 1 /* a */ /*", false],
        ["select 1 */* ", false],
        ["select 1 /\n", false],
    ];

    test("runs and refuses what SQLite runs and refuses, whitespace after /* included", async ({ page, app }) => {
        await app.open();
        const outcomes = await page.evaluate(async (cases) => {
            const { runSql } = await import("./js/lab/runner.js");
            return cases.map(([sql]) => {
                try {
                    runSql(window.app.database, sql);
                    return true;
                } catch {
                    return false;
                }
            });
        }, SQLITE_RUNS);
        expect(outcomes.map((ok, i) => [SQLITE_RUNS[i][0], ok])).toEqual(SQLITE_RUNS);
    });
});

test.describe("the editor toolbar over a long query", () => {
    const lines = (n) => `${Array.from({ length: n - 1 }, (_, i) => `-- line ${i + 1} of a long query`).join("\n")}\nselect * from products limit 3`;

    for (const withSet of [false, true]) {
        for (const width of [640, 700, 768, 800, 1024, 1280]) {
            // (from Phase 6, under 700 px the toolbar is the bar at the foot of the window, as in
            // the phone mockup: below the query, and still never over its last line)
            const phone = width < 700;
            test(`${withSet ? "with an exercise open" : "no exercise"} at ${width}px: the toolbar is ${phone ? "the bar below" : "above"} the query and never over its last line`, async ({ page, app }) => {
                await page.setViewportSize({ width, height: 900 });
                if (withSet) {
                    await app.openSet();
                    // (under 1100 px the exercise list is in the sidebar's drawer)
                    await app.openDrawer();
                    await app.exerciseButton(1).click();
                } else {
                    await app.open();
                }
                await app.query(lines(8));
                await expect(page.locator("#download-csv")).toBeVisible();
                // a phone shows the result after a run: back to the query
                await app.showView("editor");
                // the toolbar is a row of its own above the editor, so it cannot cover the query:
                // measure its box against the editor's text (the 8th line is the last one): the
                // typing surface (.cm-content; the plain box itself) holds the lines
                const m = await page.evaluate((input) => {
                    const editor = document.querySelector("#editor");
                    const surface = document.querySelector(input);
                    const bar = document.querySelector("#editor-toolbar").getBoundingClientRect();
                    const pane = document.querySelector("#editor-pane").getBoundingClientRect();
                    const range = document.createRange();
                    range.selectNodeContents(surface);
                    const rects = [...range.getClientRects()].filter((r) => r.width > 0 && r.height > 0);
                    const rows = new Set([...document.querySelectorAll("#editor-toolbar > button")].filter((b) => b.getClientRects().length).map((b) => Math.round(b.getBoundingClientRect().top)));
                    return {
                        firstLineTop: Math.min(...rects.map((r) => r.top)),
                        lastLineBottom: Math.max(...rects.map((r) => r.bottom)),
                        barTop: bar.top,
                        barBottom: bar.bottom,
                        paneTop: pane.top,
                        paneBottom: pane.bottom,
                        editorBottom: editor.getBoundingClientRect().bottom,
                        barRows: rows.size,
                        // rendered lines of the typing surface (CodeMirror: one div.cm-line each)
                        lines: surface.querySelectorAll(".cm-line").length || surface.innerText.trim().split("\n").length,
                    };
                }, EDITOR_INPUT);
                expect(m.lines).toBe(8);
                expect((await editorValue(page)).trim().split("\n").length).toBe(8);
                if (phone) {
                    // the bar is at the foot of the window, one row, and the query ends above it:
                    // no line of it is under the bar, and the editor stops where the bar starts
                    expect(Math.round(m.barBottom)).toBe(900);
                    expect(m.barRows).toBe(1);
                    expect(m.lastLineBottom).toBeGreaterThan(m.firstLineTop);
                    expect(m.lastLineBottom).toBeLessThanOrEqual(m.paneBottom + 1);
                    expect(m.lastLineBottom).toBeLessThanOrEqual(m.barTop + 1);
                    expect(m.paneBottom).toBeLessThanOrEqual(m.barTop + 1);
                    return;
                }
                // the query starts below the toolbar, and no line of it is under the toolbar
                expect(m.firstLineTop).toBeGreaterThanOrEqual(m.barBottom - 1);
                expect(m.lastLineBottom).toBeGreaterThan(m.firstLineTop);
                expect(m.lastLineBottom).toBeLessThanOrEqual(m.paneBottom + 1);
                // the toolbar is still against the editor, at its top
                expect(Math.abs(m.barBottom - m.paneTop)).toBeLessThanOrEqual(2);
                if (width >= 1024) {
                    expect(m.barRows).toBe(1);
                }
            });
        }
    }

    test("the editor keeps no room for a bar, and a narrow window still has no sideways scroll", async ({ page, app }) => {
        await page.setViewportSize({ width: 1280, height: 900 });
        await app.open();
        // the toolbar is not over the editor any more: the bottom padding is the top padding
        const padding = await page.evaluate((input) => {
            // the paddings are on the typing surface now (.cm-content; the plain box itself)
            const style = getComputedStyle(document.querySelector(input));
            return [style.paddingTop, style.paddingBottom];
        }, EDITOR_INPUT);
        expect(padding[1]).toBe(padding[0]);
        await page.setViewportSize({ width: 700, height: 900 });
        await app.query(lines(8));
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    });
});

test.describe("a long word in the editor", () => {
    for (const width of [360, 700, 1280]) {
        test(`at ${width}px a 400-character string and a list of numbers do not widen the page`, async ({ page, app }) => {
            await page.setViewportSize({ width, height: 900 });
            await app.open();
            const list = Array.from({ length: 150 }, (_, i) => i).join(",");
            for (const sql of [`select '${"x".repeat(400)}' as c`, `select 1 where 1 in (${list})`]) {
                await app.editor.fill(sql);
                const m = await page.evaluate(() => {
                    const editor = document.querySelector("#editor");
                    const scroller = editor.querySelector(".cm-scroller");
                    return {
                        page: document.documentElement.scrollWidth - window.innerWidth,
                        editor: editor.scrollWidth - editor.clientWidth,
                        scrolls: scroller.scrollWidth - scroller.clientWidth,
                        scrollerRight: scroller.getBoundingClientRect().right,
                    };
                });
                expect(m.page).toBeLessThanOrEqual(0);
                // the code editor scrolls a long line sideways inside its own scroller (.cm-scroller),
                // so the host box itself never overflows (the plain box wrapped it instead): the line
                // is wider than the scroller, and the scroller ends inside the window
                expect(m.editor).toBeLessThanOrEqual(1);
                expect(m.scrolls).toBeGreaterThan(0);
                expect(m.scrollerRight).toBeLessThanOrEqual(width);
            }
        });
    }
});
