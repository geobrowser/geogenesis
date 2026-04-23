'use client';

import * as DropdownPrimitive from '@radix-ui/react-dropdown-menu';

import * as React from 'react';
import { useState } from 'react';

import { cva } from 'class-variance-authority';
import cx from 'classnames';
import { RemoveScroll } from 'react-remove-scroll';

import { DROPDOWN_LIST_SCROLL_CLASSES } from './dropdown-list-viewport';
import { ChevronDownSmall } from './icons/chevron-down-small';
import { Spacer } from './spacer';
import { Text } from './text';

interface Props {
  trigger: React.ReactNode;
  align?: 'end' | 'center' | 'start' | 'auto';
  /** When false, the menu does not scroll (short fixed lists only). Defaults to true. */
  scrollableList?: boolean;
  options: { label: React.ReactNode; sublabel?: string; value: string; disabled: boolean; onClick: () => void }[];
}

const contentStyles = cva(
  'z-10 w-[273px] rounded border border-grey-02 bg-white shadow-lg',
  {
    variants: {
      align: {
        start: 'origin-top-left',
        center: 'origin-top',
        end: 'origin-top-right',
      },
      scroll: {
        true: DROPDOWN_LIST_SCROLL_CLASSES,
        false: 'overflow-hidden',
      },
    },
    defaultVariants: {
      scroll: true,
    },
  }
);

export const Dropdown = ({ trigger, align = 'auto', scrollableList = true, options }: Props) => {
  // Using a controlled state to enable exit animations with framer-motion
  const [open, setOpen] = useState(false);
  const triggerRef = React.useRef<HTMLButtonElement | null>(null);
  const [dynamicAlign, setDynamicAlign] = useState<'start' | 'end'>('start');

  const updateDynamicAlign = React.useCallback(() => {
    if (!triggerRef.current || typeof window === 'undefined') return;
    const rect = triggerRef.current.getBoundingClientRect();
    const centerX = rect.left + rect.width / 2;
    setDynamicAlign(centerX < window.innerWidth / 2 ? 'start' : 'end');
  }, []);

  React.useEffect(() => {
    if (!open) return;
    updateDynamicAlign();
    window.addEventListener('resize', updateDynamicAlign);
    window.addEventListener('scroll', updateDynamicAlign, true);
    return () => {
      window.removeEventListener('resize', updateDynamicAlign);
      window.removeEventListener('scroll', updateDynamicAlign, true);
    };
  }, [open, updateDynamicAlign]);

  const resolvedAlign = align === 'auto' ? dynamicAlign : align;

  return (
    <DropdownPrimitive.Root
      open={open}
      onOpenChange={nextOpen => {
        setOpen(nextOpen);
        if (nextOpen) updateDynamicAlign();
      }}
    >
      <span className="shadow-button">
        <DropdownPrimitive.Trigger
          ref={triggerRef}
          className="flex grow items-center justify-between rounded bg-white px-3 py-2 text-button whitespace-nowrap text-text shadow-inner-grey-02 hover:shadow-inner-text focus:shadow-inner-lg-text data-placeholder:text-text"
        >
          {trigger}
          <Spacer width={8} />
          <ChevronDownSmall color="ctaPrimary" />
        </DropdownPrimitive.Trigger>
      </span>
      <DropdownPrimitive.Portal>
        <RemoveScroll enabled={open} allowPinchZoom>
          <DropdownPrimitive.Content
            align={resolvedAlign}
            side="bottom"
            sideOffset={4}
            collisionPadding={16}
            avoidCollisions
            className={contentStyles({ align: resolvedAlign, scroll: scrollableList })}
          >
            <DropdownPrimitive.Group className={cx(!scrollableList && 'overflow-hidden')}>
              {options.map((option, index) => (
                <DropdownPrimitive.Item
                  key={`dropdown-item-${index}`}
                  disabled={option.disabled}
                  onClick={option.onClick}
                  className="flex cursor-pointer items-center justify-between border-b border-b-grey-02 px-3 py-2 text-button text-grey-04 select-none last:border-none hover:bg-bg hover:text-text hover:outline-hidden aria-disabled:cursor-not-allowed aria-disabled:text-grey-04"
                >
                  {option.label}
                  {option.disabled && (
                    <Text variant="smallButton" color="grey-04">
                      {option.sublabel}
                    </Text>
                  )}
                </DropdownPrimitive.Item>
              ))}
            </DropdownPrimitive.Group>
          </DropdownPrimitive.Content>
        </RemoveScroll>
      </DropdownPrimitive.Portal>
    </DropdownPrimitive.Root>
  );
};
