import { SystemIds } from '@geoprotocol/geo-sdk/lite';

import type { Relation, Value } from '~/core/types';
import type { EntityDiff } from '~/core/utils/diff/types';

const { BLOCKS } = SystemIds;

/** Maps each entity id in a proposal to the display row that governs it (blocks fold into parents). */
export type OwnershipIndex = {
  readonly ownerOf: ReadonlyMap<string, string>;
  readonly displayIds: ReadonlySet<string>;
};

/** Builds the ownership index. `relations` supplies BLOCKS links stripped during diff folding. */
export function buildOwnershipIndex(
  displayEntities: readonly EntityDiff[],
  relations: readonly Relation[]
): OwnershipIndex {
  const displayIds = new Set(displayEntities.map(entity => entity.entityId));
  const ownerOf = new Map<string, string>();

  for (const id of displayIds) {
    ownerOf.set(id, id);
  }

  // Blocks already folded into the diff.
  for (const entity of displayEntities) {
    for (const block of entity.blocks) {
      if (!displayIds.has(block.id)) ownerOf.set(block.id, entity.entityId);
    }
  }

  // Blocks reachable via BLOCKS relations; fixpoint handles nested blocks seen out of order.
  let settled = false;
  while (!settled) {
    settled = true;
    for (const relation of relations) {
      if (relation.type.id !== BLOCKS) continue;
      const parent = relation.fromEntity.id;
      const child = relation.toEntity.id;
      if (child === parent || displayIds.has(child) || ownerOf.has(child)) continue;

      const owner = ownerOf.get(parent);
      if (owner === undefined) continue;
      ownerOf.set(child, owner);
      settled = false;
    }
  }

  // Relation entities belong to whoever owns the relation.
  for (const relation of relations) {
    if (ownerOf.has(relation.entityId)) continue;
    const owner = ownerOf.get(relation.fromEntity.id);
    if (owner !== undefined) ownerOf.set(relation.entityId, owner);
  }

  return { ownerOf, displayIds };
}

export type PublishSelection = {
  readonly values: Value[];
  readonly relations: Relation[];
  readonly unattributed: { readonly values: Value[]; readonly relations: Relation[] };
};

/** Filters values/relations to only the selected rows. Returns inputs untouched when all selected. */
export function selectOpsForPublish(
  index: OwnershipIndex,
  selectedDisplayIds: ReadonlySet<string>,
  values: readonly Value[],
  relations: readonly Relation[]
): PublishSelection {
  const isEverythingSelected = [...index.displayIds].every(id => selectedDisplayIds.has(id));
  if (isEverythingSelected) {
    return { values: [...values], relations: [...relations], unattributed: { values: [], relations: [] } };
  }

  const keptValues: Value[] = [];
  const keptRelations: Relation[] = [];
  const unattributedValues: Value[] = [];
  const unattributedRelations: Relation[] = [];

  for (const value of values) {
    const owner = index.ownerOf.get(value.entity.id);
    if (owner === undefined) {
      unattributedValues.push(value);
      keptValues.push(value);
    } else if (selectedDisplayIds.has(owner)) {
      keptValues.push(value);
    }
  }

  for (const relation of relations) {
    const owner = index.ownerOf.get(relation.fromEntity.id) ?? index.ownerOf.get(relation.entityId);
    if (owner === undefined) {
      unattributedRelations.push(relation);
      keptRelations.push(relation);
    } else if (selectedDisplayIds.has(owner)) {
      keptRelations.push(relation);
    }
  }

  return {
    values: keptValues,
    relations: keptRelations,
    unattributed: { values: unattributedValues, relations: unattributedRelations },
  };
}

/**
 * Reads ownership the same way, so discarding a page takes the table on it: reverting the page and
 * leaving the block's values behind would strand a block nothing points at.
 */
export function collectOpsForEntities(
  index: OwnershipIndex,
  entityIds: ReadonlySet<string>,
  values: readonly Value[],
  relations: readonly Relation[]
): { values: Value[]; relations: Relation[] } {
  const owns = (ownerId: string | undefined) => ownerId !== undefined && entityIds.has(ownerId);

  return {
    values: values.filter(value => owns(index.ownerOf.get(value.entity.id))),
    relations: relations.filter(
      relation => owns(index.ownerOf.get(relation.fromEntity.id)) || owns(index.ownerOf.get(relation.entityId))
    ),
  };
}

/**
 * Expands a discard set so new display rows aren't left with no remaining inbound links.
 *
 * Only cascades entities this proposal creates, that were pointed at by something already being
 * discarded, and that nothing outside the set still links to.
 */
