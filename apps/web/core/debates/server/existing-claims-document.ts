import type { TypedDocumentNode } from '@graphql-typed-document-node/core';

import { parse } from 'graphql';

/**
 * The three facts the reuse policy verifies about a referenced entity: that it exists, which spaces
 * hold its content, and which types it carries. Deliberately not the full entity query — that one
 * pulls every value and relation (0.31 MB per 50 claims, measured) through a strict decoder that
 * drops the whole entity when any unrelated value fails to parse, which the verifier would read as
 * "not a Claim here" and mint a duplicate for.
 */
const EXISTING_CLAIMS_SOURCE = /* GraphQL */ `
  query ExistingClaims($ids: [UUID!]!, $topicsPropertyId: UUID!, $spaceId: UUID!) {
    entities(filter: { id: { in: $ids } }) {
      id
      spaceIds
      types {
        id
      }
      topicRelations: relationsList(
        first: 100
        filter: { typeId: { is: $topicsPropertyId }, spaceId: { is: $spaceId } }
      ) {
        toEntityId
      }
    }
  }
`;

export type ExistingClaimsQuery = {
  entities: Array<{
    id: string;
    spaceIds: Array<string | null> | null;
    types: Array<{ id: string } | null> | null;
    /**
     * The entity's existing Topics relations **in the publication space** — what the topics
     * writer must not duplicate. Space-scoped deliberately: relations are per-space, so a
     * topic the entity carries only in some other space is not a duplicate here and must
     * still be written (verified: an entity in two spaces returns 4 relations unscoped and 2
     * scoped). Paged at 100 like every other topics query in the repo rather than relying on
     * a server default.
     */
    topicRelations: Array<{ toEntityId: string | null } | null> | null;
  } | null> | null;
};

export const existingClaimsDocument = parse(EXISTING_CLAIMS_SOURCE) as TypedDocumentNode<
  ExistingClaimsQuery,
  { ids: string[]; topicsPropertyId: string; spaceId: string }
>;
