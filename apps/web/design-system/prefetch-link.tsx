'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';

import * as React from 'react';

import { useSyncEngine } from '~/core/sync/use-sync-engine';
import { NavUtils } from '~/core/utils/utils';

type Props = React.ComponentPropsWithoutRef<typeof Link> & { entityId?: string; spaceId?: string };

export function PrefetchLink({ children, entityId, spaceId, ...rest }: Props) {
  const { hydrate } = useSyncEngine();
  // const router = useRouter();

  const prefetch = () => {
    if (spaceId && entityId) {
      // router.prefetch(NavUtils.toEntity(spaceId, entityId));
    }

    if (entityId) {
      hydrate([entityId]);
    }
  };

  return (
    <Link {...rest} prefetch={true} onMouseEnter={prefetch}>
      {children}
    </Link>
  );
}
