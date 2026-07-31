import { SystemIds } from '@geoprotocol/geo-sdk/lite';

import { Effect } from 'effect';

import { BOUNTIES_RELATION_TYPE, FEATURED_TAG_ID, NEWS_STORY_TYPE_ID, TAG_PROPERTY_ID } from '~/core/constants';
import { ID } from '~/core/id';
import { fetchProfilesBySpaceIds } from '~/core/io/subgraph/fetch-profile';
import { AGGREGATED_RANKINGS_PROPERTY_ID, RANKING_BLOCK_TYPE_ID } from '~/core/ranking-block-ids';

import { ID_CHUNK_SIZE, afterArg, chunk, collectConnection, gqlId, gqlIdList, runQuery } from './community-graphql';
import { type CuratorLeaderboardWindow, curatorLeaderboardWindow, isWithinWindow } from './curator-leaderboard-period';
import type {
  CuratorLeaderboardPeriod,
  CuratorLeaderboardResult,
  CuratorLeaderboardRow,
} from './curator-leaderboard-types';

const MAX_TABLE_ROWS = 5;

const FEATURED_BLOCK_LIMIT = 100;
const RELATION_PAGE_SIZE = 500;
const ENTITY_PAGE_SIZE = 200;
const VOTE_PAGE_SIZE = 1000;

type CuratorAccumulator = {
  rankings: number;
  newsStories: number;
  votes: number;
  submissions: number;
};

function emptyAccumulator(): CuratorAccumulator {
  return { rankings: 0, newsStories: 0, votes: 0, submissions: 0 };
}

