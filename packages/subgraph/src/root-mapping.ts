import { Address, BigInt, log } from '@graphprotocol/graph-ts'
import { Space } from '../generated/schema'
import {
  EntryAdded as RegistryEntryAdded,
  RoleGranted,
  RoleRevoked,
} from '../generated/SpaceRegistry/SpaceRegistry'
import { handleSpaceAdded } from './actions'
import { addEntry } from './add-entry'
import { addRole, removeRole } from './access-control'
import { getChecksumAddress } from './get-checksum-address'

export function handleRootEntryAdded(event: RegistryEntryAdded): void {
  const address = getChecksumAddress(event.address.toHexString())
  const createdAtBlock = event.block.number

  bootstrapRootSpace(address, createdAtBlock)

  addEntry({
    space: address,
    index: event.params.index,
    uri: event.params.uri,
    author: event.params.author,
    createdAtBlock,
  })
}

export function handleRoleGranted(event: RoleGranted): void {
  const address = getChecksumAddress(event.address.toHexString())
  const createdAtBlock = event.block.number

  bootstrapRootSpace(address, createdAtBlock)

  addRole({
    space: address,
    role: event.params.role,
    account: getChecksumAddress(event.params.account.toHexString()),
  })
}

export function handleRoleRevoked(event: RoleRevoked): void {
  const address = getChecksumAddress(event.address.toHexString())
  const createdAtBlock = event.block.number

  bootstrapRootSpace(address, createdAtBlock)

  removeRole({
    space: getChecksumAddress(event.address.toHexString()),
    role: event.params.role,
    account: getChecksumAddress(event.params.account.toHexString()),
  })
}

function bootstrapRootSpace(address: string, createdAtBlock: BigInt): void {
  if (!Space.load(address)) {
    log.debug(`Bootstrapping space registry!`, [])
    handleSpaceAdded(address, true, createdAtBlock)
  }
}
