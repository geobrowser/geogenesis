'use client';

import * as React from 'react';

import cx from 'classnames';

import { type ClaimTally, TALLY_BURST_MS, TALLY_LINGER_MS } from '~/core/debates/claim-ticker';
import {
  recordingLabelTextShadow,
  recordingOverlayTextShadow,
  tileChipSurface,
} from '~/core/debates/debate-video-tile';
import { type TurnCue, cueOpacity } from '~/core/debates/turn-cues';

/**
 * The turn clock, drawn over a finished debate.
 *
 * Everything here is the recording room's, moved rather than redesigned — the outlined phrase, the
 * outlined numeral, the chip — because the two surfaces are showing the same debate and a second
 * visual language for it would read as a second product. `debate-video-tile.tsx` owns the shadows
 * and the chip fill; this file owns only where they sit in a feed tile and which of them is up.
 *
 * `aria-hidden` throughout, and that is deliberate rather than an omission. The player already
 * announces whose turn it is through the speaker label, the scrubber carries the time, and a
 * screen reader being told "3", "2", "1", "GO!" over the top of the speech it is trying to read
 * out is worse than being told none of it. These cues are emphasis on facts the page already
 * states.
 */
export function DebateTurnCueOverlay({ cue }: { cue: TurnCue | null }) {
  if (!cue) return null;

  // Driven by the playhead rather than by a CSS animation, because the playhead can jump: a
  // viewer who scrubs into the middle of a countdown should find the numeral at full strength,
  // not part-way through an animation that started when the element mounted.
  const style = { opacity: cue.opacity };

  if (cue.kind === 'up-next') {
    return (
      <div
        aria-hidden
        data-turn-cue="up-next"
        // Under the chin rather than in the bottom band: the name, the scrubber and the claim
        // corner are all down there, and this is the one tile region that is reliably empty.
        className="pointer-events-none absolute inset-x-0 top-[62%] z-[12] flex justify-center px-3"
        style={style}
      >
        <span
          className={cx(
            'inline-flex h-4 items-center rounded-full px-1.5 text-[0.75rem] leading-none whitespace-nowrap text-text',
            tileChipSurface
          )}
        >
          Up next in {cue.seconds}s
        </span>
      </div>
    );
  }

  if (cue.kind === 'countdown' || cue.kind === 'go') {
    return (
      <div
        aria-hidden
        data-turn-cue={cue.kind}
        className="pointer-events-none absolute inset-0 z-[12] grid place-items-center"
        style={style}
      >
        {/* The room sets these at 7.5rem on a tile roughly twice this one's height. `clamp` holds
            the same optical size across a feed card, an explore card and a fullscreen player
            rather than picking one of them and letting the other two be wrong. */}
        <span
          className="text-[clamp(3rem,18cqw,7.5rem)] leading-[0.85] font-bold text-white tabular-nums"
          style={recordingOverlayTextShadow}
        >
          {cue.kind === 'go' ? 'GO!' : cue.seconds}
        </span>
      </div>
    );
  }

  return (
    <div
      aria-hidden
      data-turn-cue={cue.kind}
      className="pointer-events-none absolute inset-0 z-[12] grid place-items-center px-4 text-center"
      style={style}
    >
      <span
        className="text-[clamp(1.125rem,5.5cqw,1.875rem)] leading-tight font-semibold text-text"
        style={recordingLabelTextShadow}
      >
        {cue.kind === 'wrap-up' ? 'Wrap it up!' : 'Time!'}
      </span>
    </div>
  );
}

/**
 * The running claim count for one debater, arriving with the claim that moved it.
 *
 * Top-right, under the countdown badge, which is the only corner of a feed tile that is free in
 * every state: the play and mute controls hold the top-left, the name and the scrubber hold the
 * bottom band, and the claim card itself takes the bottom-right.
 *
 * Transient on purpose. A counter that is always up is furniture over somebody's face, and the
 * corner it would occupy is empty for most of a debate — which is the resting state the ticker
 * was designed around. So the number appears when it changes, says what it is, and goes.
 */
export function DebateClaimTally({ tally }: { tally: ClaimTally | null }) {
  if (!tally) return null;

  const chipOpacity = cueOpacity(tally.ageMs, TALLY_LINGER_MS);
  const burstOpacity = cueOpacity(tally.ageMs, TALLY_BURST_MS);
  // Rises as it fades, the whole distance over the burst's life. Linear, because it is on screen
  // for well under a second and an easing curve is not legible at that length.
  const burstRisePx = -22 * Math.min(1, tally.ageMs / TALLY_BURST_MS);

  return (
    <div
      aria-hidden
      data-claim-tally={tally.count}
      className="pointer-events-none absolute top-12 right-3 z-[12] flex flex-col items-end"
    >
      <span
        className="absolute -top-1 right-1 text-[0.8125rem] leading-none font-semibold text-white tabular-nums"
        style={{
          opacity: burstOpacity,
          transform: `translateY(${burstRisePx}px)`,
          ...recordingOverlayTextShadow,
        }}
      >
        +1
      </span>
      <span
        className={cx(
          'inline-flex h-4 items-center rounded-full px-1.5 text-[0.75rem] leading-none whitespace-nowrap text-text tabular-nums',
          tileChipSurface
        )}
        style={{ opacity: chipOpacity }}
      >
        {tally.count} {tally.count === 1 ? 'claim' : 'claims'}
      </span>
    </div>
  );
}
