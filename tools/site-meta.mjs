// What a shared link's preview needs (UI plan, Phase 6: Open Graph tags), and the web manifest,
// written into a copy of the site staged for deployment (the Pages workflow's .site-stage), never
// into the repository's own pages. Run at deploy:
//
//   node tools/site-meta.mjs --stage .site-stage --url https://<user>.github.io/<repo>/
//
// The site's address is SITE_URL of js/lab/config.js when it is set (a custom domain, say), else
// --url (the address GitHub Pages gives the workflow). The preview image, img/social.png (written
// by tools/build-favicons.mjs), is the one absolute URL of the site: a link preview needs one.
//
// Between <!-- social:begin --> and <!-- social:end --> of each page below: og:type, og:site_name,
// og:title (the page's title as js/lab/brand.js writes it), og:description (the page's own
// description), og:url, og:image with its size and its text, twitter:card, and the link to
// site.webmanifest, which is written next to the pages (the app's name, its colours, its icons).
// The app's name comes from APP_NAME, so no page carries a name that config.js does not control
// (tests/m2-brand.spec.js). Without an address the tags that need one are left out.
//
// No dependencies, and config.js is read as text: the workflow runs this with the runner's Node.

import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const BEGIN = "<!-- social:begin -->";
const END = "<!-- social:end -->";
// the pages a link can point at, with the title part brand.js gives each
const PAGES = [
    { file: "index.html", path: "", part: "" },
    { file: "about.html", path: "about.html", part: "About" },
    { file: "verify.html", path: "verify.html", part: "Check evidence" },
];
const IMAGE = { path: "img/social.png", width: 1200, height: 630 };

const args = Object.fromEntries(
    process.argv.slice(2).reduce((pairs, arg, i, all) => (arg.startsWith("--") ? [...pairs, [arg.slice(2), all[i + 1]]] : pairs), [])
);
const stage = path.resolve(ROOT, args.stage ?? ".site-stage");

const config = readFileSync(path.join(ROOT, "js", "lab", "config.js"), "utf8");
const constant = (name) => {
    const match = new RegExp(`export const ${name} = "([^"]*)"`).exec(config);
    if (!match) {
        throw new Error(`js/lab/config.js has no ${name}`);
    }
    return match[1];
};
const APP_NAME = constant("APP_NAME");
const tokens = readFileSync(path.join(ROOT, "css", "tokens.css"), "utf8");
const DESK = /--desk:\s*(#[0-9A-Fa-f]{6})/.exec(tokens)[1];

// the address: SITE_URL, else --url; absolute http(s), ending in "/"
export function siteAddress(siteUrl, fallback) {
    const chosen = siteUrl || fallback || "";
    if (!chosen) {
        return null;
    }
    const url = new URL(chosen);
    if (url.protocol !== "https:" && url.protocol !== "http:") {
        throw new Error(`the site's address must be http or https: ${chosen}`);
    }
    if (!url.pathname.endsWith("/")) {
        url.pathname += "/";
    }
    url.search = "";
    url.hash = "";
    return url.href;
}

const escapeAttr = (text) => text.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

export function socialTags({ appName, title, description, address, pagePath }) {
    const meta = (key, name, content) => `<meta ${key}="${name}" content="${escapeAttr(content)}">`;
    const lines = [
        meta("property", "og:type", "website"),
        meta("property", "og:site_name", appName),
        meta("property", "og:title", title),
        meta("property", "og:description", description),
    ];
    if (address) {
        lines.push(
            meta("property", "og:url", new URL(pagePath, address).href),
            meta("property", "og:image", new URL(IMAGE.path, address).href),
            meta("property", "og:image:width", String(IMAGE.width)),
            meta("property", "og:image:height", String(IMAGE.height)),
            meta("property", "og:image:alt", `${appName}: ${description}`),
            meta("name", "twitter:card", "summary_large_image")
        );
    } else {
        lines.push(meta("name", "twitter:card", "summary"));
    }
    lines.push(`<link rel="manifest" href="site.webmanifest">`);
    return lines;
}

export function manifest({ appName }) {
    return {
        name: appName,
        short_name: appName,
        start_url: "./",
        scope: "./",
        display: "browser",
        background_color: DESK,
        theme_color: DESK,
        icons: [
            { src: "img/icon-192.png", sizes: "192x192", type: "image/png" },
            { src: "img/icon-512.png", sizes: "512x512", type: "image/png" },
            { src: "img/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
        ],
    };
}

function main() {
    const siteUrl = constant("SITE_URL");
    const address = siteAddress(siteUrl, args.url);
    for (const page of PAGES) {
        const file = path.join(stage, page.file);
        const html = readFileSync(file, "utf8");
        const start = html.indexOf(BEGIN);
        const end = html.indexOf(END);
        if (start < 0 || end < start) {
            throw new Error(`${page.file} has no ${BEGIN} ... ${END}`);
        }
        const description = /<meta name="description" content="([^"]*)">/.exec(html)?.[1] ?? "";
        const title = page.part ? `${page.part} - ${APP_NAME}` : APP_NAME;
        const indent = html.slice(html.lastIndexOf("\n", start) + 1, start);
        const tags = socialTags({ appName: APP_NAME, title, description, address, pagePath: page.path });
        writeFileSync(file, html.slice(0, start) + [BEGIN, ...tags, END].join(`\n${indent}`) + html.slice(end + END.length));
    }
    writeFileSync(path.join(stage, "site.webmanifest"), `${JSON.stringify(manifest({ appName: APP_NAME }), null, 2)}\n`);
    console.log(`link previews ${address ? `for ${address}` : "without an address"}, and site.webmanifest, in ${path.relative(ROOT, stage) || "."}`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
    main();
}
