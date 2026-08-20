import { SystemIds } from '@geoprotocol/geo-sdk/lite';

import { Effect } from 'effect';

import { BOUNTIES_RELATION_TYPE, NEWS_STORY_TYPE_ID } from '~/core/constants';
import { ID } from '~/core/id';
import { fetchProfilesBySpaceIds } from '~/core/io/subgraph/fetch-profile';
import { RANKING_BLOCK_TYPE_ID, SUBMITTED_TO_PROPERTY_ID } from '~/core/ranking-block-ids';
import { mapWithConcurrency } from '~/core/utils/map-with-concurrency';

import { ID_CHUNK_SIZE, afterArg, chunk, collectConnection, gqlId, gqlIdList, runQuery } from './community-graphql';
import { isExcludedCurator } from './curator-leaderboard-exclusions';
import { type CuratorLeaderboardWindow, curatorLeaderboardWindow } from './curator-leaderboard-period';
import type {
  CuratorLeaderboardPeriod,
  CuratorLeaderboardResult,
  CuratorLeaderboardRow,
} from './curator-leaderboard-types';
import { CURATOR_LEADERBOARD_MAX_ROWS } from './curator-leaderboard-types';

const RANKING_BLOCK_LIMIT = 100;
const RELATION_PAGE_SIZE = 500;
const ENTITY_PAGE_SIZE = 200;
const VOTE_PAGE_SIZE = 1000;

// Chunked id lookups run concurrently rather than in series, capped so a large
// space can't burst into hundreds of simultaneous requests. Matches the limit
// app/explore/page.tsx uses for its own fan-out.
const CHUNK_CONCURRENCY = 8;

type CuratorAccumulator = {
  rankings: number;
  newsStories: number;
  votes: number;
  submissions: number;
};

function emptyAccumulator(): CuratorAccumulator {
  return { rankings: 0, newsStories: 0, votes: 0, submissions: 0 };
}

/** Ranking blocks that live in this space. */
async function fetchSpaceRankingBlockIds(spaceHex: string, signal?: AbortController['signal']): Promise<string[]> {
  const typesProperty = gqlId(SystemIds.TYPES_PROPERTY);
  const rankingBlockType = gqlId(RANKING_BLOCK_TYPE_ID);

  if (!typesProperty || !rankingBlockType) return [];

  const data = await runQuery<{ entitiesConnection?: { nodes: { id: string }[] } }>(
    'space ranking blocks',
    `query {
      entitiesConnection(
        first: ${RANKING_BLOCK_LIMIT}
        filter: {
          spaceIds: { overlaps: ["${spaceHex}"] }
          relations: { some: { typeId: { is: "${typesProperty}" }, toEntityId: { is: "${rankingBlockType}" } } }
        }
      ) {
        nodes { id }
      }
    }`,
    signal
  );

  return data?.entitiesConnection?.nodes.map(node => node.id) ?? [];
}

/**
 * Rankings — rankings published to a curator's personal space that were submitted to one of this
 * space's ranking blocks.
 */
