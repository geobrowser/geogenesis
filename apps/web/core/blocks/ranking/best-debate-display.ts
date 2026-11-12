import {
  DEBATE_OPPOSED_BY_PROPERTY_ID,
  DEBATE_SUPPORTED_BY_PROPERTY_ID,
  DEBATE_TYPE_ID,
  TYPES_PROPERTY_ID,
} from '~/core/debates/ontology';
import { debateClaimFromEntity } from '~/core/explore/explore-card-item';
import type { Entity } from '~/core/types';
import { normId } from '~/core/utils/norm-id';

import { debateOwnSpaceId } from './best-debates-debates';

/**
 * What a Best debates row shows for one debate (GEO-3591 mockups): the claim as its title, the
 * debaters, its own space and its age. Everything comes off the Debate entity's relations, the way
 * the Explore card reads them, never by splitting the debate's "Claim | A vs. B" name.
 */
export type BestDebateDisplay = {
  entityId: string;
  /** The debated claim's name; the debate's own name when it has no Claims relation. */
  title: string;
  /** Supported by first, then Opposed by: the people's personal space ids. */
  debaterSpaceIds: string[];
  /** The debate's own space (where it is typed a Debate), or null when none is known. */
  ownSpaceId: string | null;
  createdAtMs: number | null;
};

const DEBATE_TYPE = normId(DEBATE_TYPE_ID);
const TYPES = normId(TYPES_PROPERTY_ID);

function targets(entity: Entity, propertyId: string): string[] {
  const property = normId(propertyId);
  return entity.relations
    .filter(relation => relation.isDeleted !== true && normId(relation.type.id) === property)
    .map(relation => relation.toEntity.id);
}

export function bestDebateDisplayFromEntity(entity: Entity): BestDebateDisplay {
  const claim = debateClaimFromEntity(entity.types, entity.relations);
  const debaterSpaceIds = [
    ...new Set([
      ...targets(entity, DEBATE_SUPPORTED_BY_PROPERTY_ID),
      ...targets(entity, DEBATE_OPPOSED_BY_PROPERTY_ID),
    ]),
  ];
  const typedSpaceIds = entity.relations
    .filter(
      relation =>
        relation.isDeleted !== true &&
        normId(relation.type.id) === TYPES &&
        normId(relation.toEntity.id) === DEBATE_TYPE &&
        Boolean(relation.spaceId)
    )
    .map(relation => relation.spaceId);
  return {
    entityId: normId(entity.id),
    title: claim?.name ?? entity.name?.trim() ?? 'Untitled debate',
    debaterSpaceIds,
    // The spaces it is typed a Debate in, as the ballot files it; a read without its Types relations
    // falls back to the spaces it is in at all.
    ownSpaceId: debateOwnSpaceId(typedSpaceIds.length > 0 ? typedSpaceIds : (entity.spaces ?? [])),
    createdAtMs: createdAtMs(entity.createdAt),
  };
}

/** `createdAt` is unix seconds or ISO 8601 depending on the backend (see `debateCreatedDate`). */
function createdAtMs(raw: string | number | null | undefined): number | null {
  if (raw === undefined || raw === null || raw === '') return null;
  const ms = typeof raw === 'number' ? raw * 1000 : /^\d+$/.test(raw) ? Number(raw) * 1000 : Date.parse(raw);
  return Number.isFinite(ms) ? ms : null;
}

/** "Chris Brown" → "Chris B."; a single name, or a handle, stays as it is. */
export function shortPersonName(name: string | null | undefined): string | null {
  // A trailing handle in brackets ("Alexa Dominique (alexadominique.8)") isn't part of the name.
  const parts = (name ?? '')
    .replace(/\s*\([^)]*\)\s*$/, '')
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (parts.length === 0) return null;
  if (parts.length === 1) return parts[0];
  const last = parts[parts.length - 1];
  const initial = Array.from(last)[0];
  return initial && /\p{L}/u.test(initial) ? `${parts[0]} ${initial.toUpperCase()}.` : parts[0];
}

/** "Chris B. and Ben T."; null when no debater's name is known. */
export function debatersLabel(names: ReadonlyArray<string | null>): string | null {
  const known = names.filter((name): name is string => Boolean(name));
  if (known.length === 0) return null;
  if (known.length === 1) return known[0];
  return `${known.slice(0, -1).join(', ')} and ${known[known.length - 1]}`;
}

/** "6h ago", "7d ago" (the mockups' age). */
export function debateAgeLabel(createdAtMs: number | null, now = Date.now()): string | null {
  if (createdAtMs == null || !Number.isFinite(createdAtMs)) return null;
  const minutes = Math.max(0, Math.floor((now - createdAtMs) / 60_000));
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}
