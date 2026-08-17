'use client';

import * as React from 'react';

import { useRouter } from 'next/navigation';

import { useBountiesEnabled } from '~/core/bounties/config';

import { BountyBoard } from '~/partials/bounties';

type Props = {
  spaceId: string;
};

export function SpaceBountiesPageClient({ spaceId }: Props) {
  const enabled = useBountiesEnabled();
  const router = useRouter();

  // Soft gate (per-browser feature flag): defence in depth against a direct URL.
  React.useEffect(() => {
    if (!enabled) router.replace(`/space/${spaceId}`);
  }, [enabled, router, spaceId]);

  if (!enabled) return null;

  return (
    <div className="mt-6" data-testid="space-bounties-page">
      <React.Suspense>
        <BountyBoard spaceId={spaceId} />
      </React.Suspense>
    </div>
  );
}
