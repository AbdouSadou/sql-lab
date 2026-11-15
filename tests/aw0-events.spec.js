const path = require("node:path");
const { pathToFileURL } = require("node:url");
const { test, expect, fakeStorage, inNode, NORTHLIGHT_URL } = require("./helpers");

// Assessment plan, Phase 0 (groundwork): the events of the evidence log (js/lab/events.js; plan
// section 6, "How events are kept"). What is stored and under which key, how an event is made
// from what a caller gives, the caps, the strict reading of stored text, storage that is full or
// cannot be read, two tabs, and timeline(), which puts the events among the queries. The module
// runs in Node against fakeStorage (tests/helpers.js), as the run log's tests do; two tests
// drive the real page and check that recording an event leaves the rest of the page as it was.

const KEY = "northlight";
const T = "2026-11-15T10:02:11Z";
const NOW = new Date("2026-11-15T10:02:11.987Z");

// the second `n` seconds after T, as a Date and as stored text
const at = (n) => new Date(NOW.getTime() - 987 + n * 1000);
const stamp = (n) => at(n).toISOString().slice(0, 19) + "Z";

const configUrl = pathToFileURL(path.join(__dirname, "..", "js", "lab", "config-workflow.js")).href;

// the settings the events use: the kinds are in config.js, which the verify page loads too; the
// store's own settings are in config-workflow.js
const settings = async (t) => ({ ...(await t.load("config.js")), ...(await t.load("config-workflow.js")) });

// runs fn with a private copy of the modules (one tab) over a fresh fakeStorage
async function withEvents(fn, storage = fakeStorage()) {
    return inNode(storage, async (domEvents, tab) => {
        const t = tab();
        const events = await t.load("events.js");
        const config = { ...(await t.load("config.js")), ...(await t.load("config-workflow.js")) };
        const evidence = await t.load("evidence.js");
        return fn({ ...events, config, sanitizeLine: evidence.sanitizeLine, storage, tab, domEvents });
    });
}

const storedText = (storage, config, key = KEY) => storage.data.get(`${config.EVENTS_PREFIX}${key}`);
const storedEvents = (storage, config, key = KEY) => JSON.parse(storedText(storage, config, key)).events;
const detail = (e) => e.lines.join("|");

// a query of the run log
const query = (t, name) => ({ t, sql: `SELECT '${name}';`, rows: 1 });
// an event as stored
const event = (t, after, name = "e", kind = "import") => ({ t, kind, after, lines: [`line of ${name}`] });

const WITH_LONE_SURROGATE = /[\ud800-\udbff](?![\udc00-\udfff])|(?<![\ud800-\udbff])[\udc00-\udfff]/;

test.describe("what recordEvent stores (in Node)", () => {
    test("one event is stored under EVENTS_PREFIX and the log key as exactly {v, events:[{t, kind, after, lines}]}, and is returned", async () => {
        await withEvents(({ recordEvent, config, storage }) => {
            const result = recordEvent(KEY, { kind: "import", lines: ["file: sales.csv, 2128 bytes", "table: sales, 22 rows, 13 columns"] }, NOW);
            const expected = { t: T, kind: "import", after: 0, lines: ["file: sales.csv, 2128 bytes", "table: sales, 22 rows, 13 columns"] };
            expect(result).toEqual(expected);
            expect(Object.keys(result).sort()).toEqual(["after", "kind", "lines", "t"]);
            expect([...storage.data.keys()]).toEqual([`${config.EVENTS_PREFIX}${KEY}`]);
            expect(JSON.parse(storedText(storage, config))).toEqual({ v: config.EVENTS_VERSION, events: [expected] });
            expect(Object.keys(JSON.parse(storedText(storage, config))).sort()).toEqual(["events", "v"]);
        });
    });

    test("t is the UTC second of now: no fraction, a Z, whatever the offset of the date", async () => {
        await withEvents(({ recordEvent }) => {
            expect(recordEvent(KEY, { kind: "export", lines: ["a"] }, new Date("2026-11-15T23:59:59.999Z")).t).toBe("2026-11-15T23:59:59Z");
            expect(recordEvent(KEY, { kind: "export", lines: ["a"] }, new Date("2026-11-16T00:00:00.000Z")).t).toBe("2026-11-16T00:00:00Z");
            expect(recordEvent(KEY, { kind: "export", lines: ["a"] }, new Date("2026-11-15T10:02:11+02:00")).t).toBe("2026-11-15T08:02:11Z");
        });
    });

    test("without a time, the event is stamped with the current second", async () => {
        await withEvents(({ recordEvent }) => {
            const before = Date.now();
            const result = recordEvent(KEY, { kind: "reset", lines: ["database reset"] });
            const after = Date.now();
            expect(result.t).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/);
            const ms = Date.parse(result.t);
            expect(ms).toBeGreaterThanOrEqual(Math.floor(before / 1000) * 1000);
            expect(ms).toBeLessThanOrEqual(after);
        });
    });

    test("every kind of EVENT_KINDS is accepted, and events are stored oldest first, in the order recorded", async () => {
        await withEvents(({ recordEvent, readEvents, config, storage }) => {
            config.EVENT_KINDS.forEach((kind, i) => {
                expect(recordEvent(KEY, { kind, lines: [`a ${kind}`] }, at(i))).toEqual({ t: stamp(i), kind, after: 0, lines: [`a ${kind}`] });
            });
            const expected = config.EVENT_KINDS.map((kind, i) => ({ t: stamp(i), kind, after: 0, lines: [`a ${kind}`] }));
            expect(storedEvents(storage, config)).toEqual(expected);
            expect(readEvents(KEY)).toEqual(expected);
            expect(config.EVENT_KINDS).toEqual(["import", "export", "reset", "reopen"]);
        });
    });

    test("each log key has its own events", async () => {
        await withEvents(({ recordEvent, readEvents, config, storage }) => {
            recordEvent("northlight", { kind: "import", lines: ["one"] }, NOW);
            recordEvent("file:sample.db", { kind: "reset", lines: ["two"] }, NOW);
            expect(readEvents("northlight").map(detail)).toEqual(["one"]);
            expect(readEvents("file:sample.db").map(detail)).toEqual(["two"]);
            expect(readEvents("other")).toEqual([]);
            expect([...storage.data.keys()].sort()).toEqual([`${config.EVENTS_PREFIX}file:sample.db`, `${config.EVENTS_PREFIX}northlight`]);
        });
    });
});

test.describe("events are apart from the run log (in Node)", () => {
    test("the key is not under the run log's prefix, and recording writes nothing under it", async () => {
        await withEvents(({ recordEvent, config, storage }) => {
            expect(config.EVENTS_PREFIX.startsWith(config.RUN_LOG_PREFIX)).toBe(false);
            expect(config.RUN_LOG_PREFIX.startsWith(config.EVENTS_PREFIX)).toBe(false);
            recordEvent(KEY, { kind: "import", lines: ["a"] }, NOW);
            recordEvent("file:sample.db", { kind: "export", lines: ["b"] }, NOW);
            expect([...storage.data.keys()].filter((k) => k.startsWith(config.RUN_LOG_PREFIX))).toEqual([]);
            expect([...storage.data.keys()].every((k) => k.startsWith(config.EVENTS_PREFIX))).toBe(true);
        });
    });

    test("the run log's stored value is untouched by recording events, byte for byte", async () => {
        await withEvents(({ recordEvent, config, storage }) => {
            const logKey = `${config.RUN_LOG_PREFIX}${KEY}`;
            const text = JSON.stringify({ v: config.RUN_LOG_VERSION, entries: [query(T, "a"), query(stamp(1), "b")] }, null, 1);
            storage.setItem(logKey, text);
            recordEvent(KEY, { kind: "import", lines: ["a"] }, NOW);
            recordEvent(KEY, { kind: "export", lines: ["b"] }, at(1));
            expect(storage.data.get(logKey)).toBe(text);
            expect([...storage.data.keys()].sort()).toEqual([`${config.EVENTS_PREFIX}${KEY}`, logKey].sort());
        });
    });

    test("an unreadable run log text is not rewritten either", async () => {
        await withEvents(({ recordEvent, config, storage }) => {
            const logKey = `${config.RUN_LOG_PREFIX}${KEY}`;
            storage.setItem(logKey, "this is not a log");
            expect(recordEvent(KEY, { kind: "reopen", lines: ["a"] }, NOW)).toEqual({ t: T, kind: "reopen", after: 0, lines: ["a"] });
            expect(storage.data.get(logKey)).toBe("this is not a log");
        });
    });
});

