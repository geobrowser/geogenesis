'use client';

import * as React from 'react';

import { recordingLabelTextShadow } from '~/core/debates/debate-video-tile';
import type { RoundCue } from '~/core/debates/round-cues';

/**
 * The round announced across the speaking debater's tile as their turn opens.
 *
 * The type is the recording room's, moved rather than redesigned: dark text in a white outline,
 * the treatment `debate-video-tile.tsx` gives `Wrap it up!` and every other phrase the debaters
 * themselves see. The two surfaces are showing the same debate, and a second visual language for
 * it would read as a second product.
 *
 * Sized against the tile rather than the viewport. The same component is a feed card, an explore
 * card and a fullscreen player; a breakpoint would get two of the three wrong.
 *
 * `aria-hidden`, and deliberately. The player already names the speaker and the scrubber already
 * carries the time; this is emphasis on a fact the page states, and a screen reader being told it
 * over the top of the speech it is reading out is worse than not being told.
 */
export function DebateRoundCard({ cue }: { cue: RoundCue | null }) {
  if (!cue) return null;

  return (
    <div
      aria-hidden
      data-round-card={cue.label}
      className="pointer-events-none absolute inset-0 z-[12] grid place-items-center px-4 text-center"
      // Driven by the playhead rather than by a CSS animation, because the playhead can jump: a
      // viewer who scrubs into the middle of the card should find it at full strength, not
      // part-way through an animation that started when the element mounted.
      style={{ opacity: cue.opacity }}
    >
      <span
        className="text-[clamp(1.125rem,5.5cqw,1.875rem)] leading-tight font-semibold text-balance text-text"
        style={recordingLabelTextShadow}
      >
        {cue.label}
      </span>
    </div>
  );
}

/**
 * The same label, parked beside the turn timer for the rest of the turn.
 *
 * Wears the timer's own backing rather than the card's outline, and that is the rule: what is
 * transient is outlined type over the picture, what persists sits on a surface. This is standing
 * state about the turn in progress, exactly like the number next to it, so it reads as part of
 * the same instrument.
 *
 * To the *left* of the timer rather than the right: the timer is anchored to the tile's corner
 * and has been since the frame, and a label that displaced it would move the one thing on the
 * tile a viewer learns to look at in a fixed place.
 */
export function DebateRoundBadge({ cue }: { cue: RoundCue | null }) {
  if (!cue) return null;

  return (
    <div
      aria-hidden
      data-round-badge={cue.label}
      className="pointer-events-none absolute top-3 right-13 z-10 flex h-8 max-w-[calc(100%-6rem)] items-center rounded-full bg-linear-to-b from-black/50 to-black/25 px-2.5 text-[0.75rem] leading-none font-medium text-white"
      style={{ opacity: cue.opacity }}
    >
      {/* Truncating rather than wrapping: the badge is one line beside a 32px circle, and a second
          line would push it off the top of the tile. */}
      <span className="truncate">{cue.label}</span>
    </div>
  );
}
