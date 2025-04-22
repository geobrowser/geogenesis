'use client';

import * as DropdownPrimitive from '@radix-ui/react-dropdown-menu';
import cx from 'classnames';

import * as React from 'react';

import { useSearch } from '~/core/hooks/use-search';
import { useQueryEntities, useQueryEntity } from '~/core/sync/use-store';
import { GeoNumber } from '~/core/utils/utils';

import { SquareButton } from '~/design-system/button';
import { ArrowLeft } from '~/design-system/icons/arrow-left';
import { Check } from '~/design-system/icons/check';
import { ChevronRight } from '~/design-system/icons/chevron-right';
import { Magic } from '~/design-system/icons/magic';
import { Input } from '~/design-system/input';
import { Spinner } from '~/design-system/spinner';
import { Toggle } from '~/design-system/toggle';

interface Props {
  value?: string;
  format?: string;
  unitId?: string;
  send: ({ format, unitId }: { format?: string; unitId?: string }) => void;
}

interface SubmenuOptionProps {
  label: string;
  labelRight?: string;
  subtext?: string | null;
  onClick: (e: React.MouseEvent) => void;
  isSelected?: boolean;
  hasSubmenu?: boolean;
  className?: string;
  options?: NumberFormatOption[];
}

const SubmenuOption: React.FC<SubmenuOptionProps> = ({
  label,
  labelRight,
  subtext,
  onClick,
  isSelected,
  hasSubmenu = false,
  className,
}) => {
  return (
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
        <p className="text-metadata">{subtext}</p>
      </div>
      {labelRight && <p className="font-medium text-grey-04">{labelRight}</p>}
      {hasSubmenu ? <ChevronRight color="grey-04" /> : isSelected ? <Check color="grey-04" /> : null}
    </DropdownPrimitive.Item>
  );
};

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
      // Suppress default to prevent the dropdown from closing when clicking the percentage toggle
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

const CurrencySubmenuOption = ({ type, onSelect }: { type: 'FIAT' | 'CRYPTO'; onSelect: (unitId: string) => void }) => {
  const [inputValue, setInputValue] = React.useState('');
  const [filteredEntities, setFilteredEntities] = React.useState<
    { name: string | null; symbol?: string; sign?: string; id: string }[]
  >([]);

  const {
    query,
    onQueryChange,
    isLoading: isSearchLoading,
    results: searchResults,
  } = useSearch({
    filterByTypes: ['K6kJ6TTwwCcc3Dfdtbradv'], // Attribute Id for type currency
  });

  const { entities, isLoading: isEntitiesLoading } = useQueryEntities({
    where: { id: { in: searchResults.map(result => result.id) } },
  });

  React.useEffect(() => {
    setFilteredEntities(
      entities.map(entity => ({
        name: entity.name,
        symbol: entity.triples.find(t => t.attributeId === 'NMCZXJNatQS59U31sZKmMn')?.value?.value, // Attribute Id for symbol
        sign: entity.triples.find(t => t.attributeId === 'Tt2mYqE1kJTRLt2iLQjATb')?.value?.value, // Attribute Id for sign
        id: entity.id,
      }))
    );
  }, [searchResults, entities]);

  React.useEffect(() => {
    setInputValue(query);
  }, [query]);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newValue = e.currentTarget.value;
    setInputValue(newValue);
    onQueryChange(newValue);
  };

  // @TODO: Fill in, once we have entities for crypto currencies with Cryptocurrency type
  const cryptoCurrencies = React.useMemo(() => [], []);

  const fiatCurrencies = React.useMemo(
    () => [
      {
        name: 'Pound Sterling',
        symbol: 'GBP',
        id: 'KSeVvJLfx8LZb36CfYMti5',
      },
      {
        name: 'United States Dollar',
        symbol: 'USD',
        id: '2eGL8drmSYAqLoetcx3yR1',
      },
      {
        name: 'Euro',
        symbol: 'EUR',
        id: 'EWCAJP9TQoZ3EhcwyRg7mk',
      },
    ],
    []
  );

  const [defaultCurrencies, title] = React.useMemo(
    () => (type === 'CRYPTO' ? [cryptoCurrencies, 'Cryptocurrency'] : [fiatCurrencies, 'Fiat currency']),
    [type, cryptoCurrencies, fiatCurrencies]
  );

  const currencies = inputValue.length > 0 ? filteredEntities : defaultCurrencies;

  const isEmpty = currencies.length === 0;

  return (
    <>
      <div className="p-1">
        <Input value={inputValue} onChange={handleInputChange} withSearchIcon />
      </div>
      <div className="mx-1 rounded-[6px] bg-grey-01 px-3 py-1 text-footnoteMedium">{title}</div>
      <div className="p-1">
        {isSearchLoading || isEntitiesLoading ? (
          <div className="flex h-full items-center justify-center py-2">
            <Spinner />
          </div>
        ) : isEmpty ? (
          <div className="w-full bg-white px-3 py-2">
            <div className="truncate text-resultTitle text-text">No results.</div>
          </div>
        ) : (
          currencies.map(currency => (
            <SubmenuOption
              key={currency.id}
              label={currency.name || ''}
              labelRight={currency.symbol || ''}
              onClick={() => onSelect(currency.id)}
            />
          ))
        )}
      </div>
    </>
  );
};

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

