import { describe, expect, it } from 'vitest';

import type { Relation } from '~/core/types';

import {
  buildAllocateOps,
  buildCancelInterestOps,
  buildExpressInterestOps,
  buildRemoveAllocationOps,
  groupRelationsBySpace,
} from './interest-ops';
import { BOUNTY_ALLOCATED_PROPERTY_ID, INTERESTED_IN_BOUNTY_PROPERTY_ID } from './ontology';

const bounty = { id: 'bounty-1', name: 'Add drugs' };

describe('interest ops', () => {
  it('expresses interest as personal-space entity→bounty in the personal space, with the bounty space as toSpaceId', () => {
    const { relationId, relations } = buildExpressInterestOps({
      personalSpaceId: 'personal-1',
      bounty,
      bountySpaceId: 'dao-1',
    });
    expect(relations).toHaveLength(1);
    const [rel] = relations;
    expect(rel.id).toBe(relationId);
    expect(rel).toMatchObject({
      spaceId: 'personal-1',
      toSpaceId: 'dao-1',
      fromEntity: { id: 'personal-1' },
      toEntity: { id: 'bounty-1' },
      type: { id: INTERESTED_IN_BOUNTY_PROPERTY_ID },
      isLocal: true,
    });
    expect(rel.isDeleted).toBeUndefined();
  });

  it("cancels by tombstoning every own interest row in the row's OWN space", () => {
    const { relations } = buildCancelInterestOps({
      bounty,
      ownInterestRows: [
        // A new-shape row (from the space entity) and a legacy row (from the person entity).
        { id: 'row-1', fromEntityId: 'personal-1', spaceId: 'personal-1' },
        { id: 'row-2', fromEntityId: 'person-1', spaceId: 'personal-1' },
        // An earlier geogenesis row authored into the bounty's DAO space — the
        // tombstone must target that space or the delete op removes nothing.
        { id: 'row-3', fromEntityId: 'personal-1', spaceId: 'dao-1' },
      ],
    });
    expect(relations.map(r => r.id)).toEqual(['row-1', 'row-2', 'row-3']);
    expect(relations.map(r => r.spaceId)).toEqual(['personal-1', 'personal-1', 'dao-1']);
    expect(relations.every(r => r.isDeleted && r.isLocal)).toBe(true);

    const grouped = groupRelationsBySpace(relations);
    expect([...grouped.keys()]).toEqual(['personal-1', 'dao-1']);
    expect(grouped.get('personal-1')!.map(r => r.id)).toEqual(['row-1', 'row-2']);
    expect(grouped.get('dao-1')!.map(r => r.id)).toEqual(['row-3']);
  });
});

describe('allocation ops', () => {
  it('allocates as bounty→personal-space entity in the DAO space, with the personal space as toSpaceId', () => {
    const { relations } = buildAllocateOps({
      daoSpaceId: 'dao-1',
      bounty,
      curatorSpaceId: 'personal-1',
      curatorName: 'Alice',
    });
    expect(relations[0]).toMatchObject({
      spaceId: 'dao-1',
      toSpaceId: 'personal-1',
      fromEntity: { id: 'bounty-1' },
      toEntity: { id: 'personal-1', name: 'Alice' },
      type: { id: BOUNTY_ALLOCATED_PROPERTY_ID },
    });
  });

  it('removes only the allocation rows pointing at that target (either identity shape)', () => {
    const existing: Relation[] = [
      {
        id: 'a1',
        type: { id: BOUNTY_ALLOCATED_PROPERTY_ID },
        fromEntity: { id: 'bounty-1' },
        toEntity: { id: 'person-1' },
      },
      {
        id: 'a2',
        type: { id: BOUNTY_ALLOCATED_PROPERTY_ID },
        fromEntity: { id: 'bounty-1' },
        toEntity: { id: 'PERSON-1' },
      },
      {
        id: 'a3',
        type: { id: BOUNTY_ALLOCATED_PROPERTY_ID },
        fromEntity: { id: 'bounty-1' },
        toEntity: { id: 'personal-2' },
      },
      { id: 'other', type: { id: 'x' }, fromEntity: { id: 'bounty-1' }, toEntity: { id: 'person-1' } },
    ] as unknown as Relation[];
    const { relations } = buildRemoveAllocationOps({
      daoSpaceId: 'dao-1',
      bounty,
      targetId: 'person-1',
      existingRelations: existing,
    });
    expect(relations.map(r => r.id)).toEqual(['a1', 'a2']);
    expect(relations.every(r => r.isDeleted && r.spaceId === 'dao-1')).toBe(true);
  });
});
