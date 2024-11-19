const BASE58_ALLOWED_CHARS = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';

export type Base58 = string;

/**
 * Base58 encodes the given string value.
 *
 * @example
 * ```ts
 * import { v4 as uuidv4 } from "uuid";
 *
 * const uuid = uuidv4(); // 92539817-7989-4083-ab80-e9c2b2b66669
 * const dashesRemoved = uuid.replaceAll(/-/g, ""); // 9253981779894083ab80e9c2b2b66669
 * const encoded = encodeBase58(dashesRemoved)
 * console.log(encoded) // K51CbDqxW35osbjPo5ZF77
 * ```
 *
 * @param val string to encode as base58
 * @returns the base58 encoded string
 */
export function encodeBase58(val: string): Base58 {
  const hex = BigInt(`0x${val}`);
  let remainder = hex;
  const result: string[] = []; // Use an array to store encoded characters

  while (remainder > 0n) {
    const mod = remainder % 58n;
    const base58CharAtMod = BASE58_ALLOWED_CHARS[Number(mod)];
    if (base58CharAtMod) {
      result.push(base58CharAtMod);
    }
    remainder = remainder / 58n;
  }

  // Reverse and join the array to get the final Base58 encoded string
  return result.reverse().join('');
}

export type UUID = string;

/**
 * Expand the base58 encoded UUID back to its original UUID format
 *
 * @example
 * ```ts
 * const uuid = 92539817-7989-4083-ab80-e9c2b2b66669;
 * const encoded = encodeBase58(dashesRemoved); // K51CbDqxW35osbjPo5ZF77
 * const decoded = decodeBase58ToUUID(encoded); // 92539817-7989-4083-ab80-e9c2b2b66669
 *
 * expect(decoded).toEqual(uuid);
 * ```
 *
 * @param encoded base58 encoded UUID
 * @returns the expanded UUID from the base58 encoded value
 */
export function decodeBase58ToUUID(encoded: string): UUID {
  let decoded = 0n;

  for (const char of encoded) {
    const index = BASE58_ALLOWED_CHARS.indexOf(char);
    if (index === -1) {
      throw new Error('Invalid Base58 character');
    }
    decoded = decoded * 58n + BigInt(index);
  }

  // Convert the bigint to a hex string, padded to 32 characters
  let hexStr = decoded.toString(16);
  hexStr = hexStr.padStart(32, '0'); // Ensure it is 32 characters

  return [hexStr.slice(0, 8), hexStr.slice(8, 12), hexStr.slice(12, 16), hexStr.slice(16, 20), hexStr.slice(20)].join(
    '-',
  );
}
