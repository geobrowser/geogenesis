export type PersonalRankingOgPreviewParams = {
  scope: 'personal';
  rankEntityId: string;
  authorSpaceId: string;
  blockEntityId: string;
  blockEntitySpaceId: string;
  rankingStartDate?: string;
  rankingEndDate?: string;
  ogVersion?: string;
};

export type GlobalRankingOgPreviewParams = {
  scope: 'global';
  blockEntityId: string;
  blockEntitySpaceId: string;
  rankingStartDate?: string;
  rankingEndDate?: string;
  globalOgVersion?: string;
};

export type RankingOgPreviewParams = PersonalRankingOgPreviewParams | GlobalRankingOgPreviewParams;

export function buildRankingOgPreviewUrl(siteOrigin: string, params: RankingOgPreviewParams): string {
  const url = new URL('/api/ranking-og/preview', siteOrigin);
  url.searchParams.set('scope', params.scope);
  url.searchParams.set('blockEntityId', params.blockEntityId);
  url.searchParams.set('blockEntitySpaceId', params.blockEntitySpaceId);

  if (params.rankingStartDate) url.searchParams.set('rankingStartDate', params.rankingStartDate);
  if (params.rankingEndDate) url.searchParams.set('rankingEndDate', params.rankingEndDate);

  if (params.scope === 'personal') {
    url.searchParams.set('rankEntityId', params.rankEntityId);
    url.searchParams.set('authorSpaceId', params.authorSpaceId);
    if (params.ogVersion) url.searchParams.set('ogVersion', params.ogVersion);
  } else if (params.globalOgVersion) {
    url.searchParams.set('globalOgVersion', params.globalOgVersion);
  }

  return url.toString();
}
