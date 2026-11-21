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
    openableSets,
    fakeStorage,
    inNode,
    READY_PANE,
    flagState,
} = require("./helpers");

// Assessment plan, Phase 0 (groundwork): the preview flags (js/lab/flags.js, settings in
// js/lab/config-workflow.js; plan section 2, "Preview switch"). Each feature of the plan has a named
// flag. The import of CSV files, the export of tables and the import of Excel workbooks are on for
// everyone, the export of Excel workbooks (not built) is off, and a visit changes flags for itself
// with ?preview=name,name (a name switches a flag on) and ?preview=-name (a hyphen-minus in front of
// a name switches it off; a name given both ways is off). The address is read once, when the page
// loads, and kept in memory; opening a dataset, a file or an exercise set drops the parameter from
// the address and the flags stay as they were read; only Open from URL keeps the parameter; a flag
// never travels in a share link or an evidence file; and a flag that is on or off changes nothing
// but what it is for.
//
// A test that is about a state of the flags names that state in full with flagState(...) (every
// flag is named, on or off), so that it keeps testing that state whatever ships. A test of the page
// as it ships opens the plain address. A test whose address is a bare minus (?preview=-import, with no
// other name) is about the minus: the flags it does not name stay as they ship, and it says so.
//
// The first group runs the rule itself, and the module with no page, in Node (once, not on every
// project: it checks files, not the page). A test of the rule hands readFlags its own table of
// defaults and of needs, so that it does not depend on what ships; one test says what ships. The
// second group drives the real page and reaches the module through bundle/app.js (its "flags"
// export).

const load = (file) => import(pathToFileURL(path.join(__dirname, "..", "js", "lab", file)).href);

// The names of the flags, and the table that the tests of the rule use for their defaults (the four
// names, all off) with the needs between them. A phase that adds a flag adds its name here, in
// ALL_OFF, in NEEDS when it needs another, and in SHIPPED, on purpose: most of this file compares
// whole results with them.
const NAMES = ["import", "export", "excel-import", "excel-export"];
const ALL_OFF = { import: false, export: false, "excel-import": false, "excel-export": false };
const NEEDS = { "excel-import": "import", "excel-export": "export" };
const only = (...on) => ({ ...ALL_OFF, ...Object.fromEntries(on.map((name) => [name, true])) });
// The flags as they ship: the import, the export and the import of Excel workbooks on; the export of
// Excel workbooks (not built) off. This is what the plain address gives. The one test of the
// shipped defaults pins it against the config.
const SHIPPED = only("import", "export", "excel-import");

// the address with every flag named off
const OFF_URL = `./?${flagState()}`;

// the rule, handed its defaults (the four names, all off) and its needs, unless the test gives its
// own: what ships does not matter to a test of the rule
async function rule() {
    const { readFlags } = await load("flags.js");
    return (search, defaults = ALL_OFF, needs = NEEDS) => readFlags(search, defaults, needs);
}

// A table of defaults with flags on and flags off, for the tests of the minus. a, b and c are on
// (b needs a, c needs b); d and e are off (e needs d); f is on and needs nothing; g is off and
// needs nothing. mix(...) is the result with exactly these flags on.
const MIX = { a: true, b: true, c: true, d: false, e: false, f: true, g: false };
const MIX_NEEDS = { b: "a", c: "b", e: "d" };
const mix = (...on) => Object.fromEntries(Object.keys(MIX).map((name) => [name, on.includes(name)]));
const MIX_DEFAULT = mix("a", "b", "c", "f");

// a database that is not the default one, to pick from the switcher (none when only one ships:
// the test that needs it is skipped)
const OTHER_DATASET = realManifest().datasets.find((entry) => entry.id !== DEFAULT_DATASET.id);
// an exercise set the site can open (one whose course database ships too, which is what the
// set picker offers to work in), to open by its address and to pick from the set picker (none when
// there is no such set: the tests that need it are skipped); the address parser's tests take any
// id, the set's or a word
const SET = openableSets()[0];
const SET_ID = SET?.id ?? "a-set";

// ---- in Node ---------------------------------------------------------------------------------

