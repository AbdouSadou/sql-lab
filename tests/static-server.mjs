// Zero-dependency static file server for the tests.
//
// Usage: node tests/static-server.mjs <port> <mount>
//
//   node tests/static-server.mjs 4173 /        serve the repo root at the origin root
//   node tests/static-server.mjs 4174 /repo/   serve it under /repo/ only
//
// It imitates GitHub Pages as far as the tests care:
//   - everything outside the mount answers 404, so a root-absolute URL such as
//     /img/favicon.ico really fails on the subpath run;
//   - no COOP/COEP (or any other special) headers;
//   - no compression, so response sizes on the wire are the file sizes;
//   - files that are not part of the deployed site (see HIDDEN) answer 404;
//   - exercises/ answers with the folder page the Pages workflow writes at deploy time (the
//     "List exercise sets" step of .github/workflows/pages.yml), because Pages cannot list a
//     folder and the app finds the exercise sets by reading that page.

import { createServer } from "node:http";
import { createReadStream, realpathSync } from "node:fs";
import { readdir, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = realpathSync(path.resolve(path.dirname(fileURLToPath(import.meta.url)), ".."));

// Top-level entries that the Pages workflow does not deploy. Keep this in step with the
// --exclude list in .github/workflows/pages.yml (tests/ac7-pages.spec.js compares them).
export const HIDDEN = new Set([
    ".git",
    ".github",
    ".gitignore",
    ".site-stage",
    "tests",
    "node_modules",
    "package.json",
    "package-lock.json",
    "playwright.config.js",
]);

// The folder page for exercises/: one link per .json file, in code-unit order. For ordinary file
// names the workflow step writes exactly this text (tests/m4-listing.spec.js runs the step and
// compares); the two can differ on dotfiles, symbolic links and names that are not valid UTF-8.
export function exercisesIndexHtml(names) {
    const escape = (text) =>
        text.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;");
    return (
        '<!doctype html>\n<meta charset="utf-8">\n<title>Exercise sets</title>\n' +
        names.map((name) => `<a href="${escape(name).replaceAll("%", "%25")}">${escape(name)}</a>\n`).join("")
    );
}

async function exercisesListing() {
    let entries = [];
    try {
        entries = await readdir(path.join(ROOT, "exercises"), { withFileTypes: true });
    } catch {
        // no folder: the page lists nothing, as the workflow's page does
    }
    const names = entries
        .filter((e) => e.isFile() && e.name.endsWith(".json"))
        .map((e) => e.name)
        .sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
    return exercisesIndexHtml(names);
}

const MIME = {
    ".html": "text/html; charset=utf-8",
    ".css": "text/css; charset=utf-8",
    ".js": "text/javascript; charset=utf-8",
    ".mjs": "text/javascript; charset=utf-8",
    ".json": "application/json; charset=utf-8",
    ".wasm": "application/wasm",
    ".db": "application/octet-stream",
    ".sql": "text/plain; charset=utf-8",
    ".txt": "text/plain; charset=utf-8",
    ".md": "text/markdown; charset=utf-8",
    ".svg": "image/svg+xml",
    ".png": "image/png",
    ".ico": "image/x-icon",
};

function normalizeMount(value) {
    let mount = value.startsWith("/") ? value : `/${value}`;
    if (!mount.endsWith("/")) {
        mount += "/";
    }
    return mount;
}

function reply(res, status, body = "", headers = {}) {
    res.writeHead(status, {
        "Content-Type": "text/plain; charset=utf-8",
        "Content-Length": Buffer.byteLength(body),
        ...headers,
    });
    res.end(body);
}

// resolve maps a request pathname to a file under ROOT, or returns null.
async function resolve(mount, pathname) {
    let relative;
    try {
        relative = decodeURIComponent(pathname.slice(mount.length));
    } catch {
        return null;
    }
    if (relative.includes("\0") || relative.includes("\\")) {
        return null;
    }
    const segments = relative.split("/");
    if (segments.some((s) => s === ".." || s === ".")) {
        return null;
    }
    if (HIDDEN.has(segments[0])) {
        return null;
    }
    let target = path.join(ROOT, ...segments);
    try {
        let info = await stat(target);
        if (info.isDirectory()) {
            target = path.join(target, "index.html");
            info = await stat(target);
        }
        if (!info.isFile()) {
            return null;
        }
        // Belt and braces against symlinks that point outside the repo.
        const real = realpathSync(target);
        if (real !== ROOT && !real.startsWith(ROOT + path.sep)) {
            return null;
        }
        return { file: real, size: info.size };
    } catch {
        return null;
    }
}

export function createStaticServer(mountArg) {
    const mount = normalizeMount(mountArg);
    return createServer(async (req, res) => {
        if (req.method !== "GET" && req.method !== "HEAD") {
            return reply(res, 405, "method not allowed", { Allow: "GET, HEAD" });
        }
        let pathname;
        try {
            pathname = new URL(req.url, "http://localhost").pathname;
        } catch {
            return reply(res, 400, "bad request");
        }
        // "/repo" -> "/repo/", as GitHub Pages does.
        if (pathname + "/" === mount && mount !== "/") {
            return reply(res, 301, "", { Location: mount });
        }
        if (!pathname.startsWith(mount)) {
            return reply(res, 404, "not found");
        }
        const relative = pathname.slice(mount.length);
        if (relative === "exercises") {
            return reply(res, 301, "", { Location: `${mount}exercises/` });
        }
        if (relative === "exercises/" || relative === "exercises/index.html") {
            const body = await exercisesListing();
            res.writeHead(200, {
                "Content-Type": MIME[".html"],
                "Content-Length": Buffer.byteLength(body),
                "Cache-Control": "no-cache",
            });
            return res.end(req.method === "HEAD" ? undefined : body);
        }
        const found = await resolve(mount, pathname);
        if (!found) {
            return reply(res, 404, "not found");
        }
        const type = MIME[path.extname(found.file).toLowerCase()] || "application/octet-stream";
        res.writeHead(200, {
            "Content-Type": type,
            "Content-Length": found.size,
            "Cache-Control": "no-cache",
        });
        if (req.method === "HEAD") {
            return res.end();
        }
        createReadStream(found.file).pipe(res);
    });
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
    const port = Number(process.argv[2]);
    const mount = process.argv[3];
    if (!Number.isInteger(port) || port <= 0 || !mount) {
        console.error("usage: node tests/static-server.mjs <port> <mount>");
        process.exit(2);
    }
    createStaticServer(mount).listen(port, "127.0.0.1", () => {
        console.log(`serving ${ROOT} at http://127.0.0.1:${port}${normalizeMount(mount)}`);
    });
}
