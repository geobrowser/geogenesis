import { SystemIds } from '@geoprotocol/geo-sdk';

import { Effect } from 'effect';
import { describe, expect, it, vi } from 'vitest';

import {
  FilterString,
  fromGeoFilterString,
  parseFiltersSync,
  resolveFilterDisplayNames,
  toGeoFilterState,
} from './filters';

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
  getProperties: vi.fn((ids: string[]) => {
    const props: Record<string, { id: string; name: string; dataType: string }> = {
      [SystemIds.TYPES_PROPERTY]: { id: SystemIds.TYPES_PROPERTY, name: 'Types', dataType: 'RELATION' },
      [SystemIds.NAME_PROPERTY]: { id: SystemIds.NAME_PROPERTY, name: 'Name', dataType: 'TEXT' },
      'custom-prop-id': { id: 'custom-prop-id', name: 'Custom Prop', dataType: 'RELATION' },
    };
    return Effect.succeed(ids.map(id => props[id]).filter(Boolean));
  }),
  getSpace: vi.fn((spaceId: string) => {
    if (spaceId === 'space-1') return Effect.succeed({ id: spaceId, entity: { name: 'Test Space' } });
    return Effect.succeed({ id: spaceId, entity: { name: null } });
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
  getBatchEntities: vi.fn((ids: string[]) => {
    const entities: Record<string, { id: string; name: string | null }> = {
      [SystemIds.TYPES_PROPERTY]: { id: SystemIds.TYPES_PROPERTY, name: 'Types' },
      [SystemIds.NAME_PROPERTY]: { id: SystemIds.NAME_PROPERTY, name: 'Name' },
      [SystemIds.SCHEMA_TYPE]: { id: SystemIds.SCHEMA_TYPE, name: 'Type' },
      'some-entity-id': { id: 'some-entity-id', name: 'Some Entity' },
      'some-type-id': { id: 'some-type-id', name: 'Some Type' },
      'custom-prop-id': { id: 'custom-prop-id', name: 'Custom Prop' },
      'relation-value-id': { id: 'relation-value-id', name: 'Relation Value' },
    };
    return Effect.succeed(ids.map(id => entities[id] ?? { id, name: null }));
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

    const { filters: stringFilter, mode } = await fromGeoFilterString(JSON.stringify(filter));

    expect(mode).toBe('AND');
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

  it('round-trips OR mode through filter string', async () => {
    const filters = [
      {
        columnId: SystemIds.TYPES_PROPERTY,
        columnName: 'Types',
        valueType: 'RELATION' as const,
        value: SystemIds.SCHEMA_TYPE,
      },
    ];

    const stringFilter = toGeoFilterState(filters, 'OR');
    const parsedFilter = JSON.parse(stringFilter);
    expect(parsedFilter.mode).toBe('OR');

    const { mode } = await fromGeoFilterString(stringFilter);
    expect(mode).toBe('OR');
  });

  it('omits mode from AND filter string for backward compatibility', () => {
    const filters = [
      {
        columnId: SystemIds.TYPES_PROPERTY,
        columnName: 'Types',
        valueType: 'RELATION' as const,
        value: SystemIds.SCHEMA_TYPE,
      },
    ];

    const stringFilter = toGeoFilterState(filters, 'AND');
    const parsedFilter = JSON.parse(stringFilter);
    expect(parsedFilter.mode).toBeUndefined();
  });

  it('defaults to AND mode when mode is absent in stored filter string', async () => {
    const filter: FilterString = {
      filter: {
        [SystemIds.TYPES_PROPERTY]: {
          is: SystemIds.SCHEMA_TYPE,
        },
      },
    };

    const { mode } = await fromGeoFilterString(JSON.stringify(filter));
    expect(mode).toBe('AND');
  });
});

describe('parseFiltersSync', () => {
  it('returns empty filters for null input', () => {
    const result = parseFiltersSync(null);
    expect(result).toEqual({ filters: [], mode: 'AND' });
  });

  it('returns empty filters for empty string', () => {
    const result = parseFiltersSync('');
    expect(result).toEqual({ filters: [], mode: 'AND' });
  });

  it('returns empty filters for invalid JSON', () => {
    const result = parseFiltersSync('not-json');
    expect(result).toEqual({ filters: [], mode: 'AND' });
  });

  it('returns empty filters for invalid schema', () => {
    const result = parseFiltersSync(JSON.stringify({ filter: 'bad' }));
    expect(result).toEqual({ filters: [], mode: 'AND' });
  });

  it('parses a simple property filter', () => {
    const input: FilterString = {
      filter: {
        [SystemIds.TYPES_PROPERTY]: { is: SystemIds.SCHEMA_TYPE },
      },
    };

    const { filters, mode } = parseFiltersSync(JSON.stringify(input));
    expect(mode).toBe('AND');
    expect(filters).toEqual([
      {
        columnId: SystemIds.TYPES_PROPERTY,
        columnName: null,
        valueType: 'RELATION',
        value: SystemIds.SCHEMA_TYPE,
        valueName: null,
      },
    ]);
  });

  it('parses space filters', () => {
    const input: FilterString = {
      spaceId: { in: ['space-1', 'space-2'] },
    };

    const { filters } = parseFiltersSync(JSON.stringify(input));
    expect(filters).toHaveLength(2);
    expect(filters[0]).toEqual({
      columnId: SystemIds.SPACE_FILTER,
      columnName: null,
      valueType: 'RELATION',
      value: 'space-1',
      valueName: null,
    });
    expect(filters[1]).toEqual({
      columnId: SystemIds.SPACE_FILTER,
      columnName: null,
      valueType: 'RELATION',
      value: 'space-2',
      valueName: null,
    });
  });

  it('parses _relation backlink filters', () => {
    const input: FilterString = {
      filter: {
        _relation: {
          fromEntity: { is: 'some-entity-id' },
          type: { is: 'some-type-id' },
        },
      },
    };

    const { filters } = parseFiltersSync(JSON.stringify(input));
    expect(filters).toEqual([
      {
        columnId: 'some-type-id',
        columnName: null,
        valueType: 'RELATION',
        value: 'some-entity-id',
        valueName: null,
        isBacklink: true,
      },
    ]);
  });

  it('parses _relation type-only filters', () => {
    const input: FilterString = {
      filter: {
        _relation: {
          type: { is: 'some-type-id' },
        },
      },
    };

    const { filters } = parseFiltersSync(JSON.stringify(input));
    expect(filters).toEqual([
      {
        columnId: 'some-type-id',
        columnName: null,
        valueType: 'RELATION',
        value: 'some-type-id',
        valueName: null,
      },
    ]);
  });

  it('parses multi-value (in) filters', () => {
    const input: FilterString = {
      filter: {
        [SystemIds.TYPES_PROPERTY]: { in: ['type-a', 'type-b'] },
      },
    };

    const { filters } = parseFiltersSync(JSON.stringify(input));
    expect(filters).toHaveLength(2);
    expect(filters[0].value).toBe('type-a');
    expect(filters[1].value).toBe('type-b');
    expect(filters.every(f => f.columnId === SystemIds.TYPES_PROPERTY)).toBe(true);
  });

  it('parses OR mode', () => {
    const input: FilterString = {
      mode: 'OR',
      filter: {
        [SystemIds.TYPES_PROPERTY]: { is: SystemIds.SCHEMA_TYPE },
      },
    };

    const { mode } = parseFiltersSync(JSON.stringify(input));
    expect(mode).toBe('OR');
  });

  it('defaults to AND mode when mode is absent', () => {
    const input: FilterString = {
      filter: {
        [SystemIds.TYPES_PROPERTY]: { is: SystemIds.SCHEMA_TYPE },
      },
    };

    const { mode } = parseFiltersSync(JSON.stringify(input));
    expect(mode).toBe('AND');
  });
});

describe('resolveFilterDisplayNames', () => {
  it('returns empty array for empty input', async () => {
    const result = await resolveFilterDisplayNames([]);
    expect(result).toEqual([]);
  });

  it('resolves space filter display names', async () => {
    const filters = [
      {
        columnId: SystemIds.SPACE_FILTER,
        columnName: null,
        valueType: 'RELATION' as const,
        value: 'space-1',
        valueName: null,
      },
    ];

    const result = await resolveFilterDisplayNames(filters);
    expect(result[0].columnName).toBe('Space');
    expect(result[0].valueName).toBe('Test Space');
  });

  it('resolves backlink filter display names', async () => {
    const filters = [
      {
        columnId: 'some-type-id',
        columnName: null,
        valueType: 'RELATION' as const,
        value: 'some-entity-id',
        valueName: null,
        isBacklink: true,
      },
    ];

    const result = await resolveFilterDisplayNames(filters);
    expect(result[0].columnName).toBe('Backlink');
    expect(result[0].valueName).toBe('Some Entity');
  });

  it('resolves types filter display names', async () => {
    const filters = [
      {
        columnId: SystemIds.TYPES_PROPERTY,
        columnName: null,
        valueType: 'RELATION' as const,
        value: SystemIds.SCHEMA_TYPE,
        valueName: null,
      },
    ];

    const result = await resolveFilterDisplayNames(filters);
    expect(result[0].columnName).toBe('Types');
    expect(result[0].valueName).toBe('Type');
  });

  it('resolves custom property filter with relation value type', async () => {
    const filters = [
      {
        columnId: 'custom-prop-id',
        columnName: null,
        valueType: 'RELATION' as const,
        value: 'relation-value-id',
        valueName: null,
      },
    ];

    const result = await resolveFilterDisplayNames(filters);
    expect(result[0].columnName).toBe('Custom Prop');
    expect(result[0].valueName).toBe('Relation Value');
  });
});
