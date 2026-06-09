export function rankingComposeHref({
  spaceId,
  blockEntityId,
  relationId,
  parentEntityId,
  rankingStartDate = '',
  rankingEndDate = '',
}: {
  spaceId: string;
  blockEntityId: string;
  relationId: string;
  parentEntityId: string;
  rankingStartDate?: string;
  rankingEndDate?: string;
}): string {
  const params = new URLSearchParams();
  params.set('relationId', relationId);
  params.set('parentEntityId', parentEntityId);
  if (rankingStartDate) params.set('rankingStartDate', rankingStartDate);
  if (rankingEndDate) params.set('rankingEndDate', rankingEndDate);
  return `/space/${spaceId}/${blockEntityId}/ranking-compose?${params.toString()}`;
}

export function rankingComposeReturnHref(spaceId: string, parentEntityId: string): string {
  return `/space/${spaceId}/${parentEntityId}`;
}
