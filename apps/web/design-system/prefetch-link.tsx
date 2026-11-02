'use client';

import * as React from 'react';

import Link from 'next/link';
import { useRouter } from 'next/navigation';

import { useSyncEngine } from '~/core/sync/use-sync-engine';
import { NavUtils } from '~/core/utils/utils';

type Props = React.ComponentPropsWithoutRef<typeof Link> & {
  entityId?: string;
  spaceId?: string;
  /** Prefetch when hovered. On by default. */
  hoverPrefetch?: boolean;
};

export const PrefetchLink = React.forwardRef<HTMLAnchorElement, Props>(function PrefetchLink(
  { children, entityId, spaceId, prefetch: prefetchProp = false, hoverPrefetch = true, onMouseEnter, href, ...rest },
  ref
) {
  const { hydrate } = useSyncEngine();
  const router = useRouter();

  const prefetchOnHover = (event: React.MouseEvent<HTMLAnchorElement>) => {
    const prefetchTarget =
      typeof href === 'string' ? href : entityId && spaceId ? NavUtils.toEntity(spaceId, entityId) : null;

    if (hoverPrefetch && prefetchTarget) {
      router.prefetch(prefetchTarget);
    }

    if (entityId) {
      hydrate([entityId]);
    }

    onMouseEnter?.(event);
  };

  return (
    <Link {...rest} href={href} ref={ref} prefetch={prefetchProp} onMouseEnter={prefetchOnHover}>
      {children}
    </Link>
  );
});