test.describe("after: the queries of the same second already in the run log (in Node)", () => {
    const seed = ({ config, storage }, key, entries) =>
        storage.setItem(`${config.RUN_LOG_PREFIX}${key}`, JSON.stringify({ v: config.RUN_LOG_VERSION, entries }));

    test("it counts the log's queries with the event's second, and only those", async () => {
        await withEvents((m) => {
            seed(m, KEY, [query(stamp(-2), "a"), query(stamp(-1), "b"), query(T, "c"), query(T, "d"), query(T, "e"), query(stamp(1), "f"), query(stamp(1), "g")]);
            expect(m.recordEvent(KEY, { kind: "import", lines: ["x"] }, NOW).after).toBe(3);
            expect(m.recordEvent(KEY, { kind: "import", lines: ["x"] }, at(1)).after).toBe(2);
            expect(m.recordEvent(KEY, { kind: "import", lines: ["x"] }, at(-1)).after).toBe(1);
            expect(m.recordEvent(KEY, { kind: "import", lines: ["x"] }, at(5)).after).toBe(0);
            expect(m.readEvents(KEY).map((e) => e.after)).toEqual([3, 2, 1, 0]);
        });
    });

    test("it is 0 when there is no log for the key", async () => {
        await withEvents((m) => {
            expect(m.recordEvent(KEY, { kind: "reset", lines: ["x"] }, NOW).after).toBe(0);
        });
    });

    test("it is 0 when the log holds no query of that second", async () => {
        await withEvents((m) => {
            seed(m, KEY, [query(stamp(-1), "a"), query(stamp(1), "b")]);
            expect(m.recordEvent(KEY, { kind: "reset", lines: ["x"] }, NOW).after).toBe(0);
        });
    });

    test("another log's queries are not counted", async () => {
        await withEvents((m) => {
            seed(m, "file:other.db", [query(T, "a"), query(T, "b")]);
            seed(m, KEY, [query(T, "c")]);
            expect(m.recordEvent(KEY, { kind: "reset", lines: ["x"] }, NOW).after).toBe(1);
            expect(m.recordEvent("file:third.db", { kind: "reset", lines: ["x"] }, NOW).after).toBe(0);
        });
    });

    test("events already recorded are not queries: two events in one second both count only the log's queries", async () => {
        await withEvents((m) => {
            seed(m, KEY, [query(T, "a"), query(T, "b")]);
            expect(m.recordEvent(KEY, { kind: "import", lines: ["x"] }, NOW).after).toBe(2);
            expect(m.recordEvent(KEY, { kind: "export", lines: ["y"] }, NOW).after).toBe(2);
        });
    });

    test("a run log that is stored but unreadable counts as no queries", async () => {
        await withEvents((m) => {
            m.storage.setItem(`${m.config.RUN_LOG_PREFIX}${KEY}`, "{nope");
            expect(m.recordEvent(KEY, { kind: "import", lines: ["x"] }, NOW).after).toBe(0);
        });
    });
});

test.describe("what recordEvent refuses (in Node)", () => {
    test("an unknown kind: null, and nothing stored", async () => {
        await withEvents(({ recordEvent, storage }) => {
            for (const kind of ["delete", "Import", "IMPORT", "", " import", "import ", undefined, null, 1, {}, ["import"], Symbol("import")]) {
                expect(recordEvent(KEY, { kind, lines: ["a"] }, NOW), String(typeof kind)).toBeNull();
            }
            expect(recordEvent(KEY, { lines: ["a"] }, NOW)).toBeNull();
            expect(storage.data.size).toBe(0);
        });
    });

    test("no lines, or lines that are all empty or spaces: null, and nothing stored", async () => {
        await withEvents(({ recordEvent, storage }) => {
            for (const lines of [[], [""], ["", ""], ["   "], ["", "  ", "   "], [" ", ""]]) {
                expect(recordEvent(KEY, { kind: "import", lines }, NOW), JSON.stringify(lines)).toBeNull();
            }
            expect(recordEvent(KEY, { kind: "import" }, NOW)).toBeNull();
            expect(storage.data.size).toBe(0);
        });
    });

    test("lines that is not an array: null, and nothing stored", async () => {
        await withEvents(({ recordEvent, storage }) => {
            for (const lines of ["a line", "", 5, null, undefined, {}, { 0: "a", length: 1 }, true, Symbol("a"), () => ["a"]]) {
                expect(recordEvent(KEY, { kind: "import", lines }, NOW), String(typeof lines)).toBeNull();
            }
            expect(storage.data.size).toBe(0);
        });
    });

    test("a key that is not a non-empty string: null, and nothing stored", async () => {
        await withEvents(({ recordEvent, storage }) => {
            for (const key of ["", undefined, null, 5, 0, true, {}, [], ["northlight"], Symbol("northlight"), () => "northlight"]) {
                expect(recordEvent(key, { kind: "import", lines: ["a"] }, NOW), String(typeof key)).toBeNull();
            }
            expect(storage.data.size).toBe(0);
        });
    });

    test("nothing throws, for any input at all", async () => {
        await withEvents((m) => {
            const odd = [undefined, null, 0, 5, NaN, "", "text", true, {}, [], [1, 2], { kind: "import" }, Symbol("s"), () => 1, new Date(NaN), 10n];
            // (null in the place of the event is its own test, below)
            const events = odd.filter((value) => value !== null);
            for (const key of odd) {
                for (const second of events) {
                    expect(() => m.recordEvent(key, second, NOW)).not.toThrow();
                    expect(() => m.recordEvent(KEY, second, NOW)).not.toThrow();
                    expect(() => m.recordEvent(key, { kind: "import", lines: ["a"] }, NOW)).not.toThrow();
                }
                expect(() => m.recordEvent(KEY, { kind: "import", lines: [key] }, NOW)).not.toThrow();
                expect(() => m.recordEvent(KEY, { kind: "import", lines: ["a"] }, key)).not.toThrow();
                expect(() => m.readEvents(key)).not.toThrow();
                expect(() => m.timeline([], [])).not.toThrow();
            }
            expect(() => m.recordEvent()).not.toThrow();
            expect(m.recordEvent()).toBeNull();
            expect(() => m.recordEvent(KEY, { kind: "import", lines: [{ toString() { throw new Error("boom"); } }] }, NOW)).not.toThrow();
            expect(m.readEvents(KEY).every((e) => e.lines.length > 0)).toBe(true);
        });
    });

    test("null in the place of the event gives null and does not throw (the header: nothing here throws)", async () => {
        await withEvents((m) => {
            let result;
            expect(() => {
                result = m.recordEvent(KEY, null, NOW);
            }).not.toThrow();
            expect(result).toBeNull();
            expect(m.storage.data.size).toBe(0);
        });
    });

    test("an event whose lines cannot be read gives null and does not throw", async () => {
        await withEvents((m) => {
            let result;
            expect(() => {
                result = m.recordEvent(KEY, { kind: "import", get lines() { throw new Error("boom"); } }, NOW);
            }).not.toThrow();
            expect(result).toBeNull();
            expect(m.storage.data.size).toBe(0);
        });
    });

    test("readEvents gives [] for a key that is not a string, and never throws", async () => {
        await withEvents(({ readEvents }) => {
            for (const key of [undefined, null, 5, {}, Symbol("k")]) {
                expect(readEvents(key)).toEqual([]);
            }
            expect(readEvents("nothing stored")).toEqual([]);
        });
    });
});

test.describe("the lines of an event (in Node)", () => {
    test("a line break, a tab, a control character or U+2028 in a line becomes what sanitizeLine gives, so every line is one line", async () => {
        await withEvents(({ recordEvent, sanitizeLine, config, storage }) => {
            const raw = ["a\nb", "a\r\nb", "a\rb", "a\tb", "a\u0000b", "a\u001fb", "a\u007fb", "a\u0085b", "a\u2028b", "a\u2029b", "\u2028leading and trailing\n"];
            const result = recordEvent(KEY, { kind: "import", lines: raw }, NOW);
            expect(result.lines).toEqual(raw.map((line) => sanitizeLine(line)));
            expect(result.lines).toHaveLength(raw.length);
            for (const line of result.lines) {
                expect(line).not.toMatch(/[\u0000-\u001f\u007f\u0085\u2028\u2029]/);
            }
            expect(storedEvents(storage, config)[0].lines).toEqual(result.lines);
        });
    });

    test("ordinary text is kept as it is: spaces, accents, CJK, emoji, SQL-looking and header-looking lines", async () => {
        await withEvents(({ recordEvent }) => {
            const lines = ["  indented line  ", "café, naïve, 日本語, 😀", "table: ventes, 22 rows, 13 columns", "[3] 2026-11-15T10:02:11Z · event: import", "'; DROP TABLE x; --"];
            expect(recordEvent(KEY, { kind: "export", lines }, NOW).lines).toEqual(lines);
        });
    });

    test("empty lines and lines of spaces are dropped, the others keep their order", async () => {
        await withEvents(({ recordEvent }) => {
            expect(recordEvent(KEY, { kind: "import", lines: ["", "first", "   ", "second", "", "third", " "] }, NOW).lines).toEqual(["first", "second", "third"]);
        });
    });

    test("a line of exactly EVENT_MAX_LINE_CHARS is kept whole; one character more is cut, to at most that length, and ends in the cut mark", async () => {
        await withEvents(({ recordEvent, config }) => {
            const max = config.EVENT_MAX_LINE_CHARS;
            const exact = "x".repeat(max);
            expect(recordEvent(KEY, { kind: "import", lines: [exact] }, NOW).lines).toEqual([exact]);
            const [cut] = recordEvent(KEY, { kind: "import", lines: ["x".repeat(max + 1)] }, NOW).lines;
            expect(cut.length).toBeLessThanOrEqual(max);
            expect(cut.endsWith("…")).toBe(true);
            expect(cut.slice(0, -1)).toMatch(/^x+$/);
            const [long] = recordEvent(KEY, { kind: "import", lines: ["y".repeat(max * 20)] }, NOW).lines;
            expect(long.length).toBeLessThanOrEqual(max);
            expect(long.endsWith("…")).toBe(true);
            expect(long.slice(0, -1)).toMatch(/^y+$/);
            // the cut keeps as much as fits, not just a stub
            expect(long.length).toBeGreaterThan(max - 5);
        });
    });

    test("a line of emoji is cut between characters: no half of a surrogate pair, the cut mark at the end", async () => {
        await withEvents(({ recordEvent, config, storage }) => {
            const max = config.EVENT_MAX_LINE_CHARS;
            for (const unit of ["😀", "a😀", "aa😀", "𝔘"]) {
                const line = unit.repeat(max);
                const result = recordEvent(KEY, { kind: "import", lines: [line] }, NOW);
                const [cut] = result.lines;
                expect(cut.length, unit).toBeLessThanOrEqual(max);
                expect(cut.endsWith("…"), unit).toBe(true);
                expect(cut, unit).not.toMatch(WITH_LONE_SURROGATE);
                // what is left of the line is the line's own start
                expect(line.startsWith(cut.slice(0, -1)), unit).toBe(true);
                expect([...cut.slice(0, -1)].length, unit).toBeGreaterThan(0);
            }
            // and what was stored reads back
            const text = storedText(storage, config);
            expect(text).not.toMatch(/\\ud[89ab]/i);
            expect(JSON.parse(text).events).toHaveLength(4);
        });
    });

    test("a line that is cut still reads back from storage (it is not a shape the reader refuses)", async () => {
        await withEvents(({ recordEvent, readEvents, config }) => {
            const stored = recordEvent(KEY, { kind: "import", lines: ["ok", "z".repeat(config.EVENT_MAX_LINE_CHARS * 3), "😀".repeat(900)] }, NOW);
            expect(readEvents(KEY)).toEqual([stored]);
        });
    });

    test("EVENT_MAX_LINES lines are all kept; more are cut to that many, the last one saying how many are not listed", async () => {
        await withEvents(({ recordEvent, readEvents, config }) => {
            const max = config.EVENT_MAX_LINES;
            const exact = Array.from({ length: max }, (_, i) => `line ${i}`);
            expect(recordEvent(KEY, { kind: "import", lines: exact }, NOW).lines).toEqual(exact);
            for (const extra of [1, 11, 1000]) {
                const lines = Array.from({ length: max + extra }, (_, i) => `line ${i}`);
                const result = recordEvent(KEY, { kind: "import", lines }, at(extra));
                expect(result.lines).toHaveLength(max);
                // the listed lines are the first ones, in order
                expect(result.lines.slice(0, max - 1)).toEqual(lines.slice(0, max - 1));
                const last = result.lines[max - 1];
                expect(last, `${extra} extra`).toMatch(/not listed/);
                // the lines that are not listed: those after the max - 1 that were kept
                expect(last, `${extra} extra`).toContain(String(lines.length - (max - 1)));
            }
            expect(readEvents(KEY).map((e) => e.lines.length)).toEqual([max, max, max, max]);
        });
    });

    test("empty lines do not count toward EVENT_MAX_LINES", async () => {
        await withEvents(({ recordEvent, config }) => {
            const max = config.EVENT_MAX_LINES;
            const lines = [];
            for (let i = 0; i < max; i++) {
                lines.push(`line ${i}`, "");
            }
            expect(recordEvent(KEY, { kind: "import", lines }, NOW).lines).toEqual(lines.filter(Boolean));
        });
    });
});

