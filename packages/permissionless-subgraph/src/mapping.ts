import { Space } from '../generated/schema'
import { EntryAdded } from '../generated/templates/Space/Space'
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
