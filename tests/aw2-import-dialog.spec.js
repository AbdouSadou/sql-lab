const fs = require("node:fs");
const path = require("node:path");
const { pathToFileURL } = require("node:url");
const AxeBuilder = require("@axe-core/playwright").default;
const { test, expect, fixturePath, expectedFor, fixtureIndex, SAMPLE_FILE } = require("./helpers");

// Assessment plan, Phase 2 (import CSV): the import's dialog (section 3, "Preview dialog" and
// "Names"; section 7, "Large files"; the headers of js/lab/import-dialog.js and import.js). What
// the files pin is how the dialog behaves, not what an import makes: another spec reads the
// tables. Little is imported here; most tests only open the dialog, look at it, and close it.
//
// Every test drives the real page, with the flag on (?preview=import), so each runs in all four
// projects; nothing here is Node-only. The files are the owner's fixtures (tests/fixtures/, never
// edited) and a few made in the test: a buffer in Node, or a file made inside the page for the
// size limits (no bytes travel; the sizes are typed here as the plan gives them, 50 MB and 250
// MB, and not read from the settings: a limit changed there must fail here). The preview is
// compared with the file's own text, parsed by a small reader in this file, and with the
// expected files where they hold the text as written. A dialog that is open is closed with
// Escape or Cancel before the next file is chosen.
//
// The sections from 10 on pin later fixes of the dialog (CODEMAP 9.6, the headers
// of js/lab/import-dialog.js and import.js): 10 the dialog is a body that scrolls and, under it
// and never over it, a foot that does not (the title, the destination, the tabs and the progress
// scroll; the line that says why Import is off, the line that says what went wrong, Import and
// Cancel stay): the dialog itself does not scroll; no control that Tab or Shift+Tab reaches is cut
// off by the body's edge or lies under the foot, whole when it fits, and one that was in view
// moves by the air of its focus ring at most, in three window sizes (at those sizes: by itself
// Firefox can take a control that lay within that air of the edge to the end of the scroll, at
// one stop in the thousands tried elsewhere, and that is the browser's own); a button of the foot takes
// the focus without scrolling anything; a pointer that presses a control at the body's edge does
// not move it (a double click in a field, a click on a tick box or its label) while the keyboard
// brings the same control wholly into view; the two lines of the foot are in view when they are
// shown; the dialog is aria-busy only while the import runs. Also in 10: after a press of the mouse
// the keyboard still brings the preview wholly into the body (Firefox, 1280x800 and 683x384) and
// a control the keyboard brings in ends clear of the body's edge by its focus ring and its air; at
// 400x100, where the foot alone is higher than the dialog, the tabs can be clicked and every
// control and both buttons can be seen. Also in 10 a field with white space
// at an end is underlined in every theme;
// 11 a reading that the student's own delimiter or encoding made impossible is said in the tab
// (and a file that holds no complete row in its first megabyte is refused at once); 12 Import
// waits for the newest reading of a tab, and an older one that ends last changes nothing (the
// readings are held and let go by the test, no timer); 13 the focus and the names after a
// refusal; 14 the line that says why Import is off, and that it waits 600 ms before it says a
// file is still being read (the page's clock is the test's); 15 a file that was saved again after
// its preview (in a folder made for the test); 16 a second byte-order mark; 17 the whole name in
// the tab's title, and a tab is never wider than the strip (320 px) nor than 16rem (1280 px). The axe checks (section 9)
// also run with a problem line and with a hold line on show, with the reading state, the large-file step and a
// left-out tab on show. In 7 a file over 50 MB has two answers, Read this file and Leave this file out (in that
// order): leaving it out makes its tab a refused one in the words "left out", with the reason, the focus on the
// tab and only Close, gives the names and the database's name again, lets the others be imported, and the answer
// is that opening's alone; in 14 leaving it out takes the line of the hold away. Also in 7 what a file is
// comes before how large it is, and the bytes say it, not the name: a workbook's first bytes under a
// .csv or .txt name are refused as a workbook at 50 MB and at 250 MB, with no question, and a text under
// a .xls or .xlsx name is held to the text limits. The texts are read from js/lab/config-workflow.js.
// Also in 2 the preview cuts a field of more than 80 characters (the row of names too) and keeps the
// whole in its title, one of exactly 80 whole with none; in 4 the name of an index the open database has
// is taken like a table's or a view's (suggested as _2, refused when typed, free in a new database).
//
// 18 holds what a sweep of the code by mutation showed no test held, in the first half of
// js/lab/import-dialog.js (its top to the end of buildControls): the order of the parts and what a
// screen reader is told, limits and names, what stays set across a new reading, a reading that
// fails at each of its steps, the pass over a file (one file after the other, stopped when the
// dialog closes, in slices of INSPECT_SLICE_BYTES), an encoding while it is checked, a large file
// once it is being read, and the megabyte of the preview. 19 is the same for the second half (from
// draw to the end): the box of the names row and the numbers over the preview's columns, names given
// again, the first of two names that cannot be, a file called .csv, and what the dialog keeps from
// one opening to the next (nothing: the typed name of the database, the tabs, the line of a failure).
// Also in 9: only a repeat of Enter is taken away in the dialog (a held letter, Backspace or arrow key in
// the table's name still repeats).

const OPEN = "./?preview=import";
const MB = 1024 * 1024;
const READER_URL = "**/vendor/papaparse.min.js";

// the texts the student sees are read from js/lab/config-workflow.js, never typed again
const load = (file) => import(pathToFileURL(path.join(__dirname, "..", "js", "lab", file)).href);
let words;
test.beforeAll(async () => {
    words = await load("config-workflow.js");
});

const csv = (name, text = "a,b\n1,2\n") => ({ name, mimeType: "text/csv", buffer: Buffer.from(text) });
// A file that Papa reads with the pipe: the commas differ from row to row, the pipes do not. Read
// with the comma, its rows have more than 2,000 fields: a reading the student's own choice of
// delimiter makes impossible (the file as it is has a way that works, so it is not refused).
const WIDE_TEXT = `${Array.from({ length: 2500 }, (_, i) => `c${i}`).join(",")}|x\n${Array.from({ length: 2300 }, (_, i) => i).join(",")}|y\n${Array.from({ length: 2100 }, (_, i) => i).join(",")}|z\n`;
const wide = (name = "wide.csv") => csv(name, WIDE_TEXT);
// ASCII text of more than 1 MB (PREVIEW_BYTES) and an even length: whole in no preview, and the
// bytes of a UTF-16 text all the same
function bigAscii(name = "bigtext.csv") {
    let text = "id,name\n";
    while (text.length < 1.2 * MB) {
        text += "1,abc\n";
    }
    if (text.length % 2) {
        text += "\n";
    }
    return csv(name, text);
}
// a workbook, whatever it is called: it is refused until the plan's Phase 5
const WORKBOOK = fixturePath("shopping_db.xlsx");

// ---- helpers ------------------------------------------------------------------------------------

// openDialog opens the page with the flag on, chooses the files, and waits until every one has
// been looked at (a tab that is still being read says so)
async function openDialog(app, files, { address = OPEN } = {}) {
    await app.open(address);
    await app.chooseFiles(files);
    await expect(app.importDialog).toBeVisible();
    await expect(app.importDialog.locator(".import-reading")).toHaveCount(0);
}

// the page with the flag on and sample.db open: its tables fruit and tags, and its view v_priced
async function openSample(app) {
    await app.open(OPEN);
    await app.upload(SAMPLE_FILE);
}

// the tab of a refused file: its name, then "(cannot be imported)", the words that a screen reader adds
const escaped = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const refusedTab = (app, name) =>
    app.page.getByRole("tab", { name: new RegExp(`^${escaped(name)} \\(${escaped(words.IMPORT_REFUSED_TAB_TEXT)}\\)$`) });
const field = (app, label) => app.importPanel.getByLabel(label, { exact: true });
const tableName = (app) => field(app, "Table name");
const namesRow = (app) => field(app, "Column names are on row");
const delimiterOf = (app) => field(app, "Delimiter");
const encodingOf = (app) => field(app, "Text encoding");
const problemLine = (app) => app.importPanel.locator(".import-problem");
const holdLine = (app) => app.importDialog.locator("#import-hold");
const hasNames = (app) => field(app, "The file has a row of column names");
const note = (app) => app.importPanel.locator(".import-preview-note");
const alertIn = (app, text) => app.importPanel.getByRole("alert").filter({ hasText: text });
// the text of the option that a select shows
const shown = (select) => select.evaluate((el) => el.selectedOptions[0].textContent);

// the tab of the file called name, selected
async function selectTab(app, name) {
    await app.importTabs.filter({ hasText: name }).click();
}

// the rows of the preview as drawn: number, tag, the text of each cell, which cells are marked for
// white space at an end, and which say NULL or "blank" because the field is empty
function previewRows(app) {
    return app.importPanel.locator(".import-preview-table tbody tr").evaluateAll((trs) =>
        trs.map((tr) => {
            const cells = [...tr.querySelectorAll("td")];
            return {
                number: tr.querySelector(".import-row-number").textContent,
                tag: tr.querySelector(".import-row-tag")?.textContent ?? "",
                cells: cells.map((td) => td.textContent),
                marked: cells.map((td) => td.classList.contains("import-cell--spaces")),
                empty: cells.map((td) => Boolean(td.querySelector(".cell-null"))),
            };
        })
    );
}

// a small reader of CSV text, apart from the page's own: quotes, doubled quotes, line breaks in
// a quoted field, CRLF or LF; an empty line is skipped
function parseCsv(text, delimiter = ",") {
    const rows = [];
    let row = [];
    let field = "";
    let quoted = false;
    for (let i = 0; i < text.length; i++) {
        const ch = text[i];
        if (quoted) {
            if (ch === '"' && text[i + 1] === '"') {
                field += '"';
                i++;
            } else if (ch === '"') {
                quoted = false;
            } else {
                field += ch;
            }
        } else if (ch === '"' && field === "") {
            quoted = true;
        } else if (ch === delimiter) {
            row.push(field);
            field = "";
        } else if (ch === "\n" || ch === "\r") {
            if (ch === "\r" && text[i + 1] === "\n") {
                i++;
            }
            row.push(field);
            if (!(row.length === 1 && row[0] === "")) {
                rows.push(row);
            }
            row = [];
            field = "";
        } else {
            field += ch;
        }
    }
    if (field !== "" || row.length) {
        row.push(field);
        rows.push(row);
    }
    return rows;
}

// Files made inside the page for the size limits: no bytes travel. Every read of a large file
// (slice, arrayBuffer, stream, text) is noted, so that a test can say what was read and when.
// spec: {name, size} zeros; {name, text} a small text file; {name, megabytes: n} real text of
// about n MB (a header, then lines);
// {name, size, shared: true} zeros built from one shared megabyte, for a very large file;
// {name, size, start: [bytes]} (with or without shared) a file that begins with those bytes and
// goes on with zeros, for the first bytes of a workbook.
async function dropMade(page, specs) {
    return page.evaluate((list) => {
        window.__reads = [];
        if (!window.__spied) {
            window.__spied = true;
            for (const method of ["slice", "arrayBuffer", "stream", "text"]) {
                const original = Blob.prototype[method];
                Blob.prototype[method] = function spied(...args) {
                    if (this.size > 40 * 1024 * 1024) {
                        window.__reads.push({ method, size: this.size, start: args[0], end: args[1] });
                    }
                    return original.apply(this, args);
                };
            }
        }
        const data = new DataTransfer();
        for (const spec of list) {
            let parts;
            if (spec.text !== undefined) {
                parts = [spec.text];
            } else if (spec.megabytes) {
                const line = "1,abc\n";
                const piece = new Blob([line.repeat(Math.floor((1024 * 1024) / line.length))]);
                parts = [new Blob(["id,name\n"]), ...Array(spec.megabytes).fill(piece)];
            } else {
                // the bytes it begins with, then zeros
                const head = spec.start ? [new Uint8Array(spec.start)] : [];
                const rest = spec.size - (spec.start ? spec.start.length : 0);
                if (spec.shared) {
                    const piece = new Blob([new Uint8Array(1024 * 1024)]);
                    const whole = Math.floor(rest / (1024 * 1024));
                    parts = [...head, ...Array(whole).fill(piece), new Uint8Array(rest - whole * 1024 * 1024)];
                } else {
                    parts = [...head, new Uint8Array(rest)];
                }
            }
            data.items.add(new File(parts, spec.name));
        }
        const fire = (type) => {
            const event = new DragEvent(type, { dataTransfer: data, bubbles: true, cancelable: true });
            document.body.dispatchEvent(event);
            return event.defaultPrevented;
        };
        fire("dragover");
        return fire("drop");
    }, specs);
}

// how many bytes of a large file the page has asked for so far
async function bytesRead(page) {
    return page.evaluate(() =>
        window.__reads.reduce((sum, read) => {
            if (read.method !== "slice") {
                return sum + read.size;
            }
            const end = Math.min(read.end ?? read.size, read.size);
            return sum + Math.max(0, end - (read.start ?? 0));
        }, 0)
    );
}

// what the open database holds, tables, views and the temporary ones too
const schemaNow = (app) =>
    app.rows("SELECT type, name FROM sqlite_master UNION ALL SELECT 'temp ' || type, name FROM sqlite_temp_master ORDER BY 1, 2");

// ---- 1. its shape and its words ---------------------------------------------------------------------

test.describe("the dialog: its shape and its words", () => {
    test("it is a modal dialog named Import files, described by its one sentence", async ({ app }) => {
        await openDialog(app, fixturePath("messy_sales.csv"));
        const dialog = app.page.getByRole("dialog", { name: "Import files" });
        await expect(dialog).toBeVisible();
        expect(await dialog.evaluate((el) => el.matches(":modal"))).toBe(true);
        await expect(dialog).toHaveAccessibleDescription("Each file becomes a table, read as it is: nothing in it is cleaned or changed.");
    });

    test("nothing opens until files are chosen: the dialog is closed and holds no tab", async ({ app, page }) => {
        await app.open(OPEN);
        expect(await page.evaluate(() => document.querySelector("dialog[open]"))).toBeNull();
        await expect(app.page.getByRole("dialog", { name: words.IMPORT_DIALOG_TITLE })).toHaveCount(0);
    });

    test("each file has a tab named after it in a tablist labelled Files, and the selected tab controls the visible panel", async ({ app }) => {
        await openDialog(app, [fixturePath("messy_sales.csv"), fixturePath("semicolon.csv"), fixturePath("csv/tab_delimited.tsv")]);
        const list = app.importDialog.getByRole("tablist", { name: "Files" });
        await expect(list).toBeVisible();
        await expect(list.getByRole("tab")).toHaveText(["messy_sales.csv", "semicolon.csv", "tab_delimited.tsv"]);
        const first = app.importTabs.nth(0);
        await expect(first).toHaveAttribute("aria-selected", "true");
        const panelId = await first.getAttribute("aria-controls");
        const panel = app.importDialog.locator(`[id="${panelId}"]`);
        await expect(panel).toHaveAttribute("role", "tabpanel");
        await expect(panel).toBeVisible();
        await expect(app.importDialog.getByRole("tabpanel", { name: "messy_sales.csv" })).toBeVisible();
        // the others are not shown
        await expect(app.importDialog.getByRole("tabpanel")).toHaveCount(1);
        await expect(app.importDialog.locator('[role="tabpanel"]')).toHaveCount(3);
    });

    test("ArrowRight, ArrowLeft, Home and End move between the tabs and select them; only the selected tab is a Tab stop", async ({ app, page }) => {
        await openDialog(app, [fixturePath("messy_sales.csv"), fixturePath("semicolon.csv"), fixturePath("csv/tab_delimited.tsv")]);
        const tabs = app.importTabs;
        await expect(tabs.nth(0)).toBeFocused();
        const state = async () => ({
            selected: await tabs.evaluateAll((all) => all.map((tab) => tab.getAttribute("aria-selected"))),
            stops: await tabs.evaluateAll((all) => all.map((tab) => tab.tabIndex)),
        });
        expect(await state()).toEqual({ selected: ["true", "false", "false"], stops: [0, -1, -1] });

        await page.keyboard.press("ArrowRight");
        await expect(tabs.nth(1)).toBeFocused();
        expect(await state()).toEqual({ selected: ["false", "true", "false"], stops: [-1, 0, -1] });
        await expect(app.importDialog.getByRole("tabpanel", { name: "semicolon.csv" })).toBeVisible();

        await page.keyboard.press("End");
        await expect(tabs.nth(2)).toBeFocused();
        expect(await state()).toEqual({ selected: ["false", "false", "true"], stops: [-1, -1, 0] });
        await expect(app.importDialog.getByRole("tabpanel", { name: "tab_delimited.tsv" })).toBeVisible();

        await page.keyboard.press("ArrowLeft");
        await expect(tabs.nth(1)).toBeFocused();
        await page.keyboard.press("Home");
        await expect(tabs.nth(0)).toBeFocused();
        expect(await state()).toEqual({ selected: ["true", "false", "false"], stops: [0, -1, -1] });
    });

    test("a refused file has a tab that ends in '(cannot be imported)' for a screen reader, and its panel holds the reason", async ({ app }) => {
        await openDialog(app, [fixturePath("messy_sales.csv"), WORKBOOK]);
        const refused = refusedTab(app, "shopping_db.xlsx");
        await expect(refused).toBeVisible();
        // the file that can be imported has no such ending
        await expect(app.page.getByRole("tab", { name: "messy_sales.csv", exact: true })).toBeVisible();
        await refused.click();
        const reason = app.page.getByRole("tabpanel", { name: /^shopping_db\.xlsx \(cannot be imported\)$/ });
        await expect(reason).toBeVisible();
        await expect(reason).toContainText("Excel");
        // the panel of a refused file has no settings to change
        await expect(reason.getByLabel(words.IMPORT_TABLE_NAME_LABEL)).toHaveCount(0);
    });
});

// ---- 2. the preview shows the first rows exactly as read ---------------------------------------------------

test.describe("the preview", () => {
    test("shows messy_sales.csv as it is written: row 1 holds the column names, an empty field reads NULL, at most 20 rows of data", async ({ app }) => {
        await openDialog(app, fixturePath("messy_sales.csv"));
        const text = fs.readFileSync(fixturePath("messy_sales.csv"), "utf8");
        const parsed = parseCsv(text);
        // the file holds 23 lines of a table: one of names and 22 of data
        expect(parsed.length).toBe(23);
        const rows = await previewRows(app);
        expect(rows.map((row) => row.number)).toEqual(Array.from({ length: 21 }, (_, i) => String(i + 1)));
        expect(rows[0].tag).toBe("column names");
        expect(rows.slice(1).map((row) => row.tag)).toEqual(Array(20).fill(""));

        const width = Math.max(...parsed.slice(0, 21).map((row) => row.length));
        parsed.slice(0, 21).forEach((fields, i) => {
            // an empty field reads NULL; in the row of names the product says "blank" (see the report)
            const none = i === 0 ? "blank" : "NULL";
            const wanted = Array.from({ length: width }, (_, c) => (fields[c] === undefined || fields[c] === "" ? none : fields[c]));
            expect(rows[i].cells, `row ${i + 1}`).toEqual(wanted);
            expect(rows[i].empty, `row ${i + 1}: which cells read NULL`).toEqual(wanted.map((cell, c) => fields[c] === undefined || fields[c] === ""));
        });
    });

    test("keeps the text of messy_sales.csv as written before any typing: 00123, £1,234.50, padded names", async ({ app }) => {
        await openDialog(app, fixturePath("messy_sales.csv"));
        const expected = expectedFor("messy_sales.csv").tables[0];
        const rows = await previewRows(app);
        // every TEXT column of the expected file holds the text as written: the preview says the same
        expected.columns.forEach((column, c) => {
            if (column.type !== "TEXT") {
                return;
            }
            expected.data.slice(0, 20).forEach((data, i) => {
                const wanted = data[c] === null ? "NULL" : data[c];
                expect(rows[i + 1].cells[c], `${column.name}, data row ${i + 1}`).toBe(wanted);
            });
        });
        expect(rows[1].cells[0]).toBe("00123");
        expect(rows[1].cells[3]).toBe("£1,234.50");
        expect(rows[1].cells[2]).toBe("05/08/2023");
    });

    test("marks a field with white space at an end, and no other", async ({ app }) => {
        await openDialog(app, fixturePath("messy_sales.csv"));
        const parsed = parseCsv(fs.readFileSync(fixturePath("messy_sales.csv"), "utf8"));
        const rows = await previewRows(app);
        const names = rows.map((row) => row.cells[1]);
        // "Aisha Khan  " (row 3) and "  Li Wei" (row 6)
        expect(names[2]).toBe("Aisha Khan  ");
        expect(rows[2].marked[1]).toBe(true);
        expect(names[5]).toBe("  Li Wei");
        expect(rows[5].marked[1]).toBe(true);
        // a name with no space at an end is not marked
        expect(rows[1].marked[1]).toBe(false);
        rows.forEach((row, i) => {
            const fields = parsed[i];
            row.cells.forEach((cell, c) => {
                const field = fields[c] ?? "";
                expect(row.marked[c], `row ${i + 1}, column ${c + 1}: ${JSON.stringify(field)}`).toBe(field !== "" && /^\s|\s$/.test(field));
            });
        });
    });

    test("with the names on row 4 of title_rows.csv, rows 1 to 3 are left out, row 4 holds the names and the data follows", async ({ app }) => {
        await openDialog(app, fixturePath("csv/title_rows.csv"));
        await namesRow(app).fill("4");
        const rows = await previewRows(app);
        expect(rows.map((row) => row.tag)).toEqual(["left out", "left out", "left out", "column names", "", "", "", "", "", ""]);
        expect(rows[0].cells[0]).toBe("Northlight Retail");
        expect(rows[3].cells).toEqual(["Region", "Month", "Orders", "Revenue"]);
        expect(rows[4].cells).toEqual(["North", "Jul", "120", "15400.50"]);
        // the blank line is not a row: the names are on row 4 though on line 5 of the file
        expect(rows.map((row) => row.number)).toEqual(["1", "2", "3", "4", "5", "6", "7", "8", "9", "10"]);
        await expect(app.importSubmit).toBeEnabled();
    });

    test("a names row beyond what is shown says how many rows there are, and Import is off", async ({ app }) => {
        await openDialog(app, fixturePath("csv/title_rows.csv"));
        await namesRow(app).fill("11");
        const message = alertIn(app, "only 10 rows");
        await expect(message).toBeVisible();
        await expect(namesRow(app)).toHaveAttribute("aria-invalid", "true");
        await expect(app.importSubmit).toBeDisabled();
        // back to a row that is there
        await namesRow(app).fill("10");
        await expect(message).toBeHidden();
        await expect(app.importSubmit).toBeEnabled();
    });

    test("a names row that is not a whole number of 1 or more gives the other message", async ({ app }) => {
        await openDialog(app, fixturePath("csv/title_rows.csv"));
        for (const value of ["0", "2.5", "-3", ""]) {
            await namesRow(app).fill(value);
            await expect(alertIn(app, "whole number, 1 or more"), `row ${JSON.stringify(value)}`).toBeVisible();
            await expect(alertIn(app, "only 10 rows")).toHaveCount(0);
            await expect(app.importSubmit, `row ${JSON.stringify(value)}`).toBeDisabled();
        }
        await namesRow(app).fill("2");
        await expect(alertIn(app, "whole number")).toHaveCount(0);
        await expect(app.importSubmit).toBeEnabled();
    });

    test("unticking the row of column names disables the row box, and every row is data", async ({ app }) => {
        await openDialog(app, fixturePath("messy_sales.csv"));
        await expect(hasNames(app)).toBeChecked();
        await expect(namesRow(app)).toBeEnabled();
        await hasNames(app).uncheck();
        await expect(namesRow(app)).toBeDisabled();
        const rows = await previewRows(app);
        expect(rows.map((row) => row.tag)).toEqual(Array(20).fill(""));
        expect(rows.map((row) => row.number)).toEqual(Array.from({ length: 20 }, (_, i) => String(i + 1)));
        // what was the names is now the first row of data
        expect(rows[0].cells[0]).toBe("Order ID");
        await hasNames(app).check();
        await expect(namesRow(app)).toBeEnabled();
        expect((await previewRows(app))[0].tag).toBe("column names");
    });

    test("an unticked box lifts the objection to a names row that is too far down", async ({ app }) => {
        await openDialog(app, fixturePath("csv/title_rows.csv"));
        await namesRow(app).fill("11");
        await expect(app.importSubmit).toBeDisabled();
        await hasNames(app).uncheck();
        await expect(alertIn(app, "only 10 rows")).toHaveCount(0);
        await expect(app.importSubmit).toBeEnabled();
    });

    test("when the names are far down, the note above the preview says how many rows above are left out", async ({ app }) => {
        const lines = Array.from({ length: 30 }, (_, i) => `Title line ${i + 1}`);
        const text = `${lines.join("\n")}\nid,name\n1,Ann\n2,Bob\n`;
        await openDialog(app, csv("far_down.csv", text));
        await namesRow(app).fill("31");
        // the three rows above the names are shown; the 27 before them are not
        await expect(note(app)).toContainText("27 more rows above are left out");
        const rows = await previewRows(app);
        expect(rows.map((row) => row.number)).toEqual(["28", "29", "30", "31", "32", "33"]);
        expect(rows.map((row) => row.tag)).toEqual(["left out", "left out", "left out", "column names", "", ""]);
        expect(rows[3].cells[0]).toBe("id");
    });

    test("a file of names and no rows of data says there are no rows of data", async ({ app }) => {
        await openDialog(app, fixturePath("csv/header_only.csv"));
        await expect(note(app)).toContainText("No rows of data");
        const rows = await previewRows(app);
        expect(rows.map((row) => row.tag)).toEqual(["column names"]);
        expect(rows[0].cells).toEqual(["id", "name", "joined"]);
    });

    // A field of more than 80 characters is shown cut short, with the whole of it in its title; the
    // table keeps it whole (plan, section 3, "Preview dialog"; previewCell in js/lab/import-dialog.js).
    // The row of column names is drawn by the same function, so it has its own cut fields.
    test("a field of 80 characters is shown whole with no title, one of 81 is cut to 80 and the cut mark with the whole as its title; the table keeps it whole", async ({ app }) => {
        const { STATEMENT_ELLIPSIS: ELLIPSIS } = await load("config.js");
        // names of 80 and of 81 characters, each with a space in the middle (which the rules turn into _)
        const nameEighty = `${"a".repeat(39)} ${"b".repeat(40)}`;
        const nameEightyOne = `${"c".repeat(40)} ${"d".repeat(40)}`;
        const eighty = "x".repeat(80);
        const eightyOne = `${"y".repeat(40)} ${"z".repeat(40)}`;
        expect([nameEighty.length, nameEightyOne.length, eighty.length, eightyOne.length]).toEqual([80, 81, 80, 81]);
        await openDialog(app, csv("edge.csv", `id,${nameEighty},${nameEightyOne}\n1,${eighty},${eightyOne}\n2,short,short\n`));

        // what each cell shows, and the title it has (null for none)
        const drawn = await app.importPanel.locator(".import-preview-table tbody tr").evaluateAll((trs) =>
            trs.map((tr) => [...tr.querySelectorAll("td")].map((td) => {
                const span = td.querySelector(".import-cell-text");
                return { text: td.textContent, title: span ? span.getAttribute("title") : null };
            }))
        );
        expect(drawn).toEqual([
            [{ text: "id", title: null }, { text: nameEighty, title: null }, { text: `${nameEightyOne.slice(0, 80)}${ELLIPSIS}`, title: nameEightyOne }],
            [{ text: "1", title: null }, { text: eighty, title: null }, { text: `${eightyOne.slice(0, 80)}${ELLIPSIS}`, title: eightyOne }],
            [{ text: "2", title: null }, { text: "short", title: null }, { text: "short", title: null }],
        ]);

        // the table keeps the whole of it, and the column's name is what the rules make of the name
        await app.importSubmit.click();
        await expect(app.importDialog).toBeHidden();
        await expect(app.pane).toHaveAttribute("data-state", "report");
        const columns = (await app.rows("SELECT name FROM pragma_table_info('edge') ORDER BY cid")).map((row) => row[0]);
        expect(columns).toEqual(["id", nameEighty.replace(" ", "_"), nameEightyOne.replace(" ", "_")]);
        const [row] = await app.rows(`SELECT "${columns[1]}", "${columns[2]}", length("${columns[2]}") FROM edge WHERE id = 1`);
        expect(row).toEqual([eighty, eightyOne, 81]);
    });
});

// ---- 3. settings are detected and changeable --------------------------------------------------------------

