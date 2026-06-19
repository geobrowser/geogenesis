import { SystemIds } from '@geoprotocol/geo-sdk/lite';
import { describe, expect, it } from 'vitest';

import type { Filter } from '~/core/blocks/data/filters';

import { resolveRankingSingleTargetSpaceId } from './ranking-compose-target-space';

describe('resolveRankingSingleTargetSpaceId', () => {
  const spaceFilter = (value: string, valueName: string): Filter => ({
    columnId: SystemIds.SPACE_FILTER,
    columnName: null,
    valueType: 'RELATION',
    value,
    valueName,
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
        valueType: 'RELATION',
        value: 'entity-1',
        valueName: 'Entity',
      },
    ];
    expect(resolveRankingSingleTargetSpaceId(filters)).toBeNull();
  });
});
