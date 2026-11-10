// Shared test fixtures. Later milestones extend this file, so keep the pieces small:
//
//   net  records every request a test makes and answers questions about them
//        (left the origin? same-origin failures? bytes transferred?).
//   app  drives the playground page: open, run SQL, read the result table,
//        upload databases, pick datasets and export through the toolbar button.
//
// The default dataset (Northlight) opens on every visit. A test that needs the old empty
// start uses app.openEmpty(); one that needs a second dataset uses withSampleDataset().
//
// Import `test` and `expect` from here, not from @playwright/test:
//
//   const { test, expect } = require("./helpers");
//   test("AC1 ...", async ({ page, net, app }) => { ... });

const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { pathToFileURL } = require("node:url");
const base = require("@playwright/test");
const { expect } = base;

// Request schemes that never touch the network.
const LOCAL_SCHEMES = new Set(["data:", "blob:", "about:"]);

// "Run SQL query ..." is the empty-database welcome, "Press Run ..." is shown when saved
// SQL was put back in the editor without being run.
const READY_STATUS = /Run SQL query to see the results|Press Run to execute it|\d+ rows?, took \d+ ms/;

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

// the set the site ships
const realSet = (id = "retail-basics") =>
    JSON.parse(fs.readFileSync(path.join(__dirname, "..", "exercises", `${id}.json`), "utf8"));

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

// the model query of an exercise of the shipped set (tests type it as the "right answer"; the
// app must never show it)
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
        this.editor = page.locator("#editor");
        this.status = page.locator("#status");
        this.result = page.locator("#result");
        this.table = page.locator("#result table");
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
        await expect(this.status).toContainText("could not be loaded");
    }

    async waitReady() {
        await expect(this.status).toContainText(READY_STATUS);
    }

    // run types SQL into the editor and runs it with Ctrl+Enter (or the Run button).
    async run(sql, { via = "keyboard" } = {}) {
        await this.editor.fill(sql);
        if (via === "button") {
            await this.page.locator("#execute").click();
        } else {
            await this.editor.press("Control+Enter");
        }
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
        await expect(this.status).toContainText(/\d+ rows?, took \d+ ms/);
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
        await this.page.locator("#toolbar input[type=file]").setInputFiles(file);
        if (ready) {
            await this.page.waitForFunction((old) => window.app.database !== old, before);
            await this.waitReady();
        }
    }

    // rename types a new database name in the header and presses Enter.
    async rename(name) {
        const field = this.page.locator("#db-name");
        await field.click();
        await this.page.keyboard.press("Control+A");
        await this.page.keyboard.type(name);
        await this.page.keyboard.press("Enter");
        await expect(this.page).toHaveTitle(new RegExp(`^${name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")} - `));
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

    // shareField is the read-only field that copy link fills in the status area.
    get shareField() {
        return this.status.locator("input.share-link-field");
    }

    // copyLink clicks the copy link button (or presses Enter on it with via "keyboard")
    // and returns the URL shown in the field.
    async copyLink({ via = "mouse" } = {}) {
        const button = this.page.locator("#copy-link");
        if (via === "keyboard") {
            await button.focus();
            await this.page.keyboard.press("Enter");
        } else {
            await button.click();
        }
        await expect(this.shareField).toHaveCount(1);
        return this.shareField.inputValue();
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
    get historyButton() {
        return this.page.locator("#run-history");
    }

    get historyList() {
        return this.page.locator("#run-history-list");
    }

    get historyEntries() {
        return this.page.locator("#run-history-list button");
    }

    get evidenceButton() {
        return this.page.locator("#export-evidence");
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
        await this.evidenceButton.click();
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

    get setPicker() {
        return this.page.locator("#exercise-set-picker");
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
        await expect(this.page.locator("#exercise-list button").first()).toBeVisible();
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
                    const { createChecker } = await import("./js/lab/checker.js");
                    window.__checker = createChecker();
                }
                if (!set) {
                    const { loadSet } = await import("./js/lab/exercises.js");
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
            const manager = (await import("./js/sqlite/manager.js")).default;
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

    get schemaToggle() {
        return this.page.locator("#schema .schema-toggle");
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

    // picker is the dataset select in the toolbar; exportButton the export button.
    get picker() {
        return this.page.locator("#dataset-picker");
    }

    get exportButton() {
        return this.page.locator("#export-db");
    }

    // pickedText is the text of the option the picker shows as selected.
    pickedText() {
        return this.picker.evaluate((select) => select.selectedOptions[0]?.textContent ?? null);
    }

    // exportFile clicks the export button and returns the downloaded file as
    // {name, buffer}. The button, the download event and the saved bytes are the real thing.
    async exportFile() {
        const [download] = await Promise.all([
            this.page.waitForEvent("download"),
            this.exportButton.click(),
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

const test = base.test.extend({
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

module.exports = {
    test,
    expect,
    NetworkLog,
    App,
    openFresh,
    PAYLOAD,
    ATTR_PAYLOAD,
    quoteIdent,
    SAMPLE_FILE,
    SAMPLE_ENTRY,
    realManifest,
    routeManifest,
    routeSampleDataset,
    withSampleDataset,
    realSet,
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
};
