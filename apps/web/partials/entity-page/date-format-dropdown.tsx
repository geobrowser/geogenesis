'use client';

import * as DropdownPrimitive from '@radix-ui/react-dropdown-menu';

import * as React from 'react';
import { useState } from 'react';

import cx from 'classnames';
import { RemoveScroll } from 'react-remove-scroll';

import { GeoDate } from '~/core/utils/utils';

import { SquareButton } from '~/design-system/button';
import {
  DROPDOWN_LIST_BODY_SCROLL_CLASSES,
  DROPDOWN_LIST_MAX_HEIGHT_CLASS,
} from '~/design-system/dropdown-list-viewport';
import { DateFormat } from '~/design-system/icons/date-format';
import { Toggle } from '~/design-system/toggle';

interface Props {
  value?: string;
  format?: string;
  onSelect: (value?: string, format?: string) => void;
}

export const DateFormatDropdown = ({ value, format = GeoDate.defaultFormat, onSelect }: Props) => {
  const [open, setOpen] = useState(false);
  const triggerContainerRef = React.useRef<HTMLSpanElement | null>(null);
  const [dynamicAlign, setDynamicAlign] = useState<'start' | 'end'>('start');

  const isInterval = GeoDate.isDateInterval(value);

  const formatOptions = React.useMemo(() => {
    const now = new Date().toISOString();

    const dateFormats = [
      'h:mmaaa, EEEE, MMMM d, yyyy',
      'h:mmaaa, MMMM d, yyyy',
      'h:mmaaa, MMM d, yyyy',
      'h:mmaaa, MMM d, yy',
      'EEEE, MMMM d, yyyy',
      'MMM d, yyyy - h:mmaaa',
      'MMMM d, yyyy',
      'MMM d, yyyy',
      'MMM d, yy',
      'MM/dd/yyyy',
      'MM/dd/yy',
    ];

    const formatOptions = dateFormats.map(format => ({
      value: format,
      label: GeoDate.format(now, format),
    }));
    return formatOptions;
  }, []);

  const handleToggleChange = () => {
    onSelect(GeoDate.toggleDateInterval(value), format);
  };

  const suppressDefault = (e: React.MouseEvent) => {
    e.preventDefault();
  };

  React.useEffect(() => {
    if (!open || !triggerContainerRef.current) return;
    const updateDynamicAlign = () => {
      if (!triggerContainerRef.current) return;
      const rect = triggerContainerRef.current.getBoundingClientRect();
      const centerX = rect.left + rect.width / 2;
      setDynamicAlign(centerX < window.innerWidth / 2 ? 'start' : 'end');
    };
    updateDynamicAlign();
    window.addEventListener('resize', updateDynamicAlign);
    window.addEventListener('scroll', updateDynamicAlign, true);
    return () => {
      window.removeEventListener('resize', updateDynamicAlign);
      window.removeEventListener('scroll', updateDynamicAlign, true);
    };
  }, [open]);

  return (
    <DropdownPrimitive.Root open={open} onOpenChange={setOpen}>
      <span ref={triggerContainerRef}>
        <DropdownPrimitive.Trigger asChild>
          <SquareButton icon={<DateFormat />} isActive={open} />
        </DropdownPrimitive.Trigger>
      </span>
      <DropdownPrimitive.Portal>
        <RemoveScroll enabled={open} allowPinchZoom>
          <DropdownPrimitive.Content
            align={dynamicAlign}
            side="bottom"
            sideOffset={4}
            collisionPadding={16}
            avoidCollisions
            className={cx(
              'z-10 flex w-[250px] flex-col self-end overflow-hidden rounded-lg border border-grey-02 bg-white',
              DROPDOWN_LIST_MAX_HEIGHT_CLASS
            )}
          >
            <DropdownPrimitive.Item
              className="flex h-[28px] w-full shrink-0 gap-2 border-b border-grey-02 px-3 py-2 text-smallButton font-medium text-grey-04 select-none hover:bg-bg! focus:outline-hidden"
              // Suppress default to prevent the dropdown from closing when clicking the percentage toggle
              onClick={suppressDefault}
            >
              <div className="flex w-full items-center justify-between">
                <div className="flex items-center gap-2 hover:cursor-pointer" onClick={handleToggleChange}>
                  <Toggle checked={isInterval} />
                  <p>Interval</p>
                </div>
              </div>
            </DropdownPrimitive.Item>
            <DropdownPrimitive.Group className={cx('rounded-lg', DROPDOWN_LIST_BODY_SCROLL_CLASSES)}>
              {formatOptions.map((option, index) => (
                <DropdownPrimitive.Item
                  key={`triple-type-dropdown-${index}`}
                  onClick={() => onSelect(value, option.value)}
                  className={cx(
                    'flex w-full items-center justify-between px-3 py-2 text-button text-grey-04 select-none hover:cursor-pointer hover:bg-bg! focus:outline-hidden aria-disabled:cursor-not-allowed aria-disabled:text-grey-04',
                    format === option.value && 'bg-bg! text-text!'
                  )}
                >
                  {option.label}
                </DropdownPrimitive.Item>
              ))}
            </DropdownPrimitive.Group>
          </DropdownPrimitive.Content>
        </RemoveScroll>
      </DropdownPrimitive.Portal>
    </DropdownPrimitive.Root>
  );
};
