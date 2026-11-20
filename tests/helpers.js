// Shared test fixtures. Later milestones extend this file, so keep the pieces small:
//
//   net  records every request a test makes and answers questions about them
//        (left the origin? same-origin failures? bytes transferred?).
//   app  drives the playground page: open, run SQL, read the result table,
//        upload databases, pick datasets and export through the toolbar button.
//
// A visit to "./" opens the site's default dataset (the manifest's "default": true, DEFAULT_DATASET
// below), and nothing runs on its own: the results pane shows "no result yet" with sample queries
// (UI plan, Phase 4). The tests are written against Northlight Retail, which need not be the
// default, so a test that uses its tables, its samples or its id opens it by id:
// app.open(NORTHLIGHT_URL). A test of the default itself opens "./" and reads DEFAULT_DATASET. A
// test that needs the old empty start uses app.openEmpty(); one that needs a dataset of its own
// uses withSampleDataset().
//
// The results pane (js/lab/results.js) shows one state at a time, named by #results-pane's
// data-state: "loading", "empty" (no result yet), "result" (the summary line #results-summary
// with #status, and the table), "done" (a run with no result set) and "error" (the error band).
// A Run starts one frame after it is asked for (so "Running…" can show during a long one):
// app.run() and app.settle() wait for it to finish, never for text a previous run could
// already show. Toasts (#toast-region) answer actions: Copy link, the exports, a database opened.
//
// Import `test` and `expect` from here, not from @playwright/test:
//
//   const { test, expect } = require("./helpers");
//   test("AC1 ...", async ({ page, net, app }) => { ... });

const crypto = require("node:crypto");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const zlib = require("node:zlib");
const { pathToFileURL } = require("node:url");
const base = require("@playwright/test");
const { expect } = base;
const XLSX = require("../vendor/xlsx.full.min.js");
// (the page's own name for the strip of the files' tabs: a getter cannot wait for the import() below, and the
// module has no top-level await, so node reads it whole where it is asked for)
const { IMPORT_TABS_LABEL } = require("../js/lab/config-workflow.js");

// The page's own words for the export dialog (js/lab/config-workflow.js), read once. A text that a
// helper waits for or looks for comes from here, never typed again.
let exportWordsLoaded;
function exportWords() {
    exportWordsLoaded ??= import(pathToFileURL(path.join(__dirname, "..", "js", "lab", "config-workflow.js")).href).then((words) => {
        for (const name of ["EXPORT_TABLES_COUNTING", "EXPORT_TABLES_HOLD_COUNTING", "EXPORT_TABLES_HOLD_NONE", "EXPORT_TABLES_HOLD_NOTHING"]) {
            if (typeof words[name] !== "string" || words[name] === "") {
                throw new Error(`tests/helpers.js: js/lab/config-workflow.js has no text ${name} any more`);
            }
        }
        if (typeof words.exportTablesWillSaveText !== "function") {
            throw new Error("tests/helpers.js: js/lab/config-workflow.js has no exportTablesWillSaveText any more");
        }
        return words;
    });
    return exportWordsLoaded;
}

// what the line beside Export says when counting has ended, as a pattern: tick something, nothing
// can be ticked, or what will be saved (the words of exportTablesWillSaveText, with its file name
// and its count left open)
function afterCounting(words) {
    const quoted = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const open = (plan) => quoted(words.exportTablesWillSaveText(plan)).replace(/\u0001|\u0002/g, ".+");
    const forms = [
        quoted(words.EXPORT_TABLES_HOLD_NONE),
        quoted(words.EXPORT_TABLES_HOLD_NOTHING),
        open({ kind: "zip", fileName: "\u0001", entries: { length: "\u0002" } }),
        open({ kind: "csv", fileName: "\u0001", entries: [] }),
    ];
    return new RegExp(`^(?:${forms.join("|")})$`);
}

// Request schemes that never touch the network.
const LOCAL_SCHEMES = new Set(["data:", "blob:", "about:"]);

// The SQL editor is the #editor element (js/components/sqlime-editor.js). CodeMirror draws it, and
// its typing surface (the focus, role="textbox", the name and the description) is the .cm-content
// element inside; if CodeMirror did not load, #editor itself is the editable box. Type into
// EDITOR_INPUT (app.editor) and read the text from the element's value (editorValue), not from
// the page: CodeMirror's markup also holds the line numbers and the placeholder.
const EDITOR_INPUT = '#editor .cm-content, #editor[contenteditable="true"]';
const editorValue = (page) => page.locator("#editor").evaluate((el) => el.value);

// editorSelect puts the editor's selection over [anchor, head) of its text (a caret when the two
// are equal) and the focus in the editor, whichever editor is drawn. For CodeMirror that is its
// own selection (el.view); for the plain box, a DOM range over its text (a <br> counts as "\n").
// It is not a student's act: like a click there, a test that wants the Schema tab's insert to go
// at the caret must have typed in the editor (fill) or clicked it first.
async function editorSelect(page, anchor, head = anchor) {
    await page.locator("#editor").evaluate(
        (el, [a, h]) => {
            if (el.view) {
                el.view.focus();
                el.view.dispatch({ selection: { anchor: a, head: h } });
                return;
            }
            HTMLElement.prototype.focus.call(el);
            const point = (offset) => {
                const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT);
                let left = offset;
                for (let node = walker.nextNode(); node; node = walker.nextNode()) {
                    const length = node.nodeType === Node.TEXT_NODE ? node.length : node.localName === "br" ? 1 : 0;
                    if (node.nodeType === Node.TEXT_NODE && left <= length) {
                        return [node, left];
                    }
                    left -= length;
                }
                return [el, el.childNodes.length];
            };
            const range = document.createRange();
            range.setStart(...point(Math.min(a, h)));
            range.setEnd(...point(Math.max(a, h)));
            const selection = getSelection();
            selection.removeAllRanges();
            selection.addRange(range);
        },
        [anchor, head]
    );
}

// expectEditorTextOnly: the editor holds text and nothing made from what was pasted or dropped
// into it. The plain box has no element at all inside; CodeMirror's content has only its own:
// line divs, spans (highlighting, the placeholder, the matching bracket), <br> and the widget
// buffers (an <img> with no src), with none of the attributes markup could bring (on*, src, href,
// id).
async function expectEditorTextOnly(page) {
    const stray = await page.locator("#editor").evaluate((root) => {
        if (!root.view) {
            return [...root.querySelectorAll("*")].map((el) => el.outerHTML);
        }
        const ATTRIBUTES = new Set(["class", "style", "aria-hidden", "contenteditable", "title", "aria-label"]);
        const own = (el) =>
            (el.localName === "div" && el.classList.contains("cm-line")) ||
            el.localName === "span" ||
            el.localName === "br" ||
            (el.localName === "img" && el.classList.contains("cm-widgetBuffer") && !el.hasAttribute("src"));
        return [...root.querySelector(".cm-content").querySelectorAll("*")]
            .filter((el) => !own(el) || [...el.attributes].some((a) => !ATTRIBUTES.has(a.name)))
            .map((el) => el.outerHTML);
    });
    expect(stray).toEqual([]);
}

// The results pane once a load has finished: anything but "loading" (and not the blank page
// before the first load). "empty" is the usual end of a load; "error" a load that failed.
const READY_PANE = '#results-pane:is([data-state="empty"], [data-state="result"], [data-state="done"], [data-state="error"], [data-state="report"])';

// A payload that would create an element and run script if it ever reached innerHTML.
// No quotes inside, so it can also sit in a SQL identifier or a URL.
const PAYLOAD = "<img id=pwn src=x onerror=window.__pwned=1>";
// Same idea, aimed at breaking out of a double-quoted attribute value.
const ATTR_PAYLOAD = 'a"><img id=pwn src=x onerror=window.__pwned=1>';

class NetworkLog {
    constructor(context, baseURL) {
        this.origin = new URL(baseURL).origin;
        this.basePath = new URL(baseURL).pathname;
        this.entries = [];
        const find = (request) => this.entries.find((e) => e.request === request);
        context.on("request", (request) => {
            const url = new URL(request.url());
            this.entries.push({
                request,
                url: request.url(),
                method: request.method(),
                resourceType: request.resourceType(),
                local: LOCAL_SCHEMES.has(url.protocol),
                sameOrigin: url.origin === this.origin,
                status: null,
                response: null,
                failure: null,
            });
        });
        context.on("response", (response) => {
            const entry = find(response.request());
            if (entry) {
                entry.status = response.status();
                entry.response = response;
            }
        });
        context.on("requestfailed", (request) => {
            const entry = find(request);
            if (entry) {
                entry.failure = request.failure()?.errorText || "failed";
            }
        });
    }

    // network returns the entries that went over the network (not data:/blob:).
    get network() {
        return this.entries.filter((e) => !e.local);
    }

    // paths returns the same-origin request paths, relative to the site base.
    get paths() {
        return this.network
            .filter((e) => e.sameOrigin)
            .map((e) => this.relative(e.url));
    }

    relative(url) {
        const { pathname } = new URL(url);
        return pathname.startsWith(this.basePath) ? pathname.slice(this.basePath.length) : pathname;
    }

    clear() {
        this.entries.length = 0;
    }

    // external lists requests whose origin is not the page's origin.
    external() {
        return this.network.filter((e) => !e.sameOrigin).map((e) => e.url);
    }

    // failures lists same-origin requests that failed or got status >= 400.
    failures() {
        return this.network
            .filter((e) => e.sameOrigin && (e.failure || (e.status !== null && e.status >= 400)))
            .map((e) => `${e.method} ${e.url} -> ${e.failure || e.status}`);
    }

    expectNoExternalRequests() {
        expect(this.external(), "requests that left the page's origin").toEqual([]);
    }

    expectNoSameOriginFailures() {
        expect(this.failures(), "failed same-origin requests").toEqual([]);
    }

    // bytes sums the uncompressed response body sizes of the same-origin
    // responses, optionally skipping paths (relative to the base) that match
    // `exclude`. This is the worst case for the transfer size.
    async bytes({ exclude } = {}) {
        let total = 0;
        for (const e of this.network) {
            if (!e.sameOrigin || !e.response) continue;
            if (exclude && exclude.test(this.relative(e.url))) continue;
            total += (await e.response.body()).length;
        }
        return total;
    }
}

// ---- datasets ---------------------------------------------------------------------------
//
// tests/ is not deployed, so the fixture database cannot be fetched from the site. A test that
// needs a second built-in dataset routes a manifest with an extra entry and routes the
// entry's file to tests/fixtures/sample.db. `target` is a page or a browser context (a
// context covers every page it opens, which a "fresh browser" test needs).

const MANIFEST_URL = /\/datasets\/manifest\.json(\?.*)?$/;
const SAMPLE_FILE = path.join(__dirname, "fixtures", "sample.db");
const SAMPLE_ENTRY = {
    id: "sample",
    name: "Sample Fruit",
    file: "datasets/sample.db",
    description: "Test fixture: fruit, tags and a view.",
};
const SAMPLE_URL = /\/datasets\/sample\.db(\?.*)?$/;

// the manifest the site ships
const realManifest = () =>
    JSON.parse(fs.readFileSync(path.join(__dirname, "..", "datasets", "manifest.json"), "utf8"));

// the dataset a visit to "./" opens: the manifest's entry with "default": true. The owner picks it
// (Home Store since 2026-11-12), so a test of "the default" names it through this, not by its id
const DEFAULT_DATASET = realManifest().datasets.find((entry) => entry.default === true);

// Northlight Retail, the dataset the tests are written against (and the shipped exercise set's),
// opened by id (route 4 of js/lab/router.js), whichever dataset is the default
const NORTHLIGHT_URL = "./?db=northlight";

// routeManifest answers the manifest request with `body` (an object, or a string for
// invalid JSON) and the given status, or aborts it with status "abort".
async function routeManifest(target, body, { status = 200 } = {}) {
    await target.route(MANIFEST_URL, (route) => {
        if (status === "abort") return route.abort();
        return route.fulfill({
            status,
            contentType: "application/json",
            body: typeof body === "string" ? body : JSON.stringify(body),
        });
    });
}

// routeSampleDataset serves tests/fixtures/sample.db as datasets/sample.db.
async function routeSampleDataset(target) {
    await target.route(SAMPLE_URL, (route) => route.fulfill({ path: SAMPLE_FILE, contentType: "application/octet-stream" }));
}

// withSampleDataset adds the "sample" entry next to the real datasets.
async function withSampleDataset(target) {
    const manifest = realManifest();
    manifest.datasets.push({ ...SAMPLE_ENTRY });
    await routeManifest(target, manifest);
    await routeSampleDataset(target);
}

