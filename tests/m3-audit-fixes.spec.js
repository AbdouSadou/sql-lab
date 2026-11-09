// M3 audit fixes: picker state after loads that end without opening a database, a manifest
// that arrives after an upload, manifest paths with spaces, the default flag, back/forward and
// corrupt datasets, Run during a switch, the stale-load guards of the popstate paths, and the
// keyboard, screen-reader and layout fixes. One file so the findings stay together.
const fs = require("node:fs");
const { test, expect, realManifest, routeManifest, withSampleDataset, SAMPLE_FILE, SAMPLE_ENTRY } = require("./helpers");

const SAMPLE_URL = /\/datasets\/sample\.db(\?.*)?$/;
const SLOW_URL = /\/datasets\/slow\.db(\?.*)?$/;
const MANIFEST_URL = /\/datasets\/manifest\.json(\?.*)?$/;
const NORTHLIGHT_URL = /\/datasets\/northlight_retail\.db(\?.*)?$/;
const JUNK = { name: "junk.db", mimeType: "application/octet-stream", buffer: Buffer.from("this is not a database at all") };
const CORRUPT = Buffer.concat([Buffer.from("SQLite format 3\0"), Buffer.alloc(200, 7)]);

function gate() {
    let open;
    const promise = new Promise((resolve) => (open = resolve));
    return { promise, open };
}

const LZString = require("../vendor/lz-string.min.js");
const shareHash = (state) => "#s=" + LZString.compressToEncodedURIComponent(JSON.stringify({ v: 1, ...state }));

const editorText = (app) => app.editor.evaluate((el) => el.innerText);
const dbName = (page) => page.evaluate(() => window.app.database?.name);

// serves the sample fixture as datasets/sample.db, held back until the gate opens
async function holdSample(page, held) {
    await page.route(SAMPLE_URL, async (route) => {
        await held.promise;
        await route.fulfill({ path: SAMPLE_FILE, contentType: "application/octet-stream" });
    });
}

// ---- the picker follows the open database (finding: picker shows the wrong dataset) -------

test("a pick overtaken by an upload that fails leaves the picker on the open database", async ({ page, app }) => {
    const held = gate();
    await withSampleDataset(page);
    await holdSample(page, held);
    await app.open();

    await app.picker.selectOption("sample"); // held
    await app.upload(JUNK, { ready: false });
    await expect(app.status).toContainText("Failed to load database");
    await expect(app.picker).toHaveValue("northlight");
    expect(await app.pickedText()).toBe("Northlight Retail");
    expect(await dbName(page)).toBe("northlight_retail.db");

    held.open(); // the overtaken load finishes: it changes nothing
    await page.waitForTimeout(400);
    await expect(app.picker).toHaveValue("northlight");
    expect(await dbName(page)).toBe("northlight_retail.db");
    // and the dataset the picker shows can be told apart from a stale selection: picking
    // the other one still works
    await app.picker.selectOption("sample");
    await expect(page.locator("#db-name")).toContainText("sample.db");
});

test("a pick overtaken by an open-from-URL that fails leaves the picker on the open database", async ({
    page,
    app,
}) => {
    const held = gate();
    await withSampleDataset(page);
    await holdSample(page, held);
    await app.open();

    await app.picker.selectOption("sample"); // held
    page.once("dialog", (dialog) => dialog.accept("datasets/gone.db"));
    await page.keyboard.press("Control+u");
    await expect(app.status).toContainText("Failed to load database");
    await expect(app.picker).toHaveValue("northlight");
    expect(await app.pickedText()).toBe("Northlight Retail");
    held.open();
    await page.waitForTimeout(400);
    await expect(app.picker).toHaveValue("northlight");
    expect(await dbName(page)).toBe("northlight_retail.db");
});

test("a failed upload by itself leaves the picker where it was", async ({ page, app }) => {
    await withSampleDataset(page);
    await app.open();
    await app.upload(JUNK, { ready: false });
    await expect(app.status).toContainText("Failed to load database");
    await expect(app.picker).toHaveValue("northlight");
});

