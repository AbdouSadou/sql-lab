const fs = require("node:fs");
const path = require("node:path");
const { test, expect, SAMPLE_FILE, flagState, skipUnlessFirst } = require("./helpers");

// What switching a feature off leaves behind (assessment plan, sections 2 and 8). A flag decides what a
// visit can do; it does not touch what a browser already holds. The notes of the files imported and the
// tables exported are kept per log (js/lab/events.js), and the evidence dialog reads them whatever the
// flags say. So a log that holds notes gives a version 2 evidence file on a page with every flag off, and
// a reload loses the imported database but not its log. The documents say so, and the last group holds
// the three sentences of them that said otherwise.

const CSV = { name: "sales.csv", buffer: Buffer.from("a,b\n1,2\n3,4\n") };
const VERSION_2 = /^.* evidence export v2$/m;

test.describe("the notes already kept, and a feature that is switched off", () => {
    test("a log that holds a note of an import gives a version 2 evidence file on a page with every flag off", async ({ page, app }) => {
        // the visit that imports: the page as it ships
        await app.open();
        await app.upload(SAMPLE_FILE);
        await app.importFiles([CSV], { into: "open" });
        await app.run("select 1");
        const first = await app.exportEvidence();
        expect(first.text).toMatch(VERSION_2);
        expect(first.text).toContain("event: import");
        expect(first.text).toContain("file: sales.csv, 12 bytes");

        // a later visit, every flag off, the same file opened again: its log is the same one
        await app.open(`./?${flagState()}`);
        await app.upload(SAMPLE_FILE);
        await app.run("select 2");
        const later = await app.exportEvidence();
        expect(later.text).toMatch(VERSION_2);
        expect(later.text).toContain("event: import");
        expect(later.text).toContain("file: sales.csv, 12 bytes");
        expect(later.text).toContain("select 1");
        expect(later.text).toContain("select 2");
    });

    test("a reload loses an imported database and keeps its log: the same name brings the log back, with the first visit's notes and queries in the file", async ({ page, app }) => {
        await app.open();
        await app.importFiles([CSV]);
        await app.run("select 1 as before_the_reload");
        await page.reload();
        await app.waitReady();
        // the imported database is gone: the page opens the default dataset again
        expect(await page.locator("#database-button").innerText()).not.toContain("sales");

        await app.importFiles([CSV]);
        await app.run("select 2 as after_the_reload");
        const file = await app.exportEvidence();
        expect(file.text).toContain("dataset: file:sales");
        expect(file.text.match(/event: import/g)).toHaveLength(2);
        expect(file.text).toContain("before_the_reload");
        expect(file.text).toContain("after_the_reload");
    });
});

// Three sentences of the documents that were true only before the features were switched on. The
// old words are held out, and the words that took their place are held in. (These hold three
// sentences, not the truth of the documents.)
test.describe("three sentences that were wrong after the switch-on do not come back", () => {
    test.beforeEach(skipUnlessFirst);
    const ROOT = path.join(__dirname, "..");
    const read = (file) => fs.readFileSync(path.join(ROOT, file), "utf8");

    test("the map of the code does not say that every evidence file of a page with the import and the export off is version 1 (section 9.5): notes already kept still reach the file", () => {
        expect(read("CODEMAP.md")).not.toContain("every evidence file from it is still version 1");
        expect(read("CODEMAP.md")).toContain("a log that already holds notes of an import or an export gives a version 2 evidence file there too");
    });

    test("the map of the code does not say that the page has no drag-to-open feature (section 3.2, plain-text.js): a file dropped on the page is taken as a chosen one when the import is on", () => {
        expect(read("CODEMAP.md")).not.toContain("the page has no drag-to-open feature");
        expect(read("CODEMAP.md")).toContain("takes a file dropped anywhere as a chosen one");
    });

    test("the plan does not say that the spreadsheet library is credited although its flag is off (section 3): it says whichever flags are on", () => {
        const plan = read("docs/SQL Lab Assessment Workflow Plan.md");
        expect(plan).not.toContain("although the flag is off");
        expect(plan).toContain("About and the README credit it whichever flags are on, as they do Papa Parse and fflate");
    });
});
