import { log } from '@graphprotocol/graph-ts'
import { decode } from 'as-base64/assembly'

const PREFIX = 'data:'

/**
 * Data URIs have the format:
 * data:[<mediatype>][;base64],<data>
 *
 * For more info:
 * https://developer.mozilla.org/en-US/docs/Web/HTTP/Basics_of_HTTP/Data_URLs
 */
export class DataURI {
  mimeType: string | null
  data: Uint8Array

  constructor(mimeType: string | null, data: Uint8Array) {
    this.mimeType = mimeType
    this.data = data
  }

  static parse(uri: string): DataURI | null {
    if (!uri.startsWith(PREFIX)) {
      log.warning(`Invalid data URI: '${uri}'`, [])
      return null
    }

    const commaIndex = uri.indexOf(',', PREFIX.length) // Start after "data:"

    if (commaIndex != -1) {
      const meta = uri.slice(PREFIX.length, commaIndex)
      const components = meta.split(';')
      const mimeType = components[0]

      const rest = uri.slice(commaIndex + 1)

      if (components.length == 2) {
        const encoding = components[1]

        if (encoding == 'base64') {
          const decoded = decode(rest)
          return new DataURI(mimeType, decoded)
        }
      }
    }

    log.warning(`Failed to decode data uri: ${uri.slice(0, 30)}`, [])
    return null
  }
}
