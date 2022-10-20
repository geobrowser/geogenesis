import { ByteArray, crypto } from '@graphprotocol/graph-ts'

export function getChecksumAddress(address: string): string {
  // if (!isHexString(address, 20)) {
  //   logger.throwArgumentError('invalid address', 'address', address)
  // }

  address = address.toLowerCase()

  const chars = address.substring(2).split('')

  const expanded = new Uint8Array(40)
  for (let i = 0; i < 40; i++) {
    expanded[i] = chars[i].charCodeAt(0)
  }

  const hashed = crypto.keccak256(changetype<ByteArray>(expanded))

  for (let i = 0; i < 40; i += 2) {
    if (hashed[i >> 1] >> 4 >= 8) {
      chars[i] = chars[i].toUpperCase()
    }
    if ((hashed[i >> 1] & 0x0f) >= 8) {
      chars[i + 1] = chars[i + 1].toUpperCase()
    }
  }

  return '0x' + chars.join('')
}
