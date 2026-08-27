/**
 * Normalizes an entity / space id for set / map keying — strips hyphens and
 * lowercases. Used wherever an id from one source (UUID-formatted) needs to
 * be compared against an id from another source (canonical lowercase hex).
 */
export function normId(id: string): string {
  return id.replace(/-/g, '').toLowerCase();
}
