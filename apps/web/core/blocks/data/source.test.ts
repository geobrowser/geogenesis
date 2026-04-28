import { SystemIds } from '@geoprotocol/geo-sdk/lite';

import { describe, expect, it } from 'vitest';

import { makeRelationForSourceType } from './source';

describe('makeRelationForSourceType', () => {
  it('writes collection data source relations', () => {
    const relation = makeRelationForSourceType('COLLECTION', 'block-id', 'space-id');

    expect(relation.type.id).toBe(SystemIds.DATA_SOURCE_TYPE_RELATION_TYPE);
    expect(relation.toEntity.id).toBe(SystemIds.COLLECTION_DATA_SOURCE);
    expect(relation.toEntity.name).toBe('Collection data source');
  });

  it('writes query data source relations for selected spaces', () => {
    const relation = makeRelationForSourceType('SPACES', 'block-id', 'space-id');

    expect(relation.type.id).toBe(SystemIds.DATA_SOURCE_TYPE_RELATION_TYPE);
    expect(relation.toEntity.id).toBe(SystemIds.QUERY_DATA_SOURCE);
    expect(relation.toEntity.name).toBe('Query data source');
  });

  it('writes all-of-geo data source relations', () => {
    const relation = makeRelationForSourceType('GEO', 'block-id', 'space-id');

    expect(relation.type.id).toBe(SystemIds.DATA_SOURCE_TYPE_RELATION_TYPE);
    expect(relation.toEntity.id).toBe(SystemIds.ALL_OF_GEO_DATA_SOURCE);
    expect(relation.toEntity.name).toBe('Geo data source');
  });
});
