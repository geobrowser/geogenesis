/**
 * Turning an uploaded file into tables of `{ headers, rows }`.
 *
 * Parsing and table shaping can be tested directly. The
 * Worker (`parse.worker.ts`) reads the File and calls `read-excel-file`; the
 * shaping decisions all live here.
 *
 * Replaces `partials/import/csv-parse.worker.ts`, which hardcoded
 * `delimiter: ','` and read only text. Two things it could not do:
 * semicolon/tab-separated exports (the default for Excel in most of Europe),
 * and spreadsheets at all.
 */
import { parse } from 'csv/browser/esm/sync';

import {
  type ParseFailure,
  type ParseResult,
  type ParsedSheet,
  type ParsedTable,
  type SkippedSheet,
  type SupportedExtension,
} from './types';

/**
 * Candidates in the order we'd rather have them, so a genuine tie resolves to
 * the most common convention. `\t` is here for `.tsv` and for the "Unicode
 * Text" that Excel produces on Save As.
 */
const DELIMITER_CANDIDATES = [',', ';', '\t', '|'] as const;

/** Enough rows to tell a real delimiter from a character that appears in prose. */
const SNIFF_SAMPLE_ROWS = 20;

/** How far down a sheet the header row is looked for. */
const HEADER_SCAN_ROWS = 20;

/** A one-column sheet whose cells average longer than this is prose, not data. */
const NOTES_CELL_CHARS = 40;

export function extensionOf(fileName: string): string {
  const dot = fileName.lastIndexOf('.');
  return dot === -1 ? '' : fileName.slice(dot + 1).toLowerCase();
}

/** `publishers.csv` → `publishers`: the name a delimited file's one table goes by. */
export function fileBaseName(fileName: string): string {
  const dot = fileName.lastIndexOf('.');
  const base = dot <= 0 ? fileName : fileName.slice(0, dot);
  return base.trim() || fileName;
}

export function isSpreadsheet(extension: string): boolean {
  return extension === 'xlsx';
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
      bom: true,
      to: SNIFF_SAMPLE_ROWS,
    });
  } catch {
    return null;
  }

  if (!Array.isArray(records) || records.length === 0) return null;
  const rows = records as string[][];
  // Titles and export notes can precede the table. Score its repeated width,
  // rather than making the first line decide whether a delimiter is valid.
  const widths = new Map<number, number>();
  for (const row of rows) {
    if (row.length > 1) widths.set(row.length, (widths.get(row.length) ?? 0) + 1);
  }
  const best = [...widths].sort((a, b) => b[1] - a[1] || b[0] - a[0])[0];
  if (!best) return null;
  const [columns, matching] = best;
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

function filledCells(row: unknown): number {
  if (!Array.isArray(row)) return 0;
  return row.filter(cell => cellToString(cell) !== '').length;
}

/**
 * Which row holds the column names.
 *
 * Not always the first. Exported workbooks routinely open with a title, a
 * subtitle and a line of instructions, each sitting alone in column A, and
 * then a blank line before the real header. Taking row 1 blindly turns the
 * title into the only header, leaves every other column unnamed, and pushes
 * the real header down into the data.
 *
 * The header is the first row that is about as wide as the widest row nearby.
 * Width means filled cells, so a title in A1 counts as one, and a header of
 * twelve names counts as twelve.
 */
export function findHeaderRow(records: ReadonlyArray<unknown>): number {
  const widths = records.slice(0, HEADER_SCAN_ROWS).map(filledCells);
  const widest = Math.max(0, ...widths);

  if (widest < 2) {
    const firstFilled = widths.findIndex(width => width > 0);
    return firstFilled === -1 ? 0 : firstFilled;
  }

  const threshold = Math.max(2, Math.ceil(widest * 0.6));
  const index = widths.findIndex(width => width >= threshold);
  return index === -1 ? 0 : index;
}

/**
 * Normalise raw records into the table contract.
 *
 * Preserve cells beyond the header width as additional, explicitly unnamed
 * columns. Padding makes indexing stable; truncating would lose curator data.
 */
export function buildTable(records: unknown[][]): {
  table: ParsedTable;
  raggedRows: number;
  skippedLeadingRows: number;
} {
  const headerIndex = findHeaderRow(records);
  const headerRow = (records[headerIndex] ?? []).map(cellToString);
  const headerWidth = headerRow.length;
  const width = records.slice(headerIndex).reduce((max, row) => Math.max(max, row.length), headerWidth);
  const headers = Array.from({ length: width }, (_, index) => headerRow[index] || `Column ${index + 1}`);

  let skippedLeadingRows = 0;
  for (let i = 0; i < headerIndex; i++) {
    if (filledCells(records[i]) > 0) skippedLeadingRows++;
  }

  const rows: string[][] = [];
  let raggedRows = 0;

  for (let i = headerIndex + 1; i < records.length; i++) {
    const raw = records[i];
    if (!Array.isArray(raw)) continue;

    const cells = raw.map(cellToString);
    if (cells.length !== headerWidth) raggedRows++;

    const normalized: string[] = new Array(width);
    for (let c = 0; c < width; c++) normalized[c] = cells[c] ?? '';

    if (isBlankRow(normalized)) continue;
    rows.push(normalized);
  }

  return {
    table: { headers, rows, rowCount: rows.length },
    raggedRows,
    skippedLeadingRows,
  };
}

