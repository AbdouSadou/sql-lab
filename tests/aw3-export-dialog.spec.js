const fs = require("node:fs");
const path = require("node:path");
const { pathToFileURL } = require("node:url");
const AxeBuilder = require("@axe-core/playwright").default;
const { chromium, firefox } = require("@playwright/test");
const {
    test,
    expect,
    App,
    repeatTaken,
    watchClosing,
    closingSeen,
    fixturePath,
    holdDataset,
    holdVendor,
    slowDown,
    snapshot,
    expectNothingLeft,
    waitUntilIdle,
    logKey,
    readZip,
    tabTo,
    DEFAULT_DATASET,
    realManifest,
    ZIP_TOOL,
    EXPORT_URL,
    flagState,
    EDGE_DATABASE,
    openEdgeCases,
    recordDownloads,
    eventsOfOpen,
    expectedBytes,
} = require("./helpers");

// Assessment plan, Phase 3 (export tables as CSV), the dialog as a student meets it (the plan's
// section 5; CODEMAP 9.7; js/lab/export-tables-dialog.js and js/lab/export-tables.js). The export is
// switched by the flag "export" (on in the page as it ships): a page with the export alone on
// (flagState("export"), the kit's EXPORT_URL) has "Tables as CSV..." in the Export menu (in the
// More menu of a phone), and a dialog that lists the tables and views of the open database, counts
// them, and saves the ticked ones as one CSV file or as a zip of them. What the files hold is the
// business of tests/aw3-export-rules.spec.js and tests/aw3-export-fixtures.spec.js; what the page does
// around the dialog (the menus, every refusal while an export runs) is tests/aw3-export-page.spec.js.
// Here:
//   1  the list: its order, what each row shows (name, "view", count, "Saved as ..." when the file
//      is not called <name>.csv), the one tick that is set when the list holds exactly one object,
//      and none otherwise; names are text, whatever they hold, and a row is described by its line;
//      a table whose name has a letter outside ASCII is counted and saved; the list says it is a
//      list (its role, its name, an item for each row)
//   2  the tick box for all, in each of its states, and back in use when a dialog in which nothing
//      could be ticked is opened again on rows that can
//   3  the line beside Export in its four states (counting, nothing ticked, nothing can be ticked, what
//      will be saved), and Export itself when it is off: aria-disabled,
//      in the Tab order, described by the line, and a press does nothing; a tick that changes no
//      words writes nothing, into that line or into the line of a row
//   4  the counts: a row says it is being counted until it is, Export is off until every count has
//      ended, ticks can be changed meanwhile, the page gets a turn between two counts; a view that
//      cannot be counted, and what happens to its tick and to the tick box for all (which is
//      brought in line at once, before the last count is in); when counting itself throws, a row
//      that already said why keeps its own words
//   5  counts that arrive late: after the dialog has closed, after it has closed and opened again,
//      after another database has opened (Back and Forward): they are dropped, and nothing wrong is
//      shown; a count that ends in the very task in which its dialog was closed and opened again
//      leaves the new dialog alone
//   6  the dialog is not offered while a database loads, while an import runs, while an earlier
//      export is still ending, with no database and with nothing to list: a toast for each
//   7  while it runs: the progress block (heading, second line, the bar, aria-busy on the block and
//      not on the dialog) and the polite line that says the table when the table changes (never
//      drawn: one pixel, clipped; empty again when the dialog is opened after a zip was cancelled);
//      the first thing the progress shows (one table named, two say the zip tool, the second line
//      empty and the bar at 0 whatever the export before left), and a bar that ends at 1 for a table
//      of one row
//   8  Cancel and Escape, each at four points of an export (while the zip library is awaited, before
//      the first piece, in the middle of a table, in the middle of a zip), and a slow view; a
//      dialog closed from the page with neither; Cancel and the menu entry pressed in one task; a
//      dialog opened a second time has a session of its own
//   9  errors: a table that cannot be read to its end, and the zip library that cannot be loaded
//      (the request aborted, a 404, a file that is not the library), each with the ticks kept and a
//      second press that works; the order of the foot after a failure, and a dialog opened again
//      after one starts clean
//  10  the note at the end of an export that holds a BLOB, and a second export after it
//  11  where the focus is at every step, and the whole dialog by keyboard alone
//  12  a database that opens under the idle dialog closes it
//  13  axe, in both themes, on the list, the counting, the running state, the note and an error
//  14  360 px wide, a name of 100 characters, three hundred tables
//  15  the dialog as drawn, measured against the page's own tokens: Export while it is off looks
//      like a disabled primary button (nothing ticked, and while counting; light and dark), the
//      alert line a full step above the buttons, a row that gets the focus by Tab or Shift+Tab stays
//      in the list's view, the tick boxes in the accent colour, the word "view" with the control
//      radius and the muted colour, a line under a name reaching the row's right edge, and the
//      width at which a row's line goes under its name (570 against 580 px)
//  16  a key that is held down (Enter), inside the dialog and after it has closed, and Escape between
//      two steps of an export, with scheduler.yield and without it; an export that ends by itself
//      ends its session before the dialog closes; the guard is put on at every closing of a visit;
//      Escape is heard the second time too
//  17  how the dialog is drawn: only the list scrolls, a box that cannot be ticked is dimmed (to
//      0.4), Export when it is off stays grey under the pointer in forced colours, a
//      line beside a name (a reason, a file's name) never crushes the name, at 1366 and 700 px, a
//      reason under a name starts where the name starts, and a tick box is level with the first
//      line of its name, at 1366 px, 700 px and the width of a phone
// Everything drives the real page, so each test runs in all four projects; nothing here is Node-only.
// The texts are read from js/lab/config-workflow.js and never typed again, except file names and
// numbers, which are the facts under test. The fixture is the owner's tests/fixtures/export/
// export_edge_cases.db (never edited), opened as a file; the other databases are made in the test
// with SQL, in an empty database, and every table that a test needs to be slow is made of
// ordinary rows (a view that is slow to produce is made of randomblob, which costs time and writes
// nothing). A test that needs the page to give itself a turn slowly (so that a long job can be
// caught in the middle) slows scheduler.yield with tests/helpers.js's slowDown.

const load = (file) => import(pathToFileURL(path.join(__dirname, "..", "js", "lab", file)).href);

// A course database that is not the default one, taken from what the site ships: no test assumes
// which database is the default. A test that needs one skips itself when only one ships.
const OTHER_DATASET = realManifest().datasets.find((entry) => entry.id !== DEFAULT_DATASET.id);

let words;
test.beforeAll(async () => {
    words = await load("config-workflow.js");
});

// what the owner says the fourteen objects of the fixture are, in the dialog's order
const expected = JSON.parse(fs.readFileSync(fixturePath("expected/export.json"), "utf8")).tables.map((table) => ({
    name: table.name,
    kind: table.kind,
    rows: table.rows,
    file: path.posix.basename(table.expected_csv),
}));

// ---- helpers ------------------------------------------------------------------------------------

// SQL run on the open database from inside the page, as a student's own script would (nothing is
// shown, nothing is recorded)
const exec = (page, sql) => page.evaluate((text) => window.app.database.db.exec(text), sql);

// an empty database, the export flag on, and then `sql` run on it
async function openMade(app, sql, address = EXPORT_URL) {
    await app.openEmpty(address);
    if (sql) {
        await exec(app.page, sql);
    }
}

const pad = (n, width = 3) => String(n).padStart(width, "0");
// `count` tables called <prefix>001, <prefix>002 ... of one row each
const manyTables = (count, prefix = "t") => Array.from({ length: count }, (_, i) => `create table ${prefix}${pad(i + 1)}(a); insert into ${prefix}${pad(i + 1)} values (${i + 1});`).join("\n");
// a view that cannot be counted: the table it reads from is gone
const GONE_VIEW = (name) => `create table src_${name}(a); create view ${name} as select a from src_${name}; drop table src_${name};`;
// a view that counts (2 rows) and cannot be read: the second row overflows
const BAD_VIEW = (name) => `create view ${name} as select 1 as x union all select abs(-9223372036854775807-1);`;
// a view of 3,000 rows that counts, and cannot be read from its 2,500th row on
const BAD_LATE_VIEW = (name) =>
    `create view ${name} as with recursive c(x) as (select 1 union all select x+1 from c where x<3000) select case when x=2500 then abs(-9223372036854775807-1) else x end as x from c;`;
// 6,000 rows of 1,000 characters: about a hundred pieces of the export's 65,536 characters
const HEAVY = (name) =>
    `create table ${name}(id integer primary key, pad text); with recursive c(x) as (select 1 union all select x+1 from c where x<6000) insert into ${name} select x, hex(zeroblob(500)) from c;`;
// 1,000 rows that are cheap to write (two small numbers) and slow to produce (about 10 ms each: a
// random blob of 4 MB is made and measured for each row); counting them costs nothing, because the
// engine leaves the column out of count(*)
const SLOW_VIEW = (name) =>
    `create table ${name}_rows(id integer primary key); with recursive c(x) as (select 1 union all select x+1 from c where x<1000) insert into ${name}_rows select x from c;
     create view ${name} as select id, length(hex(randomblob(4000000+id*0))) as w from ${name}_rows;`;

// the quoted words that a name takes in a regular expression
const escaped = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

// the state of the tick box for all: `disabled` is what the page says with aria-disabled (the box is
// never disabled itself: a disabled box under the focus would lose it); `native` is the attribute
const allState = (app) =>
    app.tablesAll.evaluate((box) => ({ checked: box.checked, indeterminate: box.indeterminate, disabled: box.getAttribute("aria-disabled") === "true", native: box.disabled }));
// which rows are ticked
const tickedNames = async (app) => (await app.tablesRows()).filter((row) => row.ticked).map((row) => row.name);
// how many rows have their count (or a reason): the others still say they are being counted
const counted = (app) => app.tablesDialog.locator(".tables-row-line").evaluateAll((lines, text) => lines.filter((line) => !line.textContent.includes(text)).length, words.EXPORT_TABLES_COUNTING);
const submitOff = (app) => app.tablesSubmit.getAttribute("aria-disabled");
// the alert line is not on show: the element's own state, which says so whether or not the dialog is open
const errorCleared = (page) => page.evaluate(() => ({ hidden: document.querySelector("#export-tables-error").hidden, text: document.querySelector("#export-tables-error").textContent }));
// the first words of what a row says when its rows could not be counted (the reason that follows is the engine's)
const uncountedWords = () => words.exportTablesUncountedText("").split(".")[0];

// Watches the dialog from inside the page, and keeps what a student could have seen wrong: Export on
// while a row still says it is being counted (violations), and how many rows had their count each
// time the page looked (steps), so that a test can tell whether two counts were made in one go.
async function watchDialog(page) {
    await page.evaluate(
        ({ counting }) => {
            const watch = { violations: [], steps: [] };
            window.__watch = watch;
            const dialog = document.querySelector("#export-tables-dialog");
            const look = () => {
                const lines = [...dialog.querySelectorAll(".tables-row-line")];
                const waiting = lines.filter((line) => line.textContent.includes(counting)).length;
                const submit = dialog.querySelector("#export-tables-submit");
                if (lines.length) {
                    const done = lines.length - waiting;
                    if (watch.steps.at(-1) !== done) {
                        watch.steps.push(done);
                    }
                }
                if (waiting && submit.getAttribute("aria-disabled") !== "true") {
                    watch.violations.push(`Export is on while ${waiting} of ${lines.length} rows are still being counted`);
                }
            };
            new MutationObserver(look).observe(dialog, { childList: true, subtree: true, characterData: true, attributes: true });
        },
        { counting: words.EXPORT_TABLES_COUNTING }
    );
}
const watched = (page) => page.evaluate(() => window.__watch);

// Two or more tables go to the zip tool, whose request a test can hold: the export is running, and
// waits for it. Returns {open, requests} of holdVendor.
async function holdZip(page, app, names) {
    const held = await holdVendor(page, ZIP_TOOL);
    await app.openTables();
    await app.waitCounted();
    await app.tickTables(names);
    await expect(app.tablesSubmit).toHaveAttribute("aria-disabled", "false");
    await app.tablesSubmit.click();
    await expect(app.tablesProgress).toBeVisible();
    await expect(app.tablesDialog.locator("#export-tables-progress-title")).toHaveText(words.EXPORT_TABLES_PROGRESS_LIBRARY);
    await expect.poll(() => held.requests()).toBe(1);
    return held;
}

// the progress block as the student reads it
const progressText = (app) =>
    app.tablesProgress.evaluate((block) => ({
        title: block.querySelector("#export-tables-progress-title").textContent,
        part: block.querySelector(".results-loading-size").textContent,
        value: block.querySelector("progress").value,
        max: block.querySelector("progress").max,
    }));

// rows written of the table that is being exported, read from the progress block's second line
const rowsWritten = async (app) => {
    const match = /^([\d,]+)/.exec((await progressText(app)).part);
    return match ? Number(match[1].replace(/,/g, "")) : 0;
};

// what has focus, as the student would say it
const focusedId = (page) => page.evaluate(() => document.activeElement?.id || document.activeElement?.tagName || "");

// the Export menu's entry, pressed from inside the page (a modal dialog makes the rest inert, and a
// refusal is looked for in the moment after another job's end)
const pressTablesEntry = (page) =>
    page.evaluate(() => {
        document.querySelector("#export-button").click();
        document.querySelector("#export-tables").click();
    });

// ---- 1. the list --------------------------------------------------------------------------------------

test.describe("the list of tables and views", () => {
    test("the rows come in SQL's order, each with its name, the word view for a view, and its count in the page's number style", async ({ app }) => {
        await openEdgeCases(app);
        await app.openTables();
        await app.waitCounted();
        const rows = await app.tablesRows();
        expect(rows.map((row) => row.name)).toEqual(expected.map((table) => table.name));
        expect(rows.map((row) => row.kind)).toEqual(expected.map((table) => table.kind));
        expect(rows.map((row) => row.line)).toEqual(expected.map((table) => words.exportTablesRowsText(table.rows)));
        // (the number style of the page: a thousands separator, and the singular for one)
        const lineOf = (name) => rows.find((row) => row.name === name).line;
        expect(lineOf("big_2000")).toBe("2,000 rows");
        expect(lineOf("con")).toBe("1 row");
        expect(lineOf("empty_table")).toBe("0 rows");
        // the label holds the name, and for a view the word, and nothing else
        const labels = await app.tablesDialog.locator(".tables-row-label").evaluateAll((nodes) => nodes.map((node) => node.textContent));
        expect(labels).toEqual(expected.map((table) => (table.kind === "view" ? `${table.name} ${words.EXPORT_TABLES_VIEW_WORD}` : table.name)));
        // the dialog says what it is
        await expect(app.tablesDialog.getByRole("heading", { name: words.EXPORT_TABLES_TITLE })).toBeVisible();
        await expect(app.tablesDialog).toContainText(words.EXPORT_TABLES_TEXT_LINE);
        await expect(app.tablesDialog.getByRole("list", { name: words.EXPORT_TABLES_LIST_LABEL })).toBeVisible();
    });

    test("a box is named by its table and described by its line: the count, or the reason, or where the file goes", async ({ app }) => {
        await openEdgeCases(app);
        await app.openTables();
        await app.waitCounted();
        await expect(app.tablesBox("big_2000")).toHaveAccessibleName("big_2000");
        await expect(app.tablesBox("big_2000")).toHaveAccessibleDescription(words.exportTablesRowsText(2000));
        await expect(app.tablesBox("v_basic_summary")).toHaveAccessibleName(`v_basic_summary ${words.EXPORT_TABLES_VIEW_WORD}`);
        await expect(app.tablesBox("v_basic_summary")).toHaveAccessibleDescription(words.exportTablesRowsText(1));
        // ticked, a row whose file is not called after it says so, in the same description
        await app.tickTables(["Order Details"]);
        await expect(app.tablesBox("Order Details")).toHaveAccessibleDescription(`${words.exportTablesRowsText(2)} ${words.exportTablesSavedAsText("Order_Details.csv")}`);
        // and the line is the box's own: the two ids agree
        const ids = await app.tablesBox("Order Details").evaluate((box) => ({ describedby: box.getAttribute("aria-describedby"), line: box.closest("li").querySelector(".tables-row-line").id }));
        expect(ids.describedby).toBe(ids.line);
    });

    test("a row says its file name only when it is not the table's name and .csv, and only for a row that is ticked", async ({ app }) => {
        await openEdgeCases(app);
        await app.openTables();
        await app.waitCounted();
        const saved = (name) => app.tablesRow(name).locator(".tables-row-saved");
        // nothing is ticked: no row says anything of a file
        await expect(app.tablesDialog.locator(".tables-row-saved")).toHaveCount(0);
        // a table whose file is called after it says nothing
        await app.tickTables(["basic", "con"]);
        await expect(saved("basic")).toHaveCount(0);
        await expect(saved("con")).toHaveCount(0);
        // a name with a space, and one with a slash, are written another way
        await app.tickTables(["Order Details", "sales/2024"]);
        await expect(saved("Order Details")).toHaveText(words.exportTablesSavedAsText("Order_Details.csv"));
        await expect(saved("sales/2024")).toHaveText(words.exportTablesSavedAsText("sales_2024.csv"));
        // sales_2024 comes second in the dialog's order and so takes the _2
        await app.tickTables(["sales_2024"]);
        await expect(saved("sales_2024")).toHaveText(words.exportTablesSavedAsText("sales_2024_2.csv"));
        await expect(saved("sales/2024")).toHaveText(words.exportTablesSavedAsText("sales_2024.csv"));
        // worked out again when the ticks change: without its twin the second is called as it is
        await app.tablesBox("sales/2024").uncheck();
        await expect(saved("sales_2024")).toHaveCount(0);
        await expect(saved("sales/2024")).toHaveCount(0);
        await app.tablesBox("sales/2024").check();
        await expect(saved("sales_2024")).toHaveText(words.exportTablesSavedAsText("sales_2024_2.csv"));
        // a row that is no longer ticked says nothing
        await app.tablesBox("Order Details").uncheck();
        await expect(saved("Order Details")).toHaveCount(0);
    });

    test("with exactly one table or view in the list it is ticked when the dialog opens, and the tick box for all is not there", async ({ app }) => {
        await openMade(app, "create table only_one(a); insert into only_one values (1), (2);");
        await app.openTables();
        // (before its count has come: no count sets a tick)
        await expect(app.tablesBox("only_one")).toBeChecked();
        await app.waitCounted();
        expect(await tickedNames(app)).toEqual(["only_one"]);
        await expect(app.tablesAll).toBeHidden();
        await expect(app.tablesBox("only_one")).toBeFocused();
        await expect(app.tablesSubmit).toHaveAttribute("aria-disabled", "false");
        await expect(app.tablesHold).toHaveText(words.exportTablesWillSaveText({ kind: "file", fileName: "only_one.csv", entries: [{ name: "only_one.csv" }] }));
    });

    test("a single view is ticked too; and the objects whose names begin with sqlite_ are not in the list, so a table with AUTOINCREMENT is still one", async ({ app }) => {
        await openMade(app, "create table base(a); create view only_view as select a from base;");
        await app.openTables();
        await app.waitCounted();
        expect((await app.tablesRows()).map((row) => row.name)).toEqual(["base", "only_view"]);
        expect(await tickedNames(app)).toEqual([]);
        await app.tablesCancel.click();
        // (sqlite_sequence is made by the first table with AUTOINCREMENT)
        await openMade(app, "create table counter(id integer primary key autoincrement, a); insert into counter(a) values (1);");
        await app.openTables();
        await app.waitCounted();
        expect((await app.tablesRows()).map((row) => row.name)).toEqual(["counter"]);
        expect(await tickedNames(app)).toEqual(["counter"]);
    });

    test("with two or more rows nothing is ticked when the dialog opens, whatever the counts say", async ({ app }) => {
        await openEdgeCases(app);
        await app.openTables();
        // (at once, and when every count has come)
        expect(await tickedNames(app)).toEqual([]);
        await app.waitCounted();
        expect(await tickedNames(app)).toEqual([]);
        await expect(app.tablesSubmit).toHaveAttribute("aria-disabled", "true");
    });

    test("only a database's own main schema is listed: a TEMP table is not, and the main table of the same name is", async ({ app }) => {
        await openMade(app, "create table shared(a); insert into shared values (1); create table other(a); create temp table shared(a, b); create temp table temp_only(a);");
        await app.openTables();
        await app.waitCounted();
        const rows = await app.tablesRows();
        expect(rows.map((row) => row.name)).toEqual(["other", "shared"]);
        // (the count is the main table's, one row, and not the TEMP table's, none)
        expect(rows.find((row) => row.name === "shared").line).toBe(words.exportTablesRowsText(1));
    });

    test("a name is text, whatever it holds: no markup is made of it, and a script in it does not run", async ({ page, app }) => {
        const names = [`<img src=x onerror="window.__pwned=1">`, `a "quoted" name`, `<b>bold</b>`];
        await openMade(app, names.map((name) => `create table "${name.replace(/"/g, '""')}"(a);`).join("\n"));
        await app.openTables();
        await app.waitCounted();
        expect((await app.tablesRows()).map((row) => row.name).sort()).toEqual([...names].sort());
        await expect(app.tablesDialog.locator("img, b, script")).toHaveCount(0);
        await app.expectInert();
        // (and the line under the box says the file's name as text too)
        await app.tablesBox(`<b>bold</b>`).check();
        const { sanitiseName } = await load("import-rules.js");
        await expect(app.tablesRow(`<b>bold</b>`).locator(".tables-row-saved")).toHaveText(words.exportTablesSavedAsText(`${sanitiseName("<b>bold</b>")}.csv`));
        await app.expectInert();
    });

    test("a table whose name has a letter outside ASCII is counted: its line starts with its count, it can be ticked, and Export saves it", async ({ app }) => {
        // (the engine folds the case of the letters of ASCII only: the upper-case spelling of "café" or "straße" is not the name of a table)
        const names = ["café", "straße"];
        await openMade(app, names.map((name) => `create table "${name}"(a); insert into "${name}" values (1), (2);`).join("\n"));
        await app.openTables();
        await app.waitCounted();
        const rows = await app.tablesRows();
        expect(rows.map((row) => row.name)).toEqual(names);
        for (const row of rows) {
            expect(row.line, `the line of ${row.name} is its count`).toBe(words.exportTablesRowsText(2));
            expect(row.tickable, `${row.name} can be ticked`).toBe(true);
        }
        await app.tickTables(["café"]);
        await expect(app.tablesSubmit).toHaveAttribute("aria-disabled", "false");
        const { sanitiseName } = await load("import-rules.js");
        const file = await app.download(() => app.tablesSubmit.click());
        expect(file.name).toBe(`${sanitiseName("café")}.csv`);
        expect(file.text.split("\n").filter(Boolean)).toHaveLength(3);
    });

    test("the list says it is a list, with its name, and each row is an item of it", async ({ app }) => {
        await openMade(app, "create table a1(x); create table a2(x); create table a3(x);");
        await app.openTables();
        await app.waitCounted();
        // (the attributes themselves: some browsers drop the role of a list that shows no markers, and a reader of
        // the markup alone, as the test tool is, would supply it)
        const list = app.tablesDialog.locator("ul.tables-list");
        await expect(list).toHaveCount(1);
        await expect(list).toHaveAttribute("role", "list");
        await expect(list).toHaveAttribute("aria-label", words.EXPORT_TABLES_LIST_LABEL);
        await expect(list.locator(":scope > li")).toHaveCount(3);
        const named = app.tablesDialog.getByRole("list", { name: words.EXPORT_TABLES_LIST_LABEL });
        await expect(named.getByRole("listitem")).toHaveCount(3);
    });
});

// ---- 2. the tick box for all ---------------------------------------------------------------------------------

