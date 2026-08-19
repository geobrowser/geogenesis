import type { QueryClient } from '@tanstack/react-query';

import { Effect } from 'effect';

import type { UserVoteFilter } from '~/core/gql/graphql';
import type { Space } from '~/core/io/dto/spaces';
import {
  type ClaimResponseSummaryRow,
  type EntityResponder,
  getClaimResponseSummaryPage,
  getSpaces,
} from '~/core/io/queries';
import { profileBySpaceIdQueryKey, profilesBySpaceIdsQueryKey, spacesByIdsQueryKey } from '~/core/io/query-keys';
import { fetchProfilesBySpaceIds } from '~/core/io/subgraph/fetch-profile';
import type { Profile } from '~/core/types';
import { mapWithConcurrency } from '~/core/utils/map-with-concurrency';

import { claimResponseTargetKey } from './claim-response-summary-query-keys';
import {
  type ActiveResponseDirection,
  type ResponseKind,
  decodeActiveResponseDirection,
  entityResponderProfilesQueryKey,
  entityRespondersQueryKey,
  entityResponseCountsQueryKey,
  responseKindToVoteKind,
  userEntityResponseQueryKey,
} from './entity-response';

export { claimResponseSummariesQueryKeyPrefix, claimResponseTargetKey } from './claim-response-summary-query-keys';

export const CLAIM_RESPONSE_SUMMARY_PAGE_SIZE = 1_000;
const RESPONDER_METADATA_CHUNK_SIZE = 100;
const RESPONDER_METADATA_CONCURRENCY = 4;

export type ClaimResponseTarget = {
  entityId: string;
  responseKind: ResponseKind;
};

export type ClaimResponseSummary = {
  counts: { positive: number; negative: number };
  viewerResponse: ActiveResponseDirection | null;
  responders: EntityResponder[];
};

type FetchSummaryPageArgs = {
  filter: UserVoteFilter;
  first: number;
  offset: number;
  signal?: AbortSignal;
};

type FetchSummaryPage = (args: FetchSummaryPageArgs) => Promise<ClaimResponseSummaryRow[]>;
type FetchSummaries = typeof fetchClaimResponseSummaries;
type FetchProfiles = (spaceIds: string[]) => Promise<Profile[]>;
type FetchSpaces = (spaceIds: string[], signal?: AbortSignal) => Promise<Space[]>;

export function normalizeClaimResponseTargets(targets: ClaimResponseTarget[]) {
  const byKey = new Map(targets.map(target => [claimResponseTargetKey(target), target]));
  return [...byKey.values()].sort((left, right) =>
    claimResponseTargetKey(left).localeCompare(claimResponseTargetKey(right))
  );
}

export function buildClaimResponseSummaryFilter(spaceId: string, targets: ClaimResponseTarget[]): UserVoteFilter {
  return {
    spaceId: { is: spaceId },
    objectType: { is: 0 },
    voteType: { in: [0, 1] },
    or: normalizeClaimResponseTargets(targets).map(target => ({
      objectId: { is: target.entityId },
      voteKind: { is: responseKindToVoteKind(target.responseKind) },
    })),
  };
}

export function groupClaimResponseSummaryRows(
  targets: ClaimResponseTarget[],
  rows: ClaimResponseSummaryRow[],
  personalSpaceId: string | null
): Map<string, ClaimResponseSummary> {
  const normalizedTargets = normalizeClaimResponseTargets(targets);
  const targetByObjectAndKind = new Map(
    normalizedTargets.map(target => [`${target.entityId}:${responseKindToVoteKind(target.responseKind)}`, target])
  );
  const activeRows = new Map<string, { target: ClaimResponseTarget; row: ClaimResponseSummaryRow }>();

  for (const row of rows) {
    const target = targetByObjectAndKind.get(`${row.objectId}:${row.voteKind}`);
    const direction = decodeActiveResponseDirection(row.voteType);
    if (!target || !direction) continue;
    activeRows.set(`${claimResponseTargetKey(target)}:${row.userId}`, { target, row });
  }

  const summaries = new Map<string, ClaimResponseSummary>(
    normalizedTargets.map(target => [
      claimResponseTargetKey(target),
      { counts: { positive: 0, negative: 0 }, viewerResponse: null, responders: [] },
    ])
  );

  for (const { target, row } of activeRows.values()) {
    const direction = decodeActiveResponseDirection(row.voteType);
    if (!direction) continue;
    const summary = summaries.get(claimResponseTargetKey(target));
    if (!summary) continue;
    summary.counts[direction] += 1;
    summary.responders.push({ userId: row.userId, direction });
    if (personalSpaceId && row.userId === personalSpaceId) summary.viewerResponse = direction;
  }

  return summaries;
}

