import { ContentIds, SystemIds } from '@geoprotocol/geo-sdk';
import { diffWords } from 'diff';
import { Effect } from 'effect';

import { getBatchEntities, getEntityBacklinks } from '~/core/io/queries';
import type { ApiEntityDiffShape } from '~/core/io/rest';
import type { Entity, Relation, Value } from '~/core/types';

import type {
  BlockChange,
  DataBlockChange,
  DiffChunk,
  EntityDiff,
  RelationChange,
  SimpleValueChange,
  SimpleValueType,
  TextBlockChange,
  TextValueChange,
  TextValueType,
  ValueChange,
} from './types';

const {
  TEXT_BLOCK,
  IMAGE_BLOCK,
  IMAGE_TYPE,
  DATA_BLOCK,
  VIDEO_TYPE,
  VIDEO_BLOCK,
  BLOCKS,
  TYPES_PROPERTY,
  NAME_PROPERTY,
  MARKDOWN_CONTENT,
  IMAGE_URL_PROPERTY,
  COVER_PROPERTY,
  VIEW_PROPERTY,
  SHOWN_COLUMNS,
  PROPERTIES,
} = SystemIds;

type ApiValueDiff = ApiEntityDiffShape['values'][number];
type ApiRelationDiff = ApiEntityDiffShape['relations'][number];
type ApiBlockDiff = ApiEntityDiffShape['blocks'][number];

export function mapDiffChunks(chunks: readonly { value: string; added?: boolean; removed?: boolean }[]): DiffChunk[] {
  return chunks.map(c => ({
    value: c.value,
    ...(c.added ? { added: true } : {}),
    ...(c.removed ? { removed: true } : {}),
  }));
}

export function mapValueDiff(v: ApiValueDiff): ValueChange {
  if (v.type === 'TEXT' && v.diff) {
    return {
      propertyId: v.propertyId,
      spaceId: v.spaceId,
      type: 'TEXT',
      before: v.before,
      after: v.after,
      diff: mapDiffChunks(v.diff),
    };
  }

  return {
    propertyId: v.propertyId,
    spaceId: v.spaceId,
    type: v.type as SimpleValueType,
    before: v.before,
    after: v.after,
  };
}

export function mapRelationDiff(r: ApiRelationDiff): RelationChange {
  return {
    relationId: r.relationId,
    typeId: r.typeId,
    spaceId: r.spaceId,
    changeType: r.changeType,
    before: r.before
      ? {
          toEntityId: r.before.toEntityId,
          toSpaceId: r.before.toSpaceId,
          position: r.before.position,
        }
      : null,
    after: r.after
      ? {
          toEntityId: r.after.toEntityId,
          toSpaceId: r.after.toSpaceId,
          position: r.after.position,
        }
      : null,
  };
}

export function mapBlockDiff(b: ApiBlockDiff): BlockChange {
  if (b.type === 'textBlock') {
    return {
      id: b.id,
      type: 'textBlock',
      before: b.before,
      after: b.after,
      diff: b.diff ? mapDiffChunks(b.diff) : [],
    };
  }

  return {
    id: b.id,
    type: b.type,
    before: b.before,
    after: b.after,
  };
}

export function mapApiEntityDiff(apiEntity: ApiEntityDiffShape): EntityDiff {
  return {
    entityId: apiEntity.entityId,
    name: apiEntity.name,
    values: apiEntity.values.map(mapValueDiff),
    relations: apiEntity.relations.map(mapRelationDiff),
    blocks: apiEntity.blocks.map(mapBlockDiff),
  };
}

export const BLOCK_TYPE_IDS: string[] = [TEXT_BLOCK, IMAGE_BLOCK, IMAGE_TYPE, DATA_BLOCK, VIDEO_TYPE, VIDEO_BLOCK];
const BLOCK_TYPE_SET = new Set(BLOCK_TYPE_IDS);

const BLOCK_CONFIG_RELATION_IDS: Set<string> = new Set([VIEW_PROPERTY, SHOWN_COLUMNS, PROPERTIES]);

export function computeTextDiff(before: string, after: string): DiffChunk[] {
  if (before === '' && after !== '') return [{ value: after, added: true }];
  if (after === '' && before !== '') return [{ value: before, removed: true }];
  if (before === '' && after === '') return [];

  return mapDiffChunks(diffWords(before, after));
}

