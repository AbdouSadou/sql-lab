// F2/F7 on screen: the exercise set picker (toolbar), the exercise panel above the editor,
// the Check button beside Run, and the verdict under the command bar.
//
// Static markup lives in index.html (#exercise-panel and its parts, #exercise-feedback);
// this module fills it, with createElement and textContent only: titles, prompts, hints and
// ids come from an exercise file and are untrusted. model_query is never read here except to
// hand the exercise object to the checker (js/lab/checker.js); it is not copied into the DOM,
// an attribute, a message or the share link.
//
// mountExercises({toolbar, ui, execute, isLoading, openSet, closeSet}) -> controller
//   toolbar    the <tool-bar>; the "Exercises" select is placed after the dataset picker
//   ui         index.js's element handles (editor, status, result)
//   execute    index.js's execute(sql): the visible run. Check calls it with exactly the SQL
//              Run would use (ui.editor.query), then calls the checker
//   isLoading  () -> true while a database is loading (Check refuses, as Run does)
//   openSet    (set) the student picked a set in the select
//   closeSet   () the student picked "None"
// The controller:
//   editorSql({set, exerciseId}, linkSql) -> string   what the editor holds when a set opens
//                                                    over a freshly loaded database: the
//                                                    link's SQL, else the exercise's draft,
//                                                    else nothing
//   open(set, exerciseId)   open a set over the database that is already open (the editor
//                           gets the draft of the exercise, or nothing)
//   close()                 leave exercise mode, keeping the database
//   syncPicker()            put the select back on the open set (a pick that failed)
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
    CHECK_EMPTY_MESSAGE,
    CHECK_EXPECTED_LABEL,
    CHECK_FAIL_HEADLINE,
    CHECK_GOT_LABEL,
    CHECK_PASS_HEADLINE,
    CHECK_PASS_MESSAGE,
    CHECK_ROW_HEADER,
    CHECK_UNAVAILABLE_HEADLINE,
    EXERCISE_HINTS_LABEL,
    EXERCISE_PARAM,
    EXERCISE_PASSED_MARK,
    EXERCISE_RESET_TEXT,
    EXERCISE_RESET_TITLE,
    SET_PARAM,
    SET_PICKER_LABEL,
    SET_PICKER_NONE,
    VERDICT_SCROLL_NOTE,
    exerciseAllCompleteText,
    exerciseAnnouncement,
    exerciseButtonLabel,
    exerciseHintLabel,
    exerciseHintText,
    exerciseListLabel,
    exerciseNextText,
    exerciseProgressText,
    exerciseResetConfirm,
    setPickerBrokenLabel,
} from "./config.js";
import { createChecker } from "./checker.js";
import { listSets } from "./exercises.js";
import { getDraft, isPassed, markPassed, passedCount, resetSet, saveDraft } from "./progress.js";
import { setShareContext } from "./share.js";
import { MESSAGES } from "../sqlite/db.js";

