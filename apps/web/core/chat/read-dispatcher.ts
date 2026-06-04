'use client';

import { Position, SystemIds } from '@geoprotocol/geo-sdk/lite';
import type { QueryClient } from '@tanstack/react-query';

import * as React from 'react';

import { type UIMessage, isToolUIPart } from 'ai';
import * as Effect from 'effect/Effect';

import { DEFAULT_ENTITY_SCHEMA } from '~/core/database/entities';
import { getEntity, getResults, getSpace, getSpaces } from '~/core/io/queries';
import { queryClient } from '~/core/query-client';
import { E } from '~/core/sync/orm';
import { GeoStore } from '~/core/sync/store';
import { store as geoStore } from '~/core/sync/use-sync-engine';
import type { Entity, Property, Relation, SearchResult } from '~/core/types';
import { getSpaceRank } from '~/core/utils/space/space-ranking';

import { enqueue } from './apply-queue';
import {
  type GetEntityInput,
  type GetEntityOutput,
  type ListSpaceEntry,
  type ListSpacesInput,
  type ListSpacesOutput,
  type SchemaEntry,
  type SearchGraphInput,
  type SearchGraphOutput,
  type SearchGraphResult,
} from './read-types';

const MAX_RESULT_ENTRIES = 10;
const MAX_ATTRIBUTE_VALUE_CHARS = 300;
const MAX_SCHEMA_ENTRIES = 30;

const DASHLESS_UUID = /^[a-f0-9]{32}$/i;
const DASHED_UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;

function isEntityId(value: unknown): value is string {
  if (typeof value !== 'string') return false;
  return DASHLESS_UUID.test(value) || DASHED_UUID.test(value);
}

function normalizeEntityId(value: string): string {
  return value.replace(/-/g, '').toLowerCase();
}

function truncateText(value: string, max = MAX_ATTRIBUTE_VALUE_CHARS): string {
  if (value.length <= max) return value;
  return `${value.slice(0, max)}…`;
}

function limitEntries<T>(items: readonly T[], max = MAX_RESULT_ENTRIES): T[] {
  return items.slice(0, max);
}

export type ReadCtx = {
  store: GeoStore;
  cache: QueryClient;
};

function renderableTypeToBlockKind(
  renderable: string | null | undefined
): 'text' | 'image' | 'video' | 'data' | 'unknown' {
  switch (renderable) {
    case 'TEXT':
      return 'text';
    case 'IMAGE':
      return 'image';
    case 'VIDEO':
      return 'video';
    case 'DATA':
      return 'data';
    default:
      return 'unknown';
  }
}

function sortRelationsByPosition(relations: Relation[]): Relation[] {
  return [...relations].sort((a, b) => Position.compare(a.position ?? null, b.position ?? null));
}

function dedupeTypes<T extends { id: string }>(items: T[]): T[] {
  const seen = new Set<string>();
  const out: T[] = [];
  for (const item of items) {
    if (seen.has(item.id)) continue;
    seen.add(item.id);
    out.push(item);
  }
  return out;
}

