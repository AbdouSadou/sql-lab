// Assessment plan, Phase 5 (import Excel workbooks): the dialog that shows a workbook's sheets, in the
// page. A workbook's tab in the import dialog holds a second strip of tabs, one for each sheet, and a
// panel for each; the dialog is looked at here, and what it hands to the import is in
// tests/aw5-excel-page.spec.js. The owner's fixtures go through the page in
// tests/aw5-excel-fixtures.spec.js, and the modules that read a workbook are tried in Node
// (tests/aw5-excel-rules.spec.js).
// A page opened with ?preview=import,excel-import has both flags (the flag "excel-import" does
// nothing without "import"). Page tests reach code through the bundle only
// (await import("./bundle/app.js")). The workbooks are made in the test, in Node, as files a student
// would choose; the texts a student reads come from js/lab/config-workflow.js and are never typed again.
//
// What the tests pin, in the order of the groups below:
//  1. a strip of sheets that is wider than the dialog: at 320 px a workbook of six sheets, and six
//     refused files, do not make the dialog scroll sideways (only the strip does); the tab that is
//     selected is in view in the strip: that of the first sheet that is ticked, that of a sheet whose
//     name Import finds taken twice or empty (the first sheet's, with the strip scrolled to its far end), and that of a
//     workbook read behind another file's tab; the sign, the name and the focus ring of a tab with a long name stay
//     inside it.
//  2. what a sheet's tab and panel say: the hidden words of a tab, the names of the panels, a sheet
//     whose name is only spaces, a workbook none of whose sheets can be ticked, the tick box of a sheet
//     that cannot be ticked (Enter, Space and a click leave it unticked), and the box "The sheet has a
//     row of column names" unticked on one sheet.
//  3. the two strips: the strip of files has a tab for each file and a workbook is one tab; the strip of
//     a workbook's sheets, its ids, its pointers, one selected tab and one in the Tab order in each, the
//     arrow keys, Home and End, and the order that Tab walks the dialog in.
//  4. a workbook that lists one sheet (no strip, no buttons; the count line only for chart sheets left
//     out) and a web page saved as .xls (a label alone for one table, Table 1 and Table 2 for several).
//  5. the sheet that is on show when a workbook has been read: the first that is ticked, else the first.
//  6. a sheet's panel is built when it is first shown and kept (a workbook of 300 sheets), and what a
//     sheet is set to is kept whether its panel was built or not.
//  7. the count line: its words in each case, and that it is written only when they change.
//  8. ticking: the tick box, the sign and the words of the tab, the file's tab, the two buttons (hidden
//     sheets too, never a sheet that cannot be ticked, the focus, never disabled), names unchanged.
//  9. hidden and very hidden sheets: the word, the note, not ticked at first; no note for a hidden sheet
//     that cannot be ticked.
// 10. a sheet that cannot be ticked, of each of its kinds (no values, too wide, a cell past Excel's last
//     row, past its last column): the quiet sign, the reason, the box, no name, no preview, never imported; in forced colours the
//     label of its tick box has the colour of GrayText.
// 11. the line of a sheet's size and the line of its name (a value far down, the singular, a long name).
// 12. the names suggested for the tables of sheets: across sheets, files and the open database; a name that
//     is typed is kept and tidied (the fields are those of a text file); a sheet that cannot be ticked takes no
//     name; Import pressed with a name that cannot be used (empty, sqlite_, twice,
//     taken, a TEMP table's), also for a sheet that was never shown.
// 13. the row of column names of a sheet: ticked at first, a row beyond the sheet, a row that is no row,
//     and what the preview shows for it.
// 14. the preview of a sheet: where a table starts, values as the rules give them, long cells, white space.
// 15. what holds Import up and the line that says so, with the sheet on show and without it; nothing ticked;
//     a workbook still being read behind another tab (the page's clock) or on its own; a workbook of one sheet;
//     when no tab can give a table.
// 16. the name of the new database (a name typed in one dialog is not kept for the next).
// 17. keys and the focus: where it is when the dialog opens and when the sheets arrive, Enter, a held Enter,
//     Escape and Cancel leaving nothing of the workbook.
// 18. what a screen reader is told: statuses, alerts and the line beside Import, each announced once.
// 19. text that is not to be trusted: markup in a file, a sheet and a cell, constructor and __proto__,
//     names that differ in the case of a letter, right-to-left and emoji names.
// 20. axe (serious and critical), light and dark, at 1366 and 390 px, for five states of the sheets.
// 21. narrow windows, 390 and 320 px: nothing scrolls sideways but the strips and the preview, the two
//     buttons wrap under the count line, the foot stays in view, a long sheet name wraps.
// 22. nothing of the sheets exists until a workbook has been read (both flags with text files only; the
//     import alone, which refuses a workbook).
// 23. the layout of a sheet's panel in a wide window that is lower than 1080 px (900 px wide or more, under
//     1080 px tall): the preview beside the settings, under a head row that holds the sheet's line, its size
//     and its tick box; the bound at 1080 px (900x1079 beside, 900x1080 and 899x1079 stacked), a browser's
//     window on a 1080p screen (1920x950) with six rows of the preview above the foot and nothing to scroll,
//     and the two sides of the bound showing the same rows, give or take one; in any other window the parts
//     are stacked as before; a sheet of forty columns scrolls in its own box and the
//     panels of the other sheets take no room; the same Tab order, the same elements and the
//     same focus in both; nothing scrolls sideways at 900 px; a note and a reason under the head, across
//     the panel; one sheet and a web page the same; a text file's tab is not changed.
// 24. a field's message is in view when it comes: a row of names typed beyond the sheet is wholly above the
//     foot at 1366x768, and the body moves no more than that needs; with the pointer held down on the field
//     nothing moves until the release; a message that goes moves nothing; Import pressed with a name that
//     cannot be used, by a click and by Enter in the field itself, shows the field and its message whole in
//     a low window; Tab to a field that shows a message brings the message with it, and Tab to one that shows
//     none scrolls as before (the control, and no further).
// A workbook that a test needs and the owner's fixtures do not hold is made here (made(): rows, single
// cells, merged blocks, hidden sheets, chart sheets, a cell past Excel's bounds, a name of more than 31
// characters) and handed to the page as a chosen file.

const path = require("node:path");
const { pathToFileURL } = require("node:url");
const AxeBuilder = require("@axe-core/playwright").default;
const XLSX = require("../vendor/xlsx.full.min.js");
const fflate = require("../vendor/fflate.min.js");
const {
    test,
    expect,
    csvFile,
    schemaNames,
    dialogReady,
    workbookFile,
    owned,
    holdLine,
    fixturePath,
    expectedFor,
    tablesOf,
    holdVendor,
    NORTHLIGHT_URL,
    SAMPLE_FILE,
} = require("./helpers");

const load = (file) => import(pathToFileURL(path.join(__dirname, "..", "js", "lab", file)).href);

const FLAGS = "./?preview=import,excel-import";
// the course database is the one that a test opens, never the default one; the library is asked for
// by this address (the workbook is read when its first file is chosen)
const OPEN = `${NORTHLIGHT_URL}&preview=import,excel-import`;
const LIBRARY = "xlsx.full.min.js";

let words;
let nullText;
test.beforeAll(async () => {
    words = await load("config-workflow.js");
    nullText = (await load("config.js")).NULL_TEXT;
});

// ---- the strip of sheets and what the dialog says of a sheet ---------------------------------------------------------

// a workbook of `count` sheets, each with a row of names and one of data; the sheets are called "Sheet number 01", ...
const manySheets = (count, { hiddenFirst = 0 } = {}) =>
    Array.from({ length: count }, (_, i) => ({
        name: `Sheet number ${String(i + 1).padStart(2, "0")}`,
        rows: [["id", "label"], [i, `row ${i}`]],
        hidden: i < hiddenFirst ? 1 : 0,
    }));

// where the selected tab of a strip lies against the strip, in the page's pixels
const selectedTabInStrip = (strip) =>
    strip.evaluate((node) => {
        const tab = node.querySelector('[role="tab"][aria-selected="true"]');
        const around = node.getBoundingClientRect();
        const at = tab.getBoundingClientRect();
        return { name: tab.textContent, inside: at.left >= around.left - 1 && at.right <= around.right + 1, scrolled: node.scrollLeft };
    });

// how far the dialog itself can be scrolled sideways (it must not: only a strip and a preview do)
const sidewaysOf = (dialog) =>
    dialog.evaluate((node) => {
        node.scrollLeft = 300;
        const moved = node.scrollLeft;
        node.scrollLeft = 0;
        return { scrollWidth: node.scrollWidth, clientWidth: node.clientWidth, moved };
    });

// ---- workbooks made in the test, and what the dialog shows of them --------------------------------------------------

// A workbook as the file a student would choose.
//   sheets: [{name, rows: [[value]], cells: {A100000: {t, v, z, f}}, merges: ["B2:D2"], hidden: 0 | 1 | 2}]
//   charts: names of chart sheets put into the zip (an .xlsx only)
//   edit(files): changes the parts of the zip, {path: Uint8Array}, in place (an .xlsx only)
function made(name, sheets, { bookType = "xlsx", charts = [], edit = null } = {}) {
    const book = XLSX.utils.book_new();
    for (const sheet of sheets) {
        const ws = XLSX.utils.aoa_to_sheet(sheet.rows ?? []);
        for (const [address, cell] of Object.entries(sheet.cells ?? {})) {
            ws[address] = cell;
            const at = XLSX.utils.decode_cell(address);
            const range = XLSX.utils.decode_range(ws["!ref"] ?? "A1:A1");
            range.e.r = Math.max(range.e.r, at.r);
            range.e.c = Math.max(range.e.c, at.c);
            ws["!ref"] = XLSX.utils.encode_range(range);
        }
        if (sheet.merges) {
            ws["!merges"] = sheet.merges.map((range) => XLSX.utils.decode_range(range));
        }
        XLSX.utils.book_append_sheet(book, ws, sheet.name);
    }
    book.Workbook = { Sheets: sheets.map((sheet) => ({ Hidden: sheet.hidden ?? 0 })) };
    let bytes = Buffer.from(XLSX.write(book, { bookType, type: "buffer" }));
    if (charts.length || edit) {
        const files = fflate.unzipSync(new Uint8Array(bytes));
        charts.forEach((chart, i) => addChartSheet(files, chart, i));
        edit?.(files);
        bytes = Buffer.from(fflate.zipSync(files));
    }
    return { name, mimeType: "application/octet-stream", buffer: bytes };
}

const partText = (files, part) => Buffer.from(files[part]).toString("utf8");

// a chart sheet in the zip: the library reads it as a sheet that has a type, which the dialog leaves out
function addChartSheet(files, chart, i) {
    const part = `xl/chartsheets/sheet${i + 1}.xml`;
    files["xl/workbook.xml"] = fflate.strToU8(partText(files, "xl/workbook.xml").replace("</sheets>", `<sheet name="${chart}" sheetId="${90 + i}" r:id="rId9${i}"/></sheets>`));
    files["xl/_rels/workbook.xml.rels"] = fflate.strToU8(
        partText(files, "xl/_rels/workbook.xml.rels").replace(
            "</Relationships>",
            `<Relationship Id="rId9${i}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/chartsheet" Target="chartsheets/sheet${i + 1}.xml"/></Relationships>`
        )
    );
    files["[Content_Types].xml"] = fflate.strToU8(
        partText(files, "[Content_Types].xml").replace("</Types>", `<Override PartName="/${part}" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.chartsheet+xml"/></Types>`)
    );
    files[part] = fflate.strToU8(
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><chartsheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetViews><sheetView workbookViewId="0"/></sheetViews></chartsheet>'
    );
}

// the sheet at place `index` of the zip holds one value in each cell of `addresses` and nothing else (row 1,048,577
// is past Excel's last row, column XFE past its last column: no Excel sheet has a cell there)
const cellsAt = (index, addresses) => (files) => {
    const part = `xl/worksheets/sheet${index + 1}.xml`;
    const rows = new Map();
    for (const address of addresses) {
        const row = address.replace(/[A-Z]+/, "");
        rows.set(row, `${rows.get(row) ?? ""}<c r="${address}" t="n"><v>1</v></c>`);
    }
    const data = [...rows].map(([row, cells]) => `<row r="${row}">${cells}</row>`).join("");
    files[part] = fflate.strToU8(partText(files, part).replace(/<sheetData>[\s\S]*<\/sheetData>|<sheetData\/>/, `<sheetData>${data}</sheetData>`).replace(/<dimension[^>]*>/, ""));
};

// a sheet is given a name that the library's writer would not let through (more than 31 characters)
const renameSheet = (from, to) => (files) => {
    files["xl/workbook.xml"] = fflate.strToU8(partText(files, "xl/workbook.xml").replace(`name="${from}"`, `name="${to}"`));
};

// rows of `count` values: a row of names, then rows of data
const table = (count, columns = ["id", "label"]) => [columns, ...Array.from({ length: count }, (_, i) => [i + 1, `row ${i + 1}`])];

// the sheets of a workbook: a strip of tabs, one tab for each, named by the file
const outerStrip = (app) => app.importDialog.getByRole("tablist", { name: words.IMPORT_TABS_LABEL, exact: true });
const sheetTabs = (app, file) => app.importSheetStrip(words.importSheetsLabel(file)).getByRole("tab");
const tickBox = (app) => app.importSheetPanel.getByLabel(words.IMPORT_SHEET_TICK_LABEL, { exact: true });
const sheetName = (app) => app.importSheetPanel.getByLabel(words.IMPORT_TABLE_NAME_LABEL, { exact: true });
const sheetHasNames = (app) => app.importSheetPanel.getByLabel(words.IMPORT_HAS_NAMES_SHEET_LABEL, { exact: true });
const sheetNamesRow = (app) => app.importSheetPanel.getByLabel(words.IMPORT_NAMES_ROW_LABEL, { exact: true });
const countLine = (app) => app.importPanel.getByRole("status");
const tickEvery = (app) => app.importPanel.getByRole("button", { name: words.IMPORT_TICK_ALL_SHEETS_TEXT, exact: true });
const untickEvery = (app) => app.importPanel.getByRole("button", { name: words.IMPORT_UNTICK_ALL_SHEETS_TEXT, exact: true });
const alertIn = (locator, text) => locator.getByRole("alert").filter({ hasText: text });
const sheetNote = (app) => app.importSheetPanel.locator(".import-sheet-note");

// the preview of the sheet that is showing, as drawn: number, tag, the text of each cell, which cells are
// marked for white space at an end, which say that they are empty, and the title of a cell that was cut short
const sheetPreview = (app) =>
    app.importSheetPanel.locator(".import-preview-table tbody tr").evaluateAll((trs) =>
        trs.map((tr) => {
            const cells = [...tr.querySelectorAll("td")];
            return {
                number: tr.querySelector(".import-row-number").textContent,
                tag: tr.querySelector(".import-row-tag")?.textContent ?? "",
                cells: cells.map((td) => td.textContent),
                marked: cells.map((td) => td.classList.contains("import-cell--spaces")),
                empty: cells.map((td) => Boolean(td.querySelector(".cell-null"))),
                titles: cells.map((td) => td.querySelector("[title]")?.getAttribute("title") ?? null),
            };
        })
    );

// the table name of each sheet that can be ticked, in the strip's order: each tab is shown in turn
async function tableNamesOf(app, file) {
    const tabs = sheetTabs(app, file);
    const names = [];
    for (let i = 0; i < (await tabs.count()); i++) {
        await tabs.nth(i).click();
        if (await sheetName(app).count()) {
            names.push(await sheetName(app).inputValue());
        }
    }
    return names;
}

// where the keyboard focus is, as a short line: what it is, and what it is called
const focusAt = (page) =>
    page.evaluate(() => {
        const el = document.activeElement;
        const tag = el.tagName.toLowerCase();
        const role = el.getAttribute("role") ?? (tag === "input" ? { checkbox: "checkbox", number: "spinbutton", radio: "radio" }[el.type] ?? "textbox" : tag);
        const name = el.getAttribute("aria-label") ?? el.querySelector?.(".import-tab-name")?.textContent ?? el.labels?.[0]?.textContent ?? el.textContent.trim();
        return `${role}: ${name}`;
    });

// the tables the engine holds, by name
const tablesNow = async (app) => (await app.rows("SELECT name FROM sqlite_schema WHERE type = 'table' ORDER BY name")).flat();

// the page with sample.db open (its tables fruit and tags, its view v_priced): a place to import into
async function openSample(app) {
    await app.open(OPEN);
    await app.upload(SAMPLE_FILE);
}

test.describe("a strip of sheets that is wider than the dialog", () => {
    test("at 320 px a workbook of six sheets does not make the dialog scroll sideways: only the strip does", async ({ app, page }) => {
        await page.setViewportSize({ width: 320, height: 800 });
        await app.open(FLAGS);
        await app.chooseFiles(workbookFile("six.xlsx", manySheets(6)));
        await dialogReady(app);
        const strip = app.importSheetStrip(words.importSheetsLabel("six.xlsx"));
        await expect(strip.getByRole("tab")).toHaveCount(6);
        // (the strip is wider than the dialog, and scrolls itself; the dialog has nothing to scroll sideways)
        expect(await strip.evaluate((node) => node.scrollWidth > node.clientWidth)).toBe(true);
        const sideways = await sidewaysOf(app.importDialog);
        expect(sideways.scrollWidth).toBeLessThanOrEqual(sideways.clientWidth);
        expect(sideways.moved).toBe(0);
    });

    test("a strip that scrolls sideways is no stop of the Tab key by itself: from Untick every sheet the next stop is the selected tab, and the arrows move between tabs", async ({ app, page }) => {
        await page.setViewportSize({ width: 320, height: 800 });
        await app.open(FLAGS);
        await app.chooseFiles([workbookFile("six.xlsx", manySheets(6)), ...["people", "pupils", "classes", "teachers", "results"].map((name) => csvFile(`${name}.csv`))]);
        await dialogReady(app);
        const strip = app.importSheetStrip(words.importSheetsLabel("six.xlsx"));
        const outer = outerStrip(app);
        expect(await strip.evaluate((node) => node.scrollWidth > node.clientWidth)).toBe(true);
        expect(await outer.evaluate((node) => node.scrollWidth > node.clientWidth)).toBe(true);
        // (a strip that can be scrolled is a Tab stop of its own in some browsers, unless it says it is not)
        const stop = () => page.evaluate(() => `${document.activeElement.getAttribute("role")}`);
        await app.importDialog.getByRole("button", { name: words.IMPORT_UNTICK_ALL_SHEETS_TEXT }).focus();
        await page.keyboard.press("Tab");
        expect(await stop()).toBe("tab");
        const first = await page.evaluate(() => document.activeElement.id);
        await page.keyboard.press("ArrowRight");
        expect(await page.evaluate(() => document.activeElement.id)).not.toBe(first);
        expect(await stop()).toBe("tab");
        // and backwards from the first tab of the sheets: the strip is not met on the way
        await page.keyboard.press("ArrowLeft");
        await page.keyboard.press("Shift+Tab");
        expect(await page.evaluate(() => document.activeElement.textContent)).toContain(words.IMPORT_UNTICK_ALL_SHEETS_TEXT);
        // the strip of files: from the dialog's first focus the walk reaches no strip either
        await outer.getByRole("tab").first().focus();
        await page.keyboard.press("Shift+Tab");
        expect(await page.evaluate(() => document.activeElement.getAttribute("role"))).not.toBe("tablist");
    });

    test("a click on the empty part of a strip of sheets, or of a strip of files, leaves the focus on the selected tab, and the arrows then move between tabs", async ({ app, page }) => {
        await page.setViewportSize({ width: 1366, height: 768 });
        await app.open(FLAGS);
        await app.chooseFiles([made("three.xlsx", [{ name: "First", rows: table(2) }, { name: "Second", rows: table(2) }, { name: "Third", rows: table(2) }]), csvFile("people.csv"), csvFile("pupils.csv")]);
        await dialogReady(app);
        const onTab = () =>
            page.evaluate(() => {
                const at = document.activeElement;
                return { role: at.getAttribute("role"), selected: at.getAttribute("aria-selected"), id: at.id, ring: at.matches(":focus-visible") };
            });
        for (const strip of [app.importSheetStrip(words.importSheetsLabel("three.xlsx")), outerStrip(app)]) {
            const where = await strip.evaluate((node) => {
                const box = node.getBoundingClientRect();
                const last = [...node.querySelectorAll('[role="tab"]')].pop().getBoundingClientRect();
                return { x: (last.right + box.right) / 2, y: (box.top + box.bottom) / 2, room: box.right - last.right };
            });
            // (the strips are wider than their tabs here: there is a part that no tab covers)
            expect(where.room).toBeGreaterThan(20);
            await page.mouse.click(where.x, where.y);
            const before = await onTab();
            expect(before.role).toBe("tab");
            expect(before.selected).toBe("true");
            await page.keyboard.press("ArrowRight");
            const after = await onTab();
            expect(after.role).toBe("tab");
            expect(after.selected).toBe("true");
            expect(after.id).not.toBe(before.id);
            expect(after.ring).toBe(true);
            await expect(strip.locator(":focus")).toHaveCount(1);
            expect(await strip.evaluate((node) => node === document.activeElement)).toBe(false);
            // and Tab goes on from the tab, not through the strip, the dialog or the body
            await page.keyboard.press("Tab");
            expect(await page.evaluate(() => document.activeElement.getAttribute("role"))).not.toBe("tablist");
            expect(await page.evaluate(() => document.activeElement.matches("dialog, .import-body"))).toBe(false);
            await page.keyboard.press("Shift+Tab");
            await page.keyboard.press("ArrowLeft");
        }
    });

    test("a tab with a long file's name and a tab with a long sheet's name keep the sign, the name and the words inside the tab, on one line, and the ring of the tab's focus is inside its strip", async ({ app, page }) => {
        await page.setViewportSize({ width: 320, height: 800 });
        await app.open(FLAGS);
        const long = `${"W".repeat(60)}.xlsx`;
        await app.chooseFiles([made(long, [{ name: "M".repeat(31), rows: table(2) }, { name: "Other", rows: table(2) }, { name: "Third", rows: table(2), hidden: 1 }]), csvFile(`${"X".repeat(70)}.csv`)]);
        await dialogReady(app);
        const fit = (tab) =>
            tab.evaluate((node) => {
                const at = node.getBoundingClientRect();
                const strip = node.parentElement.getBoundingClientRect();
                const part = (selector) => node.querySelector(selector).getBoundingClientRect();
                const name = part(".import-tab-name");
                const style = getComputedStyle(node);
                const sign = node.querySelector("svg") ? part("svg") : null;
                node.focus({ focusVisible: true });
                const ring = Math.max(0, parseFloat(style.outlineOffset) + parseFloat(style.outlineWidth));
                return {
                    insideTab: name.left >= at.left - 0.5 && name.right <= at.right + 0.5,
                    tabWidth: at.width,
                    stripWidth: strip.width,
                    oneLine: sign === null || Math.abs(sign.top + sign.height / 2 - (name.top + name.height / 2)) <= 3,
                    signBeforeName: sign === null || sign.right <= name.left + 0.5,
                    ringInside: at.top - ring >= strip.top - 0.5 && at.bottom + ring <= strip.bottom + 0.5,
                };
            });
        const tabs = [app.importTabs.first(), app.importTabs.nth(1), ...(await sheetTabs(app, long).all())];
        for (const [i, tab] of tabs.entries()) {
            const at = await fit(tab);
            expect(at.insideTab, `tab ${i}: the name is inside the tab`).toBe(true);
            expect(at.oneLine, `tab ${i}: the sign and the name are on one line`).toBe(true);
            expect(at.signBeforeName, `tab ${i}: the sign is before the name`).toBe(true);
            expect(at.ringInside, `tab ${i}: the ring of the focus is not cut by the strip`).toBe(true);
            expect(at.tabWidth, `tab ${i}: a tab is not wider than its strip`).toBeLessThanOrEqual(at.stripWidth + 0.5);
        }
    });

    test("six refused files at 320 px, whose tabs hold the same hidden words, do not make it scroll sideways either", async ({ app, page }) => {
        await page.setViewportSize({ width: 320, height: 800 });
        await app.open(FLAGS);
        await app.chooseFiles(Array.from({ length: 6 }, (_, i) => ({ name: `empty_file_number_${i + 1}.csv`, mimeType: "text/csv", buffer: Buffer.alloc(0) })));
        await dialogReady(app);
        await expect(app.importTabs).toHaveCount(6);
        const sideways = await sidewaysOf(app.importDialog);
        expect(sideways.scrollWidth).toBeLessThanOrEqual(sideways.clientWidth);
        expect(sideways.moved).toBe(0);
    });

    test("a workbook whose first sheet that is ticked is far along opens with that sheet's tab in view in the strip", async ({ app, page }) => {
        await page.setViewportSize({ width: 390, height: 844 });
        await app.open(FLAGS);
        // eight hidden sheets (not ticked), then one that is visible: it is the one on show
        await app.chooseFiles(workbookFile("late.xlsx", [...manySheets(8, { hiddenFirst: 8 }), { name: "Visible last", rows: [["id"], [1]] }]));
        await dialogReady(app);
        const strip = app.importSheetStrip(words.importSheetsLabel("late.xlsx"));
        await expect(strip.getByRole("tab")).toHaveCount(9);
        await expect(app.importSheetPanel).toContainText(words.importSheetLineText("Visible last"));
        const at = await selectedTabInStrip(strip);
        expect(at.name).toContain("Visible last");
        expect(at.inside).toBe(true);
        expect(at.scrolled).toBeGreaterThan(0);
        // (the strip is all that moved)
        expect((await sidewaysOf(app.importDialog)).moved).toBe(0);
    });

    test("Import pressed with a name that another sheet has, on a sheet far along the strip: that sheet's tab is shown in the strip, with the focus in its name", async ({ app, page }) => {
        await page.setViewportSize({ width: 390, height: 844 });
        await app.open(FLAGS);
        await app.chooseFiles(workbookFile("clash.xlsx", manySheets(12)));
        await dialogReady(app);
        const strip = app.importSheetStrip(words.importSheetsLabel("clash.xlsx"));
        // the last sheet is given the first sheet's table name, and then the first sheet is the one on show
        const first = await app.importSheetPanel.getByLabel("Table name", { exact: true }).inputValue();
        await strip.getByRole("tab").nth(11).click();
        await app.importSheetPanel.getByLabel("Table name", { exact: true }).fill(first);
        await strip.getByRole("tab").nth(0).click();
        expect((await selectedTabInStrip(strip)).scrolled).toBe(0);
        await app.importSubmit.click();
        const at = await selectedTabInStrip(strip);
        expect(at.name).toContain("Sheet number 12");
        expect(at.inside).toBe(true);
        expect(at.scrolled).toBeGreaterThan(0);
        await expect(app.importSheetPanel.getByLabel("Table name", { exact: true })).toBeFocused();
        await expect(app.importDialog).toBeVisible();
        expect((await sidewaysOf(app.importDialog)).moved).toBe(0);
    });

    test("Import pressed with a name that cannot be used on the first sheet, while the strip is scrolled to its far end: the first sheet's tab is shown in the strip, with the focus in its name", async ({ app, page }) => {
        await page.setViewportSize({ width: 390, height: 844 });
        await app.open(FLAGS);
        await app.chooseFiles(workbookFile("clash.xlsx", manySheets(12)));
        await dialogReady(app);
        const strip = app.importSheetStrip(words.importSheetsLabel("clash.xlsx"));
        await app.importSheetPanel.getByLabel("Table name", { exact: true }).fill("");
        await strip.getByRole("tab").nth(11).click();
        expect((await selectedTabInStrip(strip)).scrolled).toBeGreaterThan(0);
        await app.importSubmit.click();
        const at = await selectedTabInStrip(strip);
        expect(at.name).toContain("Sheet number 01");
        expect(at.inside).toBe(true);
        expect(at.scrolled).toBe(0);
        await expect(app.importSheetPanel.getByLabel("Table name", { exact: true })).toBeFocused();
        expect((await sidewaysOf(app.importDialog)).moved).toBe(0);
    });

    test("the selected sheet of a workbook that was read behind another file's tab is brought into view when that tab is shown", async ({ app, page }) => {
        await page.setViewportSize({ width: 390, height: 844 });
        await app.open(FLAGS);
        await app.chooseFiles([csvFile("first.csv"), workbookFile("late.xlsx", [...manySheets(8, { hiddenFirst: 8 }), { name: "Visible last", rows: [["id"], [1]] }])]);
        await dialogReady(app);
        await app.importTabs.nth(1).click();
        const at = await selectedTabInStrip(app.importSheetStrip(words.importSheetsLabel("late.xlsx")));
        expect(at.name).toContain("Visible last");
        expect(at.inside).toBe(true);
    });
});

