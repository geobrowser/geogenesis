'use client';

import { IdUtils, Position, SystemIds } from '@geoprotocol/geo-sdk/lite';

import * as React from 'react';

import { type UIMessage, isToolUIPart } from 'ai';
import { useSetAtom } from 'jotai';

import { toGeoFilterState } from '~/core/blocks/data/filters';
import { makeInitialDataEntityRelations } from '~/core/blocks/data/initialize';
import { makeRelationForSourceType } from '~/core/blocks/data/source';
import { DATA_TYPE_ENTITY_IDS, DATA_TYPE_PROPERTY, RENDERABLE_TYPE_PROPERTY } from '~/core/constants';
import { ID } from '~/core/id';
import { EntityId } from '~/core/io/substream-schema';
import { queryClient } from '~/core/query-client';
import { useEditable } from '~/core/state/editable-store';
import { getRelationForBlockType } from '~/core/state/editor/block-types';
import { E } from '~/core/sync/orm';
import { storage } from '~/core/sync/use-mutate';
import { store } from '~/core/sync/use-sync-engine';
import type { Entity, Relation } from '~/core/types';

import { enqueue } from './apply-queue';
import {
  type ApplyResult,
  type BlockContent,
  type DataBlockView,
  type EditIntent,
  type EditToolFailure,
  type EditToolOutput,
  type RelativePosition,
  applyFailed,
  isEditToolPartType,
  lookupFailed,
} from './edit-types';
import { planWriteTool } from './write-validators';
import { editorContentVersionAtom } from '~/atoms';

const VIEW_TO_SYSTEM_ID: Record<DataBlockView, string> = {
  TABLE: SystemIds.TABLE_VIEW,
  LIST: SystemIds.LIST_VIEW,
  GALLERY: SystemIds.GALLERY_VIEW,
  BULLETED_LIST: SystemIds.BULLETED_LIST_VIEW,
};

const VIEW_TO_NAME: Record<DataBlockView, string> = {
  TABLE: 'Table',
  LIST: 'List',
  GALLERY: 'Gallery',
  BULLETED_LIST: 'Bulleted List',
};

export type ApplyCtx = {
  setEditable: (value: boolean) => void;
  bumpEditorVersion: () => void;
};

// Block structure changes need the Tiptap editor to reset — in edit mode it
// treats itself as the source of truth and ignores store changes unless the
// version atom is bumped.
const EDITOR_REFRESHING_INTENTS = new Set<EditIntent['kind']>([
  'createBlock',
  'createBlocks',
  'updateBlock',
  'deleteBlock',
  'moveBlock',
  // deleteEntity may cascade-tombstone child blocks; if the user is on the
  // deleted entity's page, the editor needs to refresh to drop them.
  'deleteEntity',
]);

function applyToggleEditMode(intent: Extract<EditIntent, { kind: 'toggleEditMode' }>, ctx: ApplyCtx): ApplyResult {
  ctx.setEditable(intent.mode === 'edit');
  return { ok: true };
}

function applySetValue(intent: Extract<EditIntent, { kind: 'setValue' }>): ApplyResult {
  storage.values.set({
    spaceId: intent.spaceId,
    entity: { id: intent.entityId, name: intent.entityName ?? null },
    property: { id: intent.propertyId, name: intent.propertyName, dataType: intent.dataType },
    value: intent.value,
  });
  return { ok: true };
}

// E.findOne merges local + remote — the local store only holds values the
// user has modified this session.
async function resolveEntity(entityId: string, spaceId: string | undefined): Promise<Entity | null> {
  try {
    return await E.findOne({ id: entityId, spaceId, store, cache: queryClient });
  } catch (err) {
    console.error('[chat/edit-dispatcher] entity lookup failed', entityId, err);
    return null;
  }
}

// Deletes are intentionally idempotent: a missing target is a no-op success.
// "Already deleted" is the goal state, not a failure mode.
async function applyDeleteValue(intent: Extract<EditIntent, { kind: 'deleteValue' }>): Promise<ApplyResult> {
  const entity = await resolveEntity(intent.entityId, intent.spaceId);
  const match = entity?.values.find(
    v => v.property.id === intent.propertyId && v.spaceId === intent.spaceId && !v.isDeleted
  );
  if (match) storage.values.delete(match);
  return { ok: true };
}

function applySetRelation(intent: Extract<EditIntent, { kind: 'setRelation' }>): ApplyResult {
  const relation: Relation = {
    id: IdUtils.generate(),
    entityId: IdUtils.generate(),
    spaceId: intent.spaceId,
    position: Position.generate(),
    renderableType: 'RELATION',
    type: { id: intent.typeId, name: intent.typeName },
    fromEntity: { id: intent.fromEntityId, name: intent.fromEntityName ?? null },
    toEntity: { id: intent.toEntityId, name: intent.toEntityName, value: intent.toEntityId },
  };
  storage.relations.set(relation);
  return { ok: true };
}

async function applyDeleteRelation(intent: Extract<EditIntent, { kind: 'deleteRelation' }>): Promise<ApplyResult> {
  const entity = await resolveEntity(intent.fromEntityId, intent.spaceId);
  const matches = (entity?.relations ?? []).filter(
    r =>
      r.fromEntity.id === intent.fromEntityId &&
      r.type.id === intent.typeId &&
      r.toEntity.id === intent.toEntityId &&
      r.spaceId === intent.spaceId &&
      !r.isDeleted
  );
  for (const relation of matches) {
    storage.relations.delete(relation);
  }
  return { ok: true };
}

function applyCreateProperty(intent: Extract<EditIntent, { kind: 'createProperty' }>): ApplyResult {
  storage.properties.create({
    entityId: intent.propertyId,
    spaceId: intent.spaceId,
    name: intent.name,
    dataType: intent.dataType,
    renderableTypeId: intent.renderableTypeId,
  });
  return { ok: true };
}

