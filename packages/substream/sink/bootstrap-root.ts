import { SYSTEM_IDS, createGeoId, createRelationship } from '@geogenesis/sdk';
import { Effect } from 'effect';
import type * as s from 'zapatos/schema';

import {
  INITIAL_COLLECTION_ITEM_INDEX,
  ROOT_SPACE_CREATED_AT,
  ROOT_SPACE_CREATED_AT_BLOCK,
  ROOT_SPACE_CREATED_BY_ID,
} from './constants/constants';
import { Accounts, CurrentVersions, Entities, EntitySpaces, Proposals, Spaces, Triples, Types, Versions } from './db';
import { Edits } from './db/edits';
import { Relations } from './db/relations';
import { getTripleFromOp } from './events/get-triple-from-op';
import { createVersionId } from './utils/id';

const PROPOSAL_ID = '0';
const EDIT_ID = '0';

const entities: string[] = [
  SYSTEM_IDS.TYPES,
  SYSTEM_IDS.ATTRIBUTES,
  SYSTEM_IDS.SCHEMA_TYPE,
  SYSTEM_IDS.VALUE_TYPE,
  SYSTEM_IDS.RELATION,
  SYSTEM_IDS.COLLECTION_VALUE_TYPE,
  SYSTEM_IDS.TEXT,
  SYSTEM_IDS.IMAGE,
  SYSTEM_IDS.IMAGE_ATTRIBUTE,
  SYSTEM_IDS.DESCRIPTION,
  SYSTEM_IDS.NAME,
  SYSTEM_IDS.SPACE,
  SYSTEM_IDS.ATTRIBUTE,
  SYSTEM_IDS.SPACE_CONFIGURATION,
  SYSTEM_IDS.FOREIGN_TYPES,
  SYSTEM_IDS.TABLE_BLOCK,
  SYSTEM_IDS.SHOWN_COLUMNS,
  SYSTEM_IDS.TEXT_BLOCK,
  SYSTEM_IDS.IMAGE_BLOCK,
  SYSTEM_IDS.BLOCKS,
  SYSTEM_IDS.MARKDOWN_CONTENT,
  SYSTEM_IDS.ROW_TYPE,
  SYSTEM_IDS.PARENT_ENTITY,
  SYSTEM_IDS.RELATION_VALUE_RELATIONSHIP_TYPE,
  SYSTEM_IDS.DATE,
  SYSTEM_IDS.WEB_URL,
  SYSTEM_IDS.PERSON_TYPE,
  SYSTEM_IDS.AVATAR_ATTRIBUTE,
  SYSTEM_IDS.COVER_ATTRIBUTE,

  SYSTEM_IDS.WALLETS_ATTRIBUTE,
  SYSTEM_IDS.FILTER,

  SYSTEM_IDS.BROADER_SPACES,

  // Compound types are value types that are stored as entities but are
  // selectable as a "native" type for a triple's value type.
  //
  // e.g., you can select a Text value type, or a Number, or an Image. The
  // image is stored as an entity while the others are stored as a primitive
  // type in the database.
  SYSTEM_IDS.IMAGE_URL_ATTRIBUTE,

  // Collections
  SYSTEM_IDS.COLLECTION_TYPE,
  SYSTEM_IDS.RELATION_TYPE,
  SYSTEM_IDS.RELATION_INDEX,
  SYSTEM_IDS.RELATION_TO_ATTRIBUTE,
  SYSTEM_IDS.RELATION_FROM_ATTRIBUTE,
  SYSTEM_IDS.RELATION_TYPE_ATTRIBUTE,

  // Templates
  SYSTEM_IDS.TEMPLATE_ATTRIBUTE,

  // Data block views
  SYSTEM_IDS.VIEW_TYPE,
  SYSTEM_IDS.VIEW_ATTRIBUTE,
  SYSTEM_IDS.GALLERY_VIEW,
  SYSTEM_IDS.TABLE_VIEW,
  SYSTEM_IDS.LIST_VIEW,
  SYSTEM_IDS.PLACEHOLDER_TEXT,
  SYSTEM_IDS.PLACEHOLDER_IMAGE,
];

