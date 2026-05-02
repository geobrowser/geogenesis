import * as React from 'react';

import cx from 'classnames';

import { Filter, FilterMode } from '~/core/blocks/data/filters';
import { useName } from '~/core/state/entity-page-store/entity-store';

import { CloseSmall } from '~/design-system/icons/close-small';
import { Plus } from '~/design-system/icons/plus';

function FilterIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 12 12" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden>
      <path
        d="M2.73511 0.5H9.26489C10.0543 0.5 10.5325 1.37186 10.1081 2.03755L7.76692 5.71008C7.51097 6.11158 7.375 6.57782 7.375 7.05396V10.125C7.375 10.8844 6.75939 11.5 6 11.5C5.24061 11.5 4.625 10.8844 4.625 10.125V7.05396C4.625 6.57782 4.48903 6.11158 4.23308 5.71008L1.89187 2.03755C1.46751 1.37186 1.94565 0.5 2.73511 0.5Z"
        fill="currentColor"
        stroke="currentColor"
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
};

type FilterChipBaseProps = {
  label: string;
  tone: 'white' | 'grey';
  onRemove: () => void;
  disabled: boolean;
  removable: boolean;
};

function FilterChipShell({
  displayLabel,
  removeLabel,
  tone,
  onRemove,
  disabled,
  removable,
}: {
  displayLabel: string;
  removeLabel: string;
  tone: 'white' | 'grey';
  onRemove: () => void;
  disabled: boolean;
  removable: boolean;
}) {
  return (
    <span
      className={cx(
        'inline-flex h-6 max-w-full items-center gap-0.5 rounded-[4px] pl-1.5 text-metadata leading-none text-text',
        tone === 'white' ? 'bg-white' : 'bg-grey-01',
        removable ? 'border border-grey-02 pr-0.5' : 'border border-grey-02 pr-1.5'
      )}
    >
      <span className="min-w-0 truncate">{displayLabel}</span>
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
          aria-label={`Remove ${removeLabel}`}
        >
          <CloseSmall color="grey-04" />
        </button>
      )}
    </span>
  );
}

function FilterRelationChip({ label, valueId, ...rest }: FilterChipBaseProps & { valueId: string }) {
  const hydratedName = useName(valueId);
  const displayLabel = hydratedName ?? label;
  return <FilterChipShell {...rest} displayLabel={displayLabel} removeLabel={label} />;
}

function FilterTextChip({ label, ...rest }: FilterChipBaseProps) {
  return <FilterChipShell {...rest} displayLabel={label} removeLabel={label} />;
}

export function TableBlockFilterGroupPill({
  group,
  mode,
  onToggleMode,
  onDeleteValue,
  onClearGroup,
  onAddSimilar,
  isEditing,
}: TableBlockFilterGroupPillProps) {
  const hasMultipleValues = group.filters.length > 1;
  const columnLabel = group.columnName ?? 'Property';

  const canToggleMode = isEditing;
  const showAddButton = Boolean(onAddSimilar) && isEditing;
  const showGroupClearButton = isEditing;

  return (
    <div className="inline-flex max-w-full min-w-0 flex-wrap items-center gap-1 rounded-[6px] border border-grey-02 bg-white p-1">
      <div className="flex min-w-0 flex-1 flex-wrap items-center gap-1">
        <span className="flex shrink-0 items-center text-black" aria-hidden>
          <FilterIcon />
        </span>
        <span className="flex h-6 shrink-0 flex-wrap items-center gap-x-0.5 px-0.5 text-metadata leading-none text-text">
          {onAddSimilar && isEditing ? (
            <button
              type="button"
              className="whitespace-nowrap transition-colors hover:text-ctaPrimary"
              onClick={e => onAddSimilar(e.currentTarget)}
            >
              {columnLabel} is
            </button>
          ) : (
            <span className="whitespace-nowrap">{columnLabel} is</span>
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
          const canDelete = isEditing;
          const removable = isEditing && canDelete;
          const onRemove = () => onDeleteValue(originalIndex);
          const key = `${filter.columnId}-${filter.value}-${originalIndex}`;

          if (filter.valueType === 'RELATION') {
            const label = filter.valueName ?? filter.value ?? '';
            return (
              <FilterRelationChip
                key={key}
                label={label}
                valueId={filter.value}
                tone="white"
                disabled={!canDelete}
                removable={removable}
                onRemove={onRemove}
              />
            );
          }

          const label = filter.value ?? '';
          return (
            <FilterTextChip
              key={key}
              label={label}
              tone="grey"
              disabled={!canDelete}
              removable={removable}
              onRemove={onRemove}
            />
          );
        })}
        {showAddButton && (
          <button
            type="button"
            aria-label={`Add another ${columnLabel} value`}
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
          aria-label={`Clear all ${columnLabel} values`}
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
