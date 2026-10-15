'use client';

import * as React from 'react';

import cx from 'classnames';

import type { RoundCue } from '~/core/debates/round-cues';

import { BANNER_CLASS, LABEL_FONT, TAG_CLASS } from './stamp-styles';

/**
 * The round's label beside the turn timer — on every turn of the round, not only the one the
 * banner announced. The stamps design's square purple tag in the breaks' type (GEO-3314, every
 * format since GEO-3353).
 *
 * To the *left* of the timer rather than the right: the timer is anchored to the tile's corner
 * and has been since the frame, and a label that displaced it would move the one thing on the
 * tile a viewer learns to look at in a fixed place.
 *
 * Drawn per tile, so it crosses to the other debater with the turn and sits beside whichever timer
 * is counting.
 *
 * The one piece of this layer that is *not* `aria-hidden`, and the banner's being hidden is why.
 * Which round it is — and above all whether this is an opening, a rebuttal or a closing — is new
 * information the page states nowhere else: the speaker's name and the scrubber's time say who and
 * when, not what the turn is for. Hiding both surfaces would make the feature sighted-only.
 *
 * Exposed through a `sr-only` twin rather than by unhiding the visual label, the pattern
 * `person-space-icons.tsx` uses: the middle dot is typography, and a screen reader reading it out
 * as "middle dot" is worse than the comma that belongs there. Not a live region either — it sits
 * in the tree to be found by someone browsing the player, and a turn change is not an event worth
 * interrupting them over.
 */
export function DebateRoundBadge({
  cue,
  rightPx,
}: {
  cue: RoundCue | null;
  /** Its distance from the tile's right edge, where a growing turn timer needs it to make room. */
  rightPx?: number;
}) {
  if (!cue) return null;

  return (
    <div
      data-round-badge={cue.label}
      className="pointer-events-none absolute top-3 right-13 z-10 flex h-8 max-w-[calc(100%-6rem)] items-center leading-none font-medium text-white transition-[right] duration-300"
      style={{ opacity: cue.opacity, ...(rightPx !== undefined && { right: rightPx }) }}
    >
      <span className="sr-only">{cue.role ? `${cue.round}, ${cue.role}` : cue.round}</span>
      {/* Truncating rather than wrapping: the badge is one line beside a 32px circle, and a second
          line would push it off the top of the tile. Sized to the player, centred against the
          timer, as the mockup has it. */}
      <span
        aria-hidden
        data-round-tag
        className={cx('truncate', TAG_CLASS, 'text-[2.8cqw] uppercase')}
        style={LABEL_FONT}
      >
        {cue.label}
      </span>
    </div>
  );
}

/**
 * The round announced across the seam as it opens: the breaks' purple banner, "Round 2 · Rebuttal",
 * rolling in, holding and rolling out over the round card's run (GEO-3314, every format since
 * GEO-3353). In Open rounds it announces only the opening, since every later round is announced by
 * its break; a fixed format has no breaks, so it announces each round over its first speaker.
 *
 * The seam is the one strip of the player that is never a face, and the strip the subtitle already
 * uses for exactly that reason. A round belongs to both debaters, so its name sits between them
 * rather than over the one who happens to be talking. The subtitle stands down while this is up:
 * two things in one place is one thing nobody reads, and it is a fair trade for under two seconds at
 * the top of a round.
 *
 * A CSS animation rather than one driven by the playhead's samples, which arrive about four times a
 * second: started from where the playhead stood when the banner went up, so one that appears part
 * way in (a scrub, a late first sample) picks up at the right point, then runs on its own.
 *
 * `aria-hidden`, and deliberately. The round tag beside the timer says the same thing to a screen
 * reader; this is emphasis on a fact the page already states.
 */
export function DebateRoundBanner({ cue }: { cue: RoundCue | null }) {
  if (!cue) return null;
  return <RoundBannerRun key={cue.label} label={cue.label} startAgeMs={cue.ageMs ?? 0} />;
}

function RoundBannerRun({ label, startAgeMs }: { label: string; startAgeMs: number }) {
  // Fixed at mount: re-reading the age from each sample would step the roll back and forth.
  const [delayMs] = React.useState(() => -startAgeMs);
  return (
    <div
      aria-hidden
      data-round-banner={label}
      className="pointer-events-none absolute inset-x-0 top-1/2 z-[21] -translate-y-1/2"
    >
      <div
        // 1800ms is `ROUND_CARD_MS`: Tailwind reads class names from source, so it is written out.
        className={cx(BANNER_CLASS, 'truncate text-[5cqw] motion-safe:animate-[debateBannerInOut_1800ms_linear_both]')}
        style={{ ...LABEL_FONT, animationDelay: `${delayMs}ms` }}
      >
        {label}
      </div>
    </div>
  );
}
