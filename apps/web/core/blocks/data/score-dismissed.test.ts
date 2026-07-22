import { SystemIds } from '@geoprotocol/geo-sdk/lite';

import { describe, expect, it } from 'vitest';

import type { Value } from '~/core/types';

import { SCORE_DISMISSED_PROPERTY_ID } from './block-ontology-ids';
import { parseScoreDismissed, readScoreDismissedFromValues, serializeScoreDismissed } from './score-dismissed';

const SPACE_ID = 'space-1';

function makeValue(overrides: Partial<Value> & Pick<Value, 'value'>): Value {
  return {
    id: 'value-1',
    spaceId: SPACE_ID,
    entity: { id: 'block-relation-1', name: null },
    property: { id: SCORE_DISMISSED_PROPERTY_ID, name: 'Score dismissed', dataType: 'BOOLEAN' },
    ...overrides,
  } as Value;
}

describe('parseScoreDismissed', () => {
  it('reads the serialized BOOLEAN forms', () => {
    expect(parseScoreDismissed('1')).toBe(true);
    expect(parseScoreDismissed('0')).toBe(false);
  });

  it('accepts "true" for parity with the publish path', () => {
    expect(parseScoreDismissed('true')).toBe(true);
  });

  it('defaults to not-dismissed when absent or unrecognized', () => {
    expect(parseScoreDismissed(null)).toBe(false);
    expect(parseScoreDismissed(undefined)).toBe(false);
    expect(parseScoreDismissed('')).toBe(false);
    expect(parseScoreDismissed('nonsense')).toBe(false);
  });
});

describe('serializeScoreDismissed', () => {
  it('round-trips through parse', () => {
    expect(parseScoreDismissed(serializeScoreDismissed(true))).toBe(true);
    expect(parseScoreDismissed(serializeScoreDismissed(false))).toBe(false);
  });

  it('emits the BOOLEAN wire form the publish path expects', () => {
    expect(serializeScoreDismissed(true)).toBe('1');
    expect(serializeScoreDismissed(false)).toBe('0');
  });
});

describe('readScoreDismissedFromValues', () => {
  it('returns false when the block has no values', () => {
    expect(readScoreDismissedFromValues(undefined, SPACE_ID)).toBe(false);
    expect(readScoreDismissedFromValues([], SPACE_ID)).toBe(false);
  });

  it('reads the dismissed flag for the matching space', () => {
    expect(readScoreDismissedFromValues([makeValue({ value: '1' })], SPACE_ID)).toBe(true);
    expect(readScoreDismissedFromValues([makeValue({ value: '0' })], SPACE_ID)).toBe(false);
  });

  it('ignores the flag from a different space', () => {
    const value = makeValue({ value: '1', spaceId: 'space-2' });
    expect(readScoreDismissedFromValues([value], SPACE_ID)).toBe(false);
  });

  it('ignores a deleted flag', () => {
    const value = makeValue({ value: '1', isDeleted: true });
    expect(readScoreDismissedFromValues([value], SPACE_ID)).toBe(false);
  });

  it('ignores values for other properties', () => {
    const value = makeValue({
      value: '1',
      property: { id: SystemIds.DESCRIPTION_PROPERTY, name: 'Description', dataType: 'TEXT' },
    });
    expect(readScoreDismissedFromValues([value], SPACE_ID)).toBe(false);
  });
});
