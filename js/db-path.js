// Path to an SQLite database.

// Could be one of the following:
//   - local (../data.db, resolved against this page),
//   - remote (https://domain.com/data.db)
//   - binary (binary database content)
//   - sql (sql script)
//   - unsupported (any other address: scheme:id, data:..., //host/..., and so on)
//   - empty
//
// There is deliberately no type for "scheme:id" addresses (the old id type). If such a
// string were classified as local or left unclassified, loading would either fetch
// something unexpected or silently fall through to an empty database, so start()
// refuses "unsupported" paths with an error and never calls the loader for them.

class DatabasePath {
    constructor(value, type = null) {
        this.value = value;
        this.type = type || this.inferType(value);
    }

    // inferType guesses the path type by its value.
    inferType(value) {
        if (!value) {
            return "empty";
        }
        if (value instanceof ArrayBuffer) {
            return "binary";
        }
        if (/^https?:\/\//i.test(value)) {
            return "remote";
        }
        return isSameSite(value) ? "local" : "unsupported";
    }

    // extractName extracts the database name from the path.
    extractName() {
        if (["binary", "sql", "unsupported", "empty"].includes(this.type)) {
            return "";
        }
        const parts = this.value.split("/");
        return parts[parts.length - 1];
    }

    // toHash returns the path as a window location hash string.
    toHash() {
        if (this.type == "local" || this.type == "remote") {
            return `#${this.value}`;
        } else {
            return "";
        }
    }

    // toString returns the path as a string.
    // The text can contain anything the user or a link supplied, so it must be
    // escaped before it is shown as HTML.
    toString() {
        if (this.type == "local" || this.type == "remote") {
            return `URL ${this.value}`;
        } else if (this.type == "binary") {
            return "binary value";
        } else if (this.type == "sql") {
            return "sql script";
        } else if (this.type == "unsupported") {
            return `unsupported address ${this.value}`;
        } else {
            return "empty value";
        }
    }
}

// isSameSite tells whether the browser would resolve the value to a location on this
// site. The browser's own URL parser decides, because it also reads forms such as
// "//host/x", "\\host\x" and "scheme:x" as something other than a relative path.
function isSameSite(value) {
    try {
        const here = new URL(window.location.href);
        const target = new URL(value, here);
        return target.origin === here.origin;
    } catch {
        return false;
    }
}

export { DatabasePath };
