'use client';

import * as React from 'react';

import { useConfig, useWalletClient } from 'wagmi';

import { proposeRemoveSubspace } from '~/core/io/publish';
import { Services } from '~/core/services';

import { SmallButton } from '~/design-system/button';
import { Dialog } from '~/design-system/dialog';
import { Input } from '~/design-system/input';

import { RemoveSubspaceButton } from './metadata-header-remove-subspace-button';
import { SubspaceRow } from './subspace-row';
import { SpaceToAdd } from './types';

interface Props {
  totalCount: number;
  spaces: SpaceToAdd[];
  mainVotingPluginAddress: string | null;
  spacePluginAddress: string;
}

export function RemoveSubspaceDialog({ spaces, totalCount, mainVotingPluginAddress, spacePluginAddress }: Props) {
  return (
    <Dialog
      trigger={<RemoveSubspaceButton />}
      content={
        <Content
          spaces={spaces}
          mainVotingPluginAddress={mainVotingPluginAddress}
          spacePluginAddress={spacePluginAddress}
        />
      }
      header={<h1 className="text-smallTitle">{totalCount} subspaces</h1>}
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
  const config = useConfig();
  const [query, setQuery] = React.useState('');

  const filteredMembers = React.useMemo(() => {
    return spaces.filter(e => e.spaceConfig?.name?.toLowerCase().includes(query.toLowerCase()));
  }, [spaces, query]);

  const onRemoveSubspace = async (subspaceAddress: string) => {
    proposeRemoveSubspace({
      config,
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
        {filteredMembers.map(s => (
          <div key={s.id} className="flex items-center justify-between">
            <SubspaceRow subspace={s} />
            <SmallButton onClick={() => onRemoveSubspace(s.id)}>Propose to remove</SmallButton>
          </div>
        ))}
      </div>
    </div>
  );
}