test.describe("what a sheet's tab and panel say, and the tick box of a sheet that cannot be ticked", () => {
    test("Enter in the tick box of a sheet that cannot be ticked does nothing: it does not import the other sheets; Space and a click leave the box unticked", async ({ app, page }) => {
        await app.open(FLAGS);
        await app.chooseFiles(workbookFile("some.xlsx", [{ name: "full", rows: [["id"], [1]] }, { name: "blank", rows: [] }]));
        await dialogReady(app);
        const before = await schemaNames(app);
        const strip = app.importSheetStrip(words.importSheetsLabel("some.xlsx"));
        await strip.getByRole("tab").nth(1).click();
        const box = app.importSheetPanel.getByLabel(words.IMPORT_SHEET_TICK_LABEL, { exact: true });
        await expect(box).toHaveAttribute("aria-disabled", "true");
        await box.focus();
        await page.keyboard.press("Enter");
        await page.keyboard.press("Space");
        // (each leaves it as it was: a space and a click that both took effect would cancel each other)
        await expect(box).not.toBeChecked();
        // (Playwright holds an aria-disabled box to be disabled, and would wait for it: the click is forced)
        await box.click({ force: true });
        await expect(box).not.toBeChecked();
        // (the dialog is still there, with its Import button, and nothing was made)
        await expect(app.importDialog).toBeVisible();
        await expect(app.importSubmit).toBeEnabled();
        expect(await schemaNames(app)).toEqual(before);
        // Import itself still imports the sheet that can be ticked
        await app.importSubmit.click();
        await expect(app.importDialog).toBeHidden();
        expect(await app.rows("SELECT id FROM full")).toEqual([[1]]);
    });

    test("a hidden sheet that is ticked is called hidden and ticked to a screen reader, and unticked again hidden and not ticked", async ({ app }) => {
        await app.open(FLAGS);
        await app.chooseFiles(workbookFile("h.xlsx", [{ name: "Shown", rows: [["a"], [1]] }, { name: "Hidden one", rows: [["b"], [2]], hidden: 1 }]));
        await dialogReady(app);
        const tabs = app.importSheetStrip(words.importSheetsLabel("h.xlsx")).getByRole("tab");
        await expect(tabs.nth(1)).toHaveAccessibleName(`Hidden one (${words.IMPORT_SHEET_HIDDEN_NOT_TICKED_TEXT})`);
        await tabs.nth(1).click();
        await app.importSheetPanel.getByLabel(words.IMPORT_SHEET_TICK_LABEL, { exact: true }).check();
        await expect(tabs.nth(1)).toHaveAccessibleName(`Hidden one (${words.IMPORT_SHEET_HIDDEN_TICKED_TEXT})`);
        await expect(tabs.nth(1)).toHaveAccessibleName(`Hidden one (${words.IMPORT_SHEET_HIDDEN_TICKED_TEXT})`);
        await expect(tabs.nth(0)).toHaveAccessibleName("Shown (ticked)");
        await app.importSheetPanel.getByLabel(words.IMPORT_SHEET_TICK_LABEL, { exact: true }).uncheck();
        await expect(tabs.nth(1)).toHaveAccessibleName(`Hidden one (${words.IMPORT_SHEET_HIDDEN_NOT_TICKED_TEXT})`);
    });

    test("a sheet's panel is named by the sheet's name alone, and a workbook's panel by the file's name alone, whatever is ticked", async ({ app }) => {
        await app.open(FLAGS);
        await app.chooseFiles(workbookFile("named.xlsx", [{ name: "customers", rows: [["a"], [1]] }, { name: "orders", rows: [["b"], [2]] }]));
        await dialogReady(app);
        await expect(app.importSheetPanel).toHaveAccessibleName("customers");
        await expect(app.importPanel).toHaveAccessibleName("named.xlsx");
        await app.importSheetPanel.getByLabel(words.IMPORT_SHEET_TICK_LABEL, { exact: true }).uncheck();
        await expect(app.importSheetPanel).toHaveAccessibleName("customers");
        // (the tab's own name says what is ticked)
        await expect(app.importSheetStrip(words.importSheetsLabel("named.xlsx")).getByRole("tab").first()).toHaveAccessibleName("customers (not ticked)");
        // nothing ticked: the file's tab says so, and its panel is still named by the file
        await app.importPanel.getByRole("button", { name: words.IMPORT_UNTICK_ALL_SHEETS_TEXT, exact: true }).click();
        await expect(app.importTabs.first()).toHaveAccessibleName(`named.xlsx (${words.IMPORT_TAB_NOTHING_TICKED_TEXT})`);
        await expect(app.importPanel).toHaveAccessibleName("named.xlsx");
        await expect(app.importSheetPanel).toHaveAccessibleName("customers");
    });

    test("a workbook none of whose sheets can be ticked says so on its tab (cannot be imported), and not that nothing is ticked; one with a sheet that can be says nothing ticked", async ({ app }) => {
        await app.open(FLAGS);
        await app.chooseFiles(workbookFile("nothing.xlsx", [{ name: "first", rows: [] }, { name: "second", rows: [] }]));
        await dialogReady(app);
        await expect(app.importTabs.first()).toHaveAccessibleName(`nothing.xlsx (${words.IMPORT_REFUSED_TAB_TEXT})`);
        await expect(app.importPanel).toHaveAccessibleName("nothing.xlsx");
        await app.importCancel.click();
        await app.chooseFiles(workbookFile("some.xlsx", [{ name: "first", rows: [["a"], [1]] }, { name: "second", rows: [] }]));
        await dialogReady(app);
        await expect(app.importTabs.first()).toHaveAccessibleName("some.xlsx");
        await app.importSheetPanel.getByLabel(words.IMPORT_SHEET_TICK_LABEL, { exact: true }).uncheck();
        await expect(app.importTabs.first()).toHaveAccessibleName(`some.xlsx (${words.IMPORT_TAB_NOTHING_TICKED_TEXT})`);
    });

    test("a sheet whose name is only spaces is called by its place, in its tab and above its panel; its table is named as before", async ({ app }) => {
        await app.open(FLAGS);
        await app.chooseFiles(workbookFile("spaces.xlsx", [{ name: "first", rows: [["a"], [1]] }, { name: "   ", rows: [["b"], [2]] }]));
        await dialogReady(app);
        const tabs = app.importSheetStrip(words.importSheetsLabel("spaces.xlsx")).getByRole("tab");
        await expect(tabs.nth(1)).toHaveAccessibleName(`${words.importSheetUnnamedLabel(2)} (ticked)`);
        await tabs.nth(1).click();
        await expect(app.importSheetPanel).toContainText(words.importSheetLineText(words.importSheetUnnamedLabel(2)));
        await expect(app.importSheetPanel).toHaveAccessibleName(words.importSheetUnnamedLabel(2));
        await app.importSubmit.click();
        await expect(app.importDialog).toBeHidden();
        expect((await app.rows("SELECT name FROM sqlite_schema WHERE type = 'table' ORDER BY name")).flat()).toHaveLength(2);
    });

    test("the box 'The sheet has a row of column names' unticked on one sheet: its names are column_1, column_2 and every row, the first included, is data; the other sheet keeps its names", async ({ app }) => {
        await app.open(FLAGS);
        await app.chooseFiles(workbookFile("plain.xlsx", [{ name: "data", rows: [["a", "b"], [1, 2], [3, 4]] }, { name: "named", rows: [["x", "y"], [5, 6]] }]));
        await dialogReady(app);
        await app.importSheetPanel.getByLabel(words.IMPORT_HAS_NAMES_SHEET_LABEL, { exact: true }).uncheck();
        await app.importSubmit.click();
        await expect(app.importDialog).toBeHidden();
        await expect(app.pane).toHaveAttribute("data-state", "report");
        expect(await app.rows("SELECT name FROM pragma_table_info('data') ORDER BY cid")).toEqual([["column_1"], ["column_2"]]);
        expect(await app.rows("SELECT column_1, column_2 FROM data ORDER BY _rowid_")).toEqual([["a", "b"], ["1", "2"], ["3", "4"]]);
        expect(await app.rows("SELECT x, y FROM named")).toEqual([[5, 6]]);
    });
});


// ---- the two strips ------------------------------------------------------------------------------------------------

// every strip of tabs in the dialog, as drawn: its label, its tabs (their ids, which is selected, which is in the
// Tab order, what they control and whether that panel is hidden), every id of the dialog that is used twice, and
// every id that a tab or a panel points to (aria-controls, aria-labelledby, aria-describedby) that no element has
const stripsOf = (page) =>
    page.evaluate(() => {
        const dialog = document.querySelector("#import-dialog");
        const ids = [...dialog.querySelectorAll("[id]")].map((node) => node.id);
        const missing = [];
        for (const attribute of ["aria-controls", "aria-labelledby", "aria-describedby"]) {
            for (const node of [dialog, ...dialog.querySelectorAll(`[${attribute}]`)]) {
                for (const id of (node.getAttribute(attribute) ?? "").split(/\s+/).filter(Boolean)) {
                    if (!document.getElementById(id)) {
                        missing.push(`${attribute} -> ${id}`);
                    }
                }
            }
        }
        return {
            twice: [...new Set(ids.filter((id, i) => ids.indexOf(id) !== i))],
            missing,
            strips: [...dialog.querySelectorAll('[role="tablist"]')].map((list) => ({
                label: list.getAttribute("aria-label"),
                tabs: [...list.querySelectorAll('[role="tab"]')].map((tab) => {
                    const panel = document.getElementById(tab.getAttribute("aria-controls"));
                    return {
                        id: tab.id,
                        name: tab.querySelector(".import-tab-name").textContent,
                        selected: tab.getAttribute("aria-selected") === "true",
                        inTabOrder: tab.tabIndex === 0,
                        controls: tab.getAttribute("aria-controls"),
                        panelRole: panel?.getAttribute("role") ?? null,
                        panelNamedBy: panel?.getAttribute("aria-labelledby") ?? null,
                        panelHidden: panel ? panel.hidden : null,
                    };
                }),
            })),
        };
    });

test.describe("the strip of files and the strip of a workbook's sheets", () => {
    test("the strip of files has a tab for each file, and a workbook is one tab: while it is read, once it is read and when it is refused", async ({ app, page }) => {
        const held = await holdVendor(page, LIBRARY);
        await app.open(OPEN);
        await app.chooseFiles([csvFile("people.csv"), made("book.xlsx", [{ name: "a", rows: table(2) }, { name: "b", rows: table(2) }]), owned("impostors/truncated.xlsx")]);
        await expect(app.importDialog).toBeVisible();
        // the workbook is still being read (its library is held): a tab, with the words of every tab that is read
        await expect(app.importTabs).toHaveText(["people.csv", "book.xlsx", /truncated\.xlsx/]);
        await expect(outerStrip(app)).toHaveCount(1);
        // (the files are looked at one after the other: the one behind the workbook is waiting for its turn)
        await expect(app.importDialog.locator(".import-reading")).toHaveCount(2);
        await app.importTabs.nth(1).click();
        await expect(app.importPanel.getByRole("status")).toHaveText(words.IMPORT_READING_TEXT);
        // once it is read the file is still the one tab, and its sheets are in its panel
        held.open();
        await dialogReady(app);
        await expect(app.importTabs).toHaveCount(3);
        await expect(app.importTabs.nth(1)).toHaveAccessibleName("book.xlsx");
        await expect(sheetTabs(app, "book.xlsx")).toHaveCount(2);
        // a refused file is a tab too
        await expect(app.importTabs.nth(2)).toHaveAccessibleName(`truncated.xlsx (${words.IMPORT_REFUSED_TAB_TEXT})`);
        // and the tablists of the dialog are the strip of files and the one strip of sheets
        const { strips } = await stripsOf(page);
        expect(strips.map((strip) => strip.label)).toEqual([words.IMPORT_TABS_LABEL, words.importSheetsLabel("book.xlsx")]);
    });

    test("no tab holds a control: the sign of a file and the sign of a sheet are pictures and words, never a button, a field or a link, and the tab itself is the only stop", async ({ app, page }) => {
        await app.open(OPEN);
        await app.chooseFiles([owned("excel/messy_course_workbook.xlsx"), csvFile("people.csv"), owned("impostors/truncated.xlsx")]);
        await dialogReady(app);
        const file = "messy_course_workbook.xlsx";
        const held = (strip) =>
            strip.evaluate((node) =>
                [...node.querySelectorAll('[role="tab"]')].map((tab) => ({
                    controls: tab.querySelectorAll("button, input, select, textarea, a, [tabindex], [role=button], [role=checkbox]").length,
                    stops: tab.tabIndex,
                }))
            );
        const outer = await held(outerStrip(app));
        const sheets = await held(app.importSheetStrip(words.importSheetsLabel(file)));
        expect(outer).toHaveLength(3);
        expect(sheets.length).toBeGreaterThan(2);
        for (const one of [...outer, ...sheets]) {
            expect(one.controls).toBe(0);
        }
        // (the tabs are the one-stop kind of a strip: the selected tab is in the order of Tab, the others are not)
        expect(outer.filter((one) => one.stops === 0)).toHaveLength(1);
        expect(sheets.filter((one) => one.stops === 0)).toHaveLength(1);
    });

    test("a workbook of several sheets: a strip named for its file, one tab and one panel for each sheet in the workbook's order, with the ids of the tab of the file, and every pointer reaching an element", async ({ app, page }) => {
        await app.open(OPEN);
        await app.chooseFiles([owned("excel/messy_course_workbook.xlsx"), csvFile("people.csv")]);
        await dialogReady(app);
        const file = "messy_course_workbook.xlsx";
        const expected = expectedFor("excel/messy_course_workbook.xlsx").sheets.map((sheet) => sheet.sheet);
        const tabs = sheetTabs(app, file);
        await expect(tabs).toHaveCount(expected.length);
        // each panel is built when its sheet is first shown: every one is shown, so that every one has its pointers
        for (let i = 0; i < expected.length; i++) {
            await tabs.nth(i).click();
        }
        const { twice, missing, strips } = await stripsOf(page);
        expect(twice, "no id is used twice").toEqual([]);
        expect(missing, "every pointer reaches an element").toEqual([]);
        const [files, sheets] = strips;
        expect(files.tabs).toHaveLength(2);
        expect(sheets.label).toBe(words.importSheetsLabel(file));
        expect(sheets.tabs.map((tab) => tab.name)).toEqual(expected);
        const base = files.tabs[0].id.replace(/-tab$/, "");
        sheets.tabs.forEach((tab, i) => {
            expect(tab.id).toBe(`${base}-s${i}-tab`);
            expect(tab.controls).toBe(`${base}-s${i}-panel`);
            expect(tab.panelRole).toBe("tabpanel");
        });
        // a panel is a panel of one sheet: the number of the panels is the number of the tabs
        expect(await page.locator("#import-dialog .import-sheet-panel").count()).toBe(expected.length);
    });

    test("in each strip exactly one tab is selected and one is in the Tab order (the same one), and every panel but the selected one is hidden", async ({ app, page }) => {
        await app.open(OPEN);
        await app.chooseFiles([owned("shopping_db.xlsx"), csvFile("people.csv")]);
        await dialogReady(app);
        const looked = async (where) => {
            const { strips } = await stripsOf(page);
            expect(strips, where).toHaveLength(2);
            for (const strip of strips) {
                expect(strip.tabs.filter((tab) => tab.selected), `${where}: ${strip.label}, selected`).toHaveLength(1);
                expect(strip.tabs.filter((tab) => tab.inTabOrder), `${where}: ${strip.label}, in the Tab order`).toHaveLength(1);
                expect(strip.tabs.find((tab) => tab.inTabOrder).selected, `${where}: ${strip.label}, the one in the Tab order is the selected one`).toBe(true);
                expect(strip.tabs.filter((tab) => !tab.panelHidden).map((tab) => tab.id), `${where}: ${strip.label}, the panel that shows`).toEqual(strip.tabs.filter((tab) => tab.selected).map((tab) => tab.id));
            }
        };
        await looked("at first");
        await sheetTabs(app, "shopping_db.xlsx").nth(2).click();
        await looked("sheet 3 shown");
        await app.importTabs.nth(1).click();
        // (the other file's tab is on show: the workbook's panel is hidden, and its strip is as it was)
        const shown = (await stripsOf(page)).strips;
        expect(shown[0].tabs.map((tab) => tab.selected)).toEqual([false, true]);
        expect(shown[1].tabs.filter((tab) => tab.selected).map((tab) => tab.name)).toEqual(["products"]);
        await app.importTabs.nth(0).click();
        await looked("back");
    });

    test("the arrow keys, Home and End move among the sheets of the strip that has the focus and wrap round, and never cross into the strip of files", async ({ app, page }) => {
        await app.open(OPEN);
        await app.chooseFiles([owned("shopping_db.xlsx"), csvFile("people.csv")]);
        await dialogReady(app);
        const sheets = ["customers", "orders", "products", "quantities"];
        const selectedSheet = async () => (await stripsOf(page)).strips[1].tabs.filter((tab) => tab.selected).map((tab) => tab.name);
        await sheetTabs(app, "shopping_db.xlsx").first().focus();
        const walk = [["ArrowRight", "orders"], ["ArrowRight", "products"], ["End", "quantities"], ["ArrowRight", "customers"], ["ArrowLeft", "quantities"], ["Home", "customers"], ["ArrowLeft", "quantities"]];
        for (const [key, to] of walk) {
            await page.keyboard.press(key);
            expect(await selectedSheet(), key).toEqual([to]);
            // the tab selected has the focus, and its panel is the one that shows
            expect(await focusAt(page), key).toBe(`tab: ${to}`);
            await expect(app.importSheetPanel, key).toContainText(words.importSheetLineText(to));
        }
        // the strip of files is as it was: its first tab is selected, and the focus never reached it
        expect((await stripsOf(page)).strips[0].tabs.map((tab) => tab.selected)).toEqual([true, false]);
        // the strip of files takes the keys for itself, and the sheets stay as they were
        await app.importTabs.first().focus();
        await page.keyboard.press("ArrowRight");
        await expect(app.importTabs.nth(1)).toBeFocused();
        await page.keyboard.press("ArrowRight");
        await expect(app.importTabs.first()).toBeFocused();
        await page.keyboard.press("End");
        await expect(app.importTabs.nth(1)).toBeFocused();
        await page.keyboard.press("Home");
        await expect(app.importTabs.first()).toBeFocused();
        expect(await selectedSheet()).toEqual([sheets[3]]);
        expect((await stripsOf(page)).strips[1].label).toBe(words.importSheetsLabel("shopping_db.xlsx"));
    });

    test("the Tab key walks the dialog in one order: the file's tab, Tick every sheet, Untick every sheet, the sheet's tab, its tick box, its table name, the box of the names, the row, the preview, Import and Cancel", async ({ app, page }) => {
        await app.open(OPEN);
        await app.chooseFiles(owned("shopping_db.xlsx"));
        await dialogReady(app);
        // (the dialog gives the focus to the first tab when it opens)
        await expect(app.importTabs.first()).toBeFocused();
        const walked = [await focusAt(page)];
        for (let i = 0; i < 10; i++) {
            await page.keyboard.press("Tab");
            walked.push(await focusAt(page));
        }
        expect(walked).toEqual([
            "tab: shopping_db.xlsx",
            `button: ${words.IMPORT_TICK_ALL_SHEETS_TEXT}`,
            `button: ${words.IMPORT_UNTICK_ALL_SHEETS_TEXT}`,
            "tab: customers",
            `checkbox: ${words.IMPORT_SHEET_TICK_LABEL}`,
            `textbox: ${words.IMPORT_TABLE_NAME_LABEL}`,
            `checkbox: ${words.IMPORT_HAS_NAMES_SHEET_LABEL}`,
            `spinbutton: ${words.IMPORT_NAMES_ROW_LABEL}`,
            `region: ${words.IMPORT_PREVIEW_LABEL}`,
            `button: ${words.IMPORT_SUBMIT_TEXT}`,
            `button: ${words.IMPORT_CANCEL_TEXT}`,
        ]);
        // and backwards, the same
        for (const back of walked.slice(0, -1).reverse()) {
            await page.keyboard.press("Shift+Tab");
            expect(await focusAt(page)).toBe(back);
        }
    });
});

// ---- a workbook that lists one sheet, and a web page --------------------------------------------------------------

test.describe("a workbook that lists one sheet shows that sheet itself", () => {
    test("no strip, no buttons and no count line: the sheet's panel is in the file's panel, and its own tick box is the control", async ({ app, page }) => {
        await app.open(OPEN);
        await app.chooseFiles(made("one.xlsx", [{ name: "Stock", rows: table(4) }]));
        await dialogReady(app);
        await expect(app.importSheetStrip(words.importSheetsLabel("one.xlsx"))).toHaveCount(0);
        await expect(outerStrip(app).getByRole("tab")).toHaveCount(1);
        await expect(app.importPanel.getByRole("tablist")).toHaveCount(0);
        await expect(tickEvery(app)).toHaveCount(0);
        await expect(untickEvery(app)).toHaveCount(0);
        await expect(countLine(app)).toHaveCount(0);
        // the sheet is in the file's panel, and it is no tabpanel of a strip
        await expect(app.importSheetPanel).toHaveCount(1);
        await expect(app.importSheetPanel).not.toHaveAttribute("role", /./);
        await expect(app.importSheetPanel).toContainText(words.importSheetLineText("Stock"));
        await expect(tickBox(app)).toBeChecked();
        expect((await stripsOf(page)).strips).toHaveLength(1);
        // its tick box is the control: unticked, nothing is left to import
        await tickBox(app).uncheck();
        await expect(app.importSubmit).toBeDisabled();
        await expect(holdLine(app)).toHaveText(words.IMPORT_HOLD_NO_SHEET_MESSAGE);
        await expect(app.importTabs.first()).toHaveAccessibleName(`one.xlsx (${words.IMPORT_TAB_NOTHING_TICKED_TEXT})`);
    });

    test("when chart sheets were left out the count line says so and there is still no strip and no button; with none left out there is no line", async ({ app }) => {
        await app.open(OPEN);
        await app.chooseFiles(owned("excel/chart_sheet.xlsx"));
        await dialogReady(app);
        await expect(sheetTabs(app, "chart_sheet.xlsx")).toHaveCount(0);
        await expect(tickEvery(app)).toHaveCount(0);
        await expect(countLine(app)).toHaveText(words.importSheetsCountText({ ticked: 1, tickable: 1, unable: 0, charts: 1 }));
        await expect(countLine(app)).toContainText("Chart sheets are not listed.");
        await expect(app.importSheetPanel).toContainText(words.importSheetLineText("Data"));
        // a workbook made in the test with two chart sheets says the same, whatever their number
        await app.importCancel.click();
        await app.chooseFiles(made("charts.xlsx", [{ name: "Data", rows: table(2) }], { charts: ["First chart", "Second chart"] }));
        await dialogReady(app);
        await expect(countLine(app)).toHaveText(words.importSheetsCountText({ ticked: 1, tickable: 1, charts: 2 }));
        await expect(sheetTabs(app, "charts.xlsx")).toHaveCount(0);
    });

    test("a workbook whose one listed sheet is hidden shows it with the word hidden and its note, unticked, and Import waits for a tick", async ({ app }) => {
        await app.open(OPEN);
        await app.chooseFiles(made("secret.xlsx", [{ name: "Secret", rows: table(2), hidden: 1 }]));
        await dialogReady(app);
        await expect(app.importSheetPanel.locator(".import-sheet-name")).toHaveText(`${words.importSheetLineText("Secret")} ${words.IMPORT_SHEET_HIDDEN_WORD}`);
        await expect(app.importSheetPanel).toContainText(words.IMPORT_SHEET_HIDDEN_NOTE);
        await expect(tickBox(app)).not.toBeChecked();
        await expect(app.importSubmit).toBeDisabled();
        await expect(holdLine(app)).toHaveText(words.IMPORT_HOLD_NO_SHEET_MESSAGE);
        await tickBox(app).check();
        await expect(app.importSubmit).toBeEnabled();
        await expect(holdLine(app)).toBeHidden();
    });

    test("a web page saved as .xls with one table shows its label alone, with no strip; with several tables each is called Table 1, Table 2 in a strip", async ({ app }) => {
        await app.open(OPEN);
        await app.chooseFiles(owned("impostors/html_table.xls"));
        await dialogReady(app);
        await expect(app.importDialog.locator(".import-tab-name").first()).toHaveText("html_table.xls");
        await expect(sheetTabs(app, "html_table.xls")).toHaveCount(0);
        await expect(app.importSheetPanel.locator(".import-sheet-title")).toHaveText(words.importPageTableLabel(1));
        await expect(app.importSheetPanel).not.toContainText(words.importSheetLineText(words.importPageTableLabel(1)));
        await app.importCancel.click();
        const page = (name) => ({
            name,
            mimeType: "application/vnd.ms-excel",
            buffer: Buffer.from(`<html><body><table><tr><th>a</th><th>b</th></tr><tr><td>1</td><td>2</td></tr></table><p>between</p><table><tr><th>c</th></tr><tr><td>9</td></tr></table></body></html>`),
        });
        await app.chooseFiles(page("two_tables.xls"));
        await dialogReady(app);
        const tabs = sheetTabs(app, "two_tables.xls");
        await expect(tabs).toHaveCount(2);
        await expect(tabs.nth(0)).toHaveAccessibleName(`${words.importPageTableLabel(1)} (${words.IMPORT_SHEET_TICKED_TEXT})`);
        await expect(tabs.nth(1)).toHaveAccessibleName(`${words.importPageTableLabel(2)} (${words.IMPORT_SHEET_TICKED_TEXT})`);
        await expect(app.importSheetPanel.locator(".import-sheet-title")).toHaveText(words.importPageTableLabel(1));
        await tabs.nth(1).click();
        await expect(app.importSheetPanel.locator(".import-sheet-title")).toHaveText(words.importPageTableLabel(2));
        // (the tables are named from the file's name, made unique)
        await expect(sheetName(app)).toHaveValue("two_tables_2");
    });

    test("what the dialog hands on says how many tables a web page has: the table of a page with one is reported by the file's name, and those of a page with two are told apart", async ({ app, page }) => {
        await app.open(OPEN);
        const html = (tables) => `<html><body>${tables.map((rows) => `<table>${rows.map((row, i) => `<tr>${row.map((cell) => (i === 0 ? `<th>${cell}</th>` : `<td>${cell}</td>`)).join("")}</tr>`).join("")}</table>`).join("<p>between</p>")}</body></html>`;
        const file = (name, tables) => ({ name, mimeType: "application/vnd.ms-excel", buffer: Buffer.from(html(tables)) });
        await app.chooseFiles(file("solo.xls", [[["a", "b"], ["1", "2"]]]));
        await dialogReady(app);
        await app.importSubmit.click();
        await expect(app.importDialog).toBeHidden();
        await expect(page.locator(".import-report-line")).toHaveText([words.importReportTableLine(1, 2, "solo.xls")]);
        await app.chooseFiles(file("pair.xls", [[["c"], ["3"]], [["d"], ["4"]]]));
        await dialogReady(app);
        await app.importSubmit.click();
        await expect(app.importDialog).toBeHidden();
        await expect(page.locator(".import-report-line")).toHaveText([words.importReportTableLine(1, 1, "pair.xls, Table 1"), words.importReportTableLine(1, 1, "pair.xls, Table 2")]);
    });

    test("an XML spreadsheet saved as .xls keeps its own sheet names: its sheet is called Sheet and its name, as a workbook's is", async ({ app }) => {
        await app.open(OPEN);
        await app.chooseFiles(owned("impostors/spreadsheetml_2003.xls"));
        await dialogReady(app);
        await expect(app.importSheetPanel.locator(".import-sheet-title")).toHaveText(words.importSheetLineText("Report"));
    });
});

