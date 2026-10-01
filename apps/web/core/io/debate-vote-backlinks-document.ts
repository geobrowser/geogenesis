import type { TypedDocumentNode } from '@graphql-typed-document-node/core';

import { parse } from 'graphql';

/**
 * One page of the Vote entities cast on a debate, found through the debate's incoming
 * "Debates" relations. Filtering on the source entity's type as well as the relation type
 * keeps this to actual votes; a debate's backlinks also include its comments and media.
 *
 * Hand-written rather than generated so it doesn't require regenerating `gql.ts`.
 */
const DEBATE_VOTE_BACKLINKS_PAGE_SOURCE = /* GraphQL */ `
  query DebateVoteBacklinksPage(
    $id: UUID!
    $votesDebatePropertyId: UUID!
    $voteTypeId: UUID!
    $first: Int!
    $after: Cursor
  ) {
    entity(id: $id) {
      backlinks(
        first: $first
        after: $after
        filter: { typeId: { is: $votesDebatePropertyId }, fromEntity: { typeIds: { overlaps: [$voteTypeId] } } }
      ) {
        pageInfo {
          hasNextPage
          endCursor
        }
        nodes {
          fromEntity {
            id
          }
        }
      }
    }
  }
`;

export type DebateVoteBacklinksPageQuery = {
  entity: {
    backlinks: {
      pageInfo: { hasNextPage: boolean; endCursor: string | null };
      nodes: Array<{ fromEntity: { id: string } | null } | null>;
    };
  } | null;
};

type DebateVoteBacklinksPageVariables = {
  id: string;
  votesDebatePropertyId: string;
  voteTypeId: string;
  first: number;
  after?: string;
};

export const debateVoteBacklinksPageDocument = parse(DEBATE_VOTE_BACKLINKS_PAGE_SOURCE) as TypedDocumentNode<
  DebateVoteBacklinksPageQuery,
  DebateVoteBacklinksPageVariables
>;
