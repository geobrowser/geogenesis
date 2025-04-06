'use client';

import * as DropdownPrimitive from '@radix-ui/react-dropdown-menu';
import cx from 'classnames';

import * as React from 'react';
import { useState } from 'react';

import { GeoNumber } from '~/core/utils/utils';

import { SquareButton } from '~/design-system/button';
import { ArrowLeft } from '~/design-system/icons/arrow-left';
import { Check } from '~/design-system/icons/check';
import { ChevronRight } from '~/design-system/icons/chevron-right';
import { Magic } from '~/design-system/icons/magic';
import { Toggle } from '~/design-system/toggle';

interface Props {
  value?: string;
  format?: string;
  onSelect: (value: string) => void;
}

interface SubmenuOptionProps {
  label: string;
  onClick: (e: React.MouseEvent) => void;
  isSelected?: boolean;
  hasSubmenu?: boolean;
  className?: string;
  value?: string;
  options?: NumberFormatOption[];
}

const SubmenuOption: React.FC<SubmenuOptionProps> = ({
  label,
  onClick,
  isSelected,
  hasSubmenu = false,
  className,
  value,
}) => (
  <DropdownPrimitive.Item
    onClick={onClick}
    className={cx(
      'flex w-full select-none items-center justify-between px-3 py-[10px] hover:cursor-pointer hover:!bg-bg focus:outline-none',
      isSelected && '!bg-grey-01 !text-text',
      className
    )}
  >
    <div className={cx('flex flex-col gap-[2px]', isSelected && 'rounded-md')}>
      <p className="text-button font-medium">{label}</p>
      <p className="text-metadata">{value}</p>
    </div>
    {hasSubmenu ? <ChevronRight color="grey-04" /> : isSelected ? <Check color="grey-04" /> : null}
  </DropdownPrimitive.Item>
);

const PercentageToggle = ({
  currentType,
  onToggle,
}: {
  currentType: 'number' | 'percentage';
  onToggle: (numberType: 'number' | 'percentage') => void;
}) => {
  const handleToggleChange = React.useCallback(() => {
    onToggle(currentType === 'percentage' ? 'number' : 'percentage');
  }, [currentType, onToggle]);

  const suppressDefault = React.useCallback((e: React.MouseEvent) => {
    e.preventDefault();
  }, []);

  return (
    <DropdownPrimitive.Item
      className="flex h-[28px] w-full select-none gap-2 border-b border-grey-02 px-3 py-2 text-smallButton font-medium text-grey-04  hover:!bg-bg focus:outline-none"
      onClick={suppressDefault}
    >
      <div className="flex w-full items-center justify-between">
        <div className="flex items-center gap-2 hover:cursor-pointer" onClick={handleToggleChange}>
          <Toggle checked={currentType === 'percentage'} />
          <p>Percentage</p>
        </div>
      </div>
    </DropdownPrimitive.Item>
  );
};

const BackButton = ({ onClick }: { onClick: (e: React.MouseEvent) => void }) => {
  const suppressDefault = React.useCallback((e: React.MouseEvent) => {
    e.preventDefault();
  }, []);

  return (
    <DropdownPrimitive.Item
      className="flex h-[28px] w-full select-none gap-2 border-b border-grey-02 px-3 py-2 text-smallButton font-medium text-grey-04  hover:!bg-bg focus:outline-none"
      onClick={suppressDefault}
    >
      <div className="flex w-full items-center gap-2 hover:cursor-pointer" onClick={onClick}>
        <ArrowLeft color="grey-04" />
        <p>Back</p>
      </div>
    </DropdownPrimitive.Item>
  );
};

