import * as React from 'react';

import cx from 'classnames';

import { Filter, FilterMode } from '~/core/blocks/data/filters';

import { CloseSmall } from '~/design-system/icons/close-small';
import { colors } from '~/design-system/theme/colors';

function PublishedFilterIconFilled() {
  return (
    <svg width="12" height="12" viewBox="0 0 12 12" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path
        d="M2.73511 0.5H9.26489C10.0543 0.5 10.5325 1.37186 10.1081 2.03755L7.76692 5.71008C7.51097 6.11158 7.375 6.57782 7.375 7.05396V10.125C7.375 10.8844 6.75939 11.5 6 11.5C5.24061 11.5 4.625 10.8844 4.625 10.125V7.05396C4.625 6.57782 4.48903 6.11158 4.23308 5.71008L1.89187 2.03755C1.46751 1.37186 1.94565 0.5 2.73511 0.5Z"
        fill={colors['light'].text}
        stroke={colors['light'].text}
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
  onAddSimilar?: () => void;
  isEditing: boolean;
  serverFilterKeys: Set<string>;
};

function filterKey(f: Filter): string {
  return `${f.columnId}:${f.value}`;
}

export function TableBlockFilterGroupPill({
  group,
  mode,
  onToggleMode,
  onDeleteValue,
  onAddSimilar,
  isEditing,
  serverFilterKeys,
}: TableBlockFilterGroupPillProps) {
  const hasMultipleValues = group.filters.length > 1;

  // In non-edit mode, filter results are display-only.
  const canToggleMode = isEditing;

  return (
    <div className="flex h-6 items-center gap-2 rounded border border-grey-02 bg-white py-1 pr-1 pl-2 text-metadata">
      <PublishedFilterIconFilled />
      <div className="flex items-center gap-1">
        <span className="whitespace-nowrap">
          {isEditing && onAddSimilar ? (
            <button type="button" className="transition-colors hover:text-ctaPrimary" onClick={onAddSimilar}>
              {group.columnName} is
            </button>
          ) : (
            <>{group.columnName} is</>
          )}
          {hasMultipleValues && (
            <>
              {' '}
              {canToggleMode ? (
                <button type="button" className="text-grey-04 transition-colors hover:text-text" onClick={onToggleMode}>
                  ({mode === 'OR' ? 'or' : 'and'})
                </button>
              ) : (
                <span className="text-grey-04">({mode === 'OR' ? 'or' : 'and'})</span>
              )}
            </>
          )}
          :
        </span>
        <div className={cx('flex items-center gap-1')}>
          {group.filters.map(({ filter, originalIndex }, i) => {
            const value = filter.valueType === 'RELATION' ? filter.valueName : filter.value;
            const canDelete = isEditing;

            return (
              <React.Fragment key={`${filter.columnId}-${filter.value}`}>
                <span className="inline-flex h-5 items-center gap-1 rounded-sm bg-grey-01 pr-1 pl-2">
                  <span className="whitespace-nowrap">{value}</span>
                  {canDelete && (
                    <button
                      type="button"
                      className="inline-flex h-4 w-4 items-center justify-center rounded-sm text-grey-04 transition-colors hover:bg-grey-02 hover:text-text"
                      onClick={() => onDeleteValue(originalIndex)}
                      aria-label={`Remove ${value ?? 'filter'} value`}
                    >
                      <CloseSmall color="grey-04" />
                    </button>
                  )}
                </span>
              </React.Fragment>
            );
          })}
          {isEditing && onAddSimilar && (
            <button
              type="button"
              className="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-sm bg-grey-01 text-grey-04 transition-colors hover:bg-grey-02 hover:text-text"
              onClick={onAddSimilar}
              aria-label={`Add ${group.columnName ?? 'filter'} filter`}
              title={`Add ${group.columnName ?? 'filter'} filter`}
            >
              +
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