// Assembles the schema from the entity's TYPES_PROPERTY → PROPERTIES edges.
// Property metadata prefers the local store, falling back to remote.
async function fetchEntitySchema(
  entityRelations: Relation[],
  filledPropertyIds: Set<string>,
  ctx: ReadCtx
): Promise<SchemaEntry[]> {
  try {
    const typesWithSpace: Array<{ id: string; spaceId?: string }> = [];
    const seenTypes = new Set<string>();
    for (const r of entityRelations) {
      if (r.type.id !== SystemIds.TYPES_PROPERTY) continue;
      if (seenTypes.has(r.toEntity.id)) continue;
      seenTypes.add(r.toEntity.id);
      typesWithSpace.push({ id: r.toEntity.id, spaceId: r.toSpaceId ?? undefined });
    }

    const propertyIds: string[] = [];
    if (typesWithSpace.length > 0) {
      const dedupedTypes = dedupeTypes(typesWithSpace);
      const seenProps = new Set<string>();

      // Two-pass: try the type's referenced space, then fall back to the
      // type entity's own top-ranked space if PROPERTIES is space-filtered.
      const typeEntities = await Promise.all(
        dedupedTypes.map(async t => {
          const scoped = await E.findOne({
            id: t.id,
            spaceId: t.spaceId,
            store: ctx.store,
            cache: ctx.cache,
          }).catch(() => null);
          if (scoped && scoped.relations.some(r => r.type.id === SystemIds.PROPERTIES)) {
            return scoped;
          }
          return E.findOne({ id: t.id, store: ctx.store, cache: ctx.cache }).catch(() => null);
        })
      );

      dedupedTypes.forEach((typeRef, index) => {
        const typeEntity = typeEntities[index];
        if (!typeEntity) return;
        const typeSpaceId = typeRef.spaceId ?? typeEntity.spaces[0];
        const relevant = typeEntity.relations.filter(
          r => r.type.id === SystemIds.PROPERTIES && (typeSpaceId ? r.spaceId === typeSpaceId : true)
        );
        for (const relation of sortRelationsByPosition(relevant)) {
          const propertyId = relation.toEntity.id;
          if (seenProps.has(propertyId)) continue;
          seenProps.add(propertyId);
          propertyIds.push(propertyId);
        }
      });
    }

    const allIds = [...new Set([...DEFAULT_ENTITY_SCHEMA.map(p => p.id as string), ...propertyIds])];

    // Local store first (covers user-minted properties whose dataType lives
    // only in pendingDataTypes), remote fallback for published-only ones.
    const fetchedById = new Map<string, Property>();
    await Promise.all(
      propertyIds.map(async id => {
        const localProp = ctx.store.getProperty(id);
        if (localProp) {
          fetchedById.set(id, localProp);
          return;
        }
        try {
          const remote = await E.findOne({ id, store: ctx.store, cache: ctx.cache });
          if (remote) {
            const dataType = ctx.store.getStableDataType(id) ?? null;
            if (dataType) {
              fetchedById.set(id, {
                id,
                name: remote.name,
                dataType,
              });
            }
          }
        } catch (err) {
          console.error('[chat/read-dispatcher] property lookup failed', id, err);
        }
      })
    );

    const defaultsById = new Map<string, (typeof DEFAULT_ENTITY_SCHEMA)[number]>(
      DEFAULT_ENTITY_SCHEMA.map(p => [p.id as string, p])
    );

    return allIds.slice(0, MAX_SCHEMA_ENTRIES).map(id => {
      const fromDefault = defaultsById.get(id);
      const fromGraph = fetchedById.get(id);
      return {
        propertyId: normalizeEntityId(id),
        propertyName: fromGraph?.name ?? fromDefault?.name ?? null,
        dataType: fromGraph?.dataType ?? fromDefault?.dataType ?? 'TEXT',
        filled: filledPropertyIds.has(id),
      };
    });
  } catch (err) {
    console.error('[chat/read-dispatcher] schema lookup failed', err);
    return [];
  }
}

// Local store first so a locally-renamed space surfaces under its new name.
async function resolveSpaceName(spaceId: string, ctx: ReadCtx): Promise<string | null> {
  const localSpaceEntity = ctx.store.getEntity(spaceId);
  if (localSpaceEntity?.name) return localSpaceEntity.name;
  try {
    const cached = await ctx.cache.fetchQuery({
      queryKey: ['network', 'space', spaceId],
      queryFn: ({ signal }) => Effect.runPromise(getSpace(spaceId, signal)),
    });
    return cached?.entity.name ?? null;
  } catch {
    return null;
  }
}