test("a pick that fails while an older pick is still loading does not leave the picker on the wrong dataset", async ({
    page,
    app,
}) => {
    // pick 1 is held, pick 2 fails: pick 2 is the latest, so it puts the picker back
    const held = gate();
    const manifest = realManifest();
    manifest.datasets.push({ ...SAMPLE_ENTRY }, { ...SAMPLE_ENTRY, id: "broken", name: "Broken", file: "datasets/broken.db" });
    await routeManifest(page, manifest);
    await holdSample(page, held);
    await page.route(/\/datasets\/broken\.db$/, (route) => route.fulfill({ status: 500, body: "boom" }));
    await app.open();
    await app.picker.selectOption("sample");
    await app.picker.selectOption("broken");
    await expect(app.status).toContainText('The dataset "Broken" could not be loaded');
    await expect(app.picker).toHaveValue("northlight");
    held.open();
    await page.waitForTimeout(400);
    await expect(app.picker).toHaveValue("northlight");
    expect(await dbName(page)).toBe("northlight_retail.db");
});

// ---- the manifest arrives after an upload --------------------------------------------------

test("a file uploaded while the manifest is still loading does not leave the picker disabled", async ({
    page,
    app,
}) => {
    const held = gate();
    const manifest = realManifest();
    manifest.datasets.push({ ...SAMPLE_ENTRY });
    await page.route(MANIFEST_URL, async (route) => {
        await held.promise;
        await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(manifest) });
    });
    await page.route(SAMPLE_URL, (route) => route.fulfill({ path: SAMPLE_FILE, contentType: "application/octet-stream" }));
    await page.goto("./");
    await expect(app.picker.locator("option")).toHaveText(["Loading datasets..."]);

    await app.upload(SAMPLE_FILE);
    await expect(page.locator("#db-name")).toContainText("sample.db");
    held.open();
    await expect(app.picker).toBeEnabled();
    await expect(app.picker.locator("option")).toHaveText(["sample.db", "Northlight Retail", "Sample Fruit"]);
    expect(await dbName(page)).toBe("sample.db"); // the upload won; the default did not open
    // and the list works
    await app.picker.selectOption("northlight");
    await expect(page.locator("#db-name")).toContainText("northlight_retail.db");
});

// ---- manifest paths with spaces ------------------------------------------------------------

for (const [name, file] of [
    ["a leading space before a slash", " /datasets/northlight_retail.db"],
    ["a trailing space", "datasets/northlight_retail.db "],
    ["a leading space", " datasets/northlight_retail.db"],
]) {
    test(`manifest validation: ${name} in a file is refused with a specific message`, async ({ page, app, net }) => {
        const manifest = realManifest();
        manifest.datasets[0].file = file;
        await routeManifest(page, manifest);
        await page.goto("./");
        await expect(app.status).toContainText("is not valid");
        await expect(app.status).toContainText('"file" of dataset "northlight"');
        await expect(app.status).toContainText("must not start or end with a space");
        expect(net.paths.filter((p) => p.endsWith(".db"))).toEqual([]);
    });
}

// ---- the default flag, not the first entry -------------------------------------------------

test.describe("the dataset flagged default is the one that opens, wherever it is in the list", () => {
    test.beforeEach(async ({ page }) => {
        const real = realManifest().datasets[0];
        const manifest = {
            datasets: [
                { ...SAMPLE_ENTRY, default: false },
                { ...SAMPLE_ENTRY, id: "other", name: "Other", file: "datasets/other.db" },
                { ...real, default: true }, // last
            ],
        };
        await routeManifest(page, manifest);
        const serve = (route) => route.fulfill({ path: SAMPLE_FILE, contentType: "application/octet-stream" });
        await page.route(SAMPLE_URL, serve);
        await page.route(/\/datasets\/other\.db$/, serve);
    });

    test("a bare visit", async ({ page, app }) => {
        await app.open();
        await expect(page.locator("#db-name")).toContainText("northlight_retail.db");
        await expect(app.picker).toHaveValue("northlight");
    });

    test("an unknown ?db=", async ({ page, app }) => {
        await page.goto("./?db=nonesuch");
        await expect(page.locator("#db-name")).toContainText("northlight_retail.db");
        await expect(app.status).toContainText("There is no dataset");
    });

    test("a link naming an unknown dataset, and a link naming none", async ({ page, app }) => {
        await page.goto("./" + shareHash({ d: "nonesuch", q: "select 1" }));
        await expect(app.status).toContainText("There is no dataset");
        await expect(page.locator("#db-name")).toContainText("northlight_retail.db");
        await page.goto("./" + shareHash({ q: "select 2" }));
        await page.reload();
        await expect(app.status).toContainText("does not name a dataset");
        await expect(page.locator("#db-name")).toContainText("northlight_retail.db");
    });

    test("the logo", async ({ page, app }) => {
        await app.open("./?db=other");
        await expect(page.locator("#db-name")).toContainText("other.db");
        await page.locator("#reset").click();
        await expect(page.locator("#db-name")).toContainText("northlight_retail.db");
    });
});

