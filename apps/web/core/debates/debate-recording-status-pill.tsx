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
 */
export function DebateRecordingStatusPill({ recording }: { recording: boolean }) {
  return (
    <div className="pointer-events-none absolute top-4 left-1/2 z-50 -translate-x-1/2">
      <span
        role="status"
        aria-live="polite"
        className={cx(
          'inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-metadata leading-none whitespace-nowrap',
          recording ? 'border-red-01 bg-red-01 text-white' : 'border-grey-02 bg-white text-grey-04'
        )}
      >
        <span
          aria-hidden
          className={cx(
            'size-2 shrink-0 rounded-full',
            recording ? 'bg-white motion-safe:animate-pulse' : 'border border-grey-03 bg-transparent'
          )}
        />
        {recording ? 'Recording' : 'Not recording'}
      </span>
    </div>
  );
}
