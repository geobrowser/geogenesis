import { SYSTEM_IDS } from '@geogenesis/sdk';

import { Entity } from '~/core/io/dto/entities';
import { Cell, Row, Schema } from '~/core/types';

import { Entities } from '../entity';

export function fromColumnsAndRows(entities: Entity[], columns: Schema[], collectionItemEntities?: Entity[]): Row[] {
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

        const isNameCell = column.id === SYSTEM_IDS.NAME;

        if (isNameCell) {
          cell.description = description;
          cell.image = Entities.cover(relationsOut) || Entities.avatar(relationsOut) || null;

          const collectionEntity = collectionItemEntities?.find(
            entity =>
              entity.triples.find(triple => triple.attributeId === SYSTEM_IDS.RELATION_TO_ATTRIBUTE)?.value.value ===
              cell.entityId
          );

          if (collectionEntity) {
            const sourceSpaceTriple = collectionEntity.triples.find(
              triple => triple.attributeId === SYSTEM_IDS.SOURCE_SPACE_ATTRIBUTE
            );

            if (sourceSpaceTriple) {
              cell.space = sourceSpaceTriple.value.value;

              const verifiedSourceTriple = collectionEntity.triples.find(
                triple => triple.attributeId === SYSTEM_IDS.VERIFIED_SOURCE_ATTRIBUTE
              );

              if (verifiedSourceTriple) {
                cell.verified = verifiedSourceTriple.value.value === '1';
              }
            }
          }
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
