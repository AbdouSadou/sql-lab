// Builds bundle/app.js and bundle/app.css: the scripts and the stylesheets of the app's page,
// index.html, each in one file. A whole class opening the site at once from one school network is
// one burst of requests from one address, and GitHub Pages answers a large burst with "429 Rate
// limit exceeded" for minutes; a first visit asked for 85 files (87 in Firefox), and asks for 16
// (18) with the bundles. Like vendor/editor.js, the output is committed, so the site itself still needs no
// build. Dev tooling, not deployed; run it after changing anything in js/ or css/:
//
//   npm ci && npm run build:app
//
// node tools/build-app.mjs --check builds in memory and only compares: it fails if the committed
// files differ from a fresh build (tests/app-bundle.spec.js runs it, so a change to js/ or css/
// without a rebuild fails the tests).
//
// js/ and css/ stay the source, and stay published: about.html and verify.html load their few
// files from them directly. On the app's page a test reaches a module through bundle/app.js,
// which exports the ones the tests use (EXPOSE, below).
//
// bundle/app.js holds the four module scripts index.html ran, in its order, and every module they
// import, as esbuild bundles them (ESM, not minified: the names stay readable, and GitHub Pages
// compresses it on the way). The one import left out is vendor/editor.js, CodeMirror: it stays a
// file of its own, which the editor loads when it upgrades, so the plain editor still takes over
// when it cannot load. bundle/app.css is the page's stylesheets joined as they are, each under a
// comment with its name, in the order index.html linked them (the cascade's order). bundle/ sits
// beside css/ and js/, so the stylesheets' relative URLs (the typefaces in vendor/fonts/) and the
// path to vendor/ resolve as before; the files the app fetches (datasets/, exercises/) are
// relative to the page, not to a script.

