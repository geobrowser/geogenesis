import type * as React from 'react';

/**
 * Dragging an entity from the team column or To rank straight into "Your ranking" (GEO-3678).
 *
 * Native HTML drag and drop, separate from the dnd-kit sorting inside the list: the sources sit in
 * another column with their own scroll, and all a drop needs is an id and an index. Touch devices
 * don't fire these events; on a phone the ranker uses a row's Rank button to place it by comparison
 * instead.
 */
export const RANKING_ENTITY_DRAG_TYPE = 'application/x-geo-ranking-entity';

/** Attribute on each row of the target list, carrying the row's entity id. */
export const RANKING_DROP_ROW_ATTRIBUTE = 'data-ranking-drop-row';

export function rankingEntityDragProps(entityId: string): Pick<
  React.HTMLAttributes<HTMLElement>,
  'draggable' | 'onDragStart'
> & {
  draggable: true;
} {
  return {
    draggable: true,
    onDragStart: event => {
      event.dataTransfer.setData(RANKING_ENTITY_DRAG_TYPE, entityId);
      event.dataTransfer.setData('text/plain', entityId);
      event.dataTransfer.effectAllowed = 'copyMove';
    },
  };
}

export function isRankingEntityDrag(dataTransfer: DataTransfer | null): boolean {
  return Boolean(dataTransfer && Array.from(dataTransfer.types).includes(RANKING_ENTITY_DRAG_TYPE));
}

/**
 * Where a drop at `clientY` lands: before the first row whose vertical middle is below the pointer,
 * or at the end. `rowMiddles` are the rows' middles in list order.
 */
export function dropIndexFromPointer(rowMiddles: readonly number[], clientY: number): number {
  const index = rowMiddles.findIndex(middle => clientY < middle);
  return index === -1 ? rowMiddles.length : index;
}
