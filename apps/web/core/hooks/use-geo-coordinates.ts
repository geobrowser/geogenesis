import { SystemIds } from '@graphprotocol/grc-20';
import { VENUE_PROPERTY, ADDRESS_PROPERTY, PLACE_TYPE } from '../system-ids';

import { useEntity } from '../database/entities';
import { EntityId } from '../io/schema';

export function useGeoCoordinates(entityId: string, spaceId: string) {
  // Get the main entity
  const { relationsOut } = useEntity({ id: entityId as EntityId, spaceId });

  // Find the Venue relation
  const venueRelation = relationsOut.find(t => t.typeOf.id === EntityId(VENUE_PROPERTY)); // TODO change to systemsIds (Venue)

  // Fetch the Place entity
  const { relationsOut: placeRelations } = useEntity({ id: venueRelation?.toEntity.id as EntityId, spaceId });

  // Find address relation
  const addressRelation = placeRelations.find(t => t.typeOf.id === EntityId(ADDRESS_PROPERTY)); // TODO change to systemsIds

  // Step 5: Fetch Address entity
  const address = useEntity({ id: addressRelation?.toEntity.id as EntityId, spaceId });

  return {
    name: address.name,
    geoLocation: address.triples.find(t => t.attributeId === SystemIds.GEO_LOCATION_PROPERTY)?.value.value,
  };
}
