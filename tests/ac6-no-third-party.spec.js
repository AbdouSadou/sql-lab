const { test, expect } = require("./helpers");

// The full AC6 session is load, query, check, share. Load and query are here; sharing is
// in f3-share.spec.js (AC6); the check step arrives with the exercise mode.
test("AC6 load and a query make zero requests to non-same-origin hosts", async ({ app, net }) => {
    await app.open();
    await app.query("SELECT 1 AS one, 'two' AS two;");
    await app.query("SELECT sqlite_version() AS version;");

    expect(net.network.length, "the page really made requests").toBeGreaterThan(5);
    net.expectNoExternalRequests();
    net.expectNoSameOriginFailures();
});

// The session now also includes the run log, the evidence export and the verify page.
test("AC6 a session with a check, a share link, a history restore, an evidence export and the verify page makes zero requests to other hosts", async ({
    page,
    app,
    net,
}) => {
    await app.openSet("retail-basics", { ex: "e01" });
    await app.editor.fill("SELECT product_name FROM products;");
    await app.checkButton.click();
    await expect(app.feedback).toContainText(/Not quite\.|Correct\./);
    await app.copyLink();
    await app.query("SELECT 1 AS one;");
    await app.historyButton.click();
    await app.historyEntries.first().click();

    const file = await app.exportEvidence("U2034567");
    await page.goto("verify.html");
    await page.locator("#evidence-file").setInputFiles({ name: file.name, mimeType: "text/plain", buffer: file.buffer });
    await expect(page.locator("#verify-result")).toContainText("VALID");
    await expect(page.locator("#verify-result")).toContainText("U2034567");

    expect(net.network.length, "the session really made requests").toBeGreaterThan(5);
    net.expectNoExternalRequests();
    net.expectNoSameOriginFailures();
});
