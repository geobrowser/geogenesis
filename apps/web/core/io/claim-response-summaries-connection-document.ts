import type { TypedDocumentNode } from '@graphql-typed-document-node/core';

import { parse } from 'graphql';

import type { UserVoteFilter } from '~/core/gql/graphql';

/**
 * One page of the `user_votes` rows behind a set of claims' supporter/opposer tallies.
 */
const CLAIM_RESPONSE_SUMMARIES_CONNECTION_SOURCE = /* GraphQL */ `
  query ClaimResponseSummariesConnection($filter: UserVoteFilter!, $first: Int!, $after: Cursor) {
    userVotesConnection(filter: $filter, first: $first, after: $after, orderBy: [VOTED_AT_DESC, OBJECT_ID_ASC]) {
      pageInfo {
        hasNextPage
        endCursor
      }
      nodes {
        userId
        objectId
        voteType
        voteKind
      }
    }
  }
`;

export type ClaimResponseSummariesConnectionQuery = {
  userVotesConnection: {
    pageInfo: { hasNextPage: boolean; endCursor: string | null };
    nodes: Array<{ userId: unknown; objectId: unknown; voteType: number; voteKind: number } | null>;
  } | null;
};

type ClaimResponseSummariesConnectionVariables = {
  filter: UserVoteFilter;
  first: number;
  after?: string;
};

export const claimResponseSummariesConnectionDocument = parse(
  CLAIM_RESPONSE_SUMMARIES_CONNECTION_SOURCE
) as TypedDocumentNode<ClaimResponseSummariesConnectionQuery, ClaimResponseSummariesConnectionVariables>;
