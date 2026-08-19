type BulletedListViewSkeletonProps = {
  /** How many rows to reserve. Pass the block's page size so the block doesn't resize when rows land. */
  items?: number;
};

export const BulletedListViewSkeleton = ({ items = 6 }: BulletedListViewSkeletonProps) => {
  const rows = Array.from({ length: Math.max(items, 1) });

  return (
    // Mirrors `TableBlockBulletedListItemsDnd`'s container and `TableBlockBulletedListItem`'s row.
    <div className="flex flex-col">
      {rows.map((_, i) => (
        <div key={i} className="flex w-full animate-pulse gap-2 px-1 py-0.5">
          <div className="mt-1 shrink-0 text-xl leading-none text-grey-03">•</div>
          <div className="mt-1 h-4 w-1/3 rounded-sm bg-grey-02" />
        </div>
      ))}
    </div>
  );
};
