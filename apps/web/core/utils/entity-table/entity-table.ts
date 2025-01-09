import { GraphUrl, SYSTEM_IDS } from '@geogenesis/sdk';
import type { GraphUri } from '@geogenesis/sdk';

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

        const isNameCell = column.id === SYSTEM_IDS.NAME_ATTRIBUTE;

        if (isNameCell) {
          cell.description = description;
          cell.image = Entities.cover(relationsOut) || Entities.avatar(relationsOut) || null;

          const collectionEntity = collectionItemEntities?.find(
            entity =>
              entity.triples
                .find(triple => triple.attributeId === SYSTEM_IDS.RELATION_TO_ATTRIBUTE)
                ?.value.value.startsWith(`graph://${cell.entityId}`)
          );

          if (collectionEntity) {
            const url = collectionEntity.triples.find(triple => triple.attributeId === SYSTEM_IDS.RELATION_TO_ATTRIBUTE)
              ?.value.value;

            if (url?.startsWith('graph://')) {
              const spaceId = GraphUrl.toSpaceId(url as GraphUri);

              if (spaceId) {
                cell.space = spaceId;

                const verifiedSourceTriple = collectionEntity.triples.find(
                  triple => triple.attributeId === SYSTEM_IDS.VERIFIED_SOURCE_ATTRIBUTE
                );

                if (verifiedSourceTriple) {
                  cell.verified = verifiedSourceTriple.value.value === '1';
                }
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
