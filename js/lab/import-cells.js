// The rules for the cells of a workbook (assessment plan, section 3, "Excel cells"), as pure
// functions over the cell objects the spreadsheet library gives. No DOM, no storage, no engine.
// The library itself is never imported: where a rule needs its number formatter (XLSX.SSF) the
// sheet is given it when it is made. What a column's type is, and what a table and its columns are
// called, are js/lab/import-rules.js's, the same as for a text file, so that a value is judged the
// same way wherever it came from.
//
// The importer reads; it does not clean. A cell is what it holds, not what Excel showed:
//
//   text            as it is, spaces kept; empty text is NULL. A text cell is judged for the column's
//                   type as a field of a CSV file is ("00123" stays text, "42" is a whole number).
//   a number        its number; a number format changes nothing, except the date ones below.
//   TRUE, FALSE     the words. An error (#N/A, #DIV/0!, ...) its text. Both are text.
//   a stub          no value: a cell that only has formatting, and a formula with no stored value
//   a formula       its last stored value, by the rules above; with none, NULL
//   a merged block  only the top left cell keeps its value (the library keeps what Excel hides)
//
// A date or time is a number whose number format is a date or time format, and is stored as text,
// by value, in the plan's order: a duration (the format has [h], [mm], [ss] ...) as H:MM:SS with
// the hours not padded; a time, when the stored value is below one day, as HH:MM:SS (one that
// rounds up to a whole day is 00:00:00, as Excel shows it); a date otherwise, as YYYY-MM-DD, with
// HH:MM:SS after it when the seconds are not zero. Seconds are rounded to the nearest once, first.
// The calendar is this module's own, in whole days, with no Date and no time zone: serial 60 is
// 1900-02-29, which never existed, as in Excel. A number that no date can be (negative, past
// 9999-12-31, a duration beyond what a number holds exactly) stays the number it is.
//
// Formats
//   formatLetters(format) -> text      what is looked at in a format: its first section, without
//       quoted text, without the character after a backslash, an underscore or an asterisk, and
//       without bracketed parts but those that are all one of h, m, s ([h], [mm], [SS]: elapsed time)
//   isDateFormat(format)    letters hold one of d m h y s, in either case. General and @ do not. This
//       is the app's own test: the library's calls 0.00e+00 a date.
//   isDurationFormat(format)  a date or time format whose letters hold a bracketed part
//   paddingZeros(format) -> count       the number of zeros a number format forces in front of its
//       point (00000 is 5), or 0 when it does not: a date or time format, one whose letters hold
//       / E or e, one with fewer than two zeros before any point (0.00, #,##0, 0 0/0)
//
// Numbers and dates
//   numberInFull(number) -> text       the shortest digits that give the number back, with the
//       exponent written out, no trailing zeros, no bare point, -0 as 0: 1234.5, 329, 0.0000001,
//       12345678901234567000, 602000000000000000000000. Where a number lands in a TEXT column, where
//       a header cell holds one, and in the preview.
//   serialText(number, {duration, date1904}) -> text | null     what a number is as a date, time or
//       duration, or null when it can be none
//   cellValue(cell, context) -> text | number | null     one cell's value by the rules above;
//       context is {date1904, ssf, formats} as readSheet keeps it
//
// A sheet (a "sheet" is what the dialog lists, and a table is made from it)
//   readSheet(ws, {name, label, hidden, page, date1904, ssf}) -> sheet
//       ws is a worksheet of the library read with dense: true (cells are in ws["!data"][row][column];
//       a row with no cell is a hole, not a list). ssf is XLSX.SSF, or what stands for it:
//       {get_table(), format(format, value, options)} (js/lab/import-workbook.js hands the table as the
//       sheet's own workbook left it). A sheet is
//       {name, label, hidden: 0 | 1 | 2, state, rows, columns, start, page, ...}: label is what the
//       dialog calls it (the name, or "Table 1" for a web page's table, page being true), rows and
//       columns the size of the rectangle and start the address of its top left cell ("C5"). state is
//         "ready"    it has at least one value
//         "empty"    no value anywhere: listed, cannot be ticked
//         "wide"     the rectangle has more than MAX_COLUMNS columns: cannot be ticked
//         "damaged"  it has a cell past Excel's own bounds (a row after the 1,048,576th or a column after
//                    the 16,384th), which no workbook holds: cannot be ticked
//       The rectangle is the smallest that holds every cell with a value, worked out after the merged
//       cells are blanked; the sheet's own range ("!ref") is never used, and decides nothing, not even
//       that a sheet is empty or damaged: it covers formatted cells too, and a sound sheet that holds
//       no cell can declare a larger range (so can one whose part of the file was cut short inside a
//       sound zip, which cannot be told from it, and is empty). Rows and the box "Column names are on
//       row" count from the rectangle's first row. What the rules need is kept in the object (the
//       worksheet, the rectangle, the date system, the formatter). A row of cells is walked by the
//       places that hold one (its own keys), never by its length.
//   valueAt(sheet, row, column) -> text | number | null    the value at a place of the rectangle (0, 0 is
//       its first cell): what the rules above make of the cell there, NULL for no cell or a merged-away one
//   sheetTableName(sheet, fileName) -> text     the name a table of this sheet starts from: the
//       sheet's name made a name (never cut at a dot: Q1.5 is Q1_5), FALLBACK_TABLE_NAME when
//       nothing is left; for a web page the file's name, as for a text file
//   previewRows(sheet, from, count) -> [[text | null]]     rows of the rectangle (0 is its first), each a
//       list of `columns` values as the preview shows them: numbers written out in full, NULL as null
//   tableOf(sheet, {hasNames, namesRow, rest}) -> Promise<table>
//       The table a ready sheet gives. With hasNames (the default) the names are the values of row
//       namesRow of the rectangle (a number written out in full, a blank cell is column_<its position
//       in the rectangle>), the rows above are left out and the rows below are the data; without it,
//       the columns are column_1 to column_<width> and every row of the rectangle is data, whatever
//       namesRow holds. The pass is made in steps of IMPORT_SHEET_CELLS cells, with rest() awaited
//       between two. table: {rows, columns: [{name, original, type, blanks, blocking}],
//       emptyFormulas, padded} where blanks are the NULLs, blocking is the first value that is not a
//       number in a column that is mostly numbers (as for a text file), emptyFormulas the formula
//       cells of the sheet that hold no value, below the row of names (the whole sheet without one),
//       and padded [{column, example, number}] the columns that a number format pads with zeros and
//       that lost zeros: the first number that did, and its text as Excel showed it (null when the
//       library gave none and could not make one). Throws a RangeError for a sheet that is not
//       ready, or a names row that is not a row of it: the dialog decides those before it asks.
//   storedRow(table, index) -> [value]     data row `index` (0 is the first below the names) as it is
//       stored: INTEGER, a number as it is (no negative zero) and text as its text; REAL, the same
//       (the engine's binding turns a number into a double); TEXT, a number written out in full and
//       any other value as it is. NULL stays null. Text is left for the column to convert.
//
// Never: use Date or the time zone, Math.min or Math.max over a list of cells (a sheet of a million
// cells overflows the stack that way), read the sheet's own range for the rectangle, show the
// library's words, or keep a second copy of the cells: the sheet is the library's own object.

