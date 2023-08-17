import { Skeleton } from '~/design-system/skeleton';

export default function Loading() {
  return (
    <div className="divide-y divide-divider">
      <SkeletonContainer />
      <SkeletonContainer />
      <SkeletonContainer />
      <SkeletonContainer />
      <SkeletonContainer />
      <SkeletonContainer />
    </div>
  );
}

function SkeletonContainer() {
  return (
    <div className="flex flex-col gap-2 py-3">
      <div className="flex w-full justify-between items-center">
        <div className="flex items-center gap-2">
          <Skeleton className="h-4 w-4" />
          <Skeleton className="w-20 h-4" />
        </div>
      </div>

      <Skeleton className="pl-6 w-52 h-4" />
    </div>
  );
}
