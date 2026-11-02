'use client';

import * as React from 'react';

import { type ClaimTiming, resolveClaimTimings } from './claim-timing';
import { groupedPublishedClaims, refineGroupedClaimTimings } from './claim-timing-refinement';
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
 * Independent published timecodes need nothing else. Shared paragraph offsets and untimed claims
 * are resolved against the Whisper transcript, which the player already fetches for subtitles.
 * Matching stays within published bounds, preserving coarse offsets when the transcript cannot
 * distinguish their statements. The counter, backlog and scrubber all read the same timings.
 *
 * Deliberately a hook over `DebateTranscriptClaims` rather than a wrapper around
 * `useDebateTranscriptClaims`: the panel and the player each already hold the claims, and
 * re-fetching them per surface is what the shared query key exists to avoid.
 *
 * Shared-offset refinement can also request the transcript for fully published claims. Consumers
 * are the live ticker/counter/scrubber and end-card carousel (via useDrawableDebateClaims), the
 * debate claims panel, and an expanded debate branch in activity rows. These use the same cached
 * JSON transcript query; independent published offsets still do not request it. Grouped timings
 * wait for transcript/media success or error, then retain published bounds when refinement fails.
 */
export function useClaimTimings(
  debateId: string | null,
  claims: DebateTranscriptClaims,
  enabled = true
): ClaimTimingsResult {
  // Published offsets can describe a whole paragraph shared by multiple claims. The transcript
  // can separate those statements; otherwise fully timed claims still need no extra request.
  const allPublished = claims.all.length > 0 && claims.all.every(claim => claim.publishedTiming !== null);
  const grouped = React.useMemo(() => groupedPublishedClaims(claims.all), [claims.all]);
  const groupedIds = React.useMemo(() => new Set(grouped.flatMap(group => group.map(claim => claim.id))), [grouped]);
  const needsTranscript =
    enabled && debateId !== null && claims.all.length > 0 && (!allPublished || grouped.length > 0);

  const transcript = useDebateTranscript(debateId ?? '', 'json', needsTranscript);
  const segments = React.useMemo(
    () => (transcript.data?.segments ? transcriptOnRecordings(transcript.data.segments) : []),
    [transcript.data?.segments]
  );
  // Published timecodes need media to move from the edited video to the recordings' clock.
  // On a playing card this is the player's own response, a cache read.
  const needsMedia = enabled && debateId !== null && claims.all.some(claim => claim.publishedTiming !== null);
  const media = useDebateMedia(debateId ?? '', needsMedia);
  const turns = media.data?.turn_segments;
  const mediaSettled = !needsMedia || media.isSuccess || media.isError;
  const transcriptSettled = !needsTranscript || transcript.isSuccess || transcript.isError;

  const timings = React.useMemo(() => {
    if (claims.all.length === 0) return EMPTY_TIMINGS;
    const resolved = resolveClaimTimings({ claims: claims.all, blocks: claims.blocks, segments });
    // Until the media answers, a published timecode is on the edited clock and may yet move: hold
    // it back rather than let the live claims place it early and then take it away again.
    if (!mediaSettled) {
      return new Map([...resolved].filter(([, timing]) => timing.source !== 'published'));
    }
    const mapped = turns?.some(turn => turn.source_start_ms !== undefined)
      ? new Map(
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
        )
      : resolved;
    // Do not first add a paragraph's claims in a batch and then move them backwards when its
    // finer transcript arrives. Publish those timings once their refinement input has settled.
    if (!transcriptSettled) return new Map([...mapped].filter(([id]) => !groupedIds.has(id)));
    // Without media we cannot establish that published bounds and transcript lines share a clock.
    return media.isSuccess ? refineGroupedClaimTimings(grouped, mapped, segments) : mapped;
  }, [
    claims.all,
    claims.blocks,
    grouped,
    groupedIds,
    media.isSuccess,
    mediaSettled,
    segments,
    transcriptSettled,
    turns,
  ]);

  // A failed transcript fetch is ready, not pending: published timings still resolved, and the rest
  // are not coming. Reporting "still loading" forever would hold a time-ordered surface empty.
  // The same for the media, whose answer can move a published timing: a surface ordered by time
  // waits for it rather than reordering under the reader.
  const isReady = transcriptSettled && mediaSettled;

  return { timings, isReady };
}