async function nextBlockPosition(parentEntityId: string, spaceId: string): Promise<string> {
  // Merged local+remote view so we don't jam new blocks above untouched
  // published siblings.
  const parent = await resolveEntity(parentEntityId, spaceId);
  const existing = (parent?.relations ?? []).filter(
    r => r.fromEntity.id === parentEntityId && r.type.id === SystemIds.BLOCKS && !r.isDeleted
  );
  const positions = existing
    .map(r => r.position)
    .filter((p): p is string => typeof p === 'string' && p.length > 0)
    .sort();
  const last = positions[positions.length - 1] ?? null;
  return Position.generateBetween(last, null);
}

function writeBlockTypeRelations(blockId: string, content: BlockContent, spaceId: string) {
  switch (content.kind) {
    case 'text':
    case 'code': {
      storage.relations.set(getRelationForBlockType(blockId, SystemIds.TEXT_BLOCK, spaceId));
      storage.values.set({
        spaceId,
        entity: { id: blockId, name: null },
        property: {
          id: SystemIds.MARKDOWN_CONTENT,
          name: 'Markdown content',
          dataType: 'TEXT',
        },
        value: content.markdown,
      });
      break;
    }
    case 'image': {
      storage.relations.set(getRelationForBlockType(blockId, SystemIds.IMAGE_TYPE, spaceId));
      storage.values.set({
        spaceId,
        entity: { id: blockId, name: content.title ?? null },
        property: {
          id: SystemIds.IMAGE_URL_PROPERTY,
          name: 'IPFS URL',
          dataType: 'TEXT',
          renderableType: 'URL',
        },
        value: content.url,
      });
      if (content.title) {
        storage.entities.name.set(blockId, spaceId, content.title);
      }
      break;
    }
    case 'video': {
      storage.relations.set(getRelationForBlockType(blockId, SystemIds.VIDEO_TYPE, spaceId));
      storage.values.set({
        spaceId,
        entity: { id: blockId, name: content.title ?? null },
        property: {
          id: SystemIds.IMAGE_URL_PROPERTY,
          name: 'IPFS URL',
          dataType: 'TEXT',
          renderableType: 'URL',
        },
        value: content.url,
      });
      if (content.title) {
        storage.entities.name.set(blockId, spaceId, content.title);
      }
      break;
    }
    case 'data': {
      const source = content.source ?? 'COLLECTION';
      if (source === 'COLLECTION') {
        for (const relation of makeInitialDataEntityRelations(EntityId(blockId), spaceId)) {
          storage.relations.set(relation);
        }
      } else {
        const sourceKind = source === 'QUERY' ? 'SPACES' : 'GEO';
        storage.relations.set(makeRelationForSourceType(sourceKind, blockId, spaceId));
        storage.relations.set(getRelationForBlockType(blockId, SystemIds.DATA_BLOCK, spaceId));
      }
      // Mirror in-UI default: blocks publish with a blank header if title is omitted.
      const dataTitle = content.title && content.title.trim().length > 0 ? content.title.trim() : 'New data';
      storage.entities.name.set(blockId, spaceId, dataTitle);
      break;
    }
  }
}

async function applyCreateBlock(intent: Extract<EditIntent, { kind: 'createBlock' }>): Promise<ApplyResult> {
  const { blockId, parentEntityId, spaceId, content } = intent;

  writeBlockTypeRelations(blockId, content, spaceId);

  const renderableType = (() => {
    switch (content.kind) {
      case 'text':
      case 'code':
        return 'TEXT' as const;
      case 'image':
        return 'IMAGE' as const;
      case 'video':
        return 'VIDEO' as const;
      case 'data':
        return 'DATA' as const;
    }
  })();

  const blockRelationEntityId = IdUtils.generate();
  const position = await nextBlockPosition(parentEntityId, spaceId);

  const blocksRelation: Relation = {
    id: IdUtils.generate(),
    entityId: blockRelationEntityId,
    spaceId,
    position,
    verified: false,
    renderableType,
    type: { id: SystemIds.BLOCKS, name: 'Blocks' },
    fromEntity: { id: parentEntityId, name: null },
    toEntity: { id: blockId, name: null, value: blockId },
  };
  storage.relations.set(blocksRelation);

  if (content.kind === 'data') {
    const view = content.view ?? 'TABLE';
    const viewId = VIEW_TO_SYSTEM_ID[view];
    storage.relations.set({
      id: IdUtils.generate(),
      entityId: IdUtils.generate(),
      spaceId,
      position: Position.generate(),
      renderableType: 'RELATION',
      type: { id: SystemIds.VIEW_PROPERTY, name: 'View' },
      fromEntity: { id: blockRelationEntityId, name: null },
      toEntity: { id: viewId, name: VIEW_TO_NAME[view], value: viewId },
    });
  }
  return { ok: true };
}

async function applyCreateBlocks(intent: Extract<EditIntent, { kind: 'createBlocks' }>): Promise<ApplyResult> {
  // Sequential — each iteration must observe the prior block's BLOCKS edge
  // so nextBlockPosition keeps appending instead of stacking on the same key.
  // Bail on first failure so we don't keep stacking blocks past a broken one.
  for (const { blockId, content } of intent.blocks) {
    const result = await applyCreateBlock({
      kind: 'createBlock',
      parentEntityId: intent.parentEntityId,
      spaceId: intent.spaceId,
      blockId,
      content,
    });
    if (!result.ok) return result;
  }
  return { ok: true };
}