test.describe("the settings", () => {
    // (Without this test the two lists could come in another order and every other test would
    // still pass, since each of them chooses its option by its label.)
    test("the two menus list their choices in a set order: comma, semicolon, tab, pipe; UTF-8, UTF-16 little-endian, UTF-16 big-endian, Windows-1252", async ({ app }) => {
        await openDialog(app, [csv("one.csv")]);
        const labels = (select) => select.evaluate((el) => [...el.options].map((option) => option.textContent));
        expect(await labels(delimiterOf(app))).toEqual([",", ";", "\t", "|"].map((delimiter) => words.IMPORT_DELIMITER_NAMES[delimiter]));
        expect(await labels(encodingOf(app))).toEqual(["utf-8", "utf-16le", "utf-16be", "windows-1252"].map((encoding) => words.IMPORT_ENCODING_NAMES[encoding]));
    });

    const DELIMITER = { comma: "Comma", semicolon: "Semicolon", tab: "Tab", pipe: "Pipe" };
    const ENCODING = {
        "utf-8": "UTF-8",
        "utf-8 with BOM": "UTF-8",
        "utf-16le": "UTF-16, little-endian",
        "utf-16be": "UTF-16, big-endian",
        "windows-1252": "Windows-1252",
    };
    // every text file of the owner's set that has settings and is a file of the repository
    const TEXT_FIXTURES = fixtureIndex()
        .map((entry) => entry.fixture)
        .filter((name) => /\.(csv|tsv|txt)$/.test(name) && name !== "large.csv" && fs.existsSync(fixturePath(name)) && expectedFor(name).settings);

    test("the delimiter, the encoding and the row of names are what each expected file says, for every text fixture", async ({ app, page }) => {
        test.slow();
        expect(TEXT_FIXTURES.length).toBeGreaterThan(15);
        await app.open(OPEN);
        for (const name of TEXT_FIXTURES) {
            const wanted = expectedFor(name).settings;
            await app.chooseFiles(fixturePath(name));
            await expect(app.importDialog).toBeVisible();
            await expect(app.importDialog.locator(".import-reading")).toHaveCount(0);
            expect.soft(await shown(field(app, "Delimiter")), `${name}: delimiter`).toBe(DELIMITER[wanted.delimiter]);
            expect.soft(await shown(field(app, "Text encoding")), `${name}: encoding`).toBe(ENCODING[wanted.encoding]);
            expect.soft(await hasNames(app).isChecked(), `${name}: row of column names`).toBe(wanted.first_row_is_header);
            await page.keyboard.press("Escape");
            await expect(app.importDialog).toBeHidden();
        }
    });

    test("semicolon.csv shows Semicolon; Comma re-reads the preview into fewer columns, and Semicolon brings it back", async ({ app }) => {
        await openDialog(app, fixturePath("semicolon.csv"));
        const delimiter = field(app, "Delimiter");
        expect(await shown(delimiter)).toBe("Semicolon");
        const columns = () => app.importPanel.locator(".import-preview-table thead th").count();
        const before = await columns();
        expect((await previewRows(app))[0].cells).toEqual(["Produkt", "Preis", "Menge", "Datum", "Beschreibung"]);

        await delimiter.selectOption({ label: "Comma" });
        await expect(app.importPanel.locator(".import-preview-table tbody tr").first().locator("td").first()).toHaveText("Produkt;Preis;Menge;Datum;Beschreibung");
        expect(await columns()).toBeLessThan(before);
        expect(await shown(delimiter)).toBe("Comma");

        await delimiter.selectOption({ label: "Semicolon" });
        await expect(app.importPanel.locator(".import-preview-table tbody tr").first().locator("td").first()).toHaveText("Produkt");
        expect(await columns()).toBe(before);
    });

    test("a tab file shows Tab, a pipe file shows Pipe, a file of one column shows Comma", async ({ app, page }) => {
        const cases = [
            ["csv/tab_delimited.tsv", "Tab", ["sku", "description", "price", "stock"]],
            ["csv/pipe_delimited.txt", "Pipe", ["sku", "description", "price", "stock"]],
            ["csv/single_column.csv", "Comma", ["email"]],
        ];
        await app.open(OPEN);
        for (const [name, delimiter, names] of cases) {
            await app.chooseFiles(fixturePath(name));
            await expect(app.importDialog).toBeVisible();
            await expect(app.importDialog.locator(".import-reading")).toHaveCount(0);
            expect(await shown(field(app, "Delimiter")), name).toBe(delimiter);
            expect((await previewRows(app))[0].cells, name).toEqual(names);
            await page.keyboard.press("Escape");
            await expect(app.importDialog).toBeHidden();
        }
    });

    test("windows1252.csv shows Windows-1252 and its £ and é; UTF-8 says the bytes do not fit, hides the preview and turns Import off; Windows-1252 brings both back", async ({ app }) => {
        await openDialog(app, fixturePath("windows1252.csv"));
        const encoding = field(app, "Text encoding");
        expect(await shown(encoding)).toBe("Windows-1252");
        const rows = await previewRows(app);
        expect(rows[0].cells).toContain("Café");
        expect(rows[1].cells).toContain("£4.50");
        expect(rows[1].cells).toContain("Crème brûlée");
        await expect(app.importSubmit).toBeEnabled();

        await encoding.selectOption({ label: "UTF-8" });
        const message = alertIn(app, "not UTF-8");
        await expect(message).toBeVisible();
        await expect(encoding).toHaveAttribute("aria-invalid", "true");
        // the message is under the select it is about
        expect(await encoding.evaluate((el) => el.closest(".import-field").contains(document.querySelector('[role="alert"]:not([hidden])')))).toBe(true);
        await expect(app.importPanel.locator(".import-preview-table")).toHaveCount(0);
        await expect(app.importPanel.locator(".import-preview")).toBeHidden();
        await expect(app.importSubmit).toBeDisabled();

        await encoding.selectOption({ label: "Windows-1252" });
        await expect(message).toBeHidden();
        await expect(app.importPanel.locator(".import-preview-table")).toBeVisible();
        expect((await previewRows(app))[1].cells).toContain("£4.50");
        await expect(app.importSubmit).toBeEnabled();
    });

    test("utf16le_bom.txt shows UTF-16, little-endian, and its preview reads", async ({ app }) => {
        await openDialog(app, fixturePath("csv/utf16le_bom.txt"));
        expect(await shown(field(app, "Text encoding"))).toBe("UTF-16, little-endian");
        expect(await shown(field(app, "Delimiter"))).toBe("Tab");
        expect((await previewRows(app))[0].cells).toEqual(["id", "name", "city", "balance"]);
    });

    test("utf8_bom.csv shows UTF-8 and its first column name has no byte-order mark in it", async ({ app }) => {
        await openDialog(app, fixturePath("csv/utf8_bom.csv"));
        expect(await shown(field(app, "Text encoding"))).toBe("UTF-8");
        const first = (await previewRows(app))[0].cells[0];
        expect(first).toBe("id");
        expect(first.charCodeAt(0)).not.toBe(0xfeff);
    });
});

// ---- 4. table names --------------------------------------------------------------------------------------------

test.describe("table names", () => {
    test("a name is taken from the file: digits first gain c_, brackets and spaces become underscores, a reserved word is kept", async ({ app, page }) => {
        await app.open(OPEN);
        const cases = [
            ["csv/names/2024 Sales Data (final) v2.csv", "c_2024_Sales_Data_final_v2"],
            ["csv/names/Order.csv", "Order"],
            ["messy_sales.csv", "messy_sales"],
        ];
        for (const [name, wanted] of cases) {
            await app.chooseFiles(fixturePath(name));
            await expect(app.importDialog).toBeVisible();
            await expect(app.importDialog.locator(".import-reading")).toHaveCount(0);
            await expect(tableName(app), name).toHaveValue(wanted);
            await page.keyboard.press("Escape");
            await expect(app.importDialog).toBeHidden();
        }
    });

    test("a name that is typed goes through the same rule when the field is left", async ({ app }) => {
        await openDialog(app, fixturePath("messy_sales.csv"));
        await tableName(app).fill("my table!");
        await tableName(app).blur();
        await expect(tableName(app)).toHaveValue("my_table_");
        await tableName(app).fill("2nd try");
        await tableName(app).blur();
        await expect(tableName(app)).toHaveValue("c_2nd_try");
    });

    test("an empty name, shown when Import is pressed, says so, marks the field, selects its tab, focuses it and imports nothing", async ({ app }) => {
        await openDialog(app, [csv("alpha.csv"), csv("beta.csv")]);
        const database = await app.page.evaluateHandle(() => window.app.database);
        await selectTab(app, "beta.csv");
        await tableName(app).fill("");
        await selectTab(app, "alpha.csv");
        await app.importSubmit.click();
        await expect(app.importTabs.filter({ hasText: "beta.csv" })).toHaveAttribute("aria-selected", "true");
        await expect(alertIn(app, "Give the table a name")).toBeVisible();
        await expect(tableName(app)).toHaveAttribute("aria-invalid", "true");
        await expect(tableName(app)).toBeFocused();
        await expect(app.importDialog).toBeVisible();
        expect(await app.page.evaluate((old) => window.app.database === old, database)).toBe(true);
        await expect(app.pane).not.toHaveAttribute("data-state", "report");
        // typing in the field takes the message away
        await tableName(app).fill("beta");
        await expect(alertIn(app, "Give the table a name")).toBeHidden();
        await expect(tableName(app)).not.toHaveAttribute("aria-invalid", "true");
    });

    test("a name that starts with sqlite_ in any letter case is refused with its own message", async ({ app }) => {
        await openDialog(app, [csv("alpha.csv"), csv("beta.csv")]);
        for (const typed of ["sqlite_data", "SQLITE_data", "SqLite_x"]) {
            await selectTab(app, "beta.csv");
            await tableName(app).fill(typed);
            await selectTab(app, "alpha.csv");
            await app.importSubmit.click();
            await expect(app.importTabs.filter({ hasText: "beta.csv" }), typed).toHaveAttribute("aria-selected", "true");
            await expect(alertIn(app, "sqlite_"), typed).toBeVisible();
            await expect(tableName(app), typed).toHaveAttribute("aria-invalid", "true");
            await expect(tableName(app), typed).toBeFocused();
            await expect(app.importDialog).toBeVisible();
        }
    });

    test("a name another tab has is refused, in any letter case", async ({ app }) => {
        await openDialog(app, [csv("alpha.csv"), csv("beta.csv")]);
        for (const typed of ["alpha", "ALPHA", "Alpha"]) {
            await selectTab(app, "beta.csv");
            await tableName(app).fill(typed);
            await selectTab(app, "alpha.csv");
            await app.importSubmit.click();
            await expect(app.importTabs.filter({ hasText: "beta.csv" }), typed).toHaveAttribute("aria-selected", "true");
            await expect(alertIn(app, "Another file here has this table name"), typed).toBeVisible();
            await expect(tableName(app), typed).toHaveAttribute("aria-invalid", "true");
            await expect(tableName(app), typed).toBeFocused();
            await expect(app.importDialog).toBeVisible();
        }
    });

    test("into the open database, a name it already has as a table or as a view is refused, in any letter case", async ({ app }) => {
        await openSample(app);
        const before = await schemaNow(app);
        expect(before.map((row) => row[1])).toEqual(expect.arrayContaining(["fruit", "tags", "v_priced"]));
        await app.chooseFiles([csv("alpha.csv"), csv("beta.csv")]);
        await expect(app.importDialog).toBeVisible();
        await expect(app.importDialog.locator(".import-reading")).toHaveCount(0);
        await app.importDialog.locator("#import-into-open").check();
        for (const typed of ["fruit", "FRUIT", "tags", "Tags", "v_priced", "V_PRICED"]) {
            await selectTab(app, "beta.csv");
            await tableName(app).fill(typed);
            await selectTab(app, "alpha.csv");
            await app.importSubmit.click();
            await expect(app.importTabs.filter({ hasText: "beta.csv" }), typed).toHaveAttribute("aria-selected", "true");
            await expect(alertIn(app, "sample.db already has a table, view or index"), typed).toBeVisible();
            await expect(tableName(app), typed).toHaveAttribute("aria-invalid", "true");
            await expect(tableName(app), typed).toBeFocused();
            await expect(app.importDialog).toBeVisible();
        }
        expect(await schemaNow(app)).toEqual(before);
    });

    // SQLite keeps tables, views and indexes in one list, and a table with the name of an index
    // would not be made: so an index's name is taken (plan, section 3, "Names"; takenNames in
    // js/lab/import-db.js). The index is made through the page, as a student would.
    test("into the open database, the name of an index it has is taken too: suggested as _2, refused when typed in any letter case, and free in a new database", async ({ app }) => {
        await openSample(app);
        await app.run("CREATE INDEX idx_fruit_name ON fruit(name)");
        expect(await app.rows("SELECT type FROM sqlite_schema WHERE name = 'idx_fruit_name'")).toEqual([["index"]]);
        const before = await schemaNow(app);

        await app.chooseFiles([csv("idx_fruit_name.csv"), csv("IDX_FRUIT_NAME.csv"), csv("other.csv")]);
        await expect(app.importDialog).toBeVisible();
        await expect(app.importDialog.locator(".import-reading")).toHaveCount(0);
        const names = app.importDialog.locator(".import-panel").getByLabel("Table name", { exact: true });
        const expectNames = async (wanted) => {
            await expect(names).toHaveCount(wanted.length);
            for (const [i, name] of wanted.entries()) {
                await expect(names.nth(i)).toHaveValue(name);
            }
        };
        // a new database has none of it: the names are the files' own (the second differs by its case,
        // so the first pass already gives it _2)
        await expectNames(["idx_fruit_name", "IDX_FRUIT_NAME_2", "other"]);
        // in the open database the index has the name: the first is suggested as _2, the second (whose
        // letters differ in case only) as _3
        await app.importDialog.locator("#import-into-open").check();
        await expectNames(["idx_fruit_name_2", "IDX_FRUIT_NAME_3", "other"]);
        await app.importDialog.locator("#import-into-new").check();
        await expectNames(["idx_fruit_name", "IDX_FRUIT_NAME_2", "other"]);
        await app.importDialog.locator("#import-into-open").check();

        // the same name typed
        for (const typed of ["idx_fruit_name", "IDX_FRUIT_NAME", "Idx_Fruit_Name"]) {
            // (the tabs by place: two of the file names differ by their case only)
            await app.importTabs.nth(2).click();
            await tableName(app).fill(typed);
            await app.importTabs.nth(0).click();
            await app.importSubmit.click();
            await expect(app.importTabs.nth(2), typed).toHaveAttribute("aria-selected", "true");
            await expect(alertIn(app, words.importNameTakenMessage("sample.db")), typed).toBeVisible();
            await expect(tableName(app), typed).toHaveAttribute("aria-invalid", "true");
            await expect(tableName(app), typed).toBeFocused();
            await expect(app.importDialog).toBeVisible();
        }
        expect(await schemaNow(app)).toEqual(before);

        // with the new database as the destination the name is free: nothing is taken, and the table is made
        await app.importDialog.locator("#import-into-new").check();
        for (const [place, name] of [[0, "first"], [1, "second"], [2, "idx_fruit_name"]]) {
            await app.importTabs.nth(place).click();
            await tableName(app).fill(name);
        }
        await app.importSubmit.click();
        await expect(app.importDialog).toBeHidden();
        expect(await app.rows("SELECT type FROM sqlite_schema WHERE name = 'idx_fruit_name'")).toEqual([["table"]]);
    });

    test("the same names are fine in a new database: nothing there to clash with", async ({ app }) => {
        await openSample(app);
        await app.chooseFiles(csv("fruit.csv"));
        await expect(app.importDialog).toBeVisible();
        await expect(app.importDialog.locator(".import-reading")).toHaveCount(0);
        await expect(tableName(app)).toHaveValue("fruit");
        await app.importSubmit.click();
        await expect(alertIn(app, "already has")).toHaveCount(0);
        await expect(app.importDialog).toBeHidden();
    });

    test("names are suggested in one pass: Data.csv and data.CSV give Data and data_2", async ({ app }) => {
        await openDialog(app, [csv("Data.csv"), csv("data.CSV")]);
        await expect(app.importTabs).toHaveText(["Data.csv", "data.CSV"]);
        const names = app.importDialog.locator(".import-panel").getByLabel("Table name", { exact: true });
        await expect(names).toHaveCount(2);
        await expect(names.nth(0)).toHaveValue("Data");
        await expect(names.nth(1)).toHaveValue("data_2");
    });

    test("with the open database as the destination fruit.csv is suggested as fruit_2, and a new database suggests fruit again", async ({ app }) => {
        await openSample(app);
        await app.chooseFiles(csv("fruit.csv"));
        await expect(app.importDialog).toBeVisible();
        await expect(app.importDialog.locator(".import-reading")).toHaveCount(0);
        await expect(tableName(app)).toHaveValue("fruit");
        await app.importDialog.locator("#import-into-open").check();
        await expect(tableName(app)).toHaveValue("fruit_2");
        await app.importDialog.locator("#import-into-new").check();
        await expect(tableName(app)).toHaveValue("fruit");
        await app.importDialog.locator("#import-into-open").check();
        await expect(tableName(app)).toHaveValue("fruit_2");
    });

    test("a name the student has typed is left alone when the destination changes", async ({ app }) => {
        await openSample(app);
        await app.chooseFiles(csv("fruit.csv"));
        await expect(app.importDialog).toBeVisible();
        await expect(app.importDialog.locator(".import-reading")).toHaveCount(0);
        await tableName(app).fill("mine");
        await app.importDialog.locator("#import-into-open").check();
        await expect(tableName(app)).toHaveValue("mine");
        await app.importDialog.locator("#import-into-new").check();
        await expect(tableName(app)).toHaveValue("mine");
    });
});

// ---- 5. the destination ----------------------------------------------------------------------------------------

test.describe("the destination", () => {
    test("a new database is the default, named after the first file without its extension", async ({ app }) => {
        await openDialog(app, fixturePath("messy_sales.csv"));
        await expect(app.importDialog.locator("#import-into-new")).toBeChecked();
        await expect(app.importDialog.locator("#import-into-open")).not.toBeChecked();
        await expect(app.importDialog.locator("#import-database-name")).toHaveValue("messy_sales");
        await expect(app.importDialog.locator("#import-database-name")).toBeEnabled();
    });

    test("the name comes from the first file that is not refused: a workbook first, a CSV second", async ({ app }) => {
        await openDialog(app, [WORKBOOK, fixturePath("semicolon.csv")]);
        await expect(refusedTab(app, "shopping_db.xlsx")).toBeVisible();
        await expect(app.importDialog.locator("#import-database-name")).toHaveValue("semicolon");
    });

    test("a name that the student typed stays when a later file is refused, and an untouched one follows the first file that is left", async ({ app, page }) => {
        test.slow();
        // The first file asks before it is read (it is large), and is then refused as not text:
        // that is a refusal after the student has had the dialog in front of them.
        for (const typed of [true, false]) {
            await app.open(OPEN);
            await dropMade(page, [{ name: "big.csv", size: 50 * MB + 1 }, { name: "second.csv", text: "a,b\n1,2\n" }]);
            await expect(app.importDialog).toBeVisible();
            const name = app.importDialog.locator("#import-database-name");
            await expect(name).toHaveValue("big");
            if (typed) {
                await name.fill("my_own");
            }
            await app.importPanel.getByRole("button", { name: "Read this file" }).click();
            await expect(refusedTab(app, "big.csv")).toBeVisible();
            await expect(name).toHaveValue(typed ? "my_own" : "second");
            await page.keyboard.press("Escape");
            await expect(app.importDialog).toBeHidden();
        }
    });

    test("an empty database name, when Import is pressed, says so and the focus goes to the field", async ({ app }) => {
        await openDialog(app, fixturePath("semicolon.csv"));
        const name = app.importDialog.locator("#import-database-name");
        await name.fill("");
        await app.importSubmit.click();
        await expect(app.importDialog.getByRole("alert").filter({ hasText: "Give the new database a name" })).toBeVisible();
        await expect(name).toHaveAttribute("aria-invalid", "true");
        await expect(name).toBeFocused();
        await expect(app.importDialog).toBeVisible();
        await name.fill("semi");
        await expect(app.importDialog.getByRole("alert").filter({ hasText: "Give the new database a name" })).toBeHidden();
    });

    test("the name field is disabled while the open database is chosen, and enabled again with a new one", async ({ app }) => {
        await openSample(app);
        await app.chooseFiles(csv("one.csv"));
        await expect(app.importDialog).toBeVisible();
        await expect(app.importDialog.locator(".import-reading")).toHaveCount(0);
        const name = app.importDialog.locator("#import-database-name");
        await expect(name).toBeEnabled();
        await app.importDialog.locator("#import-into-open").check();
        await expect(name).toBeDisabled();
        await app.importDialog.locator("#import-into-new").check();
        await expect(name).toBeEnabled();
    });

    test("with a course database open, the open-database choice is off and says why", async ({ app }) => {
        await openDialog(app, csv("one.csv"));
        const choice = app.importDialog.locator("#import-into-open");
        await expect(choice).toBeDisabled();
        const why = app.importDialog.getByText("Files are never imported into a course database.");
        await expect(why).toBeVisible();
        await expect(choice).toHaveAccessibleDescription(/never imported into a course database/);
        await expect(app.importDialog.locator("#import-into-new")).toBeChecked();
    });

    test("with an opened file, the open-database choice is on and named after it", async ({ app }) => {
        await openSample(app);
        await app.chooseFiles(csv("one.csv"));
        await expect(app.importDialog).toBeVisible();
        await expect(app.importDialog.locator(".import-reading")).toHaveCount(0);
        const choice = app.importDialog.getByRole("radio", { name: "The open database, sample.db" });
        await expect(choice).toBeVisible();
        await expect(choice).toBeEnabled();
        await expect(app.importDialog.getByText("Files are never imported into a course database.")).toBeHidden();
    });
});

// ---- 6. nothing left to import ---------------------------------------------------------------------------------

test.describe("nothing left to import", () => {
    test("only refused files give a dialog with one button, Close, and no destination", async ({ app }) => {
        await openDialog(app, [WORKBOOK, fixturePath("csv/empty.csv")]);
        await expect(refusedTab(app, "shopping_db.xlsx")).toBeVisible();
        await expect(refusedTab(app, "empty.csv")).toBeVisible();
        const buttons = app.importDialog.getByRole("button");
        await expect(buttons).toHaveCount(1);
        await expect(buttons.first()).toHaveText("Close");
        await expect(app.importSubmit).toBeHidden();
        await expect(app.importDialog.getByRole("button", { name: words.IMPORT_SUBMIT_TEXT, exact: true })).toHaveCount(0);
        await expect(app.importDialog.locator("#import-into-new")).toBeHidden();
        await expect(app.importDialog.locator("#import-database-name")).toBeHidden();
        // each tab says why
        await selectTab(app, "empty.csv");
        await expect(app.importPanel).toContainText("empty");
    });

    test("Close closes it, and the focus goes back to where it was before the dialog, the editor", async ({ app }) => {
        await app.open(OPEN);
        await app.editor.focus();
        await app.chooseFiles(fixturePath("csv/empty.csv"));
        await expect(app.importDialog).toBeVisible();
        await app.importDialog.getByRole("button", { name: "Close" }).click();
        await expect(app.importDialog).toBeHidden();
        await expect(app.editor).toBeFocused();
    });

    test("with one file that can be imported and one that cannot, Import and Cancel stay", async ({ app }) => {
        await openDialog(app, [fixturePath("csv/empty.csv"), fixturePath("semicolon.csv")]);
        await expect(app.importSubmit).toBeVisible();
        await expect(app.importSubmit).toBeEnabled();
        await expect(app.importCancel).toHaveText("Cancel");
        await expect(app.importDialog.locator("#import-into-new")).toBeVisible();
    });
});

// ---- 7. size limits (plan, section 7) ---------------------------------------------------------------------------

// the two answers of the large-file step, in the tab on show, and the tab of a file that was left out:
// its name, then "(left out)" (the words a screen reader adds beside the sign)
const readButton = (app) => app.importPanel.getByRole("button", { name: words.IMPORT_LARGE_FILE_CONTINUE_TEXT, exact: true });
const leaveButton = (app) => app.importPanel.getByRole("button", { name: words.IMPORT_LARGE_FILE_LEAVE_TEXT, exact: true });
const leftOutName = (name) => `${name} (${words.IMPORT_LEFT_OUT_TAB_TEXT})`;
const leftOutTab = (app, name) => app.page.getByRole("tab", { name: new RegExp(`^${escaped(name)} \\(${escaped(words.IMPORT_LEFT_OUT_TAB_TEXT)}\\)$`) });
// The colour of a tab's sign, and whether it is the tab's own text colour: a file that cannot be
// imported has the sign in the danger colour; one the student left out themselves has it in the
// tab's own, since nothing went wrong.
const signColour = (tab) =>
    tab.evaluate((button) => {
        const sign = getComputedStyle(button.querySelector(".import-tab-refused")).color;
        return { sign, tabs: sign === getComputedStyle(button).color };
    });
// a file of zeros just over the warning's size, and a small text file that two tests put beside it
const LARGE = (name) => ({ name, size: 50 * MB + 1 });
const SMALL_TEXT = "a,b\n1,2\n";

// What a file that was left out is, in its tab and in the dialog: not what a refusal is in its words
// (the tab says "left out", never "cannot be imported"), and the same in everything else. `before` is
// what the page had asked of the file when it was chosen.
async function expectLeftOut(app, page, name, before) {
    const tab = leftOutTab(app, name);
    await expect(tab).toBeVisible();
    await expect(tab).toHaveAccessibleName(leftOutName(name));
    expect(await tab.getAttribute("aria-selected")).toBe("true");
    await expect(tab.locator(".import-tab-refused")).toHaveCount(1);
    expect((await signColour(tab)).tabs, "the sign of a file that was left out is in the tab's own colour").toBe(true);
    await expect(app.page.getByRole("tab", { name: new RegExp(escaped(words.IMPORT_REFUSED_TAB_TEXT)) })).toHaveCount(0);
    await expect(app.importPanel.locator(".import-refusal")).toHaveText(words.IMPORT_LEFT_OUT_REASON);
    // the panel is a Tab stop of its own and holds no button: the answer was given
    await expect(app.importPanel).toHaveAttribute("tabindex", "0");
    await expect(app.importPanel.getByRole("button")).toHaveCount(0);
    // the button that was pressed went with the step: the focus is on the tab, not on the page
    await expect(tab).toBeFocused();
    // nothing more of the file was asked for
    expect(await bytesRead(page), "what was read of the file").toBe(before);
    // nothing is left to import: Close, and no destination
    await expect(app.importDialog.getByRole("button")).toHaveText([words.IMPORT_CLOSE_TEXT]);
    await expect(app.importSubmit).toBeHidden();
    await expect(app.importDialog.locator("#import-into-new")).toBeHidden();
    await expect(app.importDialog.locator("#import-database-name")).toBeHidden();
}

