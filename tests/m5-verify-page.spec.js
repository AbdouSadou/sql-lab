const { test, expect, evidenceFile, PAYLOAD } = require("./helpers");

// verify.html (js/lab/verify-page.js): the marker's page. The single-character sweep through
// the real UI is in m5-evidence-ui.spec.js; the verification rules are in
// m5-evidence-format.spec.js. Here: the page itself.

const ENTRIES = [
    { t: "2026-11-09T13:58:12Z", outcome: "12 rows", sql: "SELECT category, COUNT(*) FROM products GROUP BY category;" },
    { t: "2026-11-09T14:01:40Z", outcome: "error: no such column: pric", sql: "SELECT pric FROM products;" },
];
const GOOD = evidenceFile({ entries: ENTRIES });
const result = (page) => page.locator("#verify-result");

const chooseFile = (page, text, name = "evidence.txt") =>
    page.locator("#evidence-file").setInputFiles({ name, mimeType: "text/plain", buffer: Buffer.from(text) });

async function paste(page, text) {
    await page.evaluate((t) => {
        const box = document.querySelector("#evidence-text");
        box.focus();
        box.select();
        // the text goes in after the event is made: Firefox ignores a DataTransfer filled beforehand
        const event = new ClipboardEvent("paste", { clipboardData: new DataTransfer(), bubbles: true, cancelable: true });
        event.clipboardData.setData("text/plain", t);
        box.dispatchEvent(event);
    }, text);
}

// drop a file (text) on `selector`; returns whether the page took the event (cancelled it)
function drop(page, text, selector = "body", name = "dropped.txt") {
    return page.evaluate(
        ([t, sel, n]) => {
            const data = new DataTransfer();
            data.items.add(new File([t], n, { type: "text/plain" }));
            const event = new DragEvent("drop", { dataTransfer: data, bubbles: true, cancelable: true });
            return !document.querySelector(sel).dispatchEvent(event);
        },
        [text, selector, name]
    );
}

