import type { TypedDocumentNode } from '@graphql-typed-document-node/core';

import { Effect } from 'effect';
import { parse } from 'graphql';

import { ID } from '~/core/id';
import { graphql } from '~/core/io/graphql-client';

import { DEBATE_TYPE_ID } from './best-debates';

/**
 * A member's curation votes (vote kind 0, entity objects) with the space each was cast in
 * (GEO-3679). gaia counts a Debates member's downvote by voter, whatever space it was cast in
 * (`user_votes.space_id` is never read for push-down), so push-down has to see, and clear, every
 * one of them. The vote lists the profile tabs use carry no space, so they can't answer this.
 *
 * Kept as `parse()` documents so they do not need the generated `gql.ts` map.
 */
const MEMBER_CURATION_VOTES_SOURCE = /* GraphQL */ `
  query MemberCurationVotes($filter: UserVoteFilter!, $first: Int!, $after: Cursor) {
    userVotesConnection(
      filter: $filter
      first: $first
      after: $after
      orderBy: [VOTED_AT_DESC, OBJECT_ID_ASC, SPACE_ID_ASC]
    ) {
      pageInfo {
        hasNextPage
        endCursor
      }
      nodes {
        objectId
        spaceId
        voteType
        votedAt
      }
    }
  }
`;

type MemberCurationVotesQuery = {
  userVotesConnection: {
    pageInfo: { hasNextPage: boolean; endCursor: string | null };
    nodes: Array<{ objectId: string | null; spaceId: string | null; voteType: number; votedAt: string | null }>;
  } | null;
};

const memberCurationVotesDocument = parse(MEMBER_CURATION_VOTES_SOURCE) as TypedDocumentNode<
  MemberCurationVotesQuery,
  { filter: Record<string, unknown>; first: number; after?: string | null }
>;

const DEBATE_IDS_SOURCE = /* GraphQL */ `
  query DebateIdsAmong($ids: [UUID!]!, $typeId: UUID!, $first: Int!) {
    entities(filter: { id: { in: $ids }, typeIds: { anyEqualTo: $typeId } }, first: $first) {
      id
    }
  }
`;

const debateIdsDocument = parse(DEBATE_IDS_SOURCE) as TypedDocumentNode<
  { entities: Array<{ id: string | null }> | null },
  { ids: string[]; typeId: string; first: number }
>;

const CURATION_VOTE_KIND = 0;
const ENTITY_OBJECT_TYPE = 0;
const DOWNVOTE_TYPE = 1;
const PAGE_SIZE = 500;
/** A backstop against a cursor that never ends, far above any member's real vote count. */
const MAX_PAGES = 40;

/** One curation vote record: who cast it is implied (the member), so this is what and where. */
export type MemberVoteRecord = {
  objectId: string;
  spaceId: string;
  direction: 'positive' | 'negative';
  votedAt: string;
};

type Page = { records: MemberVoteRecord[]; hasNextPage: boolean; endCursor: string | null };

function fetchPage(filter: Record<string, unknown>, after: string | null, signal?: AbortSignal) {
  return graphql({
    query: memberCurationVotesDocument,
    variables: { filter, first: PAGE_SIZE, after },
    signal,
    decoder: (data): Page => {
      const connection = data.userVotesConnection;
      const records = (connection?.nodes ?? []).flatMap((node): MemberVoteRecord[] => {
        if (!node.objectId || !node.spaceId) return [];
        if (node.voteType !== 0 && node.voteType !== 1) return [];
        return [
          {
            objectId: ID.uuidToHex(node.objectId),
            spaceId: ID.uuidToHex(node.spaceId),
            direction: node.voteType === DOWNVOTE_TYPE ? 'negative' : 'positive',
            votedAt: node.votedAt ?? '',
          },
        ];
      });
      return {
        records,
        hasNextPage: Boolean(connection?.pageInfo.hasNextPage),
        endCursor: connection?.pageInfo.endCursor ?? null,
      };
    },
  });
}

/** The `votedAt` lower bound for a launch time in epoch seconds. */
export function votedSinceFilter(sinceSeconds: number | null | undefined) {
  return sinceSeconds == null ? {} : { votedAt: { greaterThanOrEqualTo: new Date(sinceSeconds * 1000).toISOString() } };
}

/**
 * Pages with cursors until the server says there are no more (offsets cap at 1,000). `keep`
 * filters each page as it lands, so a long history is never held whole.
 */
async function fetchAll(
  filter: Record<string, unknown>,
  signal?: AbortSignal,
  keep?: (records: MemberVoteRecord[]) => Promise<MemberVoteRecord[]>
): Promise<MemberVoteRecord[]> {
  const records: MemberVoteRecord[] = [];
  let after: string | null = null;
  for (let page = 0; page < MAX_PAGES; page++) {
    const result: Page = await Effect.runPromise(fetchPage(filter, after, signal));
    records.push(...(keep ? await keep(result.records) : result.records));
    if (!result.hasNextPage || !result.endCursor) return records;
    after = result.endCursor;
  }
  return records;
}

