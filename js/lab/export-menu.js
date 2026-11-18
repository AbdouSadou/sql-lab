// The Export menu in the top bar (UI plan, section 5): "Database (.db)…", "Results (.csv)"
// (disabled until a result with rows is on screen) and "Evidence (.txt)…", each with one line on
// what it is for, and, when the page gives it, a fourth entry for the tables (below). The entries
// keep the ids of the buttons they replace (#export-db, #export-evidence; #export-csv is new beside
// the result's own Download CSV button).
//
// mountExportMenu({button, menu, onDatabase, results, evidence, tables})
//   onDatabase()  "Database (.db)…" (js/lab/export-dialog.js)
//   results       {canDownload(), download()} of js/lab/results.js
//   evidence      {open()} of js/lab/evidence-dialog.js
//   tables        optional {text, description, onSelect}: one more entry, #export-tables, right
//                 after the database's (the assessment plan's Phase 3, behind its flag: the page
//                 gives it only then, and its words, so that a later phase can name it again in one
//                 place). Left out, the menu is what it was.

import {
    EXPORT_BUTTON_TITLE,
    EXPORT_DATABASE_TEXT,
    EXPORT_EVIDENCE_DESCRIPTION,
    EXPORT_EVIDENCE_TEXT,
    EXPORT_MENU_LABEL,
    EXPORT_RESULTS_DESCRIPTION,
    EXPORT_RESULTS_NONE,
    EXPORT_RESULTS_TEXT,
} from "./config.js";
import { icon } from "./icons.js";
import { mountMenu } from "./menu.js";

function item(id, glyph, label, description) {
    const node = document.createElement("button");
    node.type = "button";
    node.id = id;
    node.className = "menu-item menu-item--two-line";
    node.tabIndex = -1;
    node.setAttribute("role", "menuitem");
    const text = document.createElement("span");
    text.className = "menu-item-text";
    const title = document.createElement("span");
    title.className = "menu-item-label";
    title.textContent = label;
    const line = document.createElement("span");
    line.className = "menu-item-description";
    line.textContent = description;
    text.append(title, line);
    node.append(glyph, text);
    return node;
}

export function mountExportMenu({ button, menu, onDatabase, results, evidence, tables }) {
    menu.setAttribute("aria-label", EXPORT_MENU_LABEL);
    const database = item("export-db", icon("database"), EXPORT_DATABASE_TEXT, EXPORT_BUTTON_TITLE);
    const csv = item("export-csv", icon("sheet"), EXPORT_RESULTS_TEXT, EXPORT_RESULTS_DESCRIPTION);
    const record = item("export-evidence", icon("file-text"), EXPORT_EVIDENCE_TEXT, EXPORT_EVIDENCE_DESCRIPTION);
    const tablesItem = tables ? item("export-tables", icon("sheet"), tables.text, tables.description) : null;
    menu.replaceChildren(...(tablesItem ? [database, tablesItem, csv, record] : [database, csv, record]));

    function syncCsv() {
        const ready = results.canDownload();
        csv.setAttribute("aria-disabled", String(!ready));
        csv.querySelector(".menu-item-description").textContent = ready ? EXPORT_RESULTS_DESCRIPTION : EXPORT_RESULTS_NONE;
    }

    mountMenu(button, menu, {
        onOpen: syncCsv,
        onSelect(chosen) {
            if (chosen === database) {
                onDatabase();
            } else if (tablesItem && chosen === tablesItem) {
                tables.onSelect();
            } else if (chosen === csv) {
                results.download();
            } else if (chosen === record) {
                evidence.open();
            }
        },
    });
    syncCsv();
}
