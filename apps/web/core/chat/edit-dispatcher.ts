'use client';

import { IdUtils, Position, SystemIds } from '@geoprotocol/geo-sdk/lite';

import * as React from 'react';

import { type UIMessage, isToolUIPart } from 'ai';
import { useSetAtom } from 'jotai';

import { toGeoFilterState } from '~/core/blocks/data/filters';
import { makeInitialDataEntityRelations } from '~/core/blocks/data/initialize';
import { makeRelationForSourceType } from '~/core/blocks/data/source';
import { EntityId } from '~/core/io/substream-schema';
import { queryClient } from '~/core/query-client';
import { useEditable } from '~/core/state/editable-store';
import { getRelationForBlockType } from '~/core/state/editor/block-types';
import { E } from '~/core/sync/orm';
import { storage } from '~/core/sync/use-mutate';
import { store } from '~/core/sync/use-sync-engine';
import type { Entity, Relation } from '~/core/types';

import {
  type BlockContent,
  type DataBlockView,
  type EditIntent,
  type EditToolOutput,
  type RelativePosition,
  isEditToolPartType,
} from './edit-types';
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
]);

function applyToggleEditMode(intent: Extract<EditIntent, { kind: 'toggleEditMode' }>, ctx: ApplyCtx) {
  ctx.setEditable(intent.mode === 'edit');
}

