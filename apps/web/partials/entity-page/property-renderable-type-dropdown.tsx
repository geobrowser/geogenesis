import * as DropdownPrimitive from '@radix-ui/react-dropdown-menu';
import cx from 'classnames';

import { Dispatch, SetStateAction, useState } from 'react';

import { SwitchableRenderableType } from '~/core/v2.types';

import { CheckboxChecked } from '~/design-system/icons/checkbox-checked';
import { ChevronDownSmall } from '~/design-system/icons/chevron-down-small';
import { DashedCircle } from '~/design-system/icons/dashed-circle';
import { Date } from '~/design-system/icons/date';
import { GeoLocation } from '~/design-system/icons/geo-location';
import { Image } from '~/design-system/icons/image';
import { Number } from '~/design-system/icons/number';
import { Relation } from '~/design-system/icons/relation';
import { Text } from '~/design-system/icons/text';
import { Url } from '~/design-system/icons/url';
import { ColorName } from '~/design-system/theme/colors';

interface Props {
  value?: SwitchableRenderableType;
}

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

const typeOptions: Record<SwitchableRenderableType, string> = {
  TIME: 'Time',
  TEXT: 'Text',
  URL: 'Url',
  RELATION: 'Relation',
  IMAGE: 'Image',
  CHECKBOX: 'Checkbox',
  NUMBER: 'Number',
  POINT: 'Point',
  GEO_LOCATION: 'GeoLocation',
};

const options = Object.entries(typeOptions).map(([key, label]) => ({
  value: key as SwitchableRenderableType,
  label: label,
  onClick: (
    setSelectedValue: Dispatch<SetStateAction<SwitchableRenderableType | undefined>>,
    value: SwitchableRenderableType
  ) => {
    setSelectedValue(value);
  },
  Icon: icons[key as SwitchableRenderableType],
}));

export const PropertyRenderableTypeDropdown = ({ value }: Props) => {
  const [selectedValue, setSelectedValue] = useState<SwitchableRenderableType | undefined>(value);
  const [open, setOpen] = useState(false);

  let Icon = DashedCircle as React.FunctionComponent<{ color?: ColorName }>;
  if (selectedValue) {
    Icon = icons[selectedValue];
  }

  let label = 'Set property type';
  if (selectedValue) {
    label = typeOptions[selectedValue];
  }

  return (
    <DropdownPrimitive.Root open={open} onOpenChange={setOpen}>
      <DropdownPrimitive.Trigger className="text-text" asChild>
        <button
          className={`flex items-center gap-[6px] rounded-[6px] border  px-[6px] text-[1rem] ${open ? 'border-text' : 'border-grey-02'}`}
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
                onClick={() => option.onClick(setSelectedValue, option.value)}
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