test.describe("the sheet that is on show when a workbook has been read", () => {
    const cases = [
        ["the first sheet that is ticked, when the first sheets are hidden", [{ name: "Hid 1", rows: table(1), hidden: 1 }, { name: "Hid 2", rows: table(1), hidden: 2 }, { name: "Shown", rows: table(1) }, { name: "Later", rows: table(1) }], "Shown"],
        ["the first sheet that is ticked, when the first holds no values", [{ name: "Blank", rows: [] }, { name: "Shown", rows: table(1) }], "Shown"],
        ["the first sheet listed, when every sheet is hidden", [{ name: "Hid 1", rows: table(1), hidden: 1 }, { name: "Hid 2", rows: table(1), hidden: 2 }], "Hid 1"],
        ["the first sheet listed, when no sheet can be ticked", [{ name: "Blank 1", rows: [] }, { name: "Blank 2", rows: [] }], "Blank 1"],
        ["the first sheet, when it is ticked", [{ name: "First", rows: table(1) }, { name: "Second", rows: table(1) }], "First"],
    ];
    for (const [title, sheets, on] of cases) {
        test(`${title}, is the one on show`, async ({ app, page }) => {
            await app.open(OPEN);
            await app.chooseFiles(made("book.xlsx", sheets));
            await dialogReady(app);
            const { strips } = await stripsOf(page);
            expect(strips[1].tabs.filter((tab) => tab.selected).map((tab) => tab.name)).toEqual([on]);
            await expect(app.importSheetPanel).toContainText(words.importSheetLineText(on));
            await expect(app.importSheetPanel).toHaveAccessibleName(on);
        });
    }

    test("the hidden sheets of the owner's workbook, listed after a visible one, leave the visible sheet on show", async ({ app, page }) => {
        await app.open(OPEN);
        await app.chooseFiles(owned("excel/messy_course_workbook.xlsx"));
        await dialogReady(app);
        const { strips } = await stripsOf(page);
        expect(strips[1].tabs.filter((tab) => tab.selected).map((tab) => tab.name)).toEqual(["Read me"]);
    });
});


// ---- panels are built when their sheet is first shown, and kept -----------------------------------------------------

// how many sheets' panels hold controls (a panel that was never shown is empty)
const builtPanels = (page) =>
    page.evaluate(() => [...document.querySelectorAll("#import-dialog .import-sheet-panel")].filter((panel) => panel.querySelector("input")).length);

// a workbook of 300 sheets, each with a row of names and a row of data
const threeHundred = () => made("many.xlsx", Array.from({ length: 300 }, (_, i) => ({ name: `Sheet ${i + 1}`, rows: table(1, ["id", `label ${i + 1}`]) })));

test.describe("a sheet's panel is built when it is first shown, and kept; what a sheet is set to is kept whether it was built or not", () => {
    test("of 300 sheets one panel is built when the workbook opens, the last when End is pressed, and Home builds no other: the first panel is the one it was", async ({ app, page }) => {
        await app.open(OPEN);
        await app.chooseFiles(threeHundred());
        await dialogReady(app);
        const tabs = sheetTabs(app, "many.xlsx");
        await expect(tabs).toHaveCount(300);
        expect(await page.locator("#import-dialog .import-sheet-panel").count()).toBe(300);
        expect(await builtPanels(page), "when the workbook opens").toBe(1);
        // a mark on the first panel's box: it is the same box when the student comes back to it
        await page.evaluate(() => (window.__first = document.querySelector("#import-dialog .import-sheet-panel input")));
        await tabs.first().focus();
        await page.keyboard.press("End");
        await expect(app.importSheetPanel).toContainText(words.importSheetLineText("Sheet 300"));
        expect(await builtPanels(page), "after End").toBe(2);
        await page.keyboard.press("Home");
        await expect(app.importSheetPanel).toContainText(words.importSheetLineText("Sheet 1"));
        expect(await builtPanels(page), "after Home").toBe(2);
        expect(await page.evaluate(() => document.querySelector("#import-dialog .import-sheet-panel input") === window.__first), "the first panel is kept").toBe(true);
        await page.keyboard.press("ArrowRight");
        await page.keyboard.press("ArrowRight");
        expect(await builtPanels(page), "two steps along").toBe(4);
    });

    test("what was typed in a sheet's panel is there when the student comes back to it: its table name, its row of names and the box of the names", async ({ app }) => {
        await app.open(OPEN);
        await app.chooseFiles(made("typed.xlsx", [{ name: "first", rows: table(5) }, { name: "second", rows: table(5) }, { name: "third", rows: table(5) }]));
        await dialogReady(app);
        const tabs = sheetTabs(app, "typed.xlsx");
        await tabs.nth(1).click();
        await sheetName(app).fill("mine");
        await sheetNamesRow(app).fill("3");
        await tabs.nth(2).click();
        await sheetHasNames(app).uncheck();
        await tabs.nth(1).click();
        await expect(sheetName(app)).toHaveValue("mine");
        await expect(sheetNamesRow(app)).toHaveValue("3");
        await expect(sheetHasNames(app)).toBeChecked();
        await tabs.nth(2).click();
        await expect(sheetHasNames(app)).not.toBeChecked();
        await expect(sheetNamesRow(app)).toBeDisabled();
        await expect(sheetName(app)).toHaveValue("third");
    });

    test("Untick every sheet on 300 sheets that were never shown keeps them unticked, builds no panel, and leaves Import held; one ticked later is the one that is imported", async ({ app, page }) => {
        test.slow();
        await app.open(OPEN);
        await app.chooseFiles(threeHundred());
        await dialogReady(app);
        await untickEvery(app).click();
        await expect(countLine(app)).toHaveText(words.importSheetsCountText({ ticked: 0, tickable: 300 }));
        expect(await builtPanels(page), "no panel was built by the button").toBe(1);
        await expect(app.importSubmit).toBeDisabled();
        await expect(holdLine(app)).toHaveText(words.IMPORT_HOLD_NO_SHEET_MESSAGE);
        // a sheet that is shown for the first time shows what it was set to
        const tabs = sheetTabs(app, "many.xlsx");
        await tabs.nth(199).click();
        await expect(tickBox(app)).not.toBeChecked();
        await expect(tabs.nth(199)).toHaveAccessibleName(`Sheet 200 (${words.IMPORT_SHEET_NOT_TICKED_TEXT})`);
        await tickBox(app).check();
        await expect(countLine(app)).toHaveText(words.importSheetsCountText({ ticked: 1, tickable: 300 }));
        await expect(app.importSubmit).toBeEnabled();
        await app.importSubmit.click();
        await expect(app.importDialog).toBeHidden();
        expect(await tablesNow(app)).toEqual(["Sheet_200"]);
    });

    test("Tick every sheet on sheets that were never shown ticks them: the box of one shown afterwards is ticked, and they are all imported", async ({ app }) => {
        test.slow();
        await app.open(OPEN);
        await app.chooseFiles(made("hid.xlsx", Array.from({ length: 40 }, (_, i) => ({ name: `Hidden ${i + 1}`, rows: table(1), hidden: 1 }))));
        await dialogReady(app);
        // (every sheet is hidden, so none is ticked at first)
        await expect(countLine(app)).toHaveText(words.importSheetsCountText({ ticked: 0, tickable: 40 }));
        await tickEvery(app).click();
        await expect(countLine(app)).toHaveText(words.importSheetsCountText({ ticked: 40, tickable: 40 }));
        await sheetTabs(app, "hid.xlsx").nth(25).click();
        await expect(tickBox(app)).toBeChecked();
        await app.importSubmit.click();
        await expect(app.importDialog).toBeHidden();
        expect(await tablesNow(app)).toHaveLength(40);
    });
});

// ---- the count line ------------------------------------------------------------------------------------------------

test.describe("the line that counts the sheets", () => {
    const cases = [
        ["every sheet ticked", () => owned("shopping_db.xlsx"), { ticked: 4, tickable: 4 }],
        ["some sheets ticked: the hidden ones are not", () => owned("excel/messy_course_workbook.xlsx"), { ticked: 4, tickable: 6 }],
        ["sheets that cannot be ticked", () => owned("excel/empty_sheets.xlsx"), { ticked: 4, tickable: 4, unable: 2 }],
        ["chart sheets left out", () => made("c.xlsx", [{ name: "a", rows: table(1) }, { name: "b", rows: table(1) }], { charts: ["Chart"] }), { ticked: 2, tickable: 2, charts: 1 }],
        ["a sheet that cannot be ticked, and a chart sheet", () => made("c.xlsx", [{ name: "a", rows: table(1) }, { name: "b", rows: [] }], { charts: ["Chart"] }), { ticked: 1, tickable: 1, unable: 1, charts: 1 }],
        ["no sheet that can be ticked", () => made("c.xlsx", [{ name: "a", rows: [] }, { name: "b", rows: [] }]), { ticked: 0, tickable: 0, unable: 2 }],
        ["no sheet that can be ticked, and a chart sheet", () => made("c.xlsx", [{ name: "a", rows: [] }, { name: "b", rows: [] }], { charts: ["Chart"] }), { ticked: 0, tickable: 0, unable: 2, charts: 1 }],
    ];
    for (const [title, file, counted] of cases) {
        test(`says its words for ${title}`, async ({ app }) => {
            await app.open(OPEN);
            await app.chooseFiles(file());
            await dialogReady(app);
            await expect(countLine(app)).toHaveText(words.importSheetsCountText(counted));
            await expect(countLine(app)).toHaveCount(1);
        });
    }

    test("is a status, says how many of the sheets that can be ticked will be imported, and says none when none is ticked", async ({ app }) => {
        await app.open(OPEN);
        await app.chooseFiles(owned("shopping_db.xlsx"));
        await dialogReady(app);
        await expect(countLine(app)).toHaveText("4 of 4 sheets will be imported.");
        await expect(countLine(app)).toHaveAttribute("role", "status");
        await tickBox(app).uncheck();
        await expect(countLine(app)).toHaveText("3 of 4 sheets will be imported.");
        await untickEvery(app).click();
        await expect(countLine(app)).toHaveText("0 of 4 sheets will be imported.");
    });

    // The words are written only when they change. The records of a MutationObserver are counted in the page
    // (takeRecords hands over what has not been delivered yet, so that the count is whole when it is read).
    const watch = (page, selector) =>
        page.evaluate((sel) => {
            const node = document.querySelector(sel);
            const observer = new MutationObserver((records) => (window.__seen = (window.__seen ?? 0) + records.length));
            window.__seen = 0;
            window.__observer = observer;
            observer.observe(node, { childList: true, characterData: true, subtree: true, attributes: true });
        }, selector);
    const written = (page) => page.evaluate(() => window.__seen + window.__observer.takeRecords().length);

    test("is written only when its words change: ticking one box off and on writes it twice; Tick every sheet twice, once; Untick every sheet twice, once", async ({ app, page }) => {
        await app.open(OPEN);
        await app.chooseFiles(owned("shopping_db.xlsx"));
        await dialogReady(app);
        await watch(page, ".import-panel:not([hidden]) .import-sheets-count");
        expect(await written(page)).toBe(0);
        await tickBox(app).uncheck();
        await expect(countLine(app)).toHaveText(words.importSheetsCountText({ ticked: 3, tickable: 4 }));
        expect(await written(page), "one box off").toBe(1);
        await tickBox(app).check();
        await expect(countLine(app)).toHaveText(words.importSheetsCountText({ ticked: 4, tickable: 4 }));
        expect(await written(page), "and on").toBe(2);
        // every sheet is ticked: pressing the button changes no word
        await tickEvery(app).click();
        await tickEvery(app).click();
        expect(await written(page), "Tick every sheet with all ticked").toBe(2);
        await untickEvery(app).click();
        expect(await written(page), "Untick every sheet").toBe(3);
        await untickEvery(app).click();
        expect(await written(page), "Untick every sheet again").toBe(3);
        await tickEvery(app).click();
        expect(await written(page), "Tick every sheet after it").toBe(4);
        await tickEvery(app).click();
        expect(await written(page), "and again").toBe(4);
    });

    test("is not written again for what does not change its words: showing another sheet, typing in a panel and a name that is refused", async ({ app, page }) => {
        await app.open(OPEN);
        await app.chooseFiles(owned("shopping_db.xlsx"));
        await dialogReady(app);
        await watch(page, ".import-panel:not([hidden]) .import-sheets-count");
        const tabs = sheetTabs(app, "shopping_db.xlsx");
        await tabs.nth(2).click();
        await sheetName(app).fill("something_else");
        await sheetNamesRow(app).fill("2");
        await sheetHasNames(app).uncheck();
        await tabs.nth(1).click();
        await sheetName(app).fill("");
        await app.importSubmit.click();
        await expect(alertIn(app.importSheetPanel, words.IMPORT_NAME_EMPTY_MESSAGE)).toBeVisible();
        expect(await written(page)).toBe(0);
    });
});

// ---- ticking -------------------------------------------------------------------------------------------------------

// the sign at the start of a tab (which icon it draws), and whether it is the quiet one
const signOf = (tab) => tab.locator("svg.import-tab-sign use").first().getAttribute("href");

test.describe("ticking sheets", () => {
    test("the tick box of a sheet changes the sign and the hidden words of the sheet's tab and the count line, and when no sheet is ticked the file's tab says so, until one is", async ({ app }) => {
        await app.open(OPEN);
        await app.chooseFiles(owned("shopping_db.xlsx"));
        await dialogReady(app);
        const tabs = sheetTabs(app, "shopping_db.xlsx");
        const sheets = ["customers", "orders", "products", "quantities"];
        for (let i = 0; i < 4; i++) {
            await expect(tabs.nth(i)).toHaveAccessibleName(`${sheets[i]} (${words.IMPORT_SHEET_TICKED_TEXT})`);
            expect(await signOf(tabs.nth(i))).toBe("#icon-check");
        }
        for (let i = 0; i < 4; i++) {
            await tabs.nth(i).click();
            await tickBox(app).uncheck();
            await expect(tabs.nth(i)).toHaveAccessibleName(`${sheets[i]} (${words.IMPORT_SHEET_NOT_TICKED_TEXT})`);
            expect(await signOf(tabs.nth(i))).toBe("#icon-circle");
            // (only a sheet that cannot be ticked has the quiet sign: a sheet that is not ticked is not that)
            await expect(tabs.nth(i).locator("svg.import-tab-sign")).not.toHaveClass(/import-tab-sign--quiet/);
            await expect(countLine(app)).toHaveText(words.importSheetsCountText({ ticked: 3 - i, tickable: 4 }));
            // the file's tab says nothing is ticked only when the last one has been unticked
            if (i < 3) {
                await expect(app.importTabs.first()).toHaveAccessibleName("shopping_db.xlsx");
            }
        }
        await expect(app.importTabs.first()).toHaveAccessibleName(`shopping_db.xlsx (${words.IMPORT_TAB_NOTHING_TICKED_TEXT})`);
        expect(await signOf(app.importTabs.first())).toBe("#icon-circle-alert");
        await expect(app.importTabs.first().locator("svg.import-tab-sign--quiet")).toHaveCount(1);
        // (the sign is before the file's name, as the sign of a sheet's tab is)
        expect(await app.importTabs.first().evaluate((tab) => tab.firstElementChild.matches("svg.import-tab-sign"))).toBe(true);
        await tabs.nth(2).click();
        await tickBox(app).check();
        await expect(tabs.nth(2)).toHaveAccessibleName(`products (${words.IMPORT_SHEET_TICKED_TEXT})`);
        await expect(app.importTabs.first()).toHaveAccessibleName("shopping_db.xlsx");
        // (a file's tab has no sign of its own while something is ticked)
        await expect(app.importTabs.first().locator("svg")).toHaveCount(0);
        await expect(app.importTabs.first().locator(".import-tab-nothing")).toHaveCount(0);
    });

    test("Tick every sheet ticks every sheet that can be ticked, the hidden ones too; Untick every sheet unticks them all", async ({ app }) => {
        await app.open(OPEN);
        await app.chooseFiles(owned("excel/messy_course_workbook.xlsx"));
        await dialogReady(app);
        const tabs = sheetTabs(app, "messy_course_workbook.xlsx");
        await expect(countLine(app)).toHaveText(words.importSheetsCountText({ ticked: 4, tickable: 6 }));
        await tickEvery(app).click();
        await expect(countLine(app)).toHaveText(words.importSheetsCountText({ ticked: 6, tickable: 6 }));
        await expect(tabs.nth(4)).toHaveAccessibleName(`Lookup (${words.IMPORT_SHEET_HIDDEN_TICKED_TEXT})`);
        await expect(tabs.nth(5)).toHaveAccessibleName(`Config (${words.IMPORT_SHEET_HIDDEN_TICKED_TEXT})`);
        await tabs.nth(5).click();
        await expect(tickBox(app)).toBeChecked();
        await untickEvery(app).click();
        await expect(countLine(app)).toHaveText(words.importSheetsCountText({ ticked: 0, tickable: 6 }));
        await expect(tickBox(app)).not.toBeChecked();
        await expect(tabs.nth(0)).toHaveAccessibleName(`Read me (${words.IMPORT_SHEET_NOT_TICKED_TEXT})`);
        await expect(tabs.nth(5)).toHaveAccessibleName(`Config (${words.IMPORT_SHEET_HIDDEN_NOT_TICKED_TEXT})`);
        await expect(app.importTabs.first()).toHaveAccessibleName(`messy_course_workbook.xlsx (${words.IMPORT_TAB_NOTHING_TICKED_TEXT})`);
    });

    test("Tick every sheet never ticks a sheet that cannot be ticked: its box stays unticked, its tab keeps its words, and it is counted as one that cannot be imported", async ({ app }) => {
        await app.open(OPEN);
        await app.chooseFiles(owned("excel/empty_sheets.xlsx"));
        await dialogReady(app);
        await untickEvery(app).click();
        await tickEvery(app).click();
        await expect(countLine(app)).toHaveText(words.importSheetsCountText({ ticked: 4, tickable: 4, unable: 2 }));
        const tabs = sheetTabs(app, "empty_sheets.xlsx");
        await expect(tabs.nth(1)).toHaveAccessibleName(`Empty (${words.IMPORT_SHEET_NO_VALUES_TEXT})`);
        await expect(tabs.nth(3)).toHaveAccessibleName(`Formatting only (${words.IMPORT_SHEET_NO_VALUES_TEXT})`);
        for (const place of [1, 3]) {
            await tabs.nth(place).click();
            await expect(tickBox(app)).not.toBeChecked();
        }
    });

    test("each button keeps the focus after it is pressed, with the mouse or with the keyboard, and neither is ever disabled", async ({ app, page }) => {
        await app.open(OPEN);
        await app.chooseFiles(owned("shopping_db.xlsx"));
        await dialogReady(app);
        for (const button of [tickEvery(app), untickEvery(app)]) {
            await expect(button).toBeEnabled();
            await expect(button).not.toHaveAttribute("aria-disabled", /./);
        }
        // (every sheet is ticked: Tick every sheet changes nothing, and is still there to press)
        await tickEvery(app).focus();
        await page.keyboard.press("Enter");
        await expect(tickEvery(app)).toBeFocused();
        await page.keyboard.press("Tab");
        await expect(untickEvery(app)).toBeFocused();
        await page.keyboard.press("Space");
        await expect(countLine(app)).toHaveText(words.importSheetsCountText({ ticked: 0, tickable: 4 }));
        await expect(untickEvery(app)).toBeFocused();
        // nothing is ticked: Untick every sheet is still enabled, and still has the focus when pressed again
        await expect(untickEvery(app)).toBeEnabled();
        await page.keyboard.press("Enter");
        await expect(untickEvery(app)).toBeFocused();
        await tickEvery(app).click();
        await expect(tickEvery(app)).toBeFocused();
        await expect(countLine(app)).toHaveText(words.importSheetsCountText({ ticked: 4, tickable: 4 }));
        await untickEvery(app).click();
        await expect(untickEvery(app)).toBeFocused();
        for (const button of [tickEvery(app), untickEvery(app)]) {
            await expect(button).toBeEnabled();
        }
    });

    test("ticking and unticking change no sheet's table name, and an unticked sheet keeps the name it was given", async ({ app }) => {
        await app.open(OPEN);
        await app.chooseFiles(owned("excel/sheet_names.xlsx"));
        await dialogReady(app);
        const before = await tableNamesOf(app, "sheet_names.xlsx");
        expect(before).toEqual(tablesOf(expectedFor("excel/sheet_names.xlsx")).map((table) => table.name));
        await untickEvery(app).click();
        expect(await tableNamesOf(app, "sheet_names.xlsx")).toEqual(before);
        const tabs = sheetTabs(app, "sheet_names.xlsx");
        await tabs.nth(0).click();
        await tickBox(app).check();
        await tickEvery(app).click();
        await tabs.nth(1).click();
        await tickBox(app).uncheck();
        expect(await tableNamesOf(app, "sheet_names.xlsx")).toEqual(before);
    });
});

// ---- hidden and very hidden sheets ---------------------------------------------------------------------------------

test.describe("hidden and very hidden sheets", () => {
    test("are listed with the word hidden in the tab and above the panel, not ticked at first, with the note that says they are imported only if ticked, which describes the tick box", async ({ app }) => {
        await app.open(OPEN);
        await app.chooseFiles(owned("excel/hidden.xlsx"));
        await dialogReady(app);
        const tabs = sheetTabs(app, "hidden.xlsx");
        await expect(tabs).toHaveCount(4);
        await expect(countLine(app)).toHaveText(words.importSheetsCountText({ ticked: 2, tickable: 4 }));
        for (const [place, name] of [[1, "Hidden sheet"], [2, "Very hidden sheet"]]) {
            await expect(tabs.nth(place)).toHaveAccessibleName(`${name} (${words.IMPORT_SHEET_HIDDEN_NOT_TICKED_TEXT})`);
            // (the word is in the tab, to the eye; a screen reader is given it in the words after the name)
            await expect(tabs.nth(place).locator(".import-sheet-badge")).toHaveText(words.IMPORT_SHEET_HIDDEN_WORD);
            await expect(tabs.nth(place).locator(".import-sheet-badge")).toBeVisible();
            await tabs.nth(place).click();
            await expect(app.importSheetPanel.locator(".import-sheet-name")).toHaveText(`${words.importSheetLineText(name)} ${words.IMPORT_SHEET_HIDDEN_WORD}`);
            await expect(tickBox(app)).not.toBeChecked();
            await expect(sheetNote(app)).toHaveText(words.IMPORT_SHEET_HIDDEN_NOTE);
            await expect(sheetNote(app)).toBeVisible();
            const describedBy = await tickBox(app).getAttribute("aria-describedby");
            expect(await app.importSheetPanel.locator(`[id="${describedBy}"]`).textContent()).toBe(words.IMPORT_SHEET_HIDDEN_NOTE);
        }
        // a sheet that is shown has neither the word nor the note
        await tabs.nth(0).click();
        await expect(app.importSheetPanel.locator(".import-sheet-badge")).toHaveCount(0);
        await expect(app.importSheetPanel).not.toContainText(words.IMPORT_SHEET_HIDDEN_NOTE);
        await expect(tickBox(app)).not.toHaveAttribute("aria-describedby", /./);
        await expect(tabs.nth(0).locator(".import-sheet-badge")).toHaveCount(0);
    });

    test("a hidden sheet is imported only when it is ticked: the owner's course workbook gives its four visible sheets, and Lookup with it when that is ticked", async ({ app }) => {
        await app.open(OPEN);
        await app.chooseFiles(owned("excel/messy_course_workbook.xlsx"));
        await dialogReady(app);
        const names = tablesOf(expectedFor("excel/messy_course_workbook.xlsx")).map((table) => table.name);
        await sheetTabs(app, "messy_course_workbook.xlsx").nth(4).click();
        await tickBox(app).check();
        await app.importSubmit.click();
        await expect(app.importDialog).toBeHidden();
        // (Config is hidden too, and is not ticked: it is the only one that is not imported)
        expect(await tablesNow(app)).toEqual(names.filter((name) => name !== "Config").sort());
    });

    test("a hidden sheet that cannot be ticked shows its reason and not the note that a hidden sheet can be ticked: when it holds no values, and when it is too wide", async ({ app }) => {
        await app.open(OPEN);
        const wide = [Array.from({ length: words.MAX_COLUMNS + 1 }, (_, i) => `c${i}`)];
        await app.chooseFiles(made("both.xlsx", [{ name: "Shown", rows: table(1) }, { name: "Hidden blank", rows: [], hidden: 1 }, { name: "Hidden wide", rows: wide, hidden: 2 }]));
        await dialogReady(app);
        const tabs = sheetTabs(app, "both.xlsx");
        for (const [place, name, reason, said] of [
            [1, "Hidden blank", words.IMPORT_SHEET_EMPTY_REASON, words.IMPORT_SHEET_NO_VALUES_TEXT],
            [2, "Hidden wide", words.IMPORT_SHEET_WIDE_REASON, words.IMPORT_REFUSED_TAB_TEXT],
        ]) {
            await tabs.nth(place).click();
            await expect(tabs.nth(place)).toHaveAccessibleName(`${name} (${said})`);
            await expect(app.importSheetPanel.locator(".import-sheet-name")).toHaveText(`${words.importSheetLineText(name)} ${words.IMPORT_SHEET_HIDDEN_WORD}`);
            await expect(sheetNote(app)).toHaveText(reason);
            await expect(app.importSheetPanel).not.toContainText(words.IMPORT_SHEET_HIDDEN_NOTE);
        }
    });
});

// ---- a sheet that cannot be ticked ---------------------------------------------------------------------------------

// the three kinds, and the one that is two: what makes the sheet "Unable", what its tab says, what its panel says,
// and the line about its size (the empty one has none; the wide one says how wide)
const WIDE_COLUMNS = () => words.MAX_COLUMNS + 1;
const UNABLE = [
    { kind: "holds no values", sheets: () => [{ name: "Unable", rows: [] }], edit: null, reason: () => words.IMPORT_SHEET_EMPTY_REASON, said: () => words.IMPORT_SHEET_NO_VALUES_TEXT, size: () => null },
    {
        kind: "has more columns than a table can have",
        sheets: () => [{ name: "Unable", rows: [Array.from({ length: WIDE_COLUMNS() }, (_, i) => `c${i}`), Array.from({ length: WIDE_COLUMNS() }, (_, i) => i)] }],
        edit: null,
        reason: () => words.IMPORT_SHEET_WIDE_REASON,
        said: () => words.IMPORT_REFUSED_TAB_TEXT,
        size: () => words.importSheetSizeText({ rows: 2, columns: WIDE_COLUMNS() }),
    },
    { kind: "has a cell past Excel's last row", sheets: () => [{ name: "Unable", rows: [["x"]] }], edit: cellsAt(1, ["A1048577"]), reason: () => words.IMPORT_SHEET_DAMAGED_REASON, said: () => words.IMPORT_REFUSED_TAB_TEXT, size: () => null },
    { kind: "has a cell past Excel's last column", sheets: () => [{ name: "Unable", rows: [["x"]] }], edit: cellsAt(1, ["XFE1"]), reason: () => words.IMPORT_SHEET_DAMAGED_REASON, said: () => words.IMPORT_REFUSED_TAB_TEXT, size: () => null },
];

