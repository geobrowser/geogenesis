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

  // `min-w-0` so the chain from the navbar down to the breadcrumb's `truncate` can actually shrink.
  // A flex item defaults to `min-width: auto`, so without it every link in this chain refuses to go
  // below its content and the innermost `truncate` never gets a constrained width to truncate
  // against — the text paints out of its box and under the controls instead.
  return (
    <div className="flex min-w-0 items-center gap-2">
      {spaceId && <NavbarBreadcrumb spaceId={spaceId} entityId={entityId ?? space?.entity?.id ?? ''} />}
    </div>
  );
}
