'use client';

import * as React from 'react';

import { recordingLabelTextShadow, recordingOverlayTextShadow } from '~/core/debates/debate-video-tile';
import type { TurnCue } from '~/core/debates/turn-cues';

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
 * The round, parked beside the turn timer.
 *
 * Wears the timer's own backing rather than the phrases' outline, and that is the rule this file
 * follows everywhere: what is *transient* is outlined type over the picture, and what *persists*
 * sits on a surface. The label is persistent state about the turn in progress, exactly like the
 * number next to it, so it reads as part of the same instrument.
 */
export function DebateRoundBadge({ badge }: { badge: { label: string; opacity: number } | null }) {
  if (!badge) return null;

  return (
    <div
      data-round-badge={badge.label}
      className="flex h-8 min-w-0 items-center rounded-full bg-linear-to-b from-black/50 to-black/25 px-2.5 text-[0.75rem] leading-none font-medium text-white"
      style={{ opacity: badge.opacity }}
    >
      <span className="truncate">{badge.label}</span>
    </div>
  );
}
