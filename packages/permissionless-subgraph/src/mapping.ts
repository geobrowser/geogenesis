import { Space } from '../generated/schema'
import {
  EntryAdded,
  RoleGranted,
  RoleRevoked,
} from '../generated/templates/Space/Space'
import { addRole, removeRole } from './access-control'
import { addEntry } from './add-entry'
import { getChecksumAddress } from './get-checksum-address'

export function handleEntryAdded(event: EntryAdded): void {
  const address = getChecksumAddress(event.address)

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
    space: getChecksumAddress(event.address),
    role: event.params.role,
    account: getChecksumAddress(event.params.account),
  })
}

export function handleRoleRevoked(event: RoleRevoked): void {
  removeRole({
    space: getChecksumAddress(event.address),
    role: event.params.role,
    account: getChecksumAddress(event.params.account),
  })
}
