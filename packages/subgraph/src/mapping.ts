import { DataURI } from '@geogenesis/data-uri/assembly'
import { Bytes, json, log } from '@graphprotocol/graph-ts'
import { Statement } from '../generated/schema'
import { StatementAdded } from '../generated/StatementHistory/StatementHistory'

export function handleStatementAdded(event: StatementAdded): void {
  let statement = new Statement(event.params.index.toHex())

  const author = event.params.author
  const uri = event.params.uri

  statement.author = author
  statement.uri = uri

  if (uri.startsWith('data:')) {
    const dataURI = DataURI.parse(uri)

    if (dataURI) {
      const bytes = Bytes.fromUint8Array(dataURI.data)

      statement.mimeType = dataURI.mimeType
      statement.decoded = bytes

      if (statement.mimeType == 'application/json') {
        const result = json.fromBytes(bytes)
        log.debug(`Testing: ${result.toObject().mustGet('id').toString()}`, [])
      }
    }
  }

  statement.save()

  log.debug(`Indexed: ${statement.uri}`, [])
}