test.describe("the tick box for all tables and views", () => {
    test("it is there from two rows, is not ticked at first, and is named for what it does", async ({ app }) => {
        await openMade(app, "create table one(a); create table two(a);");
        await app.openTables();
        await expect(app.tablesAll).toBeVisible();
        await expect(app.tablesAll).toHaveAccessibleName(words.EXPORT_TABLES_ALL_LABEL);
        expect(await allState(app)).toEqual({ checked: false, indeterminate: false, disabled: false, native: false });
        await app.waitCounted();
        expect(await allState(app)).toEqual({ checked: false, indeterminate: false, disabled: false, native: false });
    });

    test("one row ticked makes it mixed; all the rows ticked, one by one, makes it ticked; one taken away makes it mixed again", async ({ app }) => {
        await openMade(app, "create table a1(x); create table a2(x); create table a3(x);");
        await app.openTables();
        await app.waitCounted();
        await app.tickTables(["a1"]);
        expect(await allState(app)).toEqual({ checked: false, indeterminate: true, disabled: false, native: false });
        await app.tickTables(["a2"]);
        expect(await allState(app)).toEqual({ checked: false, indeterminate: true, disabled: false, native: false });
        await app.tickTables(["a3"]);
        expect(await allState(app)).toEqual({ checked: true, indeterminate: false, disabled: false, native: false });
        await app.tablesBox("a2").uncheck();
        expect(await allState(app)).toEqual({ checked: false, indeterminate: true, disabled: false, native: false });
        await app.tablesBox("a1").uncheck();
        await app.tablesBox("a3").uncheck();
        expect(await allState(app)).toEqual({ checked: false, indeterminate: false, disabled: false, native: false });
    });

    test("a press while it is mixed ticks every row; a press then takes every tick away; a press on none ticks all", async ({ app }) => {
        await openMade(app, "create table a1(x); create table a2(x); create table a3(x);");
        await app.openTables();
        await app.waitCounted();
        await app.tickTables(["a2"]);
        expect(await allState(app)).toMatchObject({ indeterminate: true });
        await app.tablesAll.click();
        expect(await tickedNames(app)).toEqual(["a1", "a2", "a3"]);
        expect(await allState(app)).toEqual({ checked: true, indeterminate: false, disabled: false, native: false });
        await app.tablesAll.click();
        expect(await tickedNames(app)).toEqual([]);
        expect(await allState(app)).toEqual({ checked: false, indeterminate: false, disabled: false, native: false });
        await app.tablesAll.click();
        expect(await tickedNames(app)).toEqual(["a1", "a2", "a3"]);
        // (by keyboard, the same: Space on the box)
        await app.tablesAll.focus();
        await app.tablesBox("a1").uncheck();
        await app.tablesAll.focus();
        await app.page.keyboard.press("Space");
        expect(await tickedNames(app)).toEqual(["a1", "a2", "a3"]);
    });

    test("it is ticked when every row that can be ticked is, and a press leaves a view that cannot be counted out", async ({ app }) => {
        await openMade(app, `create table a1(x); create table a2(x); ${GONE_VIEW("zz_gone")}`);
        await app.openTables();
        await app.waitCounted();
        expect((await app.tablesRows()).map((row) => row.tickable)).toEqual([true, true, false]);
        await app.tablesAll.click();
        expect(await tickedNames(app)).toEqual(["a1", "a2"]);
        // (every row that can be ticked is: the box is ticked, not mixed)
        expect(await allState(app)).toEqual({ checked: true, indeterminate: false, disabled: false, native: false });
        // and the view stays as it was: a press on its own box changes nothing
        await app.tablesBox("zz_gone").click({ force: true });
        expect(await tickedNames(app)).toEqual(["a1", "a2"]);
        expect(await allState(app)).toEqual({ checked: true, indeterminate: false, disabled: false, native: false });
        await app.tablesAll.click();
        expect(await tickedNames(app)).toEqual([]);
    });

    test("it is not aria-disabled while exactly one of several rows can be ticked, and a press on it ticks that row", async ({ app }) => {
        await openMade(app, `create table a_open(x); ${GONE_VIEW("gone_one")} ${GONE_VIEW("gone_two")}`);
        await app.openTables();
        await app.waitCounted();
        expect((await app.tablesRows()).map((row) => row.tickable)).toEqual([true, false, false]);
        await expect(app.tablesAll).not.toHaveAttribute("aria-disabled", /.*/);
        expect(await allState(app)).toEqual({ checked: false, indeterminate: false, disabled: false, native: false });
        await app.tablesAll.click();
        expect(await tickedNames(app)).toEqual(["a_open"]);
        expect(await allState(app)).toEqual({ checked: true, indeterminate: false, disabled: false, native: false });
        await app.tablesAll.click();
        expect(await tickedNames(app)).toEqual([]);
    });

    test("it is aria-disabled, and not disabled, when no row can be ticked", async ({ app }) => {
        await openMade(app, `${GONE_VIEW("gone_one")} ${GONE_VIEW("gone_two")}`);
        await app.openTables();
        await app.waitCounted();
        expect((await app.tablesRows()).map((row) => row.tickable)).toEqual([false, false]);
        expect(await allState(app)).toEqual({ checked: false, indeterminate: false, disabled: true, native: false });
        // nothing to ask for: Export is off, and says that nothing can be exported
        await expect(app.tablesSubmit).toHaveAttribute("aria-disabled", "true");
        await expect(app.tablesHold).toHaveText(words.EXPORT_TABLES_HOLD_NOTHING);
    });

    test("after a dialog in which no row could be ticked, the dialog opened again on rows that can be ticked has its box for all back", async ({ page, app }) => {
        await openMade(app, `${GONE_VIEW("gone_one")} ${GONE_VIEW("gone_two")}`);
        await app.openTables();
        await app.waitCounted();
        expect(await allState(app)).toEqual({ checked: false, indeterminate: false, disabled: true, native: false });
        await app.tablesCancel.click();
        await expect(app.tablesDialog).toBeHidden();
        // the tables the two views read from are made again: both views can be counted now
        await exec(page, "create table src_gone_one(a); create table src_gone_two(a); insert into src_gone_one values (1);");
        await app.openTables();
        await app.waitCounted();
        const rows = await app.tablesRows();
        expect(rows.map((row) => row.name).sort()).toEqual(["gone_one", "gone_two", "src_gone_one", "src_gone_two"]);
        expect(rows.map((row) => row.tickable), "every row of the dialog that was opened again can be ticked").toEqual([true, true, true, true]);
        // (the attribute itself: it is what dims the box and what a screen reader tells)
        await expect(app.tablesAll).not.toHaveAttribute("aria-disabled", /.*/);
        expect(await allState(app)).toEqual({ checked: false, indeterminate: false, disabled: false, native: false });
        await app.tablesAll.click();
        expect((await tickedNames(app)).sort()).toEqual(["gone_one", "gone_two", "src_gone_one", "src_gone_two"]);
        expect(await allState(app)).toEqual({ checked: true, indeterminate: false, disabled: false, native: false });
    });

    test("when every count fails the box for all keeps the focus it had, is aria-disabled and not disabled, and Space leaves it unticked", async ({ page, app }) => {
        await openMade(app, `${GONE_VIEW("gone_one")} ${GONE_VIEW("gone_two")}`);
        await app.openTables();
        await expect(app.tablesAll).toBeFocused();
        await app.waitCounted();
        expect((await app.tablesRows()).map((row) => row.tickable)).toEqual([false, false]);
        // (the counts have ended under the focus: it is still where it was)
        await expect(app.tablesAll).toBeFocused();
        expect(await focusedId(page)).toBe("export-tables-all");
        await expect(app.tablesAll).toHaveAttribute("aria-disabled", "true");
        expect(await allState(app)).toEqual({ checked: false, indeterminate: false, disabled: true, native: false });
        // Space and a click leave it as it is, and it keeps the focus
        await page.keyboard.press("Space");
        await app.tablesAll.click({ force: true });
        expect(await allState(app)).toEqual({ checked: false, indeterminate: false, disabled: true, native: false });
        expect(await tickedNames(app)).toEqual([]);
        await expect(app.tablesAll).toBeFocused();
        // and Tab goes on from it to the first row, which keeps its place too
        await page.keyboard.press("Tab");
        await expect(app.tablesBox("gone_one")).toBeFocused();
    });
});

// ---- 3. the line beside Export, and Export when it is off ------------------------------------------------------

test.describe("the line beside Export and Export when it is off", () => {
    test("the line is a status that is always there and whose text is set: counting, nothing ticked, and what Export will save", async ({ page, app }) => {
        await openMade(app, manyTables(60));
        await slowDown(page);
        await app.openTables();
        // the element is marked: if it were ever replaced by another one the mark would be gone
        await app.tablesHold.evaluate((node) => (node.dataset.mark = "first"));
        await expect(app.tablesHold).toHaveAttribute("role", "status");
        await expect(app.tablesHold).toHaveText(words.EXPORT_TABLES_HOLD_COUNTING);
        await app.waitCounted();
        await expect(app.tablesHold).toHaveText(words.EXPORT_TABLES_HOLD_NONE);
        await app.tickTables(["t002"]);
        await expect(app.tablesHold).toHaveText(words.exportTablesWillSaveText({ kind: "file", fileName: "t002.csv", entries: [{ name: "t002.csv" }] }));
        await app.tickTables(["t001", "t003"]);
        const zipName = await app.tablesDialog.locator("#export-tables-hold").textContent();
        expect(zipName).toMatch(/^Saves .+-tables\.zip, with 3 CSV files\.$/);
        expect(zipName).toBe(words.exportTablesWillSaveText({ kind: "zip", fileName: /^Saves (.+), with/.exec(zipName)[1], entries: [1, 2, 3] }));
        await app.tablesBox("t001").uncheck();
        await app.tablesBox("t003").uncheck();
        await app.tablesBox("t002").uncheck();
        await expect(app.tablesHold).toHaveText(words.EXPORT_TABLES_HOLD_NONE);
        // (one element all along)
        await expect(app.tablesHold).toHaveAttribute("data-mark", "first");
        expect(await app.tablesDialog.locator("#export-tables-hold").count()).toBe(1);
    });

    test("a tick that changes no words writes nothing: not the line beside Export while the counts run, and not the line of any row", async ({ page, app }) => {
        // (The line beside Export is a status: a screen reader tells of it each time it is written, the same
        // words again included. And the lines of a long list are not made again for one tick.)
        await openMade(app, manyTables(5));
        // From inside the page, in the moment the first row has its count and the others have not: its box is
        // ticked, and what that one press wrote is read before anything else can write (a press, the change it
        // makes and what the page does about it are one step; the observers hand over what they hold at once).
        await page.evaluate(
            ({ counting }) => {
                const dialog = document.querySelector("#export-tables-dialog");
                const list = dialog.querySelector(".tables-list");
                const hold = dialog.querySelector("#export-tables-hold");
                const seen = { done: false };
                window.__tick = seen;
                const all = { childList: true, subtree: true, characterData: true };
                const holdWrites = new MutationObserver(() => {});
                holdWrites.observe(hold, all);
                const lineWrites = new MutationObserver(() => {});
                lineWrites.observe(list, all);
                new MutationObserver(() => {
                    const lines = [...list.querySelectorAll(".tables-row-line")];
                    if (seen.done || !lines.length || lines[0].textContent.includes(counting)) {
                        return;
                    }
                    seen.done = true;
                    seen.stillCounted = lines.filter((line) => line.textContent.includes(counting)).length;
                    seen.holdBefore = hold.textContent;
                    seen.lineBefore = lines[0].textContent;
                    // (what was written before the press is not the press's)
                    holdWrites.takeRecords();
                    lineWrites.takeRecords();
                    const box = list.querySelector(".tables-row-box");
                    box.click();
                    seen.ticked = box.checked;
                    seen.holdWrites = holdWrites.takeRecords().length;
                    seen.lineWrites = lineWrites.takeRecords().length;
                    seen.holdAfter = hold.textContent;
                    seen.lineAfter = lines[0].textContent;
                }).observe(list, all);
            },
            { counting: words.EXPORT_TABLES_COUNTING }
        );
        await app.openTables();
        await app.waitCounted();
        const seen = await page.evaluate(() => window.__tick);
        // the moment was the one meant: the first row counted and ticked by the press, the others not counted yet
        expect(seen.done, "the first row was seen with its count while the others were being counted").toBe(true);
        expect(seen.stillCounted, "rows still being counted at the press").toBeGreaterThan(0);
        expect(seen.ticked, "the press ticked the first row").toBe(true);
        expect(seen.holdBefore).toBe(words.EXPORT_TABLES_HOLD_COUNTING);
        expect(seen.holdAfter).toBe(words.EXPORT_TABLES_HOLD_COUNTING);
        expect(seen.lineAfter).toBe(seen.lineBefore);
        expect(seen.holdWrites, "writes into the line beside Export by a tick that leaves its words as they are").toBe(0);
        expect(seen.lineWrites, "writes into the lines of the rows by a tick that changes none of them").toBe(0);
        // (the tick itself was taken: once the counts are in, the line says what it will save)
        expect(await tickedNames(app)).toEqual(["t001"]);
        await expect(app.tablesHold).toHaveText(words.exportTablesWillSaveText({ kind: "file", fileName: "t001.csv", entries: [{ name: "t001.csv" }] }));
    });

    test("with the fixture: one table saves its CSV, several save the zip named after the database, and the count of files is the count of ticks", async ({ app }) => {
        await openEdgeCases(app);
        await app.openTables();
        await app.waitCounted();
        await app.tickTables(["basic"]);
        await expect(app.tablesHold).toHaveText(words.exportTablesWillSaveText({ kind: "file", fileName: "basic.csv", entries: [{}] }));
        await app.tickTables(["dates_iso", "sales/2024"]);
        await expect(app.tablesHold).toHaveText(words.exportTablesWillSaveText({ kind: "zip", fileName: "export_edge_cases-tables.zip", entries: [{}, {}, {}] }));
        // (a press on the tick box for all, while it is mixed, ticks the rest)
        await app.tablesAll.click();
        await expect(app.tablesHold).toHaveText(words.exportTablesWillSaveText({ kind: "zip", fileName: "export_edge_cases-tables.zip", entries: new Array(14).fill({}) }));
    });

    test("Export is aria-disabled, never disabled, reachable by Tab and described by the line while it is off", async ({ page, app }) => {
        await openEdgeCases(app);
        await app.openTables();
        await app.waitCounted();
        await expect(app.tablesSubmit).toHaveAttribute("aria-disabled", "true");
        expect(await app.tablesSubmit.evaluate((button) => ({ disabled: button.disabled, hasAttribute: button.hasAttribute("disabled") }))).toEqual({ disabled: false, hasAttribute: false });
        await expect(app.tablesSubmit).toHaveAttribute("aria-describedby", "export-tables-hold");
        await expect(app.tablesSubmit).toHaveAccessibleDescription(words.EXPORT_TABLES_HOLD_NONE);
        // keys only: Tab reaches it
        await app.tablesAll.focus();
        expect(await tabTo(page, "#export-tables-submit")).toBe(true);
        await expect(app.tablesSubmit).toBeFocused();
        // and when it is on it still has the description, now what it saves
        await app.tablesBox("basic").check();
        await expect(app.tablesSubmit).toHaveAttribute("aria-disabled", "false");
        await expect(app.tablesSubmit).toHaveAccessibleDescription(words.exportTablesWillSaveText({ kind: "file", fileName: "basic.csv", entries: [{}] }));
    });

    test("a press on Export while it is off does nothing: no progress, no file, no message, no event; by mouse and by keyboard", async ({ page, app }) => {
        await openEdgeCases(app);
        const downloads = recordDownloads(page);
        await app.openTables();
        await app.waitCounted();
        await app.recordToasts();
        await app.tablesSubmit.click({ force: true });
        await app.tablesSubmit.focus();
        await page.keyboard.press("Enter");
        await page.keyboard.press("Space");
        await page.waitForTimeout(400);
        await expect(app.tablesProgress).toBeHidden();
        await expect(app.tablesError).toBeHidden();
        await expect(app.tablesDialog).toBeVisible();
        await expect(app.tablesSubmit).toBeVisible();
        expect(downloads).toEqual([]);
        await app.expectToasts([], { settle: 100 });
        expect(await eventsOfOpen(page)).toEqual([]);
    });

    test("while the counts run, with a table ticked, a press on Export does nothing either; once they have ended it does", async ({ page, app }) => {
        await openMade(app, manyTables(60));
        await slowDown(page);
        const downloads = recordDownloads(page);
        await app.openTables();
        await app.tablesBox("t001").check();
        await expect(app.tablesSubmit).toHaveAttribute("aria-disabled", "true");
        await expect(app.tablesHold).toHaveText(words.EXPORT_TABLES_HOLD_COUNTING);
        const before = await counted(app);
        expect(before).toBeLessThan(60);
        await app.tablesSubmit.click({ force: true });
        await app.tablesSubmit.focus();
        await page.keyboard.press("Enter");
        await expect(app.tablesProgress).toBeHidden();
        expect(downloads).toEqual([]);
        // (the counts were still running: the press did not wait for them either)
        expect(await counted(app)).toBeLessThan(60);
        await app.waitCounted();
        await expect(app.tablesSubmit).toHaveAttribute("aria-disabled", "false");
        const file = await app.download(() => app.tablesSubmit.click());
        expect(file.name).toBe("t001.csv");
        expect(downloads).toEqual(["t001.csv"]);
    });

    test("when no row can be ticked the line says so, for a single view that cannot be counted too; with a row that can be ticked it still says to tick one", async ({ page, app }) => {
        // one view whose table is gone: its box cannot be ticked, and the line is not asking for a tick
        await openMade(app, GONE_VIEW("only_gone"));
        await app.openTables();
        await app.waitCounted();
        expect((await app.tablesRows()).map((row) => row.tickable)).toEqual([false]);
        await expect(app.tablesHold).toHaveText(words.EXPORT_TABLES_HOLD_NOTHING);
        await expect(app.tablesSubmit).toHaveAttribute("aria-disabled", "true");
        await expect(app.tablesSubmit).toHaveAccessibleDescription(words.EXPORT_TABLES_HOLD_NOTHING);
        await app.tablesCancel.click();
        // a row that can be ticked beside it: the line asks for a tick, and then says what is saved
        await openMade(app, `create table a1(x); insert into a1 values (1); ${GONE_VIEW("zz_gone")}`);
        await app.openTables();
        await app.waitCounted();
        await expect(app.tablesHold).toHaveText(words.EXPORT_TABLES_HOLD_NONE);
        await app.tablesBox("a1").check();
        await expect(app.tablesHold).toHaveText(words.exportTablesWillSaveText({ kind: "file", fileName: "a1.csv", entries: [{}] }));
        await app.tablesBox("a1").uncheck();
        await expect(app.tablesHold).toHaveText(words.EXPORT_TABLES_HOLD_NONE);
        await app.tablesCancel.click();
        // the only row that could be counted fails to be read: nothing is left to tick
        await openMade(app, `${BAD_VIEW("only_bad")} ${GONE_VIEW("zz_gone")}`);
        await app.openTables();
        await app.waitCounted();
        await expect(app.tablesHold).toHaveText(words.EXPORT_TABLES_HOLD_NONE);
        await app.tickTables(["only_bad"]);
        await app.tablesSubmit.click();
        await expect(app.tablesError).toHaveText(words.exportTablesFailedText("only_bad", "integer overflow"));
        expect((await app.tablesRows()).map((row) => row.tickable)).toEqual([false, false]);
        await expect(app.tablesHold).toHaveText(words.EXPORT_TABLES_HOLD_NOTHING);
        await expect(app.tablesSubmit).toHaveAttribute("aria-disabled", "true");
        await expect(app.tablesSubmit).toHaveAccessibleDescription(words.EXPORT_TABLES_HOLD_NOTHING);
        expect(await allState(app)).toEqual({ checked: false, indeterminate: false, disabled: true, native: false });
    });
});

// ---- 4. the counts ---------------------------------------------------------------------------------------------

test.describe("the counts", () => {
    test("a row says it is being counted until it is; Export is off until every count has ended; ticks can be changed meanwhile and are kept", async ({ page, app, pageErrors }) => {
        await openMade(app, manyTables(80));
        await slowDown(page);
        await watchDialog(page);
        await app.openTables();
        // at the start every row says it is being counted, and the last one does for a while
        const early = await app.tablesRows();
        expect(early).toHaveLength(80);
        expect(early.at(-1).line).toBe(words.EXPORT_TABLES_COUNTING);
        await expect(app.tablesSubmit).toHaveAttribute("aria-disabled", "true");
        await expect(app.tablesHold).toHaveText(words.EXPORT_TABLES_HOLD_COUNTING);
        // ticks are taken meanwhile: a row that has not been counted, and one that has
        await app.tablesBox("t080").check();
        await expect(app.tablesBox("t080")).toBeChecked();
        await expect.poll(() => counted(app)).toBeGreaterThan(0);
        await app.tablesBox("t001").check();
        expect(await counted(app)).toBeLessThan(80);
        await expect(app.tablesSubmit).toHaveAttribute("aria-disabled", "true");
        await expect(app.tablesHold).toHaveText(words.EXPORT_TABLES_HOLD_COUNTING);
        // the counts end: Export is on, the ticks are as they were set, and every row has its count
        await app.waitCounted();
        await expect(app.tablesSubmit).toHaveAttribute("aria-disabled", "false");
        expect(await tickedNames(app)).toEqual(["t001", "t080"]);
        expect((await app.tablesRows()).every((row) => row.line.startsWith(words.exportTablesRowsText(1)))).toBe(true);
        // (at no time was Export on while a row still said it was being counted)
        expect((await watched(page)).violations).toEqual([]);
        expect(pageErrors).toEqual([]);
    });

    test("the page has a turn between two counts: forty tables are counted one at a time, and never two in one go", async ({ page, app }) => {
        await openMade(app, manyTables(40));
        await watchDialog(page);
        await app.openTables();
        await app.waitCounted();
        // every time the page looked at the list one more row had its count: 0, 1, 2 ... 40
        expect((await watched(page)).steps).toEqual(Array.from({ length: 41 }, (_, i) => i));
    });

    test("a click is answered while the counts run, and a tick made in the middle of them is kept", async ({ page, app }) => {
        await openMade(app, manyTables(60));
        await slowDown(page);
        await app.openTables();
        await app.tablesAll.focus();
        // (keys and the mouse both reach the page between two counts)
        await page.keyboard.press("Tab");
        await page.keyboard.press("Space");
        await expect(app.tablesBox("t001")).toBeChecked();
        expect(await counted(app)).toBeLessThan(60);
        await app.tablesBox("t002").click();
        await expect(app.tablesBox("t002")).toBeChecked();
        await app.waitCounted();
        expect(await tickedNames(app)).toEqual(["t001", "t002"]);
    });

    test("a view that cannot be counted: its reason is in its row, its box cannot be ticked and keeps its place in the Tab order, and the tick it had is lost", async ({ page, app }) => {
        await openMade(app, `create table a1(x); create table a2(x); ${manyTables(40, "m")} ${GONE_VIEW("zz_gone")}`);
        await slowDown(page);
        await app.openTables();
        // ticked while its count is on its way: the box takes the tick (it was not known to be at fault)
        await app.tablesBox("zz_gone").check();
        await expect(app.tablesBox("zz_gone")).toBeChecked();
        await app.waitCounted();
        const row = (await app.tablesRows()).find((one) => one.name === "zz_gone");
        // the reason is the engine's, after our words; the tick is gone
        expect(row.line).toBe(words.exportTablesUncountedText("no such table: main.src_zz_gone"));
        expect(row.ticked).toBe(false);
        expect(row.tickable).toBe(false);
        expect(await tickedNames(app)).toEqual([]);
        await expect(app.tablesHold).toHaveText(words.EXPORT_TABLES_HOLD_NONE);
        // aria-disabled, not disabled: a keyboard user can arrive and read the reason
        const box = app.tablesBox("zz_gone");
        await expect(box).toHaveAttribute("aria-disabled", "true");
        expect(await box.evaluate((el) => ({ disabled: el.disabled, tabIndex: el.tabIndex }))).toEqual({ disabled: false, tabIndex: 0 });
        const id = await box.getAttribute("id");
        await app.tablesAll.focus();
        expect(await tabTo(page, `#${id}`)).toBe(true);
        await expect(box).toBeFocused();
        await expect(box).toHaveAccessibleDescription(words.exportTablesUncountedText("no such table: main.src_zz_gone"));
        // a press on it, with the mouse and with the keyboard, leaves it as it is
        await box.click({ force: true });
        await page.keyboard.press("Space");
        await expect(box).not.toBeChecked();
        expect(await tickedNames(app)).toEqual([]);
        await expect(app.tablesHold).toHaveText(words.EXPORT_TABLES_HOLD_NONE);
        await expect(app.tablesSubmit).toHaveAttribute("aria-disabled", "true");
    });

    test("the tick box for all leaves out the view that cannot be counted, and what Export will save counts the others only", async ({ app }) => {
        await openMade(app, `create table a1(x); create table a2(x); ${GONE_VIEW("zz_gone")}`);
        await app.openTables();
        await app.waitCounted();
        await app.tablesAll.click();
        expect(await tickedNames(app)).toEqual(["a1", "a2"]);
        await expect(app.tablesHold).toHaveText(words.exportTablesWillSaveText({ kind: "zip", fileName: "new-tables.zip", entries: [{}, {}] }));
        // and the zip it makes has the two
        const file = await app.download(() => app.tablesSubmit.click());
        expect(file.name).toBe("new-tables.zip");
        expect(readZip(file.buffer).map((entry) => entry.name)).toEqual(["a1.csv", "a2.csv"]);
    });

    test("a count that fails brings the box for all in line at once, before the last count is in", async ({ page, app }) => {
        await openMade(app, `create table t001(a); ${GONE_VIEW("t002")} create table t003(a);`);
        // From inside the page, in the moment after each write to the list (so that no turn of the machine
        // is waited for): once the first row has its count the first and the third boxes are ticked, and
        // when the second row says why it cannot be counted the box for all is read, with the third row
        // still waiting for its count.
        await page.evaluate(
            ({ counting, uncounted }) => {
                const dialog = document.querySelector("#export-tables-dialog");
                const seen = { ticked: false, all: null };
                window.__seen = seen;
                new MutationObserver(() => {
                    const rows = [...dialog.querySelectorAll(".tables-row")];
                    if (rows.length !== 3) {
                        return;
                    }
                    const line = (row) => row.querySelector(".tables-row-line").textContent;
                    const box = (row) => row.querySelector("input.tables-row-box");
                    if (!seen.ticked && !line(rows[0]).includes(counting)) {
                        seen.ticked = true;
                        box(rows[0]).click();
                        box(rows[2]).click();
                    }
                    if (seen.ticked && seen.all === null && line(rows[1]).startsWith(uncounted)) {
                        const all = dialog.querySelector("#export-tables-all");
                        seen.all = { checked: all.checked, indeterminate: all.indeterminate, third: line(rows[2]) };
                    }
                }).observe(dialog, { childList: true, subtree: true, characterData: true });
            },
            { counting: words.EXPORT_TABLES_COUNTING, uncounted: uncountedWords() }
        );
        await app.openTables();
        await app.waitCounted();
        const seen = await page.evaluate(() => window.__seen);
        expect(seen.ticked, "the two boxes were ticked while the counts went on").toBe(true);
        // (the two rows that can be ticked are ticked: the box is ticked, and not mixed, when the reason appears)
        expect(seen.all, "the box for all, in the moment the second row says why it cannot be counted").toEqual({ checked: true, indeterminate: false, third: words.EXPORT_TABLES_COUNTING });
        expect(await tickedNames(app)).toEqual(["t001", "t003"]);
        expect(await allState(app)).toEqual({ checked: true, indeterminate: false, disabled: false, native: false });
    });

    test("counting does not go through the whole list for each count: 300 tables cost a few times 300 writes to the tick boxes, not 300 times 300", async ({ page, app }) => {
        test.slow();
        await openMade(app, manyTables(300));
        // every write of an attribute to a tick box of a row is counted, from before the list is made
        await page.evaluate(() => {
            window.__boxWrites = 0;
            for (const name of ["setAttribute", "removeAttribute"]) {
                const real = Element.prototype[name];
                Element.prototype[name] = function (...args) {
                    if (this.classList.contains("tables-row-box")) {
                        window.__boxWrites++;
                    }
                    return real.apply(this, args);
                };
            }
        });
        await app.openTables();
        await app.waitCounted();
        const writes = await page.evaluate(() => window.__boxWrites);
        // (the boxes were written: the count looks at something. Making the list, counting each row and the last look
        // at the whole list are about three writes a row; a look at the whole list after every count is 300 each)
        expect(writes).toBeGreaterThanOrEqual(300);
        expect(writes, `${writes} writes to the boxes of 300 rows`).toBeLessThan(10 * 300);
    });

    test("when counting itself throws, the rows without a count say why, a row that already said why keeps its own words, counting ends, Export follows the ticks, and the dialog does not go on saying it counts", async ({ page, app, pageErrors }) => {
        // (t002_gone is a view whose table is gone: it comes third, between t002 and t003)
        await openMade(app, `${manyTables(6)} ${GONE_VIEW("t002_gone")}`);
        const debugged = [];
        page.on("console", (message) => {
            if (message.type() === "debug" && message.text().startsWith("the tables could not be counted")) {
                debugged.push(message.text());
            }
        });
        // the box of the fourth row throws once, when its count is written: the first time it is written is
        // when the list is made (a box is written whenever a row is painted), and the second is when the
        // third row, the view, has failed to be counted and every row is painted again
        await page.evaluate(() => {
            const real = Element.prototype.removeAttribute;
            let writes = 0;
            Element.prototype.removeAttribute = function (...args) {
                if (this.id === "export-tables-row-3" && ++writes === 2) {
                    throw new Error("the fourth row broke");
                }
                return real.apply(this, args);
            };
        });
        await app.openTables();
        await app.waitCounted();
        const rows = await app.tablesRows();
        expect(rows.map((row) => row.name)).toEqual(["t001", "t002", "t002_gone", "t003", "t004", "t005", "t006"]);
        // the rows that were counted say so; the view says what the engine said of it, and keeps it; the others say
        // why they are not counted, and cannot be ticked
        expect(rows.map((row) => row.line)).toEqual([
            ...[1, 2].map(() => words.exportTablesRowsText(1)),
            words.exportTablesUncountedText("no such table: main.src_t002_gone"),
            ...[4, 5, 6, 7].map(() => words.exportTablesUncountedText("the fourth row broke")),
        ]);
        expect(rows.map((row) => row.tickable)).toEqual([true, true, false, false, false, false, false]);
        // and the page keeps one trace of why counting broke, for whoever looks into it
        await expect.poll(() => debugged.length, { message: "the debug messages in the console that begin with what the page says of it" }).toBe(1);
        // the dialog is not left counting, and Export follows what is ticked
        await expect(app.tablesHold).not.toHaveText(words.EXPORT_TABLES_HOLD_COUNTING);
        await expect(app.tablesHold).toHaveText(words.EXPORT_TABLES_HOLD_NONE);
        await expect(app.tablesSubmit).toHaveAttribute("aria-disabled", "true");
        await app.tickTables(["t001"]);
        await expect(app.tablesSubmit).toHaveAttribute("aria-disabled", "false");
        await expect(app.tablesHold).toHaveText(words.exportTablesWillSaveText({ kind: "file", fileName: "t001.csv", entries: [{}] }));
        const file = await app.download(() => app.tablesSubmit.click());
        expect(file.name).toBe("t001.csv");
        expect(pageErrors).toEqual([]);
    });
});