test.describe("the caps (in Node)", () => {
    test("only the newest EVENTS_MAX events are kept, in storage and when read", async () => {
        await withEvents(({ recordEvent, readEvents, config, storage }) => {
            const total = config.EVENTS_MAX + 5;
            for (let i = 0; i < total; i++) {
                recordEvent(KEY, { kind: "import", lines: [`event ${i}`] }, at(i));
            }
            const names = (events) => events.map(detail);
            const expected = Array.from({ length: config.EVENTS_MAX }, (_, i) => `event ${i + 5}`);
            expect(names(storedEvents(storage, config))).toEqual(expected);
            expect(names(readEvents(KEY))).toEqual(expected);
        });
    });

    test("no more than EVENTS_MAX_BYTES of line text are kept, oldest dropped first, the newest always kept", async () => {
        await withEvents(({ recordEvent, readEvents, config, storage }) => {
            // 100 lines of 500 ASCII characters: 50,000 bytes an event
            const make = (i) => Array.from({ length: 100 }, (_, n) => `${String(i).padStart(3, "0")}.${n}`.padEnd(config.EVENT_MAX_LINE_CHARS, "x"));
            const total = 25;
            for (let i = 0; i < total; i++) {
                recordEvent(KEY, { kind: "export", lines: make(i) }, at(i));
            }
            const perEvent = 100 * config.EVENT_MAX_LINE_CHARS;
            const fit = Math.floor(config.EVENTS_MAX_BYTES / perEvent);
            expect(fit).toBeLessThan(total);
            const stored = storedEvents(storage, config);
            expect(stored).toHaveLength(fit);
            expect(stored.map((e) => e.lines[0].slice(0, 3))).toEqual(Array.from({ length: fit }, (_, i) => String(total - fit + i).padStart(3, "0")));
            expect(readEvents(KEY)).toEqual(stored);
            const bytes = stored.flatMap((e) => e.lines).reduce((sum, line) => sum + Buffer.byteLength(line), 0);
            expect(bytes).toBeLessThanOrEqual(config.EVENTS_MAX_BYTES);
            expect(bytes + perEvent).toBeGreaterThan(config.EVENTS_MAX_BYTES);
        });
    });

    test("the limit counts UTF-8 bytes, not characters: events of CJK text fill it three times as fast", async () => {
        await withEvents(({ recordEvent, readEvents, config }) => {
            const lines = (i) => Array.from({ length: config.EVENT_MAX_LINES }, () => `${i}${"日".repeat(config.EVENT_MAX_LINE_CHARS - 1)}`);
            for (let i = 0; i < 6; i++) {
                recordEvent(KEY, { kind: "import", lines: lines(i) }, at(i));
            }
            const perEvent = config.EVENT_MAX_LINES * (1 + 3 * (config.EVENT_MAX_LINE_CHARS - 1));
            const fit = Math.floor(config.EVENTS_MAX_BYTES / perEvent);
            expect(fit).toBeGreaterThan(1);
            expect(fit).toBeLessThan(6);
            expect(readEvents(KEY).map((e) => e.lines[0][0])).toEqual(Array.from({ length: fit }, (_, i) => String(6 - fit + i)));
        });
    });

    test("a small set of events is untouched by the limits", async () => {
        await withEvents(({ recordEvent, readEvents }) => {
            for (let i = 0; i < 30; i++) {
                recordEvent(KEY, { kind: "export", lines: [`event ${i}`, "x".repeat(300)] }, at(i));
            }
            expect(readEvents(KEY)).toHaveLength(30);
        });
    });
});

test.describe("reading stored text strictly (in Node)", () => {
    const good = (name = "good") => ({ t: T, kind: "import", after: 0, lines: [`line of ${name}`] });
    const put = (m, value, key = KEY) => m.storage.setItem(`${m.config.EVENTS_PREFIX}${key}`, typeof value === "string" ? value : JSON.stringify(value));

    test("a value of another version, not JSON, not an object, or with events that are not an array reads as no events", async () => {
        await withEvents((m) => {
            const texts = [
                JSON.stringify({ v: 2, events: [good()] }),
                JSON.stringify({ v: 0, events: [good()] }),
                JSON.stringify({ v: "1", events: [good()] }),
                JSON.stringify({ events: [good()] }),
                JSON.stringify({ v: 1 }),
                JSON.stringify({ v: 1, events: null }),
                JSON.stringify({ v: 1, events: "nope" }),
                JSON.stringify({ v: 1, events: { 0: good(), length: 1 } }),
                JSON.stringify([good()]),
                JSON.stringify([]),
                "null",
                "5",
                "true",
                '"text"',
                "",
                "not json",
                "{",
                '{"v":1,"events":[',
                "undefined",
            ];
            for (const text of texts) {
                put(m, text);
                expect(m.readEvents(KEY), text).toEqual([]);
            }
        });
    });

    test("a value of the right version with good events reads as those events (the control for the cases above)", async () => {
        await withEvents((m) => {
            put(m, { v: 1, events: [good("one"), good("two")] });
            expect(m.readEvents(KEY).map(detail)).toEqual(["line of one", "line of two"]);
        });
    });

    test("an event of the wrong shape is skipped, and the good ones around it stay, in order", async () => {
        await withEvents((m) => {
            const bad = [
                { t: T, kind: "import", after: 0 },
                { t: T, kind: "import", after: 0, lines: [] },
                { t: T, kind: "import", after: 0, lines: "a line" },
                { t: T, kind: "import", after: 0, lines: ["two\nlines"] },
                { t: T, kind: "import", after: 0, lines: ["a\ttab"] },
                { t: T, kind: "import", after: 0, lines: ["a\u2028b"] },
                { t: T, kind: "import", after: 0, lines: ["fine", 5] },
                { t: T, kind: "import", after: 0, lines: ["fine", null] },
                { t: T, kind: "import", after: 0, lines: [""] },
                { t: T, kind: "import", after: 0, lines: ["   "] },
                { t: T, kind: "import", after: 0, lines: ["x".repeat(m.config.EVENT_MAX_LINE_CHARS + 1)] },
                { t: T, kind: "import", after: 0, lines: Array.from({ length: m.config.EVENT_MAX_LINES + 1 }, (_, i) => `line ${i}`) },
                { t: T, kind: "delete", after: 0, lines: ["a"] },
                { t: T, kind: "IMPORT", after: 0, lines: ["a"] },
                { t: T, after: 0, lines: ["a"] },
                { t: T, kind: "import", after: -1, lines: ["a"] },
                { t: T, kind: "import", after: 1.5, lines: ["a"] },
                { t: T, kind: "import", after: "1", lines: ["a"] },
                { t: T, kind: "import", after: null, lines: ["a"] },
                { t: T, kind: "import", lines: ["a"] },
                { kind: "import", after: 0, lines: ["a"] },
                { t: "yesterday", kind: "import", after: 0, lines: ["a"] },
                { t: "2026-11-15 10:02:11", kind: "import", after: 0, lines: ["a"] },
                { t: "2026-11-15T10:02:11.000Z", kind: "import", after: 0, lines: ["a"] },
                { t: "2026-11-15T10:02:11+00:00", kind: "import", after: 0, lines: ["a"] },
                { t: "2026-11-15T10:02:11", kind: "import", after: 0, lines: ["a"] },
                { t: 1763200931, kind: "import", after: 0, lines: ["a"] },
                null,
                5,
                "text",
                true,
                [],
                [good()],
            ];
            const mixed = [good("first"), ...bad.flatMap((b) => [b]), good("second")];
            // the good ones are also interleaved with the bad ones
            const interleaved = [good("a"), ...bad.slice(0, 15), good("b"), ...bad.slice(15), good("c")];
            put(m, { v: 1, events: mixed });
            expect(m.readEvents(KEY).map(detail)).toEqual(["line of first", "line of second"]);
            put(m, { v: 1, events: interleaved });
            expect(m.readEvents(KEY).map(detail)).toEqual(["line of a", "line of b", "line of c"]);
        });
    });

    test("each bad shape alone is skipped (so no case above is hidden by another)", async () => {
        await withEvents((m) => {
            const variants = {
                "no lines": { t: T, kind: "import", after: 0 },
                "empty lines": { t: T, kind: "import", after: 0, lines: [] },
                "a line with a line break": { t: T, kind: "import", after: 0, lines: ["a\nb"] },
                "a kind that is not listed": { t: T, kind: "import-ish", after: 0, lines: ["a"] },
                "a negative after": { t: T, kind: "import", after: -1, lines: ["a"] },
                "a fractional after": { t: T, kind: "import", after: 0.5, lines: ["a"] },
                "a bad time": { t: "2026-13-45", kind: "import", after: 0, lines: ["a"] },
            };
            for (const [name, bad] of Object.entries(variants)) {
                put(m, { v: 1, events: [bad] });
                expect(m.readEvents(KEY), name).toEqual([]);
                put(m, { v: 1, events: [good("x"), bad] });
                expect(m.readEvents(KEY).map(detail), name).toEqual(["line of x"]);
            }
        });
    });

    test("a stored event is read as {t, kind, after, lines}; a field it carries beyond these is not passed on", async () => {
        await withEvents((m) => {
            put(m, { v: 1, events: [{ ...good(), extra: "x", __proto__: { polluted: 1 } }] });
            expect(m.readEvents(KEY)).toStrictEqual([{ t: T, kind: "import", after: 0, lines: ["line of good"] }]);
        });
    });

    test("no more than the newest EVENTS_MAX of a longer stored list are read", async () => {
        await withEvents((m) => {
            const events = Array.from({ length: m.config.EVENTS_MAX + 7 }, (_, i) => ({ t: stamp(i), kind: "export", after: 0, lines: [`event ${i}`] }));
            put(m, { v: 1, events });
            const read = m.readEvents(KEY);
            expect(read).toHaveLength(m.config.EVENTS_MAX);
            expect(read[0].lines[0]).toBe("event 7");
            expect(read.at(-1).lines[0]).toBe(`event ${m.config.EVENTS_MAX + 6}`);
        });
    });

    test("recording over a stored value that is not events starts a fresh list; recording next to bad events drops them", async () => {
        await withEvents((m) => {
            put(m, "garbage");
            m.recordEvent(KEY, { kind: "import", lines: ["a"] }, NOW);
            expect(storedEvents(m.storage, m.config).map(detail)).toEqual(["a"]);
            put(m, { v: 1, events: [good("kept"), { t: "bad", kind: "import", after: 0, lines: ["x"] }] });
            m.recordEvent(KEY, { kind: "export", lines: ["b"] }, at(1));
            expect(storedEvents(m.storage, m.config).map(detail)).toEqual(["line of kept", "b"]);
        });
    });
});

