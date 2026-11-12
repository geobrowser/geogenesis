import { type GetPrivyIdentityToken, dashlessId, geoChatRequest } from '../api';

/**
 * geo-chat's admin moment-backfill routes (GEO-3613, GEO-3638, GEO-3658), as the moments editor
 * (GEO-3671) uses them. Both are gated on geo-chat's media-admin allowlist: anyone off it is refused
 * with 403 `media_admin_required` (or 503 `media_admin_not_configured`), and that refusal is the
 * only way the client learns who is an admin. The server stays the gate; nothing here grants it.
 */

/** Why a debate would not be (or was not) queued: the worker's skip codes plus the API's own. */
export type MomentBackfillRefusal = string;

export type MomentBackfillRequestStatus = 'queued' | 'running' | 'done' | 'skipped' | 'failed';

/** One clip of a hand-picked reel as geo-chat stores it on the request: times in ms. */
export type StoredManualClip = { start_ms: number; end_ms: number; claim_index?: number | null };

/** A clip of a story reel, as a preview's report lists it. Times on the rendered video's clock. */
export type StoryReelMoment = {
  moment_index: number;
  /** The linked claim's position in the debate's claims when the reel was read. */
  claim_index: number;
  /** The linked claim's text when picked: what confirms which claim the clip plays for. */
  claim_text?: string;
  participant_slot: number;
  /** First word's start to last word's end. */
  clip_start_ms: number;
  clip_end_ms: number;
  /** What would actually be cut: the clip with its clear room either side. */
  cut_start_ms: number;
  cut_end_ms: number;
  quote: string;
};

export type MomentBackfillReport = {
  story_reel?: StoryReelMoment[];
  /** `code: detail`, or for a hand-picked reel `clip N: …` problems joined by `; `. */
  story_failed?: string;
  manual?: boolean;
  unlocked?: boolean;
  moments?: number;
  clips_rendered?: number;
  [key: string]: unknown;
};

/** A debate's backfill request, as it stands. */
export type MomentBackfillStatus = {
  debate_id: string;
  status: MomentBackfillRequestStatus;
  requested_by: string;
  reason: string;
  requested_at: string;
  recut: boolean;
  preview: boolean;
  reextract?: boolean;
  story?: boolean;
  manual_reel?: {
    clock?: string;
    clips?: StoredManualClip[];
    base?: string;
    /** A reel the media worker sent again itself after a re-render re-extracted claims (geo-chat#352). */
    reapplied?: { job_id: string; quotes?: string[] } | null;
  } | null;
  unlock?: boolean;
  attempt_count?: number;
  /** The worker's skip code, or `error` once a failure is final. */
  outcome: string | null;
  report: MomentBackfillReport | null;
  last_error: string | null;
  completed_at: string | null;
};

/**
 * The cuts that play now, in play order (geo-chat GEO-3670), on the rendered video's clock. Absent
 * from a geo-chat that predates it; the editor then falls back to the served moments, which are
 * word ranges rather than cuts. `null` when the debate has no reel.
 */
export type LiveReel = {
  clock: 'video';
  clips: {
    /** The cut the clip's file was rendered from, edge room included. */
    start_ms: number;
    end_ms: number;
    /** Zero-based (`0` is debater 1). Unused: the editor counts the speaker from the words itself. */
    speaker_slot: number;
    claim_index: number | null;
    claim_text: string | null;
  }[];
};

export type MomentBackfillEntry = {
  debate_id: string;
  refusal: MomentBackfillRefusal | null;
  path: string | null;
  claims: number | null;
  timed_claims: number | null;
  /** The reel's fingerprint: passed back as `base`, so an edit never overwrites a newer reel. */
  reel_version: string | null;
  hand_picked: { requested_by: string; requested_at: string } | null;
  queued: boolean;
  request: MomentBackfillStatus | null;
  live_reel?: LiveReel | null;
};

export type MomentBackfillResponse = { applied: boolean; debates: MomentBackfillEntry[] };

/** A hand-picked clip as the editor sends it: seconds on `clock`. */
export type ManualClipBody = { start: number; end: number; claim_index?: number };

export type MomentBackfillBody = {
  debate_ids: string[];
  apply: boolean;
  preview?: boolean;
  reason?: string;
  reel?: { clock: 'player' | 'video'; clips: ManualClipBody[]; base?: string };
  unlock?: boolean;
  /** Pick the reel as a story (GEO-3638); sent with `unlock` so the re-pick is a story reel. */
  story?: boolean;
  /** With `unlock`: refused (`reel_changed`) if the reel moved on since `base`. */
  base?: string;
};

/** What the GET answers for one debate, whichever shape the deployed geo-chat sends. */
export type MomentBackfillRead = { request: MomentBackfillStatus | null; entry: MomentBackfillEntry | null };

/**
 * geo-chat's GET answers a bare list of requests; the POST answers `{applied, debates}` entries.
 * Either shape is read here, so the editor keeps working if the GET ever moves to the POST's.
 */
export function readMomentBackfills(raw: unknown, debateId: string): MomentBackfillRead {
  const same = (id: unknown) => typeof id === 'string' && dashlessId(id) === dashlessId(debateId);
  if (Array.isArray(raw)) {
    const request = (raw as MomentBackfillStatus[]).find(status => same(status?.debate_id)) ?? null;
    return { request, entry: null };
  }
  const debates = (raw as Partial<MomentBackfillResponse> | null)?.debates;
  const entry = Array.isArray(debates) ? (debates.find(candidate => same(candidate?.debate_id)) ?? null) : null;
  return { request: entry?.request ?? null, entry };
}

export async function getMomentBackfill(
  debateId: string,
  getPrivyIdentityToken: GetPrivyIdentityToken,
  accountKey: string | null,
  signal?: AbortSignal
): Promise<MomentBackfillRead> {
  const raw = await geoChatRequest<unknown>(
    `/admin/debates/moment-backfills?debate_ids=${encodeURIComponent(debateId)}`,
    { auth: true, getPrivyIdentityToken, accountKey, signal }
  );
  return readMomentBackfills(raw, debateId);
}

export async function postMomentBackfill(
  body: MomentBackfillBody,
  getPrivyIdentityToken: GetPrivyIdentityToken,
  accountKey: string | null,
  signal?: AbortSignal
): Promise<MomentBackfillEntry | null> {
  const response = await geoChatRequest<MomentBackfillResponse>('/admin/debates/moment-backfills', {
    method: 'POST',
    body,
    auth: true,
    getPrivyIdentityToken,
    accountKey,
    signal,
  });
  return response.debates[0] ?? null;
}
