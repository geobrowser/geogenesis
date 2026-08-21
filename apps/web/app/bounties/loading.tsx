import { Skeleton } from '~/design-system/skeleton';

import { BountyBoardSkeleton } from '~/partials/bounties/bounty-board-skeleton';

export default function Loading() {
  return (
    <div className="mx-auto flex w-full max-w-[1200px] flex-col gap-6">
      <div className="flex flex-col gap-2">
        <Skeleton className="h-9 w-40" />
        <Skeleton className="h-5 w-96" />
      </div>
      <div className="flex flex-wrap gap-2">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-8 w-28" />
        <Skeleton className="h-8 w-24" />
        <Skeleton className="h-8 w-32" />
      </div>
      <BountyBoardSkeleton />
    </div>
  );
}
