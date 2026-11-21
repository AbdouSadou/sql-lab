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

// paste a file (no text) into the box, as a file copied in a file manager is
function pasteFile(page, text, name = "pasted.txt") {
    return page.evaluate(
        ([t, n]) => {
            const box = document.querySelector("#evidence-text");
            box.focus();
            // the file goes in after the event is made: Firefox ignores a DataTransfer filled beforehand
            const event = new ClipboardEvent("paste", { clipboardData: new DataTransfer(), bubbles: true, cancelable: true });
            event.clipboardData.items.add(new File([t], n, { type: "text/plain" }));
            return !box.dispatchEvent(event);
        },
        [text, name]
    );
}

// drop text (no file) on the page, as a selection dragged from another window is
function dropText(page, text, selector = "#drop-zone") {
    return page.evaluate(
        ([t, sel]) => {
            const data = new DataTransfer();
            data.setData("text/plain", t);
            const event = new DragEvent("drop", { dataTransfer: data, bubbles: true, cancelable: true });
            return !document.querySelector(sel).dispatchEvent(event);
        },
        [text, selector]
    );
}

// what the page says when the box may hold a line break that it cannot show (js/lab/verify-page.js)
const HIDDEN_BREAK =
    "The pasted text had a line break of a kind that this box cannot keep, and the text has been changed since. It can no longer be checked here. Empty the box and paste the file again, or choose the file instead.";

