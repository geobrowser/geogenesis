import { describe, expect, it } from 'vitest';

import {
  buildTable,
  cellToString,
  extensionOf,
  fileBaseName,
  findHeaderRow,
  isSpreadsheet,
  looksLikeNotes,
  normalizeExtension,
  parseDelimitedText,
  parseSheetRows,
  parseWorkbook,
  sniffDelimiter,
} from './parse';

function ok(result: ReturnType<typeof parseDelimitedText>) {
  if (!result.ok) throw new Error(`expected success, got ${result.code}: ${result.message}`);
  return { ...result, table: result.sheets[0].table, raggedRows: result.sheets[0].raggedRows };
}

// The shape Armando's workbook has: a title, a subtitle and a line of
// instructions in column A, a blank line, then the real header.
const TITLED_SHEET: unknown[][] = [
  ['US POLITICS — EXISTING GEO — CONNECT', null, null, null],
  ['29 Publishers • operational list', null, null, null],
  ['Engineering: connect the existing Geo Publisher entity', null, null, null],
  [null, null, null, null],
  ['Priority', 'Publisher', 'Country', 'Publisher URL'],
  ['P1', 'The New York Times', 'United States', 'https://www.nytimes.com/'],
  ['P1', 'Fox News', 'United States', 'https://www.foxnews.com/'],
];

