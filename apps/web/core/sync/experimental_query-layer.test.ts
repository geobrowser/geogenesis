import { afterEach, describe, expect, it, vi } from 'vitest';

import type { Entity, Relation } from '~/core/types';

import { EntityQuery, type WhereCondition } from './experimental_query-layer';

const TYPE_A = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
const TYPE_B = 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb';
const SPACE_1 = '11111111111111111111111111111111';
const SPACE_2 = '22222222222222222222222222222222';
const LINK = 'cccccccccccccccccccccccccccccccc';

function relation(fromId: string, typeId: string, toId: string): Relation {
  return {
    id: `${fromId}-${typeId}-${toId}`,
    entityId: `${fromId}-${toId}-rel`,
    spaceId: SPACE_1,
    renderableType: 'RELATION',
    type: { id: typeId, name: null },
    fromEntity: { id: fromId, name: null },
    toEntity: { id: toId, name: null, value: toId },
  } as Relation;
}

function entity(id: string, typeId: string, spaceId: string, relations: Relation[] = []): Entity {
  return {
    id,
    name: id,
    description: null,
    spaces: [spaceId],
    types: [{ id: typeId, name: null }],
    relations,
    values: [],
  } as Entity;
}

const aInSpace1 = entity('a-in-1', TYPE_A, SPACE_1);
const bInSpace1 = entity('b-in-1', TYPE_B, SPACE_1);
const bInSpace2 = entity('b-in-2', TYPE_B, SPACE_2);
const aInSpace2 = entity('a-in-2', TYPE_A, SPACE_2);
const all = [aInSpace1, bInSpace1, aInSpace2, bInSpace2];

const ids = (where: WhereCondition) =>
  new EntityQuery(all)
    .where(where)
    .execute()
    .map(e => e.id)
    .sort();

const ofTypeA: Pick<WhereCondition, 'types'> = { types: [{ id: { equals: TYPE_A } }] };

describe('EntityQuery logical keys beside plain fields', () => {
  afterEach(() => vi.restoreAllMocks());

  // The server ANDs a logical key with the fields beside it (`convertWhereConditionToEntityFilter`);
  // the local matcher has to agree, or local and unpublished entities match a wider set.
  it('ANDs OR with its sibling fields', () => {
    expect(ids({ ...ofTypeA, OR: [{ spaces: [{ equals: SPACE_1 }] }] })).toEqual(['a-in-1']);
  });

  it('ANDs AND with its sibling fields', () => {
    expect(ids({ ...ofTypeA, AND: [{ spaces: [{ equals: SPACE_1 }] }] })).toEqual(['a-in-1']);
  });

  it('ANDs NOT with its sibling fields', () => {
    expect(ids({ ...ofTypeA, NOT: { spaces: [{ equals: SPACE_1 }] } })).toEqual(['a-in-2']);
  });

  it('checks plain fields before a logical branch, so a backlink scan runs only on candidates', () => {
    const target = entity('target', TYPE_A, SPACE_1);
    const others = Array.from({ length: 20 }, (_, i) =>
      entity(`other-${i}`, TYPE_B, SPACE_1, [relation(`other-${i}`, LINK, 'target')])
    );
    const matchesBacklinks = vi.spyOn(EntityQuery.prototype as any, 'matchesBacklinks');

    const result = new EntityQuery([target, ...others])
      .where({ ...ofTypeA, NOT: { backlinks: [{ typeOf: { id: { equals: LINK } } }] } })
      .execute();

    expect(result).toEqual([]);
    // Only `target` passed `types`; the 20 others never reach the scan.
    expect(matchesBacklinks).toHaveBeenCalledTimes(1);
  });
});
