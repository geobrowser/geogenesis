import type { DebateClaimInput, DebatePublishTurn } from '../debate-publish-draft';

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
  const claims: DebateClaimInput[] = (response.claims ?? []).map(claim => ({
    text: claim.text,
    isFactual: claim.is_factual ?? null,
    turnIndex: claim.turn_index,
    existingClaimEntityId:
      typeof claim.existing_entity_id === 'string' && claim.existing_entity_id.trim().length > 0
        ? claim.existing_entity_id.trim()
        : null,
  }));
  return { transcriptTurns, claims };
}
