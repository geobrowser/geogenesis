'use client';

import * as React from 'react';

import cx from 'classnames';

import { debateAgeLabel } from '~/core/blocks/ranking/best-debate-display';
import type { PlacementChoice, PlacementSearch } from '~/core/blocks/ranking/ranking-placement';

import { SpaceThumb } from '~/partials/explore/space-thumb';

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
  /** Back to the previous comparison, its answer undone. Left out on step 1. */
  onBack?: () => void;
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
  onBack,
  onClose,
  Player = RankingCompareDebatePlayer,
}: Props) {
  const [playing, setPlaying] = React.useState<Side | null>(null);

  // A new comparison starts with nothing playing.
  React.useEffect(() => setPlaying(null), [existingDebate.entityId]);

  const onKeyDown = (event: React.KeyboardEvent) => {
    if (event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement) return;
    // Backspace or ← goes back a comparison, except on a slider (the full debate's rail seeks with ←).
    if ((event.key === 'Backspace' || event.key === 'ArrowLeft') && onBack) {
      if ((event.target as Element).closest?.('[role="slider"]')) return;
      event.preventDefault();
      onBack();
      return;
    }
    const choice: PlacementChoice | null =
      event.key === '1' ? 'new' : event.key === '2' ? 'existing' : event.key === '=' ? 'same' : null;
    if (!choice) return;
    event.preventDefault();
    onChoose(choice);
  };

  // One thing hovered at a time: a side (from its selectable area or its bar button) or Same.
  const [hovered, setHovered] = React.useState<Side | 'same' | null>(null);
  const hover = (target: Side | 'same') => (on: boolean) =>
    setHovered(current => (on ? target : current === target ? null : current));
  // Dev-only, while Preston chooses where the bar goes: `?compareBar=top` puts it under the header.
  const [barOnTop] = React.useState(
    () => typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('compareBar') === 'top'
  );
  const newDisplay = useBestDebateRowData(newDebate.entityId);
  const existingDisplay = useBestDebateRowData(existingDebate.entityId);
  const titleOf = (debate: CompareDebate, display: ReturnType<typeof useBestDebateRowData>) =>
    display?.title ?? debate.name;

  const side = (which: Side, debate: CompareDebate, display: ReturnType<typeof useBestDebateRowData>) => (
    <CompareSide
      key={which}
      side={which}
      debate={debate}
      display={display}
      rankLabel={which === 'new' ? 'This debate' : `#${existingRank} in your ranking`}
      shortRankLabel={which === 'new' ? 'This debate' : `Your #${existingRank}`}
      Player={Player}
      active={playing === which}
      hovered={hovered === which}
      onHover={hover(which)}
      onActivate={() => setPlaying(which)}
      onChoose={() => onChoose(which)}
    />
  );

  const choiceBar = (
    <>
      {/* One bar for the choice under both sides, so it never falls below the fold (D1). */}
      <div className="grid shrink-0 grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-2.5 pt-1 md:gap-1.5">
        <ChoiceButton
          filled={hovered === 'new'}
          onMouseEnter={() => hover('new')(true)}
          onMouseLeave={() => hover('new')(false)}
          aria-label={`${titleOf(newDebate, newDisplay)} was better`}
          keyHint="1"
          onClick={() => onChoose('new')}
        >
          <span className="md:hidden">Left was better</span>
          <span className="hidden md:inline">Left</span>
        </ChoiceButton>
        <ChoiceButton
          same
          highlighted={hovered === 'same'}
          onMouseEnter={() => hover('same')(true)}
          onMouseLeave={() => hover('same')(false)}
          aria-label="About the same"
          keyHint="="
          onClick={() => onChoose('same')}
        >
          <span className="md:hidden">About the same</span>
          <span className="hidden md:inline">Same</span>
        </ChoiceButton>
        <ChoiceButton
          filled={hovered === 'existing'}
          onMouseEnter={() => hover('existing')(true)}
          onMouseLeave={() => hover('existing')(false)}
          aria-label={`${titleOf(existingDebate, existingDisplay)} was better`}
          keyHint="2"
          onClick={() => onChoose('existing')}
        >
          <span className="md:hidden">Right was better</span>
          <span className="hidden md:inline">Right</span>
        </ChoiceButton>
      </div>
    </>
  );

  return (
    <RankingFlowDialog
      open
      size="compare"
      phoneSheet
      roundClose
      onClose={onClose}
      onKeyDown={onKeyDown}
      ariaLabel="Which was the better debate?"
      title={
        <>
          <span className="md:hidden">Which was the better debate?</span>
          <span className="hidden md:inline">Which was better?</span>
        </>
      }
      subtitle={
        <span className="flex items-center gap-2.5" aria-live="polite">
          {onBack ? (
            <button
              type="button"
              onClick={onBack}
              aria-keyshortcuts="Backspace ArrowLeft"
              className="-ml-1 flex h-6 items-center gap-1 rounded-full px-1.5 text-smallButton text-text transition-colors hover:bg-grey-01"
            >
              <span aria-hidden>←</span> Back
            </button>
          ) : null}
          <span className="flex gap-1" aria-hidden>
            {Array.from({ length: search.expectedSteps }, (_, index) => (
              <i
                key={index}
                className={cx('h-1 w-[18px] rounded-[2px]', index < search.step ? 'bg-text' : 'bg-grey-02')}
              />
            ))}
          </span>
          Step {search.step} of about {search.expectedSteps}
        </span>
      }
    >
      {barOnTop ? choiceBar : null}
      <div className="grid grid-cols-2 gap-5 pt-1 md:gap-2.5">
        {side('new', newDebate, newDisplay)}
        {side('existing', existingDebate, existingDisplay)}
      </div>
      {barOnTop ? null : choiceBar}
    </RankingFlowDialog>
  );
}