export function groupBlocksUnderParents(entities: EntityDiff[]): EntityDiff[] {
  const entityMap = new Map(entities.map(e => [e.entityId, e]));

  const blockToParent = new Map<string, string>();
  for (const entity of entities) {
    for (const rel of entity.relations) {
      if (rel.typeId === BLOCKS && rel.after) {
        blockToParent.set(rel.after.toEntityId, entity.entityId);
      }
      if (rel.typeId === BLOCKS && rel.before && !rel.after) {
        blockToParent.set(rel.before.toEntityId, entity.entityId);
      }
    }
  }

  const blockEntityIds = new Set(blockToParent.keys());

  if (blockEntityIds.size === 0) return entities;

  const parentBlocks = new Map<string, BlockChange[]>();

  for (const [blockId, parentId] of blockToParent) {
    const blockEntity = entityMap.get(blockId);
    if (!blockEntity) continue;

    const blockChange = entityDiffToBlockChange(blockEntity);
    if (!blockChange) continue;

    const existing = parentBlocks.get(parentId) ?? [];
    existing.push(blockChange);
    parentBlocks.set(parentId, existing);
  }

  return entities
    .filter(e => !blockEntityIds.has(e.entityId))
    .map(e => {
      const blocks = parentBlocks.get(e.entityId);
      const filteredRelations = e.relations.filter(r => r.typeId !== BLOCKS);

      if (blocks || filteredRelations.length !== e.relations.length) {
        const synthBlockMap = new Map((blocks ?? []).map(b => [b.id, b]));
        // Prefer synthesized blocks with actual content over null-content API pre-computed
        // blocks. The per-entity diff endpoint may return imageBlocks with null before/after
        // (URL not serialized), while step 7's synthesized block correctly carries the URL.
        const mergedBlocks = e.blocks.map(eb => {
          if (eb.before === null && eb.after === null) {
            const synth = synthBlockMap.get(eb.id);
            if (synth !== undefined && (synth.before !== null || synth.after !== null)) return synth;
          }
          return eb;
        });
        const existingBlockIds = new Set(e.blocks.map(b => b.id));
        const newBlocks = (blocks ?? []).filter(b => !existingBlockIds.has(b.id));
        return {
          ...e,
          relations: filteredRelations,
          blocks: [...mergedBlocks, ...newBlocks],
        };
      }
      return e;
    });
}

