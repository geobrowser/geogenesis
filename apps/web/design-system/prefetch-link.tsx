'use client';

import Link from 'next/link';

import * as React from 'react';

import { useSyncEngine } from '~/core/sync/use-sync-engine';

type Props = React.ComponentPropsWithoutRef<typeof Link> & { entityId?: string };

export function PrefetchLink({ children, entityId, ...rest }: Props) {
  const { hydrate } = useSyncEngine();

  const prefetch = () => {
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
