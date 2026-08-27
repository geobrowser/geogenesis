type ListViewSkeletonProps = {
  /** How many rows to reserve. Pass the block's page size so the block doesn't resize when rows land. */
  items?: number;
};

export const ListViewSkeleton = ({ items = 4 }: ListViewSkeletonProps) => {
  const rows = Array.from({ length: Math.max(items, 1) });

  return (
    // Mirrors `TableBlockListItemsDnd`'s container and `TableBlockListItem`'s 64px avatar.
    <div className="flex flex-col gap-4">
      {rows.map((_, i) => (
        <div key={i} className="flex animate-pulse items-start gap-6 p-1 pr-5">
          <div className="h-16 w-16 shrink-0 rounded-[0.625rem] bg-grey-02" />
          <div className="flex min-w-0 flex-1 flex-col gap-2">
            <div className="h-5 w-1/3 rounded-sm bg-grey-02" />
            <div className="h-3 w-full rounded-sm bg-grey-02" />
            <div className="h-3 w-3/4 rounded-sm bg-grey-02" />
          </div>
        </div>
      ))}
    </div>
  );
};
