// UI plan (docs/design), Phase 1: the colour tokens and their contrast, the light, dark and device
// themes, the vendored typefaces and the icon sprite.

const fs = require("node:fs");
const path = require("node:path");
const { test, expect, failStorage } = require("./helpers");

const ROOT = path.resolve(__dirname, "..");
const read = (file) => fs.readFileSync(path.join(ROOT, file), "utf8");
const HEX = /#(?:[0-9a-fA-F]{8}|[0-9a-fA-F]{6}|[0-9a-fA-F]{3,4})\b/g;
// colour functions; in JS only rgb() and hsl(), since lab() and the like are also ordinary names
// there (js/lab/set-actions.js calls a function named lab)
const COLOUR_FUNCTION_CSS = /\b(?:rgba?|hsla?|hwb|lab|lch|oklab|oklch)\(/g;
const COLOUR_FUNCTION_JS = /\b(?:rgba?|hsla?)\(/g;
// colour names as CSS values (a declaration's value, comments removed)
const COLOUR_NAME = /:[^;{}]*\b(white|black|red|green|blue|gray|grey|silver|yellow|orange|purple|navy|maroon|teal|olive|lime|aqua|fuchsia|pink|brown)\b/gi;
const stripComments = (text) => text.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

// the site's own CSS and JS (not vendor/, which is third-party and holds no styles; not bundle/,
// which is css/ and js/ joined, as tools/build-app.mjs --check keeps it: tokens.css and fonts.css
// are in bundle/app.css by design, and the rules below hold for it through its sources)
function ownFiles() {
    const files = [];
    const walk = (dir) => {
        for (const entry of fs.readdirSync(path.join(ROOT, dir), { withFileTypes: true })) {
            const rel = path.posix.join(dir, entry.name);
            if (entry.isDirectory()) walk(rel);
            else if (/\.(css|js)$/.test(entry.name)) files.push(rel);
        }
    };
    walk("css");
    walk("js");
    return files;
}

// The colour declarations of a block of css/tokens.css: name -> #RRGGBB.
function colours(block) {
    return Object.fromEntries([...block.matchAll(/--([a-z0-9-]+):\s*(#[0-9A-Fa-f]{6});/g)].map(([, name, value]) => [name, value]));
}

// The three palettes of css/tokens.css: light on :root, dark for a dark device (unless Light is
// pinned) and dark when Dark is pinned.
function palettes() {
    const text = read("css/tokens.css");
    const light = text.match(/\n:root \{([\s\S]*?)\n\}/)[1];
    const device = text.match(/@media \(prefers-color-scheme: dark\) \{\s*:root:not\(\[data-theme="light"\]\) \{([\s\S]*?)\n {4}\}/)[1];
    const pinned = text.match(/\n:root\[data-theme="dark"\] \{([\s\S]*?)\n\}/)[1];
    return { light: colours(light), device: colours(device), pinned: colours(pinned), deviceText: device.replace(/\s+/g, " ").trim(), pinnedText: pinned.replace(/\s+/g, " ").trim() };
}

// token -> [light, dark]
function tokens() {
    const { light, pinned } = palettes();
    return Object.fromEntries(Object.keys(light).map((name) => [name, [light[name], pinned[name]]]));
}

function luminance(hex) {
    const channel = (i) => {
        const c = parseInt(hex.slice(i, i + 2), 16) / 255;
        return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
    };
    return 0.2126 * channel(1) + 0.7152 * channel(3) + 0.0722 * channel(5);
}

function contrast(a, b) {
    const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
    return (hi + 0.05) / (lo + 0.05);
}

// The pairings the interface uses: text at 4.5:1 or better on every surface it sits on, control
// outlines and the focus ring at 3:1 (WCAG 2.2 AA, plan section 6).
const SURFACES = ["desk", "paper", "sunken"];
const PAIRS = [
    ...["ink", "graphite", "accent", "accent-hover", "success", "danger", "warning"].flatMap((fg) => SURFACES.map((bg) => [fg, bg, 4.5])),
    ...["ink", "graphite"].flatMap((fg) => ["accent-subtle", "success-subtle", "danger-subtle", "warning-subtle"].map((bg) => [fg, bg, 4.5])),
    ["accent", "accent-subtle", 4.5],
    ["success", "success-subtle", 4.5],
    ["danger", "danger-subtle", 4.5],
    ["warning", "warning-subtle", 4.5],
    ["on-accent", "accent", 4.5],
    ["on-accent", "accent-hover", 4.5],
    ["on-accent-muted", "accent", 4.5],
    ...["keyword", "string", "number", "function", "comment"].flatMap((k) => ["paper", "sunken"].map((bg) => [`syntax-${k}`, bg, 4.5])),
    ...["rule-strong", "accent"].flatMap((fg) => SURFACES.map((bg) => [fg, bg, 3])),
    // Phase 4: the loading bar's fill on its track (css/result.css .results-progress), a graphic
    // that carries the progress (WCAG 1.4.11)
    ["accent", "rule", 3],
];

test.describe("tokens", () => {
    test("no raw colour in the site's CSS or JS outside css/tokens.css: no hex, no rgb() or hsl(), no colour name", () => {
        const hits = [];
        for (const file of ownFiles().filter((f) => f !== "css/tokens.css")) {
            stripComments(read(file))
                .split("\n")
                .forEach((line, i) => {
                    for (const match of line.matchAll(HEX)) hits.push(`${file}:${i + 1}: ${match[0]}`);
                    for (const match of line.matchAll(file.endsWith(".css") ? COLOUR_FUNCTION_CSS : COLOUR_FUNCTION_JS)) hits.push(`${file}:${i + 1}: ${match[0]}`);
                    if (file.endsWith(".css")) {
                        for (const match of line.matchAll(COLOUR_NAME)) hits.push(`${file}:${i + 1}: ${match[1]}`);
                    }
                });
        }
        expect(hits).toEqual([]);
    });

    test("the two dark blocks are the same, and every colour has a dark value", () => {
        const { light, device, pinned, deviceText, pinnedText } = palettes();
        expect(deviceText).toBe(pinnedText);
        expect(Object.keys(device).sort()).toEqual(Object.keys(light).sort());
        expect(Object.keys(pinned).sort()).toEqual(Object.keys(light).sort());
    });

    test("weights are 400 and 600 only, and no text is letter-spaced", () => {
        const css = ownFiles().filter((f) => f.endsWith(".css") && f !== "css/fonts.css");
        const weights = css.flatMap((f) => [...stripComments(read(f)).matchAll(/font-weight:\s*([^;]+);/g)].map((m) => `${f}: ${m[1]}`));
        expect(weights.filter((w) => !/: (400|600|normal|inherit)$/.test(w))).toEqual([]);
        const spacing = css.flatMap((f) => [...stripComments(read(f)).matchAll(/letter-spacing:\s*([^;]+);/g)].map((m) => `${f}: ${m[1]}`));
        expect(spacing.filter((s) => !/: (0|normal)$/.test(s))).toEqual([]);
    });

    test("every token the plan names is defined for both themes", () => {
        const defined = tokens();
        for (const name of ["desk", "paper", "sunken", "rule", "rule-strong", "ink", "graphite", "accent", "accent-hover", "accent-subtle", "on-accent", "success", "success-subtle", "danger", "danger-subtle", "warning", "warning-subtle"]) {
            expect(defined[name], name).toHaveLength(2);
        }
        // the plan's values, spot-checked
        expect(defined.desk).toEqual(["#EEF1F0", "#10141B"]);
        expect(defined.accent).toEqual(["#2647C8", "#8FAEFF"]);
        expect(defined["danger-subtle"]).toEqual(["#FBE9E7", "#3A1A18"]);
    });

    test("both themes pass the contrast check: text 4.5:1, outlines 3:1", () => {
        const defined = tokens();
        const below = [];
        for (const [fg, bg, need] of PAIRS) {
            ["light", "dark"].forEach((theme, i) => {
                const ratio = contrast(defined[fg][i], defined[bg][i]);
                if (ratio < need) below.push(`${theme}: ${fg} on ${bg} is ${ratio.toFixed(2)}:1, needs ${need}:1`);
            });
        }
        expect(below).toEqual([]);
    });

    test("every var() in the site's CSS is a defined custom property", () => {
        const css = ownFiles().filter((f) => f.endsWith(".css"));
        const defined = new Set(css.flatMap((f) => [...read(f).matchAll(/(--[a-z0-9-]+)\s*:/g)].map((m) => m[1])));
        // set from script (js/lab/layout.js, from the splitters and the window), read with a fallback
        defined.add("--sidebar-width");
        defined.add("--editor-height");
        defined.add("--prompt-max");
        // set from script (js/lab/menu.js: the room beside a popover's button)
        defined.add("--popover-room");
        // set from script (js/lab/results.js: the result table's header height), read with a fallback
        defined.add("--result-head");
        const missing = css.flatMap((f) => [...read(f).matchAll(/var\((--[a-z0-9-]+)/g)].map((m) => m[1]).filter((v) => !defined.has(v)).map((v) => `${f}: ${v}`));
        expect(missing).toEqual([]);
    });
});

// the page background drawn in each theme (--desk)
const DESK = { light: "rgb(238, 241, 240)", dark: "rgb(16, 20, 27)" };
const background = (page) => page.evaluate(() => getComputedStyle(document.body).backgroundColor);

test.describe("theme", () => {
    test("follows the device until a theme is chosen", async ({ page, app }) => {
        await page.emulateMedia({ colorScheme: "dark" });
        await app.open();
        expect(await background(page)).toBe(DESK.dark);
        await page.emulateMedia({ colorScheme: "light" });
        expect(await background(page)).toBe(DESK.light);
        expect(await page.evaluate(() => document.documentElement.dataset.theme)).toBeUndefined();
        await page.locator("#theme-button").click();
        await expect(page.locator('#theme-menu [aria-checked="true"]')).toHaveText("Match device");
    });

    test("a chosen theme wins over the device, survives a reload and reaches About and verify", async ({ page, app }) => {
        await page.emulateMedia({ colorScheme: "light" });
        await app.open();
        await page.locator("#theme-button").click();
        await page.locator("#theme-menu").getByRole("menuitemradio", { name: "Dark" }).click();
        await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
        expect(await background(page)).toBe(DESK.dark);
        expect(await page.evaluate(() => localStorage.getItem("sqllab.theme"))).toBe("dark");
        await expect(page.locator("#theme-menu")).toBeHidden();
        await expect(page.locator("#theme-button")).toBeFocused();

        // applied before the first paint: the attribute is on <html> before <body> exists
        await page.addInitScript(() => {
            new MutationObserver((records, observer) => {
                if (document.body) {
                    window.__themeAtBody = document.documentElement.dataset.theme ?? null;
                    observer.disconnect();
                }
            }).observe(document, { childList: true, subtree: true });
        });
        await page.reload();
        await app.waitReady();
        expect(await page.evaluate(() => window.__themeAtBody)).toBe("dark");
        expect(await background(page)).toBe(DESK.dark);

        for (const url of ["about.html", "verify.html"]) {
            await page.goto(url);
            expect(await page.evaluate(() => window.__themeAtBody), url).toBe("dark");
            expect(await page.evaluate(() => getComputedStyle(document.documentElement).colorScheme), url).toBe("dark");
            // and the browser's chrome there takes the page's dark colour (--paper)
            expect(await page.evaluate(() => [...document.querySelectorAll('meta[name="theme-color"]')].map((m) => [m.content, m.media])), url).toEqual([
                ["#FCFDFC", "not all"],
                ["#171C25", "all"],
            ]);
        }
    });

    test("Light pins the light theme on a dark device, and Match device forgets the choice", async ({ page, app }) => {
        await page.emulateMedia({ colorScheme: "dark" });
        await app.open();
        await page.locator("#theme-button").click();
        await page.locator("#theme-menu").getByRole("menuitemradio", { name: "Light" }).click();
        expect(await background(page)).toBe(DESK.light);
        // the browser's own chrome takes the light colour whatever the device says
        expect(await page.evaluate(() => [...document.querySelectorAll('meta[name="theme-color"]')].map((m) => [m.dataset.scheme, m.media]))).toEqual([
            ["light", "all"],
            ["dark", "not all"],
        ]);

        await page.locator("#theme-button").click();
        await page.locator("#theme-menu").getByRole("menuitemradio", { name: "Match device" }).click();
        expect(await page.evaluate(() => localStorage.getItem("sqllab.theme"))).toBeNull();
        expect(await page.evaluate(() => document.documentElement.dataset.theme)).toBeUndefined();
        expect(await background(page)).toBe(DESK.dark);
        // the address bar colours follow the device again, one per scheme
        expect(await page.evaluate(() => [...document.querySelectorAll('meta[name="theme-color"]')].map((m) => [m.content, m.media]))).toEqual([
            ["#EEF1F0", "(prefers-color-scheme: light)"],
            ["#10141B", "(prefers-color-scheme: dark)"],
        ]);
    });

    test("the Theme control is a menu button operable from the keyboard", async ({ page, app }) => {
        await app.open();
        const button = page.locator("#theme-button");
        const menu = page.locator("#theme-menu");
        await expect(button).toHaveAttribute("aria-haspopup", "menu");
        await expect(button).toHaveAttribute("aria-expanded", "false");
        await expect(button).toHaveAccessibleName("Theme");
        await expect(menu).toHaveAttribute("role", "menu");
        // (a closed popover's items are hidden, so they are counted by attribute)
        await expect(menu.locator('[role="menuitemradio"]')).toHaveCount(3);

        // ArrowDown opens on the checked item; the keys work at once
        await button.focus();
        await page.keyboard.press("ArrowDown");
        await expect(menu).toBeVisible();
        await expect(button).toHaveAttribute("aria-expanded", "true");
        await expect(menu.getByRole("menuitemradio", { name: "Match device" })).toBeFocused();
        await page.keyboard.press("ArrowDown"); // wraps to the first
        await expect(menu.getByRole("menuitemradio", { name: "Light" })).toBeFocused();
        await page.keyboard.press("ArrowUp"); // and back
        await expect(menu.getByRole("menuitemradio", { name: "Match device" })).toBeFocused();
        await page.keyboard.press("Home");
        await expect(menu.getByRole("menuitemradio", { name: "Light" })).toBeFocused();
        await page.keyboard.press("End");
        await expect(menu.getByRole("menuitemradio", { name: "Match device" })).toBeFocused();
        await page.keyboard.press("d"); // the first letter of an item
        await expect(menu.getByRole("menuitemradio", { name: "Dark" })).toBeFocused();

        // Escape closes and returns to the button, without choosing
        await page.keyboard.press("Escape");
        await expect(menu).toBeHidden();
        await expect(button).toBeFocused();
        await expect(button).toHaveAttribute("aria-expanded", "false");
        expect(await page.evaluate(() => document.documentElement.dataset.theme)).toBeUndefined();

        // ArrowUp opens on the last item; Enter chooses it; Space opens on the checked item
        await page.keyboard.press("ArrowUp");
        await expect(menu.getByRole("menuitemradio", { name: "Match device" })).toBeFocused();
        await page.keyboard.press("ArrowUp");
        await page.keyboard.press("Enter");
        await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
        await expect(menu).toBeHidden();
        await expect(button).toBeFocused();
        await page.keyboard.press(" ");
        await expect(menu.getByRole("menuitemradio", { name: "Dark" })).toBeFocused();
        await expect(menu.getByRole("menuitemradio", { name: "Dark" })).toHaveAttribute("aria-checked", "true");

        // Tab closes the menu and moves on, out of it
        await page.keyboard.press("Tab");
        await expect(menu).toBeHidden();
        expect(await menu.evaluate((m) => m.contains(document.activeElement))).toBe(false);
    });

    test("a press outside closes the menu, a press on the button toggles it", async ({ page, app }) => {
        await app.open();
        const button = page.locator("#theme-button");
        const menu = page.locator("#theme-menu");
        await button.click();
        await expect(menu).toBeVisible();
        await button.click();
        await expect(menu).toBeHidden();
        await button.click();
        await expect(menu).toBeVisible();
        await page.locator("#result .results-empty-title").click();
        await expect(menu).toBeHidden();
        await expect(button).toHaveAttribute("aria-expanded", "false");
    });

    test("with storage blocked the theme can still be chosen, for the page", async ({ page, app, pageErrors }) => {
        await failStorage(page, { methods: ["setItem", "getItem"], prefix: "sqllab.theme" });
        await app.open();
        await page.locator("#theme-button").click();
        await page.locator("#theme-menu").getByRole("menuitemradio", { name: "Dark" }).click();
        await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
        expect(pageErrors).toEqual([]);
    });

    test("theme-boot.js reads the key that config.js names", () => {
        const key = read("js/lab/config.js").match(/THEME_STORAGE_KEY = "([^"]+)"/)[1];
        expect(read("js/lab/theme-boot.js")).toContain(`getItem("${key}")`);
        // in the head of every page: after the theme-color metas it switches, before any stylesheet
        for (const page of ["index.html", "about.html", "verify.html"]) {
            const head = read(page).split("</head>")[0];
            const boot = head.indexOf('<script src="js/lab/theme-boot.js"></script>');
            expect(boot, page).toBeGreaterThan(-1);
            expect(boot, page).toBeLessThan(head.indexOf("<link"));
            expect(boot, page).toBeGreaterThan(head.lastIndexOf('<meta name="theme-color"'));
            expect([...head.matchAll(/<meta name="theme-color" content="#[0-9A-F]{6}" media="\(prefers-color-scheme: (light|dark)\)" data-scheme="\1">/g)].length, page).toBe(2);
        }
    });
});

test.describe("type and icons", () => {
    test("the vendored typefaces are used, and come from the site", async ({ page, app, net }) => {
        await app.open();
        await page.evaluate(() => document.fonts.ready);
        const used = await page.evaluate(() => ({
            ui: getComputedStyle(document.body).fontFamily,
            code: getComputedStyle(document.querySelector("#editor")).fontFamily,
            button: getComputedStyle(document.querySelector("#execute")).fontFamily,
            loaded: [...document.fonts].filter((f) => f.status === "loaded").map((f) => f.family.replaceAll('"', "")),
        }));
        expect(used.ui).toMatch(/^"?Atkinson Hyperlegible Next"?, system-ui, sans-serif$/);
        expect(used.code).toMatch(/^"?Atkinson Hyperlegible Mono"?, ui-monospace, monospace$/);
        expect(used.button).toBe(used.ui);
        expect(used.loaded).toEqual(expect.arrayContaining(["Atkinson Hyperlegible Next", "Atkinson Hyperlegible Mono"]));
        const fonts = net.paths.filter((p) => p.endsWith(".woff2"));
        expect(fonts.length).toBeGreaterThan(0);
        expect(fonts.every((p) => p.startsWith("vendor/fonts/"))).toBe(true);
        net.expectNoExternalRequests();
        net.expectNoSameOriginFailures();
    });

    test("css/fonts.css names files that exist, swaps, and keeps to latin and latin-ext", () => {
        const css = read("css/fonts.css");
        const sources = [...css.matchAll(/url\("\.\.\/(vendor\/fonts\/[^"]+)"\)/g)].map((m) => m[1]);
        expect(sources).toHaveLength(8);
        for (const file of sources) expect(fs.existsSync(path.join(ROOT, file)), file).toBe(true);
        expect(css.match(/font-display: swap;/g)).toHaveLength(8);
        const total = sources.reduce((sum, file) => sum + fs.statSync(path.join(ROOT, file)).size, 0);
        expect(total).toBeLessThan(200 * 1024);
        expect(fs.existsSync(path.join(ROOT, "vendor/fonts/atkinson-hyperlegible-next.LICENSE.txt"))).toBe(true);
        expect(fs.existsSync(path.join(ROOT, "vendor/fonts/atkinson-hyperlegible-mono.LICENSE.txt"))).toBe(true);
    });

    test("the icon sprite holds exactly the icons the code uses", () => {
        const html = read("index.html");
        const sprite = html.match(/<!-- icons:begin -->([\s\S]*?)<!-- icons:end -->/)[1];
        const symbols = [...sprite.matchAll(/<symbol id="icon-([a-z0-9-]+)" viewBox="0 0 24 24">(.*?)<\/symbol>/g)];
        expect(symbols.every(([, , shapes]) => shapes.length > 10)).toBe(true);
        const used = new Set();
        const walk = (dir) => {
            for (const entry of fs.readdirSync(path.join(ROOT, dir), { withFileTypes: true })) {
                const rel = path.posix.join(dir, entry.name);
                if (entry.isDirectory()) walk(rel);
                else if (rel.endsWith(".js")) {
                    const code = read(rel).replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
                    for (const m of code.matchAll(/\bicon\(\s*["']([a-z0-9-]+)["']/g)) used.add(m[1]);
                }
            }
        };
        walk("js");
        for (const page of ["index.html", "about.html", "verify.html"]) {
            const outside = read(page).replace(/<!-- icons:begin -->[\s\S]*?<!-- icons:end -->/, "");
            for (const m of outside.matchAll(/#icon-([a-z0-9-]+)/g)) used.add(m[1]);
        }
        expect(symbols.map(([, name]) => name).sort()).toEqual([...used].sort());
        expect(read("vendor/lucide.LICENSE.txt")).toContain("ISC License");
    });

    test("icons draw at 16 px in the colour of their text, and the sprite takes no room", async ({ page, app }) => {
        await app.open();
        const sizes = await page.locator("#theme-button .icon:not(.hidden)").evaluate((svg) => {
            const box = svg.getBoundingClientRect();
            return { width: box.width, height: box.height, stroke: getComputedStyle(svg).stroke, color: getComputedStyle(svg).color };
        });
        expect(sizes.width).toBe(16);
        expect(sizes.height).toBe(16);
        expect(sizes.stroke).toBe(sizes.color);
        // a 1.5 px stroke at 16 px is 2.25 in the 24-unit drawing
        expect(await page.locator("#theme-button .icon:not(.hidden)").evaluate((svg) => getComputedStyle(svg).strokeWidth)).toBe("2.25px");
        const sprite = await page.locator("svg.icon-sprite").evaluate((svg) => svg.getBoundingClientRect().height);
        expect(sprite).toBe(0);
    });
});
