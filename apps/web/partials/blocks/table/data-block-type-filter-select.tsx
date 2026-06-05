'use client';

import { SystemIds } from '@geoprotocol/geo-sdk/lite';
import * as Dropdown from '@radix-ui/react-dropdown-menu';

import * as React from 'react';

import cx from 'classnames';

import { useSearch } from '~/core/hooks/use-search';

import { Check } from '~/design-system/icons/check';
import { ChevronDownSmall } from '~/design-system/icons/chevron-down-small';
import { Input } from '~/design-system/input';
import { trapWheelToElement } from '~/design-system/trap-wheel-scroll';
import { useAdaptiveDropdownPlacement } from '~/design-system/use-adaptive-dropdown-placement';

const pillClassName =
  'inline-flex h-6 max-w-[220px] shrink-0 items-center gap-1.5 rounded border border-grey-02 bg-white px-1.5 text-metadata leading-none text-text shadow-button transition hover:border-text hover:bg-bg focus:outline-hidden disabled:pointer-events-none disabled:opacity-50';

const listScrollClassName =
  'max-h-[198px] min-h-0 overflow-y-auto overscroll-contain scroll-smooth snap-y snap-mandatory';
const listRowClassName = 'snap-start min-h-[44px] shrink-0';

type Props = {
  selectedType: { id: string; name: string | null } | null;
  onSelectType: (type: { id: string; name: string | null }) => void;
  disabled?: boolean;
  variant?: 'default' | 'setup';
  placeholder?: string;
};

export function DataBlockTypeFilterSelect({
  selectedType,
  onSelectType,
  disabled = false,
  variant = 'default',
  placeholder = 'Select type...',
}: Props) {
  const triggerRef = React.useRef<HTMLButtonElement>(null);
  const [open, setOpen] = React.useState(false);

  const { align, side } = useAdaptiveDropdownPlacement(triggerRef, {
    isOpen: open,
    preferredHeight: 280,
    gap: 8,
  });

  const onListWheel = React.useCallback((e: React.WheelEvent<HTMLDivElement>) => {
    trapWheelToElement(e.currentTarget, e);
  }, []);

  const { query, onQueryChange, isLoading, isEmpty, results } = useSearch({
    filterByTypes: [SystemIds.SCHEMA_TYPE],
    enabled: open,
  });

  React.useEffect(() => {
    if (open) return;
    onQueryChange('');
  }, [open, onQueryChange]);

  const label = selectedType?.name?.trim() || (selectedType?.id ? 'Type selected' : placeholder);
  const triggerClassName = variant === 'setup' ? cx(pillClassName, 'max-w-[280px]') : pillClassName;

  return (
    <Dropdown.Root
      open={open}
      onOpenChange={next => {
        if (disabled && next) return;
        setOpen(next);
      }}
    >
      <Dropdown.Trigger asChild disabled={disabled}>
        <button ref={triggerRef} type="button" className={triggerClassName}>
          <span className={cx('min-w-0 flex-1 truncate text-left', !selectedType && 'text-grey-03')}>{label}</span>
          <span className={cx('inline-flex shrink-0 transition-transform', open && 'rotate-180')}>
            <ChevronDownSmall color="grey-04" />
          </span>
        </button>
      </Dropdown.Trigger>
      <Dropdown.Portal>
        <Dropdown.Content
          side={side}
          align={variant === 'setup' ? 'start' : align}
          sideOffset={8}
          className="z-50 w-[min(320px,var(--radix-dropdown-menu-content-available-width))] rounded-lg border border-grey-02 bg-white py-2 shadow-lg"
          onCloseAutoFocus={e => e.preventDefault()}
        >
          <div className="px-2 pb-2">
            <Input
              value={query}
              onChange={e => onQueryChange(e.target.value)}
              placeholder="Search types..."
              autoFocus
            />
          </div>
          <div className={listScrollClassName} onWheel={onListWheel}>
            {isLoading && <div className="px-3 py-2 text-button text-grey-04">Loading...</div>}
            {!isLoading && isEmpty && <div className="px-3 py-2 text-button text-grey-04">No types found.</div>}
            {results?.map(result => {
              const selected = selectedType?.id === result.id;
              return (
                <Dropdown.Item
                  key={result.id}
                  textValue={result.name ?? ''}
                  className={cx(
                    'flex w-full cursor-pointer items-center justify-between gap-2 px-3 py-[10px] text-button text-text outline-none select-none',
                    listRowClassName,
                    selected ? 'bg-grey-01' : 'bg-white data-highlighted:bg-grey-01'
                  )}
                  onSelect={e => {
                    e.preventDefault();
                    onSelectType({ id: result.id, name: result.name });
                    setOpen(false);
                  }}
                >
                  <span className="truncate">{result.name}</span>
                  {selected ? <Check /> : null}
                </Dropdown.Item>
              );
            })}
          </div>
        </Dropdown.Content>
      </Dropdown.Portal>
    </Dropdown.Root>
  );
}