async function fetchRankingCounts(
  spaceHex: string,
  window: CuratorLeaderboardWindow,
  signal?: AbortController['signal']
): Promise<{ perCurator: Map<string, number>; total: number; truncated: boolean }> {
  const perCurator = new Map<string, number>();
  const submittedTo = gqlId(SUBMITTED_TO_PROPERTY_ID);
  const blockIds = await fetchSpaceRankingBlockIds(spaceHex, signal);

  if (!submittedTo || blockIds.length === 0) return { perCurator, total: 0, truncated: false };

  const createdAtFilter =
    window.seconds === null ? '' : `fromEntity: { createdAt: { greaterThanOrEqualTo: "${window.seconds}" } }`;

  const {
    nodes: relations,
    truncated: relationsTruncated,
    totalCount: relationsTotalCount,
  } = await collectConnection<{
    fromEntityId: string;
    spaceId: string | null;
  }>(
    'submitted to ranking block relations',
    after => `query {
      relationsConnection(
        first: ${RELATION_PAGE_SIZE}${afterArg(after)}
        filter: {
          typeId: { is: "${submittedTo}" }
          toEntityId: { in: [${gqlIdList(blockIds)}] }
          spaceId: { isNull: false }
          ${createdAtFilter}
        }
      ) {
        totalCount
        pageInfo { endCursor hasNextPage }
        nodes { fromEntityId spaceId }
      }
    }`,
    data => data.relationsConnection,
    signal
  );

  if (relations.length === 0) {
    return { perCurator, total: relationsTotalCount ?? 0, truncated: relationsTruncated };
  }

  let total = 0;

  for (const relation of relations) {
    if (!relation.spaceId) continue;

    perCurator.set(relation.spaceId, (perCurator.get(relation.spaceId) ?? 0) + 1);
    total += 1;
  }

  return { perCurator, total: relationsTotalCount ?? total, truncated: relationsTruncated };
}

/**
 * Votes — upvotes and downvotes cast on entities in this space.
 */
async function fetchVoteCounts(
  spaceHex: string,
  window: CuratorLeaderboardWindow,
  signal?: AbortController['signal']
): Promise<{ perCurator: Map<string, number>; truncated: boolean }> {
  const perCurator = new Map<string, number>();
  const votedAtFilter = window.iso ? `votedAt: { greaterThanOrEqualTo: "${window.iso}" }` : '';

  const { nodes: votes, truncated: votesTruncated } = await collectConnection<{ userId: string }>(
    'user votes',
    after => `query {
      userVotesConnection(
        first: ${VOTE_PAGE_SIZE}${afterArg(after)}
        filter: {
          spaceId: { is: "${spaceHex}" }
          voteType: { in: [0, 1] }
          ${votedAtFilter}
        }
      ) {
        pageInfo { endCursor hasNextPage }
        nodes { userId }
      }
    }`,
    data => data.userVotesConnection,
    signal
  );

  for (const vote of votes) {
    if (!vote.userId) continue;
    perCurator.set(vote.userId, (perCurator.get(vote.userId) ?? 0) + 1);
  }

  return { perCurator, truncated: votesTruncated };
}

/**
 * Submissions — accepted proposals in this space that were linked to a bounty.
 */
async function fetchSubmissionCounts(
  spaceHex: string,
  window: CuratorLeaderboardWindow,
  signal?: AbortController['signal']
): Promise<{ perCurator: Map<string, number>; truncated: boolean }> {
  const perCurator = new Map<string, number>();
  const bountiesRelation = gqlId(BOUNTIES_RELATION_TYPE);
  if (!bountiesRelation) return { perCurator, truncated: false };

  const { nodes: links, truncated: linksTruncated } = await collectConnection<{ fromEntityId: string }>(
    'bounty links',
    after => `query {
      relationsConnection(
        first: ${RELATION_PAGE_SIZE}${afterArg(after)}
        filter: {
          typeId: { is: "${bountiesRelation}" }
          toSpaceId: { is: "${spaceHex}" }
        }
      ) {
        pageInfo { endCursor hasNextPage }
        nodes { fromEntityId }
      }
    }`,
    data => data.relationsConnection,
    signal
  );

  const proposalIds = [...new Set(links.map(link => link.fromEntityId).filter(Boolean))];
  if (proposalIds.length === 0) return { perCurator, truncated: linksTruncated };

  const executedAtFilter =
    window.seconds === null
      ? 'executedAt: { isNull: false }'
      : `executedAt: { greaterThanOrEqualTo: "${window.seconds}" }`;

  const proposalPages = await mapWithConcurrency(chunk(proposalIds, ID_CHUNK_SIZE), CHUNK_CONCURRENCY, ids =>
    runQuery<{ proposalsConnection?: { nodes: { id: string; proposedBy: string }[] } }>(
      'bounty-linked proposals',
      `query {
        proposalsConnection(
          first: ${ids.length}
          filter: {
            spaceId: { is: "${spaceHex}" }
            id: { in: [${gqlIdList(ids)}] }
            ${executedAtFilter}
          }
        ) {
          nodes { id proposedBy }
        }
      }`,
      signal
    )
  );

  for (const data of proposalPages) {
    for (const proposal of data?.proposalsConnection?.nodes ?? []) {
      if (!proposal.proposedBy) continue;
      perCurator.set(proposal.proposedBy, (perCurator.get(proposal.proposedBy) ?? 0) + 1);
    }
  }

  return { perCurator, truncated: linksTruncated };
}

