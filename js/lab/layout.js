// The pane sizes of the app shell (UI plan, section 4): the sidebar's width (220 to 420 px, or
// hidden) and the editor pane's share of the height: the toolbar and the editor together take
// 40 percent of the room under the exercise prompt, the editor at least 120 px and the result at
// least 96 under its summary line (a Check's verdict pushes the rows down instead). Both
// splitters are focusable separators (the WAI-ARIA window splitter pattern): drag them, or use the
// arrow keys (16 px a step), Home and End; Enter, or a double click, hides or shows the sidebar.
// The sizes are kept in localStorage under LAYOUT_STORAGE_KEY ({v: 1, sidebar, collapsed,
// editor}, editor being the share) and survive a reload; a value that does not make sense is
// ignored.
//
// mountLayout({app, sidebar, sidebarSplitter, sidebarButton, sidebarClose, main, viewEditor,
//              viewResult, editor, prompt, toolbar, editorPane, editorSplitter, resultsPane,
//              result, feedback})
//   -> {toggleSidebar(), showSidebar(), closeDrawer(), showView(view), state()}
//
// The sizes go into custom properties that css/shell.css reads: --sidebar-width on the app, and
// --editor-height (px) and --prompt-max (the exercise prompt's cap) on the main area, worked out
// whenever the main area, what sits above the editor or what the results pane holds besides the
// result and a verdict changes size (the window, the exercise prompt opening or closing, the
// summary wrapping). The room is measured on the main area itself, not on the panes, so a window
// that shrinks in one step is measured right.
//
// The breakpoints (UI plan, section 6; css/shell.css draws them). Under 1100 px (DRAWER_QUERY) the
// sidebar is a drawer over the page: the popover attribute (auto) on #sidebar, opened by the top
// bar's Sidebar button (sidebarButton, its invoker), so the browser closes it on Escape and on a
// press outside, and the focus goes back to the button; it closes too when the focus arrives
// anywhere else but on its button (the student tabbed past its end or Shift+Tabbed past its
// button, or put a name or a past query in the editor), and its Close button (sidebarClose)
// closes it. It never opens by itself (a set that opens leaves it shut), and the wide window's
// choice to hide the sidebar is kept for later. Under 700 px, and on a touch screen less than
// 500 px tall (PHONE_QUERY: a phone held sideways), the query and its result are two views, one
// at a time: data-view on the main area ("editor" or "result"), switched by the two buttons
// viewEditor and viewResult (aria-current on the shown one). A run shows the result
// (lab:run-finished; js/index.js calls showView("result") for a Check's verdict and for a Run that
// answers without running); the editor shows itself whenever something puts text or the focus in
// it (its "input", "replace" and "reveal" events: a sample, a History entry, an inserted name, an
// exercise's draft, the skip link). The focus, when it was in the view that goes, goes to the
// button of the one that comes. The splitters are not shown there, and the drawer has none.

import {
    DRAWER_QUERY,
    EDITOR_MIN_HEIGHT,
    EDITOR_SHARE,
    LAYOUT_STORAGE_KEY,
    PHONE_QUERY,
    PROMPT_MIN_HEIGHT,
    PROMPT_SHARE,
    RESULTS_MIN_HEIGHT,
    SIDEBAR_HIDE_BELOW,
    SIDEBAR_WIDTH,
    SPLITTER_STEP,
    editorHeightText,
    sidebarWidthText,
} from "./config.js";

function readStored() {
    try {
        const data = JSON.parse(localStorage.getItem(LAYOUT_STORAGE_KEY));
        return data && typeof data === "object" && data.v === 1 ? data : null;
    } catch {
        return null;
    }
}

const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

