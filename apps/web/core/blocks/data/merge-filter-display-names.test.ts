import { describe, expect, it } from 'vitest';

import type { Filter } from './filters';
import { mergeFilterDisplayNames } from './use-filters';

const CRYPTO = 'e7d737c536764c609fa16aa64a8c90ad';
const TOPIC = 'a126ca530c8e48d5b88882c734c38935';

function filter(overrides: Partial<Filter> = {}): Filter {
  return {
    columnId: 'column-1',
    columnName: null,
    valueType: 'RELATION',
    value: CRYPTO,
    valueName: null,
    ...overrides,
  } as Filter;
}

describe('mergeFilterDisplayNames', () => {
  // The bug this exists for: callers build the next filter list from the raw parse, which carries
  // no names, so adding one filter blanked out the names of every filter already on screen.
  it('carries a resolved name onto the same filter parsed fresh', () => {
    const resolved = [filter({ columnName: 'Topics', valueName: 'Crypto' })];

    const merged = mergeFilterDisplayNames([filter()], resolved);

    expect(merged[0].valueName).toBe('Crypto');
    expect(merged[0].columnName).toBe('Topics');
  });

  it('keeps the names of existing filters when a new one joins them', () => {
    const resolved = [filter({ columnName: 'Topics', valueName: 'Crypto' })];
    const withNewFilter = [filter(), filter({ value: TOPIC, columnName: 'Topics', valueName: 'Podcasts' })];

    const merged = mergeFilterDisplayNames(withNewFilter, resolved);

    expect(merged.map(f => f.valueName)).toEqual(['Crypto', 'Podcasts']);
  });

  // Identity includes the value, so a filter pointing somewhere new must not inherit the old label.
  it('does not lend a name to a filter whose value changed', () => {
    const resolved = [filter({ valueName: 'Crypto' })];

    const merged = mergeFilterDisplayNames([filter({ value: TOPIC })], resolved);

    expect(merged[0].valueName).toBeNull();
  });

  it('leaves a name the caller already supplied alone', () => {
    const resolved = [filter({ valueName: 'Stale' })];

    const merged = mergeFilterDisplayNames([filter({ valueName: 'Fresh' })], resolved);

    expect(merged[0].valueName).toBe('Fresh');
  });

  it('is a no-op when nothing has been resolved yet', () => {
    const merged = mergeFilterDisplayNames([filter()], []);

    expect(merged[0].valueName).toBeNull();
  });
});