test.describe("size limits", () => {
    test("a text file just over 50 MB shows a warning in its tab with Read this file and Leave this file out, in that order, Import is off, and the file has not been read", async ({ app, page }) => {
        test.slow();
        await app.open(OPEN);
        expect(await dropMade(page, [{ name: "big.csv", size: 50 * MB + 1 }])).toBe(true);
        await expect(app.importDialog).toBeVisible();
        await expect(app.importPanel).toContainText("50 MB");
        const go = app.importPanel.getByRole("button", { name: "Read this file" });
        await expect(go).toBeVisible();
        // the two answers, the one that reads first (its words are the plan's, the dialog's own order)
        await expect(app.importPanel.getByRole("button")).toHaveText([words.IMPORT_LARGE_FILE_CONTINUE_TEXT, words.IMPORT_LARGE_FILE_LEAVE_TEXT]);
        await expect(app.importPanel.locator(".import-warning-answers button")).toHaveText([words.IMPORT_LARGE_FILE_CONTINUE_TEXT, words.IMPORT_LARGE_FILE_LEAVE_TEXT]);
        await expect(leaveButton(app)).toBeVisible();
        await expect(app.importSubmit).toBeDisabled();
        await expect(app.importPanel.getByLabel(words.IMPORT_TABLE_NAME_LABEL)).toHaveCount(0);
        await expect(app.importPanel.locator(".import-preview-table")).toHaveCount(0);
        // the first bytes say what the file is; nothing more of it has been asked for
        expect(await bytesRead(page)).toBeLessThanOrEqual(64 * 1024);
    });

    test("pressing Read this file reads it: the warning came first, then the file", async ({ app, page }) => {
        test.slow();
        await app.open(OPEN);
        await dropMade(page, [{ name: "zeros.csv", size: 50 * MB + 1 }]);
        await expect(app.importPanel.getByRole("button", { name: "Read this file" })).toBeVisible();
        const before = await bytesRead(page);
        expect(before).toBeLessThanOrEqual(64 * 1024);
        await app.importPanel.getByRole("button", { name: "Read this file" }).click();
        // a file of zeros is not text
        await expect(refusedTab(app, "zeros.csv")).toBeVisible();
        await expect(app.importPanel).toContainText("not text");
        // (its sign is the one of a file that cannot be imported, not the quiet one of a file left out)
        expect((await signColour(refusedTab(app, "zeros.csv"))).tabs, "the sign of a file that cannot be imported is not in the tab's own colour").toBe(false);
        expect(await bytesRead(page)).toBeGreaterThan(40 * MB);
        await expect(app.importSubmit).toBeHidden();
    });

    test("a large file of real text, once read, shows its preview and the settings", async ({ app, page }) => {
        test.slow();
        await app.open(OPEN);
        await dropMade(page, [{ name: "big_text.csv", megabytes: 51 }]);
        await expect(app.importPanel.getByRole("button", { name: "Read this file" })).toBeVisible();
        expect(await bytesRead(page)).toBeLessThanOrEqual(64 * 1024);
        await expect(app.importSubmit).toBeDisabled();
        await app.importPanel.getByRole("button", { name: "Read this file" }).click();
        await expect(tableName(app)).toHaveValue("big_text");
        const rows = await previewRows(app);
        expect(rows[0].cells).toEqual(["id", "name"]);
        expect(rows[1].cells).toEqual(["1", "abc"]);
        await expect(app.importPanel.getByRole("button", { name: words.IMPORT_LARGE_FILE_CONTINUE_TEXT })).toHaveCount(0);
        await expect(app.importSubmit).toBeEnabled();
    });

    test("a file of exactly 50 MB is not warned about: it is read at once", async ({ app, page }) => {
        test.slow();
        await app.open(OPEN);
        await dropMade(page, [{ name: "exact.csv", size: 50 * MB }]);
        // (zeros: read at once, and then not text)
        await expect(refusedTab(app, "exact.csv")).toBeVisible();
        await expect(app.importDialog.getByRole("button", { name: words.IMPORT_LARGE_FILE_CONTINUE_TEXT })).toHaveCount(0);
        await expect(app.importPanel).toContainText("not text");
    });

    test("a file over 250 MB is refused at once with its message and is never read", async ({ app, page }) => {
        test.slow();
        await app.open(OPEN);
        await dropMade(page, [{ name: "huge.csv", size: 250 * MB + 1, shared: true }]);
        await expect(app.importDialog).toBeVisible();
        await expect(refusedTab(app, "huge.csv")).toBeVisible();
        await expect(app.importPanel).toContainText("250 MB");
        await expect(app.importDialog.getByRole("button", { name: words.IMPORT_LARGE_FILE_CONTINUE_TEXT })).toHaveCount(0);
        await expect(app.importDialog.getByRole("button")).toHaveText(["Close"]);
        expect(await bytesRead(page)).toBeLessThanOrEqual(64 * 1024);
    });

    test("a file of exactly 250 MB is warned about, not refused", async ({ app, page }) => {
        test.slow();
        await app.open(OPEN);
        await dropMade(page, [{ name: "limit.csv", size: 250 * MB, shared: true }]);
        await expect(app.importPanel.getByRole("button", { name: "Read this file" })).toBeVisible();
        await expect(app.importPanel).toContainText("250 MB");
        await expect(app.page.getByRole("tab", { name: new RegExp(escaped(words.IMPORT_REFUSED_TAB_TEXT)) })).toHaveCount(0);
    });

    // ---- what a file is comes before how large it is, and the bytes say it, not the name (plan, sections 3 and 7) ----

    const ZIP_START = [0x50, 0x4b, 0x03, 0x04];
    const OLE2_START = [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1];
    const WORKBOOKS = [
        // (text's names, a workbook's bytes; the size is one that would matter for text)
        ["the zip bytes under a .csv name, just over 50 MB", { name: "wb.csv", size: 50 * MB + 1, start: ZIP_START }],
        ["the zip bytes under a .csv name, just over 250 MB", { name: "wb.csv", size: 250 * MB + 1, start: ZIP_START, shared: true }],
        ["the OLE2 bytes under a .txt name, just over 50 MB", { name: "old.txt", size: 50 * MB + 1, start: OLE2_START }],
    ];

    for (const [what, made] of WORKBOOKS) {
        test(`${what}: it is a workbook, refused as one at once, with no question, only Close, and nothing of it read`, async ({ app, page }) => {
            test.slow();
            await app.open(OPEN);
            expect(await dropMade(page, [made])).toBe(true);
            await expect(app.importDialog).toBeVisible();
            await expect(refusedTab(app, made.name)).toBeVisible();
            // what it is, not how large: never the size's words
            await expect(app.importPanel.locator(".import-refusal")).toHaveText(words.IMPORT_WORKBOOK_REASON);
            await expect(app.importDialog.getByRole("button", { name: words.IMPORT_LARGE_FILE_CONTINUE_TEXT })).toHaveCount(0);
            await expect(app.importDialog.getByRole("button", { name: words.IMPORT_LARGE_FILE_LEAVE_TEXT })).toHaveCount(0);
            await expect(app.importDialog.getByRole("button")).toHaveText([words.IMPORT_CLOSE_TEXT]);
            await expect(app.importSubmit).toBeHidden();
            // the first bytes said what it is: no more of it was asked for
            expect(await bytesRead(page)).toBeLessThanOrEqual(64 * 1024);
        });
    }

    test("a small CSV chosen with that workbook still imports: the refusal is the workbook's alone", async ({ app, page }) => {
        test.slow();
        await app.open(OPEN);
        await dropMade(page, [{ name: "wb.csv", size: 50 * MB + 1, start: ZIP_START }, { name: "small.csv", text: SMALL_TEXT }]);
        await expect(app.importDialog).toBeVisible();
        await expect(refusedTab(app, "wb.csv")).toBeVisible();
        await expect(app.importPanel.locator(".import-refusal")).toHaveText(words.IMPORT_WORKBOOK_REASON);
        await selectTab(app, "small.csv");
        await expect(tableName(app)).toHaveValue("small");
        await expect(app.importSubmit).toBeEnabled();
        await app.importSubmit.click();
        await expect(app.importDialog).toBeHidden();
        expect(await app.rows("SELECT type, name FROM sqlite_schema ORDER BY 1, 2")).toEqual([["table", "small"]]);
        expect(await app.rows("SELECT a, b FROM small")).toEqual([[1, 2]]);
        expect(await bytesRead(page), "nothing of the workbook was read").toBeLessThanOrEqual(64 * 1024);
    });

    // Text under a workbook's name is text by its bytes: it is held to the text limits (50 MB asks,
    // 250 MB refuses), not to a workbook's own (the plan's 20 MB is for the Excel files of Phase 5).
    test("text of about 30 MB named t30.xlsx is read at once, with no question: its preview shows and Import is on", async ({ app, page }) => {
        test.slow();
        await app.open(OPEN);
        await dropMade(page, [{ name: "t30.xlsx", megabytes: 30 }]);
        await expect(tableName(app)).toHaveValue("t30");
        const rows = await previewRows(app);
        expect(rows[0].cells).toEqual(["id", "name"]);
        expect(rows[1].cells).toEqual(["1", "abc"]);
        await expect(app.importDialog.getByRole("button", { name: words.IMPORT_LARGE_FILE_CONTINUE_TEXT })).toHaveCount(0);
        await expect(app.importDialog.getByRole("button", { name: words.IMPORT_LARGE_FILE_LEAVE_TEXT })).toHaveCount(0);
        await expect(app.page.getByRole("tab", { name: new RegExp(escaped(words.IMPORT_REFUSED_TAB_TEXT)) })).toHaveCount(0);
        await expect(app.importSubmit).toBeEnabled();
    });

    test("text of just over 50 MB named t60.xls asks first, with both answers, and nothing of it is read before the answer", async ({ app, page }) => {
        test.slow();
        await app.open(OPEN);
        await dropMade(page, [{ name: "t60.xls", megabytes: 51 }]);
        await expect(app.importDialog).toBeVisible();
        await expect(app.importPanel).toContainText("51 MB");
        await expect(app.importPanel.getByRole("button")).toHaveText([words.IMPORT_LARGE_FILE_CONTINUE_TEXT, words.IMPORT_LARGE_FILE_LEAVE_TEXT]);
        await expect(app.page.getByRole("tab", { name: new RegExp(escaped(words.IMPORT_REFUSED_TAB_TEXT)) })).toHaveCount(0);
        await expect(app.importSubmit).toBeDisabled();
        expect(await bytesRead(page)).toBeLessThanOrEqual(64 * 1024);
        // the answer is the student's: read, it is the text it was
        await readButton(app).click();
        await expect(tableName(app)).toHaveValue("t60");
        expect((await previewRows(app))[0].cells).toEqual(["id", "name"]);
        await expect(app.importSubmit).toBeEnabled();
        expect(await bytesRead(page)).toBeGreaterThan(40 * MB);
    });

    // ---- the second answer of the large-file step: leave the file out (plan, section 7) ----

    test("Leave this file out, pressed with the mouse, makes the tab a left-out tab: its reason, its name, its sign, the focus, and a dialog with only Close", async ({ app, page }) => {
        test.slow();
        await app.open(OPEN);
        await dropMade(page, [LARGE("big.csv")]);
        await expect(leaveButton(app)).toBeVisible();
        const before = await bytesRead(page);
        expect(before).toBeLessThanOrEqual(64 * 1024);
        await leaveButton(app).click();
        await expectLeftOut(app, page, "big.csv", before);
        // the step is over: the file is never read, whatever is done next
        await expect(app.importDialog.getByRole("button", { name: words.IMPORT_LARGE_FILE_CONTINUE_TEXT })).toHaveCount(0);
        await app.importDialog.getByRole("button", { name: words.IMPORT_CLOSE_TEXT }).click();
        await expect(app.importDialog).toBeHidden();
        expect(await bytesRead(page), "what was read of the file").toBe(before);
    });

    // from the tab, one Tab reaches Read this file and a second Tab Leave this file out
    for (const key of ["Enter", "Space"]) {
        test(`Leave this file out, reached with Tab from its tab and pressed with ${key}, does the same: the reason, the name, the sign and the focus on the tab`, async ({ app, page }) => {
            test.slow();
            await app.open(OPEN);
            await dropMade(page, [LARGE("big.csv")]);
            await expect(leaveButton(app)).toBeVisible();
            const before = await bytesRead(page);
            expect(before).toBeLessThanOrEqual(64 * 1024);
            await app.importTabs.first().focus();
            await page.keyboard.press("Tab");
            await expect(readButton(app), "the first answer is the first stop").toBeFocused();
            await page.keyboard.press("Tab");
            await expect(leaveButton(app), "the second answer is the next stop").toBeFocused();
            await page.keyboard.press(key);
            await expectLeftOut(app, page, "big.csv", before);
            // the keyboard is where it was: Shift+Tab leaves the tab, and the panel is the next stop after it
            await page.keyboard.press("Tab");
            await expect(app.importPanel).toBeFocused();
            await page.keyboard.press("Escape");
            await expect(app.importDialog).toBeHidden();
        });
    }

    // A press with a pointer does not give a button the focus in every browser (Safari leaves the
    // focus where it was). Either answer still ends with the focus on the file's tab: here the
    // button is pressed by script, with the focus on nothing in the dialog.
    for (const [answer, button] of [
        ["Read this file", readButton],
        ["Leave this file out", leaveButton],
    ]) {
        test(`pressed while the focus is elsewhere, ${answer} still gives the focus to the file's tab`, async ({ app, page }) => {
            test.slow();
            await app.open(OPEN);
            await dropMade(page, [LARGE("big.csv"), { name: "small.csv", text: SMALL_TEXT }]);
            await expect(button(app)).toBeVisible();
            await button(app).evaluate((pressed) => {
                document.activeElement.blur();
                pressed.click();
            });
            await expect(app.importTabs.first()).toBeFocused();
        });
    }

    test("a large file first and a small one second that would make the same table: while the large one waits the small one is data_2 and Import is off, and the line names the large one", async ({ app, page }) => {
        test.slow();
        await app.open(OPEN);
        await dropMade(page, [LARGE("data.csv"), { name: "data.txt", text: SMALL_TEXT }]);
        await expect(app.importDialog).toBeVisible();
        await expect(app.importTabs).toHaveText(["data.csv", "data.txt"]);
        await expect(app.importDialog.locator("#import-database-name")).toHaveValue("data");
        await selectTab(app, "data.txt");
        await expect(tableName(app)).toHaveValue("data_2");
        await expect(app.importSubmit).toBeDisabled();
        await expect(holdLine(app)).toHaveText(words.importHoldWaitingMessage("data.csv"));
    });

    test("after Leave this file out the small file is the only one: Import is on, the line is gone, its table is data again, and Import makes that one table and reads nothing of the large file", async ({ app, page }) => {
        test.slow();
        await app.open(OPEN);
        await dropMade(page, [LARGE("data.csv"), { name: "data.txt", text: SMALL_TEXT }]);
        await expect(app.importTabs).toHaveText(["data.csv", "data.txt"]);
        await selectTab(app, "data.txt");
        await expect(tableName(app)).toHaveValue("data_2");
        await expect(holdLine(app)).toBeVisible();
        await selectTab(app, "data.csv");
        const before = await bytesRead(page);
        expect(before).toBeLessThanOrEqual(64 * 1024);
        await leaveButton(app).click();
        await expect(leftOutTab(app, "data.csv")).toBeVisible();
        await selectTab(app, "data.txt");
        // (its table was given its name again: it was data_2 only for the file that has gone)
        await expect(tableName(app)).toHaveValue("data");
        await expect(holdLine(app)).toBeHidden();
        await expect(holdLine(app)).toHaveText("");
        await expect(app.importSubmit).toBeEnabled();
        expect(await bytesRead(page)).toBe(before);
        await app.importSubmit.click();
        await expect(app.importDialog).toBeHidden();
        await expect(app.databaseLabel).toHaveText("data");
        expect(await app.rows("SELECT type, name FROM sqlite_schema ORDER BY 1, 2")).toEqual([["table", "data"]]);
        expect(await app.rows("SELECT a, b FROM data")).toEqual([[1, 2]]);
        expect(await bytesRead(page), "the import did not read the large file").toBe(before);
    });

    // (the two files above make the same database name: these two have names of their own)
    test("after Leave this file out the new database is named after the small file, as it is when the first file was refused", async ({ app, page }) => {
        test.slow();
        await app.open(OPEN);
        await dropMade(page, [LARGE("alpha.csv"), { name: "beta.csv", text: SMALL_TEXT }]);
        await expect(app.importDialog).toBeVisible();
        const name = app.importDialog.locator("#import-database-name");
        await expect(name).toHaveValue("alpha");
        await leaveButton(app).click();
        await expect(leftOutTab(app, "alpha.csv")).toBeVisible();
        await expect(name).toHaveValue("beta");
        await selectTab(app, "beta.csv");
        await expect(name).toHaveValue("beta");
        await app.importSubmit.click();
        await expect(app.importDialog).toBeHidden();
        await expect(app.databaseLabel).toHaveText("beta");
        expect(await app.rows("SELECT type, name FROM sqlite_schema ORDER BY 1, 2")).toEqual([["table", "beta"]]);
    });

    test("the names the student typed stay when a file is left out: the database's, and the small file's table", async ({ app, page }) => {
        test.slow();
        await app.open(OPEN);
        await dropMade(page, [LARGE("alpha.csv"), { name: "beta.csv", text: SMALL_TEXT }]);
        await expect(app.importDialog).toBeVisible();
        const name = app.importDialog.locator("#import-database-name");
        await name.fill("my_own");
        await selectTab(app, "beta.csv");
        await tableName(app).fill("my_table");
        await selectTab(app, "alpha.csv");
        await leaveButton(app).click();
        await expect(leftOutTab(app, "alpha.csv")).toBeVisible();
        await expect(name).toHaveValue("my_own");
        await selectTab(app, "beta.csv");
        await expect(tableName(app)).toHaveValue("my_table");
        await expect(app.importSubmit).toBeEnabled();
        await app.importSubmit.click();
        await expect(app.importDialog).toBeHidden();
        await expect(app.databaseLabel).toHaveText("my_own");
        expect(await app.rows("SELECT type, name FROM sqlite_schema ORDER BY 1, 2")).toEqual([["table", "my_table"]]);
    });

    test("with two large files, leaving one out leaves the other still asking and Import off; reading it then goes on as it always did", async ({ app, page }) => {
        test.slow();
        await app.open(OPEN);
        await dropMade(page, [LARGE("first.csv"), { name: "second.csv", megabytes: 51 }]);
        await expect(app.importTabs).toHaveText(["first.csv", "second.csv"]);
        await expect(leaveButton(app)).toBeVisible();
        await leaveButton(app).click();
        await expect(leftOutTab(app, "first.csv")).toBeVisible();
        // the second asks still: its own tab has both answers, and on the first tab the line names it
        await expect(app.importSubmit).toBeDisabled();
        await expect(holdLine(app)).toHaveText(words.importHoldWaitingMessage("second.csv"));
        await expect(app.importDialog.locator("#import-database-name")).toHaveValue("second");
        await selectTab(app, "second.csv");
        await expect(app.importPanel.getByRole("button")).toHaveText([words.IMPORT_LARGE_FILE_CONTINUE_TEXT, words.IMPORT_LARGE_FILE_LEAVE_TEXT]);
        // (a file that waits is named on its own tab as well)
        await expect(holdLine(app)).toHaveText(words.importHoldWaitingMessage("second.csv"));
        await expect(app.importSubmit).toBeDisabled();
        await readButton(app).click();
        await expect(tableName(app)).toHaveValue("second");
        expect((await previewRows(app))[0].cells).toEqual(["id", "name"]);
        await expect(app.importSubmit).toBeEnabled();
        await selectTab(app, "first.csv");
        await expect(holdLine(app)).toBeHidden();
        await expect(app.importSubmit).toBeEnabled();
        // (the file left out was never asked for: the megabytes read are the second file's)
        expect(await bytesRead(page)).toBeGreaterThan(40 * MB);
    });

    test("the answer belongs to that opening of the dialog: the same file dropped again after it was left out asks again", async ({ app, page }) => {
        test.slow();
        await app.open(OPEN);
        await dropMade(page, [LARGE("big.csv")]);
        await leaveButton(app).click();
        await expect(leftOutTab(app, "big.csv")).toBeVisible();
        await app.importDialog.getByRole("button", { name: words.IMPORT_CLOSE_TEXT }).click();
        await expect(app.importDialog).toBeHidden();
        await dropMade(page, [LARGE("big.csv")]);
        await expect(app.importDialog).toBeVisible();
        await expect(app.importPanel.getByRole("button")).toHaveText([words.IMPORT_LARGE_FILE_CONTINUE_TEXT, words.IMPORT_LARGE_FILE_LEAVE_TEXT]);
        await expect(app.importTabs).toHaveCount(1);
        await expect(leftOutTab(app, "big.csv")).toHaveCount(0);
        await expect(app.page.getByRole("tab", { name: "big.csv", exact: true })).toBeVisible();
        await expect(app.importPanel.locator(".import-refusal")).toHaveCount(0);
        await expect(app.importSubmit).toBeDisabled();
        expect(await bytesRead(page)).toBeLessThanOrEqual(64 * 1024);
    });
});

// ---- 8. closing -----------------------------------------------------------------------------------------------

test.describe("closing", () => {
    const WAYS = [
        ["Cancel", (app) => app.importCancel.click()],
        ["Escape", (app) => app.page.keyboard.press("Escape")],
    ];

    for (const [way, close] of WAYS) {
        test(`${way} closes it and nothing was imported: the open database, its tables and the results are as they were`, async ({ app }) => {
            await openSample(app);
            const database = await app.page.evaluateHandle(() => window.app.database);
            const before = await schemaNow(app);
            await app.chooseFiles([fixturePath("messy_sales.csv"), fixturePath("semicolon.csv")]);
            await expect(app.importDialog).toBeVisible();
            await expect(app.importDialog.locator(".import-reading")).toHaveCount(0);
            await app.importDialog.locator("#import-into-open").check();
            await close(app);
            await expect(app.importDialog).toBeHidden();
            expect(await app.page.evaluate((old) => window.app.database === old, database)).toBe(true);
            expect(await schemaNow(app)).toEqual(before);
            await expect(app.pane).not.toHaveAttribute("data-state", "report");
            expect(await app.page.evaluate(() => document.querySelector("dialog[open]"))).toBeNull();
        });

        test(`${way} with a new database as the destination leaves the open database as it was`, async ({ app }) => {
            await openSample(app);
            const database = await app.page.evaluateHandle(() => window.app.database);
            const before = await schemaNow(app);
            await app.chooseFiles(fixturePath("messy_sales.csv"));
            await expect(app.importDialog).toBeVisible();
            await expect(app.importDialog.locator(".import-reading")).toHaveCount(0);
            await close(app);
            await expect(app.importDialog).toBeHidden();
            await expect(app.databaseLabel).toHaveText("sample.db");
            expect(await app.page.evaluate((old) => window.app.database === old, database)).toBe(true);
            expect(await schemaNow(app)).toEqual(before);
        });

        test(`${way}: the focus goes back to where it was before the dialog, the editor`, async ({ app }) => {
            await app.open(OPEN);
            await app.editor.focus();
            await app.chooseFiles(fixturePath("semicolon.csv"));
            await expect(app.importDialog).toBeVisible();
            await close(app);
            await expect(app.importDialog).toBeHidden();
            await expect(app.editor).toBeFocused();
        });

        test(`${way}: when the files were chosen from the database menu, whose entry has gone, the focus goes to the database button`, async ({ app }) => {
            await app.open(OPEN);
            await app.databaseButton.click();
            const [chooser] = await Promise.all([app.page.waitForEvent("filechooser"), app.page.locator("#open-file").click()]);
            await chooser.setFiles(fixturePath("semicolon.csv"));
            await expect(app.importDialog).toBeVisible();
            await close(app);
            await expect(app.importDialog).toBeHidden();
            await expect(app.databaseButton).toBeFocused();
        });

        test(`after ${way}, the next choice of files, made at once, opens a fresh dialog with only the new files`, async ({ app }) => {
            await openDialog(app, [fixturePath("messy_sales.csv"), fixturePath("semicolon.csv")]);
            await close(app);
            // (no wait: an earlier version mixed the two sessions)
            await app.chooseFiles(csv("fresh.csv"));
            await expect(app.importDialog).toBeVisible();
            await expect(app.importDialog.locator(".import-reading")).toHaveCount(0);
            await expect(app.importTabs).toHaveText(["fresh.csv"]);
            await expect(tableName(app)).toHaveValue("fresh");
            await expect(app.importDialog.locator("#import-database-name")).toHaveValue("fresh");
            await expect(app.importSubmit).toBeEnabled();
            // it stays so: the closing of the first did not reach the second
            await expect(app.importDialog).toBeVisible();
            await expect(app.importTabs).toHaveCount(1);
            expect(await previewRowsCount(app)).toBe(2);
        });
    }

    test("while the dialog is open Control+O opens no file chooser and Control+U no Open from URL dialog; closed, both work", async ({ app, page }) => {
        const choosers = [];
        page.on("filechooser", (chooser) => choosers.push(chooser));
        await openDialog(app, fixturePath("semicolon.csv"));
        await expect(app.importTabs.first()).toBeFocused();
        await page.keyboard.press("Control+o");
        await page.waitForEvent("filechooser", { timeout: 800 }).then(
            () => {},
            () => {}
        );
        expect(choosers).toHaveLength(0);
        await page.keyboard.press("Control+u");
        await expect(page.getByRole("dialog", { name: "Open from URL" })).toHaveCount(0);
        await expect(page.locator("#open-url-dialog[open]")).toHaveCount(0);
        await expect(app.importDialog).toBeVisible();

        // the keys work as they did once the dialog is gone
        await page.keyboard.press("Escape");
        await expect(app.importDialog).toBeHidden();
        await page.keyboard.press("Control+o");
        await expect.poll(() => choosers.length).toBe(1);
        expect(choosers[0].isMultiple()).toBe(true);
        await page.keyboard.press("Control+u");
        await expect(page.getByRole("dialog", { name: "Open from URL" })).toBeVisible();
    });

    test("a drop of files while the dialog is open is cancelled and ignored: the tabs stay the same", async ({ app }) => {
        await openDialog(app, [fixturePath("messy_sales.csv"), fixturePath("semicolon.csv")]);
        await expect(app.importTabs).toHaveText(["messy_sales.csv", "semicolon.csv"]);
        const cancelled = await app.dropFiles([csv("dropped.csv")]);
        // (the drop handler is synchronous: nothing is left to wait for)
        expect(cancelled).toBe(true);
        await expect(app.importTabs).toHaveText(["messy_sales.csv", "semicolon.csv"]);
        await expect(app.importDialog.locator(".import-reading")).toHaveCount(0);
        await expect(app.importTabs).toHaveCount(2);
        // and the same drop, with no dialog open, is taken
        await app.page.keyboard.press("Escape");
        await expect(app.importDialog).toBeHidden();
        expect(await app.dropFiles([csv("dropped.csv")])).toBe(true);
        await expect(app.importTabs).toHaveText(["dropped.csv"]);
    });
});

async function previewRowsCount(app) {
    return app.importPanel.locator(".import-preview-table tbody tr").count();
}

// ---- 9. accessibility -------------------------------------------------------------------------------------------

