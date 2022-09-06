import { DataURI } from '@geogenesis/data-uri/assembly'
import { Bytes, log } from '@graphprotocol/graph-ts'
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
      statement.mimeType = dataURI.mimeType
      statement.decoded = Bytes.fromUint8Array(dataURI.data)
    }
  }

  statement.save()

  log.debug(`Indexed: ${statement.uri}`, [])
}
