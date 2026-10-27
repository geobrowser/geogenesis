'use client';

import * as React from 'react';

import cx from 'classnames';

import { type DebateAnalyticsSurface, debateSurfaceAnalyticsAttributes } from './hub-analytics';

type Props = {
  variant?: 'primary' | 'secondary';
  size?: HubPillSize;
  /** Swapped in while a mutation is in flight, so the press has visible feedback. */
  pendingLabel?: string;
  pending?: boolean;
  /** Stable auto-capture label; string children are used when omitted. */
  analyticsLabel?: string;
  /** Owning surface for shared controls; hub-only callers can use the default. */
  analyticsSurface?: DebateAnalyticsSurface;
  /** Explicit override for exceptional actions with a more specific intent. */
  analyticsIntent?: string;
  // With the ref, which React 19 passes as a prop: an opener that takes focus back on close needs it.
} & React.ComponentProps<'button'>;

/**
 * The debates feature has its own pill style — `rounded-full`, `h-7`, `text-metadata` — shared with
 * the request dialog, challenge dialog, and profile debate button. The design system's Button is a
 * bordered rounded-rect, so matching it here would make the hub the odd one out. This just
 * collapses the six hand-written copies of that pill into one.
 */
/**
 * The pill's classes, for the one place the hub needs a pill that is not a button: a link, such as
 * "Join debate". Kept here so the two cannot drift. `tag` is the secondary look without its hover,
 * for a pill that holds a value rather than acting on a press, like a picked claim list.
 */
/**
 * `large` is the full-width choice a dialog of its own leads with, a thumb's height on a phone: the
 * Running late and Can't make it screens (GEO-3427). Everything else is the hub's `default`.
 */
/**
 * `compact` is the Requests timeline's inline actions (GEO-3463): 26px and 14px on desktop, as the
 * schedule board draws them, and the phone sheet's 32px.
 */
export type HubPillSize = 'default' | 'large' | 'compact';

const PILL_SIZE: Record<HubPillSize, string> = {
  default: 'h-7 px-3 text-metadata',
  large: 'h-12 px-5 text-button',
  compact: 'h-[26px] px-2.5 text-breadcrumb md:h-8 md:px-3',
};

export function hubPillClassName(
  variant: 'primary' | 'secondary' | 'tag' = 'secondary',
  className?: string,
  size: HubPillSize = 'default'
) {
  return cx(
    // A fixed height, so a label that wraps to a second line spills out of the pill.
    // nowrap is what prevents that: it makes min-content equal max-content, and a flex item's
    // default `min-width: auto` then stops the row from squeezing the pill at all — the name
    // beside it absorbs the shrinking instead, which is why rows give it `min-w-0 truncate`.
    // shrink-0 is redundant today and kept only to survive a later `min-w-0` on this button,
    // which would defeat the `min-width: auto` this leans on.
    'inline-flex shrink-0 items-center justify-center rounded-full whitespace-nowrap transition-colors disabled:opacity-50',
    PILL_SIZE[size],
    variant === 'primary'
      ? 'bg-text text-white hover:bg-text/90'
      : cx('border border-grey-02 text-text', variant === 'secondary' && 'hover:bg-grey-01'),
    className
  );
}

/**
 * The hub's round icon control — Close, See times, the schedule calendar. Text-free, so it sits
 * beside a pill without competing with it. One definition because the copies had started to spread.
 */
export const HUB_ICON_BUTTON_CLASS_NAME =
  'flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-grey-04 transition-colors hover:bg-grey-01 hover:text-text';

export function HubPillButton({
  variant = 'secondary',
  size = 'default',
  pendingLabel,
  pending = false,
  analyticsLabel,
  analyticsSurface = 'hub',
  analyticsIntent,
  disabled,
  className,
  children,
  ...rest
}: Props) {
  const surfaceAnalytics = debateSurfaceAnalyticsAttributes(
    analyticsSurface,
    typeof children === 'string' ? children : 'action'
  );
  const resolvedAnalyticsLabel = analyticsLabel ?? rest['aria-label'] ?? surfaceAnalytics['data-geo-analytics-label'];

  return (
    <button
      type="button"
      data-geo-analytics-label={resolvedAnalyticsLabel}
      data-geo-analytics-intent={analyticsIntent ?? surfaceAnalytics['data-geo-analytics-intent']}
      disabled={disabled || pending}
      aria-busy={pending || undefined}
      className={hubPillClassName(variant, className, size)}
      {...rest}
    >
      {pending && pendingLabel ? pendingLabel : children}
    </button>
  );
}

/**
 * The quiet, underlined text button beside a stack of pills: a step's way sideways (GEO-3427's
 * "Only running late"), or back (GEO-3429's "Back to times").
 */
export function HubQuietButton(props: React.ComponentProps<'button'>) {
  return (
    <button
      type="button"
      className="self-center px-3 py-2 text-metadata text-text underline underline-offset-2 hover:opacity-70"
      {...props}
    />
  );
}
