import { TOPICS_PROPERTY_ID } from '~/core/claims/ontology';

import type { DebatePublishTopic } from '../debate-publish-draft';
import { looksLikeEntityId } from './claim-reuse';
import { type RelationTargetsPageFetcher, collectRelationTargets } from './relation-targets';

/**
 * The topics the Debate entity mirrors: the debated claim's own, in the debate's space. Space-scoped
 * deliberately: relations are per-space, and a topic the claim carries only in some other space says
 * nothing about how this space files it.
 *
 * Never throws: a failed read — including a broken cursor chain, which `collectRelationTargets`
 * refuses rather than returning a truncated list — publishes the Debate without topics. Topics are
 * secondary to the debate itself, but the loss is permanent (the sweep skips a Debate that already
 * exists), so the failure is logged.
 */
export async function loadMotionTopics(
  claimEntityId: string,
  spaceId: string,
  fetchPage?: RelationTargetsPageFetcher
): Promise<DebatePublishTopic[]> {
  let topicIds: string[];
  try {
    const relations = await collectRelationTargets(
      { fromEntityIds: [claimEntityId], typeIds: [TOPICS_PROPERTY_ID], spaceId },
      fetchPage
    );
    topicIds = relations.map(relation => relation.toEntityId);
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
