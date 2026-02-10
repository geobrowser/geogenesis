import { ContentIds, SystemIds } from '@geoprotocol/geo-sdk';

const { TEXT_BLOCK, IMAGE_BLOCK, DATA_BLOCK, BLOCKS, TYPES_PROPERTY, NAME_PROPERTY, MARKDOWN_CONTENT, COVER_PROPERTY } =
  SystemIds;
import { diffWords } from 'diff';
import { Effect } from 'effect';

import { VIDEO_BLOCK_TYPE } from '~/core/constants';
import { getEntityBacklinks, getBatchEntities } from '~/core/io/queries';
import type { ApiEntityDiffShape } from '~/core/io/rest';
import type { Entity, Relation, Value } from '~/core/types';

import type {
  BlockChange,
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

type ApiValueDiff = ApiEntityDiffShape['values'][number];
type ApiRelationDiff = ApiEntityDiffShape['relations'][number];
type ApiBlockDiff = ApiEntityDiffShape['blocks'][number];

export function mapDiffChunks(
  chunks: readonly { value: string; added?: boolean; removed?: boolean }[]
): DiffChunk[] {
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
    type: (v.type === 'TEXT' ? 'TEXT' : v.type) as SimpleValueType,
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

export const BLOCK_TYPE_IDS = [TEXT_BLOCK, IMAGE_BLOCK, DATA_BLOCK, VIDEO_BLOCK_TYPE];
const BLOCK_TYPE_SET = new Set(BLOCK_TYPE_IDS);

export function computeTextDiff(before: string, after: string): DiffChunk[] {
  const changes = diffWords(before, after);

  return changes.map(change => ({
    value: change.value,
    ...(change.added ? { added: true } : {}),
    ...(change.removed ? { removed: true } : {}),
  }));
}

export function groupBlocksUnderParents(entities: EntityDiff[]): EntityDiff[] {
  const entityMap = new Map(entities.map(e => [e.entityId, e]));

  const blockToParent = new Map<string, string>();
  for (const entity of entities) {
    for (const rel of entity.relations) {
      if (rel.typeId === BLOCKS && rel.changeType === 'ADD' && rel.after) {
        blockToParent.set(rel.after.toEntityId, entity.entityId);
      }
      if (rel.typeId === BLOCKS && rel.changeType === 'REMOVE' && rel.before) {
        blockToParent.set(rel.before.toEntityId, entity.entityId);
      }
    }
  }

  for (const entity of entities) {
    if (blockToParent.has(entity.entityId)) continue;
    for (const rel of entity.relations) {
      if (rel.typeId === TYPES_PROPERTY) {
        const typeEntityId = rel.after?.toEntityId ?? rel.before?.toEntityId;
        if (typeEntityId && BLOCK_TYPE_IDS.includes(typeEntityId)) {
          break;
        }
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
        return {
          ...e,
          relations: filteredRelations,
          blocks: [...e.blocks, ...(blocks ?? [])],
        };
      }
      return e;
    });
}

export async function postProcessDiffs(entities: EntityDiff[], spaceId: string): Promise<EntityDiff[]> {
  // 1. Analysis pass
  const blocksWithParent = new Set<string>();
  const blockTypeEntities: string[] = [];
  const idsToResolve = new Set<string>();
  const entityMap = new Map<string, EntityDiff>();

  for (const entity of entities) {
    entityMap.set(entity.entityId, entity);

    if (!entity.name) idsToResolve.add(entity.entityId);
    for (const v of entity.values) {
      if (!v.propertyName) idsToResolve.add(v.propertyId);
    }

    let isBlock = false;
    for (const rel of entity.relations) {
      if (rel.typeId === BLOCKS) {
        if (rel.after?.toEntityId) blocksWithParent.add(rel.after.toEntityId);
        if (rel.before?.toEntityId) blocksWithParent.add(rel.before.toEntityId);
      }
      if (rel.typeId === TYPES_PROPERTY) {
        const typeId = rel.after?.toEntityId ?? rel.before?.toEntityId;
        if (typeId && BLOCK_TYPE_SET.has(typeId)) isBlock = true;
      }
      if (!rel.typeName) idsToResolve.add(rel.typeId);
      if (rel.before && !rel.before.toEntityName) idsToResolve.add(rel.before.toEntityId);
      if (rel.after && !rel.after.toEntityName) idsToResolve.add(rel.after.toEntityId);
    }

    if (isBlock) blockTypeEntities.push(entity.entityId);
  }

  const orphanSet = new Set(blockTypeEntities.filter(id => !blocksWithParent.has(id)));

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
      for (const entity of entities) {
        if (orphanSet.has(entity.entityId) || blocksWithParent.has(entity.entityId)) continue;
        if (!fallbackParentId) fallbackParentId = entity.entityId;
        if (entity.relations.some(r => r.typeId === BLOCKS)) {
          fallbackParentId = entity.entityId;
          break;
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

  // 3. Batch-fetch names (omit spaceId to resolve cross-space entities)
  const nameMap = new Map<string, string | null>();
  if (idsToResolve.size > 0) {
    try {
      const fetched = await Effect.runPromise(getBatchEntities([...idsToResolve]));
      for (const e of fetched) {
        nameMap.set(e.id, e.name);
      }
    } catch (error) {
      console.error('[postProcessDiffs] Failed to fetch entity names:', error);
    }
  }

  // 4. Inject orphan BLOCKS relations
  let processed = entities;
  if (blockToParent.size > 0) {
    const result = entities.map(e => ({ ...e, relations: [...e.relations] }));
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

  // 5. Group blocks under parents
  const grouped = groupBlocksUnderParents(processed);

  // 6. Apply resolved names
  if (nameMap.size === 0) return grouped;

  return grouped.map(entity => ({
    ...entity,
    name: entity.name ?? nameMap.get(entity.entityId) ?? null,
    values: entity.values.map(v => ({
      ...v,
      propertyName: v.propertyName ?? nameMap.get(v.propertyId) ?? null,
    })),
    relations: entity.relations.map(r => ({
      ...r,
      typeName: r.typeName ?? nameMap.get(r.typeId) ?? null,
      before: r.before
        ? { ...r.before, toEntityName: r.before.toEntityName ?? nameMap.get(r.before.toEntityId) ?? null }
        : r.before,
      after: r.after
        ? { ...r.after, toEntityName: r.after.toEntityName ?? nameMap.get(r.after.toEntityId) ?? null }
        : r.after,
    })),
  }));
}

export function entityDiffToBlockChange(entity: EntityDiff): BlockChange | null {
  const blockType = detectBlockType(entity);

  if (blockType === 'dataBlock') {
    const nameValue = entity.values.find(v => v.propertyId === NAME_PROPERTY);

    return {
      id: entity.entityId,
      type: 'dataBlock',
      before: nameValue?.before ?? null,
      after: nameValue?.after ?? null,
    };
  }

  if (blockType === 'imageBlock') {
    const contentValue = entity.values.find(v => v.propertyId === MARKDOWN_CONTENT) ?? entity.values[0];

    return {
      id: entity.entityId,
      type: 'imageBlock',
      before: contentValue?.before ?? null,
      after: contentValue?.after ?? null,
    };
  }

  // textBlock (default)
  const contentValue =
    entity.values.find(v => v.propertyId === MARKDOWN_CONTENT) ??
    entity.values.find(v => v.type === 'TEXT');
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

export function detectBlockType(entity: EntityDiff): 'textBlock' | 'imageBlock' | 'dataBlock' {
  for (const rel of entity.relations) {
    if (rel.typeId === TYPES_PROPERTY) {
      const typeId = rel.after?.toEntityId ?? rel.before?.toEntityId;
      if (typeId === TEXT_BLOCK) return 'textBlock';
      if (typeId === IMAGE_BLOCK) return 'imageBlock';
      if (typeId === DATA_BLOCK) return 'dataBlock';
    }
  }
  return 'textBlock';
}

export async function fromLocal(
  spaceId: string,
  localValues: Value[],
  localRelations: Relation[]
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

  const remoteEntities = new Map<string, Entity>();
  const idsToFetch = new Set([...allChangedEntityIds, ...mediaTargetEntityIds]);

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

  // Block entities are flat here — groupBlocksUnderParents() nests them later.
  const diffs: EntityDiff[] = [];
  for (const entityId of allChangedEntityIds) {
    const entityValues = localValues.filter(v => v.entity.id === entityId);
    const entityRelations = localRelations.filter(r => r.fromEntity.id === entityId);

    const diff = buildEntityDiff(entityId, spaceId, entityValues, entityRelations, remoteEntities);
    if (diff) {
      diffs.push(diff);
    }
  }

  // Backfill TYPES_PROPERTY from remote so postProcessDiffs can group blocks.
  for (const diff of diffs) {
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

  return postProcessDiffs(diffs, spaceId);
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
    if (localRelation.isDeleted && remoteRelation) {
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

    const before =
      remoteRelation && (changeType === 'REMOVE' || changeType === 'UPDATE')
        ? {
            toEntityId: remoteRelation.toEntity.id,
            toEntityName: remoteRelation.toEntity.name,
            toSpaceId: remoteRelation.toSpaceId ?? null,
            position: remoteRelation.position ?? null,
            ...(isMedia && {
              imageUrl: resolveImageUrlFromEntity(remoteEntities.get(remoteRelation.toEntity.id)),
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
