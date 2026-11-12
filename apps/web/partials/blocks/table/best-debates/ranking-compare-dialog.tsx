'use client';

import * as React from 'react';

import cx from 'classnames';

import { debateAgeLabel } from '~/core/blocks/ranking/best-debate-display';
import type { PlacementChoice, PlacementSearch } from '~/core/blocks/ranking/ranking-placement';

import { DIALOG_ACTION_BUTTON_CLASS_NAME, DIALOG_SECONDARY_ACTION_BUTTON_CLASS_NAME } from '~/design-system/button';

import { useBestDebateRowData } from './best-debate-row';
import { RankingCompareDebatePlayer } from './ranking-compare-debate-player';
import { RankingFlowDialog } from './ranking-flow-dialog';

export type CompareDebate = { entityId: string; name: string };

type Side = 'new' | 'existing';

type Props = {
  newDebate: CompareDebate;
  existingDebate: CompareDebate;
  /** The existing debate's place in the ranker's list, from 1. */
  existingRank: number;
  search: PlacementSearch;
  onChoose: (choice: PlacementChoice) => void;
  onClose: () => void;
  /** Swappable for tests; the compare view's one player component otherwise. */
  Player?: typeof RankingCompareDebatePlayer;
};

/**
 * "Which was the better debate?" (GEO-3678): the debate being placed beside one from the ranker's
 * list, both playable, one at a time. "This one" under each picks it, "About the same" puts the new
 * one straight below. Keys 1, 2 and = do the same. Side by side on a desktop, stacked on a phone.
 */
export function RankingCompareDialog({
  newDebate,
  existingDebate,
  existingRank,
  search,
  onChoose,
  onClose,
  Player = RankingCompareDebatePlayer,
}: Props) {
  const [playing, setPlaying] = React.useState<Side | null>(null);

  // A new comparison starts with nothing playing.
  React.useEffect(() => setPlaying(null), [existingDebate.entityId]);

  const onKeyDown = (event: React.KeyboardEvent) => {
    if (event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement) return;
    const choice: PlacementChoice | null =
      event.key === '1' ? 'new' : event.key === '2' ? 'existing' : event.key === '=' ? 'same' : null;
    if (!choice) return;
    event.preventDefault();
    onChoose(choice);
  };

  const card = (side: Side, debate: CompareDebate, label: string, keyHint: string) => (
    <CompareCard
      key={side}
      side={side}
      debate={debate}
      label={label}
      keyHint={keyHint}
      Player={Player}
      active={playing === side}
      onActivate={() => setPlaying(side)}
      onChoose={() => onChoose(side)}
    />
  );

  return (
    <RankingFlowDialog
      open
      wide
      onClose={onClose}
      onKeyDown={onKeyDown}
      title="Which was the better debate?"
      subtitle={
        <span aria-live="polite">
          Step {search.step} of about {search.expectedSteps} · keys 1, 2 or = for about the same
        </span>
      }
    >
      <div className="flex gap-1" aria-hidden>
        {Array.from({ length: search.expectedSteps }, (_, index) => (
          <span key={index} className={cx('h-1 flex-1 rounded-full', index < search.step ? 'bg-text' : 'bg-grey-02')} />
        ))}
      </div>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-1">
        {card('new', newDebate, 'This debate', '1')}
        {card('existing', existingDebate, `#${existingRank} in your ranking`, '2')}
      </div>
      <div className="flex justify-center">
        <button
          type="button"
          className={cx(DIALOG_SECONDARY_ACTION_BUTTON_CLASS_NAME, '!w-auto')}
          aria-keyshortcuts="="
          onClick={() => onChoose('same')}
        >
          About the same
        </button>
      </div>
    </RankingFlowDialog>
  );
}

/**
 * One side of the compare view (mockup 05): a bordered card with what it is and how old it is, the
 * player, the claim and its debaters and space, and "This one" at the foot so the two line up.
 */
function CompareCard({
  side,
  debate,
  label,
  keyHint,
  Player,
  active,
  onActivate,
  onChoose,
}: {
  side: Side;
  debate: CompareDebate;
  label: string;
  keyHint: string;
  Player: typeof RankingCompareDebatePlayer;
  active: boolean;
  onActivate: () => void;
  onChoose: () => void;
}) {
  const display = useBestDebateRowData(debate.entityId);
  const title = display?.title ?? debate.name;
  const age = debateAgeLabel(display?.createdAtMs ?? null);
  const meta = [display?.debaters, display?.space?.name].filter(Boolean).join(' · ');
  return (
    <div
      className="flex min-w-0 flex-col gap-2 rounded-lg border border-grey-02 p-3"
      data-testid={`compare-card-${side}`}
    >
      <div className="flex items-center justify-between gap-2 text-[12px] leading-[16px] text-grey-04">
        <span>{label}</span>
        {age ? <span className="tabular-nums">{age}</span> : null}
      </div>
      <Player debateEntityId={debate.entityId} label={title} active={active} onActivate={onActivate} />
      <p className="m-0 mt-1 line-clamp-3 text-[17px] leading-[21px] font-semibold text-text">{title}</p>
      {meta ? <p className="m-0 text-[12px] leading-[16px] text-grey-04">{meta}</p> : null}
      <button
        type="button"
        className={cx(
          side === 'new' ? DIALOG_ACTION_BUTTON_CLASS_NAME : DIALOG_SECONDARY_ACTION_BUTTON_CLASS_NAME,
          'mt-auto'
        )}
        aria-label={`${title} was better`}
        aria-keyshortcuts={keyHint}
        onClick={onChoose}
      >
        This one
      </button>
    </div>
  );
}
