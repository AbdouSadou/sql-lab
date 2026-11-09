// What the lab adds to the toolbar (js/components/toolbar.js is upstream's and stays as it
// is): the dataset picker and the export button, plus an accessible name for the help link
// and keyboard access to "open file". Built with DOM calls and textContent only,
// because names come from the manifest or from a file the student chose.
//
// mountToolbar(toolbar, {onSelect, onExport}) returns the picker's controls:
//   setManifest(manifest)  the list of datasets (the result of getManifest()), or its failure
//   sync()                 put the select back on the open database (after a failed switch)
//   rename(name)           the open database was renamed
// The picker follows the page by listening to "lab:database-loaded" on the document, so it
// shows a built-in dataset by name and anything else (an upload, a URL, the empty database
// after a failed start) as a disabled selected option naming the file.

import {
    EXPORT_BUTTON_TEXT,
    EXPORT_BUTTON_TITLE,
    HELP_LABEL,
    PICKER_LABEL,
    PICKER_LOADING,
    PICKER_NONE_LABEL,
} from "./config.js";

export function mountToolbar(toolbar, { onSelect, onExport }) {
    const group = document.createElement("span");
    group.className = "dataset-picker";
    const label = document.createElement("label");
    label.htmlFor = "dataset-picker";
    label.textContent = PICKER_LABEL;
    const select = document.createElement("select");
    select.id = "dataset-picker";
    select.disabled = true;
    group.append(label, select);

    const exportButton = document.createElement("button");
    exportButton.type = "button";
    exportButton.id = "export-db";
    exportButton.className = "button button--small";
    exportButton.textContent = EXPORT_BUTTON_TEXT;
    exportButton.title = EXPORT_BUTTON_TITLE;

    // the picker first, the export button before the help link at the end
    toolbar.prepend(group);
    const help = toolbar.querySelector(".button-help");
    toolbar.insertBefore(exportButton, help);

    // Two things about upstream's markup, fixed here so that components/toolbar.js stays
    // as it is. The help link holds only an icon, so it gets a name (and the icon, which
    // would be announced as an unnamed image, is hidden from assistive technology). And
    // "open file" is a label around a hidden file input, which the keyboard cannot reach:
    // the label becomes a button that opens the file chooser on Enter or Space.
    help.setAttribute("aria-label", HELP_LABEL);
    help.title = HELP_LABEL;
    const icon = help.querySelector("svg");
    icon?.removeAttribute("role");
    icon?.setAttribute("aria-hidden", "true");
    makeKeyboardOperable(toolbar.btnOpenFile, toolbar.file);

    let datasets = [];
    let manifestKnown = false; // the list of datasets has been fetched (or failed)
    let loaded = false; // a database has been opened
    let current = { id: null, name: "" }; // id is null for anything that is not built in

    function option(value, text, { selected = false, disabled = false, title = "" } = {}) {
        const el = document.createElement("option");
        el.value = value;
        el.textContent = text;
        el.selected = selected;
        el.disabled = disabled;
        if (title) {
            el.title = title;
        }
        return el;
    }

    function render() {
        select.replaceChildren();
        if (!manifestKnown && !loaded) {
            select.append(option("", PICKER_LOADING, { selected: true, disabled: true }));
            select.disabled = true;
            return;
        }
        const builtIn = loaded && datasets.some((d) => d.id === current.id);
        for (const dataset of datasets) {
            select.append(
                option(dataset.id, dataset.name, {
                    selected: builtIn && dataset.id === current.id,
                    title: dataset.description,
                })
            );
        }
        if (!builtIn) {
            // not a built-in dataset: a disabled option that names the open database (or says
            // that none is open, after a start that failed before any database existed)
            const text = loaded ? current.name : PICKER_NONE_LABEL;
            select.prepend(option("", text, { selected: true, disabled: true }));
        }
        select.disabled = datasets.length === 0;
    }

    select.addEventListener("change", () => {
        const entry = datasets.find((d) => d.id === select.value);
        if (entry) {
            onSelect(entry);
        }
    });
    exportButton.addEventListener("click", () => {
        onExport();
    });

    document.addEventListener("lab:database-loaded", (event) => {
        const { database, dataset } = event.detail;
        loaded = true;
        current = { id: dataset ? dataset.id : null, name: database.name };
        render();
    });

    render();
    return {
        setManifest(manifest) {
            datasets = manifest.ok ? manifest.datasets : [];
            manifestKnown = true;
            render();
        },
        sync: render,
        // the student renamed the database: the option naming a file that is not built in
        rename(name) {
            current.name = name;
            render();
        },
    };
}

// makeKeyboardOperable turns the label of a file input into a focusable button. A click on
// it already opens the chooser (the label forwards it to the input); Enter and Space do the
// same, as they would for a button.
function makeKeyboardOperable(label, input) {
    label.tabIndex = 0;
    label.setAttribute("role", "button");
    label.addEventListener("keydown", (event) => {
        if (event.target === label && (event.key === "Enter" || event.key === " ")) {
            event.preventDefault();
            input.click();
        }
    });
}
