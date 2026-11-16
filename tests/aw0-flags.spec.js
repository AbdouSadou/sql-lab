const path = require("node:path");
const { pathToFileURL } = require("node:url");
const {
    test,
    expect,
    App,
    DEFAULT_DATASET,
    NORTHLIGHT_URL,
    SAMPLE_FILE,
    realManifest,
    realSet,
    fakeStorage,
    inNode,
} = require("./helpers");

// Assessment plan, Phase 0 (groundwork): the preview flags (js/lab/flags.js, settings in
// js/lab/config-workflow.js; plan section 2, "Preview switch"). Each new feature of the plan sits behind a
// named flag, off by default, and a visit turns flags on for itself with ?preview=name,name. The
// address is read once, when the page loads, and kept in memory; opening a dataset, a file or an
// exercise set drops the parameter from the address and the flag stays on; only Open from URL keeps
// the parameter; a flag never travels in a share link or an evidence file; and the groundwork alone
// changes nothing a student can see.
//
// The first group runs the rule itself, and the module with no page, in Node (once, not on every
// project: it checks files, not the page). The second drives the real page and reaches the module
// through bundle/app.js (its "flags" export).

const load = (file) => import(pathToFileURL(path.join(__dirname, "..", "js", "lab", file)).href);

// The flags as they ship. A phase that adds a flag adds its name here and in ALL_OFF, on purpose:
// most of this file compares whole results with them.
const NAMES = ["import", "export", "excel-import", "excel-export"];
const ALL_OFF = { import: false, export: false, "excel-import": false, "excel-export": false };
const only = (...on) => ({ ...ALL_OFF, ...Object.fromEntries(on.map((name) => [name, true])) });

// a database that is not the default one, to pick from the switcher
const OTHER_DATASET = realManifest().datasets.find((entry) => entry.id !== DEFAULT_DATASET.id);

// ---- in Node ---------------------------------------------------------------------------------

