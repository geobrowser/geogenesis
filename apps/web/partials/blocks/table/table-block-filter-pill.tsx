import * as React from 'react';

import cx from 'classnames';

import { Filter, FilterMode } from '~/core/blocks/data/filters';

import { CloseSmall } from '~/design-system/icons/close-small';
import { Plus } from '~/design-system/icons/plus';

function FilterIconBlack() {
  return (
    <svg width="12" height="12" viewBox="0 0 12 12" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden>
      <path
        d="M2.73511 0.5H9.26489C10.0543 0.5 10.5325 1.37186 10.1081 2.03755L7.76692 5.71008C7.51097 6.11158 7.375 6.57782 7.375 7.05396V10.125C7.375 10.8844 6.75939 11.5 6 11.5C5.24061 11.5 4.625 10.8844 4.625 10.125V7.05396C4.625 6.57782 4.48903 6.11158 4.23308 5.71008L1.89187 2.03755C1.46751 1.37186 1.94565 0.5 2.73511 0.5Z"
        fill="#000000"
        stroke="#000000"
        strokeLinecap="round"
      />
    </svg>
  );
}

export type FilterGroup = {
  columnId: string;
  columnName: string | null;
  filters: { filter: Filter; originalIndex: number }[];
};

export function groupFilters(filters: Filter[]): FilterGroup[] {
  const groups = new Map<string, FilterGroup>();

  filters.forEach((f, index) => {
    const existing = groups.get(f.columnId);
    if (existing) {
      existing.filters.push({ filter: f, originalIndex: index });
    } else {
      groups.set(f.columnId, {
        columnId: f.columnId,
        columnName: f.columnName,
        filters: [{ filter: f, originalIndex: index }],
      });
    }
  });

  return Array.from(groups.values());
}

type TableBlockFilterGroupPillProps = {
  group: FilterGroup;
  mode: FilterMode;
  onToggleMode: () => void;
  onDeleteValue: (originalIndex: number) => void;
  onClearGroup: () => void;
  onAddSimilar?: (anchorEl: HTMLElement) => void;
  isEditing: boolean;
  serverFilterKeys: Set<string>;
};

function filterKey(f: Filter): string {
  return `${f.columnId}:${f.value}`;
}

function FilterValueChip({
  label,
  onRemove,
  disabled,
  removable,
}: {
  label: string;
  onRemove: () => void;
  disabled: boolean;
  removable: boolean;
}) {
  return (
    <span
      className={cx(
        'inline-flex max-w-full items-center gap-0.5 rounded-sm py-0.5 pl-1.5 text-[0.8125rem] text-text',
        removable ? 'border border-grey-02 bg-grey-01 pr-0.5' : 'border-0 bg-grey-01 pr-1.5'
      )}
    >
      <span className="min-w-0 truncate">{label}</span>
      {removable && (
        <button
          type="button"
          disabled={disabled}
          className={cx(
            'flex shrink-0 rounded p-0.5 text-grey-04 hover:bg-grey-02 hover:text-text',
            disabled && 'pointer-events-none opacity-30'
          )}
          onClick={e => {
            e.stopPropagation();
            onRemove();
          }}
          aria-label={`Remove ${label}`}
        >
          <CloseSmall color="grey-04" />
        </button>
      )}
    </span>
  );
}

export function TableBlockFilterGroupPill({
  group,
  mode,
  onToggleMode,
  onDeleteValue,
  onClearGroup,
  onAddSimilar,
  isEditing,
  serverFilterKeys,
}: TableBlockFilterGroupPillProps) {
  const hasMultipleValues = group.filters.length > 1;

  const hasAnyLocalFilter = group.filters.some(({ filter }) => !serverFilterKeys.has(filterKey(filter)));
  const canToggleMode = isEditing || hasAnyLocalFilter;
  const showAddButton = Boolean(onAddSimilar) && isEditing;
  const showGroupClearButton = isEditing;

  return (
    <div
      className={cx(
        'inline-flex max-w-full min-w-0 flex-wrap items-center gap-1.5 rounded-md px-2 py-1.5',
        isEditing ? 'border border-grey-02 bg-white' : 'border-0 bg-grey-01'
      )}
    >
      <div className="flex min-w-0 flex-1 flex-wrap items-center gap-1.5">
        <span className="flex shrink-0 items-center text-black" aria-hidden>
          <FilterIconBlack />
        </span>
        <span className="flex shrink-0 flex-wrap items-baseline gap-x-0.5 text-[0.8125rem] text-text">
          {onAddSimilar && isEditing ? (
            <button
              type="button"
              className="whitespace-nowrap transition-colors hover:text-ctaPrimary"
              onClick={e => onAddSimilar(e.currentTarget)}
            >
              {group.columnName} is
            </button>
          ) : (
            <span className="whitespace-nowrap">{group.columnName} is</span>
          )}
          {hasMultipleValues && (
            <>
              {' '}
              {isEditing && canToggleMode ? (
                <button type="button" className="text-grey-04 transition-colors hover:text-text" onClick={onToggleMode}>
                  ({mode === 'OR' ? 'or' : 'and'})
                </button>
              ) : (
                <span className="text-grey-04">({mode === 'OR' ? 'or' : 'and'})</span>
              )}
            </>
          )}
        </span>
        {group.filters.map(({ filter, originalIndex }) => {
          const value =
            filter.valueType === 'RELATION' ? (filter.valueName ?? filter.value) : filter.value;
          const canDelete = isEditing || !serverFilterKeys.has(filterKey(filter));
          const label = value ?? '';

          return (
            <FilterValueChip
              key={`${filter.columnId}-${filter.value}-${originalIndex}`}
              label={label}
              disabled={!canDelete}
              removable={isEditing && canDelete}
              onRemove={() => onDeleteValue(originalIndex)}
            />
          );
        })}
        {showAddButton && (
          <button
            type="button"
            aria-label={`Add another ${group.columnName ?? 'filter'} value`}
            title="Add filter value"
            onClick={e => {
              e.stopPropagation();
              onAddSimilar?.(e.currentTarget);
            }}
            className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-sm border border-grey-02 bg-grey-01 text-grey-04 transition hover:bg-grey-02 hover:text-text"
          >
            <span className="inline-flex h-3 w-3 items-center justify-center [&_svg]:h-full [&_svg]:w-full [&_svg]:max-h-3 [&_svg]:max-w-3">
              <Plus color="grey-04" />
            </span>
          </button>
        )}
      </div>
      {showGroupClearButton && (
        <button
          type="button"
          className="ml-auto flex h-6 w-6 shrink-0 items-center justify-center rounded-sm border border-grey-02 bg-grey-01 text-grey-04 transition hover:bg-grey-02 hover:text-text"
          aria-label={`Clear all ${group.columnName ?? 'filter'} values`}
          title="Clear filter group"
          onClick={e => {
            e.stopPropagation();
            onClearGroup();
          }}
        >
          <CloseSmall color="grey-04" />
        </button>
      )}
    </div>
  );
}
