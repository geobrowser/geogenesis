'use client';

import * as DropdownPrimitive from '@radix-ui/react-dropdown-menu';
import cx from 'classnames';

import * as React from 'react';
import { useState } from 'react';

import { SWITCHABLE_RENDERABLE_TYPE_LABELS, SwitchableRenderableType } from '~/core/types';
import { Properties } from '~/core/utils/property';

import { ChevronDown } from '~/design-system/icons/chevron-down';
import { DashedCircle } from '~/design-system/icons/dashed-circle';
import { ColorName } from '~/design-system/theme/colors';

import { TYPE_ICONS } from './type-icons';
interface Props {
  value?: SwitchableRenderableType;
  onChange?: (value: SwitchableRenderableType) => void;
  baseDataType?: string;
}

export const RenderableTypeDropdown = ({ value, onChange, baseDataType }: Props) => {
  const [open, setOpen] = useState(false);

  // Show all available renderable types
  const availableOptions = React.useMemo(() => {
    // If no baseDataType is provided, return all options (unpublished property)
    if (!baseDataType) {
      return Object.keys(SWITCHABLE_RENDERABLE_TYPE_LABELS) as SwitchableRenderableType[];
    }

    // Filter options to only those with matching base dataType (published property)
    return (Object.keys(SWITCHABLE_RENDERABLE_TYPE_LABELS) as SwitchableRenderableType[]).filter(
      type => Properties.typeToBaseDataType[type] === baseDataType
    );
  }, [baseDataType]);

  const options = availableOptions.map(key => ({
    value: key,
    label: SWITCHABLE_RENDERABLE_TYPE_LABELS[key],
    onClick: (value: SwitchableRenderableType) => {
      onChange?.(value);
    },
    Icon: TYPE_ICONS[key],
  }));

  let Icon = DashedCircle as React.FunctionComponent<{ color?: ColorName; className?: string }>;
  if (value) {
    Icon = TYPE_ICONS[value];
  }

  let label = 'Set property type';
  if (value) {
    label = SWITCHABLE_RENDERABLE_TYPE_LABELS[value];
  }

  return (
    <DropdownPrimitive.Root open={open} onOpenChange={setOpen}>
      <DropdownPrimitive.Trigger className="text-text" asChild>
        <button
          className={`flex items-center gap-[6px] leading-4 rounded-[6px] border px-1.5 py-[3px] text-[1rem] ${open ? 'border-text' : 'border-grey-02'}`}
        >
          <Icon color={open ? 'text' : 'grey-04'} className="h-3 w-3" />
          {label}
          <div className={`${open ? '-rotate-180' : ''} transition-transform duration-300 ease-in-out`}>
            <ChevronDown />
          </div>
        </button>
      </DropdownPrimitive.Trigger>
      <DropdownPrimitive.Content
        align="start"
        sideOffset={4}
        collisionPadding={10}
        avoidCollisions={true}
        className="z-50 max-h-[50vh] w-[200px] overflow-hidden overflow-y-scroll rounded-lg border border-grey-02 bg-white shadow-lg"
      >
        <DropdownPrimitive.Group className="space-y-1 overflow-hidden rounded-lg p-1">
          {options.map((option, index) => {
            const TypeIcon = option.Icon;
            return (
              <DropdownPrimitive.Item
                key={`triple-type-dropdown-${index}`}
                onClick={() => {
                  option.onClick(option.value);
                }}
                className={cx(
                  'flex w-full select-none items-center gap-2 rounded-md bg-white px-3 py-2.5 text-button text-text hover:cursor-pointer hover:bg-divider focus:outline-none aria-disabled:cursor-not-allowed aria-disabled:text-grey-04',
                  value === option.value && '!bg-divider'
                )}
              >
                <TypeIcon color="grey-04" />
                {option.label}
              </DropdownPrimitive.Item>
            );
          })}
        </DropdownPrimitive.Group>
      </DropdownPrimitive.Content>
    </DropdownPrimitive.Root>
  );
};
