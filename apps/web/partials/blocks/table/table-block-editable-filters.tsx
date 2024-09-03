import { SYSTEM_IDS } from '@geogenesis/sdk';

import { TableBlockFilter, useTableBlock } from '~/core/state/table-block-store';
import { ValueType as TripleValueType } from '~/core/types';
import { valueTypes } from '~/core/value-types';

import { SmallButton } from '~/design-system/button';
import { CreateSmall } from '~/design-system/icons/create-small';

import { TableBlockFilterPrompt } from './table-block-filter-creation-prompt';

export function TableBlockEditableFilters() {
  const { setFilterState, columns, filterState } = useTableBlock();

  // We treat Name and Space as special filters even though they are not always
  // columns on the type schema for a table. We allow users to be able to filter
  // by name and space.
  const filterableColumns: (TableBlockFilter & { columnName: string })[] = [
    {
      columnId: SYSTEM_IDS.NAME,
      columnName: 'Name',
      valueType: valueTypes[SYSTEM_IDS.TEXT],
      value: '',
      valueName: null,
    },
    {
      columnId: SYSTEM_IDS.SPACE,
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
      .flatMap(c => (c.columnName !== '' && (c.valueType === 'ENTITY' || c.valueType === 'TEXT') ? [c] : [])),
  ];

  const onCreateFilter = ({
    columnId,
    value,
    valueType,
    valueName,
  }: {
    columnId: string;
    value: string;
    valueType: TripleValueType;
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
      options={filterableColumns}
      onCreate={onCreateFilter}
      trigger={
        <SmallButton icon={<CreateSmall />} variant="secondary">
          Filter
        </SmallButton>
      }
    />
  );
}
