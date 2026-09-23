'use client';

import * as React from 'react';

import { type ClaimTally, RUN_LENGTH, TALLY_BURST_MS, TALLY_LINGER_MS } from '~/core/debates/claim-ticker';
import { recordingLabelTextShadow, recordingOverlayTextShadow } from '~/core/debates/debate-video-tile';
import { type TurnCue, cueOpacity } from '~/core/debates/turn-cues';

/**
 * The turn clock, drawn over a finished debate.
 *
 * Everything here is the recording room's, moved rather than redesigned — the outlined phrase and
 * the outlined numeral — because the two surfaces are showing the same debate and a second visual
 * language for it would read as a second product. `debate-video-tile.tsx` owns the shadows; this
 * file owns only where they sit in a feed tile and which of them is up.
 *
 * Two treatments, and only two, which is the whole of the design:
 *
 * - **Numerals** — white, black-outlined, enormous. `GO!` and the count-out. The room's.
 * - **Phrases** — dark, white-outlined, set at a size below the numerals. `Wrap it up!`, `Time!`,
 *   the round card, the hand-off. Also the room's, and the inverse of the numerals so the two can
 *   never be mistaken for one another.
 *
 * Nothing here wears a chip. Chips are for state that persists — the position label, the recording
 * indicator, the debater's name — and a chip that appears for two seconds reads as a notification
 * about the app rather than as part of the debate.
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

  if (cue.kind === 'countdown' || cue.kind === 'go') {
    return (
      <CueLayer kind={cue.kind} style={style}>
        {/* The room sets these at 7.5rem on a tile roughly twice this one's height. `clamp` holds
            the same optical size across a feed card, an explore card and a fullscreen player
            rather than picking one of them and letting the other two be wrong. */}
        <span
          className="text-[clamp(3rem,18cqw,7.5rem)] leading-[0.85] font-bold text-white tabular-nums"
          style={recordingOverlayTextShadow}
        >
          {cue.kind === 'go' ? 'GO!' : cue.seconds}
        </span>
      </CueLayer>
    );
  }

  return (
    <CueLayer kind={cue.kind} style={style}>
      <CuePhrase>
        {cue.kind === 'wrap-up'
          ? 'Wrap it up!'
          : cue.kind === 'time'
            ? 'Time!'
            : cue.kind === 'up-next'
              ? `Up next in ${cue.seconds}s`
              : cue.label}
      </CuePhrase>
    </CueLayer>
  );
}

/** The full-tile layer every cue is drawn on, so they cannot drift apart. */
function CueLayer({
  kind,
  style,
  className,
  children,
}: {
  kind: TurnCue['kind'];
  style: React.CSSProperties;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div
      aria-hidden
      data-turn-cue={kind}
      className={`pointer-events-none absolute inset-0 z-[12] grid place-items-center px-4 text-center ${className ?? ''}`}
      style={style}
    >
      {children}
    </div>
  );
}

/** The room's label treatment: dark type in a white outline, the inverse of the numerals. */
function CuePhrase({ children }: { children: React.ReactNode }) {
  return (
    <span
      className="text-[clamp(1.125rem,5.5cqw,1.875rem)] leading-tight font-semibold text-balance text-text"
      style={recordingLabelTextShadow}
    >
      {children}
    </span>
  );
}

/**
 * The running claim count for one debater, sitting directly on top of their claim card.
 *
 * Stacked with the card rather than parked in a corner of its own. The card is what the number is
 * counting, so a tally anywhere else asks the eye to hold two places at once — and the corner is
 * the one part of the tile that already moves as a unit: it lifts clear of the scrubber, it widens
 * when the backlog opens, and anything that is going to sit above it has to do both.
 *
 * Transient, like every other cue here. A counter that is always up is furniture over somebody's
 * face, and the corner it sits in is empty for most of a debate — which is the resting state the
 * ticker was designed around. So the number arrives with the claim that moved it, says what it is,
 * and goes. `final` is the exception: once the debate is over there is no claim left to cover, and
 * the totals are the last thing the video has to say.
 */
export function DebateClaimTally({ tally, final = false }: { tally: ClaimTally | null; final?: boolean }) {
  if (!tally) return null;

  const chipOpacity = final ? 1 : cueOpacity(tally.ageMs, TALLY_LINGER_MS);
  const burstOpacity = final ? 0 : cueOpacity(tally.ageMs, TALLY_BURST_MS);
  // Rises as it fades, the whole distance over the burst's life. Linear, because it is on screen
  // for well under a second and an easing curve is not legible at that length.
  const burstRisePx = -18 * Math.min(1, tally.ageMs / TALLY_BURST_MS);
  const onARun = !final && tally.run >= RUN_LENGTH;

  return (
    <div
      aria-hidden
      data-claim-tally={tally.count}
      data-claim-run={onARun ? tally.run : undefined}
      // `self-end` so it sits over the card's right edge whatever width the corner is at, and
      // `relative` so the burst can climb out of it without moving the row.
      className="relative flex shrink-0 self-end pb-1"
    >
      <span
        className="absolute right-0 bottom-1 text-[0.875rem] leading-none font-bold text-white tabular-nums"
        style={{
          opacity: burstOpacity,
          transform: `translateY(${burstRisePx}px)`,
          ...recordingOverlayTextShadow,
        }}
      >
        +1
      </span>
      <span
        className="text-[0.9375rem] leading-none font-semibold text-text tabular-nums"
        style={{ opacity: chipOpacity, ...recordingLabelTextShadow }}
      >
        {onARun ? `${tally.run} in a row` : `${tally.count} ${tally.count === 1 ? 'claim' : 'claims'}`}
      </span>
    </div>
  );
}
