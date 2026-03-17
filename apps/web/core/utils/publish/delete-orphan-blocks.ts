import { Graph, type Op } from '@geoprotocol/geo-sdk';
import { Effect } from 'effect';
import { getBatchEntities, getEntityBacklinks } from '~/core/io/queries';
import type { Relation } from '~/core/types';

async function buildDeleteOpsForEntity(entityId: string, spaceId: string): Promise<Op[]> {
  // Fetch the full entity (all spaces) so we can remove all outgoing relations.
  const entities = await Effect.runPromise(getBatchEntities([entityId]));
  const entity = entities[0];
  if (!entity) return [];

  const values = entity.values ?? [];
  const relations = (entity.relations ?? []).filter(r => r.fromEntity.id === entityId);

  const ops: Op[] = [];

  const uniquePropertyIds = [...new Set(values.map(v => v.property.id))];
  if (uniquePropertyIds.length > 0) {
    const { ops: unsetOps } = Graph.updateEntity({
      id: entityId,
      unset: uniquePropertyIds.map(p => ({ property: p })),
    });
    ops.push(...unsetOps);
  }

  for (const r of relations) {
    const { ops: deleteOps } = Graph.deleteRelation({ id: r.id });
    ops.push(...deleteOps);
  }

  return ops;
}

export async function buildOrphanChildDeleteOps(args: {
  deletedRelations: Relation[];
  allLocalRelations: Relation[];
  spaceId: string;
}): Promise<Op[]> {
  const { deletedRelations, allLocalRelations, spaceId } = args;

  if (deletedRelations.length === 0) return [];

  const ops: Op[] = [];
  const seenEntityIds = new Set<string>();

  for (const rel of deletedRelations) {
    const childId = rel.toEntity.id;
    if (seenEntityIds.has(childId)) continue;
    seenEntityIds.add(childId);

    // Skip if any other non-deleted relation (local) still targets this block.
    const hasLocalBacklink = allLocalRelations.some(r => {
      if (r.toEntity.id !== childId) return false;
      if (r.isDeleted) return false;
      if (r.id === rel.id) return false;
      return true;
    });
    if (hasLocalBacklink) continue;

    // Remote backlinks across all spaces.
    const backlinks = await Effect.runPromise(getEntityBacklinks(childId));
    const externalBacklinks = backlinks.filter(bl => {
      // Ignore backlinks from the same fromEntity we're currently deleting from this space.
      return !(bl.id === rel.fromEntity.id && bl.backlinkSpaceId === spaceId);
    });
    if (externalBacklinks.length > 0) continue;

    const entityOps = await buildDeleteOpsForEntity(childId, spaceId);
    ops.push(...entityOps);
  }

  return ops;
}

