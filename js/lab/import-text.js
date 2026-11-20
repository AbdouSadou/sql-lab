// What a file is, by its bytes, and its text (assessment plan, section 3: "Where it starts" and
// "Encoding"). No DOM, no storage, no engine, no library: a Blob in, bytes and text out, in
// slices, so that a large file is never held whole.
//
// A file's kind is decided from its bytes before its name (the plan's Q18):
//
//   kindByStart(head, size, fileName) -> "empty" | "zip" | "ole2" | "markup" | "text"
//       head is the file's first bytes (what headOf gives), size its length. In
//       this order, the first that fits: no bytes at all, "empty"; the four bytes 50 4B 03 04,
//       "zip" (an .xlsx workbook, whatever it is called: the two letters PK are not enough, a CSV
//       whose first column is called PK starts with them); the eight bytes D0 CF 11 E0 A1 B1 1A
//       E1, "ole2" (an .xls workbook, or a workbook locked with a password); a "<" as the first
//       character, after any byte-order mark and white space, under an .xls or .xlsx name,
//       "markup" (a web page or an XML spreadsheet saved as a workbook); anything else, "text",
//       which inspectText then looks at in full.
//
//   headOf(blob, fileName) -> Promise<Uint8Array>
//       the bytes to give kindByStart: the first HEAD_BYTES, and for a file under an .xls or .xlsx
//       name that starts with white space alone, as many more as it takes to reach the first
//       character that is not white space (up to 16 MB).
//
//   inspectText(blob, options?) -> Promise<{bom, hasZero, validUtf8}>
//       One pass over the whole file. bom is the encoding its byte-order mark names ("utf-8",
//       "utf-16le", "utf-16be") or null. hasZero: a zero byte somewhere, which with no UTF-16
//       byte-order mark means the file is not text. validUtf8: every byte fits UTF-8 (the first
//       bad byte can be anywhere, so the first slice is not enough).
//   guessEncoding({bom, validUtf8}) -> one of ENCODINGS
//       the byte-order mark's, else UTF-8 when the bytes fit it, else Windows-1252, which is
//       what Excel usually writes.
//   fitsEncoding(blob, encoding, options?) -> Promise<boolean>
//       Decoding is strict: a decoder that quietly replaced bad bytes would store the wrong
//       characters. Windows-1252 takes every byte (the five it leaves undefined, 81 8D 8F 90 9D,
//       come out as the control characters of the same number, as Windows itself reads them).
//
//   startOfText(blob, encoding, maxBytes) -> Promise<{text, whole}>
//       the text of the file's first maxBytes, for the preview; a character cut at the end is
//       left out. whole is true when that is the whole file. Throws when the bytes do not fit.
//   textPieces(blob, encoding, options?) -> async iterator of strings
//       the file's text in order, a slice at a time, through one streaming decoder (a character
//       that straddles two slices comes out whole). A piece that another follows never ends
//       on a carriage return: a trailing one is held back for the next piece, because a CRLF
//       split between two pieces makes the CSV reader report a bad quote that is not there
//       (the last piece of a file ends as the file does). Throws when the bytes do not fit the
//       encoding.
//
//   markOf(text) -> {length, hash}, and sameStart(pieces, mark) -> async iterator of strings
//       A mark of a text, to know it again: its length and a number worked out from every
//       character. sameStart hands on the pieces it is given, and looks as they go by whether
//       the text still starts with the text the mark was made from; when it does not (or ends
//       before it), it throws a TextChanged. The preview's text is marked, and the import
//       checks its own reading against it: a file that was saved again in between is not the
//       file the dialog showed (Chromium refuses to read such a file; Firefox reads the new
//       bytes). 32 bits and the length: a check against chance, not against intent.
//
// options: {sliceBytes} is how much of the file is read at a time (TEXT_SLICE_BYTES unless
// given; tests cut it to a few bytes), and {between} an async function called after each slice,
// with the number of bytes read so far, where a caller lets the page breathe and may throw to
// stop.

export const ENCODINGS = ["utf-8", "utf-16le", "utf-16be", "windows-1252"];
export const HEAD_BYTES = 4096;
export const TEXT_SLICE_BYTES = 1024 * 1024;

const ZIP = [0x50, 0x4b, 0x03, 0x04];
const OLE2 = [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1];
const BOMS = [
    ["utf-8", [0xef, 0xbb, 0xbf]],
    ["utf-16le", [0xff, 0xfe]],
    ["utf-16be", [0xfe, 0xff]],
];

const startsWith = (bytes, start) => bytes.length >= start.length && start.every((byte, i) => bytes[i] === byte);

// the encoding a byte-order mark names, or null
export function bomOf(head) {
    const found = BOMS.find(([, bytes]) => startsWith(head, bytes));
    return found ? found[0] : null;
}

const WORKBOOK_NAME = /\.xlsx?$/i;

export function kindByStart(head, size, fileName) {
    if (size === 0) {
        return "empty";
    }
    if (startsWith(head, ZIP)) {
        return "zip";
    }
    if (startsWith(head, OLE2)) {
        return "ole2";
    }
    if (WORKBOOK_NAME.test(String(fileName))) {
        // the first character, whatever the file's encoding: a byte-order mark says which, and
        // without one a "<" is the same byte in UTF-8 and in Windows-1252
        const bom = bomOf(head);
        const start = new TextDecoder(bom ?? "utf-8").decode(head);
        if (start.trimStart().startsWith("<")) {
            return "markup";
        }
    }
    return "text";
}