test.describe("storage that is full, unreadable or shared with another tab (in Node)", () => {
    test("a write the browser refuses keeps the events in this page's memory, and they are stored once a write succeeds", async () => {
        const storage = fakeStorage();
        await withEvents(({ recordEvent, readEvents, config }) => {
            storage.full = true;
            const first = recordEvent(KEY, { kind: "import", lines: ["one"] }, at(0));
            const second = recordEvent(KEY, { kind: "export", lines: ["two"] }, at(1));
            expect(first).toEqual({ t: stamp(0), kind: "import", after: 0, lines: ["one"] });
            expect(second).toEqual({ t: stamp(1), kind: "export", after: 0, lines: ["two"] });
            expect(storage.data.size).toBe(0);
            expect(readEvents(KEY)).toEqual([first, second]);
            // storage has room again: the next event stores all three
            storage.full = false;
            const third = recordEvent(KEY, { kind: "reset", lines: ["three"] }, at(2));
            expect(storedEvents(storage, config)).toEqual([first, second, third]);
            expect(readEvents(KEY)).toEqual([first, second, third]);
            // and stored once, not twice
            recordEvent(KEY, { kind: "reopen", lines: ["four"] }, at(3));
            expect(storedEvents(storage, config).map(detail)).toEqual(["one", "two", "three", "four"]);
        }, storage);
    });

    test("a value too big for the browser's quota is refused the same way, and what was stored stays", async () => {
        const storage = fakeStorage();
        await withEvents(({ recordEvent, readEvents, config }) => {
            const first = recordEvent(KEY, { kind: "import", lines: ["small"] }, at(0));
            const stored = storedText(storage, config);
            storage.limit = stored.length + 10;
            const second = recordEvent(KEY, { kind: "export", lines: ["this one does not fit in the quota at all"] }, at(1));
            expect(second).not.toBeNull();
            expect(storedText(storage, config)).toBe(stored);
            expect(readEvents(KEY)).toEqual([first, second]);
            storage.limit = Infinity;
            recordEvent(KEY, { kind: "reset", lines: ["room again"] }, at(2));
            expect(storedEvents(storage, config).map(detail)).toEqual(["small", "this one does not fit in the quota at all", "room again"]);
        }, storage);
    });

    test("when getItem throws, the events stay in memory and nothing is written over the stored value; when it reads again they are all stored", async () => {
        const storage = fakeStorage();
        await withEvents(({ recordEvent, readEvents, config }) => {
            const before = recordEvent(KEY, { kind: "import", lines: ["stored before"] }, at(0));
            const text = storedText(storage, config);
            storage.unreadable = true;
            const a = recordEvent(KEY, { kind: "export", lines: ["a"] }, at(1));
            const b = recordEvent(KEY, { kind: "export", lines: ["b"] }, at(2));
            expect(a).not.toBeNull();
            expect(b).not.toBeNull();
            expect(storedText(storage, config)).toBe(text);
            expect(readEvents(KEY).map(detail)).toEqual(["a", "b"]);
            storage.unreadable = false;
            // readable again: the stored event and the two held back are all there
            expect(readEvents(KEY).map(detail)).toEqual(["stored before", "a", "b"]);
            const c = recordEvent(KEY, { kind: "export", lines: ["c"] }, at(3));
            expect(storedEvents(storage, config)).toEqual([before, a, b, c]);
        }, storage);
    });

    test("when getItem throws with nothing stored yet, no key is written at all", async () => {
        const storage = fakeStorage();
        storage.unreadable = true;
        await withEvents(({ recordEvent, readEvents }) => {
            for (let i = 1; i <= 3; i++) {
                recordEvent(KEY, { kind: "import", lines: [`select ${i}`] }, at(i));
            }
            expect(readEvents(KEY).map(detail)).toEqual(["select 1", "select 2", "select 3"]);
            expect(storage.data.size).toBe(0);
            storage.unreadable = false;
            recordEvent(KEY, { kind: "import", lines: ["select 4"] }, at(4));
            expect(JSON.parse(storage.data.get([...storage.data.keys()][0])).events.map(detail)).toEqual(["select 1", "select 2", "select 3", "select 4"]);
        }, storage);
    });

    test("when setItem and getItem both fail, events are still recorded and read in this page, and nothing throws", async () => {
        const storage = fakeStorage();
        storage.full = true;
        storage.unreadable = true;
        await withEvents(({ recordEvent, readEvents }) => {
            expect(recordEvent(KEY, { kind: "import", lines: ["a"] }, at(0))).toEqual({ t: stamp(0), kind: "import", after: 0, lines: ["a"] });
            expect(recordEvent(KEY, { kind: "reset", lines: ["b"] }, at(1))).not.toBeNull();
            expect(readEvents(KEY).map(detail)).toEqual(["a", "b"]);
            expect(storage.data.size).toBe(0);
        }, storage);
    });

    test("the caps apply to the events a page holds in memory too", async () => {
        const storage = fakeStorage();
        storage.full = true;
        await withEvents(({ recordEvent, readEvents, config }) => {
            for (let i = 0; i < config.EVENTS_MAX + 3; i++) {
                recordEvent(KEY, { kind: "import", lines: [`event ${i}`] }, at(i));
            }
            const read = readEvents(KEY);
            expect(read).toHaveLength(config.EVENTS_MAX);
            expect(read[0].lines[0]).toBe("event 3");
            expect(read.at(-1).lines[0]).toBe(`event ${config.EVENTS_MAX + 2}`);
        }, storage);
    });

    test("a second tab's events are kept: two copies of the module writing to one storage lose nothing", async () => {
        const storage = fakeStorage();
        await inNode(storage, async (domEvents, tab) => {
            const a = await tab().load("events.js");
            const b = await tab().load("events.js");
            const config = await settings(tab());
            a.recordEvent(KEY, { kind: "import", lines: ["from A 1"] }, at(0));
            b.recordEvent(KEY, { kind: "export", lines: ["from B 1"] }, at(1));
            a.recordEvent(KEY, { kind: "reset", lines: ["from A 2"] }, at(2));
            b.recordEvent(KEY, { kind: "reopen", lines: ["from B 2"] }, at(3));
            const expected = ["from A 1", "from B 1", "from A 2", "from B 2"];
            expect(storedEvents(storage, config).map(detail)).toEqual(expected);
            expect(a.readEvents(KEY).map(detail)).toEqual(expected);
            expect(b.readEvents(KEY).map(detail)).toEqual(expected);
        });
    });

    test("two tabs, storage filled and then freed: the next event of each keeps what the other stored", async () => {
        const storage = fakeStorage();
        await inNode(storage, async (domEvents, tab) => {
            const a = await tab().load("events.js");
            const b = await tab().load("events.js");
            const config = await settings(tab());
            let n = 0;
            const record = (m, name) => m.recordEvent(KEY, { kind: "import", lines: [name] }, at(n++));
            record(a, "pre_A");
            record(b, "pre_B");
            storage.full = true;
            for (let i = 1; i <= 4; i++) {
                record(a, `full_A${i}`);
                record(b, `full_B${i}`);
            }
            storage.full = false;
            record(a, "room_A");
            record(b, "after_B");
            const expected = ["pre_A", "pre_B", ...[1, 2, 3, 4].flatMap((i) => [`full_A${i}`, `full_B${i}`]), "room_A", "after_B"];
            expect(storedEvents(storage, config).map(detail)).toEqual(expected);
            expect(a.readEvents(KEY).map(detail)).toEqual(expected);
            expect(b.readEvents(KEY).map(detail)).toEqual(expected);
        });
    });

    test("a tab that could not store keeps showing its own events together with the other tab's", async () => {
        const storage = fakeStorage();
        await inNode(storage, async (domEvents, tab) => {
            const a = await tab().load("events.js");
            const b = await tab().load("events.js");
            const config = await settings(tab());
            storage.full = true;
            a.recordEvent(KEY, { kind: "import", lines: ["held by A"] }, at(0));
            storage.full = false;
            b.recordEvent(KEY, { kind: "export", lines: ["stored by B"] }, at(1));
            expect(storedEvents(storage, config).map(detail)).toEqual(["stored by B"]);
            expect(a.readEvents(KEY).map(detail)).toEqual(["held by A", "stored by B"]);
            expect(b.readEvents(KEY).map(detail)).toEqual(["stored by B"]);
            a.recordEvent(KEY, { kind: "reset", lines: ["A again"] }, at(2));
            expect(storedEvents(storage, config).map(detail)).toEqual(["held by A", "stored by B", "A again"]);
        });
    });
});

