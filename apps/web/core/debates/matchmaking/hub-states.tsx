'use client';

import * as React from 'react';

import { Skeleton } from '~/design-system/skeleton';

import { GeoChatRequestError } from '../api';

/**
 * geo-chat ships the matchmaking endpoints separately from this UI, so a 404 is an expected
 * "not deployed yet" state rather than a failure worth surfacing as an error.
 */
export function isMatchmakingUnavailable(error: unknown) {
  return error instanceof GeoChatRequestError && error.status === 404;
}

export function HubMessage({ children }: { children: React.ReactNode }) {
  return (
    <div className="px-4 py-10 text-center">
      <p className="text-metadata text-grey-04">{children}</p>
    </div>
  );
}

type HubQueryStateProps = {
  isLoading: boolean;
  error: unknown;
  isEmpty: boolean;
  emptyMessage: string;
  children: React.ReactNode;
};

/** Shared loading / unavailable / error / empty handling for every hub tab. */
export function HubQueryState({ isLoading, error, isEmpty, emptyMessage, children }: HubQueryStateProps) {
  if (error) {
    return (
      <HubMessage>
        {isMatchmakingUnavailable(error) ? "Matchmaking isn't available yet." : 'Something went wrong. Try again.'}
      </HubMessage>
    );
  }

  if (isLoading) return <HubSkeleton />;
  if (isEmpty) return <HubMessage>{emptyMessage}</HubMessage>;

  return <>{children}</>;
}

export function HubSkeleton({ rows = 4 }: { rows?: number }) {
  return (
    <div className="flex flex-col gap-2 px-4 py-3">
      {Array.from({ length: rows }).map((_, index) => (
        <Skeleton key={index} className="h-12 w-full" />
      ))}
    </div>
  );
}
