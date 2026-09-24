'use client';

import type { ReactNode } from 'react';

import cx from 'classnames';

import { Tooltip } from '~/design-system/tooltip';

/**
 * Makes the reason for a disabled debate-request control reachable by pointer, touch, and keyboard.
 *
 * A disabled button does not reliably emit the pointer events Radix needs, so the wrapper owns the
 * interactions while leaving the button's disabled semantics intact.
 */
export function RequestBlockedReasonTooltip({
  reason,
  trigger,
  align = 'end',
  fullWidth = false,
}: {
  reason: string;
  trigger: ReactNode;
  align?: 'start' | 'center' | 'end';
  fullWidth?: boolean;
}) {
  return (
    <Tooltip
      label={reason}
      position="bottom"
      align={align}
      openOnPress
      trigger={
        <span tabIndex={0} title={reason} className={cx('inline-flex cursor-default', fullWidth && 'w-full')}>
          {trigger}
        </span>
      }
    />
  );
}