test.describe("a sheet that cannot be ticked", () => {
    for (const unable of UNABLE) {
        test(`a sheet that ${unable.kind} is listed with the quiet sign and the words of its reason, its tick box cannot be changed, and it is never imported`, async ({ app, page }) => {
            await app.open(OPEN);
            const sheets = [{ name: "Fine", rows: table(2) }, ...unable.sheets()];
            await app.chooseFiles(made("some.xlsx", sheets, { edit: unable.edit }));
            await dialogReady(app);
            const tabs = sheetTabs(app, "some.xlsx");
            await expect(tabs).toHaveCount(2);
            await expect(tabs.nth(1)).toHaveAccessibleName(`Unable (${unable.said()})`);
            expect(await signOf(tabs.nth(1))).toBe("#icon-circle-alert");
            await expect(tabs.nth(1).locator("svg.import-tab-sign")).toHaveClass(/import-tab-sign--quiet/);
            // (a sheet that can be ticked has the other sign)
            await expect(tabs.nth(0).locator("svg.import-tab-sign")).not.toHaveClass(/import-tab-sign--quiet/);
            await tabs.nth(1).click();
            // its reason, word for word, and the tick box said to be unusable by what describes it
            await expect(sheetNote(app)).toHaveText(unable.reason());
            await expect(tickBox(app)).toHaveAttribute("aria-disabled", "true");
            await expect(tickBox(app)).not.toBeChecked();
            // (it is drawn dimmed, as a box that cannot be used is: the browser draws it as any other, but for this)
            expect(await tickBox(app).evaluate((node) => Number(getComputedStyle(node).opacity)), "the box that cannot be used is dimmed").toBeLessThan(0.9);
            await tabs.nth(0).click();
            expect(await tickBox(app).evaluate((node) => Number(getComputedStyle(node).opacity)), "a box that can be used is not").toBe(1);
            await tabs.nth(1).click();
            const box = await tickBox(app).evaluate((node) => ({ tabIndex: node.tabIndex, disabled: node.disabled, describedBy: document.getElementById(node.getAttribute("aria-describedby"))?.textContent }));
            expect(box).toEqual({ tabIndex: 0, disabled: false, describedBy: unable.reason() });
            // no name, no row of names, no preview, no note of where a table starts
            await expect(sheetName(app)).toHaveCount(0);
            await expect(sheetHasNames(app)).toHaveCount(0);
            await expect(sheetNamesRow(app)).toHaveCount(0);
            await expect(app.importSheetPanel.locator(".import-preview, .import-preview-table, .import-sheet-start")).toHaveCount(0);
            // the size line: the wide sheet says how wide it is
            const size = unable.size();
            if (size === null) {
                await expect(app.importSheetPanel.locator(".import-sheet-size")).toHaveCount(0);
            } else {
                await expect(app.importSheetPanel.locator(".import-sheet-size")).toHaveText(size);
            }
            // the keyboard reaches the box: from the sheet's tab it is the next stop
            await tabs.nth(1).focus();
            await page.keyboard.press("Tab");
            await expect(tickBox(app)).toBeFocused();
            // a click and the space bar leave it unticked (Playwright holds an aria-disabled box to be disabled: forced)
            await tickBox(app).click({ force: true });
            await expect(tickBox(app)).not.toBeChecked();
            await page.keyboard.press("Space");
            await expect(tickBox(app)).not.toBeChecked();
            await expect(tabs.nth(1)).toHaveAccessibleName(`Unable (${unable.said()})`);
            // it is never in the job: Tick every sheet leaves it, and Import makes the one table
            await tickEvery(app).click();
            await expect(tickBox(app)).not.toBeChecked();
            await expect(countLine(app)).toHaveText(words.importSheetsCountText({ ticked: 1, tickable: 1, unable: 1 }));
            await app.importSubmit.click();
            await expect(app.importDialog).toBeHidden();
            expect(await tablesNow(app)).toEqual(["Fine"]);
        });
    }

    // The dimmed look of the label (its quiet colour) is not drawn in forced colours: the stylesheet gives the
    // label of a box that cannot be ticked the system colour for text that cannot be used.
    test("in forced colours the label of the tick box of a sheet that cannot be ticked has the colour that GrayText has there, and the label of a sheet that can be ticked has not", async ({ app, page }) => {
        await page.emulateMedia({ forcedColors: "active", reducedMotion: "reduce" });
        const emulated = await page.evaluate(() => matchMedia("(forced-colors: active)").matches);
        test.skip(!emulated, "this browser cannot emulate forced colours, so the rule of forced colours cannot be looked at in it");
        await app.open(OPEN);
        await app.chooseFiles(made("some.xlsx", [{ name: "Fine", rows: table(2) }, { name: "Unable", rows: [] }]));
        await dialogReady(app);
        const label = () => app.importSheetPanel.locator(".import-sheet-tick span");
        const colour = () => label().evaluate((node) => getComputedStyle(node).color);
        // (the colour GrayText has in this window: an element that is given it)
        const grayText = await page.evaluate(() => {
            const probe = document.createElement("span");
            probe.style.color = "GrayText";
            document.body.append(probe);
            const colour = getComputedStyle(probe).color;
            probe.remove();
            return colour;
        });
        const tabs = sheetTabs(app, "some.xlsx");
        await expect(tickBox(app)).not.toHaveAttribute("aria-disabled", "true");
        const usable = await colour();
        await tabs.nth(1).click();
        await expect(tickBox(app)).toHaveAttribute("aria-disabled", "true");
        expect(await colour(), "a box that cannot be ticked has the colour of GrayText").toBe(grayText);
        expect(usable, "the label of a box that can be ticked has not").not.toBe(grayText);
    });

    test("a sheet of exactly as many columns as a table can have can be ticked, and one more column cannot", async ({ app }) => {
        await app.open(OPEN);
        const row = (count) => Array.from({ length: count }, (_, i) => `c${i}`);
        await app.chooseFiles(made("edge.xlsx", [{ name: "Exactly", rows: [row(words.MAX_COLUMNS)] }, { name: "One more", rows: [row(words.MAX_COLUMNS + 1)] }]));
        await dialogReady(app);
        const tabs = sheetTabs(app, "edge.xlsx");
        await expect(tabs.nth(0)).toHaveAccessibleName(`Exactly (${words.IMPORT_SHEET_TICKED_TEXT})`);
        await expect(app.importSheetPanel.locator(".import-sheet-size")).toHaveText(words.importSheetSizeText({ rows: 1, columns: words.MAX_COLUMNS }));
        await expect(tickBox(app)).toBeChecked();
        await expect(tabs.nth(1)).toHaveAccessibleName(`One more (${words.IMPORT_REFUSED_TAB_TEXT})`);
        await expect(countLine(app)).toHaveText(words.importSheetsCountText({ ticked: 1, tickable: 1, unable: 1 }));
    });

    test("a sheet whose values reach Excel's last row can be ticked and says so; one that reaches its last column is too wide to be ticked", async ({ app }) => {
        await app.open(OPEN);
        await app.chooseFiles(
            made("edges.xlsx", [{ name: "Last row", rows: [["x"]] }, { name: "Last column", rows: [["x"]] }], {
                edit: (files) => {
                    cellsAt(0, ["A1", "A1048576"])(files);
                    cellsAt(1, ["A1", "XFD1"])(files);
                },
            })
        );
        await dialogReady(app);
        const tabs = sheetTabs(app, "edges.xlsx");
        await expect(tabs.nth(0)).toHaveAccessibleName(`Last row (${words.IMPORT_SHEET_TICKED_TEXT})`);
        await expect(app.importSheetPanel.locator(".import-sheet-size")).toHaveText(words.importSheetSizeText({ rows: 1048576, columns: 1 }));
        await expect(app.importSheetPanel.locator(".import-sheet-size")).toContainText("1,048,576 rows");
        await tabs.nth(1).click();
        await expect(tabs.nth(1)).toHaveAccessibleName(`Last column (${words.IMPORT_REFUSED_TAB_TEXT})`);
        await expect(sheetNote(app)).toHaveText(words.IMPORT_SHEET_WIDE_REASON);
        await expect(app.importSheetPanel.locator(".import-sheet-size")).toHaveText(words.importSheetSizeText({ rows: 1, columns: 16384 }));
    });
});

// ---- the size of a sheet and its name ------------------------------------------------------------------------------

test.describe("the line of a sheet's size and the line of its name", () => {
    const sizes = [
        ["a sheet of one row", [["id", "label"]], { rows: 1, columns: 2 }],
        ["a sheet of one column", [["id"], [1], [2]], { rows: 3, columns: 1 }],
        ["a sheet of one cell", [["id"]], { rows: 1, columns: 1 }],
    ];
    for (const [title, rows, size] of sizes) {
        test(`${title} says its size in the singular where it is one`, async ({ app }) => {
            await app.open(OPEN);
            await app.chooseFiles(made("size.xlsx", [{ name: "Sized", rows }]));
            await dialogReady(app);
            await expect(app.importSheetPanel.locator(".import-sheet-size")).toHaveText(words.importSheetSizeText(size));
        });
    }

    test("a value typed by accident far down shows in the size, with the digits grouped, before anything is imported", async ({ app }) => {
        await app.open(OPEN);
        await app.chooseFiles(made("stray.xlsx", [{ name: "Stray", rows: table(3), cells: { A100000: { t: "n", v: 7 } } }]));
        await dialogReady(app);
        await expect(app.importSheetPanel.locator(".import-sheet-size")).toHaveText(words.importSheetSizeText({ rows: 100000, columns: 2 }));
        await expect(app.importSheetPanel.locator(".import-sheet-size")).toContainText("100,000 rows and 2 columns");
        // (the preview shows the first rows only)
        expect(await sheetPreview(app)).toHaveLength(words.PREVIEW_ROWS + 1);
    });

    test("the line that names the sheet gives the whole name, however long, and the tab's title has it too", async ({ app }) => {
        await app.open(OPEN);
        const long = `${"Quarterly figures ".repeat(8)}end`;
        await app.chooseFiles(made("long.xlsx", [{ name: "short", rows: table(1) }, { name: "LONG", rows: table(1) }], { edit: renameSheet("LONG", long) }));
        await dialogReady(app);
        const tabs = sheetTabs(app, "long.xlsx");
        await tabs.nth(1).click();
        await expect(app.importSheetPanel.locator(".import-sheet-title")).toHaveText(words.importSheetLineText(long));
        await expect(tabs.nth(1).locator(".import-tab-name")).toHaveAttribute("title", long);
        await expect(app.importSheetPanel).toHaveAccessibleName(long);
        expect(await app.importSheetPanel.locator(".import-sheet-name").evaluate((node) => node.scrollWidth <= node.clientWidth)).toBe(true);
    });
});


// ---- table names ---------------------------------------------------------------------------------------------------

const IN_NEW = "#import-into-new";
const IN_OPEN = "#import-into-open";

test.describe("the names that are suggested for the tables of sheets", () => {
    test("every sheet that can be ticked is given a name when the workbook opens, in the strip's order and unique: the owner's sheets with names that clash", async ({ app }) => {
        await app.open(OPEN);
        await app.chooseFiles(owned("excel/sheet_names.xlsx"));
        await dialogReady(app);
        // (Sales 2024 and Sales-2024 and sales_2024 are one name to the engine, whatever the case of a letter)
        expect(await tableNamesOf(app, "sheet_names.xlsx")).toEqual(tablesOf(expectedFor("excel/sheet_names.xlsx")).map((table) => table.name));
    });

    test("a sheet that is not ticked is given its name too (the hidden sheets of the owner's workbook), and a sheet that cannot be ticked is given none", async ({ app }) => {
        await app.open(OPEN);
        await app.chooseFiles([owned("excel/messy_course_workbook.xlsx"), owned("excel/empty_sheets.xlsx")]);
        await dialogReady(app);
        expect(await tableNamesOf(app, "messy_course_workbook.xlsx")).toEqual(tablesOf(expectedFor("excel/messy_course_workbook.xlsx")).map((table) => table.name));
        await app.importTabs.nth(1).click();
        expect(await tableNamesOf(app, "empty_sheets.xlsx")).toEqual(tablesOf(expectedFor("excel/empty_sheets.xlsx")).map((table) => table.name));
    });

    test("two workbooks with a sheet of the same name give it two names, in the order of the files; unticking the first changes neither", async ({ app }) => {
        await app.open(OPEN);
        await app.chooseFiles([made("one.xlsx", [{ name: "orders", rows: table(2) }, { name: "extra", rows: table(2) }]), made("two.xlsx", [{ name: "orders", rows: table(3) }, { name: "extra two", rows: table(2) }])]);
        await dialogReady(app);
        const first = async () => (await tableNamesOf(app, "one.xlsx"));
        const second = async () => {
            await app.importTabs.nth(1).click();
            return tableNamesOf(app, "two.xlsx");
        };
        expect(await first()).toEqual(["orders", "extra"]);
        expect(await second()).toEqual(["orders_2", "extra_two"]);
        await untickEvery(app).click();
        await app.importTabs.nth(0).click();
        await untickEvery(app).click();
        expect(await first()).toEqual(["orders", "extra"]);
        expect(await second()).toEqual(["orders_2", "extra_two"]);
    });

    test("a sheet that cannot be ticked takes no name from the sheets of the workbook behind it: a sheet of the same name there keeps it", async ({ app }) => {
        await app.open(OPEN);
        await app.chooseFiles([made("one.xlsx", [{ name: "orders", rows: table(2) }, { name: "blank", rows: [] }]), made("two.xlsx", [{ name: "blank", rows: table(2) }, { name: "other", rows: table(2) }])]);
        await dialogReady(app);
        await app.importTabs.nth(1).click();
        expect(await tableNamesOf(app, "two.xlsx")).toEqual(["blank", "other"]);
    });

    test("a name that was wrong because another sheet was typed the same, in a sheet that nobody typed in, goes when the destination is chosen again and the sheet is given another name", async ({ app }) => {
        await openSample(app);
        await app.chooseFiles(made("book.xlsx", [{ name: "alpha", rows: table(2) }, { name: "beta", rows: table(2) }]));
        await dialogReady(app);
        const tabs = sheetTabs(app, "book.xlsx");
        await sheetName(app).fill("beta");
        await app.importSubmit.click();
        // (the sheet that is second in the strip is the one that is told: the first took the name)
        await expect(tabs.nth(1)).toHaveAttribute("aria-selected", "true");
        await expect(alertIn(app.importSheetPanel, words.IMPORT_NAME_TWICE_SHEET_MESSAGE)).toBeVisible();
        await app.importDialog.locator(IN_OPEN).check();
        await expect(sheetName(app)).toHaveValue("beta_2");
        await expect(alertIn(app.importSheetPanel, words.IMPORT_NAME_TWICE_SHEET_MESSAGE)).toHaveCount(0);
        await expect(sheetName(app)).not.toHaveAttribute("aria-invalid", /./);
    });

    test("the table name and the row of names of a sheet are fields of the same kind as a text file's: no capital, no correction, no spelling, and a row that steps from 1", async ({ app }) => {
        await app.open(OPEN);
        await app.chooseFiles([csvFile("people.csv"), made("book.xlsx", [{ name: "alpha", rows: table(2) }])]);
        await dialogReady(app);
        const kinds = () =>
            app.importPanel.evaluate((panel) => {
                const attributes = (selector, names) => Object.fromEntries(names.map((name) => [name, panel.querySelector(selector).getAttribute(name)]));
                return {
                    name: attributes('input[type="text"]', ["autocomplete", "autocapitalize", "autocorrect", "spellcheck"]),
                    row: attributes('input[type="number"]', ["min", "step", "inputmode"]),
                };
            });
        const text = await kinds();
        expect(text.name).toEqual({ autocomplete: "off", autocapitalize: "off", autocorrect: "off", spellcheck: "false" });
        expect(text.row).toEqual({ min: "1", step: "1", inputmode: "numeric" });
        await app.importTabs.nth(1).click();
        expect(await kinds()).toEqual(text);
    });

    test("a workbook and a text file that would make the same name are told apart: the first file keeps it", async ({ app }) => {
        await app.open(OPEN);
        await app.chooseFiles([csvFile("orders.csv"), made("book.xlsx", [{ name: "orders", rows: table(2) }, { name: "Orders", rows: table(2) }])]);
        await dialogReady(app);
        await expect(app.importPanel.getByLabel(words.IMPORT_TABLE_NAME_LABEL, { exact: true })).toHaveValue("orders");
        await app.importTabs.nth(1).click();
        expect(await tableNamesOf(app, "book.xlsx")).toEqual(["orders_2", "Orders_3"]);
        // (the other way round, the workbook's sheet is first)
        await app.importCancel.click();
        await app.chooseFiles([made("book.xlsx", [{ name: "orders", rows: table(2) }]), csvFile("orders.csv")]);
        await dialogReady(app);
        await expect(sheetName(app)).toHaveValue("orders");
        await app.importTabs.nth(1).click();
        await expect(app.importPanel.getByLabel(words.IMPORT_TABLE_NAME_LABEL, { exact: true })).toHaveValue("orders_2");
    });

    test("with the open database as the destination the names are made against what it holds, and are given again when the new database is chosen", async ({ app }) => {
        await openSample(app);
        // sample.db has the tables fruit and tags and the view v_priced
        await app.chooseFiles(made("book.xlsx", [{ name: "fruit", rows: table(1) }, { name: "Tags", rows: table(1) }, { name: "v_priced", rows: table(1) }, { name: "other", rows: table(1) }]));
        await dialogReady(app);
        await expect(app.importDialog.locator(IN_NEW)).toBeChecked();
        expect(await tableNamesOf(app, "book.xlsx")).toEqual(["fruit", "Tags", "v_priced", "other"]);
        await app.importDialog.locator(IN_OPEN).check();
        expect(await tableNamesOf(app, "book.xlsx")).toEqual(["fruit_2", "Tags_2", "v_priced_2", "other"]);
        await app.importDialog.locator(IN_NEW).check();
        expect(await tableNamesOf(app, "book.xlsx")).toEqual(["fruit", "Tags", "v_priced", "other"]);
    });

    test("a name that the student typed is kept and takes its place: the sheet after it is given another when the names are made again", async ({ app }) => {
        await openSample(app);
        await app.chooseFiles(made("book.xlsx", [{ name: "alpha", rows: table(1) }, { name: "beta", rows: table(1) }]));
        await dialogReady(app);
        const tabs = sheetTabs(app, "book.xlsx");
        await sheetName(app).fill("beta");
        await tabs.nth(1).click();
        // (the second sheet was given its own name before: until the names are made again, it keeps it)
        await expect(sheetName(app)).toHaveValue("beta");
        await app.importDialog.locator(IN_OPEN).check();
        await expect(sheetName(app)).toHaveValue("beta_2");
        await tabs.nth(0).click();
        await expect(sheetName(app)).toHaveValue("beta");
        await app.importDialog.locator(IN_NEW).check();
        await expect(sheetName(app)).toHaveValue("beta");
        await tabs.nth(1).click();
        await expect(sheetName(app)).toHaveValue("beta_2");
    });

    test("a name that is typed is tidied when the student leaves the field: what a table name cannot hold becomes an underscore, and a number at the start gets c_", async ({ app, page }) => {
        await app.open(OPEN);
        await app.chooseFiles(made("book.xlsx", [{ name: "alpha", rows: table(1) }]));
        await dialogReady(app);
        await sheetName(app).fill("my table!");
        // (no change has happened while the field is being typed in)
        await expect(sheetName(app)).toHaveValue("my table!");
        await page.keyboard.press("Tab");
        await expect(sheetName(app)).toHaveValue("my_table_");
        await sheetName(app).fill("1st sheet");
        await page.keyboard.press("Tab");
        await expect(sheetName(app)).toHaveValue("c_1st_sheet");
    });
});

test.describe("Import pressed with a name that cannot be used, in a sheet", () => {
    // The student types the name in the panel of the second sheet of the workbook, goes to another sheet and
    // to another file's tab, and presses Import: the workbook's tab and the sheet's tab are shown, and the focus
    // is in the sheet's name field, with the message under it.
    async function pressImportWith(app, typed, { files = null, beforeImport = null } = {}) {
        await app.chooseFiles(files ?? [csvFile("other.csv"), made("book.xlsx", [{ name: "alpha", rows: table(2) }, { name: "beta", rows: table(2) }, { name: "gamma", rows: table(2) }])]);
        await dialogReady(app);
        const workbook = app.importTabs.filter({ hasText: "book.xlsx" });
        await workbook.click();
        const tabs = sheetTabs(app, "book.xlsx");
        await tabs.nth(1).click();
        await sheetName(app).fill(typed);
        await tabs.nth(0).click();
        await app.importTabs.filter({ hasText: "other.csv" }).click();
        await beforeImport?.();
        await app.importSubmit.click();
    }
    const expectShown = async (app, message) => {
        await expect(app.importTabs.filter({ hasText: "book.xlsx" })).toHaveAttribute("aria-selected", "true");
        await expect(sheetTabs(app, "book.xlsx").nth(1)).toHaveAttribute("aria-selected", "true");
        await expect(alertIn(app.importSheetPanel, message)).toBeVisible();
        await expect(sheetName(app)).toHaveAttribute("aria-invalid", "true");
        await expect(sheetName(app)).toBeFocused();
        await expect(app.importDialog).toBeVisible();
    };

    const cases = [
        ["is empty", "", () => words.IMPORT_NAME_EMPTY_MESSAGE],
        ["starts with sqlite_, in any case", "SQLite_mine", () => words.IMPORT_NAME_RESERVED_MESSAGE],
        ["is the name another sheet has", "alpha", () => words.IMPORT_NAME_TWICE_SHEET_MESSAGE],
        ["is the name a text file has, in another letter case", "OTHER", () => words.IMPORT_NAME_TWICE_SHEET_MESSAGE],
    ];
    for (const [title, typed, message] of cases) {
        test(`a name that ${title}: the message is under that sheet's name, with its tab shown and the focus in the field, and nothing is imported`, async ({ app }) => {
            await app.open(OPEN);
            const before = await tablesNow(app);
            await pressImportWith(app, typed);
            await expectShown(app, message());
            expect(await tablesNow(app)).toEqual(before);
            // the message goes when the student types, and the name can then be used
            await sheetName(app).fill("fine_name");
            await expect(alertIn(app.importSheetPanel, message())).toHaveCount(0);
            await expect(sheetName(app)).not.toHaveAttribute("aria-invalid", /./);
        });
    }

    test("a name that a sheet has and a text file after it has says file or sheet, under the text file's name", async ({ app }) => {
        await app.open(OPEN);
        await app.chooseFiles([made("book.xlsx", [{ name: "alpha", rows: table(1) }, { name: "beta", rows: table(1) }]), csvFile("y.csv")]);
        await dialogReady(app);
        await app.importTabs.nth(1).click();
        await app.importPanel.getByLabel(words.IMPORT_TABLE_NAME_LABEL, { exact: true }).fill("beta");
        await app.importSubmit.click();
        await expect(app.importTabs.nth(1)).toHaveAttribute("aria-selected", "true");
        await expect(alertIn(app.importPanel, words.IMPORT_NAME_TWICE_SHEET_MESSAGE)).toBeVisible();
        await expect(alertIn(app.importPanel, words.IMPORT_NAME_TWICE_MESSAGE)).toHaveCount(0);
    });

    test("a name that two text files have is the other sentence, which does not say sheet; one that a sheet and a file have says file or sheet", async ({ app }) => {
        await app.open(OPEN);
        await app.chooseFiles([csvFile("x.csv"), csvFile("y.csv"), made("book.xlsx", [{ name: "alpha", rows: table(1) }, { name: "beta", rows: table(1) }])]);
        await dialogReady(app);
        await app.importTabs.nth(1).click();
        await app.importPanel.getByLabel(words.IMPORT_TABLE_NAME_LABEL, { exact: true }).fill("x");
        await app.importTabs.nth(2).click();
        await app.importSubmit.click();
        await expect(app.importTabs.nth(1)).toHaveAttribute("aria-selected", "true");
        await expect(alertIn(app.importPanel, words.IMPORT_NAME_TWICE_MESSAGE)).toBeVisible();
        expect(words.IMPORT_NAME_TWICE_MESSAGE).not.toContain("sheet");
        expect(words.IMPORT_NAME_TWICE_SHEET_MESSAGE).toContain("file or sheet");
    });

    test("a name that the open database has is refused with its name, in any letter case, and the same name is free in a new database", async ({ app }) => {
        await openSample(app);
        const before = await tablesNow(app);
        await app.importDialog.evaluate(() => {});
        await app.chooseFiles([csvFile("other.csv"), made("book.xlsx", [{ name: "alpha", rows: table(2) }, { name: "beta", rows: table(2) }, { name: "gamma", rows: table(2) }])]);
        await dialogReady(app);
        await app.importDialog.locator(IN_OPEN).check();
        await app.importTabs.filter({ hasText: "book.xlsx" }).click();
        await sheetTabs(app, "book.xlsx").nth(1).click();
        await sheetName(app).fill("FRUIT");
        await app.importTabs.filter({ hasText: "other.csv" }).click();
        await app.importSubmit.click();
        await expectShown(app, words.importNameTakenMessage("sample.db"));
        expect(await tablesNow(app)).toEqual(before);
        // a new database has nothing to clash with
        await app.importDialog.locator(IN_NEW).check();
        await app.importSubmit.click();
        await expect(app.importDialog).toBeHidden();
    });

    test("a name that only a TEMP table has is said to be a temporary table's", async ({ app }) => {
        await openSample(app);
        await app.rows("CREATE TEMP TABLE scratch(x)");
        const before = await tablesNow(app);
        await app.chooseFiles([csvFile("other.csv"), made("book.xlsx", [{ name: "alpha", rows: table(2) }, { name: "beta", rows: table(2) }])]);
        await dialogReady(app);
        await app.importDialog.locator(IN_OPEN).check();
        await app.importTabs.filter({ hasText: "book.xlsx" }).click();
        await sheetTabs(app, "book.xlsx").nth(1).click();
        await sheetName(app).fill("scratch");
        await sheetTabs(app, "book.xlsx").nth(0).click();
        await app.importTabs.filter({ hasText: "other.csv" }).click();
        await app.importSubmit.click();
        await expectShown(app, words.IMPORT_NAME_TEMPORARY_MESSAGE);
        expect(await tablesNow(app)).toEqual(before);
    });

    // The names that are suggested can be refused too, and the sheet's panel was never shown: it is built then.
    test("a sheet that was never shown, whose suggested name starts with sqlite_, is shown when Import is pressed, with its tab, its message and the focus in its name", async ({ app, page }) => {
        await app.open(OPEN);
        await app.chooseFiles(made("book.xlsx", [{ name: "alpha", rows: table(2) }, { name: "beta", rows: table(2) }, { name: "sqlite_stuff", rows: table(2) }]));
        await dialogReady(app);
        expect(await builtPanels(page)).toBe(1);
        await app.importSubmit.click();
        await expect(sheetTabs(app, "book.xlsx").nth(2)).toHaveAttribute("aria-selected", "true");
        await expect(alertIn(app.importSheetPanel, words.IMPORT_NAME_RESERVED_MESSAGE)).toBeVisible();
        await expect(sheetName(app)).toHaveValue("sqlite_stuff");
        await expect(sheetName(app)).toBeFocused();
        expect(await builtPanels(page)).toBe(2);
        await expect(app.importDialog).toBeVisible();
    });

    test("a sheet that was never shown, whose name the open database took after the dialog opened, and one that a TEMP table took, are shown and told when Import is pressed", async ({ app }) => {
        await openSample(app);
        await app.chooseFiles(made("book.xlsx", [{ name: "alpha", rows: table(2) }, { name: "gamma", rows: table(2) }, { name: "delta", rows: table(2) }]));
        await dialogReady(app);
        await app.importDialog.locator(IN_OPEN).check();
        // (two names that the dialog made free are taken meanwhile, by the student's own statements)
        await app.rows("CREATE TABLE gamma(x)");
        await app.rows("CREATE TEMP TABLE delta(x)");
        await app.importSubmit.click();
        await expect(sheetTabs(app, "book.xlsx").nth(1)).toHaveAttribute("aria-selected", "true");
        await expect(alertIn(app.importSheetPanel, words.importNameTakenMessage("sample.db"))).toBeVisible();
        await expect(sheetName(app)).toBeFocused();
        // the next problem is the next sheet's, when this one is put right
        await sheetName(app).fill("gamma_made");
        await app.importSubmit.click();
        await expect(sheetTabs(app, "book.xlsx").nth(2)).toHaveAttribute("aria-selected", "true");
        await expect(alertIn(app.importSheetPanel, words.IMPORT_NAME_TEMPORARY_MESSAGE)).toBeVisible();
        await expect(sheetName(app)).toBeFocused();
    });

    test("a name that is wrong in a sheet that is not ticked does not stop Import", async ({ app }) => {
        await app.open(OPEN);
        await app.chooseFiles(made("book.xlsx", [{ name: "alpha", rows: table(2) }, { name: "beta", rows: table(2) }]));
        await dialogReady(app);
        await sheetTabs(app, "book.xlsx").nth(1).click();
        await sheetName(app).fill("");
        await tickBox(app).uncheck();
        await app.importSubmit.click();
        await expect(app.importDialog).toBeHidden();
        expect(await tablesNow(app)).toEqual(["alpha"]);
    });
});