export async function executeGetEntity(input: GetEntityInput, ctx: ReadCtx): Promise<GetEntityOutput> {
  if (!isEntityId(input.entityId)) {
    return { error: 'invalid_id' };
  }
  const normalizedId = normalizeEntityId(input.entityId);
  const normalizedSpaceId = input.spaceId && isEntityId(input.spaceId) ? normalizeEntityId(input.spaceId) : undefined;

  try {
    // Scoped merge first; wrapped per-attempt so a transient throw doesn't
    // skip the unscoped + remote fallback below.
    let entity: Entity | null = null;
    try {
      entity = await E.findOne({
        id: normalizedId,
        spaceId: normalizedSpaceId,
        store: ctx.store,
        cache: ctx.cache,
      });
    } catch (err) {
      console.error('[chat/read-dispatcher] getEntity scoped findOne failed', normalizedId, err);
    }

    let isDraft = false;

    if (!entity) {
      // Retry unscoped — a draft may not have its spaceId resolved yet.
      try {
        entity = await E.findOne({
          id: normalizedId,
          store: ctx.store,
          cache: ctx.cache,
        });
      } catch {
        // ignore — falls through to remote fetch below
      }
    }

    if (!entity) {
      // Direct remote query; logged so we can distinguish draft lookups from
      // cache-miss lookups on published entities.
      try {
        const remote = await ctx.cache.fetchQuery({
          queryKey: ['chat-read-dispatcher', 'getEntity', normalizedId, normalizedSpaceId ?? null],
          queryFn: ({ signal }) => Effect.runPromise(getEntity(normalizedId, normalizedSpaceId, signal)),
        });
        if (remote) {
          entity = remote;
          console.info('[chat/read-dispatcher] getEntity remote fallback', normalizedId);
        }
      } catch (err) {
        console.error('[chat/read-dispatcher] getEntity remote fallback failed', normalizedId, err);
      }
    }

    if (!entity) return { error: 'not_found' };

    // Approximation of "draft": every value/relation is local-only.
    const allLocal =
      entity.values.length + entity.relations.length > 0 &&
      entity.values.every(v => v.isLocal) &&
      entity.relations.every(r => r.isLocal);
    if (allLocal) isDraft = true;

    const primarySpaceId = normalizedSpaceId ?? entity.spaces[0];
    const spaceName = primarySpaceId ? await resolveSpaceName(primarySpaceId, ctx) : null;

    const values = limitEntries(entity.values, MAX_RESULT_ENTRIES).map(value => ({
      propertyId: value.property?.id ? normalizeEntityId(value.property.id) : null,
      propertyName: value.property?.name ?? null,
      value: truncateText(value.value ?? ''),
      dataType: value.property?.dataType ?? 'TEXT',
    }));

    // BLOCKS / TABS are enumerated separately so they're never truncated.
    const blockRelations = entity.relations.filter(r => r.type.id === SystemIds.BLOCKS);
    const tabRelations = entity.relations.filter(r => r.type.id === SystemIds.TABS_PROPERTY);
    const otherRelations = entity.relations.filter(
      r => r.type.id !== SystemIds.BLOCKS && r.type.id !== SystemIds.TABS_PROPERTY
    );

    const blocks = blockRelations.map(relation => ({
      id: normalizeEntityId(relation.toEntity.id),
      kind: renderableTypeToBlockKind(relation.renderableType),
      blockRelationEntityId: normalizeEntityId(relation.entityId),
    }));

    const tabs = tabRelations.map(relation => ({
      id: normalizeEntityId(relation.toEntity.id),
      name: relation.toEntity.name,
    }));

    const relations = limitEntries(otherRelations, MAX_RESULT_ENTRIES).map(relation => ({
      typeName: relation.type.name,
      toEntityId: normalizeEntityId(relation.toEntity.id),
      toEntityName: relation.toEntity.name,
    }));

    const filledPropertyIds = new Set<string>([
      ...entity.values.map(v => v.property?.id).filter((id): id is string => typeof id === 'string'),
      ...otherRelations.map(r => r.type.id),
    ]);
    const schema = await fetchEntitySchema(entity.relations, filledPropertyIds, ctx);

    return {
      id: normalizedId,
      name: entity.name,
      description: entity.description,
      spaceId: primarySpaceId ?? null,
      spaceName,
      types: entity.types.map(t => t.name).filter((n): n is string => typeof n === 'string' && n.length > 0),
      values,
      relations,
      blocks,
      tabs,
      schema,
      ...(isDraft ? { isDraft: true } : {}),
    };
  } catch (err) {
    console.error('[chat/read-dispatcher] getEntity failed', err);
    return { error: 'lookup_failed' };
  }
}

