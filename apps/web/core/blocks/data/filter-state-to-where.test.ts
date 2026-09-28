import { SystemIds } from '@geoprotocol/geo-sdk/lite';

import { describe, expect, it } from 'vitest';

import { convertWhereConditionToEntityFilter } from '~/core/io/converters';

import { filterGroupKey, filterStateToWhere, isBacklinkFilter } from './filter-state-to-where';
import type { Filter } from './filters';

const PROPERTY_A = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
const PROPERTY_B = 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb';

const relationFilter = (columnId: string, value: string): Filter => ({
  columnId,
  columnName: columnId,
  valueType: 'RELATION',
  value,
  valueName: value,
});

describe('filterStateToWhere', () => {
  it('applies OR to one property and AND to another', () => {
    const filters = [
      relationFilter(PROPERTY_A, 'a1'),
      relationFilter(PROPERTY_A, 'a2'),
      relationFilter(PROPERTY_B, 'b1'),
      relationFilter(PROPERTY_B, 'b2'),
    ];

    expect(filterStateToWhere(filters, { [PROPERTY_A]: 'OR' })).toEqual({
      AND: [
        {
          OR: [
            { relations: [{ typeOf: { id: { equals: PROPERTY_A } }, toEntity: { id: { equals: 'a1' } } }] },
            { relations: [{ typeOf: { id: { equals: PROPERTY_A } }, toEntity: { id: { equals: 'a2' } } }] },
          ],
        },
        { relations: [{ typeOf: { id: { equals: PROPERTY_B } }, toEntity: { id: { equals: 'b1' } } }] },
        { relations: [{ typeOf: { id: { equals: PROPERTY_B } }, toEntity: { id: { equals: 'b2' } } }] },
      ],
    });
  });

  it('keeps OR groups for different properties separated by AND', () => {
    const filters = [
      relationFilter(PROPERTY_A, 'a1'),
      relationFilter(PROPERTY_A, 'a2'),
      relationFilter(PROPERTY_B, 'b1'),
      relationFilter(PROPERTY_B, 'b2'),
    ];

    const where = filterStateToWhere(filters, { [PROPERTY_A]: 'OR', [PROPERTY_B]: 'OR' });

    expect(where).toEqual({
      AND: [
        {
          OR: [
            { relations: [{ typeOf: { id: { equals: PROPERTY_A } }, toEntity: { id: { equals: 'a1' } } }] },
            { relations: [{ typeOf: { id: { equals: PROPERTY_A } }, toEntity: { id: { equals: 'a2' } } }] },
          ],
        },
        {
          OR: [
            { relations: [{ typeOf: { id: { equals: PROPERTY_B } }, toEntity: { id: { equals: 'b1' } } }] },
            { relations: [{ typeOf: { id: { equals: PROPERTY_B } }, toEntity: { id: { equals: 'b2' } } }] },
          ],
        },
      ],
    });

    expect(convertWhereConditionToEntityFilter(where, { includeEmptyNames: true })).toEqual({
      and: [
        {
          or: [
            { relations: { some: { typeId: { is: PROPERTY_A }, toEntityId: { is: 'a1' } } } },
            { relations: { some: { typeId: { is: PROPERTY_A }, toEntityId: { is: 'a2' } } } },
          ],
        },
        {
          or: [
            { relations: { some: { typeId: { is: PROPERTY_B }, toEntityId: { is: 'b1' } } } },
            { relations: { some: { typeId: { is: PROPERTY_B }, toEntityId: { is: 'b2' } } } },
          ],
        },
      ],
    });
  });

  it('always ORs multiple spaces, regardless of the Space mode', () => {
    const filters = [
      relationFilter(SystemIds.SPACE_FILTER, 'space-1'),
      relationFilter(SystemIds.SPACE_FILTER, 'space-2'),
    ];
    const expected = { spaces: [{ equals: 'space-1' }, { equals: 'space-2' }] };

    // A fresh block has no mode entry for Space; a migrated legacy block has
    // an explicit OR; an explicit AND must never produce "in A and in B".
    expect(filterStateToWhere(filters)).toEqual(expected);
    expect(filterStateToWhere(filters, { [SystemIds.SPACE_FILTER]: 'OR' })).toEqual(expected);
    expect(filterStateToWhere(filters, { [SystemIds.SPACE_FILTER]: 'AND' })).toEqual(expected);
  });

  it('keeps multi-space OR while another property stays AND', () => {
    const filters = [
      relationFilter(SystemIds.SPACE_FILTER, 'space-1'),
      relationFilter(SystemIds.SPACE_FILTER, 'space-2'),
      relationFilter(PROPERTY_A, 'a-1'),
      relationFilter(PROPERTY_A, 'a-2'),
    ];

    // The space group stays one OR'd `spaces` array while the AND'd property
    // group's members are hoisted alongside it as siblings of the outer AND.
    const where = filterStateToWhere(filters);
    expect(where.AND).toHaveLength(3);
    expect(where.AND?.[0]).toEqual({ spaces: [{ equals: 'space-1' }, { equals: 'space-2' }] });
    expect(where.AND?.slice(1).every(condition => condition.relations?.length === 1)).toBe(true);
  });
});