// ---- the row of names of a sheet -----------------------------------------------------------------------------------

test.describe("the row of column names of a sheet", () => {
    test("is ticked at first, with row 1, for every sheet, whatever its first row holds: nothing is guessed for a sheet", async ({ app }) => {
        await app.open(OPEN);
        await app.chooseFiles(made("book.xlsx", [{ name: "words", rows: [["id", "label"], [1, "a"]] }, { name: "numbers", rows: [[1, 2], [3, 4]] }, { name: "dates", rows: [[{ t: "n", v: 45143, z: "yyyy-mm-dd" }, 5]] }]));
        await dialogReady(app);
        for (let i = 0; i < 3; i++) {
            await sheetTabs(app, "book.xlsx").nth(i).click();
            await expect(sheetHasNames(app)).toBeChecked();
            await expect(sheetNamesRow(app)).toHaveValue("1");
            await expect(sheetNamesRow(app)).toBeEnabled();
        }
    });

    test("unticking the box disables the row field, keeps what it holds, and the preview marks no row as the names, and nothing as left out", async ({ app }) => {
        await app.open(OPEN);
        await app.chooseFiles(made("book.xlsx", [{ name: "long", rows: table(29) }]));
        await dialogReady(app);
        await sheetNamesRow(app).fill("5");
        expect((await sheetPreview(app)).map((row) => row.tag).slice(0, 6)).toEqual(["left out", "left out", "left out", words.IMPORT_PREVIEW_NAMES, "", ""]);
        await sheetHasNames(app).uncheck();
        await expect(sheetNamesRow(app)).toBeDisabled();
        await expect(sheetNamesRow(app)).toHaveValue("5");
        const rows = await sheetPreview(app);
        expect(rows.map((row) => row.tag).filter(Boolean)).toEqual([]);
        expect(rows[0].number).toBe("1");
        expect(rows).toHaveLength(words.PREVIEW_ROWS);
        await expect(app.importSheetPanel.locator(".import-preview-note")).toBeHidden();
        // (not an empty paragraph with its margins: the note is hidden, as it is where it has nothing to say)
        await expect(app.importSheetPanel.locator(".import-preview-note")).toHaveJSProperty("hidden", true);
        await sheetHasNames(app).check();
        await expect(sheetNamesRow(app)).toBeEnabled();
        expect((await sheetPreview(app))[3].tag).toBe(words.IMPORT_PREVIEW_NAMES);
    });

    test("a row that is no row of the sheet holds Import up, and unticking the box of the names lifts that at once, and ticking it again brings it back", async ({ app }) => {
        await app.open(OPEN);
        await app.chooseFiles(made("book.xlsx", [{ name: "three", rows: table(2) }]));
        await dialogReady(app);
        await sheetNamesRow(app).fill("9");
        await expect(app.importSubmit).toBeDisabled();
        await sheetHasNames(app).uncheck();
        await expect(app.importSubmit).toBeEnabled();
        await expect(app.importSheetPanel.getByRole("alert").filter({ hasText: /\S/ })).toHaveCount(0);
        await sheetHasNames(app).check();
        await expect(app.importSubmit).toBeDisabled();
        await expect(alertIn(app.importSheetPanel, words.importNamesRowSheetMessage(3))).toBeVisible();
    });

    test("the row the names are on is the row the table is made from: a title row above the names is left out of the table", async ({ app }) => {
        await app.open(OPEN);
        await app.chooseFiles(made("book.xlsx", [{ name: "titled", rows: [["A title that is not a name"], ["id", "label"], [1, "one"], [2, "two"]] }]));
        await dialogReady(app);
        await sheetNamesRow(app).fill("2");
        await app.importSubmit.click();
        await expect(app.importDialog).toBeHidden();
        expect(await app.rows("SELECT id, label FROM titled ORDER BY id")).toEqual([[1, "one"], [2, "two"]]);
    });

    test("a row beyond the sheet says how many rows the sheet has, in the sheet's words and not the text file's, and the preview then marks no names", async ({ app }) => {
        await app.open(OPEN);
        await app.chooseFiles(made("book.xlsx", [{ name: "three", rows: table(2) }, { name: "one", rows: [["only"]] }]));
        await dialogReady(app);
        await sheetNamesRow(app).fill("4");
        await expect(alertIn(app.importSheetPanel, words.importNamesRowSheetMessage(3))).toBeVisible();
        await expect(sheetNamesRow(app)).toHaveAttribute("aria-invalid", "true");
        expect(words.importNamesRowSheetMessage(3)).not.toBe(words.importNamesRowMessage(3));
        await expect(app.importSheetPanel.getByRole("alert").filter({ hasText: words.importNamesRowMessage(3) })).toHaveCount(0);
        expect((await sheetPreview(app)).filter((row) => row.tag)).toEqual([]);
        await sheetNamesRow(app).fill("3");
        await expect(app.importSheetPanel.getByRole("alert").filter({ hasText: /\S/ })).toHaveCount(0);
        // a sheet of one row has the singular
        await sheetTabs(app, "book.xlsx").nth(1).click();
        await sheetNamesRow(app).fill("2");
        await expect(alertIn(app.importSheetPanel, words.importNamesRowSheetMessage(1))).toBeVisible();
        await expect(alertIn(app.importSheetPanel, "1 row")).toHaveCount(1);
        await expect(alertIn(app.importSheetPanel, "1 rows")).toHaveCount(0);
    });

    for (const [title, typed] of [["0", "0"], ["1.5", "1.5"], ["-1", "-1"], ["nothing", ""], ["twenty digits, too many to be counted exactly", "99999999999999999999"]]) {
        test(`${title} in the box of the row is no row: it says so, in the words of any file, and holds Import`, async ({ app }) => {
            await app.open(OPEN);
            await app.chooseFiles(made("book.xlsx", [{ name: "three", rows: table(2) }]));
            await dialogReady(app);
            await sheetNamesRow(app).fill(typed);
            await expect(alertIn(app.importSheetPanel, words.IMPORT_NAMES_ROW_NOT_A_ROW_MESSAGE)).toBeVisible();
            await expect(app.importSubmit).toBeDisabled();
            await sheetNamesRow(app).fill("2");
            await expect(app.importSheetPanel.getByRole("alert").filter({ hasText: /\S/ })).toHaveCount(0);
            await expect(app.importSubmit).toBeEnabled();
        });
    }

    test("a letter typed in the box of the row is no row either", async ({ app, page }) => {
        await app.open(OPEN);
        await app.chooseFiles(made("book.xlsx", [{ name: "three", rows: table(2) }]));
        await dialogReady(app);
        await sheetNamesRow(app).fill("");
        await sheetNamesRow(app).focus();
        await page.keyboard.type("e");
        await expect(alertIn(app.importSheetPanel, words.IMPORT_NAMES_ROW_NOT_A_ROW_MESSAGE)).toBeVisible();
        await expect(app.importSubmit).toBeDisabled();
    });

    test("the preview follows the row: up to three rows above it are shown as left out, the rows above them are counted in a note, and the 20 rows under the names are shown", async ({ app }) => {
        await app.open(OPEN);
        await app.chooseFiles(made("book.xlsx", [{ name: "long", rows: table(29) }]));
        await dialogReady(app);
        const note = app.importSheetPanel.locator(".import-preview-note");
        // names on row 1: the names and twenty rows, and no note
        let rows = await sheetPreview(app);
        expect(rows.map((row) => row.number)).toEqual(Array.from({ length: words.PREVIEW_ROWS + 1 }, (_, i) => String(i + 1)));
        expect(rows.map((row) => row.tag).filter(Boolean)).toEqual([words.IMPORT_PREVIEW_NAMES]);
        await expect(note).toBeHidden();
        // names on row 3: the two rows above are left out
        await sheetNamesRow(app).fill("3");
        rows = await sheetPreview(app);
        expect(rows.map((row) => row.tag).slice(0, 4)).toEqual(["left out", "left out", words.IMPORT_PREVIEW_NAMES, ""]);
        expect(rows).toHaveLength(2 + 1 + words.PREVIEW_ROWS);
        await expect(note).toBeHidden();
        // names on row 10: three rows above are shown, and six more are not
        await sheetNamesRow(app).fill("10");
        rows = await sheetPreview(app);
        expect(rows.map((row) => row.number).slice(0, 5)).toEqual(["7", "8", "9", "10", "11"]);
        expect(rows.map((row) => row.tag).slice(0, 4)).toEqual(["left out", "left out", "left out", words.IMPORT_PREVIEW_NAMES]);
        await expect(note).toBeVisible();
        await expect(note).toHaveText(words.importPreviewAboveMessage(6));
        // (and back to names on row 1: the note is hidden again, and no longer takes a line)
        await sheetNamesRow(app).fill("1");
        await expect(note).toHaveJSProperty("hidden", true);
        await sheetNamesRow(app).fill("10");
        expect(rows).toHaveLength(3 + 1 + words.PREVIEW_ROWS - 0);
        // the cells of the row of names are the sheet's own
        expect(rows[3].cells).toEqual(["9", "row 9"]);
    });

    test("a row of names with no data under it says so, and the rows above that are not shown are counted, in the singular for one", async ({ app }) => {
        await app.open(OPEN);
        await app.chooseFiles(made("book.xlsx", [{ name: "five", rows: table(4) }, { name: "three", rows: table(2) }]));
        await dialogReady(app);
        const note = app.importSheetPanel.locator(".import-preview-note");
        // five rows: names on row 4 have a row under them
        await sheetNamesRow(app).fill("4");
        await expect(note).toBeHidden();
        // names on the last row: nothing under them, and row 1 is above the three that are shown
        await sheetNamesRow(app).fill("5");
        await expect(note).toBeVisible();
        await expect(note).toHaveText(`${words.importPreviewAboveMessage(1)} ${words.IMPORT_PREVIEW_NO_DATA_MESSAGE}`);
        expect(words.importPreviewAboveMessage(1)).toBe("1 more row above is left out.");
        // three rows: the names on the last, and every row above is shown
        await sheetTabs(app, "book.xlsx").nth(1).click();
        await sheetNamesRow(app).fill("3");
        await expect(note).toHaveText(words.IMPORT_PREVIEW_NO_DATA_MESSAGE);
        expect((await sheetPreview(app)).map((row) => row.tag)).toEqual(["left out", "left out", words.IMPORT_PREVIEW_NAMES]);
    });
});

// ---- the preview of a sheet ----------------------------------------------------------------------------------------

test.describe("the preview of a sheet", () => {
    test("counts its rows from the table's first row, and says where the table starts when that is not A1: the owner's sheet that starts at C5", async ({ app }) => {
        await app.open(OPEN);
        await app.chooseFiles(owned("excel/title_rows_and_layouts.xlsx"));
        await dialogReady(app);
        const expected = tablesOf(expectedFor("excel/title_rows_and_layouts.xlsx")).find((one) => one.name === "Starts_at_C5");
        await sheetTabs(app, "title_rows_and_layouts.xlsx").nth(1).click();
        await expect(app.importSheetPanel).toContainText(words.importSheetLineText("Starts at C5"));
        await expect(app.importSheetPanel.locator(".import-sheet-start")).toHaveText(words.importSheetStartNote("C5"));
        const rows = await sheetPreview(app);
        // (row 1 is the first row of the table, which is row 5 of the sheet: its first cell is C5)
        expect(rows[0].number).toBe("1");
        expect(rows[0].tag).toBe(words.IMPORT_PREVIEW_NAMES);
        expect(rows[0].cells).toEqual(expected.columns.map((column) => column.original ?? column.name));
        rows.slice(1, 1 + expected.data.length).forEach((row, i) => {
            expect(row.cells, `row ${i + 2}`).toEqual(expected.data[i].map((value) => (value === null ? nullText : String(value))));
        });
        // the sheet that starts at A1 has no such line
        await sheetTabs(app, "title_rows_and_layouts.xlsx").nth(0).click();
        await expect(app.importSheetPanel.locator(".import-sheet-start")).toHaveCount(0);
        await app.importCancel.click();
        await app.chooseFiles(owned("shopping_db.xlsx"));
        await dialogReady(app);
        await expect(app.importSheetPanel.locator(".import-sheet-start")).toHaveCount(0);
        await expect(app.importSheetPanel).not.toContainText("starts at");
    });

    test("shows a value as the rules give it: a date as text, a number written out in full, a formula's result, a true and an error as words, an empty cell as empty, and a merged block's value once", async ({ app }) => {
        await app.open(OPEN);
        await app.chooseFiles(
            made("values.xlsx", [
                {
                    name: "Values",
                    rows: [["when", "big", "calc", "gap", "flag", "err", "plain"], [], [], []],
                    cells: {
                        A2: { t: "n", v: 45143, z: "yyyy-mm-dd" },
                        B2: { t: "n", v: 1e21 },
                        C2: { t: "n", v: 3, f: "1+2" },
                        E2: { t: "b", v: true },
                        F2: { t: "e", v: 42, w: "#N/A" },
                        G2: { t: "n", v: 0.1 + 0.2 },
                        A3: { t: "s", v: "block" },
                        A4: { t: "n", v: 1234.5 },
                    },
                    merges: ["A3:C3"],
                },
            ])
        );
        await dialogReady(app);
        const rows = await sheetPreview(app);
        expect(rows[1].cells).toEqual(["2023-08-05", "1000000000000000000000", "3", nullText, "TRUE", "#N/A", "0.30000000000000004"]);
        expect(rows[1].empty).toEqual([false, false, false, true, false, false, false]);
        // the block is one value, in its first cell: the others of the block hold nothing
        expect(rows[2].cells).toEqual(["block", nullText, nullText, nullText, nullText, nullText, nullText]);
        expect(rows[2].empty).toEqual([false, true, true, true, true, true, true]);
        expect(rows[3].cells[0]).toBe("1234.5");
    });

    test("an empty cell is blank in the row of names and empty in the rows below", async ({ app }) => {
        await app.open(OPEN);
        await app.chooseFiles(made("gaps.xlsx", [{ name: "Gaps", rows: [["a", null, "c"], [1, null, 3]] }]));
        await dialogReady(app);
        const rows = await sheetPreview(app);
        expect(rows[0].cells).toEqual(["a", words.IMPORT_PREVIEW_BLANK, "c"]);
        expect(rows[1].cells).toEqual(["1", nullText, "3"]);
        expect(rows[1].empty).toEqual([false, true, false]);
    });

    test("a cell of more than 80 characters is cut short with the whole of it in its title; one of exactly 80 is shown whole", async ({ app }) => {
        await app.open(OPEN);
        const eighty = `${"a".repeat(39)} ${"b".repeat(40)}`;
        const long = `${"c".repeat(40)} ${"d".repeat(60)}`;
        await app.chooseFiles(made("long.xlsx", [{ name: "Long", rows: [["short", "eighty", "long"], ["x", eighty, long]] }]));
        await dialogReady(app);
        const [, row] = await sheetPreview(app);
        expect(row.cells[0]).toBe("x");
        expect(row.cells[1]).toBe(eighty);
        expect(row.titles[1]).toBeNull();
        expect(row.cells[2]).toBe(`${long.slice(0, 80)}…`);
        expect(row.titles[2]).toBe(long);
    });

    test("white space at an end of a cell is marked, and white space inside is not", async ({ app }) => {
        await app.open(OPEN);
        await app.chooseFiles(made("spaces.xlsx", [{ name: "Spaces", rows: [["a", "b", "c", "d", "e"], [" lead", "trail ", "in side", "  ", "plain"]] }]));
        await dialogReady(app);
        const [, row] = await sheetPreview(app);
        expect(row.cells).toEqual([" lead", "trail ", "in side", "  ", "plain"]);
        expect(row.marked).toEqual([true, true, false, true, false]);
    });

    test("shows the row of names and twenty rows under it; with no row of names, twenty rows", async ({ app }) => {
        await app.open(OPEN);
        await app.chooseFiles(made("forty.xlsx", [{ name: "Forty", rows: table(40) }]));
        await dialogReady(app);
        const rows = await sheetPreview(app);
        expect(rows).toHaveLength(1 + words.PREVIEW_ROWS);
        expect(rows[0].tag).toBe(words.IMPORT_PREVIEW_NAMES);
        expect(rows.at(-1).number).toBe(String(1 + words.PREVIEW_ROWS));
        await sheetHasNames(app).uncheck();
        expect(await sheetPreview(app)).toHaveLength(words.PREVIEW_ROWS);
    });

    test("is a region that has a name and can take the focus, and has a heading of columns numbered from 1", async ({ app }) => {
        await app.open(OPEN);
        await app.chooseFiles(made("book.xlsx", [{ name: "Cols", rows: table(2, ["a", "b", "c"]).map((row) => (row.length === 2 ? [...row, "z"] : row)) }]));
        await dialogReady(app);
        const region = app.importSheetPanel.getByRole("region", { name: words.IMPORT_PREVIEW_LABEL });
        await expect(region).toBeVisible();
        await expect(region).toHaveAttribute("tabindex", "0");
        expect(await region.locator("thead th").allTextContents()).toEqual([words.IMPORT_PREVIEW_ROW_HEADING, "1", "2", "3"]);
    });
});


// ---- the line beside Import, and Import itself ---------------------------------------------------------------------

test.describe("what holds Import up, and the line that says so", () => {
    test("a ticked sheet whose row of names is no row of it holds Import; the line names it only while another sheet is on show, and says nothing while the student is at it", async ({ app }) => {
        await app.open(OPEN);
        await app.chooseFiles(made("book.xlsx", [{ name: "alpha", rows: table(2) }, { name: "beta", rows: table(2) }]));
        await dialogReady(app);
        const tabs = sheetTabs(app, "book.xlsx");
        await tabs.nth(1).click();
        await sheetNamesRow(app).fill("99");
        await expect(alertIn(app.importSheetPanel, words.importNamesRowSheetMessage(3))).toBeVisible();
        // the sheet itself is on show: its field says what is wrong, and the line says nothing
        await expect(app.importSubmit).toBeDisabled();
        await expect(holdLine(app)).toBeHidden();
        await expect(holdLine(app)).toHaveText("");
        await tabs.nth(0).click();
        await expect(app.importSubmit).toBeDisabled();
        await expect(holdLine(app)).toHaveText(words.importHoldSheetProblemMessage("beta", "book.xlsx"));
        await expect(app.importSubmit).toHaveAttribute("aria-describedby", "import-hold");
        // (the sheet is on show again: the line is not there, and Import still waits)
        await tabs.nth(1).click();
        await expect(holdLine(app)).toBeHidden();
        await expect(app.importSubmit).toBeDisabled();
        // put right, Import is there to press, and described by nothing
        await sheetNamesRow(app).fill("1");
        await expect(app.importSubmit).toBeEnabled();
        await expect(holdLine(app)).toBeHidden();
        expect(await app.importSubmit.getAttribute("aria-describedby")).toBeNull();
    });

    test("a workbook of one sheet whose row of names is no row of it: the sheet is the one on show, so the line says nothing, though Import waits; with another file's tab on show the line names the sheet", async ({ app }) => {
        await app.open(OPEN);
        await app.chooseFiles([made("book.xlsx", [{ name: "only", rows: table(2) }]), csvFile("plain.csv")]);
        await dialogReady(app);
        await sheetNamesRow(app).fill("99");
        await expect(alertIn(app.importSheetPanel, words.importNamesRowSheetMessage(3))).toBeVisible();
        await expect(app.importSubmit).toBeDisabled();
        await expect(holdLine(app)).toBeHidden();
        await app.importTabs.nth(1).click();
        await expect(holdLine(app)).toHaveText(words.importHoldSheetProblemMessage("only", "book.xlsx"));
        await app.importTabs.nth(0).click();
        await expect(holdLine(app)).toBeHidden();
    });

    test("the line names the sheet when another file's tab is on show, though the sheet is the one that its workbook shows, and says nothing when the workbook is shown again", async ({ app }) => {
        await app.open(OPEN);
        await app.chooseFiles([csvFile("people.csv"), made("book.xlsx", [{ name: "alpha", rows: table(2) }, { name: "beta", rows: table(2) }])]);
        await dialogReady(app);
        await app.importTabs.nth(1).click();
        await sheetTabs(app, "book.xlsx").nth(1).click();
        await sheetNamesRow(app).fill("0");
        await expect(holdLine(app)).toBeHidden();
        await app.importTabs.nth(0).click();
        await expect(holdLine(app)).toHaveText(words.importHoldSheetProblemMessage("beta", "book.xlsx"));
        await expect(app.importSubmit).toBeDisabled();
        await app.importTabs.nth(1).click();
        await expect(holdLine(app)).toBeHidden();
        await expect(app.importSubmit).toBeDisabled();
    });

    test("a sheet that is not ticked holds nothing, whatever its row of names says, and holds Import again when it is ticked", async ({ app }) => {
        await app.open(OPEN);
        await app.chooseFiles(made("book.xlsx", [{ name: "alpha", rows: table(2) }, { name: "beta", rows: table(2), hidden: 1 }]));
        await dialogReady(app);
        const tabs = sheetTabs(app, "book.xlsx");
        // a hidden sheet is not ticked: a row typed beyond it holds nothing
        await tabs.nth(1).click();
        await sheetNamesRow(app).fill("99");
        await tabs.nth(0).click();
        await expect(app.importSubmit).toBeEnabled();
        await expect(holdLine(app)).toBeHidden();
        // ticked, it holds Import and the line names it
        await tabs.nth(1).click();
        await tickBox(app).check();
        await expect(app.importSubmit).toBeDisabled();
        await tabs.nth(0).click();
        await expect(holdLine(app)).toHaveText(words.importHoldSheetProblemMessage("beta", "book.xlsx"));
        // unticked with the button, while the other sheet is on show: Import is there again
        await untickEvery(app).click();
        await tickBox(app).check();
        await expect(holdLine(app)).toBeHidden();
        await expect(app.importSubmit).toBeEnabled();
        await app.importSubmit.click();
        await expect(app.importDialog).toBeHidden();
        expect(await tablesNow(app)).toEqual(["alpha"]);
    });

    test("a sheet whose name is only spaces is named in the line by its place", async ({ app }) => {
        await app.open(OPEN);
        await app.chooseFiles(made("book.xlsx", [{ name: "alpha", rows: table(2) }, { name: "   ", rows: table(2) }]));
        await dialogReady(app);
        await sheetTabs(app, "book.xlsx").nth(1).click();
        await sheetNamesRow(app).fill("99");
        await sheetTabs(app, "book.xlsx").nth(0).click();
        await expect(holdLine(app)).toHaveText(words.importHoldSheetProblemMessage(words.importSheetUnnamedLabel(2), "book.xlsx"));
    });

    test("when nothing is ticked though a sheet could be, Import is held and the line says to tick one; ticking one takes the line away", async ({ app }) => {
        await app.open(OPEN);
        await app.chooseFiles(made("book.xlsx", [{ name: "alpha", rows: table(2) }, { name: "beta", rows: table(2) }]));
        await dialogReady(app);
        await untickEvery(app).click();
        await expect(app.importSubmit).toBeDisabled();
        await expect(holdLine(app)).toBeVisible();
        await expect(holdLine(app)).toHaveText(words.IMPORT_HOLD_NO_SHEET_MESSAGE);
        await expect(app.importSubmit).toHaveAttribute("aria-describedby", "import-hold");
        await tickBox(app).check();
        await expect(app.importSubmit).toBeEnabled();
        await expect(holdLine(app)).toBeHidden();
        expect(await app.importSubmit.getAttribute("aria-describedby")).toBeNull();
    });

    test("with a text file beside the workbook, nothing ticked in the workbook does not hold Import: the file is imported alone, and no sheet is in the job", async ({ app }) => {
        await app.open(OPEN);
        await app.chooseFiles([csvFile("people.csv"), made("book.xlsx", [{ name: "alpha", rows: table(2) }, { name: "beta", rows: table(2) }])]);
        await dialogReady(app);
        await app.importTabs.nth(1).click();
        await untickEvery(app).click();
        await expect(countLine(app)).toHaveText(words.importSheetsCountText({ ticked: 0, tickable: 2 }));
        await expect(app.importSubmit).toBeEnabled();
        await expect(holdLine(app)).toBeHidden();
        await app.importSubmit.click();
        await expect(app.importDialog).toBeHidden();
        expect(await tablesNow(app)).toEqual(["people"]);
    });

    test("a workbook that is still being read behind another tab is named by the line after 600 ms of the page's clock, and not before", async ({ app, page }) => {
        const held = await holdVendor(page, LIBRARY);
        // (a date of the test's own: the clock starts and stops at the same instants in every run)
        await page.clock.install({ time: new Date("2026-11-16T10:00:00Z") });
        await app.open(OPEN);
        await page.clock.pauseAt(new Date("2026-11-16T10:01:00Z"));
        await app.chooseFiles([csvFile("people.csv"), made("book.xlsx", [{ name: "alpha", rows: table(2) }, { name: "beta", rows: table(2) }])]);
        await expect(app.importDialog).toBeVisible();
        // the text file has been read, and the workbook is waiting for its library
        await expect(app.importDialog.locator(".import-reading")).toHaveCount(1);
        await expect(app.importTabs.first()).toHaveAttribute("aria-selected", "true");
        await expect(app.importSubmit).toBeDisabled();
        await expect(holdLine(app)).toHaveText("");
        await page.clock.runFor(500);
        await expect(holdLine(app)).toBeHidden();
        expect(await app.importSubmit.getAttribute("aria-describedby"), "Import is described by nothing yet").toBeNull();
        await page.clock.runFor(100);
        await expect(holdLine(app)).toHaveText(words.importHoldReadingMessage("book.xlsx"));
        await expect(app.importSubmit).toHaveAttribute("aria-describedby", "import-hold");
        // the library comes, with the clock running again: the sheets are there, and the line is not
        await page.clock.resume();
        held.open();
        await expect(app.importDialog.locator(".import-reading")).toHaveCount(0);
        await expect(sheetTabs(app, "book.xlsx")).toHaveCount(0);
        await app.importTabs.nth(1).click();
        await expect(sheetTabs(app, "book.xlsx")).toHaveCount(2);
        await expect(holdLine(app)).toBeHidden();
        await expect(app.importSubmit).toBeEnabled();
    });
    test("a workbook that is being read, with its own tab on show, is not said to have no sheet ticked: Import is off and nothing is said beside it, before and after the sheets come", async ({ app, page }) => {
        const held = await holdVendor(page, LIBRARY);
        await openSample(app);
        await app.chooseFiles(made("book.xlsx", [{ name: "alpha", rows: table(2) }, { name: "beta", rows: table(2) }]));
        await expect(app.importDialog.locator(".import-reading")).toHaveCount(1);
        await expect(app.importSubmit).toBeDisabled();
        await expect(holdLine(app)).toBeHidden();
        // (choosing the destination again makes the line be worked out again, with the workbook still being read)
        await app.importDialog.locator(IN_OPEN).check();
        await app.importDialog.locator(IN_NEW).check();
        await expect(app.importDialog.locator(".import-reading")).toHaveCount(1);
        await expect(holdLine(app)).toBeHidden();
        await expect(holdLine(app)).not.toHaveText(words.IMPORT_HOLD_NO_SHEET_MESSAGE);
        await expect(app.importSubmit).toBeDisabled();
        held.open();
        await dialogReady(app);
        await expect(app.importSubmit).toBeEnabled();
        await expect(holdLine(app)).toBeHidden();
    });
});

