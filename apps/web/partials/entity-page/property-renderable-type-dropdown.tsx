'use client';

import * as DropdownPrimitive from '@radix-ui/react-dropdown-menu';
import cx from 'classnames';

import * as React from 'react';
import { Dispatch, SetStateAction, useState } from 'react';

import { SWITCHABLE_RENDERABLE_TYPE_LABELS, SwitchableRenderableType } from '~/core/types';

import { ChevronDownSmall } from '~/design-system/icons/chevron-down-small';
import { DashedCircle } from '~/design-system/icons/dashed-circle';
import { ColorName } from '~/design-system/theme/colors';

import { TypeIconComponent, TYPE_ICONS } from './type-icons';
interface Props {
  value?: SwitchableRenderableType;
  onChange?: (value: SwitchableRenderableType) => void;
  dataType?: string;
}

export const PropertyRenderableTypeDropdown = ({ value, onChange, dataType }: Props) => {
  const [selectedValue, setSelectedValue] = useState<SwitchableRenderableType | undefined>(value);
  const [open, setOpen] = useState(false);

  // Determine which options are available based on the property's dataType
  const availableOptions = React.useMemo(() => {
    if (!dataType) {
      console.warn('PropertyRenderableTypeDropdown: No dataType provided');
      return [];
    }

    // Based on the GRC-20 v2 dataType, determine which renderable types are valid
    switch (dataType) {
      case 'TEXT':
        // TEXT dataType can be rendered as TEXT, URL, or GEO_LOCATION
        return ['TEXT', 'URL', 'GEO_LOCATION'] as SwitchableRenderableType[];
      case 'RELATION':
        // RELATION dataType can be rendered as RELATION, IMAGE, or VIDEO
        return ['RELATION', 'IMAGE', 'VIDEO'] as SwitchableRenderableType[];
      case 'INTEGER':
        return ['INTEGER'] as SwitchableRenderableType[];
      case 'FLOAT':
        return ['FLOAT'] as SwitchableRenderableType[];
      case 'DECIMAL':
        return ['DECIMAL'] as SwitchableRenderableType[];
      case 'BOOLEAN':
        return ['BOOLEAN'] as SwitchableRenderableType[];
      case 'DATE':
        return ['DATE'] as SwitchableRenderableType[];
      case 'DATETIME':
        return ['DATETIME'] as SwitchableRenderableType[];
      case 'TIME':
        return ['TIME'] as SwitchableRenderableType[];
      case 'POINT':
        return ['POINT'] as SwitchableRenderableType[];
      default:
        console.warn('PropertyRenderableTypeDropdown: Unknown dataType:', dataType);
        return [];
    }
  }, [dataType]);

  const options = availableOptions.map(key => ({
    value: key,
    label: SWITCHABLE_RENDERABLE_TYPE_LABELS[key],
    onClick: (
      setSelectedValue: Dispatch<SetStateAction<SwitchableRenderableType | undefined>>,
      value: SwitchableRenderableType
    ) => {
      setSelectedValue(value);
    },
    Icon: TYPE_ICONS[key],
  }));

  let Icon = DashedCircle as TypeIconComponent;
  if (selectedValue) {
    Icon = TYPE_ICONS[selectedValue];
  }

  let label = 'Set renderable type';
  if (selectedValue) {
    label = SWITCHABLE_RENDERABLE_TYPE_LABELS[selectedValue];
  }

  // If no options are available, don't render the dropdown
  if (availableOptions.length === 0) {
    console.warn('No valid renderable types available for this property dataType:', dataType);
    return null;
  }

  return (
    <DropdownPrimitive.Root open={open} onOpenChange={setOpen}>
      <DropdownPrimitive.Trigger className="text-text" asChild>
        <button
          className={`flex items-center gap-[6px] rounded-[6px] border px-[6px] text-[1rem] ${open ? 'border-text' : 'border-grey-02'}`}
        >
          <Icon color={open ? 'text' : 'grey-04'} />
          {label}
          <div className={`${open ? '-rotate-180' : ''} transition-transform duration-300 ease-in-out`}>
            <ChevronDownSmall />
          </div>
        </button>
      </DropdownPrimitive.Trigger>
      <DropdownPrimitive.Content
        align="end"
        sideOffset={4}
        className="absolute left-0 z-10 max-h-[280px] w-[200px] overflow-hidden overflow-y-scroll rounded-lg border border-grey-02 bg-white shadow-lg"
      >
        <DropdownPrimitive.Group className="space-y-1 overflow-hidden rounded-lg p-1">
          {options.map((option, index) => {
            const TypeIcon = option.Icon;
            return (
              <DropdownPrimitive.Item
                key={`triple-type-dropdown-${index}`}
                onClick={() => {
                  option.onClick(setSelectedValue, option.value);
                  onChange?.(option.value);
                }}
                className={cx(
                  'flex w-full select-none items-center gap-2 rounded-md bg-white px-3 py-2.5 text-button text-text hover:cursor-pointer hover:bg-divider focus:outline-none aria-disabled:cursor-not-allowed aria-disabled:text-grey-04',
                  selectedValue === option.value && '!bg-divider'
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