import { IMPORT_SHEET_CELLS, MAX_COLUMNS } from "./config-workflow.js";
import { FALLBACK_TABLE_NAME, columnNames, columnType, blockingValue, newTally, sanitiseName, tableNameFor, tallyNumber, tallyValue } from "./import-rules.js";

// ---- formats ----------------------------------------------------------------------------------

const ELAPSED = /^(?:h+|m+|s+)$/i;

export function formatLetters(format) {
    const text = String(format);
    let letters = "";
    for (let i = 0; i < text.length; i++) {
        const char = text[i];
        if (char === ";") {
            break;
        }
        if (char === "\\" || char === "_" || char === "*") {
            i++;
        } else if (char === '"') {
            const close = text.indexOf('"', i + 1);
            if (close === -1) {
                break;
            }
            i = close;
        } else if (char === "[") {
            const close = text.indexOf("]", i + 1);
            if (close === -1) {
                break;
            }
            const inside = text.slice(i + 1, close);
            if (ELAPSED.test(inside)) {
                letters += `[${inside}]`;
            }
            i = close;
        } else {
            letters += char;
        }
    }
    return letters;
}

const DATE_LETTERS = /[dmhys]/i;

export const isDateFormat = (format) => DATE_LETTERS.test(formatLetters(format));
// (a bracket is kept in the letters only when it is all h, m or s, and so holds a date letter itself)
export const isDurationFormat = (format) => formatLetters(format).includes("[");

