/* eslint-disable node/no-missing-import */
import { Space } from '../build/types'
import { EntryAddedEventObject } from '../build/types/contracts/Space'

import { findEvent } from './findEvent'

export async function addEntry(spaceContract: Space, uri: string) {
  const mintTx = await spaceContract.addEntry(uri)
  const transferEvent = await findEvent(mintTx, 'EntryAdded')
  const eventObject = transferEvent.args as unknown as EntryAddedEventObject
  return eventObject
}
