import { SystemIds } from '@geoprotocol/geo-sdk/lite';

import { describe, expect, it } from 'vitest';

import type { Relation } from '~/core/types';

import { type BountyFields, buildCreateBountyOps, buildUpdateBountyOps } from './bounty-ops';
import {
  BOUNTY_BUDGET_PROPERTY_ID,
  BOUNTY_CREATOR_PROPERTY_ID,
  BOUNTY_DEADLINE_PROPERTY_ID,
  BOUNTY_DIFFICULTY_PROPERTY_ID,
  BOUNTY_MAINTAINER_PROPERTY_ID,
  BOUNTY_MAX_CONTRIBUTORS_PROPERTY_ID,
  BOUNTY_MAX_SUBMISSIONS_PER_PERSON_PROPERTY_ID,
  BOUNTY_SKILLS_PROPERTY_ID,
  BOUNTY_STATUS_BACKLOG_ID,
  BOUNTY_STATUS_IN_PROGRESS_ID,
  BOUNTY_TASK_STATUS_PROPERTY_ID,
  BOUNTY_TYPE_ID,
  EASY_DIFFICULTY_ID,
  HARD_DIFFICULTY_ID,
} from './ontology';

const fields: BountyFields = {
  spaceId: 'space-1',
  name: 'Add top 200 drugs',
  description: 'Curate medications',
  budget: 5000,
  difficulty: 'hard',
  status: 'in-progress',
  deadline: '2026-12-31T00:00:00.000Z',
  maxContributors: 3,
  maxSubmissionsPerPerson: 2,
  skills: [{ id: 'skill-1', name: 'Pharmacology' }],
  maintainers: [{ id: 'person-1', name: 'Alice' }],
};

const byProperty = (values: { property: { id: string }; value: string; isDeleted?: boolean }[]) =>
  Object.fromEntries(values.map(v => [v.property.id, v.isDeleted ? null : v.value]));
const relTargets = (relations: Relation[], typeId: string) =>
  relations.filter(r => r.type.id === typeId && !r.isDeleted).map(r => r.toEntity.id);

describe('buildCreateBountyOps', () => {
  it('writes every scalar value and the Types/status/difficulty/skills/maintainers/creator relations', () => {
    const { entityId, values, relations } = buildCreateBountyOps(fields, { id: 'creator-1', name: 'Bob' });

    expect(values.every(v => v.entity.id === entityId && v.spaceId === 'space-1' && v.isLocal)).toBe(true);
    expect(byProperty(values)).toEqual({
      [SystemIds.NAME_PROPERTY]: 'Add top 200 drugs',
      [SystemIds.DESCRIPTION_PROPERTY]: 'Curate medications',
      [BOUNTY_BUDGET_PROPERTY_ID]: '5000',
      [BOUNTY_MAX_CONTRIBUTORS_PROPERTY_ID]: '3',
      [BOUNTY_MAX_SUBMISSIONS_PER_PERSON_PROPERTY_ID]: '2',
      [BOUNTY_DEADLINE_PROPERTY_ID]: '2026-12-31T00:00:00.000Z',
    });
    expect(values.find(v => v.property.id === BOUNTY_BUDGET_PROPERTY_ID)?.property.dataType).toBe('FLOAT');
    expect(values.find(v => v.property.id === BOUNTY_DEADLINE_PROPERTY_ID)?.property.dataType).toBe('DATETIME');

    expect(relations.every(r => r.fromEntity.id === entityId && r.spaceId === 'space-1')).toBe(true);
    expect(relTargets(relations, SystemIds.TYPES_PROPERTY)).toEqual([BOUNTY_TYPE_ID]);
    expect(relTargets(relations, BOUNTY_TASK_STATUS_PROPERTY_ID)).toEqual([BOUNTY_STATUS_IN_PROGRESS_ID]);
    expect(relTargets(relations, BOUNTY_DIFFICULTY_PROPERTY_ID)).toEqual([HARD_DIFFICULTY_ID]);
    expect(relTargets(relations, BOUNTY_SKILLS_PROPERTY_ID)).toEqual(['skill-1']);
    expect(relTargets(relations, BOUNTY_MAINTAINER_PROPERTY_ID)).toEqual(['person-1']);
    expect(relTargets(relations, BOUNTY_CREATOR_PROPERTY_ID)).toEqual(['creator-1']);
  });

  it('unsets empty scalars, defaults status to Backlog, and skips difficulty/creator when absent', () => {
    const { values, relations } = buildCreateBountyOps(
      {
        ...fields,
        description: '  ',
        budget: null,
        difficulty: null,
        status: 'backlog',
        deadline: null,
        maxContributors: null,
        maxSubmissionsPerPerson: null,
        skills: [],
        maintainers: [],
      },
      null
    );
    expect(byProperty(values)).toEqual({
      [SystemIds.NAME_PROPERTY]: 'Add top 200 drugs',
      [SystemIds.DESCRIPTION_PROPERTY]: null,
      [BOUNTY_BUDGET_PROPERTY_ID]: null,
      [BOUNTY_MAX_CONTRIBUTORS_PROPERTY_ID]: null,
      [BOUNTY_MAX_SUBMISSIONS_PER_PERSON_PROPERTY_ID]: null,
      [BOUNTY_DEADLINE_PROPERTY_ID]: null,
    });
    expect(relTargets(relations, BOUNTY_TASK_STATUS_PROPERTY_ID)).toEqual([BOUNTY_STATUS_BACKLOG_ID]);
    expect(relTargets(relations, BOUNTY_DIFFICULTY_PROPERTY_ID)).toEqual([]);
    expect(relTargets(relations, BOUNTY_CREATOR_PROPERTY_ID)).toEqual([]);
  });
});

