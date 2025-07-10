'use client';

import * as DropdownPrimitive from '@radix-ui/react-dropdown-menu';
import cx from 'classnames';

import * as React from 'react';
import { useState } from 'react';

import { SwitchableRenderableType } from '~/core/v2.types';

import { SquareButton } from '~/design-system/button';
import { CheckboxChecked } from '~/design-system/icons/checkbox-checked';
import { Date } from '~/design-system/icons/date';
import { GeoLocation } from '~/design-system/icons/geo-location';
import { Image } from '~/design-system/icons/image';
import { Number } from '~/design-system/icons/number';
import { Relation } from '~/design-system/icons/relation';
import { Text } from '~/design-system/icons/text';
import { Url } from '~/design-system/icons/url';
import { ColorName } from '~/design-system/theme/colors';

const icons: Record<SwitchableRenderableType, React.FunctionComponent<{ color?: ColorName }>> = {
  TIME: Date,
  TEXT: Text,
  URL: Url,
  RELATION: Relation,
  IMAGE: Image,
  CHECKBOX: CheckboxChecked,
  NUMBER: Number,
  POINT: GeoLocation,
  GEO_LOCATION: GeoLocation,
};

interface Props {
  value: SwitchableRenderableType;
  options: { value: SwitchableRenderableType; label: React.ReactNode; onClick: () => void }[];
}

export const RenderableTypeDropdown = ({ value, options }: Props) => {
  // Using a controlled state to enable exit animations with framer-motion
  const [open, setOpen] = useState(false);
  const Icon = icons[value];

  return (
    <DropdownPrimitive.Root open={open} onOpenChange={setOpen}>
      <DropdownPrimitive.Trigger asChild>
        <SquareButton icon={<Icon />} isActive={open} />
      </DropdownPrimitive.Trigger>
      <DropdownPrimitive.Content
        align="end"
        sideOffset={2}
        className="z-10 w-[160px] origin-top-right self-end overflow-hidden rounded-lg border border-grey-02 bg-white shadow-lg"
      >
        <DropdownPrimitive.Group className="space-y-1 overflow-hidden rounded-lg p-1">
          {options.map((option, index) => (
            <DropdownPrimitive.Item
              key={`triple-type-dropdown-${index}`}
              onClick={option.onClick}
              className={cx(
                'flex w-full select-none items-center justify-between rounded-md bg-white px-3 py-2.5 text-button text-text hover:cursor-pointer hover:bg-divider focus:outline-none aria-disabled:cursor-not-allowed aria-disabled:text-grey-04',
                value === option.value && '!bg-divider'
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
