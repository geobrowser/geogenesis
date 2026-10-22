'use client';

import cx from 'classnames';

import { MUTUAL_SLOT, PEER_ONLY_SLOT } from '~/partials/availability/peer-availability';

import { type DebateAnalyticsSurface, debateActionAnalyticsAttributes } from './hub-analytics';

/**
 * A few of an offline person's free times, in the viewer's zone. A pick opens their week with that
 * slot selected, which is where the request is confirmed.
 *
 * For a viewer with hours, the week's own looks say which are shared: green when both are free,
 * dashed when only they are. A viewer with no hours shares nothing, so their chips stay plain.
 */
export function SharedTimes({
  analyticsSurface,
  personName,
  schedule,
  onPick,
  touchSized = false,
}: {
  touchSized?: boolean;
  analyticsSurface: DebateAnalyticsSurface;
  personName: string;
  schedule: { slots: { start: string; viewerIsFree?: boolean }[]; truncated: boolean };
  onPick: (start: string | undefined, opener: HTMLElement) => void;
}) {
  if (schedule.slots.length === 0 && !schedule.truncated) return null;

  return (
    <div className="mt-1 flex flex-wrap items-center gap-1">
      {schedule.slots.map(slot => (
        <button
          key={slot.start}
          type="button"
          aria-label={`Schedule a debate with ${personName} ${formatSlot(slot.start)}${slot.viewerIsFree ? ", you're both free" : ''}`}
          data-viewer-free={slot.viewerIsFree || undefined}
          // Only a time the viewer is free for too is shared, which keeps the series these chips have
          // always fed. A viewer with no hours (`viewerIsFree` unset) shares none.
          {...debateActionAnalyticsAttributes(
            analyticsSurface,
            slot.viewerIsFree ? 'Shared time' : 'Free time',
            'open_peer_availability'
          )}
          onClick={event => onPick(slot.start, event.currentTarget)}
          className={cx(
            'rounded-full border px-2 py-0.5 text-footnote transition-colors hover:border-text',
            touchSized && 'md:min-h-11 md:px-3',
            slot.viewerIsFree === undefined
              ? 'border-grey-02 text-text'
              : slot.viewerIsFree
                ? MUTUAL_SLOT
                : PEER_ONLY_SLOT
          )}
        >
          {formatSlot(slot.start)}
        </button>
      ))}
      {schedule.truncated ? (
        <button
          type="button"
          aria-label={`More times for ${personName}`}
          {...debateActionAnalyticsAttributes(analyticsSurface, 'More times', 'open_peer_availability')}
          onClick={event => onPick(undefined, event.currentTarget)}
          className={cx(
            'px-1 text-footnote text-grey-04 transition-colors hover:text-text',
            touchSized && 'md:min-h-11 md:px-3'
          )}
        >
          More times
        </button>
      ) : null}
    </div>
  );
}

/**
 * "Today 3:00 PM", "Tomorrow 9:30 AM", "Thu 6:00 PM", and "Thu, Oct 22 6:00 PM" a week or more out.
 * A weekday alone names one day only within the coming week: the calendar (GEO-3220) offers two, and
 * there next Thursday would read exactly as this one.
 */
export function formatSlot(iso: string, now: Date = new Date()): string {
  const at = new Date(iso);
  const time = at.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
  const dayDiff = Math.round(
    (new Date(at.getFullYear(), at.getMonth(), at.getDate()).getTime() -
      new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime()) /
      86_400_000
  );
  if (dayDiff === 0) return `Today ${time}`;
  if (dayDiff === 1) return `Tomorrow ${time}`;
  if (dayDiff >= 7) {
    return `${at.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })} ${time}`;
  }
  return `${at.toLocaleDateString(undefined, { weekday: 'short' })} ${time}`;
}
