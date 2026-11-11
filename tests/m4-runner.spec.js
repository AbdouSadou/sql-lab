// M4 part 1: js/lab/runner.js (splitStatements, runSql, engineMessage), the Run seam in
// index.js that uses it, and the editor's selection rule.
const { test, expect, editorSelect, editorValue } = require("./helpers");

test.describe("splitStatements", () => {
    // run splits `sql` with the open database's own capi
    const split = (page, sql) =>
        page.evaluate(async (sql) => {
            const { splitStatements } = await import("./js/lab/runner.js");
            return splitStatements(window.app.database.capi, sql);
        }, sql);

    test.beforeEach(async ({ app }) => {
        await app.open();
    });

    test("cuts at each complete statement; the last one needs no semicolon", async ({ page }) => {
        expect(await split(page, "select 1; select 2")).toEqual(["select 1;", "select 2"]);
        expect(await split(page, "select 1;\n\nselect 2;\n")).toEqual(["select 1;", "select 2;"]);
        expect(await split(page, "select 1")).toEqual(["select 1"]);
    });

    test("blank text and empty statements give nothing", async ({ page }) => {
        expect(await split(page, "")).toEqual([]);
        expect(await split(page, "  \n\t ")).toEqual([]);
        expect(await split(page, ";;  ;")).toEqual([]);
        expect(await split(page, "select 1;;select 2;")).toEqual(["select 1;", "select 2;"]);
    });

    test("a semicolon inside a string does not split", async ({ page }) => {
        expect(await split(page, "select 'a;b'; select ';'; select \"x;y\" from t")).toEqual([
            "select 'a;b';",
            "select ';';",
            'select "x;y" from t',
        ]);
        // an escaped quote keeps the string open
        expect(await split(page, "select 'it''s; fine'; select 2")).toEqual(["select 'it''s; fine';", "select 2"]);
    });

    test("a semicolon inside a comment does not split", async ({ page }) => {
        expect(await split(page, "select 1 -- a;b\n; select 2")).toEqual(["select 1 -- a;b\n;", "select 2"]);
        expect(await split(page, "select 1 /* ; ; */; select 2")).toEqual(["select 1 /* ; ; */;", "select 2"]);
        expect(await split(page, "-- first; second\nselect 1; select 2")).toEqual([
            "-- first; second\nselect 1;",
            "select 2",
        ]);
    });

    test("CREATE TRIGGER stays in one piece", async ({ page }) => {
        const trigger =
            "CREATE TRIGGER t_ai AFTER INSERT ON t BEGIN INSERT INTO log VALUES (new.a); UPDATE t SET a = a; END;";
        expect(await split(page, `create table t(a); ${trigger} select 3;`)).toEqual([
            "create table t(a);",
            trigger,
            "select 3;",
        ]);
        // a CASE ... END inside the body does not end it early
        const withCase =
            "CREATE TRIGGER t_bi BEFORE INSERT ON t BEGIN SELECT CASE WHEN new.a < 0 THEN RAISE(ABORT, 'no; negatives') END; END;";
        expect(await split(page, `${withCase} select 1`)).toEqual([withCase, "select 1"]);
    });

    test("a comment after the last statement is not a statement, and a comment in front of one is part of it", async ({ page }) => {
        expect(await split(page, "select 1; -- done")).toEqual(["select 1;"]);
        expect(await split(page, "select 1; /* unfinished")).toEqual(["select 1;"]);
        expect(await split(page, "select 1;\n-- one\n/* two */ ; -- three")).toEqual(["select 1;"]);
        expect(await split(page, "-- only a comment")).toEqual([]);
        // a closed comment in front of SQL does not swallow it, and an unterminated one after it is dropped
        expect(await split(page, "/* note */ select 2")).toEqual(["/* note */ select 2"]);
        expect(await split(page, "/* a */ /* b */ select 2; /* open")).toEqual(["/* a */ /* b */ select 2;"]);
        expect(await split(page, "select 1; /* a */ select 2")).toEqual(["select 1;", "/* a */ select 2"]);
        expect(await split(page, "/* a */ -- b\n  ;  ")).toEqual([]);
        expect(await split(page, "select 1; -- note\nselect 2; -- done")).toEqual(["select 1;", "-- note\nselect 2;"]);
        // a comment inside a statement, or text that only looks like a comment start, is kept
        expect(await split(page, "select 1 -- why\n")).toEqual(["select 1 -- why"]);
        expect(await split(page, "select '-- not a comment'; select 2")).toEqual(["select '-- not a comment';", "select 2"]);
    });

    test("a long run of blanks and comments after the last statement is dropped at once", async ({ page }) => {
        const ms = await page.evaluate(async () => {
            const { splitStatements } = await import("./js/lab/runner.js");
            const capi = window.app.database.capi;
            const started = performance.now();
            const a = splitStatements(capi, `select 1;${" ".repeat(5000)}${"\n-- c".repeat(2000)}`);
            // text that is not blank ends the run of blanks with something that is not noise
            const b = splitStatements(capi, `;${" \n".repeat(5000)}x`);
            return { took: performance.now() - started, a, b: b.length };
        });
        expect(ms.a).toEqual(["select 1;"]);
        expect(ms.b).toBe(1);
        expect(ms.took).toBeLessThan(1000);
    });

    test("a long script is not re-scanned from its start", async ({ page }) => {
        const info = await page.evaluate(async () => {
            const { splitStatements } = await import("./js/lab/runner.js");
            const real = window.app.database.capi;
            let scanned = 0;
            const capi = {
                sqlite3_complete(text) {
                    scanned += text.length;
                    return real.sqlite3_complete(text);
                },
            };
            const sql = Array.from({ length: 3000 }, (_, i) => `select ${i};`).join("\n");
            const statements = splitStatements(capi, sql);
            return { count: statements.length, scanned, length: sql.length };
        });
        expect(info.count).toBe(3000);
        // each character is looked at about once, not once per statement before it
        expect(info.scanned).toBeLessThan(info.length * 1.5);
    });

    // splitStatements with a capi that counts the calls to sqlite3_complete (no timing: a count
    // does not depend on the machine)
    const splitCounting = (page, sql) =>
        page.evaluate(async (sql) => {
            const { splitStatements } = await import("./js/lab/runner.js");
            const real = window.app.database.capi;
            let calls = 0;
            const capi = {
                sqlite3_complete(text) {
                    calls++;
                    return real.sqlite3_complete(text);
                },
            };
            const statements = splitStatements(capi, sql);
            return { calls, statements };
        }, sql);

    // A semicolon that cannot end a statement (it is inside a string, a name or a comment) is
    // not even asked about: a script with a long text value full of semicolons used to cost one
    // call, over the whole text so far, for each of them.
    const MANY = 100_000;
    const HIDDEN = [
        ["a string", `select '${";".repeat(MANY)}' as x; select 2;`],
        ["a block comment", `select 1 /* ${";".repeat(MANY)} */; select 2;`],
        ["a line comment", `select 1 -- ${";".repeat(MANY)}\n; select 2;`],
        ["a double-quoted name", `select 1 as "${";".repeat(MANY)}"; select 2;`],
        ["a backtick name", `select 1 as \`${";".repeat(MANY)}\`; select 2;`],
        ["a bracket name", `select 1 as [${";".repeat(MANY)}]; select 2;`],
    ];
    for (const [where, sql] of HIDDEN) {
        test(`${MANY} semicolons inside ${where} cost no calls to sqlite3_complete`, async ({ page }) => {
            const { calls, statements } = await splitCounting(page, sql);
            expect(statements).toHaveLength(2);
            expect(statements[1]).toBe("select 2;");
            expect(statements[0].length).toBe(sql.length - " select 2;".length);
            // one for each real end of a statement
            expect(calls).toBe(2);
        });
    }

    test("a text value of 300000 semicolons runs through runSql, as a .sql upload does", async ({ page }) => {
        const length = await page.evaluate(async () => {
            const { runSql } = await import("./js/lab/runner.js");
            const result = runSql(window.app.database, `select '${";".repeat(300_000)}' as x;`);
            return result.values[0][0].length;
        });
        expect(length).toBe(300_000);
    });

    test("unclosed text takes every semicolon after it, again without asking", async ({ page }) => {
        for (const open of ["'", '"', "`", "[", "/*", "--"]) {
            const sql = `select 1; select ${open}${";".repeat(MANY)}`;
            const { calls, statements } = await splitCounting(page, sql);
            expect(statements, open).toEqual(["select 1;", `select ${open}${";".repeat(MANY)}`]);
            expect(calls, open).toBe(1);
        }
    });

    test("a trigger body still splits as one statement, sqlite3_complete being the judge of each semicolon", async ({ page }) => {
        const trigger =
            "CREATE TRIGGER t_ai AFTER INSERT ON t BEGIN INSERT INTO log VALUES ('a;b'); UPDATE t SET a = a; END;";
        const { calls, statements } = await splitCounting(page, `${trigger} select 1;`);
        expect(statements).toEqual([trigger, "select 1;"]);
        // the semicolons outside quotes: three in the trigger, one after it
        expect(calls).toBe(4);
    });

    // Each input and what it splits into. The rules are those of sqlite3_complete: a quote runs
    // to the next one of its kind (a doubled quote closes and opens again), "[" to the next "]",
    // "--" to the next LF only (a CR does not end it), and after "/*" the search for "*/" starts
    // right behind it, so "/*/" does not close.
    const TRICKY = [
        ["a string", "select 'a;b'; select 2", ["select 'a;b';", "select 2"]],
        ["a doubled quote", "select 'it''s;'; select 2;", ["select 'it''s;';", "select 2;"]],
        ["a doubled quote right before the end", "select 'a'';'; select 2", ["select 'a'';';", "select 2"]],
        ["an empty string", "select ''; select ';'", ["select '';", "select ';'"]],
        ["a double-quoted name", 'select "a;b" from t; select 2', ['select "a;b" from t;', "select 2"]],
        ["an apostrophe in a double-quoted name", `select "it's;" from t; select 2`, [`select "it's;" from t;`, "select 2"]],
        ["a backtick name", "select `a;b` from t; select 2", ["select `a;b` from t;", "select 2"]],
        ["a bracket name", "select [a;b] from t; select 2", ["select [a;b] from t;", "select 2"]],
        ["a quote inside a bracket name", "select [a'b;] from t; select 'c;'", ["select [a'b;] from t;", "select 'c;'"]],
        ["a bracket inside a string", "select '[;'; select 2", ["select '[;';", "select 2"]],
        ["a bracket that never closes", "select 1; select [a;b; select 2", ["select 1;", "select [a;b; select 2"]],
        ["a string that never closes", "select 1; select 'a;b; select 2", ["select 1;", "select 'a;b; select 2"]],
        ["a comment start inside a string", "select '--'; select '/*'; select 2", ["select '--';", "select '/*';", "select 2"]],
        ["a quote inside a line comment", "select 1 -- it's\n; select 2", ["select 1 -- it's\n;", "select 2"]],
        ["a quote inside a block comment", "select 1 /* it's [ */; select 2", ["select 1 /* it's [ */;", "select 2"]],
        ["a line comment with semicolons", "select 1 -- a;b;\n; select 2", ["select 1 -- a;b;\n;", "select 2"]],
        ["a CR does not end a line comment", "select 1 -- a\r; b\n; select 2", ["select 1 -- a\r; b\n;", "select 2"]],
        ["a line comment to the end", "select 1 -- a;b", ["select 1 -- a;b"]],
        ["a line comment to the end, after a statement", "select 1; select 2 -- a;b;", ["select 1;", "select 2 -- a;b;"]],
        ["a block comment", "select 1 /* ; ; */; select 2", ["select 1 /* ; ; */;", "select 2"]],
        ["/*/ does not close", "select 1 /*/ ; */ ; select 2", ["select 1 /*/ ; */ ;", "select 2"]],
        ["/**/ closes", "select 1 /**/ ; select 2", ["select 1 /**/ ;", "select 2"]],
        ["a block comment that never closes", "select 1; select 2 /* ; select 3;", ["select 1;", "select 2 /* ; select 3;"]],
        ["a block comment that only looks closed", "select 1; select 2 /*/ ; select 3;", ["select 1;", "select 2 /*/ ; select 3;"]],
        ["a minus and a slash alone", "select 4 - -1 / 2; select 2", ["select 4 - -1 / 2;", "select 2"]],
        ["a star after a slash with a gap", "select 4 / * 2; select 2", ["select 4 / * 2;", "select 2"]],
        ["a semicolon right after a name", 'select "a";select [b];select `c`;select \'d\'', ['select "a";', "select [b];", "select `c`;", "select 'd'"]],
        ["empty statements around", ";; select 1;;; select 2 ;", ["select 1;", "select 2 ;"]],
        [
            "a trigger with a string and a comment holding semicolons",
            "create trigger g after insert on t begin select 'x;y'; select 1 -- z;\n; end; select 2",
            ["create trigger g after insert on t begin select 'x;y'; select 1 -- z;\n; end;", "select 2"],
        ],
        [
            "a semicolon after a comment inside a trigger",
            "create trigger g after insert on t begin /* ; */ select 1; end;select 2;",
            ["create trigger g after insert on t begin /* ; */ select 1; end;", "select 2;"],
        ],
        [
            "text after a hidden semicolon cannot hide a vacuum",
            "select 'a;b'; vacuum into 'x'",
            ["select 'a;b';", "vacuum into 'x'"],
        ],
    ];
    for (const [name, sql, expected] of TRICKY) {
        test(`splits ${name}`, async ({ page }) => {
            expect(await split(page, sql)).toEqual(expected);
        });
    }

    // The statements alone cannot tell the scan's rules from a scan that is too eager: a semicolon
    // wrongly offered to sqlite3_complete is answered "no", and the result is the same. So these
    // count the calls too (one for each real end of a statement).
    const COUNTED = [
        // a CR does not end a line comment: the semicolons up to the LF are still in it
        ["a CR does not end a line comment", "select 1 -- a\r;;;;\n; select 2;", ["select 1 -- a\r;;;;\n;", "select 2;"], 2],
        // "/*/" does not close: the semicolons up to the real "*/" are still in the comment
        ["/*/ does not close", "select 1 /*/ ;;;; */ ; select 2;", ["select 1 /*/ ;;;; */ ;", "select 2;"], 2],
        // a "*" right behind a closing "*/" is a star, not the start of a new comment (the closer's
        // "/" must be stepped over): the first semicolon must be offered
        ["a star right after a closed comment", "select 2 /* c */* 3; select 4", ["select 2 /* c */* 3;", "select 4"], 1],
    ];
    for (const [name, sql, expected, expectedCalls] of COUNTED) {
        test(`splits ${name}, asking only at the real ends`, async ({ page }) => {
            const { calls, statements } = await splitCounting(page, sql);
            expect(statements).toEqual(expected);
            expect(calls).toBe(expectedCalls);
        });
    }
});