test.describe("found in review: storage (in Node)", () => {
    test("room for some events only: the oldest are dropped from the stored copy until the new one fits, and the page keeps them all", async () => {
        const storage = fakeStorage();
        await withEvents(({ recordEvent, readEvents, config }) => {
            const first = recordEvent(KEY, { kind: "import", lines: ["one"] }, at(0));
            const second = recordEvent(KEY, { kind: "export", lines: ["two"] }, at(1));
            // room for two events of this size, not for three
            storage.limit = storedText(storage, config).length + 5;
            const third = recordEvent(KEY, { kind: "reset", lines: ["three"] }, at(2));
            expect(storedEvents(storage, config)).toEqual([second, third]);
            expect(readEvents(KEY)).toEqual([first, second, third]);
            // the next one pushes the oldest stored one out again; the page still has all four
            const fourth = recordEvent(KEY, { kind: "reopen", lines: ["four"] }, at(3));
            expect(storedEvents(storage, config)).toEqual([third, fourth]);
            expect(readEvents(KEY)).toEqual([first, second, third, fourth]);
            // room again: everything this page holds is stored, once
            storage.limit = Infinity;
            const fifth = recordEvent(KEY, { kind: "import", lines: ["five"] }, at(4));
            expect(storedEvents(storage, config)).toEqual([first, second, third, fourth, fifth]);
            expect(readEvents(KEY)).toEqual([first, second, third, fourth, fifth]);
        }, storage);
    });

    test("a value with a later version number was written by a newer release: it is never written over, and new events stay in this page", async () => {
        const storage = fakeStorage();
        await withEvents(({ recordEvent, readEvents, config }) => {
            const newer = JSON.stringify({ v: config.EVENTS_VERSION + 1, events: [{ t: T, kind: "import", after: 0, lines: ["from a newer release"], more: true }] });
            storage.data.set(`${config.EVENTS_PREFIX}${KEY}`, newer);
            expect(readEvents(KEY)).toEqual([]);
            const mine = recordEvent(KEY, { kind: "export", lines: ["mine"] }, at(1));
            expect(mine).toEqual({ t: stamp(1), kind: "export", after: 0, lines: ["mine"] });
            expect(storedText(storage, config)).toBe(newer);
            expect(readEvents(KEY)).toEqual([mine]);
            const next = recordEvent(KEY, { kind: "reset", lines: ["mine too"] }, at(2));
            expect(storedText(storage, config)).toBe(newer);
            expect(readEvents(KEY)).toEqual([mine, next]);
            expect([...storage.data.keys()]).toEqual([`${config.EVENTS_PREFIX}${KEY}`]);
        }, storage);
    });

    test("any number above this release's is a later version, whole or not: the value is never written over", async () => {
        // as stored text, since a number like 1e999 is not one JSON.stringify can write
        for (const v of ["2", "1.5", "1.0000001", "7.25", "1e999", "9007199254740993", "123456789012345678901234567890"]) {
            const storage = fakeStorage();
            await withEvents(({ recordEvent, readEvents, config }) => {
                expect(config.EVENTS_VERSION, "this test is written for version 1").toBe(1);
                const newer = `{"v":${v},"events":[{"t":"${T}","kind":"import","after":0,"lines":["from a newer release"]}]}`;
                expect(JSON.parse(newer).v > config.EVENTS_VERSION, v).toBe(true);
                storage.data.set(`${config.EVENTS_PREFIX}${KEY}`, newer);
                expect(readEvents(KEY), v).toEqual([]);
                const mine = recordEvent(KEY, { kind: "export", lines: ["mine"] }, at(1));
                expect(storedText(storage, config), v).toBe(newer);
                expect(readEvents(KEY), v).toEqual([mine]);
            }, storage);
        }
    });

    test("a version number that is not a later one is not a newer release's: the value reads as no events and is replaced", async () => {
        for (const v of [0, -1, 0.5, "2", "1.5", null, true, [2], { v: 2 }]) {
            const storage = fakeStorage();
            await withEvents(({ recordEvent, readEvents, config }) => {
                storage.data.set(`${config.EVENTS_PREFIX}${KEY}`, JSON.stringify({ v, events: [{ t: T, kind: "import", after: 0, lines: ["old"] }] }));
                expect(readEvents(KEY), JSON.stringify(v)).toEqual([]);
                const mine = recordEvent(KEY, { kind: "export", lines: ["mine"] }, at(1));
                expect(JSON.parse(storedText(storage, config)), JSON.stringify(v)).toEqual({ v: config.EVENTS_VERSION, events: [mine] });
            }, storage);
        }
    });

    test("storage that takes only some of the events gets the most of the newest that fit, whatever that number is", async () => {
        const storage = fakeStorage();
        await withEvents(({ recordEvent, readEvents, config }) => {
            const COUNT = 13;
            // one log for each number of events that will fit: 0 to all but one
            for (let fits = 0; fits < COUNT; fits++) {
                const key = `log-${fits}`;
                storage.limit = Infinity;
                const all = [];
                for (let i = 0; i < COUNT - 1; i++) {
                    all.push(recordEvent(key, { kind: "import", lines: [`event ${String(i).padStart(2, "0")}`] }, at(i)));
                }
                const before = storedText(storage, config, key);
                // the event to come, as it will be stored: every event here is the same length
                const last = { t: stamp(COUNT - 1), kind: "import", after: 0, lines: [`event ${COUNT - 1}`] };
                const textOf = (events) => JSON.stringify({ v: config.EVENTS_VERSION, events });
                // room for exactly `fits` of the newest (with none fitting: not even the newest one)
                storage.limit = fits === 0 ? textOf([last]).length - 1 : textOf([...all, last].slice(-fits)).length;
                expect(recordEvent(key, { kind: "import", lines: last.lines }, at(COUNT - 1)), `fits ${fits}`).toEqual(last);
                if (fits === 0) {
                    // nothing could be written: the stored copy is as it was
                    expect(storedText(storage, config, key), "fits 0").toBe(before);
                } else {
                    expect(storedEvents(storage, config, key), `fits ${fits}`).toEqual([...all, last].slice(-fits));
                }
                expect(readEvents(key), `fits ${fits}`).toEqual([...all, last]);
            }
        }, storage);
    });

    test("storage that refuses everything is asked a few times, not once for every event held", async () => {
        const storage = fakeStorage();
        await withEvents(({ recordEvent, readEvents, config }) => {
            // a full store of events, as another visit left it
            const held = Array.from({ length: config.EVENTS_MAX }, (_, i) => ({ t: stamp(0), kind: "import", after: 0, lines: [`held ${i}`] }));
            const text = JSON.stringify({ v: config.EVENTS_VERSION, events: held });
            storage.data.set(`${config.EVENTS_PREFIX}${KEY}`, text);
            expect(readEvents(KEY)).toHaveLength(config.EVENTS_MAX);
            let asked = 0;
            const setItem = storage.setItem;
            storage.setItem = (key, value) => {
                asked++;
                return setItem(key, value);
            };
            storage.full = true;
            const mine = recordEvent(KEY, { kind: "export", lines: ["mine"] }, at(1));
            expect(mine).toEqual({ t: stamp(1), kind: "export", after: 0, lines: ["mine"] });
            // a first try with all of them, then a search by halves: ten more for a thousand
            const few = 1 + Math.ceil(Math.log2(config.EVENTS_MAX));
            expect(asked).toBeGreaterThan(0);
            expect(asked).toBeLessThanOrEqual(few);
            expect(storedText(storage, config)).toBe(text);
            // the page has them all (the oldest stored one has made room, at the cap)
            const seen = readEvents(KEY);
            expect(seen).toHaveLength(config.EVENTS_MAX);
            expect(seen.at(-1)).toEqual(mine);
            expect(seen[0].lines).toEqual(["held 1"]);
            // the next event costs no more
            asked = 0;
            recordEvent(KEY, { kind: "reset", lines: ["mine too"] }, at(2));
            expect(asked).toBeLessThanOrEqual(few);
            // room again: everything is stored in one write
            storage.full = false;
            asked = 0;
            const third = recordEvent(KEY, { kind: "reopen", lines: ["room"] }, at(3));
            expect(asked).toBe(1);
            const now = storedEvents(storage, config);
            expect(now).toHaveLength(config.EVENTS_MAX);
            expect(now.slice(-3).map(detail)).toEqual(["mine", "mine too", "room"]);
            expect(now.at(-1)).toEqual(third);
        }, storage);
    });

    test("at the cap, with another tab's events of the same second in storage, what goes is not this page's own newest event", async () => {
        const storage = fakeStorage();
        await inNode(storage, async (domEvents, tab) => {
            const a = await tab().load("events.js");
            const config = await settings(tab());
            // this page could not store its event
            storage.full = true;
            const own = a.recordEvent(KEY, { kind: "export", lines: ["this page's own"] }, at(0));
            expect(own).toEqual({ t: stamp(0), kind: "export", after: 0, lines: ["this page's own"] });
            expect(storage.data.size).toBe(0);
            // another tab then stored as many events as the store holds, all in that same second
            storage.full = false;
            const theirs = Array.from({ length: config.EVENTS_MAX }, (_, i) => ({ t: stamp(0), kind: "import", after: 0, lines: [`another tab ${i}`] }));
            storage.data.set(`${config.EVENTS_PREFIX}${KEY}`, JSON.stringify({ v: config.EVENTS_VERSION, events: theirs }));
            // one event too many: the oldest goes, and that is the other tab's first, not the one
            // this page recorded
            const seen = a.readEvents(KEY);
            expect(seen).toHaveLength(config.EVENTS_MAX);
            expect(seen.at(-1)).toEqual(own);
            expect(seen[0].lines).toEqual(["another tab 1"]);
            // the same when this page records again, and it is then stored for good
            const next = a.recordEvent(KEY, { kind: "reset", lines: ["this page's next"] }, at(0));
            const now = storedEvents(storage, config);
            expect(now).toHaveLength(config.EVENTS_MAX);
            expect(now.slice(-2)).toEqual([own, next]);
            expect(now[0].lines).toEqual(["another tab 2"]);
            expect(a.readEvents(KEY)).toEqual(now);
        });
    });

    test("events of different seconds from two tabs are still merged by time, whichever tab holds them", async () => {
        const storage = fakeStorage();
        await inNode(storage, async (domEvents, tab) => {
            const a = await tab().load("events.js");
            const config = await settings(tab());
            storage.full = true;
            a.recordEvent(KEY, { kind: "import", lines: ["A at 1"] }, at(1));
            a.recordEvent(KEY, { kind: "import", lines: ["A at 3"] }, at(3));
            storage.full = false;
            const theirs = [0, 1, 2, 3, 4].map((n) => ({ t: stamp(n), kind: "export", after: 0, lines: [`B at ${n}`] }));
            storage.data.set(`${config.EVENTS_PREFIX}${KEY}`, JSON.stringify({ v: config.EVENTS_VERSION, events: theirs }));
            // within a second, the stored ones first
            expect(a.readEvents(KEY).map(detail)).toEqual(["B at 0", "B at 1", "A at 1", "B at 2", "B at 3", "A at 3", "B at 4"]);
        });
    });

    test("what another tab stored comes before what this page holds, second by second, and seconds stay in order", async () => {
        const storage = fakeStorage();
        await inNode(storage, async (domEvents, tab) => {
            const a = await tab().load("events.js");
            const config = await settings(tab());
            const key = `${config.EVENTS_PREFIX}${KEY}`;
            const their = (n, name) => ({ t: stamp(n), kind: "export", after: 0, lines: [name] });
            const seed = (events) => storage.data.set(key, JSON.stringify({ v: config.EVENTS_VERSION, events }));
            // this page holds p (stored by someone, second 1), then its own m1 (second 1) and m2
            // (second 3), neither stored
            seed([their(1, "p")]);
            storage.full = true;
            a.recordEvent(KEY, { kind: "import", lines: ["m1"] }, at(1));
            a.recordEvent(KEY, { kind: "import", lines: ["m2"] }, at(3));
            expect(a.readEvents(KEY).map(detail)).toEqual(["p", "m1", "m2"]);
            // another tab has stored o1 and o2 in second 1, o3 in second 2, o4 in second 4
            seed([their(1, "o1"), their(1, "p"), their(1, "o2"), their(2, "o3"), their(4, "o4")]);
            expect(a.readEvents(KEY).map(detail)).toEqual(["o1", "o2", "p", "m1", "o3", "m2", "o4"]);
            // and that is what is stored when there is room, by this page's next event
            storage.full = false;
            a.recordEvent(KEY, { kind: "reset", lines: ["m3"] }, at(5));
            expect(storedEvents(storage, config).map(detail)).toEqual(["o1", "o2", "p", "m1", "o3", "m2", "o4", "m3"]);
        });
    });

    test("the known limit: two tabs in one second while one could not store. Nothing is lost or doubled, and the other seconds are in order", async () => {
        const storage = fakeStorage();
        await inNode(storage, async (domEvents, tab) => {
            const a = await tab().load("events.js");
            const b = await tab().load("events.js");
            const config = await settings(tab());
            // second 4: an event of each tab, stored. Second 5: A stores a1; B cannot store b1 and
            // holds a copy of a1 with it; A stores a2. Second 6: an event of each tab.
            a.recordEvent(KEY, { kind: "import", lines: ["a0"] }, at(4));
            b.recordEvent(KEY, { kind: "import", lines: ["b0"] }, at(4));
            a.recordEvent(KEY, { kind: "import", lines: ["a1"] }, at(5));
            storage.full = true;
            b.recordEvent(KEY, { kind: "import", lines: ["b1"] }, at(5));
            storage.full = false;
            a.recordEvent(KEY, { kind: "import", lines: ["a2"] }, at(5));
            expect(storedEvents(storage, config).map(detail)).toEqual(["a0", "b0", "a1", "a2"]);
            const inSecond5 = (list) => list.slice(2, 5);
            const check = (list, what) => {
                // every event once; the seconds in order; within second 5 the order is not promised
                expect(list.slice(0, 2), what).toEqual(["a0", "b0"]);
                expect([...inSecond5(list)].sort(), what).toEqual(["a1", "a2", "b1"]);
                expect(list.slice(5), what).toEqual(list.length > 5 ? ["a3", "b3"].slice(0, list.length - 5) : []);
            };
            const first = b.readEvents(KEY).map(detail);
            expect(first).toHaveLength(5);
            check(first, "B's list");
            expect(b.readEvents(KEY).map(detail), "the same at the next read").toEqual(first);
            a.recordEvent(KEY, { kind: "import", lines: ["a3"] }, at(6));
            b.recordEvent(KEY, { kind: "import", lines: ["b3"] }, at(6));
            // B has stored its list: both tabs now read the same one
            const stored = storedEvents(storage, config).map(detail);
            expect(stored).toHaveLength(7);
            check(stored, "stored");
            expect(a.readEvents(KEY).map(detail)).toEqual(stored);
            expect(b.readEvents(KEY).map(detail)).toEqual(stored);
        });
    });

    test("when the stored order and this page's own disagree, nothing is lost or doubled, and each list keeps its own order", async () => {
        const storage = fakeStorage();
        await inNode(storage, async (domEvents, tab) => {
            const a = await tab().load("events.js");
            const config = await settings(tab());
            const key = `${config.EVENTS_PREFIX}${KEY}`;
            const their = (name) => ({ t: stamp(1), kind: "export", after: 0, lines: [name] });
            const seed = (events) => storage.data.set(key, JSON.stringify({ v: config.EVENTS_VERSION, events }));
            // this page comes to hold p then q (both stored by others) and its own m, all in one second
            seed([their("p"), their("q")]);
            storage.full = true;
            a.recordEvent(KEY, { kind: "import", lines: ["m"] }, at(1));
            expect(a.readEvents(KEY).map(detail)).toEqual(["p", "q", "m"]);
            // the stored copy is then rewritten the other way round, with two more events in it
            seed([their("q"), their("x"), their("p"), their("y")]);
            const seen = a.readEvents(KEY).map(detail);
            expect([...seen].sort()).toEqual(["m", "p", "q", "x", "y"]);
            expect(seen).toEqual(["x", "y", "p", "q", "m"]);
        });
    });

    for (const [what, other] of [
        // (a second earlier, so that the other tab's event comes first here too)
        ["its time", { t: stamp(-1) }],
        ["its lines", { lines: ["file: two.csv"] }],
        ["its count of queries (after)", { after: 1 }],
        ["its kind", { kind: "export" }],
    ]) {
        test(`an event of another tab that differs from this page's own only in ${what} is another event: both are kept`, async () => {
            const storage = fakeStorage();
            await inNode(storage, async (domEvents, tab) => {
                const a = await tab().load("events.js");
                const config = await settings(tab());
                storage.full = true;
                const own = a.recordEvent(KEY, { kind: "import", lines: ["file: one.csv"] }, at(0));
                expect(own).toEqual({ t: stamp(0), kind: "import", after: 0, lines: ["file: one.csv"] });
                storage.full = false;
                const theirs = { ...own, ...other };
                storage.data.set(`${config.EVENTS_PREFIX}${KEY}`, JSON.stringify({ v: config.EVENTS_VERSION, events: [theirs] }));
                expect(a.readEvents(KEY)).toEqual([theirs, own]);
                const next = a.recordEvent(KEY, { kind: "reset", lines: ["next"] }, at(1));
                expect(storedEvents(storage, config)).toEqual([theirs, own, next]);
            });
        });
    }

    test("equal events are matched one to one: a second equal one in storage, or in this page, is a second event", async () => {
        const storage = fakeStorage();
        await inNode(storage, async (domEvents, tab) => {
            const config = await settings(tab());
            const key = `${config.EVENTS_PREFIX}${KEY}`;
            const x = { t: stamp(0), kind: "reset", after: 0, lines: ["database reset"] };
            const seed = (events) => storage.data.set(key, JSON.stringify({ v: config.EVENTS_VERSION, events }));
            // this page holds one x; two are stored
            const a = await tab().load("events.js");
            storage.full = true;
            expect(a.recordEvent(KEY, { kind: "reset", lines: ["database reset"] }, at(0))).toEqual(x);
            storage.full = false;
            seed([x, x]);
            expect(a.readEvents(KEY)).toEqual([x, x]);
            seed([x, x, x]);
            expect(a.readEvents(KEY)).toEqual([x, x, x]);
            // this page holds two; one is stored
            storage.data.clear();
            const b = await tab().load("events.js");
            storage.full = true;
            b.recordEvent(KEY, { kind: "reset", lines: ["database reset"] }, at(0));
            b.recordEvent(KEY, { kind: "reset", lines: ["database reset"] }, at(0));
            storage.full = false;
            expect(b.readEvents(KEY)).toEqual([x, x]);
            seed([x]);
            expect(b.readEvents(KEY)).toEqual([x, x]);
            // the known limit, kept on purpose: one held here and an equal one that another tab
            // stored afterwards cannot be told apart, and count as one
            storage.data.clear();
            const c = await tab().load("events.js");
            storage.full = true;
            c.recordEvent(KEY, { kind: "reset", lines: ["database reset"] }, at(0));
            storage.full = false;
            seed([x]);
            expect(c.readEvents(KEY)).toEqual([x]);
            // while one that was stored before this page recorded its own is known to be another
            const d = await tab().load("events.js");
            storage.full = true;
            d.recordEvent(KEY, { kind: "reset", lines: ["database reset"] }, at(0));
            storage.full = false;
            expect(d.readEvents(KEY)).toEqual([x, x]);
        });
    });

    test("with no log key there are no events to read, and no key is looked up", async () => {
        const storage = fakeStorage();
        await withEvents(({ readEvents, config }) => {
            // what a store would hold under the text of such a key
            for (const name of ["null", "undefined", ""]) {
                storage.data.set(`${config.EVENTS_PREFIX}${name}`, JSON.stringify({ v: config.EVENTS_VERSION, events: [{ t: T, kind: "import", after: 0, lines: ["x"] }] }));
            }
            let read = 0;
            const getItem = storage.getItem;
            storage.getItem = (key) => {
                read++;
                return getItem(key);
            };
            for (const key of [null, undefined, "", 0, {}, ["northlight"]]) {
                expect(readEvents(key), String(key)).toEqual([]);
            }
            expect(read).toBe(0);
        }, storage);
    });

    test("a time that a stamp cannot hold gives null and stores nothing", async () => {
        await withEvents(({ recordEvent, readEvents, storage }) => {
            for (const when of [new Date("+010000-01-01T00:00:00Z"), new Date("-000001-12-31T23:59:59Z"), new Date(NaN)]) {
                expect(recordEvent(KEY, { kind: "import", lines: ["a"] }, when), String(when)).toBeNull();
            }
            expect(storage.data.size).toBe(0);
            expect(readEvents(KEY)).toEqual([]);
        });
    });
});

