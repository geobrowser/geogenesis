import {
  CreateEntityAction,
  CreateTripleAction,
  EntityValue,
  StringValue,
} from '@geogenesis/action-schema/assembly'
import { BigInt, log } from '@graphprotocol/graph-ts'
import { handleAction, handleCreateTripleAction } from './actions'

export function bootstrap(space: string, createdAtBlock: BigInt): void {
  log.debug(`Bootstrapping space ${space}!`, [])

  handleAction(new CreateEntityAction('type'), space, createdAtBlock)
  handleAction(new CreateEntityAction('name'), space, createdAtBlock)
  handleAction(new CreateEntityAction('attribute'), space, createdAtBlock)
  handleAction(new CreateEntityAction('space'), space, createdAtBlock)

  handleCreateTripleAction({
    fact: new CreateTripleAction(
      'type',
      'name',
      new StringValue('type', 'Type')
    ),
    space,
    isProtected: true,
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
}
