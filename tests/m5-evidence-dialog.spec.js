const fs = require("node:fs");
const { test, expect, evidenceFile, openFresh, modelQuery, SAMPLE_FILE, EDITOR_INPUT, editorValue } = require("./helpers");

// F11, the page side: the Export menu's "Evidence (.txt)…" item, the dialog, what the file holds for
// each kind of log, and that the student number goes nowhere but the file.

const STUDENT = "U2034567";
const NOW = "2026-11-09T14:32:08Z";

// the files an export can be asked about, parsed into lines
const linesOf = (text) => text.split("\n");

// app.exportMenuButton is the Export menu's button: the dialog is opened from the menu, and the
// focus goes back to this button when the dialog closes

test.describe("the dialog", () => {
    test("opens as a modal <dialog> with a labelled input, autocomplete off and no name", async ({ page, app }) => {
        await app.open();
        await app.query("SELECT 1;");
        // the item is in the Export menu, after the database export
        await expect(page.locator("#export-menu > #export-db ~ #export-evidence")).toHaveCount(1);
        await app.openExportMenu();
        await expect(app.evidenceButton.locator(".menu-item-label")).toHaveText("Evidence (.txt)…");
        await app.openEvidence();
        await expect(app.evidenceDialog).toBeVisible();
        expect(await app.evidenceDialog.evaluate((d) => d.tagName === "DIALOG" && d.matches(":modal"))).toBe(true);
        // a visible label tied to the input
        await expect(page.getByLabel("Student number")).toHaveCount(1);
        await expect(page.locator("label[for=evidence-student]")).toBeVisible();
        await expect(app.evidenceInput).toBeFocused();
        await expect(app.evidenceInput).toHaveAttribute("autocomplete", "off");
        expect(await app.evidenceInput.evaluate((i) => i.hasAttribute("name"))).toBe(false);
        // the page behind it cannot be reached
        expect(await page.evaluate((sel) => document.querySelector(sel).matches(":focus"), EDITOR_INPUT)).toBe(false);
    });

    test("an invalid number shows an inline error tied to the input, and the dialog stays open", async ({ page, app }) => {
        await app.open();
        await app.query("SELECT 1;");
        let downloads = 0;
        page.on("download", () => downloads++);
        await app.openEvidence();
        await expect(app.evidenceError).toBeHidden();
        for (const bad of ["abcde", "abcdefghijklm", "U2034-567", "U2034 567", " U2034567", "U2034567 ", "", "ü2034567"]) {
            await app.evidenceInput.fill(bad);
            await app.evidenceDialog.locator("button[type=submit]").click();
            await expect(app.evidenceError, JSON.stringify(bad)).toBeVisible();
            await expect(app.evidenceDialog).toBeVisible();
            await expect(app.evidenceInput).toHaveAttribute("aria-invalid", "true");
            // the error is what the input is described by
            const describedBy = await app.evidenceInput.getAttribute("aria-describedby");
            expect(describedBy.split(/\s+/)).toContain("evidence-error");
            expect(await page.evaluate((id) => document.getElementById(id).textContent, "evidence-error")).toMatch(/student number/i);
            await expect(app.evidenceInput).toBeFocused();
        }
        // Enter in the field submits too
        await app.evidenceInput.fill("short");
        await app.evidenceInput.press("Enter");
        await expect(app.evidenceError).toBeVisible();
        expect(downloads).toBe(0);
        // typing again clears the message
        await app.evidenceInput.fill("abcdef");
        await expect(app.evidenceError).toBeHidden();
        await expect(app.evidenceInput).not.toHaveAttribute("aria-invalid", "true");
    });

    test("Escape closes without saving: focus returns to the Export button and the input is emptied", async ({ page, app }) => {
        await app.open();
        await app.query("SELECT 1;");
        let downloads = 0;
        page.on("download", () => downloads++);
        await app.openEvidence();
        await app.evidenceInput.fill(STUDENT);
        await page.keyboard.press("Escape");
        await expect(app.evidenceDialog).toBeHidden();
        await expect(app.exportMenuButton).toBeFocused();
        expect(await app.evidenceInput.inputValue()).toBe("");
        await app.openEvidence();
        expect(await app.evidenceInput.inputValue()).toBe("");
        expect(downloads).toBe(0);
    });

    test("Cancel closes without saving: focus returns to the Export button and the input is emptied", async ({ page, app }) => {
        await app.open();
        await app.query("SELECT 1;");
        let downloads = 0;
        page.on("download", () => downloads++);
        await app.openEvidence();
        await app.evidenceInput.fill(STUDENT);
        await app.evidenceDialog.getByRole("button", { name: "Cancel" }).click();
        await expect(app.evidenceDialog).toBeHidden();
        await expect(app.exportMenuButton).toBeFocused();
        expect(await app.evidenceInput.inputValue()).toBe("");
        expect(downloads).toBe(0);
    });

    test("the dialog's late close event leaves the focus alone once it has moved on", async ({ page, app }) => {
        await app.open();
        await app.query("SELECT 1;");
        await app.openEvidence();
        await expect(app.evidenceDialog).toBeVisible();
        // Cancel and move the focus in one task, so that the close event arrives after both
        // (the editor's focus() puts the focus on its typing surface, so that is what is compared)
        const stayed = await page.evaluate(async (sel) => {
            const host = document.querySelector("#editor");
            const input = document.querySelector(sel);
            document.querySelector("#evidence-dialog .evidence-cancel").click();
            host.focus();
            await new Promise((resolve) => setTimeout(resolve, 100));
            return document.activeElement === input;
        }, EDITOR_INPUT);
        expect(stayed).toBe(true);
    });

    for (const way of ["Cancel", "Escape"]) {
        test(`an export cancelled with ${way} while its checksum is made stays cancelled when the dialog is opened again`, async ({ page, app }) => {
            // hold the checksum until the test lets it go
            await page.addInitScript(() => {
                const subtle = crypto.subtle;
                const digest = subtle.digest.bind(subtle);
                window.__holdDigest = () => {
                    window.__hold = new Promise((resolve) => (window.__releaseDigest = resolve));
                };
                subtle.digest = (...args) => {
                    if (!window.__hold) {
                        return digest(...args);
                    }
                    window.__held = window.__hold.then(() => digest(...args));
                    return window.__held;
                };
            });
            await app.recordToasts({ fromStart: true });
            await app.open();
            await app.query("SELECT 1;");
            let downloads = 0;
            page.on("download", () => downloads++);
            await page.evaluate(() => window.__holdDigest());
            await app.openEvidence();
            await app.evidenceInput.fill(STUDENT);
            await app.evidenceDialog.locator("button[type=submit]").click();
            // the export has started and is waiting for the checksum: cancel, then open again
            if (way === "Cancel") {
                await app.evidenceDialog.getByRole("button", { name: "Cancel" }).click();
            } else {
                await page.keyboard.press("Escape");
            }
            await expect(app.evidenceDialog).toBeHidden();
            await app.openEvidence();
            await expect(app.evidenceDialog).toBeVisible();
            // let the checksum finish, and everything that follows it
            await page.evaluate(async () => {
                window.__releaseDigest();
                await window.__held;
                await new Promise((resolve) => setTimeout(resolve, 0));
            });
            await expect(app.evidenceDialog).toBeVisible();
            // the cancelled export finished without a word: no toast at all (not on opening the
            // dialog twice, not when the checksum came back)
            await app.expectToasts([]);
            expect(downloads).toBe(0);
            expect(await app.evidenceInput.inputValue()).toBe("");
            // the dialog works afterwards: a new export goes through
            await page.evaluate(() => (window.__hold = null));
            await app.evidenceInput.fill(STUDENT);
            const [download] = await Promise.all([page.waitForEvent("download"), app.evidenceDialog.locator("button[type=submit]").click()]);
            expect(download.suggestedFilename()).toBe("evidence-northlight.txt");
            await expect(app.evidenceDialog).toBeHidden();
            expect(downloads).toBe(1);
            await expect(app.toast).toHaveText("Exported evidence-northlight.txt with 1 query");
            expect(await app.toasts()).toEqual(["Exported evidence-northlight.txt with 1 query"]);
        });
    }

    for (const way of ["Cancel", "Escape"]) {
        test(`an export cancelled with ${way} whose checksum then fails leaves the reopened dialog alone`, async ({ page, app }) => {
            // the checksum waits, then fails, once
            await page.addInitScript(() => {
                const subtle = crypto.subtle;
                window.__hold = new Promise((resolve) => (window.__failDigest = resolve));
                let failed = false;
                const digest = subtle.digest.bind(subtle);
                subtle.digest = (...args) => {
                    if (failed) {
                        return digest(...args);
                    }
                    failed = true;
                    window.__rejected = window.__hold.then(() => Promise.reject(new Error("digest failed")));
                    window.__rejected.catch(() => {});
                    return window.__rejected;
                };
            });
            await app.recordToasts({ fromStart: true });
            await app.open();
            await app.query("SELECT 1;");
            await app.openEvidence();
            await app.evidenceInput.fill(STUDENT);
            await app.evidenceDialog.locator("button[type=submit]").click();
            if (way === "Cancel") {
                await app.evidenceDialog.getByRole("button", { name: "Cancel" }).click();
            } else {
                await page.keyboard.press("Escape");
            }
            await expect(app.evidenceDialog).toBeHidden();
            await app.openEvidence();
            await expect(app.evidenceDialog).toBeVisible();
            await app.evidenceInput.fill(STUDENT);
            // now the cancelled export finds out its checksum failed
            await page.evaluate(async () => {
                window.__failDigest();
                await window.__rejected.catch(() => {});
                await new Promise((resolve) => setTimeout(resolve, 0));
            });
            // the dialog the student reopened is theirs: still open, the number still typed, no error
            await expect(app.evidenceDialog).toBeVisible();
            expect(await app.evidenceInput.inputValue()).toBe(STUDENT);
            // the failure of the export the student gave up says nothing (no "could not be saved")
            await app.expectToasts([]);
            // and it still exports
            const [download] = await Promise.all([page.waitForEvent("download"), app.evidenceDialog.locator("button[type=submit]").click()]);
            expect(download.suggestedFilename()).toBe("evidence-northlight.txt");
            await expect(app.toast).toHaveText("Exported evidence-northlight.txt with 1 query");
            expect(await app.toasts()).toEqual(["Exported evidence-northlight.txt with 1 query"]);
        });
    }

    for (const way of ["Cancel", "Escape"]) {
        test(`a new export started with ${way} behind a cancelled one that still makes its checksum goes through`, async ({ page, app }) => {
            await page.addInitScript(() => {
                const subtle = crypto.subtle;
                const digest = subtle.digest.bind(subtle);
                window.__digestCalls = 0;
                window.__hold = new Promise((resolve) => (window.__releaseDigest = resolve));
                subtle.digest = (...args) => {
                    window.__digestCalls++;
                    window.__held = window.__hold.then(() => digest(...args));
                    return window.__held;
                };
            });
            await app.open();
            await app.query("SELECT 1;");
            let downloads = 0;
            page.on("download", () => downloads++);
            await app.openEvidence();
            await app.evidenceInput.fill(STUDENT);
            await app.evidenceDialog.locator("button[type=submit]").click();
            await expect.poll(() => page.evaluate(() => window.__digestCalls)).toBe(1);
            if (way === "Cancel") {
                await app.evidenceDialog.getByRole("button", { name: "Cancel" }).click();
            } else {
                await page.keyboard.press("Escape");
            }
            await expect(app.evidenceDialog).toBeHidden();
            // open again and submit while the cancelled export is still waiting for its checksum
            await app.openEvidence();
            await app.evidenceInput.fill(STUDENT);
            await app.evidenceDialog.locator("button[type=submit]").click();
            // the second export started: it was not ignored
            await expect.poll(() => page.evaluate(() => window.__digestCalls)).toBe(2);
            const [download] = await Promise.all([
                page.waitForEvent("download"),
                page.evaluate(() => window.__releaseDigest()),
            ]);
            expect(download.suggestedFilename()).toBe("evidence-northlight.txt");
            await expect(app.evidenceDialog).toBeHidden();
            await expect(app.toast).toContainText("Exported evidence-northlight.txt");
            expect(downloads).toBe(1); // the cancelled one saved nothing
            expect(await app.evidenceInput.inputValue()).toBe("");
        });
    }

    test("a successful export closes the dialog, returns focus to the Export button and says what was saved", async ({ page, app }) => {
        await app.open();
        await app.query("SELECT 1;");
        const file = await app.exportEvidence(STUDENT);
        await expect(app.exportMenuButton).toBeFocused();
        await expect(app.toast).toContainText(`Exported ${file.name} with 1 query`);
        expect(await app.evidenceInput.inputValue()).toBe("");
    });

    test("an empty log gives a short message and no dialog", async ({ page, app }) => {
        await app.open();
        // nothing runs on load, so the log is empty
        await app.openEvidence();
        await expect(app.evidenceDialog).toBeHidden();
        expect(await page.evaluate(() => document.querySelector("dialog[open]"))).toBeNull();
        await expect(app.toast).toContainText("Nothing to export yet");
    });

    test("the dialog works by keyboard alone", async ({ page, app }) => {
        await app.open();
        await app.query("SELECT 1;");
        // Enter on the Export menu's button opens the menu on its first item; two ArrowDowns reach
        // "Evidence (.txt)…" and Enter chooses it
        await app.exportMenuButton.focus();
        await page.keyboard.press("Enter");
        await expect(page.locator("#export-menu")).toBeVisible();
        await page.keyboard.press("ArrowDown");
        await page.keyboard.press("ArrowDown");
        await expect(app.evidenceButton).toBeFocused();
        await page.keyboard.press("Enter");
        await expect(app.evidenceDialog).toBeVisible();
        await page.keyboard.type(STUDENT);
        const downloaded = page.waitForEvent("download");
        await page.keyboard.press("Enter");
        expect((await downloaded).suggestedFilename()).toBe("evidence-northlight.txt");
        await expect(app.exportMenuButton).toBeFocused();
    });

    test("the dialog fits and can be used at phone width, in both colour schemes", async ({ page, app }) => {
        await page.setViewportSize({ width: 390, height: 700 });
        await app.open();
        await app.query("SELECT 1;");
        for (const colorScheme of ["light", "dark"]) {
            await page.emulateMedia({ colorScheme });
            await app.openEvidence();
            await app.evidenceInput.fill("abc");
            await app.evidenceDialog.locator("button[type=submit]").click();
            const box = await app.evidenceDialog.boundingBox();
            expect(box.x).toBeGreaterThanOrEqual(0);
            expect(box.x + box.width).toBeLessThanOrEqual(390);
            expect(box.y).toBeGreaterThanOrEqual(0);
            expect(box.y + box.height).toBeLessThanOrEqual(700);
            const colours = await app.evidenceDialog.evaluate((d) => {
                const style = getComputedStyle(d);
                return [style.backgroundColor, style.color];
            });
            expect(colours[0]).not.toBe(colours[1]);
            // the --paper token of the scheme (css/tokens.css)
            expect(colours[0]).toBe(colorScheme === "dark" ? "rgb(23, 28, 37)" : "rgb(252, 253, 252)");
            await page.keyboard.press("Escape");
        }
    });
});

