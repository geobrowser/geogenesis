export type RankingComposeMode = 'view' | 'edit';
export type RankingComposeTab = 'global_ranking' | 'my_ranking';

export const RANKING_COMPOSE_TAB_GLOBAL = 'global_ranking' as const satisfies RankingComposeTab;
export const RANKING_COMPOSE_TAB_MY = 'my_ranking' as const satisfies RankingComposeTab;

export type RankingComposeHrefParams = {
  spaceId: string;
  blockEntityId: string;
  relationId: string;
  parentEntityId: string;
  rankingStartDate?: string;
  rankingEndDate?: string;
  mode?: RankingComposeMode;
  tab?: RankingComposeTab;
  rankEntityId?: string;
  authorSpaceId?: string;
  ogVersion?: string;
};

export function rankingComposeHref({
  spaceId,
  blockEntityId,
  relationId,
  parentEntityId,
  rankingStartDate = '',
  rankingEndDate = '',
  mode = 'edit',
  tab,
  rankEntityId = '',
  authorSpaceId = '',
  ogVersion = '',
}: RankingComposeHrefParams): string {
  const params = new URLSearchParams();
  params.set('relationId', relationId);
  params.set('parentEntityId', parentEntityId);
  if (rankingStartDate) params.set('rankingStartDate', rankingStartDate);
  if (rankingEndDate) params.set('rankingEndDate', rankingEndDate);
  if (mode === 'view') params.set('mode', 'view');
  if (tab) params.set('tab', tab);
  if (rankEntityId) params.set('rankEntityId', rankEntityId);
  if (authorSpaceId) params.set('authorSpaceId', authorSpaceId);
  if (ogVersion) params.set('ogVersion', ogVersion);
  return `/space/${spaceId}/${blockEntityId}/ranking-compose?${params.toString()}`;
}

export function rankingComposeReturnHref(spaceId: string, parentEntityId: string): string {
  return `/space/${spaceId}/${parentEntityId}`;
}

export function isRankingComposePath(path: string | null | undefined): boolean {
  return Boolean(path?.includes('/ranking-compose'));
}
