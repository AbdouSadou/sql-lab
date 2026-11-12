// M4 part 1: the engine side of exercise sets: validation, loading and discovery
// (js/lab/exercises.js), progress (js/lab/progress.js) and the routes that name a set
// (js/lab/router.js). The pure code is called through import() inside page.evaluate.
const {
    test,
    expect,
    realSet,
    routeSet,
    routeListing,
    listingHtml,
    routeManifest,
    realManifest,
    withSampleDataset,
    PAYLOAD,
    editorValue,
} = require("./helpers");

const LZString = require("../vendor/lz-string.min.js");
const shareHash = (state) => "#s=" + LZString.compressToEncodedURIComponent(JSON.stringify({ v: 1, ...state }));

const exercise = (extra = {}) => ({ id: "e1", title: "First", prompt: "Do it.", model_query: "select 1", ...extra });
const good = (extra = {}) => ({
    id: "s1",
    title: "A set",
    dataset: "northlight",
    exercises: [exercise()],
    ...extra,
});

// ---- validateSet ----------------------------------------------------------------------------

test.describe("validateSet", () => {
    test.beforeEach(async ({ page }) => {
        await page.goto("./");
    });

    const validate = (page, data, expectedId = "s1") =>
        page.evaluate(
            async ([data, expectedId]) => {
                const { validateSet } = await import("./bundle/app.js").then((bundle) => bundle.exercises);
                return validateSet(data, expectedId);
            },
            [data, expectedId]
        );

    test("a valid set comes back as a plain copy, with defaults filled in", async ({ page }) => {
        const out = await validate(
            page,
            good({
                title: "  Padded  ",
                extra: "ignored",
                exercises: [
                    exercise({ extra: 1, hints: ["h1", "h2"], order_matters: true, check_column_names: true }),
                    exercise({ id: "e2", title: " Two ", prompt: "  keep  " }),
                ],
            })
        );
        expect(out).toEqual({
            ok: true,
            set: {
                id: "s1",
                title: "Padded",
                dataset: "northlight",
                exercises: [
                    { id: "e1", title: "First", prompt: "Do it.", hints: ["h1", "h2"], model_query: "select 1", order_matters: true, check_column_names: true },
                    { id: "e2", title: "Two", prompt: "  keep  ", hints: [], model_query: "select 1", order_matters: false, check_column_names: false },
                ],
            },
        });
    });

    test("the shipped retail-basics set is valid", async ({ page }) => {
        const out = await validate(page, realSet(), "retail-basics");
        expect(out.ok).toBe(true);
        expect(out.set.exercises).toHaveLength(10);
        expect(out.set.dataset).toBe("northlight");
    });

    const bad = (label, data, message, expectedId = "s1") => ({ label, data, message, expectedId });
    const cases = [
        bad("null", null, /top level must be an object/),
        bad("a list", [], /top level must be an object/),
        bad("a string", "text", /top level must be an object/),
        bad("no id", { ...good(), id: undefined }, /needs an "id"/),
        bad("an id with a space", good({ id: "has space" }), /needs an "id"/, "has space"),
        bad("a number id", good({ id: 5 }), /needs an "id"/),
        bad("an id of 65 characters", good({ id: "a".repeat(65) }), /needs an "id"/),
        bad("an id that is not the file name", good({ id: "other" }), /its "id" is "other", but the file name says "s1"/),
        bad("no title", good({ title: undefined }), /needs a "title"/),
        bad("a blank title", good({ title: "  " }), /needs a "title"/),
        bad("no dataset", good({ dataset: undefined }), /needs a "dataset"/),
        bad("a dataset that is not an id", good({ dataset: "datasets/x.db" }), /needs a "dataset"/),
        bad("exercises missing", good({ exercises: undefined }), /"exercises" must be a list/),
        bad("exercises an object", good({ exercises: {} }), /"exercises" must be a list/),
        bad("exercises empty", good({ exercises: [] }), /"exercises" is empty/),
        bad("an exercise that is not an object", good({ exercises: ["x"] }), /exercise 1 must be an object/),
        bad("an exercise without an id", good({ exercises: [exercise({ id: undefined })] }), /exercise 1 needs an "id"/),
        bad("an exercise id with a slash", good({ exercises: [exercise({ id: "a/b" })] }), /exercise 1 needs an "id"/),
        bad("the second exercise bad", good({ exercises: [exercise(), exercise({ id: "" })] }), /exercise 2 needs an "id"/),
        bad("a duplicate exercise id", good({ exercises: [exercise(), exercise()] }), /exercise id "e1" is used more than once/),
        bad("a blank exercise title", good({ exercises: [exercise({ title: " " })] }), /exercise "e1" needs a "title"/),
        bad("no prompt", good({ exercises: [exercise({ prompt: undefined })] }), /exercise "e1" needs a "prompt"/),
        bad("a blank prompt", good({ exercises: [exercise({ prompt: "\n" })] }), /exercise "e1" needs a "prompt"/),
        bad("no model_query", good({ exercises: [exercise({ model_query: undefined })] }), /exercise "e1" needs a "model_query"/),
        bad("a blank model_query", good({ exercises: [exercise({ model_query: "" })] }), /exercise "e1" needs a "model_query"/),
        bad("a model_query that is a list", good({ exercises: [exercise({ model_query: ["select 1"] })] }), /"model_query"/),
        bad("hints not a list", good({ exercises: [exercise({ hints: "one" })] }), /"hints" of exercise "e1" must be a list of text/),
        bad("a hint that is a number", good({ exercises: [exercise({ hints: ["ok", 2] })] }), /"hints" of exercise "e1"/),
        bad("order_matters as text", good({ exercises: [exercise({ order_matters: "yes" })] }), /"order_matters" of exercise "e1" must be true or false/),
        bad("check_column_names as a number", good({ exercises: [exercise({ check_column_names: 1 })] }), /"check_column_names" of exercise "e1" must be true or false/),
    ];
    for (const c of cases) {
        test(`rejects ${c.label} with a specific message`, async ({ page }) => {
            const out = await validate(page, c.data, c.expectedId);
            expect(out.ok).toBe(false);
            expect(out.message).toMatch(c.message);
            expect(out.message).toMatch(/^The exercise set "[^"]+" \(exercises\/[^)]+\.json\) is not valid: /);
        });
    }

    test("a hint list may be empty and null booleans are rejected, not defaulted", async ({ page }) => {
        expect((await validate(page, good({ exercises: [exercise({ hints: [] })] }))).ok).toBe(true);
        expect((await validate(page, good({ exercises: [exercise({ order_matters: null })] }))).ok).toBe(false);
    });

    test("a message never echoes text that is not an id", async ({ page }) => {
        const hostile = PAYLOAD;
        for (const [data, id] of [
            [good({ id: hostile }), "s1"],
            [good({ id: hostile }), hostile],
            [good({ exercises: [exercise({ id: hostile })] }), "s1"],
            [good({ dataset: hostile }), "s1"],
            [good({ title: undefined, exercises: [exercise({ hints: [hostile, 1] })] }), "s1"],
            [good({ exercises: [exercise({ hints: [hostile, 1] })] }), "s1"],
            [good({ exercises: [exercise({ title: hostile, prompt: "" })] }), "s1"],
        ]) {
            const out = await validate(page, data, id);
            expect(out.ok).toBe(false);
            expect(out.message).not.toContain("<");
            expect(out.message).not.toContain("onerror");
        }
    });

    test("a pattern-valid id is echoed, and the input is not shared with the result", async ({ page }) => {
        const shared = await page.evaluate(async () => {
            const { validateSet } = await import("./bundle/app.js").then((bundle) => bundle.exercises);
            const data = { id: "s1", title: "T", dataset: "d", exercises: [{ id: "e1", title: "A", prompt: "P", model_query: "select 1", hints: ["h"] }] };
            const out = validateSet(data, "s1");
            out.set.exercises[0].hints.push("x");
            out.set.exercises[0].prompt = "changed";
            return [data.exercises[0].hints.length, data.exercises[0].prompt];
        });
        expect(shared).toEqual([1, "P"]);
    });
});