// ---- exercise sets (M4) -----------------------------------------------------------------
//
// exercises/<id>.json is served by the test server like any file. A test routes its own set
// (or a listing of the folder) with routeSet / routeListing; `target` is a page or a context.

const setUrl = (id) => new RegExp(`/exercises/${id}\\.json(\\?.*)?$`);
const LISTING_URL = /\/exercises\/(index\.html)?(\?.*)?$/;

// a set the site ships, by id (Northlight Retail's by default)
const realSet = (id = "retail-basics") =>
    JSON.parse(fs.readFileSync(path.join(__dirname, "..", "exercises", `${id}.json`), "utf8"));

// every set the site ships, read from exercises/ and in the order the page lists them (by id,
// compared by code unit): the order of the exercise menu. A test that needs "the sets" or "the
// place of one set in the menu" takes it from here, so that it holds when a set is added.
const shippedSets = () =>
    fs
        .readdirSync(path.join(__dirname, "..", "exercises"))
        .filter((file) => file.endsWith(".json"))
        .map((file) => file.slice(0, -".json".length))
        .sort()
        .map((id) => realSet(id));

// the sets of shippedSets() that the page can open: those whose course database the site ships too.
// (The exercise menu lists a set whatever it names, and says so when its course database is not in
// datasets/manifest.json.) A test that needs "a set to work in" takes it from here, and skips when
// there is none.
const openableSets = () => {
    const shipped = new Set(realManifest().datasets.map((entry) => entry.id));
    return shippedSets().filter((set) => shipped.has(set.dataset));
};

// routeSet answers the request for exercises/<id>.json with `body` (an object, or a string
// for invalid JSON) and the given status, or aborts it with status "abort".
async function routeSet(target, id, body, { status = 200 } = {}) {
    await target.route(setUrl(id), (route) => {
        if (status === "abort") return route.abort();
        return route.fulfill({
            status,
            contentType: "application/json",
            body: typeof body === "string" ? body : JSON.stringify(body),
        });
    });
}

// listingHtml is a folder listing page with one link per href, the way python3 -m http.server
// writes it (the hrefs are escaped for the attribute, the browser decodes them again).
const listingHtml = (hrefs, extra = "") =>
    `<!DOCTYPE HTML><html><head><title>Directory listing</title></head><body><h1>Listing</h1><ul>` +
    hrefs
        .map((h) => `<li><a href="${h.replaceAll("&", "&amp;").replaceAll('"', "&quot;")}">link</a></li>`)
        .join("") +
    `</ul>${extra}</body></html>`;

// routeListing answers the folder URL exercises/ with `html`, a status, or an abort.
async function routeListing(target, html, { status = 200 } = {}) {
    await target.route(LISTING_URL, (route) => {
        if (status === "abort") return route.abort();
        return route.fulfill({ status, contentType: "text/html", body: html });
    });
}

// the model query of an exercise of a shipped set, Northlight Retail's by default (tests type it
// as the "right answer"; the app must never show it)
const modelQuery = (exerciseId, setId = "retail-basics") =>
    realSet(setId).exercises.find((e) => e.id === exerciseId).model_query;

// ---- evidence files (F11) ---------------------------------------------------------------
//
// evidenceFile builds an evidence file the way spec section 5a lays it out, independently of
// js/lab/evidence.js (so the app is checked against a second implementation, not itself).
// entries: [{t, outcome: "12 rows" | "error: msg", sql, link?}]. `hex` overrides the checksum
// (to make a file whose checksum is wrong on purpose).
function evidenceFile({
    appName = "SQL Lab",
    dataset = "northlight",
    exported = "2026-11-09T14:32:08Z",
    student = "U2034567",
    entries,
    hex = null,
}) {
    const crypto = require("node:crypto");
    let body = `${appName} evidence export v1\ndataset: ${dataset}\nexported: ${exported}\n\n`;
    entries.forEach((e, i) => {
        body += `[${i + 1}] ${e.t} \u00b7 ${e.outcome}\n${e.sql}\n${e.link ? `link: ${e.link}\n` : ""}\n`;
    });
    body += `student: ${student}\n`;
    const digest = hex ?? crypto.createHash("sha256").update(Buffer.from(body, "utf8")).digest("hex");
    return `${body}sha256: ${digest}\n`;
}

class App {
    constructor(page) {
        this.page = page;
        // the typing surface; editorHost is the element with the editor's methods (value, query)
        this.editor = page.locator(EDITOR_INPUT);
        this.editorHost = page.locator("#editor");
        // the results pane and what it shows (js/lab/results.js)
        this.pane = page.locator("#results-pane");
        // the summary line's text: "5 rows in 3 ms", "Showing 500 of 906 rows in 3 ms", "Done ..."
        this.status = page.locator("#status");
        this.summary = page.locator("#results-summary");
        this.result = page.locator("#result");
        this.table = page.locator("#result table");
        // the error band (a failed run, or a problem with a load or a link: in #result, or, when a
        // load failed and the view before it came back, at the top of the pane in .results-problem)
        // and "no result yet"
        this.errorBand = page.locator("#results-pane .results-band");
        this.emptyState = page.locator("#result .results-empty");
        this.samples = page.locator("#result .results-sample");
        // the live region that says each outcome ("5 rows returned", "This query has an error: ...")
        this.announcer = page.locator("#results-announce");
        // the toast on screen (Copy link, an export, a database opened, a refused Run)
        this.toast = page.locator("#toast-region");
    }

    // open navigates (relative URL only) and waits for the engine and database.
    async open(url = "./") {
        await this.page.goto(url);
        await this.waitReady();
    }

    // openEmpty starts on an empty database with an empty editor, the way unmodified SQLime
    // did: the manifest request fails, so no dataset opens (js/lab/router.js).
    async openEmpty(url = "./") {
        await routeManifest(this.page, "", { status: "abort" });
        await this.page.goto(url);
        await expect(this.errorBand).toContainText("could not be loaded");
        await this.waitReady();
    }

    // waitReady: a load has finished (the results pane is out of its loading state)
    async waitReady() {
        await expect(this.page.locator(READY_PANE)).toHaveCount(1);
    }

    // settle waits until no run is waiting or running (a Run starts one frame after it is asked
    // for); call it after pressing Run or Ctrl+Enter some other way than app.run()
    async settle() {
        await this.page.evaluate(() => window.app?.whenIdle?.());
    }

    // run types SQL into the editor and runs it with Ctrl+Enter (or the Run button), and waits
    // for the run to finish. On a phone (under 700 px) it shows the Editor view first, as a person
    // would to type: a run that finishes shows the Result view.
    async run(sql, { via = "keyboard" } = {}) {
        await this.showView("editor");
        await this.editor.fill(sql);
        if (via === "button") {
            await this.page.locator("#execute").click();
        } else {
            await this.editor.press("Control+Enter");
        }
        await this.settle();
    }

    // read returns the rendered result table as {columns, rows} of strings.
    async read() {
        await expect(this.table).toBeVisible();
        return this.table.evaluate((table) => ({
            columns: [...table.querySelectorAll("thead th")].map((th) => th.textContent.trim()),
            rows: [...table.querySelectorAll("tbody tr")].map((tr) =>
                [...tr.querySelectorAll("td")].map((td) => td.textContent.trim())
            ),
        }));
    }

    // query runs SQL and returns the resulting table.
    async query(sql) {
        await this.run(sql);
        await expect(this.pane).toHaveAttribute("data-state", "result");
        return this.read();
    }

    // expectInert asserts that no markup from a payload was ever turned into an element
    // and that no script from it ran. Call it after the page has shown the payload.
    async expectInert() {
        await expect(this.page.locator("#pwn")).toHaveCount(0);
        await expect(this.page.locator("img[src=x]")).toHaveCount(0);
        expect(await this.page.evaluate(() => window.__pwned)).toBeUndefined();
    }

    // upload feeds a file (path or {name, mimeType, buffer}) to the "open file" input.
    // Pass { ready: false } when the load is expected to fail.
    async upload(file, { ready = true } = {}) {
        // The status can already show a ready message from the database that is open, so
        // wait for the open database to be replaced before waiting for the new status.
        const before = ready ? await this.page.evaluateHandle(() => window.app?.database) : null;
        await this.page.locator("#open-file-input").setInputFiles(file);
        if (ready) {
            await this.page.waitForFunction((old) => window.app.database !== old, before);
            await this.waitReady();
        }
    }

    // chooseFiles feeds one or several files (paths, or {name, mimeType, buffer}) to the "open
    // file" input and waits for nothing: with the import on (?preview=import), CSV files open the
    // import's dialog and no database changes until Import is pressed. (Several files need the
    // flag: without it the input takes one.)
    async chooseFiles(files) {
        await this.page.locator("#open-file-input").setInputFiles(files);
    }

    // dropFiles drops files on the page as a browser's drag would: dragover, then drop, on the
    // element `target` (a selector). files are paths, or {name, buffer} (a Buffer or text), or
    // {name, size} for a file of zeros made in the page (for the size limits: no bytes travel).
    // Returns whether the drop was cancelled (defaultPrevented): it always must be.
    async dropFiles(files, { target = "body" } = {}) {
        const list = (Array.isArray(files) ? files : [files]).map((file) => {
            if (typeof file === "string") {
                return { name: path.basename(file), base64: fs.readFileSync(file).toString("base64") };
            }
            if (file.size !== undefined && file.buffer === undefined) {
                return { name: file.name, size: file.size };
            }
            return { name: file.name, base64: Buffer.from(file.buffer).toString("base64") };
        });
        return this.page.evaluate(
            ([selector, given]) => {
                const data = new DataTransfer();
                for (const file of given) {
                    const parts = file.base64 === undefined ? [new Uint8Array(file.size)] : [Uint8Array.from(atob(file.base64), (ch) => ch.charCodeAt(0))];
                    data.items.add(new File(parts, file.name));
                }
                const element = document.querySelector(selector);
                const fire = (type) => {
                    const event = new DragEvent(type, { dataTransfer: data, bubbles: true, cancelable: true });
                    element.dispatchEvent(event);
                    return event.defaultPrevented;
                };
                fire("dragover");
                return fire("drop");
            },
            [target, list]
        );
    }

    // The import's dialog (js/lab/import-dialog.js): its parts, by what they are.
    get importDialog() {
        return this.page.locator("#import-dialog");
    }

    // the tabs of the files (the outer strip: one for each file; a workbook's sheets have a strip of
    // their own, inside the file's panel: importSheetTabs)
    get importTabs() {
        return this.importDialog.getByRole("tablist", { name: IMPORT_TABS_LABEL, exact: true }).getByRole("tab");
    }

    // the strip of a workbook's sheets, by its label ("Sheets of shopping_db.xlsx"), and the panel of
    // the sheet that is showing
    importSheetStrip(label) {
        return this.importDialog.getByRole("tablist", { name: label, exact: true });
    }

    get importSheetPanel() {
        return this.importDialog.locator(".import-panel:not([hidden]) .import-sheet-panel:not([hidden])");
    }

    // the panel of the tab that is showing
    get importPanel() {
        return this.importDialog.locator(".import-panel:not([hidden])");
    }

    get importSubmit() {
        return this.importDialog.locator('button[type="submit"]');
    }

    get importCancel() {
        return this.importDialog.locator(".app-dialog-actions button[type=button]");
    }

    // importFiles chooses the files, waits until every one has been looked at, and presses
    // Import; resolves when the dialog has closed and the report is in the results pane.
    // into: "new" (the default) or "open". Pass { names: {"file.csv": "table_name"} } to type names.
    async importFiles(files, { into = "new", database = null, names = {} } = {}) {
        await this.chooseFiles(files);
        await expect(this.importDialog).toBeVisible();
        await expect(this.importDialog.locator(".import-reading")).toHaveCount(0);
        if (into === "open") {
            await this.importDialog.locator("#import-into-open").check();
        } else if (database !== null) {
            await this.importDialog.locator("#import-database-name").fill(database);
        }
        for (const [file, name] of Object.entries(names)) {
            await this.importTabs.filter({ hasText: file }).click();
            await this.importPanel.getByLabel("Table name").fill(name);
        }
        await expect(this.importSubmit).toBeEnabled();
        await this.importSubmit.click();
        await expect(this.importDialog).toBeHidden();
        await expect(this.pane).toHaveAttribute("data-state", "report");
    }

    // rows runs SQL on the open database and returns its rows as the engine gives them (numbers,
    // strings, null), not as the page prints them. Nothing is shown and nothing goes in the run log.
    async rows(sql) {
        return this.page.evaluate((text) => window.app.database.db.exec({ sql: text, rowMode: "array", returnValue: "resultRows" }), sql);
    }

