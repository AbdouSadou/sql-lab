// A zip's own check, made before the spreadsheet library sees a workbook (assessment plan,
// section 3, "Where it starts"; an .xlsx is a zip). No DOM, no storage, no library: a Blob in, the
// zip's records out, and the browser's own decompressor for the data.
//
// Why. The library trusts what it is given. Of 300 copies of a workbook with one bit changed it
// stopped for good on 17 (a page that never answers again), read 60 differently with no error (a
// sheet shorter, a cell changed), threw on 16 and read 207 as before; and of 120 copies cut short
// it stopped on 6. A zip keeps a checksum and a size for every part, and the browser can inflate
// a part, so the page can tell a sound zip from a damaged one before the library runs. What this
// cannot see is a part that is wrong inside a sound zip (a file saved by a program that wrote a
// bad sheet and a good checksum).
//
//   zipDirectory(file) -> Promise<{entries, unpacked} | {damaged: true} | null>
//       Reads the last 64 KB of the file and 22 bytes more for the end record, then the central
//       directory from where the end record says it starts (a second slice when it is longer
//       than that tail). entries: [{name, method, flags, crc, packed, unpacked, at}], one for each
//       part, in the directory's order: crc is the stored CRC-32, packed and unpacked the stored
//       and the unpacked sizes in bytes, at where the part's local header starts. unpacked (the
//       other one, in the result) is the sum of all of them. {damaged: true} for a file with no
//       end record, a directory that is out of place or cut, an entry that is no entry, an
//       archive in several parts, or a count that disagrees with the end record. null for a zip
//       that is Zip64: an entry with the marker (all ones) in a size or in where it starts AND the
//       Zip64 extra field that holds the real value, or an end record with the marker AND the Zip64
//       locator before it. That is not read here: the caller measures the file by its size and the
//       library's own throw decides. A marker without what a Zip64 file has with it is no Zip64: a
//       size of all ones that nothing explains is a damaged file (the library would take it at its
//       word), and a count of 65,535 with no locator is only that many parts.
//
//   checkZip(bytes, entries, {rest}) -> Promise<boolean>
//       true when every part is sound: its local header is where the directory says, it has the
//       method the directory says, it is stored (method 0) or deflated (method 8), and its data
//       unpacks (through DecompressionStream("deflate-raw"), read piece by piece, never held
//       whole) to exactly the stored size and the stored CRC-32. A part is left unpacking as soon
//       as it has given more bytes than the directory says (a zip bomb costs what its directory
//       claims, no more). A part that is encrypted or of another method is left to the library
//       (no verdict from here). false means damaged. bytes is the whole file; rest() is awaited
//       between two parts and after every few megabytes within one, so that the page can draw and
//       take a press on Cancel: when it throws, the check stops and the throw goes to the caller.
//       The stream reader is cancelled whenever the check stops, so that no rejection is left
//       without a taker. Where the browser has no DecompressionStream for "deflate-raw", nothing
//       is checked and true comes back (canUnpack says whether that is so).
//
//   canUnpack() -> boolean       whether the browser can inflate raw deflate data
//   crc32(bytes, crc?) -> number the CRC-32 table's step over bytes, for a running value: start
//       from CRC_START (the default), finish with crcOf(running)
//   CRC_START, crcOf(running)
//
// Never: read a whole part into memory at once, trust a size before it is checked against the
// bytes that came, or load a library.

const END_SIGNATURE = 0x06054b50;
const DIRECTORY_SIGNATURE = 0x02014b50;
const LOCAL_SIGNATURE = 0x04034b50;
const LOCATOR_SIGNATURE = 0x07064b50;
const LOCATOR_BYTES = 20;
const ZIP64_EXTRA = 0x0001;
const END_BYTES = 22;
const DIRECTORY_ENTRY_BYTES = 46;
const LOCAL_BYTES = 30;
// where the end record can start: a comment of up to 65,535 bytes follows it
const TAIL_BYTES = 64 * 1024 + END_BYTES;
const ALL_ONES_16 = 0xffff;
const ALL_ONES_32 = 0xffffffff;
const ENCRYPTED = 1;
const STORED = 0;
const DEFLATED = 8;
// how many bytes are worked on between two rests, and how large a piece of a stored or deflated
// part is handed over at a time
const REST_EVERY_BYTES = 4 * 1024 * 1024;
const PIECE_BYTES = 64 * 1024;

