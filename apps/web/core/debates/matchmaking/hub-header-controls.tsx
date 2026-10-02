'use client';

import * as React from 'react';

import cx from 'classnames';

import { useDebateActivity, useGeoChatAuth, useUpdateDebateAvailability } from '../hooks';
import { ScheduleButton } from './schedule-button';

/**
 * The hub header's right-hand controls — the schedule calendar, then the "I'm available" switch —
 * shared by the side panel and the full-screen hub so the two cannot drift apart. Both draw nothing
 * signed out. `children` trail them: the panel's Close.
 */
export function HubHeaderControls({
  scheduleButtonRef,
  children,
}: {
  /** The panel's banner sends focus here when it retires. */
  scheduleButtonRef?: React.RefObject<HTMLButtonElement | null>;
  children?: React.ReactNode;
}) {
  return (
    <div className="flex min-w-0 items-center gap-1">
      <ScheduleButton ref={scheduleButtonRef} />
      <AvailabilityToggle />
      {children}
    </div>
  );
}

function AvailabilityToggle() {
  const { authenticated } = useGeoChatAuth();
  const { data: activity } = useDebateActivity(authenticated);
  const updateAvailability = useUpdateDebateAvailability();

  const available = activity?.available_to_debate ?? false;

  if (!authenticated) return null;

  return (
    <button
      type="button"
      data-geo-analytics-label="Debate availability"
      data-geo-analytics-intent="update_debate_availability"
      role="switch"
      // Without this the switch announces "Unavailable, off", which is ambiguous about which way
      // pressing it goes.
      aria-label="Available to debate"
      aria-checked={available}
      disabled={updateAvailability.isPending}
      onClick={() => updateAvailability.mutate(!available)}
      className={cx(
        'flex shrink-0 items-center gap-1.5 rounded-full px-2.5 py-1.5 text-metadataMedium transition-colors disabled:cursor-wait',
        available ? 'bg-green/15 text-green' : 'bg-grey-01 text-grey-04'
      )}
    >
      <span>{available ? "I'm available" : 'Unavailable'}</span>
      <span
        aria-hidden="true"
        className={cx(
          'relative h-4 w-6 shrink-0 rounded-full transition-colors',
          available ? 'bg-green' : 'bg-grey-03'
        )}
      >
        <span
          className={cx(
            'absolute top-0.5 left-0.5 h-3 w-3 rounded-full bg-white transition-transform',
            available && 'translate-x-2'
          )}
        />
      </span>
    </button>
  );
}
