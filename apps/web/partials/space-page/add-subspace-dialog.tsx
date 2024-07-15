'use client';

import * as React from 'react';

import { SmallButton } from '~/design-system/button';
import { Dialog } from '~/design-system/dialog';
import { Input } from '~/design-system/input';

import { AddSubspaceButton } from './space-metadata-header-add-subspace-button';
import { SubspaceRow } from './subspace-row';
import { SpaceToAdd } from './types';
import { useAddSubspace } from './use-add-subspace';

interface Props {
  totalCount: number;
  spaces: SpaceToAdd[];
  spaceId: string;
}

// @TODO: In the future this should query for spaces as you type instead of filtering
// the entire list of spaces in the system
export function AddSubspaceDialog({ spaces, totalCount, spaceId }: Props) {
  return (
    <Dialog
      trigger={<AddSubspaceButton />}
      content={<Content spaces={spaces} spaceId={spaceId} />}
      header={<h1 className="text-smallTitle">{totalCount} spaces</h1>}
    />
  );
}

interface ContentProps {
  spaces: SpaceToAdd[];
  spaceId: string;
}

function Content({ spaces, spaceId }: ContentProps) {
  const [query, setQuery] = React.useState('');

  const { proposeAddSubspace } = useAddSubspace({
    spaceId,
  });

  const filteredSpaces = React.useMemo(() => {
    return spaces.filter(e => e.spaceConfig?.name?.toLowerCase().includes(query.toLowerCase()));
  }, [spaces, query]);

  const onAddSubspace = async (subspaceAddress: string) => {
    proposeAddSubspace(subspaceAddress);
  };

  return (
    <div className="flex flex-col gap-1">
      <Input withSearchIcon onChange={e => setQuery(e.currentTarget.value)} />

      <div className="divide-y divide-grey-02">
        {filteredSpaces.map(s => (
          <div key={s.id} className="flex items-center justify-between">
            <SubspaceRow subspace={s} />
            <SmallButton onClick={() => onAddSubspace(s.daoAddress)}>Propose to add</SmallButton>
          </div>
        ))}
      </div>
    </div>
  );
}
