/**
 * Relation builders for curator interest and editor allocation. Both are single
 * relations; what differs is who authors them and into which space:
 *
 * - Interest: `person —Interested In→ bounty`, written by the curator into their
 *   OWN personal space (published directly, no governance). No `toSpaceId`,
 *   matching every existing row on testnet. Cancelling deletes every interest
 *   row the curator holds for the bounty (duplicates happen).
 * - Allocation: `bounty —Allocated→ person`, written by an editor into the
 *   bounty's DAO space (FAST path). Removal deletes every allocation row for
 *   that person.
 */
import { createEntityId } from '~/core/id/create-id';
import { uuidToHex } from '~/core/id/normalize';
import type { Relation } from '~/core/types';

import type { EntityPick } from './bounty-ops';
import type { BountyBacklink } from './fetch-bounty-detail';
import { BOUNTY_ALLOCATED_PROPERTY_ID, INTERESTED_IN_BOUNTY_PROPERTY_ID } from './ontology';

export function buildExpressInterestOps(args: { personalSpaceId: string; person: EntityPick; bounty: EntityPick }): {
  relationId: string;
  relations: Relation[];
} {
  const relationId = createEntityId();
  return {
    relationId,
    relations: [
      {
        id: relationId,
        entityId: createEntityId(),
        spaceId: args.personalSpaceId,
        renderableType: 'RELATION',
        fromEntity: { id: args.person.id, name: args.person.name },
        toEntity: { id: args.bounty.id, name: args.bounty.name, value: args.bounty.id },
        type: { id: INTERESTED_IN_BOUNTY_PROPERTY_ID, name: 'Interested In' },
        isLocal: true,
      },
    ],
  };
}

/** Tombstones every interest row the curator authored for this bounty. */
export function buildCancelInterestOps(args: {
  personalSpaceId: string;
  person: EntityPick;
  bounty: EntityPick;
  ownInterestRows: readonly BountyBacklink[];
}): { relations: Relation[] } {
  return {
    relations: args.ownInterestRows.map(row => ({
      id: row.id,
      entityId: createEntityId(),
      spaceId: args.personalSpaceId,
      renderableType: 'RELATION',
      fromEntity: { id: args.person.id, name: args.person.name },
      toEntity: { id: args.bounty.id, name: args.bounty.name, value: args.bounty.id },
      type: { id: INTERESTED_IN_BOUNTY_PROPERTY_ID, name: 'Interested In' },
      isLocal: true,
      isDeleted: true,
    })),
  };
}

export function buildAllocateOps(args: { daoSpaceId: string; bounty: EntityPick; person: EntityPick }): {
  relationId: string;
  relations: Relation[];
} {
  const relationId = createEntityId();
  return {
    relationId,
    relations: [
      {
        id: relationId,
        entityId: createEntityId(),
        spaceId: args.daoSpaceId,
        renderableType: 'RELATION',
        fromEntity: { id: args.bounty.id, name: args.bounty.name },
        toEntity: { id: args.person.id, name: args.person.name, value: args.person.id },
        type: { id: BOUNTY_ALLOCATED_PROPERTY_ID, name: 'Allocated' },
        isLocal: true,
      },
    ],
  };
}

/** Tombstones every allocation row on the bounty that points at `person`. */
export function buildRemoveAllocationOps(args: {
  daoSpaceId: string;
  bounty: EntityPick;
  person: EntityPick;
  existingRelations: readonly Relation[];
}): { relations: Relation[] } {
  const personHex = uuidToHex(args.person.id);
  return {
    relations: args.existingRelations
      .filter(
        r =>
          r.type.id === BOUNTY_ALLOCATED_PROPERTY_ID &&
          uuidToHex(r.fromEntity.id) === uuidToHex(args.bounty.id) &&
          uuidToHex(r.toEntity.id) === personHex
      )
      .map(r => ({ ...r, spaceId: args.daoSpaceId, isLocal: true, isDeleted: true })),
  };
}