    // rename renames the open database the way the page offers it since the UI plan's Phase 2:
    // the Export menu's "Database (.db)…" dialog takes the new name, and Export (Enter) renames the
    // database and saves it under that name (the download is not waited for).
    async rename(name) {
        if (await this.isPhone()) {
            // (under 700 px Export is in the More menu, from Phase 6)
            await this.openMore();
            await this.page.locator("#more-export-db").click();
        } else {
            await this.openExportMenu();
            await this.page.locator("#export-db").click();
        }
        const field = this.page.locator("#export-name");
        await expect(field).toBeVisible();
        await field.fill(name);
        await field.press("Enter");
        await expect(this.page).toHaveTitle(new RegExp(`^${name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")} - `));
    }

    // ---- the top bar (UI plan, Phase 2)
    // the database switcher: its button, the name it shows, its menu
    get databaseButton() {
        return this.page.locator("#database-button");
    }

    get databaseLabel() {
        return this.page.locator("#database-button-name");
    }

    get databaseMenu() {
        return this.page.locator("#database-menu");
    }

    // pickDatabase chooses a course database by its name in the switcher's menu
    async pickDatabase(name) {
        await this.databaseButton.click();
        await expect(this.databaseMenu).toBeVisible();
        await this.databaseMenu.getByRole("menuitemradio", { name: new RegExp(`^${name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`) }).click();
    }

    // the menu's entries for the course databases, and the one with this id (in the page even
    // while the menu is closed); pickDatabaseById opens the menu with a click and chooses it, as a
    // student does
    get databaseItems() {
        return this.databaseMenu.locator('[role="menuitemradio"]');
    }

    databaseItem(id) {
        return this.databaseMenu.locator(`[role="menuitemradio"][data-dataset-id="${id}"]`);
    }

    async pickDatabaseById(id) {
        await this.databaseButton.click();
        await expect(this.databaseMenu).toBeVisible();
        await this.databaseItem(id).click();
    }

    // expectPicked asserts which course database the menu ticks: exactly the one with this id, or
    // none (null: an upload, a URL or the empty database is not in the list); with a name, the
    // button shows it too.
    async expectPicked(id, name = null) {
        const ticked = this.databaseMenu.locator('[role="menuitemradio"][aria-checked="true"]');
        if (id === null) {
            await expect(ticked).toHaveCount(0);
        } else {
            await expect(ticked).toHaveCount(1);
            await expect(ticked).toHaveAttribute("data-dataset-id", id);
        }
        if (name !== null) {
            await expect(this.databaseLabel).toHaveText(name);
        }
    }

    // the Export menu's button in the top bar, and its menu
    get exportMenuButton() {
        return this.page.locator("#export-button");
    }

    get exportMenu() {
        return this.page.locator("#export-menu");
    }

    // openExportMenu opens the Export menu of the top bar
    async openExportMenu() {
        if (!(await this.exportMenu.isVisible())) {
            await this.exportMenuButton.click();
        }
        await expect(this.exportMenu).toBeVisible();
    }

    // ---- the export of tables as CSV (js/lab/export-tables-dialog.js; behind ?preview=export)
    // its entries in the two menus, and its dialog: its parts, by what they are
    get tablesItem() {
        return this.page.locator("#export-tables");
    }

    get moreTablesItem() {
        return this.page.locator("#more-export-tables");
    }

    get tablesDialog() {
        return this.page.locator("#export-tables-dialog");
    }

    get tablesAll() {
        return this.tablesDialog.locator("#export-tables-all");
    }

    get tablesHold() {
        return this.tablesDialog.locator("#export-tables-hold");
    }

    get tablesError() {
        return this.tablesDialog.locator("#export-tables-error");
    }

    get tablesSubmit() {
        return this.tablesDialog.locator("#export-tables-submit");
    }

    get tablesCancel() {
        return this.tablesDialog.locator("#export-tables-cancel");
    }

    get tablesNote() {
        return this.tablesDialog.locator("#export-tables-note");
    }

    get tablesProgress() {
        return this.tablesDialog.locator(".tables-progress");
    }

    // the row of a table or view, by its exact name
    tablesRow(name) {
        const exact = new RegExp(`^${name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`);
        return this.tablesDialog.locator(".tables-row").filter({ has: this.page.locator(".tables-row-name").filter({ hasText: exact }) });
    }

    tablesBox(name) {
        return this.tablesRow(name).locator("input.tables-row-box");
    }

    // openTables chooses "Tables as CSV…" in the Export menu, or in the More menu on a phone, and
    // waits for the dialog
    async openTables() {
        if (await this.isPhone()) {
            await this.openMore();
            await this.moreTablesItem.click();
        } else {
            await this.openExportMenu();
            await this.tablesItem.click();
        }
        await expect(this.tablesDialog).toBeVisible();
    }

    // waitCounted: every row has its count (Export can be pressed once something is ticked). The
    // words are the page's own (js/lab/config-workflow.js), and what it waits for is something that
    // cannot be true while a count is on its way or before the list is there: the line beside
    // Export (#export-tables-hold) says what it says once counting has ended (tick something,
    // nothing can be ticked, or what will be saved), which is neither empty nor the counting line;
    // and no row says the counting words and every row says something. A reworded text that the page
    // no longer takes from the config, or a constant that is gone, fails here, loudly.
    async waitCounted() {
        const words = await exportWords();
        const line = this.tablesDialog.locator(".tables-row-line");
        await expect(this.tablesHold).toBeVisible();
        await expect(this.tablesHold).toHaveText(afterCounting(words));
        await expect(line.filter({ hasText: words.EXPORT_TABLES_COUNTING })).toHaveCount(0);
        await expect(line.filter({ hasText: /^\s*$/ })).toHaveCount(0);
    }

    // tickTables ticks the rows of these tables, by name (the tick box stays as it is where it is
    // ticked already)
    async tickTables(names) {
        for (const name of names) {
            await this.tablesBox(name).check();
        }
    }

    // tablesRows reads the dialog's list: [{name, kind, line, ticked, tickable}]
    tablesRows() {
        return this.tablesDialog.locator(".tables-row").evaluateAll((rows) =>
            rows.map((row) => {
                const box = row.querySelector("input.tables-row-box");
                return {
                    name: row.querySelector(".tables-row-name").textContent,
                    kind: row.querySelector(".tables-row-kind") ? "view" : "table",
                    line: row.querySelector(".tables-row-line").textContent,
                    ticked: box.checked,
                    tickable: box.getAttribute("aria-disabled") !== "true",
                };
            })
        );
    }

    // download runs `trigger` (a click, a key) and returns the file the page saves as {name,
    // buffer, text}: the name it was offered under and its bytes (text is the UTF-8 reading, a byte
    // order mark kept as U+FEFF)
    async download(trigger) {
        const [download] = await Promise.all([this.page.waitForEvent("download"), trigger()]);
        const stream = await download.createReadStream();
        const chunks = [];
        for await (const chunk of stream) chunks.push(chunk);
        const buffer = Buffer.concat(chunks);
        return { name: download.suggestedFilename(), buffer, text: buffer.toString("utf8") };
    }

    // exportTables opens the dialog, ticks these tables (all of them with "all"), presses Export and
    // returns the file that is saved, as download() does; the dialog is left as it ends
    async exportTables(names) {
        await this.openTables();
        await this.waitCounted();
        if (names === "all") {
            await this.tablesAll.check();
        } else {
            await this.tickTables(names);
        }
        await expect(this.tablesSubmit).toHaveAttribute("aria-disabled", "false");
        return this.download(() => this.tablesSubmit.click());
    }

    // ---- the layouts of the UI plan's Phase 6: under 1100 px the sidebar is a drawer (opened by
    // the top bar's Sidebar button); under 700 px Copy link, Export, Theme and Help are in the More
    // menu, and the query and its result are two views, Editor and Result (a run shows the result)
    get sidebarButton() {
        return this.page.locator("#sidebar-button");
    }

    get moreButton() {
        return this.page.locator("#more-button");
    }

    get moreMenu() {
        return this.page.locator("#more-menu");
    }

    // whether the window is narrow enough for the More menu (under 700 px)
    isPhone() {
        return this.moreButton.isVisible();
    }

    // openDrawer opens the sidebar where it is a drawer; nothing to do on a wide window
    async openDrawer() {
        if ((await this.sidebarButton.isVisible()) && (await this.sidebarButton.getAttribute("aria-expanded")) !== "true") {
            await this.sidebarButton.click();
            await expect(this.page.locator("#sidebar")).toBeVisible();
        }
    }

    async openMore() {
        if (!(await this.moreMenu.isVisible())) {
            await this.moreButton.click();
        }
        await expect(this.moreMenu).toBeVisible();
    }

    // showView shows the phone's Editor or Result view; nothing to do on a wider window
    async showView(view) {
        const button = this.page.locator(view === "result" ? "#view-result" : "#view-editor");
        if ((await button.isVisible()) && (await button.getAttribute("aria-current")) !== "true") {
            await button.click();
        }
    }

    // the sidebar's tabs: "schema", "exercises" or "history"
    tab(name) {
        return this.page.locator(`#tab-${name}`);
    }

    async openTab(name) {
        // (under 1100 px the tabs are in the drawer)
        await this.openDrawer();
        await this.tab(name).click();
        await expect(this.page.locator(`#panel-${name}`)).toBeVisible();
    }

    // storedQueries returns the SQL the app saved in localStorage, as [key, sql] pairs.
    storedQueries() {
        return this.page.evaluate(() =>
            Object.keys(localStorage)
                .filter((k) => k.startsWith("sqlime.query."))
                .sort()
                .map((k) => [k, localStorage.getItem(k)])
        );
    }

    // shareField is the read-only field of Copy link's popover, shown only when the browser kept
    // the clipboard to itself (js/lab/copy-link.js).
    get shareField() {
        return this.page.locator("#copy-link-popover input.share-link-field");
    }

    // stubClipboard replaces the page's clipboard with a recorder (window.__copied, the texts
    // written, in order), so a test reads what Copy link copied without the browser's clipboard
    // permissions. It lasts until the page navigates.
    async stubClipboard() {
        await this.page.evaluate(() => {
            if (window.__copyStub) {
                return;
            }
            window.__copyStub = true;
            window.__copied = [];
            Object.defineProperty(navigator, "clipboard", {
                configurable: true,
                value: {
                    writeText: async (text) => {
                        window.__copied.push(String(text));
                    },
                },
            });
        });
    }

    // copyLink clicks the copy link button (or presses Enter on it with via "keyboard") and
    // returns the link it put on the clipboard (stubbed: see stubClipboard); "Link copied" says so.
    async copyLink({ via = "mouse" } = {}) {
        await this.stubClipboard();
        const before = await this.page.evaluate(() => window.__copied.length);
        const button = this.page.locator("#copy-link");
        if (await this.isPhone()) {
            // under 700 px Copy link is the More menu's first entry, where the menu opens
            if (via === "keyboard") {
                await this.moreButton.focus();
                await this.page.keyboard.press("Enter");
                await expect(this.page.locator("#more-copy-link")).toBeFocused();
                await this.page.keyboard.press("Enter");
            } else {
                await this.openMore();
                await this.page.locator("#more-copy-link").click();
            }
        } else if (via === "keyboard") {
            await button.focus();
            await this.page.keyboard.press("Enter");
        } else {
            await button.click();
        }
        await this.page.waitForFunction((count) => window.__copied.length > count, before);
        await expect(this.toast).toContainText("Link copied");
        return this.page.evaluate(() => window.__copied.at(-1));
    }

    // ---- toasts (js/lab/toast.js)
    //
    // A toast shows about 60 ms after its action and removes itself after 4 s or more, so a negative
    // check on the region (not.toContainText, toHaveCount(0)) retries until the toast has come and
    // gone and cannot fail. Record instead: recordToasts() keeps every text the region shows in
    // window.__toasts (fromStart: from before the page's own scripts run, for the first load; it is
    // an init script, so call it before navigating), toasts() reads the list, and
    // expectToasts(list, {settle}) waits `settle` ms (longer than the 60 ms gap) and then compares
    // the whole list, once, without retrying. A toast that has not shown yet is replaced by the
    // next one and is then never in the list: a test that lists the toasts of several actions
    // waits for each toast to show before the next action, or its list changes with the speed of
    // the machine (the "back twice" test of m3-audit-fixes did, once, under load).
    async recordToasts({ fromStart = false } = {}) {
        const install = () => {
            const start = () => {
                if (window.__toastsRecorded) {
                    return;
                }
                const region = document.getElementById("toast-region");
                if (!region) {
                    return;
                }
                window.__toastsRecorded = true;
                window.__toasts = [];
                new MutationObserver(() => {
                    const text = region.textContent;
                    if (text) {
                        window.__toasts.push(text);
                    }
                }).observe(region, { childList: true, subtree: true, characterData: true });
            };
            if (document.readyState === "loading") {
                document.addEventListener("DOMContentLoaded", start);
            } else {
                start();
            }
        };
        if (fromStart) {
            await this.page.addInitScript(install);
        } else {
            await this.page.evaluate(install);
        }
    }