// ---- 5. counts that arrive late -------------------------------------------------------------------------------

test.describe("counts that arrive after the dialog has gone", () => {
    test("after it was closed: no more rows are counted, nothing wrong is shown, and the page has no error", async ({ page, app, pageErrors }) => {
        // (a view that cannot be counted, a little way down the list: counted in the closed dialog, it would say why)
        await openMade(app, `${manyTables(120)} ${GONE_VIEW("t020_gone")}`);
        await slowDown(page);
        await app.recordToasts();
        await app.openTables();
        await expect.poll(() => counted(app)).toBeGreaterThan(5);
        await app.tablesCancel.click();
        await expect(app.tablesDialog).toBeHidden();
        const frozen = await counted(app);
        await page.waitForTimeout(700);
        expect(await counted(app)).toBe(frozen);
        expect(frozen).toBeLessThan(120);
        await expect(app.tablesDialog).not.toContainText(uncountedWords());
        expect(await errorCleared(page)).toEqual({ hidden: true, text: "" });
        await app.expectToasts([]);
        expect(pageErrors).toEqual([]);
    });

    test("after it was closed and opened again: the second list is counted from the start, Export is never on before its own counts have ended, and the first one's end does not end them", async ({ page, app, pageErrors }) => {
        await openMade(app, manyTables(120));
        await slowDown(page);
        await watchDialog(page);
        await app.openTables();
        await expect.poll(() => counted(app)).toBeGreaterThan(8);
        const first = await counted(app);
        await page.keyboard.press("Escape");
        await expect(app.tablesDialog).toBeHidden();
        await app.openTables();
        // a new list: nothing counted yet, in new rows
        expect(await counted(app)).toBeLessThan(first);
        await expect(app.tablesSubmit).toHaveAttribute("aria-disabled", "true");
        await app.tablesBox("t001").check();
        // the first dialog's counts would end before these: the line must not give way to them
        await expect.poll(() => counted(app)).toBeGreaterThan(first + 3);
        await expect(app.tablesSubmit).toHaveAttribute("aria-disabled", "true");
        await expect(app.tablesHold).toHaveText(words.EXPORT_TABLES_HOLD_COUNTING);
        await app.waitCounted();
        await expect(app.tablesSubmit).toHaveAttribute("aria-disabled", "false");
        expect(await tickedNames(app)).toEqual(["t001"]);
        expect((await watched(page)).violations).toEqual([]);
        expect(pageErrors).toEqual([]);
    });

    test("a count that ends in the very task in which its dialog was closed and opened again leaves the new dialog alone: Export is never on while its row is still being counted", async ({ page, app, pageErrors }) => {
        // one table: its count is the last of the list, and the loop that made it has no look at the dialog
        // after it, but its end
        await openMade(app, "create table only_one(a); insert into only_one values (1), (2);");
        await watchDialog(page);
        // From inside the page, in the moment the first row has lost its words about counting (the loop is
        // not yet at its end): Cancel and the menu entry are pressed, in one task, so that the new dialog is
        // on screen, counting, when the first loop gets to its end.
        await page.evaluate(
            ({ counting }) => {
                const dialog = document.querySelector("#export-tables-dialog");
                window.__again = false;
                new MutationObserver(() => {
                    const line = dialog.querySelector(".tables-row-line");
                    if (!window.__again && line && !line.textContent.includes(counting)) {
                        window.__again = true;
                        document.querySelector("#export-tables-cancel").click();
                        document.querySelector("#export-button").click();
                        document.querySelector("#export-tables").click();
                    }
                }).observe(dialog, { childList: true, subtree: true, characterData: true });
            },
            { counting: words.EXPORT_TABLES_COUNTING }
        );
        await app.openTables();
        await page.waitForFunction(() => window.__again);
        await expect(app.tablesDialog).toBeVisible();
        await app.waitCounted();
        expect((await watched(page)).violations, "the moments at which Export was on while the new dialog's row was being counted").toEqual([]);
        // the second dialog was counted by its own loop: its row has its count, and Export saves the table
        expect((await app.tablesRows()).map((row) => row.line)).toEqual([words.exportTablesRowsText(2)]);
        await expect(app.tablesSubmit).toHaveAttribute("aria-disabled", "false");
        expect(pageErrors).toEqual([]);
    });

    test("after another database has opened under it (Back): the dialog closes, its counts stop, nothing wrong is shown, and the next dialog is the new database's", async ({ page, app, pageErrors }) => {
        test.skip(!OTHER_DATASET, "only one course database ships");
        await app.open(`./?db=${OTHER_DATASET.id}&${flagState("export")}`);
        const first = await page.evaluate(() => window.app.database.name);
        await app.pickDatabaseById(DEFAULT_DATASET.id);
        await expect(app.databaseLabel).toHaveText(DEFAULT_DATASET.name);
        await exec(page, manyTables(120, "late_"));
        await slowDown(page);
        const handle = await page.evaluateHandle(() => window.app.database);
        await app.openTables();
        await expect.poll(() => counted(app)).toBeGreaterThan(5);
        await page.goBack();
        await page.waitForFunction((old) => window.app.database !== old, handle);
        await app.waitReady();
        await expect(app.tablesDialog).toBeHidden();
        expect(await page.evaluate(() => window.app.database.name)).toBe(first);
        const frozen = await counted(app);
        await page.waitForTimeout(700);
        expect(await counted(app)).toBe(frozen);
        expect(frozen).toBeLessThan(121);
        await expect(app.tablesDialog).not.toContainText(uncountedWords());
        expect(await errorCleared(page)).toEqual({ hidden: true, text: "" });
        expect(pageErrors).toEqual([]);
        // the dialog that opens next is the open database's, counted from the start
        await app.openTables();
        await app.waitCounted();
        const names = (await app.tablesRows()).map((row) => row.name);
        expect(names.some((name) => name.startsWith("late_"))).toBe(false);
        expect(names.length).toBeGreaterThan(3);
    });
});

// ---- 6. the dialog is not offered ----------------------------------------------------------------------------

test.describe("the dialog is not opened when it cannot be of use: a toast says why", () => {
    // the entry of the Export menu is chosen; the dialog stays shut and the one toast is the reason
    async function expectRefused(page, app, message) {
        await app.recordToasts();
        await app.openExportMenu();
        await app.tablesItem.click();
        await expect(app.toast).toContainText(message);
        await expect(app.tablesDialog).toBeHidden();
        expect(await page.evaluate(() => document.querySelector("#export-tables-dialog").open)).toBe(false);
        // (a note: nothing was done, and why)
        await expect(app.toast.locator(".toast")).toHaveClass(/toast--note/);
        await app.expectToasts([message]);
    }

    test("with no database open: the page's own words for it", async ({ page, app }) => {
        const { NO_DATABASE_MESSAGE } = await load("config.js");
        await page.goto(`./?${flagState("export")}#datasets/gone.db`);
        await expect(app.errorBand).toContainText("Failed to load database from URL datasets/gone.db");
        await expectRefused(page, app, NO_DATABASE_MESSAGE);
    });

    test("with no table or view: the database is empty", async ({ page, app }) => {
        await openMade(app, "");
        await expectRefused(page, app, words.EXPORT_TABLES_NONE_MESSAGE);
    });

    test("with nothing but the objects the engine keeps for itself (sqlite_sequence): the same, they do not count", async ({ page, app }) => {
        await openMade(app, "create table c(id integer primary key autoincrement, a); insert into c(a) values (1); drop table c;");
        expect(await app.rows("select name from sqlite_schema order by name")).toEqual([["sqlite_sequence"]]);
        await expectRefused(page, app, words.EXPORT_TABLES_NONE_MESSAGE);
    });

    test("while a database is loading", async ({ page, app }) => {
        test.skip(!OTHER_DATASET, "only one course database ships");
        await app.open(`./?db=${OTHER_DATASET.id}&${flagState("export")}`);
        const held = await holdDataset(page);
        await app.pickDatabaseById(DEFAULT_DATASET.id);
        await held.requested;
        await expect(app.pane).toHaveAttribute("data-state", "loading");
        await app.recordToasts();
        await app.openExportMenu();
        await app.tablesItem.click();
        await expect.poll(() => app.toasts()).toContain(words.EXPORT_TABLES_LOADING_MESSAGE);
        await expect(app.tablesDialog).toBeHidden();
        held.release();
        await expect(app.databaseLabel).toHaveText(DEFAULT_DATASET.name);
        await app.waitReady();
        // once it has opened the dialog is offered
        await app.openTables();
        await expect(app.tablesDialog).toBeVisible();
    });

    test("while an import runs: the import's own message, and the dialog is offered when the import has ended", async ({ page, app }) => {
        await app.open(`./?${flagState("import", "export")}`);
        const held = await holdVendor(page, "papaparse.min.js", { pass: 1 });
        await app.chooseFiles([{ name: "people.csv", mimeType: "text/csv", buffer: Buffer.from("id,name\n1,Ada\n2,Grace\n") }]);
        await expect(app.importDialog).toBeVisible();
        await expect(app.importDialog.locator(".import-reading")).toHaveCount(0);
        // (the reader is taken off the page, so that the import has to ask for it again, and waits)
        await page.evaluate(() => {
            delete window.Papa;
        });
        await expect(app.importSubmit).toBeEnabled();
        await app.importSubmit.click();
        await expect(app.importDialog.locator(".import-progress")).toBeVisible();
        await app.recordToasts();
        await page.evaluate(() => {
            document.querySelector("#export-button").click();
            document.querySelector("#export-tables").click();
        });
        await expect(app.tablesDialog).toBeHidden();
        await app.expectToasts([words.IMPORT_BUSY_MESSAGE]);
        held.open();
        await expect(app.importDialog).toBeHidden();
        await expect(app.pane).toHaveAttribute("data-state", "report");
        await app.openTables();
        await app.waitCounted();
        expect((await app.tablesRows()).map((row) => row.name)).toEqual(["people"]);
    });

    test("while its own earlier run has not yet ended (Cancel was pressed, and the run has not looked yet): its busy message", async ({ page, app }) => {
        await openMade(app, "create table a1(x); create table a2(x);");
        // the run looks at Cancel every 100 ms while the zip tool is awaited: here every 2 s, so
        // that the refusal comes before the cancelled toast replaces it
        await page.evaluate(() => {
            const set = window.setInterval.bind(window);
            window.setInterval = (fn, ms, ...rest) => set(fn, ms === 100 ? 2000 : ms, ...rest);
        });
        const held = await holdZip(page, app, ["a1", "a2"]);
        await app.recordToasts();
        await page.evaluate(() => {
            document.querySelector("#export-tables-cancel").click();
            document.querySelector("#export-button").click();
            document.querySelector("#export-tables").click();
        });
        await expect(app.tablesDialog).toBeHidden();
        await expect.poll(() => app.toasts()).toEqual([words.EXPORT_TABLES_BUSY_MESSAGE]);
        // the run notices at its next look, says so, and then the dialog is offered again
        await expect.poll(() => app.toasts(), { timeout: 10_000 }).toEqual([words.EXPORT_TABLES_BUSY_MESSAGE, words.EXPORT_TABLES_CANCELLED_MESSAGE]);
        held.open();
        await waitUntilIdle(app);
        await app.openTables();
        await expect(app.tablesDialog).toBeVisible();
    });
});

// ---- 7. while it runs ----------------------------------------------------------------------------------------

// a small table, a big one (6,000 rows of 1,000 characters), and a small one: the big one is the
// second of three, and takes about a hundred pieces
const THREE_TABLES = `create table a_small(x); insert into a_small values (1), (2), (3);
${HEAVY("heavy")}
create table z_small(x); insert into z_small values (1), (2), (3);`;

// the text of the polite status line, every time it changes (from the moment of the call)
async function recordStatus(page) {
    await page.evaluate(() => {
        window.__said = [];
        const line = document.querySelector("#export-tables-status");
        new MutationObserver(() => {
            const text = line.textContent;
            // (every time the line is written, even with the words it had: a screen reader says them again)
            if (text) {
                window.__said.push(text);
            }
        }).observe(line, { childList: true, characterData: true, subtree: true });
    });
}
const said = (page) => page.evaluate(() => window.__said);