// ---- loadSet ----------------------------------------------------------------------------------

test.describe("loadSet", () => {
    // the page lists the exercise sets itself at start (and so loads them); an empty listing
    // keeps those requests out of what these tests count
    test.beforeEach(async ({ page }) => {
        await routeListing(page, listingHtml([]));
    });

    // spy records every fetch the page makes from now on
    const spy = (page) =>
        page.evaluate(() => {
            window.__fetches = [];
            const original = window.fetch;
            window.fetch = (url, init) => {
                window.__fetches.push({ url: String(url), cache: init?.cache });
                return original(url, init);
            };
        });
    const fetched = (page) =>
        page.evaluate(() => window.__fetches.filter((f) => f.url.includes("exercises")));
    const load = (page, id) =>
        page.evaluate(async (id) => {
            const { loadSet } = await import("./bundle/app.js").then((bundle) => bundle.exercises);
            return loadSet(id);
        }, id);

    test("fetches exercises/<id>.json by a relative URL with cache no-cache, and validates it", async ({ page }) => {
        await page.goto("./");
        await spy(page);
        const out = await load(page, "retail-basics");
        expect(out.ok).toBe(true);
        expect(out.set.id).toBe("retail-basics");
        expect(out.set.exercises).toHaveLength(10);
        expect(await fetched(page)).toEqual([{ url: "exercises/retail-basics.json", cache: "no-cache" }]);
    });

    test("a success is remembered for the page: one request, the same object", async ({ page }) => {
        await page.goto("./");
        await spy(page);
        const same = await page.evaluate(async () => {
            const { loadSet } = await import("./bundle/app.js").then((bundle) => bundle.exercises);
            const [a, b] = await Promise.all([loadSet("retail-basics"), loadSet("retail-basics")]);
            const c = await loadSet("retail-basics");
            return a === b && a.set === c.set;
        });
        expect(same).toBe(true);
        expect(await fetched(page)).toHaveLength(1);
    });

    test("an id that does not match the pattern is refused without a request", async ({ page }) => {
        await page.goto("./");
        await spy(page);
        for (const id of ["../datasets/manifest", "a/b", "a.b", "", " ", "x".repeat(65), PAYLOAD, "..", null, undefined, 5]) {
            const out = await load(page, id);
            expect(out.ok).toBe(false);
            expect(out.message).not.toContain("<");
            expect(out.message).not.toContain("..");
        }
        expect(await fetched(page)).toEqual([]);
    });

    test("never throws: a missing file, a server error, a refused connection, junk, an invalid set", async ({ page }) => {
        await routeSet(page, "e-500", "oops", { status: 500 });
        await routeSet(page, "e-abort", "", { status: "abort" });
        await routeSet(page, "e-junk", "{ not json");
        await routeSet(page, "e-list", "[1, 2]");
        await routeSet(page, "e-bad", { ...good(), id: "e-bad", exercises: [] });
        await routeSet(page, "e-moved", { ...good(), id: "someone-else" });
        await page.goto("./");
        const messages = {};
        for (const id of ["no-such-set", "e-500", "e-abort", "e-junk", "e-list", "e-bad", "e-moved"]) {
            const out = await load(page, id);
            expect(out.ok, id).toBe(false);
            messages[id] = out.message;
        }
        expect(messages["no-such-set"]).toBe('The exercise set "no-such-set" (exercises/no-such-set.json) could not be loaded.');
        expect(messages["e-500"]).toMatch(/could not be loaded/);
        expect(messages["e-abort"]).toMatch(/could not be loaded/);
        expect(messages["e-junk"]).toMatch(/is not valid: it is not valid JSON/);
        expect(messages["e-list"]).toMatch(/top level must be an object/);
        expect(messages["e-bad"]).toMatch(/"exercises" is empty/);
        expect(messages["e-moved"]).toMatch(/its "id" is "someone-else", but the file name says "e-moved"/);
    });

    test("a failure is not remembered: the next call tries again", async ({ page }) => {
        let status = 404;
        await page.route(/\/exercises\/flaky\.json(\?.*)?$/, (route) =>
            status === 200
                ? route.fulfill({ status, contentType: "application/json", body: JSON.stringify({ ...good(), id: "flaky" }) })
                : route.fulfill({ status, body: "no" })
        );
        await page.goto("./");
        expect((await load(page, "flaky")).ok).toBe(false);
        expect((await load(page, "flaky")).ok).toBe(false);
        status = 200;
        const out = await load(page, "flaky");
        expect(out.ok).toBe(true);
        expect(out.set.id).toBe("flaky");
    });
});