import { build } from "esbuild";
import { mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const OUT_DIR = "bundle";
const JS_FILE = `${OUT_DIR}/app.js`;
const CSS_FILE = `${OUT_DIR}/app.css`;

// --check is the one option; anything else (a typo of it, say) stops before a build is written
const unknown = process.argv.slice(2).filter((arg) => arg !== "--check");
if (unknown.length) {
    console.error(`Unknown argument: ${unknown.join(" ")} (the one option is --check)`);
    process.exit(2);
}
const check = process.argv.includes("--check");

// index.html's module scripts, in the order it ran them
const SCRIPTS = ["js/lab/brand.js", "js/components/sqlime-editor.js", "js/components/sqlime-result.js", "js/index.js"];

// index.html's stylesheets, in the order it linked them: the page's own in <head>, then each
// region's, from the top of <body> down
const STYLES = [
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

// The modules the tests reach in the page, exported by name (js/lab/run-log.js as runLog): the
// page's one module is bundle/app.js, so import("./bundle/app.js") in a test gives the very
// instances the page runs, their state included (the open dataset's pristine bytes, the checker's
// cache), as importing js/lab/checker.js did before the bundle; that import would now load a
// second, separate copy, which tests/app-bundle.spec.js refuses. Each must be one the page's
// scripts import statically (the build checks), so the exports bring in no module and change no
// order (they add the namespace objects).
const EXPOSE = [
    "js/db-path.js",
    "js/lab/checker.js",
    "js/lab/datasets.js",
    "js/lab/exercises.js",
    "js/lab/progress.js",
    "js/lab/results.js",
    "js/lab/router.js",
    "js/lab/run-log.js",
    "js/lab/runner.js",
    "js/lab/share.js",
    "js/sqlite/manager.js",
    "js/storage.js",
];
const exposedName = (file) => path.posix.basename(file, ".js").replace(/-(\w)/g, (_, letter) => letter.toUpperCase());

// the one import that stays a file of its own
const APART = "vendor/editor.js";

const posix = (file) => file.split(path.sep).join("/");
// with the line breaks of the repository (\n), whatever a checkout made of them (Git on Windows
// writes \r\n), so that the joined stylesheets come out the same everywhere, as esbuild's output
// does on its own
const read = (file) => readFileSync(path.join(ROOT, file), "utf8").replace(/\r\n?/g, "\n");

// ---- bundle/app.js

// vendor/editor.js stays apart, imported from where bundle/app.js is; anything else from vendor/
// would be a mistake (the engine and lz-string are classic scripts of index.html)
const keepEditorApart = {
    name: "keep-editor-apart",
    setup(build) {
        build.onResolve({ filter: /(^|\/)vendor\// }, (args) => {
            const file = posix(path.relative(ROOT, path.resolve(args.resolveDir, args.path)));
            if (file !== APART) {
                return { errors: [{ text: `${args.importer} imports ${file}: only ${APART} may be imported from vendor/` }] };
            }
            return { path: path.posix.relative(OUT_DIR, file), external: true };
        });
    },
};

const result = await build({
    stdin: {
        contents: [...SCRIPTS.map((file) => `import "./${file}";`), ...EXPOSE.map((file) => `export * as ${exposedName(file)} from "./${file}";`)].join("\n"),
        resolveDir: ROOT,
        sourcefile: "index.html",
        loader: "js",
    },
    absWorkingDir: ROOT,
    outfile: path.join(ROOT, JS_FILE),
    write: false,
    bundle: true,
    format: "esm",
    minify: false,
    // the browsers README.md names, as vendor/editor.js is built for
    target: ["chrome114", "edge114", "firefox125", "safari17"],
    charset: "utf8",
    legalComments: "inline",
    metafile: true,
    plugins: [keepEditorApart],
    banner: {
        js: `/* index.html's scripts in one file: ${SCRIPTS.join(", ")} and the modules they import (a few exported by name, for the tests), built from js/ by tools/build-app.mjs. Do not edit: change js/, then run npm run build:app. */`,
    },
    logLevel: "warning",
});

// everything bundled comes from js/ (but the entry, which names index.html's scripts), and the one
// import left is the editor's
const inputs = Object.keys(result.metafile.inputs).filter((input) => input !== "index.html");
const strays = inputs.filter((input) => !input.startsWith("js/"));
if (strays.length) {
    throw new Error(`bundle/app.js would hold files from outside js/: ${strays.join(", ")}`);
}
const output = Object.values(result.metafile.outputs)[0];
const imports = output.imports.map((entry) => `${entry.kind} ${entry.path}`);
const expected = [`dynamic-import ${path.posix.relative(OUT_DIR, APART)}`];
if (JSON.stringify(imports) !== JSON.stringify(expected)) {
    throw new Error(`bundle/app.js imports ${imports.join(", ") || "nothing"}; expected exactly ${expected.join(", ")}`);
}

// every exposed module is one the page's scripts import statically anyway, so it runs at page
// load either way (an import() of one, js/lab/code-editor.js say, would otherwise move its start
// to page load), and the names do not clash
const reached = new Set();
const visit = (file) => {
    if (reached.has(file) || !result.metafile.inputs[file]) {
        return;
    }
    reached.add(file);
    result.metafile.inputs[file].imports.filter((entry) => !entry.external && entry.kind !== "dynamic-import").forEach((entry) => visit(entry.path));
};
SCRIPTS.forEach(visit);
const unreached = EXPOSE.filter((file) => !reached.has(file));
if (unreached.length) {
    throw new Error(`EXPOSE names modules the page's scripts do not import statically: ${unreached.join(", ")}`);
}
if (new Set(EXPOSE.map(exposedName)).size !== EXPOSE.length) {
    throw new Error("two modules in EXPOSE would have the same name");
}
const script = Buffer.from(result.outputFiles[0].contents);

// ---- bundle/app.css

// every stylesheet is the app's (in STYLES) or another page's (a root page other than index.html
// that links it, whatever the order of the tag's attributes: a <link> left in a comment is no
// use, data-href is not href, and rel is a list of words), so a new one is not forgotten
const attribute = (tag, name) => tag.match(new RegExp(`(?<![\\w-])${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s"'>]+))`, "i"))?.slice(1).find((value) => value !== undefined);
const linkedBy = (html) =>
    [...html.replace(/<!--[\s\S]*?-->/g, "").matchAll(/<link\b[^>]*>/gi)]
        .map(([tag]) => tag)
        .filter((tag) => /(^|\s)stylesheet(\s|$)/i.test(attribute(tag, "rel") ?? ""))
        .map((tag) => attribute(tag, "href")?.replace(/^\.\//, ""));
const otherPages = readdirSync(ROOT)
    .filter((name) => name.endsWith(".html") && name !== "index.html")
    .flatMap((page) => linkedBy(read(page)));
const unused = readdirSync(path.join(ROOT, "css"))
    .map((name) => `css/${name}`)
    .filter((file) => file.endsWith(".css") && !STYLES.includes(file) && !otherPages.includes(file));
if (unused.length) {
    throw new Error(`no page uses ${unused.join(", ")}: add it to STYLES (index.html) or link it from its page`);
}

const parts = [`/* index.html's stylesheets in one file, joined in the order the page linked them, built from css/ by tools/build-app.mjs. Do not edit: change css/, then run npm run build:app. */\n`];
for (const file of STYLES) {
    // a byte order mark is dropped: at the start of a file it is nothing, but joined into the
    // middle of one it would become part of the next selector
    const text = read(file).replace(/^\uFEFF/, "");
    // joined into one file, an @import or @charset would no longer be first, and a URL relative
    // to css/ but not starting with ../ would point into bundle/ (CSS reads these names in any
    // letter case; image-set() and src() take an address as a plain string, which is not looked
    // at here, so they are refused). Comments are left out of the search.
    const code = text.replace(/\/\*[\s\S]*?\*\//g, "");
    if (/@import|@charset/i.test(code)) {
        throw new Error(`${file} has an @import or @charset, which cannot be joined into one stylesheet`);
    }
    if (/image-set\(|\bsrc\(/i.test(code)) {
        throw new Error(`${file} has an image-set() or src(), whose addresses this build does not check: write a plain url() instead`);
    }
    for (const [, url] of code.matchAll(/url\(\s*["']?([^"')]+)/gi)) {
        if (!/^(\.\.\/|data:|#)/i.test(url)) {
            throw new Error(`${file}: url(${url}) is not let through: only an address that starts with ../ (the same from ${OUT_DIR}/ as from css/), data: or #`);
        }
    }
    parts.push(`\n/* ---- ${file} ---- */\n\n${text.endsWith("\n") ? text : `${text}\n`}`);
}
const styles = Buffer.from(parts.join(""));

// ---- write, or compare

const files = [
    [JS_FILE, script],
    [CSS_FILE, styles],
];
console.log(`${JS_FILE}: ${script.length} bytes from ${inputs.length} modules; ${CSS_FILE}: ${styles.length} bytes from ${STYLES.length} stylesheets`);

if (check) {
    // a committed file is compared with its line breaks as the repository holds them (\n), so a
    // checkout that wrote \r\n (Git on Windows) is not taken for a stale one
    const missing = [];
    const stale = [];
    for (const [file, fresh] of files) {
        let committed;
        try {
            committed = read(file);
        } catch {
            missing.push(file);
            continue;
        }
        if (committed !== fresh.toString("utf8")) {
            stale.push(file);
        }
    }
    if (missing.length || stale.length) {
        const said = [missing.length && `missing ${missing.join(", ")}`, stale.length && `out of date ${stale.join(", ")}`].filter(Boolean);
        console.error(`The committed bundles are not a fresh build (run npm run build:app): ${said.join("; ")}`);
        process.exit(1);
    }
    console.log("The committed bundles match a fresh build.");
} else {
    mkdirSync(path.join(ROOT, OUT_DIR), { recursive: true });
    for (const [file, contents] of files) {
        writeFileSync(path.join(ROOT, file), contents);
    }
}
