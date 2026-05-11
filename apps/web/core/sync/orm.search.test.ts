import { describe, expect, it } from 'vitest';

import type { Entity, SearchResult, SpaceEntity } from '../types';
import { applyKnownEntitySpaces, getSearchResultNameForTopSpace, mergeResolvableSpaces, resolveSearchSpaces } from './orm';

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

describe('applyKnownEntitySpaces', () => {
  it('uses the entity-wide known space list instead of the query-specific search row spaces', () => {
    const result = {
      id: 'entity-1',
      name: 'Entity',
      description: null,
      types: [],
      spaces: [makeSpaceEntity('returned-space', { name: 'Returned Space' })],
    };
    const knownEntity = {
      spaces: ['top-ranked-space', 'returned-space'],
    } as Pick<Entity, 'spaces'>;

    expect(applyKnownEntitySpaces(result, knownEntity).spaces).toEqual(['top-ranked-space', 'returned-space']);
  });

  it('keeps search row spaces when entity details are unavailable', () => {
    const spaces = [makeSpaceEntity('returned-space', { name: 'Returned Space' })];
    const result = {
      id: 'entity-1',
      name: 'Entity',
      description: null,
      types: [],
      spaces,
    };

    expect(applyKnownEntitySpaces(result, null).spaces).toBe(spaces);
  });

  it('uses an empty known space list to suppress stale search row spaces', () => {
    const result: SearchResult = {
      id: 'entity-1',
      name: 'Entity',
      description: null,
      types: [],
      spaces: [makeSpaceEntity('stale-space', { name: 'Stale Space' })],
    };
    const knownEntity = {
      spaces: [],
    } as Pick<Entity, 'spaces'>;

    expect(applyKnownEntitySpaces(result, knownEntity).spaces).toEqual([]);
  });
});

describe('mergeResolvableSpaces', () => {
  it('preserves remote spaces and appends deduped local-only spaces', () => {
    const remoteSpace = makeSpaceEntity('space-1', { name: 'Remote Space' });

    expect(mergeResolvableSpaces([remoteSpace, 'space-2'], ['space-2', 'space-3'])).toEqual([
      remoteSpace,
      'space-2',
      'space-3',
    ]);
  });
});

describe('getSearchResultNameForTopSpace', () => {
  it('uses the name from the top displayed space', () => {
    expect(
      getSearchResultNameForTopSpace(
        {
          name: '',
          namesBySpace: {
            'stale-space': '',
            'top-space': 'Top Space Name',
          },
        },
        [makeSpaceEntity('top-space')]
      )
    ).toBe('Top Space Name');
  });

  it('falls back to the grouped result name when the top space name is blank', () => {
    expect(
      getSearchResultNameForTopSpace(
        {
          name: 'Grouped Name',
          namesBySpace: {
            'top-space': '',
          },
        },
        [makeSpaceEntity('top-space')]
      )
    ).toBe('Grouped Name');
  });

  it('returns null when neither the top space nor grouped result has a real name', () => {
    expect(
      getSearchResultNameForTopSpace(
        {
          name: '   ',
          namesBySpace: {
            'top-space': '',
          },
        },
        [makeSpaceEntity('top-space')]
      )
    ).toBeNull();
  });
});
