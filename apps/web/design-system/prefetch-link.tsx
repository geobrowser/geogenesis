import Link from 'next/link';

import * as React from 'react';

import { useSyncEngine } from '~/core/sync/use-sync-engine';

type Props = React.ComponentPropsWithoutRef<typeof Link> & { entityId?: string };

export function PrefetchLink({ entityId, children, ...rest }: Props) {
  const { stream } = useSyncEngine();

  return (
    <Link
      {...rest}
      prefetch={false}
      onMouseEnter={() => (entityId ? stream.emit({ type: 'hydrate', entities: [entityId] }) : undefined)}
    >
      {children}
    </Link>
  );
}
