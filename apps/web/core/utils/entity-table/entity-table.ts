import { SYSTEM_IDS } from '@geogenesis/sdk';

import { Entity } from '~/core/io/dto/entities';
import { Triple as ITriple, Row, Schema } from '~/core/types';

import { Entities } from '../entity';

export type EntityCell = {
  name: string | null;
  columnId: string;
  entityId: string;
  triples: ITriple[];
  description?: string | null;
  image?: string | null;
};

export function fromColumnsAndRows(entities: Entity[], columns: Schema[]): Row[] {
  /* Finally, we can build our initialRows */
  const aggregatedRows = entities.map(({ name, triples, id, relationsOut, description }) => {
    return columns.reduce((acc, column) => {
      // @TODO: Might be relations for attribute id as well
      const triplesForAttribute = triples.filter(triple => triple.attributeId === column.id);
      const cellTriples = triplesForAttribute.length ? triplesForAttribute : [];

      const cell: EntityCell = {
        name,
        columnId: column.id,
        entityId: id,
        triples: cellTriples,
      };

      if (column.id === SYSTEM_IDS.NAME) {
        cell.description = description;
        cell.image = Entities.cover(relationsOut) || Entities.avatar(relationsOut) || null;
      }

      return {
        ...acc,
        [column.id]: cell,
      };
    }, {} as Row);
  });

  return aggregatedRows;
}