test.describe("runSql", () => {
    test.beforeEach(async ({ app }) => {
        await app.open();
    });

    // run executes sql with runSql on the open database; returns {result} or {error, message}
    const run = (page, sql) =>
        page.evaluate(async (sql) => {
            const { runSql, engineMessage } = await import("./js/lab/runner.js");
            try {
                return { result: runSql(window.app.database, sql) };
            } catch (exc) {
                return { error: String(exc), message: engineMessage(exc) };
            }
        }, sql);

    test("a lone surrogate cannot make the engine read other statements than the splitter cut", async ({ page }) => {
        // The engine's conversion swallows the character after a lone surrogate, which the scan and
        // sqlite3_complete read as U+FFFD. The quote after it was then invisible to the engine but
        // not to the scan: this text was ONE statement for both, the engine ran a VACUUM INTO
        // inside it that the VACUUM check never saw (only the authorizer's "authorization
        // denied" stood in the way). Now every side reads the same text.
        const hidden = await run(page, "select 'a'\ude00';\nVacuum INTO 'FILE'||''");
        expect(hidden.message).toContain("syntax error");
        expect(hidden.message).not.toContain("authorization denied");
        // and where the scan does cut at the semicolon, the VACUUM INTO is its own statement
        const cut = await run(page, "select 'a\ude00'; Vacuum INTO 'FILE'");
        expect(cut.message).toContain("VACUUM INTO a file is not available");
        // a lone surrogate in an ordinary value is a replacement character, not a lost quote
        const value = await run(page, "select 'a\ud83d' || 'b' as s, 'c\ude00' || 'd' as t");
        expect(value.result).toEqual({ columns: ["s", "t"], values: [["a\ufffdb", "c\ufffdd"]] });
        // a well-formed pair is left alone
        expect((await run(page, "select '\ud83d\ude00' as s")).result.values).toEqual([["\ud83d\ude00"]]);
    });

    test("duplicate column names and the SELECT's column order are kept", async ({ page }) => {
        expect((await run(page, "select 1 as a, 2 as a, 3 as b")).result).toEqual({
            columns: ["a", "a", "b"],
            values: [[1, 2, 3]],
        });
        // integer-like names used to jump ahead of the others
        expect((await run(page, 'select 2 as b, 1 as "1"')).result).toEqual({ columns: ["b", "1"], values: [[2, 1]] });
    });

    test("the last statement that has result columns wins", async ({ page }) => {
        expect((await run(page, "select 1 as a; select 2 as b, 3 as c;")).result).toEqual({
            columns: ["b", "c"],
            values: [[2, 3]],
        });
        // later statements without columns do not replace it
        expect((await run(page, "select 1 as a; create table z(y); insert into z values (1)")).result).toEqual({
            columns: ["a"],
            values: [[1]],
        });
        // a statement that returns columns after DDL
        expect((await run(page, "create table z2(y); insert into z2 values (7); select y from z2")).result).toEqual({
            columns: ["y"],
            values: [[7]],
        });
    });

    test("a final SELECT with no rows is the result: zero rows, with its columns", async ({ page }) => {
        expect((await run(page, "select 1 as a; select 2 as b where 0")).result).toEqual({ columns: ["b"], values: [] });
        expect((await run(page, "select * from products where 0")).result).toEqual({
            columns: ["product_id", "product_name", "category", "unit_price", "unit_cost"],
            values: [],
        });
    });

    test("no statement with result columns, or no SQL, gives null", async ({ page }) => {
        expect((await run(page, "create table q(a)")).result).toBeNull();
        expect((await run(page, "")).result).toBeNull();
        expect((await run(page, "  \n ")).result).toBeNull();
        expect((await run(page, "-- just a comment")).result).toBeNull();
        expect((await run(page, "pragma foo_bar_unknown")).result).toBeNull();
    });

    test("it sets database.query, as SQLite.execute does", async ({ page }) => {
        const query = await page.evaluate(async () => {
            const { runSql } = await import("./js/lab/runner.js");
            runSql(window.app.database, "select 1; select 2");
            return window.app.database.query;
        });
        expect(query).toBe("select 1; select 2");
    });

    test("a failing statement throws the engine's error; the statements before it stay applied", async ({ page }) => {
        const failed = await run(page, "create table u(x); insert into u values (1); selct;");
        expect(failed.error).toContain("SQLITE_ERROR");
        expect(failed.message).toBe('near "selct": syntax error');
        // not wrapped in a transaction, and the statement after the failure never ran
        expect((await run(page, "select count(*) as n from u")).result.values).toEqual([[1]]);
        const later = await run(page, "select nope from u; create table never(a)");
        expect(later.message).toBe("no such column: nope");
        expect((await run(page, "select count(*) from sqlite_master where name = 'never'")).result.values).toEqual([[0]]);
    });

    test("SQL with a NUL character is refused whole, so no statement after it is dropped silently", async ({ page, app }) => {
        const nul = await run(page, "create table nul_t(a); insert into nul_t values (1);\u0000insert into nul_t values (2);");
        expect(nul.result).toBeUndefined();
        expect(nul.message).toMatch(/NUL character/);
        // nothing ran, not even the statements in front of the NUL
        expect((await run(page, "select count(*) from sqlite_master where name = 'nul_t'")).result.values).toEqual([[0]]);
        // a NUL alone, and one inside a string literal, are refused the same way
        expect((await run(page, "\u0000")).message).toMatch(/NUL character/);
        expect((await run(page, "select '\u0000'")).message).toMatch(/NUL character/);
        // the Run button shows the message and the database stays usable
        await app.editorHost.evaluate((el) => (el.value = "select 1;\u0000select 2"));
        await app.editor.press("Control+Enter");
        await expect(app.status).toContainText("NUL character");
        expect((await app.query("select 5 as five")).rows).toEqual([["5"]]);
    });

    test("values keep their types: BigInt, BLOB, NULL, REAL", async ({ page }) => {
        const types = await page.evaluate(async () => {
            const { runSql } = await import("./js/lab/runner.js");
            const row = runSql(window.app.database, "select 9223372036854775807, x'0aff', null, 2.5, 'a', 3").values[0];
            return row.map((v) => (v === null ? "null" : v instanceof Uint8Array ? "blob" : typeof v));
        });
        expect(types).toEqual(["bigint", "blob", "null", "number", "string", "number"]);
    });
});

