import { SYSTEM_IDS } from '@geogenesis/ids';

import { Triple } from '~/modules/types';

export function sortEditableEntityPageTriples(visibleTriples: Triple[], schemaTriples: Triple[]) {
  /* Sort order goes Name -> Description -> Types -> Placeholders (Empty or modified) -> New triples */

  const schemaAttributeIds = schemaTriples.map(schemaTriple => schemaTriple.attributeId);

  /* Visible triples includes both real triples and */
  return visibleTriples.sort((tripleA, tripleB) => {
    const { attributeId: attributeIdA } = tripleA;
    const { attributeId: attributeIdB } = tripleB;

    const aName = attributeIdA === SYSTEM_IDS.NAME;
    const bName = attributeIdB === SYSTEM_IDS.NAME;
    const aDescription = attributeIdA === SYSTEM_IDS.DESCRIPTION;
    const bDescription = attributeIdB === SYSTEM_IDS.DESCRIPTION;
    const aTypes = attributeIdA === SYSTEM_IDS.TYPES;
    const bTypes = attributeIdB === SYSTEM_IDS.TYPES;

    const aIndex = schemaAttributeIds.indexOf(attributeIdA);
    const bIndex = schemaAttributeIds.indexOf(attributeIdB);

    const aInSchema = schemaAttributeIds.includes(attributeIdA);
    const bInSchema = schemaAttributeIds.includes(attributeIdB);

    if (aName && !bName) return -1;
    if (!aName && bName) return 1;

    if (aDescription && !bDescription) return -1;
    if (!aDescription && bDescription) return 1;

    if (aTypes && !bTypes) return -1;
    if (!aTypes && bTypes) return 1;

    if (aInSchema && !bInSchema) {
      return -1;
    }

    if (!aInSchema && bInSchema) {
      return 1;
    }

    if (aInSchema && bInSchema) {
      return aIndex - bIndex;
    }

    return 0;
  });
}