    toasts() {
        return this.page.evaluate(() => window.__toasts ?? null);
    }

    async expectToasts(list, { settle = 300 } = {}) {
        await this.page.waitForTimeout(settle);
        expect(await this.toasts()).toEqual(list);
    }

    // ---- F5 results (js/lab/results.js)
    get csvButton() {
        return this.page.locator("#download-csv");
    }

    // downloadCsv presses the download csv button (a real click, or Enter on the focused
    // button with via "keyboard") and returns the saved file as {name, buffer, text}. text
    // is the UTF-8 decoding with a byte order mark, if any, kept as U+FEFF.
    async downloadCsv({ via = "mouse" } = {}) {
        const [download] = await Promise.all([
            this.page.waitForEvent("download"),
            via === "keyboard"
                ? (async () => {
                      await this.csvButton.focus();
                      await this.page.keyboard.press("Enter");
                  })()
                : this.csvButton.click(),
        ]);
        const stream = await download.createReadStream();
        const chunks = [];
        for await (const chunk of stream) chunks.push(chunk);
        const buffer = Buffer.concat(chunks);
        return { name: download.suggestedFilename(), buffer, text: buffer.toString("utf8") };
    }

    // ---- F6 run log and F11 evidence export (js/lab/run-log.js, evidence-dialog.js)
    // the History tab of the sidebar (it replaced the history popup of the command bar)
    get historyButton() {
        return this.page.locator("#tab-history");
    }

    // the same, by what it is now: the History tab
    get historyTab() {
        return this.historyButton;
    }

    // openHistory shows the History tab and waits for its list
    async openHistory() {
        await this.openTab("history");
        await expect(this.historyList).toBeVisible();
    }

    get historyList() {
        return this.page.locator("#run-history-list");
    }

    get historyEntries() {
        return this.page.locator("#run-history-list button");
    }

    // "Evidence (.txt)…" in the Export menu; openEvidence() opens the menu and chooses it
    get evidenceButton() {
        return this.page.locator("#export-evidence");
    }

    async openEvidence() {
        // (under 700 px the exports are in the More menu)
        if (await this.isPhone()) {
            await this.openMore();
            await this.page.locator("#more-export-evidence").click();
            return;
        }
        await this.openExportMenu();
        await this.evidenceButton.click();
    }

    get evidenceDialog() {
        return this.page.locator("#evidence-dialog");
    }

    get evidenceInput() {
        return this.page.locator("#evidence-student");
    }

    get evidenceError() {
        return this.page.locator("#evidence-error");
    }

    // readLog returns the stored run log of a log key (the entries array), or null when none is stored.
    // A Run stores its entry before its result is on screen, so nothing needs waiting for.
    readLog(key) {
        return this.page.evaluate((k) => {
            const text = localStorage.getItem(`sqllab.log.${k}`);
            return text === null ? null : JSON.parse(text).entries;
        }, key);
    }

    // seedLog stores a run log (an array of entries, or raw text) the way the app does.
    seedLog(key, entries) {
        return this.page.evaluate(
            ([k, value]) => {
                localStorage.setItem(
                    `sqllab.log.${k}`,
                    typeof value === "string" ? value : JSON.stringify({ v: 1, entries: value })
                );
            },
            [key, entries]
        );
    }

    // exportEvidence drives the real dialog: the button, the student number, Export. Returns the
    // downloaded file as {name, buffer, text}.
    async exportEvidence(student = "U2034567") {
        await this.openEvidence();
        await expect(this.evidenceDialog).toBeVisible();
        await this.evidenceInput.fill(student);
        const [download] = await Promise.all([
            this.page.waitForEvent("download"),
            this.evidenceDialog.locator("button[type=submit]").click(),
        ]);
        const stream = await download.createReadStream();
        const chunks = [];
        for await (const chunk of stream) chunks.push(chunk);
        const buffer = Buffer.concat(chunks);
        await expect(this.evidenceDialog).toBeHidden();
        return { name: download.suggestedFilename(), buffer, text: buffer.toString("utf8") };
    }

    // ---- exercise mode on screen (js/lab/exercise-panel.js). Ids are the stable ones of the panel.
    get exercisePanel() {
        return this.page.locator("#exercise-panel");
    }

    // the set picker of the Exercises tab: a menu button and its menu
    get setPicker() {
        return this.page.locator("#exercise-set-picker");
    }

    get setMenu() {
        return this.page.locator("#exercise-set-menu");
    }

    // openSetMenu opens the set picker's menu (showing the Exercises tab first if need be)
    async openSetMenu() {
        if (!(await this.setPicker.isVisible())) {
            await this.openTab("exercises");
        }
        await this.setPicker.click();
        await expect(this.setMenu).toBeVisible();
    }

    // pickSet chooses an entry of the set picker by its label ("None", or a set's title)
    async pickSet(label) {
        await this.openSetMenu();
        await this.setMenu.getByRole("menuitemradio", { name: label, exact: true }).click();
    }

    get checkButton() {
        return this.page.locator("#exercise-check");
    }

    get feedback() {
        return this.page.locator("#exercise-feedback");
    }

    get progress() {
        return this.page.locator("#exercise-progress");
    }

    get prompt() {
        return this.page.locator("#exercise-prompt");
    }

    get hintButton() {
        return this.page.locator("#exercise-hint-button");
    }

    get hints() {
        return this.page.locator("#exercise-hints");
    }

    // exerciseButton(n) is the n-th button (1-based) of the exercise list.
    exerciseButton(n) {
        return this.page.locator("#exercise-list > li > button").nth(n - 1);
    }

    // openSet opens an exercise set by its address (?set=<id>[&ex=<id>]) and waits for the panel
    // and the database.
    async openSet(id = "retail-basics", { ex = null } = {}) {
        await this.page.goto(`./?set=${id}${ex ? `&ex=${ex}` : ""}`);
        await expect(this.exercisePanel).toBeVisible();
        // the list is built (under 1100 px it is in the sidebar's drawer, which stays shut)
        await expect(this.page.locator("#exercise-list button").first()).toBeAttached();
        await this.waitReady();
    }

    // ---- the checker (js/lab/checker.js), driven in the page.
    //
    // check(exerciseId, sql, {set}) runs one check with the page's own checker (made on first
    // use, so its model cache lasts as long as the page) and returns the outcome. `set` is a
    // set object (default: the shipped retail-basics, loaded with loadSet); exerciseId picks
    // an exercise of it, or pass {exercise} for one that is not in the set.
    check(exerciseId, sql, { set = null, exercise = null } = {}) {
        return this.page.evaluate(
            async ({ exerciseId, sql, set, exercise }) => {
                if (!window.__checker) {
                    const { createChecker } = await import("./bundle/app.js").then((bundle) => bundle.checker);
                    window.__checker = createChecker();
                }
                if (!set) {
                    const { loadSet } = await import("./bundle/app.js").then((bundle) => bundle.exercises);
                    set = (await loadSet("retail-basics")).set;
                }
                const picked = exercise ?? set.exercises.find((e) => e.id === exerciseId);
                return window.__checker.check(set, picked, sql);
            },
            { exerciseId, sql, set, exercise }
        );
    }

    // trackConnections wraps manager.init so that every connection opened from now on is
    // recorded; connections() lists them as [{name, open}] in the order they were opened.
    async trackConnections() {
        await this.page.evaluate(async () => {
            const manager = (await import("./bundle/app.js").then((bundle) => bundle.manager)).default;
            window.__opened = [];
            const original = manager.init;
            manager.init = async function (name, path) {
                const database = await original.call(this, name, path);
                window.__opened.push({ name, database });
                return database;
            };
        });
    }

    connections() {
        return this.page.evaluate(() =>
            window.__opened.map(({ name, database }) => ({ name, open: database ? database.db.isOpen() : null }))
        );
    }

    // ---- the schema sidebar (js/lab/schema.js). Names are the accessible names of its buttons.
    get schema() {
        return this.page.locator("#schema");
    }

    // the Schema tab of the sidebar (it replaced the schema panel's own toggle)
    get schemaToggle() {
        return this.page.locator("#tab-schema");
    }

    schemaInsert(name, kind = "table") {
        return this.page.getByRole("button", { name: `Insert ${kind} name ${name} into the query`, exact: true });
    }

    schemaColumn(table, column) {
        return this.page.getByRole("button", {
            name: `Insert column name ${column} of ${table} into the query`,
            exact: true,
        });
    }

    schemaExpand(name, kind = "table") {
        return this.page.getByRole("button", { name: `Columns of ${kind} ${name}`, exact: true });
    }

    // schemaItem is the list item of a table or view.
    schemaItem(name, kind = "table") {
        return this.page.locator("#schema .schema-item").filter({ has: this.schemaInsert(name, kind) });
    }

    // schemaSummary lists what the sidebar shows: [{name, count, view}] in order. count is the
    // visible text of the row count (a number, or the dash).
    schemaSummary() {
        return this.page.locator("#schema .schema-item").evaluateAll((items) =>
            items.map((li) => ({
                name: li.querySelector(".schema-insert").textContent,
                count: li.querySelector(".schema-count").firstChild.textContent,
                view: li.dataset.kind === "view",
            }))
        );
    }

    // schemaColumns lists the columns shown under an expanded table: [{name, type}].
    schemaColumns(name, kind = "table") {
        return this.schemaItem(name, kind)
            .locator(".schema-column")
            .evaluateAll((items) =>
                items.map((li) => ({
                    name: li.querySelector(".schema-insert")?.textContent ?? null,
                    type: li.querySelector(".schema-type")?.textContent ?? null,
                }))
            );
    }

    // sqlFile makes an upload of a .sql script.
    static sqlFile(name, sql) {
        return { name, mimeType: "text/plain", buffer: Buffer.from(sql) };
    }

    // picker is the database switcher's button (it replaced the Dataset select); exportButton is
    // "Database (.db)…" in the Export menu.
    get picker() {
        return this.databaseButton;
    }

    get exportButton() {
        return this.page.locator("#export-db");
    }

    // the same, by what it is now: the Export menu's "Database (.db)…" entry
    get exportDatabaseItem() {
        return this.exportButton;
    }

    // pickedText is the name the database switcher shows.
    pickedText() {
        return this.databaseLabel.textContent();
    }

    // exportFile exports the database through the Export menu and its dialog (the name as it is)
    // and returns the downloaded file as {name, buffer}. The menu, the dialog, the download event
    // and the saved bytes are the real thing.
    async exportFile() {
        await this.openExportMenu();
        await this.exportButton.click();
        await expect(this.page.locator("#export-dialog")).toBeVisible();
        const [download] = await Promise.all([
            this.page.waitForEvent("download"),
            this.page.locator("#export-dialog button[type=submit]").click(),
        ]);
        const stream = await download.createReadStream();
        const chunks = [];
        for await (const chunk of stream) chunks.push(chunk);
        return { name: download.suggestedFilename(), buffer: Buffer.concat(chunks) };
    }

    // exportDatabase returns the current database as a Buffer, through the export button.
    async exportDatabase() {
        return (await this.exportFile()).buffer;
    }
}

// openFresh opens `link` (an absolute URL produced by copy link) in a brand-new browser
// context with empty storage, which is what a recipient is. It checks that the link
// lives under the site's base URL and then navigates by the relative remainder.
// Returns {context, page, app, net}; the caller closes the context.
// `setup(context)` runs before the page opens (to route a manifest, say).
async function openFresh(browser, baseURL, link, { setup } = {}) {
    expect(link.startsWith(baseURL), `${link.slice(0, 80)} is under ${baseURL}`).toBe(true);
    const context = await browser.newContext({ baseURL });
    if (setup) await setup(context);
    const net = new NetworkLog(context, baseURL);
    const page = await context.newPage();
    const errors = [];
    page.on("pageerror", (err) => errors.push(String(err)));
    await page.goto(link.slice(baseURL.length));
    return { context, page, app: new App(page), net, errors };
}

// quoteIdent quotes a name as an SQL identifier (for building test SQL).
const quoteIdent = (name) => `"${name.replaceAll('"', '""')}"`;

// ---- the owner's test files of the assessment plan (tests/fixtures/, never edited by a test) ----