test.describe("engineMessage", () => {
    test("strips the wrapper's prefix for any result code", async ({ page, app }) => {
        await app.open();
        const messages = await page.evaluate(async () => {
            const { runSql, engineMessage } = await import("./js/lab/runner.js");
            const db = window.app.database;
            const message = (sql) => {
                try {
                    runSql(db, sql);
                } catch (exc) {
                    return { raw: String(exc), message: engineMessage(exc) };
                }
                return null;
            };
            return {
                column: message("select pric from products"),
                unique: message("create table t(a unique); insert into t values (1); insert into t values (1)"),
                notnull: message("create table t2(a not null); insert into t2 values (null)"),
                func: message("select nosuchfn(1)"),
                // the text alone, and the exception object
                text: engineMessage("SQLite3Error: SQLITE_ERROR: sqlite3 result code 1: no such column: pric"),
                bare: engineMessage({ message: "SQLITE_BUSY: sqlite3 result code 5: database is locked" }),
                other: engineMessage(new Error("something else")),
                novel: engineMessage(new Error("SQLITE_FOO_BAR_9: sqlite3 result code 99999: new code")),
                onlyCode: engineMessage(new Error("SQLITE_BUSY")),
            };
        });
        expect(messages.column.message).toBe("no such column: pric");
        expect(messages.column.raw).toContain("sqlite3 result code 1:");
        expect(messages.unique.message).toBe("UNIQUE constraint failed: t.a");
        expect(messages.unique.raw).toContain("SQLITE_CONSTRAINT_UNIQUE");
        expect(messages.notnull.message).toBe("NOT NULL constraint failed: t2.a");
        expect(messages.func.message).toBe("no such function: nosuchfn");
        expect(messages.text).toBe("no such column: pric");
        expect(messages.bare).toBe("database is locked");
        expect(messages.other).toBe("something else");
        expect(messages.novel).toBe("new code");
        expect(messages.onlyCode).toBe("SQLITE_BUSY");
    });
});

