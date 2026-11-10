import { getGeoChatApiBaseUrl } from './geo-chat-public-base-url';
import type { DebateExtractedClaimsResponse, DebateExtractedMoment } from './server/extracted-claims';

/**
 * A debate's published moments (GEO-3351): short clip files geo-chat cut around its best claims.
 *
 * The read-and-pick slice of GEO-3352, which GEO-3578's opening clip needs first. Pure, so the
 * Moments player can reuse the decoding without the opener's rules.
 */
export type DebateMoment = {
  /** The clip file's id, from its URL — what analytics calls `moment_id`. */
  id: string;
  momentIndex: number;
  claimIndex: number;
  claimText: string | null;
  /** The claim's `moment_score`, or null when it was not scored. */
  score: number | null;
  participantSlot: number | null;
  /** Absolute: the browser loads it directly, and geo-chat redirects to the signed file. */
  clipUrl: string;
  /** The clip's published length. Null when geo-chat did not record one. */
  durationMs: number | null;
  subtitles: MomentSubtitle[];
};

export type MomentSubtitle = { startMs: number; endMs: number; text: string };

const isFiniteNumber = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value);

/**
 * The payload's `moments` → moments with a playable clip, in the list's own order.
 *
 * Entries without a clip URL or an index are dropped rather than failing the list: one bad entry
 * should cost that moment, not the debate's whole opening.
 */
export function decodeDebateMoments(
  payload: Pick<DebateExtractedClaimsResponse, 'claims' | 'moments'> | null | undefined,
  baseUrl: string = getGeoChatApiBaseUrl()
): DebateMoment[] {
  const moments = Array.isArray(payload?.moments) ? payload.moments : [];
  const claims = Array.isArray(payload?.claims) ? payload.claims : [];
  return moments.flatMap((moment: DebateExtractedMoment) => {
    if (!moment || typeof moment.clip_url !== 'string' || moment.clip_url.length === 0) return [];
    if (!isFiniteNumber(moment.moment_index) || !isFiniteNumber(moment.claim_index)) return [];
    const claim = claims[moment.claim_index];
    const score = isFiniteNumber(claim?.moment_score) ? claim.moment_score : null;
    return [
      {
        id: clipIdOf(moment.clip_url),
        momentIndex: moment.moment_index,
        claimIndex: moment.claim_index,
        claimText: typeof claim?.text === 'string' ? claim.text : null,
        score,
        participantSlot: isFiniteNumber(moment.participant_slot) ? moment.participant_slot : null,
        clipUrl: /^https?:\/\//.test(moment.clip_url) ? moment.clip_url : `${baseUrl}${moment.clip_url}`,
        durationMs: isFiniteNumber(moment.duration_ms) && moment.duration_ms > 0 ? moment.duration_ms : null,
        subtitles: decodeSubtitles(moment.subtitles),
      },
    ];
  });
}

/** `/debates/{id}/moments/{clip_id}/content` → `clip_id`; the whole path when it is not that shape. */
function clipIdOf(clipUrl: string): string {
  return clipUrl.match(/\/moments\/([^/]+)\/content/)?.[1] ?? clipUrl;
}

function decodeSubtitles(value: unknown): MomentSubtitle[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap(cue => {
    if (!cue || typeof cue !== 'object') return [];
    const { start_ms, end_ms, text } = cue as Record<string, unknown>;
    if (!isFiniteNumber(start_ms) || !isFiniteNumber(end_ms) || typeof text !== 'string' || !text.trim()) return [];
    return [{ startMs: start_ms, endMs: end_ms, text: text.trim() }];
  });
}

/**
 * The debate's most engaging moment: the highest `moment_score`, ties to the lower `moment_index`.
 *
 * Picked by score rather than taken from index 0. geo-chat puts its lead moment at index 0 and the
 * rest in time order, but drops a moment whose file failed to render, so index 0 is sometimes the
 * second moment of the debate rather than the best. Unscored moments rank below every scored one,
 * so a list with no scores at all falls back to geo-chat's own order.
 */
export function topMoment(moments: readonly DebateMoment[]): DebateMoment | null {
  let best: DebateMoment | null = null;
  for (const moment of moments) {
    if (!best) {
      best = moment;
      continue;
    }
    const score = moment.score ?? -Infinity;
    const bestScore = best.score ?? -Infinity;
    if (score > bestScore || (score === bestScore && moment.momentIndex < best.momentIndex)) best = moment;
  }
  return best;
}

/** The cue on screen at `positionMs` into the clip, or null in a gap. */
export function momentSubtitleAt(subtitles: readonly MomentSubtitle[], positionMs: number): string | null {
  return subtitles.find(cue => positionMs >= cue.startMs && positionMs < cue.endMs)?.text ?? null;
}
