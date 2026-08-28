import { describe, expect, it } from 'vitest';

import type { EntityFilter } from '~/core/gql/graphql';

import { collapseRelationOrFilter } from './relation-or-filter';

const A = '39e40cadb23d4f63ab2faea1596436c7';
const B = '4b5bbddf32b247bab0a6dbbab27f457d';
const TARGET = '2b277091284f40bfb809e2262f601022';

const someOfType = (typeId: string, toEntityId = TARGET): EntityFilter => ({
  relations: { some: { typeId: { is: typeId }, toEntityId: { is: toEntityId } } },
});

describe('collapseRelationOrFilter', () => {
  it('collapses the production explore shape into one relations.some', () => {
    const input: EntityFilter = {
      and: [{ or: [someOfType(A), someOfType(B)] }, { name: { isNull: false, isNot: '' } }],
    };

    expect(collapseRelationOrFilter(input)).toEqual({
      and: [
        { relations: { some: { toEntityId: { is: TARGET }, typeId: { in: [A, B] } } } },
        { name: { isNull: false, isNot: '' } },
      ],
    });
  });

  it('collapses a top-level or', () => {
    expect(collapseRelationOrFilter({ or: [someOfType(A), someOfType(B)] })).toEqual({
      relations: { some: { toEntityId: { is: TARGET }, typeId: { in: [A, B] } } },
    });
  });

  it('dedupes repeated type ids and unwraps a single survivor to `is`', () => {
    expect(collapseRelationOrFilter({ or: [someOfType(A), someOfType(A)] })).toEqual({
      relations: { some: { toEntityId: { is: TARGET }, typeId: { is: A } } },
    });
  });

  it('leaves branches alone when they differ by more than typeId', () => {
    // Different targets: EXISTS(A->X) OR EXISTS(B->Y) is NOT EXISTS(type in [A,B] -> ?).
    const input: EntityFilter = { or: [someOfType(A, TARGET), someOfType(B, 'ffffffff')] };
    expect(collapseRelationOrFilter(input)).toBe(input);
  });

  it('leaves `none` alone — the equivalence only holds for `some`', () => {
    const input: EntityFilter = {
      or: [
        { relations: { none: { typeId: { is: A } } } },
        { relations: { none: { typeId: { is: B } } } },
      ],
    };
    expect(collapseRelationOrFilter(input)).toBe(input);
  });

  it('leaves branches carrying anything besides `relations` alone', () => {
    const input: EntityFilter = {
      or: [{ ...someOfType(A), name: { isNot: '' } }, someOfType(B)],
    };
    expect(collapseRelationOrFilter(input)).toBe(input);
  });

  it('does not merge a typeId that is already a list', () => {
    const input: EntityFilter = {
      or: [{ relations: { some: { typeId: { in: [A] } } } }, someOfType(B)],
    };
    expect(collapseRelationOrFilter(input)).toBe(input);
  });

  it('preserves an existing sibling relations clause instead of overwriting it', () => {
    const existing = { some: { typeId: { is: 'aaaa' } } };
    const result = collapseRelationOrFilter({
      relations: existing,
      or: [someOfType(A), someOfType(B)],
    });

    expect(result).toEqual({
      relations: existing,
      and: [{ relations: { some: { toEntityId: { is: TARGET }, typeId: { in: [A, B] } } } }],
    });
  });

  it('collapses nested inside and/not without duplicating siblings', () => {
    const result = collapseRelationOrFilter({
      and: [{ not: { or: [someOfType(A), someOfType(B)] } }, { name: { isNot: '' } }],
    });

    expect(result).toEqual({
      and: [
        { not: { relations: { some: { toEntityId: { is: TARGET }, typeId: { in: [A, B] } } } } },
        { name: { isNot: '' } },
      ],
    });
  });

  it('returns the same reference when there is nothing to collapse', () => {
    const input: EntityFilter = { name: { isNot: '' } };
    expect(collapseRelationOrFilter(input)).toBe(input);
    expect(collapseRelationOrFilter(undefined)).toBeUndefined();
  });
});
