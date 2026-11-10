// The exercise checker: spec section 5, "Checking semantics" and "Feedback on failure". No DOM.
//
// Exports, pure part (also usable on its own):
//   normalizeValue(value) -> JSON-safe value
//       INTEGER and TEXT exact; REAL rounded to 6 decimal places; NULL only equals NULL;
//       BLOB by bytes. JS numbers do not distinguish 3 from 3.0, so an integer-valued
//       number is an integer and any other number is rounded: 3.0 equals 3 and 2.0000001
//       equals 2. BigInt (integers beyond the safe range) is exact. Tagged forms keep types
//       apart in the JSON: {"$blob": hex}, {"$int": digits} (a BigInt, and an integer-valued
//       number beyond the safe range up to 64 bits, so they agree), {"$real": "Infinity" |
//       "-Infinity" | "NaN"} (JSON would turn those into null, which would equal NULL).
//       Text "3" and integer 3 differ; NULL and "" differ.
//   normalizeRow(row) -> array of normalised values
//   serializeRow(row) -> JSON text of the normalised row (what is compared and sorted)
//   displayValue(value) -> string, as a reader expects: NULL, a REAL as its rounded value,
//       BLOB as x'<hex>', text as is (cut at DIFF_MAX_CELL_CHARS)
//   compareResults(expected, got, {orderMatters, checkColumnNames}) -> outcome
//       expected and got are {columns, values}. First applicable rule wins: column count,
//       column names (only if checkColumnNames, case-insensitive, in order), row count,
//       the first differing row. orderMatters false compares multisets: each normalised
//       row is serialised to JSON, the serialised rows are sorted with the default
//       code-unit sort, and the arrays are compared; true compares sequences.
//
// Export, the checker:
//   createChecker() -> {check(set, exercise, sql), clearCache()}
//       Make one per page (the model-result cache lives in it). check never throws and
//       returns a Promise of an outcome:
//         {status: "pass"}
//         {status: "fail", kind, message, ...}   kind is one of
//             "sql"          message = the engine's message, verbatim (engineMessage)
//             "columns"      "expected N columns, got M"   (also for no result columns: M = 0)
//             "column-name"  the first mismatching column; also {position, expected, got}
//             "rows"         "expected N rows, got M"
//             "row"          the first differing row; also {rowIndex (1-based), sorted
//                            (index counts sorted rows), columns (the model's names),
//                            gotColumns, expected, got}: expected and got are arrays of at
//                            most DIFF_MAX_ROWS rows of display strings, from rowIndex.
//         {status: "unavailable", reason, message}   the exercise cannot be checked; reason is
//             "model" (the model query fails: an authoring bug; nothing about it is
//             reported), "dataset" (the open pristine dataset is not the set's) or "internal".
//             The message is generic and holds no model-query text or engine text. "internal"
//             says that a reload may help; the other two point at the instructor or the dataset.
//       `message` of a "row" failure is multi-line plain text: the headline and the diff
//       ("expected:" / "got:" with "row N: a | b" lines). `message` can hold student text
//       (column names, values, the engine's wording of their error): use textContent.
//
// Known limits of the comparison (decisions, not bugs):
//   - INTEGER 3 and REAL 3.0 compare equal, and so do REAL values that agree to 6 dp, because
//     runSql hands over JS numbers. A student whose AVG returns 450.0 passes against a model
//     returning 450 (friendlier, and the spec rounds REAL anyway).
//   - Two TEXT values that are different invalid UTF-8 byte sequences compare equal: the
//     engine's text read decodes both to U+FFFD. Teaching data is valid UTF-8, so this is
//     not worth reading every TEXT cell as bytes.
//
// How a check runs: it opens two connections from getPristineBytes() with
// manager.init(name, new DatabasePath(bytes, "binary")), one for the student's SQL and a
// separate one for the model query, and closes both afterwards, even on failure. Earlier
// student changes to the working database therefore cannot reach a check, and neither
// query can affect the other. Both go through runSql, so the student's SQL is treated
// exactly as in a visible Run (the last statement with result columns). The model result is
// cached per exercise for the page; a failure is not cached. The model query stays inside
// this module: it never goes into an outcome, a log or the DOM.

