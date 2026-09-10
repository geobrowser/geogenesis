import type { DebateClaimInput, DebatePublishTurn } from '../debate-publish-draft';
import { looksLikeEntityId } from './claim-reuse';

/** One turn of geo-chat's `GET /debates/{id}/claims` payload. */
export type DebateExtractedClaimsTurn = {
  turn_index: number;
  participant_slot: number;
  /** The turn speaker's Geo personal-space entity id (the Authors relation target). */
  attributed_space_id: string;
  speaker_name: string | null;
  text: string;
};

/** One extracted claim of that payload. */
export type DebateExtractedClaimsClaim = {
  text: string;
  is_factual: boolean | null;
  turn_index: number;
  /**
   * Find-or-create: the published Claim in the debate's space geo-chat judged logically equivalent
   * to this one, or null/absent when it found none (or matching was off). geo-chat also sends a
   * `match` audit object next to it, which the publisher does not read.
   */
  existing_entity_id?: string | null;
  /**
   * Topics the extractor assigned to this claim, drawn from the debated claim's own topic set
   * (geo-chat's replica naming: entity_id + name). Absent on payloads from before topic
   * assignment shipped, and empty when the debated claim has no topics.
   */
  topics?: { entity_id: string; name: string | null }[] | null;
};

export type DebateExtractedClaimsResponse = {
  turns: DebateExtractedClaimsTurn[];
  claims: DebateExtractedClaimsClaim[];
};

/**
 * geo-chat's payload → the publish input's turns and claims. Pure, so the publish sweep and the live
 * harness (`scripts/live-claim-reuse.ts`) decode the same way. `turn_index` is expected 0-based and
 * contiguous over non-empty turns; a blank or absent `existing_entity_id` is null.
 */
export function decodeExtractedClaims(response: DebateExtractedClaimsResponse): {
  transcriptTurns: DebatePublishTurn[];
  claims: DebateClaimInput[];
} {
  const transcriptTurns: DebatePublishTurn[] = [...response.turns]
    .sort((a, b) => a.turn_index - b.turn_index)
    .map(turn => ({
      turnIndex: turn.turn_index,
      speakerSpaceEntityId: turn.attributed_space_id,
      speakerName: turn.speaker_name,
      text: turn.text,
    }));
  const droppedTopics: unknown[] = [];
  const claims: DebateClaimInput[] = (Array.isArray(response.claims) ? response.claims : []).map(claim => ({
    text: claim.text,
    isFactual: claim.is_factual ?? null,
    turnIndex: claim.turn_index,
    existingClaimEntityId:
      typeof claim.existing_entity_id === 'string' && claim.existing_entity_id.trim().length > 0
        ? claim.existing_entity_id.trim()
        : null,
    topics: decodeTopics(claim.topics, droppedTopics),
  }));
  if (droppedTopics.length > 0) {
    // Loud, like the malformed-claim-id path in `claim-reuse`: a field rename upstream would
    // otherwise publish every debate topic-less with nothing in the logs to say why.
    console.warn('[debate-acceptor] dropping extracted-claim topics that are not entity ids', {
      count: droppedTopics.length,
      sample: droppedTopics.slice(0, 5),
    });
  }
  return { transcriptTurns, claims };
}

/**
 * Topic rows → `{id, name}`, keeping only ids the publish path can actually use.
 *
 * An id that is not a valid entity id is not a cosmetic problem: `Graph.createRelation`
 * asserts every id and throws, so one bad topic would fail `prepareLocalDataForPublishing`
 * and the debate would never publish — on this sweep or any later one. Dropping the topic
 * costs a tag; keeping it costs the whole debate.
 */
function decodeTopics(
  topics: DebateExtractedClaimsClaim['topics'],
  dropped: unknown[]
): { id: string; name: string | null }[] {
  if (!Array.isArray(topics)) return [];
  return topics.flatMap(topic => {
    const id = typeof topic?.entity_id === 'string' ? topic.entity_id.trim() : '';
    if (id.length === 0 || !looksLikeEntityId(id)) {
      if (topic != null) dropped.push(topic);
      return [];
    }
    return [{ id, name: topic.name ?? null }];
  });
}
