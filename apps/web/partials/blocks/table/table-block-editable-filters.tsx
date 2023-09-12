import { SYSTEM_IDS } from '@geogenesis/ids';

import { TableBlockFilter, useTableBlock } from '~/core/state/table-block-store/table-block-store';
import { TripleValueType } from '~/core/types';
import { Entity } from '~/core/utils/entity';
import { valueTypes } from '~/core/value-types';

import { SmallButton } from '~/design-system/button';

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
    ...columns
      .map(c => {
        const maybeValueType = Entity.valueTypeId(c.triples);

        return {
          columnId: c.id,
          columnName: Entity.name(c.triples) ?? '',
          valueType: maybeValueType ? valueTypes[maybeValueType] : 'string',
          value: '',
          valueName: null,
        };
      })
      // Filter out any columns with names and any columns that are not entity or string value types
      .flatMap(c => (c.columnName !== '' && (c.valueType === 'entity' || c.valueType === 'string') ? [c] : [])),
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
        <SmallButton icon="createSmall" variant="secondary">
          Filter
        </SmallButton>
      }
    />
  );
}