// ---- listSets ---------------------------------------------------------------------------------

test.describe("badNamesInListing", () => {
    const names = (page, html) =>
        page.evaluate(async (html) => (await import("./bundle/app.js").then((bundle) => bundle.exercises)).badNamesInListing(html), html);

    test.beforeEach(async ({ app }) => {
        await app.open();
    });

    test("plain .json file names that cannot be ids, decoded and sorted; nothing else", async ({ page }) => {
        const html = listingHtml([
            "week1.v2.json",
            "Week%203.json",
            "retail-basics.json", // an id
            "a.json", // an id
            "week1.v2.json", // twice
            "%C3%A9t%C3%A9.json",
            "has+plus.json",
            "[x].json",
            "https://evil.example/x.json", // not a file of this folder
            "//evil.example/y.json",
            "sub/z.json",
            "..%2Fq.json",
            "w%5Cx.json",
            "w\\y.json",
            "v%zz.json", // malformed percent-encoding
            "notes.txt",
            "l.JSON",
            "k.json?x=1",
            "k2.json#f",
            "dir/",
            "",
            "#",
        ]);
        expect(await names(page, html)).toEqual(["Week 3", "[x]", "has+plus", "week1.v2", "été"]);
    });

    test("each name is cut to 80 characters; names that are the same after the cut count once", async ({ page }) => {
        const long = "n".repeat(100);
        const emoji = "\u{1F600}".repeat(90);
        const html = listingHtml([`${long}a.json`, `${long}b.json`, `${emoji}.json`, `${"x".repeat(80)}.json`, `${"x".repeat(81)}.json`]);
        const out = await names(page, html);
        expect(out).toEqual(["n".repeat(80), "x".repeat(80), "\u{1F600}".repeat(80)].sort());
        expect(out.every((name) => [...name].length <= 80)).toBe(true);
    });

    test("not a listing: nothing", async ({ page }) => {
        for (const html of ["", "{}", "<<<>>><a href", "\u0000"]) {
            expect(await names(page, html)).toEqual([]);
        }
    });

    test("idsInListing is as it was: the file names that cannot be ids are not ids", async ({ page }) => {
        const html = listingHtml(["Week%203.json", "week1.v2.json", "ok.json"]);
        const ids = await page.evaluate(async (html) => (await import("./bundle/app.js").then((bundle) => bundle.exercises)).idsInListing(html), html);
        expect(ids).toEqual(["ok"]);
    });
});