/**
 * News stories — News story entities accepted into this space. Anything the
 * indexer holds against a space id is already accepted; unexecuted proposals
 * exist only as IPFS content.
 */
async function fetchNewsStoryCounts(
  spaceHex: string,
  window: CuratorLeaderboardWindow,
  signal?: AbortController['signal']
): Promise<{ perCurator: Map<string, number>; total: number; truncated: boolean }> {
  const perCurator = new Map<string, number>();
  const newsStoryType = gqlId(NEWS_STORY_TYPE_ID);
  const typesProperty = gqlId(SystemIds.TYPES_PROPERTY);
  if (!newsStoryType || !typesProperty) return { perCurator, total: 0, truncated: false };

  const createdAtFilter =
    window.seconds === null ? '' : `filter: { createdAt: { greaterThanOrEqualTo: "${window.seconds}" } }`;

  const {
    nodes: stories,
    truncated: storiesTruncated,
    totalCount: storiesTotalCount,
  } = await collectConnection<{ id: string }>(
    'news story entities',
    after => `query {
      entitiesConnection(
        first: ${ENTITY_PAGE_SIZE}${afterArg(after)}
        spaceId: "${spaceHex}"
        typeId: "${newsStoryType}"
        ${createdAtFilter}
      ) {
        totalCount
        pageInfo { endCursor hasNextPage }
        nodes { id }
      }
    }`,
    data => data.entitiesConnection,
    signal
  );

  const storyIds = [...new Set(stories.map(story => story.id).filter(Boolean))];
  if (storyIds.length === 0) {
    return { perCurator, total: storiesTotalCount ?? 0, truncated: storiesTruncated };
  }

  const firstVersionKeyByStory = new Map<string, bigint>();

  // The only chunk loop with a paginated call inside it, so this is the one whose
  // worst case multiplies: chunks × up to MAX_PAGES, previously all in series.
  const versionPages = await mapWithConcurrency(chunk(storyIds, ID_CHUNK_SIZE), CHUNK_CONCURRENCY, ids =>
    collectConnection<{ fromEntityId: string; validFromKey: string }>(
      'news story type relation versions',
      after => `query {
        relationVersionsConnection(
          first: ${RELATION_PAGE_SIZE}${afterArg(after)}
          filter: {
            spaceId: { is: "${spaceHex}" }
            typeId: { is: "${typesProperty}" }
            toEntityId: { is: "${newsStoryType}" }
            fromEntityId: { in: [${gqlIdList(ids)}] }
          }
        ) {
          pageInfo { endCursor hasNextPage }
          nodes { fromEntityId validFromKey }
        }
      }`,
      data => data.relationVersionsConnection,
      signal
    )
  );

  for (const { nodes: versions } of versionPages) {
    for (const version of versions) {
      if (!version.fromEntityId || !version.validFromKey) continue;
      const key = BigInt(version.validFromKey);
      const existing = firstVersionKeyByStory.get(version.fromEntityId);
      if (existing === undefined || key < existing) {
        firstVersionKeyByStory.set(version.fromEntityId, key);
      }
    }
  }

  const versionKeys = [...new Set([...firstVersionKeyByStory.values()].map(String))];
  const authorByVersionKey = new Map<string, string>();

  const editVersionPages = await mapWithConcurrency(chunk(versionKeys, ID_CHUNK_SIZE), CHUNK_CONCURRENCY, keys =>
    runQuery<{
      editVersionsConnection?: { nodes: { versionKey: string; createdById: string | null }[] };
    }>(
      'news story edit versions',
      `query {
        editVersionsConnection(
          first: ${keys.length}
          filter: { versionKey: { in: [${keys.map(key => `"${key}"`).join(', ')}] } }
        ) {
          nodes { versionKey createdById }
        }
      }`,
      signal
    )
  );

  for (const data of editVersionPages) {
    for (const node of data?.editVersionsConnection?.nodes ?? []) {
      const curatorSpaceId = gqlId(node.createdById);
      if (curatorSpaceId) authorByVersionKey.set(node.versionKey, curatorSpaceId);
    }
  }

  for (const versionKey of firstVersionKeyByStory.values()) {
    const curatorSpaceId = authorByVersionKey.get(String(versionKey));
    if (!curatorSpaceId) continue;
    perCurator.set(curatorSpaceId, (perCurator.get(curatorSpaceId) ?? 0) + 1);
  }

  return {
    perCurator,
    total: storiesTotalCount ?? storyIds.length,
    truncated: storiesTruncated,
  };
}

