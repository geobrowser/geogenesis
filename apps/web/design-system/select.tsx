import * as SelectPrimitive from '@radix-ui/react-select';
import cx from 'classnames';

import * as React from 'react';

import { ChevronDownSmall } from './icons/chevron-down-small';

type Props = {
  value: string | undefined;
  onChange: (value: string) => void;
  options: { value: string; label: string; render?: React.ReactNode; disabled?: boolean; className?: string }[];
  variant?: 'primary' | 'secondary';
  placeholder?: React.ReactNode;
  className?: string;
  position?: 'item-aligned' | 'popper';
  disabled?: boolean;
};

export const Select = ({
  value,
  onChange,
  options,
  variant = 'secondary',
  placeholder = '',
  className = '',
  position = 'item-aligned',
  disabled = false,
}: Props) => {
  return (
    <SelectPrimitive.Root value={value} onValueChange={onChange}>
      <SelectPrimitive.Trigger
        className={cx(
          variant === 'secondary' ? 'bg-white text-text' : 'bg-text text-white',
          !disabled
            ? 'hover:shadow-inner-text focus:shadow-inner-lg-text'
            : '!cursor-not-allowed !bg-grey-02 text-opacity-50 grayscale',
          'inline-flex flex-1 whitespace-nowrap rounded px-3 py-2 text-button shadow-inner-grey-02 [&[data-placeholder]]:text-text',
          className
        )}
      >
        <div className="inline-flex min-h-[19px] w-full items-center justify-between gap-1">
          <div className={cx('truncate', value === '' && 'text-grey-03')}>
            <SelectPrimitive.Value placeholder={placeholder} />
          </div>
          <div className="flex-shrink-0">
            <ChevronDownSmall color={variant === 'secondary' ? 'ctaPrimary' : 'white'} />
          </div>
        </div>
      </SelectPrimitive.Trigger>
      <SelectPrimitive.Content
        className={cx(
          'z-[2] overflow-hidden rounded border border-grey-02 bg-white',
          position === 'item-aligned'
            ? ' mt-10 max-w-[241px]'
            : 'mt-1 max-h-[240px] w-[var(--radix-select-trigger-width)] overflow-y-auto'
        )}
        position={position}
      >
        <SelectPrimitive.Group className="divide-y divide-grey-02">
          {options.map(option => (
            <SelectPrimitive.Item
              key={option.value}
              value={option.value}
              disabled={option.disabled ?? false}
              title={option.label}
              aria-label={option.label}
              className={cx(
                'flex w-full select-none flex-col justify-center overflow-hidden truncate px-3 py-2.5 text-button text-grey-04 hover:cursor-pointer hover:bg-bg hover:text-text focus:bg-bg focus:text-text focus:outline-none [&[data-highlighted]]:bg-bg [&[data-highlighted]]:text-text',
                option.disabled && '!cursor-not-allowed !text-opacity-25',
                option?.className
              )}
            >
              <SelectPrimitive.ItemText>{option.render ?? option.label}</SelectPrimitive.ItemText>
            </SelectPrimitive.Item>
          ))}
        </SelectPrimitive.Group>
      </SelectPrimitive.Content>
    </SelectPrimitive.Root>
  );
};
