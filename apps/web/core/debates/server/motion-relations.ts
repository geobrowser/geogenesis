import { TOPICS_PROPERTY_ID } from '~/core/claims/ontology';
import { TAG_PROPERTY_ID } from '~/core/constants';
import { DEBATE_TAG_ID } from '~/core/debates/ontology';
import { uuidToHex } from '~/core/id/normalize';

import type { DebatePublishTopic } from '../debate-publish-draft';
import { looksLikeEntityId } from './claim-reuse';
import { type RelationTargetsPageFetcher, collectRelationTargets } from './relation-targets';

export type MotionRelations = {
  /** The claim's Topics in this space, which the Debate entity mirrors. */
  topics: DebatePublishTopic[];
  /**
   * Whether the claim already carries the Debate tag in this space; null when the read failed and
   * nobody knows. Only `false` lets the publish add the tag, so an unknown never writes a second one.
   */
  debateTagged: boolean | null;
};

/**
 * What the publish needs from the debated claim's own relations, read in one paged pass: its Topics
 * (mirrored onto the Debate) and whether it already carries the Debate tag (GEO-3616: a claim that
 * gets debated joins the tagged list, so an extracted claim picked as a motion is tagged then).
 *
 * Space-scoped deliberately: relations are per-space, so a topic or tag the claim carries only in
 * some other space says nothing about how this space files it.
 *
 * Never throws: a failed read — including a broken cursor chain, which `collectRelationTargets`
 * refuses rather than returning a truncated list — publishes the Debate without topics and without
 * touching the tag. Both are secondary to the debate itself, but the topic loss is permanent (the
 * sweep skips a Debate that already exists), so the failure is logged.
 */
export async function loadMotionRelations(
  claimEntityId: string,
  spaceId: string,
  fetchPage?: RelationTargetsPageFetcher
): Promise<MotionRelations> {
  let relations: Awaited<ReturnType<typeof collectRelationTargets>>;
  try {
    relations = await collectRelationTargets(
      { fromEntityIds: [claimEntityId], typeIds: [TOPICS_PROPERTY_ID, TAG_PROPERTY_ID], spaceId },
      fetchPage
    );
  } catch (error) {
    console.warn('[debate-acceptor] could not read the motion claim relations; publishing the debate without them', {
      claimEntityId,
      spaceId,
      error,
    });
    return { topics: [], debateTagged: null };
  }
  const ofType = (typeId: string) =>
    relations.filter(relation => uuidToHex(relation.typeId) === uuidToHex(typeId)).map(r => r.toEntityId);

  const topicIds = ofType(TOPICS_PROPERTY_ID);
  // `Graph.createRelation` throws on an id it cannot parse, which would fail the whole edit on
  // every sweep. Same rule as the extracted claims' topics: drop the topic, keep the debate.
  const writable = topicIds.filter(looksLikeEntityId);
  if (writable.length !== topicIds.length) {
    console.warn('[debate-acceptor] dropping motion topics that are not entity ids', {
      claimEntityId,
      dropped: topicIds.filter(id => !looksLikeEntityId(id)),
    });
  }
  return {
    topics: writable.map(id => ({ id, name: null })),
    debateTagged: ofType(TAG_PROPERTY_ID).some(tag => uuidToHex(tag) === uuidToHex(DEBATE_TAG_ID)),
  };
}
