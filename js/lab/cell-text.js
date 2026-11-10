// The text of one result cell, as the CSV file (js/lab/results.js toCsv) and the result table
// (js/printer.js) both show it. No DOM.
//
//   cellText(value) -> string
//       NULL (and undefined) is "", a number its shortest JS text, a BigInt its digits, a BLOB
//       (Uint8Array or ArrayBuffer) x'<hex>' as SQL writes a blob literal (x'00ff10'), anything
//       else its String(). The text is not escaped: whoever puts it in HTML escapes it.

function toHex(bytes) {
    return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

export function cellText(value) {
    if (value === null || value === undefined) {
        return "";
    }
    if (value instanceof Uint8Array) {
        return `x'${toHex(value)}'`;
    }
    if (value instanceof ArrayBuffer) {
        return `x'${toHex(new Uint8Array(value))}'`;
    }
    return String(value);
}
