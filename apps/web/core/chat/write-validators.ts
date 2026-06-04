// Client-side planning + validation for write tools. The dispatcher calls
// planWriteTool() per assistant tool call: it builds an EditIntent (or returns
// an EditToolFailure) by resolving target entities/properties against the
// merged local + remote graph, so locally-minted props/entities/blocks are
// addressable just like published ones. Validators check local store first,
// then ORM merge, with the final remote hop handled inside E.findOne /
// cache.fetchQuery.
import { IdUtils, SystemIds } from '@geoprotocol/geo-sdk/lite';
import type { QueryClient } from '@tanstack/react-query';

import * as Effect from 'effect/Effect';

import type { Filter, FilterMode } from '~/core/blocks/data/filters';
import { ID } from '~/core/id';
import { getEntity, getProperty, getSpace } from '~/core/io/queries';
import { E } from '~/core/sync/orm';
import { GeoStore } from '~/core/sync/store';
import type { Entity, Property, SwitchableRenderableType } from '~/core/types';
import { mapPropertyType } from '~/core/utils/property/properties';
import type { FilterableValueType } from '~/core/value-types';

import {
  type BlockContent,
  type DataBlockSource,
  type DataBlockView,
  type EditToolFailure,
  type EditToolOutput,
  alreadyExists,
  invalid,
  lookupFailed,
  notFound,
  wrongType,
} from './edit-types';

const MAX_VALUE_CHARS = 10_000;
const MAX_NAME_CHARS = 200;
const MAX_DESCRIPTION_CHARS = 2_000;
const MAX_TYPES = 5;
const MAX_MARKDOWN_CHARS = 20_000;
const MAX_URL_CHARS = 2_048;
const MAX_AUTO_SPLIT_LINES = 30;

const DATA_VIEWS: readonly DataBlockView[] = ['TABLE', 'LIST', 'GALLERY', 'BULLETED_LIST'];
const DATA_SOURCES: readonly DataBlockSource[] = ['COLLECTION', 'QUERY', 'GEO'];
const PROPERTY_TYPES: readonly SwitchableRenderableType[] = [
  'TEXT',
  'URL',
  'RELATION',
  'IMAGE',
  'VIDEO',
  'BOOLEAN',
  'INTEGER',
  'FLOAT',
  'DECIMAL',
  'DATE',
  'DATETIME',
  'TIME',
  'POINT',
  'GEO_LOCATION',
  'PLACE',
  'ADDRESS',
];
const VALUE_TYPES: readonly FilterableValueType[] = [
  'TEXT',
  'INTEGER',
  'FLOAT',
  'DECIMAL',
  'BOOLEAN',
  'DATE',
  'DATETIME',
  'TIME',
  'POINT',
  'RELATION',
];

const DASHLESS_UUID = /^[a-f0-9]{32}$/i;
const DASHED_UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;

export function isEntityId(value: unknown): value is string {
  if (typeof value !== 'string') return false;
  return DASHLESS_UUID.test(value) || DASHED_UUID.test(value);
}

export function normalizeEntityId(value: string): string {
  return value.replace(/-/g, '').toLowerCase();
}

function normalizeName(name: string): string {
  return name.trim().replace(/[.\s]+$/, '');
}

function normalizeDescription(description: string): string {
  const trimmed = description.trim();
  if (trimmed.length === 0) return trimmed;
  return /[.!?]$/.test(trimmed) ? trimmed : `${trimmed}.`;
}

export type WriteCtx = {
  store: GeoStore;
  cache: QueryClient;
};

// Local store → merged → remote, mirroring read-dispatcher.
export async function resolveProperty(propertyId: string, ctx: WriteCtx): Promise<Property | EditToolFailure> {
  const local = ctx.store.getProperty(propertyId);
  if (local) return local;

  try {
    const merged = await E.findOne({ id: propertyId, store: ctx.store, cache: ctx.cache });
    if (merged) {
      // Re-check getProperty post-merge: same-turn property creations populate
      // the entity index AFTER the dataType lands in pendingDataTypes.
      const reLocal = ctx.store.getProperty(propertyId);
      if (reLocal) return reLocal;
      const dataType = ctx.store.getStableDataType(propertyId);
      if (dataType) {
        return { id: propertyId, name: merged.name, dataType };
      }
    }
  } catch (err) {
    console.error('[chat/write-validators] property merge lookup failed', propertyId, err);
  }

  try {
    const remote = await ctx.cache.fetchQuery({
      queryKey: ['network', 'property', propertyId],
      queryFn: ({ signal }) => Effect.runPromise(getProperty(propertyId, signal)),
    });
    if (remote) return remote;
  } catch (err) {
    console.error('[chat/write-validators] property remote lookup failed', propertyId, err);
    return lookupFailed();
  }

  return notFound('property', propertyId);
}

export async function resolveEntity(
  entityId: string,
  spaceId: string | undefined,
  ctx: WriteCtx
): Promise<Entity | EditToolFailure> {
  // Try local first to cover same-turn just-created entities. resolveEntity
  // for a cross-space target (spaceId === undefined) still benefits from
  // local: the user might've staged the entity without a space scope yet.
  try {
    const merged = await E.findOne({ id: entityId, spaceId, store: ctx.store, cache: ctx.cache });
    if (merged) return merged;
  } catch (err) {
    console.error('[chat/write-validators] entity merge lookup failed', entityId, err);
    return lookupFailed();
  }

  // One more shot without the space scope before giving up — a draft entity
  // might not have spaceId resolved yet.
  if (spaceId !== undefined) {
    try {
      const noScope = await E.findOne({ id: entityId, store: ctx.store, cache: ctx.cache });
      if (noScope) return noScope;
    } catch {
      // ignore — fall through to remote
    }
  }

  try {
    const remote = await ctx.cache.fetchQuery({
      queryKey: ['network', 'entity', entityId, spaceId],
      queryFn: ({ signal }) => Effect.runPromise(getEntity(entityId, spaceId, signal)),
    });
    if (remote) return remote;
  } catch (err) {
    console.error('[chat/write-validators] entity remote lookup failed', entityId, err);
    return lookupFailed();
  }

  return notFound('entity', entityId);
}

