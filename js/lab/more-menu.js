// The More menu (UI plan, section 6; docs/design/mockup/phone.html): under 700 px the top bar's
// actions, Copy link, Export, Theme and Help, fold into one menu behind the "More actions" button
// (the top bar keeps the database switcher). Each entry does what its own control does in the top
// bar, which is not shown there: Copy link copies (its popover, when the browser keeps the
// clipboard, opens under the More button), the three exports, the three themes (a radio group, the
// chosen one ticked), and Help (its popover under the More button). css/shell.css shows the button
// under 700 px only. A menu button on the popover attribute (js/lab/menu.js).
//
// mountMoreMenu({button, menu, copyLink, onDatabase, results, evidence, help})
//   copyLink     the Copy link action (js/lab/copy-link.js)
//   onDatabase   "Database (.db)…" (js/lab/export-dialog.js)
//   results      {canDownload(), download()} of js/lab/results.js
//   evidence     {open()} of js/lab/evidence-dialog.js
//   help         {open()} of js/lab/help.js

import {
    EXPORT_BUTTON_TITLE,
    EXPORT_DATABASE_TEXT,
    EXPORT_EVIDENCE_DESCRIPTION,
    EXPORT_EVIDENCE_TEXT,
    EXPORT_RESULTS_DESCRIPTION,
    EXPORT_RESULTS_NONE,
    EXPORT_RESULTS_TEXT,
    MORE_COPY_LINK_TEXT,
    MORE_EXPORT_LABEL,
    MORE_HELP_TEXT,
    MORE_MENU_LABEL,
    MORE_THEME_LABEL,
    THEME_OPTIONS,
} from "./config.js";
import { icon } from "./icons.js";
import { mountMenu } from "./menu.js";
import { setThemeChoice, themeChoice } from "./theme.js";

function el(tag, className, text) {
    const node = document.createElement(tag);
    if (className) {
        node.className = className;
    }
    if (text !== undefined) {
        node.textContent = text;
    }
    return node;
}

// an entry: its icon, its label, and a line on what it is for (optional)
function entry(id, glyph, label, { role = "menuitem", description = null } = {}) {
    const node = el("button", description ? "menu-item menu-item--two-line" : "menu-item");
    node.type = "button";
    node.id = id;
    node.tabIndex = -1;
    node.setAttribute("role", role);
    const text = el("span", "menu-item-text");
    text.append(el("span", description ? "menu-item-label" : null, label));
    if (description) {
        text.append(el("span", "menu-item-description", description));
    }
    node.append(glyph, text);
    return node;
}

// a group of entries under a heading that names it (the heading is the group's name, and is not
// read again as text)
function group(label, entries) {
    const node = el("div", "menu-group");
    node.setAttribute("role", "group");
    const heading = el("p", "menu-heading", label);
    heading.id = `more-${label.toLowerCase()}-heading`;
    heading.setAttribute("aria-hidden", "true");
    node.setAttribute("aria-labelledby", heading.id);
    node.append(heading, ...entries);
    return node;
}

function separator() {
    const node = el("div", "menu-separator");
    node.setAttribute("role", "separator");
    return node;
}

export function mountMoreMenu({ button, menu, copyLink, onDatabase, results, evidence, help }) {
    menu.setAttribute("aria-label", MORE_MENU_LABEL);

    const copy = entry("more-copy-link", icon("link"), MORE_COPY_LINK_TEXT);
    const database = entry("more-export-db", icon("database"), EXPORT_DATABASE_TEXT, { description: EXPORT_BUTTON_TITLE });
    const csv = entry("more-export-csv", icon("sheet"), EXPORT_RESULTS_TEXT, { description: EXPORT_RESULTS_DESCRIPTION });
    const record = entry("more-export-evidence", icon("file-text"), EXPORT_EVIDENCE_TEXT, { description: EXPORT_EVIDENCE_DESCRIPTION });
    const themes = THEME_OPTIONS.map((option) => {
        const mark = icon("check");
        mark.classList.add("menu-check");
        const item = entry(`more-theme-${option.value}`, mark, option.label, { role: "menuitemradio" });
        item.dataset.themeChoice = option.value;
        return item;
    });
    const helpItem = entry("more-help", icon("circle-help"), MORE_HELP_TEXT);
    menu.replaceChildren(
        copy,
        separator(),
        group(MORE_EXPORT_LABEL, [database, csv, record]),
        separator(),
        group(MORE_THEME_LABEL, themes),
        separator(),
        helpItem
    );

    // as the menu opens: Results (.csv) only with a result to save; the chosen theme ticked
    function sync() {
        const ready = results.canDownload();
        csv.setAttribute("aria-disabled", String(!ready));
        csv.querySelector(".menu-item-description").textContent = ready ? EXPORT_RESULTS_DESCRIPTION : EXPORT_RESULTS_NONE;
        for (const item of themes) {
            item.setAttribute("aria-checked", String(item.dataset.themeChoice === themeChoice()));
        }
    }

    mountMenu(button, menu, {
        // a menu of commands first: it opens on Copy link, not on the ticked theme
        opensOn: "first",
        onOpen: sync,
        onSelect(chosen) {
            if (chosen === copy) {
                copyLink();
            } else if (chosen === database) {
                onDatabase();
            } else if (chosen === csv) {
                results.download();
            } else if (chosen === record) {
                evidence.open();
            } else if (chosen === helpItem) {
                help.open();
            } else if (chosen.dataset.themeChoice) {
                setThemeChoice(chosen.dataset.themeChoice);
            }
        },
    });
    sync();
}
