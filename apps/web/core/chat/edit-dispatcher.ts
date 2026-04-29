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
// version atom is bumped. Data block filter / view changes are rendered by
// React node-views that subscribe to the store directly, so they don't need
// a Tiptap recreate.
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

// The local store only holds values the user has modified this session;
// server-hydrated data isn't there until something reads it in. Use E.findOne
// to merge local + remote so deletes work on published data too.
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
  // Pull from the merged local+remote view so we don't ignore published blocks
  // the user hasn't touched this session and jam the new one at the top.
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
      // Default source to COLLECTION on create when the model omits it.
      const source = content.source ?? 'COLLECTION';
      if (source === 'COLLECTION') {
        for (const relation of makeInitialDataEntityRelations(EntityId(blockId), spaceId)) {
          storage.relations.set(relation);
        }
      } else {
        // Map 'QUERY' → SPACES source and 'GEO' → GEO source.
        const sourceKind = source === 'QUERY' ? 'SPACES' : 'GEO';
        storage.relations.set(makeRelationForSourceType(sourceKind, blockId, spaceId));
        storage.relations.set(getRelationForBlockType(blockId, SystemIds.DATA_BLOCK, spaceId));
      }
      // Data blocks render their entity name as the block header. The in-UI
      // flow auto-fills "New data" when the user inserts one; we mirror that
      // by defaulting the title when the assistant omits it, so the published
      // block never ships with a blank header.
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

  // For data blocks, set the initial view on the block-relation entity.
  // Default to TABLE when the model doesn't specify one on creation.
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
      // Update only the fields the caller supplied. Re-writing the source
      // relation when the model passes nothing but a new title would clobber
      // the existing source (e.g. turn a GEO block into a COLLECTION one) —
      // so gate it on `content.source !== undefined`.
      if (content.source !== undefined) {
        const blockEntity = await resolveEntity(blockId, spaceId);
        if (!blockEntity) {
          // Can't tombstone the old source if we never found it — writing a
          // new source relation anyway would leave two competing edges on the
          // block. Bail loudly instead of producing a broken block.
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

  // Fetch local+remote state for both the block (to drop its values + outgoing
  // relations) and the parent page (to drop the BLOCKS relation that hangs the
  // block off the page). Using E.findOne instead of the local store because a
  // published block isn't in reactiveValues/reactiveRelations until something
  // else read it in.
  const [blockEntity, parentEntity] = await Promise.all([
    resolveEntity(blockId, spaceId),
    resolveEntity(parentEntityId, spaceId),
  ]);

  // CRITICAL: find the page → block BLOCKS edge *before* touching the block's
  // contents. If we can't find it (wrong parentEntityId, block not under this
  // page, or parent entity missing), bail without tombstoning anything.
  // Otherwise we'd orphan the block — its values and outgoing relations would
  // be nuked while the parent's BLOCKS edge still points at the (now empty)
  // block entity, producing a broken stub on the published page.
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

  // The block-relation entity (the entity id on the BLOCKS edge itself) holds
  // the VIEW_PROPERTY edge and any FILTER value for data blocks. Tombstone its
  // outgoing edges and values too — otherwise they linger as dead edges
  // pointing at the now-deleted block.
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
  // Resolve the block first so a hallucinated / typo'd blockId doesn't write a
  // stray FILTER value onto an unrelated entity id. Blocks staged earlier in
  // the same session resolve via the merged local+remote view, so this is
  // compatible with setDataBlockFilters called right after createBlock.
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
  // The VIEW_PROPERTY relation hangs off the BLOCKS relation's entity, not the
  // block itself. Resolve that entity from the parent's merged relations so
  // this works both for published blocks and for ones staged earlier in the
  // same session (reactiveRelations picks up the staged BLOCKS edge that live
  // GraphQL doesn't see yet).
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
    // If we can't see the block-relation entity yet we can't tombstone the
    // current VIEW edge. Writing a new one would leave two conflicting VIEW
    // relations (renders unpredictably). Bail and log.
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

// Finds the new position string relative to a sibling set. The moving relation
// is excluded by object identity (not position equality) — legacy data can
// have two siblings sharing the same fractional-index, so filtering on
// position string alone could drop the wrong relation.
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

  // Upsert by the same relation.id so block-relation entity id (and the
  // VIEW_PROPERTY / filter relations hanging off it) survive the move.
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

/**
 * Watches assistant messages for edit-tool outputs and applies each intent
 * exactly once. Dedupes by toolCallId so re-renders don't re-apply.
 *
 * Intents are applied *sequentially* through a shared promise chain —
 * concurrent apply() would let a follow-up like setDataBlockView resolve its
 * E.findOne before the preceding createBlock had staged its BLOCKS relation,
 * leaving the view silently unset.
 *
 * On unmount the chain short-circuits: any queued intent that hasn't started
 * yet is dropped instead of mutating the store after the widget closes / the
 * user starts a new chat.
 */
export function useEditDispatcher(messages: UIMessage[]) {
  const { setEditable } = useEditable();
  const setEditorContentVersion = useSetAtom(editorContentVersionAtom);
  const dispatchedRef = React.useRef(new Set<string>());
  const applyChainRef = React.useRef<Promise<void>>(Promise.resolve());
  const cancelledRef = React.useRef(false);

  React.useEffect(() => {
    // A previous unmount may have set this true; reset on (re)mount so a
    // remount under StrictMode (or a New Chat that keeps the widget mounted)
    // resumes processing. The Set ref already guards against re-applying any
    // already-dispatched toolCallId.
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
            // In edit mode Tiptap ignores store changes — bump the version atom
            // so it recreates with the current editorJson and reflects any
            // blocks the assistant added / removed / retyped.
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
