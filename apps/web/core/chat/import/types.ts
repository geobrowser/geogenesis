/**
 * Shared shapes for assistant-driven file import.
 *
 * The contract the whole pipeline is built around is `ParsedTable` — headers
 * plus rows of plain strings. It is deliberately the same shape the existing
 * importer's engine already consumes (`partials/import/import-generation.ts`),
 * so a parsed file can be handed straight to `buildImportPlan` without a
 * translation layer.
 */

export type ParsedTable = {
  headers: string[];
  /** Data rows only — no header row, no all-blank rows. Every row is `headers.length` wide. */
  rows: string[][];
  rowCount: number;
};

export type SheetInfo = {
  name: string;
  rowCount: number;
};

export type ParseErrorCode =
  'unsupported_type' | 'too_large' | 'empty_file' | 'no_data_rows' | 'no_columns' | 'sheet_not_found' | 'parse_failed';

export type ParseSuccess = {
  ok: true;
  table: ParsedTable;
  /** Which delimiter was detected. CSV only — useful when a sniff goes wrong. */
  delimiter?: string;
  /** Every sheet in the workbook. XLSX only, and only when there is more than one. */
  sheets?: SheetInfo[];
  /** The sheet actually parsed. XLSX only. */
  sheetName?: string;
  /**
   * Rows whose cell count didn't match the header count. They are padded or
   * truncated to fit; this is how many were touched, so the caller can say so
   * rather than silently reshaping the user's file.
   */
  raggedRows: number;
};

export type ParseFailure = {
  ok: false;
  code: ParseErrorCode;
  message: string;
};

export type ParseResult = ParseSuccess | ParseFailure;

/** Matches the standalone importer's existing cap. */
export const MAX_FILE_SIZE_MB = 10;
export const MAX_FILE_SIZE_BYTES = MAX_FILE_SIZE_MB * 1024 * 1024;

export type SupportedExtension = 'csv' | 'tsv' | 'xlsx' | 'xls';

export const SUPPORTED_EXTENSIONS: readonly SupportedExtension[] = ['csv', 'tsv', 'xlsx', 'xls'];