test.describe("the rule and the module, with no page (in Node)", () => {
    test.beforeEach(({}, testInfo) => {
        test.skip(testInfo.project.name !== "chromium-root", "checks files, not the page: once is enough");
    });

    test("the shipped defaults are four flags, all off, and the parameter is called preview", async () => {
        const { PREVIEW_FLAGS, PREVIEW_FLAG_NEEDS, PREVIEW_PARAM } = await load("config-workflow.js");
        expect(PREVIEW_PARAM).toBe("preview");
        expect(Object.keys(PREVIEW_FLAGS).sort()).toEqual([...NAMES].sort());
        expect(PREVIEW_FLAGS).toEqual(ALL_OFF);
        for (const name of NAMES) {
            expect(PREVIEW_FLAGS[name], name).toBe(false);
        }
        expect(PREVIEW_FLAG_NEEDS).toEqual({ "excel-import": "import", "excel-export": "export" });
    });

    test("with no parameter, or none that names a flag, every flag is off", async () => {
        const { readFlags } = await load("flags.js");
        for (const search of ["", "?", "?db=northlight", "?set=retail-basics&ex=e1", "?other=import", "?previews=import"]) {
            expect(readFlags(search), JSON.stringify(search)).toEqual(ALL_OFF);
        }
        expect(readFlags(undefined)).toEqual(ALL_OFF);
        expect(readFlags(null)).toEqual(ALL_OFF);
    });

    test("one name turns that flag on and no other", async () => {
        const { readFlags } = await load("flags.js");
        expect(readFlags("?preview=import")).toEqual(only("import"));
        expect(readFlags("?preview=export")).toEqual(only("export"));
    });

    test("several names are separated by commas, in one preview= parameter or in several", async () => {
        const { readFlags } = await load("flags.js");
        expect(readFlags("?preview=import,export")).toEqual(only("import", "export"));
        expect(readFlags("?preview=export,import")).toEqual(only("import", "export"));
        expect(readFlags("?preview=import&preview=export")).toEqual(only("import", "export"));
        expect(readFlags("?preview=import,export&preview=excel-import,excel-export")).toEqual(
            only("import", "export", "excel-import", "excel-export")
        );
    });

    test("spaces round a name are ignored, as a plus sign or an encoded space in the address", async () => {
        const { readFlags } = await load("flags.js");
        expect(readFlags("?preview=%20import%20,%20export%20")).toEqual(only("import", "export"));
        expect(readFlags("?preview=import+,+export")).toEqual(only("import", "export"));
        expect(readFlags("?preview=%09import%0A")).toEqual(only("import"));
    });

    test("an encoded comma separates names like a plain one", async () => {
        const { readFlags } = await load("flags.js");
        expect(readFlags("?preview=import%2Cexport")).toEqual(only("import", "export"));
        expect(readFlags("?preview=import%2cexport")).toEqual(only("import", "export"));
    });

    test("a name given twice is on once, and empty parts do no harm", async () => {
        const { readFlags } = await load("flags.js");
        expect(readFlags("?preview=import,import")).toEqual(only("import"));
        expect(readFlags("?preview=import&preview=import")).toEqual(only("import"));
        expect(readFlags("?preview=,,import,,")).toEqual(only("import"));
        expect(readFlags("?preview=,%20,")).toEqual(ALL_OFF);
    });

    test("an empty value turns nothing on", async () => {
        const { readFlags } = await load("flags.js");
        expect(readFlags("?preview=")).toEqual(ALL_OFF);
        expect(readFlags("?preview")).toEqual(ALL_OFF);
        expect(readFlags("?preview=&preview=")).toEqual(ALL_OFF);
        expect(readFlags("?preview=&preview=import")).toEqual(only("import"));
    });

    test("other parameters beside preview are not read as flags and do not hide it", async () => {
        const { readFlags } = await load("flags.js");
        expect(readFlags("?db=northlight&preview=import")).toEqual(only("import"));
        expect(readFlags("?preview=import&db=northlight")).toEqual(only("import"));
        expect(readFlags("?set=retail-basics&preview=export&ex=e2")).toEqual(only("export"));
        expect(readFlags("?db=import&set=export")).toEqual(ALL_OFF);
        expect(readFlags("?x=1&preview=import,export&y=2")).toEqual(only("import", "export"));
    });

    test("a name the app does not know is ignored, and so is a name in another letter case", async () => {
        const { readFlags } = await load("flags.js");
        for (const value of ["bogus", "Import", "IMPORT", "iMpOrT", "Excel-Import", "excel_import", "excelimport", "import.", "im port"]) {
            expect(readFlags(`?preview=${encodeURIComponent(value)}`), value).toEqual(ALL_OFF);
        }
        // an unknown name beside a known one does not stop the known one
        expect(readFlags("?preview=bogus,import,Export")).toEqual(only("import"));
    });

    test("names that exist on every object are ignored and do not change the result's shape", async () => {
        const { readFlags } = await load("flags.js");
        for (const value of ["__proto__", "constructor", "toString", "hasOwnProperty", "valueOf", "prototype", "__defineGetter__"]) {
            const result = readFlags(`?preview=${value}`);
            expect(result, value).toEqual(ALL_OFF);
            expect(Object.keys(result), value).toEqual(Object.keys(ALL_OFF));
            expect(Object.getPrototypeOf(result), value).toBe(Object.prototype);
        }
        const both = readFlags("?preview=__proto__,import,constructor");
        expect(both).toEqual(only("import"));
        expect(Object.getPrototypeOf(both)).toBe(Object.prototype);
        // nothing leaked onto Object
        expect({}.import).toBeUndefined();
        expect({}.polluted).toBeUndefined();
    });

    test("a very long value never throws and still finds a name at its end", async () => {
        const { readFlags } = await load("flags.js");
        expect(readFlags(`?preview=${"x".repeat(200_000)}`)).toEqual(ALL_OFF);
        expect(readFlags(`?preview=${"bogus,".repeat(40_000)}`)).toEqual(ALL_OFF);
        expect(readFlags(`?preview=${"bogus,".repeat(40_000)}export`)).toEqual(only("export"));
        expect(readFlags(`?preview=import${" ".repeat(100_000)}`)).toEqual(only("import"));
        expect(readFlags("?" + "preview=import&".repeat(20_000))).toEqual(only("import"));
    });

    test("a malformed address never throws", async () => {
        const { readFlags } = await load("flags.js");
        for (const search of ["?preview=%", "?preview=%ZZ,import", "?preview=%E0%A4%A", "?%=%&&&==preview", "?preview=\u0000", "?preview=\ud800"]) {
            expect(() => readFlags(search), JSON.stringify(search)).not.toThrow();
        }
        expect(readFlags("?preview=%ZZ,import")).toEqual(only("import"));
        expect(readFlags("?preview=%")).toEqual(ALL_OFF);
        expect(() => readFlags(123)).not.toThrow();
        expect(() => readFlags({})).not.toThrow();
        expect(() => readFlags(Symbol.iterator.description)).not.toThrow();
    });

    test("excel-import is off without import and on with it, in either order in the address", async () => {
        const { readFlags } = await load("flags.js");
        expect(readFlags("?preview=excel-import")).toEqual(ALL_OFF);
        expect(readFlags("?preview=excel-import,export")).toEqual(only("export"));
        expect(readFlags("?preview=excel-import,import")).toEqual(only("import", "excel-import"));
        expect(readFlags("?preview=import,excel-import")).toEqual(only("import", "excel-import"));
        expect(readFlags("?preview=excel-import&preview=import")).toEqual(only("import", "excel-import"));
        expect(readFlags("?preview=import&preview=excel-import")).toEqual(only("import", "excel-import"));
        // import alone does not turn its Excel flag on
        expect(readFlags("?preview=import")).toEqual(only("import"));
    });

    test("excel-export is off without export and on with it, in either order in the address", async () => {
        const { readFlags } = await load("flags.js");
        expect(readFlags("?preview=excel-export")).toEqual(ALL_OFF);
        expect(readFlags("?preview=excel-export,import")).toEqual(only("import"));
        expect(readFlags("?preview=excel-export,export")).toEqual(only("export", "excel-export"));
        expect(readFlags("?preview=export,excel-export")).toEqual(only("export", "excel-export"));
        expect(readFlags("?preview=excel-export&preview=export")).toEqual(only("export", "excel-export"));
        expect(readFlags("?preview=export&preview=excel-export")).toEqual(only("export", "excel-export"));
        expect(readFlags("?preview=export")).toEqual(only("export"));
    });

    test("the two Excel flags depend each on their own flag and not on the other side's", async () => {
        const { readFlags } = await load("flags.js");
        expect(readFlags("?preview=import,excel-export")).toEqual(only("import"));
        expect(readFlags("?preview=export,excel-import")).toEqual(only("export"));
        expect(readFlags("?preview=import,export,excel-import,excel-export")).toEqual(
            only("import", "export", "excel-import", "excel-export")
        );
    });

    test("a default set to true in the table turns that flag on with no parameter", async () => {
        const { readFlags } = await load("flags.js");
        const { PREVIEW_FLAG_NEEDS } = await load("config-workflow.js");
        expect(readFlags("", { ...ALL_OFF, import: true }, PREVIEW_FLAG_NEEDS)).toEqual(only("import"));
        expect(readFlags("?db=northlight", { ...ALL_OFF, export: true }, PREVIEW_FLAG_NEEDS)).toEqual(only("export"));
        expect(readFlags("", { ...ALL_OFF, import: true, "excel-import": true }, PREVIEW_FLAG_NEEDS)).toEqual(
            only("import", "excel-import")
        );
        // a parameter adds to the defaults and never switches one off
        expect(readFlags("?preview=export", { ...ALL_OFF, import: true }, PREVIEW_FLAG_NEEDS)).toEqual(only("import", "export"));
        expect(readFlags("?preview=bogus", { ...ALL_OFF, import: true }, PREVIEW_FLAG_NEEDS)).toEqual(only("import"));
    });

    test("a flag that needs another stays off when the other is off, whatever its own default", async () => {
        const { readFlags } = await load("flags.js");
        const { PREVIEW_FLAG_NEEDS } = await load("config-workflow.js");
        expect(readFlags("", { ...ALL_OFF, "excel-import": true }, PREVIEW_FLAG_NEEDS)).toEqual(ALL_OFF);
        expect(readFlags("", { ...ALL_OFF, "excel-export": true }, PREVIEW_FLAG_NEEDS)).toEqual(ALL_OFF);
        expect(readFlags("", { import: true, export: false, "excel-import": true, "excel-export": true }, PREVIEW_FLAG_NEEDS)).toEqual(
            only("import", "excel-import")
        );
        // and the parameter cannot give it what its needed flag lacks
        expect(readFlags("?preview=excel-import", { ...ALL_OFF, export: true }, PREVIEW_FLAG_NEEDS)).toEqual(only("export"));
    });

    test("the needs table is the rule: a table of its own is followed, and an empty one means no dependency", async () => {
        const { readFlags } = await load("flags.js");
        const defaults = { a: false, b: false, c: false };
        expect(readFlags("?preview=b", defaults, { b: "a" })).toEqual({ a: false, b: false, c: false });
        expect(readFlags("?preview=a,b", defaults, { b: "a" })).toEqual({ a: true, b: true, c: false });
        expect(readFlags("?preview=excel-import", ALL_OFF, {})).toEqual(only("excel-import"));
        // a name comes from the table of defaults, not from the shipped four
        expect(readFlags("?preview=a,import", defaults, {})).toEqual({ a: true, b: false, c: false });
    });

    test("a chain of needs comes out the same in whatever order the table lists it", async () => {
        const { readFlags } = await load("flags.js");
        const defaults = { a: false, b: false, c: false };
        // a needs b, b needs c: with c off, all three are off
        for (const needs of [{ a: "b", b: "c" }, { b: "c", a: "b" }]) {
            expect(readFlags("?preview=a,b", defaults, needs), JSON.stringify(needs)).toEqual({ a: false, b: false, c: false });
            expect(readFlags("?preview=a,c", defaults, needs), JSON.stringify(needs)).toEqual({ a: false, b: false, c: true });
            expect(readFlags("?preview=a,b,c", defaults, needs), JSON.stringify(needs)).toEqual({ a: true, b: true, c: true });
        }
        // a flag that needs itself, or two that need each other, cannot hang the page
        expect(readFlags("?preview=a", defaults, { a: "a" })).toEqual({ a: true, b: false, c: false });
        expect(readFlags("?preview=a", defaults, { a: "b", b: "a" })).toEqual({ a: false, b: false, c: false });
        expect(readFlags("?preview=a,b", defaults, { a: "b", b: "a" })).toEqual({ a: true, b: true, c: false });
        // a need that names no flag can never be met
        expect(readFlags("?preview=a", defaults, { a: "nothing" })).toEqual({ a: false, b: false, c: false });
    });

    test("readFlags makes a new result each time and leaves the table of defaults as it was", async () => {
        const { readFlags } = await load("flags.js");
        const defaults = { ...ALL_OFF };
        const first = readFlags("?preview=import", defaults);
        const second = readFlags("?preview=import", defaults);
        expect(first).not.toBe(second);
        first.import = false;
        expect(readFlags("?preview=import", defaults)).toEqual(only("import"));
        expect(defaults).toEqual(ALL_OFF);
    });

    test("the module loads in Node, where there is no location, and every flag is at its default", async () => {
        expect(typeof location).toBe("undefined");
        const { flags, flagOn } = await load("flags.js");
        const { PREVIEW_FLAGS } = await load("config-workflow.js");
        expect(flags()).toEqual(PREVIEW_FLAGS);
        expect(flags()).toEqual(ALL_OFF);
        for (const name of NAMES) {
            expect(flagOn(name), name).toBe(false);
        }
    });

    test("flagOn is false for a name that is not a flag, whatever it is called", async () => {
        const { flagOn } = await load("flags.js");
        for (const name of ["bogus", "Import", "__proto__", "constructor", "toString", "hasOwnProperty", "", undefined, null, 7]) {
            expect(flagOn(name), String(name)).toBe(false);
        }
    });

    test("flags() is a copy: changing it changes nothing in the module", async () => {
        const { flags, flagOn } = await load("flags.js");
        const copy = flags();
        copy.import = true;
        copy.extra = true;
        expect(flagOn("import")).toBe(false);
        expect(flags()).toEqual(ALL_OFF);
    });

    test("the address is read when the module first runs and never again, and the module touches no storage", async () => {
        const storage = fakeStorage();
        await inNode(storage, async (_events, tab) => {
            globalThis.location = { search: "?db=northlight&preview=import,export,excel-export" };
            try {
                const copy = await tab().load("flags.js");
                expect(copy.flags()).toEqual(only("import", "export", "excel-export"));
                expect(copy.flagOn("import")).toBe(true);
                expect(copy.flagOn("excel-import")).toBe(false);
                // the visit goes on to another address: the flags stay as they were read
                globalThis.location = { search: "?db=northlight" };
                expect(copy.flags()).toEqual(only("import", "export", "excel-export"));
                expect(copy.flagOn("import")).toBe(true);
                // another copy of the module (another tab) reads its own address
                const later = await tab().load("flags.js");
                expect(later.flags()).toEqual(ALL_OFF);
            } finally {
                delete globalThis.location;
            }
        });
        expect(storage.data.size).toBe(0);
    });

    test("a location that cannot be read leaves every flag at its default and does not throw", async () => {
        await inNode(fakeStorage(), async (_events, tab) => {
            Object.defineProperty(globalThis, "location", {
                configurable: true,
                get() {
                    throw new Error("no location here");
                },
            });
            try {
                const copy = await tab().load("flags.js");
                expect(copy.flags()).toEqual(ALL_OFF);
            } finally {
                delete globalThis.location;
            }
        });
    });
});

