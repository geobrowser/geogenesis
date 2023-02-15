import { PermissionlessSpace, Space } from '../build/types'
import { EntryAddedEventObject } from '../build/types/contracts/Space'

import { findEvent } from './find-event'

export async function addEntry(
  spaceContract: Space | PermissionlessSpace,
  uri: string
) {
  const mintTx = await spaceContract.addEntry(uri)
  const transferEvent = await findEvent(mintTx, 'EntryAdded')
  const eventObject = transferEvent.args as unknown as EntryAddedEventObject
  return eventObject
}
