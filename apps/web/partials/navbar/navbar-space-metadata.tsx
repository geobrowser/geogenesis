'use client';

import { useAtomValue } from 'jotai';
import { useParams } from 'next/navigation';

import { useSpace } from '~/core/hooks/use-space';

import { NavbarBreadcrumb } from './navbar-breadcrumb';
import { navbarSpaceOverrideAtom } from '~/atoms';

export function NavbarSpaceMetadata() {
  const params = useParams();
  const override = useAtomValue(navbarSpaceOverrideAtom);

  // Short links carry no space in the URL, so fall back to the space the page resolved.
  const spaceId: string | undefined = (params?.['id'] as string | undefined) ?? override?.spaceId;
  const entityId: string | undefined = params?.['entityId'] as string | undefined;

  const { space } = useSpace(spaceId);

  return (
    <div className="flex items-center gap-2">
      {spaceId && <NavbarBreadcrumb spaceId={spaceId} entityId={entityId ?? space?.entity?.id ?? ''} />}
    </div>
  );
}
