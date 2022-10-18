import { readFileSync } from 'fs';
import path from 'path';
import { v4 as uuid } from 'uuid';
import { describe, expect, it } from 'vitest';
import { convertHealthData, eavRowsToTriples, importCSVFile, readFileAsText } from './import';

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
    const triples = await importCSVFile(file, 's', deterministicUuid);

    expect(triples).toMatchSnapshot();
  });

  it('imports health data format', async () => {
    const file = readMockFile('healthdata.csv');
    const csv = await readFileAsText(file);
    const rows = convertHealthData(csv);

    // So we can see what matches in snapshot tests
    const mockId = (value: string) => value;

    const triples = eavRowsToTriples(rows, 's', mockId);

    expect(triples.slice(0, 15)).toMatchSnapshot();
  });
});
