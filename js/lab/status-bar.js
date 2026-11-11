// The status bar (UI plan, section 5): the open database's name, the last run's summary and the
// SQLite version; the credit beside them is static markup in index.html. It follows the page
// through the two page events of js/index.js.
//
// mountStatusBar({database, run, version}) takes the three elements to fill.

import { STATUS_NO_RUN, STATUS_RUN_FAILED, resultDoneText, statusRowsText, statusTimeText, statusVersionText } from "./config.js";

export function mountStatusBar({ database: databaseEl, run: runEl, version: versionEl }) {
    function showName(name) {
        databaseEl.textContent = name;
        databaseEl.title = name;
    }

    document.addEventListener("lab:database-loaded", (event) => {
        const { database, dataset } = event.detail;
        // a course database by its name, anything else by its file name (textContent: untrusted);
        // a long one is cut with an ellipsis (css/shell.css), so the title has it whole
        showName(dataset ? dataset.name : database.name);
        runEl.textContent = STATUS_NO_RUN;
        if (!versionEl.textContent) {
            try {
                versionEl.textContent = statusVersionText(database.capi.sqlite3_libversion());
            } catch {
                // the version stays unsaid
            }
        }
    });

    document.addEventListener("lab:run-finished", (event) => {
        const { ok, rows, elapsed, resultSet, changes } = event.detail;
        if (!ok) {
            runEl.textContent = STATUS_RUN_FAILED;
            return;
        }
        // "5 rows in 3 ms"; when no statement returned a result set, the summary line's own words
        // (plan, section 5: "Done.", and the rows changed when the engine reports them): "Done in
        // 2 ms" or "Done. 3 rows changed in 2 ms". The time is in a span of its own (it differs
        // from run to run).
        const time = document.createElement("span");
        time.className = "status-time";
        time.textContent = statusTimeText(elapsed ?? 0);
        runEl.replaceChildren(resultSet === false ? resultDoneText(changes ?? null) : statusRowsText(rows ?? 0), time);
    });

    return {
        // the database was renamed (js/lab/export-dialog.js); a course database keeps its name
        rename(name, { builtIn }) {
            if (!builtIn) {
                showName(name);
            }
        },
    };
}
