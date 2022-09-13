import { DataURI } from '@geogenesis/data-uri/assembly'
import { Root } from '@geogenesis/fact-schema/assembly'
import { Bytes, log } from '@graphprotocol/graph-ts'
import { JSON } from 'assemblyscript-json/assembly'
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
        const json = JSON.parse(bytes)
        // const result = json.fromBytes(bytes)
        // log.debug(`Testing: ${result.toObject().mustGet('id').toString()}`, [])
        const root = Root.fromJSON(json)
        if (root) {
          log.debug(`XXX Decoded Root`, [])
          const encoded = root.toJSON()
          log.debug(`XXX Encoded Root`, [])
          const out = encoded.stringify()
          log.debug(`XXX Encoded JSON ${out}`, [])
        }
      }
    }
  }

  statement.save()

  log.debug(`Indexed: ${statement.uri}`, [])
}
