/**
 * GraphQL may return unix seconds as a string, milliseconds, or an ISO datetime string.
 */
export function parseEntityUpdatedAtToUnixSec(raw: string | undefined): number {
  if (raw == null || raw === '') return 0;
  const s = String(raw).trim();
  const n = Number(s);
  if (Number.isFinite(n)) {
    if (n > 1e12) return Math.floor(n / 1000);
    if (n > 1e9) return Math.floor(n);
  }
  const ms = Date.parse(s);
  if (Number.isFinite(ms)) return Math.floor(ms / 1000);
  return 0;
}
