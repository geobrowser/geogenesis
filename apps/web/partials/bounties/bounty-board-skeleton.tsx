import { Skeleton } from '~/design-system/skeleton';

import { BOARD_CARD_HEIGHT_PX, BOARD_CARD_WIDTH_PX } from './board-bounty-card';

/** Placeholder grid in the board's unified card footprint. */
export function BountyBoardSkeleton({ cards = 6 }: { cards?: number }) {
  return (
    <div className="flex flex-wrap gap-4" aria-busy>
      {Array.from({ length: cards }, (_, i) => (
        <Skeleton key={i} className="rounded-lg" style={{ width: BOARD_CARD_WIDTH_PX, height: BOARD_CARD_HEIGHT_PX }} />
      ))}
    </div>
  );
}
