import { describe, expect, it } from 'vitest';

import {
  makeStubTripleWithDateValue,
  makeStubTripleWithStringValue,
  makeStubTripleWithUrlValue,
} from '../io/mocks/mock-network';
import {
  migrateDateTripleToStringTriple,
  migrateStringTripleToDateTriple,
  migrateStringTripleToUrlTriple,
  migrateUrlTripleToStringTriple,
} from './utils';

describe('migration utils', () => {
  it('migrates from string to date for valid date', () => {
    const triple = makeStubTripleWithStringValue('01/01/2020');
    const migratedTriple = migrateStringTripleToDateTriple(triple);
    expect(migratedTriple?.value).toMatchObject({
      type: 'date',
      value: '2020-01-01T00:00:00.000Z',
      id: 's~01/01/2020',
    });
  });

  it('migrates from string to date for invalid date', () => {
    const triple = makeStubTripleWithStringValue('banana');
    const migratedTriple = migrateStringTripleToDateTriple(triple);
    expect(migratedTriple).toBe(null);
  });

  it('migrates from string to url for valid url', () => {
    const triple = makeStubTripleWithStringValue('https://www.google.com');
    const migratedTriple = migrateStringTripleToUrlTriple(triple);
    expect(migratedTriple?.value).toMatchObject({
      type: 'url',
      value: 'https://www.google.com',
      id: 's~https://www.google.com',
    });
  });

  it('migrates from string to url for invalid url', () => {
    const triple = makeStubTripleWithStringValue('banana');
    const migratedTriple = migrateStringTripleToUrlTriple(triple);
    expect(migratedTriple).toBe(null);
  });

  it('migrates from date to string', () => {
    const triple = makeStubTripleWithDateValue('2020-01-01T00:00:00.000Z');
    const migratedTriple = migrateDateTripleToStringTriple(triple);
    expect(migratedTriple?.value).toMatchObject({
      type: 'string',
      value: '1/1/2020',
      id: 'd~2020-01-01T00:00:00.000Z',
    });
  });

  it('migrates from url to string', () => {
    const triple = makeStubTripleWithUrlValue('https://www.google.com');
    const migratedTriple = migrateUrlTripleToStringTriple(triple);
    expect(migratedTriple?.value).toMatchObject({
      type: 'string',
      value: 'https://www.google.com',
      id: 'u~https://www.google.com',
    });
  });
});
