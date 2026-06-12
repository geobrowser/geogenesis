export type RankingComposeMode = 'view' | 'edit';

export function rankingComposeHref({
  spaceId,
  blockEntityId,
  relationId,
  parentEntityId,
  rankingStartDate = '',
  rankingEndDate = '',
  mode = 'edit',
}: {
  spaceId: string;
  blockEntityId: string;
  relationId: string;
  parentEntityId: string;
  rankingStartDate?: string;
  rankingEndDate?: string;
  mode?: RankingComposeMode;
}): string {
  const params = new URLSearchParams();
  params.set('relationId', relationId);
  params.set('parentEntityId', parentEntityId);
  if (rankingStartDate) params.set('rankingStartDate', rankingStartDate);
  if (rankingEndDate) params.set('rankingEndDate', rankingEndDate);
  if (mode === 'view') params.set('mode', 'view');
  return `/space/${spaceId}/${blockEntityId}/ranking-compose?${params.toString()}`;
}

export function rankingComposeReturnHref(spaceId: string, parentEntityId: string): string {
  return `/space/${spaceId}/${parentEntityId}`;
}

export function isRankingComposePath(path: string | null | undefined): boolean {
  return Boolean(path?.includes('/ranking-compose'));
}
