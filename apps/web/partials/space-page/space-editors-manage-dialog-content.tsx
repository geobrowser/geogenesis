'use client';

import { isAddress } from 'viem';

import * as React from 'react';

import { OmitStrict, Profile, SpaceGovernanceType } from '~/core/types';

import { SmallButton } from '~/design-system/button';
import { Input } from '~/design-system/input';

import { useAddEditor } from '../../core/hooks/use-add-editor';
import { useRemoveEditor } from '../../core/hooks/use-remove-editor';
import { MemberRow } from './space-member-row';

type Member = OmitStrict<Profile, 'coverUrl'>;

interface Props {
  spaceType: SpaceGovernanceType;
  members: Member[];
  votingPluginAddress: string | null;
}

export function SpaceEditorsManageDialogContent({ members, votingPluginAddress, spaceType }: Props) {
  const { addEditor, status } = useAddEditor({ pluginAddress: votingPluginAddress, shouldRefreshOnSuccess: true });
  // @TODO:
  // 2. Remove member in personal spaces
  const [editorToAdd, setEditorToAdd] = React.useState('');
  const { setQuery, queriedMembers } = useQueriedEditors(members);

  const onAddEditor = () => {
    addEditor(editorToAdd);
    setEditorToAdd('');
  };

  // Default to Add Member, and back to Add Member once mutation succeeds
  // and we are idle again after 3 seconds
  const addEditorText =
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
          <h2 className="text-metadataMedium">Add space editors</h2>
          <div className="flex items-center gap-2">
            <Input onChange={e => setEditorToAdd(e.currentTarget.value)} placeholder="0x1234...890" />
            <SmallButton
              className="min-w-max self-stretch"
              variant="secondary"
              disabled={status === 'pending' || !isAddress(editorToAdd)}
              onClick={onAddEditor}
            >
              {addEditorText}
            </SmallButton>
          </div>
        </div>
      ) : null}

      <div className="space-y-2">
        <h2 className="text-metadataMedium">{members.length} editors</h2>

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
  const { removeEditor, status } = useRemoveEditor({ votingPluginAddress, spaceType });

  if (status === 'success') {
    return null;
  }

  // @TODO: Text might be different depending on the space type
  const removeEditorText = status === 'idle' ? 'Remove editor' : status === 'pending' ? 'Removing...' : 'Remove editor';

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
        {removeEditorText}
      </SmallButton>
    </div>
  );
}

function useQueriedEditors(members: Member[]) {
  const [query, setQuery] = React.useState('');

  const queriedEditors = React.useMemo(() => {
    return members.filter(e => {
      if (e.name) {
        return e.name?.toLowerCase().includes(query.toLowerCase());
      }

      return e.id.toLowerCase().includes(query.toLowerCase());
    });
  }, [members, query]);

  return {
    setQuery,
    queriedMembers: queriedEditors,
  };
}