test.describe("accessibility", () => {
    const FILES = () => [fixturePath("messy_sales.csv"), fixturePath("semicolon.csv"), WORKBOOK];

    for (const viewport of [
        { name: "desktop", width: 1366, height: 768 },
        { name: "phone", width: 390, height: 844 },
    ]) {
        for (const theme of ["light", "dark"]) {
            test(`axe finds no serious or critical violation in the open dialog, ${theme}, ${viewport.name}`, async ({ app, page }) => {
                await page.setViewportSize({ width: viewport.width, height: viewport.height });
                await page.emulateMedia({ colorScheme: theme, reducedMotion: "reduce" });
                await openDialog(app, FILES());
                await expect(refusedTab(app, "shopping_db.xlsx")).toBeVisible();
                await page.evaluate(() => document.fonts.ready);
                for (const tab of ["messy_sales.csv", "shopping_db.xlsx"]) {
                    await selectTab(app, tab);
                    const results = await new AxeBuilder({ page }).include("#import-dialog").analyze();
                    const serious = results.violations
                        .filter((v) => v.impact === "serious" || v.impact === "critical")
                        .map((v) => `${v.id} (${v.impact}): ${v.help} at ${v.nodes.slice(0, 4).map((n) => n.target.join(" ")).join(" | ")}`);
                    // (the dialog was looked at: some rules ran and passed)
                    expect(results.passes.length, `the tab of ${tab}`).toBeGreaterThan(5);
                    expect(serious, `the tab of ${tab}`).toEqual([]);
                }
            });
        }
    }

    // the states of the dialog's two lines: a problem line in a tab, and the line that says why
    // Import is off, on another tab
    for (const viewport of [
        { name: "desktop", width: 1366, height: 768 },
        { name: "phone", width: 390, height: 844 },
    ]) {
        for (const theme of ["light", "dark"]) {
            test(`axe finds no serious or critical violation with a problem line and a hold line on show, ${theme}, ${viewport.name}`, async ({ app, page }) => {
                await page.setViewportSize({ width: viewport.width, height: viewport.height });
                await page.emulateMedia({ colorScheme: theme, reducedMotion: "reduce" });
                await openDialog(app, [wide(), csv("ok.csv")]);
                await page.evaluate(() => document.fonts.ready);
                await delimiterOf(app).selectOption(",");
                await expect(problemLine(app)).toBeVisible();
                const looked = [];
                for (const [tab, line] of [
                    ["wide.csv", problemLine],
                    ["ok.csv", holdLine],
                ]) {
                    await selectTab(app, tab);
                    await expect(line(app), `the line of the tab of ${tab}`).toBeVisible();
                    const results = await new AxeBuilder({ page }).include("#import-dialog").analyze();
                    const serious = results.violations
                        .filter((v) => v.impact === "serious" || v.impact === "critical")
                        .map((v) => `${v.id} (${v.impact}): ${v.help} at ${v.nodes.slice(0, 4).map((n) => n.target.join(" ")).join(" | ")}`);
                    expect(results.passes.length, `the tab of ${tab}`).toBeGreaterThan(5);
                    expect(serious, `the tab of ${tab}`).toEqual([]);
                    looked.push(tab);
                }
                expect(looked).toEqual(["wide.csv", "ok.csv"]);
            });
        }
    }

    // The states of the large-file step: the reading state (a tab that says the file is being read),
    // the step that asks (Read this file, Leave this file out), and a tab of a file that was left out.
    // The running import and the step are also in tests/ui-a11y.spec.js; these two are nowhere else.
    const seriousOf = async (page, label) => {
        const results = await new AxeBuilder({ page }).include("#import-dialog").analyze();
        // (the dialog was looked at: some rules ran and passed)
        expect(results.passes.length, label).toBeGreaterThan(5);
        return results.violations
            .filter((v) => v.impact === "serious" || v.impact === "critical")
            .map((v) => `${v.id} (${v.impact}): ${v.help} at ${v.nodes.slice(0, 4).map((n) => n.target.join(" ")).join(" | ")}`);
    };
    for (const viewport of [
        { name: "desktop", width: 1366, height: 768 },
        { name: "phone", width: 390, height: 844 },
    ]) {
        for (const theme of ["light", "dark"]) {
            test(`axe finds no serious or critical violation with the reading state on show, ${theme}, ${viewport.name}`, async ({ app, page }) => {
                // the library's request is held before the file is chosen: its first reading waits for it
                let release;
                const gate = new Promise((resolve) => (release = resolve));
                await page.route(READER_URL, async (route) => {
                    await gate;
                    await route.continue().catch(() => {});
                });
                try {
                    await page.setViewportSize({ width: viewport.width, height: viewport.height });
                    await page.emulateMedia({ colorScheme: theme, reducedMotion: "reduce" });
                    await app.open(OPEN);
                    await app.chooseFiles([csv("one.csv")]);
                    await expect(app.importDialog).toBeVisible();
                    await expect(app.importPanel.locator(".import-reading")).toHaveText(words.IMPORT_READING_TEXT);
                    await page.evaluate(() => document.fonts.ready);
                    expect(await seriousOf(page, "the reading state")).toEqual([]);
                } finally {
                    release();
                }
                await expect(app.importDialog.locator(".import-reading")).toHaveCount(0);
            });

            test(`axe finds no serious or critical violation with the large-file step on show, ${theme}, ${viewport.name}`, async ({ app, page }) => {
                test.slow();
                await page.setViewportSize({ width: viewport.width, height: viewport.height });
                await page.emulateMedia({ colorScheme: theme, reducedMotion: "reduce" });
                await app.open(OPEN);
                await dropMade(page, [LARGE("big.csv")]);
                await expect(leaveButton(app)).toBeVisible();
                await expect(readButton(app)).toBeVisible();
                await page.evaluate(() => document.fonts.ready);
                expect(await seriousOf(page, "the step")).toEqual([]);
            });

            test(`axe finds no serious or critical violation with a left-out tab on show, ${theme}, ${viewport.name}`, async ({ app, page }) => {
                test.slow();
                await page.setViewportSize({ width: viewport.width, height: viewport.height });
                await page.emulateMedia({ colorScheme: theme, reducedMotion: "reduce" });
                await app.open(OPEN);
                await dropMade(page, [LARGE("big.csv"), { name: "small.csv", text: SMALL_TEXT }]);
                await leaveButton(app).click();
                await expect(leftOutTab(app, "big.csv")).toBeVisible();
                await expect(app.importPanel.locator(".import-refusal")).toHaveText(words.IMPORT_LEFT_OUT_REASON);
                await page.evaluate(() => document.fonts.ready);
                expect(await seriousOf(page, "the left-out tab")).toEqual([]);
                // and the other tab, beside it
                await selectTab(app, "small.csv");
                expect(await seriousOf(page, "the tab beside it")).toEqual([]);
            });
        }
    }

    test("at 360 px wide the page, the dialog and its body do not scroll sideways with the dialog open", async ({ app, page }) => {
        await page.setViewportSize({ width: 360, height: 740 });
        await openDialog(app, FILES());
        await page.evaluate(() => document.fonts.ready);
        for (const tab of ["messy_sales.csv", "shopping_db.xlsx"]) {
            await selectTab(app, tab);
            const widths = await page.evaluate(() => {
                const dialog = document.querySelector("#import-dialog");
                const body = dialog.querySelector(".import-body");
                return { page: document.documentElement.scrollWidth, window: window.innerWidth, dialog: [dialog.scrollWidth, dialog.clientWidth], body: [body.scrollWidth, body.clientWidth] };
            });
            expect(widths.page, `the tab of ${tab}`).toBeLessThanOrEqual(widths.window);
            expect(widths.dialog[0], `the dialog, the tab of ${tab}`).toBeLessThanOrEqual(widths.dialog[1]);
            expect(widths.body[0], `the body, the tab of ${tab}`).toBeLessThanOrEqual(widths.body[1]);
        }
    });

    test("every control can be reached and used with the keyboard alone", async ({ app, page }) => {
        await openSample(app);
        await app.chooseFiles([fixturePath("messy_sales.csv"), fixturePath("semicolon.csv")]);
        await expect(app.importDialog).toBeVisible();
        await expect(app.importDialog.locator(".import-reading")).toHaveCount(0);
        await expect(app.importTabs.first()).toBeFocused();

        // press Tab (or Shift+Tab) until the control has the focus, at most 40 times
        const reach = async (locator, { back = false } = {}) => {
            for (let i = 0; i < 40; i++) {
                await page.keyboard.press(back ? "Shift+Tab" : "Tab");
                if (await locator.evaluate((el) => el === document.activeElement)) {
                    return true;
                }
            }
            return false;
        };
        const dialog = app.importDialog;
        // forward from the first tab: the settings of its panel, then Import and Cancel
        expect(await reach(field(app, "Table name")), "Table name").toBe(true);
        expect(await reach(field(app, "Delimiter")), "Delimiter").toBe(true);
        expect(await reach(field(app, "Text encoding")), "Text encoding").toBe(true);
        expect(await reach(hasNames(app)), "the tick box").toBe(true);
        expect(await reach(namesRow(app)), "the row box").toBe(true);
        expect(await reach(app.importSubmit), "Import").toBe(true);
        expect(await reach(app.importCancel), "Cancel").toBe(true);

        // the settings work from the keyboard: Space on the tick box, the digits in the row box
        await hasNames(app).focus();
        await page.keyboard.press("Space");
        await expect(hasNames(app)).not.toBeChecked();
        await expect(namesRow(app)).toBeDisabled();
        await page.keyboard.press("Space");
        await expect(hasNames(app)).toBeChecked();
        await namesRow(app).focus();
        await page.keyboard.press("Control+A");
        await page.keyboard.type("3");
        await expect(namesRow(app)).toHaveValue("3");
        expect((await previewRows(app)).map((row) => row.tag).slice(0, 4)).toEqual(["left out", "left out", "column names", ""]);
        await page.keyboard.press("Control+A");
        await page.keyboard.type("1");

        // back from the first tab: the destination, whose radios take the arrow keys
        await app.importTabs.first().focus();
        expect(await reach(dialog.locator("#import-database-name"), { back: true }), "the database name").toBe(true);
        expect(await reach(dialog.locator("#import-into-new"), { back: true }), "the new-database radio").toBe(true);
        await page.keyboard.press("ArrowDown");
        await expect(dialog.locator("#import-into-open")).toBeFocused();
        await expect(dialog.locator("#import-into-open")).toBeChecked();
        await expect(dialog.locator("#import-database-name")).toBeDisabled();
        await page.keyboard.press("ArrowUp");
        await expect(dialog.locator("#import-into-new")).toBeFocused();
        await expect(dialog.locator("#import-into-new")).toBeChecked();
        await expect(dialog.locator("#import-database-name")).toBeEnabled();
    });

    test("Import and Cancel work from the keyboard: Enter on Cancel closes it, and the focus is back where it was", async ({ app, page }) => {
        await app.open(OPEN);
        await app.editor.focus();
        await app.chooseFiles(fixturePath("semicolon.csv"));
        await expect(app.importDialog).toBeVisible();
        await app.importCancel.focus();
        await page.keyboard.press("Enter");
        await expect(app.importDialog).toBeHidden();
        await expect(app.editor).toBeFocused();
    });

    // A key held down repeats. The dialog takes the repeats of Enter away (Enter held on Import
    // would go on to press Cancel), and only those: a student who holds a letter, Backspace or an
    // arrow in the table's name must still get the repeats.
    test("only a repeat of Enter is taken away in the dialog: a held letter, Backspace and arrow key still repeat in the table's name", async ({ app, page }) => {
        await openDialog(app, fixturePath("messy_sales.csv"));
        const name = tableName(app);
        await name.focus();
        // the keydown that the browser sends for a key that repeats, handed to the field
        const prevented = await name.evaluate((input) => {
            const answer = {};
            for (const [key, repeat] of [["a", true], ["Backspace", true], ["ArrowLeft", true], ["Enter", true], ["Enter", false]]) {
                const event = new KeyboardEvent("keydown", { key, repeat, bubbles: true, cancelable: true });
                input.dispatchEvent(event);
                answer[`${key}${repeat ? " (repeat)" : ""}`] = event.defaultPrevented;
            }
            return answer;
        });
        expect(prevented).toEqual({ "a (repeat)": false, "Backspace (repeat)": false, "ArrowLeft (repeat)": false, "Enter (repeat)": true, Enter: false });
        // and with real keys held down: the field takes the letter again and again, and Backspace
        // takes the letters away one after the other
        await name.fill("");
        for (let n = 0; n < 3; n++) {
            await page.keyboard.down("a");
        }
        await page.keyboard.up("a");
        await expect(name, "a letter held down is typed again and again").toHaveValue("aaa");
        for (let n = 0; n < 2; n++) {
            await page.keyboard.down("Backspace");
        }
        await page.keyboard.up("Backspace");
        await expect(name, "Backspace held down takes a letter away at each repeat").toHaveValue("a");
    });
});

// ---- 10. the body and the foot of the dialog, and the mark for white space ------------------------------------

