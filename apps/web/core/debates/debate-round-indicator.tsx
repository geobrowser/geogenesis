import * as React from 'react';

import cx from 'classnames';

import { type OpenRoundsRoomPhase, openRoundNumber } from './open-rounds';

type PipKind = 'opening' | 'round' | 'required' | 'next';

/** One round's pip. `data-round-pip` is what tests read the pips by. */
function RoundPip({ round, active, className }: { round: number | 'next'; active: boolean; className: string }) {
  return (
    <i
      data-round-pip={round}
      data-current-round={active || undefined}
      className={cx('shrink-0 rounded-full', className)}
    />
  );
}

/** The pips' row: decoration beside text that already says the count, so hidden from readers. */
function RoundPipRow({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <span aria-hidden="true" className={cx('flex min-w-0 items-center gap-[0.8cqw]', className)}>
      {children}
    </span>
  );
}

/** "Round 1 is next.", "Rounds 1 to 2 are next." */
function requiredRoundsToComeLabel(first: number, last: number) {
  return first === last ? `Round ${first} is next.` : `Rounds ${first} to ${last} are next.`;
}

/** "1 rebuttal round", "3 rebuttal rounds". */
export function rebuttalRoundsLabel(rounds: number) {
  return `${rounds} rebuttal round${rounds === 1 ? '' : 's'}`;
}

/**
 * Where an Open rounds debate is (GEO-3174): the opening, or round N of up to the cap, numbered from
 * the opening as Round 1 (`openRoundNumber`), so the cap of rebuttal rounds reads one higher. One
 * pip per round run, a grey pip for each required round still to come (GEO-3258), and a dashed pip
 * while both debaters could still unlock another.
 *
 * `phase` is the room's phase, not the server's, so the counter moves with the room's clock. In
 * `result` its round is still the one that just resolved, so the counter only advances when the
 * next round starts, never while both picks are still on screen.
 */
export function DebateRoundIndicator({
  phase,
  maxRounds,
  requiredRounds = 0,
}: {
  phase: OpenRoundsRoomPhase;
  maxRounds: number;
  /** Rebuttal rounds every debate plays, from `openRoundsRequiredRebuttalRounds`. */
  requiredRounds?: number;
}) {
  const { roundIndex } = phase;
  const ended = phase.phase === 'finished' || (phase.phase === 'result' && phase.outcome === 'end');
  // Required rounds are certain, so they are drawn as coming rather than as possible.
  const requiredToCome = ended ? 0 : Math.max(0, Math.min(requiredRounds, maxRounds) - roundIndex);
  const anotherPossible = !ended && roundIndex + requiredToCome < maxRounds;
  // A finished debate has no round running, so it highlights none.
  const currentRound = phase.phase === 'finished' ? null : roundIndex;

  const pip = (kind: PipKind, round: number | 'next') => (
    <RoundPip
      key={round}
      round={round}
      active={round === currentRound}
      className={cx(
        'w-[2.6cqw]',
        kind === 'next'
          ? 'h-[1.3cqw] border-[0.4cqw] border-dashed border-[#5e5e5b]'
          : kind === 'required'
            ? 'h-[1.3cqw] bg-grey-03'
            : 'h-[1.3cqw] bg-[#1c1c1c]'
      )}
    />
  );

  return (
    <div
      data-debate-round-indicator={roundIndex}
      className="flex min-w-0 items-center gap-[2cqw] text-[3.6cqw] leading-none font-medium text-[#1c1c1c]"
    >
      <p className="whitespace-nowrap">
        <span aria-hidden="true">
          {roundIndex === 0 ? 'Opening' : `Round ${openRoundNumber(roundIndex)}`}
          {roundIndex > 0 && <span className="font-normal text-[#5e5e5b]"> {`of ${openRoundNumber(maxRounds)}`}</span>}
        </span>
        <span className="sr-only">
          {roundIndex === 0
            ? 'Opening. No rebuttal rounds yet.'
            : `Round ${openRoundNumber(roundIndex)} of ${openRoundNumber(maxRounds)}. ${rebuttalRoundsLabel(roundIndex)} so far.`}{' '}
          {requiredToCome > 0 &&
            `${requiredRoundsToComeLabel(openRoundNumber(roundIndex + 1), openRoundNumber(roundIndex + requiredToCome))} `}
          {anotherPossible
            ? requiredToCome > 0
              ? 'More rounds are possible after that.'
              : 'Another round is possible.'
            : 'No more rounds.'}
        </span>
      </p>
      <RoundPipRow className="overflow-hidden">
        {pip('opening', 0)}
        {Array.from({ length: roundIndex }, (_, index) => pip('round', index + 1))}
        {Array.from({ length: requiredToCome }, (_, index) => pip('required', roundIndex + index + 1))}
        {anotherPossible && pip('next', 'next')}
      </RoundPipRow>
    </div>
  );
}
