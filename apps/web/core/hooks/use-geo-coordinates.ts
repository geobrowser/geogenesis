import { SystemIds } from '@graphprotocol/grc-20';

import { useEntity } from '../database/entities';
import { EntityId } from '../io/schema';
import { ADDRESS_PROPERTY, VENUE_PROPERTY } from '../system-ids';

export function useGeoCoordinates(entityId: string, spaceId: string, propertyType?: string) {
  // Get the main entity
  const entity = useEntity({ id: entityId as EntityId, spaceId });

  // If this is an ADDRESS property, get geo location directly from the address entity
  if (propertyType === ADDRESS_PROPERTY) {
    return {
      name: entity.name,
      geoLocation: entity.values.find(v => v.property.id === SystemIds.GEO_LOCATION_PROPERTY)?.value,
    };
  }

  // For VENUE property or when checking if entity is a place with an address
  // Find address relation from the place entity
  const addressRelation = entity.relations.find(t => t.type.id === ADDRESS_PROPERTY);
  
  if (addressRelation) {
    // Fetch Address entity
    const address = useEntity({ id: addressRelation.toEntity.id as EntityId, spaceId });
    
    return {
      name: address.name,
      geoLocation: address.values.find(v => v.property.id === SystemIds.GEO_LOCATION_PROPERTY)?.value,
    };
  }

  // No geo location found
  return {
    name: null,
    geoLocation: null,
  };
}
