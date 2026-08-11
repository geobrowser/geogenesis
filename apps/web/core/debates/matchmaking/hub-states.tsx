'use client';

import * as React from 'react';

import { Skeleton } from '~/design-system/skeleton';
import { Text } from '~/design-system/text';

import { GeoChatRequestError } from '../api';
import { HubSwap } from './hub-motion';
import { HubPillButton } from './hub-pill-button';

/**
 * geo-chat ships the matchmaking endpoints separately from this UI, so a 404 is an expected
 * "not deployed yet" state rather than a failure worth surfacing as an error.
 */
export function isMatchmakingUnavailable(error: unknown) {
  return error instanceof GeoChatRequestError && error.status === 404;
}

/**
 * Horizontally neutral: every tab already insets its content by 16px, so self-padding here would
 * double it and make the empty state sit further in than the list it replaces.
 */
export function HubMessage({ children, action }: { children: React.ReactNode; action?: React.ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-3 py-10 text-center">
      <Text as="p" variant="metadata" color="grey-04">
        {children}
      </Text>
      {action}
    </div>
  );
}

type HubQueryStateProps = {
  isLoading: boolean;
  error: unknown;
  isEmpty: boolean;
  emptyMessage: string;
  /** Offered alongside `emptyMessage` — an empty tab should say what to do next. */
  emptyAction?: { label: string; onClick: () => void };
  /** Enables a retry on the error state. */
  onRetry?: () => void;
  children: React.ReactNode;
};

/** Shared loading / unavailable / error / empty handling for every hub tab. */
export function HubQueryState({
  isLoading,
  error,
  isEmpty,
  emptyMessage,
  emptyAction,
  onRetry,
  children,
}: HubQueryStateProps) {
  const state = error ? 'error' : isLoading ? 'loading' : isEmpty ? 'empty' : 'content';

  return (
    <HubSwap activeKey={state}>
      {state === 'error' ? (
        <HubMessage
          action={
            // A "not deployed yet" 404 won't resolve by retrying, so only offer it for real errors.
            isMatchmakingUnavailable(error) || !onRetry ? null : (
              <HubPillButton onClick={onRetry}>Try again</HubPillButton>
            )
          }
        >
          {isMatchmakingUnavailable(error) ? "Matchmaking isn't available yet." : 'Something went wrong.'}
        </HubMessage>
      ) : state === 'loading' ? (
        <HubSkeleton />
      ) : state === 'empty' ? (
        <HubMessage
          action={emptyAction ? <HubPillButton onClick={emptyAction.onClick}>{emptyAction.label}</HubPillButton> : null}
        >
          {emptyMessage}
        </HubMessage>
      ) : (
        children
      )}
    </HubSwap>
  );
}

export function HubSkeleton({ rows = 4 }: { rows?: number }) {
  return (
    <div className="flex flex-col gap-2">
      {Array.from({ length: rows }).map((_, index) => (
        <Skeleton key={index} className="h-12 w-full" />
      ))}
    </div>
  );
}
