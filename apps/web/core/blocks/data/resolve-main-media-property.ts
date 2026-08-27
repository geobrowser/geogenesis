import { SystemIds } from '@geoprotocol/geo-sdk/lite';

import { ID } from '~/core/id';
import { Property } from '~/core/types';

export type BlockMediaKind = 'IMAGE' | 'VIDEO';

export type MainMediaProperty = {
  propertyId: string;
  kind: BlockMediaKind;
  name: string | null;
};

export function isBlockMediaProperty(property: Property | null | undefined): property is Property {
  if (!property) return false;
  return property.renderableTypeStrict === 'IMAGE' || property.renderableTypeStrict === 'VIDEO';
}

export type PropertyLookup = Record<string, Property> | readonly Property[] | undefined;

export function findProperty(properties: PropertyLookup, propertyId: string): Property | undefined {
  if (!properties) return undefined;

  if (Array.isArray(properties)) {
    return properties.find(p => ID.equals(p.id, propertyId));
  }

  const byId = properties as Record<string, Property>;
  const direct = byId[propertyId];
  if (direct) return direct;

  return Object.values(byId).find(p => ID.equals(p.id, propertyId));
}

export function isBlockMediaColumn(propertyId: string, properties: PropertyLookup): boolean {
  return isBlockMediaProperty(findProperty(properties, propertyId));
}

/**
 * Gallery / list main media: first shown Image or Video property in block order
 */
export function resolveMainMediaProperty(
  shownColumnIds: readonly string[],
  properties: PropertyLookup
): MainMediaProperty | null {
  for (const columnId of shownColumnIds) {
    if (ID.equals(columnId, SystemIds.NAME_PROPERTY)) continue;

    const property = findProperty(properties, columnId);
    if (!isBlockMediaProperty(property)) continue;

    return {
      propertyId: property.id,
      kind: property.renderableTypeStrict === 'VIDEO' ? 'VIDEO' : 'IMAGE',
      name: property.name ?? null,
    };
  }

  return null;
}

export function parsePositivePixelDimension(value: string | null | undefined): number | null {
  if (value == null || value === '') return null;
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return null;
  return n;
}