import {
    CHECK_BROKEN_MESSAGE,
    CHECK_INTERNAL_MESSAGE,
    CHECK_NO_DATASET_MESSAGE,
    DIFF_MAX_CELL_CHARS,
    DIFF_MAX_ROWS,
    checkColumnNameMessage,
    checkColumnsMessage,
    checkRowMessage,
    checkRowsMessage,
} from "./config.js";
import { getPristineBytes, getPristineId } from "./datasets.js";
import { DatabasePath } from "../db-path.js";
import manager from "../sqlite/manager.js";
import { engineMessage, runSql } from "./runner.js";

// ---- normalising -----------------------------------------------------------------------

const INT64_MIN = -(2n ** 63n);
const INT64_MAX = 2n ** 63n - 1n;

function toHex(bytes) {
    let hex = "";
    for (const byte of bytes) {
        hex += byte.toString(16).padStart(2, "0");
    }
    return hex;
}

export function normalizeValue(value) {
    if (value === null || value === undefined) {
        return null;
    }
    if (typeof value === "bigint") {
        return { $int: value.toString() };
    }
    if (typeof value === "number") {
        if (Number.isNaN(value)) {
            return { $real: "NaN" };
        }
        if (!Number.isFinite(value)) {
            return { $real: value > 0 ? "Infinity" : "-Infinity" };
        }
        const rounded = Number(value.toFixed(6));
        // -0 prints as 0 in JSON already
        if (Number.isInteger(rounded) && !Number.isSafeInteger(rounded)) {
            // an integer-valued REAL beyond 2^53: equal to the same INTEGER, which arrives
            // as a BigInt, as far as 64 bits go
            const big = BigInt(rounded);
            if (big >= INT64_MIN && big <= INT64_MAX) {
                return { $int: big.toString() };
            }
        }
        return rounded;
    }
    if (value instanceof Uint8Array) {
        return { $blob: toHex(value) };
    }
    if (value instanceof ArrayBuffer) {
        return { $blob: toHex(new Uint8Array(value)) };
    }
    return String(value);
}

export function normalizeRow(row) {
    return Array.from(row, normalizeValue);
}

export function serializeRow(row) {
    return JSON.stringify(normalizeRow(row));
}

export function displayValue(value) {
    let text;
    if (value === null || value === undefined) {
        return "NULL";
    }
    if (typeof value === "bigint") {
        text = value.toString();
    } else if (typeof value === "number") {
        text = String(Number.isFinite(value) ? Number(value.toFixed(6)) : value);
    } else if (value instanceof Uint8Array || value instanceof ArrayBuffer) {
        text = `x'${toHex(value instanceof Uint8Array ? value : new Uint8Array(value))}'`;
    } else {
        text = String(value);
    }
    return text.length > DIFF_MAX_CELL_CHARS ? `${text.slice(0, DIFF_MAX_CELL_CHARS)}…` : text;
}

// ---- comparing -------------------------------------------------------------------------

const compareCodeUnits = (a, b) => (a < b ? -1 : a > b ? 1 : 0);

export function compareResults(expected, got, { orderMatters = false, checkColumnNames = false } = {}) {
    const fail = (kind, message, extra = {}) => ({ status: "fail", kind, message, ...extra });

    // 2. column count, always
    if (expected.columns.length !== got.columns.length) {
        return fail("columns", checkColumnsMessage(expected.columns.length, got.columns.length));
    }
    // 3. column names, if the exercise asks for them
    if (checkColumnNames) {
        for (let i = 0; i < expected.columns.length; i++) {
            if (expected.columns[i].toLowerCase() !== got.columns[i].toLowerCase()) {
                return fail("column-name", checkColumnNameMessage(i + 1, expected.columns[i], got.columns[i]), {
                    position: i + 1,
                    expected: expected.columns[i],
                    got: got.columns[i],
                });
            }
        }
    }
    // 4. row count
    if (expected.values.length !== got.values.length) {
        return fail("rows", checkRowsMessage(expected.values.length, got.values.length));
    }
    // 5. the first differing row
    const want = prepareRows(expected.values, orderMatters);
    const have = prepareRows(got.values, orderMatters);
    let first = -1;
    for (let i = 0; i < want.length; i++) {
        if (want[i].key !== have[i].key) {
            first = i;
            break;
        }
    }
    if (first === -1) {
        return { status: "pass" };
    }
    const shown = (rows) =>
        rows.slice(first, first + DIFF_MAX_ROWS).map((r) => Array.from(r.row, displayValue));
    const wantShown = shown(want);
    const haveShown = shown(have);
    const sorted = !orderMatters;
    return fail("row", rowMessage(first + 1, sorted, wantShown, haveShown), {
        rowIndex: first + 1,
        sorted,
        columns: [...expected.columns],
        gotColumns: [...got.columns],
        expected: wantShown,
        got: haveShown,
    });
}

