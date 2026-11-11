const { test, expect, evidenceFile, realManifest } = require("./helpers");

// F11 evidence export through the real UI (the Export menu item, the dialog, the download event)
// and the verify page. The file format and the single-character-edit sweep over every
// position are in m5-evidence-format.spec.js; verify.html itself is in m5-verify-page.spec.js.

const STUDENT = "U2034567";
const HEADER = /^\[(\d+)\] (\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z) · (.*)$/;

// the text of the verify page's result region
const verdict = (page) => page.locator("#verify-result");

// feed a file to verify.html through its file input
async function chooseFile(page, text, name = "evidence.txt") {
    await page.locator("#evidence-file").setInputFiles({ name, mimeType: "text/plain", buffer: Buffer.from(text) });
}

// paste text into verify.html's box the way a browser does: a paste event with the raw
// clipboard text (a textarea value would already have turned a lone CR into LF)
async function pasteText(page, text) {
    await page.evaluate((t) => {
        const box = document.querySelector("#evidence-text");
        box.focus();
        box.select(); // Ctrl+A, Ctrl+V
        // the text goes in after the event is made: Firefox ignores a DataTransfer filled beforehand
        const event = new ClipboardEvent("paste", { clipboardData: new DataTransfer(), bubbles: true, cancelable: true });
        event.clipboardData.setData("text/plain", t);
        box.dispatchEvent(event);
    }, text);
}

