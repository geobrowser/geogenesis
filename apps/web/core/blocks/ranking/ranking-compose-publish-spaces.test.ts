import { SystemIds } from '@geoprotocol/geo-sdk/lite';

import { describe, expect, it } from 'vitest';

import type { Filter } from '~/core/blocks/data/filters';

import { getRankingPublishSpaceIds } from './ranking-compose-publish-spaces';

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
