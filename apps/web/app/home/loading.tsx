import { LoadingSkeleton } from './loading-skeleton';

/**
 * Scopes to the page (the list) only. The header, tabs, filter menus and sidebar
 * now live in `layout.tsx`.
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
