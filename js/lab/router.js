// Decides how the page starts, from the address. index.js calls resolveRoute once per
// start (page load and popstate) and does what the result says.
//
// Priority, first match wins:
//   1. a share fragment (#s=...): its dataset id, exercise set + exercise and SQL. A known
//      id opens that dataset; an unknown or absent id opens the default dataset with a
//      notice; the SQL is restored either way. A damaged link opens the default dataset
//      and says so. A link that names an exercise set which loads, and whose dataset is
//      in the manifest, opens that set's dataset whatever dataset id the link carries
//      ("loading a set loads its dataset").
//   2. a plain fragment (#some/path.db or #https://...): upstream's open-from-URL format,
//      still supported. It names a database file, not a dataset.
//   3. ?set=<set id>, with an optional &ex=<exercise id>: opens that exercise set and its
//      dataset. A set that cannot be loaded, or whose dataset is not in the manifest, gives
//      a notice and the route carries on as if no set was named: with ?db=<id> next, else
//      the default dataset. &ex= without a set is ignored.
//   4. ?db=<dataset id>: a known id opens that dataset, an unknown one opens the default
//      dataset with a notice.
//   5. the default dataset.
//
// Result: {
//   database: string          the value for DatabasePath: "" unless a plain fragment names
//                             a file to fetch,
//   dataset:  object | null   the manifest entry to open, or null,
//   sql:      string | null   SQL from a share link; wins over saved SQL, goes in the
//                             editor, is never run,
//   exercise: {set, exerciseId} | null
//                             null unless an exercise set was named AND loaded AND its
//                             dataset is in the manifest. Then `set` is the validated set
//                             (js/lab/exercises.js: id, title, dataset, exercises) and
//                             `exerciseId` the id of the requested exercise, or null when
//                             none was named or the set has no such exercise (that one gets
//                             a notice). `dataset` above is then the set's dataset,
//   damaged:  boolean         the address was a share link that could not be read. Anything
//                             that looks like one (isShareFragment) is never taken for a
//                             database path, so its payload is never requested from the
//                             server or echoed in a message,
//   notice:   string | null   plain text to show next to the normal start message (the
//                             link named no dataset or an unknown one; an exercise set or
//                             exercise that could not be used; the list of datasets is
//                             unavailable but a file was opened anyway). Names no
//                             untrusted text except an id that matches SHARE_ID_PATTERN,
//   problem:  string | null   plain text, shown as an error: the list of datasets could
//                             not be used and nothing else was asked for, so the app
//                             starts on an empty database,
//   manifest: {ok, datasets} | {ok: false, message}   what the picker lists,
// }
//
// Never throws: a manifest that cannot be fetched or is invalid becomes `problem`, a set
// that cannot be loaded becomes a notice.

import {
    DATASET_PARAM,
    EXERCISE_PARAM,
    LINK_NO_DATASET_MESSAGE,
    SET_PARAM,
    SHARE_ID_PATTERN,
    setDatasetMissingReason,
    setNoticeMessage,
    unknownDatasetMessage,
    unknownExerciseMessage,
} from "./config.js";
import { defaultDataset, findDataset, getManifest } from "./datasets.js";
import { loadSet } from "./exercises.js";
import { decodeShare, isShareFragment } from "./share.js";

export async function resolveRoute(location) {
    const manifest = await getManifest();
    const route = {
        database: "",
        dataset: null,
        sql: null,
        exercise: null,
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
        // a set that loads wins over the dataset id of the link
        if (await openSet(route, decoded.state.set, decoded.state.exercise)) {
            return route;
        }
        const id = decoded.state.dataset;
        const known = id ? findDataset(manifest, id) : null;
        if (known) {
            route.dataset = known;
            return route;
        }
        if (manifest.ok) {
            addNotice(route, id ? unknownDatasetMessage(id) : LINK_NO_DATASET_MESSAGE);
        }
        return withDefault(route);
    }

    if (hash.length > 1) {
        route.database = hash.slice(1);
        if (!manifest.ok) {
            addNotice(route, manifest.message);
        }
        return route;
    }

    const query = new URLSearchParams(location.search);
    const requestedSet = query.get(SET_PARAM);
    if (requestedSet && (await openSet(route, requestedSet, query.get(EXERCISE_PARAM)))) {
        return route;
    }

    const requested = query.get(DATASET_PARAM);
    if (requested) {
        const known = findDataset(manifest, requested);
        if (known) {
            route.dataset = known;
            return route;
        }
        if (manifest.ok) {
            // only an id that could be one is echoed; anything else is just "unknown"
            addNotice(route, unknownDatasetMessage(SHARE_ID_PATTERN.test(requested) ? requested : null));
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

// openSet opens an exercise set: loads it and points the route at its dataset and exercise.
// Returns false (with a notice when it makes sense) when the route should carry on as if no
// set had been named: no set id, a set that cannot be loaded, or a dataset that is not in
// the manifest. exerciseId may be undefined, null or text from the address.
async function openSet(route, setId, exerciseId) {
    if (!setId) {
        return false;
    }
    const loaded = await loadSet(setId);
    const echoed = SHARE_ID_PATTERN.test(setId) ? setId : null;
    if (!loaded.ok) {
        addNotice(route, setNoticeMessage(echoed, loaded.message));
        return false;
    }
    const set = loaded.set;
    const dataset = findDataset(route.manifest, set.dataset);
    if (!dataset) {
        // an unusable manifest is reported as the route's problem; no need to say it twice
        if (route.manifest.ok) {
            addNotice(route, setNoticeMessage(echoed, setDatasetMissingReason(set.dataset)));
        }
        return false;
    }
    route.dataset = dataset;
    route.exercise = { set, exerciseId: null };
    if (exerciseId) {
        if (set.exercises.some((e) => e.id === exerciseId)) {
            route.exercise.exerciseId = exerciseId;
        } else {
            addNotice(route, unknownExerciseMessage(SHARE_ID_PATTERN.test(exerciseId) ? exerciseId : null));
        }
    }
    return true;
}

function addNotice(route, text) {
    route.notice = route.notice ? `${route.notice} ${text}` : text;
}