export async function fetchClaimResponseSummaries({
  spaceId,
  targets,
  personalSpaceId,
  signal,
  fetchPage = defaultFetchPage,
}: {
  spaceId: string;
  targets: ClaimResponseTarget[];
  personalSpaceId: string | null;
  signal?: AbortSignal;
  fetchPage?: FetchSummaryPage;
}) {
  const normalizedTargets = normalizeClaimResponseTargets(targets);
  if (normalizedTargets.length === 0) return new Map<string, ClaimResponseSummary>();

  const filter = buildClaimResponseSummaryFilter(spaceId, normalizedTargets);
  const rows: ClaimResponseSummaryRow[] = [];
  let offset = 0;

  while (true) {
    const page = await fetchPage({ filter, first: CLAIM_RESPONSE_SUMMARY_PAGE_SIZE, offset, signal });
    rows.push(...page);
    if (page.length < CLAIM_RESPONSE_SUMMARY_PAGE_SIZE) break;
    offset += CLAIM_RESPONSE_SUMMARY_PAGE_SIZE;
  }

  return groupClaimResponseSummaryRows(normalizedTargets, rows, personalSpaceId);
}

function defaultFetchPage({ filter, first, offset, signal }: FetchSummaryPageArgs) {
  return Effect.runPromise(getClaimResponseSummaryPage(filter, first, offset, signal));
}

export async function loadClaimResponseSummaryCaches({
  queryClient,
  spaceId,
  targets,
  personalSpaceId,
  signal,
  fetchSummaries = fetchClaimResponseSummaries,
  forceResponseRefresh = false,
}: {
  queryClient: QueryClient;
  spaceId: string;
  targets: ClaimResponseTarget[];
  personalSpaceId: string | null;
  signal?: AbortSignal;
  fetchSummaries?: FetchSummaries;
  forceResponseRefresh?: boolean;
}) {
  const normalizedTargets = normalizeClaimResponseTargets(targets);
  const summaryQueryKey = [
    'claim-response-summary-data',
    personalSpaceId,
    spaceId,
    normalizedTargets.map(claimResponseTargetKey),
  ] as const;
  const summaries = await queryClient.fetchQuery({
    queryKey: summaryQueryKey,
    queryFn: () => fetchSummaries({ spaceId, targets: normalizedTargets, personalSpaceId, signal }),
    staleTime: forceResponseRefresh ? 0 : 30_000,
    retry: false,
  });
  signal?.throwIfAborted();

  for (const target of normalizedTargets) {
    const summary = summaries.get(claimResponseTargetKey(target)) ?? emptySummary();

    queryClient.setQueryData(
      entityResponseCountsQueryKey(target.entityId, spaceId, 0, target.responseKind),
      summary.counts
    );
    queryClient.setQueryData(
      entityRespondersQueryKey(target.entityId, spaceId, 0, target.responseKind),
      summary.responders
    );
    if (personalSpaceId) {
      queryClient.setQueryData(
        userEntityResponseQueryKey(personalSpaceId, target.entityId, spaceId, 0, target.responseKind),
        summary.viewerResponse
      );
    }
  }

  return summaries;
}

export function claimResponseSummaryResponderSpaceIds(summaries: Map<string, ClaimResponseSummary>) {
  return [
    ...new Set(
      [...summaries.values()].flatMap(summary => summary.responders.map(responder => responder.userId)).filter(Boolean)
    ),
  ].sort();
}

