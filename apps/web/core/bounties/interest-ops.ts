/**
 * Relation builders for curator interest and editor allocation. Both are single
 * relations; the curator's identity in both is their PERSONAL SPACE SYSTEM
 * ENTITY — the entity whose id equals the personal space id:
 *
 * - Interest: `personal-space entity —Interested In→ bounty`, written by the
 *   curator into their OWN personal space (published directly, no governance),
 *   with `toSpaceId` = the bounty's DAO space. Cancelling deletes every
 *   interest row the curator holds for the bounty (duplicates happen).
 * - Allocation: `bounty —Allocated→ personal-space entity`, written by an
 *   editor into the bounty's DAO space (FAST path), with `toSpaceId` = the
 *   curator's personal space. Removal deletes the clicked row's target.
 *
 * Readers stay dual-shape: legacy rows on testnet use the person entity (the
 * curator-app shape) and carry no `toSpaceId`, so lookups accept both.
 */
import { createEntityId } from '~/core/id/create-id';
import { uuidToHex } from '~/core/id/normalize';
import type { Relation } from '~/core/types';

import type { EntityPick } from './bounty-ops';
import type { BountyBacklink } from './fetch-bounty-detail';
import { BOUNTY_ALLOCATED_PROPERTY_ID, INTERESTED_IN_BOUNTY_PROPERTY_ID } from './ontology';

export function buildExpressInterestOps(args: {
  personalSpaceId: string;
  bounty: EntityPick;
  /** The bounty's DAO space — recorded as the relation's toSpaceId. */
  bountySpaceId: string;
}): { relationId: string; relations: Relation[] } {
  const relationId = createEntityId();
  return {
    relationId,
    relations: [
      {
        id: relationId,
        entityId: createEntityId(),
        spaceId: args.personalSpaceId,
        toSpaceId: args.bountySpaceId,
        renderableType: 'RELATION',
        fromEntity: { id: args.personalSpaceId, name: null },
        toEntity: { id: args.bounty.id, name: args.bounty.name, value: args.bounty.id },
        type: { id: INTERESTED_IN_BOUNTY_PROPERTY_ID, name: 'Interested In' },
        isLocal: true,
      },
    ],
  };
}

/**
 * Tombstones every interest row the curator holds for this bounty. Each
 * tombstone keeps ITS ROW'S OWN space: a delete op only removes a relation in
 * the space it is published to, and legacy rows may live in the bounty's DAO
 * space rather than the curator's personal space. Callers publish one edit
 * per space (see groupRelationsBySpace).
 */
export function buildCancelInterestOps(args: { bounty: EntityPick; ownInterestRows: readonly BountyBacklink[] }): {
  relations: Relation[];
} {
  return {
    relations: args.ownInterestRows.map(row => ({
      id: row.id,
      entityId: createEntityId(),
      spaceId: row.spaceId,
      renderableType: 'RELATION' as const,
      fromEntity: { id: row.fromEntityId, name: null },
      toEntity: { id: args.bounty.id, name: args.bounty.name, value: args.bounty.id },
      type: { id: INTERESTED_IN_BOUNTY_PROPERTY_ID, name: 'Interested In' },
      isLocal: true,
      isDeleted: true,
    })),
  };
}

/** One publish reaches one space; split mixed-space relation sets accordingly. */
export function groupRelationsBySpace(relations: readonly Relation[]): Map<string, Relation[]> {
  const bySpace = new Map<string, Relation[]>();
  for (const relation of relations) {
    bySpace.set(relation.spaceId, [...(bySpace.get(relation.spaceId) ?? []), relation]);
  }
  return bySpace;
}

export function buildAllocateOps(args: {
  daoSpaceId: string;
  bounty: EntityPick;
  /** The curator's personal space — its system entity is the allocation target. */
  curatorSpaceId: string;
  curatorName: string | null;
}): { relationId: string; relations: Relation[] } {
  const relationId = createEntityId();
  return {
    relationId,
    relations: [
      {
        id: relationId,
        entityId: createEntityId(),
        spaceId: args.daoSpaceId,
        toSpaceId: args.curatorSpaceId,
        renderableType: 'RELATION',
        fromEntity: { id: args.bounty.id, name: args.bounty.name },
        toEntity: { id: args.curatorSpaceId, name: args.curatorName, value: args.curatorSpaceId },
        type: { id: BOUNTY_ALLOCATED_PROPERTY_ID, name: 'Allocated' },
        isLocal: true,
      },
    ],
  };
}

/** Tombstones every allocation row on the bounty that points at `targetId` (space entity or legacy person entity). */
export function buildRemoveAllocationOps(args: {
  daoSpaceId: string;
  bounty: EntityPick;
  targetId: string;
  existingRelations: readonly Relation[];
}): { relations: Relation[] } {
  const targetHex = uuidToHex(args.targetId);
  return {
    relations: args.existingRelations
      .filter(
        r =>
          r.type.id === BOUNTY_ALLOCATED_PROPERTY_ID &&
          uuidToHex(r.fromEntity.id) === uuidToHex(args.bounty.id) &&
          uuidToHex(r.toEntity.id) === targetHex
      )
      .map(r => ({ ...r, spaceId: args.daoSpaceId, isLocal: true, isDeleted: true })),
  };
}
