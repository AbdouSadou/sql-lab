// M4 part 1: js/lab/checker.js. The pure part (normalising and comparing) is tested in the
// real browser through import() inside page.evaluate; the rest drives check() on the
// Northlight dataset. AC5 is the engine half of the exercise flow (no panel yet).
const { test, expect, realSet, withSampleDataset } = require("./helpers");

// the shipped model queries, for the "model answer passes" tests
const SET = realSet();
const model = (id) => SET.exercises.find((e) => e.id === id).model_query;
// rows of each model query on Northlight (as tests/m4-panel.spec.js counts them): a pass says how
// many rows matched
const MODEL_ROWS = { e01: 5, e02: 5, e03: 5, e04: 8, e05: 5, e06: 5, e07: 1, e08: 22, e09: 19, e10: 4 };

// A tiny set around one made-up exercise, for tests that need their own model query.
const miniSet = (exercise, dataset = "northlight") => ({
    id: "mini",
    title: "Mini",
    dataset,
    exercises: [
        {
            id: "x1",
            title: "X",
            prompt: "X",
            hints: [],
            model_query: "select 1",
            order_matters: false,
            check_column_names: false,
            ...exercise,
        },
    ],
});

test.describe("normalising a value (pure)", () => {
    test.beforeEach(async ({ page }) => {
        await page.goto("./");
    });

    // same(a, b) tells whether two rows serialise to the same text (so they compare equal)
    const sameRows = (page, a, b) =>
        page.evaluate(
            async ([a, b]) => {
                const { serializeRow } = await import("./js/lab/checker.js");
                // the arguments arrive as source text because BigInt and Uint8Array do not
                // cross the evaluate boundary
                const build = (src) => new Function(`return (${src});`)();
                return serializeRow(build(a)) === serializeRow(build(b));
            },
            [a, b]
        );

    test("INTEGER and TEXT are exact; text '3' is not integer 3", async ({ page }) => {
        expect(await sameRows(page, "[3]", "[3]")).toBe(true);
        expect(await sameRows(page, "[3]", "[4]")).toBe(false);
        expect(await sameRows(page, "['3']", "[3]")).toBe(false);
        expect(await sameRows(page, "['abc']", "['ABC']")).toBe(false);
        expect(await sameRows(page, "['a ']", "['a']")).toBe(false);
        expect(await sameRows(page, "['']", "['']")).toBe(true);
    });

    test("REAL is rounded to 6 decimal places", async ({ page }) => {
        expect(await sameRows(page, "[0.1 + 0.2]", "[0.3]")).toBe(true);
        expect(await sameRows(page, "[1.0000001]", "[1.0000002]")).toBe(true);
        expect(await sameRows(page, "[2.5]", "[2.5000004]")).toBe(true);
        // differs in the 6th decimal place: not equal
        expect(await sameRows(page, "[1.000001]", "[1.000002]")).toBe(false);
        expect(await sameRows(page, "[2.5]", "[2.50001]")).toBe(false);
        expect(await sameRows(page, "[-0.0000001]", "[0]")).toBe(true);
    });

    test("an integer-valued REAL equals the same integer; a rounded one too", async ({ page }) => {
        expect(await sameRows(page, "[3.0]", "[3]")).toBe(true);
        expect(await sameRows(page, "[2.0000001]", "[2]")).toBe(true);
        expect(await sameRows(page, "[3.5]", "[3]")).toBe(false);
        expect(await sameRows(page, "[-0]", "[0]")).toBe(true);
    });

    test("NULL equals only NULL", async ({ page }) => {
        expect(await sameRows(page, "[null]", "[null]")).toBe(true);
        expect(await sameRows(page, "[null]", "['']")).toBe(false);
        expect(await sameRows(page, "[null]", "[0]")).toBe(false);
        expect(await sameRows(page, "[null]", "['NULL']")).toBe(false);
        expect(await sameRows(page, "[null]", "['null']")).toBe(false);
    });

    test("BLOB compares by bytes, and never equals text that looks the same", async ({ page }) => {
        expect(await sameRows(page, "[new Uint8Array([1, 2])]", "[new Uint8Array([1, 2])]")).toBe(true);
        expect(await sameRows(page, "[new Uint8Array([1, 2])]", "[new Uint8Array([1, 3])]")).toBe(false);
        expect(await sameRows(page, "[new Uint8Array([1, 2])]", "[new Uint8Array([1, 2, 0])]")).toBe(false);
        expect(await sameRows(page, "[new Uint8Array([])]", "['']")).toBe(false);
        expect(await sameRows(page, "[new Uint8Array([1, 2])]", "['0102']")).toBe(false);
        expect(await sameRows(page, "[new Uint8Array([1, 2])]", "[{ $blob: '0102' }]")).toBe(false);
        expect(await sameRows(page, "[new Uint8Array([1, 2])]", "['{\"$blob\":\"0102\"}']")).toBe(false);
    });

    test("BigInt is exact, and never equals text that looks the same", async ({ page }) => {
        expect(await sameRows(page, "[9223372036854775807n]", "[9223372036854775807n]")).toBe(true);
        // these two are the same as a JS number; as integers they differ
        expect(await sameRows(page, "[9223372036854775807n]", "[9223372036854775806n]")).toBe(false);
        expect(await sameRows(page, "[9007199254740993n]", "[9007199254740992n]")).toBe(false);
        expect(await sameRows(page, "[9223372036854775807n]", "['9223372036854775807']")).toBe(false);
        expect(await sameRows(page, "[9223372036854775807n]", "[{ $int: '9223372036854775807' }]")).toBe(false);
        // a REAL beyond 2^53 that is an exact integer equals that INTEGER
        expect(await sameRows(page, `[${2 ** 60}]`, "[1152921504606846976n]")).toBe(true);
        // ... and a REAL of 2^63 is not the INTEGER just below it
        expect(await sameRows(page, "[9223372036854775808]", "[9223372036854775807n]")).toBe(false);
    });

    test("Infinity is not NULL, and not -Infinity, and not text", async ({ page }) => {
        expect(await sameRows(page, "[Infinity]", "[Infinity]")).toBe(true);
        expect(await sameRows(page, "[Infinity]", "[null]")).toBe(false);
        expect(await sameRows(page, "[-Infinity]", "[null]")).toBe(false);
        expect(await sameRows(page, "[Infinity]", "[-Infinity]")).toBe(false);
        expect(await sameRows(page, "[Infinity]", "['Infinity']")).toBe(false);
        expect(await sameRows(page, "[NaN]", "[null]")).toBe(false);
    });

    test("row order and arity matter inside a row", async ({ page }) => {
        expect(await sameRows(page, "[1, 2]", "[2, 1]")).toBe(false);
        expect(await sameRows(page, "[1, 2]", "[1, 2, null]")).toBe(false);
        expect(await sameRows(page, "['a,b']", "['a', 'b']")).toBe(false);
    });

    test("displayValue shows values as a reader expects", async ({ page }) => {
        const shown = await page.evaluate(async () => {
            const { displayValue } = await import("./js/lab/checker.js");
            return [
                displayValue(null),
                displayValue(0.1 + 0.2),
                displayValue(3),
                displayValue(new Uint8Array([10, 255])),
                displayValue(9223372036854775807n),
                displayValue("text"),
                displayValue("é".repeat(100)).length,
                displayValue(Infinity),
            ];
        });
        expect(shown).toEqual(["NULL", "0.3", "3", "x'0aff'", "9223372036854775807", "text", 61, "Infinity"]);
    });
});

