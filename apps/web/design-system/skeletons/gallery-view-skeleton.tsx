export const GalleryViewSkeleton = () => {
  const items = Array.from({ length: 4 });

  return (
    <div className="grid grid-cols-2 gap-3">
      {items.map((_, i) => (
        <div key={i} className="flex flex-col gap-2 rounded-[17px] p-[5px]">
          <div className="aspect-[2/1] w-full rounded-lg bg-grey-02" />
          <div className="h-5 w-3/4 rounded-sm bg-grey-02" />
          <div className="h-3 w-full rounded-sm bg-grey-02" />
          <div className="h-3 w-4/5 rounded-sm bg-grey-02" />
        </div>
      ))}
    </div>
  );
};
