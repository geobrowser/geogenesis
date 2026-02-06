export const BulletedListViewSkeleton = () => {
  const items = Array.from({ length: 6 });

  return (
    <div className="space-y-1">
      {items.map((_, i) => (
        <div key={i} className="flex gap-2">
          <div className="mt-1 flex-shrink-0 text-xl leading-none text-grey-03">•</div>
          <div className="h-5 w-48 rounded-sm bg-grey-02" />
        </div>
      ))}
    </div>
  );
};