// ---- in the page -----------------------------------------------------------------------------

// the flags the page's own module holds (bundle/app.js is the page's one copy: a test never
// imports a module of js/ into the page)
const pageFlags = (page) =>
    page.evaluate(async () => {
        const { flags } = await import("./bundle/app.js");
        return { all: flags.flags(), on: Object.fromEntries(Object.keys(flags.flags()).map((name) => [name, flags.flagOn(name)])) };
    });

test.describe("the flags in the page", () => {
    test("with no parameter every flag is off", async ({ app, page }) => {
        await app.open("./");
        const seen = await pageFlags(page);
        expect(seen.all).toEqual(ALL_OFF);
        expect(seen.on).toEqual(ALL_OFF);
    });

    test("?preview=import turns the import flag on and no other", async ({ app, page }) => {
        await app.open("./?preview=import");
        const seen = await pageFlags(page);
        expect(seen.all).toEqual(only("import"));
        expect(seen.on).toEqual(only("import"));
    });

    test("?preview=import,export turns both on and leaves the Excel flags off", async ({ app, page }) => {
        await app.open("./?preview=import,export");
        expect((await pageFlags(page)).all).toEqual(only("import", "export"));
    });

    test("the Excel flags follow their needs in the page too", async ({ app, page }) => {
        await app.open("./?preview=excel-import,excel-export");
        expect((await pageFlags(page)).all).toEqual(ALL_OFF);
        await app.open("./?preview=excel-import,import");
        expect((await pageFlags(page)).all).toEqual(only("import", "excel-import"));
        await app.open("./?preview=excel-export&preview=export");
        expect((await pageFlags(page)).all).toEqual(only("export", "excel-export"));
    });

    test("a name in the wrong letter case is not a flag in the page", async ({ app, page }) => {
        await app.open("./?preview=Import,EXPORT");
        expect((await pageFlags(page)).all).toEqual(ALL_OFF);
    });

    test("the parameter is read beside the ones the page itself uses (db=)", async ({ app, page }) => {
        await app.open(`${NORTHLIGHT_URL}&preview=import`);
        expect((await pageFlags(page)).all).toEqual(only("import"));
        await app.expectPicked("northlight");
    });

    test("the parameter is read beside the exercise set's (set=)", async ({ app, page }) => {
        await app.open("./?preview=export&set=retail-basics");
        expect((await pageFlags(page)).all).toEqual(only("export"));
        await expect(app.exercisePanel).toBeVisible();
    });

    test("an unknown name alone opens the default dataset with no notice and no error", async ({ app, page, pageErrors }) => {
        const consoleErrors = [];
        page.on("console", (message) => message.type() === "error" && consoleErrors.push(message.text()));
        await app.recordToasts({ fromStart: true });
        await app.open("./?preview=bogus");
        await app.expectPicked(DEFAULT_DATASET.id, DEFAULT_DATASET.name);
        await expect(app.pane).toHaveAttribute("data-state", "empty");
        await expect(app.errorBand).toHaveCount(0);
        expect((await pageFlags(page)).all).toEqual(ALL_OFF);
        await app.expectToasts([]);
        expect(pageErrors).toEqual([]);
        expect(consoleErrors).toEqual([]);
    });

    test("a flag turned on stays on when the visit opens another database from the switcher, and the parameter leaves the address", async ({
        app,
        page,
    }) => {
        await app.open("./?preview=import,export");
        expect(page.url()).toContain("preview=import,export");
        await app.pickDatabaseById(OTHER_DATASET.id);
        await app.expectPicked(OTHER_DATASET.id, OTHER_DATASET.name);
        await app.waitReady();
        await expect.poll(() => page.url()).toContain(`db=${OTHER_DATASET.id}`);
        expect(page.url()).not.toContain("preview");
        expect((await pageFlags(page)).all).toEqual(only("import", "export"));
    });

    test("a flag turned on stays on when the visit opens a file, and the parameter leaves the address", async ({ app, page }) => {
        await app.open("./?preview=import");
        expect(page.url()).toContain("preview=import");
        await app.upload(SAMPLE_FILE);
        await expect.poll(() => page.url()).not.toContain("preview");
        expect(page.url()).not.toContain("?");
        expect((await pageFlags(page)).all).toEqual(only("import"));
    });

    test("a flag turned on stays on when the visit opens an exercise set from the picker, and the parameter leaves the address", async ({
        app,
        page,
    }) => {
        await app.open(`${NORTHLIGHT_URL}&preview=export`);
        expect(page.url()).toContain("preview=export");
        await app.pickSet(realSet().title);
        await expect(app.exercisePanel).toBeVisible();
        await app.waitReady();
        await expect.poll(() => page.url()).toContain("set=retail-basics");
        expect(page.url()).not.toContain("preview");
        expect((await pageFlags(page)).all).toEqual(only("export"));
    });

    test("a flag turned on stays on when the visit opens an exercise and then closes the set", async ({ app, page }) => {
        await app.open("./?preview=import&set=retail-basics");
        await expect(app.exercisePanel).toBeVisible();
        await app.exerciseButton(2).click();
        await app.pickSet("None");
        await app.waitReady();
        await expect.poll(() => page.url()).not.toContain("preview");
        expect((await pageFlags(page)).all).toEqual(only("import"));
    });

    test("a flag that is off cannot be turned on later by a change of address", async ({ app, page }) => {
        await app.open("./");
        await page.evaluate(() => history.pushState(null, "", "?preview=import,export"));
        expect(page.url()).toContain("preview=import,export");
        expect((await pageFlags(page)).all).toEqual(ALL_OFF);
    });

    test("Open from URL keeps the parameter in the address, and the flag stays on", async ({ app, page }) => {
        await app.open(`${NORTHLIGHT_URL.replace("northlight", DEFAULT_DATASET.id)}&preview=import`);
        expect(page.url()).toContain("preview=import");
        await page.keyboard.press("Control+u");
        const field = page.locator("#open-url-input");
        await expect(field).toBeVisible();
        await field.fill("datasets/northlight_retail.db");
        await field.press("Enter");
        await expect.poll(() => page.url()).toContain("#");
        await app.waitReady();
        expect(page.url()).toContain("preview=import");
        expect(page.url()).toContain("northlight_retail.db");
        expect((await pageFlags(page)).all).toEqual(only("import"));
    });
});

