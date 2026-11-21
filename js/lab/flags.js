// Preview flags (assessment plan, section 2). Each feature of the plan has a named flag. The flags
// and their defaults are PREVIEW_FLAGS in js/lab/config-workflow.js: true is on for everyone, false
// is off for everyone, and that table is the one place where a feature is switched on or off for
// all visits. A single visit can change flags for itself with the address: a name switches that
// flag on, a name with a hyphen-minus in front of it switches it off.
//   index.html?preview=excel-export        a flag that is off by default, on for this visit
//   index.html?preview=-import             a flag that is on by default, off for this visit
//   index.html?preview=-export,-excel-import
//
// The address is read once, when this module is first run, and the answer is kept here. That is
// before the page opens anything: opening a dataset, a file, an exercise set or an exercise, and
// closing a set, all rewrite the address and drop the parameter (js/index.js, set-actions.js,
// exercise-panel.js), so a flag read later would switch itself off part-way through a visit. Only
// Open from URL keeps it. js/lab/engine-guard.js runs earlier and leaves the parameter alone.
// Share links and evidence links are built without the query string, so a flag never travels
// in one.
//
// Rules: names are separated by commas and may be given in several preview= parameters; spaces
// round a part are ignored ("- import" is no name); a name that is not in PREVIEW_FLAGS is ignored,
// with or without the minus, and letter case counts ("Import" and "-Import" are not "import"). A
// name given both ways in one address is off, whatever the order or the parameter it is in. A flag
// listed in PREVIEW_FLAG_NEEDS is off unless the flag it needs is on too, however long the chain,
// so "-import" also switches off "excel-import". Nothing here throws, writes storage or touches the
// address.
//
//   flagOn(name) -> boolean     is this flag on for this visit
//   flags() -> {name: boolean}  every flag, for tests
//   readFlags(search, defaults?, needs?) -> {name: boolean}   the rule itself, also run in Node

import { PREVIEW_FLAGS, PREVIEW_FLAG_NEEDS, PREVIEW_PARAM } from "./config-workflow.js";

// readFlags works out the flags from a query string: the defaults, then the names asked for on,
// then the names asked for off (so that off wins), then the needs.
export function readFlags(search, defaults = PREVIEW_FLAGS, needs = PREVIEW_FLAG_NEEDS) {
    const on = {};
    for (const name of Object.keys(defaults)) {
        on[name] = defaults[name] === true;
    }
    let asked = [];
    try {
        asked = new URLSearchParams(String(search ?? "")).getAll(PREVIEW_PARAM);
    } catch {
        asked = [];
    }
    const switchedOff = [];
    for (const value of asked) {
        for (const part of value.split(",")) {
            const name = part.trim();
            if (name.startsWith("-")) {
                switchedOff.push(name.slice(1));
            } else if (Object.hasOwn(on, name)) {
                on[name] = true;
            }
        }
    }
    for (const name of switchedOff) {
        if (Object.hasOwn(on, name)) {
            on[name] = false;
        }
    }
    // a flag is off without the one it needs; again until nothing changes, so that a chain of
    // needs comes out the same in whatever order the table lists it
    let changed = true;
    while (changed) {
        changed = false;
        for (const [name, needed] of Object.entries(needs)) {
            if (on[name] === true && on[needed] !== true) {
                on[name] = false;
                changed = true;
            }
        }
    }
    return on;
}

// the address as it was when the page loaded (none in Node, where the tests run the rule itself)
function searchAtLoad() {
    try {
        return typeof location === "object" && location ? location.search : "";
    } catch {
        return "";
    }
}

// read once, then kept here
const state = Object.freeze(readFlags(searchAtLoad()));

// flagOn says whether a flag is on for this visit.
export function flagOn(name) {
    return Object.hasOwn(state, name) && state[name];
}

// flags is a copy of every flag's state.
export function flags() {
    return { ...state };
}
