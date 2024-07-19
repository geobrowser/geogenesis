'use client';

import * as React from 'react';

import { Dialog } from '~/design-system/dialog';
import { Input } from '~/design-system/input';

import { SpaceToAdd } from './types';
import { useAddSubspace } from './use-add-subspace';

interface Props {
  spaceId: string;
  trigger: React.ReactNode;
}

// @TODO: In the future this should query for spaces as you type instead of filtering
// the entire list of spaces in the system
export function AddSubspaceDialog({ trigger, spaceId }: Props) {
  return (
    <Dialog
      trigger={trigger}
      content={<Content spaceId={spaceId} />}
      header={<h1 className="text-smallTitle">Subspaces</h1>}
    />
  );
}

interface ContentProps {
  spaceId: string;
}

function Content({ spaceId }: ContentProps) {
  const [query, setQuery] = React.useState('');

  const { proposeAddSubspace } = useAddSubspace({
    spaceId,
  });

  const onAddSubspace = (subspaceAddress: string) => {
    proposeAddSubspace(subspaceAddress);
  };

  return (
    <div className="flex flex-col gap-1">
      <Input withSearchIcon onChange={e => setQuery(e.currentTarget.value)} />
    </div>
  );
}
