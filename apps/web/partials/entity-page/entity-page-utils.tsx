import { SYSTEM_IDS } from '@geobrowser/gdk';

import { RenderableProperty, Triple } from '~/core/types';

/* Sort order goes Name -> Description -> Types -> Placeholders (Empty or modified) -> Triples in Schema -> Alphabetical */
export function sortEntityPageTriples(visibleTriples: Triple[], schemaTriples: Triple[]) {
  const schemaAttributeIds = schemaTriples.map(schemaTriple => schemaTriple.attributeId);

  /* Visible triples includes both real triples and placeholder triples */
  return visibleTriples.sort((tripleA, tripleB) => {
    const { attributeId: attributeIdA, attributeName: attributeNameA } = tripleA;
    const { attributeId: attributeIdB, attributeName: attributeNameB } = tripleB;

    const isNameA = attributeIdA === SYSTEM_IDS.NAME;
    const isNameB = attributeIdB === SYSTEM_IDS.NAME;
    const isDescriptionA = attributeIdA === SYSTEM_IDS.DESCRIPTION;
    const isDescriptionB = attributeIdB === SYSTEM_IDS.DESCRIPTION;
    const isTypesA = attributeIdA === SYSTEM_IDS.TYPES;
    const isTypesB = attributeIdB === SYSTEM_IDS.TYPES;

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

export function sortRenderables(renderables: RenderableProperty[]) {
  /* Visible triples includes both real triples and placeholder triples */
  return renderables.sort((renderableA, renderableB) => {
    const { attributeId: attributeIdA, attributeName: attributeNameA } = renderableA;
    const { attributeId: attributeIdB, attributeName: attributeNameB } = renderableB;

    const isNameA = attributeIdA === SYSTEM_IDS.NAME;
    const isNameB = attributeIdB === SYSTEM_IDS.NAME;
    const isDescriptionA = attributeIdA === SYSTEM_IDS.DESCRIPTION;
    const isDescriptionB = attributeIdB === SYSTEM_IDS.DESCRIPTION;
    const isTypesA = attributeIdA === SYSTEM_IDS.TYPES;
    const isTypesB = attributeIdB === SYSTEM_IDS.TYPES;

    if (isNameA && !isNameB) return -1;
    if (!isNameA && isNameB) return 1;

    if (isDescriptionA && !isDescriptionB) return -1;
    if (!isDescriptionA && isDescriptionB) return 1;

    if (isTypesA && !isTypesB) return -1;
    if (!isTypesA && isTypesB) return 1;

    return (attributeNameA || '').localeCompare(attributeNameB || '');
  });
}
