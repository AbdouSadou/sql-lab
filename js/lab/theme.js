// The theme: light, dark, or match the device (the default), chosen in the Theme menu and kept in
// localStorage under THEME_STORAGE_KEY ("light" or "dark"; nothing stored means "match the device").
// css/tokens.css does the drawing: data-theme on <html> pins one colour scheme, no attribute follows
// prefers-color-scheme. js/lab/theme-boot.js applies the stored choice before the first paint.
//
// mountThemeMenu(container, {before, buttonClass}) adds the Theme button and its menu to container,
// before the element `before` (or at the end), and returns the button. Its icon is a sun or a moon
// for the scheme in use.

import { THEME_BUTTON_TEXT, THEME_MENU_LABEL, THEME_OPTIONS, THEME_STORAGE_KEY } from "./config.js";
import { icon } from "./icons.js";
import { mountMenu } from "./menu.js";

const DARK_QUERY = "(prefers-color-scheme: dark)";
const CHOICES = new Set(THEME_OPTIONS.map((option) => option.value));

// The choice of this page: read once, then kept here, so a choice still holds for the page when
// storage cannot keep it.
let current = readStoredChoice();

function readStoredChoice() {
    try {
        const stored = localStorage.getItem(THEME_STORAGE_KEY);
        return stored === "light" || stored === "dark" ? stored : "device";
    } catch {
        return "device";
    }
}

export function themeChoice() {
    return current;
}

// The scheme in use: the choice, or the device's for "device".
export function resolvedTheme(choice = current) {
    if (choice === "light" || choice === "dark") {
        return choice;
    }
    return window.matchMedia(DARK_QUERY).matches ? "dark" : "light";
}

export function setThemeChoice(choice) {
    if (!CHOICES.has(choice)) {
        return;
    }
    current = choice;
    try {
        if (choice === "device") {
            localStorage.removeItem(THEME_STORAGE_KEY);
        } else {
            localStorage.setItem(THEME_STORAGE_KEY, choice);
        }
    } catch {
        // storage unusable: the choice holds for this page only
    }
    applyTheme();
    // the Theme button shows the scheme in use (its sun or moon), whichever menu chose it
    document.dispatchEvent(new CustomEvent("lab:theme-chosen"));
}

// data-theme on <html> pins the palette; the browser's own chrome (a phone's address bar) takes
// its colour from the page's two <meta name="theme-color">, one per scheme (data-scheme): a pinned
// theme makes its own apply everywhere and the other nowhere, Match device gives them their media
// queries back. The same as js/lab/theme-boot.js does at load; no colour is written here.
function applyTheme() {
    const root = document.documentElement;
    if (current === "light" || current === "dark") {
        root.dataset.theme = current;
    } else {
        delete root.dataset.theme;
    }
    for (const meta of document.querySelectorAll('meta[name="theme-color"][data-scheme]')) {
        const scheme = meta.dataset.scheme;
        meta.media = current === "device" ? `(prefers-color-scheme: ${scheme})` : scheme === current ? "all" : "not all";
    }
}

export function mountThemeMenu(container, { before = null, buttonClass = "button button--small" } = {}) {
    const button = document.createElement("button");
    button.type = "button";
    button.id = "theme-button";
    button.className = `${buttonClass} theme-button`;
    // both icons, one shown: the sprite builder finds icons by their literal names
    const sun = icon("sun");
    const moon = icon("moon");
    const text = document.createElement("span");
    text.textContent = THEME_BUTTON_TEXT;
    button.append(sun, moon, text);

    const menu = document.createElement("div");
    menu.id = "theme-menu";
    menu.className = "menu";
    menu.setAttribute("role", "menu");
    menu.setAttribute("aria-label", THEME_MENU_LABEL);
    for (const option of THEME_OPTIONS) {
        const item = document.createElement("button");
        item.type = "button";
        item.className = "menu-item";
        item.setAttribute("role", "menuitemradio");
        item.tabIndex = -1;
        item.dataset.themeChoice = option.value;
        const mark = icon("check");
        mark.classList.add("menu-check");
        const label = document.createElement("span");
        label.textContent = option.label;
        item.append(mark, label);
        menu.append(item);
    }
    container.insertBefore(button, before);
    container.insertBefore(menu, before);

    function sync() {
        const dark = resolvedTheme() === "dark";
        sun.classList.toggle("hidden", dark);
        moon.classList.toggle("hidden", !dark);
        for (const item of menu.querySelectorAll("[data-theme-choice]")) {
            item.setAttribute("aria-checked", String(item.dataset.themeChoice === current));
        }
    }

    mountMenu(button, menu, {
        onOpen: sync,
        onSelect(item) {
            setThemeChoice(item.dataset.themeChoice);
            sync();
        },
    });
    window.matchMedia(DARK_QUERY).addEventListener("change", sync);
    document.addEventListener("lab:theme-chosen", sync);
    applyTheme();
    sync();
    return button;
}
