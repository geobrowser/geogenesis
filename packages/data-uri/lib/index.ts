export class DataURI {
  mimeType: string | null
  data: Uint8Array

  constructor(mimeType: string | null, data: Uint8Array) {
    this.mimeType = mimeType
    this.data = data
  }

  static parse(encoded: string): DataURI {
    return new DataURI('text/plain', new Uint8Array([]))
  }
}
