/** Only recognize our CDN capability, not unrelated URLs with an `expires` parameter. */
export function isExpiredMediaUrl(value: string | null): boolean {
  if (!value) return false;
  try {
    const url = new URL(value);
    if (!url.searchParams.has('signature')) return false;
    const expires = Number(url.searchParams.get('expires'));
    return Number.isFinite(expires) && expires > 0 && expires * 1_000 <= Date.now() + 5_000;
  } catch {
    return false;
  }
}
