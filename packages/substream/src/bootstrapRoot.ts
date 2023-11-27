import * as db from "zapatos/db";
import type * as s from "zapatos/schema";
import {
  ATTRIBUTE,
  ATTRIBUTES,
  AVATAR_ATTRIBUTE,
  BLOCKS,
  COVER_ATTRIBUTE,
  DATE,
  DESCRIPTION,
  FILTER,
  FOREIGN_TYPES,
  IMAGE,
  IMAGE_ATTRIBUTE,
  IMAGE_BLOCK,
  MARKDOWN_CONTENT,
  NAME,
  PARENT_ENTITY,
  PERMISSIONED_SPACE_REGISTRY_ADDRESS,
  PERSON_TYPE,
  RELATION,
  RELATION_VALUE_RELATIONSHIP_TYPE,
  ROOT_SPACE_CREATED_AT,
  ROOT_SPACE_CREATED_AT_BLOCK,
  ROOT_SPACE_CREATED_BY_ID,
  ROW_TYPE,
  SCHEMA_TYPE,
  SHOWN_COLUMNS,
  SPACE,
  SPACE_CONFIGURATION,
  TABLE_BLOCK,
  TEXT,
  TEXT_BLOCK,
  TYPES,
  VALUE_TYPE,
  WALLETS_ATTRIBUTE,
  WEB_URL,
} from "./constants/systemIds.js";
import { generateTripleId } from "./utils/id.js";
import { pool } from "./utils/pool.js";

const entities: string[] = [
  TYPES,
  ATTRIBUTES,
  SCHEMA_TYPE,
  VALUE_TYPE,
  RELATION,
  TEXT,
  IMAGE,
  IMAGE_ATTRIBUTE,
  DESCRIPTION,
  NAME,
  SPACE,
  ATTRIBUTE,
  SPACE_CONFIGURATION,
  FOREIGN_TYPES,
  TABLE_BLOCK,
  SHOWN_COLUMNS,
  TEXT_BLOCK,
  IMAGE_BLOCK,
  BLOCKS,
  MARKDOWN_CONTENT,
  ROW_TYPE,
  PARENT_ENTITY,
  RELATION_VALUE_RELATIONSHIP_TYPE,
  DATE,
  WEB_URL,
  PERSON_TYPE,
];

const names: Record<string, string> = {
  [TYPES]: "Types",
  [NAME]: "Name",
  [ATTRIBUTE]: "Attribute",
  [SPACE]: "Indexed Space",
  [ATTRIBUTES]: "Attributes",
  [SCHEMA_TYPE]: "Type",
  [VALUE_TYPE]: "Value type",
  [RELATION]: "Relation",
  [TEXT]: "Text",
  [IMAGE]: "Image",
  [DATE]: "Date",
  [WEB_URL]: "Web URL",
  [IMAGE_ATTRIBUTE]: "Image",
  [DESCRIPTION]: "Description",
  [SPACE_CONFIGURATION]: "Space",
  [FOREIGN_TYPES]: "Foreign Types",
  [TABLE_BLOCK]: "Table Block",
  [SHOWN_COLUMNS]: "Shown Columns",
  [TEXT_BLOCK]: "Text Block",
  [IMAGE_BLOCK]: "Image Block",
  [BLOCKS]: "Blocks",
  [PARENT_ENTITY]: "Parent Entity",
  [PERSON_TYPE]: "Person",
  [MARKDOWN_CONTENT]: "Markdown Content",
  [ROW_TYPE]: "Row Type",
  [AVATAR_ATTRIBUTE]: "Avatar",
  [COVER_ATTRIBUTE]: "Cover",
  [FILTER]: "Filter",
  [WALLETS_ATTRIBUTE]: "Wallets",
  [RELATION_VALUE_RELATIONSHIP_TYPE]: "Relation Value Types",
};

const attributes: Record<string, string> = {
  [TYPES]: RELATION,
  [ATTRIBUTES]: RELATION,
  [VALUE_TYPE]: RELATION,
  [IMAGE_ATTRIBUTE]: TEXT,
  [DESCRIPTION]: TEXT,
  [NAME]: TEXT,
  [SPACE]: TEXT,
  [FOREIGN_TYPES]: RELATION,
  [MARKDOWN_CONTENT]: TEXT,
  [ROW_TYPE]: RELATION,
  [BLOCKS]: RELATION,
  [PARENT_ENTITY]: RELATION,
  [FILTER]: TEXT,
  [RELATION_VALUE_RELATIONSHIP_TYPE]: RELATION,
  [AVATAR_ATTRIBUTE]: IMAGE,
  [COVER_ATTRIBUTE]: IMAGE,
  [WALLETS_ATTRIBUTE]: RELATION,
};