const names: Record<string, string> = {
  [SYSTEM_IDS.TYPES]: 'Types',
  [SYSTEM_IDS.NAME]: 'Name',
  [SYSTEM_IDS.ATTRIBUTE]: 'Attribute',
  [SYSTEM_IDS.RELATION_TYPE_ATTRIBUTE]: 'Relation Type',
  [SYSTEM_IDS.SPACE]: 'Indexed Space',
  [SYSTEM_IDS.ATTRIBUTES]: 'Attributes',
  [SYSTEM_IDS.SCHEMA_TYPE]: 'Type',
  [SYSTEM_IDS.TEMPLATE_ATTRIBUTE]: 'Template',
  [SYSTEM_IDS.VALUE_TYPE]: 'Value type',
  [SYSTEM_IDS.RELATION]: 'Relation',
  [SYSTEM_IDS.COLLECTION_VALUE_TYPE]: 'Collection',
  [SYSTEM_IDS.TEXT]: 'Text',

  [SYSTEM_IDS.IMAGE]: 'Image',
  [SYSTEM_IDS.IMAGE_URL_ATTRIBUTE]: 'Image URL',

  [SYSTEM_IDS.DATE]: 'Date',
  [SYSTEM_IDS.WEB_URL]: 'Web URL',
  [SYSTEM_IDS.IMAGE_ATTRIBUTE]: 'Image',
  [SYSTEM_IDS.DESCRIPTION]: 'Description',
  [SYSTEM_IDS.SPACE_CONFIGURATION]: 'Space',
  [SYSTEM_IDS.FOREIGN_TYPES]: 'Foreign Types',

  // Data blocks
  [SYSTEM_IDS.VIEW_TYPE]: 'View',
  [SYSTEM_IDS.TABLE_BLOCK]: 'Table Block',
  [SYSTEM_IDS.VIEW_ATTRIBUTE]: 'View',
  [SYSTEM_IDS.GALLERY_VIEW]: 'Gallery View',
  [SYSTEM_IDS.TABLE_VIEW]: 'Table View',
  [SYSTEM_IDS.LIST_VIEW]: 'List View',
  [SYSTEM_IDS.SHOWN_COLUMNS]: 'Shown Columns',
  [SYSTEM_IDS.TEXT_BLOCK]: 'Text Block',
  [SYSTEM_IDS.IMAGE_BLOCK]: 'Image Block',
  [SYSTEM_IDS.BLOCKS]: 'Blocks',
  [SYSTEM_IDS.PARENT_ENTITY]: 'Parent Entity',
  [SYSTEM_IDS.FILTER]: 'Filter',
  [SYSTEM_IDS.MARKDOWN_CONTENT]: 'Markdown Content',
  [SYSTEM_IDS.ROW_TYPE]: 'Row Type',
  [SYSTEM_IDS.PLACEHOLDER_IMAGE]: 'Placeholder Image',
  [SYSTEM_IDS.PLACEHOLDER_TEXT]: 'Placeholder Text',

  [SYSTEM_IDS.PERSON_TYPE]: 'Person',
  [SYSTEM_IDS.AVATAR_ATTRIBUTE]: 'Avatar',
  [SYSTEM_IDS.COVER_ATTRIBUTE]: 'Cover',
  [SYSTEM_IDS.WALLETS_ATTRIBUTE]: 'Wallets',
  [SYSTEM_IDS.BROADER_SPACES]: 'Broader Spaces',
  [SYSTEM_IDS.RELATION_VALUE_RELATIONSHIP_TYPE]: 'Relation Value Types',

  [SYSTEM_IDS.COLLECTION_TYPE]: 'Collection',
  [SYSTEM_IDS.RELATION_TYPE]: 'Relation',
  [SYSTEM_IDS.RELATION_INDEX]: 'Index',
  [SYSTEM_IDS.RELATION_TO_ATTRIBUTE]: 'To entity',
  [SYSTEM_IDS.RELATION_FROM_ATTRIBUTE]: 'From entity',
};

