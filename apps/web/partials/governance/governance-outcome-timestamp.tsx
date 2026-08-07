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
  return <span className={className}>{formatGovernanceOutcomeDate(geoTimeSeconds, Date.now(), timeZone)}</span>;
}

type TimeProps = {
  geoTimeSeconds: number;
  className?: string;
};

export function GovernanceOutcomeTime({ geoTimeSeconds, className }: TimeProps) {
  const timeZone = useViewerTimeZone();
  return (
    <time className={className} dateTime={new Date(geoTimeSeconds * 1000).toISOString()}>
      {formatGovernanceOutcomeTime(geoTimeSeconds, timeZone)}
    </time>
  );
}