// fixturePath("csv/title_rows.csv") -> the file's path; expectedFor(name) -> its expected result
// (tests/fixtures/expected/, one file per fixture; tests/fixtures/README.md says what they hold)
const FIXTURES_DIR = path.join(__dirname, "fixtures");
const fixturePath = (name) => path.join(FIXTURES_DIR, ...name.split("/"));
const expectedFor = (name) => JSON.parse(fs.readFileSync(path.join(FIXTURES_DIR, "expected", `${name.replaceAll("/", "__")}.json`), "utf8"));
// every entry of expected/index.json: {fixture, covers, expected, open_questions}
const fixtureIndex = () => JSON.parse(fs.readFileSync(path.join(FIXTURES_DIR, "expected", "index.json"), "utf8"));

const sha256 = (text) => crypto.createHash("sha256").update(text, "utf8").digest("hex");

// largeCsv() -> the path of large.csv, the 200,000-row file that is not stored: it is written to
// the system's temporary folder the first time (as tests/fixtures/tools/gen_csv.py writes it) and
// checked against the checksum in expected/large.csv.json.
function largeCsv() {
    const expected = expectedFor("large.csv");
    // (in a folder of its own, so that the file is called large.csv: its table is named after it)
    const folder = path.join(os.tmpdir(), `lab-fixtures-${expected.file_sha256.slice(0, 16)}`);
    const file = path.join(folder, "large.csv");
    if (!fs.existsSync(file) || fs.statSync(file).size !== expected.file_bytes) {
        fs.mkdirSync(folder, { recursive: true });
        const regions = ["North", "South", "East", "West", "Scotland", "Wales"];
        const two = (n) => String(n).padStart(2, "0");
        const lines = ["order_id,order_date,region,customer_ref,quantity,unit_price,note"];
        for (let i = 1; i <= 200000; i++) {
            const date = `2024-${two(1 + ((i * 3) % 12))}-${two(1 + ((i * 7) % 28))}`;
            const customer = `C${String((i * 37) % 4000).padStart(5, "0")}`;
            lines.push(`${i},${date},${regions[i % 6]},${customer},${1 + (i % 12)},${3 + (i % 250)}.${two((i * 17) % 100)},${i % 50 === 0 ? "gift" : ""}`);
        }
        const bytes = Buffer.from(`${lines.join("\r\n")}\r\n`, "utf8");
        if (crypto.createHash("sha256").update(bytes).digest("hex") !== expected.file_sha256) {
            throw new Error("large.csv as written here is not the file the expected result was made from");
        }
        // Several test workers can get here at once. The first to finish puts the file in place
        // and the others leave it alone: a browser refuses to read a file that was replaced after
        // it was chosen.
        const draft = `${file}.${process.pid}`;
        fs.writeFileSync(draft, bytes);
        try {
            fs.linkSync(draft, file);
        } catch {
            // (another worker was first)
        }
        fs.unlinkSync(draft);
    }
    return file;
}

// ---- holding a long job still, and what it must leave behind ------------------------------------
// (no hook exists in the product: a job is held by what it waits for)

// holdVendor routes a vendored library's file through a gate: the first `pass` requests go
// through, later ones wait until open() is called. Returns {open, requests}. (The import's preview
// asks for its library once before the import does; an export asks for its zip tool only when it
// runs, so it holds from the first request.)
async function holdVendor(page, file, { pass = 0 } = {}) {
    let open;
    const gate = new Promise((resolve) => (open = resolve));
    let requests = 0;
    await page.route(`**/vendor/${file}`, async (route) => {
        requests++;
        if (requests > pass) {
            await gate;
        }
        await route.continue().catch(() => {});
    });
    return { open, requests: () => requests };
}

// csvFile(name, text) is a CSV file made in the test: {name, mimeType, buffer}, as chooseFiles and
// dropFiles take it
const csvFile = (name = "people.csv", text = "id,name\n1,Ann\n2,Bob\n") => ({ name, mimeType: "text/csv", buffer: Buffer.from(text) });

// wideLastRowCsv() is "wide.csv": the preview reads the first megabyte of a text file, so a file whose
// rows are all fine for that long shows as fine; a row of 2,001 fields after it is met by the import
// (which refuses the file as too wide and undoes what it did).
const wideLastRowCsv = () => {
    const rows = ["id,note"];
    let size = rows[0].length;
    for (let i = 1; size < 1_200_000; i++) {
        const row = `${i},${"x".repeat(80)}`;
        rows.push(row);
        size += row.length + 1;
    }
    rows.push(Array.from({ length: 2001 }, (unused, n) => n).join(","));
    return csvFile("wide.csv", `${rows.join("\n")}\n`);
};

// holdImport opens the import's dialog for `files`, lets the preview read them, takes the CSV
// reader off the page so that the import has to ask for it again, holds that second request (the
// preview's own, the first, goes through) and presses Import. The import is then running and waits
// on the gate. Returns {open, requests}, as holdVendor does. Needs the page opened with
// ?preview=import.
async function holdImport(page, app, { files = [csvFile()], into = "new", database = null } = {}) {
    const held = await holdVendor(page, "papaparse.min.js", { pass: 1 });
    await app.chooseFiles(files);
    await expect(app.importDialog).toBeVisible();
    await expect(app.importDialog.locator(".import-reading")).toHaveCount(0);
    if (into === "open") {
        await app.importDialog.locator("#import-into-open").check();
    } else if (database !== null) {
        await app.importDialog.locator("#import-database-name").fill(database);
    }
    await expect(app.importSubmit).toBeEnabled();
    await page.evaluate(() => {
        delete window.Papa;
    });
    await app.importSubmit.click();
    await expect(app.importDialog.locator(".import-progress")).toBeVisible();
    return held;
}

// the reader is let through and the held import ends, with its report
async function finishHeld(app, held) {
    held.open();
    await expect(app.importDialog).toBeHidden();
    await expect(app.pane).toHaveAttribute("data-state", "report");
}

// holdDataset routes the fetch of a course database's file through a gate: the request waits
// until release() (the file is then served as ever) or fail() (the request is aborted).
// `requested` settles when the page has asked for the file, which is when a load is on its way;
// `served` when the file has been given to the page (and, a little later, the page has used it).
async function holdDataset(page, dataset = DEFAULT_DATASET) {
    let settle;
    const gate = new Promise((resolve) => (settle = resolve));
    let asked;
    const requested = new Promise((resolve) => (asked = resolve));
    let given;
    const served = new Promise((resolve) => (given = resolve));
    const file = dataset.file.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    await page.route(new RegExp(`/${file}(\\?.*)?$`), async (route) => {
        asked();
        const verdict = await gate;
        if (verdict === "fail") {
            await route.abort().catch(() => {});
            return;
        }
        const response = await route.fetch();
        await route.fulfill({ response }).catch(() => {});
        given();
    });
    return { requested, served, release: () => settle("go"), fail: () => settle("fail") };
}

// slowDown makes every turn the page gives itself between two pieces of a long job cost 15 ms,
// so that a long job takes seconds and Cancel can be pressed in the middle of it. The browser's
// own scheduler.yield is replaced where it exists; where it does not, the page uses a
// MessageChannel, and the port's postMessage is delayed.
const slowDown = (page) =>
    page.evaluate(() => {
        if (globalThis.scheduler && typeof globalThis.scheduler.yield === "function") {
            globalThis.scheduler.yield = () => new Promise((resolve) => setTimeout(resolve, 15));
        } else {
            const post = MessagePort.prototype.postMessage;
            MessagePort.prototype.postMessage = function (...args) {
                setTimeout(() => post.apply(this, args), 15);
            };
        }
    });

// gateTurns(page) holds the import at a place its dialog shows: the next turn the import gives the
// page, once the progress shows a title that matches and a part that is as given, is held until the
// test lets it go, so that Cancel, Escape or a change to the page can be made at exactly that place
// whatever the machine's speed. Returns {at(title, part), held(), release()}: at() arms it (title is a
// regular expression, part the words under the title, null for any), held() says whether a turn is
// held, and release() lets it go. The page's clock stands still from at() until the release, so that the
// pace always takes a plain turn and never waits for a frame. Where the browser has scheduler.yield
// the turn is that; where not it is the message the page sends itself.
async function gateTurns(page) {
    await page.evaluate(() => {
        const gate = { title: null, part: null, held: false, release: null, frozen: null };
        window.__gate = gate;
        const clock = performance.now.bind(performance);
        performance.now = () => gate.frozen ?? clock();
        const holds = () => {
            if (!gate.title) {
                return false;
            }
            const title = document.querySelector("#import-progress-title")?.textContent ?? "";
            const part = document.querySelector("#import-dialog .results-loading-size")?.textContent ?? "";
            return new RegExp(gate.title).test(title) && (gate.part === null || part === gate.part);
        };
        const wait = (go) => {
            gate.held = true;
            gate.release = () => {
                gate.release = null;
                gate.held = false;
                gate.title = null;
                gate.frozen = null;
                go();
            };
        };
        if (typeof globalThis.scheduler?.yield === "function") {
            globalThis.scheduler.yield = () =>
                new Promise((resolve) => {
                    if (holds()) {
                        wait(resolve);
                    } else {
                        setTimeout(resolve, 0);
                    }
                });
        } else {
            const post = MessagePort.prototype.postMessage;
            MessagePort.prototype.postMessage = function (...args) {
                if (holds()) {
                    wait(() => post.apply(this, args));
                } else {
                    post.apply(this, args);
                }
            };
        }
    });
    return {
        at: (title, part = null) =>
            page.evaluate(([source, words]) => {
                window.__gate.title = source;
                window.__gate.part = words;
                window.__gate.frozen = performance.now();
            }, [title.source, part]),
        held: () => page.evaluate(() => window.__gate.held),
        release: () => page.evaluate(() => window.__gate.release?.()),
    };
}

// the open database as a handle that can be compared with the open one later
const databaseHandle = (page) => page.evaluateHandle(() => window.app.database);
const isOpenDatabase = (page, handle) => page.evaluate((old) => window.app.database === old, handle);
// the names of everything the open database holds, in SQL's order
const schemaNames = (app) => app.rows("SELECT name FROM sqlite_schema ORDER BY name").then((rows) => rows.map((row) => row[0]));
// the keys the evidence log keeps in storage
const eventKeys = (page) => page.evaluate(() => Object.keys(localStorage).filter((key) => key.startsWith("sqllab.events.")));

// what the evidence log holds, in the page's memory and in storage, for the given log keys
function eventsOf(page, keys) {
    return page.evaluate(async (list) => {
        const { events } = await import("./bundle/app.js");
        const found = {};
        for (const key of list) {
            found[key] = events.readEvents(key);
        }
        const stored = Object.keys(localStorage).filter((key) => key.startsWith("sqllab.events."));
        return { found, stored };
    }, keys);
}

// the key of the log (the run log's and the events') of the open database, made by the app's own
// function (js/lab/run-log.js logKeyFor, through the bundle). Without `dataset` it is the key of a
// database opened as a file or made empty: "file:<name>". With a course database (a manifest entry,
// or its id) it is the key that database's log is kept under: the dataset's id.
const logKey = (page, dataset) =>
    page.evaluate(async (chosen) => {
        const { runLog } = await import("./bundle/app.js");
        return runLog.logKeyFor(chosen ? { id: typeof chosen === "string" ? chosen : chosen.id } : null, window.app.database.name);
    }, dataset ?? null);

// the key of the log of whatever is open: the dataset's id for a course database (the page keeps
// the id of the dataset it has opened), "file:<name>" for any other
const openLogKey = (page) =>
    page.evaluate(async () => {
        const { runLog, datasets } = await import("./bundle/app.js");
        const id = datasets.getPristineId();
        return runLog.logKeyFor(id === null ? null : { id }, window.app.database.name);
    });

// databaseFingerprint(page) -> {sha256, size, userVersion}: what the open database holds, read from
// inside the page: the SHA-256 of the bytes the engine serialises for the main database
// (sqlite3_js_db_export) and PRAGMA user_version. Reading it writes nothing.
const databaseFingerprint = (page) =>
    page.evaluate(async () => {
        const { database } = window.app;
        const bytes = database.capi.sqlite3_js_db_export(database.db.pointer, "main");
        const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", bytes));
        return {
            sha256: Array.from(digest, (byte) => byte.toString(16).padStart(2, "0")).join(""),
            size: bytes.length,
            userVersion: database.db.selectValue("pragma user_version"),
        };
    });