export function paddingZeros(format) {
    const letters = formatLetters(format);
    if (DATE_LETTERS.test(letters) || /[/Ee]/.test(letters)) {
        return 0;
    }
    const zeros = (letters.split(".")[0].match(/0/g) ?? []).length;
    return zeros >= 2 ? zeros : 0;
}

// what a format is, worked out once for each distinct format of a sheet
function infoOf(format, context) {
    let info = context.formats.get(format);
    if (info === undefined) {
        const date = isDateFormat(format);
        info = { date, duration: isDurationFormat(format), zeros: paddingZeros(format) };
        // (formats come from the file: a file with thousands of them does not keep them all)
        if (context.formats.size >= 5000) {
            context.formats.clear();
        }
        context.formats.set(format, info);
    }
    return info;
}

// The format of a numeric cell. The library leaves z undefined on the first cell of each built-in
// format outside its table of 29 (the East Asian date formats among them), and its own test of a
// date throws on undefined. Such a cell's format is one the library now holds that gives the
// cell's own shown text, a date format first; with none, General.
//
// The search is made once for a cell (its answer is kept), over a list made once for a sheet, and
// for no more than FORMAT_SEARCHES cells of a sheet: a workbook has one such cell for each built-in
// format it uses, a few dozen at most, so a sheet that has thousands is not one a search is worth
// making for (each search tries every format), and its later cells are General.
const FORMAT_SEARCHES = 1000;

function knownFormats(context) {
    if (!context.known) {
        const known = [...new Set(Object.values(context.ssf.get_table()))].filter((format) => typeof format === "string");
        context.known = [...known.filter((format) => isDateFormat(format)), ...known.filter((format) => !isDateFormat(format))];
    }
    return context.known;
}

function formatOf(cell, context) {
    if (typeof cell.z === "string") {
        return cell.z;
    }
    if (typeof cell.w !== "string" || !context.ssf) {
        return "General";
    }
    // (what these are is kept in the context, which a caller of cellValue may make with only the date
    // system, the formatter and the formats of a sheet)
    context.searched ??= new WeakMap();
    let found = context.searched.get(cell);
    if (found === undefined) {
        found = "General";
        if ((context.searches ?? 0) < FORMAT_SEARCHES) {
            context.searches = (context.searches ?? 0) + 1;
            for (const format of knownFormats(context)) {
                try {
                    // (the shown text was made with the workbook's own date system, so it is compared with a text
                    // made with it: with the 1900 system a 1904 workbook's date format would give another day)
                    if (context.ssf.format(format, cell.v, { date1904: context.date1904 }) === cell.w) {
                        found = format;
                        break;
                    }
                } catch {
                    // a format the library cannot show is not the one
                }
            }
        }
        context.searched.set(cell, found);
    }
    return found;
}

// ---- numbers ----------------------------------------------------------------------------------

const WITH_EXPONENT = /^(-?)(\d+)(?:\.(\d+))?e([+-]\d+)$/;

export function numberInFull(number) {
    // (String(-0) is "0")
    const text = String(number);
    const found = WITH_EXPONENT.exec(text);
    if (found === null) {
        return text;
    }
    const [, sign, whole, fraction = "", exponent] = found;
    const digits = whole + fraction;
    // where the decimal point falls in the digits. JavaScript writes an exponent only from 1e21 up and
    // below 1e-6, so the point is never inside the digits: it is before them or after them.
    const point = whole.length + Number(exponent);
    if (point <= 0) {
        return `${sign}0.${"0".repeat(-point)}${digits}`;
    }
    return sign + digits + "0".repeat(point - digits.length);
}

