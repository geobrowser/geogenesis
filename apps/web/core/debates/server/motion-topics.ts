import type { TypedDocumentNode } from '@graphql-typed-document-node/core';

import { Effect } from 'effect';
import { parse } from 'graphql';

import { TOPICS_PROPERTY_ID } from '~/core/claims/ontology';
import { uuidToHex } from '~/core/id/normalize';
import { graphql } from '~/core/io/graphql-client';

import { looksLikeEntityId } from './claim-reuse';

/**
 * The debated claim's Topics relations **in the debate's space**, so the Debate entity can mirror
 * them. Space-scoped deliberately: relations are per-space, and a topic the claim carries only in
 * some other space says nothing about how this space files it.
 */
const MOTION_TOPICS_SOURCE = /* GraphQL */ `
  query MotionTopics($id: UUID!, $topicsPropertyId: UUID!, $spaceId: UUID!) {
    entity(id: $id) {
      topicRelations: relationsList(
        first: 100
        filter: { typeId: { is: $topicsPropertyId }, spaceId: { is: $spaceId } }
      ) {
        toEntityId
        toEntity {
          name
        }
      }
    }
  }
`;

type MotionTopicsQuery = {
  entity: {
    topicRelations: Array<{ toEntityId: string | null; toEntity: { name: string | null } | null } | null> | null;
  } | null;
};

const motionTopicsDocument = parse(MOTION_TOPICS_SOURCE) as TypedDocumentNode<
  MotionTopicsQuery,
  { id: string; topicsPropertyId: string; spaceId: string }
>;

export type MotionTopic = { id: string; name: string | null };

export type MotionTopicsLookup = (claimEntityId: string, spaceId: string) => Promise<MotionTopic[]>;

const lookupInGraph: MotionTopicsLookup = (claimEntityId, spaceId) =>
  Effect.runPromise(
    graphql({
      query: motionTopicsDocument,
      decoder: data =>
        (data.entity?.topicRelations ?? []).flatMap(relation =>
          relation?.toEntityId ? [{ id: relation.toEntityId, name: relation.toEntity?.name ?? null }] : []
        ),
      variables: { id: claimEntityId, topicsPropertyId: TOPICS_PROPERTY_ID, spaceId },
    })
  );

/**
 * The topics the Debate entity should carry: the debated claim's own, one per topic entity.
 *
 * Throws when the graph read fails, rather than publishing without topics. A publish happens once
 * — the sweep skips a Debate that already exists — so a topic-less debate would stay topic-less,
 * while a thrown read only delays the publish to the next sweep.
 */
export async function loadMotionTopics(
  claimEntityId: string,
  spaceId: string,
  lookup: MotionTopicsLookup = lookupInGraph
): Promise<MotionTopic[]> {
  const topics = await lookup(claimEntityId, spaceId);
  const seen = new Set<string>();
  return topics.filter(topic => {
    // `Graph.createRelation` throws on an id it cannot parse, which would fail the whole edit on
    // every sweep. A topic that cannot be written is skipped instead.
    if (!looksLikeEntityId(topic.id)) return false;
    const key = uuidToHex(topic.id);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
