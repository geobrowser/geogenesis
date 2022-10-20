import { log } from '@graphprotocol/graph-ts'
import { Space } from '../generated/schema'
import { EntryAdded as RegistryEntryAdded } from '../generated/SpaceRegistry/SpaceRegistry'
import { handleSpaceAdded } from './actions'
import { addEntry } from './add-entry'

export function handleRootEntryAdded(event: RegistryEntryAdded): void {
  const address = event.address.toHexString()
  const isRootSpace = true

  if (!Space.load(address)) {
    log.debug(`Bootstrapping space registry!`, [])
    handleSpaceAdded(address, isRootSpace)
  }

  const space = address
  const index = event.params.index
  const uri = event.params.uri
  const author = event.params.author

  addEntry({ space, index, uri, author }, isRootSpace)
}
