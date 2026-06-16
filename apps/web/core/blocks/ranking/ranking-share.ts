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
 * Short, opaque personal ranking share path. Everything else (block, dates,
 * placement, ogVersion, tab) is reconstructed server-side from the rank entity id
 * by the `/r/[rankEntityId]` resolver route.
 */
export function buildShortPersonalRankingSharePath(rankEntityId: string): string {
  return `/r/${rankEntityId}`;
}

/** Short, opaque global ranking share path resolved by `/r/g/[blockEntityId]`. */
export function buildShortGlobalRankingSharePath(blockEntityId: string): string {
  return `/r/g/${blockEntityId}`;
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
