import { Position, SystemIds } from '@geoprotocol/geo-sdk/lite';

import { jsonSchema, tool } from 'ai';
import * as Effect from 'effect/Effect';

import { getBatchEntities, getEntity, getProperties, getSpace } from '~/core/io/queries';
import type { Entity, Relation } from '~/core/types';

import { MAX_RESULT_ENTRIES, isEntityId, limitEntries, normalizeEntityId, truncateText } from './shared';

// Mirrors DEFAULT_ENTITY_SCHEMA from ~/core/database/entities — slots present
// on every entity regardless of its types.
const DEFAULT_SCHEMA: Array<{ id: string; name: string; dataType: 'TEXT' | 'RELATION' }> = [
  { id: SystemIds.NAME_PROPERTY, name: 'Name', dataType: 'TEXT' },
  { id: SystemIds.DESCRIPTION_PROPERTY, name: 'Description', dataType: 'TEXT' },
  { id: SystemIds.TYPES_PROPERTY, name: 'Types', dataType: 'RELATION' },
  { id: SystemIds.COVER_PROPERTY, name: 'Cover', dataType: 'RELATION' },
];

type GetEntityInput = {
  entityId: string;
  spaceId?: string;
};

// Code blocks are stored identically to text blocks at the graph level (same
// TEXT_BLOCK type, same MARKDOWN_CONTENT property, same TEXT renderable type)
// and so read back as 'text' here. Callers wanting code behavior on update can
// just pass kind: 'text' with fenced markdown.
type BlockKind = 'text' | 'image' | 'video' | 'data' | 'unknown';

// Schema is the model's primary tool for "what fields can I fill on this
// entity" — capping at MAX_RESULT_ENTRIES (10) was starving rich types
// (Person with 12 properties → only 6 type-specific slots returned). Use a
// dedicated, larger cap so the assistant sees the full shape before deciding
// to create a duplicate property.
const MAX_SCHEMA_ENTRIES = 30;

type BlockEntry = {
  id: string;
  kind: BlockKind;
  // For data blocks, the entity id of the BLOCKS relation itself — the VIEW
  // relation hangs off this, not the block entity. Populated for all block
  // kinds but primarily useful for data blocks.
  blockRelationEntityId: string;
};

type TabEntry = {
  id: string;
  name: string | null;
};

type SchemaEntry = {
  propertyId: string;
  propertyName: string | null;
  dataType: string;
  // True if the entity already has a value or relation set for this property.
  filled: boolean;
};

type GetEntityOutput =
  | {
      id: string;
      name: string | null;
      description: string | null;
      spaceId: string | null;
      spaceName: string | null;
      types: string[];
      values: Array<{ propertyId: string | null; propertyName: string | null; value: string; dataType: string }>;
      relations: Array<{ typeName: string | null; toEntityId: string; toEntityName: string | null }>;
      blocks: BlockEntry[];
      tabs: TabEntry[];
      // Suggested properties from the entity's types — the same fillable
      // slots the page UI shows. Empty if schema lookup fails.
      schema: SchemaEntry[];
    }
  | { error: 'not_found' | 'invalid_id' | 'lookup_failed' };

function sortRelationsByPosition(relations: Relation[]): Relation[] {
  return [...relations].sort((a, b) => Position.compare(a.position ?? null, b.position ?? null));
}

// Server-side replica of fetchEntitiesWithRelations from
// ~/core/database/entities. The entityQuery filters relations by spaceId, so
// any entity whose first fetch came back with empty relations gets re-fetched
// from its top-ranked space (cross-space type resolution).
async function fetchTypeEntitiesWithRelations(spaceByType: Map<string, string | undefined>): Promise<Entity[]> {
  if (spaceByType.size === 0) return [];

  const idsBySpace = new Map<string | undefined, string[]>();
  for (const [id, space] of spaceByType.entries()) {
    const group = idsBySpace.get(space) ?? [];
    group.push(id);
    idsBySpace.set(space, group);
  }

  let entities = (
    await Promise.all(
      [...idsBySpace.entries()].map(([spaceId, entityIds]) => Effect.runPromise(getBatchEntities(entityIds, spaceId)))
    )
  ).flat();

  const missing = entities.filter(entity => {
    if (entity.relations.length > 0) return false;
    const fetchedSpace = spaceByType.get(entity.id);
    return entity.spaces.length > 0 && entity.spaces[0] !== fetchedSpace;
  });

  if (missing.length > 0) {
    const retryBySpace = new Map<string, string[]>();
    for (const entity of missing) {
      const space = entity.spaces[0];
      const group = retryBySpace.get(space) ?? [];
      group.push(entity.id);
      retryBySpace.set(space, group);
    }

    const retried = (
      await Promise.all(
        [...retryBySpace.entries()].map(([spaceId, entityIds]) =>
          Effect.runPromise(getBatchEntities(entityIds, spaceId))
        )
      )
    ).flat();

    const retriedById = new Map(retried.map(e => [e.id, e]));
    entities = entities.map(e => retriedById.get(e.id) ?? e);
  }

  return entities;
}