/** Which of `ids` are Debate entities, in one request per page of votes. */
export async function fetchDebateIdsAmong(ids: readonly string[], signal?: AbortSignal): Promise<Set<string>> {
  const unique = [...new Set(ids.map(id => ID.uuidToHex(id)))];
  if (unique.length === 0) return new Set();
  return Effect.runPromise(
    graphql({
      query: debateIdsDocument,
      variables: { ids: unique, typeId: DEBATE_TYPE_ID, first: unique.length },
      signal,
      decoder: data => new Set((data.entities ?? []).flatMap(entity => (entity?.id ? [ID.uuidToHex(entity.id)] : []))),
    })
  );
}

type ReadOptions = {
  /** Only votes cast at or after this, in epoch seconds (`BEST_DEBATES_PUSHDOWN_SINCE`). */
  since?: number | null;
  signal?: AbortSignal;
};

/**
 * Every curation vote the member holds on one debate, in every space. With `since`, only those
 * cast since then; with no `since`, all of them (the index check after a write needs those).
 */
export function fetchMemberDebateVotes(
  memberSpaceId: string,
  debateId: string,
  { since, signal }: ReadOptions = {}
): Promise<MemberVoteRecord[]> {
  return fetchAll(
    {
      userId: { is: memberSpaceId },
      objectId: { is: debateId },
      voteKind: { is: CURATION_VOTE_KIND },
      objectType: { is: ENTITY_OBJECT_TYPE },
      ...votedSinceFilter(since),
    },
    signal
  );
}

/**
 * The member's push-downs: curation downvotes on Debate entities cast since `since`, any space,
 * newest first. gaia counts only those (`voted_at >= ranking_pushdown_since`), which also bounds
 * the history read. Pages to exhaustion; each page is narrowed to debates as it lands, so newer
 * downvotes on claims can never crowd a debate out. A null `since` means push-down hasn't
 * launched: nothing counts, so nothing is read.
 */
export async function fetchMemberDebateDownvotes(
  memberSpaceId: string,
  { since, signal }: ReadOptions
): Promise<MemberVoteRecord[]> {
  if (since == null) return [];
  return fetchAll(
    {
      userId: { is: memberSpaceId },
      voteType: { is: DOWNVOTE_TYPE },
      voteKind: { is: CURATION_VOTE_KIND },
      objectType: { is: ENTITY_OBJECT_TYPE },
      ...votedSinceFilter(since),
    },
    signal,
    async records => {
      const debates = await fetchDebateIdsAmong(
        records.map(record => record.objectId),
        signal
      );
      return records.filter(record => debates.has(ID.uuidToHex(record.objectId)));
    }
  );
}

/**
 * The member's counted downvotes on just these entities (a ballot's debates), for the ranking
 * screen's Publish: one request for any real ballot, not a walk through the whole history.
 */
export async function fetchMemberDownvotesOn(
  memberSpaceId: string,
  objectIds: readonly string[],
  { since, signal }: ReadOptions
): Promise<MemberVoteRecord[]> {
  if (since == null || objectIds.length === 0) return [];
  const unique = [...new Set(objectIds.map(id => ID.uuidToHex(id)))];
  const records: MemberVoteRecord[] = [];
  for (let start = 0; start < unique.length; start += PAGE_SIZE) {
    records.push(
      ...(await fetchAll(
        {
          userId: { is: memberSpaceId },
          objectId: { in: unique.slice(start, start + PAGE_SIZE) },
          voteType: { is: DOWNVOTE_TYPE },
          voteKind: { is: CURATION_VOTE_KIND },
          objectType: { is: ENTITY_OBJECT_TYPE },
          ...votedSinceFilter(since),
        },
        signal
      ))
    );
  }
  return records;
}

export function memberDebateVotesQueryKey(memberSpaceId: string | null | undefined, debateId: string) {
  return ['member-debate-votes', memberSpaceId ? ID.uuidToHex(memberSpaceId) : null, ID.uuidToHex(debateId)] as const;
}

export function memberDebateDownvotesQueryKey(memberSpaceId: string | null | undefined) {
  return ['member-debate-downvotes', memberSpaceId ? ID.uuidToHex(memberSpaceId) : null] as const;
}

/** The spaces holding the member's downvote on the debate. */
export function downvotedSpaceIds(records: readonly MemberVoteRecord[]): string[] {
  return [...new Set(records.filter(record => record.direction === 'negative').map(record => record.spaceId))];
}

/** The member's vote on the debate in one space, or null. */
export function voteInSpace(
  records: readonly MemberVoteRecord[],
  spaceId: string
): MemberVoteRecord['direction'] | null {
  return records.find(record => ID.equals(record.spaceId, spaceId))?.direction ?? null;
}