const versions: s.versions.Insertable[] = entities.map(e => {
  return {
    id: createVersionId({
      entityId: e,
      proposalId: PROPOSAL_ID,
    }),
    name: names[e],
    created_at: ROOT_SPACE_CREATED_AT,
    created_at_block: ROOT_SPACE_CREATED_AT_BLOCK,
    created_by_id: ROOT_SPACE_CREATED_BY_ID,
    edit_id: EDIT_ID,
    entity_id: e,
  };
});

const attributes: Record<string, string> = {
  [SYSTEM_IDS.TYPES]: SYSTEM_IDS.RELATION,
  [SYSTEM_IDS.TEMPLATE_ATTRIBUTE]: SYSTEM_IDS.RELATION,
  [SYSTEM_IDS.ATTRIBUTES]: SYSTEM_IDS.RELATION,
  [SYSTEM_IDS.RELATION_TYPE_ATTRIBUTE]: SYSTEM_IDS.RELATION,
  [SYSTEM_IDS.VALUE_TYPE]: SYSTEM_IDS.RELATION,
  [SYSTEM_IDS.IMAGE_ATTRIBUTE]: SYSTEM_IDS.TEXT,
  [SYSTEM_IDS.DESCRIPTION]: SYSTEM_IDS.TEXT,
  [SYSTEM_IDS.NAME]: SYSTEM_IDS.TEXT,
  [SYSTEM_IDS.SPACE]: SYSTEM_IDS.TEXT,

  // Data blocks
  [SYSTEM_IDS.VIEW_ATTRIBUTE]: SYSTEM_IDS.RELATION,
  [SYSTEM_IDS.FOREIGN_TYPES]: SYSTEM_IDS.RELATION,
  [SYSTEM_IDS.MARKDOWN_CONTENT]: SYSTEM_IDS.TEXT,
  [SYSTEM_IDS.ROW_TYPE]: SYSTEM_IDS.RELATION,
  [SYSTEM_IDS.BLOCKS]: SYSTEM_IDS.RELATION,
  [SYSTEM_IDS.PARENT_ENTITY]: SYSTEM_IDS.RELATION,
  [SYSTEM_IDS.FILTER]: SYSTEM_IDS.TEXT,
  [SYSTEM_IDS.PLACEHOLDER_IMAGE]: SYSTEM_IDS.RELATION,
  [SYSTEM_IDS.PLACEHOLDER_TEXT]: SYSTEM_IDS.TEXT,

  [SYSTEM_IDS.RELATION_VALUE_RELATIONSHIP_TYPE]: SYSTEM_IDS.RELATION,
  [SYSTEM_IDS.AVATAR_ATTRIBUTE]: SYSTEM_IDS.IMAGE,
  [SYSTEM_IDS.COVER_ATTRIBUTE]: SYSTEM_IDS.IMAGE,
  [SYSTEM_IDS.WALLETS_ATTRIBUTE]: SYSTEM_IDS.RELATION,
  [SYSTEM_IDS.RELATION_INDEX]: SYSTEM_IDS.TEXT,
  [SYSTEM_IDS.RELATION_TO_ATTRIBUTE]: SYSTEM_IDS.RELATION,
  [SYSTEM_IDS.RELATION_FROM_ATTRIBUTE]: SYSTEM_IDS.RELATION,

  [SYSTEM_IDS.IMAGE_URL_ATTRIBUTE]: SYSTEM_IDS.WEB_URL,
  [SYSTEM_IDS.BROADER_SPACES]: SYSTEM_IDS.RELATION,
};

