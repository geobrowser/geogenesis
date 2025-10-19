import { Suspense } from 'react';

import { Skeleton } from '~/design-system/skeleton';

import { ActivityServerContainer } from '~/partials/activity/activity-server-container';

interface Props {
  params: Promise<{ id: string }>;
}

export default async function Activity(props: Props) {
  const params = await props.params;

  return (
    <Suspense fallback={<ActivitySkeleton />}>
      <ActivityServerContainer spaceId={params.id} />
    </Suspense>
  );
}

const ActivitySkeleton = () => {
  return (
    <div className="divide-y divide-divider">
      {new Array(3).fill(0).map(i => (
        <div key={i} className="flex items-center gap-5 py-4">
          <div>
            <Skeleton className="size-10 rounded-md" />
          </div>
          <div className="flex-1">
            <Skeleton className="h-[21px] w-1/2" />
            <Skeleton className="mt-1 h-[32px] w-3/4" />
            <Skeleton className="mt-3 h-[15px] w-1/4" />
          </div>
        </div>
      ))}
    </div>
  );
};