test.describe("the body and the foot of the dialog", () => {
    // The form holds two parts. The body (.import-body: the title, the destination, the tabs and
    // their panels, the progress) is the only thing that scrolls. Under it the foot (.import-foot:
    // the line that says why Import is off, the line that says what went wrong, Import and
    // Cancel) does not scroll and is beside the body, never over it. The measures below are made
    // on the elements, and every wait is for a state (a count of frames at rest).

    // Resolves, with where the body and the dialog are scrolled, once neither has moved for 20
    // frames in a row: a scroll that a focus starts (smooth in Firefox) has ended by then. A
    // number of frames, not of milliseconds: a slow machine draws fewer frames, not more scrolls.
    const settled = (page) =>
        page.evaluate(
            () =>
                new Promise((resolve) => {
                    const dialog = document.querySelector("#import-dialog");
                    const body = dialog.querySelector(".import-body");
                    const read = () => `${body.scrollTop},${dialog.scrollTop}`;
                    let last = read();
                    let still = 0;
                    const tick = () => {
                        still = read() === last ? still + 1 : 0;
                        last = read();
                        if (still >= 20) {
                            resolve({ body: body.scrollTop, dialog: dialog.scrollTop });
                        } else {
                            requestAnimationFrame(tick);
                        }
                    };
                    requestAnimationFrame(tick);
                })
        );
    const scrollBody = async (page, top) => {
        await page.evaluate((to) => {
            document.querySelector("#import-dialog .import-body").scrollTop = to;
        }, top);
        return settled(page);
    };
    // how far the body can scroll
    const roomOf = (page) =>
        page.evaluate(() => {
            const body = document.querySelector("#import-dialog .import-body");
            return body.scrollHeight - body.clientHeight;
        });
    // the air that a control scrolled into view keeps clear at the body's edges: its scroll
    // padding, read from the stylesheet and not typed here (0 when the body has none: the computed
    // value is "auto" then, and a number is what a test compares)
    const airOf = (page) =>
        page.evaluate(() => parseFloat(getComputedStyle(document.querySelector("#import-dialog .import-body")).scrollPaddingTop) || 0);

    // ---- 1. the structure ------------------------------------------------------------------------------

    test("at 683x384 only the body scrolls: the dialog does not, while its content is longer than it", async ({ app, page }) => {
        await page.setViewportSize({ width: 683, height: 384 });
        await openDialog(app, fixturePath("messy_sales.csv"));
        await page.evaluate(() => document.fonts.ready);
        const sizes = await page.evaluate(() => {
            const dialog = document.querySelector("#import-dialog");
            const body = dialog.querySelector(".import-body");
            return {
                dialog: [dialog.scrollHeight, dialog.clientHeight],
                body: [body.scrollHeight, body.clientHeight],
                overflowY: getComputedStyle(body).overflowY,
                window: window.innerHeight,
            };
        });
        expect(sizes.body[0] - sizes.body[1], "the body has a good deal of room to scroll (the preview alone is 300 px high)").toBeGreaterThan(100);
        expect(sizes.dialog[0], "the dialog's own content is not longer than the dialog").toBeLessThanOrEqual(sizes.dialog[1]);
        expect(sizes.dialog[1], "the dialog fits in the window").toBeLessThanOrEqual(sizes.window);
        expect(["auto", "scroll"], "the body is what scrolls").toContain(sizes.overflowY);
        // (and what is scrolled is the body: the dialog stays at its top)
        expect(await scrollBody(page, await roomOf(page))).toEqual({ body: expect.any(Number), dialog: 0 });
        expect(await page.evaluate(() => document.querySelector("#import-dialog .import-body").scrollTop), "the body did scroll").toBeGreaterThan(100);
    });

    for (const size of [
        { width: 683, height: 384 },
        { width: 360, height: 740 },
        { width: 1280, height: 800 },
    ]) {
        test(`at ${size.width}x${size.height}, the foot lies under the body and over nothing, holds the buttons and both lines, and ends inside the dialog`, async ({ app, page }) => {
            await page.setViewportSize(size);
            await openDialog(app, fixturePath("messy_sales.csv"));
            await page.evaluate(() => document.fonts.ready);
            const layout = await page.evaluate(() => {
                const dialog = document.querySelector("#import-dialog");
                const body = dialog.querySelector(".import-body");
                const foot = dialog.querySelector(".import-foot");
                const b = body.getBoundingClientRect();
                const f = foot.getBoundingClientRect();
                const d = dialog.getBoundingClientRect();
                const inside = (selector) => Boolean(foot.querySelector(selector));
                return {
                    body: [b.top, b.bottom],
                    foot: [f.top, f.bottom],
                    // the dialog's inner box: inside its border
                    dialog: [d.top + dialog.clientTop, d.top + dialog.clientTop + dialog.clientHeight],
                    parts: {
                        "Import (the submit button)": inside("button[type=submit]"),
                        "Cancel": inside(".app-dialog-actions button[type=button]"),
                        "the line that says why Import is off": inside("#import-hold"),
                        "the line that says what went wrong": inside("#import-error"),
                    },
                    // what is in the body and is not
                    bodyHolds: {
                        "the title": body.contains(dialog.querySelector("#import-title")),
                        "the tabs": body.contains(dialog.querySelector(".import-tabs")),
                        "the destination": body.contains(dialog.querySelector("#import-into-new")),
                    },
                    buttonsInBody: body.querySelector("button[type=submit], .app-dialog-actions") !== null,
                    linesInBody: body.querySelector("#import-hold, #import-error") !== null,
                };
            });
            for (const [part, held] of Object.entries(layout.parts)) {
                expect(held, `${part} is in the foot`).toBe(true);
            }
            for (const [part, held] of Object.entries(layout.bodyHolds)) {
                expect(held, `${part} is in the body`).toBe(true);
            }
            expect(layout.buttonsInBody, "the body holds no button of the foot").toBe(false);
            expect(layout.linesInBody, "the body holds no line of the foot").toBe(false);
            expect(Math.abs(layout.body[1] - layout.foot[0]), `the body's lower edge (${layout.body[1]}) is the foot's upper edge (${layout.foot[0]})`).toBeLessThanOrEqual(1);
            expect(layout.body[0], "the body starts at or below the dialog's top edge").toBeGreaterThanOrEqual(layout.dialog[0] - 1);
            expect(layout.foot[1], "the foot's lower edge is inside the dialog").toBeLessThanOrEqual(layout.dialog[1] + 1);
            expect(layout.foot[1], "the foot's lower edge is inside the window").toBeLessThanOrEqual(size.height);
        });
    }

    // ---- 2. the walks ----------------------------------------------------------------------------------

    // What one Tab stop looks like once the control and the scroll have stopped moving (four
    // frames at the same place; Firefox scrolls smoothly): where its box lies against the body's
    // box, the foot's and the dialog's, how far the body and the dialog are scrolled, and what is
    // drawn at its centre.
    const stopOf = async () => {
        const el = document.activeElement;
        const dialog = document.querySelector("#import-dialog");
        if (!el || !dialog.contains(el)) {
            return null;
        }
        const body = dialog.querySelector(".import-body");
        const foot = dialog.querySelector(".import-foot");
        let place = "";
        let still = 0;
        for (let frame = 0; frame < 120 && still < 4; frame++) {
            const now = el.getBoundingClientRect();
            const at = `${now.top},${now.left},${body.scrollTop},${dialog.scrollTop}`;
            still = at === place ? still + 1 : 0;
            place = at;
            await new Promise((resolve) => requestAnimationFrame(resolve));
        }
        const box = el.getBoundingClientRect();
        const x = box.left + box.width / 2;
        const y = box.top + box.height / 2;
        const drawn = document.elementFromPoint(x, y);
        const b = body.getBoundingClientRect();
        const d = dialog.getBoundingClientRect();
        return {
            name: el.id || el.className || el.localName,
            cancel: el.matches(".app-dialog-actions button[type=button]"),
            inFoot: foot.contains(el),
            onScreen: x >= 0 && x <= window.innerWidth && y >= 0 && y <= window.innerHeight,
            covered: Boolean(drawn && foot.contains(drawn)),
            top: box.top,
            bottom: box.bottom,
            bodyTop: b.top,
            bodyBottom: b.bottom,
            // (the dialog's inner box: inside its border)
            dialogTop: d.top + dialog.clientTop,
            dialogBottom: d.top + dialog.clientTop + dialog.clientHeight,
            bodyScroll: body.scrollTop,
            dialogScroll: dialog.scrollTop,
            bodyRoom: body.scrollHeight - body.clientHeight,
            // how far its focus ring reaches beyond its box, from its own style
            ring: parseFloat(getComputedStyle(el).outlineWidth) + parseFloat(getComputedStyle(el).outlineOffset),
        };
    };

    // ((a) forward from the first control to Cancel, (b) back again with Shift+Tab to the first.)
    // Each stop also says how far the body moved to bring it there, and so where its box lay
    // before the key was pressed.
    async function walk(page, key, until, label) {
        const stops = [];
        let before = await page.evaluate(() => document.querySelector("#import-dialog .import-body").scrollTop);
        for (let i = 0; i < 40; i++) {
            await page.keyboard.press(key);
            const stop = await page.evaluate(stopOf);
            expect(stop, `${label} stop ${i + 1}: the focus stays in the dialog`).not.toBeNull();
            stop.moved = stop.bodyScroll - before;
            before = stop.bodyScroll;
            stops.push(stop);
            if (until(stop)) {
                break;
            }
        }
        return stops;
    }

    // What every stop must satisfy. On screen, and its centre not drawn under the foot. Its
    // box wholly between the body's top and bottom edge when it is not higher than the body (the
    // preview, a Tab stop 300 px high, was left with 70 px of it cut off in Firefox at 1280x800
    // while its centre was in view); a button of the foot inside the dialog. The dialog itself is
    // not scrolled. A control that was wholly in view before the key was pressed (its place then
    // is its place now plus what the body moved) was moved by the air at most, and a button of
    // the foot moves nothing.
    function expectClear(stops, label, air) {
        for (const stop of stops) {
            const where = `${label}: ${stop.name}`;
            expect(stop.onScreen, `${where} is on screen`).toBe(true);
            expect(stop.dialogScroll, `${where}: the dialog's own scrollTop`).toBe(0);
            if (stop.inFoot) {
                expect(stop.top, `${where} (in the foot) is inside the dialog`).toBeGreaterThanOrEqual(stop.dialogTop - 0.5);
                expect(stop.bottom, `${where} (in the foot) is inside the dialog`).toBeLessThanOrEqual(stop.dialogBottom + 0.5);
                expect(Math.abs(stop.moved), `${where} (in the foot) did not scroll the body`).toBeLessThanOrEqual(0.5);
                continue;
            }
            expect(stop.covered, `${where} is not under the foot`).toBe(false);
            if (stop.bottom - stop.top <= stop.bodyBottom - stop.bodyTop) {
                expect(stop.bottom, `${where}: its bottom (${stop.top} to ${stop.bottom}) is at or above the body's lower edge (${stop.bodyBottom})`).toBeLessThanOrEqual(stop.bodyBottom + 0.5);
                expect(stop.top, `${where}: its top (${stop.top} to ${stop.bottom}) is at or below the body's upper edge (${stop.bodyTop})`).toBeGreaterThanOrEqual(stop.bodyTop - 0.5);
            }
            const inViewBefore = stop.top + stop.moved >= stop.bodyTop - 0.5 && stop.bottom + stop.moved <= stop.bodyBottom + 0.5;
            if (inViewBefore) {
                expect(Math.abs(stop.moved), `${where} was wholly in view and the body moved by ${stop.moved} px (the air is ${air} px)`).toBeLessThanOrEqual(air + 0.5);
            }
        }
    }

    // Before the fixes a control that took the focus could be left under the bar of buttons: at
    // 200% zoom of a laptop (683x384) and on a phone (360x740) the student typed into a field
    // they could not see. At 1280x800 Chromium scrolled the preview clear and Firefox left it
    // cut off at the body's edge.
    for (const size of [
        { width: 683, height: 384 },
        { width: 360, height: 740 },
        { width: 1280, height: 800 },
    ]) {
        test(`at ${size.width}x${size.height}, no control that Tab or Shift+Tab reaches is cut off or under the foot, nothing moves that was in view, and nothing scrolls sideways`, async ({ app, page }) => {
            await page.setViewportSize(size);
            await openDialog(app, fixturePath("messy_sales.csv"));
            await page.evaluate(() => document.fonts.ready);
            const air = await airOf(page);
            expect(air, "the body keeps some air at its edges for a focus ring").toBeGreaterThan(0);
            // From the first control of the dialog to Cancel, which is the last. The region that
            // holds the preview is a Tab stop too, and is held to the same rule as a field.
            await page.locator("#import-into-new").focus();
            const stops = await walk(page, "Tab", (stop) => stop.cancel, "forward");
            const names = stops.map((stop) => stop.name);
            // (the walk was made: every kind of control of a tab, the destination and both buttons)
            for (const part of ["import-database-name", "-name", "-delimiter", "-encoding", "-has-names", "-names-row", "import-preview"]) {
                expect(
                    names.some((name) => name.includes(part)),
                    `${part} is a Tab stop: ${names.join(", ")}`
                ).toBe(true);
            }
            expect(stops.at(-1).cancel, "the walk ended on Cancel").toBe(true);
            expectClear(stops, "forward", air);

            // and back from Cancel to the first control, the same controls the other way
            const back = await walk(page, "Shift+Tab", (stop) => stop.name === "import-into-new", "back");
            expect(back.at(-1).name, "the walk back ended on the first control").toBe("import-into-new");
            const namesBack = back.map((stop) => stop.name);
            for (const part of ["import-database-name", "-name", "-delimiter", "-encoding", "-has-names", "-names-row", "import-preview"]) {
                expect(
                    namesBack.some((name) => name.includes(part)),
                    `${part} is a Tab stop going back: ${namesBack.join(", ")}`
                ).toBe(true);
            }
            expectClear(back, "back", air);

            const widths = await page.evaluate(() => {
                const dialog = document.querySelector("#import-dialog");
                const body = dialog.querySelector(".import-body");
                return {
                    dialog: [dialog.scrollWidth, dialog.clientWidth],
                    body: [body.scrollWidth, body.clientWidth],
                    page: [document.documentElement.scrollWidth, window.innerWidth],
                };
            });
            expect(widths.dialog[0], "the dialog does not scroll sideways").toBeLessThanOrEqual(widths.dialog[1]);
            expect(widths.body[0], "the body does not scroll sideways").toBeLessThanOrEqual(widths.body[1]);
            expect(widths.page[0], "the page does not scroll sideways").toBeLessThanOrEqual(widths.page[1]);
        });
    }

    // The dialog's listener for "focusin" leaves a focus alone while a pointer presses (`pressing`,
    // set by the "mousedown" that comes before the focus and cleared a turn later). Were it never
    // cleared, every focus after the first press would be taken for a press, and the keyboard would
    // no longer be brought into view: in Firefox the preview, a Tab stop 300 px high, was left cut
    // off at the body's edge (75 px of it at 1280x800) after a click on any control. No walk above
    // presses the mouse first; each of these does, and then goes on with Tab. (Chromium scrolls a
    // control into view itself, so there the walk is the same either way.)
    for (const size of [
        { width: 1280, height: 800 },
        { width: 683, height: 384 },
    ]) {
        for (const [pressed, control] of [
            ["the radio of a new database", (app) => app.importDialog.locator("#import-into-new")],
            ["the Table name field", (app) => tableName(app)],
        ]) {
            test(`at ${size.width}x${size.height}, after the mouse pressed ${pressed}, Tab brings the preview wholly into the body, as it does with no press before`, async ({ app, page }) => {
                await page.setViewportSize(size);
                await openDialog(app, fixturePath("messy_sales.csv"));
                await page.evaluate(() => document.fonts.ready);
                const air = await airOf(page);
                await control(app).click();
                await expect(control(app)).toBeFocused();
                await settled(page);
                const stops = await walk(page, "Tab", (stop) => stop.name.includes("import-preview"), "after a press");
                const preview = stops.at(-1);
                expect(preview.name, "the walk reached the preview").toContain("import-preview");
                expect(preview.bottom - preview.top, "(the preview is not higher than the body: the rule below applies to it)").toBeLessThanOrEqual(preview.bodyBottom - preview.bodyTop);
                expect(preview.bottom, `the preview (${preview.top} to ${preview.bottom}) ends inside the body (${preview.bodyBottom})`).toBeLessThanOrEqual(preview.bodyBottom + 0.5);
                expectClear(stops, "after a press", air);
                // The air, by its effect: the preview is brought in at the body's lower edge (it
                // lies below the fields), and ends clear of it by its focus ring's reach and by the
                // air that the body's scroll padding keeps (Firefox leaves it to the dialog's own
                // scroll, which the padding sets). Not when the body cannot scroll further.
                expect(preview.ring, "the preview shows a focus ring (the keyboard gave it the focus)").toBeGreaterThan(0);
                if (preview.bodyScroll < preview.bodyRoom - 0.5) {
                    const gap = preview.bodyBottom - preview.bottom;
                    expect(gap, `the preview ends clear of the body's lower edge (${preview.bodyBottom}) by its focus ring's reach (${preview.ring} px)`).toBeGreaterThanOrEqual(preview.ring - 1);
                    expect(gap, `the preview ends the air (${air} px) clear of the body's lower edge (${preview.bodyBottom})`).toBeGreaterThanOrEqual(air - 1);
                }
            });
        }
    }

    // ---- 3. the buttons of the foot --------------------------------------------------------------------

    // The foot is beside the body, so a button that takes the focus has nothing to scroll: not
    // the body (which the first fixes' bar, over the content, made scroll to its end in Chromium),
    // not the dialog. Tried with the body at its top and at its middle.
    for (const [button, label] of [
        ["importSubmit", "Import"],
        ["importCancel", "Cancel"],
    ]) {
        for (const how of ["by script", "by Tab"]) {
            test(`at 683x384, ${label} takes the focus ${how} without scrolling the body or the dialog, with the body at its top and at its middle`, async ({ app, page }) => {
                await page.setViewportSize({ width: 683, height: 384 });
                await openDialog(app, fixturePath("messy_sales.csv"));
                await page.evaluate(() => document.fonts.ready);
                const room = await roomOf(page);
                expect(room, "the body has room to scroll").toBeGreaterThan(100);
                for (const [where, top] of [
                    ["top", 0],
                    ["middle", Math.round(room / 2)],
                ]) {
                    // the focus is put on the control before the button first (no scroll: the
                    // body is moved after), then the body to where this round tries it
                    await page.evaluate((target) => {
                        const dialog = document.querySelector("#import-dialog");
                        const stops = [...dialog.querySelectorAll("input, select, button, textarea, [tabindex]")].filter(
                            (one) => !one.disabled && one.tabIndex >= 0 && one.getClientRects().length > 0 && !(one.type === "radio" && !one.checked)
                        );
                        const submit = dialog.querySelector("button[type=submit]");
                        const cancel = dialog.querySelector(".app-dialog-actions button[type=button]");
                        const wanted = target === "Import" ? submit : cancel;
                        stops[stops.indexOf(wanted) - 1].focus({ preventScroll: true });
                    }, label);
                    const placed = await scrollBody(page, top);
                    expect(placed.body, `the body is at its ${where}`).toBe(top);
                    if (how === "by script") {
                        // (from a control that is not the button's neighbour: any other will do)
                        await app[button].evaluate((el) => el.focus());
                    } else {
                        await page.keyboard.press("Tab");
                    }
                    await expect(app[button]).toBeFocused();
                    expect(await settled(page), `${label} has the focus ${how}, the body at its ${where}: scrollTop of the body and of the dialog`).toEqual({ body: top, dialog: 0 });
                }
            });
        }
    }

    // ---- 4. the pointer --------------------------------------------------------------------------------

    // A real press is not instant: the button goes down, the page gets frames, and it comes up. A
    // click with no time between its press and its release ends in the same turn as the "mousedown"
    // that the dialog's listener answers, when the focus that a label gives (at the release) would
    // still be taken for the press's own. The press is held until the control that the press gives
    // the focus has it (when there is one) and two frames have been drawn, never for a time.
    async function press(page, point, { focused } = {}) {
        await page.mouse.move(point.x, point.y);
        await page.mouse.down();
        if (focused) {
            await expect(focused).toBeFocused();
        }
        await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
        await page.mouse.up();
    }

    // Puts the control so that its lower edge is `wanted` px below the body's lower edge (a
    // negative number: above it), by scrolling the body. Returns where it lies, with the scroll.
    async function place(page, locator, wanted) {
        const put = () =>
            locator.evaluate((el, gap) => {
                const body = el.closest(".import-body");
                const edge = body.getBoundingClientRect().bottom;
                body.scrollTop += el.getBoundingClientRect().bottom - (edge + gap);
                const box = el.getBoundingClientRect();
                return { top: box.top, bottom: box.bottom, left: box.left, width: box.width, height: box.height, edge, scrollTop: body.scrollTop };
            }, wanted);
        await put();
        await settled(page);
        // (once more: the first move may have been cut short by a sub-pixel)
        const at = await put();
        await settled(page);
        return at;
    }
    // the control before and the control after another among the Tab stops of the dialog
    const neighbour = (locator, step) =>
        locator.evaluate(
            (el, by) => {
                const dialog = el.closest("dialog");
                const stops = [...dialog.querySelectorAll("input, select, button, textarea, [tabindex]")].filter(
                    (one) => !one.disabled && one.tabIndex >= 0 && one.getClientRects().length > 0 && !(one.type === "radio" && !one.checked)
                );
                stops[stops.indexOf(el) + by].focus({ preventScroll: true });
            },
            step
        );

    // A control that a pointer is pressing is not moved from under the pointer. The press gives
    // the focus in the same turn as its "mousedown", and the dialog's listener for "focusin"
    // leaves the control alone then: a text field shows its focus even when a mouse gave it,
    // and a double click or a drag in a field that the listener moved landed beside it.
    test("at 683x384, a double click on the Table name field that is half below the body's edge selects the whole name, and the body does not scroll", async ({ app, page }) => {
        await page.setViewportSize({ width: 683, height: 384 });
        await openDialog(app, fixturePath("messy_sales.csv"));
        await page.evaluate(() => document.fonts.ready);
        // one word, so that a double click selects all of it
        await tableName(app).fill("inventory");
        await neighbour(tableName(app), -1);
        const at = await place(page, tableName(app), (await tableName(app).boundingBox()).height / 2);
        expect(at.bottom - at.edge, "half of the field is below the body's lower edge").toBeGreaterThan(at.height / 2 - 1.5);
        expect(at.bottom - at.edge, "half of the field is below the body's lower edge").toBeLessThan(at.height / 2 + 1.5);
        const point = { x: at.left + 30, y: (at.top + at.edge) / 2 };
        expect(await page.evaluate(({ x, y }) => document.elementFromPoint(x, y)?.id, point), "the field is what is drawn where the pointer is").toMatch(/-name$/);
        await page.mouse.dblclick(point.x, point.y);
        await expect(tableName(app)).toBeFocused();
        expect(await settled(page), "the body and the dialog have not scrolled").toEqual({ body: at.scrollTop, dialog: 0 });
        const selection = await tableName(app).evaluate((el) => ({ start: el.selectionStart, end: el.selectionEnd, length: el.value.length }));
        expect(selection, "the whole name is selected").toEqual({ start: 0, end: selection.length, length: selection.length });
        expect(selection.length, "(the name is the word that was typed)").toBe("inventory".length);
    });

    test("at 683x384, a click on the Table name field that is half below the body's edge puts the caret in it, and the body does not scroll", async ({ app, page }) => {
        await page.setViewportSize({ width: 683, height: 384 });
        await openDialog(app, fixturePath("messy_sales.csv"));
        await page.evaluate(() => document.fonts.ready);
        await neighbour(tableName(app), -1);
        const at = await place(page, tableName(app), (await tableName(app).boundingBox()).height / 2);
        expect(at.bottom - at.edge, "half of the field is below the body's lower edge").toBeGreaterThan(at.height / 2 - 1.5);
        const point = { x: at.left + 30, y: (at.top + at.edge) / 2 };
        expect(await page.evaluate(({ x, y }) => document.elementFromPoint(x, y)?.id, point), "the field is what is drawn where the pointer is").toMatch(/-name$/);
        await press(page, point, { focused: tableName(app) });
        await expect(tableName(app)).toBeFocused();
        expect(await settled(page), "the body and the dialog have not scrolled").toEqual({ body: at.scrollTop, dialog: 0 });
        const caret = await tableName(app).evaluate((el) => ({ start: el.selectionStart, end: el.selectionEnd, length: el.value.length }));
        expect(caret.start, "a caret, not a selection").toBe(caret.end);
        expect(caret.end, "the caret is in the name").toBeLessThanOrEqual(caret.length);
    });

    // The tick box lies inside the last 12 px above the body's lower edge: a focus ring's air
    // (the body's scroll padding) would have the dialog move it. A press must not.
    test("at 683x384, a click on the tick box that lies just above the body's lower edge toggles it, and nothing scrolls", async ({ app, page }) => {
        await page.setViewportSize({ width: 683, height: 384 });
        await openDialog(app, fixturePath("messy_sales.csv"));
        await page.evaluate(() => document.fonts.ready);
        await expect(hasNames(app)).toBeChecked();
        const air = await airOf(page);
        await neighbour(hasNames(app), -1);
        expect(air, "the body keeps some air at its edges").toBeGreaterThan(0);
        const at = await place(page, hasNames(app), -air / 3);
        expect(at.edge - at.bottom, "the box is within the air of the body's lower edge, and not at it").toBeGreaterThan(air / 6);
        expect(at.edge - at.bottom, "the box is within the air of the body's lower edge, and not at it").toBeLessThan(air / 2);
        const point = { x: at.left + at.width / 2, y: at.top + at.height / 2 };
        expect(await page.evaluate(({ x, y }) => document.elementFromPoint(x, y)?.id, point), "the box is what is drawn at its centre").toMatch(/-has-names$/);
        await press(page, point, { focused: hasNames(app) });
        await expect(hasNames(app)).not.toBeChecked();
        expect(await settled(page), "the body and the dialog have not scrolled").toEqual({ body: at.scrollTop, dialog: 0 });
        const after = await hasNames(app).boundingBox();
        expect(Math.abs(after.y - at.top), "the box has not moved under the pointer").toBeLessThan(1);
    });

    // A click on the label gives the tick box the focus when the click ends, a turn after the
    // press, and the box does not show its focus then (a mouse gave it): nothing moves it.
    test("at 683x384, a click on the label of that tick box toggles it too, and the dialog's listener does not scroll", async ({ app, page, browserName }) => {
        await page.setViewportSize({ width: 683, height: 384 });
        await openDialog(app, fixturePath("messy_sales.csv"));
        await page.evaluate(() => document.fonts.ready);
        await expect(hasNames(app)).toBeChecked();
        const air = await airOf(page);
        const labelText = app.importPanel.locator(".import-check").filter({ hasText: words.IMPORT_HAS_NAMES_LABEL }).locator("span");
        await neighbour(hasNames(app), -1);
        // (the box is put just above the edge: the label is taller than the box, and its text must be
        // above the edge too, to be pressed)
        expect(air, "the body keeps some air at its edges").toBeGreaterThan(0);
        const at = await place(page, hasNames(app), -air / 3);
        expect(at.edge - at.bottom, "the box is within the air of the body's lower edge, and not at it").toBeGreaterThan(air / 6);
        expect(at.edge - at.bottom, "the box is within the air of the body's lower edge, and not at it").toBeLessThan(air / 2);
        const text = await labelText.boundingBox();
        const point = { x: text.x + text.width / 2, y: text.y + text.height / 2 };
        expect(point.y, "the label's text is above the body's lower edge").toBeLessThan(at.edge - 1);
        expect(await page.evaluate(({ x, y }) => Boolean(document.elementFromPoint(x, y)?.closest("label")?.querySelector("input")?.id.endsWith("-has-names")), point), "the label is what is drawn where the pointer is").toBe(true);
        // (the label gives the box the focus when the press ends: nothing to wait for before that)
        await press(page, point);
        await expect(hasNames(app)).not.toBeChecked();
        await expect(hasNames(app)).toBeFocused();
        const now = await settled(page);
        expect(now.dialog, "the dialog has not scrolled").toBe(0);
        // Firefox leaves the box where it is, and so does the dialog's listener (this is what its
        // test for the focus ring pins: a mutation without it moves the body by the air less the
        // gap). Chromium, whose own focus handling scrolls a control that a label gave the focus
        // by the air (with no listener at all it does the same), moves it by that at most.
        const own = browserName === "chromium" ? air : 0;
        expect(now.body - at.scrollTop, `the body moved (${at.scrollTop} to ${now.body}) by no more than the browser itself moves it (${own} px)`).toBeLessThanOrEqual(own + 0.5);
        expect(now.body - at.scrollTop).toBeGreaterThanOrEqual(-0.5);
    });

    // The same field, reached with the keyboard from the same scroll position, is another matter:
    // the dialog brings it wholly into view (Chromium does so itself; Firefox does not when part
    // of the field can be seen).
    for (const [key, step] of [
        ["Tab", -1],
        ["Shift+Tab", 1],
    ]) {
        test(`at 683x384, the Table name field that is half below the body's edge is brought wholly into view when ${key} reaches it`, async ({ app, page }) => {
            await page.setViewportSize({ width: 683, height: 384 });
            await openDialog(app, fixturePath("messy_sales.csv"));
            await page.evaluate(() => document.fonts.ready);
            const air = await airOf(page);
            await neighbour(tableName(app), step);
            const at = await place(page, tableName(app), (await tableName(app).boundingBox()).height / 2);
            expect(at.bottom - at.edge, "half of the field is below the body's lower edge").toBeGreaterThan(at.height / 2 - 1.5);
            await page.keyboard.press(key);
            await expect(tableName(app)).toBeFocused();
            await settled(page);
            const now = await tableName(app).evaluate((el) => {
                const body = el.closest(".import-body");
                const box = el.getBoundingClientRect();
                const edges = body.getBoundingClientRect();
                const ring = getComputedStyle(el);
                return {
                    top: box.top,
                    bottom: box.bottom,
                    bodyTop: edges.top,
                    bodyBottom: edges.bottom,
                    scrollTop: body.scrollTop,
                    room: body.scrollHeight - body.clientHeight,
                    // how far the focus ring reaches beyond the field's box, from the field's own style
                    ring: parseFloat(ring.outlineWidth) + parseFloat(ring.outlineOffset),
                };
            });
            expect(now.scrollTop, "the body scrolled to bring the field into view").toBeGreaterThan(at.scrollTop);
            expect(now.bottom, `the field (${now.top} to ${now.bottom}) is wholly above the body's lower edge (${now.bodyBottom})`).toBeLessThanOrEqual(now.bodyBottom + 0.5);
            expect(now.top, "and below its upper edge").toBeGreaterThanOrEqual(now.bodyTop - 0.5);
            // The air, by its effect: the edge it was cut by is the body's lower one, and the field
            // ends clear of it by at least its focus ring's reach (the field's own outline, read
            // from its style), and by the air that the body's scroll padding says it keeps. Not when
            // the body cannot scroll further than it has. (Firefox's own scroll for a Tab brings a
            // field that is part out of view to the middle of the body, so the air is seen here in
            // Chromium; the preview, which Firefox leaves to the dialog, shows it there: see the
            // walks after a press.)
            expect(now.ring, "the field shows a focus ring (the keyboard gave it the focus)").toBeGreaterThan(0);
            const gap = now.bodyBottom - now.bottom;
            const atEnd = now.scrollTop >= now.room - 0.5;
            if (!atEnd) {
                expect(gap, `the field (ends at ${now.bottom}) ends clear of the body's lower edge (${now.bodyBottom}) by its focus ring's reach (${now.ring} px)`).toBeGreaterThanOrEqual(now.ring - 1);
            }
            expect(air, "the body keeps some air at its edges, and it holds the focus ring").toBeGreaterThanOrEqual(now.ring);
            if (!atEnd) {
                expect(gap, `the field ends the air (${air} px) clear of the body's lower edge (${now.bodyBottom})`).toBeGreaterThanOrEqual(air - 1);
            }
        });
    }

    // ---- 5. the lines of the foot are in view when they are shown -------------------------------------------

    // Where a line lies and what is drawn there: inside the dialog's box and the window, and at
    // its centre the line itself, not the buttons or anything else. (When the lines were in the
    // bar's own flow, below the content that scrolled, the line was behind the bar: the student
    // pressed Import and saw nothing happen.)
    // two files whose first tab has a preview tall enough that the body scrolls at 1280x800 too:
    // a line that lay in the body, below the tabs, would then be out of view there
    const TWO_FILES = [fixturePath("messy_sales.csv"), fixturePath("csv/types.csv")];
    const lineOf = (page, selector) =>
        page.evaluate((sel) => {
            const line = document.querySelector(sel);
            const dialog = document.querySelector("#import-dialog");
            const box = line.getBoundingClientRect();
            const d = dialog.getBoundingClientRect();
            const drawn = document.elementFromPoint(box.left + box.width / 2, box.top + box.height / 2);
            return {
                hidden: line.hidden,
                box: [box.top, box.bottom, box.left, box.right],
                dialog: [d.top + dialog.clientTop, d.top + dialog.clientTop + dialog.clientHeight, d.left + dialog.clientLeft, d.left + dialog.clientLeft + dialog.clientWidth],
                window: [window.innerHeight, window.innerWidth],
                drawn: drawn === line || line.contains(drawn),
                drawnName: drawn ? `${drawn.localName}${drawn.id ? `#${drawn.id}` : ""}.${drawn.className}` : null,
            };
        }, selector);
    function expectInView(line, label) {
        expect(line.hidden, `${label} is shown`).toBe(false);
        expect(line.box[0], `${label}: its top is inside the dialog`).toBeGreaterThanOrEqual(line.dialog[0] - 0.5);
        expect(line.box[1], `${label}: its bottom (${line.box[1]}) is inside the dialog (${line.dialog[1]})`).toBeLessThanOrEqual(line.dialog[1] + 0.5);
        expect(line.box[2], `${label}: its left is inside the dialog`).toBeGreaterThanOrEqual(line.dialog[2] - 0.5);
        expect(line.box[3], `${label}: its right is inside the dialog`).toBeLessThanOrEqual(line.dialog[3] + 0.5);
        expect(line.box[0], `${label}: its top is in the window`).toBeGreaterThanOrEqual(0);
        expect(line.box[1], `${label}: its bottom is in the window`).toBeLessThanOrEqual(line.window[0]);
        expect(line.drawn, `${label} is what is drawn at its centre (${line.drawnName})`).toBe(true);
    }

    for (const size of [
        { width: 1280, height: 800 },
        { width: 683, height: 384 },
    ]) {
        test(`at ${size.width}x${size.height}, with the body at its top, the line that says why Import is off is in view`, async ({ app, page }) => {
            await page.setViewportSize(size);
            await openDialog(app, TWO_FILES);
            await page.evaluate(() => document.fonts.ready);
            await selectTab(app, "types.csv");
            await namesRow(app).fill("999");
            await expect(alertIn(app, words.importNamesRowMessage(parseCsv(fs.readFileSync(TWO_FILES[1], "utf8")).length))).toBeVisible();
            await selectTab(app, "messy_sales.csv");
            await expect(holdLine(app)).toHaveText(words.importHoldProblemMessage("types.csv"));
            expect((await scrollBody(page, 0)).body).toBe(0);
            expectInView(await lineOf(page, "#import-hold"), "the line that says why Import is off");
        });

        test(`at ${size.width}x${size.height}, with the body at its top, the line that says why Import could not start is in view, and the focus is on Cancel`, async ({ app, page }) => {
            await page.setViewportSize(size);
            await openDialog(app, TWO_FILES);
            await page.evaluate(() => document.fonts.ready);
            // (the preview was made with the library: take it off the page and let no request for it succeed, as the library-failure test does)
            await page.evaluate(() => {
                delete window.Papa;
            });
            await page.route(READER_URL, (route) => route.abort());
            expect((await scrollBody(page, 0)).body).toBe(0);
            await app.importSubmit.click();
            await expect(app.importDialog.locator("#import-error")).toHaveText(words.IMPORT_LIBRARY_FAILED_MESSAGE);
            await expect(app.importCancel).toBeFocused();
            expect(await settled(page), "the body is still at its top, and the dialog too").toEqual({ body: 0, dialog: 0 });
            expectInView(await lineOf(page, "#import-error"), "the line that says what went wrong");
        });
    }

    // A file over 50 MB asks first, in its tab. In a low window the two answers lie below what the
    // body shows when the dialog opens: Import is off, and the line beside it is all that is in
    // view to say why. So a file that waits is named whichever tab is on show, its own included
    // (The line was once kept for the other tabs only, and on the tab of
    // the file itself nothing said anything.)
    test("at 683x384 one file over 50 MB: its two answers are below what the body shows when the dialog opens, and the line beside Import names the file, in view", async ({ app, page }) => {
        test.slow();
        await page.setViewportSize({ width: 683, height: 384 });
        await app.open(OPEN);
        await dropMade(page, [LARGE("big.csv")]);
        await expect(readButton(app)).toBeAttached();
        await page.evaluate(() => document.fonts.ready);
        await settled(page);
        const edges = await page.evaluate(() => ({
            answers: document.querySelector(".import-warning-answers").getBoundingClientRect().top,
            body: document.querySelector(".import-body").getBoundingClientRect().bottom,
        }));
        expect(edges.answers, "the two answers start below what the body shows").toBeGreaterThanOrEqual(edges.body);
        await expect(app.importSubmit).toBeDisabled();
        await expect(holdLine(app)).toHaveText(words.importHoldWaitingMessage("big.csv"));
        await expect(app.importSubmit).toHaveAttribute("aria-describedby", "import-hold");
        expectInView(await lineOf(page, "#import-hold"), "the line that says why Import is off");
        // The line came after the dialog had opened with the focus on the file's tab, which lies
        // at the body's lower edge here: the foot grew by the line, the body lost as much from
        // below, and the tab is brought back whole (it was left cut in half, its ring with it).
        await settled(page);
        const focused = await page.evaluate(() => {
            const control = document.activeElement;
            const box = control.getBoundingClientRect();
            const body = document.querySelector(".import-body").getBoundingClientRect();
            return { role: control.getAttribute("role"), top: box.top, bottom: box.bottom, bodyTop: body.top, bodyBottom: body.bottom };
        });
        expect(focused.role, "the file's tab has the focus").toBe("tab");
        expect(focused.top, "the focused tab's top is inside the body").toBeGreaterThanOrEqual(focused.bodyTop - 0.5);
        expect(focused.bottom, `the focused tab's bottom (${focused.bottom}) is inside the body (${focused.bodyBottom})`).toBeLessThanOrEqual(focused.bodyBottom + 0.5);
    });

    // ---- 5b. the last resort: the foot alone is higher than the room ------------------------------

    // The header of css/import.css: should the foot alone be higher than the room there is, the
    // dialog itself scrolls. The body is then no more than its padding and the foot is the one thing
    // that is in the way, so a foot that floated over what is under it (position: sticky, with a
    // background) would cover the tabs and every control: a click on a tab never found its target.
    // 400x100 is low enough for it (measured: the foot is 69 px high and the dialog's inner box
    // 66 px, in both browsers; the test says so before it goes on) and wide enough that no line
    // wraps beyond what the foot's height already makes certain.
    test("at 400x100, with the foot higher than the dialog, nothing is out of reach: the tabs can be clicked, every control that Tab reaches is seen, and so are Import and Cancel", async ({ app, page }) => {
        await page.setViewportSize({ width: 400, height: 100 });
        await openDialog(app, [csv("one.csv"), csv("two.csv")]);
        await page.evaluate(() => document.fonts.ready);
        const state = await page.evaluate(() => {
            const dialog = document.querySelector("#import-dialog");
            return {
                foot: dialog.querySelector(".import-foot").getBoundingClientRect().height,
                inner: dialog.clientHeight,
                scrolls: dialog.scrollHeight - dialog.clientHeight,
            };
        });
        expect(state.foot, "the foot alone is higher than the room in the dialog").toBeGreaterThan(state.inner);
        expect(state.scrolls, "the dialog itself scrolls (its content is longer than it)").toBeGreaterThan(0);

        // a tab of the strip, each of the two: a click needs the tab to be what is drawn at its
        // centre (a click that cannot find its target waits for it, so it is bounded)
        await app.importTabs.nth(1).click({ timeout: 5000 });
        await expect(app.importTabs.nth(1)).toHaveAttribute("aria-selected", "true");
        await app.importTabs.nth(0).click({ timeout: 5000 });
        await expect(app.importTabs.nth(0)).toHaveAttribute("aria-selected", "true");

        // What a stop shows: the part of the control that is inside every box that clips it (the
        // dialog's inner box, the body's when it is in the body, the window), and whether the
        // control is what is drawn at the middle of that part.
        const seenOf = async () => {
            const el = document.activeElement;
            const dialog = document.querySelector("#import-dialog");
            const body = dialog.querySelector(".import-body");
            if (!el || !dialog.contains(el)) {
                return null;
            }
            // (the dialog scrolls smoothly in Firefox: wait for four frames at the same place)
            let place = "";
            let still = 0;
            for (let frame = 0; frame < 120 && still < 4; frame++) {
                const now = el.getBoundingClientRect();
                const at = `${now.top},${body.scrollTop},${dialog.scrollTop}`;
                still = at === place ? still + 1 : 0;
                place = at;
                await new Promise((resolve) => requestAnimationFrame(resolve));
            }
            const box = el.getBoundingClientRect();
            const d = dialog.getBoundingClientRect();
            const clips = [
                { top: d.top + dialog.clientTop, bottom: d.top + dialog.clientTop + dialog.clientHeight },
                { top: 0, bottom: window.innerHeight },
            ];
            if (body.contains(el)) {
                const b = body.getBoundingClientRect();
                clips.push({ top: b.top, bottom: b.bottom });
            }
            const top = Math.max(box.top, ...clips.map((clip) => clip.top));
            const bottom = Math.min(box.bottom, ...clips.map((clip) => clip.bottom));
            const x = box.left + box.width / 2;
            const y = (top + bottom) / 2;
            const drawn = document.elementFromPoint(x, y);
            return {
                name: el.id || el.className || el.localName,
                box: [box.top, box.bottom],
                seen: bottom - top,
                drawn: Boolean(drawn && (drawn === el || el.contains(drawn))),
                drawnName: drawn ? `${drawn.localName}${drawn.id ? `#${drawn.id}` : ""}.${drawn.className}` : null,
                inDialog: [box.top >= clips[0].top - 0.5, box.bottom <= clips[0].bottom + 0.5],
                cancel: el.matches(".app-dialog-actions button[type=button]"),
                submit: el.matches("button[type=submit]"),
            };
        };
        await page.locator("#import-into-new").focus();
        const stops = [];
        for (let i = 0; i < 30; i++) {
            await page.keyboard.press("Tab");
            const stop = await page.evaluate(seenOf);
            expect(stop, `stop ${i + 1}: the focus stays in the dialog`).not.toBeNull();
            stops.push(stop);
            if (stop.cancel) {
                break;
            }
        }
        for (const stop of stops) {
            expect(stop.seen, `${stop.name} can be seen at least in part inside the dialog's box`).toBeGreaterThan(0);
            expect(stop.drawn, `${stop.name} is what is drawn at the middle of the part that is seen (${stop.drawnName})`).toBe(true);
        }
        expect(stops.at(-1).cancel, "Cancel can be reached").toBe(true);
        const submit = stops.find((stop) => stop.submit);
        expect(submit, "Import can be reached with Tab").toBeDefined();
        for (const stop of [submit, stops.at(-1)]) {
            expect(stop.inDialog, `${stop.name} lies wholly inside the dialog's box (top, bottom)`).toEqual([true, true]);
        }
    });

    // ---- 6. the dialog is busy while the import runs, and not after ---------------------------------------------

    test("the dialog has aria-busy while the import runs, and the closed dialog has none after it", async ({ app, page }) => {
        // the library's second request waits: the first (the preview) goes through
        let release;
        const gate = new Promise((resolve) => (release = resolve));
        let requests = 0;
        await page.route(READER_URL, async (route) => {
            requests++;
            if (requests > 1) {
                await gate;
            }
            await route.continue().catch(() => {});
        });
        await openDialog(app, csv("busy.csv"));
        expect(await app.importDialog.getAttribute("aria-busy"), "not busy before Import is pressed").toBeNull();
        // (the import must ask for the library again: it waits on the gate)
        await page.evaluate(() => {
            delete window.Papa;
        });
        await app.importSubmit.click();
        await expect(app.importDialog.locator(".import-progress")).toBeVisible();
        await expect(app.importDialog).toHaveAttribute("aria-busy", "true");
        release();
        await expect(app.importDialog).toBeHidden();
        await expect(app.pane).toHaveAttribute("data-state", "report");
        expect(await app.importDialog.getAttribute("aria-busy"), "the closed dialog is not busy").toBeNull();
    });
});

test.describe("white space at an end of a field", () => {
    // The tint alone was 1.07:1 against the page and is not drawn in forced colours: the mark is
    // also an underline. The cell of a field with a space at an end is marked; the others are not.
    const MODES = [
        ["light", { colorScheme: "light" }],
        ["dark", { colorScheme: "dark" }],
        ["forced colours", { forcedColors: "active" }],
    ];
    for (const [mode, media] of MODES) {
        test(`is underlined in ${mode}, and a field without it is not`, async ({ app, page }) => {
            await page.emulateMedia({ reducedMotion: "reduce", ...media });
            await openDialog(app, csv("spaces.csv", 'name,note\n"Ann ",ok\nBob,fine\n" Cy",fine\n'));
            const lines = await app.importPanel.locator(".import-preview-table td").evaluateAll((cells) =>
                cells.map((td) => ({
                    text: td.textContent,
                    marked: td.classList.contains("import-cell--spaces"),
                    line: getComputedStyle(td.querySelector(".import-cell-text")).textDecorationLine,
                }))
            );
            // (the header's cells and the data's: "Ann " and " Cy" have a space at an end)
            expect(lines.filter((cell) => cell.marked).map((cell) => cell.text)).toEqual(["Ann ", " Cy"]);
            for (const cell of lines) {
                if (cell.marked) {
                    expect(cell.line, `${JSON.stringify(cell.text)} is underlined`).toContain("underline");
                } else {
                    expect(cell.line, `${JSON.stringify(cell.text)} is not underlined`).not.toContain("underline");
                }
            }
        });
    }
});

// ---- 11. a reading that the student's own settings made impossible -----------------------------------

test.describe("a delimiter or an encoding that cannot make a table", () => {
    test("a delimiter that makes a row too wide is said in the tab, with the preview gone and Import off; the choice can be changed back", async ({ app, page }) => {
        await app.open(OPEN);
        await app.chooseFiles([wide(), csv("ok.csv")]);
        await expect(app.importDialog).toBeVisible();
        await expect(app.importDialog.locator(".import-reading")).toHaveCount(0);
        const delimiter = delimiterOf(app);
        // Papa's guess is the pipe: the file as it is has a way that works, so it is not refused
        expect(await shown(delimiter)).toBe("Pipe");
        await expect(app.importSubmit).toBeEnabled();
        // a names row that is too far down: the other message, to be kept out of the way of the problem
        await namesRow(app).fill("999");
        await expect(alertIn(app, words.importNamesRowMessage(3))).toBeVisible();

        await delimiter.focus();
        await delimiter.selectOption(",");
        const problem = problemLine(app);
        await expect(problem).toBeVisible();
        await expect(problem).toHaveText(words.IMPORT_SETTINGS_TOO_WIDE_MESSAGE);
        await expect(problem).toHaveAttribute("role", "alert");
        // in place of the preview; Import is off
        await expect(app.importPanel.locator(".import-preview")).toBeHidden();
        await expect(app.importPanel.locator(".import-preview-table")).toHaveCount(0);
        await expect(app.importSubmit).toBeDisabled();
        // the tab is not refused: its controls stay, and the focus stays on the one that was used
        await expect(delimiter).toBeEnabled();
        await expect(delimiter).toBeFocused();
        await expect(app.page.getByRole("tab", { name: "wide.csv", exact: true })).toBeVisible();
        await expect(app.importTabs.filter({ hasText: words.IMPORT_REFUSED_TAB_TEXT })).toHaveCount(0);
        await expect(app.importPanel.locator(".import-refusal")).toHaveCount(0);
        expect(await shown(delimiter)).toBe("Comma");
        // the names-row error does not show on top of the problem: the problem is the one alert
        await expect(app.importPanel.locator('[role="alert"]:not([hidden])')).toHaveCount(1);
        await expect(namesRow(app)).not.toHaveAttribute("aria-invalid", "true");

        // the select is still usable: back to the pipe
        await delimiter.selectOption("|");
        await expect(problem).toBeHidden();
        await expect(app.importPanel.locator(".import-preview-table")).toBeVisible();
        const first = (await previewRows(app))[0].cells;
        expect(first.length).toBe(2);
        expect(first[0].startsWith("c0,c1,c2,")).toBe(true);
        expect(first[1]).toBe("x");
        // (the names row said 999: its error is back, and Import is off for it)
        await expect(alertIn(app, words.importNamesRowMessage(3))).toBeVisible();
        await expect(app.importSubmit).toBeDisabled();
        await namesRow(app).fill("1");
        await expect(app.importSubmit).toBeEnabled();
        // the other file was never in the way
        await expect(app.importTabs).toHaveText(["wide.csv", "ok.csv"]);
    });

    test("an encoding that fits the bytes but leaves no complete row in the first megabyte is said in the tab, and UTF-8 brings the preview back", async ({ app }) => {
        await openDialog(app, bigAscii());
        expect(await shown(encodingOf(app))).toBe("UTF-8");
        expect((await previewRows(app))[0].cells).toEqual(["id", "name"]);
        await encodingOf(app).focus();
        await encodingOf(app).selectOption({ label: "UTF-16, little-endian" });
        const problem = problemLine(app);
        await expect(problem).toBeVisible();
        await expect(problem).toHaveText(words.IMPORT_SETTINGS_NO_ROW_MESSAGE);
        await expect(problem).toHaveAttribute("role", "alert");
        // the bytes do fit (an even number of them): no complaint under Text encoding
        await expect(alertIn(app, "not UTF-16")).toHaveCount(0);
        await expect(encodingOf(app)).not.toHaveAttribute("aria-invalid", "true");
        await expect(app.importPanel.locator(".import-preview")).toBeHidden();
        await expect(app.importSubmit).toBeDisabled();
        await expect(encodingOf(app)).toBeFocused();
        await expect(encodingOf(app)).toBeEnabled();
        await expect(app.page.getByRole("tab", { name: "bigtext.csv", exact: true })).toBeVisible();
        await expect(app.importTabs.filter({ hasText: words.IMPORT_REFUSED_TAB_TEXT })).toHaveCount(0);

        await encodingOf(app).selectOption({ label: "UTF-8" });
        await expect(problem).toBeHidden();
        await expect(app.importPanel.locator(".import-preview-table")).toBeVisible();
        expect((await previewRows(app))[0].cells).toEqual(["id", "name"]);
        await expect(app.importSubmit).toBeEnabled();
    });

    test("on the first reading a file of more than 1 MB with no line break in its first megabyte is refused with its reason, and another file can still be imported", async ({ app }) => {
        await app.open(OPEN);
        // (a first line of 1.3 MB: no complete row of it is in the first megabyte)
        await app.chooseFiles([csv("long.csv", `id;${"z".repeat(1300000)}\r\n1;a\r\n2;b\r\n`), csv("ok.csv", "p,q\n1,2\n")]);
        await expect(app.importDialog).toBeVisible();
        await expect(app.importDialog.locator(".import-reading")).toHaveCount(0);
        await expect(refusedTab(app, "long.csv")).toBeVisible();
        await app.importTabs.filter({ hasText: "long.csv" }).click();
        await expect(app.importPanel.locator(".import-refusal")).toHaveText(words.IMPORT_NO_ROW_REASON);
        await expect(app.importPanel.getByLabel(words.IMPORT_TABLE_NAME_LABEL)).toHaveCount(0);
        // the other file is fine, and is the one that names the new database
        await expect(app.importSubmit).toBeEnabled();
        await expect(app.importDialog.locator("#import-database-name")).toHaveValue("ok");
        await app.importSubmit.click();
        await expect(app.importDialog).toBeHidden();
        expect(await app.rows("SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name")).toEqual([["ok"]]);
    });
});

