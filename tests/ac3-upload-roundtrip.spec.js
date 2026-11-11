const path = require("node:path");
const { test, expect } = require("./helpers");

const FIXTURE = path.join(__dirname, "fixtures", "sample.db");
const QUERIES = {
    fruit: "SELECT id, name, price, note FROM fruit ORDER BY id;",
    joined: "SELECT f.name, t.tag FROM fruit f JOIN tags t ON t.fruit_id = f.id ORDER BY f.name, t.tag;",
    view: "SELECT name, price FROM v_priced ORDER BY price;",
};

// Export is the Export menu's "Database (.db)…" item and its dialog: real clicks, a real download event.
test("AC3 uploading a .db file works", async ({ app }) => {
    await app.open();
    await app.upload(FIXTURE);

    // an opened database runs nothing: the student sees "Opened sample.db" and runs the query
    await expect(app.toast).toContainText("Opened sample.db");
    await expect(app.pane).toHaveAttribute("data-state", "empty");
    const fruit = await app.query(QUERIES.fruit);
    await expect(app.status).toContainText("4 rows in");
    expect(fruit.columns).toEqual(["id", "name", "price", "note"]);
    expect(fruit.rows).toHaveLength(4);
    expect(fruit.rows[0]).toEqual(["1", "apple", "0.5", "crisp"]);
    expect((await app.query(QUERIES.view)).rows).toHaveLength(4);
    await expect(app.databaseLabel).toContainText("sample.db");
});

test("AC3 export then re-upload round-trips", async ({ page, app }) => {
    await app.open();
    await app.upload(FIXTURE);

    const before = {};
    for (const [key, sql] of Object.entries(QUERIES)) {
        before[key] = await app.query(sql);
    }

    // Change the database, so the export has to carry the edit and not just the fixture.
    await app.run("INSERT INTO fruit VALUES (5, 'elderberry', 6.5, 'edited'); DELETE FROM tags WHERE tag = 'green';");
    const { name, buffer: exported } = await app.exportFile();
    expect(name).toBe("sample.db"); // named from the database
    expect(exported.subarray(0, 15).toString()).toBe("SQLite format 3");

    // Re-upload into a fresh page (fresh in-memory database).
    const fresh = await page.context().newPage();
    const freshApp = new app.constructor(fresh);
    await freshApp.open();
    await freshApp.upload({ name: "exported.db", mimeType: "application/octet-stream", buffer: exported });

    const after = {};
    for (const [key, sql] of Object.entries(QUERIES)) {
        after[key] = await freshApp.query(sql);
    }

    // Untouched queries are identical; edited ones differ exactly as edited.
    expect(after.view.rows).toEqual([...before.view.rows, ["elderberry", "6.5"]]);
    expect(after.fruit.rows).toEqual([...before.fruit.rows, ["5", "elderberry", "6.5", "edited"]]);
    expect(after.joined.rows).toEqual(before.joined.rows.filter(([, tag]) => tag !== "green"));

    // And the round trip is lossless: re-export of the re-uploaded database gives the same rows.
    const second = await freshApp.exportDatabase();
    const third = await page.context().newPage();
    const thirdApp = new app.constructor(third);
    await thirdApp.open();
    await thirdApp.upload({ name: "second.db", mimeType: "application/octet-stream", buffer: second });
    for (const [key, sql] of Object.entries(QUERIES)) {
        expect(await thirdApp.query(sql), key).toEqual(after[key]);
    }
});
