import { SystemIds } from '@geoprotocol/geo-sdk/lite';

import { describe, expect, it } from 'vitest';

import type { Relation } from '~/core/types';

import { type BountyFields, buildCreateBountyOps } from './bounty-ops';
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
