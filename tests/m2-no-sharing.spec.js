const fs = require("node:fs");
const path = require("node:path");
const { test, expect } = require("./helpers");

const ROOT = path.resolve(__dirname, "..");

function walkShipped() {
    const files = [];
    const walk = (dir) => {
        for (const entry of fs.readdirSync(path.join(ROOT, dir), { withFileTypes: true })) {
            const rel = path.posix.join(dir, entry.name);
            if (entry.isDirectory()) walk(rel);
            else if (/\.(html|css|js)$/.test(entry.name)) files.push(rel);
        }
    };
    walk("js");
    walk("css");
    walk("bundle");
    for (const f of fs.readdirSync(ROOT).filter((f) => f.endsWith(".html"))) files.push(f);
    return files;
}

test("no sharing: the gist and token code and pages are gone", async ({ page }) => {
    for (const gone of ["settings.html", "js/settings.js", "js/github.js", "js/sqlite/dumper.js", "test"]) {
        expect(fs.existsSync(path.join(ROOT, gone)), gone).toBe(false);
    }
    const offenders = [];
    for (const file of walkShipped()) {
        fs.readFileSync(path.join(ROOT, file), "utf8")
            .split("\n")
            .forEach((line, i) => {
                if (/gist|github\.(username|token)|api\.github|Authorization/i.test(line)) {
                    offenders.push(`${file}:${i + 1}: ${line.trim()}`);
                }
            });
    }
    expect(offenders).toEqual([]);

    const res = await page.goto("settings.html");
    expect(res.status()).toBe(404);
});

test("no sharing: the top bar, editor toolbar and status bar carry no settings, gist or token control", async ({
    page,
    app,
}) => {
    await page.setViewportSize({ width: 1200, height: 800 });
    await app.open();
    await expect(page.locator("#save")).toHaveCount(0);
    await expect(page.locator("a[href='settings.html']")).toHaveCount(0);
    // the top bar: the brand, the database switcher, Copy link, Export, Theme and Help; the editor
    // toolbar: Run; the status bar: no control but its credit link, which goes to About
    await expect(page.locator("#database-button, #copy-link, #export-button, #theme-button, #help-button")).toHaveText([
        /Northlight Retail/,
        /Copy link/,
        /Export/,
        /Theme/,
        /Help/,
    ]);
    // (and from Phase 6 the Sidebar button, shown under 1100 px, and More, under 700 px, where
    // Copy link, Export, Theme and Help fold into its menu: no setting, gist or token there either)
    await expect(page.locator("header.topbar button:not([role^=menuitem])")).toHaveCount(7);
    await expect(page.locator("#sidebar-button")).toHaveText(/Sidebar/);
    // (shown under 700 px only: at this width it is not rendered, so its label is read as written)
    await expect(page.locator("#more-button")).toHaveAttribute("aria-label", "More actions");
    await expect(page.locator("#more-menu [role^=menuitem]")).toHaveText([
        /Copy link/,
        /Database \(\.db\)/,
        /Results \(\.csv\)/,
        /Evidence \(\.txt\)/,
        /Light/,
        /Dark/,
        /Match device/,
        /Help/,
    ]);
    await expect(page.locator("#editor-toolbar button")).toHaveText([/Run/]);
    await expect(page.locator("footer.statusbar button")).toHaveCount(0);
    await expect(page.locator("footer.statusbar a")).toHaveAttribute("href", "about.html");
    // the page's whole text, less one phrase: Northlight's sample query "Revenue share by category"
    // (course content in "no result yet", the mockup's label) uses "share" as a business term, not
    // for a sharing feature; every other word of the page, the samples included, is read
    const text = (await page.locator("body").innerText()).toLowerCase().replaceAll("revenue share by category", "");
    for (const word of ["settings", "sharing", "share", "gist", "token"]) {
        expect(text, word).not.toContain(word);
    }
    const actions = await page.evaluate(() => Object.keys(window.app.actions));
    expect(actions).not.toContain("save");
    expect(await page.evaluate(() => "github" in window.app)).toBe(false);
});

test("no sharing: Ctrl+S does nothing harmful", async ({ page, app, net, pageErrors }) => {
    await app.open();
    await app.query("SELECT 9 AS nine;");
    const url = page.url();
    const requests = net.entries.length;

    await page.keyboard.press("Control+s");
    await app.editor.press("Control+s");
    await page.locator("body").press("Meta+s");

    expect(page.url()).toBe(url);
    expect(net.entries.length).toBe(requests); // no request, no navigation
    net.expectNoExternalRequests();
    expect(await page.evaluate(() => Object.keys(localStorage).filter((k) => k.startsWith("github")))).toEqual([]);
    // the page still works and shows no error
    await expect(page.locator("#result table")).toHaveCount(1);
    expect(await app.query("SELECT 10 AS ten;")).toEqual({ columns: ["ten"], rows: [["10"]] });
    expect(pageErrors).toEqual([]);
});

