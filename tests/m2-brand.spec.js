const fs = require("node:fs");
const path = require("node:path");
const { test, expect } = require("./helpers");

const ROOT = path.resolve(__dirname, "..");
const CREDIT = "Based on SQLime by Anton Zhiyanov";
const SAMPLE = path.join(__dirname, "fixtures", "sample.db");

// shipped lists the HTML, CSS and JS the site serves (not the vendored engine, not dev files).
function shipped() {
    const files = [];
    const walk = (dir) => {
        for (const entry of fs.readdirSync(path.join(ROOT, dir), { withFileTypes: true })) {
            const rel = path.posix.join(dir, entry.name);
            if (entry.isDirectory()) walk(rel);
            else if (/\.(html|css|js|svg)$/.test(entry.name)) files.push(rel);
        }
    };
    walk("js");
    walk("css");
    walk("img");
    for (const f of fs.readdirSync(ROOT).filter((f) => f.endsWith(".html"))) files.push(f);
    return files;
}

// Reads the real js/lab/config.js and serves a copy that names the app differently.
async function renameApp(page, newName) {
    await page.route("**/js/lab/config.js", async (route) => {
        const response = await route.fetch();
        const body = (await response.text()).replace(/APP_NAME = "[^"]*"/, `APP_NAME = "${newName}"`);
        await route.fulfill({ response, body });
    });
}

test("brand: the app name is written in js/lab/config.js and nowhere else", () => {
    const hits = [];
    for (const file of shipped()) {
        fs.readFileSync(path.join(ROOT, file), "utf8")
            .split("\n")
            .forEach((line, i) => {
                if (/sql[ _\- ]*lab/i.test(line)) hits.push(`${file}:${i + 1}: ${line.trim()}`);
            });
    }
    // The one other hit is the localStorage key namespace of the exercise progress. It is a
    // storage key, not branding, and must NOT follow a rename: changing it would orphan every
    // student's saved progress.
    expect(hits.map((h) => h.replace(/:\d+:/, ":"))).toEqual([
        'js/lab/config.js: export const APP_NAME = "SQL Lab";',
        'js/lab/config.js: export const PROGRESS_PREFIX = "sqllab.progress.";',
    ]);
});

test("brand: the default name shows in the title, header and footer of index and About", async ({ page, app }) => {
    await app.open();
    await expect(page).toHaveTitle("northlight_retail.db - SQL Lab");
    await expect(page.locator("header h1")).toContainText("SQL Lab");
    await expect(page.locator("footer")).toContainText("SQL Lab");

    await page.goto("about.html");
    await expect(page).toHaveTitle("About - SQL Lab");
    await expect(page.locator("body > header")).toContainText("SQL Lab");
    await expect(page.locator("body > footer")).toContainText("SQL Lab");
});

test("brand: renaming through a copy of js/lab/config.js changes title, header and footer on index and About", async ({
    page,
    app,
}) => {
    await renameApp(page, "Renamed Workbench");

    await app.open();
    await expect(page).toHaveTitle("northlight_retail.db - Renamed Workbench");
    await expect(page.locator("header h1")).toContainText("Renamed Workbench");
    await expect(page.locator("footer")).toContainText("Renamed Workbench");

    // The title that combines a database name with the app name is built from the constant too.
    await app.upload(SAMPLE);
    await expect(page).toHaveTitle("sample.db - Renamed Workbench");
    await app.query("SELECT 1 AS one;");
    await expect(page).toHaveTitle("sample.db - Renamed Workbench");

    await page.goto("about.html");
    await expect(page).toHaveTitle("About - Renamed Workbench");
    await expect(page.locator("body > header")).toContainText("Renamed Workbench");
    await expect(page.locator("main")).toContainText("Renamed Workbench");
    await expect(page.locator("body > footer")).toContainText("Renamed Workbench");

    for (const url of ["./", "about.html"]) {
        await page.goto(url);
        await expect(page.locator("body")).not.toContainText("SQL Lab");
        expect(await page.title()).not.toContain("SQL Lab");
    }
});

test("brand: renaming a database keeps the app name in the title", async ({ page, app }) => {
    await app.open();
    const name = page.locator("#db-name");
    await name.click();
    await page.keyboard.press("Control+A");
    await page.keyboard.type("lesson1.db");
    await page.keyboard.press("Enter");
    await expect(page).toHaveTitle("lesson1.db - SQL Lab");
});

test("brand: the credit is on index and About", async ({ page, app }) => {
    await app.open();
    await expect(page.locator("footer")).toContainText(CREDIT);
    await page.goto("about.html");
    await expect(page.locator("body > footer")).toContainText(CREDIT);
    await expect(page.locator("main")).toContainText(CREDIT);
});

test("brand: 'sqlime' appears in visible text only inside the credit", async ({ page, app }) => {
    const visible = async () => (await page.locator("body").innerText()).split(CREDIT).join("");

    await app.open(); // welcome message state
    expect(await visible()).not.toMatch(/sqlime/i);
    await app.upload(SAMPLE);
    expect(await visible()).not.toMatch(/sqlime/i);
    expect(await page.title()).not.toMatch(/sqlime/i);
    await page.locator("#show-tables").click();
    expect(await visible()).not.toMatch(/sqlime/i);

    await page.goto("about.html");
    expect(await visible()).not.toMatch(/sqlime/i);
    expect(await page.title()).not.toMatch(/sqlime/i);
});