async function applyUpdateBlock(intent: Extract<EditIntent, { kind: 'updateBlock' }>): Promise<ApplyResult> {
  const { blockId, spaceId, content } = intent;

  switch (content.kind) {
    case 'text':
    case 'code': {
      storage.values.set({
        spaceId,
        entity: { id: blockId, name: null },
        property: {
          id: SystemIds.MARKDOWN_CONTENT,
          name: 'Markdown content',
          dataType: 'TEXT',
        },
        value: content.markdown,
      });
      return { ok: true };
    }
    case 'image':
    case 'video': {
      storage.values.set({
        spaceId,
        entity: { id: blockId, name: content.title ?? null },
        property: {
          id: SystemIds.IMAGE_URL_PROPERTY,
          name: 'IPFS URL',
          dataType: 'TEXT',
          renderableType: 'URL',
        },
        value: content.url,
      });
      if (content.title) {
        storage.entities.name.set(blockId, spaceId, content.title);
      }
      return { ok: true };
    }
    case 'data': {
      // Gate on source !== undefined: a title-only update would otherwise
      // clobber the existing source (e.g. GEO → COLLECTION).
      if (content.source !== undefined) {
        const blockEntity = await resolveEntity(blockId, spaceId);
        if (!blockEntity) {
          // Surface as apply_failed rather than write a new source: without
          // tombstoning the old edge we'd leave two competing source relations.
          return applyFailed(`block ${blockId} not found in space ${spaceId} — cannot change source`);
        }
        for (const relation of blockEntity.relations ?? []) {
          if (
            relation.fromEntity.id === blockId &&
            relation.type.id === SystemIds.DATA_SOURCE_TYPE_RELATION_TYPE &&
            relation.spaceId === spaceId &&
            !relation.isDeleted
          ) {
            storage.relations.delete(relation);
          }
        }
        const sourceKind = content.source === 'QUERY' ? 'SPACES' : content.source === 'GEO' ? 'GEO' : 'COLLECTION';
        storage.relations.set(makeRelationForSourceType(sourceKind, blockId, spaceId));
      }
      if (content.title && content.title.trim().length > 0) {
        storage.entities.name.set(blockId, spaceId, content.title.trim());
      }
      return { ok: true };
    }
  }
}

async function applyDeleteBlock(intent: Extract<EditIntent, { kind: 'deleteBlock' }>): Promise<ApplyResult> {
  const { blockId, parentEntityId, spaceId } = intent;

  // E.findOne (not local store) — published blocks aren't in local state
  // until something reads them in.
  const [blockEntity, parentEntity] = await Promise.all([
    resolveEntity(blockId, spaceId),
    resolveEntity(parentEntityId, spaceId),
  ]);

  // CRITICAL: find the BLOCKS edge before mutating anything. If it's missing
  // and we tombstone the block's values anyway, the parent's BLOCKS edge
  // points at an empty block — a broken stub on the published page.
  let blocksEdge = (parentEntity?.relations ?? []).find(
    relation =>
      relation.fromEntity.id === parentEntityId &&
      relation.toEntity.id === blockId &&
      relation.type.id === SystemIds.BLOCKS &&
      relation.spaceId === spaceId &&
      !relation.isDeleted
  );
  // Fallback: scan the relation index directly. Catches edges that are in
  // local store but whose parent record didn't get pulled into E.findOne.
  if (!blocksEdge) {
    const direct = store
      .getResolvedRelations(parentEntityId, true)
      .find(
        r =>
          r.fromEntity.id === parentEntityId &&
          r.toEntity.id === blockId &&
          r.type.id === SystemIds.BLOCKS &&
          r.spaceId === spaceId &&
          !r.isDeleted
      );
    if (direct) blocksEdge = direct;
  }
  if (!blocksEdge) {
    return applyFailed(
      `no BLOCKS edge from ${parentEntityId} to ${blockId} in space ${spaceId} — block is not a child of that parent`
    );
  }

  for (const value of blockEntity?.values ?? []) {
    if (value.spaceId === spaceId && !value.isDeleted) {
      storage.values.delete(value);
    }
  }

  for (const relation of blockEntity?.relations ?? []) {
    if (relation.fromEntity.id === blockId && relation.spaceId === spaceId && !relation.isDeleted) {
      storage.relations.delete(relation);
    }
  }

  // The block-relation entity holds VIEW_PROPERTY and FILTER for data blocks;
  // tombstone its edges/values too or they linger pointing at a dead block.
  const blockRelationEntity = await resolveEntity(blocksEdge.entityId, spaceId);
  for (const value of blockRelationEntity?.values ?? []) {
    if (value.spaceId === spaceId && !value.isDeleted) {
      storage.values.delete(value);
    }
  }
  for (const relation of blockRelationEntity?.relations ?? []) {
    if (relation.fromEntity.id === blocksEdge.entityId && relation.spaceId === spaceId && !relation.isDeleted) {
      storage.relations.delete(relation);
    }
  }

  storage.relations.delete(blocksEdge);
  return { ok: true };
}

async function applySetDataBlockFilters(
  intent: Extract<EditIntent, { kind: 'setDataBlockFilters' }>
): Promise<ApplyResult> {
  // Resolve the block first: a hallucinated blockId would otherwise write a
  // FILTER onto an unrelated entity.
  const block = await resolveEntity(intent.blockId, intent.spaceId);
  if (!block) {
    return applyFailed(`block ${intent.blockId} not found in space ${intent.spaceId}`);
  }

  const encoded = intent.filters.length === 0 ? '' : toGeoFilterState(intent.filters, intent.mode);

  storage.values.set({
    spaceId: intent.spaceId,
    entity: { id: intent.blockId, name: null },
    property: { id: SystemIds.FILTER, name: 'Filter', dataType: 'TEXT' },
    value: encoded,
  });
  return { ok: true };
}

