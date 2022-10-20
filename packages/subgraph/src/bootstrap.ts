import {
  CreateEntityAction,
  CreateTripleAction,
  EntityValue,
  StringValue,
} from '@geogenesis/action-schema/assembly'
import { log } from '@graphprotocol/graph-ts'
import { handleAction, handleCreateTripleAction } from './actions'

export function bootstrap(space: string): void {
  log.debug(`Bootstrapping space ${space}!`, [])

  handleAction(new CreateEntityAction('type'), space, false)
  handleAction(new CreateEntityAction('name'), space, false)
  handleCreateTripleAction({
    fact: new CreateTripleAction('type', 'name', new StringValue('Is a')),
    space,
    isProtected: true,
    isRootSpace: false,
  })
  handleCreateTripleAction({
    fact: new CreateTripleAction('name', 'name', new StringValue('Name')),
    space,
    isProtected: true,
    isRootSpace: false,
  })
}