test.describe("while an export runs", () => {
    test("the dialog shows the table that is being exported, how far it is, a bar that agrees, and Cancel with the focus; the list and Export are hidden", async ({ page, app }) => {
        await openMade(app, THREE_TABLES);
        await slowDown(page);
        await app.openTables();
        await app.waitCounted();
        await app.tablesAll.click();
        await recordStatus(page);
        const downloaded = page.waitForEvent("download");
        await app.tablesSubmit.click();
        await expect(app.tablesProgress).toBeVisible();
        // in the middle of the second table
        await expect.poll(async () => (await progressText(app)).title, { timeout: 15_000 }).toBe(words.exportTablesProgressTitle(2, 3, "heavy"));
        await expect.poll(() => rowsWritten(app)).toBeGreaterThan(100);
        // (one reading of the block: the rows, the bar and the heading are of one moment)
        const mid = await progressText(app);
        const done = Number(/^[\d,]+/.exec(mid.part)[0].replace(/,/g, ""));
        expect(mid.title).toBe(words.exportTablesProgressTitle(2, 3, "heavy"));
        expect(mid.part).toBe(words.exportTablesProgressRows(done, 6000));
        expect(mid.part).toMatch(/^[\d,]+ of 6,000 rows$/);
        // (the bar is what is done of the whole job: 3 rows of the first table, `done` of this one, of 6,006)
        expect(mid.max).toBe(1);
        expect(mid.value).toBeGreaterThan(0);
        expect(mid.value).toBeLessThan(1);
        expect(mid.value).toBeCloseTo((3 + done) / 6006, 6);
        // the block is busy, and the dialog is not; the bar is named by the heading
        await expect(app.tablesProgress).toHaveAttribute("aria-busy", "true");
        expect(await app.tablesDialog.evaluate((dialog) => dialog.hasAttribute("aria-busy"))).toBe(false);
        expect(await app.tablesProgress.locator("progress").getAttribute("aria-labelledby")).toBe("export-tables-progress-title");
        await expect(app.tablesProgress.locator("progress")).toHaveAccessibleName(words.exportTablesProgressTitle(2, 3, "heavy"));
        // the list, the tick box for all, the line and Export are gone; Cancel is there, and has the focus
        await expect(app.tablesDialog.locator(".tables-list")).toBeHidden();
        await expect(app.tablesAll).toBeHidden();
        await expect(app.tablesHold).toBeHidden();
        await expect(app.tablesSubmit).toBeHidden();
        await expect(app.tablesCancel).toBeVisible();
        await expect(app.tablesCancel).toHaveText(words.EXPORT_TABLES_CANCEL_TEXT);
        await expect(app.tablesCancel).toBeFocused();
        // the polite line is outside the block that is busy, and is a status
        const outside = await app.tablesDialog.locator("#export-tables-status").evaluate((line) => ({ role: line.getAttribute("role"), inside: Boolean(line.closest(".tables-progress")) }));
        expect(outside).toEqual({ role: "status", inside: false });
        // the end: the file is saved, the dialog closes, and the block is no longer busy
        expect((await downloaded).suggestedFilename()).toBe("new-tables.zip");
        await expect(app.tablesDialog).toBeHidden();
        // (and a dialog that opens next is not busy)
        await app.openTables();
        await expect(app.tablesProgress).toBeHidden();
        await expect(app.tablesProgress).not.toHaveAttribute("aria-busy", "true");
        // the line said the zip tool, and then the name of each table once, and never a number
        expect(await said(page)).toEqual([words.EXPORT_TABLES_PROGRESS_LIBRARY, words.exportTablesProgressTitle(1, 3, "a_small"), words.exportTablesProgressTitle(2, 3, "heavy"), words.exportTablesProgressTitle(3, 3, "z_small")]);
    });

    test("one table has no zip tool to wait for: its heading is the table's name alone, and the line says that once", async ({ page, app }) => {
        await openMade(app, THREE_TABLES);
        await slowDown(page);
        await app.openTables();
        await app.waitCounted();
        await app.tickTables(["heavy"]);
        await recordStatus(page);
        const downloaded = page.waitForEvent("download");
        await app.tablesSubmit.click();
        await expect.poll(() => rowsWritten(app), { timeout: 15_000 }).toBeGreaterThan(50);
        expect((await progressText(app)).title).toBe(words.exportTablesProgressTitle(1, 1, "heavy"));
        expect((await progressText(app)).title).toBe("Exporting heavy");
        const download = await downloaded;
        expect(download.suggestedFilename()).toBe("heavy.csv");
        await expect(app.tablesDialog).toBeHidden();
        expect(await said(page)).toEqual([words.exportTablesProgressTitle(1, 1, "heavy")]);
    });

    test("while the zip tool is awaited the heading says so, the second line is empty, and the bar is at the start", async ({ page, app }) => {
        await openMade(app, THREE_TABLES);
        const held = await holdZip(page, app, ["a_small", "z_small"]);
        const waiting = await progressText(app);
        expect(waiting).toEqual({ title: words.EXPORT_TABLES_PROGRESS_LIBRARY, part: "", value: 0, max: 1 });
        await expect(app.tablesProgress).toHaveAttribute("aria-busy", "true");
        await expect(app.tablesCancel).toBeFocused();
        // the zip tool arrives: the first table is shown
        const file = await app.download(async () => held.open());
        expect(readZip(file.buffer).map((entry) => entry.name)).toEqual(["a_small.csv", "z_small.csv"]);
    });

    test("when more rows come than were counted the second line gives the rows alone, and the bar stops at the end", async ({ page, app }) => {
        await openMade(app, `create table grow(x); insert into grow values (1), (2);`);
        await slowDown(page);
        await app.openTables();
        await app.waitCounted();
        // (the table grows between its count and its reading: 6,002 rows are read of 2 that were counted)
        await exec(page, `with recursive c(x) as (select 1 union all select x+1 from c where x<6000) insert into grow select x from c;`);
        const downloaded = page.waitForEvent("download");
        await app.tablesSubmit.click();
        await expect.poll(() => rowsWritten(app), { timeout: 15_000 }).toBeGreaterThan(3);
        const shown = await progressText(app);
        const done = Number(/^[\d,]+/.exec(shown.part)[0].replace(/,/g, ""));
        expect(shown.part).toBe(words.exportTablesProgressRows(done, 2));
        expect(shown.part).toBe(`${done.toLocaleString("en")} rows`);
        expect(shown.part).not.toContain(" of ");
        expect(shown.value).toBe(1);
        await downloaded;
        await expect(app.toast).toContainText(words.exportedTablesMessage("grow.csv", { rows: 6002 }));
    });

    test("a second Export after one that failed on its first table announces its own first table", async ({ page, app }) => {
        await openMade(app, `${BAD_VIEW("a_bad")} create table b_ok(x); insert into b_ok values (1); create table c_ok(x); insert into c_ok values (2);`);
        await app.openTables();
        await app.waitCounted();
        await app.tablesAll.click();
        await recordStatus(page);
        await app.tablesSubmit.click();
        // the first table fails: the zip tool was announced, and then the table that could not be read
        await expect(app.tablesError).toHaveText(words.exportTablesFailedText("a_bad", "integer overflow"));
        expect(await said(page)).toEqual([words.EXPORT_TABLES_PROGRESS_LIBRARY, words.exportTablesProgressTitle(1, 3, "a_bad")]);
        // the second press has the two that are left: its first table is announced, and then its second
        await page.evaluate(() => (window.__said = []));
        const file = await app.download(() => app.tablesSubmit.click());
        expect(readZip(file.buffer).map((entry) => entry.name)).toEqual(["b_ok.csv", "c_ok.csv"]);
        expect(await said(page)).toEqual([words.EXPORT_TABLES_PROGRESS_LIBRARY, words.exportTablesProgressTitle(1, 2, "b_ok"), words.exportTablesProgressTitle(2, 2, "c_ok")]);
    });

    test("when a run has ended, in the list (a failure) and in the note (a BLOB), the polite line holds no words of it", async ({ page, app }) => {
        await openMade(app, `${BAD_VIEW("a_bad")} create table b_blob(x); insert into b_blob values (x'00');`);
        const status = app.tablesDialog.locator("#export-tables-status");
        await app.openTables();
        await app.waitCounted();
        await app.tickTables(["a_bad"]);
        await app.tablesSubmit.click();
        // the list is back with the alert: the table that failed is not being exported any more
        await expect(app.tablesError).toHaveText(words.exportTablesFailedText("a_bad", "integer overflow"));
        await expect(app.tablesDialog.locator(".tables-list")).toBeVisible();
        await expect(status).toHaveText("");
        // the note: the table that was exported is not being exported any more either
        await app.tickTables(["b_blob"]);
        await app.tablesSubmit.click();
        await expect(app.tablesNote).toBeVisible();
        await expect(status).toHaveText("");
        // (it is still the polite line: a status, outside the block that is busy)
        await expect(status).toHaveAttribute("role", "status");
    });

    test("a second export in the same visit announces its table, as the first one did", async ({ page, app }) => {
        await openMade(app, "create table t_one(x); insert into t_one values (1); create table t_two(x); insert into t_two values (2);");
        await recordStatus(page);
        const first = await app.exportTables(["t_one"]);
        expect(first.name).toBe("t_one.csv");
        await expect(app.tablesDialog).toBeHidden();
        const second = await app.exportTables(["t_two"]);
        expect(second.name).toBe("t_two.csv");
        await expect(app.tablesDialog).toBeHidden();
        expect(await said(page)).toEqual([words.exportTablesProgressTitle(1, 1, "t_one"), words.exportTablesProgressTitle(1, 1, "t_two")]);
    });

    test("the second line of the progress of a table of one row says row, and not rows", async ({ page, app }) => {
        await openMade(app, "create table one_row(x); insert into one_row values (1);");
        // every text the line is given, one by one (a text that is written and replaced at once is kept too),
        // and every value the bar is given
        await page.evaluate(() => {
            window.__bars = [];
            const bar = document.querySelector("#export-tables-dialog progress");
            const value = Object.getOwnPropertyDescriptor(HTMLProgressElement.prototype, "value");
            Object.defineProperty(bar, "value", {
                get() {
                    return value.get.call(this);
                },
                set(number) {
                    window.__bars.push(number);
                    value.set.call(this, number);
                },
            });
            window.__parts = [];
            const part = document.querySelector("#export-tables-dialog .results-loading-size");
            new MutationObserver((records) => {
                for (const record of records) {
                    for (const node of record.addedNodes) {
                        window.__parts.push(node.textContent);
                    }
                }
            }).observe(part, { childList: true });
        });
        const file = await app.exportTables(["one_row"]);
        expect(file.name).toBe("one_row.csv");
        // (typed as the student reads it: the singular is what is pinned)
        const parts = await page.evaluate(() => window.__parts);
        expect(parts).toContain("0 of 1 row");
        expect(parts.filter((text) => text !== "")).toEqual(["0 of 1 row", "1 of 1 row"]);
        // the bar of a table of one row goes from the start to the end: it is full when its one row is written
        const bars = await page.evaluate(() => window.__bars);
        expect(bars[0], "the bar at the start").toBe(0);
        expect(bars.at(-1), "the last value the bar is given, when the one row is written").toBe(1);
    });

    test("the polite line that names the table is never drawn: it is one pixel and clipped in the list, while an export runs and at the note", async ({ page, app }) => {
        await openMade(app, `create table a_small(x); insert into a_small values (1), (2); create table b_blob(x); insert into b_blob values (x'00');`);
        // the box of the line as it is drawn: the page's own way of keeping a line for a screen reader alone
        const drawn = () =>
            app.tablesDialog.locator("#export-tables-status").evaluate((line) => {
                const box = line.getBoundingClientRect();
                const style = getComputedStyle(line);
                return { width: box.width, height: box.height, position: style.position, overflow: style.overflow, clip: style.clip };
            });
        const expectKept = async (where) => {
            const box = await drawn();
            expect(box.width, `${where}: the width of the line`).toBeLessThanOrEqual(1);
            expect(box.height, `${where}: the height of the line`).toBeLessThanOrEqual(1);
            expect(box.position, `${where}: the line is taken out of the flow`).toBe("absolute");
            expect(box.overflow, `${where}: what does not fit is cut off`).toBe("hidden");
            expect(box.clip, `${where}: the line is clipped to nothing`).toBe("rect(0px, 0px, 0px, 0px)");
        };
        const held = await holdVendor(page, ZIP_TOOL);
        await app.openTables();
        await app.waitCounted();
        await expectKept("in the list");
        await app.tablesAll.click();
        await app.tablesSubmit.click();
        await expect(app.tablesDialog.locator("#export-tables-progress-title")).toHaveText(words.EXPORT_TABLES_PROGRESS_LIBRARY);
        // (it has words to say now, and they are for the ear alone)
        await expect(app.tablesDialog.locator("#export-tables-status")).toHaveText(words.EXPORT_TABLES_PROGRESS_LIBRARY);
        await expectKept("while the export runs");
        held.open();
        await expect(app.tablesNote).toBeVisible();
        await expectKept("at the note");
    });

    test("a dialog opened again after a zip was cancelled in the middle starts clean: the polite line holds no words of the export that was cancelled", async ({ page, app }) => {
        await openMade(app, THREE_TABLES);
        await slowDown(page);
        await app.recordToasts();
        await app.openTables();
        await app.waitCounted();
        await app.tickTables(["a_small", "heavy"]);
        await app.tablesSubmit.click();
        await expect.poll(async () => (await progressText(app)).title, { timeout: 15_000 }).toBe(words.exportTablesProgressTitle(2, 2, "heavy"));
        await expect(app.tablesDialog.locator("#export-tables-status")).toHaveText(words.exportTablesProgressTitle(2, 2, "heavy"));
        await app.tablesCancel.click();
        await expect(app.tablesDialog).toBeHidden();
        // (the export notices at its next look: a new dialog is offered when it has)
        await expect(app.toast).toContainText(words.EXPORT_TABLES_CANCELLED_MESSAGE);
        await waitUntilIdle(app);
        await app.openTables();
        await expect(app.tablesDialog.locator("#export-tables-status"), "the polite line of the dialog that was opened again").toHaveText("");
    });

    // what the progress block shows in the moment it is first shown, from inside the page: the first look
    // of a student (and of a screen), before the export has given it anything of its own
    async function watchFirstLook(page) {
        await page.evaluate(() => {
            const dialog = document.querySelector("#export-tables-dialog");
            const block = dialog.querySelector(".tables-progress");
            const bar = block.querySelector("progress");
            window.__first = [];
            new MutationObserver(() => {
                if (!block.hidden) {
                    window.__first.push({ title: block.querySelector("#export-tables-progress-title").textContent, part: block.querySelector(".results-loading-size").textContent, value: bar.value });
                }
            }).observe(block, { attributes: true, attributeFilter: ["hidden"] });
        });
    }
    const firstLooks = (page) => page.evaluate(() => window.__first);

    test("the first thing the progress shows: one table is named, two say the zip tool is loaded, and each export starts at nothing", async ({ page, app }) => {
        await openMade(app, "create table one_row(x); insert into one_row values (1); create table t2(x); insert into t2 values (1), (2), (3); create table t3(x); insert into t3 values (1), (2);");
        await watchFirstLook(page);
        // two tables: the zip tool is awaited
        await app.exportTables(["t2", "t3"]);
        await expect(app.tablesDialog).toBeHidden();
        expect(await firstLooks(page), "the first look of an export of two tables").toEqual([{ title: words.EXPORT_TABLES_PROGRESS_LIBRARY, part: "", value: 0 }]);
        // (the zip has left its last words and its full bar behind in the block)
        expect(await progressText(app)).toMatchObject({ value: 1 });
        // one table, in the same visit: its own name, and the line and the bar of the zip are gone
        await app.exportTables(["one_row"]);
        await expect(app.tablesDialog).toBeHidden();
        const looks = await firstLooks(page);
        expect(looks).toHaveLength(2);
        expect(looks[1], "the first look of an export of one table, after a zip").toEqual({ title: words.exportTablesProgressTitle(1, 1, "one_row"), part: "", value: 0 });
    });
});

// ---- 8. Cancel and Escape ------------------------------------------------------------------------------------

const TWO_AND_HEAVY = `create table a_small(x); insert into a_small values (1), (2), (3);\n${HEAVY("heavy")}`;

// the points of an export at which the student can cancel; each leaves the export running, and says
// what it waits for
const POINTS = {
    "while the zip library is awaited": async (page, app) => {
        const held = await holdZip(page, app, ["a_small", "heavy"]);
        return { held };
    },
    "before the first piece": async (page, app) => {
        await app.openTables();
        await app.waitCounted();
        await app.tickTables(["a_small"]);
        // (no frame is drawn from here on, so the export waits for its first one as long as it may,
        // 250 ms, and Cancel comes first)
        await page.evaluate(() => {
            window.requestAnimationFrame = () => 0;
        });
        await app.tablesSubmit.click();
        await expect(app.tablesProgress).toBeVisible();
        return {};
    },
    "in the middle of a table": async (page, app) => {
        await slowDown(page);
        await app.openTables();
        await app.waitCounted();
        await app.tickTables(["heavy"]);
        await app.tablesSubmit.click();
        await expect.poll(() => rowsWritten(app), { timeout: 15_000 }).toBeGreaterThan(100);
        expect(await rowsWritten(app)).toBeLessThan(6000);
        return {};
    },
    "in the middle of a zip": async (page, app) => {
        await slowDown(page);
        await app.openTables();
        await app.waitCounted();
        await app.tickTables(["a_small", "heavy"]);
        await app.tablesSubmit.click();
        await expect.poll(async () => (await progressText(app)).title, { timeout: 15_000 }).toBe(words.exportTablesProgressTitle(2, 2, "heavy"));
        await expect.poll(() => rowsWritten(app)).toBeGreaterThan(100);
        return {};
    },
};
const WAYS = {
    "Cancel": (page, app) => app.tablesCancel.click(),
    "Escape": (page) => page.keyboard.press("Escape"),
};

test.describe("Cancel and Escape close the dialog at once, and the export saves nothing and records nothing", () => {
    for (const [point, start] of Object.entries(POINTS)) {
        for (const [way, press] of Object.entries(WAYS)) {
            test(`${way}, ${point}`, async ({ page, app, pageErrors }) => {
                await openMade(app, TWO_AND_HEAVY);
                const downloads = recordDownloads(page);
                const key = await logKey(page);
                const before = await snapshot(page, app);
                await app.recordToasts();
                const { held } = await start(page, app);
                await press(page, app);
                // at once: the dialog is gone before the export has noticed
                await expect(app.tablesDialog).toBeHidden({ timeout: 1000 });
                await expect(app.exportMenuButton).toBeFocused();
                // the export notices at its next look, says so in a note, and its busy state ends (the library is
                // still not here: the wait for it is looked at every 100 ms)
                await expect(app.toast).toContainText(words.EXPORT_TABLES_CANCELLED_MESSAGE);
                await expect(app.toast.locator(".toast")).toHaveClass(/toast--note/);
                held?.open();
                await expectNothingLeft(page, app, before, { logKeys: [key] });
                await app.expectToasts([words.EXPORT_TABLES_CANCELLED_MESSAGE]);
                expect(downloads).toEqual([]);
                // no statement is left open on a table: it can be dropped
                await exec(page, "drop table heavy");
                // and the next export works
                const file = await app.exportTables(["a_small"]);
                expect(file.name).toBe("a_small.csv");
                expect(downloads).toEqual(["a_small.csv"]);
                expect(pageErrors).toEqual([]);
            });
        }
    }

    test("a slow view: Cancel is honoured within a second, and the page answers a click between two pieces", async ({ page, app }) => {
        test.slow();
        await openMade(app, SLOW_VIEW("slow"));
        const downloads = recordDownloads(page);
        await app.openTables();
        await app.waitCounted();
        await expect(app.tablesRow("slow").locator(".tables-row-count")).toHaveText(words.exportTablesRowsText(1000));
        await app.tickTables(["slow"]);
        await app.tablesSubmit.click();
        await expect.poll(() => rowsWritten(app), { timeout: 15_000 }).toBeGreaterThan(2);
        // the page answers while the view is being read: a press on the block, and a round trip, each within a second
        await app.tablesProgress.evaluate((block) => {
            window.__presses = 0;
            block.addEventListener("click", () => window.__presses++);
        });
        // (a press of the mouse at the block's corner; the answer is looked for in the page itself, so that
        // what is timed is the page and not the test tool's checks of the element)
        const corner = await app.tablesProgress.boundingBox();
        const slowest = [];
        for (let i = 1; i <= 5; i++) {
            const t0 = Date.now();
            await page.mouse.click(corner.x + 4, corner.y + 4);
            while ((await page.evaluate(() => window.__presses)) < i && Date.now() - t0 < 3000) {
                await page.evaluate(() => 1);
            }
            slowest.push(Date.now() - t0);
            expect(await page.evaluate(() => window.__presses)).toBe(i);
        }
        expect(Math.max(...slowest)).toBeLessThan(1000);
        // (it goes on meanwhile)
        const first = await rowsWritten(app);
        await expect.poll(() => rowsWritten(app)).toBeGreaterThan(first);
        // Cancel: the dialog is gone, and the export has noticed, within a second
        await page.evaluate(() => {
            const region = document.querySelector("#toast-region");
            new MutationObserver(() => {
                if (region.textContent && window.__noticed === undefined) {
                    window.__noticed = performance.now();
                }
            }).observe(region, { childList: true, subtree: true, characterData: true });
            window.__cancelled = performance.now();
            document.querySelector("#export-tables-cancel").click();
        });
        await expect(app.tablesDialog).toBeHidden({ timeout: 1000 });
        await expect.poll(() => page.evaluate(() => window.__noticed ?? null), { timeout: 5000 }).not.toBeNull();
        const delay = await page.evaluate(() => window.__noticed - window.__cancelled);
        // (the toast comes 60 ms after the export has noticed)
        expect(delay).toBeLessThan(1000);
        await expect(app.toast).toContainText(words.EXPORT_TABLES_CANCELLED_MESSAGE);
        expect(downloads).toEqual([]);
        await waitUntilIdle(app);
    });

    // A closing for which the browser sends no cancel event (the page's own call of close(), as a
    // second Escape without a user's press can be): only the close event tells of it, and it is the
    // one notice. The export is told to stop and saves nothing, and a held Enter is taken away.
    test("a dialog that is closed from the page, with no Escape and no Cancel, in the middle of a table: the export stops, no file, the cancelled note, nothing recorded, and a held Enter is taken away", async ({ page, app, pageErrors }) => {
        await openMade(app, TWO_AND_HEAVY);
        const downloads = recordDownloads(page);
        const key = await logKey(page);
        const before = await snapshot(page, app);
        await app.recordToasts();
        await POINTS["in the middle of a table"](page, app);
        await watchClosing(page, "#export-tables-dialog");
        await page.evaluate(() => document.querySelector("#export-tables-dialog").close());
        await expect(app.tablesDialog).toBeHidden({ timeout: 1000 });
        await expect.poll(async () => (await closingSeen(page)).closeSeen, { message: "the browser told of the closing" }).toBe(true);
        // the guard of a held Enter, which the close event is the only one to put on (read at once: an
        // export that went on to its end would put it on as well)
        expect(await repeatTaken(page), "the page takes a repeat of Enter away once the dialog has been closed from the page").toBe(true);
        await expect(app.toast).toContainText(words.EXPORT_TABLES_CANCELLED_MESSAGE);
        await expect(app.toast.locator(".toast")).toHaveClass(/toast--note/);
        await expectNothingLeft(page, app, before, { logKeys: [key] });
        await app.expectToasts([words.EXPORT_TABLES_CANCELLED_MESSAGE]);
        expect(downloads).toEqual([]);
        // no statement is left open on the table: it can be dropped, and the next export works
        await exec(page, "drop table heavy");
        const file = await app.exportTables(["a_small"]);
        expect(file.name).toBe("a_small.csv");
        expect(downloads).toEqual(["a_small.csv"]);
        expect(pageErrors).toEqual([]);
    });

    // The browser tells of a closing a moment after it has happened. A dialog that is closed and
    // opened again in one task (Cancel, then the menu entry) is open when that event comes: the
    // event belongs to the closing before, and must end nothing of the new dialog, whose rows
    // would say they are being counted for ever.
    test("Cancel and the menu entry pressed in one task, before the browser's close event: the new dialog's rows are counted and Export can be pressed", async ({ page, app }) => {
        await openMade(app, "create table first_one(a); insert into first_one values (1), (2); create table second_one(b); insert into second_one values (3);");
        const downloads = recordDownloads(page);
        await app.openTables();
        await app.waitCounted();
        await watchClosing(page, "#export-tables-dialog");
        const inTask = await page.evaluate(() => {
            document.querySelector("#export-tables-cancel").click();
            document.querySelector("#export-button").click();
            document.querySelector("#export-tables").click();
            return { open: document.querySelector("#export-tables-dialog").open, closeSeen: window.__closing.closeSeen };
        });
        // (the event of the first closing has not come yet: the dialog is open again, in the same task)
        expect(inTask).toEqual({ open: true, closeSeen: false });
        await expect.poll(async () => (await closingSeen(page)).closeSeen, { message: "the browser told of the first closing" }).toBe(true);
        await expect(app.tablesDialog).toBeVisible();
        await expect.poll(() => counted(app), { message: "the rows of the new dialog are counted, and none says it is being counted for ever" }).toBe(2);
        await app.waitCounted();
        await app.tickTables(["second_one"]);
        await expect(app.tablesSubmit).toHaveAttribute("aria-disabled", "false");
        const file = await app.download(() => app.tablesSubmit.click());
        expect(file.name).toBe("second_one.csv");
        expect(downloads).toEqual(["second_one.csv"]);
    });

    // Each opening of the dialog is a session of its own, ended by its own closing: the second one
    // too. Escape in the middle of the second one's export saves nothing.
    test("a dialog opened a second time, in the middle of a table: Escape stops its export, nothing is saved and nothing is recorded", async ({ page, app, pageErrors }) => {
        await openMade(app, TWO_AND_HEAVY);
        const downloads = recordDownloads(page);
        const key = await logKey(page);
        const before = await snapshot(page, app);
        await app.recordToasts();
        await app.openTables();
        await app.waitCounted();
        await app.tablesCancel.click();
        await expect(app.tablesDialog).toBeHidden();
        await POINTS["in the middle of a table"](page, app);
        await page.keyboard.press("Escape");
        await expect(app.tablesDialog).toBeHidden({ timeout: 1000 });
        await expect(app.toast, "the export of the second opening was told to stop").toContainText(words.EXPORT_TABLES_CANCELLED_MESSAGE);
        await expectNothingLeft(page, app, before, { logKeys: [key] });
        await app.expectToasts([words.EXPORT_TABLES_CANCELLED_MESSAGE]);
        expect(downloads).toEqual([]);
        await exec(page, "drop table heavy");
        const file = await app.exportTables(["a_small"]);
        expect(file.name).toBe("a_small.csv");
        expect(pageErrors).toEqual([]);
    });
});

// ---- 9. errors -------------------------------------------------------------------------------------------------

