import { IdUtils } from '@geoprotocol/geo-sdk/lite';

import type { Metadata } from 'next';

import { firstLine } from '~/core/opengraph';
import { normId } from '~/core/utils/norm-id';

import { imageOf } from './graph-entity';
import { type GraphKind, graphKindOf } from './graph-kinds';
import { graphExplorerCanonicalHref, graphExplorerCardHref } from './href';
import type { GraphCardMetaResponse, RawCardEntity } from './server/graph-card-meta';

export type GraphCardMeta = {
  centre: {
    id: string;
    name: string;
    description: string | null;
    types: Array<{ id: string; name: string | null }>;
    kind: GraphKind;
    image: string | null;
  };
  /** Null when the topic is unknown, unnamed or hidden: the card then drops "in {topic}". */
  topic: { id: string; name: string } | null;
};

export const GRAPH_TITLE_SUFFIX = ' · Connections on Geo';
const CLAIM_TITLE_MAX = 90;

/** Hidden = true withholds the entity (GEO-2809). Both spellings occur, as in `isHiddenEntity`. */
function isHidden(entity: NonNullable<RawCardEntity>) {
  return (entity.hidden ?? []).some(
    value =>
      value.boolean === true ||
      ['true', '1'].includes(
        String(value.text ?? '')
          .trim()
          .toLowerCase()
      )
  );
}

/** Null for an unknown, unnamed, hidden or plumbing centre: no card and nothing named. */
export function decodeGraphCardMeta(response: GraphCardMetaResponse): GraphCardMeta | null {
  const raw = response.centre;
  const name = raw?.name?.trim();
  if (!raw || !name || isHidden(raw)) return null;
  const types = raw.types ?? [];
  const kind = graphKindOf(types.map(type => type.id));
  if (!kind) return null;
  const topicName = response.topic?.name?.trim();
  const topic =
    response.topic && topicName && !isHidden(response.topic)
      ? { id: normId(response.topic.id), name: topicName }
      : null;
  return {
    centre: {
      id: normId(raw.id),
      name,
      description: raw.description?.trim() || null,
      types,
      kind,
      image: imageOf({ ...raw, spaceIds: null, relationsList: raw.relationsList ?? null }),
    },
    topic,
  };
}

/** At a word boundary, ≤ `max` characters plus an ellipsis. */
export function truncateAtWord(text: string, max: number) {
  if (text.length <= max) return text;
  const cut = text.slice(0, max + 1);
  const space = cut.lastIndexOf(' ');
  return `${(space > max / 2 ? cut.slice(0, space) : text.slice(0, max)).replace(/[\s,;:.-]+$/, '')}…`;
}

export type GraphRouteIds = { entityId: string; topicId: string | null; spaceId: string | null };

/** Route params as the card reads them: only valid ids, normalised; anything else drops out. */
export function parseGraphRouteIds(
  entityId: string,
  params: { topic?: string | string[] | null; space?: string | string[] | null }
): GraphRouteIds | null {
  if (!IdUtils.isValid(entityId)) return null;
  const one = (value: string | string[] | null | undefined) => (Array.isArray(value) ? value[0] : value) ?? null;
  const topic = one(params.topic);
  const space = one(params.space);
  return {
    entityId: normId(entityId),
    topicId: topic && IdUtils.isValid(topic) ? normId(topic) : null,
    spaceId: space && IdUtils.isValid(space) ? normId(space) : null,
  };
}

export const GRAPH_EXPLORER_FALLBACK_METADATA: Metadata = {
  title: 'Graph explorer',
  robots: { index: false, follow: true },
};

/** The page's head: title, description, canonical and the share card. Unlisted, so never indexed. */
export function buildGraphCardMetadata(
  meta: GraphCardMeta,
  ids: { topicId: string; spaceId: string | null }
): Metadata {
  const { centre, topic } = meta;
  const isTopicCentre = centre.id === normId(ids.topicId);
  const name = centre.kind === 'claim' ? truncateAtWord(centre.name, CLAIM_TITLE_MAX) : centre.name;
  const title =
    isTopicCentre || !topic ? `${name}${GRAPH_TITLE_SUFFIX}` : `${name} in ${topic.name}${GRAPH_TITLE_SUFFIX}`;
  const description =
    firstLine(centre.description) ??
    `Explore how ${centre.name} connects to people, claims, news and sources${topic && !isTopicCentre ? ` in ${topic.name}` : ''}.`;
  const hrefIds = { entityId: centre.id, topicId: ids.topicId, spaceId: ids.spaceId };
  const canonical = graphExplorerCanonicalHref(hrefIds);
  const card = graphExplorerCardHref(hrefIds);
  return {
    title,
    description,
    alternates: { canonical },
    robots: { index: false, follow: true },
    openGraph: {
      type: 'website',
      siteName: 'Geo',
      url: canonical,
      title,
      description,
      images: [{ url: card, width: 1200, height: 630, type: 'image/jpeg', alt: `Connections map for ${centre.name}` }],
    },
    twitter: { card: 'summary_large_image', title, description, images: [card] },
  };
}
