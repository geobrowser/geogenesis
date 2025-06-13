import { GraphUri, GraphUrl, SystemIds } from '@graphprotocol/grc-20';
import { keepPreviousData, useQuery } from '@tanstack/react-query';

import { getRelations } from '~/core/database/relations';
import { getValues } from '~/core/database/v2.values';
import { PropertyId } from '~/core/hooks/use-properties';
import { EntityId } from '~/core/io/schema';
import { useQueryEntitiesAsync } from '~/core/sync/use-store';
import { Entities } from '~/core/utils/entity';
import { toRenderables } from '~/core/utils/to-renderables';
import { Cell, Entity, PropertySchema, RenderableProperty, Row } from '~/core/v2.types';

import { makePlaceholderFromValueType } from '~/partials/blocks/table/utils';

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

export function mappingToRows(
  entities: Entity[],
  slotIds: string[],
  collectionItems: Entity[],
  spaceId: string,
  properties?: Record<PropertyId, PropertySchema>
): Row[] {
  /**
   * Take each row, take each mapping, take each "slot" in the mapping
   * and map them into the Row structure.
   */
  return entities.map(({ name, values, id, relations, description }) => {
    const newSlots = slotIds.reduce(
      (acc, slotId) => {
        const cellTriples = values.filter(value => value.property.id === slotId);
        const cellRelations = relations.filter(t => t.type.id === slotId);

        const cell: Cell = {
          slotId: slotId,
          cellId: id,
          renderables: [],
          name,
        };

        const maybeProperty = properties?.[PropertyId(slotId)];

        const placeholder = makePlaceholderFromValueType({
          propertyId: slotId,
          propertyName: maybeProperty?.name ?? null,
          entityId: id,
          spaceId,
          dataType: maybeProperty?.dataType ?? 'TEXT',
        });

        cell.renderables = toRenderables({
          entityId: id,
          entityName: name,
          spaceId,
          values: cellTriples,
          relations: cellRelations,
          placeholderRenderables: [placeholder],
        });

        const isNameCell = slotId === SystemIds.NAME_PROPERTY;

        if (isNameCell) {
          cell.description = description;
          cell.image = Entities.cover(relations) ?? Entities.avatar(relations) ?? null;

          // @TODO(migration): Migrate to new relations model
          const collectionEntity = collectionItems?.find(entity =>
            entity.values
              .find(triple => triple.property.id === SystemIds.RELATION_TO_PROPERTY)
              ?.value.startsWith(`graph://${cell.cellId}`)
          );

          // @TODO(migration): Update to new data model
          if (collectionEntity) {
            cell.collectionId = collectionEntity.id;

            const url = collectionEntity.values.find(
              value => value.property.id === SystemIds.RELATION_TO_PROPERTY
            )?.value;

            const relationId = collectionEntity.values.find(
              value => value.property.id === SystemIds.RELATION_TO_PROPERTY
            )?.entity.id;

            cell.relationId = relationId;

            if (url?.startsWith('graph://')) {
              const spaceId = GraphUrl.toSpaceId(url as GraphUri);

              if (spaceId) {
                cell.space = spaceId;

                const verifiedSourceTriple = collectionEntity.values.find(
                  value => value.property.id === SystemIds.VERIFIED_SOURCE_PROPERTY
                );

                if (verifiedSourceTriple) {
                  cell.verified = verifiedSourceTriple.value === '1';
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
  entities: Entity[],
  propertyId: string,
  lexicon: PathSegment[],
  spaceId: string,
  relationId: string
): Cell {
  const finalSegment: PathSegment | undefined = lexicon[lexicon.length - 1];
  const propertyToFilter = finalSegment ? finalSegment.property : propertyId;

  const cell: Cell = {
    slotId: propertyId,
    // The rendered property id is what is used to select the actual rendered _data_. The slotId
    // is the id of the UI slot where the data is rendered.
    //
    // e.g., We might want to render the name of an entity in the Roles slot.
    renderedPropertyId: finalSegment?.property,
    renderables: [],
    cellId: entities.find(e => e.id)?.id ?? '',
    name: null,
  };

  const renderables = entities.flatMap((entity): RenderableProperty[] => {
    const { id, values, relations } = entity;
    const cellTriples = values.filter(value => value.property.id === propertyToFilter);
    const cellRelations = relations.filter(t => t.type.id === propertyToFilter);
    const entityName = Entities.name(cellTriples);

    if (propertyToFilter === SystemIds.RELATION_TO_PROPERTY || propertyToFilter === SystemIds.RELATION_FROM_PROPERTY) {
      const imageEntityUrlValue = values.find(v => v.property.id === SystemIds.IMAGE_URL_PROPERTY)?.value ?? null;

      return entity.types.some(t => t.id === EntityId(SystemIds.IMAGE_TYPE))
        ? [
            {
              type: 'IMAGE',
              propertyId: propertyId,
              propertyName: null,
              fromEntityId: id,
              spaceId,
              value: imageEntityUrlValue ?? '',
              fromEntityName: entity.name,
              valueName: entity.name,
              relationId,
              // @TODO(migration): not sure what this should be
              relationEntityId: '',
            },
          ]
        : [
            {
              type: 'RELATION',
              propertyId: propertyId,
              propertyName: null,
              fromEntityId: id,
              spaceId,
              value: id,
              fromEntityName: entity.name,
              valueName: entity.name,
              relationId,
              // @TODO(migration): not sure what this should be
              relationEntityId: '',
            },
          ];
    }

    const mergedValues = getValues({
      mergeWith: cellTriples,
      selector: value => {
        const isRowCell = value.entity.id === id;
        const isColCell = value.property.id === propertyId;

        // For mapped data we don't care about the correct value type
        return isRowCell && isColCell;
      },
    });

    const mergedRelations = getRelations({
      mergeWith: cellRelations,
      selector: relation => {
        const isRowCell = relation.fromEntity.id === id;
        const isColCell = relation.type.id === propertyId;

        return isRowCell && isColCell;
      },
    });

    return toRenderables({
      entityId: id,
      entityName,
      spaceId,
      values: mergedValues,
      relations: mergedRelations,
    });
  });

  const isNameCell = propertyId === SystemIds.NAME_PROPERTY;

  if (isNameCell) {
    const relations = entities.flatMap(e => e.relations);
    const maybeImage = Entities.cover(relations) ?? Entities.avatar(relations) ?? null;

    cell.image = maybeImage ?? null;
    cell.description = entities.find(e => e.description)?.description ?? null;
  }

  cell.renderables = renderables;
  cell.name = entities.find(e => e.name)?.name || null;

  return cell;
}
