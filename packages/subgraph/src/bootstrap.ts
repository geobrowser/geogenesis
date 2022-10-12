import {
  CreateEntityAction,
  CreateTripleAction,
  EntityValue,
  StringValue,
} from '@geogenesis/action-schema/assembly'
import { log } from '@graphprotocol/graph-ts'
import { GeoEntity } from '../generated/schema'
import { handleAction, handleCreateTripleAction } from './actions'

export function bootstrap(): void {
  // Check if a bootstrapped type already exists
  if (GeoEntity.load('type')) return

  log.debug(`Bootstrapping!`, [])

  handleAction(new CreateEntityAction('type'))
  handleAction(new CreateEntityAction('name'))
  handleCreateTripleAction(
    new CreateTripleAction('type', 'name', new StringValue('Is a')),
    true
  )
  handleCreateTripleAction(
    new CreateTripleAction('name', 'name', new StringValue('Name')),
    true
  )
}
