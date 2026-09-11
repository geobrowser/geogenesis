'use client';

import * as React from 'react';

import cx from 'classnames';

/**
 * GEO-2819. Says whether the camera is being written to disk, in the same place on the intro
 * screen and in the debate room.
 *
 * Both states are shown deliberately: an absent indicator is ambiguous between "not recording"
 * and "failed to render", so the neutral state is the assurance.
 *
 * `fixed`, because both screens are scroll containers and an `absolute` child scrolls out of view
 * with the content.
 *
 * Rendered inside each screen rather than once above both: the screens are `aria-modal`, so a
 * sibling can be pruned from the accessibility tree entirely. The cost is that the live region
 * remounts at the swap and the transition goes unannounced; a single persistent dialog wrapper
 * would buy both.
 */
export function DebateRecordingStatusPill({ recording }: { recording: boolean }) {
  return (
    <div className="pointer-events-none fixed top-4 left-1/2 z-[1020] -translate-x-1/2">
      <span
        role="status"
        aria-live="polite"
        className={cx(
          'inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-metadata leading-none whitespace-nowrap',
          // Dark text on the red, matching the Ready badge's dark-on-green: white on red-01 is
          // 3.2:1, under the 4.5:1 this indicator of all things should clear.
          recording ? 'border-red-01 bg-red-01 text-text' : 'border-grey-02 bg-white text-grey-04'
        )}
      >
        <span
          aria-hidden
          className={cx(
            'size-2 shrink-0 rounded-full',
            recording ? 'bg-text motion-safe:animate-pulse' : 'border border-grey-03 bg-transparent'
          )}
        />
        {recording ? 'Recording' : 'Not recording'}
      </span>
    </div>
  );
}