async function applySetDataBlockView(intent: Extract<EditIntent, { kind: 'setDataBlockView' }>): Promise<ApplyResult> {
  // VIEW_PROPERTY hangs off the BLOCKS-relation entity, not the block itself.
  const { blockId, parentEntityId, spaceId, view } = intent;

  const parent = await resolveEntity(parentEntityId, spaceId);
  let blocksRelation = (parent?.relations ?? []).find(
    r =>
      r.fromEntity.id === parentEntityId &&
      r.type.id === SystemIds.BLOCKS &&
      r.toEntity.id === blockId &&
      r.spaceId === spaceId &&
      !r.isDeleted
  );
  if (!blocksRelation) {
    const direct = store
      .getResolvedRelations(parentEntityId, true)
      .find(
        r =>
          r.fromEntity.id === parentEntityId &&
          r.toEntity.id === blockId &&
          r.type.id === SystemIds.BLOCKS &&
          r.spaceId === spaceId &&
          !r.isDeleted
      );
    if (direct) blocksRelation = direct;
  }
  if (!blocksRelation) {
    return applyFailed(`no BLOCKS edge from ${parentEntityId} to ${blockId} in space ${spaceId}`);
  }
  const blockRelationEntityId = blocksRelation.entityId;

  const relationEntity = await resolveEntity(blockRelationEntityId, spaceId);
  if (!relationEntity) {
    // Bail rather than write: without tombstoning the current VIEW edge we'd
    // leave two conflicting VIEW relations.
    return applyFailed(`block-relation entity ${blockRelationEntityId} not found — cannot swap view safely`);
  }
  for (const relation of relationEntity.relations ?? []) {
    if (
      relation.fromEntity.id === blockRelationEntityId &&
      relation.type.id === SystemIds.VIEW_PROPERTY &&
      relation.spaceId === spaceId &&
      !relation.isDeleted
    ) {
      storage.relations.delete(relation);
    }
  }

  const viewId = VIEW_TO_SYSTEM_ID[view];
  const viewName = VIEW_TO_NAME[view];

  storage.relations.set({
    id: IdUtils.generate(),
    entityId: IdUtils.generate(),
    spaceId,
    position: Position.generate(),
    renderableType: 'RELATION',
    type: { id: SystemIds.VIEW_PROPERTY, name: 'View' },
    fromEntity: { id: blockRelationEntityId, name: null },
    toEntity: { id: viewId, name: viewName, value: viewId },
  });
  return { ok: true };
}

async function applySetDataBlockShownColumns(
  intent: Extract<EditIntent, { kind: 'setDataBlockShownColumns' }>
): Promise<ApplyResult> {
  // SHOWN_COLUMNS / PROPERTIES relations live on the BLOCKS-relation entity
  // (the entity carried by the parent's BLOCKS edge), not on the block itself.
  const { blockId, parentEntityId, spaceId, propertyIds } = intent;

  const parent = await resolveEntity(parentEntityId, spaceId);
  let blocksRelation = (parent?.relations ?? []).find(
    r =>
      r.fromEntity.id === parentEntityId &&
      r.type.id === SystemIds.BLOCKS &&
      r.toEntity.id === blockId &&
      r.spaceId === spaceId &&
      !r.isDeleted
  );
  if (!blocksRelation) {
    const direct = store
      .getResolvedRelations(parentEntityId, true)
      .find(
        r =>
          r.fromEntity.id === parentEntityId &&
          r.toEntity.id === blockId &&
          r.type.id === SystemIds.BLOCKS &&
          r.spaceId === spaceId &&
          !r.isDeleted
      );
    if (direct) blocksRelation = direct;
  }
  if (!blocksRelation) {
    return applyFailed(`no BLOCKS edge from ${parentEntityId} to ${blockId} in space ${spaceId}`);
  }
  const blockRelationEntityId = blocksRelation.entityId;

  const relationEntity = await resolveEntity(blockRelationEntityId, spaceId);
  if (!relationEntity) {
    return applyFailed(`block-relation entity ${blockRelationEntityId} not found — cannot swap columns safely`);
  }
  // Tombstone existing SHOWN_COLUMNS / PROPERTIES edges on the block-relation
  // entity so the new list is the source of truth (mirrors setDataBlockFilters
  // semantics — full replacement, not merge).
  for (const relation of relationEntity.relations ?? []) {
    if (
      relation.fromEntity.id === blockRelationEntityId &&
      (relation.type.id === SystemIds.SHOWN_COLUMNS || relation.type.id === SystemIds.PROPERTIES) &&
      relation.spaceId === spaceId &&
      !relation.isDeleted
    ) {
      storage.relations.delete(relation);
    }
  }

  // Re-emit in array order. Position.generateBetween chains keep the order
  // stable across publish.
  let prevPosition: string | null = null;
  for (const propertyId of propertyIds) {
    const position = Position.generateBetween(prevPosition, null);
    storage.relations.set({
      id: IdUtils.generate(),
      entityId: IdUtils.generate(),
      spaceId,
      position,
      renderableType: 'RELATION',
      type: { id: SystemIds.PROPERTIES, name: 'Properties' },
      fromEntity: { id: blockRelationEntityId, name: null },
      toEntity: { id: propertyId, name: null, value: propertyId },
    });
    prevPosition = position;
  }
  return { ok: true };
}

// Cap on cascade depth to defend against pathological cycles (entity A's block
// is B; B's block is A — shouldn't happen but defensive). Five levels is well
// past any organic page nesting.
const DELETE_ENTITY_MAX_DEPTH = 5;

