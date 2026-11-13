import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

import { coerce } from './coerce';
import { decodeDelimitedFile, parseFile } from './parse.worker';

function fixtureFile(name: string): File {
  const bytes = readFileSync(path.join(__dirname, 'fixtures', name));
  const buffer = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
  const file = new File([buffer], name);
  Object.defineProperty(file, 'arrayBuffer', { value: async () => buffer });
  return file;
}

describe('xlsx numbers', () => {
  it('keeps a large integer and a high-precision decimal exactly as the workbook holds them', async () => {
    const result = await parseFile({ file: fixtureFile('precision.xlsx') });
    expect(result).toMatchObject({
      ok: true,
      sheets: [
        {
          name: 'Readings',
          table: {
            headers: ['Name', 'Serial', 'Reading', 'Typed'],
            rows: [
              ['Alpha', '9007199254740993', '12345678901234567890.123456789', '1.1'],
              ['Beta', '88259496234518.57', '0.3', '42'],
            ],
          },
        },
      ],
    });
    if (!result.ok) return;
    const [alpha] = result.sheets[0].table.rows;
    expect(coerce('decimal', alpha[1])).toEqual({ ok: true, value: '9007199254740993' });
    expect(coerce('decimal', alpha[2])).toEqual({ ok: true, value: '12345678901234567890.123456789' });
  });
});

describe('file encodings and format validation', () => {
  it('reads Excel UTF-16 tab-delimited exports without corrupting names', async () => {
    const text = 'Name\tCity\nZoë\tMünchen';
    const bytes = new Uint8Array(2 + text.length * 2);
    bytes.set([0xff, 0xfe]);
    for (let index = 0; index < text.length; index++) {
      bytes[2 + index * 2] = text.charCodeAt(index) & 255;
      bytes[3 + index * 2] = text.charCodeAt(index) >> 8;
    }
    const file = new File([bytes], 'people.tsv');
    Object.defineProperty(file, 'arrayBuffer', { value: async () => bytes.buffer });
    expect(await parseFile({ file })).toMatchObject({
      ok: true,
      sheets: [{ table: { headers: ['Name', 'City'], rows: [['Zoë', 'München']] } }],
    });
  });

  it('decodes a Windows CSV with accented characters', () => {
    expect(decodeDelimitedFile(new Uint8Array([0x43, 0x61, 0x66, 0xe9]).buffer)).toBe('Café');
  });

  it('explains how to convert an unsupported binary XLS workbook', async () => {
    expect(await parseFile({ file: new File(['legacy'], 'people.xls') })).toMatchObject({
      ok: false,
      code: 'unsupported_type',
      message: expect.stringContaining('as .xlsx'),
    });
  });
});
