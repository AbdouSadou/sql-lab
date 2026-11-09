// F4 schema sidebar: the tables and views of the open database, each expandable to its
// columns, with row counts. Clicking a name inserts it at the editor's caret.
//
// mountSchema({aside, editor}) builds the panel inside `aside` and follows the page through
// two events (index.js announces them):
//   lab:database-loaded  render from scratch (the expanded tables are forgotten)
//   lab:run-finished     render again only if the schema or the data changed: PRAGMA
//                        schema_version moves on CREATE/DROP/ALTER, total_changes() on
//                        INSERT/UPDATE/DELETE, and a SELECT moves neither
//
// Every name comes from the database file and is untrusted, so the DOM is built with
// createElement and textContent only. A name is also never spliced into SQL unquoted.

import {
    SCHEMA_COLUMNS_UNAVAILABLE,
    SCHEMA_COUNT_UNAVAILABLE,
    SCHEMA_DASH,
    SCHEMA_EMPTY_MESSAGE,
    SCHEMA_ERROR_MESSAGE,
    SCHEMA_OPEN_QUERY,
    SCHEMA_REGION_LABEL,
    SCHEMA_TOGGLE_TEXT,
    SCHEMA_VIEW_BADGE,
    schemaExpandLabel,
    schemaInsertColumnLabel,
    schemaInsertLabel,
    schemaRowsWord,
} from "./config.js";
import { trackEditorSelection } from "./insert.js";
import { SCHEMA_OBJECTS_SQL, countRowsSql, identifierForSql, pragmaTableInfoSql } from "./sql.js";

function element(tag, className, text) {
    const el = document.createElement(tag);
    if (className) {
        el.className = className;
    }
    if (text !== undefined) {
        el.textContent = text;
    }
    return el;
}

function hiddenText(text) {
    return element("span", "visually-hidden", text);
}

// rows runs SQL on the connection and returns the rows as arrays.
function rows(database, sql) {
    return database.db.exec({ sql, rowMode: "array", returnValue: "resultRows" });
}

// signature changes whenever the schema or any row of the open database changes. It is
// null if the connection cannot be asked.
function signature(database) {
    try {
        const version = rows(database, "PRAGMA schema_version")[0][0];
        const changes = rows(database, "SELECT total_changes()")[0][0];
        return `${version}:${changes}`;
    } catch (exc) {
        return null;
    }
}