test.describe("when no tab can give a table", () => {
    const blank = () => made("blank.xlsx", [{ name: "first", rows: [] }, { name: "second", rows: [] }]);
    const noTable = async (app) => {
        await expect(app.importSubmit).toBeHidden();
        await expect(app.importCancel).toHaveText(words.IMPORT_CLOSE_TEXT);
        await expect(app.importDialog.locator(".import-destination")).toBeHidden();
        await expect(holdLine(app)).toBeHidden();
    };

    test("a workbook none of whose sheets can be ticked has no Import, Cancel reads Close and there is no destination", async ({ app }) => {
        await app.open(OPEN);
        await app.chooseFiles(blank());
        await dialogReady(app);
        await noTable(app);
        await app.importCancel.click();
        await expect(app.importDialog).toBeHidden();
    });

    test("so has one beside a file that is refused, and so has a workbook of one sheet that holds nothing", async ({ app }) => {
        await app.open(OPEN);
        await app.chooseFiles([blank(), { name: "empty.csv", mimeType: "text/csv", buffer: Buffer.alloc(0) }]);
        await dialogReady(app);
        await noTable(app);
        await app.importCancel.click();
        await app.chooseFiles(made("blank.xlsx", [{ name: "only", rows: [] }]));
        await dialogReady(app);
        await noTable(app);
    });

    test("beside a text file that can give a table the workbook that cannot is left out of the job, and the file is imported", async ({ app }) => {
        await app.open(OPEN);
        await app.chooseFiles([blank(), csvFile("people.csv")]);
        await dialogReady(app);
        await expect(app.importSubmit).toBeVisible();
        await expect(app.importSubmit).toBeEnabled();
        await expect(app.importCancel).toHaveText(words.IMPORT_CANCEL_TEXT);
        await expect(app.importDialog.locator(".import-destination")).toBeVisible();
        await app.importSubmit.click();
        await expect(app.importDialog).toBeHidden();
        expect(await tablesNow(app)).toEqual(["people"]);
    });
});

// ---- the name of the new database ----------------------------------------------------------------------------------

test.describe("the name of the new database", () => {
    const databaseName = (app) => app.importDialog.locator("#import-database-name");

    test("is the first file's name without its extension, for a workbook too, and the first file that is not refused when the first is", async ({ app }) => {
        await app.open(OPEN);
        await app.chooseFiles(owned("shopping_db.xlsx"));
        await dialogReady(app);
        await expect(databaseName(app)).toHaveValue("shopping_db");
        await app.importCancel.click();
        await app.chooseFiles([csvFile("first.csv"), made("book.xlsx", [{ name: "a", rows: table(1) }])]);
        await dialogReady(app);
        await expect(databaseName(app)).toHaveValue("first");
        await app.importCancel.click();
        await app.chooseFiles([{ name: "empty.csv", mimeType: "text/csv", buffer: Buffer.alloc(0) }, made("second.xlsx", [{ name: "a", rows: table(1) }])]);
        await dialogReady(app);
        await expect(databaseName(app)).toHaveValue("second");
    });

    test("is the name the student typed when the sheets of the workbook arrive: they change nothing in it", async ({ app, page }) => {
        const held = await holdVendor(page, LIBRARY);
        await app.open(OPEN);
        await app.chooseFiles(made("book.xlsx", [{ name: "a", rows: table(1) }, { name: "b", rows: table(1) }]));
        await expect(app.importDialog.locator(".import-reading")).toHaveCount(1);
        await expect(databaseName(app)).toHaveValue("book");
        await databaseName(app).fill("my_database");
        held.open();
        await dialogReady(app);
        await expect(sheetTabs(app, "book.xlsx")).toHaveCount(2);
        await expect(databaseName(app)).toHaveValue("my_database");
        await app.importSubmit.click();
        await expect(app.importDialog).toBeHidden();
        await expect(app.page.locator("body")).toContainText("my_database");
    });

    // A workbook none of whose sheets can be ticked is not refused, though its tab says it cannot be
    // imported: it gives the database nothing, so the name is not taken from it.
    const blank = () => made("blank.xlsx", [{ name: "first", rows: [] }, { name: "second", rows: [] }]);

    test("is the name of the first file that can give a table: a workbook with no sheet to tick, first, is passed over for the text file after it", async ({ app }) => {
        await app.open(OPEN);
        await app.chooseFiles([blank(), csvFile("people.csv")]);
        await dialogReady(app);
        await expect(databaseName(app)).toHaveValue("people");
        await app.importCancel.click();
        await app.chooseFiles([made("onlyempty.xlsx", [{ name: "only", rows: [] }]), csvFile("orders.csv")]);
        await dialogReady(app);
        await expect(databaseName(app)).toHaveValue("orders");
    });

    test("is the name of the first file when none can give a table", async ({ app }) => {
        await app.open(OPEN);
        await app.chooseFiles([blank(), { name: "empty.csv", mimeType: "text/csv", buffer: Buffer.alloc(0) }]);
        await dialogReady(app);
        await expect(databaseName(app)).toHaveValue("blank");
    });

    test("is given again when the sheets of a workbook arrive, so the workbook read first is not named once it is known to give nothing", async ({ app, page }) => {
        const held = await holdVendor(page, LIBRARY);
        await app.open(OPEN);
        await app.chooseFiles([blank(), csvFile("people.csv")]);
        // both tabs are waiting to be read: the workbook is not yet known to be empty
        await expect(app.importDialog.locator(".import-reading")).toHaveCount(2);
        await expect(databaseName(app)).toHaveValue("blank");
        held.open();
        await dialogReady(app);
        await expect(databaseName(app)).toHaveValue("people");
    });

    test("is the name the student typed, whatever the sheets are", async ({ app, page }) => {
        const held = await holdVendor(page, LIBRARY);
        await app.open(OPEN);
        await app.chooseFiles([blank(), csvFile("people.csv")]);
        await expect(app.importDialog.locator(".import-reading")).toHaveCount(2);
        await expect(databaseName(app)).toHaveValue("blank");
        await databaseName(app).fill("my_database");
        held.open();
        await dialogReady(app);
        await expect(databaseName(app)).toHaveValue("my_database");
    });

    test("a name typed in one dialog is not kept for the next: the next dialog's new database is named after its own first file", async ({ app }) => {
        await app.open(OPEN);
        await app.chooseFiles(made("first_book.xlsx", [{ name: "alpha", rows: table(2) }, { name: "beta", rows: table(2) }]));
        await dialogReady(app);
        await databaseName(app).fill("my_database");
        await app.importCancel.click();
        await expect(app.importDialog).toBeHidden();
        await app.chooseFiles(made("second_book.xlsx", [{ name: "alpha", rows: table(2) }, { name: "beta", rows: table(2) }]));
        await dialogReady(app);
        await expect(databaseName(app)).toHaveValue("second_book");
    });

    test("is not taken from a file that is refused, nor from a workbook with no sheet to tick before it", async ({ app }) => {
        await app.open(OPEN);
        await app.chooseFiles([{ name: "empty.csv", mimeType: "text/csv", buffer: Buffer.alloc(0) }, blank(), csvFile("people.csv")]);
        await dialogReady(app);
        await expect(databaseName(app)).toHaveValue("people");
    });
});

// ---- keys and the focus --------------------------------------------------------------------------------------------

test.describe("keys and the focus in a dialog with a workbook", () => {
    test("the focus is on the first file's tab when the dialog opens, and is not moved when the sheets arrive, wherever it was", async ({ app, page }) => {
        const held = await holdVendor(page, LIBRARY);
        await app.open(OPEN);
        await app.chooseFiles(made("book.xlsx", [{ name: "a", rows: table(1) }, { name: "b", rows: table(1) }]));
        await expect(app.importDialog.locator(".import-reading")).toHaveCount(1);
        await expect(app.importTabs.first()).toBeFocused();
        // (focus kept to the tab through the arrival: the tab is the one thing that is there)
        held.open();
        await dialogReady(app);
        await expect(sheetTabs(app, "book.xlsx")).toHaveCount(2);
        await expect(app.importTabs.first()).toBeFocused();
    });

    for (const [place, selector, say] of [
        ["the database's name", "#import-database-name", "text field"],
        ["Cancel", ".app-dialog-actions button[type=button]", "button"],
        ["the choice of the destination", "#import-into-new", "radio button"],
    ]) {
        test(`when the sheets arrive the focus stays where the student had put it: on ${place}`, async ({ app, page }) => {
            const held = await holdVendor(page, LIBRARY);
            await app.open(OPEN);
            await app.chooseFiles([made("book.xlsx", [{ name: "a", rows: table(1) }, { name: "b", rows: table(1) }])]);
            await expect(app.importDialog.locator(".import-reading")).toHaveCount(1);
            await app.importDialog.locator(selector).focus();
            held.open();
            await dialogReady(app);
            await expect(sheetTabs(app, "book.xlsx")).toHaveCount(2);
            await expect(app.importDialog.locator(selector), say).toBeFocused();
        });
    }

    test("Enter in a sheet's table name presses Import: the sheets that are ticked are imported, with the name that was typed", async ({ app, page }) => {
        await app.open(OPEN);
        await app.chooseFiles(made("book.xlsx", [{ name: "alpha", rows: table(2) }, { name: "beta", rows: table(2) }]));
        await dialogReady(app);
        await sheetName(app).fill("mine");
        await page.keyboard.press("Enter");
        await expect(app.importDialog).toBeHidden();
        expect(await tablesNow(app)).toEqual(["beta", "mine"]);
    });

    test("Enter in the tick box of a sheet that can be ticked presses Import too, as it does in any field of the dialog", async ({ app, page }) => {
        await app.open(OPEN);
        await app.chooseFiles(made("book.xlsx", [{ name: "alpha", rows: table(2) }, { name: "beta", rows: table(2) }]));
        await dialogReady(app);
        await tickBox(app).focus();
        await page.keyboard.press("Enter");
        await expect(app.importDialog).toBeHidden();
        expect(await tablesNow(app)).toEqual(["alpha", "beta"]);
    });

    test("Enter that is held down presses nothing in a sheet's table name: the key's repeat is taken away, and the first Enter is not", async ({ app, page }) => {
        await app.open(OPEN);
        await app.chooseFiles(made("book.xlsx", [{ name: "alpha", rows: table(2) }, { name: "beta", rows: table(2) }]));
        await dialogReady(app);
        const prevented = await sheetName(app).evaluate((field) => {
            const answer = {};
            for (const repeat of [true, false]) {
                const event = new KeyboardEvent("keydown", { key: "Enter", repeat, bubbles: true, cancelable: true });
                field.dispatchEvent(event);
                answer[repeat ? "repeat" : "first"] = event.defaultPrevented;
            }
            return answer;
        });
        expect(prevented).toEqual({ repeat: true, first: false });
        await expect(app.importDialog).toBeVisible();
    });

    for (const [how, close] of [
        ["Escape", (app, page) => page.keyboard.press("Escape")],
        ["Cancel", (app) => app.importCancel.click()],
    ]) {
        test(`${how} closes the dialog and leaves nothing: another choice of files shows nothing of the workbook that was there`, async ({ app, page }) => {
            await app.open(OPEN);
            const before = await tablesNow(app);
            await app.chooseFiles(made("first.xlsx", [{ name: "alpha", rows: table(2) }, { name: "beta", rows: table(2) }]));
            await dialogReady(app);
            await sheetTabs(app, "first.xlsx").nth(1).click();
            await sheetName(app).fill("typed_name");
            await close(app, page);
            await expect(app.importDialog).toBeHidden();
            expect(await tablesNow(app)).toEqual(before);
            expect(await page.locator("#import-dialog .import-sheet-panel").count(), "no sheet is left in the dialog").toBe(0);
            // another opening, with a text file: no sheet, no second strip, no id of the first workbook's
            await app.chooseFiles(csvFile("plain.csv"));
            await dialogReady(app);
            await expect(app.importTabs).toHaveCount(1);
            await expect(app.importDialog.locator('[class*="import-sheet"]')).toHaveCount(0);
            await expect(app.importDialog.getByRole("tablist")).toHaveCount(1);
            await expect(app.importDialog.locator('[id^="import-file-1-"]')).toHaveCount(0);
            expect(await app.importDialog.evaluate((node) => node.innerHTML.includes("first.xlsx") || node.innerHTML.includes("alpha") || node.innerHTML.includes("typed_name"))).toBe(false);
            await app.importCancel.click();
            // and with another workbook: only its own sheets
            await app.chooseFiles(made("second.xlsx", [{ name: "gamma", rows: table(2) }, { name: "delta", rows: table(2) }]));
            await dialogReady(app);
            await expect(sheetTabs(app, "second.xlsx")).toHaveCount(2);
            await expect(app.importDialog.locator('[id^="import-file-1-"], [id^="import-file-2-"]')).toHaveCount(0);
            expect(await tableNamesOf(app, "second.xlsx")).toEqual(["gamma", "delta"]);
            expect(await app.importDialog.evaluate((node) => node.innerHTML.includes("first.xlsx") || node.innerHTML.includes("alpha") || node.innerHTML.includes("typed_name"))).toBe(false);
        });
    }

    test("Escape while a workbook is still being read leaves nothing of it: the sheets that arrive afterwards are not shown in the next opening", async ({ app, page }) => {
        const held = await holdVendor(page, LIBRARY);
        await app.open(OPEN);
        await app.chooseFiles(made("slow.xlsx", [{ name: "alpha", rows: table(2) }, { name: "beta", rows: table(2) }]));
        await expect(app.importDialog.locator(".import-reading")).toHaveCount(1);
        // (the reading has asked for the library, which is held: Escape then comes while the workbook is read, and not before it began)
        await expect.poll(() => held.requests()).toBeGreaterThan(0);
        await page.keyboard.press("Escape");
        await expect(app.importDialog).toBeHidden();
        await app.chooseFiles(csvFile("plain.csv"));
        await dialogReady(app);
        // the library comes now: what it read belongs to a dialog that has been closed
        held.open();
        await expect.poll(() => held.requests()).toBeGreaterThan(0);
        await expect(app.importTabs).toHaveText(["plain.csv"]);
        await expect(app.importDialog.locator('[class*="import-sheet"]')).toHaveCount(0);
        await expect(app.importTabs.first()).toBeVisible();
    });
});


// ---- what a screen reader is told ----------------------------------------------------------------------------------

// What a screen reader would be told: every live region of the dialog (a status, an alert, anything with aria-live) that
// is written, once for each batch of changes that the browser hands over (the changes of one task are one announcement),
// with whether it is in view (a region inside a hidden panel is not read out). The changes are taken from the observer
// with takeRecords, so that the list is whole when it is read.
const listen = (page) =>
    page.evaluate(() => {
        const LIVE = '[role="status"], [role="alert"], [aria-live]';
        const note = (records) => {
            const touched = new Set();
            for (const record of records) {
                const target = record.target.nodeType === 1 ? record.target : record.target.parentElement;
                const region = target?.closest(LIVE);
                if (region) {
                    touched.add(region);
                }
                for (const node of record.addedNodes) {
                    if (node.nodeType === 1 && node.matches(LIVE)) {
                        touched.add(node);
                    }
                }
            }
            for (const region of touched) {
                const text = region.textContent.trim();
                if (text) {
                    window.__heard.push({ text, audible: !region.closest("[hidden]") });
                }
            }
        };
        window.__heard = [];
        window.__note = note;
        window.__listener = new MutationObserver(note);
        window.__listener.observe(document.querySelector("#import-dialog"), { subtree: true, childList: true, characterData: true, attributes: true, attributeFilter: ["hidden"] });
    });
const heard = (page) =>
    page.evaluate(() => {
        window.__note(window.__listener.takeRecords());
        return window.__heard.splice(0);
    });

test.describe("what a screen reader is told by a dialog with a workbook", () => {
    test("Reading the file is a status, written once for each tab, and the count line once when the sheets of each workbook arrive; the one in a tab that is not shown is not read out", async ({ app, page }) => {
        const held = await holdVendor(page, LIBRARY);
        await app.open(OPEN);
        await listen(page);
        await app.chooseFiles([made("a.xlsx", [{ name: "one", rows: table(1) }, { name: "two", rows: table(1) }]), made("b.xlsx", [{ name: "three", rows: table(1) }, { name: "four", rows: table(1) }])]);
        await expect(app.importDialog.locator(".import-reading")).toHaveCount(2);
        await expect(app.importDialog.locator(".import-reading").first()).toHaveAttribute("role", "status");
        await expect(app.importDialog.locator(".import-reading").nth(1)).toHaveAttribute("role", "status");
        expect(await heard(page)).toEqual([
            { text: words.IMPORT_READING_TEXT, audible: true },
            { text: words.IMPORT_READING_TEXT, audible: false },
        ]);
        held.open();
        await dialogReady(app);
        await expect(sheetTabs(app, "a.xlsx")).toHaveCount(2);
        await app.importTabs.nth(1).click();
        await expect(sheetTabs(app, "b.xlsx")).toHaveCount(2);
        // each workbook's count line, once (the second was written while its panel was not shown)
        expect(await heard(page)).toEqual([
            { text: words.importSheetsCountText({ ticked: 2, tickable: 2 }), audible: true },
            { text: words.importSheetsCountText({ ticked: 2, tickable: 2 }), audible: false },
        ]);
    });

    test("one tick is one announcement, the count line's; ticking every sheet when every sheet is ticked is none", async ({ app, page }) => {
        await app.open(OPEN);
        await app.chooseFiles(owned("shopping_db.xlsx"));
        await dialogReady(app);
        await listen(page);
        await tickBox(app).uncheck();
        await expect(countLine(app)).toHaveText(words.importSheetsCountText({ ticked: 3, tickable: 4 }));
        expect(await heard(page)).toEqual([{ text: words.importSheetsCountText({ ticked: 3, tickable: 4 }), audible: true }]);
        await tickEvery(app).click();
        await expect(countLine(app)).toHaveText(words.importSheetsCountText({ ticked: 4, tickable: 4 }));
        expect(await heard(page)).toEqual([{ text: words.importSheetsCountText({ ticked: 4, tickable: 4 }), audible: true }]);
        await tickEvery(app).click();
        expect(await heard(page)).toEqual([]);
        // (showing another sheet, and typing, are not announced)
        await sheetTabs(app, "shopping_db.xlsx").nth(1).click();
        await sheetName(app).fill("typed");
        expect(await heard(page)).toEqual([]);
    });

    test("Import pressed with a name that cannot be used is announced once, by the alert under that name, and not again as the student types a better one", async ({ app, page }) => {
        await app.open(OPEN);
        await app.chooseFiles(made("book.xlsx", [{ name: "alpha", rows: table(2) }, { name: "beta", rows: table(2) }]));
        await dialogReady(app);
        // (no alert says anything before)
        await expect(app.importSheetPanel.getByRole("alert").filter({ hasText: /\S/ })).toHaveCount(0);
        await sheetTabs(app, "book.xlsx").nth(1).click();
        await sheetName(app).fill("");
        await tickBox(app).focus();
        await listen(page);
        await app.importSubmit.click();
        await expect(alertIn(app.importSheetPanel, words.IMPORT_NAME_EMPTY_MESSAGE)).toBeVisible();
        expect(await heard(page)).toEqual([{ text: words.IMPORT_NAME_EMPTY_MESSAGE, audible: true }]);
        // the field is said to be wrong, and described by the alert that says why
        await expect(sheetName(app)).toHaveAttribute("aria-invalid", "true");
        const describedBy = await sheetName(app).getAttribute("aria-describedby");
        expect(describedBy.split(" ")).toContain(await alertIn(app.importSheetPanel, words.IMPORT_NAME_EMPTY_MESSAGE).getAttribute("id"));
        await sheetName(app).fill("better");
        await expect(alertIn(app.importSheetPanel, words.IMPORT_NAME_EMPTY_MESSAGE)).toHaveCount(0);
        expect(await heard(page)).toEqual([]);
    });

    test("a name that a row of names makes impossible is announced once as well, and the line beside Import is not a live region, only what describes the button", async ({ app, page }) => {
        await app.open(OPEN);
        await app.chooseFiles(made("book.xlsx", [{ name: "alpha", rows: table(2) }, { name: "beta", rows: table(2) }]));
        await dialogReady(app);
        await sheetTabs(app, "book.xlsx").nth(1).click();
        await listen(page);
        await sheetNamesRow(app).fill("99");
        await expect(alertIn(app.importSheetPanel, words.importNamesRowSheetMessage(3))).toBeVisible();
        expect(await heard(page)).toEqual([{ text: words.importNamesRowSheetMessage(3), audible: true }]);
        await sheetTabs(app, "book.xlsx").nth(0).click();
        await expect(holdLine(app)).toHaveText(words.importHoldSheetProblemMessage("beta", "book.xlsx"));
        // (the line names the sheet in words: nothing says it aloud by itself)
        expect(await heard(page)).toEqual([]);
        expect(await holdLine(app).evaluate((node) => [node.getAttribute("role"), node.getAttribute("aria-live")])).toEqual([null, null]);
        await expect(app.importSubmit).toHaveAttribute("aria-describedby", "import-hold");
    });
});

// ---- text that is not to be trusted --------------------------------------------------------------------------------

test.describe("names and cells that hold markup, or names that differ in a letter's case", () => {
    const EVIL = "<img src=x onerror=alert(1)>";
    const NAMES = [EVIL, "constructor", "__proto__", "ORDERS", "orders", "Orders", "שלום עולם", "😀 data", "a_very_long_sheet_name_31_chars"];

    test("a file, a sheet and a cell named as an image that runs a script are text: no element is made, no dialog is raised, no error; the tables' names are made unique", async ({ app, page }) => {
        const dialogs = [];
        const errors = [];
        page.on("dialog", (dialog) => {
            dialogs.push(dialog.message());
            dialog.dismiss();
        });
        page.on("pageerror", (error) => errors.push(error.message));
        await app.open(OPEN);
        const sheets = NAMES.map((name, i) => ({ name, rows: i === 0 ? [["id", EVIL], [1, EVIL]] : table(1) }));
        await app.chooseFiles(made(`${EVIL}.xlsx`, sheets));
        await dialogReady(app);
        const tabs = sheetTabs(app, `${EVIL}.xlsx`);
        await expect(tabs).toHaveCount(NAMES.length);
        // the file's tab says its name as text, in full
        await expect(app.importTabs.first().locator(".import-tab-name")).toHaveText(`${EVIL}.xlsx`);
        await expect(app.importTabs.first().locator(".import-tab-name")).toHaveAttribute("title", `${EVIL}.xlsx`);
        const names = await tableNamesOf(app, `${EVIL}.xlsx`);
        // every sheet is shown, so that every panel has been built: its line says its name as text
        for (let i = 0; i < NAMES.length; i++) {
            await tabs.nth(i).click();
            await expect(app.importSheetPanel.locator(".import-sheet-title")).toHaveText(words.importSheetLineText(NAMES[i]));
        }
        // the tab of each says its whole name, in its text and in its title
        expect(await tabs.evaluateAll((all) => all.map((tab) => [tab.querySelector(".import-tab-name").textContent, tab.querySelector(".import-tab-name").title]))).toEqual(NAMES.map((name) => [name, name]));
        // the preview of the sheet with the markup in its cells
        await tabs.nth(0).click();
        const [header, row] = await sheetPreview(app);
        expect(header.cells).toEqual(["id", EVIL]);
        expect(row.cells).toEqual(["1", EVIL]);
        // no element came of any of it
        expect(await page.locator("#import-dialog img, #import-dialog script, #import-dialog [onerror]").count()).toBe(0);
        // the names are names, and are all different to the engine (which does not tell A from a)
        expect(names.every((name) => /^[A-Za-z_][A-Za-z0-9_]*$/.test(name))).toBe(true);
        expect(new Set(names.map((name) => name.toLowerCase())).size).toBe(names.length);
        expect(names).toEqual(["_img_src_x_onerror_alert_1_", "constructor", "__proto__", "ORDERS", "orders_2", "Orders_3", "_", "_data", "a_very_long_sheet_name_31_chars"]);
        // all of them are imported, and the report holds the same text
        await app.importSubmit.click();
        await expect(app.importDialog).toBeHidden();
        await expect(app.pane).toHaveAttribute("data-state", "report");
        expect(await tablesNow(app)).toEqual([...names].sort());
        expect(await app.pane.locator("img, script").count()).toBe(0);
        await expect(app.pane).toContainText(EVIL);
        expect(dialogs, "no dialog was raised").toEqual([]);
        expect(errors, "no error on the page").toEqual([]);
    });

    test("a sheet called constructor and one called __proto__ are listed, shown and imported as sheets like any other", async ({ app }) => {
        await app.open(OPEN);
        await app.chooseFiles(made("odd.xlsx", [{ name: "constructor", rows: [["a"], [1]] }, { name: "__proto__", rows: [["b"], [2]] }, { name: "toString", rows: [["c"], [3]] }]));
        await dialogReady(app);
        await expect(sheetTabs(app, "odd.xlsx")).toHaveCount(3);
        expect(await sheetTabs(app, "odd.xlsx").evaluateAll((all) => all.map((tab) => tab.querySelector(".import-tab-name").textContent))).toEqual(["constructor", "__proto__", "toString"]);
        await expect(sheetTabs(app, "odd.xlsx").nth(0)).toHaveAccessibleName(`constructor (${words.IMPORT_SHEET_TICKED_TEXT})`);
        await expect(sheetTabs(app, "odd.xlsx").nth(1)).toHaveAccessibleName(`__proto__ (${words.IMPORT_SHEET_TICKED_TEXT})`);
        await app.importSubmit.click();
        await expect(app.importDialog).toBeHidden();
        expect(await app.rows("SELECT a FROM constructor")).toEqual([[1]]);
        expect(await app.rows('SELECT b FROM "__proto__"')).toEqual([[2]]);
        expect(await app.rows("SELECT c FROM toString")).toEqual([[3]]);
    });

    test("names that differ only in the case of a letter are different sheets in the strip and one name to the engine, given _2: the owner's sheets and a workbook of three", async ({ app }) => {
        await app.open(OPEN);
        await app.chooseFiles(made("case.xlsx", [{ name: "Orders", rows: table(1) }, { name: "ORDERS", rows: table(2) }, { name: "oRDERS", rows: table(3) }]));
        await dialogReady(app);
        expect(await sheetTabs(app, "case.xlsx").evaluateAll((all) => all.map((tab) => tab.querySelector(".import-tab-name").textContent))).toEqual(["Orders", "ORDERS", "oRDERS"]);
        expect(await tableNamesOf(app, "case.xlsx")).toEqual(["Orders", "ORDERS_2", "oRDERS_3"]);
    });

    test("a name that reads right to left, one of emoji, and one of 31 characters are shown whole in the tab's title and above the panel", async ({ app }) => {
        await app.open(OPEN);
        const names = ["שלום עולם שלום עולם", "👩‍👩‍👧‍👦 family 😀", "z".repeat(31)];
        await app.chooseFiles(made("names.xlsx", names.map((name) => ({ name, rows: table(1) }))));
        await dialogReady(app);
        const tabs = sheetTabs(app, "names.xlsx");
        for (const [i, name] of names.entries()) {
            await tabs.nth(i).click();
            await expect(tabs.nth(i).locator(".import-tab-name")).toHaveAttribute("title", name);
            await expect(app.importSheetPanel.locator(".import-sheet-title")).toHaveText(words.importSheetLineText(name));
        }
    });
});

