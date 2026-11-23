import { SystemIds } from '@geoprotocol/geo-sdk/lite';
import type { TypedDocumentNode } from '@graphql-typed-document-node/core';

import { Effect } from 'effect';
import { parse } from 'graphql';

import { graphql } from '~/core/io/graphql-client';
import { normId } from '~/core/utils/norm-id';

import type { GraphFilter } from './graph-filter';
import { CLAIM_ABOUT_PROPERTY_IDS, CLAIM_TYPE_ID } from './ontology';
import { pickEntitySpaceId } from './spokes';

export const CLAIMS_ABOUT_PAGE_SIZE = 20;

export type ClaimAbout = {
  id: string;
  name: string;
  /** The claim's own space: where it is read, linked and voted in. Never the topic's space. */
  spaceId: string;
};

export type ClaimsAboutPage = { claims: ClaimAbout[]; endCursor: string | null; hasNextPage: boolean };

/**
 * Claims with an about-relation (CLAIM_ABOUT_PROPERTY_IDS) to the entity. Relations are per space,
 * so the relation's space is filtered too. No totalCount: it is too slow on large topics.
 */
const claimsAboutDocument = parse(/* GraphQL */ `
  query GraphClaimsAbout(
    $id: UUID!
    $aboutPropertyIds: [UUID!]
    $spaceIds: [UUID!]
    $claimTypeId: UUID!
    $namePropertyId: UUID!
    $first: Int
    $after: Cursor
  ) {
    entitiesConnection(
      first: $first
      after: $after
      orderBy: [UPDATED_AT_DESC]
      filter: {
        typeIds: { anyEqualTo: $claimTypeId }
        spaceIds: { overlaps: $spaceIds }
        relations: { some: { typeId: { in: $aboutPropertyIds }, toEntityId: { is: $id }, spaceId: { in: $spaceIds } } }
      }
    ) {
      nodes {
        id
        name
        spaceIds
        valuesList(filter: { propertyId: { is: $namePropertyId } }) {
          spaceId
        }
      }
      pageInfo {
        hasNextPage
        endCursor
      }
    }
  }
`) as TypedDocumentNode<ClaimsAboutResponse, Record<string, unknown>>;

type ClaimsAboutResponse = {
  entitiesConnection: {
    nodes: Array<{
      id: string;
      name: string | null;
      spaceIds: string[] | null;
      valuesList: Array<{ spaceId: string }> | null;
    }>;
    pageInfo: { hasNextPage: boolean; endCursor: string | null };
  } | null;
};

/**
 * A claim's home space: where its name is written, preferring the filter's spaces. That is the
 * space its responses live in (all measured testnet votes were in such a space).
 */
export function claimHomeSpaceId(
  claim: { spaceIds: readonly string[]; nameSpaceIds: readonly string[] },
  allowedSpaceIds: readonly string[] | undefined
): string | null {
  const named = claim.nameSpaceIds.length > 0 ? claim.nameSpaceIds : claim.spaceIds;
  return pickEntitySpaceId(named, allowedSpaceIds, null);
}

export function decodeClaimsAbout(response: ClaimsAboutResponse, filter: GraphFilter): ClaimsAboutPage {
  const connection = response.entitiesConnection;
  const claims = (connection?.nodes ?? []).flatMap(node => {
    const name = node.name?.trim();
    if (!name) return [];
    const spaceId = claimHomeSpaceId(
      {
        spaceIds: (node.spaceIds ?? []).map(normId),
        nameSpaceIds: [...new Set((node.valuesList ?? []).map(value => normId(value.spaceId)))],
      },
      filter.spaceIds
    );
    return spaceId ? [{ id: normId(node.id), name, spaceId }] : [];
  });
  return {
    claims,
    endCursor: connection?.pageInfo.endCursor ?? null,
    hasNextPage: connection?.pageInfo.hasNextPage ?? false,
  };
}

export function claimsAboutVariables(entityId: string, filter: GraphFilter, after: string | null) {
  return {
    id: normId(entityId),
    aboutPropertyIds: CLAIM_ABOUT_PROPERTY_IDS,
    spaceIds: filter.spaceIds ?? null,
    claimTypeId: CLAIM_TYPE_ID,
    namePropertyId: normId(SystemIds.NAME_PROPERTY),
    first: CLAIMS_ABOUT_PAGE_SIZE,
    after,
  };
}

export function fetchClaimsAbout(entityId: string, filter: GraphFilter, after: string | null, signal?: AbortSignal) {
  return Effect.runPromise(
    graphql({
      query: claimsAboutDocument,
      decoder: (response: ClaimsAboutResponse) => decodeClaimsAbout(response, filter),
      variables: claimsAboutVariables(entityId, filter, after),
      signal,
    })
  );
}
