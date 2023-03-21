import { Address, BigInt, log } from '@graphprotocol/graph-ts'
import { Space } from '../generated/schema'
import {
  EntryAdded as RegistryEntryAdded,
  RoleGranted,
  RoleRevoked,
} from '../generated/SpaceRegistry/SpaceRegistry'
import { addRole, removeRole } from './access-control'
import { handleSpaceAdded } from './actions'
import { addEntry } from './add-entry'
import { bootstrapRootSpaceCoreTypes } from './bootstrap'
import { getChecksumAddress } from './get-checksum-address'

export function handleRootEntryAdded(event: RegistryEntryAdded): void {
  const address = getChecksumAddress(event.address)
  const createdAtBlock = event.block.number
  const createdAtTimestamp = event.block.timestamp

  bootstrapRootSpace(
    address,
    createdAtBlock,
    createdAtTimestamp,
    event.transaction.from
  )

  addEntry({
    space: address,
    index: event.params.index,
    uri: event.params.uri,
    createdBy: event.params.author,
    createdAtBlock,
    createdAtTimestamp: event.block.timestamp,
  })
}

export function handleRoleGranted(event: RoleGranted): void {
  const address = getChecksumAddress(event.address)
  const createdAtBlock = event.block.number
  const createdAtTimestamp = event.block.timestamp

  bootstrapRootSpace(
    address,
    createdAtBlock,
    createdAtTimestamp,
    event.transaction.from
  )

  addRole({
    space: address,
    role: event.params.role,
    account: getChecksumAddress(event.params.account),
  })
}

export function handleRoleRevoked(event: RoleRevoked): void {
  const address = getChecksumAddress(event.address)
  const createdAtBlock = event.block.number
  const createdAtTimestamp = event.block.timestamp

  bootstrapRootSpace(
    address,
    createdAtBlock,
    createdAtTimestamp,
    event.transaction.from
  )

  removeRole({
    space: getChecksumAddress(event.address),
    role: event.params.role,
    account: getChecksumAddress(event.params.account),
  })
}

function bootstrapRootSpace(
  address: string,
  createdAtBlock: BigInt,
  createdAtTimestamp: BigInt,
  author: Address
): void {
  if (!Space.load(address)) {
    log.debug(`Bootstrapping space registry!`, [])
    bootstrapRootSpaceCoreTypes(
      address,
      createdAtBlock,
      createdAtTimestamp,
      author
    )
    handleSpaceAdded(address, true, createdAtBlock, null)
  }
}
