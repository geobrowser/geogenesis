import type { ExploreFeedItem } from '~/core/explore/explore-card-item';
import { ID } from '~/core/id';
import type { Entity, Relation } from '~/core/types';
import { resolveEntitySpaceId } from '~/core/utils/space/entity-home-space';

import type { ClaimKind } from '../models';
import { readClaimKind } from '../ontology';
import { type RecentAgendaClaim, pinAgendaClaims } from './recent-agenda-claims';
import { type ActiveClaimVote, activeStanceVotes, fetchMultiSpaceClaimVoteRows } from './topic-claim-votes';

/**
 * The Topic template's React Query keys and the pure steps between its reads, shared by
 * `useLiveTopicTemplate` and the Topic page's server prefetch. The prefetch only helps when it lands
 * on the hook's exact keys, so both build them here rather than each spelling them out.
 */

export const LIVE_CLAIMS_LIMIT = 40;
export const LIVE_COVERAGE_LIMIT = 12;
/** How long the feed slices stay fresh, on the client and in the server handover alike. */
export const TOPIC_FEED_STALE_MS = 60_000;

export type TopicFeedSlice = 'top-claims' | 'best-claims';

export function topicFeedSliceQueryKey(slice: TopicFeedSlice, topicId: string, spaceId: string) {
  return ['live-topic-template', slice, ID.uuidToHex(topicId), ID.uuidToHex(spaceId)] as const;
}

export function topicBestDebatesQueryKey(topicId: string, spaceId: string, isSpaceHome: boolean) {
  return ['live-topic-template', 'best-debates', ID.uuidToHex(topicId), ID.uuidToHex(spaceId), isSpaceHome] as const;
}

export type TopicBestDebates = { items: ExploreFeedItem[]; fromSpaceFeed: boolean };

/** Every votes query, for invalidating after the viewer votes. */
export const TOPIC_CLAIM_VOTES_QUERY_PREFIX = ['live-topic-template', 'multi-space-votes'] as const;

/**
 * Keyed by the claims alone. The rows are every voter's, so they do not depend on who is reading;
 * the viewer's own vote is picked out of them afterwards. That is what lets the server, which does
 * not know the reader's personal space, hand the counts over.
 */
export function topicClaimVotesQueryKey(claimHexIds: readonly string[]) {
  return [...TOPIC_CLAIM_VOTES_QUERY_PREFIX, claimHexIds] as const;
}

/** Agree / Disagree only, once per (claim, space, voter): the counts the Claim page draws. */
export async function fetchTopicClaimVotes(claimHexIds: string[], signal?: AbortSignal): Promise<ActiveClaimVote[]> {
  return activeStanceVotes(await fetchMultiSpaceClaimVoteRows({ objectIds: claimHexIds, signal }));
}

/** The topic feed's debate slice, or nothing when the rows came from the space feed (not tag-checked). */
export function topicFeedDebates(data: TopicBestDebates | undefined): ExploreFeedItem[] | undefined {
  return data?.fromSpaceFeed ? undefined : data?.items;
}

/** The feed entities whose Topics relation must be checked against the space. */
export function topicFeedEntityIds(slices: readonly (readonly ExploreFeedItem[] | undefined)[]): string[] {
  return slices.flatMap(items => items?.map(item => item.entityId) ?? []);
}

const NO_FEED_ITEMS: ExploreFeedItem[] = [];

/** The rows the space itself tagged. Held back while the check loads; shown unfiltered if it failed. */
export function keepTaggedItems(
  items: ExploreFeedItem[] | undefined,
  tagged: ReadonlySet<string> | null,
  isTaggedLoading: boolean
): ExploreFeedItem[] {
  if (!items) return NO_FEED_ITEMS;
  if (tagged) return items.filter(item => tagged.has(ID.uuidToHex(item.entityId)));
  return isTaggedLoading ? NO_FEED_ITEMS : items;
}

export type TopicClaimSeed = {
  id: string;
  title: string;
  spaceId: string;
  kind?: ClaimKind;
  debateCount?: number;
};