// ---- back/forward to a dataset that cannot be had ------------------------------------------

test("back to a dataset that cannot be fetched keeps the open database and its tables", async ({ page, app }) => {
    await withSampleDataset(page);
    await app.open();
    await app.picker.selectOption("sample");
    await expect(page.locator("#db-name")).toContainText("sample.db");
    await app.run("CREATE TABLE mywork (x); INSERT INTO mywork VALUES (42);");
    await expect(app.status).toContainText(/rows?, took/);

    await page.route(NORTHLIGHT_URL, (route) => route.fulfill({ status: 500, body: "boom" }));
    await page.goBack(); // the Northlight entry
    await expect(app.status).toContainText(
        'The dataset "Northlight Retail" could not be loaded. The previous database is still open.'
    );
    await expect(page.locator("#db-name")).toContainText("sample.db");
    await expect(app.picker).toHaveValue("sample");
    expect((await app.query("SELECT x FROM mywork;")).rows).toEqual([["42"]]);
});

// ---- a dataset that is SQLite by its header but unreadable ---------------------------------

test("a corrupt default dataset on the first load starts on an empty database that names the dataset", async ({
    page,
    app,
    pageErrors,
}) => {
    await page.route(NORTHLIGHT_URL, (route) => route.fulfill({ status: 200, body: CORRUPT }));
    await page.goto("./");
    await expect(app.status).toContainText('The dataset "Northlight Retail" could not be loaded, so an empty database is open');
    expect(await dbName(page)).toBe("new.db");
    expect(await app.pickedText()).toBe("new.db");
    expect((await app.query("SELECT 1 AS one;")).rows).toEqual([["1"]]);

    // the table shortcut works rather than throwing
    await page.keyboard.press("Control+/");
    await expect(app.status).toContainText("Database is empty");
    expect(pageErrors).toEqual([]);
});

test("a corrupt dataset named by ?db= on the first load does the same, and a share link keeps its SQL", async ({
    page,
    app,
}) => {
    const manifest = realManifest();
    manifest.datasets.push({ ...SAMPLE_ENTRY });
    await routeManifest(page, manifest);
    await page.route(SAMPLE_URL, (route) => route.fulfill({ status: 200, body: CORRUPT }));
    await page.goto("./?db=sample");
    await expect(app.status).toContainText('The dataset "Sample Fruit" could not be loaded, so an empty database is open');
    expect(await dbName(page)).toBe("new.db");

    await page.goto("./" + shareHash({ d: "sample", q: "select 'kept' as k" }));
    await page.reload();
    await expect(app.status).toContainText('The dataset "Sample Fruit" could not be loaded');
    expect(await editorText(app)).toContain("select 'kept' as k");
});

test("a corrupt dataset reached by back/forward keeps the open database", async ({ page, app }) => {
    await withSampleDataset(page);
    await app.open();
    await app.picker.selectOption("sample");
    await expect(page.locator("#db-name")).toContainText("sample.db");
    await page.route(NORTHLIGHT_URL, (route) => route.fulfill({ status: 200, body: CORRUPT }));
    await page.goBack();
    await expect(app.status).toContainText("Failed to load database");
    await expect(page.locator("#db-name")).toContainText("sample.db");
    await expect(app.picker).toHaveValue("sample");
    expect((await app.query("SELECT COUNT(*) AS n FROM fruit;")).rows).toEqual([["4"]]);
});

