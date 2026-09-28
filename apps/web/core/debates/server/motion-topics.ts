import type { DebatePublishTopic } from '../debate-publish-draft';
import {
  type ExistingClaimEntity,
  type ExistingClaimLookup,
  looksLikeEntityId,
  lookupExistingClaims,
} from './claim-reuse';

/**
 * The debated claim's Topics **in the debate's space**, for the Debate entity to mirror. Read
 * through the reuse policy's lookup, which already scopes Topics to the publication space: a topic
 * the claim carries only in some other space says nothing about how this space files it.
 *
 * Never throws: a failed read publishes the Debate without topics. Topics are secondary to the
 * debate itself, but the loss is permanent — the sweep skips a Debate that already exists — so the
 * failure is logged.
 */
export async function loadMotionTopics(
  claimEntityId: string,
  spaceId: string,
  lookup: ExistingClaimLookup = lookupExistingClaims
): Promise<DebatePublishTopic[]> {
  let motion: ExistingClaimEntity | undefined;
  try {
    [motion] = await lookup([claimEntityId], spaceId);
  } catch (error) {
    console.warn('[debate-acceptor] could not read the motion claim topics; publishing the debate without them', {
      claimEntityId,
      spaceId,
      error,
    });
    return [];
  }
  const topicIds = motion?.topicIds ?? [];
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
