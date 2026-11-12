// F2/F7 on screen (UI plan, section 5, "Exercise mode"; docs/design/mockup/exercise-correct.html
// and exercise-wrong.html): the Exercises tab of the sidebar (the set picker, the progress line,
// the list of exercises, Reset progress), the prompt panel above the editor (the exercise's number,
// title and prompt, a hint button that counts the hints, Previous and Next), Check answer beside
// Run, and the feedback banner at the top of the results pane: "Correct. 12 rows match." with a
// tick that draws itself and Next exercise, or "Not quite." with the checker's message and, for a
// row that differs, Expected and Yours side by side with the differing cells outlined.
//
// Static markup lives in index.html (#exercise-panel and its parts, #exercise-feedback);
// this module fills it, with createElement and textContent only: titles, prompts, hints and
// ids come from an exercise file and are untrusted. model_query is never read here except to
// hand the exercise object to the checker (js/lab/checker.js); it is not copied into the DOM,
// an attribute, a message or the share link.
//
// mountExercises({pickerSlot, ui, execute, isLoading, openSet, closeSet, showTab, showIdle,
//                 modeChanged, say}) -> controller
//   pickerSlot where the set picker (a menu button and its menu) goes, in the Exercises tab
//   ui         index.js's element handles (the editor, the toolbar)
//   showIdle   () the results pane's "no result yet" (js/lab/results.js showEmpty): what the
//              last run showed belonged to another exercise or set
//   modeChanged () exercise mode began or ended: the results pane's "no result yet", if it shows,
//              is drawn again (it offers sample queries only outside exercise mode)
//   execute    index.js's execute(sql): the visible run. Check calls it with exactly the SQL
//              Run would use (ui.editor.query), then calls the checker
//   isLoading  () -> true while a database is loading (Check refuses, as Run does)
//   openSet    (set) the student picked a set in the picker
//   closeSet   () the student picked "None"
//   showTab    () bring the Exercises tab forward (a set opened)
//   say        (text) say a verdict in the results pane's live region (js/lab/results.js say):
//              the banner itself is not live, so a verdict is said once, in words, and its
//              tables are not read out
// The controller:
//   editorSql({set, exerciseId}, linkSql) -> string   what the editor holds when a set opens
//                                                    over a freshly loaded database: the
//                                                    link's SQL, else the exercise's draft,
//                                                    else nothing
//   open(set, exerciseId)   open a set over the database that is already open (the editor
//                           gets the draft of the exercise, or nothing)
//   close()                 leave exercise mode, keeping the database
//   syncPicker()            show the open set in the picker again (a pick that failed)
//   isOpen()                true while a set is open (the results pane offers no samples then)
//
// The panel follows the page through two events on the document:
//   lab:database-loaded  detail.exercise = {set, exerciseId} opens the panel; without it the
//                        panel closes (another dataset, an upload, a URL, back/forward)
//   lab:run-finished     the full editor text is saved as the exercise's draft
// Every change of set or exercise goes into the share context, so copy link carries it.

import {
    CHECK_BUTTON_TEXT,
    CHECK_BUTTON_TITLE,
    CHECK_COPY_NOTE,
    CHECK_DIFFERS_TEXT,
    CHECK_EMPTY_HEADLINE,
    CHECK_EMPTY_MESSAGE,
    CHECK_EXPECTED_LABEL,
    CHECK_FAIL_HEADLINE,
    CHECK_GOT_LABEL,
    CHECK_PASS_HEADLINE,
    CHECK_PASS_MESSAGE,
    CHECK_ROW_HEADER,
    CHECK_SQL_ERROR_BELOW,
    CHECK_UNAVAILABLE_HEADLINE,
    EXERCISE_FIRST_TEXT,
    EXERCISE_HINTS_LABEL,
    EXERCISE_LAST_TEXT,
    EXERCISE_NAV_LABEL,
    EXERCISE_NEXT_TEXT,
    EXERCISE_PARAM,
    EXERCISE_PREVIOUS_TEXT,
    EXERCISE_RESET_TEXT,
    EXERCISE_RESET_TITLE,
    NEXT_EXERCISE_TEXT,
    SET_PARAM,
    SET_PICKER_LABEL,
    SET_PICKER_MENU_LABEL,
    SET_PICKER_NONE,
    VERDICT_DIFF_NOTE,
    VERDICT_SCROLL_NOTE,
    checkPassMessage,
    exerciseAllCompleteText,
    exerciseAnnouncement,
    exerciseButtonLabel,
    exerciseHintLabel,
    exerciseHintText,
    exerciseListLabel,
    exerciseProgressText,
    exerciseResetConfirm,
    exerciseTargetText,
    setPickerBrokenLabel,
    verdictHiddenDiffNote,
} from "./config.js";
import { createChecker } from "./checker.js";
import { listSets } from "./exercises.js";
import { icon } from "./icons.js";
import { MOD_KEY } from "./keys.js";
import { mountMenu } from "./menu.js";
import { getDraft, isPassed, markPassed, passedCount, resetSet, saveDraft } from "./progress.js";
import { engineMessage } from "./runner.js";
import { setShareContext } from "./share.js";

