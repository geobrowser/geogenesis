import { SystemIds } from '@geoprotocol/geo-sdk/lite';

import { describe, expect, it } from 'vitest';

import type { Filter } from '~/core/blocks/data/filters';
import type { Source } from '~/core/blocks/data/source';

import { getRankingPublishSpaceIds } from './ranking-compose-publish-spaces';

describe('getRankingPublishSpaceIds', () => {
  it('uses SPACES source when set', () => {
    const source: Source = { type: 'SPACES', value: ['space-a', 'space-b'] };
    expect(getRankingPublishSpaceIds(source, [], 'page-space')).toEqual(['space-a', 'space-b']);
  });

  it('falls back to SPACE_FILTER filters', () => {
    const source: Source = { type: 'GEO' };
    const filters: Filter[] = [
      {
        columnId: SystemIds.SPACE_FILTER,
        columnName: 'Space',
        value: 'filter-space',
        valueName: 'Filter Space',
        valueType: 'RELATION',
      },
    ];
    expect(getRankingPublishSpaceIds(source, filters, 'page-space')).toEqual(['filter-space']);
  });

  it('falls back to page space', () => {
    const source: Source = { type: 'COLLECTION', value: 'collection-id' };
    expect(getRankingPublishSpaceIds(source, [], 'page-space')).toEqual(['page-space']);
  });
});
