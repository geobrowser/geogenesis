'use client';

import * as React from 'react';

import { useRouter } from 'next/navigation';

import { DebatesBrowseFeed } from '~/core/debates/browse/debate-feed';
import { useDebatesEnabled } from '~/core/state/feature-flags';

type DebatesPageClientProps = {
  spaceId: string;
};

export function DebatesPageClient({ spaceId }: DebatesPageClientProps) {
  const isDebatesEnabled = useDebatesEnabled();
  const router = useRouter();

  React.useEffect(() => {
    if (!isDebatesEnabled) {
      router.replace(`/space/${spaceId}`);
    }
  }, [isDebatesEnabled, router, spaceId]);

  if (!isDebatesEnabled) return null;

  return <DebatesBrowseFeed spaceId={spaceId} />;
}
