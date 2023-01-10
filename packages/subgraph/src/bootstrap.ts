import {
  CreateEntityAction,
  CreateTripleAction,
  EntityValue,
  StringValue,
} from '@geogenesis/action-schema/assembly'
import {
  ATTRIBUTE,
  ATTRIBUTES,
  DESCRIPTION,
  IMAGE_ATTRIBUTE,
  NAME,
  RELATION,
  SCHEMA_TYPE,
  SPACE,
  TEXT,
  TYPES,
  VALUE_TYPE,
} from '@geogenesis/ids/system-ids'
import { BigInt, log } from '@graphprotocol/graph-ts'
import { handleAction, handleCreateTripleAction } from './actions'

const entities: string[] = [
  TYPES,
  ATTRIBUTES,
  SCHEMA_TYPE,
  VALUE_TYPE,
  RELATION,
  TEXT,
  IMAGE_ATTRIBUTE,
  DESCRIPTION,
  DESCRIPTION,
  NAME,
  SPACE,
  ATTRIBUTE,
]

const names: [string, StringValue][] = [
  [TYPES, new StringValue(TYPES, 'Types')],
  [NAME, new StringValue(NAME, 'Name')],
  [ATTRIBUTE, new StringValue(ATTRIBUTE, 'Attribute')],
  [SPACE, new StringValue(SPACE, 'Space')],
  [ATTRIBUTES, new StringValue(ATTRIBUTES, 'Attributes')],
  [SCHEMA_TYPE, new StringValue(SCHEMA_TYPE, 'Type')],
  [VALUE_TYPE, new StringValue(VALUE_TYPE, 'Value type')],
  [RELATION, new StringValue(RELATION, 'Relation')],
  [TEXT, new StringValue(TEXT, 'Text')],
  [IMAGE_ATTRIBUTE, new StringValue(IMAGE_ATTRIBUTE, 'Image')],
  [DESCRIPTION, new StringValue(DESCRIPTION, 'Description')],
]

/* Multi-dimensional array of [EntityId, ValueType] */
const attributes: [string, string][] = [
  [TYPES, RELATION],
  [ATTRIBUTES, RELATION],
  [SCHEMA_TYPE, RELATION],
  [VALUE_TYPE, RELATION],
  [IMAGE_ATTRIBUTE, TEXT],
  [DESCRIPTION, TEXT],
  [NAME, TEXT],
  [SPACE, TEXT],
]

/* Multi-dimensional array of [TypeId, [Attributes]] */
const types: [string, string[]][] = [
  [TEXT, []],
  [RELATION, []],
  [ATTRIBUTE, [VALUE_TYPE]],
  [SCHEMA_TYPE, [ATTRIBUTES]],
]

export function bootstrapRootSpaceCoreTypes(
  space: string,
  createdAtBlock: BigInt
): void {
  log.debug(`Bootstrapping root space ${space}!`, [])

  /* Create all of our entities */
  for (let i = 0; i < entities.length; i++) {
    handleAction(new CreateEntityAction(entities[i]), space, createdAtBlock)
  }

  /* Name all of our entities */
  for (let i = 0; i < names.length; i++) {
    handleCreateTripleAction({
      fact: new CreateTripleAction(
        names[i][0] as string,
        NAME,
        names[i][1] as StringValue
      ),
      space,
      isProtected: false,
      createdAtBlock,
    })
  }

  /* Create our attributes of type "attribute" */
  for (let i = 0; i < attributes.length; i++) {
    handleCreateTripleAction({
      fact: new CreateTripleAction(
        attributes[i][0] as string,
        TYPES,
        new EntityValue(ATTRIBUTE)
      ),
      space,
      isProtected: false,
      createdAtBlock,
    })

    /* Each attribute can have a value type of TEXT or RELATION, more coming soon... */
    handleCreateTripleAction({
      fact: new CreateTripleAction(
        attributes[i][0] as string,
        VALUE_TYPE,
        new EntityValue(attributes[i][1] as string)
      ),
      space,
      isProtected: false,
      createdAtBlock,
    })
  }

  /* Create our types of type "type" */
  for (let i = 0; i < types.length; i++) {
    handleCreateTripleAction({
      fact: new CreateTripleAction(
        types[i][0] as string,
        TYPES,
        new EntityValue(SCHEMA_TYPE)
      ),
      space,
      isProtected: false,
      createdAtBlock,
    })

    /* Each type can have a set of attributes */
    for (let j = 0; j < types[i][1].length; j++) {
      handleCreateTripleAction({
        fact: new CreateTripleAction(
          types[i][0] as string,
          ATTRIBUTES,
          new EntityValue(types[i][1][j] as string)
        ),
        space,
        isProtected: false,
        createdAtBlock,
      })
    }
  }
}