test.describe("the page", () => {
    test("it carries the brand, the credit and a link back, and its files load at the mount", async ({ page, net }) => {
        await page.goto("verify.html");
        await expect(page).toHaveTitle("Check evidence - SQL Lab");
        await expect(page.locator("header [data-app-name]")).toHaveText("SQL Lab");
        await expect(page.locator("footer")).toContainText("SQL Lab");
        await expect(page.locator("footer")).toContainText("Made by Abdou Sadou, based on SQLime by Anton Zhiyanov");
        await expect(page.locator("header img")).toHaveJSProperty("complete", true);
        expect(await page.locator("header img").evaluate((img) => img.naturalWidth)).toBeGreaterThan(0);
        // the stylesheets applied (from the UI plan's Phase 6 the button is the app's: 32 px with a
        // mouse, the controls' height of section 3, 44 on a touch screen)
        expect(await page.locator("#verify-button").evaluate((b) => getComputedStyle(b).minHeight)).toBe("32px");
        expect(await page.locator(".drop-zone").evaluate((z) => getComputedStyle(z).borderTopStyle)).toBe("dashed");
        // back to the app, relative to the mount
        const href = await page.locator('main a[href="./"]').evaluate((a) => a.href);
        expect(new URL(href).pathname).toBe(new URL(page.url()).pathname.replace(/verify\.html$/, ""));
        await page.locator('main a[href="./"]').click();
        await expect(page).toHaveURL(/\/(repo\/)?$/);
        net.expectNoSameOriginFailures();
        net.expectNoExternalRequests();
    });

    test("the engine is not loaded: the page is light", async ({ page, net }) => {
        await page.goto("verify.html");
        await page.waitForLoadState("networkidle");
        const paths = net.paths;
        expect(paths.some((p) => /sqlite3|datasets\/|lz-string/.test(p)), paths.join(", ")).toBe(false);
        // the page itself is small; the two typefaces it uses (latin subsets of vendor/fonts/) add
        // about 52 KB
        expect(await net.bytes({ exclude: /^vendor\/fonts\// })).toBeLessThan(100_000);
        expect(await net.bytes()).toBeLessThan(200_000);
    });

    test("it has a labelled box, a real file input with a visible label, and a Verify button", async ({ page }) => {
        await page.goto("verify.html");
        await expect(page.getByLabel("Evidence file text")).toBeVisible();
        const file = page.getByLabel(/choose an evidence file/i);
        await expect(file).toHaveAttribute("type", "file");
        await expect(file).toBeVisible();
        await expect(page.locator("label[for=evidence-file]")).toBeVisible();
        await expect(page.getByRole("button", { name: "Verify" })).toBeVisible();
        await expect(page.getByRole("status")).toHaveCount(1);
        await expect(page.getByRole("status")).toHaveAttribute("id", "verify-result");
        // nothing is said before anything is checked
        await expect(page.getByRole("status")).toBeEmpty();
    });

    test("no request after load, no storage, whatever is pasted, dropped or chosen", async ({ page, net }) => {
        await page.goto("verify.html");
        await page.waitForLoadState("networkidle");
        net.clear();
        await paste(page, GOOD);
        await expect(result(page)).toContainText("VALID");
        await chooseFile(page, GOOD.replace("12 rows", "13 rows"));
        await expect(result(page)).toContainText("EDITED");
        expect(await drop(page, GOOD)).toBe(true);
        await expect(result(page)).toContainText("VALID");
        await page.locator("#evidence-text").fill("typed text");
        await page.getByRole("button", { name: "Verify" }).click();
        await expect(result(page)).toContainText("EDITED");
        await page.locator('main a[href="./"]').hover();
        expect(net.entries.map((e) => e.url), "requests made after the page had loaded").toEqual([]);
        const stored = await page.evaluate(async () => ({
            local: localStorage.length,
            session: sessionStorage.length,
            cookie: document.cookie,
            dbs: indexedDB.databases ? (await indexedDB.databases()).length : 0,
        }));
        expect(stored).toEqual({ local: 0, session: 0, cookie: "", dbs: 0 });
    });

    test("it works at the project subpath: every request stays under the mount", async ({ page, net, baseURL }) => {
        await page.goto("verify.html");
        await chooseFile(page, GOOD);
        await expect(result(page)).toContainText("VALID");
        for (const e of net.network) {
            expect(new URL(e.url).pathname.startsWith(new URL(baseURL).pathname), e.url).toBe(true);
        }
        net.expectNoSameOriginFailures();
    });
});

test.describe("checking", () => {
    test("choosing a file: VALID with the student number, the query count, the export time and the dataset", async ({ page }) => {
        await page.goto("verify.html");
        await chooseFile(page, GOOD);
        const box = result(page);
        await expect(box).toContainText("VALID");
        await expect(box).not.toContainText("EDITED");
        await expect(box.locator("dt:has-text('Student number') + dd")).toHaveText("U2034567");
        await expect(box.locator("dt:has-text('Queries') + dd")).toHaveText("2");
        await expect(box.locator("dt:has-text('Exported') + dd")).toHaveText("2026-11-09T14:32:08Z");
        await expect(box.locator("dt:has-text('Dataset') + dd")).toHaveText("northlight");
        // large and clear
        const sizes = await page.evaluate(() => ({
            word: parseFloat(getComputedStyle(document.querySelector(".verdict-word")).fontSize),
            body: parseFloat(getComputedStyle(document.body).fontSize),
        }));
        expect(sizes.word).toBeGreaterThanOrEqual(sizes.body * 2);
    });

    test("EDITED names a reason; pasting, choosing, dropping and Verify all say it", async ({ page }) => {
        await page.goto("verify.html");
        const edited = GOOD.replace("12 rows", "13 rows");
        await paste(page, edited);
        await expect(result(page)).toContainText("EDITED");
        await expect(result(page)).toContainText("checksum does not match");
        await expect(result(page)).not.toContainText("VALID");
        await paste(page, GOOD);
        await expect(result(page)).toContainText("VALID");
        await chooseFile(page, edited);
        await expect(result(page)).toContainText("EDITED");
        expect(await drop(page, GOOD, "#drop-zone")).toBe(true);
        await expect(result(page)).toContainText("VALID");
        expect(await drop(page, edited, "main")).toBe(true);
        await expect(result(page)).toContainText("EDITED");
    });

    test("typed text is checked by the Verify button, and a stale result goes when the text changes", async ({ page }) => {
        await page.goto("verify.html");
        await page.locator("#evidence-text").fill(GOOD);
        await expect(result(page)).toBeEmpty();
        await page.getByRole("button", { name: "Verify" }).click();
        await expect(result(page)).toContainText("VALID");
        await page.locator("#evidence-text").press("End");
        await page.keyboard.type("x");
        await expect(result(page)).toBeEmpty();
        await page.getByRole("button", { name: "Verify" }).click();
        await expect(result(page)).toContainText("EDITED");
        // by keyboard: Verify has the focus and Enter presses it
        await page.locator("#evidence-text").fill(GOOD);
        await page.getByRole("button", { name: "Verify" }).focus();
        await page.keyboard.press("Enter");
        await expect(result(page)).toContainText("VALID");
    });

    test("a paste is checked as the clipboard gave it: a lone CR is not turned into LF", async ({ page }) => {
        await page.goto("verify.html");
        const i = GOOD.indexOf("\n[1]");
        const changed = `${GOOD.slice(0, i)}\r${GOOD.slice(i + 1)}`; // one LF changed to CR
        await paste(page, changed);
        await expect(result(page)).toContainText("EDITED");
        // the box shows LF (a textarea cannot hold a CR) but Verify still checks the paste
        expect(await page.locator("#evidence-text").inputValue()).toBe(GOOD);
        await page.getByRole("button", { name: "Verify" }).click();
        await expect(result(page)).toContainText("EDITED");
        // text typed afterwards falls back to the box's own value
        await page.locator("#evidence-text").fill(GOOD);
        await page.getByRole("button", { name: "Verify" }).click();
        await expect(result(page)).toContainText("VALID");
    });

    test("a CRLF copy and a copy with no final newline are VALID", async ({ page }) => {
        await page.goto("verify.html");
        await paste(page, GOOD.replaceAll("\n", "\r\n"));
        await expect(result(page)).toContainText("VALID");
        await page.getByRole("button", { name: "Verify" }).click();
        await expect(result(page)).toContainText("VALID");
        await chooseFile(page, GOOD.replaceAll("\n", "\r\n"));
        await expect(result(page)).toContainText("VALID");
        await chooseFile(page, GOOD.slice(0, -1));
        await expect(result(page)).toContainText("VALID");
        await chooseFile(page, `${GOOD}\n`);
        await expect(result(page)).toContainText("EDITED");
    });

    test("pasting into text that is already there is checked as one text", async ({ page }) => {
        await page.goto("verify.html");
        await paste(page, "header text\n");
        await expect(result(page)).toContainText("EDITED");
        // paste after it (no selection): the whole box is checked, and it is not an evidence file
        await page.evaluate((t) => {
            const box = document.querySelector("#evidence-text");
            box.focus();
            box.setSelectionRange(box.value.length, box.value.length);
            const event = new ClipboardEvent("paste", { clipboardData: new DataTransfer(), bubbles: true, cancelable: true });
            event.clipboardData.setData("text/plain", t);
            box.dispatchEvent(event);
        }, GOOD);
        await expect(result(page)).toContainText("EDITED");
        // select all and paste again: back to the file alone
        await paste(page, GOOD);
        await expect(result(page)).toContainText("VALID");
        // paste the same file after a CRLF paste, keeping the first CR: still one text
        await paste(page, GOOD.replaceAll("\n", "\r\n"));
        await expect(result(page)).toContainText("VALID");
        expect(await page.locator("#evidence-text").inputValue()).toBe(GOOD);
    });

    test("empty, garbage and binary input are EDITED", async ({ page }) => {
        await page.goto("verify.html");
        await page.getByRole("button", { name: "Verify" }).click();
        await expect(result(page)).toContainText("EDITED");
        await expect(result(page)).toContainText("empty");
        await chooseFile(page, "");
        await expect(result(page)).toContainText("EDITED");
        await chooseFile(page, "hello");
        await expect(result(page)).toContainText("EDITED");
        await page.locator("#evidence-file").setInputFiles({ name: "x.db", mimeType: "application/octet-stream", buffer: Buffer.from([0, 255, 254, 1, 2, 3, 128, 200]) });
        await expect(result(page)).toContainText("EDITED");
        await chooseFile(page, GOOD);
        await expect(result(page)).toContainText("VALID");
        // the same file can be chosen again
        await chooseFile(page, "x");
        await expect(result(page)).toContainText("EDITED");
        await chooseFile(page, "x");
        await expect(result(page)).toContainText("EDITED");
    });

    test("a file over 20 MB is EDITED, too large", async ({ page }) => {
        await page.goto("verify.html");
        await page.locator("#evidence-file").setInputFiles({
            name: "big.txt",
            mimeType: "text/plain",
            buffer: Buffer.alloc(20 * 1024 * 1024 + 1, 97),
        });
        await expect(result(page)).toContainText("EDITED");
        await expect(result(page)).toContainText(/too large/i);
        // one just under the limit is read (and is not an evidence file)
        await page.locator("#evidence-file").setInputFiles({
            name: "big.txt",
            mimeType: "text/plain",
            buffer: Buffer.alloc(1024 * 1024, 97),
        });
        await expect(result(page)).toContainText("EDITED");
        await expect(result(page)).not.toContainText(/too large/i);
    });

    test("without crypto.subtle it says so and reports neither VALID nor EDITED", async ({ page }) => {
        await page.addInitScript(() => {
            Object.defineProperty(crypto, "subtle", { value: undefined, configurable: true });
        });
        await page.goto("verify.html");
        await expect(result(page)).toContainText("cannot check files here");
        for (const act of [
            () => paste(page, GOOD),
            () => chooseFile(page, GOOD),
            () => drop(page, GOOD),
            () => page.getByRole("button", { name: "Verify" }).click(),
        ]) {
            await act();
            await expect(result(page)).toContainText("cannot check files here");
            await expect(result(page)).not.toContainText(/VALID|EDITED/);
        }
    });
});

test.describe("hostile contents", () => {
    test("markup in a file is shown as text and runs nothing", async ({ page, app }) => {
        const hostile = evidenceFile({
            student: PAYLOAD,
            dataset: `file:${PAYLOAD}`,
            entries: [{ t: ENTRIES[0].t, outcome: "1 row", sql: PAYLOAD }],
        });
        await page.goto("verify.html");
        await chooseFile(page, hostile);
        await expect(result(page)).toContainText("VALID");
        await expect(result(page).locator("dt:has-text('Student number') + dd")).toHaveText(PAYLOAD);
        await expect(result(page).locator("dt:has-text('Dataset') + dd")).toHaveText(`file:${PAYLOAD}`);
        await app.expectInert();
        expect(await result(page).locator("img, script, iframe, svg").count()).toBe(0);
        // in the box and as a dropped file too
        await paste(page, hostile);
        await expect(result(page)).toContainText("VALID");
        expect(await drop(page, hostile, "body", `${PAYLOAD}.txt`)).toBe(true);
        await expect(result(page)).toContainText("VALID");
        await app.expectInert();
        // not an evidence file at all
        await chooseFile(page, `${PAYLOAD}\n${PAYLOAD}`);
        await expect(result(page)).toContainText("EDITED");
        await app.expectInert();
    });

    test("a very long student value or dataset does not break the layout at phone width", async ({ page }) => {
        await page.setViewportSize({ width: 390, height: 800 });
        const text = evidenceFile({
            student: "S".repeat(200),
            dataset: `file:${"d".repeat(200)}`,
            entries: ENTRIES,
        });
        await page.goto("verify.html");
        await chooseFile(page, text);
        await expect(result(page)).toContainText("VALID");
        expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(0);
    });
});

test.describe("layout and colour", () => {
    const luminance = (rgb) => {
        const [r, g, b] = rgb.match(/[\d.]+/g).slice(0, 3).map(Number).map((v) => {
            const c = v / 255;
            return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
        });
        return 0.2126 * r + 0.7152 * g + 0.0722 * b;
    };
    const contrast = (a, b) => {
        const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
        return (hi + 0.05) / (lo + 0.05);
    };

    for (const width of [1280, 768, 390]) {
        for (const colorScheme of ["light", "dark"]) {
            test(`at ${width}px in the ${colorScheme} scheme nothing overflows and the verdicts are readable`, async ({ page }) => {
                await page.setViewportSize({ width, height: 900 });
                await page.emulateMedia({ colorScheme });
                await page.goto("verify.html");
                const measure = () =>
                    page.evaluate(() => {
                        const doc = document.documentElement;
                        const word = document.querySelector(".verdict-word");
                        const box = document.querySelector("#verify-result .verdict");
                        return {
                            overflow: doc.scrollWidth - doc.clientWidth,
                            bg: getComputedStyle(document.body).backgroundColor,
                            htmlBg: getComputedStyle(doc).backgroundColor,
                            word: word ? getComputedStyle(word).color : null,
                            right: box ? box.getBoundingClientRect().right : null,
                            viewport: window.innerWidth,
                        };
                    });
                await chooseFile(page, GOOD);
                await expect(result(page)).toContainText("VALID");
                const valid = await measure();
                await page.screenshot({ path: test.info().outputPath(`valid-${width}-${colorScheme}.png`), fullPage: true });
                await chooseFile(page, GOOD.replace("12 rows", "13 rows"));
                await expect(result(page)).toContainText("EDITED");
                const edited = await measure();
                for (const m of [valid, edited]) {
                    expect(m.overflow).toBeLessThanOrEqual(0);
                    expect(m.right).toBeLessThanOrEqual(m.viewport);
                    const ground = m.htmlBg !== "rgba(0, 0, 0, 0)" ? m.htmlBg : m.bg;
                    expect(contrast(m.word, ground)).toBeGreaterThanOrEqual(4.5);
                }
                expect(valid.word).not.toBe(edited.word);
                // the --paper token of the scheme (css/tokens.css)
                expect(valid.htmlBg).toBe(colorScheme === "dark" ? "rgb(23, 28, 37)" : "rgb(252, 253, 252)");
            });
        }
    }
});