async function applyDeleteEntityRecursive(
  entityId: string,
  spaceId: string,
  depth: number,
  visited: Set<string>,
  // For deleteEntity we tombstone backlinks across every space (editor parity).
  // For move-from-source, the cascade must only touch the source space —
  // other-space backlinks are intentionally preserved.
  scopeBacklinksToSpace = false
): Promise<ApplyResult> {
  if (depth > DELETE_ENTITY_MAX_DEPTH) return { ok: true };
  // Cycle guard — re-visiting an id within the same cascade is always a no-op.
  if (visited.has(entityId)) return { ok: true };
  visited.add(entityId);

  const entity = await resolveEntity(entityId, spaceId);
  if (!entity) {
    // No record found locally or remotely. Top of the cascade should fail loudly;
    // recursive children are fine to no-op (the orphan check upstream filtered
    // already-gone targets).
    if (depth === 0) return applyFailed(`entity ${entityId} not found in space ${spaceId}`);
    return { ok: true };
  }

  // 1. Tombstone all values where entity = self in this space.
  for (const value of entity.values ?? []) {
    if (value.spaceId === spaceId && !value.isDeleted) {
      storage.values.delete(value);
    }
  }

  // 2. Tombstone all outgoing relations in this space.
  const outgoingRelations = (entity.relations ?? []).filter(
    r => r.fromEntity.id === entityId && r.spaceId === spaceId && !r.isDeleted
  );
  for (const relation of outgoingRelations) {
    storage.relations.delete(relation);
  }

  // 3. Tombstone backlinks. Default: cross-space included — match editor
  // behavior for delete. Move-from-source passes scopeBacklinksToSpace so only
  // source-space backlinks tombstone (the editor's move scopes them too).
  const backlinks = store.getRelationsToEntity(entityId, scopeBacklinksToSpace ? spaceId : undefined);
  const seenBacklinks = new Set(outgoingRelations.map(r => r.id));
  for (const relation of backlinks) {
    if (seenBacklinks.has(relation.id)) continue;
    if (relation.isDeleted) continue;
    storage.relations.delete(relation);
  }

  // 4. Cascade to orphaned BLOCKS children — only blocks no other relation
  // points at. Shared blocks (referenced from another page) survive.
  const blockEdges = outgoingRelations.filter(r => r.type.id === SystemIds.BLOCKS);
  const childBlockIds = [...new Set(blockEdges.map(e => e.toEntity.id))];
  for (const blockId of childBlockIds) {
    const remainingRefs = store
      .getRelationsToEntity(blockId)
      .filter(r => !(r.fromEntity.id === entityId && r.type.id === SystemIds.BLOCKS && r.spaceId === spaceId))
      .filter(r => !r.isDeleted);
    if (remainingRefs.length === 0) {
      const childResult = await applyDeleteEntityRecursive(blockId, spaceId, depth + 1, visited, scopeBacklinksToSpace);
      if (!childResult.ok) return childResult;
    }
  }

  return { ok: true };
}

async function applyDeleteEntity(intent: Extract<EditIntent, { kind: 'deleteEntity' }>): Promise<ApplyResult> {
  return applyDeleteEntityRecursive(intent.entityId, intent.spaceId, 0, new Set());
}

// Properties are entities themselves — delete shares the same cascade. The
// planner already guarded that the target really is a property; here we just
// run the same tombstone path. Backlinks include every value/relation that
// USES the property elsewhere — those get tombstoned too, matching the
// editor's "delete entity" semantics applied to a property entity.
//
// Cold-cache caveat: if the property is purely published (never staged
// locally) and `resolveEntity` here misses (the dispatcher's resolver hits
// E.findOne without the remote-getEntity fallback the planner uses), this
// returns apply_failed even though the planner verified existence. Rare in
// practice — the planner's lookup typically warms the cache.
async function applyDeleteProperty(intent: Extract<EditIntent, { kind: 'deleteProperty' }>): Promise<ApplyResult> {
  return applyDeleteEntityRecursive(intent.propertyId, intent.spaceId, 0, new Set());
}

// Mirror the editor's cloneEntityIntoSpace: copy values + outgoing relations
// from source to target, deduping against any data already in target. Used by
// both move (with source delete) and clone (without).
function copyEntityIntoSpace(entityId: string, sourceSpaceId: string, targetSpaceId: string, sourceEntity: Entity) {
  const existingTargetValueIds = new Set(
    (sourceEntity.values ?? []).filter(v => v.spaceId === targetSpaceId && !v.isDeleted).map(v => v.id)
  );
  const existingTargetRelationSignatures = new Set(
    (sourceEntity.relations ?? [])
      .filter(r => r.fromEntity.id === entityId && r.spaceId === targetSpaceId && !r.isDeleted)
      .map(r => `${r.type.id}|${r.fromEntity.id}|${r.toEntity.id}|${r.toSpaceId ?? ''}|${r.renderableType}`)
  );

  for (const value of sourceEntity.values ?? []) {
    if (value.spaceId !== sourceSpaceId || value.isDeleted) continue;
    const targetValueId = ID.createValueId({
      entityId: value.entity.id,
      propertyId: value.property.id,
      spaceId: targetSpaceId,
    });
    if (existingTargetValueIds.has(targetValueId)) continue;
    storage.values.set({
      ...value,
      id: targetValueId,
      spaceId: targetSpaceId,
      entity: { ...value.entity },
      property: { ...value.property },
    });
  }

  for (const relation of sourceEntity.relations ?? []) {
    if (relation.fromEntity.id !== entityId || relation.spaceId !== sourceSpaceId || relation.isDeleted) continue;
    const signature = `${relation.type.id}|${relation.fromEntity.id}|${relation.toEntity.id}|${
      relation.toSpaceId ?? ''
    }|${relation.renderableType}`;
    if (existingTargetRelationSignatures.has(signature)) continue;
    storage.relations.set({
      ...relation,
      id: IdUtils.generate(),
      entityId: IdUtils.generate(),
      spaceId: targetSpaceId,
      fromEntity: { ...relation.fromEntity },
      toEntity: { ...relation.toEntity },
      type: { ...relation.type },
    });
  }
}

async function applyCloneEntityToSpace(
  intent: Extract<EditIntent, { kind: 'cloneEntityToSpace' }>
): Promise<ApplyResult> {
  const sourceEntity = await resolveEntity(intent.entityId, intent.spaceId);
  if (!sourceEntity) {
    return applyFailed(`entity ${intent.entityId} not found in space ${intent.spaceId}`);
  }
  copyEntityIntoSpace(intent.entityId, intent.spaceId, intent.targetSpaceId, sourceEntity);
  return { ok: true };
}

async function applyMoveEntityToSpace(
  intent: Extract<EditIntent, { kind: 'moveEntityToSpace' }>
): Promise<ApplyResult> {
  // Match the editor's flow: clone first, then tombstone in source (including
  // orphan-block cascade). Child blocks are NOT cloned — the user is warned in
  // the tool description that the moved page will look empty in target until
  // they re-add blocks.
  const sourceEntity = await resolveEntity(intent.entityId, intent.spaceId);
  if (!sourceEntity) {
    return applyFailed(`entity ${intent.entityId} not found in space ${intent.spaceId}`);
  }
  copyEntityIntoSpace(intent.entityId, intent.spaceId, intent.targetSpaceId, sourceEntity);
  // Re-use the same recursive cascade that powers deleteEntity — by passing
  // the source space + scopeBacklinksToSpace, only that space's data is
  // tombstoned. Backlinks in OTHER spaces are intentionally left alone
  // (matches editor parity).
  return applyDeleteEntityRecursive(intent.entityId, intent.spaceId, 0, new Set(), true);
}

