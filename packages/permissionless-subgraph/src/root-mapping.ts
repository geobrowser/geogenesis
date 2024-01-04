import { Address, BigInt, log } from '@graphprotocol/graph-ts'
import { Space } from '../generated/schema'
import { EntryAdded as RegistryEntryAdded } from '../generated/PermissionlessSpaceRegistry/PermissionlessSpaceRegistry'
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
