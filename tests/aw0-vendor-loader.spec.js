const fs = require("node:fs");
const path = require("node:path");
const { test, expect, fakeStorage, inNode, NORTHLIGHT_URL } = require("./helpers");

// The loader for vendored libraries (js/lab/vendor-loader.js; assessment plan, section 2, "New
// libraries are vendored and loaded on demand"). It belongs to the plan's Phase 0, the groundwork
// that no student can see. These tests are of the loader itself, apart from what uses it (the
// import, since Phase 2: tests/aw2-import-page.spec.js): they answer made-up files
// (vendor/aw0-probe.js and others, through page.route) and call it in the page through
// bundle/app.js: (await import("./bundle/app.js")).vendorLoader.loadVendor(file, globalName).
//
// What is pinned: a first visit fetches no library; the first call adds one <script> with an
// address relative to the page (so it works under /repo/) and resolves with the library; a
// library is requested once however often it is asked for, even while the request is on its way;
// a failure (aborted request, a 404 answered with an HTML page, a file that is not the library)
// rejects every waiting caller with an Error, removes the script and leaves nothing behind; the
// next call tries again; two files load independently; nothing is shown or logged; and the page
// has no define, module or exports (a library then attaches itself as a plain global). The last
// group ("found in review") adds: only a plain file name and a library name that is text are
// taken, and they are looked at before anything else; a request that never answers is given up
// after VENDOR_LOAD_TIMEOUT_MS; a page that cannot make or add the script fails like any other
// load; and (the one test that runs the module in Node, with a made-up document) a late event of
// an attempt that has ended does not disturb the attempt after it.

const PROBE = "aw0-probe.js";
const PROBE_PATH = "vendor/aw0-probe.js";
// the libraries of the later phases: none may be on the page, or requested, before it needs one
const LIBRARIES = ["Papa", "XLSX", "fflate"];
const LATER_PHASE_FILES = /papaparse|xlsx|sheetjs|fflate|aw0-/i;

// ---- what the made-up file answers

// a library: it sets its global, and notes what a UMD wrapper would see when it runs
const library = (name = "Aw0Probe") => (route) =>
    route.fulfill({
        status: 200,
        contentType: "text/javascript",
        body: `window.${name} = { ok: true, seen: [typeof define, typeof module, typeof exports] };`,
    });
const aborted = (route) => route.abort("failed");
const notFoundPage = (route) =>
    route.fulfill({
        status: 404,
        contentType: "text/html",
        body: "<!doctype html><html><head><title>Not found</title></head><body><h1>404 Not Found</h1></body></html>",
    });
// the file is there and loads, and it is not the library
const notTheLibrary = (route) =>
    route.fulfill({ status: 200, contentType: "text/javascript", body: "/* a file that does not define the library */" });

const FAILURES = [
    ["an aborted request", aborted],
    ["a 404 answered with an HTML page", notFoundPage],
    ["a file that loads but does not define the global", notTheLibrary],
];

// serve answers the requests for `file` (a name in vendor/) with the responders in turn: the
// first request gets the first, the second the second, and the last one answers every later
// request. With hold, an answer waits for release(); `arrived` is a promise of the first request.
function serve(page, file, responders, { hold = false } = {}) {
    const state = { count: 0, urls: [] };
    let release;
    const gate = new Promise((resolve) => (release = resolve));
    let arrive;
    const arrived = new Promise((resolve) => (arrive = resolve));
    const list = Array.isArray(responders) ? responders : [responders];
    page.route(`**/vendor/${file}`, async (route) => {
        const respond = list[Math.min(state.count, list.length - 1)];
        state.count += 1;
        state.urls.push(route.request().url());
        arrive();
        if (hold) {
            await gate;
        }
        await respond(route);
    });
    return Object.assign(state, { release, arrived });
}

// ---- what the page does with the loader

// settle: run `calls` (an array of [file, globalName]) in the page, all at once, and give back,
// for each, how it ended: the value, or the kind of rejection
const load = (page, calls) =>
    page.evaluate(async (calls) => {
        const { vendorLoader } = await import("./bundle/app.js");
        return Promise.all(
            calls.map(async ([file, name]) => {
                try {
                    return { resolved: true, value: await vendorLoader.loadVendor(file, name) };
                } catch (error) {
                    return {
                        resolved: false,
                        isError: error instanceof Error,
                        type: typeof error,
                        message: error instanceof Error ? error.message : String(error),
                    };
                }
            })
        );
    }, calls);