function buildRows(
  countsByCurator: Map<string, CuratorAccumulator>,
  profilesBySpaceId: Map<string, { name: string | null; avatarUrl: string | null }>,
  currentUserSpaceId: string | null
): { rows: CuratorLeaderboardRow[]; currentUserRow: CuratorLeaderboardRow | null } {
  const unsorted = [...countsByCurator.entries()].map(([curatorSpaceId, counts]) => {
    const profile = profilesBySpaceId.get(curatorSpaceId);
    return {
      curatorSpaceId,
      name: profile?.name?.trim() || 'Unknown curator',
      avatarUrl: profile?.avatarUrl ?? null,
      rankings: counts.rankings,
      newsStories: counts.newsStories,
      votes: counts.votes,
      submissions: counts.submissions,
      activityScore: counts.rankings + counts.newsStories + counts.submissions,
      rank: 0,
      isCurrentUser: Boolean(currentUserSpaceId && ID.equals(curatorSpaceId, currentUserSpaceId)),
    } satisfies CuratorLeaderboardRow;
  });

  unsorted.sort((a, b) => {
    if (b.activityScore !== a.activityScore) return b.activityScore - a.activityScore;
    if (b.rankings !== a.rankings) return b.rankings - a.rankings;
    if (b.votes !== a.votes) return b.votes - a.votes;
    return a.name.localeCompare(b.name);
  });

  const ranked = unsorted.map((row, index) => ({ ...row, rank: index + 1 }));
  const currentUserRow = currentUserSpaceId
    ? (ranked.find(row => row.isCurrentUser) ??
      ({
        curatorSpaceId: currentUserSpaceId,
        name: profilesBySpaceId.get(currentUserSpaceId)?.name?.trim() || 'You',
        avatarUrl: profilesBySpaceId.get(currentUserSpaceId)?.avatarUrl ?? null,
        rankings: 0,
        newsStories: 0,
        votes: 0,
        submissions: 0,
        activityScore: 0,
        rank: ranked.length + 1,
        isCurrentUser: true,
      } satisfies CuratorLeaderboardRow))
    : null;

  const topRows = ranked.slice(0, CURATOR_LEADERBOARD_MAX_ROWS);
  const currentUserInTop = currentUserRow ? topRows.some(row => row.isCurrentUser) : true;

  return {
    rows: topRows,
    currentUserRow: currentUserRow && !currentUserInTop ? currentUserRow : null,
  };
}

/**
 * Space-scoped curator leaderboard.
 */
