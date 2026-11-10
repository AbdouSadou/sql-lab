const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const http = require("node:http");
const { spawn, spawnSync } = require("node:child_process");
const { test, expect, realSet, routeListing, routeSet } = require("./helpers");

// Deployment of the exercise listing (M4): GitHub Pages cannot list a folder, so the workflow
// writes exercises/index.html, and the app finds the sets by reading it (listSets).
// The "List exercise sets" step is taken out of pages.yml and run with bash, so the test
// breaks if the step is edited into something that no longer works.

const ROOT = path.resolve(__dirname, "..");
const YML = fs.readFileSync(path.join(ROOT, ".github/workflows/pages.yml"), "utf8");

// stepScript returns the `run` script of the step called `name`, dedented.
function stepScript(name) {
    const lines = YML.split("\n");
    const start = lines.findIndex((l) => l.trim() === `- name: ${name}`);
    expect(start, `step "${name}" is in pages.yml`).toBeGreaterThan(-1);
    const runAt = lines.findIndex((l, i) => i > start && /^\s+run:\s*\|\s*$/.test(l));
    expect(runAt).toBeGreaterThan(start);
    const indent = lines[runAt + 1].match(/^\s*/)[0].length;
    const body = [];
    for (let i = runAt + 1; i < lines.length; i++) {
        if (lines[i].trim() !== "" && lines[i].match(/^\s*/)[0].length < indent) break;
        body.push(lines[i].slice(indent));
    }
    return body.join("\n").trimEnd() + "\n";
}

const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), "listing-"));

// runStep stages `files` (name -> content, or null for a directory) as .site-stage/exercises
// in a temp folder, runs the workflow's script there with bash, and returns the page it wrote.
function runStep(files, { stage = true } = {}) {
    const dir = tmp();
    const scriptFile = path.join(dir, "step.sh");
    fs.writeFileSync(scriptFile, stepScript("List exercise sets"));
    const work = path.join(dir, "work");
    fs.mkdirSync(work);
    if (stage) {
        const exercises = path.join(work, ".site-stage", "exercises");
        fs.mkdirSync(exercises, { recursive: true });
        for (const [name, content] of Object.entries(files)) {
            if (content === null) fs.mkdirSync(path.join(exercises, name));
            else fs.writeFileSync(path.join(exercises, name), content);
        }
    } else {
        fs.mkdirSync(path.join(work, ".site-stage"));
    }
    // GitHub's default shell for `run` is bash -e
    const result = spawnSync("bash", ["-eo", "pipefail", scriptFile], { cwd: work, encoding: "utf8" });
    expect(result.status, result.stderr).toBe(0);
    const page = path.join(work, ".site-stage", "exercises", "index.html");
    return { dir, work, html: fs.readFileSync(page, "utf8") };
}

const validSet = (id, title = `Set ${id}`) => ({
    id,
    title,
    dataset: "northlight",
    exercises: [{ id: "a1", title: "One", prompt: "p", model_query: "SELECT 1;" }],
});