// These types include the default types and attributes for a given type. There might be more
// attributes on a type than are listed here if they were later added by users.
const types: Record<string, string[]> = {
  [SYSTEM_IDS.SCHEMA_TYPE]: [SYSTEM_IDS.TEMPLATE_ATTRIBUTE],
  [SYSTEM_IDS.VIEW_TYPE]: [],
  [SYSTEM_IDS.TEXT]: [],
  [SYSTEM_IDS.RELATION]: [],
  [SYSTEM_IDS.IMAGE]: [SYSTEM_IDS.IMAGE_URL_ATTRIBUTE],
  [SYSTEM_IDS.DATE]: [],
  [SYSTEM_IDS.WEB_URL]: [],
  [SYSTEM_IDS.ATTRIBUTE]: [SYSTEM_IDS.VALUE_TYPE],
  [SYSTEM_IDS.SPACE_CONFIGURATION]: [SYSTEM_IDS.FOREIGN_TYPES, SYSTEM_IDS.BLOCKS],
  [SYSTEM_IDS.IMAGE_BLOCK]: [SYSTEM_IDS.IMAGE_ATTRIBUTE, SYSTEM_IDS.PARENT_ENTITY],
  [SYSTEM_IDS.TABLE_BLOCK]: [SYSTEM_IDS.ROW_TYPE, SYSTEM_IDS.PARENT_ENTITY],
  [SYSTEM_IDS.TEXT_BLOCK]: [SYSTEM_IDS.MARKDOWN_CONTENT, SYSTEM_IDS.PARENT_ENTITY],
  [SYSTEM_IDS.PERSON_TYPE]: [SYSTEM_IDS.AVATAR_ATTRIBUTE, SYSTEM_IDS.COVER_ATTRIBUTE],
  [SYSTEM_IDS.RELATION_TYPE]: [
    SYSTEM_IDS.RELATION_INDEX,
    SYSTEM_IDS.RELATION_TO_ATTRIBUTE,
    SYSTEM_IDS.RELATION_FROM_ATTRIBUTE,
    SYSTEM_IDS.RELATION_TYPE_ATTRIBUTE,
  ],
};

const relationTypes: Record<string, string[]> = {
  [SYSTEM_IDS.TYPES]: [SYSTEM_IDS.ATTRIBUTES],
  [SYSTEM_IDS.ATTRIBUTES]: [SYSTEM_IDS.VALUE_TYPE],
};

const geoEntities: s.entities.Insertable[] = entities.map(
  (entity): s.entities.Insertable => ({
    id: entity,
    created_by_id: ROOT_SPACE_CREATED_BY_ID,
    created_at_block: ROOT_SPACE_CREATED_AT_BLOCK,
    created_at: ROOT_SPACE_CREATED_AT,
    updated_at: ROOT_SPACE_CREATED_AT,
    updated_at_block: ROOT_SPACE_CREATED_AT_BLOCK,
  })
);

const namesTriples: s.triples.Insertable[] = Object.entries(names).map(
  ([id, name]): s.triples.Insertable => ({
    version_id: versions.find(v => v.entity_id === id)!.id,
    entity_id: id,
    attribute_id: SYSTEM_IDS.NAME,
    value_type: 'TEXT',
    text_value: name,
    space_id: SYSTEM_IDS.ROOT_SPACE_ID,
    created_at_block: ROOT_SPACE_CREATED_AT_BLOCK,
    created_at: ROOT_SPACE_CREATED_AT,
  })
);

// @TODO: Make attribute relations

