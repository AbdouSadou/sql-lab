// The events of an import (js/lab/events.js: the evidence log), worked out from the tables the
// import made. Pure: no DOM, no storage, no engine.
//
//   importEvents(tables) -> [{lines: [text]}]
//       One event for each FILE, in the order of the job: tables that follow one another and come
//       from the same file (the same File object, not one of the same name) are one event, so a
//       workbook of three tables is one event of four lines, and two different files of one name
//       are two events. Its lines are the file's (importEventFileLine: its name and its size)
//       and then one for each table. A table of a sheet ends its line with the sheet
//       (importEventSheetTableLine: "table: orders, 50 rows, 4 columns, orders"); a table of a
//       text file, and the table of a web page that has only one, has no sheet and is the line a
//       text file has always had. A text file alone gives exactly the two lines it always gave.
//       tables: [{origin, file, bytes, name, rows, columns, sheet}], origin the File itself,
//       file its name, sheet the sheet's label or null.

import { importEventFileLine, importEventSheetTableLine, importEventTableLine } from "./config-workflow.js";

export function importEvents(tables) {
    const events = [];
    let last = null;
    for (const table of tables) {
        if (last === null || last.origin !== table.origin) {
            last = { origin: table.origin, lines: [importEventFileLine(table.file, table.bytes)] };
            events.push(last);
        }
        const width = table.columns.length;
        last.lines.push(table.sheet === null || table.sheet === undefined ? importEventTableLine(table.name, table.rows, width) : importEventSheetTableLine(table.name, table.rows, width, table.sheet));
    }
    return events.map(({ lines }) => ({ lines }));
}
