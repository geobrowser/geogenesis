'use client';

import * as React from 'react';

import cx from 'classnames';

import { Check } from '~/design-system/icons/check';
import { Text } from '~/design-system/text';

import type { OpenRoundPick } from './api';
import { DebateRoomOverlayCard } from './debate-room-overlay-card';
import { COUNTDOWN_WARNING_COLOR } from './recording-countdown-ring';

type OpenRoundPickCardProps = {
  /** The round that just ended, which is the round the pick is for. */
  roundIndex: number;
  /** The pick the server holds for this debater, from `open_rounds.my_pick`. */
  savedPick: OpenRoundPick | null;
  rebuttalTurnMs: number;
  /** What is left of the decision window, on the room's clock. */
  remainingSeconds: number;
  /** How much of the decision window has gone, 0 to 1. */
  progress: number;
  /** Saves the pick. A rejection puts the selection back to `savedPick` and asks for another tap. */
  onPick: (pick: OpenRoundPick) => Promise<unknown>;
  localReconnecting: boolean;
  /** The other debater's name while their connection is down, else `null`. */
  reconnectingOpponentName: string | null;
};

/**
 * Extend or End, after every Open rounds round but the cap (GEO-3178). Shares
 * `DebateRoomOverlayCard` with "Debate again?": same place over the tiles, radius and shadow.
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
  progress,
  onPick,
  localReconnecting,
  reconnectingOpponentName,
}: OpenRoundPickCardProps) {
  const [requestedPick, setRequestedPick] = React.useState<OpenRoundPick | null>(null);
  const [saveFailed, setSaveFailed] = React.useState(false);
  // Only the latest tap settles the card: an earlier save answering after a later tap must not undo it.
  const latestRequestRef = React.useRef(0);
  const headingId = React.useId();

  const selectedPick = requestedPick ?? savedPick;
  const disabled = localReconnecting || remainingSeconds <= 0;

  const pick = (choice: OpenRoundPick) => {
    if (disabled || choice === selectedPick) return;
    const request = ++latestRequestRef.current;
    setRequestedPick(choice);
    setSaveFailed(false);
    onPick(choice).then(
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
    <DebateRoomOverlayCard
      aria-labelledby={headingId}
      data-open-round-pick-card={roundIndex}
      className="w-[calc(100%-1.5rem)] max-w-[318px] gap-2.5 p-3"
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <h2 id={headingId} className="text-smallTitle text-text">
            {selectedPick ? 'Locked in' : 'Keep debating?'}
          </h2>
          <Text as="p" variant="footnote" color="grey-04" className="mt-1">
            {selectedPick
              ? 'You can change it until the reveal.'
              : `Pick in secret. Two Extends unlock Round ${roundIndex + 1}.`}
          </Text>
        </div>
        <PickCountdown remainingSeconds={remainingSeconds} progress={progress} />
      </div>

      <div role="group" aria-labelledby={headingId} className="grid grid-cols-2 gap-2">
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
          detail="Ends here"
          selectedPick={selectedPick}
          disabled={disabled}
          onPick={pick}
        />
      </div>

      <p role="alert" className="text-footnote text-red-01 empty:hidden">
        {saveFailed ? "Couldn't save your pick. Tap again." : null}
      </p>
      <p role="status" className="text-footnote text-grey-04 empty:hidden">
        {localReconnecting
          ? "You're reconnecting. Your saved pick still counts."
          : reconnectingOpponentName
            ? `${reconnectingOpponentName} is reconnecting. Their last saved pick still counts.`
            : null}
      </p>
    </DebateRoomOverlayCard>
  );
}

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
        'flex flex-col items-center gap-0.5 rounded-lg px-2 py-2.5 transition-[transform,opacity] active:scale-[0.97] disabled:cursor-default disabled:opacity-50 disabled:active:scale-100',
        choice === 'extend' ? 'bg-purple text-white shadow-[0_6px_16px_rgba(104,51,255,0.3)]' : 'bg-grey-01 text-text',
        selected && 'outline-[3px] outline-offset-2',
        selected && (choice === 'extend' ? 'outline-[#2a1380]' : 'outline-text'),
        selectedPick !== null && !selected && !disabled && 'opacity-40'
      )}
    >
      <span className="inline-flex items-center gap-1.5 text-smallTitle">
        {selected && <Check />}
        {label}
      </span>
      <span className="text-footnote opacity-85">{detail}</span>
    </button>
  );
}

const ringRadius = 7;
const ringCircumference = 2 * Math.PI * ringRadius;

/** The decision window's countdown, a small ring and the seconds left. Red for the last three. */
function PickCountdown({ remainingSeconds, progress }: { remainingSeconds: number; progress: number }) {
  const seconds = Math.max(0, remainingSeconds);
  const warning = seconds <= 3;
  const left = Math.min(1, Math.max(0, 1 - progress));

  return (
    <span
      className="inline-flex shrink-0 items-center gap-1.5 text-metadataMedium text-grey-04 tabular-nums"
      style={warning ? { color: COUNTDOWN_WARNING_COLOR } : undefined}
    >
      <svg aria-hidden="true" viewBox="0 0 18 18" className="size-[18px]">
        <circle cx="9" cy="9" r={ringRadius} fill="none" stroke="currentColor" strokeOpacity={0.25} strokeWidth="2" />
        <circle
          cx="9"
          cy="9"
          r={ringRadius}
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeDasharray={ringCircumference}
          strokeDashoffset={ringCircumference * (1 - left)}
          transform="rotate(-90 9 9)"
        />
      </svg>
      <span aria-hidden="true">{seconds}s</span>
      <span className="sr-only">{seconds} seconds to pick</span>
    </span>
  );
}
