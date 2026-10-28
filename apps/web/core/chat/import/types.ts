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

/**
 * One table out of a file. A workbook yields one per data tab; a delimited
 * file yields exactly one, named after the file.
 */
export type ParsedSheet = {
  name: string;
  table: ParsedTable;
  /**
   * Rows whose cell count didn't match the header count. They are padded or
   * extended with unnamed columns; this is how many were touched, so the caller can say so
   * rather than silently reshaping the user's file.
   */
  raggedRows: number;
  /** Title and note lines found above the header row and left out. */
  skippedLeadingRows: number;
};

export type SkippedSheetReason = 'empty' | 'no_data_rows' | 'notes';

/** A tab that was read and left out, with the reason the user is told. */
export type SkippedSheet = {
  name: string;
  reason: SkippedSheetReason;
};

export type ParseErrorCode =
  'unsupported_type' | 'too_large' | 'empty_file' | 'no_data_rows' | 'no_columns' | 'parse_failed';

export type ParseSuccess = {
  ok: true;
  /** Every tab with a table in it, in workbook order. Never empty. */
  sheets: ParsedSheet[];
  skippedSheets: SkippedSheet[];
  /** Which delimiter was detected. CSV only — useful when a sniff goes wrong. */
  delimiter?: string;
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

export type SupportedExtension = 'csv' | 'tsv' | 'xlsx';

export const SUPPORTED_EXTENSIONS: readonly SupportedExtension[] = ['csv', 'tsv', 'xlsx'];