async function applyChangePropertyDataType(
  intent: Extract<EditIntent, { kind: 'changePropertyDataType' }>
): Promise<ApplyResult> {
  const { propertyId, spaceId, propertyName, dataType, renderableTypeId } = intent;

  const propertyEntity = await resolveEntity(propertyId, spaceId);
  if (!propertyEntity) {
    return applyFailed(`property ${propertyId} not found in space ${spaceId}`);
  }

  // Tombstone existing DATA_TYPE_PROPERTY edges from this property.
  for (const relation of propertyEntity.relations ?? []) {
    if (
      relation.fromEntity.id === propertyId &&
      relation.type.id === DATA_TYPE_PROPERTY &&
      relation.spaceId === spaceId &&
      !relation.isDeleted
    ) {
      storage.relations.delete(relation);
    }
  }

  // Tombstone existing RENDERABLE_TYPE_PROPERTY too — the new dataType may
  // require a different renderable, and leaving the old one would conflict.
  for (const relation of propertyEntity.relations ?? []) {
    if (
      relation.fromEntity.id === propertyId &&
      relation.type.id === RENDERABLE_TYPE_PROPERTY &&
      relation.spaceId === spaceId &&
      !relation.isDeleted
    ) {
      storage.relations.delete(relation);
    }
  }

  // Register the new dataType in the store so getProperty / getStableDataType
  // reflect the change immediately.
  storage.properties.setDataType(propertyId, dataType);

  // Set the new DATA_TYPE_PROPERTY relation pointing at the data type entity.
  const dataTypeEntityId = DATA_TYPE_ENTITY_IDS[dataType];
  if (!dataTypeEntityId) {
    return applyFailed(`unknown dataType ${dataType} — no entity id mapping`);
  }
  storage.relations.set({
    id: IdUtils.generate(),
    entityId: IdUtils.generate(),
    spaceId,
    position: Position.generate(),
    renderableType: 'RELATION',
    type: { id: DATA_TYPE_PROPERTY, name: 'Data Type' },
    fromEntity: { id: propertyId, name: propertyName },
    toEntity: { id: dataTypeEntityId, name: dataType, value: dataTypeEntityId },
  });

  // Optional renderable type relation (URL, IMAGE, GEO_LOCATION, etc).
  if (renderableTypeId) {
    storage.relations.set({
      id: IdUtils.generate(),
      entityId: IdUtils.generate(),
      spaceId,
      position: Position.generate(),
      renderableType: 'RELATION',
      type: { id: RENDERABLE_TYPE_PROPERTY, name: 'Renderable Type' },
      fromEntity: { id: propertyId, name: propertyName },
      toEntity: { id: renderableTypeId, name: null, value: renderableTypeId },
    });
  }

  return { ok: true };
}

async function applyCreateTab(intent: Extract<EditIntent, { kind: 'createTab' }>): Promise<ApplyResult> {
  const { parentEntityId, spaceId, tabId, name } = intent;

  // Append after the last existing tab so the new one shows up at the right.
  // Falls back to merged + relation-index views so a freshly-created tab in
  // the same turn is still ordered correctly.
  const parent = await resolveEntity(parentEntityId, spaceId);
  const tabsRelations = (parent?.relations ?? []).filter(
    r =>
      r.fromEntity.id === parentEntityId &&
      r.type.id === SystemIds.TABS_PROPERTY &&
      r.spaceId === spaceId &&
      !r.isDeleted
  );
  if (tabsRelations.length === 0) {
    const direct = store
      .getResolvedRelations(parentEntityId, false)
      .filter(r => r.type.id === SystemIds.TABS_PROPERTY && r.spaceId === spaceId);
    if (direct.length > 0) tabsRelations.push(...direct);
  }
  const lastPosition =
    tabsRelations
      .map(r => r.position)
      .filter((p): p is string => typeof p === 'string' && p.length > 0)
      .sort()
      .pop() ?? null;

  storage.entities.name.set(tabId, spaceId, name);

  storage.relations.set({
    id: IdUtils.generate(),
    entityId: IdUtils.generate(),
    spaceId,
    position: Position.generateBetween(lastPosition, null),
    renderableType: 'RELATION',
    type: { id: SystemIds.TABS_PROPERTY, name: 'Tabs' },
    fromEntity: { id: parentEntityId, name: null },
    toEntity: { id: tabId, name, value: tabId },
  });

  storage.relations.set({
    id: IdUtils.generate(),
    entityId: IdUtils.generate(),
    spaceId,
    position: Position.generate(),
    renderableType: 'RELATION',
    type: { id: SystemIds.TYPES_PROPERTY, name: 'Types' },
    fromEntity: { id: tabId, name },
    toEntity: { id: SystemIds.PAGE_TYPE, name: 'Page', value: SystemIds.PAGE_TYPE },
  });

  return { ok: true };
}

function applyRenameTab(intent: Extract<EditIntent, { kind: 'renameTab' }>): ApplyResult {
  storage.entities.name.set(intent.tabId, intent.spaceId, intent.name);
  return { ok: true };
}

function applyCreateEntity(intent: Extract<EditIntent, { kind: 'createEntity' }>): ApplyResult {
  const { entityId, spaceId, name, description, typeIds } = intent;

  storage.entities.name.set(entityId, spaceId, name);

  if (description && description.trim().length > 0) {
    storage.values.set({
      spaceId,
      entity: { id: entityId, name },
      property: { id: SystemIds.DESCRIPTION_PROPERTY, name: 'Description', dataType: 'TEXT' },
      value: description,
    });
  }

  if (typeIds) {
    for (const typeId of typeIds) {
      storage.relations.set({
        id: IdUtils.generate(),
        entityId: IdUtils.generate(),
        spaceId,
        position: Position.generate(),
        renderableType: 'RELATION',
        type: { id: SystemIds.TYPES_PROPERTY, name: 'Types' },
        fromEntity: { id: entityId, name },
        toEntity: { id: typeId, name: null, value: typeId },
      });
    }
  }
  return { ok: true };
}

