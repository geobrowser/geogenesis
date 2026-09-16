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

import {
  fileBaseName,
  isSpreadsheet,
  normalizeExtension,
  parseDelimitedText,
  parseWorkbook,
  unsupportedTypeError,
} from './parse';
import { MAX_FILE_SIZE_BYTES, MAX_FILE_SIZE_MB, type ParseResult } from './types';

export type ParseRequest = {
  file: File;
  /** Force a delimiter, overriding the sniff. */
  delimiter?: string;
};

async function readSpreadsheet(file: File): Promise<ParseResult> {
  const workbook = await readXlsxFile(file);
  return parseWorkbook(workbook.map(sheet => ({ name: sheet.sheet, data: sheet.data as unknown[][] })));
}

/** Excel's Unicode Text exports use UTF-16; File.text() always assumes UTF-8. */
export function decodeDelimitedFile(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  if (bytes[0] === 0xff && bytes[1] === 0xfe) return new TextDecoder('utf-16le').decode(bytes);
  if (bytes[0] === 0xfe && bytes[1] === 0xff) return new TextDecoder('utf-16be').decode(bytes);
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch {
    return new TextDecoder('windows-1252').decode(bytes);
  }
}

export async function parseFile({ file, delimiter }: ParseRequest): Promise<ParseResult> {
  if (file.size > MAX_FILE_SIZE_BYTES) {
    return { ok: false, code: 'too_large', message: `That file is over ${MAX_FILE_SIZE_MB}mb.` };
  }

  const dot = file.name.lastIndexOf('.');
  const rawExtension = dot === -1 ? '' : file.name.slice(dot + 1).toLowerCase();
  const extension = normalizeExtension(rawExtension);

  if (!extension) {
    return unsupportedTypeError(rawExtension);
  }

  try {
    if (isSpreadsheet(extension)) {
      return await readSpreadsheet(file);
    }
    // `.tsv` states its delimiter in its name; anything else gets sniffed.
    const forced = delimiter ?? (extension === 'tsv' ? '\t' : undefined);
    return parseDelimitedText(decodeDelimitedFile(await file.arrayBuffer()), forced, fileBaseName(file.name));
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
