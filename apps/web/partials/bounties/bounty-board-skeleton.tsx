import { Skeleton } from '~/design-system/skeleton';

import {
  AVAILABLE_CARD_HEIGHT_PX,
  AVAILABLE_CARD_WIDTH_PX,
  CARD_WIDTH_PX,
  IN_PROGRESS_CARD_HEIGHT_PX,
} from '~/partials/community-tab/bounty-card';

/** Placeholder grid in the Community-tab card dimensions (a mix of available and in-progress sizes). */
export function BountyBoardSkeleton({ cards = 6 }: { cards?: number }) {
  return (
    <div className="flex flex-wrap gap-4" aria-busy>
      {Array.from({ length: cards }, (_, i) =>
        i % 2 === 0 ? (
          <Skeleton
            key={i}
            className="rounded-lg"
            style={{ width: AVAILABLE_CARD_WIDTH_PX, height: AVAILABLE_CARD_HEIGHT_PX }}
          />
        ) : (
          <Skeleton
            key={i}
            className="rounded-lg"
            style={{ width: CARD_WIDTH_PX, height: IN_PROGRESS_CARD_HEIGHT_PX }}
          />
        )
      )}
    </div>
  );
}
