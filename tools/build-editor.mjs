// Builds vendor/editor.js, the CodeMirror 6 bundle the SQL editor loads, and
// vendor/codemirror.LICENSE.txt. It is one of the site's two build steps (the other is
// tools/build-app.mjs, the app page's js/ and css/ in bundle/); its output is committed, so the
// site itself still needs no build. Dev tooling, not deployed; run it after changing
// tools/editor-entry.js or a CodeMirror version in package.json:
//
//   npm ci && npm run build:editor
//
// node tools/build-editor.mjs --check builds in memory and only compares: it fails if the
// committed files differ from a fresh build (tests/ui3-editor.spec.js runs it).
//
// The versions are pinned exactly in package.json (and @lezer/common and @lezer/lr through
// "overrides"), so the same packages give the same bundle. The build fails if the bundle is over
// the plan's budget of 500 KB minified.

import { build } from "esbuild";
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const OUT_FILE = path.join(ROOT, "vendor", "editor.js");
const LICENSE_FILE = path.join(ROOT, "vendor", "codemirror.LICENSE.txt");
const BUDGET = 500 * 1000;
const check = process.argv.includes("--check");

// every package that ends up in the bundle (checked against esbuild's metafile below)
const PACKAGES = [
    "@codemirror/autocomplete",
    "@codemirror/commands",
    "@codemirror/lang-sql",
    "@codemirror/language",
    "@codemirror/state",
    "@codemirror/streamparser",
    "@codemirror/view",
    "@lezer/common",
    "@lezer/highlight",
    "@lezer/lr",
    "@marijn/find-cluster-break",
    "crelt",
    "style-mod",
    "w3c-keyname",
];

function packageDir(name) {
    return path.join(ROOT, "node_modules", ...name.split("/"));
}

function version(name) {
    return JSON.parse(readFileSync(path.join(packageDir(name), "package.json"), "utf8")).version;
}

const result = await build({
    entryPoints: [path.join(ROOT, "tools", "editor-entry.js")],
    outfile: OUT_FILE,
    write: false,
    bundle: true,
    format: "esm",
    minify: true,
    // the browsers README.md names (the popover attribute sets the floor)
    target: ["chrome114", "edge114", "firefox125", "safari17"],
    legalComments: "none",
    charset: "utf8",
    metafile: true,
    banner: {
        js: `/* CodeMirror 6 for SQL Lab, built by tools/build-editor.mjs from ${PACKAGES.map((p) => `${p}@${version(p)}`).join(", ")}. MIT licence: vendor/codemirror.LICENSE.txt */`,
    },
    logLevel: "warning",
});

// the bundle holds exactly the packages listed above
const bundled = new Set();
for (const input of Object.keys(result.metafile.inputs)) {
    const match = input.match(/node_modules\/((?:@[^/]+\/)?[^/]+)\//);
    if (match) {
        bundled.add(match[1]);
    }
}
const unlisted = [...bundled].filter((name) => !PACKAGES.includes(name));
const missing = PACKAGES.filter((name) => !bundled.has(name));
if (unlisted.length || missing.length) {
    throw new Error(`PACKAGES is out of date: not listed ${unlisted.join(", ") || "none"}; not bundled ${missing.join(", ") || "none"}`);
}

const bundle = Buffer.from(result.outputFiles[0].contents);
const licenses = PACKAGES.map((name) => {
    const text = readFileSync(path.join(packageDir(name), "LICENSE"), "utf8").trim();
    return `${name}@${version(name)}\n\n${text}\n`;
});
const licenseText = `vendor/editor.js bundles the following packages (all under the MIT licence).\n\n${licenses.join("\n" + "-".repeat(72) + "\n\n")}`;

console.log(`vendor/editor.js: ${bundle.length} bytes (budget ${BUDGET})`);
if (bundle.length > BUDGET) {
    throw new Error(`vendor/editor.js is ${bundle.length} bytes, over the budget of ${BUDGET}`);
}

if (check) {
    const stale = [
        [OUT_FILE, bundle],
        [LICENSE_FILE, Buffer.from(licenseText)],
    ].filter(([file, fresh]) => {
        try {
            return !readFileSync(file).equals(fresh);
        } catch {
            return true;
        }
    });
    if (stale.length) {
        console.error(`Out of date (run npm run build:editor): ${stale.map(([file]) => path.relative(ROOT, file)).join(", ")}`);
        process.exit(1);
    }
    console.log("The committed bundle and licence file match a fresh build.");
} else {
    writeFileSync(OUT_FILE, bundle);
    writeFileSync(LICENSE_FILE, licenseText);
}
