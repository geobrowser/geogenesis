import { Id, Position, SystemIds } from '@graphprotocol/grc-20';

import * as React from 'react';

import { RENDERABLE_TYPE_PROPERTY, DATA_TYPE_PROPERTY } from '~/core/constants';
import { SwitchableRenderableType } from '~/core/v2.types';
import { mapPropertyType } from '~/core/utils/property/properties';
import { useMutate } from '../sync/use-mutate';

export interface CreatePropertyParams {
  name: string;
  propertyType: SwitchableRenderableType;
  verified?: boolean;
  space?: string;
}

export interface AddPropertyToEntityParams {
  entityId: string;
  propertyId: string;
  propertyName: string;
  entityName?: string;
}

export function useCreateProperty(spaceId: string) {
  const [nextPropertyId, setNextPropertyId] = React.useState(Id.generate());
  const { storage } = useMutate();

  const createProperty = React.useCallback(
    ({ name, propertyType, verified = false, space }: CreatePropertyParams): string => {
      const { baseDataType, renderableTypeId } = mapPropertyType(propertyType);
      const propertyId = nextPropertyId;

      // Create the name value
      storage.values.set({
        entity: {
          id: propertyId,
          name: name,
        },
        property: {
          id: SystemIds.NAME_PROPERTY,
          name: 'Name',
          dataType: 'TEXT',
        },
        spaceId,
        value: name,
      });

      // Create the dataType value
      storage.values.set({
        entity: {
          id: propertyId,
          name: name,
        },
        property: {
          id: DATA_TYPE_PROPERTY,
          name: 'Data Type',
          dataType: 'TEXT',
        },
        spaceId,
        value: baseDataType,
      });

      // Create the Property type relation
      storage.relations.set({
        id: Id.generate(),
        entityId: Id.generate(),
        spaceId,
        renderableType: 'RELATION',
        verified,
        toSpaceId: space,
        position: Position.generate(),
        type: {
          id: SystemIds.TYPES_PROPERTY,
          name: 'Types',
        },
        fromEntity: {
          id: propertyId,
          name: name,
        },
        toEntity: {
          id: SystemIds.PROPERTY,
          name: 'Property',
          value: SystemIds.PROPERTY,
        },
      });

      // If there's a renderableType, create the relation
      if (renderableTypeId) {
        storage.relations.set({
          id: Id.generate(),
          entityId: Id.generate(),
          spaceId,
          renderableType: 'RELATION',
          verified: false,
          position: Position.generate(),
          type: {
            id: RENDERABLE_TYPE_PROPERTY,
            name: 'Renderable Type',
          },
          fromEntity: {
            id: propertyId,
            name: name,
          },
          toEntity: {
            id: renderableTypeId,
            name: propertyType,
            value: renderableTypeId,
          },
        });
      }

      setNextPropertyId(Id.generate());
      return propertyId;
    },
    [nextPropertyId, spaceId, storage]
  );

  const addPropertyToEntity = React.useCallback(
    ({ entityId, propertyId, propertyName, entityName }: AddPropertyToEntityParams) => {
      storage.values.set({
        spaceId,
        entity: {
          id: entityId,
          name: entityName || null,
        },
        property: {
          id: propertyId,
          name: propertyName,
          dataType: 'TEXT', // Start with TEXT, will be corrected by the system
        },
        value: '',
      });
    },
    [spaceId, storage]
  );

  return {
    createProperty,
    addPropertyToEntity,
    nextPropertyId,
  };
}