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
    <i
      key={round}
      data-round-pip={round}
      className={cx(
        'shrink-0 rounded-full',
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
            : `Round ${roundIndex} of ${maxRounds}. ${roundIndex} rebuttal round${roundIndex === 1 ? '' : 's'} so far.`}{' '}
          {anotherPossible ? 'Another round is possible.' : 'No more rounds.'}
        </span>
      </p>
      <span aria-hidden="true" className="flex min-w-0 items-center gap-[3px] overflow-hidden">
        {pip('opening', 0)}
        {Array.from({ length: roundIndex }, (_, index) => pip('round', index + 1))}
        {anotherPossible && pip('next', 'next')}
      </span>
    </div>
  );
}
