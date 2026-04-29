'use client';

import * as DropdownPrimitive from '@radix-ui/react-dropdown-menu';

import * as React from 'react';
import { useState } from 'react';

import cx from 'classnames';

import { SWITCHABLE_RENDERABLE_TYPE_LABELS, SwitchableRenderableType } from '~/core/types';
import { Properties } from '~/core/utils/property';

import { ChevronDown } from '~/design-system/icons/chevron-down';
import { DashedCircle } from '~/design-system/icons/dashed-circle';
import { trapWheelToElement } from '~/design-system/trap-wheel-scroll';
import { useAdaptiveDropdownPlacement } from '~/design-system/use-adaptive-dropdown-placement';

import { TYPE_ICONS, TypeIconComponent } from './type-icons';

interface Props {
  value?: SwitchableRenderableType;
  onChange?: (value: SwitchableRenderableType) => void;
  baseDataType?: string;
}

export const RenderableTypeDropdown = ({ value, onChange, baseDataType }: Props) => {
  const [open, setOpen] = useState(false);
  const triggerRef = React.useRef<HTMLButtonElement>(null);

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
  const { align, side } = useAdaptiveDropdownPlacement(triggerRef, {
    isOpen: open,
    preferredHeight: 180,
    gap: 8,
  });
  const onTypeMenuWheel = React.useCallback((e: React.WheelEvent<HTMLDivElement>) => {
    trapWheelToElement(e.currentTarget, e);
  }, []);

  let Icon = DashedCircle as TypeIconComponent;
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
          ref={triggerRef}
          className={`flex items-center gap-[6px] rounded-[6px] border px-1.5 py-[3px] text-[1rem] leading-4 ${open ? 'border-text' : 'border-grey-02'}`}
        >
          <Icon color={open ? 'text' : 'grey-04'} className="h-3 w-3" />
          {label}
          <div className={`${open ? '-rotate-180' : ''} transition-transform duration-300 ease-in-out`}>
            <ChevronDown />
          </div>
        </button>
      </DropdownPrimitive.Trigger>
      <DropdownPrimitive.Content
        align={align}
        side={side}
        sideOffset={8}
        collisionPadding={8}
        avoidCollisions={true}
        sticky="always"
        className={cx(
          'z-50 w-[200px] overflow-hidden rounded-lg border border-grey-02 bg-white shadow-lg',
          options.length > 4 && 'max-h-[180px] overscroll-contain overflow-y-auto scroll-smooth'
        )}
        onWheel={onTypeMenuWheel}
      >
        <DropdownPrimitive.Group className="overflow-hidden">
          {options.map((option, index) => {
            const TypeIcon = option.Icon;
            return (
              <DropdownPrimitive.Item
                key={`triple-type-dropdown-${index}`}
                onClick={() => {
                  option.onClick(option.value);
                }}
                className={cx(
                  'flex h-10 w-full items-center gap-2 bg-white px-3 text-button text-text select-none hover:cursor-pointer hover:bg-divider focus:outline-hidden aria-disabled:cursor-not-allowed aria-disabled:text-grey-04',
                  value === option.value && 'bg-divider!'
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
