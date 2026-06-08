export function rankingComposeHref({
  spaceId,
  blockEntityId,
  relationId,
  rankingStartDate = '',
  rankingEndDate = '',
}: {
  spaceId: string;
  blockEntityId: string;
  relationId: string;
  rankingStartDate?: string;
  rankingEndDate?: string;
}): string {
  const params = new URLSearchParams();
  params.set('relationId', relationId);
  if (rankingStartDate) params.set('rankingStartDate', rankingStartDate);
  if (rankingEndDate) params.set('rankingEndDate', rankingEndDate);
  return `/space/${spaceId}/${blockEntityId}/ranking-compose?${params.toString()}`;
}
