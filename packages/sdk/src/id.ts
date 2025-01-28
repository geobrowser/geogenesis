import { v4 as uuidv4 } from 'uuid';

import { encodeBase58 } from './core/base58.js';

/**
 * Generates a globally unique knowledge graph identifier.
 *
 * @example
 * ```
 * import { ID } from '@graphprotocol/grc-20'
 *
 * const id = ID.make();
 * console.log(id) // Gw9uTVTnJdhtczyuzBkL3X
 * ```
 *
 * @returns base58 encoded v4 UUID
 */
export function make() {
  const uuid = uuidv4();
  const stripped = uuid.replaceAll(/-/g, '');
  return encodeBase58(stripped);
}
