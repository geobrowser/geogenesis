import { uuidToHex } from '~/core/id/normalize';

import {
  type ClaimStance,
  type DebateClaimInput,
  type DebatePublishTurn,
  publishableScore,
  publishableTiming,
} from '../debate-publish-draft';
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
   * GEO-2870 D1: the stable entity id geo-chat minted for this claim when it committed the
   * payload (32 hex), so the claim can be requested by id long before this sweep publishes it.
   * Present only on unmatched claims — a matched claim's `existing_entity_id` wins and this is
   * null. Absent on payloads from before geo-chat minted ids, which then mint a fresh id here.
   */
  entity_id?: string | null;
  /**
   * Topics the extractor assigned to this claim, drawn from the debated claim's own topic set
   * (geo-chat's replica naming: entity_id + name). Absent on payloads from before topic
   * assignment shipped, and empty when the debated claim has no topics.
   */
  topics?: { entity_id: string; name: string | null }[] | null;
  /**
   * True when the claim's main assertion is broad enough to hold positions for and
   * against it. Only these are tagged as debate claims on Geo, because the tag is what
   * the claim picker lists as candidate motions. Absent on payloads from before the
   * classification shipped, which read as "not a motion".
   */
  is_contestable?: boolean | null;
  /**
   * When the claim was said, in integer milliseconds on the transcript's clock (the one
   * `GET /debates/{id}/transcript` serves): the span of the transcript documents it was extracted
   * from (GEO-2958). Null when geo-chat could not measure it — a claim drawn from both speakers,
   * say — and absent on payloads from before it was recorded.
   */
  start_ms?: number | null;
  end_ms?: number | null;
  /**
   * How much the claim carries the debate, 0–1: extraction-api's `claims.score_highlights`
   * answer, carried by geo-chat when `EXTRACTION_HIGHLIGHT_SCORING` is on. Null when the claim
   * was not scored, and absent on payloads from before scoring shipped.
   */
  highlight_score?: number | null;
  /**
   * The three axis scores the same `claims.score_highlights` run returns, each 0–1 (a position on
   * a four-level scale): how directly the claim bears on the debated claim, whether it stands as a
   * faithful, single, self-contained statement, and how likely an audience is to split on it. Null
   * when the claim was not scored or the task did not report that axis; absent on payloads from
   * before the axes shipped.
   */
  relevance_score?: number | null;
  quality_score?: number | null;
  controversy_score?: number | null;
  /**
   * GEO-3142: the claim's stance toward the debated claim — `supports`, `opposes` or `addresses`
   * — judged by the extractor on what the claim says, not on the speaker's side. Null when the
   * extractor gave none; absent on payloads from before the classification shipped.
   */
  stance?: string | null;
};

export type DebateExtractedClaimsResponse = {
  turns: DebateExtractedClaimsTurn[];
  claims: DebateExtractedClaimsClaim[];
  /**
   * `provider/model` of the run that scored the claims, or null when none did (scoring off, or
   * failed). Read only to tell those two apart in the log below; absent on older payloads.
   */
  highlight_model?: string | null;
  /**
   * GEO-2870: present while geo-chat's paraphrase dedup is still running over these claims, as the
   * RFC 3339 instant by which it will have settled. Until then a claim listed here may yet be merged
   * into another and leave the list, so nothing may be published early from it. geo-chat removes it
   * when the pass ends; absent when no pass runs (`EXTRACTION_PER_TURN` off) and on older payloads.
   */
  dedup_pending_until?: string | null;
};

/**
 * geo-chat's payload → the publish input's turns and claims. Pure, so the publish sweep and the live
 * harness (`scripts/live-claim-reuse.ts`) decode the same way. `turn_index` is expected 0-based and
 * contiguous over non-empty turns; a blank or absent `existing_entity_id` is null.
 */
