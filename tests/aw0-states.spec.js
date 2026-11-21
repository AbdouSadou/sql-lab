const path = require("node:path");
const { pathToFileURL } = require("node:url");
const { test, expect, NORTHLIGHT_URL, flagState, lineFit, holdDataset, realManifest, fakeStorage, inNode } = require("./helpers");

// Assessment plan, Phase 0: what keeps a test on the state it is about. The kit's flagState names
// every flag of the table, on or off, so that an address built with it gives the same flags
// whatever the shipped defaults are (tests/aw0-flags.spec.js holds the rule itself). Held here:
// that flagState really does that, for every state and for any defaults; three edges of the rule;
// that the results pane's loading bar is one element in the page with every flag off, which the
// import's and the export's dialogs make three once they are in the page; and that the line under
// "Open a file…", which is another text in each state of the import, is never cut.

const load = (file) => import(pathToFileURL(path.join(__dirname, "..", "js", "lab", file)).href);

// ---- the kit, in Node --------------------------------------------------------------------------

test.describe("flagState names a state in full", () => {
    test.beforeEach(({}, testInfo) => {
        test.skip(testInfo.project.name !== "chromium-root", "checks the kit, not the page: once is enough");
    });

    test("every flag of the table is named, on without a minus and off with one, in the table's order, and the parameter is the config's", async () => {
        const { PREVIEW_FLAGS, PREVIEW_PARAM } = await load("config-workflow.js");
        const names = Object.keys(PREVIEW_FLAGS);
        expect(names.length).toBeGreaterThan(0);
        expect(flagState()).toBe(`${PREVIEW_PARAM}=${names.map((name) => `-${name}`).join(",")}`);
        expect(flagState(...names)).toBe(`${PREVIEW_PARAM}=${names.join(",")}`);
        for (const name of names) {
            const parts = flagState(name).slice(`${PREVIEW_PARAM}=`.length).split(",");
            expect(parts, name).toEqual(names.map((other) => (other === name ? other : `-${other}`)));
        }
        // the order in which a test names the flags does not change the address
        expect(flagState(...names.toReversed())).toBe(flagState(...names));
        expect(flagState(names[0], names[0])).toBe(flagState(names[0]));
    });

    test("a name that is no flag is a typing fault in the test and throws, whatever it looks like", async () => {
        for (const name of ["bogus", "Import", "IMPORT", "-import", "import,export", " import", "", "constructor", "__proto__", "toString", "hasOwnProperty", undefined, null, 7, {}, ["import"]]) {
            expect(() => flagState(name), String(name)).toThrow(/is not a flag/);
        }
        // (one bad name among good ones is enough)
        expect(() => flagState("import", "bogus")).toThrow(/is not a flag/);
    });

    test("for every set of flags, the address that flagState gives is exactly that state, whatever the defaults are (the needs followed)", async () => {
        const { readFlags } = await load("flags.js");
        const { PREVIEW_FLAGS, PREVIEW_FLAG_NEEDS } = await load("config-workflow.js");
        const names = Object.keys(PREVIEW_FLAGS);
        const every = (value) => Object.fromEntries(names.map((name) => [name, value]));
        const tables = {
            "all off": every(false),
            "all on": every(true),
            "as they ship": { ...PREVIEW_FLAGS },
            "the reverse of what ships": Object.fromEntries(names.map((name) => [name, PREVIEW_FLAGS[name] !== true])),
        };
        // what a state means: a flag is on when it is named and the flag it needs is on, however long the chain
        const meant = (named) => {
            const on = (name, depth = 0) => named.has(name) && depth <= names.length && (!PREVIEW_FLAG_NEEDS[name] || on(PREVIEW_FLAG_NEEDS[name], depth + 1));
            return Object.fromEntries(names.map((name) => [name, on(name)]));
        };
        let states = 0;
        for (let bits = 0; bits < 1 << names.length; bits++) {
            const named = new Set(names.filter((name, n) => bits & (1 << n)));
            const address = `?${flagState(...named)}`;
            for (const [label, defaults] of Object.entries(tables)) {
                expect(readFlags(address, defaults, PREVIEW_FLAG_NEEDS), `${address} on the defaults "${label}"`).toEqual(meant(named));
            }
            states++;
        }
        expect(states).toBe(2 ** names.length);
    });
});

