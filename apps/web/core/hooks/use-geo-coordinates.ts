'use client';

import { SystemIds } from '@geoprotocol/geo-sdk';

import { useEntity } from '../database/entities';
import { EntityId } from '../io/substream-schema';
import { useQueryEntity } from '../sync/use-store';
import { ADDRESS_PROPERTY } from '../system-ids';

export function useGeoCoordinates(entityId: string, spaceId: string, propertyType?: string) {
  // Get the main entity
  const entity = useEntity({ id: entityId as EntityId, spaceId });

  // For VENUE property or when checking if entity is a place with an address
  // Find address relation from the place entity
  const addressRelation = entity.relations.find(t => t.type.id === ADDRESS_PROPERTY);

  // Fetch Address entity - skip when propertyType is ADDRESS_PROPERTY since we won't use it
  const { entity: addressEntity } = useQueryEntity({
    id: (addressRelation?.toEntity.id || entityId) as EntityId,
    spaceId,
    enabled: propertyType !== ADDRESS_PROPERTY,
  });

  // If this is an ADDRESS property, get geo location directly from the address entity
  if (propertyType === ADDRESS_PROPERTY) {
    return {
      name: entity.name,
      geoLocation: entity.values.find(v => v.property.id === SystemIds.GEO_LOCATION_PROPERTY)?.value,
    };
  }

  if (addressRelation && addressEntity) {
    return {
      name: addressEntity.name,
      geoLocation: addressEntity.values.find(v => v.property.id === SystemIds.GEO_LOCATION_PROPERTY)?.value,
    };
  }

  // No geo location found
  return {
    name: null,
    geoLocation: null,
  };
}
