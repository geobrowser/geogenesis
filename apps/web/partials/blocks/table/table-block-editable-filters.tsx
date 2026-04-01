'use client';

import { SystemIds } from '@geoprotocol/geo-sdk';

import * as React from 'react';

import { Filter } from '~/core/blocks/data/filters';
import { useFilters } from '~/core/blocks/data/use-filters';
import { useSource } from '~/core/blocks/data/use-source';
import type { Row } from '~/core/types';

import { SmallButton } from '~/design-system/button';
import { CreateSmall } from '~/design-system/icons/create-small';

import {
  TableBlockFilterPrompt,
  type TableBlockFilterPromptHandle,
  type TableBlockNewFilterRow,
} from './table-block-filter-creation-prompt';

type RenderableFilter = Filter & { columnName: string };

interface TableBlockEditableFiltersProps {
  filterState?: Filter[];
  setFilterState?: (filters: Filter[]) => void;
  /** Rows from the current table page (fallback when no full ID list) */
  filterSuggestionRows?: Row[];
  /** All row entity IDs matching active table filters (COLLECTION blocks). Powers suggestions across the full filtered set, not only the current page. */
  filterSuggestionEntityIds?: string[];
  filterSuggestionSpaceId?: string;
}

export const TableBlockEditableFilters = React.forwardRef<TableBlockFilterPromptHandle, TableBlockEditableFiltersProps>(
  function TableBlockEditableFilters(
    { filterState, setFilterState, filterSuggestionRows, filterSuggestionEntityIds, filterSuggestionSpaceId },
    ref
  ) {
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
            // {
            //   columnId: SystemIds.NAME_PROPERTY,
            //   columnName: 'Name',
            //   valueType: valueTypes[SystemIds.TEXT],
            //   value: '',
            //   valueName: null,
            // },
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
      const newFilters = [
        ...effectiveFilterState,
        ...filters.map(f => ({
          valueType: f.valueType,
          columnId: f.columnId,
          columnName: f.columnName,
          value: f.value,
          valueName: f.valueName,
        })),
      ];
      effectiveSetFilterState(newFilters);
    };

    return (
      <TableBlockFilterPrompt
        ref={ref}
        options={sortedFilters}
        filterSuggestionRows={filterSuggestionRows}
        filterSuggestionEntityIds={filterSuggestionEntityIds}
        filterSuggestionSpaceId={filterSuggestionSpaceId}
        onCreate={onCreateFilter}
        trigger={
          <SmallButton icon={<CreateSmall />} variant="secondary">
            Filter
          </SmallButton>
        }
      />
    );
  }
);

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