// Make the type entities themselves and any relations that they have
const makeTypeRelations = () => {
  const relationsToWrite: s.relations.Insertable[] = [];
  const triplesToWrite: s.triples.Insertable[] = [];

  // Make the relation triples for the type entity. For every type we need
  // to make a relation entity to represent the type
  for (const [typeEntityId] of Object.entries(types)) {
    const versionId = entities.find(e => e === typeEntityId)!;

    // Create all the relationship triples for the Types -> Type relation
    const typeRelationshipTriples = createRelationship({
      relationTypeId: SYSTEM_IDS.TYPES,
      fromId: typeEntityId,
      toId: SYSTEM_IDS.SCHEMA_TYPE,
    }).map(op =>
      getTripleFromOp(op, SYSTEM_IDS.ROOT_SPACE_ID, versionId, {
        blockNumber: ROOT_SPACE_CREATED_AT_BLOCK,
        cursor: '',
        requestId: '',
        timestamp: ROOT_SPACE_CREATED_AT,
      })
    );

    // Make a relation of Types -> Type
    relationsToWrite.push({
      id: createGeoId(), // Not deterministic
      type_of_id: versions.find(v => v.entity_id === SYSTEM_IDS.TYPES)!.id, // Making a relation of Type -> Type, i.e., this entity is a Type
      from_version_id: versions.find(v => v.entity_id === typeEntityId)!.id,
      to_version_id: versions.find(v => v.entity_id === SYSTEM_IDS.SCHEMA_TYPE)!.id,
      index: INITIAL_COLLECTION_ITEM_INDEX,
      entity_id: typeRelationshipTriples[0]!.entity_id,
    });

    triplesToWrite.push(...typeRelationshipTriples);
  }

  // For every attribute on the type we need to create a relations entity
  for (const [typeId, attributeIds] of Object.entries(types)) {
    // Create a relationship and all of the triples for each Attribute on the Type
    // e.g.,
    // Person -> Attribute -> Age
    // Person -> Attribute -> Date of Birth
    for (const attributeId of attributeIds) {
      const versionId = entities.find(e => e === attributeId)!;

      const relationshipTriples = createRelationship({
        relationTypeId: SYSTEM_IDS.ATTRIBUTES,
        fromId: typeId,
        toId: attributeId,
      }).map(op =>
        getTripleFromOp(op, SYSTEM_IDS.ROOT_SPACE_ID, versionId, {
          blockNumber: ROOT_SPACE_CREATED_AT_BLOCK,
          cursor: '',
          requestId: '',
          timestamp: ROOT_SPACE_CREATED_AT,
        })
      );

      // Create the relation of Relation type -> Attributes
      relationsToWrite.push({
        // @TODO: we don't need entity_id if we can use the id as the entity_id
        id: relationshipTriples[0]!.entity_id,
        from_version_id: versions.find(v => v.entity_id === typeId)!.id,
        type_of_id: versions.find(v => v.entity_id === SYSTEM_IDS.ATTRIBUTES)!.id, // Making a relation of type Attribute
        to_version_id: versions.find(v => v.entity_id === attributeId)!.id,
        index: INITIAL_COLLECTION_ITEM_INDEX,
        entity_id: relationshipTriples[0]!.entity_id,
      });

      // Make the relation of Type -> Attribute for the attribute entity
      // Don't add this relation if it already exists.
      if (!relationsToWrite.find(r => r.id === attributeId)) {
        relationsToWrite.push({
          id: attributeId,
          from_version_id: versions.find(v => v.entity_id === attributeId)!.id,
          type_of_id: versions.find(v => v.entity_id === SYSTEM_IDS.TYPES)!.id,
          to_version_id: versions.find(v => v.entity_id === SYSTEM_IDS.ATTRIBUTES)!.id,
          index: INITIAL_COLLECTION_ITEM_INDEX,
          entity_id: attributeId,
        });
      }

      const relationValueTypeIdForAttribute = attributes[attributeId];

      if (relationValueTypeIdForAttribute) {
        const relationValueTypeRelationId = createGeoId();

        // Make the relation of Relation Value Type -> Value Type for the attribute entity.
        // Don't add this relation if it already exists.
        if (!relationsToWrite.find(r => r.id === relationValueTypeRelationId)) {
          relationsToWrite.push({
            id: relationValueTypeRelationId,
            from_version_id: versions.find(v => v.entity_id === attributeId)!.id,
            type_of_id: versions.find(v => v.entity_id === SYSTEM_IDS.RELATION_VALUE_RELATIONSHIP_TYPE)!.id,
            to_version_id: versions.find(v => v.entity_id === relationValueTypeIdForAttribute)!.id,
            index: INITIAL_COLLECTION_ITEM_INDEX,
            entity_id: relationValueTypeRelationId,
          });
        }
      }

      triplesToWrite.push(...relationshipTriples);
    }
  }

  return {
    relationsForTypesAndAttributes: relationsToWrite,
    triplesForTypesAndAttributes: triplesToWrite,
  };
};

const space: s.spaces.Insertable = {
  id: SYSTEM_IDS.ROOT_SPACE_ID,
  dao_address: SYSTEM_IDS.ROOT_SPACE_ADDRESS,
  is_root_space: true,
  type: 'public',
  created_at_block: ROOT_SPACE_CREATED_AT_BLOCK,
};

