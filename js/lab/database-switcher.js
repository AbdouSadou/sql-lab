// The database switcher in the top bar (UI plan, section 5): a button showing the open database,
// and its menu: the course databases (name, one line of description, size), then "Open a file…"
// and "Open from URL…". It replaces the Dataset dropdown, the editable file name and both open
// links of the old toolbar. Built with createElement and textContent only: names and
// descriptions come from the manifest, file names from the student's own files.
//
// mountDatabaseSwitcher({button, label, menu, onSelect, onOpenFile, onOpenUrl}) -> controls
//   onSelect(dataset)  a course database other than the open one was chosen
//   onOpenFile()       "Open a file…" (index.js opens the file chooser)
//   onOpenUrl()        "Open from URL…"
// The controls:
//   setManifest(manifest)  the list of course databases (getManifest()'s answer, or its failure)
//   sync()                 show the open database again (after a switch that failed or was
//                          dropped for a newer one)
//   rename(name)           the open database was renamed (the export dialog)
// It follows the page through lab:database-loaded: a course database is shown by its name,
// anything else (an upload, a URL, the empty database) by its file name.
//
// A course database's size comes from a HEAD request for its file, made the first time the menu
// opens (same origin, no body); a size that cannot be had is left out.

import {
    DATABASE_LOADING,
    DATABASE_MENU_LABEL,
    DATABASE_NONE,
    OPEN_FILE_DESCRIPTION,
    OPEN_FILE_TEXT,
    OPEN_URL_DESCRIPTION,
    OPEN_URL_TEXT,
    databaseButtonLabel,
    databaseSizeText,
} from "./config.js";
import { icon } from "./icons.js";
import { MOD_KEY } from "./keys.js";
import { mountMenu } from "./menu.js";

function element(tag, className, text) {
    const node = document.createElement(tag);
    if (className) {
        node.className = className;
    }
    if (text !== undefined) {
        node.textContent = text;
    }
    return node;
}

// menuItem builds one entry: an icon (or the tick of a radio item), a label and a line under it
function menuItem({ role, id, glyph, label, description }) {
    const item = element("button", "menu-item menu-item--two-line");
    item.type = "button";
    item.tabIndex = -1;
    item.setAttribute("role", role);
    if (id) {
        item.id = id;
    }
    if (glyph) {
        item.append(glyph);
    }
    const text = element("span", "menu-item-text");
    text.append(element("span", "menu-item-label", label));
    const line = element("span", "menu-item-description", description ?? "");
    line.hidden = !description;
    // one line (css/menu.css cuts a long one); the whole text on hover
    if (description) {
        line.title = description;
    }
    text.append(line);
    item.append(text);
    return item;
}

// shortcutHint: the key that does the same as an entry, shown at its end ("Ctrl O", "⌘ O");
// aria-keyshortcuts on the entry says it to assistive technology
function shortcutHint(key) {
    const hint = element("span", "menu-item-shortcut");
    hint.setAttribute("aria-hidden", "true");
    hint.textContent = `${MOD_KEY} ${key}`;
    return hint;
}

