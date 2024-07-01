'use client';

import * as React from 'react';

import { OmitStrict, Profile } from '~/core/types';

import { SmallButton } from '~/design-system/button';
import { Input } from '~/design-system/input';

import { MemberRow } from './space-member-row';
import { useProposeToRemoveMember } from './use-propose-to-remove-member';

interface Props {
  members: OmitStrict<Profile, 'coverUrl'>[];
  votingPluginAddress: string | null;
}

export function SpaceMembersManageDialogContent({ members, votingPluginAddress }: Props) {
  const { proposeToRemoveMember } = useProposeToRemoveMember(votingPluginAddress);

  const [query, setQuery] = React.useState('');

  const filteredMembers = React.useMemo(() => {
    return members.filter(e => e.name?.toLowerCase().includes(query.toLowerCase()));
  }, [members, query]);

  return (
    <div className="flex flex-col gap-1">
      <Input withSearchIcon onChange={e => setQuery(e.currentTarget.value)} />

      <div className="divide-y divide-grey-02">
        {filteredMembers.map(m => (
          <div key={m.id} className="flex items-center justify-between">
            <MemberRow editor={m} />
            <SmallButton onClick={() => proposeToRemoveMember(m.address)}>Propose to remove</SmallButton>
          </div>
        ))}
      </div>
    </div>
  );
}
