import { Address, ByteArray, crypto } from '@graphprotocol/graph-ts'

/**
 * From: https://github.com/ethers-io/ethers.js/blob/c80fcddf50a9023486e9f9acb1848aba4c19f7b6/packages/address/src.ts/index.ts
 * MIT Licensed
 */
export function getChecksumAddress(address: Address): string {
	const addressString = address.toHexString()
	const chars = addressString.substring(2).split('')

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