export async function loadClaimResponderMetadataCaches({
  queryClient,
  spaceId,
  targets,
  summaries,
  signal,
  fetchProfiles = defaultFetchProfiles,
  fetchSpaces = defaultFetchSpaces,
}: {
  queryClient: QueryClient;
  spaceId: string;
  targets: ClaimResponseTarget[];
  summaries: Map<string, ClaimResponseSummary>;
  signal?: AbortSignal;
  fetchProfiles?: FetchProfiles;
  fetchSpaces?: FetchSpaces;
}) {
  const normalizedTargets = normalizeClaimResponseTargets(targets);
  const responderSpaceIds = claimResponseSummaryResponderSpaceIds(summaries);
  if (responderSpaceIds.length === 0) return;

  const [profilesBySpaceId, responderSpaces] = await Promise.all([
    queryClient.fetchQuery({
      queryKey: profilesBySpaceIdsQueryKey(responderSpaceIds),
      queryFn: async () => {
        const profileChunks = await mapWithConcurrency(
          chunk(responderSpaceIds, RESPONDER_METADATA_CHUNK_SIZE),
          RESPONDER_METADATA_CONCURRENCY,
          ids => fetchProfiles(ids)
        );
        return new Map(profileChunks.flat().map(profile => [profile.spaceId, profile]));
      },
      staleTime: 60_000,
      retry: false,
    }),
    queryClient.fetchQuery({
      queryKey: spacesByIdsQueryKey(responderSpaceIds),
      queryFn: async () => {
        const spaceChunks = await mapWithConcurrency(
          chunk(responderSpaceIds, RESPONDER_METADATA_CHUNK_SIZE),
          RESPONDER_METADATA_CONCURRENCY,
          ids => fetchSpaces(ids, signal)
        );
        return spaceChunks.flat();
      },
      staleTime: 60_000,
      retry: false,
    }),
  ]);
  const spacesById = new Map(responderSpaces.map(space => [space.id, space]));

  signal?.throwIfAborted();

  // Avatar groups read profiles per space id so that adding a responder doesn't invalidate the
  // rest of the group. Batched claim views render with their queries disabled, so this priming
  // is the only thing that fills that cache for them.
  for (const [responderSpaceId, profile] of profilesBySpaceId) {
    queryClient.setQueryData(profileBySpaceIdQueryKey(responderSpaceId), profile);
  }

  for (const target of normalizedTargets) {
    const summary = summaries.get(claimResponseTargetKey(target)) ?? emptySummary();
    const responderIds = summary.responders.map(responder => responder.userId);
    const responderProfiles = responderIds.flatMap(id => {
      const profile = profilesBySpaceId.get(id);
      return profile ? [profile] : [];
    });

    if (responderIds.length > 0) {
      queryClient.setQueryData(
        [...entityResponderProfilesQueryKey(target.entityId, spaceId, 0, target.responseKind), responderIds],
        responderProfiles
      );
      queryClient.setQueryData(
        profilesBySpaceIdsQueryKey(responderIds),
        new Map(responderProfiles.map(profile => [profile.spaceId, profile]))
      );
      queryClient.setQueryData(
        spacesByIdsQueryKey(responderIds),
        [...responderIds].sort().flatMap(id => {
          const space = spacesById.get(id);
          return space ? [space] : [];
        })
      );
    }
  }
}

function emptySummary(): ClaimResponseSummary {
  return { counts: { positive: 0, negative: 0 }, viewerResponse: null, responders: [] };
}

function chunk<T>(items: T[], size: number) {
  const chunks: T[][] = [];
  for (let start = 0; start < items.length; start += size) chunks.push(items.slice(start, start + size));
  return chunks;
}

function defaultFetchProfiles(spaceIds: string[]) {
  return Effect.runPromise(fetchProfilesBySpaceIds(spaceIds));
}

function defaultFetchSpaces(spaceIds: string[], signal?: AbortSignal) {
  return Effect.runPromise(getSpaces({ spaceIds, limit: spaceIds.length }, signal));
}