test("with no database open (unsupported address) the table shortcut and the table buttons do not throw", async ({
    page,
    app,
    pageErrors,
}) => {
    await page.goto("./#scheme:abc");
    await expect(app.status).toContainText("Failed to load database");
    await page.keyboard.press("Control+/");
    await expect(app.status).toContainText("No database is loaded");
    expect(await page.evaluate(() => window.app.actions.showTables().then(() => "ok", () => "rejected"))).toBe("rejected");
    expect(await page.evaluate(() => window.app.actions.showTable("x").then(() => "ok", () => "rejected"))).toBe("rejected");
    expect(pageErrors).toEqual([]);
});

// ---- Run while a switch is loading ---------------------------------------------------------

test("Run while a dataset switch is loading runs nothing, saves nothing, and says so", async ({ page, app }) => {
    const held = gate();
    await withSampleDataset(page);
    await holdSample(page, held);
    await app.open();
    await app.run("CREATE TABLE zz (n); INSERT INTO zz VALUES (7);");
    await expect(app.status).toContainText(/rows?, took/);
    const saved = await app.storedQueries();

    await app.picker.selectOption("sample"); // held
    for (const via of ["keyboard", "button"]) {
        await app.run("SELECT COUNT(*) AS c FROM zz;", { via });
        await expect(app.status).toContainText("still loading");
        await expect(app.status).not.toContainText("took");
    }
    await expect(page.locator("#result table")).toHaveCount(0);
    expect(await app.storedQueries()).toEqual(saved); // the SQL did not reach storage

    held.open();
    await expect(page.locator("#db-name")).toContainText("sample.db");
    // the lock is gone as soon as the switch has finished
    expect((await app.query("SELECT COUNT(*) AS n FROM fruit;")).rows).toEqual([["4"]]);
});

test("Run works again after a switch that failed", async ({ page, app }) => {
    await withSampleDataset(page);
    await page.route(SAMPLE_URL, (route) => route.fulfill({ status: 500, body: "boom" }));
    await app.open();
    await app.picker.selectOption("sample");
    await expect(app.status).toContainText("could not be loaded");
    expect((await app.query("SELECT COUNT(*) AS n FROM orders;")).rows).toEqual([["450"]]);
});

test("Run works after an upload and after a failed upload", async ({ page, app }) => {
    await app.open();
    await app.upload(JUNK, { ready: false });
    await expect(app.status).toContainText("Failed to load database");
    expect((await app.query("SELECT COUNT(*) AS n FROM orders;")).rows).toEqual([["450"]]);
    await app.upload(SAMPLE_FILE);
    expect((await app.query("SELECT COUNT(*) AS n FROM fruit;")).rows).toEqual([["4"]]);
});

// ---- stale loads through the popstate paths ------------------------------------------------

