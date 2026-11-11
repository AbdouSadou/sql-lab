const fs = require("node:fs");
const path = require("node:path");
const { test, expect } = require("./helpers");

const ROOT = path.resolve(__dirname, "..");
const read = (p) => fs.readFileSync(path.join(ROOT, p), "utf8");

// AC7 is "the Pages workflow deploys green; .nojekyll is present; the site works at
// the project subpath". A green deploy can only be seen on GitHub; the rest is local.

test("AC7 .nojekyll exists at the repo root", () => {
    expect(fs.existsSync(path.join(ROOT, ".nojekyll"))).toBe(true);
    expect(fs.statSync(path.join(ROOT, ".nojekyll")).isFile()).toBe(true);
});

test("AC7 pages.yml deploys with the three official Pages actions on push to main", () => {
    const yml = read(".github/workflows/pages.yml");
    expect(yml).toMatch(/uses:\s*actions\/configure-pages@v6\b/);
    expect(yml).toMatch(/uses:\s*actions\/upload-pages-artifact@v5\b/);
    expect(yml).toMatch(/uses:\s*actions\/deploy-pages@v5\b/);
    expect(yml).toMatch(/push:\s*\n\s*branches:\s*\[main\]/);
    expect(yml).toMatch(/workflow_dispatch:/);
    expect(yml).toMatch(/pages:\s*write/);
    expect(yml).toMatch(/id-token:\s*write/);
    // No build step, and the dev-only directories are kept out of the artifact.
    expect(yml).not.toMatch(/\bmake\b|npm (ci|install|run)/);
    for (const dir of ["/tests", "/node_modules", "/.git"]) {
        expect(yml).toContain(`--exclude='${dir}'`);
    }
    // upload-pages-artifact drops dotfiles unless told otherwise; .nojekyll must survive.
    expect(yml).toMatch(/include-hidden-files:\s*true/);
});

test("AC7 the test server hides exactly what pages.yml leaves out of the artifact", async () => {
    const { HIDDEN } = await import("./static-server.mjs");
    const yml = read(".github/workflows/pages.yml");
    const excluded = [...yml.matchAll(/--exclude='\/([^']+)'/g)].map((m) => m[1]);
    expect([...HIDDEN].sort()).toEqual(excluded.sort());
});

test("AC7 the old build-and-deploy flow is gone", () => {
    expect(fs.existsSync(path.join(ROOT, "CNAME"))).toBe(false);
    expect(fs.existsSync(path.join(ROOT, ".github/workflows/deploy.yml"))).toBe(false);
    expect(read("Makefile")).not.toMatch(/CNAME|^build:|\bmake build\b/m);
    expect(read(".gitignore")).not.toMatch(/sqlite3/);
});

test("AC7 the engine is vendored in vendor/ as plain files", () => {
    for (const file of ["vendor/sqlite3.js", "vendor/sqlite3.wasm"]) {
        expect(fs.statSync(path.join(ROOT, file)).size, file).toBeGreaterThan(100_000);
    }
    expect(fs.readFileSync(path.join(ROOT, "vendor/sqlite3.wasm")).subarray(0, 4)).toEqual(
        Buffer.from([0x00, 0x61, 0x73, 0x6d])
    );
});

test("AC7 shipped files contain no root-absolute URLs", () => {
    const shipped = [];
    const walk = (dir) => {
        for (const entry of fs.readdirSync(path.join(ROOT, dir), { withFileTypes: true })) {
            const rel = path.posix.join(dir, entry.name);
            if (entry.isDirectory()) walk(rel);
            else if (/\.(html|css|js)$/.test(entry.name) && !rel.startsWith("vendor/")) shipped.push(rel);
        }
    };
    walk("js");
    walk("css");
    walk("img");
    for (const f of fs.readdirSync(ROOT).filter((f) => f.endsWith(".html"))) shipped.push(f);

    const offenders = [];
    const patterns = [
        /\b(?:href|src|action|poster|data-src)\s*=\s*["']\/(?!\/)/, // HTML attributes
        /url\(\s*["']?\/(?!\/)/, // CSS url(/...)
        /@import\s+["']\/(?!\/)/, // CSS @import "/..."
        /\bfetch\(\s*["'`]\//, // fetch("/...")
        /\bimport\(\s*["'`]\//, // import("/...")
        /\bfrom\s+["']\//, // import ... from "/..."
        /location\.origin|location\.host(?:name)?\b|document\.baseURI/, // builds paths from the origin
        /location\.(?:assign|replace)\(\s*["'`]\//, // navigation to "/..."
    ];
    for (const file of shipped) {
        read(file).split("\n").forEach((line, i) => {
            if (patterns.some((re) => re.test(line))) offenders.push(`${file}:${i + 1}: ${line.trim()}`);
        });
    }
    expect(offenders).toEqual([]);
});

test("AC7 the site loads and runs a query at the project subpath", async ({ page, app, net, baseURL }) => {
    await app.open();
    // Whatever mount this project serves, the page must have stayed inside it.
    expect(new URL(page.url()).pathname).toBe(new URL(baseURL).pathname);
    expect(await app.query("SELECT 2 + 2 AS four;")).toEqual({ columns: ["four"], rows: [["4"]] });
    // The brand link in the top bar is relative to the mount and its mark (an inline svg) is drawn.
    await expect(page.locator("#reset")).toBeVisible();
    expect(new URL(await page.locator("#reset").evaluate((a) => a.href)).pathname).toBe(new URL(baseURL).pathname);
    expect((await page.locator("#reset .brand-mark").boundingBox()).width).toBeGreaterThan(0);
    // The icons the page names (favicon, touch icon) resolve at the mount too.
    const icons = await page.locator("link[rel~=icon], link[rel=apple-touch-icon]").evaluateAll((links) => links.map((l) => l.href));
    expect(icons.length).toBeGreaterThan(0);
    for (const href of icons) {
        expect(new URL(href).pathname.startsWith(new URL(baseURL).pathname), href).toBe(true);
        expect((await page.request.get(href)).status(), href).toBe(200);
    }
    net.expectNoSameOriginFailures();
    // Every request stayed under the mount: a root-absolute URL would have 404ed.
    for (const e of net.network) {
        expect(new URL(e.url).pathname.startsWith(new URL(baseURL).pathname), e.url).toBe(true);
    }
});

test("AC7 about page links and images resolve at the mount", async ({ page, net }) => {
    await page.goto("about.html");
    await expect(page.locator("h1")).toHaveText("About");
    await expect(page.locator("header img")).toHaveJSProperty("complete", true);
    expect(await page.locator("header img").evaluate((img) => img.naturalWidth)).toBeGreaterThan(0);
    // The inline link back to the app is relative to the mount, not to the origin root.
    const href = await page.locator('main a[href="./"]').first().evaluate((a) => a.href);
    expect(new URL(href).pathname).toBe(new URL(page.url()).pathname.replace(/about\.html$/, ""));
    net.expectNoSameOriginFailures();
});
