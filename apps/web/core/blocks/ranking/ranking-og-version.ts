export const RANKING_OG_LAYOUT_VERSION = 'ranking-og-v4';
export const RANKING_GLOBAL_OG_LAYOUT_VERSION = 'ranking-global-og-v4';

export type RankingOgVersionInput = {
  rankEntityId: string;
  orderedEntityIds: string[];
  rankingName: string;
  rankingStartDate?: string;
  rankingEndDate?: string;
  authorName?: string | null;
  authorAvatarUrl?: string | null;
  layoutVersion?: string;
};

function stableHash(input: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
}

export function buildRankingOgVersion({
  rankEntityId,
  orderedEntityIds,
  rankingName,
  rankingStartDate = '',
  rankingEndDate = '',
  authorName = '',
  authorAvatarUrl = '',
  layoutVersion = RANKING_OG_LAYOUT_VERSION,
}: RankingOgVersionInput): string {
  const payload = JSON.stringify({
    layoutVersion,
    rankEntityId,
    orderedEntityIds,
    rankingName: rankingName.trim(),
    rankingStartDate,
    rankingEndDate,
    authorName: authorName?.trim() ?? '',
    authorAvatarUrl: authorAvatarUrl ?? '',
  });

  return `${layoutVersion}-${stableHash(payload)}`;
}

export type GlobalRankingOgVersionInput = {
  blockEntityId: string;
  orderedEntityIds: string[];
  rankingName: string;
  rankingStartDate?: string;
  rankingEndDate?: string;
  layoutVersion?: string;
};

export function buildGlobalRankingOgVersion({
  blockEntityId,
  orderedEntityIds,
  rankingName,
  rankingStartDate = '',
  rankingEndDate = '',
  layoutVersion = RANKING_GLOBAL_OG_LAYOUT_VERSION,
}: GlobalRankingOgVersionInput): string {
  const payload = JSON.stringify({
    layoutVersion,
    blockEntityId,
    orderedEntityIds,
    rankingName: rankingName.trim(),
    rankingStartDate,
    rankingEndDate,
  });

  return `${layoutVersion}-${stableHash(payload)}`;
}