test.describe("what readEvents returns is a copy (in Node)", () => {
    test("changing the events it returned changes nothing that is stored, nor what it returns next", async () => {
        await withEvents(({ recordEvent, readEvents, config, storage }) => {
            recordEvent(KEY, { kind: "import", lines: ["one", "two"] }, at(0));
            recordEvent(KEY, { kind: "export", lines: ["three"] }, at(1));
            const text = storedText(storage, config);
            const first = readEvents(KEY);
            first[0].lines.push("added");
            first[0].lines[0] = "changed";
            first[0].kind = "reset";
            first[0].after = 99;
            first[0].t = "x";
            first[1].lines.length = 0;
            first.pop();
            first.push({ junk: true });
            expect(storedText(storage, config)).toBe(text);
            expect(readEvents(KEY)).toEqual([
                { t: stamp(0), kind: "import", after: 0, lines: ["one", "two"] },
                { t: stamp(1), kind: "export", after: 0, lines: ["three"] },
            ]);
        });
    });

    test("the same for events held in memory because storage refused them", async () => {
        const storage = fakeStorage();
        storage.full = true;
        await withEvents(({ recordEvent, readEvents }) => {
            recordEvent(KEY, { kind: "import", lines: ["one", "two"] }, at(0));
            const first = readEvents(KEY);
            first[0].lines.push("added");
            first[0].kind = "reset";
            first.length = 0;
            expect(readEvents(KEY)).toEqual([{ t: stamp(0), kind: "import", after: 0, lines: ["one", "two"] }]);
        }, storage);
    });

    test("changing the event recordEvent returned changes nothing that is stored", async () => {
        await withEvents(({ recordEvent, readEvents, config, storage }) => {
            const lines = ["one", "two"];
            const result = recordEvent(KEY, { kind: "import", lines }, at(0));
            const text = storedText(storage, config);
            result.lines.push("added");
            result.kind = "reset";
            expect(storedText(storage, config)).toBe(text);
            // nor does changing the array the caller passed in
            lines.push("later");
            lines[0] = "changed";
            expect(readEvents(KEY)).toEqual([{ t: stamp(0), kind: "import", after: 0, lines: ["one", "two"] }]);
        });
    });
});

