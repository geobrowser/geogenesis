import * as React from 'react';

import cx from 'classnames';

import type { OpenRoundsRoomPhase } from './open-rounds';

/** Past five rebuttal rounds the pips halve, so round 10 still fits beside Leave on a 320px phone. */
const compactAfterRounds = 5;

type PipKind = 'opening' | 'round' | 'next';

const pipWidth: Record<PipKind, { regular: string; compact: string }> = {
  opening: { regular: 'w-5', compact: 'w-2.5' },
  round: { regular: 'w-3', compact: 'w-1.5' },
  next: { regular: 'w-3', compact: 'w-1.5' },
};

/** One round's pip. `data-round-pip` is what tests read the pips by. */
function RoundPip({ round, className }: { round: number | 'next'; className: string }) {
  return <i data-round-pip={round} className={cx('shrink-0 rounded-full', className)} />;
}

/** The pips' row: decoration beside text that already says the count, so hidden from readers. */
function RoundPipRow({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <span aria-hidden="true" className={cx('flex min-w-0 items-center gap-[3px]', className)}>
      {children}
    </span>
  );
}

/**
 * The rounds a finished debate unlocked (GEO-3180), one pip each, in the current text colour so
 * the end card draws them dark and the feed's rounds pill purple. Smaller than the room's counter,
 * which is the row's headline; here they sit beside a label.
 */
export function DebateRoundPips({ rounds, className }: { rounds: number; className?: string }) {
  return (
    <RoundPipRow className={className}>
      {Array.from({ length: rounds }, (_, index) => (
        <RoundPip key={index} round={index + 1} className="h-[5px] w-2 bg-current" />
      ))}
    </RoundPipRow>
  );
}

/** "1 rebuttal round", "3 rebuttal rounds". */
export function rebuttalRoundsLabel(rounds: number) {
  return `${rounds} rebuttal round${rounds === 1 ? '' : 's'}`;
}

/**
 * Where an Open rounds debate is (GEO-3174): the opening, or rebuttal round N of up to the cap, one
 * pip per round run, and a dashed pip while both debaters could still unlock another.
 *
 * `phase` is the room's phase, not the server's, so the counter moves with the room's clock. In
 * `result` its round is still the one that just resolved, so the counter only advances when the
 * next round starts, never while both picks are still on screen.
 */
export function DebateRoundIndicator({ phase, maxRounds }: { phase: OpenRoundsRoomPhase; maxRounds: number }) {
  const { roundIndex } = phase;
  const ended = phase.phase === 'finished' || (phase.phase === 'result' && phase.outcome === 'end');
  const anotherPossible = !ended && roundIndex < maxRounds;
  // A finished debate has no round running, so it highlights none.
  const currentRound = phase.phase === 'finished' ? null : roundIndex;
  const compact = roundIndex > compactAfterRounds;

  const pip = (kind: PipKind, round: number | 'next') => (
    <RoundPip
      key={round}
      round={round}
      className={cx(
        compact ? pipWidth[kind].compact : pipWidth[kind].regular,
        kind === 'next'
          ? 'h-[7px] border-[1.5px] border-dashed border-grey-03'
          : cx('h-1.5', round === currentRound ? 'bg-purple ring-2 ring-purple/20' : 'bg-text')
      )}
    />
  );

  return (
    <div data-debate-round-indicator={roundIndex} className="flex min-w-0 items-center gap-2">
      <p className="text-metadataMedium whitespace-nowrap text-text">
        <span aria-hidden="true">
          {roundIndex === 0 ? 'Opening' : `Round ${roundIndex}`}
          {roundIndex > 0 && (
            <span className="font-normal text-grey-04"> {roundIndex >= maxRounds ? '· last' : `of ${maxRounds}`}</span>
          )}
        </span>
        <span className="sr-only">
          {roundIndex === 0
            ? 'Opening. No rebuttal rounds yet.'
            : `Round ${roundIndex} of ${maxRounds}. ${rebuttalRoundsLabel(roundIndex)} so far.`}{' '}
          {anotherPossible ? 'Another round is possible.' : 'No more rounds.'}
        </span>
      </p>
      <RoundPipRow className="overflow-hidden">
        {pip('opening', 0)}
        {Array.from({ length: roundIndex }, (_, index) => pip('round', index + 1))}
        {anotherPossible && pip('next', 'next')}
      </RoundPipRow>
    </div>
  );
}
