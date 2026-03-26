/** Convert a Uint8Array or string ID to a hex string. */
export function toHexId(id: unknown): string {
  if (typeof id === 'string') {
    return id;
  }
  if (id instanceof Uint8Array) {
    return Array.from(id)
      .map(b => b.toString(16).padStart(2, '0'))
      .join('');
  }
  // Fallback for other array-like types
  if (Array.isArray(id) || (id && typeof id === 'object' && 'length' in id)) {
    return Array.from(id as ArrayLike<number>)
      .map(b => b.toString(16).padStart(2, '0'))
      .join('');
  }
  return String(id);
}
