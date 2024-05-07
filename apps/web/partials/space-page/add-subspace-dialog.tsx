'use client';

import Link from 'next/link';

import * as React from 'react';

import { SpaceWithMetadata } from '~/core/types';
import { NavUtils } from '~/core/utils/utils';

import { Avatar } from '~/design-system/avatar';
import { SmallButton } from '~/design-system/button';
import { Dialog } from '~/design-system/dialog';
import { Input } from '~/design-system/input';

import { AddSubspaceButton } from './space-metadata-header-add-subspace-button';

export type SpaceToAdd = {
  id: string;
  spaceConfig: SpaceWithMetadata | null;
  totalMembers: number;
};

export function AddSubspaceDialog({ spaces, totalCount }: { totalCount: number; spaces: SpaceToAdd[] }) {
  return (
    <Dialog
      trigger={<AddSubspaceButton />}
      content={<Content spaces={spaces} />}
      header={<h1 className="text-smallTitle">{totalCount} spaces</h1>}
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
            <SmallButton>Propose to add</SmallButton>
          </div>
        ))}
      </div>
    </div>
  );
}

function SubspaceRow({ subspace }: { subspace: SpaceToAdd }) {
  return (
    <Link
      href={NavUtils.toSpace(subspace.id)}
      className="flex flex-1 items-center gap-2 p-2 transition-colors duration-150 hover:bg-divider"
    >
      <div className="relative h-8 w-8 overflow-hidden rounded-full">
        <Avatar size={32} avatarUrl={subspace.spaceConfig?.image} value={subspace.id} />
      </div>
      <p className="text-metadataMedium">{subspace.spaceConfig?.name ?? subspace.id}</p>
    </Link>
  );
}
