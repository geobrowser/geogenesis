import { v4 as uuidv4 } from 'uuid';

import { encodeBase58 } from './core/base58.js';

/**
 * Generate a v4 UUID.
 * Remove the dashes to make it a 32bit value.
 * Base58 encode it and return.
 *
 * @example
 * ```
 * import { generateId } from 'graph-framework-utils'
 *
 * const id = generateId()
 * console.log(id) // Gw9uTVTnJdhtczyuzBkL3X
 * ```
 *
 * @returns base58 encoded v4 UUID
 */
export function createGeoId() {
  const uuid = uuidv4();
  const stripped = uuid.replaceAll(/-/g, '');
  return encodeBase58(stripped);
}