// chooseExercise picks the exercise a set opens on: the one the link named, else the first
// not yet passed, else the first.
export function chooseExercise(set, requestedId) {
    const named = requestedId ? set.exercises.find((e) => e.id === requestedId) : undefined;
    return named ?? set.exercises.find((e) => !isPassed(set.id, e.id)) ?? set.exercises[0];
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

export function mountExercises({ toolbar, ui, execute, isLoading, openSet, closeSet }) {
    const $ = (id) => document.getElementById(id);
    const els = {
        panel: $("exercise-panel"),
        title: $("exercise-set-title"),
        progress: $("exercise-progress"),
        reset: $("exercise-reset"),
        list: $("exercise-list"),
        prompt: $("exercise-prompt"),
        hintButton: $("exercise-hint-button"),
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

    const group = el("span", "dataset-picker exercise-set-picker");
    const label = el("label", null, SET_PICKER_LABEL);
    label.htmlFor = "exercise-set-picker";
    const picker = el("select");
    picker.id = "exercise-set-picker";
    group.append(label, picker);
    const datasetGroup = toolbar.querySelector(".dataset-picker");
    if (datasetGroup) {
        datasetGroup.after(group);
    } else {
        toolbar.prepend(group);
    }

    function option(value, text, { disabled = false, title = "" } = {}) {
        const node = el("option", null, text);
        node.value = value;
        node.disabled = disabled;
        if (title) {
            node.title = title;
        }
        return node;
    }

    function renderPicker() {
        picker.replaceChildren(option("", SET_PICKER_NONE));
        for (const entry of listed) {
            picker.append(
                entry.ok
                    ? option(entry.id, entry.set.title)
                    : option(entry.id, setPickerBrokenLabel(entry.id), { disabled: true, title: entry.problem })
            );
        }
        // a set opened from an address needs no listing: it is shown all the same
        if (set && !listed.some((e) => e.ok && e.id === set.id)) {
            picker.append(option(set.id, set.title));
        }
        picker.value = set ? set.id : "";
        picker.disabled = picker.options.length <= 1;
    }

    picker.addEventListener("change", () => {
        if (picker.value === "") {
            closeSet();
            return;
        }
        const entry = listed.find((e) => e.ok && e.id === picker.value);
        const chosen = entry ? entry.set : set && set.id === picker.value ? set : null;
        if (chosen) {
            openSet(chosen);
        } else {
            renderPicker();
        }
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
                button.append(el("span", "exercise-item-number"), el("span", "exercise-item-mark"));
                button.lastChild.setAttribute("aria-hidden", "true");
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
            button.firstChild.textContent = String(index + 1);
            button.lastChild.textContent = passed ? EXERCISE_PASSED_MARK : "";
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
        els.progress.textContent = exerciseProgressText(
            passedCount(set.id, set.exercises.map((e) => e.id)),
            set.exercises.length
        );
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
        els.prompt.replaceChildren(
            el("p", "exercise-kicker", `Exercise ${position} of ${set.exercises.length}`),
            el("h3", "exercise-title", current.title),
            el("p", "exercise-text", current.prompt)
        );
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

    function refreshHintButton() {
        const remaining = current.hints.length - (hintsShown.get(hintKey()) ?? 0);
        els.hintButton.hidden = remaining <= 0;
        els.hintButton.textContent = remaining > 0 ? exerciseHintText(remaining) : "";
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
    });

    // ---- feedback --------------------------------------------------------------------------

    function clearFeedback() {
        els.feedback.replaceChildren();
        els.feedback.hidden = true;
    }

    function showVerdict(kind, mark, headline, ...children) {
        const box = el("div", `verdict verdict--${kind}`);
        const head = el("p", "verdict-head");
        const markNode = el("span", "verdict-mark", mark);
        markNode.setAttribute("aria-hidden", "true");
        head.append(markNode, el("strong", "verdict-headline", headline));
        box.append(head, ...children);
        els.feedback.replaceChildren(box);
        els.feedback.hidden = false;
    }

    function diffTable(caption, columns, rows, firstRow) {
        // a scroll box the keyboard can reach (refreshScroll sets tabindex when it overflows),
        // named after its table
        const wrap = el("div", "verdict-scroll");
        wrap.setAttribute("role", "region");
        wrap.setAttribute("aria-label", caption);
        const table = el("table", "verdict-table");
        table.append(el("caption", null, caption));
        const headRow = el("tr");
        const corner = el("th", null, CHECK_ROW_HEADER);
        corner.scope = "col";
        headRow.append(corner);
        for (const name of columns) {
            const th = el("th", null, name);
            th.scope = "col";
            headRow.append(th);
        }
        const body = el("tbody");
        rows.forEach((cells, i) => {
            const tr = el("tr");
            const number = el("th", null, String(firstRow + i));
            number.scope = "row";
            tr.append(number, ...cells.map((cell) => el("td", null, cell)));
            body.append(tr);
        });
        table.append(el("thead"), body);
        table.tHead.append(headRow);
        wrap.append(table);
        return wrap;
    }

    // refreshScroll makes each diff table box a keyboard stop and shows the "scroll sideways"
    // note while any of them is wider than its box. It measures synchronously, so the verdict
    // reaches the live region in one piece.
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

    function passChildren() {
        const children = [el("p", "verdict-message", CHECK_PASS_MESSAGE)];
        const next = nextUnpassed();
        if (next) {
            const openedSet = set;
            const button = el("button", "button button--small verdict-next", exerciseNextText(set.exercises.indexOf(next) + 1));
            button.type = "button";
            button.addEventListener("click", () => {
                if (set === openedSet) {
                    select(next.id);
                    ui.editor.focus();
                }
            });
            const row = el("p", "verdict-actions");
            row.append(button);
            children.push(row);
        } else if (passedCount(set.id, set.exercises.map((e) => e.id)) === set.exercises.length) {
            children.push(el("p", "verdict-message verdict-complete", exerciseAllCompleteText(set.exercises.length)));
        }
        return children;
    }

    function showOutcome(outcome, ran) {
        if (outcome.status === "pass") {
            showVerdict("pass", EXERCISE_PASSED_MARK, CHECK_PASS_HEADLINE, ...passChildren());
            return;
        }
        if (outcome.status !== "fail") {
            showVerdict("info", "!", CHECK_UNAVAILABLE_HEADLINE, el("p", "verdict-message", outcome.message));
            return;
        }
        if (outcome.kind === "row") {
            const diff = el("div", "verdict-diff");
            diff.append(
                diffTable(CHECK_EXPECTED_LABEL, outcome.columns, outcome.expected, outcome.rowIndex),
                diffTable(CHECK_GOT_LABEL, outcome.gotColumns, outcome.got, outcome.rowIndex)
            );
            // the first line of the message is the headline; the rest is the diff as text
            showVerdict(
                "fail",
                "✕",
                CHECK_FAIL_HEADLINE,
                el("p", "verdict-message", outcome.message.split("\n")[0]),
                diff,
                el("p", "verdict-note verdict-scroll-note", VERDICT_SCROLL_NOTE)
            );
            els.feedback.querySelector(".verdict-scroll-note").hidden = true;
            refreshScroll();
            return;
        }
        const children = [el("p", "verdict-message", outcome.message)];
        if (outcome.kind === "sql" && ran) {
            children.push(el("p", "verdict-note", CHECK_COPY_NOTE));
        }
        showVerdict("fail", "✕", CHECK_FAIL_HEADLINE, ...children);
    }

    // ---- check -----------------------------------------------------------------------------

    async function runCheck() {
        if (!set || !current || checking === generation) {
            return;
        }
        const sql = ui.editor.query;
        if (!sql.trim()) {
            showVerdict("info", "!", CHECK_UNAVAILABLE_HEADLINE, el("p", "verdict-message", CHECK_EMPTY_MESSAGE));
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
            // the student sees their own results first; a failed run does not stop the check
            let ran = true;
            try {
                await execute(sql);
            } catch {
                ran = false;
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
            showOutcome(outcome, ran);
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
        checkButton = el("button", null, CHECK_BUTTON_TEXT);
        checkButton.type = "button";
        checkButton.id = "exercise-check";
        checkButton.title = CHECK_BUTTON_TITLE;
        checkButton.setAttribute("aria-keyshortcuts", "Control+Shift+Enter Meta+Shift+Enter");
        // a plain click handler, not ActionController: that disables the button while the action
        // runs, and a browser moves the focus off a disabled button
        checkButton.addEventListener("click", () => {
            runCheck();
        });
        document.getElementById("execute").after(checkButton);
    }

    function removeCheckButton() {
        checkButton?.remove();
        checkButton = null;
    }

    // ---- opening, closing, selecting -------------------------------------------------------

    // resetWorkArea clears what the last run showed: it belonged to another exercise or set
    function resetWorkArea() {
        ui.result.clear();
        ui.status.info(MESSAGES.invite);
    }

    // enter shows the panel for a set. The editor is not touched here.
    function enter(newSet, exerciseId) {
        generation++;
        set = newSet;
        current = chooseExercise(newSet, exerciseId);
        rovingId = current.id;
        els.title.textContent = set.title;
        els.panel.hidden = false;
        addCheckButton();
        buildList();
        refreshProgress();
        renderPrompt();
        renderHints();
        clearFeedback();
        renderPicker();
        setShareContext({ set: set.id, exercise: current.id });
    }

    function leave() {
        generation++;
        set = null;
        current = null;
        rovingId = null;
        els.panel.hidden = true;
        removeCheckButton();
        els.list.replaceChildren();
        els.prompt.replaceChildren();
        els.hints.replaceChildren();
        clearFeedback();
        renderPicker();
        setShareContext({ set: null, exercise: null });
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
            resetWorkArea();
            enter(openingSet, chosen.id);
        },
        close: leave,
        syncPicker: renderPicker,
    };
}
