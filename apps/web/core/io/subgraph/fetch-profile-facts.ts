import { Effect, Either } from 'effect';

import { Environment } from '~/core/environment';
import { DEBATE_OPPOSED_BY_PROPERTY, DEBATE_SUPPORTED_BY_PROPERTY, DEBATE_TYPE } from '~/core/profile/history-ontology';
import {
  NO_FACTS,
  type ProfileFacts,
  type ProfileSpace,
  type Verifier,
  orderSpaces,
} from '~/core/profile/profile-facts';
import { normId } from '~/core/utils/norm-id';

import { graphql } from './graphql';

type SpaceNode = {
  spaceId: string;
  space: { topic: { name: string | null } | null } | null;
};

type PositionsPage = {
  pageInfo: { hasNextPage: boolean | null; endCursor: string | null } | null;
  nodes: { objectId: string | null }[];
};

type VerifierNode = {
  parentSpaceId: string;
  parentSpace: { type: string; topic: { name: string | null } | null } | null;
};

interface NetworkResult {
  members: { nodes: SpaceNode[] } | null;
  editors: { nodes: SpaceNode[] } | null;
  proposals: { totalCount: number } | null;
  positions: PositionsPage | null;
  supported: { nodes: { fromEntity: { id: string } | null }[] } | null;
  opposed: { nodes: { fromEntity: { id: string } | null }[] } | null;
  verifiedBy: { nodes: VerifierNode[] } | null;
  person: { createdAt: string | null } | null;
}

/**
 * Everything the rail states, in one request.
 *
 * Seven counts that have no aggregate between them — there is no per-person
 * summary in the API, so the choice is one round trip with seven aliases or
 * seven round trips. The page streams the header first either way; this only
 * decides how long the rail takes to arrive after it.
 *
 * `personEntityId` is here for the join date alone. Everything else keys on the
 * space, and passing the entity id to any of them returns zero rather than an
 * error, which is the whole trap this file exists to close.
 */
/**
 * How many vote rows the Positions count reads per request.
 *
 * `totalCount` cannot answer this. It counts *rows*, and the Positions tab
 * collapses a claim's stance and veracity votes into one card — so somebody who
 * did both saw a rail count larger than the list it links to. The ids have to be
 * read and counted distinct, the same way the debate sides below are.
 *
 * The first page rides along with the rest of the rail, so the usual profile
 * still costs one round trip: 194 rows on the heaviest account on testnet, and
 * 3,207 across everyone. Only somebody past a full page costs a second.
 */
const POSITIONS_PAGE_SIZE = 500;

/**
 * A ceiling on the follow-up requests, not on the count.
 *
 * Paging is by cursor rather than offset because the server rejects any offset
 * above 1000 — the same reason `fetchRelationsByToEntityIds` gives. A cursor has
 * no ceiling of its own, so this one is here to bound a server-rendered page
 * against a pathological record, not because the data needs it: 20 pages is
 * 10,000 vote rows, fifty times the busiest account that exists.
 */
const POSITIONS_MAX_PAGES = 20;

/**
 * One side of a debate, pointed at this space.
 *
 * Nodes rather than a count, and typed to `Debate`, because neither shortcut
 * survives the data. `totalCount` counts *relations*: this account carries 13
 * rows across 10 debates, one of them written three times. And without the type
 * filter the same query picks up side relations on things that are not debates
 * at all — the rail would say 17 where the tab shows 10, which reads as a bug in
 * one of them.
 */
function debateSide(typeId: string, sp: string) {
  return `relationsConnection(
    filter: {
      typeId: { is: "${typeId}" }
      toEntityId: { is: ${sp} }
      fromEntity: { typeIds: { overlaps: ["${DEBATE_TYPE}"] } }
    }
    first: 200
  ) { nodes { fromEntity { id } } }`;
}

/** Distinct non-null values, which is what every count on this rail means. */
function distinctCount<T>(nodes: T[], key: (node: T) => string | null | undefined): number {
  const seen = new Set<string>();

  for (const node of nodes) {
    const id = key(node);
    if (id) seen.add(normId(id));
  }

  return seen.size;
}

/** One page of this person's stance and veracity votes, ids only. */
function positionsPage(sp: string, after: string | null) {
  return `userVotesConnection(
    filter: { userId: { is: ${sp} }, or: [{ voteKind: { is: 1 } }, { voteKind: { is: 2 } }] }
    first: ${POSITIONS_PAGE_SIZE}
    ${after ? `after: ${JSON.stringify(after)}` : ''}
  ) { pageInfo { hasNextPage endCursor } nodes { objectId } }`;
}

