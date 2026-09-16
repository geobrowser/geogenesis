import { describe, expect, it } from 'vitest';

import { decodeDelimitedFile, parseFile } from './parse.worker';

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
