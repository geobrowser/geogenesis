import * as React from 'react';
import Image from 'next/image';

import { Text } from '~/modules/design-system/text';
import { ZERO_WIDTH_SPACE } from '../../constants';
import { HistoryPanel, HistoryItem } from '../history';
import { Action as IAction } from '~/modules/types';
import { Action } from '~/modules/action';
import { Services } from '~/modules/services';
import { useQuery } from '@tanstack/react-query';

interface Props {
  spaceId: string;
  spaceName?: string;
  spaceImage: string | null;
}

export function SpaceHeader({ spaceId, spaceImage, spaceName = ZERO_WIDTH_SPACE }: Props) {
  const { network } = Services.useServices();

  const { data: proposals, isLoading } = useQuery({
    queryKey: [`space-proposals-for-space-${spaceId}`],
    queryFn: async () => network.fetchProposals(spaceId),
  });

  const isLoadingProposals = !proposals || isLoading;

  return (
    <div className="flex items-center justify-between">
      <div className="flex items-center gap-5">
        <div className="relative h-14 w-14 overflow-hidden rounded">
          <Image
            objectFit="cover"
            layout="fill"
            src={spaceImage ?? 'https://via.placeholder.com/600x600/FF00FF/FFFFFF'}
            alt={`Cover image for ${spaceName}`}
          />
        </div>
        <Text variant="mainPage" as="h1">
          {spaceName}
        </Text>
      </div>

      <HistoryPanel>
        {proposals?.map(p => (
          <HistoryItem
            key={p.id}
            changeCount={Action.getChangeCount(
              p.proposedVersions.reduce<IAction[]>((acc, version) => acc.concat(version.actions), [])
            )}
            createdAt={p.createdAt}
            createdBy={p.createdBy}
            name={p.name}
          />
        ))}
      </HistoryPanel>
    </div>
  );
}
