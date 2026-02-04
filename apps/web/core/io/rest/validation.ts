/**
 * Input validation utilities for REST API calls.
 *
 * These functions validate and sanitize user input before using in API URLs.
 */

/**
 * Validates a space ID format (32 hex characters, UUID without dashes).
 * Returns the normalized (lowercase, no dashes) ID or null if invalid.
 */
export function validateSpaceId(id: string): string | null {
  if (!id) return null;
  const normalized = id.replace(/-/g, '').toLowerCase();
  if (!/^[0-9a-f]{32}$/i.test(normalized)) {
    return null;
  }
  return normalized;
}

/**
 * Validates a proposal ID format.
 * Returns the normalized ID or null if invalid.
 */
export function validateProposalId(id: string): string | null {
  if (!id) return null;
  const normalized = id.replace(/-/g, '').toLowerCase();
  // Proposal IDs should be hex strings (at least 32 chars for UUID)
  if (!/^[0-9a-f]{32,}$/i.test(normalized)) {
    return null;
  }
  return normalized;
}

/**
 * Validates an Ethereum wallet address format.
 * Returns the normalized (lowercase) address or null if invalid.
 */
export function validateWalletAddress(address: string): `0x${string}` | null {
  if (!address) return null;
  // Basic validation: starts with 0x and is 42 characters (0x + 40 hex chars)
  if (!/^0x[0-9a-f]{40}$/i.test(address)) {
    return null;
  }
  return address.toLowerCase() as `0x${string}`;
}

/**
 * Safely encodes a path segment for URL construction.
 * Always use this when interpolating user input into URL paths.
 */
export function encodePathSegment(segment: string): string {
  return encodeURIComponent(segment);
}

/**
 * Valid action types for proposal filtering.
 */
export const VALID_ACTION_TYPES = [
  'ADD_MEMBER',
  'REMOVE_MEMBER',
  'ADD_EDITOR',
  'REMOVE_EDITOR',
  'UNFLAG_EDITOR',
  'PUBLISH',
  'FLAG',
  'UNFLAG',
  'UPDATE_VOTING_SETTINGS',
  'UNKNOWN',
  // Also accept PascalCase variants that the API uses
  'AddMember',
  'RemoveMember',
  'AddEditor',
  'RemoveEditor',
  'UnflagEditor',
  'Publish',
  'Flag',
  'Unflag',
  'UpdateVotingSettings',
] as const;

export type ValidActionType = (typeof VALID_ACTION_TYPES)[number];

/**
 * Validates action types against the allowlist.
 * Returns only valid action types, filtering out any invalid values.
 */
export function validateActionTypes(types: string[]): string[] {
  return types.filter(t => VALID_ACTION_TYPES.includes(t as ValidActionType));
}

/**
 * Check if a string looks like a valid UUID (32 hex chars without dashes, or with dashes).
 */
export function isValidUUID(id: string | undefined): boolean {
  if (!id) return false;
  const noDashes = id.replace(/-/g, '');
  return /^[0-9a-f]{32}$/i.test(noDashes);
}
