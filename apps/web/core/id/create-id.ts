import { IdUtils } from '@geoprotocol/geo-sdk';

export function createEntityId(): string {
  return IdUtils.generate();
}

/** Converts a 32-character hex string to UUID format with hyphens. */
export function hexToUuid(hex: string): string {
  const cleanHex = hex.replace(/-/g, '').toLowerCase();

  if (cleanHex.length !== 32) {
    return hex;
  }

  return `${cleanHex.slice(0, 8)}-${cleanHex.slice(8, 12)}-${cleanHex.slice(12, 16)}-${cleanHex.slice(16, 20)}-${cleanHex.slice(20)}`;
}

/** Converts a UUID with hyphens to a 32-character hex string. */
export function uuidToHex(uuid: string): string {
  return uuid.replace(/-/g, '').toLowerCase();
}

export function createValueId({
  entityId,
  propertyId,
  spaceId,
}: {
  entityId: string;
  propertyId: string;
  spaceId: string;
}): string {
  return `${spaceId}:${entityId}:${propertyId}`;
}
