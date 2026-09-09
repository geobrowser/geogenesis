import { describe, expect, it } from 'vitest';

import {
  buildTable,
  cellToString,
  extensionOf,
  isSpreadsheet,
  normalizeExtension,
  parseDelimitedText,
  parseSheetRows,
  pickDefaultSheet,
  sniffDelimiter,
} from './parse';

function ok(result: ReturnType<typeof parseDelimitedText>) {
  if (!result.ok) throw new Error(`expected success, got ${result.code}: ${result.message}`);
  return result;
}

describe('sniffDelimiter', () => {
  it('finds the comma in an ordinary CSV', () => {
    expect(sniffDelimiter('Name,URL\nEthereum,https://ethereum.org')).toBe(',');
  });

  it('finds the semicolon Excel writes in most of Europe', () => {
    // The reason this function exists. The old parser hardcoded `,`, so this
    // file parsed as one column and every import from a European Excel failed.
    expect(sniffDelimiter('Name;URL\nEthereum;https://ethereum.org')).toBe(';');
  });

  it('finds tabs', () => {
    expect(sniffDelimiter('Name\tURL\nEthereum\thttps://ethereum.org')).toBe('\t');
  });

  it('finds pipes', () => {
    expect(sniffDelimiter('Name|URL\nEthereum|https://ethereum.org')).toBe('|');
  });

  it('prefers the delimiter that makes a rectangle, not the most frequent character', () => {
    // Semicolon-separated, but the prose is full of commas — six of them
    // against two semicolons. Counting characters picks the comma and shatters
    // the file; parsing and checking the shape picks the semicolon.
    const text = [
      'Name;Description',
      'Ethereum;A smart contract platform, launched in 2015, by Vitalik Buterin',
      'Polkadot;A sharded protocol, built by Gavin Wood, in 2020',
    ].join('\n');

    expect(sniffDelimiter(text)).toBe(';');
  });

  it('falls back to comma when nothing splits the file', () => {
    expect(sniffDelimiter('JustOneColumn\nvalue\nvalue2')).toBe(',');
  });
});

describe('cellToString', () => {
  it('renders a spreadsheet date as ISO rather than a serial number', () => {
    // Excel stores dates as day counts — 45000 is 2023-03-15. Reading a raw
    // sheet gives you the integer, and a "Founded" column silently imports as
    // 45000. `read-excel-file` hands back a real Date; this keeps it one.
    expect(cellToString(new Date(Date.UTC(2023, 2, 15)))).toBe('2023-03-15T00:00:00.000Z');
  });

  it('renders booleans as words parseCheckboxValue already accepts', () => {
    expect(cellToString(true)).toBe('true');
    expect(cellToString(false)).toBe('false');
  });

  it('renders blank-ish cells as empty string', () => {
    expect(cellToString(null)).toBe('');
    expect(cellToString(undefined)).toBe('');
  });

  it('drops non-finite numbers instead of writing "NaN" into the graph', () => {
    expect(cellToString(NaN)).toBe('');
    expect(cellToString(Infinity)).toBe('');
  });

  it('keeps zero, which is a real value and not a blank', () => {
    expect(cellToString(0)).toBe('0');
    expect(cellToString(false)).toBe('false');
  });

  it('trims strings', () => {
    expect(cellToString('  Ethereum  ')).toBe('Ethereum');
  });
});

describe('buildTable', () => {
  it('takes the first row as headers and the rest as data', () => {
    const { table } = buildTable([
      ['Name', 'URL'],
      ['Ethereum', 'https://ethereum.org'],
    ]);

    expect(table.headers).toEqual(['Name', 'URL']);
    expect(table.rows).toEqual([['Ethereum', 'https://ethereum.org']]);
    expect(table.rowCount).toBe(1);
  });

  it('pads a short row so cells stay under their own header', () => {
    // Without this, a row missing its last cell shifts nothing — but a row
    // missing a *middle* cell would slide every later value one property to
    // the left, and the import would look successful.
    const { table, raggedRows } = buildTable([
      ['Name', 'URL', 'Founded'],
      ['Ethereum', 'https://ethereum.org'],
    ]);

    expect(table.rows[0]).toEqual(['Ethereum', 'https://ethereum.org', '']);
    expect(raggedRows).toBe(1);
  });

  it('truncates a long row and counts it as ragged', () => {
    const { table, raggedRows } = buildTable([
      ['Name', 'URL'],
      ['Ethereum', 'https://ethereum.org', 'extra'],
    ]);

    expect(table.rows[0]).toEqual(['Ethereum', 'https://ethereum.org']);
    expect(raggedRows).toBe(1);
  });

  it('reports zero ragged rows for a clean file', () => {
    const { raggedRows } = buildTable([
      ['Name', 'URL'],
      ['Ethereum', 'https://ethereum.org'],
    ]);

    expect(raggedRows).toBe(0);
  });

  it('drops all-blank rows but keeps rows that only look empty', () => {
    const { table } = buildTable([
      ['Name', 'Founded'],
      ['', ''],
      ['Ethereum', ''],
      ['', '2015'],
    ]);

    expect(table.rows).toEqual([
      ['Ethereum', ''],
      ['', '2015'],
    ]);
  });
});