type NumberTypeSubmenuView = 'number-options' | 'number-unit' | 'number-format' | 'currency-fiat' | 'currency-crypto';

export const NumberOptionsDropdown = ({ value, format = GeoNumber.defaultFormat, unitId, send }: Props) => {
  const [isOpen, setIsOpen] = React.useState<boolean>(false);
  const [viewHistory, setViewHistory] = React.useState<NumberTypeSubmenuView[]>(['number-options']);
  const currentView = viewHistory[viewHistory.length - 1];
  const [selectedNumberType, setSelectedNumberType] = React.useState<'number' | 'percentage'>(
    format.includes('percent') ? 'percentage' : 'number'
  );
  const [selectedCurrencySymbol, setSelectedCurrencySymbol] = React.useState<string | null>(null);
  const { entity } = useQueryEntity({ id: unitId });

  React.useEffect(() => {
    setSelectedCurrencySymbol(
      (unitId && entity?.triples.find(t => t.attributeId === 'NMCZXJNatQS59U31sZKmMn')?.value?.value) || null
    );
  }, [unitId, entity]);

  const handleBack = React.useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      if (viewHistory.length > 1) {
        setViewHistory(prev => prev.slice(0, -1));
      } else {
        setIsOpen(false);
      }
    },
    [viewHistory, setIsOpen, setViewHistory]
  );

  const handleNavigate = React.useCallback(
    (e: React.MouseEvent, view: NumberTypeSubmenuView) => {
      e.preventDefault();
      setViewHistory(prev => [...prev, view]);
    },
    [setViewHistory]
  );

  const toggleIsOpen = React.useCallback(() => {
    setIsOpen(prev => !prev);
    setViewHistory(['number-options']);
  }, [setIsOpen, setViewHistory]);

  const formatOptions = React.useMemo(() => {
    const options = selectedNumberType === 'percentage' ? percentageFormatOptions : numberFormatOptions;

    return Object.entries(options).map(([label, formatValue]) => ({
      label,
      value: formatValue,
      isSelected: formatValue === format,
      onClick: () => send({ format: formatValue, unitId }),
    }));
  }, [selectedNumberType, format, send, unitId]);

  const togglePercentage = React.useCallback(() => {
    const newNumberType = selectedNumberType === 'percentage' ? 'number' : 'percentage';
    setSelectedNumberType(newNumberType);
    send({
      format: newNumberType === 'percentage' ? percentageFormatOptions.Precise : numberFormatOptions.Precise,
      unitId,
    });
  }, [setSelectedNumberType, selectedNumberType, send, unitId]);

  const removeUnitId = React.useCallback(() => {
    console.log('removeUnitId', unitId);
    send({
      format,
      unitId: undefined,
    });
  }, [send, format]);

  const getFormatLabel = React.useCallback((formatString: string | undefined) => {
    if (!formatString || formatString === undefined) return 'Unspecified';

    for (const [key, value] of Object.entries(numberFormatOptions)) {
      if (value === formatString) return key;
    }

    for (const [key, value] of Object.entries(percentageFormatOptions)) {
      if (value === formatString) return key;
    }

    return 'Custom';
  }, []);

  const formatLabel = getFormatLabel(format);

  const renderContent = React.useCallback(() => {
    switch (currentView) {
      case 'number-format':
        return (
          <>
            <BackButton onClick={handleBack} />
            <NumberFormatView formatOptions={formatOptions} value={value} />
          </>
        );
      case 'number-unit':
        return (
          <>
            <BackButton onClick={handleBack} />
            <SubmenuOption
              label="Fiat Currency"
              onClick={e => handleNavigate(e, 'currency-fiat')}
              hasSubmenu
              options={formatOptions}
            />
            {/* @TODO: Uncomment, once we have entities for crypto currencies with Cryptocurrency type */}
            {/* <SubmenuOption
              label="Cryptocurrency"
              onClick={e => handleNavigate(e, 'currency-crypto')}
              hasSubmenu
              options={formatOptions}
            /> */}
            <SubmenuOption label="Unspecified" onClick={removeUnitId} options={formatOptions} isSelected={!unitId} />
          </>
        );

      case 'currency-fiat':
        return (
          <>
            <BackButton onClick={handleBack} />
            <CurrencySubmenuOption type="FIAT" onSelect={unitId => send({ format, unitId })} />
          </>
        );

      case 'currency-crypto':
        return (
          <>
            <BackButton onClick={handleBack} />
            <CurrencySubmenuOption type="CRYPTO" onSelect={unitId => send({ format, unitId })} />
          </>
        );

      case 'number-options':
      default:
        return (
          <>
            <PercentageToggle currentType={selectedNumberType} onToggle={togglePercentage} />
            <SubmenuOption
              label="Unit"
              onClick={e => handleNavigate(e, 'number-unit')}
              hasSubmenu
              subtext={selectedCurrencySymbol || 'Unspecified'}
              options={formatOptions}
            />
            <SubmenuOption
              label="Format"
              onClick={e => handleNavigate(e, 'number-format')}
              hasSubmenu
              subtext={formatLabel}
              options={formatOptions}
            />
          </>
        );
    }
  }, [currentView, formatOptions, selectedNumberType, format, value, handleBack, handleNavigate, togglePercentage]);

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