test.describe("a flag never travels", () => {
    test("a link made by Copy link does not carry the parameter", async ({ app, page }) => {
        await app.open("./?preview=import&db=northlight");
        expect(page.url()).toContain("preview=import");
        await app.run("SELECT store_name FROM stores ORDER BY 1;");
        const link = await app.copyLink();
        // a share link is the page's address without its query string, and the state in its hash
        expect(link).toMatch(/^https?:\/\/[^?#]*#s=/);
        expect(link).not.toContain("?");
        expect(link).not.toContain("preview");
        expect(link).not.toContain("import");
    });

    test("the link: lines of an exported evidence file do not carry it either", async ({ app, page }) => {
        await app.open("./?preview=import,export&db=northlight");
        await app.run("SELECT store_name FROM stores ORDER BY 1;");
        await app.run("SELECT 1 AS one;");
        const file = await app.exportEvidence();
        const links = file.text.split("\n").filter((line) => line.startsWith("link: "));
        expect(links.length, "an entry that ran on a course dataset has a link line").toBeGreaterThan(0);
        for (const line of links) {
            expect(line).toMatch(/^link: https?:\/\/[^?#\s]*#s=\S+$/);
            expect(line).not.toContain("preview");
        }
        expect(file.text).not.toContain("preview");
        // the flag is on in this file's page, so what it did not write was left out, not unknown
        expect((await pageFlags(page)).all).toEqual(only("import", "export"));
    });
});

// what a visit shows, written down for one address, in a browser context of its own (so the two
// visits compared have empty storage each)
async function visit(browser, baseURL, address) {
    const context = await browser.newContext({ baseURL });
    try {
        const page = await context.newPage();
        const app = new App(page);
        const requests = [];
        const errors = [];
        page.on("request", (request) => requests.push(new URL(request.url()).pathname.slice(new URL(baseURL).pathname.length)));
        page.on("pageerror", (error) => errors.push(String(error)));
        page.on("console", (message) => message.type() === "error" && errors.push(message.text()));
        await page.addInitScript(() => {
            window.__historyCalls = [];
            for (const method of ["pushState", "replaceState"]) {
                const original = History.prototype[method];
                History.prototype[method] = function (...args) {
                    window.__historyCalls.push(method);
                    return original.apply(this, args);
                };
            }
        });
        await app.recordToasts({ fromStart: true });
        await app.open(address);
        // let anything late (a toast, a second load) show itself
        await page.waitForTimeout(500);
        await app.openExportMenu();
        const exportItems = await app.exportMenu.evaluate((menu) =>
            [...menu.querySelectorAll('[role^="menuitem"], button, a')].map((item) => `${item.id}|${item.getAttribute("role")}|${item.textContent.trim()}`)
        );
        await page.keyboard.press("Escape");
        await app.databaseButton.click();
        await expect(app.databaseMenu).toBeVisible();
        // each course database's size is added to its entry a moment after the page opens
        await expect
            .poll(() =>
                app.databaseItems.evaluateAll((items) => items.every((item) => /\d\s?(B|KB|MB)$/.test(item.textContent.trim())))
            )
            .toBe(true);
        const databaseItems = await app.databaseMenu.evaluate((menu) =>
            [...menu.querySelectorAll('[role^="menuitem"]')].map((item) => `${item.id}|${item.getAttribute("role")}|${item.textContent.trim()}`)
        );
        await page.keyboard.press("Escape");
        const seen = await page.evaluate(() => {
            const input = document.getElementById("open-file-input");
            return {
                fileInput: { multiple: input.multiple, accept: input.accept, type: input.type, hidden: input.hidden },
                storageKeys: Object.keys(localStorage).sort(),
                storageText: JSON.stringify(Object.entries(localStorage)),
                historyLength: history.length,
                historyCalls: window.__historyCalls,
                url: location.search,
                title: document.title,
                pane: document.getElementById("results-pane").dataset.state,
                database: window.app.database?.name,
                toolbar: document.querySelector("header, .topbar, #topbar")?.innerText ?? null,
            };
        });
        return { ...seen, exportItems, databaseItems, toasts: await app.toasts(), errors, requests: [...new Set(requests)].sort() };
    } finally {
        await context.close();
    }
}

// A flag that nothing reads changes nothing: the page with it on is the page with it off. That
// held for all four while only the groundwork was built. Since the plan's Phase 2 the import
// flag is read, so the first and the last test of this group turn on every flag but that one
// (excel-import with it: it does nothing without import), and the test after them says what the
// import flag alone adds to a page on which nothing has been chosen yet. A phase that reads
// another flag does the same again: takes its flag out of UNREAD_FLAGS and adds a test for what
// it adds. This group is not the pattern for a feature's own tests (those are tests/aw2-*).
test.describe("nothing a student can see", () => {
    const ALL_FLAGS = "preview=import,export,excel-import,excel-export";
    const UNREAD_FLAGS = "preview=export,excel-import,excel-export";

    test("every flag that nothing reads yet on, the page shows what it shows with none: menus, file chooser, toasts, errors, storage, history, requests", async ({
        browser,
        baseURL,
    }) => {
        const plain = await visit(browser, baseURL, "./");
        const flagged = await visit(browser, baseURL, `./?${UNREAD_FLAGS}`);

        // the page the plain visit opens is a real one (so the comparison is not of two blanks)
        expect(plain.exportItems.length).toBeGreaterThan(0);
        expect(plain.databaseItems.length).toBeGreaterThan(0);
        expect(plain.fileInput.multiple).toBe(false);

        expect(flagged.exportItems).toEqual(plain.exportItems);
        expect(flagged.databaseItems).toEqual(plain.databaseItems);
        expect(flagged.fileInput).toEqual(plain.fileInput);
        expect(flagged.fileInput.multiple).toBe(false);
        expect(flagged.toasts).toEqual(plain.toasts);
        expect(flagged.toasts ?? []).toEqual([]);
        expect(flagged.errors).toEqual([]);
        expect(plain.errors).toEqual([]);
        expect(flagged.pane).toBe(plain.pane);
        expect(flagged.database).toBe(plain.database);
        expect(flagged.title).toBe(plain.title);
        expect(flagged.toolbar).toBe(plain.toolbar);
        // the same files were requested: a flag alone loads nothing (no library, no module)
        expect(flagged.requests).toEqual(plain.requests);
    });

    test("all four flags on, localStorage gets no new key and no value that names a flag", async ({ browser, baseURL }) => {
        const plain = await visit(browser, baseURL, "./");
        const flagged = await visit(browser, baseURL, `./?${ALL_FLAGS}`);
        expect(flagged.storageKeys).toEqual(plain.storageKeys);
        for (const key of flagged.storageKeys) {
            expect(key.toLowerCase(), key).not.toContain("preview");
        }
        expect(flagged.storageText).not.toContain("excel-import");
        expect(flagged.storageText).not.toContain("preview");
    });

    test("all four flags on, the parameter is not written into the address, and no history entry is made because of it", async ({
        browser,
        baseURL,
    }) => {
        const plain = await visit(browser, baseURL, "./");
        const flagged = await visit(browser, baseURL, `./?${ALL_FLAGS}`);
        expect(flagged.historyLength).toBe(plain.historyLength);
        expect(flagged.historyCalls).toEqual(plain.historyCalls);
        // the address is the one the student typed: the page did not rewrite it
        expect(flagged.url).toBe(`?${ALL_FLAGS}`);
        expect(plain.url).toBe("");
    });

    test("every flag that nothing reads yet on, the menus offer the entries they offer today (no Excel or import item has appeared)", async ({
        browser,
        baseURL,
    }) => {
        const flagged = await visit(browser, baseURL, `./?${UNREAD_FLAGS}`);
        const joined = flagged.exportItems.concat(flagged.databaseItems).join("\n");
        expect(joined).not.toMatch(/excel|xlsx|\.xls|import/i);
    });

    test("the import flag on, and nothing chosen yet: the file chooser takes several files, the menu entry says what else it takes, and nothing else differs", async ({
        browser,
        baseURL,
    }) => {
        const { OPEN_FILE_DESCRIPTION } = await load("config.js");
        const { OPEN_FILE_WITH_IMPORT_DESCRIPTION } = await load("config-workflow.js");
        const plain = await visit(browser, baseURL, "./");
        const flagged = await visit(browser, baseURL, "./?preview=import");

        // what the flag adds
        expect(plain.fileInput.multiple).toBe(false);
        expect(flagged.fileInput).toEqual({ ...plain.fileInput, multiple: true });
        // (no accept list: a database can have any name, and the chooser must go on showing it)
        expect(flagged.fileInput.accept).toBe("");
        const openFile = plain.databaseItems.find((item) => item.startsWith("open-file|"));
        expect(openFile).toContain(OPEN_FILE_DESCRIPTION);
        expect(OPEN_FILE_WITH_IMPORT_DESCRIPTION).toMatch(/CSV/);
        expect(flagged.databaseItems).toEqual(
            plain.databaseItems.map((item) => (item === openFile ? item.replace(OPEN_FILE_DESCRIPTION, OPEN_FILE_WITH_IMPORT_DESCRIPTION) : item))
        );

        // and nothing else: no new menu entry, no toast, no error, no key in storage, no step in
        // the history, and no file fetched (the CSV reader is asked for when a file is first read)
        expect(flagged.exportItems).toEqual(plain.exportItems);
        expect(flagged.toasts).toEqual(plain.toasts);
        expect(flagged.errors).toEqual([]);
        expect(flagged.pane).toBe(plain.pane);
        expect(flagged.database).toBe(plain.database);
        expect(flagged.title).toBe(plain.title);
        expect(flagged.toolbar).toBe(plain.toolbar);
        expect(flagged.requests).toEqual(plain.requests);
        expect(flagged.requests.filter((file) => /papaparse/i.test(file))).toEqual([]);
        expect(flagged.storageKeys).toEqual(plain.storageKeys);
        expect(flagged.historyLength).toBe(plain.historyLength);
        expect(flagged.historyCalls).toEqual(plain.historyCalls);
    });
});
