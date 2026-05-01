'use client';

import { SystemIds } from '@geoprotocol/geo-sdk/lite';

import * as React from 'react';

import equal from 'fast-deep-equal';

import { Filter } from '~/core/blocks/data/filters';
import { useFilters } from '~/core/blocks/data/use-filters';
import { useSource } from '~/core/blocks/data/use-source';

import { SmallButton } from '~/design-system/button';
import { CreateSmall } from '~/design-system/icons/create-small';
import { Tooltip } from '~/design-system/tooltip';
import { Toggle } from '~/design-system/toggle';

import {
  TableBlockFilterPrompt,
  type TableBlockFilterPromptHandle,
  type TableBlockNewFilterRow,
} from './table-block-filter-creation-prompt';

type RenderableFilter = Filter & { columnName: string };

interface TableBlockEditableFiltersProps {
  filterState?: Filter[];
  setFilterState?: (filters: Filter[]) => void;
  filterSuggestionSpaceId?: string;
  isEditing?: boolean;
}

export const TableBlockEditableFilters = React.forwardRef<TableBlockFilterPromptHandle, TableBlockEditableFiltersProps>(
  function TableBlockEditableFilters({ filterState, setFilterState, filterSuggestionSpaceId, isEditing = true, }, ref) {
    const { setFilterState: dbSetFilterState, filterState: dbFilterState, filterableProperties } = useFilters();
    const { source } = useSource({ filterState: dbFilterState, setFilterState: dbSetFilterState });

    // Use provided props or fall back to the hook
    const effectiveFilterState = filterState ?? dbFilterState;
    const effectiveSetFilterState = setFilterState ?? dbSetFilterState;

    // We treat Name, Typs and Space as special filters even though they are not
    // always columns on the type schema for a table. We allow users to be able
    // to filter by name and space.
    const filterableColumns: RenderableFilter[] =
      source.type !== 'RELATIONS'
        ? [
            // @TODO(data blocks): We should add the default filters to the data model
            // itself instead of manually here.
            {
              columnId: SystemIds.NAME_PROPERTY,
              columnName: 'Name',
              valueType: 'TEXT',
              value: '',
              valueName: null,
            },
            ...filterableProperties
              .map(c => {
                return {
                  columnId: c.id,
                  columnName: c.name ?? '',
                  valueType: c.dataType,
                  value: '',
                  valueName: null,
                  relationValueTypes: c.relationValueTypes,
                };
              })
              // Filter out any columns with names and any columns that are not entity or string value types
              .flatMap(c => (c.columnName !== '' && (c.valueType === 'RELATION' || c.valueType === 'TEXT') ? [c] : [])),
          ]
        : [
            {
              columnId: SystemIds.RELATION_FROM_PROPERTY,
              columnName: 'From',
              valueType: 'RELATION',
              value: '',
              valueName: null,
            },
            {
              columnId: SystemIds.RELATION_TYPE_PROPERTY,
              columnName: 'Relation type',
              valueType: 'RELATION',
              value: '',
              valueName: null,
            },
          ];

    const sortedFilters = sortFilters(filterableColumns);

    const onCreateFilter = (filters: TableBlockNewFilterRow[]) => {
      if (filters.length === 0) return;
      const touchedColumnIds = new Set(filters.map(f => f.columnId));
      const base = effectiveFilterState.filter(f => !touchedColumnIds.has(f.columnId));
      const newFilters = filters.map(f => ({
        valueType: f.valueType,
        columnId: f.columnId,
        columnName: f.columnName,
        value: f.value,
        valueName: f.valueName,
      }));
      const firstTouchedIndex = effectiveFilterState.findIndex(f => touchedColumnIds.has(f.columnId));
      const insertIndex = firstTouchedIndex === -1 ? base.length : firstTouchedIndex;
      const next = [...base.slice(0, insertIndex), ...newFilters, ...base.slice(insertIndex)];
      if (equal(comparableFilterList(next), comparableFilterList(effectiveFilterState))) {
        return;
      }
      effectiveSetFilterState(next);
    };

    return (
      <div className="flex min-w-[220px] flex-1 items-center gap-3">
        <TableBlockFilterPrompt
          ref={ref}
          options={sortedFilters}
          filterSuggestionSpaceId={filterSuggestionSpaceId}
          filterStateForSeed={effectiveFilterState}
          onCreate={onCreateFilter}
          isEditing={isEditing}
          trigger={
            <SmallButton icon={<CreateSmall />} variant="secondary">
              Filter
            </SmallButton>
          }
        />
        {source.type !== 'COLLECTION' && isEditing && <QueryModeToggle />}
      </div>
    );
  }
);

function QueryModeToggle() {
  const { filterState, setFilterState } = useFilters();
  const { source } = useSource({ filterState, setFilterState });
  const isRelations = source.type === 'RELATIONS';

  return (
    <div className="ml-auto flex shrink-0 items-center gap-1 text-footnote text-grey-04">
      <span>Entities</span>
      <Tooltip
        label="Relation queries coming soon"
        position="top"
        trigger={
          <button
            type="button"
            aria-label="Relation queries coming soon"
            className="cursor-not-allowed"
            onClick={e => e.preventDefault()}
          >
            <Toggle checked={isRelations} />
          </button>
        }
      />
      <span>Relations</span>
    </div>
  );
}

function comparableFilterList(filters: Filter[]) {
  return [...filters]
    .map(f => ({
      columnId: f.columnId,
      value: f.value,
      valueType: f.valueType,
    }))
    .sort((a, b) => `${a.columnId}\0${a.value}`.localeCompare(`${b.columnId}\0${b.value}`));
}

function sortFilters(filters: RenderableFilter[]): RenderableFilter[] {
  /* Visible triples includes both real triples and placeholder triples */
  return filters.sort((renderableA, renderableB) => {
    const { columnId: attributeIdA, columnName: attributeNameA } = renderableA;
    const { columnId: attributeIdB, columnName: attributeNameB } = renderableB;

    const isNameA = attributeIdA === SystemIds.NAME_PROPERTY;
    const isNameB = attributeIdB === SystemIds.NAME_PROPERTY;
    const isDescriptionA = attributeIdA === SystemIds.DESCRIPTION_PROPERTY;
    const isDescriptionB = attributeIdB === SystemIds.DESCRIPTION_PROPERTY;
    const isTypesA = attributeIdA === SystemIds.TYPES_PROPERTY;
    const isTypesB = attributeIdB === SystemIds.TYPES_PROPERTY;

    if (isNameA && !isNameB) return -1;
    if (!isNameA && isNameB) return 1;

    if (isDescriptionA && !isDescriptionB) return -1;
    if (!isDescriptionA && isDescriptionB) return 1;

    if (isTypesA && !isTypesB) return -1;
    if (!isTypesA && isTypesB) return 1;

    return (attributeNameA || '').localeCompare(attributeNameB || '');
  });
}
