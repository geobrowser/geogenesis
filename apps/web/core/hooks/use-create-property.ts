'use client';

import { IdUtils } from '@geoprotocol/geo-sdk';

import * as React from 'react';

import { mapPropertyType, reconstructFromStore } from '~/core/utils/property/properties';
import { DataType, SwitchableRenderableType } from '~/core/types';

import { useMutate } from '../sync/use-mutate';
import { getRelations, getValues } from '../sync/use-store';
import { useSyncEngine } from '../sync/use-sync-engine';

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
  defaultValue?: string;
}

export function useCreateProperty(spaceId: string) {
  const [nextPropertyId, setNextPropertyId] = React.useState(IdUtils.generate());
  const { storage } = useMutate();
  const { store } = useSyncEngine();

  const createProperty = React.useCallback(
    ({ name, propertyType, verified = false, space }: CreatePropertyParams): string => {
      const { baseDataType, renderableTypeId } = mapPropertyType(propertyType);
      const propertyId = nextPropertyId;

      // Use the consolidated properties.create method
      storage.properties.create({
        entityId: propertyId,
        spaceId,
        name,
        dataType: baseDataType,
        renderableTypeId,
        verified,
        toSpaceId: space,
      });

      setNextPropertyId(IdUtils.generate());
      return propertyId;
    },
    [nextPropertyId, spaceId, storage]
  );

  const addPropertyToEntity = React.useCallback(
    ({ entityId, propertyId, propertyName, entityName, defaultValue }: AddPropertyToEntityParams) => {
      // Try to resolve the property's dataType from the store
      let dataType: DataType = 'TEXT'; // Default fallback

      // First try to get the property from the store
      const storeProperty = store.getProperty(propertyId);
      if (storeProperty?.dataType) {
        dataType = storeProperty.dataType;
      } else {
        // Fall back to reconstructing from store data
        const reconstructed = reconstructFromStore(propertyId, getValues, getRelations);
        if (reconstructed?.dataType) {
          dataType = reconstructed.dataType;
        }
      }

      storage.values.set({
        spaceId,
        entity: {
          id: entityId,
          name: entityName || null,
        },
        property: {
          id: propertyId,
          name: propertyName,
          dataType: dataType,
        },
        value: defaultValue ?? '',
      });
    },
    [spaceId, storage, store]
  );

  return {
    createProperty,
    addPropertyToEntity,
    nextPropertyId,
  };
}
