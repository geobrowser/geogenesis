import { GraphUri, GraphUrl, SYSTEM_IDS } from '@geogenesis/sdk';

import * as React from 'react';

import { Entity } from '~/core/io/dto/entities';
import { Cell, Row } from '~/core/types';
import { Entities } from '~/core/utils/entity';

import { PathSegment } from './data-selectors';

/**
 * A mapping determines which data is rendered into which UI slots
 * for a given data block.
 *
 * Reading the keys of the mapping should map to the property used
 * for the UI slot. e.g., NAME_ATTRIBUTE -> name data.
 */
export type Mapping = {
  [slotId: string]: string | null;
};

/**
 * A relation pointing to a data block stores a mapping representing how
 * the data for the block maps to the layout of the block.
 *
 * Data blocks can be rendered in any arbitrary layout, such as a table,
 * a list, or a gallery. The mapping represents slots within the layout
 * where specific data should be rendered.
 *
 * Right now Geo Genesis supports Table, List, and Gallery layouts. The mapping
 * might be consumed differently depending on the view and the query mode:
 * - Relation query mode supports mapping data to specific UI slots for every
 *   view type.
 * - Table views for Entities and Collection query modes also support the mapping,
 *   but don't provide a data selector. Instead the keys of the mapping are used
 *   to determine which columns are rendered in the table.
 * - Lists and galleries for non-Relation query modes use a default value for
 *   each UI slot defined by code rather than the mapping. e.g., the name field
 *   of the entity is always rendered in the name slot in the List/Gallery.
 */
export function useMapping() {
  const mapping = React.useMemo((): Mapping => {
    return {
      // This mapping should contain the properties being rendered to the
      // lexicon DSL for each shown column
      [SYSTEM_IDS.NAME_ATTRIBUTE]: `->[${SYSTEM_IDS.RELATION_TO_ATTRIBUTE}].[${SYSTEM_IDS.NAME_ATTRIBUTE}]`,
      ['JkzhbbrXFMfXN7sduMKQRp']: `->[JkzhbbrXFMfXN7sduMKQRp]->[${SYSTEM_IDS.RELATION_TO_ATTRIBUTE}].[${SYSTEM_IDS.NAME_ATTRIBUTE}]`,
    };
  }, []);

  // @TODO: Default mapping if one doesn't exist

  return {
    mapping,
  };
}

export function mappingToRows(entities: Entity[], slotIds: string[], collectionItems: Entity[]): Row[] {
  /**
   * Take each row, take each mapping, take each "slot" in the mapping
   * and map them into the Row structure.
   */
  return entities.map(({ name, triples, id, relationsOut, description }) => {
    const newSlots = slotIds.reduce(
      (acc, slotId) => {
        const cellTriples = triples.filter(triple => triple.attributeId === slotId);
        const cellRelations = relationsOut.filter(t => t.typeOf.id === slotId);

        const cell: Cell = {
          slotId: slotId,
          entityId: id,
          triples: cellTriples,
          relations: cellRelations,
          name,
        };

        const isNameCell = slotId === SYSTEM_IDS.NAME_ATTRIBUTE;

        if (isNameCell) {
          cell.description = description;
          cell.image = Entities.cover(relationsOut) || Entities.avatar(relationsOut) || null;

          const collectionEntity = collectionItems?.find(entity =>
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
          [slotId]: cell,
        };
      },
      {} as Record<string, Cell>
    );

    return {
      entityId: id,
      columns: newSlots,
    };
  });
}

export function mappingToCell(
  entity: Entity,
  propertyId: string,
  collectionItems: Entity[],
  lexicon: PathSegment[]
): Cell {
  /**
   * Take each row, take each mapping, take each "slot" in the mapping
   * and map them into the Row structure.
   */

  const finalSegment = lexicon[lexicon.length - 1];

  const { name, id, triples, relationsOut, description } = entity;
  const cellTriples = triples.filter(triple => triple.attributeId === finalSegment.property);
  const cellRelations = relationsOut.filter(t => t.typeOf.id === finalSegment.property);

  const cell: Cell = {
    slotId: propertyId,
    // The rendered property id is what is used to select the actual rendered _data_. The slotId
    // is the id of the UI slot where the data is rendered.
    //
    // e.g., We might want to render the name of an entity in the Roles slot.
    renderedPropertyId: finalSegment.property,
    entityId: id,
    triples: cellTriples,
    relations: cellRelations,
    name,
  };

  const isNameCell = propertyId === SYSTEM_IDS.NAME_ATTRIBUTE;

  if (isNameCell) {
    cell.description = description;
    cell.image = Entities.cover(relationsOut) ?? Entities.avatar(relationsOut) ?? null;

    const collectionEntity = collectionItems?.find(entity =>
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

  return cell;
}
