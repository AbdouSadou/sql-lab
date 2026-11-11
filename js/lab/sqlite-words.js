// The words the SQL editor (js/lab/code-editor.js) highlights and offers as completions.
//
// CodeMirror's own SQLite dialect knows the standard SQL keywords (many of which SQLite does not
// have) and lists the sqlite3 shell's dot-commands (tables, mode, print, ...) as its built-ins, so
// a column named "mode" would be drawn as a function. These lists are SQLite's own instead:
//
//   SQLITE_KEYWORDS   https://sqlite.org/lang_keywords.html (all 147)
//   SQLITE_FUNCTIONS  the core, aggregate, window, date and time, math and JSON functions
//                     (https://sqlite.org/lang_corefunc.html and the pages it links to)
//
// A word in both lists is drawn as a function. Words that are mostly operators or clauses (like,
// glob, regexp, match, replace, if) are left out of the functions, so INSERT OR REPLACE and IF NOT
// EXISTS read as keywords.

export const SQLITE_KEYWORDS = [
    "abort action add after all alter always analyze and as asc attach autoincrement",
    "before begin between by cascade case cast check collate column commit conflict constraint",
    "create cross current current_date current_time current_timestamp database default",
    "deferrable deferred delete desc detach distinct do drop each else end escape except exclude",
    "exclusive exists explain fail filter first following for foreign from full generated glob",
    "group groups having if ignore immediate in index indexed initially inner insert instead",
    "intersect into is isnull join key last left like limit match materialized natural no not",
    "nothing notnull null nulls of offset on or order others outer over partition plan pragma",
    "preceding primary query raise range recursive references regexp reindex release rename",
    "replace restrict returning right rollback row rows savepoint select set table temp temporary",
    "then ties to transaction trigger unbounded union unique update using vacuum values view",
    "virtual when where window with without",
].join(" ");

export const SQLITE_FUNCTIONS = [
    // core
    "abs changes char coalesce concat concat_ws format hex ifnull iif instr last_insert_rowid",
    "length likelihood likely load_extension lower ltrim max min nullif octet_length printf quote",
    "random randomblob round rtrim sign soundex sqlite_compileoption_get",
    "sqlite_compileoption_used sqlite_offset sqlite_source_id sqlite_version substr substring",
    "total_changes trim typeof unhex unicode unlikely upper zeroblob",
    // aggregate
    "avg count group_concat string_agg sum total",
    // window
    "row_number rank dense_rank percent_rank cume_dist ntile lag lead first_value last_value nth_value",
    // date and time
    "date time datetime julianday unixepoch strftime timediff",
    // math
    "acos acosh asin asinh atan atan2 atanh ceil ceiling cos cosh degrees exp floor ln log log10",
    "log2 mod pi pow power radians sin sinh sqrt tan tanh trunc",
    // JSON
    "json jsonb json_array jsonb_array json_array_length json_error_position json_extract",
    "jsonb_extract json_insert jsonb_insert json_object jsonb_object json_patch jsonb_patch",
    "json_pretty json_remove jsonb_remove json_replace jsonb_replace json_set jsonb_set json_type",
    "json_valid json_quote json_group_array jsonb_group_array json_group_object",
    "jsonb_group_object json_each json_tree",
].join(" ");
