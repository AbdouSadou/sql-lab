// The screenshot matrix of the UI plan (docs/design, section 8): every state at three viewports in
// both themes, saved as PNG files for a person to look at. Dev tooling, not deployed.
//
// Usage: node tools/ui-matrix.mjs --url http://127.0.0.1:4301/ --out docs/ui/after/phase-1
//        [--ui legacy] [--only state1,state2] [--viewports 1366x768,390x844] [--themes light,dark]
//
// The site at --url must be served (node tests/static-server.mjs <port> /). The states are the
// recipes of tests/ui-states.js (--ui picks a set: "legacy" is the interface before the redesign and
// in Phase 1). Each shot uses a fresh browser context, so nothing leaks from one shot to the next.

import { mkdirSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { chromium } from "playwright";

const require = createRequire(import.meta.url);
const { RECIPES } = require("../tests/ui-states.js");

const args = Object.fromEntries(
    process.argv.slice(2).reduce((pairs, arg, i, all) => (arg.startsWith("--") ? [...pairs, [arg.slice(2), all[i + 1]]] : pairs), [])
);
const BASE_URL = args.url ?? "http://127.0.0.1:4301/";
const OUT = args.out;
const UI = args.ui ?? "legacy";
if (!OUT) {
    console.error("usage: node tools/ui-matrix.mjs --url <site url> --out <folder> [--ui legacy]");
    process.exit(2);
}

// the plan's three sizes, and from Phase 6 a tablet's, where the sidebar is a drawer (700 to 1099 px)
const VIEWPORTS = [
    { name: "1366x768", width: 1366, height: 768 },
    { name: "1920x1080", width: 1920, height: 1080 },
    { name: "1024x768", width: 1024, height: 768 },
    { name: "390x844", width: 390, height: 844, phone: true },
];
const THEMES = ["light", "dark"];

const recipes = RECIPES[UI];
if (!recipes) {
    console.error(`unknown --ui ${UI}; known: ${Object.keys(RECIPES).join(", ")}`);
    process.exit(2);
}
const only = args.only ? new Set(args.only.split(",")) : null;
const viewports = args.viewports ? VIEWPORTS.filter((v) => args.viewports.split(",").includes(v.name)) : VIEWPORTS;
const themes = args.themes ? args.themes.split(",") : THEMES;

// To draw a page taller than the window (a full-page shot), Chromium leaves mobile emulation for
// the capture: (pointer: coarse) and (hover: none) stop matching, so a phone shot taller than
// 844 px would show the 32 px controls of a mouse rather than the 44 px of a touch screen. Before
// the shot, every @media rule that tests the pointer or hover is pinned to what it matches now
// ("all" or "not all"), in place, so the cascade is unchanged. The page's scripts read no
// pointer or hover media (only the theme and the stacking width).
async function pinInputMedia(page) {
    await page.evaluate(() => {
        const INPUT = /\b(any-)?(pointer|hover)\b/;
        const pin = (rules) => {
            for (const rule of rules) {
                if (rule instanceof CSSMediaRule && INPUT.test(rule.media.mediaText)) {
                    rule.media.mediaText = matchMedia(rule.media.mediaText).matches ? "all" : "not all";
                }
                if (rule.cssRules) {
                    pin(rule.cssRules);
                }
            }
        };
        for (const sheet of [...document.styleSheets, ...document.adoptedStyleSheets]) {
            pin(sheet.cssRules);
        }
    });
}

mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch();
const failures = [];
let count = 0;
for (const [state, recipe] of Object.entries(recipes.states)) {
    if (only && !only.has(state)) continue;
    for (const viewport of viewports) {
        for (const theme of themes) {
            const context = await browser.newContext({
                baseURL: BASE_URL,
                viewport: { width: viewport.width, height: viewport.height },
                deviceScaleFactor: 1,
                isMobile: Boolean(viewport.phone),
                hasTouch: Boolean(viewport.phone),
                colorScheme: theme,
                reducedMotion: "reduce",
            });
            const page = await context.newPage();
            page.setDefaultTimeout(30000);
            const errors = [];
            page.on("pageerror", (e) => errors.push(String(e)));
            const file = path.join(OUT, `${state}--${viewport.name}--${theme}.png`);
            try {
                await recipe(page);
                await page.evaluate(() => document.fonts.ready);
                await pinInputMedia(page);
                await page.screenshot({ path: file, fullPage: true, animations: "disabled", caret: "hide" });
                count += 1;
                if (errors.length) failures.push(`${file}: page errors ${JSON.stringify(errors)}`);
            } catch (error) {
                failures.push(`${file}: ${error.message.split("\n")[0]}`);
            }
            await context.close();
        }
    }
}
await browser.close();
console.log(`${count} screenshots in ${OUT}`);
if (failures.length) {
    console.error(failures.join("\n"));
    process.exit(1);
}