export async function fetchCuratorLeaderboard({
  spaceId,
  period,
  currentUserSpaceId = null,
  signal,
}: {
  spaceId: string;
  period: CuratorLeaderboardPeriod;
  currentUserSpaceId?: string | null;
  signal?: AbortController['signal'];
}): Promise<CuratorLeaderboardResult> {
  const emptyResult: CuratorLeaderboardResult = {
    period,
    metrics: { activeCurators: 0, rankings: 0, newsStories: 0 },
    rows: [],
    currentUserRow: null,
    truncated: false,
  };

  const spaceHex = gqlId(spaceId);
  if (!spaceHex) return emptyResult;

  const window = curatorLeaderboardWindow(period);

  const [rankings, votes, submissions, newsStories] = await Promise.all([
    fetchRankingCounts(spaceHex, window, signal),
    fetchVoteCounts(spaceHex, window, signal),
    fetchSubmissionCounts(spaceHex, window, signal),
    fetchNewsStoryCounts(spaceHex, window, signal),
  ]);

  const countsByCurator = new Map<string, CuratorAccumulator>();

  const accumulate = (curatorSpaceId: string, apply: (counts: CuratorAccumulator) => void) => {
    const key = ID.uuidToHex(curatorSpaceId);
    const counts = countsByCurator.get(key) ?? emptyAccumulator();
    apply(counts);
    countsByCurator.set(key, counts);
  };

  for (const [curatorSpaceId, count] of rankings.perCurator) {
    accumulate(curatorSpaceId, counts => (counts.rankings += count));
  }
  for (const [curatorSpaceId, count] of votes.perCurator) {
    accumulate(curatorSpaceId, counts => (counts.votes += count));
  }
  for (const [curatorSpaceId, count] of submissions.perCurator) {
    accumulate(curatorSpaceId, counts => (counts.submissions += count));
  }
  for (const [curatorSpaceId, count] of newsStories.perCurator) {
    accumulate(curatorSpaceId, counts => (counts.newsStories += count));
  }

  // Dropped here rather than per source, so everything downstream agrees: the rows, the active
  // curator count, and the profiles fetched below all read this one map. The space-wide totals
  // beside them (rankings, news stories) are deliberately left alone — they count what the space
  // holds, not who is on the board, and an excluded curator's rankings are still the space's.
  // Over a snapshot of the keys rather than the live iterator: deleting the current key mid-loop is
  // well defined, but it reads like a bug and invites one the next time this moves.
  for (const curatorSpaceId of [...countsByCurator.keys()]) {
    if (isExcludedCurator(curatorSpaceId)) countsByCurator.delete(curatorSpaceId);
  }

  // An excluded curator is excluded from their own view too. Left as-is, `buildRows` would append
  // them their own row — with zeroed counts, since the real ones were just dropped — which is both
  // a leak of the thing being hidden and wrong about their activity.
  const viewerSpaceId = isExcludedCurator(currentUserSpaceId) ? null : currentUserSpaceId;
  const normalizedCurrentUserSpaceId = viewerSpaceId ? gqlId(viewerSpaceId) : null;

  const profileSpaceIds = [...countsByCurator.keys()];
  if (normalizedCurrentUserSpaceId && !profileSpaceIds.includes(normalizedCurrentUserSpaceId)) {
    profileSpaceIds.push(normalizedCurrentUserSpaceId);
  }

  const profiles = profileSpaceIds.length > 0 ? await Effect.runPromise(fetchProfilesBySpaceIds(profileSpaceIds)) : [];
  const profilesBySpaceId = new Map(
    profiles.map(profile => [ID.uuidToHex(profile.spaceId), { name: profile.name, avatarUrl: profile.avatarUrl }])
  );

  const { rows, currentUserRow } = buildRows(countsByCurator, profilesBySpaceId, normalizedCurrentUserSpaceId);

  return {
    period,
    metrics: {
      activeCurators: countsByCurator.size,
      rankings: rankings.total,
      newsStories: newsStories.total,
    },
    rows,
    currentUserRow,
    truncated: rankings.truncated || votes.truncated || submissions.truncated || newsStories.truncated,
  };
}
