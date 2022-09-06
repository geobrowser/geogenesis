export const toHex = (bytes: Uint8Array, prefix: boolean = true): string =>
  toStrRadix(bytes, prefix ? '0x' : '', 16, 2)

export const toBin = (bytes: Uint8Array, prefix: boolean = true): string =>
  toStrRadix(bytes, prefix ? '0b' : '', 2, 8)

const toStrRadix = (
  bytes: Uint8Array,
  prefix: string,
  radix: number,
  pad: number
): string =>
  prefix +
  (bytes.length === 0
    ? '0'
    : Array.from(bytes)
        .map((b) => b.toString(radix).padStart(pad, '0'))
        .join(''))

export const keySort = (a: string, b: string): number => {
  if (a.length < b.length) return -1
  if (a.length > b.length) return +1
  for (let i = 0; i < a.length; i++) {
    if (a.charAt(i) < b.charAt(i)) return -1
    if (a.charAt(i) > b.charAt(i)) return +1
  }
  return 0
}
