import { SYSTEM_IDS } from '@geogenesis/ids';

import { Column, Entity as IEntity, Triple as ITriple, Row } from '~/core/types';

import { Entity } from '../entity';

export type EntityCell = {
  name: string | null;
  columnId: string;
  entityId: string;
  triples: ITriple[];
  description?: string | null;
  image?: string | null;
};

export function fromColumnsAndRows(entities: IEntity[], columns: Column[]) {
  /* Finally, we can build our initialRows */
  const aggregatedRows = entities.map(({ triples, id }) => {
    return columns.reduce((acc, column) => {
      const triplesForAttribute = triples.filter(triple => triple.attributeId === column.id);

      const cellTriples = triplesForAttribute.length ? triplesForAttribute : [];

      const cell: EntityCell = {
        name: Entity.name(triples),
        columnId: column.id,
        entityId: id,
        triples: cellTriples,
      };

      if (column.id === 'name') {
        cell.description = Entity.description(triples) || null;
        cell.image = Entity.cover(triples) || Entity.avatar(triples) || null;
      }

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

export function columnsFromLocalChanges(
  localTriples: ITriple[] | undefined,
  columns: Column[],
  selectedTypeId?: string
): Column[] {
  if (!localTriples) return columns;

  // Only show the column if it is an attribute of the selected type
  const triplesThatAreAttributes = localTriples.filter(
    triple => triple.attributeId === SYSTEM_IDS.ATTRIBUTES && triple.entityId === selectedTypeId
  );

  const newColumns: Column[] = triplesThatAreAttributes.map(triple => ({
    id: triple.value.id,
    triples: localTriples.filter(t => {
      return t.entityId === triple.value.id;
    }),
  }));

  return [...columns, ...newColumns];
}