describe('sniffDelimiter', () => {
  it('finds the table delimiter below an export title', () => {
    const result = ok(parseDelimitedText('Company export\nName;Website\nAcme;https://example.com'));
    expect(result.delimiter).toBe(';');
    expect(result.table).toEqual({
      headers: ['Name', 'Website'],
      rows: [['Acme', 'https://example.com']],
      rowCount: 1,
    });
  });

  it('recognizes quoted headers after a UTF-8 BOM', () => {
    expect(ok(parseDelimitedText('\uFEFF"Name";"Website"\n"Acme";"https://example.com"')).table.headers).toEqual([
      'Name',
      'Website',
    ]);
  });
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

describe('findHeaderRow', () => {
  it('takes row 1 when it is as wide as the data', () => {
    expect(
      findHeaderRow([
        ['Name', 'URL'],
        ['Ethereum', 'https://ethereum.org'],
      ])
    ).toBe(0);
  });

  it('skips title lines that sit alone in column A', () => {
    // Taking row 1 blindly made the title the only header, left every other
    // column unnamed, and pushed the real header into the data — which is how
    // a 29-publisher sheet became "32 rows" and the name column had no header.
    expect(findHeaderRow(TITLED_SHEET)).toBe(4);
  });

  it('takes the first filled row of a one-column file', () => {
    expect(findHeaderRow([[null], ['Topic'], ['AI'], ['Crypto']])).toBe(1);
  });

  it('falls back to row 1 for an empty sheet', () => {
    expect(findHeaderRow([])).toBe(0);
    expect(findHeaderRow([[null, null]])).toBe(0);
  });
});

describe('looksLikeNotes', () => {
  it('calls a column of sentences notes', () => {
    expect(
      looksLikeNotes({
        headers: ['Task: publish the publishers from the World affairs tab into Geo'],
        rows: [['Only rows with a homepage should be published, the rest are drafts.']],
        rowCount: 1,
      })
    ).toBe(true);
  });

  it('keeps a column of short names', () => {
    // A Topics tab with nothing but topic names is data, not a readme.
    expect(looksLikeNotes({ headers: ['Topic'], rows: [['AI'], ['Crypto'], ['Health']], rowCount: 3 })).toBe(false);
  });

  it('never calls a multi-column table notes', () => {
    expect(looksLikeNotes({ headers: ['Name', 'Notes'], rows: [['A', 'x'.repeat(200)]], rowCount: 1 })).toBe(false);
  });
});

describe('buildTable', () => {
  it('reads the header from below the title lines and counts what it skipped', () => {
    const { table, skippedLeadingRows } = buildTable(TITLED_SHEET);

    expect(table.headers).toEqual(['Priority', 'Publisher', 'Country', 'Publisher URL']);
    expect(table.rowCount).toBe(2);
    expect(table.rows[0][1]).toBe('The New York Times');
    expect(skippedLeadingRows).toBe(3);
  });

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

  it('preserves cells beyond the header as additional columns and reports the ragged row', () => {
    const { table, raggedRows } = buildTable([
      ['Name', 'URL'],
      ['Ethereum', 'https://ethereum.org', 'extra'],
    ]);

    expect(table.headers).toEqual(['Name', 'URL', 'Column 3']);
    expect(table.rows[0]).toEqual(['Ethereum', 'https://ethereum.org', 'extra']);
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

  it('names the one table after the file', () => {
    const result = parseDelimitedText('Name,URL\nEthereum,https://ethereum.org', undefined, 'projects');

    expect(result.ok && result.sheets.map(s => s.name)).toEqual(['projects']);
  });
});

describe('fileBaseName', () => {
  it('drops the extension and nothing else', () => {
    expect(fileBaseName('publishers.csv')).toBe('publishers');
    expect(fileBaseName('my.data.2026.xlsx')).toBe('my.data.2026');
    expect(fileBaseName('noextension')).toBe('noextension');
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

describe('parseWorkbook', () => {
  const publishers: unknown[][] = [
    ['Publisher', 'Country'],
    ['Reuters', 'United Kingdom'],
  ];
  const countries: unknown[][] = [
    ['Country', 'Region'],
    ['United Kingdom', 'Europe'],
  ];

  it('keeps every tab that holds a table, in workbook order', () => {
    // The old picker took the first tab with data and stopped, so "import the
    // world affairs tab" could only ever get the first tab.
    const result = parseWorkbook([
      { name: 'Publishers', data: publishers },
      { name: 'Countries', data: countries },
    ]);

    expect(result.ok && result.sheets.map(s => s.name)).toEqual(['Publishers', 'Countries']);
    expect(result.ok && result.sheets[1].table.rows).toEqual([['United Kingdom', 'Europe']]);
  });

  it('leaves out an instructions tab and says so', () => {
    const result = parseWorkbook([
      {
        name: 'Instructions',
        data: [
          ['Task: publish the publishers from the World affairs tab into Geo'],
          ['Only rows with a homepage should be published.'],
        ],
      },
      { name: 'Publishers', data: publishers },
    ]);

    expect(result.ok && result.sheets.map(s => s.name)).toEqual(['Publishers']);
    expect(result.ok && result.skippedSheets).toEqual([{ name: 'Instructions', reason: 'notes' }]);
  });

  it('leaves out an empty tab and a header-only tab with their reasons', () => {
    const result = parseWorkbook([
      { name: 'Empty', data: [] },
      { name: 'Template', data: [['Name', 'URL']] },
      { name: 'Publishers', data: publishers },
    ]);

    expect(result.ok && result.skippedSheets).toEqual([
      { name: 'Empty', reason: 'empty' },
      { name: 'Template', reason: 'no_data_rows' },
    ]);
  });

  it('reads each tab from below its own title lines', () => {
    const result = parseWorkbook([
      { name: 'US Politics', data: TITLED_SHEET },
      { name: 'World Affairs', data: TITLED_SHEET },
    ]);

    expect(result.ok && result.sheets.every(s => s.table.headers[1] === 'Publisher')).toBe(true);
    expect(result.ok && result.sheets.every(s => s.skippedLeadingRows === 3)).toBe(true);
  });

  it('keeps a one-column tab of names when it is the only tab', () => {
    const result = parseWorkbook([{ name: 'Topics', data: [['Topic'], ['AI'], ['Crypto']] }]);

    expect(result.ok && result.sheets).toHaveLength(1);
  });

  it('fails when no tab holds a table', () => {
    expect(
      parseWorkbook([
        { name: 'A', data: [] },
        { name: 'B', data: [['Name']] },
      ])
    ).toMatchObject({
      ok: false,
      code: 'no_data_rows',
    });
    expect(parseWorkbook([])).toMatchObject({ ok: false, code: 'empty_file' });
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
    expect(normalizeExtension('xls')).toBeNull();
    expect(normalizeExtension('json')).toBeNull();
    expect(normalizeExtension('numbers')).toBeNull();
  });

  it('knows which types are binary', () => {
    expect(isSpreadsheet('xlsx')).toBe(true);
    expect(isSpreadsheet('xls')).toBe(false);
    expect(isSpreadsheet('csv')).toBe(false);
  });
});
