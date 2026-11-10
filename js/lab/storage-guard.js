// A classic script, loaded in index.html before vendor/sqlite3.js.
//
// Some browsers refuse to hand over localStorage or sessionStorage at all: with site data
// blocked, merely reading window.localStorage throws a SecurityError. The SQLite engine reads
// both while it initialises (its kvvfs storage) and does not catch that, so with site data
// blocked no database would load. This script reads them first; where reading throws, it
// replaces the property with undefined, which the engine skips. The app's own storage code
// (js/storage.js, js/lab/progress.js) guards every access and keeps its data in memory then.
// Where storage works nothing is touched.

(function () {
    for (const name of ["localStorage", "sessionStorage"]) {
        try {
            void window[name];
        } catch {
            try {
                Object.defineProperty(window, name, { value: undefined, configurable: true, writable: true });
            } catch {
                // cannot be replaced either: nothing more to do
            }
        }
    }
})();