// connectionState(page) -> {statement, transaction, attached, settings}: what the open connection is
// in, apart from the content of the database. statement: true when the engine has a statement open
// on the connection (sqlite3_next_stmt; a job that ended or was stopped has finalized every one it
// read or wrote with, and the page keeps none between two jobs); transaction: true when a
// transaction or a savepoint is open
// (sqlite3_get_autocommit is 0); attached: the names of the databases attached beside "main" and
// "temp" (PRAGMA database_list; the TEMP objects are looked for by expectNothingLeft itself, and
// the temp database stays listed once anything TEMP was made, so it is left out); settings: the
// connection's foreign_keys, recursive_triggers, full_column_names and short_column_names. Reading
// it changes nothing.
const connectionState = (page) =>
    page.evaluate(() => {
        const { database } = window.app;
        const db = database.db;
        // (read first: the look at the settings, below, opens statements of its own and closes them)
        const statement = database.capi.sqlite3_next_stmt(db.pointer, 0) !== 0;
        const settings = {};
        for (const name of ["foreign_keys", "recursive_triggers", "full_column_names", "short_column_names"]) {
            settings[name] = db.selectValue(`pragma ${name}`);
        }
        return {
            statement,
            transaction: database.capi.sqlite3_get_autocommit(db.pointer) === 0,
            attached: db
                .selectValues("select name from pragma_database_list")
                .filter((name) => name !== "main" && name !== "temp")
                .sort(),
            settings,
        };
    });

// what the page was before a long job that is going to be cancelled. With `content` (the default)
// the open database's fingerprint is kept too, so that expectNothingLeft can say the content is the
// same; pass { content: false } where the job is allowed to change it. The state of the connection
// (a statement open, a transaction open, a database attached, four settings) is always kept.
async function snapshot(page, app, { content = true } = {}) {
    return {
        handle: await databaseHandle(page),
        name: await page.evaluate(() => window.app.database.name),
        href: await page.evaluate(() => location.href),
        title: await page.title(),
        label: await app.databaseLabel.textContent(),
        tables: await schemaNames(app),
        eventKeys: await eventKeys(page),
        content: content ? await databaseFingerprint(page) : null,
        connection: await connectionState(page),
    };
}

// waitUntilIdle: the page takes a Run again. (A Run is refused while an import or an export runs,
// and a cancelled one runs until it has ended, so this is when it has.)
async function waitUntilIdle(app) {
    await expect(async () => {
        await app.run("SELECT 1 AS idle");
        await expect(app.pane).toHaveAttribute("data-state", "result", { timeout: 1000 });
    }).toPass({ timeout: 20_000 });
}

// everything a cancelled job must leave as it was: the same database, name, tables, address and
// title, no TEMP table, no event kept, and no report on screen; the same state of the connection (no
// statement left open, no transaction or savepoint opened or closed, no database attached or detached, the same foreign_keys,
// recursive_triggers, full_column_names and short_column_names); and, when the snapshot took it, the
// same content (the bytes of the database and its user_version)
async function expectNothingLeft(page, app, before, { logKeys = [] } = {}) {
    await waitUntilIdle(app);
    expect(await isOpenDatabase(page, before.handle)).toBe(true);
    expect(await page.evaluate(() => window.app.database.name)).toBe(before.name);
    expect(await schemaNames(app)).toEqual(before.tables);
    if (before.content) {
        expect(await databaseFingerprint(page)).toEqual(before.content);
    }
    expect(await app.rows("SELECT name FROM sqlite_temp_schema")).toEqual([]);
    expect(await connectionState(page)).toEqual(before.connection);
    expect(await page.evaluate(() => location.href)).toBe(before.href);
    expect(await page.title()).toBe(before.title);
    await expect(app.databaseLabel).toHaveText(before.label);
    const { found, stored } = await eventsOf(page, logKeys);
    expect(stored).toEqual(before.eventKeys);
    for (const key of logKeys) {
        expect(found[key]).toEqual([]);
    }
    await expect(app.pane).not.toHaveAttribute("data-state", "report");
}

// ---- what the export's page specs share -------------------------------------------------------------

// the address that opens the page with the export flag on
const EXPORT_URL = "./?preview=export";
// the owner's edge-case database, as a path under tests/fixtures/
const EDGE_DATABASE = "export/export_edge_cases.db";

// opens the owner's edge-case database as a file, with the export flag on (or the address given);
// the toast that says it was opened is waited for, so that no later wait for a toast reads it
async function openEdgeCases(app, address = EXPORT_URL) {
    await app.open(address);
    await app.upload(fixturePath(EDGE_DATABASE));
    await expect(app.toast).toContainText("export_edge_cases.db");
}

// recordDownloads(page) -> names: the names of the files the page saves from now on, in order (the
// array grows as the page saves)
function recordDownloads(page) {
    const names = [];
    page.on("download", (download) => names.push(download.suggestedFilename()));
    return names;
}

// the events of the open database's log, whether it is a course database or a file
async function eventsOfOpen(page) {
    const key = await openLogKey(page);
    return (await eventsOf(page, [key])).found[key];
}

// the bytes of one of the owner's expected CSV files (tests/fixtures/export/expected_csv/<file>)
const expectedBytes = (file) => fs.readFileSync(fixturePath(`export/expected_csv/${file}`));

// the file name of the library the page makes a zip with (vendor/<name>): held with holdVendor, or
// looked for in the requests a page made
const ZIP_TOOL = "fflate.min.js";

// the statements the engine has open on the page's connection: 0 for none (a job that stopped
// part-way must have finalized the one it was reading with)
const openStatements = (page) =>
    page.evaluate(() => {
        const { database } = window.app;
        return database.capi.sqlite3_next_stmt(database.db.pointer, 0);
    });

// 1 when no transaction is open on the connection, 0 when one is (sqlite3_get_autocommit)
const autocommit = (page) => page.evaluate(() => window.app.database.capi.sqlite3_get_autocommit(window.app.database.db.pointer));

// ---- a key that is held down when a dialog closes (js/lab/held-enter.js) ----------------------------

