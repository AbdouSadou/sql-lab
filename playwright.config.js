// Playwright config. Every spec runs against the site served twice:
//   root     http://127.0.0.1:<base>/        (repo root at the origin root)
//   subpath  http://127.0.0.1:<base+1>/repo/ (how GitHub Pages serves a project site)
// The subpath server answers 404 outside /repo/, so any root-absolute URL fails there.
//
// TEST_PORT_BASE (default 4173) picks the two ports, so parallel runs can avoid each other.
// PW_WEBKIT=1 adds the WebKit projects (off by default: WebKit needs system libraries
// that not every machine has).
const { defineConfig, devices } = require("@playwright/test");

const base = Number(process.env.TEST_PORT_BASE || 4173);
if (!Number.isInteger(base) || base < 1 || base + 1 > 65535) {
    throw new Error(`TEST_PORT_BASE must be a valid port number, got ${process.env.TEST_PORT_BASE}`);
}

const MOUNTS = {
    root: { port: base, mount: "/" },
    subpath: { port: base + 1, mount: "/repo/" },
};

const origin = (m) => `http://127.0.0.1:${m.port}${m.mount}`;

const browsers = [
    ["chromium", devices["Desktop Chrome"]],
    ["firefox", devices["Desktop Firefox"]],
];
if (process.env.PW_WEBKIT === "1") {
    browsers.push(["webkit", devices["Desktop Safari"]]);
}

const projects = browsers.flatMap(([name, device]) =>
    Object.entries(MOUNTS).map(([mountName, m]) => ({
        name: `${name}-${mountName}`,
        use: { ...device, baseURL: origin(m) },
    }))
);

module.exports = defineConfig({
    testDir: "./tests",
    testMatch: "**/*.spec.js",
    timeout: 30_000,
    expect: { timeout: 10_000 },
    forbidOnly: !!process.env.CI,
    retries: process.env.CI ? 1 : 0,
    reporter: process.env.CI ? [["list"], ["html", { open: "never" }]] : "list",
    projects,
    webServer: Object.values(MOUNTS).map((m) => ({
        command: `node tests/static-server.mjs ${m.port} ${m.mount}`,
        url: origin(m),
        reuseExistingServer: false,
        timeout: 15_000,
    })),
});
