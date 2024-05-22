import { SYSTEM_IDS } from '@geogenesis/sdk';

import { Triple } from '~/core/types';

export function itemIndexValue(triple?: Triple): string | null {
  if (!triple) {
    return null;
  }

  const isIndexTriple = triple.attributeId === SYSTEM_IDS.COLLECTION_ITEM_INDEX && triple.value.type === 'TEXT';

  return isIndexTriple ? triple.value.value : null;
}

export function itemCollectionIdValue(triple?: Triple): string | null {
  if (!triple) {
    return null;
  }

  const isCollectionIdValue =
    triple.attributeId === SYSTEM_IDS.COLLECTION_ITEM_COLLECTION_ID_REFERENCE_ATTRIBUTE &&
    triple.value.type === 'ENTITY';

  return isCollectionIdValue ? triple.value.value : null;
}

export function itemEntityIdValue(triple?: Triple): string | null {
  if (!triple) {
    return null;
  }

  const isCollectionIdValue =
    triple.attributeId === SYSTEM_IDS.COLLECTION_ITEM_ENTITY_REFERENCE && triple.value.type === 'ENTITY';

  return isCollectionIdValue ? triple.value.value : null;
}
