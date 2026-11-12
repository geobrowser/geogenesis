'use client';

import * as React from 'react';

import { DebateMomentsPlayer } from '~/core/debates/moments-player/debate-moments-player';

/**
 * The compare view's two players share this group, so starting one pauses the other (GEO-3678: one
 * at a time). Its own group, so the dialog's players don't reach players elsewhere on the page.
 */
export const RANKING_COMPARE_PLAYBACK_GROUP = 'ranking-compare';

type Props = {
  /** The Debate entity's id, which is also geo-chat's debate id (dashless here). */
  debateEntityId: string;
  /** What the debate is, for the player's accessible name. */
  label: string;
  /**
   * Whether this side is the one the viewer reached for last. The players pause each other through
   * `RANKING_COMPARE_PLAYBACK_GROUP`, so this is the dialog's record only.
   */
  active: boolean;
  /** The viewer reached for this side, by tapping it or pressing its Play. */
  onActivate: () => void;
};

/**
 * The player on each side of the Best debates compare view (GEO-3678): GEO-3687's moments player.
 * It opens on the debate's moments, and on the full debate when the debate has none (or its reel
 * can't be read), so a debate without moments still plays.
 */
export function RankingCompareDebatePlayer({ debateEntityId, label, onActivate }: Props) {
  return (
    // Capture, so the tap that starts this side also makes it the one the dialog marks as playing.
    <div className="overflow-hidden rounded-lg" onPointerDownCapture={onActivate}>
      <DebateMomentsPlayer
        debateId={debateEntityId}
        label={label}
        playbackGroup={RANKING_COMPARE_PLAYBACK_GROUP}
        onPlay={onActivate}
      />
    </div>
  );
}
