/**
 * Turning an uploaded file into `{ headers, rows }`.
 *
 * Everything here is pure and library-free so it can be tested directly. The
 * Worker (`parse.worker.ts`) reads the File and calls `read-excel-file`; the
 * shaping decisions all live here.
 *
 * Replaces `partials/import/csv-parse.worker.ts`, which hardcoded
 * `delimiter: ','` and read only text. Two things it could not do:
 * semicolon/tab-separated exports (the default for Excel in most of Europe),
 * and spreadsheets at all.
 */
import { parse } from 'csv/sync';

import { type ParseResult, type ParsedTable, type SupportedExtension } from './types';

/**
 * Candidates in the order we'd rather have them, so a genuine tie resolves to
 * the most common convention. `\t` is here for `.tsv` and for the "Unicode
 * Text" that Excel produces on Save As.
 */
const DELIMITER_CANDIDATES = [',', ';', '\t', '|'] as const;

/** Enough rows to tell a real delimiter from a character that appears in prose. */
const SNIFF_SAMPLE_ROWS = 20;

export function extensionOf(fileName: string): string {
  const dot = fileName.lastIndexOf('.');
  return dot === -1 ? '' : fileName.slice(dot + 1).toLowerCase();
}

export function isSpreadsheet(extension: string): boolean {
  return extension === 'xlsx' || extension === 'xls';
}

/**
 * A spreadsheet cell as a string.
 *
 * `read-excel-file` hands back real JS types, which is most of why it was
 * chosen: a date column arrives as `Date` rather than as the serial number
 * `45000`, so the "Excel dates import as five-digit integers" problem never
 * reaches us. Booleans are rendered as `true`/`false` because that is what
 * `parseCheckboxValue` already recognises.
 */
export function cellToString(value: unknown): string {
  if (value === null || value === undefined) return '';
  if (value instanceof Date) return value.toISOString();
  if (typeof value === 'boolean') return value ? 'true' : 'false';
  if (typeof value === 'number') return Number.isFinite(value) ? String(value) : '';
  return String(value).trim();
}

type SniffScore = {
  delimiter: string;
  columns: number;
  /** Fraction of sampled rows whose width matches the header's. */
  consistency: number;
};

function scoreDelimiter(text: string, delimiter: string): SniffScore | null {
  let records: unknown;
  try {
    records = parse(text, {
      delimiter,
      skip_empty_lines: true,
      trim: true,
      relax_column_count: true,
      to: SNIFF_SAMPLE_ROWS,
    });
  } catch {
    return null;
  }

  if (!Array.isArray(records) || records.length === 0) return null;
  const rows = records as string[][];
  const columns = rows[0]?.length ?? 0;
  if (columns < 2) return null;

  const matching = rows.filter(row => row.length === columns).length;
  return { delimiter, columns, consistency: matching / rows.length };
}

/**
 * Pick the delimiter.
 *
 * Scored rather than counted. Counting occurrences in the header line gets
 * `a;b;c` right but falls over on `Name,Description` where descriptions are
 * full of commas and the real delimiter is a semicolon. Parsing with each
 * candidate and asking "did this produce a rectangle?" is the question that
 * actually distinguishes them — a wrong delimiter yields either one column or
 * wildly uneven rows.
 *
 * Consistency outranks column count so a delimiter that happens to appear
 * inside a few fields can't win by shattering rows into more pieces.
 */
export function sniffDelimiter(text: string): string {
  const scores = DELIMITER_CANDIDATES.map(d => scoreDelimiter(text, d)).filter((s): s is SniffScore => s !== null);

  if (scores.length === 0) return ',';

  scores.sort((a, b) => {
    if (b.consistency !== a.consistency) return b.consistency - a.consistency;
    if (b.columns !== a.columns) return b.columns - a.columns;
    // Both equal: keep DELIMITER_CANDIDATES order.
    return DELIMITER_CANDIDATES.indexOf(a.delimiter as never) - DELIMITER_CANDIDATES.indexOf(b.delimiter as never);
  });

  return scores[0].delimiter;
}

function isBlankRow(row: string[]): boolean {
  return row.every(cell => cell.trim() === '');
}

