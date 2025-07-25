import { SystemIds } from '@graphprotocol/grc-20';

import { Filter } from '~/core/blocks/data/filters';
import { useFilters } from '~/core/blocks/data/use-filters';
import { useSource } from '~/core/blocks/data/use-source';
import { FilterableValueType } from '~/core/value-types';

import { SmallButton } from '~/design-system/button';
import { CreateSmall } from '~/design-system/icons/create-small';

import { TableBlockFilterPrompt } from './table-block-filter-creation-prompt';

type RenderableFilter = Filter & { columnName: string };

export function TableBlockEditableFilters() {
  const { source } = useSource();
  const { setFilterState, filterState, filterableProperties } = useFilters();

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
        columnName: null,
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
