import { SystemIds } from '@geoprotocol/geo-sdk/lite';

import { describe, expect, it } from 'vitest';

import { convertWhereConditionToEntityFilter } from '~/core/io/converters';

import { filterStateToWhere } from './filter-state-to-where';
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