export async function postProcessDiffs(
  entities: EntityDiff[],
  spaceId: string,
  configToParentMap?: Map<string, { parentId: string; dataBlockEntityId: string }>
): Promise<EntityDiff[]> {
  // 1. Classify entities
  // Maps block entity ID → 'ADD' (block was added/exists in new state) or 'REMOVE' (block was removed).
  // This is used in step 7 to synthesize diffs in the correct direction for the history path.
  const blocksWithParent = new Map<string, 'ADD' | 'REMOVE'>();
  const blockTypeEntities: string[] = [];
  const blockRelEntities: string[] = [];
  const idsToResolve = new Set<string>();
  const entityMap = new Map<string, EntityDiff>();

  for (const entity of entities) {
    entityMap.set(entity.entityId, entity);

    if (!entity.name) idsToResolve.add(entity.entityId);
    for (const v of entity.values) {
      if (!v.propertyName) idsToResolve.add(v.propertyId);
    }

    let isBlock = false;
    let hasBlockConfig = false;
    for (const rel of entity.relations) {
      if (rel.typeId === BLOCKS) {
        // If the block exists in the new state (ADD or UPDATE), track as ADD.
        // If only a REMOVE (no after), track as REMOVE.
        if (rel.after?.toEntityId) blocksWithParent.set(rel.after.toEntityId, 'ADD');
        if (rel.before?.toEntityId && !rel.after?.toEntityId) blocksWithParent.set(rel.before.toEntityId, 'REMOVE');
      }
      if (rel.typeId === TYPES_PROPERTY) {
        const typeId = rel.after?.toEntityId ?? rel.before?.toEntityId;
        if (typeId && BLOCK_TYPE_SET.has(typeId)) isBlock = true;
      }
      if (BLOCK_CONFIG_RELATION_IDS.has(rel.typeId)) hasBlockConfig = true;
      if (!rel.typeName) idsToResolve.add(rel.typeId);
      if (rel.before && !rel.before.toEntityName) idsToResolve.add(rel.before.toEntityId);
      if (rel.after && !rel.after.toEntityName) idsToResolve.add(rel.after.toEntityId);
    }

    if (isBlock) blockTypeEntities.push(entity.entityId);
    if (hasBlockConfig && !isBlock) blockRelEntities.push(entity.entityId);
  }

  // Identify media-property entities: block-typed entities (e.g. IMAGE_TYPE, VIDEO_TYPE)
  // that are targeted by non-BLOCKS relations from other entities in this diff set, and
  // are NOT referenced via any BLOCKS relation.  These are media-property content entities
  // (created when a user sets an image/video-type property value), NOT actual page blocks.
  // Treating them as orphan blocks causes a duplicate block to appear in the UI.
  const blockTypeEntitySet = new Set(blockTypeEntities);
  const mediaPropertyEntityIds = new Set<string>();
  for (const entity of entities) {
    for (const rel of entity.relations) {
      if (rel.typeId === BLOCKS) continue;
      const targetId = rel.after?.toEntityId ?? rel.before?.toEntityId;
      if (targetId && blockTypeEntitySet.has(targetId) && !blocksWithParent.has(targetId)) {
        mediaPropertyEntityIds.add(targetId);
      }
    }
  }

  // Collect media URLs per entity and inject into parent relations for ImagePropertyCell/VideoPropertyCell rendering.
  const mediaPropertyEntityUrls = new Map<
    string,
    { before: string | null; after: string | null; mediaType: 'image' | 'video' }
  >();
  for (const entityId of mediaPropertyEntityIds) {
    const entity = entityMap.get(entityId);
    if (!entity) continue;
    // Prefer IMAGE_URL_PROPERTY — image entities also carry width/height values.
    const mediaValue =
      entity.values.find(v => v.propertyId === IMAGE_URL_PROPERTY && (v.after || v.before)) ??
      entity.values.find(
        v => (v.after && v.after.startsWith('ipfs://')) || (v.before && v.before.startsWith('ipfs://'))
      );
    if (mediaValue) {
      let mediaType: 'image' | 'video' = 'image';
      for (const rel of entity.relations) {
        if (rel.typeId === TYPES_PROPERTY) {
          const typeId = rel.after?.toEntityId ?? rel.before?.toEntityId;
          if (typeId === VIDEO_TYPE || typeId === VIDEO_BLOCK) {
            mediaType = 'video';
          }
        }
      }
      mediaPropertyEntityUrls.set(entityId, { before: mediaValue.before, after: mediaValue.after, mediaType });
    }
  }

  const orphanSet = new Set(
    blockTypeEntities.filter(id => !blocksWithParent.has(id) && !mediaPropertyEntityIds.has(id))
  );

  // 2. Resolve orphan block parents via backlinks
  const blockToParent = new Map<string, string>();

  if (orphanSet.size > 0) {
    const unresolvedOrphans: string[] = [];

    await Promise.all(
      [...orphanSet].map(async blockId => {
        try {
          const backlinks = await Effect.runPromise(getEntityBacklinks(blockId, spaceId));
          if (backlinks.length > 0) {
            blockToParent.set(blockId, backlinks[0].id);
          } else {
            unresolvedOrphans.push(blockId);
          }
        } catch {
          unresolvedOrphans.push(blockId);
        }
      })
    );

    if (unresolvedOrphans.length > 0) {
      let fallbackParentId: string | undefined;

      // First, check if any sibling orphan was already resolved to a parent via backlinks.
      // If so, unresolved orphans likely belong to the same parent (e.g. newly created blocks
      // on the same page won't have backlinks yet since they're not in the committed graph).
      if (blockToParent.size > 0) {
        fallbackParentId = blockToParent.values().next().value!;
      }

      // Otherwise, fall back to scanning the entity list for a non-block entity.
      if (!fallbackParentId) {
        for (const entity of entities) {
          // Skip orphan blocks, entities already referenced via BLOCKS, and image-property
          // entities (which are filtered from processed and must not become synthetic parents).
          if (
            orphanSet.has(entity.entityId) ||
            blocksWithParent.has(entity.entityId) ||
            mediaPropertyEntityIds.has(entity.entityId)
          )
            continue;
          if (!fallbackParentId) fallbackParentId = entity.entityId;
          if (entity.relations.some(r => r.typeId === BLOCKS)) {
            fallbackParentId = entity.entityId;
            break;
          }
        }
      }

      if (fallbackParentId) {
        for (const blockId of unresolvedOrphans) {
          blockToParent.set(blockId, fallbackParentId);
        }
      }
    }

    for (const parentId of blockToParent.values()) {
      if (!entityMap.has(parentId)) idsToResolve.add(parentId);
    }
  }

  // 3. Resolve block relation entity parents via backlinks (with configToParentMap fallback)
  const blockRelToParent = new Map<string, string>();

  if (blockRelEntities.length > 0) {
    await Promise.all(
      blockRelEntities.map(async blockRelEntityId => {
        // First try the configToParentMap (local store data, no network request)
        const localMapping = configToParentMap?.get(blockRelEntityId);
        if (localMapping) {
          blockRelToParent.set(blockRelEntityId, localMapping.parentId);
          idsToResolve.add(localMapping.parentId);
          return;
        }

        // Fall back to backlinks query
        try {
          const backlinks = await Effect.runPromise(getEntityBacklinks(blockRelEntityId, spaceId));
          if (backlinks.length > 0) {
            blockRelToParent.set(blockRelEntityId, backlinks[0].id);
            idsToResolve.add(backlinks[0].id);
          }
        } catch {
          // Block relation entity stays as-is in the diff
        }
      })
    );
  }

  // 4. Batch-fetch names and entity data
  const nameMap = new Map<string, string | null>();
  const fetchedEntityMap = new Map<string, Entity>();
  if (idsToResolve.size > 0) {
    try {
      const fetched = await Effect.runPromise(getBatchEntities([...idsToResolve]));
      for (const e of fetched) {
        nameMap.set(e.id, e.name);
        fetchedEntityMap.set(e.id, e);
      }
    } catch (error) {
      console.error('[postProcessDiffs] Failed to fetch entity names:', error);
    }
  }

  // 5. Merge block relation entity config into data block entities
  const mergedBlockRelEntityIds = new Set<string>();

  if (blockRelToParent.size > 0) {
    for (const [blockRelEntityId, parentId] of blockRelToParent) {
      const blockRelDiff = entityMap.get(blockRelEntityId);
      if (!blockRelDiff) continue;

      // Find the data block entity ID via the parent's BLOCKS relation or configToParentMap
      let dataBlockEntityId: string | undefined;

      const parentEntity = fetchedEntityMap.get(parentId);
      if (parentEntity) {
        const blocksRel = parentEntity.relations.find(r => r.type.id === BLOCKS && r.entityId === blockRelEntityId);
        if (blocksRel) {
          dataBlockEntityId = blocksRel.toEntity.id;
        }
      }

      // Fall back to configToParentMap if the fetched parent doesn't have the BLOCKS relation
      if (!dataBlockEntityId) {
        dataBlockEntityId = configToParentMap?.get(blockRelEntityId)?.dataBlockEntityId;
      }

      if (!dataBlockEntityId) continue;

      const configRelations = blockRelDiff.relations.filter(r => BLOCK_CONFIG_RELATION_IDS.has(r.typeId));
      const configValues = blockRelDiff.values.filter(
        v => v.propertyId !== NAME_PROPERTY && v.propertyId !== MARKDOWN_CONTENT
      );
      if (configRelations.length === 0 && configValues.length === 0) continue;

      const existingDataBlockDiff = entityMap.get(dataBlockEntityId);

      if (existingDataBlockDiff) {
        existingDataBlockDiff.relations.push(...configRelations);
        existingDataBlockDiff.values.push(...configValues);
      } else {
        const blocksRel = parentEntity?.relations.find(r => r.type.id === BLOCKS && r.entityId === blockRelEntityId);
        const dataBlockName = nameMap.get(dataBlockEntityId) ?? blocksRel?.toEntity.name ?? null;
        const newDataBlockDiff: EntityDiff = {
          entityId: dataBlockEntityId,
          name: dataBlockName,
          values: [...configValues],
          relations: [
            {
              relationId: `synthetic-type-${dataBlockEntityId}`,
              typeId: TYPES_PROPERTY,
              spaceId,
              changeType: 'ADD',
              before: null,
              after: { toEntityId: DATA_BLOCK, toSpaceId: null, position: null },
            },
            ...configRelations,
          ],
          blocks: [],
        };
        entities.push(newDataBlockDiff);
        entityMap.set(dataBlockEntityId, newDataBlockDiff);

        blockToParent.set(dataBlockEntityId, parentId);
      }

      mergedBlockRelEntityIds.add(blockRelEntityId);
    }
  }

  // 6. Inject orphan BLOCKS relations
  // Also filter out media-property entities and inject their URLs into their
  // parent entity's relations, so ChangedEntity can render them as ImagePropertyCell
  // or VideoPropertyCell (the same behaviour fromLocal provides via entity URLs).
  //
  // Two sources for the media URL:
  //   a) mediaPropertyEntityUrls — entity was in the input diff array (proposal path)
  //   b) fetchedEntityMap        — entity was fetched in step 4 for name resolution
  //      (history/single-entity path where the media property entity is a foreign entity
  //       not included in the input, but already fetched to resolve its name)
  type MediaUrlResult = { url: string; mediaType: 'image' | 'video' } | null;

  const resolveMediaUrl = (targetId: string, side: 'after' | 'before'): MediaUrlResult => {
    // (a) entity was in the input diff — use the before/after from its diff values
    const fromDiff = mediaPropertyEntityUrls.get(targetId);
    if (fromDiff) {
      const url = side === 'after' ? fromDiff.after : fromDiff.before;
      if (url) return { url, mediaType: fromDiff.mediaType };
      return null;
    }

    // (b) entity was fetched in step 4 — use resolveImageUrlFromEntity (IPFS-URL aware).
    //     Applied to both sides: for 'after', fetchedEntityMap reliably reflects current
    //     state. For 'before', this handles the common case where the image entity is not
    //     included in the proposal diff (only the parent's REMOVE relation was changed,
    //     not the image entity itself). In the proposal path, 'before' = current state so
    //     fetchedEntityMap is exact. In the history path it is best-effort — correct when
    //     the image entity's URL hasn't changed since the historical point.
    const fetched = fetchedEntityMap.get(targetId);
    if (fetched && !blocksWithParent.has(targetId)) {
      const isImage = fetched.types.some(t => t.id === IMAGE_TYPE || t.id === IMAGE_BLOCK);
      const isVideo = fetched.types.some(t => t.id === VIDEO_TYPE || t.id === VIDEO_BLOCK);
      if (isImage || isVideo) {
        const url = resolveImageUrlFromEntity(fetched);
        if (url) return { url, mediaType: isVideo ? 'video' : 'image' };
      }
    }

    return null;
  };

  let processed: EntityDiff[] = entities
    .filter(e => !mergedBlockRelEntityIds.has(e.entityId) && !mediaPropertyEntityIds.has(e.entityId))
    .map(e => {
      const updatedRelations = e.relations.map(r => {
        const afterMedia = r.after ? resolveMediaUrl(r.after.toEntityId, 'after') : null;
        const beforeMedia = r.before ? resolveMediaUrl(r.before.toEntityId, 'before') : null;
        if (!afterMedia && !beforeMedia) return r;
        return {
          ...r,
          ...(r.after && afterMedia
            ? {
                after: {
                  ...r.after,
                  ...(afterMedia.mediaType === 'image' ? { imageUrl: afterMedia.url } : { videoUrl: afterMedia.url }),
                },
              }
            : {}),
          ...(r.before && beforeMedia
            ? {
                before: {
                  ...r.before,
                  ...(beforeMedia.mediaType === 'image'
                    ? { imageUrl: beforeMedia.url }
                    : { videoUrl: beforeMedia.url }),
                },
              }
            : {}),
        };
      });
      if (updatedRelations.every((r, i) => r === e.relations[i])) return e;
      return { ...e, relations: updatedRelations };
    });

  if (blockToParent.size > 0) {
    const result = processed.map(e => ({ ...e, relations: [...e.relations] }));
    const resultMap = new Map(result.map(e => [e.entityId, e]));

    for (const [blockId, parentId] of blockToParent) {
      let parentDiff = resultMap.get(parentId);
      if (!parentDiff) {
        parentDiff = {
          entityId: parentId,
          name: nameMap.get(parentId) ?? null,
          values: [],
          relations: [],
          blocks: [],
        };
        result.push(parentDiff);
        resultMap.set(parentId, parentDiff);
      }
      parentDiff.relations.push({
        relationId: `resolved-blocks-${blockId}`,
        typeId: BLOCKS,
        spaceId,
        changeType: 'ADD',
        before: null,
        after: { toEntityId: blockId, toSpaceId: null, position: null },
      });
    }
    processed = result;
  }

  // 7. Synthesize diffs for missing block entities
  // blockChangeType is 'ADD' when the block was added/exists in the new state,
  // 'REMOVE' when it was present before and is now gone.
  const processedIds = new Set(processed.map(e => e.entityId));
  for (const [blockId, blockChangeType] of blocksWithParent) {
    if (processedIds.has(blockId)) continue;

    const remoteBlock = fetchedEntityMap.get(blockId);
    if (!remoteBlock) continue;

    const blockType = remoteBlock.types.find(t => BLOCK_TYPE_SET.has(t.id));
    if (!blockType) continue;

    const values: ValueChange[] = [];
    for (const rv of remoteBlock.values) {
      if (rv.property.id === NAME_PROPERTY) continue;
      const dataType = rv.property.dataType;
      // For ADD: block was created in this edit → before=null, after=value.
      // For REMOVE: block existed before and was removed → before=value, after=null.
      const before = blockChangeType === 'REMOVE' ? rv.value : null;
      const after = blockChangeType === 'ADD' ? rv.value : null;
      if (dataType === 'TEXT') {
        values.push({
          propertyId: rv.property.id,
          propertyName: rv.property.name ?? null,
          spaceId,
          type: 'TEXT' as TextValueType,
          before,
          after,
          diff: computeTextDiff(before ?? '', after ?? ''),
        } as TextValueChange);
      } else {
        values.push({
          propertyId: rv.property.id,
          propertyName: rv.property.name ?? null,
          spaceId,
          type: dataType as SimpleValueType,
          before,
          after,
        } as SimpleValueChange);
      }
    }

    const syntheticDiff: EntityDiff = {
      entityId: blockId,
      name: remoteBlock.name,
      values,
      relations: [
        {
          relationId: `synthetic-type-${blockId}`,
          typeId: TYPES_PROPERTY,
          spaceId,
          changeType: blockChangeType,
          before: blockChangeType === 'REMOVE' ? { toEntityId: blockType.id, toSpaceId: null, position: null } : null,
          after: blockChangeType === 'ADD' ? { toEntityId: blockType.id, toSpaceId: null, position: null } : null,
        },
      ],
      blocks: [],
    };

    processed.push(syntheticDiff);
  }

  // 8. Group blocks under parents
  const grouped = groupBlocksUnderParents(processed);

  // 9. Apply resolved names
  const resolveValue = (v: ValueChange): ValueChange => ({
    ...v,
    propertyName: v.propertyName ?? nameMap.get(v.propertyId) ?? null,
  });

  const resolveRelation = (r: RelationChange): RelationChange => ({
    ...r,
    typeName: r.typeName ?? nameMap.get(r.typeId) ?? null,
    before: r.before
      ? { ...r.before, toEntityName: r.before.toEntityName ?? nameMap.get(r.before.toEntityId) ?? null }
      : r.before,
    after: r.after
      ? { ...r.after, toEntityName: r.after.toEntityName ?? nameMap.get(r.after.toEntityId) ?? null }
      : r.after,
  });

  if (nameMap.size === 0) return grouped;

  return grouped.map(entity => ({
    ...entity,
    name: entity.name ?? nameMap.get(entity.entityId) ?? null,
    values: entity.values.map(resolveValue),
    relations: entity.relations.map(resolveRelation),
    blocks: entity.blocks.map(block => {
      if (block.type !== 'dataBlock') return block;
      const db = block as DataBlockChange;
      return {
        ...db,
        ...(db.values ? { values: db.values.map(resolveValue) } : {}),
        ...(db.relations ? { relations: db.relations.map(resolveRelation) } : {}),
      };
    }),
  }));
}