test.describe("stale loads", () => {
    // history: ./ (Northlight), ?db=sample, ?db=northlight
    async function threeEntries(app, page) {
        await app.open();
        await app.picker.selectOption("sample");
        await expect(page.locator("#db-name")).toContainText("sample.db");
        await app.picker.selectOption("northlight");
        await expect(page.locator("#db-name")).toContainText("northlight_retail.db");
    }

    test("back twice: the slow first step does not replace the quick second one", async ({ page, app }) => {
        const held = gate();
        await withSampleDataset(page);
        await threeEntries(app, page);
            await holdSample(page, held);

        const before = await page.evaluateHandle(() => window.app.database);
        const requested = page.waitForRequest(SAMPLE_URL);
        await page.goBack(); // ?db=sample, held
        await requested;
        await page.goBack(); // ./, the default: answers at once
        await page.waitForFunction((old) => window.app.database !== old, before);
        await app.waitReady();
        await app.query("SELECT 'newest' AS m;");
        held.open();
        await page.waitForTimeout(500);
        expect(await dbName(page)).toBe("northlight_retail.db");
        await expect(app.picker).toHaveValue("northlight");
        expect(await app.read()).toEqual({ columns: ["m"], rows: [["newest"]] });
    });

    test("back twice: a slow first step that fails shows nothing", async ({ page, app }) => {
        const held = gate();
        await withSampleDataset(page);
        await threeEntries(app, page);
            await page.route(SAMPLE_URL, async (route) => {
            await held.promise;
            await route.fulfill({ status: 500, body: "boom" });
        });

        const before = await page.evaluateHandle(() => window.app.database);
        const requested = page.waitForRequest(SAMPLE_URL);
        await page.goBack();
        await requested;
        await page.goBack();
        await page.waitForFunction((old) => window.app.database !== old, before);
        await app.waitReady();
        await app.query("SELECT 'newest' AS m;");
        held.open();
        await page.waitForTimeout(500);
        await expect(app.status).not.toContainText("could not be loaded");
        expect(await app.read()).toEqual({ columns: ["m"], rows: [["newest"]] });
        expect(await dbName(page)).toBe("northlight_retail.db");
    });

    test("a link pasted while the manifest is loading wins, and the superseded start does not fetch again", async ({
        page,
        app,
        net,
    }) => {
        const held = gate();
        const manifest = realManifest();
        manifest.datasets.push({ ...SAMPLE_ENTRY });
        await page.route(MANIFEST_URL, async (route) => {
            await held.promise;
            await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(manifest) });
        });
        await page.route(SAMPLE_URL, (route) => route.fulfill({ path: SAMPLE_FILE, contentType: "application/octet-stream" }));
        await page.goto("./");
        await expect(app.picker.locator("option")).toHaveText(["Loading datasets..."]);

        // a second start (a hash change is a popstate) while the first waits for the manifest
        await page.evaluate((hash) => {
            location.hash = hash;
        }, shareHash({ d: "sample", q: "select 'pasted' as p" }));
        held.open();
        await expect(page.locator("#db-name")).toContainText("sample.db");
        await page.waitForTimeout(400);
        expect(await dbName(page)).toBe("sample.db");
        expect(await editorText(app)).toContain("select 'pasted' as p");
        // The first start (it reads the address when the manifest arrives, so it sees the link
        // too) gave way: the dataset was fetched once, not once per start.
        expect(net.paths.filter((p) => p.endsWith("datasets/sample.db"))).toHaveLength(1);
        expect(net.paths.filter((p) => p.endsWith("northlight_retail.db"))).toEqual([]);
        await expect(app.picker).toBeEnabled();
        await expect(app.picker.locator("option")).toHaveText(["Northlight Retail", "Sample Fruit"]);
    });

    test("a database opened from a URL that is still being fetched does not replace a later pick", async ({
        page,
        app,
    }) => {
        const held = gate();
        await withSampleDataset(page);
        await page.route(SLOW_URL, async (route) => {
            await held.promise;
            await route.fulfill({ path: SAMPLE_FILE, contentType: "application/octet-stream" });
        });
        await app.open();
        page.once("dialog", (dialog) => dialog.accept("datasets/slow.db"));
        const requested = page.waitForRequest(SLOW_URL);
        await page.keyboard.press("Control+u");
        await requested;
        await app.picker.selectOption("sample"); // opens at once
        await expect(page.locator("#db-name")).toContainText("sample.db");
        await expect(app.picker).toHaveValue("sample");

        held.open(); // the URL load now finishes, too late
        await page.waitForTimeout(500);
        expect(await dbName(page)).toBe("sample.db");
        await expect(app.picker).toHaveValue("sample");
        expect(new URL(page.url()).search).toBe("?db=sample");
        expect(new URL(page.url()).hash).toBe("");
    });

    // 404: the engine finds nothing; corrupt: it throws. Each ends in a different branch of start()
    for (const [name, response] of [
        ["is not found", { status: 404, body: "gone" }],
        ["is not a readable database", { status: 200, body: CORRUPT }],
    ]) {
        test(`a database from a URL that ${name} after a later pick shows no error`, async ({ page, app }) => {
            const held = gate();
            await withSampleDataset(page);
            await page.route(SLOW_URL, async (route) => {
                await held.promise;
                await route.fulfill(response);
            });
            await app.open();
            page.once("dialog", (dialog) => dialog.accept("datasets/slow.db"));
            const requested = page.waitForRequest(SLOW_URL);
            await page.keyboard.press("Control+u");
            await requested;
            await app.picker.selectOption("sample");
            await expect(page.locator("#db-name")).toContainText("sample.db");
            await app.query("SELECT 'newest' AS m;");

            held.open();
            await page.waitForTimeout(500);
            await expect(app.status).not.toContainText("Failed to load database");
            expect(await app.read()).toEqual({ columns: ["m"], rows: [["newest"]] });
            await expect(app.picker).toHaveValue("sample");
        });
    }
});

