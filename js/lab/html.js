// HTML escaping. Every string that comes from SQL, a database, a file name, a URL
// or an error must pass through here before it is written with innerHTML.

const ESCAPES = {
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
};

// escapeHtml makes text safe both as element content and inside a quoted attribute
// value. null and undefined become the empty string; everything else is stringified.
export function escapeHtml(value) {
    if (value === null || value === undefined) {
        return "";
    }
    return String(value).replace(/[&<>"']/g, (ch) => ESCAPES[ch]);
}