const types: Record<string, string[]> = {
  [TEXT]: [],
  [RELATION]: [],
  [IMAGE]: [],
  [DATE]: [],
  [WEB_URL]: [],
  [ATTRIBUTE]: [VALUE_TYPE],
  [SCHEMA_TYPE]: [ATTRIBUTES],
  [SPACE_CONFIGURATION]: [FOREIGN_TYPES],
  [IMAGE_BLOCK]: [IMAGE_ATTRIBUTE, PARENT_ENTITY],
  [TABLE_BLOCK]: [ROW_TYPE, PARENT_ENTITY],
  [TEXT_BLOCK]: [MARKDOWN_CONTENT, PARENT_ENTITY],
  [PERSON_TYPE]: [AVATAR_ATTRIBUTE, COVER_ATTRIBUTE],
};

const geoEntities: s.geo_entities.Insertable[] = entities.map((entity) => ({
  id: entity,
  name: names[entity],
  // is_attribute: attributes[entity] ? true : false,
  // is_type: types[entity] ? true : false,
  // attribute_value_type_id: attributes[entity],
}));

const namesTriples: s.triples.Insertable[] = Object.entries(names).map(
  ([id, name]) => ({
    id: generateTripleId({
      space_id: PERMISSIONED_SPACE_REGISTRY_ADDRESS,
      entity_id: id,
      attribute_id: NAME,
      value_id: name,
    }),
    entity_id: id,
    attribute_id: NAME,
    value_type: "string",
    value_id: name,
    string_value: name,
    is_protected: true,
    space_id: PERMISSIONED_SPACE_REGISTRY_ADDRESS,
  })
);

const attributeTriples: s.triples.Insertable[] = Object.entries(attributes)
  .map(([id, entity_value_id]) => [
    /* Giving these entities a type of attribute */
    {
      id: generateTripleId({
        space_id: PERMISSIONED_SPACE_REGISTRY_ADDRESS,
        entity_id: id,
        attribute_id: TYPES,
        value_id: ATTRIBUTE,
      }),
      entity_id: id,
      attribute_id: TYPES,
      value_type: "entity",
      value_id: ATTRIBUTE,
      entity_value_id: ATTRIBUTE,
      is_protected: true,
      space_id: PERMISSIONED_SPACE_REGISTRY_ADDRESS,
    },
    /* Giving these attributes a value type of the type they are */
    {
      id: generateTripleId({
        space_id: PERMISSIONED_SPACE_REGISTRY_ADDRESS,
        entity_id: id,
        attribute_id: VALUE_TYPE,
        value_id: ATTRIBUTE,
      }),
      entity_id: id,
      attribute_id: VALUE_TYPE,
      value_type: "entity",
      value_id: ATTRIBUTE,
      entity_value_id,
      is_protected: true,
      space_id: PERMISSIONED_SPACE_REGISTRY_ADDRESS,
    },
  ])
  .flat();

const typeTriples: s.triples.Insertable[] = Object.entries(types)
  .map(([id, attributes]) => [
    /* Giving these entities a type of type */
    {
      id: generateTripleId({
        space_id: PERMISSIONED_SPACE_REGISTRY_ADDRESS,
        entity_id: id,
        attribute_id: TYPES,
        value_id: SCHEMA_TYPE,
      }),
      entity_id: id,
      attribute_id: TYPES,
      value_type: "entity",
      value_id: SCHEMA_TYPE,
      entity_value_id: SCHEMA_TYPE,
      is_protected: true,
      space_id: PERMISSIONED_SPACE_REGISTRY_ADDRESS,
    },
    /* Giving these entities an attribute of attribute */
    ...attributes.map((attribute) => ({
      id: generateTripleId({
        space_id: PERMISSIONED_SPACE_REGISTRY_ADDRESS,
        entity_id: id,
        attribute_id: ATTRIBUTES,
        value_id: attribute,
      }),
      entity_id: id,
      attribute_id: ATTRIBUTES,
      value_type: "entity",
      value_id: attribute,
      entity_value_id: attribute,
      is_protected: true,
      space_id: PERMISSIONED_SPACE_REGISTRY_ADDRESS,
    })),
  ])
  .flat();

const space: s.spaces.Insertable = {
  id: PERMISSIONED_SPACE_REGISTRY_ADDRESS,
  is_root_space: true,
  created_at_block: ROOT_SPACE_CREATED_AT_BLOCK,
};

const account: s.accounts.Insertable = {
  id: ROOT_SPACE_CREATED_BY_ID,
};

const proposal: s.proposals.Insertable = {
  id: "0",
  created_by_id: ROOT_SPACE_CREATED_BY_ID,
  created_at: ROOT_SPACE_CREATED_AT,
  space_id: PERMISSIONED_SPACE_REGISTRY_ADDRESS,
  created_at_block: ROOT_SPACE_CREATED_AT_BLOCK,
  name: `Creating initial types for ${ROOT_SPACE_CREATED_BY_ID}`,
  status: "APPROVED",
};

export const bootstrapRoot = async () => {
  await db.insert("spaces", space).run(pool);
  await db.insert("accounts", account).run(pool);
  await db.insert("geo_entities", geoEntities).run(pool);
  await db.insert("triples", namesTriples).run(pool);
  await db.insert("triples", typeTriples).run(pool);
  await db.insert("triples", attributeTriples).run(pool);
  await db.insert("proposals", proposal).run(pool);
  /* TODO: Confirm with Byron about proposal version to action id mapping structure */
};
