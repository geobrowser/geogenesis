'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

import * as React from 'react';

import { useAccessControl } from '~/core/hooks/use-access-control';
import { useEditable } from '~/core/hooks/use-editable';
import { ID } from '~/core/id';
import { NavUtils } from '~/core/utils/utils';

import { Button } from '~/design-system/button';
import { Spacer } from '~/design-system/spacer';
import { TabLink } from '~/design-system/tab-link';

interface Props {
  spaceId: string;
}

const SpaceActions = ({ spaceId }: Props) => {
  const { isEditor, isAdmin, isEditorController } = useAccessControl(spaceId);
  const { editable } = useEditable();

  return (
    <div className="flex items-center">
      {(isEditor || isAdmin || isEditorController) && editable && (
        <div className="flex w-full items-center justify-between">
          {(isEditorController || isAdmin) && (
            <Link href={NavUtils.toAdmin(spaceId)}>
              <Button variant="secondary">Access control</Button>
            </Link>
          )}
          {isAdmin && isEditor && <Spacer width={8} />}
          {isEditor && (
            <>
              <Spacer width={12} />
              <Link href={NavUtils.toEntity(spaceId, ID.createEntityId())}>
                <Button icon="create">New entity</Button>
              </Link>
            </>
          )}
        </div>
      )}
    </div>
  );
};

export const SpaceNavbar = ({ spaceId }: Props) => {
  const path = usePathname();

  const tabEntitiesSelected = !path?.includes('/triples');
  const tabTriplesSelected = path?.includes('/triples');

  const tabs = [
    {
      name: 'Entities',
      href: `/space/${spaceId}/entities`,
      selected: Boolean(tabEntitiesSelected),
    },
    {
      name: 'Triples',
      href: `/space/${spaceId}/triples`,
      selected: Boolean(tabTriplesSelected),
    },
  ];

  return (
    <div className="flex h-9 w-full items-center justify-between">
      <div className="flex items-center gap-4">
        {tabs.map(tab => (
          <TabLink key={tab.name} href={tab.href} isActive={tab.selected}>
            {tab.name}
          </TabLink>
        ))}
      </div>
      <SpaceActions spaceId={spaceId} />
    </div>
  );
};
