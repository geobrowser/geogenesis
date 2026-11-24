import { type QueryClient, hashKey } from '@tanstack/react-query';

import { loadClaimResponseSummaryCaches } from '~/core/responses/claim-response-summaries';
import { entityResponseCountsQueryKey } from '~/core/responses/entity-response';

import { type ClaimBand, agreePercent, claimBand } from './claim-band';
import { type ClaimAbout, fetchClaimsAbout } from './claims-about';
import type { GraphFilter } from './graph-filter';

export type SummarisedClaim = {
  id: string;
  name: string;
  /** Where it is voted and counted. */
  spaceId: string;
  positive: number;
  negative: number;
  band: ClaimBand;
};

export type TopicClaimsSummary = {
  /** Claims about the topic with at least one response, most responses first. */
  claims: SummarisedClaim[];
  bands: Record<ClaimBand, number>;
  /** The topic has more claims than were counted, so the counts are lower bounds. */
  truncated: boolean;
};

const TOPIC_CLAIMS_PAGE = 500;
const TOPIC_CLAIMS_PAGES = 4;
/** Gaza held 423 claims in World affairs in Nov 2026. */
export const MAX_TOPIC_CLAIMS = TOPIC_CLAIMS_PAGE * TOPIC_CLAIMS_PAGES;
export const COUNT_CHUNK = 250;

type Counts = { positive: number; negative: number };

/** Counts as loaded, keyed by `hashKey(claimCountsKey(claim))`: the fallback once the cache drops them. */
export type LoadedCounts = Record<string, Counts>;

/** Bands and order for the topic's claims, from each claim's counts in its own space. */
export function summariseTopicClaims(
  claims: readonly ClaimAbout[],
  countsOf: (claim: ClaimAbout) => Counts | undefined,
  truncated = false
): TopicClaimsSummary {
  const summarised: SummarisedClaim[] = [];
  for (const claim of claims) {
    const counts = countsOf(claim);
    const band = counts ? claimBand(counts.positive, counts.negative) : null;
    if (counts && band) summarised.push({ id: claim.id, name: claim.name, spaceId: claim.spaceId, ...counts, band });
  }
  summarised.sort((a, b) => b.positive + b.negative - (a.positive + a.negative) || a.name.localeCompare(b.name));
  const bands = { agreed: 0, contested: 0, rejected: 0 };
  for (const claim of summarised) bands[claim.band]++;
  return { claims: summarised, bands, truncated };
}

export function summaryPercent(claim: SummarisedClaim) {
  return agreePercent(claim.positive, claim.negative);
}

/** The cache the node cards and vote buttons read; a vote's read-back updates it. */
export function claimCountsKey(claim: ClaimAbout) {
  return entityResponseCountsQueryKey(claim.id, claim.spaceId, 0, 'stance');
}

/** Every claim about `entityId` in the filter, up to MAX_TOPIC_CLAIMS; `truncated` past the cap. */
export async function fetchAllClaimsAbout(
  entityId: string,
  filter: GraphFilter,
  requestedSpaceId: string | null,
  signal?: AbortSignal
): Promise<{ claims: ClaimAbout[]; truncated: boolean }> {
  const claims: ClaimAbout[] = [];
  let after: string | null = null;
  for (let page = 0; ; page++) {
    const result = await fetchClaimsAbout(entityId, filter, requestedSpaceId, after, signal, TOPIC_CLAIMS_PAGE);
    claims.push(...result.claims);
    if (!result.hasNextPage) return { claims, truncated: false };
    if (!result.endCursor || result.endCursor === after)
      throw new Error('Topic claims have a next page but no new cursor');
    if (page + 1 >= TOPIC_CLAIMS_PAGES) return { claims, truncated: true };
    after = result.endCursor;
  }
}

/**
 * The Claims tab's claims about the topic, up to MAX_TOPIC_CLAIMS, with their stance counts
 * loaded into the shared per-claim cache, each in the space it is voted in.
 */
export async function fetchTopicClaims({
  topicId,
  filter,
  topicSpaceId,
  queryClient,
  personalSpaceId,
  signal,
}: {
  topicId: string;
  filter: GraphFilter;
  topicSpaceId: string | null;
  queryClient: QueryClient;
  personalSpaceId: string | null;
  signal?: AbortSignal;
}): Promise<{ claims: ClaimAbout[]; truncated: boolean; counts: LoadedCounts }> {
  const { claims, truncated } = await fetchAllClaimsAbout(topicId, filter, topicSpaceId, signal);
  const bySpace = new Map<string, ClaimAbout[]>();
  for (const claim of claims) bySpace.set(claim.spaceId, [...(bySpace.get(claim.spaceId) ?? []), claim]);
  const loads: Promise<unknown>[] = [];
  for (const [spaceId, inSpace] of bySpace)
    for (let i = 0; i < inSpace.length; i += COUNT_CHUNK)
      loads.push(
        loadClaimResponseSummaryCaches({
          queryClient,
          spaceId,
          targets: inSpace.slice(i, i + COUNT_CHUNK).map(claim => ({ entityId: claim.id, responseKind: 'stance' })),
          personalSpaceId,
          signal,
        })
      );
  await Promise.all(loads);
  // Unobserved count entries are garbage-collected while this result stays cached, so keep a copy.
  const counts: LoadedCounts = {};
  for (const claim of claims) {
    const key = claimCountsKey(claim);
    counts[hashKey(key)] = queryClient.getQueryData<Counts>(key) ?? { positive: 0, negative: 0 };
  }
  return { claims, truncated, counts };
}