export function mountLayout({
    app,
    sidebar,
    sidebarSplitter,
    sidebarButton,
    sidebarClose,
    main,
    viewEditor,
    viewResult,
    editor,
    prompt,
    toolbar,
    editorPane,
    editorSplitter,
    resultsPane,
    result,
    feedback,
}) {
    const stored = readStored();
    const width = Number(stored?.sidebar);
    const share = Number(stored?.editor);
    const state = {
        v: 1,
        sidebar: Number.isFinite(width) && width >= SIDEBAR_WIDTH.min && width <= SIDEBAR_WIDTH.max ? Math.round(width) : SIDEBAR_WIDTH.initial,
        collapsed: stored?.collapsed === true,
        editor: Number.isFinite(share) && share > 0.05 && share < 0.95 ? share : EDITOR_SHARE,
    };
    const drawer = window.matchMedia(DRAWER_QUERY);
    const phone = window.matchMedia(PHONE_QUERY);

    function save() {
        try {
            localStorage.setItem(LAYOUT_STORAGE_KEY, JSON.stringify(state));
        } catch {
            // storage unusable: the sizes hold for this page only
        }
    }

    // ---- the sidebar ---------------------------------------------------------------------

    function applySidebar() {
        app.style.setProperty("--sidebar-width", `${state.sidebar}px`);
        app.classList.toggle("app--sidebar-collapsed", state.collapsed);
        // a hidden sidebar's controls leave the Tab order (not as a drawer: the student opens it)
        sidebar.inert = state.collapsed && !drawer.matches;
        const now = state.collapsed ? 0 : state.sidebar;
        sidebarSplitter.setAttribute("aria-valuemin", "0");
        sidebarSplitter.setAttribute("aria-valuemax", String(SIDEBAR_WIDTH.max));
        sidebarSplitter.setAttribute("aria-valuenow", String(now));
        sidebarSplitter.setAttribute("aria-valuetext", sidebarWidthText(now));
    }

    function setSidebar(width, { collapsed = false } = {}) {
        state.collapsed = collapsed;
        if (!collapsed) {
            state.sidebar = Math.round(clamp(width, SIDEBAR_WIDTH.min, SIDEBAR_WIDTH.max));
        }
        applySidebar();
        // the main area changed width, and with it perhaps the toolbar's rows
        applyEditor();
    }

    function toggleSidebar() {
        setSidebar(state.sidebar, { collapsed: !state.collapsed });
        save();
    }

    // a hidden sidebar comes back (an exercise set opened: its list lives there)
    function showSidebar() {
        // (a drawer is not opened by itself; the choice made on a wide window is kept for it)
        if (state.collapsed && !drawer.matches) {
            setSidebar(state.sidebar, { collapsed: false });
            save();
        }
    }

    sidebarSplitter.addEventListener("keydown", (event) => {
        const keys = {
            ArrowLeft: () => !state.collapsed && setSidebar(state.sidebar - SPLITTER_STEP),
            ArrowRight: () => setSidebar(state.collapsed ? SIDEBAR_WIDTH.min : state.sidebar + SPLITTER_STEP),
            Home: () => setSidebar(SIDEBAR_WIDTH.min),
            End: () => setSidebar(SIDEBAR_WIDTH.max),
            Enter: () => setSidebar(state.sidebar, { collapsed: !state.collapsed }),
        };
        if (keys[event.key] && !event.altKey && !event.ctrlKey && !event.metaKey) {
            event.preventDefault();
            keys[event.key]();
            save();
        }
    });
    sidebarSplitter.addEventListener("dblclick", toggleSidebar);
    drag(sidebarSplitter, (start) => {
        const from = state.collapsed ? 0 : sidebar.getBoundingClientRect().width;
        return (event) => {
            const width = from + event.clientX - start.clientX;
            setSidebar(width, { collapsed: width < SIDEBAR_HIDE_BELOW });
        };
    });

    // ---- the editor's height ---------------------------------------------------------------

    // The room the editor pane (its toolbar and the editor) and the result share: the main area
    // under the exercise prompt. Measured on elements whose size does not depend on the editor's,
    // so it is right at once, however the window changed.
    // The least the results pane needs: its summary line (and a storage notice, the scroll note,
    // when they show) and RESULTS_MIN_HEIGHT of the result itself. A Check's verdict is left out:
    // the exercise prompt would give way to it and be cut on an ordinary laptop screen, so the
    // verdict pushes the rows down instead, and the pane scrolls to them.
    function resultsNeed() {
        let fixed = 0;
        for (const child of resultsPane.children) {
            // (a live region for screen readers, or a popover in the top layer, takes no room)
            if (child === result || child === feedback || child.hidden || child.classList.contains("visually-hidden") || child.hasAttribute("popover")) {
                continue;
            }
            const style = getComputedStyle(child);
            fixed += child.offsetHeight + parseFloat(style.marginTop) + parseFloat(style.marginBottom);
        }
        return fixed + RESULTS_MIN_HEIGHT;
    }

    function measure() {
        const room = main.clientHeight - (prompt.hidden ? 0 : prompt.offsetHeight);
        const bar = toolbar.offsetHeight;
        const splitter = editorSplitter.offsetHeight;
        // the editor's own height: at least EDITOR_MIN_HEIGHT, and the results pane keeps its need
        const min = EDITOR_MIN_HEIGHT;
        const max = Math.max(min, room - bar - splitter - resultsNeed());
        return { room, bar, min, max };
    }

    // The exercise prompt takes at most 40 percent of the window, and less on a short one: the
    // toolbar, the smallest editor and the smallest result keep their room under it (it scrolls
    // inside). Set as --prompt-max, read by css/exercises.css.
    function capPrompt() {
        const free = main.clientHeight - toolbar.offsetHeight - editorSplitter.offsetHeight - EDITOR_MIN_HEIGHT - resultsNeed();
        const cap = Math.max(PROMPT_MIN_HEIGHT, Math.min(PROMPT_SHARE * window.innerHeight, free));
        main.style.setProperty("--prompt-max", `${Math.floor(cap)}px`);
    }

    function applyEditor() {
        if (phone.matches) {
            main.style.removeProperty("--editor-height");
            main.style.removeProperty("--prompt-max");
            return;
        }
        capPrompt();
        const { room, bar, min, max } = measure();
        if (room <= 0) {
            return;
        }
        const height = Math.round(clamp(state.editor * room - bar, min, max));
        main.style.setProperty("--editor-height", `${height}px`);
        editorSplitter.setAttribute("aria-valuemin", String(min));
        editorSplitter.setAttribute("aria-valuemax", String(Math.round(max)));
        editorSplitter.setAttribute("aria-valuenow", String(height));
        editorSplitter.setAttribute("aria-valuetext", editorHeightText(height));
    }

    // setEditor gives the editor this height (within its limits) and keeps it as a share
    function setEditor(height) {
        const { room, bar, min, max } = measure();
        if (room <= 0) {
            return;
        }
        state.editor = (clamp(height, min, max) + bar) / room;
        applyEditor();
    }

    editorSplitter.addEventListener("keydown", (event) => {
        const now = editorPane.getBoundingClientRect().height;
        const keys = {
            ArrowUp: () => setEditor(now - SPLITTER_STEP),
            ArrowDown: () => setEditor(now + SPLITTER_STEP),
            Home: () => setEditor(EDITOR_MIN_HEIGHT),
            End: () => setEditor(Infinity),
        };
        if (keys[event.key] && !event.altKey && !event.ctrlKey && !event.metaKey) {
            event.preventDefault();
            keys[event.key]();
            save();
        }
    });
    drag(editorSplitter, (start) => {
        const from = editorPane.getBoundingClientRect().height;
        return (event) => setEditor(from + event.clientY - start.clientY);
    });

    // drag(handle, begin): while the primary button is held on the handle, begin(startEvent)'s
    // returned function gets every move; the sizes are saved when it is let go
    function drag(handle, begin) {
        handle.addEventListener("pointerdown", (event) => {
            if (event.button !== 0 || phone.matches) {
                return;
            }
            event.preventDefault();
            handle.focus({ preventScroll: true });
            handle.setPointerCapture(event.pointerId);
            app.classList.add("app--resizing");
            const move = begin(event);
            const end = () => {
                handle.removeEventListener("pointermove", move);
                handle.removeEventListener("pointerup", end);
                handle.removeEventListener("pointercancel", end);
                app.classList.remove("app--resizing");
                save();
            };
            handle.addEventListener("pointermove", move);
            handle.addEventListener("pointerup", end);
            handle.addEventListener("pointercancel", end);
        });
    }

    // whatever changes the main area's size, what sits above the editor, or what the results pane
    // holds besides the result and a verdict (the summary wrapping, a notice)
    if (typeof ResizeObserver === "function") {
        const observer = new ResizeObserver(() => applyEditor());
        for (const element of [main, prompt, toolbar, ...[...resultsPane.children].filter((child) => child !== result && child !== feedback)]) {
            observer.observe(element);
        }
    } else {
        window.addEventListener("resize", applyEditor);
    }
    phone.addEventListener("change", () => {
        applySidebar();
        applyEditor();
    });

    // ---- the drawer (under 1100 px) ----------------------------------------------------------

    // a browser without the popover attribute keeps the sidebar where it is on a wide window
    const canDrawer = typeof sidebar.showPopover === "function";
    const drawerOpen = () => sidebar.hasAttribute("popover") && sidebar.matches(":popover-open");

    function applyDrawer() {
        if (drawer.matches && canDrawer) {
            if (sidebar.getAttribute("popover") !== "auto") {
                sidebar.setAttribute("popover", "auto");
            }
            sidebarButton.popoverTargetElement = sidebar;
        } else {
            if (sidebar.hasAttribute("popover")) {
                if (drawerOpen()) {
                    sidebar.hidePopover();
                }
                sidebar.removeAttribute("popover");
            }
            sidebarButton.popoverTargetElement = null;
        }
        sidebarButton.setAttribute("aria-expanded", "false");
        applySidebar();
    }

    // closeDrawer closes the drawer, if it is one and open; the focus, if it was inside, goes back
    // to the Sidebar button
    function closeDrawer() {
        if (!drawerOpen()) {
            return;
        }
        const inside = sidebar.contains(document.activeElement);
        sidebar.hidePopover();
        if (inside && (!document.activeElement || document.activeElement === document.body)) {
            sidebarButton.focus();
        }
    }

    // beforetoggle is synchronous: aria-expanded is right before the drawer shows or goes
    sidebar.addEventListener("beforetoggle", (event) => {
        if (sidebar.hasAttribute("popover")) {
            sidebarButton.setAttribute("aria-expanded", String(event.newState === "open"));
        }
    });
    // opened: the focus goes in, on the tab that shows; closed with the focus nowhere (a press on
    // the page around it, which the drawer's backdrop takes): back to the Sidebar button
    sidebar.addEventListener("toggle", (event) => {
        if (event.newState === "open" && drawerOpen() && !sidebar.contains(document.activeElement)) {
            (sidebar.querySelector('[role="tab"][aria-selected="true"]') ?? sidebar).focus();
        } else if (event.newState === "closed" && (!document.activeElement || document.activeElement === document.body) && sidebarButton.getClientRects().length) {
            sidebarButton.focus();
        }
    });
    // the focus arriving anywhere but in it or on its button (Tab past its end, Shift+Tab past its
    // button, a name put into the editor) closes it, so the focus is never under it
    document.addEventListener("focusin", (event) => {
        if (drawerOpen() && !sidebar.contains(event.target) && event.target !== sidebarButton) {
            sidebar.hidePopover();
        }
    });
    sidebarClose.addEventListener("click", closeDrawer);
    drawer.addEventListener("change", applyDrawer);

    // ---- the two views (under 700 px) ------------------------------------------------------

    function showView(view) {
        if (main.dataset.view === view) {
            return;
        }
        const leaving = view === "result" ? [prompt, editorPane] : [resultsPane];
        const lost = phone.matches && leaving.some((part) => part.contains(document.activeElement));
        main.dataset.view = view;
        for (const [button, shows] of [
            [viewEditor, "editor"],
            [viewResult, "result"],
        ]) {
            if (shows === view) {
                button.setAttribute("aria-current", "true");
            } else {
                button.removeAttribute("aria-current");
            }
        }
        if (lost) {
            (view === "result" ? viewResult : viewEditor).focus();
        }
    }

    viewEditor.addEventListener("click", () => showView("editor"));
    viewResult.addEventListener("click", () => showView("result"));
    document.addEventListener("lab:run-finished", () => showView("result"));
    for (const type of ["input", "replace", "reveal"]) {
        editor.addEventListener(type, () => showView("editor"));
    }

    applyDrawer();
    applyEditor();

    return {
        toggleSidebar,
        showSidebar,
        closeDrawer,
        showView,
        state: () => ({ ...state }),
    };
}