test.describe("listSets", () => {
    const list = (page) =>
        page.evaluate(async () => {
            const { listSets } = await import("./bundle/app.js").then((bundle) => bundle.exercises);
            const entries = await listSets();
            return entries.map((e) => (e.ok ? { id: e.id, ok: true, title: e.set.title, count: e.set.exercises.length } : e));
        });

    // the page lists the sets itself at start, which loads them; start from an empty listing so
    // that a test sees its own requests, and let each test route what it needs after the page opened
    test.beforeEach(async ({ page }) => {
        await routeListing(page, listingHtml([]));
    });

    test("the test server answers exercises/ like the Pages workflow does: the shipped set is listed", async ({ page, app, pageErrors }) => {
        await app.open();
        await page.unroute(/\/exercises\/(index\.html)?(\?.*)?$/);
        expect(await list(page)).toEqual([
            { id: "retail-basics", ok: true, title: "Northlight Retail — SQL basics", count: 10 },
        ]);
        expect(pageErrors).toEqual([]);
    });

    test("reads python3 -m http.server's listing: each set is loaded, valid or with a problem", async ({ page, app, net }) => {
        // exactly what python3 -m http.server writes for exercises/ (with a sub-folder and the
        // page itself thrown in)
        const html = `<!DOCTYPE HTML>
<html lang="en"><head><meta charset="utf-8"><title>Directory listing for /exercises/</title></head>
<body><h1>Directory listing for /exercises/</h1><hr><ul>
<li><a href="broken.json">broken.json</a></li>
<li><a href="notes/">notes/</a></li>
<li><a href="retail-basics.json">retail-basics.json</a></li>
<li><a href="README.md">README.md</a></li>
</ul><hr></body></html>`;
        await app.open();
        await routeListing(page, html);
        await routeSet(page, "broken", { id: "broken", title: "B", dataset: "northlight", exercises: [] });
        net.clear();
        const entries = await list(page);
        expect(entries.map((e) => e.id)).toEqual(["broken", "retail-basics"]);
        expect(entries[0]).toMatchObject({ id: "broken", ok: false });
        expect(entries[0].problem).toMatch(/"exercises" is empty/);
        expect(entries[1]).toEqual({ id: "retail-basics", ok: true, title: "Northlight Retail — SQL basics", count: 10 });
        expect(net.paths.filter((p) => p.startsWith("exercises"))).toEqual(
            expect.arrayContaining(["exercises/", "exercises/broken.json", "exercises/retail-basics.json"])
        );
        expect(net.external()).toEqual([]);
    });

    test("the listing is fetched with a relative URL and cache no-cache", async ({ page, app }) => {
        await routeListing(page, listingHtml([]));
        await app.open();
        const calls = await page.evaluate(async () => {
            const calls = [];
            const original = window.fetch;
            window.fetch = (url, init) => {
                calls.push({ url: String(url), cache: init?.cache });
                return original(url, init);
            };
            const { listSets } = await import("./bundle/app.js").then((bundle) => bundle.exercises);
            await listSets();
            return calls;
        });
        expect(calls).toEqual([{ url: "exercises/", cache: "no-cache" }]);
    });

    test("sorted by id, duplicates once, percent-encoded names decoded", async ({ page, app }) => {
        await routeListing(page, listingHtml(["zeta.json", "alpha.json", "%62eta.json", "alpha.json", "Beta.json", "a-1_X.json"]));
        for (const id of ["zeta", "alpha", "beta", "Beta", "a-1_X"]) {
            await routeSet(page, id, { ...good(), id, title: `Set ${id}` });
        }
        await app.open();
        const entries = await list(page);
        // code-unit order: digits and uppercase before lowercase
        expect(entries.map((e) => e.id)).toEqual(["Beta", "a-1_X", "alpha", "beta", "zeta"]);
        expect(entries.every((e) => e.ok)).toBe(true);
    });

    test("only an href that is entirely <id>.json counts: hostile links send no request off the site", async ({ page, app, net }) => {
        const hostile = [
            "https://evil.example/x.json",
            "http://evil.example/y.json",
            "//evil.example/z.json",
            "/abs.json",
            "../datasets/manifest.json",
            "sub/h.json",
            "./i.json",
            "j.json?x=1",
            "k.json#frag",
            "l.JSON",
            "m.json ",
            " n.json",
            "o.json.txt",
            "javascript:alert(1)",
            "bad id.json",
            "p%2Fq.json",
            "%2e%2e%2fr.json",
            "%2e%2e/s.json",
            "t.json/",
            "u%00.json",
            "v%zz.json",
            ".json",
            `${"x".repeat(65)}.json`,
            "data:application/json,{}",
            "index.html",
            "retail-basics.json.bak",
            "w\\x.json",
            "https://evil.example/retail-basics.json",
            "",
            "#",
        ];
        const valid = ["a.json", "b.json"];
        const extra = `<img src="https://evil.example/pixel.png"><script src="https://evil.example/x.js"></script><link rel="stylesheet" href="https://evil.example/s.css"><iframe src="https://evil.example/f"></iframe>`;
        await app.open();
        await routeListing(page, listingHtml([...hostile, ...valid], extra));
        await routeSet(page, "a", { ...good(), id: "a" });
        await routeSet(page, "b", { ...good(), id: "b" });
        net.clear();
        const entries = await list(page);
        // the valid ids, and the plain file names of this folder that end in .json but cannot be
        // ids (listed as problems, below); everything else in the list above is no entry at all
        expect(entries.map((e) => e.id)).toEqual(["", " n", "a", "b", "bad id", "u\u0000", "x".repeat(65)]);
        expect(entries.filter((e) => !e.ok).map((e) => e.id)).toEqual(["", " n", "bad id", "u\u0000", "x".repeat(65)]);
        // the page asked for the folder and the two sets, and for nothing else at all
        expect(net.entries.map((e) => net.relative(e.url)).sort()).toEqual(["exercises/", "exercises/a.json", "exercises/b.json"]);
        expect(net.external()).toEqual([]);
    });

    test("a file whose name cannot be an id is listed as a problem, sorted with the others, and asks for nothing", async ({ page, app, net }) => {
        await app.open();
        await routeListing(page, listingHtml(["Week 3.json", "week1.v2.json", "retail-basics.json", "zz.json", "A+B.json"]));
        await routeSet(page, "zz", { ...good(), id: "zz" });
        net.clear();
        const entries = await list(page);
        // one order for all of them, by code unit
        expect(entries.map((e) => e.id)).toEqual(["A+B", "Week 3", "retail-basics", "week1.v2", "zz"]);
        const bad = entries.filter((e) => !e.ok);
        expect(bad.map((e) => e.id)).toEqual(["A+B", "Week 3", "week1.v2"]);
        for (const entry of bad) {
            expect(entry.problem).toBe(
                'The file name may use only 1 to 64 letters, digits, "_" or "-" before ".json", so the file cannot be opened. Rename it.'
            );
        }
        // no request for the files that cannot be ids, not even a failing one
        expect(net.entries.map((e) => net.relative(e.url)).sort()).toEqual([
            "exercises/",
            "exercises/retail-basics.json",
            "exercises/zz.json",
        ]);
    });

    test("the file names that cannot be ids count against the same limit, after the sets", async ({ page, app }) => {
        const hrefs = [
            ...Array.from({ length: 150 }, (_, i) => `ok${String(i).padStart(3, "0")}.json`),
            ...Array.from({ length: 150 }, (_, i) => `no ok ${String(i).padStart(3, "0")}.json`),
        ];
        await routeListing(page, listingHtml(hrefs));
        await page.route(/\/exercises\/ok\d+\.json(\?.*)?$/, (route) => route.fulfill({ status: 404, body: "" }));
        await app.open();
        const entries = await list(page);
        expect(entries).toHaveLength(200);
        // all 150 ids; the names fill the 50 places left, the first 50 by code unit. One order for all.
        expect(entries.filter((e) => /^ok\d+$/.test(e.id))).toHaveLength(150);
        expect(entries[0].id).toBe("no ok 000");
        expect(entries[49].id).toBe("no ok 049");
        expect(entries[50].id).toBe("ok000");
        expect(entries[199].id).toBe("ok149");
    });

    test("more badly named files than the limit cannot push the sets that work out of the list", async ({ page, app, net }) => {
        // capitals and spaces sort before lowercase ids, so by name alone these 205 come first
        const hrefs = [
            ...Array.from({ length: 205 }, (_, i) => `Bad%20${String(i).padStart(3, "0")}.json`),
            "retail-basics.json",
            "zeta-good.json",
        ];
        await routeListing(page, listingHtml(hrefs));
        await routeSet(page, "zeta-good", { ...good(), id: "zeta-good" });
        await app.open();
        const entries = await list(page);
        expect(entries).toHaveLength(200);
        expect(entries.filter((e) => e.ok || e.id === "retail-basics" || e.id === "zeta-good").map((e) => e.id)).toEqual([
            "retail-basics",
            "zeta-good",
        ]);
        expect(entries.filter((e) => e.id.startsWith("Bad "))).toHaveLength(198);
        // the cut names are not requested, nor are the others
        expect([...new Set(net.entries.map((e) => net.relative(e.url)).filter((p) => p.startsWith("exercises/")))].sort()).toEqual([
            "exercises/",
            "exercises/retail-basics.json",
            "exercises/zeta-good.json",
        ]);
    });

    test("an unreadable listing means no sets, quietly", async ({ page, app, pageErrors }) => {
        await app.open();
        for (const options of [{ html: "no", status: 404 }, { html: "oops", status: 500 }, { html: "", status: "abort" }]) {
            await page.unroute(/\/exercises\/(index\.html)?(\?.*)?$/);
            await routeListing(page, options.html, { status: options.status });
            expect(await list(page)).toEqual([]);
        }
        // not a listing at all: JSON, garbage, an empty page
        for (const body of ['{"datasets": []}', "<<<>>><a href", "", "\u0000\u0001"]) {
            await page.unroute(/\/exercises\/(index\.html)?(\?.*)?$/);
            await routeListing(page, body);
            expect(await list(page)).toEqual([]);
        }
        expect(pageErrors).toEqual([]);
    });

    test("a huge listing is cut at a limit", async ({ page, app, net }) => {
        const ids = Array.from({ length: 260 }, (_, i) => `gen${String(i).padStart(3, "0")}`);
        await routeListing(page, listingHtml(ids.map((id) => `${id}.json`)));
        await page.route(/\/exercises\/gen\d+\.json(\?.*)?$/, (route) => route.fulfill({ status: 404, body: "" }));
        await app.open();
        net.clear();
        const entries = await list(page);
        expect(entries).toHaveLength(200);
        expect(entries[0].id).toBe("gen000");
        expect(entries.every((e) => e.ok === false)).toBe(true);
    });

    test("a set found in a listing is also reachable directly by ?set=, with no listing at all", async ({ page, app }) => {
        // no listing at all
        await routeListing(page, "", { status: 404 });
        await page.goto("?set=retail-basics");
        await app.waitReady();
        expect(await list(page)).toEqual([]);
        await expect(app.result).not.toContainText("exercise set");
    });
});