export function expandDiscardSet(
  index: OwnershipIndex,
  entityIds: ReadonlySet<string>,
  relations: readonly Relation[],
  isNewEntity: (entityId: string) => boolean
): Set<string> {
  const discard = new Set(entityIds);
  let settled = false;

  while (!settled) {
    settled = true;

    for (const displayId of index.displayIds) {
      if (discard.has(displayId) || !isNewEntity(displayId)) continue;

      let linkedFromDiscard = false;
      let linkedFromOutside = false;

      for (const relation of relations) {
        const toOwner = index.ownerOf.get(relation.toEntity.id);
        if (toOwner !== displayId) continue;

        const fromOwner = index.ownerOf.get(relation.fromEntity.id);
        if (fromOwner === undefined || fromOwner === displayId) continue;

        if (discard.has(fromOwner)) linkedFromDiscard = true;
        else linkedFromOutside = true;
      }

      if (!linkedFromDiscard || linkedFromOutside) continue;
      discard.add(displayId);
      settled = false;
    }
  }

  return discard;
}

/** Change count for the row header: each value, relation, and block counts as one. */
export function countEntityChanges(entity: EntityDiff): number {
  return entity.values.length + entity.relations.length + entity.blocks.length;
}

/** All entity ids the dependency checks may ask about — every key of `ownerOf`. */
export function collectCandidateEntityIds(index: OwnershipIndex, relations: readonly Relation[]): Set<string> {
  const ids = new Set(index.ownerOf.keys());
  for (const relation of relations) ids.add(relation.toEntity.id);
  return ids;
}

/**
 * Whether an entity is new (created by this proposal) vs established (already on the graph).
 *
 * Pass the full store read for {@link collectCandidateEntityIds} — **not** the pending-only publish
 * arrays, which would mark everything new and silently block all deselection.
 */
export function buildIsNewEntity(
  allValues: readonly Value[],
  allRelations: readonly Relation[]
): (entityId: string) => boolean {
  const established = new Set<string>();

  const isEstablished = (record: { isLocal?: boolean; hasBeenPublished?: boolean }) =>
    record.isLocal !== true || record.hasBeenPublished === true;

  for (const value of allValues) {
    if (isEstablished(value)) established.add(value.entity.id);
  }

  for (const relation of allRelations) {
    if (!isEstablished(relation)) continue;
    established.add(relation.fromEntity.id);
    established.add(relation.toEntity.id);
    established.add(relation.entityId);
  }

  return entityId => !established.has(entityId);
}

/** Which selected rows cannot be deselected — complement of {@link findDanglingDependencies}. */
export function getDeselectionBlockers(
  index: OwnershipIndex,
  selectedDisplayIds: ReadonlySet<string>,
  relations: readonly Relation[],
  isNewEntity: (entityId: string) => boolean
): ReadonlyMap<string, readonly string[]> {
  const blockedBy = new Map<string, Set<string>>();

  for (const relation of relations) {
    const fromOwner = index.ownerOf.get(relation.fromEntity.id);
    const toOwner = index.ownerOf.get(relation.toEntity.id);
    if (fromOwner === undefined || toOwner === undefined) continue;
    if (fromOwner === toOwner) continue;
    if (!selectedDisplayIds.has(fromOwner) || !selectedDisplayIds.has(toOwner)) continue;
    if (!isNewEntity(relation.toEntity.id)) continue;

    const holders = blockedBy.get(toOwner) ?? new Set<string>();
    holders.add(fromOwner);
    blockedBy.set(toOwner, holders);
  }

  return new Map([...blockedBy.entries()].map(([entityId, holders]) => [entityId, [...holders].sort()]));
}

export type DanglingDependency = {
  /** A deselected row that other selected rows point at. */
  readonly entityId: string;
  /** Selected rows holding a relation to it. */
  readonly requiredBy: readonly string[];
};

/** Finds relations that would point at a new entity excluded from publish. */
export function findDanglingDependencies(
  index: OwnershipIndex,
  selectedDisplayIds: ReadonlySet<string>,
  relations: readonly Relation[],
  isNewEntity: (entityId: string) => boolean
): DanglingDependency[] {
  const requiredBy = new Map<string, Set<string>>();

  for (const relation of relations) {
    const fromOwner = index.ownerOf.get(relation.fromEntity.id);
    if (fromOwner === undefined || !selectedDisplayIds.has(fromOwner)) continue;

    const toOwner = index.ownerOf.get(relation.toEntity.id);
    if (toOwner !== undefined && selectedDisplayIds.has(toOwner)) continue;
    if (toOwner === fromOwner) continue;
    // Already on the graph, so the endpoint resolves however the selection falls.
    if (!isNewEntity(relation.toEntity.id)) continue;

    const target = toOwner ?? relation.toEntity.id;
    const holders = requiredBy.get(target) ?? new Set<string>();
    holders.add(fromOwner);
    requiredBy.set(target, holders);
  }

  return [...requiredBy.entries()].map(([entityId, holders]) => ({
    entityId,
    requiredBy: [...holders].sort(),
  }));
}
