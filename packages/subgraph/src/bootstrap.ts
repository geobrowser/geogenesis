import {
  CreateEntityAction,
  CreateTripleAction,
  EntityValue,
  StringValue,
} from '@geogenesis/action-schema/assembly'
import {
  ATTRIBUTE,
  ATTRIBUTES,
  AVATAR_ATTRIBUTE,
  BLOCKS,
  COLLECTION_TYPE,
  COLLECTION,
  COVER_ATTRIBUTE,
  DESCRIPTION,
  FILTER,
  FOREIGN_TYPES,
  IMAGE,
  IMAGE_ATTRIBUTE,
  IMAGE_BLOCK,
  MARKDOWN_CONTENT,
  NAME,
  PARENT_ENTITY,
  RELATION,
  ROW_TYPE,
  SCHEMA_TYPE,
  SPACE,
  SPACE_CONFIGURATION,
  TABLE_BLOCK,
  SHOWN_COLUMNS,
  TEXT,
  TEXT_BLOCK,
  TYPES,
  VALUE_TYPE,
  RELATION_VALUE_RELATIONSHIP_TYPE,
  DATE,
  WEB_URL,
} from '@geogenesis/ids/system-ids'
import { Address, BigInt, log } from '@graphprotocol/graph-ts'
import {
  createProposedVersion,
  createVersion,
  getOrCreateActionCount,
  handleAction,
} from './actions'
import { getEntityId, getOrCreateProposal } from './add-entry'

const entities: string[] = [
  TYPES,
  ATTRIBUTES,
  SCHEMA_TYPE,
  VALUE_TYPE,
  COLLECTION_TYPE,
  COLLECTION,
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
]

class Tuple<T, U> {
  _0: T
  _1: U
}

const names: Tuple<string, StringValue>[] = [
  { _0: TYPES, _1: new StringValue(TYPES, 'Types') },
  { _0: NAME, _1: new StringValue(NAME, 'Name') },
  { _0: ATTRIBUTE, _1: new StringValue(ATTRIBUTE, 'Attribute') },
  { _0: SPACE, _1: new StringValue(SPACE, 'Space') },
  { _0: ATTRIBUTES, _1: new StringValue(ATTRIBUTES, 'Attributes') },
  { _0: SCHEMA_TYPE, _1: new StringValue(SCHEMA_TYPE, 'Type') },
  { _0: VALUE_TYPE, _1: new StringValue(VALUE_TYPE, 'Value type') },
  { _0: RELATION, _1: new StringValue(RELATION, 'Relation') },
  { _0: COLLECTION, _1: new StringValue(COLLECTION, 'Collection Value') },
  { _0: COLLECTION_TYPE, _1: new StringValue(COLLECTION_TYPE, 'Collection') },
  { _0: RELATION, _1: new StringValue(RELATION, 'Relation') },
  { _0: TEXT, _1: new StringValue(TEXT, 'Text') },
  { _0: IMAGE, _1: new StringValue(TEXT, 'Image') },
  { _0: DATE, _1: new StringValue(DATE, 'Date') },
  { _0: WEB_URL, _1: new StringValue(WEB_URL, 'Web URL') },
  { _0: IMAGE_ATTRIBUTE, _1: new StringValue(IMAGE_ATTRIBUTE, 'Image') },
  { _0: DESCRIPTION, _1: new StringValue(DESCRIPTION, 'Description') },
  {
    _0: SPACE_CONFIGURATION,
    _1: new StringValue(SPACE_CONFIGURATION, 'Space Configuration'),
  },
  { _0: FOREIGN_TYPES, _1: new StringValue(FOREIGN_TYPES, 'Foreign Types') },
  { _0: TABLE_BLOCK, _1: new StringValue(TABLE_BLOCK, 'Table Block') },
  { _0: SHOWN_COLUMNS, _1: new StringValue(SHOWN_COLUMNS, 'Shown Columns') },
  { _0: TEXT_BLOCK, _1: new StringValue(TEXT_BLOCK, 'Text Block') },
  { _0: IMAGE_BLOCK, _1: new StringValue(IMAGE_BLOCK, 'Image Block') },
  { _0: BLOCKS, _1: new StringValue(BLOCKS, 'Blocks') },
  { _0: PARENT_ENTITY, _1: new StringValue(PARENT_ENTITY, 'Parent Entity') },
  {
    _0: MARKDOWN_CONTENT,
    _1: new StringValue(MARKDOWN_CONTENT, 'Markdown Content'),
  },
  { _0: ROW_TYPE, _1: new StringValue(ROW_TYPE, 'Row Type') },
  { _0: AVATAR_ATTRIBUTE, _1: new StringValue(AVATAR_ATTRIBUTE, 'Avatar') },
  { _0: COVER_ATTRIBUTE, _1: new StringValue(COVER_ATTRIBUTE, 'Cover') },
  { _0: FILTER, _1: new StringValue(FILTER, 'Filter') },
  {
    _0: RELATION_VALUE_RELATIONSHIP_TYPE,
    _1: new StringValue(
      RELATION_VALUE_RELATIONSHIP_TYPE,
      'Relation Value Types'
    ),
  },
]

