'use client';

import * as React from 'react';

import { useRouter } from 'next/navigation';

import { useBountiesEnabled } from '~/core/bounties/config';
import { useAccessControl } from '~/core/hooks/use-access-control';
import { NavUtils } from '~/core/utils/utils';

import { Button } from '~/design-system/button';
import { Text } from '~/design-system/text';

import { BountyBoard } from '~/partials/bounties';

type Props = {
  spaceId: string;
};

export function SpaceBountiesPageClient({ spaceId }: Props) {
  const enabled = useBountiesEnabled();
  const router = useRouter();
  const { isEditor } = useAccessControl(spaceId);

  // Soft gate (per-browser feature flag): defence in depth against a direct URL.
  React.useEffect(() => {
    if (!enabled) router.replace(`/space/${spaceId}`);
  }, [enabled, router, spaceId]);

  if (!enabled) return null;

  return (
    <div className="mt-6" data-testid="space-bounties-page">
      <React.Suspense>
        <BountyBoard
          spaceId={spaceId}
          header={
            isEditor ? (
              <div className="flex items-center justify-between gap-4">
                <Text variant="metadata" color="grey-04">
                  Editors can post bounties for curators to work on in this space.
                </Text>
                <Button variant="primary" onClick={() => router.push(NavUtils.toNewBounty(spaceId))}>
                  New bounty
                </Button>
              </div>
            ) : undefined
          }
        />
      </React.Suspense>
    </div>
  );
}
