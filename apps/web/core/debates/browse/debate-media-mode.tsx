'use client';

import * as React from 'react';

import cx from 'classnames';

import type { DebateMoment } from '../moments-player/debate-moments';
import { useDebateMoments } from '../moments-player/use-debate-moments';
import { useInlinePlaybackUnavailable } from './inline-playback';

/**
 * What a debate card's video shows (GEO-3833): the debate's moments one after another, or the full
 * debate's two synchronized recordings. A card with moments starts on them, and the viewer switches
 * with the button at the video's top right. One without any has only the full debate, and no button.
 */
export type DebateMediaMode = 'moments' | 'full';

type ModeChoice = { mode: DebateMediaMode; startSeconds: number | null };

const ON_MOMENTS: ModeChoice = { mode: 'moments', startSeconds: null };

export type DebateMediaModeState = {
  /** The moments to play, or null when the card has only the full debate. */
  reel: DebateMoment[] | null;
  /** The moments read has not settled: the card shows its stills and loads no recording yet. */
  pending: boolean;
  /** What the video shows now. Always `full` without a reel. */
  mode: DebateMediaMode;
  /**
   * Where the full debate starts, in seconds on the recordings' clock: the moment the viewer was
   * watching when they switched, or null for the beginning.
   */
  fullStartSeconds: number | null;
  /** The viewer chose the full debate here, so it plays without waiting for a tap on a held card. */
  fullChosen: boolean;
  showFull: (startSeconds: number | null) => void;
  showMoments: () => void;
};

/**
 * The moments read and the mode for one card.
 *
 * `enabled` is the card's media window (an Explore card near the viewport, a feed card inside its
 * preload window). The read runs only inside it, and the mode goes back to Moments each time the card
 * leaves it, so every card the viewer reaches starts on its moments: the choice belongs to one
 * viewing of one card, not to the feed.
 *
 * Nothing is read where the browser cannot play inline (TikTok): the full player hands over to its
 * combined player there, and there is no reel or button.
 *
 * A reel stays once it has been shown, even if its own Retry re-read fails, so it can say the refresh
 * failed instead of turning into the full player. A first read that fails leaves the full debate.
 */
export function useDebateMediaMode(
  debateId: string,
  { enabled, initialMode = 'moments' }: { enabled: boolean; initialMode?: DebateMediaMode }
): DebateMediaModeState {
  const inlineUnavailable = useInlinePlaybackUnavailable();
  const read = useDebateMoments(debateId, { enabled: enabled && !inlineUnavailable });
  const readyReel = !inlineUnavailable && read.status === 'ready' && read.moments.length > 0 ? read.moments : null;
  const [shownReel, setShownReel] = React.useState(readyReel);
  if (readyReel && readyReel !== shownReel) setShownReel(readyReel);
  const reel = readyReel ?? (!inlineUnavailable && read.status === 'error' ? shownReel : null);
  const pending = !inlineUnavailable && read.status === 'loading';

  // The viewer's choice on this viewing of the card; null until they press the button.
  const [choice, setChoice] = React.useState<ModeChoice | null>(null);
  // Out of the media window: the next viewing starts where every card does.
  if (!enabled && choice !== null) setChoice(null);

  const showFull = React.useCallback((startSeconds: number | null) => setChoice({ mode: 'full', startSeconds }), []);
  const showMoments = React.useCallback(() => setChoice(ON_MOMENTS), []);

  const mode = reel ? (choice?.mode ?? initialMode) : 'full';
  return {
    reel,
    pending,
    mode,
    fullStartSeconds: reel && choice?.mode === 'full' ? choice.startSeconds : null,
    fullChosen: reel !== null && choice?.mode === 'full',
    showFull,
    showMoments,
  };
}

const LABELS: Record<DebateMediaMode, string> = { moments: 'Moments', full: 'Full debate' };

/**
 * The button at the top right of a debate card's video that switches it to whichever of its moments
 * or the full debate it is not showing: "Full debate" on the moments, "Moments" on the full debate.
 * Drawn by whichever player is showing, in the same place and the same style, so it does not move as
 * the video under it changes. The player that draws it moves its own top-right furniture out of its
 * way.
 *
 * `compact` is the ~300px gallery card's (a profile's Activity): the same words, smaller, so the
 * button and the player's top-left controls share the row.
 */
export function DebateMediaModeToggle({
  mode,
  onChange,
  compact = false,
  className,
}: {
  mode: DebateMediaMode;
  onChange: (mode: DebateMediaMode) => void;
  compact?: boolean;
  className?: string;
}) {
  const next: DebateMediaMode = mode === 'moments' ? 'full' : 'moments';
  const label = LABELS[next];
  return (
    <button
      type="button"
      data-debate-media-mode={mode}
      data-geo-analytics-label={label}
      data-geo-analytics-intent="debate_media_mode"
      onClick={() => onChange(next)}
      className={cx(
        'z-[12] flex cursor-pointer items-center rounded-full bg-[#151515]/60 leading-none font-semibold whitespace-nowrap text-white backdrop-blur-sm transition-colors hover:bg-[#151515]/75 focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-white',
        compact ? 'h-7 px-2.5 text-[11px]' : 'h-9 px-3.5 text-[13px]',
        className
      )}
    >
      {label}
    </button>
  );
}
