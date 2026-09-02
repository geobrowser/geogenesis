import { LoadingSkeleton } from './loading-skeleton';

/**
 * Page-level loading UI for `/home` navigations. Layout keeps the header and chrome
 * provider.
 */
export default function Loading() {
  return (
    <div className="space-y-2">
      <LoadingSkeleton />
      <LoadingSkeleton />
      <LoadingSkeleton />
    </div>
  );
}
