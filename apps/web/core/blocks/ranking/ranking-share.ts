import { type RankingComposeHrefParams, rankingComposeHref } from './ranking-compose-url';

export type RankingShareIdentity = {
  rankEntityId: string;
  authorSpaceId: string;
  ogVersion: string;
};

export function buildRankingSharePath(params: RankingComposeHrefParams & Partial<RankingShareIdentity>): string {
  return rankingComposeHref({ mode: 'view', ...params });
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
