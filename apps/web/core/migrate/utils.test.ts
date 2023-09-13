import { describe, expect, it } from 'vitest';

import { makeStubTripleWithStringValue } from '../io/mocks/mock-network';
import { migrateStringTripleToDateTriple } from './utils';

describe('migration utils', () => {
  it('migrates from string to date for valid date', () => {
    const triple = makeStubTripleWithStringValue('01/01/2020');
    const migratedTriple = migrateStringTripleToDateTriple(triple);
    expect(migratedTriple?.value).toMatchObject({
      type: 'string',
      value: '2020-01-01T00:00:00.000Z',
      id: 's~01/01/2020',
    });
  });

  it('migrates from string to date for invalid date', () => {
    const triple = makeStubTripleWithStringValue('banana sandwich');
    const migratedTriple = migrateStringTripleToDateTriple(triple);
    expect(migratedTriple).toBe(null);
  });

  // it('migrates from string to url for valid url', () => {});
  // it('migrates from string to url for invalid url', () => {});

  // it('migrates from date to string', () => {});

  // it('migrates from url to string', () => {});
});
