'use client';

import * as React from 'react';

import { SmallButton } from '~/design-system/button';
import { Dialog } from '~/design-system/dialog';
import { Input } from '~/design-system/input';

import { RemoveSubspaceButton } from './metadata-header-remove-subspace-button';
import { SubspaceRow } from './subspace-row';
import { SpaceToAdd } from './types';
import { useRemoveSubspace } from './use-remove-subspace';

interface Props {
  totalCount: number;
  spaces: SpaceToAdd[];
  spaceId: string;
}

export function RemoveSubspaceDialog({ spaces, totalCount, spaceId }: Props) {
  return (
    <Dialog
      trigger={<RemoveSubspaceButton />}
      content={<Content spaces={spaces} spaceId={spaceId} />}
      header={<h1 className="text-smallTitle">{totalCount} subspaces</h1>}
    />
  );
}

interface ContentProps {
  spaces: SpaceToAdd[];
  spaceId: string;
}

function Content({ spaces, spaceId }: ContentProps) {
  const [query, setQuery] = React.useState('');
  const { proposeRemoveSubspace } = useRemoveSubspace({
    spaceId,
  });

  const filteredMembers = React.useMemo(() => {
    return spaces.filter(e => e.spaceConfig?.name?.toLowerCase().includes(query.toLowerCase()));
  }, [spaces, query]);

  const onRemoveSubspace = (subspaceAddress: string) => {
    proposeRemoveSubspace(subspaceAddress);
  };

  return (
    <div className="flex flex-col gap-1">
      <Input withSearchIcon onChange={e => setQuery(e.currentTarget.value)} />

      <div className="divide-y divide-grey-02">
        {filteredMembers.map(s => (
          <div key={s.id} className="flex items-center justify-between">
            <SubspaceRow subspace={s} />
            <SmallButton onClick={() => onRemoveSubspace(s.daoAddress)}>Propose to remove</SmallButton>
          </div>
        ))}
      </div>
    </div>
  );
}