// press Verify and wait for the verdict that the press brings: the one on screen (if there is one)
// is marked first, so that a press that did nothing, or a verdict that is only still there, cannot
// pass for a new one
async function pressVerify(page) {
    await page.evaluate(() => {
        const shown = document.querySelector("#verify-result").firstElementChild;
        if (shown) {
            shown.dataset.seen = "yes";
        }
    });
    await page.getByRole("button", { name: "Verify" }).click();
    await expect(page.locator("#verify-result > [data-seen]")).toHaveCount(0);
    await expect(page.locator("#verify-result > .verdict")).toHaveCount(1);
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

    // A file that is chosen or dropped is not put in the box. Verify used to check the empty box then,
    // and put EDITED, "The file is empty.", in the place of the verdict of a valid file.
    test("Verify pressed after a file was chosen or dropped checks that file again: the verdict stays the file's, not an empty box's", async ({ page }) => {
        await page.goto("verify.html");
        const edited = GOOD.replace("12 rows", "13 rows");
        const ways = [
            ["chosen", (text) => chooseFile(page, text)],
            ["dropped", (text) => drop(page, text, "#drop-zone")],
            ["dropped as text", (text) => dropText(page, text)],
        ];
        for (const [way, give] of ways) {
            await give(GOOD);
            await expect(result(page), way).toContainText("VALID");
            await expect(page.locator("#evidence-text"), way).toHaveValue("");
            await pressVerify(page);
            await expect(result(page), way).toContainText("VALID");
            await expect(result(page), way).not.toContainText("EDITED");
            await expect(result(page).locator("dt:has-text('Student number') + dd"), way).toHaveText("U2034567");
            await expect(result(page).locator("dt:has-text('Queries') + dd"), way).toHaveText("2");
            // and again: every press checks the same file
            await pressVerify(page);
            await expect(result(page), way).toContainText("VALID");
            // an edited file keeps its own reason
            await give(edited);
            await expect(result(page), way).toContainText("checksum does not match");
            await pressVerify(page);
            await expect(result(page), way).toContainText("EDITED");
            await expect(result(page), way).toContainText("checksum does not match");
            await expect(result(page), way).not.toContainText("empty");
        }
        // a file that was refused for its size is refused again, in the same words
        await page.locator("#evidence-file").setInputFiles({ name: "big.txt", mimeType: "text/plain", buffer: Buffer.alloc(20 * 1024 * 1024 + 1, 97) });
        await expect(result(page)).toContainText(/too large/i);
        await pressVerify(page);
        await expect(result(page)).toContainText(/too large/i);
        await expect(result(page)).not.toContainText("empty");
        // and so is a file that the browser could not read
        await page.evaluate(() => {
            Blob.prototype.text = () => Promise.reject(new Error("unreadable"));
        });
        await chooseFile(page, GOOD);
        await expect(result(page)).toContainText("The file could not be read as text.");
        await pressVerify(page);
        await expect(result(page)).toContainText("The file could not be read as text.");
        await expect(result(page)).not.toContainText("empty");
    });

    test("Verify checks what was given last: the box once it is changed, and a file given after that until the box is changed again", async ({ page }) => {
        await page.goto("verify.html");
        const box = page.locator("#evidence-text");
        const edited = GOOD.replace("12 rows", "13 rows");
        // typed text after a file: the box is what Verify checks
        await chooseFile(page, GOOD);
        await expect(result(page)).toContainText("VALID");
        await box.fill("not an evidence file");
        await expect(result(page)).toBeEmpty();
        await pressVerify(page);
        await expect(result(page)).toContainText("EDITED");
        await expect(result(page)).not.toContainText("VALID");
        // the box emptied again: the file is not brought back
        await box.fill("");
        await expect(result(page)).toBeEmpty();
        await pressVerify(page);
        await expect(result(page)).toContainText("EDITED");
        await expect(result(page)).toContainText("empty");
        // pasted text after a file: the box holds the pasted text, and Verify checks that
        await chooseFile(page, GOOD);
        await expect(result(page)).toContainText("VALID");
        await paste(page, edited);
        await expect(result(page)).toContainText("checksum does not match");
        await pressVerify(page);
        await expect(result(page)).toContainText("checksum does not match");
        await expect(result(page)).not.toContainText("VALID");
        // and with the pasted text deleted, its verdict goes and nothing is left to check
        await box.fill("");
        await expect(result(page)).toBeEmpty();
        await pressVerify(page);
        await expect(result(page)).toContainText("empty");
        await expect(result(page)).not.toContainText("VALID");
        // a file given while the box holds text: the verdict on screen is the file's, and Verify
        // checks that file again, not the text that was in the box before it
        await box.fill("still not an evidence file");
        await chooseFile(page, GOOD);
        await expect(result(page)).toContainText("VALID");
        await pressVerify(page);
        await expect(result(page)).toContainText("VALID");
        await expect(result(page)).not.toContainText("EDITED");
        await expect(box).toHaveValue("still not an evidence file");
        // until the box is changed: then the box again
        await box.press("End");
        await page.keyboard.type("!");
        await expect(result(page)).toBeEmpty();
        await pressVerify(page);
        await expect(result(page)).toContainText("EDITED");
        await expect(result(page)).not.toContainText("VALID");
        // the same for a file dropped and for one pasted as a file while the box holds a pasted text
        await paste(page, edited);
        await expect(result(page)).toContainText("checksum does not match");
        expect(await drop(page, GOOD, "#drop-zone")).toBe(true);
        await expect(result(page)).toContainText("VALID");
        await pressVerify(page);
        await expect(result(page)).toContainText("VALID");
        await paste(page, edited);
        await expect(result(page)).toContainText("checksum does not match");
        expect(await pasteFile(page, GOOD)).toBe(true);
        await expect(result(page)).toContainText("VALID");
        await pressVerify(page);
        await expect(result(page)).toContainText("VALID");
        await expect(result(page)).not.toContainText("EDITED");
    });

    // A change that leaves the box as it was is no change. Chromium fires an input event for an
    // undo that finds nothing to undo; if that made the box "changed", a press on Verify after a
    // chosen file would check the box again.
    test("an input event that leaves the box as it was changes nothing: the verdict stays, and Verify still checks the file", async ({ page }) => {
        await page.goto("verify.html");
        const noChange = () =>
            page.evaluate(() => {
                const box = document.querySelector("#evidence-text");
                box.dispatchEvent(new InputEvent("input", { inputType: "historyUndo", bubbles: true }));
            });
        await chooseFile(page, GOOD);
        await expect(result(page)).toContainText("VALID");
        await noChange();
        await expect(result(page)).toContainText("VALID");
        await pressVerify(page);
        await expect(result(page)).toContainText("VALID");
        await expect(result(page)).not.toContainText("empty");
        // with text in the box too: the same character typed over itself is the same text
        const box = page.locator("#evidence-text");
        await box.fill("abc");
        await expect(result(page)).toBeEmpty();
        await chooseFile(page, GOOD);
        await expect(result(page)).toContainText("VALID");
        await box.press("End");
        await page.keyboard.press("Shift+ArrowLeft");
        await page.keyboard.type("c");
        await expect(box).toHaveValue("abc");
        await expect(result(page)).toContainText("VALID");
        await pressVerify(page);
        await expect(result(page)).toContainText("VALID");
    });

    // The one way of giving a file that the tests above leave out: pasted into the box as a file.
    test("a file pasted into the box as a file is checked, and Verify then checks that file again", async ({ page }) => {
        await page.goto("verify.html");
        const edited = GOOD.replace("12 rows", "13 rows");
        expect(await pasteFile(page, GOOD)).toBe(true);
        await expect(result(page)).toContainText("VALID");
        await expect(page.locator("#evidence-text")).toHaveValue("");
        await pressVerify(page);
        await expect(result(page)).toContainText("VALID");
        await expect(result(page)).not.toContainText("EDITED");
        // another file pasted: its verdict, and Verify checks that one
        await pasteFile(page, edited);
        await expect(result(page)).toContainText("checksum does not match");
        await pressVerify(page);
        await expect(result(page)).toContainText("checksum does not match");
        await expect(result(page)).not.toContainText("empty");
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
        // a character typed and deleted again leaves the box showing what the paste put there, and
        // Verify still checks the paste: the lone CR is not forgotten (it was, and the file then
        // read as VALID)
        const box = page.locator("#evidence-text");
        await box.press("End");
        await page.keyboard.type("x");
        await expect(result(page)).toBeEmpty();
        await page.keyboard.press("Backspace");
        await expect(box).toHaveValue(GOOD);
        await pressVerify(page);
        await expect(result(page)).toContainText("EDITED");
        await expect(result(page)).not.toContainText("VALID");
        // text that is not what the paste put there: the lone CR may still be in the box, shown as an
        // LF, so the page gives no verdict of the box (it used to check the box's value, in which the
        // CR cannot be seen)
        const other = evidenceFile({ entries: [{ t: "2026-11-09T13:58:12Z", outcome: "3 rows", sql: "SELECT 2;" }], student: "U7654321" });
        await box.fill(other);
        await pressVerify(page);
        await expect(result(page).locator(".verdict-message")).toHaveText(HIDDEN_BREAK);
        await expect(result(page)).not.toContainText("VALID");
        await expect(result(page)).not.toContainText("EDITED");
        // the box emptied: nothing of the paste is left, and text typed afterwards is checked as the
        // box's own value
        await box.fill("");
        await box.fill(other);
        await pressVerify(page);
        await expect(result(page)).toContainText("VALID");
        await expect(result(page).locator("dt:has-text('Student number') + dd")).toHaveText("U7654321");
    });

    // The page knows the text as it was pasted only while the box shows exactly what the paste put
    // there. After that, a lone CR of the paste may still be in the box (shown as an LF) or may be
    // gone, and the page cannot tell which: it gives no verdict until nothing of that paste can be
    // left. A file whose text never had a lone CR is not touched by any of this.
    test("after a paste with a lone CR, a box that was changed is not checked at all, until it is emptied or a paste replaces all of it", async ({ page }) => {
        await page.goto("verify.html");
        const box = page.locator("#evidence-text");
        const i = GOOD.indexOf("\n[1]");
        const changed = `${GOOD.slice(0, i)}\r${GOOD.slice(i + 1)}`;
        const unchecked = async () => {
            await expect(result(page).locator(".verdict--unavailable .verdict-message")).toHaveText(HIDDEN_BREAK);
            await expect(result(page)).not.toContainText("VALID");
            await expect(result(page)).not.toContainText("EDITED");
        };
        // a character typed after the paste, and left there
        await paste(page, changed);
        await expect(result(page)).toContainText("checksum does not match");
        await box.press("End");
        await page.keyboard.type("x");
        await expect(result(page)).toBeEmpty();
        await pressVerify(page);
        await unchecked();
        // a second paste into that box is no better known: it says so at once, and Verify says it again
        await pasteAt(page, "yy", 0, 0);
        await unchecked();
        await pressVerify(page);
        await unchecked();
        // a paste over all of the box leaves nothing of the first: it is checked as it was pasted
        await paste(page, GOOD);
        await expect(result(page)).toContainText("VALID");
        await pressVerify(page);
        await expect(result(page)).toContainText("VALID");
        // the same again, ended by emptying the box: an empty box, then typed text checked as it is
        await paste(page, changed);
        await expect(result(page)).toContainText("checksum does not match");
        await box.press("End");
        await page.keyboard.type("x");
        await pressVerify(page);
        await unchecked();
        await box.press("Control+a");
        await box.press("Delete");
        await expect(box).toHaveValue("");
        await pressVerify(page);
        await expect(result(page)).toContainText("EDITED");
        await expect(result(page)).toContainText("empty");
        await box.fill(GOOD);
        await pressVerify(page);
        await expect(result(page)).toContainText("VALID");
    });

    test("a paste with no lone CR is not held back: CRLF line ends, text typed after it and taken out again, are checked as ever", async ({ page }) => {
        await page.goto("verify.html");
        const box = page.locator("#evidence-text");
        await paste(page, GOOD.replaceAll("\n", "\r\n"));
        await expect(result(page)).toContainText("VALID");
        await box.press("End");
        await page.keyboard.type("x");
        await expect(result(page)).toBeEmpty();
        await pressVerify(page);
        await expect(result(page)).toContainText("EDITED");
        await expect(result(page).locator(".verdict-message")).toHaveCount(0);
        await box.press("End");
        await box.press("Backspace");
        await expect(box).toHaveValue(GOOD);
        await pressVerify(page);
        await expect(result(page)).toContainText("VALID");
        // a line of the file changed by hand: the box's own value, EDITED for its own reason
        await box.fill(GOOD.replace("12 rows", "13 rows"));
        await pressVerify(page);
        await expect(result(page)).toContainText("checksum does not match");
    });

    // A file refused for its size is "given" like any other, so a later file replaces it, and the box forgets it.
    test("a refused file does not stay: a file chosen after it is what Verify checks, and typing in the box forgets the refusal", async ({ page }) => {
        await page.goto("verify.html");
        const verify = page.getByRole("button", { name: "Verify" });
        const box = page.locator("#evidence-text");
        const big = { name: "big.txt", mimeType: "text/plain", buffer: Buffer.alloc(20 * 1024 * 1024 + 1, 97) };
        await page.locator("#evidence-file").setInputFiles(big);
        await expect(result(page)).toContainText(/too large/i);
        await chooseFile(page, GOOD);
        await expect(result(page)).toContainText("VALID");
        await pressVerify(page);
        await expect(result(page)).toContainText("VALID");
        await expect(result(page)).not.toContainText(/too large/i);
        // and the other way: a refusal, then the box used and emptied, is an empty file
        await page.locator("#evidence-file").setInputFiles(big);
        await expect(result(page)).toContainText(/too large/i);
        await box.fill("x");
        await box.fill("");
        await expect(result(page)).toBeEmpty();
        await verify.click();
        await expect(result(page)).toContainText("empty");
        await expect(result(page)).not.toContainText(/too large/i);
    });

    // The input handler used to forget the raw text of a paste on any input event, and Chromium
    // fires one for Ctrl+Z (inputType historyUndo) when the box holds a paste after typed text,
    // although the box's value does not change. The box shows LF where the paste had a lone CR, so
    // Verify then checked a text that is VALID: a file edited by one character was passed.
    test("an undo that changes nothing does not turn the verdict of a pasted file with a lone CR into VALID", async ({ page }) => {
        await page.goto("verify.html");
        const box = page.locator("#evidence-text");
        await box.focus();
        await page.keyboard.type("x");
        const i = GOOD.indexOf("\n[1]");
        await paste(page, `${GOOD.slice(0, i)}\r${GOOD.slice(i + 1)}`);
        await expect(result(page)).toContainText("EDITED");
        await expect(box).toHaveValue(GOOD);
        await page.keyboard.press("Control+z");
        await expect(box).toHaveValue(GOOD);
        await page.evaluate(() => {
            const verdict = document.querySelector("#verify-result").firstElementChild;
            if (verdict) {
                verdict.dataset.seen = "yes";
            }
        });
        await page.getByRole("button", { name: "Verify" }).click();
        await expect(page.locator("#verify-result > .verdict:not([data-seen])")).toHaveCount(1);
        await expect(result(page)).toContainText("EDITED");
        await expect(result(page)).not.toContainText("VALID");
    });

    // The text of a paste goes into the box at `start` to `end` (a paste into text that is already there).
    const pasteAt = (page, text, start, end) =>
        page.evaluate(
            ([t, s, e]) => {
                const box = document.querySelector("#evidence-text");
                box.focus();
                box.setSelectionRange(s, e);
                const event = new ClipboardEvent("paste", { clipboardData: new DataTransfer(), bubbles: true, cancelable: true });
                event.clipboardData.setData("text/plain", t);
                box.dispatchEvent(event);
            },
            [text, start, end]
        );

    // A paste after a paste is spliced into the raw text of the first, so the lone CR of the first stays.
    test("a text pasted after the first part of a file with a lone CR is checked as one text, with the CR", async ({ page }) => {
        await page.goto("verify.html");
        const i = GOOD.indexOf("\n[1]");
        const changed = `${GOOD.slice(0, i)}\r${GOOD.slice(i + 1)}`;
        const cut = GOOD.indexOf("student:");
        await paste(page, changed.slice(0, cut));
        await expect(result(page)).toContainText("EDITED");
        await pasteAt(page, changed.slice(cut), cut, cut);
        await expect(page.locator("#evidence-text")).toHaveValue(GOOD);
        await expect(result(page)).toContainText("checksum does not match");
        await expect(result(page)).not.toContainText("VALID");
        await pressVerify(page);
        await expect(result(page)).toContainText("checksum does not match");
        await expect(result(page)).not.toContainText("VALID");
    });

    // The wait for a check is held in the page (the digest is the one slow step), so that the order of
    // what happens is the test's and not the machine's. "__started" counts the checks that have begun,
    // "__digests" those that have finished their digest; the macrotask after the last one has run every
    // step that follows it.
    const holdDigest = (page) =>
        page.addInitScript(() => {
            const subtle = crypto.subtle;
            const real = subtle.digest.bind(subtle);
            window.__gate = null;
            window.__started = 0;
            window.__digests = 0;
            subtle.digest = async (...args) => {
                window.__started++;
                if (window.__gate) {
                    await window.__gate;
                }
                const out = await real(...args);
                window.__digests++;
                return out;
            };
        });
    const holdNext = (page) =>
        page.evaluate(() => {
            window.__gate = new Promise((release) => (window.__release = release));
        });
    const releaseAndSettle = async (page, finished) => {
        await page.evaluate(() => window.__release());
        await page.waitForFunction((n) => window.__digests === n, finished);
        await page.evaluate(() => new Promise((done) => setTimeout(done, 0)));
    };

    test("a check that is still running when the box changes does not show its verdict", async ({ page }) => {
        await holdDigest(page);
        await page.goto("verify.html");
        await holdNext(page);
        await paste(page, GOOD);
        await page.waitForFunction(() => window.__started === 1);
        await page.keyboard.type("x");
        await releaseAndSettle(page, 1);
        // the verdict of the text as it was pasted (VALID) is not the verdict of the text in the box
        await expect(result(page)).toBeEmpty();
        await pressVerify(page);
        await expect(result(page)).toContainText("EDITED");
    });

    test("a refusal is not replaced by the verdict of a file whose check was still running", async ({ page }) => {
        await holdDigest(page);
        await page.goto("verify.html");
        await holdNext(page);
        await chooseFile(page, GOOD);
        await page.waitForFunction(() => window.__started === 1);
        await page.locator("#evidence-file").setInputFiles({ name: "big.txt", mimeType: "text/plain", buffer: Buffer.alloc(20 * 1024 * 1024 + 1, 97) });
        await expect(result(page)).toContainText(/too large/i);
        await releaseAndSettle(page, 1);
        await expect(result(page)).toContainText(/too large/i);
        await expect(result(page)).not.toContainText("VALID");
    });

    test("the message of a box that cannot be checked is not replaced by the verdict of a file whose check was still running", async ({ page }) => {
        await holdDigest(page);
        await page.goto("verify.html");
        const i = GOOD.indexOf("\n[1]");
        await paste(page, `${GOOD.slice(0, i)}\r${GOOD.slice(i + 1)}`);
        await expect(result(page)).toContainText("checksum does not match");
        await page.locator("#evidence-text").press("End");
        await page.keyboard.type("x");
        await expect(result(page)).toBeEmpty();
        // a valid file is chosen and its check is held; a paste into the box, which cannot be checked,
        // comes before that check ends
        await holdNext(page);
        await chooseFile(page, GOOD);
        await page.waitForFunction(() => window.__started === 2);
        await pasteAt(page, "yy", 0, 0);
        await expect(result(page).locator(".verdict-message")).toHaveText(HIDDEN_BREAK);
        await releaseAndSettle(page, 2);
        await expect(result(page).locator(".verdict-message")).toHaveText(HIDDEN_BREAK);
        await expect(result(page)).not.toContainText("VALID");
    });

    test("a file input is emptied after a choice, so that the same file chosen again is a new choice", async ({ page }) => {
        await page.goto("verify.html");
        await chooseFile(page, GOOD);
        await expect(result(page)).toContainText("VALID");
        await expect(page.locator("#evidence-file")).toHaveValue("");
    });

    test("a verdict for text that was changed does not come back when the box is typed back to what was pasted", async ({ page }) => {
        await page.goto("verify.html");
        const box = page.locator("#evidence-text");
        await paste(page, GOOD);
        await expect(result(page)).toContainText("VALID");
        await page.keyboard.type("x");
        await expect(result(page)).toBeEmpty();
        await pressVerify(page);
        await expect(result(page)).toContainText("EDITED");
        // the box is what the paste put there again: the verdict of the text with the x in it must go
        await box.press("End");
        await page.keyboard.press("Backspace");
        await expect(box).toHaveValue(GOOD);
        await expect(result(page)).toBeEmpty();
    });

    // The page used to keep the raw text of the last paste only, and to check the box's value once
    // the box showed anything else. So a second paste (a few characters, or the whole file again by
    // mistake) replaced the record of the first, and when it was taken out again the box showed the
    // text of the first with LF for its lone CR: Verify read VALID for a file that was edited.
    test("a text pasted after a file with a lone CR and taken out again does not turn the file into VALID", async ({ page }) => {
        await page.goto("verify.html");
        const i = GOOD.indexOf("\n[1]");
        const changed = `${GOOD.slice(0, i)}\r${GOOD.slice(i + 1)}`;
        await paste(page, changed);
        await expect(result(page)).toContainText("checksum does not match");
        await pasteAt(page, "zz", GOOD.length, GOOD.length);
        await expect(result(page)).toContainText("EDITED");
        await page.keyboard.press("Backspace");
        await page.keyboard.press("Backspace");
        await expect(page.locator("#evidence-text")).toHaveValue(GOOD);
        await pressVerify(page);
        await expect(result(page).locator(".verdict-message")).toHaveText(HIDDEN_BREAK);
        await expect(result(page)).not.toContainText("VALID");
        // the file pasted a second time after itself by mistake, and the second copy deleted
        await paste(page, changed);
        await expect(result(page)).toContainText("checksum does not match");
        await pasteAt(page, changed, GOOD.length, GOOD.length);
        await expect(result(page)).toContainText("EDITED");
        await page.evaluate((length) => {
            const box = document.querySelector("#evidence-text");
            box.focus();
            box.setSelectionRange(length, box.value.length);
        }, GOOD.length);
        await page.keyboard.press("Delete");
        await expect(page.locator("#evidence-text")).toHaveValue(GOOD);
        await pressVerify(page);
        await expect(result(page).locator(".verdict-message")).toHaveText(HIDDEN_BREAK);
        await expect(result(page)).not.toContainText("VALID");
        // pasted again over everything, the file is checked as it was pasted
        await paste(page, changed);
        await expect(result(page)).toContainText("checksum does not match");
        await expect(result(page)).not.toContainText("VALID");
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
