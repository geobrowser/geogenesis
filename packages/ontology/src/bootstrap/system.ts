import { type CreateRelationOp, NETWORK_IDS, type Op, Relation, SYSTEM_IDS } from '@geogenesis/sdk';

const names: Record<string, string> = {
  [SYSTEM_IDS.TYPES_ATTRIBUTE]: 'Types',
  [SYSTEM_IDS.NAME_ATTRIBUTE]: 'Name',
  [SYSTEM_IDS.DESCRIPTION_ATTRIBUTE]: 'Description',
  [SYSTEM_IDS.ATTRIBUTE]: 'Attribute',
  [SYSTEM_IDS.COVER_ATTRIBUTE]: 'Cover',
  [SYSTEM_IDS.RELATION_TYPE_ATTRIBUTE]: 'Relation type',
  [SYSTEM_IDS.PROPERTIES]: 'Properties',
  [SYSTEM_IDS.SCHEMA_TYPE]: 'Type',
  [SYSTEM_IDS.TEMPLATE_ATTRIBUTE]: 'Template',
  [SYSTEM_IDS.VALUE_TYPE_ATTRIBUTE]: 'Value type',
  [SYSTEM_IDS.RELATION]: 'Relation',
  [SYSTEM_IDS.TEXT]: 'Text',
  [SYSTEM_IDS.CHECKBOX]: 'Checkbox',
  [SYSTEM_IDS.NUMBER]: 'Number',
  [SYSTEM_IDS.POINT]: 'Point',
  [SYSTEM_IDS.IMAGE]: 'Image',

  [SYSTEM_IDS.ROOT_SPACE_TYPE]: 'Root',

  [SYSTEM_IDS.IMAGE_TYPE]: 'Image',
  [SYSTEM_IDS.IMAGE_URL_ATTRIBUTE]: 'Image URL',

  [SYSTEM_IDS.TIME]: 'Date',
  [SYSTEM_IDS.URL]: 'URL',
  [SYSTEM_IDS.SPACE_TYPE]: 'Space',
  [SYSTEM_IDS.SOURCE_SPACE_ATTRIBUTE]: 'Source space',
  [SYSTEM_IDS.VERIFIED_SOURCE_ATTRIBUTE]: 'Verified source',

  // Data blocks
  [SYSTEM_IDS.VIEW_TYPE]: 'View',
  [SYSTEM_IDS.DATA_BLOCK]: 'Data block',
  [SYSTEM_IDS.VIEW_ATTRIBUTE]: 'View',
  [SYSTEM_IDS.GALLERY_VIEW]: 'Gallery view',
  [SYSTEM_IDS.TABLE_VIEW]: 'Table view',
  [SYSTEM_IDS.LIST_VIEW]: 'List view',
  [SYSTEM_IDS.SHOWN_COLUMNS]: 'Shown columns',
  [SYSTEM_IDS.TEXT_BLOCK]: 'Text block',
  [SYSTEM_IDS.IMAGE_BLOCK]: 'Image block',
  [SYSTEM_IDS.BLOCKS]: 'Blocks',
  [SYSTEM_IDS.FILTER]: 'Filter',
  [SYSTEM_IDS.SPACE_FILTER]: 'Space filter',
  [SYSTEM_IDS.MARKDOWN_CONTENT]: 'Markdown content',
  [SYSTEM_IDS.PLACEHOLDER_IMAGE]: 'Placeholder image',
  [SYSTEM_IDS.PLACEHOLDER_TEXT]: 'Placeholder text',

  [SYSTEM_IDS.PERSON_TYPE]: 'Person',
  [SYSTEM_IDS.ACCOUNTS_ATTRIBUTE]: 'Accounts',
  [SYSTEM_IDS.NETWORK_TYPE]: 'Network',
  [SYSTEM_IDS.NETWORK_ATTRIBUTE]: 'Network',
  [SYSTEM_IDS.ADDRESS_ATTRIBUTE]: 'Address',
  [SYSTEM_IDS.ACCOUNT_TYPE]: 'Account',
  [NETWORK_IDS.ETHEREUM]: 'Ethereum',

  [SYSTEM_IDS.ROLE_ATTRIBUTE]: 'Role',

  [SYSTEM_IDS.RELATION_VALUE_RELATIONSHIP_TYPE]: 'Relation value types',

  [SYSTEM_IDS.RELATION_TYPE]: 'Relation',
  [SYSTEM_IDS.RELATION_INDEX]: 'Index',
  [SYSTEM_IDS.RELATION_TO_ATTRIBUTE]: 'To entity',
  [SYSTEM_IDS.RELATION_FROM_ATTRIBUTE]: 'From entity',

  [SYSTEM_IDS.DATA_SOURCE_ATTRIBUTE]: 'Data source',
  [SYSTEM_IDS.DATA_SOURCE_TYPE_RELATION_TYPE]: 'Data source type',
  [SYSTEM_IDS.COLLECTION_DATA_SOURCE]: 'Collection data source',
  [SYSTEM_IDS.ALL_OF_GEO_DATA_SOURCE]: 'Geo data source',
  [SYSTEM_IDS.QUERY_DATA_SOURCE]: 'Query data source',
  [SYSTEM_IDS.COLLECTION_ITEM_RELATION_TYPE]: 'Collection item',

  // Templates + Space Layouts
  [SYSTEM_IDS.NONPROFIT_TYPE]: 'Nonprofit',
  [SYSTEM_IDS.PROJECT_TYPE]: 'Project',
  [SYSTEM_IDS.COMPANY_TYPE]: 'Company',
  [SYSTEM_IDS.PAGE_TYPE]: 'Page',
  [SYSTEM_IDS.PAGE_TYPE_ATTRIBUTE]: 'Page type',
  [SYSTEM_IDS.NEWS_PAGE]: 'News page',
  [SYSTEM_IDS.PEOPLE_PAGE]: 'People page',
  [SYSTEM_IDS.POSTS_PAGE]: 'Posts page',
  [SYSTEM_IDS.PROJECTS_PAGE]: 'Projects page',
  [SYSTEM_IDS.FINANCES_PAGE]: 'Finances page',
  [SYSTEM_IDS.TEAM_PAGE]: 'Team page',
  [SYSTEM_IDS.JOBS_PAGE]: 'Jobs page',
  [SYSTEM_IDS.EVENTS_PAGE]: 'Events page',
  [SYSTEM_IDS.SERVICES_PAGE]: 'Services page',
  [SYSTEM_IDS.PRODUCTS_PAGE]: 'Products page',
  [SYSTEM_IDS.ABOUT_PAGE]: 'About page',
  [SYSTEM_IDS.EDUCATION_PAGE]: 'Education page',
  [SYSTEM_IDS.ONTOLOGY_PAGE]: 'Ontology page',

  [SYSTEM_IDS.POST_TYPE]: 'Post',

};

