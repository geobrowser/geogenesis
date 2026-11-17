import { describe, expect, it } from 'vitest';

import type { BackfillTranscriptStatus } from './api';
import { editingBlockedReason } from './moments-editor';
import {
  isTranscriptWaiting,
  pinnedTranscriptVersion,
  transcriptBlockedReason,
  transcriptPollDelay,
} from './moments-transcript';

/** A published transcript without word timings, and where its fresh transcription stands. */
const fresh = (backfill: BackfillTranscriptStatus) => ({
  word_timing: backfill.status === 'ready',
  words_from: backfill.status === 'ready' ? ('backfill' as const) : null,
  backfill,
});
const queued = (waiting_s: number, queue_position?: number): BackfillTranscriptStatus => ({
  status: 'queued',
  requested_at: '2026-11-17T10:00:00Z',
  waiting_s,
  ...(queue_position !== undefined && { queue_position }),
});
const running = (waiting_s: number): BackfillTranscriptStatus => ({
  status: 'running',
  requested_at: '2026-11-17T10:00:00Z',
  waiting_s,
  started_at: '2026-11-17T10:01:00Z',
});
const ready = (agreement: number | null, agrees: boolean): BackfillTranscriptStatus => ({
  status: 'ready',
  version: 'tv1',
  agreement,
  agrees,
  completed_at: '2026-11-17T10:10:00Z',
});

describe('transcriptBlockedReason (GEO-3642)', () => {
  it('edits on published words, and on a saved transcript that agrees', () => {
    expect(transcriptBlockedReason({ word_timing: true, words_from: 'published', backfill: null })).toBeNull();
    expect(transcriptBlockedReason(fresh(ready(0.93, true)))).toBeNull();
    // Not loaded yet: the editor's own loading and failure states say it.
    expect(transcriptBlockedReason(undefined)).toBeNull();
  });

  it('says a queued transcription can take as long as the debate, and how many are ahead of it', () => {
    expect(transcriptBlockedReason(fresh(queued(12, 1)))).toBe(
      "Transcribing this debate for editing. This can take as long as the debate. It's queued (waiting under a minute); this page updates when it's done."
    );
    expect(transcriptBlockedReason(fresh(queued(300, 2)))).toMatch(/queued behind 1 other debate \(waiting 5 min\)/);
    expect(transcriptBlockedReason(fresh(queued(300, 4)))).toMatch(/queued behind 3 other debates/);
    expect(transcriptBlockedReason(fresh(queued(300)))).toMatch(/It's queued \(waiting 5 min\)/);
  });

  it('says a running transcription is running, and is slow only once it has waited longer than the debate', () => {
    const debateMs = 30 * 60_000;
    expect(transcriptBlockedReason(fresh(running(29 * 60)), debateMs)).toMatch(
      /This can take as long as the debate\. It's running \(waiting 29 min\)/
    );
    expect(transcriptBlockedReason(fresh(running(31 * 60)), debateMs)).toBe(
      "Transcribing this debate for editing. It's taking longer than usual, but it's still running (waiting 31 min). This page updates when it's done."
    );
    expect(transcriptBlockedReason(fresh(queued(31 * 60, 5)), debateMs)).toMatch(/still queued behind 4 other debates/);
    // No turns to say how long the debate runs: never called slow.
    expect(transcriptBlockedReason(fresh(running(99 * 60)))).toMatch(/This can take as long as the debate/);
  });

  it('stays read-only with the agreement when the saved words disagree', () => {
    expect(transcriptBlockedReason(fresh(ready(0.789, false)))).toBe(
      "Can't edit this reel: a fresh transcript of this debate matches its published transcript only 78%, below the 80% a hand-picked reel needs."
    );
    expect(transcriptBlockedReason(fresh(ready(null, false)))).toMatch(
      /doesn't match its published transcript closely enough/
    );
  });

  it('says a failed transcription failed, and when reopening tries again', () => {
    const retryAfter = '2026-11-17T15:30:00Z';
    const at = new Date(retryAfter).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
    expect(
      transcriptBlockedReason(
        fresh({ status: 'failed', reason: 'whisper crashed', permanent: false, retry_after: retryAfter })
      )
    ).toBe(
      `Can't edit this reel: transcribing this debate for editing failed (whisper crashed). Reopen the editor after ${at} to try again.`
    );
    expect(transcriptBlockedReason(fresh({ status: 'failed', reason: 'attempts used up', permanent: true }))).toBe(
      "Can't edit this reel: transcribing this debate for editing failed (attempts used up)."
    );
  });

  it('says why a debate cannot be transcribed', () => {
    const unavailable = (reason: string) => transcriptBlockedReason(fresh({ status: 'unavailable', reason }));
    expect(unavailable('transcription_off')).toMatch(/transcribing debates for editing is off in this environment/);
    expect(unavailable('media_job_active')).toMatch(/media is still processing/);
    expect(unavailable('recordings_missing')).toMatch(
      /can't be transcribed again\. The recordings the debate was rendered from cannot be found\./
    );
  });

  it("keeps today's message for a geo-chat without the route", () => {
    expect(transcriptBlockedReason({ word_timing: false })).toMatch(/no word timings/);
    expect(transcriptBlockedReason({ word_timing: true })).toBeNull();
  });

  it('is what editingBlockedReason says once nothing else blocks editing', () => {
    expect(editingBlockedReason({ refusal: null }, fresh(queued(5, 1)), null)).toMatch(/^Transcribing this debate/);
    expect(editingBlockedReason({ refusal: null }, fresh(running(120)), null, false, false, false, 60_000)).toMatch(
      /taking longer than usual/
    );
    // The dry run's refusal comes first.
    expect(editingBlockedReason({ refusal: 'media_job_active' }, fresh(queued(5, 1)), null)).toMatch(
      /still being processed/
    );
  });
});

describe('pinnedTranscriptVersion (GEO-3642)', () => {
  it('is the saved transcript version only when the words came from it', () => {
    expect(pinnedTranscriptVersion(fresh(ready(0.93, true)))).toBe('tv1');
    expect(pinnedTranscriptVersion({ word_timing: true, words_from: 'published', backfill: null })).toBeUndefined();
    expect(pinnedTranscriptVersion({ word_timing: true })).toBeUndefined();
    expect(pinnedTranscriptVersion(fresh(queued(5)))).toBeUndefined();
    expect(pinnedTranscriptVersion(undefined)).toBeUndefined();
  });
});

describe('transcript polling (GEO-3642)', () => {
  it('reads every 15 s, then every minute after ten minutes, and never gives up', () => {
    expect(transcriptPollDelay(0)).toBe(15_000);
    expect(transcriptPollDelay(10 * 60_000 - 1)).toBe(15_000);
    expect(transcriptPollDelay(10 * 60_000)).toBe(60_000);
    expect(transcriptPollDelay(5 * 60 * 60_000)).toBe(60_000);
  });

  it('waits only while the transcription is queued or running', () => {
    expect(isTranscriptWaiting(fresh(queued(1)))).toBe(true);
    expect(isTranscriptWaiting(fresh(running(1)))).toBe(true);
    expect(isTranscriptWaiting(fresh(ready(0.9, true)))).toBe(false);
    expect(isTranscriptWaiting(fresh({ status: 'failed', reason: 'x', permanent: false }))).toBe(false);
    expect(isTranscriptWaiting({ word_timing: false })).toBe(false);
  });
});
