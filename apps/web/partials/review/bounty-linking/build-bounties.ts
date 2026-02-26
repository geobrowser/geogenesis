import {
  BOUNTY_ALLOCATED_PROPERTY_ID,
  BOUNTY_BUDGET_PROPERTY_ID,
  BOUNTY_DEADLINE_PROPERTY_ID,
  BOUNTY_DESCRIPTION_PROPERTY_ID,
  BOUNTY_DIFFICULTY_PROPERTY_ID,
  BOUNTY_MAX_CONTRIBUTORS_PROPERTY_ID,
  BOUNTY_STATUS_PROPERTY_ID,
  BOUNTY_SUBMISSIONS_PER_PERSON_PROPERTY_ID,
  BOUNTY_TYPE_ID,
} from '~/core/constants';
import type { Relation as StoreRelation, Value as StoreValue } from '~/core/types';
import { Entities } from '~/core/utils/entity';

import type { Bounty, BountyDifficulty, BountyStatus } from './types';

export function isBountyTypeRelation(relation: StoreRelation): boolean {
  return relation.toEntity.id === BOUNTY_TYPE_ID;
}

export function buildBounties(
  entityIds: string[],
  values: StoreValue[],
  relations: StoreRelation[],
  submissionCounts: Map<string, number>,
  personalSubmissionCounts: Map<string, number>,
  allocationTargets: string[],
  spaceId?: string,
  personalSpaceId?: string
): { bounties: Bounty[]; bountiesById: Map<string, Bounty> } {
  const valuesByEntity = new Map<string, StoreValue[]>();
  const relationsByEntity = new Map<string, StoreRelation[]>();

  for (const value of values) {
    const existing = valuesByEntity.get(value.entity.id) ?? [];
    existing.push(value);
    valuesByEntity.set(value.entity.id, existing);
  }

  for (const relation of relations) {
    const existing = relationsByEntity.get(relation.fromEntity.id) ?? [];
    existing.push(relation);
    relationsByEntity.set(relation.fromEntity.id, existing);
  }

  const bounties = entityIds
    .filter(entityId => isAllocatedToUser(relationsByEntity.get(entityId) ?? [], allocationTargets))
    .map(entityId => {
      const entityValues = valuesByEntity.get(entityId) ?? [];
      const entityRelations = relationsByEntity.get(entityId) ?? [];

      return buildBounty(
        entityId,
        entityValues,
        entityRelations,
        submissionCounts,
        personalSubmissionCounts,
        spaceId,
        personalSpaceId
      );
    });

  const bountiesById = new Map(bounties.map(bounty => [bounty.id, bounty]));

  return { bounties, bountiesById };
}

export function buildBounty(
  entityId: string,
  entityValues: StoreValue[],
  entityRelations: StoreRelation[],
  submissionCounts: Map<string, number>,
  personalSubmissionCounts: Map<string, number>,
  spaceId?: string,
  personalSpaceId?: string
): Bounty {
  const name =
    Entities.name(entityValues) ??
    entityValues[0]?.entity.name ??
    'Untitled bounty';

  const description =
    Entities.description(entityValues) ??
    findValueById(entityValues, BOUNTY_DESCRIPTION_PROPERTY_ID) ??
    null;

  const budget = parseNumber(
    findValueById(entityValues, BOUNTY_BUDGET_PROPERTY_ID) ??
      findRelationValueById(entityRelations, BOUNTY_BUDGET_PROPERTY_ID)
  );

  const maxContributors = parseNumber(
    findValueById(entityValues, BOUNTY_MAX_CONTRIBUTORS_PROPERTY_ID) ??
      findRelationValueById(entityRelations, BOUNTY_MAX_CONTRIBUTORS_PROPERTY_ID)
  );

  const submissionsPerPerson = parseNumber(
    findValueById(entityValues, BOUNTY_SUBMISSIONS_PER_PERSON_PROPERTY_ID) ??
      findRelationValueById(entityRelations, BOUNTY_SUBMISSIONS_PER_PERSON_PROPERTY_ID)
  );

  const submissionsCount = submissionCounts.get(entityId) ?? 0;
  const userSubmissionsCount = personalSubmissionCounts.get(entityId) ?? 0;

  const difficulty = parseDifficulty(
    findValueById(entityValues, BOUNTY_DIFFICULTY_PROPERTY_ID) ??
      findRelationValueById(entityRelations, BOUNTY_DIFFICULTY_PROPERTY_ID)
  );

  const status = parseStatus(
    findValueById(entityValues, BOUNTY_STATUS_PROPERTY_ID) ??
      findRelationValueById(entityRelations, BOUNTY_STATUS_PROPERTY_ID)
  );

  const deadline =
    findValueById(entityValues, BOUNTY_DEADLINE_PROPERTY_ID) ??
    findRelationValueById(entityRelations, BOUNTY_DEADLINE_PROPERTY_ID) ??
    null;

  return {
    id: entityId,
    spaceId,
    name,
    description,
    budget,
    maxContributors,
    submissionsPerPerson,
    submissionsCount,
    userSubmissionsCount,
    difficulty,
    status,
    deadline,
  };
}

export function isAllocatedToUser(relations: StoreRelation[], allocationTargets: string[]): boolean {
  if (allocationTargets.length === 0) return false;
  const targetIds = new Set(allocationTargets);
  return relations.some(relation => {
    if (relation.type.id !== BOUNTY_ALLOCATED_PROPERTY_ID) return false;
    // Some relation variants only carry a top-level toEntityId without a
    // nested toEntity object, so fall back to that field when present.
    const toEntityId =
      relation.toEntity?.id ??
      (relation as StoreRelation & { toEntityId?: string }).toEntityId ??
      null;
    return toEntityId ? targetIds.has(toEntityId) : false;
  });
}

function findValueById(values: StoreValue[], propertyId: string): string | null {
  const match = values.find(value => value.property.id === propertyId);
  return match?.value ?? null;
}

function findRelationValueById(relations: StoreRelation[], propertyId: string): string | null {
  const match = relations.find(relation => relation.type.id === propertyId);
  return match?.toEntity.name ?? null;
}

function parseNumber(value: string | null): number | null {
  if (!value) return null;
  const cleaned = value.replace(/[^0-9.-]/g, '');
  if (!cleaned) return null;
  const parsed = Number(cleaned);
  return Number.isFinite(parsed) ? parsed : null;
}

function parseDifficulty(value: string | null): BountyDifficulty | null {
  if (!value) return null;
  const normalized = value.trim().toUpperCase();
  if (normalized.startsWith('LOW')) return 'LOW';
  if (normalized.startsWith('MED')) return 'MEDIUM';
  if (normalized.startsWith('HARD')) return 'HARD';
  if (normalized.startsWith('EXP')) return 'EXPERT';
  return null;
}

function parseStatus(value: string | null): BountyStatus | null {
  if (!value) return null;
  const normalized = value.trim().toUpperCase();
  if (normalized.includes('OPEN')) return 'OPEN';
  if (normalized.includes('ALLOCATED')) return 'ALLOCATED';
  if (normalized.includes('SELF')) return 'SELF_ASSIGNED';
  if (normalized.includes('PROGRESS')) return 'IN_PROGRESS';
  if (normalized.includes('COMPLETE')) return 'COMPLETED';
  if (normalized.includes('CANCEL')) return 'CANCELLED';
  return null;
}
