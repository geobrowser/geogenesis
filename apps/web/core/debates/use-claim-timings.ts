'use client';

import * as React from 'react';

import { type ClaimTiming, resolveClaimTimings } from './claim-timing';
import { useDebateMedia, useDebateTranscript } from './hooks';
import { identityClock, playbackClockFrom } from './playback-clock';
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
 * debate's start. Published timecodes and transcript lines are both on the rendered video's clock,
 * which an Open rounds render edits, so each is moved back onto the recordings (GEO-3277). The move
 * keeps every claim in order, so a time-ordered surface does not need to wait for it.
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
  const segments = transcript.data?.segments;
  // The same response the player reads, so on a playing card this is a cache read.
  const media = useDebateMedia(debateId ?? '', enabled && debateId !== null && claims.all.length > 0);
  const clock = React.useMemo(() => playbackClockFrom(media.data), [media.data]);

  const timings = React.useMemo(() => {
    if (claims.all.length === 0) return EMPTY_TIMINGS;
    const resolved = resolveClaimTimings({ claims: claims.all, blocks: claims.blocks, segments: segments ?? [] });
    if (clock === identityClock) return resolved;
    return new Map(
      [...resolved].map(([id, timing]) => [
        id,
        { ...timing, startMs: clock(timing.startMs, 'start'), endMs: clock(timing.endMs, 'end') },
      ])
    );
  }, [claims.all, claims.blocks, clock, segments]);

  // A failed transcript fetch is ready, not pending: published timings still resolved, and the rest
  // are not coming. Reporting "still loading" forever would hold a time-ordered surface empty.
  const isReady = !needsTranscript || transcript.isSuccess || transcript.isError;

  return { timings, isReady };
}
