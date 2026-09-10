import type { TypedDocumentNode } from '@graphql-typed-document-node/core';

import { Effect } from 'effect';
import { parse } from 'graphql';

import { CLAIM_TYPE_ID } from '~/core/claims/ontology';
import { ID } from '~/core/id';
import { graphql } from '~/core/io/graphql-client';

/**
 * Duplicate protection for the debates create-claim flow: does a Claim with this exact text already
 * exist in this space?
 *
 * `includesInsensitive` narrows on the server — an exact-equality name filter is not exposed, and a
 * substring match of the whole text is a superset of the exact one — and the normalized comparison
 * below confirms it, so a claim that merely *contains* the typed text is not treated as the same
 * claim. Scoped to the target space client-side off each row's `spaceIds`, because a claim of the
 * same text living only in another space is not this space's duplicate (a claim is created per
 * space here).
 */
const EXISTING_CLAIM_SOURCE = /* GraphQL */ `
  query ExistingDebateClaim($claimTypeId: UUID!, $text: String!) {
    entitiesConnection(first: 100, typeId: $claimTypeId, filter: { name: { includesInsensitive: $text } }) {
      nodes {
        id
        name
        spaceIds
      }
    }
  }
`;

type ExistingClaimQuery = {
  entitiesConnection: {
    nodes: Array<{ id: string; name: string | null; spaceIds: string[] | null } | null> | null;
  } | null;
};

type ExistingClaimVariables = { claimTypeId: string; text: string };

const existingClaimDocument = parse(EXISTING_CLAIM_SOURCE) as TypedDocumentNode<
  ExistingClaimQuery,
  ExistingClaimVariables
>;

/** Trim and case-fold so "  Ban cars  " and "ban cars" are the same claim. */
function normalizeClaimText(text: string): string {
  return text.trim().replace(/\s+/g, ' ').toLowerCase();
}

export function findExistingClaimInSpace(spaceId: string, text: string, signal?: AbortSignal): Promise<string | null> {
  const trimmed = text.trim();
  if (trimmed.length === 0) return Promise.resolve(null);

  return Effect.runPromise(
    graphql({
      query: existingClaimDocument,
      decoder: (data: ExistingClaimQuery) => {
        const nodes = data.entitiesConnection?.nodes ?? [];
        const normalizedTarget = normalizeClaimText(trimmed);
        for (const node of nodes) {
          if (!node?.name) continue;
          if (normalizeClaimText(node.name) !== normalizedTarget) continue;
          if (!(node.spaceIds ?? []).some(id => ID.equals(id, spaceId))) continue;
          return node.id;
        }
        return null;
      },
      variables: { claimTypeId: CLAIM_TYPE_ID, text: trimmed },
      signal,
    })
  );
}