const attributes: Record<string, string> = {
  [SYSTEM_IDS.NAME_ATTRIBUTE]: SYSTEM_IDS.TEXT,
  [SYSTEM_IDS.DESCRIPTION_ATTRIBUTE]: SYSTEM_IDS.TEXT,
  [SYSTEM_IDS.COVER_ATTRIBUTE]: SYSTEM_IDS.IMAGE,
  [SYSTEM_IDS.TYPES_ATTRIBUTE]: SYSTEM_IDS.RELATION,
  [SYSTEM_IDS.TEMPLATE_ATTRIBUTE]: SYSTEM_IDS.RELATION,
  [SYSTEM_IDS.PROPERTIES]: SYSTEM_IDS.RELATION,
  [SYSTEM_IDS.RELATION_TYPE_ATTRIBUTE]: SYSTEM_IDS.RELATION,
  [SYSTEM_IDS.VALUE_TYPE_ATTRIBUTE]: SYSTEM_IDS.RELATION,
  [SYSTEM_IDS.SOURCE_SPACE_ATTRIBUTE]: SYSTEM_IDS.RELATION,
  [SYSTEM_IDS.VERIFIED_SOURCE_ATTRIBUTE]: SYSTEM_IDS.CHECKBOX,

  [SYSTEM_IDS.ROLE_ATTRIBUTE]: SYSTEM_IDS.RELATION,

  // Data blocks
  [SYSTEM_IDS.VIEW_ATTRIBUTE]: SYSTEM_IDS.RELATION,
  [SYSTEM_IDS.MARKDOWN_CONTENT]: SYSTEM_IDS.TEXT,
  [SYSTEM_IDS.BLOCKS]: SYSTEM_IDS.RELATION,
  [SYSTEM_IDS.FILTER]: SYSTEM_IDS.TEXT,
  [SYSTEM_IDS.PLACEHOLDER_IMAGE]: SYSTEM_IDS.RELATION,
  [SYSTEM_IDS.PLACEHOLDER_TEXT]: SYSTEM_IDS.TEXT,

  [SYSTEM_IDS.RELATION_VALUE_RELATIONSHIP_TYPE]: SYSTEM_IDS.RELATION,

  [SYSTEM_IDS.RELATION_INDEX]: SYSTEM_IDS.TEXT,
  [SYSTEM_IDS.RELATION_TO_ATTRIBUTE]: SYSTEM_IDS.RELATION,
  [SYSTEM_IDS.RELATION_FROM_ATTRIBUTE]: SYSTEM_IDS.RELATION,

  [SYSTEM_IDS.IMAGE_URL_ATTRIBUTE]: SYSTEM_IDS.URL,

  [SYSTEM_IDS.DATA_SOURCE_TYPE_RELATION_TYPE]: SYSTEM_IDS.RELATION,
  [SYSTEM_IDS.DATA_SOURCE_ATTRIBUTE]: SYSTEM_IDS.RELATION,
  [SYSTEM_IDS.COLLECTION_ITEM_RELATION_TYPE]: SYSTEM_IDS.RELATION,

  [SYSTEM_IDS.PAGE_TYPE_ATTRIBUTE]: SYSTEM_IDS.RELATION,

  [SYSTEM_IDS.ACCOUNTS_ATTRIBUTE]: SYSTEM_IDS.RELATION,
  [SYSTEM_IDS.NETWORK_ATTRIBUTE]: SYSTEM_IDS.RELATION,
  [SYSTEM_IDS.ADDRESS_ATTRIBUTE]: SYSTEM_IDS.TEXT,
};