const NumberFormatView = ({ formatOptions, value }: { formatOptions?: NumberFormatOption[]; value?: string }) => (
  <>
    {formatOptions?.map(({ isSelected, label, onClick, value: formatValue }, index) => (
      <DropdownPrimitive.Item
        key={`format-option-${index}`}
        onClick={onClick}
        className={cx(
          'flex w-full select-none items-center justify-between px-3 py-2 text-button  hover:cursor-pointer hover:!bg-bg focus:outline-none aria-disabled:cursor-not-allowed aria-disabled:text-grey-04',
          isSelected && '!bg-grey-01'
        )}
      >
        <div className="flex flex-col gap-[2px]">
          <p className="text-button font-medium">{label}</p>
          <p className="text-metadata">{GeoNumber.format(value || '1234.56', formatValue)}</p>
        </div>
        {isSelected && <Check color="grey-04" />}
      </DropdownPrimitive.Item>
    ))}
  </>
);

const numberFormatOptions = {
  Precise: 'precision-unlimited',
  Rounded: 'precision-integer',
};

const percentageFormatOptions = {
  Precise: 'measure-unit/percent precision-unlimited',
  Rounded: 'measure-unit/percent precision-integer',
};

type NumberFormatOption = {
  label: string;
  value: string;
  isSelected: boolean;
  onClick: () => void;
};

type NumberTypeSubmenuView = 'number-options' | 'number-unit' | 'number-format';

export const NumberOptionsDropdown = ({ value, format = GeoNumber.defaultFormat, onSelect }: Props) => {
  const [isOpen, setIsOpen] = useState<boolean>(false);
  const [viewHistory, setViewHistory] = useState<NumberTypeSubmenuView[]>(['number-options']);
  const currentView = viewHistory[viewHistory.length - 1];
  const [selectedNumberType, setSelectedNumberType] = useState<'number' | 'percentage'>(
    format.includes('percent') ? 'percentage' : 'number'
  );

  const handleBack = (e: React.MouseEvent) => {
    e.preventDefault();
    if (viewHistory.length > 1) {
      setViewHistory(prev => prev.slice(0, -1));
    } else {
      setIsOpen(false);
    }
  };

  const handleNavigate = (e: React.MouseEvent, view: NumberTypeSubmenuView) => {
    e.preventDefault();
    setViewHistory(prev => [...prev, view]);
  };

  const toggleIsOpen = React.useCallback(() => {
    setIsOpen(prev => !prev);
    setViewHistory(['number-options']);
  }, []);

  const formatOptions = React.useMemo(() => {
    const options = selectedNumberType === 'percentage' ? percentageFormatOptions : numberFormatOptions;

    return Object.entries(options).map(([label, formatValue]) => ({
      label,
      value: formatValue,
      isSelected: formatValue === format,
      onClick: () => onSelect(formatValue),
    }));
  }, [selectedNumberType, format, onSelect]);

  const renderContent = () => {
    switch (currentView) {
      case 'number-format':
        return (
          <>
            <BackButton onClick={handleBack} />
            <NumberFormatView formatOptions={formatOptions} value={value} />
          </>
        );

      case 'number-options':
      default:
        return (
          <>
            <PercentageToggle currentType={selectedNumberType} onToggle={setSelectedNumberType} />
            <SubmenuOption
              label="Format"
              onClick={e => handleNavigate(e, 'number-format')}
              hasSubmenu
              value={value}
              options={formatOptions}
            />
          </>
        );
    }
  };

  return (
    <DropdownPrimitive.Root open={isOpen} onOpenChange={toggleIsOpen}>
      <DropdownPrimitive.Trigger asChild>
        <SquareButton icon={<Magic />} isActive={isOpen} />
      </DropdownPrimitive.Trigger>
      <DropdownPrimitive.Content
        align="end"
        sideOffset={2}
        className="z-10 w-[250px] origin-top-right self-end overflow-hidden rounded-lg border border-grey-02 bg-white"
      >
        <DropdownPrimitive.Group className="overflow-hidden rounded-lg">{renderContent()}</DropdownPrimitive.Group>
      </DropdownPrimitive.Content>
    </DropdownPrimitive.Root>
  );
};
