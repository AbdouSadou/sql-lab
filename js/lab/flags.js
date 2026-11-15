// Preview flags (assessment plan, section 2). Each new feature of the plan sits behind a named
// flag. The flags and their defaults are PREVIEW_FLAGS in js/lab/config-workflow.js: all off,
// until the owner sets one to true there. A visit can turn flags on for itself with the address:
// index.html?preview=import,export
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
// round a name are ignored; a name that is not in PREVIEW_FLAGS is ignored, and letter case
// counts ("Import" is not "import"); a flag listed in PREVIEW_FLAG_NEEDS is off unless the flag it
// needs is on too, however long the chain. Nothing here throws, writes storage or touches the
// address.
//
//   flagOn(name) -> boolean     is this flag on for this visit
//   flags() -> {name: boolean}  every flag, for tests
//   readFlags(search, defaults?, needs?) -> {name: boolean}   the rule itself, also run in Node

import { PREVIEW_FLAGS, PREVIEW_FLAG_NEEDS, PREVIEW_PARAM } from "./config-workflow.js";

// readFlags works out the flags from a query string: the defaults, plus the names asked for.
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
    for (const value of asked) {
        for (const part of value.split(",")) {
            const name = part.trim();
            if (Object.hasOwn(on, name)) {
                on[name] = true;
            }
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