// Verifies that the parent entity has an active BLOCKS relation to the block.
// For locally-staged blocks the parent's local relations cover the case
// (E.findOne merges local + remote), so this works on minted blocks without
// any extra short-circuit.
export async function resolveBlocksEdge(
  parentEntityId: string,
  blockId: string,
  spaceId: string,
  ctx: WriteCtx
): Promise<EditToolFailure | null> {
  let parent: Entity | null = null;
  let block: Entity | null = null;
  try {
    [parent, block] = await Promise.all([
      E.findOne({ id: parentEntityId, spaceId, store: ctx.store, cache: ctx.cache }),
      E.findOne({ id: blockId, spaceId, store: ctx.store, cache: ctx.cache }),
    ]);
  } catch (err) {
    console.error('[chat/write-validators] resolveBlocksEdge lookup failed', err);
    return lookupFailed();
  }

  // Block isn't anywhere (local or published) → trust the caller for legacy
  // behavior parity (server's old `resolveBlocksEdge` did the same).
  if (!block) return null;
  if (!parent) return notFound('entity', parentEntityId);

  // Compare normalized ids — remote can return dashed UUIDs while inputs are
  // already dashless, so a raw `===` produces false negatives.
  const edge = (parent.relations ?? []).find(
    r =>
      normalizeEntityId(r.fromEntity.id) === parentEntityId &&
      normalizeEntityId(r.type.id) === SystemIds.BLOCKS &&
      normalizeEntityId(r.toEntity.id) === blockId &&
      normalizeEntityId(r.spaceId) === spaceId &&
      !r.isDeleted
  );
  if (!edge) {
    return notFound('entity', blockId, `block ${blockId} is not a child of ${parentEntityId}`);
  }
  return null;
}

export async function resolveCollectionBlock(
  blockId: string,
  spaceId: string,
  ctx: WriteCtx
): Promise<EditToolFailure | null> {
  let block: Entity | null = null;
  try {
    block = await E.findOne({ id: blockId, spaceId, store: ctx.store, cache: ctx.cache });
  } catch (err) {
    console.error('[chat/write-validators] resolveCollectionBlock lookup failed', err);
    return lookupFailed();
  }
  // Block isn't in local OR remote — trust the caller (parity with old server
  // behavior where unpublished blocks short-circuited via mintedBlockIds).
  if (!block) return null;

  const sourceTypeRelation = (block.relations ?? []).find(
    r =>
      r.fromEntity.id === blockId &&
      r.type.id === SystemIds.DATA_SOURCE_TYPE_RELATION_TYPE &&
      r.spaceId === spaceId &&
      !r.isDeleted
  );
  if (!sourceTypeRelation) {
    return wrongType(`block ${blockId} has no source type — only data blocks accept collection items`);
  }
  if (sourceTypeRelation.toEntity.id !== SystemIds.COLLECTION_DATA_SOURCE) {
    return wrongType(
      `block ${blockId} is not a COLLECTION-source data block; collection items only work on COLLECTION sources`
    );
  }
  return null;
}

// Detect the "model passed a space id where an entity id was expected" case.
// Returns `notFound` with the correct home entity id in the message when the
// supplied id resolves to a space whose home entity is a different id. Returns
// null when the id is not a space, when no space is found, or when the space's
// home entity id is the same id (legacy spaces).
export async function checkSpaceIdMisuse(entityId: string, ctx: WriteCtx): Promise<EditToolFailure | null> {
  try {
    const space = await ctx.cache.fetchQuery({
      queryKey: ['network', 'space', entityId],
      queryFn: ({ signal }) => Effect.runPromise(getSpace(entityId, signal)),
    });
    if (!space) return null;
    const homeRaw = space.topicId ?? space.entity.id ?? '';
    const homeEntityId = homeRaw ? normalizeEntityId(homeRaw) : '';
    if (!homeEntityId || homeEntityId === entityId) return null;
    return notFound(
      'entity',
      entityId,
      `${entityId} is a space id, not an entity id. The space's home entity id is ${homeEntityId} — pass that as the entity target instead. (For the current space, use currentEntityId from the system context.)`
    );
  } catch {
    // Cache/network failure — fall through to the normal not_found path. We
    // don't want a transient lookup to block an otherwise valid call.
    return null;
  }
}

export function checkRelationDedup(
  fromEntity: Entity,
  typeId: string,
  toEntityId: string,
  spaceId: string
): 'ok' | 'duplicate' {
  // Normalize before comparing — same dashed-vs-dashless mismatch as above.
  const hasExisting = fromEntity.relations.some(
    r =>
      normalizeEntityId(r.type.id) === typeId &&
      normalizeEntityId(r.toEntity.id) === toEntityId &&
      normalizeEntityId(r.spaceId) === spaceId &&
      !r.isDeleted
  );
  return hasExisting ? 'duplicate' : 'ok';
}

function isFailure(v: Property | Entity | EditToolFailure): v is EditToolFailure {
  return (v as EditToolFailure).ok === false;
}

// ---- Per-tool planners. Each returns an EditToolOutput. -------------------

type ToggleEditModeInput = { mode: 'browse' | 'edit' };
function planToggleEditMode(input: ToggleEditModeInput): EditToolOutput {
  if (input.mode !== 'edit' && input.mode !== 'browse') return invalid('mode must be "edit" or "browse"');
  return { ok: true, intent: { kind: 'toggleEditMode', mode: input.mode } };
}

type SetEntityValueInput = {
  entityId: string;
  spaceId: string;
  propertyId: string;
  value: string;
};