// ---- 12. Import waits for the newest reading ------------------------------------------------

test.describe("Import and the reading of a tab", () => {
    // the text of a file that reads differently with each delimiter
    const MIXED = "a;b|c\n1;2|3\n";
    const columnsOf = (app, table) => app.rows(`SELECT name FROM pragma_table_info('${table}') ORDER BY cid`);

    // Holds the next readings of the preview of a file (the slice of its first megabyte) that the
    // list marks with true, each until the test lets it go (releaseHeld): the first of three
    // changes can then end last, whatever the speed of the machine. No timer is involved.
    async function holdNextReadings(page, holds) {
        await page.evaluate((list) => {
            window.__holds = list;
            window.__release = [];
            window.__late = 0;
            if (window.__held) {
                return;
            }
            window.__held = true;
            const original = Blob.prototype.slice;
            Blob.prototype.slice = function slice(...args) {
                const part = original.apply(this, args);
                if (args[0] === 0 && args[1] === 1024 * 1024 && window.__holds.length) {
                    const hold = window.__holds.shift();
                    const bytes = part.arrayBuffer.bind(part);
                    part.arrayBuffer = async () => {
                        if (hold) {
                            await new Promise((resolve) => window.__release.push(resolve));
                        }
                        const buffer = await bytes();
                        window.__late += hold ? 1 : 0;
                        return buffer;
                    };
                }
                return part;
            };
        }, holds);
    }
    // lets go of the reading that is held (the page must have asked for it: waited for here)
    async function releaseHeld(page) {
        await page.waitForFunction(() => window.__release.length === 1);
        await page.evaluate(() => window.__release.shift()());
    }
    const afterTwoFrames = (page) => page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));

    test("Import is off at the moment a new delimiter is chosen, and an import started when it is on again uses the new delimiter", async ({ app, page }) => {
        await openDialog(app, csv("semi.csv", "x;y\n1;2\n"));
        expect(await shown(delimiterOf(app))).toBe("Semicolon");
        await expect(app.importSubmit).toBeEnabled();
        // all in one task, as a fast hand and a slow reading would meet: the change, then a press of Import
        const state = await page.evaluate(() => {
            const select = document.querySelector("#import-dialog .import-panel:not([hidden]) select[id$='-delimiter']");
            const submit = document.querySelector('#import-dialog button[type="submit"]');
            select.value = ",";
            select.dispatchEvent(new Event("change", { bubbles: true }));
            const disabled = submit.disabled;
            submit.click();
            return { disabled, open: document.querySelector("#import-dialog").open };
        });
        expect(state.disabled, "Import is disabled in the task of the change").toBe(true);
        // the press did nothing: the dialog is as it was, and the file was not imported with the old delimiter
        expect(state.open).toBe(true);
        await expect(app.importSubmit).toBeEnabled();
        await expect(app.importDialog).toBeVisible();
        expect(await shown(delimiterOf(app))).toBe("Comma");
        expect((await previewRows(app))[0].cells).toEqual(["x;y"]);
        await app.importSubmit.click();
        await expect(app.importDialog).toBeHidden();
        await expect(app.pane).toHaveAttribute("data-state", "report");
        // one column, "x;y" under the comma (two, x and y, under the semicolon)
        expect((await columnsOf(app, "semi")).length).toBe(1);
    });

    // the delimiter chosen in the select of the tab on show, one change event for each value;
    // what each change left of the Import button: whether it is disabled
    const change = (page, values) =>
        page.evaluate((list) => {
            const select = document.querySelector("#import-dialog .import-panel:not([hidden]) select[id$='-delimiter']");
            const submit = document.querySelector('#import-dialog button[type="submit"]');
            return list.map((value) => {
                select.value = value;
                select.dispatchEvent(new Event("change", { bubbles: true }));
                return submit.disabled;
            });
        }, values);

    test("three changes of delimiter in one task end on the last: in the select, in the preview and in the import", async ({ app, page }) => {
        await openDialog(app, csv("mixed.csv", MIXED));
        // Two of the three are over before they read anything: a reading looks at its number
        // when the library has come, and the third has been numbered by then. The one reading
        // that is made, the newest, is held until the test lets it go.
        await holdNextReadings(page, [true, false, false]);
        const disabled = await change(page, [",", ";", "|"]);
        expect(disabled, "Import is off after each change").toEqual([true, true, true]);
        await page.waitForFunction(() => window.__release.length === 1);
        // the newest reading has not ended: Import waits for it, and the preview is what it was
        await expect(app.importSubmit).toBeDisabled();
        expect((await previewRows(app))[0].cells).toEqual(["a", "b|c"]);
        await releaseHeld(page);
        await expect(app.importSubmit).toBeEnabled();
        await page.waitForFunction(() => window.__late === 1);
        await afterTwoFrames(page);
        expect(await shown(delimiterOf(app))).toBe("Pipe");
        expect((await previewRows(app))[0].cells).toEqual(["a;b", "c"]);
        await expect(app.importSubmit).toBeEnabled();
        await app.importSubmit.click();
        await expect(app.importDialog).toBeHidden();
        await expect(app.pane).toHaveAttribute("data-state", "report");
        expect(await columnsOf(app, "mixed")).toEqual([["a_b"], ["c"]]);
        expect(await app.rows("SELECT * FROM mixed")).toEqual([["1;2", 3]]);
    });

    test("a reading that began first and ends last changes nothing: the preview, the select and the import are the newest change's", async ({ app, page }) => {
        await openDialog(app, csv("mixed.csv", MIXED));
        // the first change is being read (held), and then two more are made in one task
        await holdNextReadings(page, [true, false, false]);
        const first = await change(page, [","]);
        await page.waitForFunction(() => window.__release.length === 1);
        const rest = await change(page, [";", "|"]);
        expect([...first, ...rest], "Import is off after each change").toEqual([true, true, true]);
        // (Import is on while the first reading is still held: it is not the newest)
        await expect(app.importSubmit).toBeEnabled();
        expect(await page.evaluate(() => window.__late), "the first reading has not ended").toBe(0);
        expect((await previewRows(app))[0].cells).toEqual(["a;b", "c"]);
        // it ends now, last, and must change nothing (read with the comma, it would be one column)
        await releaseHeld(page);
        await page.waitForFunction(() => window.__late === 1);
        await afterTwoFrames(page);
        expect(await shown(delimiterOf(app))).toBe("Pipe");
        expect((await previewRows(app))[0].cells).toEqual(["a;b", "c"]);
        await expect(app.importSubmit).toBeEnabled();
        await app.importSubmit.click();
        await expect(app.importDialog).toBeHidden();
        await expect(app.pane).toHaveAttribute("data-state", "report");
        expect(await columnsOf(app, "mixed")).toEqual([["a_b"], ["c"]]);
        expect(await app.rows("SELECT * FROM mixed")).toEqual([["1;2", 3]]);
    });
});

// ---- 13. the focus and the names after a refusal ------------------------------------------------

test.describe("after a refusal that takes a focused control away", () => {
    test("the focus goes to the tab's button, not to the page: the library fails to load when the delimiter is changed", async ({ app, page }) => {
        await openDialog(app, csv("x.csv", "a;b\n1;2\n"));
        // the library is on the page: forget it, and let no new request for it succeed
        await page.evaluate(() => {
            delete window.Papa;
        });
        await page.route(READER_URL, (route) => route.abort());
        await delimiterOf(app).focus();
        await delimiterOf(app).selectOption(",");
        await expect(refusedTab(app, "x.csv")).toBeVisible();
        await expect(app.importPanel.locator(".import-refusal")).toHaveText(words.IMPORT_LIBRARY_FAILED_MESSAGE);
        // (the select has gone with the panel's content: the focus must not fall to <body>)
        await expect(refusedTab(app, "x.csv")).toBeFocused();
        expect(await page.evaluate(() => document.activeElement.localName)).not.toBe("body");
        await expect(app.importDialog).toBeVisible();
    });

    test("a file that is refused after it was waited for gives its name back: a.tsv was a_2 beside A.csv, and is a once A.csv is refused", async ({ app, page }) => {
        test.slow();
        await app.open(OPEN);
        // A.csv: just over 50 MB of zeros, which asks first and is then refused as not text. Its
        // name differs from a.tsv's in the case of one letter alone: the names are the same to
        // SQLite (a_2 for the second), and what names the new database tells the two apart.
        await dropMade(page, [{ name: "A.csv", size: 50 * MB + 1 }, { name: "a.tsv", text: "x\ty\n1\t2\n" }]);
        await expect(app.importDialog).toBeVisible();
        await expect(app.importDialog.locator("#import-database-name")).toHaveValue("A");
        await selectTab(app, "a.tsv");
        await expect(tableName(app)).toHaveValue("a_2");
        await selectTab(app, "A.csv");
        await app.importPanel.getByRole("button", { name: words.IMPORT_LARGE_FILE_CONTINUE_TEXT }).click();
        await expect(refusedTab(app, "A.csv")).toBeVisible();
        await expect(app.importPanel).toContainText(words.IMPORT_NOT_TEXT_REASON);
        await selectTab(app, "a.tsv");
        // (what the old refusal got wrong: it gave the database its new name and left a.tsv at a_2)
        await expect(tableName(app)).toHaveValue("a");
        // the new database is named after the file that is left, and its table is a
        await expect(app.importDialog.locator("#import-database-name")).toHaveValue("a");
        await expect(app.importSubmit).toBeEnabled();
        await app.importSubmit.click();
        await expect(app.importDialog).toBeHidden();
        await expect(app.databaseLabel).toHaveText("a");
        expect(await app.rows("SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name")).toEqual([["a"]]);
    });
});

// ---- 14. the line that says why Import is off ----------------------------------------------

test.describe("the line above the buttons that says why Import is off", () => {
    // while the line shows, the Import button is described by it; otherwise it is described by nothing
    const describedBy = (app) => app.importSubmit.getAttribute("aria-describedby");

    test("a names row that cannot be, in the second file: the first tab shows the line, the second says it itself, and fixing it takes the line and the description away", async ({ app }) => {
        await openDialog(app, [csv("one.csv"), csv("two.csv")]);
        await expect(holdLine(app)).toBeHidden();
        expect(await describedBy(app)).toBeNull();
        await selectTab(app, "two.csv");
        await namesRow(app).fill("999");
        await expect(alertIn(app, words.importNamesRowMessage(2))).toBeVisible();
        await expect(app.importSubmit).toBeDisabled();
        // on its own tab the problem is said under the field: no line
        await expect(holdLine(app)).toBeHidden();
        expect(await describedBy(app)).toBeNull();

        await selectTab(app, "one.csv");
        await expect(holdLine(app)).toBeVisible();
        await expect(holdLine(app)).toHaveText(words.importHoldProblemMessage("two.csv"));
        await expect(app.importSubmit).toBeDisabled();
        await expect(app.importSubmit).toHaveAttribute("aria-describedby", "import-hold");
        await expect(app.importSubmit).toHaveAccessibleDescription(words.importHoldProblemMessage("two.csv"));

        await selectTab(app, "two.csv");
        await expect(holdLine(app)).toBeHidden();
        await namesRow(app).fill("2");
        await expect(app.importSubmit).toBeEnabled();
        await selectTab(app, "one.csv");
        await expect(holdLine(app)).toBeHidden();
        await expect(app.importSubmit).toBeEnabled();
        expect(await describedBy(app)).toBeNull();
    });

    test("an encoding that does not fit, in the second file, gives the same line on the first tab", async ({ app }) => {
        await openDialog(app, [csv("one.csv"), { name: "windows1252.csv", mimeType: "text/csv", buffer: fs.readFileSync(fixturePath("windows1252.csv")) }]);
        await selectTab(app, "windows1252.csv");
        await encodingOf(app).selectOption({ label: "UTF-8" });
        await expect(alertIn(app, words.importEncodingMessage("utf-8"))).toBeVisible();
        await expect(app.importSubmit).toBeDisabled();
        await expect(holdLine(app)).toBeHidden();
        await selectTab(app, "one.csv");
        await expect(holdLine(app)).toHaveText(words.importHoldProblemMessage("windows1252.csv"));
        await expect(app.importSubmit).toHaveAttribute("aria-describedby", "import-hold");
        await selectTab(app, "windows1252.csv");
        await encodingOf(app).selectOption({ label: "Windows-1252" });
        await expect(app.importSubmit).toBeEnabled();
        await selectTab(app, "one.csv");
        await expect(holdLine(app)).toBeHidden();
        expect(await app.importSubmit.getAttribute("aria-describedby")).toBeNull();
    });

    test("a problem of the student's own choice of delimiter, in the second file, gives the same line on the first tab", async ({ app }) => {
        await openDialog(app, [csv("one.csv"), wide()]);
        await selectTab(app, "wide.csv");
        await delimiterOf(app).selectOption(",");
        await expect(problemLine(app)).toBeVisible();
        await expect(holdLine(app)).toBeHidden();
        await selectTab(app, "one.csv");
        await expect(holdLine(app)).toHaveText(words.importHoldProblemMessage("wide.csv"));
        await selectTab(app, "wide.csv");
        await delimiterOf(app).selectOption("|");
        await expect(app.importSubmit).toBeEnabled();
        await selectTab(app, "one.csv");
        await expect(holdLine(app)).toBeHidden();
    });

    test("a file over 50 MB that waits for Read this file holds Import up, and the line names it whichever tab is on show", async ({ app, page }) => {
        test.slow();
        await app.open(OPEN);
        await dropMade(page, [{ name: "big.csv", size: 50 * MB + 1 }, { name: "second.csv", text: "a,b\n1,2\n" }]);
        await expect(app.importDialog).toBeVisible();
        await expect(app.importTabs).toHaveText(["big.csv", "second.csv"]);
        await selectTab(app, "second.csv");
        await expect(app.importPanel.getByLabel("Table name")).toBeVisible();
        await expect(holdLine(app)).toHaveText(words.importHoldWaitingMessage("big.csv"));
        await expect(app.importSubmit).toBeDisabled();
        await expect(app.importSubmit).toHaveAttribute("aria-describedby", "import-hold");
        // On its own tab as well, beside the buttons that answer. (The line was once kept for the
        // other tabs only: but in a low window those buttons are below what the body
        // shows, and Import was off with nothing in view to say why.)
        await selectTab(app, "big.csv");
        await expect(app.importPanel.getByRole("button", { name: words.IMPORT_LARGE_FILE_CONTINUE_TEXT })).toBeVisible();
        await expect(holdLine(app)).toHaveText(words.importHoldWaitingMessage("big.csv"));
        await expect(app.importSubmit).toHaveAttribute("aria-describedby", "import-hold");
        // answered (zeros are not text: refused), the file holds nothing up
        await app.importPanel.getByRole("button", { name: words.IMPORT_LARGE_FILE_CONTINUE_TEXT }).click();
        await expect(refusedTab(app, "big.csv")).toBeVisible();
        await selectTab(app, "second.csv");
        await expect(holdLine(app)).toBeHidden();
        await expect(app.importSubmit).toBeEnabled();
        expect(await app.importSubmit.getAttribute("aria-describedby")).toBeNull();
    });

    test("a file over 50 MB that waits is left out with Leave this file out: the line goes and Import turns on, whatever tab is on show", async ({ app, page }) => {
        test.slow();
        await app.open(OPEN);
        await dropMade(page, [LARGE("big.csv"), { name: "second.csv", text: SMALL_TEXT }]);
        await expect(app.importTabs).toHaveText(["big.csv", "second.csv"]);
        await selectTab(app, "second.csv");
        await expect(holdLine(app)).toHaveText(words.importHoldWaitingMessage("big.csv"));
        await expect(app.importSubmit).toBeDisabled();
        await expect(app.importSubmit).toHaveAttribute("aria-describedby", "import-hold");
        await selectTab(app, "big.csv");
        // (on its own tab the line names it too)
        await expect(holdLine(app)).toHaveText(words.importHoldWaitingMessage("big.csv"));
        await leaveButton(app).click();
        await expect(leftOutTab(app, "big.csv")).toBeVisible();
        // answered: there is nothing to say any more
        await expect(holdLine(app)).toBeHidden();
        await expect(app.importSubmit).toBeEnabled();
        // on the other tab: gone, not only hidden (no text left for a screen reader), and not described by it
        await selectTab(app, "second.csv");
        await expect(holdLine(app)).toBeHidden();
        await expect(holdLine(app)).toHaveText("");
        await expect(app.importSubmit).toBeEnabled();
        expect(await app.importSubmit.getAttribute("aria-describedby")).toBeNull();
        await expect(app.importSubmit).toHaveAccessibleDescription("");
    });

    // The line names the first file it can name, and what the tab on show says of itself never
    // decides it. (It once did: with a file that waits on another tab, a key
    // that made a problem in the tab on show took the line away and the key that mended it
    // brought the line back, so the foot, and the body over it, moved with the keys.)
    test("what is typed in the tab on show does not move the line: a file that waits on another tab is named before, during and after a row for the names that cannot be", async ({ app, page }) => {
        test.slow();
        await app.open(OPEN);
        await dropMade(page, [{ name: "small.csv", text: SMALL_TEXT }, LARGE("big.csv")]);
        await expect(app.importTabs).toHaveText(["small.csv", "big.csv"]);
        await expect(tableName(app)).toBeVisible();
        const line = words.importHoldWaitingMessage("big.csv");
        await expect(holdLine(app)).toHaveText(line);
        // (the foot's own height: the line, the buttons and the room round them)
        const foot = () => page.evaluate(() => document.querySelector(".import-foot").getBoundingClientRect().height);
        const before = await foot();
        // a row that is no row: the tab on show has a problem of its own now, said under its field
        await namesRow(app).fill("999");
        await expect(alertIn(app, words.importNamesRowMessage(parseCsv(SMALL_TEXT).length))).toBeVisible();
        await expect(holdLine(app)).toHaveText(line);
        expect(await foot(), "the foot is as high as it was").toBe(before);
        // nothing in the box, which is no row either
        await namesRow(app).fill("");
        await expect(alertIn(app, words.IMPORT_NAMES_ROW_NOT_A_ROW_MESSAGE)).toBeVisible();
        await expect(holdLine(app)).toHaveText(line);
        expect(await foot(), "the foot is as high as it was").toBe(before);
        // and a row that is one again
        await namesRow(app).fill("1");
        await expect(app.importPanel.getByRole("alert").filter({ hasText: /\S/ })).toHaveCount(0);
        await expect(holdLine(app)).toHaveText(line);
        expect(await foot(), "the foot is as high as it was").toBe(before);
        await expect(app.importSubmit).toBeDisabled();
        await expect(app.importSubmit).toHaveAttribute("aria-describedby", "import-hold");
    });

    test("with a problem in the tab on show and another in a second tab, each tab says its own and the line names the other file", async ({ app }) => {
        await openDialog(app, [csv("one.csv"), csv("two.csv")]);
        await selectTab(app, "two.csv");
        await namesRow(app).fill("999");
        await selectTab(app, "one.csv");
        await expect(holdLine(app)).toHaveText(words.importHoldProblemMessage("two.csv"));
        await namesRow(app).fill("999");
        // its own problem is said under its field, and the line goes on naming the other file
        await expect(alertIn(app, words.importNamesRowMessage(2))).toBeVisible();
        await expect(holdLine(app)).toHaveText(words.importHoldProblemMessage("two.csv"));
        await expect(app.importSubmit).toHaveAttribute("aria-describedby", "import-hold");
        // on the second tab it is the first file that the line names
        await selectTab(app, "two.csv");
        await expect(holdLine(app)).toHaveText(words.importHoldProblemMessage("one.csv"));
        // mended there, the first is still named; mended in the first as well, nothing holds Import up
        await namesRow(app).fill("1");
        await expect(holdLine(app)).toHaveText(words.importHoldProblemMessage("one.csv"));
        await selectTab(app, "one.csv");
        await expect(holdLine(app)).toBeHidden();
        await expect(app.importSubmit).toBeDisabled();
        await namesRow(app).fill("1");
        await expect(app.importSubmit).toBeEnabled();
        await expect(holdLine(app)).toBeHidden();
    });

    // When the line comes the foot is higher by it, and the body loses as much from below. A
    // control of the body that has the focus and was whole is brought back when that has cut it
    // (the test at 683x384 with one large file, in section 10), and nothing else moves. (It once
    // did: whenever the line changed the body was scrolled to the focused
    // control, from wherever the student had put it, and a control that was still whole was
    // nudged; and a control was moved from under a pointer that was still held down on it.)
    // The line is made to come by the page's clock, which is the test's: two files that are
    // still being read (their reader is held back), and 600 ms. With the first tab on show it is
    // the second file that the line names.
    async function openReadingPair(app, page, size) {
        let release;
        const gate = new Promise((resolve) => (release = resolve));
        await page.route(READER_URL, async (route) => {
            await gate;
            await route.continue().catch(() => {});
        });
        await page.setViewportSize(size);
        await page.clock.install({ time: new Date("2026-11-16T10:00:00Z") });
        await app.open(OPEN);
        await page.clock.pauseAt(new Date("2026-11-16T10:01:00Z"));
        await app.chooseFiles([csv("one.csv"), csv("two.csv")]);
        await expect(app.importDialog).toBeVisible();
        await expect(app.importDialog.locator(".import-reading")).toHaveCount(2);
        await expect(holdLine(app)).toBeHidden();
        // the readings end when the test lets the reader come, with the clock running again
        return async () => {
            await page.clock.resume();
            release();
            await expect(app.importDialog.locator(".import-reading")).toHaveCount(0);
        };
    }
    // where a control lies in what the body shows, and how far the body is scrolled
    const placeOf = (page, selector) =>
        page.evaluate((sel) => {
            const body = document.querySelector(".import-body");
            const box = document.querySelector(sel).getBoundingClientRect();
            const shown = body.getBoundingClientRect();
            return { top: box.top - shown.top, end: box.bottom - shown.top, whole: box.top >= shown.top && box.bottom <= shown.bottom, scrolled: body.scrollTop };
        }, selector);
    const lineHasCome = (app) => expect(holdLine(app)).toHaveText(words.importHoldReadingMessage("two.csv"));
    // "Has not moved" is to within this many pixels: a body that loses height is laid out again,
    // and a browser may put it a pixel off. (What these tests are for moved it by 8 px and more.)
    const STILL = 2;

    // (The control is a radio button, not a text field: Firefox itself can bring a text field that
    // has the focus back into view when the body changes its height, from wherever it was. It did
    // so in about half of the runs with the dialog's own scrolling taken out, so that is the
    // browser's, and no test can hold the dialog to it.)
    test("when the line comes, a body that the student had scrolled away from the control that has the focus stays where it was put", async ({ app, page }) => {
        const finish = await openReadingPair(app, page, { width: 400, height: 260 });
        const control = "#import-into-new";
        await page.locator(control).focus();
        await page.evaluate(() => {
            const body = document.querySelector(".import-body");
            body.scrollTop = body.scrollHeight;
        });
        const before = await placeOf(page, control);
        expect(before.end, "the control is above what the body shows: none of it can be seen").toBeLessThan(0);
        await page.clock.runFor(600);
        await lineHasCome(app);
        const after = await placeOf(page, control);
        expect(Math.abs(after.scrolled - before.scrolled), `the body is where it was put (${before.scrolled}, now ${after.scrolled})`).toBeLessThan(STILL);
        await expect(page.locator(control)).toBeFocused();
        await finish();
    });

    test("when the line comes, a control that has the focus and is still whole is not moved, though it lies within the air of the body's edge", async ({ app, page }) => {
        const finish = await openReadingPair(app, page, { width: 683, height: 260 });
        const control = "#import-into-new";
        await page.locator(control).focus();
        // 4 px inside the body's upper edge: whole, and nearer the edge than the air that a scroll
        // to it would leave (the body's scroll padding)
        const air = await page.evaluate(() => parseFloat(getComputedStyle(document.querySelector(".import-body")).scrollPaddingTop) || 0);
        expect(air, "the body's scroll padding").toBeGreaterThan(4);
        await page.evaluate((sel) => {
            const body = document.querySelector(".import-body");
            body.scrollTop += document.querySelector(sel).getBoundingClientRect().top - body.getBoundingClientRect().top - 4;
        }, control);
        const before = await placeOf(page, control);
        expect(before.whole, "the control is whole").toBe(true);
        expect(before.top, "and within the air of the upper edge").toBeLessThan(air - 1);
        await page.clock.runFor(600);
        await lineHasCome(app);
        const after = await placeOf(page, control);
        expect(after.whole, "the control is still whole").toBe(true);
        expect(Math.abs(after.scrolled - before.scrolled), `the body has not moved (${before.scrolled}, now ${after.scrolled})`).toBeLessThan(STILL);
        await finish();
    });

    test("when the line comes while a pointer is held down on the tab that has the focus, the tab stays under the pointer, and at the release it is brought back whole", async ({ app, page }) => {
        const finish = await openReadingPair(app, page, { width: 683, height: 384 });
        const tab = `#${await app.importTabs.first().getAttribute("id")}`;
        await expect(page.locator(tab)).toBeFocused();
        const before = await placeOf(page, tab);
        expect(before.whole, "the tab is whole when the dialog has opened").toBe(true);
        const box = await page.locator(tab).boundingBox();
        await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
        await page.mouse.down();
        await page.clock.runFor(600);
        await lineHasCome(app);
        // the foot has grown and cut the tab, and the tab has not moved from under the pointer
        const held = await placeOf(page, tab);
        expect(held.whole, "the line's coming cut the tab").toBe(false);
        expect(Math.abs(held.scrolled - before.scrolled), `the body has not moved under the pointer (${before.scrolled}, now ${held.scrolled})`).toBeLessThan(STILL);
        await page.mouse.up();
        await expect.poll(async () => (await placeOf(page, tab)).whole, { message: "at the release the tab is brought back whole" }).toBe(true);
        await finish();
    });

    test("and when the window loses the focus while the pointer is still down, the release may never be told: the tab is brought back whole then", async ({ app, page }) => {
        const finish = await openReadingPair(app, page, { width: 683, height: 384 });
        const tab = `#${await app.importTabs.first().getAttribute("id")}`;
        const box = await page.locator(tab).boundingBox();
        await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
        await page.mouse.down();
        await page.clock.runFor(600);
        await lineHasCome(app);
        expect((await placeOf(page, tab)).whole, "the line's coming cut the tab, which waits for the release").toBe(false);
        // (the window's own event, as the browser sends it when another window is brought to the front)
        await page.evaluate(() => window.dispatchEvent(new Event("blur")));
        await expect.poll(async () => (await placeOf(page, tab)).whole, { message: "the tab is brought back whole" }).toBe(true);
        await page.mouse.up();
        await finish();
    });

    // What is owed to the tab at the release is done only when the tab is still what the student
    // is at: it still has the focus, and the body is where it was. And a press is held to a
    // release only for the main button; a menu that opens over the press ends it. (The
    // release once threw the body back to a tab that the focus had left, and to a place
    // the student had scrolled away from.) The helper holds the pointer down on the tab at
    // 683x384 and lets the line come, which cuts the tab; the test of another button presses
    // nothing with the mouse, and knows that the tab was cut by the body having been scrolled.
    async function holdOnTabUntilTheLineComes(app, page) {
        const finish = await openReadingPair(app, page, { width: 683, height: 384 });
        const tab = `#${await app.importTabs.first().getAttribute("id")}`;
        const box = await page.locator(tab).boundingBox();
        await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
        await page.mouse.down();
        await page.clock.runFor(600);
        await lineHasCome(app);
        expect((await placeOf(page, tab)).whole, "the line's coming cut the tab, which waits for the release").toBe(false);
        return { tab, finish };
    }
    // Resolves once the body has not moved for 20 frames in a row, with the page's clock running
    // again (a scroll that the release started, smooth in Firefox, has ended by then).
    async function atRest(page) {
        await page.clock.resume();
        await page.evaluate(
            () =>
                new Promise((resolve) => {
                    const body = document.querySelector(".import-body");
                    let last = body.scrollTop;
                    let still = 0;
                    const tick = () => {
                        still = body.scrollTop === last ? still + 1 : 0;
                        last = body.scrollTop;
                        if (still >= 20) {
                            resolve();
                        } else {
                            requestAnimationFrame(tick);
                        }
                    };
                    requestAnimationFrame(tick);
                })
        );
    }

    test("when the keyboard has taken the focus to another control during the held press, the release moves nothing", async ({ app, page }) => {
        const { tab, finish } = await holdOnTabUntilTheLineComes(app, page);
        await page.keyboard.press("Shift+Tab");
        await expect(page.locator(tab)).not.toBeFocused();
        await atRest(page);
        const now = await page.evaluate(() => {
            document.activeElement.dataset.heldFocus = "now";
            return document.activeElement.id;
        });
        const before = await placeOf(page, '[data-held-focus="now"]');
        expect(before.whole, `the control that has the focus now (${now}) is whole`).toBe(true);
        await page.mouse.up();
        await atRest(page);
        const after = await placeOf(page, '[data-held-focus="now"]');
        expect(Math.abs(after.scrolled - before.scrolled), `the body has not moved (${before.scrolled}, now ${after.scrolled})`).toBeLessThan(STILL);
        expect(after.whole, "and the control that has the focus is still whole").toBe(true);
        await finish();
    });

    test("when the body was scrolled during the held press, the release leaves it where it was put", async ({ app, page }) => {
        const { tab, finish } = await holdOnTabUntilTheLineComes(app, page);
        // (as a wheel would, with the button still down: to its very top)
        const put = await page.evaluate(() => {
            const body = document.querySelector(".import-body");
            body.scrollTop = 0;
            return body.scrollTop;
        });
        expect((await placeOf(page, tab)).whole, "the tab is still cut there").toBe(false);
        await page.mouse.up();
        await atRest(page);
        const after = await placeOf(page, tab);
        expect(Math.abs(after.scrolled - put), `the body is where it was put (${put}, now ${after.scrolled})`).toBeLessThan(STILL);
        await finish();
    });

    test("a press of another button is not held to a release: the tab that the line cuts is brought back at once", async ({ app, page }) => {
        const finish = await openReadingPair(app, page, { width: 683, height: 384 });
        const tab = `#${await app.importTabs.first().getAttribute("id")}`;
        await expect(page.locator(tab)).toBeFocused();
        const before = await placeOf(page, tab);
        expect(before.whole, "the tab is whole when the dialog has opened").toBe(true);
        // (the press of a secondary button whose release is never told, as when a menu takes it)
        await page.locator(tab).dispatchEvent("mousedown", { button: 2, buttons: 2, bubbles: true, cancelable: true });
        await page.clock.runFor(600);
        await lineHasCome(app);
        await expect.poll(async () => (await placeOf(page, tab)).whole, { message: "the tab is whole again, with no release" }).toBe(true);
        // (it is whole because the body was scrolled for it: the line had cut it, as in the
        // tests above, and this one does not pass for the line having cut nothing)
        const after = await placeOf(page, tab);
        expect(after.scrolled - before.scrolled, `the body was scrolled to bring the tab back (${before.scrolled}, now ${after.scrolled})`).toBeGreaterThan(STILL);
        await finish();
    });

    test("a menu that opens over a held press ends it: the tab is brought back whole then", async ({ app, page }) => {
        const { tab, finish } = await holdOnTabUntilTheLineComes(app, page);
        // (the page's own event for a menu: the release of the button may never be told after it)
        await page.locator(tab).dispatchEvent("contextmenu", { bubbles: true, cancelable: true });
        await expect.poll(async () => (await placeOf(page, tab)).whole, { message: "the tab is brought back whole" }).toBe(true);
        await page.mouse.up();
        await finish();
    });

    test("a file still being read is named after a moment, when another tab is on show, and the line goes when it has been read", async ({ app, page }) => {
        // the library's request is held: the readings of both files wait for it
        let release;
        const gate = new Promise((resolve) => (release = resolve));
        await page.route(READER_URL, async (route) => {
            await gate;
            await route.continue().catch(() => {});
        });
        await app.open(OPEN);
        await app.chooseFiles([csv("one.csv"), csv("two.csv")]);
        await expect(app.importDialog).toBeVisible();
        await expect(app.importDialog.locator(".import-reading")).toHaveCount(2);
        await selectTab(app, "two.csv");
        // (the line waits 600 ms before it says so: nothing here waits for that, the assertion does)
        await expect(holdLine(app)).toHaveText(words.importHoldReadingMessage("one.csv"));
        await expect(app.importSubmit).toBeDisabled();
        await expect(app.importSubmit).toHaveAttribute("aria-describedby", "import-hold");
        release();
        await expect(app.importDialog.locator(".import-reading")).toHaveCount(0);
        await expect(holdLine(app)).toBeHidden();
        await expect(app.importSubmit).toBeEnabled();
        expect(await app.importSubmit.getAttribute("aria-describedby")).toBeNull();
    });

    test("a file still being read is not named before 600 ms of its reading have passed: nothing at 500 ms, the line at 600", async ({ app, page }) => {
        // The line waits, as a file is read in a moment as a rule (HOLD_READING_AFTER_MS in
        // js/lab/import-dialog.js). The page's clock is the test's: time moves when it says so.
        let release;
        const gate = new Promise((resolve) => (release = resolve));
        await page.route(READER_URL, async (route) => {
            await gate;
            await route.continue().catch(() => {});
        });
        // (a date of the test's own, never the machine's: the clock then starts and stops at the same instants in every run)
        await page.clock.install({ time: new Date("2026-11-16T10:00:00Z") });
        await app.open(OPEN);
        // (stopped here: the reading that follows starts at a time that does not move by itself)
        await page.clock.pauseAt(new Date("2026-11-16T10:01:00Z"));
        await app.chooseFiles([csv("one.csv"), csv("two.csv")]);
        await expect(app.importDialog).toBeVisible();
        await expect(app.importDialog.locator(".import-reading")).toHaveCount(2);
        await selectTab(app, "two.csv");
        // the first file is being read and is not the tab on show, and nothing is said yet
        await expect(app.importSubmit).toBeDisabled();
        await expect(holdLine(app)).toBeHidden();
        await expect(holdLine(app)).toHaveText("");
        await page.clock.runFor(500);
        await expect(holdLine(app)).toBeHidden();
        await expect(holdLine(app)).toHaveText("");
        expect(await app.importSubmit.getAttribute("aria-describedby"), "Import is described by nothing yet").toBeNull();
        // 600 ms of the reading: the line says which file it waits for
        await page.clock.runFor(100);
        await expect(holdLine(app)).toBeVisible();
        await expect(holdLine(app)).toHaveText(words.importHoldReadingMessage("one.csv"));
        await expect(app.importSubmit).toHaveAttribute("aria-describedby", "import-hold");
        // let the reading end: the time moves again, and the library comes
        await page.clock.resume();
        release();
        await expect(app.importDialog.locator(".import-reading")).toHaveCount(0);
        await expect(holdLine(app)).toBeHidden();
        await expect(app.importSubmit).toBeEnabled();
    });

    test("a long file name wraps in the line: at 360 px the dialog and the page do not scroll sideways with the line showing", async ({ app, page }) => {
        await page.setViewportSize({ width: 360, height: 740 });
        const long = `${"L".repeat(150)}.csv`;
        await openDialog(app, [csv("one.csv"), csv(long)]);
        await app.importTabs.nth(1).click();
        await namesRow(app).fill("999");
        await app.importTabs.nth(0).click();
        await expect(holdLine(app)).toBeVisible();
        await expect(holdLine(app)).toHaveText(words.importHoldProblemMessage(long));
        const widths = await page.evaluate(() => {
            const dialog = document.querySelector("#import-dialog");
            const line = document.querySelector("#import-hold");
            const body = dialog.querySelector(".import-body");
            return { dialog: [dialog.scrollWidth, dialog.clientWidth], body: [body.scrollWidth, body.clientWidth], page: [document.documentElement.scrollWidth, window.innerWidth], line: [line.scrollWidth, line.clientWidth] };
        });
        expect(widths.line[0], "the line itself").toBeLessThanOrEqual(widths.line[1]);
        expect(widths.dialog[0], "the dialog").toBeLessThanOrEqual(widths.dialog[1]);
        expect(widths.body[0], "the body").toBeLessThanOrEqual(widths.body[1]);
        expect(widths.page[0], "the page").toBeLessThanOrEqual(widths.page[1]);
    });
});

