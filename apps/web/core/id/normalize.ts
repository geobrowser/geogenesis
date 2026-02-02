/**
 * Converts a UUID with hyphens to a 32-character lowercase hex string.
 * "4c81561d-1f95-4131-9cdd-dd20ab831ba2" -> "4c81561d1f9541319cdddd20ab831ba2"
 */
export function uuidToHex(uuid: string): string {
  return uuid.replace(/-/g, '').toLowerCase();
}

/**
 * Compares two IDs for equality, ignoring dashes and case.
 * Use this when comparing user-provided IDs (may have dashes) against SystemIds (no dashes).
 */
export function equals(a: string, b: string): boolean {
  return uuidToHex(a) === uuidToHex(b);
}
