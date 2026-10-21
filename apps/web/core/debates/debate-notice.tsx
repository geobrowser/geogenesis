'use client';

import * as React from 'react';

import { CloseSmall } from '~/design-system/icons/close-small';

/**
 * One grey row in the debate flow: a leading icon, a line of text, an action and a way to wave it
 * away. The claim picker's unmute prompt was the first; the finished debate's publishing row and
 * the room's "Waiting for …" between the last turn and the picker (GEO-3301) draw themselves the
 * same way, so the handoff and the picker read as one flow.
 */
export function DebateNotice({
  icon,
  children,
  action,
  onDismiss,
  dismissAnalyticsLabel,
  'data-testid': testId,
}: {
  icon: React.ReactNode;
  children: React.ReactNode;
  /** The row's one action, right-aligned before the dismiss button. */
  action?: React.ReactNode;
  /** Omitted while there is something the viewer still has to see through. */
  onDismiss?: () => void;
  /** The dismiss button's click-analytics label, which its bare "Dismiss" cannot tell apart. */
  dismissAnalyticsLabel?: string;
  'data-testid'?: string;
}) {
  return (
    <div
      data-testid={testId}
      className="flex min-h-10 items-center gap-2.5 rounded-lg bg-grey-01 py-1.5 pr-1.5 pl-3 text-metadata text-text"
    >
      <span className="flex shrink-0 text-grey-04 [&>svg]:size-4">{icon}</span>
      <div className="flex min-w-0 flex-1 flex-wrap items-center gap-x-2">{children}</div>
      {action}
      {onDismiss ? (
        <button
          type="button"
          onClick={onDismiss}
          aria-label="Dismiss"
          data-geo-analytics-label={dismissAnalyticsLabel}
          className="grid size-7 shrink-0 place-items-center rounded-full text-grey-04 transition-colors hover:text-text"
        >
          <CloseSmall />
        </button>
      ) : null}
    </div>
  );
}
