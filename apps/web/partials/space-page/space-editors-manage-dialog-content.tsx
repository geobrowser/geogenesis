'use client';

import * as React from 'react';

import { OmitStrict, Profile, SpaceGovernanceType } from '~/core/types';

import { SmallButton } from '~/design-system/button';
import { Input } from '~/design-system/input';

import { MemberRow } from './space-member-row';
import { useAddEditor } from './use-add-editor';
import { useProposeToRemoveEditor } from './use-propose-to-remove-editor';

interface Props {
  spaceType: SpaceGovernanceType;
  members: OmitStrict<Profile, 'coverUrl'>[];
  votingPluginAddress: string | null;
}

export function SpaceEditorsManageDialogContent({ members, votingPluginAddress, spaceType }: Props) {
  // @TODO:
  // 2. Remove member in personal spaces
  const { addEditor } = useAddEditor(votingPluginAddress);
  const { proposeToRemoveEditor } = useProposeToRemoveEditor(votingPluginAddress);

  const [query, setQuery] = React.useState('');
  const [editor, setEditor] = React.useState('');

  const filteredEditors = React.useMemo(() => {
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
          <h2 className="text-metadataMedium">Add space editors</h2>
          <div className="flex items-center gap-2">
            <Input onChange={e => setEditor(e.currentTarget.value)} placeholder="0x1234...890" />
            <SmallButton
              className="min-w-max self-stretch"
              variant="secondary"
              disabled={editor === ''}
              onClick={() => addEditor(editor)}
            >
              Add editor
            </SmallButton>
          </div>
        </div>
      ) : null}

      <div className="space-y-2">
        <h2 className="text-metadataMedium">{members.length} editors</h2>

        <Input withSearchIcon onChange={e => setQuery(e.currentTarget.value)} />

        <div className="divide-y divide-grey-02">
          {filteredEditors.map(m => (
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