// ---- axe -----------------------------------------------------------------------------------------------------------

async function expectNoSeriousViolations(page, where) {
    await page.evaluate(() => document.fonts.ready);
    const results = await new AxeBuilder({ page }).include("#import-dialog").analyze();
    const serious = results.violations
        .filter((violation) => violation.impact === "serious" || violation.impact === "critical")
        .map((violation) => `${violation.id} (${violation.impact}): ${violation.help} at ${violation.nodes.slice(0, 4).map((node) => node.target.join(" ")).join(" | ")}`);
    // (the dialog was looked at: some rules ran and passed)
    expect(results.passes.length, where).toBeGreaterThan(5);
    expect(serious, where).toEqual([]);
}

test.describe("accessibility of the sheets", () => {
    const states = [
        [
            "a workbook of several sheets beside a text file on show",
            async (app, page) => {
                await app.chooseFiles([owned("excel/messy_course_workbook.xlsx"), owned("messy_sales.csv")]);
                await dialogReady(app);
                await expectNoSeriousViolations(page, "the sheet that is on show");
                // a hidden sheet, with its note, and the other file's tab
                await sheetTabs(app, "messy_course_workbook.xlsx").nth(4).click();
                await expectNoSeriousViolations(page, "a hidden sheet");
                await app.importTabs.nth(1).click();
                await expectNoSeriousViolations(page, "the text file");
            },
        ],
        [
            "a sheet that cannot be ticked on show",
            async (app, page) => {
                await app.chooseFiles(owned("excel/empty_sheets.xlsx"));
                await dialogReady(app);
                await sheetTabs(app, "empty_sheets.xlsx").nth(1).click();
                await expect(tickBox(app)).toHaveAttribute("aria-disabled", "true");
                await expectNoSeriousViolations(page, "a sheet with no values");
            },
        ],
        [
            "a hidden sheet on show with a problem under its name",
            async (app, page) => {
                await app.chooseFiles(made("book.xlsx", [{ name: "Shown", rows: table(2) }, { name: "Hidden one", rows: table(2), hidden: 1 }]));
                await dialogReady(app);
                await sheetTabs(app, "book.xlsx").nth(1).click();
                await tickBox(app).check();
                await sheetName(app).fill("sqlite_mine");
                await app.importSubmit.click();
                await expect(alertIn(app.importSheetPanel, words.IMPORT_NAME_RESERVED_MESSAGE)).toBeVisible();
                await expectNoSeriousViolations(page, "a hidden sheet with a name that is refused");
            },
        ],
        [
            "a workbook of one sheet on show",
            async (app, page) => {
                await app.chooseFiles(made("one.xlsx", [{ name: "Only", rows: table(5) }]));
                await dialogReady(app);
                await expectNoSeriousViolations(page, "a workbook of one sheet");
            },
        ],
        [
            "a sheet with a row of names that is no row on show, and Import held by it",
            async (app, page) => {
                await app.chooseFiles(made("book.xlsx", [{ name: "Shown", rows: table(2) }, { name: "Other", rows: table(2) }]));
                await dialogReady(app);
                await sheetNamesRow(app).fill("99");
                await sheetTabs(app, "book.xlsx").nth(1).click();
                await expect(holdLine(app)).toBeVisible();
                await expectNoSeriousViolations(page, "the line beside Import");
            },
        ],
    ];
    for (const [title, run] of states) {
        for (const viewport of [
            { name: "desktop", width: 1366, height: 768 },
            { name: "phone", width: 390, height: 844 },
        ]) {
            for (const theme of ["light", "dark"]) {
                test(`axe finds no serious or critical violation with ${title}, ${theme}, ${viewport.name}`, async ({ app, page }) => {
                    await page.setViewportSize({ width: viewport.width, height: viewport.height });
                    await page.emulateMedia({ colorScheme: theme, reducedMotion: "reduce" });
                    await app.open(OPEN);
                    await run(app, page);
                });
            }
        }
    }
});

// ---- narrow windows ------------------------------------------------------------------------------------------------

// how far the page, the dialog and what scrolls in it can be moved sideways
const overflowOf = (page) =>
    page.evaluate(() => {
        const dialog = document.querySelector("#import-dialog");
        const body = dialog.querySelector(".import-body");
        const root = document.documentElement;
        dialog.scrollLeft = 300;
        body.scrollLeft = 300;
        const moved = { dialog: dialog.scrollLeft, body: body.scrollLeft };
        dialog.scrollLeft = 0;
        body.scrollLeft = 0;
        return { page: root.scrollWidth - root.clientWidth, dialog: dialog.scrollWidth - dialog.clientWidth, body: body.scrollWidth - body.clientWidth, moved };
    });

test.describe("a workbook's dialog in a narrow window", () => {
    for (const width of [390, 320]) {
        test(`at ${width} px nothing scrolls sideways but the strips and the preview: not the page, not the dialog, not what scrolls in it`, async ({ app, page }) => {
            await page.setViewportSize({ width, height: 700 });
            await app.open(OPEN);
            const long = `${"Quarterly figures ".repeat(6)}end`;
            await app.chooseFiles([
                made("a_workbook_with_a_name_that_is_long_enough_to_need_cutting.xlsx", [
                    { name: "Wide table", rows: [Array.from({ length: 30 }, (_, i) => `column ${i + 1}`), Array.from({ length: 30 }, (_, i) => i)] },
                    { name: "LONG", rows: table(2) },
                    { name: "Hidden sheet", rows: table(2), hidden: 1 },
                    { name: "Nothing at all", rows: [] },
                    { name: "Five", rows: table(2) },
                    { name: "Six", rows: table(2) },
                ], { edit: renameSheet("LONG", long) }),
                csvFile("people.csv"),
            ]);
            await dialogReady(app);
            const file = "a_workbook_with_a_name_that_is_long_enough_to_need_cutting.xlsx";
            const tabs = sheetTabs(app, file);
            const looked = async (where) => {
                const overflow = await overflowOf(page);
                expect(overflow.page, `${where}: the page`).toBeLessThanOrEqual(0);
                expect(overflow.dialog, `${where}: the dialog`).toBeLessThanOrEqual(0);
                expect(overflow.body, `${where}: what scrolls in the dialog`).toBeLessThanOrEqual(0);
                expect(overflow.moved, `${where}: nothing moved`).toEqual({ dialog: 0, body: 0 });
            };
            await looked("the wide table");
            // the strip and the preview scroll themselves
            expect(await app.importSheetStrip(words.importSheetsLabel(file)).evaluate((node) => node.scrollWidth > node.clientWidth)).toBe(true);
            expect(await app.importSheetPanel.locator(".import-preview").evaluate((node) => node.scrollWidth > node.clientWidth)).toBe(true);
            await tabs.nth(1).click();
            await looked("the long name");
            await tabs.nth(2).click();
            await looked("a hidden sheet");
            await tabs.nth(3).click();
            await looked("a sheet that cannot be ticked");
            await tabs.nth(0).click();
            await sheetNamesRow(app).fill("99");
            await tabs.nth(1).click();
            await looked("a hold line");
            await tabs.nth(0).click();
            await app.importTabs.nth(1).click();
            await looked("the other file");
        });

        test(`at ${width} px the two buttons wrap under the line that counts the sheets, and stay inside the dialog`, async ({ app, page }) => {
            await page.setViewportSize({ width, height: 700 });
            await app.open(OPEN);
            await app.chooseFiles(owned("shopping_db.xlsx"));
            await dialogReady(app);
            const box = (locator) => locator.evaluate((node) => {
                const at = node.getBoundingClientRect();
                return { top: at.top, bottom: at.bottom, left: at.left, right: at.right };
            });
            const count = await box(countLine(app));
            const dialog = await box(app.importDialog);
            for (const button of [tickEvery(app), untickEvery(app)]) {
                const at = await box(button);
                expect(at.top, "under the line").toBeGreaterThanOrEqual(count.bottom - 0.5);
                expect(at.left).toBeGreaterThanOrEqual(dialog.left);
                expect(at.right).toBeLessThanOrEqual(dialog.right);
            }
        });

        test(`at ${width} px the foot, with Import and Cancel, stays in view whatever the body is scrolled to`, async ({ app, page }) => {
            await page.setViewportSize({ width, height: 520 });
            await app.open(OPEN);
            await app.chooseFiles(made("book.xlsx", [{ name: "alpha", rows: table(30) }, { name: "beta", rows: table(30) }]));
            await dialogReady(app);
            const foot = () => page.evaluate(() => {
                const at = document.querySelector("#import-dialog .import-foot").getBoundingClientRect();
                return { top: Math.round(at.top), bottom: Math.round(at.bottom), height: window.innerHeight };
            });
            const before = await foot();
            expect(before.bottom).toBeLessThanOrEqual(before.height);
            expect(before.top).toBeGreaterThan(0);
            for (const place of ["end", "start"]) {
                await page.evaluate((to) => {
                    const body = document.querySelector("#import-dialog .import-body");
                    body.scrollTop = to === "end" ? body.scrollHeight : 0;
                }, place);
                expect(await foot(), `the body scrolled to its ${place}`).toEqual(before);
                for (const button of [app.importSubmit, app.importCancel]) {
                    const at = await button.boundingBox();
                    expect(at.y).toBeGreaterThanOrEqual(0);
                    expect(at.y + at.height).toBeLessThanOrEqual(before.height);
                }
            }
        });

        test(`at ${width} px a sheet name that has no place to break wraps above its panel, and is not cut`, async ({ app, page }) => {
            await page.setViewportSize({ width, height: 700 });
            await app.open(OPEN);
            const name = "W".repeat(31);
            await app.chooseFiles(made("book.xlsx", [{ name, rows: table(2) }, { name: "other", rows: table(2) }]));
            await dialogReady(app);
            const line = app.importSheetPanel.locator(".import-sheet-name");
            await expect(line.locator(".import-sheet-title")).toHaveText(words.importSheetLineText(name));
            const wrapped = await line.evaluate((node) => ({ over: node.scrollWidth - node.clientWidth, lines: node.getBoundingClientRect().height / parseFloat(getComputedStyle(node).lineHeight) }));
            expect(wrapped.over).toBeLessThanOrEqual(0);
            expect(wrapped.lines, "it takes more than one line").toBeGreaterThan(1.5);
            expect((await overflowOf(page)).dialog).toBeLessThanOrEqual(0);
        });
    }
});

// ---- nothing of this exists until a workbook has been read -------------------------------------------------------

test.describe("nothing of the sheets exists until a workbook has been read", () => {
    test("with both flags on and only text files chosen the dialog has no sheet, no strip of sheets and no count line", async ({ app }) => {
        await app.open(OPEN);
        await app.chooseFiles([csvFile("one.csv"), csvFile("two.csv")]);
        await dialogReady(app);
        await expect(app.importDialog.locator('[class*="import-sheet"]')).toHaveCount(0);
        await expect(app.importDialog.locator(".import-sheets-head, .import-sheets-count, .import-sheets-actions")).toHaveCount(0);
        await expect(app.importDialog.getByRole("tablist")).toHaveCount(1);
        await expect(app.importDialog.getByRole("tab")).toHaveCount(2);
    });

    test("with the import alone a workbook is refused with its reason, and none of it exists either", async ({ app }) => {
        await app.open(`${NORTHLIGHT_URL}&preview=import`);
        await app.chooseFiles(made("book.xlsx", [{ name: "alpha", rows: table(2) }, { name: "beta", rows: table(2) }]));
        await dialogReady(app);
        await expect(app.importTabs.first()).toHaveAccessibleName(`book.xlsx (${words.IMPORT_REFUSED_TAB_TEXT})`);
        await expect(app.importPanel).toContainText(words.IMPORT_WORKBOOK_REASON);
        await expect(app.importDialog.locator('[class*="import-sheet"]')).toHaveCount(0);
        await expect(app.importDialog.getByRole("tablist")).toHaveCount(1);
        await expect(app.importDialog.getByRole("status")).toHaveCount(0);
        await expect(app.importSubmit).toBeHidden();
        await expect(app.importCancel).toHaveText(words.IMPORT_CLOSE_TEXT);
    });
});

// ---- the layout of a sheet's panel in a wide, short window -----------------------------------------------------------

// where the parts of the sheet that is showing lie, in the page's pixels (null for a part the sheet has not), with
// the top of the dialog's foot and how many rows of the preview's table end above it
const sheetLayout = (page) =>
    page.evaluate(() => {
        const dialog = document.querySelector("#import-dialog");
        const panel = dialog.querySelector(".import-panel:not([hidden]) .import-sheet-panel:not([hidden])");
        const box = (node) => {
            if (!node) {
                return null;
            }
            const at = node.getBoundingClientRect();
            return { left: at.left, right: at.right, top: at.top, bottom: at.bottom, width: at.width, height: at.height };
        };
        const part = (selector) => box(panel.querySelector(selector));
        const foot = dialog.querySelector(".import-foot").getBoundingClientRect().top;
        return {
            panel: box(panel),
            head: part(".import-sheet-head"),
            what: part(".import-sheet-what"),
            name: part(".import-sheet-name"),
            size: part(".import-sheet-size"),
            tick: part(".import-sheet-tick"),
            note: part(":scope > .import-sheet-note"),
            settings: part(".import-settings"),
            rows: part(".import-sheet-rows"),
            title: part(".import-preview-title"),
            preview: part(".import-preview"),
            namesRow: part('input[type="number"]'),
            foot,
            rowsAboveFoot: [...panel.querySelectorAll(".import-preview-table tbody tr")].filter((tr) => tr.getBoundingClientRect().bottom <= foot + 0.5).length,
            rowsStartedAboveFoot: [...panel.querySelectorAll(".import-preview-table tbody tr")].filter((tr) => tr.getBoundingClientRect().top < foot - 1).length,
            children: [...panel.children].map((node) => node.className),
        };
    });

// the preview is beside the settings, on one line with them, under a head that spans both
function expectBeside(at, where) {
    expect(at.rows.left, `${where}: the rows start at or right of the settings' right edge`).toBeGreaterThanOrEqual(at.settings.right - 0.5);
    expect(at.rows.left - at.settings.right, `${where}: there is a gap between the settings and the rows`).toBeGreaterThanOrEqual(12);
    expect(Math.abs(at.rows.top - at.settings.top), `${where}: the rows and the settings begin on one line`).toBeLessThanOrEqual(3);
    expect(Math.abs(at.title.top - at.settings.top), `${where}: the preview's heading begins on that line too`).toBeLessThanOrEqual(3);
    expect(at.settings.top, `${where}: the settings are under the head`).toBeGreaterThanOrEqual(at.head.bottom - 0.5);
    expect(at.rows.top, `${where}: the rows are under the head`).toBeGreaterThanOrEqual(at.head.bottom - 0.5);
    expect(at.head.left, `${where}: the head starts where the panel does`).toBeLessThanOrEqual(at.panel.left + 0.5);
    expect(at.head.right, `${where}: and ends where it ends`).toBeGreaterThanOrEqual(at.panel.right - 0.5);
    expect(at.settings.left, `${where}: the settings are the left column`).toBeLessThanOrEqual(at.panel.left + 0.5);
    expect(at.rows.right, `${where}: the rows end with the panel`).toBeGreaterThanOrEqual(at.panel.right - 0.5);
    // (the tick box is at the right end of the head, the sheet's line and its size on one line at the left)
    expect(at.tick.right, `${where}: the tick box is at the right end of the head`).toBeGreaterThanOrEqual(at.head.right - 0.5);
    expect(at.what.left, `${where}: the sheet's line is at the left end`).toBeLessThanOrEqual(at.head.left + 0.5);
    expect(at.size.left, `${where}: its size follows the line on the same row`).toBeGreaterThanOrEqual(at.name.right - 0.5);
    expect(at.size.top, `${where}: (one row)`).toBeLessThan(at.name.bottom);
    expect(at.tick.left, `${where}: the tick box is not under them`).toBeGreaterThanOrEqual(at.size.right - 0.5);
}

// every part is under the one before it, in one column
function expectStacked(at, where) {
    expect(at.size.top, `${where}: the size is under the sheet's line`).toBeGreaterThanOrEqual(at.name.bottom - 0.5);
    expect(at.tick.top, `${where}: the tick box is under the size`).toBeGreaterThanOrEqual(at.size.bottom - 0.5);
    expect(at.settings.top, `${where}: the settings are under the head`).toBeGreaterThanOrEqual(at.head.bottom - 0.5);
    expect(at.rows.top, `${where}: the preview is under the settings`).toBeGreaterThanOrEqual(at.settings.bottom - 0.5);
    expect(at.rows.left, `${where}: in the same column`).toBeLessThanOrEqual(at.settings.left + 0.5);
    expect(at.title.top, `${where}: the preview's heading is under the settings`).toBeGreaterThanOrEqual(at.settings.bottom - 0.5);
}

// two sheets that can be ticked, each with thirty rows, the second of them hidden in the workbook
const layoutBook = () => made("layout.xlsx", [{ name: "Alpha", rows: table(30) }, { name: "Beta", rows: table(30) }, { name: "Gamma", rows: table(30), hidden: 1 }]);