// ---- dates ------------------------------------------------------------------------------------

const DAY_SECONDS = 86400;
const EXACT_SECONDS = 2 ** 53;
// the last day a date can be: 9999-12-31, as a serial number of each system
const LAST_DAY = { 1900: 2958465, 1904: 2957003 };

const pad2 = (n) => String(n).padStart(2, "0");
const clock = (seconds) => `${pad2(Math.floor(seconds / 3600))}:${pad2(Math.floor((seconds % 3600) / 60))}:${pad2(seconds % 60)}`;

// year, month and day of a day counted from 1970-01-01 (whole numbers only: no Date)
function civil(days) {
    const z = days + 719468;
    const era = Math.floor(z / 146097);
    const dayOfEra = z - era * 146097;
    const yearOfEra = Math.floor((dayOfEra - Math.floor(dayOfEra / 1460) + Math.floor(dayOfEra / 36524) - Math.floor(dayOfEra / 146096)) / 365);
    const dayOfYear = dayOfEra - (365 * yearOfEra + Math.floor(yearOfEra / 4) - Math.floor(yearOfEra / 100));
    const shifted = Math.floor((5 * dayOfYear + 2) / 153);
    const day = dayOfYear - Math.floor((153 * shifted + 2) / 5) + 1;
    const month = shifted < 10 ? shifted + 3 : shifted - 9;
    return { year: yearOfEra + era * 400 + (month <= 2 ? 1 : 0), month, day };
}

// the date of a serial number's whole days, or null past 9999-12-31
function dateOfDay(day, date1904) {
    if (day > LAST_DAY[date1904 ? 1904 : 1900]) {
        return null;
    }
    let sinceEpoch;
    if (date1904) {
        sinceEpoch = day + 1462 - 25569;
    } else if (day === 60) {
        // the day Excel counts and the calendar never had
        return "1900-02-29";
    } else {
        sinceEpoch = day < 60 ? day - 25568 : day - 25569;
    }
    const { year, month, day: of } = civil(sinceEpoch);
    return `${String(year).padStart(4, "0")}-${pad2(month)}-${pad2(of)}`;
}

export function serialText(number, { duration = false, date1904 = false } = {}) {
    if (!Number.isFinite(number) || number < 0) {
        return null;
    }
    // to the nearest second, once, before anything else (a time of 09:05:00 is stored as
    // 0.378472222222222: its seconds are 32699.99999999998)
    const total = Math.round(number * DAY_SECONDS);
    if (!Number.isFinite(total)) {
        return null;
    }
    if (duration) {
        if (total > EXACT_SECONDS) {
            return null;
        }
        // (hours as the quotient of a multiple of 3600: exact)
        const hours = (total - (total % 3600)) / 3600;
        return `${hours}:${pad2(Math.floor((total % 3600) / 60))}:${pad2(total % 60)}`;
    }
    const left = total % DAY_SECONDS;
    if (number < 1) {
        // 0.99999999 rounds to a whole day, and is 00:00:00
        return clock(left);
    }
    const date = dateOfDay((total - left) / DAY_SECONDS, date1904);
    if (date === null) {
        return null;
    }
    return left === 0 ? date : `${date} ${clock(left)}`;
}

// ---- cells ------------------------------------------------------------------------------------

// the text of an error cell when the library gave none: its code, which is the one number it keeps
const ERROR_TEXTS = { 0x00: "#NULL!", 0x07: "#DIV/0!", 0x0f: "#VALUE!", 0x17: "#REF!", 0x1d: "#NAME?", 0x24: "#NUM!", 0x2a: "#N/A", 0x2b: "#GETTING_DATA" };

