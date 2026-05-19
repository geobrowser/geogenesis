'use client';

import { IdUtils, Position, SystemIds } from '@geoprotocol/geo-sdk/lite';

import * as React from 'react';

import { type UIMessage, isToolUIPart } from 'ai';
import { useSetAtom } from 'jotai';

import { browseModeToggled, editModeToggled } from '~/core/analytics';
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

// Intents that need the Tiptap editor to reset — in edit mode it ignores
// store changes unless the version atom is bumped.
const EDITOR_REFRESHING_INTENTS = new Set<EditIntent['kind']>([
  'createBlock',
  'createBlocks',
  'updateBlock',
  'deleteBlock',
  'moveBlock',
  'deleteEntity',
  'moveEntityToSpace',
  'cloneEntityToSpace',
  'createTab',
  'renameTab',
]);

function applyToggleEditMode(intent: Extract<EditIntent, { kind: 'toggleEditMode' }>, ctx: ApplyCtx): ApplyResult {
  ctx.setEditable(intent.mode === 'edit');
  if (intent.mode === 'edit') {
    editModeToggled({ toggle_trigger: 'assistant_tool' });
  } else {
    browseModeToggled({ toggle_trigger: 'assistant_tool' });
  }
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

async function resolveEntity(entityId: string, spaceId: string | undefined): Promise<Entity | null> {
  try {
    return await E.findOne({ id: entityId, spaceId, store, cache: queryClient });
  } catch (err) {
    console.error('[chat/edit-dispatcher] entity lookup failed', entityId, err);
    return null;
  }
}

// Deletes are idempotent: a missing target is a no-op success.
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

// Mints an Image entity from a source URL and writes the link relation via
// the same `storage.images.createAndLink` helper the in-page editor uses for
// file uploads. http(s) URLs go through /api/chat/proxy-image (CORS); ipfs://
// URLs short-circuit since they're already pinned.
async function applySetEntityImage(intent: Extract<EditIntent, { kind: 'setEntityImage' }>): Promise<ApplyResult> {
  const { entityId, entityName, spaceId, propertyId, propertyName, sourceUrl } = intent;

  // Replace, don't stack: tombstone any existing same-property image relations
  // on this entity in this space first. Mirrors the in-page editor's behavior
  // (see image-node `handleChange`). Without this, useRelation returns the
  // first match — typically the published one — and the gallery / cover hook
  // ignores the new local relation entirely.
  const existing = await resolveEntity(entityId, spaceId);
  const oldImageRelations = (existing?.relations ?? []).filter(
    r => r.fromEntity.id === entityId && r.type.id === propertyId && r.spaceId === spaceId && !r.isDeleted
  );
  for (const old of oldImageRelations) {
    storage.relations.delete(old);
  }

  if (sourceUrl.toLowerCase().startsWith('ipfs://')) {
    // Already pinned — mint an Image entity that reuses the existing CID and
    // link it. We can't pass an ipfs:// URL into Graph.createImage because the
    // SDK does a browser fetch on `{ url }`, which doesn't speak ipfs.
    const imageEntityId = IdUtils.generate();
    storage.values.set({
      spaceId,
      entity: { id: imageEntityId, name: null },
      property: {
        id: SystemIds.IMAGE_URL_PROPERTY,
        name: 'Image URL',
        dataType: 'TEXT',
        renderableType: 'URL',
      },
      value: sourceUrl,
    });
    storage.relations.set({
      id: IdUtils.generate(),
      entityId: IdUtils.generate(),
      spaceId,
      position: Position.generate(),
      renderableType: 'RELATION',
      type: { id: SystemIds.TYPES_PROPERTY, name: 'Types' },
      fromEntity: { id: imageEntityId, name: null },
      toEntity: { id: SystemIds.IMAGE_TYPE, name: 'Image', value: SystemIds.IMAGE_TYPE },
    });
    storage.relations.set({
      id: IdUtils.generate(),
      entityId: IdUtils.generate(),
      spaceId,
      position: Position.generate(),
      renderableType: 'IMAGE',
      type: { id: propertyId, name: propertyName },
      fromEntity: { id: entityId, name: entityName },
      toEntity: { id: imageEntityId, name: null, value: imageEntityId },
    });
    return { ok: true };
  }

  // Proxy through /api/chat/proxy-image — direct browser fetch is CORS-blocked
  // on most public image hosts (Wikimedia, IMDb, TMDb).
  let blob: Blob;
  try {
    const response = await fetch('/api/chat/proxy-image', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url: sourceUrl }),
    });
    if (!response.ok) {
      const body = await response.json().catch(() => null);
      const reason =
        body && typeof body === 'object' && 'error' in body ? String(body.error) : `HTTP ${response.status}`;
      return applyFailed(`image fetch failed: ${reason}; try a different URL`);
    }
    blob = await response.blob();
  } catch (err) {
    console.error('[chat/edit-dispatcher] image proxy fetch failed', err);
    return applyFailed('image fetch failed; the proxy was unreachable');
  }
  const ext = blob.type.split('/')[1] || 'png';
  const file = new File([blob], `image.${ext}`, { type: blob.type });

  try {
    await storage.images.createAndLink({
      file,
      fromEntityId: entityId,
      fromEntityName: entityName,
      relationPropertyId: propertyId,
      relationPropertyName: propertyName,
      spaceId,
    });
  } catch (err) {
    console.error('[chat/edit-dispatcher] image upload failed', err);
    return applyFailed('image upload failed; try a different URL');
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
  // Merged view so new blocks land after untouched published siblings too.
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

// Scan the parent page's existing blocks for one whose IMAGE_URL_PROPERTY
// matches the URL we're about to add. Returns the matching block id when
// found, null otherwise. Used as a defense against double-fires of createBlock
// for the same image (e.g. retry-on-stream-error landing twice). Image and
// video blocks share the IMAGE_URL_PROPERTY slot at the graph level.
async function findExistingMediaBlock(parentEntityId: string, spaceId: string, url: string): Promise<string | null> {
  const parent = await resolveEntity(parentEntityId, spaceId);
  const childBlockIds = (parent?.relations ?? [])
    .filter(r => r.fromEntity.id === parentEntityId && r.type.id === SystemIds.BLOCKS && !r.isDeleted)
    .map(r => r.toEntity.id);
  if (childBlockIds.length === 0) return null;

  const blocks = await Promise.all(childBlockIds.map(id => resolveEntity(id, spaceId)));
  for (const block of blocks) {
    if (!block) continue;
    const urlValue = block.values.find(
      v => v.property.id === SystemIds.IMAGE_URL_PROPERTY && v.spaceId === spaceId && !v.isDeleted
    );
    if (urlValue?.value === url) {
      return block.id;
    }
  }
  return null;
}

// Verify that a URL actually loads as an image in a browser `<img>` tag
// before we stage an image block with it. The model can hallucinate plausible-
// looking URLs (Wikipedia thumbnails, CDN paths) that don't resolve — without
// this, the page renders the broken-image placeholder and the user blames the
// upload. We use a transient `<img>` element rather than `fetch()` because
// image rendering bypasses CORS for cross-origin URLs that `fetch()` would
// reject: this catches truly broken URLs while still allowing legitimate
// CORS-restricted hosts (Wikipedia, IMDb) that render fine inline.
const IMAGE_PREFLIGHT_TIMEOUT_MS = 8_000;
function preflightImageUrl(url: string): Promise<boolean> {
  if (typeof window === 'undefined' || typeof Image === 'undefined') return Promise.resolve(true);
  const lower = url.toLowerCase();
  // ipfs:// URLs aren't loadable by `<img>` directly — the renderer translates
  // them to a gateway. Trust them and let the gateway handle errors at render.
  if (lower.startsWith('ipfs://')) return Promise.resolve(true);
  return new Promise(resolve => {
    let settled = false;
    const img = new Image();
    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      img.src = '';
      resolve(false);
    }, IMAGE_PREFLIGHT_TIMEOUT_MS);
    img.onload = () => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      // naturalWidth/Height=0 happens when the host returned HTML or an empty
      // body that the decoder treated as "loaded but unrenderable".
      resolve(img.naturalWidth > 0 && img.naturalHeight > 0);
    };
    img.onerror = () => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve(false);
    };
    img.src = url;
  });
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
      const name = content.title?.trim() ? content.title.trim() : 'Image';
      storage.relations.set(getRelationForBlockType(blockId, SystemIds.IMAGE_TYPE, spaceId));
      storage.values.set({
        spaceId,
        entity: { id: blockId, name },
        property: {
          id: SystemIds.IMAGE_URL_PROPERTY,
          name: 'IPFS URL',
          dataType: 'TEXT',
          renderableType: 'URL',
        },
        value: content.url,
      });
      // Always seed a name — leaving the block entity nameless rendered as a
      // bare URL pill in the editor.
      storage.entities.name.set(blockId, spaceId, name);
      break;
    }
    case 'video': {
      const name = content.title?.trim() ? content.title.trim() : 'Video';
      storage.relations.set(getRelationForBlockType(blockId, SystemIds.VIDEO_TYPE, spaceId));
      storage.values.set({
        spaceId,
        entity: { id: blockId, name },
        property: {
          id: SystemIds.IMAGE_URL_PROPERTY,
          name: 'IPFS URL',
          dataType: 'TEXT',
          renderableType: 'URL',
        },
        value: content.url,
      });
      storage.entities.name.set(blockId, spaceId, name);
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
      const dataTitle = content.title && content.title.trim().length > 0 ? content.title.trim() : 'New data';
      storage.entities.name.set(blockId, spaceId, dataTitle);
      break;
    }
  }
}

