import { SYSTEM_IDS } from '@geogenesis/sdk';

import { TableBlockFilter, useTableBlock } from '~/core/state/table-block-store';
import { FilterableValueType, valueTypes } from '~/core/value-types';

import { SmallButton } from '~/design-system/button';
import { CreateSmall } from '~/design-system/icons/create-small';

import { TableBlockFilterPrompt } from './table-block-filter-creation-prompt';

type RenderableFilter = TableBlockFilter & { columnName: string };

export function TableBlockEditableFilters() {
  const { setFilterState, columns, filterState } = useTableBlock();

  // We treat Name, Typs and Space as special filters even though they are not
  // always columns on the type schema for a table. We allow users to be able
  // to filter by name and space.
  const filterableColumns: RenderableFilter[] = [
    // @TODO(data blocks): We should add the default filters to the data model
    // itself instead of manually here.
    // {
    //   columnId: SYSTEM_IDS.NAME,
    //   columnName: 'Name',
    //   valueType: valueTypes[SYSTEM_IDS.TEXT],
    //   value: '',
    //   valueName: null,
    // },
    {
      columnId: SYSTEM_IDS.SPACE_FILTER,
      columnName: 'Space',
      valueType: valueTypes[SYSTEM_IDS.TEXT],
      value: '',
      valueName: null,
    },
    {
      columnId: SYSTEM_IDS.TYPES,
      columnName: 'Types',
      valueType: valueTypes[SYSTEM_IDS.RELATION],
      value: '',
      valueName: null,
    },
    ...columns
      .map(c => {
        return {
          columnId: c.id,
          columnName: c.name ?? '',
          valueType: valueTypes[c.valueType],
          value: '',
          valueName: null,
        };
      })
      // Filter out any columns with names and any columns that are not entity or string value types
      .flatMap(c => (c.columnName !== '' && (c.valueType === 'RELATION' || c.valueType === 'TEXT') ? [c] : [])),
  ];

  const sortedFilters = sortFilters(filterableColumns);

  const onCreateFilter = ({
    columnId,
    value,
    valueType,
    valueName,
  }: {
    columnId: string;
    value: string;
    valueType: FilterableValueType;
    valueName: string | null;
  }) => {
    setFilterState([
      ...filterState,
      {
        valueType,
        columnId,
        value,
        valueName,
      },
    ]);
  };

  return (
    <TableBlockFilterPrompt
      options={sortedFilters}
      onCreate={onCreateFilter}
      trigger={
        <SmallButton icon={<CreateSmall />} variant="secondary">
          Filter
        </SmallButton>
      }
    />
  );
}

function sortFilters(filters: RenderableFilter[]): RenderableFilter[] {
  /* Visible triples includes both real triples and placeholder triples */
  return filters.sort((renderableA, renderableB) => {
    const { columnId: attributeIdA, columnName: attributeNameA } = renderableA;
    const { columnId: attributeIdB, columnName: attributeNameB } = renderableB;

    const isNameA = attributeIdA === SYSTEM_IDS.NAME;
    const isNameB = attributeIdB === SYSTEM_IDS.NAME;
    const isDescriptionA = attributeIdA === SYSTEM_IDS.DESCRIPTION;
    const isDescriptionB = attributeIdB === SYSTEM_IDS.DESCRIPTION;
    const isTypesA = attributeIdA === SYSTEM_IDS.TYPES;
    const isTypesB = attributeIdB === SYSTEM_IDS.TYPES;

    if (isNameA && !isNameB) return -1;
    if (!isNameA && isNameB) return 1;

    if (isDescriptionA && !isDescriptionB) return -1;
    if (!isDescriptionA && isDescriptionB) return 1;

    if (isTypesA && !isTypesB) return -1;
    if (!isTypesA && isTypesB) return 1;

    return (attributeNameA || '').localeCompare(attributeNameB || '');
  });
}
