import { SystemIds } from '@geoprotocol/geo-sdk';
import { Effect } from 'effect';
import { describe, expect, it, vi } from 'vitest';

import { FilterString, fromGeoFilterString, toGeoFilterState } from './filters';

// Mock the queries module
vi.mock('~/core/io/queries', () => ({
  getProperty: vi.fn((propertyId: string) => {
    if (propertyId === SystemIds.TYPES_PROPERTY) {
      return Effect.succeed({ id: propertyId, name: 'Types', dataType: 'RELATION' });
    }
    if (propertyId === SystemIds.NAME_PROPERTY) {
      return Effect.succeed({ id: propertyId, name: 'Name', dataType: 'TEXT' });
    }
    return Effect.succeed({ id: propertyId, name: 'Unknown', dataType: 'TEXT' });
  }),
  // eslint-disable-next-line @typescript-eslint/no-unused-vars, no-unused-vars
  getSpace: vi.fn((spaceId: string) => {
    return Effect.succeed({ entity: { name: null } });
  }),
  getEntity: vi.fn((id: string) => {
    if (id === SystemIds.TYPES_PROPERTY) {
      return Effect.succeed({ id, name: 'Types', values: [], relations: [], types: [], spaces: [] });
    }
    if (id === SystemIds.NAME_PROPERTY) {
      return Effect.succeed({ id, name: 'Name', values: [], relations: [], types: [], spaces: [] });
    }
    if (id === SystemIds.SCHEMA_TYPE) {
      return Effect.succeed({ id, name: 'Type', values: [], relations: [], types: [], spaces: [] });
    }
    return Effect.succeed({ id, name: null, values: [], relations: [], types: [], spaces: [] });
  }),
}));

describe('filters', () => {
  it('Builds the TableBlockStore filters data structure from the Geo filter string', async () => {
    const filter: FilterString = {
      spaceId: {
        in: ['0x0000000000000000000000000000000000000000'],
      },
      filter: {
        [SystemIds.TYPES_PROPERTY]: {
          is: SystemIds.SCHEMA_TYPE,
        },
        [SystemIds.NAME_PROPERTY]: {
          is: 'name',
        },
      },
    };

    const stringFilter = await fromGeoFilterString(JSON.stringify(filter));

    expect(stringFilter).toEqual([
      {
        columnId: SystemIds.SPACE_FILTER,
        value: '0x0000000000000000000000000000000000000000',
        columnName: 'Space',
        valueType: 'RELATION',
        valueName: null,
      },
      {
        columnId: SystemIds.TYPES_PROPERTY,
        columnName: 'Types',
        value: SystemIds.SCHEMA_TYPE,
        valueType: 'RELATION',
        valueName: 'Type',
      },
      {
        columnId: SystemIds.NAME_PROPERTY,
        columnName: 'Name',
        value: 'name',
        valueType: 'TEXT',
        valueName: null,
      },
    ]);
  });

  it('Builds the Geo filter string from the TableBlockStore filters data structure', () => {
    const filters = [
      {
        columnId: SystemIds.SPACE_FILTER,
        columnName: 'Space',
        valueType: 'RELATION' as const,
        value: '0x0000000000000000000000000000000000000000',
      },
      {
        columnId: SystemIds.TYPES_PROPERTY,
        columnName: 'Types',
        valueType: 'RELATION' as const,
        value: SystemIds.SCHEMA_TYPE,
      },
      {
        columnId: SystemIds.NAME_PROPERTY,
        columnName: 'Name',
        valueType: 'TEXT' as const,
        value: 'name',
      },
    ];

    const stringFilter = toGeoFilterState(filters);
    const parsedFilter = JSON.parse(stringFilter);

    expect(parsedFilter).toEqual({
      spaceId: {
        in: ['0x0000000000000000000000000000000000000000'],
      },
      filter: {
        [SystemIds.TYPES_PROPERTY]: {
          is: SystemIds.SCHEMA_TYPE,
        },
        [SystemIds.NAME_PROPERTY]: {
          is: 'name',
        },
      },
    });
  });

  it('Builds the Geo filter string for entity filters', () => {
    const filters = [
      {
        columnId: 'some-type-id',
        columnName: 'Backlink',
        valueType: 'RELATION' as const,
        value: 'some-entity-id',
      },
    ];

    const stringFilter = toGeoFilterState(filters);
    const parsedFilter = JSON.parse(stringFilter);

    expect(parsedFilter).toEqual({
      filter: {
        _relation: {
          fromEntity: { is: 'some-entity-id' },
          type: { is: 'some-type-id' },
        },
      },
    });
  });
});
