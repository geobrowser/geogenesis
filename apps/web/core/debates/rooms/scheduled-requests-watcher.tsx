'use client';

import * as React from 'react';

import { useSetAtom } from 'jotai';

import { usePeerAvailabilityEnabled } from '~/core/state/feature-flags';

import { scheduledAwaitingCount, scheduledAwaitingCountAtom } from './scheduled-awaiting';
import { useScheduledDebates } from './scheduling-hooks';

/**
 * Keeps the scheduled-request count current app-wide, not only while the Requests tab is open.
 * Polled, because geo-chat publishes no event for scheduled requests yet.
 */
export function ScheduledRequestsWatcher() {
  // Split so a viewer without scheduling mounts no query at all.
  return usePeerAvailabilityEnabled() ? <ScheduledRequestsPoller /> : null;
}

function ScheduledRequestsPoller() {
  const setCount = useSetAtom(scheduledAwaitingCountAtom);
  const { data } = useScheduledDebates(true);
  const count = scheduledAwaitingCount(data?.requests);

  React.useEffect(() => setCount(count), [count, setCount]);
  // Nothing to show once scheduling goes away, or the badge keeps a number no tab can explain.
  React.useEffect(() => () => setCount(0), [setCount]);

  return null;
}