test.describe("an export that cannot be made", () => {
    test("a table that cannot be read to its end stops the export: the list comes back, its row says so and cannot be ticked, the other ticks are kept, and a second Export without it works", async ({ page, app }) => {
        await openMade(app, `create table a_first(x); insert into a_first values (1), (2); ${BAD_LATE_VIEW("bad_late")} create table c_other(x); insert into c_other values (3);`);
        const downloads = recordDownloads(page);
        await app.openTables();
        await app.waitCounted();
        await app.tablesAll.click();
        expect(await tickedNames(app)).toEqual(["a_first", "bad_late", "c_other"]);
        await app.tablesSubmit.click();
        // the alert names the table and gives the engine's words
        await expect(app.tablesError).toHaveText(words.exportTablesFailedText("bad_late", "integer overflow"));
        await expect(app.tablesError).toHaveAttribute("role", "alert");
        // the list is back; the row that failed carries the failure and is unticked and cannot be ticked
        await expect(app.tablesProgress).toBeHidden();
        await expect(app.tablesDialog.locator(".tables-list")).toBeVisible();
        const rows = await app.tablesRows();
        const failed = rows.find((row) => row.name === "bad_late");
        expect(failed).toMatchObject({ line: words.exportTablesUnreadText("integer overflow"), ticked: false, tickable: false });
        // the others keep their ticks
        expect(await tickedNames(app)).toEqual(["a_first", "c_other"]);
        expect(rows.filter((row) => row.name !== "bad_late").every((row) => row.tickable)).toBe(true);
        // the focus is on Cancel
        await expect(app.tablesCancel).toBeFocused();
        await expect(app.tablesBox("bad_late")).toHaveAttribute("aria-disabled", "true");
        await app.tablesBox("bad_late").click({ force: true });
        expect(await tickedNames(app)).toEqual(["a_first", "c_other"]);
        // and what Export now offers is the two
        await expect(app.tablesSubmit).toHaveAttribute("aria-disabled", "false");
        await expect(app.tablesHold).toHaveText(words.exportTablesWillSaveText({ kind: "zip", fileName: "new-tables.zip", entries: [{}, {}] }));
        // nothing was saved, nothing was recorded, and no statement was left on the table (it can be dropped)
        expect(downloads).toEqual([]);
        expect(await eventsOfOpen(page)).toEqual([]);
        await exec(page, "drop view bad_late");
        // a second Export, with no new choice, works: the alert goes
        const file = await app.download(() => app.tablesSubmit.click());
        expect(file.name).toBe("new-tables.zip");
        expect(readZip(file.buffer).map((entry) => entry.name)).toEqual(["a_first.csv", "c_other.csv"]);
        await expect(app.tablesDialog).toBeHidden();
        // (the alert went with the second press: the element itself says so)
        expect(await errorCleared(page)).toEqual({ hidden: true, text: "" });
        expect(downloads).toEqual(["new-tables.zip"]);
    });

    test("one table that cannot be read, and nothing else: its row says so, Export is off, and the alert names it", async ({ page, app }) => {
        await openMade(app, `${BAD_VIEW("only_bad")} create table other_one(x);`);
        await app.openTables();
        await app.waitCounted();
        await app.tickTables(["only_bad"]);
        await app.tablesSubmit.click();
        await expect(app.tablesError).toHaveText(words.exportTablesFailedText("only_bad", "integer overflow"));
        expect(await tickedNames(app)).toEqual([]);
        await expect(app.tablesSubmit).toHaveAttribute("aria-disabled", "true");
        await expect(app.tablesHold).toHaveText(words.EXPORT_TABLES_HOLD_NONE);
        await expect(app.tablesCancel).toBeFocused();
        // (the other table can be exported, and the alert goes with the next press)
        await app.tickTables(["other_one"]);
        const file = await app.download(() => app.tablesSubmit.click());
        expect(file.name).toBe("other_one.csv");
        expect(await page.evaluate(() => document.querySelector("#export-tables-error").hidden)).toBe(true);
    });

    test("after an export that failed, the foot is in its order, in the page and on the screen: the line beside Export, the alert line, and the buttons", async ({ app }) => {
        await openMade(app, `${BAD_VIEW("a_bad")} create table b_ok(x); insert into b_ok values (1);`);
        await app.openTables();
        await app.waitCounted();
        await app.tickTables(["a_bad", "b_ok"]);
        await app.tablesSubmit.click();
        await expect(app.tablesError).toHaveText(words.exportTablesFailedText("a_bad", "integer overflow"));
        await expect(app.tablesHold).toBeVisible();
        // in the page
        const foot = await app.tablesDialog.locator(".tables-foot").evaluate((node) => [...node.children].map((child) => child.id || child.className));
        expect(foot, "the parts of the foot, in the page's order").toEqual(["export-tables-hold", "export-tables-error", "app-dialog-actions"]);
        // on the screen: each under the one before
        const tops = await app.tablesDialog.evaluate((dialog) => ["#export-tables-hold", "#export-tables-error", ".app-dialog-actions"].map((selector) => dialog.querySelector(selector).getBoundingClientRect().top));
        expect(tops[0], "the line beside Export is above the alert line").toBeLessThan(tops[1]);
        expect(tops[1], "the alert line is above the buttons").toBeLessThan(tops[2]);
    });

    test("a dialog opened again after an export that failed starts clean: the alert line is hidden and empty, and the row of the table that failed can be ticked again and fails again", async ({ page, app }) => {
        await openMade(app, `${BAD_VIEW("a_bad")} create table b_ok(x); insert into b_ok values (1);`);
        await app.openTables();
        await app.waitCounted();
        await app.tickTables(["a_bad"]);
        await app.tablesSubmit.click();
        await expect(app.tablesError).toHaveText(words.exportTablesFailedText("a_bad", "integer overflow"));
        await app.tablesCancel.click();
        await expect(app.tablesDialog).toBeHidden();
        await app.openTables();
        await app.waitCounted();
        await expect(app.tablesError).toBeHidden();
        expect(await errorCleared(page), "the alert line of the dialog that was opened again").toEqual({ hidden: true, text: "" });
        // the row of the table that failed is as it was before the export: not ticked, tickable, and its
        // line is its count, not the words of the failure
        const reopened = (await app.tablesRows()).find((row) => row.name === "a_bad");
        expect(reopened, "the row of the table that failed, in the dialog that was opened again").toEqual({
            name: "a_bad",
            kind: "view",
            line: words.exportTablesRowsText(2),
            ticked: false,
            tickable: true,
        });
        await expect(app.tablesBox("a_bad")).not.toHaveAttribute("aria-disabled", "true");
        // it can be ticked, and Export with it fails again in the same words: the view still cannot be read
        await app.tickTables(["a_bad"]);
        expect(await tickedNames(app)).toEqual(["a_bad"]);
        await app.tablesSubmit.click();
        await expect(app.tablesError).toHaveText(words.exportTablesFailedText("a_bad", "integer overflow"));
        const failedAgain = (await app.tablesRows()).find((row) => row.name === "a_bad");
        expect(failedAgain, "the row of the table that failed again").toMatchObject({ line: words.exportTablesUnreadText("integer overflow"), ticked: false, tickable: false });
    });

    const LIBRARY_FAILURES = {
        "the request is aborted": (route) => route.abort(),
        "the file is not there (404)": (route) => route.fulfill({ status: 404, contentType: "text/plain", body: "not found" }),
        "the file is not the library": (route) => route.fulfill({ status: 200, contentType: "text/javascript", body: "/* a file that is not the zip library */" }),
    };
    for (const [how, fail] of Object.entries(LIBRARY_FAILURES)) {
        test(`the zip tool cannot be loaded (${how}): the message, every tick kept, and a second press asks for the file again and succeeds`, async ({ page, app }) => {
            await openMade(app, "create table a1(x); insert into a1 values (1); create table a2(x); create table a3(x); insert into a3 values (3);");
            const downloads = recordDownloads(page);
            let failing = true;
            let requests = 0;
            await page.route("**/vendor/fflate.min.js", (route) => {
                requests++;
                return failing ? fail(route) : route.continue();
            });
            await app.openTables();
            await app.waitCounted();
            await app.tickTables(["a1", "a3"]);
            await app.tablesSubmit.click();
            await expect(app.tablesError).toHaveText(words.EXPORT_TABLES_LIBRARY_FAILED_MESSAGE);
            await expect(app.tablesError).toHaveAttribute("role", "alert");
            expect(requests).toBe(1);
            // the list is back with every tick, and Cancel has the focus
            await expect(app.tablesProgress).toBeHidden();
            await expect(app.tablesDialog.locator(".tables-list")).toBeVisible();
            expect(await tickedNames(app)).toEqual(["a1", "a3"]);
            expect((await app.tablesRows()).every((row) => row.tickable)).toBe(true);
            await expect(app.tablesCancel).toBeFocused();
            await expect(app.tablesSubmit).toHaveAttribute("aria-disabled", "false");
            await expect(app.tablesHold).toHaveText(words.exportTablesWillSaveText({ kind: "zip", fileName: "new-tables.zip", entries: [{}, {}] }));
            expect(downloads).toEqual([]);
            expect(await eventsOfOpen(page)).toEqual([]);
            // the second press asks again, and the file comes
            failing = false;
            const file = await app.download(() => app.tablesSubmit.click());
            expect(requests).toBe(2);
            expect(file.name).toBe("new-tables.zip");
            expect(readZip(file.buffer).map((entry) => entry.name)).toEqual(["a1.csv", "a3.csv"]);
            await expect(app.tablesDialog).toBeHidden();
            expect(await eventsOfOpen(page)).toHaveLength(1);
        });
    }

    test("the row of a table that could not be read holds the engine's words, and still holds them after a second press that fails on another table", async ({ page, app }) => {
        await openMade(app, `${BAD_VIEW("a_bad")} ${BAD_VIEW("b_bad")} create table c_ok(x); insert into c_ok values (3);`);
        await app.openTables();
        await app.waitCounted();
        await app.tablesAll.click();
        const unread = words.exportTablesUnreadText("integer overflow");
        const lineOf = async (name) => (await app.tablesRows()).find((row) => row.name === name).line;
        await app.tablesSubmit.click();
        await expect(app.tablesError).toHaveText(words.exportTablesFailedText("a_bad", "integer overflow"));
        // the words are the engine's, in the row, and the box is described by them
        expect(await lineOf("a_bad")).toBe(unread);
        expect(unread).toContain("integer overflow");
        await expect(app.tablesBox("a_bad")).toHaveAccessibleDescription(unread);
        // the second press is made without a_bad (it cannot be ticked) and fails on b_bad: the row of a_bad is as it was
        await app.tablesSubmit.click();
        await expect(app.tablesError).toHaveText(words.exportTablesFailedText("b_bad", "integer overflow"));
        expect(await lineOf("a_bad")).toBe(unread);
        expect(await lineOf("b_bad")).toBe(unread);
        await expect(app.tablesBox("a_bad")).toHaveAccessibleDescription(unread);
        expect(await tickedNames(app)).toEqual(["c_ok"]);
        // and it is a row like the others otherwise: the box stays where it is when it is pressed
        await app.tablesBox("a_bad").click({ force: true });
        expect(await tickedNames(app)).toEqual(["c_ok"]);
    });
});

// ---- 10. the note at the end of an export that holds a BLOB --------------------------------------------------------

test.describe("the note at the end", () => {
    test("a BLOB: one paragraph in place of the list and the buttons, Close with the focus and described by it, the dialog's own description pointing to it, and the toast as well", async ({ app }) => {
        await openEdgeCases(app);
        await app.recordToasts();
        const file = await app.exportTables(["mixed_types"]);
        expect(file.name).toBe("mixed_types.csv");
        const note = words.exportTablesBlobNote("mixed_types.csv", ["mixed_types"]);
        await expect(app.tablesDialog).toBeVisible();
        await expect(app.tablesNote).toHaveText(note);
        expect(note.startsWith(words.exportedTablesMessage("mixed_types.csv", { rows: 7 }))).toBe(false);
        expect(note.startsWith("Exported mixed_types.csv.")).toBe(true);
        // one paragraph, text alone
        expect(await app.tablesNote.evaluate((node) => ({ tag: node.tagName, children: node.children.length }))).toEqual({ tag: "P", children: 0 });
        // in its place: no list, no tick box for all, no line, no Export, no progress, no alert
        for (const part of [app.tablesDialog.locator(".tables-list"), app.tablesAll, app.tablesHold, app.tablesSubmit, app.tablesProgress, app.tablesError]) {
            await expect(part).toBeHidden();
        }
        // Close has the focus and is described by the note; the dialog's description is the note
        await expect(app.tablesCancel).toHaveText(words.EXPORT_TABLES_CLOSE_TEXT);
        await expect(app.tablesCancel).toBeFocused();
        await expect(app.tablesCancel).toHaveAttribute("aria-describedby", "export-tables-note");
        await expect(app.tablesCancel).toHaveAccessibleDescription(note);
        await expect(app.tablesDialog).toHaveAttribute("aria-describedby", "export-tables-note");
        // (the toast says it as well)
        await expect(app.toast).toContainText(words.exportedTablesMessage("mixed_types.csv", { rows: 7 }));
        // Close closes it, and the focus goes back to the Export button
        await app.tablesCancel.click();
        await expect(app.tablesDialog).toBeHidden();
        await expect(app.exportMenuButton).toBeFocused();
    });

    test("a second export in the same visit after the note: the list is back, with the words of a list, and the export is made and recorded", async ({ page, app }) => {
        await openEdgeCases(app);
        await app.exportTables(["mixed_types"]);
        await expect(app.tablesNote).toBeVisible();
        await app.tablesCancel.click();
        await expect(app.tablesDialog).toBeHidden();
        // the dialog is a list again: the note is gone, Close is Cancel again, and the description is the dialog's line
        await app.openTables();
        await expect(app.tablesNote).toBeHidden();
        await expect(app.tablesDialog.locator(".tables-list")).toBeVisible();
        await expect(app.tablesCancel).toHaveText(words.EXPORT_TABLES_CANCEL_TEXT);
        await expect(app.tablesCancel).not.toHaveAttribute("aria-describedby", /.+/);
        await expect(app.tablesDialog).toHaveAttribute("aria-describedby", "export-tables-text");
        await app.waitCounted();
        expect(await tickedNames(app)).toEqual([]);
        await app.tickTables(["basic"]);
        const file = await app.download(() => app.tablesSubmit.click());
        expect(file.name).toBe("basic.csv");
        expect(file.buffer.equals(expectedBytes("basic.csv"))).toBe(true);
        // nothing to add: the dialog closes, with no note
        await expect(app.tablesDialog).toBeHidden();
        await expect(app.tablesNote).toBeHidden();
        const events = await eventsOfOpen(page);
        expect(events.map((event) => event.lines[0].replace(/, \d+ bytes$/, ""))).toEqual(["file: mixed_types.csv", "file: basic.csv"]);
    });

    test("Escape closes the note like Close, and the dialog opens again as a list", async ({ page, app }) => {
        await openEdgeCases(app);
        await app.exportTables(["mixed_types"]);
        await expect(app.tablesNote).toBeVisible();
        await page.keyboard.press("Escape");
        await expect(app.tablesDialog).toBeHidden();
        await expect(app.exportMenuButton).toBeFocused();
        await app.openTables();
        await expect(app.tablesDialog.locator(".tables-list")).toBeVisible();
        await expect(app.tablesNote).toBeHidden();
    });

    test("several tables hold a BLOB: the note names them all, and not the one that holds none", async ({ app }) => {
        await openMade(app, "create table b1(x); insert into b1 values (x'00ff'); create table b2(x, y); insert into b2 values (1, x'ab'); create table plain(x); insert into plain values (1);");
        const file = await app.exportTables("all");
        expect(readZip(file.buffer).map((entry) => entry.name)).toEqual(["b1.csv", "b2.csv", "plain.csv"]);
        await expect(app.tablesNote).toHaveText(words.exportTablesBlobNote(file.name, ["b1", "b2"]));
        await expect(app.tablesNote).not.toContainText("plain,");
        await expect(app.tablesCancel).toBeFocused();
    });

    test("a text table holds no BLOB: no note, the dialog closes at the end and the toast says it", async ({ app }) => {
        await openEdgeCases(app);
        const file = await app.exportTables(["basic", "dates_iso"]);
        expect(file.name).toBe("export_edge_cases-tables.zip");
        await expect(app.tablesDialog).toBeHidden();
        await expect(app.toast).toContainText(words.exportedTablesMessage(file.name, { tables: 2 }));
        await expect(app.exportMenuButton).toBeFocused();
    });

    test("the line that says what the dialog is for is on show in the list and while it runs, and is not beside the note; the dialog is named by its title in each state, and described by the note then", async ({ page, app }) => {
        await openEdgeCases(app);
        const intro = app.tablesDialog.locator("#export-tables-text");
        const held = await holdVendor(page, ZIP_TOOL);
        await app.openTables();
        await app.waitCounted();
        // the list
        await expect(intro).toBeVisible();
        await expect(intro).toHaveText(words.EXPORT_TABLES_TEXT_LINE);
        await expect(app.tablesDialog).toHaveAttribute("aria-describedby", "export-tables-text");
        await expect(app.tablesDialog).toHaveAccessibleDescription(words.EXPORT_TABLES_TEXT_LINE);
        await expect(app.tablesDialog).toHaveAccessibleName(words.EXPORT_TABLES_TITLE);
        // while it runs (the zip tool is awaited)
        await app.tickTables(["basic", "mixed_types"]);
        await app.tablesSubmit.click();
        await expect(app.tablesDialog.locator("#export-tables-progress-title")).toHaveText(words.EXPORT_TABLES_PROGRESS_LIBRARY);
        await expect.poll(() => held.requests()).toBe(1);
        await expect(intro).toBeVisible();
        await expect(app.tablesDialog).toHaveAttribute("aria-describedby", "export-tables-text");
        await expect(app.tablesDialog).toHaveAccessibleName(words.EXPORT_TABLES_TITLE);
        // the note: the intro is gone, and the note describes the dialog
        held.open();
        await expect(app.tablesNote).toBeVisible();
        const note = words.exportTablesBlobNote("export_edge_cases-tables.zip", ["mixed_types"]);
        await expect(app.tablesNote).toHaveText(note);
        await expect(intro).toBeHidden();
        await expect(app.tablesDialog).toHaveAttribute("aria-describedby", "export-tables-note");
        await expect(app.tablesDialog).toHaveAccessibleDescription(note);
        await expect(app.tablesDialog).toHaveAccessibleName(words.EXPORT_TABLES_TITLE);
        // closed and opened again, the dialog is a list again, with its line
        await app.tablesCancel.click();
        await app.openTables();
        await expect(intro).toBeVisible();
        await expect(app.tablesDialog).toHaveAccessibleDescription(words.EXPORT_TABLES_TEXT_LINE);
    });
});

// ---- 11. focus, and the keyboard alone -----------------------------------------------------------------------------

test.describe("where the focus is", () => {
    test("on opening it is on the tick box for all, or on the one row's own box; and Cancel has it while the export runs and after it failed", async ({ page, app }) => {
        await openMade(app, `create table a_small(x); insert into a_small values (1); ${BAD_VIEW("b_bad")} create table c_small(x); insert into c_small values (2);`);
        await app.openTables();
        expect(await focusedId(page)).toBe("export-tables-all");
        await app.waitCounted();
        await app.tickTables(["a_small", "b_bad"]);
        // running: held on the zip tool's request; Cancel has the focus
        const held = await holdVendor(page, ZIP_TOOL);
        await app.tablesSubmit.click();
        await expect(app.tablesDialog.locator("#export-tables-progress-title")).toHaveText(words.EXPORT_TABLES_PROGRESS_LIBRARY);
        expect(await focusedId(page)).toBe("export-tables-cancel");
        // (the focus is taken off it meanwhile: it is the error that puts it back)
        await page.evaluate(() => document.activeElement.blur());
        // the error: the list is back, and Cancel has the focus
        held.open();
        await expect(app.tablesError).toHaveText(words.exportTablesFailedText("b_bad", "integer overflow"));
        expect(await focusedId(page)).toBe("export-tables-cancel");
        // the end: the dialog closes and the focus goes back to the Export button
        const file = await app.download(() => app.tablesSubmit.click());
        expect(file.name).toBe("a_small.csv");
        await expect(app.tablesDialog).toBeHidden();
        await expect(app.exportMenuButton).toBeFocused();
        // the note, reached by the same way: Close has the focus, whatever had it before
        await openMade(app, "create table blobs(x); insert into blobs values (x'00'); create table plain(x);");
        const heldAgain = await holdVendor(page, ZIP_TOOL);
        await app.openTables();
        await app.waitCounted();
        await app.tablesAll.click();
        await app.tablesSubmit.click();
        await expect(app.tablesDialog.locator("#export-tables-progress-title")).toHaveText(words.EXPORT_TABLES_PROGRESS_LIBRARY);
        await page.evaluate(() => document.activeElement.blur());
        heldAgain.open();
        await expect(app.tablesNote).toBeVisible();
        expect(await focusedId(page)).toBe("export-tables-cancel");
        await expect(app.tablesCancel).toHaveText(words.EXPORT_TABLES_CLOSE_TEXT);
        // one object: its own box has the focus
        await openMade(app, "create table only_one(a);");
        await app.openTables();
        expect(await focusedId(page)).toBe((await app.tablesBox("only_one").getAttribute("id")));
        await expect(app.tablesBox("only_one")).toBeFocused();
    });

    test("closed, it goes back to the Export button: after Cancel, after Escape, after an export and after the note's Close", async ({ app }) => {
        await openEdgeCases(app);
        await app.openTables();
        await app.tablesCancel.click();
        await expect(app.exportMenuButton).toBeFocused();
        await app.openTables();
        await app.page.keyboard.press("Escape");
        await expect(app.exportMenuButton).toBeFocused();
        await app.exportTables(["basic"]);
        await expect(app.tablesDialog).toBeHidden();
        await expect(app.exportMenuButton).toBeFocused();
        await app.exportTables(["mixed_types"]);
        await expect(app.tablesCancel).toBeFocused();
        await app.tablesCancel.click();
        await expect(app.exportMenuButton).toBeFocused();
    });

    test("on a phone it goes back to More, whichever way the dialog closes", async ({ page, app }) => {
        await page.setViewportSize({ width: 390, height: 844 });
        await openEdgeCases(app);
        expect(await app.isPhone()).toBe(true);
        await app.openTables();
        await expect(app.tablesAll).toBeFocused();
        await app.tablesCancel.click();
        await expect(app.moreButton).toBeFocused();
        await app.openTables();
        await page.keyboard.press("Escape");
        await expect(app.moreButton).toBeFocused();
        await app.exportTables(["basic"]);
        await expect(app.tablesDialog).toBeHidden();
        await expect(app.moreButton).toBeFocused();
        await app.exportTables(["mixed_types"]);
        await expect(app.tablesCancel).toBeFocused();
        await app.tablesCancel.click();
        await expect(app.moreButton).toBeFocused();
    });

    test("by keyboard alone: the Export menu, the entry, a tick with Space, Tab to Export, Enter, and the file is saved", async ({ page, app }) => {
        await openEdgeCases(app);
        await app.exportMenuButton.focus();
        await page.keyboard.press("Enter");
        await expect(app.exportMenu).toBeVisible();
        await expect(page.locator("#export-db")).toBeFocused();
        await page.keyboard.press("ArrowDown");
        await expect(app.tablesItem).toBeFocused();
        await page.keyboard.press("Enter");
        await expect(app.tablesDialog).toBeVisible();
        await expect(app.tablesAll).toBeFocused();
        await app.waitCounted();
        // Export is off, and Tab reaches it all the same, with its reason
        expect(await tabTo(page, "#export-tables-submit")).toBe(true);
        await expect(app.tablesSubmit).toHaveAccessibleDescription(words.EXPORT_TABLES_HOLD_NONE);
        await page.keyboard.press("Enter");
        await expect(app.tablesProgress).toBeHidden();
        // back to the list, down to the rows: the first is Order Details, the second basic
        await app.tablesAll.focus();
        await page.keyboard.press("Tab");
        await expect(app.tablesBox("Order Details")).toBeFocused();
        await page.keyboard.press("Tab");
        await expect(app.tablesBox("basic")).toBeFocused();
        await page.keyboard.press("Space");
        await expect(app.tablesBox("basic")).toBeChecked();
        expect(await tickedNames(app)).toEqual(["basic"]);
        expect(await tabTo(page, "#export-tables-submit")).toBe(true);
        const file = await app.download(() => page.keyboard.press("Enter"));
        expect(file.name).toBe("basic.csv");
        expect(file.buffer.equals(expectedBytes("basic.csv"))).toBe(true);
        await expect(app.tablesDialog).toBeHidden();
        await expect(app.exportMenuButton).toBeFocused();
    });
});

// ---- 12. a database that opens under the idle dialog -----------------------------------------------------------------

test.describe("a database that opens under the idle dialog closes it", () => {
    test("Back: the dialog closes, the focus is not lost, and the next dialog is the new database's", async ({ page, app, pageErrors }) => {
        await app.open(EXPORT_URL);
        const first = await page.evaluate(() => window.app.database.name);
        await app.upload(fixturePath(EDGE_DATABASE));
        const handle = await page.evaluateHandle(() => window.app.database);
        await app.openTables();
        await app.waitCounted();
        await app.tickTables(["basic"]);
        await page.goBack();
        await page.waitForFunction((old) => window.app.database !== old, handle);
        await app.waitReady();
        expect(await page.evaluate(() => window.app.database.name)).toBe(first);
        await expect(app.tablesDialog).toBeHidden();
        // (the page puts the focus in the editor when a database opens: it is not lost on the page's body)
        await expect(app.editor).toBeFocused();
        // nothing was exported
        expect(await page.evaluate(() => document.querySelector("#export-tables-error").hidden)).toBe(true);
        // the next dialog is made for the database that is open now, and nothing is ticked in it
        await app.openTables();
        await app.waitCounted();
        expect((await app.tablesRows()).map((row) => row.name)).not.toContain("basic");
        expect(await tickedNames(app)).toEqual([]);
        expect(pageErrors).toEqual([]);
    });

    test("Forward does the same", async ({ page, app }) => {
        test.skip(!OTHER_DATASET, "only one course database ships");
        await app.open(`./?db=${OTHER_DATASET.id}&${flagState("export")}`);
        await app.pickDatabaseById(DEFAULT_DATASET.id);
        await expect(app.databaseLabel).toHaveText(DEFAULT_DATASET.name);
        await page.goBack();
        await expect(app.databaseLabel).not.toHaveText(DEFAULT_DATASET.name);
        await app.waitReady();
        const handle = await page.evaluateHandle(() => window.app.database);
        await app.openTables();
        await app.waitCounted();
        await page.goForward();
        await page.waitForFunction((old) => window.app.database !== old, handle);
        await app.waitReady();
        await expect(app.databaseLabel).toHaveText(DEFAULT_DATASET.name);
        await expect(app.tablesDialog).toBeHidden();
        await expect(app.editor).toBeFocused();
    });
});

// ---- 13. accessibility ----------------------------------------------------------------------------------------------------

// a stall: every turn the page gives itself between two counts lasts a minute, so that a dialog
// can be looked at in the middle of its counting
const stallRests = (page) =>
    page.evaluate(() => {
        if (globalThis.scheduler && typeof globalThis.scheduler.yield === "function") {
            globalThis.scheduler.yield = () => new Promise((resolve) => setTimeout(resolve, 60_000));
        } else {
            const post = MessagePort.prototype.postMessage;
            MessagePort.prototype.postMessage = function (...args) {
                setTimeout(() => post.apply(this, args), 60_000);
            };
        }
    });

const SEEN = {
    "the list, with some rows ticked": async (page, app) => {
        await openEdgeCases(app);
        await app.openTables();
        await app.waitCounted();
        await app.tickTables(["Order Details", "sales/2024", "sales_2024", "v_basic_summary"]);
    },
    "the list while it is being counted": async (page, app) => {
        await openMade(app, `${manyTables(30)} ${GONE_VIEW("zz_gone")}`);
        await stallRests(page);
        await app.openTables();
        await expect.poll(() => counted(app)).toBeGreaterThan(0);
        await app.tablesBox("t001").check();
    },
    "the running state": async (page, app) => {
        await openEdgeCases(app);
        await holdZip(page, app, ["basic", "dates_iso"]);
    },
    "the note at the end": async (page, app) => {
        await openEdgeCases(app);
        await app.exportTables(["mixed_types"]);
        await expect(app.tablesNote).toBeVisible();
    },
    "an error line, and a row that cannot be exported": async (page, app) => {
        await openMade(app, `create table a_first(x); ${BAD_VIEW("b_bad")} ${GONE_VIEW("c_gone")}`);
        await app.openTables();
        await app.waitCounted();
        await app.tickTables(["a_first", "b_bad"]);
        await app.tablesSubmit.click();
        await expect(app.tablesError).toBeVisible();
        await expect(app.tablesRow("b_bad").locator(".tables-row-count")).toHaveText(words.exportTablesUnreadText("integer overflow"));
    },
};

test.describe("accessibility: axe finds no serious or critical violation in the dialog", () => {
    for (const viewport of [
        { name: "desktop", width: 1366, height: 768 },
        { name: "phone", width: 390, height: 844 },
    ]) {
        for (const theme of ["light", "dark"]) {
            for (const [state, reach] of Object.entries(SEEN)) {
                test(`${state}, ${theme}, ${viewport.name}`, async ({ page, app }) => {
                    await page.setViewportSize({ width: viewport.width, height: viewport.height });
                    await page.emulateMedia({ colorScheme: theme, reducedMotion: "reduce" });
                    await reach(page, app);
                    await expect(app.tablesDialog).toBeVisible();
                    await page.evaluate(() => document.fonts.ready);
                    const results = await new AxeBuilder({ page }).include("#export-tables-dialog").analyze();
                    // (the dialog was looked at: some rules ran and passed)
                    expect(results.passes.length).toBeGreaterThan(5);
                    const serious = results.violations
                        .filter((v) => v.impact === "serious" || v.impact === "critical")
                        .map((v) => `${v.id} (${v.impact}): ${v.help} at ${v.nodes.slice(0, 4).map((n) => n.target.join(" ")).join(" | ")}`);
                    expect(serious).toEqual([]);
                });
            }
        }
    }
});