// whether a cell has a value (a number with a date format has one too, though it be a date)
function holdsValue(cell) {
    switch (cell.t) {
        case "s":
            return cell.v !== undefined && cell.v !== null && String(cell.v) !== "";
        case "n":
            // (the library gives a number it cannot read, or one too large, as NaN or Infinity with an
            // error's text in w: that is an error, and a number only when it is finite)
            return typeof cell.v === "number" && (Number.isFinite(cell.v) || (typeof cell.w === "string" && cell.w !== ""));
        case "b":
        case "e":
            return true;
        default:
            // "z", a stub (in an .xlsx a formula with no stored value too: its v is 0, so the type is
            // what tells), and "d", which the library gives only when asked for dates
            return false;
    }
}

export function cellValue(cell, context) {
    if (!holdsValue(cell)) {
        return null;
    }
    switch (cell.t) {
        case "s":
            return String(cell.v);
        case "b":
            return cell.v ? "TRUE" : "FALSE";
        case "e":
            return typeof cell.w === "string" && cell.w !== "" ? cell.w : (ERROR_TEXTS[cell.v] ?? "#N/A");
        default: {
            if (!Number.isFinite(cell.v)) {
                return cell.w;
            }
            const info = infoOf(formatOf(cell, context), context);
            return (info.date ? serialText(cell.v, { duration: info.duration, date1904: context.date1904 }) : null) ?? cell.v;
        }
    }
}

// ---- merged cells -----------------------------------------------------------------------------

// The merged blocks as an index that costs what the blocks are, not what they cover (a block may
// cover a million rows, and a file may hold many of them): the blocks that are more than one cell,
// sorted by their first row, with, for each place of the sorted list taken as the middle of a
// balanced tree, the last row that any block of its branch reaches. null when there is none.
function mergeIndex(merges) {
    if (!Array.isArray(merges)) {
        return null;
    }
    const whole = (n) => Number.isInteger(n) && n >= 0;
    const list = [];
    for (const merge of merges) {
        const { s, e } = merge ?? {};
        if (s && e && whole(s.r) && whole(s.c) && whole(e.r) && whole(e.c) && e.r >= s.r && e.c >= s.c && (e.r > s.r || e.c > s.c)) {
            list.push({ top: s.r, left: s.c, bottom: e.r, right: e.c });
        }
    }
    if (list.length === 0) {
        return null;
    }
    list.sort((a, b) => a.top - b.top);
    const reach = new Array(list.length);
    const build = (lo, hi) => {
        if (lo > hi) {
            return -Infinity;
        }
        const mid = (lo + hi) >> 1;
        reach[mid] = Math.max(list[mid].bottom, build(lo, mid - 1), build(mid + 1, hi));
        return reach[mid];
    };
    build(0, list.length - 1);
    return { list, reach };
}

// whether a block of the branch lo..hi covers the cell (r, c) without being the one that keeps it
// there (its top left cell keeps its value)
function covered(index, lo, hi, r, c) {
    const { list, reach } = index;
    while (lo <= hi) {
        const mid = (lo + hi) >> 1;
        if (reach[mid] < r) {
            return false;
        }
        if (covered(index, lo, mid - 1, r, c)) {
            return true;
        }
        const block = list[mid];
        if (block.top > r) {
            return false;
        }
        if (block.bottom >= r && c >= block.left && c <= block.right && !(r === block.top && c === block.left)) {
            return true;
        }
        lo = mid + 1;
    }
    return false;
}

const mergedAway = (index, r, c) => covered(index, 0, index.list.length - 1, r, c);

// ---- a sheet ------------------------------------------------------------------------------------

const LETTERS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";

// the column's letters: 0 is A, 25 is Z, 26 is AA
function columnLetters(index) {
    let letters = "";
    for (let n = index + 1; n > 0; n = Math.floor((n - 1) / 26)) {
        letters = LETTERS[(n - 1) % 26] + letters;
    }
    return letters;
}

// Excel's own bounds of a sheet. A cell beyond them is not one a workbook holds (the library gives
// one, from a few bytes of file that name a row of billions, and its list of rows is then that long).
const MAX_ROWS = 1_048_576;
const MAX_SHEET_COLUMNS = 16_384;

