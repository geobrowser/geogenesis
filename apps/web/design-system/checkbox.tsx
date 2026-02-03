'use client';

import cx from 'classnames';

import type { ComponentPropsWithoutRef } from 'react';

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
        'relative box-border inline-flex size-4 items-center justify-center rounded-[4px] border border-text bg-white transition duration-200 ease-in-out *:size-3 hover:bg-bg focus:outline-none',
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
