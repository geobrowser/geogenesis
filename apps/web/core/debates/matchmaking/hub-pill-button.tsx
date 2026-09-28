'use client';

import * as React from 'react';

import cx from 'classnames';

import { type DebateAnalyticsSurface, debateSurfaceAnalyticsAttributes } from './hub-analytics';

type Props = {
  variant?: 'primary' | 'secondary';
  /** Swapped in while a mutation is in flight, so the press has visible feedback. */
  pendingLabel?: string;
  pending?: boolean;
  /** Stable auto-capture label; string children are used when omitted. */
  analyticsLabel?: string;
  /** Owning surface for shared controls; hub-only callers can use the default. */
  analyticsSurface?: DebateAnalyticsSurface;
  /** Explicit override for exceptional actions with a more specific intent. */
  analyticsIntent?: string;
} & React.ComponentPropsWithoutRef<'button'>;

/**
 * The debates feature has its own pill style — `rounded-full`, `h-7`, `text-metadata` — shared with
 * the request dialog, challenge dialog, and profile debate button. The design system's Button is a
 * bordered rounded-rect, so matching it here would make the hub the odd one out. This just
 * collapses the six hand-written copies of that pill into one.
 */
export function HubPillButton({
  variant = 'secondary',
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
      className={cx(
        // `h-7` is a fixed height, so a label that wraps to a second line spills out of the pill.
        // nowrap is what prevents that: it makes min-content equal max-content, and a flex item's
        // default `min-width: auto` then stops the row from squeezing the pill at all — the name
        // beside it absorbs the shrinking instead, which is why rows give it `min-w-0 truncate`.
        // shrink-0 is redundant today and kept only to survive a later `min-w-0` on this button,
        // which would defeat the `min-width: auto` this leans on.
        'inline-flex h-7 shrink-0 items-center justify-center rounded-full px-3 text-metadata whitespace-nowrap transition-colors disabled:opacity-50',
        variant === 'primary'
          ? 'bg-text text-white hover:bg-text/90'
          : 'border border-grey-02 text-text hover:bg-grey-01',
        className
      )}
      {...rest}
    >
      {pending && pendingLabel ? pendingLabel : children}
    </button>
  );
}