test.describe("comparing two results (pure)", () => {
    test.beforeEach(async ({ page }) => {
        await page.goto("./");
    });

    // compare runs compareResults in the page. Results are {columns, values}.
    const compare = (page, expected, got, options = {}) =>
        page.evaluate(
            async ([expected, got, options]) => {
                const { compareResults } = await import("./js/lab/checker.js");
                return compareResults(expected, got, options);
            },
            [expected, got, options]
        );
    const result = (columns, values) => ({ columns, values });

    test("identical results pass", async ({ page }) => {
        const r = result(["a", "b"], [[1, "x"], [2, "y"]]);
        // a pass says how many rows matched (the banner's "Correct. 2 rows match.")
        expect(await compare(page, r, r)).toEqual({ status: "pass", rows: 2 });
        expect(await compare(page, result(["a"], []), result(["z"], []))).toEqual({ status: "pass", rows: 0 });
    });

    test("multiset by default: order does not matter, duplicates do", async ({ page }) => {
        const a = result(["n"], [[1], [2], [3]]);
        const b = result(["n"], [[3], [1], [2]]);
        expect(await compare(page, a, b)).toEqual({ status: "pass", rows: 3 });
        expect((await compare(page, a, b, { orderMatters: true })).kind).toBe("row");
        const dupA = result(["n"], [[1], [1], [2]]);
        const dupB = result(["n"], [[1], [2], [2]]);
        expect((await compare(page, dupA, dupB)).kind).toBe("row");
    });

    test("order_matters compares sequences and reports the first differing row, 1-based", async ({ page }) => {
        const a = result(["n"], [[1], [2], [3], [4]]);
        const b = result(["n"], [[1], [2], [4], [3]]);
        const out = await compare(page, a, b, { orderMatters: true });
        expect(out).toMatchObject({ status: "fail", kind: "row", rowIndex: 3, sorted: false });
        expect(out.expected).toEqual([["3"], ["4"]]);
        expect(out.got).toEqual([["4"], ["3"]]);
        expect(out.message.split("\n")[0]).toBe("Row 3 is the first that differs.");
        expect(out.message).toContain("expected:\n  row 3: 3\n  row 4: 4\ngot:\n  row 3: 4\n  row 4: 3");
    });

    test("the diff holds at most 3 rows, from the first differing one", async ({ page }) => {
        const rows = (f) => Array.from({ length: 10 }, (_, i) => [f(i)]);
        const out = await compare(page, result(["n"], rows((i) => i)), result(["n"], rows((i) => (i < 3 ? i : i + 100))), {
            orderMatters: true,
        });
        expect(out.rowIndex).toBe(4);
        expect(out.expected).toEqual([["3"], ["4"], ["5"]]);
        expect(out.got).toEqual([["103"], ["104"], ["105"]]);
        // fewer rows left than 3
        const last = await compare(page, result(["n"], rows((i) => i)), result(["n"], rows((i) => (i === 9 ? 99 : i))), {
            orderMatters: true,
        });
        expect(last.rowIndex).toBe(10);
        expect(last.expected).toEqual([["9"]]);
        expect(last.got).toEqual([["99"]]);
    });

    test("in multiset mode the index is a position among the sorted rows, and the message says so", async ({ page }) => {
        // sorted by JSON text: "a" < "b" < "c"
        const out = await compare(page, result(["s"], [["c"], ["a"], ["b"]]), result(["s"], [["b"], ["z"], ["a"]]));
        expect(out).toMatchObject({ kind: "row", rowIndex: 3, sorted: true });
        expect(out.expected).toEqual([["c"]]);
        expect(out.got).toEqual([["z"]]);
        expect(out.message.split("\n")[0]).toBe("Rows are compared after sorting, and row 3 is the first that differs.");
    });

    test("the sort is the default code-unit sort of the serialised rows", async ({ page }) => {
        // as JSON text 10 sorts before 2, and uppercase before lowercase; the same multiset
        // in two orders must give the same sorted lists, so it passes
        const a = result(["v"], [[2], [10], ["b"], ["B"], [null]]);
        const b = result(["v"], [["B"], [null], ["b"], [10], [2]]);
        expect(await compare(page, a, b)).toEqual({ status: "pass", rows: 5 });
    });

    test("the sort ignores the locale: canonically equivalent strings stay different and are ordered by code unit", async ({ page }) => {
        // composed and decomposed e-acute are different strings that localeCompare calls equal; a
        // locale sort would keep each side's own order and report a false failure
        const composed = "\u00e9";
        const decomposed = "e\u0301";
        const a = result(["s"], [[composed], [decomposed]]);
        const b = result(["s"], [[decomposed], [composed]]);
        expect(await compare(page, a, b)).toEqual({ status: "pass", rows: 2 });
        expect(await compare(page, b, a)).toEqual({ status: "pass", rows: 2 });
        // they are not the same value, though
        expect((await compare(page, result(["s"], [[composed]]), result(["s"], [[decomposed]]))).kind).toBe("row");
    });

    test("upper case sorts before lower case, so the reported row index is a code-unit position", async ({ page }) => {
        // code-unit order: "B" < "a" < "b". A locale sort would put a, b, B and report row 1.
        const out = await compare(page, result(["s"], [["B"], ["a"]]), result(["s"], [["B"], ["b"]]));
        expect(out).toMatchObject({ kind: "row", rowIndex: 2, sorted: true });
        expect(out.expected).toEqual([["a"]]);
        expect(out.got).toEqual([["b"]]);
    });

    test("column count is rule 2 and always checked, before names, rows and cells", async ({ page }) => {
        const out = await compare(
            page,
            result(["a", "b"], [[1, 2], [3, 4], [5, 6]]),
            result(["x", "y", "z"], [[9, 9, 9]]),
            { checkColumnNames: true, orderMatters: true }
        );
        expect(out).toEqual({ status: "fail", kind: "columns", message: "expected 2 columns, got 3" });
        // singular when N is 1 (N is the expected count), plural otherwise
        expect((await compare(page, result(["a"], []), result(["a", "b"], []))).message).toBe("expected 1 column, got 2");
        expect((await compare(page, result(["a", "b", "c"], []), result(["a"], []))).message).toBe("expected 3 columns, got 1");
        expect((await compare(page, result(["a", "b"], []), result([], []))).message).toBe("expected 2 columns, got 0");
    });

    test("column names are rule 3: only when asked, case-insensitive, in order, first mismatch", async ({ page }) => {
        const values = [[1, 2, 3]];
        const want = result(["Alpha", "beta", "GAMMA"], values);
        // case-insensitive pass
        expect(await compare(page, want, result(["alpha", "BETA", "gamma"], values), { checkColumnNames: true })).toEqual({
            status: "pass",
            rows: 1,
        });
        // names are not looked at by default
        expect(await compare(page, want, result(["x", "y", "z"], values))).toEqual({ status: "pass", rows: 1 });
        // the first mismatch is named, with its 1-based position, expected and got
        const out = await compare(page, want, result(["alpha", "oops", "also_wrong"], values), { checkColumnNames: true });
        expect(out).toMatchObject({ status: "fail", kind: "column-name", position: 2, expected: "beta", got: "oops" });
        expect(out.message).toBe('column 2 should be named "beta", but is named "oops"');
        // order matters
        expect(
            (await compare(page, want, result(["beta", "Alpha", "GAMMA"], values), { checkColumnNames: true })).position
        ).toBe(1);
        // names beat the row count and the cells
        const names = await compare(page, result(["a"], [[1], [2]]), result(["b"], [[9]]), { checkColumnNames: true });
        expect(names.kind).toBe("column-name");
    });

    test("row count is rule 4 and beats the cell diff", async ({ page }) => {
        const out = await compare(page, result(["a"], [[1], [2], [3]]), result(["a"], [[9]]));
        expect(out).toEqual({ status: "fail", kind: "rows", message: "expected 3 rows, got 1" });
        expect((await compare(page, result(["a"], [[1]]), result(["a"], [[1], [2]]))).message).toBe("expected 1 row, got 2");
        expect((await compare(page, result(["a"], []), result(["a"], [[1]]))).message).toBe("expected 0 rows, got 1");
    });

    test("the diff shows NULL as NULL, a REAL rounded, a BLOB as hex", async ({ page }) => {
        const out = await page.evaluate(async () => {
            const { compareResults } = await import("./js/lab/checker.js");
            return compareResults(
                { columns: ["a", "b", "c", "d"], values: [[null, 0.5, new Uint8Array([1, 171]), 5n]] },
                { columns: ["a", "b", "c", "d"], values: [["", 0.1 + 0.2, new Uint8Array([1, 172]), 6n]] },
                { orderMatters: true }
            );
        });
        expect(out.expected).toEqual([["NULL", "0.5", "x'01ab'", "5"]]);
        expect(out.got).toEqual([["", "0.3", "x'01ac'", "6"]]);
        expect(out.columns).toEqual(["a", "b", "c", "d"]);
        expect(out.gotColumns).toEqual(["a", "b", "c", "d"]);
    });
});

