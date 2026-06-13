export type RankingComposeMode = 'view' | 'edit';

export function rankingComposeHref({
  spaceId,
  blockEntityId,
  relationId,
  parentEntityId,
  rankingStartDate = '',
  rankingEndDate = '',
  mode = 'edit',
  rankEntityId = '',
  authorSpaceId = '',
  ogVersion = '',
}: {
  spaceId: string;
  blockEntityId: string;
  relationId: string;
  parentEntityId: string;
  rankingStartDate?: string;
  rankingEndDate?: string;
  mode?: RankingComposeMode;
  rankEntityId?: string;
  authorSpaceId?: string;
  ogVersion?: string;
}): string {
  const params = new URLSearchParams();
  params.set('relationId', relationId);
  params.set('parentEntityId', parentEntityId);
  if (rankingStartDate) params.set('rankingStartDate', rankingStartDate);
  if (rankingEndDate) params.set('rankingEndDate', rankingEndDate);
  if (mode === 'view') params.set('mode', 'view');
  if (rankEntityId) params.set('rankEntityId', rankEntityId);
  if (authorSpaceId) params.set('authorSpaceId', authorSpaceId);
  if (ogVersion) params.set('ogVersion', ogVersion);
  return `/space/${spaceId}/${blockEntityId}/ranking-compose?${params.toString()}`;
}

export function rankingComposeReturnHref(spaceId: string, parentEntityId: string): string {
  return `/space/${spaceId}/${parentEntityId}`;
}
