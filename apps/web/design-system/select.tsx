'use client';

import * as SelectPrimitive from '@radix-ui/react-select';

import * as React from 'react';
import { useState } from 'react';

import cx from 'classnames';

import { ChevronDownSmall } from './icons/chevron-down-small';
import { trapWheelToElement } from './trap-wheel-scroll';
import { useAdaptiveDropdownPlacement } from './use-adaptive-dropdown-placement';

type Props = {
  value: string | undefined;
  onChange: (value: string) => void;
  options: { value: string; label: string; render?: React.ReactNode; disabled?: boolean; className?: string }[];
  variant?: 'primary' | 'secondary';
  placeholder?: React.ReactNode;
  className?: string;
  position?: 'item-aligned' | 'popper';
  disabled?: boolean;
  contentClassName?: string;
};

export const Select = ({
  value,
  onChange,
  options,
  variant = 'secondary',
  placeholder = '',
  className = '',
  position = 'popper',
  disabled = false,
  contentClassName = '',
}: Props) => {
  const [open, setOpen] = useState(false);
  const triggerRef = React.useRef<HTMLButtonElement>(null);
  const viewportRef = React.useRef<HTMLDivElement>(null);
  const { align, side } = useAdaptiveDropdownPlacement(triggerRef, { isOpen: open });
  const onSelectContentWheel = React.useCallback((e: React.WheelEvent) => {
    trapWheelToElement(viewportRef.current, e);
  }, []);

  // Force-close if `disabled` flips true while the menu is open.
  React.useEffect(() => {
    if (disabled && open) setOpen(false);
  }, [disabled, open]);

  const handleOpenChange = React.useCallback(
    (next: boolean) => {
      if (disabled && next) return;
      setOpen(next);
    },
    [disabled]
  );

  return (
    <SelectPrimitive.Root value={value} onValueChange={onChange} open={open} onOpenChange={handleOpenChange}>
      <SelectPrimitive.Trigger
        ref={triggerRef}
        disabled={disabled}
        className={cx(
          variant === 'secondary' ? 'bg-white text-text' : 'bg-text text-white',
          !disabled
            ? 'hover:shadow-inner-text focus:shadow-inner-lg-text'
            : 'cursor-not-allowed! bg-grey-02! opacity-50 grayscale',
          'inline-flex flex-1 rounded px-3 py-2 text-button whitespace-nowrap shadow-inner-grey-02 data-placeholder:text-text',
          className
        )}
      >
        <div className="inline-flex min-h-[19px] w-full items-center justify-between gap-1">
          <div className={cx('truncate', value === '' && 'text-grey-03')}>
            <SelectPrimitive.Value placeholder={placeholder} />
          </div>
          <div className="shrink-0">
            <ChevronDownSmall color={variant === 'secondary' ? 'ctaPrimary' : 'white'} />
          </div>
        </div>
      </SelectPrimitive.Trigger>
      <SelectPrimitive.Portal>
        <SelectPrimitive.Content
          className={cx(
            'z-20 min-w-[var(--radix-select-trigger-width)] overflow-hidden rounded border border-grey-02 bg-white shadow-lg',
            contentClassName
          )}
          position={position}
          align={align}
          side={side}
          sideOffset={6}
          avoidCollisions={true}
          collisionPadding={8}
          sticky="always"
          onWheel={onSelectContentWheel}
        >
          <SelectPrimitive.Viewport
            ref={viewportRef}
            className="max-h-[180px] overflow-y-auto overscroll-contain scroll-smooth"
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
                    'flex min-h-10 w-full flex-col justify-center truncate overflow-hidden px-3 py-2.5 text-button text-grey-04 select-none hover:cursor-pointer hover:bg-bg hover:text-text focus:bg-bg focus:text-text focus:outline-hidden data-highlighted:bg-bg data-highlighted:text-text',
                    option.disabled && 'cursor-not-allowed! opacity-25!',
                    option?.className
                  )}
                >
                  <SelectPrimitive.ItemText>{option.render ?? option.label}</SelectPrimitive.ItemText>
                </SelectPrimitive.Item>
              ))}
            </SelectPrimitive.Group>
          </SelectPrimitive.Viewport>
        </SelectPrimitive.Content>
      </SelectPrimitive.Portal>
    </SelectPrimitive.Root>
  );
};
