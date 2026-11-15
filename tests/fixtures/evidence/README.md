# Evidence files saved before the assessment work

Version 1 evidence files written by the app as it was before Phase 0 of the SQL Lab Assessment Workflow Plan
(commit `3c87ff7`, 15 Nov 2026). They stand for the files students exported before this work. The plan's rule is
that such files must keep verifying as VALID, and that a log with no events must still export exactly these bytes.

| File | What it is |
| --- | --- |
| `v1-dataset.txt` | A real export from the dialog, on a course dataset: rows, no rows, an error, SQL with a blank line, and SQL that holds a line shaped like an entry heading and a line shaped like an event heading. Four entries have a link. |
| `v1-file.txt` | A real export from the dialog, on an opened file: its own log key, and no links. |
| `v1-awkward.txt` | Built by the exporter's own function from an input chosen to be awkward: two entries in one second, the three line breaks a file can hold (CRLF, a lone CR and LF), characters outside ASCII, an error message with line breaks, lines shaped like headings, a line that already starts with the escape character, lines shaped like the last lines of a file, and a long line. |

Beside each file is a `.json` with the same name. It holds:

- `input`: what the file was built from: the entries with their links, the log key (`dataset`), the export time
  and the student number. `buildEvidence(input)` must give the file byte for byte.
- `verdict`: what `verifyEvidence` said about the file when it was saved.
- `made`: how the file was made. `downloaded_as` is the name the dialog gave the download.

The links in `v1-dataset` point at `http://127.0.0.1:4373/`, the address the page was served from when the file
was exported. The student numbers are made up.

Do not regenerate these files. They are useful only as long as they are the ones the old code wrote.
