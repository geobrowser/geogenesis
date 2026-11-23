import { SystemIds } from '@geoprotocol/geo-sdk/lite';
import type { TypedDocumentNode } from '@graphql-typed-document-node/core';

import { Effect } from 'effect';
import { parse } from 'graphql';

import { HIDDEN_PROPERTIES } from '~/core/constants';
import { graphql } from '~/core/io/graphql-client';
import { normId } from '~/core/utils/norm-id';
import { entityHomeSpaceId, resolveEntitySpaceId } from '~/core/utils/space/entity-home-space';

import type { GraphFilter } from './graph-filter';
import { CLAIM_ABOUT_PROPERTY_IDS, CLAIM_TYPE_ID, TOPICS_PROPERTY_ID } from './ontology';

export const CLAIMS_ABOUT_PAGE_SIZE = 20;

export type ClaimAbout = {
  id: string;
  name: string;
  /** Where the claim is read, linked and voted in (`claimSpaceId`). */
  spaceId: string;
};

export type ClaimsAboutPage = { claims: ClaimAbout[]; endCursor: string | null; hasNextPage: boolean };

/**
 * Claims about the entity, optionally also carrying `filter.claimsTopicId` via `Topics`.
 * Relation spaces are filtered too, since relations are per space. No totalCount: too slow.
 */
function claimsAboutQuery(withTopic: boolean) {
  const about =
    '{ relations: { some: { typeId: { in: $aboutPropertyIds }, toEntityId: { is: $id }, spaceId: { in: $spaceIds } } } }';
  const topic =
    '{ relations: { some: { typeId: { is: $topicsPropertyId }, toEntityId: { is: $topicId }, spaceId: { in: $spaceIds } } } }';
  return parse(/* GraphQL */ `
    query GraphClaimsAbout(
      $id: UUID!
      $aboutPropertyIds: [UUID!]
      $spaceIds: [UUID!]
      $claimTypeId: UUID!
      $namePropertyId: UUID!
      $unplacingPropertyIds: [UUID!]
      ${withTopic ? '$topicsPropertyId: UUID!\n      $topicId: UUID!' : ''}
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
          and: [${about}${withTopic ? `, ${topic}` : ''}]
        }
      ) {
        nodes {
          id
          name
          spaceIds
          names: valuesList(filter: { propertyId: { is: $namePropertyId } }) {
            spaceId
            text
          }
          placed: valuesList(filter: { propertyId: { notIn: $unplacingPropertyIds } }) {
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
}

const claimsAboutDocument = claimsAboutQuery(false);
const claimsAboutTopicDocument = claimsAboutQuery(true);

/** The topic to require of claims about `entityId`, if any. The topic's own claims need no second check. */
export function claimsTopicFor(entityId: string, filter: GraphFilter): string | null {
  const topicId = filter.claimsTopicId;
  return topicId && topicId !== normId(entityId) ? topicId : null;
}

type ClaimsAboutResponse = {
  entitiesConnection: {
    nodes: Array<{
      id: string;
      name: string | null;
      spaceIds: string[] | null;
      names: Array<{ spaceId: string; text: string | null }> | null;
      placed: Array<{ spaceId: string }> | null;
    }>;
    pageInfo: { hasNextPage: boolean; endCursor: string | null };
  } | null;
};

/**
 * Where a claim is read and voted in: TopicClaimCard's rule, so both surfaces use the same space.
 * `resolveEntitySpaceId` reads only names and which spaces hold any other non-hidden value.
 */
export function claimSpaceId(
  claim: { spaceIds: string[]; names: Array<{ spaceId: string; text: string | null }>; placedSpaceIds: string[] },
  requestedSpaceId: string | null
): string | null {
  const entity = {
    spaces: claim.spaceIds,
    values: [
      ...claim.names.map(name => ({ property: { id: NAME_PROPERTY_ID }, spaceId: name.spaceId, value: name.text })),
      ...claim.placedSpaceIds.map(spaceId => ({ property: { id: PLACED_PROPERTY }, spaceId, value: true })),
    ],
  };
  return requestedSpaceId ? resolveEntitySpaceId(entity, requestedSpaceId) : entityHomeSpaceId(entity);
}

/** Stands for any other non-hidden value: all the space rule needs to know is that one exists. */
const PLACED_PROPERTY = 'placed';
const NAME_PROPERTY_ID = normId(SystemIds.NAME_PROPERTY);

export function decodeClaimsAbout(response: ClaimsAboutResponse, requestedSpaceId: string | null): ClaimsAboutPage {
  const connection = response.entitiesConnection;
  const claims = (connection?.nodes ?? []).flatMap(node => {
    const name = node.name?.trim();
    if (!name) return [];
    const spaceId = claimSpaceId(
      {
        spaceIds: (node.spaceIds ?? []).map(normId),
        names: (node.names ?? []).map(value => ({ spaceId: normId(value.spaceId), text: value.text })),
        placedSpaceIds: [...new Set((node.placed ?? []).map(value => normId(value.spaceId)))],
      },
      requestedSpaceId ? normId(requestedSpaceId) : null
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
  const topicId = claimsTopicFor(entityId, filter);
  return {
    id: normId(entityId),
    aboutPropertyIds: CLAIM_ABOUT_PROPERTY_IDS,
    spaceIds: filter.spaceIds ?? null,
    claimTypeId: CLAIM_TYPE_ID,
    namePropertyId: NAME_PROPERTY_ID,
    unplacingPropertyIds: [NAME_PROPERTY_ID, ...[...HIDDEN_PROPERTIES].map(normId)],
    ...(topicId ? { topicsPropertyId: TOPICS_PROPERTY_ID, topicId } : {}),
    first: CLAIMS_ABOUT_PAGE_SIZE,
    after,
  };
}

export function fetchClaimsAbout(
  entityId: string,
  filter: GraphFilter,
  requestedSpaceId: string | null,
  after: string | null,
  signal?: AbortSignal
) {
  return Effect.runPromise(
    graphql({
      query: claimsTopicFor(entityId, filter) ? claimsAboutTopicDocument : claimsAboutDocument,
      decoder: (response: ClaimsAboutResponse) => decodeClaimsAbout(response, requestedSpaceId),
      variables: claimsAboutVariables(entityId, filter, after),
      signal,
    })
  );
}

/** `claimSpaceId` for a graph node, whose `namedSpaceIds` already hold only non-empty names. */
export function nodeClaimSpaceId(
  node: { spaceIds: string[]; namedSpaceIds: string[]; placedSpaceIds: string[] },
  requestedSpaceId: string | null
): string | null {
  return claimSpaceId(
    {
      spaceIds: node.spaceIds,
      names: node.namedSpaceIds.map(spaceId => ({ spaceId, text: 'named' })),
      placedSpaceIds: node.placedSpaceIds,
    },
    requestedSpaceId
  );
}