function ChoiceButton({
  filled = false,
  same = false,
  highlighted = false,
  keyHint,
  children,
  ...rest
}: React.ButtonHTMLAttributes<HTMLButtonElement> & {
  filled?: boolean;
  same?: boolean;
  /** Same's own hover: an outline, no fill and no side tinted. */
  highlighted?: boolean;
  keyHint: string;
}) {
  return (
    <button
      type="button"
      aria-keyshortcuts={keyHint}
      className={cx(
        'flex h-[46px] items-center justify-center gap-2 rounded-[14px] border text-button whitespace-nowrap transition-colors md:h-[42px] md:gap-1 md:rounded-[12px] md:text-smallButton',
        filled ? 'border-text bg-text text-white' : 'border-grey-02 bg-white text-text',
        highlighted && 'border-text',
        same && 'px-4 text-grey-04 md:px-2.5',
        same && highlighted && 'text-text'
      )}
      {...rest}
    >
      {children}
      <span
        aria-hidden
        className={cx(
          'rounded-[5px] border px-[5px] text-tag md:hidden',
          filled ? 'border-current text-current opacity-60' : 'border-grey-02 text-grey-04'
        )}
      >
        {keyHint}
      </span>
    </button>
  );
}

/**
 * The video's width from the height the dialog leaves it (sized from height, not width): the frame
 * is 480 × 578, 0.83 as wide as it is tall, and the header, eyebrow, claim and choice bar take about
 * 330px around it.
 */
const COMPARE_PLAYER_STYLE: React.CSSProperties = { maxWidth: 'max(180px, calc((100dvh - 330px) * 0.83))' };

/**
 * One side (D1): an eyebrow (rank chip, space, age), the claim with two lines reserved so both sides
 * line up, then the video as the card. No names or meta under it: the video shows who's debating.
 * Hovering tints the side and fills its button in the bar; a click anywhere on it but the player's
 * controls picks it.
 */
function CompareSide({
  side,
  debate,
  display,
  rankLabel,
  shortRankLabel,
  Player,
  active,
  hovered,
  onHover,
  onActivate,
  onChoose,
}: {
  side: Side;
  debate: CompareDebate;
  display: ReturnType<typeof useBestDebateRowData>;
  rankLabel: string;
  shortRankLabel: string;
  Player: typeof RankingCompareDebatePlayer;
  active: boolean;
  hovered: boolean;
  onHover: (hovered: boolean) => void;
  onActivate: () => void;
  onChoose: () => void;
}) {
  const title = display?.title ?? debate.name;
  const age = debateAgeLabel(display?.createdAtMs ?? null);
  return (
    <div
      className={cx(
        '-m-2.5 flex min-w-0 cursor-pointer flex-col gap-2.5 rounded-[18px] p-2.5 transition-colors md:-m-1.5 md:gap-[7px] md:rounded-[14px] md:p-1.5',
        // The video is the player's alone: no picking, no pointer, no tint from it.
        '[&_section]:cursor-default',
        hovered && 'bg-grey-01'
      )}
      data-testid={`compare-card-${side}`}
      onMouseOver={event => onHover(!(event.target as Element).closest('section'))}
      onMouseLeave={() => onHover(false)}
      onClick={event => {
        // A click on the video plays or pauses it, and only that; anywhere else on the side picks it.
        if ((event.target as Element).closest('section, button')) return;
        onChoose();
      }}
    >
      <div className="mx-auto flex w-full min-w-0 flex-col gap-2.5 md:gap-[7px]" style={COMPARE_PLAYER_STYLE}>
        <div className="flex items-center gap-1.5 overflow-hidden text-footnote whitespace-nowrap text-grey-04">
          <span className="rounded-full bg-grey-01 px-[7px] py-0.5 text-tag text-text">
            <span className="md:hidden">{rankLabel}</span>
            <span className="hidden md:inline">{shortRankLabel}</span>
          </span>
          {display?.space ? (
            <span className="flex min-w-0 items-center gap-1.5 md:hidden">
              <SpaceThumb
                image={display.space.image}
                name={display.space.name}
                className="!size-[9px] !rounded-[3px]"
              />
              <span className="truncate">{display.space.name}</span>
            </span>
          ) : null}
          {age ? (
            <span>
              <span className="md:hidden">{display?.space ? '· ' : ''}</span>
              {age}
            </span>
          ) : null}
        </div>
        <p className="m-0 line-clamp-2 min-h-[2lh] text-button text-balance text-text md:text-breadcrumb">{title}</p>
        <Player debateEntityId={debate.entityId} label={title} active={active} onActivate={onActivate} />
      </div>
    </div>
  );
}
