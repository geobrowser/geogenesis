import { SystemIds } from '@geoprotocol/geo-sdk/lite';

import { ID } from '~/core/id';
import type { Property } from '~/core/types';

import { DEFAULT_BLOCK_MENU_PROPERTIES } from './default-block-shown-properties';

export function mergeBlockMenuProperties(...groups: readonly (readonly Property[])[]): Property[] {
  const byId = new Map<string, Property>();

  for (const property of DEFAULT_BLOCK_MENU_PROPERTIES) {
    byId.set(ID.uuidToHex(property.id), property);
  }
  for (const group of groups) {
    for (const property of group) {
      const key = ID.uuidToHex(property.id);
      if (!byId.has(key)) {
        byId.set(key, property);
      }
    }
  }

  const ordered: Property[] = [];
  const seen = new Set<string>();

  for (const property of DEFAULT_BLOCK_MENU_PROPERTIES) {
    const key = ID.uuidToHex(property.id);
    if (seen.has(key)) continue;
    seen.add(key);
    ordered.push(byId.get(key) ?? property);
  }

  for (const group of groups) {
    for (const property of group) {
      if (ID.equals(property.id, SystemIds.NAME_PROPERTY)) continue;
      const key = ID.uuidToHex(property.id);
      if (seen.has(key)) continue;
      seen.add(key);
      ordered.push(byId.get(key) ?? property);
    }
  }

  return ordered;
}