describe('parseDelimitedText', () => {
  it('parses a comma file end to end', () => {
    const result = ok(parseDelimitedText('Name,URL\nEthereum,https://ethereum.org\nPolkadot,https://polkadot.network'));

    expect(result.table.headers).toEqual(['Name', 'URL']);
    expect(result.table.rowCount).toBe(2);
    expect(result.delimiter).toBe(',');
  });

  it('parses a semicolon file without being told', () => {
    const result = ok(parseDelimitedText('Name;Founded\nEthereum;2015'));

    expect(result.table.headers).toEqual(['Name', 'Founded']);
    expect(result.table.rows).toEqual([['Ethereum', '2015']]);
    expect(result.delimiter).toBe(';');
  });

  it('honours a forced delimiter over the sniff', () => {
    // A .tsv states its delimiter in its name; we should not second-guess it.
    const result = ok(parseDelimitedText('Name\tURL\nEthereum\thttps://a,b.org', '\t'));

    expect(result.table.rows[0]).toEqual(['Ethereum', 'https://a,b.org']);
  });

  it('keeps a quoted delimiter inside its field', () => {
    const result = ok(parseDelimitedText('Name,Description\nEthereum,"A platform, launched in 2015"'));

    expect(result.table.rows[0]).toEqual(['Ethereum', 'A platform, launched in 2015']);
  });

  it('strips a BOM so the first header is not "\\ufeffName"', () => {
    // Excel writes a BOM on CSV export. Left in, the first header never matches
    // anything and column one silently goes unmapped on every Excel-made file.
    const result = ok(parseDelimitedText('﻿Name,URL\nEthereum,https://ethereum.org'));

    expect(result.table.headers[0]).toBe('Name');
  });

  it('survives one malformed row instead of failing the whole file', () => {
    const result = ok(
      parseDelimitedText('Name,URL\nEthereum,https://ethereum.org,oops\nPolkadot,https://polkadot.network')
    );

    expect(result.table.rowCount).toBe(2);
    expect(result.raggedRows).toBe(1);
  });

  it('rejects an empty file', () => {
    expect(parseDelimitedText('')).toMatchObject({ ok: false, code: 'empty_file' });
    expect(parseDelimitedText('   \n  ')).toMatchObject({ ok: false, code: 'empty_file' });
  });

  it('rejects a headers-only file rather than importing nothing', () => {
    expect(parseDelimitedText('Name,URL')).toMatchObject({ ok: false, code: 'no_data_rows' });
  });
});

describe('parseSheetRows', () => {
  it('shapes typed spreadsheet cells into strings', () => {
    const result = parseSheetRows([
      ['Name', 'Founded', 'Active'],
      ['Ethereum', new Date(Date.UTC(2015, 6, 30)), true],
    ]);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.table.rows[0]).toEqual(['Ethereum', '2015-07-30T00:00:00.000Z', 'true']);
  });

  it('rejects an empty sheet', () => {
    expect(parseSheetRows([])).toMatchObject({ ok: false, code: 'empty_file' });
  });
});

describe('pickDefaultSheet', () => {
  it('skips a cover sheet that has no data rows', () => {
    // Workbooks routinely open on an instructions or title tab. Taking sheet 0
    // blindly parses that and reports "no data rows" on a file that has plenty.
    const index = pickDefaultSheet([
      { name: 'Instructions', rowCount: 0 },
      { name: 'Projects', rowCount: 340 },
    ]);

    expect(index).toBe(1);
  });

  it('takes the first sheet when every sheet is empty', () => {
    expect(
      pickDefaultSheet([
        { name: 'A', rowCount: 0 },
        { name: 'B', rowCount: 0 },
      ])
    ).toBe(0);
  });

  it('takes the first sheet when it has data', () => {
    expect(
      pickDefaultSheet([
        { name: 'Projects', rowCount: 5 },
        { name: 'Notes', rowCount: 2 },
      ])
    ).toBe(0);
  });
});

describe('extension handling', () => {
  it('reads the extension off a name', () => {
    expect(extensionOf('projects.csv')).toBe('csv');
    expect(extensionOf('Projects.XLSX')).toBe('xlsx');
    expect(extensionOf('my.data.2026.csv')).toBe('csv');
    expect(extensionOf('noextension')).toBe('');
  });

  it('accepts the four types we read and nothing else', () => {
    expect(normalizeExtension('csv')).toBe('csv');
    expect(normalizeExtension('tsv')).toBe('tsv');
    expect(normalizeExtension('xlsx')).toBe('xlsx');
    expect(normalizeExtension('xls')).toBe('xls');
    expect(normalizeExtension('json')).toBeNull();
    expect(normalizeExtension('numbers')).toBeNull();
  });

  it('knows which types are binary', () => {
    expect(isSpreadsheet('xlsx')).toBe(true);
    expect(isSpreadsheet('xls')).toBe(true);
    expect(isSpreadsheet('csv')).toBe(false);
  });
});
