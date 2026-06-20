import { SystemIds } from '@geoprotocol/geo-sdk/lite';

import type { Filter } from '~/core/blocks/data/filters';
import { ID } from '~/core/id';
import type { EntityDiff } from '~/core/utils/diff';

import type { RankableEntitySections } from './ranking-rankable-list';
import type { RankingEntryDisplay } from './use-ranking-entry-entities';

export type RankingPendingProposalData = {
  pendingEntityIds: ReadonlySet<string>;
  entriesByEntityId: ReadonlyMap<string, RankingEntryDisplay>;
};

export const EMPTY_RANKING_PENDING_PROPOSAL_DATA: RankingPendingProposalData = {
  pendingEntityIds: new Set<string>(),
  entriesByEntityId: new Map<string, RankingEntryDisplay>(),
};

export type RankingRelationConstraint = {
  typeId: string;
  toEntityId: string;
};

function normalizedEntityId(id: string): string {
  return ID.uuidToHex(id);
}

export function entityDiffToRankingEntry(entity: EntityDiff): RankingEntryDisplay {
  const description = entity.values.find(value => ID.equals(value.propertyId, SystemIds.DESCRIPTION_PROPERTY))?.after;

  return {
    entityId: entity.entityId,
    name: entity.name?.trim() || 'Untitled',
    description: description?.trim() || null,
    image: null,
  };
}

export function getRankingRelationConstraints(filterState: Filter[]): RankingRelationConstraint[] {
  return filterState
    .filter(
      filter => filter.valueType === 'RELATION' && filter.columnId !== SystemIds.SPACE_FILTER && Boolean(filter.value)
    )
    .map(filter => ({ typeId: filter.columnId, toEntityId: filter.value }));
}

function diffAddsRelation(entity: EntityDiff, constraint: RankingRelationConstraint): boolean {
  return entity.relations.some(
    relation =>
      relation.changeType === 'ADD' &&
      relation.after != null &&
      ID.equals(relation.typeId, constraint.typeId) &&
      ID.equals(relation.after.toEntityId, constraint.toEntityId)
  );
}

function diffLooksNewlyCreated(entity: EntityDiff): boolean {
  const nameAdded = entity.values.some(
    value => ID.equals(value.propertyId, SystemIds.NAME_PROPERTY) && value.before == null && value.after != null
  );
  return nameAdded || entity.relations.some(relation => relation.changeType === 'ADD');
}

export function pendingEntityMatchesRanking(entity: EntityDiff, constraints: RankingRelationConstraint[]): boolean {
  if (constraints.length > 0) {
    return constraints.every(constraint => diffAddsRelation(entity, constraint));
  }
  return diffLooksNewlyCreated(entity);
}

export function mergePendingProposalEntityIds(
  sections: RankableEntitySections,
  pendingEntityIds: ReadonlySet<string>
): RankableEntitySections {
  if (pendingEntityIds.size === 0) return sections;

  const rankedKeys = new Set(sections.rankedEntityIds.map(normalizedEntityId));
  const unrankedEntityIds = [...sections.unrankedEntityIds];
  const unrankedKeys = new Set(unrankedEntityIds.map(normalizedEntityId));

  for (const entityId of pendingEntityIds) {
    const key = normalizedEntityId(entityId);
    if (rankedKeys.has(key) || unrankedKeys.has(key)) continue;
    unrankedKeys.add(key);
    unrankedEntityIds.push(entityId);
  }

  return {
    rankedEntityIds: sections.rankedEntityIds,
    unrankedEntityIds,
  };
}
