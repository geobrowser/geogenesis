'use client';

import { IdUtils } from '@geoprotocol/geo-sdk';

import * as React from 'react';

import { DataType, SwitchableRenderableType } from '~/core/types';
import { mapPropertyType, reconstructFromStore } from '~/core/utils/property/properties';

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

  // @TODO: When dataType resolves to RELATION, this function should not write to
  // storage.values.set(). RELATION-type properties are represented by entries in
  // the relations store, not the values store. Currently this creates phantom value
  // entries with { dataType: 'RELATION', value: '' } which are harmless at render
  // time (the UI renders RelationsGroup for RELATION properties, ignoring values)
  // but caused crashes in the publish flow until a defensive filter was added in
  // publish.ts. Gating on `if (dataType === 'RELATION') return;` here would be the
  // proper upstream fix but needs testing to ensure it doesn't break property
  // visibility or schema placeholder resolution.
  //
  // Additionally, handlePropertyTypeChange in entity-page-metadata-header.tsx does
  // not clean up existing value/relation entries on consumer entities when a property's
  // dataType changes (e.g. TEXT → RELATION leaves orphaned value entries, RELATION → TEXT
  // would leave orphaned relation entries). Those orphaned entries persist in IndexedDB
  // and surface at publish time.
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