export function mountDatabaseSwitcher({ button, label, menu, onSelect, onOpenFile, onOpenUrl }) {
    menu.setAttribute("aria-label", DATABASE_MENU_LABEL);

    let datasets = [];
    let manifestKnown = false; // the list of course databases has been fetched (or failed)
    let loaded = false; // a database has been opened
    let current = { id: null, name: "" }; // id is null for anything that is not a course database
    // the course database last asked for: the open one, or one still loading. Choosing it again
    // does nothing; choosing the open one while another is loading asks for it again, so the
    // slower load never wins over the student's last choice (as the old select did)
    let chosen = null;
    const sizes = new Map(); // dataset id -> bytes
    let sizesAsked = false;
    const sizeLines = new Map(); // dataset id -> the element showing its size

    function shownName() {
        if (!manifestKnown && !loaded) {
            return DATABASE_LOADING;
        }
        const builtIn = loaded ? datasets.find((d) => d.id === current.id) : null;
        return builtIn ? builtIn.name : loaded ? current.name : DATABASE_NONE;
    }

    function describe(dataset) {
        const parts = [];
        if (dataset.description) {
            parts.push(dataset.description);
        }
        return parts.join(" ");
    }

    function renderButton() {
        const name = shownName();
        label.textContent = name;
        button.setAttribute("aria-label", databaseButtonLabel(name));
        // while the list is on its way and nothing is open there is nothing to choose yet (as the
        // old Dataset select); a file opened in that time (Ctrl+O still works) enables it
        button.disabled = !manifestKnown && !loaded;
        for (const item of menu.querySelectorAll("[data-dataset-id]")) {
            item.setAttribute("aria-checked", String(loaded && item.dataset.datasetId === current.id));
        }
    }

    // the menu's entries are rebuilt only when the list changes (never while it is open, which
    // would take the focus away); the ticks and sizes are updated in place
    function renderMenu() {
        sizeLines.clear();
        const items = datasets.map((dataset) => {
            const tick = icon("check");
            tick.classList.add("menu-check");
            const item = menuItem({ role: "menuitemradio", glyph: tick, label: dataset.name, description: describe(dataset) });
            item.dataset.datasetId = dataset.id;
            const size = element("span", "menu-item-size");
            size.textContent = sizes.has(dataset.id) ? databaseSizeText(sizes.get(dataset.id)) : "";
            item.append(size);
            sizeLines.set(dataset.id, size);
            return item;
        });
        const separator = element("div", "menu-separator");
        separator.setAttribute("role", "separator");
        const openFile = menuItem({ role: "menuitem", id: "open-file", glyph: icon("file-up"), label: OPEN_FILE_TEXT, description: OPEN_FILE_DESCRIPTION });
        openFile.setAttribute("aria-keyshortcuts", "Control+O Meta+O");
        openFile.append(shortcutHint("O"));
        const openUrl = menuItem({ role: "menuitem", id: "open-url", glyph: icon("globe"), label: OPEN_URL_TEXT, description: OPEN_URL_DESCRIPTION });
        openUrl.setAttribute("aria-keyshortcuts", "Control+U Meta+U");
        openUrl.append(shortcutHint("U"));
        menu.replaceChildren(...items, ...(items.length ? [separator] : []), openFile, openUrl);
        renderButton();
    }

    function askSizes() {
        if (sizesAsked) {
            return;
        }
        sizesAsked = true;
        for (const dataset of datasets) {
            fetch(dataset.file, { method: "HEAD", cache: "no-cache" })
                .then((response) => (response.ok ? Number(response.headers.get("content-length")) : NaN))
                .then((bytes) => {
                    if (Number.isFinite(bytes) && bytes > 0) {
                        sizes.set(dataset.id, bytes);
                        const line = sizeLines.get(dataset.id);
                        if (line) {
                            line.textContent = databaseSizeText(bytes);
                        }
                    }
                })
                .catch(() => {});
        }
    }

    mountMenu(button, menu, {
        onOpen() {
            renderButton();
            askSizes();
        },
        onSelect(item) {
            if (item.dataset.datasetId) {
                const dataset = datasets.find((d) => d.id === item.dataset.datasetId);
                // the database already asked for again: nothing to do (it would discard the
                // student's work)
                if (dataset && dataset.id !== chosen) {
                    chosen = dataset.id;
                    onSelect(dataset);
                }
            } else if (item.id === "open-file") {
                onOpenFile();
            } else if (item.id === "open-url") {
                onOpenUrl();
            }
        },
    });

    document.addEventListener("lab:database-loaded", (event) => {
        const { database, dataset } = event.detail;
        loaded = true;
        current = { id: dataset ? dataset.id : null, name: database.name };
        chosen = current.id;
        renderButton();
    });

    renderMenu();
    return {
        setManifest(manifest) {
            datasets = manifest.ok ? manifest.datasets : [];
            manifestKnown = true;
            renderMenu();
        },
        // a switch did not happen: the open database is the one asked for again
        sync() {
            chosen = loaded ? current.id : null;
            renderButton();
        },
        rename(name) {
            current.name = name;
            renderButton();
        },
    };
}