export function entityDiffToBlockChange(entity: EntityDiff): BlockChange | null {
  const blockType = detectBlockType(entity);

  if (blockType === 'dataBlock') {
    const nameValue = entity.values.find(v => v.propertyId === NAME_PROPERTY);

    const values = entity.values.filter(v => v.propertyId !== NAME_PROPERTY && v.propertyId !== MARKDOWN_CONTENT);
    const relations = entity.relations.filter(r => r.typeId !== TYPES_PROPERTY && r.typeId !== BLOCKS);

    return {
      id: entity.entityId,
      type: 'dataBlock',
      before: nameValue?.before ?? null,
      after: nameValue?.after ?? null,
      blockName: entity.name,
      values: values.length > 0 ? values : undefined,
      relations: relations.length > 0 ? relations : undefined,
    } as DataBlockChange;
  }

  if (blockType === 'imageBlock') {
    const contentValue = entity.values.find(v => v.propertyId === IMAGE_URL_PROPERTY) ?? entity.values[0];

    return {
      id: entity.entityId,
      type: 'imageBlock',
      before: contentValue?.before ?? null,
      after: contentValue?.after ?? null,
    };
  }

  if (blockType === 'videoBlock') {
    const contentValue = entity.values.find(v => v.propertyId === IMAGE_URL_PROPERTY) ?? entity.values[0];

    return {
      id: entity.entityId,
      type: 'videoBlock',
      before: contentValue?.before ?? null,
      after: contentValue?.after ?? null,
    };
  }

  const contentValue =
    entity.values.find(v => v.propertyId === MARKDOWN_CONTENT) ?? entity.values.find(v => v.type === 'TEXT');
  const before = contentValue?.before ?? null;
  const after = contentValue?.after ?? null;
  const diff = computeTextDiff(before ?? '', after ?? '');

  return {
    id: entity.entityId,
    type: 'textBlock',
    before,
    after,
    diff,
  } as TextBlockChange;
}