async function planSetEntityValue(input: SetEntityValueInput, ctx: WriteCtx): Promise<EditToolOutput> {
  if (!isEntityId(input.entityId) || !isEntityId(input.spaceId) || !isEntityId(input.propertyId)) {
    return invalid('ids must be 32-char hex or dashed uuid');
  }
  if (typeof input.value !== 'string') return invalid('value is required');
  if (input.value.length > MAX_VALUE_CHARS) return invalid('value too long');

  const entityId = normalizeEntityId(input.entityId);
  const spaceId = normalizeEntityId(input.spaceId);
  const propertyId = normalizeEntityId(input.propertyId);

  const property = await resolveProperty(propertyId, ctx);
  if (isFailure(property)) return property;
  if (property.dataType === 'RELATION') {
    return wrongType('property is RELATION-typed; use setEntityRelation instead');
  }

  const entity = await resolveEntity(entityId, spaceId, ctx);
  if (isFailure(entity)) return entity;
  const entityMisuse = await checkSpaceIdMisuse(entityId, ctx);
  if (entityMisuse) return entityMisuse;

  return {
    ok: true,
    intent: {
      kind: 'setValue',
      entityId,
      spaceId,
      propertyId,
      propertyName: property.name ?? 'Property',
      dataType: property.dataType,
      value: input.value,
      entityName: entity.name ?? null,
    },
  };
}

type DeleteEntityValueInput = {
  entityId: string;
  spaceId: string;
  propertyId: string;
};

function planDeleteEntityValue(input: DeleteEntityValueInput): EditToolOutput {
  if (!isEntityId(input.entityId) || !isEntityId(input.spaceId) || !isEntityId(input.propertyId)) {
    return invalid();
  }
  return {
    ok: true,
    intent: {
      kind: 'deleteValue',
      entityId: normalizeEntityId(input.entityId),
      spaceId: normalizeEntityId(input.spaceId),
      propertyId: normalizeEntityId(input.propertyId),
    },
  };
}

type AddPropertyToEntityInput = {
  entityId: string;
  spaceId: string;
  propertyId: string;
  initialValue?: string;
};

async function planAddPropertyToEntity(input: AddPropertyToEntityInput, ctx: WriteCtx): Promise<EditToolOutput> {
  if (!isEntityId(input.entityId) || !isEntityId(input.spaceId) || !isEntityId(input.propertyId)) {
    return invalid();
  }
  if (input.initialValue !== undefined && input.initialValue.length > MAX_VALUE_CHARS) {
    return invalid('initialValue too long');
  }

  const entityId = normalizeEntityId(input.entityId);
  const spaceId = normalizeEntityId(input.spaceId);
  const propertyId = normalizeEntityId(input.propertyId);

  const property = await resolveProperty(propertyId, ctx);
  if (isFailure(property)) return property;
  if (property.dataType === 'RELATION') {
    return wrongType('property is RELATION-typed; use setEntityRelation instead');
  }

  const entity = await resolveEntity(entityId, spaceId, ctx);
  if (isFailure(entity)) return entity;

  return {
    ok: true,
    intent: {
      kind: 'setValue',
      entityId,
      spaceId,
      propertyId,
      propertyName: property.name ?? 'Property',
      dataType: property.dataType,
      value: input.initialValue ?? '',
      entityName: entity.name ?? null,
    },
  };
}

type SetEntityRelationInput = {
  fromEntityId: string;
  spaceId: string;
  typeId: string;
  toEntityId: string;
};

async function planSetEntityRelation(input: SetEntityRelationInput, ctx: WriteCtx): Promise<EditToolOutput> {
  if (
    !isEntityId(input.fromEntityId) ||
    !isEntityId(input.spaceId) ||
    !isEntityId(input.typeId) ||
    !isEntityId(input.toEntityId)
  ) {
    return invalid();
  }
  const fromEntityId = normalizeEntityId(input.fromEntityId);
  const spaceId = normalizeEntityId(input.spaceId);
  const typeId = normalizeEntityId(input.typeId);
  const toEntityId = normalizeEntityId(input.toEntityId);

  const property = await resolveProperty(typeId, ctx);
  if (isFailure(property)) return property;
  if (property.dataType !== 'RELATION') {
    return wrongType('typeId must be a RELATION-typed property; use setEntityValue for scalar fields');
  }

  const fromEntity = await resolveEntity(fromEntityId, spaceId, ctx);
  if (isFailure(fromEntity)) return fromEntity;
  // Cross-space lookup intentional: the target may live in a different space.
  const toEntity = await resolveEntity(toEntityId, undefined, ctx);
  if (isFailure(toEntity)) return toEntity;
  // The model can confuse a `/space/<id>` URL with an entity id and pass the
  // bare space id as the relation target. Catch that here with the correct
  // home entity id in the error so the model can retry.
  const targetMisuse = await checkSpaceIdMisuse(toEntityId, ctx);
  if (targetMisuse) return targetMisuse;

  if (checkRelationDedup(fromEntity, typeId, toEntityId, spaceId) === 'duplicate') {
    return alreadyExists(`${fromEntity.name ?? fromEntityId} already has this relation`);
  }

  return {
    ok: true,
    intent: {
      kind: 'setRelation',
      fromEntityId,
      fromEntityName: fromEntity.name ?? null,
      spaceId,
      typeId,
      typeName: property.name,
      toEntityId,
      toEntityName: toEntity.name,
    },
  };
}

type SetEntityImageInput = {
  entityId: string;
  spaceId: string;
  propertyId: string;
  sourceUrl: string;
};

const IMAGE_SOURCE_URL_RE = /^(https?|ipfs):\/\//i;
const MAX_IMAGE_URL_CHARS = 4_096;

