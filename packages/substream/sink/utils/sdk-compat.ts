/**
 * Compatibility layer for @geoprotocol/geo-sdk migration.
 * Contains utilities that were previously exported from @graphprotocol/grc-20
 * but are not available or have different APIs in the new SDK.
 */
import { IdUtils } from '@geoprotocol/geo-sdk';

/**
 * Network IDs for different chains.
 * Previously exported from @graphprotocol/grc-20 as NetworkIds.
 */
export const NetworkIds = {
  GEO: 'geo',
} as const;

/**
 * Base58 encoding utilities.
 * Previously exported from @graphprotocol/grc-20.
 */
const BASE58_ALPHABET = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';

export const Base58 = {
  encodeBase58(input: string): string {
    const bytes = Buffer.from(input, 'hex');

    // Convert to BigInt
    let num = BigInt('0x' + bytes.toString('hex'));

    // Encode to base58
    let encoded = '';
    while (num > 0) {
      const remainder = num % BigInt(58);
      num = num / BigInt(58);
      encoded = BASE58_ALPHABET.charAt(Number(remainder)) + encoded;
    }

    // Handle leading zeros
    for (const byte of bytes) {
      if (byte === 0) {
        encoded = '1' + encoded; // '1' is the first character in Base58 alphabet
      } else {
        break;
      }
    }

    return encoded || '1';
  },
};

/**
 * ID utilities including validation.
 * `IdUtils.generate()` is available in the SDK, but `isValid()` is not.
 */
export const Id = {
  generate: IdUtils.generate,

  /**
   * Validates if a string is a valid Geo ID.
   * IDs are Base58-encoded strings of specific lengths.
   */
  isValid(id: string): boolean {
    if (typeof id !== 'string' || id.length === 0) {
      return false;
    }

    // Base58 alphabet (no 0, O, I, l)
    const BASE58_REGEX = /^[123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz]+$/;

    if (!BASE58_REGEX.test(id)) {
      return false;
    }

    // Valid Geo IDs are typically 22 characters (UUID encoded in Base58)
    // but we allow some flexibility
    return id.length >= 20 && id.length <= 30;
  },
};

/**
 * CSV metadata type for imports.
 * Previously exported from @graphprotocol/grc-20.
 */
export type CsvMetadata = {
  type: 'CSV';
  columns: {
    id: string;
    type: 'TEXT' | 'NUMBER' | 'CHECKBOX' | 'URL' | 'TIME' | 'POINT' | 'RELATION';
    relationType?: string;
    isId?: boolean;
    options?: {
      language?: string;
      unit?: string;
      format?: string;
    };
  }[];
};

/**
 * Delete relation operation type.
 * Previously exported as DeleteRelationOp from @graphprotocol/grc-20.
 */
export type DeleteRelationOp = {
  type: 'DELETE_RELATION';
  relation: {
    id: string;
  };
};
