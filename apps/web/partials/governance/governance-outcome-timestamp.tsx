'use client';

import * as React from 'react';

import { formatGovernanceOutcomeDate, formatGovernanceOutcomeTime, getViewerTimeZone } from '~/core/utils/utils';

function subscribeToNothing() {
  return () => {};
}

function useViewerTimeZone(): string {
  return React.useSyncExternalStore(subscribeToNothing, getViewerTimeZone, () => 'UTC');
}

type DateProps = {
  geoTimeSeconds: number;
  className?: string;
};

export function GovernanceOutcomeDate({ geoTimeSeconds, className }: DateProps) {
  const timeZone = useViewerTimeZone();
  // v2 contracts don't stamp startTime/endTime until the first vote fires
  if (geoTimeSeconds <= 0) return null;
  return <span className={className}>{formatGovernanceOutcomeDate(geoTimeSeconds, Date.now(), timeZone)}</span>;
}

type TimeProps = {
  geoTimeSeconds: number;
  className?: string;
};

export function GovernanceOutcomeTime({ geoTimeSeconds, className }: TimeProps) {
  const timeZone = useViewerTimeZone();
  if (geoTimeSeconds <= 0) return null;
  return (
    <time className={className} dateTime={new Date(geoTimeSeconds * 1000).toISOString()}>
      {formatGovernanceOutcomeTime(geoTimeSeconds, timeZone)}
    </time>
  );
}
