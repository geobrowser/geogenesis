'use client';

import cx from 'classnames';

import { useDebateActivity, useGeoChatAuth, useUpdateDebateAvailability } from '../hooks';

/** The hub header's "I'm available" switch — drawn by both the side panel and the full-screen hub. */
export function AvailabilityToggle() {
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