function existing(typeId: string, toId: string, id = `rel-${typeId}-${toId}`): Relation {
  return {
    id,
    entityId: `${id}-entity`,
    spaceId: 'space-1',
    renderableType: 'RELATION',
    fromEntity: { id: 'bounty-1', name: 'Old name' },
    toEntity: { id: toId, name: null, value: toId },
    type: { id: typeId, name: null },
  };
}

describe('buildUpdateBountyOps', () => {
  const current: Relation[] = [
    existing(SystemIds.TYPES_PROPERTY, BOUNTY_TYPE_ID),
    existing(BOUNTY_TASK_STATUS_PROPERTY_ID, BOUNTY_STATUS_BACKLOG_ID),
    existing(BOUNTY_DIFFICULTY_PROPERTY_ID, EASY_DIFFICULTY_ID),
    existing(BOUNTY_SKILLS_PROPERTY_ID, 'skill-1'),
    existing(BOUNTY_SKILLS_PROPERTY_ID, 'skill-old'),
    existing(BOUNTY_MAINTAINER_PROPERTY_ID, 'person-1'),
    existing(BOUNTY_CREATOR_PROPERTY_ID, 'creator-1'),
  ];

  it('replaces changed single-valued relations and diffs multi-valued ones, leaving the rest alone', () => {
    const { values, relations } = buildUpdateBountyOps('bounty-1', fields, current);

    // Values are a full upsert of the scalar set.
    expect(byProperty(values)[SystemIds.NAME_PROPERTY]).toBe('Add top 200 drugs');

    const deleted = relations.filter(r => r.isDeleted).map(r => r.id);
    // Status backlog→in-progress and difficulty easy→hard: old rows tombstoned, new rows added.
    expect(deleted).toContain(`rel-${BOUNTY_TASK_STATUS_PROPERTY_ID}-${BOUNTY_STATUS_BACKLOG_ID}`);
    expect(deleted).toContain(`rel-${BOUNTY_DIFFICULTY_PROPERTY_ID}-${EASY_DIFFICULTY_ID}`);
    expect(relTargets(relations, BOUNTY_TASK_STATUS_PROPERTY_ID)).toEqual([BOUNTY_STATUS_IN_PROGRESS_ID]);
    expect(relTargets(relations, BOUNTY_DIFFICULTY_PROPERTY_ID)).toEqual([HARD_DIFFICULTY_ID]);
    // Skills: skill-1 kept (no new row), skill-old removed.
    expect(deleted).toContain(`rel-${BOUNTY_SKILLS_PROPERTY_ID}-skill-old`);
    expect(relTargets(relations, BOUNTY_SKILLS_PROPERTY_ID)).toEqual([]);
    // Maintainer unchanged → nothing.
    expect(relations.some(r => r.type.id === BOUNTY_MAINTAINER_PROPERTY_ID)).toBe(false);
    // Types and Creator never touched.
    expect(relations.some(r => r.type.id === SystemIds.TYPES_PROPERTY)).toBe(false);
    expect(relations.some(r => r.type.id === BOUNTY_CREATOR_PROPERTY_ID)).toBe(false);
  });

  it('is a no-op on relations when nothing changed', () => {
    const same: BountyFields = {
      ...fields,
      status: 'backlog',
      difficulty: 'easy',
      skills: [
        { id: 'skill-1', name: null },
        { id: 'skill-old', name: null },
      ],
    };
    const { relations } = buildUpdateBountyOps('bounty-1', same, current);
    expect(relations).toEqual([]);
  });

  it('clears difficulty by tombstoning without adding a replacement', () => {
    const { relations } = buildUpdateBountyOps('bounty-1', { ...fields, difficulty: null }, current);
    expect(relations.filter(r => r.type.id === BOUNTY_DIFFICULTY_PROPERTY_ID).every(r => r.isDeleted)).toBe(true);
    expect(relTargets(relations, BOUNTY_DIFFICULTY_PROPERTY_ID)).toEqual([]);
  });
});
