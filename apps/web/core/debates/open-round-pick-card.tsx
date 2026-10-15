'use client';

import * as React from 'react';

import cx from 'classnames';

import { Check } from '~/design-system/icons/check';

import type { OpenRoundPick } from './api';
import { LABEL_FONT } from './debate-stamps';

export type OpenRoundPickContext = {
  previousPick: OpenRoundPick | null;
  msSinceCardOpened: number;
};

type OpenRoundPickCardProps = {
  /** The round that just ended, which is the round the pick is for. */
  roundIndex: number;
  /** The pick the server holds for this debater, from `open_rounds.my_pick`. */
  savedPick: OpenRoundPick | null;
  rebuttalTurnMs: number;
  /** What is left of the decision window, on the room's clock. */
  remainingSeconds: number;
  /**
   * Saves the pick. A rejection puts the selection back to `savedPick` and asks for another tap.
   * `context` is for analytics (GEO-3182): what was selected when the pick was tapped, and how long
   * the card had been open.
   */
  onPick: (pick: OpenRoundPick, context: OpenRoundPickContext) => Promise<unknown>;
  localReconnecting: boolean;
  /** The other debater's name while their connection is down, else `null`. */
  reconnectingOpponentName: string | null;
};

/**
 * Extend or End, after every Open rounds round but the cap (GEO-3178), as one dark panel on the seam
 * between the tiles in the stamps design (GEO-3315): the question and its countdown on one line, and
 * the two choices under it. Sized in `cqw` of the tiles' grid.
 *
 * Picks are blind, so the card says nothing about the other debater's pick, not even whether they
 * have made one. It is open for the whole `deciding` phase and closes when the room moves to the
 * result, which the server does as soon as both have picked.
 *
 * The selection shows the pick being saved until the save answers, then the server's `savedPick`.
 * A failed save shows `savedPick` again rather than the pick that did not save.
 */
export function OpenRoundPickCard({
  roundIndex,
  savedPick,
  rebuttalTurnMs,
  remainingSeconds,
  onPick,
  localReconnecting,
  reconnectingOpponentName,
}: OpenRoundPickCardProps) {
  const [requestedPick, setRequestedPick] = React.useState<OpenRoundPick | null>(null);
  const [saveFailed, setSaveFailed] = React.useState(false);
  // Only the latest tap settles the card: an earlier save answering after a later tap must not undo it.
  const latestRequestRef = React.useRef(0);
  // The card is keyed by round, so this is when the round's card opened.
  const [openedAtMs] = React.useState(() => Date.now());
  const headingId = React.useId();

  const selectedPick = requestedPick ?? savedPick;
  const disabled = localReconnecting || remainingSeconds <= 0;

  const pick = (choice: OpenRoundPick) => {
    if (disabled || choice === selectedPick) return;
    const request = ++latestRequestRef.current;
    setRequestedPick(choice);
    setSaveFailed(false);
    onPick(choice, { previousPick: selectedPick, msSinceCardOpened: Date.now() - openedAtMs }).then(
      () => {
        if (request === latestRequestRef.current) setRequestedPick(null);
      },
      () => {
        if (request !== latestRequestRef.current) return;
        setRequestedPick(null);
        setSaveFailed(true);
      }
    );
  };

  const rebuttalSeconds = Math.round(rebuttalTurnMs / 1_000);

  return (
    <section
      aria-labelledby={headingId}
      data-open-round-pick-card={roundIndex}
      className="absolute top-1/2 left-1/2 z-40 grid w-[78%] -translate-x-1/2 -translate-y-1/2 gap-[2.4cqw] rounded-[6px] bg-[#141418] p-[3.4cqw] text-white shadow-[0_2cqw_6cqw_rgba(0,0,0,0.45)] motion-safe:animate-[debateStampFade_150ms_linear_both]"
      style={LABEL_FONT}
    >
      <div className="flex items-center justify-between gap-[2cqw]">
        <h2 id={headingId} className="text-[5.8cqw] leading-none font-medium tracking-[-0.01em]">
          Keep debating?
        </h2>
        <PickCountdown remainingSeconds={remainingSeconds} />
      </div>

      <div role="group" aria-labelledby={headingId} className="grid grid-cols-2 gap-[2.2cqw]">
        <PickChoice
          choice="extend"
          label="Extend"
          detail={`+${rebuttalSeconds}s each`}
          selectedPick={selectedPick}
          disabled={disabled}
          onPick={pick}
        />
        <PickChoice
          choice="end"
          label="End"
          detail="Finish here"
          selectedPick={selectedPick}
          disabled={disabled}
          onPick={pick}
        />
      </div>

      <p role="alert" className="text-[3cqw] leading-tight text-[#FF8A73] empty:hidden">
        {saveFailed ? "Couldn't save your pick. Tap again." : null}
      </p>
      <p role="status" className="text-[3cqw] leading-tight text-white/72 empty:hidden">
        {localReconnecting
          ? "You're reconnecting. Your saved pick still counts."
          : reconnectingOpponentName
            ? `${reconnectingOpponentName} is reconnecting. Their last saved pick still counts.`
            : null}
      </p>
    </section>
  );
}

/**
 * One choice, a solid button: Extend in purple, End in white. The picked one carries a check and an
 * outline, white round Extend and purple round End, and the other dims; either can still be tapped
 * until the window runs out.
 */
function PickChoice({
  choice,
  label,
  detail,
  selectedPick,
  disabled,
  onPick,
}: {
  choice: OpenRoundPick;
  label: string;
  detail: string;
  selectedPick: OpenRoundPick | null;
  disabled: boolean;
  onPick: (choice: OpenRoundPick) => void;
}) {
  const selected = selectedPick === choice;

  return (
    <button
      type="button"
      aria-pressed={selected}
      disabled={disabled}
      onClick={() => onPick(choice)}
      className={cx(
        'grid gap-[1.2cqw] rounded-[4px] px-[2.8cqw] py-[2.6cqw] text-left transition-[opacity,filter] duration-150 enabled:hover:brightness-108 disabled:cursor-default',
        choice === 'extend' ? 'bg-purple text-white' : 'bg-white text-text',
        selected && 'outline-[0.6cqw] outline-offset-[0.6cqw]',
        selected && (choice === 'extend' ? 'outline-white' : 'outline-purple'),
        selectedPick !== null && !selected && 'opacity-35',
        disabled && selectedPick === null && 'opacity-50'
      )}
    >
      <span className="inline-flex items-center gap-[1cqw] text-[4.8cqw] leading-none font-medium">
        {selected && <Check />}
        {label}
      </span>
      <span className="text-[2.8cqw] leading-none opacity-72">{detail}</span>
    </button>
  );
}

/** The decision window's seconds left, in a ringed circle beside the question. */
function PickCountdown({ remainingSeconds }: { remainingSeconds: number }) {
  const seconds = Math.max(0, remainingSeconds);

  return (
    <span className="grid size-[8.4cqw] shrink-0 place-items-center rounded-full text-[3.6cqw] leading-none font-medium tabular-nums shadow-[inset_0_0_0_0.5cqw_rgba(255,255,255,0.85)]">
      <span aria-hidden="true">{seconds}</span>
      <span className="sr-only">{seconds} seconds to pick</span>
    </span>
  );
}