// These types include the default types and attributes for a given type. There might be more
// attributes on a type than are listed here if they were later added by users.
const schemaTypes: Record<string, string[]> = {
  [SYSTEM_IDS.ROOT_SPACE_TYPE]: [],
  [SYSTEM_IDS.SCHEMA_TYPE]: [SYSTEM_IDS.TEMPLATE_ATTRIBUTE],
  [SYSTEM_IDS.VIEW_TYPE]: [],
  [SYSTEM_IDS.TEXT]: [],
  [SYSTEM_IDS.NUMBER]: [],
  [SYSTEM_IDS.POINT]: [],
  [SYSTEM_IDS.CHECKBOX]: [],
  [SYSTEM_IDS.RELATION]: [],
  [SYSTEM_IDS.IMAGE_TYPE]: [SYSTEM_IDS.IMAGE_URL_ATTRIBUTE],
  [SYSTEM_IDS.TIME]: [],
  [SYSTEM_IDS.URL]: [],
  [SYSTEM_IDS.IMAGE]: [],
  [SYSTEM_IDS.ATTRIBUTE]: [SYSTEM_IDS.VALUE_TYPE_ATTRIBUTE],
  [SYSTEM_IDS.SPACE_TYPE]: [],
  [SYSTEM_IDS.IMAGE_BLOCK]: [SYSTEM_IDS.IMAGE_URL_ATTRIBUTE],
  [SYSTEM_IDS.DATA_BLOCK]: [],
  [SYSTEM_IDS.TEXT_BLOCK]: [SYSTEM_IDS.MARKDOWN_CONTENT],
  [SYSTEM_IDS.ACCOUNT_TYPE]: [SYSTEM_IDS.NETWORK_ATTRIBUTE, SYSTEM_IDS.ADDRESS_ATTRIBUTE],
  [SYSTEM_IDS.NETWORK_TYPE]: [],
  [SYSTEM_IDS.NONPROFIT_TYPE]: [],
  [SYSTEM_IDS.PROJECT_TYPE]: [],
  [SYSTEM_IDS.COMPANY_TYPE]: [],
  [SYSTEM_IDS.RELATION_TYPE]: [
    SYSTEM_IDS.RELATION_INDEX,
    SYSTEM_IDS.RELATION_TO_ATTRIBUTE,
    SYSTEM_IDS.RELATION_FROM_ATTRIBUTE,
    SYSTEM_IDS.RELATION_TYPE_ATTRIBUTE,
  ],
};

const types: Record<string, string[]> = {
  [NETWORK_IDS.ETHEREUM]: [SYSTEM_IDS.NETWORK_TYPE],
};

const nameOps: Op[] = Object.entries(names).map(([entityId, name]) => {
  return {
    type: 'SET_TRIPLE',
    triple: {
      attribute: SYSTEM_IDS.NAME_ATTRIBUTE,
      entity: entityId,
      value: {
        type: 'TEXT',
        value: name,
      },
    },
  } satisfies Op;
});

const attributeOps: CreateRelationOp[] = Object.keys(attributes).flatMap(attributeId => {
  return Relation.make({
    fromId: attributeId,
    toId: SYSTEM_IDS.ATTRIBUTE,
    relationTypeId: SYSTEM_IDS.TYPES_ATTRIBUTE,
  });
});

const attributeValueTypeOps: CreateRelationOp[] = Object.entries(attributes).flatMap(([attributeId, valueType]) => {
  return Relation.make({
    fromId: attributeId,
    toId: valueType,
    relationTypeId: SYSTEM_IDS.VALUE_TYPE_ATTRIBUTE,
  });
});

const typeOps: CreateRelationOp[] = Object.keys(schemaTypes).flatMap(typeId => {
  return Relation.make({
    fromId: typeId,
    toId: SYSTEM_IDS.SCHEMA_TYPE,
    relationTypeId: SYSTEM_IDS.TYPES_ATTRIBUTE,
  });
});

const typeSchemaOps: CreateRelationOp[] = Object.entries(schemaTypes).flatMap(([typeId, attributeIds]) => {
  return attributeIds.flatMap(attributeId => {
    return Relation.make({
      fromId: typeId,
      toId: attributeId,
      relationTypeId: SYSTEM_IDS.PROPERTIES,
    });
  });
});

const entitiesWithTypesOps: CreateRelationOp[] = Object.entries(types).flatMap(([entityId, typeIds]) => {
  return typeIds.flatMap(typeId => {
    return Relation.make({
      fromId: entityId,
      toId: typeId,
      relationTypeId: SYSTEM_IDS.TYPES_ATTRIBUTE,
    });
  });
});

export const ops: Op[] = [
  ...nameOps,
  ...attributeOps,
  ...attributeValueTypeOps,
  ...typeOps,
  ...typeSchemaOps,
  ...entitiesWithTypesOps,
];
