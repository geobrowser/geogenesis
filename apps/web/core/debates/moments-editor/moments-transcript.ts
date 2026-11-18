import type { MomentsTranscript } from './api';
import { refusalMessage } from './reel-status';

/**
 * The moments editor's transcript (GEO-3642). A debate published before word timings were kept
 * (GEO-3349) has none in its published transcript, so geo-chat transcribes it again for the editor,
 * saves that once, and cuts hand-picked reels on exactly the saved words. These read where that
 * stands, as the editor shows it.
 */

/** What the editor reads of the transcript to decide whether its reel can be edited. */
export type TranscriptGate = Pick<MomentsTranscript, 'word_timing' | 'words_from' | 'backfill'>;

/** Read every 15 s while it is transcribed, then every minute after ten minutes. Never given up on. */
export const TRANSCRIPT_POLL_MS = 15_000;
export const TRANSCRIPT_SLOW_POLL_MS = 60_000;
export const TRANSCRIPT_BACKOFF_AFTER_MS = 10 * 60_000;

/**
 * How long until the next read of a transcript being made, `elapsedMs` into the wait. There is no
 * give-up: geo-chat puts a dead run back in the queue and ends one out of attempts as `failed`, so
 * the status always moves on, and a long queue (a bulk re-cut) is still a queue.
 */
export function transcriptPollDelay(elapsedMs: number): number {
  return elapsedMs < TRANSCRIPT_BACKOFF_AFTER_MS ? TRANSCRIPT_POLL_MS : TRANSCRIPT_SLOW_POLL_MS;
}

export function isTranscriptWaiting(transcript: TranscriptGate | null | undefined): boolean {
  const status = transcript?.backfill?.status;
  return status === 'queued' || status === 'running';
}

/**
 * Whether the answer is one the editor keeps a while: words (published, or a saved fresh transcript),
 * or a geo-chat without the route. A transcription being made, failed or unavailable is not: the next
 * open asks again, since that read is what queues it or retries it.
 */
export function transcriptSettled(transcript: TranscriptGate | null | undefined): boolean {
  if (!transcript) return false;
  return !transcript.backfill || transcript.backfill.status === 'ready';
}

/**
 * The saved transcript's version, when the editor's words came from it: sent with every reel, so
 * the worker cuts on the words the clips were picked on or refuses (`transcript_changed`). Never
 * for published words, and never from a geo-chat without the route, which doesn't serve one.
 */
export function pinnedTranscriptVersion(transcript: TranscriptGate | null | undefined): string | undefined {
  if (transcript?.words_from !== 'backfill' || transcript.backfill?.status !== 'ready') return undefined;
  return transcript.backfill.version || undefined;
}

function waited(seconds: number) {
  const minutes = Math.floor(Math.max(0, seconds) / 60);
  return minutes < 1 ? 'under a minute' : `${minutes} min`;
}

const NO_WORD_TIMINGS =
  "Can't edit this reel yet: its transcript has no word timings, so geo-chat would transcribe it again and may not match it (GEO-3642).";

/**
 * Why the transcript leaves the editor read-only, or `null` when its words can be edited on: the
 * published words, or a saved fresh transcript that agrees with the published one. `debateMs` is how
 * long the debate runs: a transcription waiting longer than that is said to be slow.
 */
export function transcriptBlockedReason(
  transcript: TranscriptGate | null | undefined,
  debateMs?: number
): string | null {
  if (!transcript) return null;
  if (transcript.words_from === 'published') return null;
  const backfill = transcript.backfill;
  if (backfill) {
    switch (backfill.status) {
      case 'ready':
        if (backfill.agrees) return null;
        // The worker refuses a hand-picked reel on it (`transcript_differs`), so nothing could be published.
        return typeof backfill.agreement === 'number'
          ? `Can't edit this reel: a fresh transcript of this debate matches its published transcript only ${Math.floor(backfill.agreement * 100)}%, below the 80% a hand-picked reel needs.`
          : "Can't edit this reel: a fresh transcript of this debate doesn't match its published transcript closely enough for a hand-picked reel.";
      case 'queued':
      case 'running': {
        const ahead = backfill.status === 'queued' ? Math.max(0, (backfill.queue_position ?? 1) - 1) : 0;
        const where =
          backfill.status === 'running'
            ? 'running'
            : ahead > 0
              ? `queued behind ${ahead} other debate${ahead === 1 ? '' : 's'}`
              : 'queued';
        const slow = debateMs !== undefined && debateMs > 0 && backfill.waiting_s * 1000 > debateMs;
        return slow
          ? `Transcribing this debate for editing. It's taking longer than usual, but it's still ${where} (waiting ${waited(backfill.waiting_s)}). This page updates when it's done.`
          : `Transcribing this debate for editing. This can take as long as the debate. It's ${where} (waiting ${waited(backfill.waiting_s)}); this page updates when it's done.`;
      }
      case 'failed': {
        const retry = !backfill.permanent && backfill.retry_after ? new Date(backfill.retry_after) : null;
        const again =
          retry && !Number.isNaN(retry.getTime())
            ? ` Reopen the editor after ${retry.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })} to try again.`
            : '';
        return `Can't edit this reel: transcribing this debate for editing failed (${backfill.reason}).${again}`;
      }
      case 'unavailable':
        if (backfill.reason === 'transcription_off') {
          return "Can't edit this reel: its transcript has no word timings, and transcribing debates for editing is off in this environment.";
        }
        if (backfill.reason === 'media_job_active') {
          return "Can't edit this reel yet: the debate's media is still processing. Reopen the editor when it's done to transcribe it for editing.";
        }
        return `Can't edit this reel: its transcript has no word timings, and it can't be transcribed again. ${refusalMessage(backfill.reason)}`;
    }
  }
  // A geo-chat without the route (its public transcript instead), or one serving no status.
  return transcript.word_timing === false ? NO_WORD_TIMINGS : null;
}
