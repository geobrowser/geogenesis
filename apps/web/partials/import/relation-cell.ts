/** Split a relation cell on common multi-value separators (, ; |) and trim each part. */
export function splitRelationCell(raw: string): string[] {
  return raw
    .split(/[,;|]/)
    .map(part => part.trim())
    .filter(Boolean);
}