export function detectBlockType(entity: EntityDiff): 'textBlock' | 'imageBlock' | 'videoBlock' | 'dataBlock' {
  for (const rel of entity.relations) {
    if (rel.typeId === TYPES_PROPERTY) {
      const typeId = rel.after?.toEntityId ?? rel.before?.toEntityId;
      if (typeId === TEXT_BLOCK) return 'textBlock';
      if (typeId === IMAGE_BLOCK || typeId === IMAGE_TYPE) return 'imageBlock';
      if (typeId === VIDEO_TYPE || typeId === VIDEO_BLOCK) return 'videoBlock';
      if (typeId === DATA_BLOCK) return 'dataBlock';
    }
  }
  return 'textBlock';
}

export async function fromLocal(
  spaceId: string,
  localValues: Value[],
  localRelations: Relation[],
  allRelations?: Relation[]
): Promise<EntityDiff[]> {
  const allChangedEntityIds = new Set<string>();
  for (const value of localValues) {
    allChangedEntityIds.add(value.entity.id);
  }
  for (const relation of localRelations) {
    allChangedEntityIds.add(relation.fromEntity.id);
  }

  const mediaTargetEntityIds = new Set<string>();
  for (const relation of localRelations) {
    if (isMediaRelationType(relation.type.id)) {
      mediaTargetEntityIds.add(relation.toEntity.id);
    }
  }

  // Detect block entity IDs (both active and deleted) BEFORE the fetch so we can
  // include media property entities in the fetch set (they may have no local changes
  // when only the parent relation is deleted, but we still need their remote URL).
  // We must include deleted BLOCKS relations here because the BLOCKS relation carries
  // renderableType 'IMAGE'/'VIDEO', and without this guard, deleted block entities
  // would be misclassified as media-property entities and filtered out of the diff.
  const actualBlockEntityIds = new Set<string>();
  for (const relation of localRelations) {
    if (relation.type.id === BLOCKS) {
      actualBlockEntityIds.add(relation.toEntity.id);
    }
  }
  if (allRelations) {
    for (const rel of allRelations) {
      if (rel.type.id === BLOCKS) {
        actualBlockEntityIds.add(rel.toEntity.id);
      }
    }
  }

  // Collect image/video content entity IDs (separate entities referenced by IMAGE/VIDEO relations).
  // Exclude actual block entities — those are referenced via BLOCKS relations
  // and should remain as imageBlock/videoBlock diffs. Property entities also have IMAGE_TYPE
  // or VIDEO_TYPE but are NOT blocks.
  const imageEntityIds = new Set<string>();
  const videoEntityIds = new Set<string>();
  for (const relation of localRelations) {
    if (relation.renderableType === 'IMAGE' && !actualBlockEntityIds.has(relation.toEntity.id)) {
      imageEntityIds.add(relation.toEntity.id);
    }
    if (relation.renderableType === 'VIDEO' && !actualBlockEntityIds.has(relation.toEntity.id)) {
      videoEntityIds.add(relation.toEntity.id);
    }
  }

  const remoteEntities = new Map<string, Entity>();
  const idsToFetch = new Set([...allChangedEntityIds, ...mediaTargetEntityIds, ...imageEntityIds, ...videoEntityIds]);

  if (idsToFetch.size > 0) {
    try {
      const entities = await Effect.runPromise(getBatchEntities(Array.from(idsToFetch), spaceId));
      for (const entity of entities) {
        remoteEntities.set(entity.id, entity);
      }
    } catch (error) {
      console.error('Failed to fetch remote entities:', error);
    }
  }

  const imageEntityIdsToFetch = new Set<string>();
  for (const entity of remoteEntities.values()) {
    for (const relation of entity.relations) {
      if (isMediaRelationType(relation.type.id) && !remoteEntities.has(relation.toEntity.id)) {
        imageEntityIdsToFetch.add(relation.toEntity.id);
      }
    }
  }
  if (imageEntityIdsToFetch.size > 0) {
    try {
      const imageEntities = await Effect.runPromise(getBatchEntities(Array.from(imageEntityIdsToFetch), spaceId));
      for (const entity of imageEntities) {
        remoteEntities.set(entity.id, entity);
      }
    } catch (error) {
      console.error('Failed to fetch image entities:', error);
    }
  }

  const diffs: EntityDiff[] = [];
  for (const entityId of allChangedEntityIds) {
    const entityValues = localValues.filter(v => v.entity.id === entityId);
    const entityRelations = localRelations.filter(r => r.fromEntity.id === entityId);

    const diff = buildEntityDiff(entityId, spaceId, entityValues, entityRelations, remoteEntities);
    if (diff) {
      diffs.push(diff);
    }
  }

  // Resolve media URLs, tracking before/after separately so cover replacements show the correct image on each side.
  type MediaSides = { before: string | null; after: string | null };
  const imageEntityUrls = new Map<string, MediaSides>();
  const videoEntityUrls = new Map<string, MediaSides>();
  for (const diff of diffs) {
    const resolveMediaValue = () =>
      diff.values.find(v => v.propertyId === IMAGE_URL_PROPERTY && (v.after || v.before)) ??
      diff.values.find(v => (v.after && v.after.startsWith('ipfs://')) || (v.before && v.before.startsWith('ipfs://')));
    if (imageEntityIds.has(diff.entityId)) {
      const ipfsValue = resolveMediaValue();
      if (ipfsValue)
        imageEntityUrls.set(diff.entityId, { before: ipfsValue.before ?? null, after: ipfsValue.after ?? null });
    }
    if (videoEntityIds.has(diff.entityId)) {
      const ipfsValue = resolveMediaValue();
      if (ipfsValue)
        videoEntityUrls.set(diff.entityId, { before: ipfsValue.before ?? null, after: ipfsValue.after ?? null });
    }
  }
  // Fall back to remote entity for media entities with no local changes.
  for (const entityId of imageEntityIds) {
    if (!imageEntityUrls.has(entityId)) {
      const url = resolveImageUrlFromEntity(remoteEntities.get(entityId));
      if (url) imageEntityUrls.set(entityId, { before: url, after: url });
    }
  }
  for (const entityId of videoEntityIds) {
    if (!videoEntityUrls.has(entityId)) {
      const url = resolveImageUrlFromEntity(remoteEntities.get(entityId));
      if (url) videoEntityUrls.set(entityId, { before: url, after: url });
    }
  }

  const mediaPropertyEntityIds = new Set([...imageEntityIds, ...videoEntityIds]);

  const filteredDiffs = diffs
    .filter(d => !mediaPropertyEntityIds.has(d.entityId))
    .map(d => ({
      ...d,
      relations: d.relations.map(r => {
        const afterImageUrl = r.after ? (imageEntityUrls.get(r.after.toEntityId)?.after ?? null) : null;
        const beforeImageUrl = r.before ? (imageEntityUrls.get(r.before.toEntityId)?.before ?? null) : null;
        const afterVideoUrl = r.after ? (videoEntityUrls.get(r.after.toEntityId)?.after ?? null) : null;
        const beforeVideoUrl = r.before ? (videoEntityUrls.get(r.before.toEntityId)?.before ?? null) : null;

        if (!afterImageUrl && !beforeImageUrl && !afterVideoUrl && !beforeVideoUrl) return r;

        return {
          ...r,
          ...(r.after && afterImageUrl ? { after: { ...r.after, imageUrl: afterImageUrl } } : {}),
          ...(r.before && beforeImageUrl ? { before: { ...r.before, imageUrl: beforeImageUrl } } : {}),
          ...(r.after && afterVideoUrl ? { after: { ...r.after, videoUrl: afterVideoUrl } } : {}),
          ...(r.before && beforeVideoUrl ? { before: { ...r.before, videoUrl: beforeVideoUrl } } : {}),
        };
      }),
    }));

  for (const diff of filteredDiffs) {
    if (diff.relations.some(r => r.typeId === TYPES_PROPERTY)) continue;

    const remoteEntity = remoteEntities.get(diff.entityId);
    if (!remoteEntity) continue;

    const blockType = remoteEntity.types.find(t => BLOCK_TYPE_SET.has(t.id));
    if (blockType) {
      diff.relations.push({
        relationId: `remote-type-${diff.entityId}`,
        typeId: TYPES_PROPERTY,
        spaceId,
        changeType: 'ADD',
        before: null,
        after: { toEntityId: blockType.id, toSpaceId: null, position: null },
      });
    }
  }

  // Build a mapping from config entity IDs to parent entity IDs using BLOCKS relations.
  // When a parent has a BLOCKS relation, rel.entityId is the config entity,
  // rel.fromEntity.id is the parent, and rel.toEntity.id is the data block.
  const configToParentMap = new Map<string, { parentId: string; dataBlockEntityId: string }>();
  if (allRelations) {
    for (const rel of allRelations) {
      if (rel.type.id === BLOCKS) {
        configToParentMap.set(rel.entityId, {
          parentId: rel.fromEntity.id,
          dataBlockEntityId: rel.toEntity.id,
        });
      }
    }
  }

  if (process.env.NODE_ENV === 'development') {
    console.log('[diff:local] before postProcessDiffs ' + JSON.stringify(filteredDiffs));
  }
  const result = await postProcessDiffs(filteredDiffs, spaceId, configToParentMap);
  if (process.env.NODE_ENV === 'development') {
    console.log('[diff:local] after postProcessDiffs ' + JSON.stringify(result));
  }
  return result;
}

