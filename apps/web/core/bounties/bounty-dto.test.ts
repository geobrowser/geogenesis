import { SystemIds } from '@geoprotocol/geo-sdk/lite';

import { describe, expect, it } from 'vitest';

import type { Relation as StoreRelation, Value as StoreValue } from '~/core/types';

import {
  buildBounties,
  buildBounty,
  buildBountyAllocationTargets,
  hasBountyTaskStatusDoneRelation,
  isAllocatedToUser,
} from './bounty-dto';
import {
  BOUNTY_ALLOCATED_PROPERTY_ID,
  BOUNTY_BUDGET_PROPERTY_ID,
  BOUNTY_DIFFICULTY_PROPERTY_ID,
  BOUNTY_STATUS_DONE_ID,
  BOUNTY_TASK_STATUS_PROPERTY_ID,
} from './ontology';

const BOUNTY_ID = 'bf431c502b585c5c8140ef6aa4c80f07';
const PERSON_ID = '865af0e77373454e98978ea9b4a53387';

function makeValue(entityId: string, propertyId: string, value: string): StoreValue {
  return {
    entity: { id: entityId, name: null },
    property: { id: propertyId },
    value,
  } as unknown as StoreValue;
}

function makeRelation(fromId: string, typeId: string, toId: string, toName: string | null = null): StoreRelation {
  return {
    fromEntity: { id: fromId, name: null },
    type: { id: typeId, name: null },
    toEntity: { id: toId, name: toName, value: '' },
  } as unknown as StoreRelation;
}

const noCounts = new Map<string, number>();

describe('buildBounty', () => {
  it('decodes name, description, budget, difficulty, and status from values and relations', () => {
    const values = [
      makeValue(BOUNTY_ID, SystemIds.NAME_PROPERTY, 'Add top 200 drugs'),
      makeValue(BOUNTY_ID, SystemIds.DESCRIPTION_PROPERTY, 'Curate medications'),
      makeValue(BOUNTY_ID, BOUNTY_BUDGET_PROPERTY_ID, '5000'),
    ];
    const relations = [
      makeRelation(BOUNTY_ID, BOUNTY_DIFFICULTY_PROPERTY_ID, 'difficulty-entity', 'Medium'),
      makeRelation(BOUNTY_ID, BOUNTY_TASK_STATUS_PROPERTY_ID, 'status-entity', 'In progress'),
    ];

    const bounty = buildBounty(BOUNTY_ID, values, relations, noCounts, noCounts);

    expect(bounty).toMatchObject({
      id: BOUNTY_ID,
      name: 'Add top 200 drugs',
      description: 'Curate medications',
      budget: 5000,
      difficulty: 'Medium',
      status: 'In progress',
    });
  });

  it('tolerates missing fields: untitled name, null description/budget/status', () => {
    const bounty = buildBounty(BOUNTY_ID, [], [], noCounts, noCounts);
    expect(bounty).toMatchObject({
      name: 'Untitled bounty',
      description: null,
      budget: null,
      difficulty: null,
      status: null,
      deadline: null,
    });
  });
});

describe('isAllocatedToUser', () => {
  const allocation = makeRelation(BOUNTY_ID, BOUNTY_ALLOCATED_PROPERTY_ID, PERSON_ID);

  it('matches an allocation relation against the allocation targets', () => {
    expect(isAllocatedToUser([allocation], [PERSON_ID])).toBe(true);
    expect(isAllocatedToUser([allocation], ['someone-else'])).toBe(false);
    expect(isAllocatedToUser([allocation], [])).toBe(false);
  });

  it('normalizes dashed UUIDs before comparing (wire ids are dashless hex)', () => {
    const dashed = '865af0e7-7373-454e-9897-8ea9b4a53387';
    expect(isAllocatedToUser([allocation], [dashed])).toBe(true);
  });
});

describe('hasBountyTaskStatusDoneRelation', () => {
  it('is true only when Task status points at Done', () => {
    const done = makeRelation(BOUNTY_ID, BOUNTY_TASK_STATUS_PROPERTY_ID, BOUNTY_STATUS_DONE_ID, 'Done');
    const inProgress = makeRelation(BOUNTY_ID, BOUNTY_TASK_STATUS_PROPERTY_ID, 'other-status', 'In progress');
    expect(hasBountyTaskStatusDoneRelation([done])).toBe(true);
    expect(hasBountyTaskStatusDoneRelation([inProgress])).toBe(false);
    expect(hasBountyTaskStatusDoneRelation([])).toBe(false);
  });
});

describe('buildBounties', () => {
  it('keeps only bounties allocated to the user and not Done', () => {
    const allocatedOpen = 'aaaa0000000000000000000000000001';
    const allocatedDone = 'aaaa0000000000000000000000000002';
    const unallocated = 'aaaa0000000000000000000000000003';

    const relations = [
      makeRelation(allocatedOpen, BOUNTY_ALLOCATED_PROPERTY_ID, PERSON_ID),
      makeRelation(allocatedDone, BOUNTY_ALLOCATED_PROPERTY_ID, PERSON_ID),
      makeRelation(allocatedDone, BOUNTY_TASK_STATUS_PROPERTY_ID, BOUNTY_STATUS_DONE_ID, 'Done'),
    ];

    const { bounties, bountiesById } = buildBounties(
      [allocatedOpen, allocatedDone, unallocated],
      [],
      relations,
      noCounts,
      noCounts,
      buildBountyAllocationTargets(null, PERSON_ID)
    );

    expect(bounties.map(bounty => bounty.id)).toEqual([allocatedOpen]);
    expect(bountiesById.has(allocatedDone)).toBe(false);
  });
});