test.describe("Run uses runSql (the seam in index.js)", () => {
    test("duplicate column names and column order are faithful in the table", async ({ app }) => {
        await app.open();
        expect(await app.query("select 1 as a, 2 as a, 3 as b")).toEqual({ columns: ["a", "a", "b"], rows: [["1", "2", "3"]] });
        expect(await app.query('select 2 as b, 1 as "1"')).toEqual({ columns: ["b", "1"], rows: [["2", "1"]] });
    });

    test("a multi-statement run shows the last result", async ({ app }) => {
        await app.open();
        expect(await app.query("select 1 as a; select 2 as b, 3 as c;")).toEqual({ columns: ["b", "c"], rows: [["2", "3"]] });
        // a trailing statement without result columns leaves the last result in place
        expect(await app.query("select 5 as five; create table kept(x)")).toEqual({ columns: ["five"], rows: [["5"]] });
    });

    test("a final SELECT with no rows clears the table and says 0 rows", async ({ app }) => {
        await app.open();
        await app.query("select 1 as a");
        await app.run("select 1 as a; select 2 as b where 0");
        await expect(app.status).toContainText("0 rows, took");
        await expect(app.table).toHaveCount(0);
    });

    test("an error shows the engine's message and the failing statement in the status area (F5)", async ({ app }) => {
        await app.open();
        await app.run("select pric from products");
        await expect(app.status).toContainText("no such column: pric (statement: select pric from products)");
        await expect(app.status).not.toContainText("SQLite3Error");
    });

    test("a script with a trigger and a semicolon in a string runs", async ({ app }) => {
        await app.open();
        const result = await app.query(
            "create table t(a); create table log(m); " +
                "create trigger g after insert on t begin insert into log values ('x;y'); end; " +
                "insert into t values (1); select m from log"
        );
        expect(result).toEqual({ columns: ["m"], rows: [["x;y"]] });
    });
});