function buildEntityDiff(
  entityId: string,
  spaceId: string,
  entityValues: Value[],
  entityRelations: Relation[],
  remoteEntities: Map<string, Entity>
): EntityDiff | null {
  const remoteEntity = remoteEntities.get(entityId);

  if (entityValues.length === 0 && entityRelations.length === 0) {
    return null;
  }

  const valueChanges = computeValueChanges(entityValues, remoteEntity, spaceId);
  const relationChanges = computeRelationChanges(entityRelations, remoteEntity, remoteEntities);

  if (valueChanges.length === 0 && relationChanges.length === 0) {
    return null;
  }

  const nameValue = entityValues.find(v => v.property.id === NAME_PROPERTY);
  const entityName = nameValue?.value ?? remoteEntity?.name ?? null;

  return {
    entityId,
    name: entityName,
    values: valueChanges,
    relations: relationChanges,
    blocks: [],
  };
}

function computeValueChanges(localValues: Value[], remoteEntity: Entity | undefined, spaceId: string): ValueChange[] {
  const changes: ValueChange[] = [];

  for (const localValue of localValues) {
    const remoteValue = remoteEntity?.values.find(
      v => v.property.id === localValue.property.id && v.spaceId === spaceId
    );

    const beforeValue = remoteValue?.value ?? null;
    const afterValue = localValue.isDeleted ? null : localValue.value;

    if (beforeValue === afterValue) continue;

    const dataType = localValue.property.dataType;
    const propertyName = localValue.property.name ?? null;

    if (dataType === 'TEXT') {
      const diff = computeTextDiff(beforeValue ?? '', afterValue ?? '');
      changes.push({
        propertyId: localValue.property.id,
        propertyName,
        spaceId: localValue.spaceId,
        type: 'TEXT' as TextValueType,
        before: beforeValue,
        after: afterValue,
        diff,
      } as TextValueChange);
    } else {
      changes.push({
        propertyId: localValue.property.id,
        propertyName,
        spaceId: localValue.spaceId,
        type: dataType as SimpleValueType,
        before: beforeValue,
        after: afterValue,
      } as SimpleValueChange);
    }
  }

  return changes;
}