function applySetValue(intent: Extract<EditIntent, { kind: 'setValue' }>) {
  storage.values.set({
    spaceId: intent.spaceId,
    entity: { id: intent.entityId, name: intent.entityName ?? null },
    property: { id: intent.propertyId, name: intent.propertyName, dataType: intent.dataType },
    value: intent.value,
  });
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

async function applyDeleteValue(intent: Extract<EditIntent, { kind: 'deleteValue' }>) {
  const entity = await resolveEntity(intent.entityId, intent.spaceId);
  const match = entity?.values.find(
    v => v.property.id === intent.propertyId && v.spaceId === intent.spaceId && !v.isDeleted
  );
  if (match) storage.values.delete(match);
}

function applySetRelation(intent: Extract<EditIntent, { kind: 'setRelation' }>) {
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
}

async function applyDeleteRelation(intent: Extract<EditIntent, { kind: 'deleteRelation' }>) {
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
}

function applyCreateProperty(intent: Extract<EditIntent, { kind: 'createProperty' }>) {
  storage.properties.create({
    entityId: intent.propertyId,
    spaceId: intent.spaceId,
    name: intent.name,
    dataType: intent.dataType,
    renderableTypeId: intent.renderableTypeId,
  });
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

async function applyCreateBlock(intent: Extract<EditIntent, { kind: 'createBlock' }>) {
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
}

async function applyCreateBlocks(intent: Extract<EditIntent, { kind: 'createBlocks' }>) {
  // Sequential — each iteration must observe the prior block's BLOCKS edge
  // so nextBlockPosition keeps appending instead of stacking on the same key.
  for (const { blockId, content } of intent.blocks) {
    await applyCreateBlock({
      kind: 'createBlock',
      parentEntityId: intent.parentEntityId,
      spaceId: intent.spaceId,
      blockId,
      content,
    });
  }
}

async function applyUpdateBlock(intent: Extract<EditIntent, { kind: 'updateBlock' }>) {
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
      break;
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
      break;
    }
    case 'data': {
      // Gate on source !== undefined: a title-only update would otherwise
      // clobber the existing source (e.g. GEO → COLLECTION).
      if (content.source !== undefined) {
        const blockEntity = await resolveEntity(blockId, spaceId);
        if (!blockEntity) {
          // Bail rather than write a new source: without tombstoning the old
          // edge we'd leave two competing source relations on the block.
          console.error('[chat/edit-dispatcher] updateBlock: block not found', { blockId, spaceId });
          return;
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
      break;
    }
  }
}

async function applyDeleteBlock(intent: Extract<EditIntent, { kind: 'deleteBlock' }>) {
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
  const blocksEdge = (parentEntity?.relations ?? []).find(
    relation =>
      relation.fromEntity.id === parentEntityId &&
      relation.toEntity.id === blockId &&
      relation.type.id === SystemIds.BLOCKS &&
      relation.spaceId === spaceId &&
      !relation.isDeleted
  );
  if (!blocksEdge) {
    console.error('[chat/edit-dispatcher] deleteBlock: no BLOCKS edge under parent — aborting to avoid orphan', {
      blockId,
      parentEntityId,
      spaceId,
      parentResolved: parentEntity !== null,
    });
    return;
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
}

async function applySetDataBlockFilters(intent: Extract<EditIntent, { kind: 'setDataBlockFilters' }>) {
  // Resolve the block first: a hallucinated blockId would otherwise write a
  // FILTER onto an unrelated entity.
  const block = await resolveEntity(intent.blockId, intent.spaceId);
  if (!block) {
    console.error('[chat/edit-dispatcher] setDataBlockFilters: block not found', {
      blockId: intent.blockId,
      spaceId: intent.spaceId,
    });
    return;
  }

  const encoded = intent.filters.length === 0 ? '' : toGeoFilterState(intent.filters, intent.mode);

  storage.values.set({
    spaceId: intent.spaceId,
    entity: { id: intent.blockId, name: null },
    property: { id: SystemIds.FILTER, name: 'Filter', dataType: 'TEXT' },
    value: encoded,
  });
}

async function applySetDataBlockView(intent: Extract<EditIntent, { kind: 'setDataBlockView' }>) {
  // VIEW_PROPERTY hangs off the BLOCKS-relation entity, not the block itself.
  const { blockId, parentEntityId, spaceId, view } = intent;

  const parent = await resolveEntity(parentEntityId, spaceId);
  const blocksRelation = (parent?.relations ?? []).find(
    r =>
      r.fromEntity.id === parentEntityId &&
      r.type.id === SystemIds.BLOCKS &&
      r.toEntity.id === blockId &&
      r.spaceId === spaceId &&
      !r.isDeleted
  );
  if (!blocksRelation) {
    console.error('[chat/edit-dispatcher] setDataBlockView: no BLOCKS relation', { parentEntityId, blockId, spaceId });
    return;
  }
  const blockRelationEntityId = blocksRelation.entityId;

  const relationEntity = await resolveEntity(blockRelationEntityId, spaceId);
  if (!relationEntity) {
    // Bail rather than write: without tombstoning the current VIEW edge we'd
    // leave two conflicting VIEW relations.
    console.error('[chat/edit-dispatcher] setDataBlockView: block-relation entity not found — aborting', {
      blockRelationEntityId,
      spaceId,
    });
    return;
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
}

function applyCreateEntity(intent: Extract<EditIntent, { kind: 'createEntity' }>) {
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

async function applyMoveBlock(intent: Extract<EditIntent, { kind: 'moveBlock' }>) {
  const { blockId, parentEntityId, spaceId, position } = intent;

  const parent = await resolveEntity(parentEntityId, spaceId);
  const blocksRelations = (parent?.relations ?? []).filter(
    r => r.fromEntity.id === parentEntityId && r.type.id === SystemIds.BLOCKS && r.spaceId === spaceId && !r.isDeleted
  );
  const moving = blocksRelations.find(r => r.toEntity.id === blockId);
  if (!moving) {
    console.error('[chat/edit-dispatcher] moveBlock: block not found under parent', { parentEntityId, blockId });
    return;
  }

  const newPosition = computeRelativePosition(blocksRelations, moving, position, () =>
    blocksRelations.find(
      r => r.toEntity.id === (position.kind === 'before' || position.kind === 'after' ? position.referenceId : '')
    )
  );
  if (!newPosition) {
    console.error('[chat/edit-dispatcher] moveBlock: could not compute new position', { intent });
    return;
  }

  // Upsert by relation.id so block-relation entity id (and VIEW_PROPERTY /
  // filter relations hanging off it) survive the move.
  storage.relations.set({ ...moving, position: newPosition });
}

async function applyMoveRelation(intent: Extract<EditIntent, { kind: 'moveRelation' }>) {
  const { fromEntityId, typeId, toEntityId, spaceId, position } = intent;

  const from = await resolveEntity(fromEntityId, spaceId);
  const siblings = (from?.relations ?? []).filter(
    r => r.fromEntity.id === fromEntityId && r.type.id === typeId && r.spaceId === spaceId && !r.isDeleted
  );
  const moving = siblings.find(r => r.toEntity.id === toEntityId);
  if (!moving) {
    console.error('[chat/edit-dispatcher] moveRelation: relation not found', { fromEntityId, typeId, toEntityId });
    return;
  }

  const newPosition = computeRelativePosition(siblings, moving, position, () =>
    siblings.find(
      r => r.toEntity.id === (position.kind === 'before' || position.kind === 'after' ? position.referenceId : '')
    )
  );
  if (!newPosition) {
    console.error('[chat/edit-dispatcher] moveRelation: could not compute new position', { intent });
    return;
  }

  storage.relations.set({ ...moving, position: newPosition });
}

export async function applyIntent(intent: EditIntent, ctx: ApplyCtx): Promise<void> {
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
  }
}

// Applies edit intents exactly once (deduped by toolCallId). Sequential
// promise chain ensures createBlock completes before follow-ups like
// setDataBlockView resolve.
export function useEditDispatcher(messages: UIMessage[]) {
  const { setEditable } = useEditable();
  const setEditorContentVersion = useSetAtom(editorContentVersionAtom);
  const dispatchedRef = React.useRef(new Set<string>());
  const applyChainRef = React.useRef<Promise<void>>(Promise.resolve());
  const cancelledRef = React.useRef(false);

  React.useEffect(() => {
    // Reset on remount so StrictMode double-mount or a kept-mounted New Chat
    // resumes processing. The dispatchedRef Set guards against double-apply.
    cancelledRef.current = false;
    return () => {
      cancelledRef.current = true;
    };
  }, []);

  React.useEffect(() => {
    const bumpEditorVersion = () => setEditorContentVersion(v => v + 1);

    for (const message of messages) {
      if (message.role !== 'assistant') continue;
      for (const part of message.parts) {
        if (!isToolUIPart(part)) continue;
        if (!isEditToolPartType(part.type)) continue;
        if (part.state !== 'output-available') continue;
        if (dispatchedRef.current.has(part.toolCallId)) continue;
        dispatchedRef.current.add(part.toolCallId);

        const output = part.output as EditToolOutput | undefined;
        if (!output || !output.ok) continue;

        const intent = output.intent;
        applyChainRef.current = applyChainRef.current
          .then(() => {
            if (cancelledRef.current) return;
            return applyIntent(intent, { setEditable, bumpEditorVersion });
          })
          .then(() => {
            if (cancelledRef.current) return;
            // In edit mode Tiptap ignores store changes; bump the version
            // atom so it recreates from the current editorJson.
            if (EDITOR_REFRESHING_INTENTS.has(intent.kind)) {
              bumpEditorVersion();
            }
          })
          .catch(err => {
            console.error('[chat/edit-dispatcher] failed to apply intent', intent, err);
          });
      }
    }
  }, [messages, setEditable, setEditorContentVersion]);
}
