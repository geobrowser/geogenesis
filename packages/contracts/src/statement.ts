/* eslint-disable node/no-missing-import */
import { StatementHistory } from '../build/types'
import { StatementAddedEventObject } from '../build/types/contracts/StatementHistory'

import { findEvent } from './findEvent'

export async function addStatement(
  statementHistoryContract: StatementHistory,
  uri: string
) {
  const mintTx = await statementHistoryContract.addStatement(uri)
  const transferEvent = await findEvent(mintTx, 'StatementAdded')
  const eventObject = transferEvent.args as unknown as StatementAddedEventObject
  return eventObject
}