function isMediaRelationType(typeId: string): boolean {
  return typeId === ContentIds.AVATAR_PROPERTY || typeId === COVER_PROPERTY;
}

function resolveImageUrlFromEntity(entity: Entity | undefined): string | null {
  if (!entity) return null;
  const imageValue = entity.values.find(v => typeof v.value === 'string' && v.value.startsWith('ipfs://'));

  return imageValue?.value ?? null;
}

function computeRelationChanges(
  localRelations: Relation[],
  remoteEntity: Entity | undefined,
  remoteEntities: Map<string, Entity>
): RelationChange[] {
  const relationChanges: RelationChange[] = [];

  for (const localRelation of localRelations) {
    const remoteRelation = remoteEntity?.relations.find(r => r.id === localRelation.id);

    let changeType: 'ADD' | 'REMOVE' | 'UPDATE';
    if (localRelation.isDeleted) {
      changeType = 'REMOVE';
    } else if (!remoteRelation) {
      changeType = 'ADD';
    } else {
      changeType = 'UPDATE';
    }

    if (
      changeType === 'UPDATE' &&
      remoteRelation?.toEntity.id === localRelation.toEntity.id &&
      remoteRelation?.position === localRelation.position
    ) {
      continue;
    }

    const isMedia = isMediaRelationType(localRelation.type.id);

    // For the "before" state, prefer the remote relation data; fall back to
    // the local relation data (which preserves the original values even after
    // deletion via produce()).  This handles config / relation entities whose
    // sub-relations may not be returned by getBatchEntities.
    const beforeSource = remoteRelation ?? localRelation;
    const before =
      changeType === 'REMOVE' || changeType === 'UPDATE'
        ? {
            toEntityId: beforeSource.toEntity.id,
            toEntityName: beforeSource.toEntity.name,
            toSpaceId: beforeSource.toSpaceId ?? null,
            position: beforeSource.position ?? null,
            ...(isMedia && {
              imageUrl: resolveImageUrlFromEntity(remoteEntities.get(beforeSource.toEntity.id)),
            }),
          }
        : null;

    const after =
      !localRelation.isDeleted && (changeType === 'ADD' || changeType === 'UPDATE')
        ? {
            toEntityId: localRelation.toEntity.id,
            toEntityName: localRelation.toEntity.name,
            toSpaceId: localRelation.toSpaceId ?? null,
            position: localRelation.position ?? null,
            ...(isMedia && {
              imageUrl: resolveImageUrlFromEntity(remoteEntities.get(localRelation.toEntity.id)),
            }),
          }
        : null;

    if (before === null && after === null) continue;

    relationChanges.push({
      relationId: localRelation.id,
      typeId: localRelation.type.id,
      typeName: localRelation.type.name,
      spaceId: localRelation.spaceId,
      changeType,
      before,
      after,
    });
  }

  return relationChanges;
}
