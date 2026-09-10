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
  query ExistingClaims($ids: [UUID!]!) {
    entities(filter: { id: { in: $ids } }) {
      id
      spaceIds
      types {
        id
      }
    }
  }
`;

export type ExistingClaimsQuery = {
  entities: Array<{
    id: string;
    spaceIds: Array<string | null> | null;
    types: Array<{ id: string } | null> | null;
  } | null> | null;
};

export const existingClaimsDocument = parse(EXISTING_CLAIMS_SOURCE) as TypedDocumentNode<
  ExistingClaimsQuery,
  { ids: string[] }
>;
