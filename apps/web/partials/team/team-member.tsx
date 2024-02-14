'use client';

import Link from 'next/link';

import { Avatar } from '~/design-system/avatar';
import { CheckCircleSmall } from '~/design-system/icons/check-circle-small';

import type { TeamMember as TeamMemberType } from '~/app/space/[id]/team/page';

type TeamMemberProps = {
  teamMember: TeamMemberType;
};

export const TeamMember = ({ teamMember }: TeamMemberProps) => {
  return (
    <div className="flex items-center gap-4">
      <div className="flex-shrink-0">
        <div className="relative h-[64px] w-[64px] overflow-clip rounded">
          <Avatar size={64} square avatarUrl={teamMember.avatar} />
        </div>
      </div>
      <div className="w-full">
        <div className="flex items-center gap-2">
          {teamMember.linked ? (
            <>
              <Link href={`/space/${teamMember.space}/${teamMember.entityId}`} className="text-tableCell font-medium">
                {teamMember.name}
              </Link>
              <CheckCircleSmall />
            </>
          ) : (
            <div className="text-tableCell font-medium">{teamMember.name}</div>
          )}
        </div>
        <div className="mt-1">
          <div className="text-tableCell font-medium text-grey-04">{teamMember.role}</div>
        </div>
      </div>
    </div>
  );
};