// Calls visit(index, item) for each place of the list of rows that holds something, in order, until it
// says false. A list longer than the limit is walked by what it holds, not by its length (it can be
// billions long and hold one row): false when something is held at the limit or beyond it, or when
// visit said so. A list that is not longer than the limit is walked by its length, which is at most
// the limit's places (about 17 milliseconds for a million places of which one is held): the bound is
// Excel's own, and not one that a file sets.
function eachHeld(list, limit, visit) {
    if (!Array.isArray(list)) {
        return true;
    }
    if (list.length <= limit) {
        for (let i = 0; i < list.length; i++) {
            if (list[i] && visit(i, list[i]) === false) {
                return false;
            }
        }
        return true;
    }
    return eachKept(list, limit, visit);
}

// Calls visit(index, item) for each place of a list that holds something, by the list's own keys (the
// places that hold a value, in rising order) and never by its length, until it says false: false too
// when something is held at the limit or beyond it. A row of ten cells and one far to the right is a
// sparse list, in which every place looked at by its number costs a search (a hundred thousand such
// rows took half a minute that way, and take a few hundredths of a second by key); a row that is full
// costs about twice what a walk by number does.
function eachKept(list, limit, visit) {
    if (!Array.isArray(list)) {
        return true;
    }
    for (const key of Object.keys(list)) {
        const i = Number(key);
        // (a key that is no index, such as "01" or "x", is no place of the list)
        if (!Number.isInteger(i) || i < 0 || String(i) !== key || !list[i]) {
            continue;
        }
        if (i >= limit || visit(i, list[i]) === false) {
            return false;
        }
    }
    return true;
}

export function readSheet(ws, { name, label = name, hidden = 0, page = false, date1904 = false, ssf = null }) {
    const data = Array.isArray(ws["!data"]) ? ws["!data"] : [];
    const merged = mergeIndex(ws["!merges"]);
    const context = { date1904, ssf, formats: new Map(), known: null, searched: new WeakMap(), searches: 0 };
    let top = Infinity;
    let left = Infinity;
    let bottom = -1;
    let right = -1;
    // the rows of the formula cells that hold no value
    const emptyFormulaRows = [];
    const inside = eachHeld(data, MAX_ROWS, (r, row) =>
        eachKept(row, MAX_SHEET_COLUMNS, (c, cell) => {
            if (!holdsValue(cell)) {
                if (cell.f !== undefined) {
                    emptyFormulaRows.push(r);
                }
            } else if (merged === null || !mergedAway(merged, r, c)) {
                top = Math.min(top, r);
                left = Math.min(left, c);
                bottom = Math.max(bottom, r);
                right = Math.max(right, c);
            }
            return true;
        })
    );
    const sheet = { name, label, hidden, state: "empty", rows: 0, columns: 0, start: null, page, ws, data, merged, context, rect: null, emptyFormulaRows };
    if (!inside) {
        // a cell where no sheet of a workbook has one: the sheet is not what its file says it is
        sheet.state = "damaged";
        return sheet;
    }
    if (bottom === -1) {
        // (the sheet's own range, "!ref", decides nothing: it covers cells that only have formatting, and a
        // sound sheet that holds no cell can still declare a range)
        return sheet;
    }
    sheet.rect = { top, left, bottom, right };
    sheet.rows = bottom - top + 1;
    sheet.columns = right - left + 1;
    sheet.start = `${columnLetters(left)}${top + 1}`;
    sheet.state = sheet.columns > MAX_COLUMNS ? "wide" : "ready";
    return sheet;
}

export const sheetTableName = (sheet, fileName) => (sheet.page ? tableNameFor(fileName) : sanitiseName(sheet.label) || FALLBACK_TABLE_NAME);

// the cell at a place in the rectangle, or undefined where there is none or where it is merged away
function cellAt(sheet, row, column) {
    const r = sheet.rect.top + row;
    const c = sheet.rect.left + column;
    const cell = sheet.data[r]?.[c];
    return !cell || (sheet.merged !== null && mergedAway(sheet.merged, r, c)) ? undefined : cell;
}

