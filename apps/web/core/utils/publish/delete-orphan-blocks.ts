import { Graph, SystemIds, type Op } from '@geoprotocol/geo-sdk';
import { Effect } from 'effect';
import { getBatchEntities, getEntityBacklinks } from '~/core/io/queries';
import type { Relation } from '~/core/types';

async function buildDeleteOpsForBlockEntity(blockId: string, spaceId: string): Promise<Op[]> {
  const entities = await Effect.runPromise(getBatchEntities([blockId], spaceId));
  const entity = entities[0];
  if (!entity) return [];

  const values = (entity.values ?? []).filter(v => v.spaceId === spaceId);
  const relations = (entity.relations ?? []).filter(
    r => r.spaceId === spaceId && r.fromEntity.id === blockId
  );

  const ops: Op[] = [];

  const uniquePropertyIds = [...new Set(values.map(v => v.property.id))];
  if (uniquePropertyIds.length > 0) {
    const { ops: unsetOps } = Graph.updateEntity({
      id: blockId,
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

export async function buildOrphanBlockDeleteOps(args: {
  deletedBlockRelations: Relation[];
  allLocalRelations: Relation[];
  spaceId: string;
}): Promise<Op[]> {
  const { deletedBlockRelations, allLocalRelations, spaceId } = args;

  if (deletedBlockRelations.length === 0) return [];

  const ops: Op[] = [];
  const seenBlockIds = new Set<string>();

  for (const rel of deletedBlockRelations) {
    const blockId = rel.toEntity.id;
    if (seenBlockIds.has(blockId)) continue;
    seenBlockIds.add(blockId);

    // Skip if any other non-deleted relation (local) still targets this block.
    const hasLocalBacklink = allLocalRelations.some(r => {
      if (r.toEntity.id !== blockId) return false;
      if (r.isDeleted) return false;
      if (r.id === rel.id) return false;
      return true;
    });
    if (hasLocalBacklink) continue;

    // Remote backlinks across all spaces.
    const backlinks = await Effect.runPromise(getEntityBacklinks(blockId));
    const externalBacklinks = backlinks.filter(bl => {
      // Ignore the relation from the entity we're already deleting in this space.
      return !(
        bl.id === rel.fromEntity.id &&
        bl.backlinkSpaceId === spaceId &&
        rel.type.id === SystemIds.BLOCKS
      );
    });
    if (externalBacklinks.length > 0) continue;

    const blockOps = await buildDeleteOpsForBlockEntity(blockId, spaceId);
    ops.push(...blockOps);
  }

  return ops;
}

