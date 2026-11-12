import type { MomentBackfillReport, MomentBackfillStatus } from './api';

/**
 * Where a reel request stands, in the editor's words (GEO-3671). geo-chat queues a request and the
 * media worker renders it later, so a publish is never "published" on the spot: it is queued, then
 * rendering, then live, or it failed and says which clip. A preview runs the same way and ends with
 * what it would have published.
 */
export type ReelJob =
  | { kind: 'none'; preview: false; unlock: false }
  | { kind: 'queued'; preview: boolean; unlock: boolean }
  | { kind: 'rendering'; preview: boolean; unlock: boolean }
  | { kind: 'done'; preview: boolean; unlock: boolean; report: MomentBackfillReport | null }
  | {
      kind: 'failed';
      preview: boolean;
      unlock: boolean;
      /** One line on what went wrong. */
      summary: string;
      /** Problems the worker tied to a clip, by its index in play order (0-based). */
      clips: Record<number, string[]>;
      /** Problems it tied to no clip. */
      other: string[];
    };

export function reelJob(request: MomentBackfillStatus | null | undefined): ReelJob {
  if (!request) return { kind: 'none', preview: false, unlock: false };
  const preview = Boolean(request.preview);
  const unlock = Boolean(request.unlock);
  switch (request.status) {
    case 'queued':
      return { kind: 'queued', preview, unlock };
    case 'running':
      return { kind: 'rendering', preview, unlock };
    case 'done':
      return { kind: 'done', preview, unlock, report: request.report };
    case 'skipped': {
      const { clips, other } = clipProblemsFrom(request.report?.story_failed);
      return {
        kind: 'failed',
        preview,
        unlock,
        summary: refusalMessage(request.outcome ?? 'skipped'),
        clips,
        other,
      };
    }
    case 'failed':
    default: {
      const { clips, other } = clipProblemsFrom(request.report?.story_failed);
      return {
        kind: 'failed',
        preview,
        unlock,
        summary: request.last_error ? `The media worker failed: ${request.last_error}` : 'The media worker failed.',
        clips,
        other,
      };
    }
  }
}

/** Whether the job still holds the queue: the editor waits on it and offers nothing new meanwhile. */
export function jobInFlight(job: ReelJob) {
  return job.kind === 'queued' || job.kind === 'rendering';
}

/**
 * The worker's `story_failed` for a hand-picked reel: `clip N: …` problems in play order, joined by
 * `; `. Anything else (a story pick's `code: detail`) is kept whole, as a problem of no clip.
 */
export function clipProblemsFrom(storyFailed: string | null | undefined): {
  clips: Record<number, string[]>;
  other: string[];
} {
  const clips: Record<number, string[]> = {};
  const other: string[] = [];
  if (!storyFailed) return { clips, other };
  for (const part of storyFailed.split('; ')) {
    const text = part.trim();
    if (!text) continue;
    const match = /^clip (\d+): (.+)$/s.exec(text);
    if (match) {
      const index = Number(match[1]) - 1;
      (clips[index] ??= []).push(match[2]);
    } else {
      other.push(text);
    }
  }
  return { clips, other };
}

/**
 * Why a debate cannot take a hand-picked reel, or why a request for one was skipped. Codes are
 * geo-chat's (`SkipReason::code` and the API's own); an unknown one is shown as it came.
 */
export function refusalMessage(code: string): string {
  switch (code) {
    case 'media_job_active':
      return "The debate's media is still being processed. Try again when it's done.";
    case 'media_job_failed':
      return "The debate's media job failed, so its media never fully published.";
    case 'no_media_job':
      return 'The debate has no media yet.';
    case 'recording_cancelled':
      return 'The recording of this debate was cancelled.';
    case 'recordings_missing':
      return 'The recordings the debate was rendered from cannot be found.';
    case 'debate_not_found':
      return 'There is no such debate.';
    case 'already_queued':
      return 'A request for this debate is already waiting or running.';
    case 'reel_changed':
      return 'Someone changed this reel since you opened it. Reload to edit the reel that is live now.';
    case 'manual_reel':
      return 'This reel was picked by hand, so only another hand-picked reel replaces it.';
    case 'manual_reel_invalid':
      return "Some clips can't be cut or linked as given.";
    case 'reel_no_longer_fits':
      // geo-chat#352: a re-render re-extracted the debate and the hand-picked reel it re-applied no longer fits.
      return 'A re-render moved the video, so this hand-picked reel no longer fits. Pick its clips again.';
    case 'transcript_differs':
      return "A fresh transcript of this debate doesn't match the stored one, so its reel can't be redone yet.";
    case 'turns_differ':
      return "A fresh transcript splits this debate into different turns, so its reel can't be redone yet.";
    case 'no_transcript':
      return 'The debate has no transcript.';
    case 'no_claims':
      return 'The debate has no claims to link clips to.';
    case 'live_claims_only':
      return 'The debate only has claims from the live transcript.';
    case 'no_transcript_references':
      return "The debate's claims don't say where in the transcript they were made.";
    case 'too_few_moments':
      return 'Too few usable clips came out of it.';
    case 'claims_changed':
      return "The debate's claims changed while it ran. Try again.";
    case 'extraction_empty':
    case 'extraction_unavailable':
      return 'Claim extraction was unavailable. Try again later.';
    case 'already_has_moments':
      return 'The debate already has moments.';
    default:
      return `geo-chat refused it: ${code}.`;
  }
}

/**
 * Whether a refusal from the dry run leaves the editor read-only. A request already in the queue
 * does not: the editor shows it and waits.
 */
export function refusalBlocksEditing(refusal: string | null | undefined) {
  return Boolean(refusal) && refusal !== 'already_queued';
}
