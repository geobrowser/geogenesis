type ExploreViewSkeletonProps = {
  items?: number;
};

/**
 * A feed of claim-card placeholders, at the height a mounted `ClaimExploreFeedCard` takes, so the swap
 * to real cards doesn't reflow the column. Like the real card, each one is an `@container` and switches
 * on `claim-card-narrow`: about 140px side by side, with the verdict in a 220px column behind a rule,
 * and about 208px stacked, with the verdict below the pills. The body's height is fixed rather than
 * left to its contents, so the shapes inside can't push a card past the real one.
 */
export const ExploreViewSkeleton = ({ items = 4 }: ExploreViewSkeletonProps) => {
  const cards = Array.from({ length: Math.max(items, 1) });

  return (
    <div className="flex w-full flex-col">
      {cards.map((_, i) => (
        <div
          key={i}
          data-testid="explore-view-skeleton-card"
          className="@container animate-pulse border-b border-divider py-4 last:border-b-0"
        >
          <div
            data-testid="explore-view-skeleton-body"
            className="grid h-[107px] grid-cols-[minmax(0,1fr)_220px] gap-x-6 overflow-hidden claim-card-narrow:h-[175px] claim-card-narrow:grid-cols-1 claim-card-narrow:gap-y-4"
          >
            <div className="col-start-1 row-start-1 mb-3 flex items-center gap-2 claim-card-narrow:mb-0">
              <div className="h-4 w-4 rounded-full bg-grey-02" />
              <div className="h-3 w-24 rounded-sm bg-grey-02" />
            </div>
            <div className="col-start-1 row-start-2 h-5 w-2/3 rounded-sm bg-grey-02" />
            {/* The two position pills. */}
            <div className="col-start-1 row-start-3 mt-3 flex items-center gap-3 claim-card-narrow:mt-0">
              <div className="h-7 w-24 rounded-full bg-grey-02" />
              <div className="h-7 w-24 rounded-full bg-grey-02" />
            </div>
            <div className="col-start-2 row-span-3 row-start-1 flex flex-col gap-3 border-l border-divider pl-6 claim-card-narrow:col-start-1 claim-card-narrow:row-span-1 claim-card-narrow:row-start-4 claim-card-narrow:border-l-0 claim-card-narrow:pl-0">
              <div className="h-8 w-20 rounded-sm bg-grey-02 claim-card-narrow:hidden" />
              <div className="h-1.5 w-full rounded-full bg-grey-02" />
              <div className="h-3 w-3/4 rounded-sm bg-grey-02" />
            </div>
          </div>
        </div>
      ))}
    </div>
  );
};