test.describe("the student number goes into the file only", () => {
    test("not in storage, an address, the file name, the title, the console, the page or a request", async ({ page, app, net }) => {
        const consoleText = [];
        page.on("console", (message) => consoleText.push(message.text()));
        const errors = [];
        page.on("pageerror", (err) => errors.push(String(err)));
        await app.open();
        await app.query("SELECT 1 AS one;");
        await app.run("SELECT nope FROM nowhere;");
        await expect(app.errorBand).toContainText("no such table");

        const number = "Zq9xK2m7R4tP"; // 12 characters, unlike any text the app writes
        const file = await app.exportEvidence(number);
        expect(file.text).toContain(`\nstudent: ${number}\n`);
        expect(file.name).not.toContain(number);

        const where = await page.evaluate((n) => {
            const dump = (storage) => Object.keys(storage).map((k) => `${k}=${storage.getItem(k)}`).join("\n");
            return {
                local: dump(localStorage).includes(n),
                session: dump(sessionStorage).includes(n),
                url: location.href.includes(n),
                title: document.title.includes(n),
                html: document.documentElement.outerHTML.includes(n),
                text: document.body.innerText.includes(n),
                input: document.querySelector("#evidence-student").value,
                cookie: document.cookie.includes(n),
            };
        }, number);
        expect(where).toEqual({ local: false, session: false, url: false, title: false, html: false, text: false, input: "", cookie: false });
        expect(consoleText.join("\n")).not.toContain(number);
        expect(errors).toEqual([]);
        for (const e of net.entries) {
            expect(e.url).not.toContain(number);
        }
        // reload: nothing remembers it
        await page.reload();
        await app.waitReady();
        await app.openEvidence();
        expect(await app.evidenceInput.inputValue()).toBe("");
    });

    test("an accepted number is written exactly as typed, six to twelve characters", async ({ app }) => {
        await app.open();
        await app.query("SELECT 1;");
        for (const number of ["abcdef", "ABCDEF", "123456", "a1B2c3D4e5F6", "U2034567"]) {
            const file = await app.exportEvidence(number);
            const lines = linesOf(file.text);
            expect(lines[lines.length - 3], number).toBe(`student: ${number}`);
            expect(file.text.split(number).length - 1, `${number} appears once`).toBe(1);
        }
    });

    test("the console stays silent about the export", async ({ page, app }) => {
        const messages = [];
        page.on("console", (m) => messages.push(`${m.type()}: ${m.text()}`));
        await app.open();
        await app.query("SELECT 1;");
        messages.length = 0;
        await app.exportEvidence(STUDENT);
        expect(messages.filter((m) => m.includes(STUDENT) || /evidence/i.test(m))).toEqual([]);
    });
});

