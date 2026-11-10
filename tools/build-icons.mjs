// Writes the icon sprite into index.html, between <!-- icons:begin --> and <!-- icons:end -->. Dev
// tooling, not deployed; run it after using a new icon:
//
//   node tools/build-icons.mjs
//
// The sprite holds exactly the icons the site uses: every icon("name") call in js/ and every
// "#icon-name" reference in the HTML files. Each is a <symbol id="icon-name"> holding the shapes of
// node_modules/lucide-static/icons/name.svg (Lucide, ISC licence, copied to vendor/lucide.LICENSE.txt);
// stroke and size come from the .icon rules of css/core.css.

import { copyFileSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LUCIDE = path.join(ROOT, "node_modules", "lucide-static");
const PAGE = path.join(ROOT, "index.html");
const BEGIN = "<!-- icons:begin -->";
const END = "<!-- icons:end -->";

function files(dir, ext) {
    return readdirSync(dir).flatMap((name) => {
        const full = path.join(dir, name);
        return statSync(full).isDirectory() ? files(full, ext) : name.endsWith(ext) ? [full] : [];
    });
}

const used = new Set();
for (const file of files(path.join(ROOT, "js"), ".js")) {
    // code only: whole-line comments and block comments may mention icon names in examples
    const code = readFileSync(file, "utf8")
        .replace(/\/\*[\s\S]*?\*\//g, "")
        .replace(/^\s*\/\/.*$/gm, "");
    for (const match of code.matchAll(/\bicon\(\s*["']([a-z0-9-]+)["']/g)) {
        used.add(match[1]);
    }
}
for (const file of readdirSync(ROOT).filter((name) => name.endsWith(".html"))) {
    const html = readFileSync(path.join(ROOT, file), "utf8");
    const outside = html.replace(new RegExp(`${BEGIN}[\\s\\S]*?${END}`), "");
    for (const match of outside.matchAll(/#icon-([a-z0-9-]+)/g)) {
        used.add(match[1]);
    }
}

const version = JSON.parse(readFileSync(path.join(LUCIDE, "package.json"), "utf8")).version;
const symbols = [...used].sort().map((name) => {
    const svg = readFileSync(path.join(LUCIDE, "icons", `${name}.svg`), "utf8");
    const inner = svg
        .replace(/^[\s\S]*?<svg[^>]*>/, "")
        .replace(/<\/svg>[\s\S]*$/, "")
        .replace(/\s*\n\s*/g, "")
        .replace(/\s*\/>/g, "/>");
    return `        <symbol id="icon-${name}" viewBox="0 0 24 24">${inner}</symbol>`;
});

const sprite = [
    BEGIN,
    `    <!-- Lucide icons (lucide-static ${version}, ISC licence: vendor/lucide.LICENSE.txt), written by tools/build-icons.mjs -->`,
    // not the hidden attribute: it is HTML's, and an <svg> without display: none takes 300 x 150 px
    `    <svg xmlns="http://www.w3.org/2000/svg" class="icon-sprite" aria-hidden="true">`,
    ...symbols,
    `    </svg>`,
    `    ${END}`,
].join("\n");

const page = readFileSync(PAGE, "utf8");
if (!page.includes(BEGIN) || !page.includes(END)) {
    throw new Error("index.html has no icons:begin / icons:end markers");
}
writeFileSync(PAGE, page.replace(new RegExp(`${BEGIN}[\\s\\S]*?${END}`), sprite));
copyFileSync(path.join(LUCIDE, "LICENSE"), path.join(ROOT, "vendor", "lucide.LICENSE.txt"));
console.log(`${symbols.length} icons: ${[...used].sort().join(", ")}`);
