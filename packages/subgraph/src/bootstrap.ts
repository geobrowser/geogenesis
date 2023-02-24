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
  SPACE_CONFIGURATION,
  FOREIGN_TYPES,
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
  SPACE_CONFIGURATION,
  FOREIGN_TYPES,
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
  { _0: TEXT, _1: new StringValue(TEXT, 'Text') },
  { _0: IMAGE_ATTRIBUTE, _1: new StringValue(IMAGE_ATTRIBUTE, 'Image') },
  { _0: DESCRIPTION, _1: new StringValue(DESCRIPTION, 'Description') },
  {
    _0: SPACE_CONFIGURATION,
    _1: new StringValue(SPACE_CONFIGURATION, 'Space Configuration'),
  },
  { _0: FOREIGN_TYPES, _1: new StringValue(FOREIGN_TYPES, 'Foreign Types') },
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
]

/* Multi-dimensional array of [TypeId, [Attributes]] */
const types: Tuple<string, string[]>[] = [
  { _0: TEXT, _1: [] },
  { _0: RELATION, _1: [] },
  { _0: ATTRIBUTE, _1: [VALUE_TYPE] },
  { _0: SCHEMA_TYPE, _1: [ATTRIBUTES] },
  { _0: SPACE_CONFIGURATION, _1: [FOREIGN_TYPES] },
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
        names[i]._0 as string,
        NAME,
        names[i]._1 as StringValue
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
        attributes[i]._0 as string,
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
        attributes[i]._0 as string,
        VALUE_TYPE,
        new EntityValue(attributes[i]._1 as string)
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
        types[i]._0 as string,
        TYPES,
        new EntityValue(SCHEMA_TYPE)
      ),
      space,
      isProtected: false,
      createdAtBlock,
    })

    /* Each type can have a set of attributes */
    for (let j = 0; j < types[i]._1.length; j++) {
      handleCreateTripleAction({
        fact: new CreateTripleAction(
          types[i]._0 as string,
          ATTRIBUTES,
          new EntityValue(types[i]._1[j] as string)
        ),
        space,
        isProtected: false,
        createdAtBlock,
      })
    }
  }
}
