import * as React from 'react';

import { SmallButton } from '~/design-system/button';
import { ChevronDownSmall } from '~/design-system/icons/chevron-down-small';

import { ActivitySpaceFilter } from '~/partials/profile/activity-space-filter';

export const runtime = 'edge';

interface Props {
  params: { id: string; entityId: string };
  children: React.ReactNode;
}

export default function Layout({ params, children }: Props) {
  return (
    <div>
      <div className="flex w-full items-center gap-2 border-b border-divider pb-3">
        <SmallButton variant="secondary" icon={<ChevronDownSmall />}>
          Proposals
        </SmallButton>
        <p>in</p>
        <ActivitySpaceFilter spaceId={params.id} entityId={params.entityId} />
      </div>
      {children}
    </div>
  );
}