async function planSetEntityImage(input: SetEntityImageInput, ctx: WriteCtx): Promise<EditToolOutput> {
  if (!isEntityId(input.entityId) || !isEntityId(input.spaceId) || !isEntityId(input.propertyId)) {
    return invalid();
  }
  const sourceUrl = typeof input.sourceUrl === 'string' ? input.sourceUrl.trim() : '';
  if (!sourceUrl) return invalid('sourceUrl is required');
  if (sourceUrl.length > MAX_IMAGE_URL_CHARS) return invalid('sourceUrl too long');
  if (!IMAGE_SOURCE_URL_RE.test(sourceUrl)) {
    return invalid('sourceUrl must be http://, https://, or ipfs://');
  }

  const entityId = normalizeEntityId(input.entityId);
  const spaceId = normalizeEntityId(input.spaceId);
  const propertyId = normalizeEntityId(input.propertyId);

  const property = await resolveProperty(propertyId, ctx);
  if (isFailure(property)) return property;
  if (property.dataType !== 'RELATION') {
    return wrongType('propertyId must be a RELATION-typed property (e.g. Cover image, Avatar)');
  }
  // The renderable type is the strict guarantee that the property is meant to
  // hold an Image entity. Some image-bearing relations may not have it set in
  // older data, so don't hard-reject on absence — but if it IS set to something
  // other than IMAGE, the model picked the wrong property.
  if (property.renderableTypeStrict && property.renderableTypeStrict !== 'IMAGE') {
    return wrongType(
      `propertyId is rendered as ${property.renderableTypeStrict}; setEntityImage only works on IMAGE-typed relations`
    );
  }

  const entity = await resolveEntity(entityId, spaceId, ctx);
  if (isFailure(entity)) return entity;
  // The home entity carries the cover/avatar, not the space metadata entity
  // — catch the bare-space-id case the same way as relation tools.
  const entityMisuse = await checkSpaceIdMisuse(entityId, ctx);
  if (entityMisuse) return entityMisuse;

  return {
    ok: true,
    intent: {
      kind: 'setEntityImage',
      entityId,
      entityName: entity.name ?? null,
      spaceId,
      propertyId,
      propertyName: property.name ?? null,
      sourceUrl,
    },
  };
}

type DeleteEntityRelationInput = {
  fromEntityId: string;
  spaceId: string;
  typeId: string;
  toEntityId: string;
};

function planDeleteEntityRelation(input: DeleteEntityRelationInput): EditToolOutput {
  if (
    !isEntityId(input.fromEntityId) ||
    !isEntityId(input.spaceId) ||
    !isEntityId(input.typeId) ||
    !isEntityId(input.toEntityId)
  ) {
    return invalid();
  }
  return {
    ok: true,
    intent: {
      kind: 'deleteRelation',
      fromEntityId: normalizeEntityId(input.fromEntityId),
      spaceId: normalizeEntityId(input.spaceId),
      typeId: normalizeEntityId(input.typeId),
      toEntityId: normalizeEntityId(input.toEntityId),
    },
  };
}

type CreateEntityInput = {
  spaceId: string;
  name: string;
  description?: string;
  typeIds?: string[];
};

function planCreateEntity(input: CreateEntityInput): EditToolOutput {
  if (!isEntityId(input.spaceId)) return invalid();
  const name = input.name ? normalizeName(input.name) : '';
  if (!name) return invalid('name is required');
  if (name.length > MAX_NAME_CHARS) return invalid('name too long');
  const description = input.description ? normalizeDescription(input.description) : undefined;
  if (description && description.length > MAX_DESCRIPTION_CHARS) return invalid('description too long');

  const typeIds: string[] = [];
  if (input.typeIds) {
    if (input.typeIds.length > MAX_TYPES) return invalid(`typeIds exceeds limit of ${MAX_TYPES}`);
    for (const id of input.typeIds) {
      if (!isEntityId(id)) return invalid(`typeIds contains invalid id ${id}`);
      typeIds.push(normalizeEntityId(id));
    }
  }

  const spaceId = normalizeEntityId(input.spaceId);
  return {
    ok: true,
    intent: {
      kind: 'createEntity',
      entityId: IdUtils.generate(),
      spaceId,
      name,
      ...(description ? { description } : {}),
      ...(typeIds.length > 0 ? { typeIds } : {}),
    },
  };
}

type DeleteEntityInput = {
  entityId: string;
  spaceId: string;
};

function planDeleteEntity(input: DeleteEntityInput): EditToolOutput {
  if (!isEntityId(input.entityId) || !isEntityId(input.spaceId)) return invalid();
  return {
    ok: true,
    intent: {
      kind: 'deleteEntity',
      entityId: normalizeEntityId(input.entityId),
      spaceId: normalizeEntityId(input.spaceId),
    },
  };
}

type MoveEntityToSpaceInput = {
  entityId: string;
  spaceId: string;
  targetSpaceId: string;
};

async function planMoveEntityToSpace(input: MoveEntityToSpaceInput, ctx: WriteCtx): Promise<EditToolOutput> {
  if (!isEntityId(input.entityId) || !isEntityId(input.spaceId) || !isEntityId(input.targetSpaceId)) {
    return invalid();
  }
  const entityId = normalizeEntityId(input.entityId);
  const spaceId = normalizeEntityId(input.spaceId);
  const targetSpaceId = normalizeEntityId(input.targetSpaceId);
  if (spaceId === targetSpaceId) return invalid('targetSpaceId must differ from spaceId');

  const entity = await resolveEntity(entityId, spaceId, ctx);
  if (isFailure(entity)) return entity;

  return {
    ok: true,
    intent: { kind: 'moveEntityToSpace', entityId, spaceId, targetSpaceId },
  };
}

async function planCloneEntityToSpace(input: MoveEntityToSpaceInput, ctx: WriteCtx): Promise<EditToolOutput> {
  if (!isEntityId(input.entityId) || !isEntityId(input.spaceId) || !isEntityId(input.targetSpaceId)) {
    return invalid();
  }
  const entityId = normalizeEntityId(input.entityId);
  const spaceId = normalizeEntityId(input.spaceId);
  const targetSpaceId = normalizeEntityId(input.targetSpaceId);
  if (spaceId === targetSpaceId) return invalid('targetSpaceId must differ from spaceId');

  const entity = await resolveEntity(entityId, spaceId, ctx);
  if (isFailure(entity)) return entity;

  return {
    ok: true,
    intent: { kind: 'cloneEntityToSpace', entityId, spaceId, targetSpaceId },
  };
}

