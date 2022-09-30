import { readFileSync } from 'fs';
import path from 'path';
import { v4 as uuid } from 'uuid';
import { describe, expect, it } from 'vitest';
import { importCSVFile } from './import';

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
});
