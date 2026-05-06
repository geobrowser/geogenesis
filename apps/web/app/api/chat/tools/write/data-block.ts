import { SystemIds } from '@geoprotocol/geo-sdk/lite';

import { jsonSchema, tool } from 'ai';

import type { FilterMode } from '~/core/blocks/data/filters';
import type { DataBlockView } from '~/core/chat/edit-types';
import type { FilterableValueType } from '~/core/value-types';

import { ENTITY_ID_PATTERN } from './shared';

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

export const setDataBlockFilters = tool({
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
});

type SetDataBlockViewInput = {
  blockId: string;
  parentEntityId: string;
  spaceId: string;
  view: DataBlockView;
};

export const setDataBlockView = tool({
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
});

type SetDataBlockShownColumnsInput = {
  blockId: string;
  parentEntityId: string;
  spaceId: string;
  propertyIds: string[];
};

export const setDataBlockShownColumns = tool({
  description: `Configure which property columns a data block displays. Pass \`blockId\` (the data block entity id), \`parentEntityId\` (the page or tab that holds the block), and \`propertyIds\` — the FULL ordered list of property ids to show. The list REPLACES the existing columns, like \`setDataBlockFilters\`: to add a column, pass the existing columns plus the new one; to remove, pass the existing list minus that one. Order in the array becomes display order. The Name column is always present and must NOT be in \`propertyIds\`. Works on blocks you just staged in this session — no publish needed first. Use this when the user says "show the X column", "hide Y", "reorder columns", or "configure columns" on a TABLE / LIST / GALLERY data block.`,
  inputSchema: jsonSchema<SetDataBlockShownColumnsInput>({
    type: 'object',
    properties: {
      blockId: { type: 'string', pattern: ENTITY_ID_PATTERN },
      parentEntityId: { type: 'string', pattern: ENTITY_ID_PATTERN },
      spaceId: { type: 'string', pattern: ENTITY_ID_PATTERN },
      propertyIds: {
        type: 'array',
        items: { type: 'string', pattern: ENTITY_ID_PATTERN },
      },
    },
    required: ['blockId', 'parentEntityId', 'spaceId', 'propertyIds'],
    additionalProperties: false,
  }),
});

type CollectionItemInput = {
  blockId: string;
  entityId: string;
  spaceId: string;
};

export const addCollectionItem = tool({
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
});

export const removeCollectionItem = tool({
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
});
