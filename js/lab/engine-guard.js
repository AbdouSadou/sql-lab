// A classic script, loaded in index.html immediately before vendor/sqlite3.js.
//
// The SQLite engine reads its own settings from the page's address: sqlite3.dir and
// sqlite3.wasm choose where the .wasm file is fetched from, so index.html?sqlite3.dir=https://host/
// would fetch and run the engine from another host, silently. vendor/ must stay as it was
// downloaded, so this script removes every query parameter whose name starts with "sqlite3."
// from the address (history.replaceState: no new history entry, no reload) before the engine
// script reads it; if the address cannot be rewritten, the page is stopped instead. Names are
// compared the way the engine reads them, through URLSearchParams, so a percent-encoded name
// such as sqlite%33.dir is caught too.
//
// It also gives the engine a console.warn of its own. When a statement fails to run, the engine
// warns "sqlite3_step() rc= 1 SQLITE_ERROR SQL = <the whole statement>", which for an exercise's
// model query would put the answer in the console; the warning keeps its result code and loses
// the SQL. (The engine merges globalThis.sqlite3ApiConfig into its own settings and removes it.)
//
// Only the matching parameters go. The others (db, set, ex, ...) are kept byte for byte, as are
// the fragment (the share link) and the path; when no parameter matches, nothing is touched.

(function () {
    try {
        const warn = console.warn.bind(console);
        window.sqlite3ApiConfig = Object.assign(window.sqlite3ApiConfig || {}, {
            warn: (...args) => (args[0] === "sqlite3_step() rc=" ? warn(...args.slice(0, 3)) : warn(...args)),
        });
    } catch {
        // no console: nothing to filter
    }
})();

(function () {
    let found = false;
    try {
        const search = window.location.search;
        if (search.length < 2) {
            return;
        }
        const kept = search
            .slice(1)
            .split("&")
            .filter((pair) => {
                const name = new URLSearchParams(pair).keys().next().value;
                const drop = typeof name === "string" && name.startsWith("sqlite3.");
                found = found || drop;
                return !drop;
            });
        if (!found) {
            return;
        }
        // The new address is the whole current one with only its query replaced. Building it from
        // the bare path would break for a path that starts with "//" (a root-hosted site whose
        // server maps it to the index): "//?x" is an address on another host, replaceState refuses
        // it, and the engine would then read the parameter.
        const url = new URL(window.location.href);
        url.search = kept.length ? "?" + kept.join("&") : "";
        window.history.replaceState(window.history.state, "", url.href);
    } catch {
        // An address that cannot be rewritten while it still carries an engine parameter: the
        // page stops here, so vendor/sqlite3.js (which reads the parameter) never runs. The
        // page then does not work, which is better than running an engine from another place.
        if (found) {
            try {
                window.stop();
            } catch {
                // nothing more can be done from here
            }
        }
    }
})();