// start: begin `count` calls for one file and keep their promises in window.__calls, without
// waiting for them; finish() waits for all and says how each ended
const start = (page, file, name, count) =>
    page.evaluate(
        async ([file, name, count]) => {
            const { vendorLoader } = await import("./bundle/app.js");
            window.__calls = Array.from({ length: count }, () => vendorLoader.loadVendor(file, name));
            window.__outcomes = window.__calls.map((p) =>
                p.then(
                    (value) => ({ resolved: true, same: value === window[name] }),
                    (error) => ({ resolved: false, isError: error instanceof Error, error })
                )
            );
        },
        [file, name, count]
    );

const finish = (page) =>
    page.evaluate(async () => {
        const outcomes = await Promise.all(window.__outcomes);
        return {
            outcomes: outcomes.map(({ error, ...rest }) => rest),
            // one rejection for all the callers that were waiting
            oneError: outcomes.every((o) => o.resolved) ? null : outcomes.every((o) => o.error === outcomes[0].error),
            allSame: new Set(await Promise.all(window.__calls.map((p) => p.catch((e) => e)))).size === 1,
        };
    });

// the vendored script elements the loader added
const scripts = (page, file = PROBE) => page.evaluate((file) => document.querySelectorAll(`script[src$="${file}"]`).length, file);

