import { SYSTEM_IDS } from '@geogenesis/sdk';

import { Entity } from '~/core/io/dto/entities';
import { Cell, Row, Schema } from '~/core/types';

import { Entities } from '../entity';

export function fromColumnsAndRows(entities: Entity[], columns: Schema[]): Row[] {
  return entities.map(({ name, triples, id, relationsOut, description }) => {
    const newColumns = columns.reduce(
      (acc, column) => {
        const cellTriples = triples.filter(triple => triple.attributeId === column.id);
        const cellRelations = relationsOut.filter(t => t.typeOf.id === column.id);

        const cell: Cell = {
          columnId: column.id,
          entityId: id,
          triples: cellTriples,
          relations: cellRelations,
          name,
        };

        if (column.id === SYSTEM_IDS.NAME) {
          cell.description = description;
          cell.image = Entities.cover(relationsOut) || Entities.avatar(relationsOut) || null;
        }

        return {
          ...acc,
          [column.id]: cell,
        };
      },
      {} as Record<string, Cell>
    );

    return {
      entityId: id,
      columns: newColumns,
    };
  });
}
