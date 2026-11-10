// Stores various database information
// in brower storage.
//
// Browser storage can be missing or unusable: blocked site data (the localStorage getter itself
// throws), a locked-down lab PC, a full quota (setItem throws). None of that may stop a query
// from running, so every access is guarded. What could not be written is kept in memory for
// the page's life instead, so a name change or a reload-free restore still sees it.

const PREFIX = "sqlime";

// key -> SQL that could not be written to (or read back from) localStorage
const memory = new Map();

const storageKey = (key) => `${PREFIX}.query.${key}`;

// get loads SQL query from the local storage
function get(key) {
    const full = storageKey(key);
    if (memory.has(full)) {
        return memory.get(full);
    }
    try {
        return localStorage.getItem(full);
    } catch {
        return null;
    }
}

// save saves SQL query to the local storage
function set(key, sql) {
    if (!sql) {
        remove(key);
    }
    const full = storageKey(key);
    try {
        localStorage.setItem(full, sql);
        memory.delete(full);
    } catch {
        memory.set(full, sql);
    }
}

// remove deletes SQL query from the local storage
function remove(key) {
    const full = storageKey(key);
    memory.delete(full);
    try {
        localStorage.removeItem(full);
    } catch {
        // nothing stored, nothing to remove
    }
}

const storage = { get, set, remove };
export default storage;