type CreateTabInput = {
  parentEntityId: string;
  spaceId: string;
  name: string;
};

function planCreateTab(input: CreateTabInput): EditToolOutput {
  if (!isEntityId(input.parentEntityId) || !isEntityId(input.spaceId)) return invalid();
  const name = normalizeName(input.name ?? '');
  if (!name) return invalid('name is required');
  if (name.length > MAX_NAME_CHARS) return invalid('name too long');
  return {
    ok: true,
    intent: {
      kind: 'createTab',
      parentEntityId: normalizeEntityId(input.parentEntityId),
      spaceId: normalizeEntityId(input.spaceId),
      tabId: IdUtils.generate(),
      name,
    },
  };
}

type RenameTabInput = {
  tabId: string;
  spaceId: string;
  name: string;
};

function planRenameTab(input: RenameTabInput): EditToolOutput {
  if (!isEntityId(input.tabId) || !isEntityId(input.spaceId)) return invalid();
  const name = normalizeName(input.name ?? '');
  if (!name) return invalid('name is required');
  if (name.length > MAX_NAME_CHARS) return invalid('name too long');
  return {
    ok: true,
    intent: {
      kind: 'renameTab',
      tabId: normalizeEntityId(input.tabId),
      spaceId: normalizeEntityId(input.spaceId),
      name,
    },
  };
}

type CreatePropertyInput = {
  spaceId: string;
  name: string;
  propertyType: SwitchableRenderableType;
};

function planCreateProperty(input: CreatePropertyInput): EditToolOutput {
  if (!isEntityId(input.spaceId)) return invalid();
  const name = normalizeName(input.name ?? '');
  if (!name) return invalid('name cannot be empty');
  if (!PROPERTY_TYPES.includes(input.propertyType)) return invalid('invalid propertyType');

  const spaceId = normalizeEntityId(input.spaceId);
  const { baseDataType, renderableTypeId } = mapPropertyType(input.propertyType);

  return {
    ok: true,
    intent: {
      kind: 'createProperty',
      propertyId: IdUtils.generate(),
      spaceId,
      name,
      dataType: baseDataType,
      renderableTypeId,
    },
  };
}

type DeletePropertyInput = {
  propertyId: string;
  spaceId: string;
};

async function planDeleteProperty(input: DeletePropertyInput, ctx: WriteCtx): Promise<EditToolOutput> {
  if (!isEntityId(input.propertyId) || !isEntityId(input.spaceId)) return invalid();
  const propertyId = normalizeEntityId(input.propertyId);
  const spaceId = normalizeEntityId(input.spaceId);

  const property = await resolveProperty(propertyId, ctx);
  if (isFailure(property)) return property;
  // resolveProperty succeeded, so the target is genuinely a property — guard
  // against the model passing a regular entity id by mistake.

  return {
    ok: true,
    intent: { kind: 'deleteProperty', propertyId, spaceId },
  };
}

type ChangePropertyDataTypeInput = {
  propertyId: string;
  spaceId: string;
  propertyType: SwitchableRenderableType;
};

async function planChangePropertyDataType(input: ChangePropertyDataTypeInput, ctx: WriteCtx): Promise<EditToolOutput> {
  if (!isEntityId(input.propertyId) || !isEntityId(input.spaceId)) return invalid();
  if (!PROPERTY_TYPES.includes(input.propertyType)) return invalid('invalid propertyType');

  const propertyId = normalizeEntityId(input.propertyId);
  const spaceId = normalizeEntityId(input.spaceId);

  const property = await resolveProperty(propertyId, ctx);
  if (isFailure(property)) return property;

  const { baseDataType, renderableTypeId } = mapPropertyType(input.propertyType);

  // Refuse the change rather than silently coercing existing values: the model
  // is expected to clear them via deleteEntityValue first. This local check
  // won't catch published-but-not-locally-staged values, but those are the
  // model's responsibility per the system prompt.
  const localValuesUsing = ctx.store.getValuesByProperty(propertyId);
  if (localValuesUsing.length > 0) {
    return wrongType(
      `property has ${localValuesUsing.length} active value(s); clear them via deleteEntityValue before changing the data type`
    );
  }

  return {
    ok: true,
    intent: {
      kind: 'changePropertyDataType',
      propertyId,
      spaceId,
      propertyName: property.name ?? 'Property',
      dataType: baseDataType,
      renderableTypeId,
    },
  };
}

type CreateBlockInput = {
  parentEntityId: string;
  spaceId: string;
  blockKind: 'text' | 'code' | 'image' | 'video' | 'data';
  markdown?: string;
  url?: string;
  title?: string;
  source?: DataBlockSource;
  view?: DataBlockView;
};

function buildContent(input: CreateBlockInput): BlockContent | { error: string } {
  switch (input.blockKind) {
    case 'text':
    case 'code': {
      const markdown = input.markdown ?? '';
      if (markdown.length > MAX_MARKDOWN_CHARS) return { error: 'markdown too long' };
      return { kind: input.blockKind, markdown };
    }
    case 'image':
    case 'video': {
      if (!input.url) return { error: 'url is required for image / video blocks' };
      if (input.url.length > MAX_URL_CHARS) return { error: 'url too long' };
      if (input.url.startsWith('data:')) return { error: 'data URIs are not allowed' };
      try {
        const parsed = new URL(input.url);
        if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:' && parsed.protocol !== 'ipfs:') {
          return { error: 'url must be http/https/ipfs' };
        }
      } catch {
        return { error: 'url is not a valid URL' };
      }
      return { kind: input.blockKind, url: input.url, title: input.title ?? null };
    }
    case 'data': {
      if (input.source !== undefined && !DATA_SOURCES.includes(input.source)) return { error: 'invalid source' };
      if (input.view !== undefined && !DATA_VIEWS.includes(input.view)) return { error: 'invalid view' };
      const title = input.title?.trim();
      return {
        kind: 'data',
        ...(input.source !== undefined ? { source: input.source } : {}),
        ...(input.view !== undefined ? { view: input.view } : {}),
        ...(title && title.length > 0 ? { title } : {}),
      };
    }
    default:
      return { error: 'unknown blockKind' };
  }
}