test("no sharing: the open-url dialog is empty, not a third-party example address", async ({ page, app, net }) => {
    await app.open();
    // Open from URL is a dialog now (it was window.prompt); a native prompt would show up here
    const prompts = [];
    page.on("dialog", async (dialog) => {
        prompts.push(dialog.type());
        await dialog.dismiss();
    });
    await page.keyboard.press("Control+u");
    const dialog = page.locator("#open-url-dialog");
    await expect(dialog).toBeVisible();
    const field = page.locator("#open-url-input");
    await expect(field).toHaveValue("");
    expect(await field.getAttribute("placeholder")).toBeFalsy();
    // no example address in the dialog's text (the hint names the scheme, "https://", but no host)
    const text = await dialog.innerText();
    expect(text).not.toMatch(/https?:\/\/[\w-]+\.[\w.-]+|path\/to|example\.(com|org)/i);
    await page.keyboard.press("Escape");
    await expect(dialog).toBeHidden();
    expect(prompts).toEqual([]);
    net.expectNoExternalRequests();
});

// Addresses that used to be read as "gist ids" (anything with a colon) plus other ways a
// fragment could point away from this site.
const UNSUPPORTED = [
    "gist:abc",
    "GIST:abc",
    "gist:e012594111ce51f91590c4737e41a046",
    "foo:bar",
    "//example.com/x.db",
    "\\\\example.com\\x.db",
    "data:text/plain,hello",
    "javascript:alert(1)",
    "file:///etc/passwd",
];

for (const fragment of UNSUPPORTED) {
    test(`no sharing: #${fragment} shows a failure, makes no external request and opens no empty database`, async ({
        page,
        app,
        net,
        pageErrors,
    }) => {
        await page.goto(`./#${fragment}`);
        // a problem with the load, in the error band (no query's heading): not a result
        await expect(app.errorBand).toContainText("Failed to load database from");
        await expect(app.errorBand).toContainText("unsupported address");
        await expect(app.errorBand).toHaveClass(/results-band--problem/);
        await expect(app.pane).toHaveAttribute("data-state", "error");

        // no database was opened: the switcher says so, nothing is rendered, Run is still
        // not offered (it was the disabled command bar)
        await expect(app.databaseLabel).toHaveText("No database open");
        expect(await page.evaluate(() => Boolean(window.app.database))).toBe(false);
        await expect(page.locator("#result table")).toHaveCount(0);
        await expect(page.locator("#execute")).toBeDisabled();

        // and running SQL does not quietly work against a blank database
        await app.editor.click();
        await app.run("SELECT 1 AS one;");
        await expect(app.errorBand).toContainText("No database is loaded");
        await expect(app.errorBand).toHaveClass(/results-band--problem/);
        await expect(page.locator("#result table")).toHaveCount(0);

        // nothing but this site's own files was requested, and not even a fetch for the address
        net.expectNoExternalRequests();
        expect(net.paths.filter((p) => /x\.db|abc|passwd|hello/.test(p))).toEqual([]);
        expect(pageErrors).toEqual([]);
    });
}

test("no sharing: a failed load does not leave a half-loaded database behind", async ({ page, app }) => {
    await app.open();
    await app.query("SELECT 1 AS one;");
    // moving to an unsupported address keeps the open (working) database
    await page.evaluate(() => (location.hash = "#gist:abc"));
    await expect(app.errorBand).toContainText("Failed to load database from");
    expect(await app.query("SELECT 2 AS two;")).toEqual({ columns: ["two"], rows: [["2"]] });
});

test("no sharing: same-site relative addresses still load, and other http(s) addresses are classified as URLs", async ({
    page,
}) => {
    await page.goto("./");
    const types = await page.evaluate(async () => {
        const { DatabasePath } = await import("./bundle/app.js").then((bundle) => bundle.dbPath);
        const out = {};
        for (const v of ["demo.db", "datasets/x.db", "../x.db", "a b.db", "folder/a:b", "https://example.com/x.db", "HTTP://example.com/x.db", "", "gist:abc"]) {
            out[v] = new DatabasePath(v).type;
        }
        return out;
    });
    expect(types).toEqual({
        "demo.db": "local",
        "datasets/x.db": "local",
        "../x.db": "local",
        "a b.db": "local",
        "folder/a:b": "local",
        "https://example.com/x.db": "remote",
        "HTTP://example.com/x.db": "remote",
        "": "empty",
        "gist:abc": "unsupported",
    });
});
