import { readFileSync } from 'fs';
import path from 'path';
import { v4 as uuid } from 'uuid';
import { describe, expect, it } from 'vitest';
import { createTripleWithId } from './create-id';
import { convertHealthData, eavRowsToTriples, importCSVFile, readFileAsText, unique } from './import';

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
    const rows = convertHealthData(csv, { rowCount: 1, shouldIncludeSections: false });

    // So we can see what matches in snapshot tests
    const mockId = (value: string) => value;

    const triples = eavRowsToTriples(rows, 's', mockId);

    expect(triples).toMatchSnapshot();
  });
});

describe('Unique', () => {
  it('returns unique values', () => {
    expect(
      unique([
        createTripleWithId({
          attributeId: 'name',
          entityId: 'e1',
          value: {
            type: 'string',
            value: 'John',
            id: 'v1',
          },
          space: 'space-1',
        }),
        createTripleWithId({
          attributeId: 'name',
          entityId: 'e1',
          value: {
            type: 'string',
            value: 'John',
            id: 'v2',
          },
          space: 'space-1',
        }),
      ])
    ).toEqual([
      {
        id: 'space-1:e1:name:v2',
        attributeId: 'name',
        entityId: 'e1',
        value: {
          type: 'string',
          value: 'John',
          id: 'v2',
        },
        space: 'space-1',
      },
    ]);
  });
});
