import { SystemIds } from '@geoprotocol/geo-sdk/lite';

import { describe, expect, it } from 'vitest';

import {
  applyExploreBrowseWhere,
  getExploreBlockTypeOptions,
  refineExploreBlockTypeFilters,
} from './explore-browse-filters';
import type { Filter } from './filters';

function typeFilter(value: string, valueName: string | null = null): Filter {
  return {
    columnId: SystemIds.TYPES_PROPERTY,
    columnName: 'Types',
    valueType: 'RELATION',
    value,
    valueName,
  };
}

const nameFilter: Filter = {
  columnId: SystemIds.NAME_PROPERTY,
  columnName: 'Name',
  valueType: 'TEXT',
  value: 'Geo',
  valueName: 'Geo',
};

describe('getExploreBlockTypeOptions', () => {
  it('returns only configured type filters and deduplicates their IDs', () => {
    expect(
      getExploreBlockTypeOptions([nameFilter, typeFilter('type-a', 'Person'), typeFilter('type-a', 'Person')])
    ).toEqual([{ id: 'type-a', label: 'Person' }]);
  });

  it('returns no options when the block does not filter by type', () => {
    expect(getExploreBlockTypeOptions([nameFilter])).toEqual([]);
  });
});

describe('refineExploreBlockTypeFilters', () => {
  const configured = [nameFilter, typeFilter('type-a', 'Person'), typeFilter('type-b', 'Project')];

  it('preserves configured filters until the user narrows the type selection', () => {
    expect(refineExploreBlockTypeFilters(configured, undefined)).toEqual({
      filters: configured,
      hasConfiguredTypes: true,
      hasNoSelectedTypes: false,
    });
  });

  it('keeps non-type filters and only the selected configured types', () => {
    expect(refineExploreBlockTypeFilters(configured, ['type-b'])).toEqual({
      filters: [nameFilter, configured[2]],
      hasConfiguredTypes: true,
      hasNoSelectedTypes: false,
    });
  });

  it('marks an empty configured-type selection so the query can return no rows', () => {
    expect(refineExploreBlockTypeFilters(configured, [])).toEqual({
      filters: [nameFilter],
      hasConfiguredTypes: true,
      hasNoSelectedTypes: true,
    });
  });
});

describe('applyExploreBrowseWhere', () => {
  it('ANDs the rolling cutoff with the configured block query', () => {
    const baseWhere = { types: [{ id: { equals: 'type-a' } }] };
    expect(applyExploreBrowseWhere(baseWhere, { hasNoSelectedTypes: false, timeThresholdSec: 123 })).toEqual({
      AND: [baseWhere, { createdAt: { greaterThanOrEqualTo: '123' } }],
    });
  });

  it('uses an impossible ID set when all configured types are unselected', () => {
    expect(applyExploreBrowseWhere({}, { hasNoSelectedTypes: true, timeThresholdSec: null })).toEqual({
      id: { in: [] },
    });
  });
});
