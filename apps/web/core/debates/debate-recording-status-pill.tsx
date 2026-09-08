'use client';

import * as React from 'react';

import cx from 'classnames';

/**
 * GEO-2819. Says whether the camera is being written to disk, in the same place on the intro
 * screen and in the debate room.
 *
 * Shown in both states on purpose. An indicator that only appears while recording is ambiguous —
 * its absence could equally mean "not recording" or "it failed to render" — so the neutral state
 * is the assurance and the change between the two is what marks the boundary.
 *
 * Rendered once, above both screens, rather than inside each. `fixed` because both screens are
 * scroll containers and an `absolute` child scrolls away with the content — on a phone it left the
 * viewport before the reader reached the "I'm ready" button, which is the one moment they need it.
 * Mounting it once also means the live region survives the intro → debate swap, so the change of
 * state is announced rather than arriving with a freshly-mounted region that screen readers ignore.
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
