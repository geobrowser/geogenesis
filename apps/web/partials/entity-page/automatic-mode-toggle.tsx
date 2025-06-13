'use client';

import { SystemIds } from '@graphprotocol/grc-20';
import { useParams, usePathname, useSearchParams } from 'next/navigation';

import { useEffect } from 'react';

import { ID } from '~/core/id';
import { useEditable } from '~/core/state/editable-store';
import { useMutate } from '~/core/sync/use-mutate';

export const AutomaticModeToggle = () => {
  const params = useParams();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const { editable, setEditable } = useEditable();
  const { storage } = useMutate();

  useEffect(() => {
    const shouldStartInEditMode = searchParams?.get('edit') === 'true';
    const newEntityName = searchParams?.get('entityName');

    if (editable || !shouldStartInEditMode) return;

    const spaceId = params?.['id'] as string | undefined;
    const entityId = params?.['entityId'] as string | undefined;

    setTimeout(() => {
      const newSearchParams = new URLSearchParams(searchParams?.toString());
      newSearchParams.delete('edit');
      newSearchParams.delete('entityName');
      const newSearchString = newSearchParams.toString();
      const queryString = newSearchString ? `?${newSearchString}` : '';
      window.history.replaceState(null, '', `${pathname}${queryString}`);
      setEditable(true);

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
    }, 500);
  }, [editable, params, pathname, searchParams, setEditable, storage]);

  return null;
};
