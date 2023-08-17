import * as React from 'react';

import { SmallButton } from '~/design-system/button';

import { ActivitySpaceFilter } from '~/partials/profile/activity-space-filter';

interface Props {
  params: { id: string; entityId: string };
  children: React.ReactNode;
}

export const runtime = 'edge';

export default function Layout({ params, children }: Props) {
  return (
    <div>
      <div className="flex items-center gap-2 w-full pb-3 border-b border-divider">
        <SmallButton variant="secondary" icon="chevronDownSmall">
          Proposals
        </SmallButton>
        <p>in</p>
        <ActivitySpaceFilter spaceId={params.id} entityId={params.entityId} />
      </div>
      {children}
    </div>
  );
}
