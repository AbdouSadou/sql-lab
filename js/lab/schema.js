// F4, the Schema tab of the sidebar (UI plan, section 5): the open database's description (two
// lines, expandable), then its tables, then its views. Each row has a disclosure arrow, the name
// in the code typeface and the row count; the arrow shows the columns with their types and marks
// the primary and foreign keys. Clicking a name inserts it at the editor's caret. A filter box
// appears once there are more than SCHEMA_FILTER_FROM objects.
//
// mountSchema({container, editor}) builds the panel inside `container` (#schema) and follows the
// page through two events (index.js announces them):
//   lab:database-loaded  render from scratch (the expanded tables and the filter are forgotten)
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
    SCHEMA_FILTER_FROM,
    SCHEMA_FILTER_LABEL,
    SCHEMA_LESS_TEXT,
    SCHEMA_MORE_TEXT,
    SCHEMA_NO_MATCH,
    SCHEMA_PRIMARY_KEY,
    SCHEMA_TABLES_HEADING,
    SCHEMA_VIEWS_HEADING,
    schemaExpandLabel,
    schemaForeignKeyLabel,
    schemaInsertColumnLabel,
    schemaInsertLabel,
    schemaRowsWord,
} from "./config.js";
import { icon } from "./icons.js";
import { trackEditorSelection } from "./insert.js";
import { SCHEMA_OBJECTS_SQL, countRowsSql, identifierForSql, pragmaForeignKeyListSql, pragmaTableInfoSql } from "./sql.js";

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