// Naive substring scan; startsWith matches first, then contains.
function localSearch(query: string, store: GeoStore, scopedSpaceId?: string, scopedTypeId?: string): Entity[] {
  const needle = query.trim().toLowerCase();
  if (needle.length === 0) return [];

  const startsWith: Entity[] = [];
  const contains: Entity[] = [];

  for (const entity of store.getEntities()) {
    const name = entity.name?.toLowerCase();
    if (!name || name.length === 0) continue;

    if (scopedSpaceId && !entity.spaces.includes(scopedSpaceId)) continue;
    if (scopedTypeId && !entity.types.some(t => t.id === scopedTypeId)) continue;

    if (name.startsWith(needle)) {
      startsWith.push(entity);
    } else if (name.includes(needle)) {
      contains.push(entity);
    }
  }

  return [...startsWith, ...contains];
}

async function localEntityToSearchResult(entity: Entity, ctx: ReadCtx): Promise<SearchGraphResult | null> {
  const firstSpace = entity.spaces[0];
  if (!firstSpace) return null;
  const spaceName = await resolveSpaceName(firstSpace, ctx);
  return {
    id: normalizeEntityId(entity.id),
    name: entity.name,
    spaceId: normalizeEntityId(firstSpace),
    spaceName,
    typeNames: entity.types.map(t => t.name).filter((n): n is string => typeof n === 'string' && n.length > 0),
    isDraft: true,
  };
}

function remoteSearchResultToOutput(entity: SearchResult): SearchGraphResult | null {
  const firstSpace = entity.spaces[0];
  if (!firstSpace) return null;
  return {
    id: normalizeEntityId(entity.id),
    name: entity.name,
    spaceId: normalizeEntityId(firstSpace.spaceId),
    spaceName: firstSpace.name ?? null,
    typeNames: entity.types.map(t => t.name).filter((n): n is string => typeof n === 'string' && n.length > 0),
  };
}

export async function executeSearchGraph(input: SearchGraphInput, ctx: ReadCtx): Promise<SearchGraphOutput> {
  const effectiveLimit = Math.min(MAX_RESULT_ENTRIES, Math.max(1, input.limit ?? 5));
  const scopedSpaceId = input.spaceId && isEntityId(input.spaceId) ? normalizeEntityId(input.spaceId) : undefined;
  const scopedTypeId = input.typeId && isEntityId(input.typeId) ? normalizeEntityId(input.typeId) : undefined;

  try {
    const [localMatches, remoteRaw] = await Promise.all([
      Promise.resolve(localSearch(input.query, ctx.store, scopedSpaceId, scopedTypeId)),
      ctx.cache
        .fetchQuery({
          queryKey: ['chat', 'searchGraph', input.query, scopedSpaceId ?? null, scopedTypeId ?? null, effectiveLimit],
          queryFn: ({ signal }) =>
            Effect.runPromise(
              getResults(
                {
                  query: input.query,
                  spaceId: scopedSpaceId,
                  typeIds: scopedTypeId ? [scopedTypeId] : undefined,
                  limit: effectiveLimit,
                },
                signal
              )
            ),
        })
        .catch(err => {
          console.error('[chat/read-dispatcher] searchGraph remote failed', err);
          return [] as SearchResult[];
        }),
    ]);

    const seen = new Set<string>();
    const merged: SearchGraphResult[] = [];

    for (const entity of localMatches) {
      const result = await localEntityToSearchResult(entity, ctx);
      if (!result) continue;
      if (seen.has(result.id)) continue;
      seen.add(result.id);
      merged.push(result);
      if (merged.length >= effectiveLimit) break;
    }

    if (merged.length < effectiveLimit) {
      for (const remote of remoteRaw) {
        const result = remoteSearchResultToOutput(remote);
        if (!result) continue;
        if (seen.has(result.id)) continue;
        seen.add(result.id);
        merged.push(result);
        if (merged.length >= effectiveLimit) break;
      }
    }

    return { results: merged };
  } catch (err) {
    console.error('[chat/read-dispatcher] searchGraph failed', err);
    return { error: 'lookup_failed' };
  }
}

// Locally-created spaces surface above the remote list so the agent can
// reference a space the user just spun up.
function resolveSpaceHomeEntityId(space: { topicId: string | null; entity: { id: string } }): string | null {
  const raw = space.topicId ?? space.entity.id ?? '';
  if (!raw) return null;
  return normalizeEntityId(raw);
}

