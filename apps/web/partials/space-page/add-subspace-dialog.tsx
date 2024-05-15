'use client';

import * as React from 'react';

import { useWalletClient } from 'wagmi';

import { proposeAddSubspace } from '~/core/io/publish';
import { Services } from '~/core/services';

import { SmallButton } from '~/design-system/button';
import { Dialog } from '~/design-system/dialog';
import { Input } from '~/design-system/input';

import { AddSubspaceButton } from './space-metadata-header-add-subspace-button';
import { SubspaceRow } from './subspace-row';
import { SpaceToAdd } from './types';

interface Props {
  totalCount: number;
  spaces: SpaceToAdd[];
  mainVotingPluginAddress: string | null;
  spacePluginAddress: string;
}

// @TODO: In the future this should query for spaces as you type instead of filtering
// the entire list of spaces in the system
export function AddSubspaceDialog({ spaces, totalCount, mainVotingPluginAddress, spacePluginAddress }: Props) {
  return (
    <Dialog
      trigger={<AddSubspaceButton />}
      content={
        <Content
          spaces={spaces}
          mainVotingPluginAddress={mainVotingPluginAddress}
          spacePluginAddress={spacePluginAddress}
        />
      }
      header={<h1 className="text-smallTitle">{totalCount} spaces</h1>}
    />
  );
}

interface ContentProps {
  spaces: SpaceToAdd[];
  mainVotingPluginAddress: string | null;
  spacePluginAddress: string;
}

function Content({ spaces, mainVotingPluginAddress, spacePluginAddress }: ContentProps) {
  const { storageClient } = Services.useServices();
  const { data: wallet } = useWalletClient();
  const [query, setQuery] = React.useState('');

  const filteredSpaces = React.useMemo(() => {
    return spaces.filter(e => e.spaceConfig?.name?.toLowerCase().includes(query.toLowerCase()));
  }, [spaces, query]);

  const onAddSubspace = async (subspaceAddress: string) => {
    proposeAddSubspace({
      wallet,
      storageClient,
      spacePluginAddress,
      mainVotingPluginAddress,
      subspaceAddress,
    });
  };

  return (
    <div className="flex flex-col gap-1">
      <Input withSearchIcon onChange={e => setQuery(e.currentTarget.value)} />

      <div className="divide-y divide-grey-02">
        {filteredSpaces.map(s => (
          <div key={s.id} className="flex items-center justify-between">
            <SubspaceRow subspace={s} />
            <SmallButton onClick={() => onAddSubspace(s.id)}>Propose to add</SmallButton>
          </div>
        ))}
      </div>
    </div>
  );
}
