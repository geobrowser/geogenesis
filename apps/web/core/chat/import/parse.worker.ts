/// <reference lib="webworker" />
/**
 * Reads the uploaded file off the main thread.
 *
 * The file itself is passed in rather than its text: `File.text()` allocates
 * the whole string on the calling thread before any parsing starts (the
 * standalone importer's own comment flags this as a v1 limitation), and a
 * spreadsheet is binary, so there is no text to take. `File` is structured-
 * cloneable, so handing the object over costs nothing.
 */
import readXlsxFile from 'read-excel-file/web-worker';

import { isSpreadsheet, normalizeExtension, parseDelimitedText, parseSheetRows, pickDefaultSheet } from './parse';
import { MAX_FILE_SIZE_BYTES, MAX_FILE_SIZE_MB, type ParseResult, type SheetInfo } from './types';

export type ParseRequest = {
  file: File;
  /** Force a sheet by name. Used when the user switches sheets after the first parse. */
  sheetName?: string;
  /** Force a delimiter, overriding the sniff. */
  delimiter?: string;
};

async function readSpreadsheet(file: File, sheetName?: string): Promise<ParseResult> {
  // The whole workbook, so we can report every sheet even when only one is
  // parsed — the user can't pick a sheet they were never shown.
  const workbook = await readXlsxFile(file);

  const sheets: SheetInfo[] = workbook.map(s => ({
    name: s.sheet,
    rowCount: Math.max(0, s.data.length - 1),
  }));

  if (sheets.length === 0) {
    return { ok: false, code: 'empty_file', message: 'That workbook has no sheets.' };
  }

  let index: number;
  if (sheetName) {
    index = sheets.findIndex(s => s.name === sheetName);
    if (index === -1) {
      return { ok: false, code: 'sheet_not_found', message: `That workbook has no sheet called "${sheetName}".` };
    }
  } else {
    index = pickDefaultSheet(sheets);
  }

  // Read from the workbook we already have. `readXlsxFile` types cells the same
  // way `readSheet` would, so re-reading by name would decompress and re-parse
  // a file that can be 10mb for no gain.
  const result = parseSheetRows(workbook[index].data as unknown[][]);
  if (!result.ok) return result;

  return {
    ...result,
    sheetName: sheets[index].name,
    ...(sheets.length > 1 ? { sheets } : {}),
  };
}

export async function parseFile({ file, sheetName, delimiter }: ParseRequest): Promise<ParseResult> {
  if (file.size > MAX_FILE_SIZE_BYTES) {
    return { ok: false, code: 'too_large', message: `That file is over ${MAX_FILE_SIZE_MB}mb.` };
  }

  const dot = file.name.lastIndexOf('.');
  const rawExtension = dot === -1 ? '' : file.name.slice(dot + 1).toLowerCase();
  const extension = normalizeExtension(rawExtension);

  if (!extension) {
    return {
      ok: false,
      code: 'unsupported_type',
      message: rawExtension
        ? `\`.${rawExtension}\` files aren't supported — upload a CSV or Excel file.`
        : 'That file has no extension — upload a CSV or Excel file.',
    };
  }

  try {
    if (isSpreadsheet(extension)) {
      return await readSpreadsheet(file, sheetName);
    }
    // `.tsv` states its delimiter in its name; anything else gets sniffed.
    const forced = delimiter ?? (extension === 'tsv' ? '\t' : undefined);
    return parseDelimitedText(await file.text(), forced);
  } catch (error) {
    return {
      ok: false,
      code: 'parse_failed',
      message: error instanceof Error ? error.message : 'Could not read that file.',
    };
  }
}

self.onmessage = async (event: MessageEvent<ParseRequest>) => {
  try {
    self.postMessage(await parseFile(event.data));
  } catch (error) {
    self.postMessage({
      ok: false,
      code: 'parse_failed',
      message: error instanceof Error ? error.message : 'Could not read that file.',
    } satisfies ParseResult);
  }
};
