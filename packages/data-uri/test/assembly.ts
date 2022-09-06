import {deserialize} from '../assembly';

export function test(chunks: Array<Uint8Array>): string {
  return deserialize(chunks).displayData();
}
