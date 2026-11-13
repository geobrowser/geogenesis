'use client';

import * as React from 'react';

import cx from 'classnames';

import { indexOfEntity } from '~/core/blocks/ranking/ranking-placement';

import { DIALOG_ACTION_BUTTON_CLASS_NAME, DIALOG_SECONDARY_ACTION_BUTTON_CLASS_NAME } from '~/design-system/button';
import { SquareButton } from '~/design-system/button';
import { ChevronDown } from '~/design-system/icons/chevron-down';
import { ChevronUp } from '~/design-system/icons/chevron-up';

import { BestDebateMeta, BestDebateThumb, useBestDebateRowData } from './best-debate-row';
import { RankingFlowDialog } from './ranking-flow-dialog';

type Props = {
  entityId: string;
  /** The ranker's whole list as it stands, the placed debate included. */
  orderedIds: readonly string[];
  nameOf: (entityId: string) => string;
  /** The list had drags or placements nobody had published yet; Done publishes them too. */
  withOtherChanges: boolean;
  /**
   * Done publishes (a single-debate entry point). Off on the ranking screen, where the placement
   * goes into the draft and the screen's Publish sends it with everything else.
   */
  publishesOnDone?: boolean;
  /** The last Done or Rank the next one didn't go out; the placement is still in the draft. */
  publishFailed: boolean;
  isSaving: boolean;
  onNudge: (direction: -1 | 1) => void;
  /** Publishes, then closes. */
  onDone: () => void;
  /** Closes without publishing: the placement stays as an unpublished change. Never blocked. */
  onClose: () => void;
  /** Present only when the ranker started from To rank and more are waiting there. */
  next?: { remaining: number; onRankNext: () => void };
};

/** How many debates either side of the placed one the confirmation shows. */
const NEIGHBOURS = 2;
/** On a short screen (an iPhone SE is 667px): one either side, so the sheet fits without scrolling. */
const SHORT_SCREEN_NEIGHBOURS = 1;
const SHORT_SCREEN_QUERY = '(max-height: 720px)';

function useNeighbourCount(): number {
  const [short, setShort] = React.useState(
    () => typeof window !== 'undefined' && Boolean(window.matchMedia?.(SHORT_SCREEN_QUERY).matches)
  );
  React.useEffect(() => {
    const query = window.matchMedia?.(SHORT_SCREEN_QUERY);
    if (!query) return;
    const update = () => setShort(query.matches);
    update();
    query.addEventListener?.('change', update);
    return () => query.removeEventListener?.('change', update);
  }, []);
  return short ? SHORT_SCREEN_NEIGHBOURS : NEIGHBOURS;
}

/**
 * "Placed #21 of 26" (GEO-3678): where the debate landed, with its neighbours and a nudge either
 * way. Done publishes the ballot, nudges and all, as one edit; so does Rank the next one, before it
 * moves on. Close, Escape and the backdrop only close it: the placement stays in the draft and the
 * screen's Publish sends it.
 */
export function RankingPlacedDialog({
  entityId,
  orderedIds,
  nameOf,
  withOtherChanges,
  publishesOnDone = false,
  publishFailed,
  isSaving,
  onNudge,
  onDone,
  onClose,
  next,
}: Props) {
  const neighbours = useNeighbourCount();
  const at = indexOfEntity(orderedIds, entityId);
  const from = Math.max(0, at - neighbours);
  const to = Math.min(orderedIds.length, at + neighbours + 1);

  return (
    <RankingFlowDialog
      open
      phoneSheet
      onClose={onClose}
      title={`Placed #${at + 1} of ${orderedIds.length}`}
      subtitle={
        !publishesOnDone
          ? 'Added to your draft, not published yet. Nudge it if it’s not quite right, then publish when you’re done ranking.'
          : withOtherChanges
            ? 'Done publishes it with your other unpublished changes.'
            : 'Nudge it if it’s not quite right. Done publishes it.'
      }
      footer={
        <>
          {next ? (
            <button
              type="button"
              className={cx(DIALOG_SECONDARY_ACTION_BUTTON_CLASS_NAME, '!w-auto md:!w-full')}
              disabled={publishesOnDone && isSaving}
              onClick={next.onRankNext}
            >
              Rank the next one · {next.remaining} left
            </button>
          ) : null}
          <button
            type="button"
            className={cx(DIALOG_ACTION_BUTTON_CLASS_NAME, '!w-auto md:!w-full')}
            disabled={publishesOnDone && isSaving}
            onClick={onDone}
          >
            {publishesOnDone && isSaving ? 'Publishing…' : 'Done'}
          </button>
        </>
      }
    >
      {publishFailed ? (
        <p role="alert" className="m-0 text-metadata text-red-01">
          Your ranking wasn’t published. Try again, or close this and publish it later.
        </p>
      ) : null}
      <ol className="m-0 flex list-none flex-col p-0" data-testid="placed-neighbours">
        {orderedIds.slice(from, to).map((id, offset) => {
          const index = from + offset;
          const isPlaced = index === at;
          return (
            <PlacedRow
              key={id}
              entityId={id}
              place={index + 1}
              name={nameOf(id)}
              isPlaced={isPlaced}
              canMoveUp={!isSaving && index > 0}
              canMoveDown={!isSaving && index < orderedIds.length - 1}
              onNudge={onNudge}
            />
          );
        })}
      </ol>
    </RankingFlowDialog>
  );
}

/** One line of the Placed list (mockup 13): place, claim, debaters · age; the placed one tinted. */
function PlacedRow({
  entityId,
  place,
  name,
  isPlaced,
  canMoveUp,
  canMoveDown,
  onNudge,
}: {
  entityId: string;
  place: number;
  name: string;
  isPlaced: boolean;
  canMoveUp: boolean;
  canMoveDown: boolean;
  onNudge: (direction: -1 | 1) => void;
}) {
  const display = useBestDebateRowData(entityId);
  const ref = React.useRef<HTMLLIElement | null>(null);
  // If the list still scrolls, the placed row is the one in view (and stays so through nudges).
  React.useEffect(() => {
    if (isPlaced) ref.current?.scrollIntoView?.({ block: 'nearest' });
  }, [isPlaced, place]);
  return (
    <li
      ref={ref}
      aria-current={isPlaced ? 'true' : undefined}
      className={cx('flex items-center gap-4 rounded-lg py-3', isPlaced ? 'bg-purple-tint px-3' : 'px-0.5')}
    >
      <span className="w-6 shrink-0 text-center text-button text-text tabular-nums">{place}</span>
      <BestDebateThumb entityId={entityId} keyframeUrl={display?.keyframeUrl ?? null} label={display?.title ?? name} />
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <span className="line-clamp-2 text-button text-text">{display?.title ?? name}</span>
        <BestDebateMeta data={display} showSpace={false} />
      </div>
      {isPlaced ? (
        <span className="flex shrink-0 flex-col gap-0.5">
          <SquareButton
            icon={<ChevronUp />}
            aria-label="Move up"
            disabled={!canMoveUp}
            onClick={() => onNudge(-1)}
            className="md:!size-11"
          />
          <SquareButton
            icon={<ChevronDown />}
            aria-label="Move down"
            disabled={!canMoveDown}
            onClick={() => onNudge(1)}
            className="md:!size-11"
          />
        </span>
      ) : null}
    </li>
  );
}
