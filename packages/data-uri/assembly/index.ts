import { decode } from 'as-base64/assembly'

export class DataURI {
  mimeType: string | null
  data: Uint8Array

  constructor(mimeType: string | null, data: Uint8Array) {
    this.mimeType = mimeType
    this.data = data
  }

  static parse(uri: string): DataURI {
    if (!uri.startsWith('data:')) {
      throw new Error(`Invalid data URI: '${uri}'`)
    }

    const commaIndex = uri.indexOf(',', 5) // Start after "data:"

    if (commaIndex !== -1) {
      const meta = uri.slice(5, commaIndex)
      const components = meta.split(';')
      const mimeType = components[0]

      const rest = uri.slice(commaIndex + 1)

      if (components.length === 2) {
        const encoding = components[1]

        if (encoding === 'base64') {
          return new DataURI(mimeType, decode(rest))
        }
      }
    }

    throw new Error(`Failed to decode data uri: ${uri.slice(0, 30)}`)
  }
}
