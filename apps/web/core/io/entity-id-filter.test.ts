import { describe, expect, it } from 'vitest';

import type { EntityFilter } from '~/core/gql/graphql';

import { promoteEntityIds } from './entity-id-filter';

describe('promoteEntityIds', () => {
  it('passes an undefined filter through', () => {
    expect(promoteEntityIds(undefined)).toEqual({ filter: undefined });
  });

  it('leaves a filter without an id clause untouched', () => {
    const filter: EntityFilter = { name: { isNull: false } };
    expect(promoteEntityIds(filter)).toEqual({ filter });
  });

  it('lifts a top-level id.in and drops the now-empty filter', () => {
    expect(promoteEntityIds({ id: { in: ['a', 'b'] } })).toEqual({ entityIds: ['a', 'b'], filter: undefined });
  });

  it('lifts the id clause from the and-wrapped shape the slow production request sent', () => {
    // Recorded from the API logs: one collection item, plus the empty-name exclusion.
    const filter: EntityFilter = {
      and: [{ id: { in: ['d9f0d9d5344944daa37b532164a0886b'] } }, { name: { isNull: false, isNot: '' } }],
    };
    expect(promoteEntityIds(filter)).toEqual({
      entityIds: ['d9f0d9d5344944daa37b532164a0886b'],
      filter: { and: [{ name: { isNull: false, isNot: '' } }] },
    });
  });

  it('keeps sibling keys of the lifted clause', () => {
    const filter: EntityFilter = { id: { in: ['a'] }, name: { isNull: false } };
    expect(promoteEntityIds(filter)).toEqual({ entityIds: ['a'], filter: { name: { isNull: false } } });
  });

  it('reaches two levels of nested and', () => {
    const filter: EntityFilter = { and: [{ and: [{ id: { in: ['a'] } }, { name: { isNull: false } }] }] };
    expect(promoteEntityIds(filter)).toEqual({
      entityIds: ['a'],
      filter: { and: [{ and: [{ name: { isNull: false } }] }] },
    });
  });

  it('de-duplicates the ids', () => {
    expect(promoteEntityIds({ id: { in: ['a', 'a', 'b'] } }).entityIds).toEqual(['a', 'b']);
  });

  it('keeps an empty in list in the filter, because the server reads empty entityIds as no restriction', () => {
    const filter: EntityFilter = { id: { in: [] } };
    expect(promoteEntityIds(filter)).toEqual({ filter });
  });

  it('does not lift an id clause with other operators', () => {
    const filter: EntityFilter = { id: { in: ['a'], notIn: ['b'] } };
    expect(promoteEntityIds(filter)).toEqual({ filter });
  });

  it('does not lift id operators other than in', () => {
    const filter: EntityFilter = { id: { is: 'a' } };
    expect(promoteEntityIds(filter)).toEqual({ filter });
  });

  it('does not lift when more than one id clause is reachable', () => {
    const filter: EntityFilter = { and: [{ id: { in: ['a', 'b'] } }, { id: { in: ['b', 'c'] } }] };
    expect(promoteEntityIds(filter)).toEqual({ filter });
  });

  it('never lifts an id clause from under or', () => {
    const filter: EntityFilter = { or: [{ id: { in: ['a'] } }, { name: { isNull: true } }] };
    expect(promoteEntityIds(filter)).toEqual({ filter });
  });

  it('never lifts an id clause from under not', () => {
    const filter: EntityFilter = { not: { id: { in: ['a'] } } };
    expect(promoteEntityIds(filter)).toEqual({ filter });
  });

  it('does not mutate its input', () => {
    const filter: EntityFilter = { and: [{ id: { in: ['a'] } }, { name: { isNull: false } }] };
    const before = JSON.stringify(filter);
    promoteEntityIds(filter);
    expect(JSON.stringify(filter)).toBe(before);
  });
});