function localSpaceMatches(query: string | undefined, store: GeoStore): Entity[] {
  const matches: Entity[] = [];
  for (const entity of store.getEntities()) {
    const isSpaceType = entity.types.some(t => t.id === SystemIds.SPACE_TYPE);
    if (!isSpaceType) continue;
    if (query) {
      const needle = query.trim().toLowerCase();
      const name = entity.name?.toLowerCase() ?? '';
      if (!name.includes(needle)) continue;
    }
    matches.push(entity);
  }
  return matches;
}

export async function executeListSpaces(input: ListSpacesInput, ctx: ReadCtx): Promise<ListSpacesOutput> {
  const effectiveLimit = Math.min(MAX_RESULT_ENTRIES, Math.max(1, input.limit ?? 5));
  const trimmedQuery = input.query?.trim();

  try {
    const localCandidates = localSpaceMatches(trimmedQuery, ctx.store);

    let remote: ListSpaceEntry[] = [];
    if (trimmedQuery) {
      // Search published space topic entities, then resolve to containers.
      const searchResults = await ctx.cache
        .fetchQuery({
          queryKey: ['chat', 'listSpaces', 'search', trimmedQuery, effectiveLimit],
          queryFn: ({ signal }) =>
            Effect.runPromise(
              getResults(
                {
                  query: trimmedQuery,
                  typeIds: [SystemIds.SPACE_TYPE],
                  limit: effectiveLimit,
                },
                signal
              )
            ),
        })
        .catch(() => [] as SearchResult[]);

      const topicIds = [...new Set(searchResults.map(r => normalizeEntityId(r.id)))];
      if (topicIds.length > 0) {
        const spaces = await ctx.cache
          .fetchQuery({
            queryKey: ['chat', 'listSpaces', 'byTopic', topicIds],
            queryFn: ({ signal }) => Effect.runPromise(getSpaces({ topicIds, limit: topicIds.length }, signal)),
          })
          .catch(() => []);

        const spacesByTopicId = new Map(spaces.map(space => [normalizeEntityId(space.topicId ?? ''), space]));

        const ordered = topicIds
          .map((topicId, index) => {
            const space = spacesByTopicId.get(topicId);
            return space ? { space, searchIndex: index } : null;
          })
          .filter((entry): entry is { space: (typeof spaces)[number]; searchIndex: number } => entry !== null)
          .sort((a, b) => {
            const rankDelta = getSpaceRank(normalizeEntityId(a.space.id)) - getSpaceRank(normalizeEntityId(b.space.id));
            if (rankDelta !== 0) return rankDelta;
            return a.searchIndex - b.searchIndex;
          })
          .map(entry => entry.space);

        remote = ordered.map(space => ({
          id: normalizeEntityId(space.id),
          name: space.entity.name,
          description: space.entity.description ? truncateText(space.entity.description) : null,
          homeEntityId: resolveSpaceHomeEntityId(space),
        }));
      }
    } else {
      const raw = await ctx.cache
        .fetchQuery({
          queryKey: ['chat', 'listSpaces', 'sample', effectiveLimit],
          queryFn: ({ signal }) => Effect.runPromise(getSpaces({ limit: effectiveLimit }, signal)),
        })
        .catch(() => []);
      remote = raw.map(space => ({
        id: normalizeEntityId(space.id),
        name: space.entity.name,
        description: space.entity.description ? truncateText(space.entity.description) : null,
        homeEntityId: resolveSpaceHomeEntityId(space),
      }));
    }

    const seen = new Set<string>();
    const merged: ListSpaceEntry[] = [];

    for (const candidate of localCandidates) {
      const id = normalizeEntityId(candidate.id);
      if (seen.has(id)) continue;
      seen.add(id);
      merged.push({
        id,
        name: candidate.name,
        description: candidate.description ? truncateText(candidate.description) : null,
        // Local space matches are the topic entity itself, so the id IS the
        // home entity id — best-effort, mirroring how the existing code
        // already treats `candidate.id` as the space id.
        homeEntityId: id,
      });
      if (merged.length >= effectiveLimit) break;
    }

    if (merged.length < effectiveLimit) {
      for (const space of remote) {
        if (seen.has(space.id)) continue;
        seen.add(space.id);
        merged.push(space);
        if (merged.length >= effectiveLimit) break;
      }
    }

    return { spaces: merged };
  } catch (err) {
    console.error('[chat/read-dispatcher] listSpaces failed', err);
    return { error: 'lookup_failed' };
  }
}