const account: s.accounts.Insertable = {
  id: ROOT_SPACE_CREATED_BY_ID,
};

const proposal: s.proposals.Insertable = {
  id: PROPOSAL_ID,
  onchain_proposal_id: '-1',
  created_by_id: ROOT_SPACE_CREATED_BY_ID,
  plugin_address: '',
  space_id: SYSTEM_IDS.ROOT_SPACE_ID,
  type: 'ADD_EDIT',
  status: 'accepted',
  start_time: ROOT_SPACE_CREATED_AT,
  end_time: ROOT_SPACE_CREATED_AT,
  edit_id: EDIT_ID,
};

const edit: s.edits.Insertable = {
  id: '0',
  name: 'Root Space Bootstrap',
  description: null,
  uri: '',
  created_at_block: ROOT_SPACE_CREATED_AT_BLOCK.toString(),
  created_at: ROOT_SPACE_CREATED_AT,
  created_by_id: ROOT_SPACE_CREATED_BY_ID,
  space_id: SYSTEM_IDS.ROOT_SPACE_ID,
};

const currentVersions: s.current_versions.Insertable[] = versions.map(v => {
  return {
    entity_id: v.entity_id,
    version_id: v.id,
  };
});

export class BootstrapRootError extends Error {
  _tag: 'BootstrapRootError' = 'BootstrapRootError';
}

export function bootstrapRoot() {
  return Effect.gen(function* (_) {
    // When binding the attributes schema to a type entity we
    // create collections to store many attributes. We need
    // to insert these collections into the Collections table.
    const { relationsForTypesAndAttributes, triplesForTypesAndAttributes } = makeTypeRelations();
    const entitiesForRelations = relationsForTypesAndAttributes.map(
      (r): s.entities.Insertable => ({
        id: r.entity_id,
        created_by_id: ROOT_SPACE_CREATED_BY_ID,
        created_at: ROOT_SPACE_CREATED_AT,
        created_at_block: ROOT_SPACE_CREATED_AT_BLOCK,
        updated_at: ROOT_SPACE_CREATED_AT,
        updated_at_block: ROOT_SPACE_CREATED_AT_BLOCK,
      })
    );

    yield _(
      Effect.tryPromise({
        try: async () => {
          const typesToWrite = relationsForTypesAndAttributes.filter(r => r.type_of_id === SYSTEM_IDS.TYPES);
          const attributesToWrite = relationsForTypesAndAttributes.filter(
            r => r.type_of_id === SYSTEM_IDS.RELATION_TYPE
          );

          await Spaces.upsert([space]);
          // @TODO: Add types from relations to db.entity_types
          await Promise.all([Accounts.upsert([account]), Proposals.upsert([proposal]), Edits.upsert([edit])]);

          // We write these separately since they might change the same entity which
          // results in a INSERT ON CONFLICT DO error
          await Entities.upsert(geoEntities);
          await Entities.upsert(entitiesForRelations);

          const entitySpaces = geoEntities.map(e => ({ version_id: e.id, space_id: SYSTEM_IDS.ROOT_SPACE_ID }));
          const relationSpaces = entitiesForRelations.map(e => ({
            version_id: e.id,
            space_id: SYSTEM_IDS.ROOT_SPACE_ID,
          }));

          await Promise.all([
            Versions.upsert(versions),
            Relations.upsert(relationsForTypesAndAttributes),
            Triples.insert([...namesTriples, ...triplesForTypesAndAttributes]),
            Types.upsert(
              [...typesToWrite, ...attributesToWrite].map(r => ({
                type_id: r.type_of_id,
                version_id: r.from_version_id,
                created_at_block: ROOT_SPACE_CREATED_AT_BLOCK,
                created_at: ROOT_SPACE_CREATED_AT,
              }))
            ),
            EntitySpaces.upsert([...entitySpaces, ...relationSpaces]),
          ]);

          await CurrentVersions.upsert(currentVersions);
        },
        catch: error => new BootstrapRootError(String(error)),
      })
    );
  });
}
