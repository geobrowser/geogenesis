import { readFileSync } from 'fs';
import { parse as parseCSV } from 'papaparse';
import path from 'path';
import { v4 as uuid } from 'uuid';
import { describe, expect, it } from 'vitest';
import { EavRow, eavRowsToTriples, importCSVFile, readFileAsText } from './import';

function readMockFile(filename: string) {
  const simple = readFileSync(path.join(__dirname, 'mocks', filename), 'utf8');
  return new File([simple], filename);
}

function deterministicUuid(value: string) {
  const random = value
    .slice(0, 16)
    .padEnd(16, '0')
    .split('')
    .map(c => c.charCodeAt(0));

  return uuid({ random });
}

describe('CSV Import', () => {
  it('imports csv', async () => {
    const file = readMockFile('simple.csv');
    const triples = await importCSVFile(file, deterministicUuid);

    expect(triples).toMatchSnapshot();
  });

  it('imports health data format', async () => {
    type CustomRow = {
      ID_content: string;
      'Title/Fact': string;
      Content: string;
      'Entity ID \n(Source)': string;
      Source: string;
      'Entity ID \n(Guest1)': string;
      'Source\n(Guest1)': string;
      'Entity ID \n(Guest2)': string;
      'Source\n(Guest2)': string;
      'Entity ID \n(Guest3)': string;
      'Source\n(Guest3)': string;
      ID_all_guest: string;
      'Entity ID \n(Location)': string;
      SourceLoc: string;
      'Entity ID \n(Category)': string;
      Category: string;
      'Entity ID \n(Platform)': string;
      'Platform/Site': string;
      Date: string;
      ID_Tag1: string;
      Tag1: string;
      ID_Tag2: string;
      Tag2: string;
      ID_Tag3: string;
      Tag3: string;
      ID_Tag4: string;
      Tag4: string;
      ID_Tag5: string;
      Tag5: string;
      ID_Tag6: string;
      Tag6: string;
      ID_Tag7: string;
      Tag7: string;
      ID_Tag8: string;
      Tag8: string;
      ID_Tag9: string;
      Tag9: string;
      ID_Tag10: string;
      Tag10: string;
      ID_Tag11: string;
      Tag11: string;
      ID_all_tags0: string;
      ID_all_tags: string;
      'UNIQUE TAGS': string;
      Tags: string;
      'All tags': string;
    };

    const file = readMockFile('healthdata.csv');
    const csv = await readFileAsText(file);
    const results = parseCSV<CustomRow>(csv, { header: true });

    function toEavRow(row: CustomRow): EavRow[] {
      return [
        [row['Entity ID \n(Source)'], 'name', row.Source],
        [row['Entity ID \n(Location)'], 'name', row.SourceLoc],
        [row['Entity ID \n(Category)'], 'name', row.Category],
        [row.ID_content, 'content', row.Content],
      ];
    }

    const eavRows = results.data.flatMap(toEavRow);

    const triples = eavRowsToTriples(eavRows);

    console.log(triples.slice(0, 3));
  });
});