test.describe("the rule and the module, with no page (in Node)", () => {
    test.beforeEach(({}, testInfo) => {
        test.skip(testInfo.project.name !== "chromium-root", "checks files, not the page: once is enough");
    });

    test("the shipped defaults are four flags, the import, the export and the import of Excel workbooks on and the export of Excel workbooks off, and the parameter is called preview", async () => {
        const { PREVIEW_FLAGS, PREVIEW_FLAG_NEEDS, PREVIEW_PARAM } = await load("config-workflow.js");
        expect(PREVIEW_PARAM).toBe("preview");
        expect(Object.keys(PREVIEW_FLAGS).sort()).toEqual([...NAMES].sort());
        expect(PREVIEW_FLAGS).toEqual(SHIPPED);
        for (const name of ["import", "export", "excel-import"]) {
            expect(PREVIEW_FLAGS[name], name).toBe(true);
        }
        expect(PREVIEW_FLAGS["excel-export"]).toBe(false);
        expect(PREVIEW_FLAG_NEEDS).toEqual(NEEDS);
    });

    test("on the shipped table the plain address gives the shipped flags, a name switches a flag on, a minus switches it off, and the needs follow", async () => {
        const { readFlags } = await load("flags.js");
        const { PREVIEW_FLAGS, PREVIEW_FLAG_NEEDS } = await load("config-workflow.js");
        const shipped = (search) => readFlags(search, PREVIEW_FLAGS, PREVIEW_FLAG_NEEDS);
        expect(shipped("")).toEqual(SHIPPED);
        expect(shipped("?db=northlight")).toEqual(SHIPPED);
        expect(shipped("?preview=import,export")).toEqual(SHIPPED);
        expect(shipped("?preview=excel-export")).toEqual(only("import", "export", "excel-import", "excel-export"));
        expect(shipped("?preview=-import")).toEqual(only("export"));
        expect(shipped("?preview=-export")).toEqual(only("import", "excel-import"));
        expect(shipped("?preview=-excel-import")).toEqual(only("import", "export"));
        expect(shipped("?preview=-export,-excel-import")).toEqual(only("import"));
        expect(shipped("?preview=-import,-export")).toEqual(ALL_OFF);
        expect(shipped("?preview=-import&preview=excel-export")).toEqual(only("export", "excel-export"));
        expect(shipped("?preview=-export,excel-export")).toEqual(only("import", "excel-import"));
        expect(shipped("?preview=import,-import")).toEqual(only("export"));
        expect(shipped("?preview=-import,import")).toEqual(only("export"));
        // a name that is no flag, with or without the minus, changes nothing
        expect(shipped("?preview=-bogus,bogus,-Import,- import,--import,-")).toEqual(SHIPPED);
        // the same through the flags the module reads from its own table
        const { flags } = await load("flags.js");
        expect(flags()).toEqual(SHIPPED);
    });

    test("with no parameter, or none that names a flag, every flag is at its default", async () => {
        const read = await rule();
        for (const search of ["", "?", "?db=northlight", `?set=${SET_ID}&ex=e1`, "?other=import", "?previews=import", "?other=-import", "?previews=-f"]) {
            expect(read(search), JSON.stringify(search)).toEqual(ALL_OFF);
            expect(read(search, MIX, MIX_NEEDS), JSON.stringify(search)).toEqual(MIX_DEFAULT);
        }
        expect(read(undefined)).toEqual(ALL_OFF);
        expect(read(null)).toEqual(ALL_OFF);
        expect(read(undefined, MIX, MIX_NEEDS)).toEqual(MIX_DEFAULT);
        expect(read(null, MIX, MIX_NEEDS)).toEqual(MIX_DEFAULT);
    });

    test("one name turns that flag on and no other", async () => {
        const read = await rule();
        expect(read("?preview=import")).toEqual(only("import"));
        expect(read("?preview=export")).toEqual(only("export"));
    });

    test("several names are separated by commas, in one preview= parameter or in several", async () => {
        const read = await rule();
        expect(read("?preview=import,export")).toEqual(only("import", "export"));
        expect(read("?preview=export,import")).toEqual(only("import", "export"));
        expect(read("?preview=import&preview=export")).toEqual(only("import", "export"));
        expect(read("?preview=import,export&preview=excel-import,excel-export")).toEqual(
            only("import", "export", "excel-import", "excel-export")
        );
    });

    test("spaces round a name are ignored, as a plus sign or an encoded space in the address", async () => {
        const read = await rule();
        expect(read("?preview=%20import%20,%20export%20")).toEqual(only("import", "export"));
        expect(read("?preview=import+,+export")).toEqual(only("import", "export"));
        expect(read("?preview=%09import%0A")).toEqual(only("import"));
    });

    test("an encoded comma separates names like a plain one", async () => {
        const read = await rule();
        expect(read("?preview=import%2Cexport")).toEqual(only("import", "export"));
        expect(read("?preview=import%2cexport")).toEqual(only("import", "export"));
    });

    test("a name given twice is on once, and empty parts do no harm", async () => {
        const read = await rule();
        expect(read("?preview=import,import")).toEqual(only("import"));
        expect(read("?preview=import&preview=import")).toEqual(only("import"));
        expect(read("?preview=,,import,,")).toEqual(only("import"));
        expect(read("?preview=,%20,")).toEqual(ALL_OFF);
    });

    test("an empty value turns nothing on", async () => {
        const read = await rule();
        expect(read("?preview=")).toEqual(ALL_OFF);
        expect(read("?preview")).toEqual(ALL_OFF);
        expect(read("?preview=&preview=")).toEqual(ALL_OFF);
        expect(read("?preview=&preview=import")).toEqual(only("import"));
    });

    test("other parameters beside preview are not read as flags and do not hide it", async () => {
        const read = await rule();
        expect(read("?db=northlight&preview=import")).toEqual(only("import"));
        expect(read("?preview=import&db=northlight")).toEqual(only("import"));
        expect(read(`?set=${SET_ID}&preview=export&ex=e2`)).toEqual(only("export"));
        expect(read("?db=import&set=export")).toEqual(ALL_OFF);
        expect(read("?x=1&preview=import,export&y=2")).toEqual(only("import", "export"));
    });

    test("a name the app does not know is ignored, and so is a name in another letter case", async () => {
        const read = await rule();
        for (const value of ["bogus", "Import", "IMPORT", "iMpOrT", "Excel-Import", "excel_import", "excelimport", "import.", "im port"]) {
            expect(read(`?preview=${encodeURIComponent(value)}`), value).toEqual(ALL_OFF);
        }
        // an unknown name beside a known one does not stop the known one
        expect(read("?preview=bogus,import,Export")).toEqual(only("import"));
    });

    test("names that exist on every object are ignored and do not change the result's shape", async () => {
        const read = await rule();
        for (const value of ["__proto__", "constructor", "toString", "hasOwnProperty", "valueOf", "prototype", "__defineGetter__"]) {
            const result = read(`?preview=${value}`);
            expect(result, value).toEqual(ALL_OFF);
            expect(Object.keys(result), value).toEqual(Object.keys(ALL_OFF));
            expect(Object.getPrototypeOf(result), value).toBe(Object.prototype);
        }
        const both = read("?preview=__proto__,import,constructor");
        expect(both).toEqual(only("import"));
        expect(Object.getPrototypeOf(both)).toBe(Object.prototype);
        // nothing leaked onto Object
        expect({}.import).toBeUndefined();
        expect({}.polluted).toBeUndefined();
    });

    test("a very long value never throws and still finds a name at its end", async () => {
        const read = await rule();
        expect(read(`?preview=${"x".repeat(200_000)}`)).toEqual(ALL_OFF);
        expect(read(`?preview=${"bogus,".repeat(40_000)}`)).toEqual(ALL_OFF);
        expect(read(`?preview=${"bogus,".repeat(40_000)}export`)).toEqual(only("export"));
        expect(read(`?preview=import${" ".repeat(100_000)}`)).toEqual(only("import"));
        expect(read("?" + "preview=import&".repeat(20_000))).toEqual(only("import"));
    });

    test("a malformed address never throws", async () => {
        const read = await rule();
        for (const search of ["?preview=%", "?preview=%ZZ,import", "?preview=%E0%A4%A", "?%=%&&&==preview", "?preview=\u0000", "?preview=\ud800"]) {
            expect(() => read(search), JSON.stringify(search)).not.toThrow();
        }
        expect(read("?preview=%ZZ,import")).toEqual(only("import"));
        expect(read("?preview=%")).toEqual(ALL_OFF);
        expect(() => read(123)).not.toThrow();
        expect(() => read({})).not.toThrow();
        expect(() => read(Symbol.iterator.description)).not.toThrow();
    });

    test("excel-import is off without import and on with it, in either order in the address", async () => {
        const read = await rule();
        expect(read("?preview=excel-import")).toEqual(ALL_OFF);
        expect(read("?preview=excel-import,export")).toEqual(only("export"));
        expect(read("?preview=excel-import,import")).toEqual(only("import", "excel-import"));
        expect(read("?preview=import,excel-import")).toEqual(only("import", "excel-import"));
        expect(read("?preview=excel-import&preview=import")).toEqual(only("import", "excel-import"));
        expect(read("?preview=import&preview=excel-import")).toEqual(only("import", "excel-import"));
        // import alone does not turn its Excel flag on
        expect(read("?preview=import")).toEqual(only("import"));
    });

    test("excel-export is off without export and on with it, in either order in the address", async () => {
        const read = await rule();
        expect(read("?preview=excel-export")).toEqual(ALL_OFF);
        expect(read("?preview=excel-export,import")).toEqual(only("import"));
        expect(read("?preview=excel-export,export")).toEqual(only("export", "excel-export"));
        expect(read("?preview=export,excel-export")).toEqual(only("export", "excel-export"));
        expect(read("?preview=excel-export&preview=export")).toEqual(only("export", "excel-export"));
        expect(read("?preview=export&preview=excel-export")).toEqual(only("export", "excel-export"));
        expect(read("?preview=export")).toEqual(only("export"));
    });

    test("the two Excel flags depend each on their own flag and not on the other side's", async () => {
        const read = await rule();
        expect(read("?preview=import,excel-export")).toEqual(only("import"));
        expect(read("?preview=export,excel-import")).toEqual(only("export"));
        expect(read("?preview=import,export,excel-import,excel-export")).toEqual(
            only("import", "export", "excel-import", "excel-export")
        );
    });

    test("a default set to true in the table turns that flag on with no parameter", async () => {
        const read = await rule();
        expect(read("", { ...ALL_OFF, import: true })).toEqual(only("import"));
        expect(read("?db=northlight", { ...ALL_OFF, export: true })).toEqual(only("export"));
        expect(read("", { ...ALL_OFF, import: true, "excel-import": true })).toEqual(
            only("import", "excel-import")
        );
        // a name adds to the defaults and never switches one off
        expect(read("?preview=export", { ...ALL_OFF, import: true })).toEqual(only("import", "export"));
        expect(read("?preview=bogus", { ...ALL_OFF, import: true })).toEqual(only("import"));
    });

    test("a flag that needs another stays off when the other is off, whatever its own default", async () => {
        const read = await rule();
        expect(read("", { ...ALL_OFF, "excel-import": true })).toEqual(ALL_OFF);
        expect(read("", { ...ALL_OFF, "excel-export": true })).toEqual(ALL_OFF);
        expect(read("", { import: true, export: false, "excel-import": true, "excel-export": true })).toEqual(
            only("import", "excel-import")
        );
        // and the parameter cannot give it what its needed flag lacks
        expect(read("?preview=excel-import", { ...ALL_OFF, export: true })).toEqual(only("export"));
    });

    test("the needs table is the rule: a table of its own is followed, and an empty one means no dependency", async () => {
        const read = await rule();
        const defaults = { a: false, b: false, c: false };
        expect(read("?preview=b", defaults, { b: "a" })).toEqual({ a: false, b: false, c: false });
        expect(read("?preview=a,b", defaults, { b: "a" })).toEqual({ a: true, b: true, c: false });
        expect(read("?preview=excel-import", ALL_OFF, {})).toEqual(only("excel-import"));
        // a name comes from the table of defaults, not from the shipped four
        expect(read("?preview=a,import", defaults, {})).toEqual({ a: true, b: false, c: false });
    });

    test("a chain of needs comes out the same in whatever order the table lists it", async () => {
        const read = await rule();
        const defaults = { a: false, b: false, c: false };
        // a needs b, b needs c: with c off, all three are off
        for (const needs of [{ a: "b", b: "c" }, { b: "c", a: "b" }]) {
            expect(read("?preview=a,b", defaults, needs), JSON.stringify(needs)).toEqual({ a: false, b: false, c: false });
            expect(read("?preview=a,c", defaults, needs), JSON.stringify(needs)).toEqual({ a: false, b: false, c: true });
            expect(read("?preview=a,b,c", defaults, needs), JSON.stringify(needs)).toEqual({ a: true, b: true, c: true });
        }
        // a flag that needs itself, or two that need each other, cannot hang the page
        expect(read("?preview=a", defaults, { a: "a" })).toEqual({ a: true, b: false, c: false });
        expect(read("?preview=a", defaults, { a: "b", b: "a" })).toEqual({ a: false, b: false, c: false });
        expect(read("?preview=a,b", defaults, { a: "b", b: "a" })).toEqual({ a: true, b: true, c: false });
        // a need that names no flag can never be met
        expect(read("?preview=a", defaults, { a: "nothing" })).toEqual({ a: false, b: false, c: false });
    });

    test("readFlags makes a new result each time and leaves the table of defaults as it was", async () => {
        const read = await rule();
        const defaults = { ...ALL_OFF };
        const first = read("?preview=import", defaults);
        const second = read("?preview=import", defaults);
        expect(first).not.toBe(second);
        first.import = false;
        expect(read("?preview=import", defaults)).toEqual(only("import"));
        expect(defaults).toEqual(ALL_OFF);
    });

    // ---- the minus: a name with a hyphen-minus in front of it switches that flag off for the visit ----
    // (tested on MIX: a, b, c are on with b needing a and c needing b, d and e are off with e needing d,
    // f is on alone, g is off alone; the four flags that ship are in the tests above)

    test("a minus switches that flag off and no other", async () => {
        const read = await rule();
        const m = (search) => read(search, MIX, MIX_NEEDS);
        expect(m("?preview=-f")).toEqual(mix("a", "b", "c"));
        expect(m("?preview=-c")).toEqual(mix("a", "b", "f"));
        // two names: one flag each
        expect(m("?preview=-f,-c")).toEqual(mix("a", "b"));
        expect(m("?preview=-c&preview=-f")).toEqual(mix("a", "b"));
        expect(m("?preview=-f&preview=-c,-b")).toEqual(mix("a"));
        // a name and a minus beside each other: each does its own
        expect(m("?preview=d,-f")).toEqual(mix("a", "b", "c", "d"));
        expect(m("?preview=-f,g")).toEqual(mix("a", "b", "c", "g"));
        // on the four flags: the table of the tests of the rule, all on, one by one
        const allOn = { import: true, export: true, "excel-import": true, "excel-export": true };
        expect(read("?preview=-export", allOn)).toEqual(only("import", "excel-import"));
        expect(read("?preview=-excel-export", allOn)).toEqual(only("import", "export", "excel-import"));
    });

    test("a minus before a flag that is already off leaves it off, and a minus never switches anything on", async () => {
        const read = await rule();
        const m = (search) => read(search, MIX, MIX_NEEDS);
        expect(m("?preview=-d")).toEqual(MIX_DEFAULT);
        expect(m("?preview=-g,-e,-d")).toEqual(MIX_DEFAULT);
        expect(read("?preview=-import,-export")).toEqual(ALL_OFF);
        expect(read("?preview=-excel-import", only("excel-import"))).toEqual(ALL_OFF);
        // (the plain name still switches it on: only the minus is new)
        expect(m("?preview=-d,g")).toEqual(mix("a", "b", "c", "f", "g"));
    });

    test("a name given both ways is off, in either order, in one parameter or in several", async () => {
        const read = await rule();
        const m = (search) => read(search, MIX, MIX_NEEDS);
        // on by default and named on: the minus still wins
        expect(m("?preview=f,-f")).toEqual(mix("a", "b", "c"));
        expect(m("?preview=-f,f")).toEqual(mix("a", "b", "c"));
        expect(m("?preview=f&preview=-f")).toEqual(mix("a", "b", "c"));
        expect(m("?preview=-f&preview=f")).toEqual(mix("a", "b", "c"));
        // off by default and named on: off wins too
        expect(m("?preview=g,-g")).toEqual(MIX_DEFAULT);
        expect(m("?preview=-g,g")).toEqual(MIX_DEFAULT);
        expect(m("?preview=-g&preview=g")).toEqual(MIX_DEFAULT);
        expect(m("?preview=g&preview=-g")).toEqual(MIX_DEFAULT);
        // with other names between, and a name given many times
        expect(m("?preview=f,d,-f,g")).toEqual(mix("a", "b", "c", "d", "g"));
        expect(m("?preview=-f,d,f,g")).toEqual(mix("a", "b", "c", "d", "g"));
        expect(m("?preview=f,f,-f,f,f")).toEqual(mix("a", "b", "c"));
        expect(m("?preview=-f,-f,f")).toEqual(mix("a", "b", "c"));
        expect(m("?preview=f&preview=g&preview=-f&preview=f")).toEqual(mix("a", "b", "c", "g"));
        // and on the four flags: the import named both ways is off, and takes its Excel flag with it
        expect(read("?preview=import,-import")).toEqual(ALL_OFF);
        expect(read("?preview=-import,import")).toEqual(ALL_OFF);
        expect(read("?preview=import,excel-import,-import")).toEqual(ALL_OFF);
        expect(read("?preview=-import&preview=import&preview=excel-import")).toEqual(ALL_OFF);
        expect(read("?preview=export,-import,import")).toEqual(only("export"));
    });

    test("spaces around a name with a minus are ignored, and a minus with a space after it is no name", async () => {
        const read = await rule();
        const m = (search) => read(search, MIX, MIX_NEEDS);
        expect(m("?preview=%20-f%20")).toEqual(mix("a", "b", "c"));
        expect(m("?preview=-f+,+-c")).toEqual(mix("a", "b"));
        expect(m("?preview=%09-f%0A")).toEqual(mix("a", "b", "c"));
        expect(m("?preview=%20-f%20,%20-c%20&preview=%20-b")).toEqual(mix("a"));
        // the minus is the first character of the part: a space after it makes the rest no name
        expect(m("?preview=-%20f")).toEqual(MIX_DEFAULT);
        expect(m("?preview=-+f")).toEqual(MIX_DEFAULT);
        expect(m("?preview=%20-%20f%20")).toEqual(MIX_DEFAULT);
        expect(m("?preview=-%09f")).toEqual(MIX_DEFAULT);
        // (and it is not read as the name f with a minus left over, either)
        expect(m("?preview=-%20f,g")).toEqual(mix("a", "b", "c", "f", "g"));
        // an encoded comma and an encoded minus
        expect(m("?preview=-f%2C-c")).toEqual(mix("a", "b"));
        expect(m("?preview=%2Df")).toEqual(mix("a", "b", "c"));
    });

    test("with the minus, a name in another letter case or that is no flag is ignored", async () => {
        const read = await rule();
        const m = (search) => read(search, MIX, MIX_NEEDS);
        for (const value of ["-F", "-A", "-bogus", "--f", "--a", "-", "--", "-f-", "-f.", "-ff", "-fa", "-f f", "-f_", "-_f", "-+f-", "--f,--a", "+f", "-excel_import", "-Import", "-IMPORT"]) {
            expect(m(`?preview=${encodeURIComponent(value)}`), value).toEqual(MIX_DEFAULT);
        }
        expect(read(`?preview=${encodeURIComponent("-Import")}`, only("import"))).toEqual(only("import"));
        expect(read(`?preview=${encodeURIComponent("-Excel-Import")}`, only("import", "excel-import"))).toEqual(only("import", "excel-import"));
        // a name that is no flag beside a real one does not stop it
        expect(m("?preview=-bogus,-f,-F,--c")).toEqual(mix("a", "b", "c"));
        expect(m("?preview=-F,-f")).toEqual(mix("a", "b", "c"));
        // a lone minus beside a name, and a minus in front of an empty part
        expect(m("?preview=-,g")).toEqual(mix("a", "b", "c", "f", "g"));
        expect(m("?preview=,-,,-f,")).toEqual(mix("a", "b", "c"));
        expect(m("?preview=-&preview=-f")).toEqual(mix("a", "b", "c"));
        // a name in another case is not made a flag by being named on beside the minus
        expect(m("?preview=F,-F")).toEqual(MIX_DEFAULT);
        expect(m("?preview=G,-G")).toEqual(MIX_DEFAULT);
    });

    test("with the minus, names that exist on every object are ignored and do not change the result's shape", async () => {
        const read = await rule();
        for (const value of ["-__proto__", "-constructor", "-toString", "-hasOwnProperty", "-valueOf", "-prototype", "-__defineGetter__", "-isPrototypeOf", "-propertyIsEnumerable"]) {
            const result = read(`?preview=${value}`, MIX, MIX_NEEDS);
            expect(result, value).toEqual(MIX_DEFAULT);
            expect(Object.keys(result), value).toEqual(Object.keys(MIX));
            expect(Object.getPrototypeOf(result), value).toBe(Object.prototype);
            expect(read(`?preview=${value}`), value).toEqual(ALL_OFF);
        }
        const both = read("?preview=-__proto__,-f,-constructor,g", MIX, MIX_NEEDS);
        expect(both).toEqual(mix("a", "b", "c", "g"));
        expect(Object.getPrototypeOf(both)).toBe(Object.prototype);
        // a table that holds such a name as a flag of its own is read as a table
        expect(read("?preview=-constructor", { constructor: true }, {})).toEqual({ constructor: false });
        expect(read("?preview=-__proto__", { a: true }, {})).toEqual({ a: true });
        // nothing leaked onto Object
        expect({}.f).toBeUndefined();
        expect({}.polluted).toBeUndefined();
        expect(Object.keys(Object.prototype)).toEqual([]);
    });

    test("the needs follow a minus: a flag that needs one that was switched off is off, however long the chain", async () => {
        const read = await rule();
        const m = (search) => read(search, MIX, MIX_NEEDS);
        // a is the root of the chain a, b, c
        expect(m("?preview=-a")).toEqual(mix("f"));
        expect(m("?preview=-b")).toEqual(mix("a", "f"));
        expect(m("?preview=-c")).toEqual(mix("a", "b", "f"));
        // a name cannot give a flag what its need lacks
        expect(m("?preview=-a,b")).toEqual(mix("f"));
        expect(m("?preview=-a,b,c")).toEqual(mix("f"));
        expect(m("?preview=b,-a")).toEqual(mix("f"));
        expect(m("?preview=-b,c")).toEqual(mix("a", "f"));
        // a flag off by default whose need is on is switched on by its name, and its need switched off takes it down again
        expect(m("?preview=d,e")).toEqual(mix("a", "b", "c", "d", "e", "f"));
        expect(m("?preview=d,e,-d")).toEqual(MIX_DEFAULT);
        expect(m("?preview=-d,e")).toEqual(MIX_DEFAULT);
        expect(m("?preview=e")).toEqual(MIX_DEFAULT);
        // the chain is the same whatever order the table lists it in
        for (const needs of [{ b: "a", c: "b" }, { c: "b", b: "a" }]) {
            expect(read("?preview=-a", MIX, needs), JSON.stringify(needs)).toEqual(mix("f"));
            expect(read("?preview=-a,c", MIX, needs), JSON.stringify(needs)).toEqual(mix("f"));
            expect(read("?preview=-b", MIX, needs), JSON.stringify(needs)).toEqual(mix("a", "f"));
        }
        // the four flags: -import takes excel-import with it, -export takes excel-export with it, and no flag takes the other side's
        const allOn = { import: true, export: true, "excel-import": true, "excel-export": true };
        expect(read("?preview=-import", allOn)).toEqual(only("export", "excel-export"));
        expect(read("?preview=-export", allOn)).toEqual(only("import", "excel-import"));
        expect(read("?preview=-import,-export", allOn)).toEqual(ALL_OFF);
        expect(read("?preview=-import,excel-import", allOn)).toEqual(only("export", "excel-export"));
        expect(read("?preview=-import", only("import", "excel-import"))).toEqual(ALL_OFF);
        // a need that was never on stays unmet: the minus on the Excel flag alone leaves its parent on
        expect(read("?preview=-excel-import", allOn)).toEqual(only("import", "export", "excel-export"));
    });

    test("with the minus, other parameters are not read, and the parameter is found beside them", async () => {
        const read = await rule();
        const m = (search) => read(search, MIX, MIX_NEEDS);
        expect(m("?db=-f&preview=-c")).toEqual(mix("a", "b", "f"));
        expect(m("?preview=-c&db=northlight")).toEqual(mix("a", "b", "f"));
        expect(m(`?set=${SET_ID}&preview=-f&ex=e2`)).toEqual(mix("a", "b", "c"));
        expect(m("?db=-f&set=-c")).toEqual(MIX_DEFAULT);
        expect(m("?x=1&preview=-f,-c&y=2")).toEqual(mix("a", "b"));
        expect(m("?previews=-f&Preview=-f&PREVIEW=-f")).toEqual(MIX_DEFAULT);
        // the same address without its question mark
        expect(m("preview=-f")).toEqual(mix("a", "b", "c"));
    });

    test("with the minus, a very long value never throws and still finds a name at its end", async () => {
        const read = await rule();
        const m = (search) => read(search, MIX, MIX_NEEDS);
        expect(m(`?preview=-${"x".repeat(200_000)}`)).toEqual(MIX_DEFAULT);
        expect(m(`?preview=${"-bogus,".repeat(40_000)}`)).toEqual(MIX_DEFAULT);
        expect(m(`?preview=${"-bogus,".repeat(40_000)}-f`)).toEqual(mix("a", "b", "c"));
        expect(m(`?preview=${"-f,".repeat(40_000)}f`)).toEqual(mix("a", "b", "c"));
        expect(m(`?preview=-f${" ".repeat(100_000)}`)).toEqual(mix("a", "b", "c"));
        expect(m(`?preview=${" ".repeat(100_000)}-f`)).toEqual(mix("a", "b", "c"));
        expect(m("?" + "preview=-f&".repeat(20_000))).toEqual(mix("a", "b", "c"));
        expect(m("?" + "preview=f&".repeat(20_000) + "preview=-f")).toEqual(mix("a", "b", "c"));
    });

    test("with the minus, a malformed address never throws and a minus after the fault is still read", async () => {
        const read = await rule();
        const m = (search) => read(search, MIX, MIX_NEEDS);
        for (const search of ["?preview=-%", "?preview=-%ZZ", "?preview=%ZZ,-f", "?preview=%E0%A4%A,-f", "?preview=-\u0000", "?preview=-\ud800", "?preview=-f&%=%&&&==-preview"]) {
            expect(() => m(search), JSON.stringify(search)).not.toThrow();
        }
        expect(m("?preview=%ZZ,-f")).toEqual(mix("a", "b", "c"));
        expect(m("?preview=%E0%A4%A,-f")).toEqual(mix("a", "b", "c"));
        expect(m("?preview=-%")).toEqual(MIX_DEFAULT);
        expect(m("?preview=-f&preview=%")).toEqual(mix("a", "b", "c"));
        expect(m("?preview=%&preview=-f")).toEqual(mix("a", "b", "c"));
    });

    test("with the minus, readFlags makes a new result each time and leaves the tables as they were", async () => {
        const read = await rule();
        const defaults = { ...MIX };
        const needs = { ...MIX_NEEDS };
        const first = read("?preview=-a,-f", defaults, needs);
        const second = read("?preview=-a,-f", defaults, needs);
        expect(first).toEqual(mix());
        expect(first).not.toBe(second);
        first.a = true;
        expect(read("?preview=-a,-f", defaults, needs)).toEqual(mix());
        expect(defaults).toEqual(MIX);
        expect(needs).toEqual(MIX_NEEDS);
        // tables that cannot be written to are read as well as any
        expect(read("?preview=-f", Object.freeze({ ...MIX }), Object.freeze({ ...MIX_NEEDS }))).toEqual(mix("a", "b", "c"));
    });

    test("the module loads in Node, where there is no location, and every flag is at its default", async () => {
        expect(typeof location).toBe("undefined");
        const { flags, flagOn } = await load("flags.js");
        const { PREVIEW_FLAGS } = await load("config-workflow.js");
        expect(flags()).toEqual(PREVIEW_FLAGS);
        expect(flags()).toEqual(SHIPPED);
        for (const name of NAMES) {
            expect(flagOn(name), name).toBe(SHIPPED[name]);
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
        // (one flag that is on is set to false, one that is off to true)
        copy.import = false;
        copy["excel-export"] = true;
        copy.extra = true;
        expect(flagOn("import")).toBe(true);
        expect(flagOn("excel-export")).toBe(false);
        expect(flagOn("extra")).toBe(false);
        expect(flags()).toEqual(SHIPPED);
    });

    test("the address is read when the module first runs and never again, and the module touches no storage", async () => {
        const storage = fakeStorage();
        await inNode(storage, async (_events, tab) => {
            globalThis.location = { search: "?db=northlight&preview=-import,excel-export" };
            try {
                const copy = await tab().load("flags.js");
                // (a minus and a name: the import is off and takes its Excel flag with it, the export of
                // Excel workbooks is on beside the export)
                expect(copy.flags()).toEqual(only("export", "excel-export"));
                expect(copy.flagOn("export")).toBe(true);
                expect(copy.flagOn("import")).toBe(false);
                expect(copy.flagOn("excel-import")).toBe(false);
                // the visit goes on to another address: the flags stay as they were read
                globalThis.location = { search: "?db=northlight" };
                expect(copy.flags()).toEqual(only("export", "excel-export"));
                expect(copy.flagOn("export")).toBe(true);
                globalThis.location = { search: "?db=northlight&preview=-export,import" };
                expect(copy.flags()).toEqual(only("export", "excel-export"));
                // another copy of the module (another tab) reads its own address
                globalThis.location = { search: "?db=northlight" };
                const later = await tab().load("flags.js");
                expect(later.flags()).toEqual(SHIPPED);
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
                expect(copy.flags()).toEqual(SHIPPED);
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
    test("with no parameter the flags are the shipped ones: the import, the export and the import of Excel workbooks on", async ({ app, page }) => {
        await app.open("./");
        const seen = await pageFlags(page);
        expect(seen.all).toEqual(SHIPPED);
        expect(seen.on).toEqual(SHIPPED);
    });

    test("with every flag named off, every flag is off", async ({ app, page }) => {
        await app.open(OFF_URL);
        const seen = await pageFlags(page);
        expect(seen.all).toEqual(ALL_OFF);
        expect(seen.on).toEqual(ALL_OFF);
    });

    test("the import named on and the three others named off turn the import flag on and no other", async ({ app, page }) => {
        await app.open(`./?${flagState("import")}`);
        const seen = await pageFlags(page);
        expect(seen.all).toEqual(only("import"));
        expect(seen.on).toEqual(only("import"));
    });

    test("the import and the export named on and the Excel flags named off turn both on and leave the Excel flags off", async ({ app, page }) => {
        await app.open(`./?${flagState("import", "export")}`);
        expect((await pageFlags(page)).all).toEqual(only("import", "export"));
    });

    test("?preview=excel-export turns on the one flag that is off, and the others stay as they ship", async ({ app, page }) => {
        await app.open("./?preview=excel-export");
        expect((await pageFlags(page)).all).toEqual(only(...NAMES));
    });

    test("a minus switches that flag off and no other", async ({ app, page }) => {
        await app.open("./?preview=-export");
        expect((await pageFlags(page)).all).toEqual(only("import", "excel-import"));
        await app.open("./?preview=-excel-import");
        expect((await pageFlags(page)).all).toEqual(only("import", "export"));
        // a flag that is off already stays off, and a name that is no flag does nothing
        await app.open("./?preview=-excel-export,-bogus");
        expect((await pageFlags(page)).all).toEqual(SHIPPED);
        // a minus with a space after it is no name
        await app.open("./?preview=-%20import,-+export");
        expect((await pageFlags(page)).all).toEqual(SHIPPED);
        // spaces around a name with a minus are ignored
        await app.open("./?preview=%20-export%20");
        expect((await pageFlags(page)).all).toEqual(only("import", "excel-import"));
    });

    test("the Excel flags follow their needs in the page too", async ({ app, page }) => {
        await app.open(`./?${flagState("excel-import", "excel-export")}`);
        expect((await pageFlags(page)).all).toEqual(ALL_OFF);
        await app.open(`./?${flagState("excel-import", "import")}`);
        expect((await pageFlags(page)).all).toEqual(only("import", "excel-import"));
        await app.open(`./?${flagState("excel-export", "export")}`);
        expect((await pageFlags(page)).all).toEqual(only("export", "excel-export"));
    });

    test("a minus on the flag an Excel flag needs leaves the Excel flag off in the page too", async ({ app, page }) => {
        await app.open("./?preview=-import");
        expect((await pageFlags(page)).all).toEqual(only("export"));
        await app.open("./?preview=-import&preview=excel-export");
        expect((await pageFlags(page)).all).toEqual(only("export", "excel-export"));
        await app.open("./?preview=-export,excel-export");
        expect((await pageFlags(page)).all).toEqual(only("import", "excel-import"));
        await app.open("./?preview=-export,-excel-import");
        expect((await pageFlags(page)).all).toEqual(only("import"));
        await app.open("./?preview=-import,-export");
        expect((await pageFlags(page)).all).toEqual(ALL_OFF);
    });

    test("a name given both ways is off in the page, in either order and in several parameters", async ({ app, page }) => {
        for (const address of ["./?preview=import,-import", "./?preview=-import,import", "./?preview=-import&preview=import", "./?preview=import&preview=-import"]) {
            await app.open(address);
            expect((await pageFlags(page)).all, address).toEqual(only("export"));
        }
    });

    test("a name in the wrong letter case is not a flag in the page, with or without the minus", async ({ app, page }) => {
        await app.open(`./?${flagState()}&preview=Import,EXPORT`);
        expect((await pageFlags(page)).all).toEqual(ALL_OFF);
        await app.open("./?preview=Import,EXPORT,-Import,-EXPORT,-Excel-Import");
        expect((await pageFlags(page)).all).toEqual(SHIPPED);
    });

    test("the parameter is read beside the ones the page itself uses (db=)", async ({ app, page }) => {
        await app.open(`${NORTHLIGHT_URL}&${flagState("import")}`);
        expect((await pageFlags(page)).all).toEqual(only("import"));
        await app.expectPicked("northlight");
        await app.open(`${NORTHLIGHT_URL}&preview=-import`);
        expect((await pageFlags(page)).all).toEqual(only("export"));
        await app.expectPicked("northlight");
    });

    test("the parameter is read beside the exercise set's (set=)", async ({ app, page }) => {
        test.skip(!SET, "no exercise set with its course database ships");
        await app.open(`./?${flagState("export")}&set=${SET.id}`);
        expect((await pageFlags(page)).all).toEqual(only("export"));
        await expect(app.exercisePanel).toBeVisible();
        await app.open(`./?preview=-export&set=${SET.id}`);
        expect((await pageFlags(page)).all).toEqual(only("import", "excel-import"));
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
        // (the shipped flags: a name that is no flag changes none)
        expect((await pageFlags(page)).all).toEqual(SHIPPED);
        await app.expectToasts([]);
        expect(pageErrors).toEqual([]);
        expect(consoleErrors).toEqual([]);
    });

    test("an unknown name with a minus alone opens the default dataset with no notice and no error", async ({ app, page, pageErrors }) => {
        const consoleErrors = [];
        page.on("console", (message) => message.type() === "error" && consoleErrors.push(message.text()));
        await app.recordToasts({ fromStart: true });
        await app.open("./?preview=-bogus,-,--import,-Import");
        await app.expectPicked(DEFAULT_DATASET.id, DEFAULT_DATASET.name);
        await expect(app.pane).toHaveAttribute("data-state", "empty");
        await expect(app.errorBand).toHaveCount(0);
        expect((await pageFlags(page)).all).toEqual(SHIPPED);
        await app.expectToasts([]);
        expect(pageErrors).toEqual([]);
        expect(consoleErrors).toEqual([]);
    });

    test("a flag turned on stays on when the visit opens another database from the switcher, and the parameter leaves the address", async ({
        app,
        page,
    }) => {
        test.skip(!OTHER_DATASET, "only one course database ships");
        await app.open(`./?${flagState("import", "export")}`);
        expect(page.url()).toContain(flagState("import", "export"));
        await app.pickDatabaseById(OTHER_DATASET.id);
        await app.expectPicked(OTHER_DATASET.id, OTHER_DATASET.name);
        await app.waitReady();
        await expect.poll(() => page.url()).toContain(`db=${OTHER_DATASET.id}`);
        expect(page.url()).not.toContain("preview");
        expect((await pageFlags(page)).all).toEqual(only("import", "export"));
    });

    test("a flag switched off stays off when the visit opens another database from the switcher, and the parameter leaves the address", async ({
        app,
        page,
    }) => {
        test.skip(!OTHER_DATASET, "only one course database ships");
        await app.open("./?preview=-import");
        expect(page.url()).toContain("preview=-import");
        await app.pickDatabaseById(OTHER_DATASET.id);
        await app.expectPicked(OTHER_DATASET.id, OTHER_DATASET.name);
        await app.waitReady();
        await expect.poll(() => page.url()).toContain(`db=${OTHER_DATASET.id}`);
        expect(page.url()).not.toContain("preview");
        expect((await pageFlags(page)).all).toEqual(only("export"));
    });

    test("a flag turned on stays on when the visit opens a file, and the parameter leaves the address", async ({ app, page }) => {
        await app.open(`./?${flagState("import")}`);
        expect(page.url()).toContain(flagState("import"));
        await app.upload(SAMPLE_FILE);
        await expect.poll(() => page.url()).not.toContain("preview");
        expect(page.url()).not.toContain("?");
        expect((await pageFlags(page)).all).toEqual(only("import"));
    });

    test("a flag switched off stays off when the visit opens a file, and the parameter leaves the address", async ({ app, page }) => {
        await app.open("./?preview=-export");
        expect(page.url()).toContain("preview=-export");
        await app.upload(SAMPLE_FILE);
        await expect.poll(() => page.url()).not.toContain("preview");
        expect(page.url()).not.toContain("?");
        expect((await pageFlags(page)).all).toEqual(only("import", "excel-import"));
    });

    test("a flag turned on stays on when the visit opens an exercise set from the picker, and the parameter leaves the address", async ({
        app,
        page,
    }) => {
        test.skip(!SET, "no exercise set with its course database ships");
        await app.open(`${NORTHLIGHT_URL}&${flagState("export")}`);
        expect(page.url()).toContain(flagState("export"));
        await app.pickSet(SET.title);
        await expect(app.exercisePanel).toBeVisible();
        await app.waitReady();
        await expect.poll(() => page.url()).toContain(`set=${SET.id}`);
        expect(page.url()).not.toContain("preview");
        expect((await pageFlags(page)).all).toEqual(only("export"));
    });

    test("a flag switched off stays off when the visit opens an exercise set from the picker, and the parameter leaves the address", async ({
        app,
        page,
    }) => {
        test.skip(!SET, "no exercise set with its course database ships");
        await app.open(`${NORTHLIGHT_URL}&preview=-export`);
        expect(page.url()).toContain("preview=-export");
        await app.pickSet(SET.title);
        await expect(app.exercisePanel).toBeVisible();
        await app.waitReady();
        await expect.poll(() => page.url()).toContain(`set=${SET.id}`);
        expect(page.url()).not.toContain("preview");
        expect((await pageFlags(page)).all).toEqual(only("import", "excel-import"));
    });

    test("a flag turned on stays on when the visit opens an exercise and then closes the set", async ({ app, page }) => {
        test.skip(!SET, "no exercise set with its course database ships");
        await app.open(`./?${flagState("import")}&set=${SET.id}`);
        await expect(app.exercisePanel).toBeVisible();
        await app.exerciseButton(2).click();
        await app.pickSet("None");
        await app.waitReady();
        await expect.poll(() => page.url()).not.toContain("preview");
        expect((await pageFlags(page)).all).toEqual(only("import"));
    });

    test("a flag switched off stays off when the visit opens an exercise and then closes the set", async ({ app, page }) => {
        test.skip(!SET, "no exercise set with its course database ships");
        await app.open(`./?preview=-import&set=${SET.id}`);
        await expect(app.exercisePanel).toBeVisible();
        await app.exerciseButton(2).click();
        await app.pickSet("None");
        await app.waitReady();
        await expect.poll(() => page.url()).not.toContain("preview");
        expect((await pageFlags(page)).all).toEqual(only("export"));
    });

    test("a flag that is off cannot be turned on later by a change of address", async ({ app, page }) => {
        await app.open(OFF_URL);
        await page.evaluate(() => history.pushState(null, "", "?preview=import,export"));
        expect(page.url()).toContain("preview=import,export");
        expect((await pageFlags(page)).all).toEqual(ALL_OFF);
    });

    test("a flag that is on cannot be switched off later by a change of address", async ({ app, page }) => {
        await app.open("./");
        await page.evaluate(() => history.pushState(null, "", "?preview=-import,-export"));
        expect(page.url()).toContain("preview=-import,-export");
        expect((await pageFlags(page)).all).toEqual(SHIPPED);
    });

    test("Open from URL keeps the parameter in the address, and the flag stays on", async ({ app, page }) => {
        await app.open(`${NORTHLIGHT_URL.replace("northlight", DEFAULT_DATASET.id)}&${flagState("import")}`);
        expect(page.url()).toContain(flagState("import"));
        await page.keyboard.press("Control+u");
        const field = page.locator("#open-url-input");
        await expect(field).toBeVisible();
        await field.fill("datasets/northlight_retail.db");
        await field.press("Enter");
        await expect.poll(() => page.url()).toContain("#");
        await app.waitReady();
        expect(page.url()).toContain(flagState("import"));
        expect(page.url()).toContain("northlight_retail.db");
        expect((await pageFlags(page)).all).toEqual(only("import"));
    });

    test("Open from URL keeps a parameter with a minus in the address, and the flag stays off", async ({ app, page }) => {
        await app.open(`${NORTHLIGHT_URL.replace("northlight", DEFAULT_DATASET.id)}&preview=-import`);
        expect(page.url()).toContain("preview=-import");
        await page.keyboard.press("Control+u");
        const field = page.locator("#open-url-input");
        await expect(field).toBeVisible();
        await field.fill("datasets/northlight_retail.db");
        await field.press("Enter");
        await expect.poll(() => page.url()).toContain("#");
        await app.waitReady();
        expect(page.url()).toContain("preview=-import");
        expect(page.url()).toContain("northlight_retail.db");
        expect((await pageFlags(page)).all).toEqual(only("export"));
    });
});

test.describe("a flag never travels", () => {
    // an address that names a flag on, and one that switches a flag off with a minus
    for (const [how, address] of [
        ["on", `./?${flagState("import")}&db=northlight`],
        ["off", "./?preview=-import&db=northlight"],
    ]) {
        test(`a link made by Copy link does not carry the parameter (a flag named ${how})`, async ({ app, page }) => {
            await app.open(address);
            expect(page.url()).toContain("preview=");
            await app.run("SELECT store_name FROM stores ORDER BY 1;");
            const link = await app.copyLink();
            // a share link is the page's address without its query string, and the state in its hash
            expect(link).toMatch(/^https?:\/\/[^?#]*#s=/);
            expect(link).not.toContain("?");
            expect(link).not.toContain("preview");
            expect(link).not.toContain("import");
        });
    }

    test("the link: lines of an exported evidence file do not carry it either", async ({ app, page }) => {
        await app.open(`./?${flagState("import", "export")}&db=northlight`);
        await app.run("SELECT store_name FROM stores ORDER BY 1;");
        await app.run("SELECT 1 AS one;", { via: "button" });
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

    test("the link: lines of an exported evidence file do not carry a minus either", async ({ app, page }) => {
        await app.open("./?preview=-import,-export&db=northlight");
        await app.run("SELECT store_name FROM stores ORDER BY 1;");
        await app.run("SELECT 1 AS one;", { via: "button" });
        const file = await app.exportEvidence();
        const links = file.text.split("\n").filter((line) => line.startsWith("link: "));
        expect(links.length, "an entry that ran on a course dataset has a link line").toBeGreaterThan(0);
        for (const line of links) {
            expect(line).toMatch(/^link: https?:\/\/[^?#\s]*#s=\S+$/);
            expect(line).not.toContain("preview");
        }
        expect(file.text).not.toContain("preview");
        // the flags are off in this file's page: what it did not write was left out, not unknown
        expect((await pageFlags(page)).all).toEqual(ALL_OFF);
    });
});

// How long a deep visit looks at the page after it has loaded, with nothing done: a request or a
// write that the page makes some time after the load (a timer that was set at the start) falls
// in this window. It is a time to look at a page that does nothing, so it cannot be made short by
// waiting for something, and it is spent once per visit.
//
// A timer that is due after that is not waited for: the visit writes down every setTimeout and
// setInterval that is asked for with a delay of LATE_MS or more (the delay, not what the timer
// does), and the two lists are compared at the end. What a timer that is due later would write is
// not seen; that it was set is. (The page asks for one such timer itself, the wait for the editor
// to upgrade, EDITOR_UPGRADE_WAIT_MS: one timer, so the list is the same from one visit to the
// next and two lists can be compared.)
//
// The horizon. The last reading of a deep visit is about five seconds after the page's script
// starts (LATE_MS of waiting, then the keys, the menus, a query, the dialog and the narrow window).
// A write that is due after it is seen only when it comes from one setTimeout or setInterval that
// was asked for with LATE_MS or more: that timer is on the list. Two timers in a chain (each
// shorter than LATE_MS), a requestAnimationFrame poll, scheduler.postTask with a delay, and an
// interval shorter than LATE_MS that looks at the clock are not seen when what they write is due
// after the last reading.
const LATE_MS = 3000;

// the keys a visit presses to see whether the page takes one for itself (it does not, with the
// flags it is given: its own shortcuts are other keys)
const KEYS = ["Control+e", "Control+Shift+E", "Control+s", "Alt+e"];

// How long the page must have written nothing before it is taken to be at rest. It is longer
// than the page's own short delays (the live region of the results pane is filled 60 ms after a
// run, the editor marks where the focus is a few milliseconds after it has moved), and it is
// counted by a timer of the page itself, which the browser runs after every timer that was due
// before it: so a slow machine makes the wait longer, and never lets a write that was due slip
// past it.
const REST_MS = 250;

// What the page holds at one moment: its markup, what the browser keeps for it, and where the
// focus is. `without` says what a flag adds on purpose and is taken out of a copy of the markup
// before it is written down: a selector takes out the nodes it matches, and "selector@name"
// takes the attribute `name` off the nodes it matches. The run time that the status line writes
// ("1 row in 2 ms", in a span of class status-time, in the results pane and in the status bar) is
// the one number that differs from one run to the next: the text of those spans is replaced by
// <time>, and nothing else in the markup is touched (an inline style's duration, say, is compared
// as it is).
//
// The page is written down once it has come to rest. Some of what it holds is written a moment
// after the event that caused it: the limits of the editor's splitter by a ResizeObserver, when
// the summary line of a result takes its room; the words of the live region; the editor's mark
// of the focus. On a busy machine one visit was read before such a write and the other after it,
// and two pages that were the same were found to differ. Rest is REST_MS and two frames in which
// nothing in the document changed, with the editor's mark in step with the focus and no toast on
// its way out. A page that does not come to rest in half a minute fails the test.
async function look(page, without = []) {
    return page.evaluate(
        ({ selectors, quiet }) =>
            new Promise((resolve, reject) => {
                const started = performance.now();
                let changed = false;
                const observer = new MutationObserver(() => {
                    changed = true;
                });
                observer.observe(document.documentElement, { subtree: true, childList: true, attributes: true, characterData: true });
                const stores = () => JSON.stringify([Object.entries(localStorage), Object.entries(sessionStorage)]);
                let kept = stores();
                const marked = () => {
                    const editor = document.querySelector(".cm-editor");
                    return !editor || editor.classList.contains("cm-focused") === editor.contains(document.activeElement);
                };
                const toastShown = () => (document.getElementById("toast-region")?.childElementCount ?? 0) > 0;
                const reading = () => {
                    const copy = document.documentElement.cloneNode(true);
                    for (const selector of selectors) {
                        const [nodes, attribute] = selector.split("@");
                        for (const node of copy.querySelectorAll(nodes)) {
                            if (attribute) {
                                node.removeAttribute(attribute);
                            } else {
                                node.remove();
                            }
                        }
                    }
                    for (const node of copy.querySelectorAll(".status-time")) {
                        node.textContent = node.textContent.replace(/^\d+(?:\.\d+)? ?ms$/, "<time>");
                    }
                    return {
                        dom: copy.outerHTML,
                        local: JSON.stringify(Object.entries(localStorage)),
                        session: JSON.stringify(Object.entries(sessionStorage)),
                        focus: document.activeElement?.id || document.activeElement?.tagName || "",
                    };
                };
                // (a frame's ResizeObservers run after its animation callbacks, so what the first
                // frame wrote is known in the second; a record of a change is handed over before
                // the next task)
                const check = () =>
                    requestAnimationFrame(() =>
                        requestAnimationFrame(() => {
                            const now = stores();
                            if (!changed && now === kept && marked() && !toastShown()) {
                                observer.disconnect();
                                resolve(reading());
                            } else if (performance.now() - started > 30_000) {
                                observer.disconnect();
                                reject(new Error("the page did not come to rest: its markup or its storage went on changing"));
                            } else {
                                changed = false;
                                kept = now;
                                setTimeout(check, quiet);
                            }
                        })
                    );
                setTimeout(check, quiet);
            }),
        { selectors: without, quiet: REST_MS }
    );
}

// and the moment the run log writes beside each query it keeps (2026-11-17T06:10:08Z)
const STAMP = /\d{4}-\d\d-\d\dT\d\d:\d\d:\d\dZ/g;
const stored = (text) => text.replace(STAMP, "<stamp>");

// the visits that are asked for again (the plain page, compared with in several tests of a
// worker): a visit is a pure read of a fresh context, so one answer serves
const kept = new Map();

// What a visit shows, written down for one address, in a browser context of its own (so the two
// visits compared have empty storage each). A deep visit looks longer: it waits LATE_MS after the
// load, then presses keys, goes through both menus with the keys that move in a menu (ArrowDown,
// ArrowUp, Home, End, Escape), runs a query, chooses the database entry of the Export menu and
// closes its dialog, goes through the More menu on a narrow window, and writes the page down at
// each of these points (the last time after the More menu), with the names of the window's own
// properties and the timers that are set for LATE_MS or more.
// `without` says what the page's flags add on purpose, to be left out of the markup (see look).
//
// A visit only says what one page is. What the test can see once two visits are compared
// (expectSameDeep) is a difference between the two pages: a fault in a branch that only one of
// them takes, such as the branch a mount takes when its flag is off.
async function visit(browser, baseURL, address, { deep = false, without = [] } = {}) {
    const key = JSON.stringify([browser.browserType().name(), baseURL, address, deep, without]);
    if (!kept.has(key)) {
        kept.set(key, visitOnce(browser, baseURL, address, { deep, without }));
    }
    try {
        return await kept.get(key);
    } catch (error) {
        kept.delete(key);
        throw error;
    }
}

async function visitOnce(browser, baseURL, address, { deep, without }) {
    const context = await browser.newContext({ baseURL });
    try {
        const page = await context.newPage();
        const app = new App(page);
        const requests = [];
        const errors = [];
        page.on("request", (request) => requests.push(new URL(request.url()).pathname.slice(new URL(baseURL).pathname.length)));
        page.on("pageerror", (error) => errors.push(String(error)));
        page.on("console", (message) => message.type() === "error" && errors.push(message.text()));
        await page.addInitScript((late) => {
            window.__historyCalls = [];
            for (const method of ["pushState", "replaceState"]) {
                const original = History.prototype[method];
                History.prototype[method] = function (...args) {
                    window.__historyCalls.push(method);
                    return original.apply(this, args);
                };
            }
            // the timers that are asked for with a delay of `late` or more (the delay is written
            // down, not what the timer does)
            window.__lateTimers = [];
            for (const name of ["setTimeout", "setInterval"]) {
                const original = window[name];
                window[name] = function (handler, delay, ...rest) {
                    if (Number(delay) >= late) {
                        window.__lateTimers.push(`${name} ${Number(delay)}`);
                    }
                    return original.call(window, handler, delay, ...rest);
                };
            }
            // the listeners the page puts on the window, the document, <html>, <body> and the
            // elements that have an id (a handler of a key or a click that is there for the whole
            // page, or for a menu or a button), and what each key does
            window.__listeners = [];
            window.__keys = [];
            const original = EventTarget.prototype.addEventListener;
            EventTarget.prototype.addEventListener = function (type, listener, options) {
                if (this === window || this === document || this instanceof Element) {
                    window.__listeners.push({ node: this, type, capture: options === true || !!options?.capture });
                }
                return original.call(this, type, listener, options);
            };
            original.call(window, "keydown", (event) => {
                if (["Control", "Shift", "Alt", "Meta"].includes(event.key)) {
                    return;
                }
                // read when the event has gone through every listener
                setTimeout(() => window.__keys.push(`${event.ctrlKey ? "Ctrl+" : ""}${event.shiftKey ? "Shift+" : ""}${event.altKey ? "Alt+" : ""}${event.key} ${event.defaultPrevented ? "prevented" : "left"}`), 0);
            });
        }, LATE_MS);
        await app.recordToasts({ fromStart: true });
        await app.open(address);
        // let anything late (a toast, a second load) show itself
        await page.waitForTimeout(deep ? LATE_MS : 500);
        const loaded = await look(page, without);
        await app.openExportMenu();
        const exportItems = await app.exportMenu.evaluate((menu) =>
            [...menu.querySelectorAll('[role^="menuitem"], button, a')].map((item) => `${item.id}|${item.getAttribute("role")}|${item.textContent.trim()}`)
        );
        await page.keyboard.press("Escape");
        // (the More menu is drawn under 700 px only, but its entries are in the page whatever the
        // width, and so is every dialog that was built: read as they stand)
        const moreItems = await app.moreMenu.evaluate((menu) =>
            [...menu.querySelectorAll('[role^="menuitem"]')].map((item) => `${item.id}|${item.getAttribute("role")}|${item.textContent.trim()}`)
        );
        const dialogs = await page.evaluate(() => [...document.querySelectorAll("dialog")].map((dialog) => dialog.id).sort());
        const openDialogs = await page.evaluate(() => [...document.querySelectorAll("dialog[open]")].map((dialog) => dialog.id).sort());
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
        const result = { ...seen, exportItems, moreItems, dialogs, openDialogs, databaseItems, loaded };
        if (deep) {
            result.listeners = await listenersOf(page, without);
            // the keys: what each did, and where the arrow keys go in the Export menu, then (below)
            // in the More menu
            // (a key is written down in a timer that follows it: let the Escape of the step before get there)
            await page.evaluate(() => new Promise((done) => setTimeout(done, 0)));
            await page.evaluate(() => window.__keys.splice(0));
            await app.editor.focus();
            for (const chord of KEYS) {
                await page.keyboard.press(chord);
            }
            await expect.poll(() => page.evaluate(() => window.__keys.length)).toBe(KEYS.length);
            result.keys = await page.evaluate(() => window.__keys.splice(0));
            await app.openExportMenu();
            result.exportArrows = await arrowsThrough(page, exportItems.length + 1);
            await page.keyboard.press("Escape");
            // the keys that move in a menu, one by one: what each did (the page took it or left
            // it to the browser) and where the focus went; the last one, Escape, closes the menu
            // and the focus goes back to its button (see pressInMenu)
            await app.openExportMenu();
            result.exportKeys = await pressInMenu(page);
            // a query run with the Run button, and what the page holds after it
            await app.run("SELECT 1 AS one;", { via: "button" });
            await expect(app.pane).toHaveAttribute("data-state", "result");
            result.afterRun = await look(page, without);
            // the database entry of the Export menu, and its dialog closed again
            await app.openExportMenu();
            await app.exportButton.click();
            await expect(page.locator("#export-dialog")).toBeVisible();
            await page.keyboard.press("Escape");
            await expect(page.locator("#export-dialog")).toBeHidden();
            result.afterDialog = await look(page, without);
            result.listenersAfter = await listenersOf(page, without);
            // the More menu, on a window narrow enough to draw it
            await page.setViewportSize({ width: 390, height: 800 });
            await app.openMore();
            result.moreArrows = await arrowsThrough(page, moreItems.length + 1);
            await page.keyboard.press("Escape");
            // the keys that move in the More menu (see pressInMenu)
            await app.openMore();
            result.moreKeys = await pressInMenu(page);
            // the page as it ends: after the dialog, the two menus and the narrow window
            result.atEnd = await look(page, without);
            result.listenersAtEnd = await listenersOf(page, without);
            result.endState = await endState(page);
            result.windowNames = await page.evaluate(() => Object.getOwnPropertyNames(window).filter((name) => !name.startsWith("__")).sort());
            result.lateTimers = await page.evaluate(() => [...window.__lateTimers].sort());
        }
        // (a file asked for twice is on the list twice: the counts are compared, not only the names)
        return { ...result, toasts: await app.toasts(), errors, requests: requests.toSorted() };
    } finally {
        await context.close();
    }
}

// What the page holds at the end of a deep visit, and is read again there (seen reads the history
// early, before the keys, the menus and the dialogs): how long the history is and what asked it to
// grow (every pushState and replaceState made so far), the keys of window.app, the cookies, the
// names of the databases of IndexedDB (where the browser can list them), and the style sheets: how
// many, how many are adopted, and how many rules each has (a rule added through the style sheet
// interface changes how the page looks and leaves its markup alone).
const endState = (page) =>
    page.evaluate(async () => ({
        historyLength: history.length,
        historyCalls: [...window.__historyCalls],
        appKeys: Object.keys(window.app).sort(),
        cookie: document.cookie,
        databases: typeof indexedDB.databases === "function" ? (await indexedDB.databases()).map((entry) => entry.name).sort() : null,
        sheets: document.styleSheets.length,
        adopted: document.adoptedStyleSheets.length,
        rules: [...document.styleSheets].map((sheet) => {
            try {
                return sheet.cssRules.length;
            } catch {
                return null;
            }
        }),
    }));

// the ids that ArrowDown goes through, from the first entry of a menu (which has the focus when it
// opens) one by one and round to the first again: one press more than there are entries
const ringWalk = (items) => {
    const ids = items.map((item) => item.split("|")[0]);
    return Array.from({ length: ids.length + 1 }, (unused, n) => ids[(n + 1) % ids.length]);
};

// the ids of the elements the focus lands on in turn, as the arrow key goes down a menu that is open
async function arrowsThrough(page, presses) {
    const order = [];
    for (let n = 0; n < presses; n++) {
        await page.keyboard.press("ArrowDown");
        order.push(await page.evaluate(() => document.activeElement?.id || document.activeElement?.tagName));
    }
    return order;
}

// The listeners the page put on its window, its document, <html>, <body> and on the elements that
// have an id, as "target type" (and "capture" for a listener of the capture phase), sorted. What a
// flag adds on purpose is left out: the elements that `without` selects (and what is inside them).
const listenersOf = (page, without) =>
    page.evaluate((selectors) => {
        const nodes = selectors.filter((selector) => !selector.includes("@"));
        const name = (node) =>
            node === window ? "window" : node === document ? "document" : node === document.documentElement ? "html" : node === document.body ? "body" : node.id ? `#${node.id}` : null;
        return window.__listeners
            .filter(({ node }) => !(node instanceof Element && nodes.some((selector) => node.closest(selector))))
            .map(({ node, type, capture }) => (name(node) === null ? null : `${name(node)} ${type}${capture ? " capture" : ""}`))
            .filter(Boolean)
            .sort();
    }, without);

// The keys that move in a menu, pressed one after the other in a menu that is open (it opens on
// its first entry): End goes to the last, ArrowDown on from the last goes round to the first, Home
// to the first, ArrowUp on from the first goes round to the last, ArrowDown to the first again, and
// Escape closes the menu. Each step is written down as the key, whether the page took it (prevented)
// or left it to the browser, and the id of what has the focus after it. (All the places are the
// ends of the menu, so the entry that a flag adds between two others does not change them.)
const MENU_KEYS = ["End", "ArrowDown", "Home", "ArrowUp", "ArrowDown", "Escape"];
async function pressInMenu(page) {
    const steps = [];
    for (const key of MENU_KEYS) {
        await page.evaluate(() => window.__keys.splice(0));
        await page.keyboard.press(key);
        // (written down in a timer that follows the key; a key that never reaches the window, because
        // a listener stopped it, is written down as that, after a second)
        await page.waitForFunction(() => window.__keys.length > 0, null, { timeout: 1000 }).catch(() => {});
        const [did = `${key} not seen by the window`] = await page.evaluate(() => window.__keys.splice(0));
        steps.push(`${did} -> ${await page.evaluate(() => document.activeElement?.id || document.activeElement?.tagName)}`);
    }
    return steps;
}

// What two deep visits must show alike: the page with a flag on and the page with that flag off (the
// tests below name each page in full, with flagState, so that the pair is the same whatever ships).
// The same markup (the nodes the flag adds were taken out), the same storage, the same focus, at
// four moments (after the load and the wait, after a query, after the database export's dialog,
// and at the very end, after both menus were gone through on a narrow window); the same listeners
// on the page's window, document, <html>, <body> and the elements that have an id; the same keys
// with the same outcome, in each menu (what each did and where the focus went); the same names of
// the window's own properties; the same timers asked for with a long delay; and the same files
// asked for, each as many times, up to the end of the visit. At the end (read again there, after
// everything above) the same history (its length and every pushState and replaceState made), the
// same keys of window.app, cookies, IndexedDB databases and style sheets (their number, the number
// adopted, the rules in each).
//
// This is a comparison of two pages. It sees a difference between them: a fault that sits in the
// branch a mount takes when its flag is off (that branch is run by the page with the flag off and
// not by the other), and that the visit reads. A change that both pages carry (made outside every
// flag's branch, or in a branch that neither takes) is not seen here; the tests of the feature it
// touches hold it.
//
// `ids` are the entries a flag adds to the menus (which the arrow keys then also go through),
// `listeners` the listeners on the whole page that it adds (each taken out once), `properties` the
// names of the window's own properties that it adds, `markup` the words it changes in the markup
// ([what the flagged page says, what the plain page says] each: the first is put back to the second
// before the markup is compared, and has to be in the flagged page's markup), `appKeys` the keys of
// window.app that it adds.
function expectSameDeep(flagged, plain, { ids = [], listeners = [], properties = [], markup = [], appKeys = [] } = {}) {
    for (const [changed] of markup) {
        expect(flagged.loaded.dom, `the markup has the words ${JSON.stringify(changed)}`).toContain(changed);
    }
    const putBack = (dom) => markup.reduce((text, [changed, plainWords]) => text.replaceAll(changed, plainWords), dom);
    for (const moment of ["loaded", "afterRun", "afterDialog", "atEnd"]) {
        expect(stored(flagged[moment].local), `${moment}: localStorage`).toBe(stored(plain[moment].local));
        expect(flagged[moment].session, `${moment}: sessionStorage`).toBe(plain[moment].session);
        expect(putBack(flagged[moment].dom), `${moment}: the page's markup`).toBe(plain[moment].dom);
        expect(flagged[moment].focus, `${moment}: where the focus is`).toBe(plain[moment].focus);
    }
    const without = (all, taken) => taken.reduce((rest, one) => (rest.includes(one) ? rest.toSpliced(rest.indexOf(one), 1) : rest), all);
    for (const when of ["listeners", "listenersAfter", "listenersAtEnd"]) {
        expect(without(flagged[when], listeners), `${when}: the listeners on the page`).toEqual(plain[when]);
    }
    expect(flagged.keys).toEqual(plain.keys);
    // the arrow key goes down a menu one entry at a time, from the one that has the focus when the
    // menu opens (the first), and round to the first again; each page does so over its own entries
    for (const [name, page] of [["flagged", flagged], ["plain", plain]]) {
        expect(page.exportArrows, `${name}: ArrowDown through the Export menu`).toEqual(ringWalk(page.exportItems));
        expect(page.moreArrows, `${name}: ArrowDown through the More menu`).toEqual(ringWalk(page.moreItems));
    }
    if (ids.length === 0) {
        expect(flagged.exportArrows).toEqual(plain.exportArrows);
        expect(flagged.moreArrows).toEqual(plain.moreArrows);
    }
    // End, ArrowDown, Home, ArrowUp, ArrowDown and Escape in each menu: the same outcome, the focus
    // in the same place
    expect(flagged.exportKeys, "the keys in the Export menu").toEqual(plain.exportKeys);
    expect(flagged.moreKeys, "the keys in the More menu").toEqual(plain.moreKeys);
    expect(without(flagged.windowNames, properties), "the window's own properties").toEqual(plain.windowNames);
    expect(flagged.lateTimers, "the timers asked for with a long delay").toEqual(plain.lateTimers);
    // the files asked for, each with its count (a file asked for twice is not the same as once)
    expect(flagged.requests, "the files asked for, with their counts").toEqual(plain.requests);
    const end = flagged.endState;
    expect(end.historyLength, "at the end: the length of the history").toBe(plain.endState.historyLength);
    expect(end.historyCalls, "at the end: the calls of pushState and replaceState").toEqual(plain.endState.historyCalls);
    expect(without(end.appKeys, appKeys), "at the end: the keys of window.app").toEqual(plain.endState.appKeys);
    expect(end.cookie, "at the end: the cookies").toBe(plain.endState.cookie);
    expect(end.databases, "at the end: the databases of IndexedDB").toEqual(plain.endState.databases);
    expect(end.sheets, "at the end: the number of style sheets").toBe(plain.endState.sheets);
    expect(end.adopted, "at the end: the number of adopted style sheets").toBe(plain.endState.adopted);
    expect(end.rules, "at the end: the rules in each style sheet").toEqual(plain.endState.rules);
}

// A flag that nothing reads changes nothing: the page with it on is the page with it off. That
// held for all four while only the groundwork was built. Since the plan's Phase 2 the import
// flag is read, since Phase 3 the export flag, and since Phase 5 the flag excel-import (which does
// nothing without the import flag): the first test of this group turns on every flag but those
// (excel-export does nothing without its parent), and the tests after it say what the import flag
// alone, the export flag alone, and the import flag with excel-import, add to a page on which
// nothing has been done yet. A phase that reads another flag does the same again: takes its flag
// out of UNREAD_FLAGS and adds a test for what it adds. This group is not the pattern for a feature's
// own tests (those are tests/aw2-* and tests/aw3-*).
//
// Every page of this group is named in full: the page with every flag off is OFF_URL, the page
// with the import alone is flagState("import"), and so on, so that each test compares the two
// states it says, whatever ships. Two tests at the end compare the pages that ship with the same
// states named in full: the plain address is the page of the three flags named on, and an address
// with a minus on the import and the export is the page of every flag named off.
//
// What this group can see. It compares two pages: the page with every flag off, and the same page
// with a flag on. So it sees a difference between the two: a fault in the branch that a mount
// takes when its flag is off (a node, a listener, a timer, a key handler, a write to storage, a
// window property that the page with the flag off makes and the page with the flag on does not),
// and it sees it only if the visit reads the thing that changed (see visit and expectSameDeep for
// what it reads). The import's branch shows only against the page with the import flag on; a
// page with another flag on takes it as well. What both pages carry, a change made outside every
// flag's branch (an unconditional listener or write, a stub that both pages take, a rule in a
// style sheet that reaches an element both pages have), is not this group's to find: it is the
// same on both sides. The tests of the feature that the change touches hold it.
test.describe("nothing a student can see", () => {
    const ALL_FLAGS = flagState(...NAMES);
    // the flag that nothing reads, named on (its parent, the export, is named off, so the flag does nothing)
    const UNREAD_FLAGS = flagState("excel-export");
    // the listeners the import adds on the whole page: a drop of files (js/lab/import.js), and the
    // dialog's (js/lab/import-dialog.js): the end of a press, wherever the pointer is let go, the
    // window losing the focus, and a database that has loaded
    const IMPORT_LISTENERS = [
        "document drop",
        "document lab:database-loaded",
        "window blur",
        "window contextmenu capture",
        "window dragend capture",
        "window mouseup capture",
        "window pointercancel capture",
        "window pointerup capture",
    ];

    test("every flag that nothing reads yet on, the page shows what it shows with none: menus, file chooser, toasts, errors, storage, history, requests", async ({
        browser,
        baseURL,
    }) => {
        const plain = await visit(browser, baseURL, OFF_URL, { deep: true });
        const flagged = await visit(browser, baseURL, `./?${UNREAD_FLAGS}`, { deep: true });

        // the page the plain visit opens is a real one (so the comparison is not of two blanks)
        expect(plain.exportItems.length).toBeGreaterThan(0);
        expect(plain.databaseItems.length).toBeGreaterThan(0);
        expect(plain.fileInput.multiple).toBe(false);

        expect(plain.moreItems.length).toBeGreaterThan(0);
        expect(plain.dialogs.length).toBeGreaterThan(0);
        expect(flagged.exportItems).toEqual(plain.exportItems);
        expect(flagged.moreItems).toEqual(plain.moreItems);
        expect(flagged.dialogs).toEqual(plain.dialogs);
        expect(flagged.openDialogs).toEqual(plain.openDialogs);
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
        // and later too: the same markup, storage (both kinds), keys, listeners on the whole page,
        // and files asked for up to three seconds after the load, after a query and after the
        // dialog of the database export was opened and closed
        expectSameDeep(flagged, plain);
        // (a page that was looked at for as long as this one is a real one: it ran, and it kept nothing)
        expect(plain.afterRun.dom).toContain("data-state=\"result\"");
        expect(plain.keys).toHaveLength(KEYS.length);
        // (and what was read again at the end is something: the app's keys, the history, the style sheets and their rules)
        expect(plain.endState.appKeys.length).toBeGreaterThan(0);
        expect(plain.endState.historyLength).toBeGreaterThan(0);
        expect(plain.endState.sheets).toBeGreaterThan(0);
        expect(plain.endState.rules.every((count) => count > 0)).toBe(true);
        expect(plain.exportArrows.every(Boolean)).toBe(true);
        expect(plain.moreArrows.every(Boolean)).toBe(true);
    });

    // The flag excel-import is read since Phase 5, and so is no longer one of UNREAD_FLAGS; but it does nothing
    // without the import flag, and a visit that names it alone (or with the flag of the other Excel side, which
    // needs the export flag) must still be the page with no flag at all, as deeply as the test above looks:
    // menus, file chooser, markup, storage, listeners on the whole page, window properties, timers and files asked
    // for, up to three seconds after the load, after a query and after the export dialog was opened and closed.
    for (const flags of ["excel-import", "excel-import,excel-export"]) {
        test(`the flags ${flags} on and the flags they need off, the page shows what it shows with none: menus, file chooser, markup, storage, listeners, requests`, async ({ browser, baseURL }) => {
            const state = flagState(...flags.split(","));
            const plain = await visit(browser, baseURL, OFF_URL, { deep: true });
            const flagged = await visit(browser, baseURL, `./?${state}`, { deep: true });
            // (the plain page is a real one, and the flagged one is not the plain one asked for twice)
            expect(plain.databaseItems.length).toBeGreaterThan(0);
            expect(plain.fileInput.multiple).toBe(false);
            expect(flagged.url).toBe(`?${state}`);
            expect(flagged.fileInput).toEqual(plain.fileInput);
            expect(flagged.fileInput.multiple).toBe(false);
            expect(flagged.databaseItems).toEqual(plain.databaseItems);
            expect(flagged.exportItems).toEqual(plain.exportItems);
            expect(flagged.moreItems).toEqual(plain.moreItems);
            expect(flagged.dialogs).toEqual(plain.dialogs);
            expect(flagged.openDialogs).toEqual(plain.openDialogs);
            expect(flagged.toasts).toEqual(plain.toasts);
            expect(flagged.errors).toEqual([]);
            expect(flagged.pane).toBe(plain.pane);
            expect(flagged.database).toBe(plain.database);
            expect(flagged.title).toBe(plain.title);
            expect(flagged.toolbar).toBe(plain.toolbar);
            // no library and no module of the import is asked for, and the same files are
            expect(flagged.requests).toEqual(plain.requests);
            expect(flagged.requests.filter((file) => /xlsx|papaparse|fflate/i.test(file))).toEqual([]);
            expect(flagged.storageKeys).toEqual(plain.storageKeys);
            expect(flagged.storageText).toBe(plain.storageText);
            expect(flagged.historyLength).toBe(plain.historyLength);
            expect(flagged.historyCalls).toEqual(plain.historyCalls);
            expectSameDeep(flagged, plain);
        });
    }

    test("all four flags on, localStorage gets no new key and no value that names a flag", async ({ browser, baseURL }) => {
        const plain = await visit(browser, baseURL, OFF_URL);
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
        const plain = await visit(browser, baseURL, OFF_URL);
        const flagged = await visit(browser, baseURL, `./?${ALL_FLAGS}`);
        expect(flagged.historyLength).toBe(plain.historyLength);
        expect(flagged.historyCalls).toEqual(plain.historyCalls);
        // the address is the one the student typed: the page did not rewrite it
        expect(flagged.url).toBe(`?${ALL_FLAGS}`);
        expect(plain.url).toBe(`?${flagState()}`);
    });

    test("every flag that nothing reads yet on, the menus offer the entries they offer today (no entry has appeared whose words name Excel or an import; the evidence entry's line, which says what the file holds, is left out of the words searched)", async ({
        browser,
        baseURL,
    }) => {
        const { EXPORT_EVIDENCE_DESCRIPTION } = await load("config.js");
        const flagged = await visit(browser, baseURL, `./?${UNREAD_FLAGS}`);
        // (the one line that names imports is the evidence entry's description, which says what the file
        // holds whatever the flags are: it is taken out of the words searched, and it must be there to be taken out)
        const entries = flagged.exportItems.concat(flagged.moreItems, flagged.databaseItems);
        expect(entries.filter((item) => item.includes(EXPORT_EVIDENCE_DESCRIPTION))).not.toHaveLength(0);
        const joined = entries.map((item) => item.replace(EXPORT_EVIDENCE_DESCRIPTION, "")).join("\n");
        expect(joined).not.toMatch(/excel|xlsx|\.xls|import/i);
    });

    test("the import flag on, and nothing chosen yet: the file chooser takes several files, the menu entry says what else it takes, and nothing else differs", async ({
        browser,
        baseURL,
    }) => {
        const { OPEN_FILE_DESCRIPTION } = await load("config.js");
        const { OPEN_FILE_WITH_IMPORT_DESCRIPTION } = await load("config-workflow.js");
        // what the flag adds on purpose, taken out of the markup: the chooser's `multiple`, and the
        // import's dialog (the words under "Open a file…" are put back to the plain ones below)
        const added = ["#open-file-input@multiple", "#import-dialog"];
        const plain = await visit(browser, baseURL, OFF_URL, { deep: true });
        const flagged = await visit(browser, baseURL, `./?${flagState("import")}`, { deep: true, without: added });

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

        // and nothing else: no new menu entry (the Export menu and the More menu are as they were),
        // no dialog open, no toast, no error, no key and no value in storage, no step in the
        // history, and no file fetched (the CSV reader is asked for when a file is first read)
        expect(flagged.exportItems).toEqual(plain.exportItems);
        expect(flagged.moreItems).toEqual(plain.moreItems);
        expect(flagged.dialogs.filter((id) => !plain.dialogs.includes(id)).every((id) => id.startsWith("import"))).toBe(true);
        expect(flagged.openDialogs).toEqual(plain.openDialogs);
        expect(flagged.toasts).toEqual(plain.toasts);
        expect(flagged.errors).toEqual([]);
        expect(flagged.pane).toBe(plain.pane);
        expect(flagged.database).toBe(plain.database);
        expect(flagged.title).toBe(plain.title);
        expect(flagged.toolbar).toBe(plain.toolbar);
        expect(flagged.requests).toEqual(plain.requests);
        expect(flagged.requests.filter((file) => /papaparse/i.test(file))).toEqual([]);
        expect(flagged.storageKeys).toEqual(plain.storageKeys);
        expect(flagged.storageText).toBe(plain.storageText);
        expect(flagged.historyLength).toBe(plain.historyLength);
        expect(flagged.historyCalls).toEqual(plain.historyCalls);

        // and the page as a whole, later, as for the export flag (below): the markup with what the
        // import adds taken out, storage, focus, listeners, keys, window properties, timers and
        // files asked for, up to three seconds after the load, after a query, after the dialog of
        // the database export was opened and closed, and at the end. This is the comparison that
        // sees a fault in the branch that the import takes when it is off: the page with every
        // flag off takes it, the page with the import on does not, and a page with only the export
        // on takes it as well and so cannot show it.
        expectSameDeep(flagged, plain, { listeners: IMPORT_LISTENERS, markup: [[OPEN_FILE_WITH_IMPORT_DESCRIPTION, OPEN_FILE_DESCRIPTION]] });
    });

    // Since the plan's Phase 5 the flag excel-import is read, once the import flag is on too. A visit that
    // chooses only text files must not differ from the same visit with the import alone: the same
    // elements, requests and stored keys, the same tables and report; three sentences differ, and only
    // they: the dialog's one sentence, the description under "Open a file…", and the toast for a choice that
    // mixes files (below, in the test of what a choice does).
    test("both flags on, and nothing chosen yet: the page of the import alone, but for two sentences (the menu entry's description and the dialog's)", async ({
        browser,
        baseURL,
    }) => {
        const { IMPORT_DIALOG_TEXT, IMPORT_DIALOG_TEXT_WITH_SHEETS, OPEN_FILE_WITH_EXCEL_DESCRIPTION, OPEN_FILE_WITH_IMPORT_DESCRIPTION } = await load("config-workflow.js");
        // (the three sentences are not the old ones: a swap of two would otherwise pass)
        expect(IMPORT_DIALOG_TEXT_WITH_SHEETS).not.toBe(IMPORT_DIALOG_TEXT);
        expect(OPEN_FILE_WITH_EXCEL_DESCRIPTION).not.toBe(OPEN_FILE_WITH_IMPORT_DESCRIPTION);
        const alone = await visit(browser, baseURL, `./?${flagState("import")}`, { deep: true });
        const both = await visit(browser, baseURL, `./?${flagState("import", "excel-import")}`, { deep: true });
        // the description of the entry, and nothing else of the menus
        const openFile = alone.databaseItems.find((item) => item.startsWith("open-file|"));
        expect(openFile).toContain(OPEN_FILE_WITH_IMPORT_DESCRIPTION);
        expect(both.databaseItems).toEqual(alone.databaseItems.map((item) => (item === openFile ? item.replace(OPEN_FILE_WITH_IMPORT_DESCRIPTION, OPEN_FILE_WITH_EXCEL_DESCRIPTION) : item)));
        expect(both.fileInput).toEqual(alone.fileInput);
        expect(both.exportItems).toEqual(alone.exportItems);
        expect(both.moreItems).toEqual(alone.moreItems);
        expect(both.dialogs).toEqual(alone.dialogs);
        expect(both.openDialogs).toEqual(alone.openDialogs);
        expect(both.toasts).toEqual(alone.toasts);
        expect(both.errors).toEqual([]);
        expect(both.requests).toEqual(alone.requests);
        expect(both.requests.filter((file) => /xlsx|papaparse/i.test(file))).toEqual([]);
        expect(both.storageKeys).toEqual(alone.storageKeys);
        expect(both.storageText).toBe(alone.storageText);
        expect(both.historyLength).toBe(alone.historyLength);
        expect(both.historyCalls).toEqual(alone.historyCalls);
        // the page as a whole, at four moments (listeners and window properties included), with the two sentences put back
        expectSameDeep(both, alone, { markup: [[OPEN_FILE_WITH_EXCEL_DESCRIPTION, OPEN_FILE_WITH_IMPORT_DESCRIPTION], [IMPORT_DIALOG_TEXT_WITH_SHEETS, IMPORT_DIALOG_TEXT]] });
    });

    // What a visit does when it chooses text files, with the import alone and with both flags: a CSV file and
    // a second one, through the dialog to the report. Everything is read at each step (the dialog's markup, the
    // files the page asked for, the keys it stored, what the import made), and compared.
    async function chooseTextFiles(browser, baseURL, address) {
        const context = await browser.newContext();
        const page = await context.newPage();
        const requests = [];
        page.on("request", (request) => {
            const url = new URL(request.url());
            if (url.origin === new URL(baseURL).origin) {
                requests.push(url.pathname.replace(new URL(baseURL).pathname, "/"));
            }
        });
        const errors = [];
        page.on("pageerror", (error) => errors.push(error.message));
        await page.goto(new URL(address, baseURL).href);
        await page.locator("#open-file-input").waitFor({ state: "attached" });
        await page.waitForLoadState("networkidle");
        const files = [
            { name: "people.csv", mimeType: "text/csv", buffer: Buffer.from("id,name\n1,Ann\n2,Bob\n") },
            { name: "pets.tsv", mimeType: "text/tab-separated-values", buffer: Buffer.from("owner\tpet\nAnn\tcat\n") },
        ];
        await page.setInputFiles("#open-file-input", files);
        await page.locator("#import-dialog[open]").waitFor();
        await page.waitForFunction(() => document.querySelectorAll("#import-dialog .import-reading").length === 0);
        const dialog = await page.locator("#import-dialog").evaluate((node) => node.outerHTML);
        await page.locator("#import-dialog button[type=submit]").click();
        await page.waitForFunction(() => !document.querySelector("#import-dialog").open && document.querySelector("#results-pane").dataset.state === "report");
        const report = await page.locator("#results-pane .import-report").evaluate((node) => node.innerHTML);
        const made = await page.evaluate(() => window.app.database.db.exec({ sql: "select name from sqlite_schema where type = 'table' order by name", rowMode: "array", returnValue: "resultRows" }).flat());
        const stored = await page.evaluate(() => Object.keys(localStorage).sort());
        const events = await page.evaluate(async () => {
            const { events } = await import("./bundle/app.js");
            return events.readEvents("file:people").map((event) => event.lines);
        });
        await context.close();
        return { dialog, requests: requests.toSorted(), errors, report, made, stored, events };
    }

    test("both flags on, and only text files chosen: the same dialog, requests, report, tables, events and stored keys as with the import alone, but for the dialog's sentence", async ({
        browser,
        baseURL,
    }) => {
        const { IMPORT_DIALOG_TEXT, IMPORT_DIALOG_TEXT_WITH_SHEETS } = await load("config-workflow.js");
        const alone = await chooseTextFiles(browser, baseURL, `./?${flagState("import")}`);
        const both = await chooseTextFiles(browser, baseURL, `./?${flagState("import", "excel-import")}`);
        expect(alone.errors).toEqual([]);
        expect(both.errors).toEqual([]);
        // (the import ran: the page made tables, and it is not two empty results that agree)
        expect(alone.made).toEqual(["people", "pets"]);
        expect(alone.events).toEqual([["file: people.csv, 20 bytes", "table: people, 2 rows, 2 columns"], ["file: pets.tsv, 18 bytes", "table: pets, 1 rows, 2 columns"]]);
        expect(alone.dialog).toContain(IMPORT_DIALOG_TEXT);
        expect(both.dialog).toContain(IMPORT_DIALOG_TEXT_WITH_SHEETS);
        expect(both.dialog.replace(IMPORT_DIALOG_TEXT_WITH_SHEETS, IMPORT_DIALOG_TEXT)).toBe(alone.dialog);
        // no element, no text and no request of the Excel side: the library is not asked for, and there is no strip of sheets
        expect(both.dialog).not.toMatch(/import-sheet|import-sheets|Sheets of/);
        expect(both.requests).toEqual(alone.requests);
        expect(both.requests.filter((file) => /xlsx/i.test(file))).toEqual([]);
        expect(both.requests.filter((file) => /papaparse/i.test(file)).length).toBeGreaterThan(0);
        expect(both.report).toBe(alone.report);
        expect(both.made).toEqual(alone.made);
        expect(both.events).toEqual(alone.events);
        expect(both.stored).toEqual(alone.stored);
    });

    test("a choice that mixes files is refused with its own toast: with both flags it names Excel files as well, with the import alone it does not", async ({ browser, baseURL }) => {
        const { IMPORT_MIXED_MESSAGE, IMPORT_MIXED_WITH_EXCEL_MESSAGE } = await load("config-workflow.js");
        const toastOf = async (address) => {
            const context = await browser.newContext();
            const page = await context.newPage();
            await page.goto(new URL(address, baseURL).href);
            await page.locator("#open-file-input").waitFor({ state: "attached" });
            // (a choice made while a database is still loading is refused with another toast: the page is waited for)
            await page.locator(READY_PANE).waitFor({ state: "attached" });
            await page.setInputFiles("#open-file-input", [
                { name: "a.csv", mimeType: "text/csv", buffer: Buffer.from("id\n1\n") },
                { name: "b.sql", mimeType: "text/plain", buffer: Buffer.from("SELECT 1;") },
            ]);
            const text = await page.locator("#toast-region .toast").first().textContent();
            const open = await page.evaluate(() => document.querySelector("#import-dialog").open);
            await context.close();
            return { text, open };
        };
        expect(await toastOf(`./?${flagState("import")}`)).toEqual({ text: IMPORT_MIXED_MESSAGE, open: false });
        expect(await toastOf(`./?${flagState("import", "excel-import")}`)).toEqual({ text: IMPORT_MIXED_WITH_EXCEL_MESSAGE, open: false });
        expect(IMPORT_MIXED_WITH_EXCEL_MESSAGE).not.toBe(IMPORT_MIXED_MESSAGE);
    });

    test("the export flag on, and nothing done yet: one entry more in the Export menu and in the More menu, the dialog is built, and nothing else differs", async ({
        browser,
        baseURL,
    }) => {
        const { EXPORT_TABLES_MENU_DESCRIPTION, EXPORT_TABLES_MENU_TEXT } = await load("config-workflow.js");
        const added = ["#export-tables", "#more-export-tables", "#export-tables-dialog"];
        const plain = await visit(browser, baseURL, OFF_URL, { deep: true });
        const flagged = await visit(browser, baseURL, `./?${flagState("export")}`, { deep: true, without: added });

        // what the flag adds: the entry, right after the database's, in each menu, and the dialog
        const entry = `${EXPORT_TABLES_MENU_TEXT}${EXPORT_TABLES_MENU_DESCRIPTION}`;
        const after = (items, id, added) => items.flatMap((item) => (item.startsWith(`${id}|`) ? [item, added] : [item]));
        expect(plain.exportItems.some((item) => item.startsWith("export-db|"))).toBe(true);
        expect(flagged.exportItems).toEqual(after(plain.exportItems, "export-db", `export-tables|menuitem|${entry}`));
        expect(plain.moreItems.some((item) => item.startsWith("more-export-db|"))).toBe(true);
        expect(flagged.moreItems).toEqual(after(plain.moreItems, "more-export-db", `more-export-tables|menuitem|${entry}`));
        expect(flagged.dialogs).toEqual([...plain.dialogs, "export-tables-dialog"].sort());
        // (built, and shut: it is opened by the entry and by nothing else)
        expect(flagged.openDialogs).toEqual(plain.openDialogs);

        // and nothing else: the file chooser takes one file as ever, the database menu is as it
        // was, no toast, no error, no key in storage, no step in the history, and no file fetched
        // (the zip tool is asked for when Export is pressed with two tables)
        expect(flagged.fileInput).toEqual(plain.fileInput);
        expect(flagged.fileInput.multiple).toBe(false);
        expect(flagged.databaseItems).toEqual(plain.databaseItems);
        expect(flagged.toasts).toEqual(plain.toasts);
        expect(flagged.errors).toEqual([]);
        expect(flagged.pane).toBe(plain.pane);
        expect(flagged.database).toBe(plain.database);
        expect(flagged.title).toBe(plain.title);
        expect(flagged.toolbar).toBe(plain.toolbar);
        expect(flagged.requests).toEqual(plain.requests);
        expect(flagged.requests.filter((file) => /fflate|papaparse/i.test(file))).toEqual([]);
        expect(flagged.storageKeys).toEqual(plain.storageKeys);
        expect(flagged.storageText).toBe(plain.storageText);
        for (const key of flagged.storageKeys) {
            expect(key.toLowerCase(), key).not.toMatch(/preview|export/);
        }
        expect(flagged.historyLength).toBe(plain.historyLength);
        expect(flagged.historyCalls).toEqual(plain.historyCalls);
        // and the page as a whole, later: with the entries and the dialog taken out of the markup,
        // it is the plain page's, and so are storage (both kinds), keys, listeners on the whole
        // page (but the dialog's, which wants to know when a database has loaded), keys in each
        // menu, window properties, timers asked for with a long delay and files asked for up to
        // three seconds after the load, after a query, after the dialog of the database export was
        // opened and closed, and at the end. (A node, a timer, a key handler or a write that the
        // disabled branch of the export makes shows here, because the page with the flag on does
        // not make it.)
        expectSameDeep(flagged, plain, { ids: ["export-tables", "more-export-tables"], listeners: ["document lab:database-loaded"] });
        expect(flagged.exportArrows).toContain("export-tables");
        expect(flagged.moreArrows).toContain("more-export-tables");
    });

    // What two visits must show alike, said once for the tests below that compare an address with the
    // state it should be: the menus, the file chooser, the dialogs, toasts, errors, the pane, title and
    // toolbar, the files asked for, storage and history, and then the page as a whole (expectSameDeep).
    function expectSamePage(one, other) {
        expect(one.exportItems).toEqual(other.exportItems);
        expect(one.moreItems).toEqual(other.moreItems);
        expect(one.databaseItems).toEqual(other.databaseItems);
        expect(one.fileInput).toEqual(other.fileInput);
        expect(one.dialogs).toEqual(other.dialogs);
        expect(one.openDialogs).toEqual(other.openDialogs);
        expect(one.toasts).toEqual(other.toasts);
        expect(one.errors).toEqual([]);
        expect(other.errors).toEqual([]);
        expect(one.pane).toBe(other.pane);
        expect(one.database).toBe(other.database);
        expect(one.title).toBe(other.title);
        expect(one.toolbar).toBe(other.toolbar);
        expect(one.requests).toEqual(other.requests);
        expect(one.storageKeys).toEqual(other.storageKeys);
        expect(one.storageText).toBe(other.storageText);
        expect(one.historyLength).toBe(other.historyLength);
        expect(one.historyCalls).toEqual(other.historyCalls);
        expectSameDeep(one, other);
    }

    test("the plain address is the page of the three flags named on and the Excel export named off, deeply: the shipped defaults are that state and nothing more", async ({
        browser,
        baseURL,
    }) => {
        const shipped = await visit(browser, baseURL, "./", { deep: true });
        const named = await visit(browser, baseURL, `./?${flagState("import", "export", "excel-import")}`, { deep: true });
        const off = await visit(browser, baseURL, OFF_URL, { deep: true });
        // (the pages are real ones, and the page that ships is not the page with every flag off)
        expect(shipped.url).toBe("");
        expect(named.url).toBe(`?${flagState("import", "export", "excel-import")}`);
        expect(shipped.fileInput.multiple).toBe(true);
        expect(shipped.exportItems.length).toBeGreaterThan(off.exportItems.length);
        expect(shipped.moreItems.length).toBeGreaterThan(off.moreItems.length);
        expect(shipped.dialogs.length).toBeGreaterThan(off.dialogs.length);
        expect(shipped.afterRun.dom).toContain("data-state=\"result\"");
        expect(shipped.keys).toHaveLength(KEYS.length);
        expectSamePage(shipped, named);
    });

    test("an address with a minus on the import and the export is the page of every flag named off, deeply", async ({ browser, baseURL }) => {
        const minus = await visit(browser, baseURL, "./?preview=-import,-export", { deep: true });
        const off = await visit(browser, baseURL, OFF_URL, { deep: true });
        const shipped = await visit(browser, baseURL, "./", { deep: true });
        expect(minus.url).toBe("?preview=-import,-export");
        expect(off.url).toBe(`?${flagState()}`);
        // (the page is the one without the features, and not the one that ships)
        expect(minus.fileInput.multiple).toBe(false);
        expect(minus.exportItems.length).toBeLessThan(shipped.exportItems.length);
        expect(minus.moreItems.length).toBeLessThan(shipped.moreItems.length);
        expect(minus.dialogs.length).toBeLessThan(shipped.dialogs.length);
        expect(minus.afterRun.dom).toContain("data-state=\"result\"");
        expectSamePage(minus, off);
    });

    test("the flag that nothing reads, named on beside the three that ship, leaves the page as it ships", async ({ browser, baseURL }) => {
        const shipped = await visit(browser, baseURL, "./", { deep: true });
        const flagged = await visit(browser, baseURL, "./?preview=excel-export", { deep: true });
        expect(flagged.url).toBe("?preview=excel-export");
        expectSamePage(flagged, shipped);
    });
});
