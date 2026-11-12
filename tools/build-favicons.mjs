// Writes the favicon set and the link-preview image (UI plan, Phase 6) into img/. Dev tooling, not
// deployed; run it after changing the brand mark or the app's name (js/lab/config.js APP_NAME):
//
//   node tools/build-favicons.mjs
//
// The brand mark is the app's own (index.html .brand-mark): a rounded tile in the accent colour
// with a database drawn on it. Written as:
//   img/favicon.svg            the mark, which follows the colour scheme (the app's dark palette: the
//                              dark theme's accent and on-accent): the device's in a tab, the page's
//                              (its color-scheme, so a pinned theme too) as the img of About's and
//                              the evidence check page's headers
//   img/favicon.ico            16, 32 and 48 px (PNG images in an ICO), for browsers without SVG icons
//   img/favicon-64x64.png      the mark at 64 px, a PNG for whatever cannot draw the SVG (the pages'
//                              headers show favicon.svg, which follows the theme)
//   img/apple-touch-icon.png   180 px, the tile to its edges (the phone rounds it)
//   img/icon-192.png, img/icon-512.png      for the web manifest (tools/site-meta.mjs, at deploy)
//   img/icon-maskable-512.png  the same, its drawing inside the safe zone of a launcher's mask
//   img/social.png             1200 x 630, the picture a shared link shows (the Open Graph image)
// The colours are those of css/tokens.css (an image cannot read its custom properties); the PNGs
// are drawn by Playwright's Chromium from the SVG, and the preview from a page in the app's own
// typefaces (vendor/fonts).

import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const IMG = path.join(ROOT, "img");

// the tokens, read from css/tokens.css (light: the first block; dark: the pinned dark one)
const tokens = readFileSync(path.join(ROOT, "css", "tokens.css"), "utf8");
function token(name, block) {
    const match = new RegExp(`--${name}:\\s*(#[0-9A-Fa-f]{6})`).exec(block);
    if (!match) {
        throw new Error(`no --${name} in css/tokens.css`);
    }
    return match[1];
}
const light = tokens.slice(0, tokens.indexOf("@media"));
const dark = tokens.slice(tokens.indexOf(':root[data-theme="dark"]'));
const C = {
    accent: token("accent", light),
    onAccent: token("on-accent", light),
    darkAccent: token("accent", dark),
    darkOnAccent: token("on-accent", dark),
    desk: token("desk", light),
    paper: token("paper", light),
    ink: token("ink", light),
    graphite: token("graphite", light),
    rule: token("rule", light),
};

const APP_NAME = /export const APP_NAME = "([^"]*)"/.exec(readFileSync(path.join(ROOT, "js", "lab", "config.js"), "utf8"))[1];

// the mark's drawing on its 24-unit square (index.html .brand-mark)
const LINES = `<ellipse class="line" cx="12" cy="8" rx="5.5" ry="2"/><path class="line" d="M6.5 8v8c0 1.1 2.46 2 5.5 2s5.5-.9 5.5-2V8"/><path class="line" d="M6.5 12c0 1.1 2.46 2 5.5 2s5.5-.9 5.5-2"/>`;

// the favicon: a tile with rounded corners, the drawing in on-accent; in a dark scheme the dark
// palette's pair (a light tile with dark lines), as the app's own mark is drawn there
const favicon = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">
<style>
.tile { fill: ${C.accent}; }
.line { fill: none; stroke: ${C.onAccent}; stroke-width: 1.5; }
@media (prefers-color-scheme: dark) {
.tile { fill: ${C.darkAccent}; }
.line { stroke: ${C.darkOnAccent}; }
}
</style>
<rect class="tile" width="24" height="24" rx="6"/>
${LINES}
</svg>
`;
writeFileSync(path.join(IMG, "favicon.svg"), favicon);

// an image of the mark: `full` fills the square with the tile (no rounding, for the phone's own
// mask), and `inset` is the room around the drawing, in units of the 24-unit square
function markSvg(size, { full = false, inset = 0 } = {}) {
    const scale = (24 - 2 * inset) / 24;
    const tile = full ? `<rect width="24" height="24" fill="${C.accent}"/>` : `<rect width="24" height="24" rx="6" fill="${C.accent}"/>`;
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="${size}" height="${size}">
<style>.line { fill: none; stroke: ${C.onAccent}; stroke-width: 1.5; }</style>
${tile}<g transform="translate(${inset} ${inset}) scale(${scale})">${LINES}</g></svg>`;
}

const browser = await chromium.launch();
const page = await browser.newPage({ deviceScaleFactor: 1 });

async function png(svg, size) {
    await page.setViewportSize({ width: size, height: size });
    await page.setContent(`<style>html,body{margin:0;background:transparent}svg{display:block}</style>${svg}`);
    return page.screenshot({ omitBackground: true, clip: { x: 0, y: 0, width: size, height: size } });
}

const files = {
    "favicon-64x64.png": await png(markSvg(64), 64),
    "apple-touch-icon.png": await png(markSvg(180, { full: true, inset: 2 }), 180),
    "icon-192.png": await png(markSvg(192), 192),
    "icon-512.png": await png(markSvg(512), 512),
    // a launcher's mask keeps a circle of 80 % of the square: the drawing inside it
    "icon-maskable-512.png": await png(markSvg(512, { full: true, inset: 4 }), 512),
};
for (const [name, bytes] of Object.entries(files)) {
    writeFileSync(path.join(IMG, name), bytes);
}

