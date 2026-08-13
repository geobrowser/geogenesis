import type { TypedDocumentNode } from '@graphql-typed-document-node/core';

import { parse } from 'graphql';

const USER_ENTITY_VOTES_BY_TYPE_SOURCE = /* GraphQL */ `
  query UserEntityVotesByType($userId: UUID!, $voteType: Int!, $objectType: Int!, $first: Int!, $after: Cursor) {
    userVotesConnection(
      first: $first
      after: $after
      condition: { userId: $userId, voteType: $voteType, objectType: $objectType }
      orderBy: [VOTED_AT_DESC]
    ) {
      nodes {
        objectId
        voteKind
      }
      pageInfo {
        hasNextPage
        endCursor
      }
    }
  }
`;

export type UserEntityVotesByTypeQuery = {
  userVotesConnection?: {
    nodes: Array<{ objectId: string; voteKind: number }>;
    pageInfo: { hasNextPage: boolean; endCursor?: string | null };
  } | null;
};

export type UserEntityVotesByTypeQueryVariables = {
  userId: string;
  voteType: number;
  objectType: number;
  first: number;
  after?: string | null;
};

export const UserEntityVotesByTypeDocument = parse(USER_ENTITY_VOTES_BY_TYPE_SOURCE) as unknown as TypedDocumentNode<
  UserEntityVotesByTypeQuery,
  UserEntityVotesByTypeQueryVariables
>;
