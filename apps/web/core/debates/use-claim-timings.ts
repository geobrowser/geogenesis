'use client';

import * as React from 'react';

import { type ClaimTiming, resolveClaimTimings } from './claim-timing';
import { useDebateMedia, useDebateTranscript } from './hooks';
import { recordingTimeOf, transcriptOnRecordings } from './recording-clock';
import type { DebateTranscriptClaims } from './transcript-claims';

export type ClaimTimingsResult = {
  /** Claim id → when it was said. Absent for a claim whose moment could not be established. */
  timings: Map<string, ClaimTiming>;
  /**
   * Whether every answer that is coming has arrived.
   *
   * False while the transcript is still loading, so a surface that reorders by time can hold
   * rather than paint an order it is about to change under the reader — the same reason the claims
   * panel holds its rows back while the ranking loads.
   */
  isReady: boolean;
};

const EMPTY_TIMINGS = new Map<string, ClaimTiming>();

/**
 * When each of a debate's claims was said, on the web player's clock: the raw recordings, from the
 * debate's start. Transcript lines carry their time on that clock (GEO-3293). Timecodes published
 * to the graph are the rendered video's, which an Open rounds render edits, so each is placed by
 * the turn it falls in. Both keep every claim in order, so a time-ordered surface need not wait.
 *
 * Published timecodes come back with the claims themselves and need nothing else. Everything else
 * is recovered by matching the claims against the Whisper transcript, which the player already
 * fetches for subtitles — so on a debate card that is playing, this is free, and on one that is not
 * it is a single extra request.
 *
 * Deliberately a hook over `DebateTranscriptClaims` rather than a wrapper around
 * `useDebateTranscriptClaims`: the panel, the feed badge and the player each already hold the
 * claims, and re-fetching them per surface is what the shared query key exists to avoid.
 */
export function useClaimTimings(
  debateId: string | null,
  claims: DebateTranscriptClaims,
  enabled = true
): ClaimTimingsResult {
  // Every claim already carries published timecodes, so the transcript would tell us nothing we do
  // not already know. Nearly always false today and nearly always true later, which is the point.
  const allPublished = claims.all.length > 0 && claims.all.every(claim => claim.publishedTiming !== null);
  const needsTranscript = enabled && debateId !== null && claims.all.length > 0 && !allPublished;

  const transcript = useDebateTranscript(debateId ?? '', 'json', needsTranscript);
  const segments = React.useMemo(
    () => (transcript.data?.segments ? transcriptOnRecordings(transcript.data.segments) : []),
    [transcript.data?.segments]
  );
  // Only a published timecode needs the media: it comes on the edited video's clock and is placed by
  // the turn it falls in. Nearly always none today, so the claims panel and activity rows ask for
  // nothing more than they did. On a playing card it is the player's own response, a cache read.
  const needsMedia = enabled && debateId !== null && claims.all.some(claim => claim.publishedTiming !== null);
  const media = useDebateMedia(debateId ?? '', needsMedia);
  const turns = media.data?.turn_segments;
  const mediaSettled = !needsMedia || media.isSuccess || media.isError;

  const timings = React.useMemo(() => {
    if (claims.all.length === 0) return EMPTY_TIMINGS;
    const resolved = resolveClaimTimings({ claims: claims.all, blocks: claims.blocks, segments });
    // Until the media answers, a published timecode is on the edited clock and may yet move: hold
    // it back rather than let the live claims place it early and then take it away again.
    if (!mediaSettled) {
      return new Map([...resolved].filter(([, timing]) => timing.source !== 'published'));
    }
    if (!turns?.some(turn => turn.source_start_ms !== undefined)) return resolved;
    return new Map(
      [...resolved].map(([id, timing]) => [
        id,
        timing.source === 'published'
          ? {
              ...timing,
              startMs: recordingTimeOf(timing.startMs, turns, 'start'),
              endMs: recordingTimeOf(timing.endMs, turns, 'end'),
            }
          : timing,
      ])
    );
  }, [claims.all, claims.blocks, mediaSettled, segments, turns]);

  // A failed transcript fetch is ready, not pending: published timings still resolved, and the rest
  // are not coming. Reporting "still loading" forever would hold a time-ordered surface empty.
  // The same for the media, whose answer can move a published timing: a surface ordered by time
  // waits for it rather than reordering under the reader.
  const isReady = (!needsTranscript || transcript.isSuccess || transcript.isError) && mediaSettled;

  return { timings, isReady };
}
