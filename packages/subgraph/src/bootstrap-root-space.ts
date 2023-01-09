import {
  CreateEntityAction,
  CreateTripleAction,
  EntityValue,
  StringValue,
} from '@geogenesis/action-schema/assembly'
import { BigInt, log } from '@graphprotocol/graph-ts'
import { handleAction, handleCreateTripleAction } from './actions'

/* TODO: Unify apps/web/modules/constants.ts and this file for blessed UUIDs*/
const ATTRIBUTES_ID = '01412f83-8189-4ab1-8365-65c7fd358cc1'
const SCHEMA_TYPE_ID = 'd7ab4092-0ab5-441e-88c3-5c27952de773'

const VALUE_TYPE_ID = '9f262759-0eb4-4348-8321-c32f7f7b2ef5'
const RELATION_ID = '62155c3d-e48f-4b8a-981b-865d605217ce'
const TEXT_ID = '40455aba-2436-480a-b1a0-ba801729ea75'

export function bootstrap(space: string, createdAtBlock: BigInt): void {
  log.debug(`Bootstrapping space ${space}!`, [])

  handleAction(new CreateEntityAction('type'), space, createdAtBlock)
  handleAction(new CreateEntityAction('name'), space, createdAtBlock)
  handleAction(new CreateEntityAction('attribute'), space, createdAtBlock)
  handleAction(new CreateEntityAction('space'), space, createdAtBlock)
  handleAction(new CreateEntityAction(ATTRIBUTES_ID), space, createdAtBlock)
  handleAction(new CreateEntityAction(SCHEMA_TYPE_ID), space, createdAtBlock)
  handleAction(new CreateEntityAction(VALUE_TYPE_ID), space, createdAtBlock)
  handleAction(new CreateEntityAction(RELATION_ID), space, createdAtBlock)
  handleAction(new CreateEntityAction(TEXT_ID), space, createdAtBlock)

  handleCreateTripleAction({
    fact: new CreateTripleAction(
      'type',
      'name',
      new StringValue('type', 'Types')
    ),
    space,
    isProtected: false,
    createdAtBlock,
  })

  handleCreateTripleAction({
    fact: new CreateTripleAction(
      'name',
      'name',
      new StringValue('name', 'Name')
    ),
    space,
    isProtected: true,
    createdAtBlock,
  })

  handleCreateTripleAction({
    fact: new CreateTripleAction(
      'attribute',
      'name',
      new StringValue('attribute', 'Attribute')
    ),
    space,
    isProtected: true,
    createdAtBlock,
  })

  handleCreateTripleAction({
    fact: new CreateTripleAction(
      'space',
      'name',
      new StringValue('space', 'Space')
    ),
    space,
    isProtected: true,
    createdAtBlock,
  })

  handleCreateTripleAction({
    fact: new CreateTripleAction(
      ATTRIBUTES_ID,
      'name',
      new StringValue('attributes', 'Attributes')
    ),
    space,
    isProtected: true,
    createdAtBlock,
  })

  handleCreateTripleAction({
    fact: new CreateTripleAction(
      SCHEMA_TYPE_ID,
      'name',
      new StringValue('schema-type', 'Type')
    ),
    space,
    isProtected: true,
    createdAtBlock,
  })

  handleCreateTripleAction({
    fact: new CreateTripleAction(
      VALUE_TYPE_ID,
      'name',
      new StringValue('value-type', 'Value type')
    ),
    space,
    isProtected: true,
    createdAtBlock,
  })

  handleCreateTripleAction({
    fact: new CreateTripleAction(
      RELATION_ID,
      'name',
      new StringValue('relation', 'Relation')
    ),
    space,
    isProtected: true,
    createdAtBlock,
  })

  handleCreateTripleAction({
    fact: new CreateTripleAction(
      TEXT_ID,
      'name',
      new StringValue('text', 'Text')
    ),
    space,
    isProtected: true,
    createdAtBlock,
  })

  handleCreateTripleAction({
    fact: new CreateTripleAction('name', 'type', new EntityValue('attribute')),
    space,
    isProtected: true,
    createdAtBlock,
  })

  handleCreateTripleAction({
    fact: new CreateTripleAction('type', 'type', new EntityValue('attribute')),
    space,
    isProtected: true,
    createdAtBlock,
  })

  handleCreateTripleAction({
    fact: new CreateTripleAction('space', 'type', new EntityValue('attribute')),
    space,
    isProtected: true,
    createdAtBlock,
  })

  handleCreateTripleAction({
    fact: new CreateTripleAction(
      ATTRIBUTES_ID,
      'type',
      new EntityValue('attribute')
    ),
    space,
    isProtected: true,
    createdAtBlock,
  })

  handleCreateTripleAction({
    fact: new CreateTripleAction(
      SCHEMA_TYPE_ID,
      'type',
      new EntityValue('attribute')
    ),
    space,
    isProtected: true,
    createdAtBlock,
  })

  handleCreateTripleAction({
    fact: new CreateTripleAction(
      VALUE_TYPE_ID,
      'type',
      new EntityValue('attribute')
    ),
    space,
    isProtected: true,
    createdAtBlock,
  })

  handleCreateTripleAction({
    fact: new CreateTripleAction(
      RELATION_ID,
      'type',
      new EntityValue(SCHEMA_TYPE_ID)
    ),
    space,
    isProtected: true,
    createdAtBlock,
  })

  handleCreateTripleAction({
    fact: new CreateTripleAction(
      TEXT_ID,
      'type',
      new EntityValue(SCHEMA_TYPE_ID)
    ),
    space,
    isProtected: true,
    createdAtBlock,
  })
}
