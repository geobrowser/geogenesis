'use client';

import cx from 'classnames';

import { EntityRowActions } from '~/partials/entity-page/entity-row-actions';

type Props = {
  entityId: string;
  spaceId: string;
  className?: string;
};

/**
 * Browse-only vote actions. Keeping this separate from RankingEntryRow prevents
 * compose rows from bundling controls they never render and lets sortable rows
 * place the interactive buttons outside their drag activator.
 */
export function RankingEntryVoteControls({ entityId, spaceId, className }: Props) {
  return (
    <div
      className={cx('pointer-events-auto shrink-0', className)}
      data-ranking-entry-vote-controls
      onPointerDown={event => event.stopPropagation()}
      onMouseDown={event => event.stopPropagation()}
      onTouchStart={event => event.stopPropagation()}
      onClick={event => event.stopPropagation()}
    >
      <EntityRowActions entityId={entityId} spaceId={spaceId} />
    </div>
  );
}
