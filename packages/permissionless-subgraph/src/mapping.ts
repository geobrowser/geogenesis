import { Space } from '../generated/schema'
import {
  EntryAdded,
  RoleGranted,
  RoleRevoked,
} from '../generated/templates/Space/Space'
import { addEntry } from './add-entry'
import { addRole, removeRole } from './access-control'

export function handleEntryAdded(event: EntryAdded): void {
  const address = event.address.toHexString()

  const rootSpace = Space.load(address)

  if (rootSpace && rootSpace.isRootSpace) {
    return
  }

  addEntry({
    space: address,
    index: event.params.index,
    uri: event.params.uri,
    createdBy: event.params.author,
    createdAtBlock: event.block.number,
    createdAtTimestamp: event.block.timestamp,
  })
}

export function handleRoleGranted(event: RoleGranted): void {
  addRole({
    space: event.address,
    role: event.params.role,
    account: event.params.account,
    createdAtBlock: event.block.number,
  })
}

export function handleRoleRevoked(event: RoleRevoked): void {
  removeRole({
    space: event.address,
    role: event.params.role,
    account: event.params.account,
    createdAtBlock: event.block.number,
  })
}
