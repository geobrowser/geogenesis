'use client';

import * as React from 'react';

import cx from 'classnames';

import type { RoundCue } from '~/core/debates/round-cues';

/**
 * A 2px outline in every direction rather than the four corners the recording room uses.
 *
 * Its `recordingOverlayTextShadow` is sized for the 7.5rem count-in, where corner copies of a
 * stroke that thick overlap into a continuous edge. At this size they do not, and the gaps land on
 * the cardinal points — the top of an "R", the side of an "1" — which reads as a broken outline
 * rather than a thin one. Eight copies close it for the cost of four more shadows.
 *
 * Black, and white type inside it, which is the opposite of the phrase treatment the debaters see.
 * That one is dark type in a white outline and it works because it sits mid-frame over a face; the
 * seam is where the top tile's scrim has run all the way to black, so dark type there leaves the
 * outline holding an empty shape.
 */
const roundCardTextShadow = {
  textShadow:
    '-2px -2px 0 #000, 0 -2px 0 #000, 2px -2px 0 #000, 2px 0 0 #000, 2px 2px 0 #000, 0 2px 0 #000, -2px 2px 0 #000, -2px 0 0 #000, 0 3px 10px rgba(0,0,0,0.55)',
};

/**
 * The round announced across the seam between the two tiles, as the round opens.
 *
 * The seam is the one strip of the player that is never a face, and the strip the subtitle already
 * uses for exactly that reason. A round belongs to both debaters, so its name sits between them
 * rather than over the one who happens to be talking.
 *
 * The subtitle stands down while this is up — the player grants them the same 20 pixels, and two
 * things in one place is one thing nobody reads. It is a fair trade for under two seconds at the
 * top of a round, which is a beat before anyone has said anything worth captioning.
 *
 * Stacked rather than run together on one line, and large. This is a title card, not a caption:
 * it is read from across a room and from the corner of the eye, on a phone in a feed as often as
 * on a laptop. Two short lines centred on the seam carry at a size one long line cannot — the
 * single line had to stay narrow enough not to reach the edges of a 355px tile, which held it to
 * about the size of the subtitle it was replacing.
 *
 * The round on top and its name beneath, largest: the name is the informative half. "Rebuttal" is
 * what tells a viewer why this stretch is worth watching; the number only says how far in they are.
 *
 * Sized against the player rather than the viewport. The same component is a feed card, an explore
 * card and a fullscreen player; a breakpoint would get two of the three wrong.
 *
 * `w-max` with the cap doing the clamping, which is the subtitle's hard-won lesson: an absolutely
 * positioned box at `left: 50%` with an automatic width shrink-to-fits against the space from that
 * point to the container's edge — half the player — so a plain `max-width` wraps the phrase at half
 * the room it appears to have.
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
      className="pointer-events-none absolute top-1/2 left-1/2 z-[21] w-max max-w-[90%] -translate-x-1/2 -translate-y-1/2 px-4 text-center"
      // Driven by the playhead rather than by a CSS animation, because the playhead can jump: a
      // viewer who scrubs into the middle of the card should find it at full strength, not
      // part-way through an animation that started when the element mounted.
      style={{ opacity: cue.opacity }}
    >
      {/* The round alone where the format names no role, at the headline size — a lone small line
          over the seam would read as a stray caption rather than as a card. */}
      <span
        className={cx(
          'block leading-[1.1]',
          cue.role
            ? 'text-[clamp(1.125rem,4.5cqw,1.75rem)] font-semibold text-white/85'
            : 'text-[clamp(1.75rem,7.5cqw,3rem)] font-bold text-white'
        )}
        style={roundCardTextShadow}
      >
        {cue.round}
      </span>
      {cue.role && (
        <span
          className="block text-[clamp(1.75rem,7.5cqw,3rem)] leading-[1.05] font-bold text-white"
          style={roundCardTextShadow}
        >
          {cue.role}
        </span>
      )}
    </div>
  );
}

/**
 * The same label, beside the turn timer — on every turn of the round, not only the one the card
 * announced.
 *
 * Wears the timer's own backing rather than the card's outline, and that is the rule: what is
 * transient is outlined type over the picture, what persists sits on a surface. This is standing
 * state about the turn in progress, exactly like the number next to it, so it reads as part of
 * the same instrument.
 *
 * To the *left* of the timer rather than the right: the timer is anchored to the tile's corner
 * and has been since the frame, and a label that displaced it would move the one thing on the
 * tile a viewer learns to look at in a fixed place.
 *
 * Drawn per tile, so it crosses to the other debater with the turn and sits beside whichever timer
 * is counting.
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
