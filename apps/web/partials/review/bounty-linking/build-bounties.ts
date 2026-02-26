import {
  BOUNTY_ALLOCATED_PROPERTY_ID,
  BOUNTY_BUDGET_PROPERTY_ID,
  BOUNTY_MAX_CONTRIBUTORS_PROPERTY_ID,
  BOUNTY_SUBMISSIONS_PER_PERSON_PROPERTY_ID,
  BOUNTY_TYPE_ID,
} from '~/core/constants';
import type { Relation as StoreRelation, Value as StoreValue } from '~/core/types';
import { Entities } from '~/core/utils/entity';

import type { Bounty, BountyDifficulty, BountyStatus } from './types';

const BOUNTY_DESCRIPTION_NAMES = new Set(['description', 'details', 'summary']);
const BOUNTY_MAX_PAYOUT_NAMES = new Set(['max payout', 'maximum payout', 'payout', 'reward', 'reward amount']);
const BOUNTY_BUDGET_NAMES = new Set(['bounty budget', 'budget']);
const BOUNTY_MAX_CONTRIBUTORS_NAMES = new Set(['max contributors', 'maximum contributors', 'contributors']);
const BOUNTY_SUBMISSIONS_PER_PERSON_NAMES = new Set([
  'submissions per person',
  'submissions per contributor',
  'submissions per user',
]);
const BOUNTY_DIFFICULTY_NAMES = new Set(['difficulty', 'difficulty level', 'level']);
const BOUNTY_STATUS_NAMES = new Set(['status', 'state']);
const BOUNTY_DEADLINE_NAMES = new Set(['deadline', 'due date', 'due']);
const BOUNTY_SUBMISSIONS_NAMES = new Set(['submissions', 'your submissions']);

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
    findValueByNames(entityValues, new Set(['name', 'title'])) ??
    entityValues[0]?.entity.name ??
    'Untitled bounty';

  const description =
    Entities.description(entityValues) ??
    findValueByNames(entityValues, BOUNTY_DESCRIPTION_NAMES) ??
    null;

  const maxPayout = parseNumber(
    findValueByNames(entityValues, BOUNTY_MAX_PAYOUT_NAMES) ??
      findRelationValueByNames(entityRelations, BOUNTY_MAX_PAYOUT_NAMES)
  );

  const budget = parseNumber(
    findValueById(entityValues, BOUNTY_BUDGET_PROPERTY_ID) ??
      findValueByNames(entityValues, BOUNTY_BUDGET_NAMES) ??
      findRelationValueByNames(entityRelations, BOUNTY_BUDGET_NAMES)
  );

  const maxContributors = parseNumber(
    findValueById(entityValues, BOUNTY_MAX_CONTRIBUTORS_PROPERTY_ID) ??
      findValueByNames(entityValues, BOUNTY_MAX_CONTRIBUTORS_NAMES) ??
      findRelationValueByNames(entityRelations, BOUNTY_MAX_CONTRIBUTORS_NAMES)
  );

  const submissionsPerPerson = parseNumber(
    findValueById(entityValues, BOUNTY_SUBMISSIONS_PER_PERSON_PROPERTY_ID) ??
      findValueByNames(entityValues, BOUNTY_SUBMISSIONS_PER_PERSON_NAMES) ??
      findRelationValueByNames(entityRelations, BOUNTY_SUBMISSIONS_PER_PERSON_NAMES)
  );

  const submissionsCount = submissionCounts.get(entityId) ?? 0;
  const userSubmissionsCount = personalSubmissionCounts.get(entityId) ?? 0;

  const difficulty = parseDifficulty(
    findValueByNames(entityValues, BOUNTY_DIFFICULTY_NAMES) ??
      findRelationValueByNames(entityRelations, BOUNTY_DIFFICULTY_NAMES)
  );

  const status = parseStatus(
    findValueByNames(entityValues, BOUNTY_STATUS_NAMES) ??
      findRelationValueByNames(entityRelations, BOUNTY_STATUS_NAMES)
  );

  const deadline =
    findValueByNames(entityValues, BOUNTY_DEADLINE_NAMES) ??
    findRelationValueByNames(entityRelations, BOUNTY_DEADLINE_NAMES) ??
    null;

  const submissions = parseSubmissions(
    findValueByNames(entityValues, BOUNTY_SUBMISSIONS_NAMES) ??
      findRelationValueByNames(entityRelations, BOUNTY_SUBMISSIONS_NAMES)
  );

  return {
    id: entityId,
    spaceId,
    name,
    description,
    maxPayout,
    budget,
    maxContributors,
    submissionsPerPerson,
    submissionsCount,
    userSubmissionsCount,
    difficulty,
    status,
    deadline,
    yourSubmissions: submissions,
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

function findValueByNames(values: StoreValue[], names: Set<string>): string | null {
  const match = values.find(value => {
    const normalized = normalizeName(value.property.name);
    return normalized ? names.has(normalized) : false;
  });
  return match?.value ?? null;
}

function findValueById(values: StoreValue[], propertyId: string): string | null {
  const match = values.find(value => value.property.id === propertyId);
  return match?.value ?? null;
}

function findRelationValueByNames(relations: StoreRelation[], names: Set<string>): string | null {
  const match = relations.find(relation => {
    const normalized = normalizeName(relation.type.name);
    return normalized ? names.has(normalized) : false;
  });
  return match?.toEntity.name ?? null;
}

function normalizeName(name: string | null | undefined): string | null {
  if (!name) return null;
  return name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
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

function parseSubmissions(value: string | null): { current: number; max: number } | null {
  if (!value) return null;
  const match = value.match(/(\d+)\s*\/\s*(\d+)/);
  if (!match) return null;
  const current = Number(match[1]);
  const max = Number(match[2]);
  if (!Number.isFinite(current) || !Number.isFinite(max)) return null;
  return { current, max };
}