// repeatTaken(page): whether the page is taking repeats of Enter away at this moment. A repeat of
// Enter is handed to the window itself (no element gets it, so nothing is pressed), and the page
// either takes it away (true) or leaves it alone (false).
const repeatTaken = (page) => page.evaluate(() => !window.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", repeat: true, cancelable: true })));

// watchClosing(page, selector, { freshPress }) hands a key to the page in the moment between a
// dialog going and the browser's "close" event for it, which comes a little later (1 to 15 ms). A
// MutationObserver on the dialog's "open" attribute runs in that moment, when the dialog has just
// closed. With freshPress it hands a press of Enter that is not a repeat to the window (a press
// like that ends the page's listening for a held key); without, a repeat of Enter to the element
// that has the focus. Call it while the dialog is open; closingSeen(page) then says what was found:
//   closeSeen    the "close" event has come by now
//   at           the observer ran
//   beforeClose  it ran before the "close" event (a test of that moment checks this: when it is
//                false the test shows nothing)
//   focus        the id of the element that had the focus in that moment, or of the nearest
//                element round it that has one ("" for none)
//   taken        without freshPress: the repeat was cancelled, by the page or by what had the focus
async function watchClosing(page, selector, { freshPress = false } = {}) {
    await page.evaluate(
        ([dialogSelector, fresh]) => {
            const dialog = document.querySelector(dialogSelector);
            const seen = (window.__closing = { closeSeen: false, at: false, beforeClose: null, focus: null, taken: null });
            dialog.addEventListener("close", () => {
                seen.closeSeen = true;
            });
            new MutationObserver(() => {
                if (dialog.open || seen.at) {
                    return;
                }
                seen.at = true;
                seen.beforeClose = !seen.closeSeen;
                const target = document.activeElement ?? document.body;
                seen.focus = target.closest("[id]")?.id ?? "";
                if (fresh) {
                    window.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", cancelable: true }));
                    return;
                }
                seen.taken = !target.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", repeat: true, cancelable: true, bubbles: true }));
            }).observe(dialog, { attributes: true, attributeFilter: ["open"] });
        },
        [selector, freshPress]
    );
}
const closingSeen = (page) => page.evaluate(() => window.__closing);

// the key a set's progress is kept under in storage
const progressKey = (set) => `sqllab.progress.${set.id}`;

// storedEventLines(page, storageKey) -> for each event kept under that storage key (the log's key
// with the events prefix of config-workflow.js in front), its lines; null when nothing is kept
const storedEventLines = (page, storageKey) =>
    page.evaluate((key) => {
        const text = localStorage.getItem(key);
        return text === null ? null : JSON.parse(text).events.map((event) => event.lines);
    }, storageKey);

// skipUnlessFirst: a beforeEach hook for a spec that checks files, not the page, so that running it
// on every browser project would only repeat it: it skips the test on all but the first project
const skipUnlessFirst = ({}, testInfo) => {
    base.test.skip(testInfo.project.name !== "chromium-root", "checks files, not the page: once is enough");
};

// seeded(seed) -> a function that gives the same numbers in [0, 1) every run (mulberry32): the texts
// that a property test generates are never different from one run to the next
function seeded(seed) {
    let state = seed >>> 0;
    return () => {
        state = (state + 0x6d2b79f5) >>> 0;
        let t = state;
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

// ---- a zip, read without the library that wrote it ------------------------------------------------

const CRC_TABLE = Uint32Array.from({ length: 256 }, (unused, n) => {
    let c = n;
    for (let k = 0; k < 8; k++) {
        c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    return c >>> 0;
});

function crc32(bytes) {
    let crc = 0xffffffff;
    for (let i = 0; i < bytes.length; i++) {
        crc = CRC_TABLE[(crc ^ bytes[i]) & 0xff] ^ (crc >>> 8);
    }
    return (crc ^ 0xffffffff) >>> 0;
}

// readZip(bytes) -> [{name, bytes, method, flags, versionNeeded, mtime}], the entries of a zip in
// the order of its central directory: method is the compression method (0 stored, 8 deflated),
// flags the general purpose bits, versionNeeded the version needed to extract (20 is 2.0), and mtime
// a Date made from the entry's DOS date and time, read as local time, which is how a zip keeps it
// (to the two seconds that a DOS time can say; null for a zip that kept no date).
// Written by hand from the format (PKWARE's APPNOTE, 4.3.12 and 4.3.16), and never with fflate,
// which is what the page writes the zip with: the end record is found from the end, the central
// directory is read for each entry's name, method, CRC-32 and SIZES (an entry written in pieces,
// as a stream, has zeros in its local header and its sizes after its data, in a data descriptor),
// the entry's data is taken from where its local header says it starts, stored or inflated with
// node:zlib, and its length and CRC-32 are checked against the directory's. It throws, saying what
// is wrong, on anything it does not read exactly:
//   - the format: no Zip64, no encryption, no other method than stored or deflated, a zip in several
//     parts, a disk number other than 0 in a directory entry, an entry that needs a version above
//     2.0 (what the page's library writes; unzip and Python refuse a higher one they do not know),
//     a date and time that do not exist;
//   - the end record and the directory: a count or a directory that the two give differently;
//   - a local header that differs from the directory's entry in its flags, method, name, date and
//     time (unzip and Python read the method from the local header), and, when bit 3 of the flags is
//     NOT set, in its CRC-32 and its two sizes (with bit 3 set, the page's zips have zeros there, and
//     the data descriptor after the data says them; a local header with the real values is read too);
//   - the names: one that comes twice, an empty one, one that starts with "/", one with a backslash,
//     one with a ".." part, and one that ends with "/" (a directory) but holds data. (Which names the
//     page may make is the page's rule, and is held by the tests that compare the names.)
//   - the layout: bytes that belong to nothing, in front of the first entry, between two entries (an
//     entry is its local header, its data, and its data descriptor when bit 3 is set) or between the
//     last entry and the central directory, and entries that overlap.
const ZIP_VERSION_MAX = 20;

// a DOS date and time (the zip format's) as a Date in local time: years from 1980, seconds in twos.
// A date and a time that are both 0 say that the writer kept no date (a zip written by hand): null.
// Anything else that is not a date (month 0, day 31 of no month, hour 25) is refused.
function dosDateTime(date, time, name) {
    if (date === 0 && time === 0) {
        return null;
    }
    const [year, month, day] = [1980 + (date >> 9), (date >> 5) & 15, date & 31];
    const [hours, minutes, seconds] = [time >> 11, (time >> 5) & 63, (time & 31) * 2];
    if (month < 1 || month > 12 || day < 1 || day > 31 || hours > 23 || minutes > 59 || seconds > 58) {
        throw new Error(`readZip: ${name}: a date and time that do not exist (date ${date}, time ${time})`);
    }
    return new Date(year, month - 1, day, hours, minutes, seconds);
}

function readZip(bytes) {
    const zip = Buffer.isBuffer(bytes) ? bytes : Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    const fail = (why) => {
        throw new Error(`readZip: ${why}`);
    };
    // the end record: 22 bytes and a comment of up to 65,535, the last thing in the file
    let end = -1;
    for (let at = zip.length - 22; at >= Math.max(0, zip.length - 22 - 0xffff); at--) {
        if (zip.readUInt32LE(at) === 0x06054b50 && at + 22 + zip.readUInt16LE(at + 20) === zip.length) {
            end = at;
            break;
        }
    }
    if (end < 0) {
        fail("no end of central directory record");
    }
    const [disk, directoryDisk, onDisk, total] = [zip.readUInt16LE(end + 4), zip.readUInt16LE(end + 6), zip.readUInt16LE(end + 8), zip.readUInt16LE(end + 10)];
    const directorySize = zip.readUInt32LE(end + 12);
    const directoryAt = zip.readUInt32LE(end + 16);
    if (disk !== 0 || directoryDisk !== 0 || onDisk !== total) {
        fail("a zip in several parts");
    }
    if (total === 0xffff || directorySize === 0xffffffff || directoryAt === 0xffffffff) {
        fail("a Zip64 marker (the zip is too large for this reader)");
    }
    if (directoryAt + directorySize !== end) {
        fail(`the central directory (${directoryAt} + ${directorySize}) does not end where the end record starts (${end})`);
    }
    const entries = [];
    const names = new Set();
    // where each entry lies in the file: [from, to), to tile the file in front of the directory
    const extents = [];
    let at = directoryAt;
    for (let n = 0; n < total; n++) {
        if (at + 46 > end || zip.readUInt32LE(at) !== 0x02014b50) {
            fail(`entry ${n + 1}: no central directory header at ${at}`);
        }
        const versionNeeded = zip.readUInt16LE(at + 6);
        const flags = zip.readUInt16LE(at + 8);
        const method = zip.readUInt16LE(at + 10);
        const [dosTime, dosDate] = [zip.readUInt16LE(at + 12), zip.readUInt16LE(at + 14)];
        const crc = zip.readUInt32LE(at + 16);
        const compressed = zip.readUInt32LE(at + 20);
        const size = zip.readUInt32LE(at + 24);
        const [nameLength, extraLength, commentLength] = [zip.readUInt16LE(at + 28), zip.readUInt16LE(at + 30), zip.readUInt16LE(at + 32)];
        const diskStart = zip.readUInt16LE(at + 34);
        const localAt = zip.readUInt32LE(at + 42);
        const nameBytes = zip.subarray(at + 46, at + 46 + nameLength);
        // (bit 11 says UTF-8; without it a name is CP437, and a name that is not ASCII is refused)
        if (!(flags & 0x800) && nameBytes.some((b) => b > 0x7f)) {
            fail(`entry ${n + 1}: a name that is not ASCII, without the UTF-8 flag`);
        }
        const name = nameBytes.toString(flags & 0x800 ? "utf8" : "latin1");
        at += 46 + nameLength + extraLength + commentLength;
        const shown = JSON.stringify(name);
        if (names.has(name)) {
            fail(`${shown}: the name comes twice`);
        }
        names.add(name);
        if (name === "") {
            fail(`entry ${n + 1}: an empty name`);
        }
        if (name.startsWith("/")) {
            fail(`${shown}: a name that starts with "/" (an extracting tool would write outside its folder)`);
        }
        if (name.includes("\\")) {
            fail(`${shown}: a name with a backslash`);
        }
        if (name.split("/").includes("..")) {
            fail(`${shown}: a name with a ".." part (an extracting tool would write outside its folder)`);
        }
        if (name.endsWith("/") && (size !== 0 || compressed !== 0)) {
            fail(`${shown}: a directory (the name ends with "/") that holds data`);
        }
        if (diskStart !== 0) {
            fail(`${shown}: the directory says the entry starts on disk ${diskStart}, not 0`);
        }
        if (flags & 1) {
            fail(`${name}: encrypted`);
        }
        if (method !== 0 && method !== 8) {
            fail(`${name}: compression method ${method} is neither stored nor deflated`);
        }
        if (versionNeeded > ZIP_VERSION_MAX) {
            fail(`${name}: it needs version ${versionNeeded / 10} to extract (the directory says ${versionNeeded}), above 2.0`);
        }
        if (localAt + 30 > directoryAt || zip.readUInt32LE(localAt) !== 0x04034b50) {
            fail(`${name}: no local header at ${localAt}`);
        }
        const localVersion = zip.readUInt16LE(localAt + 4);
        if (localVersion > ZIP_VERSION_MAX) {
            fail(`${name}: its local header needs version ${localVersion / 10} to extract (${localVersion}), above 2.0`);
        }
        if (zip.readUInt16LE(localAt + 6) !== flags) {
            fail(`${name}: the local header has flags ${zip.readUInt16LE(localAt + 6)}, the directory says ${flags}`);
        }
        if (zip.readUInt16LE(localAt + 8) !== method) {
            fail(`${name}: the local header has compression method ${zip.readUInt16LE(localAt + 8)}, the directory says ${method}`);
        }
        if (zip.readUInt16LE(localAt + 10) !== dosTime || zip.readUInt16LE(localAt + 12) !== dosDate) {
            fail(`${name}: the local header has another date and time than the directory`);
        }
        const localNameLength = zip.readUInt16LE(localAt + 26);
        const localName = zip.subarray(localAt + 30, localAt + 30 + localNameLength);
        if (!localName.equals(nameBytes)) {
            fail(`${name}: the local header has another name`);
        }
        const dataAt = localAt + 30 + localNameLength + zip.readUInt16LE(localAt + 28);
        if (dataAt + compressed > directoryAt) {
            fail(`${name}: its data (${compressed} bytes at ${dataAt}) runs into the central directory`);
        }
        let entryEnd = dataAt + compressed;
        if (flags & 8) {
            // the data descriptor after the data: an optional signature, then CRC-32 and the two sizes
            const at8 = dataAt + compressed;
            const from = zip.readUInt32LE(at8) === 0x08074b50 ? at8 + 4 : at8;
            // (a descriptor that is not there at all is refused here too: `from` is at8 or after it)
            if (from + 12 > directoryAt) {
                fail(`${name}: its data descriptor runs into the central directory`);
            }
            if (zip.readUInt32LE(from) !== crc || zip.readUInt32LE(from + 4) !== compressed || zip.readUInt32LE(from + 8) !== size) {
                fail(`${name}: the data descriptor and the central directory disagree`);
            }
            entryEnd = from + 12;
            // (the local header of such an entry has zeros, or the real values)
            const local = [zip.readUInt32LE(localAt + 14), zip.readUInt32LE(localAt + 18), zip.readUInt32LE(localAt + 22)];
            const zeros = local.every((value) => value === 0);
            if (!zeros && (local[0] !== crc || local[1] !== compressed || local[2] !== size)) {
                fail(`${name}: the local header says CRC-32 ${local[0].toString(16)}, ${local[1]} bytes packed, ${local[2]} bytes; it should say zeros or what the directory says`);
            }
        }
        extents.push({ name, from: localAt, to: entryEnd });
        const stored = zip.subarray(dataAt, dataAt + compressed);
        let data;
        try {
            data = method === 0 ? Buffer.from(stored) : zlib.inflateRawSync(stored);
        } catch (error) {
            fail(`${name}: its data cannot be inflated (${error.message})`);
        }
        if (data.length !== size) {
            fail(`${name}: ${data.length} bytes, the directory says ${size}`);
        }
        if (crc32(data) !== crc) {
            fail(`${name}: CRC-32 ${crc32(data).toString(16)}, the directory says ${crc.toString(16)}`);
        }
        // (after the data was checked against the directory, so that a directory that is wrong about
        // the data is told as that; here the local header is held to the directory)
        if (!(flags & 8)) {
            const local = [zip.readUInt32LE(localAt + 14), zip.readUInt32LE(localAt + 18), zip.readUInt32LE(localAt + 22)];
            if (local[0] !== crc || local[1] !== compressed || local[2] !== size) {
                fail(`${name}: the local header says CRC-32 ${local[0].toString(16)}, ${local[1]} bytes packed, ${local[2]} bytes; the directory says ${crc.toString(16)}, ${compressed}, ${size}`);
            }
        }
        entries.push({ name, bytes: data, method, flags, versionNeeded, mtime: dosDateTime(dosDate, dosTime, name) });
    }
    if (at !== end) {
        fail(`the ${total} entries of the directory end at ${at}, the end record is at ${end}`);
    }
    // the entries, one after the other, fill the file up to the directory: nothing between them
    let covered = 0;
    for (const extent of extents.sort((a, b) => a.from - b.from)) {
        if (extent.from < covered) {
            fail(`${extent.name}: it starts at ${extent.from}, inside the entry before it (which ends at ${covered})`);
        }
        if (extent.from > covered) {
            fail(`${extent.from - covered} bytes that belong to no entry, at ${covered}, in front of ${extent.name}`);
        }
        covered = extent.to;
    }
    if (covered !== directoryAt) {
        fail(`${directoryAt - covered} bytes that belong to no entry, at ${covered}, in front of the central directory`);
    }
    return entries;
}

// readTable(app, name) -> what the open database holds under that name, for compareTable:
//   {name, existsExact, kinds, columns: [{name, declared}], rows, storage}
// kinds: the types of everything called that (in any letter case); declared: the column's type as
// CREATE TABLE gave it; rows: every row in rowid order, as the engine returns values; storage: for
// each column, how many of its values are stored as integer, real, text and null.
async function readTable(app, name) {
    const literal = `'${name.replaceAll("'", "''")}'`;
    const ident = quoteIdent(name);
    const kinds = (await app.rows(`SELECT type FROM sqlite_schema WHERE name = ${literal} COLLATE NOCASE`)).map((row) => row[0]);
    const exact = await app.rows(`SELECT name FROM sqlite_schema WHERE type = 'table' AND name = ${literal}`);
    const info = await app.rows(`PRAGMA table_info(${ident})`);
    const columns = info.map((row) => ({ name: row[1], declared: String(row[2]).toUpperCase() }));
    const table = { name, existsExact: exact.length === 1, kinds, columns, rows: null, storage: [] };
    if (!columns.length) {
        return table;
    }
    table.rows = await app.rows(`SELECT * FROM ${ident} ORDER BY _rowid_`);
    for (const column of columns) {
        table.storage.push(Object.fromEntries(await app.rows(`SELECT typeof(${quoteIdent(column.name)}), count(*) FROM ${ident} GROUP BY 1`)));
    }
    return table;
}

// compareTable(actual, expected) -> the differences, as text; none when the table is what the
// expected result says (one entry of an expected file's "tables"): its name in that letter case
// and nothing else of that name, its columns in order with their names and declared types, the
// NULLs of each column and how its other values are stored (a REAL column holds real values, a
// whole one included), the number of rows, and every cell (for a table of more than 200 rows: its
// first and last rows and the checksum of all of them).
function compareTable(actual, expected) {
    const found = [];
    const say = (text) => found.length < 40 && found.push(text);
    if (!actual.existsExact) {
        return [`no table called ${expected.name} (in that letter case)`];
    }
    if (actual.kinds.length !== 1) {
        say(`${actual.kinds.length} things are called ${expected.name}`);
    }
    if (actual.columns.length !== expected.columns.length) {
        return [...found, `${actual.columns.length} columns, expected ${expected.columns.length}`];
    }
    const stored = { INTEGER: "integer", REAL: "real", TEXT: "text" };
    expected.columns.forEach((want, i) => {
        const column = actual.columns[i];
        if (column.name !== want.name) {
            say(`column ${i + 1} is called ${JSON.stringify(column.name)}, expected ${JSON.stringify(want.name)}`);
        }
        if (column.declared !== want.type) {
            say(`column ${want.name} is declared ${column.declared}, expected ${want.type}`);
        }
        const storage = actual.storage[i];
        if ((storage.null ?? 0) !== want.nulls) {
            say(`column ${want.name} has ${storage.null ?? 0} NULLs, expected ${want.nulls}`);
        }
        const others = Object.keys(storage).filter((kind) => kind !== "null" && kind !== stored[want.type]);
        if (others.length) {
            say(`column ${want.name} holds ${others.join(" and ")} values, expected ${stored[want.type]} only`);
        }
    });
    if (actual.rows.length !== expected.rows) {
        say(`${actual.rows.length} rows, expected ${expected.rows}`);
    }
    const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
    if (expected.data) {
        expected.data.forEach((row, r) =>
            row.forEach((value, c) => {
                const got = (actual.rows[r] ?? [])[c];
                if (got !== value) {
                    say(`row ${r + 1}, column ${expected.columns[c].name}: ${JSON.stringify(got)}, expected ${JSON.stringify(value)}`);
                }
            })
        );
    } else {
        if (!same(actual.rows.slice(0, expected.data_first_rows.length), expected.data_first_rows)) {
            say("the first rows differ");
        }
        if (!same(actual.rows.slice(-expected.data_last_rows.length), expected.data_last_rows)) {
            say("the last rows differ");
        }
        if (sha256(JSON.stringify(actual.rows)) !== expected.data_sha256) {
            say("the checksum of the rows differs");
        }
    }
    return found;
}

// tabTo presses Tab (or Shift+Tab with back) until the focused element matches the selector, at most
// max times; keys only. Returns whether it got there.
async function tabTo(page, selector, { back = false, max = 80 } = {}) {
    for (let i = 0; i < max; i++) {
        if (await page.evaluate((s) => document.activeElement?.matches(s) ?? false, selector)) {
            return true;
        }
        await page.keyboard.press(back ? "Shift+Tab" : "Tab");
    }
    return page.evaluate((s) => document.activeElement?.matches(s) ?? false, selector);
}

// expectSchemaIconsOnly: nothing in the Schema tab was made from a name. The tab draws its own icon
// svgs (js/lab/icons.js: class "icon", plus "hidden" on the arrow that is not shown, and
// aria-hidden="true", or for the key marks role="img" with the label "Primary key" or "Foreign key
// to <table>", set as an attribute), each a single <use> whose href starts with "#icon-"; any other
// svg, and any element outside the few tags the panel is built from, is a failure.
async function expectSchemaIconsOnly(page) {
    await expect(page.locator("#schema img, #schema script, #schema foreignObject, #schema [onerror]")).toHaveCount(0);
    const stray = await page.locator("#schema").evaluate((root) => {
        const TAGS = new Set(["div", "p", "button", "input", "section", "h2", "ul", "li", "span", "svg", "use"]);
        const bad = [...root.querySelectorAll("*")].filter((el) => !TAGS.has(el.localName)).map((el) => el.outerHTML);
        for (const svg of root.querySelectorAll("svg")) {
            const use = svg.children[0];
            const named = svg.getAttribute("role") === "img";
            const label = svg.getAttribute("aria-label") ?? "";
            const fine =
                /^icon( icon--filled)?( hidden)?$/.test(svg.getAttribute("class") ?? "") &&
                svg.children.length === 1 &&
                use.localName === "use" &&
                use.attributes.length === 1 &&
                use.getAttribute("href")?.startsWith("#icon-") &&
                (named ? label === "Primary key" || label.startsWith("Foreign key to ") : svg.getAttribute("aria-hidden") === "true") &&
                [...svg.attributes].every((a) => ["class", "aria-hidden", "focusable", "role", "aria-label"].includes(a.name));
            if (!fine) {
                bad.push(svg.outerHTML);
            }
        }
        return bad;
    });
    expect(stray, "elements in the Schema tab that are not the panel's own").toEqual([]);
}

const test = base.test.extend({
    // A file chooser reaches a test only once the browser has been told to hold it back, which
    // Playwright does when the first listener for one is added. A test that began to listen just
    // before the key or the click that opens the chooser lost it now and then on a busy machine (14
    // times in 300 with ten workers, the page having pressed its file input every time; never with
    // a listener from the start). So every page listens from the start.
    page: async ({ page }, use) => {
        page.on("filechooser", () => {});
        await use(page);
    },
    net: async ({ context, baseURL }, use) => {
        await use(new NetworkLog(context, baseURL));
    },
    app: async ({ page }, use) => {
        await use(new App(page));
    },
    // pageErrors collects uncaught exceptions and unhandled rejections of the page.
    pageErrors: async ({ page }, use) => {
        const errors = [];
        page.on("pageerror", (err) => errors.push(String(err)));
        await use(errors);
    },
});

// ---- storage that fails
//
// failStorage(target, {methods, prefix, minLength, on}) makes Storage methods throw while the page's
// window.__storageFails is true (`on` is its first value; setStorageFailing(page, bool) changes
// it later). `target` is a page, or a context to cover every page it opens. Only keys that start
// with `prefix` fail; with minLength, only a setItem whose value is longer than that (a quota).
// Methods are "setItem" and "getItem" (the others are left alone).
async function failStorage(target, { methods = ["setItem"], prefix = "", minLength = 0, on = true } = {}) {
    await target.addInitScript(
        ([methods, prefix, minLength, on]) => {
            window.__storageFails = on;
            for (const method of methods) {
                const original = Storage.prototype[method];
                Storage.prototype[method] = function (key, value) {
                    const long = method !== "setItem" || String(value).length > minLength;
                    if (window.__storageFails && String(key).startsWith(prefix) && long) {
                        throw new DOMException("storage fails", method === "setItem" ? "QuotaExceededError" : "SecurityError");
                    }
                    return original.apply(this, arguments);
                };
            }
        },
        [methods, prefix, minLength, on]
    );
}

function setStorageFailing(page, on) {
    return page.evaluate((value) => (window.__storageFails = value), on);
}

// serveRepoAt(target, origin) answers every request to `origin` (a made-up one, nothing real is
// contacted) with the file of the repo that the path names after its leading slashes are cut:
// "//", "///" and "//index.html" all give index.html. That is how a root-hosted site behaves
// when its server maps a doubled slash to the same file; the test server answers those with 404.
// Returns the list of requested paths.
function serveRepoAt(target, origin) {
    const types = {
        ".html": "text/html",
        ".js": "text/javascript",
        ".css": "text/css",
        ".json": "application/json",
        ".wasm": "application/wasm",
        ".svg": "image/svg+xml",
        ".db": "application/octet-stream",
    };
    const root = path.join(__dirname, "..");
    const requested = [];
    target.route(new RegExp(`^${origin.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}/`), async (route) => {
        const { pathname } = new URL(route.request().url());
        requested.push(pathname);
        const relative = pathname.replace(/^\/+/, "") || "index.html";
        const file = path.resolve(root, relative);
        if (!file.startsWith(root + path.sep) || !fs.existsSync(file) || !fs.statSync(file).isFile()) {
            return route.fulfill({ status: 404, body: "not found" });
        }
        return route.fulfill({ status: 200, contentType: types[path.extname(file)] || "text/plain", body: fs.readFileSync(file) });
    });
    return requested;
}

// fakeStorage is a localStorage for the modules that run in Node. Set `full` or `unreadable` to
// make setItem or getItem throw, and `limit` to refuse values longer than that.
function fakeStorage() {
    const data = new Map();
    const store = {
        data,
        full: false,
        unreadable: false,
        limit: Infinity,
        getItem(key) {
            if (store.unreadable) {
                throw new Error("unreadable");
            }
            return data.has(key) ? data.get(key) : null;
        },
        setItem(key, value) {
            if (store.full || String(value).length > store.limit) {
                throw new Error("full");
            }
            data.set(key, String(value));
        },
        removeItem(key) {
            data.delete(key);
        },
    };
    return store;
}

// inNode(storage, fn) runs fn with `storage` as the global localStorage and a `document` that
// collects the page's lab:storage-state events. Both are removed afterwards. fn gets (events,
// tab): tab() returns a private copy of js/lab/ with its own module state (the run log's memory,
// the progress in memory), which is what one more browser tab is; tab().load("run-log.js")
// imports a module of that copy. The copies are deleted afterwards. (A query string on the URL
// would not do: the test runner's loader drops it, and every import would be the same module.)
async function inNode(storage, fn) {
    const events = [];
    const dirs = [];
    const tab = () => {
        const dir = fs.mkdtempSync(path.join(os.tmpdir(), "lab-tab-"));
        dirs.push(dir);
        const from = path.join(__dirname, "..", "js", "lab");
        for (const name of fs.readdirSync(from).filter((n) => n.endsWith(".js"))) {
            fs.copyFileSync(path.join(from, name), path.join(dir, name));
        }
        return { load: (file) => import(pathToFileURL(path.join(dir, file)).href) };
    };
    const target = new EventTarget();
    target.addEventListener("lab:storage-state", (event) => events.push(event.detail));
    Object.defineProperty(globalThis, "localStorage", { value: storage, configurable: true, writable: true });
    Object.defineProperty(globalThis, "document", { value: target, configurable: true, writable: true });
    try {
        return await fn(events, tab);
    } finally {
        delete globalThis.localStorage;
        delete globalThis.document;
        for (const dir of dirs) {
            fs.rmSync(dir, { recursive: true, force: true });
        }
    }
}

// ---- what the specs of the import of Excel workbooks share (tests/aw5-excel-*.spec.js) ----------------------------

// an owner's file by the last part of its name, with no folder
const BASENAME = (name) => path.basename(name);

// an owner's file as a file chosen (a path cannot be mixed with buffers in setInputFiles, so a fixture chosen
// beside a file made in the test is handed over as its bytes)
const owned = (name) => ({ name: path.basename(name), mimeType: "application/octet-stream", buffer: fs.readFileSync(fixturePath(name)) });

// a text as a pattern that matches that text and nothing else
const escaped = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

// the line beside Import that says why it is held up
const holdLine = (app) => app.importDialog.locator("#import-hold");

const MB = 1024 * 1024;

// the first bytes of an old binary workbook (an .xls)
const OLE2_START = [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1];

// the size of an owner's file, in bytes
const BYTES = (name) => fs.statSync(fixturePath(name)).size;

// the tables a workbook's expected file holds, one for each sheet that can be ticked, in the sheets' order
const tablesOf = (expected) => expected.sheets.filter((sheet) => sheet.importable).map((sheet) => sheet.table);

// waits until the dialog has looked at every file it was given, and read every workbook
async function dialogReady(app) {
    await expect(app.importDialog).toBeVisible();
    await expect(app.importDialog.locator(".import-reading")).toHaveCount(0);
}

// the engine's tables, and every one of the expected file against what the page made
async function expectTables(app, expectedTables) {
    for (const table of expectedTables) {
        expect(compareTable(await readTable(app, table.name), table), `table ${table.name}`).toEqual([]);
    }
    const made = (await app.rows("SELECT name FROM sqlite_schema WHERE type = 'table' ORDER BY name")).flat();
    expect(made).toEqual(expectedTables.map((table) => table.name).sort());
}

// the lines of one event of a workbook: its file, then a line for each table ending with its sheet
const eventLines = (file, bytes, tables) => [`file: ${file}, ${bytes} bytes`, ...tables.map((table) => `table: ${table.name}, ${table.rows} rows, ${table.columns.length} columns, ${table.source}`)];

// a workbook of sheets [{name, rows}] as the file a student would choose (the library writes it, in Node)
// (a sheet with hidden: 1 is hidden in the workbook)
function workbookFile(name, sheets, bookType = "xlsx") {
    const book = XLSX.utils.book_new();
    for (const sheet of sheets) {
        XLSX.utils.book_append_sheet(book, XLSX.utils.aoa_to_sheet(sheet.rows), sheet.name);
    }
    if (sheets.some((sheet) => sheet.hidden)) {
        book.Workbook = { Sheets: sheets.map((sheet) => ({ Hidden: sheet.hidden ?? 0 })) };
    }
    return { name, mimeType: "application/octet-stream", buffer: Buffer.from(XLSX.write(book, { bookType, type: "buffer" })) };
}

module.exports = {
    test,
    expect,
    READY_PANE,
    NetworkLog,
    App,
    openFresh,
    PAYLOAD,
    ATTR_PAYLOAD,
    quoteIdent,
    fixturePath,
    expectedFor,
    fixtureIndex,
    largeCsv,
    readTable,
    compareTable,
    sha256,
    crc32,
    readZip,
    csvFile,
    wideLastRowCsv,
    holdVendor,
    holdImport,
    finishHeld,
    holdDataset,
    slowDown,
    gateTurns,
    databaseHandle,
    isOpenDatabase,
    schemaNames,
    eventKeys,
    eventsOf,
    EXPORT_URL,
    EDGE_DATABASE,
    openEdgeCases,
    recordDownloads,
    eventsOfOpen,
    expectedBytes,
    ZIP_TOOL,
    openStatements,
    autocommit,
    repeatTaken,
    watchClosing,
    closingSeen,
    progressKey,
    storedEventLines,
    skipUnlessFirst,
    seeded,
    logKey,
    openLogKey,
    databaseFingerprint,
    snapshot,
    waitUntilIdle,
    expectNothingLeft,
    tabTo,
    expectSchemaIconsOnly,
    SAMPLE_FILE,
    SAMPLE_ENTRY,
    DEFAULT_DATASET,
    NORTHLIGHT_URL,
    realManifest,
    routeManifest,
    routeSampleDataset,
    withSampleDataset,
    realSet,
    shippedSets,
    openableSets,
    modelQuery,
    routeSet,
    routeListing,
    listingHtml,
    evidenceFile,
    failStorage,
    setStorageFailing,
    fakeStorage,
    serveRepoAt,
    inNode,
    EDITOR_INPUT,
    editorValue,
    editorSelect,
    expectEditorTextOnly,
    BASENAME,
    BYTES,
    tablesOf,
    dialogReady,
    expectTables,
    eventLines,
    workbookFile,
    owned,
    escaped,
    holdLine,
    MB,
    OLE2_START,
};