export function decodeExtractedClaims(response: DebateExtractedClaimsResponse): {
  transcriptTurns: DebatePublishTurn[];
  claims: DebateClaimInput[];
  /** See {@link decodeDedupPendingUntil}. */
  dedupPendingUntil: number | null;
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
  const droppedStableIds: unknown[] = [];
  const droppedScores: unknown[] = [];
  const claims: DebateClaimInput[] = (Array.isArray(response.claims) ? response.claims : []).map(claim => ({
    text: claim.text,
    isFactual: claim.is_factual ?? null,
    turnIndex: claim.turn_index,
    existingClaimEntityId:
      typeof claim.existing_entity_id === 'string' && claim.existing_entity_id.trim().length > 0
        ? claim.existing_entity_id.trim()
        : null,
    stableEntityId: decodeStableEntityId(claim.entity_id, droppedStableIds),
    topics: decodeTopics(claim.topics, droppedTopics),
    isContestable: claim.is_contestable === true,
    timing: decodeTiming(claim.start_ms, claim.end_ms),
    highlightScore: decodeScore(claim.highlight_score, droppedScores),
    relevanceScore: decodeScore(claim.relevance_score, droppedScores),
    qualityScore: decodeScore(claim.quality_score, droppedScores),
    controversyScore: decodeScore(claim.controversy_score, droppedScores),
    stance: decodeStance(claim.stance),
  }));
  if (droppedTopics.length > 0) {
    // Loud, like the malformed-claim-id path in `claim-reuse`: a field rename upstream would
    // otherwise publish every debate topic-less with nothing in the logs to say why.
    console.warn('[debate-acceptor] dropping extracted-claim topics that are not entity ids', {
      count: droppedTopics.length,
      sample: droppedTopics.slice(0, 5),
    });
  }
  if (droppedStableIds.length > 0) {
    // The claim still publishes, under a fresh id — but anything that already requested it by
    // geo-chat's id will not find it, so this must not be silent.
    console.warn('[debate-acceptor] dropping extracted-claim entity ids that are not entity ids', {
      count: droppedStableIds.length,
      sample: droppedStableIds.slice(0, 5),
    });
  }
  if (droppedScores.length > 0) {
    // A score that is present but not a number in [0, 1] is drift — a retyped field upstream
    // would otherwise publish every debate unscored with nothing in the logs to say why.
    console.warn('[debate-acceptor] dropping extracted-claim highlight scores or axis scores that are not in [0, 1]', {
      count: droppedScores.length,
      sample: droppedScores.slice(0, 5),
    });
  }
  if (claims.length > 0) {
    // Scores are written once: a debate published unscored stays unscored (no backfill), so the
    // count has to be visible here. `model` null with claims present means scoring did not run
    // or failed upstream; a model with zero scored means the field was dropped on the way. The
    // axes come from the same run, so `withAxes` below `scored` means an older task answered.
    console.log('[debate-acceptor] highlight scores decoded', {
      claims: claims.length,
      scored: claims.filter(claim => claim.highlightScore !== null).length,
      withAxes: claims.filter(
        claim => claim.relevanceScore !== null && claim.qualityScore !== null && claim.controversyScore !== null
      ).length,
      model: typeof response.highlight_model === 'string' ? response.highlight_model : null,
    });
  }
  return { transcriptTurns, claims, dedupPendingUntil: decodeDedupPendingUntil(response.dedup_pending_until) };
}

/**
 * `dedup_pending_until` → epoch milliseconds, or null when there is no marker. A marker that is
 * present but unreadable is `Infinity` — never settled — and logged: publishing early is only ever
 * an optimisation (the full publish writes the same claims), while a claim published and then merged
 * away stays on the graph for good. geo-chat reads its own marker the same way.
 */
export function decodeDedupPendingUntil(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  const at = typeof value === 'string' ? Date.parse(value) : Number.NaN;
  if (Number.isNaN(at)) {
    console.warn('[debate-acceptor] unreadable dedup_pending_until; holding the claims for the full publish', {
      value,
    });
    return Number.POSITIVE_INFINITY;
  }
  return at;
}

/** Whether claims carrying `dedupPendingUntil` may be published at `now`. */
export function isDedupSettled(dedupPendingUntil: number | null | undefined, now: number): boolean {
  return dedupPendingUntil === null || dedupPendingUntil === undefined || now >= dedupPendingUntil;
}

/**
 * geo-chat's `entity_id` → a dashless lowercase entity id, or null. A malformed id is dropped (the
 * claim then mints a fresh id, as before D1) rather than passed on: `Graph.createRelation` asserts
 * every id and throws, which would fail this debate's publish on every sweep.
 */
function decodeStableEntityId(entityId: unknown, dropped: unknown[]): string | null {
  if (entityId === null || entityId === undefined) return null;
  const id = typeof entityId === 'string' ? entityId.trim() : '';
  if (id.length === 0) return null;
  if (!looksLikeEntityId(id)) {
    dropped.push(entityId);
    return null;
  }
  return uuidToHex(id);
}

/**
 * geo-chat's `stance` → one of the three verdicts, or null. Anything else — absent, null, or a
 * value from a future vocabulary — writes no stance relation rather than a guessed one.
 */
export function decodeStance(stance: unknown): ClaimStance | null {
  if (typeof stance !== 'string') return null;
  const value = stance.trim().toLowerCase();
  return value === 'supports' || value === 'opposes' || value === 'addresses' ? value : null;
}

/**
 * `start_ms`/`end_ms` → a timing, only when both are whole non-negative milliseconds and the end
 * is after the start. Anything else is null, which leaves the claim to the app's matcher: a
 * published offset is read as a certainty, so a malformed one would be worse than none.
 */
function decodeTiming(startMs: unknown, endMs: unknown): { startMs: number; endMs: number } | null {
  if (typeof startMs !== 'number' || typeof endMs !== 'number') return null;
  return publishableTiming({ startMs, endMs });
}

/**
 * `highlight_score` or an axis score → a score, only when it is a finite number in [0, 1].
 * Anything else is null, so nothing is published: the player ranks claims by these, and a
 * malformed value would rank. Null and absent are the ordinary "not scored"; a present value that
 * fails is recorded in `dropped` so the decoder can say so.
 */
function decodeScore(score: unknown, dropped: unknown[]): number | null {
  if (score === null || score === undefined) return null;
  const accepted = typeof score === 'number' ? publishableScore(score) : null;
  if (accepted === null) dropped.push(score);
  return accepted;
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
