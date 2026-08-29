import { describe, expect, it } from 'vitest';

import type { EntityFilter } from '~/core/gql/graphql';

import { collapseOrFilter } from './filter-or-collapse';

const A = '39e40cadb23d4f63ab2faea1596436c7';
const B = '4b5bbddf32b247bab0a6dbbab27f457d';
const TARGET = '2b277091284f40bfb809e2262f601022';

const someOfType = (typeId: string, toEntityId = TARGET): EntityFilter => ({
  relations: { some: { typeId: { is: typeId }, toEntityId: { is: toEntityId } } },
});

describe('collapseOrFilter', () => {
  it('collapses the production explore shape into one relations.some', () => {
    const input: EntityFilter = {
      and: [{ or: [someOfType(A), someOfType(B)] }, { name: { isNull: false, isNot: '' } }],
    };

    expect(collapseOrFilter(input)).toEqual({
      and: [
        { relations: { some: { toEntityId: { is: TARGET }, typeId: { in: [A, B] } } } },
        { name: { isNull: false, isNot: '' } },
      ],
    });
  });

  it('collapses a top-level or', () => {
    expect(collapseOrFilter({ or: [someOfType(A), someOfType(B)] })).toEqual({
      relations: { some: { toEntityId: { is: TARGET }, typeId: { in: [A, B] } } },
    });
  });

  it('dedupes repeated type ids and unwraps a single survivor to `is`', () => {
    expect(collapseOrFilter({ or: [someOfType(A), someOfType(A)] })).toEqual({
      relations: { some: { toEntityId: { is: TARGET }, typeId: { is: A } } },
    });
  });

  it('leaves branches alone when they differ by more than typeId', () => {
    // Different targets: EXISTS(A->X) OR EXISTS(B->Y) is NOT EXISTS(type in [A,B] -> ?).
    const input: EntityFilter = { or: [someOfType(A, TARGET), someOfType(B, 'ffffffff')] };
    expect(collapseOrFilter(input)).toBe(input);
  });

  it('leaves `none` alone — the equivalence only holds for `some`', () => {
    const input: EntityFilter = {
      or: [
        { relations: { none: { typeId: { is: A } } } },
        { relations: { none: { typeId: { is: B } } } },
      ],
    };
    expect(collapseOrFilter(input)).toBe(input);
  });

  it('leaves branches carrying anything besides `relations` alone', () => {
    const input: EntityFilter = {
      or: [{ ...someOfType(A), name: { isNot: '' } }, someOfType(B)],
    };
    expect(collapseOrFilter(input)).toBe(input);
  });

  it('does not merge a typeId that is already a list', () => {
    const input: EntityFilter = {
      or: [{ relations: { some: { typeId: { in: [A] } } } }, someOfType(B)],
    };
    expect(collapseOrFilter(input)).toBe(input);
  });

  it('preserves an existing sibling relations clause instead of overwriting it', () => {
    const existing = { some: { typeId: { is: 'aaaa' } } };
    const result = collapseOrFilter({
      relations: existing,
      or: [someOfType(A), someOfType(B)],
    });

    expect(result).toEqual({
      relations: existing,
      and: [{ relations: { some: { toEntityId: { is: TARGET }, typeId: { in: [A, B] } } } }],
    });
  });

  it('collapses nested inside and/not without duplicating siblings', () => {
    const result = collapseOrFilter({
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
    expect(collapseOrFilter(input)).toBe(input);
    expect(collapseOrFilter(undefined)).toBeUndefined();
  });
});

describe('collapseOrFilter — typeIds branches', () => {
  const T1 = '5ef5a5860f274d8e8f6c59ae5b3e89e2';
  const T2 = 'c7a4fc6d1afc53250a22d4209391dc79';
  const T3 = '7ed45f2bc48b419e8e4664d5ff680b0d';

  const anyType = (id: string): EntityFilter => ({ typeIds: { anyEqualTo: id } });

  it('collapses the production explore shape into overlaps', () => {
    const input: EntityFilter = {
      and: [{ or: [anyType(T1), anyType(T2), anyType(T3)] }, { name: { isNull: false, isNot: '' } }],
    };

    expect(collapseOrFilter(input)).toEqual({
      and: [{ typeIds: { overlaps: [T1, T2, T3] } }, { name: { isNull: false, isNot: '' } }],
    });
  });

  it('uses overlaps rather than in — on a list column `in` compares whole arrays', () => {
    const result = collapseOrFilter({ or: [anyType(T1), anyType(T2)] }) as EntityFilter;

    expect(result.typeIds).toEqual({ overlaps: [T1, T2] });
    expect(result.typeIds).not.toHaveProperty('in');
  });

  it('dedupes and unwraps a single survivor back to anyEqualTo', () => {
    expect(collapseOrFilter({ or: [anyType(T1), anyType(T1)] })).toEqual({ typeIds: { anyEqualTo: T1 } });
  });

  it('leaves branches carrying anything besides typeIds alone', () => {
    const input: EntityFilter = { or: [{ ...anyType(T1), name: { isNot: '' } }, anyType(T2)] };
    expect(collapseOrFilter(input)).toBe(input);
  });

  it('leaves an operator it cannot merge alone', () => {
    const input: EntityFilter = { or: [{ typeIds: { overlaps: [T1] } }, anyType(T2)] };
    expect(collapseOrFilter(input)).toBe(input);
  });

  it('preserves an existing sibling typeIds clause instead of overwriting it', () => {
    const existing = { anyEqualTo: 'aaaa' };
    const result = collapseOrFilter({ typeIds: existing, or: [anyType(T1), anyType(T2)] });

    expect(result).toEqual({
      typeIds: existing,
      and: [{ typeIds: { overlaps: [T1, T2] } }],
    });
  });

  it('still collapses relations branches, which take precedence', () => {
    const A = '39e40cadb23d4f63ab2faea1596436c7';
    const B = '4b5bbddf32b247bab0a6dbbab27f457d';
    const target = '2b277091284f40bfb809e2262f601022';
    const someOf = (typeId: string): EntityFilter => ({
      relations: { some: { typeId: { is: typeId }, toEntityId: { is: target } } },
    });

    expect(collapseOrFilter({ or: [someOf(A), someOf(B)] })).toEqual({
      relations: { some: { toEntityId: { is: target }, typeId: { in: [A, B] } } },
    });
  });
});