// favicon.ico: an ICONDIR, then one ICONDIRENTRY and one PNG for each size
const sizes = [16, 32, 48];
const images = [];
for (const size of sizes) {
    images.push(await png(markSvg(size), size));
}
const header = Buffer.alloc(6 + 16 * sizes.length);
header.writeUInt16LE(0, 0); // reserved
header.writeUInt16LE(1, 2); // an icon
header.writeUInt16LE(sizes.length, 4);
let offset = header.length;
sizes.forEach((size, i) => {
    const at = 6 + 16 * i;
    header.writeUInt8(size, at); // width
    header.writeUInt8(size, at + 1); // height
    header.writeUInt8(0, at + 2); // no palette
    header.writeUInt8(0, at + 3);
    header.writeUInt16LE(1, at + 4); // colour planes
    header.writeUInt16LE(32, at + 6); // bits per pixel
    header.writeUInt32LE(images[i].length, at + 8);
    header.writeUInt32LE(offset, at + 12);
    offset += images[i].length;
});
writeFileSync(path.join(IMG, "favicon.ico"), Buffer.concat([header, ...images]));

// the link preview, 1200 x 630: the mark and the name, what the app does, and a ruled table of the
// kind it draws, on the desk and the paper of the light theme
// the typefaces as data (a page made with setContent cannot load files)
const font = (file) => `data:font/woff2;base64,${readFileSync(path.join(ROOT, "vendor", "fonts", file)).toString("base64")}`;
await page.setViewportSize({ width: 1200, height: 630 });
await page.setContent(`<!doctype html><html><head><style>
@font-face { font-family: "Next"; src: url("${font("atkinson-hyperlegible-next-latin-wght-normal.woff2")}") format("woff2"); font-weight: 200 800; }
@font-face { font-family: "Mono"; src: url("${font("atkinson-hyperlegible-mono-latin-wght-normal.woff2")}") format("woff2"); font-weight: 200 800; }
html, body { margin: 0; }
body { width: 1200px; height: 630px; box-sizing: border-box; display: flex; align-items: center; gap: 64px; padding: 72px 80px; background: ${C.desk}; color: ${C.ink}; font-family: "Next", sans-serif; }
.side { flex: 1 1 0; display: flex; flex-direction: column; gap: 28px; }
.brand { display: flex; align-items: center; gap: 24px; }
.brand svg { width: 96px; height: 96px; flex: none; }
.name { font-size: 72px; font-weight: 600; line-height: 1; }
.what { margin: 0; font-size: 34px; line-height: 1.35; color: ${C.ink}; }
.how { margin: 0; font-size: 24px; line-height: 1.45; color: ${C.graphite}; }
.paper { flex: none; padding: 32px 36px; background: ${C.paper}; border: 1px solid ${C.rule}; border-radius: 16px; }
table { border-collapse: collapse; font-family: "Mono", monospace; font-size: 24px; line-height: 1.6; font-variant-numeric: tabular-nums; border-top: 3px solid ${C.ink}; border-bottom: 3px solid ${C.ink}; }
th { text-align: left; font-weight: 600; padding: 10px 36px 10px 4px; border-bottom: 1.5px solid ${C.ink}; }
td { padding: 8px 36px 8px 4px; border-bottom: 1px solid ${C.rule}; }
tr:last-child td { border-bottom: 0; }
.num { text-align: right; padding-right: 4px; padding-left: 36px; }
</style></head><body>
<div class="side">
  <div class="brand">${markSvg(96)}<span class="name"></span></div>
  <p class="what">Write and run SQL in your browser, with exercises that check themselves.</p>
  <p class="how">SQLite in the page: nothing to install, and nothing you type leaves your device.</p>
</div>
<div class="paper"><table>
  <tr><th>category</th><th class="num">revenue</th></tr>
  <tr><td>Electronics</td><td class="num">39253.44</td></tr>
  <tr><td>Home &amp; Kitchen</td><td class="num">12889.22</td></tr>
  <tr><td>Clothing</td><td class="num">10970.02</td></tr>
  <tr><td>Food &amp; Drink</td><td class="num">2944.17</td></tr>
</table></div>
</body></html>`);
// the name as text set from config.js, never written into this file
await page.evaluate((name) => {
    document.querySelector(".name").textContent = name;
}, APP_NAME);
await page.evaluate(async () => {
    await Promise.all([document.fonts.load('600 72px "Next"'), document.fonts.load('400 34px "Next"'), document.fonts.load('400 24px "Mono"'), document.fonts.load('600 24px "Mono"')]);
    await document.fonts.ready;
});
writeFileSync(path.join(IMG, "social.png"), await page.screenshot({ clip: { x: 0, y: 0, width: 1200, height: 630 } }));

await browser.close();
console.log(`wrote img/favicon.svg, favicon.ico (${sizes.join(", ")} px), ${Object.keys(files).join(", ")} and social.png`);
