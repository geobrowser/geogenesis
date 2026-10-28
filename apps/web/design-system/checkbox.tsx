'use client';

import type { ComponentPropsWithoutRef } from 'react';

import cx from 'classnames';

import { Blank } from '~/design-system/icons/blank';
import { Check } from '~/design-system/icons/check';
import { Minus } from '~/design-system/icons/minus';

type CheckboxProps = {
  checked: boolean | null;
  onChange?: React.MouseEventHandler<HTMLButtonElement>;
  className?: string;
} & ComponentPropsWithoutRef<'button'>;

export const Checkbox = ({ checked, onChange = () => null, className = '', ...rest }: CheckboxProps) => {
  const icon = getIcon(checked);

  return (
    <button
      onClick={onChange}
      className={cx(
        'relative box-border inline-flex size-4 items-center justify-center rounded-[4px] border border-text bg-white transition duration-200 ease-in-out *:size-3 hover:bg-bg focus:outline-hidden',
        className
      )}
      {...rest}
    >
      {icon}
    </button>
  );
};

export const getChecked = (value: string | null | undefined) => {
  switch (value) {
    case '1':
      return true;
    case '0':
      return false;
    default:
      return null;
  }
};

/**
 * `filled` is the 14px box the debates panel's Filters popover uses for its switches (GEO-3463):
 * grey-edged when off, solid black with a white tick when on. Two states only, so `null` reads as off.
 */
export function CheckboxVisual({
  checked,
  className = '',
  variant = 'default',
}: {
  checked: boolean | null;
  className?: string;
  variant?: 'default' | 'filled';
}) {
  if (variant === 'filled') {
    return (
      <span
        aria-hidden
        className={cx(
          'inline-flex size-3.5 shrink-0 items-center justify-center rounded-sm border',
          checked ? 'border-text bg-text text-white' : 'border-grey-03 bg-white',
          className
        )}
      >
        {checked ? (
          <svg viewBox="0 0 10 10" className="size-2.5" fill="none" stroke="currentColor" strokeWidth="1.6">
            <path d="M2 5.2 4.1 7.2 8 3" />
          </svg>
        ) : null}
      </span>
    );
  }

  const icon = getIcon(checked);

  return (
    <span
      className={cx(
        'relative box-border inline-flex size-4 shrink-0 items-center justify-center rounded-[4px] border border-text bg-white *:size-3',
        className
      )}
      aria-hidden
    >
      {icon}
    </span>
  );
}

const getIcon = (checked: boolean | null) => {
  switch (checked) {
    case true:
      return <Check />;
    case false:
      return <Blank />;
    default:
      return <Minus />;
  }
};
