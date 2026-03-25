import { describe, expect, it } from 'vitest';

import type { SpaceEntity } from '../types';

import { resolveSearchSpaces } from './orm';

function makeSpaceEntity(spaceId: string, overrides: Partial<SpaceEntity> = {}): SpaceEntity {
  return {
    id: spaceId,
    name: null,
    description: null,
    image: '',
    relations: [],
    spaceId,
    spaces: [spaceId],
    values: [],
    types: [],
    ...overrides,
  };
}

describe('resolveSearchSpaces', () => {
  it('keeps the raw search response space when rehydration data is missing', () => {
    const rawSpace = makeSpaceEntity('space-raw', { name: 'Raw Space', image: 'ipfs://raw' });

    expect(resolveSearchSpaces([rawSpace], {})).toEqual([rawSpace]);
  });

  it('prefers hydrated space data when it is available', () => {
    const rawSpace = makeSpaceEntity('space-1', { name: 'Raw Space' });
    const hydratedSpace = makeSpaceEntity('space-1', { name: 'Hydrated Space', image: 'ipfs://hydrated' });

    expect(resolveSearchSpaces([rawSpace], { 'space-1': hydratedSpace })).toEqual([hydratedSpace]);
  });

  it('drops string-only spaces when hydration data is unavailable', () => {
    expect(resolveSearchSpaces(['space-1'], {})).toEqual([]);
  });
});
