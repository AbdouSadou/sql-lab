// What the exercise set picker does when the student chooses a set or "None". The decisions
// live here; js/index.js only hands over the primitives it owns (the open database, the load
// ticket, the address bar), so the page controller stays a thin seam.
//
// createSetActions({...}) -> {openSet(set), closeSet()}
//   lab            () -> the exercise panel controller (js/lab/exercise-panel.js); a function
//                  because the panel is built with these actions
//   hasDatabase    () -> true when a database is open
//   isLoading      () -> true while a load is on its way (the open database is about to change)
//   cancelLoad     () cancel the load on its way, so it cannot bring the panel back
//   loadDataset    (dataset, {set, exerciseId}) -> Promise: load a manifest dataset and open
//                  the set with it
//   pushUrl        (search) put "?..." (or "./") in the address bar as a new history entry
//   showError      (message) plain text to the status line, as an error
//   showInvite     () the status line's idle message
//
// openSet: if the set's dataset is the one already open it is kept, because reloading it would
// discard the student's work; otherwise the dataset loads with the set. A dataset the manifest
// does not have is an error, and the picker goes back to what is open.
// closeSet: leaves exercise mode and keeps the database. A cancelled load leaves its
// "Loading database..." message behind, so the idle message replaces it.

import { DATASET_PARAM, SET_PARAM, setDatasetMissingReason, setOpenFailedMessage } from "./config.js";
import { findDataset, getManifest, getPristineId } from "./datasets.js";

export function createSetActions({ lab, hasDatabase, isLoading, cancelLoad, loadDataset, pushUrl, showError, showInvite }) {
    async function openSet(set) {
        if (hasDatabase() && !isLoading() && getPristineId() === set.dataset) {
            lab().open(set, null);
            pushUrl(`?${SET_PARAM}=${encodeURIComponent(set.id)}`);
            return;
        }
        const manifest = await getManifest();
        const dataset = manifest.ok ? findDataset(manifest, set.dataset) : null;
        if (!dataset) {
            showError(setOpenFailedMessage(set.id, setDatasetMissingReason(set.dataset)));
            lab().syncPicker();
            return;
        }
        return loadDataset(dataset, { set, exerciseId: null });
    }

    function closeSet() {
        const cancelled = isLoading();
        if (cancelled) {
            cancelLoad();
        }
        lab().close();
        if (hasDatabase()) {
            const id = getPristineId();
            pushUrl(id ? `?${DATASET_PARAM}=${encodeURIComponent(id)}` : "./");
            if (cancelled) {
                showInvite();
            }
        }
    }

    return { openSet, closeSet };
}
