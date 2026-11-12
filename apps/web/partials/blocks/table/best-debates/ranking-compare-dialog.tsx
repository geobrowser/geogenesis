'use client';

import * as React from 'react';

import cx from 'classnames';

import { debateAgeLabel } from '~/core/blocks/ranking/best-debate-display';
import type { PlacementChoice, PlacementSearch } from '~/core/blocks/ranking/ranking-placement';

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
      phoneSheet
      onClose={onClose}
      onKeyDown={onKeyDown}
      title="Which was the better debate?"
      subtitle={
        <span aria-live="polite">
          Step {search.step} of about {search.expectedSteps}
          {/* No keyboard on a phone. */}
          <span className="text-grey-03 md:hidden" title="Keys 1 and 2 pick a side, = for about the same">
            {' '}
            · 1 / 2 / =
          </span>
        </span>
      }
    >
      <div className="flex gap-1" aria-hidden>
        {Array.from({ length: search.expectedSteps }, (_, index) => (
          <span
            key={index}
            className={cx('h-[3px] flex-1 rounded-full', index < search.step ? 'bg-text' : 'bg-grey-02')}
          />
        ))}
      </div>
      {/* Two sides with "About the same" between them, like a "vs": side by side on a phone too. */}
      <div className="grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-start gap-5 md:grid-cols-[minmax(0,1fr)_40px_minmax(0,1fr)] md:gap-1">
        {card('new', newDebate, 'This debate', '1')}
        <div className="flex flex-col items-center gap-2 self-center md:mt-[calc((100vw-80px)*0.3)] md:gap-1 md:self-start">
          <span className="text-[12px] text-grey-04 md:hidden">or</span>
          <button
            type="button"
            aria-label="About the same"
            aria-keyshortcuts="="
            onClick={() => onChoose('same')}
            className="flex h-8 items-center rounded-full border border-grey-02 bg-white px-3.5 text-[14px] whitespace-nowrap text-text shadow-[0_1px_2px_rgba(0,0,0,0.08)] transition-colors hover:border-text md:size-10 md:justify-center md:px-0 md:text-[16px]"
          >
            <span className="md:hidden">About the same</span>
            <span className="hidden md:inline" aria-hidden>
              =
            </span>
          </button>
          <span className="hidden text-[10px] text-grey-04 md:inline" aria-hidden>
            Same
          </span>
        </div>
        {card('existing', existingDebate, `#${existingRank} in your ranking`, '2')}
      </div>
    </RankingFlowDialog>
  );
}

/**
 * The video's width from the height the dialog leaves it (Preston, 12 Nov: sized from height, not
 * width): the frame is 480 × 578, 0.83 as wide as it is tall, and the header, the claim, its meta
 * line and the button take about 380px around it.
 */
const COMPARE_PLAYER_STYLE: React.CSSProperties = { maxWidth: 'max(200px, calc((100dvh - 380px) * 0.83))' };

/**
 * One side: the video as the card, its label on it, then the claim (two lines reserved, so both
 * sides' meta lines and buttons line up), debaters · space · age, and a compact "This one". The whole
 * side picks it except the player's own controls.
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
  const meta = [display?.debaters, display?.space?.name, age].filter(Boolean).join(' · ');
  return (
    <div
      className="group mx-auto flex w-full min-w-0 cursor-pointer flex-col gap-3 rounded-[24px] p-1.5 ring-2 ring-transparent transition-shadow hover:ring-grey-02 md:gap-2 md:p-0.5"
      style={COMPARE_PLAYER_STYLE}
      data-testid={`compare-card-${side}`}
      onClick={event => {
        // The player's own controls play, step and switch; everywhere else on the side picks it.
        if ((event.target as Element).closest('section, button')) return;
        onChoose();
      }}
    >
      <Player debateEntityId={debate.entityId} label={title} badge={label} active={active} onActivate={onActivate} />
      <div className="flex flex-col gap-1 px-0.5">
        <p className="m-0 line-clamp-2 min-h-[46px] text-[19px] leading-[23px] font-medium tracking-[-0.5px] text-[#151515] md:min-h-[36px] md:text-[14px] md:leading-[18px]">
          {title}
        </p>
        {meta ? (
          <p className="m-0 line-clamp-2 text-[13px] leading-[17px] text-grey-04 md:text-[11px] md:leading-[14px]">
            {meta}
          </p>
        ) : null}
        <button
          type="button"
          className={cx(
            'mt-1.5 h-9 self-start rounded-full border px-4 text-[15px] font-medium transition-colors md:h-9 md:self-stretch md:text-[14px]',
            side === 'new'
              ? 'border-text bg-text text-white hover:bg-text/90'
              : 'border-grey-02 bg-white text-text hover:border-text'
          )}
          aria-label={`${title} was better`}
          aria-keyshortcuts={keyHint}
          onClick={onChoose}
        >
          This one
        </button>
      </div>
    </div>
  );
}