/* Multi-dimensional array of [EntityId, ValueType] */
const attributes: Tuple<string, string>[] = [
  { _0: TYPES, _1: RELATION },
  { _0: ATTRIBUTES, _1: RELATION },
  { _0: VALUE_TYPE, _1: RELATION },
  { _0: IMAGE_ATTRIBUTE, _1: TEXT },
  { _0: DESCRIPTION, _1: TEXT },
  { _0: NAME, _1: TEXT },
  { _0: SPACE, _1: TEXT },
  { _0: FOREIGN_TYPES, _1: RELATION },
  { _0: MARKDOWN_CONTENT, _1: TEXT },
  { _0: ROW_TYPE, _1: RELATION },
  { _0: BLOCKS, _1: RELATION },
  { _0: PARENT_ENTITY, _1: RELATION },
  { _0: FILTER, _1: TEXT },
  { _0: RELATION_VALUE_RELATIONSHIP_TYPE, _1: RELATION },
]

/* Multi-dimensional array of [TypeId, [Attributes]] */
const types: Tuple<string, string[]>[] = [
  { _0: TEXT, _1: [] },
  { _0: RELATION, _1: [] },
  { _0: COLLECTION, _1: [] },
  { _0: COLLECTION_TYPE, _1: [] },
  { _0: IMAGE, _1: [] },
  { _0: DATE, _1: [] },
  { _0: WEB_URL, _1: [] },
  { _0: ATTRIBUTE, _1: [VALUE_TYPE] },
  { _0: SCHEMA_TYPE, _1: [ATTRIBUTES] },
  { _0: SPACE_CONFIGURATION, _1: [FOREIGN_TYPES] },
  { _0: IMAGE_BLOCK, _1: [IMAGE_ATTRIBUTE, PARENT_ENTITY] },
  { _0: TABLE_BLOCK, _1: [ROW_TYPE, PARENT_ENTITY] },
  { _0: TEXT_BLOCK, _1: [MARKDOWN_CONTENT, PARENT_ENTITY] },
]

