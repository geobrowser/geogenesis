import * as React from 'react';
import cx from 'classnames';
import * as SelectPrimitive from '@radix-ui/react-select';

import { ChevronDownSmall } from './icons/chevron-down-small';
import { Spacer } from './spacer';

type Props = {
  value: string;
  onChange: (value: string) => void;
  options: { value: string; label: string }[];
  variant?: 'primary' | 'secondary';
};

export const Select = ({ value, onChange, options, variant = 'secondary' }: Props) => (
  <SelectPrimitive.Root value={value} onValueChange={onChange}>
    <SelectPrimitive.SelectTrigger
      className={cx(
        variant === 'secondary' ? 'bg-white text-text' : 'bg-text text-white',
        'inline-flex flex-1 items-center justify-between gap-1 whitespace-nowrap rounded py-2 px-3 text-button shadow-inner-grey-02 hover:shadow-inner-text focus:shadow-inner-lg-text [&[data-placeholder]]:text-text'
      )}
    >
      <SelectPrimitive.SelectValue />
      <Spacer width={8} />
      <ChevronDownSmall color={variant === 'secondary' ? 'ctaPrimary' : 'white'} />
    </SelectPrimitive.SelectTrigger>
    <SelectPrimitive.Content className="z-[2] mt-10 w-[241px] overflow-hidden rounded border border-grey-02 bg-white">
      <SelectPrimitive.Group className="divide-y divide-grey-02">
        {options.map(option => (
          <SelectPrimitive.Item
            aria-label={option.label}
            key={option.value}
            value={option.value}
            className="flex w-full select-none flex-col justify-center overflow-hidden py-2.5 px-3 text-button text-grey-04 hover:cursor-pointer hover:bg-bg hover:text-text focus:bg-bg focus:text-text focus:outline-none [&[data-highlighted]]:bg-bg [&[data-highlighted]]:text-text"
          >
            <SelectPrimitive.SelectItemText>{option.label}</SelectPrimitive.SelectItemText>
          </SelectPrimitive.Item>
        ))}
      </SelectPrimitive.Group>
    </SelectPrimitive.Content>
  </SelectPrimitive.Root>
);
