import { SystemIds } from '@geoprotocol/geo-sdk/lite';

import { describe, expect, it } from 'vitest';

import type { Filter } from '~/core/blocks/data/filters';
import { getScopeFromFilters } from '~/core/blocks/data/source';

describe('getScopeFromFilters', () => {
  it('returns GEO when no scope filters are set', () => {
    expect(getScopeFromFilters([])).toEqual({ type: 'GEO' });
  });

  it('returns SPACES from SPACE_FILTER filters', () => {
    const filters: Filter[] = [
      {
        columnId: SystemIds.SPACE_FILTER,
        columnName: 'Space',
        value: 'space-a',
        valueName: 'Space A',
        valueType: 'RELATION',
      },
    ];
    expect(getScopeFromFilters(filters)).toEqual({ type: 'SPACES', value: ['space-a'] });
  });

  it('returns RELATIONS when RELATION_FROM filter is set', () => {
    const filters: Filter[] = [
      {
        columnId: SystemIds.RELATION_FROM_PROPERTY,
        columnName: 'From',
        value: 'entity-1',
        valueName: 'Entity',
        valueType: 'RELATION',
      },
    ];
    expect(getScopeFromFilters(filters)).toEqual({
      type: 'RELATIONS',
      value: 'entity-1',
      name: 'Entity',
    });
  });
});