test.describe("a sheet's panel in a wide, short window", () => {
    for (const [width, height] of [[1366, 768], [1024, 768]]) {
        test(`at ${width}x${height} the preview is beside the settings, at least three of its rows are above the foot, and one head row holds the sheet's line, its size and its tick box`, async ({ app, page }) => {
            await page.setViewportSize({ width, height });
            await app.open(OPEN);
            await app.chooseFiles(layoutBook());
            await dialogReady(app);
            const at = await sheetLayout(page);
            expectBeside(at, `${width}x${height}`);
            expect(at.rowsAboveFoot, "rows of the preview above the foot").toBeGreaterThanOrEqual(3);
            expect(at.namesRow.bottom, "the field of the row of names is above the foot").toBeLessThanOrEqual(at.foot);
            // (and the same for a sheet shown later)
            await sheetTabs(app, "layout.xlsx").nth(1).click();
            expectBeside(await sheetLayout(page), `${width}x${height}, the second sheet`);
        });
    }

    test("at 1536x730 the preview is beside the settings, with at least two of its rows wholly above the foot and three of them begun above it, and at 1366x768 four are begun", async ({ app, page }) => {
        await page.setViewportSize({ width: 1536, height: 730 });
        await app.open(OPEN);
        await app.chooseFiles(layoutBook());
        await dialogReady(app);
        const at = await sheetLayout(page);
        expectBeside(at, "1536x730");
        expect(at.rowsAboveFoot, "rows of the preview wholly above the foot").toBeGreaterThanOrEqual(2);
        expect(at.rowsStartedAboveFoot, "rows of the preview begun above the foot").toBeGreaterThanOrEqual(3);
        await page.setViewportSize({ width: 1366, height: 768 });
        expect((await sheetLayout(page)).rowsStartedAboveFoot, "rows begun above the foot at 1366x768").toBeGreaterThanOrEqual(4);
    });

    test("at 1366x768 the field \"Column names are on row\" of the owner's workbook with title rows is wholly above the foot, with the preview beside it", async ({ app, page }) => {
        await page.setViewportSize({ width: 1366, height: 768 });
        await app.open(OPEN);
        await app.chooseFiles(owned("excel/title_rows_and_layouts.xlsx"));
        await dialogReady(app);
        const at = await sheetLayout(page);
        expect(at.namesRow.bottom).toBeLessThanOrEqual(at.foot);
        expect(at.rowsAboveFoot).toBeGreaterThanOrEqual(3);
        expect(at.rows.left).toBeGreaterThanOrEqual(at.settings.right - 0.5);
        await expect(sheetNamesRow(app)).toBeVisible();
    });

    for (const [width, height] of [[1920, 1080], [899, 768], [390, 844], [320, 800]]) {
        test(`at ${width}x${height} the preview is under the settings, and the head's three parts are stacked: the size under the sheet's line, the tick box under the size`, async ({ app, page }) => {
            await page.setViewportSize({ width, height });
            await app.open(OPEN);
            await app.chooseFiles(layoutBook());
            await dialogReady(app);
            const at = await sheetLayout(page);
            expectStacked(at, `${width}x${height}`);
            await sheetTabs(app, "layout.xlsx").nth(1).click();
            expectStacked(await sheetLayout(page), `${width}x${height}, the second sheet`);
        });
    }

    test("in a wide, short window the panels of the sheets that are not on show take no room, whichever sheets were shown before: one panel is in view, and the others are not displayed", async ({ app, page }) => {
        await page.setViewportSize({ width: 1366, height: 768 });
        await app.open(OPEN);
        await app.chooseFiles(layoutBook());
        await dialogReady(app);
        const tabs = sheetTabs(app, "layout.xlsx");
        // (each panel is built when it is shown, and kept: the ones left behind are built and hidden)
        await tabs.nth(1).click();
        await tabs.nth(2).click();
        await tabs.nth(0).click();
        const panels = await page.locator("#import-dialog .import-panel:not([hidden]) .import-sheet-panel").evaluateAll((nodes) =>
            nodes.map((node) => ({ hidden: node.hidden, display: getComputedStyle(node).display, height: node.getBoundingClientRect().height }))
        );
        expect(panels).toHaveLength(3);
        expect(panels.filter((panel) => !panel.hidden)).toHaveLength(1);
        for (const panel of panels.filter((one) => one.hidden)) {
            expect(panel.display, "a sheet that is not on show is not displayed").toBe("none");
            expect(panel.height).toBe(0);
        }
        await expect(app.importSheetPanel).toBeVisible();
        await expect(page.locator("#import-dialog .import-panel:not([hidden]) .import-sheet-panel:visible")).toHaveCount(1);
    });

    test("at 900 px wide and 1080 px tall the panel is stacked, at 900x1079 it has two columns, and at 899x1079 it is stacked again", async ({ app, page }) => {
        await page.setViewportSize({ width: 900, height: 1080 });
        await app.open(OPEN);
        await app.chooseFiles(layoutBook());
        await dialogReady(app);
        expectStacked(await sheetLayout(page), "900x1080");
        await page.setViewportSize({ width: 900, height: 1079 });
        expectBeside(await sheetLayout(page), "900x1079");
        await page.setViewportSize({ width: 899, height: 1079 });
        expectStacked(await sheetLayout(page), "899x1079");
    });

    test("at 900x900, which was once the bound and is not now, the panel has two columns", async ({ app, page }) => {
        await page.setViewportSize({ width: 900, height: 900 });
        await app.open(OPEN);
        await app.chooseFiles(layoutBook());
        await dialogReady(app);
        expectBeside(await sheetLayout(page), "900x900");
        await page.setViewportSize({ width: 900, height: 899 });
        expectBeside(await sheetLayout(page), "900x899");
    });

    test("at 1920x950, a browser's window on a 1080p screen, the preview is beside the settings with at least six rows of it above the foot, the field of the row is above the foot, and the dialog's body has nothing to scroll", async ({ app, page }) => {
        await page.setViewportSize({ width: 1920, height: 950 });
        await app.open(OPEN);
        await app.chooseFiles(made("long.xlsx", [{ name: "Alpha", rows: table(40) }, { name: "Beta", rows: table(30) }]));
        await dialogReady(app);
        const at = await sheetLayout(page);
        expectBeside(at, "1920x950");
        expect(at.rowsAboveFoot, "rows of the preview wholly above the foot").toBeGreaterThanOrEqual(6);
        expect(at.namesRow.bottom, "the field of the row of names is wholly above the foot").toBeLessThanOrEqual(at.foot);
        const body = await page.locator("#import-dialog .import-body").evaluate((node) => node.scrollHeight - node.clientHeight);
        expect(body, "nothing to scroll in the dialog's body").toBeLessThanOrEqual(1);
    });

    // This is the reason for the number 1080 in the stylesheet: stacked, six whole rows of the preview are above
    // the foot only from 1080 px of height, and side by side they are from about 920 px; so at the bound the two
    // layouts show the same rows, and a window one pixel lower does not lose half of them.
    test("the two sides of the bound, 1280x1079 beside and 1280x1080 stacked, show the same rows of the preview above the foot, give or take one, and each shows at least six", async ({ app, page }) => {
        await page.setViewportSize({ width: 1280, height: 1079 });
        await app.open(OPEN);
        await app.chooseFiles(made("long.xlsx", [{ name: "Alpha", rows: table(40) }, { name: "Beta", rows: table(30) }]));
        await dialogReady(app);
        const beside = await sheetLayout(page);
        expectBeside(beside, "1280x1079");
        await page.setViewportSize({ width: 1280, height: 1080 });
        const stacked = await sheetLayout(page);
        expectStacked(stacked, "1280x1080");
        expect(beside.rowsAboveFoot, "rows above the foot, beside").toBeGreaterThanOrEqual(6);
        expect(stacked.rowsAboveFoot, "rows above the foot, stacked").toBeGreaterThanOrEqual(6);
        expect(Math.abs(beside.rowsAboveFoot - stacked.rowsAboveFoot), "the two sides show the same rows, give or take one").toBeLessThanOrEqual(1);
    });

    for (const [width, height] of [[1536, 1080], [2560, 1300]]) {
        test(`at ${width}x${height} the preview is under the settings`, async ({ app, page }) => {
            await page.setViewportSize({ width, height });
            await app.open(OPEN);
            await app.chooseFiles(layoutBook());
            await dialogReady(app);
            expectStacked(await sheetLayout(page), `${width}x${height}`);
        });
    }

    test("the Tab key walks the same order in a wide, short window as in a tall one, element for element", async ({ app, page }) => {
        await page.setViewportSize({ width: 1920, height: 1080 });
        await app.open(OPEN);
        await app.chooseFiles(owned("shopping_db.xlsx"));
        await dialogReady(app);
        const walk = async () => {
            await app.importTabs.first().focus();
            const walked = [await focusAt(page)];
            for (let i = 0; i < 10; i++) {
                await page.keyboard.press("Tab");
                walked.push(await focusAt(page));
            }
            return walked;
        };
        const tall = await walk();
        expect(tall).toContain(`checkbox: ${words.IMPORT_SHEET_TICK_LABEL}`);
        await page.setViewportSize({ width: 1366, height: 768 });
        expectBeside(await sheetLayout(page), "1366x768");
        const short = await walk();
        expect(short).toEqual(tall);
        // and with the keys' order read from the document: the tick box comes before the settings, which come before the preview
        const order = await page.evaluate(() => {
            const panel = document.querySelector("#import-dialog .import-panel:not([hidden]) .import-sheet-panel:not([hidden])");
            const at = (selector) => [...panel.querySelectorAll("*")].indexOf(panel.querySelector(selector));
            return [".import-sheet-name", ".import-sheet-size", ".import-sheet-tick", ".import-settings", ".import-sheet-rows", ".import-preview"].map(at);
        });
        expect(order).toEqual([...order].sort((a, b) => a - b));
        expect(order.every((index) => index >= 0)).toBe(true);
    });

    test("what was typed in a sheet's name and the focus stay when the window changes from tall to short and back, and no element is made again", async ({ app, page }) => {
        await page.setViewportSize({ width: 1920, height: 1080 });
        await app.open(OPEN);
        await app.chooseFiles(layoutBook());
        await dialogReady(app);
        const name = sheetName(app);
        await name.fill("typed_by_the_student");
        await expect(name).toBeFocused();
        // every part of the panel is marked, and is found marked again after the window has changed
        const PARTS = ".import-sheet-head, .import-sheet-what, .import-sheet-name, .import-sheet-size, .import-sheet-tick, .import-settings, .import-sheet-rows, .import-preview, input";
        const marks = (mark) =>
            page.evaluate(
                ([selector, set]) => {
                    const panel = document.querySelector("#import-dialog .import-panel:not([hidden]) .import-sheet-panel:not([hidden])");
                    const all = [panel, ...panel.querySelectorAll(selector)];
                    if (set) {
                        all.forEach((node, i) => (node.dataset.kept = `n${i}`));
                    }
                    return all.map((node) => node.dataset.kept ?? "");
                },
                [PARTS, mark]
            );
        const marked = (await marks(true)).length;
        expect(marked).toBeGreaterThan(8);
        const before = await marks(false);
        for (const [width, height] of [[1366, 768], [1024, 768], [1920, 1080]]) {
            await page.setViewportSize({ width, height });
            expect(await marks(false), `${width}x${height}: the same elements`).toEqual(before);
            await expect(name).toHaveValue("typed_by_the_student");
            await expect(name).toBeFocused();
        }
        await page.setViewportSize({ width: 1366, height: 768 });
        expectBeside(await sheetLayout(page), "back to short");
        await expect(name).toBeFocused();
        // what is typed there is what is imported
        await app.importSubmit.click();
        await expect(app.importDialog).toBeHidden();
        expect(await tablesNow(app)).toContain("typed_by_the_student");
    });

    test("at 900x700, the narrowest window that has two columns, nothing scrolls sideways with a sheet name of 31 characters with no place to break and the longest line of size; the head wraps and the name is not cut", async ({ app, page }) => {
        await page.setViewportSize({ width: 900, height: 700 });
        await app.open(OPEN);
        const wide = "W".repeat(31);
        const longest = "M".repeat(31);
        await app.chooseFiles(
            made(
                "book.xlsx",
                [{ name: wide, rows: table(30) }, { name: longest, rows: [["x"]] }],
                // (a value in Excel's last row and another in its last column: the line of size at its longest)
                { edit: cellsAt(1, ["A1", "A1048576", "XFD1"]) }
            )
        );
        await dialogReady(app);
        const tabs = sheetTabs(app, "book.xlsx");
        for (const [i, expected] of [[0, wide], [1, longest]]) {
            await tabs.nth(i).click();
            const where = `the sheet called ${expected}`;
            await expect(app.importSheetPanel.locator(".import-sheet-title")).toHaveText(words.importSheetLineText(expected));
            const overflow = await overflowOf(page);
            expect(overflow.page, `${where}: the page`).toBeLessThanOrEqual(0);
            expect(overflow.dialog, `${where}: the dialog`).toBeLessThanOrEqual(0);
            expect(overflow.body, `${where}: the dialog's body`).toBeLessThanOrEqual(0);
            expect(overflow.moved, `${where}: nothing moved`).toEqual({ dialog: 0, body: 0 });
            const name = await app.importSheetPanel.locator(".import-sheet-name").evaluate((node) => ({ scrollWidth: node.scrollWidth, clientWidth: node.clientWidth }));
            expect(name.scrollWidth, `${where}: the name is not cut`).toBeLessThanOrEqual(name.clientWidth);
            const at = await sheetLayout(page);
            expect(at.head.right, `${where}: the head is inside the panel`).toBeLessThanOrEqual(at.panel.right + 0.5);
            expect(at.tick.right, `${where}: the tick box is inside the panel`).toBeLessThanOrEqual(at.panel.right + 0.5);
            // the head wraps: it is higher than its tick box (a row of one line), because the three parts do not fit on one row
            expect(at.head.height, `${where}: the head wraps`).toBeGreaterThan(at.tick.height + 4);
        }
        await expect(app.importSheetPanel.locator(".import-sheet-size")).toHaveText(words.importSheetSizeText({ rows: 1048576, columns: 16384 }));
    });

    for (const [width, height] of [[1366, 768], [900, 700]]) {
        test(`at ${width}x${height} a sheet of forty columns with long cells does not make the dialog scroll sideways: the preview scrolls in its own box, which ends with the panel`, async ({ app, page }) => {
            await page.setViewportSize({ width, height });
            await app.open(OPEN);
            const names = Array.from({ length: 40 }, (_, i) => `a_column_with_a_long_name_${i + 1}`);
            await app.chooseFiles(made("wide.xlsx", [{ name: "Wide", rows: [names, names.map((_, i) => `a cell of text number ${i + 1}`)] }, { name: "Other", rows: table(2) }]));
            await dialogReady(app);
            const overflow = await overflowOf(page);
            expect(overflow.page, "the page").toBeLessThanOrEqual(0);
            expect(overflow.dialog, "the dialog").toBeLessThanOrEqual(0);
            expect(overflow.body, "the dialog's body").toBeLessThanOrEqual(0);
            const at = await sheetLayout(page);
            expect(at.rows.right, "the rows end with the panel").toBeLessThanOrEqual(at.panel.right + 0.5);
            expect(at.preview.right, "the preview ends with the panel").toBeLessThanOrEqual(at.panel.right + 0.5);
            expect(await app.importSheetPanel.locator(".import-preview").evaluate((node) => node.scrollWidth > node.clientWidth), "the preview scrolls in its own box").toBe(true);
        });
    }

    test("a hidden sheet's note is under the head, across the whole panel, above both columns", async ({ app, page }) => {
        await page.setViewportSize({ width: 1366, height: 768 });
        await app.open(OPEN);
        await app.chooseFiles(layoutBook());
        await dialogReady(app);
        await sheetTabs(app, "layout.xlsx").nth(2).click();
        await expect(sheetNote(app)).toHaveText(words.IMPORT_SHEET_HIDDEN_NOTE);
        const at = await sheetLayout(page);
        expect(at.note.top, "under the head").toBeGreaterThanOrEqual(at.head.bottom - 0.5);
        expect(at.note.left, "across: from the panel's left edge").toBeLessThanOrEqual(at.panel.left + 0.5);
        expect(at.note.right, "across: to its right edge").toBeGreaterThanOrEqual(at.panel.right - 0.5);
        expect(at.settings.top, "above the settings").toBeGreaterThanOrEqual(at.note.bottom - 0.5);
        expect(at.rows.top, "above the preview").toBeGreaterThanOrEqual(at.note.bottom - 0.5);
        expectBeside({ ...at, head: { ...at.head, bottom: at.note.bottom } }, "a hidden sheet");
        // (the order of the panel's parts)
        expect(at.children).toEqual(["import-sheet-head", "app-dialog-hint import-sheet-note", "import-settings", "import-sheet-rows"]);
    });

    test("a sheet that cannot be ticked has its line and its tick box in the head and its reason under it, and no settings and no preview", async ({ app, page }) => {
        await page.setViewportSize({ width: 1366, height: 768 });
        await app.open(OPEN);
        await app.chooseFiles(made("unable.xlsx", [{ name: "Fine", rows: table(3) }, { name: "Nothing", rows: [] }, { name: "Too wide", rows: [["x"]] }], { edit: cellsAt(2, ["A1", "XFD1"]) }));
        await dialogReady(app);
        const tabs = sheetTabs(app, "unable.xlsx");
        // a sheet with no values: its line and its tick box, no size
        await tabs.nth(1).click();
        let at = await sheetLayout(page);
        expect(at.children).toEqual(["import-sheet-head", "app-dialog-hint import-sheet-note"]);
        expect(at.name).not.toBeNull();
        expect(at.size).toBeNull();
        expect(at.settings).toBeNull();
        expect(at.rows).toBeNull();
        expect(at.preview).toBeNull();
        expect(at.tick.top).toBeGreaterThanOrEqual(at.head.top - 0.5);
        expect(at.tick.bottom).toBeLessThanOrEqual(at.head.bottom + 0.5);
        expect(at.tick.right, "at the right end").toBeGreaterThanOrEqual(at.head.right - 0.5);
        expect(at.note.top, "its reason is under the head").toBeGreaterThanOrEqual(at.head.bottom - 0.5);
        await expect(sheetNote(app)).toHaveText(words.IMPORT_SHEET_EMPTY_REASON);
        await expect(tickBox(app)).toHaveAttribute("aria-disabled", "true");
        // a sheet that is too wide: its size as well
        await tabs.nth(2).click();
        at = await sheetLayout(page);
        expect(at.children).toEqual(["import-sheet-head", "app-dialog-hint import-sheet-note"]);
        expect(at.size).not.toBeNull();
        expect(at.size.left).toBeGreaterThanOrEqual(at.name.right - 0.5);
        expect(at.note.top).toBeGreaterThanOrEqual(at.head.bottom - 0.5);
        expect(at.tick.right).toBeGreaterThanOrEqual(at.head.right - 0.5);
        expect(at.settings).toBeNull();
        expect(at.preview).toBeNull();
        await expect(sheetNote(app)).toHaveText(words.IMPORT_SHEET_WIDE_REASON);
        // and in a tall window the same sheet has the same parts, stacked
        await page.setViewportSize({ width: 1920, height: 1080 });
        at = await sheetLayout(page);
        expect(at.children).toEqual(["import-sheet-head", "app-dialog-hint import-sheet-note"]);
        expect(at.size.top).toBeGreaterThanOrEqual(at.name.bottom - 0.5);
    });

    test("a workbook of one sheet, which has no strip, and a web page's table have the same layout in a wide, short window", async ({ app, page }) => {
        await page.setViewportSize({ width: 1366, height: 768 });
        await app.open(OPEN);
        await app.chooseFiles(made("one.xlsx", [{ name: "Stock", rows: table(30) }]));
        await dialogReady(app);
        await expect(app.importPanel.getByRole("tablist")).toHaveCount(0);
        const one = await sheetLayout(page);
        expectBeside(one, "one sheet");
        expect(one.rowsAboveFoot).toBeGreaterThanOrEqual(3);
        expect(one.namesRow.bottom).toBeLessThanOrEqual(one.foot);
        await app.importCancel.click();
        const rows = Array.from({ length: 30 }, (_, i) => `<tr><td>${i + 1}</td><td>row ${i + 1}</td></tr>`).join("");
        await app.chooseFiles({ name: "a_page.xls", mimeType: "application/vnd.ms-excel", buffer: Buffer.from(`<html><body><table><tr><th>id</th><th>label</th></tr>${rows}</table></body></html>`) });
        await dialogReady(app);
        await expect(app.importSheetPanel.locator(".import-sheet-title")).toHaveText(words.importPageTableLabel(1));
        const page1 = await sheetLayout(page);
        expectBeside(page1, "a web page");
        expect(page1.rowsAboveFoot).toBeGreaterThanOrEqual(3);
        expect(page1.namesRow.bottom).toBeLessThanOrEqual(page1.foot);
        // (the same panel: the same parts in the same places, give or take the name of the sheet)
        expect(page1.children).toEqual(one.children);
        expect(Math.round(page1.settings.width)).toBe(Math.round(one.settings.width));
        expect(Math.round(page1.rows.left)).toBe(Math.round(one.rows.left));
        expect(Math.round(page1.settings.top)).toBe(Math.round(one.settings.top));
    });

    test("a text file's tab at 1366x768 is as it was: its preview is under its settings, and it has none of a sheet's parts", async ({ app, page }) => {
        await page.setViewportSize({ width: 1366, height: 768 });
        await app.open(OPEN);
        await app.chooseFiles(csvFile("people.csv", `id,name\n${Array.from({ length: 30 }, (_, i) => `${i + 1},person ${i + 1}`).join("\n")}\n`));
        await dialogReady(app);
        await expect(app.importDialog.locator('[class*="import-sheet"]')).toHaveCount(0);
        const at = await app.importPanel.evaluate((panel) => {
            const box = (selector) => {
                const at = panel.querySelector(selector).getBoundingClientRect();
                return { left: at.left, top: at.top, bottom: at.bottom, right: at.right };
            };
            return { settings: box(".import-settings"), preview: box(".import-preview"), display: getComputedStyle(panel).display };
        });
        expect(at.preview.top).toBeGreaterThanOrEqual(at.settings.bottom - 0.5);
        expect(at.preview.left).toBeLessThanOrEqual(at.settings.left + 0.5);
        expect(at.display).not.toBe("grid");
    });
});

// ---- a field's message is in view when it comes -------------------------------------------------------------------

test.describe("a field's message in a sheet's panel is in view when it comes", () => {
    // where a field lies in what the body shows: its box (label, control, hint, message), its message, and how
    // far the body is scrolled; `air` is the body's scroll padding, which a scroll to a control leaves clear
    const fieldAt = (control) =>
        control.evaluate((node) => {
            const body = node.closest(".import-body");
            const box = node.closest(".import-field");
            const error = box.querySelector(".app-dialog-error");
            const at = (one) => one.getBoundingClientRect();
            const shown = at(body);
            return {
                bodyTop: shown.top,
                bodyBottom: shown.bottom,
                boxTop: at(box).top,
                boxBottom: at(box).bottom,
                labelTop: at(box.querySelector("label")).top,
                controlTop: at(node).top,
                controlBottom: at(node).bottom,
                errorShown: !error.hidden,
                errorBottom: at(error).bottom,
                scrollTop: body.scrollTop,
                room: body.scrollHeight - body.clientHeight,
                air: parseFloat(getComputedStyle(body).scrollPaddingBottom) || 0,
            };
        });
    // resolves, with where the body is scrolled, once it has not moved for 20 frames in a row (a scroll that a
    // focus starts has ended by then; frames, not milliseconds)
    const settled = (page) =>
        page.evaluate(
            () =>
                new Promise((resolve) => {
                    const body = document.querySelector("#import-dialog .import-body");
                    let last = body.scrollTop;
                    let still = 0;
                    const tick = () => {
                        still = body.scrollTop === last ? still + 1 : 0;
                        last = body.scrollTop;
                        if (still >= 20) {
                            resolve(body.scrollTop);
                        } else {
                            requestAnimationFrame(tick);
                        }
                    };
                    requestAnimationFrame(tick);
                })
        );
    // scrolls the body so that the control's lower edge is `gap` px above the body's lower edge (a negative
    // number: below it); the focus is not moved
    const putAbove = async (page, control, gap) => {
        const move = () =>
            control.evaluate((node, wanted) => {
                const body = node.closest(".import-body");
                body.scrollTop += node.getBoundingClientRect().bottom - (body.getBoundingClientRect().bottom - wanted);
            }, gap);
        await move();
        await settled(page);
        await move();
        return settled(page);
    };
    // the Tab stop before the control, given the focus without scrolling to it
    const stopBefore = (control) =>
        control.evaluate((node) => {
            const stops = [...node.closest("dialog").querySelectorAll("input, select, button, textarea, [tabindex]")].filter(
                (one) => !one.disabled && one.tabIndex >= 0 && one.getClientRects().length > 0 && !(one.type === "radio" && !one.checked)
            );
            stops[stops.indexOf(node) - 1].focus({ preventScroll: true });
        });
    // a sheet of 41 rows, and a second one, so that the strip of sheets is there
    const longBook = () => made("long.xlsx", [{ name: "Orders", rows: table(40) }, { name: "Small", rows: table(3) }]);
    const beyond = () => words.importNamesRowSheetMessage(41);

    async function openLong(app, page, size) {
        await page.setViewportSize(size);
        await app.open(OPEN);
        await app.chooseFiles(longBook());
        await dialogReady(app);
        await expect(sheetNamesRow(app)).toBeVisible();
    }

    test("at 1366x768 a row typed beyond the sheet shows its message wholly above the foot, with the label in view, and the body moves no further than that needs", async ({ app, page }) => {
        await openLong(app, page, { width: 1366, height: 768 });
        const before = await settled(page);
        await sheetNamesRow(app).fill("99");
        await expect(alertIn(app.importSheetPanel, beyond())).toBeVisible();
        await settled(page);
        const at = await fieldAt(sheetNamesRow(app));
        expect(at.errorShown).toBe(true);
        expect(at.errorBottom, `the message ends (${at.errorBottom}) inside the body's lower edge (${at.bodyBottom}), above the foot`).toBeLessThanOrEqual(at.bodyBottom + 0.5);
        expect(at.labelTop, "the label of the field is in view").toBeGreaterThanOrEqual(at.bodyTop - 0.5);
        expect(at.boxBottom, "and the field's box is whole").toBeLessThanOrEqual(at.bodyBottom + 0.5);
        const foot = await page.locator("#import-dialog .import-foot").evaluate((node) => node.getBoundingClientRect().top);
        expect(at.errorBottom, "above the foot").toBeLessThanOrEqual(foot + 0.5);
        // the least scroll: the body did not need to move, or it moved until the field ends the air from its edge
        if (at.scrollTop !== before) {
            expect(at.bodyBottom - at.boxBottom, "the field ends no further than the air from the body's lower edge").toBeLessThanOrEqual(at.air + 1.5);
        }
    });

    test("typed with the pointer held down on the field, the message comes and nothing moves; at the release the message is wholly in view", async ({ app, page }) => {
        await openLong(app, page, { width: 1366, height: 768 });
        const field = sheetNamesRow(app);
        // (the field lies at the lower edge of what the body shows, with the message below it out of view)
        const held = await putAbove(page, field, 2);
        const box = await field.boundingBox();
        await page.mouse.move(box.x + 10, box.y + box.height / 2);
        await page.mouse.down();
        await expect(field).toBeFocused();
        await page.keyboard.type("99");
        await expect(alertIn(app.importSheetPanel, beyond())).toBeVisible();
        const down = await fieldAt(field);
        expect(down.scrollTop, "the body has not moved while the pointer is down").toBe(held);
        expect(down.errorBottom, "(the message is cut by the foot: that is what the release is for)").toBeGreaterThan(down.bodyBottom + 0.5);
        await page.mouse.up();
        await expect.poll(async () => (await fieldAt(field)).errorBottom, { message: "at the release the message is wholly in view" }).toBeLessThanOrEqual(down.bodyBottom + 0.5);
    });

    // The row's number changed by an arrow of the field with the pointer, while the focus is on another control
    // (Firefox gives the field no focus for an arrow; Chromium does): the message is brought in at the release.
    test("an arrow of the row's field pressed with the pointer, while the focus is elsewhere, leaves the message wholly in view at the release and moves nothing before", async ({ app, page }) => {
        await openLong(app, page, { width: 1366, height: 768 });
        const field = sheetNamesRow(app);
        await field.fill("60");
        await expect(alertIn(app.importSheetPanel, beyond())).toBeVisible();
        await sheetHasNames(app).focus({ preventScroll: true });
        // (2 px beyond the air the body keeps clear: a browser that gives the field the focus does not scroll to it)
        const held = await putAbove(page, field, 14);
        const box = await field.boundingBox();
        // (the arrows of a number field are at its right edge: the upper half is the one that adds)
        await page.mouse.move(box.x + box.width - 14, box.y + box.height / 2 - 6);
        await page.mouse.down();
        await expect(field).not.toHaveValue("60");
        await expect(alertIn(app.importSheetPanel, beyond())).toBeVisible();
        const down = await fieldAt(field);
        expect(down.scrollTop, "the body has not moved while the pointer is down").toBe(held);
        expect(down.errorBottom, "(the message is cut by the foot: that is what the release is for)").toBeGreaterThan(down.bodyBottom + 0.5);
        await page.mouse.up();
        await expect.poll(async () => (await fieldAt(field)).errorBottom, { message: "at the release the message is wholly in view" }).toBeLessThanOrEqual(down.bodyBottom + 0.5);
    });

    test("a change of the row's number that the field tells of while the focus is on another control brings the message wholly in view", async ({ app, page }) => {
        await openLong(app, page, { width: 1366, height: 768 });
        const field = sheetNamesRow(app);
        await field.fill("60");
        await expect(alertIn(app.importSheetPanel, beyond())).toBeVisible();
        await sheetHasNames(app).focus({ preventScroll: true });
        await putAbove(page, field, 2);
        const cut = await fieldAt(field);
        expect(cut.errorBottom, "(the message is cut by the foot)").toBeGreaterThan(cut.bodyBottom + 0.5);
        await field.evaluate((node) => {
            node.stepUp();
            node.dispatchEvent(new Event("input", { bubbles: true }));
        });
        await expect(field).toHaveValue("61");
        await expect(sheetHasNames(app)).toBeFocused();
        await settled(page);
        const at = await fieldAt(field);
        expect(at.errorShown).toBe(true);
        expect(at.errorBottom, "the message is wholly in view").toBeLessThanOrEqual(at.bodyBottom + 0.5);
        expect(at.labelTop).toBeGreaterThanOrEqual(at.bodyTop - 0.5);
    });

    test("when the body was scrolled during the held press, the release leaves it where it was put", async ({ app, page }) => {
        await openLong(app, page, { width: 1366, height: 768 });
        const field = sheetNamesRow(app);
        const held = await putAbove(page, field, 2);
        const box = await field.boundingBox();
        await page.mouse.move(box.x + 10, box.y + box.height / 2);
        await page.mouse.down();
        await expect(field).toBeFocused();
        await page.keyboard.type("99");
        await expect(alertIn(app.importSheetPanel, beyond())).toBeVisible();
        // (a little further on: the message is still cut, and the body is not where it was when the message came)
        const put = await page.locator("#import-dialog .import-body").evaluate((node, to) => {
            node.scrollTop = to;
            return node.scrollTop;
        }, held + 5);
        expect(put, "the body was scrolled").toBeGreaterThan(held + 2);
        expect((await fieldAt(field)).errorBottom, "the message is still cut").toBeGreaterThan((await fieldAt(field)).bodyBottom + 0.5);
        await settled(page);
        await page.mouse.up();
        expect(await settled(page), "the body is where the student put it").toBe(put);
    });

    test("a message that goes (the row made good again) moves nothing", async ({ app, page }) => {
        await openLong(app, page, { width: 1366, height: 768 });
        const field = sheetNamesRow(app);
        await field.fill("99");
        await expect(alertIn(app.importSheetPanel, beyond())).toBeVisible();
        await settled(page);
        const before = await fieldAt(field);
        await field.fill("2");
        await expect(alertIn(app.importSheetPanel, beyond())).toHaveCount(0);
        const after = await fieldAt(field);
        await settled(page);
        // (a body that is shorter once the message has gone may have to end sooner: that is the layout's, not a scroll)
        expect(await settled(page), "the body is where it was").toBe(Math.min(before.scrollTop, after.room));
    });

    // The student types the name in the panel of the second sheet, goes to the first sheet, and presses Import; or
    // stays in that field and presses Enter there, when the focus is in it already and no "focusin" comes.
    async function pressWithBadName(app, page, how) {
        await openLong(app, page, { width: 1024, height: 600 });
        const tabs = sheetTabs(app, "long.xlsx");
        await tabs.nth(1).click();
        await sheetName(app).fill("sqlite_mine");
        if (how === "click") {
            await tabs.nth(0).click();
        }
        // the name field of what is on show lies at the lower edge of the body, its message under it out of view
        const control = sheetName(app);
        const put = await putAbove(page, control, 2);
        if (how === "click") {
            expect((await fieldAt(control)).scrollTop, "the body is where it was put").toBe(put);
            await app.importSubmit.click();
        } else {
            await expect(control).toBeFocused();
            await page.keyboard.press("Enter");
        }
        await expect(sheetTabs(app, "long.xlsx").nth(1)).toHaveAttribute("aria-selected", "true");
        await expect(alertIn(app.importSheetPanel, words.IMPORT_NAME_RESERVED_MESSAGE)).toBeVisible();
        await expect(sheetName(app)).toBeFocused();
        await settled(page);
        return fieldAt(sheetName(app));
    }

    for (const [how, title] of [["click", "by a click, in a sheet that is not on show"], ["Enter", "by Enter in the very field that has the focus"]]) {
        test(`Import pressed ${title}, with a name that cannot be used, shows that sheet's name field and its message wholly in a low window`, async ({ app, page }) => {
            const at = await pressWithBadName(app, page, how);
            expect(at.errorShown).toBe(true);
            expect(at.errorBottom, "the message is wholly above the body's lower edge").toBeLessThanOrEqual(at.bodyBottom + 0.5);
            expect(at.labelTop, "and the label is in view").toBeGreaterThanOrEqual(at.bodyTop - 0.5);
        });
    }

    // The body is scrolled to its top, so the field lies below what it shows; Import is pressed by a click in the
    // foot. The field is brought in by the least scroll (its box ends the air from the lower edge), and the
    // browser's own centring of a field that takes the focus is not what does it.
    test("Import pressed with a name that cannot be used, while the field lies below what the body shows, brings the field in by the least scroll", async ({ app, page }) => {
        await openLong(app, page, { width: 1024, height: 460 });
        const tabs = sheetTabs(app, "long.xlsx");
        await tabs.nth(1).click();
        await sheetName(app).fill("sqlite_mine");
        await tabs.nth(0).click();
        const control = sheetName(app);
        await page.locator("#import-dialog .import-body").evaluate((node) => {
            node.scrollTop = 0;
        });
        await settled(page);
        const before = await fieldAt(control);
        expect(before.controlBottom, "the field's control lies below what the body shows").toBeGreaterThan(before.bodyBottom);
        await app.importSubmit.click();
        await expect(sheetTabs(app, "long.xlsx").nth(1)).toHaveAttribute("aria-selected", "true");
        await expect(alertIn(app.importSheetPanel, words.IMPORT_NAME_RESERVED_MESSAGE)).toBeVisible();
        await expect(sheetName(app)).toBeFocused();
        await settled(page);
        const at = await fieldAt(sheetName(app));
        expect(at.labelTop, "the label is in view").toBeGreaterThanOrEqual(at.bodyTop - 0.5);
        expect(at.errorBottom, "and the message").toBeLessThanOrEqual(at.bodyBottom + 0.5);
        expect(at.bodyBottom - at.boxBottom, `the field's box ends the air (${at.air} px) from the lower edge and no further`).toBeLessThanOrEqual(at.air + 1.5);
    });

    test("Tab to a field that already shows a message brings the message into view with it", async ({ app, page }) => {
        await openLong(app, page, { width: 1024, height: 600 });
        const field = sheetNamesRow(app);
        await field.fill("99");
        await expect(alertIn(app.importSheetPanel, beyond())).toBeVisible();
        // (the control is whole and clear of the edge, with its message under it out of view)
        await putAbove(page, field, 12);
        await stopBefore(field);
        const before = await fieldAt(field);
        expect(before.controlBottom, "the control is whole").toBeLessThanOrEqual(before.bodyBottom);
        expect(before.errorBottom, "its message is cut").toBeGreaterThan(before.bodyBottom + 0.5);
        await page.keyboard.press("Tab");
        await expect(field).toBeFocused();
        await settled(page);
        const at = await fieldAt(field);
        expect(at.errorBottom, "the message is wholly in view").toBeLessThanOrEqual(at.bodyBottom + 0.5);
        expect(at.labelTop, "with its label").toBeGreaterThanOrEqual(at.bodyTop - 0.5);
    });

    test("Tab to a field that shows no message scrolls as before: its control is whole, and the body moves no further than the control needs, though its hint stays cut", async ({ app, page }) => {
        await openLong(app, page, { width: 1024, height: 600 });
        const field = sheetName(app);
        // (the control lies within the air of the lower edge, and the hint under it is out of view)
        await putAbove(page, field, 2);
        await stopBefore(field);
        const before = await fieldAt(field);
        expect(before.errorShown).toBe(false);
        expect(before.boxBottom, "the hint under the control is out of view").toBeGreaterThan(before.bodyBottom + 0.5);
        await page.keyboard.press("Tab");
        await expect(field).toBeFocused();
        await settled(page);
        const at = await fieldAt(field);
        expect(at.controlBottom, "the control is wholly in view").toBeLessThanOrEqual(at.bodyBottom);
        expect(at.scrollTop, "the body moved").toBeGreaterThan(before.scrollTop);
        expect(at.bodyBottom - at.controlBottom, `the control ends the air (${at.air} px) from the lower edge and no further`).toBeLessThanOrEqual(at.air + 1.5);
        expect(at.boxBottom, "(the hint is still cut: the box was not brought)").toBeGreaterThan(at.bodyBottom + 0.5);
    });
});
