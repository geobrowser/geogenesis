'use client';

import * as React from 'react';

import cx from 'classnames';

import { ChevronDownSmall } from '~/design-system/icons/chevron-down-small';
import { Menu } from '~/design-system/menu';

export const FILTER_PILL_CLASS =
  'inline-flex shrink-0 items-center gap-1 rounded-full border border-grey-02 px-[10px] py-[7px] text-[16px] leading-[20px] font-normal text-[#2A2B2E] hover:bg-grey-01';

type FilterPillTriggerProps = { label: string } & React.ComponentPropsWithoutRef<'button'>;

export const FilterPillTrigger = React.forwardRef<HTMLButtonElement, FilterPillTriggerProps>(function FilterPillTrigger(
  { label, className, ...rest },
  ref
) {
  return (
    <button ref={ref} type="button" className={cx(FILTER_PILL_CLASS, className)} {...rest}>
      <span className="truncate">{label}</span>
      <span className="shrink-0">
        <ChevronDownSmall />
      </span>
    </button>
  );
});

const OPTION_CLASS = 'rounded px-2 py-2 text-left text-[16px] leading-[20px] hover:bg-grey-01';

export function SingleSelectPill<TValue extends string>({
  value,
  options,
  onChange,
  triggerClassName,
  contentClassName = 'max-w-[200px]',
}: {
  value: TValue;
  options: readonly { value: TValue; label: string }[];
  onChange: (next: TValue) => void;
  triggerClassName?: string;
  contentClassName?: string;
}) {
  const [open, setOpen] = React.useState(false);
  const label = options.find(option => option.value === value)?.label ?? '';

  return (
    <Menu
      asChild
      open={open}
      onOpenChange={setOpen}
      className={contentClassName}
      trigger={<FilterPillTrigger label={label} className={triggerClassName} />}
    >
      <div className="flex flex-col p-2">
        {options.map(option => (
          <button
            key={option.value}
            type="button"
            onClick={() => {
              onChange(option.value);
              setOpen(false);
            }}
            className={cx(OPTION_CLASS, option.value === value ? 'font-medium text-[#2A2B2E]' : 'text-grey-04')}
          >
            {option.label}
          </button>
        ))}
      </div>
    </Menu>
  );
}