// ---- keyboard and screen readers -----------------------------------------------------------

test("the editor shows a visible focus ring and the Escape-then-Tab hint while it has the focus", async ({
    page,
    app,
}) => {
    await app.open();
    await expect(app.editor).toBeFocused();
    const ring = await app.editor.evaluate((el) => {
        const style = getComputedStyle(el);
        return { style: style.outlineStyle, width: parseFloat(style.outlineWidth), color: style.outlineColor };
    });
    expect(ring.style).toBe("solid");
    expect(ring.width).toBeGreaterThanOrEqual(2);
    expect(ring.color).not.toBe("rgba(0, 0, 0, 0)");

    // sighted keyboard users can read how to get out (Tab indents inside the editor)
    const hint = page.locator("#editor-hint");
    await expect(hint).toBeVisible();
    await expect(hint).toContainText("Escape, then Tab");
    // assistive technology still gets it as the description
    expect(await app.editor.getAttribute("aria-describedby")).toBe("editor-hint");

    // after leaving the editor the ring and the hint go, and the page does not jump
    const before = await page.locator("#commandbar").boundingBox();
    await page.keyboard.press("Escape");
    await page.keyboard.press("Tab");
    await expect(app.editor).not.toBeFocused();
    await expect(hint).toBeHidden();
    expect((await page.locator("#commandbar").boundingBox()).y).toBe(before.y);
});

test("'open file' is a button in the Tab order, right after the picker", async ({ page, app }) => {
    await app.open();
    const openFile = page.getByRole("button", { name: "open file" });
    await expect(openFile).toHaveCount(1);
    await app.picker.focus();
    await page.keyboard.press("Tab");
    await expect(openFile).toBeFocused();
    // and it still works with a file chosen, as before
    await app.upload(SAMPLE_FILE);
    await expect(page.locator("#db-name")).toContainText("sample.db");
});

// two tests, because a file chooser that has only just been cancelled can swallow the next click
for (const [name, key] of [
    ["Enter", "Enter"],
    ["Space", " "],
]) {
    test(`'open file' opens the file chooser with ${name}`, async ({ page, app }) => {
        // listen before the page loads: Playwright turns chooser interception on when the
        // first listener is added, and a chooser that opens before that is a real dialog
        const opened = new Promise((resolve) => page.once("filechooser", resolve));
        await app.open();
        const openFile = page.getByRole("button", { name: "open file" });
        await app.picker.focus();
        await page.keyboard.press("Tab");
        await expect(openFile).toBeFocused();
        await page.keyboard.press(key);
        const chooser = await opened;
        expect(chooser.isMultiple()).toBe(false);
        await chooser.setFiles(SAMPLE_FILE);
        await expect(page.locator("#db-name")).toContainText("sample.db");
    });
}

test("the help link has a name and its icon is hidden from assistive technology", async ({ page, app }) => {
    await app.open();
    const help = page.getByRole("link", { name: "About this app" });
    await expect(help).toHaveAttribute("href", "about.html");
    await expect(help).toHaveAttribute("title", "About this app");
    const svg = help.locator("svg");
    await expect(svg).toHaveAttribute("aria-hidden", "true");
    await expect(svg).not.toHaveAttribute("role", /./);
});

test("results and errors land in a live region", async ({ page, app }) => {
    await app.open();
    const status = page.locator("#status");
    await expect(status).toHaveAttribute("role", "status");
    await app.query("SELECT 1 AS one;");
    await expect(page.getByRole("status").filter({ hasText: "1 rows, took" })).toHaveCount(1);
    await app.run("SELEC nonsense");
    await expect(page.getByRole("status").filter({ hasText: "syntax error" })).toHaveCount(1);
});

// ---- layout ---------------------------------------------------------------------------------

