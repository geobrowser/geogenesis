import { GraphUri, GraphUrl, SystemIds } from '@geoprotocol/geo-sdk';
import { keepPreviousData, useQuery } from '@tanstack/react-query';

import { useQueryEntitiesAsync } from '~/core/sync/use-store';
import { Cell, Entity, Relation, Row } from '~/core/types';
import { Entities } from '~/core/utils/entity';

import { PathSegment } from './data-selectors';

/**
 * A mapping determines which data is rendered into which UI slots
 * for a given data block.
 *
 * Reading the keys of the mapping should map to the property used
 * for the UI slot. e.g., NAME_PROPERTY -> name data.
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

const initialData = {
  [SystemIds.NAME_PROPERTY]: null,
};

export function useMapping(
  blockRelationId: string,
  shownPropertyRelationEntityIds: string[]
): {
  mapping: Mapping;
  isLoading: boolean;
  isFetched: boolean;
} {
  const findMany = useQueryEntitiesAsync();

  const {
    data: mapping,
    isLoading,
    isFetched,
  } = useQuery({
    placeholderData: keepPreviousData,
    enabled: shownPropertyRelationEntityIds.length > 0,
    initialData,
    queryKey: ['mapping-shown-properties', blockRelationId, shownPropertyRelationEntityIds],
    queryFn: async () => {
      const entities = await findMany({ where: { id: { in: shownPropertyRelationEntityIds } } });

      const mapping = entities.reduce<Mapping>((acc, entity) => {
        // @TODO(migration): This is broken in the new relations model. We no
        // longer use GraphUri to represent relations
        const key = entity.values.find(t => t.property.id === SystemIds.RELATION_TO_PROPERTY)?.value;
        const selector = entity.values.find(t => t.property.id === SystemIds.SELECTOR_PROPERTY)?.value;
        const decodedKey = key ? GraphUrl.toEntityId(key as GraphUri) : null;

        if (decodedKey && selector) {
          acc[decodedKey] = selector;
        }

        if (decodedKey && !selector) {
          acc[decodedKey] = null;
        }

        return acc;
      }, {});

      // Currently require the name attribute to be rendered for every view and every query mode. Rendering
      // the data block will break otherwise.
      if (!mapping[SystemIds.NAME_PROPERTY]) {
        mapping[SystemIds.NAME_PROPERTY] = null;
      }

      return mapping;
    },
  });

  return {
    isLoading,
    isFetched: shownPropertyRelationEntityIds.length === 0 || isFetched,
    mapping,
  };
}

export function mappingToRows(entities: Entity[], slotIds: string[], collectionRelations: Relation[]): Row[] {
  /**
   * Take each row, take each mapping, take each "slot" in the mapping
   * and map them into the Row structure.
   */
  return entities.map(({ name, id, relations, description, spaces }) => {
    const newSlots = slotIds.reduce(
      (acc, slotId) => {
        const cell: Cell = {
          slotId: slotId,
          propertyId: id,
          name,
        };

        const isNameCell = slotId === SystemIds.NAME_PROPERTY;

        if (isNameCell) {
          cell.description = description;
          cell.image = Entities.cover(relations) ?? Entities.avatar(relations) ?? null;

          const collectionRelation = collectionRelations?.find(relation => relation.toEntity.id === id);

          if (collectionRelation) {
            cell.relationId = collectionRelation.id;
            cell.collectionId = collectionRelation.fromEntity.id;
            cell.space = collectionRelation.toSpaceId ?? spaces[0];
            cell.verified = collectionRelation.verified;
          }
        }

        return {
          ...acc,
          [slotId]: cell,
        };
      },
      {} as Record<string, Cell>
    );

    // Find the position from the collection relation if it exists
    const collectionRelation = collectionRelations?.find(relation => relation.toEntity.id === id);

    return {
      entityId: id,
      columns: newSlots,
      position: collectionRelation?.position,
    };
  });
}

export function mappingToCell(entities: Entity[], propertyId: string, lexicon: PathSegment[]): Cell {
  const finalSegment: PathSegment | undefined = lexicon[lexicon.length - 1];

  const cell: Cell = {
    slotId: propertyId,
    // The rendered property id is what is used to select the actual rendered _data_. The slotId
    // is the id of the UI slot where the data is rendered.
    //
    // e.g., We might want to render the name of an entity in the Roles slot.
    renderedPropertyId: finalSegment?.property,
    propertyId: entities.find(e => e.id)?.id ?? '',
    name: null,
  };

  const isNameCell = propertyId === SystemIds.NAME_PROPERTY;

  if (isNameCell) {
    const relations = entities.flatMap(e => e.relations);
    const maybeImage = Entities.cover(relations) ?? Entities.avatar(relations) ?? null;

    cell.image = maybeImage ?? null;
    cell.description = entities.find(e => e.description)?.description ?? null;
  }

  cell.name = entities.find(e => e.name)?.name || null;

  return cell;
}