// ---- 14. 360 px wide -------------------------------------------------------------------------------------------------------

test.describe("360 px wide", () => {
    test("a name of 100 characters and three hundred tables: nothing scrolls sideways, the whole name is in the text, and Export and Cancel stay in view while the list scrolls", async ({ page, app }) => {
        test.slow();
        await page.setViewportSize({ width: 360, height: 740 });
        // 100 characters, with no space to break at, and with characters that a file name replaces
        const long = "a-very-long-table-name-with-no-space-in-it-".repeat(3).slice(0, 100);
        expect(long).toHaveLength(100);
        await openMade(app, `${manyTables(300)} create table "${long}"(x); insert into "${long}" values (1);`);
        await app.openTables();
        await app.waitCounted();
        await app.tickTables([long]);
        const sideways = () =>
            page.evaluate(() => {
                const dialog = document.querySelector("#export-tables-dialog");
                const body = dialog.querySelector(".tables-body");
                const row = [...dialog.querySelectorAll(".tables-row-name")].find((node) => node.textContent.length === 100);
                const label = row.closest("label");
                const edge = dialog.getBoundingClientRect();
                const name = row.getBoundingClientRect();
                return {
                    page: document.documentElement.scrollWidth - window.innerWidth,
                    dialog: dialog.scrollWidth - dialog.clientWidth,
                    body: body.scrollWidth - body.clientWidth,
                    label: label.scrollWidth - label.clientWidth,
                    nameRight: name.right - edge.right,
                    nameLeft: edge.left - name.left,
                    text: row.textContent,
                };
            });
        const measured = await sideways();
        expect(measured.page).toBeLessThanOrEqual(0);
        expect(measured.dialog).toBeLessThanOrEqual(0);
        expect(measured.body).toBeLessThanOrEqual(0);
        expect(measured.label).toBeLessThanOrEqual(0);
        expect(measured.nameRight).toBeLessThanOrEqual(0);
        expect(measured.nameLeft).toBeLessThanOrEqual(0);
        // the whole name is in the text, and no title cuts or repeats it
        expect(measured.text).toBe(long);
        await expect(app.tablesRow(long).locator("[title]")).toHaveCount(0);
        // the file's name for it is said whole too, and also wraps
        await expect(app.tablesRow(long).locator(".tables-row-saved")).toHaveText(words.exportTablesSavedAsText(`${long.replace(/-/g, "_")}.csv`));
        // the list scrolls inside the dialog, and Export and Cancel do not move
        const buttons = async () => ({ submit: await app.tablesSubmit.boundingBox(), cancel: await app.tablesCancel.boundingBox() });
        const inView = (box) => box.x >= 0 && box.y >= 0 && box.x + box.width <= 360 && box.y + box.height <= 740;
        const before = await buttons();
        expect(inView(before.submit)).toBe(true);
        expect(inView(before.cancel)).toBe(true);
        const scrolled = await app.tablesDialog.locator(".tables-body").evaluate((body) => {
            const room = body.scrollHeight - body.clientHeight;
            body.scrollTop = body.scrollHeight;
            return { room, top: body.scrollTop };
        });
        expect(scrolled.room).toBeGreaterThan(1000);
        expect(scrolled.top).toBeGreaterThan(1000);
        expect(await buttons()).toEqual(before);
        // (the last row is in view now, and the page itself did not scroll)
        const last = await app.tablesRow("t300").boundingBox();
        expect(last.y).toBeGreaterThanOrEqual(0);
        expect(last.y + last.height).toBeLessThanOrEqual(before.submit.y);
        expect(await page.evaluate(() => window.scrollY)).toBe(0);
        // and with the row that is not tickable-to-the-eye (a very long reason) the same holds
        expect((await sideways()).page).toBeLessThanOrEqual(0);
    });

    test("a long reason (the engine's words for a view that cannot be counted) wraps too", async ({ page, app }) => {
        await page.setViewportSize({ width: 360, height: 740 });
        const long = "x".repeat(100);
        await openMade(app, `create table "${long}"(a); create view "v_${long}" as select a from "${long}"; drop table "${long}";`);
        await app.openTables();
        await app.waitCounted();
        const row = (await app.tablesRows())[0];
        expect(row.name).toBe(`v_${long}`);
        expect(row.line).toBe(words.exportTablesUncountedText(`no such table: main.${long}`));
        const width = await page.evaluate(() => ({ page: document.documentElement.scrollWidth - window.innerWidth, body: document.querySelector(".tables-body").scrollWidth - document.querySelector(".tables-body").clientWidth }));
        expect(width.page).toBeLessThanOrEqual(0);
        expect(width.body).toBeLessThanOrEqual(0);
    });
});

test.describe("360 px wide, while it runs and at its end", () => {
    test("a table of 100 characters: its name wraps in the heading, in the line beside Export, in the alert and in the note, and nothing scrolls sideways", async ({ page, app }) => {
        test.slow();
        await page.setViewportSize({ width: 360, height: 740 });
        const long = "a-very-long-table-name-with-no-space-in-it-".repeat(3).slice(0, 100);
        await openMade(app, `create table "${long}"(id integer primary key, pad text); with recursive c(x) as (select 1 union all select x+1 from c where x<6000) insert into "${long}" select x, hex(zeroblob(500)) from c; create table other(x); insert into other values (x'00'); ${BAD_VIEW("zz_bad")}`);
        const overflow = () =>
            page.evaluate(() => {
                const dialog = document.querySelector("#export-tables-dialog");
                return { page: document.documentElement.scrollWidth - window.innerWidth, dialog: dialog.scrollWidth - dialog.clientWidth };
            });
        const fits = async (label) => {
            const measured = await overflow();
            expect(measured.page, `${label}: the page`).toBeLessThanOrEqual(0);
            expect(measured.dialog, `${label}: the dialog`).toBeLessThanOrEqual(0);
        };
        await slowDown(page);
        await app.openTables();
        await app.waitCounted();
        // the line beside Export says a long file's name, in one word
        await app.tickTables([long]);
        await expect(app.tablesHold).toHaveText(words.exportTablesWillSaveText({ kind: "file", fileName: `${long.replace(/-/g, "_")}.csv`, entries: [{}] }));
        await fits("the line beside Export");
        // running: the heading and the second line
        await app.tablesSubmit.click();
        await expect.poll(() => rowsWritten(app), { timeout: 15_000 }).toBeGreaterThan(50);
        expect((await progressText(app)).title).toBe(words.exportTablesProgressTitle(1, 1, long));
        await fits("the progress");
        await expect(app.tablesCancel).toBeVisible();
        // the file is saved, and the dialog is closed
        await expect(app.tablesDialog).toBeHidden({ timeout: 30_000 });
        // the alert: a table that cannot be read, with a long name for the table, is shown whole
        await exec(page, `create view "v_${long}" as select 1 as x union all select abs(-9223372036854775807-1);`);
        await app.openTables();
        await app.waitCounted();
        await app.tickTables([`v_${long}`]);
        await app.tablesSubmit.click();
        await expect(app.tablesError).toHaveText(words.exportTablesFailedText(`v_${long}`, "integer overflow"));
        await fits("the alert");
        // the note: two tables, one of them holding a BLOB
        await app.tablesCancel.click();
        await app.openTables();
        await app.waitCounted();
        await app.tickTables([long, "other"]);
        await app.tablesSubmit.click();
        await expect(app.tablesNote).toBeVisible({ timeout: 30_000 });
        await expect(app.tablesNote).toContainText("other");
        await fits("the note");
    });

    // Names of the kind that SQL has: underscores and letters, with no hyphen and no space, so that
    // a line has no place to break but where the page's own rule breaks it.
    test("a name of 100 characters that gives a line no place to break (underscores only, and letters only) wraps in the alert and in the note", async ({ page, app }) => {
        test.slow();
        await page.setViewportSize({ width: 360, height: 740 });
        const names = {
            badUnderscores: ("bad_" + "x_".repeat(50)).slice(0, 100),
            badLetters: "badletters".repeat(10),
            blobUnderscores: ("blob_" + "y_".repeat(50)).slice(0, 100),
            blobLetters: "blobletters".repeat(10).slice(0, 100),
        };
        for (const name of Object.values(names)) {
            expect(name).toHaveLength(100);
            expect(name).toMatch(/^[A-Za-z_]+$/);
        }
        const bad = (name) => `create view "${name}" as select 1 as x union all select abs(-9223372036854775807-1);`;
        const blob = (name) => `create table "${name}"(x); insert into "${name}" values (x'00');`;
        await openMade(app, `${bad(names.badUnderscores)} ${bad(names.badLetters)} ${blob(names.blobUnderscores)} ${blob(names.blobLetters)}`);
        // nothing scrolls sideways: not the page, not the dialog, and not the part of it that scrolls
        const fits = async (label) => {
            const measured = await page.evaluate(() => {
                const dialog = document.querySelector("#export-tables-dialog");
                const body = dialog.querySelector(".tables-body");
                return {
                    page: document.documentElement.scrollWidth - window.innerWidth,
                    dialog: dialog.scrollWidth - dialog.clientWidth,
                    body: body.scrollWidth - body.clientWidth,
                };
            });
            expect(measured.page, `${label}: the page`).toBeLessThanOrEqual(0);
            expect(measured.dialog, `${label}: the dialog`).toBeLessThanOrEqual(0);
            expect(measured.body, `${label}: the part that scrolls`).toBeLessThanOrEqual(0);
        };
        await app.openTables();
        await app.waitCounted();
        // the alert: a table that cannot be read, named whole
        for (const name of [names.badUnderscores, names.badLetters]) {
            await app.tickTables([name]);
            await app.tablesSubmit.click();
            await expect(app.tablesError).toHaveText(words.exportTablesFailedText(name, "integer overflow"));
            await fits(`the alert for ${name.slice(0, 8)}...`);
        }
        // the note: a table that holds a BLOB, named whole
        for (const name of [names.blobUnderscores, names.blobLetters]) {
            await app.tickTables([name]);
            await app.tablesSubmit.click();
            await expect(app.tablesNote).toBeVisible();
            await expect(app.tablesNote).toContainText(name);
            await fits(`the note for ${name.slice(0, 8)}...`);
            await app.tablesCancel.click();
            await expect(app.tablesDialog).toBeHidden();
            await app.openTables();
            await app.waitCounted();
        }
    });
});

// ---- 15. what the dialog looks like, measured -----------------------------------------------------------------------------
//
// The colours, sizes and places that a picture of the dialog takes for the same (it compares with a
// slack of a few dozen pixels and a tolerance for near colours): each is read from the page and
// held against what the page's own tokens say. A token is resolved in the page, with an element of
// the test's own, so that the test follows the token when the palette is changed.

test.describe("what the dialog looks like, measured", () => {
    // what a token says in the page now (in the theme that is emulated): a colour, a length or a radius
    const tokenValue = (page, property, token) =>
        page.evaluate(
            ([name, custom]) => {
                const probe = document.createElement("div");
                probe.style[name] = `var(${custom})`;
                document.body.append(probe);
                const value = getComputedStyle(probe)[name];
                probe.remove();
                return value;
            },
            [property, token]
        );
    const styleOf = (locator, property) => locator.evaluate((node, name) => getComputedStyle(node)[name], property);
    const THEMES = ["light", "dark"];

    // ---- Export while it cannot be pressed is a primary button that is disabled

    // The border, the background and the colour of Export, and of a disabled primary button that the
    // test puts in the foot beside it for a moment (it has the attribute `disabled`, which the
    // dialog's own rule does not match, so it shows what the style sheet of buttons says).
    const exportLook = (page) =>
        page.evaluate(() => {
            const read = (node) => {
                const style = getComputedStyle(node);
                return { border: style.borderTopColor, background: style.backgroundColor, color: style.color };
            };
            const foot = document.querySelector("#export-tables-dialog .tables-foot");
            const reference = document.createElement("button");
            reference.className = "button button--primary";
            reference.disabled = true;
            reference.textContent = "Export";
            foot.append(reference);
            const look = { submit: read(document.querySelector("#export-tables-submit")), disabled: read(reference) };
            reference.remove();
            return look;
        });
    const expectDisabledLook = async (page, app, state) => {
        await expect(app.tablesSubmit, `${state}: Export is off`).toHaveAttribute("aria-disabled", "true");
        const look = await exportLook(page);
        expect(look.submit.border, `${state}: the border of Export while it is off is that of a disabled primary button`).toBe(look.disabled.border);
        expect(look.submit.background, `${state}: the background of Export while it is off is that of a disabled primary button`).toBe(look.disabled.background);
        expect(look.submit.color, `${state}: the colour of Export while it is off is that of a disabled primary button`).toBe(look.disabled.color);
        return look;
    };

    for (const theme of THEMES) {
        test(`${theme} theme: with nothing ticked Export looks like a disabled primary button, and not like Export when a row is ticked`, async ({ page, app }) => {
            await page.emulateMedia({ colorScheme: theme, reducedMotion: "reduce" });
            await openMade(app, "create table ok_one(a); create table ok_two(a);");
            await app.openTables();
            await app.waitCounted();
            const off = await expectDisabledLook(page, app, "nothing ticked");
            // a ticked row makes Export the primary button: every part of it is another colour
            await app.tickTables(["ok_one"]);
            await expect(app.tablesSubmit).toHaveAttribute("aria-disabled", "false");
            const on = (await exportLook(page)).submit;
            expect(on.border, "Export with a row ticked has another border").not.toBe(off.submit.border);
            expect(on.background, "Export with a row ticked has another background").not.toBe(off.submit.background);
            expect(on.color, "Export with a row ticked has another colour").not.toBe(off.submit.color);
            // and when the tick is taken off, it is off again, in the same colours
            await app.tablesBox("ok_one").uncheck();
            expect((await expectDisabledLook(page, app, "the tick taken off")).submit).toEqual(off.submit);
        });

        test(`${theme} theme: while the rows are being counted Export looks like a disabled primary button`, async ({ page, app }) => {
            await page.emulateMedia({ colorScheme: theme, reducedMotion: "reduce" });
            await openMade(app, `${manyTables(30)} ${GONE_VIEW("zz_gone")}`);
            await stallRests(page);
            await app.openTables();
            await expect.poll(() => counted(app)).toBeGreaterThan(0);
            expect(await counted(app), "some rows are still being counted").toBeLessThan(31);
            await expectDisabledLook(page, app, "counting");
        });
    }

    // ---- the alert line and the buttons

    test("after an export that failed, the alert line stands a full step (the page's space-3) above the buttons", async ({ page, app }) => {
        await openMade(app, `create table a_first(x); insert into a_first values (1); ${BAD_VIEW("b_bad")}`);
        await app.openTables();
        await app.waitCounted();
        await app.tickTables(["a_first", "b_bad"]);
        await app.tablesSubmit.click();
        await expect(app.tablesError).toHaveText(words.exportTablesFailedText("b_bad", "integer overflow"));
        const step = parseFloat(await tokenValue(page, "paddingLeft", "--space-3"));
        expect(step, "the token resolves to a length").toBeGreaterThan(8);
        const gap = await page.evaluate(() => {
            const error = document.querySelector("#export-tables-error").getBoundingClientRect();
            const buttons = document.querySelector("#export-tables-submit").closest(".app-dialog-actions").getBoundingClientRect();
            return buttons.top - error.bottom;
        });
        expect(Math.abs(gap - step), `the alert line is ${gap}px above the buttons, and a full step is ${step}px`).toBeLessThanOrEqual(0.5);
    });

    // ---- a row that gets the focus by Tab

    // The list scrolls to follow the focus, and its style sheet asks for a step (space-3) of room at
    // both edges (scroll-padding-block). The browsers use it differently. Going down, Chromium stops a
    // row that is only just in view at the step from the bottom edge; Firefox leaves a row that is in
    // view where it is (about 9 px from the edge). Going up, Firefox with no such room scrolls the
    // list so that a row lies partly above the top edge, with its box cut. So: in both directions
    // every row that has the focus has its whole box in the list's view, and in Chromium, going down,
    // it is at least a step above the bottom edge.
    test("40 tables in a window 500 px high: a row that gets the focus by Tab or Shift+Tab has its whole box in the list's view, and Tab stops it a step above the bottom edge in Chromium", async ({ page, app, browserName }) => {
        await page.setViewportSize({ width: 1280, height: 500 });
        await openMade(app, manyTables(40));
        await app.openTables();
        await app.waitCounted();
        const step = parseFloat(await tokenValue(page, "paddingLeft", "--space-3"));
        expect(step, "the token resolves to a length").toBeGreaterThan(8);
        // the row that has the focus (nothing, when the focus is elsewhere), and how far its box is from the list's edges
        const where = () =>
            page.evaluate(() => {
                const list = document.querySelector("#export-tables-dialog .tables-body");
                const box = document.activeElement;
                if (!box.classList.contains("tables-row-box")) {
                    return null;
                }
                const edge = list.getBoundingClientRect();
                const rect = box.getBoundingClientRect();
                return { name: box.closest(".tables-row").querySelector(".tables-row-name").textContent, fromTop: rect.top - edge.top, fromBottom: edge.bottom - rect.bottom, scrolled: list.scrollTop };
            });
        // the rows that get the focus as `key` is pressed, until the focus is on `stop`
        const walk = async (key, stop) => {
            const seen = [];
            for (let i = 0; i < 60 && (await focusedId(page)) !== stop; i++) {
                await page.keyboard.press(key);
                const now = await where();
                if (now) {
                    seen.push(now);
                }
            }
            expect(await focusedId(page), `${key} reached ${stop}`).toBe(stop);
            return seen;
        };
        const down = await walk("Tab", "export-tables-submit");
        expect(down.map((now) => now.name), "Tab went down every row").toEqual(Array.from({ length: 40 }, (_, i) => `t${pad(i + 1)}`));
        expect(Math.max(...down.map((now) => now.scrolled)), "the list scrolled while Tab went down").toBeGreaterThan(1000);
        for (const now of down) {
            expect(now.fromTop, `Tab: the box of ${now.name} is ${now.fromTop}px under the top edge of the list`).toBeGreaterThanOrEqual(0);
            expect(now.fromBottom, `Tab: the box of ${now.name} is ${now.fromBottom}px above the bottom edge of the list`).toBeGreaterThanOrEqual(0);
            if (browserName === "chromium" && now.scrolled > 0) {
                expect(now.fromBottom, `Tab: the box of ${now.name} is ${now.fromBottom}px above the bottom edge of the list, and a step is ${step}px`).toBeGreaterThanOrEqual(step - 0.5);
            }
        }
        const up = await walk("Shift+Tab", "export-tables-all");
        expect(up.map((now) => now.name), "Shift+Tab went up every row").toEqual(Array.from({ length: 40 }, (_, i) => `t${pad(40 - i)}`));
        expect(Math.min(...up.map((now) => now.scrolled)), "the list scrolled back while Shift+Tab went up").toBeLessThan(200);
        for (const now of up) {
            expect(now.fromTop, `Shift+Tab: the box of ${now.name} is ${now.fromTop}px under the top edge of the list`).toBeGreaterThanOrEqual(0);
            expect(now.fromBottom, `Shift+Tab: the box of ${now.name} is ${now.fromBottom}px above the bottom edge of the list`).toBeGreaterThanOrEqual(0);
        }
    });

    // ---- the ticks, and the word "view"

    for (const theme of THEMES) {
        test(`${theme} theme: a tick box (a row's, and the box for all) is drawn in the site's accent`, async ({ page, app }) => {
            await page.emulateMedia({ colorScheme: theme, reducedMotion: "reduce" });
            await openMade(app, "create table ok_one(a); create table ok_two(a);");
            await app.openTables();
            await app.waitCounted();
            await app.tablesAll.check();
            await expect(app.tablesBox("ok_one")).toBeChecked();
            const accent = await tokenValue(page, "color", "--accent");
            expect(await styleOf(app.tablesBox("ok_one"), "accentColor"), "the accent colour of a row's box").toBe(accent);
            expect(await styleOf(app.tablesBox("ok_two"), "accentColor"), "the accent colour of the second row's box").toBe(accent);
            expect(await styleOf(app.tablesAll, "accentColor"), "the accent colour of the box for all").toBe(accent);
        });

        test(`${theme} theme: the word "view" beside a view's name has the control radius and the muted colour`, async ({ page, app }) => {
            await page.emulateMedia({ colorScheme: theme, reducedMotion: "reduce" });
            await openMade(app, "create table base_one(a); create view v_one as select a from base_one;");
            await app.openTables();
            await app.waitCounted();
            const kind = app.tablesRow("v_one").locator(".tables-row-kind");
            await expect(kind).toHaveText(words.EXPORT_TABLES_VIEW_WORD);
            expect(await styleOf(kind, "borderTopLeftRadius"), "the corner of the tag").toBe(await tokenValue(page, "borderTopLeftRadius", "--radius-control"));
            expect(await styleOf(kind, "borderBottomRightRadius"), "the other corner of the tag").toBe(await tokenValue(page, "borderTopLeftRadius", "--radius-control"));
            expect(await styleOf(kind, "color"), "the colour of the tag").toBe(await tokenValue(page, "color", "--graphite"));
        });
    }

    // ---- a line under a name, and the width at which a line goes under it

    // where the name (the label) and the line of a row are, and where the content of the row ends on the right
    const lineAndRow = (app, name) =>
        app.tablesRow(name).evaluate((row) => {
            const rect = (node) => {
                const box = node.getBoundingClientRect();
                return { left: box.left, right: box.right, top: box.top, bottom: box.bottom, width: box.width };
            };
            const style = getComputedStyle(row);
            return {
                label: rect(row.querySelector(".tables-row-label")),
                line: rect(row.querySelector(".tables-row-line")),
                contentRight: row.getBoundingClientRect().right - parseFloat(style.paddingRight) - parseFloat(style.borderRightWidth),
            };
        });

    for (const width of [360, 700, 1366]) {
        test(`${width} px wide: the reason of a row that cannot be ticked, under its name, reaches the right edge of the row's content`, async ({ page, app }) => {
            await page.setViewportSize({ width, height: 900 });
            await openMade(app, `${GONE_VIEW("n_gone")} create table ok_one(a);`);
            await app.openTables();
            await app.waitCounted();
            const places = await lineAndRow(app, "n_gone");
            expect(places.line.top, `${width} px: the reason is under the name`).toBeGreaterThanOrEqual(places.label.bottom - 1);
            expect(Math.abs(places.line.right - places.contentRight), `${width} px: the reason ends at ${places.line.right} and the row's content at ${places.contentRight}`).toBeLessThanOrEqual(1);
        });
    }

    test("360 px wide: the Saved as line of a ticked table whose name has 100 characters, under the name, reaches the right edge of the row's content", async ({ page, app }) => {
        await page.setViewportSize({ width: 360, height: 900 });
        const long = "a-very-long-table-name-with-no-space-in-it-".repeat(3).slice(0, 100);
        await openMade(app, `create table "${long}"(x); insert into "${long}" values (1);`);
        await app.openTables();
        await app.waitCounted();
        await app.tickTables([long]);
        await expect(app.tablesRow(long).locator(".tables-row-saved")).toHaveText(words.exportTablesSavedAsText(`${long.replace(/-/g, "_")}.csv`));
        const places = await lineAndRow(app, long);
        expect(places.line.top, "the Saved as line is under the name").toBeGreaterThanOrEqual(places.label.bottom - 1);
        expect(Math.abs(places.line.right - places.contentRight), `the line ends at ${places.line.right} and the row's content at ${places.contentRight}`).toBeLessThanOrEqual(1);
    });

    // 36rem is 576 px: a window that wide or narrower puts the count of a row under its name
    test("at 570 px wide the count of a row is under its name, and at 580 px it is beside it", async ({ page, app }) => {
        await openMade(app, "create table basic_one(a); insert into basic_one values (1);");
        await page.setViewportSize({ width: 570, height: 900 });
        await app.openTables();
        await app.waitCounted();
        const narrow = await lineAndRow(app, "basic_one");
        expect(narrow.line.top, "570 px: the count is under the name").toBeGreaterThanOrEqual(narrow.label.bottom - 1);
        expect(Math.abs(narrow.line.left - narrow.label.left), "570 px: the count starts where the name starts").toBeLessThanOrEqual(1);
        await page.setViewportSize({ width: 580, height: 900 });
        // (the same dialog and row, a window ten pixels wider: the page lays it out again in a frame or two)
        await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
        const wide = await lineAndRow(app, "basic_one");
        expect(wide.line.top, "580 px: the count is on the line of the name, not under it").toBeLessThan(wide.label.bottom);
        expect(wide.line.left, "580 px: the count is at the right of the name").toBeGreaterThanOrEqual(wide.label.right - 1);
    });
});

