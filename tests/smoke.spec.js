const { test, expect, DEFAULT_DATASET } = require("./helpers");

test("smoke: page loads, engine initialises, SELECT 1 shows a result", async ({ page, net, app }) => {
    const logs = [];
    page.on("console", (msg) => logs.push(msg.text()));
    const pageErrors = [];
    page.on("pageerror", (err) => pageErrors.push(String(err)));

    await app.open();
    expect(logs.some((l) => /^Loaded SQLite \d/.test(l)), "engine logs its version").toBe(true);

    const result = await app.query("SELECT 1 AS one;");
    expect(result).toEqual({ columns: ["one"], rows: [["1"]] });
    await expect(app.status).toContainText("1 row in");

    expect(pageErrors).toEqual([]);
    net.expectNoSameOriginFailures();
});

test("smoke: the engine needs no cross-origin isolation and fetches only its wasm", async ({ page, net, app }) => {
    await app.open();
    await app.query("SELECT sqlite_version() AS v;");

    expect(await page.evaluate(() => crossOriginIsolated)).toBe(false);
    for (const e of net.network) {
        const headers = e.response ? await e.response.allHeaders() : {};
        expect(headers["cross-origin-opener-policy"], e.url).toBeUndefined();
        expect(headers["cross-origin-embedder-policy"], e.url).toBeUndefined();
    }

    // Everything the page requested, relative to the site base: no OPFS proxy
    // worker, no second wasm, nothing but the app's own files.
    const allowed = [
        /^$/,
        /^index\.html$/,
        /^img\/[\w.-]+$/,
        // of js/, only the page's classic scripts: its modules and its stylesheets come as one
        // file each (tools/build-app.mjs; tests/app-bundle.spec.js has a first visit's exact list)
        /^js\/lab\/(theme-boot|storage-guard|engine-guard)\.js$/,
        /^bundle\/app\.(js|css)$/,
        /^vendor\/sqlite3\.js$/,
        /^vendor\/sqlite3\.wasm$/,
        /^vendor\/lz-string\.min\.js$/,
        // the code editor (UI plan, Phase 3): CodeMirror, bundled
        /^vendor\/editor\.js$/,
        // the typefaces (UI plan, Phase 1), only the subsets the page uses
        /^vendor\/fonts\/atkinson-hyperlegible-(next|mono)-latin(-ext)?-wght-(normal|italic)\.woff2$/,
        /^datasets\/manifest\.json$/,
        // a first visit to "./" fetches the default dataset's file
        new RegExp("^" + DEFAULT_DATASET.file.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "$"),
        // the exercise sets, found through the folder page the Pages workflow writes
        /^exercises\/$/,
        /^exercises\/retail-basics\.json$/,
    ];
    const unexpected = net.paths.filter((p) => !allowed.some((re) => re.test(p)));
    expect(unexpected).toEqual([]);
    expect(net.paths).toContain("vendor/sqlite3.wasm");
    expect(net.paths.filter((p) => p.endsWith(".wasm"))).toEqual(["vendor/sqlite3.wasm"]);
    expect(net.paths).toContain("vendor/editor.js");
});
