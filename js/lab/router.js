// Decides how the page starts, from the address. index.js calls resolveRoute once per
// start (page load and popstate) and does what the result says.
//
// Result: {
//   database: string   the value for DatabasePath: "" for an empty database, otherwise
//                      the path or URL to load (what the hash held before F3),
//   sql:      string | null   SQL from a share link; it wins over saved SQL and is put
//                      in the editor, never run,
//   damaged:  boolean  the address was a share link that could not be read; the app
//                      starts as if it had no address and index.js shows a message.
//                      Anything that looks like a share link (isShareFragment) is
//                      never taken for a database path, so its payload is never
//                      requested from the server or echoed in a message,
// }
//
// M3 adds datasets here (?db=<id>, the default dataset, the dataset id of a share link).

import { decodeShare, isShareFragment } from "./share.js";

export function resolveRoute(location) {
    const hash = location.hash;
    if (isShareFragment(hash)) {
        const decoded = decodeShare(hash);
        if (!decoded.ok) {
            return { database: "", sql: null, damaged: true };
        }
        // dataset, set and exercise ids are decoded but nothing can load them yet
        // blank SQL counts as no SQL, so the recipient's own saved query is restored
        const sql = decoded.state.sql?.trim() ? decoded.state.sql : null;
        return { database: "", sql, damaged: false };
    }
    return { database: hash.slice(1), sql: null, damaged: false };
}
