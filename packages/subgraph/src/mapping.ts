import { Bytes, log } from '@graphprotocol/graph-ts'
import { decode } from 'as-base64'
import { Statement } from '../generated/schema'
import { StatementAdded } from '../generated/StatementHistory/StatementHistory'

export function handleStatementAdded(event: StatementAdded): void {
  let statement = new Statement(event.params.index.toHex())

  const author = event.params.author
  const uri = event.params.uri

  statement.author = author
  statement.uri = uri

  if (uri.startsWith('data:')) {
    const commaIndex = uri.indexOf(',', 5) // Start after "data:"

    if (commaIndex !== -1) {
      const meta = uri.slice(5, commaIndex)
      const components = meta.split(';')
      const mimeType = components[0]

      statement.mimeType = mimeType

      if (components.length === 2) {
        const encoding = components[1]

        if (encoding === 'base64') {
          const rest = uri.slice(commaIndex + 1)
          const decoded = decode(rest)
          statement.decoded = Bytes.fromUint8Array(decoded)
        }
      }
    }
  }

  statement.save()

  log.debug(`Indexed: ${statement.uri}`, [])
}
