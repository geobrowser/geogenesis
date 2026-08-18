import { type RankingComposeHrefParams, rankingComposeHref } from './ranking-compose-url';

export type RankingShareIdentity = {
  rankEntityId: string;
  authorSpaceId: string;
  ogVersion: string;
};

export function buildRankingSharePath(params: RankingComposeHrefParams & Partial<RankingShareIdentity>): string {
  return rankingComposeHref({ ...params, mode: 'view' });
}

/**
 * Appends a content-hash cache-buster (`?v={version}`) to a share path. X (and most
 * crawlers) cache the social card keyed on the shared URL, not on the `og:image` URL,
 * so a stable path serves a stale card after the ranking changes. The version is the
 * content-hashed `ogVersion`: unchanged rankings keep the same URL (cache reuse),
 * while edited rankings get a new URL that forces a re-scrape. The resolver routes
 * only read the path segment, so the param is inert for resolution.
 */
function withShareVersion(path: string, version?: string): string {
  const trimmed = version?.trim();
  if (!trimmed) return path;
  return `${path}?v=${encodeURIComponent(trimmed)}`;
}

/**
 * Short, opaque personal ranking share path. Everything else (block, dates,
 * placement, ogVersion, tab) is reconstructed server-side from the rank entity id
 * by the `/r/[rankEntityId]` resolver route.
 */
export function buildShortPersonalRankingSharePath(rankEntityId: string, version?: string): string {
  return withShareVersion(`/r/${rankEntityId}`, version);
}

/** Short, opaque global ranking share path resolved by `/r/g/[blockEntityId]`. */
export function buildShortGlobalRankingSharePath(blockEntityId: string, version?: string): string {
  return withShareVersion(`/r/g/${blockEntityId}`, version);
}

export function buildAbsoluteRankingShareUrl(path: string): string {
  if (typeof window === 'undefined') return path;
  return new URL(path, window.location.origin).toString();
}

export function shareRankingOnX(shareUrl: string, text?: string): void {
  const intent = new URL('https://x.com/intent/tweet');
  intent.searchParams.set('url', shareUrl);
  if (text?.trim()) {
    intent.searchParams.set('text', text.trim());
  }
  window.open(intent.toString(), '_blank', 'noopener,noreferrer');
}

export async function copyRankingShareLink(shareUrl: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(shareUrl);
    return true;
  } catch {
    return false;
  }
}