export function mountSchema({ aside, editor }) {
    const tracker = trackEditorSelection(editor);

    let current = { database: null, dataset: null };
    let seen = null; // the signature the panel shows
    let open = window.matchMedia ? window.matchMedia(SCHEMA_OPEN_QUERY).matches : true;
    const expanded = new Set(); // names of the tables and views whose columns are shown

    aside.classList.add("schema");
    aside.setAttribute("aria-label", SCHEMA_REGION_LABEL);

    const toggle = element("button", "schema-toggle", SCHEMA_TOGGLE_TEXT);
    toggle.type = "button";
    toggle.setAttribute("aria-controls", "schema-panel");

    const panel = element("div", "schema-panel");
    panel.id = "schema-panel";
    const dataset = element("div", "schema-dataset");
    const datasetName = element("p", "schema-dataset-name");
    const datasetDescription = element("p", "schema-dataset-description");
    dataset.append(datasetName, datasetDescription);
    const scroll = element("div", "schema-scroll");
    const message = element("p", "schema-message");
    const list = element("ul", "schema-list");
    scroll.append(message, list);
    panel.append(dataset, scroll);
    aside.replaceChildren(toggle, panel);

    function applyOpen() {
        toggle.setAttribute("aria-expanded", String(open));
        panel.hidden = !open;
        aside.classList.toggle("schema--collapsed", !open);
    }
    toggle.addEventListener("click", () => {
        open = !open;
        applyOpen();
    });

    function renderDataset() {
        const entry = current.dataset;
        dataset.hidden = !entry;
        datasetName.textContent = entry ? entry.name : "";
        datasetDescription.textContent = entry && entry.description ? entry.description : "";
        datasetDescription.hidden = !datasetDescription.textContent;
    }

    function showMessage(text) {
        message.textContent = text;
        message.hidden = !text;
    }

    function rowCount(database, name) {
        try {
            return String(rows(database, countRowsSql(name))[0][0]);
        } catch (exc) {
            return null;
        }
    }

    // The columns are read when a table is first shown expanded, not for every table.
    function fillColumns(database, name, columns) {
        let found;
        try {
            found = rows(database, pragmaTableInfoSql(name));
        } catch (exc) {
            found = null;
        }
        if (found === null) {
            const item = element("li", "schema-column schema-unavailable", SCHEMA_DASH);
            item.append(hiddenText(` (${SCHEMA_COLUMNS_UNAVAILABLE})`));
            columns.append(item);
            return;
        }
        // table_info: cid, name, type, notnull, dflt_value, pk. A view's expression columns
        // have no declared type (an empty string), which is shown as no type at all.
        for (const [, columnName, type, , , pk] of found) {
            const item = element("li", "schema-column");
            const insert = element("button", "schema-insert schema-insert-column", columnName);
            insert.type = "button";
            insert.setAttribute("aria-label", schemaInsertColumnLabel(name, columnName));
            insert.addEventListener("click", () => tracker.insert(identifierForSql(columnName)));
            item.append(insert);
            if (type) {
                item.append(element("span", "schema-type", type));
            }
            if (pk) {
                const key = element("span", "schema-pk", "PK");
                key.title = "primary key";
                item.append(key);
            }
            columns.append(item);
        }
    }

    function buildItem(database, { type, name }, index) {
        const item = element("li", "schema-item");
        item.dataset.kind = type;
        const row = element("div", "schema-row");

        const columnsId = `schema-columns-${index}`;
        const expander = element("button", "schema-expand");
        expander.type = "button";
        expander.setAttribute("aria-label", schemaExpandLabel(type, name));
        expander.setAttribute("aria-controls", columnsId);
        expander.dataset.focusKey = `expand:${name}`;

        const insert = element("button", "schema-insert", name);
        insert.type = "button";
        insert.setAttribute("aria-label", schemaInsertLabel(type, name));
        insert.dataset.focusKey = `insert:${name}`;
        insert.addEventListener("click", () => tracker.insert(identifierForSql(name)));

        const count = element("span", "schema-count");
        const total = rowCount(database, name);
        if (total === null) {
            count.append(SCHEMA_DASH, hiddenText(` (${SCHEMA_COUNT_UNAVAILABLE})`));
        } else {
            count.append(total, hiddenText(` ${schemaRowsWord(total)}`));
        }

        row.append(expander, insert);
        if (type === "view") {
            row.append(element("span", "schema-kind", SCHEMA_VIEW_BADGE));
        }
        row.append(count);

        const columns = element("ul", "schema-columns");
        columns.id = columnsId;
        let filled = false;
        function show(isExpanded) {
            expander.setAttribute("aria-expanded", String(isExpanded));
            columns.hidden = !isExpanded;
            if (isExpanded && !filled) {
                filled = true;
                fillColumns(database, name, columns);
            }
        }
        expander.addEventListener("click", () => {
            const isExpanded = expander.getAttribute("aria-expanded") !== "true";
            if (isExpanded) {
                expanded.add(name);
            } else {
                expanded.delete(name);
            }
            show(isExpanded);
        });
        show(expanded.has(name));

        item.append(row, columns);
        return item;
    }

    // render draws the panel again from the open database. The scroll position and the
    // keyboard focus (if it is on one of the panel's buttons) survive.
    function render() {
        const database = current.database;
        const scrollTop = scroll.scrollTop;
        const focused = panel.contains(document.activeElement)
            ? document.activeElement.dataset.focusKey
            : null;

        let objects = [];
        let text = "";
        if (database) {
            try {
                objects = rows(database, SCHEMA_OBJECTS_SQL).map(([type, name]) => ({ type, name }));
                if (!objects.length) {
                    text = SCHEMA_EMPTY_MESSAGE;
                }
            } catch (exc) {
                text = SCHEMA_ERROR_MESSAGE;
            }
        }
        showMessage(text);
        // a table that is gone is not expanded any more (a new table of that name starts closed)
        const names = new Set(objects.map((o) => o.name));
        for (const name of [...expanded]) {
            if (!names.has(name)) {
                expanded.delete(name);
            }
        }
        list.replaceChildren(...objects.map((object, index) => buildItem(database, object, index)));

        scroll.scrollTop = scrollTop;
        if (focused) {
            for (const button of list.querySelectorAll("button[data-focus-key]")) {
                if (button.dataset.focusKey === focused) {
                    button.focus({ preventScroll: true });
                }
            }
        }
    }

    document.addEventListener("lab:database-loaded", (event) => {
        current = { database: event.detail.database, dataset: event.detail.dataset };
        expanded.clear();
        tracker.forget();
        seen = signature(current.database);
        renderDataset();
        scroll.scrollTop = 0;
        render();
    });

    document.addEventListener("lab:run-finished", (event) => {
        if (event.detail.database !== current.database) {
            return;
        }
        const now = signature(current.database);
        if (now !== seen) {
            seen = now;
            render();
        }
    });

    // nothing is drawn until the first database is open
    applyOpen();
    renderDataset();
    showMessage("");
}
