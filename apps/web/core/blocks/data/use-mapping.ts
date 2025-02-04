import { GraphUri, GraphUrl, SYSTEM_IDS } from '@geogenesis/sdk';
import { keepPreviousData, useQuery } from '@tanstack/react-query';

import { getRelations } from '~/core/database/relations';
import { getTriples } from '~/core/database/triples';
import { Entity } from '~/core/io/dto/entities';
import { fetchEntitiesBatch } from '~/core/io/subgraph/fetch-entities-batch';
import { Cell, RenderableProperty, Row } from '~/core/types';
import { Entities } from '~/core/utils/entity';
import { toRenderables } from '~/core/utils/to-renderables';

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

export function useMapping(
  blockRelationId: string,
  shownPropertyRelationEntityIds: string[]
): {
  mapping: Mapping;
  isLoading: boolean;
  isFetched: boolean;
} {
  // const mapping: Mapping = {
  //   // Should render the to relation as a pill
  //   [SYSTEM_IDS.NAME_ATTRIBUTE]: `->[${SYSTEM_IDS.RELATION_TO_ATTRIBUTE}]`,
  //   // Should render the roles to entities as a pill
  //   ['JkzhbbrXFMfXN7sduMKQRp']: `->[JkzhbbrXFMfXN7sduMKQRp]->[${SYSTEM_IDS.RELATION_TO_ATTRIBUTE}]`,
  //   [CONTENT_IDS.AVATAR_ATTRIBUTE]: `->[${SYSTEM_IDS.RELATION_TO_ATTRIBUTE}]->[${CONTENT_IDS.AVATAR_ATTRIBUTE}]->[${SYSTEM_IDS.RELATION_TO_ATTRIBUTE}]`,
  //   // [SYSTEM_IDS.COVER_ATTRIBUTE]: `->[${SYSTEM_IDS.RELATION_TO_ATTRIBUTE}]->[${SYSTEM_IDS.COVER_ATTRIBUTE}]->[${SYSTEM_IDS.RELATION_TO_ATTRIBUTE}]`,
  //   // [CONTENT_IDS.AVATAR_ATTRIBUTE]: `->.[${SYSTEM_IDS.NAME_ATTRIBUTE}]`,
  // };

  const {
    data: shownPropertyEntities,
    isLoading,
    isFetched,
  } = useQuery({
    placeholderData: keepPreviousData,
    queryKey: ['block-shown-properties', blockRelationId, shownPropertyRelationEntityIds],
    queryFn: async () => {
      if (shownPropertyRelationEntityIds.length === 0) {
        return [];
      }

      return await fetchEntitiesBatch(shownPropertyRelationEntityIds);
    },
  });

  const mapping = shownPropertyEntities
    ? shownPropertyEntities.reduce<Mapping>((acc, entity) => {
        const key = entity.triples.find(t => t.attributeId === SYSTEM_IDS.RELATION_TO_ATTRIBUTE)?.value.value;
        const selector = entity.triples.find(t => t.attributeId === SYSTEM_IDS.SELECTOR_ATTRIBUTE)?.value.value;
        const decodedKey = key ? GraphUrl.toEntityId(key as GraphUri) : null;

        // @TODO: Handle null selectors
        if (decodedKey === '399xP4sGWSoepxeEnp3UdR') {
          return acc;
        }

        if (decodedKey && selector) {
          acc[decodedKey] = selector;
        }

        if (decodedKey && !selector) {
          acc[decodedKey] = null;
        }

        return acc;
      }, {})
    : {
        // Default mapping if one doesn't exist
        [SYSTEM_IDS.NAME_ATTRIBUTE]: null,
      };

  return {
    isLoading,
    isFetched,
    mapping: mapping ?? {},
  };
}

