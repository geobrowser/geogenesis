import { Skeleton } from '~/design-system/skeleton';

import { BOARD_CARD_HEIGHT_PX, BOARD_GRID_CLASS } from './board-bounty-card';

/** Placeholder grid matching the board's fluid columns and unified card height. */
export function BountyBoardSkeleton({ cards = 6 }: { cards?: number }) {
  return (
    <div className={BOARD_GRID_CLASS} aria-busy>
      {Array.from({ length: cards }, (_, i) => (
        <Skeleton key={i} className="rounded-lg" style={{ height: BOARD_CARD_HEIGHT_PX }} />
      ))}
    </div>
  );
}
