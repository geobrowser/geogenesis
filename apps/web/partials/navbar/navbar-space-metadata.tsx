'use client';

import { useParams } from 'next/navigation';

import { useSpace } from '~/core/hooks/use-space';

import { NavbarBreadcrumb } from './navbar-breadcrumb';

export function NavbarSpaceMetadata() {
  const params = useParams();

  const spaceId: string | undefined = params?.['id'] as string | undefined;
  const entityId: string | undefined = params?.['entityId'] as string | undefined;

  const { space } = useSpace(spaceId);

  return (
    <div className="flex items-center gap-2">
      {spaceId && <NavbarBreadcrumb spaceId={spaceId} entityId={entityId ?? space?.entity?.id ?? ''} />}
    </div>
  );
}