test("a result wider than the screen says that it scrolls sideways; a narrow one does not", async ({ page, app }) => {
    await page.setViewportSize({ width: 390, height: 800 });
    await app.open();
    const note = page.locator("#result-scroll-note");
    await app.query("SELECT * FROM v_sales LIMIT 5;");
    const info = await app.result.evaluate((el) => ({
        scrolls: el.scrollWidth > el.clientWidth + 20,
        overflowX: getComputedStyle(el).overflowX,
        page: document.documentElement.scrollWidth - window.innerWidth,
    }));
    expect(info.scrolls).toBe(true);
    expect(info.overflowX).toBe("auto");
    expect(info.page).toBeLessThanOrEqual(0);
    await expect(note).toBeVisible();
    await expect(note).toContainText("Scroll sideways to see the other columns");

    await app.query("SELECT 1 AS one;");
    await expect(note).toBeHidden();
    await app.query("SELECT * FROM v_sales LIMIT 5;");
    await expect(note).toBeVisible();
    await app.run("SELEC nonsense"); // an error clears the result
    await expect(note).toBeHidden();
});

test("the note follows the width of the window", async ({ page, app }) => {
    await page.setViewportSize({ width: 1500, height: 900 });
    await app.open();
    await app.query("SELECT order_id, order_date, store_name, region, customer_id, customer_name FROM v_sales LIMIT 5;");
    await expect(page.locator("#result-scroll-note")).toBeHidden(); // fits at this width
    await page.setViewportSize({ width: 700, height: 900 });
    await expect(page.locator("#result-scroll-note")).toBeVisible();
    await page.setViewportSize({ width: 1500, height: 900 });
    await expect(page.locator("#result-scroll-note")).toBeHidden();
});

test("the stores preview that opens with the page is cut off at phone and tablet width, and says so", async ({
    page,
    app,
}) => {
    for (const width of [390, 768]) {
        await page.setViewportSize({ width, height: 900 });
        await app.open();
        expect(await app.result.evaluate((el) => el.scrollWidth > el.clientWidth + 1)).toBe(true);
        await expect(page.locator("#result-scroll-note")).toBeVisible();
    }
});

for (const width of [641, 700, 768, 900]) {
    test(`at ${width}px the toolbar lines up with the title, wrapped or not`, async ({ page, app }) => {
        await page.setViewportSize({ width, height: 800 });
        await app.open();
        const title = await page.locator("header h1").boundingBox();
        const bar = await page.locator("#toolbar").boundingBox();
        if (bar.y >= title.y + title.height - 1) {
            // wrapped onto its own row: no indent
            expect(Math.abs(bar.x - title.x)).toBeLessThanOrEqual(1);
        } else {
            // beside the title: a gap, not touching
            expect(bar.x).toBeGreaterThanOrEqual(title.x + title.width + 8);
        }
        expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(0);
    });
}

test("at 768px the toolbar wraps and starts at the left edge of the title", async ({ page, app }) => {
    await page.setViewportSize({ width: 768, height: 800 });
    await app.open();
    const title = await page.locator("header h1").boundingBox();
    const bar = await page.locator("#toolbar").boundingBox();
    expect(bar.y).toBeGreaterThanOrEqual(title.y + title.height - 1); // it did wrap
    expect(Math.abs(bar.x - title.x)).toBeLessThanOrEqual(1);
});

// ---- the caret after a click elsewhere ----------------------------------------------------

test("a table name inserted after a click on blank page space goes at the caret, in every browser", async ({
    page,
    app,
}) => {
    await app.open();
    await app.editor.click();
    await page.keyboard.press("Control+a");
    await page.keyboard.press("Delete");
    await page.keyboard.insertText("SELECT *");
    await page.keyboard.press("Enter");
    await page.keyboard.insertText("FROM ");
    await page.keyboard.press("Enter");
    await page.keyboard.insertText("WHERE 1");
    await page.keyboard.press("Control+Home");
    await page.keyboard.press("ArrowDown");
    await page.keyboard.press("End");

    await page.mouse.click(4, 4); // blank page margin
    await app.schemaInsert("orders").click();
    expect(await editorText(app)).toBe("SELECT *\nFROM orders \nWHERE 1");
});
