import * as React from 'react';

import { getRandomArrayItem } from '~/core/utils/utils';

import { Skeleton } from '~/design-system/skeleton';

const POSITIONS = {
  top: ['w-36', 'w-24', 'w-40', 'w-52', 'w-16', 'w-48'],
  bottom: ['w-52', 'w-32', 'w-12', 'w-20', 'w-52', 'w-64'],
};

export function ActivityLoading() {
  return (
    <div className="divide-y divide-divider">
      <SkeletonContainer
        top={<Skeleton className={`${getRandomArrayItem(POSITIONS.top)} h-4`} />}
        bottom={<Skeleton className={`${getRandomArrayItem(POSITIONS.bottom)} h-4`} />}
      />
      <SkeletonContainer
        top={<Skeleton className={`${getRandomArrayItem(POSITIONS.top)} h-4`} />}
        bottom={<Skeleton className={`${getRandomArrayItem(POSITIONS.bottom)} h-4`} />}
      />
      <SkeletonContainer
        top={<Skeleton className={`${getRandomArrayItem(POSITIONS.top)} h-4`} />}
        bottom={<Skeleton className={`${getRandomArrayItem(POSITIONS.bottom)} h-4`} />}
      />
      <SkeletonContainer
        top={<Skeleton className={`${getRandomArrayItem(POSITIONS.top)} h-4`} />}
        bottom={<Skeleton className={`${getRandomArrayItem(POSITIONS.bottom)} h-4`} />}
      />
      <SkeletonContainer
        top={<Skeleton className={`${getRandomArrayItem(POSITIONS.top)} h-4`} />}
        bottom={<Skeleton className={`${getRandomArrayItem(POSITIONS.bottom)} h-4`} />}
      />
    </div>
  );
}

interface Props {
  top: React.ReactNode;
  bottom: React.ReactNode;
}

function SkeletonContainer({ top, bottom }: Props) {
  return (
    <div className="flex flex-col gap-2 py-3">
      <div className="flex w-full items-center justify-between">
        <div className="flex items-center gap-2">
          <Skeleton className="h-4 w-4" />
          {top}
        </div>

        <Skeleton className="h-4 w-20" />
      </div>

      <div className="pl-6">{bottom}</div>
    </div>
  );
}