// ---- 16. a key held down, and Escape between two steps of an export -------------------------------------------

test.describe("a key that is held down, and Escape between two steps of an export", () => {
    test("Enter held on the menu entry of a database with one table opens the dialog, and the repeats that follow press nothing: no export is started", async ({ page, app }) => {
        await openMade(app, "create table only_one(a); insert into only_one values (1), (2);");
        const downloads = recordDownloads(page);
        await app.recordToasts();
        await app.openExportMenu();
        await app.tablesItem.focus();
        // the first keydown chooses the entry: the dialog opens with its one table ticked, and the focus on its box
        await page.keyboard.down("Enter");
        await expect(app.tablesDialog).toBeVisible();
        await app.waitCounted();
        await expect(app.tablesBox("only_one")).toBeFocused();
        await expect(app.tablesSubmit).toHaveAttribute("aria-disabled", "false");
        await page.evaluate(() => {
            window.__submits = 0;
            document.querySelector("#export-tables-form").addEventListener("submit", () => window.__submits++);
        });
        // the key is still down: the keyboard repeats it (a key that is pressed again while it is down)
        await page.keyboard.down("Enter");
        await page.keyboard.down("Enter");
        await page.keyboard.up("Enter");
        expect(await page.evaluate(() => window.__submits)).toBe(0);
        await expect(app.tablesProgress).toBeHidden();
        await expect(app.tablesDialog).toBeVisible();
        await expect(app.tablesBox("only_one")).toBeFocused();
        expect(downloads).toEqual([]);
        expect(await eventsOfOpen(page)).toEqual([]);
        await app.expectToasts([]);
        expect(downloads).toEqual([]);
    });

    test("Enter held on Export does not press Cancel, which has the focus once the export runs: a table of many pieces ends with its file", async ({ page, app }) => {
        test.slow();
        await openMade(app, HEAVY("heavy"));
        await slowDown(page);
        const downloads = recordDownloads(page);
        await app.recordToasts();
        await app.openTables();
        await app.waitCounted();
        await expect(app.tablesBox("heavy")).toBeChecked();
        await app.tablesSubmit.focus();
        const saved = page.waitForEvent("download", { timeout: 25_000 });
        saved.catch(() => {});
        await page.keyboard.down("Enter");
        await expect(app.tablesProgress).toBeVisible();
        await expect(app.tablesCancel).toBeFocused();
        await expect.poll(() => rowsWritten(app)).toBeGreaterThan(0);
        // the key is held: it repeats on Cancel, in the middle of the table
        await page.keyboard.down("Enter");
        await page.keyboard.down("Enter");
        await page.keyboard.up("Enter");
        expect(await rowsWritten(app)).toBeLessThan(6000);
        await expect(app.tablesDialog).toBeVisible();
        await expect(app.tablesProgress).toBeVisible();
        // the export was not stopped: it ends with its file, and says so
        expect((await saved).suggestedFilename()).toBe("heavy.csv");
        await expect(app.tablesDialog).toBeHidden();
        await expect(app.toast).toContainText(words.exportedTablesMessage("heavy.csv", { rows: 6000 }));
        await app.expectToasts([words.exportedTablesMessage("heavy.csv", { rows: 6000 })]);
        expect(downloads).toEqual(["heavy.csv"]);
    });

    test("one press of Enter on a ticked box still presses Export, as in any form", async ({ page, app }) => {
        await openMade(app, "create table a1(x); insert into a1 values (1); create table a2(x);");
        await app.openTables();
        await app.waitCounted();
        await app.tickTables(["a1"]);
        await app.tablesBox("a1").focus();
        const file = await app.download(() => page.keyboard.press("Enter"));
        expect(file.name).toBe("a1.csv");
        await expect(app.tablesDialog).toBeHidden();
    });

    // ---- a key held down after the dialog has closed

    // The first press of Enter is a press; every other one that comes while the key is still down is
    // a repeat (the keyboard sends them about every 30 ms). A dialog that closes under the key must
    // not let the repeats reach the page: the focus goes back to the Export button (or More), and a
    // repeat there would open its menu, and the next repeat would press "Database (.db)..." and
    // save the database again and again.
    // (a menu that is opened and closed again by the repeats ends as it began: whatever opens is kept)
    const repeatEnter = async (page, times = 12) => {
        await page.evaluate(() => {
            window.__opened = [];
            const note = (name) => () => window.__opened.push(name);
            for (const id of ["export-button", "more-button"]) {
                const button = document.getElementById(id);
                new MutationObserver(() => button.getAttribute("aria-expanded") === "true" && note(id)()).observe(button, { attributes: true, attributeFilter: ["aria-expanded"] });
            }
            const database = document.getElementById("export-dialog");
            new MutationObserver(() => database.open && note("export-dialog")()).observe(database, { attributes: true, attributeFilter: ["open"] });
        });
        for (let i = 0; i < times; i++) {
            await page.keyboard.down("Enter");
            await page.waitForTimeout(30);
        }
    };
    // what a held key could have pressed on the page: a menu opened, the dialog of the database export
    // (and where it saves the database from), the files that were saved, and where the focus is
    const afterRepeats = async (page, downloads) => {
        await page.waitForTimeout(400);
        return page.evaluate(
            (saved) => ({
                exportMenuOpen: document.querySelector("#export-button").getAttribute("aria-expanded"),
                moreMenuOpen: document.querySelector("#more-button").getAttribute("aria-expanded"),
                databaseDialogOpen: document.querySelector("#export-dialog").open,
                tablesDialogOpen: document.querySelector("#export-tables-dialog").open,
                downloads: saved,
                opened: window.__opened,
                focus: document.activeElement?.id || document.activeElement?.tagName,
            }),
            [...downloads]
        );
    };
    const QUIET = (downloads, focus) => ({ exportMenuOpen: "false", moreMenuOpen: "false", databaseDialogOpen: false, tablesDialogOpen: false, downloads, opened: [], focus });
    // (repeatTaken, of the kit, says whether the page is taking repeats of Enter away at this moment)

    test("Enter held on Export of a database with one small table saves its file once, and the repeats after the dialog has closed press nothing: no menu, no database export, the focus on the Export button; the next press of Enter opens the menu", async ({ page, app }) => {
        await openMade(app, "create table only_one(a); insert into only_one values (1), (2);");
        const downloads = recordDownloads(page);
        await app.openTables();
        await app.waitCounted();
        await expect(app.tablesBox("only_one")).toBeChecked();
        await app.tablesSubmit.focus();
        const saved = page.waitForEvent("download");
        await page.keyboard.down("Enter");
        expect((await saved).suggestedFilename()).toBe("only_one.csv");
        await expect(app.tablesDialog).toBeHidden();
        await expect(app.exportMenuButton).toBeFocused();
        // the key is still down: it repeats, on the page
        await repeatEnter(page);
        expect(await afterRepeats(page, downloads)).toEqual(QUIET(["only_one.csv"], "export-button"));
        // let go: one press of Enter on the button opens the menu, as it always does
        await page.keyboard.up("Enter");
        await page.keyboard.press("Enter");
        await expect(app.exportMenuButton).toHaveAttribute("aria-expanded", "true");
        await expect(app.exportMenu).toBeVisible();
        expect(downloads).toEqual(["only_one.csv"]);
    });

    test("Enter held on Cancel of the idle dialog closes it and the repeats press nothing: no file at all, no menu, the focus on the Export button; the next press of Enter opens the menu", async ({ page, app }) => {
        await openMade(app, "create table only_one(a); insert into only_one values (1), (2);");
        const downloads = recordDownloads(page);
        await app.openTables();
        await app.waitCounted();
        await app.tablesCancel.focus();
        await page.keyboard.down("Enter");
        await expect(app.tablesDialog).toBeHidden();
        await expect(app.exportMenuButton).toBeFocused();
        await repeatEnter(page);
        expect(await afterRepeats(page, downloads)).toEqual(QUIET([], "export-button"));
        await page.keyboard.up("Enter");
        await page.keyboard.press("Enter");
        await expect(app.exportMenuButton).toHaveAttribute("aria-expanded", "true");
        await expect(app.exportMenu).toBeVisible();
        expect(downloads).toEqual([]);
    });

    test("Enter held on Close of the note an export with a BLOB ends with closes it and the repeats press nothing: the one file is the only one saved, the focus on the Export button; the next press of Enter opens the menu", async ({ page, app }) => {
        await openMade(app, "create table blobs(x); insert into blobs values (x'00ff');");
        const downloads = recordDownloads(page);
        const file = await app.exportTables(["blobs"]);
        expect(file.name).toBe("blobs.csv");
        await expect(app.tablesNote).toBeVisible();
        await expect(app.tablesCancel).toBeFocused();
        await expect(app.tablesCancel).toHaveText(words.EXPORT_TABLES_CLOSE_TEXT);
        await page.keyboard.down("Enter");
        await expect(app.tablesDialog).toBeHidden();
        await expect(app.exportMenuButton).toBeFocused();
        await repeatEnter(page);
        expect(await afterRepeats(page, downloads)).toEqual(QUIET(["blobs.csv"], "export-button"));
        await page.keyboard.up("Enter");
        await page.keyboard.press("Enter");
        await expect(app.exportMenuButton).toHaveAttribute("aria-expanded", "true");
        expect(downloads).toEqual(["blobs.csv"]);
    });

    test("on a phone, through the More menu: Enter held on Export puts the focus back on More, and the repeats leave the More menu closed and save nothing more", async ({ page, app }) => {
        await page.setViewportSize({ width: 390, height: 844 });
        await openMade(app, "create table only_one(a); insert into only_one values (1), (2);");
        expect(await app.isPhone()).toBe(true);
        const downloads = recordDownloads(page);
        await app.openTables();
        await app.waitCounted();
        await app.tablesSubmit.focus();
        const saved = page.waitForEvent("download");
        await page.keyboard.down("Enter");
        expect((await saved).suggestedFilename()).toBe("only_one.csv");
        await expect(app.tablesDialog).toBeHidden();
        await expect(app.moreButton).toBeFocused();
        await repeatEnter(page);
        expect(await afterRepeats(page, downloads)).toEqual(QUIET(["only_one.csv"], "more-button"));
        await expect(app.moreMenu).toBeHidden();
        await page.keyboard.up("Enter");
        await page.keyboard.press("Enter");
        await expect(app.moreButton).toHaveAttribute("aria-expanded", "true");
        await expect(app.moreMenu).toBeVisible();
    });

    test("a dialog closed with the mouse changes nothing for the keyboard: the first press of Enter after it acts", async ({ page, app }) => {
        await openMade(app, "create table only_one(a); insert into only_one values (1), (2);");
        const downloads = recordDownloads(page);
        await app.openTables();
        await app.waitCounted();
        await app.tablesCancel.click();
        await expect(app.tablesDialog).toBeHidden();
        await expect(app.exportMenuButton).toBeFocused();
        // (the page listens for repeats since the dialog closed, whichever way it closed)
        expect(await repeatTaken(page)).toBe(true);
        // no key was down: this press is not a repeat, and the page takes it; the listening ends
        // with it, before the key is let go
        await page.keyboard.down("Enter");
        expect(await repeatTaken(page)).toBe(false);
        await page.keyboard.up("Enter");
        await expect(app.exportMenuButton).toHaveAttribute("aria-expanded", "true");
        await expect(app.exportMenu).toBeVisible();
        await expect(page.locator("#export-db")).toBeFocused();
        // and the one after it, the entry of the menu, opens its dialog
        await page.keyboard.press("Enter");
        await expect(page.locator("#export-dialog")).toBeVisible();
        expect(downloads).toEqual([]);
    });

    // No other key is touched while the page listens: a key that repeats on the page after a dialog
    // was closed with the mouse (an arrow, Backspace, a letter) goes where it always goes. Repeats
    // are handed to the window itself, and a listener of this test, which is added after the page's
    // own, tells whether each one got through (a repeat that is taken away reaches no other listener).
    test("a dialog closed with the mouse: while the page listens for a held Enter, a repeat of another key (ArrowDown, Backspace, a letter) is left alone, and the listening goes on until Enter is pressed", async ({ page, app }) => {
        await openMade(app, "create table only_one(a); insert into only_one values (1), (2);");
        await app.openTables();
        await app.waitCounted();
        await app.tablesCancel.click();
        await expect(app.tablesDialog).toBeHidden();
        expect(await repeatTaken(page)).toBe(true);
        await page.evaluate(() => {
            window.__heardKeys = [];
            window.addEventListener("keydown", (event) => window.__heardKeys.push(event.key));
        });
        for (const key of ["ArrowDown", "Backspace", "a"]) {
            const left = await page.evaluate((name) => window.dispatchEvent(new KeyboardEvent("keydown", { key: name, repeat: true, cancelable: true })), key);
            expect(left, `a repeat of ${key} is not taken away`).toBe(true);
        }
        expect(await page.evaluate(() => window.__heardKeys)).toEqual(["ArrowDown", "Backspace", "a"]);
        // the page still listens for a held Enter, after those keys, until a press of Enter
        expect(await repeatTaken(page)).toBe(true);
        await page.keyboard.down("Enter");
        expect(await repeatTaken(page)).toBe(false);
        await page.keyboard.up("Enter");
    });

    // The browser tells of a closing again a moment after the dialog has gone (its "close" event,
    // 1 to 15 ms later). A press of Enter that comes in between, and is not a repeat, ends the
    // listening as it should; the late event must not start it again, or the repeats of that very
    // press, which is down meanwhile, would be taken away. The moment is made by the kit's
    // watchClosing (a MutationObserver on the dialog's open attribute: it runs as soon as the dialog
    // has closed, before the "close" event), and the test says whether it was that moment.
    for (const way of ["Escape", "Cancel"]) {
        test(`${way}: a press of Enter that is not a repeat, between the dialog going and the browser's close event, is not followed by a new listening: the repeats of that press reach the page`, async ({ page, app }) => {
            await openMade(app, "create table only_one(a); insert into only_one values (1), (2);");
            await app.openTables();
            await app.waitCounted();
            await watchClosing(page, "#export-tables-dialog", { freshPress: true });
            if (way === "Escape") {
                await page.keyboard.press("Escape");
            } else {
                await app.tablesCancel.click();
            }
            await expect(app.tablesDialog).toBeHidden();
            await expect.poll(async () => (await closingSeen(page)).closeSeen).toBe(true);
            // (the press was made before the browser said that the dialog had closed; if it was not,
            // this test shows nothing)
            const seen = await closingSeen(page);
            expect(seen.at, "the dialog was seen to have gone").toBe(true);
            expect(seen.beforeClose, "the press came before the close event").toBe(true);
            expect(await repeatTaken(page)).toBe(false);
        });
    }

    // An export that ends by itself closes the dialog with its own call, and ends its session first,
    // before the dialog goes: the guard is then put on before the browser's close event, and a
    // press of Enter that comes in between ends it. Were the session ended only by the close event,
    // that event would put the guard on after the press, and the repeats of the press would be
    // taken away.
    test("an export that ends by itself: a press of Enter that is not a repeat, between the dialog going and the browser's close event, is not followed by a new listening: the repeats of that press reach the page", async ({ page, app }) => {
        await openMade(app, "create table only_one(a); insert into only_one values (1), (2);");
        const downloads = recordDownloads(page);
        await app.openTables();
        await app.waitCounted();
        await expect(app.tablesBox("only_one")).toBeChecked();
        await watchClosing(page, "#export-tables-dialog", { freshPress: true });
        const file = await app.download(() => app.tablesSubmit.click());
        expect(file.name).toBe("only_one.csv");
        await expect(app.tablesDialog).toBeHidden();
        await expect.poll(async () => (await closingSeen(page)).closeSeen).toBe(true);
        const seen = await closingSeen(page);
        expect(seen.at, "the dialog was seen to have gone").toBe(true);
        expect(seen.beforeClose, "the press came before the close event").toBe(true);
        expect(await repeatTaken(page), "the late close event started the listening again, after the press").toBe(false);
        expect(downloads).toEqual(["only_one.csv"]);
    });

    // The page listens for a held Enter once for each closing of the dialog in a visit, not only for
    // the first one: after the listening has ended (Enter pressed and let go), the next closing
    // puts it on again.
    test("a dialog closed with the mouse twice in one visit: the page listens for a held Enter after each closing, and not after the press of Enter between them", async ({ page, app }) => {
        await openMade(app, "create table only_one(a); insert into only_one values (1), (2);");
        const downloads = recordDownloads(page);
        await app.openTables();
        await app.waitCounted();
        await app.tablesCancel.click();
        await expect(app.tablesDialog).toBeHidden();
        expect(await repeatTaken(page), "the first closing puts the listening on").toBe(true);
        // Enter pressed and let go: it ends the listening, and opens the Export menu, as it always does
        await page.keyboard.down("Enter");
        await page.keyboard.up("Enter");
        expect(await repeatTaken(page), "the listening has ended").toBe(false);
        await expect(app.exportMenu).toBeVisible();
        // the dialog again, and closed again with the mouse
        await app.openTables();
        await app.waitCounted();
        await app.tablesCancel.click();
        await expect(app.tablesDialog).toBeHidden();
        expect(await repeatTaken(page), "the second closing puts the listening on again").toBe(true);
        // and it ends as before
        await page.keyboard.down("Enter");
        expect(await repeatTaken(page)).toBe(false);
        await page.keyboard.up("Enter");
        expect(downloads).toEqual([]);
    });

    // Escape is heard at every opening, not at the first only: the second Escape of a visit ends
    // its session as the first did, before the dialog has gone.
    test("Escape twice in one visit: a press of Enter that is not a repeat, between the dialog going and the browser's close event of the second closing, is not followed by a new listening", async ({ page, app }) => {
        await openMade(app, "create table only_one(a); insert into only_one values (1), (2);");
        await app.openTables();
        await app.waitCounted();
        await page.keyboard.press("Escape");
        await expect(app.tablesDialog).toBeHidden();
        // (a press of Enter that is not a repeat, handed to the window: it ends the listening the first closing began)
        await page.evaluate(() => window.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", cancelable: true })));
        expect(await repeatTaken(page), "the listening of the first closing has ended").toBe(false);
        await app.openTables();
        await app.waitCounted();
        await watchClosing(page, "#export-tables-dialog", { freshPress: true });
        await page.keyboard.press("Escape");
        await expect(app.tablesDialog).toBeHidden();
        await expect.poll(async () => (await closingSeen(page)).closeSeen).toBe(true);
        const seen = await closingSeen(page);
        expect(seen.at, "the dialog was seen to have gone").toBe(true);
        expect(seen.beforeClose, "the press came before the close event").toBe(true);
        expect(await repeatTaken(page), "the close event put the listening on after the press: Escape was not heard the second time").toBe(false);
    });

    test("a cancel event that comes up from inside the dialog is not Escape: the rows stay, ticked, no repeat of Enter is taken away, and Export saves its file whole", async ({ page, app }) => {
        await openMade(app, "create table kept_a(a); insert into kept_a values (1), (2); create table kept_b(b); insert into kept_b values (3);");
        const downloads = recordDownloads(page);
        await app.openTables();
        await app.waitCounted();
        await app.tickTables(["kept_a"]);
        const rows = await app.tablesRows();
        // (a file chooser that is dismissed tells of itself with an event of this name, and it bubbles)
        await page.evaluate(() => document.querySelector("#export-tables-dialog .tables-row-box").dispatchEvent(new Event("cancel", { bubbles: true })));
        expect(await repeatTaken(page)).toBe(false);
        await expect(app.tablesDialog).toBeVisible();
        expect(await app.tablesRows()).toEqual(rows);
        expect(await tickedNames(app)).toEqual(["kept_a"]);
        await expect(app.tablesSubmit).toHaveAttribute("aria-disabled", "false");
        const file = await app.download(() => app.tablesSubmit.click());
        expect(file.name).toBe("kept_a.csv");
        // (the file starts with a byte order mark, as every file of the export does)
        expect(file.text).toBe("\uFEFFa\r\n1\r\n2\r\n");
        await expect(app.tablesDialog).toBeHidden();
        expect(downloads).toEqual(["kept_a.csv"]);
    });

    test("Enter held on the menu entry opens the dialog, and Escape pressed while it is still down: the repeats press nothing, no menu, no dialog, the focus on the Export button; the next press of Enter opens the menu", async ({ page, app }) => {
        await openMade(app, "create table only_one(a); insert into only_one values (1), (2);");
        const downloads = recordDownloads(page);
        await app.openExportMenu();
        await app.tablesItem.focus();
        await page.keyboard.down("Enter");
        await expect(app.tablesDialog).toBeVisible();
        await app.waitCounted();
        await page.keyboard.press("Escape");
        await expect(app.tablesDialog).toBeHidden();
        await expect(app.exportMenuButton).toBeFocused();
        await repeatEnter(page);
        expect(await afterRepeats(page, downloads)).toEqual(QUIET([], "export-button"));
        await page.keyboard.up("Enter");
        await page.keyboard.press("Enter");
        await expect(app.exportMenuButton).toHaveAttribute("aria-expanded", "true");
        await expect(app.exportMenu).toBeVisible();
        expect(downloads).toEqual([]);
    });

    // Only Enter let go ends it. The keyboard goes on repeating the key that was pressed last while
    // another key is let go, and on many keyboards while Shift is pressed: neither may let the
    // repeats through to the page again.
    test("Enter held on Export while Tab, which brought the focus there, is still down: Tab let go once the dialog has closed does not let the repeats through", async ({ page, app }) => {
        await openMade(app, "create table only_one(a); insert into only_one values (1), (2);");
        const downloads = recordDownloads(page);
        await app.openTables();
        await app.waitCounted();
        await expect(app.tablesBox("only_one")).toBeChecked();
        // Tab goes down on the last box and takes the focus to Export; Enter goes down before Tab is let go
        await app.tablesBox("only_one").focus();
        await page.keyboard.down("Tab");
        await expect(app.tablesSubmit).toBeFocused();
        const saved = page.waitForEvent("download");
        await page.keyboard.down("Enter");
        expect((await saved).suggestedFilename()).toBe("only_one.csv");
        await expect(app.tablesDialog).toBeHidden();
        await expect(app.exportMenuButton).toBeFocused();
        await page.keyboard.up("Tab");
        await repeatEnter(page);
        expect(await afterRepeats(page, downloads)).toEqual(QUIET(["only_one.csv"], "export-button"));
        // Enter let go: the next press opens the menu, as it always does
        await page.keyboard.up("Enter");
        await page.keyboard.press("Enter");
        await expect(app.exportMenuButton).toHaveAttribute("aria-expanded", "true");
        expect(downloads).toEqual(["only_one.csv"]);
    });

    test("Enter held on Cancel, and Shift pressed and let go while it is still down: the repeats press nothing, before and after", async ({ page, app }) => {
        await openMade(app, "create table only_one(a); insert into only_one values (1), (2);");
        const downloads = recordDownloads(page);
        await app.openTables();
        await app.waitCounted();
        await app.tablesCancel.focus();
        await page.keyboard.down("Enter");
        await expect(app.tablesDialog).toBeHidden();
        await expect(app.exportMenuButton).toBeFocused();
        // (a listener of this test, on the window as the page's own is, and added after it: a repeat
        // that is taken away goes to no other listener, so that nothing on the page that listens for
        // keys can act on one)
        await page.evaluate(() => {
            window.__heard = 0;
            window.addEventListener("keydown", (event) => event.key === "Enter" && window.__heard++, true);
        });
        await page.keyboard.down("Shift");
        await repeatEnter(page);
        expect(await afterRepeats(page, downloads)).toEqual(QUIET([], "export-button"));
        await page.keyboard.up("Shift");
        await repeatEnter(page);
        expect(await afterRepeats(page, downloads)).toEqual(QUIET([], "export-button"));
        expect(await page.evaluate(() => window.__heard)).toBe(0);
        // the page listens for as long as Enter is down, and no longer
        expect(await repeatTaken(page)).toBe(true);
        await page.keyboard.up("Enter");
        expect(await repeatTaken(page)).toBe(false);
        await page.evaluate(() => (window.__heard = 0));
        await page.keyboard.press("Enter");
        expect(await page.evaluate(() => window.__heard)).toBe(1);
        await expect(app.exportMenuButton).toHaveAttribute("aria-expanded", "true");
        await expect(app.exportMenu).toBeVisible();
        expect(downloads).toEqual([]);
    });

    // ---- Escape between two steps of an export

    // Two roads to the page's turn between two pieces (js/lab/import-pace.js): scheduler.yield, and
    // where a browser has none the message that the page sends itself on a channel of its own. Both
    // Chromium and Firefox have the first, so the second is made by taking it away before the
    // page's scripts run.
    for (const road of ["with scheduler.yield", "without scheduler.yield, by a message on a channel"]) {
        test(`Escape reaches the export before a step that was waiting for its turn can save the file: the cancel event of the dialog tells it to stop (${road})`, async ({ page, app }) => {
            // One table of three rows is one piece, which is the last: the export waits for its turn, and
            // when the turn comes the file is saved (nothing is awaited after it). The turn is held here
            // and given by a listener of this test on the dialog's cancel event, which is added after the
            // page's own and so runs after it, and before the browser's close event. The clock of the
            // page stands still meanwhile, so that the export takes this turn and not a frame.
            const withoutYield = road.startsWith("without");
            if (withoutYield) {
                await page.addInitScript(() => {
                    Object.defineProperty(globalThis, "scheduler", { value: undefined, configurable: true });
                    // (the far end of every channel the page makes, by its near end, so that the held turn can be given
                    // from inside the cancel event, as a promise is: a message would be a task of its own, and a
                    // browser may close the dialog before it)
                    const Channel = globalThis.MessageChannel;
                    const far = new Map();
                    window.__farPorts = far;
                    globalThis.MessageChannel = function () {
                        const channel = new Channel();
                        far.set(channel.port2, channel.port1);
                        return channel;
                    };
                });
            }
            await openMade(app, "create table one_table(x); insert into one_table values (1), (2), (3);");
            expect(await page.evaluate(() => typeof globalThis.scheduler?.yield)).toBe(withoutYield ? "undefined" : "function");
            const downloads = recordDownloads(page);
            const key = await logKey(page);
            const before = await snapshot(page, app);
            await app.recordToasts();
            await app.openTables();
            await app.waitCounted();
            await page.evaluate(() => {
                const gate = { held: false, seen: false, release: null };
                window.__gate = gate;
                const now = performance.now.bind(performance);
                const frozen = now();
                performance.now = () => frozen;
                let armed = true;
                // the first turn the export asks for is held, and given back by the gate's release
                const hold = (give) => {
                    armed = false;
                    gate.held = true;
                    gate.release = () => {
                        performance.now = now;
                        gate.release = null;
                        give();
                    };
                };
                if (typeof globalThis.scheduler?.yield === "function") {
                    const real = globalThis.scheduler.yield.bind(globalThis.scheduler);
                    globalThis.scheduler.yield = () => {
                        if (!armed) {
                            return real();
                        }
                        return new Promise((resolve) => hold(resolve));
                    };
                } else {
                    const post = MessagePort.prototype.postMessage;
                    MessagePort.prototype.postMessage = function (...args) {
                        if (!armed) {
                            return post.apply(this, args);
                        }
                        // the message is not sent: the page's own handler for it is called when the turn is given
                        hold(() => window.__farPorts.get(this).onmessage({ data: null }));
                    };
                }
                const dialog = document.querySelector("#export-tables-dialog");
                dialog.addEventListener("cancel", () => {
                    gate.seen = true;
                    gate.release?.();
                });
                // (should the browser tell of Escape only by the close event, the export is not left held)
                dialog.addEventListener("close", () => gate.release?.());
            });
            await app.tablesSubmit.click();
            await page.waitForFunction(() => window.__gate.held);
            await page.keyboard.press("Escape");
            // the browser did tell of Escape before it closed the dialog, so that the window was there
            expect(await page.evaluate(() => window.__gate.seen)).toBe(true);
            await expect(app.tablesDialog).toBeHidden();
            // (the toasts say what the export did: it was cancelled, or it saved its file)
            await expect.poll(() => app.toasts()).toEqual([words.EXPORT_TABLES_CANCELLED_MESSAGE]);
            await expectNothingLeft(page, app, before, { logKeys: [key] });
            expect(downloads).toEqual([]);
            await app.expectToasts([words.EXPORT_TABLES_CANCELLED_MESSAGE]);
            expect(await eventsOfOpen(page)).toEqual([]);
        });
    }
});

// ---- 17. how the dialog is drawn --------------------------------------------------------------------------------

test.describe("the dialog's own scroll, and what a box that cannot be ticked looks like", () => {
    // After the list has been scrolled to its end and a few more wheel events have come, the dialog
    // itself has not moved: it has nothing to scroll, its title is where the list's scroll puts it
    // and nothing more, and Export and Cancel are where they were.
    async function expectOnlyTheListScrolls(page, app) {
        const frames = (n) => page.evaluate((count) => new Promise((resolve) => (function next(left) { left ? requestAnimationFrame(() => next(left - 1)) : resolve(); })(count)), n);
        const measure = () =>
            page.evaluate(() => {
                const dialog = document.querySelector("#export-tables-dialog");
                const body = dialog.querySelector(".tables-body");
                const box = (selector) => {
                    const rect = document.querySelector(selector).getBoundingClientRect();
                    return [rect.top, rect.bottom];
                };
                return {
                    range: dialog.scrollHeight - dialog.clientHeight,
                    dialogScroll: dialog.scrollTop,
                    dialogBox: box("#export-tables-dialog"),
                    // where the title is in the list's own scroll (it is the first thing the list holds)
                    titleInList: document.querySelector("#export-tables-title").getBoundingClientRect().top - body.getBoundingClientRect().top + body.scrollTop,
                    submit: box("#export-tables-submit"),
                    cancel: box("#export-tables-cancel"),
                    listRoom: body.scrollHeight - body.clientHeight,
                    listScroll: body.scrollTop,
                };
            });
        const before = await measure();
        expect(before.range, "the dialog has nothing to scroll").toBe(0);
        expect(before.listRoom, "the list is long enough to scroll").toBeGreaterThan(100);
        const list = await app.tablesDialog.locator(".tables-list").boundingBox();
        await page.mouse.move(list.x + list.width / 2, list.y + 40);
        for (let i = 0; i < 12; i++) {
            await page.mouse.wheel(0, 300);
            await frames(2);
        }
        // the list has reached its end (and the wheel went on)
        // (to the pixel: the browser's scroll position is a fraction)
        await expect.poll(async () => before.listRoom - (await measure()).listScroll).toBeLessThanOrEqual(1);
        for (let i = 0; i < 4; i++) {
            await page.mouse.wheel(0, 300);
            await frames(3);
        }
        const after = await measure();
        expect(before.listRoom - after.listScroll).toBeLessThanOrEqual(1);
        // (places are fractions of a pixel, and a browser gives the same place to within a hundredth)
        const near = (label, now, was) => now.forEach((value, i) => expect(Math.abs(value - was[i]), `${label}: ${now} and not ${was}`).toBeLessThan(0.5));
        expect(after.dialogScroll, "the dialog was not scrolled").toBe(0);
        near("the dialog", after.dialogBox, before.dialogBox);
        near("the title in the list", [after.titleInList], [before.titleInList]);
        near("Export", after.submit, before.submit);
        near("Cancel", after.cancel, before.cancel);
        expect(after.range).toBe(0);
    }

    test("40 tables at 1280 by 720: the dialog has nothing to scroll, and wheel events over the list leave the title's place and the buttons where they were", async ({ page, app }) => {
        await page.setViewportSize({ width: 1280, height: 720 });
        await openMade(app, manyTables(40));
        await app.openTables();
        await app.waitCounted();
        await expectOnlyTheListScrolls(page, app);
    });

    test("the owner's 14 tables at 1280 by 500: the same", async ({ page, app }) => {
        await page.setViewportSize({ width: 1280, height: 500 });
        await openEdgeCases(app);
        await app.openTables();
        await app.waitCounted();
        await expectOnlyTheListScrolls(page, app);
    });

    test("a tick box that cannot be ticked is drawn dimmed, with its name in the muted colour and the plain cursor, and one that can is not; the box for all is the same when nothing can be ticked", async ({ page, app }) => {
        const style = (locator, property) => locator.evaluate((node, name) => getComputedStyle(node)[name], property);
        const opacity = async (locator) => Number(await style(locator, "opacity"));
        const nameOf = (table) => app.tablesRow(table).locator(".tables-row-label");
        const allName = app.tablesAll.locator("xpath=following-sibling::span");
        await openMade(app, `create table ok_one(a); create table ok_two(a); ${GONE_VIEW("zz_gone")}`);
        await app.openTables();
        await app.waitCounted();
        // dimmed as the style sheet says (0.4): a box at 0.95 would pass for one that can be ticked
        expect(await opacity(app.tablesBox("zz_gone")), "the box of a view that cannot be counted is dimmed to 0.4").toBe(0.4);
        expect(await opacity(app.tablesBox("ok_one"))).toBe(1);
        expect(await opacity(app.tablesBox("ok_two"))).toBe(1);
        expect(await opacity(app.tablesAll)).toBe(1);
        // its name is in another colour than the name of a row that can be ticked
        const liveName = await style(nameOf("ok_one"), "color");
        expect(await style(nameOf("ok_two"), "color")).toBe(liveName);
        expect(await style(nameOf("zz_gone"), "color")).not.toBe(liveName);
        // The pointer says nothing happens. A browser draws the plain arrow over every checkbox, so the
        // rule that asks for it shows only against a rule that asks for another pointer: this one
        // is weaker than the page's own, and the box that can be ticked shows it.
        await page.addStyleTag({ content: "input[type=checkbox] { cursor: pointer; }" });
        expect(await style(app.tablesBox("ok_one"), "cursor")).toBe("pointer");
        expect(await style(app.tablesBox("zz_gone"), "cursor")).toBe("default");
        const liveAllName = await style(allName, "color");
        await app.tablesCancel.click();
        // nothing can be ticked: the box for all is dimmed too, with its words and its pointer
        await openMade(app, `${GONE_VIEW("gone_one")} ${GONE_VIEW("gone_two")}`);
        await app.openTables();
        await app.waitCounted();
        expect(await opacity(app.tablesAll), "the box for all is dimmed to 0.4 when nothing can be ticked").toBe(0.4);
        expect(await opacity(app.tablesBox("gone_one")), "the box of a row that cannot be ticked is dimmed to 0.4").toBe(0.4);
        expect(await style(allName, "color")).not.toBe(liveAllName);
        await page.addStyleTag({ content: "input[type=checkbox] { cursor: pointer; }" });
        expect(await style(app.tablesAll, "cursor")).toBe("default");
        expect(await style(app.tablesBox("gone_one"), "cursor")).toBe("default");
    });

    // How a row is laid out on a window wider than a phone, where a line can sit beside the name:
    // a short one (a count) is beside the name, at the right; a long one (the reason a view cannot
    // be counted or read) is under the name; and a long one that belongs beside the name (the file's
    // name of a table whose own name is 100 characters) takes half of the row at most. Whichever it
    // is, the name keeps its room. The places are the page's own, measured in the page.
    const LONG_NAME = "a-very-long-table-name-with-no-space-in-it-".repeat(3).slice(0, 100);
    const LAYOUT_DATABASE = `create table basic_one(a); insert into basic_one values (1);
        ${GONE_VIEW("n_gone")} ${GONE_VIEW("monthly_revenue_by_region")} ${BAD_VIEW("b_bad")}
        create table "${LONG_NAME}"(x); insert into "${LONG_NAME}" values (1);`;
    // the row of a table: where its name (the label) and its line are, and where the row is; and
    // where the first character of the line's text starts, where its last character ends, and how
    // the line is aligned
    const placesOf = (app, name) =>
        app.tablesRow(name).evaluate((row) => {
            const rect = (node) => {
                const box = node.getBoundingClientRect();
                return { left: box.left, right: box.right, top: box.top, bottom: box.bottom, width: box.width };
            };
            const line = row.querySelector(".tables-row-line");
            const text = document.createTreeWalker(line, NodeFilter.SHOW_TEXT).nextNode();
            const character = (at) => {
                const range = document.createRange();
                range.setStart(text, at);
                range.setEnd(text, at + 1);
                return range.getClientRects();
            };
            const first = character(0)[0];
            const lastRects = character(text.length - 1);
            const last = lastRects[lastRects.length - 1];
            return {
                row: rect(row),
                label: rect(row.querySelector(".tables-row-label")),
                line: rect(line),
                textAlign: getComputedStyle(line).textAlign,
                textStart: first.left,
                textEnd: last.right,
            };
        });
    const SIDE = 1;
    const expectUnderName = (name, places) => {
        // (the line starts where the name starts, and below it)
        expect(Math.abs(places.line.left - places.label.left), `${name}: the line starts at the name's left edge`).toBeLessThanOrEqual(SIDE);
        expect(places.line.top, `${name}: the line is below the name`).toBeGreaterThanOrEqual(places.label.bottom - SIDE);
        expect(places.label.width, `${name}: the name has ${places.label.width}px of a row of ${places.row.width}px`).toBeGreaterThanOrEqual(0.4 * places.row.width);
        // (and the sentence itself is flush left: it is not the right-aligned count that sits beside a name)
        expect(places.textAlign, `${name}: the sentence under the name is aligned to the left`).toBe("left");
        expect(Math.abs(places.textStart - places.label.left), `${name}: the sentence starts where the name starts`).toBeLessThanOrEqual(SIDE);
    };

    for (const width of [1366, 700]) {
        test.describe(`${width} px wide: a line beside a name never crushes it`, () => {
            test.beforeEach(async ({ page, app }) => {
                await page.setViewportSize({ width, height: 900 });
                await openMade(app, LAYOUT_DATABASE);
                await app.openTables();
                await app.waitCounted();
            });

            test("a view that cannot be counted has its line under its name, and its name is not squeezed", async ({ app }) => {
                for (const name of ["n_gone", "monthly_revenue_by_region"]) {
                    expect((await app.tablesRows()).find((row) => row.name === name).line).toContain(uncountedWords());
                    expectUnderName(name, await placesOf(app, name));
                }
            });

            test("after an export failed on a view that cannot be read, that row is drawn the same way", async ({ app }) => {
                await app.tickTables(["b_bad"]);
                await app.tablesSubmit.click();
                await expect(app.tablesError).toHaveText(words.exportTablesFailedText("b_bad", "integer overflow"));
                expect((await app.tablesRows()).find((row) => row.name === "b_bad").line).toBe(words.exportTablesUnreadText("integer overflow"));
                expectUnderName("b_bad", await placesOf(app, "b_bad"));
            });

            test("a ticked table whose name has 100 characters keeps at least 40% of the row, and its Saved as line is beside it and has half of the row at most", async ({ app }) => {
                await app.tickTables([LONG_NAME]);
                await expect(app.tablesRow(LONG_NAME).locator(".tables-row-saved")).toHaveText(words.exportTablesSavedAsText(`${LONG_NAME.replace(/-/g, "_")}.csv`));
                const places = await placesOf(app, LONG_NAME);
                expect(places.label.width, `the name has ${places.label.width}px of a row of ${places.row.width}px`).toBeGreaterThanOrEqual(0.4 * places.row.width);
                expect(places.line.width, `the line has ${places.line.width}px of a row of ${places.row.width}px`).toBeLessThanOrEqual(0.5 * places.row.width + SIDE);
                // (beside the name, at the right of the row)
                expect(places.line.left).toBeGreaterThanOrEqual(places.label.right - SIDE);
                expect(places.line.right).toBeGreaterThan(places.row.right - 10);
                expect(places.line.top).toBeLessThan(places.label.bottom);
            });

            test("a row with a short line, a count, has it beside the name, at the right of the row", async ({ app }) => {
                const places = await placesOf(app, "basic_one");
                expect(places.line.left).toBeGreaterThanOrEqual(places.label.right - SIDE);
                expect(Math.abs(places.line.right - places.row.right)).toBeLessThanOrEqual(SIDE);
                // (on the line of the name, not under it)
                expect(places.line.top).toBeLessThan(places.label.bottom);
                expect(places.label.width).toBeGreaterThanOrEqual(0.4 * places.row.width);
                // the count is aligned to the right: its last character ends at the row's right edge
                expect(places.textAlign).toBe("right");
                expect(Math.abs(places.textEnd - places.row.right), "the count ends at the right edge of the row").toBeLessThanOrEqual(SIDE);
            });
        });
    }

    // The tick box is level with the first line of its name, whatever else the row holds: a second
    // line beside the name ("Saved as ..."), a name that wraps over many lines, a sentence under
    // it. The centre of the box is measured against the centre of the first line of the name (a
    // range over its first character), and a row of one line has that line in the middle of its
    // height. The widths are a wide window, a window with the line beside the name still, and a phone.
    // The stylesheet lets the box down by half of what one line of the box's own is taller than it,
    // so a line of the box's own must be a line of the name: the two line heights are compared too
    // (half a pixel of difference there is under what the measured places can tell).
    const SPACED_NAME = `${"n".repeat(40)} ${"m".repeat(40)} ${"k".repeat(18)}`;
    const BOX_DATABASE = `create table short_one(a); insert into short_one values (1);
        create table "Sales Q1 2025"(a); insert into "Sales Q1 2025" values (1);
        create table "${SPACED_NAME}"(a); insert into "${SPACED_NAME}" values (1);
        ${GONE_VIEW("gone_view")}`;
    const boxAgainstName = (app) =>
        app.tablesDialog.locator(".tables-row").evaluateAll((rows) =>
            rows.map((row) => {
                const label = row.querySelector(".tables-row-label");
                const range = document.createRange();
                const text = document.createTreeWalker(label, NodeFilter.SHOW_TEXT).nextNode();
                range.setStart(text, 0);
                range.setEnd(text, 1);
                const first = range.getClientRects()[0];
                const box = row.querySelector(".tables-row-box").getBoundingClientRect();
                const whole = row.getBoundingClientRect();
                return {
                    name: row.querySelector(".tables-row-name").textContent,
                    lines: Math.round(label.getBoundingClientRect().height / first.height),
                    tickable: row.querySelector(".tables-row-box").getAttribute("aria-disabled") !== "true",
                    ticked: row.querySelector(".tables-row-box").checked,
                    hasSaved: Boolean(row.querySelector(".tables-row-saved")),
                    offset: box.top + box.height / 2 - (first.top + first.height / 2),
                    boxLine: getComputedStyle(row.querySelector(".tables-row-box")).lineHeight,
                    nameLine: getComputedStyle(label).lineHeight,
                    // the first line against the middle of the row's height
                    fromMiddle: first.top + first.height / 2 - (whole.top + whole.height / 2),
                };
            })
        );

    for (const width of [1366, 700, 390]) {
        test(`${width} px wide: the tick box is level with the first line of its name, in a row of one line, with a Saved as line, with a name that wraps, and in a row that cannot be ticked`, async ({ page, app }) => {
            await page.setViewportSize({ width, height: 900 });
            await openMade(app, BOX_DATABASE);
            await app.openTables();
            await app.waitCounted();
            const expectLevel = (rows, state) => {
                expect(rows.map((row) => row.name).sort(), state).toEqual(["Sales Q1 2025", SPACED_NAME, "gone_view", "short_one"].sort());
                for (const row of rows) {
                    // (soft: every row that is off is told, not only the first)
                    expect.soft(Math.abs(row.offset), `${state}: the box of ${row.name.slice(0, 20)} (${row.lines} lines${row.hasSaved ? ", with a Saved as line" : ""}${row.tickable ? "" : ", cannot be ticked"}) is ${row.offset}px under the middle of its first line`).toBeLessThanOrEqual(1);
                    expect.soft(row.boxLine, `${state}: a line of the box of ${row.name.slice(0, 20)} is as tall as a line of its name`).toBe(row.nameLine);
                }
            };
            // nothing ticked: a row of one line, a name that wraps (where the window is narrow, or the
            // name long), and a row that cannot be ticked, with its sentence under the name
            const before = await boxAgainstName(app);
            expect(before.map((row) => row.tickable).filter(Boolean).length, "three rows can be ticked").toBe(3);
            expect(before.find((row) => row.name === "gone_view").tickable).toBe(false);
            expectLevel(before, "nothing ticked");
            // everything that can be ticked is: the rows say where they are saved
            await app.tablesAll.check();
            const after = await boxAgainstName(app);
            expect(after.find((row) => row.name === "Sales Q1 2025").hasSaved, "a ticked row says Saved as").toBe(true);
            expect(after.find((row) => row.name === SPACED_NAME).hasSaved).toBe(true);
            expectLevel(after, "ticked");
            // (the name of 100 characters wraps, with its Saved as line beside it or under it, and the
            // row of 13 characters does not)
            expect(after.find((row) => row.name === SPACED_NAME).lines, "the long name wraps").toBeGreaterThan(1);
            expect(after.find((row) => row.name === "Sales Q1 2025").lines).toBe(1);
            // a row of one line has its line in the middle of its height (a wide window: a row is as
            // tall as a control, and its line is not at the top of it)
            if (width === 1366) {
                const one = before.find((row) => row.name === "short_one");
                expect(one.lines).toBe(1);
                expect(Math.abs(one.fromMiddle), `the line of a row of one line is ${one.fromMiddle}px from the middle of its height`).toBeLessThanOrEqual(1);
            }
        });
    }

    // A browser can be told to draw no text smaller than a size of the student's choosing, and then a
    // line of a name is taller than the page asked for. The box is let down by half of what THAT
    // line is taller than it (the stylesheet measures it in lines of the name, not in the page's own
    // pixels), so it stays level. The test starts a browser of its own with the setting, since a page
    // cannot set it, and first makes sure that the setting is in force.
    test("with a minimum text size of 22 px set in the browser, the tick box is still level with the first line of its name", async ({ browserName, baseURL }) => {
        test.skip(browserName === "webkit", "no switch for a minimum text size is known for this browser");
        const larger =
            browserName === "firefox"
                ? await firefox.launch({ firefoxUserPrefs: { "font.minimum-size.x-western": 22, "font.minimum-size.x-unicode": 22 } })
                : await chromium.launch({ args: ["--blink-settings=minimumFontSize=22,minimumLogicalFontSize=22"] });
        try {
            const page = await larger.newPage({ baseURL, viewport: { width: 1366, height: 900 } });
            const app = new App(page);
            await openMade(app, BOX_DATABASE);
            await app.openTables();
            await app.waitCounted();
            // (a line of a name is 20 px tall as the page asks for it, and about 32 px with the setting)
            const lineHeight = await app.tablesRow("short_one").locator(".tables-row-label").evaluate((label) => parseFloat(getComputedStyle(label).lineHeight));
            expect(lineHeight, "the setting is in force: a line of a name is taller").toBeGreaterThan(28);
            for (const state of ["nothing ticked", "ticked"]) {
                const rows = await boxAgainstName(app);
                expect(rows.length, state).toBe(4);
                for (const row of rows) {
                    expect.soft(Math.abs(row.offset), `${state}: the box of ${row.name.slice(0, 20)} (${row.lines} lines) is ${row.offset}px under the middle of its first line`).toBeLessThanOrEqual(1);
                    expect.soft(row.boxLine, `${state}: a line of the box of ${row.name.slice(0, 20)} is as tall as a line of its name`).toBe(row.nameLine);
                }
                await app.tablesAll.check();
            }
        } finally {
            await larger.close();
        }
    });

    test("in forced colours the name beside a box that cannot be ticked, and Export when it is off, are in the system's grey, unlike a row that can be ticked and Export when it is on", async ({ page, app }) => {
        await page.emulateMedia({ forcedColors: "active" });
        await openMade(app, `create table ok_one(a); create table ok_two(a); ${GONE_VIEW("zz_gone")}`);
        await app.openTables();
        await app.waitCounted();
        // the system's grey, as the page resolves it
        const grey = await page.evaluate(() => {
            const probe = document.createElement("span");
            probe.style.color = "GrayText";
            document.body.append(probe);
            const colour = getComputedStyle(probe).color;
            probe.remove();
            return colour;
        });
        const colour = (locator, property = "color") => locator.evaluate((node, name) => getComputedStyle(node)[name], property);
        const name = (table) => app.tablesRow(table).locator(".tables-row-label");
        expect(await colour(name("zz_gone"))).toBe(grey);
        expect(await colour(name("ok_one"))).not.toBe(grey);
        // Export is off: its words and its edge are grey
        await expect(app.tablesSubmit).toHaveAttribute("aria-disabled", "true");
        expect(await colour(app.tablesSubmit)).toBe(grey);
        expect(await colour(app.tablesSubmit, "borderTopColor")).toBe(grey);
        // under the pointer it stays grey: it does not look like a button that can be pressed
        await app.tablesSubmit.hover();
        await expect.poll(() => app.tablesSubmit.evaluate((node) => node.matches(":hover")), { message: "the pointer is over Export" }).toBe(true);
        expect(await colour(app.tablesSubmit), "the words of Export while it is off, under the pointer").toBe(grey);
        expect(await colour(app.tablesSubmit, "borderTopColor"), "the edge of Export while it is off, under the pointer").toBe(grey);
        // and on, they are not
        await app.tickTables(["ok_one"]);
        await expect(app.tablesSubmit).toHaveAttribute("aria-disabled", "false");
        expect(await colour(app.tablesSubmit)).not.toBe(grey);
        expect(await colour(app.tablesSubmit, "borderTopColor")).not.toBe(grey);
        await app.tablesCancel.click();
        // the name beside the box for all, when nothing can be ticked
        await openMade(app, `${GONE_VIEW("gone_one")} ${GONE_VIEW("gone_two")}`);
        await app.openTables();
        await app.waitCounted();
        expect(await colour(app.tablesAll.locator("xpath=following-sibling::span"))).toBe(grey);
    });
});
