'use client';

import { isAddress } from 'viem';

import * as React from 'react';

import { OmitStrict, Profile, SpaceGovernanceType } from '~/core/types';

import { SmallButton } from '~/design-system/button';
import { Input } from '~/design-system/input';

import { MemberRow } from './space-member-row';
import { useAddEditor } from './use-add-editor';
import { useProposeToRemoveEditor } from './use-propose-to-remove-editor';

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
  const { proposeToRemoveEditor } = useProposeToRemoveEditor(votingPluginAddress);
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
            <div key={m.id} className="flex items-center justify-between">
              <MemberRow user={m} />
              <SmallButton onClick={() => proposeToRemoveEditor(m.address)}>Propose to remove</SmallButton>
            </div>
          ))}
        </div>
      </div>
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
