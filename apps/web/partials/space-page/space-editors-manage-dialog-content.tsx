'use client';

import * as React from 'react';

import { OmitStrict, Profile } from '~/core/types';

import { SmallButton } from '~/design-system/button';
import { Input } from '~/design-system/input';

import { MemberRow } from './space-member-row';
import { useProposeToRemoveEditor } from './use-propose-to-remove-editor';

interface Props {
  members: OmitStrict<Profile, 'coverUrl'>[];
  votingPluginAddress: string | null;
}

export function SpaceEditorsManageDialogContent({ members, votingPluginAddress }: Props) {
  const { proposeToRemoveEditor } = useProposeToRemoveEditor(votingPluginAddress);

  const [query, setQuery] = React.useState('');

  const filteredMembers = React.useMemo(() => {
    return members.filter(e => {
      if (e.name) {
        return e.name?.toLowerCase().includes(query.toLowerCase());
      }

      return e.id.toLowerCase().includes(query.toLowerCase());
    });
  }, [members, query]);

  return (
    <div className="flex flex-col gap-1">
      <Input withSearchIcon onChange={e => setQuery(e.currentTarget.value)} />

      <div className="divide-y divide-grey-02">
        {filteredMembers.map(m => (
          <div key={m.id} className="flex items-center justify-between">
            <MemberRow user={m} />
            <SmallButton onClick={() => proposeToRemoveEditor(m.address)}>Propose to remove</SmallButton>
          </div>
        ))}
      </div>
    </div>
  );
}