function profileFactsQuery(spaceId: string, personEntityId: string | null) {
  const sp = JSON.stringify(spaceId);
  const person = personEntityId ? JSON.stringify(personEntityId) : null;

  return `query {
    members: membersConnection(filter: { memberSpaceId: { is: ${sp} } }, first: 200) {
      nodes { spaceId space { topic { name } } }
    }
    editors: editorsConnection(filter: { memberSpaceId: { is: ${sp} } }, first: 200) {
      nodes { spaceId space { topic { name } } }
    }
    proposals: proposalsConnection(filter: { proposedBy: { is: ${sp} } }) { totalCount }
    positions: ${positionsPage(sp, null)}
    supported: ${debateSide(DEBATE_SUPPORTED_BY_PROPERTY, sp)}
    opposed: ${debateSide(DEBATE_OPPOSED_BY_PROPERTY, sp)}
    verifiedBy: subspacesConnection(
      filter: { childSpaceId: { is: ${sp} }, type: { is: VERIFIED } }, first: 60
    ) {
      nodes { parentSpaceId parentSpace { type topic { name } } }
    }
    ${person ? `person: entity(id: ${person}) { createdAt }` : ''}
  }`;
}

/**
 * Every remaining vote row, once the first page came back full.
 *
 * Failure is answered with what it has rather than thrown, matching the rest of
 * this file: a count that is low because the fourth page timed out is a better
 * rail than no rail.
 */
async function fetchRemainingPositions(spaceId: string, first: PositionsPage): Promise<{ objectId: string | null }[]> {
  const sp = JSON.stringify(spaceId);
  const nodes = [...first.nodes];
  let after = first.pageInfo?.endCursor ?? null;
  let hasNextPage = first.pageInfo?.hasNextPage ?? false;

  for (let page = 1; page < POSITIONS_MAX_PAGES && hasNextPage && after; page++) {
    const result = await Effect.runPromise(
      Effect.either(
        graphql<{ positions: PositionsPage | null }>({
          query: `query { positions: ${positionsPage(sp, after)} }`,
          endpoint: Environment.getConfig().api,
        })
      )
    );

    if (Either.isLeft(result)) {
      console.error(`[profile-facts] positions page ${page} failed for ${spaceId}:`, result.left);
      break;
    }

    const next = result.right.positions;
    if (!next) break;

    nodes.push(...next.nodes);
    after = next.pageInfo?.endCursor ?? null;
    hasNextPage = next.pageInfo?.hasNextPage ?? false;
  }

  return nodes;
}

export function profileFactsQueryKey(spaceId: string, personEntityId: string | null) {
  return ['profile-facts', spaceId, personEntityId] as const;
}

export async function fetchProfileFacts(spaceId: string, personEntityId: string | null): Promise<ProfileFacts> {
  const result = await Effect.runPromise(
    Effect.either(
      graphql<NetworkResult>({
        query: profileFactsQuery(spaceId, personEntityId),
        endpoint: Environment.getConfig().api,
      })
    )
  );

  if (Either.isLeft(result)) {
    // Answered with nothing rather than thrown. Unlike the history sections,
    // none of this is editable — a count the reader never sees is a worse page,
    // not a wrong write. The rail hides the rows it has no answer for.
    console.error(`[profile-facts] failed to fetch facts for ${spaceId}:`, result.left);
    return NO_FACTS;
  }

  const data = result.right;

  // Membership and editorship are separate rows that almost entirely overlap,
  // so they are merged into one list with the role on each. Two lists that agree
  // 33 times out of 33 read as a bug.
  const byId = new Map<string, ProfileSpace>();

  for (const node of data.members?.nodes ?? []) {
    byId.set(node.spaceId, {
      id: node.spaceId,
      name: node.space?.topic?.name ?? null,
      isEditor: false,
    });
  }

  for (const node of data.editors?.nodes ?? []) {
    const existing = byId.get(node.spaceId);
    byId.set(node.spaceId, {
      id: node.spaceId,
      name: existing?.name ?? node.space?.topic?.name ?? null,
      isEditor: true,
    });
  }

  // Only costs a request if the first page came back full, which no account on
  // testnet does — the busiest holds 194 rows against a page of 500.
  const positionNodes = data.positions ? await fetchRemainingPositions(spaceId, data.positions) : [];

  const verifiedBy: Verifier[] = (data.verifiedBy?.nodes ?? []).map(node => ({
    spaceId: node.parentSpaceId,
    name: node.parentSpace?.topic?.name ?? null,
    // Avatars need a second read per verifier; the stack renders initials until
    // that is worth doing.
    avatarUrl: null,
    isPerson: node.parentSpace?.type === 'PERSONAL',
  }));

  return {
    proposals: data.proposals?.totalCount ?? 0,
    positions: distinctCount(positionNodes, node => node.objectId),
    // Distinct debates across both sides. Adding the two totals counts a debate
    // twice where it names the same person on both — and counts duplicate writes
    // as separate debates, which is how 10 becomes 13.
    debates: distinctCount(
      [...(data.supported?.nodes ?? []), ...(data.opposed?.nodes ?? [])],
      node => node.fromEntity?.id
    ),
    spaces: orderSpaces([...byId.values()]),
    verifiedBy,
    joinedAt: data.person?.createdAt ? Number(data.person.createdAt) : null,
  };
}
