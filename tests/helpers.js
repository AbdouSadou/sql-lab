// Shared test fixtures. Later milestones extend this file, so keep the pieces small:
//
//   net  records every request a test makes and answers questions about them
//        (left the origin? same-origin failures? bytes transferred?).
//   app  drives the playground page: open, run SQL, read the result table,
//        upload and export databases.
//
// Import `test` and `expect` from here, not from @playwright/test:
//
//   const { test, expect } = require("./helpers");
//   test("AC1 ...", async ({ page, net, app }) => { ... });

const base = require("@playwright/test");
const { expect } = base;

// Request schemes that never touch the network.
const LOCAL_SCHEMES = new Set(["data:", "blob:", "about:"]);

const READY_STATUS = /Run SQL query to see the results|\d+ rows?, took \d+ ms/;

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

// Test-only hook: records every oo1.DB the app creates, so a test can serialize
// the current database with the engine's own export. (Unmodified SQLime has no
// export action; once the UI gets one, switch app.exportDatabase() to it.)
function captureEngineInit() {
    const wrap = (init) => {
        const wrapped = function (...args) {
            return init.apply(this, args).then((api) => {
                // The module may be called through an inner init that resolves to
                // something other than the finished API; only patch the real one.
                if (api && api.oo1 && !api.__captured) {
                    api.__captured = true;
                    const DB = api.oo1.DB;
                    window.__testApi = api;
                    window.__testDbs = [];
                    api.oo1.DB = new Proxy(DB, {
                        construct(target, args, newTarget) {
                            const db = Reflect.construct(target, args, newTarget);
                            window.__testDbs.push(db);
                            return db;
                        },
                    });
                }
                return api;
            });
        };
        return Object.assign(wrapped, init);
    };
    let current;
    Object.defineProperty(window, "sqlite3InitModule", {
        configurable: true,
        get: () => current,
        set: (init) => {
            current = wrap(init);
        },
    });
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

    // upload feeds a file (path or {name, mimeType, buffer}) to the "open file" input.
    async upload(file) {
        await this.page.locator("#toolbar input[type=file]").setInputFiles(file);
        await this.waitReady();
    }

    // exportDatabase returns the current database as a Buffer. Needs the page
    // to have been opened through a context from the `engine` hook (see below).
    async exportDatabase() {
        const bytes = await this.page.evaluate(() => {
            const db = window.__testDbs.at(-1);
            return Array.from(window.__testApi.capi.sqlite3_js_db_export(db.pointer));
        });
        return Buffer.from(bytes);
    }
}

const test = base.test.extend({
    net: async ({ context, baseURL }, use) => {
        await use(new NetworkLog(context, baseURL));
    },
    app: async ({ page }, use) => {
        await use(new App(page));
    },
    // engine installs the export hook for every page of the test's context.
    engine: async ({ context }, use) => {
        await context.addInitScript(captureEngineInit);
        await use(true);
    },
});

module.exports = { test, expect, NetworkLog, App };