// Excludes moving relation by object identity, not position — legacy data
// can have two siblings sharing the same fractional-index.
function computeRelativePosition<T extends { position?: string | null }>(
  siblings: T[],
  moving: T,
  target: RelativePosition,
  findReference: () => T | undefined
): string | null {
  const sorted = siblings
    .filter(s => s !== moving)
    .map(s => s.position ?? null)
    .filter((p): p is string => typeof p === 'string' && p.length > 0)
    .sort();

  if (target.kind === 'first') return Position.generateBetween(null, sorted[0] ?? null);
  if (target.kind === 'last') return Position.generateBetween(sorted[sorted.length - 1] ?? null, null);

  const reference = findReference();
  if (!reference || typeof reference.position !== 'string') return null;
  const refPos = reference.position;
  const index = sorted.indexOf(refPos);
  if (index === -1) return null;

  if (target.kind === 'before') {
    const prev = index > 0 ? sorted[index - 1] : null;
    return Position.generateBetween(prev ?? null, refPos);
  }
  // after
  const next = index < sorted.length - 1 ? sorted[index + 1] : null;
  return Position.generateBetween(refPos, next ?? null);
}

async function applyMoveBlock(intent: Extract<EditIntent, { kind: 'moveBlock' }>): Promise<ApplyResult> {
  const { blockId, parentEntityId, spaceId, position } = intent;

  const parent = await resolveEntity(parentEntityId, spaceId);
  let blocksRelations = (parent?.relations ?? []).filter(
    r => r.fromEntity.id === parentEntityId && r.type.id === SystemIds.BLOCKS && r.spaceId === spaceId && !r.isDeleted
  );
  // Fallback: if E.findOne missed locally-staged siblings, the relation index
  // still has them. Better to over-include via merge than under-include.
  if (!blocksRelations.some(r => r.toEntity.id === blockId)) {
    const direct = store
      .getResolvedRelations(parentEntityId, false)
      .filter(r => r.type.id === SystemIds.BLOCKS && r.spaceId === spaceId);
    if (direct.length > 0) {
      const seen = new Set(blocksRelations.map(r => r.id));
      for (const r of direct) {
        if (!seen.has(r.id)) blocksRelations = [...blocksRelations, r];
      }
    }
  }
  const moving = blocksRelations.find(r => r.toEntity.id === blockId);
  if (!moving) {
    return applyFailed(`block ${blockId} is not a child of ${parentEntityId} — cannot reorder`);
  }

  const newPosition = computeRelativePosition(blocksRelations, moving, position, () =>
    blocksRelations.find(
      r => r.toEntity.id === (position.kind === 'before' || position.kind === 'after' ? position.referenceId : '')
    )
  );
  if (!newPosition) {
    const ref = position.kind === 'before' || position.kind === 'after' ? position.referenceId : 'first/last';
    return applyFailed(`could not compute new position relative to ${ref}`);
  }

  // Upsert by relation.id so block-relation entity id (and VIEW_PROPERTY /
  // filter relations hanging off it) survive the move.
  storage.relations.set({ ...moving, position: newPosition });
  return { ok: true };
}

async function applyMoveRelation(intent: Extract<EditIntent, { kind: 'moveRelation' }>): Promise<ApplyResult> {
  const { fromEntityId, typeId, toEntityId, spaceId, position } = intent;

  const from = await resolveEntity(fromEntityId, spaceId);
  const siblings = (from?.relations ?? []).filter(
    r => r.fromEntity.id === fromEntityId && r.type.id === typeId && r.spaceId === spaceId && !r.isDeleted
  );
  const moving = siblings.find(r => r.toEntity.id === toEntityId);
  if (!moving) {
    return applyFailed(`no relation of type ${typeId} from ${fromEntityId} to ${toEntityId}`);
  }

  const newPosition = computeRelativePosition(siblings, moving, position, () =>
    siblings.find(
      r => r.toEntity.id === (position.kind === 'before' || position.kind === 'after' ? position.referenceId : '')
    )
  );
  if (!newPosition) {
    const ref = position.kind === 'before' || position.kind === 'after' ? position.referenceId : 'first/last';
    return applyFailed(`could not compute new position relative to ${ref}`);
  }

  storage.relations.set({ ...moving, position: newPosition });
  return { ok: true };
}

export async function applyIntent(intent: EditIntent, ctx: ApplyCtx): Promise<ApplyResult> {
  switch (intent.kind) {
    case 'toggleEditMode':
      return applyToggleEditMode(intent, ctx);
    case 'setValue':
      return applySetValue(intent);
    case 'deleteValue':
      return applyDeleteValue(intent);
    case 'setRelation':
      return applySetRelation(intent);
    case 'deleteRelation':
      return applyDeleteRelation(intent);
    case 'createProperty':
      return applyCreateProperty(intent);
    case 'createEntity':
      return applyCreateEntity(intent);
    case 'deleteEntity':
      return applyDeleteEntity(intent);
    case 'moveEntityToSpace':
      return applyMoveEntityToSpace(intent);
    case 'cloneEntityToSpace':
      return applyCloneEntityToSpace(intent);
    case 'deleteProperty':
      return applyDeleteProperty(intent);
    case 'changePropertyDataType':
      return applyChangePropertyDataType(intent);
    case 'createTab':
      return applyCreateTab(intent);
    case 'renameTab':
      return applyRenameTab(intent);
    case 'createBlock':
      return applyCreateBlock(intent);
    case 'createBlocks':
      return applyCreateBlocks(intent);
    case 'updateBlock':
      return applyUpdateBlock(intent);
    case 'deleteBlock':
      return applyDeleteBlock(intent);
    case 'moveBlock':
      return applyMoveBlock(intent);
    case 'moveRelation':
      return applyMoveRelation(intent);
    case 'setDataBlockFilters':
      return applySetDataBlockFilters(intent);
    case 'setDataBlockView':
      return applySetDataBlockView(intent);
    case 'setDataBlockShownColumns':
      return applySetDataBlockShownColumns(intent);
  }
}

