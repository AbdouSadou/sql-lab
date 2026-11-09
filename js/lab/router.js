// Decides how the page starts, from the address. index.js calls resolveRoute once per
// start (page load and popstate) and does what the result says.
//
// Priority, first match wins:
//   1. a share fragment (#s=...): its dataset id and SQL. A known id opens that dataset;
//      an unknown or absent id opens the default dataset with a notice; the SQL is
//      restored either way. A damaged link opens the default dataset and says so.
//   2. a plain fragment (#some/path.db or #https://...): upstream's open-from-URL format,
//      still supported. It names a database file, not a dataset.
//   3. ?db=<dataset id>: a known id opens that dataset, an unknown one opens the default
//      dataset with a notice.
//   4. the default dataset.
//
// Result: {
//   database: string          the value for DatabasePath: "" unless a plain fragment names
//                             a file to fetch,
//   dataset:  object | null   the manifest entry to open, or null,
//   sql:      string | null   SQL from a share link; wins over saved SQL, goes in the
//                             editor, is never run,
//   damaged:  boolean         the address was a share link that could not be read. Anything
//                             that looks like one (isShareFragment) is never taken for a
//                             database path, so its payload is never requested from the
//                             server or echoed in a message,
//   notice:   string | null   plain text to show next to the normal start message (the
//                             link named no dataset or an unknown one; the list of
//                             datasets is unavailable but a file was opened anyway),
//   problem:  string | null   plain text, shown as an error: the list of datasets could
//                             not be used and nothing else was asked for, so the app
//                             starts on an empty database,
//   manifest: {ok, datasets} | {ok: false, message}   what the picker lists,
// }
//
// Never throws: a manifest that cannot be fetched or is invalid becomes `problem`.

import {
    DATASET_PARAM,
    LINK_NO_DATASET_MESSAGE,
    SHARE_ID_PATTERN,
    unknownDatasetMessage,
} from "./config.js";
import { defaultDataset, findDataset, getManifest } from "./datasets.js";
import { decodeShare, isShareFragment } from "./share.js";

export async function resolveRoute(location) {
    const manifest = await getManifest();
    const route = {
        database: "",
        dataset: null,
        sql: null,
        damaged: false,
        notice: null,
        problem: null,
        manifest,
    };
    const hash = location.hash;

    if (isShareFragment(hash)) {
        const decoded = decodeShare(hash);
        if (!decoded.ok) {
            route.damaged = true;
            return withDefault(route);
        }
        // blank SQL counts as no SQL, so the recipient's own saved query is restored
        route.sql = decoded.state.sql?.trim() ? decoded.state.sql : null;
        const id = decoded.state.dataset;
        const known = id ? findDataset(manifest, id) : null;
        if (known) {
            route.dataset = known;
            return route;
        }
        if (manifest.ok) {
            route.notice = id ? unknownDatasetMessage(id) : LINK_NO_DATASET_MESSAGE;
        }
        return withDefault(route);
    }

    if (hash.length > 1) {
        route.database = hash.slice(1);
        if (!manifest.ok) {
            route.notice = manifest.message;
        }
        return route;
    }

    const requested = new URLSearchParams(location.search).get(DATASET_PARAM);
    if (requested) {
        const known = findDataset(manifest, requested);
        if (known) {
            route.dataset = known;
            return route;
        }
        if (manifest.ok) {
            // only an id that could be one is echoed; anything else is just "unknown"
            route.notice = unknownDatasetMessage(SHARE_ID_PATTERN.test(requested) ? requested : null);
        }
    }
    return withDefault(route);
}

// withDefault fills in the default dataset, or reports why there is none.
function withDefault(route) {
    if (route.manifest.ok) {
        route.dataset = defaultDataset(route.manifest);
    } else {
        route.problem = route.manifest.message;
    }
    return route;
}
