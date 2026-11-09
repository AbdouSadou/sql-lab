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
const path = require("node:path");
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
};
