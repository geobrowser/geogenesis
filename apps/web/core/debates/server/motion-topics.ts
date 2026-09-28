import type { TypedDocumentNode } from '@graphql-typed-document-node/core';

import { Effect } from 'effect';
import { parse } from 'graphql';

import { TOPICS_PROPERTY_ID } from '~/core/claims/ontology';
import { graphql } from '~/core/io/graphql-client';
import { RELATIONS_PAGE_SIZE } from '~/core/io/queries';
import { type CursorPage, collectCursorPages } from '~/core/sync/collect-cursor-pages';

import type { DebatePublishTopic } from '../debate-publish-draft';
import { looksLikeEntityId } from './claim-reuse';

/**
 * The debated claim's Topics relations **in the debate's space**. Space-scoped deliberately:
 * relations are per-space, and a topic the claim carries only in some other space says nothing
 * about how this space files it.
 *
 * A cursor connection rather than `relationsList(first: …)`: the Debate's topics are written once
 * and never revisited, so a capped read would publish a permanently incomplete set.
 */
const MOTION_TOPICS_SOURCE = /* GraphQL */ `
  query MotionTopics($claimEntityId: UUID!, $topicsPropertyId: UUID!, $spaceId: UUID!, $first: Int!, $after: Cursor) {
    relationsConnection(
      first: $first
      after: $after
      filter: { fromEntityId: { is: $claimEntityId }, typeId: { is: $topicsPropertyId }, spaceId: { is: $spaceId } }
    ) {
      nodes {
        toEntityId
      }
      pageInfo {
        hasNextPage
        endCursor
      }
    }
  }
`;

type MotionTopicsQuery = {
  relationsConnection: {
    nodes: Array<{ toEntityId: string | null } | null>;
    pageInfo: { hasNextPage: boolean; endCursor: string | null };
  } | null;
};

const motionTopicsDocument = parse(MOTION_TOPICS_SOURCE) as TypedDocumentNode<
  MotionTopicsQuery,
  { claimEntityId: string; topicsPropertyId: string; spaceId: string; first: number; after: string | null }
>;

/** One page of topic ids. Injectable for tests. */
export type MotionTopicsPageFetcher = (
  claimEntityId: string,
  spaceId: string,
  after: string | undefined
) => Promise<CursorPage<string>>;

const fetchPageFromGraph: MotionTopicsPageFetcher = (claimEntityId, spaceId, after) =>
  Effect.runPromise(
    graphql({
      query: motionTopicsDocument,
      decoder: data => ({
        items: (data.relationsConnection?.nodes ?? []).flatMap(node => (node?.toEntityId ? [node.toEntityId] : [])),
        endCursor: data.relationsConnection?.pageInfo.endCursor ?? null,
        hasNextPage: data.relationsConnection?.pageInfo.hasNextPage ?? false,
      }),
      variables: {
        claimEntityId,
        topicsPropertyId: TOPICS_PROPERTY_ID,
        spaceId,
        first: RELATIONS_PAGE_SIZE,
        after: after ?? null,
      },
    })
  );

/**
 * The topics the Debate entity mirrors: the debated claim's own, in the debate's space.
 *
 * Never throws: a failed read — including a broken cursor chain, which `collectCursorPages`
 * refuses rather than returning a truncated list — publishes the Debate without topics. Topics are
 * secondary to the debate itself, but the loss is permanent (the sweep skips a Debate that already
 * exists), so the failure is logged.
 */
export async function loadMotionTopics(
  claimEntityId: string,
  spaceId: string,
  fetchPage: MotionTopicsPageFetcher = fetchPageFromGraph
): Promise<DebatePublishTopic[]> {
  let topicIds: string[];
  try {
    topicIds = await collectCursorPages(after => fetchPage(claimEntityId, spaceId, after));
  } catch (error) {
    console.warn('[debate-acceptor] could not read the motion claim topics; publishing the debate without them', {
      claimEntityId,
      spaceId,
      error,
    });
    return [];
  }
  // `Graph.createRelation` throws on an id it cannot parse, which would fail the whole edit on
  // every sweep. Same rule as the extracted claims' topics: drop the topic, keep the debate.
  const writable = topicIds.filter(looksLikeEntityId);
  if (writable.length !== topicIds.length) {
    console.warn('[debate-acceptor] dropping motion topics that are not entity ids', {
      claimEntityId,
      dropped: topicIds.filter(id => !looksLikeEntityId(id)),
    });
  }
  return writable.map(id => ({ id, name: null }));
}
