import { SystemIds } from '@geoprotocol/geo-sdk/lite';

import { jsonSchema, tool } from 'ai';
import * as Effect from 'effect/Effect';

import type { Filter, FilterMode } from '~/core/blocks/data/filters';
import type { DataBlockView, EditToolOutput } from '~/core/chat/edit-types';
import { ID } from '~/core/id';
import { getEntity } from '~/core/io/queries';
import type { FilterableValueType } from '~/core/value-types';

import type { WriteContext } from './context';
import {
  ENTITY_ID_PATTERN,
  invalid,
  isEntityId,
  normalizeEntityId,
  notAuthorized,
  notFound,
  resolveBlocksEdge,
  writePrecheck,
  wrongType,
} from './shared';

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

const DATA_VIEWS: readonly DataBlockView[] = ['TABLE', 'LIST', 'GALLERY', 'BULLETED_LIST'];

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

export function buildSetDataBlockFiltersTool(context: WriteContext) {
  return tool({
    description: `Set the filter list on a data block. Replaces the existing filters entirely — pass the full list you want. Pass \`blockId\` (the data block entity id) and \`parentEntityId\` (the page or tab entity that holds the block) so we can confirm the block belongs to that page.

Each filter is \`{ columnId, valueType, value }\`. Special columnIds:
- Space filter: columnId = "${SystemIds.SPACE_FILTER}", valueType = "RELATION", value = a space id from listSpaces.
- Types filter: columnId = "${SystemIds.TYPES_PROPERTY}", valueType = "RELATION", value = a type entity id.
Otherwise columnId is a property id.

For RELATION-typed values, pass the target entity id (dashless hex or dashed UUID — the tool normalizes). \`mode\` is AND (default) or OR.`,
    inputSchema: jsonSchema<SetDataBlockFiltersInput>({
      type: 'object',
      properties: {
        blockId: { type: 'string', pattern: ENTITY_ID_PATTERN },
        parentEntityId: { type: 'string', pattern: ENTITY_ID_PATTERN },
        spaceId: { type: 'string', pattern: ENTITY_ID_PATTERN },
        mode: { type: 'string', enum: ['AND', 'OR'] },
        filters: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              columnId: { type: 'string', pattern: ENTITY_ID_PATTERN },
              columnName: { type: 'string' },
              valueType: { type: 'string', enum: VALUE_TYPES as unknown as string[] },
              value: { type: 'string' },
              valueName: { type: 'string' },
              isBacklink: { type: 'boolean' },
            },
            required: ['columnId', 'valueType', 'value'],
            additionalProperties: false,
          },
        },
      },
      required: ['blockId', 'parentEntityId', 'spaceId', 'filters'],
      additionalProperties: false,
    }),
    execute: async (input: SetDataBlockFiltersInput): Promise<EditToolOutput> => {
      const gate = await writePrecheck(context);
      if (gate) return gate;
      if (!isEntityId(input.blockId) || !isEntityId(input.parentEntityId) || !isEntityId(input.spaceId)) {
        return invalid();
      }

      const blockId = normalizeEntityId(input.blockId);
      const parentEntityId = normalizeEntityId(input.parentEntityId);
      const spaceId = normalizeEntityId(input.spaceId);

      if (!(await context.isMember(spaceId))) return notAuthorized(spaceId);

      const edgeGate = await resolveBlocksEdge(context, parentEntityId, blockId, spaceId);
      if (edgeGate) return edgeGate;

      const filters: Filter[] = [];
      for (const f of input.filters) {
        if (!isEntityId(f.columnId)) return invalid(`filter.columnId ${f.columnId} is not a valid id`);
        if (!(VALUE_TYPES as readonly string[]).includes(f.valueType)) {
          return invalid(`filter.valueType ${f.valueType} is not valid`);
        }
        const columnId = normalizeEntityId(f.columnId);
        // SPACE_FILTER and TYPES_PROPERTY are always relation-valued (the value
        // is always an entity id). Coerce regardless of what the model sent so
        // the filter engine can match ids normally — otherwise the dashed-vs-
        // dashless form leaks through and the filter matches nothing.
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
    },
  });
}

type SetDataBlockViewInput = {
  blockId: string;
  // The page / tab entity that holds this block. The client dispatcher uses
  // (parentEntityId, blockId) to find the BLOCKS relation — whose entity id is
  // where the VIEW edge actually hangs — from merged local + remote state.
  parentEntityId: string;
  spaceId: string;
  view: DataBlockView;
};

