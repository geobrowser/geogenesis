'use client';

import Link from 'next/link';

import { useState } from 'react';

import { Avatar } from '~/design-system/avatar';
import { CheckCircle } from '~/design-system/icons/check-circle';
import { CheckCircleSmall } from '~/design-system/icons/check-circle-small';
import { Close } from '~/design-system/icons/close';
import { Context } from '~/design-system/icons/context';
import { Warning } from '~/design-system/icons/warning';
import { Menu } from '~/design-system/menu';
import { Text } from '~/design-system/text';

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

type EditTeamMemberProps = {
  teamMember: TeamMemberType;
};

export const EditTeamMember = ({ teamMember }: EditTeamMemberProps) => {
  const [open, setOpen] = useState(false);

  const onOpenChange = () => {
    setOpen(!open);
  };

  return (
    <div className="w-full rounded-lg border border-grey-02 p-4">
      <div className="flex gap-4">
        <div className="flex-shrink-0">
          <div className="relative h-[48px] w-[48px] overflow-clip rounded">
            <Avatar size={48} square avatarUrl={teamMember.avatar} />
          </div>
        </div>
        <div className="w-full">
          <div className="border-b border-divider pb-2">
            <div className="text-body font-medium">{teamMember.name}</div>
          </div>
          <div className="mt-4 border-b border-divider pb-2">
            <div className="text-body font-medium">{teamMember.role}</div>
          </div>
        </div>
      </div>
      <div className="mt-4 flex h-[1.5625rem] items-center justify-between">
        <div>
          {teamMember.linked ? (
            <Link
              href={`/space/${teamMember.space}/${teamMember.entityId}`}
              className="flex items-center gap-2 text-metadataMedium"
            >
              <CheckCircle />
              <div>Linked</div>
            </Link>
          ) : (
            <div className="flex items-center gap-2 text-metadataMedium text-orange">
              <Warning />
              <div>Not linked</div>
            </div>
          )}
        </div>
        <div>
          <Menu
            open={open}
            onOpenChange={onOpenChange}
            align="end"
            trigger={open ? <Close color="grey-04" /> : <Context color="grey-04" />}
            className="max-w-[5.8rem] whitespace-nowrap"
          >
            <Link href={`/`} className="flex w-full cursor-pointer items-center bg-white px-3 py-2.5 hover:bg-bg">
              <Text variant="button" className="hover:!text-text">
                Something
              </Text>
            </Link>
          </Menu>
        </div>
      </div>
    </div>
  );
};