export function bootstrapRootSpaceCoreTypes(
  space: string,
  createdAtBlock: BigInt,
  createdAtTimestamp: BigInt,
  createdBy: Address
): void {
  log.debug(`Bootstrapping root space ${space}!`, [])

  const proposalId = getOrCreateActionCount().count.toString()

  getOrCreateProposal(
    proposalId,
    createdBy,
    createdAtTimestamp,
    space,
    `Creating initial types for ${space}`,
    createdAtBlock
  )

  const entityToActionIds = new Map<string, string[]>()

  /* Create all of our entities */
  for (let i = 0; i < entities.length; i++) {
    const action = new CreateEntityAction(entities[i])
    const entityId = getEntityId(action)
    const actionId = handleAction(action, space, createdAtBlock)

    if (entityId && actionId) {
      const isSet = entityToActionIds.has(entityId)
      if (isSet) {
        const actions = entityToActionIds.get(entityId)
        entityToActionIds.set(entityId, actions.concat([actionId]))
      } else {
        entityToActionIds.set(entityId, [actionId])
      }
    }
  }

  /* Name all of our entities */
  for (let i = 0; i < names.length; i++) {
    const action = new CreateTripleAction(
      names[i]._0 as string,
      NAME,
      names[i]._1 as StringValue
    )
    const entityId = getEntityId(action)
    const actionId = handleAction(action, space, createdAtBlock)

    if (entityId && actionId) {
      const isSet = entityToActionIds.has(entityId)
      if (isSet) {
        const actions = entityToActionIds.get(entityId)
        entityToActionIds.set(entityId, actions.concat([actionId]))
      } else {
        entityToActionIds.set(entityId, [actionId])
      }
    }
  }

  /* Create our attributes of type "attribute" */
  for (let i = 0; i < attributes.length; i++) {
    const action = new CreateTripleAction(
      attributes[i]._0 as string,
      TYPES,
      new EntityValue(ATTRIBUTE)
    )
    const entityId = getEntityId(action)
    const actionId = handleAction(action, space, createdAtBlock)

    if (entityId && actionId) {
      const isSet = entityToActionIds.has(entityId)
      if (isSet) {
        const actions = entityToActionIds.get(entityId)
        entityToActionIds.set(entityId, actions.concat([actionId]))
      } else {
        entityToActionIds.set(entityId, [actionId])
      }
    }

    const action2 = new CreateTripleAction(
      attributes[i]._0 as string,
      VALUE_TYPE,
      new EntityValue(attributes[i]._1 as string)
    )
    const entityId2 = getEntityId(action2)
    const actionId2 = handleAction(action2, space, createdAtBlock)

    if (entityId2 && actionId2) {
      const isSet = entityToActionIds.has(entityId2)
      if (isSet) {
        const actions = entityToActionIds.get(entityId2)
        entityToActionIds.set(entityId2, actions.concat([actionId2]))
      } else {
        entityToActionIds.set(entityId2, [actionId2])
      }
    }
  }

  /* Create our types of type "type" */
  for (let i = 0; i < types.length; i++) {
    const action = new CreateTripleAction(
      types[i]._0 as string,
      TYPES,
      new EntityValue(SCHEMA_TYPE)
    )
    const entityId = getEntityId(action)
    const actionId = handleAction(action, space, createdAtBlock)

    if (entityId && actionId) {
      const isSet = entityToActionIds.has(entityId)
      if (isSet) {
        const actions = entityToActionIds.get(entityId)
        entityToActionIds.set(entityId, actions.concat([actionId]))
      } else {
        entityToActionIds.set(entityId, [actionId])
      }
    }

    /* Each type can have a set of attributes */
    for (let j = 0; j < types[i]._1.length; j++) {
      const action = new CreateTripleAction(
        types[i]._0 as string,
        ATTRIBUTES,
        new EntityValue(types[i]._1[j] as string)
      )
      const entityId = getEntityId(action)
      const actionId = handleAction(action, space, createdAtBlock)

      if (entityId && actionId) {
        const isSet = entityToActionIds.has(entityId)
        if (isSet) {
          const actions = entityToActionIds.get(entityId)
          entityToActionIds.set(entityId, actions.concat([actionId]))
        } else {
          entityToActionIds.set(entityId, [actionId])
        }
      }
    }

    // for every key in the map,
    const entityIds = entityToActionIds.keys()

    for (let i = 0; i < entityIds.length; i++) {
      const entityId = entityIds[i]
      const actionIds = entityToActionIds.get(entityIds[i])

      let proposedVersion = createProposedVersion(
        getOrCreateActionCount().count.toString(),
        createdAtTimestamp,
        actionIds,
        entityId,
        createdBy,
        proposalId,
        `Creating initial types for ${space}`,
        createdAtBlock
      )

      createVersion(
        entityId + '-' + getOrCreateActionCount().count.toString(),
        proposedVersion.id,
        createdAtTimestamp,
        entityId,
        createdBy,
        `Creating initial types for ${space}`,
        createdAtBlock
      )
    }
  }
}
