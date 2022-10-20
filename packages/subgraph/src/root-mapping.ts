import { dataSource, log } from '@graphprotocol/graph-ts'
import { Space } from '../generated/schema'
import { EntryAdded as RegistryEntryAdded } from '../generated/SpaceRegistry/SpaceRegistry'
import { handleSpaceAdded } from './actions'
import { addEntry } from './add-entry'
import { getChecksumAddress } from './get-checksum-address'

export function handleRootEntryAdded(event: RegistryEntryAdded): void {
  const address = getChecksumAddress(event.address.toHexString())
  const isRootSpace = true
  const blocknumber = event.block.number

  if (!Space.load(address)) {
    log.debug(`Bootstrapping space registry!`, [])
    handleSpaceAdded(address, isRootSpace, blocknumber)
  }

  const space = address
  const index = event.params.index
  const uri = event.params.uri
  const author = event.params.author

  addEntry({ space, index, uri, author, blocknumber })
}