function planCreateBlock(input: CreateBlockInput): EditToolOutput {
  if (!isEntityId(input.parentEntityId) || !isEntityId(input.spaceId)) return invalid();
  const parentEntityId = normalizeEntityId(input.parentEntityId);
  const spaceId = normalizeEntityId(input.spaceId);

  if (input.blockKind === 'text' && input.markdown && /\n/.test(input.markdown)) {
    const lines = input.markdown
      .split(/\n+/)
      .map(s => s.trim())
      .filter(s => s.length > 0);
    if (lines.length > 1) {
      if (lines.length > MAX_AUTO_SPLIT_LINES) {
        return invalid(`too many lines; split into multiple createBlock calls (max ${MAX_AUTO_SPLIT_LINES} per call)`);
      }
      if (lines.some(l => l.length > MAX_MARKDOWN_CHARS)) return invalid('markdown too long');
      const blocks = lines.map(markdown => ({
        blockId: IdUtils.generate(),
        content: { kind: 'text' as const, markdown },
      }));
      return {
        ok: true,
        intent: { kind: 'createBlocks', parentEntityId, spaceId, blocks },
      };
    }
  }

  const content = buildContent(input);
  if ('error' in content) return invalid(content.error);

  return {
    ok: true,
    intent: {
      kind: 'createBlock',
      parentEntityId,
      spaceId,
      blockId: IdUtils.generate(),
      content,
    },
  };
}

type UpdateBlockInput = {
  blockId: string;
  parentEntityId: string;
  spaceId: string;
  blockKind: 'text' | 'code' | 'image' | 'video' | 'data';
  markdown?: string;
  url?: string;
  title?: string;
  source?: DataBlockSource;
  view?: DataBlockView;
};

async function planUpdateBlock(input: UpdateBlockInput, ctx: WriteCtx): Promise<EditToolOutput> {
  if (!isEntityId(input.blockId) || !isEntityId(input.parentEntityId) || !isEntityId(input.spaceId)) {
    return invalid();
  }

  const blockId = normalizeEntityId(input.blockId);
  const parentEntityId = normalizeEntityId(input.parentEntityId);
  const spaceId = normalizeEntityId(input.spaceId);

  const edgeGate = await resolveBlocksEdge(parentEntityId, blockId, spaceId, ctx);
  if (edgeGate) return edgeGate;

  if (input.view !== undefined) {
    return invalid('updateBlock cannot change view; call setDataBlockView instead');
  }

  const content = buildContent({
    parentEntityId: blockId,
    spaceId,
    blockKind: input.blockKind,
    markdown: input.markdown,
    url: input.url,
    title: input.title,
    source: input.source,
  });
  if ('error' in content) return invalid(content.error);

  return {
    ok: true,
    intent: { kind: 'updateBlock', blockId, spaceId, content },
  };
}

type DeleteBlockInput = {
  blockId: string;
  parentEntityId: string;
  spaceId: string;
};

async function planDeleteBlock(input: DeleteBlockInput, ctx: WriteCtx): Promise<EditToolOutput> {
  if (!isEntityId(input.blockId) || !isEntityId(input.parentEntityId) || !isEntityId(input.spaceId)) {
    return invalid();
  }
  const blockId = normalizeEntityId(input.blockId);
  const parentEntityId = normalizeEntityId(input.parentEntityId);
  const spaceId = normalizeEntityId(input.spaceId);

  const edgeGate = await resolveBlocksEdge(parentEntityId, blockId, spaceId, ctx);
  if (edgeGate) return edgeGate;

  return { ok: true, intent: { kind: 'deleteBlock', blockId, parentEntityId, spaceId } };
}

type RelativePosition =
  | { kind: 'first' }
  | { kind: 'last' }
  | { kind: 'before'; referenceId: string }
  | { kind: 'after'; referenceId: string };

function resolveRelativePosition(
  target: 'first' | 'last' | 'before' | 'after',
  referenceId: string | undefined
): RelativePosition | { error: string } {
  if (target === 'first') return { kind: 'first' };
  if (target === 'last') return { kind: 'last' };
  if (!referenceId) return { error: `target=${target} requires a reference id` };
  if (!isEntityId(referenceId)) return { error: 'reference id is not a valid entity id' };
  return { kind: target, referenceId: normalizeEntityId(referenceId) };
}

type MoveBlockInput = {
  blockId: string;
  parentEntityId: string;
  spaceId: string;
  target: 'first' | 'last' | 'before' | 'after';
  referenceBlockId?: string;
};

async function planMoveBlock(input: MoveBlockInput, ctx: WriteCtx): Promise<EditToolOutput> {
  if (!isEntityId(input.blockId) || !isEntityId(input.parentEntityId) || !isEntityId(input.spaceId)) {
    return invalid();
  }
  const position = resolveRelativePosition(input.target, input.referenceBlockId);
  if ('error' in position) return invalid(position.error);

  const blockId = normalizeEntityId(input.blockId);
  const parentEntityId = normalizeEntityId(input.parentEntityId);
  const spaceId = normalizeEntityId(input.spaceId);
  if (position.kind === 'before' || position.kind === 'after') {
    if (position.referenceId === blockId) return invalid('referenceBlockId must be a different block');
  }

  const edgeGate = await resolveBlocksEdge(parentEntityId, blockId, spaceId, ctx);
  if (edgeGate) return edgeGate;

  return { ok: true, intent: { kind: 'moveBlock', blockId, parentEntityId, spaceId, position } };
}

