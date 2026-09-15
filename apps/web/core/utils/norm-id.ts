import { uuidToHex } from '~/core/id/normalize';

/**
 * Normalizes an entity / space id for set / map keying — strips hyphens and lowercases. Used
 * wherever an id from one source (UUID-formatted) needs to be compared against an id from another
 * source (canonical lowercase hex).
 *
 * The same operation as {@link uuidToHex}, and delegating rather than repeating it so there is one
 * implementation to be right. Two names survive because they read as different questions at the
 * call site — "normalize this key" against "convert this UUID" — and renaming across the ~90 files
 * that use one or the other would be a change with no behaviour in it. If they are ever unified,
 * this is the seam.
 */
export function normId(id: string): string {
  return uuidToHex(id);
}
