import { fetchFeaturedSpacesShared } from '~/core/io/subgraph/fetch-featured-spaces';
import { inlineOgImage } from '~/core/og-image-inline';
import { fetchClaimResponseSummaries } from '~/core/responses/claim-response-summaries';
import { entityBrowseViewFromTypes } from '~/core/utils/entity-browse-view';
import { normId } from '~/core/utils/norm-id';

import { nodeClaimSpaceId } from '../claims-about';
import { type GraphHop1, type GraphNode, fetchHop1 } from '../fetch-graph-neighbourhood';
import type { GraphCardMeta } from '../graph-card-metadata';
import { type GraphFilter, resolveGraphFilter } from '../graph-filter';
import type { GraphKind } from '../graph-kinds';
import { pickNeighbours } from '../select-graph';
import { assignTopicSlots } from '../topic-card-slots';
import { COUNT_CHUNK } from '../topic-claims-summary';
import { loadGraphCardMeta } from './graph-card-meta';

export type Counts = { positive: number; negative: number };

export type GraphCardNode = {
  id: string;
  name: string;
  kind: GraphKind;
  /** The small label on content cards ("News story", "Article"). */
  label: string | null;
  image: string | null;
  /** Space-scoped stance counts; claims only. */
  counts: Counts | null;
};

export type GraphCardData = {
  centre: GraphCardNode & { description: string | null; typeLabel: string };
  topic: { id: string; name: string } | null;
  isTopicCentre: boolean;
  neighbours: GraphCardNode[];
  /** The scope fell back or an image ran out of time: cached briefly so a full card follows. */
  degraded: boolean;
  /** The card this data is shaped for: `topic` only when asked for and the centre is a Topic page. */
  variant: GraphCardVariant;
};

/** Picked before the card fits them to its six slots: spares fill a slot another kind can't. */
export const CARD_CANDIDATES = 12;
export const FEATURED_BUDGET_MS = 1000;
export const IMAGE_BUDGET_MS = 1500;
/**
 * `graph` is the explorer's share card; `topic` is a Topic page's link preview, which draws no claims
 * and whose hub shows the topic's Cover. Both share one layout: a 184px hub and 72px avatars, at 2x.
 */
export type GraphCardVariant = 'graph' | 'topic';
const HUB_IMAGE_PX = 400;
const PERSON_IMAGE_PX = 144;

export const CARD_CACHE = 'public, max-age=3600, s-maxage=86400, stale-while-revalidate=604800';
/** A fallback scope or a missing image: short, so the next crawler gets the full card. */
export const DEGRADED_CACHE = 'public, max-age=300, s-maxage=300';

type Deps = {
  loadMeta: (entityId: string, topicId: string) => Promise<GraphCardMeta | null>;
  fetchFeatured: () => Promise<Array<{ spaceId: string }>>;
  fetchHop1: (entityId: string, filter: GraphFilter) => Promise<GraphHop1>;
  fetchSummaries: typeof fetchClaimResponseSummaries;
  inlineImage: typeof inlineOgImage;
};

const defaultDeps: Deps = {
  loadMeta: loadGraphCardMeta,
  fetchFeatured: fetchFeaturedSpacesShared,
  fetchHop1: (entityId, filter) => fetchHop1(entityId, filter),
  fetchSummaries: fetchClaimResponseSummaries,
  inlineImage: inlineOgImage,
};

const TIMED_OUT = Symbol('timed out');

function within<T>(promise: Promise<T>, ms: number): Promise<T | typeof TIMED_OUT> {
  return new Promise(resolve => {
    const timer = setTimeout(() => resolve(TIMED_OUT), ms);
    promise.then(
      value => {
        clearTimeout(timer);
        resolve(value);
      },
      () => {
        clearTimeout(timer);
        resolve(TIMED_OUT);
      }
    );
  });
}

/** The label a content card carries, as the stage draws it. */
function contentLabel(kind: GraphKind, types: ReadonlyArray<{ name: string | null }>): string | null {
  if (kind === 'story') return 'News story';
  if (kind === 'event') return 'News event';
  if (kind === 'src' || kind === 'case' || kind === 'other') {
    const named = types.map(type => type.name?.trim()).filter((name): name is string => Boolean(name));
    return named.find(name => name !== 'Source') ?? (kind === 'src' ? 'Source' : null);
  }
  return null;
}

function centreTypeLabel(meta: GraphCardMeta['centre']): string {
  if (meta.kind === 'claim') return 'Claim';
  if (meta.kind === 'topic') return 'Topic';
  const names = meta.types.map(type => type.name?.trim()).filter((name): name is string => Boolean(name));
  return names.find(name => name === 'Person') ?? names.find(name => name !== 'Publisher') ?? 'Entity';
}

/**
 * Everything the share card draws, in the signed-out view (featured spaces + the route's space) with
 * no URL overrides. Null when there is nothing to show: unknown, hidden or unnamed centre.
 */