export function valueAt(sheet, row, column) {
    const cell = cellAt(sheet, row, column);
    return cell === undefined ? null : cellValue(cell, sheet.context);
}

const textOf = (value) => (value === null ? null : typeof value === "number" ? numberInFull(value) : value);

export function previewRows(sheet, from, count) {
    const rows = [];
    for (let row = from; row < Math.min(sheet.rows, from + count); row++) {
        const values = [];
        for (let column = 0; column < sheet.columns; column++) {
            values.push(textOf(valueAt(sheet, row, column)));
        }
        rows.push(values);
    }
    return rows;
}

// ---- a table ------------------------------------------------------------------------------------

// A cell's text as Excel showed it: the library's own, else one worked out here, else none (its
// formatter throws on some formats, as it does on a currency sign it does not know).
function shownText(cell, format, context) {
    if (typeof cell.w === "string") {
        return cell.w;
    }
    try {
        return context.ssf ? context.ssf.format(format, cell.v) : null;
    } catch {
        return null;
    }
}

export async function tableOf(sheet, { hasNames = true, namesRow = 1, rest = async () => {} } = {}) {
    if (sheet.state !== "ready") {
        throw new RangeError("a sheet with no values to import has no table");
    }
    if (hasNames && !(Number.isInteger(namesRow) && namesRow >= 1 && namesRow <= sheet.rows)) {
        throw new RangeError(`the sheet has no row ${namesRow}`);
    }
    const width = sheet.columns;
    const first = hasNames ? namesRow : 0;
    const header = hasNames ? Array.from({ length: width }, (unused, column) => textOf(valueAt(sheet, namesRow - 1, column)) ?? "") : null;
    const names = columnNames(header, width);
    const tallies = Array.from({ length: width }, newTally);
    const lost = new Array(width).fill(null);
    let steps = 0;
    for (let row = first; row < sheet.rows; row++) {
        for (let column = 0; column < width; column++) {
            const cell = cellAt(sheet, row, column);
            const value = cell === undefined ? null : cellValue(cell, sheet.context);
            if (typeof value === "number") {
                tallyNumber(tallies[column], value);
                if (lost[column] === null) {
                    // a number whose format pads with zeros, and that has fewer digits than the format has zeros
                    const format = formatOf(cell, sheet.context);
                    const zeros = infoOf(format, sheet.context).zeros;
                    if (zeros > 0 && numberInFull(Math.abs(value)).split(".")[0].length < zeros) {
                        lost[column] = { example: shownText(cell, format, sheet.context), number: value };
                    }
                }
            } else {
                tallyValue(tallies[column], value);
            }
        }
        steps += width;
        if (steps >= IMPORT_SHEET_CELLS) {
            steps = 0;
            await rest();
        }
    }
    // the formula cells with no value below the names (everywhere without names)
    const above = hasNames ? sheet.rect.top + namesRow - 1 : -1;
    let emptyFormulas = 0;
    for (const row of sheet.emptyFormulaRows) {
        if (row > above) {
            emptyFormulas++;
        }
    }
    const columns = names.map(({ name, original }, i) => ({
        name,
        original,
        type: columnType(tallies[i]),
        blanks: tallies[i].empty,
        blocking: blockingValue(tallies[i]),
    }));
    const padded = [];
    lost.forEach((found, i) => {
        if (found !== null) {
            padded.push({ column: names[i].name, example: found.example, number: found.number });
        }
    });
    return { sheet, hasNames, first, width, rows: sheet.rows - first, columns, emptyFormulas, padded };
}

export function storedRow(table, index) {
    const out = [];
    for (let column = 0; column < table.width; column++) {
        const cell = cellAt(table.sheet, table.first + index, column);
        const value = cell === undefined ? null : cellValue(cell, table.sheet.context);
        const type = table.columns[column].type;
        if (typeof value !== "number") {
            out.push(value);
        } else if (type === "TEXT") {
            out.push(numberInFull(value));
        } else {
            out.push(value === 0 ? 0 : value);
        }
    }
    return out;
}