/**
 * The Claims list is the topic's Best order (GEO-3868): Best claims first, in Best's order. Only when
 * Best has fewer than the cap do the other sources fill the rest, after it and in this order: Top,
 * the best debates' claims, linked claims, then the topic's own claim relations. Claims from a
 * recent Debate agenda go before all of it, even when Best leaves them out (GEO-3873).
 */
export function buildOrderedClaimSeeds({
  spaceId,
  bestClaims,
  topClaims,
  bestDebates,
  linkedClaims,
  directClaimRels,
  agendaClaims,
  viewerLinkedClaims,
}: {
  spaceId: string;
  bestClaims: readonly ExploreFeedItem[];
  topClaims: readonly ExploreFeedItem[];
  bestDebates: readonly ExploreFeedItem[];
  linkedClaims: readonly Entity[];
  directClaimRels: readonly Relation[];
  agendaClaims: readonly RecentAgendaClaim[];
  viewerLinkedClaims: readonly Entity[];
}): TopicClaimSeed[] {
  const seen = new Set<string>();
  const seeds: TopicClaimSeed[] = [];

  const add = (item: TopicClaimSeed) => {
    const hex = ID.uuidToHex(item.id);
    if (seen.has(hex) || !item.title.trim()) return;
    seen.add(hex);
    seeds.push(item);
  };

  for (const item of bestClaims) {
    add({ id: item.entityId, title: item.title, spaceId: item.spaceId || spaceId });
  }
  for (const item of topClaims) {
    add({ id: item.entityId, title: item.title, spaceId: item.spaceId || spaceId });
  }
  for (const debateItem of bestDebates) {
    if (!debateItem.debateClaim?.entityId || !debateItem.debateClaim?.name) continue;
    add({
      id: debateItem.debateClaim.entityId,
      title: debateItem.debateClaim.name,
      spaceId: debateItem.spaceId || spaceId,
    });
  }
  for (const claim of linkedClaims) {
    if (!claim.name) continue;
    add({
      id: claim.id,
      title: claim.name,
      spaceId: resolveEntitySpaceId(claim, spaceId),
      kind: readClaimKind(claim.values),
    });
  }
  for (const rel of directClaimRels) {
    if (!rel.toEntity.name) continue;
    add({ id: rel.toEntity.id, title: rel.toEntity.name, spaceId: rel.toSpaceId ?? spaceId });
  }
  const pinned = pinAgendaClaims<TopicClaimSeed>({
    seeds,
    agendaClaims,
    bestIds: bestClaims.map(item => item.entityId),
    makeSeed: claim => ({
      id: claim.id,
      title: claim.name,
      spaceId: claim.spaceIds.includes(ID.uuidToHex(spaceId)) ? spaceId : (claim.spaceIds[0] ?? spaceId),
    }),
  });
  // Every agenda claim stays, even past the cap. After the cap, so the page's own claims never
  // crowd out the viewer's additions.
  const capped = pinned.slice(0, Math.max(LIVE_CLAIMS_LIMIT, agendaClaims.length));
  for (const seed of pinned) seen.add(ID.uuidToHex(seed.id));
  for (const claim of viewerLinkedClaims) {
    const hex = ID.uuidToHex(claim.id);
    if (!claim.name?.trim() || seen.has(hex)) continue;
    seen.add(hex);
    capped.push({
      id: claim.id,
      title: claim.name,
      spaceId: resolveEntitySpaceId(claim, spaceId),
      kind: readClaimKind(claim.values),
    });
  }
  return capped;
}

/** Every claim the page counts votes for, topic claims and debated claims, as hex ids, for ONE read. */
export function topicVoteClaimIds(seeds: readonly TopicClaimSeed[], bestDebates: readonly ExploreFeedItem[]): string[] {
  const seen = new Set<string>();
  const ids: string[] = [];
  const push = (id: string | undefined) => {
    if (!id) return;
    const hex = ID.uuidToHex(id);
    if (seen.has(hex)) return;
    seen.add(hex);
    ids.push(hex);
  };
  for (const c of seeds) push(c.id);
  for (const d of bestDebates) push(d.debateClaim?.entityId);
  return ids;
}
