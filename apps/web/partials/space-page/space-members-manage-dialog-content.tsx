'use client';

import * as React from 'react';

import { OmitStrict, Profile, SpaceGovernanceType, SpaceType } from '~/core/types';

import { Button, SmallButton } from '~/design-system/button';
import { Input } from '~/design-system/input';

import { MemberRow } from './space-member-row';
import { useAddMember } from './use-add-member';
import { useProposeToRemoveMember } from './use-propose-to-remove-member';

interface Props {
  spaceType: SpaceGovernanceType;
  members: OmitStrict<Profile, 'coverUrl'>[];
  votingPluginAddress: string | null;
}

export function SpaceMembersManageDialogContent({ members, votingPluginAddress, spaceType }: Props) {
  // @TODO:
  // 2. Remove member in personal spaces
  const { addMember } = useAddMember(votingPluginAddress);
  const { proposeToRemoveMember } = useProposeToRemoveMember(votingPluginAddress);

  const [query, setQuery] = React.useState('');
  const [member, setMember] = React.useState('');

  const filteredMembers = React.useMemo(() => {
    return members.filter(e => {
      if (e.name) {
        return e.name?.toLowerCase().includes(query.toLowerCase());
      }

      return e.id.toLowerCase().includes(query.toLowerCase());
    });
  }, [members, query]);

  return (
    <div className="flex flex-col gap-4">
      {spaceType === 'PERSONAL' ? (
        <div className="space-y-2">
          <h2 className="text-metadataMedium">Add space members</h2>
          <div className="flex items-center gap-2">
            <Input onChange={e => setMember(e.currentTarget.value)} placeholder="0x1234...890" />
            <SmallButton
              className="min-w-max self-stretch"
              variant="secondary"
              disabled={member === ''}
              onClick={() => addMember(member)}
            >
              Add member
            </SmallButton>
          </div>
        </div>
      ) : null}

      <div className="space-y-2">
        <h2 className="text-metadataMedium">{members.length} members</h2>

        <Input withSearchIcon onChange={e => setQuery(e.currentTarget.value)} />

        <div className="divide-y divide-grey-02">
          {filteredMembers.map(m => (
            <div key={m.id} className="flex items-center justify-between">
              <MemberRow user={m} />
              <SmallButton onClick={() => proposeToRemoveMember(m.address)}>Propose to remove</SmallButton>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
