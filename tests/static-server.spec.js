const http = require("node:http");
const { test, expect } = require("./helpers");

// Checks on the test harness itself: if the static server were lenient, the subpath
// projects would stop catching absolute-path bugs and the headers would not match Pages.

function rawGet(baseURL, rawPath) {
    const { hostname, port } = new URL(baseURL);
    return new Promise((resolve, reject) => {
        http.get({ hostname, port, path: rawPath, headers: {} }, (res) => {
            const chunks = [];
            res.on("data", (c) => chunks.push(c));
            res.on("end", () => resolve({ status: res.statusCode, headers: res.headers, body: Buffer.concat(chunks) }));
        }).on("error", reject);
    });
}

test("harness: serves the mount, 404s outside it, sends Pages-like headers", async ({ baseURL }) => {
    const mount = new URL(baseURL).pathname;
    const index = await rawGet(baseURL, mount);
    expect(index.status).toBe(200);
    expect(index.headers["content-type"]).toMatch(/^text\/html/);

    const wasm = await rawGet(baseURL, `${mount}vendor/sqlite3.wasm`);
    expect(wasm.status).toBe(200);
    expect(wasm.headers["content-type"]).toBe("application/wasm");

    for (const res of [index, wasm]) {
        expect(res.headers["cross-origin-opener-policy"]).toBeUndefined();
        expect(res.headers["cross-origin-embedder-policy"]).toBeUndefined();
        expect(res.headers["content-encoding"]).toBeUndefined();
    }

    if (mount !== "/") {
        // The subpath run: a root-absolute URL must really fail.
        expect((await rawGet(baseURL, "/img/favicon.ico")).status).toBe(404);
        expect((await rawGet(baseURL, "/index.html")).status).toBe(404);
        expect((await rawGet(baseURL, "/vendor/sqlite3.wasm")).status).toBe(404);
        // "/repo" redirects to "/repo/", like Pages.
        const redirect = await rawGet(baseURL, mount.slice(0, -1));
        expect(redirect.status).toBe(301);
        expect(redirect.headers.location).toBe(mount);
    }
});

test("harness: blocks path traversal and files that are not part of the site", async ({ baseURL }) => {
    const mount = new URL(baseURL).pathname;
    const attempts = [
        `${mount}..%2f..%2f..%2f..%2fetc%2fpasswd`,
        `${mount}%2e%2e%2f%2e%2e%2f%2e%2e%2fetc%2fpasswd`,
        `${mount}..%5c..%5c..%5cetc%5cpasswd`,
        `${mount}%2e%2e/%2e%2e/%2e%2e/etc/passwd`,
        `${mount}img/..%2f..%2fpackage.json`,
        `${mount}index.html%00.png`,
        `${mount}%zz`,
        // not deployed by the workflow, so not served here either
        `${mount}tests/helpers.js`,
        `${mount}node_modules/`,
        `${mount}.git/HEAD`,
        `${mount}.gitignore`,
        `${mount}package.json`,
        `${mount}package-lock.json`,
        `${mount}playwright.config.js`,
    ];
    for (const attempt of attempts) {
        const res = await rawGet(baseURL, attempt);
        expect(res.status, attempt).toBeGreaterThanOrEqual(400);
        expect(res.body.toString(), attempt).not.toMatch(/root:|"name": "sql-playground"/);
    }
});
