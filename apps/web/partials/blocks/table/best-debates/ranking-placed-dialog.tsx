'use client';

import * as React from 'react';

import cx from 'classnames';

import { indexOfEntity } from '~/core/blocks/ranking/ranking-placement';

import { DIALOG_ACTION_BUTTON_CLASS_NAME, DIALOG_SECONDARY_ACTION_BUTTON_CLASS_NAME } from '~/design-system/button';
import { SquareButton } from '~/design-system/button';
import { ChevronDown } from '~/design-system/icons/chevron-down';
import { ChevronUp } from '~/design-system/icons/chevron-up';

import { RankingFlowDialog } from './ranking-flow-dialog';

type Props = {
  entityId: string;
  /** The ranker's whole list as it stands, the placed debate included. */
  orderedIds: readonly string[];
  nameOf: (entityId: string) => string;
  /** The list had drags or placements nobody had published yet; Done publishes them too. */
  withOtherChanges: boolean;
  isSaving: boolean;
  onNudge: (direction: -1 | 1) => void;
  onDone: () => void;
  /** Present only when the ranker started from To rank and more are waiting there. */
  next?: { remaining: number; onRankNext: () => void };
};

/** How many debates either side of the placed one the confirmation shows. */
const NEIGHBOURS = 2;

/**
 * "Placed #21 of 26" (GEO-3678): where the debate landed, with its neighbours and a nudge either
 * way. Done publishes the ballot, nudges and all, as one edit; so does Rank the next one, before it
 * moves on.
 */
export function RankingPlacedDialog({
  entityId,
  orderedIds,
  nameOf,
  withOtherChanges,
  isSaving,
  onNudge,
  onDone,
  next,
}: Props) {
  const at = indexOfEntity(orderedIds, entityId);
  const from = Math.max(0, at - NEIGHBOURS);
  const to = Math.min(orderedIds.length, at + NEIGHBOURS + 1);

  return (
    <RankingFlowDialog
      open
      onClose={() => {
        if (!isSaving) onDone();
      }}
      title={`Placed #${at + 1} of ${orderedIds.length}`}
      subtitle={
        withOtherChanges
          ? 'Done publishes it with your other unpublished changes.'
          : 'Nudge it if it’s not quite right. Done publishes it.'
      }
      footer={
        <>
          {next ? (
            <button
              type="button"
              className={cx(DIALOG_SECONDARY_ACTION_BUTTON_CLASS_NAME, '!w-auto md:!w-full')}
              disabled={isSaving}
              onClick={next.onRankNext}
            >
              Rank the next one · {next.remaining} left
            </button>
          ) : null}
          <button
            type="button"
            className={cx(DIALOG_ACTION_BUTTON_CLASS_NAME, '!w-auto md:!w-full')}
            disabled={isSaving}
            onClick={onDone}
          >
            {isSaving ? 'Publishing…' : 'Done'}
          </button>
        </>
      }
    >
      <ol className="m-0 flex list-none flex-col p-0" data-testid="placed-neighbours">
        {orderedIds.slice(from, to).map((id, offset) => {
          const index = from + offset;
          const isPlaced = index === at;
          return (
            <li
              key={id}
              aria-current={isPlaced ? 'true' : undefined}
              className={cx(
                'flex items-center gap-3 rounded-md px-2 py-2',
                isPlaced ? 'bg-grey-01 font-medium text-text' : 'text-grey-04'
              )}
            >
              <span className="w-8 shrink-0 text-right text-metadata tabular-nums">{index + 1}</span>
              <span className="min-w-0 flex-1 truncate text-metadata">{nameOf(id)}</span>
              {isPlaced ? (
                <span className="flex shrink-0 gap-1">
                  <SquareButton
                    icon={<ChevronUp />}
                    aria-label="Move up"
                    disabled={isSaving || index === 0}
                    onClick={() => onNudge(-1)}
                  />
                  <SquareButton
                    icon={<ChevronDown />}
                    aria-label="Move down"
                    disabled={isSaving || index === orderedIds.length - 1}
                    onClick={() => onNudge(1)}
                  />
                </span>
              ) : null}
            </li>
          );
        })}
      </ol>
    </RankingFlowDialog>
  );
}