test("the workflow writes exercises/index.html after staging and before the upload, with a comment saying why", () => {
    const at = (needle) => YML.indexOf(needle);
    expect(at("name: Stage site")).toBeGreaterThan(-1);
    expect(at("name: List exercise sets")).toBeGreaterThan(at("name: Stage site"));
    expect(at("name: List exercise sets")).toBeLessThan(at("actions/upload-pages-artifact@v5"));
    const script = stepScript("List exercise sets");
    expect(script).toContain("nullglob");
    expect(script).toContain(".site-stage/exercises");
    expect(script).toContain("index.html");
    const before = YML.slice(0, at("name: List exercise sets")).split("\n").slice(-12).join("\n");
    expect(before).toMatch(/# .*cannot list a folder/);
});

test("the step writes one <a href=x.json>x.json</a> per file and nothing else that links", () => {
    const { html } = runStep({
        "alpha.json": JSON.stringify(validSet("alpha")),
        "beta-2.json": JSON.stringify(validSet("beta-2")),
        "notes.txt": "not a set",
        "folder.json": null, // a folder is not a file
    });
    const anchors = [...html.matchAll(/<a href="([^"]*)">([^<]*)<\/a>/g)].map((m) => [m[1], m[2]]);
    expect(anchors).toEqual([
        ["alpha.json", "alpha.json"],
        ["beta-2.json", "beta-2.json"],
    ]);
    expect((html.match(/<a /g) || []).length).toBe(2);
});

test("an empty folder is harmless: nullglob means no link, not a link to the pattern", () => {
    const empty = runStep({});
    expect(empty.html).not.toContain("<a");
    expect(empty.html).not.toContain("*.json");
    // no exercises folder at all in the staged site
    const none = runStep({}, { stage: false });
    expect(none.html).not.toContain("<a");
});

test("names are escaped, so an odd file name cannot add markup to the page", () => {
    const { html } = runStep({ 'a"><img src=x onerror=1>.json': "{}", "x&y.json": "{}" });
    expect(html).not.toContain("<img");
    expect(html).toContain("x&amp;y.json");
});

test("a percent sign in a file name reaches the app as that name: no other name, no request", async ({ page, app }) => {
    // The app percent-decodes every href, so the step has to write "%" as "%25". Written plainly,
    // "a%41.json" reads as a set "aA" and is fetched, and "100%.json" cannot be decoded at all.
    const { html } = runStep({ "a%41.json": "{}", "100%.json": "{}", "a%2Fb.json": "{}", "x%00.json": "{}", "week 3.json": "{}" });
    const { exercisesIndexHtml } = await import("./static-server.mjs");
    expect(html).toBe(exercisesIndexHtml(["100%.json", "a%2Fb.json", "a%41.json", "week 3.json", "x%00.json"]));
    const fetched = [];
    page.on("request", (request) => {
        if (/\/exercises\/[^/]+$/.test(new URL(request.url()).pathname)) fetched.push(request.url());
    });
    const { listed } = await listFromPage(page, app, html, {});
    expect(listed).toEqual([
        { id: "100%", ok: false },
        { id: "a%2Fb", ok: false },
        { id: "a%41", ok: false },
        { id: "week 3", ok: false },
        { id: "x%00", ok: false },
    ]);
    await expect(app.setPicker.locator("option")).toHaveText([
        "None",
        "100%.json (not valid)",
        "a%2Fb.json (not valid)",
        "a%41.json (not valid)",
        "week 3.json (not valid)",
        "x%00.json (not valid)",
    ]);
    expect(fetched).toEqual([]);
});

test("the test server answers exercises/ with the same output as the step", async ({ baseURL }) => {
    const { exercisesIndexHtml } = await import("./static-server.mjs");
    const names = fs.readdirSync(path.join(ROOT, "exercises")).filter((n) => n.endsWith(".json"));
    const files = Object.fromEntries(names.map((n) => [n, fs.readFileSync(path.join(ROOT, "exercises", n), "utf8")]));
    const { html } = runStep(files);
    expect(html).toBe(exercisesIndexHtml([...names].sort()));
    const fetched = await new Promise((resolve, reject) => {
        const { hostname, port, pathname } = new URL("exercises/", baseURL);
        http.get({ hostname, port, path: pathname }, (res) => {
            const chunks = [];
            res.on("data", (c) => chunks.push(c));
            res.on("end", () => resolve({ status: res.statusCode, type: res.headers["content-type"], body: Buffer.concat(chunks).toString() }));
        }).on("error", reject);
    });
    expect(fetched.status).toBe(200);
    expect(fetched.type).toMatch(/^text\/html/);
    expect(fetched.body).toBe(html);
    // and the folder URL without its slash goes to the one with it, as on Pages
    const redirect = await new Promise((resolve, reject) => {
        const { hostname, port, pathname } = new URL("exercises", baseURL);
        http.get({ hostname, port, path: pathname }, (res) => {
            res.resume();
            resolve(res.statusCode);
        }).on("error", reject);
    });
    expect(redirect).toBe(301);
});

// listFromPage serves `listing` for exercises/ and the given sets for their files, then asks the
// app what it lists (and what its set picker shows).
async function listFromPage(page, app, listing, sets) {
    await routeListing(page, listing);
    for (const [id, set] of Object.entries(sets)) {
        await routeSet(page, id, set);
    }
    await app.open();
    const listed = await page.evaluate(async () => {
        const { listSets } = await import("./js/lab/exercises.js");
        return (await listSets()).map((e) => ({ id: e.id, ok: e.ok }));
    });
    const options = await app.setPicker.evaluate((s) => [...s.options].map((o) => o.value).filter(Boolean));
    return { listed, options };
}

test("the app lists exactly the sets of the page the workflow step wrote", async ({ page, app }) => {
    const sets = { alpha: validSet("alpha", "Alpha set"), "beta-2": validSet("beta-2", "Beta set") };
    const files = Object.fromEntries(Object.entries(sets).map(([id, set]) => [`${id}.json`, JSON.stringify(set)]));
    const { html } = runStep({ ...files, "README.md": "ignored" });
    const { listed, options } = await listFromPage(page, app, html, sets);
    expect(listed).toEqual([
        { id: "alpha", ok: true },
        { id: "beta-2", ok: true },
    ]);
    expect(options).toEqual(["alpha", "beta-2"]);
    await expect(app.setPicker.locator("option")).toHaveText(["None", "Alpha set", "Beta set"]);
});

test("an empty listing from the step gives an app with no sets and no errors", async ({ page, app, pageErrors }) => {
    const { html } = runStep({});
    const { listed, options } = await listFromPage(page, app, html, {});
    expect(listed).toEqual([]);
    expect(options).toEqual([]);
    expect(pageErrors).toEqual([]);
});

test("the app lists exactly the sets of a real python3 -m http.server listing of the same folder", async ({ page, app }) => {
    const dir = tmp();
    const sets = { alpha: validSet("alpha"), "beta-2": validSet("beta-2") };
    for (const [id, set] of Object.entries(sets)) {
        fs.writeFileSync(path.join(dir, `${id}.json`), JSON.stringify(set));
    }
    fs.writeFileSync(path.join(dir, "notes.txt"), "x");
    fs.mkdirSync(path.join(dir, "sub"));
    const server = spawn("python3", ["-u", "-I", "-m", "http.server", "0", "--bind", "127.0.0.1", "--directory", dir], {
        stdio: ["ignore", "pipe", "pipe"],
    });
    try {
        const port = await new Promise((resolve, reject) => {
            let text = "";
            server.stdout.on("data", (chunk) => {
                text += chunk;
                const m = text.match(/port (\d+)/);
                if (m) resolve(Number(m[1]));
            });
            server.on("error", reject);
            server.on("exit", () => reject(new Error("python3 http.server exited")));
        });
        const html = await new Promise((resolve, reject) => {
            http.get({ hostname: "127.0.0.1", port, path: "/" }, (res) => {
                let body = "";
                res.on("data", (c) => (body += c));
                res.on("end", () => resolve(body));
            }).on("error", reject);
        });
        expect(html).toContain('href="alpha.json"');
        const { listed } = await listFromPage(page, app, html, sets);
        expect(listed).toEqual([
            { id: "alpha", ok: true },
            { id: "beta-2", ok: true },
        ]);
    } finally {
        server.kill();
    }
});

test("the real exercises folder is listed by the page the step writes for it", () => {
    const names = fs.readdirSync(path.join(ROOT, "exercises")).filter((n) => n.endsWith(".json"));
    const files = Object.fromEntries(names.map((n) => [n, fs.readFileSync(path.join(ROOT, "exercises", n), "utf8")]));
    const { html } = runStep(files);
    for (const id of [realSet().id]) {
        expect(html).toContain(`<a href="${id}.json">${id}.json</a>`);
    }
});