type MoveRelationInput = {
  fromEntityId: string;
  typeId: string;
  toEntityId: string;
  spaceId: string;
  target: 'first' | 'last' | 'before' | 'after';
  referenceToEntityId?: string;
};

function planMoveRelation(input: MoveRelationInput): EditToolOutput {
  if (
    !isEntityId(input.fromEntityId) ||
    !isEntityId(input.typeId) ||
    !isEntityId(input.toEntityId) ||
    !isEntityId(input.spaceId)
  ) {
    return invalid();
  }
  const position = resolveRelativePosition(input.target, input.referenceToEntityId);
  if ('error' in position) return invalid(position.error);

  const fromEntityId = normalizeEntityId(input.fromEntityId);
  const typeId = normalizeEntityId(input.typeId);
  const toEntityId = normalizeEntityId(input.toEntityId);
  const spaceId = normalizeEntityId(input.spaceId);
  if (position.kind === 'before' || position.kind === 'after') {
    if (position.referenceId === toEntityId) return invalid('referenceToEntityId must be a different relation');
  }

  return { ok: true, intent: { kind: 'moveRelation', fromEntityId, typeId, toEntityId, spaceId, position } };
}

type FilterInput = {
  columnId: string;
  columnName?: string | null;
  valueType: FilterableValueType;
  value: string;
  valueName?: string | null;
  isBacklink?: boolean;
};

type SetDataBlockFiltersInput = {
  blockId: string;
  parentEntityId: string;
  spaceId: string;
  filters: FilterInput[];
  mode?: FilterMode;
};

async function planSetDataBlockFilters(input: SetDataBlockFiltersInput, ctx: WriteCtx): Promise<EditToolOutput> {
  if (!isEntityId(input.blockId) || !isEntityId(input.parentEntityId) || !isEntityId(input.spaceId)) {
    return invalid();
  }
  const blockId = normalizeEntityId(input.blockId);
  const parentEntityId = normalizeEntityId(input.parentEntityId);
  const spaceId = normalizeEntityId(input.spaceId);

  const edgeGate = await resolveBlocksEdge(parentEntityId, blockId, spaceId, ctx);
  if (edgeGate) return edgeGate;

  const filters: Filter[] = [];
  for (const f of input.filters ?? []) {
    if (!isEntityId(f.columnId)) return invalid(`filter.columnId ${f.columnId} is not a valid id`);
    if (!(VALUE_TYPES as readonly string[]).includes(f.valueType)) {
      return invalid(`filter.valueType ${f.valueType} is not valid`);
    }
    const columnId = normalizeEntityId(f.columnId);
    const isRelationColumn =
      f.valueType === 'RELATION' ||
      ID.equals(columnId, SystemIds.SPACE_FILTER) ||
      ID.equals(columnId, SystemIds.TYPES_PROPERTY) ||
      !!f.isBacklink;
    if (isRelationColumn && !isEntityId(f.value)) {
      return invalid(`RELATION filter.value must be an entity id`);
    }
    filters.push({
      columnId,
      columnName: f.columnName ?? null,
      valueType: isRelationColumn ? 'RELATION' : f.valueType,
      value: isRelationColumn ? normalizeEntityId(f.value) : f.value,
      valueName: f.valueName ?? null,
      ...(f.isBacklink ? { isBacklink: true } : {}),
    });
  }

  return {
    ok: true,
    intent: {
      kind: 'setDataBlockFilters',
      blockId,
      spaceId,
      filters,
      mode: input.mode ?? 'AND',
    },
  };
}

type SetDataBlockViewInput = {
  blockId: string;
  parentEntityId: string;
  spaceId: string;
  view: DataBlockView;
};

async function planSetDataBlockView(input: SetDataBlockViewInput, ctx: WriteCtx): Promise<EditToolOutput> {
  if (!isEntityId(input.blockId) || !isEntityId(input.parentEntityId) || !isEntityId(input.spaceId)) {
    return invalid();
  }
  if (!(DATA_VIEWS as readonly string[]).includes(input.view)) return invalid();
  const blockId = normalizeEntityId(input.blockId);
  const parentEntityId = normalizeEntityId(input.parentEntityId);
  const spaceId = normalizeEntityId(input.spaceId);

  const edgeGate = await resolveBlocksEdge(parentEntityId, blockId, spaceId, ctx);
  if (edgeGate) return edgeGate;

  return {
    ok: true,
    intent: { kind: 'setDataBlockView', blockId, parentEntityId, spaceId, view: input.view },
  };
}

type SetDataBlockShownColumnsInput = {
  blockId: string;
  parentEntityId: string;
  spaceId: string;
  propertyIds: string[];
};

const MAX_SHOWN_COLUMNS = 50;

async function planSetDataBlockShownColumns(
  input: SetDataBlockShownColumnsInput,
  ctx: WriteCtx
): Promise<EditToolOutput> {
  if (!isEntityId(input.blockId) || !isEntityId(input.parentEntityId) || !isEntityId(input.spaceId)) {
    return invalid();
  }
  if (!Array.isArray(input.propertyIds)) return invalid('propertyIds must be an array');
  if (input.propertyIds.length > MAX_SHOWN_COLUMNS) {
    return invalid(`propertyIds exceeds limit of ${MAX_SHOWN_COLUMNS}`);
  }

  const blockId = normalizeEntityId(input.blockId);
  const parentEntityId = normalizeEntityId(input.parentEntityId);
  const spaceId = normalizeEntityId(input.spaceId);

  const propertyIds: string[] = [];
  const seen = new Set<string>();
  for (const id of input.propertyIds) {
    if (!isEntityId(id)) return invalid(`propertyIds contains invalid id ${id}`);
    const normalized = normalizeEntityId(id);
    // Name is implicit and always shown — silently drop it if the model added it.
    if (normalized === normalizeEntityId(SystemIds.NAME_PROPERTY)) continue;
    if (seen.has(normalized)) continue;
    seen.add(normalized);
    propertyIds.push(normalized);
  }

  const edgeGate = await resolveBlocksEdge(parentEntityId, blockId, spaceId, ctx);
  if (edgeGate) return edgeGate;

  return {
    ok: true,
    intent: { kind: 'setDataBlockShownColumns', blockId, parentEntityId, spaceId, propertyIds },
  };
}