/**
 * A one-column sheet of sentences — an instructions tab, a changelog, a
 * readme — rather than a list of names. Kept out of a workbook import so it
 * does not become a type with thirty prose-shaped entities.
 */
export function looksLikeNotes(table: ParsedTable): boolean {
  if (table.headers.length !== 1) return false;
  const cells = [table.headers[0], ...table.rows.map(row => row[0] ?? '')].filter(cell => cell !== '');
  if (cells.length === 0) return true;
  const averageLength = cells.reduce((sum, cell) => sum + cell.length, 0) / cells.length;
  return averageLength > NOTES_CELL_CHARS;
}

function validate(table: ParsedTable): ParseFailure | null {
  if (table.headers.length === 0) {
    return { ok: false, code: 'no_columns', message: 'That file has no columns.' };
  }
  if (table.rowCount === 0) {
    return { ok: false, code: 'no_data_rows', message: 'That file has headers but no data rows.' };
  }
  return null;
}

type SheetParseResult = { ok: true; table: ParsedTable; raggedRows: number; skippedLeadingRows: number } | ParseFailure;

/**
 * Parse delimited text. The delimiter is sniffed unless one is supplied.
 *
 * `relax_column_count` is on so a single malformed row can't fail the whole
 * file — `buildTable` reshapes it and reports the count instead.
 */
export function parseDelimitedText(text: string, forcedDelimiter?: string, name: string = ''): ParseResult {
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

  const { table, raggedRows, skippedLeadingRows } = buildTable(records as unknown[][]);
  const invalid = validate(table);
  if (invalid) return invalid;

  return { ok: true, sheets: [{ name, table, raggedRows, skippedLeadingRows }], skippedSheets: [], delimiter };
}

/**
 * Shape already-extracted spreadsheet rows. Split from the Worker so the
 * reshaping is testable without the xlsx reader or a Worker context.
 */
export function parseSheetRows(rows: unknown[][]): SheetParseResult {
  if (rows.length === 0) {
    return { ok: false, code: 'empty_file', message: 'That sheet is empty.' };
  }

  const { table, raggedRows, skippedLeadingRows } = buildTable(rows);
  const invalid = validate(table);
  if (invalid) return invalid;

  return { ok: true, table, raggedRows, skippedLeadingRows };
}

/**
 * Every tab of a workbook that holds a table.
 *
 * All of them, not a chosen one: a workbook with a tab per type is one dataset,
 * and the tabs reference each other by name. Tabs that hold no table — empty,
 * header only, or a column of notes — are reported as skipped, so the user is
 * told what was left out rather than finding a type called "Instructions".
 */
export function parseWorkbook(sheets: ReadonlyArray<{ name: string; data: unknown[][] }>): ParseResult {
  if (sheets.length === 0) {
    return { ok: false, code: 'empty_file', message: 'That workbook has no sheets.' };
  }

  const parsed: ParsedSheet[] = [];
  const skipped: SkippedSheet[] = [];

  for (const sheet of sheets) {
    const result = parseSheetRows(sheet.data);
    if (!result.ok) {
      skipped.push({ name: sheet.name, reason: result.code === 'no_data_rows' ? 'no_data_rows' : 'empty' });
      continue;
    }
    if (sheets.length > 1 && looksLikeNotes(result.table)) {
      skipped.push({ name: sheet.name, reason: 'notes' });
      continue;
    }
    parsed.push({
      name: sheet.name,
      table: result.table,
      raggedRows: result.raggedRows,
      skippedLeadingRows: result.skippedLeadingRows,
    });
  }

  if (parsed.length === 0) {
    return {
      ok: false,
      code: 'no_data_rows',
      message:
        sheets.length === 1
          ? 'That sheet has headers but no data rows.'
          : 'None of the tabs in that workbook holds a table of data.',
    };
  }

  return { ok: true, sheets: parsed, skippedSheets: skipped };
}

export function unsupportedTypeError(extension: string): ParseResult {
  return {
    ok: false,
    code: 'unsupported_type',
    message:
      extension === 'xls'
        ? 'Save this legacy Excel workbook as .xlsx, then attach it again. CSV and TSV are also supported.'
        : extension
          ? `\`.${extension}\` files aren't supported — upload a CSV, TSV or .xlsx workbook.`
          : 'That file has no extension — upload a CSV, TSV or .xlsx workbook.',
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
      return extension;
    default:
      return null;
  }
}
