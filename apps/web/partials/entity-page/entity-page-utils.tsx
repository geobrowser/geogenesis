import { SYSTEM_IDS } from '@geogenesis/sdk';

import { RenderableProperty, Triple } from '~/core/types';

/* Entity page sort order goes Name -> Description -> Types -> Placeholders (Empty or modified) -> Triples in Schema -> Alphabetical */

/* Relation page sort order goes Relation Type -> Relation From -> Relation To -> Name -> Description -> Types -> Placeholders (Empty or modified) -> Triples in Schema -> Alphabetical -> Relation Index */

export function sortEntityPageTriples(visibleTriples: Triple[], schemaTriples: Triple[]) {
  const schemaAttributeIds = schemaTriples.map(schemaTriple => schemaTriple.attributeId);

  /* Visible triples includes both real triples and placeholder triples */
  return visibleTriples.sort((tripleA, tripleB) => {
    const { attributeId: attributeIdA, attributeName: attributeNameA } = tripleA;
    const { attributeId: attributeIdB, attributeName: attributeNameB } = tripleB;

    const isNameA = attributeIdA === SYSTEM_IDS.NAME_ATTRIBUTE;
    const isNameB = attributeIdB === SYSTEM_IDS.NAME_ATTRIBUTE;
    const isDescriptionA = attributeIdA === SYSTEM_IDS.DESCRIPTION_ATTRIBUTE;
    const isDescriptionB = attributeIdB === SYSTEM_IDS.DESCRIPTION_ATTRIBUTE;
    const isTypesA = attributeIdA === SYSTEM_IDS.TYPES_ATTRIBUTE;
    const isTypesB = attributeIdB === SYSTEM_IDS.TYPES_ATTRIBUTE;

    const aIndex = schemaAttributeIds.indexOf(attributeIdA);
    const bIndex = schemaAttributeIds.indexOf(attributeIdB);

    const aInSchema = schemaAttributeIds.includes(attributeIdA);
    const bInSchema = schemaAttributeIds.includes(attributeIdB);

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

    return (attributeNameA || '').localeCompare(attributeNameB || '');
  });
}

export function sortRenderables(renderables: RenderableProperty[], isRelationPage: boolean) {
  /* Visible triples includes both real triples and placeholder triples */
  return renderables.sort((renderableA, renderableB) => {
    // Always put an empty, placeholder triple with no attribute id at the bottom
    // of the list
    if (renderableA.attributeId === '') return 1;

    const { attributeId: attributeIdA, attributeName: attributeNameA } = renderableA;
    const { attributeId: attributeIdB, attributeName: attributeNameB } = renderableB;

    const isNameA = attributeIdA === SYSTEM_IDS.NAME_ATTRIBUTE;
    const isNameB = attributeIdB === SYSTEM_IDS.NAME_ATTRIBUTE;
    const isDescriptionA = attributeIdA === SYSTEM_IDS.DESCRIPTION_ATTRIBUTE;
    const isDescriptionB = attributeIdB === SYSTEM_IDS.DESCRIPTION_ATTRIBUTE;
    const isTypesA = attributeIdA === SYSTEM_IDS.TYPES_ATTRIBUTE;
    const isTypesB = attributeIdB === SYSTEM_IDS.TYPES_ATTRIBUTE;

    if (isRelationPage) {
      const isRelationTypeA = attributeIdA === SYSTEM_IDS.RELATION_TYPE_ATTRIBUTE;
      const isRelationTypeB = attributeIdB === SYSTEM_IDS.RELATION_TYPE_ATTRIBUTE;

      const isRelationFromA = attributeIdA === SYSTEM_IDS.RELATION_FROM_ATTRIBUTE;
      const isRelationFromB = attributeIdB === SYSTEM_IDS.RELATION_FROM_ATTRIBUTE;

      const isRelationToA = attributeIdA === SYSTEM_IDS.RELATION_TO_ATTRIBUTE;
      const isRelationToB = attributeIdB === SYSTEM_IDS.RELATION_TO_ATTRIBUTE;

      const isRelationIndexA = attributeIdA === SYSTEM_IDS.RELATION_INDEX;
      const isRelationIndexB = attributeIdB === SYSTEM_IDS.RELATION_INDEX;

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

    return (attributeNameA || '').localeCompare(attributeNameB || '');
  });
}
