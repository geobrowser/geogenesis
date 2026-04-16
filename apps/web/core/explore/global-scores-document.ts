import type { TypedDocumentNode } from '@graphql-typed-document-node/core';
import { parse } from 'graphql';

const GLOBAL_SCORES_EXPLORE_SOURCE = /* GraphQL */ `
  query ExploreGlobalScores($first: Int!, $offset: Int!, $filter: GlobalScoreFilter) {
    globalScoresConnection(first: $first, offset: $offset, filter: $filter, orderBy: [SCORE_DESC]) {
      nodes {
        entityId
        score
      }
    }
  }
`;

export const exploreGlobalScoresDocument = parse(
  GLOBAL_SCORES_EXPLORE_SOURCE
) as TypedDocumentNode<any, any>;