const u16 = (bytes, at) => bytes[at] | (bytes[at + 1] << 8);
const u32 = (bytes, at) => (bytes[at] | (bytes[at + 1] << 8) | (bytes[at + 2] << 16) | (bytes[at + 3] << 24)) >>> 0;

// ---- CRC-32 ---------------------------------------------------------------------------------

const TABLE = new Uint32Array(256).map((unused, n) => {
    let value = n;
    for (let bit = 0; bit < 8; bit++) {
        value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
    }
    return value >>> 0;
});

export const CRC_START = 0xffffffff;

// the running value after `bytes`; end with crcOf
export function crc32(bytes, running = CRC_START) {
    for (let i = 0; i < bytes.length; i++) {
        running = TABLE[(running ^ bytes[i]) & 0xff] ^ (running >>> 8);
    }
    return running;
}

export const crcOf = (running) => (running ^ 0xffffffff) >>> 0;

// ---- the directory ----------------------------------------------------------------------------

// whether an entry's extra field (a run of id, size, data) holds a field with this id
function hasExtraField(extra, id) {
    for (let at = 0; at + 4 <= extra.length; ) {
        if (u16(extra, at) === id) {
            return true;
        }
        at += 4 + u16(extra, at + 2);
    }
    return false;
}

const bytesOfSlice = async (file, from, to) => new Uint8Array(await file.slice(from, to).arrayBuffer());

// where in `tail` the end record is: the last place that starts with its signature and holds a
// record whose comment fits in what is left of the file (a comment may itself hold the signature)
function endRecordAt(tail) {
    for (let at = tail.length - END_BYTES; at >= 0; at--) {
        if (u32(tail, at) === END_SIGNATURE && at + END_BYTES + u16(tail, at + 20) <= tail.length) {
            return at;
        }
    }
    return -1;
}

export async function zipDirectory(file) {
    const size = file.size;
    const tailStart = Math.max(0, size - TAIL_BYTES);
    const tail = await bytesOfSlice(file, tailStart, size);
    const end = endRecordAt(tail);
    if (end === -1) {
        return { damaged: true };
    }
    const disk = u16(tail, end + 4);
    const directoryDisk = u16(tail, end + 6);
    const countHere = u16(tail, end + 8);
    const count = u16(tail, end + 10);
    const length = u32(tail, end + 12);
    const start = u32(tail, end + 16);
    if ((count === ALL_ONES_16 || length === ALL_ONES_32 || start === ALL_ONES_32) && end >= LOCATOR_BYTES && u32(tail, end - LOCATOR_BYTES) === LOCATOR_SIGNATURE) {
        return null;
    }
    const endAt = tailStart + end;
    // a workbook is one archive, and its directory lies wholly before its end record
    if (disk !== 0 || directoryDisk !== 0 || countHere !== count || start + length > endAt) {
        return { damaged: true };
    }
    const directory = start >= tailStart ? tail.subarray(start - tailStart, start - tailStart + length) : await bytesOfSlice(file, start, start + length);
    const entries = [];
    const names = new TextDecoder();
    let at = 0;
    let unpacked = 0;
    for (let i = 0; i < count; i++) {
        if (at + DIRECTORY_ENTRY_BYTES > directory.length || u32(directory, at) !== DIRECTORY_SIGNATURE) {
            return { damaged: true };
        }
        const nameBytes = u16(directory, at + 28);
        const extraBytes = u16(directory, at + 30);
        const commentBytes = u16(directory, at + 32);
        const next = at + DIRECTORY_ENTRY_BYTES + nameBytes + extraBytes + commentBytes;
        if (next > directory.length) {
            return { damaged: true };
        }
        const entry = {
            name: names.decode(directory.subarray(at + DIRECTORY_ENTRY_BYTES, at + DIRECTORY_ENTRY_BYTES + nameBytes)),
            method: u16(directory, at + 10),
            flags: u16(directory, at + 8),
            crc: u32(directory, at + 16),
            packed: u32(directory, at + 20),
            unpacked: u32(directory, at + 24),
            at: u32(directory, at + 42),
        };
        if (entry.packed === ALL_ONES_32 || entry.unpacked === ALL_ONES_32 || entry.at === ALL_ONES_32) {
            const extra = directory.subarray(at + DIRECTORY_ENTRY_BYTES + nameBytes, at + DIRECTORY_ENTRY_BYTES + nameBytes + extraBytes);
            return hasExtraField(extra, ZIP64_EXTRA) ? null : { damaged: true };
        }
        entries.push(entry);
        unpacked += entry.unpacked;
        at = next;
    }
    // the count in the end record is the number of entries only when they fill the directory
    if (at !== directory.length) {
        return { damaged: true };
    }
    return { entries, unpacked };
}

