import {
  CreateEntityAction,
  CreateTripleAction,
  EntityValue,
  StringValue,
} from '@geogenesis/action-schema/assembly'
import { BigInt, log } from '@graphprotocol/graph-ts'
import { handleAction, handleCreateTripleAction } from './actions'

export function bootstrap(space: string, blocknumber: BigInt): void {
  log.debug(`Bootstrapping space ${space}!`, [])

  handleAction(new CreateEntityAction('type'), space, blocknumber)
  handleAction(new CreateEntityAction('name'), space, blocknumber)
  handleAction(new CreateEntityAction('attribute'), space, blocknumber)
  handleAction(new CreateEntityAction('space'), space, blocknumber)

  // handleCreateTripleAction({
  //   fact: new CreateTripleAction('type', 'name', new StringValue('Is a')),
  //   space,
  //   isProtected: true,
  //   isRootSpace,
  // })

  // handleCreateTripleAction({
  //   fact: new CreateTripleAction('name', 'name', new StringValue('Name')),
  //   space,
  //   isProtected: true,
  //   isRootSpace,
  // })

  // handleCreateTripleAction({
  //   fact: new CreateTripleAction(
  //     'attribute',
  //     'name',
  //     new StringValue('Attribute')
  //   ),
  //   space,
  //   isProtected: true,
  //   isRootSpace,
  // })

  // handleCreateTripleAction({
  //   fact: new CreateTripleAction('space', 'name', new StringValue('Space')),
  //   space,
  //   isProtected: true,
  //   isRootSpace,
  // })

  // handleCreateTripleAction({
  //   fact: new CreateTripleAction('name', 'type', new EntityValue('attribute')),
  //   space,
  //   isProtected: true,
  //   isRootSpace,
  // })

  // handleCreateTripleAction({
  //   fact: new CreateTripleAction('type', 'type', new EntityValue('attribute')),
  //   space,
  //   isProtected: true,
  //   isRootSpace,
  // })
}
