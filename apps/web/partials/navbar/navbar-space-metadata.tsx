'use client';

import { useParams } from 'next/navigation';

import { useSpace } from '~/core/hooks/use-space';

import { ChevronRight } from '~/design-system/icons/chevron-right';

import { NavbarBreadcrumb } from './navbar-breadcrumb';
import { NavbarLinkMenu } from './navbar-link-menu';

export function NavbarSpaceMetadata() {
  const params = useParams();

  const spaceId: string | undefined = params?.['id'] as string | undefined;
  const entityId: string | undefined = params?.['entityId'] as string | undefined;


  const { space } = useSpace(spaceId ?? '');

  return (
    <div className="flex items-center gap-2">
      <NavbarLinkMenu />
      {spaceId && (
        <>
          <ChevronRight color="grey-03" />
          <NavbarBreadcrumb spaceId={spaceId} entityId={entityId ?? (space?.entity?.id as EntityId) ?? ''} />
        </>
      )}
    </div>
  );
}
