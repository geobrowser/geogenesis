/* eslint-disable node/no-missing-import */
import { Log } from '../build/types'
import { EntryAddedEventObject } from '../build/types/contracts/Log'

import { findEvent } from './findEvent'

export async function addEntry(logContract: Log, uri: string) {
  const mintTx = await logContract.addEntry(uri)
  const transferEvent = await findEvent(mintTx, 'EntryAdded')
  const eventObject = transferEvent.args as unknown as EntryAddedEventObject
  return eventObject
}
