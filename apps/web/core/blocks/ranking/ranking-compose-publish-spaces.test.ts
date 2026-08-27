import { SystemIds } from '@geoprotocol/geo-sdk/lite';

import { describe, expect, it } from 'vitest';

import type { Filter } from '~/core/blocks/data/filters';

import { getRankingPublishSpaceIds, resolveRankingSingleTargetSpaceId } from './ranking-compose-publish-spaces';

describe('getRankingPublishSpaceIds', () => {
  it('uses SPACE_FILTER filters when present', () => {
    const filters: Filter[] = [
      {
        columnId: SystemIds.SPACE_FILTER,
        columnName: 'Space',
        value: 'space-a',
        valueName: 'Space A',
        valueType: 'RELATION',
      },
      {
        columnId: SystemIds.SPACE_FILTER,
        columnName: 'Space',
        value: 'space-b',
        valueName: 'Space B',
        valueType: 'RELATION',
      },
    ];
    expect(getRankingPublishSpaceIds(filters, 'page-space')).toEqual(['space-a', 'space-b']);
  });

  it('falls back to page space when scope is all of Geo', () => {
    expect(getRankingPublishSpaceIds([], 'page-space')).toEqual(['page-space']);
  });
});

describe('resolveRankingSingleTargetSpaceId', () => {
  const spaceFilter = (value: string, valueName: string): Filter => ({
    columnId: SystemIds.SPACE_FILTER,
    columnName: 'Space',
    value,
    valueName,
    valueType: 'RELATION',
  });

  it('returns the sole SPACE filter id', () => {
    expect(resolveRankingSingleTargetSpaceId([spaceFilter('space-a', 'Space A')])).toBe('space-a');
  });

  it('returns null for multiple space filters', () => {
    expect(resolveRankingSingleTargetSpaceId([spaceFilter('space-a', 'A'), spaceFilter('space-b', 'B')])).toBeNull();
  });

  it('returns null for GEO scope (no space filter)', () => {
    expect(resolveRankingSingleTargetSpaceId([])).toBeNull();
  });

  it('returns null for RELATIONS scope', () => {
    const filters: Filter[] = [
      {
        columnId: SystemIds.RELATION_FROM_PROPERTY,
        columnName: null,
        value: 'entity-1',
        valueName: 'Entity',
        valueType: 'RELATION',
      },
    ];
    expect(resolveRankingSingleTargetSpaceId(filters)).toBeNull();
  });
});
