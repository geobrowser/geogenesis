/** The graph explorer's URL. `topic` scopes it to that topic's spaces; `space` is the page it came from. */
export function graphExplorerHref({
  entityId,
  topicId,
  spaceId,
}: {
  entityId: string;
  topicId: string;
  spaceId?: string;
}) {
  const params = new URLSearchParams({ topic: topicId });
  if (spaceId) params.set('space', spaceId);
  return `/explore/graph/${entityId}?${params.toString()}`;
}