// ---- the parts -------------------------------------------------------------------------------

export function canUnpack() {
    try {
        return typeof DecompressionStream === "function" && Boolean(new DecompressionStream("deflate-raw"));
    } catch {
        return false;
    }
}

// the data of one part, a piece at a time, as a stream that the decompressor can be piped from
function streamOf(data) {
    let at = 0;
    return new ReadableStream({
        pull(controller) {
            if (at >= data.length) {
                controller.close();
                return;
            }
            controller.enqueue(data.subarray(at, at + PIECE_BYTES));
            at += PIECE_BYTES;
        },
    });
}

// {length, crc} of what a deflated part unpacks to, or null when the data is not deflate data, is
// cut, or goes on past what the directory says (`limit` bytes). `more(n)` is told how many bytes
// came, for the rests; what it throws is not the data's fault and goes to the caller.
async function unpackDeflated(data, limit, more) {
    const reader = streamOf(data).pipeThrough(new DecompressionStream("deflate-raw")).getReader();
    let running = CRC_START;
    let length = 0;
    try {
        for (;;) {
            let step;
            try {
                step = await reader.read();
            } catch {
                return null;
            }
            if (step.done) {
                return { length, crc: crcOf(running) };
            }
            length += step.value.length;
            if (length > limit) {
                return null;
            }
            running = crc32(step.value, running);
            await more(step.value.length);
        }
    } finally {
        // (cancelling ends the pipe, and with it any rejection the decompressor would leave)
        await reader.cancel().catch(() => {});
    }
}

export async function checkZip(bytes, entries, { rest = async () => {} } = {}) {
    if (!canUnpack()) {
        return true;
    }
    let since = 0;
    // after every few megabytes
    const more = async (n) => {
        since += n;
        if (since >= REST_EVERY_BYTES) {
            since = 0;
            await rest();
        }
    };
    for (const entry of entries) {
        await rest();
        const at = entry.at;
        if (at + LOCAL_BYTES > bytes.length || u32(bytes, at) !== LOCAL_SIGNATURE) {
            return false;
        }
        if (entry.flags & ENCRYPTED || (entry.method !== STORED && entry.method !== DEFLATED)) {
            continue;
        }
        if (u16(bytes, at + 8) !== entry.method) {
            return false;
        }
        const from = at + LOCAL_BYTES + u16(bytes, at + 26) + u16(bytes, at + 28);
        // (a part that runs past the end of the file is short, and fails the size below)
        const data = bytes.subarray(from, from + entry.packed);
        let got;
        if (entry.method === STORED) {
            let running = CRC_START;
            for (let done = 0; done < data.length; done += PIECE_BYTES) {
                running = crc32(data.subarray(done, done + PIECE_BYTES), running);
                await more(Math.min(PIECE_BYTES, data.length - done));
            }
            got = { length: data.length, crc: crcOf(running) };
        } else {
            // (a part with no data at all is empty, whatever the writer left out of its deflate stream)
            got = data.length === 0 ? { length: 0, crc: crcOf(CRC_START) } : await unpackDeflated(data, entry.unpacked, more);
        }
        if (got === null || got.length !== entry.unpacked || got.crc !== entry.crc) {
            return false;
        }
    }
    return true;
}
