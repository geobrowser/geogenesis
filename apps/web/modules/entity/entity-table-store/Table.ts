import { SYSTEM_IDS } from '@geogenesis/ids';
import { A, D, pipe } from '@mobily/ts-belt';
import { Triple } from '~/modules/triple';
import { Action, Column, Row, Triple as TripleType } from '~/modules/types';
import { DEFAULT_PAGE_SIZE, Entity } from '..';

export function fromColumnsAndRows(spaceId: string, rows: TripleType[], columns: Column[]) {
  const rowTriplesWithEntityIds = Entity.entitiesFromTriples(rows);

  /* Finally, we can build our initialRows */
  const aggregatedRows = rowTriplesWithEntityIds.map(({ triples, id }) => {
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
    hasNextPage: rowTriplesWithEntityIds.length > DEFAULT_PAGE_SIZE,
  };
}

export function columnsFromActions(actions: Action[] | undefined, columns: Column[]): Column[] {
  if (!actions) return columns;

  const newTriples = Triple.fromActions(
    actions,
    columns.flatMap(t => t.triples)
  );
  const triplesWithNames = Triple.withLocalNames(actions, newTriples);
  const triplesThatAreAttributes = triplesWithNames.filter(triple => triple.attributeId === SYSTEM_IDS.ATTRIBUTES);

  const newColumns: Column[] = triplesThatAreAttributes.map(triple => ({
    id: triple.value.id,
    triples: triplesWithNames.filter(t => {
      return t.entityId === triple.value.id;
    }),
  }));

  return [...columns, ...newColumns];
}