export function buildSetDataBlockViewTool(context: WriteContext) {
  return tool({
    description:
      'Change how a data block is rendered: TABLE, LIST, GALLERY, or BULLETED_LIST. Only affects display — filters and source are unchanged. Pass `blockId` (the data block entity id — from `getEntity.blocks[i].id`, or the `blockId` you just passed to `createBlock`) and `parentEntityId` (the page or tab entity that holds the block). Works on blocks you just staged in this session; no publish needed first.',
    inputSchema: jsonSchema<SetDataBlockViewInput>({
      type: 'object',
      properties: {
        blockId: { type: 'string', pattern: ENTITY_ID_PATTERN },
        parentEntityId: { type: 'string', pattern: ENTITY_ID_PATTERN },
        spaceId: { type: 'string', pattern: ENTITY_ID_PATTERN },
        view: { type: 'string', enum: DATA_VIEWS as unknown as string[] },
      },
      required: ['blockId', 'parentEntityId', 'spaceId', 'view'],
      additionalProperties: false,
    }),
    execute: async (input: SetDataBlockViewInput): Promise<EditToolOutput> => {
      const gate = await writePrecheck(context);
      if (gate) return gate;
      if (!isEntityId(input.blockId) || !isEntityId(input.parentEntityId) || !isEntityId(input.spaceId)) {
        return invalid();
      }
      if (!(DATA_VIEWS as readonly string[]).includes(input.view)) return invalid();

      const blockId = normalizeEntityId(input.blockId);
      const parentEntityId = normalizeEntityId(input.parentEntityId);
      const spaceId = normalizeEntityId(input.spaceId);

      if (!(await context.isMember(spaceId))) return notAuthorized(spaceId);

      const edgeGate = await resolveBlocksEdge(context, parentEntityId, blockId, spaceId);
      if (edgeGate) return edgeGate;

      return {
        ok: true,
        intent: { kind: 'setDataBlockView', blockId, parentEntityId, spaceId, view: input.view },
      };
    },
  });
}

type CollectionItemInput = {
  blockId: string;
  entityId: string;
  spaceId: string;
};

/**
 * Verify a data block uses a COLLECTION source when we can see it in the live
 * graph. Items attached to non-COLLECTION (QUERY / GEO) blocks won't render,
 * so we want to surface that as a clear `wrong_type` error.
 *
 * **Trust the caller when the block isn't in the live graph.** Same-turn
 * minted blocks short-circuit via `mintedBlockIds`, but blocks staged in a
 * previous chat turn are also not in the live graph yet — and those still
 * need to work. We only return `wrong_type` when we can prove the block is a
 * non-COLLECTION data block; we never return `not_found` for the block
 * itself, because the client dispatcher resolves staged state correctly.
 */
async function resolveCollectionBlock(context: WriteContext, blockId: string, spaceId: string) {
  if (context.kind === 'member' && context.mintedBlockIds.has(blockId)) return { ok: true as const };
  try {
    const block = await Effect.runPromise(getEntity(blockId, spaceId));
    if (!block) {
      // Block isn't published yet — trust the caller. The dispatcher writes
      // the COLLECTION_ITEM relation regardless, and if the block turns out
      // not to be a COLLECTION source the items just won't render until the
      // user re-sources the block. Better than hard-rejecting cross-session
      // staged blocks the assistant can't see from the server.
      return { ok: true as const };
    }
    const sourceTypeRelation = (block.relations ?? []).find(
      r =>
        r.fromEntity.id === blockId &&
        r.type.id === SystemIds.DATA_SOURCE_TYPE_RELATION_TYPE &&
        r.spaceId === spaceId &&
        !r.isDeleted
    );
    if (!sourceTypeRelation) {
      // Block exists but has no source-type relation at all — not a data block.
      return wrongType(`block ${blockId} has no source type — only data blocks accept collection items`);
    }
    if (sourceTypeRelation.toEntity.id !== SystemIds.COLLECTION_DATA_SOURCE) {
      return wrongType(
        `block ${blockId} is not a COLLECTION-source data block; collection items only work on COLLECTION sources`
      );
    }
    return { ok: true as const };
  } catch (err) {
    console.error('[chat/resolveCollectionBlock] lookup failed', err);
    return { ok: false as const, error: 'lookup_failed' as const };
  }
}