// a mark drawn as an icon that is also announced (the key marks)
function namedIcon(glyph, label, className) {
    glyph.removeAttribute("aria-hidden");
    glyph.setAttribute("role", "img");
    glyph.setAttribute("aria-label", label);
    glyph.classList.add(className);
    return glyph;
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

const COUNT_FORMAT = new Intl.NumberFormat("en");

export function mountSchema({ container, editor }) {
    const tracker = trackEditorSelection(editor);

    let current = { database: null, dataset: null };
    let seen = null; // the signature the panel shows
    let filterText = "";
    let objectCount = 0;
    const expanded = new Set(); // names of the tables and views whose columns are shown

    container.classList.add("schema");

    const panel = element("div", "schema-panel");
    panel.id = "schema-panel";
    const dataset = element("div", "schema-dataset");
    // the name is in the database switcher and the status bar; here it is said, not shown
    const datasetName = element("p", "schema-dataset-name visually-hidden");
    const datasetDescription = element("p", "schema-dataset-description schema-dataset-description--clamped");
    datasetDescription.id = "schema-description";
    const more = element("button", "schema-more", SCHEMA_MORE_TEXT);
    more.type = "button";
    more.hidden = true;
    more.setAttribute("aria-controls", "schema-description");
    more.setAttribute("aria-expanded", "false");
    dataset.append(datasetName, datasetDescription, more);

    const filter = element("input", "schema-filter");
    filter.type = "search";
    filter.placeholder = SCHEMA_FILTER_LABEL;
    filter.setAttribute("aria-label", SCHEMA_FILTER_LABEL);
    filter.setAttribute("aria-controls", "schema-lists");
    filter.spellcheck = false;
    filter.autocomplete = "off";
    filter.hidden = true;

    const scroll = element("div", "schema-scroll");
    scroll.id = "schema-lists";
    const message = element("p", "schema-message");
    const tables = element("section", "schema-group");
    // h2: the page's h1 is the brand, and the tab is the panel's name
    const tablesHeading = element("h2", "schema-group-title", SCHEMA_TABLES_HEADING);
    tablesHeading.id = "schema-tables-title";
    const tableList = element("ul", "schema-list");
    tableList.setAttribute("aria-labelledby", "schema-tables-title");
    tables.append(tablesHeading, tableList);
    const views = element("section", "schema-group");
    const viewsHeading = element("h2", "schema-group-title", SCHEMA_VIEWS_HEADING);
    viewsHeading.id = "schema-views-title";
    const viewList = element("ul", "schema-list");
    viewList.setAttribute("aria-labelledby", "schema-views-title");
    views.append(viewsHeading, viewList);
    scroll.append(message, tables, views);
    panel.append(dataset, filter, scroll);
    container.replaceChildren(panel);

    // ---- the description ----------------------------------------------------------------

    function setClamped(clamped) {
        datasetDescription.classList.toggle("schema-dataset-description--clamped", clamped);
        more.textContent = clamped ? SCHEMA_MORE_TEXT : SCHEMA_LESS_TEXT;
        more.setAttribute("aria-expanded", String(!clamped));
    }

    // "Show more" only when two lines do not hold the text (measured once it is laid out)
    function measureDescription() {
        requestAnimationFrame(() => {
            if (!datasetDescription.classList.contains("schema-dataset-description--clamped")) {
                return;
            }
            more.hidden = !(datasetDescription.scrollHeight > datasetDescription.clientHeight + 1);
        });
    }

    more.addEventListener("click", () => {
        setClamped(!datasetDescription.classList.contains("schema-dataset-description--clamped"));
    });
    // and again whenever its box changes: a database loaded while another tab was shown is laid
    // out only when the Schema tab is, and a sidebar dragged narrower may need the button
    if (typeof ResizeObserver === "function") {
        new ResizeObserver(() => {
            if (!datasetDescription.hidden) {
                measureDescription();
            }
        }).observe(datasetDescription);
    }

    function renderDataset() {
        const entry = current.dataset;
        dataset.hidden = !entry;
        datasetName.textContent = entry ? entry.name : "";
        datasetDescription.textContent = entry && entry.description ? entry.description : "";
        datasetDescription.hidden = !datasetDescription.textContent;
        setClamped(true);
        more.hidden = true;
        if (!datasetDescription.hidden) {
            measureDescription();
        }
    }

    // ---- the lists ------------------------------------------------------------------------

    function showMessage(text) {
        message.textContent = text;
        message.hidden = !text;
    }

    function rowCount(database, name) {
        try {
            return Number(rows(database, countRowsSql(name))[0][0]);
        } catch (exc) {
            return null;
        }
    }

    // column name -> the table its foreign key refers to (tables only; a view has none)
    function foreignKeys(database, name) {
        const keys = new Map();
        try {
            for (const [, , table, from] of rows(database, pragmaForeignKeyListSql(name))) {
                keys.set(from, table);
            }
        } catch (exc) {
            // no marks, then
        }
        return keys;
    }

    // The columns are read when a table is first shown expanded, not for every table.
    function fillColumns(database, name, type, columns) {
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
        const references = type === "table" ? foreignKeys(database, name) : new Map();
        // table_info: cid, name, type, notnull, dflt_value, pk. A view's expression columns
        // have no declared type (an empty string), which is shown as no type at all.
        for (const [, columnName, columnType, , , pk] of found) {
            const item = element("li", "schema-column");
            const insert = element("button", "schema-insert schema-insert-column", columnName);
            insert.type = "button";
            insert.setAttribute("aria-label", schemaInsertColumnLabel(name, columnName));
            insert.dataset.focusKey = `column:${name}:${columnName}`;
            insert.addEventListener("click", () => tracker.insert(identifierForSql(columnName)));
            item.append(insert);
            if (pk) {
                item.append(namedIcon(icon("key"), SCHEMA_PRIMARY_KEY, "schema-pk"));
            }
            if (references.has(columnName)) {
                item.append(namedIcon(icon("link-2"), schemaForeignKeyLabel(references.get(columnName)), "schema-fk"));
            }
            if (columnType) {
                item.append(element("span", "schema-type", columnType));
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
        const closedArrow = icon("chevron-right");
        const openArrow = icon("chevron-down");
        expander.append(closedArrow, openArrow);

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
            count.append(COUNT_FORMAT.format(total), hiddenText(` ${schemaRowsWord(String(total))}`));
        }
        row.append(expander, insert, count);

        const columns = element("ul", "schema-columns");
        columns.id = columnsId;
        let filled = false;
        function show(isExpanded) {
            expander.setAttribute("aria-expanded", String(isExpanded));
            closedArrow.classList.toggle("hidden", isExpanded);
            openArrow.classList.toggle("hidden", !isExpanded);
            item.classList.toggle("schema-item--expanded", isExpanded);
            columns.hidden = !isExpanded;
            if (isExpanded && !filled) {
                filled = true;
                fillColumns(database, name, type, columns);
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

    function matches(name) {
        return !filterText || name.toLowerCase().includes(filterText.toLowerCase());
    }

    // what scrolls the lists: the sidebar's tab panel around the schema
    const scroller = () => container.closest(".tab-panel") ?? scroll;
    // A new database starts at the top. A panel that is not shown (another tab is) ignores the
    // reset and keeps its offset, so the reset waits until it is laid out again.
    let toTop = false;
    function scrollToTop() {
        const panel = scroller();
        panel.scrollTop = 0;
        toTop = panel.getClientRects().length === 0;
    }
    if (typeof ResizeObserver === "function") {
        new ResizeObserver(() => {
            if (toTop && scroller().getClientRects().length) {
                scrollToTop();
            }
        }).observe(scroller());
    }

    // render draws the lists again from the open database. The scroll position and the keyboard
    // focus (if it is on one of the panel's buttons) survive.
    function render() {
        const database = current.database;
        const scrollTop = scroller().scrollTop;
        const focused = panel.contains(document.activeElement) ? document.activeElement.dataset.focusKey : null;

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
        // a table that is gone is not expanded any more (a new table of that name starts closed)
        const names = new Set(objects.map((o) => o.name));
        for (const name of [...expanded]) {
            if (!names.has(name)) {
                expanded.delete(name);
            }
        }
        objectCount = objects.length;
        filter.hidden = objectCount <= SCHEMA_FILTER_FROM;
        if (filter.hidden && filterText) {
            filterText = "";
            filter.value = "";
        }
        const shown = objects.map((object, index) => ({ object, index })).filter(({ object }) => matches(object.name));
        if (!text && objects.length && !shown.length) {
            text = SCHEMA_NO_MATCH;
        }
        showMessage(text);
        const build = (kind) => shown.filter(({ object }) => object.type === kind).map(({ object, index }) => buildItem(database, object, index));
        const tableItems = build("table");
        const viewItems = build("view");
        tableList.replaceChildren(...tableItems);
        viewList.replaceChildren(...viewItems);
        tables.hidden = !tableItems.length;
        views.hidden = !viewItems.length;

        scroller().scrollTop = scrollTop;
        if (focused) {
            for (const button of panel.querySelectorAll("button[data-focus-key]")) {
                if (button.dataset.focusKey === focused) {
                    button.focus({ preventScroll: true });
                }
            }
        }
    }

    filter.addEventListener("input", () => {
        filterText = filter.value.trim();
        render();
    });

    document.addEventListener("lab:database-loaded", (event) => {
        current = { database: event.detail.database, dataset: event.detail.dataset };
        expanded.clear();
        filterText = "";
        filter.value = "";
        tracker.forget();
        seen = signature(current.database);
        renderDataset();
        render();
        scrollToTop();
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
    renderDataset();
    showMessage("");
    tables.hidden = true;
    views.hidden = true;
}
