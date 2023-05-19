import { SYSTEM_IDS } from '@geogenesis/ids';
import { TableBlockFilter, useTableBlock } from './table-block-store';
import { valueTypes } from '~/modules/value-types';
import { TripleValueType } from '~/modules/types';
import { SmallButton } from '~/modules/design-system/button';
import { Entity } from '~/modules/entity';
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
      .map(c => ({
        columnId: c.id,
        columnName: Entity.name(c.triples) ?? '',
        valueType: valueTypes[Entity.valueTypeId(c.triples) ?? ''],
        value: '',
        valueName: null,
      }))
      .flatMap(c => (c.columnName !== '' ? [c] : [])),
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
