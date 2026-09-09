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
 * `fixed`, because both screens are scroll containers and an `absolute` child scrolls away with
 * the content — on a phone it left the viewport before the reader reached the "I'm ready" button,
 * which is the one moment they need it.
 *
 * Rendered inside each screen rather than once above both. Once was tempting: the live region
 * would survive the intro → debate swap and the change of state would be announced, instead of
 * arriving in a freshly-mounted region that screen readers do not read out. But both screens are
 * `aria-modal="true"`, which tells assistive technology to treat everything outside the dialog as
 * unavailable — so hoisting it risked the pill not being reachable at all, in either state. Being
 * readable in both states beats being announced at the boundary. Making both true means one
 * persistent dialog wrapper with the screen bodies swapped inside it, which is a bigger change
 * than this indicator should drag along.
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