test.describe("timeline (in Node, pure)", () => {
    const names = (rows) => rows.map((r) => (r.sql ? r.sql.slice(8, -2) : `<${r.lines[0]}>`));
    // queries a, b, c in the second T
    const trio = () => [query(T, "a"), query(T, "b"), query(T, "c")];

    test("with no events the queries come back unchanged and in order: the same objects", async () => {
        await withEvents(({ timeline }) => {
            const queries = [query(stamp(0), "a"), query(stamp(0), "b"), query(stamp(3), "c"), query(stamp(9), "d")];
            const result = timeline(queries, []);
            expect(result).toHaveLength(4);
            result.forEach((row, i) => expect(row).toBe(queries[i]));
            expect(timeline([], [])).toEqual([]);
        });
    });

    test("an event goes after the first `after` queries of its own second: 0, 1 and 2 with three queries in that second", async () => {
        await withEvents(({ timeline }) => {
            const queries = trio();
            expect(names(timeline(queries, [event(T, 0)]))).toEqual(["<line of e>", "a", "b", "c"]);
            expect(names(timeline(queries, [event(T, 1)]))).toEqual(["a", "<line of e>", "b", "c"]);
            expect(names(timeline(queries, [event(T, 2)]))).toEqual(["a", "b", "<line of e>", "c"]);
            expect(names(timeline(queries, [event(T, 3)]))).toEqual(["a", "b", "c", "<line of e>"]);
        });
    });

    test("only the queries of the event's own second are counted: other seconds around them do not move it", async () => {
        await withEvents(({ timeline }) => {
            const queries = [query(stamp(-5), "p"), query(stamp(-1), "q"), query(T, "a"), query(T, "b"), query(stamp(1), "c"), query(stamp(7), "d")];
            expect(names(timeline(queries, [event(T, 0)]))).toEqual(["p", "q", "<line of e>", "a", "b", "c", "d"]);
            expect(names(timeline(queries, [event(T, 1)]))).toEqual(["p", "q", "a", "<line of e>", "b", "c", "d"]);
            expect(names(timeline(queries, [event(T, 2)]))).toEqual(["p", "q", "a", "b", "<line of e>", "c", "d"]);
        });
    });

    test("when `after` is more than the queries of that second still there, the event goes after all of them", async () => {
        await withEvents(({ timeline }) => {
            const queries = [query(stamp(-1), "p"), query(T, "a"), query(stamp(1), "c"), query(stamp(2), "d")];
            for (const after of [1, 2, 3, 50]) {
                expect(names(timeline(queries, [event(T, after)])), `after ${after}`).toEqual(["p", "a", "<line of e>", "c", "d"]);
            }
            // and at the very end of the log
            expect(names(timeline([query(T, "a")], [event(T, 3)]))).toEqual(["a", "<line of e>"]);
            expect(names(timeline(trio(), [event(T, 1000)]))).toEqual(["a", "b", "c", "<line of e>"]);
        });
    });

    test("with no query in its second, an event goes before the first query of a later second", async () => {
        await withEvents(({ timeline }) => {
            const queries = [query(stamp(-4), "p"), query(stamp(-2), "q"), query(stamp(3), "r"), query(stamp(3), "s"), query(stamp(8), "t")];
            expect(names(timeline(queries, [event(T, 0)]))).toEqual(["p", "q", "<line of e>", "r", "s", "t"]);
            // whatever its `after`
            expect(names(timeline(queries, [event(T, 2)]))).toEqual(["p", "q", "<line of e>", "r", "s", "t"]);
            // before every query
            expect(names(timeline(queries, [event(stamp(-9), 0)]))).toEqual(["<line of e>", "p", "q", "r", "s", "t"]);
            // between the last two seconds
            expect(names(timeline(queries, [event(stamp(5), 0)]))).toEqual(["p", "q", "r", "s", "<line of e>", "t"]);
        });
    });

    test("with no query in its second and all queries earlier, an event goes after everything", async () => {
        await withEvents(({ timeline }) => {
            const queries = [query(stamp(-4), "p"), query(stamp(-2), "q")];
            expect(names(timeline(queries, [event(T, 0)]))).toEqual(["p", "q", "<line of e>"]);
            expect(names(timeline(queries, [event(stamp(100), 4)]))).toEqual(["p", "q", "<line of e>"]);
        });
    });

    test("with no queries at all the events come out alone, in time order, those of one second as stored", async () => {
        await withEvents(({ timeline }) => {
            const events = [event(stamp(5), 0, "late"), event(stamp(1), 2, "early"), event(stamp(5), 0, "same"), event(stamp(3), 9, "mid")];
            expect(names(timeline([], events))).toEqual(["<line of early>", "<line of mid>", "<line of late>", "<line of same>"]);
            // the stored list is not put in order: the caller's array is as it was
            expect(events.map((e) => e.lines[0])).toEqual(["line of late", "line of early", "line of same", "line of mid"]);
        });
    });

    test("two events in the same place keep their stored order", async () => {
        await withEvents(({ timeline }) => {
            const queries = trio();
            expect(names(timeline(queries, [event(T, 1, "x"), event(T, 1, "y")]))).toEqual(["a", "<line of x>", "<line of y>", "b", "c"]);
            expect(names(timeline(queries, [event(T, 1, "y"), event(T, 1, "x")]))).toEqual(["a", "<line of y>", "<line of x>", "b", "c"]);
            // events of one second and after-counts beyond the second: all at the end, as stored
            expect(names(timeline(queries, [event(T, 3, "x"), event(T, 7, "y"), event(T, 3, "z")]))).toEqual(["a", "b", "c", "<line of x>", "<line of y>", "<line of z>"]);
        });
    });

    test("events that land in the same place by different rules come out in time order, however they were stored", async () => {
        await withEvents(({ timeline }) => {
            const queries = [query(stamp(0), "p"), query(stamp(10), "q")];
            // both go before q: one by its second (after 0 of q's second), the other by having no query
            const events = [event(stamp(10), 0, "inside"), event(stamp(5), 0, "gap")];
            expect(names(timeline(queries, events))).toEqual(["p", "<line of gap>", "<line of inside>", "q"]);
            expect(names(timeline(queries, events.slice().reverse()))).toEqual(["p", "<line of gap>", "<line of inside>", "q"]);
        });
    });

    test("an `after` that is not a count is taken as 0, and nothing throws", async () => {
        await withEvents(({ timeline }) => {
            for (const after of [NaN, -1, -0.5, 1.5, Infinity, "2", null, undefined, {}]) {
                const result = timeline(trio(), [{ t: T, kind: "import", after, lines: ["x"] }]);
                expect(names(result), String(after)).toEqual(["<x>", "a", "b", "c"]);
            }
        });
    });

    test("an event comes out as {t, kind, lines}, with no `after`; the queries come out as they are", async () => {
        await withEvents(({ timeline }) => {
            const queries = [query(T, "a")];
            const events = [{ t: T, kind: "export", after: 1, lines: ["file: a.csv", "table: a, 3 rows"] }];
            const result = timeline(queries, events);
            expect(result).toHaveLength(2);
            expect(result[0]).toBe(queries[0]);
            expect(result[1]).toStrictEqual({ t: T, kind: "export", lines: ["file: a.csv", "table: a, 3 rows"] });
            expect(Object.keys(result[1])).toEqual(["t", "kind", "lines"]);
        });
    });

    test("the inputs are not changed", async () => {
        await withEvents(({ timeline }) => {
            const queries = [query(T, "a"), query(stamp(2), "b")];
            const events = [event(T, 0, "x"), event(stamp(1), 0, "y")];
            const queriesCopy = JSON.parse(JSON.stringify(queries));
            const eventsCopy = JSON.parse(JSON.stringify(events));
            const result = timeline(queries, events);
            expect(queries).toEqual(queriesCopy);
            expect(events).toEqual(eventsCopy);
            // changing what came out does not change the events that went in
            result.find((r) => r.kind).lines.push("added");
            expect(events).toEqual(eventsCopy);
        });
    });

    test("a mix of everything gives one sequence: queries and events of several seconds", async () => {
        await withEvents(({ timeline }) => {
            const queries = [query(stamp(0), "a"), query(stamp(0), "b"), query(stamp(0), "c"), query(stamp(1), "d"), query(stamp(4), "e"), query(stamp(4), "f")];
            const events = [event(stamp(0), 1, "one"), event(stamp(0), 1, "two"), event(stamp(0), 3, "three"), event(stamp(2), 0, "four"), event(stamp(4), 0, "five"), event(stamp(4), 2, "six"), event(stamp(9), 0, "seven")];
            expect(names(timeline(queries, events))).toEqual([
                "a",
                "<line of one>",
                "<line of two>",
                "b",
                "c",
                "<line of three>",
                "d",
                "<line of four>",
                "<line of five>",
                "e",
                "f",
                "<line of six>",
                "<line of seven>",
            ]);
        });
    });

    test("the queries' relative order never changes, and every query and event appears once, whatever the events", async () => {
        await withEvents(({ timeline }) => {
            // a small deterministic generator, so a failure can be run again
            let seed = 12345;
            const random = (n) => {
                seed = (seed * 1103515245 + 12345) & 0x7fffffff;
                return seed % n;
            };
            for (let round = 0; round < 300; round++) {
                const queries = [];
                let second = random(3);
                for (let i = random(12); i > 0; i--) {
                    second += random(3) === 0 ? random(3) : 0;
                    queries.push(query(stamp(second), `q${queries.length}`));
                }
                const events = Array.from({ length: random(8) }, (_, i) => event(stamp(random(second + 4) - 1), random(5), `e${i}`));
                const result = timeline(queries, events);
                expect(result.filter((r) => r.sql)).toHaveLength(queries.length);
                result.filter((r) => r.sql).forEach((r, i) => expect(r, `round ${round}`).toBe(queries[i]));
                expect(result.filter((r) => r.kind).map((r) => r.lines[0]).sort(), `round ${round}`).toEqual(events.map((e) => e.lines[0]).sort());
                expect(result).toHaveLength(queries.length + events.length);
            }
        });
    });
});

