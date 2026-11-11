// The sample queries of the results pane's empty state (UI plan, section 5): the open course
// database's own ("samples" in datasets/manifest.json, js/lab/datasets.js validates them), at most
// MAX_SAMPLES; for any other database with a table, its first table's first rows; none for a
// database with no table.
//
//   samplesFor(dataset, database) -> [{label, sql}]
//       dataset is the manifest entry of the open database, or null (an upload, a URL, the empty
//       database). The first table is read again each time (the student may have created one).

import { MAX_SAMPLES, firstRowsSampleLabel } from "./config.js";
import { identifierForSql } from "./sql.js";

export function samplesFor(dataset, database) {
    if (dataset?.samples?.length) {
        return dataset.samples.slice(0, MAX_SAMPLES);
    }
    let table = null;
    try {
        table = database?.gatherTables()[0] ?? null;
    } catch {
        table = null;
    }
    return table ? [{ label: firstRowsSampleLabel(table), sql: `SELECT * FROM ${identifierForSql(table)} LIMIT 10;` }] : [];
}
