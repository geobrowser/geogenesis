import cx from 'classnames';

import type { OpenRoundsRoomPhase } from './open-rounds';

/**
 * Where an Open rounds debate is (GEO-3174): the opening, or rebuttal round N of up to the cap.
 *
 * `roundIndex` is the room's phase, not the server's, so the counter moves with the room's clock.
 * In `result` it is still the round that just resolved, so the counter only advances when the next
 * round's count-in starts, never while both picks are still on screen.
 */
export type DebateRoundIndicatorState = {
  roundIndex: number;
  maxRounds: number;
  /** Whether the round is still running. A finished debate highlights none. */
  current: boolean;
  /** Whether both debaters could still unlock another round. */
  anotherPossible: boolean;
};

export function debateRoundIndicatorState(phase: OpenRoundsRoomPhase, maxRounds: number): DebateRoundIndicatorState {
  const ended = phase.phase === 'finished' || (phase.phase === 'result' && phase.outcome === 'end');
  return {
    roundIndex: phase.roundIndex,
    maxRounds,
    current: phase.phase !== 'finished',
    anotherPossible: !ended && phase.roundIndex < maxRounds,
  };
}

export function debateRoundLabel({
  roundIndex,
  maxRounds,
}: Pick<DebateRoundIndicatorState, 'roundIndex' | 'maxRounds'>) {
  if (roundIndex === 0) return { title: 'Opening', detail: null };
  if (roundIndex >= maxRounds) return { title: `Round ${roundIndex}`, detail: '· last' };
  return { title: `Round ${roundIndex}`, detail: `of ${maxRounds}` };
}

function debateRoundSummary({ roundIndex, maxRounds, anotherPossible }: DebateRoundIndicatorState) {
  const run =
    roundIndex === 0 ? 'No rebuttal rounds yet.' : `${roundIndex} rebuttal round${roundIndex === 1 ? '' : 's'} so far.`;
  const next = anotherPossible ? 'Another round is possible.' : 'No more rounds.';
  const where = roundIndex === 0 ? 'Opening.' : `Round ${roundIndex} of ${maxRounds}.`;
  return `${where} ${run} ${next}`;
}

/** Past five rebuttal rounds the pips halve, so round 10 still fits beside Leave on a 320px phone. */
const compactAfterRounds = 5;

export function DebateRoundIndicator({ state }: { state: DebateRoundIndicatorState }) {
  const { roundIndex, current, anotherPossible } = state;
  const { title, detail } = debateRoundLabel(state);
  const compact = roundIndex > compactAfterRounds;
  const pip = cx('h-1.5 shrink-0 rounded-full bg-text', compact ? 'w-1.5' : 'w-3');
  const now = 'bg-purple! shadow-[0_0_0_2px_rgba(104,51,255,0.18)]';

  return (
    <div data-debate-round-indicator={roundIndex} className="flex min-w-0 items-center gap-2">
      <p className="text-metadataMedium whitespace-nowrap text-text">
        <span aria-hidden="true">
          {title}
          {detail && <span className="font-normal text-grey-04"> {detail}</span>}
        </span>
        <span className="sr-only">{debateRoundSummary(state)}</span>
      </p>
      <span aria-hidden="true" className="flex min-w-0 items-center gap-[3px] overflow-hidden">
        <i data-round-pip="0" className={cx(pip, compact ? 'w-2.5!' : 'w-5!', current && roundIndex === 0 && now)} />
        {Array.from({ length: roundIndex }, (_, index) => index + 1).map(round => (
          <i key={round} data-round-pip={round} className={cx(pip, current && round === roundIndex && now)} />
        ))}
        {anotherPossible && (
          <i
            data-round-pip="next"
            className={cx(
              'h-[7px] shrink-0 rounded-full border-[1.5px] border-dashed border-grey-03',
              compact ? 'w-1.5' : 'w-3'
            )}
          />
        )}
      </span>
    </div>
  );
}
