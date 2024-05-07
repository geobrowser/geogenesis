'use client';

import * as React from 'react';

import { SmallButton } from '~/design-system/button';
import { Dialog } from '~/design-system/dialog';
import { Input } from '~/design-system/input';

import { RemoveSubspaceButton } from './metadata-header-remove-subspace-button';
import { SubspaceRow } from './subspace-row';
import { SpaceToAdd } from './types';

export function RemoveSubspaceDialog({ spaces, totalCount }: { totalCount: number; spaces: SpaceToAdd[] }) {
  return (
    <Dialog
      trigger={<RemoveSubspaceButton />}
      content={<Content spaces={spaces} />}
      header={<h1 className="text-smallTitle">{totalCount} subspaces</h1>}
    />
  );
}

function Content({ spaces }: { spaces: SpaceToAdd[] }) {
  const [query, setQuery] = React.useState('');

  const filteredMembers = React.useMemo(() => {
    return spaces.filter(e => e.spaceConfig?.name?.toLowerCase().includes(query.toLowerCase()));
  }, [spaces, query]);

  return (
    <div className="flex flex-col gap-1">
      <Input withSearchIcon onChange={e => setQuery(e.currentTarget.value)} />

      <div className="divide-y divide-grey-02">
        {filteredMembers.map(s => (
          <div key={s.id} className="flex items-center justify-between">
            <SubspaceRow subspace={s} />
            <SmallButton>Propose to remove</SmallButton>
          </div>
        ))}
      </div>
    </div>
  );
}
