'use client';

import type { TypedDocumentNode } from '@graphql-typed-document-node/core';
import { useQuery } from '@tanstack/react-query';

import * as React from 'react';

import { Effect } from 'effect';
import { parse } from 'graphql';

import { CLAIM_TYPE_ID, TOPICS_PROPERTY_ID } from '~/core/claims/ontology';
import { TAG_PROPERTY_ID } from '~/core/constants';
import { DEBATE_CLAIMS_PROPERTY_ID, DEBATE_TAG_ID, DEBATE_TYPE_ID } from '~/core/debates/ontology';
import { buildExploreFeedRows, decodeExploreCardEntity } from '~/core/explore/explore-card-item';
import { exploreCardNodeFields, exploreCardPropertyFragment } from '~/core/explore/explore-card-selection';
import { EntitiesOrderBy } from '~/core/gql/graphql';
import { ID } from '~/core/id';
import { graphql } from '~/core/io/graphql-client';
import { normId } from '~/core/utils/norm-id';

import { useTopicSpaceScope } from '../use-topic-space-scope';

const RECORD_PAGE_SIZE = 20;
const RECORD_STALE_TIME = 60_000;
const CLAIM_FRAGMENT = 'TopicRecordClaimPropertyFragment';
const DEBATE_FRAGMENT = 'TopicRecordDebatePropertyFragment';

const TOPIC_RECORD_SOURCE = /* GraphQL */ `
  ${exploreCardPropertyFragment(CLAIM_FRAGMENT)}
  ${exploreCardPropertyFragment(DEBATE_FRAGMENT)}

  query TopicRecord(
    $topicId: UUID!
    $spaceIds: [UUID!]
    $claimTypeId: UUID!
    $debateTypeId: UUID!
    $topicsPropertyId: UUID!
    $tagPropertyId: UUID!
    $debateTagId: UUID!
    $debateClaimsPropertyId: UUID!
    $orderBy: [EntitiesOrderBy!]!
    $first: Int!
  ) {
    claims: entitiesConnection(
      first: $first
      typeId: $claimTypeId
      orderBy: $orderBy
      filter: {
        typeIds: { overlaps: [$claimTypeId] }
        spaceIds: { overlaps: $spaceIds }
        and: [
          { relations: { some: { typeId: { is: $topicsPropertyId }, toEntityId: { is: $topicId } } } }
          { relations: { some: { typeId: { is: $tagPropertyId }, toEntityId: { is: $debateTagId } } } }
        ]
      }
    ) {
      totalCount
      nodes {
        ${exploreCardNodeFields(CLAIM_FRAGMENT, { scopeListsToSpaces: false })}
      }
    }
    debates: entitiesConnection(
      first: $first
      typeId: $debateTypeId
      orderBy: $orderBy
      filter: {
        typeIds: { overlaps: [$debateTypeId] }
        spaceIds: { overlaps: $spaceIds }
        relations: {
          some: {
            typeId: { is: $debateClaimsPropertyId }
            toEntity: { relations: { some: { typeId: { is: $topicsPropertyId }, toEntityId: { is: $topicId } } } }
          }
        }
      }
    ) {
      totalCount
      nodes {
        ${exploreCardNodeFields(DEBATE_FRAGMENT, { scopeListsToSpaces: false })}
      }
    }
  }
`;

export const topicRecordDocument = parse(TOPIC_RECORD_SOURCE) as TypedDocumentNode<any, any>;

type TopicRecordResponse = {
  claims?: { totalCount?: number | null; nodes?: unknown[] | null } | null;
  debates?: { totalCount?: number | null; nodes?: unknown[] | null } | null;
};

/** Claims carrying this Topic and its two-hop Debate record for Activity and tab visibility. */
export function useTopicRecord({ topicId, spaceId }: { topicId: string; spaceId: string }) {
  const spaceIds = useTopicSpaceScope(spaceId);
  const record = useQuery({
    queryKey: ['topic-record', 'counts', normId(topicId), spaceIds?.map(normId).sort() ?? null],
    queryFn: ({ signal }) =>
      Effect.runPromise(
        graphql({
          query: topicRecordDocument,
          decoder: (response: TopicRecordResponse) => ({
            claimEntities: (response.claims?.nodes ?? []).flatMap(node => {
              const entity = decodeExploreCardEntity(node);
              return entity ? [entity] : [];
            }),
            debateEntities: (response.debates?.nodes ?? []).flatMap(node => {
              const entity = decodeExploreCardEntity(node);
              return entity ? [entity] : [];
            }),
            claimsTotal: response.claims?.totalCount ?? 0,
            debatesTotal: response.debates?.totalCount ?? 0,
          }),
          variables: {
            topicId: ID.uuidToHex(topicId),
            spaceIds: spaceIds?.map(ID.uuidToHex),
            claimTypeId: ID.uuidToHex(CLAIM_TYPE_ID),
            debateTypeId: ID.uuidToHex(DEBATE_TYPE_ID),
            topicsPropertyId: ID.uuidToHex(TOPICS_PROPERTY_ID),
            tagPropertyId: ID.uuidToHex(TAG_PROPERTY_ID),
            debateTagId: ID.uuidToHex(DEBATE_TAG_ID),
            debateClaimsPropertyId: ID.uuidToHex(DEBATE_CLAIMS_PROPERTY_ID),
            orderBy: [EntitiesOrderBy.RankingScoreDesc, EntitiesOrderBy.UpdatedAtDesc, EntitiesOrderBy.IdAsc],
            first: RECORD_PAGE_SIZE,
          },
          signal,
        })
      ),
    staleTime: RECORD_STALE_TIME,
  });

  const allowedSpaceIds = React.useMemo(() => new Set((spaceIds ?? [spaceId]).map(normId)), [spaceId, spaceIds]);
  const claimRows = React.useMemo(
    () => buildExploreFeedRows(record.data?.claimEntities ?? [], allowedSpaceIds, new Set()),
    [allowedSpaceIds, record.data?.claimEntities]
  );
  const debateRows = React.useMemo(
    () => buildExploreFeedRows(record.data?.debateEntities ?? [], allowedSpaceIds, new Set()),
    [allowedSpaceIds, record.data?.debateEntities]
  );

  return {
    claimRows,
    debateRows,
    claimsTotal: record.data?.claimsTotal ?? claimRows.length,
    debatesTotal: record.data?.debatesTotal ?? debateRows.length,
    claimsLoading: record.isLoading,
    debatesLoading: record.isLoading,
    claimsError: record.isError,
    debatesError: record.isError,
    claimsCountUnavailable: record.isError,
    debatesCountUnavailable: record.isError,
  };
}
