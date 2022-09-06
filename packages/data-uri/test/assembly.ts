import { DataURI } from '../assembly'

export function mimeType(uri: string): string | null {
  return DataURI.parse(uri).mimeType
}

export function data(uri: string): Uint8Array {
  return DataURI.parse(uri).data
}
