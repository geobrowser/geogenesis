import { SYSTEM_IDS } from '@geogenesis/ids';

import { Triple } from '~/modules/triple';
import { Action, Column, Entity, Row } from '~/modules/types';

export function fromColumnsAndRows(entities: Entity[], columns: Column[]) {
  /* Finally, we can build our initialRows */
  const aggregatedRows = entities.map(({ triples, id }) => {
    return columns.reduce((acc, column) => {
      const triplesForAttribute = triples.filter(triple => triple.attributeId === column.id);

      const cellTriples = triplesForAttribute.length ? triplesForAttribute : [];

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
