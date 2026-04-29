'use client';

import { SystemIds } from '@geoprotocol/geo-sdk/lite';

import { useEffect, useRef } from 'react';

import { useParams, usePathname, useSearchParams } from 'next/navigation';

import { ID } from '~/core/id';
import { useEditable } from '~/core/state/editable-store';
import { useMutate } from '~/core/sync/use-mutate';

export const AutomaticModeToggle = () => {
  const params = useParams();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const { editable, setEditable } = useEditable();
  const { storage } = useMutate();
  const hasProcessedRef = useRef(false);
  const editableRef = useRef(editable);
  editableRef.current = editable;

  const shouldStartInEditMode = searchParams?.get('edit') === 'true';

  useEffect(() => {
    if (!shouldStartInEditMode) {
      hasProcessedRef.current = false;
      return;
    }

    if (hasProcessedRef.current) return;
    hasProcessedRef.current = true;

    const spaceId = params?.['id'] as string | undefined;
    const entityId = params?.['entityId'] as string | undefined;
    const newEntityName = searchParams?.get('entityName');
    const entityType = searchParams?.get('type');
    const queryStringSnapshot = searchParams?.toString() ?? '';

    let timeoutDidRun = false;

    const id = window.setTimeout(() => {
      timeoutDidRun = true;
      const newSearchParams = new URLSearchParams(queryStringSnapshot);
      newSearchParams.delete('edit');
      newSearchParams.delete('entityName');
      newSearchParams.delete('type');
      const newSearchString = newSearchParams.toString();
      const queryString = newSearchString ? `?${newSearchString}` : '';
      window.history.replaceState(null, '', `${pathname}${queryString}`);

      if (!editableRef.current) {
        setEditable(true);
      }

      if (spaceId && entityId && newEntityName) {
        storage.values.set({
          id: ID.createValueId({
            entityId,
            propertyId: SystemIds.NAME_PROPERTY,
            spaceId,
          }),
          spaceId,
          entity: {
            id: entityId,
            name: newEntityName,
          },
          property: {
            id: SystemIds.NAME_PROPERTY,
            name: 'Name',
            dataType: 'TEXT',
          },
          value: newEntityName,
        });
      }

      // Create property if type parameter is provided
      if (spaceId && entityId && entityType === 'property') {
        storage.properties.create({
          entityId,
          spaceId,
          name: newEntityName || '',
          dataType: 'TEXT',
          renderableTypeId: null,
        });
      }
    }, 500);

    return () => {
      window.clearTimeout(id);
      if (!timeoutDidRun) {
        hasProcessedRef.current = false;
      }
    };
  }, [shouldStartInEditMode, pathname, params?.['id'], params?.['entityId'], setEditable, storage]);

  return null;
};