// ---- the rule, in Node --------------------------------------------------------------------------

// Three things about js/lab/flags.js that tests/aw0-flags.spec.js lets through: a default is on only
// when it is exactly true; flagOn answers from what was read when the module first ran, not from the
// address as it is now; and a value that cannot be made into text is no address and throws nothing.
test.describe("the rule of the flags, three more edges", () => {
    test.beforeEach(({}, testInfo) => {
        test.skip(testInfo.project.name !== "chromium-root", "checks files, not the page: once is enough");
    });

    test("a default is on only when it is exactly true: a word, a number or an object in the table is off", async () => {
        const { readFlags } = await load("flags.js");
        const defaults = { a: true, b: false, c: 1, d: "true", e: "false", f: null, g: undefined, h: {}, i: [], j: 0, k: "" };
        const off = Object.fromEntries(Object.keys(defaults).map((name) => [name, name === "a"]));
        expect(readFlags("", defaults, {})).toEqual(off);
        expect(readFlags("?db=northlight", defaults, {})).toEqual(off);
        // a name still switches one of them on, and a minus off
        expect(readFlags("?preview=c,d", defaults, {})).toEqual({ ...off, c: true, d: true });
        expect(readFlags("?preview=-a", defaults, {})).toEqual({ ...off, a: false });
    });

    test("flagOn answers from the address as it was when the module first ran, for every flag, whatever the address becomes", async () => {
        const { PREVIEW_FLAGS } = await load("config-workflow.js");
        const names = Object.keys(PREVIEW_FLAGS);
        await inNode(fakeStorage(), async (_events, tab) => {
            // the flags that the table has off are named on, so that the state read is not the table's
            const named = names.filter((name) => PREVIEW_FLAGS[name] !== true);
            globalThis.location = { search: `?db=northlight&preview=${named.join(",")}` };
            try {
                const copy = await tab().load("flags.js");
                const read = Object.fromEntries(names.map((name) => [name, copy.flagOn(name)]));
                expect(copy.flags()).toEqual(read);
                // the visit goes on to other addresses: one with no parameter, one that names every flag the
                // other way, one that names every flag off
                for (const search of ["", "?db=northlight", `?preview=${names.join(",")}`, `?preview=${names.map((name) => `-${name}`).join(",")}`]) {
                    globalThis.location = { search };
                    for (const name of names) {
                        expect(copy.flagOn(name), `${name} after the address became ${JSON.stringify(search)}`).toBe(read[name]);
                    }
                    expect(copy.flags()).toEqual(read);
                }
            } finally {
                delete globalThis.location;
            }
        });
    });

    test("an address that cannot be made into text is read as no address, and nothing throws", async () => {
        const { readFlags } = await load("flags.js");
        const defaults = { a: true, b: false };
        const unreadable = {
            toString() {
                throw new Error("no text");
            },
        };
        const unreadableToo = {
            [Symbol.toPrimitive]() {
                throw new Error("no text either");
            },
        };
        for (const [label, search] of [["a toString that throws", unreadable], ["a toPrimitive that throws", unreadableToo]]) {
            expect(() => readFlags(search, defaults, {}), label).not.toThrow();
            expect(readFlags(search, defaults, {}), label).toEqual({ a: true, b: false });
        }
    });
});

// ---- the loading bar ---------------------------------------------------------------------------

// The results pane's loading state has a title, a size line and a progress bar (js/lab/results.js).
// The import's dialog and the export of tables' dialog (js/lab/import-dialog.js,
// js/lab/export-tables-dialog.js) draw theirs with the same class names, inside their own dialog, and
// they are built when the page loads whether the dialog is open or not. So a locator of the class
// names alone finds one element on a page without those features and more on a page with them: a test
// of the results pane's own bar says "#result ...". This holds both sides of that: one element, all in
// #result, with every flag off, and the extra ones, each inside a dialog and none in #result, with the
// features on.
const LOADING_PARTS = [".results-loading-title", ".results-loading-size", "progress.results-progress"];