test.describe("check() on the Northlight dataset", () => {
    test.beforeEach(async ({ app }) => {
        await app.open();
    });

    test("AC5 the model answer passes", async ({ app }) => {
        for (const exercise of SET.exercises) {
            expect(await app.check(exercise.id, exercise.model_query), exercise.id).toEqual({ status: "pass", rows: MODEL_ROWS[exercise.id] });
        }
    });

    test("AC5 the same query with the wrong sort direction fails with row-level feedback when order matters", async ({ app }) => {
        const wrong = "SELECT product_name, unit_price FROM products WHERE category = 'Electronics' ORDER BY unit_price ASC;";
        const out = await app.check("e01", wrong);
        expect(out).toMatchObject({ status: "fail", kind: "row", sorted: false });
        expect(out.rowIndex).toBeGreaterThanOrEqual(1);
        expect(out.expected.length).toBeLessThanOrEqual(3);
        expect(out.got.length).toBeLessThanOrEqual(3);
        expect(out.expected).not.toEqual(out.got);
        expect(out.columns).toEqual(["product_name", "unit_price"]);
        // the same rows in another order pass where order does not matter
        const reordered = "SELECT category, COUNT(*) AS product_count, ROUND(AVG(unit_price), 2) AS avg_price FROM products GROUP BY category ORDER BY category DESC;";
        expect(await app.check("e03", reordered)).toEqual({ status: "pass", rows: MODEL_ROWS.e03 });
    });

    test("AC5 a syntax error surfaces the engine's message, verbatim", async ({ app }) => {
        const out = await app.check("e01", "SELEC product_name FROM products");
        expect(out).toEqual({ status: "fail", kind: "sql", message: 'near "SELEC": syntax error' });
        expect((await app.check("e01", "SELECT pric FROM products")).message).toBe("no such column: pric");
        expect((await app.check("e01", "SELECT * FROM nope")).message).toBe("no such table: nope");
    });

    test("AC5 the model query never appears in the DOM, an outcome or a message", async ({ page, app }) => {
        const outcomes = [];
        for (const exercise of SET.exercises) {
            outcomes.push(await app.check(exercise.id, "SELECT 1"));
            outcomes.push(await app.check(exercise.id, exercise.model_query));
            outcomes.push(await app.check(exercise.id, "select oops"));
        }
        const text = JSON.stringify(outcomes);
        const html = await page.evaluate(() => document.documentElement.outerHTML);
        for (const exercise of SET.exercises) {
            // a distinctive slice of each model query, and the whole text
            for (const needle of [exercise.model_query, exercise.model_query.slice(10, 40)]) {
                expect(text.includes(needle), `${exercise.id} in an outcome`).toBe(false);
                expect(html.includes(needle), `${exercise.id} in the DOM`).toBe(false);
            }
        }
    });

    test("feedback priority when several rules apply: sql error, columns, names, rows, then the row", async ({ app }) => {
        // e08: ordered, names checked. Wrong column count AND wrong names AND wrong rows:
        expect((await app.check("e08", "select 1, 2")).kind).toBe("columns");
        expect((await app.check("e08", "select 1, 2")).message).toBe("expected 3 columns, got 2");
        // right count, wrong names AND wrong row count: names win
        const names = await app.check("e08", "select 1 as a, 2 as b, 3 as c");
        expect(names).toMatchObject({ kind: "column-name", position: 1, expected: "month", got: "a" });
        // right names, wrong row count AND wrong cells: row count wins
        const rows = await app.check("e08", "select 'x' as month, 1 as order_count, 2 as revenue");
        expect(rows.kind).toBe("rows");
        expect(rows.message).toMatch(/^expected \d+ rows, got 1$/);
        // no result columns at all is rule 2 with M = 0
        expect(await app.check("e08", "create table scratch_t(a)")).toEqual({
            status: "fail",
            kind: "columns",
            message: "expected 3 columns, got 0",
        });
        expect((await app.check("e08", "")).message).toBe("expected 3 columns, got 0");
        // a SQL error beats everything
        expect((await app.check("e08", "select 1 as month, nope")).kind).toBe("sql");
    });

    test("the student's SQL is treated as in a visible Run: the last statement with result columns", async ({ app }) => {
        const sql = `${model("e01")} CREATE TABLE scratch(a);`;
        expect(await app.check("e01", sql)).toEqual({ status: "pass", rows: MODEL_ROWS.e01 });
        expect(await app.check("e01", `SELECT 1 AS x; ${model("e01")}`)).toEqual({ status: "pass", rows: MODEL_ROWS.e01 });
        // duplicate column names are kept, so the count is faithful
        expect((await app.check("e01", "select 1 as a, 2 as a, 3 as a")).message).toBe("expected 2 columns, got 3");
        // a final SELECT with no rows is the result
        expect((await app.check("e01", `${model("e01")} SELECT * FROM products WHERE 0;`)).kind).toBe("columns");
        expect(
            (await app.check("e01", `${model("e01")} SELECT product_name, unit_price FROM products WHERE 0;`)).message
        ).toMatch(/^expected \d+ rows, got 0$/);
    });

    test("a student's DROP TABLE on the working database does not affect a check", async ({ app }) => {
        await app.run("DROP TABLE products; DELETE FROM customers; DROP VIEW v_sales;");
        // the run worked (no result set: the summary line says "Done ... changed in N ms")
        await expect(app.status).toHaveText(/^Done(\. [\d,]+ rows? changed)? in \d+ ms$/);
        // the working database is really damaged ...
        await app.run("select * from products");
        await expect(app.errorBand.locator(".results-band-message")).toContainText("no such table: products");
        // ... and checks still run on the pristine data
        expect(await app.check("e01", model("e01"))).toEqual({ status: "pass", rows: MODEL_ROWS.e01 });
        expect(await app.check("e02", model("e02"))).toEqual({ status: "pass", rows: MODEL_ROWS.e02 });
        expect(await app.check("e08", model("e08"))).toEqual({ status: "pass", rows: MODEL_ROWS.e08 });
        // the check did not repair the working database either
        await app.run("select * from products");
        await expect(app.errorBand.locator(".results-band-message")).toContainText("no such table: products");
    });

    test("a mutating student query does not affect the next check", async ({ app }) => {
        const mutate = `UPDATE products SET unit_price = 0, category = 'Gone'; DELETE FROM customers; ${model("e01")}`;
        const first = await app.check("e01", mutate);
        expect(first.status).toBe("fail"); // the mutation changed what that query saw
        // the next check starts from the pristine data again
        expect(await app.check("e01", model("e01"))).toEqual({ status: "pass", rows: MODEL_ROWS.e01 });
        expect(await app.check("e02", model("e02"))).toEqual({ status: "pass", rows: MODEL_ROWS.e02 });
        // a query that creates a table does not leave it for the next one
        await app.check("e01", "CREATE TABLE leftover(a); INSERT INTO leftover VALUES (1)");
        expect((await app.check("e01", "SELECT * FROM leftover")).message).toBe("no such table: leftover");
        // and an error half-way through leaves nothing behind
        await app.check("e01", "CREATE TABLE half(a); SELEC 1");
        expect((await app.check("e01", "SELECT * FROM half")).message).toBe("no such table: half");
    });

    test("the model result is cached: the model runs once per exercise", async ({ app }) => {
        await app.trackConnections();
        await app.check("e01", model("e01"));
        await app.check("e01", "select 1");
        await app.check("e01", "select oops");
        expect((await app.connections()).map((c) => c.name)).toEqual([
            "model.db", "check.db", // first check of e01: the model and the student
            "check.db", // second: the student only
            "check.db", // third, a failing one: the student only
        ]);
        // another exercise runs its own model once
        await app.check("e02", model("e02"));
        await app.check("e02", model("e02"));
        expect((await app.connections()).map((c) => c.name).slice(4)).toEqual(["model.db", "check.db", "check.db"]);
    });

    test("two checks at once still run the model once", async ({ page, app }) => {
        await app.trackConnections();
        await page.evaluate(
            async ({ q }) => {
                const { createChecker } = await import("./js/lab/checker.js");
                const { loadSet } = await import("./js/lab/exercises.js");
                const set = (await loadSet("retail-basics")).set;
                const checker = createChecker();
                const ex = set.exercises[0];
                await Promise.all([checker.check(set, ex, q), checker.check(set, ex, q)]);
            },
            { q: model("e01") }
        );
        const names = (await app.connections()).map((c) => c.name);
        expect(names.filter((n) => n === "model.db")).toHaveLength(1);
        expect(names.filter((n) => n === "check.db")).toHaveLength(2);
    });

    test("every connection is closed afterwards, even on failure, and the two are separate", async ({ app }) => {
        await app.trackConnections();
        await app.check("e01", model("e01")); // pass
        await app.check("e01", "select oops"); // sql error
        await app.check("e01", "select 1"); // mismatch
        await app.check("e03", "drop table products; select nope"); // mutation and error
        const opened = await app.connections();
        expect(opened.length).toBe(1 + 1 + 1 + 1 + 2);
        expect(opened.every((c) => c.open === false)).toBe(true);
        // the student's connection is not the model's
        const same = await app.page.evaluate(() => {
            const [a, b] = window.__opened;
            return a.database === b.database || a.database.db === b.database.db;
        });
        expect(same).toBe(false);
        // and none of them is the working database
        const working = await app.page.evaluate(() => window.__opened.some((o) => o.database === window.app.database));
        expect(working).toBe(false);
    });

    test("the model cannot be affected by the student's SQL, nor the student's by the model", async ({ app }) => {
        // a student who drops a table in a check gets a normal answer on the next
        await app.check("e01", "drop table products");
        expect(await app.check("e01", model("e01"))).toEqual({ status: "pass", rows: MODEL_ROWS.e01 });
        // an exercise whose model query writes anything does not change what the student sees
        const exercise = {
            id: "w1",
            title: "W",
            prompt: "W",
            hints: [],
            model_query: "create table made_by_model(a); insert into made_by_model values (1); select count(*) as n from products",
            order_matters: false,
            check_column_names: false,
        };
        const set = miniSet(exercise);
        expect(await app.check(null, "select count(*) from products", { set, exercise })).toEqual({ status: "pass", rows: 1 });
        expect((await app.check(null, "select * from made_by_model", { set, exercise })).message).toBe("no such table: made_by_model");
    });

    test("big and special values compare through the engine", async ({ app }) => {
        const ex = (model_query) => ({ id: "v", title: "V", prompt: "V", hints: [], model_query, order_matters: true, check_column_names: false });
        const run = (model_query, sql) => {
            const exercise = ex(model_query);
            return app.check(null, sql, { set: miniSet(exercise), exercise });
        };
        // BigInt
        expect((await run("select 9223372036854775807", "select 9223372036854775807 as big")).status).toBe("pass");
        expect((await run("select 9223372036854775807", "select 9223372036854775806")).kind).toBe("row");
        expect((await run("select 9223372036854775807", "select '9223372036854775807'")).kind).toBe("row");
        // Infinity is not NULL
        expect((await run("select 9e999", "select 9e999")).status).toBe("pass");
        expect((await run("select 9e999", "select null")).kind).toBe("row");
        expect((await run("select null", "select 9e999")).kind).toBe("row");
        expect((await run("select 9e999", "select -9e999")).kind).toBe("row");
        // NULL vs empty string, text vs integer
        expect((await run("select null", "select ''")).kind).toBe("row");
        expect((await run("select 3", "select '3'")).kind).toBe("row");
        expect((await run("select '3'", "select 3")).kind).toBe("row");
        // REAL that rounds equal and one that does not; integer-valued REAL equals integer
        expect((await run("select 0.3", "select 0.1 + 0.2")).status).toBe("pass");
        expect((await run("select 1.0000001", "select 1.0000002")).status).toBe("pass");
        expect((await run("select 1.000001", "select 1.000002")).kind).toBe("row");
        expect((await run("select 3", "select 3.0")).status).toBe("pass");
        expect((await run("select 3.0", "select 3")).status).toBe("pass");
        expect((await run("select 3.5", "select 3")).kind).toBe("row");
        // BLOB
        expect((await run("select x'0102'", "select x'0102'")).status).toBe("pass");
        expect((await run("select x'0102'", "select x'0103'")).kind).toBe("row");
        expect((await run("select x'0102'", "select '0102'")).kind).toBe("row");
        expect((await run("select x''", "select ''")).kind).toBe("row");
        const diff = await run("select x'0102'", "select x'0103'");
        expect(diff.expected).toEqual([["x'0102'"]]);
        expect(diff.got).toEqual([["x'0103'"]]);
    });

    test("an exercise whose model query fails cannot be checked, and nothing leaks", async ({ page, app }) => {
        await app.trackConnections();
        const bad = (model_query) => ({ id: "b", title: "B", prompt: "B", hints: [], model_query, order_matters: false, check_column_names: false });
        const secrets = ["secret_marker_col", "nonexistent_table_xyz", "no such table", "no such column", "SQLITE", "syntax error", "result code"];
        const attempts = [
            "SELECT secret_marker_col FROM nonexistent_table_xyz",
            "SELECT secret_marker_col FROM products",
            "SELEC secret_marker_col FROM products", // syntax error
            "CREATE TABLE secret_marker_col(a)", // no result columns
        ];
        const outcomes = [];
        for (const query of attempts) {
            const exercise = bad(query);
            // with a student query that passes, one that fails to run, and a blank one
            for (const sql of ["select 1", "select nope", ""]) {
                outcomes.push(await app.check(null, sql, { set: miniSet(exercise), exercise }));
            }
        }
        for (const outcome of outcomes) {
            expect(outcome.status).toBe("unavailable");
            expect(outcome.reason).toBe("model");
            expect(outcome.message).toMatch(/cannot be checked/);
            expect(Object.keys(outcome).sort()).toEqual(["message", "reason", "status"]);
        }
        // one generic message, the same for every authoring bug
        expect(new Set(outcomes.map((o) => o.message)).size).toBe(1);
        const text = JSON.stringify(outcomes);
        for (const secret of secrets) {
            expect(text.includes(secret), `outcome holds "${secret}"`).toBe(false);
        }
        const html = await page.evaluate(() => document.documentElement.outerHTML);
        for (const secret of ["secret_marker_col", "nonexistent_table_xyz"]) {
            expect(html.includes(secret), `DOM holds "${secret}"`).toBe(false);
        }
        // a failure is not cached: the model ran again for each check, and everything closed
        const connections = await app.connections();
        expect(connections.filter((c) => c.name === "model.db")).toHaveLength(outcomes.length);
        expect(connections.every((c) => c.open === false)).toBe(true);
    });

    test("the console tells the instructor why a model query cannot run, in the engine's words and not the query's", async ({ page, app }) => {
        const warnings = [];
        const everything = [];
        page.on("console", (message) => {
            everything.push(message.text());
            if (message.type() === "warning") {
                warnings.push(message.text());
            }
        });
        const bad = (model_query) => ({ id: "b", title: "B", prompt: "B", hints: [], model_query, order_matters: false, check_column_names: false });
        const warningFor = async (query) => {
            const before = warnings.length;
            const exercise = bad(query);
            const outcome = await app.check(null, "select 1", { set: miniSet(exercise), exercise });
            expect(outcome.status).toBe("unavailable");
            expect(outcome.message).toMatch(/cannot be checked/);
            return warnings.slice(before).filter((text) => text.includes('exercise "mini/b"'));
        };
        const missing = await warningFor("SELECT secret_marker_col FROM nonexistent_table_xyz");
        expect(missing).toHaveLength(1);
        expect(missing[0]).toContain("its model query fails: no such table: nonexistent_table_xyz");
        const typo = await warningFor("SELEC 1");
        expect(typo).toHaveLength(1);
        expect(typo[0]).toContain("syntax error");
        const noResult = await warningFor("CREATE TABLE secret_marker_col(a)");
        expect(noResult).toHaveLength(1);
        expect(noResult[0]).toContain("its model query returns no result set");
        // never the query text, the failing statement, or the wrapper's prefix
        for (const text of [...missing, ...typo, ...noResult]) {
            expect(text).not.toMatch(/SELECT secret_marker_col|CREATE TABLE|SELEC 1|SQLITE_|result code/);
        }
        // A failure that comes while the statement runs, not when it is prepared: the engine itself
        // warns with the statement then. And a message that echoes a double-quoted word, which a
        // model query can be as a whole.
        const atRun = await warningFor(`SELECT json_extract('{"a":', '$.secret_runtime_value')`);
        expect(atRun).toHaveLength(1);
        expect(atRun[0]).toContain("its model query fails:");
        const quoted = await warningFor(`SELECT "this entire model answer text should never be shown FROM products WHERE x = 1"`);
        expect(quoted).toHaveLength(1);
        expect(quoted[0]).toContain('its model query fails: no such column: "…"');
        // nothing in the console, from the app or from the engine, holds any model query's words
        for (const text of everything) {
            expect(text).not.toMatch(/secret_runtime_value|secret_marker_col|entire model answer|json_extract|SQL =/);
        }
        // the engine still says that a statement failed, by its code
        expect(everything.some((text) => /sqlite3_step\(\) rc= 1 SQLITE_ERROR/.test(text))).toBe(true);
    });

    test("a model query that failed once is run again, so a fixed file is picked up", async ({ page, app }) => {
        const out = await page.evaluate(async () => {
            const { createChecker } = await import("./js/lab/checker.js");
            const checker = createChecker();
            const exercise = { id: "f", title: "F", prompt: "F", hints: [], model_query: "select * from nope", order_matters: false, check_column_names: false };
            const set = { id: "mini", title: "M", dataset: "northlight", exercises: [exercise] };
            const first = await checker.check(set, exercise, "select 1");
            // the instructor fixes the file: a reloaded set has the same ids and a new query
            const fixed = { ...exercise, model_query: "select 1" };
            const second = await checker.check({ ...set, exercises: [fixed] }, fixed, "select 1");
            return [first.status, second.status];
        });
        expect(out).toEqual(["unavailable", "pass"]);
    });

    test("a changed model query is not served from the cache", async ({ page, app }) => {
        const out = await page.evaluate(async () => {
            const { createChecker } = await import("./js/lab/checker.js");
            const checker = createChecker();
            const make = (q) => ({ id: "c", title: "C", prompt: "C", hints: [], model_query: q, order_matters: false, check_column_names: false });
            const one = make("select 1");
            const two = make("select 2");
            const set = (e) => ({ id: "mini", title: "M", dataset: "northlight", exercises: [e] });
            return [
                (await checker.check(set(one), one, "select 1")).status,
                (await checker.check(set(two), two, "select 1")).status,
                (await checker.check(set(two), two, "select 2")).status,
            ];
        });
        expect(out).toEqual(["pass", "fail", "pass"]);
    });

    test("check never throws, whatever it is given", async ({ app }) => {
        const out = await app.page.evaluate(async () => {
            const { createChecker } = await import("./js/lab/checker.js");
            const checker = createChecker();
            const results = [];
            for (const args of [[undefined, undefined, "select 1"], [{}, {}, "select 1"], [null, null, null]]) {
                results.push((await checker.check(...args)).status);
            }
            return results;
        });
        expect(out.every((s) => s === "unavailable")).toBe(true);
    });
});

