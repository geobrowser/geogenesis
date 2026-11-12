/**
 * A debate's moments as the moments player reads them (GEO-3687).
 *
 * geo-chat serves the list inside `GET /debates/{id}/claims`, as `moments` (GEO-3351, picked two per
 * debater taking turns since GEO-3605, backfilled for older debates by GEO-3613). It is the same
 * read the debates app (debates-react-native `getLiveMoments`) plays its story cards from. Each
 * entry is a ready-made clip file (both debaters in one mp4, subtitles not burned in), the cues to
 * caption it with, and the span of the debate it was cut from.
 *
 * `clip_start_ms` / `clip_end_ms` are on the rendered video's clock: the one `final_video` plays on
 * and the transcript's bare `start_ms` uses. So the full debate here is the rendered video, and a
 * moment's place in it needs no conversion. (The Explore feed plays the raw recordings instead;
 * placing a moment there would go through `recording-clock.ts`.)
 *
 * Pure, so the decoding is tested without a network or a DOM.
 */

/** One moment's caption cue, timed from the start of the moment's own clip file. */
export type MomentCaption = { startMs: number; endMs: number; text: string };

export type DebateMoment = {
  /** The clip file's id, from its URL: what analytics calls `moment_id`. */
  id: string;
  /** Play order, 0-based: geo-chat's `moment_index`. Not time order; a reel can step back. */
  momentIndex: number;
  /** Index into the payload's `claims`. */
  claimIndex: number;
  /** The claim the moment plays for, when the payload still lists it. */
  claimText: string | null;
  /** 1 or 2: whose moment it is. Null when geo-chat did not say. */
  participantSlot: number | null;
  /** Absolute: the browser loads it directly and geo-chat redirects to the signed file. */
  clipUrl: string;
  /** The clip file's length. Null when geo-chat did not record one; the element's own then counts. */
  durationMs: number | null;
  /** Where the moment was cut from, on the full (rendered) debate's clock. Null when not recorded. */
  debateStartMs: number | null;
  debateEndMs: number | null;
  captions: MomentCaption[];
};

/** The wire shape of one `moments` entry. Every field is read defensively. */
export type DebateMomentPayload = {
  moment_index?: unknown;
  claim_index?: unknown;
  participant_slot?: unknown;
  clip_start_ms?: unknown;
  clip_end_ms?: unknown;
  duration_ms?: unknown;
  clip_url?: unknown;
  subtitles?: unknown;
};

/** The slice of the `/claims` payload this module reads. */
export type DebateMomentsPayload = {
  claims?: readonly ({ text?: unknown } | null | undefined)[] | null;
  moments?: readonly (DebateMomentPayload | null | undefined)[] | null;
};

const isFiniteNumber = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value);

const nonNegative = (value: unknown): number | null => (isFiniteNumber(value) && value >= 0 ? value : null);

/**
 * The payload's `moments` → the playable ones, in play order.
 *
 * An entry with no clip URL or no index is dropped rather than failing the list: one bad entry
 * costs that moment, not the debate's reel. `baseUrl` is geo-chat's public base, which a relative
 * `clip_url` (`/debates/{id}/moments/{clip}/content`, how geo-chat serves it) is resolved against.
 */
