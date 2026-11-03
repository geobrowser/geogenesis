type ExploreViewSkeletonProps = {
  items?: number;
};

/**
 * A feed of `ExploreFeedCard` placeholders: a meta row, title, description and actions row per card,
 * at roughly a card's ~140px so the swap to real cards doesn't reflow the column. Shaped to match
 * `ExploreFeedCard` by eye, since design-system can't import it from partials/explore.
 */
export const ExploreViewSkeleton = ({ items = 4 }: ExploreViewSkeletonProps) => {
  const cards = Array.from({ length: Math.max(items, 1) });

  return (
    <div className="flex w-full flex-col">
      {cards.map((_, i) => (
        <div
          key={i}
          data-testid="explore-view-skeleton-card"
          className="flex min-h-[140px] animate-pulse flex-col gap-3 border-b border-divider py-4 last:border-b-0"
        >
          {/* Meta row: the space chip and a couple of its segments. */}
          <div className="flex items-center gap-2">
            <div className="h-4 w-4 rounded-full bg-grey-02" />
            <div className="h-3 w-24 rounded-sm bg-grey-02" />
          </div>
          {/* Title and its two-line description. */}
          <div className="flex flex-col gap-2">
            <div className="h-5 w-2/3 rounded-sm bg-grey-02" />
            <div className="h-4 w-full rounded-sm bg-grey-02" />
            <div className="h-4 w-4/5 rounded-sm bg-grey-02" />
          </div>
          {/* The vote / comment row every card body ends on. */}
          <div className="mt-auto flex items-center gap-3">
            <div className="h-7 w-20 rounded-full bg-grey-02" />
            <div className="h-7 w-20 rounded-full bg-grey-02" />
          </div>
        </div>
      ))}
    </div>
  );
};
