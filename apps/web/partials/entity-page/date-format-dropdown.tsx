'use client';

import * as DropdownPrimitive from '@radix-ui/react-dropdown-menu';
import cx from 'classnames';

import * as React from 'react';
import { useState } from 'react';

import { GeoDate } from '~/core/utils/utils';

import { SquareButton } from '~/design-system/button';
import { DateFormat } from '~/design-system/icons/date-format';

interface Props {
  value?: string;
  onSelect: (value: string) => void;
}

export const DateFormatDropdown = ({ value = GeoDate.defaultFormat, onSelect }: Props) => {
  const [open, setOpen] = useState(false);

  const formatOptions = React.useMemo(() => {
    const now = new Date().toISOString();

    const dateFormats = [
      'h:mmaaa, EEEE, MMMM d, yyyy',
      'h:mmaaa, MMMM d, yyyy',
      'h:mmaaa, MMM d, yyyy',
      'h:mmaaa, MMM d, yy',
      'EEEE, MMMM d, yyyy',
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

  return (
    <DropdownPrimitive.Root open={open} onOpenChange={setOpen}>
      <DropdownPrimitive.Trigger asChild>
        <SquareButton icon={<DateFormat />} isActive={open} />
      </DropdownPrimitive.Trigger>
      <DropdownPrimitive.Content
        align="end"
        sideOffset={2}
        className="z-10 w-[250px] origin-top-right self-end overflow-hidden rounded-lg border border-grey-02 bg-white"
      >
        <DropdownPrimitive.Group className=" overflow-hidden rounded-lg">
          {formatOptions.map((option, index) => (
            <DropdownPrimitive.Item
              key={`triple-type-dropdown-${index}`}
              onClick={() => onSelect(option.value)}
              className={cx(
                'flex w-full select-none items-center justify-between px-3 py-2 text-button text-grey-04 hover:cursor-pointer hover:!bg-bg focus:outline-none aria-disabled:cursor-not-allowed aria-disabled:text-grey-04',
                value === option.value && '!bg-bg !text-text'
              )}
            >
              {option.label}
            </DropdownPrimitive.Item>
          ))}
        </DropdownPrimitive.Group>
      </DropdownPrimitive.Content>
    </DropdownPrimitive.Root>
  );
};
