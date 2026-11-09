const { test, expect } = require("./helpers");

// The full AC6 session is load, query, check, share. Only load and query exist at M1;
// extend this test when check and share land.
test("AC6 load and a query make zero requests to non-same-origin hosts", async ({ app, net }) => {
    await app.open();
    await app.query("SELECT 1 AS one, 'two' AS two;");
    await app.query("SELECT sqlite_version() AS version;");

    expect(net.network.length, "the page really made requests").toBeGreaterThan(5);
    net.expectNoExternalRequests();
    net.expectNoSameOriginFailures();
});
