'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';

import * as React from 'react';

import { useSyncEngine } from '~/core/sync/use-sync-engine';
import { NavUtils } from '~/core/utils/utils';

type Props = React.ComponentPropsWithoutRef<typeof Link> & { entityId?: string; spaceId?: string };

export function PrefetchLink({ children, entityId, spaceId, ...rest }: Props) {
  const { hydrate } = useSyncEngine();
  const router = useRouter();

  const prefetch = () => {
    if (spaceId && entityId) {
      router.prefetch(NavUtils.toEntity(spaceId, entityId));
    }

    if (entityId) {
      hydrate([entityId]);
    }
  };

  return (
    // Nextjs prefetch is for any link that's in view. We only
    // want to prefetch on hover. In the future we can prefetch
    // on intent which is better than hover.
    <Link {...rest} prefetch={false} onMouseEnter={prefetch}>
      {children}
    </Link>
  );
}