test("brand: About describes this app and has no gist, token or third-party content", async ({ page, net }) => {
    await page.goto("about.html");
    const text = (await page.locator("main").innerText()).toLowerCase();
    expect(text).toContain("in your browser");
    expect(text).toMatch(/never sent anywhere/);
    for (const word of ["gist", "token", "github", "demo", "sqlime.org"]) {
        expect(text, word).not.toContain(word);
    }
    // no links that leave the site, and nothing requested from elsewhere
    const hrefs = await page.locator("a[href]").evaluateAll((as) => as.map((a) => a.getAttribute("href")));
    expect(hrefs.filter((h) => /^(https?:)?\/\//.test(h))).toEqual([]);
    net.expectNoExternalRequests();
});

test("brand: the page metadata is neutral and names no third party", () => {
    for (const file of ["index.html", "about.html"]) {
        const html = fs.readFileSync(path.join(ROOT, file), "utf8");
        for (const tag of ["og:url", "og:image", "og:title", "og:site_name", "og:description"]) {
            expect(html, `${file} ${tag}`).not.toContain(tag);
        }
        const description = html.match(/<meta name="description" content="([^"]*)"/)[1];
        expect(description.length).toBeGreaterThan(20);
        expect(description).not.toMatch(/sql\s*lab|sqlime/i);
    }
    expect(fs.existsSync(path.join(ROOT, "img/cover.png"))).toBe(false);
});

test("brand: the favicon files exist, are an original mark and load", async ({ page, net }) => {
    for (const file of ["favicon.svg", "favicon.ico", "favicon-64x64.png", "apple-touch-icon.png"]) {
        expect(fs.statSync(path.join(ROOT, "img", file)).size, file).toBeGreaterThan(100);
    }
    const svg = fs.readFileSync(path.join(ROOT, "img/favicon.svg"), "utf8");
    expect(svg).not.toMatch(/<text|font|<image|href=/i);
    expect(fs.readFileSync(path.join(ROOT, "img/favicon-64x64.png")).readUInt32BE(16)).toBe(64);
    expect(fs.readFileSync(path.join(ROOT, "img/apple-touch-icon.png")).readUInt32BE(16)).toBe(180);
    const ico = fs.readFileSync(path.join(ROOT, "img/favicon.ico"));
    expect([ico.readUInt16LE(0), ico.readUInt16LE(2)]).toEqual([0, 1]);

    await page.goto("./");
    for (const href of await page.locator("head link[rel*=icon]").evaluateAll((l) => l.map((x) => x.href))) {
        const res = await page.request.get(href);
        expect(res.status(), href).toBe(200);
    }
    net.expectNoExternalRequests();
});

test("brand: the footer is visible, inside the screen, and links to About at phone width", async ({ page, app }) => {
    await page.setViewportSize({ width: 360, height: 640 });
    await app.open();
    const footer = page.locator("footer");
    await expect(footer).toBeVisible();
    await expect(footer).toContainText(CREDIT);
    await footer.scrollIntoViewIfNeeded();
    await expect(footer).toBeInViewport();
    const box = await footer.boundingBox();
    expect(box.x).toBeGreaterThanOrEqual(0);
    expect(box.x + box.width).toBeLessThanOrEqual(360);
    // no sideways scrolling, and the footer sits below the editor and the results
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    const status = await page.locator("#status").boundingBox();
    expect(box.y).toBeGreaterThanOrEqual(status.y);

    await footer.locator('a[href="about.html"]').click();
    await expect(page).toHaveURL(/about\.html$/);
});

test("brand: the footer fits the desktop grid", async ({ page, app }) => {
    await page.setViewportSize({ width: 1200, height: 800 });
    await app.open();
    const footer = await page.locator("footer").boundingBox();
    const grid = await page.locator(".grid").boundingBox();
    expect(footer.x).toBeGreaterThanOrEqual(grid.x);
    expect(footer.x + footer.width).toBeLessThanOrEqual(grid.x + grid.width + 1);
    expect(footer.y).toBeGreaterThan((await page.locator("#editor").boundingBox()).y);
});

test("brand: the static <title> of every page is neutral, so only config.js names the app", () => {
    // Without JavaScript (a crawler, a link preview) this text is all there is. It must
    // not be a second app name that APP_NAME does not control: it is the page part
    // (data-page-title) or the neutral word "Loading".
    for (const file of fs.readdirSync(ROOT).filter((f) => f.endsWith(".html"))) {
        const html = fs.readFileSync(path.join(ROOT, file), "utf8");
        const match = html.match(/<title([^>]*)>([^<]*)<\/title>/);
        expect(match, `${file} has a title`).not.toBeNull();
        const part = (match[1].match(/data-page-title="([^"]*)"/) || [])[1];
        expect(part, `${file} title has data-page-title`).toBeDefined();
        expect([part, "Loading"], `${file} static title`).toContain(match[2].trim());
    }
});