export type ReadToolName = 'getEntity' | 'searchGraph' | 'listSpaces';

const READ_TOOL_NAMES = new Set<ReadToolName>(['getEntity', 'searchGraph', 'listSpaces']);

export function isReadToolName(name: string): name is ReadToolName {
  return READ_TOOL_NAMES.has(name as ReadToolName);
}

export type ReadToolCall =
  | { toolName: 'getEntity'; toolCallId: string; input: GetEntityInput }
  | { toolName: 'searchGraph'; toolCallId: string; input: SearchGraphInput }
  | { toolName: 'listSpaces'; toolCallId: string; input: ListSpacesInput };

export type ReadToolResult =
  | { toolName: 'getEntity'; toolCallId: string; output: GetEntityOutput }
  | { toolName: 'searchGraph'; toolCallId: string; output: SearchGraphOutput }
  | { toolName: 'listSpaces'; toolCallId: string; output: ListSpacesOutput };

export async function executeReadTool(call: ReadToolCall, ctx: ReadCtx): Promise<ReadToolResult> {
  switch (call.toolName) {
    case 'getEntity':
      return { toolName: 'getEntity', toolCallId: call.toolCallId, output: await executeGetEntity(call.input, ctx) };
    case 'searchGraph':
      return {
        toolName: 'searchGraph',
        toolCallId: call.toolCallId,
        output: await executeSearchGraph(call.input, ctx),
      };
    case 'listSpaces':
      return { toolName: 'listSpaces', toolCallId: call.toolCallId, output: await executeListSpaces(call.input, ctx) };
  }
}

// Widened from useChat's typed addToolResult so the same ref serves reads + writes.
export type AddToolResultFn = (args: { tool: string; toolCallId: string; output: unknown }) => void;

const READ_TOOL_PART_PREFIX = 'tool-';

function readToolNameFromPart(type: string): ReadToolName | null {
  if (!type.startsWith(READ_TOOL_PART_PREFIX)) return null;
  const name = type.slice(READ_TOOL_PART_PREFIX.length);
  return isReadToolName(name) ? name : null;
}

// Effect-based dispatch. The widget calls useEditDispatcher before this hook,
// so any edit emitted in the same render lands in the apply-queue first and
// the read observes post-apply state. `onToolCall` runs before React commits,
// so reads would race ahead of edits — that's why we wait for the effect.
export function useReadDispatcher(messages: UIMessage[], addToolResultRef: React.RefObject<AddToolResultFn | null>) {
  const dispatchedRef = React.useRef(new Set<string>());
  const cancelledRef = React.useRef(false);

  React.useEffect(() => {
    cancelledRef.current = false;
    return () => {
      cancelledRef.current = true;
    };
  }, []);

  React.useEffect(() => {
    for (const message of messages) {
      if (message.role !== 'assistant') continue;
      for (const part of message.parts) {
        if (!isToolUIPart(part)) continue;
        const toolName = readToolNameFromPart(part.type);
        if (!toolName) continue;
        // input-available = args fully streamed, SDK waiting for our output.
        if (part.state !== 'input-available') continue;
        if (dispatchedRef.current.has(part.toolCallId)) continue;
        dispatchedRef.current.add(part.toolCallId);

        const input = (part as { input?: unknown }).input ?? {};
        const toolCallId = part.toolCallId;

        enqueue(async () => {
          if (cancelledRef.current) return;
          const ctx: ReadCtx = { store: geoStore, cache: queryClient };
          try {
            const result = await executeReadTool(
              {
                toolName,
                toolCallId,
                input: input as GetEntityInput & SearchGraphInput & ListSpacesInput,
              } as ReadToolCall,
              ctx
            );
            addToolResultRef.current?.({
              tool: toolName,
              toolCallId,
              output: result.output,
            });
          } catch (err) {
            console.error('[chat/read-dispatcher] tool execution threw', toolName, err);
            addToolResultRef.current?.({
              tool: toolName,
              toolCallId,
              output: { error: 'lookup_failed' } as GetEntityOutput,
            });
          }
        });
      }
    }
  }, [messages, addToolResultRef]);
}