export function buildAddCollectionItemTool(context: WriteContext) {
  return tool({
    description:
      'Add an entity as an item in a COLLECTION data block. Collection items are entities (people, projects, books, anything) listed inside a data block whose source is COLLECTION. Pass `blockId` (the data block entity id, e.g. from `createBlock` or `getEntity.blocks[i].id`) and `entityId` (the entity to add — search for it first with `searchGraph` and reuse the existing id; mint a new one with `createEntity` if no match). The new item appears at the end of the list. Use this instead of `setEntityRelation` for collection items — the relation type is encoded for you. Use `removeCollectionItem` to take an item out, and `setEntityValue` / `setEntityRelation` on the item entity to edit its content.',
    inputSchema: jsonSchema<CollectionItemInput>({
      type: 'object',
      properties: {
        blockId: { type: 'string', pattern: ENTITY_ID_PATTERN },
        entityId: { type: 'string', pattern: ENTITY_ID_PATTERN },
        spaceId: { type: 'string', pattern: ENTITY_ID_PATTERN },
      },
      required: ['blockId', 'entityId', 'spaceId'],
      additionalProperties: false,
    }),
    execute: async (input: CollectionItemInput): Promise<EditToolOutput> => {
      const gate = await writePrecheck(context);
      if (gate) return gate;
      if (!isEntityId(input.blockId) || !isEntityId(input.entityId) || !isEntityId(input.spaceId)) return invalid();

      const blockId = normalizeEntityId(input.blockId);
      const entityId = normalizeEntityId(input.entityId);
      const spaceId = normalizeEntityId(input.spaceId);

      if (!(await context.isMember(spaceId))) return notAuthorized(spaceId);

      const blockGate = await resolveCollectionBlock(context, blockId, spaceId);
      if (!blockGate.ok) return blockGate;

      // Verify the target entity exists before staging a relation pointing at
      // a hallucinated id. Cross-space lookup is deliberate — collection items
      // can reference entities from other spaces.
      let targetName: string | null = null;
      try {
        const target = await Effect.runPromise(getEntity(entityId));
        if (!target) return notFound('entity', entityId);
        targetName = target.name ?? null;
      } catch (err) {
        console.error('[chat/addCollectionItem] target lookup failed', err);
        return { ok: false, error: 'lookup_failed' };
      }

      // Reuse the setRelation intent — the dispatcher writes a Relation, and
      // a Collection Item is just a Relation with type=COLLECTION_ITEM. Saves
      // a dispatcher branch and keeps reorder / remove flowing through the
      // existing moveRelation / deleteRelation paths.
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
          toEntityName: targetName,
        },
      };
    },
  });
}

export function buildRemoveCollectionItemTool(context: WriteContext) {
  return tool({
    description: `Remove an entity from a COLLECTION data block. Tombstones the COLLECTION_ITEM relation that linked the entity to the block — the entity itself is left alone. Pass \`blockId\` (the data block entity id) and \`entityId\` (the item to remove). Use \`addCollectionItem\` to add. Use \`moveRelation({ fromEntityId: blockId, typeId: '${SystemIds.COLLECTION_ITEM_RELATION_TYPE}', toEntityId: entityId, target, ... })\` to reorder items.`,
    inputSchema: jsonSchema<CollectionItemInput>({
      type: 'object',
      properties: {
        blockId: { type: 'string', pattern: ENTITY_ID_PATTERN },
        entityId: { type: 'string', pattern: ENTITY_ID_PATTERN },
        spaceId: { type: 'string', pattern: ENTITY_ID_PATTERN },
      },
      required: ['blockId', 'entityId', 'spaceId'],
      additionalProperties: false,
    }),
    execute: async (input: CollectionItemInput): Promise<EditToolOutput> => {
      const gate = await writePrecheck(context);
      if (gate) return gate;
      if (!isEntityId(input.blockId) || !isEntityId(input.entityId) || !isEntityId(input.spaceId)) return invalid();

      const blockId = normalizeEntityId(input.blockId);
      const entityId = normalizeEntityId(input.entityId);
      const spaceId = normalizeEntityId(input.spaceId);

      if (!(await context.isMember(spaceId))) return notAuthorized(spaceId);

      // Removal is idempotent and safe: the dispatcher's deleteRelation
      // no-ops when nothing matches. We don't pre-validate the block in the
      // graph because cross-session staged blocks (created in a prior chat
      // turn, not yet published) wouldn't resolve and we'd reject a legit
      // remove call. The dispatcher tombstones what it finds locally.
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
    },
  });
}
