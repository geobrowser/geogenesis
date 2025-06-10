import { SystemIds } from '@graphprotocol/grc-20';

import { RenderableProperty, Value } from '~/core/v2.types';

/* Entity page sort order goes Name -> Description -> Types -> Placeholders (Empty or modified) -> Triples in Schema -> Alphabetical */

/* Relation page sort order goes Relation Type -> Relation From -> Relation To -> Name -> Description -> Types -> Placeholders (Empty or modified) -> Triples in Schema -> Alphabetical -> Relation Index */

export function sortEntityPageTriples(visibleValues: Value[], schemaValues: Value[]) {
  const schemaPropertyIds = schemaValues.map(schemaValue => schemaValue.property.id);

  /* Visible triples includes both real triples and placeholder triples */
  return visibleValues.sort((tripleA, tripleB) => {
    const {
      property: { id: propertyIdA, name: propertyNameA },
    } = tripleA;
    const {
      property: { id: propertyIdB, name: propertyNameB },
    } = tripleB;

    const isNameA = propertyIdA === SystemIds.NAME_ATTRIBUTE;
    const isNameB = propertyIdB === SystemIds.NAME_ATTRIBUTE;
    const isDescriptionA = propertyIdA === SystemIds.DESCRIPTION_ATTRIBUTE;
    const isDescriptionB = propertyIdB === SystemIds.DESCRIPTION_ATTRIBUTE;
    const isTypesA = propertyIdA === SystemIds.TYPES_ATTRIBUTE;
    const isTypesB = propertyIdB === SystemIds.TYPES_ATTRIBUTE;

    const aIndex = schemaPropertyIds.indexOf(propertyIdA);
    const bIndex = schemaPropertyIds.indexOf(propertyIdB);

    const aInSchema = schemaPropertyIds.includes(propertyIdA);
    const bInSchema = schemaPropertyIds.includes(propertyIdB);

    if (isNameA && !isNameB) return -1;
    if (!isNameA && isNameB) return 1;

    if (isDescriptionA && !isDescriptionB) return -1;
    if (!isDescriptionA && isDescriptionB) return 1;

    if (isTypesA && !isTypesB) return -1;
    if (!isTypesA && isTypesB) return 1;

    if (aInSchema && !bInSchema) {
      return -1;
    }

    if (!aInSchema && bInSchema) {
      return 1;
    }

    if (aInSchema && bInSchema) {
      return aIndex - bIndex;
    }

    return (propertyNameA || '').localeCompare(propertyNameB || '');
  });
}

export function sortRenderables(renderables: RenderableProperty[], isRelationPage?: boolean) {
  /* Visible triples includes both real triples and placeholder triples */
  return renderables.sort((renderableA, renderableB) => {
    // Always put an empty, placeholder triple with no attribute id at the bottom
    // of the list
    if (renderableA.propertyId === '') return 1;

    const { propertyId: propertyIdA, propertyName: propertyNameA } = renderableA;
    const { propertyId: propertyIdB, propertyName: propertyNameB } = renderableB;

    const isNameA = propertyIdA === SystemIds.NAME_ATTRIBUTE;
    const isNameB = propertyIdB === SystemIds.NAME_ATTRIBUTE;
    const isDescriptionA = propertyIdA === SystemIds.DESCRIPTION_ATTRIBUTE;
    const isDescriptionB = propertyIdB === SystemIds.DESCRIPTION_ATTRIBUTE;
    const isTypesA = propertyIdA === SystemIds.TYPES_ATTRIBUTE;
    const isTypesB = propertyIdB === SystemIds.TYPES_ATTRIBUTE;

    if (isRelationPage) {
      const isRelationTypeA = propertyIdA === SystemIds.RELATION_TYPE_ATTRIBUTE;
      const isRelationTypeB = propertyIdB === SystemIds.RELATION_TYPE_ATTRIBUTE;

      const isRelationFromA = propertyIdA === SystemIds.RELATION_FROM_ATTRIBUTE;
      const isRelationFromB = propertyIdB === SystemIds.RELATION_FROM_ATTRIBUTE;

      const isRelationToA = propertyIdA === SystemIds.RELATION_TO_ATTRIBUTE;
      const isRelationToB = propertyIdB === SystemIds.RELATION_TO_ATTRIBUTE;

      const isRelationIndexA = propertyIdA === SystemIds.RELATION_INDEX;
      const isRelationIndexB = propertyIdB === SystemIds.RELATION_INDEX;

      if (isRelationTypeA && !isRelationTypeB) return -1;
      if (!isRelationTypeA && isRelationTypeB) return 1;

      if (isRelationFromA && !isRelationFromB) return -1;
      if (!isRelationFromA && isRelationFromB) return 1;

      if (isRelationToA && !isRelationToB) return -1;
      if (!isRelationToA && isRelationToB) return 1;

      if (isRelationIndexA && !isRelationIndexB) return 1;
    }

    if (isNameA && !isNameB) return -1;
    if (!isNameA && isNameB) return 1;

    if (isDescriptionA && !isDescriptionB) return -1;
    if (!isDescriptionA && isDescriptionB) return 1;

    if (isTypesA && !isTypesB) return -1;
    if (!isTypesA && isTypesB) return 1;

    return (propertyNameA || '').localeCompare(propertyNameB || '');
  });
}
