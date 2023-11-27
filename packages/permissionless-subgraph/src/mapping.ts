import { Space } from '../generated/schema'
import {
  EntryAdded,
  RoleGranted,
  RoleRevoked,
} from '../generated/templates/Space/Space'
import { addEntry } from './add-entry'
import { addRole, removeRole } from './access-control'
import { BigInt } from '@graphprotocol/graph-ts'

export function handleEntryAdded(event: EntryAdded): void {
  const address = event.address.toHexString()

  const rootSpace = Space.load(address)

  if (rootSpace && rootSpace.isRootSpace) {
    return
  }

  // HACK to avoid a breaking proposal over thanksgiving weekend
  // "hash": "0x30f8c9a314342764eb53a7ecfef597e78e4a6c0945152e86eeb807521433e4b9",
  // "number": "50271786"
  if (event.block.number.toString().split('.')[0] == '50271786') {
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
