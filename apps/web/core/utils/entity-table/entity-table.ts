import { SYSTEM_IDS } from '@geogenesis/sdk';

import { Entity } from '~/core/io/dto/entities';
import { Column, Triple as ITriple, Row } from '~/core/types';

import { Entities } from '../entity';

export type EntityCell = {
  name: string | null;
  columnId: string;
  entityId: string;
  triples: ITriple[];
  description?: string | null;
  image?: string | null;
};

export function fromColumnsAndRows(entities: Entity[], columns: Column[]) {
  /* Finally, we can build our initialRows */
  const aggregatedRows = entities.map(({ triples, id }) => {
    return columns.reduce((acc, column) => {
      const triplesForAttribute = triples.filter(triple => triple.attributeId === column.id);

      const cellTriples = triplesForAttribute.length ? triplesForAttribute : [];

      const cell: EntityCell = {
        name: Entities.name(triples),
        columnId: column.id,
        entityId: id,
        triples: cellTriples,
      };

      if (column.id === SYSTEM_IDS.NAME) {
        cell.description = Entities.description(triples) || null;
        cell.image = Entities.cover(triples) || Entities.avatar(triples) || null;
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
    id: triple.value.value,
    triples: localTriples.filter(t => {
      return t.entityId === triple.value.value;
    }),
  }));

  return [...columns, ...newColumns];
}