describe('relation filters are scoped to the block space (GEO-2865)', () => {
  const SPACE = 'cccccccccccccccccccccccccccccccc';
  const OTHER = 'dddddddddddddddddddddddddddddddd';

  it('scopes a single relation filter to the space it was given', () => {
    const where = filterStateToWhere([relationFilter(PROPERTY_A, 'v1')], {}, SPACE);

    expect(where).toEqual({
      relations: [
        { typeOf: { id: { equals: PROPERTY_A } }, toEntity: { id: { equals: 'v1' } }, space: { equals: SPACE } },
      ],
    });
  });

  it('scopes backlink filters in the same way', () => {
    const backlink: Filter = { ...relationFilter(PROPERTY_A, 'v1'), isBacklink: true };

    const where = filterStateToWhere([backlink], {}, SPACE);

    expect(where).toEqual({
      backlinks: [
        { typeOf: { id: { equals: PROPERTY_A } }, fromEntity: { id: { equals: 'v1' } }, space: { equals: SPACE } },
      ],
    });
  });

  it('scopes every branch of an OR group, not just the first', () => {
    const where = filterStateToWhere(
      [relationFilter(PROPERTY_A, 'v1'), relationFilter(PROPERTY_A, 'v2')],
      { [PROPERTY_A]: 'OR' },
      SPACE
    );

    const branches = (where.OR ?? []) as Array<{ relations?: Array<{ space?: { equals: string } }> }>;
    expect(branches).toHaveLength(2);
    for (const branch of branches) {
      expect(branch.relations?.[0].space).toEqual({ equals: SPACE });
    }
  });

  it('leaves the query unscoped when no space is supplied, preserving previous behaviour', () => {
    // Two callers have no block space in scope; omitting it must not invent one.
    const where = filterStateToWhere([relationFilter(PROPERTY_A, 'v1')]);

    expect(where).toEqual({
      relations: [{ typeOf: { id: { equals: PROPERTY_A } }, toEntity: { id: { equals: 'v1' } } }],
    });
  });

  it('does not touch the Types branch, which scopes by the chosen type instead', () => {
    const typesFilter: Filter = {
      columnId: SystemIds.TYPES_PROPERTY,
      columnName: 'Types',
      valueType: 'RELATION',
      value: 'type-1',
      valueName: 'Type 1',
      typesRelationSpaceId: OTHER,
    };

    const where = filterStateToWhere([typesFilter], {}, SPACE);

    // OTHER, not SPACE: the type's own space still wins here by design.
    expect(where).toEqual({
      relations: [
        {
          typeOf: { id: { equals: SystemIds.TYPES_PROPERTY } },
          toEntity: { id: { equals: 'type-1' } },
          space: { equals: OTHER },
        },
      ],
    });
  });
});

describe('isBacklinkFilter', () => {
  const base: Filter = { columnId: 'p', columnName: 'Topics', valueType: 'RELATION', value: 'v', valueName: null };

  it('detects the flag and the legacy columnName marker identically', () => {
    expect(isBacklinkFilter({ ...base, isBacklink: true })).toBe(true);
    expect(isBacklinkFilter({ ...base, columnName: 'Backlink' })).toBe(true);
    expect(isBacklinkFilter(base)).toBe(false);
  });
});

describe('direction-aware grouping', () => {
  const backlink: Filter = {
    columnId: 'prop-1',
    columnName: 'Backlink',
    valueType: 'RELATION',
    value: 'anchor',
    valueName: null,
  };
  const forwardA: Filter = {
    columnId: 'prop-1',
    columnName: 'Subtopics',
    valueType: 'RELATION',
    value: 'v-a',
    valueName: null,
  };
  const forwardB: Filter = {
    columnId: 'prop-1',
    columnName: 'Subtopics',
    valueType: 'RELATION',
    value: 'v-b',
    valueName: null,
  };

  it('gives each direction its own group key on the same property', () => {
    expect(filterGroupKey(backlink)).toBe('backlink:prop-1');
    expect(filterGroupKey({ ...forwardA, columnName: 'Topics', isBacklink: true })).toBe('backlink:prop-1');
    expect(filterGroupKey(forwardA)).toBe('prop-1');
  });

  it('keeps a backlink required while forward values on the same property OR among themselves', () => {
    const where = filterStateToWhere([backlink, forwardA, forwardB], { 'prop-1': 'OR' });
    expect(where).toEqual({
      AND: [
        { backlinks: [{ typeOf: { id: { equals: 'prop-1' } }, fromEntity: { id: { equals: 'anchor' } } }] },
        {
          OR: [
            { relations: [{ typeOf: { id: { equals: 'prop-1' } }, toEntity: { id: { equals: 'v-a' } } }] },
            { relations: [{ typeOf: { id: { equals: 'prop-1' } }, toEntity: { id: { equals: 'v-b' } } }] },
          ],
        },
      ],
    });
  });
});
