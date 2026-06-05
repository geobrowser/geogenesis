export function rankingComposeHref({
  spaceId,
  pageEntityId,
  blockEntityId,
  relationId,
  rankingStartDate = '',
  rankingEndDate = '',
}: {
  spaceId: string;
  /** Entity page hosting the block (editor parent). */
  pageEntityId: string;
  blockEntityId: string;
  relationId: string;
  rankingStartDate?: string;
  rankingEndDate?: string;
}): string {
  const params = new URLSearchParams();
  params.set('relationId', relationId);
  params.set('blockEntityId', blockEntityId);
  if (rankingStartDate) params.set('rankingStartDate', rankingStartDate);
  if (rankingEndDate) params.set('rankingEndDate', rankingEndDate);
  return `/space/${spaceId}/${pageEntityId}/ranking-compose?${params.toString()}`;
}
