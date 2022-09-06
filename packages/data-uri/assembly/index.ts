import { decode } from 'as-base64/assembly'

const PREFIX = 'data:'

export class DataURI {
  mimeType: string | null
  data: Uint8Array

  constructor(mimeType: string | null, data: Uint8Array) {
    this.mimeType = mimeType
    this.data = data
  }

  static parse(uri: string): DataURI {
    if (!uri.startsWith(PREFIX)) {
      throw new Error(`Invalid data URI: '${uri}'`)
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

    throw new Error(`Failed to decode data uri: ${uri.slice(0, 30)}`)
  }
}