export async function loadGraphCardData(
  {
    entityId,
    topicId,
    spaceId,
    variant = 'graph',
  }: { entityId: string; topicId: string; spaceId: string | null; variant?: GraphCardVariant },
  deps: Deps = defaultDeps
): Promise<GraphCardData | null> {
  const meta = await deps.loadMeta(entityId, topicId);
  if (!meta) return null;
  let degraded = false;

  // The featured walk can take seconds cold; it keeps running (and stays shared) past the budget.
  const featured = await within(deps.fetchFeatured(), FEATURED_BUDGET_MS);
  const ids = new Set<string>();
  if (featured === TIMED_OUT) degraded = true;
  else for (const space of featured) ids.add(normId(space.spaceId));
  if (spaceId) ids.add(spaceId);
  const filter = resolveGraphFilter({ spaceIds: ids.size ? [...ids].sort() : null, topicId, topicSpaceId: spaceId });

  const isTopicCentre = meta.centre.id === normId(topicId);
  // The same rule the entity page uses to advertise the topic card, so a Person + Topic gets it too
  // (its graph kind is `ent`). Any other centre behind `variant=topic` gets the full explorer card.
  const topicVariant = variant === 'topic' && entityBrowseViewFromTypes(meta.centre.types) === 'topic';
  const cardVariant: GraphCardVariant = topicVariant ? 'topic' : 'graph';
  const hop1 = await deps.fetchHop1(meta.centre.id, filter);
  if (hop1.failedKinds?.length) degraded = true;

  // Counts in each claim's own space: hop 1's agrees/disagrees are cross-space and never shown.
  const claimSpace = new Map<string, string>();
  for (const { node } of hop1.neighbours)
    if (node.kind === 'claim' && !topicVariant) {
      const space = nodeClaimSpaceId(node, spaceId);
      if (space) claimSpace.set(node.id, space);
    }
  if (meta.centre.kind === 'claim' && hop1.centre) {
    const space = nodeClaimSpaceId(hop1.centre, spaceId);
    if (space) claimSpace.set(hop1.centre.id, space);
  }
  const counts = await loadCounts([...claimSpace.entries()], deps.fetchSummaries);
  const countsOf = (id: string, space: string | undefined) => (space ? counts.get(`${space}:${id}`) : undefined);
  const scoped = (node: GraphNode): GraphNode => {
    if (node.kind !== 'claim') return node;
    const own = countsOf(node.id, claimSpace.get(node.id));
    return { ...node, agrees: own?.positive ?? 0, disagrees: own?.negative ?? 0 };
  };

  const candidates = hop1.neighbours
    .filter(({ node }) => !topicVariant || node.kind !== 'claim')
    .map(({ node, edge }) => ({ node: scoped(node), edge }));
  const named = pickNeighbours(candidates, CARD_CANDIDATES, new Set([meta.centre.id]), 'all').filter(
    ({ node }) => node.name
  );
  // The card's slots are shaped: a few spares let a missing card or person be filled by another.
  const picked = assignTopicSlots(named.map(pick => ({ ...pick, kind: pick.node.kind }))).map(({ node }) => node);

  const [centreImage, ...neighbourImages] = await Promise.all([
    meta.centre.kind === 'claim'
      ? null
      : deps.inlineImage(
          (topicVariant ? meta.centre.cover : null) ?? meta.centre.image ?? hop1.centre?.image,
          HUB_IMAGE_PX,
          IMAGE_BUDGET_MS
        ),
    ...picked.map(({ node }) =>
      node.kind === 'ent' ? deps.inlineImage(node.image, PERSON_IMAGE_PX, IMAGE_BUDGET_MS) : null
    ),
  ]);
  if ([centreImage, ...neighbourImages].some(image => image?.timedOut)) degraded = true;

  const centreCounts =
    meta.centre.kind === 'claim'
      ? (countsOf(meta.centre.id, claimSpace.get(meta.centre.id)) ?? { positive: 0, negative: 0 })
      : null;

  return {
    centre: {
      id: meta.centre.id,
      name: meta.centre.name,
      kind: meta.centre.kind,
      label: null,
      description: meta.centre.description,
      typeLabel: centreTypeLabel(meta.centre),
      image: centreImage?.src ?? null,
      counts: centreCounts,
    },
    topic: meta.topic,
    isTopicCentre,
    neighbours: picked.map(({ node }, index) => ({
      id: node.id,
      name: node.name!,
      kind: node.kind,
      label: contentLabel(node.kind, node.types),
      image: neighbourImages[index]?.src ?? null,
      counts: node.kind === 'claim' ? { positive: node.agrees, negative: node.disagrees } : null,
    })),
    degraded,
    variant: cardVariant,
  };
}

/** Stance counts keyed `${space}:${claim}`, in chunks per space. */
async function loadCounts(
  claims: ReadonlyArray<[id: string, spaceId: string]>,
  fetchSummaries: typeof fetchClaimResponseSummaries
): Promise<Map<string, Counts>> {
  const bySpace = new Map<string, Set<string>>();
  for (const [id, space] of claims) bySpace.set(space, (bySpace.get(space) ?? new Set()).add(id));
  const counts = new Map<string, Counts>();
  const loads: Promise<void>[] = [];
  for (const [spaceId, idSet] of bySpace) {
    const idList = [...idSet];
    for (let i = 0; i < idList.length; i += COUNT_CHUNK) {
      const chunk = idList.slice(i, i + COUNT_CHUNK);
      loads.push(
        fetchSummaries({
          spaceId,
          targets: chunk.map(entityId => ({ entityId, responseKind: 'stance' as const })),
          personalSpaceId: null,
        }).then(summaries => {
          for (const id of chunk) {
            const summary = summaries.get(`${id}:stance`);
            if (summary) counts.set(`${spaceId}:${id}`, summary.counts);
          }
        })
      );
    }
  }
  await Promise.all(loads);
  return counts;
}
