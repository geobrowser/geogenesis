import type { TypedDocumentNode } from '@graphql-typed-document-node/core';

import { Effect } from 'effect';
import { parse } from 'graphql';

import { ID } from '~/core/id';
import { graphql } from '~/core/io/graphql-client';

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

/** Pages with cursors until the server says there are no more (offsets cap at 1,000). */
async function fetchAll(filter: Record<string, unknown>, signal?: AbortSignal): Promise<MemberVoteRecord[]> {
  const records: MemberVoteRecord[] = [];
  let after: string | null = null;
  for (let page = 0; page < MAX_PAGES; page++) {
    const result: Page = await Effect.runPromise(fetchPage(filter, after, signal));
    records.push(...result.records);
    if (!result.hasNextPage || !result.endCursor) return records;
    after = result.endCursor;
  }
  return records;
}

/** Every curation vote the member holds on one debate, in every space. */
export function fetchMemberDebateVotes(
  memberSpaceId: string,
  debateId: string,
  signal?: AbortSignal
): Promise<MemberVoteRecord[]> {
  return fetchAll(
    {
      userId: { is: memberSpaceId },
      objectId: { is: debateId },
      voteKind: { is: CURATION_VOTE_KIND },
      objectType: { is: ENTITY_OBJECT_TYPE },
    },
    signal
  );
}

/**
 * Every curation downvote the member holds, any entity, any space, newest first, paged until
 * exhausted. Only curation downvotes: claim Disagrees and the like (other kinds) aren't read.
 */
export function fetchMemberCurationDownvotes(memberSpaceId: string, signal?: AbortSignal): Promise<MemberVoteRecord[]> {
  return fetchAll(
    {
      userId: { is: memberSpaceId },
      voteType: { is: DOWNVOTE_TYPE },
      voteKind: { is: CURATION_VOTE_KIND },
      objectType: { is: ENTITY_OBJECT_TYPE },
    },
    signal
  );
}

export function memberDebateVotesQueryKey(memberSpaceId: string | null | undefined, debateId: string) {
  return ['member-debate-votes', memberSpaceId ? ID.uuidToHex(memberSpaceId) : null, ID.uuidToHex(debateId)] as const;
}

export function memberCurationDownvotesQueryKey(memberSpaceId: string | null | undefined) {
  return ['member-curation-downvotes', memberSpaceId ? ID.uuidToHex(memberSpaceId) : null] as const;
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
