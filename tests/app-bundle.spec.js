// The app's page loads its own scripts and stylesheets as one file each, bundle/app.js and
// bundle/app.css, which tools/build-app.mjs builds from js/ and css/ (npm run build:app) and which
// are committed, like vendor/editor.js. A whole class opening the site at once from one school
// network is one burst of requests from one address, and GitHub Pages answered a large burst with
// "429 Rate limit exceeded" for minutes during the first check of the live site: a first visit
// asked for 85 files then (87 in Firefox), and asks for 16 now (18). js/ and css/ stay the source
// (About and the evidence check page load their few files from them directly, and the app's page
// its three classic scripts).

const fs = require("node:fs");
const path = require("node:path");
const { execFileSync } = require("node:child_process");
const { test, expect } = require("./helpers");

const ROOT = path.resolve(__dirname, "..");

// the classic scripts index.html keeps: the theme, before the first paint; the two guards, before
// the engine; the engine and lz-string, which the modules use
const CLASSIC = ["js/lab/theme-boot.js", "js/lab/storage-guard.js", "js/lab/engine-guard.js", "vendor/sqlite3.js", "vendor/lz-string.min.js"];

test("the committed bundles are what js/ and css/ build (npm run build:app)", () => {
    execFileSync(process.execPath, [path.join(ROOT, "tools/build-app.mjs"), "--check"], { cwd: ROOT, stdio: "pipe" });
});

test("index.html links bundle/app.css and runs bundle/app.js: no stylesheet of css/, no module of js/", () => {
    const html = fs.readFileSync(path.join(ROOT, "index.html"), "utf8");
    const all = (pattern) => [...html.matchAll(pattern)].map((match) => match[1]);
    expect(all(/<link rel="stylesheet" href="([^"]+)">/g)).toEqual(["bundle/app.css"]);
    expect(all(/<script type="module" src="([^"]+)">/g)).toEqual(["bundle/app.js"]);
    expect(all(/<link rel="modulepreload" href="([^"]+)">/g)).toEqual(["vendor/editor.js"]);
    expect(all(/<script src="([^"]+)">/g)).toEqual(CLASSIC);
    // nothing else of css/ or js/, whatever the tag or the order of its attributes
    expect(html.match(/\b(?:href|src)="(?:css|js)\/[^"]*"/g)).toEqual(CLASSIC.filter((file) => file.startsWith("js/")).map((file) => `src="${file}"`));
});

test("a test that imports bundle/app.js reaches the modules the page runs, with their state", async ({ page, app }) => {
    await app.open();
    const seen = await page.evaluate(async () => {
        const bundle = await import("./bundle/app.js");
        // the open dataset's pristine bytes are kept by the page's own datasets module
        return { names: Object.keys(bundle).sort(), pristine: bundle.datasets.getPristineId() };
    });
    expect(seen.pristine).toBe("northlight");
    expect(seen.names).toEqual(["checker", "datasets", "dbPath", "exercises", "manager", "progress", "results", "router", "runLog", "runner", "share", "storage"]);
});

test("no test imports a module of js/ into the app's page: that would be a second, separate copy", () => {
    // Every file of tests/, read whole: an import() whose argument holds a string that names js/
    // (bare, ./ or ../, alone or joined to something, the call on one line or several), and a
    // static import of js/, with or without "from", inside a string given to the page
    // (addScriptTag). Node's own imports of js/ (m5-evidence-format, inNode in helpers.js) join
    // the path segment by segment ("js", "lab", file), so they do not match. Not seen: a path held
    // in a variable, or built by a call before the string (the search stops at the first ")"); a
    // test that reads the page's state through such a copy fails anyway (getPristineId() is null
    // there).
    const PATTERNS = [/\bimport\s*\([^)]*?["'`][^"'`)\n]*?(?<![\w.-])js\//g, /\b(?:from|import)\s*\\?["'`](?:\.{0,2}\/)*js\//g];
    const files = (dir) =>
        fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
            const file = path.join(dir, entry.name);
            if (entry.isDirectory()) return entry.name.endsWith("-snapshots") ? [] : files(file);
            return /\.[cm]?js$/.test(entry.name) ? [file] : [];
        });
    const offenders = [];
    for (const file of files(__dirname)) {
        const text = fs.readFileSync(file, "utf8");
        for (const pattern of PATTERNS) {
            for (const match of text.matchAll(pattern)) {
                const line = text.slice(0, match.index).split("\n").length;
                offenders.push(`${path.relative(ROOT, file)}:${line}: ${text.split("\n")[line - 1].trim()}`);
            }
        }
    }
    expect(offenders, "in the page, import bundle/app.js and take the module by its name (EXPOSE in tools/build-app.mjs); in Node, join a path into js/ segment by segment").toEqual([]);
});

// The order index.html linked its stylesheets in: the cascade's. Two of them style the same
// selectors (.results-summary in css/shell.css and css/result.css), so another order draws another
// page, and only the screenshots, taken in one browser, would show it. Change this list and STYLES
// in tools/build-app.mjs together, on purpose.
const CASCADE = [
    "css/tokens.css",
    "css/fonts.css",
    "css/core.css",
    "css/buttons.css",
    "css/shell.css",
    "css/menu.css",
    "css/share.css",
    "css/schema.css",
    "css/exercises.css",
    "css/run-log.css",
    "css/editor.css",
    "css/result.css",
    "css/evidence.css",
    "css/toast.css",
];

test("bundle/app.css joins index.html's stylesheets in the cascade's order", () => {
    const css = fs.readFileSync(path.join(ROOT, "bundle/app.css"), "utf8");
    expect([...css.matchAll(/^\/\* ---- (\S+) ---- \*\/\r?$/gm)].map((match) => match[1])).toEqual(CASCADE);
});

test("a first visit asks for at most 20 files, each once: no stylesheet of css/, no module of js/", async ({ page, app, net }) => {
    await app.open();
    await page.waitForLoadState("networkidle");
    const paths = net.paths;
    // the page, the theme's script, the two bundles, CodeMirror, the guards, the engine and its
    // .wasm, lz-string, the typefaces in use, the datasets' manifest and the database, the exercise
    // listing and its set, and (in some browsers) icons: 16 in Chromium, 18 in Firefox
    expect(paths.length, paths.join("\n")).toBeLessThanOrEqual(20);
    expect(new Set(paths).size, "each file once").toBe(paths.length);
    expect(paths.filter((file) => file.startsWith("css/"))).toEqual([]);
    expect(paths.filter((file) => file.startsWith("js/")).sort()).toEqual(CLASSIC.filter((file) => file.startsWith("js/")).sort());
    expect(paths).toEqual(expect.arrayContaining(["bundle/app.css", "bundle/app.js", "vendor/editor.js", "vendor/sqlite3.wasm"]));
    net.expectNoSameOriginFailures();
});
