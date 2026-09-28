import { describe, expect, it } from 'vitest';

import type { Entity, Relation, Value } from '~/core/types';

import { bountySpaceFallbackLabel, spaceRowsById, toBoardBounty } from './fetch-bounties';
import {
  BOUNTY_ALLOCATED_PROPERTY_ID,
  BOUNTY_BUDGET_PROPERTY_ID,
  BOUNTY_DIFFICULTY_PROPERTY_ID,
  BOUNTY_MAINTAINER_PROPERTY_ID,
  BOUNTY_SKILLS_PROPERTY_ID,
  BOUNTY_STATUS_IN_REVIEW_ID,
  BOUNTY_TASK_STATUS_PROPERTY_ID,
  MEDIUM_DIFFICULTY_ID,
} from './ontology';

const BOUNTY_ID = 'bf431c502b585c5c8140ef6aa4c80f07';

function value(propertyId: string, v: string): Value {
  return { entity: { id: BOUNTY_ID, name: null }, property: { id: propertyId }, value: v } as unknown as Value;
}

function relation(typeId: string, toId: string, toName: string | null = null): Relation {
  return {
    fromEntity: { id: BOUNTY_ID, name: null },
    type: { id: typeId, name: null },
    toEntity: { id: toId, name: toName, value: '' },
  } as unknown as Relation;
}

function entity(overrides: Partial<Entity> = {}): Entity {
  return {
    id: BOUNTY_ID,
    name: 'Add top 200 drugs',
    description: null,
    spaces: ['52c7ae149838b6d47ce0f3b2a5974546'],
    types: [],
    values: [value(BOUNTY_BUDGET_PROPERTY_ID, '5000')],
    relations: [
      relation(BOUNTY_DIFFICULTY_PROPERTY_ID, MEDIUM_DIFFICULTY_ID, 'Medium'),
      relation(BOUNTY_TASK_STATUS_PROPERTY_ID, BOUNTY_STATUS_IN_REVIEW_ID, 'In review'),
      relation(BOUNTY_SKILLS_PROPERTY_ID, 'skill-1', 'Pharmacology'),
      relation(BOUNTY_SKILLS_PROPERTY_ID, 'skill-2', '  '),
      relation(BOUNTY_MAINTAINER_PROPERTY_ID, 'person-1', 'Alice'),
      relation(BOUNTY_ALLOCATED_PROPERTY_ID, 'person-2'),
    ],
    updatedAt: '1723000000',
    ...overrides,
  };
}

describe('toBoardBounty', () => {
  it('extracts ids, closed-set labels, skills, maintainers, and allocation from embedded relations', () => {
    const bounty = toBoardBounty(entity(), 'fallback-space');
    expect(bounty).toMatchObject({
      id: BOUNTY_ID,
      spaceId: '52c7ae149838b6d47ce0f3b2a5974546',
      budget: 5000,
      difficultyId: MEDIUM_DIFFICULTY_ID,
      difficulty: 'Medium',
      statusId: BOUNTY_STATUS_IN_REVIEW_ID,
      status: 'In review',
      skills: [
        { id: 'skill-1', name: 'Pharmacology' },
        { id: 'skill-2', name: 'Untitled skill' },
      ],
      maintainers: [{ id: 'person-1', name: 'Alice' }],
      allocatedIds: ['person-2'],
      interestedCount: 0,
    });
    // Unix-seconds strings become ISO timestamps for sorting.
    expect(bounty.updatedAt).toBe(new Date(1723000000 * 1000).toISOString());
  });

  it('defaults status to Backlog and uses the fallback space when the entity lists none', () => {
    const bounty = toBoardBounty(entity({ spaces: [], relations: [] }), 'fallback-space');
    expect(bounty.spaceId).toBe('fallback-space');
    expect(bounty.statusId).toBeNull();
    expect(bounty.status).toBe('Backlog');
    expect(bounty.difficulty).toBeNull();
  });

  it('passes ISO updatedAt strings through unchanged', () => {
    expect(toBoardBounty(entity({ updatedAt: '2026-08-01T00:00:00.000Z' }), 'x').updatedAt).toBe(
      '2026-08-01T00:00:00.000Z'
    );
  });
});

describe('spaceRowsById', () => {
  it('labels spaces by name with a compact-id fallback and placeholder image', () => {
    const rows = spaceRowsById(
      [{ id: 'aaaa0000000000000000000000000001', entity: { name: 'Health', image: 'ipfs://img' } }] as never,
      ['aaaa0000000000000000000000000001', 'bbbb0000000000000000000000000002']
    );
    expect(rows.get('aaaa0000000000000000000000000001')).toMatchObject({ label: 'Health', image: 'ipfs://img' });
    expect(rows.get('bbbb0000000000000000000000000002')?.label).toBe(
      bountySpaceFallbackLabel('bbbb0000000000000000000000000002')
    );
  });
});