test.describe("what the file holds", () => {
    const upload = (name) => ({ name, mimeType: "application/octet-stream", buffer: fs.readFileSync(SAMPLE_FILE) });

    test("the layout is byte for byte the spec's, with the clock controlled (a log with every outcome)", async ({ page, app }) => {
        await app.open();
        await app.upload(upload("fixture.db"));
        const entries = [
            { t: "2026-11-09T13:58:12Z", sql: "SELECT category, COUNT(*) FROM products GROUP BY category;", rows: 12 },
            { t: "2026-11-09T14:01:40Z", sql: "SELECT pric FROM products;", error: "no such column: pric" },
            { t: "2026-11-09T14:02:00Z", sql: "SELECT 1\rFROM t\r\nWHERE a\n  AND b;", rows: 1 },
            { t: "2026-11-09T14:03:00Z", sql: "SELECT 'é日本語😀' WHERE 0;", rows: 0 },
        ];
        await app.seedLog("file:fixture.db", entries);
        await page.clock.setFixedTime(NOW);
        const file = await app.exportEvidence(STUDENT);
        expect(file.name).toBe("evidence-file_fixture.db.txt");
        expect(file.text).toBe(
            evidenceFile({
                dataset: "file:fixture.db",
                exported: NOW,
                student: STUDENT,
                entries: [
                    { t: entries[0].t, outcome: "12 rows", sql: entries[0].sql },
                    { t: entries[1].t, outcome: "error: no such column: pric", sql: entries[1].sql },
                    { t: entries[2].t, outcome: "1 row", sql: "SELECT 1\nFROM t\nWHERE a\n  AND b;" },
                    { t: entries[3].t, outcome: "0 rows", sql: entries[3].sql },
                ],
            })
        );
        // the literal layout, spelled out
        expect(file.text.split("\n").slice(0, 8)).toEqual([
            "SQL Lab evidence export v1",
            "dataset: file:fixture.db",
            `exported: ${NOW}`,
            "",
            "[1] 2026-11-09T13:58:12Z · 12 rows",
            "SELECT category, COUNT(*) FROM products GROUP BY category;",
            "",
            "[2] 2026-11-09T14:01:40Z · error: no such column: pric",
        ]);
        // bytes: UTF-8, no CR anywhere, no BOM
        expect(file.buffer.includes(Buffer.from("\r"))).toBe(false);
        expect(file.buffer.subarray(0, 3).equals(Buffer.from([0xef, 0xbb, 0xbf]))).toBe(false);
        expect(file.buffer.toString("utf8")).toBe(file.text);
        expect(file.buffer.includes(Buffer.from("😀", "utf8"))).toBe(true);
    });

    test("a built-in dataset: a link line for each successful entry only, and each link reopens that query alone", async ({
        page,
        app,
        browser,
        baseURL,
    }) => {
        await app.open("./?db=northlight");
        const ok1 = "SELECT category, COUNT(*) FROM products GROUP BY category;";
        const ok2 = "SELECT 'two' AS second;\nSELECT 2;";
        await app.seedLog("northlight", [
            { t: "2026-11-09T13:58:12Z", sql: ok1, rows: 12 },
            { t: "2026-11-09T14:01:40Z", sql: "SELECT pric FROM products;", error: "no such column: pric" },
            { t: "2026-11-09T14:02:00Z", sql: ok2, rows: 1 },
        ]);
        const file = await app.exportEvidence(STUDENT);
        const lines = linesOf(file.text);
        const links = lines.filter((l) => l.startsWith("link: "));
        expect(links).toHaveLength(2);
        // each link line follows its SQL, and the error entry has none
        expect(lines[lines.indexOf("[1] 2026-11-09T13:58:12Z · 12 rows") + 2]).toBe(links[0]);
        const secondAt = lines.indexOf("[2] 2026-11-09T14:01:40Z · error: no such column: pric");
        expect(lines.slice(secondAt, secondAt + 3)).toEqual([lines[secondAt], "SELECT pric FROM products;", ""]);
        // no query string, a fragment with the query and the dataset alone
        for (const link of links) {
            expect(link.startsWith(`link: ${baseURL}`)).toBe(true);
            expect(link).not.toContain("?");
            expect(link).not.toContain("db=");
        }
        const decoded = await page.evaluate(async (hashes) => {
            const { decodeShare } = await import("./js/lab/share.js");
            return hashes.map((h) => decodeShare(h));
        }, links.map((l) => `#${l.split("#")[1]}`));
        expect(decoded).toEqual([
            { ok: true, state: { dataset: "northlight", sql: ok1 } },
            { ok: true, state: { dataset: "northlight", sql: ok2 } },
        ]);
        // and the link really opens that query in a fresh browser
        const fresh = await openFresh(browser, baseURL, links[0].slice("link: ".length));
        await fresh.app.waitReady();
        await expect.poll(() => editorValue(fresh.page)).toBe(ok1);
        await fresh.context.close();
    });

    test("an entry whose link would be too long, or would not open, has none", async ({ app }) => {
        await app.open();
        let seed = 7;
        const rnd = () => (seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;
        const random = Array.from({ length: 130000 }, () => String.fromCharCode(35 + ((rnd() * 91) | 0))).join("");
        await app.seedLog("northlight", [
            { t: "2026-11-09T13:58:12Z", sql: "SELECT 1;", rows: 1 },
            { t: "2026-11-09T14:00:00Z", sql: `SELECT '${random}';`, rows: 1 },
            { t: "2026-11-09T14:01:00Z", sql: `SELECT '${"a".repeat(250000)}';`, rows: 1 },
            { t: "2026-11-09T14:02:00Z", sql: "SELECT 2;", rows: 1 },
        ]);
        const file = await app.exportEvidence(STUDENT);
        const lines = linesOf(file.text);
        const headerAt = (n) => lines.findIndex((l) => l.startsWith(`[${n}] `));
        const block = (n) => lines.slice(headerAt(n), n < 4 ? headerAt(n + 1) : lines.length);
        expect(block(1).some((l) => l.startsWith("link: "))).toBe(true);
        expect(block(2).some((l) => l.startsWith("link: "))).toBe(false);
        expect(block(3).some((l) => l.startsWith("link: "))).toBe(false);
        expect(block(4).some((l) => l.startsWith("link: "))).toBe(true);
        // the long SQL is in the file whole
        expect(file.text).toContain(`SELECT '${random}';\n`);
        expect(file.text).toContain(`SELECT '${"a".repeat(250000)}';\n`);
    });

    test("an uploaded file has its own log, a file: dataset line and no links", async ({ page, app }) => {
        await app.open();
        await app.query("SELECT 'northlight query' AS q;");
        await app.upload(upload("sample.db"));
        await app.query("SELECT 'upload query' AS q;");
        expect((await app.readLog("northlight")).map((e) => e.sql)).toEqual(["SELECT 'northlight query' AS q;"]);
        expect((await app.readLog("file:sample.db")).map((e) => e.sql)).toEqual(["SELECT 'upload query' AS q;"]);

        const file = await app.exportEvidence(STUDENT);
        expect(file.name).toBe("evidence-file_sample.db.txt");
        const lines = linesOf(file.text);
        expect(lines[1]).toBe("dataset: file:sample.db");
        expect(file.text).toContain("SELECT 'upload query' AS q;");
        expect(file.text).not.toContain("northlight query");
        expect(lines.filter((l) => l.startsWith("link: "))).toEqual([]);

        // back on the dataset, its own log comes back
        await page.goto("./?db=northlight");
        await app.waitReady();
        const again = await app.exportEvidence(STUDENT);
        expect(again.name).toBe("evidence-northlight.txt");
        expect(again.text).toContain("northlight query");
        expect(again.text).not.toContain("upload query");
    });

    test("a database opened from a URL has a file: log of its own and no links", async ({ page, app }) => {
        await app.open();
        await app.query("SELECT 'dataset query' AS q;");
        await page.goto("about.html");
        await app.open("./#datasets/northlight_retail.db");
        await app.query("SELECT 'url query' AS q;");
        expect((await app.readLog("file:northlight_retail.db")).map((e) => e.sql)).toEqual(["SELECT 'url query' AS q;"]);
        expect((await app.readLog("northlight")).map((e) => e.sql)).toEqual(["SELECT 'dataset query' AS q;"]);
        const file = await app.exportEvidence(STUDENT);
        expect(linesOf(file.text)[1]).toBe("dataset: file:northlight_retail.db");
        expect(file.text).not.toContain("link: ");
        expect(file.text).not.toContain("dataset query");
    });

    test("the empty database has a file: log of its own", async ({ page, app }) => {
        await app.openEmpty();
        await app.run("SELECT 'empty db query' AS q;");
        await expect(app.status).toContainText(/1 row/);
        const keys = await page.evaluate(() => Object.keys(localStorage).filter((k) => k.startsWith("sqllab.log.")));
        expect(keys).toHaveLength(1);
        expect(keys[0]).toMatch(/^sqllab\.log\.file:/);
        const file = await app.exportEvidence(STUDENT);
        expect(linesOf(file.text)[1]).toMatch(/^dataset: file:/);
        expect(file.text).not.toContain("link: ");
    });

    test("a hostile database name stays on one line and the file still verifies", async ({ page, app }) => {
        await app.open();
        await app.upload({ ...upload("x.db"), name: "a\nb\r c<img src=x onerror=1>.db" });
        await app.query("SELECT 1;");
        const file = await app.exportEvidence(STUDENT);
        const lines = linesOf(file.text);
        expect(lines[1]).toMatch(/^dataset: file:a_b_+ ?c<img src=x onerror=1>\.db$/);
        expect(file.text).not.toMatch(/[\r\u2028\u2029]/);
        expect(file.name).toMatch(/^evidence-[^\\/:*?"<>|\u0000-\u001f]+\.txt$/);
        await page.goto("verify.html");
        await page.locator("#evidence-file").setInputFiles({ name: "e.txt", mimeType: "text/plain", buffer: Buffer.from(file.text) });
        await expect(page.locator("#verify-result")).toContainText("VALID");
    });

    test("the model query of an exercise is in neither the log nor the file", async ({ page, app }) => {
        await app.openSet("retail-basics", { ex: "e01" });
        const model = modelQuery("e01");
        await app.editor.fill("SELECT product_name FROM products WHERE category = 'Electronics';");
        await app.checkButton.click();
        await expect(app.feedback).toContainText(/Not quite\.|Correct\./);
        const log = await app.readLog("northlight");
        expect(log).toHaveLength(1);
        expect(JSON.stringify(log)).not.toContain(model);
        const file = await app.exportEvidence(STUDENT);
        expect(file.text).not.toContain(model);
        expect(file.text).not.toContain("ORDER BY unit_price DESC");
        expect(await page.evaluate(() => document.documentElement.outerHTML)).not.toContain(model);
        expect(await page.evaluate(() => JSON.stringify({ ...localStorage }))).not.toContain(model);
    });

    test("with no crypto.subtle the menu item says so and opens no dialog", async ({ page, app }) => {
        await page.addInitScript(() => {
            Object.defineProperty(crypto, "subtle", { value: undefined, configurable: true });
        });
        await app.open();
        await app.query("SELECT 1;");
        await app.openEvidence();
        await expect(app.evidenceDialog).toBeHidden();
        await expect(app.toast).toContainText("cannot make the checksum");
    });
});
