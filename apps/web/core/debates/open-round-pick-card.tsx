'use client';

import * as React from 'react';

import cx from 'classnames';

import type { OpenRoundPick } from './api';
import { ROOM_LABEL_FONT, ROOM_UI_FONT, ROOM_WHITE_GLASS_CLASS } from './debate-room-stamps';

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
 * between the tiles in the classic + glass design (GEO-3366): the question and its countdown on one line, and
 * the two choices under it. Sized in `cqw` of the tiles' grid.
 *
 * Picks are blind, so the card says nothing about the other debater's pick, not even whether they
 * have made one. It is open for the whole `deciding` phase and closes when the room moves to the
 * result, which the server does as soon as both have picked.
 *
 * Keep the latest local choice through a successful save and stale polling responses. The card is
 * keyed by round, so it resets with the next decision window. A failed switch returns to the last
 * acknowledged pick, even before the query cache catches up.
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
  const acknowledgedPickRef = React.useRef({ request: 0, pick: savedPick });
  // The card is keyed by round, so this is when the round's card opened.
  const [openedAtMs] = React.useState(() => Date.now());
  const headingId = React.useId();

  const selectedPick = requestedPick ?? savedPick;
  const disabled = localReconnecting || remainingSeconds <= 0;

  const pick = (choice: OpenRoundPick) => {
    if (disabled || choice === selectedPick) return;
    if (latestRequestRef.current === 0) acknowledgedPickRef.current.pick = savedPick;
    const request = ++latestRequestRef.current;
    setRequestedPick(choice);
    setSaveFailed(false);
    onPick(choice, { previousPick: selectedPick, msSinceCardOpened: Date.now() - openedAtMs }).then(
      result => {
        // `null` means the decision window resolved before this pick could count.
        if (result === null) {
          if (request === latestRequestRef.current) setRequestedPick(acknowledgedPickRef.current.pick);
        } else if (request > acknowledgedPickRef.current.request) {
          acknowledgedPickRef.current = { request, pick: choice };
        }
      },
      () => {
        if (request !== latestRequestRef.current) return;
        setRequestedPick(acknowledgedPickRef.current.pick);
        setSaveFailed(true);
      }
    );
  };

  const rebuttalSeconds = Math.round(rebuttalTurnMs / 1_000);

  return (
    <section
      aria-labelledby={headingId}
      data-open-round-pick-card={roundIndex}
      className={cx(
        'pointer-events-auto absolute top-1/2 left-1/2 z-40 grid w-[78%] -translate-x-1/2 -translate-y-1/2 justify-items-center gap-[3cqw] rounded-[5cqw] bg-[rgba(30,30,34,0.55)] px-[3.4cqw] pt-[3.4cqw] pb-[3.8cqw] text-white shadow-[inset_0_0_0_1px_rgba(255,255,255,0.16),0_2cqw_6cqw_rgba(0,0,0,0.3)] backdrop-blur-[18px] backdrop-saturate-[1.3]',
        'animate-[fadeIn_250ms_linear_both]'
      )}
      style={ROOM_UI_FONT}
    >
      <div className="flex items-center gap-[2.4cqw]">
        <h2 id={headingId} className="text-[7cqw] leading-[0.95] font-bold tracking-[-0.02em]">
          Keep debating?
        </h2>
        <PickCountdown remainingSeconds={remainingSeconds} />
      </div>

      <div role="group" aria-labelledby={headingId} className="flex gap-[2.4cqw]">
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
 * Two glass choices. The picked one turns white with a check, and the other dims; either can be tapped
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
      aria-label={`${label} ${detail}`}
      style={ROOM_LABEL_FONT}
      disabled={disabled}
      onClick={() => onPick(choice)}
      className={cx(
        'grid justify-items-center gap-[0.8cqw] rounded-full border-0 px-[4.4cqw] py-[2.2cqw] transition-[opacity,filter] duration-150 enabled:hover:brightness-108 disabled:cursor-default',
        selected
          ? [ROOM_WHITE_GLASS_CLASS, 'shadow-[0_0_0_0.5cqw_rgba(255,255,255,0.35)]']
          : 'bg-black/66 text-white shadow-[inset_0_0_0_1px_rgba(255,255,255,0.3)]',
        selectedPick !== null && !selected && 'opacity-40',
        disabled && selectedPick === null && 'opacity-50'
      )}
    >
      <span className="text-[4.6cqw] leading-none font-bold" style={ROOM_UI_FONT}>
        {selected ? `✓ ${label}` : label}
      </span>
      <span className="text-[2.6cqw] leading-none font-normal opacity-75" style={ROOM_UI_FONT}>
        {detail}
      </span>
    </button>
  );
}

/** The decision window's seconds left, in a ringed circle beside the question. */
function PickCountdown({ remainingSeconds }: { remainingSeconds: number }) {
  const seconds = Math.max(0, remainingSeconds);

  return (
    <span
      className="grid size-[7cqw] shrink-0 place-items-center rounded-full bg-black/50 text-[3cqw] leading-none font-medium shadow-[inset_0_0_0_0.5cqw_rgba(255,255,255,0.85)]"
      style={ROOM_LABEL_FONT}
    >
      <span aria-hidden="true">{seconds}</span>
      <span className="sr-only">{seconds} seconds to pick</span>
    </span>
  );
}
