import type { Debate, DebateMediaTurnSegment, DebateTranscriptSegment } from './api';
import { resolveClaimTimings } from './claim-timing';
import { debateTurnRole } from './formats';
import type { DebateTranscriptClaims } from './transcript-claims';

export const warehouseId = (id: string) => id.replaceAll('-', '').toLowerCase();

export type WarehouseTurn = {
  debate_id: string;
  turn_index: number;
  start_ms: number;
  end_ms: number;
  round: string;
  speaker_space_id: string;
};

export type WarehouseClaim = {
  debate_id: string;
  publication_space_id: string;
  claim_id: string;
  block_id: string;
  relation_entity_id: string;
  start_ms: number | null;
  end_ms: number | null;
  timing_source: 'exact' | 'matched' | 'turn_only' | 'unknown';
  confidence: number;
  turn_index: number | null;
  round: string;
  speaker_space_id: string;
};

/** Use the rendered timeline, including grace windows and early yields, never planned durations. */
export function warehouseTurns(
  debate: Pick<Debate, 'id' | 'participants' | 'turn_durations_ms'>,
  segments: DebateMediaTurnSegment[]
): WarehouseTurn[] {
  const ordered = [...segments].sort((a, b) => a.output_start_ms - b.output_start_ms);
  const seen = new Set<number>();
  return ordered.map((segment, index) => {
    const { turn_index: turn, output_start_ms: start, output_end_ms: end } = segment;
    if (
      !Number.isSafeInteger(turn) ||
      turn < 0 ||
      turn >= debate.turn_durations_ms.length ||
      seen.has(turn) ||
      !Number.isSafeInteger(start) ||
      !Number.isSafeInteger(end) ||
      start < 0 ||
      end <= start ||
      (index > 0 && start < ordered[index - 1].output_end_ms)
    )
      throw new Error(`Invalid rendered turns for ${debate.id}`);
    seen.add(turn);
    const speakers = debate.participants.filter(p => p.participant_slot === segment.participant_slot);
    if (speakers.length !== 1) throw new Error(`Ambiguous speaker for ${debate.id} turn ${turn}`);
    return {
      debate_id: warehouseId(debate.id),
      turn_index: turn,
      start_ms: start,
      end_ms: end,
      round: debateTurnRole(turn, debate.turn_durations_ms.length),
      speaker_space_id: warehouseId(speakers[0].profile_space_id),
    };
  });
}

/** Call per transcript block so reused claim IDs retain every statement, rather than the UI's deduped row. */
export function warehouseClaims(
  debateId: string,
  spaceId: string,
  claims: DebateTranscriptClaims,
  segments: DebateTranscriptSegment[],
  turns: WarehouseTurn[]
): WarehouseClaim[] {
  const timings = resolveClaimTimings({ claims: claims.all, blocks: claims.blocks, segments });
  return claims.all.map(claim => {
    const timing = timings.get(claim.id);
    const valid =
      timing &&
      Number.isSafeInteger(timing.startMs) &&
      Number.isSafeInteger(timing.endMs) &&
      timing.startMs >= 0 &&
      timing.endMs > timing.startMs
        ? timing
        : null;
    const turn = valid ? turns.find(t => valid.startMs >= t.start_ms && valid.startMs < t.end_ms) : undefined;
    const author = claims.blocks.find(b => b.id === claim.blockId)?.authorSpaceId;
    // Contradictory provenance must not silently attribute a statement to the other speaker.
    const attributed = turn && (!author || warehouseId(author) === turn.speaker_space_id) ? turn : undefined;
    return {
      debate_id: warehouseId(debateId),
      publication_space_id: warehouseId(spaceId),
      claim_id: warehouseId(claim.id),
      block_id: warehouseId(claim.blockId),
      relation_entity_id: warehouseId(claim.relationEntityId ?? ''),
      start_ms: valid?.startMs ?? null,
      end_ms: valid?.endMs ?? null,
      timing_source: valid
        ? ({ published: 'exact', segment: 'matched', block: 'turn_only' } as const)[valid.source]
        : 'unknown',
      confidence: valid?.confidence ?? 0,
      turn_index: attributed?.turn_index ?? null,
      round: attributed?.round ?? 'unknown',
      speaker_space_id: attributed?.speaker_space_id ?? '',
    };
  });
}
