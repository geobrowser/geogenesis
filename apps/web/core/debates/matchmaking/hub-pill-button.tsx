'use client';

import * as React from 'react';

import cx from 'classnames';

type Props = {
  variant?: 'primary' | 'secondary';
  /** Swapped in while a mutation is in flight, so the press has visible feedback. */
  pendingLabel?: string;
  pending?: boolean;
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
  disabled,
  className,
  children,
  ...rest
}: Props) {
  return (
    <button
      type="button"
      disabled={disabled || pending}
      aria-busy={pending || undefined}
      className={cx(
        // shrink-0 + nowrap because `h-7` is a fixed height: in a flex row a label long enough to
        // be squeezed wraps to a second line and spills out of the pill. Rows that pair this with
        // a name already give the name `min-w-0 truncate`, so it absorbs the shrinking instead.
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
