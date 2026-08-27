import type { ReactNode } from 'react';

import type { SidebarCounts } from '~/core/io/fetch-sidebar-counts';

import { CheckCircleSmall } from '~/design-system/icons/check-circle-small';
import { CheckCloseSmall } from '~/design-system/icons/check-close-small';
import { EditSmall } from '~/design-system/icons/edit-small';
import { InProgressSmall } from '~/design-system/icons/in-progress-small';
import { Member } from '~/design-system/icons/member';
import { Skeleton } from '~/design-system/skeleton';

type Props = {
  counts?: SidebarCounts;
};

export function GovernanceHomeSidebar({ counts }: Props) {
  return (
    <div className="space-y-2">
      <Activity
        label="My proposals"
        activities={[
          { icon: <InProgressSmall />, label: 'Pending', count: counts?.myProposals.inProgress ?? 0 },
          { icon: <CheckCircleSmall />, label: 'Accepted', count: counts?.myProposals.accepted ?? 0 },
          { icon: <CheckCloseSmall />, label: 'Rejected', count: counts?.myProposals.rejected ?? 0 },
        ]}
      />
      <Activity
        label="Proposals I've voted on"
        activities={[
          { icon: <CheckCircleSmall />, label: 'Accepted', count: counts?.votedOn.accepted ?? 0 },
          { icon: <CheckCloseSmall />, label: 'Rejected', count: counts?.votedOn.rejected ?? 0 },
        ]}
      />
      <Activity
        label="I have accepted"
        activities={[
          { icon: <Member />, label: 'Members', count: counts?.iHaveAccepted.members ?? 0 },
          { icon: <EditSmall />, label: 'Editors', count: counts?.iHaveAccepted.editors ?? 0 },
        ]}
      />
    </div>
  );
}

export function GovernanceHomeSidebarSkeleton() {
  return (
    <div className="space-y-2">
      <SidebarCardSkeleton rows={3} />
      <SidebarCardSkeleton rows={2} />
      <SidebarCardSkeleton rows={2} />
    </div>
  );
}

function SidebarCardSkeleton({ rows }: { rows: number }) {
  return (
    <div className="space-y-2 rounded-lg border border-grey-02 p-4">
      <Skeleton className="h-3 w-24" />
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="flex items-center justify-between">
          <Skeleton className="h-4 w-28" />
          <Skeleton className="h-4 w-6" />
        </div>
      ))}
    </div>
  );
}

type ActivityProps = {
  label: string;
  activities: { icon?: ReactNode; label: string; count: number }[];
};

function Activity({ label = '', activities = [] }: ActivityProps) {
  return (
    <div className="rounded-lg border border-grey-02 p-4">
      <div className="text-breadcrumb text-grey-04">{label}</div>
      {activities.map(({ icon, label: rowLabel, count }) => (
        <div key={rowLabel} className="mt-2 flex items-center justify-between text-metadataMedium">
          <div className="inline-flex items-center gap-2">
            {icon && <div>{icon}</div>}
            <div>{rowLabel}</div>
          </div>
          <div>{count}</div>
        </div>
      ))}
    </div>
  );
}
