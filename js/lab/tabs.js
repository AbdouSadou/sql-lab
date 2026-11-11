// The sidebar's tabs: Schema, Exercises and History (the WAI-ARIA tabs pattern, automatic
// activation). A click, or ArrowLeft, ArrowRight, Home and End on a tab, selects it and shows its
// panel; only the selected tab is a Tab stop.
//
// mountTabs(tablist, {onShow}) -> {show(id), current()}
//   tablist  an element with role="tablist" holding the tabs (role="tab", aria-controls = panel id)
//   onShow   (tabId) => void, after a tab is shown (the History tab renders its list then)

export function mountTabs(tablist, { onShow = () => {} } = {}) {
    const tabs = [...tablist.querySelectorAll('[role="tab"]')];
    const panelOf = (tab) => document.getElementById(tab.getAttribute("aria-controls"));
    let selected = tabs.find((tab) => tab.getAttribute("aria-selected") === "true") ?? tabs[0];

    function show(tab, { focus = false } = {}) {
        for (const other of tabs) {
            const on = other === tab;
            other.setAttribute("aria-selected", String(on));
            other.tabIndex = on ? 0 : -1;
            panelOf(other).hidden = !on;
        }
        selected = tab;
        if (focus) {
            tab.focus();
        }
        onShow(tab.id);
    }

    tablist.addEventListener("click", (event) => {
        const tab = event.target.closest('[role="tab"]');
        if (tab && tabs.includes(tab)) {
            show(tab);
        }
    });

    tablist.addEventListener("keydown", (event) => {
        const at = tabs.indexOf(document.activeElement);
        if (at === -1 || event.altKey || event.ctrlKey || event.metaKey) {
            return;
        }
        const moves = { ArrowRight: at + 1, ArrowLeft: at - 1, Home: 0, End: tabs.length - 1 };
        if (!(event.key in moves)) {
            return;
        }
        event.preventDefault();
        show(tabs[(moves[event.key] + tabs.length) % tabs.length], { focus: true });
    });

    show(selected);
    return {
        show(id) {
            const tab = tabs.find((candidate) => candidate.id === id);
            if (tab && tab !== selected) {
                show(tab);
            }
        },
        current: () => selected.id,
    };
}