// ---- 15. a file that was saved again after its preview ----------------------------------------------

test.describe("a file that changed after it was chosen", () => {
    test("is refused when Import is pressed, nothing is imported, and the other file can still be imported", async ({ app, page, browserName }, testInfo) => {
        // (A file chosen by its path: the browser keeps the file, not its bytes. A folder made for
        // this test alone, in the test's own output folder: two runs at once, or two workers,
        // never share a file, and a run that is stopped before its `finally` leaves nothing in
        // the system's temp folder.)
        const folder = testInfo.outputPath("lab-changed");
        fs.mkdirSync(folder, { recursive: true });
        const file = path.join(folder, "changed.csv");
        fs.writeFileSync(file, "a,b\n1,2\n3,4\n");
        const second = path.join(folder, "second.csv");
        fs.writeFileSync(second, "p,q\n5,6\n");
        const name = path.basename(file);
        const secondName = path.basename(second);
        const stored = () => page.evaluate(() => JSON.stringify(Object.keys(localStorage).filter((key) => key.startsWith("sqllab.events.")).sort().map((key) => [key, localStorage.getItem(key)])));
        try {
            await app.open(OPEN);
            const database = await page.evaluateHandle(() => window.app.database);
            const label = await app.databaseLabel.textContent();
            const schema = await schemaNow(app);
            const events = await stored();
            await app.chooseFiles([file, second]);
            await expect(app.importDialog).toBeVisible();
            await expect(app.importDialog.locator(".import-reading")).toHaveCount(0);
            await expect(app.importSubmit).toBeEnabled();

            // saved again, and with another length: x,y,z and three rows
            fs.writeFileSync(file, "x,y,z\n9,9,9\n8,8,8\n7,7,7\n");
            await app.importSubmit.click();
            // Firefox reads the new bytes, which are not the text the preview was read from; Chromium
            // refuses to read a file that changed (both refuse it, in the tab, and import nothing)
            const reason = browserName === "firefox" ? words.IMPORT_CHANGED_REASON : words.IMPORT_UNREADABLE_REASON;
            await expect(refusedTab(app, name)).toBeVisible();
            await expect(app.importPanel.locator(".import-refusal")).toHaveText(reason);
            await expect(app.importDialog).toBeVisible();
            expect(await page.evaluate((old) => window.app.database === old, database), "the open database is the same").toBe(true);
            await expect(app.databaseLabel).toHaveText(label);
            expect(await schemaNow(app), "no table").toEqual(schema);
            await expect(app.pane).not.toHaveAttribute("data-state", "report");
            expect(await stored(), "no event").toBe(events);

            // the other file is still there to import, and nothing of the first comes with it
            await expect(app.importSubmit).toBeEnabled();
            await selectTab(app, secondName);
            await app.importSubmit.click();
            await expect(app.importDialog).toBeHidden();
            await expect(app.pane).toHaveAttribute("data-state", "report");
            const table = secondName.replace(/\.csv$/, "").replace(/-/g, "_");
            expect(await app.rows("SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name")).toEqual([[table]]);
            expect(await app.rows(`SELECT * FROM "${table}"`)).toEqual([[5, 6]]);
        } finally {
            fs.rmSync(folder, { recursive: true, force: true });
        }
    });
});

// ---- 16. a second byte-order mark -------------------------------------------------

test.describe("a file with two byte-order marks", () => {
    test("the preview and the import agree: the first name keeps the second mark, the column is _id, and the report gives the name in the file", async ({ app }) => {
        const bytes = Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf, 0xef, 0xbb, 0xbf]), Buffer.from("id,name\n1,Ann\n")]);
        await openDialog(app, { name: "bom2.csv", mimeType: "text/csv", buffer: bytes });
        // (the file's own mark is gone by then: what is left in front of "id" is the second one)
        const preview = await previewRows(app);
        expect(preview[0].cells).toEqual(["\uFEFFid", "name"]);
        expect(preview[0].cells[0].codePointAt(0)).toBe(0xfeff);
        await app.importSubmit.click();
        await expect(app.importDialog).toBeHidden();
        await expect(app.pane).toHaveAttribute("data-state", "report");
        expect(await app.rows("SELECT name FROM pragma_table_info('bom2') ORDER BY cid")).toEqual([["_id"], ["name"]]);
        expect(await app.rows("SELECT _id, name FROM bom2")).toEqual([[1, "Ann"]]);
        // the report says what the name was in the file, mark included, as the preview showed it
        const quoted = await app.pane.locator(".import-report .import-cell-text").allTextContents();
        expect(quoted).toContain("\uFEFFid");
    });
});

// ---- 17. the whole name of a file, in its tab ------------------------------------------------

test.describe("the name in a tab", () => {
    test("a name that is cut short carries the whole of it in its title, in a tab that can be imported and in one that cannot", async ({ app, page }) => {
        await page.setViewportSize({ width: 360, height: 740 });
        const long = `${"quarterly_sales_".repeat(10)}final.csv`;
        const workbook = `${"quarterly_sales_".repeat(10)}final.xlsx`;
        await openDialog(app, [csv(long), { name: workbook, mimeType: "application/octet-stream", buffer: fs.readFileSync(WORKBOOK) }]);
        await expect(refusedTab(app, workbook)).toBeVisible();
        const names = app.importDialog.locator(".import-tab-name");
        await expect(names).toHaveCount(2);
        const seen = await names.evaluateAll((spans) => spans.map((span) => ({ text: span.textContent, title: span.title, cut: span.scrollWidth > span.clientWidth })));
        expect(seen.map((one) => one.title)).toEqual([long, workbook]);
        expect(seen.map((one) => one.text)).toEqual([long, workbook]);
        // (the tab does cut the name: the title is what shows the rest)
        expect(seen.map((one) => one.cut)).toEqual([true, true]);
    });

    // A tab is never wider than the strip it is in (css/import.css, .import-tab): in a window 320 px
    // wide the strip is narrower than 16rem, and a tab of that width had an end cut off when it had
    // the focus, its focus ring with it. Twelve files with long names make a strip that scrolls.
    const longNames = Array.from({ length: 12 }, (_, i) => `a_very_long_file_name_for_the_sales_report_number_${i + 1}.csv`);
    // where the tab that has the focus lies against the strip's inner box, once neither has moved
    // for four frames (the strip scrolls smoothly in Firefox)
    const focusedTabAgainstStrip = (page) =>
        page.evaluate(async () => {
            const tab = document.activeElement;
            const strip = document.querySelector("#import-dialog .import-tabs");
            let place = "";
            let still = 0;
            for (let frame = 0; frame < 120 && still < 4; frame++) {
                const now = tab.getBoundingClientRect();
                const at = `${now.left},${strip.scrollLeft}`;
                still = at === place ? still + 1 : 0;
                place = at;
                await new Promise((resolve) => requestAnimationFrame(resolve));
            }
            const box = tab.getBoundingClientRect();
            const edge = strip.getBoundingClientRect();
            const name = tab.querySelector(".import-tab-name");
            return {
                role: tab.getAttribute("role"),
                text: name.textContent,
                title: name.title,
                left: box.left,
                right: box.right,
                stripLeft: edge.left + strip.clientLeft,
                stripRight: edge.left + strip.clientLeft + strip.clientWidth,
                cut: name.scrollWidth > name.clientWidth,
            };
        });

    test("at 320 px wide, the tab that has the focus lies wholly inside the strip, with its name cut short and the whole name in its title, as the arrow keys, End and Home move the focus", async ({ app, page }) => {
        await page.setViewportSize({ width: 320, height: 600 });
        await openDialog(
            app,
            longNames.map((name) => csv(name))
        );
        await page.evaluate(() => document.fonts.ready);
        await expect(app.importTabs).toHaveCount(12);
        await app.importTabs.first().focus();
        const seen = [{ after: "the dialog opens", ...(await focusedTabAgainstStrip(page)) }];
        for (const [key, last] of [
            ["ArrowRight", 1],
            ["ArrowRight", 2],
            ["End", 11],
            ["Home", 0],
            ["ArrowLeft", 11],
        ]) {
            await page.keyboard.press(key);
            await expect(app.importTabs.nth(last)).toBeFocused();
            seen.push({ after: key, ...(await focusedTabAgainstStrip(page)) });
        }
        for (const tab of seen) {
            expect(tab.role, `${tab.after}: the focus is on a tab`).toBe("tab");
            expect(tab.left, `${tab.after}: the tab (${tab.left} to ${tab.right}) starts inside the strip (${tab.stripLeft} to ${tab.stripRight})`).toBeGreaterThanOrEqual(tab.stripLeft - 0.5);
            expect(tab.right, `${tab.after}: the tab (${tab.left} to ${tab.right}) ends inside the strip (${tab.stripLeft} to ${tab.stripRight})`).toBeLessThanOrEqual(tab.stripRight + 0.5);
            expect(tab.cut, `${tab.after}: its name is cut short`).toBe(true);
            expect(tab.title, `${tab.after}: the whole name is its title`).toBe(tab.text);
            expect(longNames, `${tab.after}: and it is a file's name`).toContain(tab.title);
        }
    });

    test("at 1280 px wide, a tab with a long name is no wider than 16rem, and its name is cut short", async ({ app, page }) => {
        await page.setViewportSize({ width: 1280, height: 800 });
        await openDialog(
            app,
            longNames.slice(0, 3).map((name) => csv(name))
        );
        const rem = await page.evaluate(() => parseFloat(getComputedStyle(document.documentElement).fontSize));
        const tab = await app.importTabs.first().evaluate((el) => ({ width: el.getBoundingClientRect().width, cut: el.querySelector(".import-tab-name").scrollWidth > el.querySelector(".import-tab-name").clientWidth }));
        expect(tab.cut, "the name is cut short").toBe(true);
        expect(tab.width, `the tab is no wider than 16rem (${16 * rem} px)`).toBeLessThanOrEqual(16 * rem + 0.5);
        expect(tab.width, "and it is as wide as that: the name is what the width cuts").toBeGreaterThan(16 * rem - 2);
    });

    test("a short name has the same title as its text", async ({ app }) => {
        await openDialog(app, csv("short.csv"));
        await expect(app.importDialog.locator(".import-tab-name")).toHaveAttribute("title", "short.csv");
    });
});

// ---- 18. edges that a sweep of the code by mutation found unheld -------------------------------------------------------

// The first half of js/lab/import-dialog.js (from its top to the end of buildControls) was changed
// a line at a time, to see which changes no test noticed. These are the changes that a student, or
// a screen reader, could tell: the comment over each test says what was changed. Where a test
// needs a file to fail or to wait, the file is made in the page and its slices are watched
// (dropWatched): a slice can be made unreadable, or held until the test lets it go, so nothing
// here depends on how fast a file is read. The numbers of the slices (which one is the first of
// the second pass, say) are the dialog's own order of reading: the first bytes (look), the first
// bytes again and then the whole file in slices of INSPECT_SLICE_BYTES (inspectText), a second
// pass for UTF-16 (fitsEncoding), and the start of the text (the preview).

// the page's own errors: an exception that nothing caught, a promise that nothing handled
function pageErrors(page) {
    const errors = [];
    page.on("pageerror", (error) => errors.push(String(error)));
    return errors;
}
// A few frames of the page. (An error that nothing handles is told at the end of its turn: after
// these it has been.)
const frames = (page, count = 6) =>
    page.evaluate(
        (left) =>
            new Promise((resolve) => {
                const tick = () => (--left > 0 ? requestAnimationFrame(tick) : resolve());
                requestAnimationFrame(tick);
            }),
        count
    );

// dropWatched makes a file in the page and drops it there, with every slice asked of it noted in
// window.__calls ({start, end}). failFrom n: the n-th slice and those after it cannot be read.
// gateAt n: the n-th slice waits until the test calls window.__gate(). `before` are small text
// files dropped with it, before it. parts: {zeros: n} | {bytes: [...]} | {text, repeat?} |
// {utf16, repeat?} (the text as UTF-16, little-endian).
async function dropWatched(page, { name, parts, failFrom = 0, gateAt = 0, before = [] }) {
    await page.evaluate(
        ({ name, parts, failFrom, gateAt, before }) => {
            window.__calls = [];
            window.__gate = null;
            const real = Blob.prototype.slice;
            Blob.prototype.slice = function (...args) {
                if (this.name !== name) {
                    return real.apply(this, args);
                }
                const n = window.__calls.length + 1;
                window.__calls.push({ start: args[0], end: args[1] });
                if (failFrom && n >= failFrom) {
                    return { arrayBuffer: () => Promise.reject(new Error("the slice cannot be read")), size: 0 };
                }
                const piece = real.apply(this, args);
                if (gateAt && n === gateAt) {
                    const open = piece.arrayBuffer.bind(piece);
                    piece.arrayBuffer = () => new Promise((resolve) => (window.__gate = () => resolve(open())));
                }
                return piece;
            };
            const blobs = parts.map((part) => {
                if (part.zeros) {
                    return new Blob([new Uint8Array(part.zeros)]);
                }
                if (part.bytes) {
                    return new Blob([new Uint8Array(part.bytes)]);
                }
                let one;
                if (part.utf16) {
                    const units = new Uint16Array(part.utf16.length);
                    for (let i = 0; i < units.length; i++) {
                        units[i] = part.utf16.charCodeAt(i);
                    }
                    one = new Blob([units]);
                } else {
                    one = new Blob([part.text]);
                }
                return part.repeat ? new Blob(Array(part.repeat).fill(one)) : one;
            });
            const data = new DataTransfer();
            for (const file of before) {
                data.items.add(new File([file.text], file.name));
            }
            data.items.add(new File(blobs, name));
            const fire = (type) => document.body.dispatchEvent(new DragEvent(type, { dataTransfer: data, bubbles: true, cancelable: true }));
            fire("dragover");
            fire("drop");
        },
        { name, parts, failFrom, gateAt, before }
    );
}
// the number of slices asked of the watched file, once it has not changed for 20 frames in a row
const callsAtRest = (page) =>
    page.evaluate(
        () =>
            new Promise((resolve) => {
                let last = window.__calls.length;
                let still = 0;
                const tick = () => {
                    still = window.__calls.length === last ? still + 1 : 0;
                    last = window.__calls.length;
                    if (still >= 20) {
                        resolve(last);
                    } else {
                        requestAnimationFrame(tick);
                    }
                };
                requestAnimationFrame(tick);
            })
    );
// text of about n MB: a row of names and rows of "1,abc"; and the same as UTF-16 with its mark
const LINE = "1,abc\n";
const textOf = (megabytes) => [{ text: "id,name\n" }, { text: LINE.repeat(Math.floor(MB / LINE.length)), repeat: megabytes }];
const utf16Of = (megabytes) => [{ bytes: [0xff, 0xfe] }, { utf16: "id,name\n" }, { utf16: LINE.repeat(Math.floor(MB / (2 * LINE.length))), repeat: megabytes }];
// how many bytes utf16Of(megabytes) holds, and how many slices one pass over a file of `bytes` asks for
const utf16Bytes = (megabytes) => 2 + 2 * ("id,name\n".length + megabytes * Math.floor(MB / (2 * LINE.length)) * LINE.length);
const passSlices = (bytes) => Math.ceil(bytes / words.INSPECT_SLICE_BYTES);

test.describe("edges a sweep by mutation found unheld: the order of the parts, and what a screen reader is told", () => {
    // (a label put after its control; the sign of a refused file after its name; the note of the
    // course database above the choice it explains; the box of the row above its tick box)
    test("a label comes before its control, the sign before the name in a tab, the note after the choice it explains, and the tick box before the number of its row", async ({ app }) => {
        await openDialog(app, [WORKBOOK, fixturePath("semicolon.csv")]);
        expect(await refusedTab(app, "shopping_db.xlsx").evaluate((button) => button.firstElementChild.classList.contains("import-tab-refused")), "the sign is the first thing in the tab").toBe(true);
        expect(await app.importDialog.locator("#import-database-name").evaluate((control) => control.previousElementSibling.tagName)).toBe("LABEL");
        expect(await app.importDialog.locator("#import-into-open-note").evaluate((line) => line.previousElementSibling.tagName)).toBe("LABEL");
        await selectTab(app, "semicolon.csv");
        expect(await tableName(app).evaluate((control) => control.previousElementSibling.tagName)).toBe("LABEL");
        expect(await app.importPanel.locator(".import-names").evaluate((box) => box.firstElementChild.contains(box.querySelector("input[type=checkbox]")))).toBe(true);
    });

    // (the hint left out of the description; the hint read before the error; the description not
    // put back when the error goes)
    test("the Table name is described by its hint; with an error, by the error and then the hint; with the error gone, by the hint alone", async ({ app }) => {
        await openDialog(app, csv("one.csv"));
        const name = tableName(app);
        const id = await name.getAttribute("id");
        await expect(name).toHaveAttribute("aria-describedby", `${id}-hint`);
        await expect(app.importPanel.locator(`#${id}-hint`)).toHaveText(words.IMPORT_TABLE_NAME_HINT);
        await name.fill("");
        await app.importSubmit.click();
        await expect(alertIn(app, words.IMPORT_NAME_EMPTY_MESSAGE)).toBeVisible();
        await expect(name).toHaveAttribute("aria-invalid", "true");
        await expect(name).toHaveAttribute("aria-describedby", `${id}-error ${id}-hint`);
        await name.fill("x");
        await expect(name).not.toHaveAttribute("aria-invalid", "true");
        await expect(name).toHaveAttribute("aria-describedby", `${id}-hint`);
    });

    // (the description kept when the error of a field with no hint has gone: it named a line
    // that is empty and hidden)
    test("the new database's name, which has no hint, is described by its error while that shows, and by nothing once it has gone", async ({ app }) => {
        await openDialog(app, csv("one.csv"));
        const name = app.importDialog.locator("#import-database-name");
        expect(await name.getAttribute("aria-describedby")).toBeNull();
        await name.fill("");
        await app.importSubmit.click();
        await expect(name).toHaveAttribute("aria-describedby", "import-database-name-error");
        await expect(app.importDialog.locator("#import-database-name-error")).toHaveText(words.IMPORT_NEW_DATABASE_EMPTY_MESSAGE);
        await name.fill("x");
        expect(await name.getAttribute("aria-describedby")).toBeNull();
        expect(await name.getAttribute("aria-invalid")).toBeNull();
    });

    // (spellcheck on; autocapitalize gone; the form left to the browser's own validation, whose
    // bubble for the row's number would stand in the way of the dialog's own messages)
    test("names are typed as they are: no spelling marks, no capital put in by a phone, and the form leaves the checking to the dialog", async ({ app }) => {
        await openDialog(app, csv("one.csv"));
        for (const name of [app.importDialog.locator("#import-database-name"), tableName(app)]) {
            expect(await name.evaluate((control) => control.spellcheck)).toBe(false);
            await expect(name).toHaveAttribute("autocapitalize", "off");
            await expect(name).toHaveAttribute("autocorrect", "off");
            await expect(name).toHaveAttribute("autocomplete", "off");
        }
        expect(await app.importDialog.locator("#import-form").evaluate((form) => form.noValidate)).toBe(true);
    });

    // (the panel left a Tab stop when its file has been read, beside the preview that is one; the
    // preview no longer a region with a name)
    test("once its file has been read a panel is not a Tab stop of its own, and the preview is a region with its name", async ({ app }) => {
        await openDialog(app, csv("one.csv"));
        expect(await app.importPanel.getAttribute("tabindex")).toBeNull();
        const preview = app.importPanel.getByRole("region", { name: words.IMPORT_PREVIEW_LABEL });
        await expect(preview).toBeVisible();
        await expect(preview).toHaveAttribute("tabindex", "0");
    });

    // (an emptied box read as the number 0, which was written back into it at once)
    test("the box of the row of names can be emptied: it stays empty, says that it holds no row, and takes the next number typed", async ({ app }) => {
        await openDialog(app, csv("one.csv"));
        await namesRow(app).fill("");
        await expect(namesRow(app)).toHaveValue("");
        await expect(alertIn(app, words.IMPORT_NAMES_ROW_NOT_A_ROW_MESSAGE)).toBeVisible();
        await expect(app.importSubmit).toBeDisabled();
        await namesRow(app).fill("2");
        await expect(namesRow(app)).toHaveValue("2");
        await expect(app.importSubmit).toBeEnabled();
    });
});

