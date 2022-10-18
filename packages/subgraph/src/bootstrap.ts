import {
  CreateEntityAction,
  CreateTripleAction,
  EntityValue,
  StringValue,
} from '@geogenesis/action-schema/assembly'
import { log } from '@graphprotocol/graph-ts'
// import { GeoEntity } from '../generated/schema'
import { handleAction, handleCreateTripleAction } from './actions'

export function bootstrap(space: string): void {
  // Check if a bootstrapped type already exists
  // if (GeoEntity.load('type')) return

  log.debug(`Bootstrapping space ${space}!`, [])

  handleAction(new CreateEntityAction('type'), space)
  handleAction(new CreateEntityAction('name'), space)
  handleCreateTripleAction(
    new CreateTripleAction('type', 'name', new StringValue('Is a')),
    space,
    true
  )
  handleCreateTripleAction(
    new CreateTripleAction('name', 'name', new StringValue('Name')),
    space,
    true
  )

  // Temporary entities, for simpler testing!
  handleAction(
    new CreateTripleAction('person', 'type', new EntityValue('type')),
    space
  )
  handleAction(
    new CreateTripleAction('person', 'name', new StringValue('Person')),
    space
  )
  handleAction(
    new CreateTripleAction('devin', 'type', new EntityValue('person')),
    space
  )
  handleAction(
    new CreateTripleAction('devin', 'name', new StringValue('Devin')),
    space
  )
}
