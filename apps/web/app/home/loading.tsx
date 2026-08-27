import { Skeleton } from '~/design-system/skeleton';

import { GovernanceHomeSidebarSkeleton } from './governance-home-sidebar';
import { LoadingSkeleton } from './loading-skeleton';

export default function Loading() {
  return (
    <div className="mx-auto w-full max-w-[880px]">
      <div className="flex w-full items-center justify-between">
        <Skeleton className="h-9 w-40" />
      </div>
      <div className="mt-8 flex gap-4">
        <Skeleton className="h-8 w-28" />
        <Skeleton className="h-8 w-24" />
      </div>
      <div className="mt-4 flex flex-wrap gap-2">
        <Skeleton className="h-8 w-28" />
        <Skeleton className="h-8 w-32" />
        <Skeleton className="h-8 w-24" />
      </div>
      <div className="mt-4 flex gap-8">
        <div className="w-2/3 space-y-2">
          <LoadingSkeleton />
          <LoadingSkeleton />
          <LoadingSkeleton />
        </div>
        <div className="w-1/3">
          <GovernanceHomeSidebarSkeleton />
        </div>
      </div>
    </div>
  );
}
