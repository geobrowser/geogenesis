'use client';

import * as DropdownPrimitive from '@radix-ui/react-dropdown-menu';
import cx from 'classnames';

import * as React from 'react';
import { useState } from 'react';

import { SwitchableRenderableType } from '~/core/types';

import { SquareButton } from '~/design-system/button';
import { CheckboxChecked } from '~/design-system/icons/checkbox-checked';
import { Date } from '~/design-system/icons/date';
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
        className="z-10 w-[160px] origin-top-right self-end overflow-hidden rounded-lg border border-grey-02 bg-white"
      >
        <DropdownPrimitive.Group className="divide-y divide-grey-02 overflow-hidden rounded-lg">
          {options.map((option, index) => (
            <DropdownPrimitive.Item
              key={`triple-type-dropdown-${index}`}
              onClick={option.onClick}
              className={cx(
                'flex w-full select-none items-center justify-between px-3 py-2 text-button text-grey-04 last:border-b last:border-b-grey-02 hover:cursor-pointer hover:!bg-bg focus:outline-none aria-disabled:cursor-not-allowed aria-disabled:text-grey-04',
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