// Mirrors getSchemaFromTypeIds from ~/core/database/entities. For each type
// the entity declares, fetches the type entity, filters its PROPERTIES
// relations to that type's space, then batch-fetches the property defs.
// Always prepends DEFAULT_SCHEMA so name / description / types / cover show
// up even when the entity has no types.
async function fetchEntitySchema(entityRelations: Relation[], filledPropertyIds: Set<string>): Promise<SchemaEntry[]> {
  try {
    // toSpaceId is the type entity's native space — that's where its
    // PROPERTIES relations live, so we use it as the fetch + filter scope.
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
      const spaceByType = new Map(typesWithSpace.map(t => [t.id, t.spaceId]));
      const typeEntities = await fetchTypeEntitiesWithRelations(spaceByType);
      const typeById = new Map(typeEntities.map(e => [e.id, e]));

      const seenProps = new Set<string>();
      for (const { id } of typesWithSpace) {
        const typeEntity = typeById.get(id);
        if (!typeEntity) continue;
        const typeSpaceId = spaceByType.get(id) ?? typeEntity.spaces[0];
        const relevant = typeEntity.relations.filter(
          r => r.type.id === SystemIds.PROPERTIES && (typeSpaceId ? r.spaceId === typeSpaceId : true)
        );
        for (const relation of sortRelationsByPosition(relevant)) {
          const propertyId = relation.toEntity.id;
          if (seenProps.has(propertyId)) continue;
          seenProps.add(propertyId);
          propertyIds.push(propertyId);
        }
      }
    }

    const allIds = [...new Set([...DEFAULT_SCHEMA.map(p => p.id), ...propertyIds])];
    const fetched = propertyIds.length > 0 ? await Effect.runPromise(getProperties(propertyIds)) : [];
    const fetchedById = new Map(fetched.map(p => [p.id, p]));
    const defaultsById = new Map<string, (typeof DEFAULT_SCHEMA)[number]>(DEFAULT_SCHEMA.map(p => [p.id as string, p]));

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
    console.error('[chat/getEntity] schema lookup failed', err);
    return [];
  }
}

function renderableTypeToBlockKind(renderable: string | null | undefined): BlockKind {
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

export const getEntityTool = tool({
  description:
    'Fetch a single entity from the Geo knowledge graph by id. Returns its property `values`, outgoing `relations` (up to 10, with BLOCKS and TABS excluded), a `blocks` array of every content block in order, a `tabs` array of every tab on the page, and a `schema` array of the suggested properties from this entity\'s types — including `{ propertyId, propertyName, dataType, filled }` for each. Use `schema` to discover fillable slots the entity hasn\'t set yet (Tags, Roles, Date of birth, etc.) before saying "no such property" or creating a duplicate. Call this before any `deleteBlock` / `updateBlock` / `setDataBlockView`, to expand a searchGraph result, or to enumerate tabs (tabs have their own blocks — call `getEntity(tabId)`). Long values are truncated.',
  inputSchema: jsonSchema<GetEntityInput>({
    type: 'object',
    properties: {
      entityId: { type: 'string', description: 'The entity id (dashless hex or uuid).' },
      spaceId: { type: 'string', description: 'Optional — space id to scope the lookup.' },
    },
    required: ['entityId'],
    additionalProperties: false,
  }),
  execute: async ({ entityId, spaceId }: GetEntityInput): Promise<GetEntityOutput> => {
    if (!isEntityId(entityId)) {
      return { error: 'invalid_id' };
    }
    const normalizedId = normalizeEntityId(entityId);
    const normalizedSpaceId = spaceId && isEntityId(spaceId) ? normalizeEntityId(spaceId) : undefined;

    try {
      const entity = await Effect.runPromise(getEntity(normalizedId, normalizedSpaceId));
      if (!entity) return { error: 'not_found' };

      const primarySpaceId = normalizedSpaceId ?? entity.spaces[0];
      let spaceName: string | null = null;
      if (primarySpaceId) {
        try {
          const space = await Effect.runPromise(getSpace(primarySpaceId));
          spaceName = space?.entity.name ?? null;
        } catch {
          spaceName = null;
        }
      }

      const values = limitEntries(entity.values, MAX_RESULT_ENTRIES).map(value => ({
        propertyId: value.property?.id ? normalizeEntityId(value.property.id) : null,
        propertyName: value.property?.name ?? null,
        value: truncateText(value.value ?? ''),
        dataType: value.property?.dataType ?? 'TEXT',
      }));

      // Split content blocks (BLOCKS) and tab pointers (TABS_PROPERTY) out of
      // the general relations list so the model can enumerate them without us
      // blowing the 10-entry cap on pages that also have many type / property
      // relations. Order is preserved.
      const blockRelations = entity.relations.filter(r => r.type.id === SystemIds.BLOCKS);
      const tabRelations = entity.relations.filter(r => r.type.id === SystemIds.TABS_PROPERTY);
      const otherRelations = entity.relations.filter(
        r => r.type.id !== SystemIds.BLOCKS && r.type.id !== SystemIds.TABS_PROPERTY
      );

      const blocks: BlockEntry[] = blockRelations.map(relation => ({
        id: normalizeEntityId(relation.toEntity.id),
        kind: renderableTypeToBlockKind(relation.renderableType),
        blockRelationEntityId: normalizeEntityId(relation.entityId),
      }));

      const tabs: TabEntry[] = tabRelations.map(relation => ({
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
      const schema = await fetchEntitySchema(entity.relations, filledPropertyIds);

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
      };
    } catch (err) {
      console.error('[chat/getEntity] lookup failed', err);
      return { error: 'lookup_failed' };
    }
  },
});