test.describe("the results pane's loading bar", () => {
    const NORTHLIGHT = realManifest().datasets.find((entry) => entry.id === "northlight");

    for (const [label, address, dialogs] of [
        ["with every flag off", `${NORTHLIGHT_URL}&${flagState()}`, 0],
        ["with the import alone", `${NORTHLIGHT_URL}&${flagState("import")}`, 1],
        ["with the export alone", `${NORTHLIGHT_URL}&${flagState("export")}`, 1],
        ["with the import and the export", `${NORTHLIGHT_URL}&${flagState("import", "export")}`, 2],
        ["on the page as it ships", NORTHLIGHT_URL, 2],
    ]) {
        test(`${label}: the pane has one of each part, and the page has ${dialogs} more, each inside a dialog`, async ({ page, app }) => {
            test.skip(!NORTHLIGHT, "the course database that the loading tests wait for does not ship");
            const held = await holdDataset(page, NORTHLIGHT);
            await page.goto(address);
            await held.requested;
            await expect(app.pane).toHaveAttribute("data-state", "loading");
            for (const part of LOADING_PARTS) {
                // the pane's own: exactly one
                await expect(page.locator(`#result ${part}`), `${label}: ${part} in #result`).toHaveCount(1);
                // in the whole page: that one, and one in each dialog that the page has built
                await expect(page.locator(part), `${label}: ${part} in the page`).toHaveCount(1 + dialogs);
                await expect(page.locator(`dialog ${part}`), `${label}: ${part} in a dialog`).toHaveCount(dialogs);
                // and none outside #result and a dialog
                const elsewhere = await page.evaluate((selector) => [...document.querySelectorAll(selector)].filter((node) => !node.closest("dialog") && !node.closest("#result")).length, part);
                expect(elsewhere, `${label}: ${part} elsewhere`).toBe(0);
            }
            held.release();
            await app.waitReady();
            await expect(page.locator("#result .results-loading")).toHaveCount(0);
        });
    }
});

// ---- the line under "Open a file…", in each state ---------------------------------------------

// The database menu shows one line under an entry's name. The line under "Open a file…" is another
// text in each state of the import (js/index.js), so each state is held here by name. It is never
// cut. With the import on it is short enough to stay on one line from a phone 360 px wide. Where the
// menu is too narrow for it, the line wraps (css/menu.css): the line of both imports at 320 px, and
// the longer line of the page with every flag off on a phone (up to about 440 px wide; the menu is
// wide enough for it from there). tests/ui6-responsive.spec.js holds the same of the page as it
// ships, with the other lines of the menus.
test.describe("the line under Open a file… is never cut", () => {
    const openFileLine = async (page, app, address, width) => {
        await page.setViewportSize({ width, height: 740 });
        await app.open(address);
        await app.databaseButton.click();
        await expect(app.databaseMenu).toBeVisible();
        const line = app.databaseMenu.locator("#open-file .menu-item-description");
        await expect(line).toHaveCount(1);
        await expect(line).not.toHaveText("");
        return lineFit(line);
    };

    for (const [label, address] of [
        ["with the import alone", `./?${flagState("import")}`],
        ["with both imports", `./?${flagState("import", "excel-import")}`],
    ]) {
        test(`${label}: whole at 320 px wide, and on one line from 360 to 1366`, async ({ page, app }) => {
            for (const width of [320, 360, 390, 699, 700, 1366]) {
                const fit = await openFileLine(page, app, address, width);
                expect(fit.cut, `${label} at ${width}: "${fit.text}"`).toBe(false);
                if (width >= 360) {
                    expect(fit.lines, `${label} at ${width}: "${fit.text}"`).toBe(1);
                }
            }
        });
    }

    test("with every flag off: never cut from 320 px wide (on a phone the menu is narrower than the line, which wraps), and on one line from 480", async ({ page, app }) => {
        for (const width of [320, 360, 390, 412, 480, 699, 700, 1366]) {
            const fit = await openFileLine(page, app, `./?${flagState()}`, width);
            expect(fit.cut, `every flag off at ${width}: "${fit.text}"`).toBe(false);
            if (width >= 480) {
                expect(fit.lines, `every flag off at ${width}: "${fit.text}"`).toBe(1);
            }
        }
    });
});