/**
 * Normalise raw records into the table contract.
 *
 * Every row is forced to `headers.length` — short rows padded, long rows
 * truncated — because downstream code indexes cells by column position and a
 * ragged row would silently shift values into the wrong property. The count of
 * rows this touched is returned rather than swallowed so the user can be told
 * their file was reshaped.
 */
export function buildTable(records: unknown[][]): { table: ParsedTable; raggedRows: number } {
  const headerRow = (records[0] ?? []).map(cellToString);
  const width = headerRow.length;

  const rows: string[][] = [];
  let raggedRows = 0;

  for (let i = 1; i < records.length; i++) {
    const raw = records[i];
    if (!Array.isArray(raw)) continue;

    const cells = raw.map(cellToString);
    if (cells.length !== width) raggedRows++;

    const normalized: string[] = new Array(width);
    for (let c = 0; c < width; c++) normalized[c] = cells[c] ?? '';

    if (isBlankRow(normalized)) continue;
    rows.push(normalized);
  }

  return {
    table: { headers: headerRow, rows, rowCount: rows.length },
    raggedRows,
  };
}

function validate(table: ParsedTable): ParseResult | null {
  if (table.headers.length === 0) {
    return { ok: false, code: 'no_columns', message: 'That file has no columns.' };
  }
  if (table.rowCount === 0) {
    return { ok: false, code: 'no_data_rows', message: 'That file has headers but no data rows.' };
  }
  return null;
}

/**
 * Parse delimited text. The delimiter is sniffed unless one is supplied.
 *
 * `relax_column_count` is on so a single malformed row can't fail the whole
 * file — `buildTable` reshapes it and reports the count instead.
 */
export function parseDelimitedText(text: string, forcedDelimiter?: string): ParseResult {
  if (text.trim() === '') {
    return { ok: false, code: 'empty_file', message: 'That file is empty.' };
  }

  const delimiter = forcedDelimiter ?? sniffDelimiter(text);

  let records: unknown;
  try {
    records = parse(text, {
      delimiter,
      skip_empty_lines: true,
      trim: true,
      relax_column_count: true,
      relax_quotes: true,
      bom: true,
    });
  } catch (error) {
    return {
      ok: false,
      code: 'parse_failed',
      message: error instanceof Error ? error.message : 'Could not read that file.',
    };
  }

  if (!Array.isArray(records) || records.length === 0) {
    return { ok: false, code: 'empty_file', message: 'That file is empty.' };
  }

  const { table, raggedRows } = buildTable(records as unknown[][]);
  const invalid = validate(table);
  if (invalid) return invalid;

  return { ok: true, table, delimiter, raggedRows };
}

/**
 * Shape already-extracted spreadsheet rows. Split from the Worker so the
 * reshaping is testable without the xlsx reader or a Worker context.
 */
export function parseSheetRows(rows: unknown[][]): ParseResult {
  if (rows.length === 0) {
    return { ok: false, code: 'empty_file', message: 'That sheet is empty.' };
  }

  const { table, raggedRows } = buildTable(rows);
  const invalid = validate(table);
  if (invalid) return invalid;

  return { ok: true, table, raggedRows };
}

/**
 * Which sheet to read when the workbook has several.
 *
 * The first sheet with data rather than simply the first sheet: workbooks
 * routinely open with a cover or instructions tab, and picking it would parse
 * a title and no rows.
 */
export function pickDefaultSheet(sheets: ReadonlyArray<{ name: string; rowCount: number }>): number {
  const withData = sheets.findIndex(s => s.rowCount > 1);
  return withData === -1 ? 0 : withData;
}

export function unsupportedTypeError(extension: string): ParseResult {
  return {
    ok: false,
    code: 'unsupported_type',
    message: extension
      ? `\`.${extension}\` files aren't supported — upload a CSV or Excel file.`
      : 'That file has no extension — upload a CSV or Excel file.',
  };
}

export function tooLargeError(limitMb: number): ParseResult {
  return { ok: false, code: 'too_large', message: `That file is over ${limitMb}mb.` };
}

export function normalizeExtension(extension: string): SupportedExtension | null {
  switch (extension) {
    case 'csv':
    case 'tsv':
    case 'xlsx':
    case 'xls':
      return extension;
    default:
      return null;
  }
}
