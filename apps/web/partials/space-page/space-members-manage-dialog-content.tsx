'use client';

import * as React from 'react';

import { OmitStrict, Profile } from '~/core/types';

import { SmallButton } from '~/design-system/button';
import { Input } from '~/design-system/input';

import { useProposeRemoveMember } from '../../core/hooks/use-propose-remove-member';
import { MemberRow } from './space-member-row';

type Member = OmitStrict<Profile, 'coverUrl'>;

interface Props {
  spaceId: string;
  members: Member[];
}

export function SpaceMembersManageDialogContent({ spaceId, members }: Props) {
  const { setQuery, queriedMembers } = useQueriedMembers(members);

  return (
    <div className="flex flex-col gap-4">
      <div className="space-y-2">
        <h2 className="text-metadataMedium">{members.length} members</h2>

        <Input withSearchIcon onChange={e => setQuery(e.currentTarget.value)} />

        <div className="divide-y divide-grey-02">
          {queriedMembers.map(m => (
            <CurrentMember key={m.id} member={m} spaceId={spaceId} />
          ))}
        </div>
      </div>
    </div>
  );
}

interface CurrentMemberProps {
  member: Member;
  spaceId: string;
}

function CurrentMember({ member, spaceId }: CurrentMemberProps) {
  const { proposeRemoveMember, status } = useProposeRemoveMember({ spaceId });

  if (status === 'success') {
    return null;
  }

  const removeMemberText =
    status === 'idle' ? 'Remove member' : status === 'pending' ? 'Proposing removal...' : 'Remove member';

  return (
    <div key={member.id} className="flex items-center justify-between transition-colors duration-150 hover:bg-divider">
      <MemberRow user={member} />
      <SmallButton
        disabled={status === 'pending'}
        onClick={event => {
          event.preventDefault();
          proposeRemoveMember({ targetMemberSpaceId: member.spaceId });
        }}
      >
        {removeMemberText}
      </SmallButton>
    </div>
  );
}

function useQueriedMembers(members: Member[]) {
  const [query, setQuery] = React.useState('');

  const queriedMembers = React.useMemo(() => {
    return members.filter(e => {
      if (e.name) {
        return e.name?.toLowerCase().includes(query.toLowerCase());
      }

      return e.id.toLowerCase().includes(query.toLowerCase());
    });
  }, [members, query]);

  return {
    setQuery,
    queriedMembers,
  };
}