export function mappingToRows(
  entities: Entity[],
  slotIds: string[],
  collectionItems: Entity[],
  spaceId: string
): Row[] {
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
          cellId: id,
          renderables: [],
          name,
        };

        const mergedTriples = getTriples({
          mergeWith: cellTriples,
          selector: triple => {
            const isRowCell = triple.entityId === id;
            const isColCell = triple.attributeId === slotId;

            // For mapped data we don't care about the correct value type
            return isRowCell && isColCell;
          },
        });

        const mergedRelations = getRelations({
          mergeWith: cellRelations,
          selector: relation => {
            const isRowCell = relation.fromEntity.id === id;
            const isColCell = relation.typeOf.id === slotId;

            return isRowCell && isColCell;
          },
        });

        cell.renderables = toRenderables({
          entityId: id,
          entityName: name,
          spaceId,
          triples: mergedTriples,
          relations: mergedRelations,
        });

        const isNameCell = slotId === SYSTEM_IDS.NAME_ATTRIBUTE;

        if (isNameCell) {
          cell.description = description;
          cell.image = Entities.cover(relationsOut) ?? Entities.avatar(relationsOut) ?? null;

          const collectionEntity = collectionItems?.find(entity =>
            entity.triples
              .find(triple => triple.attributeId === SYSTEM_IDS.RELATION_TO_ATTRIBUTE)
              ?.value.value.startsWith(`graph://${cell.cellId}`)
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

export function mappingToCell(entities: Entity[], propertyId: string, lexicon: PathSegment[], spaceId: string): Cell {
  const finalSegment = lexicon[lexicon.length - 1];

  const cell: Cell = {
    slotId: propertyId,
    // The rendered property id is what is used to select the actual rendered _data_. The slotId
    // is the id of the UI slot where the data is rendered.
    //
    // e.g., We might want to render the name of an entity in the Roles slot.
    renderedPropertyId: finalSegment.property,
    renderables: [],
    cellId: entities.find(e => e.id)?.id ?? '',
    name: null,
  };

  const renderables = entities.flatMap((entity): RenderableProperty[] => {
    const { id, triples, relationsOut } = entity;
    const cellTriples = triples.filter(triple => triple.attributeId === finalSegment.property);
    const cellRelations = relationsOut.filter(t => t.typeOf.id === finalSegment.property);
    const entityName = Entities.name(cellTriples);

    if (finalSegment.property === SYSTEM_IDS.RELATION_TO_ATTRIBUTE) {
      const imageEntityUrlValue =
        triples.find(t => t.attributeId === SYSTEM_IDS.IMAGE_URL_ATTRIBUTE)?.value.value ?? null;

      return entity.types.some(t => t.id === SYSTEM_IDS.IMAGE_TYPE)
        ? [
            {
              type: 'IMAGE',
              attributeId: propertyId,
              attributeName: null,
              entityId: id,
              spaceId,
              value: imageEntityUrlValue ?? '',
              entityName: entity.name,
              valueName: entity.name,
              relationId: '',
            },
          ]
        : [
            {
              type: 'RELATION',
              attributeId: propertyId,
              attributeName: null,
              entityId: id,
              spaceId,
              value: id,
              entityName: entity.name,
              valueName: entity.name,
              relationId: '',
            },
          ];
    }

    const mergedTriples = getTriples({
      mergeWith: cellTriples,
      selector: triple => {
        const isRowCell = triple.entityId === id;
        const isColCell = triple.attributeId === propertyId;

        // For mapped data we don't care about the correct value type
        return isRowCell && isColCell;
      },
    });

    const mergedRelations = getRelations({
      mergeWith: cellRelations,
      selector: relation => {
        const isRowCell = relation.fromEntity.id === id;
        const isColCell = relation.typeOf.id === propertyId;

        return isRowCell && isColCell;
      },
    });

    return toRenderables({
      entityId: id,
      entityName,
      spaceId,
      triples: mergedTriples,
      relations: mergedRelations,
    });
  });

  const isNameCell = propertyId === SYSTEM_IDS.NAME_ATTRIBUTE;

  if (isNameCell) {
    const relations = entities.flatMap(e => e.relationsOut);
    const maybeImage = Entities.cover(relations) ?? Entities.avatar(relations) ?? null;

    cell.image = maybeImage ?? null;
    cell.description = entities.find(e => e.description)?.description ?? null;
  }

  cell.renderables = renderables;
  cell.name = entities.find(e => e.name)?.name || null;

  return cell;
}