test("AC10 three runs, one erroring: the exported file holds all three and verify.html says VALID", async ({
    page,
    app,
}) => {
    await app.open();
    await app.query("SELECT category, COUNT(*) FROM products GROUP BY category;");
    await app.run("SELECT pric FROM products;");
    await expect(app.errorBand).toContainText("no such column: pric");
    await app.query("SELECT 1 AS one\nUNION ALL\nSELECT 2;");

    const file = await app.exportEvidence(STUDENT);
    expect(file.name).toBe("evidence-northlight.txt");
    expect(file.text).not.toContain("\r");
    expect(file.text.endsWith("\n")).toBe(true);
    expect(file.text.endsWith("\n\n")).toBe(false);

    const lines = file.text.split("\n");
    expect(lines[0]).toBe("SQL Lab evidence export v1");
    expect(lines[1]).toBe("dataset: northlight");
    expect(lines[2]).toMatch(/^exported: \d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/);
    expect(lines[3]).toBe("");

    const headers = lines.map((l, i) => [HEADER.exec(l), i]).filter(([m]) => m);
    expect(headers.map(([m]) => m[1])).toEqual(["1", "2", "3"]);
    expect(headers.map(([m]) => m[3])).toEqual(["5 rows", "error: no such column: pric", "2 rows"]);
    const [first, second, third] = headers.map(([, i]) => i);
    expect(lines[first + 1]).toBe("SELECT category, COUNT(*) FROM products GROUP BY category;");
    expect(lines[first + 2]).toMatch(/^link: http:\/\/127\.0\.0\.1:\d+\/(repo\/)?(index\.html)?#s=[A-Za-z0-9+\-$]+$/);
    expect(lines[first + 3]).toBe("");
    // an error entry has no link line
    expect(lines.slice(second, third)).toEqual([
        lines[second],
        "SELECT pric FROM products;",
        "",
    ]);
    // multi-line SQL stays as it was typed, one line each
    expect(lines.slice(third + 1, third + 4)).toEqual(["SELECT 1 AS one", "UNION ALL", "SELECT 2;"]);
    expect(lines.slice(-4)).toEqual(["", `student: ${STUDENT}`, expect.stringMatching(/^sha256: [0-9a-f]{64}$/), ""]);

    // the whole file is what a second implementation (tests/helpers.js evidenceFile) writes for
    // the same entries, checksum included
    const entries = headers.map(([m, i], n) => {
        const end = headers[n + 1]?.[1] ?? lines.length - 3;
        const block = lines.slice(i + 1, end - 1); // without the blank line that ends the entry
        const link = block.length && block[block.length - 1].startsWith("link: ") ? block.pop().slice(6) : undefined;
        return { t: m[2], outcome: m[3], sql: block.join("\n"), link };
    });
    expect(entries.map((e) => !!e.link)).toEqual([true, false, true]);
    expect(file.text).toBe(evidenceFile({ exported: lines[2].slice("exported: ".length), entries }));

    // verify.html: VALID, with the entered number, the count and the export time
    await page.goto("verify.html");
    await chooseFile(page, file.text, file.name);
    await expect(verdict(page)).toContainText("VALID");
    await expect(verdict(page)).not.toContainText("EDITED");
    await expect(verdict(page)).toContainText(STUDENT);
    await expect(verdict(page).locator("dt:has-text('Queries') + dd")).toHaveText("3");
    await expect(verdict(page).locator("dt:has-text('Exported') + dd")).toHaveText(lines[2].slice("exported: ".length));
    await expect(verdict(page).locator("dt:has-text('Dataset') + dd")).toHaveText("northlight");
});

// Positions that cover each kind of line, as [label, index into the file text, replacement].
// Built from the exported text, so the sample follows the file's real layout.
function samples(text) {
    const at = (needle, offset = 0) => {
        const i = text.indexOf(needle);
        expect(i, needle).toBeGreaterThanOrEqual(0);
        return i + offset;
    };
    const lastLf = text.length - 1;
    const hexAt = text.lastIndexOf("sha256: ") + 8;
    const letterInHex = hexAt + [...text.slice(hexAt, hexAt + 64)].findIndex((c) => /[a-f]/.test(c));
    const rows = [
        ["first line", 0, "X"],
        ["first line end", at(" evidence export v1", 5), "Q"],
        ["dataset line", at("dataset: ", 9), "z"],
        ["exported line digit", at("exported: ", 13), "9"],
        ["blank line gets a space", at("\n\n[1]", 1), " "],
        ["entry header number", at("[1]", 1), "7"],
        ["entry header timestamp", at("[1] ", 5), "9"],
        ["entry header middle dot", at(" · ", 1), "-"],
        ["entry header rows", at(" rows\n", 1), "R"],
        ["error message", at("error: no such", 8), "N"],
        ["sql", at("SELECT 1 AS one", 7), "2"],
        ["sql keyword", at("UNION ALL", 1), "n"],
        ["link", at("link: ", 10), "h"],
        ["student value", at("student: ", 10), "9"],
        ["student label", at("student: ", 1), "T"],
        ["sha value first digit", hexAt, text[hexAt] === "0" ? "1" : "0"],
        ["sha value last digit", hexAt + 63, text[hexAt + 63] === "0" ? "1" : "0"],
        ["sha label", at("sha256:", 2), "A"],
        ["hex digit upper-cased", letterInHex, text[letterInHex].toUpperCase()],
        ["a newline becomes a space", at("exported: ", 30), " "],
        ["a newline becomes CR", at("exported: ", 30), "\r"],
        ["last newline becomes a space", lastLf, " "],
        ["last newline becomes CR", lastLf, "\r"],
        ["newline before student becomes a space", text.lastIndexOf("\nstudent: "), " "],
        ["newline before student becomes CR", text.lastIndexOf("\nstudent: "), "\r"],
    ];
    // a replacement must be a different character
    return rows.map(([label, i, r]) => [label, i, r === text[i] ? "~" : r]);
}

test("AC10 changing a single character of the exported file makes verify.html say EDITED (file input and paste)", async ({
    page,
    app,
}) => {
    await app.open();
    await app.query("SELECT category, COUNT(*) FROM products GROUP BY category;");
    await app.run("SELECT pric FROM products;");
    await expect(app.errorBand).toContainText("no such column: pric");
    await app.query("SELECT 1 AS one\nUNION ALL\nSELECT 2;");
    const { text } = await app.exportEvidence(STUDENT);

    await page.goto("verify.html");
    // sanity: the unchanged file is VALID by both routes
    await chooseFile(page, text);
    await expect(verdict(page)).toContainText("VALID");
    await pasteText(page, text);
    await expect(verdict(page)).toContainText("VALID");

    for (const [label, index, replacement] of samples(text)) {
        expect(text[index], `${label}: the replacement changes the character`).not.toBe(replacement);
        const changed = text.slice(0, index) + replacement + text.slice(index + 1);

        await chooseFile(page, "not an evidence file"); // clear the previous verdict first
        await expect(verdict(page)).toContainText("EDITED");
        await chooseFile(page, changed, `${label}.txt`);
        await expect(verdict(page), `${label} by file`).toContainText("EDITED");
        await expect(verdict(page), `${label} by file`).not.toContainText("VALID");

        await chooseFile(page, text); // back to VALID, so the paste cannot reuse the old verdict
        await expect(verdict(page)).toContainText("VALID");
        await pasteText(page, changed);
        await expect(verdict(page), `${label} by paste`).toContainText("EDITED");
        await expect(verdict(page), `${label} by paste`).not.toContainText("VALID");
    }
});
