'use client';

import type { TypedDocumentNode } from '@graphql-typed-document-node/core';
import { useQuery } from '@tanstack/react-query';

import * as React from 'react';

import { Effect } from 'effect';
import { parse } from 'graphql';

import { TOPICS_PROPERTY_ID } from '~/core/claims/ontology';
import { ID } from '~/core/id';
import { graphql } from '~/core/io/graphql-client';
import { type CursorPage, collectCursorPages } from '~/core/sync/collect-cursor-pages';

const PAGE_SIZE = 1_000;

const TOPIC_TAGGED_IN_SPACE_QUERY = parse(/* GraphQL */ `
  query TopicTaggedInSpace(
    $topicsPropertyId: UUID!
    $topicId: UUID!
    $spaceId: UUID!
    $fromEntityIds: [UUID!]!
    $first: Int!
    $after: Cursor
  ) {
    relationsConnection(
      first: $first
      after: $after
      filter: {
        typeId: { is: $topicsPropertyId }
        toEntityId: { is: $topicId }
        spaceId: { is: $spaceId }
        fromEntityId: { in: $fromEntityIds }
      }
    ) {
      pageInfo {
        hasNextPage
        endCursor
      }
      nodes {
        fromEntityId
      }
    }
  }
`) as TypedDocumentNode<
  {
    relationsConnection?: {
      pageInfo?: { hasNextPage?: boolean | null; endCursor?: string | null } | null;
      nodes?: Array<{ fromEntityId: string } | null> | null;
    } | null;
  },
  {
    topicsPropertyId: string;
    topicId: string;
    spaceId: string;
    fromEntityIds: string[];
    first: number;
    after?: string;
  }
>;

type FetchPage = (args: {
  fromEntityIds: string[];
  after: string | undefined;
  signal?: AbortSignal;
}) => Promise<CursorPage<string>>;

/** Which of `entityIds` carry a Topics relation to `topicId` published in `spaceId`, as hex ids. */
export async function fetchTopicTaggedInSpace({
  topicId,
  spaceId,
  entityIds,
  signal,
  fetchPage,
}: {
  topicId: string;
  spaceId: string;
  entityIds: string[];
  signal?: AbortSignal;
  fetchPage?: FetchPage;
}): Promise<Set<string>> {
  const fromEntityIds = [...new Set(entityIds.map(id => ID.uuidToHex(id)))];
  if (fromEntityIds.length === 0) return new Set();
  const page: FetchPage =
    fetchPage ??
    (args =>
      Effect.runPromise(
        graphql({
          query: TOPIC_TAGGED_IN_SPACE_QUERY,
          variables: {
            topicsPropertyId: ID.uuidToHex(TOPICS_PROPERTY_ID),
            topicId: ID.uuidToHex(topicId),
            spaceId: ID.uuidToHex(spaceId),
            fromEntityIds: args.fromEntityIds,
            first: PAGE_SIZE,
            after: args.after,
          },
          decoder: (data): CursorPage<string> => ({
            items: (data.relationsConnection?.nodes ?? []).flatMap(node => (node ? [node.fromEntityId] : [])),
            endCursor: data.relationsConnection?.pageInfo?.endCursor ?? null,
            hasNextPage: data.relationsConnection?.pageInfo?.hasNextPage ?? false,
          }),
          signal: args.signal,
        })
      ));
  const ids = await collectCursorPages(after => page({ fromEntityIds, after, signal }));
  return new Set(ids.map(id => ID.uuidToHex(id)));
}

/**
 * The feed entities whose Topics relation the space itself published, matching the header counts.
 * Null while loading or after a failure.
 */
export function useTopicTaggedInSpace({
  topicId,
  spaceId,
  entityIds,
  enabled = true,
}: {
  topicId: string;
  spaceId: string;
  entityIds: string[];
  /** False holds the check, and reports it loading, until the feed has settled. */
  enabled?: boolean;
}): { tagged: Set<string> | null; isLoading: boolean } {
  const ids = React.useMemo(() => [...new Set(entityIds.map(id => ID.uuidToHex(id)))].sort(), [entityIds]);
  const query = useQuery({
    queryKey: ['topic', 'tagged-in-space', ID.uuidToHex(topicId), ID.uuidToHex(spaceId), ids],
    queryFn: ({ signal }) => fetchTopicTaggedInSpace({ topicId, spaceId, entityIds: ids, signal }),
    enabled: enabled && ids.length > 0,
    staleTime: 60_000,
  });
  return { tagged: query.data ?? null, isLoading: !enabled || (ids.length > 0 && query.isLoading) };
}
