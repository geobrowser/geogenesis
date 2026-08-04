import type { TypedDocumentNode } from '@graphql-typed-document-node/core';

import { parse } from 'graphql';

/**
 * One page of the Debate entities that argue a given claim, found through the claim's
 * incoming "Claims" relations.
 */
const CLAIM_DEBATE_BACKLINKS_PAGE_SOURCE = /* GraphQL */ `
  query ClaimDebateBacklinksPage(
    $id: UUID!
    $debateClaimsPropertyId: UUID!
    $debateTypeId: UUID!
    $first: Int!
    $offset: Int!
  ) {
    entity(id: $id) {
      backlinksList(
        first: $first
        offset: $offset
        filter: { typeId: { is: $debateClaimsPropertyId }, fromEntity: { typeIds: { overlaps: [$debateTypeId] } } }
      ) {
        fromEntity {
          id
        }
      }
    }
  }
`;

export type ClaimDebateBacklinksPageQuery = {
  entity: {
    backlinksList: Array<{ fromEntity: { id: string } | null } | null> | null;
  } | null;
};

type ClaimDebateBacklinksPageVariables = {
  id: string;
  debateClaimsPropertyId: string;
  debateTypeId: string;
  first: number;
  offset: number;
};

export const claimDebateBacklinksPageDocument = parse(CLAIM_DEBATE_BACKLINKS_PAGE_SOURCE) as TypedDocumentNode<
  ClaimDebateBacklinksPageQuery,
  ClaimDebateBacklinksPageVariables
>;