// Edit tool name extracted from a UI part type like `tool-setEntityValue`.
function writeToolNameFromPartType(type: string): string | null {
  if (!type.startsWith('tool-')) return null;
  const name = type.slice('tool-'.length);
  return isEditToolPartType(type) ? name : null;
}

type AuthorizeOutput = { ok: true } | EditToolFailure;

async function authorizeWrite(
  spaceId: string | undefined,
  toolName: string,
  signal: AbortSignal,
  // Cross-space tools (moveEntityToSpace / cloneEntityToSpace) need membership
  // in BOTH spaces; the endpoint validates the target separately.
  targetSpaceId?: string
): Promise<AuthorizeOutput> {
  try {
    const res = await fetch('/api/chat/authorize-write', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ spaceId, toolName, ...(targetSpaceId ? { targetSpaceId } : {}) }),
      signal,
    });
    // Any non-2xx surfaces as lookup_failed. Trust only well-formed 200
    // responses (the endpoint always returns 200 + EditToolFailure for the
    // expected denial paths; non-200 means a transport / build / server fault).
    if (!res.ok) {
      console.error('[chat/edit-dispatcher] authorize-write non-ok', res.status);
      return lookupFailed();
    }
    return (await res.json()) as AuthorizeOutput;
  } catch (err) {
    if ((err as { name?: string })?.name === 'AbortError') {
      return lookupFailed();
    }
    console.error('[chat/edit-dispatcher] authorize-write threw', err);
    return lookupFailed();
  }
}

// AddToolResult signature mirrors the one in read-dispatcher.ts: we erase the
// SDK's tool-name-to-output union typing because the dispatcher is shared with
// non-UI codepaths. Caller (the widget) casts useChat's typed addToolResult.
export type AddEditToolResultFn = (args: { tool: string; toolCallId: string; output: unknown }) => void;

// Plans + applies edit intents exactly once (deduped by toolCallId). Each
// pending write enqueues onto the shared module-scoped queue (see
// apply-queue.ts), so concurrent writes within a turn — and reads in the same
// turn — observe one another's applied state.
export function useEditDispatcher(
  messages: UIMessage[],
  addToolResultRef: React.RefObject<AddEditToolResultFn | null>
) {
  const { setEditable } = useEditable();
  const setEditorContentVersion = useSetAtom(editorContentVersionAtom);
  const dispatchedRef = React.useRef(new Set<string>());
  const cancelledRef = React.useRef(false);
  // Single controller per mount. Aborted on unmount so any pending
  // authorize-write fetch is dropped instead of resolving against a torn-down
  // dispatcher.
  const abortRef = React.useRef<AbortController | null>(null);

  React.useEffect(() => {
    // Reset on remount so StrictMode double-mount or a kept-mounted New Chat
    // resumes processing. The dispatchedRef Set guards against double-apply.
    cancelledRef.current = false;
    abortRef.current = new AbortController();
    return () => {
      cancelledRef.current = true;
      abortRef.current?.abort();
    };
  }, []);

  React.useEffect(() => {
    const bumpEditorVersion = () => setEditorContentVersion(v => v + 1);

    for (const message of messages) {
      if (message.role !== 'assistant') continue;
      for (const part of message.parts) {
        if (!isToolUIPart(part)) continue;
        const toolName = writeToolNameFromPartType(part.type);
        if (!toolName) continue;
        // input-available means the model finished streaming arguments and
        // the SDK is waiting for our result. The server registers write tools
        // schema-only, so the SDK never auto-fills an output for them.
        if (part.state !== 'input-available') continue;
        if (dispatchedRef.current.has(part.toolCallId)) continue;
        dispatchedRef.current.add(part.toolCallId);

        const input = (part as { input?: Record<string, unknown> }).input ?? {};
        const toolCallId = part.toolCallId;
        const inputSpaceId = typeof input.spaceId === 'string' ? input.spaceId : undefined;
        const inputTargetSpaceId = typeof input.targetSpaceId === 'string' ? input.targetSpaceId : undefined;

        enqueue(async () => {
          if (cancelledRef.current) return;

          // Lazy controller fallback in case the mount-effect hasn't run yet
          // (StrictMode double-invoke ordering edge case).
          const signal = (abortRef.current ??= new AbortController()).signal;
          const auth = await authorizeWrite(inputSpaceId, toolName, signal, inputTargetSpaceId);
          if (cancelledRef.current) return;
          if (auth.ok !== true) {
            addToolResultRef.current?.({ tool: toolName, toolCallId, output: auth });
            return;
          }

          const ctx = { store, cache: queryClient };
          const planned: EditToolOutput = await planWriteTool(toolName, input, ctx);
          if (cancelledRef.current) return;
          if (!planned.ok) {
            addToolResultRef.current?.({ tool: toolName, toolCallId, output: planned });
            return;
          }

          let applyResult: ApplyResult;
          try {
            applyResult = await applyIntent(planned.intent, { setEditable, bumpEditorVersion });
          } catch (err) {
            console.error('[chat/edit-dispatcher] applyIntent threw', err);
            addToolResultRef.current?.({ tool: toolName, toolCallId, output: lookupFailed() });
            return;
          }
          if (cancelledRef.current) return;
          if (!applyResult.ok) {
            // Forward apply_failed verbatim — the planner verified the inputs;
            // failure here means the live graph doesn't match what the model
            // assumed (a hallucinated id, or a mid-turn graph change).
            addToolResultRef.current?.({ tool: toolName, toolCallId, output: applyResult });
            return;
          }

          if (EDITOR_REFRESHING_INTENTS.has(planned.intent.kind)) {
            bumpEditorVersion();
          }
          addToolResultRef.current?.({
            tool: toolName,
            toolCallId,
            output: { ok: true, intent: planned.intent },
          });
        });
      }
    }
  }, [messages, setEditable, setEditorContentVersion, addToolResultRef]);
}