test.describe("check() without the set's pristine dataset", () => {
    test("an uploaded database has no pristine bytes: the exercise cannot be checked", async ({ app }) => {
        await app.open();
        await app.upload(require("./helpers").SAMPLE_FILE);
        const out = await app.check("e01", model("e01"));
        expect(out).toMatchObject({ status: "unavailable", reason: "dataset" });
        expect(out.message).toMatch(/cannot be checked/);
    });

    test("another dataset's pristine bytes are not used for the set", async ({ page, app }) => {
        await withSampleDataset(page);
        await app.open();
        await app.pickDatabase("Sample Fruit");
        await expect(app.databaseLabel).toHaveText("Sample Fruit");
        expect(await page.evaluate(() => window.app.database.name)).toBe("sample.db");
        // retail-basics is a Northlight set; the open dataset is "sample"
        const out = await app.check("e01", model("e01"));
        expect(out).toMatchObject({ status: "unavailable", reason: "dataset" });
        // a set for the sample dataset can be checked on it
        const exercise = { id: "s", title: "S", prompt: "S", hints: [], model_query: "select count(*) as n from sqlite_master", order_matters: false, check_column_names: false };
        const set = miniSet(exercise, "sample");
        expect(await app.check(null, "select count(*) from sqlite_master", { set, exercise })).toEqual({ status: "pass", rows: 1 });
    });

    test("no database at all", async ({ page, app }) => {
        await app.openEmpty();
        const out = await app.check("e01", "select 1", { set: realSet() });
        expect(out).toMatchObject({ status: "unavailable", reason: "dataset" });
    });
});
