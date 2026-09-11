'use client';

import * as React from 'react';

import cx from 'classnames';

import { SmallButton } from './button';
import { CheckboxVisual } from './checkbox';
import { Check } from './icons/check';
import { ChevronDownSmall } from './icons/chevron-down-small';
import { Menu } from './menu';

/**
 * A faceted filter dropdown: a trigger showing the current selection, and a
 * popover listing options with a selection glyph and an optional result
 * count. Single-select (one `Check`) or multi-select (`CheckboxVisual` rows
 * plus an optional "All" row). Presentation only — callers own the option
 * list, its ordering and counts (see `facetCounts` in `core/bounties/filters`
 * for the bounty case).
 *
 * Two trigger styles: `pill` (the rounded filter pill of the space Community
 * tab) and `button` (`SmallButton`, as the home/governance filters use).
 */

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

export type FilterOption<K extends string = string> = {
  key: K;
  label: string;
  /** Results this option would yield, composed with the caller's other filters. */
  count?: number;
  /** Rendered but not selectable (e.g. a zero-count option kept for orientation). */
  disabled?: boolean;
};

type CommonProps<K extends string> = {
  /** Trigger text — the caller summarizes the current selection. */
  label: string;
  options: readonly FilterOption<K>[];
  trigger?: 'pill' | 'button';
  triggerClassName?: string;
  contentClassName?: string;
  maxHeightClass?: string;
  /** Selecting an option closes the popover. Defaults: single-select yes, multi-select no. */
  closeOnSelect?: boolean;
};

type SingleProps<K extends string> = CommonProps<K> & {
  multiple?: false;
  selectedKey: K | null;
  onSelect: (key: K) => void;
};

type MultipleProps<K extends string> = CommonProps<K> & {
  multiple: true;
  selectedKeys: ReadonlySet<K>;
  onToggle: (key: K) => void;
  /** Renders an "All" row above the options; checked when every option is selected (or none, if `emptyMeansAll`). */
  allLabel?: string;
  onSelectAll?: () => void;
  /** Treat an empty selection as "everything" for the All row's checked state. */
  emptyMeansAll?: boolean;
};

export type FilterMenuProps<K extends string> = SingleProps<K> | MultipleProps<K>;

const ROW_CLASS =
  'flex w-full cursor-pointer items-center gap-2 rounded px-2 py-2 text-left text-[16px] leading-[20px] text-[#2A2B2E] hover:bg-grey-01 disabled:cursor-default disabled:opacity-40 disabled:hover:bg-transparent';

function CountBadge({ count }: { count: number | undefined }) {
  if (count == null) return null;
  return (
    <span
      className="ml-auto shrink-0 pl-3 text-[14px] leading-[20px] text-grey-04 tabular-nums"
      data-testid="filter-count"
    >
      {count.toLocaleString('en-US')}
    </span>
  );
}

export function FilterMenu<K extends string>(props: FilterMenuProps<K>) {
  const { label, options, trigger = 'pill', triggerClassName, contentClassName, maxHeightClass } = props;
  const [open, setOpen] = React.useState(false);
  const closeOnSelect = props.closeOnSelect ?? !props.multiple;

  const triggerNode =
    trigger === 'pill' ? (
      <FilterPillTrigger label={label} className={cx('max-w-[220px]', triggerClassName)} />
    ) : (
      <SmallButton icon={<ChevronDownSmall />} className={triggerClassName}>
        {label}
      </SmallButton>
    );

  const allSelected: boolean = props.multiple
    ? options.every(option => props.selectedKeys.has(option.key)) ||
      (props.emptyMeansAll === true && props.selectedKeys.size === 0)
    : false;

  return (
    <Menu
      asChild
      open={open}
      onOpenChange={setOpen}
      className={cx('max-w-[280px]', contentClassName)}
      viewportClassName={cx(
        'min-h-0 w-full min-w-0 overflow-y-auto overscroll-contain bg-white [background-clip:padding-box]',
        maxHeightClass ?? 'max-h-[320px]'
      )}
      trigger={triggerNode}
    >
      <div className="flex flex-col p-2" role={props.multiple ? 'group' : 'menu'} aria-label={label}>
        {props.multiple && props.allLabel ? (
          <>
            <button
              type="button"
              role="menuitemcheckbox"
              aria-checked={allSelected}
              onClick={() => props.onSelectAll?.()}
              className={ROW_CLASS}
            >
              <CheckboxVisual checked={allSelected} />
              <span className="min-w-0 truncate">{props.allLabel}</span>
            </button>
            <div className="my-1 h-px shrink-0 bg-divider" aria-hidden />
          </>
        ) : null}

        {options.map(option => {
          const selected = props.multiple ? props.selectedKeys.has(option.key) : props.selectedKey === option.key;
          return (
            <button
              key={option.key}
              type="button"
              role={props.multiple ? 'menuitemcheckbox' : 'menuitemradio'}
              aria-checked={selected}
              disabled={option.disabled}
              onClick={() => {
                if (option.disabled) return;
                if (props.multiple) props.onToggle(option.key);
                else props.onSelect(option.key);
                if (closeOnSelect) setOpen(false);
              }}
              className={ROW_CLASS}
            >
              {props.multiple ? (
                <CheckboxVisual checked={selected} />
              ) : (
                <span
                  aria-hidden
                  className={cx('flex size-4 shrink-0 items-center justify-center', !selected && 'invisible')}
                >
                  <Check />
                </span>
              )}
              <span className="min-w-0 truncate">{option.label}</span>
              <CountBadge count={option.count} />
            </button>
          );
        })}
      </div>
    </Menu>
  );
}
