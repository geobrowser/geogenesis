import { SystemIds } from '@geoprotocol/geo-sdk/lite';
import { describe, expect, it } from 'vitest';

import type { Filter } from '~/core/blocks/data/filters';
import type { EntityDiff } from '~/core/utils/diff';

import {
  getRankingRelationConstraints,
  mergePendingProposalEntityIds,
  pendingEntityMatchesRanking,
  type RankingRelationConstraint,
} from './ranking-pending-proposal-entries';

const TYPE_ID = 'restaurant-type';

function relationFilter(columnId: string, value: string): Filter {
  return { columnId, columnName: null, valueType: 'RELATION', value, valueName: null };
}

function makeDiff(overrides: Partial<EntityDiff>): EntityDiff {
  return {
    entityId: 'entity-1',
    name: 'New restaurant',
    values: [],
    relations: [],
    blocks: [],
    ...overrides,
  };
}

function addRelation(typeId: string, toEntityId: string): EntityDiff['relations'][number] {
  return {
    relationId: `rel-${toEntityId}`,
    typeId,
    spaceId: 'space-a',
    changeType: 'ADD',
    before: null,
    after: { toEntityId },
  };
}

describe('getRankingRelationConstraints', () => {
  it('keeps relation filters and drops the space filter', () => {
    const filters: Filter[] = [
      relationFilter(SystemIds.TYPES_PROPERTY, TYPE_ID),
      relationFilter(SystemIds.SPACE_FILTER, 'space-a'),
      { columnId: SystemIds.NAME_PROPERTY, columnName: null, valueType: 'TEXT', value: 'pizza', valueName: null },
    ];

    expect(getRankingRelationConstraints(filters)).toEqual([{ typeId: SystemIds.TYPES_PROPERTY, toEntityId: TYPE_ID }]);
  });
});

describe('pendingEntityMatchesRanking', () => {
  const typeConstraint: RankingRelationConstraint[] = [{ typeId: SystemIds.TYPES_PROPERTY, toEntityId: TYPE_ID }];

  it('matches a newly-created entity that adds the required type relation', () => {
    const diff = makeDiff({ relations: [addRelation(SystemIds.TYPES_PROPERTY, TYPE_ID)] });
    expect(pendingEntityMatchesRanking(diff, typeConstraint)).toBe(true);
  });

  it('normalizes ids when comparing (dash- and case-insensitive)', () => {
    const diff = makeDiff({ relations: [addRelation(SystemIds.TYPES_PROPERTY, TYPE_ID.toUpperCase())] });
    expect(pendingEntityMatchesRanking(diff, typeConstraint)).toBe(true);
  });

  it('rejects an entity of a different type', () => {
    const diff = makeDiff({ relations: [addRelation(SystemIds.TYPES_PROPERTY, 'other-type')] });
    expect(pendingEntityMatchesRanking(diff, typeConstraint)).toBe(false);
  });

  it('rejects an edit to an existing entity (type relation not added in this proposal)', () => {
    const diff = makeDiff({
      relations: [{ ...addRelation(SystemIds.TYPES_PROPERTY, TYPE_ID), changeType: 'UPDATE' }],
    });
    expect(pendingEntityMatchesRanking(diff, typeConstraint)).toBe(false);
  });

  it('with no relation constraints, accepts a newly-named entity', () => {
    const diff = makeDiff({
      relations: [],
      values: [
        {
          propertyId: SystemIds.NAME_PROPERTY,
          spaceId: 'space-a',
          type: 'TEXT',
          before: null,
          after: 'New restaurant',
          diff: [],
        },
      ],
    });
    expect(pendingEntityMatchesRanking(diff, [])).toBe(true);
  });

  it('with no relation constraints, rejects an entity with no added content', () => {
    const diff = makeDiff({
      relations: [],
      values: [
        {
          propertyId: SystemIds.NAME_PROPERTY,
          spaceId: 'space-a',
          type: 'TEXT',
          before: 'Old name',
          after: 'New name',
          diff: [],
        },
      ],
    });
    expect(pendingEntityMatchesRanking(diff, [])).toBe(false);
  });
});

describe('mergePendingProposalEntityIds', () => {
  it('appends pending ids to the unranked section, skipping ones already listed', () => {
    const sections = { rankedEntityIds: ['ranked-1'], unrankedEntityIds: ['unranked-1'] };
    const pending = new Set(['ranked-1', 'unranked-1', 'pending-1']);

    expect(mergePendingProposalEntityIds(sections, pending)).toEqual({
      rankedEntityIds: ['ranked-1'],
      unrankedEntityIds: ['unranked-1', 'pending-1'],
    });
  });
});
