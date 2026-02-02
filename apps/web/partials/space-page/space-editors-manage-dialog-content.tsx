'use client';

import * as React from 'react';

import { OmitStrict, Profile } from '~/core/types';

import { SmallButton } from '~/design-system/button';
import { Input } from '~/design-system/input';

import { useProposeRemoveEditor } from '../../core/hooks/use-propose-remove-editor';
import { MemberRow } from './space-member-row';

type Editor = OmitStrict<Profile, 'coverUrl'>;

interface Props {
  spaceId: string;
  editors: Editor[];
}

export function SpaceEditorsManageDialogContent({ spaceId, editors }: Props) {
  const { setQuery, queriedEditors } = useQueriedEditors(editors);

  return (
    <div className="flex flex-col gap-4">
      <div className="space-y-2">
        <h2 className="text-metadataMedium">{editors.length} editors</h2>

        <Input withSearchIcon onChange={e => setQuery(e.currentTarget.value)} />

        <div className="divide-y divide-grey-02">
          {queriedEditors.map(e => (
            <CurrentEditor key={e.id} editor={e} spaceId={spaceId} />
          ))}
        </div>
      </div>
    </div>
  );
}

interface CurrentEditorProps {
  editor: Editor;
  spaceId: string;
}

function CurrentEditor({ editor, spaceId }: CurrentEditorProps) {
  const { proposeRemoveEditor, status } = useProposeRemoveEditor({ spaceId });

  if (status === 'success') {
    return null;
  }

  const removeEditorText =
    status === 'idle' ? 'Remove editor' : status === 'pending' ? 'Proposing removal...' : 'Remove editor';

  return (
    <div key={editor.id} className="flex items-center justify-between transition-colors duration-150 hover:bg-divider">
      <MemberRow user={editor} />
      <SmallButton
        disabled={status === 'pending'}
        onClick={event => {
          event.preventDefault();
          proposeRemoveEditor({ targetEditorSpaceId: editor.spaceId });
        }}
      >
        {removeEditorText}
      </SmallButton>
    </div>
  );
}

function useQueriedEditors(editors: Editor[]) {
  const [query, setQuery] = React.useState('');

  const queriedEditors = React.useMemo(() => {
    return editors.filter(e => {
      if (e.name) {
        return e.name?.toLowerCase().includes(query.toLowerCase());
      }

      return e.id.toLowerCase().includes(query.toLowerCase());
    });
  }, [editors, query]);

  return {
    setQuery,
    queriedEditors,
  };
}
