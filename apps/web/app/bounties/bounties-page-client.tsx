'use client';

import * as React from 'react';

import { useRouter } from 'next/navigation';

import { useBountiesEnabled } from '~/core/bounties/config';

import { Text } from '~/design-system/text';

import { BountyBoard } from '~/partials/bounties';
import { NewBountyButton } from '~/partials/bounties/new-bounty-button';

export function BountiesPageClient() {
  const enabled = useBountiesEnabled();
  const router = useRouter();

  // Soft gate (per-browser feature flag): defence in depth against a direct URL.
  React.useEffect(() => {
    if (!enabled) router.replace('/root');
  }, [enabled, router]);

  if (!enabled) return null;

  return (
    <main className="mx-auto flex w-full max-w-[1200px] flex-col gap-6" data-testid="bounties-page">
      <React.Suspense>
        <BountyBoard
          header={
            <header className="flex flex-col gap-2">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <Text as="h1" variant="largeTitle">
                  Bounties
                </Text>
                <NewBountyButton />
              </div>
              <Text as="p" color="grey-04">
                Paid curation work from spaces in the curator program. Express interest on a bounty to apply, then
                submit proposals in its space to earn points.
              </Text>
            </header>
          }
        />
      </React.Suspense>
    </main>
  );
}