// The file's first bytes for kindByStart: HEAD_BYTES of them, and where a file under a workbook's
// name starts with nothing but white space (and is longer than that) the file is read on, in
// pieces that grow, to the first character that is not white space, so that a web page saved as a
// workbook is found however much white space is in front of its first tag, up to HEAD_LIMIT_BYTES:
// a file that is white space for longer than that is read as the text it is. (The dialog asks for
// this whatever the flags are: with the import alone such a web page is refused as a workbook is.)
const HEAD_LIMIT_BYTES = 16 * 1024 * 1024;
export async function headOf(blob, fileName) {
    let length = HEAD_BYTES;
    for (;;) {
        const head = new Uint8Array(await blob.slice(0, length).arrayBuffer());
        const quiet =
            blob.size > length &&
            length < HEAD_LIMIT_BYTES &&
            WORKBOOK_NAME.test(String(fileName)) &&
            !startsWith(head, ZIP) &&
            !startsWith(head, OLE2) &&
            new TextDecoder(bomOf(head) ?? "utf-8").decode(head).trim() === "";
        if (!quiet) {
            return head;
        }
        length *= 16;
    }
}

async function* slicesOf(blob, sliceBytes) {
    for (let at = 0; at < blob.size; at += sliceBytes) {
        yield new Uint8Array(await blob.slice(at, at + sliceBytes).arrayBuffer());
    }
}

const strictDecoder = (encoding) => new TextDecoder(encoding, { fatal: true });

// decodes one slice; false when the bytes do not fit
function fits(decoder, bytes, last) {
    try {
        decoder.decode(bytes, { stream: !last });
        return true;
    } catch {
        return false;
    }
}

export async function inspectText(blob, { sliceBytes = TEXT_SLICE_BYTES, between = null } = {}) {
    const head = new Uint8Array(await blob.slice(0, HEAD_BYTES).arrayBuffer());
    const result = { bom: bomOf(head), hasZero: false, validUtf8: true };
    const decoder = strictDecoder("utf-8");
    let read = 0;
    for await (const bytes of slicesOf(blob, sliceBytes)) {
        read += bytes.length;
        result.hasZero ||= bytes.includes(0);
        result.validUtf8 &&= fits(decoder, bytes, read >= blob.size);
        if (between) {
            await between(read);
        }
    }
    return result;
}

export const guessEncoding = ({ bom, validUtf8 }) => bom ?? (validUtf8 ? "utf-8" : "windows-1252");

export async function fitsEncoding(blob, encoding, { sliceBytes = TEXT_SLICE_BYTES, between = null } = {}) {
    const decoder = strictDecoder(encoding);
    let read = 0;
    for await (const bytes of slicesOf(blob, sliceBytes)) {
        read += bytes.length;
        if (!fits(decoder, bytes, read >= blob.size)) {
            return false;
        }
        if (between) {
            await between(read);
        }
    }
    return true;
}

export async function startOfText(blob, encoding, maxBytes) {
    const whole = blob.size <= maxBytes;
    const bytes = new Uint8Array(await blob.slice(0, maxBytes).arrayBuffer());
    // (as part of a longer text, so that a character cut by the limit is left out, not refused)
    return { text: strictDecoder(encoding).decode(bytes, { stream: !whole }), whole };
}

// ---- a mark of a text ----------------------------------------------------------------------

export class TextChanged extends Error {}

// (FNV-1a, over the text's UTF-16 units)
const MARK_START = 0x811c9dc5;
const MARK_STEP = 0x01000193;
function markMore(hash, text) {
    for (let i = 0; i < text.length; i++) {
        hash = Math.imul(hash ^ text.charCodeAt(i), MARK_STEP);
    }
    return hash;
}

export const markOf = (text) => ({ length: text.length, hash: markMore(MARK_START, text) });

export async function* sameStart(pieces, mark) {
    let seen = 0;
    let hash = MARK_START;
    for await (const piece of pieces) {
        if (seen < mark.length) {
            const part = piece.length > mark.length - seen ? piece.slice(0, mark.length - seen) : piece;
            hash = markMore(hash, part);
            seen += part.length;
            if (seen === mark.length && hash !== mark.hash) {
                throw new TextChanged();
            }
        }
        yield piece;
    }
    if (seen < mark.length) {
        throw new TextChanged();
    }
}

export async function* textPieces(blob, encoding, { sliceBytes = TEXT_SLICE_BYTES, between = null } = {}) {
    const decoder = strictDecoder(encoding);
    let held = "";
    let read = 0;
    for await (const bytes of slicesOf(blob, sliceBytes)) {
        read += bytes.length;
        let text = held + decoder.decode(bytes, { stream: true });
        held = "";
        if (text.endsWith("\r")) {
            held = "\r";
            text = text.slice(0, -1);
        }
        if (text) {
            yield text;
        }
        if (between) {
            await between(read);
        }
    }
    // the end of the file: a character left unfinished here does not fit either
    const tail = held + decoder.decode();
    if (tail) {
        yield tail;
    }
}
