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
 * The clip file is not cut at `clip_start_ms` but a little before it: geo-chat widens the range by
 * edge room (`cut_start_ms`), and the clip's captions are timed from that cut. So position `p` in
 * the file is `cut_start_ms + p` in the debate. `moments[]` does not carry the cut yet (geo-chat
 * `moment_json` follow-up); see {@link cutOf} for where it is read from meanwhile.
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
  /** The spoken range the moment is for, on the full (rendered) debate's clock. Null when not recorded. */
  debateStartMs: number | null;
  debateEndMs: number | null;
  /**
   * Where the clip file itself starts and ends on the debate's clock: the range widened by the edge
   * room it was cut with. Clip position 0 is `cutStartMs`. Null when the moment has no range.
   */
  cutStartMs: number | null;
  cutEndMs: number | null;
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
  claims?:
    | readonly (
        | {
            text?: unknown;
            clip_start_ms?: unknown;
            clip_end_ms?: unknown;
            clip_lead_ms?: unknown;
            clip_tail_ms?: unknown;
          }
        | null
        | undefined
      )[]
    | null;
  moments?: readonly (DebateMomentPayload | null | undefined)[] | null;
  /** A story reel's own list (GEO-3638), stored with each moment's cut. Absent on picked reels. */
  story_moments?:
    | readonly (
        | {
            moment_index?: unknown;
            clip_start_ms?: unknown;
            clip_end_ms?: unknown;
            cut_start_ms?: unknown;
            cut_end_ms?: unknown;
          }
        | null
        | undefined
      )[]
    | null;
};

/**
 * geo-chat's automatic edge room on each side of a clip (`CLIP_EDGE_PAD_MS`), for a moment whose
 * own cut cannot be found. Story reels use their own, which the payload serves.
 */
export const DEFAULT_CLIP_EDGE_MS = 250;

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
    const cut = cutOf(payload, moment, start, end);
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
        cutStartMs: cut.start,
        cutEndMs: cut.end,
        captions: decodeCaptions(moment.subtitles),
      },
    ];
  });
  return decoded.sort((a, b) => a.momentIndex - b.momentIndex);
}

/**
 * Where a moment's clip file starts and ends in the debate. In order:
 *
 * 1. A story reel's entry for the same moment and range: its stored `cut_start_ms`/`cut_end_ms`.
 * 2. The moment's claim, when the moment is that claim's own clip range (a picked reel): the range
 *    widened by the claim's `clip_lead_ms`/`clip_tail_ms` (0 when absent), the rule geo-chat cut the
 *    file by.
 * 3. Otherwise geo-chat's default edge room on each side.
 */
function cutOf(
  payload: DebateMomentsPayload | null | undefined,
  moment: DebateMomentPayload,
  start: number | null,
  end: number | null
): { start: number | null; end: number | null } {
  if (start === null) return { start: null, end: null };
  const story = Array.isArray(payload?.story_moments)
    ? payload.story_moments.find(
        entry =>
          entry?.moment_index === moment.moment_index &&
          entry.clip_start_ms === start &&
          (end === null || entry.clip_end_ms === end)
      )
    : undefined;
  const storyStart = nonNegative(story?.cut_start_ms);
  if (story && storyStart !== null) {
    return {
      start: storyStart,
      end: nonNegative(story.cut_end_ms) ?? (end === null ? null : end + DEFAULT_CLIP_EDGE_MS),
    };
  }
  const claim =
    Array.isArray(payload?.claims) && isFiniteNumber(moment.claim_index) ? payload.claims[moment.claim_index] : null;
  const ownRange = claim && claim.clip_start_ms === start && claim.clip_end_ms === end;
  // geo-chat reads a missing lead or tail as 0 (`moments.rs`, `unwrap_or(0)`), so a claim without
  // them was cut at its own edges. 250 ms is only for a moment that is not its claim's own range.
  const lead = ownRange ? (nonNegative(claim.clip_lead_ms) ?? 0) : DEFAULT_CLIP_EDGE_MS;
  const tail = ownRange ? (nonNegative(claim.clip_tail_ms) ?? 0) : DEFAULT_CLIP_EDGE_MS;
  return { start: Math.max(0, start - lead), end: end === null ? null : end + tail };
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
 * Where in the full debate to pick up from a moment: where its clip file starts in the debate plus
 * how far into the file the viewer got, never past the file's end. Null when it has no place.
 */
export function debateTimeForMoment(moment: DebateMoment, clipPositionMs = 0): number | null {
  if (moment.cutStartMs === null) return null;
  const at = moment.cutStartMs + Math.max(0, clipPositionMs);
  return moment.cutEndMs === null ? at : Math.min(at, moment.cutEndMs);
}

/** One dot on the full debate's timeline: which moment, and where along the bar (0–1). */
export type MomentMarker = { momentIndex: number; fraction: number };

/**
 * The timeline's dots, for the moments that have a place inside a known length. Each sits where
 * its clip starts, which is where a press on it lands.
 */
export function momentMarkers(moments: readonly DebateMoment[], durationMs: number): MomentMarker[] {
  if (!(durationMs > 0)) return [];
  return moments.flatMap(moment =>
    moment.cutStartMs !== null && moment.cutStartMs < durationMs
      ? [{ momentIndex: moment.momentIndex, fraction: moment.cutStartMs / durationMs }]
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