// prepareRows pairs each row with its serialised form, sorted by it unless order matters.
function prepareRows(values, orderMatters) {
    const rows = values.map((row) => ({ row, key: serializeRow(row) }));
    return orderMatters ? rows : rows.sort((a, b) => compareCodeUnits(a.key, b.key));
}

function rowMessage(position, sorted, expectedRows, gotRows) {
    const lines = [checkRowMessage(position, sorted)];
    for (const [label, rows] of [
        ["expected:", expectedRows],
        ["got:", gotRows],
    ]) {
        lines.push(label);
        rows.forEach((cells, i) => lines.push(`  row ${position + i}: ${cells.join(" | ")}`));
    }
    return lines.join("\n");
}

// ---- running ---------------------------------------------------------------------------

const unavailable = (reason, message) => ({ status: "unavailable", reason, message });

// connect opens a connection on a copy of the pristine bytes. Returns null on any failure.
async function connect(name, bytes) {
    try {
        const database = await manager.init(name, new DatabasePath(bytes, "binary"));
        return database ?? null;
    } catch {
        return null;
    }
}

function disconnect(database) {
    try {
        database?.db.close();
    } catch {
        // nothing to do: the connection is gone either way
    }
}

// what modelResult gives when no connection could be opened (not the exercise's fault)
const NO_CONNECTION = Symbol("no connection");

export function createChecker() {
    // "<set>/<exercise>" -> {query, dataset, promise of a model result or null}
    const cache = new Map();

    // modelResult returns the model's {columns, values}, null if the model query fails, or
    // NO_CONNECTION if a connection could not be opened. Neither failure is cached.
    function modelResult(set, exercise, bytes) {
        const key = `${set.id}/${exercise.id}`;
        const query = exercise.model_query;
        const hit = cache.get(key);
        if (hit && hit.query === query && hit.dataset === set.dataset) {
            return hit.promise;
        }
        const promise = (async () => {
            const database = await connect("model.db", bytes);
            if (!database) {
                return NO_CONNECTION;
            }
            try {
                // a model query with no result columns is an authoring bug too (null)
                return runSql(database, query);
            } catch {
                // an authoring bug; what the engine says about it is not reported
                console.warn(`exercise "${key}" cannot be checked: its model query fails`);
                return null;
            } finally {
                disconnect(database);
            }
        })().then((result) => {
            if ((result === null || result === NO_CONNECTION) && cache.get(key)?.promise === promise) {
                cache.delete(key); // a failure is not cached
            }
            return result;
        });
        cache.set(key, { query, dataset: set.dataset, promise });
        return promise;
    }

    async function check(set, exercise, sql) {
        try {
            const dataset = getPristineId();
            if (dataset === null || dataset !== set.dataset) {
                return unavailable("dataset", CHECK_NO_DATASET_MESSAGE);
            }
            // copies are taken together, before any await, so a dataset switch in the
            // middle of a check cannot mix two datasets
            const studentBytes = getPristineBytes();
            const modelBytes = getPristineBytes();
            if (!studentBytes || !modelBytes) {
                return unavailable("dataset", CHECK_NO_DATASET_MESSAGE);
            }

            const expected = await modelResult(set, exercise, modelBytes);
            if (expected === NO_CONNECTION) {
                return unavailable("internal", CHECK_INTERNAL_MESSAGE);
            }
            if (expected === null) {
                return unavailable("model", CHECK_BROKEN_MESSAGE);
            }

            const database = await connect("check.db", studentBytes);
            if (!database) {
                return unavailable("internal", CHECK_INTERNAL_MESSAGE);
            }
            let got;
            try {
                got = runSql(database, sql) ?? { columns: [], values: [] };
            } catch (exc) {
                return { status: "fail", kind: "sql", message: engineMessage(exc) };
            } finally {
                disconnect(database);
            }
            return compareResults(expected, got, {
                orderMatters: exercise.order_matters === true,
                checkColumnNames: exercise.check_column_names === true,
            });
        } catch {
            return unavailable("internal", CHECK_INTERNAL_MESSAGE);
        }
    }

    return { check, clearCache: () => cache.clear() };
}