// ---- progress ---------------------------------------------------------------------------------

test.describe("progress", () => {
    test.beforeEach(async ({ page }) => {
        await page.goto("./");
        await page.evaluate(() => localStorage.clear());
    });

    // p runs `body(progress)` in the page with the progress module; JSON-able results
    const p = (page, body, arg) =>
        page.evaluate(
            async ({ body, arg }) => {
                const progress = await import("./bundle/app.js").then((bundle) => bundle.progress);
                return new Function("progress", "arg", `return (async () => { ${body} })()`)(progress, arg);
            },
            { body, arg }
        );

    test("passes are remembered per set, passing is sticky, counts follow", async ({ page }) => {
        const out = await p(
            page,
            `
            const r = {};
            r.before = [progress.isPassed("s1", "e1"), progress.passedCount("s1")];
            progress.markPassed("s1", "e1");
            progress.markPassed("s1", "e1");
            progress.markPassed("s1", "e3");
            progress.markPassed("s2", "e2");
            r.after = [progress.isPassed("s1", "e1"), progress.isPassed("s1", "e2"), progress.isPassed("s1", "e3"), progress.isPassed("s2", "e2"), progress.isPassed("s2", "e1")];
            r.counts = [progress.passedCount("s1"), progress.passedCount("s2"), progress.passedCount("s3")];
            // with the set's own ids, a pass of a removed exercise is not counted
            r.listed = progress.passedCount("s1", ["e1", "e2", "e4"]);
            // a drafts-only exercise is not passed
            progress.saveDraft("s1", "e9", "select 1");
            r.draftOnly = progress.isPassed("s1", "e9");
            return r;`
        );
        expect(out).toEqual({
            before: [false, 0],
            after: [true, false, true, true, false],
            counts: [2, 1, 0],
            listed: 1,
            draftOnly: false,
        });
    });

    test("drafts: saved per exercise, blank removes, reset clears everything of the set only", async ({ page }) => {
        const out = await p(
            page,
            `
            const r = {};
            r.none = progress.getDraft("s1", "e1");
            progress.saveDraft("s1", "e1", "select  1;\\n -- keep this exactly");
            progress.saveDraft("s1", "e2", "select 2");
            progress.saveDraft("s2", "e1", "other set");
            r.e1 = progress.getDraft("s1", "e1");
            progress.saveDraft("s1", "e1", "select 11");
            r.e1again = progress.getDraft("s1", "e1");
            progress.saveDraft("s1", "e2", "  \\n ");
            r.e2blank = progress.getDraft("s1", "e2");
            progress.markPassed("s1", "e1");
            progress.markPassed("s2", "e1");
            progress.resetSet("s1");
            r.afterReset = [progress.isPassed("s1", "e1"), progress.getDraft("s1", "e1"), progress.passedCount("s1")];
            r.otherSet = [progress.isPassed("s2", "e1"), progress.getDraft("s2", "e1")];
            r.keys = Object.keys(localStorage).sort();
            return r;`
        );
        expect(out.none).toBeNull();
        expect(out.e1).toBe("select  1;\n -- keep this exactly");
        expect(out.e1again).toBe("select 11");
        expect(out.e2blank).toBeNull();
        expect(out.afterReset).toEqual([false, null, 0]);
        expect(out.otherSet).toEqual([true, "other set"]);
        // one key per set, under the progress prefix
        expect(out.keys).toEqual(["sqllab.progress.s2"]);
    });

    test("one storage key per set, holding passes and the student's SQL", async ({ page }) => {
        await p(page, `progress.markPassed("s1", "e1"); progress.saveDraft("s1", "e2", "select 2");`);
        const stored = await page.evaluate(() => Object.fromEntries(Object.entries(localStorage)));
        expect(Object.keys(stored)).toEqual(["sqllab.progress.s1"]);
        expect(JSON.parse(stored["sqllab.progress.s1"])).toEqual({ v: 1, passed: { e1: true }, drafts: { e2: "select 2" } });
    });

    test("progress survives a reload of the page", async ({ page }) => {
        await p(page, `progress.markPassed("s1", "e1"); progress.saveDraft("s1", "e1", "select 1");`);
        await page.reload();
        const out = await p(page, `return [progress.isPassed("s1", "e1"), progress.getDraft("s1", "e1")];`);
        expect(out).toEqual([true, "select 1"]);
    });

    test("corrupt or foreign stored JSON counts as empty, and the next write repairs it", async ({ page }) => {
        const junk = [
            "{{{ not json",
            "",
            "null",
            "[]",
            '"text"',
            "42",
            "{}",
            '{"v":2,"passed":{"e1":true}}',
            '{"v":1,"passed":[ "e1" ],"drafts":5}',
            '{"v":1,"passed":"e1","drafts":null}',
            '{"v":1,"passed":{"e1":"yes","e2":1,"bad id":true},"drafts":{"e1":5,"e2":null,"x y":"s"}}',
            '{"passed":{"e1":true}}',
        ];
        for (const text of junk) {
            const out = await p(
                page,
                `
                localStorage.setItem("sqllab.progress.s1", arg);
                return [progress.isPassed("s1", "e1"), progress.isPassed("s1", "e2"), progress.passedCount("s1"), progress.getDraft("s1", "e1"), progress.getDraft("s1", "e2")];`,
                text
            );
            expect(out, text).toEqual([false, false, 0, null, null]);
        }
        // a write over junk gives a clean record
        await p(page, `localStorage.setItem("sqllab.progress.s1", "{{{"); progress.markPassed("s1", "e1");`);
        expect(JSON.parse(await page.evaluate(() => localStorage.getItem("sqllab.progress.s1")))).toEqual({
            v: 1,
            passed: { e1: true },
            drafts: {},
        });
    });

    test("a storage exception never breaks the page; progress then lasts for the session", async ({ page, pageErrors }) => {
        const out = await p(
            page,
            `
            const r = {};
            const original = { get: Storage.prototype.getItem, set: Storage.prototype.setItem, remove: Storage.prototype.removeItem };
            const boom = () => { throw new DOMException("denied", "SecurityError"); };
            // reads and writes both throw (storage blocked)
            Storage.prototype.getItem = boom; Storage.prototype.setItem = boom; Storage.prototype.removeItem = boom;
            progress.markPassed("blocked", "e1");
            progress.saveDraft("blocked", "e1", "select 1");
            r.blocked = [progress.isPassed("blocked", "e1"), progress.passedCount("blocked"), progress.getDraft("blocked", "e1")];
            progress.resetSet("blocked");
            r.blockedReset = [progress.isPassed("blocked", "e1"), progress.getDraft("blocked", "e1")];
            // only writes throw (quota): what was written is not lost
            Storage.prototype.getItem = original.get; Storage.prototype.removeItem = original.remove;
            progress.markPassed("quota", "e1");
            r.quota = [progress.isPassed("quota", "e1"), progress.isPassed("quota", "e2")];
            progress.markPassed("quota", "e2");
            r.quota2 = progress.passedCount("quota");
            // a set whose write failed keeps its memory even once storage works again
            Storage.prototype.setItem = original.set;
            r.afterRecovery = progress.isPassed("quota", "e1");
            // another set uses storage normally again
            progress.markPassed("fine", "e1");
            r.fine = localStorage.getItem("sqllab.progress.fine") !== null;
            return r;`
        );
        expect(out.blocked).toEqual([true, 1, "select 1"]);
        expect(out.blockedReset).toEqual([false, null]);
        expect(out.quota).toEqual([true, false]);
        expect(out.quota2).toBe(2);
        expect(out.afterRecovery).toBe(true);
        expect(out.fine).toBe(true);
        expect(pageErrors).toEqual([]);
    });

    test("odd ids are ignored; ids like __proto__ are plain data", async ({ page }) => {
        const out = await p(
            page,
            `
            const r = {};
            progress.markPassed("s1", "bad id");
            progress.markPassed("bad set", "e1");
            progress.markPassed("s1", undefined);
            progress.saveDraft("s1", "e1", 5);
            r.ignored = [progress.passedCount("s1"), progress.isPassed("bad set", "e1"), progress.getDraft("s1", "e1"), progress.getDraft("bad set", "e1")];
            progress.markPassed("s1", "__proto__");
            progress.saveDraft("s1", "__proto__", "select 1");
            progress.markPassed("s1", "constructor");
            r.proto = [progress.isPassed("s1", "__proto__"), progress.getDraft("s1", "__proto__"), progress.isPassed("s1", "constructor"), progress.isPassed("s1", "toString"), progress.getDraft("s1", "toString")];
            r.polluted = ({}).polluted === undefined && Object.keys({}).length === 0;
            // and they survive a round trip through storage
            r.storedKeys = Object.keys(JSON.parse(localStorage.getItem("sqllab.progress.s1")).passed).sort();
            r.reread = [progress.isPassed("s1", "__proto__"), progress.getDraft("s1", "__proto__")];
            return r;`
        );
        expect(out.ignored).toEqual([0, false, null, null]);
        expect(out.proto).toEqual([true, "select 1", true, false, null]);
        expect(out.polluted).toBe(true);
        expect(out.reread).toEqual([true, "select 1"]);
        expect(out.storedKeys).toEqual(["__proto__", "constructor"]);
    });

    test("nothing goes in the URL, session storage or a cookie", async ({ page }) => {
        const before = await page.evaluate(() => location.href);
        await p(page, `progress.markPassed("s1", "e1"); progress.saveDraft("s1", "e1", "select 1");`);
        expect(await page.evaluate(() => location.href)).toBe(before);
        expect(await page.evaluate(() => [sessionStorage.length, document.cookie])).toEqual([0, ""]);
    });
});