test.describe("in the page", () => {
    test("recordEvent through the bundle writes its key in the page's localStorage, and no other key appears", async ({ page, app }) => {
        await app.open(NORTHLIGHT_URL);
        await app.query("SELECT 1;");
        const prefix = (await import(configUrl)).EVENTS_PREFIX;
        const keys = () => page.evaluate(() => Object.keys(localStorage).sort());
        const before = await keys();
        const result = await page.evaluate(async () => {
            const { events } = await import("./bundle/app.js");
            const stored = events.recordEvent("northlight", { kind: "import", lines: ["file: sales.csv, 2128 bytes", "table: sales, 22 rows, 13 columns"] }, new Date("2026-11-15T10:02:11.987Z"));
            return { stored, read: events.readEvents("northlight"), raw: localStorage.getItem("sqllab.events.northlight") };
        });
        const expected = { t: "2026-11-15T10:02:11Z", kind: "import", after: 0, lines: ["file: sales.csv, 2128 bytes", "table: sales, 22 rows, 13 columns"] };
        expect(prefix).toBe("sqllab.events.");
        expect(result.stored).toEqual(expected);
        expect(result.read).toEqual([expected]);
        expect(JSON.parse(result.raw)).toEqual({ v: 1, events: [expected] });
        expect(await keys()).toEqual([...before, `${prefix}northlight`].sort());
        // a second page of the same site sees it (it is in the real storage)
        const stored = await page.evaluate((key) => localStorage.getItem(key), `${prefix}northlight`);
        expect(JSON.parse(stored).events).toEqual([expected]);
    });

    test("the History tab still lists only queries, and the run log's stored value is the queries alone", async ({ page, app }) => {
        await app.open(NORTHLIGHT_URL);
        await app.query("SELECT 11 AS a;");
        await app.query("SELECT 22 AS b;");
        const logBefore = await page.evaluate(() => localStorage.getItem("sqllab.log.northlight"));
        await page.evaluate(async () => {
            const { events } = await import("./bundle/app.js");
            events.recordEvent("northlight", { kind: "import", lines: ["file: unique_marker_file.csv, 10 bytes"] });
            events.recordEvent("northlight", { kind: "reset", lines: ["database reset unique_marker_reset"] });
        });
        await app.openHistory();
        await expect(app.historyEntries).toHaveCount(2);
        await expect(app.historyList).not.toContainText("unique_marker");
        await expect(app.historyList).not.toContainText("event");
        expect(await page.evaluate(() => localStorage.getItem("sqllab.log.northlight"))).toBe(logBefore);
        expect((await app.readLog("northlight")).map((e) => e.sql)).toEqual(["SELECT 11 AS a;", "SELECT 22 AS b;"]);
        // a Run after the events still appends to the run log and leaves the events alone
        await app.query("SELECT 33 AS c;");
        await expect(app.historyEntries).toHaveCount(3);
        const events = await page.evaluate(async () => (await import("./bundle/app.js")).events.readEvents("northlight"));
        expect(events.map((e) => e.kind)).toEqual(["import", "reset"]);
        expect(events.map((e) => e.after)).toEqual([expect.any(Number), expect.any(Number)]);
    });
});