test.describe("a first visit", () => {
    test("asks for no library and for nothing of the later phases: no request for the probe, and no Papa, XLSX or fflate", async ({ page, app, net }) => {
        const probe = serve(page, PROBE, library());
        await app.open(NORTHLIGHT_URL);
        await app.query("SELECT 1 AS one;");

        expect(probe.count, "requests for the probe").toBe(0);
        expect(net.paths.filter((p) => LATER_PHASE_FILES.test(p))).toEqual([]);
        // what the page asks for in vendor/ is what index.html names, the engine's file and the fonts
        const html = fs.readFileSync(path.join(__dirname, "..", "index.html"), "utf8");
        const named = [...html.matchAll(/\b(?:href|src)="(vendor\/[^"?#]+)"/g)].map((m) => m[1]);
        const unexpected = net.paths.filter(
            (p) => p.startsWith("vendor/") && !named.includes(p) && p !== "vendor/sqlite3.wasm" && !p.startsWith("vendor/fonts/")
        );
        expect(unexpected, "requests in vendor/ that index.html does not name").toEqual([]);
        expect(await scripts(page)).toBe(0);
        expect(await page.evaluate((names) => names.filter((n) => n in window), LIBRARIES)).toEqual([]);
    });

    test("has no define, module or exports on the page, so a library attaches itself as a plain global", async ({ page, app }) => {
        await app.open(NORTHLIGHT_URL);
        expect(await page.evaluate(() => ["define", "module", "exports"].filter((n) => n in window))).toEqual([]);
    });

    test("a library that checks for define, module and exports sees none when it runs, and the loader adds none", async ({ page, app }) => {
        serve(page, PROBE, library());
        await app.open(NORTHLIGHT_URL);
        const [result] = await load(page, [[PROBE, "Aw0Probe"]]);
        expect(result).toEqual({ resolved: true, value: { ok: true, seen: ["undefined", "undefined", "undefined"] } });
        expect(await page.evaluate(() => ["define", "module", "exports"].filter((n) => n in window))).toEqual([]);
    });
});

test.describe("the first call", () => {
    test("adds one script element with the relative address vendor/aw0-probe.js and resolves with the library", async ({ page, app, net }) => {
        const probe = serve(page, PROBE, library());
        await app.open(NORTHLIGHT_URL);
        const before = await page.evaluate(() => document.querySelectorAll("script").length);

        const [result] = await load(page, [[PROBE, "Aw0Probe"]]);

        expect(result).toEqual({ resolved: true, value: { ok: true, seen: ["undefined", "undefined", "undefined"] } });
        const added = await page.evaluate(() => [...document.querySelectorAll("script")].map((s) => s.getAttribute("src")));
        expect(added.length).toBe(before + 1);
        expect(added.filter((src) => src.endsWith("aw0-probe.js"))).toEqual([PROBE_PATH]);
        expect(await page.evaluate(() => document.querySelector('script[src$="aw0-probe.js"]').parentElement.localName)).toBe("head");
        expect(probe.count).toBe(1);
        // the request is under the mount (not at the root of the host), so it works at /repo/ too
        expect(new URL(probe.urls[0]).pathname).toBe(net.basePath + PROBE_PATH);
        expect(net.paths.filter((p) => p.endsWith("aw0-probe.js"))).toEqual([PROBE_PATH]);
    });

    test("resolves with the very object the library put on the page", async ({ page, app }) => {
        serve(page, PROBE, library());
        await app.open(NORTHLIGHT_URL);
        const same = await page.evaluate(async () => {
            const { vendorLoader } = await import("./bundle/app.js");
            return (await vendorLoader.loadVendor("aw0-probe.js", "Aw0Probe")) === window.Aw0Probe;
        });
        expect(same).toBe(true);
    });
});

test.describe("requested once", () => {
    test("ten calls at once while the request is on its way: one request, one script, the same object for all", async ({ page, app }) => {
        const probe = serve(page, PROBE, library(), { hold: true });
        await app.open(NORTHLIGHT_URL);

        await start(page, PROBE, "Aw0Probe", 10);
        await probe.arrived;
        // the request is still on its way: nothing is there yet, and no second request is made
        await page.waitForTimeout(200);
        expect(probe.count).toBe(1);
        expect(await scripts(page)).toBe(1);
        expect(await page.evaluate(() => "Aw0Probe" in window)).toBe(false);

        probe.release();
        const done = await finish(page);
        expect(done.outcomes).toEqual(Array.from({ length: 10 }, () => ({ resolved: true, same: true })));
        expect(done.allSame, "the ten promises resolve with one object").toBe(true);
        expect(probe.count).toBe(1);
        expect(await scripts(page)).toBe(1);
    });

    test("calls after it loaded resolve at once, with the same object, and request nothing", async ({ page, app, net }) => {
        const probe = serve(page, PROBE, library());
        await app.open(NORTHLIGHT_URL);
        const [first] = await load(page, [[PROBE, "Aw0Probe"]]);
        expect(first.resolved).toBe(true);
        net.clear();

        const later = await page.evaluate(async () => {
            const { vendorLoader } = await import("./bundle/app.js");
            const pending = Symbol("not yet");
            const results = [];
            for (let i = 0; i < 3; i++) {
                // a promise that is already settled beats a timer
                const got = await Promise.race([vendorLoader.loadVendor("aw0-probe.js", "Aw0Probe"), new Promise((r) => setTimeout(() => r(pending), 50))]);
                results.push(got === pending ? "late" : got === window.Aw0Probe);
            }
            return results;
        });

        expect(later).toEqual([true, true, true]);
        expect(probe.count).toBe(1);
        expect(net.paths.filter((p) => p.endsWith("aw0-probe.js"))).toEqual([]);
        expect(await scripts(page)).toBe(1);
    });

    test("calls made in later rounds, singly and in pairs, still add up to one request", async ({ page, app }) => {
        const probe = serve(page, PROBE, library());
        await app.open(NORTHLIGHT_URL);
        await load(page, [[PROBE, "Aw0Probe"]]);
        await load(page, [[PROBE, "Aw0Probe"], [PROBE, "Aw0Probe"]]);
        await load(page, [[PROBE, "Aw0Probe"]]);
        expect(probe.count).toBe(1);
    });

    test("a library whose global is already on the page is returned without any request or script", async ({ page, app }) => {
        const probe = serve(page, "aw0-present.js", library("Aw0Present"));
        await app.open(NORTHLIGHT_URL);
        await page.evaluate(() => (window.Aw0Present = { already: "here" }));
        const before = await page.evaluate(() => document.querySelectorAll("script").length);

        const [result] = await load(page, [["aw0-present.js", "Aw0Present"]]);

        expect(result).toEqual({ resolved: true, value: { already: "here" } });
        expect(probe.count).toBe(0);
        expect(await page.evaluate(() => document.querySelectorAll("script").length)).toBe(before);
        // and it is the page's own object, not a copy
        expect(await page.evaluate(() => window.Aw0Present)).toEqual({ already: "here" });
    });

    test("two different files load independently, each requested once", async ({ page, app, net }) => {
        const a = serve(page, "aw0-a.js", library("Aw0A"), { hold: true });
        const b = serve(page, "aw0-b.js", library("Aw0B"));
        await app.open(NORTHLIGHT_URL);

        // b answers while a is still on its way
        await page.evaluate(async () => {
            const { vendorLoader } = await import("./bundle/app.js");
            window.__a = [vendorLoader.loadVendor("aw0-a.js", "Aw0A"), vendorLoader.loadVendor("aw0-a.js", "Aw0A")];
        });
        await a.arrived;
        const [b1, b2] = await load(page, [["aw0-b.js", "Aw0B"], ["aw0-b.js", "Aw0B"]]);
        expect([b1.resolved, b2.resolved]).toEqual([true, true]);
        expect(await page.evaluate(() => "Aw0A" in window)).toBe(false);

        a.release();
        const gotA = await page.evaluate(async () => (await Promise.all(window.__a)).map((v) => v === window.Aw0A));
        expect(gotA).toEqual([true, true]);
        expect(await page.evaluate(() => [typeof window.Aw0A, typeof window.Aw0B, window.Aw0A === window.Aw0B])).toEqual(["object", "object", false]);
        expect([a.count, b.count]).toEqual([1, 1]);
        expect(net.paths.filter((p) => /aw0-/.test(p)).sort()).toEqual(["vendor/aw0-a.js", "vendor/aw0-b.js"]);
        expect(await scripts(page, "aw0-a.js")).toBe(1);
        expect(await scripts(page, "aw0-b.js")).toBe(1);
    });
});

test.describe("a failure", () => {
    for (const [what, respond] of FAILURES) {
        test(`${what} rejects with an Error, removes the script and leaves nothing behind`, async ({ page, app }) => {
            const probe = serve(page, PROBE, respond);
            await app.open(NORTHLIGHT_URL);
            const before = await page.evaluate(() => document.head.innerHTML);

            const [result] = await load(page, [[PROBE, "Aw0Probe"]]);

            expect(result.resolved).toBe(false);
            expect(result.type, "a rejection is an Error, never a string").toBe("object");
            expect(result.isError).toBe(true);
            expect(result.message).not.toBe("");
            expect(probe.count).toBe(1);
            expect(await scripts(page)).toBe(0);
            expect(await page.evaluate(() => "Aw0Probe" in window)).toBe(false);
            expect(await page.evaluate(() => document.head.innerHTML)).toEqual(before);
        });

        test(`${what}: every caller that was waiting gets the rejection`, async ({ page, app }) => {
            const probe = serve(page, PROBE, respond, { hold: true });
            await app.open(NORTHLIGHT_URL);

            await start(page, PROBE, "Aw0Probe", 10);
            await probe.arrived;
            await page.waitForTimeout(100);
            probe.release();
            const done = await finish(page);

            expect(done.outcomes).toEqual(Array.from({ length: 10 }, () => ({ resolved: false, isError: true })));
            expect(done.oneError, "the same rejection for each").toBe(true);
            expect(probe.count).toBe(1);
            expect(await scripts(page)).toBe(0);
        });
    }
});

test.describe("the next use tries again", () => {
    for (const [what, respond] of FAILURES) {
        test(`after ${what}, the next call makes a new request and resolves when it succeeds`, async ({ page, app }) => {
            const probe = serve(page, PROBE, [respond, library()]);
            await app.open(NORTHLIGHT_URL);

            const [failed] = await load(page, [[PROBE, "Aw0Probe"]]);
            expect(failed.resolved).toBe(false);
            expect(probe.count).toBe(1);

            const [retried] = await load(page, [[PROBE, "Aw0Probe"]]);
            expect(retried).toEqual({ resolved: true, value: { ok: true, seen: ["undefined", "undefined", "undefined"] } });
            expect(probe.count).toBe(2);
            expect(await scripts(page)).toBe(1);

            // and it is loaded now: no third request
            await load(page, [[PROBE, "Aw0Probe"]]);
            expect(probe.count).toBe(2);
        });
    }

    test("a call that fails again fails again: each call is one request, and every failure leaves the script removed", async ({ page, app }) => {
        const probe = serve(page, PROBE, [aborted, notFoundPage, notTheLibrary, library()]);
        await app.open(NORTHLIGHT_URL);
        const outcomes = [];
        for (let i = 0; i < 4; i++) {
            const [result] = await load(page, [[PROBE, "Aw0Probe"]]);
            outcomes.push([result.resolved, probe.count, await scripts(page)]);
        }
        expect(outcomes).toEqual([
            [false, 1, 0],
            [false, 2, 0],
            [false, 3, 0],
            [true, 4, 1],
        ]);
    });

    test("a failure of one file does not make another file, or a later success, fail", async ({ page, app }) => {
        const bad = serve(page, "aw0-bad.js", aborted);
        const good = serve(page, "aw0-good.js", library("Aw0Good"));
        await app.open(NORTHLIGHT_URL);

        const [failed, loaded] = await load(page, [["aw0-bad.js", "Aw0Bad"], ["aw0-good.js", "Aw0Good"]]);
        expect(failed.resolved).toBe(false);
        expect(loaded.resolved).toBe(true);
        const [again] = await load(page, [["aw0-good.js", "Aw0Good"]]);
        expect(again.resolved).toBe(true);
        expect([bad.count, good.count]).toEqual([1, 1]);
        expect([await scripts(page, "aw0-bad.js"), await scripts(page, "aw0-good.js")]).toEqual([0, 1]);
    });
});

test.describe("nothing is shown and nothing is logged", () => {
    // the page's own console calls (not the browser's report of a failed request)
    const recordConsole = (page) =>
        page.addInitScript(() => {
            window.__consoleCalls = [];
            for (const method of ["log", "info", "warn", "error", "debug", "trace"]) {
                const original = console[method];
                console[method] = function (...args) {
                    window.__consoleCalls.push([method, args.map(String).join(" ")]);
                    return original.apply(this, args);
                };
            }
        });

    for (const [what, respond] of [["a success", library()], ...FAILURES]) {
        test(`${what}: no toast, no console call, no page error, nothing added to the page but the script`, async ({ page, app, pageErrors }) => {
            await recordConsole(page);
            serve(page, PROBE, respond);
            await app.open(NORTHLIGHT_URL);
            await app.recordToasts();
            const consoleBefore = await page.evaluate(() => window.__consoleCalls.length);
            // every element the loader's call adds to, or takes from, the document
            await page.evaluate(() => {
                window.__changes = [];
                new MutationObserver((records) => {
                    for (const r of records) {
                        for (const [kind, nodes] of [["added", r.addedNodes], ["removed", r.removedNodes]]) {
                            for (const n of nodes) {
                                window.__changes.push(`${kind} ${n.nodeName.toLowerCase()} in ${r.target.nodeName.toLowerCase()}`);
                            }
                        }
                    }
                }).observe(document.head, { childList: true });
            });

            await load(page, [[PROBE, "Aw0Probe"]]);

            await app.expectToasts([]);
            expect(await page.evaluate(() => window.__consoleCalls.slice(0)).then((calls) => calls.slice(consoleBefore))).toEqual([]);
            expect(await page.evaluate(() => window.__changes)).toEqual(
                what === "a success" ? ["added script in head"] : ["added script in head", "removed script in head"]
            );
            expect(pageErrors).toEqual([]);
        });
    }

    test("callers that handle the rejection leave no unhandled rejection or uncaught error behind", async ({ page, app, pageErrors }) => {
        const probe = serve(page, PROBE, aborted, { hold: true });
        await app.open(NORTHLIGHT_URL);
        await start(page, PROBE, "Aw0Probe", 3);
        await probe.arrived;
        probe.release();
        await finish(page);
        await page.waitForTimeout(200);
        expect(pageErrors).toEqual([]);
    });
});

test.describe("found in review", () => {
    test("only a plain file name is taken: anything with a folder in it is refused, with no request and no script", async ({ page, app, net, pageErrors }) => {
        await app.open(NORTHLIGHT_URL);
        const scripts = () => page.evaluate(() => document.scripts.length);
        const before = await scripts();
        const requestsBefore = net.paths.length;
        const bad = [
            "../outside.js",
            "../../x.js",
            "sub/inner.js",
            "/abs.js",
            "//evil.example/x.js",
            "https://evil.example/x.js",
            "a..b.js",
            ".hidden.js",
            "",
            " ",
            "with space.js",
            // a line break in a name (an address would drop it, and ask for another file)
            "aw0-probe.js\n",
            "aw0-probe.js\nb",
            "aw0-probe.js\r",
            "\naw0-probe.js",
            "aw0-\u2028probe.js",
        ];
        const outcomes = await load(page, bad.map((file) => [file, "Aw0Never"]));
        for (const [index, outcome] of outcomes.entries()) {
            expect(outcome.resolved, JSON.stringify(bad[index])).toBe(false);
            expect(outcome.isError, JSON.stringify(bad[index])).toBe(true);
        }
        // and what is not a string at all
        const odd = await page.evaluate(async () => {
            const { vendorLoader } = await import("./bundle/app.js");
            const results = [];
            for (const file of [undefined, null, 7, {}, ["aw0-probe.js"]]) {
                results.push(await vendorLoader.loadVendor(file, "Aw0Never").then(() => "resolved", (error) => error instanceof Error));
            }
            return results;
        });
        expect(odd).toEqual([true, true, true, true, true]);
        expect(await scripts()).toBe(before);
        expect(net.paths.slice(requestsBefore)).toEqual([]);
        expect(pageErrors).toEqual([]);
    });

    test("the name is looked at first: one that is not a plain file name is refused even when the library is already on the page", async ({ page, app, net }) => {
        const probe = serve(page, PROBE, library());
        await app.open(NORTHLIGHT_URL);
        expect((await load(page, [[PROBE, "Aw0Probe"]]))[0].resolved).toBe(true);
        const requestsBefore = net.paths.length;
        const outcomes = await load(page, [
            ["../aw0-probe.js", "Aw0Probe"],
            ["sub/aw0-probe.js", "Aw0Probe"],
            ["", "Aw0Probe"],
            [PROBE, "Aw0Probe"],
        ]);
        expect(outcomes.map((o) => o.resolved)).toEqual([false, false, false, true]);
        expect(outcomes.slice(0, 3).every((o) => o.isError)).toBe(true);
        expect(probe.count).toBe(1);
        expect(net.paths.slice(requestsBefore)).toEqual([]);
        expect(await scripts(page)).toBe(1);
    });

    for (const [what, breakIt, mendIt] of [
        [
            "the script cannot be added to the page",
            () => {
                document.head.append = () => {
                    throw new TypeError("append is broken");
                };
            },
            () => {
                delete document.head.append;
            },
        ],
        [
            "the script element cannot be made",
            () => {
                document.createElement = (...args) => {
                    if (String(args[0]).toLowerCase() === "script") {
                        throw new TypeError("createElement is broken");
                    }
                    return Document.prototype.createElement.apply(document, args);
                };
            },
            () => {
                delete document.createElement;
            },
        ],
    ]) {
        test(`when ${what}, the call rejects with the loader's own Error like any failure, nothing is left behind, and the next call loads the library`, async ({
            page,
            app,
            pageErrors,
        }) => {
            const probe = serve(page, PROBE, library());
            await app.open(NORTHLIGHT_URL);
            await page.evaluate(breakIt);
            const failed = await load(page, [
                [PROBE, "Aw0Probe"],
                [PROBE, "Aw0Probe"],
            ]);
            await page.evaluate(mendIt);
            for (const outcome of failed) {
                expect(outcome).toEqual({ resolved: false, isError: true, type: "object", message: `could not load ${PROBE_PATH}` });
            }
            expect(probe.count).toBe(0);
            expect(await scripts(page)).toBe(0);
            // the attempt is forgotten at once: no waiting for the time-out before the next try
            const [next] = await load(page, [[PROBE, "Aw0Probe"]]);
            expect(next.resolved).toBe(true);
            expect(next.value.ok).toBe(true);
            expect(probe.count).toBe(1);
            expect(await scripts(page)).toBe(1);
            expect(pageErrors).toEqual([]);
        });
    }

    test("a library name that is not text is refused like a bad file name: a rejection, nothing thrown, no request and no script", async ({ page, app, net, pageErrors }) => {
        const probe = serve(page, PROBE, library());
        await app.open(NORTHLIGHT_URL);
        const before = await page.evaluate(() => document.scripts.length);
        const requestsBefore = net.paths.length;
        const outcomes = await page.evaluate(async (file) => {
            const { vendorLoader } = await import("./bundle/app.js");
            const names = [
                undefined,
                null,
                "",
                0,
                7,
                {},
                [],
                ["Aw0Probe"],
                Symbol("Aw0Probe"),
                // two that cannot even be turned into the name of a property
                Object.create(null),
                {
                    toString() {
                        throw new Error("no name");
                    },
                },
                new String("Aw0Probe"),
            ];
            const results = [];
            for (const name of names) {
                let promise;
                try {
                    promise = vendorLoader.loadVendor(file, name);
                } catch {
                    results.push("threw");
                    continue;
                }
                results.push(await promise.then(() => "resolved", (error) => (error instanceof Error ? "rejected" : "rejected with something that is not an Error")));
            }
            return results;
        }, PROBE);
        expect(outcomes).toEqual(Array.from({ length: 12 }, () => "rejected"));
        expect(probe.count).toBe(0);
        expect(await page.evaluate(() => document.scripts.length)).toBe(before);
        expect(net.paths.slice(requestsBefore)).toEqual([]);
        // and the real name still loads the library afterwards
        expect((await load(page, [[PROBE, "Aw0Probe"]]))[0].resolved).toBe(true);
        expect(probe.count).toBe(1);
        expect(pageErrors).toEqual([]);
    });

    test("a library name the page will not let anyone read is a library that is not there: nothing thrown, and a rejection like any failed load", async ({
        page,
        app,
        pageErrors,
    }) => {
        // the file arrives and defines another global; the name asked for throws when it is read
        const probe = serve(page, PROBE, library("Aw0Other"));
        await app.open(NORTHLIGHT_URL);
        const outcomes = await page.evaluate(async (file) => {
            const { vendorLoader } = await import("./bundle/app.js");
            Object.defineProperty(window, "Aw0Guarded", {
                configurable: true,
                get() {
                    throw new DOMException("the page may not read this", "SecurityError");
                },
            });
            const results = [];
            try {
                for (let i = 0; i < 2; i++) {
                    let promise;
                    try {
                        promise = vendorLoader.loadVendor(file, "Aw0Guarded");
                    } catch {
                        results.push("threw");
                        continue;
                    }
                    results.push(await promise.then(() => "resolved", (error) => (error instanceof Error ? error.message : "rejected with something that is not an Error")));
                }
            } finally {
                delete window.Aw0Guarded;
            }
            return results;
        }, PROBE);
        // each call asked for the file, found no library it could read, and forgot the attempt
        expect(outcomes).toEqual([`could not load ${PROBE_PATH}`, `could not load ${PROBE_PATH}`]);
        expect(probe.count).toBe(2);
        expect(await scripts(page)).toBe(0);
        expect(pageErrors).toEqual([]);
    });

    test("in Node: a late event of an attempt that has ended does not disturb the attempt after it", async ({}, testInfo) => {
        test.skip(testInfo.project.name !== "chromium-root", "runs the module with a made-up document: once is enough");
        // A browser can join a new request to an open one for the same address, so this order of
        // events cannot be staged in a page: the module runs here with a document and timers of
        // the test's own. The timers are swapped in only while the module's own code runs.
        await inNode(fakeStorage(), async (domEvents, tab) => {
            const scripts = [];
            const timers = new Map();
            globalThis.document = {
                createElement(tag) {
                    const listeners = {};
                    const script = {
                        tag,
                        src: "",
                        removed: false,
                        addEventListener: (type, fn) => (listeners[type] ??= []).push(fn),
                        remove: () => (script.removed = true),
                        fire: (type) => (listeners[type] ?? []).forEach((fn) => fn()),
                    };
                    scripts.push(script);
                    return script;
                },
                head: { append: (script) => (script.added = true) },
            };
            const real = { setTimeout: globalThis.setTimeout, clearTimeout: globalThis.clearTimeout };
            const withTimers = (fn) => {
                globalThis.setTimeout = (callback, ms) => {
                    const id = { ms };
                    timers.set(id, callback);
                    return id;
                };
                globalThis.clearTimeout = (id) => timers.delete(id);
                try {
                    return fn();
                } finally {
                    Object.assign(globalThis, real);
                }
            };
            const outcome = (promise) => promise.then((value) => ({ value }), (error) => ({ error: error.message }));
            try {
                const { loadVendor } = await tab().load("vendor-loader.js");
                const { VENDOR_LOAD_TIMEOUT_MS } = await tab().load("config-workflow.js");
                // the first attempt never answers, and is given up when the wait is over
                const first = withTimers(() => loadVendor("lib.js", "Aw0Lib"));
                expect(scripts).toHaveLength(1);
                expect(scripts[0]).toMatchObject({ tag: "script", src: "vendor/lib.js", added: true, removed: false });
                expect([...timers.keys()]).toEqual([{ ms: VENDOR_LOAD_TIMEOUT_MS }]);
                withTimers(() => [...timers.values()][0]());
                expect(await outcome(first)).toEqual({ error: "could not load vendor/lib.js" });
                expect(scripts[0].removed).toBe(true);
                // a second attempt starts
                const second = withTimers(() => loadVendor("lib.js", "Aw0Lib"));
                expect(second).not.toBe(first);
                expect(scripts).toHaveLength(2);
                // only now does the first request end: its late events must change nothing
                withTimers(() => scripts[0].fire("error"));
                withTimers(() => scripts[0].fire("load"));
                // a third caller is given the second attempt: no third script
                const third = withTimers(() => loadVendor("lib.js", "Aw0Lib"));
                expect(third).toBe(second);
                expect(scripts).toHaveLength(2);
                expect(scripts[1].removed).toBe(false);
                // the second attempt's file arrives
                globalThis.Aw0Lib = { ok: true };
                withTimers(() => scripts[1].fire("load"));
                expect(await outcome(second)).toEqual({ value: { ok: true } });
                expect(scripts[1].removed).toBe(false);
                // no timer is left waiting: each attempt cleared its own when it ended
                expect(timers.size).toBe(0);
            } finally {
                delete globalThis.Aw0Lib;
            }
        });
    });

    test("a library that has gone from the page is loaded again by the next call", async ({ page, app }) => {
        const probe = serve(page, PROBE, library());
        await app.open(NORTHLIGHT_URL);
        expect((await load(page, [[PROBE, "Aw0Probe"]]))[0].resolved).toBe(true);
        expect(probe.count).toBe(1);
        await page.evaluate(() => delete window.Aw0Probe);
        const [again] = await load(page, [[PROBE, "Aw0Probe"]]);
        expect(again.resolved).toBe(true);
        expect(again.value.ok).toBe(true);
        expect(probe.count).toBe(2);
    });

    test("a request that never answers is given up after the wait, like any failure: the script goes, and the next call tries again", async ({ page, app, pageErrors }) => {
        // the first request is held for good; the second is answered
        let requests = 0;
        let letGo;
        const never = new Promise((resolve) => (letGo = resolve));
        await page.route(`**/vendor/${PROBE}`, async (route) => {
            requests += 1;
            if (requests === 1) {
                await never;
                return route.abort("failed").catch(() => {});
            }
            return library()(route);
        });
        await page.clock.install();
        await app.open(NORTHLIGHT_URL);
        const { VENDOR_LOAD_TIMEOUT_MS } = await import(require("node:url").pathToFileURL(path.join(__dirname, "..", "js", "lab", "config-workflow.js")).href);
        await start(page, PROBE, "Aw0Probe", 2);
        await expect.poll(() => requests).toBe(1);
        expect(await page.evaluate(() => document.querySelectorAll('script[src$="aw0-probe.js"]').length)).toBe(1);
        // just before the wait is over nothing has been decided
        await page.clock.fastForward(VENDOR_LOAD_TIMEOUT_MS - 1000);
        expect(await page.evaluate(() => document.querySelectorAll('script[src$="aw0-probe.js"]').length)).toBe(1);
        await page.clock.fastForward(2000);
        const { outcomes } = await finish(page);
        expect(outcomes).toEqual([
            { resolved: false, isError: true },
            { resolved: false, isError: true },
        ]);
        expect(await page.evaluate(() => document.querySelectorAll('script[src$="aw0-probe.js"]').length)).toBe(0);
        // The request that never answered ends here, and is waited for: a browser can join a
        // new request for an address to one that is still open, and the new one would then end
        // as the old one does. The next call asks again and gets the library.
        const ended = page.waitForEvent("requestfailed", (request) => request.url().endsWith(PROBE));
        letGo();
        await ended;
        const [next] = await load(page, [[PROBE, "Aw0Probe"]]);
        expect(next.resolved).toBe(true);
        expect(requests).toBe(2);
        expect(pageErrors).toEqual([]);
    });
});
