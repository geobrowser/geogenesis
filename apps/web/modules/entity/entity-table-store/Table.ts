import { SYSTEM_IDS } from '@geogenesis/ids';
import { Triple } from '~/modules/triple';
import { Action, Column, Entity, Row } from '~/modules/types';
import { DEFAULT_PAGE_SIZE } from '..';

export function fromColumnsAndRows(spaceId: string, entities: Entity[], columns: Column[]) {
  /* Finally, we can build our initialRows */
  const aggregatedRows = entities.map(({ triples, id }) => {
    return columns.reduce((acc, column) => {
      const triplesForAttribute = triples.filter(triple => triple.attributeId === column.id);

      /* We are optional chaining here since there might not be any value type triples associated with the type attribute */
      const columnValueTypeTriple = column.triples.find(triple => triple.attributeId === SYSTEM_IDS.VALUE_TYPE);
      const columnValueType = columnValueTypeTriple?.value.id;

      const defaultTriple = {
        ...Triple.emptyPlaceholder(spaceId, id, columnValueType),
        attributeId: column.id,
      };

      const cellTriples = triplesForAttribute.length ? triplesForAttribute : [defaultTriple];

      const cell = {
        columnId: column.id,
        entityId: id,
        triples: cellTriples,
      };

      return {
        ...acc,
        [column.id]: cell,
      };
    }, {} as Row);
  });

  return {
    rows: aggregatedRows,
    hasNextPage: entities.length > DEFAULT_PAGE_SIZE,
  };
}

export function columnsFromActions(
  actions: Action[] | undefined,
  columns: Column[],
  selectedTypeId?: string
): Column[] {
  if (!actions) return columns;

  const newTriples = Triple.fromActions(
    actions,
    columns.flatMap(t => t.triples)
  );

  const triplesWithNames = Triple.withLocalNames(actions, newTriples);

  // Only show the column if it is an attribute of the selected type
  const triplesThatAreAttributes = triplesWithNames.filter(
    triple => triple.attributeId === SYSTEM_IDS.ATTRIBUTES && triple.entityId === selectedTypeId
  );

  const newColumns: Column[] = triplesThatAreAttributes.map(triple => ({
    id: triple.value.id,
    triples: triplesWithNames.filter(t => {
      return t.entityId === triple.value.id;
    }),
  }));

  return [...columns, ...newColumns];
}
