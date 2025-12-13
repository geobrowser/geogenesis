'use client';

import { isAddress } from 'viem';

import * as React from 'react';

import { OmitStrict, Profile, SpaceGovernanceType, SpaceType } from '~/core/types';

import { SmallButton } from '~/design-system/button';
import { Input } from '~/design-system/input';

import { useAddMember } from '../../core/hooks/use-add-member';
import { useRemoveMember } from '../../core/hooks/use-remove-member';
import { MemberRow } from './space-member-row';

type Member = OmitStrict<Profile, 'coverUrl'>;

interface Props {
  spaceType: SpaceGovernanceType;
  members: Member[];
  votingPluginAddress: string | null;
}

export function SpaceMembersManageDialogContent({ members, votingPluginAddress, spaceType }: Props) {
  const { addMember, status } = useAddMember({
    pluginAddress: votingPluginAddress,
    shouldRefreshOnSuccess: true,
  });

  const { setQuery, queriedMembers } = useQueriedMembers(members);

  const [memberToAdd, setMemberToAdd] = React.useState('');

  const onAddMember = () => {
    addMember(memberToAdd);
    setMemberToAdd('');
  };

  // Default to Add Member, and back to Add Member once mutation succeeds
  // and we are idle again after 3 seconds
  const addMemberText =
    status === 'idle'
      ? 'Add member'
      : status === 'pending'
        ? 'Adding member...'
        : status === 'success'
          ? 'Member added!'
          : 'Add member';

  return (
    <div className="flex flex-col gap-4">
      {spaceType === 'PERSONAL' ? (
        <div className="space-y-2">
          <h2 className="text-metadataMedium">Add space members</h2>
          <div className="flex items-center gap-2">
            <Input
              disabled={status === 'pending'}
              onChange={e => setMemberToAdd(e.currentTarget.value)}
              placeholder="0x1234...890"
            />
            <SmallButton
              className="min-w-max self-stretch"
              variant="secondary"
              disabled={!isAddress(memberToAdd) || status === 'pending'}
              onClick={onAddMember}
            >
              {addMemberText}
            </SmallButton>
          </div>
        </div>
      ) : null}

      <div className="space-y-2">
        <h2 className="text-metadataMedium">{members.length} members</h2>

        <Input withSearchIcon onChange={e => setQuery(e.currentTarget.value)} />

        <div className="divide-y divide-grey-02">
          {queriedMembers.map(m => (
            <CurrentMember key={m.id} member={m} votingPluginAddress={votingPluginAddress} spaceType={spaceType} />
          ))}
        </div>
      </div>
    </div>
  );
}

interface CurrentMemberProps {
  member: Member;
  votingPluginAddress: string | null;
  spaceType: SpaceGovernanceType;
}

function CurrentMember({ member, votingPluginAddress, spaceType }: CurrentMemberProps) {
  const { removeEditor, status } = useRemoveMember({ votingPluginAddress, spaceType });

  if (status === 'success') {
    return null;
  }

  // @TODO: Text might be different depending on the space type
  const removeMemberText = status === 'idle' ? 'Remove member' : status === 'pending' ? 'Removing...' : 'Remove member';

  return (
    <div key={member.id} className="flex items-center justify-between transition-colors duration-150 hover:bg-divider">
      <MemberRow user={member} />
      <SmallButton
        disabled={status === 'pending'}
        onClick={event => {
          event.preventDefault();
          removeEditor(member.address);
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