export function decodeDebateMoments(payload: DebateMomentsPayload | null | undefined, baseUrl: string): DebateMoment[] {
  const moments = Array.isArray(payload?.moments) ? payload.moments : [];
  const claims = Array.isArray(payload?.claims) ? payload.claims : [];
  const base = baseUrl.replace(/\/+$/, '');
  const decoded = moments.flatMap((moment): DebateMoment[] => {
    if (!moment || typeof moment.clip_url !== 'string' || moment.clip_url.length === 0) return [];
    if (!isFiniteNumber(moment.moment_index) || !isFiniteNumber(moment.claim_index)) return [];
    const claim = claims[moment.claim_index];
    const start = nonNegative(moment.clip_start_ms);
    const end = nonNegative(moment.clip_end_ms);
    return [
      {
        id: clipIdOf(moment.clip_url),
        momentIndex: moment.moment_index,
        claimIndex: moment.claim_index,
        claimText: typeof claim?.text === 'string' ? claim.text : null,
        participantSlot: isFiniteNumber(moment.participant_slot) ? moment.participant_slot : null,
        clipUrl: /^https?:\/\//.test(moment.clip_url) ? moment.clip_url : `${base}${moment.clip_url}`,
        durationMs: isFiniteNumber(moment.duration_ms) && moment.duration_ms > 0 ? moment.duration_ms : null,
        debateStartMs: start,
        debateEndMs: start !== null && end !== null && end > start ? end : null,
        captions: decodeCaptions(moment.subtitles),
      },
    ];
  });
  return decoded.sort((a, b) => a.momentIndex - b.momentIndex);
}

/** `/debates/{id}/moments/{clip_id}/content` → `clip_id`; the whole URL when it is not that shape. */
function clipIdOf(clipUrl: string): string {
  return clipUrl.match(/\/moments\/([^/]+)\/content/)?.[1] ?? clipUrl;
}

function decodeCaptions(value: unknown): MomentCaption[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((cue): MomentCaption[] => {
    if (!cue || typeof cue !== 'object') return [];
    const { start_ms, end_ms, text } = cue as Record<string, unknown>;
    if (!isFiniteNumber(start_ms) || !isFiniteNumber(end_ms) || typeof text !== 'string' || !text.trim()) return [];
    return [{ startMs: start_ms, endMs: end_ms, text: text.trim() }];
  });
}

/** The cue on screen `positionMs` into a moment's clip, or null in a gap. */
export function momentCaptionAt(captions: readonly MomentCaption[], positionMs: number): string | null {
  return captions.find(cue => positionMs >= cue.startMs && positionMs < cue.endMs)?.text ?? null;
}

/**
 * The full debate as one playable file: the rendered video, through geo-chat's public artifact
 * route, which redirects to the signed file. Unauthenticated, like the moments read.
 */
export function fullDebateVideoUrl(debateId: string, baseUrl: string): string {
  return `${baseUrl.replace(/\/+$/, '')}/debates/${encodeURIComponent(debateId)}/media/artifacts/final_video/content`;
}

/**
 * Where in the full debate to pick up from a moment: its start in the debate plus how far into
 * its clip the viewer got, never past the moment's own end. Null when the moment has no place.
 */
export function debateTimeForMoment(moment: DebateMoment, clipPositionMs = 0): number | null {
  if (moment.debateStartMs === null) return null;
  const at = moment.debateStartMs + Math.max(0, clipPositionMs);
  return moment.debateEndMs === null ? at : Math.min(at, moment.debateEndMs);
}

/** One dot on the full debate's timeline: which moment, and where along the bar (0–1). */
export type MomentMarker = { momentIndex: number; fraction: number };

/** The timeline's dots, for the moments that have a place inside a known length. */
export function momentMarkers(moments: readonly DebateMoment[], durationMs: number): MomentMarker[] {
  if (!(durationMs > 0)) return [];
  return moments.flatMap(moment =>
    moment.debateStartMs !== null && moment.debateStartMs < durationMs
      ? [{ momentIndex: moment.momentIndex, fraction: moment.debateStartMs / durationMs }]
      : []
  );
}

/** `m:ss` (or `h:mm:ss`) for the timeline's elapsed and total. */
export function formatPlaybackTime(ms: number): string {
  const total = Math.max(0, Math.floor((Number.isFinite(ms) ? ms : 0) / 1000));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const seconds = String(total % 60).padStart(2, '0');
  return hours > 0 ? `${hours}:${String(minutes).padStart(2, '0')}:${seconds}` : `${minutes}:${seconds}`;
}
