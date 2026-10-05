import { Skeleton } from '~/design-system/skeleton';

/**
 * The rows a space tab shows while its route is fetched.
 */
export function SpaceTabLoadingRows() {
  return (
    <div className="w-full">
      <Skeleton className="h-7 w-48" />
      <div className="mt-6 space-y-3">
        <Skeleton className="h-16 w-full" />
        <Skeleton className="h-16 w-full" />
        <Skeleton className="h-16 w-full" />
        <Skeleton className="h-16 w-full" />
      </div>
    </div>
  );
}