test.describe("edges a sweep by mutation found unheld: limits and names", () => {
    const rowOf = (fields) => Array.from({ length: fields }, (_, i) => `c${i}`).join(",");

    // (`>=` for `>` at the 2,000 columns: a file of exactly 2,000 was refused)
    test("a row of exactly 2,000 fields is read, and one of 2,001 refuses the file", async ({ app }) => {
        const { MAX_COLUMNS } = await load("import-csv.js");
        await openDialog(app, csv("exact.csv", `${rowOf(MAX_COLUMNS)}\n`));
        await expect(app.importPanel.locator(".import-preview")).toBeVisible();
        await expect(app.importSubmit).toBeEnabled();
        await app.importCancel.click();
        await expect(app.importDialog).toBeHidden();
        await app.chooseFiles(csv("more.csv", `${rowOf(MAX_COLUMNS + 1)}\n`));
        await expect(refusedTab(app, "more.csv")).toBeVisible();
        await expect(app.importPanel.locator(".import-refusal")).toHaveText(words.IMPORT_TOO_WIDE_REASON);
    });

    // (only the first row looked at for its width)
    test("a row after the first that is too wide refuses the file as it is", async ({ app }) => {
        const { MAX_COLUMNS } = await load("import-csv.js");
        await openDialog(app, csv("late.csv", `a,b,c\n${rowOf(MAX_COLUMNS + 5)}\n`));
        await expect(refusedTab(app, "late.csv")).toBeVisible();
        await expect(app.importPanel.locator(".import-refusal")).toHaveText(words.IMPORT_TOO_WIDE_REASON);
    });

    // (the pattern of the reserved names not held to the start of the name)
    test("a name that only holds sqlite_ inside it is not a reserved one: the import goes on", async ({ app }) => {
        await openDialog(app, csv("one.csv"));
        await tableName(app).fill("my_sqlite_x");
        await app.importSubmit.click();
        await expect(app.importDialog).toBeHidden();
        expect(await app.rows("SELECT name FROM sqlite_schema WHERE type = 'table'")).toEqual([["my_sqlite_x"]]);
    });

    // (the name kept in the tab only when the field is left: a later file was then given the
    // very name that was being typed)
    test("a name that is being typed in one tab is already taken when a later file is named", async ({ app, page }) => {
        await app.open(OPEN);
        // the second file waits at its third slice, in the middle of its first pass
        await dropWatched(page, { name: "b.csv", parts: textOf(2), gateAt: 3, before: [{ name: "a.csv", text: "a,b\n1,2\n" }] });
        await expect(app.importDialog).toBeVisible();
        await expect(tableName(app)).toHaveValue("a");
        await page.waitForFunction(() => window.__gate);
        await tableName(app).fill("b");
        await page.evaluate(() => window.__gate());
        await expect(app.importDialog.locator(".import-reading")).toHaveCount(0);
        await selectTab(app, "b.csv");
        await expect(tableName(app)).toHaveValue("b_2");
    });
});

test.describe("edges a sweep by mutation found unheld: what the student has set is kept, and what they have not is found again", () => {
    // (the first reading of a file whose bytes do not fit its encoding stores no names row: the
    // tab's own first values show, and they were changed)
    test("a UTF-16 file one byte too long does not fit its encoding, and its tab still starts with the tick box ticked and row 1", async ({ app }) => {
        const odd = Buffer.concat([Buffer.from([0xff, 0xfe]), Buffer.from("a,b\n1,2\n", "utf16le"), Buffer.from([0x41])]);
        await openDialog(app, { name: "odd.csv", mimeType: "text/csv", buffer: odd });
        await expect(encodingOf(app)).toHaveValue("utf-16le");
        await expect(alertIn(app, words.importEncodingMessage("utf-16le"))).toBeVisible();
        await expect(hasNames(app)).toBeChecked();
        await expect(namesRow(app)).toHaveValue("1");
    });

    // (the delimiter the student chose forgotten, and guessed again, when the encoding changed)
    test("a delimiter that the student chose stays when the encoding is changed", async ({ app }) => {
        await openDialog(app, csv("s.csv", "a;b\n1;2\n"));
        await expect(delimiterOf(app)).toHaveValue(";");
        await delimiterOf(app).selectOption(",");
        await expect(app.importSubmit).toBeEnabled();
        await encodingOf(app).selectOption("windows-1252");
        await expect(app.importSubmit).toBeEnabled();
        await expect(encodingOf(app)).toHaveValue("windows-1252");
        await expect(delimiterOf(app)).toHaveValue(",");
        expect((await previewRows(app))[0].cells).toEqual(["a;b"]);
    });

    // (the delimiter kept, and never guessed again, when the student had not chosen one)
    test("a delimiter that was only guessed is guessed again from the text that a new encoding gives", async ({ app }) => {
        const little = Buffer.concat([Buffer.from([0xff, 0xfe]), Buffer.from("a;b\n1;2\n", "utf16le")]);
        await openDialog(app, { name: "le.csv", mimeType: "text/csv", buffer: little });
        await expect(delimiterOf(app)).toHaveValue(";");
        await encodingOf(app).selectOption("utf-16be");
        await expect(app.importSubmit).toBeEnabled();
        await expect(encodingOf(app)).toHaveValue("utf-16be");
        // (read the other way round, the text holds no semicolon: the guess is the comma)
        await expect(delimiterOf(app)).toHaveValue(",");
    });

    // (a tick box that the student cleared ticked again by the next reading)
    test("a tick box that the student cleared stays cleared when the delimiter is changed and changed back", async ({ app }) => {
        await openDialog(app, csv("n.csv", "name,qty\nx,1\ny,2\n"));
        await expect(hasNames(app)).toBeChecked();
        await hasNames(app).uncheck();
        await delimiterOf(app).selectOption(";");
        await expect(app.importSubmit).toBeEnabled();
        await expect(hasNames(app)).not.toBeChecked();
        await delimiterOf(app).selectOption(",");
        await expect(app.importSubmit).toBeEnabled();
        await expect(hasNames(app)).not.toBeChecked();
    });
});

test.describe("edges a sweep by mutation found unheld: a reading that fails", () => {
    // (no `return` after the refusal: the reading went on with nothing in its hands, and the page
    // got an error that nothing handled)
    test("a reader that cannot be loaded for the first reading refuses the file, and the page has no error of its own", async ({ app, page }) => {
        const errors = pageErrors(page);
        await app.open(OPEN);
        await page.route(READER_URL, (route) => route.abort());
        await app.chooseFiles(csv("x.csv"));
        await expect(refusedTab(app, "x.csv")).toBeVisible();
        await expect(app.importPanel.locator(".import-refusal")).toHaveText(words.IMPORT_LIBRARY_FAILED_MESSAGE);
        await frames(page);
        expect(errors).toEqual([]);
    });

    // (a file that could not be looked at taken for text: a large one then asked its question)
    test("a large file whose first bytes cannot be read is refused as unreadable, not asked about", async ({ app, page }) => {
        await app.open(OPEN);
        await dropWatched(page, { name: "gone.csv", parts: [{ zeros: 50 * MB + 1 }], failFrom: 1 });
        await expect(app.importDialog).toBeVisible();
        await expect(refusedTab(app, "gone.csv")).toBeVisible();
        await expect(app.importPanel.locator(".import-refusal")).toHaveText(words.IMPORT_UNREADABLE_REASON);
        await expect(app.importDialog.getByRole("button", { name: words.IMPORT_LARGE_FILE_CONTINUE_TEXT })).toHaveCount(0);
    });

    // Which slice fails: 3, in the pass over the whole file; the first of the second pass of a
    // UTF-16 file (4 while the whole of that file is one slice of the first pass: worked out
    // from INSPECT_SLICE_BYTES, so that it stays the second pass's first if the slices change);
    // 4, the start of the text of a UTF-8 file, for its preview. (Without the refusal the tab
    // said "Reading the file" for ever; without the `return` after it the page got an error
    // that nothing handled.)
    for (const [what, name, parts, failAt] of [
        ["in the pass over its bytes", "pass.csv", [{ text: "a,b\n1,2\n" }], () => 3],
        ["in the second pass of a UTF-16 file", "second.csv", utf16Of(2), () => 2 + passSlices(utf16Bytes(2)) + 1],
        ["when the start of its text is read for the preview", "preview.csv", [{ text: "a,b\n1,2\n" }], () => 4],
    ]) {
        test(`a file that cannot be read any more ${what} is refused as unreadable, and the page has no error of its own`, async ({ app, page }) => {
            const errors = pageErrors(page);
            const failFrom = failAt();
            await app.open(OPEN);
            await dropWatched(page, { name, parts, failFrom });
            await expect(app.importDialog).toBeVisible();
            await expect(refusedTab(app, name)).toBeVisible();
            await expect(app.importPanel.locator(".import-refusal")).toHaveText(words.IMPORT_UNREADABLE_REASON);
            expect(await page.evaluate(() => window.__calls.length), "the slice that failed is the last one asked for").toBe(failFrom);
            await frames(page);
            expect(errors).toEqual([]);
        });
    }
});

test.describe("edges a sweep by mutation found unheld: the pass over a file", () => {
    // (the files of one choice looked at together: their readings ran into one another)
    test("the files of one choice are looked at one after the other: every slice of the first is asked for before any of the second", async ({ app, page }) => {
        test.slow();
        await app.open(OPEN);
        await page.evaluate((megabyte) => {
            window.__order = [];
            const real = Blob.prototype.slice;
            Blob.prototype.slice = function (...args) {
                if (this.name === "one.csv" || this.name === "two.csv") {
                    window.__order.push(this.name);
                }
                return real.apply(this, args);
            };
            const line = "1,abc\n";
            const piece = new Blob([line.repeat(Math.floor(megabyte / line.length))]);
            const data = new DataTransfer();
            for (const name of ["one.csv", "two.csv"]) {
                data.items.add(new File([new Blob(["id,name\n"]), ...Array(12).fill(piece)], name));
            }
            const fire = (type) => document.body.dispatchEvent(new DragEvent(type, { dataTransfer: data, bubbles: true, cancelable: true }));
            fire("dragover");
            fire("drop");
        }, MB);
        await expect(app.importDialog).toBeVisible();
        await expect(app.importDialog.locator(".import-reading")).toHaveCount(0);
        await expect(app.importSubmit).toBeEnabled();
        const order = await page.evaluate(() => window.__order.filter((name, i, all) => name !== all[i - 1]));
        expect(order).toEqual(["one.csv", "two.csv"]);
    });

    // (the pass not stopped, or not given its turn, when the dialog had closed: it went on to
    // the end of the file)
    test("closing the dialog while a file is being read stops the reading: not one more slice is asked for", async ({ app, page }) => {
        await app.open(OPEN);
        await dropWatched(page, { name: "stop.csv", parts: textOf(20), gateAt: 3 });
        await expect(app.importDialog).toBeVisible();
        await page.waitForFunction(() => window.__gate);
        await page.keyboard.press("Escape");
        await expect(app.importDialog).toBeHidden();
        await page.evaluate(() => window.__gate());
        expect(await callsAtRest(page)).toBe(3);
    });

    test("and so does closing it during the second pass of a UTF-16 file", async ({ app, page }) => {
        await app.open(OPEN);
        // 20 MB in slices of 4 MB: 1 the first bytes, 2 the first bytes again, 3 to 7 the first
        // pass (five slices, the fifth a little short), and 8 the second pass's first
        const first = 2 + passSlices(utf16Bytes(20)) + 1;
        await dropWatched(page, { name: "stop16.csv", parts: utf16Of(20), gateAt: first });
        await expect(app.importDialog).toBeVisible();
        await page.waitForFunction(() => window.__gate);
        await page.keyboard.press("Escape");
        await expect(app.importDialog).toBeHidden();
        await page.evaluate(() => window.__gate());
        expect(await callsAtRest(page)).toBe(first);
    });

    // (the rest between two slices taken out of the dialog's pass: a large file was then read in
    // one go, with no turn for the page, so nothing was drawn and no key was taken meanwhile)
    test("between two slices of the pass the page gets a turn", async ({ app, page }) => {
        await app.open(OPEN);
        // The turns are counted where they are taken (js/lab/import-pace.js): scheduler.yield, or,
        // in a browser that has none, a message on the page's own channel.
        await page.evaluate(() => {
            window.__turns = 0;
            if (globalThis.scheduler && typeof globalThis.scheduler.yield === "function") {
                const real = globalThis.scheduler.yield.bind(globalThis.scheduler);
                globalThis.scheduler.yield = () => {
                    window.__turns++;
                    return real();
                };
            } else {
                const post = MessagePort.prototype.postMessage;
                MessagePort.prototype.postMessage = function (...args) {
                    window.__turns++;
                    return post.apply(this, args);
                };
            }
        });
        await dropWatched(page, { name: "turns.csv", parts: textOf(20) });
        await expect(app.importDialog).toBeVisible();
        await expect(app.importDialog.locator(".import-reading")).toHaveCount(0);
        expect(await page.evaluate(() => window.__turns), "the page had a turn during the pass").toBeGreaterThan(0);
    });

    // (the size of the slices left to the module's own megabyte: four times the slices, and the
    // rests between them, for a large file)
    test("both passes read the file INSPECT_SLICE_BYTES at a time", async ({ app, page }) => {
        const { INSPECT_SLICE_BYTES } = words;
        await app.open(OPEN);
        await dropWatched(page, { name: "slices.csv", parts: utf16Of(20) });
        await expect(app.importDialog).toBeVisible();
        await expect(app.importDialog.locator(".import-reading")).toHaveCount(0);
        const calls = await page.evaluate(() => window.__calls);
        // the slices of the two passes: every one that is longer than the megabyte of the preview
        const sizes = calls.map((call) => call.end - call.start).filter((size) => size > words.PREVIEW_BYTES);
        expect(sizes.length, "the slices of one pass, twice (five in each at 4 MB)").toBe(2 * passSlices(utf16Bytes(20)));
        expect(new Set(sizes)).toEqual(new Set([INSPECT_SLICE_BYTES]));
    });
});

test.describe("edges a sweep by mutation found unheld: an encoding that is being checked", () => {
    // (a file that starts with the mark of UTF-8 taken to be UTF-8 without a look at its bytes)
    test("a UTF-8 byte-order mark and then a byte that is not UTF-8: the tab says that the bytes do not fit, and Import is off", async ({ app }) => {
        const bytes = Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), Buffer.from("a,b\n"), Buffer.from([0xe9]), Buffer.from(",2\n")]);
        await openDialog(app, { name: "bom.csv", mimeType: "text/csv", buffer: bytes });
        await expect(encodingOf(app)).toHaveValue("utf-8");
        await expect(alertIn(app, words.importEncodingMessage("utf-8"))).toBeVisible();
        await expect(app.importSubmit).toBeDisabled();
    });

    // A check of an encoding is held at its first slice by the test, so that what the tab shows
    // meanwhile can be looked at. hold(n) makes the next slice asked of the file wait as
    // window.__held[n].
    async function watchChecks(page, name) {
        await page.evaluate((watched) => {
            window.__held = [];
            window.__next = 0;
            const real = Blob.prototype.slice;
            Blob.prototype.slice = function (...args) {
                const piece = real.apply(this, args);
                if (this.name === watched && window.__next) {
                    const index = window.__next;
                    window.__next = 0;
                    const open = piece.arrayBuffer.bind(piece);
                    piece.arrayBuffer = () => new Promise((resolve) => (window.__held[index] = () => resolve(open())));
                }
                return piece;
            };
        }, name);
    }
    const hold = (page, n) => page.evaluate((index) => (window.__next = index), n);
    const held = (page, n) => page.waitForFunction((index) => Boolean(window.__held[index]), n);
    const letGo = (page, n) => page.evaluate((index) => window.__held[index](), n);

    // (the old reading left on show while a new encoding was checked)
    test("while a newly chosen encoding is checked against the bytes, the preview is out and the delimiter cannot be changed", async ({ app, page }) => {
        await openDialog(app, csv("check.csv", "id,name\n1,abc\n2,def\n"));
        await expect(app.importPanel.locator(".import-preview")).toBeVisible();
        await watchChecks(page, "check.csv");
        await hold(page, 1);
        await encodingOf(app).selectOption("utf-16le");
        await held(page, 1);
        await expect(app.importPanel.locator(".import-preview")).toBeHidden();
        await expect(delimiterOf(app)).toBeDisabled();
        await expect(app.importSubmit).toBeDisabled();
        // (no message yet: the check has not said that the bytes do not fit)
        await expect(alertIn(app, words.importEncodingMessage("utf-16le"))).toHaveCount(0);
        await letGo(page, 1);
        await expect(app.importPanel.locator(".import-preview")).toBeVisible();
        await expect(delimiterOf(app)).toBeEnabled();
    });

    // (an older check that ended after a newer one took its place: its "does not fit" turned
    // the newer reading into an error)
    test("a check of an encoding that ends after a newer one has ended changes nothing", async ({ app, page }) => {
        // an odd number of bytes: UTF-16 does not fit them, Windows-1252 does
        await openDialog(app, csv("order.csv", "id,name\n1,abc\n2,def\nx"));
        await expect(app.importPanel.locator(".import-preview")).toBeVisible();
        await watchChecks(page, "order.csv");
        await hold(page, 1);
        await encodingOf(app).selectOption("utf-16le");
        await held(page, 1);
        await hold(page, 2);
        await encodingOf(app).selectOption("windows-1252");
        await held(page, 2);
        await letGo(page, 2);
        await expect(app.importPanel.locator(".import-preview")).toBeVisible();
        await expect(app.importSubmit).toBeEnabled();
        // the older check ends now, and finds that it is not the one the tab waits for
        await letGo(page, 1);
        await frames(page, 10);
        await expect(encodingOf(app)).toHaveValue("windows-1252");
        await expect(app.importPanel.locator(".import-preview")).toBeVisible();
        await expect(app.importSubmit).toBeEnabled();
        await expect(app.importPanel.getByRole("alert").filter({ hasText: /\S/ })).toHaveCount(0);
    });
});

test.describe("edges a sweep by mutation found unheld: a large file once the student has said to read it", () => {
    // (the tab left as it was when "Read this file" was pressed: the question stayed on show, the
    // line beside Import went on saying that the file waits for an answer, and "Reading the
    // file" was not a status, nor its panel a Tab stop)
    test("after Read this file the tab says that the file is being read, as a status in a panel that Tab reaches, and nothing says any more that it waits", async ({ app, page }) => {
        test.slow();
        await app.open(OPEN);
        await dropWatched(page, { name: "big.csv", parts: textOf(51), gateAt: 3 });
        await expect(app.importDialog).toBeVisible();
        await expect(holdLine(app)).toHaveText(words.importHoldWaitingMessage("big.csv"));
        await readButton(app).click();
        await page.waitForFunction(() => window.__gate);
        await expect(app.importPanel.locator(".import-warning")).toHaveCount(0);
        const reading = app.importPanel.locator(".import-reading");
        await expect(reading).toHaveText(words.IMPORT_READING_TEXT);
        await expect(reading).toHaveAttribute("role", "status");
        await expect(app.importPanel).toHaveAttribute("tabindex", "0");
        await expect(holdLine(app)).toBeHidden();
        await expect(app.importSubmit).toBeDisabled();
        await page.evaluate(() => window.__gate());
        await expect(app.importPanel.locator(".import-preview")).toBeVisible();
        await expect(app.importSubmit).toBeEnabled();
    });
});

test.describe("edges a sweep by mutation found unheld: the megabyte of the preview", () => {
    // the rows that end inside the first megabyte of a text
    const rowsInPreview = (text) => text.slice(0, words.PREVIEW_BYTES).split("\n").length - 1;

    // (the megabyte read one byte longer: a file of a megabyte and a byte was then taken whole,
    // its unfinished last row with it)
    test("a file one byte longer than the preview's megabyte is not whole: its last row, cut short there, is not among the rows", async ({ app }) => {
        // rows of "1,abc" up to two bytes short of the megabyte, then a row of three bytes that
        // the megabyte cuts after its second
        const padded = `id,name\n${LINE.repeat(Math.floor((words.PREVIEW_BYTES - "id,name\n".length) / LINE.length))}9,x`;
        expect(Buffer.byteLength(padded), "one byte more than the preview reads").toBe(words.PREVIEW_BYTES + 1);
        await openDialog(app, csv("edge.csv", padded));
        await namesRow(app).fill("999999999");
        await expect(alertIn(app, words.importNamesRowMessage(rowsInPreview(padded)))).toBeVisible();
    });

    // (whether the text is the whole file not kept: with the names on the last row that the
    // preview holds, the tab said that no rows of data follow, though the file goes on)
    test("with the names on the last row that a preview of part of the file holds, the tab does not say that no data follows", async ({ app }) => {
        const file = bigAscii("part.csv");
        const rows = rowsInPreview(file.buffer.toString());
        expect(rows).toBeGreaterThan(1000);
        await openDialog(app, file);
        await namesRow(app).fill(String(rows));
        await expect(app.importPanel.locator(".import-preview")).toBeVisible();
        await expect(app.importSubmit).toBeEnabled();
        await expect(note(app)).not.toContainText(words.IMPORT_PREVIEW_NO_DATA_MESSAGE);
    });
});

// ---- 19. the same sweep, in the second half of the dialog's code ----------------------------------------------------

// From namesRowProblem and draw to the end of js/lab/import-dialog.js: what could be changed with
// every test passing, although the student, or the page's own tree, could show the difference.
test.describe("edges a sweep by mutation found unheld: the preview's table, names given again, and the dialog from one opening to the next", () => {
    // (the box of the row written only when it already held the number: it was empty when the
    // dialog opened, and "04" stayed "04")
    test("the box of the row of names shows 1 when a file has been read, and a number typed with a zero before it is written as the number it is", async ({ app }) => {
        await openDialog(app, csv("rows.csv", "a,b\n1,2\n3,4\n5,6\n7,8\n"));
        await expect(namesRow(app)).toHaveValue("1");
        await namesRow(app).fill("04");
        await expect(namesRow(app)).toHaveValue("4");
        expect((await previewRows(app)).find((row) => row.tag === words.IMPORT_PREVIEW_NAMES).cells).toEqual(["5", "6"]);
    });

    // (the numbers over the columns stopped one short: the last column had none)
    test("the preview numbers every column of the file, from 1, beside the heading of the rows' own numbers", async ({ app }) => {
        await openDialog(app, csv("three.csv", "a,b,c\n1,2,3\n"));
        await expect(app.importPanel.locator(".import-preview-table thead th")).toHaveText([words.IMPORT_PREVIEW_ROW_HEADING, "1", "2", "3"]);
        // a row that is wider than the first one gets its numbers too
        await app.importCancel.click();
        await expect(app.importDialog).toBeHidden();
        await app.chooseFiles(csv("ragged.csv", "a,b\n1,2,3,4\n"));
        await expect(app.importDialog).toBeVisible();
        await expect(app.importDialog.locator(".import-reading")).toHaveCount(0);
        await expect(app.importPanel.locator(".import-preview-table thead th")).toHaveText([words.IMPORT_PREVIEW_ROW_HEADING, "1", "2", "3", "4"]);
    });

    // (a name the student typed not counted as taken when the names are given again; and the
    // error of a name that has since been given again left on show)
    test("when the names are given again, a name that was typed counts as taken, and the error of a name that is now another goes", async ({ app }) => {
        await openSample(app);
        await app.chooseFiles([csv("a.csv"), csv("b.csv")]);
        await expect(app.importDialog).toBeVisible();
        await expect(app.importDialog.locator(".import-reading")).toHaveCount(0);
        await tableName(app).fill("b");
        await app.importSubmit.click();
        // the second file's own name is b as well: its tab is shown, with the reason
        await expect(app.importTabs.nth(1)).toHaveAttribute("aria-selected", "true");
        await expect(alertIn(app, words.IMPORT_NAME_TWICE_MESSAGE)).toBeVisible();
        await expect(tableName(app)).toHaveAttribute("aria-invalid", "true");
        // another destination: the names are given again
        await app.importDialog.locator("#import-into-open").check();
        await expect(tableName(app)).toHaveValue("b_2");
        await expect(app.importPanel.getByRole("alert").filter({ hasText: /\S/ })).toHaveCount(0);
        expect(await tableName(app).getAttribute("aria-invalid")).toBeNull();
        // and the name that was typed is still the first tab's
        await selectTab(app, "a.csv");
        await expect(tableName(app)).toHaveValue("b");
    });

    // (the last of the names that cannot be was the one shown, not the first)
    test("with two names that cannot be, the first of them is shown and takes the focus, and each tab says its own", async ({ app }) => {
        await openDialog(app, [csv("one.csv"), csv("two.csv")]);
        await tableName(app).fill("");
        await selectTab(app, "two.csv");
        await tableName(app).fill("");
        await app.importSubmit.click();
        await expect(app.importTabs.nth(0)).toHaveAttribute("aria-selected", "true");
        await expect(tableName(app)).toBeFocused();
        await expect(alertIn(app, words.IMPORT_NAME_EMPTY_MESSAGE)).toBeVisible();
        await selectTab(app, "two.csv");
        await expect(alertIn(app, words.IMPORT_NAME_EMPTY_MESSAGE)).toBeVisible();
    });

    // (a name that is all extension taken to have no name before its dot: the database then had
    // no name at all. The plan's rule, "the first file without its extension", would leave
    // nothing of this name: the dialog calls the database by the whole of it, and the plan's
    // sentence on the destination now says so.)
    test("a file whose name is all extension gives the new database that whole name, and its table is called table", async ({ app }) => {
        const { FALLBACK_TABLE_NAME } = await load("import-rules.js");
        await openDialog(app, csv(".csv"));
        await expect(app.importDialog.locator("#import-database-name")).toHaveValue(".csv");
        await expect(tableName(app)).toHaveValue(FALLBACK_TABLE_NAME);
    });

    // (a database name typed in one opening still counted as typed in the next: the new file's
    // name did not replace it)
    test("a database name typed in one opening of the dialog does not come back in the next: the new files name it", async ({ app }) => {
        await openDialog(app, csv("first.csv"));
        await app.importDialog.locator("#import-database-name").fill("mine");
        await app.importCancel.click();
        await expect(app.importDialog).toBeHidden();
        await app.chooseFiles(csv("second.csv"));
        await expect(app.importDialog).toBeVisible();
        await expect(app.importDialog.locator("#import-database-name")).toHaveValue("second");
    });

    // (the tabs, their panels and the files they hold left in the closed dialog until it next opens)
    for (const way of ["Cancel", "Escape"]) {
        test(`closed with ${way}, the dialog lets its files go: no tab and no panel is left in it`, async ({ app, page }) => {
            await openDialog(app, [csv("one.csv"), csv("two.csv")]);
            await expect(app.importDialog.locator('[role="tab"]')).toHaveCount(2);
            if (way === "Cancel") {
                await app.importCancel.click();
            } else {
                await page.keyboard.press("Escape");
            }
            await expect(app.importDialog).toBeHidden();
            await expect(app.importDialog.locator('[role="tab"]')).toHaveCount(0);
            await expect(app.importDialog.locator(".import-panel")).toHaveCount(0);
        });
    }

    // (the focus left on the page as a whole when it had been on nothing before the dialog)
    test("when the files came with the focus on nothing, closing the dialog gives the focus to the button of the open database", async ({ app, page }) => {
        await app.open(OPEN);
        await page.evaluate(() => document.activeElement?.blur());
        expect(await page.evaluate(() => document.activeElement === document.body)).toBe(true);
        expect(await dropMade(page, [{ name: "dropped.csv", text: SMALL_TEXT }])).toBe(true);
        await expect(app.importDialog).toBeVisible();
        await app.importCancel.click();
        await expect(app.importDialog).toBeHidden();
        await expect(page.locator("#database-button")).toBeFocused();
    });

    // (the line of a failed import emptied but not hidden: 12 px of empty room over the buttons
    // for as long as the page lived)
    test("the line of an import that failed is hidden again, not only emptied, when the dialog next opens", async ({ app, page }) => {
        await openDialog(app, csv("one.csv"));
        const line = app.importDialog.locator("#import-error");
        const footHeight = () => page.evaluate(() => document.querySelector(".import-foot").getBoundingClientRect().height);
        const plain = await footHeight();
        // (the reader the preview used is taken away, and cannot be had again)
        await page.evaluate(() => {
            delete window.Papa;
        });
        await page.route(READER_URL, (route) => route.abort());
        await app.importSubmit.click();
        await expect(line).toHaveText(words.IMPORT_LIBRARY_FAILED_MESSAGE);
        expect(await footHeight(), "the foot is higher by the line").toBeGreaterThan(plain);
        await app.importCancel.click();
        await expect(app.importDialog).toBeHidden();
        await page.unroute(READER_URL);
        await app.chooseFiles(csv("two.csv"));
        await expect(app.importDialog).toBeVisible();
        await expect(app.importDialog.locator(".import-reading")).toHaveCount(0);
        await expect(line).toHaveJSProperty("hidden", true);
        await expect(line).toHaveText("");
        expect(await footHeight(), "the foot is as it was before the failure").toBe(plain);
    });
});
