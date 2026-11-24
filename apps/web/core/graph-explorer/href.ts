import { normId } from '~/core/utils/norm-id';

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

/** Bumped when the card's layout changes, so unfurlers fetch the new image. */
export const GRAPH_CARD_VERSION = 1;

/** The shareable URL: centre, topic and space only, so filter params never fork a link. */
export function graphExplorerCanonicalHref(ids: { entityId: string; topicId: string; spaceId?: string | null }) {
  return graphExplorerHref(normIds(ids));
}

/** The share card. Not under /api/, which robots.txt disallows and X then refuses to fetch. */
export function graphExplorerCardHref(ids: { entityId: string; topicId: string; spaceId?: string | null }) {
  const { entityId, topicId, spaceId } = normIds(ids);
  const params = new URLSearchParams({ topic: topicId });
  if (spaceId) params.set('space', spaceId);
  params.set('v', String(GRAPH_CARD_VERSION));
  return `/explore/graph/${entityId}/card?${params.toString()}`;
}

function normIds({ entityId, topicId, spaceId }: { entityId: string; topicId: string; spaceId?: string | null }) {
  return { entityId: normId(entityId), topicId: normId(topicId), spaceId: spaceId ? normId(spaceId) : undefined };
}