type CollectionItemInput = {
  blockId: string;
  entityId: string;
  spaceId: string;
};

async function planAddCollectionItem(input: CollectionItemInput, ctx: WriteCtx): Promise<EditToolOutput> {
  if (!isEntityId(input.blockId) || !isEntityId(input.entityId) || !isEntityId(input.spaceId)) return invalid();
  const blockId = normalizeEntityId(input.blockId);
  const entityId = normalizeEntityId(input.entityId);
  const spaceId = normalizeEntityId(input.spaceId);

  const blockGate = await resolveCollectionBlock(blockId, spaceId, ctx);
  if (blockGate) return blockGate;

  // Cross-space target lookup intentional: collection items can reference
  // entities from other spaces.
  const target = await resolveEntity(entityId, undefined, ctx);
  if (isFailure(target)) return target;
  // Same space-id-vs-entity-id guard as setEntityRelation: catch a bare space
  // id used as a collection item target before it stages a broken relation.
  const targetMisuse = await checkSpaceIdMisuse(entityId, ctx);
  if (targetMisuse) return targetMisuse;

  return {
    ok: true,
    intent: {
      kind: 'setRelation',
      fromEntityId: blockId,
      fromEntityName: null,
      spaceId,
      typeId: SystemIds.COLLECTION_ITEM_RELATION_TYPE,
      typeName: 'Collection Item',
      toEntityId: entityId,
      toEntityName: target.name ?? null,
    },
  };
}

function planRemoveCollectionItem(input: CollectionItemInput): EditToolOutput {
  if (!isEntityId(input.blockId) || !isEntityId(input.entityId) || !isEntityId(input.spaceId)) return invalid();
  const blockId = normalizeEntityId(input.blockId);
  const entityId = normalizeEntityId(input.entityId);
  const spaceId = normalizeEntityId(input.spaceId);

  return {
    ok: true,
    intent: {
      kind: 'deleteRelation',
      fromEntityId: blockId,
      spaceId,
      typeId: SystemIds.COLLECTION_ITEM_RELATION_TYPE,
      toEntityId: entityId,
    },
  };
}

export type WriteToolInput = Record<string, unknown>;

export async function planWriteTool(toolName: string, input: WriteToolInput, ctx: WriteCtx): Promise<EditToolOutput> {
  switch (toolName) {
    case 'toggleEditMode':
      return planToggleEditMode(input as unknown as ToggleEditModeInput);
    case 'setEntityValue':
      return planSetEntityValue(input as unknown as SetEntityValueInput, ctx);
    case 'deleteEntityValue':
      return planDeleteEntityValue(input as unknown as DeleteEntityValueInput);
    case 'addPropertyToEntity':
      return planAddPropertyToEntity(input as unknown as AddPropertyToEntityInput, ctx);
    case 'createProperty':
      return planCreateProperty(input as unknown as CreatePropertyInput);
    case 'deleteProperty':
      return planDeleteProperty(input as unknown as DeletePropertyInput, ctx);
    case 'changePropertyDataType':
      return planChangePropertyDataType(input as unknown as ChangePropertyDataTypeInput, ctx);
    case 'setEntityRelation':
      return planSetEntityRelation(input as unknown as SetEntityRelationInput, ctx);
    case 'deleteEntityRelation':
      return planDeleteEntityRelation(input as unknown as DeleteEntityRelationInput);
    case 'setEntityImage':
      return planSetEntityImage(input as unknown as SetEntityImageInput, ctx);
    case 'createEntity':
      return planCreateEntity(input as unknown as CreateEntityInput);
    case 'deleteEntity':
      return planDeleteEntity(input as unknown as DeleteEntityInput);
    case 'moveEntityToSpace':
      return planMoveEntityToSpace(input as unknown as MoveEntityToSpaceInput, ctx);
    case 'cloneEntityToSpace':
      return planCloneEntityToSpace(input as unknown as MoveEntityToSpaceInput, ctx);
    case 'createTab':
      return planCreateTab(input as unknown as CreateTabInput);
    case 'renameTab':
      return planRenameTab(input as unknown as RenameTabInput);
    case 'createBlock':
      return planCreateBlock(input as unknown as CreateBlockInput);
    case 'updateBlock':
      return planUpdateBlock(input as unknown as UpdateBlockInput, ctx);
    case 'deleteBlock':
      return planDeleteBlock(input as unknown as DeleteBlockInput, ctx);
    case 'moveBlock':
      return planMoveBlock(input as unknown as MoveBlockInput, ctx);
    case 'moveRelation':
      return planMoveRelation(input as unknown as MoveRelationInput);
    case 'setDataBlockFilters':
      return planSetDataBlockFilters(input as unknown as SetDataBlockFiltersInput, ctx);
    case 'setDataBlockView':
      return planSetDataBlockView(input as unknown as SetDataBlockViewInput, ctx);
    case 'setDataBlockShownColumns':
      return planSetDataBlockShownColumns(input as unknown as SetDataBlockShownColumnsInput, ctx);
    case 'addCollectionItem':
      return planAddCollectionItem(input as unknown as CollectionItemInput, ctx);
    case 'removeCollectionItem':
      return planRemoveCollectionItem(input as unknown as CollectionItemInput);
    default:
      return invalid(`unknown write tool: ${toolName}`);
  }
}