test.describe("the editor takes the selection only from inside itself", () => {
    // selectOutside selects the text of the element `selector`, outside the editor, the way a
    // student does: a triple-click on it. The mousedown takes the focus from the editor, which is
    // why the selection stays outside it (CodeMirror takes back a selection made elsewhere
    // programmatically while it has the focus). It returns what the page selection holds.
    const selectOutside = async (page, selector) => {
        await page.locator(selector).first().click({ clickCount: 3 });
        return page.evaluate(() => getSelection().toString());
    };

    test("text selected elsewhere is not the query", async ({ page, app }) => {
        await app.open();
        await app.editor.fill("SELECT 42 AS answer");
        expect((await selectOutside(page, "#status-run")).length).toBeGreaterThan(5);
        expect(await app.editorHost.evaluate((el) => el.query)).toBe("SELECT 42 AS answer");
        // the same through a real Run from the keyboard (the page selection is still outside)
        await selectOutside(page, "#status-run");
        await page.locator("#execute").focus();
        await page.keyboard.press("Enter");
        expect(await app.read()).toEqual({ columns: ["answer"], rows: [["42"]] });
    });

    test("text selected in the result table is not the query", async ({ page, app }) => {
        await app.open();
        await app.query("select 'selected cell' as c");
        expect(await selectOutside(page, "#result td")).toBe("selected cell");
        expect(await app.editorHost.evaluate((el) => el.query)).toBe("select 'selected cell' as c");
    });

    test("a selection inside the editor is still the query", async ({ page, app }) => {
        await app.open();
        await app.editorHost.evaluate((el) => (el.value = "SELECT 1 AS one; SELECT 2 AS two"));
        const text = await editorValue(page);
        await editorSelect(page, text.indexOf("SELECT 2"), text.length);
        expect(await app.editorHost.evaluate((el) => el.query)).toBe("SELECT 2 AS two");
        await page.locator("#execute").focus();
        await page.keyboard.press("Enter");
        expect(await app.read()).toEqual({ columns: ["two"], rows: [["2"]] });
    });

    test("a selection that starts in the editor and ends outside it is not used", async ({ page, app }) => {
        await app.open();
        await app.editorHost.evaluate((el) => (el.value = "SELECT 7 AS seven"));
        // With CodeMirror a mouse drag from the text to the status bar stays inside the editor (it
        // selects to the end of the text), so the mixed selection is made in script, after the
        // focus has left the editor: CodeMirror takes back a selection made elsewhere while it
        // has the focus.
        await editorSelect(page, 3);
        await page.locator("#execute").focus();
        await page.evaluate(() => {
            const editor = document.querySelector("#editor");
            const first = document.createTreeWalker(editor.querySelector(".cm-content") || editor, NodeFilter.SHOW_TEXT).nextNode();
            const range = document.createRange();
            range.setStart(first, 3);
            range.setEnd(document.querySelector("footer"), 1);
            const selection = getSelection();
            selection.removeAllRanges();
            selection.addRange(range);
        });
        expect(await app.editorHost.evaluate((el) => el.query)).toBe("SELECT 7 AS seven");
    });
});