// ---- the route ---------------------------------------------------------------------------------

test.describe("resolveRoute and exercise sets", () => {
    // route resolves a fake location in the page and returns something JSON-able
    const route = (page, { search = "", hash = "" } = {}) =>
        page.evaluate(
            async ({ search, hash }) => {
                const { resolveRoute } = await import("./bundle/app.js").then((bundle) => bundle.router);
                const r = await resolveRoute({ search, hash });
                return {
                    database: r.database,
                    dataset: r.dataset ? r.dataset.id : null,
                    sql: r.sql,
                    exercise: r.exercise
                        ? { setId: r.exercise.set.id, exerciseId: r.exercise.exerciseId, exerciseIds: r.exercise.set.exercises.map((e) => e.id), dataset: r.exercise.set.dataset }
                        : null,
                    damaged: r.damaged,
                    notice: r.notice,
                    problem: r.problem,
                };
            },
            { search, hash }
        );
    // setFetches counts the set files the page asked for from now on
    const countSetFetches = (page) =>
        page.evaluate(() => {
            window.__setFetches = [];
            const original = window.fetch;
            window.fetch = (url, init) => {
                if (String(url).includes("exercises/")) window.__setFetches.push(String(url));
                return original(url, init);
            };
        });
    const setFetches = (page) => page.evaluate(() => window.__setFetches);

    test("?set=<id> opens the set and its dataset; exercise is null without &ex=", async ({ page, app }) => {
        await app.open();
        const out = await route(page, { search: "?set=retail-basics" });
        expect(out).toMatchObject({
            dataset: "northlight",
            sql: null,
            notice: null,
            problem: null,
            damaged: false,
            exercise: { setId: "retail-basics", exerciseId: null, dataset: "northlight" },
        });
        expect(out.exercise.exerciseIds).toHaveLength(10);
    });

    test("&ex=<id> picks an exercise of the set", async ({ page, app }) => {
        await app.open();
        const out = await route(page, { search: "?set=retail-basics&ex=e04" });
        expect(out.exercise).toMatchObject({ setId: "retail-basics", exerciseId: "e04" });
        expect(out.notice).toBeNull();
    });

    test("an exercise id that is not in the set is ignored with a notice", async ({ page, app }) => {
        await app.open();
        const out = await route(page, { search: "?set=retail-basics&ex=e99" });
        expect(out.exercise).toMatchObject({ setId: "retail-basics", exerciseId: null });
        expect(out.dataset).toBe("northlight");
        expect(out.notice).toBe('There is no exercise "e99" in this set, so none is selected.');
        // an id that cannot be one is not echoed
        const hostile = await route(page, { search: `?set=retail-basics&ex=${encodeURIComponent(PAYLOAD)}` });
        expect(hostile.exercise.exerciseId).toBeNull();
        expect(hostile.notice).not.toContain("<");
        expect(hostile.notice).toContain("not in this set");
    });

    test("&ex= without a set is ignored, and fetches no set", async ({ page, app }) => {
        await app.open();
        await countSetFetches(page);
        const out = await route(page, { search: "?ex=e01" });
        expect(out).toMatchObject({ exercise: null, notice: null, dataset: "northlight" });
        expect(await setFetches(page)).toEqual([]);
    });

    test("a set that cannot be loaded gives a notice and the route goes on without it", async ({ page, app }) => {
        await routeSet(page, "broken", { ...good(), id: "broken", exercises: [] });
        await app.open();
        const missing = await route(page, { search: "?set=no-such-set" });
        expect(missing.exercise).toBeNull();
        expect(missing.dataset).toBe("northlight"); // the default
        expect(missing.notice).toContain('"no-such-set"');
        expect(missing.notice).toContain("could not be opened");
        const broken = await route(page, { search: "?set=broken&ex=e1" });
        expect(broken.exercise).toBeNull();
        expect(broken.notice).toContain('"broken"');
        expect(broken.notice).toContain('"exercises" is empty');
        // ... with &db= next in line
        const withDb = await route(page, { search: "?set=no-such-set&db=northlight" });
        expect(withDb).toMatchObject({ exercise: null, dataset: "northlight" });
        const unknownDb = await route(page, { search: "?set=no-such-set&db=nope" });
        expect(unknownDb.notice).toContain('"no-such-set"');
        expect(unknownDb.notice).toContain('"nope"');
    });

    test("a notice names no untrusted text unless it matches the id pattern", async ({ page, app }) => {
        await app.open();
        for (const search of [`?set=${encodeURIComponent(PAYLOAD)}`, `?set=${encodeURIComponent("../datasets/manifest")}`, `?set=${"a".repeat(65)}`]) {
            const out = await route(page, { search });
            expect(out.exercise).toBeNull();
            expect(out.notice).toMatch(/exercise set in the address could not be opened/);
            expect(out.notice).not.toContain("<");
            expect(out.notice).not.toContain("manifest");
            expect(out.notice).not.toContain("aaaa");
        }
    });

    test("a set whose dataset is not in the manifest gives a notice", async ({ page, app }) => {
        await routeSet(page, "orphan", { ...good(), id: "orphan", dataset: "missing-data" });
        await app.open();
        const out = await route(page, { search: "?set=orphan&ex=e1" });
        expect(out.exercise).toBeNull();
        expect(out.dataset).toBe("northlight");
        expect(out.notice).toContain('"orphan"');
        expect(out.notice).toContain('"missing-data"');
        expect(out.notice).toContain("not available on this site");
        // and with ?db= it carries on to that
        await page.evaluate(() => 0);
        expect((await route(page, { search: "?set=orphan&db=northlight" })).dataset).toBe("northlight");
    });

    test("a valid set wins over ?db= : loading a set loads its dataset", async ({ page }) => {
        await withSampleDataset(page);
        await routeSet(page, "fruit", { ...good(), id: "fruit", dataset: "sample" });
        await page.goto("./");
        const out = await route(page, { search: "?set=fruit&db=northlight" });
        expect(out).toMatchObject({ dataset: "sample", exercise: { setId: "fruit", dataset: "sample" }, notice: null });
        // without a set, ?db= is as before
        expect((await route(page, { search: "?db=sample" })).dataset).toBe("sample");
    });

    test("priority: a share fragment, then a plain fragment, then ?set=, then ?db=", async ({ page, app }) => {
        await withSampleDataset(page);
        await routeSet(page, "fruit", { ...good(), id: "fruit", dataset: "sample" });
        await app.open();
        await countSetFetches(page);

        // share fragment beats ?set= and ?db=
        const shared = await route(page, {
            search: "?set=retail-basics&db=northlight",
            hash: shareHash({ d: "sample", q: "select 1" }),
        });
        expect(shared).toMatchObject({ dataset: "sample", sql: "select 1", exercise: null });
        // the set in the link is the one that counts, not the ?set= of the address
        const sharedSet = await route(page, {
            search: "?set=retail-basics",
            hash: shareHash({ x: "fruit", e: "e1", q: "select 2" }),
        });
        expect(sharedSet).toMatchObject({ dataset: "sample", sql: "select 2", exercise: { setId: "fruit", exerciseId: "e1" } });

        // a plain fragment beats ?set=: no set is even requested
        await countSetFetches(page);
        const plain = await route(page, { search: "?set=retail-basics", hash: "#datasets/x.db" });
        expect(plain).toMatchObject({ database: "datasets/x.db", exercise: null, dataset: null });
        expect(await setFetches(page)).toEqual([]);

        // ?set= beats ?db=, ?db= beats the default
        expect((await route(page, { search: "?set=fruit&db=northlight" })).dataset).toBe("sample");
        expect((await route(page, { search: "?db=sample" })).dataset).toBe("sample");
        expect((await route(page, { search: "" })).dataset).toBe("northlight");
    });

    test("a share link's set wins over the dataset id in the link", async ({ page }) => {
        await withSampleDataset(page);
        await routeSet(page, "fruit", { ...good(), id: "fruit", dataset: "sample" });
        await page.goto("./");
        // the link says northlight; the set says sample
        const out = await route(page, { hash: shareHash({ d: "northlight", x: "fruit", e: "e1", q: "select * from fruit" }) });
        expect(out).toMatchObject({ dataset: "sample", sql: "select * from fruit", exercise: { setId: "fruit", exerciseId: "e1" }, notice: null });
        // even an unknown dataset id in the link is not worth a notice
        const unknown = await route(page, { hash: shareHash({ d: "gone", x: "fruit" }) });
        expect(unknown).toMatchObject({ dataset: "sample", notice: null, exercise: { setId: "fruit", exerciseId: null } });
    });

    test("a share link's set that cannot be loaded: a notice, and the link still restores its SQL and dataset", async ({ page, app }) => {
        await withSampleDataset(page);
        await app.open();
        const out = await route(page, { hash: shareHash({ d: "sample", x: "no-such-set", e: "e1", q: "select 41" }) });
        expect(out).toMatchObject({ dataset: "sample", sql: "select 41", exercise: null, damaged: false, problem: null });
        expect(out.notice).toContain('"no-such-set"');
        // no dataset in the link either: the default, with both notices
        const none = await route(page, { hash: shareHash({ x: "no-such-set", q: "select 42" }) });
        expect(none).toMatchObject({ dataset: "northlight", sql: "select 42", exercise: null });
        expect(none.notice).toContain('"no-such-set"');
        expect(none.notice).toContain("does not name a database");
    });

    test("a share link's exercise that is not in the set: ignored with a notice", async ({ page, app }) => {
        await app.open();
        const out = await route(page, { hash: shareHash({ x: "retail-basics", e: "e77", q: "select 1" }) });
        expect(out).toMatchObject({ dataset: "northlight", sql: "select 1", exercise: { setId: "retail-basics", exerciseId: null } });
        expect(out.notice).toContain('"e77"');
    });

    test("a damaged share link still opens the default dataset, with no set", async ({ page, app }) => {
        await app.open();
        const out = await route(page, { hash: "#s=!!!" });
        expect(out).toMatchObject({ damaged: true, exercise: null, dataset: "northlight" });
    });

    test("with an unusable manifest a set cannot open a dataset; nothing throws", async ({ page }) => {
        await routeManifest(page, "", { status: "abort" });
        await page.goto("./");
        const out = await route(page, { search: "?set=retail-basics&ex=e01" });
        expect(out.exercise).toBeNull();
        expect(out.dataset).toBeNull();
        expect(out.problem).toMatch(/could not be loaded/);
    });

    test("AC4 a share link with a set and exercise restores SQL, dataset and exercise in a fresh context", async ({ browser, baseURL }) => {
        // the part of AC4 the engine owns: the route carries all three
        const context = await browser.newContext({ baseURL });
        try {
            const page = await context.newPage();
            await page.goto(`./${shareHash({ d: "northlight", x: "retail-basics", e: "e05", q: "select 5 as five" })}`);
            // (nothing ran: the results pane says so under "no result yet", where the status line did)
            await expect(page.locator("#results-pane")).toHaveAttribute("data-state", "empty");
            await expect(page.locator("#result .results-empty-text")).toContainText("A shared query is in the editor");
            expect(await editorValue(page)).toBe("select 5 as five");
            // the dataset is open: the switcher names it, and the engine holds its file
            await expect(page.locator("#database-button-name")).toHaveText("Northlight Retail");
            expect(await page.evaluate(() => window.app.database.name)).toBe("northlight_retail.db");
            const out = await route(page, { hash: await page.evaluate(() => location.hash) });
            expect(out).toMatchObject({ dataset: "northlight", sql: "select 5 as five", exercise: { setId: "retail-basics", exerciseId: "e05" } });
        } finally {
            await context.close();
        }
    });

    test("the page opens a set's dataset, shows a notice for a bad set, and runs nothing by itself", async ({ page, app, pageErrors }) => {
        await withSampleDataset(page);
        await routeSet(page, "fruit", { ...good(), id: "fruit", dataset: "sample" });
        await page.goto("?set=fruit&ex=e1&db=northlight");
        await app.waitReady();
        await expect(app.databaseLabel).toHaveText("Sample Fruit");
        expect(await page.evaluate(() => window.app.database.name)).toBe("sample.db");
        expect(await app.pickedText()).toBe("Sample Fruit");

        // a bad set: the default dataset opens and the empty results pane's notice says why; the id
        // is text only
        await page.goto("?set=no-such-set");
        await expect(app.emptyState.locator(".results-empty-notice")).toContainText('The exercise set "no-such-set" could not be opened');
        await expect(app.databaseLabel).toHaveText("Northlight Retail");
        expect(await page.evaluate(() => window.app.database.name)).toBe("northlight_retail.db");

        await page.goto(`?set=${encodeURIComponent(PAYLOAD)}`);
        await expect(app.emptyState.locator(".results-empty-notice")).toContainText("The exercise set in the address could not be opened");
        await app.expectInert();
        expect(pageErrors).toEqual([]);
    });

    test("the dataset manifest in the repo has the dataset the shipped set names", async () => {
        expect(realManifest().datasets.map((d) => d.id)).toContain(realSet().dataset);
    });
});
