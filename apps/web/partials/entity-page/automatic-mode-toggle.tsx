'use client';

import { SYSTEM_IDS } from '@graphprotocol/grc-20';
import { useParams, usePathname, useSearchParams } from 'next/navigation';

import { useEffect } from 'react';

import { useWriteOps } from '~/core/database/write';
import { useEditable } from '~/core/state/editable-store';

export const AutomaticModeToggle = () => {
  const params = useParams();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const { editable, setEditable } = useEditable();
  const { upsert } = useWriteOps();

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
        upsert(
          {
            entityId,
            attributeId: SYSTEM_IDS.NAME_ATTRIBUTE,
            entityName: newEntityName,
            attributeName: 'Name',
            value: {
              type: 'TEXT',
              value: newEntityName,
            },
          },
          spaceId
        );
      }
    }, 500);
  }, [editable, params, pathname, searchParams, setEditable, upsert]);

  return null;
};