// chooseExercise picks the exercise a set opens on: the one the link named, else the first
// not yet passed, else the first.
export function chooseExercise(set, requestedId) {
    const named = requestedId ? set.exercises.find((e) => e.id === requestedId) : undefined;
    return named ?? set.exercises.find((e) => !isPassed(set.id, e.id)) ?? set.exercises[0];
}

const SVG_NS = "http://www.w3.org/2000/svg";

// drawnTick is the passed mark of the banner: the sprite's circle-check, copied inline so that its
// circle and its tick can be stroked in one after the other (css/exercises.css, 300 ms; nothing
// moves when the student asks for less motion). Each shape's length is 1 (pathLength), so one dash
// pattern fits both. The sprite's own <use> cannot be drawn part by part.
function drawnTick() {
    const symbol = document.getElementById("icon-circle-check");
    if (!symbol || !symbol.children.length) {
        return icon("circle-check");
    }
    const svg = document.createElementNS(SVG_NS, "svg");
    svg.setAttribute("class", "icon verdict-tick");
    svg.setAttribute("viewBox", symbol.getAttribute("viewBox") || "0 0 24 24");
    svg.setAttribute("aria-hidden", "true");
    svg.setAttribute("focusable", "false");
    for (const shape of symbol.children) {
        const copy = shape.cloneNode(false);
        copy.setAttribute("pathLength", "1");
        svg.append(copy);
    }
    return svg;
}

// a cell the checker shows that reads as a number: right-aligned, as in the result table
const NUMBER_TEXT = /^[-+]?(\d+(\.\d*)?|\.\d+)([eE][-+]?\d+)?$/;
// the checker writes NULL as this text (js/lab/checker.js displayValue); it says nothing about
// whether a column holds numbers
const NULL_DISPLAY = "NULL";

// numericColumns says, for each column of rows (arrays of the checker's display strings), whether
// every value in it that is not NULL reads as a number (and at least one does).
function numericColumns(width, rows) {
    return Array.from({ length: width }, (_, column) => {
        let seen = false;
        for (const row of rows) {
            const cell = row[column];
            if (cell === undefined || cell === NULL_DISPLAY) {
                continue;
            }
            if (!NUMBER_TEXT.test(cell)) {
                return false;
            }
            seen = true;
        }
        return seen;
    });
}

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