async function applyCreateBlock(intent: Extract<EditIntent, { kind: 'createBlock' }>): Promise<ApplyResult> {
  const { blockId, parentEntityId, spaceId, content } = intent;

  // Image / video blocks store the URL directly. Guard against two failure
  // modes the model is prone to:
  //   1. The same image URL already lives on this page — re-running the same
  //      tool call (after a retry / re-stream) would silently duplicate the
  //      block. Refuse same-URL re-adds so the page doesn't end up with two
  //      identical media blocks stacked on top of each other.
  //   2. The URL is broken / returns HTML / 0×0 — preflight via <img> tag.
  if (content.kind === 'image' || content.kind === 'video') {
    const duplicate = await findExistingMediaBlock(parentEntityId, spaceId, content.url);
    if (duplicate) {
      return applyFailed(
        `a ${content.kind} block with this URL is already on the page (block id: ${duplicate}); skip the duplicate or use updateBlock if you meant to change the existing one.`
      );
    }
  }
  if (content.kind === 'image') {
    const ok = await preflightImageUrl(content.url);
    if (!ok) {
      return applyFailed(
        `image URL didn't load as an image; try a different URL or run searchImages to find one. (failing url: ${content.url})`
      );
    }
  }

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
  // Sequential: each iteration must see the prior block's BLOCKS edge so
  // nextBlockPosition keeps appending. Bail on first failure.
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
      // Gate on source !== undefined so a title-only update doesn't clobber
      // the existing source.
      if (content.source !== undefined) {
        const blockEntity = await resolveEntity(blockId, spaceId);
        if (!blockEntity) {
          // Bail rather than write — leaving the old edge plus a new one
          // would produce two competing source relations.
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

  const [blockEntity, parentEntity] = await Promise.all([
    resolveEntity(blockId, spaceId),
    resolveEntity(parentEntityId, spaceId),
  ]);

  // Resolve the BLOCKS edge before mutating: missing edge + tombstoned
  // block values would leave the parent pointing at an empty block.
  let blocksEdge = (parentEntity?.relations ?? []).find(
    relation =>
      relation.fromEntity.id === parentEntityId &&
      relation.toEntity.id === blockId &&
      relation.type.id === SystemIds.BLOCKS &&
      relation.spaceId === spaceId &&
      !relation.isDeleted
  );
  // Fallback to the relation index for edges the merged parent record missed.
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

  // The block-relation entity carries VIEW_PROPERTY / FILTER for data blocks;
  // tombstone those too or they linger pointing at a dead block.
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
  // Resolve first — a hallucinated blockId would otherwise write a FILTER
  // onto an unrelated entity.
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
  // VIEW_PROPERTY lives on the BLOCKS-relation entity, not the block itself.
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
    // Bail — without tombstoning the current VIEW edge we'd leave two
    // conflicting relations.
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
  // SHOWN_COLUMNS / PROPERTIES live on the BLOCKS-relation entity, not the block.
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
  // Full replacement, not merge — same semantics as setDataBlockFilters.
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

  // Position.generateBetween chains keep the array order stable on publish.
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

// Defensive cap against pathological cycles; well past organic nesting.
const DELETE_ENTITY_MAX_DEPTH = 5;

async function applyDeleteEntityRecursive(
  entityId: string,
  spaceId: string,
  depth: number,
  visited: Set<string>,
  // Default cascades backlinks across every space (editor parity for delete).
  // Move-from-source scopes them to the source space.
  scopeBacklinksToSpace = false
): Promise<ApplyResult> {
  if (depth > DELETE_ENTITY_MAX_DEPTH) {
    return applyFailed(`delete cascade exceeded max depth ${DELETE_ENTITY_MAX_DEPTH} starting at ${entityId}`);
  }
  if (visited.has(entityId)) return { ok: true };
  visited.add(entityId);

  const entity = await resolveEntity(entityId, spaceId);
  if (!entity) {
    // Top of cascade fails loudly; recursive children no-op.
    if (depth === 0) return applyFailed(`entity ${entityId} not found in space ${spaceId}`);
    return { ok: true };
  }

  for (const value of entity.values ?? []) {
    if (value.spaceId === spaceId && !value.isDeleted) {
      storage.values.delete(value);
    }
  }

  const outgoingRelations = (entity.relations ?? []).filter(
    r => r.fromEntity.id === entityId && r.spaceId === spaceId && !r.isDeleted
  );
  for (const relation of outgoingRelations) {
    storage.relations.delete(relation);
  }

  const backlinks = store.getRelationsToEntity(entityId, scopeBacklinksToSpace ? spaceId : undefined);
  const seenBacklinks = new Set(outgoingRelations.map(r => r.id));
  for (const relation of backlinks) {
    if (seenBacklinks.has(relation.id)) continue;
    if (relation.isDeleted) continue;
    storage.relations.delete(relation);
  }

  // Cascade to orphaned BLOCKS children only — shared blocks survive.
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

// Properties are entities — same cascade. Backlinks (every value/relation
// that uses the property) tombstone too, matching editor semantics.
async function applyDeleteProperty(intent: Extract<EditIntent, { kind: 'deleteProperty' }>): Promise<ApplyResult> {
  return applyDeleteEntityRecursive(intent.propertyId, intent.spaceId, 0, new Set());
}

// Copies values + outgoing relations from source to target, deduping against
// existing target data. Mirrors the editor's cloneEntityIntoSpace; used by
// both move and clone.
async function copyEntityIntoSpace(
  entityId: string,
  sourceSpaceId: string,
  targetSpaceId: string,
  sourceEntity: Entity
) {
  // Resolve target separately so dedup has something to compare against;
  // the source view is space-scoped and won't include target-space data.
  const targetEntity = await resolveEntity(entityId, targetSpaceId);
  const existingTargetValueIds = new Set(
    (targetEntity?.values ?? []).filter(v => v.spaceId === targetSpaceId && !v.isDeleted).map(v => v.id)
  );
  const existingTargetRelationSignatures = new Set(
    (targetEntity?.relations ?? [])
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
  await copyEntityIntoSpace(intent.entityId, intent.spaceId, intent.targetSpaceId, sourceEntity);
  return { ok: true };
}

async function applyMoveEntityToSpace(
  intent: Extract<EditIntent, { kind: 'moveEntityToSpace' }>
): Promise<ApplyResult> {
  // Editor parity: clone, then tombstone in source (orphan-block cascade
  // included). Child blocks are intentionally NOT cloned.
  const sourceEntity = await resolveEntity(intent.entityId, intent.spaceId);
  if (!sourceEntity) {
    return applyFailed(`entity ${intent.entityId} not found in space ${intent.spaceId}`);
  }
  await copyEntityIntoSpace(intent.entityId, intent.spaceId, intent.targetSpaceId, sourceEntity);
  // scopeBacklinksToSpace=true so only source-space backlinks tombstone.
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

  // The new dataType may need a different renderable; clear the old one.
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

  // Register in the store so getProperty / getStableDataType see it now.
  storage.properties.setDataType(propertyId, dataType);

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

  // Append after the last existing tab. Falls back to the relation index so a
  // freshly-created sibling in the same turn is ordered correctly.
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

// Excludes the moving relation by object identity — legacy data can have
// two siblings sharing the same fractional-index.
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
  const next = index < sorted.length - 1 ? sorted[index + 1] : null;
  return Position.generateBetween(refPos, next ?? null);
}

async function applyMoveBlock(intent: Extract<EditIntent, { kind: 'moveBlock' }>): Promise<ApplyResult> {
  const { blockId, parentEntityId, spaceId, position } = intent;

  const parent = await resolveEntity(parentEntityId, spaceId);
  let blocksRelations = (parent?.relations ?? []).filter(
    r => r.fromEntity.id === parentEntityId && r.type.id === SystemIds.BLOCKS && r.spaceId === spaceId && !r.isDeleted
  );
  // Merge in locally-staged siblings the parent record may have missed.
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

  // Upsert by relation.id so VIEW_PROPERTY / filter relations on the same
  // block-relation entity survive the move.
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
    case 'setEntityImage':
      return applySetEntityImage(intent);
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
  // Cross-space tools need both spaces validated.
  targetSpaceId?: string
): Promise<AuthorizeOutput> {
  try {
    const res = await fetch('/api/chat/authorize-write', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ spaceId, toolName, ...(targetSpaceId ? { targetSpaceId } : {}) }),
      signal,
    });
    // Endpoint returns 200 + EditToolFailure for expected denials; non-200
    // is transport/server fault — surface as lookup_failed.
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

// Widened from useChat's typed addToolResult so the same ref serves reads + writes.
export type AddEditToolResultFn = (args: { tool: string; toolCallId: string; output: unknown }) => void;

// Plans + applies edit intents exactly once per toolCallId. Pending writes
// enqueue onto the shared apply-queue so concurrent writes (and reads in the
// same turn) observe each other's applied state.
export function useEditDispatcher(
  messages: UIMessage[],
  addToolResultRef: React.RefObject<AddEditToolResultFn | null>
) {
  const { setEditable } = useEditable();
  const setEditorContentVersion = useSetAtom(editorContentVersionAtom);
  const dispatchedRef = React.useRef(new Set<string>());
  const cancelledRef = React.useRef(false);
  // Aborted on unmount so pending fetches don't resolve against a torn-down
  // dispatcher.
  const abortRef = React.useRef<AbortController | null>(null);

  React.useEffect(() => {
    // Reset on remount so StrictMode double-mount resumes processing;
    // dispatchedRef still guards against double-apply.
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
        // input-available = args fully streamed, SDK waiting for our output.
        if (part.state !== 'input-available') continue;
        if (dispatchedRef.current.has(part.toolCallId)) continue;
        dispatchedRef.current.add(part.toolCallId);

        const input = (part as { input?: Record<string, unknown> }).input ?? {};
        const toolCallId = part.toolCallId;
        const inputSpaceId = typeof input.spaceId === 'string' ? input.spaceId : undefined;
        const inputTargetSpaceId = typeof input.targetSpaceId === 'string' ? input.targetSpaceId : undefined;

        enqueue(async () => {
          if (cancelledRef.current) return;

          // Lazy controller for the StrictMode pre-mount-effect window.
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
          // No cancellation gate past this point — the mutation has landed,
          // so the model has to hear about it or the turn hangs forever.
          if (!applyResult.ok) {
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