/** Featured ranking blocks that live in this space. */
async function fetchFeaturedRankingBlockIds(spaceHex: string, signal?: AbortController['signal']): Promise<string[]> {
  const typesProperty = gqlId(SystemIds.TYPES_PROPERTY);
  const rankingBlockType = gqlId(RANKING_BLOCK_TYPE_ID);
  const tagProperty = gqlId(TAG_PROPERTY_ID);
  const featuredTag = gqlId(FEATURED_TAG_ID);

  if (!typesProperty || !rankingBlockType || !tagProperty || !featuredTag) return [];

  const data = await runQuery<{ entitiesConnection?: { nodes: { id: string }[] } }>(
    'featured ranking blocks',
    `query {
      entitiesConnection(
        first: ${FEATURED_BLOCK_LIMIT}
        filter: {
          spaceIds: { overlaps: ["${spaceHex}"] }
          and: [
            { relations: { some: { typeId: { is: "${typesProperty}" }, toEntityId: { is: "${rankingBlockType}" } } } }
            { relations: { some: { typeId: { is: "${tagProperty}" }, toEntityId: { is: "${featuredTag}" } } } }
          ]
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
 * Rankings — one `Aggregated rankings` relation on the block per submitted ballot.
 */
async function fetchRankingCounts(
  spaceHex: string,
  window: CuratorLeaderboardWindow,
  signal?: AbortController['signal']
): Promise<{ perCurator: Map<string, number>; total: number }> {
  const perCurator = new Map<string, number>();
  const aggregatedRankings = gqlId(AGGREGATED_RANKINGS_PROPERTY_ID);
  const blockIds = await fetchFeaturedRankingBlockIds(spaceHex, signal);

  if (!aggregatedRankings || blockIds.length === 0) return { perCurator, total: 0 };

  const relations = await collectConnection<{ toEntityId: string; toSpaceId: string | null }>(
    'aggregated ranking relations',
    after => `query {
      relationsConnection(
        first: ${RELATION_PAGE_SIZE}${afterArg(after)}
        filter: {
          typeId: { is: "${aggregatedRankings}" }
          spaceId: { is: "${spaceHex}" }
          fromEntityId: { in: [${gqlIdList(blockIds)}] }
        }
      ) {
        pageInfo { endCursor hasNextPage }
        nodes { toEntityId toSpaceId }
      }
    }`,
    data => data.relationsConnection,
    signal
  );

  if (relations.length === 0) return { perCurator, total: 0 };

  const rankEntityIds = [...new Set(relations.map(relation => relation.toEntityId).filter(Boolean))];
  const rankEntities = new Map<string, { spaceId: string | null; createdAt: string | null }>();

  for (const ids of chunk(rankEntityIds, ID_CHUNK_SIZE)) {
    const data = await runQuery<{
      entitiesConnection?: { nodes: { id: string; spaceIds: (string | null)[] | null; createdAt: string | null }[] };
    }>(
      'rank entities',
      `query {
        entitiesConnection(first: ${ids.length}, filter: { id: { in: [${gqlIdList(ids)}] } }) {
          nodes { id spaceIds createdAt }
        }
      }`,
      signal
    );

    for (const node of data?.entitiesConnection?.nodes ?? []) {
      rankEntities.set(node.id, { spaceId: node.spaceIds?.[0] ?? null, createdAt: node.createdAt });
    }
  }

  let total = 0;

  for (const relation of relations) {
    const rankEntity = rankEntities.get(relation.toEntityId);
    if (!isWithinWindow(rankEntity?.createdAt, window)) continue;

    const curatorSpaceId = relation.toSpaceId ?? rankEntity?.spaceId;
    if (!curatorSpaceId) continue;

    perCurator.set(curatorSpaceId, (perCurator.get(curatorSpaceId) ?? 0) + 1);
    total += 1;
  }

  return { perCurator, total };
}

/**
 * Votes — upvotes and downvotes cast on entities in this space.
 */
async function fetchVoteCounts(
  spaceHex: string,
  window: CuratorLeaderboardWindow,
  signal?: AbortController['signal']
): Promise<Map<string, number>> {
  const perCurator = new Map<string, number>();
  const votedAtFilter = window.iso ? `votedAt: { greaterThanOrEqualTo: "${window.iso}" }` : '';

  const votes = await collectConnection<{ userId: string }>(
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

  return perCurator;
}

/**
 * Submissions — accepted proposals in this space that were linked to a bounty.
 */
async function fetchSubmissionCounts(
  spaceHex: string,
  window: CuratorLeaderboardWindow,
  signal?: AbortController['signal']
): Promise<Map<string, number>> {
  const perCurator = new Map<string, number>();
  const bountiesRelation = gqlId(BOUNTIES_RELATION_TYPE);
  if (!bountiesRelation) return perCurator;

  const links = await collectConnection<{ fromEntityId: string }>(
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
  if (proposalIds.length === 0) return perCurator;

  const executedAtFilter =
    window.seconds === null
      ? 'executedAt: { isNull: false }'
      : `executedAt: { greaterThanOrEqualTo: "${window.seconds}" }`;

  for (const ids of chunk(proposalIds, ID_CHUNK_SIZE)) {
    const data = await runQuery<{ proposalsConnection?: { nodes: { id: string; proposedBy: string }[] } }>(
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
    );

    for (const proposal of data?.proposalsConnection?.nodes ?? []) {
      if (!proposal.proposedBy) continue;
      perCurator.set(proposal.proposedBy, (perCurator.get(proposal.proposedBy) ?? 0) + 1);
    }
  }

  return perCurator;
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
): Promise<{ perCurator: Map<string, number>; total: number }> {
  const perCurator = new Map<string, number>();
  const newsStoryType = gqlId(NEWS_STORY_TYPE_ID);
  const typesProperty = gqlId(SystemIds.TYPES_PROPERTY);
  if (!newsStoryType || !typesProperty) return { perCurator, total: 0 };

  const createdAtFilter =
    window.seconds === null ? '' : `filter: { createdAt: { greaterThanOrEqualTo: "${window.seconds}" } }`;

  const stories = await collectConnection<{ id: string }>(
    'news story entities',
    after => `query {
      entitiesConnection(
        first: ${ENTITY_PAGE_SIZE}${afterArg(after)}
        spaceId: "${spaceHex}"
        typeId: "${newsStoryType}"
        ${createdAtFilter}
      ) {
        pageInfo { endCursor hasNextPage }
        nodes { id }
      }
    }`,
    data => data.entitiesConnection,
    signal
  );

  const storyIds = [...new Set(stories.map(story => story.id).filter(Boolean))];
  if (storyIds.length === 0) return { perCurator, total: 0 };

  const firstVersionKeyByStory = new Map<string, bigint>();

  for (const ids of chunk(storyIds, ID_CHUNK_SIZE)) {
    const versions = await collectConnection<{ fromEntityId: string; validFromKey: string }>(
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
    );

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

  for (const keys of chunk(versionKeys, ID_CHUNK_SIZE)) {
    const data = await runQuery<{
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
    );

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

  return { perCurator, total: storyIds.length };
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

  const topRows = ranked.slice(0, MAX_TABLE_ROWS);
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
  for (const [curatorSpaceId, count] of votes) {
    accumulate(curatorSpaceId, counts => (counts.votes += count));
  }
  for (const [curatorSpaceId, count] of submissions) {
    accumulate(curatorSpaceId, counts => (counts.submissions += count));
  }
  for (const [curatorSpaceId, count] of newsStories.perCurator) {
    accumulate(curatorSpaceId, counts => (counts.newsStories += count));
  }

  const normalizedCurrentUserSpaceId = currentUserSpaceId ? gqlId(currentUserSpaceId) : null;

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
  };
}
