'use client';

import * as React from 'react';

import { DebateFeedPlayer } from '~/core/debates/browse/debate-feed-player';
import { DEBATE_FEED_HOLDS_FULL_PLAYBACK } from '~/core/debates/browse/feed-full-playback';
import { useDebate, useDebateMedia } from '~/core/debates/hooks';
import { hasProcessedVideo, isWatchableDebate } from '~/core/debates/playback-utils';
import { ID } from '~/core/id';

type Props = {
  /** The Debate entity's id; geo-chat knows the same debate by its dashed spelling. */
  debateEntityId: string;
  /** What the debate is, for the player's accessible name. */
  label: string;
  /** Only the active side plays; the other pauses (GEO-3678: one at a time). */
  active: boolean;
  /** The viewer reached for this side, by tapping it or pressing its Play. */
  onActivate: () => void;
};

/**
 * The player on each side of the Best debates compare view (GEO-3678).
 *
 * The one place the compare view says how a debate plays. It ships with the existing full-debate
 * feed player; GEO-3687's moments player (`DebateMomentsPlayer`) replaces this body once it merges,
 * and nothing else in the compare view needs to change.
 */
export function RankingCompareDebatePlayer({ debateEntityId, label, active, onActivate }: Props) {
  const debateId = ID.hexToUuid(ID.uuidToHex(debateEntityId));
  const debateQuery = useDebate(debateId, true);
  const debate = debateQuery.data;
  const watchable = debate != null && isWatchableDebate(debate);
  const mediaQuery = useDebateMedia(debateId, watchable);
  const ready = debate != null && watchable && hasProcessedVideo(mediaQuery.data);
  const unavailable =
    debateQuery.isError ||
    (debate != null && !watchable) ||
    mediaQuery.isError ||
    (mediaQuery.data != null && !hasProcessedVideo(mediaQuery.data));

  return (
    <div
      className="overflow-hidden rounded-lg bg-grey-01"
      aria-label={label}
      role="group"
      // Capture, so the tap that starts this side also makes it the one that plays.
      onPointerDownCapture={onActivate}
    >
      {ready && debate ? (
        <DebateFeedPlayer
          debate={debate}
          active={active}
          preload
          holdFullPlayback={DEBATE_FEED_HOLDS_FULL_PLAYBACK}
          reducedOverlays
          framed
          onPlaybackRequest={onActivate}
        />
      ) : (
        <div className="grid aspect-video place-items-center text-metadata text-grey-04">
          {unavailable ? 'This debate can’t play here' : 'Loading…'}
        </div>
      )}
    </div>
  );
}
