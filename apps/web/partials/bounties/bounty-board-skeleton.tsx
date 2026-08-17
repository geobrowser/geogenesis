import { Skeleton } from '~/design-system/skeleton';

export function BountyBoardCardSkeleton() {
  return (
    <div className="flex min-h-[220px] flex-col rounded-lg border border-grey-02 bg-white p-4">
      <div className="flex items-center justify-between">
        <Skeleton className="h-4 w-24" />
        <Skeleton className="h-5 w-14" />
      </div>
      <Skeleton className="mt-3 h-5 w-3/4" />
      <Skeleton className="mt-2 h-4 w-full" />
      <Skeleton className="mt-1 h-4 w-5/6" />
      <div className="mt-auto flex gap-4 pt-4">
        <Skeleton className="h-4 w-20" />
        <Skeleton className="h-4 w-16" />
      </div>
    </div>
  );
}

export function BountyBoardSkeleton({ cards = 6 }: { cards?: number }) {
  return (
    <div className="grid grid-cols-[repeat(auto-fill,minmax(280px,1fr))] gap-4" aria-busy>
      {Array.from({ length: cards }, (_, i) => (
        <BountyBoardCardSkeleton key={i} />
      ))}
    </div>
  );
}