export function mountExercises({
    pickerSlot,
    ui,
    execute,
    isLoading,
    openSet,
    closeSet,
    showTab,
    showIdle = () => {},
    modeChanged = () => {},
    say = () => {},
}) {
    const $ = (id) => document.getElementById(id);
    const els = {
        panel: $("exercise-panel"),
        title: $("exercise-set-title"),
        progress: $("exercise-progress"),
        progressBlock: document.querySelector(".exercise-progress-block"),
        progressFill: document.querySelector(".exercise-progress-fill"),
        empty: document.querySelector(".exercise-empty"),
        toolbar: $("editor-toolbar"),
        reset: $("exercise-reset"),
        list: $("exercise-list"),
        prompt: $("exercise-prompt"),
        hintButton: $("exercise-hint-button"),
        nav: $("exercise-nav"),
        previous: $("exercise-previous"),
        next: $("exercise-next"),
        hints: $("exercise-hints"),
        announce: $("exercise-announce"),
        feedback: $("exercise-feedback"),
    };
    const checker = createChecker();

    let set = null; // the open set, or null
    let current = null; // the active exercise of it
    let rovingId = null; // the exercise whose button is the list's one Tab stop
    let generation = 0; // changes whenever the set, the exercise or the database changes
    let checking = -1; // the generation a check is running for, or -1
    let checkButton = null;
    let listed = []; // what listSets() found
    const hintsShown = new Map(); // "<set>/<exercise>" -> hints revealed, for the page's lifetime

    // ---- the set picker --------------------------------------------------------------------
    // A menu button, as drawn in the mockup: "None", then each set by its title; a set that
    // failed validation, or a file whose name cannot be an id, is a disabled entry naming its file,
    // with the problem under it; a set opened from an address but not listed is shown all the same.

    const picker = el("button", "button set-picker");
    picker.type = "button";
    picker.id = "exercise-set-picker";
    const pickerLabel = el("span", "set-picker-label");
    picker.append(pickerLabel, icon("chevron-down"));
    const menu = el("div", "menu menu--wide");
    menu.id = "exercise-set-menu";
    menu.setAttribute("role", "menu");
    menu.setAttribute("aria-label", SET_PICKER_MENU_LABEL);
    pickerSlot.append(picker, menu);

    function pickerItem(value, text, { disabled = false, problem = "" } = {}) {
        const item = el("button", "menu-item menu-item--two-line");
        item.type = "button";
        item.tabIndex = -1;
        item.setAttribute("role", "menuitemradio");
        item.dataset.setId = value;
        const tick = icon("check");
        tick.classList.add("menu-check");
        const text_ = el("span", "menu-item-text");
        text_.append(el("span", "menu-item-label", text));
        if (problem) {
            text_.append(el("span", "menu-item-description", problem));
            item.title = problem;
        }
        item.append(tick, text_);
        if (disabled) {
            item.setAttribute("aria-disabled", "true");
        }
        return item;
    }

    // the set last asked for while its database is still loading ("" for None), or null when
    // what is open is what was asked for. The picker shows it, and choosing it again does
    // nothing; choosing None (or another set) while it loads cancels that load, as with the old
    // select, whose value was the student's last choice.
    let asked = null;
    const choice = () => asked ?? (set ? set.id : "");

    function renderPicker() {
        const chosen = choice();
        const items = [pickerItem("", SET_PICKER_NONE)];
        for (const entry of listed) {
            items.push(
                entry.ok
                    ? pickerItem(entry.id, entry.set.title)
                    : pickerItem(entry.id, setPickerBrokenLabel(entry.id), { disabled: true, problem: entry.problem })
            );
        }
        // a set opened from an address needs no listing: it is shown all the same
        if (set && !listed.some((e) => e.ok && e.id === set.id)) {
            items.push(pickerItem(set.id, set.title));
        }
        for (const item of items) {
            item.setAttribute("aria-checked", String(item.dataset.setId === chosen));
        }
        if (!menu.matches(":popover-open")) {
            menu.replaceChildren(...items);
        } else {
            for (const item of menu.querySelectorAll("[data-set-id]")) {
                item.setAttribute("aria-checked", String(item.dataset.setId === chosen));
            }
        }
        const shown = chosen === "" ? null : (listed.find((e) => e.ok && e.id === chosen)?.set ?? set);
        const label = shown ? shown.title : SET_PICKER_NONE;
        pickerLabel.textContent = label;
        picker.setAttribute("aria-label", `${SET_PICKER_LABEL}: ${label}`);
        picker.disabled = items.length <= 1;
    }

    mountMenu(picker, menu, {
        onSelect(item) {
            const value = item.dataset.setId;
            if (value === undefined || value === choice()) {
                return;
            }
            if (value === "") {
                asked = set ? "" : null;
                closeSet();
                return;
            }
            const entry = listed.find((e) => e.ok && e.id === value);
            const chosen = entry ? entry.set : set && set.id === value ? set : null;
            if (chosen) {
                asked = chosen.id;
                renderPicker();
                openSet(chosen);
            } else {
                renderPicker();
            }
        },
    });

    // listSets must not delay opening the database, so it is not awaited by anything
    renderPicker();
    listSets()
        .then((entries) => {
            listed = entries;
            renderPicker();
        })
        .catch(() => {});

    // ---- the list of exercises -------------------------------------------------------------

    function buildList() {
        els.list.setAttribute("aria-label", exerciseListLabel(set.title));
        els.list.replaceChildren(
            ...set.exercises.map((exercise) => {
                const item = el("li", "exercise-list-item");
                const button = el("button", "exercise-item");
                button.type = "button";
                button.dataset.exerciseId = exercise.id;
                button.title = exercise.title;
                // the mark (a ticked circle or an empty one), the number and the title; the
                // button's name says all three in words (refreshList)
                const mark = el("span", "exercise-item-mark");
                mark.setAttribute("aria-hidden", "true");
                const passedIcon = icon("circle-check");
                passedIcon.classList.add("exercise-mark-passed");
                const openIcon = icon("circle");
                openIcon.classList.add("exercise-mark-open");
                mark.append(passedIcon, openIcon);
                // the number is drawn by css/exercises.css (a counter): the name says it as
                // "Exercise N of M", and the visible text (the title) stays inside the name
                const number = el("span", "exercise-item-number");
                number.setAttribute("aria-hidden", "true");
                button.append(mark, number, el("span", "exercise-item-title", exercise.title));
                item.append(button);
                return item;
            })
        );
        refreshList();
    }

    function itemButtons() {
        return [...els.list.querySelectorAll("button.exercise-item")];
    }

    // refreshList updates the buttons in place (a rebuilt button would lose the keyboard focus)
    function refreshList() {
        const total = set.exercises.length;
        itemButtons().forEach((button, index) => {
            const exercise = set.exercises[index];
            const passed = isPassed(set.id, exercise.id);
            const active = exercise.id === current.id;
            button.querySelector(".exercise-mark-passed").classList.toggle("hidden", !passed);
            button.querySelector(".exercise-mark-open").classList.toggle("hidden", passed);
            button.setAttribute("aria-label", exerciseButtonLabel(index + 1, total, exercise.title, passed));
            button.classList.toggle("exercise-item--passed", passed);
            if (active) {
                button.setAttribute("aria-current", "true");
            } else {
                button.removeAttribute("aria-current");
            }
            button.tabIndex = exercise.id === rovingId ? 0 : -1;
        });
    }

    function refreshProgress() {
        const passed = passedCount(set.id, set.exercises.map((e) => e.id));
        els.progress.textContent = exerciseProgressText(passed, set.exercises.length);
        els.progressFill.style.width = `${(100 * passed) / set.exercises.length}%`;
    }

    els.list.addEventListener("click", (event) => {
        const button = event.target.closest("button.exercise-item");
        if (button && set) {
            select(button.dataset.exerciseId);
        }
    });
    els.list.addEventListener("focusin", (event) => {
        const button = event.target.closest("button.exercise-item");
        if (button && button.dataset.exerciseId !== rovingId) {
            rovingId = button.dataset.exerciseId;
            refreshList();
        }
    });
    els.list.addEventListener("keydown", (event) => {
        const button = event.target.closest("button.exercise-item");
        if (!button || event.altKey || event.ctrlKey || event.metaKey) {
            return;
        }
        const buttons = itemButtons();
        const at = buttons.indexOf(button);
        const moves = {
            ArrowRight: at + 1,
            ArrowDown: at + 1,
            ArrowLeft: at - 1,
            ArrowUp: at - 1,
            Home: 0,
            End: buttons.length - 1,
        };
        if (event.key in moves) {
            event.preventDefault();
            buttons[Math.max(0, Math.min(buttons.length - 1, moves[event.key]))].focus();
        }
    });

    // ---- prompt and hints ------------------------------------------------------------------

    const hintKey = () => `${set.id}/${current.id}`;

    // A hint is announced as "Hint N: <text>": the prefix is visually hidden (the list marker
    // shows the number to everyone else).
    function hintItem(position, text) {
        const item = el("li", "exercise-hint");
        item.append(el("span", "visually-hidden", `${exerciseHintLabel(position)}: `), document.createTextNode(text));
        return item;
    }

    function renderPrompt() {
        const position = set.exercises.indexOf(current) + 1;
        const heading = el("div", "exercise-heading");
        const title = el("h2", "exercise-title", current.title);
        title.id = "exercise-prompt-title";
        heading.append(title, el("p", "exercise-kicker", `Exercise ${position} of ${set.exercises.length}`));
        els.prompt.replaceChildren(heading, el("p", "exercise-text", current.prompt));
    }

    function renderHints() {
        const shown = hintsShown.get(hintKey()) ?? 0;
        // not live while it is rebuilt: only a hint the student asks for is announced
        els.hints.removeAttribute("aria-live");
        els.hints.replaceChildren(...current.hints.slice(0, shown).map((text, i) => hintItem(i + 1, text)));
        els.hints.hidden = shown === 0;
        requestAnimationFrame(() => els.hints.setAttribute("aria-live", "polite"));
        refreshHintButton();
    }

    // "Show hint (1 of 2)": the hint a press shows, of how many; gone once all are shown
    function refreshHintButton() {
        const shown = hintsShown.get(hintKey()) ?? 0;
        const total = current.hints.length;
        els.hintButton.hidden = shown >= total;
        els.hintButton.textContent = shown < total ? exerciseHintText(shown + 1, total) : "";
    }

    els.hints.setAttribute("aria-label", EXERCISE_HINTS_LABEL);

    els.hintButton.addEventListener("click", () => {
        if (!set) {
            return;
        }
        const shown = hintsShown.get(hintKey()) ?? 0;
        if (shown >= current.hints.length) {
            return;
        }
        const hadFocus = document.activeElement === els.hintButton;
        hintsShown.set(hintKey(), shown + 1);
        const item = hintItem(shown + 1, current.hints[shown]);
        item.tabIndex = -1;
        els.hints.append(item);
        els.hints.hidden = false;
        refreshHintButton();
        // the button goes away with the last hint: keep the keyboard user in the panel
        if (hadFocus && els.hintButton.hidden) {
            item.focus();
        }
        // the hints sit under the buttons, and the panel scrolls when it is capped: bring the new
        // one into view (focus() above already did, for the last)
        item.scrollIntoView?.({ block: "nearest" });
    });

    // ---- Previous and Next -----------------------------------------------------------------
    // The exercise before and after the open one, in the set's order (the list's order). At either
    // end the button stays where it is and keeps the focus, but does nothing (aria-disabled; a
    // disabled button would drop the focus of a student who pressed it to get there). Its title
    // (its description) names where it goes, or says why it goes nowhere. The focus stays on it,
    // as it stays on the list when an exercise is chosen there.

    els.previous.textContent = EXERCISE_PREVIOUS_TEXT;
    els.next.textContent = EXERCISE_NEXT_TEXT;
    els.nav.setAttribute("aria-label", EXERCISE_NAV_LABEL);

    function neighbour(step) {
        return set.exercises[set.exercises.indexOf(current) + step] ?? null;
    }

    function refreshNav() {
        for (const [button, step, endText] of [
            [els.previous, -1, EXERCISE_FIRST_TEXT],
            [els.next, 1, EXERCISE_LAST_TEXT],
        ]) {
            const target = neighbour(step);
            if (target) {
                button.removeAttribute("aria-disabled");
                button.title = exerciseTargetText(set.exercises.indexOf(target) + 1, set.exercises.length, target.title);
            } else {
                button.setAttribute("aria-disabled", "true");
                button.title = endText;
            }
        }
    }

    for (const [button, step] of [
        [els.previous, -1],
        [els.next, 1],
    ]) {
        button.addEventListener("click", () => {
            const target = set && button.getAttribute("aria-disabled") !== "true" ? neighbour(step) : null;
            if (target) {
                select(target.id);
            }
        });
    }

    // ---- the feedback banner ---------------------------------------------------------------
    // At the top of the results pane (UI plan, section 5): a band across the pane with an icon and
    // words, a headline and then a sentence on the same line, and, after a pass, Next exercise at
    // its end. Under the band, for a row that differs, Expected and Yours side by side. Each kind
    // has its own icon and its own words, never colour alone: a tick that draws itself for
    // "Correct.", a cross for "Not quite.", an alert sign for "Not checked." and an "i" for
    // "Nothing to check.". The band is not a live region: say() puts its words in the results
    // pane's, once, without the tables.

    function clearFeedback() {
        els.feedback.replaceChildren();
        els.feedback.hidden = true;
    }

    // verdictMark is the band's icon (each icon() name is written out: tools/build-icons.mjs reads
    // the names from the calls)
    function verdictMark(kind) {
        let mark;
        if (kind === "pass") {
            mark = drawnTick();
        } else if (kind === "fail") {
            mark = icon("circle-x");
        } else if (kind === "warning") {
            mark = icon("circle-alert");
        } else {
            mark = icon("info");
        }
        mark.classList.add("verdict-mark");
        return mark;
    }

    // showVerdict draws the banner and says it. kind: "pass", "fail", "warning" or "info".
    // message: the sentence after the headline (a p.verdict-message), or null; lines: more of the
    // band's text, each on its own line (a p); action: a button at the end of the band; after:
    // what goes under the band; spoken: what is said in place of the sentence, when the sentence
    // points at something that is not said (the error band). What is said: the headline, the
    // sentence and the lines.
    function showVerdict(kind, headline, { message = null, lines = [], action = null, after = [], spoken = null } = {}) {
        const box = el("div", `verdict verdict--${kind}`);
        const band = el("div", "verdict-band");
        const text = el("div", "verdict-text");
        const head = el("p", "verdict-head");
        head.append(el("strong", "verdict-headline", headline));
        // the sentence runs on from the headline ("Not quite. Row 1 is ..."): a space between them
        text.append(head, ...(message ? [" ", message] : []), ...lines);
        band.append(verdictMark(kind), text);
        if (action) {
            band.append(action);
        }
        box.append(band, ...after);
        // A Check from the keyboard while the focus was on the banner (on Next exercise, after a
        // pass, or on a table's scroll box) would leave it on nothing, the old banner gone: it goes
        // to the same button in the new banner, else to the banner itself (its ring then inside it)
        const hadFocus = els.feedback.contains(document.activeElement);
        els.feedback.replaceChildren(box);
        els.feedback.hidden = false;
        if (hadFocus) {
            const again = box.querySelector(".verdict-next");
            if (again) {
                again.focus();
            } else {
                box.tabIndex = -1;
                box.focus();
            }
        }
        // a new verdict where the student had scrolled the pane past the old one: the pane shows it
        // from its top (the banner is the pane's first child; a phone's pane does not scroll)
        const pane = els.feedback.parentElement;
        if (pane && pane.scrollTop > els.feedback.offsetTop) {
            pane.scrollTop = els.feedback.offsetTop;
        }
        say(
            [headline, spoken ?? message?.textContent, ...lines.map((line) => line.textContent)]
                .filter(Boolean)
                .map(sentence)
                .join(" ")
        );
    }

    // sentence ends a part of what is said as a sentence, as it is on screen ("expected 2 columns,
    // got 1" has its full stop drawn there), so that a screen reader pauses between the parts
    function sentence(text) {
        return /[.!?]$/.test(text) ? text : `${text}.`;
    }

    // The Expected and Yours view of a row that differs (kind "row"): the checker's rows, from the
    // first that differs (at most DIFF_MAX_ROWS of each, numbered as in the whole result), side by
    // side. The cells of Yours that read differently from Expected's are outlined, and say so in
    // words. When the first row shown reads the same as the expected one (the difference is past
    // the cut of a long value, or in a value's type), that whole row is outlined and a note says
    // why. -> [the two tables, the "scroll sideways" note]
    function compareView(outcome) {
        const differs = (i, j) => outcome.expected[i]?.[j] !== outcome.got[i]?.[j];
        const hidden = outcome.got.length > 0 && !outcome.got[0].some((_, j) => differs(0, j));
        const yours = side(CHECK_GOT_LABEL, outcome.gotColumns, outcome.got, outcome.rowIndex, (i, j) => differs(i, j) || (hidden && i === 0));
        yours.append(el("p", "verdict-note verdict-diff-note", VERDICT_DIFF_NOTE));
        if (hidden) {
            yours.append(el("p", "verdict-note verdict-diff-note", verdictHiddenDiffNote(outcome.rowIndex)));
        }
        const expected = side(CHECK_EXPECTED_LABEL, outcome.columns, outcome.expected, outcome.rowIndex, null);
        linkScroll(expected.querySelector(".verdict-scroll"), yours.querySelector(".verdict-scroll"));
        const diff = el("div", "verdict-diff");
        diff.append(expected, yours);
        const scrollNote = el("p", "verdict-note verdict-scroll-note", VERDICT_SCROLL_NOTE);
        scrollNote.hidden = true;
        return [diff, scrollNote];
    }

    // linkScroll keeps two wide tables at the same place sideways, so that a cell of Yours can be
    // read against the one of Expected above or beside it. Setting one box's scrollLeft makes it
    // send a scroll event of its own a moment later, which is not passed back (the boxes can be of
    // different widths, and would otherwise pull each other to and fro).
    function linkScroll(a, b) {
        const echoes = new Map([
            [a, null],
            [b, null],
        ]);
        for (const [box, other] of [
            [a, b],
            [b, a],
        ]) {
            box.addEventListener("scroll", () => {
                if (echoes.get(box) === box.scrollLeft) {
                    echoes.set(box, null);
                    return;
                }
                if (other.scrollLeft !== box.scrollLeft) {
                    other.scrollLeft = box.scrollLeft;
                    echoes.set(other, other.scrollLeft);
                }
            });
        }
    }

    // revealDifference scrolls the view sideways to the first outlined cell of Yours when it is out of
    // its box (a wide result that differs in a column far to the right): the cell then sits at the
    // left, after as much of the column before it as the row numbers take (offsetLeft counts from
    // the table, which starts at the box's left). Expected follows (linkScroll).
    function revealDifference() {
        const cell = els.feedback.querySelector(".verdict-cell--differs");
        const box = cell?.closest(".verdict-scroll");
        if (!box || box.scrollWidth <= box.clientWidth) {
            return;
        }
        if (cell.offsetLeft >= box.scrollLeft && cell.offsetLeft + cell.offsetWidth <= box.scrollLeft + box.clientWidth) {
            return;
        }
        const before = box.querySelector(".verdict-row-number")?.offsetWidth ?? 0;
        box.scrollLeft = Math.max(0, cell.offsetLeft - before);
    }

    // side is one table of the view, ruled like the result table, in a scroll box that the keyboard
    // can reach while it overflows (refreshScroll gives it a tabindex then), named after its table.
    // outlined(i, j) says whether the cell of row i, column j is outlined.
    function side(caption, columns, rows, firstRow, outlined) {
        const column = el("div", "verdict-side");
        const wrap = el("div", "verdict-scroll");
        wrap.setAttribute("role", "region");
        wrap.setAttribute("aria-label", caption);
        const table = el("table", "verdict-table");
        table.append(el("caption", null, caption));
        const numeric = numericColumns(columns.length, rows);
        const headRow = el("tr");
        const corner = el("th", "verdict-row-number", CHECK_ROW_HEADER);
        corner.scope = "col";
        headRow.append(corner);
        columns.forEach((name, j) => {
            const th = el("th", numeric[j] ? "num" : null, name);
            th.scope = "col";
            headRow.append(th);
        });
        const body = el("tbody");
        rows.forEach((cells, i) => {
            const tr = el("tr");
            const number = el("th", "verdict-row-number", String(firstRow + i));
            number.scope = "row";
            tr.append(number);
            cells.forEach((cell, j) => {
                const td = el("td", numeric[j] ? "num" : null, cell);
                if (outlined?.(i, j)) {
                    td.classList.add("verdict-cell--differs");
                    td.append(el("span", "visually-hidden", CHECK_DIFFERS_TEXT));
                }
                tr.append(td);
            });
            body.append(tr);
        });
        table.append(el("thead"), body);
        table.tHead.append(headRow);
        wrap.append(table);
        column.append(wrap);
        return column;
    }

    // refreshScroll makes each table box of the view a keyboard stop and shows the "scroll
    // sideways" note while any of them is wider than its box.
    function refreshScroll() {
        let overflow = false;
        for (const box of els.feedback.querySelectorAll(".verdict-scroll")) {
            const wide = box.scrollWidth > box.clientWidth + 1;
            overflow ||= wide;
            if (wide) {
                box.tabIndex = 0;
            } else {
                box.removeAttribute("tabindex");
            }
        }
        const note = els.feedback.querySelector(".verdict-scroll-note");
        if (note) {
            note.hidden = !overflow;
        }
    }

    if (typeof ResizeObserver === "function") {
        new ResizeObserver(refreshScroll).observe(els.feedback);
    } else {
        window.addEventListener("resize", refreshScroll);
    }

    // nextUnpassed is the first exercise after the current one that is not passed, going round
    // to the start; null when every exercise is passed.
    function nextUnpassed() {
        const at = set.exercises.indexOf(current);
        for (let step = 1; step < set.exercises.length; step++) {
            const candidate = set.exercises[(at + step) % set.exercises.length];
            if (!isPassed(set.id, candidate.id)) {
                return candidate;
            }
        }
        return null;
    }

    // nextButton opens the next exercise not yet passed and puts the focus in the editor. Its title
    // (its description) names that exercise, which can be further on than the next in the list.
    function nextButton(next) {
        const openedSet = set;
        const button = el("button", "button verdict-next", NEXT_EXERCISE_TEXT);
        button.type = "button";
        button.title = exerciseTargetText(set.exercises.indexOf(next) + 1, set.exercises.length, next.title);
        button.addEventListener("click", () => {
            if (set === openedSet) {
                select(next.id);
                ui.editor.focus();
            }
        });
        return button;
    }

    // "Correct. 12 rows match." (the checker counts the rows), Next exercise, or the set complete
    function showPass(outcome) {
        const sentence = Number.isInteger(outcome.rows) ? checkPassMessage(outcome.rows) : CHECK_PASS_MESSAGE;
        const next = nextUnpassed();
        const lines = [];
        if (!next && passedCount(set.id, set.exercises.map((e) => e.id)) === set.exercises.length) {
            lines.push(el("p", "verdict-message verdict-complete", exerciseAllCompleteText(set.exercises.length)));
        }
        showVerdict("pass", CHECK_PASS_HEADLINE, {
            message: el("p", "verdict-message", sentence),
            lines,
            action: next ? nextButton(next) : null,
        });
    }

    // ran: the visible run worked; runError: what it failed with, if it failed
    function showOutcome(outcome, ran, runError = null) {
        if (outcome.status === "pass") {
            showPass(outcome);
            return;
        }
        if (outcome.status !== "fail") {
            showVerdict("warning", CHECK_UNAVAILABLE_HEADLINE, { message: el("p", "verdict-message", outcome.message) });
            return;
        }
        // The checker's own sentence ("expected 2 columns, got 1"; for a row, the first line of its
        // message, the rest being the diff as text), shown in sentence case; or the engine's message
        // as it is, in mono, as the error band shows it.
        const message = el("p", "verdict-message");
        // the visible run failed with this same message: the error band under the banner shows it,
        // with the statement, so the banner points at it instead of saying it twice (and it is the
        // message that is said)
        const shownBelow = outcome.kind === "sql" && !ran && runError && engineMessage(runError) === outcome.message;
        if (shownBelow) {
            message.textContent = CHECK_SQL_ERROR_BELOW;
        } else if (outcome.kind === "sql") {
            message.append(el("span", "verdict-engine", outcome.message));
        } else {
            message.classList.add("verdict-message--checker");
            message.textContent = outcome.kind === "row" ? outcome.message.split("\n")[0] : outcome.message;
            // "expected 2 columns, got 1" has no full stop of its own; the sentence it now is gets one
            if (!/[.!?]$/.test(message.textContent)) {
                message.classList.add("verdict-message--fragment");
            }
        }
        // a query that ran on the student's working copy but fails on the original dataset
        const lines = outcome.kind === "sql" && ran ? [el("p", "verdict-note", CHECK_COPY_NOTE)] : [];
        showVerdict("fail", CHECK_FAIL_HEADLINE, {
            message,
            lines,
            after: outcome.kind === "row" ? compareView(outcome) : [],
            spoken: shownBelow ? outcome.message : null,
        });
        refreshScroll();
        revealDifference();
    }

    // ---- check -----------------------------------------------------------------------------

    async function runCheck() {
        if (!set || !current || checking === generation) {
            return;
        }
        const sql = ui.editor.query;
        if (!sql.trim()) {
            showVerdict("info", CHECK_EMPTY_HEADLINE, { message: el("p", "verdict-message", CHECK_EMPTY_MESSAGE) });
            return;
        }
        if (isLoading()) {
            // what Run does: say that a database is loading, run and save nothing
            execute(sql).catch(() => {});
            return;
        }
        const token = generation;
        const checkedSet = set;
        const exercise = current;
        checking = token;
        checkButton?.setAttribute("aria-busy", "true");
        try {
            // the student sees their own results first; a failed run does not stop the check, but a
            // run that was dropped (a database began loading before it started) checks nothing
            let ran = true;
            let runError = null;
            try {
                await execute(sql);
            } catch (exc) {
                if (exc?.dropped) {
                    return;
                }
                ran = false;
                runError = exc ?? null;
            }
            const outcome = await checker.check(checkedSet, exercise, sql);
            if (token !== generation) {
                return; // the student has moved on: this verdict belongs to something else
            }
            if (outcome.status === "pass") {
                markPassed(checkedSet.id, exercise.id);
                refreshList();
                refreshProgress();
            }
            showOutcome(outcome, ran, runError);
        } finally {
            if (checking === token) {
                checking = -1;
            }
            checkButton?.removeAttribute("aria-busy");
        }
    }

    // Ctrl/Cmd+Shift+Enter checks from anywhere while a set is open. The editor fires "execute"
    // for any Ctrl+Enter, so the combination is caught on the way down and stopped.
    document.addEventListener(
        "keydown",
        (event) => {
            if (!set || event.key !== "Enter" || !event.shiftKey || !(event.ctrlKey || event.metaKey)) {
                return;
            }
            event.preventDefault();
            event.stopPropagation();
            event.stopImmediatePropagation();
            if (!event.repeat && !event.isComposing) {
                runCheck();
            }
        },
        true
    );

    function addCheckButton() {
        if (checkButton) {
            return;
        }
        // the filled primary of exercise mode; Run stays beside it as a quiet button
        checkButton = el("button", "button button--primary");
        checkButton.type = "button";
        checkButton.id = "exercise-check";
        checkButton.title = CHECK_BUTTON_TITLE;
        const hint = el("span", "shortcut");
        hint.setAttribute("aria-hidden", "true");
        hint.append(el("span", null, MOD_KEY), " Shift Enter");
        checkButton.append(icon("check"), el("span", null, CHECK_BUTTON_TEXT), hint);
        checkButton.setAttribute("aria-keyshortcuts", "Control+Shift+Enter Meta+Shift+Enter");
        // a plain click handler, not ActionController: that disables the button while the action
        // runs, and a browser moves the focus off a disabled button
        checkButton.addEventListener("click", () => {
            runCheck();
        });
        document.getElementById("execute").after(checkButton);
        els.toolbar.classList.add("editor-toolbar--exercise");
    }

    function removeCheckButton() {
        checkButton?.remove();
        checkButton = null;
        els.toolbar.classList.remove("editor-toolbar--exercise");
    }

    // ---- opening, closing, selecting -------------------------------------------------------

    // resetWorkArea clears what the last run showed: it belonged to another exercise or set
    function resetWorkArea() {
        showIdle();
    }

    // enter shows the panel for a set. The editor is not touched here.
    function enter(newSet, exerciseId) {
        generation++;
        asked = null;
        set = newSet;
        current = chooseExercise(newSet, exerciseId);
        rovingId = current.id;
        els.title.textContent = set.title;
        els.title.hidden = false;
        els.panel.hidden = false;
        els.progressBlock.hidden = false;
        els.reset.hidden = false;
        els.empty.hidden = true;
        addCheckButton();
        buildList();
        refreshProgress();
        renderPrompt();
        renderHints();
        refreshNav();
        clearFeedback();
        renderPicker();
        setShareContext({ set: set.id, exercise: current.id });
        showTab();
        modeChanged();
    }

    function leave() {
        generation++;
        asked = null;
        set = null;
        current = null;
        rovingId = null;
        els.title.textContent = "";
        // an empty heading would still be announced as one
        els.title.hidden = true;
        els.panel.hidden = true;
        els.progressBlock.hidden = true;
        els.reset.hidden = true;
        els.empty.hidden = false;
        removeCheckButton();
        els.list.replaceChildren();
        els.prompt.replaceChildren();
        els.hints.replaceChildren();
        clearFeedback();
        renderPicker();
        setShareContext({ set: null, exercise: null });
        modeChanged();
    }

    // announceExercise puts the new exercise in the polite live region, so a screen reader says
    // which exercise is open and what it asks for (the prompt itself is not a live region)
    function announceExercise() {
        els.announce.textContent = exerciseAnnouncement(
            set.exercises.indexOf(current) + 1,
            set.exercises.length,
            current.title,
            current.prompt
        );
    }

    function select(id) {
        const next = set.exercises.find((e) => e.id === id);
        if (!next || next === current) {
            return;
        }
        // what the student typed is already saved (every edit, Run and Check saves it)
        generation++;
        current = next;
        rovingId = next.id;
        ui.editor.value = getDraft(set.id, next.id) ?? "";
        resetWorkArea();
        refreshList();
        renderPrompt();
        renderHints();
        refreshNav();
        clearFeedback();
        setShareContext({ exercise: next.id });
        announceExercise();
        // a reload keeps the place; a fragment would bring back SQL that belongs to another exercise
        history.replaceState(
            history.state,
            "",
            `?${SET_PARAM}=${encodeURIComponent(set.id)}&${EXERCISE_PARAM}=${encodeURIComponent(next.id)}`
        );
    }

    els.reset.textContent = EXERCISE_RESET_TEXT;
    els.reset.title = EXERCISE_RESET_TITLE;
    els.reset.addEventListener("click", () => {
        if (!set || !window.confirm(exerciseResetConfirm(set.title))) {
            return;
        }
        resetSet(set.id);
        refreshList();
        refreshProgress();
        clearFeedback();
    });

    // every edit of the student's saves the exercise's draft; text that arrived in a link or was
    // set by the app fires no input event, so it reaches storage only through an edit, Run or Check
    ui.editor.addEventListener("input", () => {
        if (set) {
            saveDraft(set.id, current.id, ui.editor.value);
        }
    });

    document.addEventListener("lab:run-finished", (event) => {
        if (set && !event.detail.preview) {
            saveDraft(set.id, current.id, ui.editor.value);
        }
    });

    document.addEventListener("lab:database-loaded", (event) => {
        const exercise = event.detail.exercise;
        if (exercise) {
            enter(exercise.set, exercise.exerciseId);
        } else {
            leave();
        }
    });

    // the panel starts hidden and empty; a page without a set stays that way
    clearFeedback();

    return {
        editorSql({ set: openingSet, exerciseId }, linkSql) {
            return linkSql ?? getDraft(openingSet.id, chooseExercise(openingSet, exerciseId).id) ?? "";
        },
        open(openingSet, exerciseId) {
            const chosen = chooseExercise(openingSet, exerciseId);
            ui.editor.value = getDraft(openingSet.id, chosen.id) ?? "";
            enter(openingSet, chosen.id);
            resetWorkArea();
        },
        close: leave,
        isOpen: () => Boolean(set),
        // a pick that failed or was cancelled: the picker shows what is open again
        syncPicker() {
            asked = null;
            renderPicker();
        },
    };
}
